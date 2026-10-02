(() => {
  const $ = (s) => document.querySelector(s);
  const { wordItem, beep, startsText } = window.WordChainUI;
  const socket = io();
  const code = new URLSearchParams(location.search).get('code')?.toUpperCase();
  const me = { userId: localStorage.getItem('wordchain:userId'), nickname: localStorage.getItem('wordchain:nickname') || '', code };
  if (!code || !me.userId || !me.nickname) { location.replace('/word-chain/lobby'); return; }
  $('#roomCode').textContent = code;

  let state = null;        // 서버가 보내준 방 상태
  let turnEndsAt = null;
  let sending = false;
  let resultShown = false;
  let shownWordCount = -1;

  function emit(event, data) {
    return new Promise((resolve, reject) => socket.emit(event, data, (result) => result?.ok ? resolve(result) : reject(new Error(result?.message || '요청에 실패했습니다.'))));
  }
  function notice(message, type = '') {
    const el = $('#result'); el.textContent = message; el.className = `notice ${type}`; el.classList.toggle('hidden', !message);
    clearTimeout(notice.timer); if (message) notice.timer = setTimeout(() => el.classList.add('hidden'), 3200);
  }
  const playerById = (id) => state?.players.find((p) => p.userId === id);
  const myTurn = () => state?.state === 'playing' && state.game?.turnUserId === me.userId;

  function renderPlayers(room) {
    const root = $('#players'); root.replaceChildren();
    for (const p of room.players) {
      const row = document.createElement('div');
      row.className = `wc-player${room.game?.turnUserId === p.userId ? ' turn' : ''}${p.connected ? '' : ' offline'}${room.state !== 'waiting' && !p.alive ? ' out' : ''}`;
      row.style.setProperty('--player', p.color);
      const dot = document.createElement('i');
      const name = document.createElement('b'); name.textContent = `${p.isHost ? '👑 ' : ''}${p.nickname}${p.userId === me.userId ? ' (나)' : ''}`;
      const info = document.createElement('small');
      if (room.state === 'waiting') info.textContent = p.isHost ? '방장' : p.ready ? '준비 완료 ✓' : '준비 중…';
      else info.textContent = `${p.alive ? '🔤' : '💀 탈락'} · 단어 ${p.score}개${p.connected ? '' : ' · 연결 끊김'}`;
      row.append(dot, name, info); root.append(row);
    }
  }

  function renderChain(game) {
    const words = game?.words || [];
    if (game?.wordCount === shownWordCount) return;
    shownWordCount = game?.wordCount ?? 0;
    $('#chain').replaceChildren(...words.map((w) => wordItem({ word: w.word, definition: w.definition, who: w.nickname, color: w.color, side: w.userId === me.userId ? 'mine' : 'other' })));
    $('#chain').scrollTop = $('#chain').scrollHeight;
  }

  function render(room) {
    const previousTurn = state?.game?.turnUserId;
    state = room;
    $('#roomTitle').textContent = room.title; document.title = `${room.title} · 그룹 게임 컬렉션-끝말잇기`;
    $('#dictBadge').textContent = `📖 ${room.dictionaryName}`;
    $('#playerCount').textContent = `${room.playerCount}/${room.maxPlayers}`;
    renderPlayers(room);
    const host = room.hostId === me.userId; const mine = playerById(me.userId);
    $('#start').classList.toggle('hidden', !host || room.state === 'playing');
    $('#start').textContent = room.state === 'finished' ? '↻ 새 게임 시작' : '▶ 게임 시작';
    $('#closeRoom').classList.toggle('hidden', !host || room.state === 'playing');
    $('#ready').classList.toggle('hidden', host || room.state === 'playing');
    $('#ready').textContent = mine?.ready ? '준비 취소' : '✓ 준비하기';
    $('#again').classList.toggle('hidden', !host);

    const game = room.game;
    $('#waiting').classList.toggle('hidden', Boolean(game));
    $('#chain').classList.toggle('hidden', !game);
    $('#wordCount').textContent = String(game?.wordCount ?? 0);
    turnEndsAt = game && !game.checking && game.turnMsLeft != null ? Date.now() + game.turnMsLeft : null;
    renderChain(game);
    const label = $('#statusLabel'); const message = $('#statusMessage');
    message.style.color = '';
    if (room.state === 'waiting') {
      label.textContent = '대기실'; message.textContent = `모두 준비하면 방장이 시작해요! (최대 ${room.maxPlayers}명)`;
    } else if (room.state === 'playing') {
      resultShown = false;
      const turn = playerById(game.turnUserId);
      const need = game.nextStarts ? `${startsText(game.nextStarts)}(으)로 시작` : '아무 단어로 시작 (한방단어 금지)';
      label.textContent = game.checking ? '📖 사전 확인 중…' : myTurn() ? '내 차례!' : turn ? `${turn.nickname}님 차례` : '참가자를 기다리는 중…';
      message.textContent = need; message.style.color = turn?.color || '';
      if (myTurn() && previousTurn !== me.userId) { beep([660, 880], 0.09); setTimeout(() => $('#word').focus(), 0); }
    } else {
      if (game?.ranking && !resultShown) showResult(game.ranking); // 끝난 방에 다시 들어와도 순위를 보여준다
      label.textContent = '게임 끝'; message.textContent = '최종 순위를 확인해 보세요!';
    }
    const canType = myTurn() && !game.checking && !sending;
    $('#word').disabled = !canType; $('#send').disabled = !canType;
    $('#word').placeholder = myTurn() ? '단어 입력 후 Enter' : '내 차례가 오면 입력할 수 있어요';
    $('#wordForm').classList.toggle('my-turn', myTurn());
    tickTimer();
  }

  function tickTimer() {
    const timer = $('#timer'); const bar = $('#timebar');
    if (state?.state !== 'playing') { timer.textContent = '--'; bar.style.width = '0%'; timer.classList.remove('urgent'); return; }
    const total = state.turnTime * 1000;
    const left = state.game.checking ? state.game.turnMsLeft ?? 0 : turnEndsAt ? Math.max(0, turnEndsAt - Date.now()) : 0;
    timer.textContent = `${Math.ceil(left / 1000)}초`;
    timer.classList.toggle('urgent', left <= 5000 && !state.game.checking);
    bar.style.width = `${Math.min(100, (left / total) * 100)}%`;
  }
  setInterval(tickTimer, 100);

  function showResult(ranking) {
    const root = $('#ranking'); root.replaceChildren();
    const medals = ['🥇', '🥈', '🥉'];
    for (const r of ranking) {
      const li = document.createElement('li'); li.style.setProperty('--player', r.color);
      const rank = document.createElement('span'); rank.textContent = medals[r.rank - 1] || `${r.rank}등`;
      const name = document.createElement('b'); name.textContent = r.nickname;
      const score = document.createElement('strong'); score.textContent = `단어 ${r.score}개`;
      li.append(rank, name, score); root.append(li);
    }
    const winners = ranking.filter((r) => r.rank === 1).map((r) => r.nickname);
    $('#winnerTitle').textContent = winners.length > 1 ? `🤝 공동 우승: ${winners.join(', ')}` : `🏆 ${winners[0] || ''} 우승!`;
    resultShown = true;
    const dialog = $('#resultDialog'); if (dialog.open) dialog.close(); dialog.showModal();
  }

  function addChat(message) {
    const p = document.createElement('p'); p.className = message.type || '';
    if (message.color) p.style.setProperty('--player', message.color);
    p.textContent = message.type === 'chat' ? `${message.nickname}: ${message.text}` : message.text;
    $('#chat').append(p); $('#chat').scrollTop = $('#chat').scrollHeight;
  }

  $('#wordForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const word = $('#word').value.replace(/\s/g, '');
    if (!word || sending || !myTurn()) return;
    sending = true; $('#send').disabled = true;
    try { await emit('wc:word', { word }); $('#word').value = ''; notice(''); }
    catch (error) { notice(error.message, 'error'); beep([180], 0.15); }
    finally { sending = false; if (state) render(state); }
  });

  socket.on('connect', () => emit('wc:room:join', me).catch((error) => { sessionStorage.setItem('wordchain:exitNotice', error.message); location.replace('/word-chain/lobby'); }));
  socket.on('wc:room:state', render);
  socket.on('wc:chat:message', addChat);
  socket.on('wc:chat:history', (messages) => { $('#chat').replaceChildren(); messages.forEach(addChat); });
  socket.on('wc:word:accepted', (data) => beep(data.userId === me.userId ? [523, 784] : [440, 523], 0.08));
  socket.on('wc:player:out', (data) => { beep([330, 220], 0.15); if (data.userId === me.userId) notice('💀 탈락했어요. 끝까지 구경해 보세요!', 'error'); });
  socket.on('wc:game:finished', (data) => { beep([523, 659, 784, 1046], 0.13); showResult(data.ranking); });
  socket.on('wc:room:closed', (data) => { sessionStorage.setItem('wordchain:exitNotice', data?.message || '방장이 방을 종료했습니다.'); location.replace('/word-chain/lobby'); });

  $('#ready').onclick = () => emit('wc:room:ready', !playerById(me.userId)?.ready).catch((e) => notice(e.message, 'error'));
  const start = () => emit('wc:game:start', {}).then(() => { shownWordCount = -1; if ($('#resultDialog').open) $('#resultDialog').close(); }).catch((e) => notice(e.message, 'error'));
  $('#start').onclick = start; $('#again').onclick = start;
  $('#closeResult').onclick = () => $('#resultDialog').close();
  $('#closeRoom').onclick = () => { if (confirm('정말 이 방을 종료할까요? 모든 참가자가 첫 화면으로 이동합니다.')) emit('wc:room:close', {}).catch((e) => notice(e.message, 'error')); };
  $('#copyCode').onclick = async () => { try { await navigator.clipboard.writeText(code); notice('방 코드를 복사했습니다.', 'success'); } catch { notice(`방 코드: ${code}`, 'success'); } };
  async function chat() { const value = $('#chatInput').value; if (!value.trim()) return; try { await emit('wc:chat:send', { text: value }); $('#chatInput').value = ''; } catch (e) { notice(e.message, 'error'); } }
  $('#chatSend').onclick = chat; $('#chatInput').onkeydown = (event) => { if (event.key === 'Enter' && !event.isComposing) chat(); };
  $('#leave').onclick = async () => { await emit('wc:room:leave', {}).catch(() => {}); sessionStorage.setItem('wordchain:exitNotice', '방에서 나왔습니다.'); location.href = '/word-chain/lobby'; };
})();
