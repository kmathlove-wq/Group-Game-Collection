const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { io: createClient } = require('socket.io-client');
const { setupRoachGame, assignRoles } = require('../src/roach');
const A = require('../src/roach/arena');

// ── 규칙 단위 시험(소켓 없음) ──
const furniture = (id) => A.FURNITURE.find((f) => f.id === id);
function arenaWith(players, options = {}) {
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  return A.createArena({ players, random, countdownSec: 0, ...options });
}
const place = (arena, id, x, y, extra = {}) => Object.assign(arena.byId.get(id), { x, y, safeUntil: 0, ...extra });
const run = (arena, seconds) => { for (let i = 0; i < Math.round(seconds / A.TICK_SECONDS); i += 1) A.step(arena); };

test('바퀴: 인원별 인간 수 — 자동·방장 지정, 바퀴가 늘 더 많다', () => {
  assert.deepEqual([3, 5, 6, 8, 9, 12].map((n) => A.humanCountFor(n)), [1, 1, 2, 2, 3, 3]);
  assert.equal(A.humanCountFor(3, 3), 1, '3명이면 인간은 최대 1명');
  assert.equal(A.humanCountFor(12, 5), 5);
  assert.equal(A.humanCountFor(12, 9), 5, '12명이어도 인간 5명까지(바퀴 7)');
  for (const n of [3, 7, 12]) {
    const roles = [...assignRoles(Array.from({ length: n }, (_, i) => `p${i}`)).values()];
    const humans = roles.filter((r) => r === 'human').length;
    assert.equal(humans, A.humanCountFor(n));
    assert.ok(n - humans > humans);
  }
});

test('바퀴: 이동 속도와 벽 — 벽은 못 지나가고 벽을 따라 미끄러진다', () => {
  const a = arenaWith([{ id: 'h', role: 'human' }, { id: 'r', role: 'roach' }]);
  place(a, 'r', 300, 700);
  A.setInput(a, 'r', { angle: 0, move: true }); // 오른쪽
  A.step(a);
  assert.ok(Math.abs(a.byId.get('r').x - (300 + A.ROLE.roach.speed * A.TICK_SECONDS)) < 0.01, '바퀴는 초당 200');
  place(a, 'h', 860, 620);
  A.setInput(a, 'h', { angle: 0, move: true });
  const hx = a.byId.get('h').x; A.step(a);
  assert.ok(a.byId.get('h').x - hx < A.ROLE.roach.speed * A.TICK_SECONDS, '인간이 더 느리다');
  // 부엌과 거실 사이 벽(x 600~620, y 20~380): 오른쪽으로 계속 가도 벽 앞에서 멈춘다.
  place(a, 'r', 560, 200); A.setInput(a, 'r', { angle: 0, move: true });
  run(a, 2);
  assert.equal(a.byId.get('r').x, 600 - A.ROLE.roach.size);
  // 비스듬히 가면 벽을 따라 아래로 미끄러진다.
  place(a, 'r', 560, 200); A.setInput(a, 'r', { angle: Math.PI / 4, move: true });
  run(a, 0.5);
  assert.equal(a.byId.get('r').x, 600 - A.ROLE.roach.size);
  assert.ok(a.byId.get('r').y > 250);
  // 바깥 벽 밖으로는 절대 못 나간다.
  place(a, 'r', 40, 500); A.setInput(a, 'r', { angle: Math.PI, move: true });
  run(a, 2);
  assert.ok(a.byId.get('r').x >= 20 + A.ROLE.roach.size);
});

