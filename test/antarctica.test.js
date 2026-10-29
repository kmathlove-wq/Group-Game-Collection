const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../public/antarctica/js/game.js');

const W = G.world();
const T = G.T;
const tileIdx = (x, y) => Math.floor(y / G.TILE) * G.COLS + Math.floor(x / G.TILE);
const base = (i) => W.bases[i];
// 지도에서 조건에 맞는 칸 하나의 가운데 좌표(주변 칸이 막히지 않은 곳)
function findTile(type, extra) {
  for (let r = 3; r < G.ROWS - 3; r++) {
    for (let c = 3; c < G.COLS - 3; c++) {
      if (W.tiles[r * G.COLS + c] !== type) continue;
      const x = (c + 0.5) * G.TILE, y = (r + 0.5) * G.TILE;
      if (G.blockedBox(x, y, G.PLAYER_R + G.TILE)) continue;
      if (extra && !extra(c, r, x, y)) continue;
      return { c, r, x, y };
    }
  }
  return null;
}
function reachable() {
  const seen = new Uint8Array(W.tiles.length);
  const start = Math.floor(base(0).y / G.TILE) * G.COLS + Math.floor(base(0).x / G.TILE);
  const q = [start]; seen[start] = 1;
  while (q.length) {
    const cur = q.pop(), cx = cur % G.COLS, cy = (cur - cx) / G.COLS;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= G.COLS || ny >= G.ROWS) continue;
      const ni = ny * G.COLS + nx;
      if (seen[ni] || G.BLOCK[W.tiles[ni]]) continue;
      seen[ni] = 1; q.push(ni);
    }
  }
  return seen;
}

test('지도: 두 기지·남극점이 이어져 있고, 동물·표본·보급 상자는 모두 갈 수 있는 자리에 있다', () => {
  assert.equal(W.tiles.length, G.COLS * G.ROWS);
  assert.equal(base(0).name, '세종기지');
  assert.equal(base(1).name, '장보고기지');
  const seen = reachable();
  const at = (p) => seen[tileIdx(p.x, p.y)] === 1;
  assert.ok(at(base(1)), '장보고기지에 갈 수 있음');
  assert.ok(at(W.pole), '남극점에 갈 수 있음');
  assert.ok(W.tiles.every((t, i) => G.BLOCK[t] || seen[i]), '못 가는 빈 땅이 없음(끼일 곳 없음)');
  for (const b of W.bases) assert.ok(!G.blockedBox(b.spawn.x, b.spawn.y, G.PLAYER_R), '기지 출발점이 비어 있음');
  // 모든 동물 종이 지도에 있음
  const species = new Set(W.animals.map((a) => a.sp));
  for (const a of G.ANIMALS) assert.ok(species.has(a.id), a.name + '이 지도에 있음');
  assert.ok(G.ANIMALS.length >= 12);
  for (const sm of G.SAMPLES) assert.equal(W.samples.filter((s) => s.kind === sm.id).length, sm.count, sm.name + ' 개수');
  for (const p of [...W.animals, ...W.samples, ...W.caches]) {
    assert.ok(at(p), '갈 수 있는 자리');
    assert.ok(!G.blockedBox(p.x, p.y, G.PLAYER_R), '막힌 칸이 아님');
    assert.notEqual(W.tiles[tileIdx(p.x, p.y)], T.CREV);
  }
  // 늘 같은 지도
  assert.ok(W.tiles.filter((t) => t === T.CREV).length > 100, '크레바스가 충분히 있음');
});

test('동물·표본 설명: 이름·설명이 비어 있지 않고 이름이 겹치지 않는다', () => {
  const names = new Set();
  for (const a of [...G.ANIMALS, ...G.SAMPLES]) {
    assert.ok(a.name && a.desc && a.desc.length > 15, a.id);
    assert.ok(!names.has(a.name)); names.add(a.name);
  }
});

