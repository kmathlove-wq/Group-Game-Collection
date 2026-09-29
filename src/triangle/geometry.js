// 삼각형 땅따먹기 도형 계산. 서버(심판)와 브라우저(미리보기)가 같은 파일을 쓴다.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TriangleGeometry = api;
})(typeof self !== 'undefined' ? self : this, () => {
  const BOARD_WIDTH = 1000;
  const BOARD_HEIGHT = 700;
  const BOARD_MARGIN = 55;
  // 점이 다른 두 점 사이 선분에 너무 붙으면 납작한 삼각형이 생겨 헷갈리므로 이 거리 안은 금지한다.
  const COLLINEAR_GAP = 14;

  function pointCountFor(playerCount) {
    return playerCount * 7 + 4;
  }

  function edgeKey(a, b) {
    return a < b ? `${a}-${b}` : `${b}-${a}`;
  }

  function cross(o, a, b) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  }

  function distanceToSegment(p, a, b) {
    const dx = b.x - a.x; const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  // 두 선분이 끝점이 아닌 곳에서 X자로 엇갈리는지 검사한다(끝점을 공유하면 엇갈림이 아님).
  function segmentsCross(p1, p2, p3, p4) {
    const d1 = cross(p3, p4, p1); const d2 = cross(p3, p4, p2);
    const d3 = cross(p1, p2, p3); const d4 = cross(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }

  function pointInTriangle(p, a, b, c) {
    const d1 = cross(a, b, p); const d2 = cross(b, c, p); const d3 = cross(c, a, p);
    const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
    return !(hasNeg && hasPos);
  }

  // 가까운 이웃 점들 사이에서 세 점이 거의 일직선(한 점이 두 점 사이 선분 바로 옆)이면 true.
  // 판 전체를 검사하면 점이 20개만 넘어도 선분이 판을 뒤덮어 배치가 불가능하므로 이웃만 본다.
  function nearSomeSegment(candidate, points, reach) {
    const near = points.filter((p) => Math.hypot(p.x - candidate.x, p.y - candidate.y) < reach);
    for (let i = 0; i < near.length; i += 1) {
      for (let j = i + 1; j < near.length; j += 1) {
        if (distanceToSegment(candidate, near[i], near[j]) < COLLINEAR_GAP
          || distanceToSegment(near[i], candidate, near[j]) < COLLINEAR_GAP
          || distanceToSegment(near[j], candidate, near[i]) < COLLINEAR_GAP) return true;
      }
    }
    return false;
  }

  // 판을 바둑판처럼 칸으로 나누고, 무작위로 고른 칸마다 점 하나를 살짝 흔들어 놓는다.
  // 점이 고르게 퍼지고 서로 너무 붙지 않는다.
  function generatePoints(count, random = Math.random) {
    const innerW = BOARD_WIDTH - BOARD_MARGIN * 2; const innerH = BOARD_HEIGHT - BOARD_MARGIN * 2;
    const cols = Math.ceil(Math.sqrt(count * innerW / innerH)); const rows = Math.ceil(count / cols);
    const cellW = innerW / cols; const cellH = innerH / rows;
    const reach = Math.hypot(cellW, cellH) * 1.4;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const strict = attempt < 29; // 마지막 시도는 검사 없이 배치해 게임 시작이 절대 멈추지 않게 한다
      const cells = Array.from({ length: cols * rows }, (_, i) => i);
      for (let i = cells.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [cells[i], cells[j]] = [cells[j], cells[i]]; }
      const points = [];
      for (const cell of cells.slice(0, count)) {
        const cx = BOARD_MARGIN + (cell % cols + 0.5) * cellW; const cy = BOARD_MARGIN + (Math.floor(cell / cols) + 0.5) * cellH;
        for (let tries = 0; tries < 40; tries += 1) {
          const candidate = { x: Math.round(cx + (random() - 0.5) * cellW * 0.6), y: Math.round(cy + (random() - 0.5) * cellH * 0.6) };
          if (!strict || !nearSomeSegment(candidate, points, reach)) { points.push(candidate); break; }
        }
      }
      if (points.length === count) return points;
    }
  }

  // 선이 이 거리보다 점에 가까이 지나가면 화면에서 점을 관통해 보이므로 긋지 못한다.
  const POINT_CLEARANCE = 11;

  // 점 a와 b를 이어도 되는지 확인하고, 안 되면 이유를 돌려준다.
  function checkEdge(points, edges, a, b) {
    if (!Number.isInteger(a) || !Number.isInteger(b) || a === b || !points[a] || !points[b]) {
      return { ok: false, message: '서로 다른 두 점을 골라 주세요.' };
    }
    if (edges.some((e) => edgeKey(e.a, e.b) === edgeKey(a, b))) {
      return { ok: false, message: '이미 그어진 선이에요.' };
    }
    const pa = points[a]; const pb = points[b];
    for (let i = 0; i < points.length; i += 1) {
      if (i !== a && i !== b && distanceToSegment(points[i], pa, pb) < POINT_CLEARANCE) {
        return { ok: false, message: '선이 다른 점 위를 지나갈 수 없어요.' };
      }
    }
    for (const e of edges) {
      if (e.a === a || e.a === b || e.b === a || e.b === b) continue;
      if (segmentsCross(pa, pb, points[e.a], points[e.b])) {
        return { ok: false, message: '다른 선과 엇갈릴 수 없어요.' };
      }
    }
    return { ok: true };
  }

  // 새 선 a-b를 그었을 때 완성되는 "안에 점이 없는" 삼각형들을 찾는다.
  function newTriangles(points, edges, a, b) {
    const keys = new Set(edges.map((e) => edgeKey(e.a, e.b)));
    const found = [];
    for (let c = 0; c < points.length; c += 1) {
      if (c === a || c === b || !keys.has(edgeKey(a, c)) || !keys.has(edgeKey(b, c))) continue;
      const empty = points.every((p, i) => i === a || i === b || i === c
        || !pointInTriangle(p, points[a], points[b], points[c]));
      if (empty) found.push([a, b, c].sort((x, y) => x - y));
    }
    return found;
  }

  function hasAnyMove(points, edges) {
    for (let a = 0; a < points.length; a += 1) {
      for (let b = a + 1; b < points.length; b += 1) {
        if (checkEdge(points, edges, a, b).ok) return true;
      }
    }
    return false;
  }

  return {
    BOARD_WIDTH, BOARD_HEIGHT, pointCountFor, edgeKey, segmentsCross, pointInTriangle,
    generatePoints, checkEdge, newTriangles, hasAnyMove
  };
});