test('바퀴: 가구 — 바퀴만 숨을 수 있고, 인간에게는 숨은 바퀴가 안 보이고, 오래 있으면 쫓겨난다', () => {
  const a = arenaWith([{ id: 'h', role: 'human' }, { id: 'r', role: 'roach' }]);
  const table = furniture('table');
  // 인간은 식탁을 못 지나간다.
  place(a, 'h', table.x - 60, table.y + 70); A.setInput(a, 'h', { angle: 0, move: true });
  run(a, 2);
  assert.equal(a.byId.get('h').x, table.x - A.ROLE.human.size);
  A.setInput(a, 'h', { angle: 0, move: false });
  // 바퀴는 식탁 밑으로 들어가 숨는다.
  place(a, 'r', table.x - 30, table.y + 70); A.setInput(a, 'r', { angle: 0, move: true });
  run(a, 0.5);
  A.setInput(a, 'r', { angle: 0, move: false });
  const r = a.byId.get('r');
  assert.equal(r.hidden, true);
  assert.ok(!A.viewPlayers(a, false).some((p) => p[0] === r.n), '인간 화면 정보에는 숨은 바퀴가 없다');
  assert.ok(A.viewPlayers(a, true).some((p) => p[0] === r.n && (p[4] & 1)), '바퀴 화면에는 숨음 표시와 함께 있다');
  // 숨은 바퀴는 슬리퍼에 안 맞는다.
  place(a, 'h', r.x - 50, r.y, { angle: 0 });
  assert.deepEqual(A.act(a, 'h', 'slipper').hits, []);
  // 8초가 지나면 밖으로 쫓겨나고, 4초 동안 그 가구에 다시 못 들어간다.
  run(a, A.HIDE_LIMIT);
  assert.equal(r.hidden, false);
  assert.ok(!(r.x > table.x && r.x < table.x + table.w && r.y > table.y && r.y < table.y + table.h), '가구 밖으로 나왔다');
  assert.ok(A.viewPlayers(a, false).some((p) => p[0] === r.n), '이제 인간에게도 보인다');
  const toTable = Math.atan2(table.y + table.h / 2 - r.y, table.x + table.w / 2 - r.x);
  A.setInput(a, 'r', { angle: toTable, move: true });
  run(a, 1);
  assert.equal(r.hidden, false, '쫓겨난 직후엔 같은 가구에 못 들어간다');
  // 숨을 수 없는 가구(싱크대)는 바퀴도 못 지나간다.
  const sink = furniture('sink');
  place(a, 'r', 200, sink.y + sink.h + 30); A.setInput(a, 'r', { angle: -Math.PI / 2, move: true });
  run(a, 1);
  assert.equal(a.byId.get('r').y, sink.y + sink.h + A.ROLE.roach.size);
});

test('바퀴: 슬리퍼 — 앞쪽 짧은 거리만, 쿨타임 0.8초, 벽 너머는 안 됨 / 스프레이는 느리게', () => {
  const a = arenaWith([{ id: 'h', role: 'human' }, { id: 'r1', role: 'roach' }, { id: 'r2', role: 'roach' }]);
  place(a, 'h', 860, 700, { angle: 0 });
  place(a, 'r1', 860 - 50, 700); // 뒤쪽 → 안 맞음
  place(a, 'r2', 860 + 150, 700); // 너무 멂
  assert.deepEqual(A.act(a, 'h', 'slipper').hits, []);
  assert.equal(A.act(a, 'h', 'slipper').ok, false, '쿨타임');
  run(a, A.SLIPPER.cooldown);
  place(a, 'r2', 860 + 60, 710);
  const hit = A.act(a, 'h', 'slipper');
  assert.deepEqual(hit.hits, [a.byId.get('r2').n]);
  assert.equal(a.byId.get('r2').alive, false);
  assert.equal(a.byId.get('h').catches, 1);
  assert.equal(A.act(a, 'r1', 'slipper').ok, false, '바퀴는 공격 못 함');
  // 벽 너머: 인간은 거실(x 640), 바퀴는 벽(600~620) 건너 부엌.
  run(a, A.SLIPPER.cooldown);
  place(a, 'h', 645, 200, { angle: Math.PI });
  place(a, 'r1', 590, 200);
  assert.deepEqual(A.act(a, 'h', 'slipper').hits, [], '벽 너머는 못 때림');
  // 스프레이: 앞쪽 부채꼴, 맞으면 2초 느려짐.
  place(a, 'h', 860, 700, { angle: 0 });
  place(a, 'r1', 1000, 720);
  assert.deepEqual(A.act(a, 'h', 'spray').hits, [a.byId.get('r1').n]);
  assert.equal(A.act(a, 'h', 'spray').ok, false, '스프레이 쿨타임 6초');
  A.setInput(a, 'r1', { angle: Math.PI / 2, move: true });
  const y0 = a.byId.get('r1').y; A.step(a);
  assert.ok(Math.abs(a.byId.get('r1').y - y0 - A.ROLE.roach.speed * A.SPRAY.slowFactor * A.TICK_SECONDS) < 0.01);
  run(a, A.SPRAY.slowSeconds);
  const y1 = a.byId.get('r1').y; A.step(a);
  assert.ok(Math.abs(a.byId.get('r1').y - y1 - A.ROLE.roach.speed * A.TICK_SECONDS) < 0.01, '2초 뒤 원래 속도');
});

