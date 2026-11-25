const test = require('node:test');
const assert = require('node:assert/strict');
// 순위 시험 점수가 진짜 순위 파일(data/)에 쌓이지 않게 임시 폴더를 쓴다(server.js를 불러오기 전에 정해야 함).
process.env.SCORES_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'tin-scores-'));
const L = require('../public/tin-squad/js/levels.js');
const G = require('../public/tin-squad/js/game.js');
const Boss = require('../public/tin-squad/js/boss.js');
const DT = 1 / 60;

// 단순한 자동 조종: 오른쪽으로 가며 쏘고, 막히거나 구덩이·가시가 보이면 뛴다.
function bot(s) {
  const p = s.p;
  const foot = p.y + p.h;
  const t = (dx, dy) => G.tileAt(s, Math.floor((p.x + p.w / 2 + dx) / L.TILE), Math.floor((foot + dy) / L.TILE));
  const hole = p.ground && [30, 50].some((dx) => ![5, 50, 95, 140].some((dy) => [1, 2].includes(t(dx, dy)) && foot + dy < 530));
  const wall = t(34, -10) === 1 || t(34, -50) === 1 || t(20, -10) === 3 || t(40, -10) === 3;
  const input = { right: true, fire: true, jump: false };
  if (s.boss) {
    const c = s.boss.x + s.boss.w / 2;
    const side = p.x < c ? -1 : 1; // 구석에 몰려도 보스 쪽을 본다
    input.right = side < 0; input.left = side > 0;
    input.jump = Math.floor(s.time * 2) % 2 === 0;
    input.up = s.boss.y + s.boss.h < p.y;
  } else if (s.lock != null) {
    const e = s.enemies.filter((x) => x.x > s.lock - 60 && x.x < s.lock + 1020).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
    input.right = e ? e.x > p.x + 60 : s.lock + 480 > p.x;
    input.left = e ? e.x < p.x - 60 : s.lock + 480 < p.x - 20;
    input.up = !!e && e.y + e.h < p.y && Math.abs(e.x - p.x) < 320;
    input.jump = Math.floor(s.time * 3) % 3 === 0;
    input.bomb = Math.floor(s.time * 2) % 4 === 0;
    if (e && p.onPlat && e.y > p.y + p.h) { input.down = true; input.right = input.left = false; } // 발판 아래로 내려가기
  }
  if ((s.lock != null) && s.time % 7 > 5) { input.right = s.time % 14 > 7; input.left = !input.right; input.down = false; } // 가끔 자리를 옮긴다
  if (hole || (wall && p.ground) || (p.vy < 0 && p.was.jump)) input.jump = true; // 뛰는 동안 계속 눌러 높이 뛴다
  if (p.ground && p.was.jump) input.jump = false; // 눌렀다 떼야 다시 뛴다
  return input;
}
function play(s, seconds) {
  for (let i = 0; i < seconds / DT && s.status === 'play'; i += 1) {
    G.update(s, bot(s), DT);
    assert.ok(Number.isFinite(s.p.x) && Number.isFinite(s.p.y) && Number.isFinite(s.camX), '위치가 숫자가 아님');
  }
  return s;
}

test('깡통 소탕대 지도: 조각 크기와 40판 구성', () => {
  for (const c of L.CHUNKS) {
    assert.equal(c.map.length, 8);
    for (const row of c.map) assert.equal(row.length, 16, row);
    for (const x of [0, 1, 14, 15]) assert.equal(c.map[6][x], '#', '양 끝은 평지');
  }
  assert.equal(L.STAGE_COUNT, 40);
  for (let i = 0; i < L.STAGE_COUNT; i += 1) {
    const m = L.buildStage(i);
    assert.deepEqual([...L.buildStage(i).tiles], [...m.tiles], '같은 판은 늘 같은 지도');
    assert.equal(m.petsTotal, m.type === 'boss' ? 2 : 3);
    assert.equal(m.props.filter((p) => p.kind === 'cage').length, m.petsTotal);
    assert.ok(m.boss || m.goal);
    for (const sp of m.spawns) assert.ok(G.ENEMIES[sp.type], sp.type);
  }
  for (const w of L.WORLDS) { assert.ok(Boss.BOSSES[w.boss]); for (const a of Boss.BOSSES[w.boss].attacks) assert.ok(Boss.ATT[a], a); }
});

