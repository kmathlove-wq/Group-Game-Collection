const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
process.env.SCORES_DIR = fs.mkdtempSync(path.join(require('os').tmpdir(), 'baseball-scores-'));
const R = require('../public/baseball/js/rules.js');

const MODELS = path.join(__dirname, '..', 'public', 'baseball', 'models');
function glb(name) {
  const b = fs.readFileSync(path.join(MODELS, name + '.glb'));
  assert.equal(b.toString('ascii', 0, 4), 'glTF', name);
  return JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12)));
}

test('블렌더 선수 모형: 관절 13개 + 팀 유니폼 재질, 동작 9개는 모든 관절을 움직인다', () => {
  const p = glb('player');
  const joints = p.nodes.map((n) => n.name).filter((n) => n.includes('__'));
  assert.equal(joints.length, 13);
  const mats = p.materials.map((m) => m.name);
  ['bb_jersey', 'bb_pants', 'bb_cap', 'bb_accent', 'bb_sock', 'bb_skin', 'bb_glove', 'bb_bat'].forEach((m) => assert.ok(mats.includes(m), m));
  for (const a of ['idle', 'ready', 'crouch', 'run', 'pitch', 'stance', 'swing', 'throw', 'call']) {
    const g = glb('anim_' + a);
    const moved = new Set();
    g.animations.forEach((an) => an.channels.forEach((c) => moved.add(g.nodes[c.target.node].name)));
    joints.forEach((j) => assert.ok(moved.has(j), a + ' ' + j));
  }
  ['base', 'home_plate', 'rubber', 'light_tower', 'scoreboard', 'foul_pole', 'dugout', 'stand_block', 'crowd'].forEach((n) => glb(n));
});

test('투구 물리: 실제 야구처럼 빠르고, 구종마다 휘는 방향이 다르다', () => {
  const rand = R.rng(1);
  const brk = {};
  for (const k of R.PITCH_KEYS) {
    const p = R.makePitch(k, { x: 0.1, y: 0.8 }, 0, rand);
    assert.ok(Math.abs(p.cross.x - 0.1) < 0.01 && Math.abs(p.cross.y - 0.8) < 0.01, k + ' 목표에 들어감');
    const plain = R.flyPitch(p.release, p.v0, [0, 0, 0]);
    brk[k] = { side: p.cross.x - plain.x, up: p.cross.y - plain.y, t: p.cross.t, kmh: p.kmh };
  }
  assert.ok(brk.fastball.kmh >= 144 && brk.fastball.t > 0.4 && brk.fastball.t < 0.47, '직구는 0.4초대');
  assert.ok(brk.fastball.up > 0.3, '직구는 역회전으로 덜 떨어진다');
  assert.ok(brk.curve.up < -0.3, '커브는 더 떨어진다');
  assert.ok(brk.slider.side > 0.3, '슬라이더는 1루 쪽(+x)으로 휜다');
  assert.ok(brk.changeup.kmh < brk.fastball.kmh - 10, '체인지업은 느리다');
});

test('타구 물리: 강하게 띄운 공은 홈런, 땅볼은 짧다', () => {
  const rand = R.rng(2);
  const hr = R.flyBatted(170, 28, 0, rand);
  assert.ok(hr.hr && hr.landed.dist > 122);
  const fly = R.flyBatted(150, 30, 0, rand);
  assert.ok(!fly.hr && fly.landed.dist > 95 && fly.landed.dist < 120);
  const gb = R.flyBatted(120, -5, 10, rand);
  assert.ok(gb.landed.dist < 15);
  assert.equal(R.fenceDist(0), 122);
  assert.equal(Math.round(R.fenceDist(45)), 98);
});

test('판정: 안 치면 존 안은 스트라이크·밖은 볼, 완벽하게 치면 강한 타구, 멀면 헛스윙', () => {
  const rand = R.rng(3);
  const inZ = R.makePitch('fastball', { x: 0, y: 0.8 }, 0, rand);
  const outZ = R.makePitch('fastball', { x: 0.6, y: 0.8 }, 0, rand);
  assert.equal(R.resolveSwing(inZ, null, rand).kind, 'strike');
  assert.equal(R.resolveSwing(outZ, null, rand).kind, 'ball');
  const hit = R.resolveSwing(inZ, { dt: 0, x: inZ.cross.x, y: inZ.cross.y - 0.03 }, rand);
  assert.equal(hit.kind, 'inplay');
  assert.ok(hit.ev > 150 && hit.la > 5 && hit.la < 35, JSON.stringify(hit));
  assert.equal(R.resolveSwing(inZ, { dt: 0.2, x: 0, y: 0.8 }, rand).miss, true);
  assert.equal(R.resolveSwing(inZ, { dt: 0, x: 0.5, y: 0.8 }, rand).miss, true);
});

