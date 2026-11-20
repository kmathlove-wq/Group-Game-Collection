// ===== baseball/js/rules.js =====
// 풀카운트 야구의 규칙·물리(화면을 모름). 브라우저(window.Baseball.Rules)와 Node(서버·시험)가 함께 쓴다.
// 좌표(m): 홈플레이트 = (0,0,0), y = 위, 투수판 = z -18.44, 중견수 쪽 = -z, 1루 = +x(포수 쪽에서 보면 오른쪽).
// 공의 물리: 중력 + 공기 저항(속도²에 비례) + 마그누스 힘(공이 돌면서 휘는 힘). 실제 야구공 무게·크기를 쓴다.
// 투구: 구종·목표 위치·제구 → 공을 놓는 순간의 속도를 거꾸로 맞춰(조준) 홈플레이트를 지나는 위치를 정한다.
// 타격: 스윙 타이밍(공이 홈을 지나는 순간과의 차이 dt초)과 타격 원 위치 → 맞으면 타구 속도·발사각·방향.
// 타구: 같은 물리로 날려 보내고, 수비수가 제때 닿는지 계산해 안타·아웃·홈런·병살·주자 진루를 정한다.
(function (root) {
  'use strict';

  // ---------- 상수 ----------
  var G = 9.81, MASS = 0.145, R_BALL = 0.0366, AREA = Math.PI * R_BALL * R_BALL, RHO = 1.2, CD = 0.36;
  var K_DRAG = 0.5 * RHO * CD * AREA / MASS;                  // 공기 저항 세기
  var K_MAG = 0.78 * 0.5 * RHO * AREA / MASS;                   // 마그누스 세기(× 양력계수, 실측 휘는 양에 맞춰 0.78배)
  var RUBBER_Z = -18.44, BASE = 27.43;
  var BASES = [[0, 0], [19.4, -19.4], [0, -38.8], [-19.4, -19.4]];   // 홈·1루·2루·3루 (x, z)
  var ZONE = { x: 0.2159 + R_BALL, low: 0.48, high: 1.05 };     // 스트라이크 존(공 반지름까지 걸치면 스트라이크)
  var FENCE_H = 3.2;
  var SWING_DELAY = 0.18;                                       // 클릭 → 배트에 맞는 순간까지(초)
  var PITCH_RELEASE = 54 / 30;                                  // 투구 동작에서 공을 놓는 순간(블렌더 54칸)
  var BAT_R = 0.11;                                             // 타격 원 반지름(m)
  var RUN_SPEED = 7.6;

  var PITCHES = {
    fastball: { name: '직구', kmh: 148, spread: 3, rpm: 2300, axis: [-0.95, -0.3, 0] },
    slider: { name: '슬라이더', kmh: 135, spread: 3, rpm: 2400, axis: [0.15, 0.45, 0.88] },
    curve: { name: '커브', kmh: 120, spread: 3, rpm: 2600, axis: [0.8, 0.45, 0.4] },
    changeup: { name: '체인지업', kmh: 129, spread: 3, rpm: 1700, axis: [-0.75, -0.55, 0.35] },
  };
  var PITCH_KEYS = ['fastball', 'slider', 'curve', 'changeup'];

  // 팀 6개(실제 구단과 겹치지 않는 이름). 색은 블렌더 재질 이름(bb_jersey …)에 그대로 입힌다
  var TEAMS = [
    { id: 'whales', name: '블루 웨일즈', short: '웨일즈', emoji: '🐋', jersey: '#f4f6fa', pants: '#eef0f4', cap: '#0b2e6b', accent: '#1f6feb', sock: '#0b2e6b', number: '#1f6feb' },
    { id: 'foxes', name: '레드 폭스', short: '폭스', emoji: '🦊', jersey: '#d5d8de', pants: '#d5d8de', cap: '#8b1414', accent: '#d62828', sock: '#8b1414', number: '#b31d1d' },
    { id: 'dragons', name: '그린 드래곤즈', short: '드래곤즈', emoji: '🐉', jersey: '#f6f4ec', pants: '#f0eee4', cap: '#0f4d2c', accent: '#1f8a4c', sock: '#0f4d2c', number: '#1f8a4c' },
    { id: 'unicorns', name: '퍼플 유니콘즈', short: '유니콘즈', emoji: '🦄', jersey: '#4b2a86', pants: '#eceaf3', cap: '#2e1859', accent: '#f2c94c', sock: '#2e1859', number: '#f2c94c' },
    { id: 'thunder', name: '오렌지 썬더', short: '썬더', emoji: '⚡', jersey: '#1e1f24', pants: '#2a2c33', cap: '#111215', accent: '#ff7a00', sock: '#ff7a00', number: '#ff7a00' },
    { id: 'penguins', name: '스카이 펭귄즈', short: '펭귄즈', emoji: '🐧', jersey: '#9fd8ff', pants: '#f4f6fa', cap: '#0b3d91', accent: '#0b3d91', sock: '#0b3d91', number: '#0b3d91' },
  ];

  // 수비 위치(번호 1~9: 투수·포수·1루·2루·3루·유격·좌익·중견·우익)
  var FIELDERS = [
    { pos: 1, key: 'P', name: '투수', x: 0, z: -17.6, speed: 6.4, react: 0.3 },
    { pos: 2, key: 'C', name: '포수', x: 0, z: 1.1, speed: 5.8, react: 0.35 },
    { pos: 3, key: '1B', name: '1루수', x: 17.2, z: -23.2, speed: 6.4, react: 0.22 },
    { pos: 4, key: '2B', name: '2루수', x: 9.5, z: -33.5, speed: 6.8, react: 0.2 },
    { pos: 5, key: '3B', name: '3루수', x: -17.4, z: -22.6, speed: 6.4, react: 0.2 },
    { pos: 6, key: 'SS', name: '유격수', x: -9.8, z: -34, speed: 6.9, react: 0.2 },
    { pos: 7, key: 'LF', name: '좌익수', x: -38, z: -73, speed: 7.3, react: 0.32 },
    { pos: 8, key: 'CF', name: '중견수', x: 0, z: -89, speed: 7.6, react: 0.3 },
    { pos: 9, key: 'RF', name: '우익수', x: 38, z: -73, speed: 7.3, react: 0.32 },
  ];

  // ---------- 씨앗 난수 ----------
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rand) {                                        // 종 모양(정규) 난수
    var u = Math.max(1e-9, rand()), v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function fenceDist(sprayDeg) {                                // 담장까지 거리: 좌우 98m, 좌중·우중 115m, 가운데 122m
    var a = clamp(Math.abs(sprayDeg), 0, 45) * Math.PI / 90;
    return 98 + 24 * Math.cos(a);
  }
  function sprayOf(x, z) { return Math.atan2(x, -z) * 180 / Math.PI; }  // 0 = 가운데, - = 왼쪽(3루 쪽)
  function isFairAngle(deg) { return Math.abs(deg) <= 45; }

  // ---------- 공 물리 ----------
  // 가속도 = 중력 + 공기 저항 + 마그누스(ω × v 방향, 크기는 양력계수 CL로)
  function accel(v, w, out) {
    var speed = Math.hypot(v[0], v[1], v[2]) || 1e-6;
    var wmag = Math.hypot(w[0], w[1], w[2]);
    var ax = -K_DRAG * speed * v[0], ay = -K_DRAG * speed * v[1] - G, az = -K_DRAG * speed * v[2];
    if (wmag > 0) {
      var S = R_BALL * wmag / speed;                            // 회전 비율
      var CL = 1 / (2.32 + 0.4 / Math.max(S, 1e-4));
      var cx = w[1] * v[2] - w[2] * v[1], cy = w[2] * v[0] - w[0] * v[2], cz = w[0] * v[1] - w[1] * v[0];
      var cm = Math.hypot(cx, cy, cz);
      if (cm > 1e-9) {
        var f = K_MAG * CL * speed * speed / cm;
        ax += cx * f; ay += cy * f; az += cz * f;
      }
    }
    out[0] = ax; out[1] = ay; out[2] = az;
    return out;
  }

  // 한 걸음(중간점 방식 — 그냥 더하는 것보다 정확)
  var _a = [0, 0, 0], _b = [0, 0, 0];
  function rk2(p, v, w, dt) {
    accel(v, w, _a);
    var vm = [v[0] + _a[0] * dt / 2, v[1] + _a[1] * dt / 2, v[2] + _a[2] * dt / 2];
    accel(vm, w, _b);
    p[0] += vm[0] * dt; p[1] += vm[1] * dt; p[2] += vm[2] * dt;
    v[0] += _b[0] * dt; v[1] += _b[1] * dt; v[2] += _b[2] * dt;
  }

  var DT = 1 / 500;
  function rpmToRad(rpm) { return rpm * 2 * Math.PI / 60; }
  function spinVec(axis, rpm) {
    var m = Math.hypot(axis[0], axis[1], axis[2]) || 1, k = rpmToRad(rpm) / m;
    return [axis[0] * k, axis[1] * k, axis[2] * k];
  }

  // 투구를 홈플레이트(z = 0)까지 날려 지나는 곳(x, y)과 시간
  function flyPitch(release, v0, w) {
    var p = release.slice(), v = v0.slice(), t = 0;
    while (p[2] < 0 && t < 2) {
      var pz = p[2], px = p[0], py = p[1];
      rk2(p, v, w, DT);
      t += DT;
      if (p[2] >= 0) {                                          // 지나친 만큼 되돌려 정확히 z = 0
        var k = (0 - pz) / (p[2] - pz);
        return { x: px + (p[0] - px) * k, y: py + (p[1] - py) * k, t: t - DT + DT * k, v: v.slice() };
      }
    }
    return { x: p[0], y: p[1], t: t, v: v };
  }

  function pitchPath(pitch, step) {                             // 그리기용 위치 목록 [t, x, y, z]
    step = step || 1 / 120;
    var p = pitch.release.slice(), v = pitch.v0.slice(), t = 0, out = [[0, p[0], p[1], p[2]]], next = step;
    while (p[2] < 1.6 && t < 2 && p[1] > 0) {
      rk2(p, v, pitch.spin, DT);
      t += DT;
      if (t >= next) { out.push([t, p[0], p[1], p[2]]); next += step; }
    }
    return out;
  }

  // 투구 만들기: 구종 + 목표(x, y) + 제구 흔들림(sigma m)
  function makePitch(type, target, control, rand) {
    var info = PITCHES[type] || PITCHES.fastball;
    rand = rand || Math.random;
    var sigma = control == null ? 0.05 : control;
    var aim = { x: target.x + gauss(rand) * sigma, y: target.y + gauss(rand) * sigma };
    aim.x = clamp(aim.x, -1.0, 1.0); aim.y = clamp(aim.y, 0.05, 2.0);
    var kmh = info.kmh + (rand() * 2 - 1) * info.spread;
    var speed = kmh / 3.6;
    var release = [-0.5, 1.85, RUBBER_Z + 1.6];
    var w = spinVec(info.axis, info.rpm * (0.95 + rand() * 0.1));
    // 거꾸로 맞추기: 겨냥점을 옮겨 가며 실제로 지나는 곳이 목표가 되게(4번 고치면 1mm 안쪽)
    var gx = aim.x, gy = aim.y, cross = null, v0 = null;
    for (var it = 0; it < 6; it++) {
      var dx = gx - release[0], dy = gy - release[1], dz = 0 - release[2], dl = Math.hypot(dx, dy, dz);
      v0 = [dx / dl * speed, dy / dl * speed, dz / dl * speed];
      cross = flyPitch(release, v0, w);
      gx += aim.x - cross.x; gy += aim.y - cross.y;
      if (Math.abs(aim.x - cross.x) < 0.001 && Math.abs(aim.y - cross.y) < 0.001) break;
    }
    var inZone = Math.abs(cross.x) <= ZONE.x && cross.y >= ZONE.low && cross.y <= ZONE.high;
    return { type: type, name: info.name, kmh: Math.round(kmh), release: release, v0: v0, spin: w,
      cross: { x: cross.x, y: cross.y, t: cross.t }, inZone: inZone, plateKmh: Math.round(Math.hypot(cross.v[0], cross.v[1], cross.v[2]) * 3.6) };
  }

  // ---------- 타격 ----------
  // swing = null(안 침) 또는 { dt: 맞는 순간 - 공이 홈을 지나는 순간(초, -는 빠름), x, y: 타격 원 가운데 }
  function resolveSwing(pitch, swing, rand) {
    rand = rand || Math.random;
    var c = pitch.cross;
    if (!swing) return { kind: pitch.inZone ? 'strike' : 'ball', called: true };
    var dt = Number(swing.dt), sx = Number(swing.x), sy = Number(swing.y);
    if (!isFinite(dt) || !isFinite(sx) || !isFinite(sy)) return { kind: 'strike', swing: true, miss: true };
    var reach = BAT_R + R_BALL;
    var dist = Math.hypot(c.x - sx, c.y - sy);
    if (Math.abs(dt) > 0.09 || dist > reach) return { kind: 'strike', swing: true, miss: true, dt: dt, dist: dist };
    var qt = 1 - Math.pow(Math.abs(dt) / 0.09, 1.5);
    var qs = 1 - Math.pow(dist / reach, 2);
    var q = clamp(qt * qs, 0, 1);
    var dyRel = clamp((c.y - sy) / reach, -1, 1);               // 공이 원 가운데보다 위 → 배트가 공 아래를 맞음 → 뜬공
    var la = 8 + dyRel * 42 + gauss(rand) * 5;
    var spray = clamp(dt / 0.09, -1, 1) * 80 + clamp((c.x - sx) / reach, -1, 1) * 12 + gauss(rand) * 7;
    if (q < 0.3) {                                              // 빗맞음 → 파울(뒤로 튀거나 옆으로)
      return { kind: 'foul', swing: true, q: q, la: la, spray: spray < 0 ? -70 - rand() * 40 : 70 + rand() * 40, ev: 60 + 40 * q };
    }
    var ev = (70 + 110 * Math.pow(q, 0.75) + (pitch.plateKmh - 130) * 0.12) * (0.97 + rand() * 0.06);  // 타구 속도 km/h
    ev = clamp(ev, 40, 185);
    if (!isFairAngle(spray)) return { kind: 'foul', swing: true, q: q, la: la, spray: spray, ev: ev };
    return { kind: 'inplay', swing: true, q: q, ev: ev, la: clamp(la, -35, 75), spray: spray, perfect: q > 0.85 };
  }

  // ---------- 타구 날리기(땅에 튀고 굴러가고 담장에 맞음) ----------
  function flyBatted(ev, la, spray, rand) {
    var sp = ev / 3.6, L = la * Math.PI / 180, S = spray * Math.PI / 180;
    var dir = [Math.sin(S) * Math.cos(L), Math.sin(L), -Math.cos(S) * Math.cos(L)];
    var v = [dir[0] * sp, dir[1] * sp, dir[2] * sp], p = [0.3 * Math.sin(S), 0.95, -0.4];
    var rpm = clamp(1200 + la * 40, 600, 3200);                 // 뜬공일수록 역회전이 많다
    var w = spinVec([-dir[2], 0, dir[0]], rpm);                  // 역회전 축 = 진행방향 × 위(공이 떠오르는 힘)
    var path = [[0, p[0], p[1], p[2]]], t = 0, next = 1 / 60, step = 1 / 60;
    var landed = null, hr = false, wallHit = false, bounces = 0, rolling = false;
    while (t < 9) {
      if (rolling) {                                             // 땅을 구르기: 잔디 마찰로 느려짐
        var hs = Math.hypot(v[0], v[2]);
        if (hs < 0.25) break;
        var dec = Math.max(0, hs - 2.6 * DT) / hs;
        v[0] *= dec; v[2] *= dec; v[1] = 0;
        p[0] += v[0] * DT; p[2] += v[2] * DT; p[1] = R_BALL;
      } else {
        rk2(p, v, bounces ? [w[0] * 0.3, w[1] * 0.3, w[2] * 0.3] : w, DT);
      }
      t += DT;
      var dist = Math.hypot(p[0], p[2]), ang = sprayOf(p[0], p[2]);
      if (!wallHit && !hr && isFairAngle(ang) && dist >= fenceDist(ang)) {
        if (!landed && p[1] > FENCE_H) { hr = true; }            // 담장을 넘김
        else {                                                    // 담장에 맞고 튀어나옴
          wallHit = true;
          var nx = p[0] / dist, nz = p[2] / dist, dot = v[0] * nx + v[2] * nz;
          v[0] = (v[0] - 2 * dot * nx) * 0.35; v[2] = (v[2] - 2 * dot * nz) * 0.35;
          var back = fenceDist(ang) - 0.3;
          p[0] = nx * back; p[2] = nz * back;
        }
      }
      if (!rolling && p[1] <= R_BALL && v[1] < 0) {               // 땅에 닿음
        if (!landed) landed = { t: t, x: p[0], z: p[2], dist: dist, angle: ang };
        if (hr) break;
        bounces += 1;
        p[1] = R_BALL;
        var soft = la < 10 ? 0.5 : 0.38;
        v[1] = -v[1] * soft;
        v[0] *= 0.72; v[2] *= 0.72;
        if (Math.abs(v[1]) < 1.2) rolling = true;
      }
      if (t >= next) { path.push([t, p[0], p[1], p[2]]); next += step; }
      if (hr && t > 1 && p[1] < 2) break;
    }
    path.push([t, p[0], p[1], p[2]]);
    if (!landed) landed = { t: t, x: p[0], z: p[2], dist: Math.hypot(p[0], p[2]), angle: sprayOf(p[0], p[2]) };
    return { path: path, landed: landed, hr: hr, wallHit: wallHit, end: { t: t, x: p[0], z: p[2] } };
  }

  function sampleAt(path, t) {
    if (t <= path[0][0]) return path[0];
    for (var i = 1; i < path.length; i++) {
      if (path[i][0] >= t) {
        var a = path[i - 1], b = path[i], k = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
        return [t, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
      }
    }
    return path[path.length - 1];
  }

  function runTime(fromBase, toBase) {                          // 주자가 베이스 사이를 달리는 시간(모퉁이마다 조금 느려짐)
    var n = toBase - fromBase;
    return n <= 0 ? 0 : 0.3 + n * BASE / RUN_SPEED + (n - 1) * 0.35;
  }
  function throwTime(x, z, base) {
    var b = BASES[base % 4];
    return 0.55 + Math.hypot(b[0] - x, b[1] - z) / 33;
  }

  // ---------- 수비: 누가 언제 공에 닿나 ----------
  function fieldBall(fly) {
    var path = fly.path, best = null;
    for (var fi = 0; fi < FIELDERS.length; fi++) {
      var f = FIELDERS[fi];
      if (f.key === 'C' && fly.landed.dist > 8) continue;
      for (var i = 0; i < path.length; i++) {
        var s = path[i], tt = s[0];
        if (tt < 0.15) continue;
        if (s[2] > 2.3) continue;                                 // 손이 닿는 높이(점프 포함)
        var air = !(fly.landed && tt >= fly.landed.t - 1e-6);
        if (!air && s[2] > 1.2) continue;
        var d = Math.hypot(s[1] - f.x, s[3] - f.z);
        // 반응 + 출발 가속(멀리 뛸 때만 0.45초) + 달리기. 글러브가 닿는 거리: 뜬공 0.7m, 땅볼 1m
        var run = Math.max(0, d - (air ? 0.7 : 1.0));
        var need = f.react + (run > 1.5 ? 0.3 : 0) + run / f.speed;
        if (need <= tt) {
          if (!best || tt < best.t) best = { t: tt, x: s[1], z: s[3], y: s[2], fielder: fi, air: air };
          break;
        }
      }
    }
    return best;
  }

  // ---------- 타구 결과(안타·아웃·진루) ----------
  // bases: [1루, 2루, 3루] 에 주자가 있으면 true. 결과: { result, outs, runs, bases, ... 그리기 정보 }
  function resolveInPlay(contact, bases, outs, rand) {
    rand = rand || Math.random;
    var fly = flyBatted(contact.ev, contact.la, contact.spray, rand);
    var play = { contact: contact, path: fly.path, landed: fly.landed, hr: fly.hr, runners: [], throws: [] };
    var on = [Boolean(bases[0]), Boolean(bases[1]), Boolean(bases[2])];
    var runs = 0, newBases = [false, false, false], outsAdd = 0;
    function advance(list) {                                      // list: [시작베이스(0=타자), 도착베이스(4=득점), 아웃?]
      list.forEach(function (r) {
        play.runners.push({ from: r[0], to: r[1], out: Boolean(r[2]) });
        if (r[2]) outsAdd += 1;
        else if (r[1] >= 4) runs += 1;
        else newBases[r[1] - 1] = true;
      });
    }
    function forced(k) {                                          // k번 베이스 주자가 밀려나는지
      if (k === 1) return true;
      if (k === 2) return on[0];
      if (k === 3) return on[0] && on[1];
      return false;
    }

    if (fly.hr) {
      play.result = 'hr';
      var list = [[0, 4]];
      for (var b = 3; b >= 1; b--) if (on[b - 1]) list.push([b, 4]);
      advance(list);
    } else {
      var caught = fieldBall(fly);
      play.fielded = caught;
      if (caught && caught.air) {                                 // 뜬공·직선타 잡힘 → 타자 아웃
        play.result = fly.landed.dist > 60 ? 'flyout' : contact.la > 25 ? 'popout' : 'lineout';
        var lst = [[0, 0, true]];
        // 희생플라이: 3루 주자, 2아웃 전, 멀리 잡힘 → 홈인
        if (on[2] && outs < 2 && fly.landed.dist > 62) lst.push([3, 4]);
        else if (on[2]) lst.push([3, 3]);
        if (on[1]) lst.push([2, 2]);
        if (on[0]) lst.push([1, 1]);
        advance(lst);
        play.throws.push({ t: caught.t + 0.5, from: [caught.x, caught.z], to: 2, arrive: caught.t + throwTime(caught.x, caught.z, 2) });
      } else if (caught && FIELDERS[caught.fielder].pos <= 6) {   // 내야 땅볼을 잡음
        var tField = caught.t, toFirst = tField + throwTime(caught.x, caught.z, 1);
        var batterAt1 = 0.25 + runTime(0, 1);
        var lst2 = [];
        var dp = false;
        if (on[0] && outs < 2) {                                  // 병살 시도: 2루 → 1루
          var to2 = tField + throwTime(caught.x, caught.z, 2), runner2 = runTime(1, 2) - 4 / RUN_SPEED;   // 1루 주자는 4m 리드
          if (to2 < runner2) {
            lst2.push([1, 2, true]);
            play.throws.push({ t: tField + 0.4, from: [caught.x, caught.z], to: 2, arrive: to2 });
            var relay = to2 + 1.0 + BASE / 31;                     // 2루에서 받아 몸을 돌려(피벗) 1루로
            if (relay < batterAt1) { lst2.push([0, 1, true]); dp = true; play.throws.push({ t: to2 + 0.4, from: BASES[2], to: 1, arrive: relay }); }
            else lst2.push([0, 1]);
          }
        }
        if (!lst2.length) {
          var out1 = toFirst < batterAt1;
          play.throws.push({ t: tField + 0.4, from: [caught.x, caught.z], to: 1, arrive: toFirst });
          lst2.push([0, 1, out1]);
          if (on[0]) lst2.push([1, 2]);
        }
        // 나머지 주자: 밀려나면 한 베이스, 아니면 3루 주자는 땅볼에 홈으로(2아웃 아니면)
        if (on[1]) lst2.push([2, forced(2) ? 3 : 2]);
        if (on[2]) lst2.push([3, forced(3) || (outs < 2 && !dp) ? 4 : 3]);
        advance(lst2);
        var batterOut = play.runners.some(function (r) { return r.from === 0 && r.out; });
        play.result = dp ? 'dp' : batterOut ? 'groundout' : on[0] && play.runners.some(function (r) { return r.from === 1 && r.out; }) ? 'fc' : 'single';
        if (play.result === 'single') play.infieldHit = true;
      } else {                                                    // 외야로 빠진 안타: 공을 주울 때까지 걸린 시간으로 몇 루까지 갈지
        var tr = caught ? caught.t : fly.end.t + 1.2;
        var rx = caught ? caught.x : fly.end.x, rz = caught ? caught.z : fly.end.z;
        var k = 1;
        for (var kk = 2; kk <= 3; kk++) {
          if (runTime(0, kk) + 0.25 + 0.4 < tr + throwTime(rx, rz, kk)) k = kk;
        }
        if (fly.wallHit && k < 2) k = 2;
        play.result = k === 1 ? 'single' : k === 2 ? 'double' : 'triple';
        var lst3 = [[0, k]];
        for (var rb = 3; rb >= 1; rb--) {
          if (!on[rb - 1]) continue;
          var extra = k;
          if (k === 1 && rb === 2 && tr > 2.4) extra = 2;          // 단타에 2루 주자 홈인
          if (k === 1 && rb === 1 && tr > 3.6) extra = 2;          // 단타에 1루 주자 3루까지
          lst3.push([rb, Math.min(4, rb + extra)]);
        }
        advance(lst3);
        play.throws.push({ t: tr + 0.5, from: [rx, rz], to: 2, arrive: tr + throwTime(rx, rz, 2) });
      }
    }
    if (outs + outsAdd >= 3) {                                    // 3아웃이면 그 뒤 득점은 없음(포스 아웃 포함, 단순화)
      runs = play.result === 'hr' ? runs : 0;
      if (play.result !== 'hr') play.runners.forEach(function (r) { if (r.to >= 4 && !r.out) r.to = r.from; });
    }
    play.outsAdd = outsAdd;
    play.runs = runs;
    play.bases = newBases;
    play.hit = ['single', 'double', 'triple', 'hr'].indexOf(play.result) >= 0;
    play.duration = Math.min(9, Math.max(3.2, (play.fielded ? play.fielded.t : fly.landed.t) + 2.6));
    if (fly.hr) play.duration = Math.max(5, fly.landed.t + 2.5);
    return play;
  }

  // ---------- 컴퓨터(인공지능) ----------
  var LEVELS = { easy: { bat: 1.6, ctrl: 0.09, eye: 0.6 }, normal: { bat: 1.0, ctrl: 0.06, eye: 1 }, hard: { bat: 0.7, ctrl: 0.04, eye: 1.3 } };

  function aiChoosePitch(state, rand) {
    var lv = LEVELS[state.level] || LEVELS.normal;
    var r = rand(), type = r < 0.45 ? 'fastball' : r < 0.68 ? 'slider' : r < 0.85 ? 'changeup' : 'curve';
    var inZone = rand() < (state.balls >= 3 ? 0.75 : state.strikes >= 2 ? 0.4 : 0.54);
    var x, y;
    if (inZone) { x = (rand() * 2 - 1) * ZONE.x * 0.85; y = ZONE.low + 0.06 + rand() * (ZONE.high - ZONE.low - 0.12); }
    else {
      var side = rand();
      x = side < 0.5 ? (rand() < 0.5 ? -1 : 1) * (ZONE.x + 0.04 + rand() * 0.15) : (rand() * 2 - 1) * ZONE.x;
      y = side < 0.5 ? ZONE.low + rand() * (ZONE.high - ZONE.low) : (rand() < 0.7 ? ZONE.low - 0.05 - rand() * 0.2 : ZONE.high + 0.05 + rand() * 0.15);
    }
    if (type === 'curve' || type === 'changeup') y -= 0.05;
    return { type: type, target: { x: x, y: y }, control: lv.ctrl };
  }

  function aiSwing(state, pitch, rand) {
    var lv = LEVELS[state.level] || LEVELS.normal;
    var c = pitch.cross;
    var outBy = Math.max(Math.abs(c.x) - ZONE.x, ZONE.low - c.y, c.y - ZONE.high, 0);
    var p;
    if (pitch.inZone) p = state.strikes >= 2 ? 0.86 : 0.66;
    else p = Math.max(0, (state.strikes >= 2 ? 0.42 : 0.28) * (1 - outBy / 0.28)) / lv.eye;
    if (state.balls === 3 && state.strikes < 2 && !pitch.inZone) p *= 0.5;
    if (rand() >= p) return null;
    var bias = pitch.type === 'changeup' ? -0.022 : pitch.type === 'curve' ? -0.016 : 0;
    var spatial = { fastball: 0.07, slider: 0.1, curve: 0.105, changeup: 0.095 }[pitch.type] * lv.bat;
    return {
      dt: bias + gauss(rand) * 0.05 * lv.bat,
      x: c.x + gauss(rand) * spatial,
      y: c.y + gauss(rand) * spatial,
    };
  }

  // ---------- 경기 진행 ----------
  function createGame(options) {
    options = options || {};
    var seed = options.seed == null ? (Math.random() * 1e9) >>> 0 : options.seed;
    return {
      seed: seed, rand: rng(seed), pitchNo: 0,
      innings: options.innings || 3, inning: 1, half: 'top',     // top = 원정(away) 공격
      teams: { away: options.away || 'foxes', home: options.home || 'whales' },
      level: options.level || 'normal',
      outs: 0, balls: 0, strikes: 0, bases: [false, false, false],
      score: { away: 0, home: 0 }, hits: { away: 0, home: 0 }, line: { away: [], home: [] },
      battingOrder: { away: 0, home: 0 },
      over: false, winner: null, log: [],
    };
  }
  function battingSide(s) { return s.half === 'top' ? 'away' : 'home'; }
  function fieldingSide(s) { return s.half === 'top' ? 'home' : 'away'; }

  function endHalf(s) {
    var side = battingSide(s);
    s.line[side][s.inning - 1] = s.line[side][s.inning - 1] || 0;
    s.outs = 0; s.balls = 0; s.strikes = 0; s.bases = [false, false, false];
    if (s.half === 'top') {
      // 마지막 이닝 초가 끝났는데 홈팀이 이기고 있으면 경기 끝(말 공격 없음)
      if (s.inning >= s.innings && s.score.home > s.score.away) return finishGame(s);
      s.half = 'bottom';
    } else {
      if (s.inning >= s.innings && s.score.home !== s.score.away) return finishGame(s);
      if (s.inning >= s.innings + 3) return finishGame(s);       // 연장 3회까지, 그래도 같으면 무승부
      s.inning += 1; s.half = 'top';
    }
    s.line[battingSide(s)][s.inning - 1] = s.line[battingSide(s)][s.inning - 1] || 0;
    return s;
  }
  function finishGame(s) {
    s.over = true;
    s.winner = s.score.home > s.score.away ? 'home' : s.score.away > s.score.home ? 'away' : null;
    return s;
  }
  function addRuns(s, n) {
    if (!n) return;
    var side = battingSide(s);
    s.score[side] += n;
    s.line[side][s.inning - 1] = (s.line[side][s.inning - 1] || 0) + n;
    // 끝내기: 마지막 이닝(또는 연장) 말에 홈팀이 앞서면 바로 끝
    if (s.half === 'bottom' && s.inning >= s.innings && s.score.home > s.score.away) finishGame(s);
  }
  function nextBatter(s) {
    var side = battingSide(s);
    s.battingOrder[side] = (s.battingOrder[side] + 1) % 9;
    s.balls = 0; s.strikes = 0;
  }

  // 공 하나의 결과를 경기 상태에 반영. 돌려주는 값: { call: 화면에 띄울 말, play(타구면) }
  function applyPitch(s, pitch, swingResult, rand) {
    rand = rand || s.rand;
    s.pitchNo += 1;
    var out = { pitch: pitch, swing: swingResult, call: '', kind: swingResult.kind };
    if (!s.line[battingSide(s)][s.inning - 1]) s.line[battingSide(s)][s.inning - 1] = 0;
    if (swingResult.kind === 'ball') {
      s.balls += 1;
      out.call = '볼';
      if (s.balls >= 4) {                                         // 볼넷: 밀려나는 주자만 한 베이스씩
        out.call = '볼넷';
        out.event = 'walk';
        var b = s.bases, runs = 0;
        if (b[0]) { if (b[1]) { if (b[2]) runs = 1; b[2] = true; } b[1] = true; }
        b[0] = true;
        addRuns(s, runs);
        out.runs = runs;
        nextBatter(s);
      }
    } else if (swingResult.kind === 'strike') {
      s.strikes += 1;
      out.call = swingResult.called ? '스트라이크' : '헛스윙';
      if (s.strikes >= 3) {
        out.call = swingResult.called ? '루킹 삼진' : '헛스윙 삼진';
        out.event = 'k';
        s.outs += 1;
        nextBatter(s);
        if (s.outs >= 3) { out.halfOver = true; endHalf(s); }
      }
    } else if (swingResult.kind === 'foul') {
      if (s.strikes < 2) s.strikes += 1;
      out.call = '파울';
    } else {
      var play = resolveInPlay(swingResult, s.bases, s.outs, rand);
      out.play = play;
      out.event = play.result;
      out.call = { single: play.infieldHit ? '내야 안타' : '안타', double: '2루타', triple: '3루타', hr: '홈런!',
        flyout: '뜬공 아웃', popout: '내야 뜬공', lineout: '직선타 아웃', groundout: '땅볼 아웃', dp: '병살!', fc: '야수 선택' }[play.result];
      if (play.hit) s.hits[battingSide(s)] += 1;
      s.outs += play.outsAdd;
      s.bases = play.bases;
      addRuns(s, play.runs);
      out.runs = play.runs;
      nextBatter(s);
      if (!s.over && s.outs >= 3) { out.halfOver = true; endHalf(s); }
    }
    s.log.push(out.call);
    if (s.log.length > 30) s.log.shift();
    return out;
  }

  // 혼자 하기 순위 점수: 득점 ×100 + 안타 ×20 + 이기면 500(어려움은 ×1.5)
  function soloScore(s, mySide) {
    var base = s.score[mySide] * 100 + s.hits[mySide] * 20 + (s.winner === mySide ? 500 : 0);
    return Math.round(base * (s.level === 'hard' ? 1.5 : s.level === 'easy' ? 0.7 : 1));
  }

  var api = {
    G: G, MASS: MASS, R_BALL: R_BALL, K_DRAG: K_DRAG, RUBBER_Z: RUBBER_Z, BASE: BASE, BASES: BASES, ZONE: ZONE, FENCE_H: FENCE_H,
    SWING_DELAY: SWING_DELAY, PITCH_RELEASE: PITCH_RELEASE, BAT_R: BAT_R, PITCHES: PITCHES, PITCH_KEYS: PITCH_KEYS, TEAMS: TEAMS,
    FIELDERS: FIELDERS, LEVELS: LEVELS,
    rng: rng, gauss: gauss, fenceDist: fenceDist, sprayOf: sprayOf, accel: accel,
    makePitch: makePitch, flyPitch: flyPitch, pitchPath: pitchPath, resolveSwing: resolveSwing,
    flyBatted: flyBatted, sampleAt: sampleAt, fieldBall: fieldBall, resolveInPlay: resolveInPlay, runTime: runTime,
    aiChoosePitch: aiChoosePitch, aiSwing: aiSwing,
    createGame: createGame, applyPitch: applyPitch, battingSide: battingSide, fieldingSide: fieldingSide, soloScore: soloScore,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.Baseball = root.Baseball || {}; root.Baseball.Rules = api; }
})(typeof self !== 'undefined' ? self : this);
