// ===== game.js =====
// 광질 타이쿤의 규칙(움직임·파기·연료·체력·열·자동 드릴·가게·지구 중심 방). 화면·소리·저장은 전혀 모른다.
// update()가 돌려주는 사건(events) 목록을 main.js가 받아 소리·글자·순위로 바꾼다.
// 그래서 Node에서 화면 없이 모의 실험을 돌릴 수 있다(test/mining-tycoon.test.js).
(function (MT) {
  var Rules = MT.Rules || require('./rules.js');
  var World = MT.World || require('./world.js');
  var TILE = Rules.TILE;
  var UP = Rules.UPGRADES;
  var HALF = Rules.CAR_SIZE / 2;
  var SURFACE_Y = -HALF; // 지상(0줄 위)에 서 있을 때 차 가운데 높이
  var SKY_TOP = -8; // 이보다 높이 날 수 없다
  var STEP = 1 / 60;
  var EPS = 1e-6;

  // 지구 중심 방: 땅 지도와 따로 있는 작은 방(지도·미니맵에 안 나온다). 입장권으로만 온다.
  var CORE_ROOM = (function () {
    var w = 16, h = 9;
    var tiles = new Uint8Array(w * h);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (x === 0 || x === w - 1 || y === 0 || y === h - 1) tiles[y * w + x] = TILE.CORE_FLOOR;
      }
    }
    return { w: w, h: h, tiles: tiles, ores: new Uint8Array(w * h), seen: new Uint8Array(w * h), core: true };
  })();
  var CORE_DOOR = { x0: 1, x1: 3 }; // 🚪 돌아가기 문
  var CORE_BUTTON = { x0: 7.2, x1: 8.8 }; // 🔴 버튼
  var CORE_SPAWN_X = 4.5;

  // ---------- 차 능력치 ----------
  function fuelCap(s) { return UP.fuel.values[s.levels.fuel]; }
  function hpCap(s) { return UP.hull.values[s.levels.hull]; }
  function bagCap(s) { return UP.bag.values[s.levels.bag]; }
  function bagCount(s) { var n = 0; for (var i = 1; i < s.bag.length; i++) n += s.bag[i]; return n; }
  function bagValue(s) { var v = 0; for (var i = 1; i < s.bag.length; i++) v += s.bag[i] * Rules.ORES[i].value; return v; }
  function emptyBag() { var b = []; for (var i = 0; i < Rules.ORES.length; i++) b.push(0); return b; }
  function isUnderground(s) { return !s.inCore && s.car.y > 0; }
  function depthOf(s) { return s.inCore ? Rules.DEPTH : s.car.y > 0 ? Math.floor(s.car.y) + 1 : 0; }
  function rangeSize(s) { return s.wide ? UP.range.values[s.levels.range] : [1, 1]; }
  function unlocked(s) { return s.treasureTime != null; } // 첫 번째 엔딩을 봤는지
  function rescueCost(s) { return Rules.RESCUE_BASE + depthOf(s) * Rules.RESCUE_PER_M; }
  function world(s) { return s.inCore ? CORE_ROOM : s.world; } // 지금 서 있는 곳

  // 다음 단계 값. 이미 끝이면 null. 엔딩 전이라 잠겨 있으면 locked: true.
  function upgradeInfo(s, key) {
    var up = UP[key];
    var level = s.levels[key];
    if (level >= up.prices.length) return { price: null, max: true };
    // 다음 단계(level + 1)가 lockedFrom 이상이면 잠김: 드릴은 lockedFrom 5 → 6단계(0부터 5)로 올리는 것부터.
    return { price: up.prices[level], locked: up.lockedFrom != null && level + 1 >= up.lockedFrom && !unlocked(s) };
  }
  function upgradePrice(s, key) { return upgradeInfo(s, key).price; }
  // 지금 층의 초당 열 피해(열보호 반영).
  function heatDps(s) {
    if (s.inCore || !isUnderground(s)) return 0;
    return Rules.LAYERS[Rules.layerOf(depthOf(s))].heat * UP.heat.values[s.levels.heat];
  }

  function newGame(options) {
    options = options || {};
    var seed = options.seed != null ? options.seed : Math.floor(Math.random() * 4294967296);
    var s = {
      version: 2,
      name: options.name || '이름없음',
      playerId: options.playerId || '',
      world: World.createWorld(seed),
      car: { x: Rules.SPAWN_X, y: SURFACE_Y, vx: 0, vy: 0, face: 1 },
      levels: {},
      bag: emptyBag(),
      money: 0,
      debt: 0,
      earned: 0, // 지금까지 번 돈 전체(순위 기준, 쓴 돈은 안 뺌)
      recall: 0,
      instant: 0, // 💸 즉시 팔기 개수
      ticket: 0, // 🎫 지구 핵 입장권
      autos: [], // 🤖 자동 드릴
      autoEarned: 0,
      autoBought: 0,
      inCore: false,
      wide: true,
      time: 0, // 걸린 시간(초, 일시정지 중엔 안 늚)
      treasureTime: null,
      destroyedTime: null,
      hidden1Time: null, // 🤫 히든 엔딩 1: 지각(300m)까지 팔 수 있는 칸을 다 팠을 때
      hidden2Time: null, // 🤫 히든 엔딩 2: 1000m까지 팔 수 있는 칸을 다 팠을 때
      maxDepth: 0,
      // 아래는 저장하지 않는 잠깐 상태
      left: null, // 남은 팔 수 있는 칸 수(null이면 다음에 다시 셈)
      dig: null,
      building: null,
      lowFuelWarned: false,
      burnTimer: 0,
      heatTimer: 0,
      coreTimer: 0,
      thrusting: false
    };
    Rules.UPGRADE_ORDER.forEach(function (key) { s.levels[key] = 0; });
    s.fuel = fuelCap(s);
    s.hp = hpCap(s);
    markSeen(s);
    return s;
  }

  // ---------- 부딪힘 ----------
  function overlapsSolid(w, x, y) {
    var x0 = Math.floor(x - HALF + EPS), x1 = Math.floor(x + HALF - EPS);
    var y0 = Math.floor(y - HALF + EPS), y1 = Math.floor(y + HALF - EPS);
    for (var ty = y0; ty <= y1; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        if (World.isSolid(World.tileAt(w, tx, ty))) return true;
      }
    }
    return false;
  }

  function touchesLava(w, x, y) {
    var r = HALF + 0.06;
    var x0 = Math.floor(x - r), x1 = Math.floor(x + r);
    var y0 = Math.floor(y - r), y1 = Math.floor(y + r);
    for (var ty = y0; ty <= y1; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        if (World.tileAt(w, tx, ty) === TILE.LAVA) return true;
      }
    }
    return false;
  }

  function moveX(s, dx) {
    var car = s.car, w = world(s);
    var nx = car.x + dx;
    if (!overlapsSolid(w, nx, car.y)) { car.x = nx; return; }
    nx = dx > 0 ? Math.floor(nx + HALF - EPS) - HALF : Math.floor(nx - HALF + EPS) + 1 + HALF;
    if (!overlapsSolid(w, nx, car.y)) car.x = nx;
    car.vx = 0;
  }

  // 떨어져 바닥에 닿으면 닿는 순간의 속도를 돌려준다(낙하 피해 계산용).
  function moveY(s, dy) {
    var car = s.car, w = world(s);
    var ny = car.y + dy;
    if (!overlapsSolid(w, car.x, ny)) { car.y = ny; return 0; }
    var impact = dy > 0 ? car.vy : 0;
    ny = dy > 0 ? Math.floor(ny + HALF - EPS) - HALF : Math.floor(ny - HALF + EPS) + 1 + HALF;
    if (!overlapsSolid(w, car.x, ny)) car.y = ny;
    car.vy = 0;
    return impact;
  }

  function isGrounded(s) { return overlapsSolid(world(s), s.car.x, s.car.y + 0.03); }

  // ---------- 파기 ----------
  function canDrill(s, tile) {
    var need = Rules.DRILL_NEED[tile];
    return need != null && s.levels.drill >= need;
  }

  // 파는 범위 안의 칸들. 가운데(차가 들어갈 칸)를 맨 앞에 둔다.
  // range 값 [앞뒤, 옆] — 1x3은 파는 방향의 옆으로 3칸(아래로 파면 가로 3칸, 옆으로 파면 세로 3칸).
  function digCells(s, col, row, dx) {
    var size = rangeSize(s);
    var along = size[0], across = size[1];
    var w = s.world.w;
    var cells = [row * w + col];
    var ha = (along - 1) / 2, hc = (across - 1) / 2;
    for (var a = -ha; a <= ha; a++) {
      for (var c = -hc; c <= hc; c++) {
        if (a === 0 && c === 0) continue;
        var x = dx ? col + a : col + c;
        var y = dx ? row + c : row + a;
        if (y < 0 || y >= s.world.h || x < 0 || x >= w) continue;
        if (canDrill(s, s.world.tiles[y * w + x])) cells.push(y * w + x);
      }
    }
    return cells;
  }

  // flying: 날면서(공중에서) 옆으로 파기. 차가 두 줄에 걸쳐 있어도 되고, 파는 동안 그 줄 높이로 맞춰진다.
  function tryDig(s, dx, dy, events, flying) {
    var car = s.car;
    var col, row;
    if (dy) {
      col = Math.floor(car.x);
      row = Math.floor(car.y + HALF + 0.05);
    } else {
      row = Math.floor(car.y);
      var top = Math.floor(car.y - HALF + EPS), bottom = Math.floor(car.y + HALF - EPS);
      if (!flying && top !== row) return false; // 땅에 서 있을 때 차가 두 줄에 걸쳐 있으면 옆으로 못 판다
      col = dx > 0 ? Math.floor(car.x + HALF + 0.05) : Math.floor(car.x - HALF - 0.05);
      var edge = dx > 0 ? car.x + HALF : car.x - HALF;
      var wall = dx > 0 ? col : col + 1;
      if (Math.abs(edge - wall) > 0.08) return false; // 벽에 딱 붙었을 때만
      // 날 때 가운데 줄 옆이 비어 있으면, 차가 걸친 다른 줄의 벽을 판다.
      if (flying && World.tileAt(world(s), col, row) === TILE.EMPTY) row = top !== row ? top : bottom;
    }
    var tile = World.tileAt(world(s), col, row);
    if (tile === TILE.EMPTY) return false;
    if (tile === TILE.LAVA) { events.push({ type: 'blocked', reason: 'lava' }); return false; }
    if (!canDrill(s, tile)) {
      var need = Rules.DRILL_NEED[tile];
      if (need != null) events.push({ type: 'blocked', reason: 'too-hard', need: need + 1 });
      else events.push({ type: 'blocked', reason: tile === TILE.SEAL ? 'seal' : 'wall' });
      return false;
    }
    if (s.fuel <= 0) { events.push({ type: 'blocked', reason: 'no-fuel' }); return false; }
    var cells = digCells(s, col, row, dx);
    var hard = 0;
    for (var i = 0; i < cells.length; i++) hard = Math.max(hard, Rules.HARDNESS[s.world.tiles[cells[i]]]);
    s.dig = {
      cells: cells, col: col, row: row, dx: dx, dy: dy, hard: hard, t: 0,
      dur: Rules.DIG_TIME * hard / UP.drill.values[s.levels.drill],
      fromX: car.x, fromY: car.y, toX: col + 0.5, toY: row + 1 - HALF
    };
    car.vx = 0; car.vy = 0;
    events.push({ type: 'dig-start', dx: dx, dy: dy });
    return true;
  }

  function addOre(s, ore) {
    if (bagCount(s) >= bagCap(s)) return false;
    s.bag[ore]++;
    return true;
  }

  // 번 돈 받기: 빚이 있으면 먼저 갚는다. 번 돈 순위(earned)에는 다 들어간다.
  function payIncome(s, value) {
    var debtPaid = Math.min(s.debt, value);
    s.debt -= debtPaid;
    s.money += value - debtPaid;
    s.earned += value;
    return debtPaid;
  }

  function finishDig(s, events) {
    var d = s.dig;
    var w = s.world;
    var got = [];
    var full = false;
    for (var i = 0; i < d.cells.length; i++) {
      var idx = d.cells[i];
      if (w.tiles[idx] === TILE.TREASURE) findTreasure(s, events);
      clearTile(s, idx, events);
      var ore = w.ores[idx];
      if (ore) {
        if (addOre(s, ore)) { got.push(ore); w.ores[idx] = 0; } else full = true;
      }
    }
    s.fuel = Math.max(0, s.fuel - (Rules.DIG_FUEL * d.hard + Rules.DIG_FUEL_EXTRA * (d.cells.length - 1)));
    s.car.x = d.toX; s.car.y = d.toY;
    s.dig = null;
    events.push({ type: 'dig-done', x: d.col, y: d.row, cells: d.cells.length, ores: got, full: full, hard: d.hard });
  }

  function findTreasure(s, events) {
    var first = s.treasureTime == null;
    if (first) s.treasureTime = Math.round(s.time);
    payIncome(s, Rules.TREASURE_REWARD);
    World.openSeal(s.world); // 지각 바닥이 부서져 아래가 열린다
    s.left = null; // 바닥이 맨틀이 되면서 팔 수 있는 칸이 늘었으니 다시 센다
    events.push({ type: 'treasure', time: s.treasureTime, reward: Rules.TREASURE_REWARD, first: first });
  }

  // ---------- 🤫 히든 엔딩: 팔 수 있는 칸이 몇 개 남았나 ----------
  // 용암·콘크리트·막힌 지각 바닥처럼 원래 못 파는 칸은 세지 않는다(사용자 결정 2026-10: 용암은 빼고 세기).
  // 매번 땅 전체(4만 칸)를 세면 느리니 한 번 센 뒤로는 칸을 비울 때마다 하나씩 뺀다.
  function diggable(tile) { return Rules.DRILL_NEED[tile] != null; }
  function leftCounts(s) {
    if (!s.left) {
      var w = s.world;
      var crustEnd = Rules.CRUST_DEPTH * w.w; // 0~299줄 = 1~300m
      var crust = 0, all = 0;
      for (var i = 0; i < w.tiles.length; i++) {
        if (!diggable(w.tiles[i])) continue;
        all++;
        if (i < crustEnd) crust++;
      }
      s.left = { crust: crust, all: all };
    }
    return s.left;
  }

  // 칸을 비울 때는 꼭 이걸 거친다(남은 수를 줄이고 히든 엔딩을 확인한다).
  function clearTile(s, idx, events) {
    var w = s.world;
    if (diggable(w.tiles[idx])) {
      var left = leftCounts(s);
      left.all--;
      if (idx < Rules.CRUST_DEPTH * w.w) left.crust--;
    }
    w.tiles[idx] = TILE.EMPTY;
    var counts = leftCounts(s);
    if (s.hidden1Time == null && counts.crust <= 0) {
      s.hidden1Time = Math.round(s.time);
      events.push({ type: 'hidden', n: 1, time: s.hidden1Time });
    }
    if (s.hidden2Time == null && counts.all <= 0) {
      s.hidden2Time = Math.round(s.time);
      events.push({ type: 'hidden', n: 2, time: s.hidden2Time });
    }
  }

  // ---------- 🤖 자동 드릴 ----------
  // 칸 단위로 움직인다: 아래가 비었으면 내려가고, 파낼 수 있으면 파고, 막히면 옆으로. 가방·연료 없음.
  function autoMaxRow(s) { return s.levels.autoHeat ? s.world.h - 2 : Rules.CRUST_DEPTH - 1; }

  function autoTarget(s, a, x, y) {
    var w = s.world;
    if (x < 0 || x >= w.w || y < 0 || y > autoMaxRow(s)) return null;
    var tile = w.tiles[y * w.w + x];
    if (tile === TILE.EMPTY) return { mode: 'move', dur: 1 / Rules.AUTO_MOVE };
    if (tile === TILE.TREASURE || !canDrill(s, tile)) return null;
    return { mode: 'dig', dur: Rules.DIG_TIME * Rules.HARDNESS[tile] / (UP.drill.values[s.levels.drill] * Rules.AUTO_SPEED) };
  }

  function autoChoose(s, a) {
    var down = autoTarget(s, a, a.x, a.y + 1);
    // 아래가 빈 굴이면 곧장 떨어진다. 새 땅을 팔 때만 가끔(6%) 옆으로 꺾어 굴을 넓힌다.
    var sideways = a.y >= 0 && (!down || (down.mode === 'dig' && (a.side > 0 || Math.random() < 0.06)));
    if (!sideways && down) { a.side = 0; return set(a, a.x, a.y + 1, down); }
    var side = a.y >= 0 ? autoTarget(s, a, a.x + a.dir, a.y) : null;
    if (!side) { a.dir = -a.dir; side = a.y >= 0 ? autoTarget(s, a, a.x + a.dir, a.y) : null; }
    if (side) {
      if (a.side <= 0) a.side = 2 + Math.floor(Math.random() * 4);
      a.side--;
      return set(a, a.x + a.dir, a.y, side);
    }
    if (down) return set(a, a.x, a.y + 1, down);
    a.wait = 0.5; // 사방이 막혔다. 잠깐 쉬었다가 다시 본다.
    return false;
  }
  function set(a, tx, ty, plan) { a.tx = tx; a.ty = ty; a.mode = plan.mode; a.dur = plan.dur; a.p = 0; return true; }

  function updateAutos(s, h, events) {
    var w = s.world;
    for (var i = s.autos.length - 1; i >= 0; i--) {
      var a = s.autos[i];
      a.life -= h;
      if (a.life <= 0) { s.autos.splice(i, 1); events.push({ type: 'auto-end', x: a.x, y: a.y }); continue; }
      if (a.wait > 0) { a.wait -= h; continue; }
      if (a.mode == null && !autoChoose(s, a)) continue;
      a.p += h / a.dur;
      if (a.p < 1) continue;
      var idx = a.ty * w.w + a.tx;
      if (a.mode === 'dig') {
        // 파는 사이 내가 먼저 파 버렸거나 바뀌었으면 그냥 지나간다.
        if (w.tiles[idx] !== TILE.EMPTY) {
          if (!canDrill(s, w.tiles[idx])) { a.mode = null; continue; }
          clearTile(s, idx, events);
        }
        var ore = w.ores[idx];
        if (ore) {
          w.ores[idx] = 0;
          var value = Rules.ORES[ore].value;
          payIncome(s, value);
          s.autoEarned += value;
          events.push({ type: 'auto-ore', ore: ore, value: value, x: a.tx, y: a.ty });
        }
      } else if (World.isSolid(w.tiles[idx])) { a.mode = null; continue; }
      a.x = a.tx; a.y = a.ty; a.mode = null; a.p = 0;
    }
  }

  // ---------- 매 순간 ----------
  function markSeen(s) {
    if (s.inCore) return;
    var w = s.world;
    var cx = Math.floor(s.car.x), cy = Math.floor(s.car.y);
    for (var y = cy - 4; y <= cy + 4; y++) {
      if (y < 0 || y >= w.h) continue;
      for (var x = cx - 4; x <= cx + 4; x++) {
        if (x < 0 || x >= w.w) continue;
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= 18) w.seen[y * w.w + x] = 1;
      }
    }
  }

  function teleportHome(s) {
    s.inCore = false;
    s.car.x = Rules.SPAWN_X; s.car.y = SURFACE_Y;
    s.car.vx = 0; s.car.vy = 0;
    s.dig = null;
    markSeen(s);
  }

  function hurt(s, amount, cause, events) {
    if (amount <= 0) return;
    s.hp = Math.max(0, s.hp - amount);
    events.push({ type: 'hurt', amount: amount, cause: cause });
    if (s.hp <= 0) {
      var lost = bagCount(s);
      s.bag = emptyBag();
      teleportHome(s);
      s.hp = hpCap(s);
      events.push({ type: 'dead', lost: lost, cause: cause });
    }
  }

  // 지구 중심 방: 문·버튼 앞에서 ↓를 누르면 사건만 알린다(확인 창은 main.js).
  function stepCore(s, input, events) {
    s.coreTimer = Math.max(0, s.coreTimer - STEP);
    if (!input.down || s.coreTimer > 0 || !isGrounded(s)) return;
    var x = s.car.x;
    if (x >= CORE_DOOR.x0 && x <= CORE_DOOR.x1) { s.coreTimer = 0.8; events.push({ type: 'core-door' }); }
    else if (x >= CORE_BUTTON.x0 && x <= CORE_BUTTON.x1) { s.coreTimer = 0.8; events.push({ type: 'core-button' }); }
  }

  function step(s, input, h, events) {
    var car = s.car;
    updateAutos(s, h, events);
    if (s.dig) {
      var d = s.dig;
      d.t += h;
      var p = Math.min(1, d.t / d.dur);
      car.x = d.fromX + (d.toX - d.fromX) * p;
      car.y = d.fromY + (d.toY - d.fromY) * p;
      if (p >= 1) finishDig(s, events);
      return;
    }
    var under = isUnderground(s);
    var grounded = isGrounded(s);
    var lr = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (lr) car.face = lr;

    if (s.inCore) stepCore(s, input, events);
    else if (grounded && car.vy >= 0 && !input.up) {
      if (input.down && tryDig(s, 0, 1, events)) return;
      if (lr && tryDig(s, lr, 0, events)) return;
    } else if (!grounded && lr && tryDig(s, lr, 0, events, true)) return; // ✈️ 날면서 옆으로 파기

    var speed = Rules.MOVE_SPEED[s.levels.engine];
    var accel = Rules.MOVE_ACCEL * h;
    car.vx += Math.max(-accel, Math.min(accel, lr * speed - car.vx));
    s.thrusting = !!input.up && (s.fuel > 0 || !under);
    if (s.thrusting) {
      car.vy -= Rules.THRUST * h;
      var maxUp = UP.engine.values[s.levels.engine];
      if (car.vy < -maxUp) car.vy = -maxUp;
    }
    car.vy = Math.min(Rules.MAX_FALL, car.vy + Rules.GRAVITY * h);

    if (under) {
      var use = Rules.FUEL_IDLE + (Math.abs(car.vx) > 0.5 ? Rules.FUEL_MOVE : 0) + (s.thrusting ? Rules.FUEL_THRUST : 0);
      s.fuel = Math.max(0, s.fuel - use * Rules.ENGINE_FUEL_USE[s.levels.engine] * h);
    }
    // 🛢️ 간이 주유소: 날지 않을 때만 연료가 저절로 찬다(날 때는 줄기만 함).
    if (!s.thrusting) s.fuel = Math.min(fuelCap(s), s.fuel + UP.minigas.values[s.levels.minigas] * h);

    moveX(s, car.vx * h);
    var impact = moveY(s, car.vy * h);
    if (car.y < SKY_TOP) { car.y = SKY_TOP; car.vy = 0; }
    if (impact > Rules.SAFE_FALL_SPEED) hurt(s, Math.round((impact - Rules.SAFE_FALL_SPEED) * Rules.FALL_DAMAGE), 'fall', events);
    if (s.inCore) return;

    // 가방이 가득 차서 남겨 둔 광석 줍기
    var w = s.world;
    var cx = Math.floor(car.x), cy = Math.floor(car.y);
    if (cy >= 0 && cy < w.h) {
      var idx = cy * w.w + cx;
      if (w.tiles[idx] === TILE.EMPTY && w.ores[idx] && addOre(s, w.ores[idx])) {
        events.push({ type: 'pickup', ore: w.ores[idx] });
        w.ores[idx] = 0;
      }
    }

    // 용암
    s.burnTimer = Math.max(0, s.burnTimer - h);
    if (touchesLava(w, car.x, car.y)) {
      if (s.burnTimer <= 0) { events.push({ type: 'burn' }); s.burnTimer = 0.5; }
      hurt(s, Rules.LAVA_BURN * h, 'lava', events);
    }
    // 🔥 지각 밑의 열
    var dps = heatDps(s);
    s.heatTimer = Math.max(0, s.heatTimer - h);
    if (dps > 0) {
      if (s.heatTimer <= 0) { events.push({ type: 'heat', dps: dps }); s.heatTimer = 1.2; }
      hurt(s, dps * h, 'heat', events);
    }

    markSeen(s);
    s.maxDepth = Math.max(s.maxDepth, depthOf(s));
    under = isUnderground(s);

    // 건물 앞에 섰는지
    var building = null;
    if (!under && isGrounded(s)) {
      for (var i = 0; i < Rules.BUILDINGS.length; i++) {
        var b = Rules.BUILDINGS[i];
        if (car.x >= b.x0 + 0.2 && car.x <= b.x1 - 0.2) building = b.key;
      }
    }
    if (building !== s.building) { s.building = building; events.push({ type: 'building', key: building }); }

    // 연료 경고와 구조대
    var ratio = s.fuel / fuelCap(s);
    if (under && ratio < Rules.LOW_FUEL && !s.lowFuelWarned) { s.lowFuelWarned = true; events.push({ type: 'low-fuel' }); }
    if (ratio >= Rules.LOW_FUEL) s.lowFuelWarned = false;
    if (under && s.fuel <= 0) {
      var cost = rescueCost(s);
      var paid = Math.min(s.money, cost);
      s.money -= paid;
      s.debt += cost - paid;
      teleportHome(s);
      events.push({ type: 'rescue', cost: cost, paid: paid, owed: cost - paid });
    }
  }

  // input = { left, right, up, down } (true/false). dt는 지난 화면 이후 흐른 시간(초).
  function update(s, input, dt) {
    var events = [];
    if (s.destroyedTime != null) return events; // 지구가 부서진 뒤에는 아무것도 안 움직인다
    dt = Math.min(dt, 0.1);
    s.time += dt;
    var steps = Math.max(1, Math.ceil(dt / STEP - 1e-9));
    for (var i = 0; i < steps; i++) step(s, input, dt / steps, events);
    return events;
  }

  // ---------- 가게 ----------
  function sell(s) {
    var count = bagCount(s);
    var total = bagValue(s);
    if (!count) return { count: 0, total: 0, debtPaid: 0 };
    var debtPaid = payIncome(s, total);
    s.bag = emptyBag();
    return { count: count, total: total, debtPaid: debtPaid };
  }

  // 연료·체력 채우기. 돈이 모자라면 가진 돈만큼만 채운다.
  function fill(s, key, cap, price) {
    var need = cap - s[key];
    if (need <= 0.01) return { amount: 0, cost: 0, reason: 'full' };
    var cost = Math.ceil(need * price);
    if (s.money >= cost) { s[key] = cap; s.money -= cost; return { amount: need, cost: cost }; }
    if (s.money <= 0) return { amount: 0, cost: 0, reason: 'money' };
    var amount = s.money / price;
    s[key] = Math.min(cap, s[key] + amount);
    cost = s.money;
    s.money = 0;
    return { amount: amount, cost: cost, partial: true };
  }
  function refuel(s) { return fill(s, 'fuel', fuelCap(s), Rules.FUEL_PRICE); }
  function repair(s) { return fill(s, 'hp', hpCap(s), Rules.REPAIR_PRICE); }
  function refuelCost(s) { return Math.ceil(Math.max(0, fuelCap(s) - s.fuel) * Rules.FUEL_PRICE); }
  function repairCost(s) { return Math.ceil(Math.max(0, hpCap(s) - s.hp) * Rules.REPAIR_PRICE); }

  // 살 수 있는지 공통 검사(빚·돈).
  function payFor(s, price) {
    if (s.debt > 0) return 'debt';
    if (s.money < price) return 'money';
    s.money -= price;
    return null;
  }

  function buyUpgrade(s, key) {
    if (!UP[key]) return { ok: false, reason: 'unknown' };
    var info = upgradeInfo(s, key);
    if (info.max) return { ok: false, reason: 'max' };
    if (info.locked) return { ok: false, reason: 'locked' };
    var oldFuel = fuelCap(s), oldHp = hpCap(s);
    var reason = payFor(s, info.price);
    if (reason) return { ok: false, reason: reason };
    s.levels[key]++;
    s.fuel += fuelCap(s) - oldFuel; // 큰 연료통·튼튼한 몸체는 늘어난 만큼 채워서 준다
    s.hp += hpCap(s) - oldHp;
    return { ok: true, level: s.levels[key] };
  }

  function buyRecall(s) {
    var reason = payFor(s, Rules.RECALL_PRICE);
    if (reason) return { ok: false, reason: reason };
    s.recall++;
    return { ok: true };
  }

  function useRecall(s) {
    if (s.recall <= 0) return { ok: false, reason: 'none' };
    if (!isUnderground(s)) return { ok: false, reason: 'surface' };
    s.recall--;
    teleportHome(s);
    return { ok: true };
  }

  function buyInstant(s) {
    if (s.instant >= Rules.INSTANT_MAX) return { ok: false, reason: 'full' };
    var reason = payFor(s, Rules.INSTANT_PRICE);
    if (reason) return { ok: false, reason: reason };
    s.instant++;
    return { ok: true };
  }

  // 💸 즉시 팔기: 땅속 어디서든 가방을 판다(값은 판매소와 같음).
  function useInstant(s) {
    if (s.instant <= 0) return { ok: false, reason: 'none' };
    if (!bagCount(s)) return { ok: false, reason: 'empty' };
    s.instant--;
    var result = sell(s);
    result.ok = true;
    return result;
  }

  // ---------- 🎰 뽑기 ----------
  // 일반 뽑기는 첫 번째 엔딩 전까지, 특수 뽑기는 그 뒤부터. 뽑은 광석은 가방에 들어간다(가득 차면 못 뽑음).
  function gachaBlock(s, kind) {
    if (!Rules.GACHA[kind]) return 'unknown';
    if (kind === 'normal' && unlocked(s)) return 'ended';
    if (kind === 'special' && !unlocked(s)) return 'locked';
    if (bagCount(s) >= bagCap(s)) return 'bag';
    return null;
  }

  // 무게대로 광석 하나 고르기: 0~무게 합 사이에서 수를 하나 뽑고, 무게를 차례로 빼다가 0 아래로 떨어진 광석.
  function rollGacha(kind, rand) {
    var list = Rules.GACHA[kind].ores;
    var total = 0;
    for (var i = 0; i < list.length; i++) total += list[i][1];
    var r = rand() * total;
    for (var j = 0; j < list.length; j++) {
      r -= list[j][1];
      if (r < 0) return list[j][0];
    }
    return list[list.length - 1][0];
  }

  // rand는 시험에서 결과를 정할 때만 넘긴다(보통은 Math.random).
  function gacha(s, kind, rand) {
    var block = gachaBlock(s, kind);
    if (block) return { ok: false, reason: block };
    var reason = payFor(s, Rules.GACHA[kind].price);
    if (reason) return { ok: false, reason: reason };
    var ore = rollGacha(kind, rand || Math.random);
    s.bag[ore]++;
    return { ok: true, ore: ore };
  }

  function buyAuto(s) {
    if (!unlocked(s)) return { ok: false, reason: 'locked' };
    if (s.autos.length >= Rules.AUTO_MAX) return { ok: false, reason: 'full' };
    var reason = payFor(s, Rules.AUTO_PRICE);
    if (reason) return { ok: false, reason: reason };
    var life = UP.autoLife.values[s.levels.autoLife];
    var col = Rules.PAD_WIDTH + Math.floor(Math.random() * (s.world.w - Rules.PAD_WIDTH));
    s.autos.push({ x: col, y: -1, tx: col, ty: -1, mode: null, p: 0, dur: 1, dir: Math.random() < 0.5 ? -1 : 1, side: 0, wait: 0, life: life, lifeMax: life });
    s.autoBought++;
    return { ok: true };
  }

  // 🎫 입장권: 첫 번째 엔딩 뒤, 열보호 끝 단계여야 살 수 있다.
  function ticketBlock(s) {
    if (!unlocked(s)) return 'locked';
    if (s.levels.heat < UP.heat.prices.length) return 'heat';
    if (s.ticket > 0) return 'have';
    return null;
  }
  function buyTicket(s) {
    var block = ticketBlock(s);
    if (block) return { ok: false, reason: block };
    var reason = payFor(s, Rules.TICKET_PRICE);
    if (reason) return { ok: false, reason: reason };
    s.ticket = 1;
    return { ok: true };
  }
  function useTicket(s) {
    if (s.ticket <= 0) return { ok: false, reason: 'none' };
    s.ticket = 0; // 들어가면 없어진다(나갔다가 다시 오려면 또 사야 함)
    s.inCore = true;
    s.dig = null;
    s.building = null;
    s.coreTimer = 0;
    s.car.x = CORE_SPAWN_X; s.car.y = CORE_ROOM.h - 1 - HALF;
    s.car.vx = 0; s.car.vy = 0;
    return { ok: true };
  }
  function leaveCore(s) { if (s.inCore) teleportHome(s); }
  // 🔴 버튼을 끝까지 누르면: 두 번째 엔딩(지구 파괴). 이 뒤로 update는 멈춘다.
  function pressCoreButton(s) {
    if (!s.inCore) return { ok: false };
    s.destroyedTime = Math.round(s.time);
    return { ok: true, time: s.destroyedTime };
  }

  // 불러온 저장에서 차가 땅에 끼어 있으면 지상으로 옮긴다.
  function fixStuck(s) {
    if (overlapsSolid(world(s), s.car.x, s.car.y)) teleportHome(s);
  }

  var Game = {
    newGame: newGame,
    update: update,
    sell: sell,
    refuel: refuel,
    repair: repair,
    refuelCost: refuelCost,
    repairCost: repairCost,
    buyUpgrade: buyUpgrade,
    buyRecall: buyRecall,
    useRecall: useRecall,
    buyInstant: buyInstant,
    useInstant: useInstant,
    buyAuto: buyAuto,
    gacha: gacha,
    gachaBlock: gachaBlock,
    rollGacha: rollGacha,
    leftCounts: leftCounts,
    buyTicket: buyTicket,
    ticketBlock: ticketBlock,
    useTicket: useTicket,
    leaveCore: leaveCore,
    pressCoreButton: pressCoreButton,
    fixStuck: fixStuck,
    teleportHome: teleportHome,
    overlapsSolid: overlapsSolid,
    world: world,
    fuelCap: fuelCap,
    hpCap: hpCap,
    bagCap: bagCap,
    bagCount: bagCount,
    bagValue: bagValue,
    emptyBag: emptyBag,
    depthOf: depthOf,
    heatDps: heatDps,
    isUnderground: isUnderground,
    unlocked: unlocked,
    upgradeInfo: upgradeInfo,
    upgradePrice: upgradePrice,
    rescueCost: rescueCost,
    CORE_ROOM: CORE_ROOM,
    CORE_DOOR: CORE_DOOR,
    CORE_BUTTON: CORE_BUTTON,
    SURFACE_Y: SURFACE_Y
  };

  MT.Game = Game;
  if (typeof module !== 'undefined' && module.exports) module.exports = Game;
})(typeof window !== 'undefined' ? (window.MT = window.MT || {}) : {});
