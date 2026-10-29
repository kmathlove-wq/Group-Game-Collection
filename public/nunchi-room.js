(() => {
  const $ = (s) => document.querySelector(s);
  const socket = io();
  const code = new URLSearchParams(location.search).get('code')?.toUpperCase();
  const me = { userId: localStorage.getItem('nunchi:userId'), nickname: localStorage.getItem('nunchi:nickname') || '', code };
  if (!code || !me.userId || !me.nickname) { location.replace('/nunchi'); return; }
  $('#roomCode').textContent = code;

  let state = null;       // 서버가 보내준 방 상태
  let endsAt = null;
  let resultShown = false;
  let lastPhase = null;
  let lastCountdown = null;
  let calling = false;    // 외치기 요청을 보내고 답을 기다리는 중
  const WHY = { clash: '💥 겹침', last: '🐢 꼴찌', timeout: '⏰ 시간 초과' };

  function emit(event, data) {
    return new Promise((resolve, reject) => socket.emit(event, data, (result) => result?.ok ? resolve(result) : reject(Object.assign(new Error(result?.message || '요청에 실패했습니다.'), { code: result?.code }))));
  }
  function notice(message, type = '') {
    const el = $('#result'); el.textContent = message; el.className = `notice ${type}`; el.classList.toggle('hidden', !message);
    clearTimeout(notice.timer); if (message) notice.timer = setTimeout(() => el.classList.add('hidden'), 2600);
  }
  const playerById = (id) => state?.players.find((p) => p.userId === id);
  const nameOf = (id) => playerById(id)?.nickname || '나간 사람';

  // ── 효과음: 소리 파일 없이 웹오디오로 합성 ──
  let audio;
  let soundOn = (() => { try { return localStorage.getItem('nunchi:sound') !== 'off'; } catch { return true; } })();
  const syncSoundButton = () => { $('#sound').textContent = soundOn ? '🔊' : '🔇'; };
  syncSoundButton();
  $('#sound').onclick = () => { soundOn = !soundOn; syncSoundButton(); try { localStorage.setItem('nunchi:sound', soundOn ? 'on' : 'off'); } catch { /* 저장 못 해도 괜찮음 */ } };
  function tone(freqs, length = 0.1, type = 'triangle', volume = 0.13) {
    if (!soundOn) return;
    try {
      audio ||= new AudioContext();
      freqs.forEach((freq, i) => {
        const osc = audio.createOscillator(); const gain = audio.createGain();
        const at = audio.currentTime + i * length;
        osc.frequency.value = freq; osc.type = type;
        gain.gain.setValueAtTime(volume, at); gain.gain.exponentialRampToValueAtTime(0.001, at + length);
        osc.connect(gain).connect(audio.destination); osc.start(at); osc.stop(at + length);
      });
    } catch { /* 소리가 안 나도 게임은 계속 */ }
  }
  function boom() { // 겹침: 지글거리는 잡음이 점점 작아짐
    if (!soundOn) return;
    try {
      audio ||= new AudioContext();
      const length = 0.45; const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * length), audio.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
      const source = audio.createBufferSource(); const gain = audio.createGain(); gain.gain.value = 0.35;
      source.buffer = buffer; source.connect(gain).connect(audio.destination); source.start();
      tone([110, 70], 0.18, 'sawtooth', 0.12);
    } catch { /* 소리가 안 나도 게임은 계속 */ }
  }

  function renderPlayers(room) {
    const root = $('#players'); root.replaceChildren();
    const game = room.game;
    const callOf = new Map((game?.calls || []).map((c) => [c.userId, c]));
    const sorted = [...room.players];
    if (game && room.state !== 'waiting') { // 살아 있는 사람이 위로
      const alive = new Set(game.alive);
      sorted.sort((a, b) => Number(game.mode === 'survival' && !alive.has(a.userId)) - Number(game.mode === 'survival' && !alive.has(b.userId)));
    }
    for (const p of sorted) {
      const row = document.createElement('div');
      const call = callOf.get(p.userId);
      const out = Boolean(game) && room.state !== 'waiting' && game.mode === 'survival' && game.order.includes(p.userId) && !game.alive.includes(p.userId);
      row.className = `wc-player${call ? ' turn' : ''}${p.connected ? '' : ' offline'}${out ? ' out' : ''}${call?.status === 'clash' ? ' nunchi-clash' : ''}`;
      row.style.setProperty('--player', p.color);
      const dot = document.createElement('i');
      const name = document.createElement('b'); name.textContent = `${p.isHost ? '👑 ' : ''}${p.nickname}${p.userId === me.userId ? ' (나)' : ''}`;
      const info = document.createElement('small');
      const parts = [];
      if (room.state === 'waiting') parts.push(p.isHost ? '방장' : p.ready ? '준비 완료 ✓' : '준비 중…');
      else if (!game?.order.includes(p.userId)) parts.push('구경 중');
      else {
        if (game.mode === 'survival') parts.push(out ? `💀 ${game.outRounds[p.userId] || '-'}라운드 탈락` : '💚 생존');
        else parts.push(`벌점 ${game.penalties[p.userId] || 0}`);
        if (call) parts.push(call.status === 'clash' ? `💥 ${call.number}` : `📣 ${call.number}`);
      }
      if (p.wins) parts.push(`🏆${p.wins}`);
      if (!p.connected) parts.push('연결 끊김');
      info.textContent = parts.join(' · ');
      row.append(dot, name, info);
      root.append(row);
    }
  }

  function renderBubbles(game) {
    const root = $('#bubbles');
    const calls = game?.calls || [];
    root.classList.toggle('hidden', !calls.length);
    root.replaceChildren(...calls.map((c) => {
      const li = document.createElement('li');
      li.className = `nunchi-bubble ${c.status}${c.userId === me.userId ? ' mine' : ''}`;
      li.style.setProperty('--player', c.color || '#999');
      const num = document.createElement('b'); num.textContent = c.status === 'clash' ? `💥${c.number}` : String(c.number);
      const who = document.createElement('span'); who.textContent = c.nickname || nameOf(c.userId);
      li.append(num, who); return li;
    }));
    root.scrollTop = root.scrollHeight;
  }

  const inRound = (game) => Boolean(game) && game.roundIds.includes(me.userId);
  const calledAlready = (game) => Boolean(game?.calls.some((c) => c.userId === me.userId));

  function renderStage(room) {
    const game = room.game;
    const phase = room.state === 'playing' ? game.phase : room.state;
    const label = $('#stageLabel'); const big = $('#bigNumber'); const help = $('#stageHelp');
    const button = $('#callButton');
    const canCall = phase === 'play' && inRound(game) && !calledAlready(game);
    button.disabled = !canCall || calling;
    button.classList.toggle('ready', canCall);
    button.classList.toggle('hidden', !(room.state === 'playing' && game.order.includes(me.userId)));
    $('#stage').classList.toggle('counting', phase === 'countdown');
    if (phase === 'waiting') {
      label.textContent = '기다리는 중'; big.textContent = '👀';
      help.textContent = `3명 이상 모이면 방장이 시작할 수 있어요 (최대 ${room.maxPlayers}명)`;
    } else if (phase === 'countdown') {
      label.textContent = `${game.roundNo}라운드 준비`;
      help.textContent = inRound(game) ? '숫자가 끝나면 눈치껏 외치세요! 미리 누르면 무시돼요' : '이번 라운드는 구경해요';
    } else if (phase === 'play') {
      label.textContent = game.number ? '지금 숫자' : '시작!';
      big.textContent = game.number ? String(game.number) : 'GO!';
      help.textContent = !inRound(game) ? '구경 중 — 누가 걸릴까요?' : calledAlready(game) ? '외쳤어요! 다른 사람을 지켜봐요' : `다음은 ${game.number + 1}! 지금이다 싶으면 외치세요`;
    } else if (phase === 'result') {
      const r = game.lastResult;
      label.textContent = `${r?.roundNo || game.roundNo}라운드 결과`;
      big.textContent = r?.clashNumber ? '💥' : r?.redo ? '🔁' : '🔔';
      help.textContent = '곧 다음 라운드!';
    } else {
      label.textContent = '게임 끝'; big.textContent = '🏆';
      const winners = game?.final?.winners || [];
      help.textContent = winners.length ? `${winners.map(nameOf).join(', ')}님 우승!` : (game?.final?.reason || '게임이 끝났어요');
    }
  }

  function render(room) {
    state = room;
    const game = room.game;
    const phase = room.state === 'playing' ? game.phase : room.state;
    if (phase !== lastPhase) {
      if (phase === 'play') tone([880, 1175], 0.12, 'square', 0.08);
      if (phase !== 'result') $('#roundBanner').classList.add('hidden');
      lastPhase = phase; lastCountdown = null;
    }
    $('#roomTitle').textContent = room.title; document.title = `${room.title} · 그룹 게임 컬렉션-눈치게임`;
    $('#modeBadge').textContent = room.mode === 'score' ? `📝 점수 모드 ${room.rounds}라운드` : '💚 생존 모드';
    $('#playerCount').textContent = `${room.playerCount}/${room.maxPlayers}`;
    $('#roundInfo').textContent = game && room.state !== 'waiting' ? (game.totalRounds ? `${game.roundNo}/${game.totalRounds}` : `${game.roundNo}`) : '-';
    renderPlayers(room);
    const host = room.hostId === me.userId; const mine = playerById(me.userId);
    $('#start').classList.toggle('hidden', !host || room.state === 'playing');
    $('#start').textContent = room.state === 'finished' ? '↻ 한 판 더' : '▶ 게임 시작';
    $('#closeRoom').classList.toggle('hidden', !host || room.state === 'playing');
    $('#ready').classList.toggle('hidden', host || room.state === 'playing');
    $('#ready').textContent = mine?.ready ? '준비 취소' : '✓ 준비하기';
    $('#again').classList.toggle('hidden', !host);

    renderStage(room); renderBubbles(room.state === 'waiting' ? null : game);
    endsAt = game?.msLeft != null ? Date.now() + game.msLeft : null;

    const label = $('#statusLabel'); const message = $('#statusMessage');
    if (phase === 'waiting') { label.textContent = '대기실'; message.textContent = '모두 준비하면 방장이 시작해요!'; }
    else if (phase === 'countdown') { label.textContent = '⏳ 카운트다운'; message.textContent = `${game.roundIds.length}명이 이번 라운드에 나와요`; }
    else if (phase === 'play') {
      label.textContent = '📣 외치는 중';
      message.textContent = `${game.calls.length}/${game.roundIds.length}명 외침`;
    } else if (phase === 'result') { label.textContent = '🔔 라운드 결과'; message.textContent = game.lastResult?.message || ''; }
    else {
      label.textContent = '게임 끝'; message.textContent = $('#stageHelp').textContent;
      if (game?.final && !resultShown) showResult(game.final); // 끝난 방에 다시 들어와도 결과를 보여준다
    }
    if (phase !== 'finished') resultShown = false;
    tickTimer();
  }

  // 남은 시간 막대와 카운트다운 큰 숫자(3·2·1)는 0.1초마다 새로 그린다.
  function tickTimer() {
    const timer = $('#timer'); const bar = $('#timebar'); const game = state?.game;
    if (state?.state !== 'playing' || !game.phaseMs) { timer.textContent = '--'; bar.style.width = '0%'; timer.classList.remove('urgent'); return; }
    const left = endsAt ? Math.max(0, endsAt - Date.now()) : 0;
    timer.textContent = `${Math.ceil(left / 1000)}초`;
    timer.classList.toggle('urgent', game.phase === 'play' && left <= 5000);
    bar.style.width = `${Math.min(100, (left / game.phaseMs) * 100)}%`;
    if (game.phase === 'countdown') {
      const n = Math.max(1, Math.ceil(left / 1000));
      if (n !== lastCountdown) {
        lastCountdown = n; $('#bigNumber').textContent = String(n);
        const big = $('#bigNumber'); big.classList.remove('pop'); void big.offsetWidth; big.classList.add('pop');
        tone([523], 0.12, 'square', 0.07);
      }
    }
  }
  setInterval(tickTimer, 100);

  function showResult(final) {
    const winners = final.winners || [];
    $('#winnerTitle').textContent = winners.length ? `🏆 ${winners.map(nameOf).join(', ')} 우승!` : '게임이 끝났어요';
    $('#resultReason').textContent = final.reason || (state?.game?.mode === 'score' ? '벌점이 가장 적은 사람이 우승이에요.' : '마지막까지 살아남았어요!');
    const ranking = $('#ranking'); ranking.replaceChildren();
    const medals = ['🥇', '🥈', '🥉'];
    for (const p of final.ranking) {
      const li = document.createElement('li'); li.style.setProperty('--player', playerById(p.userId)?.color || '#999');
      const medal = document.createElement('span'); medal.textContent = medals[p.rank - 1] || `${p.rank}등`;
      const name = document.createElement('b'); name.textContent = p.nickname;
      const wins = playerById(p.userId)?.wins;
      if (wins) { const small = document.createElement('small'); small.textContent = ` 🏆${wins}`; name.append(small); }
      const info = document.createElement('strong');
      info.textContent = state?.game?.mode === 'score' ? `벌점 ${p.penalty}` : p.outRound == null ? '생존' : `${p.outRound}라운드`;
      li.append(medal, name, info); ranking.append(li);
    }
    resultShown = true;
    const dialog = $('#resultDialog'); if (dialog.open) dialog.close(); dialog.showModal();
  }

  function showBanner(result) {
    const banner = $('#roundBanner');
    banner.textContent = result.redo ? `🔁 ${result.message}` : result.message;
    banner.className = `nunchi-banner${result.clashNumber ? ' clash' : ''}`;
    void banner.offsetWidth; banner.classList.add('show');
  }

  function addChat(message) {
    const p = document.createElement('p'); p.className = message.type || '';
    if (message.color) p.style.setProperty('--player', message.color);
    p.textContent = message.type === 'chat' ? `${message.nickname}: ${message.text}` : message.text;
    $('#chat').append(p); $('#chat').scrollTop = $('#chat').scrollHeight;
  }

  // ── 외치기: 서버에는 '외쳤다'는 사실만 보낸다(숫자·시각은 서버가 정함) ──
  async function shout() {
    const game = state?.game;
    if (calling || state?.state !== 'playing' || !inRound(game) || calledAlready(game)) return;
    if (game.phase !== 'play') return; // 카운트다운 중엔 보내지 않는다(보내도 서버가 무시)
    calling = true; $('#callButton').disabled = true;
    try { await emit('nunchi:call', {}); }
    catch (error) { if (error.code !== 'early') notice(error.message, 'error'); }
    finally { calling = false; if (state) renderStage(state); }
  }
  $('#callButton').addEventListener('click', shout);
  document.addEventListener('keydown', (event) => {
    if (event.repeat || (event.key !== ' ' && event.key !== 'Enter')) return;
    const target = event.target;
    if (target.closest?.('input, textarea, select, dialog[open]') || document.querySelector('dialog[open]')) return;
    if (state?.state !== 'playing') return;
    event.preventDefault(); shout();
  });

  socket.on('connect', () => emit('nunchi:room:join', me).catch((error) => { sessionStorage.setItem('nunchi:exitNotice', error.message); location.replace('/nunchi'); }));
  socket.on('nunchi:room:state', render);
  socket.on('nunchi:called', (data) => {
    tone([392 + Math.min(data.number, 30) * 30], 0.09, 'triangle', 0.12);
    const big = $('#bigNumber'); big.classList.remove('pop'); void big.offsetWidth; big.classList.add('pop');
  });
  socket.on('nunchi:round:result', (result) => {
    showBanner(result);
    const board = $('.nunchi-board');
    if (result.clashNumber) { boom(); board.classList.remove('shake'); void board.offsetWidth; board.classList.add('shake'); }
    if (!result.redo && result.outs.some((o) => o.userId === me.userId)) tone([392, 330, 262], 0.16, 'triangle', 0.12);
    else if (!result.clashNumber) tone([660, 520], 0.1);
  });
  socket.on('nunchi:chat:message', addChat);
  socket.on('nunchi:chat:history', (messages) => { $('#chat').replaceChildren(); messages.forEach(addChat); });
  // 결과 창은 바로 앞에 온 방 상태를 그릴 때 이미 열린다. 여기서는 소리만 낸다.
  socket.on('nunchi:game:finished', (final) => {
    tone(final.winners.includes(me.userId) ? [523, 659, 784, 1046] : [523, 659, 784], 0.13);
    if (state && !resultShown) showResult(final);
  });
  socket.on('nunchi:room:closed', (data) => { sessionStorage.setItem('nunchi:exitNotice', data?.message || '방장이 방을 종료했습니다.'); location.replace('/nunchi'); });

  $('#ready').onclick = () => emit('nunchi:room:ready', !playerById(me.userId)?.ready).catch((e) => notice(e.message, 'error'));
  const start = () => emit('nunchi:game:start', {}).then(() => { if ($('#resultDialog').open) $('#resultDialog').close(); }).catch((e) => notice(e.message, 'error'));
  $('#start').onclick = start; $('#again').onclick = start;
  $('#closeResult').onclick = () => $('#resultDialog').close();
  $('#closeRoom').onclick = () => { if (confirm('정말 이 방을 종료할까요? 모든 참가자가 첫 화면으로 이동합니다.')) emit('nunchi:room:close', {}).catch((e) => notice(e.message, 'error')); };
  $('#copyCode').onclick = async () => { try { await navigator.clipboard.writeText(code); notice('방 코드를 복사했습니다.', 'success'); } catch { notice(`방 코드: ${code}`, 'success'); } };
  async function chat() { const value = $('#chatInput').value; if (!value.trim()) return; try { await emit('nunchi:chat:send', { text: value }); $('#chatInput').value = ''; } catch (e) { notice(e.message, 'error'); } }
  $('#chatSend').onclick = chat; $('#chatInput').onkeydown = (event) => { if (event.key === 'Enter' && !event.isComposing) chat(); };
  $('#leave').onclick = async () => { await emit('nunchi:room:leave', {}).catch(() => {}); sessionStorage.setItem('nunchi:exitNotice', '방에서 나왔습니다.'); location.href = '/nunchi'; };
})();
