const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createGeometryDashScoreStore } = require('../lib/geometry-dash-scores');
const Rules = require('../public/mining-tycoon/js/rules.js');
const World = require('../public/mining-tycoon/js/world.js');
const Game = require('../public/mining-tycoon/js/game.js');
const Save = require('../public/mining-tycoon/js/save.js');

const TILE = Rules.TILE;
const tempFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mt-scores-')), 'scores.json');

// 차를 (col, row) 칸 위에 세운다. 그 칸은 단단한 땅이어야 한다.
function standOn(s, col, row) {
  s.car.x = col + 0.5;
  s.car.y = row - Rules.CAR_SIZE / 2;
  s.car.vx = 0; s.car.vy = 0;
}
function run(s, input, seconds) {
  const events = [];
  for (let t = 0; t < seconds; t += 1 / 60) events.push(...Game.update(s, input, 1 / 60));
  return events;
}
function setTile(s, x, y, tile, ore = 0) {
  s.world.tiles[y * s.world.w + x] = tile;
  s.world.ores[y * s.world.w + x] = ore;
}

test('순위 저장소: 작을수록 위(asc)와 한 사람당 한 줄(perPlayer)', () => {
  const time = createGeometryDashScoreStore(tempFile(), { order: 'asc', perPlayer: true });
  time.addScore('느림', 900, 'a');
  time.addScore('빠름', 300, 'b');
  assert.deepEqual(time.getTop(10).map((e) => e.name), ['빠름', '느림']);
  time.addScore('느림', 1200, 'a'); // 더 나쁜 기록은 무시
  assert.equal(time.getTop(10).find((e) => e.name === '느림').score, 900);
  assert.equal(time.addScore('느림', 100, 'a').rank, 1); // 더 좋은 기록은 같은 줄을 바꿈
  assert.equal(time.getTop(10).length, 2);
  assert.ok(time.getTop(10).every((e) => !('id' in e)));

  const money = createGeometryDashScoreStore(tempFile(), { perPlayer: true });
  money.addScore('광부', 100, 'p1');
  money.addScore('광부', 5000, 'p1');
  money.addScore('광부', 3000, 'p1');
  assert.deepEqual(money.getTop(10).map((e) => e.score), [5000]);

  const classic = createGeometryDashScoreStore(tempFile());
  classic.addScore('a', 1, 'x'); classic.addScore('a', 2, 'x');
  assert.equal(classic.getTop(10).length, 2, '기존 게임은 기록마다 한 줄 그대로');
});

test('땅 만들기: 크기·콘크리트·지각 바닥·맨 아래 바닥·보물 하나·층', () => {
  const world = World.createWorld(42);
  assert.equal(world.w, Rules.WIDTH);
  assert.equal(world.h, Rules.DEPTH + 1);
  assert.equal(World.tileAt(world, 0, 0), TILE.CONCRETE);
  assert.ok(world.tiles.slice((world.h - 1) * world.w).every((t) => t === TILE.CORE_FLOOR), '맨 아래는 내핵처럼 보이는 못 파는 바닥');
  assert.ok(world.tiles.slice(Rules.CRUST_DEPTH * world.w, (Rules.CRUST_DEPTH + 1) * world.w).every((t) => t === TILE.SEAL), '301m 줄은 막힌 지각 바닥');
  assert.equal(world.tiles.filter((t) => t === TILE.TREASURE).length, 1);
  assert.equal(Math.floor(world.tiles.indexOf(TILE.TREASURE) / world.w), Rules.CRUST_DEPTH - 1, '보물은 300m 줄');
  const at = (depth) => new Set(Array.from(world.tiles.slice((depth - 1) * world.w, depth * world.w)));
  assert.ok(at(450).has(TILE.MANTLE) && !at(450).has(TILE.OUTER));
  assert.ok(at(700).has(TILE.OUTER) && !at(700).has(TILE.LAVA), '외핵에는 용암이 없다');
  assert.ok(at(950).has(TILE.INNER) && !at(950).has(TILE.LAVA), '내핵에는 용암이 없다');
  assert.deepEqual(Array.from(World.createWorld(42).tiles), Array.from(world.tiles), '같은 씨앗이면 같은 땅');
  for (let y = 0; y < Rules.LAVA_DEPTH - 1; y++) {
    for (let x = 0; x < world.w; x++) assert.notEqual(World.tileAt(world, x, y), TILE.LAVA, '100m 위에는 용암이 없다');
  }
  World.openSeal(world);
  assert.ok(world.tiles.slice(Rules.CRUST_DEPTH * world.w, (Rules.CRUST_DEPTH + 1) * world.w).every((t) => t === TILE.MANTLE), '보물을 찾으면 지각 바닥이 맨틀이 된다');
});

