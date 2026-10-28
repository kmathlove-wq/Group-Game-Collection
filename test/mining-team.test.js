const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { Server } = require('socket.io');
const { io: createClient } = require('socket.io-client');
const Rules = require('../public/mining-tycoon/js/rules.js');
const World = require('../public/mining-tycoon/js/world.js');
const Econ = require('../public/mining-tycoon/js/team-econ.js');
const { setupMiningTeam } = require('../src/mining-tycoon/team');

async function startServer(t, options = {}) {
  const server = http.createServer();
  const io = new Server(server);
  const team = setupMiningTeam({ io, ...options });
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
  return { connect, team };
}

const call = (c, event, data) => new Promise((resolve) => c.emit(event, data, resolve));
const next = (c, event) => new Promise((resolve) => c.once(event, resolve));

// 방장(빨강) + 빨강 1명 + 파랑 1명으로 방을 만들고 시작한다.
async function startedRoom(t) {
  const { connect, team } = await startServer(t);
  const host = await connect();
  const made = await call(host, 'mt:team:create', { name: '방장', teams: 2, team: 0 });
  assert.equal(made.ok, true);
  const mate = await connect();
  const enemy = await connect();
  const peek = await call(mate, 'mt:team:peek', { code: made.code.toLowerCase() });
  assert.equal(peek.ok, true);
  assert.equal(peek.lobby.teams.length, 2);
  assert.equal((await call(mate, 'mt:team:join', { name: '친구', code: made.code, team: 0 })).ok, true);
  assert.equal((await call(enemy, 'mt:team:join', { name: '상대', code: made.code, team: 1 })).ok, true);
  const started = [next(host, 'mt:team:started'), next(mate, 'mt:team:started'), next(enemy, 'mt:team:started')];
  assert.equal((await call(host, 'mt:team:start', {})).ok, true);
  const [h, m, e] = await Promise.all(started);
  return { team, host, mate, enemy, code: made.code, h, m, e };
}

