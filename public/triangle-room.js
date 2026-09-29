(() => {
  const $ = (s) => document.querySelector(s);
  const G = window.TriangleGeometry;
  const socket = io();
  const code = new URLSearchParams(location.search).get('code')?.toUpperCase();
  const me = { userId: localStorage.getItem('triangle:userId'), nickname: localStorage.getItem('triangle:nickname') || '', code };
  if (!code || !me.userId || !me.nickname) { location.replace('/triangle'); return; }
  $('#roomCode').textContent = code;

  const canvas = $('#board'); const ctx = canvas.getContext('2d');
  let state = null;           // 서버가 보내준 방 상태
  let selected = null;        // 내가 먼저 고른 점 번호
  let hover = null;           // 마우스/손가락이 올라간 점 번호
  let pointer = null;         // 판 위 포인터 위치(판 좌표)
  let dragFrom = null;        // 끌어서 긋기 시작한 점
  let sending = false;
  let turnEndsAt = null;
  const flashes = [];         // 방금 생긴 삼각형 반짝임 { tri, until }
  let lastEdge = null;
  let resultShown = false;     // 이번 판 순위 창을 이미 띄웠는지

  function emit(event, data) {
    return new Promise((resolve, reject) => socket.emit(event, data, (result) => result?.ok ? resolve(result) : reject(new Error(result?.message || '요청에 실패했습니다.'))));
  }
  function notice(message, type = '') {
    const el = $('#result'); el.textContent = message; el.className = `notice ${type}`; el.classList.toggle('hidden', !message);
    clearTimeout(notice.timer); if (message) notice.timer = setTimeout(() => el.classList.add('hidden'), 2600);
  }
  const playerById = (id) => state?.players.find((p) => p.userId === id);
  const colorOf = (id) => playerById(id)?.color || '#9aa0b5';
  const myTurn = () => state?.state === 'playing' && state.game?.turnUserId === me.userId;

  // ── 효과음: AudioContext는 하나만 만들어 재사용한다 ──
  let audio;
  function beep(freqs, length = 0.12) {
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

  // ── 화면 크기와 좌표 변환 ──
  function scale() { return canvas.width / G.BOARD_WIDTH; }
  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(width * (G.BOARD_HEIGHT / G.BOARD_WIDTH) * ratio);
    draw();
  }
  function toBoard(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width * G.BOARD_WIDTH, y: (event.clientY - rect.top) / rect.height * G.BOARD_HEIGHT };
  }
  function pointAt(pos) {
    const points = state?.game?.points; if (!points) return null;
    const rect = canvas.getBoundingClientRect();
    const reach = Math.max(22, 26 * G.BOARD_WIDTH / rect.width); // 손가락으로도 누르기 쉽게 화면 기준 26px
    let best = null; let bestDist = reach;
    points.forEach((p, i) => { const d = Math.hypot(p.x - pos.x, p.y - pos.y); if (d < bestDist) { best = i; bestDist = d; } });
    return best;
  }

  // ── 그리기 ──
  function draw() {
    const s = scale(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    const game = state?.game; if (!game) return;
    const { points, edges, triangles } = game; const now = performance.now();
    // 판이 작게 보이는 휴대폰에서도 점과 선이 화면 기준으로 너무 작아지지 않게 키운다.
    const zoom = Math.max(1, 0.55 / (canvas.clientWidth / G.BOARD_WIDTH || 1));

    for (const t of triangles) {
      const flash = flashes.find((f) => f.key === `${t.a}-${t.b}-${t.c}` && f.until > now);
      ctx.beginPath(); ctx.moveTo(points[t.a].x, points[t.a].y); ctx.lineTo(points[t.b].x, points[t.b].y); ctx.lineTo(points[t.c].x, points[t.c].y); ctx.closePath();
      ctx.globalAlpha = flash ? 0.45 + 0.4 * Math.abs(Math.sin((flash.until - now) / 90)) : 0.45;
      ctx.fillStyle = colorOf(t.by); ctx.fill(); ctx.globalAlpha = 1;
    }

    ctx.lineCap = 'round';
    for (const e of edges) {
      const isLast = lastEdge && G.edgeKey(e.a, e.b) === G.edgeKey(lastEdge.a, lastEdge.b);
      ctx.beginPath(); ctx.moveTo(points[e.a].x, points[e.a].y); ctx.lineTo(points[e.b].x, points[e.b].y);
      ctx.strokeStyle = isLast ? colorOf(e.by) : '#3a3f55'; ctx.lineWidth = (isLast ? 6 : 3.5) * zoom; ctx.stroke();
    }

    // 선택한 점에서 포인터까지 미리보기 선(그어도 되면 내 색, 안 되면 빨간 점선)
    const from = dragFrom ?? selected;
    if (myTurn() && from !== null && pointer) {
      const target = hover !== null && hover !== from ? points[hover] : pointer;
      const ok = hover !== null && hover !== from ? G.checkEdge(points, edges, from, hover).ok : true;
      ctx.beginPath(); ctx.moveTo(points[from].x, points[from].y); ctx.lineTo(target.x, target.y);
      ctx.setLineDash(ok ? [] : [12, 10]); ctx.strokeStyle = ok ? colorOf(me.userId) : '#e44545';
      ctx.globalAlpha = 0.7; ctx.lineWidth = 5 * zoom; ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }

    points.forEach((p, i) => {
      const active = i === from; const hot = i === hover && myTurn();
      ctx.beginPath(); ctx.arc(p.x, p.y, (active ? 14 : hot ? 12 : 9) * zoom, 0, Math.PI * 2);
      ctx.fillStyle = active ? colorOf(me.userId) : '#202331'; ctx.fill();
      ctx.lineWidth = 3 * zoom; ctx.strokeStyle = '#fff'; ctx.stroke();
    });

    if (flashes.some((f) => f.until > now)) requestAnimationFrame(draw);
  }

  // ── 조작: 점 두 개를 차례로 누르거나, 끌어서 잇기 ──
  async function tryMove(a, b) {
    if (sending) return;
    const check = G.checkEdge(state.game.points, state.game.edges, a, b);
    if (!check.ok) { notice(check.message, 'error'); beep([180], 0.15); return; }
    sending = true;
    try { await emit('tri:move', { a, b }); selected = null; }
    catch (error) { notice(error.message, 'error'); }
    finally { sending = false; dragFrom = null; draw(); }
  }
  canvas.addEventListener('pointerdown', (event) => {
    if (!myTurn()) return;
    pointer = toBoard(event); const hit = pointAt(pointer);
    if (hit === null) { selected = null; draw(); return; }
    if (selected !== null && hit !== selected) { tryMove(selected, hit); return; }
    selected = hit === selected ? null : hit; dragFrom = hit;
    canvas.setPointerCapture(event.pointerId); draw();
  });
  canvas.addEventListener('pointermove', (event) => {
    pointer = toBoard(event); const hit = pointAt(pointer);
    if (hit !== hover || myTurn()) { hover = hit; draw(); }
  });
  canvas.addEventListener('pointerup', (event) => {
    if (dragFrom === null) return;
    const hit = pointAt(toBoard(event)); const from = dragFrom; dragFrom = null;
    if (hit !== null && hit !== from) tryMove(from, hit); else draw();
  });
  canvas.addEventListener('pointerleave', () => { if (dragFrom === null) { pointer = null; hover = null; draw(); } });

  // ── 화면 갱신 ──
  function renderPlayers(room) {
    const root = $('#players'); root.replaceChildren();
    for (const p of room.players) {
      const row = document.createElement('div');
      row.className = `tri-player${room.game?.turnUserId === p.userId ? ' turn' : ''}${p.connected ? '' : ' offline'}`;
      row.style.setProperty('--player', p.color);
      const dot = document.createElement('i');
      const name = document.createElement('b'); name.textContent = `${p.isHost ? '👑 ' : ''}${p.nickname}${p.userId === me.userId ? ' (나)' : ''}`;
      const info = document.createElement('small');
      info.textContent = room.state === 'waiting' ? (p.isHost ? '방장' : p.ready ? '준비 완료 ✓' : '준비 중…') : p.connected ? `🔺 ${p.score}개` : `🔺 ${p.score}개 · 연결 끊김`;
      row.append(dot, name, info); root.append(row);
    }
  }
  function render(room) {
    const previousTurn = state?.game?.turnUserId;
    state = room;
    $('#roomTitle').textContent = room.title; document.title = `${room.title} · 그룹 게임 컬렉션-삼각형 땅따먹기`;
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
    $('#boardOverlay').classList.toggle('hidden', Boolean(game));
    $('#moveCount').textContent = game ? String(game.moveCount) : '0';
    turnEndsAt = game?.turnMsLeft != null ? Date.now() + game.turnMsLeft : null;
    if (room.state === 'waiting') {
      $('#statusLabel').textContent = '대기실'; $('#statusMessage').textContent = `모두 준비하면 방장이 시작해요! (최대 ${room.maxPlayers}명)`;
    } else if (room.state === 'playing') {
      resultShown = false;
      const turn = playerById(game.turnUserId);
      $('#statusLabel').textContent = myTurn() ? '내 차례!' : '차례';
      $('#statusMessage').textContent = myTurn() ? '점 두 개를 이어 선을 그으세요' : turn ? `${turn.nickname}님이 선을 고르는 중…` : '참가자를 기다리는 중…';
      $('#statusMessage').style.color = turn?.color || '';
      if (myTurn() && previousTurn !== me.userId) beep([660, 880], 0.09);
      if (!myTurn()) selected = null;
    } else {
      if (game?.ranking && !resultShown) showResult(game.ranking); // 끝난 방에 다시 들어와도 순위를 보여준다
      $('#statusLabel').textContent = '게임 끝'; $('#statusMessage').textContent = '최종 순위를 확인해 보세요!'; $('#statusMessage').style.color = '';
    }
    $('#boardHelp').classList.toggle('hidden', room.state !== 'playing');
    $('#boardWrap').classList.toggle('my-turn', myTurn());
    tickTimer(); draw();
  }
  function tickTimer() {
    if (state?.state !== 'playing') { $('#timer').textContent = '--'; return; }
    if (!state.turnTime) { $('#timer').textContent = '∞'; return; }
    const left = turnEndsAt ? Math.max(0, Math.ceil((turnEndsAt - Date.now()) / 1000)) : 0;
    $('#timer').textContent = `${left}초`; $('#timer').classList.toggle('urgent', left <= 5);
  }
  setInterval(tickTimer, 250);

  function showResult(ranking) {
    const root = $('#ranking'); root.replaceChildren();
    const medals = ['🥇', '🥈', '🥉'];
    for (const r of ranking) {
      const li = document.createElement('li'); li.style.setProperty('--player', r.color);
      const rank = document.createElement('span'); rank.textContent = medals[r.rank - 1] || `${r.rank}등`;
      const name = document.createElement('b'); name.textContent = r.nickname;
      const score = document.createElement('strong'); score.textContent = `🔺 ${r.score}개`;
      li.append(rank, name, score); root.append(li);
    }
    const winners = ranking.filter((r) => r.rank === 1).map((r) => r.nickname);
    $('#winnerTitle').textContent = winners.length > 1 ? `🤝 공동 우승: ${winners.join(', ')}` : `🏆 ${winners[0] || ''} 우승!`;
    resultShown = true;
    const dialog = $('#resultDialog'); if (dialog.open) dialog.close(); dialog.showModal();
  }

  function addChat(message) {
    const p = document.createElement('p'); p.className = message.type || '';
    if (message.type === 'land') p.style.setProperty('--player', message.color || colorOf(message.userId));
    p.textContent = message.type === 'chat' ? `${message.nickname}: ${message.text}` : message.text;
    $('#chat').append(p); $('#chat').scrollTop = $('#chat').scrollHeight;
  }

  socket.on('connect', () => emit('tri:room:join', me).catch((error) => { sessionStorage.setItem('triangle:exitNotice', error.message); location.replace('/triangle'); }));
  socket.on('tri:room:state', render);
  socket.on('tri:chat:message', addChat);
  socket.on('tri:chat:history', (messages) => { $('#chat').replaceChildren(); messages.forEach(addChat); });
  socket.on('tri:move:made', (data) => {
    lastEdge = data;
    const until = performance.now() + 900;
    for (const t of data.triangles) flashes.push({ key: `${t.a}-${t.b}-${t.c}`, until });
    while (flashes.length > 20) flashes.shift();
    if (data.triangles.length) beep(data.by === me.userId ? [523, 659, 784] : [392, 523], 0.1); else beep([440], 0.06);
  });
  socket.on('tri:game:finished', (data) => { beep([523, 659, 784, 1046], 0.13); showResult(data.ranking); });
  socket.on('tri:room:closed', (data) => { sessionStorage.setItem('triangle:exitNotice', data?.message || '방장이 방을 종료했습니다.'); location.replace('/triangle'); });

  $('#ready').onclick = () => emit('tri:room:ready', !playerById(me.userId)?.ready).catch((e) => notice(e.message, 'error'));
  const start = () => emit('tri:game:start', {}).then(() => { if ($('#resultDialog').open) $('#resultDialog').close(); }).catch((e) => notice(e.message, 'error'));
  $('#start').onclick = start; $('#again').onclick = start;
  $('#closeResult').onclick = () => $('#resultDialog').close();
  $('#closeRoom').onclick = () => { if (confirm('정말 이 방을 종료할까요? 모든 참가자가 첫 화면으로 이동합니다.')) emit('tri:room:close', {}).catch((e) => notice(e.message, 'error')); };
  $('#copyCode').onclick = async () => { try { await navigator.clipboard.writeText(code); notice('방 코드를 복사했습니다.', 'success'); } catch { notice(`방 코드: ${code}`, 'success'); } };
  async function chat() { const value = $('#chatInput').value; if (!value.trim()) return; try { await emit('tri:chat:send', { text: value }); $('#chatInput').value = ''; } catch (e) { notice(e.message, 'error'); } }
  $('#chatSend').onclick = chat; $('#chatInput').onkeydown = (event) => { if (event.key === 'Enter' && !event.isComposing) chat(); };
  $('#leave').onclick = async () => { await emit('tri:room:leave', {}).catch(() => {}); sessionStorage.setItem('triangle:exitNotice', '방에서 나왔습니다.'); location.href = '/triangle'; };

  new ResizeObserver(resize).observe($('#boardWrap')); resize();
})();
