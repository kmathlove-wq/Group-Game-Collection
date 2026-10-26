// ===== draw.js =====
// 계란 훔치기 그림(Canvas). 화면은 논리 960×600, 카메라가 나를 따라간다. 그림 파일 없이 도형과 이모지로 그린다.
(function (E) {
  'use strict';
  var G = E.Game;
  var VIEW_W = 960, VIEW_H = 600;
  var BOT_COLORS = { red: '#ff6b6b', blue: '#51cf66' };

  function circle(ctx, x, y, r, fill, stroke, lw) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
  }
  function emoji(ctx, ch, x, y, size) {
    ctx.font = size + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000'; // 앞에서 쓴 반투명 색이 남아 있으면 이모지도 흐려짐
    ctx.fillText(ch, x, y);
  }
  function label(ctx, str, x, y, size, color, stroke) {
    ctx.font = '900 ' + size + 'px Pretendard, "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 4; ctx.strokeText(str, x, y); }
    ctx.fillStyle = color || '#222'; ctx.fillText(str, x, y);
  }

  // 알 하나(등급 색, 신화는 무지개)
  function egg(ctx, x, y, tier, s, t) {
    s = s || 1;
    var info = G.TIERS[tier];
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    if (tier >= 3) { ctx.fillStyle = 'rgba(255,230,120,' + (0.25 + 0.15 * Math.sin((t || 0) * 5)) + ')'; ctx.beginPath(); ctx.arc(0, 0, 22, 0, 7); ctx.fill(); }
    var fill = info.color;
    if (fill === 'rainbow') {
      fill = ctx.createLinearGradient(-10, -14, 10, 14);
      ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93'].forEach(function (c, i) { fill.addColorStop(i / 4, c); });
    }
    ctx.fillStyle = fill; ctx.strokeStyle = '#4b3b2a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, 11, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(-4, -5, 3, 4.5, -0.4, 0, Math.PI * 2); ctx.fill();
    if (tier >= 1) { ctx.fillStyle = 'rgba(0,0,0,0.15)'; [-4, 3].forEach(function (dx, i) { ctx.beginPath(); ctx.arc(dx, 4 - i * 6, 1.8, 0, 7); ctx.fill(); }); }
    ctx.restore();
  }

  // 사람 모양(나·봇): 둥근 몸 + 얼굴 + 머리 위 알
  function runner(ctx, o, color, name, t) {
    var bob = Math.sin(t * 12 + o.x * 0.01) * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(o.x, o.y + 18, 16, 5, 0, 0, 7); ctx.fill();
    circle(ctx, o.x, o.y + bob, 18, color, '#1f2430', 3);
    circle(ctx, o.x + 6 * (o.face || 1), o.y - 4 + bob, 3, '#1f2430');
    circle(ctx, o.x - 2 * (o.face || 1), o.y - 4 + bob, 3, '#1f2430');
    if (o.stun > 0) emoji(ctx, '💫', o.x, o.y - 30, 18);
    o.carry.forEach(function (tier, i) { egg(ctx, o.x, o.y - 32 - i * 22 + bob, tier, 0.9, t); });
    label(ctx, name, o.x, o.y + 34, 13, '#fff', 'rgba(0,0,0,0.6)');
  }

  function biomeDecor(ctx, bio, i, cam) {
    // 땅마다 무늬(같은 자리에 늘 같게: 좌표로 계산)
    var marks = { 0: '🌱', 1: '🌵', 2: '❄️', 3: '🌋', 4: '⭐' };
    for (var x = Math.floor(cam.x / 160) * 160; x < cam.x + VIEW_W + 160; x += 160) {
      var k = (x / 160 + i * 3) % 4;
      var y = bio.y0 + 30 + ((x * 7 + i * 53) % (bio.y1 - bio.y0 - 60));
      ctx.globalAlpha = 0.5;
      emoji(ctx, marks[i], x + k * 20, y, i === 3 && k === 1 ? 30 : 18);
      ctx.globalAlpha = 1;
    }
  }

  function base(ctx, s, bi, t) {
    var r = G.baseRect(bi), info = G.BASES[bi], b = s.bases[bi];
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = info.color; ctx.lineWidth = 6;
    // 울타리(위쪽 가운데는 문)
    ctx.beginPath();
    ctx.moveTo(r.x + r.w / 2 - 60, r.y); ctx.lineTo(r.x, r.y); ctx.lineTo(r.x, r.y + r.h); ctx.lineTo(r.x + r.w, r.y + r.h); ctx.lineTo(r.x + r.w, r.y); ctx.lineTo(r.x + r.w / 2 + 60, r.y);
    ctx.stroke();
    if (b.lockUntil > s.t) {
      ctx.fillStyle = 'rgba(80,160,255,' + (0.18 + 0.08 * Math.sin(t * 6)) + ')'; ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = '#4dabf7'; ctx.lineWidth = 8; ctx.setLineDash([12, 8]);
      ctx.beginPath(); ctx.moveTo(r.x + r.w / 2 - 60, r.y); ctx.lineTo(r.x + r.w / 2 + 60, r.y); ctx.stroke(); ctx.setLineDash([]);
      label(ctx, '🔒 잠김 ' + Math.ceil(b.lockUntil - s.t), r.x + r.w / 2, r.y - 18, 16, '#fff', '#1c7ed6');
    }
    label(ctx, info.name, r.x + r.w / 2, r.y + 34, 20, info.color, '#fff');
    var count = bi === 0 ? G.slotCount(s.up.slots) : b.slots.length;
    for (var i = 0; i < count; i++) {
      var p = G.slotPos(bi, i), sl = b.slots[i];
      ctx.fillStyle = '#f3e3c3'; ctx.strokeStyle = '#a0784b'; ctx.lineWidth = 2;
      ctx.fillRect(p.x - 30, p.y - 30, 60, 60); ctx.strokeRect(p.x - 30, p.y - 30, 60, 60);
      if (!sl) continue;
      if (sl.kind === 'egg') {
        egg(ctx, p.x, p.y + Math.sin(t * 8 + i) * (sl.left < 3 ? 3 : 0), sl.tier, 1.3, t);
        var total = G.TIERS[sl.tier].hatch * (bi === 0 ? G.hatchMul(s.up.hatch) : 1);
        ctx.fillStyle = '#ddd'; ctx.fillRect(p.x - 24, p.y + 22, 48, 5);
        ctx.fillStyle = '#ff922b'; ctx.fillRect(p.x - 24, p.y + 22, 48 * (1 - sl.left / total), 5);
      } else {
        emoji(ctx, G.TIERS[sl.tier].pets[sl.pet], p.x, p.y - 2 + Math.sin(t * 3 + i) * 2, 34);
        if (bi === 0) label(ctx, '+' + G.TIERS[sl.tier].income, p.x, p.y + 22, 11, '#2b8a3e', '#fff');
      }
    }
  }

  function world(ctx, s, cam, t) {
    ctx.save();
    ctx.translate(-cam.x, -cam.y);
    // 땅 층
    ctx.fillStyle = '#7cc45a'; ctx.fillRect(0, 0, G.WORLD_W, G.WORLD_H);
    G.BIOMES.forEach(function (bio, i) {
      ctx.fillStyle = bio.color; ctx.fillRect(0, bio.y0, G.WORLD_W, bio.y1 - bio.y0);
      if (i === 4) { ctx.fillStyle = '#fff'; for (var k = 0; k < 60; k++) ctx.fillRect((k * 397) % G.WORLD_W, bio.y0 + (k * 131) % (bio.y1 - bio.y0), 2, 2); }
      biomeDecor(ctx, bio, i, cam);
      label(ctx, bio.name + ' · ' + G.TIERS[bio.tier].name + ' 알', cam.x + 90, bio.y0 + 18, 16, i >= 3 ? '#fff' : '#333', i >= 3 ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.7)');
    });
    ctx.fillStyle = '#a7d98a'; ctx.fillRect(0, 1010, G.WORLD_W, G.WORLD_H - 1010);
    ctx.fillStyle = '#c9a66b'; ctx.fillRect(0, 1040, G.WORLD_W, 30);
    for (var bi = 0; bi < G.BASES.length; bi++) base(ctx, s, bi, t);
    s.eggs.forEach(function (e) { egg(ctx, e.x, e.y + Math.sin(t * 3 + e.id) * 2, e.tier, 1, t); });
    s.guards.forEach(function (g) {
      var bio = G.BIOMES[g.biome];
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(g.x, g.y + 18, 18, 6, 0, 0, 7); ctx.fill();
      emoji(ctx, bio.guard, g.x, g.y, 40);
      if (g.rest > 0) emoji(ctx, '💤', g.x + 18, g.y - 22, 16);
    });
    s.bots.forEach(function (bot) { runner(ctx, bot, BOT_COLORS[bot.id], bot.id === 'red' ? '빨강봇' : '초록봇', t); });
    runner(ctx, s.player, '#4dabf7', '나', t);
    ctx.restore();
  }

  function minimap(ctx, s) {
    var w = 180, h = w * G.WORLD_H / G.WORLD_W, x = VIEW_W - w - 10, y = 10, k = w / G.WORLD_W;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    G.BIOMES.forEach(function (bio) { ctx.fillStyle = bio.color; ctx.fillRect(x, y + bio.y0 * k, w, (bio.y1 - bio.y0) * k); });
    ctx.fillStyle = '#a7d98a'; ctx.fillRect(x, y + 1010 * k, w, (G.WORLD_H - 1010) * k);
    G.BASES.forEach(function (b, i) { var r = G.baseRect(i); ctx.fillStyle = b.color; ctx.fillRect(x + r.x * k, y + r.y * k, r.w * k, r.h * k); });
    s.eggs.forEach(function (e) { ctx.fillStyle = e.tier >= 3 ? '#ffd43b' : '#fff'; ctx.fillRect(x + e.x * k - 1, y + e.y * k - 1, 2, 2); });
    s.bots.forEach(function (b) { circle(ctx, x + b.x * k, y + b.y * k, 3, BOT_COLORS[b.id], '#000', 1); });
    circle(ctx, x + s.player.x * k, y + s.player.y * k, 4, '#4dabf7', '#fff', 1.5);
  }

  function joystick(ctx, stick) {
    if (!stick) return;
    circle(ctx, stick.ox, stick.oy, 46, 'rgba(255,255,255,0.18)', 'rgba(255,255,255,0.6)', 2);
    circle(ctx, stick.ox + stick.dx, stick.oy + stick.dy, 22, 'rgba(255,255,255,0.55)');
  }

  function camera(s) {
    return {
      x: Math.max(0, Math.min(G.WORLD_W - VIEW_W, s.player.x - VIEW_W / 2)),
      y: Math.max(0, Math.min(G.WORLD_H - VIEW_H, s.player.y - VIEW_H / 2))
    };
  }

  function frame(ctx, s, t, stick) {
    var cam = camera(s);
    world(ctx, s, cam, t);
    minimap(ctx, s);
    joystick(ctx, stick);
  }

  E.Draw = { VIEW_W: VIEW_W, VIEW_H: VIEW_H, frame: frame, egg: egg };
})(window.Egg);
