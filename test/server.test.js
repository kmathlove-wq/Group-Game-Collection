const test = require('node:test');
const assert = require('node:assert/strict');
const { io: createClient } = require('socket.io-client');
const { server, io, rooms, normalizeAnswer, validateNickname, normalizeSettings } = require('../server');

function emitAck(socket, event, payload = {}) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${event} 응답 시간 초과`)), 2_000);
    socket.emit(event, payload, (result) => { clearTimeout(timeout); resolve(result); });
  });
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = createClient(url, { transports: ['websocket'], forceNew: true });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

test('입력 정규화와 설정 범위를 서버에서 제한한다', () => {
  assert.equal(normalizeAnswer('  자전   거 ', true), '자전거');
  assert.equal(normalizeAnswer('  HELLO   World ', false), 'hello world');
  assert.equal(validateNickname('   '), '닉네임을 입력해 주세요.');
  assert.equal(validateNickname('<그림왕🎨!>'), null);
  assert.equal(validateNickname('그림왕-1'), null);
  assert.deepEqual(normalizeSettings({ maxPlayers: 99, roundTime: 17, totalRounds: 0 }).maxPlayers, 30);
  assert.equal(normalizeSettings({ roundTime: 17 }).roundTime, 60);
});

test('방 생성부터 비밀 제시어, 권한, 서버 정답 판정까지 동작한다', async (t) => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}`;
  const host = await connect(url);
  const guest = await connect(url);
  const duplicate = await connect(url);
  t.after(async () => {
    host.disconnect(); guest.disconnect(); duplicate.disconnect();
    rooms.clear();
    await new Promise((resolve) => io.close(resolve));
  });

  const created = await emitAck(host, 'room:create', {
    userId: 'host-id', nickname: '방장님',
    settings: { title: '통합 테스트', maxPlayers: 3, roundTime: 30, totalRounds: 1 }
  });
  assert.equal(created.ok, true);
  assert.match(created.code, /^[A-Z0-9]{6}$/);

  const joined = await emitAck(guest, 'room:join', { code: created.code, userId: 'guest-id', nickname: '정답왕' });
  assert.equal(joined.ok, true);
  const duplicateResult = await emitAck(duplicate, 'room:join', { code: created.code, userId: 'other-id', nickname: '정답왕' });
  assert.equal(duplicateResult.ok, false);
  assert.match(duplicateResult.error, /닉네임/);

  let leakedAnswer = false;
  guest.on('game:secret', () => { leakedAnswer = true; });
  const hostSecret = new Promise((resolve) => host.once('game:secret', resolve));
  const started = await emitAck(host, 'game:start', {
    drawerMode: 'selected', drawerId: 'host-id', wordMode: 'custom', customWord: '자전거', acceptedAnswers: ['두발자전거']
  });
  assert.equal(started.ok, true);
  assert.equal((await hostSecret).answer, '자전거');
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(leakedAnswer, false, '일반 참가자에게 정답 문자열을 보내면 안 된다');

  const rejectedDraw = await emitAck(guest, 'canvas:draw', {
    strokeId: 'bad', segments: [{ fromX: 0, fromY: 0, toX: 1, toY: 1, color: '#000000', width: 5, tool: 'pen' }]
  });
  assert.equal(rejectedDraw.ok, false);
  const acceptedDraw = await emitAck(host, 'canvas:draw', {
    strokeId: 'good', segments: [{ fromX: 0.1, fromY: 0.2, toX: 0.3, toY: 0.4, color: '#000000', width: 5, tool: 'pen' }]
  });
  assert.equal(acceptedDraw.ok, true);

  const drawerGuess = await emitAck(host, 'chat:send', { text: '자전거' });
  assert.equal(drawerGuess.ok, false);
  const answer = await emitAck(guest, 'chat:send', { text: ' 자 전 거 ' });
  assert.equal(answer.ok, true);
  assert.equal(answer.correct, true);
  const room = rooms.get(created.code);
  assert.ok(room.players.get('guest-id').score >= 100);
  assert.equal(room.players.get('host-id').score, 10);
  assert.equal(room.state, 'finished');
});
