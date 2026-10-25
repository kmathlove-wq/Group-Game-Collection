(() => {
  const $ = (s) => document.querySelector(s);
  const socket = io();
  const code = new URLSearchParams(location.search).get('code')?.toUpperCase();
  const me = { userId: localStorage.getItem('liar:userId'), nickname: localStorage.getItem('liar:nickname') || '', code };
  if (!code || !me.userId || !me.nickname) { location.replace('/liar'); return; }
  $('#roomCode').textContent = code;

  let state = null;     // 서버가 보내준 방 상태
  let secret = null;    // 나만 받은 { topic, word } (word가 null이면 내가 라이어)
  let endsAt = null;
  let myVote = null;    // 내가 이번 투표에서 찍은 사람(서버는 끝날 때까지 누가 누굴 찍었는지 안 알려 줌)
  let resultShown = false;
  let lastPhase = null;

  function emit(event, data) {
    return new Promise((resolve, reject) => socket.emit(event, data, (result) => result?.ok ? resolve(result) : reject(new Error(result?.message || '요청에 실패했습니다.'))));
  }
  function notice(message, type = '') {
    const el = $('#result'); el.textContent = message; el.className = `notice ${type}`; el.classList.toggle('hidden', !message);
    clearTimeout(notice.timer); if (message) notice.timer = setTimeout(() => el.classList.add('hidden'), 3200);
  }
  const playerById = (id) => state?.players.find((p) => p.userId === id);
  const nameOf = (id) => playerById(id)?.nickname || state?.game?.hints.find((h) => h.userId === id)?.nickname || '나간 사람';

  let audio;
  function beep(freqs, length = 0.1) {
    try {
      audio ||= new AudioContext();
      freqs.forEach((freq, i) => {
        const osc = audio.createOscillator(); const gain = audio.createGain();
        const at = audio.currentTime + i * length;
        osc.frequency.value = freq; osc.type = 'triangle';
        gain.gain.setValueAtTime(0.12, at); gain.gain.exponentialRampToValueAtTime(0.001, at + length);
        osc.connect(gain).connect(audio.destination); osc.start(at); osc.stop(at + length);
      });
    } catch { /* 소리가 안 나도 게임은 계속 */ }
  }

  function renderPlayers(room) {
    const root = $('#players'); root.replaceChildren();
    const game = room.game;
    const voting = room.state === 'playing' && game?.phase === 'vote' && game.order.includes(me.userId);
    room.players.forEach((p) => {
      const row = document.createElement('div');
      const turn = game?.turnUserId === p.userId || (game?.phase === 'guess' && game.accusedId === p.userId);
      row.className = `wc-player${turn ? ' turn' : ''}${p.connected ? '' : ' offline'}${myVote === p.userId ? ' liar-picked' : ''}`;
      row.style.setProperty('--player', p.color);
      const dot = document.createElement('i');
      const name = document.createElement('b'); name.textContent = `${p.isHost ? '👑 ' : ''}${p.nickname}${p.userId === me.userId ? ' (나)' : ''}`;
      const info = document.createElement('small');
      if (room.state === 'waiting') info.textContent = p.isHost ? '방장' : p.ready ? '준비 완료 ✓' : '준비 중…';
      else {
        const parts = [`${p.score}점`];
        if (game?.phase === 'vote' && game.votedIds.includes(p.userId)) parts.push('투표 완료 ✓');
        if (!game?.order.includes(p.userId)) parts.push('구경 중');
        if (!p.connected) parts.push('연결 끊김');
        info.textContent = parts.join(' · ');
      }
      row.append(dot, name, info);
      if (voting && p.userId !== me.userId && game.order.includes(p.userId)) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'liar-vote-button';
        button.textContent = myVote === p.userId ? '✔ 찍음' : '찍기';
        button.setAttribute('aria-label', `${p.nickname}님을 라이어로 찍기`);
        button.onclick = () => emit('liar:vote', { targetId: p.userId }).then(() => { myVote = p.userId; render(state); }).catch((e) => notice(e.message, 'error'));
        row.append(button);
      }
      root.append(row);
    });
  }

  function renderSecret(room) {
    const box = $('#secret');
    const show = Boolean(secret && room.game);
    box.classList.toggle('hidden', !show);
    if (!show) return;
    const amLiar = secret.word === null;
    box.classList.toggle('is-liar', amLiar);
    $('#secretLabel').textContent = amLiar ? `주제: ${secret.topic}` : `주제 '${secret.topic}'의 내 제시어`;
    $('#secretWord').textContent = amLiar ? '🤥 당신은 라이어!' : secret.word;
    $('#secretHelp').textContent = amLiar ? '다른 사람 설명을 잘 듣고 들키지 않게 설명하세요. 잡혀도 제시어를 맞히면 역전승!'
      : room.mode === 'fool' ? '바보 모드! 혹시 나만 다른 제시어를 받은 라이어일 수도 있어요 🤔'
        : '라이어가 눈치채지 못하게, 하지만 친구들은 알 수 있게 설명하세요.';
  }

  function renderHints(game) {
    const root = $('#hints');
    root.classList.toggle('hidden', !game);
    root.replaceChildren(...(game?.hints || []).map((h) => {
      const li = document.createElement('li'); li.className = `liar-hint${h.skipped ? ' skipped' : ''}${h.userId === me.userId ? ' mine' : ''}`;
      li.style.setProperty('--player', h.color);
      const who = document.createElement('small'); who.textContent = h.nickname;
      const said = document.createElement('b'); said.textContent = h.text;
      li.append(who, said); return li;
    }));
    root.scrollTop = root.scrollHeight;
  }

  function render(room) {
    state = room;
    const game = room.game;
    if (game?.phase !== lastPhase) {
      if (lastPhase && game?.phase && game.phase !== 'result') beep([520, 700], 0.08);
      if (game?.phase !== 'vote') myVote = null;
      lastPhase = game?.phase ?? null;
    }
    $('#roomTitle').textContent = room.title; document.title = `${room.title} · 그룹 게임 컬렉션-라이어 게임`;
    $('#modeBadge').textContent = room.mode === 'fool' ? '🤪 바보 모드' : '🤥 일반 모드';
    $('#playerCount').textContent = `${room.playerCount}/${room.maxPlayers}`;
    $('#topic').textContent = game?.topic || (room.topic === 'random' ? '🎲 무작위' : room.topic);
    renderPlayers(room);
    const host = room.hostId === me.userId; const mine = playerById(me.userId);
    $('#start').classList.toggle('hidden', !host || room.state === 'playing');
    $('#start').textContent = room.state === 'finished' ? '↻ 한 판 더' : '▶ 게임 시작';
    $('#closeRoom').classList.toggle('hidden', !host || room.state === 'playing');
    $('#ready').classList.toggle('hidden', host || room.state === 'playing');
    $('#ready').textContent = mine?.ready ? '준비 취소' : '✓ 준비하기';
    $('#again').classList.toggle('hidden', !host);

    $('#waiting').classList.toggle('hidden', Boolean(game));
    renderSecret(room); renderHints(game);
    endsAt = game?.msLeft != null ? Date.now() + game.msLeft : null;

    const phase = room.state === 'playing' ? game.phase : room.state;
    const myHintTurn = phase === 'hint' && game.turnUserId === me.userId;
    const myGuess = phase === 'guess' && game.accusedId === me.userId;
    $('#hintForm').classList.toggle('hidden', !myHintTurn);
    $('#hintForm').classList.toggle('my-turn', myHintTurn);
    $('#guessForm').classList.toggle('hidden', !myGuess);
    $('#guessForm').classList.toggle('my-turn', myGuess);
    $('#voteHelp').classList.toggle('hidden', !(phase === 'vote' && game.order.includes(me.userId)));
    $('#skipTalk').classList.toggle('hidden', !(phase === 'talk' && host));

    const label = $('#statusLabel'); const message = $('#statusMessage');
    message.style.color = '';
    if (phase === 'waiting') {
      label.textContent = '대기실'; message.textContent = `모두 준비하면 방장이 시작해요! (3~${room.maxPlayers}명)`;
    } else if (phase === 'hint') {
      const turn = playerById(game.turnUserId);
      label.textContent = `✍️ 설명 시간 (${game.hints.length + 1}/${game.order.length})`;
      message.textContent = myHintTurn ? '내 차례! 제시어를 한 줄로 설명하세요' : turn ? `${turn.nickname}님이 설명하는 중…` : '다음 사람을 기다리는 중…';
      message.style.color = turn?.color || '';
      if (myHintTurn && document.activeElement !== $('#hintInput')) { beep([660, 880], 0.09); setTimeout(() => $('#hintInput').focus(), 0); }
    } else if (phase === 'talk') {
      label.textContent = '💬 토론 시간'; message.textContent = '누가 라이어일까요? 채팅으로 이야기해 보세요';
    } else if (phase === 'vote') {
      label.textContent = '🗳️ 투표 시간'; message.textContent = `${game.votedIds.length}/${game.order.length}명 투표했어요`;
    } else if (phase === 'guess') {
      label.textContent = '🎯 라이어의 마지막 기회';
      message.textContent = myGuess ? '들켰어요! 제시어를 맞히면 역전승!' : `${nameOf(game.accusedId)}님이 라이어였어요! 제시어를 맞히는 중…`;
      if (myGuess && document.activeElement !== $('#guessInput')) setTimeout(() => $('#guessInput').focus(), 0);
    } else {
      label.textContent = '게임 끝';
      message.textContent = game?.result ? (game.result.winner === 'liar' ? '🤥 라이어 승리!' : game.result.winner === 'citizens' ? '🙌 시민 승리!' : '이번 판은 무효') : '';
      if (game?.result && !resultShown) showResult(game.result); // 끝난 방에 다시 들어와도 결과를 보여준다
    }
    if (phase !== 'finished') resultShown = false;
    tickTimer();
  }

  function tickTimer() {
    const timer = $('#timer'); const bar = $('#timebar'); const game = state?.game;
    if (state?.state !== 'playing') { timer.textContent = '--'; bar.style.width = '0%'; timer.classList.remove('urgent'); return; }
    if (!game.phaseSeconds) { timer.textContent = '∞'; timer.classList.remove('urgent'); bar.style.width = '100%'; return; }
    const left = endsAt ? Math.max(0, endsAt - Date.now()) : 0;
    timer.textContent = `${Math.ceil(left / 1000)}초`;
    timer.classList.toggle('urgent', left <= 5000);
    bar.style.width = `${Math.min(100, (left / (game.phaseSeconds * 1000)) * 100)}%`;
  }
  setInterval(tickTimer, 100);

  function showResult(result) {
    const titles = { liar: '🤥 라이어 승리!', citizens: '🙌 시민 승리!' };
    $('#winnerTitle').textContent = titles[result.winner] || '이번 판은 무효예요';
    $('#resultReason').textContent = result.reason;
    $('#revealLiar').textContent = result.liarNickname;
    $('#revealWord').textContent = result.word;
    $('#revealFoolBox').classList.toggle('hidden', !result.foolWord);
    $('#revealFool').textContent = result.foolWord || '';
    // 받은 표: 많이 받은 순, 누가 찍었는지도 보여 준다.
    const tally = $('#voteTally'); tally.replaceChildren();
    const entries = Object.entries(result.counts).sort((a, b) => b[1] - a[1]);
    if (!entries.length) { const li = document.createElement('li'); li.textContent = '아무도 투표하지 않았어요.'; tally.append(li); }
    for (const [targetId, count] of entries) {
      const li = document.createElement('li'); li.style.setProperty('--player', playerById(targetId)?.color || '#999');
      const icon = document.createElement('span'); icon.textContent = targetId === result.liarId ? '🤥' : '🙂';
      const name = document.createElement('b'); name.textContent = nameOf(targetId);
      const voters = Object.entries(result.votes).filter(([, t]) => t === targetId).map(([v]) => nameOf(v));
      const small = document.createElement('small'); small.textContent = ` ← ${voters.join(', ')}`; name.append(small);
      const score = document.createElement('strong'); score.textContent = `${count}표`;
      li.append(icon, name, score); tally.append(li);
    }
    const ranking = $('#ranking'); ranking.replaceChildren();
    const medals = ['🥇', '🥈', '🥉'];
    const players = [...state.players].sort((a, b) => b.score - a.score);
    players.forEach((p) => {
      const rank = players.filter((o) => o.score > p.score).length + 1; // 동점은 같은 등수
      const li = document.createElement('li'); li.style.setProperty('--player', p.color);
      const medal = document.createElement('span'); medal.textContent = medals[rank - 1] || `${rank}등`;
      const name = document.createElement('b'); name.textContent = p.nickname;
      const score = document.createElement('strong'); score.textContent = `${p.score}점`;
      li.append(medal, name, score); ranking.append(li);
    });
    resultShown = true;
    const dialog = $('#resultDialog'); if (dialog.open) dialog.close(); dialog.showModal();
  }

  function addChat(message) {
    const p = document.createElement('p'); p.className = message.type || '';
    if (message.color) p.style.setProperty('--player', message.color);
    p.textContent = message.type === 'chat' ? `${message.nickname}: ${message.text}` : message.text;
    $('#chat').append(p); $('#chat').scrollTop = $('#chat').scrollHeight;
  }

  async function submit(form, input, event) {
    const value = input.value.trim(); if (!value || form.dataset.busy) return;
    form.dataset.busy = '1';
    try { await emit(event, { text: value }); input.value = ''; notice(''); }
    catch (error) { notice(error.message, 'error'); beep([180], 0.15); }
    finally { delete form.dataset.busy; }
  }
  $('#hintForm').addEventListener('submit', (event) => { event.preventDefault(); submit($('#hintForm'), $('#hintInput'), 'liar:hint'); });
  $('#guessForm').addEventListener('submit', (event) => { event.preventDefault(); submit($('#guessForm'), $('#guessInput'), 'liar:guess'); });

  socket.on('connect', () => emit('liar:room:join', me).catch((error) => { sessionStorage.setItem('liar:exitNotice', error.message); location.replace('/liar'); }));
  socket.on('liar:room:state', render);
  socket.on('liar:secret', (data) => { secret = data; if (state) render(state); });
  socket.on('liar:chat:message', addChat);
  socket.on('liar:chat:history', (messages) => { $('#chat').replaceChildren(); messages.forEach(addChat); });
  // 결과 창은 바로 앞에 온 방 상태(바뀐 점수 포함)를 그릴 때 이미 열린다. 여기서는 소리만 낸다.
  socket.on('liar:game:finished', (result) => { beep(result.winner === 'liar' ? [392, 330, 262] : [523, 659, 784, 1046], 0.13); if (state && !resultShown) showResult(result); });
  socket.on('liar:room:closed', (data) => { sessionStorage.setItem('liar:exitNotice', data?.message || '방장이 방을 종료했습니다.'); location.replace('/liar'); });

  $('#ready').onclick = () => emit('liar:room:ready', !playerById(me.userId)?.ready).catch((e) => notice(e.message, 'error'));
  const start = () => emit('liar:game:start', {}).then(() => { if ($('#resultDialog').open) $('#resultDialog').close(); }).catch((e) => notice(e.message, 'error'));
  $('#start').onclick = start; $('#again').onclick = start;
  $('#skipTalk').onclick = () => emit('liar:skip-talk', {}).catch((e) => notice(e.message, 'error'));
  $('#closeResult').onclick = () => $('#resultDialog').close();
  $('#closeRoom').onclick = () => { if (confirm('정말 이 방을 종료할까요? 모든 참가자가 첫 화면으로 이동합니다.')) emit('liar:room:close', {}).catch((e) => notice(e.message, 'error')); };
  $('#copyCode').onclick = async () => { try { await navigator.clipboard.writeText(code); notice('방 코드를 복사했습니다.', 'success'); } catch { notice(`방 코드: ${code}`, 'success'); } };
  async function chat() { const value = $('#chatInput').value; if (!value.trim()) return; try { await emit('liar:chat:send', { text: value }); $('#chatInput').value = ''; } catch (e) { notice(e.message, 'error'); } }
  $('#chatSend').onclick = chat; $('#chatInput').onkeydown = (event) => { if (event.key === 'Enter' && !event.isComposing) chat(); };
  $('#leave').onclick = async () => { await emit('liar:room:leave', {}).catch(() => {}); sessionStorage.setItem('liar:exitNotice', '방에서 나왔습니다.'); location.href = '/liar'; };
})();
