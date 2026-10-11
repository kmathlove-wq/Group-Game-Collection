// 오목 규칙. 서버(심판)와 브라우저(금수 ✕ 표시)가 같은 파일을 쓴다.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.DuelRules ||= {}).omok = api;
})(typeof self !== 'undefined' ? self : this, () => {
  const SIZE = 15;
  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  const STONE = { black: 1, white: 2 };
  const colors = ['black', 'white'];
  const colorNames = { black: '흑', white: '백' };
  const other = (color) => (color === 'black' ? 'white' : 'black');

  // 색마다: 3-3 금지, 4-4 금지, 4-3 금지, 장목(6개 이상) = win(이김) / none(둘 수는 있지만 승리 아님) / ban(금수)
  const limit = (d33, d44, d34, overline) => ({ d33, d44, d34, overline });
  const PRESETS = {
    renju: { name: '렌주룰', black: limit(true, true, false, 'ban'), white: limit(false, false, false, 'win') },
    korean: { name: '쌍삼 금지룰', black: limit(true, false, false, 'none'), white: limit(true, false, false, 'none') },
    standard: { name: '일반룰', black: limit(false, false, false, 'none'), white: limit(false, false, false, 'none') },
    free: { name: '자유룰', black: limit(false, false, false, 'win'), white: limit(false, false, false, 'win') }
  };
  const OVERLINES = ['win', 'none', 'ban'];

  function normalizeSettings(raw) {
    if (PRESETS[raw?.preset]) {
      const preset = PRESETS[raw.preset];
      return { preset: raw.preset, black: { ...preset.black }, white: { ...preset.white } };
    }
    if (raw?.preset !== 'custom') return normalizeSettings({ preset: 'renju' });
    const clean = (value) => limit(value?.d33 === true, value?.d44 === true, value?.d34 === true,
      OVERLINES.includes(value?.overline) ? value.overline : 'win');
    return { preset: 'custom', black: clean(raw.black), white: clean(raw.white) };
  }

  function describeLimit(value) {
    const bans = [value.d33 && '3-3', value.d44 && '4-4', value.d34 && '4-3', value.overline === 'ban' && '장목'].filter(Boolean);
    const parts = [];
    if (bans.length) parts.push(`${bans.join('·')} 금지`);
    if (value.overline === 'none') parts.push('6개 이상은 승리 아님');
    return parts.join(', ') || '제한 없음';
  }
  function describeSettings(rule) {
    const name = PRESETS[rule.preset]?.name || '직접 정한 규칙';
    const black = describeLimit(rule.black); const white = describeLimit(rule.white);
    return black === white ? `${name} (흑·백 모두 ${black})` : `${name} (흑: ${black} / 백: ${white})`;
  }

  // ── 판 계산 ──
  const inside = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
  const at = (board, x, y) => (inside(x, y) ? board[y * SIZE + x] : -1);

  // (x,y)를 지나 한 방향으로 같은 색이 몇 개 이어지는지. from/to는 (x,y)에서 몇 칸 떨어진 끝인지.
  function run(board, x, y, dx, dy, stone) {
    let back = 0; while (at(board, x - (back + 1) * dx, y - (back + 1) * dy) === stone) back += 1;
    let front = 0; while (at(board, x + (front + 1) * dx, y + (front + 1) * dy) === stone) front += 1;
    return { from: -back, to: front, length: back + front + 1 };
  }
  const isFive = (length, rule) => length === 5 || (length > 5 && rule.overline === 'win');

  // 이미 (x,y)에 돌이 있을 때, 이 방향으로 한 수만 더 두면 (x,y)를 포함한 오목이 되는 빈자리들
  function fourSpots(board, x, y, dx, dy, stone, rule) {
    const spots = [];
    for (let k = -4; k <= 4; k += 1) {
      const px = x + k * dx; const py = y + k * dy;
      if (k === 0 || at(board, px, py) !== 0) continue;
      board[py * SIZE + px] = stone;
      const line = run(board, px, py, dx, dy, stone);
      if (isFive(line.length, rule) && k + line.from <= 0 && k + line.to >= 0) spots.push(k);
      board[py * SIZE + px] = 0;
    }
    return spots;
  }
  // 빈자리가 양 끝(_XXXX_)이면 열린 4 하나, 그 밖에 두 곳이면 한 줄 안의 4-4다.
  const isOpenFour = (spots) => spots.length === 2 && Math.abs(spots[1] - spots[0]) === 5;
  const fourCount = (spots) => (isOpenFour(spots) ? 1 : Math.min(spots.length, 2));

  // '3' = 한 수 더 두면 열린 4가 되는 줄. 그 한 수가 금수 자리라면 진짜 3이 아니다(가짜 3).
  function isThree(board, x, y, dx, dy, stone, rule, ruleSet, color, depth) {
    for (let k = -4; k <= 4; k += 1) {
      const px = x + k * dx; const py = y + k * dy;
      if (k === 0 || at(board, px, py) !== 0) continue;
      const index = py * SIZE + px;
      board[index] = stone;
      const open = isOpenFour(fourSpots(board, x, y, dx, dy, stone, rule));
      board[index] = 0;
      if (open && (depth <= 0 || !forbidden(board, index, color, ruleSet, depth - 1))) return true;
    }
    return false;
  }

  // 그 자리가 금수면 이유('3-3' 등), 아니면 null. 오목이 완성되는 수는 금수보다 승리가 먼저다.
  function forbidden(board, index, color, ruleSet, depth = 2) {
    const rule = ruleSet[color];
    if (!rule.d33 && !rule.d44 && !rule.d34 && rule.overline !== 'ban') return null;
    if (board[index] !== 0) return null;
    const stone = STONE[color]; const x = index % SIZE; const y = Math.floor(index / SIZE);
    board[index] = stone;
    try {
      const lines = DIRS.map(([dx, dy]) => run(board, x, y, dx, dy, stone));
      if (lines.some((line) => isFive(line.length, rule))) return null;
      if (rule.overline === 'ban' && lines.some((line) => line.length > 5)) return '장목';
      let fours = 0; let threes = 0;
      for (const [dx, dy] of DIRS) {
        const spots = fourSpots(board, x, y, dx, dy, stone, rule);
        if (spots.length) fours += fourCount(spots);
        else if ((rule.d33 || rule.d34) && isThree(board, x, y, dx, dy, stone, rule, ruleSet, color, depth)) threes += 1;
      }
      if (rule.d44 && fours >= 2) return '4-4';
      if (rule.d33 && threes >= 2) return '3-3';
      if (rule.d34 && fours >= 1 && threes >= 1) return '4-3';
      return null;
    } finally {
      board[index] = 0;
    }
  }

  // 화면에 ✕로 보여 줄 금수 자리들. 근처에 내 돌이 2개도 없으면 금수가 될 수 없으니 건너뛴다.
  function forbiddenSpots(game, color) {
    const board = [...game.board]; const stone = STONE[color]; const spots = [];
    for (let index = 0; index < board.length; index += 1) {
      if (board[index]) continue;
      const x = index % SIZE; const y = Math.floor(index / SIZE);
      let near = 0;
      for (const [dx, dy] of DIRS) for (let k = -4; k <= 4; k += 1) if (k && at(board, x + k * dx, y + k * dy) === stone) near += 1;
      if (near < 2) continue;
      const reason = forbidden(board, index, color, game.rule);
      if (reason) spots.push({ index, reason });
    }
    return spots;
  }

  function createGame(rule) {
    return { size: SIZE, board: Array(SIZE * SIZE).fill(0), turn: 'black', rule, last: -1, moves: [], winLine: [], result: null };
  }

  function act(game, color, action) {
    if (game.result) return { ok: false, message: '이미 끝난 대결이에요.' };
    if (action?.type !== 'move') return { ok: false, message: '할 수 없는 동작이에요.' };
    if (game.turn !== color) return { ok: false, message: '내 차례가 아니에요.' };
    const x = Number(action.x); const y = Number(action.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || !inside(x, y)) return { ok: false, message: '판 밖이에요.' };
    const index = y * SIZE + x;
    if (game.board[index]) return { ok: false, message: '이미 돌이 있는 자리예요.' };
    const reason = forbidden(game.board, index, color, game.rule);
    if (reason) return { ok: false, message: `${reason} 금수 자리라서 둘 수 없어요.` };

    game.board[index] = STONE[color]; game.last = index; game.moves.push(index);
    for (const [dx, dy] of DIRS) {
      const line = run(game.board, x, y, dx, dy, STONE[color]);
      if (!isFive(line.length, game.rule[color])) continue;
      for (let k = line.from; k <= line.to; k += 1) game.winLine.push((y + k * dy) * SIZE + x + k * dx);
      game.result = { winner: color, reason: `${colorNames[color]}이 오목을 완성했어요!` };
    }
    if (!game.result && game.moves.length === SIZE * SIZE) game.result = { winner: null, reason: '판이 가득 차서 비겼어요.' };
    if (!game.result) game.turn = other(color);
    return { ok: true };
  }

  return {
    kind: 'omok', timeModes: ['none', 'move'], SIZE, colors, colorNames, PRESETS, allowDraw: true,
    normalizeSettings, describeSettings, createGame, act, forbidden, forbiddenSpots,
    turnOf: (game) => (game.result ? null : game.turn),
    resultOf: (game) => game.result,
    moveCount: (game) => game.moves.length,
    actions: () => [],
    seatInfo: () => '',
    statusText: () => '',
    publicGame: (game) => ({ size: SIZE, board: game.board, turn: game.turn, rule: game.rule, last: game.last,
      moveCount: game.moves.length, winLine: game.winLine })
  };
});
