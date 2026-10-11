// 바둑 규칙. 서버(심판)와 브라우저(집 미리보기)가 같은 파일을 쓴다.
// 진행: 번갈아 두기 → 둘 다 연달아 '한 수 쉬기' → 계가(죽은 돌 표시 후 둘 다 확인) → 집+따낸 돌로 승부(백 덤 6.5).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.DuelRules ||= {}).baduk = api;
})(typeof self !== 'undefined' ? self : this, () => {
  const SIZES = [19, 13, 9];
  const KOMI = 6.5;
  const STONE = { black: 1, white: 2 };
  const colors = ['black', 'white'];
  const colorNames = { black: '흑', white: '백' };
  const other = (color) => (color === 'black' ? 'white' : 'black');

  function normalizeSettings(raw) {
    const size = Number(raw?.size);
    return { size: SIZES.includes(size) ? size : 19 };
  }
  const describeSettings = (rule) => `${rule.size}줄 바둑판 · 백 덤 ${KOMI}집`;

  function neighbors(index, size) {
    const x = index % size; const y = Math.floor(index / size); const list = [];
    if (x > 0) list.push(index - 1);
    if (x < size - 1) list.push(index + 1);
    if (y > 0) list.push(index - size);
    if (y < size - 1) list.push(index + size);
    return list;
  }

  // 이어진 같은 색 돌 무리와 그 무리의 숨구멍(바로 옆 빈칸)
  function groupAt(board, index, size) {
    const stone = board[index]; const stones = [index]; const seen = new Set(stones); const liberties = new Set();
    for (let i = 0; i < stones.length; i += 1) {
      for (const next of neighbors(stones[i], size)) {
        if (board[next] === 0) liberties.add(next);
        else if (board[next] === stone && !seen.has(next)) { seen.add(next); stones.push(next); }
      }
    }
    return { stones, liberties };
  }

  function createGame(rule) {
    const { size } = rule;
    return { size, board: Array(size * size).fill(0), turn: 'black', phase: 'play', captures: { black: 0, white: 0 },
      ko: -1, passes: 0, resumeTurn: null, dead: [], agree: { black: false, white: false }, last: -1, lastPass: null,
      moveCount: 0, result: null, score: null };
  }

  // 죽은 돌을 들어낸 판에서 집을 센다. 한 색 돌로만 둘러싸인 빈칸 = 그 색의 집.
  function countScore(game) {
    const { size } = game; const dead = new Set(game.dead);
    const board = game.board.map((stone, index) => (dead.has(index) ? 0 : stone));
    const owner = Array(board.length).fill(0); const seen = new Set();
    const territory = { black: 0, white: 0 };
    for (let start = 0; start < board.length; start += 1) {
      if (board[start] !== 0 || seen.has(start)) continue;
      const region = [start]; const borders = new Set(); seen.add(start);
      for (let i = 0; i < region.length; i += 1) {
        for (const next of neighbors(region[i], size)) {
          if (board[next] !== 0) borders.add(board[next]);
          else if (!seen.has(next)) { seen.add(next); region.push(next); }
        }
      }
      if (borders.size !== 1) continue;
      const stone = [...borders][0];
      for (const index of region) owner[index] = stone;
      territory[stone === 1 ? 'black' : 'white'] += region.length;
    }
    const deadOf = (stone) => game.dead.filter((index) => game.board[index] === stone).length;
    const prisoners = { black: game.captures.black + deadOf(2), white: game.captures.white + deadOf(1) };
    const total = { black: territory.black + prisoners.black, white: territory.white + prisoners.white + KOMI };
    return { owner, territory, prisoners, total, komi: KOMI };
  }

  function finishByScore(game) {
    const score = countScore(game); game.score = score;
    const { black, white } = score.total;
    const winner = black > white ? 'black' : 'white';
    game.result = { winner, reason: `흑 ${black}집 : 백 ${white}집 — ${colorNames[winner]} ${Math.abs(black - white)}집 승` };
  }

  function play(game, color, action) {
    if (game.phase !== 'play') return { ok: false, message: '지금은 계가 중이에요.' };
    if (game.turn !== color) return { ok: false, message: '내 차례가 아니에요.' };
    const { size, board } = game;
    const x = Number(action.x); const y = Number(action.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= size || y >= size) return { ok: false, message: '판 밖이에요.' };
    const index = y * size + x;
    if (board[index]) return { ok: false, message: '이미 돌이 있는 자리예요.' };
    if (index === game.ko) return { ok: false, message: '패예요! 바로 다시 따낼 수 없어요. 다른 곳에 한 수 두고 오세요.' };

    const mine = STONE[color]; const theirs = STONE[other(color)];
    board[index] = mine;
    const captured = [];
    for (const next of neighbors(index, size)) {
      if (board[next] !== theirs) continue;
      const group = groupAt(board, next, size);
      if (group.liberties.size) continue;
      for (const stone of group.stones) { board[stone] = 0; captured.push(stone); }
    }
    const own = groupAt(board, index, size);
    if (!own.liberties.size) { board[index] = 0; return { ok: false, message: '숨구멍이 없는 자리(자충수)라 둘 수 없어요.' }; }
    // 돌 하나를 따내고 내 돌도 하나뿐이며 숨구멍이 그 자리 하나면, 상대는 곧바로 되따낼 수 없다(패).
    game.ko = captured.length === 1 && own.stones.length === 1 && own.liberties.size === 1 ? captured[0] : -1;
    game.captures[color] += captured.length;
    game.last = index; game.lastPass = null; game.passes = 0; game.moveCount += 1;
    game.turn = other(color);
    return { ok: true, captured: captured.length };
  }

  function act(game, color, action) {
    if (game.result) return { ok: false, message: '이미 끝난 대결이에요.' };
    switch (action?.type) {
      case 'move': return play(game, color, action);
      case 'pass': {
        if (game.phase !== 'play') return { ok: false, message: '지금은 계가 중이에요.' };
        if (game.turn !== color) return { ok: false, message: '내 차례가 아니에요.' };
        game.passes += 1; game.ko = -1; game.last = -1; game.lastPass = color; game.moveCount += 1;
        if (game.passes >= 2) {
          game.phase = 'scoring'; game.resumeTurn = other(color); game.turn = null;
          game.dead = []; game.agree = { black: false, white: false };
          return { ok: true, notice: '둘 다 한 수 쉬어서 계가를 시작해요. 죽은 돌을 눌러 표시한 뒤 둘 다 "계가 확인"을 누르세요.' };
        }
        game.turn = other(color);
        return { ok: true, notice: `${colorNames[color]}이 한 수 쉬었어요.` };
      }
      case 'toggleDead': {
        if (game.phase !== 'scoring') return { ok: false, message: '계가 때만 죽은 돌을 표시할 수 있어요.' };
        const x = Number(action.x); const y = Number(action.y); const index = y * game.size + x;
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= game.size || y >= game.size || !game.board[index]) {
          return { ok: false, message: '돌을 눌러 주세요.' };
        }
        const { stones } = groupAt(game.board, index, game.size);
        const dead = new Set(game.dead); const makeDead = !dead.has(index);
        for (const stone of stones) if (makeDead) dead.add(stone); else dead.delete(stone);
        game.dead = [...dead]; game.agree = { black: false, white: false };
        return { ok: true };
      }
      case 'agree': {
        if (game.phase !== 'scoring') return { ok: false, message: '계가 중이 아니에요.' };
        game.agree[color] = true;
        if (game.agree.black && game.agree.white) finishByScore(game);
        return { ok: true, notice: game.result ? '' : `${colorNames[color]}이 계가 결과를 확인했어요.` };
      }
      case 'resume': {
        if (game.phase !== 'scoring') return { ok: false, message: '계가 중이 아니에요.' };
        Object.assign(game, { phase: 'play', turn: game.resumeTurn, passes: 0, dead: [], agree: { black: false, white: false } });
        return { ok: true, notice: `${colorNames[color]}이 계속 두기를 원해서 대국을 이어 가요.` };
      }
      default: return { ok: false, message: '할 수 없는 동작이에요.' };
    }
  }

  function actions(game, color) {
    if (game.result || !color) return [];
    if (game.phase === 'play') return game.turn === color ? [{ type: 'pass', label: '한 수 쉬기' }] : [];
    return [
      { type: 'agree', label: game.agree[color] ? '확인 완료 ✓' : '계가 확인', primary: true, disabled: game.agree[color] },
      { type: 'resume', label: '계속 두기' }
    ];
  }

  function statusText(game) {
    if (game.phase !== 'scoring' || game.result) return '';
    const { total } = countScore(game);
    return `계가 중 · 흑 ${total.black}집 : 백 ${total.white}집 (죽은 돌을 눌러 표시해요)`;
  }

  return {
    kind: 'baduk', timeModes: ['none', 'byoyomi'], SIZES, KOMI, colors, colorNames, allowDraw: false,
    normalizeSettings, describeSettings, createGame, act, actions, statusText, countScore, groupAt,
    turnOf: (game) => (game.result || game.phase !== 'play' ? null : game.turn),
    resultOf: (game) => game.result,
    moveCount: (game) => game.moveCount,
    seatInfo: (game, color) => `따낸 돌 ${game.captures[color]}개`,
    publicGame: (game) => ({ size: game.size, board: game.board, turn: game.turn, phase: game.phase, captures: game.captures,
      ko: game.ko, last: game.last, lastPass: game.lastPass, dead: game.dead, agree: game.agree, moveCount: game.moveCount,
      score: game.result ? game.score : game.phase === 'scoring' ? countScore(game) : null })
  };
});
