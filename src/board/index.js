// 게임 선택 화면(/)의 개선사항·댓글 게시판 API.
// 누구나 글·답글을 쓰고, 관리자(숨은 Ctrl 신호 + 비밀번호)는 삭제·고정·관리자 글쓰기를 한다.
// 비밀번호 원문은 어디에도 두지 않는다(저장소가 공개라서): bcrypt로 섞은 값만 두고 서버에서만 비교한다.
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { hasBadWord } = require('../../lib/bad-words');
const { NAME_MAX_LENGTH, TEXT_MAX_LENGTH } = require('../../lib/board-store');

const DEFAULT_ADMIN_HASH = '$2b$12$iaJ3D1/Q9nqNoZc4eMhFN.6njgc41KBLejogL/14n/7jNxQYBX2x.';
const POST_COOLDOWN_MS = 20_000; // 같은 사람(IP)은 20초에 한 번 쓰기
const ADMIN_SESSION_MS = 3 * 60 * 60 * 1000; // 관리자 열쇠는 3시간 유효
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_FAILS = 5; // 10분에 5번 틀리면 잠깐 막기
const CLEANUP_MS = 60 * 60 * 1000;
const RESERVED_NAME = /관리자|운영자|admin/i; // 관리자인 척 못 하게

function setupBoard({ app, store, adminHash = process.env.BOARD_ADMIN_PASSWORD_HASH || DEFAULT_ADMIN_HASH,
  cooldownMs = POST_COOLDOWN_MS, now = Date.now, cleanupTimer = true }) {
  const lastPostAt = new Map(); // IP → 마지막으로 쓴 때
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

  // 닉네임과 내용을 검사한다. 문제가 있으면 { error }.
  function readEntry(body, admin) {
    const name = String(body?.name ?? '').trim().slice(0, NAME_MAX_LENGTH) || '익명';
    const text = String(body?.text ?? '').trim();
    if (!text) return { error: '내용을 적어 주세요.' };
    if ([...text].length > TEXT_MAX_LENGTH) return { error: `내용은 ${TEXT_MAX_LENGTH}자까지 쓸 수 있어요.` };
    if (!admin && RESERVED_NAME.test(name)) return { error: '그 닉네임은 쓸 수 없어요.' };
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

  app.get('/api/board', (_req, res) => res.json({ posts: store.list() }));

  app.post('/api/board/posts', (req, res) => {
    const admin = isAdmin(req);
    const entry = readEntry(req.body, admin);
    if (entry.error) return res.status(400).json(entry);
    if (tooFast(req, admin)) return res.status(429).json({ error: '조금 뒤에 다시 써 주세요. (20초에 한 번)' });
    store.addPost(entry.name, entry.text, { admin });
    res.json({ posts: store.list() });
  });

  app.post('/api/board/posts/:id/replies', (req, res) => {
    const admin = isAdmin(req);
    const entry = readEntry(req.body, admin);
    if (entry.error) return res.status(400).json(entry);
    if (tooFast(req, admin)) return res.status(429).json({ error: '조금 뒤에 다시 써 주세요. (20초에 한 번)' });
    const result = store.addReply(req.params.id, entry.name, entry.text, { admin });
    if (result.error) return res.status(404).json(result);
    res.json({ posts: store.list() });
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

  app.delete('/api/board/items/:id', requireAdmin, (req, res) => {
    if (!store.remove(req.params.id)) return res.status(404).json({ error: '이미 지워진 글이에요.' });
    res.json({ posts: store.list() });
  });

  app.post('/api/board/posts/:id/pin', requireAdmin, (req, res) => {
    if (!store.setPinned(req.params.id, req.body?.pinned)) return res.status(404).json({ error: '글을 찾을 수 없어요.' });
    res.json({ posts: store.list() });
  });

  // 아무도 화면을 열지 않아도 30일 지난 글이 정리되게 한 시간마다 확인한다.
  if (cleanupTimer) setInterval(() => store.cleanup(), CLEANUP_MS).unref();
  return { store, sessions };
}

module.exports = { setupBoard };