// 보물을 찾은 상태(엔딩 뒤)로 만든다.
function afterEnding(s) { s.treasureTime = 1; World.openSeal(s.world); return s; }
// (col, row) 칸을 비우고 그 아래 칸을 tile로 채운 뒤 차를 세운다.
function placeAt(s, col, row, below) {
  setTile(s, col, row, TILE.EMPTY);
  setTile(s, col, row + 1, below);
  s.dig = null; // 앞 시험에서 파던 중이면 멈춘다
  standOn(s, col, row + 1);
}

test('열 피해: 층마다 다르고 열보호 단계만큼 줄며 5단계면 0', () => {
  const s = afterEnding(Game.newGame({ seed: 21 }));
  placeAt(s, 20, 699, TILE.OUTER); // 700m = 외핵(초당 8)
  s.hp = 400; s.levels.hull = 4;
  run(s, {}, 1);
  assert.ok(Math.abs(s.hp - 392) < 0.6, '외핵 1초에 8 닳음: ' + s.hp);
  s.levels.heat = 2; s.hp = 400; // 50%
  run(s, {}, 1);
  assert.ok(Math.abs(s.hp - 396) < 0.6, '열보호 3단계면 4만 닳음: ' + s.hp);
  s.levels.heat = 5; s.hp = 400;
  run(s, {}, 2);
  assert.equal(s.hp, 400, '열보호 끝 단계면 아예 안 닳음');
  const crust = Game.newGame({ seed: 21 });
  placeAt(crust, 20, 200, TILE.ROCK);
  crust.hp = 100;
  run(crust, {}, 1);
  assert.equal(crust.hp, 100, '지각에서는 열 피해가 없다');
});

test('지각 바닥은 엔딩 전엔 못 파고, 엔딩 뒤 맨틀은 드릴 5단계·외핵 7단계·내핵 9단계부터', () => {
  const s = Game.newGame({ seed: 22 });
  s.levels.drill = 9;
  placeAt(s, 20, Rules.CRUST_DEPTH - 1, TILE.SEAL);
  assert.ok(run(s, { down: true }, 0.3).some((e) => e.type === 'blocked' && e.reason === 'seal'));
  const t = afterEnding(Game.newGame({ seed: 22 }));
  t.fuel = 100;
  for (const [tile, need] of [[TILE.MANTLE, 4], [TILE.OUTER, 6], [TILE.INNER, 8]]) {
    t.levels.drill = need - 1;
    placeAt(t, 20, 500, tile);
    const blocked = run(t, { down: true }, 0.3).find((e) => e.type === 'blocked');
    assert.equal(blocked && blocked.need, need + 1, '드릴 ' + (need + 1) + '단계가 필요하다고 알려 준다');
    t.levels.drill = need;
    placeAt(t, 20, 500, tile);
    assert.ok(run(t, { down: true }, 1).some((e) => e.type === 'dig-done'));
  }
});

test('업그레이드 잠금: 드릴 6단계·연료통 6단계·열보호·자동 드릴은 엔딩 뒤에만, 입장권은 열보호 5단계부터', () => {
  const s = Game.newGame({ seed: 23 });
  s.money = 1e9;
  for (let i = 0; i < 4; i++) assert.ok(Game.buyUpgrade(s, 'drill').ok);
  assert.equal(Game.buyUpgrade(s, 'drill').reason, 'locked', '5단계 다음은 잠김');
  assert.equal(Game.buyUpgrade(s, 'heat').reason, 'locked');
  assert.equal(Game.buyAuto(s).reason, 'locked');
  assert.equal(Game.buyTicket(s).reason, 'locked');
  assert.ok(Game.buyUpgrade(s, 'minigas').ok, '간이 주유소는 처음부터');
  afterEnding(s);
  assert.ok(Game.buyUpgrade(s, 'drill').ok);
  assert.equal(Game.buyTicket(s).reason, 'heat');
  for (let i = 0; i < 5; i++) assert.ok(Game.buyUpgrade(s, 'heat').ok);
  assert.ok(Game.buyTicket(s).ok);
  assert.equal(Game.buyTicket(s).reason, 'have');
});

