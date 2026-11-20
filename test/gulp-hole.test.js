const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
// 순위 시험 점수가 진짜 순위 파일(data/)에 쌓이지 않게 임시 폴더를 쓴다(server.js를 불러오기 전에 정해야 함).
process.env.SCORES_DIR = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gulp-hole-scores-'));
const R = require('../public/gulp-hole/js/rules.js');

const MODELS = path.join(__dirname, '..', 'public', 'gulp-hole', 'models');

function readGlbJson(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.toString('ascii', 0, 4), 'glTF', file);
  const len = b.readUInt32LE(12);
  return JSON.parse(b.toString('utf8', 20, 20 + len));
}

function run(state, seconds, input) {
  for (let i = 0; i < seconds * 60 && state.phase === 'playing'; i++) {
    R.step(state, input || { x: 0, z: 0 }, 1 / 60);
    state.changed.forEach((o) => { o._c = false; });
    state.changed.length = 0;
  }
}

// 다른 구멍·움직이는 것 방해 없이 규칙만 보도록: 구멍 하나, 물건 하나만 남긴다
function lonely(type, holeMass) {
  const s = R.createGame({ seed: 3, holes: 1 });
  const o = s.objects.find((x) => x.type === type && !R.TYPES[type].walker && !R.TYPES[type].driver) || s.objects.find((x) => x.type === type);
  s.objects.forEach((x) => { if (x !== o) x.state = 'gone'; });
  const h = s.holes[0];
  h.mass = holeMass || 0;
  h.r = R.radiusFor(h.mass);
  return { s, o, h };
}

test('블렌더 모형 파일이 모두 있고, 사람·차 파일에는 블렌더 동작이 들어 있다', () => {
  const names = new Set();
  Object.values(R.TYPES).forEach((t) => t.models.forEach((m) => names.add(m)));
  for (const name of names) {
    const json = readGlbJson(path.join(MODELS, name + '.glb'));
    const prim = json.meshes[0].primitives[0];
    assert.ok(prim.attributes.COLOR_0 !== undefined, name + ' 꼭짓점 색');
    const type = Object.keys(R.TYPES).find((k) => R.TYPES[k].models.includes(name));
    const t = R.TYPES[type];
    if (t.walker || t.driver) {
      assert.ok(json.animations && json.animations.length >= 5, name + ' 동작');
      const parts = json.nodes.map((n) => n.name);
      if (t.walker) ['leg_l', 'leg_r', 'arm_l', 'arm_r', 'body'].forEach((p) => assert.ok(parts.some((n) => n.endsWith('__' + p)), name + ' ' + p));
      else assert.ok(parts.filter((n) => /__wheel\d$/.test(n)).length >= 4, name + ' 바퀴');
    } else {
      assert.ok(!json.animations || json.animations.length === 0, name + ' 은 가만히 있는 모형');
    }
  }
});

test('같은 씨앗이면 같은 도시, 모든 물건은 도시 안에 있다', () => {
  const a = R.buildCity(42), b = R.buildCity(42);
  assert.equal(a.objects.length, b.objects.length);
  assert.deepEqual(a.objects.slice(0, 50).map((o) => [o.type, o.model, o.x, o.z]), b.objects.slice(0, 50).map((o) => [o.type, o.model, o.x, o.z]));
  assert.ok(a.objects.length > 1500);
  for (const o of a.objects) {
    assert.ok(o.x >= R.MAP_MIN && o.x <= R.MAP_MAX && o.z >= R.MAP_MIN && o.z <= R.MAP_MAX, o.type + ' 위치');
  }
  ['tower', 'apartment', 'house', 'shop', 'car', 'bus', 'person', 'fountain'].forEach((t) => assert.ok(a.objects.some((o) => o.type === t), t));
});

