// 체스판(칸 64개 버튼). 내 말을 누르면 갈 수 있는 칸이 보이고, 그 칸을 누르면 옮긴다.
// 흑을 잡으면 판을 뒤집어 내 말이 항상 아래에 오게 한다.
window.DuelBoard = (() => {
  function create(root, { rules, onAct }) {
    const grid = document.createElement('div'); grid.className = 'duel-chess-grid';
    const promo = document.createElement('div'); promo.className = 'duel-promo hidden';
    const history = document.createElement('ol'); history.className = 'duel-chess-history';
    const squares = [];
    for (let i = 0; i < 64; i += 1) {
      const square = document.createElement('button'); square.type = 'button';
      square.className = `duel-square ${(Math.floor(i / 8) + i % 8) % 2 ? 'dark' : 'light'}`;
      square.setAttribute('aria-label', rules.name(i));
      square.onclick = () => clicked(i);
      squares.push(square);
    }
    root.append(grid, promo, history);
    let match = null; let view = {}; let selected = -1; let legal = []; let flipped = null;

    const game = () => match?.game;
    const canMove = () => view.canPlay && match.clockColor === view.myColor;
    const glyph = (piece) => `${rules.GLYPH[piece.toLowerCase()]}︎`;

    function layout() {
      const flip = view.myColor === 'black';
      if (flip === flipped) return;
      flipped = flip;
      const order = [...squares.keys()]; if (flip) order.reverse();
      grid.replaceChildren(...order.map((i) => squares[i]));
      // 가장자리 칸에 가로(a~h)·세로(1~8) 좌표를 적는다.
      order.forEach((i, slot) => {
        squares[i].dataset.file = slot >= 56 ? rules.name(i)[0] : '';
        squares[i].dataset.rank = slot % 8 === 0 ? rules.name(i)[1] : '';
      });
    }

    function draw() {
      const g = game(); if (!g) return;
      layout();
      const targets = new Map(legal.filter((m) => m.from === selected).map((m) => [m.to, m]));
      const kingInCheck = g.check ? g.board.indexOf(g.check === 'white' ? 'K' : 'k') : -1;
      squares.forEach((square, i) => {
        const piece = g.board[i];
        square.textContent = piece ? glyph(piece) : '';
        square.classList.toggle('white-piece', Boolean(piece) && rules.colorOf(piece) === 'white');
        square.classList.toggle('black-piece', Boolean(piece) && rules.colorOf(piece) === 'black');
        square.classList.toggle('last', Boolean(g.last) && (g.last.from === i || g.last.to === i));
        square.classList.toggle('selected', i === selected);
        square.classList.toggle('target', targets.has(i) && !piece && !targets.get(i).enPassant);
        square.classList.toggle('capture', targets.has(i) && (Boolean(piece) || Boolean(targets.get(i).enPassant)));
        square.classList.toggle('check', i === kingInCheck);
        square.classList.toggle('movable', canMove() && legal.some((m) => m.from === i));
      });
      history.replaceChildren();
      const moves = g.history; const offset = g.moveCount - moves.length;
      for (let i = 0; i < moves.length; i += 1) {
        const number = offset + i;
        if (number % 2 === 0) { const li = document.createElement('li'); li.value = number / 2 + 1; li.textContent = moves[i]; history.append(li); }
        else if (history.lastChild) history.lastChild.textContent += `  ${moves[i]}`;
        else { const li = document.createElement('li'); li.value = Math.floor(number / 2) + 1; li.textContent = `…  ${moves[i]}`; history.append(li); }
      }
      history.scrollTop = history.scrollHeight;
    }

    function choosePromotion(from, to) {
      promo.replaceChildren();
      const title = document.createElement('b'); title.textContent = '폰이 무엇으로 바뀔까요?';
      promo.append(title);
      for (const [type, label] of [['q', '퀸'], ['r', '룩'], ['b', '비숍'], ['n', '나이트']]) {
        const choice = document.createElement('button'); choice.type = 'button'; choice.className = 'secondary';
        choice.textContent = `${rules.GLYPH[type]}︎ ${label}`;
        choice.onclick = () => { promo.classList.add('hidden'); send(from, to, type); };
        promo.append(choice);
      }
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'danger'; cancel.textContent = '취소';
      cancel.onclick = () => promo.classList.add('hidden');
      promo.append(cancel); promo.classList.remove('hidden');
    }
    function send(from, to, promoType) {
      selected = -1; draw();
      onAct({ type: 'move', from, to, promo: promoType });
    }

    function clicked(i) {
      if (!canMove()) return;
      const move = legal.find((m) => m.from === selected && m.to === i);
      if (move) { if (move.promo) choosePromotion(selected, i); else send(selected, i); return; }
      selected = legal.some((m) => m.from === i) && i !== selected ? i : -1;
      draw();
    }

    return {
      render(state, nextView) {
        const changed = game()?.moveCount !== state.game.moveCount;
        match = state; view = nextView;
        legal = canMove() ? rules.legalMoves(state.game, view.myColor) : [];
        if (changed || !canMove()) { selected = -1; promo.classList.add('hidden'); }
        draw();
      },
      helpText({ myTurn }) {
        if (!view.myColor) return '';
        return myTurn ? '움직일 말을 누르고, 점이 찍힌 칸을 누르세요.' : '상대가 두는 중이에요…';
      }
    };
  }
  return { create };
})();