test('간이 주유소: 날지 않을 때는 연료가 차고, 날 때는 줄어든다', () => {
  const s = Game.newGame({ seed: 24 });
  s.levels.minigas = 5; s.levels.engine = 4; // 가장 센 간이 주유소 + 연료를 가장 덜 쓰는 엔진
  placeAt(s, 20, 30, TILE.ROCK);
  s.fuel = 50;
  run(s, {}, 2);
  assert.ok(s.fuel > 50, '가만히 있으면 찬다: ' + s.fuel);
  setTile(s, 20, 29, TILE.EMPTY); setTile(s, 20, 28, TILE.EMPTY); setTile(s, 20, 27, TILE.EMPTY);
  const before = s.fuel;
  run(s, { up: true }, 0.5);
  assert.ok(s.fuel < before, '날 때는 준다');
});

test('즉시 팔기: 5개까지, 땅속에서 가방을 판 돈으로 바꾸고 빚부터 갚는다', () => {
  const s = Game.newGame({ seed: 25 });
  s.money = 10000;
  for (let i = 0; i < 5; i++) assert.ok(Game.buyInstant(s).ok);
  assert.equal(Game.buyInstant(s).reason, 'full');
  assert.equal(s.money, 5000);
  assert.equal(Game.useInstant(s).reason, 'empty');
  s.bag[8] = 1; s.debt = 1000; // 다이아몬드 1개 = 6,000원
  const r = Game.useInstant(s);
  assert.ok(r.ok);
  assert.equal(r.debtPaid, 1000);
  assert.equal(s.money, 10000);
  assert.equal(s.instant, 4);
  assert.equal(s.earned, 6000);
});

test('자동 드릴: 광석을 바로 돈으로, 30대까지, 수명이 다하면 사라지고, 열보호 없이는 지각 밑으로 안 간다', () => {
  const s = afterEnding(Game.newGame({ seed: 26 }));
  s.money = 1e9; s.levels.drill = 9;
  for (let i = 0; i < Rules.AUTO_MAX; i++) assert.ok(Game.buyAuto(s).ok);
  assert.equal(Game.buyAuto(s).reason, 'full');
  const money = s.money;
  let deepest = 0;
  for (let t = 0; t < 60 * 119; t++) {
    Game.update(s, {}, 1 / 60);
    for (const a of s.autos) deepest = Math.max(deepest, a.y);
  }
  assert.ok(s.autoEarned > 0 && s.money > money, '번 돈이 바로 들어온다');
  assert.equal(s.earned, s.autoEarned, '번 돈 순위에도 들어간다');
  assert.ok(deepest <= Rules.CRUST_DEPTH - 1, '열보호 없이는 300m 아래로 못 간다: ' + deepest);
  run(s, {}, 2);
  assert.equal(s.autos.length, 0, '처음 수명(120초)이 지나면 사라진다');
  s.levels.autoHeat = 1;
  Game.buyAuto(s);
  for (let t = 0; t < 60 * 59; t++) { Game.update(s, {}, 1 / 60); deepest = Math.max(deepest, s.autos[0] ? s.autos[0].y : 0); }
  assert.ok(deepest > Rules.CRUST_DEPTH, '열보호를 달면 지각 밑으로 내려간다: ' + deepest);
});

