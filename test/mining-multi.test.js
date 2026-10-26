const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { Server } = require('socket.io');
const { io: createClient } = require('socket.io-client');
const Rules = require('../public/mining-tycoon/js/rules.js');
const Game = require('../public/mining-tycoon/js/game.js');
const { setupMiningMulti, MAX_PLAYERS, CELLS } = require('../src/mining-tycoon/multi');

const TILE = Rules.TILE;

async function startServer(t, options = {}) {
  const server = http.createServer();
  const io = new Server(server, { maxHttpBufferSize: 200_000 });
  const multi = setupMiningMulti({ io, ...options });
  await new Promise((resolve) => server.listen(0, resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const clients = [];
  t.after(() => { clients.forEach((c) => c.close()); io.close(); server.close(); });
  const connect = async () => {
    const c = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false });
    clients.push(c);
    await new Promise((resolve) => c.on('connect', resolve));
    return c;
  };
  return { connect, multi };
}

const call = (c, event, data) => new Promise((resolve) => c.emit(event, data, resolve));
const next = (c, event) => new Promise((resolve) => c.once(event, resolve));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function hostWorld() {
  const s = Game.newGame({ seed: 12345, name: '방장' });
  return { s, tiles: s.world.tiles, ores: s.world.ores };
}

test('👫 멀티: 방장이 땅을 올리면 친구가 코드로 들어와 같은 땅을 받고, 판 칸·차 위치가 서로 전해진다', async (t) => {
  const { connect } = await startServer(t);
  const host = await connect();
  const { tiles, ores } = hostWorld();
  const made = await call(host, 'mt:host', { name: '방장', tiles, ores });
  assert.equal(made.ok, true);
  assert.match(made.code, /^[A-HJ-NP-Z2-9]{4}$/);

  const guest = await connect();
  const joinedNotice = next(host, 'mt:joined');
  const joined = await call(guest, 'mt:join', { name: '친구', code: made.code.toLowerCase() }); // 소문자로 써도 된다
  assert.equal(joined.ok, true);
  assert.equal((await joinedNotice).name, '친구');
  assert.deepEqual([...new Uint8Array(joined.tiles)].slice(0, 200), [...tiles].slice(0, 200));
  assert.equal(new Uint8Array(joined.ores).length, CELLS);
  assert.equal(joined.players.length, 2);
  assert.notEqual(joined.color, made.color);

  // 친구가 판 칸 → 방장에게
  const gotTiles = next(host, 'mt:tiles');
  guest.emit('mt:tiles', [[100, TILE.EMPTY, 0], [-1, 0, 0], [101, 99, 0]]); // 이상한 칸은 버린다
  assert.deepEqual(await gotTiles, [[100, TILE.EMPTY, 0]]);

  // 방장 차 위치 → 친구에게
  const gotMove = next(guest, 'mt:move');
  host.emit('mt:move', { x: 5.123, y: 3.5, f: -1, d: 1, t: 0, l: 2, h: 0 });
  const move = await gotMove;
  assert.equal(move.id, 0);
  assert.equal(move.x, 5.12);
  assert.equal(move.d, 1);

  // 서버 땅에도 적혀 있어 나중에 온 친구는 바뀐 땅을 받는다
  const late = await connect();
  const lateJoin = await call(late, 'mt:join', { name: '늦게 온 친구', code: made.code });
  assert.equal(new Uint8Array(lateJoin.tiles)[100], TILE.EMPTY);
  assert.equal(lateJoin.players.find((p) => p.id === 0).pos.x, 5.12); // 방장 자리도 바로 보인다
});

test('👫 멀티: 최대 4명, 없는 코드·이상한 땅은 거절', async (t) => {
  const { connect } = await startServer(t);
  const host = await connect();
  assert.equal((await call(host, 'mt:host', { name: 'x', tiles: new Uint8Array(10), ores: new Uint8Array(10) })).ok, false);
  const { tiles, ores } = hostWorld();
  const made = await call(host, 'mt:host', { name: '방장', tiles, ores });
  assert.equal((await call(await connect(), 'mt:join', { name: 'a', code: 'ZZZZ' })).ok, false);
  for (let i = 1; i < MAX_PLAYERS; i++) assert.equal((await call(await connect(), 'mt:join', { name: 'f' + i, code: made.code })).ok, true);
  const full = await call(await connect(), 'mt:join', { name: '다섯째', code: made.code });
  assert.equal(full.ok, false);
  assert.match(full.message, /꽉 찼어요/);
});