test('작은 물건은 구멍에 빠져 점수와 몸집이 늘고, 큰 건물은 덜덜 떨기만 한다', () => {
  const { s, o, h } = lonely('hydrant');
  h.x = o.x; h.z = o.z + 0.1;
  run(s, 3);
  assert.equal(o.state, 'gone');
  assert.equal(h.score, R.TYPES.hydrant.pts);
  assert.ok(h.r > R.START_R);

  const big = lonely('tower');
  big.h.x = big.o.x; big.h.z = big.o.z;
  run(big.s, 1);
  assert.equal(big.o.state, 'idle');
  assert.equal(big.h.score, 0);
  assert.ok(big.o.wobble > 0);
});

test('구멍이 충분히 크면 고층 빌딩도 삼킨다', () => {
  const { s, o, h } = lonely('tower', 6000);
  assert.ok(h.r >= R.TYPES.tower.need);
  h.x = o.x; h.z = o.z;
  run(s, 4);
  assert.equal(o.state, 'gone');
  assert.equal(h.score, R.TYPES.tower.pts);
});

test('큰 구멍은 작은 구멍을 삼키고, 먹힌 구멍은 3초 뒤 작게 다시 나온다', () => {
  const s = R.createGame({ seed: 5, holes: 2 });
  s.objects.forEach((o) => { o.state = 'gone'; });
  const [me, bot] = s.holes;
  me.mass = 800; me.r = R.radiusFor(800);
  bot.x = me.x + 0.5; bot.z = me.z;
  bot.bot = false;                                           // 시험에서는 가만히
  run(s, 0.2);
  assert.equal(bot.alive, false);
  assert.ok(me.score >= 20);
  run(s, R.RESPAWN + 0.2);
  assert.equal(bot.alive, true);
  assert.ok(bot.r <= R.START_R + 0.01);
});

test('차는 벽을 뚫지 않고 도시 안 도로에서만 교차로를 돌며 달린다', () => {
  const s = R.createGame({ seed: 11 });
  s.holes.forEach((h) => { h.alive = false; h.respawnAt = Infinity; });   // 구멍 없이 차만
  const start = s.drivers.map((c) => [c.x, c.z]);
  let turned = 0;
  for (let i = 0; i < 60 * 40; i++) {
    R.step(s, null, 1 / 60);
    s.changed.forEach((o) => { o._c = false; }); s.changed.length = 0;
    for (const c of s.drivers) {
      assert.ok(c.x > R.MAP_MIN && c.x < R.MAP_MAX && c.z > R.MAP_MIN && c.z < R.MAP_MAX, '벽 밖으로 나감');
      if (c.phase === 'turn' && c.nd !== c.d) turned += 1;
    }
  }
  assert.ok(turned > 0, '교차로에서 꺾는 차가 있다');
  const moved = s.drivers.filter((c, k) => Math.hypot(c.x - start[k][0], c.z - start[k][1]) > 20).length;
  assert.ok(moved > s.drivers.length * 0.7, '차들이 계속 달린다');
  // 끝난 순간 서로 겹친 차가 없다
  for (let a = 0; a < s.drivers.length; a++) {
    for (let b = a + 1; b < s.drivers.length; b++) {
      assert.ok(Math.hypot(s.drivers[a].x - s.drivers[b].x, s.drivers[a].z - s.drivers[b].z) > 1.5, '차가 겹침');
    }
  }
});

test('사람은 인도를 걷고 걷는 자세(anim)가 바뀐다', () => {
  const s = R.createGame({ seed: 2 });
  s.holes.forEach((h) => { h.alive = false; h.respawnAt = Infinity; });
  const p = s.objects.find((o) => o.type === 'person' && o.path);
  const x0 = p.x, z0 = p.z, a0 = p.anim;
  run(s, 2);
  assert.ok(Math.hypot(p.x - x0, p.z - z0) > 1.5);
  assert.notEqual(p.anim, a0);
});

test('2분이 지나면 경기가 끝나고 점수 순서로 등수를 매긴다', () => {
  const s = R.createGame({ seed: 9 });
  run(s, R.DURATION + 1);
  assert.equal(s.phase, 'over');
  const list = R.standings(s);
  assert.equal(list.length, R.HOLES);
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].score >= list[i].score);
  assert.ok(list[0].score > 0, '컴퓨터 구멍도 먹는다');
});