test('지구 중심: 입장권을 쓰면 방으로, 나가면 입장권이 사라지고, 버튼을 누르면 두 번째 엔딩', () => {
  const s = afterEnding(Game.newGame({ seed: 27 }));
  s.ticket = 1;
  assert.ok(Game.useTicket(s).ok);
  assert.ok(s.inCore && s.ticket === 0);
  assert.equal(Game.depthOf(s), Rules.DEPTH);
  assert.equal(Game.heatDps(s), 0, '방 안은 안전하다');
  s.car.x = (Game.CORE_DOOR.x0 + Game.CORE_DOOR.x1) / 2;
  assert.ok(run(s, { down: true }, 0.2).some((e) => e.type === 'core-door'));
  Game.leaveCore(s);
  assert.ok(!s.inCore && !Game.isUnderground(s) && s.ticket === 0, '지상으로, 입장권 없음');
  s.ticket = 1; Game.useTicket(s);
  s.car.x = (Game.CORE_BUTTON.x0 + Game.CORE_BUTTON.x1) / 2;
  assert.ok(run(s, { down: true }, 0.2).some((e) => e.type === 'core-button'));
  s.time = 1234.4;
  assert.equal(Game.pressCoreButton(s).time, 1234);
  const time = s.time;
  run(s, { right: true }, 1);
  assert.equal(s.time, time, '지구가 부서진 뒤에는 시간도 멈춘다');
  assert.equal(Save.deserialize(Save.serialize(s)).destroyedTime, 1234);
});

test('예전 저장(버전 1, 땅 300m)을 불러오면 위 300m는 그대로, 아래는 새로 붙는다', () => {
  const w = World.createWorld(99);
  const pack = (a) => Array.from(a).map((v) => String.fromCharCode(48 + v)).join('');
  const oldH = Rules.OLD_DEPTH + 1, n = Rules.WIDTH * oldH;
  const tiles = new Uint8Array(n);
  tiles.set(w.tiles.subarray(0, Rules.WIDTH * Rules.OLD_DEPTH));
  tiles.fill(TILE.BEDROCK, Rules.WIDTH * Rules.OLD_DEPTH);
  tiles[5 * Rules.WIDTH + 20] = TILE.EMPTY; // 예전에 판 칸
  const ores = new Uint8Array(n); ores[6 * Rules.WIDTH + 20] = 8;
  const base = { version: 1, name: '옛광부', playerId: 'old', world: { w: Rules.WIDTH, h: oldH, seed: 99, tiles: pack(tiles), ores: pack(ores), seen: pack(new Uint8Array(n)) },
    car: { x: 2.5, y: -0.39, face: 1 }, levels: { drill: 4, fuel: 4, bag: 0, hull: 0, engine: 0, range: 0 }, bag: [0, 1, 0, 0, 0, 0, 0, 0, 0],
    fuel: 600, hp: 100, money: 5, debt: 0, earned: 5, recall: 0, wide: true, time: 10, treasureTime: null, maxDepth: 30 };
  const s = Save.deserialize(JSON.stringify(base));
  assert.equal(s.world.h, Rules.DEPTH + 1);
  assert.equal(World.tileAt(s.world, 20, 5), TILE.EMPTY);
  assert.equal(s.world.ores[6 * Rules.WIDTH + 20], 8);
  assert.equal(World.tileAt(s.world, 3, Rules.CRUST_DEPTH), TILE.SEAL, '보물 전이면 바닥이 막혀 있다');
  assert.equal(s.levels.drill, 4);
  assert.equal(s.levels.heat, 0);
  assert.equal(s.bag[1], 1);
  assert.equal(s.bag.length, Rules.ORES.length);
  const found = Save.deserialize(JSON.stringify({ ...base, treasureTime: 50 }));
  assert.equal(World.tileAt(found.world, 3, Rules.CRUST_DEPTH), TILE.MANTLE, '이미 보물을 찾았으면 바로 열려 있다');
});

test('파기: 아래로 파면 광석을 줍고, 바위는 드릴 3단계부터', () => {
  const s = Game.newGame({ seed: 7 });
  setTile(s, 20, 0, TILE.DIRT, 1);
  standOn(s, 20, 0);
  const events = run(s, { down: true }, 0.5);
  assert.ok(events.some((e) => e.type === 'dig-done' && e.ores.includes(1)));
  assert.equal(s.bag[1], 1);

  const r = Game.newGame({ seed: 7 });
  setTile(r, 20, 5, TILE.ROCK);
  standOn(r, 20, 5);
  assert.ok(run(r, { down: true }, 0.3).some((e) => e.type === 'blocked' && e.reason === 'too-hard'));
  r.levels.drill = Rules.ROCK_DRILL_LEVEL;
  assert.ok(run(r, { down: true }, 0.6).some((e) => e.type === 'dig-done'));
});

