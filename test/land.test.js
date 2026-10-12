const test = require('node:test');
const assert = require('node:assert/strict');
const { io: createClient } = require('socket.io-client');
const { createArena } = require('../src/land/arena');
const { botTarget } = require('../src/land/bot');

const RIGHT = 0; const DOWN = Math.PI / 2; const LEFT = Math.PI; const UP = -Math.PI / 2;
// 시험용 판: 한 틱에 한 칸, 방향은 바로 꺾임(곡선 없이 계산하기 쉽게)
const fresh = (options = {}) => createArena({ size: 60, speed: 1, turnRate: Math.PI, startRadius: 3, invulnerableTicks: 0, ...options });
// 정해진 방향으로 n틱 움직인다.
function go(arena, player, angle, n, others = () => {}) {
  let result;
  for (let i = 0; i < n; i += 1) { arena.steer(player.id, angle); others(); result = arena.tick(); }
  return result;
}

test('색칠 땅따먹기: 한 바퀴 돌아오면 꼬리와 둘러싼 곳이 내 땅이 된다', () => {
  const arena = fresh();
  const a = arena.addPlayer({ nickname: 'A' });
  arena.spawnAt(a, 20, 20, RIGHT);
  const start = arena.counts[a.id];
  go(arena, a, RIGHT, 8);
  assert.equal(a.outside, true);
  assert.equal(arena.trail[arena.cellOf(26.5, 20)], a.id);
  go(arena, a, DOWN, 8); go(arena, a, LEFT, 8);
  let result;
  for (let i = 0; i < 6 && a.outside; i += 1) result = go(arena, a, UP, 1);
  assert.equal(a.outside, false);
  assert.equal(arena.trail[arena.cellOf(26.5, 20)], 0);
  assert.equal(arena.owner[arena.cellOf(25, 25)], a.id); // 둘러싼 안쪽도 채워짐
  assert.ok(arena.counts[a.id] > start + 60);
  assert.ok(result.events.some((e) => e.type === 'capture' && e.gained > 60));
  assert.ok(result.owner.length >= 3 && result.owner.length % 3 === 0); // [시작, 길이, 주인] 묶음
});

test('색칠 땅따먹기: 판 끝에 닿으면 탈락하지 않고 벽을 따라 움직인다', () => {
  const arena = fresh();
  const a = arena.addPlayer({ nickname: 'A' });
  arena.spawnAt(a, 4, 20, LEFT);
  go(arena, a, LEFT, 10);
  assert.equal(a.alive, true);
  assert.ok(a.x < 0.1);
  go(arena, a, UP + 0.3, 5); // 벽 쪽으로 비스듬히 가도 위로 미끄러진다
  assert.equal(a.alive, true);
  assert.ok(a.y < 17);
});

test('색칠 땅따먹기: 내 꼬리를 밟으면 탈락하고 땅이 사라진다', () => {
  const arena = fresh();
  const a = arena.addPlayer({ nickname: 'A' });
  arena.spawnAt(a, 20, 20, RIGHT);
  go(arena, a, RIGHT, 10); go(arena, a, DOWN, 4); go(arena, a, LEFT, 4);
  let result;
  for (let i = 0; i < 6 && a.alive; i += 1) result = go(arena, a, UP, 1);
  assert.equal(a.alive, false);
  assert.equal(arena.counts[a.id], 0);
  assert.ok(result.events.some((e) => e.type === 'death' && e.reason === 'self'));
});

test('색칠 땅따먹기: 남의 꼬리를 밟으면 그 사람이 탈락하고, 무적이면 산다', () => {
  for (const invulnerableTicks of [0, 100]) {
    const arena = fresh({ invulnerableTicks });
    const a = arena.addPlayer({ nickname: 'A' });
    const b = arena.addPlayer({ nickname: 'B' });
    arena.spawnAt(a, 10, 10, RIGHT);
    arena.spawnAt(b, 16, 30, UP);
    let events = [];
    for (let i = 0; i < 22 && a.alive; i += 1) {
      arena.steer(a.id, RIGHT); arena.steer(b.id, UP);
      events = events.concat(arena.tick().events);
    }
    if (invulnerableTicks) { assert.equal(a.alive, true); continue; }
    assert.equal(a.alive, false);
    assert.equal(b.alive, true);
    assert.equal(b.kills, 1);
    assert.ok(events.some((e) => e.type === 'death' && e.id === a.id && e.by === b.id && e.reason === 'cut'));
  }
});

