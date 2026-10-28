const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const bcrypt = require('bcrypt');
const { Server } = require('socket.io');
const { io: createClient } = require('socket.io-client');
const { createNameLock, isLockedName } = require('../lib/name-lock');

test('🔑 잠긴 닉네임: 관리자·개발자 같은 이름을 띄어쓰기·기호·대소문자를 바꿔도 찾는다', () => {
  for (const name of ['관리자', '관 리 자', '게임개발자', '운영자님', '운영진', '제작자', 'Admin', 'a.d.m.i.n', 'DEVELOPER']) assert.equal(isLockedName(name), true, name);
  for (const name of ['그림왕', '관리', '개발', 'dev', '어드민아님']) assert.equal(isLockedName(name), false, name);
});

test('🔑 잠긴 닉네임: 비밀번호를 넣으면 쿠키를 받아 소켓·HTTP 모두 그 이름을 쓸 수 있다', async (t) => {
  const hash = await bcrypt.hash('1234', 4);
  const lock = createNameLock({ hash, secret: 'test-secret' });
  const app = express();
  app.set('trust proxy', false);
  app.use(express.json());
  app.use(lock.httpGuard);
  lock.setupRoutes(app);
  app.post('/api/scores', (req, res) => res.json({ ok: true, name: req.body.name }));
  const server = http.createServer(app);
  const io = new Server(server);
  io.on('connection', (socket) => {
    lock.guardSocket(socket);
    socket.on('room:join', (_payload, ack) => ack({ ok: true }));
    socket.on('mt:team:create', (_payload, ack) => ack({ ok: true }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const sockets = [];
  t.after(() => { sockets.forEach((s) => s.close()); io.close(); server.close(); });
  const connect = (cookie) => new Promise((resolve) => {
    const s = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false, extraHeaders: cookie ? { cookie } : {} });
    sockets.push(s);
    s.on('connect', () => resolve(s));
  });
  const ask = (s, event, data) => new Promise((resolve) => s.emit(event, data, resolve));
  const post = (path, body, cookie) => fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });

  // 비밀번호 없이: 막힌다
  const plain = await connect();
  const blocked = await ask(plain, 'room:join', { nickname: '관리자', code: 'ABCDEF' });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'name-locked');
  assert.match(blocked.error, /비밀번호/);
  assert.equal((await ask(plain, 'mt:team:create', { name: '개발자' })).ok, false, '광질 타이쿤은 name 칸을 본다');
  assert.equal((await ask(plain, 'room:join', { nickname: '그림왕' })).ok, true);
  assert.equal((await post('/api/scores', { name: 'admin', score: 1 })).status, 403);

  // 틀린 비밀번호 → 맞는 비밀번호
  assert.equal((await post('/api/name-lock/unlock', { password: '0000' })).status, 401);
  const ok = await post('/api/name-lock/unlock', { password: '1234' });
  assert.equal(ok.status, 200);
  const cookie = ok.headers.get('set-cookie').split(';')[0];
  assert.match(cookie, /^gg_name_key=/);
  assert.equal((await (await fetch(url + '/api/name-lock/status', { headers: { cookie } })).json()).unlocked, true);

  const unlocked = await connect(cookie);
  assert.equal((await ask(unlocked, 'room:join', { nickname: '관리자' })).ok, true);
  assert.equal((await post('/api/scores', { name: 'admin' }, cookie)).status, 200);
  assert.equal((await post('/api/scores', { name: 'admin' }, 'gg_name_key=9999999999999.abc')).status, 403, '가짜 쿠키는 안 된다');
});
