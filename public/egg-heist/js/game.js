// ===== game.js =====
// 계란 훔치기의 규칙(화면을 모름). 브라우저(window.Egg.Game)와 Node 시험이 함께 쓴다.
// update(state, input, dt)가 한 걸음 진행하고 일어난 일(사건) 목록을 돌려준다.
// 지도: 아래쪽에 기지 3개(나·봇 둘), 위로 갈수록 귀한 알이 나오는 땅 5층(풀밭→우주)과 지킴이 동물.
(function (root) {
  'use strict';

  var WORLD_W = 2400, WORLD_H = 1500;
  var PLAYER_R = 18, PICK_R = 30, TOUCH_R = 34;

  // 알 등급: 이름·색·부화 시간(초)·펫 수입(원/초)·펫 모양
  var TIERS = [
    { name: '일반', color: '#f5efe0', hatch: 8, income: 1, pets: ['🐣', '🐥', '🐤'] },
    { name: '희귀', color: '#6fd08c', hatch: 15, income: 5, pets: ['🐢', '🦎', '🐸'] },
    { name: '에픽', color: '#a97bf5', hatch: 25, income: 20, pets: ['🦖', '🐊', '🦕'] },
    { name: '전설', color: '#ffc93c', hatch: 40, income: 80, pets: ['🐉', '🦄', '🦅'] },
    { name: '신화', color: 'rainbow', hatch: 60, income: 300, pets: ['🐲', '🦚', '🦩'] }
  ];

  // 땅 층(위로 갈수록 귀함): y 범위·최대 알 수·다시 나오는 시간·지킴이(수·속도·쫓는 거리·모양)
  var BIOMES = [
    { tier: 0, name: '풀밭', y0: 820, y1: 1010, color: '#9bd56f', max: 8, respawn: 2.5, guards: 1, guardSpeed: 140, chase: 150, guard: '🐓' },
    { tier: 1, name: '사막', y0: 620, y1: 820, color: '#f2d38b', max: 6, respawn: 4, guards: 2, guardSpeed: 170, chase: 180, guard: '🦂' },
    { tier: 2, name: '눈밭', y0: 420, y1: 620, color: '#e8f4ff', max: 5, respawn: 6, guards: 2, guardSpeed: 200, chase: 210, guard: '🐻‍❄️' },
    { tier: 3, name: '화산', y0: 220, y1: 420, color: '#7a3b2e', max: 4, respawn: 9, guards: 3, guardSpeed: 230, chase: 240, guard: '🦖' },
    { tier: 4, name: '우주', y0: 30, y1: 220, color: '#1b1640', max: 3, respawn: 14, guards: 3, guardSpeed: 260, chase: 270, guard: '👾' }
  ];

  var BASE_W = 420, BASE_H = 330, BASE_Y = 1110;
  var BASES = [
    { id: 'me', name: '내 기지', x: 90, color: '#4dabf7' },
    { id: 'red', name: '빨강봇 기지', x: 990, color: '#ff6b6b' },
    { id: 'blue', name: '초록봇 기지', x: 1890, color: '#51cf66' }
  ];
  var MAX_SLOTS = 10;
  var BOT_SPEED = [0, 205, 225];
  var LOCK_SECONDS = 25, LOCK_COOLDOWN = 60;

  // 업그레이드: 최대 단계·값 계산
  var UPGRADES = {
    speed: { name: '👟 신발(빨라짐)', max: 10, cost: function (lv) { return Math.round(40 * Math.pow(1.85, lv)); } },
    slots: { name: '🧺 우리 칸 +1', max: MAX_SLOTS - 4, cost: function (lv) { return Math.round(120 * Math.pow(2.3, lv)); } },
    carry: { name: '🎒 가방(알 하나 더)', max: 2, cost: function (lv) { return [800, 12000][lv]; } },
    hatch: { name: '🔥 부화기(빨리 깸)', max: 10, cost: function (lv) { return Math.round(90 * Math.pow(1.9, lv)); } },
    lock: { name: '🔒 기지 잠금 장치', max: 1, cost: function () { return 400; } }
  };

  function playerSpeed(lv) { return 230 + lv * 22; }
  function capacity(lv) { return 1 + lv; }
  function hatchMul(lv) { return 1 - lv * 0.05; }   // 10단계면 절반 시간
  function slotCount(lv) { return 4 + lv; }
  function sellPrice(tier) { return TIERS[tier].income * 40; }

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function baseRect(i) { return { x: BASES[i].x, y: BASE_Y, w: BASE_W, h: BASE_H }; }
  function inRect(p, r, pad) { pad = pad || 0; return p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad; }
  function slotPos(baseIndex, i) {
    var r = baseRect(baseIndex);
    return { x: r.x + 62 + (i % 5) * 74, y: r.y + 120 + Math.floor(i / 5) * 92 };
  }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function create(seed, save) {
    var rand = rng(seed == null ? (Math.random() * 4294967296) >>> 0 : seed);
    var s = {
      t: 0, rand: rand, nextId: 1,
      money: 0, earned: 0,
      up: { speed: 0, slots: 0, carry: 0, hatch: 0, lock: 0 },
      player: { x: BASES[0].x + BASE_W / 2, y: BASE_Y + BASE_H - 60, carry: [], stun: 0, face: 1 },
      bases: BASES.map(function (b, i) { return { id: b.id, slots: new Array(i === 0 ? 4 : 6).fill(null), lockUntil: 0, lockReadyAt: 0 }; }),
      bots: [], eggs: [], guards: [], spawnTimers: BIOMES.map(function () { return 0; })
    };
    if (save) applySave(s, save);
    for (var b = 1; b < BASES.length; b++) {
      var r = baseRect(b);
      s.bots.push({ id: BASES[b].id, base: b, x: r.x + BASE_W / 2, y: r.y + BASE_H / 2, carry: [], stun: 0, mode: 'idle', target: null, think: 0, face: 1 });
    }
    BIOMES.forEach(function (bio, i) {
      for (var g = 0; g < bio.guards; g++) {
        var home = { x: 200 + rand() * (WORLD_W - 400), y: (bio.y0 + bio.y1) / 2 };
        s.guards.push({ biome: i, x: home.x, y: home.y, home: home, wander: { x: home.x, y: home.y }, chasing: null, rest: 0 });
      }
      for (var e = 0; e < Math.ceil(bio.max / 2); e++) spawnEgg(s, i);
    });
    return s;
  }

  function spawnEgg(s, biomeIndex) {
    var bio = BIOMES[biomeIndex];
    s.eggs.push({ id: s.nextId++, tier: bio.tier, biome: biomeIndex, x: 80 + s.rand() * (WORLD_W - 160), y: bio.y0 + 30 + s.rand() * (bio.y1 - bio.y0 - 60) });
  }

  function biomeAt(y) {
    for (var i = 0; i < BIOMES.length; i++) if (y >= BIOMES[i].y0 && y < BIOMES[i].y1) return i;
    return -1;
  }

  // ----- 우리(펜) -----
  function emptySlot(base, count) {
    for (var i = 0; i < count; i++) if (!base.slots[i]) return i;
    return -1;
  }
  function putEgg(s, baseIndex, tier, count, mul) {
    var base = s.bases[baseIndex];
    var i = emptySlot(base, count);
    if (i < 0) return -1;
    base.slots[i] = { kind: 'egg', tier: tier, left: TIERS[tier].hatch * mul, pet: Math.floor(s.rand() * 3) };
    return i;
  }
  function income(s) {
    var sum = 0;
    s.bases[0].slots.forEach(function (sl) { if (sl && sl.kind === 'pet') sum += TIERS[sl.tier].income; });
    return sum;
  }

  // ----- 사고팔기(화면의 상점 단추가 부름) -----
  function inMyBase(s) { return inRect(s.player, baseRect(0)); }
  function buy(s, key) {
    var u = UPGRADES[key];
    if (!u) return { ok: false, why: 'none' };
    var lv = s.up[key];
    if (lv >= u.max) return { ok: false, why: 'max' };
    var price = u.cost(lv);
    if (s.money < price) return { ok: false, why: 'money', price: price };
    s.money -= price;
    s.up[key]++;
    if (key === 'slots') s.bases[0].slots.push(null);
    return { ok: true, price: price };
  }
  function sell(s, i) {
    var sl = s.bases[0].slots[i];
    if (!sl || sl.kind !== 'pet') return 0;
    var price = sellPrice(sl.tier);
    s.bases[0].slots[i] = null;
    s.money += price;
    s.earned += price;
    return price;
  }
  function lock(s) {
    var base = s.bases[0];
    if (!s.up.lock) return { ok: false, why: 'none' };
    if (s.t < base.lockReadyAt) return { ok: false, why: 'cooldown', wait: Math.ceil(base.lockReadyAt - s.t) };
    base.lockUntil = s.t + LOCK_SECONDS;
    base.lockReadyAt = s.t + LOCK_COOLDOWN;
    return { ok: true };
  }

  // ----- 움직임 -----
  function moveToward(o, target, speed, dt) {
    var dx = target.x - o.x, dy = target.y - o.y, d = Math.hypot(dx, dy);
    if (d < 1) return true;
    var step = Math.min(d, speed * dt);
    o.x += dx / d * step; o.y += dy / d * step;
    if (Math.abs(dx) > 2) o.face = dx > 0 ? 1 : -1;
    return d <= speed * dt;
  }
  function clampWorld(o) {
    o.x = Math.max(PLAYER_R, Math.min(WORLD_W - PLAYER_R, o.x));
    o.y = Math.max(PLAYER_R, Math.min(WORLD_H - PLAYER_R, o.y));
  }
  function carrySlow(carry) { return 1 - 0.12 * carry.length; }

  // 알을 든 채 지킴이에게 잡히거나 몸에 부딪혀 알을 떨어뜨림. home=true면 원래 땅으로 돌아감.
  function dropAll(s, who, home) {
    who.carry.forEach(function (tier) {
      if (home) {
        var bi = BIOMES.findIndex(function (b) { return b.tier === tier; });
        s.eggs.push({ id: s.nextId++, tier: tier, biome: bi, x: 80 + s.rand() * (WORLD_W - 160), y: BIOMES[bi].y0 + 30 + s.rand() * (BIOMES[bi].y1 - BIOMES[bi].y0 - 60) });
      } else {
        s.eggs.push({ id: s.nextId++, tier: tier, biome: -1, x: who.x + (s.rand() - 0.5) * 40, y: who.y + (s.rand() - 0.5) * 40 });
      }
    });
    who.carry = [];
  }

  function update(s, input, dt) {
    var events = [];
    s.t += dt;
    var p = s.player;
    var cap = capacity(s.up.carry);
    var mul = hatchMul(s.up.hatch);
    var slots0 = slotCount(s.up.slots);

    // 나 움직이기
    if (p.stun > 0) p.stun -= dt;
    else if (input && (input.x || input.y)) {
      var len = Math.hypot(input.x, input.y) || 1;
      var sp = playerSpeed(s.up.speed) * carrySlow(p.carry);
      p.x += input.x / len * sp * dt; p.y += input.y / len * sp * dt;
      if (Math.abs(input.x) > 0.1) p.face = input.x > 0 ? 1 : -1;
      clampWorld(p);
    }

    // 알 줍기
    for (var i = s.eggs.length - 1; i >= 0 && p.carry.length < cap && p.stun <= 0; i--) {
      if (dist(p, s.eggs[i]) < PICK_R) {
        p.carry.push(s.eggs[i].tier);
        events.push({ type: 'pickup', tier: s.eggs[i].tier });
        s.eggs.splice(i, 1);
      }
    }
    // 봇 기지에서 알 훔치기
    for (var b = 1; b < s.bases.length && p.carry.length < cap; b++) {
      if (!inRect(p, baseRect(b))) continue;
      s.bases[b].slots.forEach(function (sl, k) {
        if (sl && sl.kind === 'egg' && p.carry.length < cap && dist(p, slotPos(b, k)) < PICK_R + 6) {
          p.carry.push(sl.tier);
          s.bases[b].slots[k] = null;
          events.push({ type: 'steal', tier: sl.tier, from: b });
        }
      });
    }
    // 내 기지에 내려놓기
    if (inRect(p, baseRect(0))) {
      while (p.carry.length) {
        var at = putEgg(s, 0, p.carry[0], slots0, mul);
        if (at < 0) { if (!p.fullWarned) events.push({ type: 'pen-full' }); p.fullWarned = true; break; }
        events.push({ type: 'deposit', tier: p.carry[0] });
        p.carry.shift();
      }
    } else p.fullWarned = false;

    // 봇
    s.bots.forEach(function (bot) { updateBot(s, bot, dt, events); });

    // 알 든 봇에 부딪히면 떨어뜨림
    s.bots.forEach(function (bot) {
      if (bot.carry.length && bot.stun <= 0 && p.stun <= 0 && dist(p, bot) < TOUCH_R) {
        dropAll(s, bot, false);
        bot.stun = 2;
        bot.mode = 'idle';
        events.push({ type: 'tag', bot: bot.id });
      }
    });

    // 지킴이
    s.guards.forEach(function (g) { updateGuard(s, g, dt, events); });

    // 알 다시 나오기
    BIOMES.forEach(function (bio, bi) {
      var have = s.eggs.filter(function (e) { return e.biome === bi; }).length;
      if (have >= bio.max) { s.spawnTimers[bi] = 0; return; }
      s.spawnTimers[bi] += dt;
      if (s.spawnTimers[bi] >= bio.respawn) { s.spawnTimers[bi] = 0; spawnEgg(s, bi); }
    });
    // 떨어진 알이 너무 많이 쌓이지 않게(오래된 것부터)
    var loose = s.eggs.filter(function (e) { return e.biome === -1; });
    if (loose.length > 20) s.eggs.splice(s.eggs.indexOf(loose[0]), 1);

    // 부화
    s.bases.forEach(function (base, bi) {
      base.slots.forEach(function (sl) {
        if (sl && sl.kind === 'egg') {
          sl.left -= dt;
          if (sl.left <= 0) { sl.kind = 'pet'; sl.left = 0; if (bi === 0) events.push({ type: 'hatch', tier: sl.tier, pet: TIERS[sl.tier].pets[sl.pet] }); }
        }
      });
    });

    // 돈
    var inc = income(s) * dt;
    s.money += inc; s.earned += inc;
    return events;
  }

  function updateGuard(s, g, dt, events) {
    var bio = BIOMES[g.biome];
    if (g.rest > 0) { g.rest -= dt; return; }
    var carriers = [s.player].concat(s.bots).filter(function (c) { return c.carry.length && c.stun <= 0; });
    var target = null, best = bio.chase;
    carriers.forEach(function (c) { var d = dist(g, c); if (d < best && c.y > bio.y0 - 60 && c.y < bio.y1 + 60) { best = d; target = c; } });
    if (target) {
      moveToward(g, target, bio.guardSpeed, dt);
      if (dist(g, target) < TOUCH_R) {
        var tier = target.carry.slice();
        dropAll(s, target, true);
        target.stun = 0.9;
        target.y = Math.min(WORLD_H - PLAYER_R, target.y + 110);
        if (target === s.player) events.push({ type: 'caught', guard: bio.guard, lost: tier });
        else target.mode = 'idle';
        g.rest = 1.2;
      }
    } else if (moveToward(g, g.wander, bio.guardSpeed * 0.45, dt)) {
      g.wander = { x: Math.max(60, Math.min(WORLD_W - 60, g.home.x + (s.rand() - 0.5) * 700)), y: bio.y0 + 30 + s.rand() * (bio.y1 - bio.y0 - 60) };
    }
    g.y = Math.max(bio.y0 - 40, Math.min(bio.y1 + 40, g.y));
  }

  function updateBot(s, bot, dt, events) {
    var home = baseRect(bot.base);
    var speed = BOT_SPEED[bot.base] * carrySlow(bot.carry);
    if (bot.stun > 0) { bot.stun -= dt; return; }
    var myBase = baseRect(0), locked = s.bases[0].lockUntil > s.t;
    // 잠긴 내 기지 안에 있으면 밖으로 밀려남
    if (locked && inRect(bot, myBase, 10)) {
      bot.y = myBase.y - 30;
      bot.mode = 'idle';
      events.push({ type: 'blocked', bot: bot.id });
    }
    if (bot.mode === 'idle') {
      bot.think -= dt;
      if (bot.think > 0) return;
      var targetEggs = s.bases[0].slots.map(function (sl, k) { return sl && sl.kind === 'egg' ? k : -1; }).filter(function (k) { return k >= 0; });
      if (targetEggs.length && !locked && s.rand() < 0.4) {
        bot.mode = 'steal';
        bot.target = { slot: targetEggs[Math.floor(s.rand() * targetEggs.length)] };
      } else if (s.eggs.length) {
        // 가까운 알 중에서 고르되 가끔 더 귀한 땅으로
        var greedy = s.rand() < 0.3;
        var pick = null, bestScore = Infinity;
        s.eggs.forEach(function (e) {
          var score = dist(bot, e) - (greedy ? e.tier * 400 : 0);
          if (score < bestScore) { bestScore = score; pick = e; }
        });
        bot.mode = 'gather';
        bot.target = { egg: pick.id };
      }
      bot.think = 0.5;
      return;
    }
    if (bot.mode === 'gather') {
      var egg = s.eggs.find(function (e) { return e.id === bot.target.egg; });
      if (!egg) { bot.mode = 'idle'; return; }
      if (moveToward(bot, egg, speed, dt) || dist(bot, egg) < PICK_R) {
        bot.carry.push(egg.tier);
        s.eggs.splice(s.eggs.indexOf(egg), 1);
        bot.mode = 'return';
      }
      return;
    }
    if (bot.mode === 'steal') {
      var sl = s.bases[0].slots[bot.target.slot];
      if (!sl || sl.kind !== 'egg' || locked) { bot.mode = 'idle'; return; }
      var spot = slotPos(0, bot.target.slot);
      if (moveToward(bot, spot, speed, dt)) {
        bot.carry.push(sl.tier);
        s.bases[0].slots[bot.target.slot] = null;
        events.push({ type: 'stolen', bot: bot.id, tier: sl.tier });
        bot.mode = 'return';
      }
      return;
    }
    if (bot.mode === 'return') {
      if (moveToward(bot, { x: home.x + BASE_W / 2, y: home.y + BASE_H / 2 }, speed, dt)) {
        var base = s.bases[bot.base];
        bot.carry.forEach(function (tier) {
          if (putEgg(s, bot.base, tier, base.slots.length, 1) < 0) {
            // 꽉 차면 가장 싼 펫을 팔고 넣음
            var cheap = -1;
            base.slots.forEach(function (x, k) { if (x && x.kind === 'pet' && (cheap < 0 || x.tier < base.slots[cheap].tier)) cheap = k; });
            if (cheap >= 0) { base.slots[cheap] = null; putEgg(s, bot.base, tier, base.slots.length, 1); }
          }
        });
        bot.carry = [];
        bot.mode = 'idle';
        bot.think = 0.4 + s.rand() * 0.8;
      }
    }
  }

  // ----- 저장 -----
  function toSave(s) {
    return {
      v: 1, money: Math.floor(s.money), earned: Math.floor(s.earned), up: Object.assign({}, s.up),
      slots: s.bases[0].slots.map(function (sl) { return sl ? { kind: sl.kind, tier: sl.tier, left: Math.max(0, Math.round(sl.left * 10) / 10), pet: sl.pet } : null; })
    };
  }
  function cleanInt(v, max) { return Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0; }
  function applySave(s, save) {
    if (!save || save.v !== 1) return false;
    s.money = cleanInt(save.money, 1e15);
    s.earned = Math.max(s.money, cleanInt(save.earned, 1e15));
    Object.keys(s.up).forEach(function (k) { s.up[k] = cleanInt(save.up && save.up[k], UPGRADES[k].max); });
    var count = slotCount(s.up.slots);
    s.bases[0].slots = new Array(count).fill(null);
    (Array.isArray(save.slots) ? save.slots : []).slice(0, count).forEach(function (sl, i) {
      if (!sl || (sl.kind !== 'egg' && sl.kind !== 'pet')) return;
      var tier = cleanInt(sl.tier, TIERS.length - 1);
      s.bases[0].slots[i] = { kind: sl.kind, tier: tier, left: sl.kind === 'egg' ? Math.min(TIERS[tier].hatch, Math.max(0, Number(sl.left) || 0)) : 0, pet: cleanInt(sl.pet, 2) };
    });
    return true;
  }

  var api = {
    WORLD_W: WORLD_W, WORLD_H: WORLD_H, PLAYER_R: PLAYER_R, TIERS: TIERS, BIOMES: BIOMES, BASES: BASES, BASE_W: BASE_W, BASE_H: BASE_H, BASE_Y: BASE_Y,
    UPGRADES: UPGRADES, LOCK_SECONDS: LOCK_SECONDS, MAX_SLOTS: MAX_SLOTS,
    playerSpeed: playerSpeed, capacity: capacity, hatchMul: hatchMul, slotCount: slotCount, sellPrice: sellPrice,
    create: create, update: update, baseRect: baseRect, slotPos: slotPos, inRect: inRect, inMyBase: inMyBase, biomeAt: biomeAt,
    income: income, buy: buy, sell: sell, lock: lock, toSave: toSave, applySave: applySave
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.Egg = root.Egg || {}; root.Egg.Game = api; }
})(typeof window !== 'undefined' ? window : this);
