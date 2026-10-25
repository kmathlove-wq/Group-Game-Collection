const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { io: createClient } = require('socket.io-client');
const { setupMafiaGame, assignRoles, winnerOf, tallyVotes, mafiaCount } = require('../src/mafia');

async function startServer(t, options = {}) {
  const app = express(); const server = http.createServer(app); const io = new Server(server);
  const game = setupMafiaGame({ app, io, rootDir: `${__dirname}/..`, secondMs: 5, ...options }); // 1초 = 0.005초
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
const waitFor = (socket, event, check = () => true) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error(`${event} 기다리다 시간 초과`)), 5_000);
  const handler = (data) => { if (!check(data)) return; clearTimeout(timeout); socket.off(event, handler); resolve(data); };
  socket.on(event, handler);
});

// 사람 수만큼 접속해 방을 만들고 시작한다. 직업별로 찾기 쉽게 byRole을 함께 돌려준다.
async function startRoom(t, url, count) {
  const players = [];
  for (let i = 0; i < count; i += 1) {
    const socket = await connect(url); t.after(() => socket.close());
    const p = { socket, userId: `u${i}`, nickname: `사람${i}`, secret: null, state: null, chats: [] };
    socket.on('mafia:secret', (data) => { p.secret = data; });
    socket.on('mafia:room:state', (data) => { p.state = data; });
    socket.on('mafia:chat:message', (m) => p.chats.push(m));
    players.push(p);
  }
  const [host, ...guests] = players;
  const { code } = await emitAck(host.socket, 'mafia:room:create', { userId: host.userId, nickname: host.nickname });
  for (const g of guests) {
    assert.equal((await emitAck(g.socket, 'mafia:room:join', { userId: g.userId, nickname: g.nickname, code })).ok, true);
    await emitAck(g.socket, 'mafia:room:ready', true);
  }
  const secrets = Promise.all(players.map((p) => waitFor(p.socket, 'mafia:secret', (s) => s.role)));
  assert.equal((await emitAck(host.socket, 'mafia:game:start')).ok, true);
  await secrets;
  const byRole = (role) => players.filter((p) => p.secret.role === role);
  return { players, host, code, byRole };
}

test('마피아: 인원별 마피아 수와 직업 나누기', () => {
  assert.deepEqual([4, 6, 7, 9, 10, 12].map(mafiaCount), [1, 1, 2, 2, 3, 3]);
  for (const n of [4, 7, 12]) {
    const roles = [...assignRoles(Array.from({ length: n }, (_, i) => `p${i}`)).values()];
    assert.equal(roles.filter((r) => r === 'mafia').length, mafiaCount(n));
    assert.equal(roles.filter((r) => r === 'doctor').length, 1);
    assert.equal(roles.filter((r) => r === 'police').length, 1);
    assert.equal(roles.length, n);
  }
});

test('마피아: 이긴 쪽 판정과 표 세기(기권이 가장 많으면 아무도 안 나감)', () => {
  const roles = new Map([['m', 'mafia'], ['d', 'doctor'], ['p', 'police'], ['c', 'citizen']]);
  assert.equal(winnerOf(roles, new Set(['m', 'd', 'p', 'c'])), null);
  assert.equal(winnerOf(roles, new Set(['m', 'd'])), 'mafia');
  assert.equal(winnerOf(roles, new Set(['d', 'p'])), 'citizens');
  assert.equal(tallyVotes(new Map([['a', 'm'], ['b', 'm'], ['c', 'skip']])).executedId, 'm');
  assert.equal(tallyVotes(new Map([['a', 'skip'], ['b', 'skip'], ['c', 'm']])).executedId, null);
  assert.equal(tallyVotes(new Map([['a', 'm'], ['b', 'c']])).executedId, null);
});

