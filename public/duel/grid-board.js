// 오목·바둑 공통 바둑판(Canvas). 교차점에 돌을 놓는다.
// 마우스는 한 번 클릭으로 두고, 손가락은 첫 번째 터치로 미리 보기, 같은 자리를 한 번 더 누르면 둔다(실수 방지).
window.DuelBoard = (() => {
  const STARS = { 9: [2, 4, 6], 13: [3, 6, 9], 15: [3, 7, 11], 19: [3, 9, 15] };
  const STONE = { 1: 'black', 2: 'white' };

  function create(root, { rules, onAct }) {
    const canvas = document.createElement('canvas'); canvas.className = 'duel-grid-canvas';
    canvas.setAttribute('aria-label', '바둑판'); root.append(canvas);
    const ctx = canvas.getContext('2d');
    let match = null; let view = {};
    let hover = -1; let pending = -1;
    let forbidden = { key: '', spots: new Map() };

    const game = () => match?.game;
    const n = () => game()?.size || 15;
    const unit = () => canvas.width / (n() + 1);
    const pos = (i) => (i + 1) * unit();
    const phase = () => game()?.phase || 'play';
    const canMove = () => view.canPlay && phase() === 'play' && match.clockColor === view.myColor;
    const canMark = () => view.canPlay && phase() === 'scoring';

    // 오목 금수 자리(내 차례일 때만 계산, 같은 판이면 다시 계산하지 않음)
    function forbiddenSpots() {
      if (!rules.forbiddenSpots || !canMove()) return new Map();
      const key = `${game().moveCount}:${view.myColor}`;
      if (forbidden.key !== key) forbidden = { key, spots: new Map(rules.forbiddenSpots(game(), view.myColor).map((s) => [s.index, s.reason])) };
      return forbidden.spots;
    }

    function resize() {
      const ratio = window.devicePixelRatio || 1; const width = root.clientWidth;
      canvas.width = Math.round(width * ratio); canvas.height = canvas.width;
      canvas.style.height = `${width}px`;
      draw();
    }

    function drawStone(x, y, color, alpha = 1) {
      const r = unit() * 0.46;
      ctx.save(); ctx.globalAlpha = alpha;
      const gradient = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
      if (color === 'black') { gradient.addColorStop(0, '#5a5a5a'); gradient.addColorStop(1, '#0d0d0d'); }
      else { gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(1, '#cfcac0'); }
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = gradient;
      ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = r * 0.25; ctx.shadowOffsetY = r * 0.08; ctx.fill();
      ctx.restore();
    }

    function draw() {
      const g = game(); const size = n(); const u = unit();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#dcb06b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#3d2f1f'; ctx.lineWidth = Math.max(1, u / 28);
      for (let i = 0; i < size; i += 1) {
        ctx.beginPath(); ctx.moveTo(pos(0), pos(i)); ctx.lineTo(pos(size - 1), pos(i)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(pos(i), pos(0)); ctx.lineTo(pos(i), pos(size - 1)); ctx.stroke();
      }
      ctx.fillStyle = '#3d2f1f';
      for (const x of STARS[size] || []) for (const y of STARS[size] || []) { ctx.beginPath(); ctx.arc(pos(x), pos(y), u * 0.11, 0, Math.PI * 2); ctx.fill(); }
      if (!g) return;

      const dead = new Set(g.dead || []); const win = new Set(g.winLine || []);
      // 계가 중·끝난 바둑은 집을 작은 네모로 보여 준다.
      if (g.score?.owner) {
        g.score.owner.forEach((owner, index) => {
          if (!owner || (g.board[index] && !dead.has(index))) return;
          const x = pos(index % size); const y = pos(Math.floor(index / size)); const s = u * 0.32;
          ctx.fillStyle = owner === 1 ? 'rgba(20,20,20,.75)' : 'rgba(255,255,255,.9)';
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
        });
      }
      g.board.forEach((stone, index) => {
        if (!stone) return;
        const x = pos(index % size); const y = pos(Math.floor(index / size));
        drawStone(x, y, STONE[stone], dead.has(index) ? 0.4 : 1);
        if (win.has(index)) { ctx.beginPath(); ctx.arc(x, y, u * 0.5, 0, Math.PI * 2); ctx.strokeStyle = '#ff3d5a'; ctx.lineWidth = u * 0.09; ctx.stroke(); }
      });
      if (g.last >= 0 && g.board[g.last]) {
        ctx.beginPath(); ctx.arc(pos(g.last % size), pos(Math.floor(g.last / size)), u * 0.14, 0, Math.PI * 2);
        ctx.fillStyle = g.board[g.last] === 1 ? '#ff6b81' : '#e8384f'; ctx.fill();
      }
      // 금수 ✕
      const spots = forbiddenSpots();
      ctx.strokeStyle = '#d6243a'; ctx.lineWidth = u * 0.08; ctx.lineCap = 'round';
      for (const index of spots.keys()) {
        const x = pos(index % size); const y = pos(Math.floor(index / size)); const s = u * 0.22;
        ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke();
      }
      // 미리 보기 돌
      const preview = pending >= 0 ? pending : hover;
      if (canMove() && preview >= 0 && !g.board[preview] && !spots.has(preview)) {
        drawStone(pos(preview % size), pos(Math.floor(preview / size)), view.myColor, pending >= 0 ? 0.75 : 0.45);
      }
    }

    function cellAt(event) {
      const rect = canvas.getBoundingClientRect(); const size = n();
      const x = Math.round(((event.clientX - rect.left) / rect.width) * (size + 1) - 1);
      const y = Math.round(((event.clientY - rect.top) / rect.height) * (size + 1) - 1);
      return x >= 0 && y >= 0 && x < size && y < size ? y * size + x : -1;
    }

    canvas.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse') return;
      const cell = cellAt(event); if (cell !== hover) { hover = cell; draw(); }
    });
    canvas.addEventListener('pointerleave', () => { hover = -1; draw(); });
    canvas.addEventListener('pointerup', (event) => {
      const cell = cellAt(event); if (cell < 0 || !game()) return;
      const x = cell % n(); const y = Math.floor(cell / n());
      if (canMark()) { if (game().board[cell]) onAct({ type: 'toggleDead', x, y }); return; }
      if (!canMove() || game().board[cell]) return;
      const reason = forbiddenSpots().get(cell);
      if (reason) { onAct({ type: 'move', x, y }); return; } // 서버가 이유를 알려 준다
      if (event.pointerType !== 'mouse' && pending !== cell) { pending = cell; draw(); return; }
      pending = -1; onAct({ type: 'move', x, y });
    });

    new ResizeObserver(resize).observe(root);

    return {
      render(state, nextView) {
        if (match?.game.moveCount !== state.game.moveCount) pending = -1;
        match = state; view = nextView;
        draw();
      },
      helpText({ myTurn, game: g }) {
        if (!view.myColor) return '';
        if (g.phase === 'scoring') return '죽은 돌을 누르면 표시되고, 다시 누르면 풀려요. 집 계산이 맞으면 "계가 확인"을 누르세요.';
        if (!myTurn) return '상대가 두는 중이에요…';
        const touch = matchMedia('(pointer: coarse)').matches;
        return `${touch ? '둘 자리를 한 번 누르면 미리 보이고, 한 번 더 누르면 둬요.' : '둘 자리를 클릭하세요.'}${rules.forbiddenSpots ? ' ✕는 금수 자리예요.' : ''}`;
      }
    };
  }
  return { create };
})();
