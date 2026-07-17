const test = require('node:test');
const assert = require('node:assert/strict');
const { io: createClient } = require('socket.io-client');
const {
  server, io, rooms, normalizeAnswer, validateNickname, normalizeSettings, canSeeSecret, validateCustomWordList
} = require('../server');

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
  assert.equal(normalizeSettings({}).hostParticipates, false);
  assert.equal(normalizeSettings({ hostParticipates: true }).hostParticipates, true);
  assert.match(validateCustomWordList(Array(9).fill('단어')).error, /10개 이상/);
  assert.match(validateCustomWordList(['사 과', '사과', ...Array.from({ length: 8 }, (_, i) => `단어${i}`)]).error, /중복/);
  assert.equal(validateCustomWordList(Array.from({ length: 10 }, (_, i) => `단어${i}`)).words.length, 10);

  const room = { hostId: 'host-id', settings: { hostParticipates: false }, game: { drawerId: 'drawer-id' } };
  assert.equal(canSeeSecret(room, 'host-id'), true);
  assert.equal(canSeeSecret(room, 'drawer-id'), true);
  assert.equal(canSeeSecret(room, 'guest-id'), false);
  room.settings.hostParticipates = true;
  assert.equal(canSeeSecret(room, 'host-id'), false);
  assert.equal(canSeeSecret(room, 'drawer-id'), true);
});

test('게임에 참여하는 방장에게 정답을 숨기고 점수와 권한을 적용한다', async (t) => {
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
    settings: { title: '통합 테스트', maxPlayers: 3, roundTime: 30, totalRounds: 1, hostParticipates: true }
  });
  assert.equal(created.ok, true);
  assert.match(created.code, /^[A-Z0-9]{6}$/);

  const joined = await emitAck(guest, 'room:join', { code: created.code, userId: 'guest-id', nickname: '정답왕' });
  assert.equal(joined.ok, true);
  const duplicateResult = await emitAck(duplicate, 'room:join', { code: created.code, userId: 'other-id', nickname: '정답왕' });
  assert.equal(duplicateResult.ok, false);
  assert.match(duplicateResult.error, /닉네임/);

  let leakedAnswer = false;
  host.on('game:secret', () => { leakedAnswer = true; });
  const rejectedWordMode = await emitAck(host, 'game:start', {
    drawerMode: 'selected', drawerId: 'guest-id', wordMode: 'custom', customWord: '자전거'
  });
  assert.equal(rejectedWordMode.ok, false);
  assert.match(rejectedWordMode.error, /무작위 제시어/);

  const guestSecret = new Promise((resolve) => guest.once('game:secret', resolve));
  const customWords = Array.from({ length: 10 }, (_, index) => `사용자단어${index + 1}`);
  const started = await emitAck(host, 'game:start', {
    drawerMode: 'selected', drawerId: 'guest-id', wordMode: 'customList', customWords
  });
  assert.equal(started.ok, true);
  const { answer } = await guestSecret;
  assert.ok(customWords.includes(answer));
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(leakedAnswer, false, '게임에 참여하는 방장에게 정답 문자열을 보내면 안 된다');

  const rejectedDraw = await emitAck(host, 'canvas:draw', {
    strokeId: 'bad', segments: [{ fromX: 0, fromY: 0, toX: 1, toY: 1, color: '#000000', width: 5, tool: 'pen' }]
  });
  assert.equal(rejectedDraw.ok, false);
  const acceptedDraw = await emitAck(guest, 'canvas:draw', {
    strokeId: 'good', segments: [{ fromX: 0.1, fromY: 0.2, toX: 0.3, toY: 0.4, color: '#000000', width: 5, tool: 'pen' }]
  });
  assert.equal(acceptedDraw.ok, true);

  const drawerGuess = await emitAck(guest, 'chat:send', { text: answer });
  assert.equal(drawerGuess.ok, false);
  const correct = await emitAck(host, 'chat:send', { text: answer });
  assert.equal(correct.ok, true);
  assert.equal(correct.correct, true);
  const room = rooms.get(created.code);
  assert.ok(room.players.get('host-id').score >= 100);
  assert.equal(room.players.get('guest-id').score, 10);
  assert.equal(room.state, 'finished');

  assert.equal((await emitAck(host, 'game:restart')).ok, true);
  const secondGuest = await emitAck(duplicate, 'room:join', {
    code: created.code, userId: 'other-id', nickname: '그림친구'
  });
  assert.equal(secondGuest.ok, true);
  const observerSettings = await emitAck(host, 'room:settings', { hostParticipates: false });
  assert.equal(observerSettings.ok, true);

  const observerSecret = new Promise((resolve) => host.once('game:secret', resolve));
  const roundEnded = new Promise((resolve) => duplicate.once('round:ended', resolve));
  const observerRound = await emitAck(host, 'game:start', {
    drawerMode: 'selected', drawerId: 'guest-id', wordMode: 'custom', customWord: '자전거'
  });
  assert.equal(observerRound.ok, true);
  assert.equal((await observerSecret).answer, '자전거');
  const observerGuess = await emitAck(host, 'chat:send', { text: '자전거' });
  assert.equal(observerGuess.ok, false);
  assert.match(observerGuess.error, /진행 전용 방장/);
  const secondAnswer = await emitAck(duplicate, 'chat:send', { text: '자 전 거' });
  assert.equal(secondAnswer.correct, true);
  const result = await roundEnded;
  assert.equal(result.ranking.some((entry) => entry.userId === 'host-id'), false);
});
