// ===== gulp-hole/js/rules.js =====
// 꿀꺽 구멍의 규칙(화면을 모름). 브라우저(window.GulpHole.Rules)와 Node 시험이 함께 쓴다.
// 도시(바둑판 블록 6×6)에 물건을 놓고, 구멍 8개(나 + 컴퓨터 7)가 2분 동안 물건과 더 작은 구멍을 삼킨다.
// 구멍보다 작은 물건이 구멍 안쪽으로 들어오면 빨려 들어가며 떨어지고, 끝까지 떨어지면 점수·몸집이 는다.
// 사람은 인도를 걷고, 차는 차선을 달린다(움직임 단계 anim 0~1은 블렌더 걷기·바퀴 동작 1초짜리의 몇 번째 자세인지).
(function (root) {
  'use strict';

  var BLOCKS = 8, CELL = 40, ROAD = 10, WALK = 3;          // 블록 칸 40m = 도로 10m + 블록 30m(인도 3m 포함)
  var MAP_MIN = -ROAD / 2, MAP_MAX = BLOCKS * CELL + ROAD / 2;
  // 차는 도시 안 도로만 달린다(벽을 뚫지 않음). 교차로(가로·세로 도로가 만나는 곳, 좌표 k·40)에서
  // 직진·좌회전·우회전 중 하나를 고르고, 맵 바깥쪽으로는 가지 않는다. 오른쪽 차선(가운데서 2.5m).
  var DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];            // +x, +z, -x, -z
  var LANE = 2.5, CROSS = ROAD / 2;                          // CROSS = 교차로 가운데에서 가장자리까지
  var HOLES = 10;                                           // 나 + 컴퓨터 9
  var DURATION = 120, RESPAWN = 3, START_R = 1.0, GROW = 0.026, MAX_R = 15;
  var GRAVITY = 24;

  // 종류: need = 삼킬 수 있는 최소 구멍 반지름, r = 바닥 차지 반지름, h = 높이, pts = 점수
  // face: 모형의 앞쪽(블렌더에서 만든 방향) — 'z'면 사람처럼 +Z가 앞, 'x'면 차처럼 +X가 앞
  var TYPES = {
    person:     { need: 0.45, r: 0.35, h: 1.9, pts: 2, models: ['person_a', 'person_b', 'person_c'], face: 'z', walker: true },
    cone:       { need: 0.4, r: 0.25, h: 0.75, pts: 1, models: ['cone'] },
    hydrant:    { need: 0.45, r: 0.3, h: 0.9, pts: 2, models: ['hydrant'] },
    trashcan:   { need: 0.5, r: 0.32, h: 1.0, pts: 2, models: ['trashcan'] },
    mailbox:    { need: 0.55, r: 0.35, h: 1.4, pts: 3, models: ['mailbox'] },
    bench:      { need: 1.05, r: 0.95, h: 0.9, pts: 6, models: ['bench'] },
    lamp:       { need: 0.95, r: 0.4, h: 4.5, pts: 6, models: ['lamp'] },
    tree_round: { need: 1.7, r: 1.4, h: 5.0, pts: 14, models: ['tree_round'] },
    tree_pine:  { need: 1.6, r: 1.4, h: 6.0, pts: 14, models: ['tree_pine'] },
    fountain:   { need: 2.6, r: 2.4, h: 3.1, pts: 40, models: ['fountain'] },
    car:        { need: 2.3, r: 2.2, h: 1.6, pts: 30, models: ['car_red', 'car_blue', 'car_yellow'], face: 'x', driver: true, wheel: 0.34, speed: 9 },
    truck:      { need: 3.4, r: 3.3, h: 3.3, pts: 60, models: ['truck'], face: 'x', driver: true, wheel: 0.45, speed: 7 },
    bus:        { need: 5.0, r: 5.0, h: 3.4, pts: 100, models: ['bus'], face: 'x', driver: true, wheel: 0.5, speed: 6.5 },
    house:      { need: 4.8, r: 4.3, h: 5.9, pts: 150, models: ['house', 'house_blue'] },
    shop:       { need: 6.0, r: 5.5, h: 5.6, pts: 200, models: ['shop', 'shop_green'] },
    apartment:  { need: 7.4, r: 7.0, h: 20.6, pts: 400, models: ['apartment'] },
    tower:      { need: 8.8, r: 8.4, h: 41, pts: 700, models: ['tower'] },
  };

  var BOT_NAMES = ['먹보 두더지', '배고픈 하마', '블랙홀', '꿀꺽대장', '싱크홀', '우주 먼지', '깊은 우물', '도넛 구멍', '맨홀왕', '쏙쏙이'];
  var COLORS = ['#ff4d6d', '#4dabf7', '#ffd43b', '#69db7c', '#b197fc', '#ff922b', '#3bc9db', '#f783ac', '#a9e34b', '#e599f7'];

  // ---------- 씨앗 난수(같은 씨앗 = 같은 도시) ----------
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
  function pick(rand, list) { return list[Math.floor(rand() * list.length)]; }

  function radiusFor(mass) { return Math.min(MAX_R, Math.sqrt(START_R * START_R + GROW * mass)); }
  function speedFor(r) { return 9 + r * 0.35; }

  // 모형 앞쪽이 (dx, dz) 방향을 보게 하는 Y축 회전값(three.js 기준)
  function faceAngle(face, dx, dz) {
    return face === 'x' ? Math.atan2(-dz, dx) : Math.atan2(dx, dz);
  }

  // ---------- 도시 만들기 ----------
  function blockKind(rand, bx, bz) {
    var mid = Math.abs(bx - (BLOCKS - 1) / 2) + Math.abs(bz - (BLOCKS - 1) / 2);
    var r = rand();
    if (mid <= 1.5) return r < 0.75 ? 'downtown' : 'mixed';      // 가운데는 빌딩 숲
    if (mid <= 3) return r < 0.25 ? 'park' : r < 0.6 ? 'mixed' : 'residential';
    return r < 0.3 ? 'park' : 'residential';
  }

  function buildCity(seed) {
    var rand = rng(seed);
    var objects = [];
    var blocks = [];
    function add(type, x, z, rot, extra) {
      var t = TYPES[type];
      var o = { id: objects.length, type: type, model: pick(rand, t.models), x: x, z: z, y: 0, rot: rot || 0,
        state: 'idle', tilt: 0, tiltDir: 0, anim: rand(), wobble: 0, owner: -1 };
      if (extra) for (var k in extra) o[k] = extra[k];
      objects.push(o);
      return o;
    }
    for (var bx = 0; bx < BLOCKS; bx++) {
      for (var bz = 0; bz < BLOCKS; bz++) {
        var x0 = bx * CELL + ROAD / 2, z0 = bz * CELL + ROAD / 2, size = CELL - ROAD;  // 블록 30m
        var kind = blockKind(rand, bx, bz);
        blocks.push({ x0: x0, z0: z0, size: size, kind: kind });
        // 블록 안쪽 2×2 칸(칸 12m) — 칸마다 큰 것 하나
        var ix0 = x0 + WALK, inner = size - 2 * WALK, q = inner / 2;
        var fills = {
          downtown: ['tower', 'apartment', 'shop', 'tower'],
          mixed: ['apartment', 'shop', 'house', 'park'],
          residential: ['house', 'house', 'house', 'park'],
          park: ['fountain'],
        }[kind].slice();
        if (kind === 'downtown' && rand() < 0.5) fills[3] = 'apartment';
        if (kind !== 'park') {
          for (var i = fills.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var tmp = fills[i]; fills[i] = fills[j]; fills[j] = tmp; }
          for (var qi = 0; qi < 4; qi++) {
            var cx = ix0 + (qi % 2 + 0.5) * q, cz = z0 + WALK + (Math.floor(qi / 2) + 0.5) * q;
            var front = Math.floor(qi / 2) === 0 ? Math.PI : 0;   // 건물 앞쪽이 가까운 길을 보게
            var what = fills[qi];
            if (what === 'park') {
              add('tree_round', cx - 3, cz - 3, rand() * 6);
              add('tree_pine', cx + 3, cz + 3, rand() * 6);
              add('tree_round', cx + 3, cz - 3, rand() * 6);
              add('bench', cx - 2.5, cz + 2.5, front);
              add('person', cx, cz + 1, 0, { path: null });
            } else {
              add(what, cx, cz, front);
              if (what === 'house') {                             // 마당 나무
                add(rand() < 0.5 ? 'tree_round' : 'tree_pine', cx + (qi % 2 ? -4.6 : 4.6), cz + 4.4, rand() * 6);
              }
            }
          }
        } else {
          var mx = x0 + size / 2, mz = z0 + size / 2;
          add('fountain', mx, mz, 0);
          for (var k = 0; k < 10; k++) {                           // 나무 둥글게
            var a = k / 10 * Math.PI * 2;
            add(k % 2 ? 'tree_pine' : 'tree_round', mx + Math.cos(a) * 9.5, mz + Math.sin(a) * 9.5, rand() * 6);
          }
          for (var b = 0; b < 4; b++) {
            var ab = b * Math.PI / 2 + Math.PI / 4;
            add('bench', mx + Math.cos(ab) * 5, mz + Math.sin(ab) * 5, faceAngle('z', -Math.cos(ab), -Math.sin(ab)));
          }
          for (var p = 0; p < 4; p++) add('person', mx + (rand() - 0.5) * 12, mz + (rand() - 0.5) * 12, rand() * 6);
        }
        // 인도 소품: 모서리 가로등, 변마다 가로수·소화전·쓰레기통·우체통·벤치
        var e = 0.7;   // 인도 바깥 가장자리에서 안쪽으로
        var sides = [
          { ax: x0, az: z0 + e, dx: 1, dz: 0, out: [0, -1] },
          { ax: x0 + size, az: z0 + size - e, dx: -1, dz: 0, out: [0, 1] },
          { ax: x0 + e, az: z0 + size, dx: 0, dz: -1, out: [-1, 0] },
          { ax: x0 + size - e, az: z0, dx: 0, dz: 1, out: [1, 0] },
        ];
        sides.forEach(function (s, si) {
          var at = function (d) { return [s.ax + s.dx * d, s.az + s.dz * d]; };
          var p1 = at(2.2), p2 = at(size / 2), p3 = at(size - 2.2);
          // 가로등 팔(+X)이 길 쪽을 보게
          add('lamp', p1[0], p1[1], Math.atan2(-s.out[1], s.out[0]));
          add('lamp', p3[0], p3[1], Math.atan2(-s.out[1], s.out[0]));
          var tA = at(size * 0.3), tB = at(size * 0.7);
          var inX = -s.out[0] * 1.4, inZ = -s.out[1] * 1.4;
          add(rand() < 0.6 ? 'tree_round' : 'tree_pine', tA[0] + inX, tA[1] + inZ, rand() * 6);
          add(rand() < 0.6 ? 'tree_round' : 'tree_pine', tB[0] + inX, tB[1] + inZ, rand() * 6);
          var small = ['hydrant', 'trashcan', 'mailbox', 'bench', 'trashcan'][Math.floor(rand() * 5)];
          var sp = at(size / 2 + (rand() - 0.5) * 6);
          add(small, sp[0], sp[1], faceAngle('z', s.out[0], s.out[1]));
          if (si % 2 === 0) add('hydrant', p2[0] - s.dx * 4, p2[1] - s.dz * 4, rand() * 6);
        });
        // 인도를 걷는 사람(블록 둘레를 돈다)
        var walkers = kind === 'downtown' ? 5 : 3;
        for (var w = 0; w < walkers; w++) {
          add('person', 0, 0, 0, { path: { x0: x0 + 1.6, z0: z0 + 1.6, len: size - 3.2, s: rand() * 4 * (size - 3.2), dir: rand() < 0.5 ? 1 : -1, speed: 1.1 + rand() * 0.5 } });
        }
      }
    }
    // 차: 도로 한 칸(교차로→다음 교차로, 한 방향)마다 많아야 한 대씩 놓는다
    var segs = [];
    for (var si2 = 0; si2 <= BLOCKS; si2++) {
      for (var sj2 = 0; sj2 <= BLOCKS; sj2++) {
        for (var d2 = 0; d2 < 4; d2++) if (canGo(si2, sj2, d2)) segs.push([si2, sj2, d2]);
      }
    }
    for (var s1 = segs.length - 1; s1 > 0; s1--) { var s2 = Math.floor(rand() * (s1 + 1)); var st = segs[s1]; segs[s1] = segs[s2]; segs[s2] = st; }
    var nCars = Math.round(segs.length * 0.4);
    for (var c = 0; c < nCars; c++) {
      var r = rand();
      var type = r < 0.1 ? 'bus' : r < 0.25 ? 'truck' : 'car';
      var cruise = TYPES[type].speed * (0.85 + rand() * 0.3);
      var car = add(type, 0, 0, 0, { i: segs[c][0], j: segs[c][1], d: segs[c][2], nd: segs[c][2], phase: 'road',
        t: rand() * (CELL - 2 * CROSS - 6), v: cruise, cruise: cruise, wait: 0, ghost: 0, hx: 1, hz: 0 });
      setPiece(car);
      placeDriver(car);
    }
    // 교차로 근처 고깔
    for (var cn = 0; cn < 24; cn++) {
      var gx = Math.floor(rand() * (BLOCKS + 1)) * CELL, gz = Math.floor(rand() * BLOCKS) * CELL + CELL / 2;
      var swap = rand() < 0.5;
      add('cone', (swap ? gz : gx) + (rand() - 0.5) * 3, (swap ? gx : gz) + (rand() - 0.5) * 8, rand() * 6);
    }
    return { objects: objects, blocks: blocks };
  }

  // ---------- 차 길 찾기 ----------
  function canGo(i, j, d) {
    var ni = i + DIRS[d][0], nj = j + DIRS[d][1];
    return ni >= 0 && nj >= 0 && ni <= BLOCKS && nj <= BLOCKS;   // 맵 밖(벽 쪽)으로는 못 감
  }
  function laneOff(d) { return [-DIRS[d][1] * LANE, DIRS[d][0] * LANE]; }   // 진행 방향의 오른쪽

  // 지금 달리는 조각(도로 직선 또는 교차로 곡선)을 2차 베지에 곡선(P0→P1→P2)으로 정한다
  function setPiece(o) {
    var d = DIRS[o.d], off = laneOff(o.d), x, z;
    if (o.phase === 'road') {
      x = o.i * CELL; z = o.j * CELL;
      var a0x = x + d[0] * CROSS + off[0], a0z = z + d[1] * CROSS + off[1];
      var a2x = x + d[0] * (CELL - CROSS) + off[0], a2z = z + d[1] * (CELL - CROSS) + off[1];
      o.p = [a0x, a0z, (a0x + a2x) / 2, (a0z + a2z) / 2, a2x, a2z, CELL - 2 * CROSS];
    } else {
      var n = DIRS[o.nd], noff = laneOff(o.nd);
      x = o.i * CELL; z = o.j * CELL;
      var p0x = x - d[0] * CROSS + off[0], p0z = z - d[1] * CROSS + off[1];
      var p1x = x + off[0] + noff[0], p1z = z + off[1] + noff[1];      // 두 차선이 만나는 점
      if (o.nd === o.d) { p1x = x + off[0]; p1z = z + off[1]; }
      var p2x = x + n[0] * CROSS + noff[0], p2z = z + n[1] * CROSS + noff[1];
      var len = (Math.hypot(p1x - p0x, p1z - p0z) + Math.hypot(p2x - p1x, p2z - p1z) + Math.hypot(p2x - p0x, p2z - p0z)) / 2;
      o.p = [p0x, p0z, p1x, p1z, p2x, p2z, Math.max(3, len)];
    }
  }

  function placeDriver(o) {
    var p = o.p, u = Math.min(1, o.t / p[6]), w = 1 - u;
    o.x = w * w * p[0] + 2 * w * u * p[2] + u * u * p[4];
    o.z = w * w * p[1] + 2 * w * u * p[3] + u * u * p[5];
    var tx = w * (p[2] - p[0]) + u * (p[4] - p[2]), tz = w * (p[3] - p[1]) + u * (p[5] - p[3]);
    var tl = Math.hypot(tx, tz) || 1;
    o.hx = tx / tl; o.hz = tz / tl;
    o.rot = faceAngle('x', o.hx, o.hz);
  }

  function chooseTurn(rand, o) {
    var straight = o.d, left = (o.d + 3) % 4, right = (o.d + 1) % 4;
    var opts = [];
    if (canGo(o.i, o.j, straight)) opts.push(straight, straight);  // 직진이 조금 더 잦다
    if (canGo(o.i, o.j, left)) opts.push(left);
    if (canGo(o.i, o.j, right)) opts.push(right);
    return opts.length ? opts[Math.floor(rand() * opts.length)] : (o.d + 2) % 4;
  }

  // ---------- 움직이는 것들 ----------
  function moveWalker(o, dt) {
    var p = o.path;
    if (!p) { o.anim = (o.anim + dt * 0.25) % 1; return; }   // 공원 사람: 제자리에서 천천히
    var per = p.len * 4;
    p.s = ((p.s + p.dir * p.speed * dt) % per + per) % per;
    var side = Math.floor(p.s / p.len), d = p.s - side * p.len;
    var x, z, dx, dz;
    if (side === 0) { x = p.x0 + d; z = p.z0; dx = 1; dz = 0; }
    else if (side === 1) { x = p.x0 + p.len; z = p.z0 + d; dx = 0; dz = 1; }
    else if (side === 2) { x = p.x0 + p.len - d; z = p.z0 + p.len; dx = -1; dz = 0; }
    else { x = p.x0; z = p.z0 + p.len - d; dx = 0; dz = -1; }
    o.x = x; o.z = z;
    o.rot = faceAngle('z', dx * p.dir, dz * p.dir);
    o.anim = (o.anim + dt * p.speed / 1.3) % 1;              // 블렌더 걷기 1초 = 약 1.3m
  }

  // 바로 앞(진행 방향 쪽, 같은 차선 폭 안)에 다른 차가 가까이 있으면 true
  function blockedAhead(state, o) {
    var list = state.drivers, me = TYPES[o.type].r;
    for (var k = 0; k < list.length; k++) {
      var b = list[k];
      if (b === o || b.state !== 'idle') continue;
      var rx = b.x - o.x, rz = b.z - o.z;
      var ahead = rx * o.hx + rz * o.hz;
      if (ahead <= 0) continue;
      var gap = me + TYPES[b.type].r * 0.8 + 1.8;
      if (ahead > gap) continue;
      if (Math.abs(rx * o.hz - rz * o.hx) < 1.9) return true;
    }
    return false;
  }

  function moveDriver(state, o, dt) {
    // 앞차가 있으면 브레이크, 없으면 원래 빠르기로. 3초 넘게 서 있으면(교차로에서 서로 기다림) 1.5초 동안 그냥 지나간다.
    var target = o.cruise;
    if (o.ghost > 0) o.ghost -= dt;
    else if (blockedAhead(state, o)) {
      target = 0;
      o.wait += dt;
      if (o.wait > 3) { o.ghost = 1.5; o.wait = 0; }
    } else o.wait = 0;
    var acc = target > o.v ? 4 : 14;
    o.v += Math.max(-acc * dt, Math.min(acc * dt, target - o.v));
    o.t += o.v * dt;
    while (o.t >= o.p[6]) {                                   // 조각 끝 → 다음 조각
      o.t -= o.p[6];
      if (o.phase === 'road') {
        o.i += DIRS[o.d][0]; o.j += DIRS[o.d][1];             // 다음 교차로에 닿음
        o.nd = chooseTurn(state.rand, o);
        o.phase = 'turn';
      } else {
        o.d = o.nd;
        o.phase = 'road';
      }
      setPiece(o);
    }
    placeDriver(o);
    o.anim = (o.anim + o.v * dt / (2 * Math.PI * TYPES[o.type].wheel)) % 1;  // 바퀴 한 바퀴 = 둘레만큼
  }

  // ---------- 게임 ----------
  function createGame(options) {
    options = options || {};
    var seed = options.seed == null ? 12345 : options.seed;
    var rand = rng(seed ^ 0x9e3779b9);
    var city = buildCity(seed);
    var holes = [];
    var names = BOT_NAMES.slice();
    for (var i = names.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = names[i]; names[i] = names[j]; names[j] = t; }
    var count = options.holes || HOLES;
    var c = (MAP_MAX + MAP_MIN) / 2, ring = (MAP_MAX - MAP_MIN) * 0.33;
    for (var h = 0; h < count; h++) {
      var a = h / count * Math.PI * 2;
      holes.push({
        id: h, name: h === 0 ? (options.playerName || '나') : names[(h - 1) % names.length], color: COLORS[h % COLORS.length],
        bot: h !== 0, x: c + Math.cos(a) * ring, z: c + Math.sin(a) * ring, vx: 0, vz: 0,
        mass: 0, score: 0, r: START_R, alive: true, respawnAt: 0, eatenBy: -1,
        think: rand() * 0.5, goalX: c, goalZ: c, skill: h === 0 ? 1 : 0.82 + rand() * 0.14,
      });
    }
    var state = {
      seed: seed, time: 0, duration: options.duration || DURATION, phase: 'playing',
      city: city, objects: city.objects, holes: holes, rand: rand,
      events: [], changed: [],
      drivers: city.objects.filter(function (o) { return TYPES[o.type].driver; }),
    };
    city.objects.forEach(function (o) {
      if (TYPES[o.type].walker) moveWalker(o, 0);
      if (TYPES[o.type].driver) moveDriver(state, o, 0);
      mark(state, o);
    });
    return state;
  }

  function mark(state, o) {
    if (!o._c) { o._c = true; state.changed.push(o); }
  }

  function clampHole(h) {
    var m = h.r * 0.7;                                         // 벽 밖으로는 구멍의 30%만 걸칠 수 있다
    h.x = Math.max(MAP_MIN + m, Math.min(MAP_MAX - m, h.x));
    h.z = Math.max(MAP_MIN + m, Math.min(MAP_MAX - m, h.z));
  }

  function moveHole(h, ix, iz, dt) {
    var len = Math.hypot(ix, iz);
    if (len > 1) { ix /= len; iz /= len; len = 1; }
    var sp = speedFor(h.r) * h.skill;
    var k = 1 - Math.exp(-dt * 10);                          // 부드럽게 출발·멈춤
    h.vx += (ix * sp - h.vx) * k;
    h.vz += (iz * sp - h.vz) * k;
    h.x += h.vx * dt;
    h.z += h.vz * dt;
    clampHole(h);
  }

  function nearestThreat(state, h, range) {
    var best = null, bd = Infinity;
    state.holes.forEach(function (o) {
      if (o === h || !o.alive || o.r < h.r * 1.2) return;
      var d = Math.hypot(o.x - h.x, o.z - h.z) - o.r;
      if (d < range && d < bd) { bd = d; best = o; }
    });
    return best;
  }

  function botThink(state, h) {
    var rand = state.rand;
    var threat = nearestThreat(state, h, 9 + h.r);
    if (threat) {                                              // 큰 구멍에게서 도망
      var ax = h.x - threat.x, az = h.z - threat.z, al = Math.hypot(ax, az) || 1;
      h.goalX = h.x + ax / al * 30 + (rand() - 0.5) * 10;
      h.goalZ = h.z + az / al * 30 + (rand() - 0.5) * 10;
      return;
    }
    var prey = null, pd = 22 + h.r;
    state.holes.forEach(function (o) {                         // 작은 구멍 쫓기
      if (o === h || !o.alive || h.r < o.r * 1.25) return;
      var d = Math.hypot(o.x - h.x, o.z - h.z);
      if (d < pd) { pd = d; prey = o; }
    });
    if (prey) { h.goalX = prey.x; h.goalZ = prey.z; return; }
    var best = null, bestScore = 0, objs = state.objects, range = 30 + h.r * 3;
    for (var i = 0; i < objs.length; i++) {                    // 먹을 수 있는 것 중 "점수 ÷ 거리"가 큰 것
      var o = objs[i];
      if (o.state !== 'idle') continue;
      var t = TYPES[o.type];
      if (t.need > h.r) continue;
      var dx = o.x - h.x, dz = o.z - h.z;
      if (Math.abs(dx) > range || Math.abs(dz) > range) continue;
      var sc = t.pts / (Math.hypot(dx, dz) + 6);
      if (sc > bestScore) { bestScore = sc; best = o; }
    }
    if (best) { h.goalX = best.x; h.goalZ = best.z; return; }
    if (Math.hypot(h.goalX - h.x, h.goalZ - h.z) < 4) {       // 갈 곳이 없으면 아무 데나
      h.goalX = MAP_MIN + rand() * (MAP_MAX - MAP_MIN);
      h.goalZ = MAP_MIN + rand() * (MAP_MAX - MAP_MIN);
    }
  }

  function respawn(state, h) {
    var rand = state.rand, best = null, bestD = -1;
    for (var tries = 0; tries < 12; tries++) {                 // 다른 구멍에서 가장 먼 길 위
      var x = Math.floor(rand() * (BLOCKS + 1)) * CELL, z = MAP_MIN + 5 + rand() * (MAP_MAX - MAP_MIN - 10);
      if (rand() < 0.5) { var t = x; x = z; z = t; }
      var d = Infinity;
      state.holes.forEach(function (o) { if (o !== h && o.alive) d = Math.min(d, Math.hypot(o.x - x, o.z - z) - o.r); });
      if (d > bestD) { bestD = d; best = [x, z]; }
    }
    h.x = best[0]; h.z = best[1]; h.vx = h.vz = 0;
    h.mass = 0; h.r = START_R; h.alive = true; h.eatenBy = -1;
    state.events.push({ type: 'respawn', hole: h.id });
  }

  function startFall(state, o, h) {
    o.state = 'fall';
    o.owner = h.id;
    o.ox = o.x - h.x; o.oz = o.z - h.z;
    o.vy = 0;
    o.tiltDir = Math.atan2(o.oz, o.ox);
    mark(state, o);
  }

  function stepFall(state, o, dt) {
    var h = state.holes[o.owner];
    var k = Math.exp(-dt * 2.4);
    o.ox *= k; o.oz *= k;
    var lim = h.r * 0.75, len = Math.hypot(o.ox, o.oz);
    if (len > lim) { o.ox *= lim / len; o.oz *= lim / len; }
    o.vy -= GRAVITY * dt;
    o.y += o.vy * dt;
    o.tilt = Math.min(1.35, o.tilt + dt * 2.6);
    o.x = h.x + o.ox; o.z = h.z + o.oz;
    var t = TYPES[o.type];
    if (o.y < -(t.h + 1.5)) {
      o.state = 'gone';
      h.score += t.pts;
      h.mass += t.pts;
      state.events.push({ type: 'eat', hole: h.id, what: o.type, pts: t.pts });
    }
    mark(state, o);
  }

  function step(state, input, dt) {
    if (state.phase !== 'playing') return state;
    dt = Math.min(dt, 0.05);
    state.time += dt;
    var holes = state.holes, objs = state.objects;
    // 1) 구멍 움직이기
    holes.forEach(function (h) {
      if (!h.alive) {
        if (state.time >= h.respawnAt) respawn(state, h);
        return;
      }
      if (h.bot) {
        h.think -= dt;
        if (h.think <= 0) { botThink(state, h); h.think = 0.35 + state.rand() * 0.3; }
        var gx = h.goalX - h.x, gz = h.goalZ - h.z, gl = Math.hypot(gx, gz);
        moveHole(h, gl > 0.5 ? gx / gl : 0, gl > 0.5 ? gz / gl : 0, dt);
      } else {
        moveHole(h, input ? input.x || 0 : 0, input ? input.z || 0 : 0, dt);
      }
      var target = radiusFor(h.mass);                          // 몸집은 부드럽게 커진다
      h.r += (target - h.r) * (1 - Math.exp(-dt * 4));
    });
    // 2) 물건: 움직이고, 구멍에 빠지는지 보기
    for (var i = 0; i < objs.length; i++) {
      var o = objs[i];
      if (o.state === 'gone') continue;
      var t = TYPES[o.type];
      if (o.state === 'fall') { stepFall(state, o, dt); continue; }
      if (t.walker) { moveWalker(o, dt); mark(state, o); }
      else if (t.driver) { moveDriver(state, o, dt); mark(state, o); }
      if (o.wobble > 0) { o.wobble = Math.max(0, o.wobble - dt); mark(state, o); }
      for (var hi = 0; hi < holes.length; hi++) {
        var h = holes[hi];
        if (!h.alive) continue;
        var dx = o.x - h.x, dz = o.z - h.z;
        var reach = h.r + t.r;
        if (dx > reach || dx < -reach || dz > reach || dz < -reach) continue;
        var d = Math.hypot(dx, dz);
        if (t.need <= h.r) {
          if (d < h.r - t.r * 0.35) { startFall(state, o, h); break; }
        } else if (d < h.r * 0.9) {
          o.wobble = 0.25;                                    // 너무 커서 덜덜 떨기만
          mark(state, o);
        }
      }
    }
    // 3) 큰 구멍이 작은 구멍 삼키기
    holes.forEach(function (a) {
      if (!a.alive) return;
      holes.forEach(function (b) {
        if (a === b || !b.alive || !a.alive || a.r < b.r * 1.2) return;
        if (Math.hypot(a.x - b.x, a.z - b.z) < a.r - b.r * 0.6) {
          var gain = Math.round(b.mass * 0.5) + 20;
          a.mass += gain; a.score += gain;
          b.alive = false; b.respawnAt = state.time + RESPAWN; b.eatenBy = a.id;
          state.events.push({ type: 'hole', hole: a.id, victim: b.id, pts: gain });
        }
      });
    });
    if (state.time >= state.duration) {
      state.phase = 'over';
      state.events.push({ type: 'over' });
    }
    return state;
  }

  // 시작 화면 뒤 구경용: 구멍 없이 사람·차만 움직인다
  function animateCity(state, dt) {
    state.objects.forEach(function (o) {
      if (o.state !== 'idle') return;
      var t = TYPES[o.type];
      if (t.walker) { moveWalker(o, dt); mark(state, o); }
      else if (t.driver) { moveDriver(state, o, dt); mark(state, o); }
    });
  }

  function standings(state) {
    return state.holes.slice().sort(function (a, b) { return b.score - a.score || a.id - b.id; });
  }

  var api = {
    TYPES: TYPES, BLOCKS: BLOCKS, CELL: CELL, ROAD: ROAD, WALK: WALK, MAP_MIN: MAP_MIN, MAP_MAX: MAP_MAX, HOLES: HOLES, LANE: LANE,
    DURATION: DURATION, START_R: START_R, RESPAWN: RESPAWN,
    rng: rng, radiusFor: radiusFor, speedFor: speedFor, faceAngle: faceAngle,
    buildCity: buildCity, createGame: createGame, step: step, animateCity: animateCity, standings: standings,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.GulpHole = root.GulpHole || {}; root.GulpHole.Rules = api; }
})(typeof self !== 'undefined' ? self : this);
