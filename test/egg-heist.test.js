const test = require('node:test');
const assert = require('node:assert/strict');
// 순위 시험 점수가 진짜 순위 파일(data/)에 쌓이지 않게 임시 폴더를 쓴다(server.js를 불러오기 전에 정해야 함).
process.env.SCORES_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'egg-scores-'));
const G = require('../public/egg-heist/js/game.js');

const base0 = () => { const r = G.baseRect(0); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; };

test('지도: 땅 층이 위아래로 이어지고 기지는 땅 아래에 겹치지 않게 있다', () => {
  for (let i = 1; i < G.BIOMES.length; i++) assert.equal(G.BIOMES[i].y1, G.BIOMES[i - 1].y0);
  for (let i = 0; i < G.BASES.length; i++) {
    const r = G.baseRect(i);
    assert.ok(r.y > G.BIOMES[0].y1 && r.y + r.h <= G.WORLD_H && r.x + r.w <= G.WORLD_W);
    if (i) assert.ok(r.x >= G.baseRect(i - 1).x + G.BASE_W);
  }
  for (let k = 0; k < G.MAX_SLOTS; k++) assert.ok(G.inRect(G.slotPos(0, k), G.baseRect(0)), `우리 칸 ${k}`);
});

test('알을 주워 내 기지에 넣으면 부화해서 돈을 번다', () => {
  const s = G.create(1);
  s.bots = []; s.guards = []; // 기다리는 동안 봇이 진짜로 훔쳐 가지 않게
  s.eggs = [{ id: 999, tier: 1, biome: -1, x: s.player.x, y: s.player.y }];
  const ev = G.update(s, null, 0.016);
  assert.ok(ev.some((e) => e.type === 'pickup'));
  assert.deepEqual(s.player.carry, []); // 기지 안에서 주웠으니 바로 우리에 들어감
  assert.equal(s.bases[0].slots[0].kind, 'egg');
  for (let t = 0; t < G.TIERS[1].hatch + 1; t += 0.5) G.update(s, null, 0.5);
  assert.equal(s.bases[0].slots[0].kind, 'pet');
  assert.equal(G.income(s), G.TIERS[1].income);
  const before = s.money;
  G.update(s, null, 2);
  assert.ok(Math.abs(s.money - before - 2 * G.TIERS[1].income) < 1e-6);
});

test('지킴이에게 잡히면 알을 놓치고, 알 든 봇에 부딪히면 봇이 떨어뜨린다', () => {
  const s = G.create(2);
  s.bots = [];
  const bio = G.BIOMES[2];
  s.player.x = 1200; s.player.y = (bio.y0 + bio.y1) / 2; s.player.carry = [2];
  s.guards = [{ biome: 2, x: 1210, y: s.player.y, home: { x: 1200, y: s.player.y }, wander: { x: 1200, y: s.player.y }, rest: 0 }];
  const ev = G.update(s, null, 0.016);
  assert.ok(ev.some((e) => e.type === 'caught'));
  assert.deepEqual(s.player.carry, []);
  assert.ok(s.player.stun > 0);

  const s2 = G.create(3);
  s2.guards = [];
  const bot = s2.bots[0];
  bot.x = s2.player.x + 10; bot.y = s2.player.y; bot.carry = [3]; bot.mode = 'return';
  const ev2 = G.update(s2, null, 0.016);
  assert.ok(ev2.some((e) => e.type === 'tag'));
  assert.deepEqual(bot.carry, []);
  assert.ok(s2.eggs.some((e) => e.tier === 3 && e.biome === -1));
});

test('봇은 내 우리의 알을 훔치러 오고, 잠그면 못 들어온다', () => {
  const s = G.create(4);
  s.guards = []; s.eggs = [];
  s.bases[0].slots[0] = { kind: 'egg', tier: 2, left: 9999, pet: 0 };
  s.bots.forEach((b) => { b.think = 0; });
  let stolen = false;
  for (let i = 0; i < 60 * 60 && !stolen; i++) {
    s.player.x = 50; s.player.y = 50; // 나는 멀리
    stolen = G.update(s, null, 1 / 60).some((e) => e.type === 'stolen');
  }
  assert.ok(stolen, '1분 안에 훔쳐 감');

  const s2 = G.create(5);
  s2.guards = []; s2.eggs = [];
  s2.up.lock = 1;
  s2.bases[0].slots[0] = { kind: 'egg', tier: 2, left: 9999, pet: 0 };
  assert.equal(G.lock(s2).ok, true);
  assert.equal(G.lock(s2).why, 'cooldown');
  let stolen2 = false;
  for (let i = 0; i < 60 * (G.LOCK_SECONDS - 1) && !stolen2; i++) {
    s2.player.x = 50; s2.player.y = 50;
    stolen2 = G.update(s2, null, 1 / 60).some((e) => e.type === 'stolen');
  }
  assert.equal(stolen2, false, '잠긴 동안은 못 훔침');
});

