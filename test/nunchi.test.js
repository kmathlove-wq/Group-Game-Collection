const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { io: createClient } = require('socket.io-client');
const { setupNunchiGame } = require('../src/nunchi');
const Rules = require('../src/nunchi/rules');

// ── 판정 규칙(순수 함수) ──
test('눈치게임 규칙: 0.4초 안에 같은 숫자를 외치면 겹친 사람 모두 탈락, 라운드 끝', () => {
  const round = Rules.createRound(['a', 'b', 'c', 'd']);
  assert.equal(Rules.call(round, 'a', 0).number, 1);
  Rules.settle(round);
  assert.equal(Rules.call(round, 'b', 1000).number, 2);
  assert.equal(Rules.call(round, 'c', 1300).number, 2, '0.3초 뒤라 같은 숫자 2');
  const events = Rules.settle(round);
  assert.deepEqual(events, [{ type: 'clash', userIds: ['b', 'c'], number: 2 }]);
  assert.equal(round.done, true);
  assert.deepEqual(round.outs, [{ userId: 'b', why: 'clash' }, { userId: 'c', why: 'clash' }]);
  assert.equal(Rules.call(round, 'd', 1500).ok, false, '끝난 라운드는 못 외침');
  assert.deepEqual(Rules.outcome(round, 'survival'), { outs: round.outs, redo: false, everyone: false, empty: false });
});

test('눈치게임 규칙: 0.4초가 지나면 앞 숫자가 확정되고 다음 숫자, 마지막 한 명은 꼴찌', () => {
  const round = Rules.createRound(['a', 'b', 'c']);
  assert.equal(Rules.call(round, 'a', 0).number, 1);
  const second = Rules.call(round, 'b', 401);
  assert.equal(second.number, 2, '0.401초 뒤는 다음 숫자');
  assert.deepEqual(second.events, [{ type: 'safe', userId: 'a', number: 1 }]);
  assert.equal(Rules.call(round, 'b', 500).reason, 'already', '한 라운드에 한 번만');
  Rules.settle(round);
  assert.equal(round.done, true);
  assert.deepEqual(round.outs, [{ userId: 'c', why: 'last' }]);
  // 확정 타이머보다 늦게 들어온 c의 외침: 앞 숫자를 확정해 보니 이미 c가 꼴찌
  const late = Rules.createRound(['a', 'b', 'c']);
  Rules.call(late, 'a', 0); Rules.settle(late); Rules.call(late, 'b', 1000);
  const result = Rules.call(late, 'c', 1500);
  assert.equal(result.ok, false); assert.equal(result.reason, 'done');
  assert.deepEqual(late.outs, [{ userId: 'c', why: 'last' }]);
  // 마지막 사람이 겹침 시간 안에 같이 외치면 꼴찌가 아니라 둘 다 겹침
  const tie = Rules.createRound(['a', 'b', 'c']);
  Rules.call(tie, 'a', 0); Rules.settle(tie); Rules.call(tie, 'b', 1000); Rules.call(tie, 'c', 1200); Rules.settle(tie);
  assert.deepEqual(tie.outs.map((o) => [o.userId, o.why]), [['b', 'clash'], ['c', 'clash']]);
  assert.equal(Rules.call(Rules.createRound(['a']), 'z', 0).reason, 'not-player');
});

test('눈치게임 규칙: 시간 초과면 안 외친 사람 모두 탈락, 아무도 안 누르면 생존 모드는 다시', () => {
  const round = Rules.createRound(['a', 'b', 'c', 'd']);
  Rules.call(round, 'a', 0); Rules.call(round, 'b', 900);
  const events = Rules.expire(round);
  assert.deepEqual(events, [{ type: 'safe', userId: 'b', number: 2 }], '기다리던 숫자는 먼저 확정');
  assert.deepEqual(round.outs.map((o) => [o.userId, o.why]), [['c', 'timeout'], ['d', 'timeout']]);
  const empty = Rules.createRound(['a', 'b', 'c']); Rules.expire(empty);
  assert.deepEqual(Rules.outcome(empty, 'survival'), { outs: [], redo: true, everyone: true, empty: true });
  assert.equal(Rules.outcome(empty, 'score').outs.length, 3, '점수 모드는 모두 벌점');
});

