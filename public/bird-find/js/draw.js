// ===== draw.js =====
// 새 찾기 그림 그리기(Canvas). scene.js가 만든 숲을 그리고, 찾은 새 표시·힌트 반짝임을 덧그린다.
// 숲은 단계마다 한 번만 그려 두고(배경 캔버스) 매 프레임에는 그 위에 표시만 덧그린다.
(function (BF) {
  'use strict';

  function shade(hex, amount) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    function f(c) { return Math.max(0, Math.min(255, Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount))); }
    return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
  }

  function circle(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  function cloud(ctx, c) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    [[0, 0, 26], [24, -10, 22], [48, 0, 24], [22, 8, 22]].forEach(function (p) {
      ctx.beginPath(); ctx.arc(c.x + p[0] * c.s, c.y + p[1] * c.s, p[2] * c.s, 0, Math.PI * 2); ctx.fill();
    });
  }

  function tuft(ctx, t) {
    ctx.strokeStyle = '#3d8b37';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var i = -2; i <= 2; i++) {
      ctx.moveTo(t.x + i * 3 * t.s, t.y);
      ctx.quadraticCurveTo(t.x + i * 4 * t.s, t.y - 8 * t.s, t.x + i * 6 * t.s, t.y - 14 * t.s);
    }
    ctx.stroke();
  }

  function flower(ctx, f) {
    for (var i = 0; i < 5; i++) {
      var a = i / 5 * Math.PI * 2;
      circle(ctx, f.x + Math.cos(a) * 3.5, f.y + Math.sin(a) * 3.5, 3, f.color);
    }
    circle(ctx, f.x, f.y, 2.2, '#f4a300');
  }

  function leaf(ctx, x, y, r, rot, color) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.quadraticCurveTo(0, -r * 0.7, r, 0);
    ctx.quadraticCurveTo(0, r * 0.7, -r, 0);
    ctx.fill();
    ctx.restore();
  }

  // 새 한 마리. size = 몸 길이의 절반쯤(판정 반지름의 기준)
  function bird(ctx, b) {
    var s = b.size / 20;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(b.dir * s, s);
    var body = b.color, dark = shade(b.color, -0.35), light = shade(b.color, 0.45);
    // 다리
    if (b.pose !== 'fly') {
      ctx.strokeStyle = '#6b4f2a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-3, 10); ctx.lineTo(-4, 18); ctx.moveTo(3, 10); ctx.lineTo(4, 18); ctx.stroke();
    }
    // 꼬리
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-27, -6); ctx.lineTo(-25, 5); ctx.closePath(); ctx.fill();
    // 몸통·배
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.ellipse(0, 2, 16, 11, -0.15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = light;
    ctx.beginPath(); ctx.ellipse(3, 6, 10, 6, -0.1, 0, Math.PI * 2); ctx.fill();
    // 머리
    circle(ctx, 13, -8, 8.5, body);
    // 부리
    ctx.fillStyle = '#f2a541';
    ctx.beginPath(); ctx.moveTo(20, -10); ctx.lineTo(28, -7); ctx.lineTo(20, -5); ctx.closePath(); ctx.fill();
    // 눈
    circle(ctx, 15.5, -10, 2.3, '#111');
    circle(ctx, 16.2, -10.7, 0.8, '#fff');
    // 날개
    ctx.fillStyle = dark;
    ctx.beginPath();
    if (b.pose === 'fly') { ctx.moveTo(-6, -2); ctx.quadraticCurveTo(-2, -26, 10, -24); ctx.quadraticCurveTo(4, -10, 6, 0); }
    else { ctx.moveTo(-10, -2); ctx.quadraticCurveTo(0, -8, 8, 0); ctx.quadraticCurveTo(0, 8, -10, -2); }
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // 숲 전체를 ctx(논리 크기 W×H 좌표계)에 그린다.
  function scene(ctx, sc) {
    var W = sc.W, H = sc.H;
    var sky = ctx.createLinearGradient(0, 0, 0, sc.horizon);
    sky.addColorStop(0, '#8fd3ff'); sky.addColorStop(1, '#dff3ff');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, sc.horizon + 2);
    circle(ctx, W * 0.85, 70, 34, '#fff3b0');
    sc.clouds.forEach(function (c) { cloud(ctx, c); });
    sc.hills.forEach(function (h) {
      ctx.fillStyle = ['#a7d58f', '#93c97a', '#80bd67'][h.shade];
      ctx.beginPath(); ctx.ellipse(h.x, h.y, h.rx, h.ry, 0, Math.PI, 0); ctx.fill();
    });
    var ground = ctx.createLinearGradient(0, sc.horizon, 0, H);
    ground.addColorStop(0, '#8fcf6a'); ground.addColorStop(1, '#5fae45');
    ctx.fillStyle = ground; ctx.fillRect(0, sc.horizon, W, H - sc.horizon);
    sc.tufts.forEach(function (t) { tuft(ctx, t); });
    sc.flowers.forEach(function (f) { flower(ctx, f); });
    sc.trees.forEach(function (t) {
      ctx.fillStyle = '#7b5230';
      ctx.fillRect(t.x - t.trunk / 2, t.top, t.trunk, t.base - t.top);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.beginPath(); ctx.ellipse(t.x, t.base, 40, 8, 0, 0, Math.PI * 2); ctx.fill();
      t.blobs.forEach(function (b) { circle(ctx, b.x, b.y, b.r, b.color); circle(ctx, b.x - b.r * 0.25, b.y - b.r * 0.3, b.r * 0.45, shade(b.color, 0.12)); });
    });
    sc.bushes.forEach(function (bu) {
      bu.parts.forEach(function (p) { circle(ctx, p.x, p.y, p.r, p.color); circle(ctx, p.x - p.r * 0.2, p.y - p.r * 0.3, p.r * 0.4, shade(p.color, 0.12)); });
    });
    sc.decoys.forEach(function (d) { leaf(ctx, d.x, d.y, d.r * 1.3, d.rot, d.color); });
    sc.birds.forEach(function (b) { bird(ctx, b); });
    sc.covers.forEach(function (c) { circle(ctx, c.x, c.y, c.r, c.color); });
  }

  // 찾은 새에 동그라미, 힌트 반짝임, 엉뚱한 곳 ✕
  function marks(ctx, sc, state) {
    ctx.lineWidth = 4;
    sc.birds.forEach(function (b) {
      if (!b.found) return;
      ctx.strokeStyle = '#ff3b6b';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.size * 1.35, 0, Math.PI * 2); ctx.stroke();
    });
    if (state.hint) {
      var t = state.now - state.hint.at;
      var r = state.hint.r * (1 - 0.15 * Math.sin(t / 120));
      ctx.strokeStyle = 'rgba(255,214,10,' + Math.max(0, 1 - t / 2500) + ')';
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(state.hint.x, state.hint.y, r, 0, Math.PI * 2); ctx.stroke();
    }
    state.misses.forEach(function (m) {
      var a = Math.max(0, 1 - (state.now - m.at) / 700);
      ctx.strokeStyle = 'rgba(230,30,50,' + a + ')';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(m.x - 12, m.y - 12); ctx.lineTo(m.x + 12, m.y + 12); ctx.moveTo(m.x + 12, m.y - 12); ctx.lineTo(m.x - 12, m.y + 12); ctx.stroke();
    });
  }

  BF.Draw = { scene: scene, marks: marks, bird: bird };
})(window.BirdFind);
