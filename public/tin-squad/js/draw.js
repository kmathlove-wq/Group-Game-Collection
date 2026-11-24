// ===== draw.js =====
// 깡통 소탕대 그림. 처음에는 모두 코드로 그리고, img/manifest.js(TinSquad.IMAGES)에 그림이 있으면 그 그림으로 바꿔 그린다.
// 그림 이름: hero_idle·hero_run1~3·hero_jump·hero_crouch·hero_up·hero_hurt, mech, enemy_<종류>, boss_<종류>, pet_0~3,
//           item_coin·item_heart·item_bomb·item_<무기>, prop_crate·prop_barrel·prop_cage, tile_<세계>, bg_<세계>, title
(function (TS) {
  'use strict';
  var L = TS.Levels, G = TS.Game, T = L.TILE, VW = L.VIEW_W, VH = L.VIEW_H, TAU = Math.PI * 2;
  var D = TS.Draw = {};
  var pics = {}, fx = [], shake = 0, clock = 0, banner = null, flashScreen = 0, skinId = 'orange';

  // ----- 그림 불러오기 -----
  D.load = function (done) {
    var list = TS.IMAGES || {}, names = Object.keys(list), left = names.length;
    if (!left) return done();
    names.forEach(function (n) {
      var im = new Image();
      im.onload = function () { pics[n] = im; if (--left === 0) done(); };
      im.onerror = function () { if (--left === 0) done(); };
      im.src = 'img/' + list[n];
    });
  };
  D.pic = function (n) { return pics[n] || null; };

  // 옷 색(머플러·모자 색, 그림을 쓰면 색조를 돌린다)
  D.SKINS = {
    orange: { name: '주황 머플러', main: '#ff8a3d', suit: '#2f5d8a', price: 0, hue: 0 },
    mint: { name: '민트 머플러', main: '#2fd6a3', suit: '#5b4a8a', price: 150, hue: 120 },
    pink: { name: '분홍 머플러', main: '#ff6fa5', suit: '#3d6b5a', price: 150, hue: 300 },
    lemon: { name: '레몬 머플러', main: '#ffd84a', suit: '#8a3d4a', price: 250, hue: 30 },
    ninja: { name: '밤그림자', main: '#8c5bff', suit: '#23242f', price: 400, hue: 230 },
    gold: { name: '황금 용사', main: '#ffe27a', suit: '#b8860b', price: 900, hue: 45 }
  };
  D.setSkin = function (id) { if (D.SKINS[id]) { skinId = id; tinted = {}; } };
  var tinted = {};
  function heroPic(n) {
    var im = pics[n], hue = D.SKINS[skinId].hue;
    if (!im || !hue) return im;
    if (!tinted[n]) {
      var c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      var x = c.getContext('2d');
      try { x.filter = 'hue-rotate(' + hue + 'deg)'; } catch (e) { /* 색 바꾸기를 못 하는 브라우저 */ }
      x.drawImage(im, 0, 0); tinted[n] = c;
    }
    return tinted[n];
  }

  // ----- 세계별 색 -----
  var PAL = [
    { sky: ['#8fd3ff', '#fff1c9'], far: '#8fb7c9', near: '#c98d6b', top: '#7bbf5a', dirt: '#b07a4f', dark: '#8a5c3a' },
    { sky: ['#f2c48a', '#ffe9c4'], far: '#c79a6b', near: '#8d6a4f', top: '#c9a24a', dirt: '#8a6a4a', dark: '#6a4e36' },
    { sky: ['#1d2440', '#39456b'], far: '#2b3355', near: '#4a5680', top: '#9aa4c0', dirt: '#566083', dark: '#3c4566' },
    { sky: ['#1b1440', '#6b2f7a'], far: '#3a2260', near: '#7a3a8a', top: '#ff7ac0', dirt: '#5a3580', dark: '#40245f' },
    { sky: ['#9fd0f0', '#eaf7ff'], far: '#b5d4e8', near: '#86aecb', top: '#ffffff', dirt: '#8fb6d4', dark: '#6c97ba' },
    { sky: ['#3f8fe0', '#c9ecff'], far: '#e8f6ff', near: '#a9cfe8', top: '#f0c34a', dirt: '#7d8fa8', dark: '#5f7088' },
    { sky: ['#2a0d12', '#8a2a12'], far: '#4a1a16', near: '#6b2a1a', top: '#ff9a3d', dirt: '#4f3a3a', dark: '#362626' },
    { sky: ['#0c1022', '#1f2f55'], far: '#182444', near: '#26407a', top: '#3df0ff', dirt: '#2f3c5c', dark: '#212b45' }
  ];
  D.PAL = PAL;

  function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); c.fill(); }
  function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  function poly(c, pts) { c.beginPath(); for (var i = 0; i < pts.length; i += 2) i ? c.lineTo(pts[i], pts[i + 1]) : c.moveTo(pts[i], pts[i + 1]); c.closePath(); c.fill(); }
  function sprite(c, im, cx, by, h, flip, sx, sy, maxW) {
    var w = im.width * h / im.height;
    if (maxW && w > maxW) { h = h * maxW / w; w = maxW; }
    c.save(); c.translate(cx, by); c.scale((flip ? -1 : 1) * (sx || 1), sy || 1);
    c.drawImage(im, -w / 2, -h, w, h); c.restore();
  }
  // 하얗게 번쩍: 맞았을 때(그림을 밝게)
  function flashOn(c, on) { if (on > 0) c.filter = 'brightness(2.2)'; }

  // ----- 배경 -----
  function background(c, s) {
    var w = s.map.world, p = PAL[w], im = pics['bg_' + L.WORLDS[w].id], i, x;
    if (im) {
      var ih = 615, iw = im.width * ih / im.height; // 조금 크게 그려 그림의 바닥이 게임 땅 아래로 가게 한다
      var off = -(s.camX * 0.3) % (iw * 2);
      for (x = off; x < VW; x += iw * 2) {
        c.drawImage(im, x, 0, iw + 1, ih);
        c.save(); c.translate(x + iw * 2, 0); c.scale(-1, 1); c.drawImage(im, 0, 0, iw + 1, ih); c.restore(); // 좌우로 뒤집어 이어 붙인다
      }
      c.fillStyle = w === 4 || w === 5 || w < 2 ? 'rgba(255,255,255,.24)' : 'rgba(0,0,20,.26)'; c.fillRect(0, 0, VW, VH);
      return;
    }
    var g = c.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, p.sky[0]); g.addColorStop(1, p.sky[1]);
    c.fillStyle = g; c.fillRect(0, 0, VW, VH);
    layer(c, s, w, p.far, 0.18, 210, 1); layer(c, s, w, p.near, 0.42, 320, 2);
    c.fillStyle = w === 2 || w === 3 || w > 5 ? 'rgba(5,8,25,.28)' : 'rgba(255,255,255,.25)'; c.fillRect(0, 0, VW, VH); // 앞쪽 로봇이 잘 보이게 배경을 옅게
    if (w === 4) { c.fillStyle = 'rgba(255,255,255,.8)'; for (i = 0; i < 40; i++) circ(c, (i * 137 - s.camX * 0.5 + clock * 20 * (i % 3) + 99999) % VW, (i * 71 + clock * (40 + i % 5 * 12)) % VH, 1 + i % 3); }
    if (w === 6) { for (i = 0; i < 26; i++) { c.fillStyle = 'rgba(255,' + (120 + i * 4) + ',40,.7)'; circ(c, (i * 191 - s.camX * 0.6 + 99999) % VW, VH - (i * 83 + clock * (30 + i % 4 * 14)) % VH, 1.5 + i % 2); } }
  }
  function layer(c, s, w, col, sp, h, n) {
    c.fillStyle = col;
    var off = s.camX * sp, start = Math.floor(off / 160) - 1;
    for (var i = start; i < start + 9; i++) {
      var r = Math.abs(Math.sin(i * 12.9898 * n + w * 4.1) * 43758.5) % 1, x = i * 160 - off, H = h * (0.4 + r * 0.6), y = 450 - H * (n === 1 ? 1.1 : 0.75), k;
      if (w === 0) { c.fillRect(x, y, 130, 450); c.fillStyle = 'rgba(255,255,255,.25)'; for (k = 0; k < 6; k++) c.fillRect(x + 14 + k % 3 * 36, y + 18 + Math.floor(k / 3) * 46, 22, 26); c.fillStyle = r > 0.5 ? '#e0653a' : '#3a8ae0'; if (n === 2) poly(c, [x - 8, y + 4, x + 138, y + 4, x + 120, y - 22, x + 10, y - 22]); c.fillStyle = col; }
      else if (w === 1) { poly(c, [x - 60, 460, x + 10, y + 60, x + 60, y + 20, x + 120, y + 70, x + 210, 460]); if (n === 2) { c.fillRect(x + 60, y + 10, 8, 60); c.fillRect(x + 30, y + 10, 60, 6); } }
      else if (w === 2) { c.fillRect(x, 0, 34, 460); c.fillRect(x - 40, 60 * n, 240, 14); c.fillStyle = 'rgba(255,240,170,.5)'; c.fillRect(x + 60, 70 * n, 50, 6); c.fillStyle = col; }
      else if (w === 3) { c.save(); c.strokeStyle = col; c.lineWidth = 6; c.beginPath(); c.arc(x + 80, y + 90, 60 + r * 50, 0, TAU); c.stroke(); for (k = 0; k < 8; k++) { c.beginPath(); c.moveTo(x + 80, y + 90); c.lineTo(x + 80 + Math.cos(k * TAU / 8 + clock * 0.2) * (60 + r * 50), y + 90 + Math.sin(k * TAU / 8 + clock * 0.2) * (60 + r * 50)); c.stroke(); } c.restore(); c.fillRect(x + 72, y + 90, 16, 460); }
      else if (w === 4) { poly(c, [x - 40, 460, x + 60, y, x + 90, y + 40, x + 180, 460]); }
      else if (w === 5) { c.globalAlpha = 0.8; circ(c, x + 40, y + 40, 46 + r * 20); circ(c, x + 100, y + 50, 56); circ(c, x + 150, y + 66, 36); c.fillRect(x + 10, y + 60, 170, 40); c.globalAlpha = 1; }
      else if (w === 6) { c.fillRect(x + 10, y, 90, 460); c.fillRect(x + 30, y - 60, 24, 70); c.fillStyle = 'rgba(255,140,40,.55)'; c.fillRect(x + 24, y + 40, 60, 12); c.fillRect(x + 24, y + 80, 60, 12); c.fillStyle = col; }
      else { c.fillRect(x, y - 30, 110, 560); c.fillStyle = 'rgba(61,240,255,.35)'; for (k = 0; k < 7; k++) c.fillRect(x + 12, y + k * 34, 20 + (k * 31 + i * 17 & 63), 5); c.fillStyle = col; }
    }
  }

  // ----- 땅 -----
  function tiles(c, s) {
    var m = s.map, p = PAL[m.world], im = pics['tile_' + L.WORLDS[m.world].id], c0 = Math.max(0, Math.floor(s.camX / T)), c1 = Math.min(m.cols - 1, c0 + 22);
    for (var q0 = c0; q0 <= c1; q0++) if (!m.tiles[11 * m.cols + q0]) { // 구덩이는 깊고 어둡게
      var pg = c.createLinearGradient(0, 440, 0, VH); pg.addColorStop(0, 'rgba(8,8,20,.55)'); pg.addColorStop(0.5, 'rgba(8,8,20,.96)'); pg.addColorStop(1, 'rgba(8,8,20,1)');
      c.fillStyle = pg; c.fillRect(q0 * T, 440, T + 0.6, VH - 440);
    }
    for (var r = 3; r < m.rows; r++) for (var k = c0; k <= c1; k++) {
      var t = m.tiles[r * m.cols + k], x = k * T, y = r * T;
      if (!t) continue;
      if (t === 1) {
        var open = r > 0 && m.tiles[(r - 1) * m.cols + k] !== 1;
        if (im) { c.drawImage(im, x, y, T + 0.6, T + 0.6); if (!open) { c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(x, y, T + 0.6, T + 0.6); } }
        else {
          c.fillStyle = p.dirt; c.fillRect(x, y, T + 0.6, T + 0.6);
          c.fillStyle = p.dark; c.fillRect(x + 6 + (k * 7 + r * 3) % 14, y + 18, 12, 6); c.fillRect(x + 26 - (k * 5) % 10, y + 32, 9, 5);
          if (m.world === 2 || m.world === 5 || m.world === 7) { c.strokeStyle = p.dark; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, T - 2, T - 2); }
        }
        if (open) { c.fillStyle = p.top; c.fillRect(x, y, T + 0.6, im ? 5 : 10); c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(x, y, T + 0.6, 3); }
      } else if (t === 2) {
        c.fillStyle = p.dark; c.fillRect(x + 4, y + 12, 5, 10); c.fillRect(x + T - 9, y + 12, 5, 10);
        c.fillStyle = p.top; c.fillRect(x, y, T + 0.6, 13); c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(x, y, T + 0.6, 4); c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(x, y + 10, T + 0.6, 3);
      } else {
        c.fillStyle = m.world === 6 ? '#ffb03d' : m.world === 4 || m.world === 5 ? '#8a94b8' : '#dfe6ee';
        for (var q = 0; q < 3; q++) poly(c, [x + q * 15, y + T, x + q * 15 + 7.5, y + 16, x + q * 15 + 15, y + T]);
        c.fillStyle = 'rgba(0,0,0,.22)'; for (q = 0; q < 3; q++) poly(c, [x + q * 15 + 7.5, y + 16, x + q * 15 + 15, y + T, x + q * 15 + 7.5, y + T]);
      }
    }
  }

  // ----- 물건 -----
  function props(c, s) {
    s.props.forEach(function (p) {
      if (p.x < s.camX - 60 || p.x > s.camX + VW + 60) return;
      var cx = p.x + p.w / 2, by = p.y + p.h, im = pics['prop_' + p.kind];
      if (p.kind === 'cage') {
        pet(c, p.pet, cx, by - 4 - Math.abs(Math.sin(clock * 5 + p.x)) * 5, 30, 1);
        if (im) { c.globalAlpha = 0.8; sprite(c, im, cx, by, p.h * 1.15); c.globalAlpha = 1; c.textAlign = 'center'; label(c, '도와줘!', cx, p.y - 14 + Math.sin(clock * 6) * 3, 15, '#ffe14d'); return; }
        c.strokeStyle = '#5b6472'; c.lineWidth = 3; c.strokeRect(p.x, p.y, p.w, p.h);
        for (var i = 1; i < 5; i++) { c.beginPath(); c.moveTo(p.x + i * p.w / 5, p.y); c.lineTo(p.x + i * p.w / 5, by); c.stroke(); }
        c.fillStyle = '#3b4250'; c.fillRect(p.x - 3, p.y - 5, p.w + 6, 8); c.fillRect(p.x - 3, by - 5, p.w + 6, 6);
        c.fillStyle = '#ffe14d'; c.font = '900 16px sans-serif'; c.textAlign = 'center'; c.fillText('도와줘!', cx, p.y - 12 + Math.sin(clock * 6) * 3);
        return;
      }
      if (im) { flashOn(c, p.flash); sprite(c, im, cx, by, p.h * 1.12); c.filter = 'none'; return; }
      if (p.kind === 'crate') { c.fillStyle = p.flash > 0 ? '#fff' : '#b9803f'; c.fillRect(p.x, p.y, p.w, p.h); c.strokeStyle = '#7a4f22'; c.lineWidth = 4; c.strokeRect(p.x + 2, p.y + 2, p.w - 4, p.h - 4); c.beginPath(); c.moveTo(p.x + 4, p.y + 4); c.lineTo(p.x + p.w - 4, by - 4); c.stroke(); c.fillStyle = '#ffe14d'; c.font = '900 20px sans-serif'; c.textAlign = 'center'; c.fillText('?', cx, by - 12); }
      else { c.fillStyle = p.flash > 0 ? '#fff' : '#e0442e'; rr(c, p.x + 3, p.y, p.w - 6, p.h, 8); c.fillStyle = '#8f2417'; c.fillRect(p.x + 3, p.y + 8, p.w - 6, 4); c.fillRect(p.x + 3, by - 12, p.w - 6, 4); c.fillStyle = '#ffd84a'; poly(c, [cx - 3, p.y + 13, cx + 7, p.y + 13, cx + 1, p.y + 20, cx + 7, p.y + 20, cx - 5, p.y + 30, cx - 2, p.y + 22, cx - 7, p.y + 22]); }
    });
  }
  function pet(c, k, x, y, h, dir) {
    var im = pics['pet_' + k];
    if (im) return sprite(c, im, x, y, h * 1.2, dir < 0);
    var col = ['#f2c27a', '#8d8f99', '#ffffff', '#c98a5a'][k];
    c.save(); c.translate(x, y); c.scale(dir * h / 30, h / 30);
    c.fillStyle = col; rr(c, -12, -15, 22, 13, 6); circ(c, 9, -19, 8); c.fillRect(-9, -5, 4, 5); c.fillRect(4, -5, 4, 5);
    if (k === 1 || k === 3) { poly(c, [3, -24, 5, -32, 9, -25]); poly(c, [10, -25, 14, -32, 16, -22]); } else if (k === 2) { rr(c, 4, -38, 4, 15, 2); rr(c, 10, -38, 4, 15, 2); } else { c.fillStyle = '#a8763f'; rr(c, 1, -25, 5, 10, 3); rr(c, 13, -25, 5, 10, 3); }
    c.fillStyle = '#222'; circ(c, 11, -20, 1.6); circ(c, 16, -17, 1.6);
    c.restore();
  }
  function items(c, s) {
    s.items.forEach(function (it) {
      if (it.x < s.camX - 40 || it.x > s.camX + VW + 40) return;
      if (!it.still && it.life < 3 && Math.floor(clock * 10) % 2) return;
      var y = it.y + Math.sin(clock * 5 + it.x) * 3, im = pics['item_' + (it.kind === 'weapon' ? it.weapon : it.kind)];
      if (im) return sprite(c, im, it.x, y + 17, it.kind === 'coin' ? 26 : 36, false, it.kind === 'coin' ? Math.max(0.15, Math.abs(Math.cos(clock * 4 + it.x))) : 1);
      if (it.kind === 'coin') { var sx = Math.max(0.15, Math.abs(Math.cos(clock * 4 + it.x))); c.save(); c.translate(it.x, y); c.scale(sx, 1); c.fillStyle = '#c98a12'; circ(c, 0, 0, 11); c.fillStyle = '#ffd84a'; circ(c, 0, 0, 8.5); c.fillStyle = '#fff3b0'; c.fillRect(-2, -5, 4, 10); c.restore(); }
      else if (it.kind === 'heart') heart(c, it.x, y, 13, '#ff4d6d');
      else if (it.kind === 'bomb') { c.fillStyle = '#333a48'; circ(c, it.x, y + 3, 12); c.fillStyle = '#ffb03d'; circ(c, it.x + 7, y - 10, 4); c.fillStyle = '#fff'; circ(c, it.x - 4, y, 3); }
      else { c.fillStyle = '#23324a'; rr(c, it.x - 18, y - 16, 36, 32, 7); c.strokeStyle = WCOL[it.weapon]; c.lineWidth = 3; c.strokeRect(it.x - 15, y - 13, 30, 26); c.fillStyle = WCOL[it.weapon]; c.font = '900 17px sans-serif'; c.textAlign = 'center'; c.fillText(WLET[it.weapon], it.x, y + 6); }
    });
  }
  var WCOL = { rapid: '#ffd84a', spread: '#ff9a3d', rocket: '#ff5c5c', laser: '#4dd9ff', flame: '#ff7a2a', ball: '#7dff8a', zap: '#c79bff', screw: '#d5dbe6' };
  var WLET = { rapid: '연', spread: '부', rocket: '로', laser: '레', flame: '불', ball: '공', zap: '번' };
  D.WCOL = WCOL;
  function heart(c, x, y, r, col) {
    c.fillStyle = col; c.beginPath(); c.moveTo(x, y + r); c.bezierCurveTo(x - r * 1.9, y - r * 0.2, x - r * 0.9, y - r * 1.5, x, y - r * 0.4); c.bezierCurveTo(x + r * 0.9, y - r * 1.5, x + r * 1.9, y - r * 0.2, x, y + r); c.fill();
  }
  D.heart = heart;

  // ----- 주인공 -----
  function hero(c, s) {
    var p = s.p, cx = p.x + p.w / 2, by = p.y + p.h;
    if (p.inv > 0 && !p.dead && Math.floor(clock * 16) % 2) c.globalAlpha = 0.4;
    if (p.mech) { mech(c, cx, by, p.face, p); c.globalAlpha = 1; return; }
    var pose = p.dead ? 'hurt' : p.crouch ? 'crouch' : !p.ground ? 'jump' : p.ay < -0.9 ? 'up' : Math.abs(p.vx) > 30 ? 'run' + [1, 2, 3, 2][Math.floor(p.anim) % 4] : 'idle';
    var im = heroPic('hero_' + pose) || (pose.indexOf('run') === 0 && (heroPic('hero_run1') || heroPic('hero_idle'))) || null;
    if (im) {
      var hs = HERO_SIZE[pose], run = pose.indexOf('run') === 0, st = p.dead ? 1 : p.ground ? 1 + Math.sin(clock * 6) * 0.012 - landT * 0.9 : 1 + Math.min(0.12, Math.abs(p.vy) / 6000);
      if (p.shootPose > 0.2) st -= 0.015;
      TS.Anim.draw(c, im, 'hero_' + pose, cx, by + 2 - (run ? Math.abs(Math.sin(p.anim * Math.PI / 2)) * 4 : 0), hs[0], {
        atlas: heroPic('rig_hero_' + pose), flip: p.face < 0, anchor: hs[1], sx: 2 - st, sy: st, rot: p.dead ? -clock * 5 : run ? 0.05 : 0, t: clock, walk: run ? 1 : 0, act: p.shootPose > 0.2 ? 1 : 0,
        aim: pose === 'up' ? 0 : Math.atan2(p.ay, Math.abs(p.ax))
      });
      if (p.melee > 0) wrench(c, cx, by - 30, p);
    } else codeHero(c, cx, by, p, D.SKINS[skinId]);
    if (p.shield > 0) { c.strokeStyle = 'rgba(90,210,255,' + (0.55 + Math.sin(clock * 6) * 0.2) + ')'; c.lineWidth = 4; c.beginPath(); c.arc(cx, by - p.h / 2, 44, 0, TAU); c.stroke(); }
    c.globalAlpha = 1;
  }
  // 동작마다 [그리는 높이, 머리를 가운데로 맞추는 자리]
  var HERO_SIZE = { idle: [74, 0.46], run1: [73, 0.54], run2: [74, 0.52], run3: [73, 0.56], jump: [73, 0.55], crouch: [58, 0.53], up: [90, 0.42], hurt: [62, 0.5] };
  var landT = 0;
  function wrench(c, x, y, p) {
    var a = (1 - p.melee / 0.22) * 2 - 1.2;
    c.save(); c.translate(x + p.face * 14, y); c.scale(p.face, 1); c.rotate(a); c.fillStyle = '#cfd6e2'; c.fillRect(0, -4, 34, 8); circ(c, 36, 0, 9); c.fillStyle = '#6b7480'; c.fillRect(36, -3, 12, 6); c.restore();
    c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 5; c.beginPath(); c.arc(x, y, 46, p.face > 0 ? -1 : Math.PI - 0.8, p.face > 0 ? 0.8 : Math.PI + 1); c.stroke();
  }
  function codeHero(c, cx, by, p, sk) {
    var run = Math.abs(p.vx) > 30 && p.ground, a = p.anim * 1.6, cr = p.crouch ? 20 : 0, bob = run ? Math.abs(Math.sin(a)) * 3 : Math.sin(clock * 4) * 1;
    c.save(); c.translate(cx, by); c.scale(p.face, 1);
    if (p.dead) { c.translate(0, -20); c.rotate(-1.2); }
    c.lineCap = 'round';
    // 다리
    c.strokeStyle = sk.suit; c.lineWidth = 8;
    var l1 = run ? Math.sin(a) * 12 : p.ground ? 5 : 9, l2 = run ? -Math.sin(a) * 12 : p.ground ? -5 : -7;
    if (p.crouch) { l1 = 11; l2 = -9; }
    c.beginPath(); c.moveTo(0, -20 + cr / 2); c.lineTo(l1, p.ground ? -5 : -8); c.moveTo(0, -20 + cr / 2); c.lineTo(l2, p.ground ? -5 : -4); c.stroke();
    c.fillStyle = '#4a2f20'; rr(c, l1 - 5, p.ground ? -8 : -11, 13, 8, 3); rr(c, l2 - 5, p.ground ? -8 : -7, 13, 8, 3);
    c.translate(0, cr - bob);
    // 몸
    c.fillStyle = sk.suit; rr(c, -11, -40, 22, 24, 7); c.fillStyle = '#e8c15a'; c.fillRect(-11, -23, 22, 4);
    c.fillStyle = '#8a6a3a'; rr(c, -18, -40, 9, 20, 3); // 공구 가방
    // 머플러
    c.fillStyle = sk.main; rr(c, -10, -44, 21, 8, 4);
    c.strokeStyle = sk.main; c.lineWidth = 6; c.beginPath(); c.moveTo(-8, -40); c.quadraticCurveTo(-20, -42 + Math.sin(clock * 9) * 4, -26 - Math.abs(p.vx) * 0.03, -36 + Math.sin(clock * 8) * 6); c.stroke();
    // 머리
    c.fillStyle = '#ffd9b5'; circ(c, 1, -53, 12);
    c.fillStyle = '#5a3420'; c.beginPath(); c.arc(0, -55, 13, Math.PI * 0.95, TAU * 1.0); c.fill(); rr(c, -13, -58, 8, 14, 4);
    c.fillStyle = sk.main; rr(c, -13, -66, 25, 8, 4); // 머리띠
    c.fillStyle = '#39404e'; rr(c, -4, -65, 18, 9, 4); c.fillStyle = '#8fe3ff'; circ(c, 1, -60.5, 3.4); circ(c, 9, -60.5, 3.4); // 고글
    c.fillStyle = '#2a2a33'; circ(c, 7, -52, 2); c.fillStyle = '#ff9d8a'; circ(c, 3, -47, 2);
    // 총
    var ang = Math.atan2(p.ay, Math.abs(p.ax));
    c.save(); c.translate(3, -32); c.rotate(ang);
    c.strokeStyle = '#ffd9b5'; c.lineWidth = 6; c.beginPath(); c.moveTo(0, 0); c.lineTo(14, 2); c.stroke();
    c.fillStyle = '#4a5261'; rr(c, 8, -6, 24, 9, 3); c.fillStyle = WCOL[p.weapon] || '#d5dbe6'; c.fillRect(12, -4, 12, 4); c.fillStyle = '#333a48'; c.fillRect(12, 2, 6, 8);
    if (p.shootPose > 0.2) { c.fillStyle = '#fff3a0'; poly(c, [32, -6, 48, -1.5, 32, 4]); }
    c.restore();
    c.restore();
    if (p.melee > 0) wrench(c, cx, by - 30, p);
  }
  D.hero = codeHero;
  function mech(c, cx, by, face, p) {
    var im = pics.mech;
    if (im) { TS.Anim.draw(c, im, 'mech', cx, by + 2, 104, { atlas: pics.rig_mech, flip: face < 0, sy: 1 + Math.sin(clock * 10) * 0.015, t: p ? p.anim * 0.16 : clock, walk: p && Math.abs(p.vx) > 30 ? 1 : 0, act: p && p.shootPose > 0.2 ? 1 : 0, aim: p ? Math.atan2(p.ay, Math.abs(p.ax)) : 0 }); if (p && p.mech) mechBar(c, cx, by, p); return; }
    c.save(); c.translate(cx, by); c.scale(face, 1);
    var st = p && Math.abs(p.vx) > 30 ? Math.sin(p.anim * 1.4) * 9 : 0;
    c.fillStyle = '#59657a'; rr(c, -24 + st, -24, 18, 24, 4); rr(c, 8 - st, -24, 18, 24, 4);
    c.fillStyle = '#eef3f8'; rr(c, -34, -88, 68, 66, 12); c.fillStyle = '#c4d0dd'; c.fillRect(-34, -34, 68, 6);
    c.fillStyle = '#3aa0e8'; circ(c, 4, -54, 20); c.fillStyle = '#aee3ff'; circ(c, 4, -54, 15); c.fillStyle = '#ffd9b5'; circ(c, 4, -52, 9); c.fillStyle = '#ff8a3d'; c.fillRect(-5, -62, 18, 4); c.fillStyle = '#222'; circ(c, 8, -52, 1.8);
    c.fillStyle = '#ff6b57'; circ(c, -24, -80, 4); c.fillStyle = '#7dff8a'; circ(c, -14, -80, 4);
    c.save(); c.translate(20, -44); c.rotate(p ? Math.atan2(p.ay, Math.abs(p.ax)) : 0); c.fillStyle = '#39404e'; rr(c, 0, -8, 38, 16, 5); c.fillStyle = '#ffb03d'; c.fillRect(30, -8, 8, 16); c.restore();
    c.restore();
    if (p && p.mech) mechBar(c, cx, by, p);
  }
  function mechBar(c, cx, by, p) { c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(cx - 34, by - 112, 68, 8); c.fillStyle = '#6dffb0'; c.fillRect(cx - 33, by - 111, 66 * p.mech.hp / p.mech.max, 6); }

  // ----- 적(코드 그림) : 원점 = 발밑 가운데, 오른쪽을 봄 -----
  function eye(c, x, y, r, col) { c.fillStyle = '#20242e'; circ(c, x, y, r); c.fillStyle = col || '#ff4d4d'; circ(c, x + r * 0.2, y, r * 0.55); }
  var ART = {
    toaster: function (c, e) {
      var st = Math.sin(e.t * 9) * 5; c.fillStyle = '#4a4f5c'; c.fillRect(-12 + st, -9, 8, 9); c.fillRect(4 - st, -9, 8, 9);
      if (e.st === 'wind') { c.fillStyle = '#d99a52'; rr(c, -10, -54, 9, 16, 3); rr(c, 2, -56, 9, 16, 3); }
      c.fillStyle = '#d7dce6'; rr(c, -20, -42, 40, 34, 10); c.fillStyle = '#e8654a'; c.fillRect(-20, -22, 40, 7); c.fillStyle = '#39404e'; c.fillRect(-12, -42, 10, 4); c.fillRect(2, -42, 10, 4); eye(c, 8, -30, 6, '#ffd84a'); c.fillStyle = '#39404e'; c.fillRect(16, -30, 12, 6);
    },
    kettle: function (c, e) {
      var f = e.st === 'fuse' && Math.floor(clock * 20) % 2; c.fillStyle = '#4a4f5c'; var st = Math.sin(e.t * 16) * 7; c.fillRect(-9 + st, -7, 7, 7); c.fillRect(2 - st, -7, 7, 7);
      c.fillStyle = f ? '#ffef9a' : '#e0525a'; c.beginPath(); c.moveTo(-16, -6); c.quadraticCurveTo(-20, -36, 0, -37); c.quadraticCurveTo(20, -36, 16, -6); c.fill(); poly(c, [12, -26, 24, -33, 24, -27, 14, -16]); c.strokeStyle = '#39404e'; c.lineWidth = 4; c.beginPath(); c.arc(0, -34, 10, Math.PI, 0); c.stroke(); eye(c, 5, -20, 5, '#fff'); c.fillStyle = 'rgba(255,255,255,.6)'; circ(c, 26 + Math.sin(clock * 10) * 2, -38, 4);
    },
    fan: function (c, e) {
      c.fillStyle = '#5b6b85'; rr(c, -8, -14, 16, 14, 4); c.save(); c.translate(0, -22); c.fillStyle = 'rgba(200,225,255,.35)'; circ(c, 0, 0, 22); c.rotate(clock * 22); c.fillStyle = '#4dc3ff'; for (var i = 0; i < 3; i++) { c.rotate(TAU / 3); c.beginPath(); c.ellipse(11, 0, 11, 5, 0.4, 0, TAU); c.fill(); } c.restore(); c.strokeStyle = '#39404e'; c.lineWidth = 3; c.beginPath(); c.arc(0, -22, 22, 0, TAU); c.stroke(); eye(c, 0, -22, 6);
    },
    bulb: function (c, e) {
      c.fillStyle = 'rgba(255,235,120,.35)'; circ(c, 0, -16, 18 + Math.sin(e.t * 12) * 3); c.fillStyle = '#ffe36b'; circ(c, 0, -18, 10); c.fillStyle = '#8a93a5'; c.fillRect(-5, -9, 10, 8); eye(c, 4, -18, 3.5, '#fff'); c.fillStyle = 'rgba(255,255,255,.7)'; var w = Math.sin(clock * 40) * 6; poly(c, [-8, -18, -22, -24 - w, -18, -12]); poly(c, [8, -18, 22, -24 - w, 18, -12]);
    },
    vacuum: function (c, e) {
      c.fillStyle = '#2f3542'; c.beginPath(); c.ellipse(0, -9, 26, 12, 0, 0, TAU); c.fill(); c.fillStyle = e.st === 'wind' && Math.floor(clock * 16) % 2 ? '#ffef9a' : '#49536a'; c.beginPath(); c.ellipse(0, -13, 22, 9, 0, 0, TAU); c.fill(); c.fillStyle = e.st === 'dash' ? '#ff4d4d' : '#4dffb0'; circ(c, 8, -15, 4); c.strokeStyle = '#d7dce6'; c.lineWidth = 3; c.save(); c.translate(22, -4); c.rotate(clock * 20); c.beginPath(); c.moveTo(-8, 0); c.lineTo(8, 0); c.moveTo(0, -4); c.lineTo(0, 4); c.stroke(); c.restore();
    },
    turret: function (c, e) {
      c.fillStyle = '#39404e'; rr(c, -16, -12, 32, 12, 3); c.fillStyle = '#6b7690'; c.fillRect(-5, -24, 10, 14); c.save(); c.translate(0, -30); c.fillStyle = '#ff7ab0'; rr(c, -18, -13, 30, 24, 11); c.fillStyle = '#d94f88'; rr(c, 8, -9, 18, 16, 3); c.fillStyle = e.n > 0 ? '#ffd84a' : '#39404e'; c.fillRect(24, -7, 4, 12); eye(c, -4, -2, 6); c.restore();
    },
    cam: function (c, e) {
      c.fillStyle = '#49536a'; c.fillRect(-4, -36, 8, 36); rr(c, -14, -6, 28, 6, 2); c.fillStyle = '#e6ebf2'; rr(c, -18, -50, 36, 18, 5); c.fillStyle = '#20242e'; rr(c, 14, -46, 10, 11, 3); c.fillStyle = e.st === 'aim' ? '#ff2d2d' : '#3df08a'; circ(c, -10, -41, 3.5); eye(c, 18, -41, 5);
    },
    speaker: function (c, e) {
      var k = e.st === 'wind' ? 1.12 : 1; c.fillStyle = '#2b3040'; rr(c, -23, -52, 46, 52, 6); c.fillStyle = '#555f78'; circ(c, 0, -18, 15 * k); c.fillStyle = '#20242e'; circ(c, 0, -18, 10 * k); c.fillStyle = '#555f78'; circ(c, 0, -41, 8 * k); eye(c, 0, -41, 5, '#ffd84a'); c.fillStyle = '#8b96b0'; circ(c, 0, -18, 4);
    },
    microwave: function (c, e) {
      var st = Math.sin(e.t * 6) * 4; c.fillStyle = '#39404e'; c.fillRect(-18 + st, -9, 11, 9); c.fillRect(8 - st, -9, 11, 9); c.fillStyle = '#c9d2df'; rr(c, -27, -56, 54, 48, 6);
      c.fillStyle = e.st === 'open' ? '#ff8a3d' : '#2b3040'; rr(c, -20, -49, 32, 30, 4); if (e.st === 'open') eye(c, -4, -34, 9, '#fff3a0'); else { c.fillStyle = '#ff4d4d'; c.fillRect(-14, -38, 8, 4); c.fillRect(0, -38, 8, 4); }
      c.fillStyle = '#5b6b85'; circ(c, 19, -44, 4); circ(c, 19, -32, 4); if (e.st !== 'open') { c.fillStyle = '#8fa3bf'; rr(c, 24, -54, 9, 46, 3); c.fillStyle = '#dfe9f5'; c.fillRect(26, -50, 3, 38); }
    },
    blender: function (c, e) {
      var sq = e.st === 'air' ? 1.1 : 1; c.scale(1 / sq, sq); c.fillStyle = '#4a3f6b'; rr(c, -18, -22, 36, 22, 6); c.fillStyle = 'rgba(170,240,255,.75)'; poly(c, [-18, -58, 18, -58, 13, -22, -13, -22]); c.fillStyle = '#7dff8a'; poly(c, [-15, -40, 15, -40, 13, -22, -13, -22]); c.fillStyle = '#4a3f6b'; c.fillRect(-18, -63, 36, 6); c.strokeStyle = '#e8eef5'; c.lineWidth = 3; c.save(); c.translate(0, -26); c.scale(Math.cos(clock * 24), 1); c.beginPath(); c.moveTo(-10, -4); c.lineTo(10, 2); c.stroke(); c.restore(); eye(c, 0, -11, 6);
    },
    iron: function (c, e) {
      var j = e.st === 'shake' ? Math.sin(clock * 60) * 3 : 0; c.translate(j, 0); if (e.st === 'hang') { c.strokeStyle = 'rgba(40,40,50,.6)'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -36); c.lineTo(0, -200); c.stroke(); }
      c.fillStyle = e.st === 'fall' ? '#ff9a5a' : '#dfe4ec'; poly(c, [-22, 0, 22, 0, 22, -6, 8, -22, -22, -22]); c.fillStyle = '#5a7ad9'; poly(c, [-20, -8, 18, -8, 8, -22, -20, -22]); c.strokeStyle = '#39404e'; c.lineWidth = 6; c.beginPath(); c.moveTo(-16, -22); c.quadraticCurveTo(-14, -36, 2, -34); c.stroke(); eye(c, 2, -14, 5);
    },
    fridge: function (c, e) {
      var st = Math.sin(e.t * 4) * 4; c.fillStyle = '#39404e'; c.fillRect(-28 + st, -12, 20, 12); c.fillRect(8 - st, -12, 20, 12); c.fillStyle = '#e9f3fb'; rr(c, -35, -96, 70, 86, 8); c.fillStyle = '#b8cfe2'; c.fillRect(-35, -60, 70, 4); c.fillStyle = '#7d8fa5'; c.fillRect(24, -88, 5, 20); c.fillRect(24, -52, 5, 26); eye(c, -10, -78, 7, '#4dc3ff'); eye(c, 10, -78, 7, '#4dc3ff'); c.fillStyle = '#2b3040'; c.fillRect(-14, -50, 28, 6); c.fillStyle = '#bfe8ff'; poly(c, [-30, -10, -24, 4, -18, -10]); poly(c, [16, -10, 22, 4, 28, -10]);
    }
  };
  // 그림 적의 움직임: 실제로 움직인 거리로 걷는 정도를 재고, 상태마다 몸을 늘이고 기울인다
  var look = typeof WeakMap === 'function' ? new WeakMap() : null;
  function seen(e, x) {
    var v = look.get(e);
    if (!v) { v = { x: x, at: clock, walk: 0, act: 0, cd: e.cd }; look.set(e, v); }
    var dt = clock - v.at;
    if (dt > 0) { v.walk += ((Math.abs(x - v.x) / dt > 12 ? 1 : 0) - v.walk) * Math.min(1, dt * 10); v.x = x; v.at = clock; v.act = Math.max(0, v.act - dt * 5); }
    return v;
  }
  var BIG = { toaster: 1.3, kettle: 1.4, fan: 1.25, bulb: 1.6, vacuum: 1.35, turret: 1.2, cam: 1.15, speaker: 1.15, microwave: 1.2, blender: 1.2, iron: 1.5, fridge: 1.15 };
  function enemyPic(c, s, e, im, cx, by) {
    var v = seen(e, cx), sx = 1, sy = 1, rot = 0, jig = 0, act = 0, aim = 0, up = 0, over = null;
    if (e.cd > v.cd + 0.05) v.act = 1; // 방금 쏨
    v.cd = e.cd;
    act = v.act;
    var px = s.p.x + s.p.w / 2, py = s.p.y + s.p.h / 2;
    switch (e.type) {
      case 'toaster':
        if (e.st === 'wind') { sy = 0.9; sx = 1.07; jig = Math.sin(clock * 50) * 1.5; } else { sy = 1 + act * 0.12; up = Math.abs(Math.sin(e.t * 11)) * 3 * v.walk; }
        break;
      case 'kettle':
        if (e.st === 'fuse') { sx = sy = 1.06 + Math.sin(clock * 40) * 0.06; jig = Math.sin(clock * 60) * 2; } else { rot = 0.1 * v.walk; up = Math.abs(Math.sin(e.t * 11)) * 5 * v.walk; }
        break;
      case 'fan': rot = Math.max(-0.3, Math.min(0.3, e.vx * e.dir * 0.003)) + Math.sin(e.t * 3) * 0.05; break;
      case 'bulb':
        rot = Math.sin(e.t * 5) * 0.12;
        over = function (g, W, H) { g.strokeStyle = '#341e2c'; g.lineWidth = W * 0.022; g.lineCap = 'round'; g.beginPath(); g.moveTo(W * 0.63, H * 0.2); g.quadraticCurveTo(W * 0.6, H * 0.06, W * 0.53, H * 0.05); g.moveTo(W * 0.74, H * 0.2); g.quadraticCurveTo(W * 0.78, H * 0.06, W * 0.86, H * 0.05); g.stroke(); var r = W * (0.3 + Math.sin(e.t * 12) * 0.04), q = g.createRadialGradient(W * 0.68, H * 0.35, 4, W * 0.68, H * 0.35, r); q.addColorStop(0, 'rgba(255,244,150,.6)'); q.addColorStop(1, 'rgba(255,220,80,0)'); g.fillStyle = q; g.beginPath(); g.arc(W * 0.68, H * 0.35, r, 0, TAU); g.fill(); };
        break;
      case 'vacuum':
        if (e.st === 'wind') { rot = -0.16; jig = Math.sin(clock * 60) * 2; } else if (e.st === 'dash') { rot = 0.06; sx = 1.12; sy = 0.92; } else rot = Math.sin(e.t * 8) * 0.02;
        break;
      case 'turret': aim = Math.max(-1.1, Math.min(0.5, Math.atan2(py - e.y - 14, Math.abs(px - cx)))); break;
      case 'cam': aim = e.st === 'aim' ? Math.max(-1.2, Math.min(0.6, Math.atan2(Math.sin(e.aim), Math.abs(Math.cos(e.aim))))) : Math.sin(e.t * 1.6) * 0.18; break;
      case 'speaker': sy = e.st === 'wind' ? 0.92 + Math.sin(clock * 40) * 0.04 : 1 + act * 0.1 + Math.sin(e.t * 6) * 0.015; sx = 2 - sy; break;
      case 'microwave':
        act = e.st === 'open' ? Math.max(0, Math.min(1, (1.15 - e.n) * 8, e.n * 8)) : 0; up = Math.abs(Math.sin(e.t * 11)) * 2 * v.walk;
        if (act > 0) over = function (g, W, H) { g.globalAlpha = act * (0.65 + Math.sin(clock * 30) * 0.2); g.fillStyle = '#ffb03d'; g.fillRect(W * 0.255, H * 0.12, W * 0.28, H * 0.44); g.globalAlpha = 1; };
        break;
      case 'blender':
        if (e.st === 'air') { sy = 1.1; rot = e.vx * e.dir * 0.0006; } else { sy = 1 - Math.max(0, e.cd - 0.85) * 0.5; jig = Math.sin(e.t * 34) * 0.7; }
        sx = 2 - sy;
        break;
      case 'iron':
        jig = e.st === 'shake' ? Math.sin(clock * 60) * 3 : 0; rot = e.st === 'hang' || e.st === 'rise' ? Math.sin(e.t * 2) * 0.12 : 0; sy = e.st === 'fall' ? 1.14 : e.st === 'wait' ? 0.9 : 1;
        if (e.st === 'hang' || e.st === 'rise') { c.strokeStyle = 'rgba(40,40,50,.6)'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, e.y - 10); c.lineTo(cx, -20); c.stroke(); }
        break;
      case 'fridge': up = Math.abs(Math.sin(e.t * 11)) * 2 * v.walk; sy = 1 + Math.sin(e.t * 3) * 0.012 + act * 0.06; rot = -act * 0.06; break;
    }
    TS.Anim.draw(c, im, 'enemy_' + e.type, cx + jig, by + 2 - up, e.h * BIG[e.type], { atlas: pics['rig_enemy_' + e.type], flip: e.dir < 0, maxW: e.w * 1.75, sx: sx, sy: sy, rot: rot, t: e.t, walk: v.walk, act: act, aim: aim, over: over, e: e });
  }
  D.enemyArt = ART;
  function enemies(c, s) {
    s.enemies.forEach(function (e) {
      if (!e.on && (e.x > s.camX + VW + 80 || e.x < s.camX - 120)) return;
      var cx = e.x + e.w / 2, by = e.y + e.h, im = pics['enemy_' + e.type];
      if (e.type === 'cam' && e.st === 'aim') { c.strokeStyle = e.cd < 0.3 ? 'rgba(255,40,40,.95)' : 'rgba(255,40,40,.45)'; c.lineWidth = e.cd < 0.3 ? 3 : 1.5; c.beginPath(); c.moveTo(cx, e.y + 12); c.lineTo(cx + Math.cos(e.aim) * 1200, e.y + 12 + Math.sin(e.aim) * 1200); c.stroke(); }
      if (!e.fly) { c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.ellipse(cx, by, e.w * 0.5, 4, 0, 0, TAU); c.fill(); }
      c.save();
      flashOn(c, e.flash);
      if (im) {
        enemyPic(c, s, e, im, cx, by);
      } else { c.translate(cx, by); c.scale(e.dir, 1); ART[e.type](c, e); }
      c.restore();
      if (e.st === 'fuse') { c.fillStyle = '#ff3030'; c.font = '900 22px sans-serif'; c.textAlign = 'center'; c.fillText('!', cx, e.y - 8); }
      if (e.maxHp > 60 && e.hp < e.maxHp) { c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(e.x, e.y - 12, e.w, 5); c.fillStyle = '#ff5c5c'; c.fillRect(e.x, e.y - 12, e.w * e.hp / e.maxHp, 5); }
    });
  }

  // ----- 보스(코드 그림) : 원점 = 왼쪽 위, 왼쪽을 봄 -----
  var BART = {
    toastking: function (c, b) { c.fillStyle = '#d99a52'; var up = b.st !== 'idle' ? 26 : 8; rr(c, 30, -up, 34, 50, 8); rr(c, 84, -up - 6, 34, 50, 8); c.fillStyle = '#c9d0dc'; rr(c, 0, 10, 150, 124, 28); c.fillStyle = '#e8654a'; c.fillRect(0, 76, 150, 16); c.fillStyle = '#ffd84a'; poly(c, [36, 14, 46, -16, 62, 6, 75, -22, 90, 6, 106, -16, 114, 14]); eye(c, 42, 50, 17, '#ffd84a'); eye(c, 92, 50, 17, '#ffd84a'); c.fillStyle = '#2b3040'; rr(c, 30, 102, 80, 14, 6); c.fillRect(14, 132, 34, 18); c.fillRect(102, 132, 34, 18); },
    dustking: function (c, b) { c.fillStyle = '#5a3f7a'; rr(c, 24, 10, 140, 96, 40); c.fillStyle = '#7d5aa8'; rr(c, 60, 0, 96, 60, 26); c.fillStyle = '#2b3040'; circ(c, 60, 108, 22); circ(c, 136, 108, 22); c.fillStyle = '#8b96b0'; circ(c, 60, 108, 9); circ(c, 136, 108, 9); c.fillStyle = '#39404e'; poly(c, [40, 60, 0, 78, -14, 130, 30, 130]); c.fillStyle = '#ff4d4d'; for (var i = 0; i < 5; i++) poly(c, [-10 + i * 8, 130, -6 + i * 8, 116, -2 + i * 8, 130]); eye(c, 74, 38, 15); eye(c, 112, 38, 15); },
    train: function (c, b) { c.fillStyle = '#2f7d5a'; rr(c, 0, 6, 240, 122, 22); c.fillStyle = '#f0c34a'; c.fillRect(0, 84, 240, 14); c.fillStyle = '#bfe8ff'; rr(c, 16, 24, 60, 44, 8); rr(c, 96, 24, 54, 44, 8); rr(c, 164, 24, 54, 44, 8); eye(c, 34, 46, 13); eye(c, 60, 46, 13); c.fillStyle = '#2b3040'; for (var i = 0; i < 4; i++) circ(c, 36 + i * 56, 132, 18); c.fillStyle = '#fff3a0'; circ(c, 12, 108, 10); c.fillStyle = '#d7dce6'; poly(c, [0, 100, -22, 142, 20, 142]); },
    clown: function (c, b) { c.save(); c.translate(70, 70); c.fillStyle = 'rgba(255,255,255,.25)'; circ(c, 0, 0, 74); c.rotate(clock * (b.st === 'act' ? 18 : 6)); ['#ff5c8a', '#ffd84a', '#4dc3ff', '#7dff8a', '#c79bff'].forEach(function (col) { c.rotate(TAU / 5); c.fillStyle = col; c.beginPath(); c.ellipse(38, 0, 36, 15, 0.4, 0, TAU); c.fill(); }); c.restore(); c.fillStyle = '#fff'; circ(c, 70, 70, 34); eye(c, 56, 62, 9, '#4dc3ff'); eye(c, 82, 62, 9, '#4dc3ff'); c.fillStyle = '#ff3d3d'; circ(c, 68, 76, 9); c.strokeStyle = '#ff3d6a'; c.lineWidth = 5; c.beginPath(); c.arc(70, 78, 18, 0.3, Math.PI - 0.3); c.stroke(); c.fillStyle = '#7a3a8a'; rr(c, 54, 104, 32, 46, 8); },
    queen: function (c, b) { c.fillStyle = '#e9f3fb'; rr(c, 6, 20, 138, 150, 16); c.fillStyle = '#b8cfe2'; c.fillRect(6, 92, 138, 6); c.fillStyle = '#7dd3ff'; poly(c, [20, 24, 30, -18, 52, 14, 75, -28, 98, 14, 120, -18, 130, 24]); eye(c, 48, 58, 14, '#4dc3ff'); eye(c, 98, 58, 14, '#4dc3ff'); c.fillStyle = '#5a9fd0'; poly(c, [40, 112, 110, 112, 96, 130, 54, 130]); c.fillStyle = '#bfe8ff'; for (var i = 0; i < 6; i++) poly(c, [8 + i * 23, 168, 20 + i * 23, 192, 30 + i * 23, 168]); c.fillStyle = '#7d8fa5'; c.fillRect(126, 40, 7, 34); c.fillRect(126, 108, 7, 40); },
    airship: function (c, b) { c.fillStyle = '#c94f3a'; c.beginPath(); c.ellipse(125, 48, 125, 48, 0, 0, TAU); c.fill(); c.fillStyle = '#e8b04a'; c.beginPath(); c.ellipse(125, 48, 125, 16, 0, 0, TAU); c.fill(); c.fillStyle = '#39404e'; rr(c, 70, 88, 110, 30, 10); eye(c, 40, 42, 13); eye(c, 80, 38, 13); c.save(); c.translate(246, 48); c.scale(0.35, 1); c.rotate(clock * 26); c.fillStyle = '#4dc3ff'; for (var i = 0; i < 3; i++) { c.rotate(TAU / 3); c.beginPath(); c.ellipse(24, 0, 26, 10, 0, 0, TAU); c.fill(); } c.restore(); c.fillStyle = '#ffd84a'; for (i = 0; i < 4; i++) c.fillRect(80 + i * 24, 98, 14, 10); },
    dragon: function (c, b) { c.fillStyle = '#4f3a3a'; rr(c, 60, 60, 150, 130, 18); c.fillStyle = '#ff8a2a'; rr(c, 90, 96, 92, 66, 10); c.fillStyle = '#ffe36b'; rr(c, 104, 116, 64, 40, 8); c.fillStyle = '#7a2f22'; rr(c, 0, 10, 112, 64, 18); poly(c, [80, 14, 98, -22, 110, 20]); poly(c, [52, 12, 64, -16, 80, 14]); c.fillStyle = b.st !== 'idle' ? '#ffe36b' : '#39404e'; rr(c, -6, 48, 64, 18, 6); c.fillStyle = '#fff'; for (var i = 0; i < 4; i++) poly(c, [4 + i * 13, 48, 10 + i * 13, 60, 16 + i * 13, 48]); eye(c, 54, 32, 12, '#ffe36b'); },
    overlord: function (c, b) { var k = 1 + Math.sin(clock * 10) * 0.04; c.fillStyle = '#12182c'; rr(c, 15, 0, 160, 200, 20); c.strokeStyle = b.rage ? '#ff3d6a' : '#3df0ff'; c.lineWidth = 5; c.strokeRect(22, 8, 146, 184); c.fillStyle = '#2f3c5c'; circ(c, 95, 138, 46 * k); c.fillStyle = '#0c1022'; circ(c, 95, 138, 32 * k); c.fillStyle = b.rage ? '#ff3d6a' : '#3df0ff'; circ(c, 95, 138, 12 * k); eye(c, 62, 56, 22, b.rage ? '#ff3d6a' : '#3df0ff'); eye(c, 128, 56, 22, b.rage ? '#ff3d6a' : '#3df0ff'); c.fillStyle = '#26407a'; rr(c, -16, 60, 30, 90, 8); rr(c, 176, 60, 30, 90, 8); }
  };
  D.bossArt = BART;
  // 보스 그림 위에 덧그리는 움직임: 프로펠러, 오븐 불빛, 전조등, 소리 물결
  function pinwheel(g, x, y, r, a, cols) {
    g.save(); g.translate(x, y); g.rotate(a); g.strokeStyle = '#2a1030'; g.lineWidth = Math.max(2.5, r * 0.04); g.lineJoin = 'round';
    for (var i = 0; i < cols.length; i++) { g.rotate(TAU / cols.length); g.fillStyle = cols[i]; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(r * 0.75, -r * 0.5, r, r * 0.12); g.quadraticCurveTo(r * 0.55, r * 0.5, 0, 0); g.fill(); g.stroke(); }
    g.fillStyle = '#ffb03d'; g.beginPath(); g.arc(0, 0, r * 0.15, 0, TAU); g.fill(); g.stroke(); g.restore();
  }
  var bossOver = {
    clown: function (g, W, H, b) {
      pinwheel(g, W * 0.642, H * 0.862, W * 0.12, -b.t * 13, ['#ff9a2f', '#8c4dff', '#33b1ff', '#ff4d4d', '#ffd23d']);
      pinwheel(g, W * 0.7, H * 0.435, W * 0.165, b.t * 6, ['#ff4d4d', '#ff9a2f', '#33b1ff', '#8c4dff', '#1f7fe0', '#7ed957', '#ffd23d', '#57c93c']); },
    airship: function (g, W, H, b) {
      g.save(); g.translate(W * 0.205, H * 0.475); g.fillStyle = 'rgba(235,240,250,.4)'; g.beginPath(); g.ellipse(0, 0, W * 0.21, H * 0.45, 0, 0, TAU); g.fill();
      g.scale(0.62, 1); g.rotate(b.t * 24); g.fillStyle = '#aeb6c4'; g.strokeStyle = '#2a1030'; g.lineWidth = 4;
      for (var i = 0; i < 4; i++) { g.rotate(TAU / 4); g.beginPath(); g.moveTo(8, -8); g.lineTo(H * 0.43, -H * 0.06); g.lineTo(H * 0.43, H * 0.06); g.lineTo(8, 8); g.closePath(); g.fill(); g.stroke(); }
      g.fillStyle = '#7d8796'; g.beginPath(); g.arc(0, 0, 22, 0, TAU); g.fill(); g.stroke(); g.restore();
    },
    dragon: function (g, W, H, b, act) {
      var r = W * (0.15 + Math.sin(b.t * 17) * 0.012 + act * 0.03), q = g.createRadialGradient(W * 0.6, H * 0.6, 4, W * 0.6, H * 0.6, r);
      q.addColorStop(0, 'rgba(255,240,140,' + (0.4 + Math.sin(b.t * 23) * 0.15) + ')'); q.addColorStop(1, 'rgba(255,120,20,0)'); g.fillStyle = q; g.beginPath(); g.arc(W * 0.6, H * 0.6, r, 0, TAU); g.fill();
      for (var i = 0; i < 4; i++) { var k = (b.t * 0.7 + i / 4) % 1; g.fillStyle = 'rgba(90,70,70,' + 0.5 * (1 - k) + ')'; g.beginPath(); g.arc(W * (i % 2 ? 0.66 : 0.51) + Math.sin(k * 6 + i) * 8, H * 0.1 - k * 60, 6 + k * 16, 0, TAU); g.fill(); }
    },
    train: function (g, W, H, b) {
      [[0.095, 0.625], [0.265, 0.625]].forEach(function (p) { var q = g.createRadialGradient(W * p[0], H * p[1], 2, W * p[0], H * p[1], 34); q.addColorStop(0, 'rgba(255,250,190,' + (0.7 + Math.sin(b.t * 20) * 0.3) + ')'); q.addColorStop(1, 'rgba(255,250,190,0)'); g.fillStyle = q; g.beginPath(); g.arc(W * p[0], H * p[1], 34, 0, TAU); g.fill(); });
    },
    overlord: function (g, W, H, b, act) {
      for (var i = 0; i < 3; i++) { var k = (b.t * 1.2 + i / 3) % 1; g.strokeStyle = (b.rage ? 'rgba(255,61,106,' : 'rgba(61,240,255,') + (1 - k) * (0.4 + act * 0.5) + ')'; g.lineWidth = 5; g.beginPath(); g.arc(W * 0.475, H * 0.365, W * (0.12 + k * 0.2), 0, TAU); g.stroke(); }
    }
  };
  function boss(c, s) {
    var b = s.boss;
    if (!b) return;
    c.save();
    var j = b.st === 'wind' ? Math.sin(clock * 50) * 4 : b.dead ? Math.sin(clock * 60) * 6 : 0;
    c.translate(b.x + j, b.y + Math.sin(b.t * 3) * 3);
    flashOn(c, b.flash);
    if (b.dead) c.globalAlpha = Math.max(0, 1 - b.deadT / 2.4);
    var im = pics['boss_' + b.kind], flip = b.dir > 0;
    if (im) {
      var k = Math.max(b.w * 1.15 / im.width, b.h * 1.15 / im.height), v = seen(b, b.x), act = b.st === 'act' ? Math.min(1, b.at * 4) : b.st === 'wind' ? -0.35 : 0, sx = 1, sy = 1 + Math.sin(b.t * 2.6) * 0.015, rot = 0;
      v.pose = (v.pose || 0) + (act - (v.pose || 0)) * 0.2;
      if (b.st === 'wind') { sy -= 0.06; sx += 0.05; }
      if (b.kind === 'train') sy += Math.abs(Math.sin(b.t * 22)) * 0.012 * (0.3 + v.walk); // 덜컹덜컹
      if (b.st === 'act' && b.atk === 'charge') { rot = -0.05; sx = 1.05; sy *= 0.96; }
      if (b.st === 'act' && b.atk === 'jump') { sy = 1 + Math.min(0.12, Math.abs(b.vy) / 5000); sx = 2 - sy; }
      if (b.move === 'hover') rot += Math.sin(b.t * 1.3) * 0.03;
      if (b.dead) rot = Math.sin(clock * 30) * 0.04 + b.deadT * 0.06;
      var ov = bossOver[b.kind], pose = v.pose;
      TS.Anim.draw(c, im, 'boss_' + b.kind, b.w / 2, b.h + 2, im.height * k, { atlas: pics['rig_boss_' + b.kind], flip: flip, sx: sx, sy: sy, rot: rot, t: b.t * (b.rage ? 1.35 : 1), walk: v.walk, act: pose, aim: 0, over: ov && function (g, W, H) { ov(g, W, H, b, Math.max(0, pose)); }, e: b });
    }
    else { if (flip) { c.translate(b.w, 0); c.scale(-1, 1); } BART[b.kind](c, b); }
    c.restore();
    if (b.rage && !b.dead) { c.fillStyle = 'rgba(255,60,40,.25)'; for (var i = 0; i < 3; i++) circ(c, b.x + b.w * (0.2 + i * 0.3), b.y - 8 - (clock * 60 + i * 20) % 40, 8 - (clock * 60 + i * 20) % 40 / 6); }
  }

  // ----- 총알 -----
  function shots(c, s) {
    s.shots.forEach(function (b) {
      var a = Math.atan2(b.vy, b.vx);
      c.save(); c.translate(b.x, b.y); c.rotate(a);
      if (b.kind === 'laser') { c.fillStyle = 'rgba(77,217,255,.4)'; c.fillRect(-34, -5, 60, 10); c.fillStyle = '#eaffff'; c.fillRect(-34, -2, 60, 4); }
      else if (b.kind === 'flame') { var k = 1 - b.life / 0.5; c.fillStyle = 'rgba(255,' + Math.round(210 - k * 150) + ',60,' + (0.9 - k * 0.6) + ')'; circ(c, 0, 0, 7 + k * 16); }
      else if (b.kind === 'rocket') { c.fillStyle = '#ffb03d'; poly(c, [-12, -5, -26 - Math.random() * 8, 0, -12, 5]); c.fillStyle = '#e6ebf2'; rr(c, -12, -5, 22, 10, 4); c.fillStyle = '#ff5c5c'; poly(c, [8, -6, 18, 0, 8, 6]); }
      else if (b.kind === 'ball') { c.fillStyle = '#4dd96a'; circ(c, 0, 0, 10); c.fillStyle = '#c9ffd2'; circ(c, -3, -3, 3); }
      else if (b.kind === 'zap') { c.strokeStyle = '#e8d6ff'; c.lineWidth = 4; c.beginPath(); c.moveTo(-18, 0); c.lineTo(-8, -6); c.lineTo(0, 5); c.lineTo(12, 0); c.stroke(); }
      else if (b.kind === 'screw') { c.fillStyle = '#eef2f8'; c.fillRect(-9, -3, 15, 6); c.fillStyle = '#8b96b0'; c.fillRect(-10, -5, 4, 10); c.fillStyle = '#ffe14d'; poly(c, [6, -3, 13, 0, 6, 3]); }
      else { c.fillStyle = b.kind === 'spread' ? '#ffb05a' : '#ffe14d'; rr(c, -11, -3, 20, 6, 3); c.fillStyle = '#fff'; c.fillRect(0, -1.5, 8, 3); }
      c.restore();
    });
    s.bombs.forEach(function (b) { if (b.kind !== 'bomb') return; c.fillStyle = '#333a48'; circ(c, b.x, b.y, 9); c.fillStyle = Math.floor(clock * 12) % 2 ? '#ff5c3d' : '#ffe14d'; circ(c, b.x + 5, b.y - 8, 3.5); });
  }
  var FCOL = { toast: '#e0a050', bolt: '#ff5c5c', wind: '#a0e8ff', micro: '#ffb03d', ice: '#9fe0ff', note: '#d08bff', dust: '#b49bd0', fire: '#ff8a2a', snipe: '#ff2d2d', rock: '#9a8a7a', missile: '#ff5c5c', bombdrop: '#39404e' };
  function foes(c, s) {
    s.foes.forEach(function (f) {
      if (f.warn > 0) { c.fillStyle = 'rgba(255,60,60,' + (0.25 + Math.sin(clock * 20) * 0.15) + ')'; c.fillRect(f.x - 12, 0, 24, 450); c.fillStyle = '#ff3d3d'; c.font = '900 22px sans-serif'; c.textAlign = 'center'; c.fillText('▼', f.x, 28); return; }
      if (f.wave) { c.fillStyle = 'rgba(255,225,77,.9)'; c.beginPath(); c.arc(f.x, 452, 18, Math.PI, 0); c.fill(); c.fillStyle = '#ff8a3d'; c.beginPath(); c.arc(f.x, 452, 11, Math.PI, 0); c.fill(); return; }
      c.save(); c.translate(f.x, f.y);
      if (f.kind === 'toast') { c.rotate(clock * 10); c.fillStyle = '#8a5a24'; rr(c, -10, -10, 20, 20, 5); c.fillStyle = '#f2c27a'; rr(c, -7, -7, 14, 14, 4); }
      else if (f.kind === 'missile') { c.rotate(Math.atan2(f.vy, f.vx)); c.fillStyle = '#ffb03d'; poly(c, [-10, -4, -24, 0, -10, 4]); c.fillStyle = '#b33a3a'; rr(c, -12, -6, 24, 12, 5); c.fillStyle = '#fff'; circ(c, 6, 0, 3); }
      else if (f.kind === 'snipe') { c.rotate(Math.atan2(f.vy, f.vx)); c.fillStyle = '#ff2d2d'; c.fillRect(-26, -3, 34, 6); c.fillStyle = '#fff'; c.fillRect(-10, -1, 18, 2); }
      else if (f.kind === 'ice') { c.rotate(clock * 5); c.fillStyle = '#e8f8ff'; poly(c, [0, -13, 9, -3, 6, 10, -6, 10, -9, -3]); c.fillStyle = '#7dc8f0'; poly(c, [0, -13, 0, 10, -6, 10, -9, -3]); }
      else if (f.kind === 'note') { c.fillStyle = '#d08bff'; c.beginPath(); c.ellipse(-3, 6, 8, 6, -0.3, 0, TAU); c.fill(); c.fillRect(3, -14, 4, 20); c.fillRect(3, -14, 11, 5); }
      else { var col = FCOL[f.kind] || '#ff5c5c'; c.fillStyle = 'rgba(255,255,255,.85)'; circ(c, 0, 0, f.r + 2.5); c.fillStyle = col; circ(c, 0, 0, f.r); c.fillStyle = 'rgba(255,255,255,.8)'; circ(c, -f.r * 0.3, -f.r * 0.3, f.r * 0.3); }
      c.restore();
    });
    s.beams.forEach(function (b) {
      if (b.warn > 0) { c.fillStyle = 'rgba(255,50,50,' + (0.18 + Math.sin(clock * 24) * 0.1) + ')'; c.fillRect(b.x, b.y, b.w, b.h); c.strokeStyle = 'rgba(255,60,60,.8)'; c.lineWidth = 2; c.setLineDash([10, 8]); c.strokeRect(b.x, b.y, b.w, b.h); c.setLineDash([]); if (b.level) { c.fillStyle = '#fff'; c.font = '900 26px sans-serif'; c.textAlign = 'center'; c.fillText(b.level === 'low' ? '점프!' : '숙여!', b.x + b.w / 2, b.level === 'low' ? b.y - 14 : b.y + 60); } }
      else { c.fillStyle = 'rgba(255,120,60,.75)'; c.fillRect(b.x, b.y, b.w, b.h); c.fillStyle = 'rgba(255,255,230,.9)'; if (b.w > b.h) c.fillRect(b.x, b.y + b.h * 0.3, b.w, b.h * 0.4); else c.fillRect(b.x + b.w * 0.25, b.y, b.w * 0.5, b.h); }
    });
  }

  // ----- 반짝이 -----
  function part(o) { if (fx.length < 420) fx.push(o); }
  function burst(x, y, n, cols, sp, life, g) { for (var i = 0; i < n; i++) { var a = Math.random() * TAU, v = sp * (0.3 + Math.random() * 0.7); part({ k: 'p', x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - sp * 0.3, r: 2 + Math.random() * 4, c: cols[i % cols.length], t: 0, life: life * (0.6 + Math.random() * 0.6), g: g == null ? 900 : g }); } }
  function text(x, y, str, col, size) { part({ k: 't', x: x, y: y, vx: 0, vy: -46, s: str, c: col, z: size || 16, t: 0, life: 0.9, g: 0 }); }
  D.shake = function (n) { shake = Math.min(16, Math.max(shake, n)); };
  D.banner = function (str, sub, t, col) { banner = { s: str, sub: sub || '', t: 0, life: t || 1.8, c: col || '#fff' }; };
  D.event = function (e, s) {
    switch (e.t) {
      case 'score': if (e.n >= 100) text(e.x, e.y - 6, '+' + e.n, '#fff3a0', 15); break;
      case 'shot': part({ k: 'f', x: e.x, y: e.y, vx: 0, vy: 0, r: e.kind === 'rocket' ? 13 : 8, c: '#fff3a0', t: 0, life: 0.05, g: 0 }); break;
      case 'hit': burst(e.x, e.y, 4, ['#ffe14d', '#fff'], 170, 0.22); break;
      case 'spark': burst(e.x, e.y, 3, ['#cfd6e2', '#8b96b0'], 130, 0.2); break;
      case 'clank': burst(e.x, e.y, 5, ['#fff', '#9fd0ff'], 200, 0.25); text(e.x, e.y - 20, '튕!', '#cfe8ff', 15); break;
      case 'melee': burst(e.x, e.y, 9, ['#fff', '#ffe14d'], 260, 0.3); text(e.x, e.y - 30, '쾅!', '#ffb03d', 22); D.shake(3); break;
      case 'kill': part({ k: 'dead', x: e.x, y: e.y, vx: (Math.random() - 0.5) * 260 + (s.p.x < e.x ? 130 : -130), vy: -330, n: e.kind, h: e.h, t: 0, life: 0.75, g: 1300, r: (Math.random() - 0.5) * 16 }); burst(e.x, e.y, 14, ['#8b96b0', '#cfd6e2', '#ffb03d', '#39404e'], 330, 0.7); part({ k: 'r', x: e.x, y: e.y, vx: 0, vy: 0, r: e.w, c: '#ffe9b0', t: 0, life: 0.22, g: 0 }); D.shake(e.kind === 'fridge' ? 9 : 2.5); break;
      case 'boom': burst(e.x, e.y, 16, ['#ffe14d', '#ff8a3d', '#ff4d2d', '#5a4a44'], e.r * 4, 0.55, 300); part({ k: 'r', x: e.x, y: e.y, vx: 0, vy: 0, r: e.r, c: '#ffd27a', t: 0, life: 0.3, g: 0 }); D.shake(Math.min(11, e.r / 10)); break;
      case 'coin': burst(e.x, e.y, 4, ['#ffe14d', '#fff3b0'], 120, 0.3, 200); break;
      case 'heal': text(s.p.x + 14, s.p.y - 12, '+♥', '#ff6f8a', 20); break;
      case 'power': text(e.x, e.y - 26, e.text, '#7dffb0', 20); break;
      case 'pet': text(e.x, e.y - 30, '구출! ' + e.n + '/' + s.petsTotal, '#ffe14d', 22); burst(e.x, e.y, 16, ['#ff7ab0', '#ffe14d', '#7dffb0'], 260, 0.8, 300); part({ k: 'pet', x: e.x, y: e.y + 20, vx: -210, vy: -260, p: e.pet, t: 0, life: 2.4, g: 700 }); break;
      case 'combo': D.banner(e.n + ' 콤보!', e.n >= 30 ? '고철 폭풍!!' : '', 1, '#ffe14d'); break;
      case 'zap': part({ k: 'z', x: e.x, y: e.y, x2: e.x2, y2: e.y2, vx: 0, vy: 0, t: 0, life: 0.16, g: 0 }); break;
      case 'hurt': flashScreen = 0.3; D.shake(9); burst(e.x, e.y, 10, ['#ff4d6d', '#fff'], 240, 0.4); break;
      case 'mech-hurt': D.shake(6); burst(e.x, e.y, 8, ['#cfd6e2', '#ffb03d'], 240, 0.4); break;
      case 'shield': text(e.x, e.y - 40, '막았다!', '#8fe3ff', 20); D.shake(4); break;
      case 'dead': D.shake(12); break;
      case 'mech': D.banner('로봇 탑승!', '총 = 기관총, 폭탄 = 대포', 1.8, '#7dffb0'); break;
      case 'jump': case 'land': if (e.t === 'land') landT = 0.2; burst(e.x, e.y, 5, ['rgba(255,255,255,.7)'], 90, 0.3, 100); break;
      case 'jump2': burst(e.x, e.y, 9, ['#8fe3ff', '#fff'], 160, 0.35, 100); break;
      case 'spawn': burst(e.x, e.y, 8, ['#ff8aa0', '#fff'], 160, 0.35, 100); break;
      case 'thump': D.shake(5); burst(e.x, e.y, 8, ['#d9c9a8', '#b8a888'], 200, 0.4); break;
      case 'arena': D.banner('⚠ 전투 구역!', '로봇을 모두 부숴야 지나갈 수 있어요', 1.8, '#ff8a6a'); break;
      case 'wave': if (e.n > 1) D.banner(e.n + '번째 무리!', '', 1, '#ffb03d'); break;
      case 'go': D.banner('앞으로!', '', 1.4, '#7dffb0'); break;
      case 'boss': D.banner('⚠ 보스 등장 ⚠', e.name, 2.2, '#ff5c5c'); D.shake(8); break;
      case 'rage': D.banner('보스가 화났다!', '', 1.2, '#ff5c5c'); D.shake(10); break;
      case 'boss-dead': D.banner('보스 격파!!', '', 2.4, '#ffe14d'); D.shake(16); flashScreen = 0.5; break;
      case 'beam': D.shake(5); break;
      case 'empty': text(s.p.x + 14, s.p.y - 14, '탄약 끝!', '#ff9a9a', 16); break;
      case 'respawn': burst(e.x + 14, e.y + 28, 20, ['#8fe3ff', '#fff'], 260, 0.6, 0); break;
    }
  };
  D.reset = function () { fx = []; shake = 0; banner = null; flashScreen = 0; };
  function effects(c, dt) {
    for (var i = 0; i < fx.length; i++) {
      var f = fx[i]; f.t += dt; f.vy += f.g * dt; f.x += f.vx * dt; f.y += f.vy * dt;
      var k = Math.max(0, 1 - f.t / f.life);
      if (f.k === 'p') { c.globalAlpha = k; c.fillStyle = f.c; c.fillRect(f.x - f.r / 2, f.y - f.r / 2, f.r, f.r); }
      else if (f.k === 'f') { c.globalAlpha = 0.9; c.fillStyle = f.c; circ(c, f.x, f.y, f.r); }
      else if (f.k === 'r') { c.globalAlpha = k * 0.7; c.strokeStyle = f.c; c.lineWidth = 8 * k + 1; c.beginPath(); c.arc(f.x, f.y, f.r * (1.15 - k * 0.7), 0, TAU); c.stroke(); }
      else if (f.k === 't') { c.globalAlpha = Math.min(1, k * 2); c.font = '900 ' + f.z + 'px "Malgun Gothic", sans-serif'; c.textAlign = 'center'; c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,.65)'; c.strokeText(f.s, f.x, f.y); c.fillStyle = f.c; c.fillText(f.s, f.x, f.y); }
      else if (f.k === 'z') { c.globalAlpha = k; c.strokeStyle = '#e8d6ff'; c.lineWidth = 4; c.beginPath(); c.moveTo(f.x, f.y); for (var q = 1; q < 5; q++) c.lineTo(f.x + (f.x2 - f.x) * q / 5 + (Math.random() - 0.5) * 26, f.y + (f.y2 - f.y) * q / 5 + (Math.random() - 0.5) * 26); c.lineTo(f.x2, f.y2); c.stroke(); }
      else if (f.k === 'dead') { // 부서진 로봇이 빙글 날아가며 사라진다
        c.save(); c.globalAlpha = Math.min(1, k * 1.6); c.translate(f.x, f.y); c.rotate(f.t * f.r);
        var di = pics['enemy_' + f.n];
        if (di) sprite(c, di, 0, f.h * 0.6, f.h * 1.2, false, 1, 1, f.h * 1.7); else { c.translate(0, f.h / 2); ART[f.n](c, { t: f.t, st: 'idle', n: 0, vx: 0 }); }
        c.restore();
      } else if (f.k === 'pet') { c.globalAlpha = 1; if (f.y > 448) { f.y = 448; f.vy = -230; } pet(c, f.p, f.x, f.y, 30, -1); }
    }
    c.globalAlpha = 1;
    fx = fx.filter(function (f) { return f.t < f.life; });
  }

  function goal(c, s) {
    var g = s.map.goal;
    if (!g) return;
    c.fillStyle = '#5b6472'; c.fillRect(g.x + 20, g.y - 130, 8, 130); c.fillStyle = '#39404e'; c.fillRect(g.x + 10, g.y - 6, 28, 6);
    c.fillStyle = '#ff5c5c'; var w = Math.sin(clock * 5) * 6; c.beginPath(); c.moveTo(g.x + 28, g.y - 130); c.quadraticCurveTo(g.x + 60, g.y - 138 + w, g.x + 94, g.y - 124); c.lineTo(g.x + 94, g.y - 84); c.quadraticCurveTo(g.x + 60, g.y - 96 + w, g.x + 28, g.y - 88); c.fill();
    c.fillStyle = '#fff'; c.font = '900 22px "Malgun Gothic", sans-serif'; c.textAlign = 'center'; c.fillText('도착', g.x + 60, g.y - 102);
  }
  function chase(c, s) {
    if (!s.chase) return;
    var x = s.chase.x - 24;
    if (x < s.camX - 420) return;
    c.save(); c.translate(x, 0);
    c.fillStyle = '#39404e'; c.fillRect(-600, 0, 590, 450); c.fillStyle = '#5b6472'; c.fillRect(-40, 0, 34, 450);
    c.fillStyle = '#ffd84a'; for (var i = 0; i < 10; i++) poly(c, [-40, i * 50, -6, i * 50 - 20, -6, i * 50 + 5, -40, i * 50 + 25]);
    c.fillStyle = '#d7dce6'; for (i = 0; i < 9; i++) { c.save(); c.translate(-2, 30 + i * 50); c.rotate(clock * 9); for (var q = 0; q < 6; q++) { c.rotate(TAU / 6); poly(c, [0, -7, 30, 0, 0, 7]); } c.restore(); }
    eye(c, -90, 130, 34); eye(c, -90, 230, 34);
    c.restore();
    if (s.chase.wait <= 0 && s.p.x - s.chase.x < 380) { c.fillStyle = 'rgba(255,40,40,' + (0.12 + Math.sin(clock * 12) * 0.06) + ')'; c.fillRect(s.camX, 0, 120, VH); }
  }

  // ----- 정보 줄 -----
  function hud(c, s) {
    var p = s.p, i;
    c.textAlign = 'left'; c.lineJoin = 'round';
    c.fillStyle = 'rgba(10,14,28,.55)'; rr(c, 10, 10, Math.max(210, 62 + p.maxHp * 27), 66, 12);
    for (i = 0; i < p.maxHp; i++) heart(c, 34 + i * 27, 32, 10, i < p.hp ? '#ff4d6d' : 'rgba(255,255,255,.22)');
    if (p.shield > 0) label(c, '🛡' + p.shield, 40 + p.maxHp * 27, 39, 16, '#8fe3ff');
    label(c, (s.tower ? '' : '목숨 ' + s.lives + '   ') + '💣 ' + p.bombs, 22, 67, 16, '#fff');
    c.fillStyle = 'rgba(10,14,28,.55)'; rr(c, 10, 82, 148, 34, 10);
    c.fillStyle = WCOL[p.weapon]; rr(c, 18, 90, 8, 18, 3);
    label(c, p.mech ? '로봇 기관총' : G.WEAPONS[p.weapon].name + (p.weapon === 'screw' ? ' ∞' : ' ' + p.ammo), 34, 105, 16, '#fff');
    c.textAlign = 'right';
    label(c, s.score.toLocaleString('ko-KR') + '점', VW - 18, 36, 24, '#fff');
    label(c, '🪙 ' + s.coins + '    🐾 ' + s.pets + '/' + s.petsTotal, VW - 18, 62, 17, '#ffe9a0');
    c.textAlign = 'center';
    label(c, s.map.info.label + ' ' + s.map.info.name + ' · ' + s.map.info.typeName, VW / 2, 28, 15, 'rgba(255,255,255,.9)');
    if (!s.boss && s.map.goal) { c.fillStyle = 'rgba(10,14,28,.5)'; rr(c, VW / 2 - 130, 38, 260, 8, 4); c.fillStyle = '#7dffb0'; rr(c, VW / 2 - 130, 38, 260 * Math.max(0, Math.min(1, p.x / s.map.goal.x)), 8, 4); if (s.chase) { c.fillStyle = '#ff5c5c'; circ(c, VW / 2 - 130 + 260 * Math.max(0, Math.min(1, s.chase.x / s.map.goal.x)), 42, 6); } }
    if (s.combo >= 2) {
      var k = s.comboT / s.st.combo, m = G.comboMult(s.combo);
      c.textAlign = 'right'; label(c, s.combo + ' 콤보' + (m > 1 ? '  ×' + m : ''), VW - 18, 100, 20 + Math.min(14, s.combo / 3), s.combo >= 30 ? '#ff7ab0' : s.combo >= 10 ? '#ffb03d' : '#ffe14d');
      c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(VW - 138, 110, 120, 6); c.fillStyle = '#ffe14d'; c.fillRect(VW - 18 - 120 * k, 110, 120 * k, 6);
    }
    if (s.boss && !s.boss.dead) { c.fillStyle = 'rgba(10,14,28,.7)'; rr(c, 190, VH - 40, VW - 380, 26, 8); c.fillStyle = s.boss.rage ? '#ff3d3d' : '#ff8a3d'; rr(c, 194, VH - 36, (VW - 388) * s.boss.hp / s.boss.maxHp, 18, 5); c.textAlign = 'center'; label(c, s.boss.name, VW / 2, VH - 21, 15, '#fff'); }
    if (s.go > 0 && Math.floor(clock * 5) % 2) { c.textAlign = 'center'; label(c, '앞으로 ▶▶', VW - 110, VH / 2, 34, '#7dffb0'); }
    if (banner) {
      var q = Math.min(1, banner.t * 6) * Math.min(1, (banner.life - banner.t) * 4);
      c.globalAlpha = Math.max(0, q); c.textAlign = 'center';
      label(c, banner.s, VW / 2, 170, 44, banner.c); if (banner.sub) label(c, banner.sub, VW / 2, 206, 20, '#fff');
      c.globalAlpha = 1;
    }
  }
  function label(c, str, x, y, size, col) {
    c.font = '900 ' + size + 'px Pretendard, "Malgun Gothic", sans-serif'; c.lineWidth = Math.max(3, size / 6); c.strokeStyle = 'rgba(8,10,24,.8)'; c.strokeText(str, x, y); c.fillStyle = col; c.fillText(str, x, y);
  }

  // 한 장면 그리기(s: 게임 상태, dt: 지난 시간, 멈춤이면 0)
  D.frame = function (c, s, dt, scale, noHud) {
    clock += dt;
    if (banner) { banner.t += dt; if (banner.t > banner.life) banner = null; }
    shake = Math.max(0, shake - dt * 30); flashScreen = Math.max(0, flashScreen - dt); landT = Math.max(0, landT - dt * 1.4);
    c.setTransform(scale, 0, 0, scale, 0, 0);
    background(c, s);
    c.save();
    c.translate(-Math.round(s.camX * 2) / 2 + (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    tiles(c, s); goal(c, s); props(c, s);
    if (s.mechSpot) { mech(c, s.mechSpot.x + 39, s.mechSpot.y + 88, 1, null); c.textAlign = 'center'; label(c, '타세요!', s.mechSpot.x + 39, s.mechSpot.y - 14 + Math.sin(clock * 6) * 4, 18, '#7dffb0'); }
    items(c, s); enemies(c, s); boss(c, s); hero(c, s); shots(c, s); foes(c, s); chase(c, s); effects(c, dt);
    c.restore();
    if (flashScreen > 0) { c.fillStyle = 'rgba(255,60,60,' + flashScreen * 0.9 + ')'; c.fillRect(0, 0, VW, VH); }
    if (!noHud) hud(c, s);
  };
})(window.TinSquad);