test('파는 범위 3x3과 1칸 끄기, 용암은 그대로 남는다', () => {
  const s = Game.newGame({ seed: 3 });
  for (let y = 9; y <= 12; y++) for (let x = 18; x <= 22; x++) setTile(s, x, y, TILE.DIRT);
  setTile(s, 19, 11, TILE.LAVA);
  setTile(s, 20, 9, TILE.EMPTY);
  standOn(s, 20, 10);
  s.levels.range = 2; // 3x3
  const done = run(s, { down: true }, 0.4).find((e) => e.type === 'dig-done');
  assert.equal(done.cells, 7, '3x3 = 9칸에서 차가 있던 빈 칸과 용암 한 칸이 빠진다');
  assert.equal(World.tileAt(s.world, 19, 11), TILE.LAVA);

  const one = Game.newGame({ seed: 3 });
  for (let y = 9; y <= 12; y++) for (let x = 18; x <= 22; x++) setTile(one, x, y, TILE.DIRT);
  setTile(one, 20, 9, TILE.EMPTY);
  standOn(one, 20, 10);
  one.levels.range = 3;
  one.wide = false;
  assert.equal(run(one, { down: true }, 0.4).find((e) => e.type === 'dig-done').cells, 1);
});

test('연료가 떨어지면 구조대: 돈이 모자란 만큼 빚, 팔면 빚부터 갚고 빚이 있으면 업그레이드 못 함', () => {
  const s = Game.newGame({ seed: 5 });
  setTile(s, 20, 30, TILE.DIRT);
  standOn(s, 20, 30);
  s.money = 50;
  s.fuel = 0.01;
  const rescue = run(s, {}, 0.5).find((e) => e.type === 'rescue');
  assert.ok(rescue);
  assert.equal(s.money, 0);
  assert.equal(s.debt, rescue.cost - 50);
  assert.ok(!Game.isUnderground(s), '지상으로 끌어올린다');
  assert.equal(Game.buyUpgrade(s, 'drill').reason, 'debt');

  s.bag[5] = 2; // 금 2개 = 800원
  const result = Game.sell(s);
  assert.equal(result.debtPaid, rescue.cost - 50);
  assert.equal(s.debt, 0);
  assert.equal(s.earned, 800, '번 돈에는 빚 갚은 돈도 들어간다');
  assert.equal(s.money, 800 - (rescue.cost - 50));
});

test('지상에서는 연료가 줄지 않는다', () => {
  const s = Game.newGame({ seed: 9 });
  s.fuel = 10;
  run(s, { right: true }, 3);
  assert.equal(s.fuel, 10);
});

test('저장했다 불러오면 그대로, 망가진 저장은 오류', () => {
  const s = Game.newGame({ seed: 11, name: '광부', playerId: 'abc' });
  s.money = 1234; s.levels.bag = 2; s.bag[3] = 4; s.time = 77;
  setTile(s, 25, 3, TILE.EMPTY);
  const back = Save.deserialize(Save.serialize(s));
  assert.equal(back.money, 1234);
  assert.equal(back.levels.bag, 2);
  assert.equal(back.bag[3], 4);
  assert.equal(back.name, '광부');
  assert.deepEqual(Array.from(back.world.tiles), Array.from(s.world.tiles));
  assert.throws(() => Save.deserialize('{"version":1}'));
  assert.throws(() => Save.deserialize('not json'));
});