test('깡통 소탕대: 40판 모두 끝까지 갈 수 있다(무적 자동 조종)', () => {
  for (let i = 0; i < L.STAGE_COUNT; i += 1) {
    const s = play(G.create({ stage: i, god: true, seed: 3 }), 400);
    assert.equal(s.status, 'clear', `${s.map.info.label} ${s.map.type} 에서 막힘 x=${Math.round(s.p.x)}/${s.map.width} 잠금=${s.lock} 적=${s.enemies.length} 보스=${s.boss && Math.round(s.boss.hp)}`);
    assert.ok(s.enemies.length < 120 && s.foes.length < 300 && s.shots.length < 200);
  }
});

test('깡통 소탕대: 끝없는 탑 1~25층도 끝까지 갈 수 있다', () => {
  for (let f = 1; f <= 25; f += 1) {
    const s = play(G.create({ floor: f, seed: 77, god: true }), 400);
    assert.equal(s.status, 'clear', `${f}층 ${s.map.type} x=${Math.round(s.p.x)}/${s.map.width}`);
  }
});

test('깡통 소탕대: 맞으면 하트가 줄고, 목숨을 다 쓰면 실패', () => {
  const s = G.create({ stage: 0 });
  s.enemies = [];
  for (let k = 0; k < 120; k += 1) G.update(s, {}, DT);
  const hp = s.p.hp;
  assert.ok(G.hurtPlayer(s, s.p.x + 50));
  assert.equal(s.p.hp, hp - 1);
  assert.equal(G.hurtPlayer(s, s.p.x + 50), false, '맞은 직후엔 잠깐 무적');
  for (let k = 0; k < 4000 && s.status === 'play'; k += 1) { s.p.inv = 0; G.hurtPlayer(s, s.p.x + 50); G.update(s, {}, DT); }
  assert.equal(s.status, 'fail');
  assert.equal(s.deaths, s.st.lives);
});

test('깡통 소탕대: 구덩이에 빠지면 하트 한 칸만 잃고 땅으로 돌아온다', () => {
  const s = G.create({ stage: 0 });
  s.enemies = [];
  for (let k = 0; k < 30; k += 1) G.update(s, {}, DT);
  s.p.y = 700;
  G.update(s, {}, DT);
  assert.equal(s.p.hp, s.p.maxHp - 1);
  assert.ok(s.p.y < 460);
});

test('깡통 소탕대: 방패 전자레인지는 앞 총알을 막고 뒤·폭발은 통한다', () => {
  const s = G.create({ stage: 0 });
  const e = G.makeEnemy(s, 'microwave', 400, G.GROUND_Y); e.dir = -1;
  const hp = e.hp;
  assert.equal(G.hurtEnemy(s, e, 10, 900, false), false); // 오른쪽으로 날아온 총알 = 앞면
  assert.equal(e.hp, hp);
  assert.ok(G.hurtEnemy(s, e, 10, -900, false));
  assert.ok(G.hurtEnemy(s, e, 10, 900, true));
  assert.equal(e.hp, hp - 20);
});

test('깡통 소탕대: 콤보 배수·업그레이드·탑 능력', () => {
  assert.equal(G.comboMult(0), 1);
  assert.ok(G.comboMult(10) > G.comboMult(5));
  assert.equal(G.comboMult(9999), 5);
  assert.equal(G.statsOf({ heart: 2, jump: 1 }).maxHp, 6);
  assert.equal(G.statsOf({ jump: 1 }).jumps, 2);
  const mods = {}, carry = { hp: 2, bombs: 1 };
  for (const p of G.PERKS) G.applyPerk(p, mods, carry, Math.random);
  assert.ok(mods.dmg > 0 && carry.hp >= 4 && G.WEAPONS[carry.weapon]);
  const s = G.create({ floor: 2, seed: 5, mods, carry });
  assert.ok(s.p.hp <= s.p.maxHp && s.lives === 1);
  assert.equal(new Set(G.perkChoices({}, Math.random).map((p) => p.id)).size, 3);
});

