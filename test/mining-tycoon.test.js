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

test('땅 만들기: 크기·콘크리트·바닥·보물 하나', () => {
  const world = World.createWorld(42);
  assert.equal(world.w, Rules.WIDTH);
  assert.equal(world.h, Rules.DEPTH + 1);
  assert.equal(World.tileAt(world, 0, 0), TILE.CONCRETE);
  assert.ok(world.tiles.slice((world.h - 1) * world.w).every((t) => t === TILE.BEDROCK));
  assert.equal(world.tiles.filter((t) => t === TILE.TREASURE).length, 1);
  assert.deepEqual(Array.from(World.createWorld(42).tiles), Array.from(world.tiles), '같은 씨앗이면 같은 땅');
  for (let y = 0; y < Rules.LAVA_DEPTH - 1; y++) {
    for (let x = 0; x < world.w; x++) assert.notEqual(World.tileAt(world, x, y), TILE.LAVA, '100m 위에는 용암이 없다');
  }
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
    s.levels = { drill: 4, fuel: 4, bag: 1, hull: 4, engine: 2, range: g + 1 };
    s.fuel = Game.fuelCap(s); s.hp = Game.hpCap(s);
    let input = {};
    for (let t = 0; t < 60 * 120; t++) {
      if (t % 20 === 0) {
        const r = Math.random();
        input = { down: r < 0.45, left: r >= 0.45 && r < 0.6, right: r >= 0.6 && r < 0.75, up: r >= 0.75 };
      }
      Game.update(s, input, 1 / 60);
      assert.ok(Number.isFinite(s.car.x) && Number.isFinite(s.car.y) && Number.isFinite(s.fuel) && Number.isFinite(s.hp));
      if (!s.dig) assert.ok(!Game.overlapsSolid(s.world, s.car.x, s.car.y), '차가 땅에 끼면 안 된다');
      assert.ok(s.debt >= 0 && s.money >= 0);
    }
  }
});