test('눈치게임 규칙: 2명 남으면 숫자 1까지 — 먼저 누른 사람 생존, 겹치면 둘 다 다시', () => {
  const round = Rules.createRound(['a', 'b']);
  Rules.call(round, 'b', 0); Rules.settle(round);
  assert.deepEqual(round.outs, [{ userId: 'a', why: 'last' }]);
  assert.deepEqual(Rules.outcome(round, 'survival').outs, [{ userId: 'a', why: 'last' }]);
  const tie = Rules.createRound(['a', 'b']);
  Rules.call(tie, 'a', 0); Rules.call(tie, 'b', 100); Rules.settle(tie);
  const result = Rules.outcome(tie, 'survival');
  assert.equal(result.redo, true); assert.deepEqual(result.outs, []);
});

test('눈치게임 규칙: 라운드 중 나간 사람 빼기와 최종 순위', () => {
  const round = Rules.createRound(['a', 'b', 'c']);
  Rules.call(round, 'a', 0);
  Rules.removePlayer(round, 'a');
  assert.equal(round.pending, null); assert.equal(round.number, 0, '기다리던 외침만 있던 사람이 나가면 숫자를 되돌림');
  Rules.call(round, 'b', 10); Rules.settle(round);
  assert.deepEqual(round.outs, [{ userId: 'c', why: 'last' }]);
  const survival = Rules.rankPlayers([{ userId: 'a', outRound: 1 }, { userId: 'b', outRound: null }, { userId: 'c', outRound: 2 }, { userId: 'd', outRound: 1 }], 'survival');
  assert.deepEqual(survival.map((p) => [p.userId, p.rank]), [['b', 1], ['c', 2], ['a', 3], ['d', 3]]);
  const score = Rules.rankPlayers([{ userId: 'a', penalty: 2 }, { userId: 'b', penalty: 0 }, { userId: 'c', penalty: 0 }], 'score');
  assert.deepEqual(score.map((p) => [p.userId, p.rank]), [['b', 1], ['c', 1], ['a', 3]]);
});

// ── 실제 소켓으로 한 판 ──
async function startServer(t, options = {}) {
  const app = express(); const server = http.createServer(app); const io = new Server(server);
  const game = setupNunchiGame({ app, io, rootDir: `${__dirname}/..`, clashMs: 150, countdownMs: 150, roundMs: 1500, resultMs: 150, ...options });
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
const waitFor = (socket, event, check = () => true, ms = 4_000) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error(`${event} 기다리다 시간 초과`)), ms);
  const handler = (data) => { if (!check(data)) return; clearTimeout(timeout); socket.off(event, handler); resolve(data); };
  socket.on(event, handler);
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const playing = (socket) => waitFor(socket, 'nunchi:room:state', (s) => s.game?.phase === 'play');

async function makeRoom(t, url, count, settings = {}) {
  const players = [];
  for (let i = 0; i < count; i += 1) {
    const socket = await connect(url); t.after(() => socket.close());
    players.push({ socket, userId: `u${i}`, nickname: `사람${i}` });
  }
  const [host, ...guests] = players;
  const created = await emitAck(host.socket, 'nunchi:room:create', { userId: host.userId, nickname: host.nickname, ...settings });
  assert.equal(created.ok, true);
  for (const g of guests) {
    assert.equal((await emitAck(g.socket, 'nunchi:room:join', { userId: g.userId, nickname: g.nickname, code: created.code })).ok, true);
    assert.equal((await emitAck(g.socket, 'nunchi:room:ready', true)).ok, true);
  }
  return { players, host, code: created.code };
}