test('마피아: 한 판 — 직업은 각자만, 밤 공격·경찰 조사·마피아 채팅, 투표로 마피아를 찾으면 시민 승리', async (t) => {
  const { url, game } = await startServer(t, { secondMs: 20 }); // 밤 30초 = 0.6초(밤 동안 채팅을 시험할 여유)
  const { players, host, code, byRole } = await startRoom(t, url, 4);
  const [mafia] = byRole('mafia'); const [doctor] = byRole('doctor'); const [police] = byRole('police'); const [citizen] = byRole('citizen');
  assert.ok(mafia && doctor && police && citizen);
  const room = game.rooms.get(code);
  assert.equal(room.game.phase, 'night');
  assert.deepEqual(mafia.secret.mafiaIds, [mafia.userId]);
  assert.equal(citizen.secret.mafiaIds, null, '시민은 마피아를 모른다');

  // 모두에게 가는 방 상태에는 살아 있는 사람의 직업이 없다.
  assert.ok(host.state.players.every((p) => p.role === null));

  // 밤: 시민은 말 못 하고, 마피아의 말은 마피아만 듣는다.
  assert.match((await emitAck(citizen.socket, 'mafia:chat:send', { text: '안녕' })).message, /조용히/);
  assert.equal((await emitAck(mafia.socket, 'mafia:chat:send', { text: '누구 노릴까' })).audience, 'mafia');
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(mafia.chats.some((m) => m.text === '누구 노릴까'));
  assert.ok(!citizen.chats.some((m) => m.text === '누구 노릴까'), '시민에게 마피아 대화가 새면 안 된다');

  assert.equal((await emitAck(citizen.socket, 'mafia:act', { targetId: mafia.userId })).ok, false, '시민은 밤에 할 일이 없다');
  assert.equal((await emitAck(mafia.socket, 'mafia:act', { targetId: mafia.userId })).ok, false, '마피아끼리는 못 노린다');
  const checked = await emitAck(police.socket, 'mafia:act', { targetId: mafia.userId });
  assert.equal(checked.investigation.isMafia, true);
  assert.equal((await emitAck(police.socket, 'mafia:act', { targetId: doctor.userId })).ok, false, '조사는 밤마다 한 번');
  await emitAck(doctor.socket, 'mafia:act', { targetId: doctor.userId });
  const morning = waitFor(host.socket, 'mafia:room:state', (s) => s.game?.phase === 'morning');
  await emitAck(mafia.socket, 'mafia:act', { targetId: citizen.userId }); // 할 일을 다 하면 밤이 일찍 끝난다
  const after = await morning;
  assert.equal(after.game.alive.includes(citizen.userId), false);
  assert.equal(after.players.find((p) => p.userId === citizen.userId).role, 'citizen', '죽은 사람의 직업은 공개');
  const seen = citizen.secret.roles ? citizen.secret : await waitFor(citizen.socket, 'mafia:secret', (x) => x.roles);
  assert.equal(seen.roles[mafia.userId], 'mafia', '죽은 사람은 모두의 직업을 본다');

  // 죽은 사람의 말은 죽은 사람끼리만.
  await waitFor(host.socket, 'mafia:room:state', (s) => s.game?.phase === 'day');
  assert.equal((await emitAck(citizen.socket, 'mafia:chat:send', { text: '나 죽었어' })).audience, 'dead');
  assert.equal((await emitAck(police.socket, 'mafia:chat:send', { text: '마피아 찾았어' })).audience, 'all');

  // 투표: 살아 있는 셋이 마피아를 찍으면 시민 승리.
  await waitFor(host.socket, 'mafia:room:state', (s) => s.game?.phase === 'vote');
  assert.ok(!doctor.chats.some((m) => m.text === '나 죽었어'), '산 사람에게 죽은 사람 대화가 새면 안 된다');
  assert.equal((await emitAck(citizen.socket, 'mafia:vote', { targetId: mafia.userId })).ok, false, '죽은 사람은 투표 못 함');
  const finished = waitFor(host.socket, 'mafia:game:finished');
  await emitAck(mafia.socket, 'mafia:vote', { targetId: police.userId });
  await emitAck(doctor.socket, 'mafia:vote', { targetId: mafia.userId });
  await emitAck(police.socket, 'mafia:vote', { targetId: mafia.userId });
  const result = await finished;
  assert.equal(result.winner, 'citizens');
  assert.equal(result.roles[mafia.userId], 'mafia');
  assert.equal(room.state, 'finished');
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(players.every((p) => p.secret.roles), '게임이 끝나면 모두 직업을 본다');
});

test('마피아: 의사가 지키면 살고, 마피아 수가 나머지와 같아지면 마피아 승리', async (t) => {
  const { url, game } = await startServer(t);
  const { host, code, byRole } = await startRoom(t, url, 4);
  const [mafia] = byRole('mafia'); const [doctor] = byRole('doctor'); const [police] = byRole('police'); const [citizen] = byRole('citizen');
  const room = game.rooms.get(code);

  // 1일째 밤: 의사가 노린 사람을 지켜서 아무도 안 죽는다.
  await emitAck(police.socket, 'mafia:act', { targetId: citizen.userId });
  await emitAck(doctor.socket, 'mafia:act', { targetId: citizen.userId });
  await emitAck(mafia.socket, 'mafia:act', { targetId: citizen.userId });
  assert.equal(room.game.alive.size, 4);
  assert.match(room.game.news.at(-1).text, /살려/);

  // 낮 투표에서 모두 기권 → 아무도 안 나감 → 2일째 밤.
  await waitFor(host.socket, 'mafia:room:state', (s) => s.game?.phase === 'vote');
  for (const p of [mafia, doctor, police, citizen]) await emitAck(p.socket, 'mafia:vote', { targetId: 'skip' });
  await waitFor(host.socket, 'mafia:room:state', (s) => s.game?.phase === 'night' && s.game.day === 2);
  assert.equal(room.game.alive.size, 4);

  // 2일째 밤: 시민을 잃으면 3명(마피아 1 : 2) — 아직 계속, 3일째에 의사를 잃으면 1:1 → 마피아 승리.
  await emitAck(mafia.socket, 'mafia:act', { targetId: citizen.userId });
  await emitAck(doctor.socket, 'mafia:act', { targetId: doctor.userId });
  await emitAck(police.socket, 'mafia:act', { targetId: mafia.userId });
  assert.equal(room.game.alive.has(citizen.userId), false);
  await waitFor(host.socket, 'mafia:room:state', (s) => s.game?.phase === 'vote');
  for (const p of [mafia, doctor, police]) await emitAck(p.socket, 'mafia:vote', { targetId: 'skip' });
  await waitFor(host.socket, 'mafia:room:state', (s) => s.game?.phase === 'night' && s.game.day === 3);
  const finished = waitFor(host.socket, 'mafia:game:finished');
  await emitAck(mafia.socket, 'mafia:act', { targetId: doctor.userId });
  await emitAck(doctor.socket, 'mafia:act', { targetId: police.userId });
  await emitAck(police.socket, 'mafia:act', { targetId: doctor.userId }).catch(() => {});
  assert.equal((await finished).winner, 'mafia');
});

test('마피아: 게임 중 마피아가 나가면 직업이 공개되고 시민 승리', async (t) => {
  const { url } = await startServer(t);
  const { players, byRole } = await startRoom(t, url, 4);
  const [mafia] = byRole('mafia');
  const watcher = players.find((p) => p !== mafia);
  const finished = waitFor(watcher.socket, 'mafia:game:finished');
  await emitAck(mafia.socket, 'mafia:room:leave');
  assert.equal((await finished).winner, 'citizens');
});
