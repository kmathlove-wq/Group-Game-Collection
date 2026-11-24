// ===== anim.js =====
// 깡통 소탕대 관절 움직임: 그림 한 장을 다리·팔·날개·바퀴로 잘라 종이 관절 인형처럼 따로 움직인다.
// RIG[그림 이름] = 조각 목록. 자리는 그림 크기를 1로 본 비율이다.
//   box: [x, y, 폭, 높이] 잘라 낼 네모 / ring: [가운데 x, 가운데 y, 반지름(그림 폭 비율)] 잘라 낼 동그라미
//   p: [x, y] 도는 중심 / back: 몸 뒤에 그림 / ext: [왼, 위, 오른, 아래] 몸과 겹치게 더 크게 자르기(이음매 가림)
//   f(o): 움직임 → { a 돌기, dx·dy 옮기기(비율), sx·sy 늘이기 }. o = { t 시간, walk 걷는 정도 0~1, act 공격 0~1, aim 조준 각도, e 그 적 }
// 그림을 새로 바꾸면 이 자리 숫자도 그 그림에 맞게 고쳐야 한다.
(function (TS) {
  'use strict';
  var A = TS.Anim = {}, TAU = Math.PI * 2, sin = Math.sin, cos = Math.cos;
  function leg(box, p, sign, amp) { return { box: box, p: p, back: true, ext: [0, 0.08, 0, 0], f: function (o) { var s = sin(o.t * 11) * sign; return { a: s * (amp || 0.42) * o.walk, dy: -Math.max(0, cos(o.t * 11) * sign) * 0.03 * o.walk }; } }; }
  function arm(box, p, sign, amp) { return { box: box, p: p, f: function (o) { return { a: sin(o.t * (o.walk > 0.3 ? 11 : 3)) * sign * (amp || 0.3) * (0.35 + o.walk * 0.65) - sign * o.act * 0.5 }; } }; }
  function wheel(x, y, r, sp) { return { ring: [x, y, r], f: function (o) { return { a: -o.t * (sp || 5) * (0.15 + o.walk) }; } }; }
  function spin(x, y, r, sp) { return { ring: [x, y, r], f: function (o) { return { a: o.t * sp * (1 + o.act) }; } }; }
  function scarf(box, p) { return { box: box, p: p, ext: [0, 0, 0.03, 0], f: function (o) { return { a: sin(o.t * 9) * 0.1 + sin(o.t * 14) * 0.07 * o.walk, sy: 1 + sin(o.t * 12) * 0.1 }; } }; }
  function gun(box, p) { return { box: box, p: p, gun: true, f: function (o) { return { a: o.aim, dx: -o.act * 0.03 }; } }; }

  A.RIG = {
    hero_idle: [scarf([0, 0.39, 0.27, 0.13], [0.3, 0.45]), gun([0.6, 0.39, 0.4, 0.24], [0.66, 0.53])],
    hero_run1: [scarf([0.06, 0.36, 0.24, 0.14], [0.32, 0.42]), gun([0.68, 0.4, 0.32, 0.25], [0.73, 0.54])],
    hero_run2: [scarf([0, 0.36, 0.28, 0.14], [0.31, 0.42]), gun([0.62, 0.39, 0.38, 0.26], [0.68, 0.53])],
    hero_run3: [scarf([0.1, 0.3, 0.2, 0.17], [0.32, 0.38]), gun([0.675, 0.4, 0.325, 0.26], [0.72, 0.54])],
    hero_jump: [scarf([0, 0.36, 0.28, 0.14], [0.31, 0.42]), gun([0.61, 0.39, 0.39, 0.25], [0.67, 0.53])],
    hero_crouch: [scarf([0, 0.33, 0.24, 0.19], [0.28, 0.42])],
    mech: [leg([0.08, 0.71, 0.3, 0.29], [0.26, 0.69], 1, 0.3), leg([0.48, 0.695, 0.29, 0.305], [0.62, 0.67], -1, 0.3),
      { box: [0.715, 0.27, 0.285, 0.25], p: [0.72, 0.39], f: function (o) { return { a: o.aim, dx: -o.act * 0.04 }; } }],

    enemy_toaster: [leg([0.16, 0.68, 0.32, 0.32], [0.37, 0.66], 1), leg([0.54, 0.68, 0.32, 0.32], [0.72, 0.66], -1)],
    enemy_kettle: [leg([0.06, 0.765, 0.36, 0.235], [0.33, 0.79], 1, 0.6), leg([0.58, 0.775, 0.24, 0.225], [0.66, 0.79], -1, 0.6),
      arm([0, 0.42, 0.2, 0.3], [0.22, 0.48], 1, 0.6), arm([0.75, 0.5, 0.18, 0.2], [0.73, 0.6], -1, 0.6),
      { box: [0.79, 0.08, 0.21, 0.25], p: [0.82, 0.32], f: function (o) { var k = o.t * 2 % 1; return { dx: k * 0.06, dy: -k * 0.1, sx: 0.6 + k * 0.6, sy: 0.6 + k * 0.6 }; } }],
    enemy_fan: [spin(0.575, 0.49, 0.335, 16), { ring: [0.575, 0.49, 0.11], f: function () { return {}; } }],
    enemy_bulb: [{ box: [0, 0.02, 0.43, 0.53], p: [0.46, 0.5], ext: [0, 0, 0.03, 0.02], f: function (o) { return { a: sin(o.t * 42) * 0.3, sy: 0.75 + cos(o.t * 42) * 0.25 }; } },
      { box: [0.36, 0.72, 0.4, 0.28], p: [0.55, 0.72], f: function (o) { return { a: sin(o.t * 6) * 0.15 }; } }],
    enemy_vacuum: [{ box: [0, 0.7, 0.4, 0.3], p: [0.2, 0.74], f: function (o) { return { sx: 0.75 + sin(o.t * 30) * 0.25, dy: sin(o.t * 30) * 0.02 }; } }],
    enemy_turret: [{ box: [0, 0, 1, 0.47], p: [0.35, 0.4], ext: [0, 0, 0, 0.04], f: function (o) { return { a: o.aim, dx: -o.act * 0.08 }; } }],
    enemy_cam: [{ box: [0, 0, 1, 0.49], p: [0.37, 0.4], ext: [0, 0, 0, 0.02], f: function (o) { return { a: o.aim, dx: -o.act * 0.03 }; } }],
    enemy_speaker: [{ ring: [0.34, 0.625, 0.235], f: function (o) { var k = 1 + sin(o.t * 12) * 0.05 + o.act * 0.2; return { sx: k, sy: k }; } }],
    enemy_microwave: [leg([0.12, 0.655, 0.28, 0.345], [0.3, 0.66], 1), leg([0.43, 0.655, 0.22, 0.345], [0.54, 0.66], -1),
      { box: [0.655, 0, 0.345, 0.92], p: [0.7, 0.6], ext: [0.02, 0, 0, 0], fill: [0.63, 0.035, 0.12, 0.605, '#b4b8c6'], f: function (o) { return { a: o.act * 0.75, dy: o.act * 0.16 + sin(o.t * 11) * 0.015 * o.walk }; } }],
    enemy_blender: [leg([0.12, 0.79, 0.32, 0.21], [0.37, 0.81], 1, 0.6), leg([0.64, 0.79, 0.3, 0.21], [0.7, 0.81], -1, 0.6),
      arm([0, 0.58, 0.24, 0.24], [0.3, 0.62], 1, 0.6), arm([0.77, 0.45, 0.23, 0.22], [0.74, 0.62], -1, 0.6)],
    enemy_fridge: [leg([0.18, 0.69, 0.29, 0.31], [0.36, 0.69], 1, 0.28), leg([0.54, 0.69, 0.3, 0.31], [0.64, 0.69], -1, 0.28),
      arm([0, 0.38, 0.2, 0.4], [0.16, 0.34], 1, 0.25), arm([0.765, 0.42, 0.235, 0.34], [0.79, 0.42], -1, 0.25)],

    boss_toastking: [leg([0.15, 0.7, 0.3, 0.3], [0.36, 0.7], 1, 0.22), leg([0.55, 0.7, 0.3, 0.3], [0.62, 0.7], -1, 0.16), { box: [0, 0.6, 0.15, 0.25], p: [0.19, 0.64], ext: [0, 0, 0.04, 0], f: function (o) { return { a: sin(o.t * 3) * 0.1 + o.act * 0.15 }; } },
      { box: [0.5, 0.01, 0.3, 0.18], p: [0.65, 0.195], f: function (o) { return { sy: 1 + o.act * 0.5 + sin(o.t * 5) * 0.03 }; } }],
    boss_dustking: [wheel(0.48, 0.805, 0.1, 9), wheel(0.895, 0.805, 0.1, 9), { box: [0, 0.27, 0.16, 0.62], p: [0.17, 0.58], ext: [0, 0, 0.03, 0], f: function (o) { return { sy: 1 + sin(o.t * (5 + o.act * 14)) * (0.05 + o.act * 0.1), sx: 1 + o.act * 0.14 }; } }],
    boss_train: [wheel(0.375, 0.895, 0.05, 14), wheel(0.565, 0.895, 0.05, 14)],
    boss_clown: [{ box: [0, 0, 0.84, 0.2], p: [0.42, 0.15], f: function (o) { return { sx: cos(o.t * (16 + o.act * 10)) * 0.5 + 0.55 }; } }, spin(0.7, 0.425, 0.16, 7), spin(0.15, 0.825, 0.095, 14), spin(0.64, 0.86, 0.095, 14)],
    boss_queen: [{ box: [0, 0.69, 1, 0.31], p: [0.5, 0.69], ext: [0, 0.02, 0, 0], back: true, f: function (o) { return { a: sin(o.t * 2.2) * 0.035, sx: 1 + sin(o.t * 3) * 0.04, sy: 1 + sin(o.t * 4.2) * 0.04 }; } },
      { box: [0.18, 0, 0.38, 0.165], p: [0.37, 0.165], f: function (o) { return { a: sin(o.t * 2) * 0.03, sy: 1 + o.act * 0.12 }; } }],
    boss_airship: [{ box: [0.89, 0.2, 0.11, 0.42], p: [0.89, 0.41], ext: [0.02, 0, 0, 0], f: function (o) { return { sy: 1 + sin(o.t * 8) * 0.1 }; } }],
    boss_dragon: [{ box: [0.8, 0.28, 0.2, 0.57], p: [0.82, 0.8], ext: [0.04, 0, 0, 0], back: true, f: function (o) { return { a: sin(o.t * 2.4) * 0.09 }; } },
      { box: [0, 0, 0.37, 0.5], p: [0.36, 0.42], ext: [0, 0, 0.05, 0.05], f: function (o) { return { a: sin(o.t * 2) * 0.035 - o.act * 0.12, dx: -o.act * 0.02 }; } }],
    boss_overlord: [leg([0.32, 0.64, 0.24, 0.36], [0.5, 0.64], 1, 0.16), leg([0.6, 0.62, 0.28, 0.38], [0.68, 0.63], -1, 0.16),
      { ring: [0.475, 0.365, 0.13], f: function (o) { var k = 1 + sin(o.t * 14) * 0.05 + o.act * 0.12; return { sx: k, sy: k }; } },
      { box: [0, 0.477, 0.335, 0.27], p: [0.16, 0.6], f: function (o) { return { dx: sin(o.t * 2.1) * 0.02 - o.act * 0.12, dy: sin(o.t * 2.8) * 0.04, a: sin(o.t * 1.7) * 0.08 }; } },
      { box: [0.785, 0.26, 0.215, 0.38], p: [0.9, 0.45], f: function (o) { return { dx: sin(o.t * 1.9 + 1) * 0.015, dy: sin(o.t * 2.5 + 2) * 0.05 - o.act * 0.08, a: sin(o.t * 1.5) * 0.08 }; } },
      { box: [0.07, 0.04, 0.23, 0.3], p: [0.22, 0.2], ext: [0, 0, 0.065, 0], f: function (o) { return { a: sin(o.t * 2) * 0.05, dy: sin(o.t * 3) * 0.012 }; } }]
  };

  function canvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  // 그림 한 장을 몸 + 조각들로 미리 잘라 둔다(그림마다 한 번)
  function bake(im, rig) {
    var W = im.width, H = im.height, body = canvas(W, H), b = body.getContext('2d'), parts = [];
    b.drawImage(im, 0, 0);
    rig.forEach(function (d) {
      var c, x, y, w, h, g;
      if (d.ring) {
        var r = d.ring[2] * W; x = d.ring[0] * W - r; y = d.ring[1] * H - r;
        c = canvas(r * 2, r * 2); g = c.getContext('2d'); g.beginPath(); g.arc(r, r, r, 0, TAU); g.clip(); g.drawImage(im, -x, -y);
        parts.push({ d: d, c: c, x: x, y: y, px: d.ring[0] * W, py: d.ring[1] * H });
        return;
      }
      var e = d.ext || [0, 0, 0, 0];
      x = (d.box[0] - e[0]) * W; y = (d.box[1] - e[1]) * H; w = (d.box[2] + e[0] + e[2]) * W; h = (d.box[3] + e[1] + e[3]) * H;
      c = canvas(w, h); c.getContext('2d').drawImage(im, -x, -y);
      parts.push({ d: d, c: c, x: x, y: y, px: d.p[0] * W, py: d.p[1] * H });
    });
    // 조각을 다 떼어 낸 뒤에 몸에서 지운다(겹친 조각끼리 서로 지우지 않게)
    rig.forEach(function (d) { if (d.box) b.clearRect(d.box[0] * W, d.box[1] * H, d.box[2] * W, d.box[3] * H); });
    // 방패처럼 들리는 조각 뒤에 비는 자리는 색으로 채운다
    rig.forEach(function (d) { if (d.fill) { b.fillStyle = d.fill[4]; b.fillRect(d.fill[0] * W, d.fill[1] * H, d.fill[2] * W, d.fill[3] * H); b.strokeStyle = '#26102f'; b.lineWidth = W / 55; b.beginPath(); b.moveTo(d.fill[0] * W, d.fill[1] * H); b.lineTo((d.fill[0] + d.fill[2]) * W, d.fill[1] * H); b.lineTo((d.fill[0] + d.fill[2]) * W, (d.fill[1] + d.fill[3]) * H); b.lineTo(d.fill[0] * W, (d.fill[1] + d.fill[3]) * H); b.stroke(); } });
    return { body: body, parts: parts };
  }
  var cache = typeof WeakMap === 'function' ? new WeakMap() : null;
  function part(c, q, o, W, H) {
    var m = q.d.f(o);
    c.save();
    c.translate(q.px + (m.dx || 0) * W, q.py + (m.dy || 0) * H);
    if (m.a) c.rotate(m.a);
    if (m.sx != null || m.sy != null) c.scale(m.sx == null ? 1 : m.sx, m.sy == null ? 1 : m.sy);
    c.drawImage(q.c, q.x - q.px, q.y - q.py);
    c.restore();
  }
  // 그리기: cx 가운데, by 발밑, h 높이, o.flip 좌우 뒤집기, o.anchor 가운데로 볼 자리(0~1), o.sx·o.sy 전체 늘이기, o.rot 전체 기울기
  A.draw = function (c, im, name, cx, by, h, o) {
    var W = im.width, H = im.height, k = h / H, rig = A.RIG[name];
    if (o.maxW && W * k > o.maxW) k = o.maxW / W;
    c.save();
    c.translate(cx, by);
    c.scale((o.flip ? -1 : 1) * (o.sx || 1) * k, (o.sy || 1) * k);
    if (o.rot) { c.translate(0, -H / 2); c.rotate(o.rot); c.translate(0, H / 2); }
    c.translate(-W * (o.anchor == null ? 0.5 : o.anchor), -H);
    if (!rig || !cache) c.drawImage(im, 0, 0);
    else {
      var bk = cache.get(im), i;
      if (!bk) { bk = bake(im, rig); cache.set(im, bk); }
      for (i = 0; i < bk.parts.length; i++) if (bk.parts[i].d.back) part(c, bk.parts[i], o, W, H);
      c.drawImage(bk.body, 0, 0);
      for (i = 0; i < bk.parts.length; i++) if (!bk.parts[i].d.back) part(c, bk.parts[i], o, W, H);
    }
    if (o.over) o.over(c, W, H);
    c.restore();
  };
})(window.TinSquad);