test('모의 실험: 무작위로 오래 몰아도 땅에 끼거나 숫자가 망가지지 않는다', () => {
  for (let g = 0; g < 3; g++) {
    const s = Game.newGame({ seed: 500 + g });
    Object.assign(s.levels, { drill: 4, fuel: 4, bag: 1, hull: 4, engine: 2, range: g + 1 });
    s.fuel = Game.fuelCap(s); s.hp = Game.hpCap(s);
    let input = {};
    for (let t = 0; t < 60 * 120; t++) {
      if (t % 20 === 0) {
        const r = Math.random();
        input = { down: r < 0.45, left: (r >= 0.45 && r < 0.6) || (r >= 0.85 && r < 0.92), right: (r >= 0.6 && r < 0.75) || r >= 0.92, up: r >= 0.75 }; // 0.85~ = 날면서 옆으로
      }
      Game.update(s, input, 1 / 60);
      assert.ok(Number.isFinite(s.car.x) && Number.isFinite(s.car.y) && Number.isFinite(s.fuel) && Number.isFinite(s.hp));
      if (!s.dig) assert.ok(!Game.overlapsSolid(s.world, s.car.x, s.car.y), '차가 땅에 끼면 안 된다');
      assert.ok(s.debt >= 0 && s.money >= 0);
    }
  }
});

test('뽑기: 일반은 보물 전까지 석탄~다이아, 특수는 보물 뒤에 맨틀~내핵, 가방이 차면 못 뽑는다', () => {
  const s = Game.newGame({ seed: 21 });
  s.money = 1000;
  assert.equal(Game.gacha(s, 'special').reason, 'locked');
  assert.deepEqual(Game.gacha(s, 'normal', () => 0), { ok: true, ore: 1 });
  assert.equal(s.money, 700);
  assert.equal(Game.gacha(s, 'normal', () => 0.9999).ore, 8, '가장 드문 것은 다이아몬드');
  assert.equal(Game.bagCount(s), 2);

  s.bag[1] = Game.bagCap(s);
  assert.equal(Game.gacha(s, 'normal').reason, 'bag');
  s.bag = Game.emptyBag();
  s.money = 100;
  assert.equal(Game.gacha(s, 'normal').reason, 'money');

  s.treasureTime = 50; // 첫 번째 엔딩을 봤다
  s.money = 300000;
  assert.equal(Game.gacha(s, 'normal').reason, 'ended');
  const got = Game.gacha(s, 'special');
  assert.ok(got.ok && got.ore >= 9 && got.ore <= 14);
  assert.equal(s.money, 200000);

  // 평균으로 돌아오는 돈은 값의 약 90%(살짝 손해)
  for (const kind of ['normal', 'special']) {
    const g = Rules.GACHA[kind];
    const total = g.ores.reduce((n, o) => n + o[1], 0);
    const mean = g.ores.reduce((n, o) => n + Rules.ORES[o[0]].value * o[1], 0) / total;
    assert.ok(mean / g.price > 0.85 && mean / g.price < 0.95, kind + ' 평균 ' + mean);
  }
});

test('날면서 옆으로 파기: 공중에서 두 줄에 걸쳐 있어도 벽을 판다', () => {
  const s = Game.newGame({ seed: 4 });
  for (let y = 3; y <= 12; y++) { setTile(s, 19, y, TILE.DIRT); setTile(s, 20, y, TILE.EMPTY); setTile(s, 21, y, TILE.DIRT); }
  setTile(s, 20, 3, TILE.DIRT);
  setTile(s, 20, 12, TILE.DIRT);
  s.car.x = 20.5; s.car.y = 7; s.car.vx = 0; s.car.vy = 0; // 6줄과 7줄에 걸쳐 공중에 떠 있다
  let done = null;
  for (let i = 0; i < 60 && !done; i++) done = Game.update(s, { up: true, right: true }, 1 / 60).find((e) => e.type === 'dig-done');
  assert.ok(done && done.x === 21, '오른쪽 벽을 판다');
  assert.ok(!Game.overlapsSolid(s.world, s.car.x, s.car.y), '다 판 뒤 차는 판 칸에 딱 들어가 있다');
  assert.equal(s.car.x, 21.5);
});

