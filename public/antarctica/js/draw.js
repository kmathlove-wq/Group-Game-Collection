// ===== draw.js =====
// 남극 탐험 화면 그리기(그림 파일 없이 Canvas 코드로만). 카메라가 나를 따라가고 오른쪽 위에 미니맵.
// frame(ctx, state, 초, ui) — ui = { view: {w, h}, stick }. icon(canvas, 'animal'|'sample', id)는 도감 그림.
(function (A) {
  'use strict';
  var G = A.Game, T = G.T, TILE = G.TILE;
  var W = G.world();

  function h2(c, r, k) { return G.hash2(c, r, k || 1); }
  function ell(ctx, x, y, rx, ry, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }
  function circ(ctx, x, y, r, color) { ell(ctx, x, y, r, r, color); }
  function shadow(ctx, x, y, rx) { ell(ctx, x, y, rx, rx * 0.35, 'rgba(40,70,110,0.18)'); }
  function label(ctx, text, x, y, size, color, bg) {
    ctx.font = '800 ' + size + 'px Pretendard, "Noto Sans KR", "Malgun Gothic", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var w = ctx.measureText(text).width;
    if (bg) { ctx.fillStyle = bg; roundRect(ctx, x - w / 2 - 7, y - size * 0.75, w + 14, size * 1.5, size * 0.6); ctx.fill(); }
    ctx.fillStyle = color; ctx.fillText(text, x, y + 1);
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ----- 땅 -----
  var GROUND = { 0: '#f3f7fc', 1: '#bfe5f6', 2: '#e3ebf5', 3: '#f3f7fc', 4: '#1d5a8f', 5: '#1d5a8f', 6: '#d9dde4', 7: '#d6dce5', 8: '#f3f7fc' };
  function tileGround(ctx, s, c, r, t, x, y) {
    var shown = t === T.CREV && !s.revealed[r * G.COLS + c] ? T.SNOW : t;
    ctx.fillStyle = GROUND[shown]; ctx.fillRect(x, y, TILE + 0.5, TILE + 0.5);
    var a = h2(c, r), b = h2(c, r, 2);
    if (shown === T.SNOW || shown === T.POLE) {
      ctx.fillStyle = 'rgba(150,180,215,0.35)';
      ctx.fillRect(x + a * 26, y + b * 26, 2, 2); ctx.fillRect(x + b * 22 + 4, y + a * 20 + 8, 2, 2);
      if (a > 0.8) { ctx.fillStyle = 'rgba(190,210,235,0.5)'; ctx.beginPath(); ctx.ellipse(x + 16, y + 20, 10, 3, 0, 0, 7); ctx.fill(); }
    } else if (shown === T.ICE) {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 4 + a * 10, y + 24); ctx.lineTo(x + 14 + a * 10, y + 10); ctx.stroke();
      if (b > 0.5) { ctx.strokeStyle = 'rgba(120,180,215,0.45)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + b * 20, y + 4); ctx.lineTo(x + b * 20 + 10, y + 14); ctx.stroke(); }
    } else if (shown === T.DEEP) {
      ctx.strokeStyle = 'rgba(160,180,210,0.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x + 10 + a * 12, y + 22, 9, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 4 + b * 10, y + 10, 6, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    } else if (shown === T.CREV) {
      // 드러난 크레바스: 파랗고 깊은 틈
      ctx.fillStyle = '#d7ecf8'; ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
      ctx.fillStyle = '#14335a';
      ctx.beginPath();
      ctx.moveTo(x + 2, y + 14 + a * 4); ctx.lineTo(x + 10, y + 9 + b * 4); ctx.lineTo(x + 18, y + 13); ctx.lineTo(x + 30, y + 10 + a * 3);
      ctx.lineTo(x + 30, y + 21); ctx.lineTo(x + 20, y + 24 - b * 3); ctx.lineTo(x + 11, y + 20); ctx.lineTo(x + 2, y + 23);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#5aa9e6'; ctx.lineWidth = 1.5; ctx.stroke();
    } else if (shown === T.SEA || shown === T.FLOE) {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2;
      var wv = (s.t * 0.6 + a) % 1;
      ctx.beginPath(); ctx.moveTo(x + 4, y + 10 + wv * 14); ctx.quadraticCurveTo(x + 10, y + 6 + wv * 14, x + 16, y + 10 + wv * 14); ctx.stroke();
      if (shown === T.FLOE) {
        ctx.fillStyle = '#f4fbff'; ctx.strokeStyle = '#9cc7e6'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x + 6, y + 8 + a * 4); ctx.lineTo(x + 22 + b * 6, y + 5); ctx.lineTo(x + 28, y + 18); ctx.lineTo(x + 16, y + 28); ctx.lineTo(x + 4, y + 22); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    } else if (shown === T.BASE) {
      ctx.strokeStyle = 'rgba(120,130,150,0.25)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
    }
  }
  function mountain(ctx, c, r, x, y) {
    var a = h2(c, r, 3), b = h2(c, r, 4);
    var top = y - 10 - a * 12, cx = x + 10 + b * 12;
    ctx.fillStyle = '#7c838f';
    ctx.beginPath(); ctx.moveTo(x - 6, y + TILE + 2); ctx.lineTo(cx, top); ctx.lineTo(x + TILE + 6, y + TILE + 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5f6672';
    ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(x + TILE + 6, y + TILE + 2); ctx.lineTo(cx + 4, y + TILE + 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff';
    var k = 0.38;
    ctx.beginPath(); ctx.moveTo(cx, top);
    ctx.lineTo(cx + (x + TILE + 6 - cx) * k, top + (y + TILE + 2 - top) * k);
    ctx.lineTo(cx + 3, top + (y + TILE - top) * k * 0.7);
    ctx.lineTo(cx - (cx - x + 6) * k * 0.6, top + (y + TILE - top) * k * 0.9);
    ctx.lineTo(cx - (cx - x + 6) * k, top + (y + TILE + 2 - top) * k);
    ctx.closePath(); ctx.fill();
  }

  // ----- 동물 -----
  function penguin(ctx, x, y, sp, t, seed) {
    var sc = sp === 'emperor' ? 1.4 : 1;
    var wob = Math.sin(t * 3 + seed * 6) * 0.08;
    shadow(ctx, x, y, 8 * sc);
    ctx.save(); ctx.translate(x, y); ctx.rotate(wob); ctx.scale(sc, sc);
    ell(ctx, -3, 0, 3, 1.6, '#f08c2e'); ell(ctx, 3, 0, 3, 1.6, '#f08c2e');
    ell(ctx, 0, -10, 7, 11, '#1f2430');
    ell(ctx, -7, -10, 2, 6, '#1f2430'); ell(ctx, 7, -10, 2, 6, '#1f2430');
    ell(ctx, 0, -8, 4.6, 8, sp === 'emperor' ? '#fff6dc' : '#ffffff');
    if (sp === 'chinstrap') {
      circ(ctx, 0, -21, 5.5, '#ffffff');
      ctx.fillStyle = '#1f2430'; ctx.beginPath(); ctx.arc(0, -21, 5.5, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = '#1f2430'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(0, -21, 4.2, 0.25, Math.PI - 0.25); ctx.stroke();
    } else circ(ctx, 0, -21, 5.5, '#1f2430');
    if (sp === 'emperor') { ell(ctx, -4.6, -19, 1.6, 2.6, '#ffb534'); ell(ctx, 4.6, -19, 1.6, 2.6, '#ffb534'); ell(ctx, 0, -14, 3.4, 1.6, '#ffd36b'); }
    if (sp === 'adelie') { circ(ctx, -2.2, -22, 1.6, '#fff'); circ(ctx, 2.2, -22, 1.6, '#fff'); }
    if (sp === 'gentoo') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, -22, 4, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
    circ(ctx, -2.2, -22, 0.8, '#000'); circ(ctx, 2.2, -22, 0.8, '#000');
    ctx.fillStyle = sp === 'gentoo' ? '#ff7a1a' : sp === 'emperor' ? '#e98a4a' : '#222';
    ctx.beginPath(); ctx.moveTo(-1.6, -19.6); ctx.lineTo(1.6, -19.6); ctx.lineTo(0, -16.6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  var SEAL = {
    weddell: { body: '#5d6878', spot: '#8d99a8', size: 1 },
    leopard: { body: '#9aa5b0', spot: '#3e4652', size: 1.05 },
    elephant: { body: '#7b6350', spot: null, size: 1.35 },
    crabeater: { body: '#d9c9a6', spot: null, size: 0.95 },
    furseal: { body: '#5b4535', spot: null, size: 0.85 }
  };
  function seal(ctx, x, y, sp, t, seed) {
    var o = SEAL[sp], sc = o.size, dir = seed > 0.5 ? 1 : -1;
    var breathe = 1 + Math.sin(t * 1.6 + seed * 9) * 0.03;
    shadow(ctx, x, y + 2, 18 * sc);
    ctx.save(); ctx.translate(x, y); ctx.scale(dir * sc, sc);
    if (sp === 'furseal') {
      ell(ctx, -4, -4, 13, 7 * breathe, o.body);
      ell(ctx, 7, -12, 5, 8, o.body);
      circ(ctx, 9, -20, 5, o.body);
      ell(ctx, 6, -24, 1.4, 2, '#3c2c22');
      ell(ctx, 13, -19, 3, 2, '#4a3628');
      circ(ctx, 10, -21, 0.9, '#000');
      ell(ctx, 6, 1, 4, 2, '#3c2c22');
    } else {
      ell(ctx, 0, -5, 18, 7.5 * breathe, o.body);
      ell(ctx, -17, -4, 5, 3, o.body);
      ell(ctx, -20, -2, 3, 4, o.body);
      var hr = sp === 'leopard' ? 6.5 : 5.5;
      circ(ctx, 15, -9, hr, o.body);
      if (o.spot) { ctx.fillStyle = o.spot; [[-8, -8], [-2, -3], [4, -9], [-12, -4], [8, -4]].forEach(function (p, i) { ell(ctx, p[0], p[1], 2 - (i % 2) * 0.6, 1.3, o.spot); }); }
      if (sp === 'elephant') { ell(ctx, 20, -7, 4.5, 3.4, '#6a5444'); ell(ctx, 21, -4, 3, 2.2, '#5c4739'); }
      if (sp === 'crabeater') ell(ctx, 18, -8, 3.2, 2.4, '#c6b48d');
      circ(ctx, 16.5, -11, 1, '#000');
      ell(ctx, 6, 1, 4, 1.6, 'rgba(0,0,0,0.25)');
    }
    ctx.restore();
  }
  var BIRD = { skua: { body: '#6c543a', wing: '#4f3d2a', beak: '#222', size: 1 }, snowpetrel: { body: '#ffffff', wing: '#eef3f8', beak: '#222', size: 0.85 }, giantpetrel: { body: '#7a7570', wing: '#5d5853', beak: '#f2d27a', size: 1.35 } };
  function bird(ctx, x, y, sp, t, seed) {
    var o = BIRD[sp], sc = o.size, flap = Math.sin(t * 8 + seed * 20);
    var fly = (Math.sin(t * 0.7 + seed * 10) > 0.3);
    var hy = fly ? -18 - Math.sin(t * 2 + seed) * 4 : 0;
    shadow(ctx, x, y, 7 * sc);
    ctx.save(); ctx.translate(x, y + hy); ctx.scale(sc, sc);
    if (sp === 'snowpetrel') { ctx.strokeStyle = '#9fb2c6'; ctx.lineWidth = 0.8; }
    var wy = fly ? flap * 7 : 2;
    ctx.fillStyle = o.wing;
    ctx.beginPath(); ctx.moveTo(-2, -8); ctx.quadraticCurveTo(-12, -12 - wy, -18, -6 - wy); ctx.quadraticCurveTo(-10, -5, -2, -5); ctx.fill(); if (sp === 'snowpetrel') ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, -8); ctx.quadraticCurveTo(12, -12 - wy, 18, -6 - wy); ctx.quadraticCurveTo(10, -5, 2, -5); ctx.fill(); if (sp === 'snowpetrel') ctx.stroke();
    ctx.fillStyle = o.body; ctx.beginPath(); ctx.ellipse(0, -7, 5, 7, 0, 0, 7); ctx.fill(); if (sp === 'snowpetrel') ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -15, 4, 0, 7); ctx.fill(); if (sp === 'snowpetrel') ctx.stroke();
    circ(ctx, -1.5, -15.5, 0.9, '#000'); circ(ctx, 1.5, -15.5, 0.9, '#000');
    ctx.fillStyle = o.beak; ctx.beginPath(); ctx.moveTo(-1.4, -13.5); ctx.lineTo(1.4, -13.5); ctx.lineTo(0, sp === 'giantpetrel' ? -9.5 : -11); ctx.closePath(); ctx.fill();
    if (!fly) { ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(-2, 2); ctx.moveTo(2, 0); ctx.lineTo(2, 2); ctx.stroke(); }
    ctx.restore();
  }
  var KIND = {};
  G.ANIMALS.forEach(function (a) { KIND[a.id] = a.kind; });
  function animal(ctx, sp, x, y, t, seed) {
    if (KIND[sp] === 'penguin') penguin(ctx, x, y, sp, t, seed);
    else if (KIND[sp] === 'seal') seal(ctx, x, y, sp, t, seed);
    else bird(ctx, x, y, sp, t, seed);
  }
  function animalGroup(ctx, s, a, i, t) {
    for (var k = 0; k < a.group; k++) {
      var ang = k * 2.4 + i, rad = k === 0 ? 0 : 14 + (k % 3) * 9;
      animal(ctx, a.sp, a.x + Math.cos(ang) * rad * 1.3, a.y + Math.sin(ang) * rad * 0.7, t, h2(i, k, 9));
    }
    if (!s.seen[a.sp]) {
      var by = a.y - 46 + Math.sin(t * 3 + i) * 3;
      circ(ctx, a.x, by, 10, '#ffd43b'); label(ctx, '?', a.x, by, 14, '#7a4b00');
    }
  }

  // ----- 표본·상자·기지·남극점 -----
  function sample(ctx, kind, x, y, t, seed) {
    var glow = 0.35 + 0.25 * Math.sin(t * 4 + seed * 7);
    ctx.strokeStyle = 'rgba(255,200,40,' + glow + ')'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(x, y + 2, 16, 7, 0, 0, 7); ctx.stroke();
    if (kind === 'moss') {
      ell(ctx, x, y, 11, 7, '#8d939c'); ell(ctx, x - 2, y - 2, 8, 4, '#a3a9b1');
      [[-6, -4], [-1, -6], [4, -4], [7, -1], [-3, -1]].forEach(function (p, i) { circ(ctx, x + p[0], y + p[1], 2.8 - (i % 2) * 0.6, i % 2 ? '#7cc24a' : '#4f9a32'); });
    } else if (kind === 'fossil') {
      ell(ctx, x, y, 12, 8, '#c9b48e'); ell(ctx, x - 2, y - 2, 9, 5, '#d8c6a2');
      ctx.strokeStyle = '#7a6440'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x - 7, y + 2); ctx.lineTo(x + 7, y - 4); ctx.stroke();
      for (var k = 0; k < 4; k++) { var px = x - 4 + k * 3.4, py = y + 0.6 - k * 1.5; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - 1, py - 4); ctx.moveTo(px, py); ctx.lineTo(px + 2, py + 3); ctx.stroke(); }
    } else if (kind === 'meteorite') {
      ctx.fillStyle = '#2c2621';
      ctx.beginPath(); ctx.moveTo(x - 9, y + 3); ctx.lineTo(x - 7, y - 5); ctx.lineTo(x, y - 8); ctx.lineTo(x + 8, y - 4); ctx.lineTo(x + 10, y + 3); ctx.lineTo(x + 2, y + 6); ctx.closePath(); ctx.fill();
      circ(ctx, x - 3, y - 3, 1.6, '#4a3f36'); circ(ctx, x + 4, y - 1, 1.2, '#4a3f36');
      var tw = (t * 2 + seed) % 1;
      ctx.fillStyle = 'rgba(255,255,255,' + (1 - tw) + ')'; ctx.fillRect(x + 3, y - 7, 2, 2);
    } else {
      // 얼음 코어: 주황 깃발 + 눕혀 둔 얼음 기둥
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 8, y + 2); ctx.lineTo(x + 8, y - 22); ctx.stroke();
      ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(x + 8, y - 22); ctx.lineTo(x + 18, y - 18); ctx.lineTo(x + 8, y - 14); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#dff3ff'; roundRect(ctx, x - 12, y - 5, 18, 8, 4); ctx.fill();
      ctx.strokeStyle = '#7fbfe6'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.strokeStyle = 'rgba(120,180,220,0.7)'; ctx.beginPath(); ctx.moveTo(x - 6, y - 5); ctx.lineTo(x - 6, y + 3); ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 3); ctx.stroke();
    }
  }
  function cache(ctx, x, y) {
    shadow(ctx, x, y + 8, 14);
    ctx.fillStyle = '#b07a43'; ctx.fillRect(x - 12, y - 10, 24, 18);
    ctx.fillStyle = '#8c5d30'; ctx.fillRect(x - 12, y - 10, 24, 4);
    ctx.fillStyle = '#e03131'; ctx.fillRect(x - 3, y - 6, 6, 14);
    ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 10, y - 10); ctx.lineTo(x + 10, y - 30); ctx.stroke();
    ctx.fillStyle = '#ff922b'; ctx.fillRect(x + 10, y - 30, 10, 7);
  }
  function koreanFlag(ctx, x, y) {
    ctx.strokeStyle = '#666'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 46); ctx.stroke();
    var fx = x + 1, fy = y - 46, fw = 24, fh = 16;
    ctx.fillStyle = '#fff'; ctx.fillRect(fx, fy, fw, fh); ctx.strokeStyle = '#ccc'; ctx.lineWidth = 0.5; ctx.strokeRect(fx, fy, fw, fh);
    var cx = fx + fw / 2, cy = fy + fh / 2;
    ctx.fillStyle = '#cd2e3a'; ctx.beginPath(); ctx.arc(cx, cy, 4, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#0047a0'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI); ctx.fill();
    ctx.fillStyle = '#111';
    [[3, 3], [fw - 6, 3], [3, fh - 6], [fw - 6, fh - 6]].forEach(function (p) { ctx.fillRect(fx + p[0], fy + p[1], 3, 3); });
  }
  function baseDraw(ctx, b, i, t) {
    var R = b.rect;
    ctx.fillStyle = 'rgba(255,170,60,0.12)'; ctx.fillRect(R.x - 8, R.y - 8, R.w + 16, R.h + 16);
    ctx.strokeStyle = '#ff922b'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.strokeRect(R.x - 8, R.y - 8, R.w + 16, R.h + 16); ctx.setLineDash([]);
    // 건물: 주황 본관 + 파란 컨테이너
    var bx = R.x + 10, by = R.y - 34;
    ctx.fillStyle = 'rgba(40,60,90,0.18)'; ctx.fillRect(bx + 4, by + 40, 140, 10);
    ctx.fillStyle = i === 0 ? '#ff8a2a' : '#ffb02e'; ctx.fillRect(bx, by, 80, 46);
    ctx.fillStyle = '#c7621b'; ctx.fillRect(bx, by, 80, 7);
    ctx.fillStyle = '#bfe4ff'; for (var k = 0; k < 4; k++) ctx.fillRect(bx + 7 + k * 18, by + 15, 11, 10);
    ctx.fillStyle = '#5c3b1e'; ctx.fillRect(bx + 34, by + 30, 12, 16);
    ctx.fillStyle = '#3b7fd6'; ctx.fillRect(bx + 86, by + 14, 52, 32);
    ctx.fillStyle = '#2d63a8'; for (k = 0; k < 6; k++) ctx.fillRect(bx + 90 + k * 8, by + 16, 3, 28);
    // 안테나
    ctx.strokeStyle = '#888'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx + 120, by + 14); ctx.lineTo(bx + 120, by - 20); ctx.stroke();
    circ(ctx, bx + 120, by - 22, 3, Math.sin(t * 4) > 0 ? '#ff4040' : '#802020');
    koreanFlag(ctx, R.x + R.w - 6, R.y + R.h - 4);
    label(ctx, '🏠 ' + b.name, R.x + R.w / 2, R.y - 52, 15, '#fff', 'rgba(230,110,20,0.92)');
  }
  function poleDraw(ctx, t) {
    var x = W.pole.x, y = W.pole.y;
    ctx.strokeStyle = 'rgba(255,90,90,0.35)'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.arc(x, y, G.POLE_R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    var colors = ['#e03131', '#1c7ed6', '#2f9e44', '#f59f00', '#ae3ec9', '#0b7285', '#f76707', '#5f3dc4'];
    for (var k = 0; k < 8; k++) {
      var a = k / 8 * Math.PI * 2, fx = x + Math.cos(a) * 44, fy = y + Math.sin(a) * 26;
      ctx.strokeStyle = '#777'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 30); ctx.stroke();
      ctx.fillStyle = colors[k]; ctx.fillRect(fx, fy - 30 + Math.sin(t * 5 + k) * 1.2, 13, 8);
    }
    shadow(ctx, x, y, 10);
    for (k = 0; k < 6; k++) { ctx.fillStyle = k % 2 ? '#fff' : '#e03131'; ctx.fillRect(x - 3, y - 6 - k * 6, 6, 6); }
    var g = ctx.createRadialGradient(x - 3, y - 45, 1, x, y - 42, 9);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#8fa3b8');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 42, 8, 0, 7); ctx.fill();
    label(ctx, '🚩 남극점 90°S', x, y - 66, 15, '#fff', 'rgba(200,40,40,0.92)');
  }

  // ----- 나(주황 방한복 탐험대원) -----
  function explorer(ctx, s, t) {
    var p = s.player, x = p.x, y = p.y;
    if (p.camping) {
      shadow(ctx, x, y + 6, 22);
      ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(x - 22, y + 8); ctx.lineTo(x, y - 22); ctx.lineTo(x + 22, y + 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d9580a'; ctx.beginPath(); ctx.moveTo(x - 6, y + 8); ctx.lineTo(x, y - 8); ctx.lineTo(x + 6, y + 8); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#8a3a00'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y - 22); ctx.lineTo(x, y - 27); ctx.stroke();
      label(ctx, 'z', x + 14 + Math.sin(t * 2) * 3, y - 28 - (t * 10 % 12), 12, '#4a6fa5');
      return;
    }
    var walk = p.moving ? Math.sin(t * 14) : 0;
    var f = p.face;
    if (s.up.sled && !s.up.mobile) {
      var sx = x - f * 26;
      ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - f * 8, y - 2); ctx.lineTo(sx + f * 10, y + 2); ctx.stroke();
      ctx.fillStyle = '#9a6a3a'; roundRect(ctx, sx - 11, y - 3, 22, 9, 3); ctx.fill();
      ctx.strokeStyle = '#5a3d20'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx - 13, y + 7); ctx.lineTo(sx + 13, y + 7); ctx.stroke();
      p.bag.forEach(function (k, i) { circ(ctx, sx - 7 + (i % 5) * 3.5, y - 1 - Math.floor(i / 5) * 3, 2.2, { moss: '#4f9a32', fossil: '#c9b48e', meteorite: '#2c2621', core: '#bfe4ff' }[k]); });
    }
    if (s.up.mobile) {
      shadow(ctx, x, y + 6, 22);
      ctx.strokeStyle = '#333'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x - 20, y + 6); ctx.lineTo(x + 18, y + 6); ctx.quadraticCurveTo(x + 24, y + 6, x + 22, y + 1); ctx.stroke();
      ctx.save(); ctx.translate(x, y); ctx.scale(f, 1);
      ctx.fillStyle = '#d6336c'; roundRect(ctx, -18, -8, 34, 12, 5); ctx.fill();
      ctx.fillStyle = '#a61e4d'; ctx.fillRect(-14, -10, 14, 4);
      ctx.fillStyle = '#bfe4ff'; ctx.beginPath(); ctx.moveTo(10, -8); ctx.lineTo(15, -16); ctx.lineTo(17, -8); ctx.closePath(); ctx.fill();
      ctx.restore();
      y -= 8;
    } else shadow(ctx, x, y + 1, 10);
    ctx.save(); ctx.translate(x, y); ctx.scale(f, 1);
    if (!s.up.mobile) {
      ctx.fillStyle = '#3b4250';
      ctx.fillRect(-5, -6 + walk * 2, 4, 7); ctx.fillRect(1, -6 - walk * 2, 4, 7);
    }
    ctx.fillStyle = '#4a5160'; roundRect(ctx, -10, -19, 7, 12, 3); ctx.fill(); // 배낭
    ctx.fillStyle = '#ff7a1a'; roundRect(ctx, -8, -20, 16, 16, 6); ctx.fill();
    ctx.fillStyle = '#e8650c'; ctx.fillRect(-1, -19, 2, 14);
    ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.ellipse(8, -13 - walk * 2, 3, 5, 0.4, 0, 7); ctx.fill();
    circ(ctx, 0, -27, 9, '#ff7a1a');
    circ(ctx, 1, -26, 6.6, '#efe2c6');
    circ(ctx, 1.5, -25.5, 4.8, '#ffd5b0');
    ctx.fillStyle = '#2b2f3a'; ctx.fillRect(-4, -28, 11, 3.4);
    ctx.fillStyle = '#5ad1ff'; ctx.fillRect(-2.5, -27.5, 3.5, 2.4); ctx.fillRect(2.5, -27.5, 3.5, 2.4);
    ctx.restore();
    if (p.stun > 0) for (var k = 0; k < 3; k++) { var a = t * 6 + k * 2.1; label(ctx, '✦', x + Math.cos(a) * 12, y - 40 + Math.sin(a) * 4, 11, '#ffd43b'); }
  }

  // ----- 미니맵 -----
  var mini = null;
  function miniCanvas() {
    if (mini) return mini;
    mini = document.createElement('canvas'); mini.width = G.COLS; mini.height = G.ROWS;
    var m = mini.getContext('2d'), img = m.createImageData(G.COLS, G.ROWS);
    var col = { 0: [240, 246, 252], 1: [170, 220, 242], 2: [222, 232, 244], 3: [240, 246, 252], 4: [36, 96, 150], 5: [200, 225, 240], 6: [120, 126, 138], 7: [255, 140, 40], 8: [230, 50, 50] };
    for (var i = 0; i < W.tiles.length; i++) { var c = col[W.tiles[i]]; img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255; }
    m.putImageData(img, 0, 0);
    return mini;
  }
  function minimap(ctx, s, view, cam, t) {
    var k = view.w < 700 ? 0.55 : 0.8, w = G.COLS * k, h = G.ROWS * k, x = view.w - w - 10, y = 10;
    ctx.fillStyle = 'rgba(20,40,70,0.55)'; roundRect(ctx, x - 4, y - 4, w + 8, h + 8, 6); ctx.fill();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(miniCanvas(), x, y, w, h);
    ctx.imageSmoothingEnabled = true;
    var sc = w / G.WORLD_W;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1; ctx.strokeRect(x + cam.x * sc, y + cam.y * sc, view.w * sc, view.h * sc);
    W.bases.forEach(function (b) { circ(ctx, x + b.x * sc, y + b.y * sc, 3.5, s.visited[b.id] ? '#ff7a1a' : '#b0b0b0'); });
    circ(ctx, x + W.pole.x * sc, y + W.pole.y * sc, 3.5, '#e03131');
    var tg = G.missionTarget(s);
    if (tg && Math.sin(t * 6) > -0.3) { ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + tg.x * sc, y + tg.y * sc, 6, 0, 7); ctx.stroke(); }
    circ(ctx, x + s.player.x * sc, y + s.player.y * sc, 3.5, '#ff7a1a');
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x + s.player.x * sc, y + s.player.y * sc, 3.5, 0, 7); ctx.stroke();
    label(ctx, '⬆ 남극점', x + w / 2, y + h + 12, 11, '#fff', 'rgba(20,40,70,0.55)');
  }

  // 미션 목표가 화면 밖이면 가장자리 화살표
  function targetArrow(ctx, s, view, cam, t) {
    var tg = G.missionTarget(s);
    if (!tg) return;
    var sx = tg.x - cam.x, sy = tg.y - cam.y;
    if (sx > 20 && sx < view.w - 20 && sy > 20 && sy < view.h - 20) return;
    var px = s.player.x - cam.x, py = s.player.y - cam.y, a = Math.atan2(sy - py, sx - px);
    var r = Math.min(view.w, view.h) / 2 - 46;
    var ax = view.w / 2 + Math.cos(a) * r, ay = view.h / 2 + Math.sin(a) * r;
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(a);
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 5);
    ctx.fillStyle = '#ffd43b'; ctx.strokeStyle = '#7a4b00'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-8, -11); ctx.lineTo(-3, 0); ctx.lineTo(-8, 11); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore(); ctx.globalAlpha = 1;
    var dist = Math.round(Math.hypot(tg.x - s.player.x, tg.y - s.player.y) / TILE * 10);
    label(ctx, tg.name + ' ' + dist + 'm', ax - Math.cos(a) * 34, ay - Math.sin(a) * 26, 12, '#fff', 'rgba(20,40,70,0.7)');
  }

  function joystick(ctx, stick) {
    if (!stick) return;
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.strokeStyle = 'rgba(30,60,100,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(stick.ox, stick.oy, 46, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,122,26,0.85)'; ctx.beginPath(); ctx.arc(stick.ox + stick.dx, stick.oy + stick.dy, 20, 0, 7); ctx.fill();
  }

  var flakes = [];
  for (var i = 0; i < 140; i++) flakes.push({ x: Math.random(), y: Math.random(), z: 0.4 + Math.random() * 0.6 });

  function frame(ctx, s, t, ui) {
    var view = ui.view, p = s.player;
    var cam = {
      x: Math.max(0, Math.min(G.WORLD_W - view.w, p.x - view.w / 2)),
      y: Math.max(0, Math.min(G.WORLD_H - view.h, p.y - view.h / 2))
    };
    cam.x = Math.round(cam.x); cam.y = Math.round(cam.y);
    ctx.fillStyle = '#1d5a8f'; ctx.fillRect(0, 0, view.w, view.h);
    ctx.save(); ctx.translate(-cam.x, -cam.y);
    var c0 = Math.max(0, Math.floor(cam.x / TILE) - 1), c1 = Math.min(G.COLS - 1, Math.ceil((cam.x + view.w) / TILE) + 1);
    var r0 = Math.max(0, Math.floor(cam.y / TILE) - 1), r1 = Math.min(G.ROWS - 1, Math.ceil((cam.y + view.h) / TILE) + 1);
    var r, c, tt;
    for (r = r0; r <= r1; r++) for (c = c0; c <= c1; c++) tileGround(ctx, s, c, r, W.tiles[r * G.COLS + c], c * TILE, r * TILE);
    for (r = r0; r <= Math.min(G.ROWS - 1, r1 + 1); r++) for (c = c0; c <= c1; c++) { tt = W.tiles[r * G.COLS + c]; if (tt === T.MOUNT) mountain(ctx, c, r, c * TILE, r * TILE); }

    var vis = function (x, y, m) { return x > cam.x - m && x < cam.x + view.w + m && y > cam.y - m && y < cam.y + view.h + m; };
    W.bases.forEach(function (b, i) { if (vis(b.x, b.y, 220)) baseDraw(ctx, b, i, t); });
    if (vis(W.pole.x, W.pole.y, 120)) poleDraw(ctx, t);
    s.caches.forEach(function (cc) { if (!cc.wait && vis(cc.x, cc.y, 40)) cache(ctx, cc.x, cc.y); });
    s.samples.forEach(function (sm, i) { if (!sm.wait && vis(sm.x, sm.y, 40)) sample(ctx, sm.kind, sm.x, sm.y, t, i * 0.37); });
    W.animals.forEach(function (a, i) { if (vis(a.x, a.y, 80)) animalGroup(ctx, s, a, i, t); });
    explorer(ctx, s, t);

    // 할 수 있는 일 알림 말풍선
    var nb = G.nearby(s);
    if (nb && !p.camping) {
      var tx, ty, text;
      if (nb.type === 'sample') { var sm = s.samples[nb.index]; tx = sm.x; ty = sm.y - 30; text = 'E 줍기 · ' + G.SAMPLES.filter(function (x) { return x.id === nb.kind; })[0].name; }
      else { var an = W.animals[nb.index]; tx = an.x; ty = an.y - 62; text = s.seen[nb.sp] ? 'E ' + G.ANIMALS.filter(function (x) { return x.id === nb.sp; })[0].name + ' 다시 보기' : 'E 관찰하기 🔍'; }
      label(ctx, text, tx, ty + Math.sin(t * 4) * 2, 13, '#fff', 'rgba(255,122,26,0.95)');
    }
    ctx.restore();

    // 날씨
    var storm = s.weather.phase === 'storm', warn = s.weather.phase === 'warn';
    var inside = G.baseAt(p.x, p.y) >= 0;
    if (storm || warn) {
      var amount = storm ? 1 : 0.35;
      if (storm) {
        var g = ctx.createRadialGradient(view.w / 2, view.h / 2, 60, view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.6);
        g.addColorStop(0, 'rgba(235,242,252,0.25)'); g.addColorStop(1, 'rgba(225,235,248,0.92)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, view.w, view.h);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      var n = Math.floor(flakes.length * amount);
      for (var k = 0; k < n; k++) {
        var f = flakes[k];
        var fx = ((f.x * view.w + t * 520 * f.z) % (view.w + 40)) - 20;
        var fy = ((f.y * view.h + t * 140 * f.z) % (view.h + 20)) - 10;
        ctx.lineWidth = 1 + f.z * 1.5;
        ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx - 14 * f.z, fy - 4 * f.z); ctx.stroke();
      }
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (var q = 0; q < 30; q++) { var fl = flakes[q]; ctx.fillRect(((fl.x * view.w + t * 20 * fl.z) % view.w), ((fl.y * view.h + t * 35 * fl.z) % view.h), 2, 2); }
    }
    // 추우면 가장자리에 서리
    var ratio = p.warm / G.maxWarm(s.up);
    if (ratio < 0.35 && !inside) {
      var fr = (0.35 - ratio) / 0.35;
      var g2 = ctx.createRadialGradient(view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.3, view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.62);
      g2.addColorStop(0, 'rgba(120,180,255,0)'); g2.addColorStop(1, 'rgba(120,180,255,' + (0.25 + fr * 0.5 + Math.sin(t * 5) * 0.05) + ')');
      ctx.fillStyle = g2; ctx.fillRect(0, 0, view.w, view.h);
    }
    targetArrow(ctx, s, view, cam, t);
    minimap(ctx, s, view, cam, t);
    var wy = ui.cardOpen ? (view.w < 700 ? 190 : 150) : 30;
    if (warn) label(ctx, '🌨️ 곧 눈보라가 와요! 기지나 텐트로!', view.w / 2, wy, 16, '#fff', 'rgba(60,90,140,0.85)');
    if (storm) label(ctx, '🌨️ 눈보라! 체온이 빨리 줄어요', view.w / 2, wy, 16, '#fff', 'rgba(60,90,140,0.85)');
    if (p.camping) label(ctx, '⛺ 텐트에서 몸을 녹이는 중 (움직이면 걷어요)', view.w / 2, view.h - 26, 14, '#fff', 'rgba(230,110,20,0.9)');
    joystick(ctx, ui.stick);
  }

  // 도감 그림: 작은 캔버스 가운데에 크게 그림
  function icon(canvas, type, id) {
    var ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save(); ctx.translate(w / 2, h * 0.72);
    var sc = w / 46; ctx.scale(sc, sc);
    if (type === 'animal') animal(ctx, id, KIND[id] === 'seal' ? -2 : 0, 0, 0.3, 0.2);
    else sample(ctx, id, 0, -4, 0.3, 0);
    ctx.restore();
  }

  A.Draw = { frame: frame, icon: icon };
})(window.Antarctica);
