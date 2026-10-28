// ===== scenes.js =====
// 초이스 게임 장면 그림(Canvas, 논리 크기 800×450). 그림 파일 없이 막대맨·외계인·로봇·배경을 코드로 그린다.
// ART[이름](ctx, t) — t는 장면이 시작된 뒤 흐른 초. 애니메이션은 t로 계산한다.
(function (C) {
  'use strict';
  var W = 800, H = 450;
  var INK = '#1b1b24';

  // ---------- 작은 도구 ----------
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function ease(v) { v = clamp01(v); return v * v * (3 - 2 * v); }
  function lerp(a, b, v) { return a + (b - a) * v; }
  function circle(ctx, x, y, r, fill, stroke, lw) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 3; ctx.stroke(); }
  }
  function rect(ctx, x, y, w, h, fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
  function text(ctx, str, x, y, size, color, align) {
    ctx.fillStyle = color || INK;
    ctx.font = '900 ' + (size || 20) + 'px Pretendard, "Noto Sans KR", sans-serif';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  }
  // 말풍선
  function bubble(ctx, str, x, y, size) {
    size = size || 18;
    ctx.font = '800 ' + size + 'px Pretendard, "Noto Sans KR", sans-serif';
    var w = ctx.measureText(str).width + 26, h = size + 20;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h, w, h, 12); else ctx.rect(x - w / 2, y - h, w, h);
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 8, y - 2); ctx.lineTo(x, y + 14); ctx.lineTo(x + 8, y - 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x, y + 14); ctx.lineTo(x + 8, y); ctx.stroke();
    text(ctx, str, x, y - h / 2, size);
  }
  function stars(ctx, seed, count) {
    var a = seed;
    for (var i = 0; i < count; i++) {
      a = (a * 9301 + 49297) % 233280;
      var x = a / 233280 * W;
      a = (a * 9301 + 49297) % 233280;
      var y = a / 233280 * H;
      circle(ctx, x, y, (i % 3) * 0.6 + 0.8, '#fff');
    }
  }
  function earth(ctx, x, y, r) {
    circle(ctx, x, y, r, '#2f80ed');
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    circle(ctx, x - r * 0.3, y - r * 0.2, r * 0.45, '#3fbf5f');
    circle(ctx, x + r * 0.45, y + r * 0.35, r * 0.35, '#3fbf5f');
    ctx.restore();
    circle(ctx, x, y, r, null, '#ffffff66', 3);
  }

  // ---------- 막대맨 ----------
  // (x, y) = 발 위치. o: { s 크기, flip, lean, armL, armR, legL, legR, face, hat, rot, color }
  // 팔다리 각도는 '아래로 곧게'가 0, 앞쪽(바라보는 쪽)으로 들면 +.
  function stick(ctx, x, y, o) {
    o = o || {};
    var s = o.s || 1;
    ctx.save();
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    ctx.scale((o.flip ? -1 : 1) * s, s);
    ctx.strokeStyle = o.color || INK; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    var hip = { x: 0, y: -55 };
    var lean = o.lean || 0;
    var neck = { x: hip.x + Math.sin(lean) * 48, y: hip.y - Math.cos(lean) * 48 };
    function limb(from, ang, len, bend) {
      var mid = { x: from.x + Math.sin(ang) * len / 2, y: from.y + Math.cos(ang) * len / 2 };
      var end = { x: from.x + Math.sin(ang + (bend || 0)) * len, y: from.y + Math.cos(ang + (bend || 0) * 0.5) * len };
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.quadraticCurveTo(mid.x, mid.y, end.x, end.y); ctx.stroke();
    }
    limb(hip, o.legL != null ? o.legL : -0.25, 55);
    limb(hip, o.legR != null ? o.legR : 0.25, 55);
    ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(neck.x, neck.y); ctx.stroke();
    var sh = { x: lerp(hip.x, neck.x, 0.85), y: lerp(hip.y, neck.y, 0.85) };
    limb(sh, o.armL != null ? o.armL : -0.35, 44);
    limb(sh, o.armR != null ? o.armR : 0.35, 44);
    var head = { x: neck.x + Math.sin(lean) * 16, y: neck.y - 16 };
    circle(ctx, head.x, head.y, 16, '#fff', o.color || INK, 5);
    face(ctx, head.x, head.y, o.face || 'normal');
    if (o.hat === 'alien') { // 변장 더듬이
      ctx.strokeStyle = '#3fbf5f'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(head.x - 6, head.y - 14); ctx.lineTo(head.x - 12, head.y - 32); ctx.moveTo(head.x + 6, head.y - 14); ctx.lineTo(head.x + 12, head.y - 32); ctx.stroke();
      circle(ctx, head.x - 12, head.y - 34, 4, '#3fbf5f'); circle(ctx, head.x + 12, head.y - 34, 4, '#3fbf5f');
    }
    if (o.hat === 'chef') { rect(ctx, head.x - 12, head.y - 34, 24, 16, '#fff'); circle(ctx, head.x, head.y - 36, 13, '#fff', INK, 2); }
    if (o.hat === 'helmet') circle(ctx, head.x, head.y, 25, 'rgba(180,220,255,0.35)', '#cfe7ff', 3);
    ctx.restore();
  }
  function face(ctx, x, y, kind) {
    ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
    if (kind === 'sleep') {
      ctx.beginPath(); ctx.moveTo(x - 9, y - 2); ctx.lineTo(x - 2, y - 2); ctx.moveTo(x + 3, y - 2); ctx.lineTo(x + 10, y - 2); ctx.stroke();
      return;
    }
    if (kind === 'dizzy') {
      [-5, 6].forEach(function (dx) { ctx.beginPath(); ctx.moveTo(x + dx - 3, y - 5); ctx.lineTo(x + dx + 3, y + 1); ctx.moveTo(x + dx + 3, y - 5); ctx.lineTo(x + dx - 3, y + 1); ctx.stroke(); });
      return;
    }
    circle(ctx, x - 5, y - 3, kind === 'scared' ? 3.2 : 2.3, INK);
    circle(ctx, x + 6, y - 3, kind === 'scared' ? 3.2 : 2.3, INK);
    ctx.beginPath();
    if (kind === 'happy') ctx.arc(x + 1, y + 3, 6, 0.1 * Math.PI, 0.9 * Math.PI);
    else if (kind === 'scared') { ctx.arc(x + 1, y + 7, 4, 0, Math.PI * 2); }
    else if (kind === 'sad') ctx.arc(x + 1, y + 10, 5, 1.15 * Math.PI, 1.85 * Math.PI);
    else { ctx.moveTo(x - 3, y + 6); ctx.lineTo(x + 6, y + 6); }
    ctx.stroke();
  }

  // ---------- 외계인 ----------
  // o: { s, color, hat('chef'|'captain'|'guard'), mood('normal'|'happy'|'angry'|'fire'|'slip'), rot }
  function alien(ctx, x, y, o) {
    o = o || {};
    var s = o.s || 1, col = o.color || '#5fd35f';
    ctx.save(); ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot); ctx.scale(s, s);
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    // 다리·몸
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-8, -26); ctx.moveTo(10, 0); ctx.lineTo(8, -26); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, -45, 20, 26, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (o.hat === 'guard') { rect(ctx, -20, -48, 40, 8, '#3949ab'); }
    // 머리
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, -95, 30, 26, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-12, -118); ctx.lineTo(-20, -138); ctx.moveTo(12, -118); ctx.lineTo(20, -138); ctx.stroke();
    circle(ctx, -20, -140, 5, '#ffd60a', INK, 2); circle(ctx, 20, -140, 5, '#ffd60a', INK, 2);
    var mood = o.mood || 'normal';
    ctx.fillStyle = INK;
    ctx.beginPath(); ctx.ellipse(-12, -98, 8, 11, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(12, -98, 8, 11, 0.3, 0, Math.PI * 2); ctx.fill();
    circle(ctx, -10, -101, 2.5, '#fff'); circle(ctx, 14, -101, 2.5, '#fff');
    if (mood === 'angry') { ctx.beginPath(); ctx.moveTo(-22, -114); ctx.lineTo(-4, -106); ctx.moveTo(22, -114); ctx.lineTo(4, -106); ctx.stroke(); }
    ctx.beginPath();
    if (mood === 'happy') ctx.arc(0, -84, 7, 0.1 * Math.PI, 0.9 * Math.PI);
    else if (mood === 'fire' || mood === 'slip') ctx.arc(0, -80, 6, 0, Math.PI * 2);
    else { ctx.moveTo(-6, -80); ctx.lineTo(6, -80); }
    ctx.stroke();
    if (o.hat === 'chef') { rect(ctx, -16, -132, 32, 16, '#fff'); circle(ctx, 0, -134, 17, '#fff', INK, 2); }
    if (o.hat === 'captain') {
      ctx.fillStyle = '#1e3a8a'; ctx.beginPath(); ctx.ellipse(0, -118, 30, 9, 0, 0, Math.PI * 2); ctx.fill();
      rect(ctx, -20, -134, 40, 16, '#1e3a8a'); text(ctx, '★', 0, -126, 14, '#ffd60a');
    }
    if (mood === 'fire') { // 불 뿜기
      ctx.fillStyle = '#ff7b00'; ctx.beginPath(); ctx.moveTo(0, -80); ctx.quadraticCurveTo(40, -100, 80, -70); ctx.quadraticCurveTo(40, -60, 0, -80); ctx.fill();
      ctx.fillStyle = '#ffd60a'; ctx.beginPath(); ctx.moveTo(0, -80); ctx.quadraticCurveTo(30, -88, 55, -75); ctx.quadraticCurveTo(30, -70, 0, -80); ctx.fill();
    }
    ctx.restore();
  }
  function baby(ctx, x, y, t) { // 외계인 아기(문어 모양)
    var b = Math.sin(t * 4) * 3;
    ctx.save(); ctx.translate(x, y + b);
    ctx.strokeStyle = '#b04fd8'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (var i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 6, -10); ctx.quadraticCurveTo(i * 9, 0, i * 7 + Math.sin(t * 5 + i) * 3, 8); ctx.stroke(); }
    circle(ctx, 0, -22, 18, '#d17bf5', INK, 3);
    circle(ctx, -6, -24, 4, INK); circle(ctx, 6, -24, 4, INK);
    circle(ctx, -5, -25, 1.3, '#fff'); circle(ctx, 7, -25, 1.3, '#fff');
    ctx.restore();
  }
  function robot(ctx, x, y, t, o) {
    o = o || {};
    ctx.save(); ctx.translate(x, y); if (o.s) ctx.scale(o.s, o.s);
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    circle(ctx, 0, -12, 12, '#555', INK, 3);
    ctx.fillStyle = '#c7ced8'; ctx.fillRect(-28, -86, 56, 64); ctx.strokeRect(-28, -86, 56, 64);
    ctx.fillStyle = '#9aa5b5'; ctx.fillRect(-22, -126, 44, 36); ctx.strokeRect(-22, -126, 44, 36);
    var scan = Math.sin(t * 3) * 12;
    rect(ctx, -18, -112, 36, 8, '#300');
    circle(ctx, scan, -108, 5, '#ff3030');
    ctx.beginPath(); ctx.moveTo(0, -126); ctx.lineTo(0, -140); ctx.stroke(); circle(ctx, 0, -143, 4, (Math.floor(t * 4) % 2) ? '#ff3030' : '#ffb3b3');
    if (o.dance) {
      ctx.beginPath(); ctx.moveTo(-28, -76); ctx.lineTo(-50, -100 + Math.sin(t * 10) * 15); ctx.moveTo(28, -76); ctx.lineTo(50, -100 - Math.sin(t * 10) * 15); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(-28, -76); ctx.lineTo(-40, -40); ctx.moveTo(28, -76); ctx.lineTo(40, -40); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- 배경 ----------
  function metalRoom(ctx, wall, floor) {
    rect(ctx, 0, 0, W, H, wall || '#5b6478');
    for (var x = 0; x < W; x += 100) { ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 360); ctx.stroke(); }
    rect(ctx, 0, 360, W, 90, floor || '#3c4252');
    rect(ctx, 0, 356, W, 6, '#2b303c');
  }
  function cellBg(ctx) {
    metalRoom(ctx);
    ctx.save(); ctx.beginPath(); ctx.rect(520, 70, 200, 140); ctx.clip(); rect(ctx, 520, 70, 200, 140, '#05051a'); stars(ctx, 3, 200); earth(ctx, 640, 150, 40); ctx.restore();
    ctx.strokeStyle = '#2b303c'; ctx.lineWidth = 8; ctx.strokeRect(520, 70, 200, 140);
  }
  function bars(ctx) {
    ctx.strokeStyle = '#9aa3b5'; ctx.lineWidth = 10;
    for (var x = 30; x < 420; x += 45) { ctx.beginPath(); ctx.moveTo(x, 20); ctx.lineTo(x, 380); ctx.stroke(); }
    rect(ctx, 20, 20, 410, 12, '#9aa3b5'); rect(ctx, 20, 368, 410, 12, '#9aa3b5');
  }
  function hallBg(ctx) {
    metalRoom(ctx, '#4b5568', '#323847');
    for (var i = 0; i < 5; i++) { rect(ctx, 60 + i * 160, 30, 80, 12, '#fff7c2'); }
    rect(ctx, 640, 150, 110, 210, '#2b303c'); rect(ctx, 650, 160, 90, 200, '#3a4150');
  }
  function controlBg(ctx) {
    rect(ctx, 0, 0, W, H, '#2a2f45');
    ctx.save(); ctx.beginPath(); ctx.ellipse(400, 120, 340, 110, 0, 0, Math.PI * 2); ctx.clip();
    rect(ctx, 0, 0, W, H, '#05051a'); stars(ctx, 11, 120); earth(ctx, 560, 130, 50); ctx.restore();
    ctx.strokeStyle = '#151827'; ctx.lineWidth = 10; ctx.beginPath(); ctx.ellipse(400, 120, 340, 110, 0, 0, Math.PI * 2); ctx.stroke();
    rect(ctx, 0, 270, W, 180, '#3c4252');
    ctx.fillStyle = '#4c556b'; ctx.beginPath(); ctx.moveTo(80, 300); ctx.lineTo(720, 300); ctx.lineTo(760, 360); ctx.lineTo(40, 360); ctx.fill();
  }
  function panelButtons(ctx, t, pressed) {
    circle(ctx, 200, 325, 22, pressed === 'red' ? '#7a0000' : '#e53935', INK, 3);
    text(ctx, '누르지 마시오', 200, 290, 12, '#ffd60a');
    circle(ctx, 320, 328, 18, pressed === 'green' ? '#1b5e20' : '#43a047', INK, 3);
    for (var i = 0; i < 6; i++) circle(ctx, 430 + i * 30, 330, 7, ['#ffd60a', '#29b6f6', '#ab47bc'][i % 3], (Math.floor(t * 3 + i) % 2) ? '#fff' : INK, 2);
    rect(ctx, 610, 300, 8, 30, '#222'); circle(ctx, 614, 298, 10, '#e53935', INK, 2);
  }
  function kitchenBg(ctx) {
    rect(ctx, 0, 0, W, H, '#f4e8d0');
    for (var x = 0; x < W; x += 40) for (var y = 0; y < 280; y += 40) if ((x + y) / 40 % 2) rect(ctx, x, y, 40, 40, '#ecdcbc');
    rect(ctx, 0, 280, W, 170, '#a0785a');
    rect(ctx, 480, 220, 260, 80, '#7d8590'); rect(ctx, 500, 205, 60, 20, '#555'); rect(ctx, 640, 205, 60, 20, '#555');
  }
  function podBg(ctx, open) {
    metalRoom(ctx, '#45506a', '#2f3546');
    for (var i = 0; i < 3; i++) {
      var x = 120 + i * 230;
      ctx.fillStyle = '#d5dbe6'; ctx.beginPath(); ctx.ellipse(x, 250, 60, 90, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
      circle(ctx, x, 220, 28, open ? '#05051a' : '#7fb7e6', INK, 3);
    }
  }
  function spaceBg(ctx, seed) {
    rect(ctx, 0, 0, W, H, '#05051a'); stars(ctx, seed || 5, 160);
  }
  function homeBg(ctx) {
    var sky = ctx.createLinearGradient(0, 0, 0, 320); sky.addColorStop(0, '#7cc8ff'); sky.addColorStop(1, '#d9f1ff');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    rect(ctx, 0, 330, W, 120, '#6cc04a');
    rect(ctx, 520, 180, 200, 150, '#ffe0b2'); ctx.fillStyle = '#d84315'; ctx.beginPath(); ctx.moveTo(500, 185); ctx.lineTo(620, 100); ctx.lineTo(740, 185); ctx.fill();
    rect(ctx, 600, 250, 40, 80, '#8d6e63'); rect(ctx, 545, 210, 40, 35, '#bbdefb'); rect(ctx, 655, 210, 40, 35, '#bbdefb');
  }
  function failStamp(ctx, t) { // 실패 장면 공통 "FAIL" 도장
    var v = ease((t - 1.2) / 0.3);
    if (v <= 0) return;
    ctx.save(); ctx.translate(640, 70); ctx.rotate(-0.2); ctx.scale(2 - v, 2 - v); ctx.globalAlpha = v;
    ctx.strokeStyle = '#e53935'; ctx.lineWidth = 5; ctx.strokeRect(-80, -28, 160, 56);
    text(ctx, '실패!', 0, 2, 34, '#e53935');
    ctx.restore();
  }

  // ---------- 장면들 ----------
  var ART = {
    cell: function (ctx, t) {
      cellBg(ctx);
      stick(ctx, 250, 380, { face: 'scared', armL: -0.6 + Math.sin(t * 2) * 0.1, armR: 0.6, flip: false });
      bars(ctx);
      alien(ctx, 540, 400, { hat: 'guard', s: 1.1 });
      bubble(ctx, '조용히 해라, 지구인!', 560, 220, 16);
    },
    f_spoon: function (ctx, t) {
      var v = ease(t / 1.2);
      rect(ctx, 0, 0, W, H, '#b9e6f5');
      for (var x = 0; x < W; x += 50) for (var y = 0; y < 300; y += 50) { ctx.strokeStyle = '#9fd3e4'; ctx.lineWidth = 2; ctx.strokeRect(x, y, 50, 50); }
      rect(ctx, 0, 0, W, 40, '#3c4252'); circle(ctx, 300, 40, 30, '#05051a');
      rect(ctx, 0, 330, W, 120, '#dfe8ee');
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(560, 320, 60, 24, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
      rect(ctx, 520, 240, 80, 70, '#fff'); ctx.strokeRect(520, 240, 80, 70);
      alien(ctx, 560, 320, { mood: 'angry', s: 0.9 });
      stick(ctx, 300, lerp(40, 330, v), { face: 'scared', armL: -2.6, armR: 2.6, rot: v < 1 ? t * 6 : 0 });
      text(ctx, '🥄', 340, lerp(60, 300, v), 30);
      if (v >= 1) bubble(ctx, '노크 좀 하지?!', 600, 170, 18);
      failStamp(ctx, t);
    },
    f_phone: function (ctx, t) {
      cellBg(ctx);
      stick(ctx, 250, 380, { face: 'sad', armR: 2.5, armL: -0.3 });
      rect(ctx, 270, 230, 16, 26, INK);
      bars(ctx);
      bubble(ctx, '숙제는 다 하고 갇힌 거니?', 300, 160, 18);
      if (t > 0.8) text(ctx, '📄 통화 요금: 9,999,999원', 600, 300, 20, '#ffd60a');
      failStamp(ctx, t);
    },
    f_sleep: function (ctx, t) {
      rect(ctx, 0, 0, W, H, '#cfe8c7'); rect(ctx, 0, 340, W, 110, '#9ccc65');
      ctx.strokeStyle = '#6d4c41'; ctx.lineWidth = 6; ctx.strokeRect(200, 120, 300, 230);
      text(ctx, '지구 생물 (먹이 주지 마세요)', 350, 100, 18);
      stick(ctx, 350, 340, { face: 'sleep', rot: -Math.PI / 2 + 0.05, s: 0.9 });
      text(ctx, 'Z', 380 + Math.sin(t * 2) * 5, 250 - (t * 20 % 40), 26, '#555');
      [100, 610, 690].forEach(function (x, i) { alien(ctx, x, 420, { s: 0.8, mood: 'happy', color: ['#5fd35f', '#7ed6df', '#f6b93b'][i] }); });
      failStamp(ctx, t);
    },
    hall: function (ctx, t) {
      hallBg(ctx);
      var rx = lerp(820, 560, ease(t / 3));
      text(ctx, '📦', 320, 330, 60);
      stick(ctx, 200, 380, { face: 'scared', lean: 0.15, legL: -0.6, legR: 0.6, armL: -0.9, armR: 0.9 });
      robot(ctx, rx, 380, t);
      text(ctx, '🍌', 90, 370, 28);
      alien(ctx, 60, 420, { hat: 'guard', s: 0.7, rot: -1.4, mood: 'slip' });
    },
    f_freeze: function (ctx, t) {
      hallBg(ctx);
      stick(ctx, 250, 380, { face: 'scared', armL: -2.8, armR: 2.8, color: '#5aa9e6' });
      ctx.fillStyle = 'rgba(180,220,255,0.45)'; ctx.fillRect(195, 200, 110, 185);
      robot(ctx, 420, 380, t);
      bubble(ctx, '…땡은 없음.', 440, 200, 18);
      failStamp(ctx, t);
    },
    f_run: function (ctx, t) {
      hallBg(ctx);
      var p = t * 260;
      var sx = 100 + Math.min(p, 380), rx = -50 + Math.min(t * 520, 520);
      var k = Math.sin(t * 18);
      stick(ctx, sx, 380, { face: 'scared', lean: 0.3, legL: -0.8 * k, legR: 0.8 * k, armL: 0.9 * k, armR: -0.9 * k });
      robot(ctx, rx, 380, t);
      if (t > 1) text(ctx, '시속 200km', rx, 210, 18, '#ffd60a');
      failStamp(ctx, t);
    },
    f_dance: function (ctx, t) {
      hallBg(ctx);
      var k = Math.sin(t * 8);
      stick(ctx, 280, 380, { face: 'happy', armL: -2.4 * k, armR: 2.4 * k, legL: -0.4 + 0.3 * k, legR: 0.4 + 0.3 * k, lean: 0.15 * k });
      robot(ctx, 470, 380, t, { dance: true });
      for (var i = 0; i < 8; i++) alien(ctx, 40 + i * 105, 470, { s: 0.55, hat: 'guard', mood: 'angry' });
      text(ctx, '🎵', 380, 160 + Math.sin(t * 5) * 10, 34);
      failStamp(ctx, t);
    },
    control: function (ctx, t) {
      controlBg(ctx);
      panelButtons(ctx, t);
      stick(ctx, 400, 440, { face: 'normal', armR: 1.2 + Math.sin(t * 2) * 0.1, armL: -0.3 });
    },
    f_red: function (ctx, t) {
      controlBg(ctx);
      panelButtons(ctx, t, 'red');
      if (t < 1.1) {
        rect(ctx, 0, 0, W, H, 'rgba(255,0,0,' + (0.15 + 0.15 * Math.sin(t * 20)) + ')');
        text(ctx, '자폭까지 ' + Math.max(1, 3 - Math.floor(t / 0.37)), 400, 200, 44, '#fff');
        stick(ctx, 400, 440, { face: 'scared', armL: -2.7, armR: 2.7 });
      } else {
        var v = ease((t - 1.1) / 0.4);
        circle(ctx, 400, 250, 60 + v * 600, '#ffb300');
        circle(ctx, 400, 250, 30 + v * 400, '#fff3c4');
        text(ctx, '펑!', 400, 230, 80, '#d84315');
        stick(ctx, 400 + v * 200, 440 - v * 300, { face: 'dizzy', rot: v * 8, s: 1 - v * 0.5 });
      }
      failStamp(ctx, t);
    },
    pilot: function (ctx, t) {
      spaceBg(ctx, 21);
      earth(ctx, 650, 300, 70);
      var r = lerp(30, 160, ease(t / 1.5));
      circle(ctx, 400, 200, r, '#8d6e63', INK, 3);
      circle(ctx, 400 - r * 0.3, 200 - r * 0.2, r * 0.2, '#6d4c41');
      circle(ctx, 400 + r * 0.35, 200 + r * 0.25, r * 0.15, '#6d4c41');
      rect(ctx, 0, 330, W, 120, '#2a2f45');
      ctx.strokeStyle = '#151827'; ctx.lineWidth = 12; ctx.strokeRect(6, 6, W - 12, 320);
      stick(ctx, 400, 470, { face: 'scared', armL: 1.3, armR: 1.3 });
    },
    f_rock: function (ctx, t) {
      spaceBg(ctx, 21);
      var v = ease(t / 0.6);
      ctx.save(); ctx.translate(400, 230); ctx.scale(1, lerp(1, 0.2, v));
      ctx.fillStyle = '#b0bec5'; ctx.beginPath(); ctx.ellipse(0, 0, 160, 60, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
      circle(ctx, 400, 140 + v * 30, 70, '#8d6e63', INK, 3);
      if (v >= 1) text(ctx, '🥞 우주 호떡 완성', 400, 340, 26, '#ffd60a');
      failStamp(ctx, t);
    },
    f_moon: function (ctx, t) {
      spaceBg(ctx, 9);
      circle(ctx, 400, 520, 300, '#e0e0e0', INK, 3);
      circle(ctx, 300, 300, 30, '#bdbdbd'); circle(ctx, 520, 320, 22, '#bdbdbd');
      var v = ease(t / 0.8);
      ctx.save(); ctx.translate(400, lerp(-100, 230, v)); ctx.rotate(0.5);
      ctx.fillStyle = '#b0bec5'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-40, -150); ctx.lineTo(40, -150); ctx.closePath(); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
      if (v >= 1) { text(ctx, '🚩', 470, 150, 40); bubble(ctx, '달에 꽂혔다…', 300, 140, 18); }
      failStamp(ctx, t);
    },
    pods: function (ctx, t) {
      podBg(ctx, false);
      if (Math.floor(t * 3) % 2) rect(ctx, 0, 0, W, H, 'rgba(255,0,0,0.12)');
      stick(ctx, 350, 400, { face: 'normal', armR: 1.1, armL: -0.3 });
      baby(ctx, 720, 400, t);
      text(ctx, '🚨 경보 🚨', 400, 40, 24, '#ffd60a');
    },
    launch: function (ctx, t) {
      podBg(ctx, true);
      var v = ease(t / 1.5);
      stick(ctx, 350, 330, { s: 0.6, face: 'scared', armR: 1.4 });
      rect(ctx, 290, 330 - 120 * (1 - v), 120, 120 * (1 - v) + 4, 'rgba(0,0,0,0)');
      ctx.fillStyle = '#9aa3b5'; ctx.fillRect(290, 150, 120 * v, 190); ctx.strokeStyle = INK; ctx.strokeRect(290, 150, 120 * v, 190);
      text(ctx, '문 닫히는 중…', 400, 60, 26, '#ffd60a');
    },
    f_door: function (ctx, t) {
      spaceBg(ctx, 4);
      var x = lerp(100, 700, ease(t / 1.6));
      ctx.fillStyle = '#d5dbe6'; ctx.beginPath(); ctx.ellipse(x, 220, 80, 45, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
      stick(ctx, x - 70, 300, { s: 0.7, face: 'scared', rot: -1.3, armL: 3, armR: 2.6, legL: -0.2 + Math.sin(t * 15) * 0.3, legR: 0.2 - Math.sin(t * 15) * 0.3 });
      failStamp(ctx, t);
    },
    f_float: function (ctx, t) {
      spaceBg(ctx, 13);
      earth(ctx, 650, 350, 60);
      stick(ctx, 380 + Math.sin(t) * 30, 300 + Math.cos(t * 0.8) * 20, { hat: 'helmet', face: 'sad', rot: t * 0.8, armL: -1.5, armR: 1.5, legL: -0.6, legR: 0.6 });
      if (t > 0.8) bubble(ctx, '바닥은 어디…?', 250, 120, 18);
      failStamp(ctx, t);
    },
    kitchen: function (ctx, t) {
      kitchenBg(ctx);
      stick(ctx, 300, 420, { hat: 'alien', face: 'scared', armL: -0.4, armR: 0.4 });
      alien(ctx, 470, 420, { hat: 'chef', mood: 'happy', s: 1.1 });
      bubble(ctx, '새로 온 요리사지?', 480, 230, 18);
      ctx.strokeStyle = '#ccc'; ctx.lineWidth = 3;
      for (var i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(530 + i * 20, 200); ctx.quadraticCurveTo(540 + i * 20 + Math.sin(t * 3 + i) * 8, 170, 530 + i * 20, 140); ctx.stroke(); }
    },
    f_truth: function (ctx, t) {
      kitchenBg(ctx);
      stick(ctx, 300, 420, { face: 'happy', armR: 2.4 });
      text(ctx, '👽', 260, lerp(240, 400, ease(t / 0.6)), 34);
      alien(ctx, 470, 420, { hat: 'chef', mood: 'angry', s: 1.1 });
      alien(ctx, 640, 420, { hat: 'guard', mood: 'angry' });
      bubble(ctx, '침입자다!', 640, 240, 20);
      failStamp(ctx, t);
    },
    f_spicy: function (ctx, t) {
      kitchenBg(ctx);
      if (t > 0.6) { for (var i = 0; i < 6; i++) text(ctx, '🔥', 100 + i * 120, 300 + Math.sin(t * 6 + i) * 10, 40); }
      alien(ctx, 260, 420, { mood: t > 0.4 ? 'fire' : 'happy' });
      alien(ctx, 430, 420, { mood: t > 0.5 ? 'fire' : 'happy', color: '#7ed6df' });
      stick(ctx, 640, 420, { hat: 'alien', face: 'scared', armL: -2.5, armR: 2.5 });
      text(ctx, '🌶️', 340, 330, 30);
      failStamp(ctx, t);
    },
    captain: function (ctx, t) {
      kitchenBg(ctx);
      text(ctx, '🍜', 400, 300, 50);
      stick(ctx, 250, 420, { hat: 'chef', face: 'happy', armR: 1.2 });
      alien(ctx, 560, 420, { hat: 'captain', mood: 'happy', s: 1.2 });
      if (t > 0.5) bubble(ctx, '우주 최고야!', 570, 220, 20);
    },
    f_fart: function (ctx, t) {
      kitchenBg(ctx);
      stick(ctx, 280, 420, { hat: 'chef', face: 'happy', lean: -0.2 });
      ctx.fillStyle = 'rgba(160,190,80,' + clamp01(t) * 0.6 + ')';
      circle(ctx, 210 - t * 30, 360, 20 + t * 30, ctx.fillStyle);
      alien(ctx, 560, 420, { hat: 'captain', mood: 'angry', s: 1.2 });
      if (t > 0.6) bubble(ctx, '선전포고냐?!', 570, 220, 20);
      failStamp(ctx, t);
    },
    e_hero: function (ctx, t) {
      homeBg(ctx);
      rect(ctx, 0, 330, 480, 120, '#c8a26b'); text(ctx, '학교 운동장', 200, 420, 18, '#5d4037');
      var v = ease(t / 1.2);
      ctx.save(); ctx.translate(250, lerp(-120, 300, v));
      ctx.fillStyle = '#b0bec5'; ctx.beginPath(); ctx.ellipse(0, 0, 150, 40, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
      circle(ctx, 0, -25, 45, 'rgba(160,210,255,0.8)', INK, 3);
      ctx.restore();
      if (v >= 1) { stick(ctx, 450, 400, { face: 'happy', armL: -2.6, armR: 2.6 }); text(ctx, '📸', 600, 300, 34); text(ctx, '📸', 680, 360, 30); }
    },
    e_pod: function (ctx, t) {
      homeBg(ctx);
      var v = ease(t / 1);
      ctx.fillStyle = '#d5dbe6'; ctx.beginPath(); ctx.ellipse(300, lerp(-80, 320, v), 60, 80, 0.2, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
      if (v >= 1) {
        stick(ctx, 400, 400, { face: 'happy', armR: 2.6 });
        stick(ctx, 600, 400, { face: 'normal', color: '#c2185b', armL: -1.2 });
        bubble(ctx, '숙제는 했니?', 610, 230, 18);
      }
    },
    e_vacation: function (ctx, t) {
      controlBg(ctx);
      panelButtons(ctx, t);
      text(ctx, '📢', 250, 230, 40);
      stick(ctx, 330, 440, { face: 'happy', armR: 2.2 });
      for (var i = 0; i < 5; i++) {
        var x = 500 + i * 70 + t * 160;
        if (x < W + 60) { alien(ctx, x, 440, { s: 0.6, mood: 'happy', color: ['#5fd35f', '#7ed6df', '#f6b93b', '#ff7979', '#badc58'][i] }); text(ctx, '🧳', x + 25, 420, 20); }
      }
      if (t > 0.6) bubble(ctx, '모두 한 달 휴가!', 330, 200, 20);
    },
    e_friend: function (ctx, t) {
      homeBg(ctx);
      stick(ctx, 330, 420, { face: 'happy', armR: 1.6 });
      baby(ctx, 420, 360, t);
      text(ctx, '💜', 380, 260 - (t * 30 % 60), 30);
      if (t > 1) { ctx.fillStyle = '#b0bec5'; ctx.beginPath(); ctx.ellipse(650, 80, 90, 25, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke(); }
    },
    e_home: function (ctx, t) {
      homeBg(ctx);
      ctx.fillStyle = '#b0bec5'; ctx.beginPath(); ctx.ellipse(250, 120 + Math.sin(t * 2) * 6, 170, 45, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
      stick(ctx, 400, 420, { face: 'happy', armL: -2.2 });
      text(ctx, '📦🍜 x100', 250, 400, 26);
      if (t > 0.6) bubble(ctx, '매주 라면 100개!', 250, 330, 18);
    },
    e_ramen: function (ctx, t) {
      rect(ctx, 0, 0, W, H, '#05051a'); stars(ctx, 17, 120);
      rect(ctx, 220, 140, 360, 230, '#ffcc80'); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(220, 140, 360, 230);
      rect(ctx, 200, 110, 400, 50, '#d84315'); text(ctx, '막대 라면 1호점', 400, 135, 26, '#fff');
      stick(ctx, 400, 360, { hat: 'chef', face: 'happy', armL: -1.4, armR: 1.4 });
      for (var i = 0; i < 4; i++) alien(ctx, 640 + i * 50, 440, { s: 0.5, mood: 'happy', color: ['#5fd35f', '#7ed6df', '#f6b93b', '#ff7979'][i] });
      text(ctx, '🍜', 330, 300 + Math.sin(t * 3) * 4, 30); text(ctx, '⭐⭐⭐⭐⭐', 400, 400, 22);
    }
  };

  // ---------- 그림 설명표로 그리는 장면(2026-10-27 선택지 늘리기) ----------
  // 새 배경
  function cargoBg(ctx) {
    metalRoom(ctx, '#5a5048', '#3d362f');
    [[60, 250, 120, 110, '#c58b4e'], [200, 280, 90, 80, '#b0743c'], [600, 230, 140, 130, '#c58b4e'], [640, 150, 90, 80, '#d39a5c'], [470, 300, 80, 60, '#a86b35']].forEach(function (b) {
      rect(ctx, b[0], b[1], b[2], b[3], b[4]); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(b[0], b[1], b[2], b[3]);
      ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0] + b[2], b[1] + b[3]); ctx.moveTo(b[0] + b[2], b[1]); ctx.lineTo(b[0], b[1] + b[3]); ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.stroke();
    });
  }
  function ventBg(ctx) {
    rect(ctx, 0, 0, W, H, '#6d7486');
    ctx.fillStyle = '#4a5061'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(160, 90); ctx.lineTo(640, 90); ctx.lineTo(W, 0); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(160, 360); ctx.lineTo(640, 360); ctx.lineTo(W, H); ctx.fill();
    rect(ctx, 160, 90, 480, 270, '#2b2f3a');
    for (var i = 0; i < 12; i++) circle(ctx, 60 + i * 62, 420 - (i % 3) * 8, 6, 'rgba(200,200,200,0.35)');
  }
  function gardenBg(ctx) {
    var sky = ctx.createLinearGradient(0, 0, 0, 330); sky.addColorStop(0, '#2b1055'); sky.addColorStop(1, '#7597de');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    rect(ctx, 0, 340, W, 110, '#3d9970');
    [[90, '#ff6bd6'], [210, '#7cf5ff'], [560, '#ffe066'], [700, '#b388ff']].forEach(function (pl, i) {
      ctx.strokeStyle = '#2e7d32'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(pl[0], 345); ctx.quadraticCurveTo(pl[0] + 20, 260, pl[0] - 5, 200 + i * 15); ctx.stroke();
      circle(ctx, pl[0] - 5, 195 + i * 15, 26, pl[1], INK, 3);
    });
  }
  function engineBg(ctx, t) {
    metalRoom(ctx, '#3b3f52', '#262a38');
    for (var i = 0; i < 4; i++) rect(ctx, 0, 60 + i * 50, W, 14, '#59607a');
    var glow = 0.6 + Math.sin(t * 6) * 0.2;
    circle(ctx, 610, 230, 95, 'rgba(0,229,255,' + (glow * 0.35) + ')');
    circle(ctx, 610, 230, 60, '#00e5ff', INK, 4);
    circle(ctx, 610, 230, 30, '#e0ffff');
  }
  function warpBg(ctx, t) {
    rect(ctx, 0, 0, W, H, '#05051a');
    for (var i = 0; i < 60; i++) {
      var a = i * 2.4, d = ((t * 300 + i * 37) % 450);
      ctx.strokeStyle = 'rgba(160,220,255,' + (d / 450) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(400 + Math.cos(a) * d, 225 + Math.sin(a) * d * 0.6); ctx.lineTo(400 + Math.cos(a) * (d + 30), 225 + Math.sin(a) * (d + 30) * 0.6); ctx.stroke();
    }
  }
  function candyBg(ctx) {
    var sky = ctx.createLinearGradient(0, 0, 0, 330); sky.addColorStop(0, '#ffc4e1'); sky.addColorStop(1, '#fff0f6');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#6d3b1f'; ctx.beginPath(); ctx.moveTo(0, 340); ctx.lineTo(180, 180); ctx.lineTo(360, 340); ctx.fill();
    ctx.fillStyle = '#8b4c26'; ctx.beginPath(); ctx.moveTo(300, 340); ctx.lineTo(520, 150); ctx.lineTo(760, 340); ctx.fill();
    rect(ctx, 0, 340, W, 110, '#ff8fab');
  }
  function bedroomBg(ctx) {
    rect(ctx, 0, 0, W, H, '#ffe8cc');
    rect(ctx, 0, 340, W, 110, '#c08457');
    rect(ctx, 500, 260, 260, 90, '#4dabf7'); rect(ctx, 500, 240, 70, 30, '#fff');
    rect(ctx, 90, 70, 160, 120, '#bde0fe'); ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.strokeRect(90, 70, 160, 120);
  }
  var BG = {
    cell: cellBg, hall: hallBg, kitchen: kitchenBg, cargo: cargoBg, vent: ventBg, garden: gardenBg, candy: candyBg, bedroom: bedroomBg, home: homeBg,
    control: function (ctx, t) { controlBg(ctx); panelButtons(ctx, t); },
    pod: function (ctx) { podBg(ctx, false); },
    space: function (ctx) { spaceBg(ctx, 9); earth(ctx, 650, 120, 45); },
    engine: engineBg, warp: warpBg,
    dark: function (ctx) { rect(ctx, 0, 0, W, H, '#07070c'); }
  };

  // 설명표 한 줄 = { bg 배경, who 상대('alien'|'guard'|'robot'|'baby'|'captain'), mood 상대 표정,
  //   face 막대맨 표정, fx 막대맨 움직임(bounce·spin·fall·shake·float·grow·tiny·run·fly·hide), hat,
  //   big 큰 그림 글자(이모지), bigFx('drop'|'wobble'|'spin'|'grow'|'rain'), say 말풍선, sayWho('me'|'them') }
  var GAGS = {
    // 선택 장면
    cargo: { bg: 'cargo', face: 'normal', fx: 'look', big: '📦', bigX: 450, bigY: 330, say: '이 상자들은 뭐지?', sayWho: 'me' },
    bike: { bg: 'cargo', face: 'scared', fx: 'bike', big: '🛵', bigFx: 'shake', say: '문이 닫힌다!', sayWho: 'me' },
    vent: { bg: 'vent', face: 'normal', fx: 'crawl', big: '🕸️', bigX: 600, bigY: 140, say: '먼지가 너무 많아…', sayWho: 'me' },
    garden: { bg: 'garden', face: 'happy', fx: 'look', big: '✨', bigFx: 'wobble', say: '우와, 반짝반짝!', sayWho: 'me' },
    engine: { bg: 'engine', face: 'scared', fx: 'look', big: '⚙️', bigX: 250, bigY: 150, bigFx: 'spin', say: '부우우웅…', sayWho: 'me' },
    warp: { bg: 'warp', face: 'scared', fx: 'float', big: '🌀', bigFx: 'spin', say: '어디로 갈까?', sayWho: 'me' },
    // 실패 장면
    f_song: { bg: 'cell', who: 'guard', mood: 'happy', face: 'sad', fx: 'float', big: '😭', bigFx: 'wobble', rain: '💧', say: '흐어엉… 너무 슬퍼!', sayWho: 'them', fail: true },
    f_pizza: { bg: 'cell', face: 'sad', fx: 'look', big: '🍕', bigFx: 'wobble', say: '1000년 뒤 도착 예정', sayWho: 'me', fail: true },
    f_mummy: { bg: 'cell', who: 'guard', mood: 'happy', face: 'sleep', fx: 'stiff', big: '🧻', bigFx: 'spin', say: '한 칸 더 감아 줄게~', sayWho: 'them', fail: true },
    f_mop: { bg: 'hall', who: 'robot', face: 'sad', fx: 'shake', big: '🧹', bigFx: 'wobble', say: '화장실 342개 청소!', sayWho: 'them', fail: true },
    f_banana2: { bg: 'hall', who: 'robot', face: 'dizzy', fx: 'fall', big: '🍌', bigFx: 'spin', fail: true },
    f_radio: { bg: 'control', face: 'dizzy', fx: 'bounce', big: '🎶', bigFx: 'wobble', rain: '🎵', say: '♪ 우주 최고 아이돌 ♪', sayWho: 'me', fail: true },
    f_donut: { bg: 'control', who: 'captain', mood: 'angry', face: 'scared', fx: 'shake', big: '🍩', say: '내… 도넛…', sayWho: 'them', fail: true },
    f_gravity: { bg: 'control', face: 'dizzy', fx: 'float', big: '🫧', rain: '🫧', fail: true },
    f_search: { bg: 'control', who: 'guard', mood: 'angry', face: 'scared', fx: 'look', big: '🔍', bigFx: 'wobble', say: '혹시 지구 과자를 찾으셨나요?', sayWho: 'me', fail: true },
    f_up: { bg: 'space', face: 'scared', fx: 'look', big: '🚓', bigFx: 'grow', say: '면허증 보여 주세요', sayWho: 'me', fail: true },
    f_down: { bg: 'space', face: 'dizzy', fx: 'stretch', big: '🕳️', bigFx: 'spin', fail: true },
    f_snack: { bg: 'pod', face: 'happy', fx: 'grow', big: '🍔', rain: '🍟', say: '꺼억~', sayWho: 'me', fail: true },
    f_pet: { bg: 'pod', face: 'scared', fx: 'shake', big: '🐶', bigFx: 'wobble', say: '멍멍! (냠냠)', sayWho: 'me', fail: true },
    f_selfie: { bg: 'pod', who: 'guard', mood: 'happy', face: 'happy', fx: 'look', big: '📸', bigFx: 'grow', say: '브이~', sayWho: 'them', fail: true, flash: true },
    f_egg: { bg: 'kitchen', face: 'scared', fx: 'run', big: '🦖', bigFx: 'grow', say: '내 알 어디 갔어!', sayWho: 'me', fail: true, hat: 'chef' },
    f_bingsu: { bg: 'kitchen', who: 'alien', mood: 'slip', face: 'scared', fx: 'look', big: '🍧', bigFx: 'wobble', rain: '❄️', say: '머리가 띵!', sayWho: 'them', fail: true, hat: 'chef' },
    f_cake: { bg: 'kitchen', face: 'dizzy', fx: 'fall', big: '🧁', bigFx: 'grow', rain: '🍦', fail: true, hat: 'chef' },
    f_karaoke: { bg: 'kitchen', who: 'alien', mood: 'happy', face: 'happy', fx: 'bounce', big: '🎤', rain: '⭐', say: '앵콜! 앵콜!', sayWho: 'them', fail: true },
    f_trash: { bg: 'space', face: 'sad', fx: 'float', big: '🗑️', bigFx: 'spin', rain: '🍌', fail: true },
    f_photo: { bg: 'kitchen', who: 'captain', mood: 'slip', face: 'scared', fx: 'look', big: '📸', fail: true, flash: true },
    f_jelly: { bg: 'cargo', face: 'happy', fx: 'jelly', big: '🍮', bigFx: 'wobble', fail: true },
    f_dino: { bg: 'cargo', face: 'scared', fx: 'shake', big: '🦕', bigFx: 'grow', say: '하아아암~', sayWho: 'me', fail: true },
    f_freezer: { bg: 'cargo', face: 'sad', fx: 'stiff', big: '🧊', rain: '❄️', fail: true, tint: 'rgba(160,220,255,0.35)' },
    f_closed: { bg: 'cargo', face: 'dizzy', fx: 'squash', big: '🚪', fail: true },
    f_brake: { bg: 'cargo', face: 'scared', fx: 'fly', big: '🛵', bigX: 250, bigY: 330, fail: true },
    f_horn: { bg: 'cargo', who: 'guard', mood: 'happy', face: 'scared', fx: 'look', big: '📯', bigFx: 'wobble', say: '경비병 모여라!', sayWho: 'them', fail: true },
    f_fan: { bg: 'vent', face: 'dizzy', fx: 'spin', big: '🌀', bigFx: 'spin', fail: true },
    f_sneeze: { bg: 'vent', face: 'scared', fx: 'shake', big: '🤧', bigFx: 'grow', say: '에취이이이!', sayWho: 'me', fail: true },
    f_mouse: { bg: 'vent', face: 'happy', fx: 'bounce', big: '🐭', rain: '🧀', say: '이장님 만세!', sayWho: 'me', fail: true },
    f_flower: { bg: 'garden', face: 'scared', fx: 'shake', big: '🌸', bigFx: 'grow', rain: '🎶', say: '꺄아아악!', sayWho: 'me', fail: true },
    f_mushroom: { bg: 'garden', face: 'dizzy', fx: 'balloon', big: '🍄', fail: true },
    f_water: { bg: 'garden', who: 'giant', face: 'scared', fx: 'look', big: '💦', rain: '💧', fail: true },
    f_pot: { bg: 'garden', face: 'happy', fx: 'sprout', big: '🪴', fail: true },
    f_wrench: { bg: 'engine', face: 'happy', fx: 'look', big: '🔧', bigFx: 'spin', say: '어? 반대 방향인데?', sayWho: 'me', fail: true },
    f_dark: { bg: 'dark', face: 'scared', fx: 'look', big: '🖐️', bigFx: 'wobble', say: '안녕?', sayWho: 'me', fail: true, eyes: true },
    f_cola: { bg: 'engine', face: 'dizzy', fx: 'shake', big: '🥤', rain: '🫧', say: '꺼어억!', sayWho: 'me', fail: true },
    f_hamster: { bg: 'engine', face: 'sad', fx: 'run', big: '🐹', bigX: 640, bigY: 150, say: '하루에 3만 바퀴…', sayWho: 'me', fail: true },
    f_dino_age: { bg: 'home', face: 'scared', fx: 'run', big: '🦖', bigFx: 'grow', rain: '🌋', fail: true },
    // 엔딩
    e_parcel: { bg: 'home', face: 'happy', fx: 'pop', big: '📦', bigX: 330, bigY: 330, say: '착불입니다~', sayWho: 'me' },
    e_bike: { bg: 'space', face: 'happy', fx: 'bike', big: '🛵', rain: '⭐', say: '배달 왔습니다!', sayWho: 'me' },
    e_tree: { bg: 'home', face: 'happy', fx: 'float', big: '🌼', bigFx: 'wobble', say: '둥실둥실~', sayWho: 'me' },
    e_warp: { bg: 'bedroom', face: 'happy', fx: 'look', big: '⏰', bigFx: 'shake', say: '꿈이었나?', sayWho: 'me' },
    e_candy: { bg: 'candy', face: 'happy', fx: 'bounce', big: '🍭', rain: '🍬', say: '과자 행성 만세!', sayWho: 'me', hat: 'crown' },
    e_captain: { bg: 'control', who: 'alien', mood: 'happy', face: 'happy', fx: 'bounce', big: '👑', bigFx: 'wobble', say: '모두 지구로!', sayWho: 'me', hat: 'crown' },
    e_homework: { bg: 'bedroom', face: 'happy', fx: 'bounce', big: '📚', rain: '💯', say: '숙제 끝!', sayWho: 'me' }
  };

  function gag(spec) {
    return function (ctx, t) {
      (BG[spec.bg] || BG.cell)(ctx, t);
      if (spec.tint) rect(ctx, 0, 0, W, H, spec.tint);
      // 상대
      if (spec.who === 'alien' || spec.who === 'guard') alien(ctx, 610, 400, { hat: spec.who === 'guard' ? 'guard' : null, mood: spec.mood, s: 1 });
      if (spec.who === 'captain') alien(ctx, 610, 400, { hat: 'captain', mood: spec.mood, s: 1.1, color: '#9b59b6' });
      if (spec.who === 'giant') alien(ctx, 600, 440, { mood: 'happy', s: 1 + ease(t / 1.4) * 1.3 });
      if (spec.who === 'robot') robot(ctx, 610, 390, t, { dance: spec.mood === 'dance' });
      if (spec.who === 'baby') baby(ctx, 600, 380, t);
      // 막대맨
      var x = 300, y = 390, o = { face: spec.face, hat: spec.hat === 'crown' ? null : spec.hat };
      var fx = spec.fx;
      if (fx === 'bounce') y -= Math.abs(Math.sin(t * 6)) * 24;
      if (fx === 'shake') x += Math.sin(t * 40) * 4;
      if (fx === 'spin') { o.rot = t * 5; y -= 60; }
      if (fx === 'fall') o.rot = ease(t / 0.8) * 1.45;
      if (fx === 'float') y -= ease(t / 1.6) * 110 + Math.sin(t * 2) * 8;
      if (fx === 'grow' || fx === 'balloon') o.s = 1 + ease(t / 1.2) * (fx === 'balloon' ? 1.1 : 0.6);
      if (fx === 'balloon') y -= ease(t / 1.6) * 150;
      if (fx === 'run') { x += Math.sin(t * 3) * 120; o.legL = Math.sin(t * 14) * 0.7; o.legR = -Math.sin(t * 14) * 0.7; o.armL = -Math.sin(t * 14) * 0.8; o.armR = Math.sin(t * 14) * 0.8; o.lean = 0.25; }
      if (fx === 'fly') { x += ease(t / 0.9) * 280; y -= Math.sin(clamp01(t / 0.9) * Math.PI) * 120; o.rot = t * 6; }
      if (fx === 'stiff') { o.armL = 0; o.armR = 0; o.legL = -0.05; o.legR = 0.05; }
      if (fx === 'crawl') { o.rot = 1.2; y -= 10; o.armR = 1.4; o.legL = -0.6; }
      if (fx === 'stretch') { o.s = 1 + ease(t / 1.2) * 0.4; o.rot = Math.sin(t * 2) * 0.3; }
      if (fx === 'squash') { ctx.save(); ctx.translate(x, y); ctx.scale(1 + ease(t / 0.5) * 0.6, 1 - ease(t / 0.5) * 0.55); ctx.translate(-x, -y); }
      if (fx === 'jelly') { o.s = 0.8; }
      if (fx === 'pop') y -= Math.max(0, Math.sin(clamp01(t / 0.8) * Math.PI)) * 160 + 40;
      if (fx === 'bike') { x += Math.sin(t * 2) * 30; o.legL = 0.9; o.legR = 0.5; o.armL = 1.3; o.armR = 1.3; o.lean = 0.3; }
      if (fx === 'look') { o.armR = 1.2 + Math.sin(t * 3) * 0.2; }
      stick(ctx, x, y, o);
      if (fx === 'squash') ctx.restore();
      if (spec.hat === 'crown') text(ctx, '👑', x + (o.rot ? 0 : 0), y - 150 * (o.s || 1), 34);
      if (fx === 'jelly') { ctx.fillStyle = 'rgba(255,170,60,0.55)'; ctx.beginPath(); ctx.ellipse(x, y - 60, 90 + Math.sin(t * 5) * 8, 110 - Math.sin(t * 5) * 8, 0, 0, Math.PI * 2); ctx.fill(); }
      if (fx === 'sprout') text(ctx, '🌱', x, y - 140 - ease(t / 1.2) * 20, 40);
      if (fx === 'bike') text(ctx, '🛵', x + 10, y - 20, 70);
      // 큰 그림 글자
      if (spec.big && fx !== 'bike') {
        var bx = spec.bigX || 520, by = spec.bigY || 210, size = 90;
        ctx.save(); ctx.translate(bx, by);
        if (spec.bigFx === 'wobble') ctx.rotate(Math.sin(t * 5) * 0.2);
        if (spec.bigFx === 'spin') ctx.rotate(t * 4);
        if (spec.bigFx === 'shake') ctx.translate(Math.sin(t * 50) * 5, 0);
        if (spec.bigFx === 'grow') ctx.scale(0.4 + ease(t / 1) * 0.9, 0.4 + ease(t / 1) * 0.9);
        if (spec.bigFx === 'drop') ctx.translate(0, -200 * (1 - ease(t / 0.8)));
        text(ctx, spec.big, 0, 0, size);
        ctx.restore();
      }
      // 쏟아지는 것들
      if (spec.rain) for (var i = 0; i < 14; i++) {
        var rx = (i * 97 + 40) % W, ry = ((t * 160 + i * 61) % (H + 60)) - 30;
        text(ctx, spec.rain, rx, ry, 26);
      }
      if (spec.eyes) { circle(ctx, 560, 200, 10, '#ffd60a'); circle(ctx, 600, 200, 10, '#ffd60a'); }
      if (spec.flash) { var fl = Math.max(0, 1 - Math.abs(t - 0.5) * 4); if (fl > 0) rect(ctx, 0, 0, W, H, 'rgba(255,255,255,' + fl + ')'); }
      // 말풍선(0.4초 뒤)
      if (spec.say && t > 0.4) {
        if (spec.sayWho === 'them' && spec.who) bubble(ctx, spec.say, 610, 220, 17);
        else bubble(ctx, spec.say, Math.max(150, Math.min(650, x)), Math.max(60, y - 170 * (o.s || 1)), 17);
      }
      if (spec.fail) failStamp(ctx, t);
    };
  }
  Object.keys(GAGS).forEach(function (name) { if (!ART[name]) ART[name] = gag(GAGS[name]); });

  // 엔딩 장면에 공통으로 덧그리는 "엔딩" 글자
  function endingStamp(ctx, t) {
    var v = ease((t - 1.2) / 0.4);
    if (v <= 0) return;
    ctx.save(); ctx.globalAlpha = v;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, 54);
    text(ctx, '🏆 엔딩!', 400, 28, 28, '#ffd60a');
    ctx.restore();
  }

  C.Scenes = { W: W, H: H, ART: ART, endingStamp: endingStamp };
})(window.Choice);