test('바퀴: 부스러기 점수·알 부활·승리 조건', () => {
  // 다 잡으면 인간 승리
  let a = arenaWith([{ id: 'h', role: 'human' }, { id: 'r', role: 'roach' }]);
  place(a, 'h', 860, 700, { angle: 0 }); place(a, 'r', 910, 700);
  A.act(a, 'h', 'slipper'); A.step(a);
  assert.equal(a.winner, 'humans'); assert.equal(a.reason, 'caught');
  // 시간 끝까지 살면 바퀴 승리
  a = arenaWith([{ id: 'h', role: 'human' }, { id: 'r', role: 'roach' }], { durationSec: 2 });
  run(a, 2);
  assert.equal(a.winner, 'roaches'); assert.equal(a.reason, 'time');
  // 부스러기: 먹으면 팀 점수, 10점마다 잡힌 바퀴 1마리 부활, 목표를 채우면 바퀴 승리
  a = arenaWith([{ id: 'h', role: 'human' }, { id: 'r1', role: 'roach' }, { id: 'r2', role: 'roach' }], { goal: 12 });
  place(a, 'h', 860, 700, { angle: 0 }); place(a, 'r2', 910, 700);
  A.act(a, 'h', 'slipper');
  assert.equal(a.byId.get('r2').alive, false);
  a.crumbs = []; a.score = 9; place(a, 'r1', 300, 800);
  a.crumbs.push({ id: 999, x: 310, y: 800, v: 1 });
  A.step(a);
  assert.equal(a.score, 10); assert.equal(a.byId.get('r1').eaten, 1);
  assert.equal(a.byId.get('r2').alive, true, '10점이 되면 알에서 부활');
  assert.equal(a.winner, null);
  a.crumbs.push({ id: 1000, x: a.byId.get('r1').x, y: a.byId.get('r1').y, v: 3 });
  A.step(a);
  assert.equal(a.winner, 'roaches'); assert.equal(a.reason, 'crumbs');
  // 바퀴가 모두 나가면 인간 승리 / 인간이 모두 나가면 바퀴 승리
  a = arenaWith([{ id: 'h', role: 'human' }, { id: 'r', role: 'roach' }]);
  A.removePlayer(a, 'r'); A.step(a); assert.equal(a.reason, 'noRoaches');
  a = arenaWith([{ id: 'h', role: 'human' }, { id: 'r', role: 'roach' }]);
  A.removePlayer(a, 'h'); A.step(a); assert.equal(a.reason, 'noHumans');
});

test('바퀴: 부스러기는 벽·가구 위에 생기지 않고, 시작 자리는 막히지 않는다', () => {
  const a = arenaWith(Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, role: i < 5 ? 'human' : 'roach' })));
  run(a, 30);
  for (const c of a.crumbs) {
    assert.ok(![...A.WALLS, ...A.FURNITURE].some((r) => c.x > r.x - 9 && c.x < r.x + r.w + 9 && c.y > r.y - 9 && c.y < r.y + r.h + 9));
  }
  for (const p of a.players) {
    const s = A.ROLE[p.role].size;
    assert.ok(![...A.WALLS, ...A.FURNITURE.filter((f) => p.role === 'human' || !f.hide)].some((r) => p.x + s > r.x && p.x - s < r.x + r.w && p.y + s > r.y && p.y - s < r.y + r.h), `${p.id} 시작 자리`);
  }
});