test('색칠 땅따먹기: 땅을 모두 빼앗기면 탈락한다', () => {
  const arena = fresh();
  const a = arena.addPlayer({ nickname: 'A' });
  const b = arena.addPlayer({ nickname: 'B' });
  arena.spawnAt(a, 10, 10, RIGHT);
  arena.spawnAt(b, 22, 15, RIGHT);
  const spinB = () => arena.steer(b.id, (arena.tickNo % 4) * Math.PI / 2); // B는 자기 땅 안에서 작은 네모를 돈다
  go(arena, a, RIGHT, 20, spinB); go(arena, a, DOWN, 10, spinB); go(arena, a, LEFT, 20, spinB);
  for (let i = 0; i < 10 && a.outside; i += 1) go(arena, a, UP, 1, spinB);
  assert.equal(a.alive, true);
  assert.equal(b.alive, false);
  assert.equal(arena.counts[b.id], 0);
});

test('색칠 땅따먹기: 봇은 혼자 놀면서 탈락하지 않고 땅을 넓힌다', () => {
  const arena = createArena({ size: 120 });
  const bot = arena.addPlayer({ nickname: '봇', bot: true });
  arena.spawnAt(bot, 60, 60, 0);
  const start = arena.counts[bot.id];
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 600; i += 1) {
    arena.steer(bot.id, botTarget(arena, bot, random));
    arena.tick();
    assert.equal(bot.alive, true, `${i}번째 틱에 봇이 탈락`);
    assert.ok(bot.trailPoints.length < 120, '꼬리가 너무 길다');
  }
  assert.ok(arena.counts[bot.id] > start * 3, '봇이 땅을 넓혔다');
});

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

test('색칠 땅따먹기: 접속하면 판을 받고, 시작하면 봇과 함께 움직인다', async (t) => {
  const { server, io, landGame } = require('../server');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const one = await connect(url); const two = await connect(url);
  t.after(async () => {
    one.close(); two.close(); landGame.close();
    await new Promise((resolve) => io.close(resolve));
  });

  const entered = await emitAck(one, 'land:enter', { userId: 'land-one' });
  assert.equal(entered.ok, true);
  assert.equal(entered.snapshot.size, 360);
  assert.equal(entered.snapshot.owner.byteLength, 360 * 360);
  assert.equal((await emitAck(one, 'land:play', { nickname: '  ' })).ok, false);
  const played = await emitAck(one, 'land:play', { nickname: '하나' });
  assert.equal(played.ok, true);
  assert.equal(landGame.bots.size, 5); // 사람 1 + 봇 5 = 6

  // 다른 사람은 판에 들어오기 전엔 시작할 수 없다.
  assert.equal((await emitAck(two, 'land:play', { nickname: '둘' })).ok, false);
  await emitAck(two, 'land:enter', { userId: 'land-two' });
  assert.equal((await emitAck(two, 'land:play', { nickname: '둘' })).ok, true);
  assert.equal(landGame.bots.size, 4);

  // 몇 틱 기다리며 봇이 실제로 움직이는지 본다(봇은 첫 틱에 태어나고 다음 틱부터 움직인다).
  const ticks = await new Promise((resolve) => {
    const got = [];
    one.on('land:tick', (tick) => { got.push(tick); if (got.length === 5) { one.off('land:tick'); resolve(got); } });
  });
  assert.ok(ticks[4].p.some(([id]) => id === played.you));
  const botId = [...landGame.bots.keys()][0];
  const at = (tick) => tick.p.find(([id]) => id === botId);
  assert.ok(at(ticks[1]) && at(ticks[4]));
  assert.notDeepEqual(at(ticks[1]).slice(1, 3), at(ticks[4]).slice(1, 3));
  one.emit('land:steer', 'abc'); // 이상한 값은 무시
  one.emit('land:steer', 1.5);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(landGame.arena.players.get(played.you).target, 1.5);

  // 한 바퀴 돌아 땅을 얻으면 그 사람에게만 효과음용 land:gain이 온다.
  const me = landGame.arena.players.get(played.you);
  landGame.arena.spawnAt(me, 60, 300, 0);
  me.invUntil = landGame.arena.tickNo + 1000; // 봇에게 잡히지 않게
  let otherGain = false; two.on('land:gain', () => { otherGain = true; });
  const gained = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('land:gain이 오지 않음')), 6_000);
    let n = 0;
    one.on('land:tick', () => {
      n += 1;
      const angle = n < 8 ? 0 : n < 14 ? Math.PI / 2 : n < 22 ? Math.PI : -Math.PI / 2;
      one.emit('land:steer', angle);
    });
    one.once('land:gain', (data) => { clearTimeout(timer); one.off('land:tick'); resolve(data); });
  });
  assert.ok(gained.gained > 20);
  assert.equal(otherGain, false);

  await emitAck(two, 'land:leave');
  assert.equal(landGame.humans.has('land-two'), false);
  assert.equal(landGame.bots.size, 5);
});
