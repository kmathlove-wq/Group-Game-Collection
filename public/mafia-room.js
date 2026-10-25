(() => {
  const $ = (s) => document.querySelector(s);
  const socket = io();
  const code = new URLSearchParams(location.search).get('code')?.toUpperCase();
  const me = { userId: localStorage.getItem('mafia:userId'), nickname: localStorage.getItem('mafia:nickname') || '', code };
  if (!code || !me.userId || !me.nickname) { location.replace('/mafia'); return; }
  $('#roomCode').textContent = code;

  const ROLES = {
    mafia: { name: '마피아', emoji: '🔪', help: '밤마다 동료 마피아와 함께 한 명을 노려요. 낮에는 시민인 척 들키지 마세요!' },
    doctor: { name: '의사', emoji: '💉', help: '밤마다 한 명을 골라 지켜요. 마피아가 그 사람을 노리면 살아나요. 나를 지켜도 돼요.' },
    police: { name: '경찰', emoji: '🔍', help: '밤마다 한 명을 조사해 마피아인지 알아내요. 낮에 잘 알려 주되 마피아에게 들키지 않게!' },
    citizen: { name: '시민', emoji: '🙂', help: '특별한 능력은 없지만 낮 토론과 투표로 마피아를 찾아낼 수 있어요.' }
  };
  const PHASES = { night: '🌙 밤', morning: '☀️ 아침', day: '💬 낮 토론', vote: '🗳️ 투표', verdict: '⚖️ 투표 결과', result: '게임 끝', finished: '게임 끝' };

  let state = null;   // 서버가 보내준 방 상태
  let secret = null;  // 나만 아는 정보 { role, mafiaIds, mafiaTarget, myTarget, investigations, roles }
  let endsAt = null;
  let myVote = null;  // 이번 투표에서 내가 찍은 사람(서버는 투표가 끝나야 알려 줌)
  let lastPhase = null;
  let resultShown = false;

  function emit(event, data) {
    return new Promise((resolve, reject) => socket.emit(event, data, (result) => result?.ok ? resolve(result) : reject(new Error(result?.message || '요청에 실패했습니다.'))));
  }
  function notice(message, type = '') {
    const el = $('#result'); el.textContent = message; el.className = `notice ${type}`; el.classList.toggle('hidden', !message);
    clearTimeout(notice.timer); if (message) notice.timer = setTimeout(() => el.classList.add('hidden'), 4000);
  }
  const playerById = (id) => state?.players.find((p) => p.userId === id);
  const nameOf = (id) => playerById(id)?.nickname || '나간 사람';
  const game = () => (state?.state === 'playing' || state?.state === 'finished' ? state.game : null);
  const amAlive = () => Boolean(game()?.alive.includes(me.userId));

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

  // 내가 아는 다른 사람의 직업: 공개된 것(죽음·게임 끝), 마피아 동료, 경찰 조사 결과.
  function knownTag(p) {
    if (p.role) return `${ROLES[p.role].emoji} ${ROLES[p.role].name}`;
    if (!secret) return '';
    if (p.userId === me.userId) return `${ROLES[secret.role].emoji} 나는 ${ROLES[secret.role].name}`;
    if (secret.roles?.[p.userId]) return `${ROLES[secret.roles[p.userId]].emoji} ${ROLES[secret.roles[p.userId]].name}`;
    if (secret.mafiaIds?.includes(p.userId)) return '🔪 마피아 동료';
    const found = secret.investigations?.findLast((i) => i.targetId === p.userId);
    if (found) return found.isMafia ? '🔍 조사 결과: 마피아!' : '🔍 조사 결과: 마피아 아님';
    return '';
  }

  // 지금 이 사람에게 누를 수 있는 단추(밤의 할 일 또는 투표).
  function actionFor(p) {
    const g = game(); if (!g || state.state !== 'playing' || !amAlive() || !g.alive.includes(p.userId)) return null;
    if (g.phase === 'vote' && p.userId !== me.userId) return { label: myVote === p.userId ? '✔ 찍음' : '찍기', picked: myVote === p.userId, run: () => vote(p.userId) };
    if (g.phase !== 'night' || !secret) return null;
    if (secret.role === 'mafia' && !secret.mafiaIds?.includes(p.userId)) {
      return { label: secret.mafiaTarget === p.userId ? '🔪 노리는 중' : '🔪 노리기', picked: secret.mafiaTarget === p.userId, run: () => act(p.userId) };
    }
    if (secret.role === 'doctor') return { label: secret.myTarget === p.userId ? '💉 지키는 중' : '💉 지키기', picked: secret.myTarget === p.userId, run: () => act(p.userId) };
    if (secret.role === 'police' && !secret.myTarget && p.userId !== me.userId && !secret.investigations?.some((i) => i.targetId === p.userId)) {
      return { label: '🔍 조사', picked: false, run: () => act(p.userId) };
    }
    return null;
  }

  function renderPlayers(room) {
    const root = $('#players'); root.replaceChildren();
    const g = game();
    room.players.forEach((p) => {
      const row = document.createElement('div');
      const dead = g && p.inGame && !p.alive;
      const action = actionFor(p);
      row.className = `wc-player${p.connected ? '' : ' offline'}${dead ? ' out' : ''}${action?.picked ? ' mafia-picked' : ''}`;
      row.style.setProperty('--player', p.color);
      const dot = document.createElement('i'); if (dead) dot.textContent = '👻';
      const name = document.createElement('b'); name.textContent = `${p.isHost ? '👑 ' : ''}${p.nickname}${p.userId === me.userId ? ' (나)' : ''}`;
      const info = document.createElement('small');
      if (room.state === 'waiting') info.textContent = p.isHost ? '방장' : p.ready ? '준비 완료 ✓' : '준비 중…';
      else {
        const parts = [];
        const tag = knownTag(p); if (tag) parts.push(tag);
        if (dead) parts.push('💀 죽음');
        if (!p.inGame) parts.push('구경 중');
        if (g?.phase === 'vote' && g.votedIds.includes(p.userId)) parts.push('투표 완료 ✓');
        if (!p.connected) parts.push('연결 끊김');
        info.textContent = parts.join(' · ') || '살아 있음';
      }
      row.append(dot, name, info);
      if (action) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'mafia-act-button';
        button.textContent = action.label; button.onclick = action.run;
        row.append(button);
      }
      root.append(row);
    });
  }

  function renderRole() {
    const g = game(); const show = Boolean(secret && g && g.alive);
    $('#roleCard').classList.toggle('hidden', !show);
    if (!show) return;
    const role = ROLES[secret.role];
    $('#roleCard').dataset.role = secret.role;
    $('#roleEmoji').textContent = amAlive() || state.state === 'finished' ? role.emoji : '👻';
    $('#roleName').textContent = role.name + (amAlive() || state.state === 'finished' ? '' : ' (죽음)');
    let help = role.help;
    if (secret.role === 'mafia' && secret.mafiaIds.length > 1) help += ` 동료: ${secret.mafiaIds.filter((id) => id !== me.userId).map(nameOf).join(', ')}`;
    if (!amAlive() && state.state === 'playing') help = '죽은 사람은 모두의 직업을 볼 수 있어요. 죽은 사람끼리만 이야기할 수 있고, 마피아의 밤 대화도 엿볼 수 있어요.';
    $('#roleHelp').textContent = help;
  }

  function renderNews(g) {
    $('#news').replaceChildren(...(g?.news || []).slice().reverse().map((n) => {
      const li = document.createElement('li'); li.className = `mafia-news-${n.type}`; li.textContent = n.text; return li;
    }));
  }

  function actionHelp(g) {
    if (!g || state.state !== 'playing') return '';
    if (!amAlive()) return '👻 죽은 사람은 구경만 할 수 있어요.';
    if (g.phase === 'night') {
      if (!secret) return '';
      if (secret.role === 'mafia') return secret.mafiaTarget ? `🔪 ${nameOf(secret.mafiaTarget)}님을 노리고 있어요. 동료와 채팅으로 상의해 바꿀 수도 있어요.` : '🔪 참가자 목록에서 오늘 밤 노릴 사람을 고르세요.';
      if (secret.role === 'doctor') return secret.myTarget ? `💉 ${nameOf(secret.myTarget)}님을 지키고 있어요. 바꿀 수 있어요.` : '💉 참가자 목록에서 오늘 밤 지킬 사람을 고르세요.';
      if (secret.role === 'police') {
        const last = secret.investigations?.at(-1);
        if (secret.myTarget && last) return `🔍 조사 결과: ${last.nickname}님은 ${last.isMafia ? '마피아예요! 🔪' : '마피아가 아니에요.'}`;
        return '🔍 참가자 목록에서 오늘 밤 조사할 사람을 고르세요.';
      }
      return '😴 시민은 밤에 할 일이 없어요. 아침이 올 때까지 기다려요.';
    }
    if (g.phase === 'vote') return myVote ? `🗳️ ${myVote === 'skip' ? '기권했어요' : `${nameOf(myVote)}님을 찍었어요`}. 끝나기 전엔 바꿀 수 있어요.` : '🗳️ 참가자 목록에서 마피아라고 생각하는 사람의 찍기 단추를 누르세요.';
    if (g.phase === 'day') return '💬 채팅으로 토론하세요. 경찰이라면 조사 결과를 알려 줄 때를 잘 고르세요!';
    return '';
  }

  function render(room) {
    state = room;
    const g = game();
    const phase = room.state === 'playing' ? g.phase : room.state;
    if (phase !== lastPhase) {
      if (phase === 'night') beep([392, 330, 262], 0.15);
      else if (phase === 'morning' || phase === 'vote') beep([523, 659], 0.1);
      if (phase !== 'vote') myVote = null;
      lastPhase = phase;
    }
    document.body.classList.toggle('mafia-night', phase === 'night');
    $('#roomTitle').textContent = room.title; document.title = `${room.title} · 그룹 게임 컬렉션-마피아 게임`;
    $('#playerCount').textContent = `${room.playerCount}/${room.maxPlayers}`;
    $('#aliveBadge').textContent = g ? `🙂 생존 ${g.alive.length}명 · 🔪 마피아 ${g.mafiaCount}명` : `👥 ${room.playerCount}명`;
    $('#dayLabel').textContent = g ? `${g.day}일째` : '-';
    renderPlayers(room); renderRole(); renderNews(g);

    const host = room.hostId === me.userId; const mine = playerById(me.userId);
    $('#start').classList.toggle('hidden', !host || room.state === 'playing');
    $('#start').textContent = room.state === 'finished' ? '↻ 한 판 더' : '▶ 게임 시작';
    $('#closeRoom').classList.toggle('hidden', !host || room.state === 'playing');
    $('#ready').classList.toggle('hidden', host || room.state === 'playing');
    $('#ready').textContent = mine?.ready ? '준비 취소' : '✓ 준비하기';
    $('#again').classList.toggle('hidden', !host);
    $('#waiting').classList.toggle('hidden', Boolean(g));
    $('.mafia-news-title').classList.toggle('hidden', !g);
    $('#skipVote').classList.toggle('hidden', !(phase === 'vote' && amAlive()));
    $('#skipVote').textContent = myVote === 'skip' ? '✔ 기권함' : '🙅 기권하기';
    $('#skipDay').classList.toggle('hidden', !(phase === 'day' && host));
    const help = actionHelp(g);
    $('#actionHelp').textContent = help; $('#actionHelp').classList.toggle('hidden', !help);

    $('#statusLabel').textContent = PHASES[phase] || '대기실';
    $('#statusMessage').textContent = phase === 'waiting' ? `모두 준비하면 방장이 시작해요! (4~${room.maxPlayers}명)`
      : phase === 'result' || phase === 'finished' ? (g?.winner === 'mafia' ? '🔪 마피아 승리!' : '🙌 시민 승리!')
        : phase === 'night' ? '마피아·의사·경찰이 몰래 움직이는 중…'
          : phase === 'day' ? '누가 마피아일까요? 채팅으로 이야기해요'
            : phase === 'vote' ? `${g.votedIds.length}/${g.alive.length}명 투표했어요`
              : g?.news.findLast((n) => n.type === 'dead' || n.type === 'save' || n.type === 'info')?.text || ''; // 아침·투표 결과는 중요한 소식 그대로
    // 끝난 방에 다시 들어와도 결과를 보여 준다(모두의 직업이 담긴 비밀이 도착한 뒤에).
    if (room.state === 'finished' && g?.winner && !resultShown && secret?.roles) showResult(g.winner);
    if (room.state !== 'finished') resultShown = false;

    // 채팅 채널: 밤엔 마피아만 몰래, 죽은 사람은 죽은 사람끼리.
    const playingNow = room.state === 'playing' && g && secret;
    const channel = !playingNow ? '' : !amAlive() ? '👻 죽은 사람끼리' : phase === 'night' ? (secret.role === 'mafia' ? '🔪 마피아끼리' : '') : '모두';
    const muted = playingNow && amAlive() && phase === 'night' && secret.role !== 'mafia';
    $('#chatChannel').textContent = channel ? `(${channel})` : '';
    $('#chatInput').disabled = muted; $('#chatSend').disabled = muted;
    $('#chatInput').placeholder = muted ? '밤에는 조용히… 😴' : channel ? `${channel} 메시지 입력…` : '메시지 입력…';
    endsAt = g?.msLeft != null ? Date.now() + g.msLeft : null;
    tickTimer();
  }

  function tickTimer() {
    const timer = $('#timer'); const bar = $('#timebar'); const g = game();
    if (state?.state !== 'playing' || !g.phaseSeconds) { timer.textContent = '--'; bar.style.width = '0%'; timer.classList.remove('urgent'); return; }
    const left = endsAt ? Math.max(0, endsAt - Date.now()) : 0;
    timer.textContent = `${Math.ceil(left / 1000)}초`;
    timer.classList.toggle('urgent', left <= 5000 && ['night', 'day', 'vote'].includes(g.phase));
    bar.style.width = `${Math.min(100, (left / (g.phaseSeconds * 1000)) * 100)}%`;
  }
  setInterval(tickTimer, 100);

  function showResult(winner, roles = secret?.roles) {
    $('#winnerTitle').textContent = winner === 'mafia' ? '🔪 마피아 승리!' : '🙌 시민 승리!';
    $('#resultReason').textContent = winner === 'mafia' ? '마피아 수가 시민 수만큼 많아져서 마을을 차지했어요.' : '마피아를 모두 찾아내서 마을을 지켰어요.';
    const list = $('#roleList'); list.replaceChildren();
    const order = ['mafia', 'doctor', 'police', 'citizen'];
    const entries = Object.entries(roles || {}).sort((a, b) => order.indexOf(a[1]) - order.indexOf(b[1]));
    for (const [id, role] of entries) {
      const p = playerById(id);
      const won = (winner === 'mafia') === (role === 'mafia');
      const li = document.createElement('li'); li.style.setProperty('--player', p?.color || '#999');
      const emoji = document.createElement('span'); emoji.textContent = ROLES[role].emoji;
      const name = document.createElement('b'); name.textContent = `${nameOf(id)}${id === me.userId ? ' (나)' : ''}`;
      const tag = document.createElement('strong'); tag.textContent = `${ROLES[role].name}${won ? ' 🏆' : ''}${p && !p.alive ? ' 👻' : ''}`;
      li.append(emoji, name, tag); list.append(li);
    }
    resultShown = true;
    const dialog = $('#resultDialog'); if (dialog.open) dialog.close(); dialog.showModal();
  }

  function addChat(message) {
    const p = document.createElement('p'); p.className = `${message.type || ''} mafia-chat-${message.audience || 'all'}`;
    if (message.color) p.style.setProperty('--player', message.color);
    const prefix = message.audience === 'mafia' ? '🔪 ' : message.audience === 'dead' ? '👻 ' : '';
    p.textContent = message.type === 'chat' ? `${prefix}${message.nickname}: ${message.text}` : `${prefix}${message.text}`;
    $('#chat').append(p); $('#chat').scrollTop = $('#chat').scrollHeight;
  }

  async function act(targetId) {
    try {
      const result = await emit('mafia:act', { targetId });
      if (result.investigation) {
        const { nickname, isMafia } = result.investigation;
        notice(`🔍 ${nickname}님은 ${isMafia ? '마피아예요! 🔪' : '마피아가 아니에요.'}`, isMafia ? 'error' : 'success');
        beep(isMafia ? [880, 440] : [523, 784], 0.12);
      }
    } catch (error) { notice(error.message, 'error'); }
  }
  async function vote(targetId) {
    try { await emit('mafia:vote', { targetId }); myVote = targetId; if (state) render(state); }
    catch (error) { notice(error.message, 'error'); }
  }

  socket.on('connect', () => emit('mafia:room:join', me).catch((error) => { sessionStorage.setItem('mafia:exitNotice', error.message); location.replace('/mafia'); }));
  socket.on('mafia:room:state', render);
  socket.on('mafia:secret', (data) => {
    if (secret?.gameId !== data.gameId && data.role) { beep([440, 554, 659], 0.12); }
    secret = data; if (state) render(state);
  });
  socket.on('mafia:chat:message', addChat);
  socket.on('mafia:chat:history', (messages) => { $('#chat').replaceChildren(); messages.forEach(addChat); });
  socket.on('mafia:game:finished', (data) => {
    beep(data.winner === 'mafia' ? [392, 330, 262, 196] : [523, 659, 784, 1046], 0.13);
    if (!resultShown) showResult(data.winner, data.roles);
  });
  socket.on('mafia:room:closed', (data) => { sessionStorage.setItem('mafia:exitNotice', data?.message || '방장이 방을 종료했습니다.'); location.replace('/mafia'); });

  $('#skipVote').onclick = () => vote('skip');
  $('#skipDay').onclick = () => emit('mafia:skip-day', {}).catch((e) => notice(e.message, 'error'));
  $('#ready').onclick = () => emit('mafia:room:ready', !playerById(me.userId)?.ready).catch((e) => notice(e.message, 'error'));
  const start = () => emit('mafia:game:start', {}).then(() => { if ($('#resultDialog').open) $('#resultDialog').close(); }).catch((e) => notice(e.message, 'error'));
  $('#start').onclick = start; $('#again').onclick = start;
  $('#closeResult').onclick = () => $('#resultDialog').close();
  $('#closeRoom').onclick = () => { if (confirm('정말 이 방을 종료할까요? 모든 참가자가 첫 화면으로 이동합니다.')) emit('mafia:room:close', {}).catch((e) => notice(e.message, 'error')); };
  $('#copyCode').onclick = async () => { try { await navigator.clipboard.writeText(code); notice('방 코드를 복사했습니다.', 'success'); } catch { notice(`방 코드: ${code}`, 'success'); } };
  async function chat() { const value = $('#chatInput').value; if (!value.trim()) return; try { await emit('mafia:chat:send', { text: value }); $('#chatInput').value = ''; } catch (e) { notice(e.message, 'error'); } }
  $('#chatSend').onclick = chat; $('#chatInput').onkeydown = (event) => { if (event.key === 'Enter' && !event.isComposing) chat(); };
  $('#leave').onclick = async () => { await emit('mafia:room:leave', {}).catch(() => {}); sessionStorage.setItem('mafia:exitNotice', '방에서 나왔습니다.'); location.href = '/mafia'; };
})();
