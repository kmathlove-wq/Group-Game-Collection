'use strict';

// 인간 vs 바퀴벌레 — 소켓 없는 순수 규칙(시험하기 쉽게 따로 둔다).
// 판은 위에서 본 집(1600×1000). 벽은 아무도 못 지나가고, 가구 중 hide가 붙은 것(식탁·냉장고·소파·거실 탁자·침대·신발장)은
// 바퀴벌레만 밑으로 들어가 숨을 수 있다(인간은 못 지나감). 한가운데가 가구 안에 있으면 '숨음' — 인간에게는 그 바퀴를 보내지 않는다.
// 시간은 step(arena, 초)로만 흐른다. 서버는 0.05초마다 한 번 부른다.

const WORLD = { w: 1600, h: 1000 };
const TICK_SECONDS = 0.05;
const ROLE = {
  human: { speed: 150, size: 22 }, // size = 몸 반 너비(벽 부딪힘은 네모로 계산해 미끄러지기 쉽게)
  roach: { speed: 200, size: 10 }
};
const SLIPPER = { cooldown: 0.8, reach: 50, radius: 36 };      // 앞쪽 50 지점을 가운데로 반지름 36 원
const SPRAY = { cooldown: 6, range: 190, halfAngle: 0.55, slowSeconds: 2, slowFactor: 0.45 };
const HIDE_LIMIT = 8;         // 같은 가구 밑에 이만큼(초) 있으면 쫓겨남
const HIDE_BLOCK = 4;         // 쫓겨난 뒤 그 가구에 다시 못 들어가는 시간
const SAFE_SECONDS = 2;       // 처음·부활 직후 무적
const CRUMB = { max: 12, start: 8, every: 1.5, radius: 9, eatReach: 8, bigChance: 0.12 };
const EGG_EVERY = 10;         // 팀 점수 10점마다 잡힌 바퀴 1마리 알에서 부활

const WALLS = [
  { x: 0, y: 0, w: 1600, h: 20 }, { x: 0, y: 980, w: 1600, h: 20 }, { x: 0, y: 0, w: 20, h: 1000 }, { x: 1580, y: 0, w: 20, h: 1000 },
  // 부엌 | 거실 (문 두 개: y 380~500, 700~820)
  { x: 600, y: 20, w: 20, h: 360 }, { x: 600, y: 500, w: 20, h: 200 }, { x: 600, y: 820, w: 20, h: 160 },
  // 거실 | 침실 (문: y 260~380)
  { x: 1100, y: 20, w: 20, h: 240 }, { x: 1100, y: 380, w: 20, h: 240 },
  // 침실 | 현관 (문: x 1300~1420)
  { x: 1120, y: 600, w: 180, h: 20 }, { x: 1420, y: 600, w: 160, h: 20 }
];
const FLOORS = [
  { x: 20, y: 20, w: 580, h: 960, kind: 'tile', name: '부엌' },
  { x: 620, y: 20, w: 480, h: 960, kind: 'wood', name: '거실' },
  { x: 1100, y: 620, w: 480, h: 360, kind: 'stone', name: '현관' },
  { x: 1120, y: 20, w: 460, h: 580, kind: 'carpet', name: '침실' }
];
const FURNITURE = [
  { id: 'sink', kind: 'sink', name: '싱크대', x: 20, y: 20, w: 330, h: 70, hide: false },
  { id: 'fridge', kind: 'fridge', name: '냉장고', x: 490, y: 20, w: 110, h: 100, hide: true },
  { id: 'stove', kind: 'stove', name: '조리대', x: 20, y: 200, w: 80, h: 220, hide: false },
  { id: 'table', kind: 'table', name: '식탁', x: 210, y: 430, w: 240, h: 150, hide: true },
  { id: 'bin', kind: 'bin', name: '쓰레기통', x: 20, y: 880, w: 80, h: 100, hide: false },
  { id: 'sofa', kind: 'sofa', name: '소파', x: 700, y: 20, w: 300, h: 100, hide: true },
  { id: 'lowtable', kind: 'lowtable', name: '거실 탁자', x: 770, y: 330, w: 160, h: 90, hide: true },
  { id: 'tv', kind: 'tv', name: 'TV장', x: 720, y: 920, w: 260, h: 60, hide: false },
  { id: 'closet', kind: 'closet', name: '옷장', x: 1120, y: 20, w: 130, h: 70, hide: false },
  { id: 'bed', kind: 'bed', name: '침대', x: 1340, y: 20, w: 240, h: 300, hide: true },
  { id: 'shelf', kind: 'shelf', name: '신발장', x: 1480, y: 700, w: 100, h: 200, hide: true }
];
const HUMAN_SPAWNS = [[860, 620], [960, 620], [760, 620], [860, 740], [960, 740], [760, 740]];
const ROACH_SPAWNS = [[150, 140], [330, 760], [480, 880], [160, 620], [1180, 180], [1250, 480], [1500, 450],
  [1200, 900], [1350, 760], [660, 200], [1040, 250], [520, 300]];