test('경기 규칙: 볼넷 밀어내기, 삼진, 2스트라이크 파울, 3아웃 교대, 끝내기', () => {
  const s = R.createGame({ seed: 4, innings: 1 });
  const p = R.makePitch('fastball', { x: 0, y: 0.8 }, 0, s.rand);
  s.bases = [true, true, true];
  for (let i = 0; i < 4; i++) R.applyPitch(s, p, { kind: 'ball' });
  assert.equal(s.score.away, 1, '만루 볼넷은 1점');
  assert.deepEqual(s.bases, [true, true, true]);
  R.applyPitch(s, p, { kind: 'strike', swing: true });
  R.applyPitch(s, p, { kind: 'strike', called: true });
  R.applyPitch(s, p, { kind: 'foul' });
  assert.equal(s.strikes, 2, '2스트라이크에서 파울은 그대로');
  const k = R.applyPitch(s, p, { kind: 'strike', swing: true });
  assert.equal(k.event, 'k');
  assert.equal(s.outs, 1);
  for (let o = 0; o < 2; o++) for (let i = 0; i < 3; i++) R.applyPitch(s, p, { kind: 'strike', called: true });
  assert.equal(s.half, 'bottom', '3아웃이면 말 공격');
  assert.equal(s.outs, 0);
  assert.deepEqual(s.bases, [false, false, false]);
  s.bases = [false, false, true];
  for (let i = 0; i < 4; i++) R.applyPitch(s, p, { kind: 'ball' });     // 1루만 채움(3루 주자는 안 밀림)
  assert.equal(s.score.home, 0);
  for (let i = 0; i < 4; i++) R.applyPitch(s, p, { kind: 'ball' });
  for (let i = 0; i < 4; i++) R.applyPitch(s, p, { kind: 'ball' });     // 만루 밀어내기 → 1:1
  for (let i = 0; i < 4; i++) R.applyPitch(s, p, { kind: 'ball' });     // 2:1 끝내기
  assert.equal(s.over, true);
  assert.equal(s.winner, 'home');
});

test('컴퓨터끼리 9이닝 100경기: 항상 끝나고, 점수·타율이 실제 야구와 비슷하다', () => {
  let runs = 0, ab = 0, h = 0, pa = 0, k = 0;
  for (let g = 0; g < 100; g++) {
    const s = R.createGame({ seed: 100 + g, innings: 9 });
    let n = 0;
    while (!s.over && n++ < 6000) {
      const c = R.aiChoosePitch(s, s.rand);
      const p = R.makePitch(c.type, c.target, c.control, s.rand);
      const o = R.applyPitch(s, p, R.resolveSwing(p, R.aiSwing(s, p, s.rand), s.rand));
      if (o.event) { pa += 1; if (o.event !== 'walk') ab += 1; if (o.event === 'k') k += 1; if (['single', 'double', 'triple', 'hr'].includes(o.event)) h += 1; }
    }
    assert.equal(s.over, true, '경기가 끝난다');
    runs += s.score.home + s.score.away;
  }
  const rpg = runs / 100, avg = h / ab, kr = k / pa;
  assert.ok(rpg > 3 && rpg < 14, '경기당 득점 ' + rpg);
  assert.ok(avg > 0.18 && avg < 0.32, '타율 ' + avg);
  assert.ok(kr > 0.1 && kr < 0.35, '삼진율 ' + kr);
});

test('타구 결과: 홈런은 주자까지 모두 득점, 수비가 잡으면 아웃', () => {
  const rand = R.rng(9);
  const hr = R.resolveInPlay({ ev: 172, la: 28, spray: -20 }, [true, true, false], 0, rand);
  assert.equal(hr.result, 'hr');
  assert.equal(hr.runs, 3);
  const pop = R.resolveInPlay({ ev: 90, la: 60, spray: 5 }, [false, false, false], 0, rand);
  assert.equal(pop.outsAdd, 1);
  assert.ok(['popout', 'flyout', 'lineout'].includes(pop.result));
});