// ── 실제 소켓 시험: 임시 서버에 setupRoachGame만 붙인다 ──
async function startServer(t, options = {}) {
  const app = express(); const server = http.createServer(app); const io = new Server(server);
  const game = setupRoachGame({ app, io, rootDir: `${__dirname}/..`, tickMs: 10, countdownSeconds: 0, ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { game.close(); await new Promise((resolve) => io.close(resolve)); });
  return { url, game };
}
function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = createClient(url, { transports: ['websocket'], forceNew: true });
    socket.once('connect', () => resolve(socket)); socket.once('connect_error', reject);
  });
}
function emitAck(socket, event, payload = {}) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${event} 응답 시간 초과`)), 2_000);
    socket.emit(event, payload, (result) => { clearTimeout(timeout); resolve(result); });
  });
}
const waitFor = (socket, event, check = () => true, ms = 5_000) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error(`${event} 기다리다 시간 초과`)), ms);
  const handler = (data) => { if (!check(data)) return; clearTimeout(timeout); socket.off(event, handler); resolve(data); };
  socket.on(event, handler);
});

async function startRoom(t, url, count, settings) {
  const players = [];
  for (let i = 0; i < count; i += 1) {
    const socket = await connect(url); t.after(() => socket.close());
    const p = { socket, userId: `u${i}`, nickname: `사람${i}`, state: null, snapshot: null, ticks: [] };
    socket.on('roach:room:state', (data) => { p.state = data; });
    socket.on('roach:snapshot', (data) => { p.snapshot = data; });
    socket.on('roach:tick', (data) => { p.ticks.push(data); if (p.ticks.length > 50) p.ticks.shift(); });
    players.push(p);
  }
  const [host, ...guests] = players;
  const { code } = await emitAck(host.socket, 'roach:room:create', { userId: host.userId, nickname: host.nickname, minutes: 2 });
  for (const g of guests) {
    assert.equal((await emitAck(g.socket, 'roach:room:join', { userId: g.userId, nickname: g.nickname, code })).ok, true);
    await emitAck(g.socket, 'roach:room:ready', true);
  }
  if (settings) assert.equal((await emitAck(host.socket, 'roach:room:settings', settings)).ok, true);
  const snaps = Promise.all(players.map((p) => waitFor(p.socket, 'roach:snapshot')));
  assert.equal((await emitAck(host.socket, 'roach:game:start')).ok, true);
  await snaps;
  return { players, host, code };
}

test('바퀴 방: 3명 — 방 만들기·설정·시작·역할·조작·숨은 바퀴 숨기기·시간 끝 바퀴 승리', async (t) => {
  const { url, game } = await startServer(t, { gameSeconds: 4, tickMs: 25 }); // 80틱 = 약 2초
  const { players, host, code } = await startRoom(t, url, 3);
  const room = game.rooms.get(code);
  const arena = room.game.arena;
  const roleOf = (p) => arena.byId.get(p.userId).role;
  const humans = players.filter((p) => roleOf(p) === 'human'); const roaches = players.filter((p) => roleOf(p) === 'roach');
  assert.equal(humans.length, 1); assert.equal(roaches.length, 2);
  assert.ok(host.state.players.every((p) => p.role), '방 상태에 각자 역할');
  assert.ok(players.every((p) => p.snapshot.map.walls.length && p.snapshot.me.role === roleOf(p)));

  // 게임 중 새 입장·채팅·설정 변경은 막힌다.
  const late = await connect(url); t.after(() => late.close());
  assert.match((await emitAck(late, 'roach:room:join', { userId: 'late', nickname: '늦은', code })).message, /시작/);
  assert.equal((await emitAck(host.socket, 'roach:chat:send', { text: '어디야' })).ok, false);
  assert.equal((await emitAck(host.socket, 'roach:room:settings', { minutes: 4 })).ok, false);
  // 바퀴는 공격 못 한다.
  assert.equal((await emitAck(roaches[0].socket, 'roach:action', { type: 'slipper' })).ok, false);

  // 조작: 바퀴 하나를 식탁 밑에 숨긴다 → 인간 틱엔 없고, 바퀴 틱엔 있다.
  const hider = arena.byId.get(roaches[0].userId);
  const table = furniture('table');
  Object.assign(hider, { x: table.x + table.w / 2, y: table.y + table.h / 2 });
  const t0 = arena.time;
  const [humanTick, roachTick] = await Promise.all([
    waitFor(humans[0].socket, 'roach:tick', (d) => d.t > t0 + 0.1), waitFor(roaches[1].socket, 'roach:tick', (d) => d.t > t0 + 0.1)]);
  assert.equal(hider.hidden, true);
  assert.ok(!humanTick.p.some((x) => x[0] === hider.n), '인간에게 숨은 바퀴 위치가 가면 안 된다');
  assert.ok(roachTick.p.some((x) => x[0] === hider.n && (x[4] & 1)));
  assert.equal(humanTick.me.role, 'human');

  // 다른 바퀴는 방향을 보내면 움직인다.
  const mover = arena.byId.get(roaches[1].userId);
  const before = { x: mover.x, y: mover.y };
  roaches[1].socket.emit('roach:input', { angle: 1, move: true });
  await waitFor(roaches[1].socket, 'roach:tick', () => Math.hypot(mover.x - before.x, mover.y - before.y) > 5);
  assert.equal((await emitAck(humans[0].socket, 'roach:action', { type: 'slipper' })).ok, true);

  // 3초가 지나면 바퀴 승리, 결과 뒤 대기실로(채팅 가능, 한 판 더 가능).
  const finished = await waitFor(host.socket, 'roach:game:finished', () => true, 8_000);
  assert.equal(finished.winner, 'roaches'); assert.equal(finished.reason, 'time');
  assert.equal(finished.stats.length, 3);
  assert.equal(room.state, 'finished');
  assert.equal((await emitAck(host.socket, 'roach:chat:send', { text: '한 판 더!' })).ok, true);
  assert.equal((await emitAck(late, 'roach:room:join', { userId: 'late', nickname: '늦은', code })).ok, true, '끝나면 들어올 수 있다');
});

test('바퀴 방: 6명 방장 인간 수 지정, 바퀴가 다 나가면 인간 승리, 끊긴 사람은 같은 userId로 이어 한다', async (t) => {
  const { url, game } = await startServer(t, { gameSeconds: 60 });
  const { players, code } = await startRoom(t, url, 6, { humans: 2, minutes: 4 });
  const room = game.rooms.get(code);
  const arena = room.game.arena;
  assert.equal(room.minutes, 4);
  assert.equal(arena.players.filter((p) => p.role === 'human').length, 2);
  const roaches = players.filter((p) => arena.byId.get(p.userId).role === 'roach');
  const humans = players.filter((p) => arena.byId.get(p.userId).role === 'human');

  // 인간 하나가 끊겼다가 같은 userId로 돌아오면 판을 다시 받는다.
  humans[1].socket.close();
  const back = await connect(url); t.after(() => back.close());
  const snap = waitFor(back, 'roach:snapshot');
  assert.equal((await emitAck(back, 'roach:room:join', { userId: humans[1].userId, nickname: humans[1].nickname, code })).ok, true);
  assert.equal((await snap).me.role, 'human');
  assert.equal(room.players.size, 6);

  const finished = waitFor(humans[0].socket, 'roach:game:finished');
  for (const r of roaches) await emitAck(r.socket, 'roach:room:leave');
  const result = await finished;
  assert.equal(result.winner, 'humans'); assert.equal(result.reason, 'noRoaches');
});
