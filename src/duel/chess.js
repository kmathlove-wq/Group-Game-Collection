// 체스 규칙. 서버(심판)와 브라우저(갈 수 있는 칸 표시)가 같은 파일을 쓴다.
// 판은 64칸 배열(0 = a8, 63 = h1). 대문자 = 백, 소문자 = 흑. K킹 Q퀸 R룩 B비숍 N나이트 P폰.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.DuelRules ||= {}).chess = api;
})(typeof self !== 'undefined' ? self : this, () => {
  const colors = ['white', 'black'];
  const colorNames = { white: '백', black: '흑' };
  const other = (color) => (color === 'white' ? 'black' : 'white');
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
  const PROMOTIONS = ['q', 'r', 'b', 'n'];
  const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

  const sq = (row, col) => row * 8 + col;
  const inside = (row, col) => row >= 0 && row < 8 && col >= 0 && col < 8;
  const colorOf = (piece) => (!piece ? null : piece === piece.toUpperCase() ? 'white' : 'black');
  const typeOf = (piece) => piece.toLowerCase();
  const name = (index) => 'abcdefgh'[index % 8] + (8 - Math.floor(index / 8));

  function boardFrom(placement) {
    const board = [];
    for (const ch of placement.replaceAll('/', '')) {
      if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i += 1) board.push('');
      else board.push(ch);
    }
    return board;
  }

  // byColor 쪽 말이 target 칸을 공격하고 있는지
  function attacked(board, target, byColor) {
    const row = Math.floor(target / 8); const col = target % 8;
    const own = (piece, type) => piece && colorOf(piece) === byColor && typeOf(piece) === type;
    const pawnRow = byColor === 'white' ? row + 1 : row - 1;
    for (const dc of [-1, 1]) if (inside(pawnRow, col + dc) && own(board[sq(pawnRow, col + dc)], 'p')) return true;
    for (const [dr, dc] of KNIGHT) if (inside(row + dr, col + dc) && own(board[sq(row + dr, col + dc)], 'n')) return true;
    for (const [dr, dc] of KING) if (inside(row + dr, col + dc) && own(board[sq(row + dr, col + dc)], 'k')) return true;
    const slide = (dirs, types) => dirs.some(([dr, dc]) => {
      for (let r = row + dr, c = col + dc; inside(r, c); r += dr, c += dc) {
        const piece = board[sq(r, c)];
        if (piece) return colorOf(piece) === byColor && types.includes(typeOf(piece));
      }
      return false;
    });
    return slide(ROOK, ['r', 'q']) || slide(BISHOP, ['b', 'q']);
  }
  const kingSquare = (board, color) => board.indexOf(color === 'white' ? 'K' : 'k');
  const inCheck = (board, color) => attacked(board, kingSquare(board, color), other(color));

  // 킹이 잡히는지는 아직 따지지 않은 움직임 목록
  function pseudoMoves(state, color) {
    const { board } = state; const moves = [];
    const add = (from, to, extra = {}) => moves.push({ from, to, ...extra });
    for (let from = 0; from < 64; from += 1) {
      const piece = board[from];
      if (!piece || colorOf(piece) !== color) continue;
      const row = Math.floor(from / 8); const col = from % 8; const type = typeOf(piece);
      if (type === 'p') {
        const dir = color === 'white' ? -1 : 1; const startRow = color === 'white' ? 6 : 1; const lastRow = color === 'white' ? 0 : 7;
        const pushPawn = (to) => {
          if (Math.floor(to / 8) === lastRow) for (const promo of PROMOTIONS) add(from, to, { promo });
          else add(from, to);
        };
        if (inside(row + dir, col) && !board[sq(row + dir, col)]) {
          pushPawn(sq(row + dir, col));
          if (row === startRow && !board[sq(row + 2 * dir, col)]) add(from, sq(row + 2 * dir, col), { double: true });
        }
        for (const dc of [-1, 1]) {
          if (!inside(row + dir, col + dc)) continue;
          const to = sq(row + dir, col + dc);
          if (board[to] && colorOf(board[to]) !== color) pushPawn(to);
          else if (to === state.ep) add(from, to, { enPassant: true });
        }
      } else if (type === 'n' || type === 'k') {
        for (const [dr, dc] of type === 'n' ? KNIGHT : KING) {
          if (!inside(row + dr, col + dc)) continue;
          const to = sq(row + dr, col + dc);
          if (!board[to] || colorOf(board[to]) !== color) add(from, to);
        }
      } else {
        const dirs = type === 'r' ? ROOK : type === 'b' ? BISHOP : [...ROOK, ...BISHOP];
        for (const [dr, dc] of dirs) {
          for (let r = row + dr, c = col + dc; inside(r, c); r += dr, c += dc) {
            const to = sq(r, c);
            if (board[to] && colorOf(board[to]) === color) break;
            add(from, to);
            if (board[to]) break;
          }
        }
      }
    }
    // 캐슬링: 킹·룩이 안 움직였고, 사이가 비었고, 킹이 지금·지나는 칸·도착 칸에서 공격받지 않아야 한다.
    const home = color === 'white' ? 7 : 0; const enemy = other(color);
    const kingFrom = sq(home, 4);
    if (board[kingFrom] === (color === 'white' ? 'K' : 'k') && !attacked(board, kingFrom, enemy)) {
      const rights = color === 'white' ? ['K', 'Q'] : ['k', 'q'];
      if (state.castling.includes(rights[0]) && !board[sq(home, 5)] && !board[sq(home, 6)]
        && !attacked(board, sq(home, 5), enemy) && !attacked(board, sq(home, 6), enemy)) add(kingFrom, sq(home, 6), { castle: 'king' });
      if (state.castling.includes(rights[1]) && !board[sq(home, 3)] && !board[sq(home, 2)] && !board[sq(home, 1)]
        && !attacked(board, sq(home, 3), enemy) && !attacked(board, sq(home, 2), enemy)) add(kingFrom, sq(home, 2), { castle: 'queen' });
    }
    return moves;
  }

  // 말을 옮긴 새 판(원래 판은 그대로)
  function movedBoard(board, move) {
    const next = [...board]; const piece = next[move.from];
    next[move.to] = move.promo ? (colorOf(piece) === 'white' ? move.promo.toUpperCase() : move.promo) : piece;
    next[move.from] = '';
    if (move.enPassant) next[move.from - (move.from % 8) + (move.to % 8)] = '';
    if (move.castle) {
      const home = Math.floor(move.from / 8);
      const [rookFrom, rookTo] = move.castle === 'king' ? [sq(home, 7), sq(home, 5)] : [sq(home, 0), sq(home, 3)];
      next[rookTo] = next[rookFrom]; next[rookFrom] = '';
    }
    return next;
  }

  function legalMoves(state, color) {
    return pseudoMoves(state, color).filter((move) => !inCheck(movedBoard(state.board, move), color));
  }

  // 남은 말로는 아무도 체크메이트를 할 수 없는지(킹끼리, 킹+비숍/나이트 하나, 같은 색 칸 비숍끼리)
  function insufficient(board) {
    const pieces = board.map((piece, index) => ({ piece, index })).filter(({ piece }) => piece && typeOf(piece) !== 'k');
    if (!pieces.length) return true;
    if (pieces.length === 1) return ['b', 'n'].includes(typeOf(pieces[0].piece));
    if (pieces.every(({ piece }) => typeOf(piece) === 'b')) {
      const shade = ({ index }) => (Math.floor(index / 8) + index % 8) % 2;
      return pieces.every((p) => shade(p) === shade(pieces[0]));
    }
    return false;
  }

  const positionKey = (state) => `${state.board.map((p) => p || '.').join('')} ${state.turn} ${state.castling} ${state.ep}`;

  function notation(state, move, legal) {
    if (move.castle) return move.castle === 'king' ? 'O-O' : 'O-O-O';
    const piece = state.board[move.from]; const type = typeOf(piece);
    const capture = Boolean(state.board[move.to]) || move.enPassant;
    if (type === 'p') return `${capture ? `${name(move.from)[0]}x` : ''}${name(move.to)}${move.promo ? `=${move.promo.toUpperCase()}` : ''}`;
    const rivals = legal.filter((m) => m.to === move.to && m.from !== move.from && state.board[m.from] === piece);
    let hint = '';
    if (rivals.length) hint = rivals.some((m) => m.from % 8 === move.from % 8) ? name(move.from) : name(move.from)[0];
    return `${type.toUpperCase()}${hint}${capture ? 'x' : ''}${name(move.to)}`;
  }

  function createGame() {
    const game = { board: boardFrom(START), turn: 'white', castling: 'KQkq', ep: -1, halfmove: 0, last: null,
      check: null, captured: { white: [], black: [] }, history: [], positions: {}, result: null };
    game.positions[positionKey(game)] = 1;
    return game;
  }

  function act(game, color, action) {
    if (game.result) return { ok: false, message: '이미 끝난 대결이에요.' };
    if (action?.type !== 'move') return { ok: false, message: '할 수 없는 동작이에요.' };
    if (game.turn !== color) return { ok: false, message: '내 차례가 아니에요.' };
    const from = Number(action.from); const to = Number(action.to);
    const promo = PROMOTIONS.includes(action.promo) ? action.promo : 'q';
    const legal = legalMoves(game, color);
    const move = legal.find((m) => m.from === from && m.to === to && (!m.promo || m.promo === promo));
    if (!move) return { ok: false, message: '그 칸으로는 갈 수 없어요.' };

    const san = notation(game, move, legal);
    const piece = game.board[from];
    const taken = move.enPassant ? (color === 'white' ? 'p' : 'P') : game.board[to];
    if (taken) game.captured[color].push(taken);
    game.board = movedBoard(game.board, move);
    // 킹이나 룩이 움직이거나 룩이 잡히면 그쪽 캐슬링 권리가 사라진다.
    const lose = { 60: 'KQ', 63: 'K', 56: 'Q', 4: 'kq', 7: 'k', 0: 'q' };
    for (const index of [from, to]) for (const right of lose[index] || '') game.castling = game.castling.replace(right, '');
    game.ep = move.double ? (from + to) / 2 : -1;
    game.halfmove = typeOf(piece) === 'p' || taken ? 0 : game.halfmove + 1;
    game.last = { from, to };
    game.turn = other(color);

    const enemy = game.turn;
    const replies = legalMoves(game, enemy);
    game.check = inCheck(game.board, enemy) ? enemy : null;
    const key = positionKey(game); game.positions[key] = (game.positions[key] || 0) + 1;
    game.history.push(san + (game.check ? (replies.length ? '+' : '#') : ''));

    if (!replies.length) {
      game.result = game.check
        ? { winner: color, reason: `체크메이트! ${colorNames[color]}이 이겼어요.` }
        : { winner: null, reason: '스테일메이트 — 둘 곳이 없지만 체크가 아니라서 비겼어요.' };
    } else if (insufficient(game.board)) game.result = { winner: null, reason: '남은 말로는 체크메이트를 할 수 없어서 비겼어요.' };
    else if (game.halfmove >= 100) game.result = { winner: null, reason: '50수 동안 폰 이동·잡기가 없어서 비겼어요.' };
    else if (game.positions[key] >= 3) game.result = { winner: null, reason: '같은 모양이 3번 나와서 비겼어요.' };
    return { ok: true, notice: game.check && !game.result ? '체크!' : '' };
  }

  const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const VALUE = { q: 9, r: 5, b: 3, n: 3, p: 1 };

  return {
    kind: 'chess', timeModes: ['none', 'fischer'], colors, colorNames, allowDraw: true, GLYPH, PROMOTIONS,
    normalizeSettings: () => ({}), describeSettings: () => '국제 체스 규칙 (캐슬링·앙파상·프로모션)',
    createGame, act, legalMoves, inCheck, colorOf, name,
    turnOf: (game) => (game.result ? null : game.turn),
    resultOf: (game) => game.result,
    moveCount: (game) => game.history.length,
    actions: () => [],
    seatInfo: (game, color) => {
      const list = [...game.captured[color]].sort((a, b) => VALUE[typeOf(b)] - VALUE[typeOf(a)]);
      return list.length ? `잡은 말 ${list.map((p) => GLYPH[typeOf(p)]).join('')}` : '잡은 말 없음';
    },
    statusText: (game) => (game.check ? `${colorNames[game.check]} 킹이 체크당했어요!` : ''),
    publicGame: (game) => ({ board: game.board, turn: game.turn, castling: game.castling, ep: game.ep, last: game.last,
      check: game.check, captured: game.captured, history: game.history.slice(-40), moveCount: game.history.length })
  };
});