test('깡통 소탕대: 마우스 자리로 조준·발사하고 폭탄을 던진다', () => {
  const s = G.create({ stage: 0 });
  s.enemies = []; s.props = []; s.p.x = 600; s.p.face = 1;
  for (let k = 0; k < 20; k += 1) G.update(s, {}, DT);
  const p = s.p, from = { x: p.x + 14, y: p.y + 20 };
  for (const [dx, dy] of [[-200, -150], [220, -60], [10, -260], [-180, 10]]) {
    s.shots = []; p.fireT = 0;
    G.update(s, { fire: true, aim: { x: from.x + dx, y: from.y + dy } }, DT);
    assert.equal(s.shots.length, 1);
    const b = s.shots[0], want = Math.atan2(dy, dx), got = Math.atan2(b.vy, b.vx);
    assert.ok(Math.abs(Math.atan2(Math.sin(got - want), Math.cos(got - want))) < 0.05, `${dx},${dy}`);
    assert.equal(p.face, dx < 0 ? -1 : 1, '마우스 쪽을 본다');
  }
  G.update(s, {}, DT); G.update(s, { right: true, aim: { x: from.x - 300, y: from.y } }, DT);
  assert.equal(p.face, -1, '오른쪽으로 걸어도 마우스 쪽을 본다'); assert.ok(p.vx > 0);
  s.bombs = []; p.bombT = 0;
  const left = p.bombs, target = { x: p.x + 250, y: 440 };
  G.update(s, { bomb: true, aim: target }, DT);
  assert.equal(p.bombs, left - 1);
  let near = 999;
  for (let k = 0; k < 70 && s.bombs.length; k += 1) { near = Math.min(near, Math.hypot(s.bombs[0].x - target.x, s.bombs[0].y - target.y)); G.update(s, { aim: target }, DT); }
  assert.ok(near < 40, `폭탄이 누른 자리 근처로: ${near}`);
});

test('깡통 소탕대: 로봇을 타면 로봇이 대신 맞고, 부서지면 내린다', () => {
  const s = G.create({ stage: 3 });
  s.enemies = [];
  s.p.x = s.mechSpot.x; s.p.y = 380;
  for (let k = 0; k < 20 && !s.p.mech; k += 1) G.update(s, {}, DT);
  assert.ok(s.p.mech);
  const hp = s.p.hp;
  for (let k = 0; k < 10; k += 1) { s.p.inv = 0; G.hurtPlayer(s, s.p.x + 20); }
  assert.equal(s.p.mech, null);
  assert.equal(s.p.hp, hp);
  assert.equal(s.p.h, 56);
});

test('깡통 소탕대 순위 API와 화면 파일', async (t) => {
  const { server, io, rooms } = require('../server');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    rooms.clear();
    await new Promise((resolve) => io.close(resolve));
  });
  const html = await (await fetch(`${url}/tin-squad/`)).text();
  assert.ok(html.includes('깡통 소탕대') && html.includes('/shared/name-lock.js'));
  for (const src of [...html.matchAll(/(?:src|href)="((?:js|css|img)\/[^"]+)"/g)].map((m) => m[1])) {
    assert.equal((await fetch(`${url}/tin-squad/${src}`)).status, 200, src);
  }
  assert.ok((await (await fetch(`${url}/`)).text()).includes('href="/tin-squad/"'));
  const post = (slug, body) => fetch(`${url}/api/${slug}/scores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post('tin-squad', { name: '깡통', score: 100 })).status, 400, 'playerId 없으면 거절');
  assert.equal((await post('tin-squad', { name: '깡통', score: 5000, playerId: 'tin-test1' })).status, 200);
  assert.equal((await post('tin-squad-tower', { name: '깡통', score: 700, playerId: 'tin-test1' })).status, 200);
});

test('깡통 소탕대 저장: 이상한 값은 걸러 내고, 상점은 동전이 있을 때만', () => {
  const V = require('../public/tin-squad/js/save.js');
  const d = V.clean({ coins: -5, stars: [9, 'x'], up: { heart: 99, hack: 3 }, skins: ['<b>', 'mint'], skin: 'gold' });
  assert.equal(d.coins, 0);
  assert.deepEqual(d.stars.slice(0, 2), [3, 0]);
  assert.deepEqual(d.up, { heart: 3 });
  assert.deepEqual(d.skins, ['orange', 'mint']);
  assert.equal(d.skin, 'orange');
  assert.equal(V.buy(d, 'power'), false);
  d.coins = 100;
  assert.ok(V.buy(d, 'power'));
  assert.equal(d.coins, 20);
  const r = V.finish(d, 1, 3, 9000, 10);
  assert.ok(r.first && V.unlocked(d, 2) && d.best[1] === 9000);
});