test('꿀꺽 구멍 페이지와 순위 API', async () => {
  const { server } = require('../server');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));   // 서버는 맨 끝 시험이 끈다
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${url}/gulp-hole/`)).status, 200);
  assert.equal((await fetch(`${url}/shared/three/three.module.min.js`)).status, 200);
  assert.equal((await fetch(`${url}/gulp-hole/models/tower.glb`)).status, 200);
  const games = await (await fetch(`${url}/`)).text();
  assert.match(games, /href="\/gulp-hole\/"/);
  const ok = await fetch(`${url}/api/gulp-hole/scores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '꿀꺽왕', score: 4321 }) });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).rank, 1);
  const bad = await fetch(`${url}/api/gulp-hole/scores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'x', score: -5 }) });
  assert.equal(bad.status, 400);
});

test('👫 친구들과 대결: 방 만들기·코드 입장·시작·움직이기·끝(봇 없음, 서버가 판정)', async (t) => {
  const { io: ioClient } = require('socket.io-client');
  const { server, io, rooms, gulpHole } = require('../server');
  if (!server.listening) await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const a = ioClient(url, { transports: ['websocket'] });
  const b = ioClient(url, { transports: ['websocket'] });
  t.after(async () => {
    a.close(); b.close();
    rooms.clear();
    await new Promise((resolve) => io.close(resolve));
  });
  const call = (s, ev, data) => new Promise((resolve) => s.emit(ev, data, resolve));
  const once = (s, ev) => new Promise((resolve) => s.once(ev, resolve));

  const made = await call(a, 'gh:create', { nickname: '방장', isPublic: true });
  assert.equal(made.ok, true);
  const code = made.room.code;
  assert.match(code, /^[A-Z2-9]{4}$/);
  assert.equal((await call(a, 'gh:start', null)).ok, false, '혼자서는 시작 못 함');
  assert.equal((await call(b, 'gh:join', { nickname: '방장', code })).ok, false, '같은 이름은 거절');
  assert.equal((await call(b, 'gh:join', { nickname: '친구', code: 'ZZZZ' })).ok, false, '없는 방');
  const list = await call(b, 'gh:rooms', null);
  assert.ok(list.rooms.some((r) => r.code === code && r.canJoin));
  assert.equal((await call(b, 'gh:join', { nickname: '친구', code: code.toLowerCase() })).ok, true);
  assert.equal((await call(b, 'gh:start', null)).ok, false, '방장만 시작');

  const startA = once(a, 'gh:start'), startB = once(b, 'gh:start');
  assert.equal((await call(a, 'gh:start', null)).ok, true);
  const [sa, sb] = await Promise.all([startA, startB]);
  assert.equal(sa.seed, sb.seed, '모두 같은 도시');
  assert.equal(sa.players.length, 2, '봇 없이 사람 2명만');
  assert.notEqual(sa.you, sb.you);

  const room = gulpHole.rooms.get(code);
  const hb = room.game.state.holes[sb.you];
  const x0 = hb.x;
  for (let i = 0; i < 10; i++) { b.emit('gh:input', { x: 5, z: 0 }); await new Promise((r) => setTimeout(r, 30)); }  // 5는 1로 줄어든다
  const snapMsg = await once(b, 'gh:snap');
  assert.equal(snapMsg.h.length, 2 * 5);
  assert.ok(hb.x > x0 + 1, '친구 구멍이 오른쪽으로 움직임');
  assert.ok(hb.x - x0 < R.speedFor(hb.r) * 2, '너무 빠르게 움직이지 않음');
  assert.ok(room.game.state.holes.every((h) => !h.bot));

  room.game.state.duration = room.game.state.time + 0.05;      // 시험: 바로 끝내기
  const over = await once(a, 'gh:over');
  assert.equal(over.standings.length, 2);
  assert.equal(room.state, 'over');
});
