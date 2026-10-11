(() => {
  const { kind, rules, $, emit, notice, sounds } = window.Duel;
  const Clock = window.DuelClock;
  const socket = io();
  const call = (event, data) => emit(socket, event, data);
  const show = (message, type) => notice($('#notice'), message, type);
  const id = new URLSearchParams(location.search).get('id')?.toUpperCase();
  if (!id) { location.replace(`/${kind}`); return; }
  const me = { userId: window.Duel.userId(), nickname: window.Duel.nickname() };
  const gameTitle = $('.duel-brand b').textContent;

  let match = null;
  let myColor = null;       // 선수면 내 색, 관전자면 null
  let turnStart = 0;        // 지금 차례가 시작된 내 컴퓨터 시각(시계 표시용)
  let resultShown = false;
  const colorName = (color) => rules.colorNames[color];
  const opponentOf = (color) => rules.colors.find((c) => c !== color);
  const playing = () => match?.state === 'playing';
  const myTurn = () => playing() && myColor && match.clockColor === myColor;

  const board = window.DuelBoard.create($('#board'), {
    rules,
    onAct: (action) => call('match:act', { action }).catch((error) => { show(error.message, 'error'); sounds.lose(); })
  });

  // ── 선수 칸(이름·시계·잡은 돌) ──
  function renderSeats() {
    const root = $('#seats'); root.replaceChildren();
    // 내가 선수면 내 칸을 아래에, 관전자면 먼저 두는 쪽을 아래에 둔다.
    const bottom = myColor || rules.colors[0];
    for (const color of [opponentOf(bottom), bottom]) {
      const seat = match.seats[color];
      const card = document.createElement('div');
      card.className = `duel-seat seat-${color}${match.clockColor === color ? ' turn' : ''}${seat.connected ? '' : ' offline'}`;
      const stone = document.createElement('i'); stone.className = `duel-stone ${color}`; stone.setAttribute('aria-hidden', 'true');
      if (kind === 'chess') stone.textContent = `${rules.GLYPH.k}︎`;
      const name = document.createElement('b'); name.textContent = `${seat.nickname}${color === myColor ? ' (나)' : ''}`;
      const sub = document.createElement('small');
      sub.textContent = [colorName(color), seat.connected ? '' : '연결 끊김', rules.seatInfo(match.game, color)].filter(Boolean).join(' · ');
      const clock = document.createElement('strong'); clock.className = 'duel-clock'; clock.dataset.color = color;
      card.append(stone, name, sub, clock); root.append(card);
    }
    tickClocks();
  }
  function tickClocks() {
    if (!match) return;
    for (const element of document.querySelectorAll('.duel-clock')) {
      const color = element.dataset.color;
      const running = playing() && match.clockColor === color;
      const spent = running ? Date.now() - turnStart : 0;
      element.textContent = match.clocks ? Clock.label(match.clocks[color], spent, match.time) : '∞';
      element.classList.toggle('urgent', Boolean(match.clocks) && running && Clock.urgent(match.clocks[color], spent, match.time));
    }
  }
  setInterval(tickClocks, 200);

  // ── 버튼(기권·무승부·게임별 동작) ──
  function button(label, className, onClick, disabled = false) {
    const element = document.createElement('button'); element.className = `${className} wide`; element.textContent = label;
    element.disabled = disabled; element.onclick = onClick; return element;
  }
  function renderActions() {
    const root = $('#actions'); root.replaceChildren();
    if (!myColor) return;
    if (playing()) {
      for (const action of rules.actions(match.game, myColor)) {
        root.append(button(action.label, action.primary ? 'primary' : 'secondary', () => call('match:act', { action: { type: action.type } }).catch((e) => show(e.message, 'error')), action.disabled));
      }
      if (rules.allowDraw) {
        const draw = (action) => call('match:draw', { action }).catch((e) => show(e.message, 'error'));
        if (match.drawOffer === opponentOf(myColor)) {
          const box = document.createElement('div'); box.className = 'duel-draw-offer';
          const text = document.createElement('p'); text.textContent = '🤝 상대가 무승부를 제안했어요';
          box.append(text, button('무승부 받기', 'primary', () => draw('accept')), button('계속 두기', 'secondary', () => draw('decline')));
          root.append(box);
        } else if (match.drawOffer === myColor) root.append(button('무승부 제안 취소', 'secondary', () => draw('decline')));
        else root.append(button('🤝 무승부 제안', 'secondary', () => draw('offer')));
      }
      root.append(button('🏳 기권', 'danger', () => { if (confirm('정말 기권할까요? 이 대결은 지게 돼요.')) call('match:resign', {}).catch((e) => show(e.message, 'error')); }));
    } else {
      const waiting = match.rematch.includes(myColor);
      root.append(button(waiting ? '상대를 기다리는 중…' : '↻ 한 판 더 (색 바꾸기)', 'primary', rematch, waiting));
      if (match.rematch.includes(opponentOf(myColor)) && !waiting) {
        const text = document.createElement('p'); text.className = 'duel-help'; text.textContent = '상대가 한 판 더 하고 싶어 해요!'; root.prepend(text);
      }
    }
  }
  const rematch = () => call('match:rematch', {}).catch((e) => show(e.message, 'error'));

  // ── 상태 줄 ──
  function renderStatus() {
    const status = $('#status'); status.className = 'duel-status';
    let message;
    if (playing()) {
      const turn = match.clockColor; const extra = rules.statusText(match.game);
      if (!turn) message = extra || '잠시 기다려 주세요…';
      else if (turn === myColor) { message = `내 차례예요! (${colorName(turn)})`; status.classList.add('mine'); }
      else message = `${colorName(turn)} ${match.seats[turn].nickname}님 차례`;
      if (turn && extra) message += ` · ${extra}`;
    } else message = `🏁 ${match.result?.reason || '대결이 끝났어요.'}`;
    status.textContent = `${myColor ? '' : '👀 관전 중 · '}${message}`;
  }

  function showResult() {
    const { winner, reason } = match.result || {};
    $('#resultTitle').textContent = !winner ? '🤝 무승부'
      : myColor ? (winner === myColor ? '🏆 이겼어요!' : '😢 아쉽게 졌어요')
        : `🏆 ${colorName(winner)} ${match.seats[winner].nickname}님 승리!`;
    $('#resultReason').textContent = reason || '';
    $('#rematch').classList.toggle('hidden', !myColor);
    resultShown = true;
    if (myColor) (winner === myColor ? sounds.win : winner ? sounds.lose : sounds.win)();
    const dialog = $('#resultDialog'); if (!dialog.open) dialog.showModal();
  }

  function render(state) {
    const wasMyTurn = myTurn(); const wasPlaying = playing();
    match = state;
    turnStart = Date.now() - (state.spent || 0);
    const names = rules.colors.map((c) => `${colorName(c)} ${state.seats[c].nickname}`).join(' vs ');
    $('#matchTitle').textContent = names; document.title = `${names} · 그룹 게임 컬렉션-${gameTitle}`;
    $('#role').textContent = myColor ? `나: ${colorName(myColor)}` : '👀 관전 중';
    $('#summary').textContent = state.summary;
    $('#spectatorCount').textContent = String(state.spectators.length);
    $('#spectators').textContent = state.spectators.length ? state.spectators.join(', ') : '아직 없어요';
    renderSeats(); renderActions(); renderStatus();
    board.render(state, { myColor, canPlay: Boolean(myColor) && playing() });
    $('#boardHelp').textContent = playing() ? board.helpText({ myColor, myTurn: myTurn(), game: state.game }) : '';
    if (myTurn() && !wasMyTurn && wasPlaying) sounds.myTurn();
    if (state.state === 'finished' && !resultShown) showResult();
    // 한 판 더가 정해지면 선수·관전자 모두 새 대결로 옮겨 간다.
    if (state.next) location.replace(`/${kind}/match?id=${encodeURIComponent(state.next)}`);
  }

  // ── 채팅 ──
  function addChat(message) {
    const p = document.createElement('p'); p.className = message.type || '';
    if (message.type === 'chat') {
      const mark = document.createElement('span'); mark.className = `duel-chat-mark ${message.color || 'spectator'}`;
      mark.textContent = message.color ? (kind === 'chess' ? `${rules.GLYPH.k}︎` : '●') : '👀';
      const name = document.createElement('b'); name.textContent = `${message.nickname}: `;
      p.append(mark, name, message.text);
    } else p.textContent = message.text;
    $('#chat').append(p); $('#chat').scrollTop = $('#chat').scrollHeight;
  }
  async function sendChat() {
    const value = $('#chatInput').value; if (!value.trim()) return;
    try { await call('match:chat', { text: value }); $('#chatInput').value = ''; } catch (e) { show(e.message, 'error'); }
  }
  $('#chatSend').onclick = sendChat;
  $('#chatInput').onkeydown = (event) => { if (event.key === 'Enter' && !event.isComposing) sendChat(); };

  // ── 서버 연결 ──
  socket.on('connect', async () => {
    try {
      const result = await call('match:join', { id, userId: me.userId, nickname: me.nickname || '관전자' });
      myColor = result.color;
      if (match) render(match);
    } catch (error) {
      sessionStorage.setItem('duel:exitNotice', error.message); location.replace(`/${kind}`);
    }
  });
  socket.on('disconnect', () => show('서버와 연결이 끊겼어요. 다시 연결하는 중…', 'error'));
  socket.on(`${kind}:match:state`, render);
  socket.on(`${kind}:match:history`, (messages) => { $('#chat').replaceChildren(); messages.forEach(addChat); });
  socket.on(`${kind}:match:chat`, addChat);
  socket.on(`${kind}:match:acted`, (data) => {
    if (data.captured) sounds.capture(); else if (data.action?.type === 'move') sounds.stone();
    board.acted?.(data);
  });

  $('#rematch').onclick = () => { rematch(); };
  $('#toLobby').onclick = () => { location.href = `/${kind}`; };
  $('#closeResult').onclick = () => $('#resultDialog').close();
  $('#leave').onclick = async () => {
    if (myColor && playing()) {
      if (!confirm('대결 중에 나가면 기권으로 져요. 나갈까요?')) return;
      await call('match:resign', {}).catch(() => {});
    }
    location.href = `/${kind}`;
  };
})();