test('눈치게임: 생존 모드 한 판 — 카운트다운 전 무시, 꼴찌 탈락, 2명 겹침은 다시, 마지막 생존자 우승', async (t) => {
  const { url, game } = await startServer(t);
  const { players, host, code } = await makeRoom(t, url, 3);
  const [a, b, c] = players;
  const firstCountdown = waitFor(a.socket, 'nunchi:room:state', (s) => s.game?.phase === 'countdown');
  const firstPlay = playing(a.socket);
  assert.equal((await emitAck(host.socket, 'nunchi:game:start')).ok, true);
  await firstCountdown;
  const early = await emitAck(a.socket, 'nunchi:call');
  assert.equal(early.ok, false); assert.equal(early.code, 'early', '카운트다운 중에는 무시');

  // 늦게 온 사람은 막는다
  const late = await connect(url); t.after(() => late.close());
  assert.equal((await emitAck(late, 'nunchi:room:join', { userId: 'late', nickname: '늦은사람', code })).ok, false);

  // 1라운드: a가 1, b가 2 → c 꼴찌
  await firstPlay;
  const called = waitFor(c.socket, 'nunchi:called');
  assert.deepEqual(await emitAck(a.socket, 'nunchi:call'), { ok: true, number: 1 });
  assert.equal((await called).nickname, '사람0');
  assert.equal((await emitAck(a.socket, 'nunchi:call')).code, 'already');
  await sleep(250);
  const round1 = waitFor(a.socket, 'nunchi:round:result');
  assert.deepEqual(await emitAck(b.socket, 'nunchi:call'), { ok: true, number: 2 });
  const r1 = await round1;
  assert.deepEqual(r1.outs.map((o) => [o.userId, o.why]), [['u2', 'last']]);
  assert.equal(r1.redo, false);

  // 2라운드: 남은 a·b가 동시에 → 겹침, 둘 다 다시. c는 구경이라 못 외침
  await playing(a.socket);
  assert.equal((await emitAck(c.socket, 'nunchi:call')).code, 'not-player');
  const round2 = waitFor(a.socket, 'nunchi:round:result');
  const both = await Promise.all([emitAck(a.socket, 'nunchi:call'), emitAck(b.socket, 'nunchi:call')]);
  assert.deepEqual(both.map((r) => r.number), [1, 1]);
  const r2 = await round2;
  assert.equal(r2.redo, true); assert.equal(r2.clashNumber, 1);

  // 3라운드: b가 먼저 → a 꼴찌 → b 우승
  await playing(a.socket);
  const finished = waitFor(a.socket, 'nunchi:game:finished');
  assert.equal((await emitAck(b.socket, 'nunchi:call')).ok, true);
  const final = await finished;
  assert.deepEqual(final.winners, ['u1']);
  assert.deepEqual(final.ranking.map((p) => [p.userId, p.rank]), [['u1', 1], ['u0', 2], ['u2', 3]]);
  const room = game.rooms.get(code);
  assert.equal(room.state, 'finished');
  assert.equal(room.players.get('u1').wins, 1);
});

test('눈치게임: 점수 모드 — 겹침·시간 초과마다 벌점, 정한 라운드가 끝나면 벌점 적은 사람 우승', async (t) => {
  const { url } = await startServer(t, { roundMs: 500 });
  const { players, host } = await makeRoom(t, url, 4, { mode: 'score', rounds: 3 });
  const [a, b] = players;
  const firstPlay = playing(a.socket);
  assert.equal((await emitAck(host.socket, 'nunchi:game:start')).ok, true);
  await firstPlay;
  const round1 = waitFor(a.socket, 'nunchi:round:result');
  await Promise.all([emitAck(a.socket, 'nunchi:call'), emitAck(b.socket, 'nunchi:call')]);
  assert.deepEqual((await round1).outs.map((o) => o.why), ['clash', 'clash']);
  // 2·3라운드는 아무도 안 눌러 모두 시간 초과
  const final = await waitFor(a.socket, 'nunchi:game:finished', () => true, 6_000);
  assert.deepEqual(final.winners.sort(), ['u2', 'u3']);
  assert.deepEqual(final.ranking.map((p) => [p.userId, p.penalty]).sort(), [['u0', 3], ['u1', 3], ['u2', 2], ['u3', 2]]);
});

test('눈치게임: 게임 중 같은 userId로 다시 들어오면 이어 하고, 나가면 라운드에서 빠진다', async (t) => {
  const { url, game } = await startServer(t, { roundMs: 3000 });
  const { players, host, code } = await makeRoom(t, url, 4);
  const firstPlay = playing(host.socket);
  assert.equal((await emitAck(host.socket, 'nunchi:game:start')).ok, true);
  await firstPlay;
  // u1 새로고침: 새 소켓으로 같은 userId
  players[1].socket.close();
  const again = await connect(url); t.after(() => again.close());
  const rejoin = await emitAck(again, 'nunchi:room:join', { userId: 'u1', nickname: '사람1', code });
  assert.equal(rejoin.ok, true);
  assert.equal((await emitAck(again, 'nunchi:call')).number, 1);
  await sleep(250);
  assert.equal((await emitAck(players[2].socket, 'nunchi:call')).number, 2);
  await sleep(250);
  // u3이 나가면 남은 사람은 u0뿐 → u0이 꼴찌
  const result = waitFor(host.socket, 'nunchi:round:result');
  await emitAck(players[3].socket, 'nunchi:room:leave');
  const r = await result;
  assert.deepEqual(r.outs.map((o) => [o.userId, o.why]), [['u0', 'last']]);
  assert.equal(game.rooms.get(code).players.has('u3'), false);
});
