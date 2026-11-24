// ===== game.js =====
// 깡통 소탕대 규칙(화면을 모름, 브라우저 window.TinSquad.Game · Node 겸용).
// create(옵션) → 상태, update(상태, 입력, dt) → 이번에 일어난 사건 목록(소리·반짝이 효과용).
// 입력: { left, right, up, down, jump, fire, bomb } 모두 참/거짓(누르고 있는지).
(function (root, factory) {
  var L = typeof require === 'function' && typeof module === 'object' ? require('./levels.js') : root.TinSquad.Levels;
  var B = typeof require === 'function' && typeof module === 'object' ? require('./boss.js') : root.TinSquad.Boss;
  var api = factory(L, B);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TinSquad.Game = api;
})(typeof window !== 'undefined' ? window : globalThis, function (L, Boss) {
  'use strict';
  var T = L.TILE, VW = L.VIEW_W, VH = L.VIEW_H;
  var GRAV = 1900, RUN = 240, JUMP = 780;
  var INV_TIME = 1.5, COMBO_TIME = 2.6, GROUND_Y = 10 * T;

  // ----- 무기 -----
  var WEAPONS = {
    screw: { name: '나사총', ammo: Infinity, rate: 0.19, dmg: 10, speed: 920, life: 0.8 },
    rapid: { name: '연발총', ammo: 160, rate: 0.075, dmg: 8, speed: 1000, life: 0.8, spread: 0.06 },
    spread: { name: '부채총', ammo: 36, rate: 0.42, dmg: 12, speed: 800, life: 0.42, pellets: 6, spread: 0.5 },
    rocket: { name: '로켓', ammo: 22, rate: 0.6, dmg: 55, speed: 620, life: 1.6, boom: 90, homing: true },
    laser: { name: '레이저', ammo: 90, rate: 0.11, dmg: 13, speed: 1300, life: 0.7, pierce: 99 },
    flame: { name: '불꽃총', ammo: 150, rate: 0.06, dmg: 7, speed: 420, life: 0.5, pierce: 99, spread: 0.22, r: 14 },
    ball: { name: '통통공총', ammo: 60, rate: 0.2, dmg: 18, speed: 640, life: 2.2, bounce: 4, r: 9, g: 900 },
    zap: { name: '번개총', ammo: 50, rate: 0.28, dmg: 24, speed: 1100, life: 0.7, chain: 3 }
  };
  var WEAPON_DROPS = ['rapid', 'spread', 'rocket', 'laser', 'flame', 'ball', 'zap'];

  // ----- 적 -----
  var ENEMIES = {
    toaster: { name: '토스터 병사', w: 40, h: 44, hp: 22, pts: 100 },
    kettle: { name: '돌격 주전자', w: 36, h: 40, hp: 14, pts: 120 },
    fan: { name: '선풍기 드론', w: 44, h: 38, hp: 18, pts: 130, fly: true },
    bulb: { name: '전구 벌레', w: 26, h: 28, hp: 8, pts: 60, fly: true },
    vacuum: { name: '로봇 청소기', w: 50, h: 24, hp: 24, pts: 110 },
    turret: { name: '드라이어 포탑', w: 42, h: 46, hp: 36, pts: 150, still: true },
    cam: { name: '저격 카메라', w: 34, h: 48, hp: 24, pts: 180, still: true },
    speaker: { name: '쿵쿵 스피커', w: 46, h: 52, hp: 42, pts: 180, still: true },
    microwave: { name: '방패 전자레인지', w: 54, h: 56, hp: 55, pts: 220 },
    blender: { name: '폴짝 믹서기', w: 40, h: 60, hp: 45, pts: 200 },
    iron: { name: '낙하 다리미', w: 44, h: 36, hp: 22, pts: 140, fly: true },
    fridge: { name: '냉장고 거인', w: 70, h: 96, hp: 170, pts: 500 }
  };

  // 콤보 점수 배수: 10콤보마다 +50%, 최대 5배. (숫자를 바꿔 보며 나만의 손맛을 만들 수 있는 자리)
  function comboMult(combo) {
    return Math.min(5, 1 + Math.floor(combo / 5) * 0.25);
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function cxOf(e) { return e.x + e.w / 2; }
  function cyOf(e) { return e.y + e.h / 2; }
  function hit(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function circleHit(x, y, r, b) {
    var dx = x - clamp(x, b.x, b.x + b.w), dy = y - clamp(y, b.y, b.y + b.h);
    return dx * dx + dy * dy <= r * r;
  }

  // 상점 업그레이드 단계 → 실제 능력
  function statsOf(up, mods) {
    up = up || {}; mods = mods || {};
    return {
      maxHp: 3 + (up.heart || 0) + (mods.hp || 0),
      lives: 3 + (up.life || 0),
      dmg: (1 + (up.power || 0) * 0.12) * (1 + (mods.dmg || 0)),
      rate: 1 + (mods.rate || 0),
      run: RUN * (1 + (mods.run || 0)),
      bombs: 5 + (up.bomb || 0) * 2 + (mods.bomb || 0),
      ammo: 1 + (up.ammo || 0) * 0.2,
      jumps: 1 + (up.jump || 0) + (mods.jump || 0),
      magnet: 50 + (up.magnet || 0) * 60,
      combo: COMBO_TIME + (up.combo || 0) * 0.5,
      coin: 1 + (mods.coin || 0),
      leech: mods.leech || 0,
      pierce: mods.pierce || 0,
      shield: mods.shield || 0,
      startBox: !!up.box
    };
  }

  function create(opts) {
    opts = opts || {};
    var tower = opts.floor > 0;
    var map = opts.map || (tower ? L.buildTower(opts.floor, opts.seed || 1) : L.buildStage(opts.stage || 0));
    var st = statsOf(opts.up, opts.mods);
    var carry = opts.carry || {};
    var s = {
      map: map, tower: tower, floor: opts.floor || 0, st: st, rand: L.rng((opts.seed || 7) + (opts.stage || 0) * 31 + 5),
      diff: map.diff, hpMul: 1 + map.diff * 0.026, shotMul: 1 + map.diff * 0.007, rateMul: 1 + map.diff * 0.011,
      time: 0, score: 0, coins: 0, kills: 0, combo: 0, comboT: 0, bestCombo: 0, pets: 0, petsTotal: map.petsTotal, deaths: 0, hurts: 0,
      lives: tower ? 1 : st.lives, status: 'play', endT: 0,
      camX: 0, lock: null, go: 0, arena: null, spawnQ: [],
      enemies: [], shots: [], foes: [], bombs: [], items: [], props: [], beams: [], boss: null, bossAt: map.boss, chase: null, mechSpot: null,
      god: !!opts.god, events: [], nextId: 1, leechN: 0
    };
    s.p = {
      x: map.start.x, y: map.start.y - 56, w: 28, h: 56, vx: 0, vy: 0, face: 1, ground: true, crouch: false, ax: 1, ay: 0,
      hp: clamp(carry.hp || st.maxHp, 1, st.maxHp), maxHp: st.maxHp, shield: st.shield, inv: 1.2, fireT: 0, weapon: carry.weapon || 'screw', ammo: carry.ammo || 0,
      bombs: carry.bombs != null ? Math.max(carry.bombs, 3) : st.bombs, bombT: 0, air: 0, coyote: 0, buf: 0, drop: 0, melee: 0, dead: 0, safeX: map.start.x, mech: null, was: {}, anim: 0, shootPose: 0
    };
    if (s.p.weapon !== 'screw' && !(s.p.ammo > 0)) s.p.weapon = 'screw';
    if (st.startBox && s.p.weapon === 'screw') giveWeapon(s, WEAPON_DROPS[Math.floor(s.rand() * WEAPON_DROPS.length)]);
    map.spawns.forEach(function (sp) { s.enemies.push(makeEnemy(s, sp.type, sp.x, sp.y)); });
    map.props.forEach(function (p) {
      var sz = p.kind === 'cage' ? 46 : 38;
      // 허공에 놓인 물건은 아래 땅·발판에 내려놓는다(아래가 구덩이·가시면 그 자리)
      var col = Math.floor(p.x / T), row = Math.round(p.y / T), py = p.y;
      while (row < 12 && tileAt(s, col, row) === 0) row++;
      if (row < 12 && tileAt(s, col, row) !== 3) py = row * T;
      p = { kind: p.kind, pet: p.pet, x: p.x, y: py };
      s.props.push({ kind: p.kind, pet: p.pet, x: p.x - sz / 2, y: p.y - sz, w: sz, h: sz, hp: p.kind === 'crate' ? 12 : p.kind === 'barrel' ? 16 : 20 });
    });
    map.coins.forEach(function (c) { s.items.push({ kind: 'coin', x: c.x, y: c.y, vx: 0, vy: 0, still: true, life: 999 }); });
    if (map.mech) s.mechSpot = { x: map.mech.x, y: map.mech.y - 88, w: 78, h: 88 };
    if (map.type === 'chase') s.chase = { x: -520, speed: 128 + Math.min(48, map.diff * 1.2), wait: 2.5 };
    s.events.push({ t: 'start' });
    return s;
  }

  function makeEnemy(s, type, x, y) { // x: 가운데, y: 발밑
    var d = ENEMIES[type], hp = Math.round(d.hp * s.hpMul);
    var e = { id: s.nextId++, type: type, x: x - d.w / 2, y: y - d.h, w: d.w, h: d.h, vx: 0, vy: 0, hp: hp, maxHp: hp, dir: -1, t: s.rand() * 1.2, st: 'idle', cd: 0.6 + s.rand() * 1.2, flash: 0, on: false, baseY: y - d.h, n: 0, fly: !!d.fly, still: !!d.still, pts: d.pts };
    if (type === 'iron') { e.y = y - 40; e.baseY = e.y; e.st = 'hang'; }
    return e;
  }

  // ----- 칸 충돌 -----
  function tileAt(s, col, row) {
    var m = s.map;
    if (row < 0 || row >= m.rows) return 0;
    if (col < 0 || col >= m.cols) return 1;
    return m.tiles[row * m.cols + col];
  }
  function solidAt(s, x, y) { return tileAt(s, Math.floor(x / T), Math.floor(y / T)) === 1; }
  function moveX(s, e, dx) {
    e.x += dx;
    var y0 = Math.floor((e.y + 1) / T), y1 = Math.floor((e.y + e.h - 2) / T), col, r;
    if (dx > 0) {
      col = Math.floor((e.x + e.w) / T);
      for (r = y0; r <= y1; r++) if (tileAt(s, col, r) === 1) { e.x = col * T - e.w - 0.01; e.vx = 0; return true; }
    } else if (dx < 0) {
      col = Math.floor(e.x / T);
      for (r = y0; r <= y1; r++) if (tileAt(s, col, r) === 1) { e.x = (col + 1) * T + 0.01; e.vx = 0; return true; }
    }
    return false;
  }
  function moveY(s, e, dy, drop) {
    var oldB = e.y + e.h;
    e.y += dy;
    var x0 = Math.floor((e.x + 2) / T), x1 = Math.floor((e.x + e.w - 2) / T), row, c;
    e.ground = false;
    if (dy >= 0) {
      row = Math.floor((e.y + e.h) / T);
      for (c = x0; c <= x1; c++) {
        var t = tileAt(s, c, row), top = row * T;
        if (t === 1 || (t === 2 && !drop && oldB <= top + 1)) { e.y = top - e.h; e.vy = 0; e.ground = true; e.onPlat = t === 2; return true; }
      }
    } else {
      row = Math.floor(e.y / T);
      for (c = x0; c <= x1; c++) if (tileAt(s, c, row) === 1) { e.y = (row + 1) * T; e.vy = 0; return true; }
    }
    return false;
  }
  function groundAhead(s, e, dir) {
    var x = dir > 0 ? e.x + e.w + 6 : e.x - 6, row = Math.floor((e.y + e.h + 6) / T), t = tileAt(s, Math.floor(x / T), row);
    return t === 1 || t === 2;
  }

  function ev(s, t, x, y, extra) {
    var e = extra || {}; e.t = t; e.x = x; e.y = y; s.events.push(e);
  }
  function onScreen(s, x, pad) { pad = pad || 0; return x > s.camX - pad && x < s.camX + VW + pad; }

  // ----- 점수·콤보 -----
  function addScore(s, pts, x, y) {
    var got = Math.round(pts * comboMult(s.combo));
    s.score += got;
    if (x != null) ev(s, 'score', x, y, { n: got });
  }
  function addCombo(s) {
    s.combo++; s.comboT = s.st.combo;
    if (s.combo > s.bestCombo) s.bestCombo = s.combo;
    if (s.combo % 10 === 0) { ev(s, 'combo', s.p.x, s.p.y, { n: s.combo }); dropItem(s, s.combo % 30 === 0 ? 'heart' : 'coins', s.p.x + 60 * s.p.face, s.p.y - 40); }
  }
  function dropItem(s, kind, x, y, extra) {
    if (kind === 'coins') { for (var i = 0; i < 5; i++) dropItem(s, 'coin', x, y); return; }
    var it = { kind: kind, x: x, y: y, vx: (s.rand() - 0.5) * 180, vy: -260 - s.rand() * 120, still: false, life: 14, age: 0 };
    if (extra) it.weapon = extra;
    s.items.push(it);
  }
  function dropWeapon(s, x, y) { dropItem(s, 'weapon', x, y, WEAPON_DROPS[Math.floor(s.rand() * WEAPON_DROPS.length)]); }
  function giveWeapon(s, w) {
    var add = Math.round(WEAPONS[w].ammo * s.st.ammo);
    if (s.p.weapon === w) s.p.ammo = Math.min(add * 2, s.p.ammo + add); else { s.p.weapon = w; s.p.ammo = add; }
  }

  // ----- 폭발·피해 -----
  function explode(s, x, y, r, dmg, side) { // side: 'p' 내 폭발, 'e' 적 폭발(나만 아픔), 'n' 모두
    ev(s, 'boom', x, y, { r: r });
    var i;
    if (side !== 'e') {
      for (i = 0; i < s.enemies.length; i++) { var e = s.enemies[i]; if (e.on && !e.dead && circleHit(x, y, r, e)) hurtEnemy(s, e, dmg, 0, true); }
      if (s.boss && !s.boss.dead && Boss.hitTest(s.boss, x, y, r)) hurtBoss(s, dmg);
    }
    for (i = 0; i < s.props.length; i++) { var p = s.props[i]; if (!p.gone && circleHit(x, y, r, p)) hurtProp(s, p, dmg); }
    if (side !== 'p' && circleHit(x, y, r * 0.8, s.p)) hurtPlayer(s, x);
  }
  function hurtEnemy(s, e, dmg, dirX, boom) {
    if (e.dead) return false;
    // 전자레인지 방패: 앞에서 오는 총알은 막는다(문이 열렸을 때·폭발은 통함)
    if (e.type === 'microwave' && !boom && e.st !== 'open' && dirX && (dirX > 0) !== (e.dir > 0)) { ev(s, 'clank', cxOf(e) + e.dir * 26, cyOf(e)); return false; }
    e.hp -= dmg; e.flash = 0.1;
    if (e.hp <= 0) killEnemy(s, e);
    return true;
  }
  function killEnemy(s, e) {
    e.dead = true; s.kills++;
    addCombo(s);
    addScore(s, e.pts, cxOf(e), e.y);
    ev(s, 'kill', cxOf(e), cyOf(e), { kind: e.type, w: e.w, h: e.h });
    var n = e.type === 'fridge' ? 6 : e.type === 'bulb' ? (s.rand() < 0.5 ? 1 : 0) : 1 + Math.floor(s.rand() * 2);
    for (var i = 0; i < n; i++) dropItem(s, 'coin', cxOf(e), cyOf(e));
    var r = s.rand();
    if (e.type === 'fridge') { r < 0.5 ? dropItem(s, 'heart', cxOf(e), cyOf(e)) : dropWeapon(s, cxOf(e), cyOf(e)); }
    else if (r < 0.035) dropWeapon(s, cxOf(e), cyOf(e));
    else if (r < 0.06) dropItem(s, 'bomb', cxOf(e), cyOf(e));
    else if (r < 0.072) dropItem(s, 'heart', cxOf(e), cyOf(e));
    if (s.st.leech && ++s.leechN >= Math.max(8, 32 - s.st.leech * 6)) { s.leechN = 0; heal(s, 1); }
  }
  function hurtBoss(s, dmg) {
    var b = s.boss;
    if (!b || b.dead || b.enter > 0) return;
    b.hp -= dmg; b.flash = 0.08;
    if (b.hp <= 0) {
      b.hp = 0; b.dead = true; b.deadT = 0;
      s.foes = []; s.beams = [];
      for (var i = 0; i < s.enemies.length; i++) if (s.enemies[i].on && !s.enemies[i].dead) killEnemy(s, s.enemies[i]);
      addScore(s, 5000 + s.diff * 120, b.x + b.w / 2, b.y);
      ev(s, 'boss-dead', b.x + b.w / 2, b.y + b.h / 2);
    }
  }
  function hurtProp(s, p, dmg) {
    if (p.gone) return;
    p.hp -= dmg; p.flash = 0.1;
    if (p.hp > 0) return;
    p.gone = true;
    var x = p.x + p.w / 2, y = p.y + p.h / 2;
    if (p.kind === 'barrel') { p.boom = true; addScore(s, 30); s.bombs.push({ fuse: 0.06, x: x, y: y, vx: 0, vy: 0, kind: 'barrel', side: 'n' }); }
    else if (p.kind === 'crate') {
      ev(s, 'crate', x, y);
      var r = s.rand();
      if (r < 0.34) dropWeapon(s, x, y); else if (r < 0.74) dropItem(s, 'coins', x, y); else if (r < 0.86) dropItem(s, 'bomb', x, y); else dropItem(s, 'heart', x, y);
    } else { // 동물 우리
      s.pets++;
      ev(s, 'pet', x, y, { pet: p.pet, n: s.pets });
      addScore(s, 500, x, y);
      if (s.p.hp < s.p.maxHp && s.rand() < 0.4) dropItem(s, 'heart', x, y); else dropWeapon(s, x, y);
      dropItem(s, 'coins', x, y);
    }
  }
  function heal(s, n) { s.p.hp = Math.min(s.p.maxHp, s.p.hp + n); ev(s, 'heal', s.p.x, s.p.y); }
  function hurtPlayer(s, fromX, fall) {
    var p = s.p;
    if (p.dead || s.status !== 'play' || s.god) return false;
    if (p.inv > 0 && !fall) return false;
    s.combo = 0;
    if (p.mech && !fall) {
      p.mech.hp--; p.inv = 0.7; ev(s, 'mech-hurt', cxOf(p), cyOf(p));
      if (p.mech.hp <= 0) leaveMech(s, true);
      return true;
    }
    s.hurts++;
    if (p.shield > 0) { p.shield--; p.inv = 1; ev(s, 'shield', cxOf(p), cyOf(p)); return true; }
    p.hp--;
    ev(s, 'hurt', cxOf(p), cyOf(p));
    p.inv = INV_TIME;
    if (!fall) { p.vx = (cxOf(p) < fromX ? -1 : 1) * 260; p.vy = -320; p.stun = 0.18; }
    if (p.hp <= 0) { p.dead = 1.3; p.vy = -520; s.deaths++; s.lives--; p.mech = null; ev(s, 'dead', cxOf(p), cyOf(p)); }
    return true;
  }
  function leaveMech(s, broken) {
    var p = s.p;
    if (!p.mech) return;
    var bx = cxOf(p), by = p.y + p.h;
    p.mech = null; p.w = 28; p.h = 56; p.x = bx - 14; p.y = by - 56; p.vy = -620; p.inv = 1.6;
    if (broken) explode(s, bx, by - 40, 130, 60, 'p');
  }
  function enterMech(s) {
    var p = s.p, by = p.y + p.h, bx = cxOf(p);
    setCrouch(s, false);
    p.mech = { hp: 10, max: 10 }; p.w = 62; p.h = 84; p.x = bx - 31; p.y = by - 84;
    // 벽에 끼지 않게 살짝 밀어 준다
    for (var i = 0; i < 3 && (solidAt(s, p.x, p.y + 40) || solidAt(s, p.x + p.w, p.y + 40)); i++) p.x += solidAt(s, p.x, p.y + 40) ? 24 : -24;
    s.mechSpot = null;
    ev(s, 'mech', bx, by - 40);
  }
  function respawn(s) {
    var p = s.p;
    if (s.lives <= 0) { s.status = 'fail'; ev(s, 'fail'); return; }
    p.hp = p.maxHp; p.inv = 3; p.dead = 0; p.vx = 0; p.vy = 0; p.weapon = 'screw'; p.ammo = 0; p.bombs = Math.max(p.bombs, s.st.bombs);
    placeSafe(s);
    ev(s, 'respawn', p.x, p.y);
  }
  // 구덩이에 빠졌거나 되살아날 때: 마지막으로 밟은 땅(잠긴 화면 안)으로 옮긴다
  function placeSafe(s) {
    var p = s.p, x = p.safeX;
    var lo = s.lock != null ? s.lock + 30 : 10, hi = s.lock != null ? s.lock + VW - 60 : s.map.width - 60;
    if (s.chase && x < s.chase.x + 420) x = s.chase.x + 420;
    x = clamp(x, lo, hi);
    for (var k = 0; k < 40; k++) {
      var tx = clamp(x + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * T * 0.5, lo, hi), c0 = Math.floor(tx / T), c1 = Math.floor((tx + 27) / T);
      for (var r = 4; r < 11; r++) {
        if (tileAt(s, c0, r) === 1 && tileAt(s, c1, r) === 1 && tileAt(s, c0, r - 1) === 0 && tileAt(s, c1, r - 1) === 0 && tileAt(s, c0, r - 2) === 0 && tileAt(s, c1, r - 2) === 0) {
          p.x = tx; p.y = r * T - p.h; p.vx = p.vy = 0; return;
        }
      }
    }
    p.x = x; p.y = 60;
  }

  // ----- 나 -----
  function setCrouch(s, on) {
    var p = s.p;
    if (p.mech) on = false;
    if (on === p.crouch) return;
    if (on) { p.crouch = true; p.y += 22; p.h = 34; }
    else {
      var y = p.y - 22;
      if (solidAt(s, p.x + 2, y + 2) || solidAt(s, p.x + p.w - 2, y + 2)) return;
      p.crouch = false; p.y = y; p.h = 56;
    }
  }
  function stepPlayer(s, input, dt) {
    var p = s.p, was = p.was;
    if (p.inv > 0) p.inv -= dt;
    if (p.dead) {
      p.vy += GRAV * dt; p.y += p.vy * dt;
      p.dead -= dt;
      if (p.dead <= 0) { p.dead = 0; if (p.h !== 56) { p.h = 56; p.w = 28; p.crouch = false; } respawn(s); }
      return;
    }
    if (s.status !== 'play') input = {};
    var dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    var jumpPress = input.jump && !was.jump, bombPress = input.bomb && !was.bomb;
    if (p.stun > 0) { p.stun -= dt; dir = 0; }
    var wantCrouch = !!input.down && p.ground && !p.mech;
    setCrouch(s, wantCrouch);
    if (dir) p.face = dir;
    var run = s.st.run * (p.mech ? 0.95 : 1);
    var target = p.crouch ? 0 : dir * run;
    if (!(p.stun > 0)) p.vx += (target - p.vx) * Math.min(1, dt * (p.ground ? 18 : 11));
    // 조준
    if (input.up) { p.ax = dir ? p.face * 0.7071 : 0; p.ay = dir ? -0.7071 : -1; }
    else if (input.down && !p.ground) { p.ax = 0; p.ay = 1; }
    else { p.ax = p.face; p.ay = 0; }
    // 점프
    if (p.ground) { p.coyote = 0.09; p.air = 0; } else p.coyote -= dt;
    if (jumpPress) p.buf = 0.12; else p.buf -= dt;
    if (p.buf > 0) {
      if (input.down && p.ground && p.onPlat) { p.drop = 0.2; p.buf = 0; setCrouch(s, false); p.y += 2; }
      else if (p.coyote > 0) { p.vy = -JUMP; p.buf = 0; p.coyote = 0; p.air = 1; setCrouch(s, false); ev(s, 'jump', cxOf(p), p.y + p.h); }
      else if (jumpPress && Math.max(1, p.air) < s.st.jumps) { p.air = Math.max(1, p.air) + 1; p.vy = -JUMP * 0.92; p.buf = 0; ev(s, 'jump2', cxOf(p), p.y + p.h); }
    }
    if (!input.jump && p.vy < -300) p.vy += GRAV * 1.1 * dt; // 짧게 누르면 낮게 뜀
    p.vy = Math.min(900, p.vy + GRAV * dt);
    if (p.drop > 0) p.drop -= dt;
    moveX(s, p, p.vx * dt);
    var fell = p.vy;
    if (moveY(s, p, p.vy * dt, p.drop > 0) && p.ground && fell > 500) ev(s, 'land', cxOf(p), p.y + p.h);
    // 화면 경계
    var lo = s.lock != null ? s.lock + 4 : 4, hi = (s.lock != null ? s.lock + VW : s.map.width) - p.w - 4;
    if (p.x < lo) { p.x = lo; if (p.vx < 0) p.vx = 0; }
    if (p.x > hi) { p.x = hi; if (p.vx > 0) p.vx = 0; }
    if (p.ground && !p.onPlat && tileAt(s, Math.floor((p.x - 4) / T), Math.floor((p.y + p.h + 4) / T)) === 1 && tileAt(s, Math.floor((p.x + p.w + 4) / T), Math.floor((p.y + p.h + 4) / T)) === 1) p.safeX = p.x;
    // 가시·구덩이
    var fc = Math.floor(cxOf(p) / T), fr = Math.floor((p.y + p.h - 3) / T);
    if (tileAt(s, fc, fr) === 3 && (p.y + p.h) > fr * T + 20) { if (hurtPlayer(s, cxOf(p) - p.face)) p.vy = -560; }
    if (p.y > VH + 60) {
      if (p.mech) leaveMech(s, false);
      if (s.god) placeSafe(s);
      else { hurtPlayer(s, p.x, true); if (!p.dead) { placeSafe(s); p.inv = 2; p.vx = 0; p.vy = 0; } else { p.dead = 0.6; } }
    }
    if (Math.abs(p.vx) > 30) p.anim += dt * Math.abs(p.vx) / 40; else p.anim = 0;
    if (p.shootPose > 0) p.shootPose -= dt;
    if (p.melee > 0) p.melee -= dt;
    // 로봇 타기
    if (s.mechSpot && !p.mech && hit(p, s.mechSpot)) enterMech(s);
    // 총
    p.fireT -= dt; p.bombT -= dt;
    if (input.fire && p.fireT <= 0 && s.status === 'play') fire(s);
    if (bombPress && p.bombT <= 0 && s.status === 'play') {
      if (p.mech) { if (p.mech.cd > s.time) { /* 대포 식는 중 */ } else { p.mech.cd = s.time + 0.8; s.shots.push({ x: cxOf(p) + p.face * 40, y: p.y + 30, vx: p.face * 700, vy: -40, dmg: 60 * s.st.dmg, r: 12, life: 1.4, kind: 'rocket', boom: 110, pierce: 0, hits: [] }); ev(s, 'rocket', cxOf(p), p.y + 30); } }
      else if (p.bombs > 0) {
        p.bombs--; p.bombT = 0.35;
        s.bombs.push({ x: cxOf(p), y: p.y + 10, vx: p.face * (input.up ? 220 : 420) + p.vx * 0.3, vy: input.up ? -760 : -480, fuse: 2, kind: 'bomb', side: 'p', bounce: 1 });
        ev(s, 'throw', cxOf(p), p.y);
      }
    }
    p.was = { jump: !!input.jump, bomb: !!input.bomb, fire: !!input.fire };
  }
  function fire(s) {
    var p = s.p, i;
    // 바로 앞 적은 렌치로 때린다(강하고 동전 보너스)
    if (!p.mech) {
      var box = { x: p.face > 0 ? p.x + p.w - 6 : p.x - 44, y: p.y - 6, w: 50, h: p.h + 10 };
      for (i = 0; i < s.enemies.length; i++) {
        var e = s.enemies[i];
        if (e.on && !e.dead && e.type !== 'fridge' && p.ay === 0 && hit(box, e)) {
          p.melee = 0.22; p.fireT = 0.3; ev(s, 'melee', cxOf(e), cyOf(e));
          hurtEnemy(s, e, 45 * s.st.dmg, 0, true);
          if (e.dead) { dropItem(s, 'coin', cxOf(e), cyOf(e)); addScore(s, 50); }
          return;
        }
      }
    }
    var id = p.mech ? 'mech' : p.weapon;
    var w = p.mech ? { rate: 0.085, dmg: 13, speed: 1000, life: 0.9, spread: 0.05 } : WEAPONS[id];
    p.fireT = w.rate / s.st.rate; p.shootPose = 0.25;
    var ox = cxOf(p) + p.ax * (p.mech ? 46 : 26), oy = p.y + (p.mech ? 38 : p.crouch ? 16 : 22) + p.ay * 30;
    var base = Math.atan2(p.ay, p.ax), n = w.pellets || 1;
    for (i = 0; i < n; i++) {
      var a = base + (n > 1 ? (i / (n - 1) - 0.5) * w.spread : (s.rand() - 0.5) * (w.spread || 0));
      s.shots.push({ x: ox, y: oy, vx: Math.cos(a) * w.speed + (id === 'flame' ? p.vx * 0.5 : 0), vy: Math.sin(a) * w.speed - (id === 'ball' ? 140 : 0), dmg: w.dmg * s.st.dmg, r: w.r || 5, life: w.life, kind: id, boom: w.boom || 0, pierce: (w.pierce || 0) + (id === 'screw' ? s.st.pierce : 0), bounce: w.bounce || 0, g: w.g || 0, chain: w.chain || 0, homing: !!w.homing, hits: [] });
    }
    ev(s, 'shot', ox, oy, { kind: id, ax: p.ax, ay: p.ay });
    if (!p.mech && id !== 'screw' && --p.ammo <= 0) { p.weapon = 'screw'; p.ammo = 0; ev(s, 'empty', p.x, p.y); }
  }

  // ----- 내 총알 -----
  function stepShots(s, dt) {
    for (var i = 0; i < s.shots.length; i++) {
      var b = s.shots[i];
      b.life -= dt;
      if (b.g) b.vy += b.g * dt;
      if (b.homing) home(s, b, dt);
      var steps = Math.max(1, Math.ceil((Math.abs(b.vx) + Math.abs(b.vy)) * dt / 24));
      for (var k = 0; k < steps && b.life > 0; k++) {
        var ox = b.x, oy = b.y;
        b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
        if (solidAt(s, b.x, b.y)) {
          if (b.bounce > 0) { b.bounce--; if (solidAt(s, b.x, oy)) b.vx = -b.vx; if (solidAt(s, ox, b.y)) b.vy = -b.vy * 0.9; b.x = ox; b.y = oy; }
          else { endShot(s, b); break; }
        }
        if (shotHits(s, b)) break;
      }
      if (b.life > 0 && (!onScreen(s, b.x, 60) || b.y < -60 || b.y > VH + 40)) b.life = 0;
    }
    s.shots = s.shots.filter(function (x) { return x.life > 0; });
  }
  function endShot(s, b) { b.life = 0; if (b.boom) explode(s, b.x, b.y, b.boom, b.dmg, 'p'); else ev(s, 'spark', b.x, b.y, { kind: b.kind }); }
  function home(s, b, dt) {
    var best = null, bd = 420;
    for (var i = 0; i < s.enemies.length; i++) { var e = s.enemies[i]; if (!e.on || e.dead) continue; var d = Math.hypot(cxOf(e) - b.x, cyOf(e) - b.y); if (d < bd) { bd = d; best = e; } }
    if (!best && s.boss && !s.boss.dead) best = s.boss;
    if (!best) return;
    var a = Math.atan2(b.vy, b.vx), want = Math.atan2(cyOf(best) - b.y, cxOf(best) - b.x), df = Math.atan2(Math.sin(want - a), Math.cos(want - a)), sp = Math.hypot(b.vx, b.vy);
    a += clamp(df, -3.2 * dt, 3.2 * dt); b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
  }
  function shotHits(s, b) {
    var i;
    for (i = 0; i < s.enemies.length; i++) {
      var e = s.enemies[i];
      if (!e.on || e.dead || b.hits.indexOf(e.id) >= 0 || !circleHit(b.x, b.y, b.r, e)) continue;
      if (b.boom) { endShot(s, b); return true; }
      b.hits.push(e.id);
      var ok = hurtEnemy(s, e, b.dmg, b.vx, false);
      if (ok) ev(s, 'hit', b.x, b.y);
      if (b.chain) zapChain(s, e, b);
      if (!ok || b.pierce-- <= 0) { b.life = 0; return true; }
    }
    if (s.boss && !s.boss.dead && Boss.hitTest(s.boss, b.x, b.y, b.r) && b.hits.indexOf('boss') < 0) {
      if (b.boom) { endShot(s, b); return true; }
      if (b.pierce > 0) b.hits.push('boss');
      hurtBoss(s, b.dmg); ev(s, 'hit', b.x, b.y);
      if (b.pierce-- <= 0) { b.life = 0; return true; }
    }
    for (i = 0; i < s.foes.length; i++) { // 터뜨릴 수 있는 적 미사일
      var f = s.foes[i];
      if (f.hp > 0 && Math.abs(f.x - b.x) < f.r + b.r + 4 && Math.abs(f.y - b.y) < f.r + b.r + 4) { f.hp -= b.dmg; if (f.hp <= 0) { f.life = 0; addScore(s, 20); ev(s, 'boom', f.x, f.y, { r: 30 }); } if (b.pierce-- <= 0) { b.life = 0; return true; } }
    }
    for (i = 0; i < s.props.length; i++) {
      var p = s.props[i];
      if (p.gone || !onScreen(s, p.x, 40) || b.hits.indexOf(p) >= 0 || !circleHit(b.x, b.y, b.r, p)) continue;
      if (b.boom) { endShot(s, b); return true; }
      b.hits.push(p);
      hurtProp(s, p, b.dmg); ev(s, 'spark', b.x, b.y, { kind: b.kind });
      if (b.pierce-- <= 0) { b.life = 0; return true; }
    }
    return false;
  }
  function zapChain(s, from, b) {
    var done = [from.id], cur = from;
    for (var n = 0; n < b.chain; n++) {
      var best = null, bd = 230;
      for (var i = 0; i < s.enemies.length; i++) { var e = s.enemies[i]; if (!e.on || e.dead || done.indexOf(e.id) >= 0) continue; var d = Math.hypot(cxOf(e) - cxOf(cur), cyOf(e) - cyOf(cur)); if (d < bd) { bd = d; best = e; } }
      if (!best) return;
      done.push(best.id);
      ev(s, 'zap', cxOf(cur), cyOf(cur), { x2: cxOf(best), y2: cyOf(best) });
      hurtEnemy(s, best, b.dmg * 0.7, 0, true);
      cur = best;
    }
  }

  // ----- 적 총알 -----
  function foe(s, o) { // o: x,y,vx,vy,kind,r,g,life,hp,w(파동)
    var f = { x: o.x, y: o.y, vx: o.vx * s.shotMul, vy: o.vy * (o.g ? 1 : s.shotMul), kind: o.kind || 'bolt', r: o.r || 7, g: o.g || 0, life: o.life || 5, hp: o.hp || 0, home: o.home || 0, bounce: o.bounce || 0, boom: o.boom || 0, wave: !!o.wave, warn: o.warn || 0, age: 0 };
    if (o.g) f.vx = o.vx;
    s.foes.push(f);
    return f;
  }
  function aimed(s, x, y, speed, kind, off, r) {
    var a = Math.atan2(cyOf(s.p) - y, cxOf(s.p) - x) + (off || 0);
    return foe(s, { x: x, y: y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, kind: kind, r: r || 7 });
  }
  function lob(s, x, y, kind, time, r, spread, boom) { // 포물선으로 나에게 던지기
    var g = 900, tx = cxOf(s.p) + (spread || 0), ty = s.p.y + s.p.h * 0.6;
    return foe(s, { x: x, y: y, vx: clamp((tx - x) / time, -460, 460), vy: (ty - y) / time - g * time / 2, g: g, kind: kind, r: r || 9, boom: boom || 0 });
  }
  function shock(s, x, dir, speed) { foe(s, { x: x, y: GROUND_Y - 16, vx: dir * speed, vy: 0, kind: 'wave', r: 16, wave: true, life: 2.6 }); }
  function stepFoes(s, dt) {
    var p = s.p;
    for (var i = 0; i < s.foes.length; i++) {
      var f = s.foes[i];
      f.age += dt;
      if (f.warn > 0) { f.warn -= dt; continue; }
      f.life -= dt;
      if (f.g) f.vy += f.g * dt;
      if (f.home) {
        var a = Math.atan2(f.vy, f.vx), w = Math.atan2(cyOf(p) - f.y, cxOf(p) - f.x), df = Math.atan2(Math.sin(w - a), Math.cos(w - a)), sp = Math.hypot(f.vx, f.vy);
        a += clamp(df, -f.home * dt, f.home * dt); f.vx = Math.cos(a) * sp; f.vy = Math.sin(a) * sp;
      }
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.wave) {
        var c = Math.floor(f.x / T);
        if (tileAt(s, c, 10) !== 1 || tileAt(s, c, 9) === 1) f.life = 0;
      } else if (solidAt(s, f.x, f.y)) {
        if (f.bounce > 0 && f.vy > 0) { f.bounce--; f.vy = -Math.abs(f.vy) * 0.8; f.y -= 6; }
        else { f.life = 0; if (f.boom) explode(s, f.x, f.y, f.boom, 30, 'e'); else ev(s, 'spark', f.x, f.y, { kind: 'foe' }); }
      }
      if (f.life > 0 && (!onScreen(s, f.x, 160) || f.y > VH + 60 || f.y < -500)) f.life = 0;
      if (f.life > 0 && !p.dead && circleHit(f.x, f.y, f.r * 0.8, p)) {
        if (p.inv <= 0) { hurtPlayer(s, f.x); if (!f.wave) f.life = 0; if (f.boom) ev(s, 'boom', f.x, f.y, { r: f.boom }); }
      }
    }
    s.foes = s.foes.filter(function (x) { return x.life > 0; });
    // 예고 뒤 켜지는 광선: { x, y, w, h, warn, on }
    for (i = 0; i < s.beams.length; i++) {
      var b = s.beams[i];
      if (b.warn > 0) { b.warn -= dt; if (b.warn <= 0) ev(s, 'beam', b.x, b.y); continue; }
      b.on -= dt;
      if (b.vx) b.x += b.vx * dt;
      if (!p.dead && hit(b, p)) hurtPlayer(s, b.x + b.w / 2);
    }
    s.beams = s.beams.filter(function (x) { return x.on > 0; });
  }

  // ----- 수류탄·통 -----
  function stepBombs(s, dt) {
    for (var i = 0; i < s.bombs.length; i++) {
      var b = s.bombs[i];
      b.fuse -= dt;
      if (b.kind === 'bomb') {
        b.vy += 1500 * dt; b.x += b.vx * dt; b.y += b.vy * dt;
        if (solidAt(s, b.x, b.y + 6)) { if (b.bounce-- > 0 && b.vy > 0) { b.y -= b.vy * dt; b.vy = -b.vy * 0.4; b.vx *= 0.6; } else b.fuse = 0; }
        var touch = s.enemies.some(function (e) { return e.on && !e.dead && circleHit(b.x, b.y, 10, e); });
        if (touch || (s.boss && !s.boss.dead && Boss.hitTest(s.boss, b.x, b.y, 10))) b.fuse = 0;
        if (b.y > VH + 50) { b.gone = true; continue; }
      }
      if (b.fuse <= 0) { b.gone = true; explode(s, b.x, b.y, b.kind === 'barrel' ? 115 : 105, 70 * (b.side === 'p' ? s.st.dmg : 1), b.side); }
    }
    s.bombs = s.bombs.filter(function (b) { return !b.gone; });
    s.props = s.props.filter(function (p) { if (p.flash > 0) p.flash -= dt; return !p.gone; });
  }

  // ----- 아이템 -----
  function stepItems(s, dt) {
    var p = s.p, px = cxOf(p), py = cyOf(p);
    for (var i = 0; i < s.items.length; i++) {
      var it = s.items[i];
      it.age = (it.age || 0) + dt;
      if (!onScreen(s, it.x, 200)) continue;
      var d = Math.hypot(px - it.x, py - it.y);
      if (it.kind === 'coin' && d < s.st.magnet && !p.dead) { it.pull = true; }
      if (it.pull) { var sp = 620 * dt / Math.max(1, d); it.x += (px - it.x) * Math.min(1, sp); it.y += (py - it.y) * Math.min(1, sp); }
      else if (!it.still) {
        it.life -= dt; it.vy += 1300 * dt;
        var ny = it.y + it.vy * dt, nx = it.x + it.vx * dt;
        if (solidAt(s, nx, it.y)) { it.vx = -it.vx * 0.5; nx = it.x; }
        var row = Math.floor((ny + 14) / T), t = tileAt(s, Math.floor(nx / T), row);
        if (it.vy > 0 && (t === 1 || (t === 2 && it.y + 14 <= row * T + 2))) { ny = row * T - 14; it.vy = it.vy > 200 ? -it.vy * 0.35 : 0; it.vx *= 0.6; }
        it.x = nx; it.y = ny;
        if (it.y > VH + 60) it.life = 0;
      }
      if (!p.dead && it.age > 0.15 && Math.abs(px - it.x) < p.w / 2 + 16 && Math.abs(py - it.y) < p.h / 2 + 16) takeItem(s, it);
    }
    s.items = s.items.filter(function (x) { return x.life > 0; });
  }
  function takeItem(s, it) {
    it.life = 0;
    var p = s.p;
    if (it.kind === 'coin') { s.coins += 1; s.score += 10; ev(s, 'coin', it.x, it.y); }
    else if (it.kind === 'heart') { heal(s, 1); }
    else if (it.kind === 'bomb') { p.bombs = Math.min(25, p.bombs + 3); ev(s, 'power', it.x, it.y, { text: '폭탄 +3' }); }
    else if (it.kind === 'weapon') { giveWeapon(s, it.weapon); ev(s, 'power', it.x, it.y, { text: WEAPONS[it.weapon].name + '!' }); }
  }

  // ----- 적 움직임 -----
  function stepEnemies(s, dt) {
    var p = s.p;
    for (var i = 0; i < s.enemies.length; i++) {
      var e = s.enemies[i];
      if (e.dead) continue;
      if (!e.on) { if (e.x < s.camX + VW + 50 && e.x + e.w > s.camX - 80) e.on = true; else continue; }
      if (e.x < s.camX - 700 || e.x > s.camX + VW + 700) continue; // 너무 멀면 쉼
      if (e.flash > 0) e.flash -= dt;
      e.t += dt; e.cd -= dt * s.rateMul;
      AI[e.type](s, e, dt, p);
      if (!e.fly) {
        e.vy = Math.min(900, e.vy + GRAV * 0.9 * dt);
        moveY(s, e, e.vy * dt, false);
        if (e.y > VH + 80) { e.dead = true; continue; }
      }
      if (e.arena && s.lock != null) e.x = clamp(e.x, s.lock + 6, s.lock + VW - e.w - 6); // 잠긴 화면 밖으로 숨지 않게
      // 총알을 쏘지 않을 때도 몸에 닿으면 아프다
      if (!p.dead && p.inv <= 0 && !e.dead && e.type !== 'cam' && e.type !== 'turret' && hit(e, p) && e.st !== 'hang') {
        if (p.mech) { hurtEnemy(s, e, 40, 0, true); if (!e.dead) hurtPlayer(s, cxOf(e)); }
        else hurtPlayer(s, cxOf(e));
      }
    }
    s.enemies = s.enemies.filter(function (e) { return !e.dead; });
  }
  function canSee(s, e, range) { return onScreen(s, cxOf(e), -10) && Math.abs(cxOf(s.p) - cxOf(e)) < range && !s.p.dead; }
  function facePlayer(s, e) { e.dir = cxOf(s.p) < cxOf(e) ? -1 : 1; }
  function walk(s, e, dt, speed) {
    if (e.ground && !groundAhead(s, e, e.dir)) { e.vx = 0; return true; }
    e.vx = e.dir * speed;
    return moveX(s, e, e.vx * dt);
  }
  var AI = {
    toaster: function (s, e, dt, p) {
      var far = Math.abs(cxOf(p) - cxOf(e));
      if (e.st === 'wind') {
        if (e.cd <= 0) {
          e.st = 'idle'; e.cd = 1.7;
          if (Math.abs(cyOf(p) - cyOf(e)) < 60 && s.rand() < 0.65) foe(s, { x: cxOf(e) + e.dir * 24, y: e.y + 16, vx: e.dir * 300, vy: 0, kind: 'toast', r: 9 });
          else lob(s, cxOf(e), e.y, 'toast', 0.95, 9, (s.rand() - 0.5) * 60);
          ev(s, 'foe-shot', cxOf(e), e.y);
        }
        return;
      }
      facePlayer(s, e);
      if (canSee(s, e, 640) && e.cd <= 0) { e.st = 'wind'; e.cd = 0.4; return; }
      if (far > 230) walk(s, e, dt, 75);
    },
    kettle: function (s, e, dt, p) {
      if (e.st === 'fuse') {
        e.n -= dt;
        if (e.n <= 0) { e.dead = true; explode(s, cxOf(e), cyOf(e), 85, 40, 'n'); s.kills++; }
        return;
      }
      facePlayer(s, e);
      var dx = Math.abs(cxOf(p) - cxOf(e));
      if (dx < 46 && Math.abs(cyOf(p) - cyOf(e)) < 70 && !p.dead) { e.st = 'fuse'; e.n = 0.5; ev(s, 'fuse', cxOf(e), e.y); return; }
      if (dx < 700 && walk(s, e, dt, 165 + s.diff * 1.2) && e.ground && e.cd <= 0) { e.vy = -640; e.cd = 0.8; }
      if (dx < 90 && cyOf(p) < cyOf(e) - 70 && e.ground && e.cd <= 0) { e.vy = -820; e.cd = 1.4; } // 발판 위로 도망가면 뛰어오른다
      if (!e.ground) moveX(s, e, e.dir * 120 * dt);
    },
    fan: function (s, e, dt, p) {
      facePlayer(s, e);
      var tx = cxOf(p) - e.dir * 210;
      if (tx < s.camX + 50 || tx > s.camX + VW - 50) tx = cxOf(p) + e.dir * 210; // 벽 쪽이면 반대편으로
      var ty = Math.min(e.baseY, 190) + Math.sin(e.t * 2) * 26;
      e.vx += clamp(tx - cxOf(e), -130, 130) * dt * 1.6; e.vx *= 1 - dt * 1.2;
      e.x += e.vx * dt; e.y += (ty - e.y) * dt * 1.6;
      if (e.cd <= 0 && canSee(s, e, 620)) { e.cd = 2.1; aimed(s, cxOf(e), cyOf(e) + 12, 260, 'wind', 0, 8); ev(s, 'foe-shot', cxOf(e), e.y); }
    },
    bulb: function (s, e, dt, p) {
      facePlayer(s, e);
      var a = Math.atan2(cyOf(p) - cyOf(e), cxOf(p) - cxOf(e)), sp = 125 + s.diff;
      e.x += (Math.cos(a) * sp + Math.sin(e.t * 5) * 50) * dt; e.y += (Math.sin(a) * sp * 0.7 + Math.cos(e.t * 6) * 80) * dt;
    },
    vacuum: function (s, e, dt, p) {
      if (e.st === 'dash') { e.n -= dt; if (walk(s, e, dt, 330) || e.n <= 0) { e.st = 'idle'; e.cd = 1.3; } return; }
      if (e.st === 'wind') { if (e.cd <= 0) { e.st = 'dash'; e.n = 0.9; } return; }
      if (canSee(s, e, 380) && Math.abs(cyOf(p) - cyOf(e)) < 90 && e.cd <= 0) { facePlayer(s, e); e.st = 'wind'; e.cd = 0.45; ev(s, 'fuse', cxOf(e), e.y); return; }
      if (walk(s, e, dt, 95)) e.dir = -e.dir;
    },
    turret: function (s, e, dt) {
      facePlayer(s, e);
      if (e.n > 0) { if (e.cd <= 0) { e.n--; e.cd = 0.16; aimed(s, cxOf(e) + e.dir * 22, e.y + 14, 310, 'bolt'); ev(s, 'foe-shot', cxOf(e), e.y); if (e.n === 0) e.cd = 2.2; } return; }
      if (e.cd <= 0 && canSee(s, e, 660)) { e.n = 3; e.cd = 0.4; }
    },
    cam: function (s, e, dt, p) {
      facePlayer(s, e);
      if (e.st === 'aim') {
        if (e.cd > 0.3) e.aim = Math.atan2(cyOf(p) - (e.y + 12), cxOf(p) - cxOf(e));
        if (e.cd <= 0) { e.st = 'idle'; e.cd = 2.2; foe(s, { x: cxOf(e), y: e.y + 12, vx: Math.cos(e.aim) * 760, vy: Math.sin(e.aim) * 760, kind: 'snipe', r: 6 }); ev(s, 'snipe', cxOf(e), e.y); }
        return;
      }
      if (e.cd <= 0 && canSee(s, e, 760)) { e.st = 'aim'; e.cd = 1.2; e.aim = Math.atan2(cyOf(p) - e.y, cxOf(p) - cxOf(e)); ev(s, 'aim', cxOf(e), e.y); }
    },
    speaker: function (s, e, dt) {
      facePlayer(s, e);
      if (e.cd <= 0 && canSee(s, e, 560)) {
        if (e.st !== 'wind') { e.st = 'wind'; e.cd = 0.5; return; }
        e.st = 'idle'; e.cd = 2.5;
        if (e.y + e.h > GROUND_Y - 4) shock(s, cxOf(e), e.dir, 270);
        else for (var k = -1; k <= 1; k++) aimed(s, cxOf(e), cyOf(e), 240, 'note', k * 0.3, 10);
        ev(s, 'thump', cxOf(e), e.y);
      }
    },
    microwave: function (s, e, dt, p) {
      if (e.st === 'open') {
        e.n -= dt;
        if (e.n < 0.55 && !e.shot) { e.shot = true; for (var k = -1; k <= 1; k++) aimed(s, cxOf(e) + e.dir * 28, cyOf(e), 250, 'micro', k * 0.26, 8); ev(s, 'foe-shot', cxOf(e), e.y); }
        if (e.n <= 0) { e.st = 'idle'; e.cd = 2.6; }
        return;
      }
      if (e.cd <= 0) {
        if (e.st === 'turn') { e.st = 'idle'; e.dir = -e.dir; e.cd = 0.8; }
        else if (canSee(s, e, 560) && (cxOf(p) < cxOf(e) ? -1 : 1) === e.dir) { e.st = 'open'; e.n = 1.15; e.shot = false; return; }
      }
      if ((cxOf(p) < cxOf(e) ? -1 : 1) !== e.dir) { if (e.st !== 'turn') { e.st = 'turn'; e.cd = 0.7; } } // 뒤로 돌면 늦게 따라 돈다
      else if (e.st === 'turn') e.st = 'idle';
      else if (Math.abs(cxOf(p) - cxOf(e)) > 150) walk(s, e, dt, 48);
    },
    blender: function (s, e, dt, p) {
      if (e.ground) {
        if (e.st === 'air') { e.st = 'idle'; e.cd = 1.1; shock(s, e.x, -1, 230); shock(s, e.x + e.w, 1, 230); ev(s, 'thump', cxOf(e), e.y + e.h); }
        facePlayer(s, e);
        if (e.cd <= 0 && canSee(s, e, 560)) { e.st = 'air'; e.vy = -700; e.vx = clamp((cxOf(p) - cxOf(e)) / 0.8, -260, 260); }
      } else if (e.st === 'air') moveX(s, e, e.vx * dt);
    },
    iron: function (s, e, dt, p) {
      if (e.st === 'hang') { if (Math.abs(cxOf(p) - cxOf(e)) < 46 + Math.abs(p.vx) * 0.12 && !p.dead) { e.st = 'shake'; e.n = 0.25; ev(s, 'fuse', cxOf(e), e.y); } }
      else if (e.st === 'shake') { e.n -= dt; if (e.n <= 0) { e.st = 'fall'; e.vy = 200; } }
      else if (e.st === 'fall') {
        e.vy += 2200 * dt; e.y += e.vy * dt;
        if (solidAt(s, cxOf(e), e.y + e.h)) { e.y = Math.floor((e.y + e.h) / T) * T - e.h; e.st = 'wait'; e.n = 0.8; ev(s, 'thump', cxOf(e), e.y + e.h); }
        else if (e.y > VH + 80) e.dead = true;
      } else if (e.st === 'wait') { e.n -= dt; if (e.n <= 0) e.st = 'rise'; }
      else { e.y -= 110 * dt; if (e.y <= e.baseY) { e.y = e.baseY; e.st = 'hang'; } }
    },
    fridge: function (s, e, dt, p) {
      facePlayer(s, e);
      if (Math.abs(cxOf(p) - cxOf(e)) > 180) walk(s, e, dt, 34);
      if (e.cd <= 0 && canSee(s, e, 700)) {
        e.n++; e.cd = 2.4;
        for (var k = -1; k <= 1; k++) lob(s, cxOf(e), e.y + 10, 'ice', 1.0, 11, k * 90);
        ev(s, 'foe-shot', cxOf(e), e.y);
        if (e.n % 3 === 0 && s.enemies.length < 40) { var v = makeEnemy(s, 'vacuum', cxOf(e), e.y + e.h); v.on = true; v.dir = e.dir; s.enemies.push(v); }
      }
    }
  };

  // ----- 전투 구역·보스·카메라 -----
  function stepFlow(s, dt) {
    var p = s.p, i;
    for (i = 0; i < s.map.arenas.length; i++) {
      var a = s.map.arenas[i];
      if (a.state === 'wait' && p.x > a.x + 260) { a.state = 'on'; s.arena = a; s.lock = a.x; nextWave(s, a); ev(s, 'arena'); }
    }
    if (s.spawnQ.length) {
      for (i = 0; i < s.spawnQ.length; i++) {
        var q = s.spawnQ[i];
        q.delay -= dt;
        if (q.delay <= 0) {
          var fly = ENEMIES[q.type].fly;
          var e = makeEnemy(s, q.type, q.side < 0 ? s.lock + 24 : s.lock + VW - 24, fly ? 160 : GROUND_Y);
          if (q.type === 'iron') e.st = 'rise';
          e.on = true; e.arena = true; e.dir = -q.side; s.enemies.push(e);
          ev(s, 'spawn', cxOf(e), cyOf(e));
        }
      }
      s.spawnQ = s.spawnQ.filter(function (x) { return x.delay > 0; });
    }
    if (s.arena && !s.spawnQ.length) {
      var left = s.enemies.some(function (e) { return e.arena && !e.dead; });
      if (!left) {
        if (s.arena.wave + 1 < s.arena.waves.length) nextWave(s, s.arena);
        else { s.arena.state = 'done'; s.arena = null; s.lock = null; s.go = 2.5; dropItem(s, 'coins', p.x + 80, p.y - 60); dropWeapon(s, p.x + 110, p.y - 60); addScore(s, 800, p.x, p.y); ev(s, 'go'); }
      }
    }
    if (s.go > 0) s.go -= dt;
    // 보스
    if (s.bossAt && p.x > s.bossAt.x + 240) {
      s.lock = s.bossAt.x;
      s.boss = Boss.create(s.bossAt.kind, s.lock, s.diff, s.tower);
      s.bossAt = null;
      s.enemies = s.enemies.filter(function (e) { return cxOf(e) > s.lock; });
      ev(s, 'boss', 0, 0, { name: s.boss.name });
    }
    if (s.boss) {
      Boss.step(s, s.boss, dt, kit);
      var b = s.boss;
      if (b.dead) {
        b.deadT += dt;
        if (Math.floor(b.deadT * 8) !== Math.floor((b.deadT - dt) * 8)) ev(s, 'boom', b.x + s.rand() * b.w, b.y + s.rand() * b.h, { r: 60 });
        if (b.deadT > 2.4 && s.status === 'play') win(s);
      } else if (!p.dead && p.inv <= 0 && b.enter <= 0 && Boss.touch(b, p)) hurtPlayer(s, b.x + b.w / 2);
    }
    // 추격 벽
    if (s.chase) {
      var c = s.chase;
      if (c.wait > 0) c.wait -= dt;
      else {
        var gap = p.x - c.x;
        c.x += c.speed * dt * (gap > 900 ? 1.9 : gap > 620 ? 1.25 : 1);
        if (p.x < c.x && !p.dead) { if (hurtPlayer(s, c.x - 100)) { c.x -= 260; p.vx = 420; } else if (p.inv > 0 || s.god) c.x = Math.min(c.x, p.x - 10); }
        for (i = 0; i < s.enemies.length; i++) if (cxOf(s.enemies[i]) < c.x - 20) { s.enemies[i].dead = true; ev(s, 'boom', cxOf(s.enemies[i]), cyOf(s.enemies[i]), { r: 40 }); }
      }
    }
    // 도착
    if (s.map.goal && p.x > s.map.goal.x && s.status === 'play' && !p.dead) win(s);
    // 카메라
    var want = p.x + p.w / 2 - VW * 0.42 + p.face * 40;
    if (s.lock != null) want = s.lock;
    want = clamp(want, 0, s.map.width - VW);
    s.camX += (want - s.camX) * Math.min(1, dt * (s.lock != null ? 4 : 6));
  }
  function nextWave(s, a) {
    a.wave++;
    s.spawnQ = a.waves[a.wave].map(function (q) { return { type: q.type, side: q.side, delay: q.delay + 0.5 }; });
    ev(s, 'wave', 0, 0, { n: a.wave + 1, of: a.waves.length });
  }
  function win(s) {
    s.status = 'clear';
    var par = s.map.type === 'boss' ? 90 : 60 + s.map.width / 100;
    s.result = resultOf(s, par);
    s.score += s.result.bonus;
    ev(s, 'clear');
  }
  function resultOf(s, par) {
    var time = Math.max(0, Math.round((par - s.time) * 25)), hp = s.p.hp * 300, nodeath = s.deaths === 0 ? 2000 : 0, combo = s.bestCombo * 50;
    var stars = 1 + (s.deaths === 0 ? 1 : 0) + (s.pets >= s.petsTotal ? 1 : 0);
    return { time: time, hp: hp, nodeath: nodeath, combo: combo, bonus: time + hp + nodeath + combo, stars: stars };
  }

  var kit = { foe: foe, aimed: aimed, lob: lob, shock: shock, explode: explode, makeEnemy: makeEnemy, ev: ev, dropItem: dropItem, dropWeapon: dropWeapon, GROUND_Y: GROUND_Y, cx: cxOf, cy: cyOf, clamp: clamp };

  function update(s, input, dt) {
    s.events = [];
    if (s.status === 'play') {
      s.time += dt;
      if (s.comboT > 0) { s.comboT -= dt; if (s.comboT <= 0) s.combo = 0; }
    }
    stepPlayer(s, input || {}, dt);
    stepShots(s, dt);
    stepBombs(s, dt);
    stepEnemies(s, dt);
    if (s.status === 'play') { stepFoes(s, dt); stepFlow(s, dt); }
    stepItems(s, dt);
    return s.events;
  }

  // 끝없는 탑: 층을 깰 때마다 셋 중 하나를 고르는 능력
  var PERKS = [
    { id: 'heal', icon: '❤️', name: '하트 2칸 회복', desc: '바로 하트 2칸을 채워요', once: true },
    { id: 'hp', icon: '💖', name: '최대 하트 +1', desc: '최대 하트가 늘고 1칸 회복', add: 1 },
    { id: 'dmg', icon: '💥', name: '공격력 +20%', desc: '모든 총과 폭탄이 더 세져요', add: 0.2 },
    { id: 'rate', icon: '⚡', name: '연사 속도 +15%', desc: '총을 더 빨리 쏴요', add: 0.15 },
    { id: 'run', icon: '👟', name: '달리기 +8%', desc: '더 빨리 달려요', add: 0.08, max: 0.4 },
    { id: 'bomb', icon: '💣', name: '폭탄 +4', desc: '폭탄을 4개 더 받아요', add: 4 },
    { id: 'coin', icon: '🪙', name: '동전 +50%', desc: '끝날 때 동전을 더 받아요', add: 0.5 },
    { id: 'leech', icon: '🔧', name: '고철 수리', desc: '로봇을 많이 부수면 하트 회복', add: 1, max: 4 },
    { id: 'pierce', icon: '🔩', name: '뚫는 나사', desc: '나사총이 적 하나를 더 뚫어요', add: 1, max: 3 },
    { id: 'jump', icon: '🦘', name: '공중 점프 +1', desc: '하늘에서 한 번 더 뛰어요', add: 1, max: 2 },
    { id: 'shield', icon: '🛡️', name: '층마다 방패 +1', desc: '층마다 피해를 한 번 막아요', add: 1, max: 3 },
    { id: 'gun', icon: '🎁', name: '무기 상자', desc: '특별한 총을 바로 받아요', once: true }
  ];
  function perkChoices(mods, rand) {
    var pool = PERKS.filter(function (p) { return !p.max || (mods[p.id] || 0) < p.max - 1e-9; }), out = [];
    while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    return out;
  }
  // 고른 능력을 mods·carry에 반영한다(다음 층 create에 그대로 넘김)
  function applyPerk(perk, mods, carry, rand) {
    if (perk.add) mods[perk.id] = (mods[perk.id] || 0) + perk.add;
    if (perk.id === 'heal') carry.hp += 2;
    if (perk.id === 'hp') carry.hp += 1;
    if (perk.id === 'bomb') carry.bombs += 4;
    if (perk.id === 'gun') { carry.weapon = WEAPON_DROPS[Math.floor(rand() * WEAPON_DROPS.length)]; carry.ammo = WEAPONS[carry.weapon].ammo; }
  }

  return { create: create, update: update, WEAPONS: WEAPONS, WEAPON_DROPS: WEAPON_DROPS, ENEMIES: ENEMIES, PERKS: PERKS, perkChoices: perkChoices, applyPerk: applyPerk, statsOf: statsOf, comboMult: comboMult, makeEnemy: makeEnemy, hurtEnemy: hurtEnemy, hurtPlayer: hurtPlayer, solidAt: solidAt, tileAt: tileAt, GROUND_Y: GROUND_Y };
});
