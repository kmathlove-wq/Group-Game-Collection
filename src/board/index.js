// 게임 선택 화면(/)의 개선사항·댓글 게시판 API.
// 누구나 글·답글을 쓰고 내가 쓴 글은 고치거나 지울 수 있으며, 관리자(숨은 Ctrl 신호 + 비밀번호)는 삭제·고정·관리자 글쓰기를 한다.
// 비밀번호 원문은 어디에도 두지 않는다(저장소가 공개라서): bcrypt로 섞은 값만 두고 서버에서만 비교한다.
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { hasBadWord } = require('../../lib/bad-words');
const { NAME_MAX_LENGTH, TEXT_MAX_LENGTH } = require('../../lib/board-store');
const { TEXT_MAX_LENGTH: REQUEST_MAX_LENGTH } = require('../../lib/game-request-store');

// 잠긴 닉네임 비밀번호와 같은 비밀번호. 12단계 해시는 무료 서버에서 너무 느려 '확인'을 여러 번 누르게 돼서 10단계로 바꿈(2026-10-28).
const { DEFAULT_HASH: DEFAULT_ADMIN_HASH, isLockedName } = require('../../lib/name-lock');
const POST_COOLDOWN_MS = 20_000; // 같은 사람(IP)은 20초에 한 번 쓰기
const ADMIN_SESSION_MS = 3 * 60 * 60 * 1000; // 관리자 열쇠는 3시간 유효
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_FAILS = 5; // 10분에 5번 틀리면 잠깐 막기
const CLEANUP_MS = 60 * 60 * 1000;
const OWNER_KEY = /^[0-9a-f]{32,64}$/;
// 게임 추천받기 창은 이때까지만 뜨고 받는다(사용자 결정 2026-10: 10/23부터 10/31 토요일 밤까지, 한국 시간).
const REQUEST_ENDS_AT = Date.parse('2026-10-31T23:59:59.999+09:00');