test('⚔️ 팀전: 방장이 팀 수를 정해 방을 만들고, 들어오는 사람은 팀을 골라 들어온다 — 한 팀만 있으면 시작 못 한다', async (t) => {
  const { connect } = await startServer(t);
  const host = await connect();
  const made = await call(host, 'mt:team:create', { name: '방장', teams: 3, team: 2 });
  assert.equal(made.ok, true);
  assert.match(made.code, /^[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(made.lobby.teams.length, 3);
  assert.equal(made.lobby.players[0].team, 2);
  assert.equal(made.lobby.players[0].host, true);

  const friend = await connect();
  assert.equal((await call(friend, 'mt:team:join', { name: '친구', code: made.code, team: 7 })).ok, false, '없는 팀은 안 된다');
  const lobbyNotice = next(host, 'mt:team:lobby');
  assert.equal((await call(friend, 'mt:team:join', { name: '친구', code: made.code, team: 2 })).ok, true);
  assert.equal((await lobbyNotice).players.length, 2);

  const notYet = await call(host, 'mt:team:start', {});
  assert.equal(notYet.ok, false, '모두 같은 팀이면 시작 못 한다');
  assert.equal((await call(friend, 'mt:team:start', {})).ok, false, '방장만 시작한다');

  assert.equal((await call(friend, 'mt:team:switch', { team: 0 })).ok, true, '시작 전엔 팀을 바꿀 수 있다');
  const started = next(friend, 'mt:team:started');
  assert.equal((await call(host, 'mt:team:start', {})).ok, true, '인원이 달라도(1:1) 두 팀에 사람이 있으면 시작');
  const info = await started;
  assert.equal(info.team, 0);
  assert.ok(Number.isInteger(info.seed));
  assert.equal(info.players.length, 2);
  assert.equal(info.econ.econ.length, Econ.SIZE);

  const late = await connect();
  assert.equal((await call(late, 'mt:team:join', { name: '늦게', code: made.code, team: 0 })).ok, false, '시작한 뒤엔 못 들어온다');
});

test('⚔️ 팀전: 돈·업그레이드·가방은 같은 팀끼리만 공유되고, 팔기는 서버가 한 번만 판다', async (t) => {
  const { host, mate, enemy, h } = await startedRoom(t);
  // 방장이 석탄 3개를 캤다(가방 +3)
  const d = Econ.empty();
  d[Econ.SIZE - Rules.ORES.length + 1] = 3;
  const mateGot = next(mate, 'mt:team:econ');
  let enemyGot = false;
  enemy.on('mt:team:econ', () => { enemyGot = true; });
  host.emit('mt:team:econ', { seq: 1, d });
  const m = await mateGot;
  assert.equal(m.econ[Econ.SIZE - Rules.ORES.length + 1], 3, '같은 팀 친구 가방에 들어온다');
  assert.equal(m.acks[h.you], 1);

  // 친구와 방장이 동시에 팔아도 돈은 한 번만 생긴다
  const [a, b] = await Promise.all([call(mate, 'mt:team:sell', {}), call(host, 'mt:team:sell', {})]);
  assert.equal(a.total + b.total, 3 * Rules.ORES[1].value);
  assert.equal(enemyGot, false, '다른 팀은 우리 팀 경제를 못 받는다');

  // 동시에 사서 돈이 모자라면 모자란 만큼 빚
  const spend = Econ.empty();
  spend[0] = -1000;
  const after = next(host, 'mt:team:econ');
  mate.emit('mt:team:econ', { seq: 1, d: spend });
  const v = (await after).econ;
  assert.equal(v[0], 0);
  assert.equal(v[1], 1000 - 3 * Rules.ORES[1].value);
});

test('⚔️ 팀전: 같은 땅을 함께 쓰고, 보물을 먼저 캔 팀이 이긴다', async (t) => {
  const { team, host, mate, enemy, code, h } = await startedRoom(t);
  const room = team.rooms.get(code);
  assert.deepEqual([...room.tiles].slice(0, 400), [...World.createWorld(h.seed).tiles].slice(0, 400), '서버도 같은 씨앗으로 같은 땅을 가진다');

  const got = next(host, 'mt:team:tiles');
  enemy.emit('mt:team:tiles', [[500, Rules.TILE.EMPTY, 0]]);
  assert.deepEqual(await got, [[500, Rules.TILE.EMPTY, 0]], '다른 팀이 판 땅도 모두에게 보인다');

  const ends = [next(host, 'mt:team:end'), next(enemy, 'mt:team:end')];
  const first = await call(enemy, 'mt:team:treasure', {});
  assert.equal(first.first, true);
  const second = await call(mate, 'mt:team:treasure', {});
  assert.equal(second.first, false, '늦게 캔 팀은 이기지 못한다');
  const [a, b] = await Promise.all(ends);
  assert.equal(a.winner, 1);
  assert.equal(b.by, '상대');
  assert.equal(a.reason, 'treasure');
});

test('⚔️ 팀전: 게임 중 한 팀만 남으면 그 팀이 이기고, 방장이 나가면 다음 사람이 방장이 된다', async (t) => {
  const { host, mate, enemy } = await startedRoom(t);
  const lobby = next(mate, 'mt:team:lobby');
  await call(host, 'mt:team:leave', {});
  assert.equal((await lobby).players.find((p) => p.name === '친구').host, true);
  const end = next(mate, 'mt:team:end');
  await call(enemy, 'mt:team:leave', {});
  const result = await end;
  assert.equal(result.winner, 0);
  assert.equal(result.reason, 'alone');
});

test('⚔️ 팀 경제 숫자 한 줄: 읽기·쓰기·고치기·팔기', () => {
  const s = { money: 500, debt: 0, earned: 700, levels: {}, bag: Rules.ORES.map(() => 0) };
  Rules.UPGRADE_ORDER.forEach((k) => { s.levels[k] = 0; });
  s.levels.drill = 2;
  s.bag[2] = 4;
  const v = Econ.read(s);
  const t2 = { money: 0, debt: 0, earned: 0, levels: {}, bag: Rules.ORES.map(() => 0) };
  Econ.write(t2, v);
  assert.equal(t2.levels.drill, 2);
  assert.equal(t2.bag[2], 4);
  assert.equal(Econ.diff(v, v), null);
  const big = Econ.add(v, Econ.empty());
  big[3] = 999; // 드릴 단계를 너무 높게
  assert.equal(Econ.fix(big)[3], Rules.UPGRADES.drill.prices.length);
  const sold = Econ.sell(Econ.read(s));
  assert.equal(sold.count, 4);
  assert.equal(sold.total, 4 * Rules.ORES[2].value);
});

test('⚔️ 팀전 방 목록: 시작 전 방만 보이고, 방장 이름·팀별 인원을 알려 준다', async (t) => {
  const { connect } = await startServer(t);
  const host = await connect();
  const made = await call(host, 'mt:team:create', { name: '방장', teams: 3, team: 1 });
  const viewer = await connect();
  let list = await call(viewer, 'mt:team:list', {});
  assert.equal(list.ok, true);
  assert.equal(list.rooms.length, 1);
  assert.equal(list.rooms[0].code, made.code);
  assert.equal(list.rooms[0].hostName, '방장');
  assert.equal(list.rooms[0].teams.length, 3);
  assert.equal(list.rooms[0].players.filter((p) => p.team === 1).length, 1);
  await call(viewer, 'mt:team:join', { name: '구경꾼', code: made.code, team: 0 });
  await call(host, 'mt:team:start', {});
  const other = await connect();
  list = await call(other, 'mt:team:list', {});
  assert.equal(list.rooms.length, 0, '시작한 방은 목록에서 빠진다');
});