test('상점: 돈이 있어야 사고, 칸을 늘리고, 펫을 팔 수 있다', () => {
  const s = G.create(6);
  assert.equal(G.buy(s, 'speed').why, 'money');
  s.money = 1e9;
  assert.equal(G.buy(s, 'speed').ok, true);
  assert.equal(G.playerSpeed(s.up.speed), G.playerSpeed(0) + 22);
  assert.equal(G.buy(s, 'slots').ok, true);
  assert.equal(s.bases[0].slots.length, 5);
  for (let i = 0; i < 10; i++) G.buy(s, 'slots');
  assert.equal(s.bases[0].slots.length, G.MAX_SLOTS);
  assert.equal(G.buy(s, 'slots').why, 'max');
  s.bases[0].slots[0] = { kind: 'pet', tier: 3, left: 0, pet: 1 };
  const m = s.money;
  assert.equal(G.sell(s, 0), G.sellPrice(3));
  assert.equal(s.money, m + G.sellPrice(3));
  assert.equal(s.bases[0].slots[0], null);
});

test('저장하고 불러오면 돈·업그레이드·우리가 그대로, 망가진 값은 걸러 낸다', () => {
  const s = G.create(7);
  s.money = 1234.7; s.earned = 5000; s.up.speed = 3; s.up.slots = 1;
  s.bases[0].slots = [null, { kind: 'pet', tier: 4, left: 0, pet: 2 }, { kind: 'egg', tier: 1, left: 7.25, pet: 0 }, null, null];
  const saved = JSON.parse(JSON.stringify(G.toSave(s)));
  const s2 = G.create(8, saved);
  assert.equal(s2.money, 1234);
  assert.equal(s2.up.speed, 3);
  assert.equal(s2.bases[0].slots.length, 5);
  assert.equal(s2.bases[0].slots[1].tier, 4);
  assert.equal(s2.bases[0].slots[2].left, 7.3);
  const bad = G.create(9, { v: 1, money: -5, earned: 'x', up: { speed: 999, carry: -1 }, slots: [{ kind: 'pet', tier: 99 }, { kind: 'bomb' }] });
  assert.equal(bad.money, 0);
  assert.equal(bad.up.speed, G.UPGRADES.speed.max);
  assert.equal(bad.up.carry, 0);
  assert.equal(bad.bases[0].slots[0].tier, G.TIERS.length - 1);
  assert.equal(bad.bases[0].slots[1], null);
});

test('모의 실험: 10분 동안 아무렇게나 움직여도 NaN·멈춤 없이 봇이 알을 모은다', () => {
  for (const seed of [11, 22, 33]) {
    const s = G.create(seed);
    let input = { x: 0, y: -1 };
    for (let i = 0; i < 60 * 600; i++) {
      if (i % 120 === 0) input = { x: Math.sin(i * 1.3 + seed), y: Math.cos(i * 0.7 + seed) };
      if (s.player.carry.length) { const b = base0(); input = { x: b.x - s.player.x, y: b.y - s.player.y }; }
      G.update(s, input, 1 / 60);
    }
    for (const o of [s.player, ...s.bots, ...s.guards]) assert.ok(Number.isFinite(o.x + o.y) && o.x >= 0 && o.x <= G.WORLD_W && o.y >= 0 && o.y <= G.WORLD_H);
    assert.ok(Number.isFinite(s.money));
    const botThings = s.bases.slice(1).reduce((n, b) => n + b.slots.filter(Boolean).length, 0);
    assert.ok(botThings >= 4, `봇 우리 ${botThings}`);
    assert.ok(s.eggs.length <= G.BIOMES.reduce((n, b) => n + b.max, 0) + 20);
  }
});

test('계란 훔치기 순위 API: 한 판(playerId)당 한 줄', async (t) => {
  const { server, io, rooms } = require('../server');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    rooms.clear();
    await new Promise((resolve) => io.close(resolve));
  });
  assert.equal((await fetch(`${url}/egg-heist/`)).status, 200);
  const post = (body) => fetch(`${url}/api/egg-heist/scores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({ name: '알도둑', score: 100 })).status, 400, 'playerId 없으면 거절');
  const ok = await post({ name: '알도둑', score: 5000, playerId: 'egg-test1' });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).rank, 1);
});
