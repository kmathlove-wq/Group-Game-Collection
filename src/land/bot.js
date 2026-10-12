// 컴퓨터 플레이어: 땅 가운데의 반대쪽(바깥)으로 나가 옆으로 꺾고, 가장 가까운 내 땅으로 둥글게 돌아온다.
// (옆으로 비켜 선 뒤 가까운 땅으로 오는 길은 나간 길과 나란해서 내 꼬리를 밟지 않는다.)
// 적 머리가 가깝거나, 판 끝에 가깝거나, 너무 오래 나가 있으면 바로 집으로 간다.

const DANGER = 22;     // 적 머리가 이 거리 안이면 위험
const WALL = 8;        // 판 끝에서 이 거리 안이면 돌아가기
const MAX_OUT = 45;    // 땅 밖에서 이 틱보다 오래 있지 않기
const LOOK_AHEAD = 6;  // 몇 틱 앞까지 내다볼지

function centerOf(arena, p) {
  let sx = 0; let sy = 0; let n = 0;
  const { size, owner } = arena;
  // 머리 둘레 사각형 안에서만 세면 충분하다(봇 땅은 크지 않다).
  const r = 60;
  for (let y = Math.max(0, Math.floor(p.y) - r); y < Math.min(size, Math.floor(p.y) + r); y += 1) {
    for (let x = Math.max(0, Math.floor(p.x) - r); x < Math.min(size, Math.floor(p.x) + r); x += 1) {
      if (owner[y * size + x] === p.id) { sx += x + 0.5; sy += y + 0.5; n += 1; }
    }
  }
  if (!n) return { x: p.x, y: p.y };
  // 땅이 초승달처럼 휘면 무게중심이 빈 곳일 수 있어, 무게중심에서 가장 가까운 내 땅 칸을 목표로 한다.
  const cx = sx / n; const cy = sy / n;
  let best = null; let bestD = Infinity;
  for (let y = Math.max(0, Math.floor(p.y) - r); y < Math.min(size, Math.floor(p.y) + r); y += 1) {
    for (let x = Math.max(0, Math.floor(p.x) - r); x < Math.min(size, Math.floor(p.x) + r); x += 1) {
      if (owner[y * size + x] !== p.id) continue;
      const d = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
      if (d < bestD) { bestD = d; best = { x: x + 0.5, y: y + 0.5 }; }
    }
  }
  return best;
}

// 지금 위치에서 가장 가까운 내 땅 칸(가까운 고리부터 넓혀 가며 찾는다).
function nearestHome(arena, p) {
  const { size, owner } = arena;
  const px = Math.floor(p.x); const py = Math.floor(p.y);
  for (let r = 1; r <= 80; r += 1) {
    let best = null; let bestD = Infinity;
    for (let y = py - r; y <= py + r; y += 1) {
      if (y < 0 || y >= size) continue;
      const edge = y === py - r || y === py + r;
      for (let x = px - r; x <= px + r; x += edge ? 1 : r * 2) {
        if (x < 0 || x >= size || owner[y * size + x] !== p.id) continue;
        const d = (x + 0.5 - p.x) ** 2 + (y + 0.5 - p.y) ** 2;
        if (d < bestD) { bestD = d; best = { x: x + 0.5, y: y + 0.5 }; }
      }
    }
    if (best) return best;
  }
  return null;
}