function setupBoard({ app, store, requests = null, requestEndsAt = REQUEST_ENDS_AT, adminHash = process.env.BOARD_ADMIN_PASSWORD_HASH || DEFAULT_ADMIN_HASH,
  cooldownMs = POST_COOLDOWN_MS, now = Date.now, cleanupTimer = true, nameLock = null }) {
  const lastPostAt = new Map(); // IP → 마지막으로 쓴 때
  const lastRequestAt = new Map(); // IP → 마지막으로 게임 추천을 보낸 때
  const loginFails = new Map(); // IP → [틀린 때들]
  const sessions = new Map(); // 관리자 열쇠 → 끝나는 때

  const ipOf = (req) => req.ip || 'unknown';
  const isAdmin = (req) => {
    const token = req.get('x-board-admin');
    const until = token && sessions.get(token);
    if (!until) return false;
    if (until < now()) { sessions.delete(token); return false; }
    return true;
  };
  const requireAdmin = (req, res, next) => (isAdmin(req) ? next() : res.status(403).json({ error: '관리자 모드가 끝났어요. 다시 열어 주세요.' }));
  // 내 글 열쇠: 브라우저가 처음 한 번 만들어 X-Board-Owner로 보낸다. 서버는 섞은 값만 저장한다.
  const ownerOf = (req) => {
    const key = req.get('x-board-owner');
    return key && OWNER_KEY.test(key) ? crypto.createHash('sha256').update(key).digest('hex') : null;
  };
  const listFor = (req) => ({ posts: store.list(ownerOf(req)) });

  // 닉네임과 내용을 검사한다. 문제가 있으면 { error }.
  function readEntry(body, admin, req) {
    const name = String(body?.name ?? '').trim().slice(0, NAME_MAX_LENGTH) || '익명';
    const text = String(body?.text ?? '').trim();
    if (!text) return { error: '내용을 적어 주세요.' };
    if ([...text].length > TEXT_MAX_LENGTH) return { error: `내용은 ${TEXT_MAX_LENGTH}자까지 쓸 수 있어요.` };
    // 관리자인 척 못 하게: 관리자 모드이거나 🔑 잠긴 닉네임 비밀번호를 넣은 브라우저만
    if (!admin && isLockedName(name) && !nameLock?.unlocked(req?.headers.cookie)) return { error: '🔑 그 닉네임은 비밀번호가 있어야 쓸 수 있어요.' };
    if (hasBadWord(name) || hasBadWord(text)) return { error: '비속어나 욕설이 들어 있어요. 바른 말로 고쳐 주세요.' };
    return { name, text };
  }

  // 도배 막기: 관리자는 제외
  function tooFast(req, admin) {
    if (admin) return false;
    const ip = ipOf(req);
    if (now() - (lastPostAt.get(ip) ?? -Infinity) < cooldownMs) return true;
    lastPostAt.set(ip, now());
    return false;
  }

  app.get('/api/board', (req, res) => res.json(listFor(req)));

  app.post('/api/board/posts', (req, res) => {
    const admin = isAdmin(req);
    const entry = readEntry(req.body, admin, req);
    if (entry.error) return res.status(400).json(entry);
    if (tooFast(req, admin)) return res.status(429).json({ error: '조금 뒤에 다시 써 주세요. (20초에 한 번)' });
    store.addPost(entry.name, entry.text, { admin, owner: ownerOf(req) });
    res.json(listFor(req));
  });

  app.post('/api/board/posts/:id/replies', (req, res) => {
    const admin = isAdmin(req);
    const entry = readEntry(req.body, admin, req);
    if (entry.error) return res.status(400).json(entry);
    if (tooFast(req, admin)) return res.status(429).json({ error: '조금 뒤에 다시 써 주세요. (20초에 한 번)' });
    const result = store.addReply(req.params.id, entry.name, entry.text, { admin, owner: ownerOf(req) });
    if (result.error) return res.status(404).json(result);
    res.json(listFor(req));
  });

  app.post('/api/board/admin/login', async (req, res) => {
    const ip = ipOf(req);
    const fails = (loginFails.get(ip) ?? []).filter((at) => now() - at < LOGIN_WINDOW_MS);
    if (fails.length >= LOGIN_MAX_FAILS) return res.status(429).json({ error: '너무 많이 틀렸어요. 10분 뒤에 다시 해 주세요.' });
    const password = String(req.body?.password ?? '').slice(0, 100);
    if (!password || !(await bcrypt.compare(password, adminHash))) {
      fails.push(now());
      loginFails.set(ip, fails);
      return res.status(401).json({ error: '비밀번호가 맞지 않아요.' });
    }
    loginFails.delete(ip);
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, now() + ADMIN_SESSION_MS);
    res.json({ token });
  });

  app.get('/api/board/admin/check', (req, res) => res.json({ admin: isAdmin(req) }));

  app.post('/api/board/admin/logout', (req, res) => {
    sessions.delete(req.get('x-board-admin'));
    res.json({ ok: true });
  });

  // 내가 쓴 글 고치기: 이름은 그대로 두고 내용만 바꾼다. 검사는 새 글과 같다.
  // 👑 관리자 글은 관리자 모드면 어느 기기에서 썼든 고칠 수 있다(사용자 결정 2026-10-28). 일반 사람 글은 관리자도 못 고침(지우기만).
  app.patch('/api/board/items/:id', (req, res) => {
    const item = store.find(req.params.id);
    if (!item) return res.status(404).json({ error: '이미 지워진 글이에요.' });
    if (!store.isOwner(req.params.id, ownerOf(req)) && !(item.admin && isAdmin(req))) return res.status(403).json({ error: '내가 쓴 글만 고칠 수 있어요.' });
    const entry = readEntry({ name: '익명', text: req.body?.text }, true);
    if (entry.error) return res.status(400).json(entry);
    store.edit(req.params.id, entry.text);
    res.json(listFor(req));
  });

  // 지우기: 관리자는 모든 글, 그 밖에는 내가 쓴 글만.
  app.delete('/api/board/items/:id', (req, res) => {
    if (!store.find(req.params.id)) return res.status(404).json({ error: '이미 지워진 글이에요.' });
    if (!isAdmin(req) && !store.isOwner(req.params.id, ownerOf(req))) return res.status(403).json({ error: '내가 쓴 글만 지울 수 있어요.' });
    store.remove(req.params.id);
    res.json(listFor(req));
  });

  // 원글·답글 고정(답글 고정은 2026-10 추가 — 예전 주소 /posts/:id/pin도 그대로 받는다).
  app.post(['/api/board/posts/:id/pin', '/api/board/items/:id/pin'], requireAdmin, (req, res) => {
    if (!store.setPinned(req.params.id, req.body?.pinned)) return res.status(404).json({ error: '글을 찾을 수 없어요.' });
    res.json(listFor(req));
  });

  // ── 게임 추천받기: 기간 안에만 받고, 들어온 추천은 관리자만 본다 ──
  if (requests) {
    const requestOpen = () => now() <= requestEndsAt;
    app.get('/api/game-requests/status', (_req, res) => res.json({ open: requestOpen(), endsAt: requestEndsAt }));

    app.post('/api/game-requests', (req, res) => {
      if (!requestOpen()) return res.status(403).json({ error: '게임 추천받기 기간이 끝났어요.' });
      const text = String(req.body?.text ?? '').trim();
      if (!text) return res.status(400).json({ error: '원하는 게임을 적어 주세요.' });
      if ([...text].length > REQUEST_MAX_LENGTH) return res.status(400).json({ error: `${REQUEST_MAX_LENGTH}자까지 쓸 수 있어요.` });
      if (hasBadWord(text)) return res.status(400).json({ error: '비속어나 욕설이 들어 있어요. 바른 말로 고쳐 주세요.' });
      const ip = ipOf(req);
      if (now() - (lastRequestAt.get(ip) ?? -Infinity) < cooldownMs) return res.status(429).json({ error: '조금 뒤에 다시 보내 주세요. (20초에 한 번)' });
      lastRequestAt.set(ip, now());
      requests.add(text);
      res.json({ ok: true });
    });

    app.get('/api/board/admin/game-requests', requireAdmin, (_req, res) => res.json({ requests: requests.list() }));

    app.delete('/api/board/admin/game-requests/:id', requireAdmin, (req, res) => {
      requests.remove(req.params.id);
      res.json({ requests: requests.list() });
    });
  }

  // 아무도 화면을 열지 않아도 30일 지난 글이 정리되게 한 시간마다 확인한다.
  if (cleanupTimer) setInterval(() => store.cleanup(), CLEANUP_MS).unref();
  return { store, sessions };
}

module.exports = { setupBoard };
