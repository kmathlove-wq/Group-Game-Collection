// 인간 vs 바퀴벌레 — 그림 파일 없이 Canvas 코드로 그리기(위에서 내려다본 모습).
// 모든 함수는 '판 좌표'(1600×1000)로 그린다. 카메라 이동·확대는 부르는 쪽(roach-room.js)이 ctx에 걸어 둔다.
window.RoachDraw = (() => {
  const TAU = Math.PI * 2;
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function ellipse(ctx, x, y, rx, ry, fill) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fillStyle = fill; ctx.fill(); }

  // ── 바닥과 벽(변하지 않으니 한 번만 숨은 그림판에 그린다) ──
  function floor(ctx, f) {
    ctx.save(); ctx.beginPath(); ctx.rect(f.x, f.y, f.w, f.h); ctx.clip();
    if (f.kind === 'tile') {
      for (let y = f.y; y < f.y + f.h; y += 40) for (let x = f.x; x < f.x + f.w; x += 40) {
        ctx.fillStyle = ((x - f.x) / 40 + (y - f.y) / 40) % 2 ? '#dbe8f0' : '#f4f8fb'; ctx.fillRect(x, y, 40, 40);
      }
    } else if (f.kind === 'wood') {
      for (let y = f.y, i = 0; y < f.y + f.h; y += 28, i += 1) {
        ctx.fillStyle = i % 2 ? '#d9a86c' : '#e2b47a'; ctx.fillRect(f.x, y, f.w, 28);
        ctx.fillStyle = '#c4935a';
        for (let x = f.x + ((i * 97) % 160); x < f.x + f.w; x += 160) ctx.fillRect(x, y, 2, 28);
        ctx.fillRect(f.x, y + 27, f.w, 1);
      }
    } else if (f.kind === 'carpet') {
      ctx.fillStyle = '#f3d4dc'; ctx.fillRect(f.x, f.y, f.w, f.h);
      ctx.fillStyle = '#ecc2cd';
      for (let y = f.y + 12; y < f.y + f.h; y += 24) for (let x = f.x + ((y / 24) % 2) * 12 + 6; x < f.x + f.w; x += 24) { ctx.beginPath(); ctx.arc(x, y, 2.5, 0, TAU); ctx.fill(); }
    } else {
      for (let y = f.y; y < f.y + f.h; y += 50) for (let x = f.x; x < f.x + f.w; x += 50) {
        ctx.fillStyle = (x + y) % 100 ? '#c9c6c0' : '#d3d0ca'; ctx.fillRect(x, y, 50, 50);
        ctx.strokeStyle = '#b3afa8'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, 50, 50);
      }
    }
    ctx.restore();
    ctx.fillStyle = '#00000014'; ctx.font = '900 64px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(f.name, f.x + f.w / 2, f.y + f.h / 2 + (f.kind === 'wood' ? 60 : 0));
  }
  function walls(ctx, list) {
    for (const w of list) {
      ctx.fillStyle = '#5b4636'; ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = '#7a6250'; ctx.fillRect(w.x + 3, w.y + 3, Math.max(0, w.w - 6), Math.max(0, w.h - 6));
    }
  }
  // 바닥·벽을 숨은 그림판 하나에 굽는다(scale배로 선명하게).
  function bakeMap(map, scale) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(map.w * scale); canvas.height = Math.round(map.h * scale);
    const ctx = canvas.getContext('2d'); ctx.scale(scale, scale);
    ctx.fillStyle = '#3f3128'; ctx.fillRect(0, 0, map.w, map.h);
    for (const f of map.floors) floor(ctx, f);
    walls(ctx, map.walls);
    return canvas;
  }

  // ── 가구 ──
  function furniture(ctx, f) {
    const { x, y, w, h } = f;
    ctx.save();
    ctx.shadowColor = '#0000004d'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
    switch (f.kind) {
      case 'sink': {
        roundRect(ctx, x, y, w, h, 6); ctx.fillStyle = '#9aa5b1'; ctx.fill(); ctx.shadowColor = 'transparent';
        roundRect(ctx, x + w * 0.38, y + 10, w * 0.3, h - 22, 10); ctx.fillStyle = '#d9e2ea'; ctx.fill();
        ctx.fillStyle = '#6b7785'; ctx.beginPath(); ctx.arc(x + w * 0.53, y + 10, 6, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffffffaa'; ctx.fillRect(x + 12, y + 14, w * 0.2, h - 30);
        break;
      }
      case 'stove': {
        roundRect(ctx, x, y, w, h, 6); ctx.fillStyle = '#3b3f46'; ctx.fill(); ctx.shadowColor = 'transparent';
        for (let i = 0; i < 3; i += 1) {
          const cy = y + h * (0.2 + i * 0.3);
          ctx.strokeStyle = '#8a8f98'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x + w / 2, cy, 22, 0, TAU); ctx.stroke();
          ctx.strokeStyle = '#5b6068'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + w / 2, cy, 12, 0, TAU); ctx.stroke();
        }
        break;
      }
      case 'fridge': {
        roundRect(ctx, x, y, w, h, 10); ctx.fillStyle = '#eef3f7'; ctx.fill(); ctx.shadowColor = 'transparent';
        ctx.strokeStyle = '#b8c4ce'; ctx.lineWidth = 3; roundRect(ctx, x + 4, y + 4, w - 8, h - 8, 8); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + w / 2, y + 8); ctx.lineTo(x + w / 2, y + h - 8); ctx.stroke();
        ctx.fillStyle = '#9aa7b2'; ctx.fillRect(x + w / 2 - 12, y + h - 26, 6, 18); ctx.fillRect(x + w / 2 + 6, y + h - 26, 6, 18);
        ctx.font = '22px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🧲', x + w * 0.25, y + h * 0.4);
        break;
      }
      case 'table': {
        roundRect(ctx, x, y, w, h, 12); ctx.fillStyle = '#a0612d'; ctx.fill(); ctx.shadowColor = 'transparent';
        roundRect(ctx, x + 6, y + 6, w - 12, h - 12, 9); ctx.fillStyle = '#b87436'; ctx.fill();
        ctx.strokeStyle = '#a3652f'; ctx.lineWidth = 2;
        for (let i = 1; i < 5; i += 1) { ctx.beginPath(); ctx.moveTo(x + 8, y + (h / 5) * i); ctx.lineTo(x + w - 8, y + (h / 5) * i); ctx.stroke(); }
        for (const [px, py] of [[0.25, 0.3], [0.75, 0.3], [0.25, 0.72], [0.75, 0.72]]) {
          ellipse(ctx, x + w * px, y + h * py, 22, 22, '#fffdf7'); ellipse(ctx, x + w * px, y + h * py, 14, 14, '#f1e9da');
        }
        break;
      }
      case 'bin': {
        roundRect(ctx, x + 6, y + 8, w - 12, h - 14, 14); ctx.fillStyle = '#4b8f5a'; ctx.fill(); ctx.shadowColor = 'transparent';
        roundRect(ctx, x + 2, y + 4, w - 4, 20, 8); ctx.fillStyle = '#3c7a4a'; ctx.fill();
        ctx.font = '26px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('♻️', x + w / 2, y + h * 0.6);
        break;
      }
      case 'sofa': {
        roundRect(ctx, x, y, w, h, 14); ctx.fillStyle = '#2f7f8f'; ctx.fill(); ctx.shadowColor = 'transparent';
        roundRect(ctx, x, y, w, 30, 12); ctx.fillStyle = '#266b78'; ctx.fill();
        roundRect(ctx, x, y, 30, h, 12); ctx.fill(); roundRect(ctx, x + w - 30, y, 30, h, 12); ctx.fill();
        const cw = (w - 60) / 3;
        for (let i = 0; i < 3; i += 1) { roundRect(ctx, x + 32 + i * cw, y + 32, cw - 4, h - 36, 10); ctx.fillStyle = '#3a97a8'; ctx.fill(); }
        break;
      }
      case 'lowtable': {
        roundRect(ctx, x, y, w, h, 10); ctx.fillStyle = '#7c5232'; ctx.fill(); ctx.shadowColor = 'transparent';
        roundRect(ctx, x + 8, y + 8, w - 16, h - 16, 6); ctx.fillStyle = '#b5d8e8aa'; ctx.fill();
        ellipse(ctx, x + w * 0.7, y + h * 0.45, 11, 11, '#ffffff'); ellipse(ctx, x + w * 0.7, y + h * 0.45, 7, 7, '#7a4a25');
        ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('📺', x + w * 0.3, y + h * 0.5);
        break;
      }
      case 'tv': {
        roundRect(ctx, x, y, w, h, 6); ctx.fillStyle = '#6b4a2f'; ctx.fill(); ctx.shadowColor = 'transparent';
        roundRect(ctx, x + 20, y + 6, w - 40, 16, 4); ctx.fillStyle = '#16181d'; ctx.fill();
        ctx.fillStyle = '#4a3320'; ctx.fillRect(x + 10, y + 30, w - 20, 2);
        break;
      }
      case 'closet': {
        roundRect(ctx, x, y, w, h, 6); ctx.fillStyle = '#8a6440'; ctx.fill(); ctx.shadowColor = 'transparent';
        ctx.strokeStyle = '#6e4e30'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + w / 2, y + 4); ctx.lineTo(x + w / 2, y + h - 4); ctx.stroke();
        ellipse(ctx, x + w / 2 - 8, y + h * 0.6, 4, 4, '#e8c46a'); ellipse(ctx, x + w / 2 + 8, y + h * 0.6, 4, 4, '#e8c46a');
        break;
      }
      case 'bed': {
        roundRect(ctx, x, y, w, h, 12); ctx.fillStyle = '#7a5434'; ctx.fill(); ctx.shadowColor = 'transparent';
        roundRect(ctx, x + 8, y + 8, w - 16, h - 16, 10); ctx.fillStyle = '#fbfbff'; ctx.fill();
        roundRect(ctx, x + 22, y + 20, w * 0.36, 50, 14); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#dcdcea'; ctx.lineWidth = 2; ctx.stroke();
        roundRect(ctx, x + w * 0.54, y + 20, w * 0.36, 50, 14); ctx.fill(); ctx.stroke();
        roundRect(ctx, x + 8, y + 100, w - 16, h - 108, 10); ctx.fillStyle = '#7c8ff0'; ctx.fill();
        ctx.fillStyle = '#93a3f5';
        for (let i = 0; i < 4; i += 1) ctx.fillRect(x + 8, y + 120 + i * 45, w - 16, 12);
        break;
      }
      case 'shelf': {
        roundRect(ctx, x, y, w, h, 6); ctx.fillStyle = '#9b7046'; ctx.fill(); ctx.shadowColor = 'transparent';
        ctx.fillStyle = '#7d5735';
        for (let i = 1; i < 4; i += 1) ctx.fillRect(x + 4, y + (h / 4) * i, w - 8, 4);
        ctx.font = '22px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (let i = 0; i < 4; i += 1) ctx.fillText(i % 2 ? '👟' : '🥿', x + w / 2, y + (h / 4) * (i + 0.5));
        break;
      }
      default: roundRect(ctx, x, y, w, h, 8); ctx.fillStyle = '#8a6a4a'; ctx.fill();
    }
    ctx.restore();
  }

  // ── 부스러기(1점 빵 조각 · 3점 케이크 조각) ──
  function crumb(ctx, x, y, v, t) {
    const bob = Math.sin(t * 3 + x) * 1.2;
    ctx.save(); ctx.translate(x, y + bob);
    if (v >= 3) {
      ctx.beginPath(); ctx.moveTo(-11, 8); ctx.lineTo(11, 8); ctx.lineTo(0, -11); ctx.closePath();
      ctx.fillStyle = '#fff4e0'; ctx.fill(); ctx.strokeStyle = '#f472b6'; ctx.lineWidth = 3; ctx.stroke();
      ellipse(ctx, 0, -10, 3.5, 3.5, '#ef4444');
      ctx.strokeStyle = '#fde04788'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 15 + Math.sin(t * 5) * 2, 0, TAU); ctx.stroke();
    } else {
      ellipse(ctx, -3, 1, 6, 5, '#d4a256'); ellipse(ctx, 3, -2, 5, 4, '#e8bd72'); ellipse(ctx, 2, 4, 3, 3, '#c38e45');
    }
    ctx.restore();
  }

  // ── 바퀴벌레(갈색 타원 + 더듬이 + 움직이는 다리) ── 오른쪽(+x)을 보는 모습으로 그려 angle만큼 돌린다.
  function roach(ctx, x, y, angle, t, o = {}) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    const step = o.moving ? Math.sin(t * 28 + (o.seed || 0)) : 0;
    // 다리 3쌍
    ctx.strokeStyle = '#3a200d'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i += 1) {
      const bx = 5 - i * 6; const swing = (i % 2 ? step : -step) * 4;
      for (const side of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(bx, side * 3);
        ctx.lineTo(bx + swing * side * 0.2 + (1 - i) * 3, side * 9); ctx.lineTo(bx + swing - i * 2 + 1, side * 13); ctx.stroke();
      }
    }
    // 더듬이(살랑살랑)
    const wob = Math.sin(t * 6 + (o.seed || 0)) * 3;
    ctx.strokeStyle = '#2b170a'; ctx.lineWidth = 1.2;
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(14, side * 2); ctx.quadraticCurveTo(22, side * (6 + wob), 28, side * (12 + wob * side)); ctx.stroke();
    }
    // 몸통과 날개, 머리
    const grad = ctx.createLinearGradient(0, -8, 0, 8);
    grad.addColorStop(0, o.slowed ? '#5f7d3a' : '#8a4b1f'); grad.addColorStop(0.5, o.slowed ? '#7fa24f' : '#a65d27'); grad.addColorStop(1, o.slowed ? '#5f7d3a' : '#7a3f17');
    ctx.beginPath(); ctx.ellipse(-1, 0, 13, 7.5, 0, 0, TAU); ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = '#4a250c'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-13, 0); ctx.stroke();
    ellipse(ctx, 11, 0, 4.8, 5.5, '#3f220d');
    ctx.fillStyle = '#ffffff55'; ctx.beginPath(); ctx.ellipse(-2, -3.5, 7, 2, -0.1, 0, TAU); ctx.fill();
    ctx.restore();
    if (o.ring) { ctx.save(); ctx.strokeStyle = o.ring; ctx.lineWidth = 2.5; ctx.globalAlpha = o.alpha ?? 1; ctx.beginPath(); ctx.arc(x, y, 18, 0, TAU); ctx.stroke(); ctx.restore(); }
  }

  // ── 사람(위에서 본 머리·어깨·팔) ── swing: 0~1 슬리퍼 휘두르기, spray: 스프레이 뿌리는 중
  function human(ctx, x, y, angle, t, o = {}) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    const walk = o.moving ? Math.sin(t * 10) * 3 : 0;
    const skin = '#f2c9a0';
    // 왼손(스프레이)
    const lx = 12 + (o.spray ? 8 : walk); const ly = -18;
    ctx.save(); ctx.translate(lx, ly);
    roundRect(ctx, -2, -5, 14, 10, 3); ctx.fillStyle = '#22c55e'; ctx.fill(); ctx.fillStyle = '#e5e7eb'; ctx.fillRect(11, -2.5, 4, 5);
    ctx.restore();
    ellipse(ctx, lx, ly, 5.5, 5.5, skin);
    // 오른손(슬리퍼): 휘두를 때 옆에서 앞으로 크게 돈다.
    const sw = o.swing ?? 0;
    const armAngle = sw > 0 ? 1.2 - Math.sin(sw * Math.PI) * 1.5 : 1.0;
    const reach = sw > 0 ? 24 + Math.sin(sw * Math.PI) * 14 : 20;
    const rx = Math.cos(armAngle) * reach + (sw ? 0 : -walk); const ry = Math.sin(armAngle) * reach;
    ctx.save(); ctx.translate(rx, ry); ctx.rotate(armAngle - 0.4);
    roundRect(ctx, 0, -7, 26, 14, 7); ctx.fillStyle = '#3b82f6'; ctx.fill();
    ctx.strokeStyle = '#1e40af'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(6, -6); ctx.lineTo(10, 0); ctx.lineTo(6, 6); ctx.stroke();
    ctx.restore();
    ellipse(ctx, rx, ry, 5.5, 5.5, skin);
    // 어깨(옷 색 = 내 색)
    ctx.beginPath(); ctx.ellipse(-2, 0, 12, 22, 0, 0, TAU); ctx.fillStyle = o.color || '#ef4444'; ctx.fill();
    ctx.strokeStyle = '#00000033'; ctx.lineWidth = 2; ctx.stroke();
    // 머리와 머리카락(뒤통수 쪽)
    ellipse(ctx, 0, 0, 12, 12, skin);
    ctx.beginPath(); ctx.arc(0, 0, 12, Math.PI * 0.55, Math.PI * 1.45); ctx.lineTo(-2, 0); ctx.closePath(); ctx.fillStyle = '#3b2a1e'; ctx.fill();
    ellipse(ctx, 9, -4, 2, 2, '#ffffffaa');
    ctx.restore();
    if (o.ring) { ctx.save(); ctx.strokeStyle = o.ring; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 32, 0, TAU); ctx.stroke(); ctx.restore(); }
  }

  // ── 효과 ──
  function slipperHit(ctx, x, y, angle, life, rules) { // 앞쪽 원에 '철썩'
    const cx = x + Math.cos(angle) * rules.slipper.reach; const cy = y + Math.sin(angle) * rules.slipper.reach;
    ctx.save(); ctx.globalAlpha = Math.max(0, life);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, cy, rules.slipper.radius * (1.2 - life * 0.3), 0, TAU); ctx.stroke();
    ctx.fillStyle = '#fde047'; ctx.font = '900 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('철썩!', cx, cy - rules.slipper.radius - 6);
    ctx.restore();
  }
  function sprayCloud(ctx, x, y, angle, life, rules, seed) { // 앞쪽 부채꼴 안개
    const { range, halfAngle } = rules.spray;
    ctx.save(); ctx.globalAlpha = Math.max(0, life) * 0.75;
    const grad = ctx.createRadialGradient(x, y, 10, x, y, range);
    grad.addColorStop(0, '#d9f99dcc'); grad.addColorStop(1, '#bef26400');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, range * (1.1 - life * 0.4), angle - halfAngle, angle + halfAngle); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ecfccb';
    for (let i = 0; i < 14; i += 1) {
      const a = angle + (((seed * (i + 3) * 9301) % 100) / 100 - 0.5) * halfAngle * 2;
      const d = range * (0.25 + (((seed + i * 37) % 70) / 100)) * (1.2 - life * 0.5);
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 4 + (i % 3) * 2, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  function splat(ctx, x, y, life) { // 잡힌 자리 얼룩
    ctx.save(); ctx.globalAlpha = Math.min(1, life) * 0.85; ctx.translate(x, y);
    ellipse(ctx, 0, 0, 15, 11, '#6b4a1e');
    for (let i = 0; i < 7; i += 1) { const a = i * 0.9; ellipse(ctx, Math.cos(a) * 15, Math.sin(a) * 11, 4, 3, '#7d5a26'); }
    ellipse(ctx, 0, 0, 7, 5, '#c9b458');
    ctx.restore();
  }
  function nameTag(ctx, x, y, label, color, mine) {
    ctx.save(); ctx.font = `${mine ? 900 : 700} 13px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3.5; ctx.strokeStyle = '#ffffffdd'; ctx.strokeText(label, x, y);
    ctx.fillStyle = color || '#222'; ctx.fillText(label, x, y);
    ctx.restore();
  }

  return { bakeMap, furniture, crumb, roach, human, slipperHit, sprayCloud, splat, nameTag, roundRect };
})();