function botTarget(arena, p, random = Math.random) {
  const s = p.botState ||= { plan: null, out: 0, home: null };
  const atHome = arena.owner[arena.cellOf(p.x, p.y)] === p.id;

  if (!p.outside) {
    s.out = 0; s.back = null;
    if (!s.plan || s.plan.done) {
      s.home = centerOf(arena, p);
      const away = Math.atan2(p.y - s.home.y, p.x - s.home.x);
      let angle = Number.isFinite(away) && (p.x !== s.home.x || p.y !== s.home.y) ? away + (random() - 0.5) * 1.2 : random() * Math.PI * 2;
      // 나갈 방향 30칸 앞이 판 끝 근처면 판 가운데 쪽으로 튼다(벽에 붙어 미끄러지다 내 꼬리를 밟지 않게).
      const ahead = 30; const edge = WALL + 4;
      const fx = p.x + Math.cos(angle) * ahead; const fy = p.y + Math.sin(angle) * ahead;
      if (fx < edge || fy < edge || fx > arena.size - edge || fy > arena.size - edge) {
        angle = Math.atan2(arena.size / 2 - p.y, arena.size / 2 - p.x) + (random() - 0.5) * 1.2;
      }
      s.plan = { angle, n1: 4 + Math.floor(random() * 10), side: random() < 0.5 ? 1 : -1, n2: 5 + Math.floor(random() * 6), back: false, done: false };
    }
    // 땅 안에서는 계획한 방향으로 걸어 나간다.
    if (atHome) return s.plan.angle;
  }

  s.out += 1;
  const plan = s.plan || { angle: p.angle, n1: 0, n2: 0, side: 1 };
  // 돌아갈 곳은 5틱마다 다시 찾는다(땅이 빼앗겨 바뀔 수 있다).
  if (!s.back || s.out % 5 === 0) s.back = nearestHome(arena, p) || s.home || { x: p.x, y: p.y };
  const home = s.back;
  const enemyNear = [...arena.players.values()].some((q) => q.alive && q !== p && (q.x - p.x) ** 2 + (q.y - p.y) ** 2 < DANGER * DANGER);
  const nearWall = p.x < WALL || p.y < WALL || p.x > arena.size - WALL || p.y > arena.size - WALL;
  if (enemyNear || nearWall || s.out > MAX_OUT) plan.back = true;

  let target;
  if (!plan.back && s.out <= plan.n1) target = plan.angle;
  else if (!plan.back && s.out <= plan.n1 + plan.n2) target = plan.angle + plan.side * Math.PI / 2;
  else { plan.back = true; target = Math.atan2(home.y - p.y, home.x - p.x); }
  plan.done = true; // 집에 돌아오면 새 계획
  return safeAngle(arena, p, target);
}

// 그 방향으로 몇 틱 꺾어 가 보며(서버와 같은 회전 규칙) 내 옛 꼬리나 판 끝에 닿는지 미리 본다.
function hitsOwnTrail(arena, p, target) {
  const { size, owner, core, coreAt, speed, turnRate, selfGap } = arena;
  let { x, y, angle } = p; let walked = p.walked;
  for (let i = 0; i < LOOK_AHEAD; i += 1) {
    let d = (target - angle) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
    angle += Math.max(-turnRate, Math.min(turnRate, d));
    // 서버처럼 반 칸마다 촘촘히 본다(한 틱에 2칸 넘게 가므로 끝점만 보면 놓친다).
    const steps = Math.ceil(speed / 0.5);
    for (let k = 0; k < steps; k += 1) {
      x += Math.cos(angle) * speed / steps; y += Math.sin(angle) * speed / steps; walked += speed / steps;
      if (x < 1 || y < 1 || x > size - 1 || y > size - 1) return true;
      const c = Math.floor(y) * size + Math.floor(x);
      if (owner[c] === p.id) return false; // 집에 닿으면 안전
      if (core[c] === p.id && walked - coreAt[c] > selfGap - 1.5) return true; // 조금 넉넉히 피한다
    }
  }
  return false;
}

// 원하는 방향이 위험하면 조금씩 옆 방향을 찾아본다(못 찾으면 원래 방향).
function safeAngle(arena, p, target) {
  for (const turn of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.6, -1.6, 2.2, -2.2, 2.8, -2.8]) {
    if (!hitsOwnTrail(arena, p, target + turn)) return target + turn;
  }
  return target;
}

module.exports = { botTarget };
