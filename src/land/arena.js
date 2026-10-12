// 색칠 땅따먹기의 판과 규칙(소켓과 무관한 순수 계산). 서버가 1틱(0.1초)마다 tick()을 부른다.
// 플레이어는 칸에 묶이지 않고 각도(angle)로 자유롭게 움직인다(Paper.io 2 방식).
// 땅·꼬리 판정은 잘게 나눈 보이지 않는 모눈으로 한다: 칸 번호 = y * size + x,
// owner[칸] = 땅 주인 번호(0 = 빈 땅), trail[칸] = 꼬리(굵은 띠) 주인 번호,
// core[칸] = 꼬리 가운데 가는 심지 주인 번호, coreAt[칸] = 심지가 찍힐 때 그 사람이 지금까지 걸은 거리.

const MAX_ID = 255;
const STEP = 0.5; // 한 틱 동안 움직인 길을 이 간격으로 나눠 검사한다(빠르게 지나쳐도 꼬리를 놓치지 않게)

// 땅을 몇 칸 차지하면 "정복 완료!"로 판을 새로 시작할지 정한다.
// 지금은 사용자 결정대로 판 전체(100%)다.
function conquerGoal(totalCells) {
  return totalCells;
}

function angleDiff(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function createArena({
  size = 360, speed = 2.2, turnRate = 0.45, brush = 1.5, coreRadius = 0.75, selfGap = 5.5, headHit = 2.4,
  startRadius = 7, invulnerableTicks = 20, random = Math.random
} = {}) {
  const total = size * size;
  const owner = new Uint8Array(total);
  const trail = new Uint8Array(total);
  const core = new Uint8Array(total);
  const coreAt = new Float32Array(total);
  const counts = new Int32Array(MAX_ID + 1);
  // 주인별 땅이 있을 수 있는 네모 구역 [왼, 위, 오른, 아래]. 늘기만 하고 탈락 때 비운다.
  // 땅 칠하기·지우기가 판 전체 대신 이 구역만 훑게 해서 사람이 많아도 빠르게 한다.
  const boxes = Array.from({ length: MAX_ID + 1 }, () => [size, size, -1, -1]);
  const players = new Map();          // id → 플레이어
  const ownerDirty = new Map();       // 바뀐 칸 → 새 값(보낸 뒤 비움)
  const seen = new Uint8Array(total); // 물 채우기용(재사용)
  const queue = new Int32Array(total);
  const reach = Math.ceil(brush);
  let tickNo = 0;

  const idx = (x, y) => y * size + x;
  const cellOf = (x, y) => idx(Math.min(size - 1, Math.max(0, Math.floor(x))), Math.min(size - 1, Math.max(0, Math.floor(y))));
  const clamp = (v) => Math.min(size - 0.01, Math.max(0.01, v));

  function setOwner(c, id) {
    const old = owner[c];
    if (old === id) return;
    counts[old] -= 1; counts[id] += 1;
    owner[c] = id; ownerDirty.set(c, id);
    if (id) {
      const b = boxes[id]; const x = c % size; const y = (c - x) / size;
      if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
    }
  }
  function eachInBox(id, fn) {
    const [x0, y0, x1, y1] = boxes[id];
    for (let y = y0; y <= y1; y += 1) for (let x = x0, c = y * size + x0; x <= x1; x += 1, c += 1) fn(c, x, y);
  }
  counts[0] = total;

  function freeId() {
    for (let id = 1; id <= MAX_ID; id += 1) if (!players.has(id)) return id;
    return 0;
  }

  function addPlayer({ nickname, bot = false, color }) {
    const id = freeId();
    if (!id) return null;
    const hue = Math.round((id * 137.508) % 360); // 황금각으로 돌려 이웃 번호끼리 색이 겹치지 않게
    const player = { id, nickname, bot, color: color || `hsl(${hue} 72% 52%)`, alive: false, x: 0, y: 0, angle: 0, target: 0,
      trailCells: [], trailPoints: [], outside: false, walked: 0, invUntil: 0, kills: 0, best: 0, bornAt: 0 };
    players.set(id, player);
    return player;
  }

  function clearTrail(p) {
    for (const c of p.trailCells) { if (trail[c] === p.id) trail[c] = 0; if (core[c] === p.id) core[c] = 0; }
    p.trailCells = []; p.trailPoints = []; p.outside = false;
  }

  function clearPlayer(p) {
    clearTrail(p);
    if (counts[p.id] > 0) eachInBox(p.id, (c) => { if (owner[c] === p.id) setOwner(c, 0); });
    boxes[p.id] = [size, size, -1, -1];
    p.alive = false;
  }

  function removePlayer(id) {
    const p = players.get(id);
    if (!p) return;
    clearPlayer(p);
    players.delete(id);
  }

  // (x, y)를 가운데로 동그란 땅을 주고 태어나게 한다(시험용으로 자리를 직접 줄 때도 씀).
  function spawnAt(p, x, y, angle = random() * Math.PI * 2) {
    clearPlayer(p);
    const r = startRadius;
    for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy += 1) {
      for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx += 1) {
        if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
        if ((xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 <= r * r) setOwner(idx(xx, yy), p.id);
      }
    }
    Object.assign(p, { alive: true, x, y, angle, target: angle, trailCells: [], trailPoints: [], outside: false,
      invUntil: tickNo + invulnerableTicks, kills: 0, best: counts[p.id], bornAt: tickNo });
    return true;
  }

  function areaIsFree(x, y, r, strict) {
    for (const q of players.values()) if (q.alive && (q.x - x) ** 2 + (q.y - y) ** 2 < (r + 4) ** 2) return false;
    for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy += 1) {
      for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx += 1) {
        if (xx < 0 || yy < 0 || xx >= size || yy >= size) return false;
        const c = idx(xx, yy);
        if (trail[c] || (strict && owner[c])) return false;
      }
    }
    return true;
  }

  // 빈 땅을 먼저 찾고, 못 찾으면 꼬리·머리만 없는 곳에 태어난다(남의 땅 위라도).
  function spawn(p) {
    const margin = startRadius + 8;
    for (const [tries, r, strict] of [[300, startRadius + 6, true], [300, startRadius + 2, false]]) {
      for (let i = 0; i < tries; i += 1) {
        const x = margin + random() * (size - margin * 2);
        const y = margin + random() * (size - margin * 2);
        if (areaIsFree(x, y, r, strict)) return spawnAt(p, x, y);
      }
    }
    return false;
  }

  // 가고 싶은 방향(라디안). 실제 방향은 한 틱에 turnRate만큼씩만 돌아가 곡선을 그린다.
  function steer(id, angle) {
    const p = players.get(id);
    if (!p?.alive || typeof angle !== 'number' || !Number.isFinite(angle)) return;
    p.target = angle;
  }

  // (x, y) 둘레 brush 반지름 안의 칸에 꼬리를 찍고, 더 가까운 coreRadius 안은 심지로도 찍는다. 내 땅 위에는 찍지 않는다.
  function stamp(p, x, y) {
    for (let yy = Math.floor(y) - reach; yy <= Math.floor(y) + reach; yy += 1) {
      for (let xx = Math.floor(x) - reach; xx <= Math.floor(x) + reach; xx += 1) {
        if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
        const d2 = (xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2;
        if (d2 > brush * brush) continue;
        const c = idx(xx, yy);
        if (owner[c] === p.id) continue;
        if (trail[c] !== p.id) { trail[c] = p.id; p.trailCells.push(c); }
        // 이미 내 심지면 처음 찍힌 거리를 그대로 둔다(지나간 지 오래된 꼬리로 남게)
        if (d2 <= coreRadius * coreRadius && core[c] !== p.id) { core[c] = p.id; coreAt[c] = p.walked; }
      }
    }
  }

  // 꼬리를 땅으로 바꾸고, 판 가장자리에서 물을 부어 닿지 않은 곳을 모두 p의 땅으로 칠한다.
  function capture(p) {
    for (const c of p.trailCells) if (trail[c] === p.id) setOwner(c, p.id);
    clearTrail(p);
    // 둘러싼 곳은 반드시 p의 땅 구역 안에 있다. 구역보다 한 칸 넓은 테두리에서 물을 붓는다.
    const [bx0, by0, bx1, by1] = boxes[p.id];
    const x0 = Math.max(0, bx0 - 1); const y0 = Math.max(0, by0 - 1);
    const x1 = Math.min(size - 1, bx1 + 1); const y1 = Math.min(size - 1, by1 + 1);
    for (let y = y0; y <= y1; y += 1) seen.fill(0, y * size + x0, y * size + x1 + 1);
    let head = 0; let tail = 0;
    const pour = (c) => { if (!seen[c] && owner[c] !== p.id) { seen[c] = 1; queue[tail++] = c; } };
    for (let x = x0; x <= x1; x += 1) { pour(idx(x, y0)); pour(idx(x, y1)); }
    for (let y = y0; y <= y1; y += 1) { pour(idx(x0, y)); pour(idx(x1, y)); }
    while (head < tail) {
      const c = queue[head++]; const x = c % size; const y = (c - x) / size;
      if (x > x0) pour(c - 1); if (x < x1) pour(c + 1);
      if (y > y0) pour(c - size); if (y < y1) pour(c + size);
    }
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0, c = y * size + x0; x <= x1; x += 1, c += 1) if (!seen[c] && owner[c] !== p.id) setOwner(c, p.id);
    }
  }

  function tick() {
    tickNo += 1;
    const events = [];
    const alive = [...players.values()].filter((p) => p.alive);
    const deaths = new Map(); // id → { by, reason }
    const kill = (victim, by, reason) => { if (!deaths.has(victim.id)) deaths.set(victim.id, { by, reason }); };
    const safe = (p) => p.invUntil > tickNo;

    // 1) 방향을 조금 틀고 앞으로 간다. 판 끝에서는 멈추거나 벽을 따라 미끄러진다(탈락 아님, 사용자 결정).
    for (const p of alive) {
      const d = angleDiff(p.angle, p.target);
      p.angle += Math.max(-turnRate, Math.min(turnRate, d));
      const nx = clamp(p.x + Math.cos(p.angle) * speed); const ny = clamp(p.y + Math.sin(p.angle) * speed);
      const length = Math.hypot(nx - p.x, ny - p.y);
      const steps = Math.ceil(length / STEP); // 벽에 막혀 못 움직이면 0
      p.path = [];
      for (let i = 1; i <= steps; i += 1) p.path.push([p.x + (nx - p.x) * i / steps, p.y + (ny - p.y) * i / steps]);
      p.nx = nx; p.ny = ny;
    }

    // 2) 머리끼리 부딪힘: 자기 땅 위에 있는 사람만 살고, 둘 다 땅 밖이면 둘 다 탈락.
    for (let i = 0; i < alive.length; i += 1) {
      for (let j = i + 1; j < alive.length; j += 1) {
        const p = alive[i]; const q = alive[j];
        if ((p.nx - q.nx) ** 2 + (p.ny - q.ny) ** 2 >= headHit * headHit) continue;
        const pHome = owner[cellOf(p.nx, p.ny)] === p.id; const qHome = owner[cellOf(q.nx, q.ny)] === q.id;
        if (!pHome && !safe(p)) kill(p, q.id, 'crash');
        if (!qHome && !safe(q)) kill(q, p.id, 'crash');
      }
    }

    // 3) 꼬리 밟기(이번 틱 전 꼬리 기준): 머리 둘레(꼬리 굵기와 같은 크기)에 남의 꼬리가 닿으면 그 사람이 탈락.
    //    내 꼬리는 머리 한가운데가 심지(selfGap칸 넘게 걸어오기 전에 찍힌 것)를 지날 때만 탈락이다
    //    (굵은 띠 가장자리를 스치거나, 방금 지나온 꼬리, 벽에 막혀 제자리일 때 발밑 꼬리로는 탈락하지 않게).
    for (const p of alive) {
      for (const [x, y] of p.path) {
        const c = cellOf(x, y);
        if (core[c] === p.id && owner[c] !== p.id && p.walked + Math.hypot(x - p.x, y - p.y) - coreAt[c] > selfGap) { kill(p, 0, 'self'); break; }
        for (let yy = Math.floor(y) - reach; yy <= Math.floor(y) + reach; yy += 1) {
          for (let xx = Math.floor(x) - reach; xx <= Math.floor(x) + reach; xx += 1) {
            if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
            const q = trail[idx(xx, yy)];
            if (!q || q === p.id || (xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 > brush * brush) continue;
            const victim = players.get(q);
            if (victim?.alive && !safe(victim)) kill(victim, p.id, 'cut');
          }
        }
      }
    }

    // 4) 탈락 처리 먼저, 그다음 살아남은 사람 이동과 땅 얻기.
    const finish = (id, { by, reason }) => {
      const p = players.get(id);
      if (!p?.alive) return;
      clearPlayer(p);
      const killer = players.get(by);
      if (killer && killer !== p) killer.kills += 1;
      events.push({ type: 'death', id, by: killer && killer !== p ? killer.id : 0, reason });
    };
    for (const [id, info] of deaths) finish(id, info);

    const captured = [];
    for (const p of alive) {
      if (!p.alive) continue;
      // 지나간 순서대로 본다: 땅 밖에 나가 있다가(꼬리가 있다가) 내 땅에 들어온 경우만 "돌아옴"이다.
      let home = false;
      for (const [x, y] of p.path) {
        if (owner[cellOf(x, y)] === p.id) { if (p.outside) home = true; continue; }
        stamp(p, x, y); p.outside = true;
      }
      p.walked += Math.hypot(p.nx - p.x, p.ny - p.y);
      p.x = p.nx; p.y = p.ny;
      if (p.outside && home) captured.push(p);
      else if (p.outside) p.trailPoints.push(Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10);
    }
    for (const p of captured) {
      if (!p.alive) continue;
      const before = counts[p.id];
      capture(p);
      events.push({ type: 'capture', id: p.id, gained: counts[p.id] - before });
      // 땅을 모두 빼앗긴 사람은 탈락(둘러싸여 사라짐).
      for (const q of players.values()) if (q.alive && q !== p && counts[q.id] === 0) finish(q.id, { by: p.id, reason: 'surrounded' });
    }

    for (const p of players.values()) if (p.alive) p.best = Math.max(p.best, counts[p.id]);
    const goal = conquerGoal(total);
    for (const p of captured) if (p.alive && counts[p.id] >= goal) { events.push({ type: 'conquer', id: p.id }); break; }

    // 바뀐 칸 목록은 보낸 뒤에 비운다(틱 사이에 태어나기·나가기로 바뀐 칸도 다음 틱에 함께 나가게).
    const result = { tick: tickNo, players: playerTuples(), owner: runs(), events };
    ownerDirty.clear();
    return result;
  }

  // [번호, x, y, 각도, 무적, 땅 밖(꼬리 있음)] — 소수점을 줄여 보내는 양을 아낀다.
  function playerTuples() {
    return [...players.values()].filter((p) => p.alive).map((p) => [p.id, Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10,
      Math.round(p.angle * 100) / 100, p.invUntil > tickNo ? 1 : 0, p.outside ? 1 : 0]);
  }

  // 바뀐 칸을 [시작 칸, 길이, 주인, …] 묶음으로 보낸다(땅을 얻으면 줄줄이 붙은 칸이 많이 바뀐다).
  function runs() {
    if (!ownerDirty.size) return [];
    const cells = [...ownerDirty.keys()].sort((a, b) => a - b);
    const out = [];
    for (const c of cells) {
      const v = owner[c]; const n = out.length;
      if (n && out[n - 3] + out[n - 2] === c && out[n - 1] === v) out[n - 2] += 1;
      else out.push(c, 1, v);
    }
    return out;
  }

  // 정복 뒤 판을 비운다(플레이어 목록은 그대로, 모두 탈락 상태).
  function reset() {
    for (const p of players.values()) { p.alive = false; p.trailCells = []; p.trailPoints = []; p.outside = false; }
    owner.fill(0); trail.fill(0); core.fill(0); counts.fill(0); counts[0] = total;
    for (const b of boxes) { b[0] = size; b[1] = size; b[2] = -1; b[3] = -1; }
    ownerDirty.clear();
  }

  function snapshot() {
    return { size, tick: tickNo, owner: Buffer.from(owner), brush, players: playerTuples(),
      trails: [...players.values()].filter((p) => p.alive && p.outside).map((p) => [p.id, p.trailPoints]) };
  }

  return { size, total, owner, trail, core, coreAt, counts, speed, turnRate, selfGap, players, addPlayer, removePlayer, spawn, spawnAt, steer, tick, reset, snapshot,
    idx, cellOf, get tickNo() { return tickNo; } };
}

module.exports = { createArena, conquerGoal, angleDiff };