test('히든 엔딩: 300m까지 / 1000m까지 팔 수 있는 칸을 다 파면(용암은 안 셈)', () => {
  const s = Game.newGame({ seed: 8 });
  const w = s.world;
  for (let i = 0; i < Rules.CRUST_DEPTH * w.w; i++) if (Rules.DRILL_NEED[w.tiles[i]] != null) w.tiles[i] = TILE.EMPTY;
  setTile(s, 25, 5, TILE.DIRT);
  setTile(s, 26, 6, TILE.LAVA); // 용암은 남아 있어도 된다
  s.left = null;
  assert.equal(Game.leftCounts(s).crust, 1);
  standOn(s, 25, 5);
  let events = run(s, { down: true }, 0.5);
  assert.deepEqual(events.filter((e) => e.type === 'hidden').map((e) => e.n), [1]);
  assert.equal(Game.leftCounts(s).crust, 0);
  assert.ok(s.hidden1Time != null && s.hidden2Time == null);

  s.treasureTime = 10;
  World.openSeal(w);
  s.levels.drill = 9;
  for (let i = 0; i < w.tiles.length; i++) if (Rules.DRILL_NEED[w.tiles[i]] != null) w.tiles[i] = TILE.EMPTY;
  setTile(s, 30, 700, TILE.OUTER);
  s.left = null;
  s.levels.heat = 5;
  standOn(s, 30, 700);
  events = run(s, { down: true }, 1);
  assert.deepEqual(events.filter((e) => e.type === 'hidden').map((e) => e.n), [2]);

  const back = Save.deserialize(Save.serialize(s));
  assert.equal(back.hidden1Time, s.hidden1Time);
  assert.equal(back.hidden2Time, s.hidden2Time);
});

test('📍 지정 워프석: 여러 개 사고, 하나마다 위치는 한 번만 저장, 그 뒤로 몇 번이든 이동, 버리기·저장도 된다', () => {
  const s = Game.newGame({ seed: 7 });
  s.money = Rules.WARP_PRICE * (Rules.WARP_MAX + 1);
  for (let i = 0; i < Rules.WARP_MAX; i += 1) assert.equal(Game.buyWarp(s).ok, true);
  assert.equal(Game.buyWarp(s).reason, 'full', `${Rules.WARP_MAX}개까지만`);
  assert.equal(s.money, Rules.WARP_PRICE);
  assert.equal(Game.useWarp(s, 0).reason, 'empty', '저장 안 한 워프석은 못 씀');

  // 30줄 근처에 빈 굴을 만들고 그 자리를 저장한다
  for (let row = 25; row <= 31; row += 1) s.world.tiles[row * s.world.w + 20] = TILE.EMPTY;
  s.world.tiles[32 * s.world.w + 20] = TILE.STONE;
  standOn(s, 20, 32);
  const spot = { x: s.car.x, y: s.car.y };
  assert.equal(Game.saveWarp(s, 0).ok, true);
  assert.equal(Game.saveWarp(s, 0).reason, 'saved', '위치는 한 번만');

  for (let n = 0; n < 3; n += 1) { // 몇 번이든 간다
    Game.teleportHome(s);
    assert.equal(Game.useWarp(s, 0).ok, true);
    assert.deepEqual({ x: s.car.x, y: s.car.y }, spot);
  }
  run(s, {}, 0.5);
  assert.ok(Math.abs(s.car.y - spot.y) < 0.01, '옮긴 자리에 그대로 서 있다');

  s.inCore = true;
  assert.equal(Game.useWarp(s, 0).reason, 'core', '지구 핵 방에서는 못 씀');
  assert.equal(Game.saveWarp(s, 1).reason, 'core');
  s.inCore = false;

  const back = Save.deserialize(Save.serialize(s));
  assert.equal(back.warps.length, Rules.WARP_MAX);
  assert.deepEqual(back.warps[0], spot);
  assert.equal(back.warps[1], null);
  assert.equal(Game.dropWarp(back, 0).ok, true);
  assert.equal(back.warps.length, Rules.WARP_MAX - 1);
  assert.equal(back.warps[0], null, '버린 워프석 자리는 사라진다');
  const old = JSON.parse(Save.serialize(Game.newGame({ seed: 1 })));
  delete old.warps;
  assert.deepEqual(Save.deserialize(JSON.stringify(old)).warps, [], '워프석이 없던 예전 저장도 불러온다');
});
