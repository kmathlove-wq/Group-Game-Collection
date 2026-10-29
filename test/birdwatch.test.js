// 탐조 여행(public/birdwatch) 규칙·자료·그림 시험. 서버를 켜지 않는다.
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../public/birdwatch/js/data.js');
const R = require('../public/birdwatch/js/rules.js');
const A = require('../public/birdwatch/js/art.js');

test('새 자료에 빠진 칸이 없고 이름·id가 겹치지 않는다', () => {
  assert.ok(D.BIRDS.length >= 50 && D.BIRDS.length <= 80, `새 ${D.BIRDS.length}종`);
  const ids = new Set(), names = new Set(), scis = new Set();
  for (const b of D.BIRDS) {
    assert.match(b.id, /^[a-z]+$/, b.id);
    assert.ok(!ids.has(b.id), '겹친 id ' + b.id); ids.add(b.id);
    assert.ok(!names.has(b.name), '겹친 이름 ' + b.name); names.add(b.name);
    assert.ok(!scis.has(b.sci), '겹친 학명 ' + b.sci); scis.add(b.sci);
    assert.match(b.sci, /^[A-Z][a-z]+ [a-z]+$/, '학명 모양 ' + b.sci);
    assert.ok(typeof b.size === 'number' && b.size >= 8 && b.size <= 160, b.name + ' 크기');
    assert.ok(D.SEASONS.includes(b.season), b.name + ' 계절');
    assert.ok(D.RARITIES[b.rarity], b.name + ' 등급');
    assert.ok(D.SHAPES[b.shape], b.name + ' 모양');
    assert.ok(b.habitat && b.fact && b.fact.length >= 10, b.name + ' 사는 곳·특징');
    assert.ok(!b.fact.includes('undefined'));
    assert.ok([0, 1, 2].includes(b.endangered), b.name + ' 멸종위기');
    for (const k of ['head', 'body', 'belly', 'wing', 'beak', 'leg']) assert.match(b.look[k], /^#[0-9a-f]{3,6}$/i, `${b.name} ${k} 색`);
    for (const m of b.look.marks) assert.match(m.c, /^#[0-9a-f]{3,6}$/i, `${b.name} 무늬 색`);
  }
  // 모든 새가 적어도 한 지역에 나온다
  for (const b of D.BIRDS) assert.ok(D.REGIONS.some((r) => r.birds.includes(b.id)), b.name + ' 나오는 지역 없음');
});

test('지역마다 새가 6~10종, 흔한 새가 2종 이상, 물새는 물 있는 곳에만', () => {
  assert.ok(D.REGIONS.length >= 10 && D.REGIONS.length <= 12);
  assert.equal(D.REGIONS.filter((r) => r.cost === 0).length, 3, '처음엔 3곳만 열림');
  const rids = new Set();
  for (const r of D.REGIONS) {
    assert.ok(!rids.has(r.id)); rids.add(r.id);
    assert.ok(r.name && r.desc && r.emoji, r.id);
    assert.ok(r.birds.length >= 6 && r.birds.length <= 10, `${r.name} ${r.birds.length}종`);
    assert.equal(new Set(r.birds).size, r.birds.length, r.name + ' 겹친 새');
    for (const id of r.birds) assert.ok(D.bird(id), `${r.name}의 모르는 새 ${id}`);
    assert.ok(r.birds.filter((id) => D.bird(id).rarity === 'common').length >= 2, r.name + ' 흔한 새 부족');
    const sc = A.buildScene(r);
    for (const id of r.birds) {
      const where = D.SHAPES[D.bird(id).shape];
      if (where === 'water') { assert.ok(r.water, `${r.name}에 물새 ${id}`); assert.ok(sc.areas.water.length, r.name + ' 물 구역'); }
      if (where === 'shore') assert.ok(sc.areas.shore.length, r.name + ' 물가 구역');
      if (where === 'perch') assert.ok(sc.perches.length >= 6, r.name + ' 앉을 자리');
      if (where === 'ground') assert.ok(sc.areas.ground.length, r.name + ' 땅 구역');
    }
    // 앉을 자리·구역은 그림 안에 있다
    for (const p of sc.perches) assert.ok(p.x >= 0 && p.x <= A.W && p.y >= 0 && p.y <= A.H, r.name + ' 앉을 자리 밖');
    for (const list of Object.values(sc.areas)) for (const a of list) assert.ok(a.x0 < a.x1 && a.y0 <= a.y1 && a.y1 <= A.H);
    assert.ok(!sc.svg.includes('NaN') && !sc.svg.includes('undefined'), r.name + ' 배경 그림');
  }
});

test('모든 새를 모든 자세·실루엣으로 그릴 수 있다', () => {
  for (const b of D.BIRDS) {
    for (const pose of ['perch', 'stand', 'swim', 'fly']) {
      for (const sil of [false, true]) {
        const a = A.bird(b, pose, sil);
        assert.ok(a.svg.startsWith('<svg') && a.svg.endsWith('</svg>'));
        assert.ok(!/NaN|undefined|null/.test(a.svg), `${b.name} ${pose} ${sil}`);
        assert.ok(a.foot >= 0 && a.foot <= 1, `${b.name} 발 위치`);
        if (sil) assert.ok(!/#111"|#fff"/.test(a.svg.replace(/#ffffff/g, '')), b.name + ' 실루엣에 색이 남음');
      }
    }
    assert.ok(A.bird(b, 'fly').svg.includes('bw-wing'), b.name + ' 날개');
  }
});

test('새 고르기는 지역 새만, 등급 무게대로 나온다', () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const r of D.REGIONS) {
    const count = {};
    for (let i = 0; i < 4000; i++) { const b = R.pickBird(r.id, rand); assert.ok(r.birds.includes(b.id)); count[b.rarity] = (count[b.rarity] || 0) + 1; }
    if (count.legend) assert.ok(count.legend < (count.common || 0), r.name + ' 전설이 흔한 새보다 많음');
  }
  assert.equal(R.pickBird('없는곳', rand), null);
  // 희귀할수록 빨리 날아감, 망원경은 느리게, 모이는 많이
  assert.ok(R.stayTime('legend', 0) < R.stayTime('common', 0));
  assert.ok(R.crossTime('legend', 0) < R.crossTime('common', 0));
  assert.ok(R.stayTime('rare', 4) > R.stayTime('rare', 0));
  assert.ok(R.maxBirds(4) > R.maxBirds(0) && R.spawnGap(4) < R.spawnGap(0));
  assert.equal(R.maxBirds(99), R.maxBirds(4));
});

test('새 발견: 처음엔 큰 포인트, 다시 보면 작은 포인트, 기록장에 남음', () => {
  const s = R.newSave();
  const r1 = R.recordSighting(s, 'sparrow', 'park', 1000);
  assert.equal(r1.isNew, true);
  assert.equal(r1.points, D.RARITIES.common.points);
  const r2 = R.recordSighting(s, 'sparrow', 'park', 2000);
  assert.equal(r2.isNew, false);
  assert.equal(r2.points, D.RARITIES.common.again);
  assert.equal(s.dex.sparrow.count, 2);
  assert.equal(s.dex.sparrow.where, 'park');
  assert.equal(s.log.length, 2);
  assert.equal(R.recordSighting(s, 'nobird', 'park', 0), null);
  for (let i = 0; i < R.LOG_MAX + 20; i++) R.recordSighting(s, 'magpie', 'park', i);
  assert.equal(s.log.length, R.LOG_MAX, '기록장은 최대 개수까지만');
});

test('미션은 차례로 진행되고 상을 준다', () => {
  assert.ok(R.MISSIONS.length >= 10);
  assert.equal(R.MISSIONS[0].title, '첫 번째 새 발견하기');
  const s = R.newSave();
  assert.equal(R.currentMission(s).index, 0);
  const res = R.recordSighting(s, 'sparrow', 'park', 1);
  assert.deepEqual(res.missions.map((m) => m.title), ['첫 번째 새 발견하기']);
  assert.equal(s.points, D.RARITIES.common.points + R.MISSIONS[0].reward);
  assert.equal(s.mission, 1);
  R.recordSighting(s, 'magpie', 'park', 2);
  const r3 = R.recordSighting(s, 'dove', 'park', 3);
  assert.ok(r3.missions.some((m) => m.title === '흔한 새 3종 발견하기'));
  // 미션은 하나씩: 아직 4번째(상점) 미션이 남았으면 그 뒤 미션은 깨지 않는다
  const cur = R.currentMission(s);
  assert.equal(cur.mission.key, 'species');
  // 모든 새를 보고 모든 지역을 열면 끝까지 간다
  const all = R.newSave();
  all.points = 1e8;
  D.REGIONS.forEach((r) => R.unlockRegion(all, r.id));
  R.buyUpgrade(all, 'scope');
  for (let i = 0; i < 100; i++) for (const b of D.BIRDS) R.recordSighting(all, b.id, D.REGIONS.find((r) => r.birds.includes(b.id)).id, i);
  assert.equal(all.mission, R.MISSIONS.length);
  assert.equal(R.currentMission(all).mission, null);
});

test('상점: 포인트가 모자라면 못 사고, 최고 단계에서 멈춘다', () => {
  const s = R.newSave();
  assert.equal(R.buyUpgrade(s, 'scope').error, 'points');
  assert.equal(R.buyUpgrade(s, 'rocket').error, 'unknown');
  s.points = 100000;
  for (let i = 0; i < R.MAX_LEVEL; i++) assert.ok(R.buyUpgrade(s, 'scope').ok);
  assert.equal(R.buyUpgrade(s, 'scope').error, 'max');
  assert.equal(s.scope, R.MAX_LEVEL);
  const spent = R.SCOPE_COSTS.reduce((a, b) => a + b, 0);
  assert.equal(s.points, 100000 - spent + R.MISSIONS.filter((m, i) => i < s.mission).reduce((a, m) => a + m.reward, 0));
  // 지역 열기
  const t = R.newSave();
  assert.equal(R.unlockRegion(t, 'park').error, 'owned');
  assert.equal(R.unlockRegion(t, 'jirisan').error, 'points');
  t.points = D.region('jirisan').cost;
  assert.ok(R.unlockRegion(t, 'jirisan').ok);
  assert.ok(t.regions.includes('jirisan'));
  assert.equal(R.unlockRegion(t, 'nowhere').error, 'unknown');
});

test('저장 불러오기: 망가진 값·범위 밖 값을 걸러 낸다', () => {
  assert.deepEqual(R.sanitize(null), R.newSave());
  assert.deepEqual(R.sanitize('abc'), R.newSave());
  const bad = R.sanitize({
    points: -50, earned: 'x', scope: 99, feed: -3, mission: 999, bought: 1e9, sightings: NaN,
    dex: { sparrow: { count: 0, first: 'x', where: 'mars' }, dragon: { count: 5 }, magpie: null, __proto__: { count: 1 } },
    regions: ['jirisan', 'jirisan', 'mars', 5], current: 'hado',
    log: [{ t: 1, bird: 'sparrow', region: 'park', isNew: 1 }, { bird: 'dragon', region: 'park' }, null, 'x']
  });
  assert.equal(bad.points, 0);
  assert.equal(bad.earned, 0);
  assert.equal(bad.scope, R.MAX_LEVEL);
  assert.equal(bad.feed, 0);
  assert.equal(bad.mission, R.MISSIONS.length);
  assert.equal(bad.bought, 1000);
  assert.equal(bad.sightings, 0);
  assert.deepEqual(Object.keys(bad.dex), ['sparrow']);
  assert.deepEqual(bad.dex.sparrow, { count: 1, first: 0, where: '' });
  assert.deepEqual(bad.regions, ['park', 'seoulforest', 'junam', 'jirisan']);
  assert.equal(bad.current, 'park', '열리지 않은 지역은 지금 지역이 될 수 없음');
  assert.deepEqual(bad.log, [{ t: 1, bird: 'sparrow', region: 'park', isNew: true }]);
  // 저장 → 글 → 불러오기 하면 그대로
  const s = R.newSave();
  s.points = 500;
  R.recordSighting(s, 'mandarin', 'seoulforest', 123456);
  R.unlockRegion(Object.assign(s, { points: 10000 }), 'upo');
  s.current = 'upo';
  assert.deepEqual(R.sanitize(JSON.parse(JSON.stringify(s))), s);
  // 아주 큰 기록장도 최대 개수만 남김
  const big = { log: Array.from({ length: 1000 }, (_, i) => ({ t: i, bird: 'sparrow', region: 'park' })) };
  assert.equal(R.sanitize(big).log.length, R.LOG_MAX);
});
