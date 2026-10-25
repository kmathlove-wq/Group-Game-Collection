const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { io: createClient } = require('socket.io-client');
const { setupLiarGame, tallyVotes, isCorrectGuess, TOPICS } = require('../src/liar');

async function startServer(t, options = {}) {
  const app = express(); const server = http.createServer(app); const io = new Server(server);
  const game = setupLiarGame({ app, io, rootDir: `${__dirname}/..`, ...options });
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
const waitFor = (socket, event, test = () => true) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error(`${event} 기다리다 시간 초과`)), 3_000);
  const handler = (data) => { if (!test(data)) return; clearTimeout(timeout); socket.off(event, handler); resolve(data); };
  socket.on(event, handler);
});

// 사람 수만큼 접속해 방을 만들고 모두 준비시킨 뒤 시작한다. 각자 받은 비밀(제시어)을 함께 돌려준다.
async function startRoom(t, url, count, settings = {}) {
  const players = [];
  for (let i = 0; i < count; i += 1) {
    const socket = await connect(url); t.after(() => socket.close());
    players.push({ socket, userId: `u${i}`, nickname: `사람${i}`, secret: null, state: null });
  }
  for (const p of players) {
    p.socket.on('liar:secret', (data) => { p.secret = data; });
    p.socket.on('liar:room:state', (data) => { p.state = data; });
  }
  const [host, ...guests] = players;
  const created = await emitAck(host.socket, 'liar:room:create', { userId: host.userId, nickname: host.nickname, ...settings });
  assert.equal(created.ok, true);
  for (const g of guests) {
    assert.equal((await emitAck(g.socket, 'liar:room:join', { userId: g.userId, nickname: g.nickname, code: created.code })).ok, true);
    assert.equal((await emitAck(g.socket, 'liar:room:ready', true)).ok, true);
  }
  const secrets = Promise.all(players.map((p) => waitFor(p.socket, 'liar:secret')));
  assert.equal((await emitAck(host.socket, 'liar:game:start')).ok, true);
  await secrets;
  return { players, host, code: created.code };
}

test('라이어: 표 세기 — 최다 득표 한 명만 지목, 동점·무표는 지목 없음', () => {
  assert.equal(tallyVotes(new Map([['a', 'c'], ['b', 'c'], ['c', 'a']])).accusedId, 'c');
  assert.equal(tallyVotes(new Map([['a', 'b'], ['b', 'a']])).accusedId, null);
  assert.equal(tallyVotes(new Map()).accusedId, null);
  assert.deepEqual(tallyVotes(new Map([['a', 'c'], ['b', 'c']])).counts, { c: 2 });
});

test('라이어: 제시어 맞히기는 띄어쓰기·대소문자를 무시한다', () => {
  assert.equal(isCorrectGuess('피 자', '피자'), true);
  assert.equal(isCorrectGuess('pc방', 'PC방'), true);
  assert.equal(isCorrectGuess('피자빵', '피자'), false);
  assert.equal(isCorrectGuess('  ', ''), false);
  for (const words of Object.values(TOPICS)) assert.ok(words.length >= 2 && new Set(words).size === words.length, '주제마다 서로 다른 제시어 2개 이상');
});

test('라이어: 일반 모드 한 판 — 비밀은 각자만, 설명 → 토론 → 투표 → 맞히기 실패면 시민 승리', async (t) => {
  const { url, game } = await startServer(t);
  const { players, host, code } = await startRoom(t, url, 4, { mode: 'normal', topic: '동물' });
  const liar = players.find((p) => p.secret.word === null);
  const citizens = players.filter((p) => p !== liar);
  assert.ok(liar, '라이어 한 명은 제시어를 못 받는다');
  assert.equal(new Set(citizens.map((p) => p.secret.word)).size, 1, '시민은 모두 같은 제시어');
  assert.ok(players.every((p) => p.secret.topic === '동물'));
  const word = citizens[0].secret.word;

  // 모두에게 가는 방 상태에는 제시어·라이어가 없다.
  const room = game.rooms.get(code);
  const shared = JSON.stringify(host.state);
  assert.ok(!shared.includes(word) && !shared.includes('liarId'), '방 상태에 비밀이 새지 않는다');

  // 설명은 정해진 순서대로만, 시민이 제시어를 그대로 말하면 막는다.
  for (const id of room.game.order) {
    const p = players.find((x) => x.userId === id);
    const other = players.find((x) => x !== p);
    assert.equal((await emitAck(other.socket, 'liar:hint', { text: '아무 말' })).ok, false, '내 차례가 아니면 못 낸다');
    if (p !== liar) assert.match((await emitAck(p.socket, 'liar:hint', { text: `이건 ${word} 같아` })).message, /그대로/);
    assert.equal((await emitAck(p.socket, 'liar:hint', { text: `${p.nickname}의 설명` })).ok, true);
  }
  assert.equal(room.game.phase, 'talk');
  assert.equal(room.game.hints.length, 4);
  assert.equal((await emitAck(players.find((p) => p !== host).socket, 'liar:skip-talk')).ok, false, '방장만 토론을 넘긴다');
  assert.equal((await emitAck(host.socket, 'liar:skip-talk')).ok, true);
  assert.equal(room.game.phase, 'vote');

  // 모두 라이어를 찍는다(라이어는 아무나). 자기 자신은 못 찍는다.
  assert.equal((await emitAck(liar.socket, 'liar:vote', { targetId: liar.userId })).ok, false);
  const finished = waitFor(host.socket, 'liar:game:finished');
  await emitAck(liar.socket, 'liar:vote', { targetId: citizens[0].userId });
  for (const c of citizens) await emitAck(c.socket, 'liar:vote', { targetId: liar.userId });
  assert.equal(room.game.phase, 'guess');
  assert.equal(room.game.accusedId, liar.userId);
  assert.equal((await emitAck(citizens[0].socket, 'liar:guess', { text: word })).ok, false, '라이어만 맞힐 수 있다');
  assert.equal((await emitAck(liar.socket, 'liar:guess', { text: '틀린답' })).ok, true);
  const result = await finished;
  assert.equal(result.winner, 'citizens');
  assert.equal(result.word, word);
  assert.equal(result.liarId, liar.userId);
  assert.equal(result.counts[liar.userId], 3);
  assert.deepEqual([...room.players.values()].map((p) => p.score).sort(), [0, 1, 1, 1]);
  assert.equal(room.state, 'finished');
});

