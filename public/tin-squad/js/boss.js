// ===== boss.js =====
// 깡통 소탕대 보스 8명(화면을 모름, 브라우저 window.TinSquad.Boss · Node 겸용).
// 공격(ATT)은 작은 부품이고, 보스마다 부품 목록이 달라 싸우는 느낌이 다르다.
// 모든 공격은 예고(wind)가 먼저 나와서 보고 피할 수 있다. 체력이 절반 아래면 화가 나서 빨라진다(rage).
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.TinSquad = root.TinSquad || {}; root.TinSquad.Boss = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var VW = 960;
  // move: ground(땅에서 걷기) / hover(하늘) / wall(오른쪽 벽에 붙음)
  var BOSSES = {
    toastking: { name: '대왕 토스터', w: 150, h: 150, hp: 900, move: 'ground', attacks: ['lobs', 'jump', 'burst'], shot: 'toast' },
    dustking: { name: '먹보 청소기', w: 170, h: 130, hp: 1080, move: 'ground', attacks: ['charge', 'burst', 'summon', 'lobs'], shot: 'dust', minion: 'vacuum' },
    train: { name: '폭주 전동차', w: 240, h: 150, hp: 1300, move: 'ground', attacks: ['charge', 'beams', 'lobs', 'waves'], shot: 'bolt' },
    clown: { name: '빙글 광대 풍선기', w: 140, h: 150, hp: 1350, move: 'hover', attacks: ['spiral', 'rain', 'burst', 'summon'], shot: 'wind', minion: 'bulb' },
    queen: { name: '얼음 냉장고 여왕', w: 150, h: 180, hp: 1600, move: 'ground', attacks: ['rain', 'fan', 'jump', 'lobs'], shot: 'ice' },
    airship: { name: '선풍기 비행선', w: 250, h: 120, hp: 1750, move: 'hover', attacks: ['missiles', 'bombrun', 'beams', 'summon'], shot: 'bolt', minion: 'fan' },
    dragon: { name: '용광로 오븐 용', w: 210, h: 190, hp: 2000, move: 'wall', attacks: ['fan', 'sweep', 'rain', 'missiles', 'waves'], shot: 'fire' },
    overlord: { name: '스피커 대마왕', w: 190, h: 200, hp: 2500, move: 'hover', attacks: ['spiral', 'beams', 'missiles', 'sweep', 'rain', 'summon', 'fan'], shot: 'note', minion: 'kettle' }
  };

  function create(kind, lock, diff, tower) {
    var d = BOSSES[kind], hp = Math.round(d.hp * (tower ? 0.55 + diff * 0.022 : 1));
    var b = { kind: kind, name: d.name, w: d.w, h: d.h, hp: hp, maxHp: hp, move: d.move, shot: d.shot, minion: d.minion, attacks: d.attacks, lock: lock,
      x: lock + VW + 40, y: 450 - d.h, vx: 0, vy: 0, dir: -1, t: 0, enter: 1.8, st: 'idle', cd: 1.2, atk: null, at: 0, i: -1, flash: 0, dead: false, deadT: 0, rage: false, n: 0 };
    b.homeX = lock + VW - d.w - 70;
    b.homeY = d.move === 'hover' ? 70 : 450 - d.h;
    b.y = b.homeY;
    return b;
  }
  function hitTest(b, x, y, r) {
    if (b.enter > 0) return false;
    var px = Math.max(b.x + 10, Math.min(x, b.x + b.w - 10)), py = Math.max(b.y + 8, Math.min(y, b.y + b.h));
    return (x - px) * (x - px) + (y - py) * (y - py) <= r * r;
  }
  function touch(b, p) { return p.x < b.x + b.w - 18 && p.x + p.w > b.x + 18 && p.y < b.y + b.h && p.y + p.h > b.y + 20; }

  function every(b, dt, gap) { return Math.floor(b.at / gap) !== Math.floor((b.at - dt) / gap); }
  // 공격 부품: wind 예고 시간, dur 길이, start/tick/end(s, b, kit, dt)
  var ATT = {
    burst: { wind: 0.5, dur: 1.2, tick: function (s, b, k, dt) { if (every(b, dt, b.rage ? 0.16 : 0.22)) { k.aimed(s, b.x + b.w / 2 + b.dir * b.w * 0.4, b.y + b.h * 0.4, 330, b.shot, (s.rand() - 0.5) * 0.25, 9); k.ev(s, 'foe-shot', b.x, b.y); } } },
    lobs: { wind: 0.5, dur: 1.3, tick: function (s, b, k, dt) { if (every(b, dt, b.rage ? 0.2 : 0.28)) { k.lob(s, b.x + b.w / 2, b.y + 10, b.shot, 1.05, 11, (s.rand() - 0.5) * 320); k.ev(s, 'foe-shot', b.x, b.y); } } },
    fan: { wind: 0.6, dur: 1.3, tick: function (s, b, k, dt) { if (every(b, dt, b.rage ? 0.45 : 0.6)) { for (var i = -2; i <= 2; i++) k.aimed(s, b.x + b.w / 2 + b.dir * b.w * 0.35, b.y + b.h * 0.35, 280, b.shot, i * 0.22, 9); k.ev(s, 'foe-shot', b.x, b.y); } } },
    spiral: { wind: 0.6, dur: 2.4, tick: function (s, b, k, dt) { if (every(b, dt, 0.15)) { var n = b.rage ? 4 : 3; for (var i = 0; i < n; i++) { var a = b.at * 1.7 + i * Math.PI * 2 / n; k.foe(s, { x: b.x + b.w / 2, y: b.y + b.h / 2, vx: Math.cos(a) * 215, vy: Math.sin(a) * 215, kind: b.shot, r: 8 }); } } } },
    rain: { wind: 0.3, dur: 2.0, tick: function (s, b, k, dt) { if (every(b, dt, b.rage ? 0.17 : 0.24)) { var x = s.rand() < 0.3 ? k.cx(s.p) : b.lock + 30 + s.rand() * (VW - 60); k.foe(s, { x: x, y: -20, vx: 0, vy: 380, kind: b.shot, r: 11, warn: 0.75 }); } } },
    waves: { wind: 0.5, dur: 1.5, tick: function (s, b, k, dt) { if (every(b, dt, b.rage ? 0.55 : 0.75)) { k.shock(s, b.x + b.w / 2 + b.dir * b.w * 0.5, b.dir, 330); k.ev(s, 'thump', b.x + b.w / 2, b.y + b.h); } } },
    charge: { wind: 0.8, dur: 2.2, start: function (s, b) { b.dir = s.p.x < b.x + b.w / 2 ? -1 : 1; b.n = 0; },
      tick: function (s, b, k, dt) {
        b.x += b.dir * (b.rage ? 640 : 540) * dt;
        var lo = b.lock + 6, hi = b.lock + VW - b.w - 6;
        if (b.x < lo || b.x > hi) { b.x = k.clamp(b.x, lo, hi); b.dir = -b.dir; b.at = 99; k.ev(s, 'thump', b.x + b.w / 2, b.y + b.h); for (var i = 0; i < 4; i++) k.foe(s, { x: b.lock + 80 + s.rand() * (VW - 160), y: -20, vx: 0, vy: 360, kind: 'rock', r: 12, warn: 0.5 + s.rand() * 0.4 }); }
      } },
    jump: { wind: 0.5, dur: 1.4, start: function (s, b, k) { b.vy = -900; b.vx = k.clamp((k.cx(s.p) - b.w / 2 - b.x) / 0.95, -520, 520); },
      tick: function (s, b, k, dt) {
        b.vy += 1900 * dt; b.y += b.vy * dt; b.x = k.clamp(b.x + b.vx * dt, b.lock + 6, b.lock + VW - b.w - 6);
        if (b.y >= b.homeY && b.vy > 0) { b.y = b.homeY; b.at = 99; k.shock(s, b.x + 20, -1, 310); k.shock(s, b.x + b.w - 20, 1, 310); k.ev(s, 'thump', b.x + b.w / 2, b.y + b.h); }
      }, end: function (s, b) { b.y = b.homeY; b.vy = 0; } },
    summon: { wind: 0.5, dur: 0.4, start: function (s, b, k) {
      if (s.enemies.length > 7) return;
      for (var i = 0; i < (b.rage ? 3 : 2); i++) { var e = k.makeEnemy(s, b.minion, i % 2 ? b.lock + 30 : b.lock + VW - 30, b.minion === 'fan' || b.minion === 'bulb' ? 150 : k.GROUND_Y); e.on = true; s.enemies.push(e); k.ev(s, 'spawn', e.x, e.y); }
    } },
    missiles: { wind: 0.5, dur: 1.4, tick: function (s, b, k, dt) { if (every(b, dt, b.rage ? 0.38 : 0.5)) { k.foe(s, { x: b.x + b.w / 2, y: b.y + 20, vx: (s.rand() - 0.5) * 260, vy: -190, kind: 'missile', r: 11, hp: 18, home: 2.1, life: 4.2, boom: 50 }); k.ev(s, 'rocket', b.x, b.y); } } },
    beams: { wind: 0.2, dur: 1.9, start: function (s, b, k) {
      var n = b.rage ? 4 : 3, safe = Math.floor(s.rand() * 5);
      for (var i = 0, made = 0; i < 5 && made < n; i++) { if (i === safe) continue; s.beams.push({ x: b.lock + i * 192 + 46, y: 0, w: 100, h: k.GROUND_Y, warn: 0.95 + made * 0.16, on: 0.45 }); made++; }
      k.ev(s, 'aim', b.x, b.y);
    } },
    sweep: { wind: 0.5, dur: 2.2, start: function (s, b, k) { // 낮은 광선(점프) 또는 높은 광선(숙이기·땅)
      var low = s.rand() < 0.6;
      s.beams.push({ x: b.lock, y: low ? k.GROUND_Y - 34 : k.GROUND_Y - 150, w: VW, h: low ? 30 : 96, warn: 0.95, on: 0.4, level: low ? 'low' : 'high' });
      k.ev(s, 'aim', b.x, b.y);
    } },
    bombrun: { wind: 0.5, dur: 2.2, start: function (s, b) { b.n = b.x > b.lock + VW / 2 - b.w / 2 ? -1 : 1; },
      tick: function (s, b, k, dt) {
        b.x = k.clamp(b.x + b.n * 330 * dt, b.lock + 10, b.lock + VW - b.w - 10);
        if (every(b, dt, b.rage ? 0.24 : 0.32)) k.foe(s, { x: b.x + b.w / 2, y: b.y + b.h, vx: 0, vy: 60, g: 700, kind: 'bombdrop', r: 11, boom: 62 });
      } }
  };

  function step(s, b, dt, kit) {
    if (b.flash > 0) b.flash -= dt;
    b.t += dt;
    if (b.dead) { b.y += (b.move === 'hover' ? 30 : 4) * dt; return; }
    if (b.enter > 0) { b.enter -= dt; b.x += (b.homeX - b.x) * Math.min(1, dt * 3); if (b.enter <= 0) b.x = b.homeX; return; }
    if (!b.rage && b.hp < b.maxHp * 0.5) { b.rage = true; kit.ev(s, 'rage', b.x + b.w / 2, b.y); }
    if (b.st === 'idle') {
      b.dir = kit.cx(s.p) < b.x + b.w / 2 ? -1 : 1;
      if (b.move === 'hover') { b.x += Math.sin(b.t * 0.9) * 70 * dt; b.y = b.homeY + Math.sin(b.t * 1.7) * 24; b.x = kit.clamp(b.x, b.lock + 20, b.lock + VW - b.w - 20); }
      else if (b.move === 'ground' && Math.abs(kit.cx(s.p) - b.x - b.w / 2) > 260) b.x += b.dir * 60 * dt;
      b.cd -= dt * (b.rage ? 1.5 : 1);
      if (b.cd <= 0) { b.i = (b.i + 1 + (s.rand() < 0.35 ? 1 : 0)) % b.attacks.length; b.atk = b.attacks[b.i]; b.st = 'wind'; b.cd = ATT[b.atk].wind * (b.rage ? 0.8 : 1); kit.ev(s, 'boss-wind', b.x + b.w / 2, b.y, { atk: b.atk }); }
    } else if (b.st === 'wind') {
      b.cd -= dt;
      if (b.cd <= 0) { b.st = 'act'; b.at = 0; if (ATT[b.atk].start) ATT[b.atk].start(s, b, kit); }
    } else {
      b.at += dt;
      var a = ATT[b.atk];
      if (a.tick) a.tick(s, b, kit, dt);
      if (b.at >= a.dur) { if (a.end) a.end(s, b, kit); b.st = 'idle'; b.cd = Math.max(0.55, 1.15 - s.diff * 0.01); }
    }
  }
  return { BOSSES: BOSSES, ATT: ATT, create: create, step: step, hitTest: hitTest, touch: touch };
});