test('👫 멀티: 친구가 나가면 알리고, 방장이 나가면 방이 닫혀 친구는 집으로', async (t) => {
  const { connect, multi } = await startServer(t);
  const host = await connect();
  const { tiles, ores } = hostWorld();
  const made = await call(host, 'mt:host', { name: '방장', tiles, ores });
  const a = await connect();
  const b = await connect();
  await call(a, 'mt:join', { name: 'A', code: made.code });
  await call(b, 'mt:join', { name: 'B', code: made.code });

  const left = next(host, 'mt:left');
  await call(a, 'mt:leave', {});
  assert.equal((await left).name, 'A');

  const closed = next(b, 'mt:closed');
  await call(host, 'mt:leave', {});
  assert.equal((await closed).reason, 'host-left');
  assert.equal(multi.rooms.size, 0);
});

test('👫 멀티: 연결이 끊겨도 잠깐 안에는 열쇠로 같은 자리에 돌아오고, 오래 끊긴 방장은 방을 닫는다', async (t) => {
  const { connect, multi } = await startServer(t, { graceMs: 200 });
  const host = await connect();
  const { tiles, ores } = hostWorld();
  const made = await call(host, 'mt:host', { name: '방장', tiles, ores });
  const guest = await connect();
  const joined = await call(guest, 'mt:join', { name: '친구', code: made.code });

  guest.close();
  await wait(50);
  host.emit('mt:tiles', [[5, TILE.EMPTY, 0]]); // 친구가 없는 사이에 바뀐 칸
  await wait(50);
  const again = await connect();
  const back = await call(again, 'mt:rejoin', { code: made.code, key: joined.key });
  assert.equal(back.ok, true);
  assert.equal(back.you, joined.you);
  assert.equal(new Uint8Array(back.tiles)[5], TILE.EMPTY);
  assert.equal((await call(await connect(), 'mt:rejoin', { code: made.code, key: 'nope' })).ok, false);

  const closed = next(again, 'mt:closed');
  host.close();
  assert.equal((await closed).reason, 'host-gone');
  assert.equal(multi.rooms.size, 0);
});

test('👫 멀티 규칙: 놀러 온 친구는 방장 보물을 못 캐고, 넓게 파도 보물은 남는다', () => {
  const s = Game.newGame({ seed: 7 });
  const w = s.world;
  const t = w.tiles.indexOf(TILE.TREASURE);
  const tx = t % w.w, ty = Math.floor(t / w.w);
  for (let y = 0; y < ty; y++) w.tiles[y * w.w + tx] = TILE.EMPTY;
  s.levels.drill = 4;
  s.guest = true;
  s.car.x = tx + 0.5; s.car.y = ty - Rules.CAR_SIZE / 2;
  const events = Game.update(s, { down: true }, 0.05);
  assert.ok(events.some((e) => e.type === 'blocked' && e.reason === 'guest-treasure'));
  assert.equal(s.dig, null);

  // 옆 칸을 넓게(3×3) 파도 보물 칸은 건드리지 않는다
  s.levels.range = 2;
  s.car.x = tx - 0.5;
  w.tiles[(ty - 1) * w.w + tx - 1] = TILE.EMPTY;
  for (let i = 0; i < 400 && w.tiles[ty * w.w + tx - 1] !== TILE.EMPTY; i++) Game.update(s, { down: true }, 0.05);
  assert.equal(w.tiles[ty * w.w + tx - 1], TILE.EMPTY);
  assert.equal(w.tiles[t], TILE.TREASURE);
  assert.equal(s.treasureTime, null);
});

test('👫 멀티 규칙: 친구가 판 칸을 받으면 방장의 남은 칸 수도 줄고, 입장권은 못 쓴다', () => {
  const s = Game.newGame({ seed: 9 });
  const before = Game.leftCounts(s).all;
  const idx = 5 * s.world.w + 20;
  const events = [];
  Game.applyTile(s, idx, TILE.EMPTY, 0, events);
  assert.equal(s.world.tiles[idx], TILE.EMPTY);
  assert.equal(Game.leftCounts(s).all, before - 1);
  Game.applyTile(s, idx, TILE.EMPTY, 0, events); // 이미 빈 칸은 다시 안 셈
  assert.equal(Game.leftCounts(s).all, before - 1);

  s.ticket = 1;
  s.multi = true;
  assert.deepEqual(Game.useTicket(s), { ok: false, reason: 'multi' });
  assert.equal(s.ticket, 1);
});
