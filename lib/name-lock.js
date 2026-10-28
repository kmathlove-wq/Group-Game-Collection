// 🔑 잠긴 닉네임: '관리자'·'개발자'처럼 운영진인 척할 수 있는 이름은 비밀번호를 한 번 넣은 브라우저만 쓴다(사용자 결정 2026-10-28).
// 모든 게임에 한꺼번에 적용한다: 소켓은 패킷 검사(socket.use), HTTP는 /api/* 요청 몸통의 name·nickname 검사.
// 비밀번호가 맞으면 30일짜리 서명 쿠키(httpOnly)를 준다. 비밀번호 원문은 저장소가 공개라 bcrypt 해시만 둔다.
const crypto = require('crypto');
const bcrypt = require('bcrypt');

// 댓글 관리자 비밀번호와 같은 비밀번호(bcrypt 10단계 — 12단계는 무료 서버에서 너무 느려 확인을 여러 번 누르게 됐음)
const DEFAULT_HASH = '$2b$10$DyRKFNrzPAGkstul.gWEyeupVmHxG3nrvZSVBJ8NBIsNnusm12MJG';
const COOKIE = 'gg_name_key';
const KEEP_MS = 30 * 24 * 60 * 60 * 1000; // 30일
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_FAILS = 5;
// 띄어쓰기·기호를 빼고 소문자로 바꾼 뒤 찾는다("관 리 자", "Admin!"도 잡힘). public/shared/name-lock.js와 같은 목록.
const LOCKED = /관리자|운영자|운영진|개발자|제작자|admin|developer/;
const REQUIRED_MESSAGE = '🔑 그 닉네임은 비밀번호가 있어야 쓸 수 있어요.';

function isLockedName(name) {
  const flat = String(name ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  return LOCKED.test(flat);
}

function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) return decodeURIComponent(part.slice(at + 1).trim());
  }
  return '';
}

function createNameLock({ hash = process.env.NAME_LOCK_PASSWORD_HASH || DEFAULT_HASH,
  secret = process.env.NAME_LOCK_SECRET || process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'), now = Date.now } = {}) {
  const sign = (until) => crypto.createHmac('sha256', secret).update('name-lock:' + until).digest('hex');
  const makeKey = () => { const until = now() + KEEP_MS; return `${until}.${sign(until)}`; };
  function validKey(value) {
    const [until, mac] = String(value || '').split('.');
    if (!/^\d+$/.test(until || '') || !mac || Number(until) < now()) return false;
    const want = Buffer.from(sign(until));
    const got = Buffer.from(mac);
    return want.length === got.length && crypto.timingSafeEqual(want, got);
  }
  const unlocked = (cookieHeader) => validKey(readCookie(cookieHeader, COOKIE));
  // 쓸 수 없으면 알림 글, 써도 되면 null
  const check = (name, cookieHeader) => (isLockedName(name) && !unlocked(cookieHeader) ? REQUIRED_MESSAGE : null);

  // 소켓: 모든 이벤트의 nickname(광질 타이쿤 mt:*은 name)을 검사한다. 막히면 대답(ack)으로 알리고 이벤트는 버린다.
  function guardSocket(socket) {
    socket.use((packet, next) => {
      const [event, payload] = packet;
      if (!payload || typeof payload !== 'object') return next();
      const name = typeof payload.nickname === 'string' ? payload.nickname
        : String(event).startsWith('mt:') && typeof payload.name === 'string' ? payload.name : null;
      // 쿠키는 연결할 때 받은 것이다(비밀번호를 넣은 화면은 새로고침해서 다시 연결한다).
      const message = name != null && check(name, socket.request.headers.cookie);
      if (!message) return next();
      const ack = packet[packet.length - 1];
      if (typeof ack === 'function') ack({ ok: false, error: message, message, code: 'name-locked' });
    });
  }

  // HTTP: 순위 등록·게시판 글처럼 이름을 받는 /api/* 요청(관리자 화면 API는 빼고).
  function httpGuard(req, res, next) {
    if (!['POST', 'PUT', 'PATCH'].includes(req.method) || !req.path.startsWith('/api/') || req.path.startsWith('/api/admin') || req.path.startsWith('/api/name-lock')) return next();
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    for (const field of ['name', 'nickname', 'uploader']) {
      if (typeof body[field] !== 'string') continue;
      const message = check(body[field], req.headers.cookie);
      if (message) return res.status(403).json({ ok: false, error: message, message, code: 'name-locked' });
    }
    next();
  }

  function setupRoutes(app) {
    const fails = new Map(); // IP → [틀린 때들]
    app.get('/api/name-lock/status', (req, res) => res.json({ unlocked: unlocked(req.headers.cookie) }));
    app.post('/api/name-lock/unlock', async (req, res) => {
      const ip = req.ip || 'unknown';
      const list = (fails.get(ip) ?? []).filter((at) => now() - at < LOGIN_WINDOW_MS);
      if (list.length >= LOGIN_MAX_FAILS) return res.status(429).json({ ok: false, error: '너무 많이 틀렸어요. 10분 뒤에 다시 해 주세요.' });
      const password = String(req.body?.password ?? '').slice(0, 100);
      if (!password || !(await bcrypt.compare(password, hash))) {
        list.push(now());
        fails.set(ip, list);
        return res.status(401).json({ ok: false, error: '비밀번호가 맞지 않아요.' });
      }
      fails.delete(ip);
      const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      res.setHeader('Set-Cookie', `${COOKIE}=${makeKey()}; Path=/; Max-Age=${KEEP_MS / 1000}; HttpOnly; SameSite=Lax${secure}`);
      res.json({ ok: true });
    });
  }

  return { check, unlocked, guardSocket, httpGuard, setupRoutes };
}

module.exports = { createNameLock, isLockedName, DEFAULT_HASH, REQUIRED_MESSAGE };