// 인원에 따라 인간 수: 3~5명 1명, 6~8명 2명, 9~12명 3명. 방장이 고른 수(1~)는 바퀴가 항상 더 많게 줄인다.
const autoHumans = (n) => (n >= 9 ? 3 : n >= 6 ? 2 : 1);
const maxHumans = (n) => Math.max(1, Math.floor((n - 1) / 2));
function humanCountFor(n, wanted = 0) {
  const pick = Number.isInteger(wanted) && wanted > 0 ? wanted : autoHumans(n);
  return Math.min(pick, maxHumans(n));
}
// 부스러기 목표: 바퀴 수와 시간(분)에 맞춰.
const crumbGoal = (roaches, minutes = 3) => Math.max(10, Math.round((20 + 8 * roaches) * minutes / 3));

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 100) / 100;
function normAngle(a) { let v = a % (Math.PI * 2); if (v > Math.PI) v -= Math.PI * 2; if (v < -Math.PI) v += Math.PI * 2; return v; }
const boxHits = (x, y, s, r) => x + s > r.x && x - s < r.x + r.w && y + s > r.y && y - s < r.y + r.h;
const inside = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

// 선분(a→b)이 네모를 지나는지(벽 너머로는 때리거나 뿌릴 수 없음). 슬랩 방식.
function segmentHitsRect(ax, ay, bx, by, r) {
  let t0 = 0; let t1 = 1; const dx = bx - ax; const dy = by - ay;
  for (const [p, q] of [[-dx, ax - r.x], [dx, r.x + r.w - ax], [-dy, ay - r.y], [dy, r.y + r.h - ay]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}

function createArena({ players, random = Math.random, durationSec = 180, countdownSec = 3, goal } = {}) {
  const arena = {
    time: 0, phase: countdownSec > 0 ? 'countdown' : 'play', countdownSec, durationSec,
    endsAt: countdownSec + durationSec, random, players: [], byId: new Map(), crumbs: [], crumbSeq: 0,
    crumbVersion: 0, nextCrumbAt: countdownSec + CRUMB.every, score: 0, eggs: 0, events: [], winner: null, reason: null
  };
  const humanSpawns = [...HUMAN_SPAWNS]; const roachSpawns = shuffle([...ROACH_SPAWNS], random);
  let hi = 0; let ri = 0;
  players.forEach(({ id, role }, i) => {
    const spot = role === 'human' ? humanSpawns[hi++ % humanSpawns.length] : roachSpawns[ri++ % roachSpawns.length];
    const p = { id, n: i + 1, role, x: spot[0], y: spot[1], angle: role === 'human' ? -Math.PI / 2 : random() * Math.PI * 2,
      move: false, alive: true, gone: false, connected: true, slowUntil: 0, safeUntil: countdownSec + SAFE_SECONDS,
      hidden: false, hideId: null, hideMeter: 0, block: null, slipperAt: -99, sprayAt: -99, eaten: 0, catches: 0, caughtAt: null };
    arena.players.push(p); arena.byId.set(id, p);
  });
  const roaches = arena.players.filter((p) => p.role === 'roach').length;
  arena.goal = goal || crumbGoal(roaches, durationSec / 60);
  for (let i = 0; i < CRUMB.start; i += 1) spawnCrumb(arena);
  return arena;
}

function shuffle(list, random) {
  for (let i = list.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}

// 이 사람이 부딪히는 것: 벽 + (인간이면 모든 가구 / 바퀴면 숨을 수 없는 가구와 쫓겨난 직후의 그 가구).
function solidsFor(arena, p) {
  const list = [...WALLS];
  for (const f of FURNITURE) {
    if (!f.hide || p.role === 'human' || (p.block && p.block.id === f.id && arena.time < p.block.until)) list.push(f);
  }
  return list;
}
const blocked = (x, y, s, solids) => x - s < 0 || y - s < 0 || x + s > WORLD.w || y + s > WORLD.h || solids.some((r) => boxHits(x, y, s, r));

// 가로·세로를 따로 움직여 벽에 닿으면 벽 앞에 딱 붙인다(그래서 벽을 따라 미끄러진다).
function moveBy(p, dx, dy, solids) {
  const s = ROLE[p.role].size;
  if (dx) {
    let nx = p.x + dx;
    for (const r of solids) if (boxHits(nx, p.y, s, r)) nx = dx > 0 ? Math.min(nx, r.x - s) : Math.max(nx, r.x + r.w + s);
    p.x = clamp(nx, s, WORLD.w - s);
  }
  if (dy) {
    let ny = p.y + dy;
    for (const r of solids) if (boxHits(p.x, ny, s, r)) ny = dy > 0 ? Math.min(ny, r.y - s) : Math.max(ny, r.y + r.h + s);
    p.y = clamp(ny, s, WORLD.h - s);
  }
}

function setInput(arena, id, input) {
  const p = arena.byId.get(id); if (!p || !p.alive) return false;
  const angle = Number(input?.angle);
  if (Number.isFinite(angle)) p.angle = normAngle(angle);
  p.move = Boolean(input?.move);
  return true;
}
function setConnected(arena, id, connected) {
  const p = arena.byId.get(id); if (!p) return;
  p.connected = connected; if (!connected) p.move = false;
}
// 게임 중 방을 나가면 판에서 빠진다(바퀴는 탈락과 같음).
function removePlayer(arena, id) {
  const p = arena.byId.get(id); if (!p) return;
  p.gone = true; p.alive = false; p.move = false; p.hidden = false;
}

const speedOf = (arena, p) => ROLE[p.role].speed * (arena.time < p.slowUntil ? SPRAY.slowFactor : 1);
const hideSpot = (p) => (p.role === 'roach' ? FURNITURE.find((f) => f.hide && inside(p.x, p.y, f)) || null : null);
const canSeeLine = (ax, ay, bx, by) => !WALLS.some((w) => segmentHitsRect(ax, ay, bx, by, w))
  && !FURNITURE.some((f) => !f.hide && segmentHitsRect(ax, ay, bx, by, f));
const targetable = (arena, p) => p.role === 'roach' && p.alive && !p.hidden && arena.time >= p.safeUntil;

// 인간의 공격. 쿨타임이 남았거나 시작 전이면 { ok: false }.
function act(arena, id, type) {
  const p = arena.byId.get(id);
  if (!p || !p.alive) return { ok: false, message: '지금은 할 수 없어요.' };
  if (p.role !== 'human') return { ok: false, message: '바퀴벌레는 공격할 수 없어요. 도망쳐요!' };
  if (arena.phase !== 'play') return { ok: false, message: '아직 시작 전이에요.' };
  if (type === 'slipper') {
    const wait = p.slipperAt + SLIPPER.cooldown - arena.time;
    if (wait > 1e-9) return { ok: false, message: '슬리퍼를 다시 드는 중이에요.', wait: round2(wait) };
    p.slipperAt = arena.time;
    const cx = p.x + Math.cos(p.angle) * SLIPPER.reach; const cy = p.y + Math.sin(p.angle) * SLIPPER.reach;
    arena.events.push({ k: 'slip', n: p.n, a: round2(p.angle) });
    const hits = [];
    for (const r of arena.players) {
      if (!targetable(arena, r)) continue;
      if (Math.hypot(r.x - cx, r.y - cy) > SLIPPER.radius + ROLE.roach.size) continue;
      if (!canSeeLine(p.x, p.y, r.x, r.y)) continue;
      r.alive = false; r.move = false; r.caughtAt = arena.time; p.catches += 1; hits.push(r.n);
      arena.events.push({ k: 'squash', n: r.n, by: p.n, x: Math.round(r.x), y: Math.round(r.y) });
    }
    return { ok: true, hits };
  }
  if (type === 'spray') {
    const wait = p.sprayAt + SPRAY.cooldown - arena.time;
    if (wait > 1e-9) return { ok: false, message: '스프레이를 채우는 중이에요.', wait: round2(wait) };
    p.sprayAt = arena.time;
    arena.events.push({ k: 'spray', n: p.n, a: round2(p.angle) });
    const hits = [];
    for (const r of arena.players) {
      if (!targetable(arena, r)) continue;
      const d = Math.hypot(r.x - p.x, r.y - p.y);
      if (d > SPRAY.range + ROLE.roach.size) continue;
      if (d > ROLE.human.size && Math.abs(normAngle(Math.atan2(r.y - p.y, r.x - p.x) - p.angle)) > SPRAY.halfAngle) continue;
      if (!canSeeLine(p.x, p.y, r.x, r.y)) continue;
      r.slowUntil = arena.time + SPRAY.slowSeconds; hits.push(r.n);
      arena.events.push({ k: 'slow', n: r.n });
    }
    return { ok: true, hits };
  }
  return { ok: false, message: '알 수 없는 행동이에요.' };
}

function freeSpot(arena, s, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    const x = 40 + arena.random() * (WORLD.w - 80); const y = 40 + arena.random() * (WORLD.h - 80);
    if (!WALLS.some((r) => boxHits(x, y, s, r)) && !FURNITURE.some((r) => boxHits(x, y, s, r))) return [x, y];
  }
  return null;
}
function spawnCrumb(arena) {
  if (arena.crumbs.length >= CRUMB.max) return;
  const spot = freeSpot(arena, CRUMB.radius + 4); if (!spot) return;
  arena.crumbs.push({ id: ++arena.crumbSeq, x: Math.round(spot[0]), y: Math.round(spot[1]), v: arena.random() < CRUMB.bigChance ? 3 : 1 });
  arena.crumbVersion += 1;
}

// 쫓겨날 때: 가구 네 변 바깥 중 가장 가깝고 막히지 않은 곳으로 밀어낸다.
function kickOut(arena, p, f) {
  p.block = { id: f.id, until: arena.time + HIDE_BLOCK };
  const s = ROLE.roach.size + 2; const solids = solidsFor(arena, p);
  const cx = clamp(p.x, f.x + s, f.x + f.w - s); const cy = clamp(p.y, f.y + s, f.y + f.h - s);
  const spots = [[f.x - s, cy], [f.x + f.w + s, cy], [cx, f.y - s], [cx, f.y + f.h + s]]
    .sort((a, b) => Math.hypot(a[0] - p.x, a[1] - p.y) - Math.hypot(b[0] - p.x, b[1] - p.y));
  const spot = spots.find(([x, y]) => !blocked(x, y, ROLE.roach.size, solids)) || freeSpot(arena, ROLE.roach.size + 4) || [p.x, p.y];
  [p.x, p.y] = spot;
  p.hidden = false; p.hideMeter = 0;
  arena.events.push({ k: 'kick', n: p.n, f: f.id });
}

// 잡힌 바퀴를 인간들에게서 가장 먼 출발 자리에 되살린다.
function revive(arena, p) {
  const humans = arena.players.filter((h) => h.role === 'human' && h.alive);
  const far = (pt) => Math.min(Infinity, ...humans.map((h) => Math.hypot(h.x - pt[0], h.y - pt[1])));
  const spot = [...ROACH_SPAWNS].sort((a, b) => far(b) - far(a))[0];
  Object.assign(p, { x: spot[0], y: spot[1], alive: true, move: false, caughtAt: null, slowUntil: 0, safeUntil: arena.time + SAFE_SECONDS, hidden: false, hideMeter: 0, block: null });
  arena.events.push({ k: 'revive', n: p.n });
}

function step(arena, dt = TICK_SECONDS) {
  if (arena.winner) return arena;
  arena.time = round2(arena.time + dt);
  if (arena.phase === 'countdown') {
    if (arena.time < arena.countdownSec - 1e-9) return arena;
    arena.phase = 'play';
  }
  for (const p of arena.players) {
    if (!p.alive) continue;
    if (p.move) moveBy(p, Math.cos(p.angle) * speedOf(arena, p) * dt, Math.sin(p.angle) * speedOf(arena, p) * dt, solidsFor(arena, p));
    if (p.role !== 'roach') continue;
    const f = hideSpot(p);
    if (f) {
      if (p.hideId !== f.id) { p.hideId = f.id; p.hideMeter = 0; }
      p.hidden = true; p.hideMeter += dt;
      if (p.hideMeter >= HIDE_LIMIT - 1e-9) kickOut(arena, p, f);
    } else {
      p.hidden = false; p.hideMeter = Math.max(0, p.hideMeter - dt); // 잠깐 나왔다 들어가도 시간이 거의 그대로
    }
    // 부스러기 먹기
    for (let i = arena.crumbs.length - 1; i >= 0; i -= 1) {
      const c = arena.crumbs[i];
      if (Math.hypot(c.x - p.x, c.y - p.y) > ROLE.roach.size + CRUMB.radius + CRUMB.eatReach) continue;
      arena.crumbs.splice(i, 1); arena.crumbVersion += 1;
      const before = Math.floor(arena.score / EGG_EVERY);
      arena.score += c.v; p.eaten += c.v;
      arena.events.push({ k: 'eat', n: p.n, x: c.x, y: c.y, v: c.v });
      for (let e = before; e < Math.floor(arena.score / EGG_EVERY); e += 1) {
        const dead = arena.players.filter((r) => r.role === 'roach' && !r.alive && !r.gone).sort((a, b) => a.caughtAt - b.caughtAt)[0];
        if (dead) revive(arena, dead);
      }
    }
  }
  if (arena.time >= arena.nextCrumbAt - 1e-9) { spawnCrumb(arena); arena.nextCrumbAt = round2(arena.nextCrumbAt + CRUMB.every); }
  checkWinner(arena);
  return arena;
}

// 이긴 쪽: 바퀴가 다 잡히면(또는 다 나가면) 인간, 부스러기 목표·시간 끝까지 생존·인간이 다 나가면 바퀴.
function checkWinner(arena) {
  if (arena.winner) return arena.winner;
  const roaches = arena.players.filter((p) => p.role === 'roach');
  const humans = arena.players.filter((p) => p.role === 'human' && !p.gone);
  let result = null;
  if (!roaches.some((p) => p.alive)) result = ['humans', roaches.every((p) => p.gone) ? 'noRoaches' : 'caught'];
  else if (!humans.length) result = ['roaches', 'noHumans'];
  else if (arena.score >= arena.goal) result = ['roaches', 'crumbs'];
  else if (arena.phase === 'play' && arena.time >= arena.endsAt - 1e-9) result = ['roaches', 'time'];
  if (result) { [arena.winner, arena.reason] = result; arena.phase = 'over'; }
  return arena.winner;
}

// 보는 사람에 따라 다른 화면 정보: 인간에게는 숨은 바퀴를 아예 넣지 않는다.
// 한 사람 = [번호, x, y, 각도, 표시] — 표시 비트: 1 숨음 · 2 느려짐 · 4 움직이는 중 · 8 무적 · 16 연결 끊김
function viewPlayers(arena, seeHidden) {
  const list = [];
  for (const p of arena.players) {
    if (!p.alive || (p.hidden && !seeHidden)) continue;
    const flags = (p.hidden ? 1 : 0) | (arena.time < p.slowUntil ? 2 : 0) | (p.move ? 4 : 0)
      | (arena.time < p.safeUntil ? 8 : 0) | (p.connected ? 0 : 16);
    list.push([p.n, round1(p.x), round1(p.y), round2(p.angle), flags]);
  }
  return list;
}
// 나만 아는 정보: 내 쿨타임·숨은 시간.
function selfView(arena, id) {
  const p = arena.byId.get(id); if (!p) return null;
  return { n: p.n, role: p.role, alive: p.alive, hidden: p.hidden,
    hideLeft: p.hidden ? round1(Math.max(0, HIDE_LIMIT - p.hideMeter)) : null,
    slipper: round2(Math.max(0, p.slipperAt + SLIPPER.cooldown - arena.time)),
    spray: round2(Math.max(0, p.sprayAt + SPRAY.cooldown - arena.time)),
    slow: round2(Math.max(0, p.slowUntil - arena.time)), eaten: p.eaten, catches: p.catches };
}
const crumbList = (arena) => arena.crumbs.map((c) => [c.id, c.x, c.y, c.v]);
function drainEvents(arena) { const list = arena.events; arena.events = []; return list; }
const timeLeft = (arena) => Math.max(0, round1(arena.phase === 'countdown' ? arena.countdownSec - arena.time : arena.endsAt - arena.time));
const mapData = () => ({ w: WORLD.w, h: WORLD.h, walls: WALLS, floors: FLOORS, furniture: FURNITURE });
const rules = () => ({ hideLimit: HIDE_LIMIT, slipper: SLIPPER, spray: SPRAY, roach: ROLE.roach, human: ROLE.human, crumbRadius: CRUMB.radius, eggEvery: EGG_EVERY });

module.exports = {
  WORLD, TICK_SECONDS, ROLE, SLIPPER, SPRAY, HIDE_LIMIT, HIDE_BLOCK, SAFE_SECONDS, CRUMB, EGG_EVERY, WALLS, FURNITURE, FLOORS,
  autoHumans, maxHumans, humanCountFor, crumbGoal, createArena, setInput, setConnected, removePlayer, act, step, checkWinner,
  viewPlayers, selfView, crumbList, drainEvents, timeLeft, mapData, rules, segmentHitsRect, normAngle
};