test('야구 페이지·순위 API·게임 카드', async (t) => {
  const { server, io, rooms } = require('../server');
  if (!server.listening) await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { rooms.clear(); await new Promise((resolve) => io.close(resolve)); });   // 서버를 꺼야 시험이 끝난다
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${url}/baseball/`)).status, 200);
  assert.equal((await fetch(`${url}/baseball/models/player.glb`)).status, 200);
  assert.equal((await fetch(`${url}/shared/three/addons/objects/Sky.js`)).status, 200);
  assert.match(await (await fetch(`${url}/`)).text(), /href="\/baseball\/"/);
  const ok = await fetch(`${url}/api/baseball/scores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '홈런왕', score: 1200 }) });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).rank, 1);
});

test('👫 친구와 경기: 방·자리·팀 고르기, 투수가 던지고 타자가 치면 서버가 판정한다', async (t) => {
  const http = require('http');
  const { Server } = require('socket.io');
  const { io: ioClient } = require('socket.io-client');
  const { setupBaseball } = require('../src/baseball');
  const srv = http.createServer();
  const io = new Server(srv);
  const bb = setupBaseball({ io, timing: { start: 30, after: -100 } });   // 시험: 기다림을 짧게
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}`;
  const a = ioClient(url, { transports: ['websocket'] });
  const b = ioClient(url, { transports: ['websocket'] });
  const c = ioClient(url, { transports: ['websocket'] });
  t.after(async () => { a.close(); b.close(); c.close(); await new Promise((r) => io.close(r)); });
  const call = (s, ev, data) => new Promise((r) => s.emit(ev, data, r));
  const once = (s, ev) => new Promise((r) => s.once(ev, r));

  const made = await call(a, 'bb:create', { nickname: '방장' });
  assert.equal(made.ok, true);
  const code = made.room.code;
  assert.equal(made.room.seats.away.nickname, '방장', '방장은 원정 자리에 자동으로');
  const joined = await call(b, 'bb:join', { nickname: '친구', code });
  assert.equal(joined.room.seats.home.nickname, '친구', '두 번째 사람은 홈 자리에');
  assert.equal((await call(c, 'bb:join', { nickname: '구경꾼', code })).ok, true);
  assert.equal((await call(b, 'bb:team', { side: 'home', team: 'foxes' })).ok, false, '상대와 같은 팀은 안 됨(원정 기본 foxes)');
  assert.equal((await call(b, 'bb:team', { side: 'away', team: 'dragons' })).ok, false, '남의 자리 팀은 못 바꿈');
  assert.equal((await call(b, 'bb:team', { side: 'home', team: 'penguins' })).ok, true);
  assert.equal((await call(b, 'bb:start', null)).ok, false, '방장만 시작');

  const turnA = once(a, 'bb:turn'), turnC = once(c, 'bb:turn');
  const startC = once(c, 'bb:start');
  assert.equal((await call(a, 'bb:start', null)).ok, true);
  const st = await startC;
  assert.equal(st.state.teams.home, 'penguins');
  const turn = await turnA;
  await turnC;
  assert.equal(turn.batterId, a.id, '1회 초: 원정(방장)이 친다');
  assert.equal(turn.pitcherId, b.id, '홈(친구)이 던진다');
  assert.equal((await call(a, 'bb:pitch', { type: 'curve', target: { x: 0, y: 0.8 }, acc: 1 })).ok, false, '타자는 못 던짐');

  const pitchA = once(a, 'bb:pitch'), pitchC = once(c, 'bb:pitch');
  assert.equal((await call(b, 'bb:pitch', { type: 'curve', target: { x: 9, y: -9 }, acc: 5 })).ok, true);
  const [pa] = await Promise.all([pitchA, pitchC]);
  assert.equal(pa.pitch.type, 'curve');
  assert.ok(Math.abs(pa.pitch.cross.x) < 1.2 && pa.pitch.cross.y > -0.5, '이상한 목표는 서버가 범위 안으로');
  const resultC = once(c, 'bb:result');
  assert.equal((await call(a, 'bb:swing', { dt: 0, x: pa.pitch.cross.x, y: pa.pitch.cross.y - 0.02 })).ok, true);
  const res = await resultC;
  assert.ok(['inplay', 'foul'].includes(res.out.swing.kind), '완벽한 스윙은 맞는다: ' + res.out.swing.kind);
  assert.ok(res.state && res.state.inning === 1);
  const room = bb.rooms.get(code);
  assert.equal(room.state, 'playing');
  // 선수가 나가면 경기가 멈춘다
  const stopped = once(c, 'bb:stopped');
  b.close();
  await stopped;
  assert.equal(room.state, 'lobby');
});