test('라이어: 잡힌 라이어가 제시어를 맞히면 라이어 승리(+3점)', async (t) => {
  const { url, game } = await startServer(t);
  const { players, host, code } = await startRoom(t, url, 3, { hintTime: 0 });
  const room = game.rooms.get(code);
  const liar = players.find((p) => p.secret.word === null);
  const word = players.find((p) => p !== liar).secret.word;
  for (const id of room.game.order) await emitAck(players.find((x) => x.userId === id).socket, 'liar:hint', { text: '설명' });
  await emitAck(host.socket, 'liar:skip-talk');
  for (const p of players) await emitAck(p.socket, 'liar:vote', { targetId: p === liar ? players.find((x) => x !== liar).userId : liar.userId });
  const finished = waitFor(host.socket, 'liar:game:finished');
  await emitAck(liar.socket, 'liar:guess', { text: ` ${word} ` });
  assert.equal((await finished).winner, 'liar');
  assert.equal(room.players.get(liar.userId).score, 3);
});

test('라이어: 바보 모드 — 라이어도 다른 제시어를 받고, 엉뚱한 사람을 찍으면 라이어 승리', async (t) => {
  const { url, game } = await startServer(t);
  const { players, host, code } = await startRoom(t, url, 3, { mode: 'fool' });
  const room = game.rooms.get(code);
  assert.ok(players.every((p) => typeof p.secret.word === 'string'), '바보 모드는 모두 제시어를 받는다');
  assert.equal(new Set(players.map((p) => p.secret.word)).size, 2, '라이어만 다른 제시어');
  const liar = players.find((p) => p.userId === room.game.liarId);
  assert.notEqual(liar.secret.word, room.game.word);
  // 라이어는 자기가 받은 (가짜) 제시어를 말하면 막힌다 — 진짜 제시어로 검사하지 않는다.
  for (const id of room.game.order) {
    const p = players.find((x) => x.userId === id);
    if (p === liar && !room.game.word.includes(liar.secret.word)) assert.equal((await emitAck(p.socket, 'liar:hint', { text: room.game.word })).ok, true, '라이어 설명을 진짜 제시어로 막으면 제시어가 새어 나간다');
    else await emitAck(p.socket, 'liar:hint', { text: '설명' });
  }
  await emitAck(host.socket, 'liar:skip-talk');
  const innocent = players.find((p) => p !== liar);
  const finished = waitFor(host.socket, 'liar:game:finished');
  for (const p of players) await emitAck(p.socket, 'liar:vote', { targetId: p === innocent ? liar.userId : innocent.userId });
  const result = await finished;
  assert.equal(result.winner, 'liar');
  assert.equal(result.foolWord, liar.secret.word);
});

test('라이어: 설명 시간이 지나면 다음 사람, 라이어가 나가면 그 판은 무효', async (t) => {
  const { url, game } = await startServer(t, { secondMs: 5 }); // 20초 = 0.1초
  const { players, host, code } = await startRoom(t, url, 3, { hintTime: 20, talkTime: 60 });
  const room = game.rooms.get(code);
  const firstId = room.game.order[0];
  await waitFor(host.socket, 'liar:room:state', (s) => s.game?.hints.length >= 1);
  assert.equal(room.game.hints[0].userId, firstId);
  assert.equal(room.game.hints[0].skipped, true);

  const liar = players.find((p) => p.userId === room.game.liarId);
  const watcher = players.find((p) => p !== liar);
  const finished = waitFor(watcher.socket, 'liar:game:finished');
  await emitAck(liar.socket, 'liar:room:leave');
  const result = await finished;
  assert.equal(result.winner, null);
  assert.ok([...room.players.values()].every((p) => p.score === 0));
});