test('체온: 밖에서는 줄고, 눈보라 때 더 빨리 줄고, 기지·텐트에서 오른다', () => {
  const spot = findTile(T.SNOW, (c, r) => G.latAt((r + 0.5) * G.TILE) > 0.5);
  const outside = (storm) => {
    const s = G.create(1);
    s.player.x = spot.x; s.player.y = spot.y;
    s.weather = storm ? { phase: 'storm', timer: 999 } : { phase: 'calm', timer: 999 };
    G.update(s, null, 5);
    return 100 - s.player.warm;
  };
  const calm = outside(false), storm = outside(true);
  assert.ok(calm > 0, '밖에서는 체온이 줄어요');
  assert.ok(storm > calm * 2.5, '눈보라 때 훨씬 빨리 줄어요');

  // 방한복을 입으면 덜 줄어요
  const s2 = G.create(1);
  s2.up.suit = 4; s2.player.warm = G.maxWarm(s2.up);
  s2.player.x = spot.x; s2.player.y = spot.y; s2.weather = { phase: 'calm', timer: 999 };
  G.update(s2, null, 5);
  assert.ok(G.maxWarm(s2.up) - s2.player.warm < calm);

  // 기지에서 회복
  const s3 = G.create(1);
  s3.player.x = base(0).x; s3.player.y = base(0).y; s3.player.warm = 20; s3.player.food = 10;
  G.update(s3, null, 2);
  assert.ok(s3.player.warm > 70 && s3.player.food > 40);

  // 텐트: 없으면 못 치고, 있으면 쳐서 몸을 녹이고, 움직이면 걷힘
  const s4 = G.create(1);
  s4.player.x = spot.x; s4.player.y = spot.y; s4.player.warm = 30;
  let ev = G.update(s4, { tent: true }, 0.05);
  assert.ok(ev.some((e) => e.type === 'tent-none'));
  s4.up.tent = 1; s4.player.tentsLeft = 1;
  ev = G.update(s4, { tent: true }, 0.05);
  assert.ok(ev.some((e) => e.type === 'tent-on') && s4.player.camping);
  s4.weather = { phase: 'storm', timer: 999 };
  G.update(s4, null, 3);
  assert.ok(s4.player.warm > 50, '텐트 안은 눈보라에도 따뜻함');
  ev = G.update(s4, { x: 1, y: 0 }, 0.05);
  assert.ok(ev.some((e) => e.type === 'tent-off') && !s4.player.camping);
  ev = G.update(s4, { tent: true }, 0.05);
  assert.ok(ev.some((e) => e.type === 'tent-empty'), '한 번 나갈 때 텐트 수만큼만');
});

test('체온이 0이 되면 구조돼 기지로 돌아오고 가방을 잃는다', () => {
  const spot = findTile(T.SNOW, (c, r) => G.latAt((r + 0.5) * G.TILE) > 0.5);
  const s = G.create(2);
  s.player.x = spot.x; s.player.y = spot.y; s.player.warm = 0.5; s.player.bag = ['moss', 'core'];
  const ev = G.update(s, null, 1);
  const r = ev.find((e) => e.type === 'rescue');
  assert.ok(r && r.lost === 2);
  assert.deepEqual(s.player.bag, []);
  assert.equal(s.rescues, 1);
  assert.ok(G.baseAt(s.player.x, s.player.y) >= 0 || Math.hypot(s.player.x - base(0).spawn.x, s.player.y - base(0).spawn.y) < 120);
  assert.equal(s.player.warm, G.maxWarm(s.up));
});

test('크레바스: 멀리선 안 보이고 가까이 가면 보이며, 탐지기가 있으면 더 멀리서 보이고, 빠지면 피해를 입고 밀려난다', () => {
  const crev = findTile(T.CREV) || (() => { for (let i = 0; i < W.tiles.length; i++) if (W.tiles[i] === T.CREV) { const c = i % G.COLS, r = (i - c) / G.COLS; return { c, r, x: (c + 0.5) * G.TILE, y: (r + 0.5) * G.TILE }; } })();
  const i = crev.r * G.COLS + crev.c;
  const s = G.create(3);
  assert.equal(s.revealed[i], 0);
  assert.ok(G.revealRadius({ detector: 3 }) > G.revealRadius({ detector: 0 }) * 3);
  // 탐지기 3단계로 5칸 떨어진 곳에 서면 보임(탐지기 없으면 안 보임) — 곧바로 서 볼 수 있는 자리를 찾음
  let found = false;
  for (const [dx, dy] of [[5, 0], [-5, 0], [0, 5], [0, -5], [4, 3], [-4, 3], [4, -3], [-4, -3]]) {
    const x = crev.x + dx * G.TILE, y = crev.y + dy * G.TILE;
    if (G.blockedBox(x, y, G.PLAYER_R) || G.tileAt(x, y) === T.CREV) continue;
    const a = G.create(3); a.player.x = x; a.player.y = y; G.update(a, null, 0.02);
    const b = G.create(3); b.up.detector = 3; b.player.x = x; b.player.y = y; G.update(b, null, 0.02);
    assert.equal(a.revealed[i], 0, '탐지기 없으면 5칸 밖은 안 보임');
    assert.equal(b.revealed[i], 1, '탐지기 3단계면 보임');
    found = true; break;
  }
  assert.ok(found, '시험할 자리를 찾음');
  // 빠짐
  s.player.safeX = s.player.x; s.player.safeY = s.player.y;
  const safe = { x: s.player.x, y: s.player.y };
  s.player.x = crev.x; s.player.y = crev.y;
  const before = s.player.warm;
  const ev = G.update(s, null, 0.02);
  assert.ok(ev.some((e) => e.type === 'crevasse'));
  assert.ok(s.player.warm <= before - 19);
  assert.equal(s.revealed[i], 1);
  assert.ok(s.player.stun > 0);
  assert.deepEqual({ x: s.player.x, y: s.player.y }, safe);
});

