// ===== rules.js =====
// 공룡 달리기의 규칙(물리·점수·장애물·충돌). 화면을 모르고, 브라우저(window.Dino)와 Node(module.exports)가 함께 쓴다.
// 좌표: x는 오른쪽으로, y는 "발바닥 기준 위로 올라간 높이"(바닥=0). 상자는 { x, y, w, h } (왼쪽 아래 기준).
(function (root) {
  'use strict';

  var WIDTH = 600;
  var HEIGHT = 150;
  var GROUND_Y = 140;            // 화면에서 발이 닿는 선(위에서부터 140)
  var DT = 1 / 60;               // 고정 시간 단계(화면 주사율과 무관하게 같은 속도)
  var DINO_X = 24;
  var DINO_W = 44, DINO_H = 47;  // 서 있는 공룡 크기
  var DUCK_W = 59, DUCK_H = 25;  // 숙인 공룡 크기

  var GRAVITY = 2800;            // 아래로 당기는 힘(픽셀/초²)
  var JUMP_V = 640;              // 점프 시작 속도(픽셀/초)
  var HOLD_GRAVITY = 0.75;       // 올라가는 중 누르고 있으면 중력이 약해져 조금 더 높이 뜸
  var FAST_FALL = 3;             // 공중에서 숙이기를 누르면 빨리 내려옴
  var JUMP_BUFFER = 0.1;         // 착지 직전에 누른 점프도 받아 주는 시간(초)
  var RESTART_LOCK = 0.5;        // 부딪힌 뒤 이 시간 동안은 다시 시작 입력을 무시

  var START_SPEED = 360;         // 시작 속도(픽셀/초)
  var MAX_SPEED = 780;           // 최대 속도
  var ACCEL = 4.5;               // 초당 빨라지는 양
  var SCORE_PER_PX = 0.025;      // 거리 1픽셀당 점수
  var SCORE_MAX = 999999;
  var PTERO_SCORE = 450;         // 이 점수부터 익룡 등장
  var FIRST_SPAWN_TIME = 1.0;

  // 장애물 크기(그림 크기와 같음)
  var CACTUS = {
    small: { w: 17, h: 35 },
    large: { w: 25, h: 50 }
  };
  var PTERO_W = 46, PTERO_H = 40;
  var PTERO_BOTTOMS = [4, 22, 56]; // 낮음(점프), 중간(숙이기), 높음(그냥 지나감)

  // 충돌 상자(그림 안 좌표, 왼쪽 아래 기준). 여러 개의 작은 사각형, 약간 안쪽으로 줄여 너그럽게.
  var DINO_STAND_BOXES = [
    { x: 24, y: 30, w: 18, h: 15 },  // 머리
    { x: 8, y: 12, w: 24, h: 24 },   // 몸통
    { x: 12, y: 2, w: 16, h: 12 }    // 다리
  ];
  var DINO_DUCK_BOXES = [
    { x: 6, y: 3, w: 40, h: 17 },    // 몸통
    { x: 40, y: 10, w: 16, h: 12 }   // 머리
  ];
  var PTERO_BOXES = [
    { x: 6, y: 12, w: 34, h: 14 },   // 몸통
    { x: 16, y: 26, w: 14, h: 10 }   // 날개
  ];

  var DINO_HIT_W = 34;             // 몸 상자가 차지하는 가로(8~42)
  var SPEED_FOR_PTERO_DUCK = 0;

  function makeRng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 탭 점프(키를 바로 뗌)로 높이 h 위에 머무는 시간(초). 못 닿으면 0.
  function jumpWindow(h) {
    var d = JUMP_V * JUMP_V - 2 * GRAVITY * h;
    return d <= 0 ? 0 : 2 * Math.sqrt(d) / GRAVITY;
  }
  function airTime() { return 2 * JUMP_V / GRAVITY; }
  function apexTime() { return JUMP_V / GRAVITY; }

  // 가장 높은 장애물(50)을 넘는 점프를 끝내고, 바로 다음 점프로 다시 넘기까지 필요한 최소 간격(픽셀).
  function requiredJumpGap(speed) {
    var d = JUMP_V * JUMP_V - 2 * GRAVITY * 50;
    var t1 = (JUMP_V - Math.sqrt(Math.max(0, d))) / GRAVITY; // 50 높이까지 오르는 시간 = 내려오는 시간
    return speed * (2 * t1) + DINO_HIT_W;
  }
  // 실제로 쓰는 장애물 사이 최소 간격(여유 1.5배 + 0.25초 거리)
  function minGap(speed) {
    return Math.ceil(1.5 * requiredJumpGap(speed) + 0.25 * speed);
  }

  // 선인장 묶음이 개수 n일 때 점프로 넘을 수 있는 최소 속도(여유 1.3배)
  function groupMinSpeed(kind, n) {
    var c = CACTUS[kind];
    var overlap = DINO_HIT_W + n * c.w - 6;
    var win = jumpWindow(c.h - 3 - 2);
    return Math.ceil(1.3 * overlap / win);
  }

  function boxesOfDino(state) {
    var d = state.dino;
    var duck = d.ducking;
    var list = duck ? DINO_DUCK_BOXES : DINO_STAND_BOXES;
    return list.map(function (b) { return { x: DINO_X + b.x, y: d.y + b.y, w: b.w, h: b.h }; });
  }
  function boxesOfObstacle(o) {
    var out = [];
    var i;
    if (o.kind === 'ptero') {
      for (i = 0; i < PTERO_BOXES.length; i++) {
        var b = PTERO_BOXES[i];
        out.push({ x: o.x + b.x, y: o.bottom + b.y, w: b.w, h: b.h });
      }
    } else {
      var c = CACTUS[o.kind];
      for (i = 0; i < o.count; i++) {
        out.push({ x: o.x + i * c.w + 3, y: 0, w: c.w - 6, h: c.h - 3 });
      }
    }
    return out;
  }
  function overlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function createState(rng) {
    return {
      rng: rng || Math.random,
      phase: 'ready',            // ready → running → over
      time: 0,
      speed: START_SPEED,
      distance: 0,
      score: 0,
      overTime: 0,
      gap: 0,
      jumpBuffer: 0,
      prevJump: false,
      dino: { y: 0, vy: 0, onGround: true, ducking: false },
      obstacles: [],
      events: []
    };
  }

  function chooseObstacle(state) {
    var rng = state.rng;
    var o;
    if (state.score >= PTERO_SCORE && rng() < 0.3) {
      o = { kind: 'ptero', count: 1, w: PTERO_W, h: PTERO_H, bottom: PTERO_BOTTOMS[Math.floor(rng() * 3) % 3] };
    } else {
      var kind = rng() < 0.5 ? 'small' : 'large';
      var n = 1 + Math.floor(rng() * 3);
      while (n > 1 && state.speed < groupMinSpeed(kind, n)) n--;
      o = { kind: kind, count: n, w: CACTUS[kind].w * n, h: CACTUS[kind].h, bottom: 0 };
    }
    o.x = WIDTH + 10;
    state.gap = Math.ceil(minGap(state.speed) * (1 + rng() * 0.8));
    return o;
  }

  function start(state) {
    if (state.phase === 'ready') state.phase = 'running';
  }
  function canRestart(state) {
    return state.phase === 'over' && state.overTime >= RESTART_LOCK;
  }

  // 한 단계(1/60초)를 진행한다. input = { jump: 점프 키를 누르는 중, duck: 숙이기 키를 누르는 중 }
  function step(state, input) {
    state.events = [];
    if (state.phase === 'over') { state.overTime += DT; return state; }
    if (state.phase !== 'running') return state;
    input = input || {};
    var d = state.dino;

    state.time += DT;
    state.speed = Math.min(MAX_SPEED, state.speed + ACCEL * DT);
    state.distance += state.speed * DT;
    var newScore = Math.min(SCORE_MAX, Math.floor(state.distance * SCORE_PER_PX));
    if (Math.floor(newScore / 100) > Math.floor(state.score / 100) && newScore >= 100) state.events.push('milestone');
    state.score = newScore;

    // 점프
    if (input.jump && !state.prevJump) state.jumpBuffer = JUMP_BUFFER;
    state.prevJump = !!input.jump;
    if (state.jumpBuffer > 0) state.jumpBuffer -= DT;
    if (d.onGround && state.jumpBuffer > 0 && !input.duck) {
      d.vy = JUMP_V; d.onGround = false; state.jumpBuffer = 0;
      state.events.push('jump');
    }
    if (!d.onGround) {
      var g = GRAVITY;
      if (input.duck) g *= FAST_FALL;
      else if (input.jump && d.vy > 0) g *= HOLD_GRAVITY;
      d.vy -= g * DT;
      d.y += d.vy * DT;
      if (d.y <= 0) { d.y = 0; d.vy = 0; d.onGround = true; }
    }
    d.ducking = !!input.duck && d.onGround;

    // 장애물 이동·생성·제거
    var i, o;
    for (i = 0; i < state.obstacles.length; i++) state.obstacles[i].x -= state.speed * DT;
    while (state.obstacles.length && state.obstacles[0].x + state.obstacles[0].w < -10) state.obstacles.shift();
    var last = state.obstacles[state.obstacles.length - 1];
    if (!last) {
      if (state.time >= FIRST_SPAWN_TIME) state.obstacles.push(chooseObstacle(state));
    } else if (last.x + last.w + state.gap <= WIDTH) {
      state.obstacles.push(chooseObstacle(state));
    }

    // 충돌
    var db = boxesOfDino(state);
    for (i = 0; i < state.obstacles.length; i++) {
      o = state.obstacles[i];
      if (o.x > DINO_X + DUCK_W + 4 || o.x + o.w < DINO_X) continue;
      var ob = boxesOfObstacle(o);
      for (var a = 0; a < db.length; a++) {
        for (var b = 0; b < ob.length; b++) {
          if (overlap(db[a], ob[b])) {
            state.phase = 'over';
            state.overTime = 0;
            state.events.push('crash');
            return state;
          }
        }
      }
    }
    return state;
  }

  // 시험용 간단한 자동 조종: 장애물 앞에서 점프, 중간 높이 익룡 앞에서는 숙이기
  function autoPilot(state) {
    var out = { jump: false, duck: false };
    var d = state.dino;
    var sp = state.speed;
    for (var i = 0; i < state.obstacles.length; i++) {
      var o = state.obstacles[i];
      if (o.x + o.w < DINO_X + 8) continue;          // 이미 지나감
      if (o.kind === 'ptero' && o.bottom === PTERO_BOTTOMS[2]) continue; // 높은 익룡은 그냥 지나감
      if (o.kind === 'ptero' && o.bottom === PTERO_BOTTOMS[1]) {
        if (d.onGround && o.x - (DINO_X + DINO_W) < sp * 0.3) out.duck = true;
        return out;
      }
      if (d.onGround) {
        var center = o.x + o.w / 2;
        var dinoCenter = DINO_X + DINO_W / 2;
        if (center - dinoCenter <= sp * apexTime()) out.jump = true;
      }
      return out;
    }
    return out;
  }

  function formatScore(n) {
    var s = String(Math.max(0, Math.floor(n)));
    while (s.length < 5) s = '0' + s;
    return s;
  }

  var API = {
    WIDTH: WIDTH, HEIGHT: HEIGHT, GROUND_Y: GROUND_Y, DT: DT, DINO_X: DINO_X,
    DINO_W: DINO_W, DINO_H: DINO_H, DUCK_W: DUCK_W, DUCK_H: DUCK_H,
    GRAVITY: GRAVITY, JUMP_V: JUMP_V, START_SPEED: START_SPEED, MAX_SPEED: MAX_SPEED,
    SCORE_MAX: SCORE_MAX, PTERO_SCORE: PTERO_SCORE, RESTART_LOCK: RESTART_LOCK,
    CACTUS: CACTUS, PTERO_W: PTERO_W, PTERO_H: PTERO_H, PTERO_BOTTOMS: PTERO_BOTTOMS,
    DINO_STAND_BOXES: DINO_STAND_BOXES, DINO_DUCK_BOXES: DINO_DUCK_BOXES, PTERO_BOXES: PTERO_BOXES,
    makeRng: makeRng, jumpWindow: jumpWindow, airTime: airTime, requiredJumpGap: requiredJumpGap,
    minGap: minGap, groupMinSpeed: groupMinSpeed, createState: createState, start: start,
    canRestart: canRestart, step: step, autoPilot: autoPilot, formatScore: formatScore,
    boxesOfDino: boxesOfDino, boxesOfObstacle: boxesOfObstacle
  };
  void SPEED_FOR_PTERO_DUCK;
  root.Rules = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? (window.Dino = window.Dino || {}) : {});
