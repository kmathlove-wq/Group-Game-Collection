// ===== game.js =====
// 광질 타이쿤의 규칙(움직임·파기·연료·체력·가게). 화면·소리·저장은 전혀 모른다.
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

  // ---------- 차 능력치 ----------
  function fuelCap(s) { return UP.fuel.values[s.levels.fuel]; }
  function hpCap(s) { return UP.hull.values[s.levels.hull]; }
  function bagCap(s) { return UP.bag.values[s.levels.bag]; }
  function bagCount(s) { var n = 0; for (var i = 1; i < s.bag.length; i++) n += s.bag[i]; return n; }
  function bagValue(s) { var v = 0; for (var i = 1; i < s.bag.length; i++) v += s.bag[i] * Rules.ORES[i].value; return v; }
  function isUnderground(s) { return s.car.y > 0; }
  function depthOf(s) { return s.car.y > 0 ? Math.floor(s.car.y) + 1 : 0; }
  function rangeSize(s) { return s.wide ? UP.range.values[s.levels.range] : [1, 1]; }
  function upgradePrice(s, key) {
    var level = s.levels[key];
    return level < UP[key].prices.length ? UP[key].prices[level] : null;
  }
  function rescueCost(s) { return Rules.RESCUE_BASE + depthOf(s) * Rules.RESCUE_PER_M; }

  function newGame(options) {
    options = options || {};
    var seed = options.seed != null ? options.seed : Math.floor(Math.random() * 4294967296);
    var s = {
      version: 1,
      name: options.name || '이름없음',
      playerId: options.playerId || '',
      world: World.createWorld(seed),
      car: { x: Rules.SPAWN_X, y: SURFACE_Y, vx: 0, vy: 0, face: 1 },
      levels: { drill: 0, fuel: 0, bag: 0, hull: 0, engine: 0, range: 0 },
      bag: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      money: 0,
      debt: 0,
      earned: 0, // 지금까지 번 돈 전체(순위 기준, 쓴 돈은 안 뺌)
      recall: 0,
      wide: true,
      time: 0, // 걸린 시간(초, 일시정지 중엔 안 늚)
      treasureTime: null,
      maxDepth: 0,
      // 아래는 저장하지 않는 잠깐 상태
      dig: null,
      building: null,
      lowFuelWarned: false,
      burnTimer: 0,
      thrusting: false
    };
    s.fuel = fuelCap(s);
    s.hp = hpCap(s);
    markSeen(s);
    return s;
  }

  // ---------- 부딪힘 ----------
  function overlapsSolid(world, x, y) {
    var x0 = Math.floor(x - HALF + EPS), x1 = Math.floor(x + HALF - EPS);
    var y0 = Math.floor(y - HALF + EPS), y1 = Math.floor(y + HALF - EPS);
    for (var ty = y0; ty <= y1; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        if (World.isSolid(World.tileAt(world, tx, ty))) return true;
      }
    }
    return false;
  }

  function touchesLava(world, x, y) {
    var r = HALF + 0.06;
    var x0 = Math.floor(x - r), x1 = Math.floor(x + r);
    var y0 = Math.floor(y - r), y1 = Math.floor(y + r);
    for (var ty = y0; ty <= y1; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        if (World.tileAt(world, tx, ty) === TILE.LAVA) return true;
      }
    }
    return false;
  }

  function moveX(s, dx) {
    var car = s.car;
    var nx = car.x + dx;
    if (!overlapsSolid(s.world, nx, car.y)) { car.x = nx; return; }
    nx = dx > 0 ? Math.floor(nx + HALF - EPS) - HALF : Math.floor(nx - HALF + EPS) + 1 + HALF;
    if (!overlapsSolid(s.world, nx, car.y)) car.x = nx;
    car.vx = 0;
  }

  // 떨어져 바닥에 닿으면 닿는 순간의 속도를 돌려준다(낙하 피해 계산용).
  function moveY(s, dy) {
    var car = s.car;
    var ny = car.y + dy;
    if (!overlapsSolid(s.world, car.x, ny)) { car.y = ny; return 0; }
    var impact = dy > 0 ? car.vy : 0;
    ny = dy > 0 ? Math.floor(ny + HALF - EPS) - HALF : Math.floor(ny - HALF + EPS) + 1 + HALF;
    if (!overlapsSolid(s.world, car.x, ny)) car.y = ny;
    car.vy = 0;
    return impact;
  }

  function isGrounded(s) { return overlapsSolid(s.world, s.car.x, s.car.y + 0.03); }

  // ---------- 파기 ----------
  function canDrill(s, tile) {
    if (tile === TILE.DIRT || tile === TILE.STONE) return true;
    if (tile === TILE.ROCK || tile === TILE.TREASURE) return s.levels.drill >= Rules.ROCK_DRILL_LEVEL;
    return false;
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

  function tryDig(s, dx, dy, events) {
    var car = s.car;
    var col, row;
    if (dy) {
      col = Math.floor(car.x);
      row = Math.floor(car.y + HALF + 0.05);
    } else {
      row = Math.floor(car.y);
      if (Math.floor(car.y - HALF + EPS) !== row) return false; // 차가 두 줄에 걸쳐 있으면 옆으로 못 판다
      col = dx > 0 ? Math.floor(car.x + HALF + 0.05) : Math.floor(car.x - HALF - 0.05);
      var edge = dx > 0 ? car.x + HALF : car.x - HALF;
      var wall = dx > 0 ? col : col + 1;
      if (Math.abs(edge - wall) > 0.08) return false; // 벽에 딱 붙었을 때만
    }
    var tile = World.tileAt(s.world, col, row);
    if (tile === TILE.EMPTY) return false;
    if (tile === TILE.LAVA) { events.push({ type: 'blocked', reason: 'lava' }); return false; }
    if (!canDrill(s, tile)) {
      events.push({ type: 'blocked', reason: tile === TILE.ROCK || tile === TILE.TREASURE ? 'too-hard' : 'wall' });
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

  function finishDig(s, events) {
    var d = s.dig;
    var world = s.world;
    var got = [];
    var full = false;
    for (var i = 0; i < d.cells.length; i++) {
      var idx = d.cells[i];
      if (world.tiles[idx] === TILE.TREASURE) findTreasure(s, events);
      world.tiles[idx] = TILE.EMPTY;
      var ore = world.ores[idx];
      if (ore) {
        if (addOre(s, ore)) { got.push(ore); world.ores[idx] = 0; } else full = true;
      }
    }
    s.fuel = Math.max(0, s.fuel - (Rules.DIG_FUEL * d.hard + Rules.DIG_FUEL_EXTRA * (d.cells.length - 1)));
    s.car.x = d.toX; s.car.y = d.toY;
    s.dig = null;
    events.push({ type: 'dig-done', x: d.col, y: d.row, cells: d.cells.length, ores: got, full: full, hard: d.hard });
  }

  function findTreasure(s, events) {
    if (s.treasureTime == null) s.treasureTime = Math.round(s.time);
    s.money += Rules.TREASURE_REWARD;
    s.earned += Rules.TREASURE_REWARD;
    events.push({ type: 'treasure', time: s.treasureTime, reward: Rules.TREASURE_REWARD });
  }

  // ---------- 매 순간 ----------
  function markSeen(s) {
    var world = s.world;
    var cx = Math.floor(s.car.x), cy = Math.floor(s.car.y);
    for (var y = cy - 4; y <= cy + 4; y++) {
      if (y < 0 || y >= world.h) continue;
      for (var x = cx - 4; x <= cx + 4; x++) {
        if (x < 0 || x >= world.w) continue;
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= 18) world.seen[y * world.w + x] = 1;
      }
    }
  }

  function teleportHome(s) {
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
      s.bag = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      teleportHome(s);
      s.hp = hpCap(s);
      events.push({ type: 'dead', lost: lost });
    }
  }

  function step(s, input, h, events) {
    var car = s.car;
    var world = s.world;
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

    if (grounded && car.vy >= 0 && !input.up) {
      if (input.down && tryDig(s, 0, 1, events)) return;
      if (lr && tryDig(s, lr, 0, events)) return;
    }

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

    moveX(s, car.vx * h);
    var impact = moveY(s, car.vy * h);
    if (car.y < SKY_TOP) { car.y = SKY_TOP; car.vy = 0; }
    if (impact > Rules.SAFE_FALL_SPEED) hurt(s, Math.round((impact - Rules.SAFE_FALL_SPEED) * Rules.FALL_DAMAGE), 'fall', events);

    // 가방이 가득 차서 남겨 둔 광석 줍기
    var cx = Math.floor(car.x), cy = Math.floor(car.y);
    if (cy >= 0 && cy < world.h) {
      var idx = cy * world.w + cx;
      if (world.tiles[idx] === TILE.EMPTY && world.ores[idx] && addOre(s, world.ores[idx])) {
        events.push({ type: 'pickup', ore: world.ores[idx] });
        world.ores[idx] = 0;
      }
    }

    // 용암
    s.burnTimer = Math.max(0, s.burnTimer - h);
    if (touchesLava(world, car.x, car.y)) {
      if (s.burnTimer <= 0) { events.push({ type: 'burn' }); s.burnTimer = 0.5; }
      hurt(s, Rules.LAVA_BURN * h, 'lava', events);
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
    var debtPaid = Math.min(s.debt, total);
    s.debt -= debtPaid;
    s.money += total - debtPaid;
    s.earned += total;
    s.bag = [0, 0, 0, 0, 0, 0, 0, 0, 0];
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

  function buyUpgrade(s, key) {
    if (!UP[key]) return { ok: false, reason: 'unknown' };
    var price = upgradePrice(s, key);
    if (price == null) return { ok: false, reason: 'max' };
    if (s.debt > 0) return { ok: false, reason: 'debt' };
    if (s.money < price) return { ok: false, reason: 'money' };
    var oldFuel = fuelCap(s), oldHp = hpCap(s);
    s.money -= price;
    s.levels[key]++;
    s.fuel += fuelCap(s) - oldFuel; // 큰 연료통·튼튼한 몸체는 늘어난 만큼 채워서 준다
    s.hp += hpCap(s) - oldHp;
    return { ok: true, level: s.levels[key] };
  }

  function buyRecall(s) {
    if (s.debt > 0) return { ok: false, reason: 'debt' };
    if (s.money < Rules.RECALL_PRICE) return { ok: false, reason: 'money' };
    s.money -= Rules.RECALL_PRICE;
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

  // 불러온 저장에서 차가 땅에 끼어 있으면 지상으로 옮긴다.
  function fixStuck(s) {
    if (overlapsSolid(s.world, s.car.x, s.car.y)) teleportHome(s);
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
    fixStuck: fixStuck,
    teleportHome: teleportHome,
    overlapsSolid: overlapsSolid,
    fuelCap: fuelCap,
    hpCap: hpCap,
    bagCap: bagCap,
    bagCount: bagCount,
    bagValue: bagValue,
    depthOf: depthOf,
    isUnderground: isUnderground,
    upgradePrice: upgradePrice,
    rescueCost: rescueCost,
    SURFACE_Y: SURFACE_Y
  };

  MT.Game = Game;
  if (typeof module !== 'undefined' && module.exports) module.exports = Game;
})(typeof window !== 'undefined' ? (window.MT = window.MT || {}) : {});