test('얼음은 아이젠이 없으면 미끄러지고, 깊은 눈은 느리다', () => {
  const ice = findTile(T.ICE, (c, r) => {
    for (let k = -4; k <= 4; k++) if (W.tiles[r * G.COLS + c + k] !== T.ICE) return false;
    return true;
  });
  assert.ok(ice, '넓은 얼음이 있음');
  const slide = (crampon) => {
    const s = G.create(4);
    s.up.crampon = crampon;
    s.player.x = ice.x - 2 * G.TILE; s.player.y = ice.y;
    s.player.vx = 120; // 달리던 중
    G.update(s, null, 0.5); // 손을 뗌
    return Math.abs(s.player.vx);
  };
  assert.ok(slide(0) > 30, '아이젠 없으면 계속 미끄러짐');
  assert.ok(slide(1) < 1, '아이젠이 있으면 바로 멈춤');
  const s = G.create(4);
  assert.ok(G.speedAt(s, T.DEEP) < G.speedAt(s, T.SNOW) * 0.6);
  s.up.mobile = 3;
  assert.ok(G.speedAt(s, T.SNOW) > 150 * 1.5);
});

test('관찰은 처음 한 번만 점수, 표본은 가방 칸만큼 줍고 기지에 가져가면 연구 점수', () => {
  const s = G.create(5);
  const a = W.animals[0];
  s.player.x = a.x; s.player.y = a.y + 20;
  let ev = G.update(s, { act: true }, 0.02);
  const ob = ev.find((e) => e.type === 'observe');
  assert.ok(ob && ob.first && ob.sp === a.sp);
  const after = s.total;
  assert.ok(after >= 25);
  ev = G.update(s, { act: true }, 0.02);
  assert.ok(ev.find((e) => e.type === 'observe' && !e.first));
  assert.equal(s.total, after, '두 번째 관찰은 점수 없음');

  const s2 = G.create(6);
  s2.player.bag = ['moss', 'moss', 'moss'];
  const sm = s2.samples[0];
  s2.player.x = sm.x; s2.player.y = sm.y;
  ev = G.update(s2, { act: true }, 0.02);
  assert.ok(ev.some((e) => e.type === 'bag-full'));
  s2.up.sled = 1;
  ev = G.update(s2, { act: true }, 0.02);
  assert.ok(ev.some((e) => e.type === 'collect' && e.kind === sm.kind));
  assert.equal(s2.player.bag.length, 4);
  assert.ok(s2.samples[0].wait > 0, '주운 표본은 잠시 뒤 다시 나옴');
  s2.player.x = base(0).x; s2.player.y = base(0).y;
  const total = s2.total;
  ev = G.update(s2, null, 0.02);
  const d = ev.find((e) => e.type === 'deliver');
  assert.ok(d && d.count === 4);
  const expect = 30 + G.SAMPLES.find((x) => x.id === sm.kind).points;
  assert.ok(s2.total - total >= expect);
  assert.deepEqual(s2.player.bag, []);
});

test('장비는 기지 안에서 연구 점수로만 산다', () => {
  const s = G.create(7);
  s.rp = 1000; s.total = 1000;
  s.player.x = W.pole.x; s.player.y = W.pole.y + 60;
  assert.equal(G.buy(s, 'suit').why, 'outside');
  s.player.x = base(0).x; s.player.y = base(0).y;
  assert.ok(G.buy(s, 'suit').ok);
  assert.equal(s.up.suit, 1);
  assert.equal(s.rp, 1000 - G.UPGRADES.suit.costs[0]);
  assert.ok(G.buy(s, 'crampon').ok);
  assert.equal(G.buy(s, 'crampon').why, 'max');
  s.rp = 0;
  assert.equal(G.buy(s, 'sled').why, 'points');
  assert.equal(G.buy(s, 'nope').why, 'unknown');
});

