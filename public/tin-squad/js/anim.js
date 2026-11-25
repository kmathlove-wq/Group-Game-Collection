// ===== anim.js =====
// 깡통 소탕대 관절 움직임: 그림을 윤곽대로 오린 조각(img/rig_<이름>.png, 자리 표 TinSquad.RIGS)을 종이 관절 인형처럼 움직인다.
// 조각을 어디서 어떻게 오릴지는 tools/tin-squad/cut_parts.py의 SPEC, 어떻게 움직일지는 여기 MOVE[그림 이름][조각 이름].
// 움직임 함수 f(o) → { a 돌기, dx·dy 옮기기(그림 크기 비율), sx·sy 늘이기 }. o = { t 시간, walk 걷는 정도 0~1, act 공격 -0.4~1, aim 조준 각도 }
(function (TS) {
  'use strict';
  var A = TS.Anim = {}, TAU = Math.PI * 2, sin = Math.sin, cos = Math.cos, max = Math.max;
  function leg(sign, amp, fast) { return function (o) { var p = o.t * (fast || 11); return { a: sin(p) * sign * amp * o.walk, dy: -max(0, cos(p) * sign) * 0.02 * o.walk }; }; }
  function arm(sign, amp, act) { return function (o) { return { a: sin(o.t * (o.walk > 0.3 ? 11 : 3)) * sign * amp * (0.35 + o.walk * 0.65) - sign * max(0, o.act) * (act || 0) }; }; }
  function scarf(o) { return { a: sin(o.t * 9) * 0.07 + sin(o.t * 14) * 0.05 * o.walk }; }
  function gun(o) { return { a: o.aim, dx: -max(0, o.act) * 0.02 }; }

  A.MOVE = {
    hero_idle: { scarf: scarf, gun: gun }, hero_run1: { scarf: scarf, gun: gun }, hero_run2: { scarf: scarf, gun: gun }, hero_run3: { scarf: scarf, gun: gun }, hero_jump: { scarf: scarf, gun: gun }, hero_crouch: { scarf: scarf },
    mech: { cannon: gun, legL: leg(1, 0.2), legR: leg(-1, 0.22) },
    enemy_toaster: { legL: leg(1, 0.36), legR: leg(-1, 0.36) },
    enemy_kettle: { legL: leg(1, 0.45, 14), legR: leg(-1, 0.45, 14), armL: arm(1, 0.2), armR: arm(-1, 0.3), steam: function (o) { var k = o.t * 1.6 % 1; return { dx: k * 0.05, dy: -k * 0.08, sx: 0.65 + k * 0.5, sy: 0.65 + k * 0.5 }; } },
    enemy_fan: { blades: function (o) { return { a: o.t * 15 }; } },
    enemy_bulb: { wings: function (o) { return { a: sin(o.t * 42) * 0.22, sy: 0.85 + cos(o.t * 42) * 0.15 }; } },
    enemy_vacuum: { brush: function (o) { return { sx: 0.85 + sin(o.t * 30) * 0.15 }; } },
    enemy_turret: { head: function (o) { return { a: o.aim, dx: -o.act * 0.06 }; } },
    enemy_cam: { head: function (o) { return { a: o.aim, dx: -o.act * 0.02 }; } },
    enemy_microwave: { legL: leg(1, 0.36), legR: leg(-1, 0.36), shield: function (o) { return { a: o.act * 0.6, dx: o.act * 0.03, dy: o.act * 0.16 + sin(o.t * 11) * 0.012 * o.walk }; } },
    enemy_blender: { legL: leg(1, 0.36), legR: leg(-1, 0.36), armL: arm(1, 0.24), armR: arm(-1, 0.26) },
    enemy_fridge: { legL: leg(1, 0.24), legR: leg(-1, 0.24), armL: arm(1, 0.16, 0.3), armR: arm(-1, 0.18, 0.4) },
    boss_toastking: { legL: leg(1, 0.2, 9), legR: leg(-1, 0.14, 9), armL: function (o) { return { a: sin(o.t * 3) * 0.1 + max(0, o.act) * 0.15 }; }, toast: function (o) { return { sy: 1 + max(0, o.act) * 0.25 + max(0, sin(o.t * 5)) * 0.04 }; } },
    boss_dustking: { mouth: function (o) { var k = max(0, sin(o.t * (5 + max(0, o.act) * 12))); return { sx: 1 + k * 0.06 + max(0, o.act) * 0.08, sy: 1 + k * 0.05 + max(0, o.act) * 0.06 }; } },
    boss_clown: { rotor: function (o) { return { sx: cos(o.t * 16) * 0.42 + 0.58 }; }, propL: function (o) { return { a: o.t * 13 }; } },
    boss_queen: { skirt: function (o) { return { a: sin(o.t * 2.2) * 0.02, sx: 1 + sin(o.t * 3) * 0.025, sy: 1 + sin(o.t * 4.2) * 0.03 }; }, crown: function (o) { return { sy: 1 + max(0, o.act) * 0.12 + max(0, sin(o.t * 2.5)) * 0.03 }; }, armL: function (o) { return { a: sin(o.t * 2.6) * 0.1 + max(0, o.act) * 0.25 }; } },
    boss_airship: { tail: function (o) { return { sy: 1 + sin(o.t * 8) * 0.07 }; } },
    boss_dragon: { tail: function (o) { return { a: sin(o.t * 2.4) * 0.05 }; }, head: function (o) { return { a: sin(o.t * 2) * 0.025 - o.act * 0.09 }; } },
    boss_overlord: { legL: leg(1, 0.14, 8), legR: leg(-1, 0.14, 8), head: function (o) { return { a: sin(o.t * 2) * 0.04, dy: sin(o.t * 3) * 0.006 }; },
      fistL: function (o) { return { dx: sin(o.t * 2.1) * 0.02 - max(0, o.act) * 0.14, dy: sin(o.t * 2.8) * 0.04, a: sin(o.t * 1.7) * 0.08 }; },
      fistR: function (o) { return { dx: sin(o.t * 1.9 + 1) * 0.012 + max(0, o.act) * 0.02, dy: sin(o.t * 2.5 + 2) * 0.05 - max(0, o.act) * 0.1, a: sin(o.t * 1.5) * 0.08 }; } }
  };
  // 제자리에서 도는 동그라미(바퀴)와 커지기만 하는 동그라미(스피커): [가운데 x, y, 반지름(폭 비율), 움직임] — 몸 위에 그려 남는 자리가 없다
  A.RINGS = {
    enemy_fan: [[0.575, 0.49, 0.152, function () { return {}; }]],
    enemy_speaker: [[0.33, 0.62, 0.215, function (o) { var k = 1 + max(0, sin(o.t * 12)) * 0.05 + max(0, o.act) * 0.14; return { sx: k, sy: k }; }]],
    boss_dustking: [[0.482, 0.807, 0.082, function (o) { return { a: -o.t * 8 * (0.15 + o.walk) }; }], [0.897, 0.807, 0.082, function (o) { return { a: -o.t * 8 * (0.15 + o.walk) }; }]],
    boss_overlord: [[0.487, 0.362, 0.062, function (o) { var k = 1 + max(0, sin(o.t * 14)) * 0.12 + max(0, o.act) * 0.15; return { sx: k, sy: k }; }]]
  };

  function canvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  var ringCache = {};
  function rings(im, name) {
    if (ringCache[name]) return ringCache[name];
    var W = im.width, H = im.height;
    ringCache[name] = (A.RINGS[name] || []).map(function (d) {
      var r = d[2] * W, c = canvas(r * 2, r * 2), g = c.getContext('2d');
      g.beginPath(); g.arc(r, r, r, 0, TAU); g.clip(); g.drawImage(im, r - d[0] * W, r - d[1] * H);
      return { c: c, r: r, x: d[0] * W, y: d[1] * H, f: d[3] };
    });
    return ringCache[name];
  }
  function place(c, m, px, py, W, H) {
    c.translate(px + (m.dx || 0) * W, py + (m.dy || 0) * H);
    if (m.a) c.rotate(m.a);
    if (m.sx != null || m.sy != null) c.scale(m.sx == null ? 1 : m.sx, m.sy == null ? 1 : m.sy);
  }
  function part(c, atlas, q, f, o, W, H) {
    c.save();
    if (f) place(c, f(o), q.px, q.py, W, H); else c.translate(q.px, q.py);
    c.drawImage(atlas, q.sx, 0, q.w, q.h, q.x - q.px, q.y - q.py, q.w, q.h);
    c.restore();
  }
  // 그리기: cx 가운데, by 발밑, h 높이, o.atlas 오려 둔 그림, o.flip 좌우 뒤집기, o.anchor 가운데로 볼 자리(0~1), o.sx·o.sy 전체 늘이기, o.rot 전체 기울기
  A.draw = function (c, im, name, cx, by, h, o) {
    var W = im.width, H = im.height, k = h / H, rig = TS.RIGS && TS.RIGS[name], atlas = o.atlas, move = A.MOVE[name.replace(/^sk_[a-z]+_/, '')], i, q;
    if (o.maxW && W * k > o.maxW) k = o.maxW / W;
    c.save();
    c.translate(cx, by);
    c.scale((o.flip ? -1 : 1) * (o.sx || 1) * k, (o.sy || 1) * k);
    if (o.rot) { c.translate(0, -H / 2); c.rotate(o.rot); c.translate(0, H / 2); }
    c.translate(-W * (o.anchor == null ? 0.5 : o.anchor), -H);
    if (!rig || !atlas || !move) c.drawImage(im, 0, 0);
    else {
      for (i = 0; i < rig.parts.length; i++) { q = rig.parts[i]; if (q.back) part(c, atlas, q, move[q.id], o, W, H); }
      c.drawImage(atlas, 0, 0, W, H, 0, 0, W, H);
      for (i = 0; i < rig.parts.length; i++) { q = rig.parts[i]; if (!q.back) part(c, atlas, q, move[q.id], o, W, H); }
    }
    rings(im, name).forEach(function (r) { c.save(); place(c, r.f(o), r.x, r.y, W, H); c.drawImage(r.c, -r.r, -r.r); c.restore(); });
    if (o.over) o.over(c, W, H);
    c.restore();
  };
})(window.TinSquad);
