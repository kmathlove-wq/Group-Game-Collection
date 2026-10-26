// ===== world.js =====
// 학교 뿌시기의 학교 건물(블록 격자)과 부수기 규칙(화면을 모름). 브라우저(window.Smash.World)와 Node 시험이 함께 쓴다.
// 건물은 COLS×ROWS 칸, 칸마다 종류(벽돌·유리·지붕·문·시계·간판·기초)와 남은 힘(hp)이 있다.
// 부서진 칸 때문에 땅과 이어지지 않은 칸은 "떨어지는 블록"이 되어 건물에서 빠진다(점수는 빠지는 순간 셈).
(function (root) {
  'use strict';

  var W = 960, H = 600;
  var CELL = 12, COLS = 56, ROWS = 34;
  var LEFT = (W - COLS * CELL) / 2, GROUND = 560, TOP = GROUND - ROWS * CELL;
  var CHALLENGE_SECONDS = 60;
  var SCORE_MAX = 999999;

  // 종류별 힘·점수·색
  var TYPES = {
    brick: { hp: 3, points: 10, colors: ['#e07a5f', '#d96c50', '#e88b70'] },
    line: { hp: 3, points: 10, colors: ['#b85c45'] },
    glass: { hp: 1, points: 5, colors: ['#9ad7f2', '#86cbe9'] },
    roof: { hp: 3, points: 15, colors: ['#3d5a80', '#34507a'] },
    door: { hp: 2, points: 20, colors: ['#8d5a3b'] },
    clock: { hp: 4, points: 100, colors: ['#fff8e1'] },
    sign: { hp: 2, points: 30, colors: ['#2a9d8f'] },
    base: { hp: 6, points: 20, colors: ['#8a8f99', '#7d828c'] }
  };

  // 도구: 반지름(칸)·힘·도전 모드 개수(Infinity = 무제한)·연속 사용 간격(초)
  var TOOLS = {
    hammer: { radius: 1.3, power: 2, count: Infinity, cooldown: 0.1 },
    bomb: { radius: 4.2, power: 8, count: 8, cooldown: 0.3 },
    meteor: { radius: 7, power: 14, count: 2, cooldown: 1 },
    quake: { radius: 0, power: 2, count: 1, cooldown: 3 }
  };

  function typeAt(c, r) {
    var mid = COLS / 2;
    // 지붕: 계단 모양 삼각형(0~5줄)
    if (r <= 5) {
      var half = 8 + r * 4;
      if (c < mid - half || c >= mid + half) return null;
      if (r >= 2 && r <= 4 && c >= mid - 2 && c < mid + 2) return 'clock';
      return 'roof';
    }
    if (r >= ROWS - 2) return 'base';
    if (r >= 7 && r <= 8 && c >= mid - 10 && c < mid + 10) return 'sign';
    if (r >= ROWS - 8 && c >= mid - 3 && c < mid + 3) return 'door';
    var floorRow = (r - 9) % 8; // 9줄부터 8줄씩 한 층
    if (r >= 9 && floorRow === 7) return 'line';
    if (r >= 9 && floorRow >= 2 && floorRow <= 5) {
      var x = c % 7;
      if (c >= 2 && c < COLS - 2 && x >= 2 && x <= 5 && !(c >= mid - 4 && c < mid + 4 && r >= ROWS - 9)) return 'glass';
    }
    return 'brick';
  }

  function create() {
    var cells = [];
    var total = 0;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var type = typeAt(c, r);
        if (!type) { cells.push(null); continue; }
        var t = TYPES[type];
        cells.push({ type: type, hp: t.hp, color: t.colors[(c * 7 + r * 3) % t.colors.length] });
        total++;
      }
    }
    return { cells: cells, total: total, destroyed: 0, score: 0 };
  }

  function get(world, c, r) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return null;
    return world.cells[r * COLS + c];
  }

  // 화면 좌표 → 칸 좌표(소수)
  function toCell(x, y) { return { c: (x - LEFT) / CELL, r: (y - TOP) / CELL }; }
  function cellCenter(c, r) { return { x: LEFT + c * CELL + CELL / 2, y: TOP + r * CELL + CELL / 2 }; }

  function removeCell(world, c, r, out) {
    var cell = get(world, c, r);
    if (!cell) return;
    world.cells[r * COLS + c] = null;
    world.destroyed++;
    world.score = Math.min(SCORE_MAX, world.score + TYPES[cell.type].points);
    out.push({ c: c, r: r, type: cell.type, color: cell.color });
  }

  // 땅(맨 아래 줄)과 이어지지 않은 칸을 모두 떼어 낸다.
  function dropLoose(world) {
    var held = new Uint8Array(COLS * ROWS);
    var stack = [];
    for (var c = 0; c < COLS; c++) if (get(world, c, ROWS - 1)) { held[(ROWS - 1) * COLS + c] = 1; stack.push(c, ROWS - 1); }
    while (stack.length) {
      var r = stack.pop(), cc = stack.pop();
      var around = [[cc + 1, r], [cc - 1, r], [cc, r + 1], [cc, r - 1]];
      for (var i = 0; i < 4; i++) {
        var nc = around[i][0], nr = around[i][1];
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        var k = nr * COLS + nc;
        if (!held[k] && world.cells[k]) { held[k] = 1; stack.push(nc, nr); }
      }
    }
    var fallen = [];
    for (var rr = 0; rr < ROWS; rr++) for (var c2 = 0; c2 < COLS; c2++) {
      if (world.cells[rr * COLS + c2] && !held[rr * COLS + c2]) removeCell(world, c2, rr, fallen);
    }
    return fallen;
  }

  // (x, y) 화면 좌표에 반지름 radius칸, 힘 power로 때린다.
  function hit(world, x, y, radius, power) {
    var p = toCell(x, y);
    var destroyed = [], damaged = [];
    var reach = Math.ceil(radius) + 1;
    for (var r = Math.floor(p.r) - reach; r <= Math.floor(p.r) + reach; r++) {
      for (var c = Math.floor(p.c) - reach; c <= Math.floor(p.c) + reach; c++) {
        var cell = get(world, c, r);
        if (!cell) continue;
        var d = Math.hypot(c + 0.5 - p.c, r + 0.5 - p.r);
        if (d > radius + 0.5) continue;
        var dmg = Math.max(1, Math.round(power * (1 - d / (radius + 1))));
        cell.hp -= dmg;
        if (cell.hp <= 0) removeCell(world, c, r, destroyed);
        else damaged.push({ c: c, r: r });
      }
    }
    var fallen = destroyed.length ? dropLoose(world) : [];
    return { destroyed: destroyed, damaged: damaged, fallen: fallen };
  }

  // 지진: 남은 칸 중 무작위 count개에 힘 power
  function quake(world, count, power, rand) {
    rand = rand || Math.random;
    var alive = [];
    for (var i = 0; i < world.cells.length; i++) if (world.cells[i]) alive.push(i);
    var destroyed = [];
    for (var n = 0; n < count && alive.length; n++) {
      var j = Math.floor(rand() * alive.length);
      var k = alive[j];
      var cell = world.cells[k];
      if (cell) {
        cell.hp -= power;
        if (cell.hp <= 0) removeCell(world, k % COLS, Math.floor(k / COLS), destroyed);
      }
      alive[j] = alive[alive.length - 1]; alive.pop();
    }
    var fallen = destroyed.length ? dropLoose(world) : [];
    return { destroyed: destroyed, damaged: [], fallen: fallen };
  }

  function percent(world) { return world.destroyed / world.total * 100; }
  function clearBonus(secondsLeft) { return Math.max(0, Math.floor(secondsLeft)) * 20; }

  var api = { W: W, H: H, CELL: CELL, COLS: COLS, ROWS: ROWS, LEFT: LEFT, TOP: TOP, GROUND: GROUND, CHALLENGE_SECONDS: CHALLENGE_SECONDS, SCORE_MAX: SCORE_MAX,
    TYPES: TYPES, TOOLS: TOOLS, create: create, get: get, toCell: toCell, cellCenter: cellCenter, hit: hit, quake: quake, dropLoose: dropLoose, percent: percent, clearBonus: clearBonus };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.Smash = root.Smash || {}; root.Smash.World = api; }
})(typeof window !== 'undefined' ? window : this);