test('미션은 차례로 끝나고, 남극점은 마지막 미션일 때 엔딩이 된다', () => {
  const s = G.create(8);
  s.player.x = W.pole.x; s.player.y = W.pole.y + 30;
  let ev = G.update(s, null, 0.02);
  assert.ok(ev.some((e) => e.type === 'pole-early'));
  assert.ok(!s.ended);
  // 앞 미션 조건을 모두 채움
  G.ANIMALS.slice(0, 8).forEach((a) => { s.seen[a.id] = true; });
  s.delivered = { moss: 2, fossil: 2, meteorite: 1, core: 1 };
  s.up.suit = 1; s.visited.jangbogo = true;
  s.player.x = base(0).x; s.player.y = base(0).y;
  ev = G.update(s, null, 0.02);
  assert.equal(ev.filter((e) => e.type === 'mission').length, G.MISSIONS.length - 1);
  assert.equal(s.mission, G.MISSIONS.length - 1);
  assert.deepEqual(G.missionTarget(s) && G.missionTarget(s).name, '남극점');
  s.player.x = W.pole.x; s.player.y = W.pole.y + 30; s.player.atPole = false;
  ev = G.update(s, null, 0.02);
  assert.ok(ev.some((e) => e.type === 'ending'));
  assert.ok(s.ended);
  assert.equal(s.mission, G.MISSIONS.length);
});

test('눈보라는 예고 → 시작 → 끝 순서로 온다', () => {
  const s = G.create(9);
  const order = [];
  for (let i = 0; i < 400; i++) G.update(s, null, 1).forEach((e) => { if (e.type.startsWith('blizzard')) order.push(e.type); });
  assert.ok(order.length >= 6);
  for (let i = 0; i < order.length; i++) assert.equal(order[i], ['blizzard-warn', 'blizzard-start', 'blizzard-end'][i % 3]);
});

test('저장: 왕복하면 같고, 범위 밖·이상한 값은 걸러 낸다', () => {
  const s = G.create(10);
  s.player.x = base(1).spawn.x; s.player.y = base(1).spawn.y;
  s.up.suit = 2; s.up.sled = 1; s.up.tent = 2; s.player.tentsLeft = 1;
  s.rp = 123; s.total = 456; s.seen.emperor = true; s.seen.skua = true;
  s.delivered.moss = 3; s.mission = 4; s.visited.jangbogo = true; s.rescues = 2;
  s.player.bag = ['moss', 'fossil']; s.player.warm = 77.5; s.player.food = 33.3;
  s.samples[3].wait = 40; s.caches[1].wait = 10;
  const crevIdx = W.tiles.findIndex((t) => t === T.CREV);
  s.revealed[crevIdx] = 1;
  const json = JSON.parse(JSON.stringify(G.toSave(s)));
  const r = G.create(11, json);
  assert.deepEqual(G.toSave(r), G.toSave(s));
  assert.equal(r.revealed[crevIdx], 1);

  const bad = G.create(12, {
    v: 1, x: 1e9, y: NaN, warm: -5, food: 1e9, bag: ['moss', 'gold', 7, 'core', 'core', 'core', 'core', 'core'],
    up: { suit: 99, sled: -1, crampon: 'yes', mobile: 2.7, detector: null, tent: 3 }, tentsLeft: 50, rp: 1e12, total: 5,
    seen: ['emperor', 'dragon', 3], delivered: { moss: -4, core: 'x' }, mission: 999, visited: { jangbogo: 'yes' },
    rescues: Infinity, revealed: [-1, 0, 1.5, 1e9, crevIdx], samples: [1e9, -3, 'a'], caches: { a: 1 }
  });
  assert.equal(bad.up.suit, 4); assert.equal(bad.up.sled, 0); assert.equal(bad.up.crampon, 0); assert.equal(bad.up.mobile, 2); assert.equal(bad.up.detector, 0);
  assert.ok(bad.player.bag.length <= G.capacity(bad.up));
  assert.ok(bad.player.bag.every((k) => G.SAMPLES.some((x) => x.id === k)));
  assert.equal(bad.rp, 5, '쓸 점수는 모은 점수보다 많을 수 없음');
  assert.deepEqual(Object.keys(bad.seen), ['emperor']);
  assert.equal(bad.delivered.moss, 0); assert.equal(bad.delivered.core, 0);
  assert.equal(bad.mission, G.MISSIONS.length);
  assert.equal(bad.visited.jangbogo, false);
  assert.equal(bad.rescues, 0);
  assert.equal(bad.player.tentsLeft, 3);
  assert.ok(bad.player.warm > 0 && bad.player.food <= 100);
  assert.deepEqual({ x: bad.player.x, y: bad.player.y }, base(0).spawn);
  assert.equal(bad.revealed.reduce((a, b) => a + b, 0), 1);
  assert.equal(bad.samples[0].wait, 150); assert.equal(bad.samples[1].wait, 0);
  // 바다 한가운데 위치는 기지로
  const sea = findTile(T.SEA, () => true) || { x: 100, y: G.WORLD_H - 20 };
  const s3 = G.create(13, Object.assign(G.toSave(G.create(1)), { x: sea.x, y: sea.y }));
  assert.ok(!G.blockedBox(s3.player.x, s3.player.y, G.PLAYER_R));
  // 쓰레기 저장은 무시
  for (const junk of [null, 5, 'x', [], { v: 2 }]) assert.doesNotThrow(() => G.create(1, junk));
});

test('무작위 조작 모의 실험: NaN 없음, 막힌 칸에 끼지 않음, 계속 움직일 수 있음', () => {
  for (let run = 0; run < 12; run++) {
    const s = G.create(100 + run);
    let seed = 7 + run;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    if (run % 3 === 1) { s.up.mobile = 3; s.up.crampon = 1; }
    if (run % 3 === 2) { s.up.tent = 3; s.up.sled = 3; }
    let input = { x: 0, y: -1 }, travelled = 0, last = { x: s.player.x, y: s.player.y };
    for (let i = 0; i < 6000; i++) { // 5분(0.05초 × 6000)
      if (i % 40 === 0) input = { x: rnd() * 2 - 1, y: rnd() * 2 - 1.3, act: rnd() < 0.3, tent: rnd() < 0.05 };
      else { input.act = false; input.tent = false; }
      const ev = G.update(s, input, 0.05);
      const p = s.player;
      for (const k of ['x', 'y', 'vx', 'vy', 'warm', 'food']) assert.ok(Number.isFinite(p[k]), `${k} 숫자 (run ${run}, ${i})`);
      assert.ok(Number.isFinite(s.rp) && Number.isFinite(s.total));
      assert.ok(!G.blockedBox(p.x, p.y, G.PLAYER_R), `막힌 칸에 낌 (run ${run}, ${i})`);
      assert.ok(p.warm >= 0 && p.warm <= G.maxWarm(s.up) + 1e-9 && p.food >= 0 && p.food <= 100);
      assert.ok(p.bag.length <= G.capacity(s.up));
      assert.ok(ev.every((e) => typeof e.type === 'string'));
      travelled += Math.hypot(p.x - last.x, p.y - last.y);
      last = { x: p.x, y: p.y };
    }
    assert.ok(travelled > 3000, `충분히 돌아다님 (run ${run}: ${Math.round(travelled)})`);
  }
  // 어떤 자리에서든 네 방향 중 하나로는 움직일 수 있다(갇힘 없음): 길가 칸을 골고루 시험
  for (let r = 3; r < G.ROWS - 3; r += 7) {
    for (let c = 3; c < G.COLS - 3; c += 7) {
      const x = (c + 0.5) * G.TILE, y = (r + 0.5) * G.TILE;
      if (G.blockedBox(x, y, G.PLAYER_R) || G.tileAt(x, y) === T.CREV) continue;
      const moved = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const s = G.create(1); s.up.crampon = 1; s.player.x = x; s.player.y = y; s.weather = { phase: 'calm', timer: 999 };
        G.update(s, { x: dx, y: dy }, 0.5);
        return Math.hypot(s.player.x - x, s.player.y - y) > 10;
      });
      assert.ok(moved, `(${c}, ${r})에서 움직일 수 있음`);
    }
  }
});

test('이상한 입력·시간에도 멈추지 않는다', () => {
  const s = G.create(20);
  for (const inp of [null, {}, { x: NaN, y: Infinity }, { x: '1', y: {} }, { x: 1e9, y: -1e9 }]) {
    for (const dt of [0, -1, NaN, 1e9, 0.016]) assert.doesNotThrow(() => G.update(s, inp, dt));
  }
  assert.ok(Number.isFinite(s.player.x) && Number.isFinite(s.player.y));
  assert.ok(!G.blockedBox(s.player.x, s.player.y, G.PLAYER_R));
});
