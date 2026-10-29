(() => {
  const $ = (s) => document.querySelector(s);
  const D = window.RoachDraw;
  const socket = io();
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* 저장이 막혀도 게임은 계속 */ } }
  };
  const code = new URLSearchParams(location.search).get('code')?.toUpperCase();
  const me = { userId: store.get('roach:userId'), nickname: store.get('roach:nickname') || '', code };
  if (!code || !me.userId || !me.nickname) { location.replace('/roach'); return; }
  $('#roomCode').textContent = code;

  const REASON_TEXT = {
    caught: '인간이 바퀴벌레를 모두 잡았어요!', noRoaches: '바퀴벌레가 모두 나갔어요.',
    crumbs: '바퀴벌레가 부스러기 목표를 다 먹었어요!', time: '시간이 끝날 때까지 바퀴벌레가 살아남았어요!', noHumans: '인간이 모두 나갔어요.'
  };
  const autoHumans = (n) => (n >= 9 ? 3 : n >= 6 ? 2 : 1);
  const maxHumans = (n) => Math.max(1, Math.floor((n - 1) / 2));

  let state = null;        // 서버가 보낸 방 상태
  let lastResult = null;   // 마지막 게임 결과
  let inGame = false;      // 게임 화면을 보여 주는 중인가
  const playerById = (id) => state?.players.find((p) => p.userId === id);

  function emit(event, data) {
    return new Promise((resolve, reject) => socket.emit(event, data, (result) => result?.ok ? resolve(result) : reject(new Error(result?.message || '요청에 실패했습니다.'))));
  }
  function notice(message, type = '') {
    const el = $('#result'); el.textContent = message; el.className = `notice ${type}`; el.classList.toggle('hidden', !message);
    clearTimeout(notice.timer); if (message) notice.timer = setTimeout(() => el.classList.add('hidden'), 4000);
  }
  function toast(message, ms = 1800) {
    const el = $('#toast'); el.textContent = message; el.classList.remove('hidden');
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.add('hidden'), ms);
  }
  function banner(message, ms = 0) {
    const el = $('#banner'); el.textContent = message; el.classList.toggle('hidden', !message);
    clearTimeout(banner.timer); if (message && ms) banner.timer = setTimeout(() => el.classList.add('hidden'), ms);
  }

  // ── 소리(파일 없이 웹오디오로 합성) ──
  let audio; let soundOn = store.get('roach:sound') !== 'off';
  function updateSoundButton() { $('#sound').textContent = soundOn ? '🔊' : '🔇'; $('#sound').setAttribute('aria-label', soundOn ? '소리 끄기' : '소리 켜기'); }
  updateSoundButton();
  $('#sound').onclick = () => { soundOn = !soundOn; store.set('roach:sound', soundOn ? 'on' : 'off'); updateSoundButton(); };
  function tone(freqs, length = 0.08, type = 'triangle', volume = 0.12) {
    if (!soundOn) return;
    try {
      audio ||= new AudioContext();
      freqs.forEach((freq, i) => {
        const osc = audio.createOscillator(); const gain = audio.createGain(); const at = audio.currentTime + i * length;
        osc.frequency.value = freq; osc.type = type;
        gain.gain.setValueAtTime(volume, at); gain.gain.exponentialRampToValueAtTime(0.001, at + length);
        osc.connect(gain).connect(audio.destination); osc.start(at); osc.stop(at + length);
      });
    } catch { /* 소리가 안 나도 게임은 계속 */ }
  }
  function noise(length = 0.15, volume = 0.15, freq = 1200) {
    if (!soundOn) return;
    try {
      audio ||= new AudioContext();
      const buffer = audio.createBuffer(1, Math.floor(audio.sampleRate * length), audio.sampleRate);
      const data = buffer.getChannelData(0); for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = audio.createBufferSource(); const filter = audio.createBiquadFilter(); const gain = audio.createGain();
      src.buffer = buffer; filter.type = 'bandpass'; filter.frequency.value = freq; gain.gain.value = volume;
      src.connect(filter).connect(gain).connect(audio.destination); src.start();
    } catch { /* 소리가 안 나도 게임은 계속 */ }
  }

  // ════════════ 대기실 ════════════
  function renderPlayers(room) {
    const root = $('#players'); root.replaceChildren();
    room.players.forEach((p) => {
      const row = document.createElement('div');
      row.className = `wc-player${p.connected ? '' : ' offline'}`;
      row.style.setProperty('--player', p.color);
      const dot = document.createElement('i'); dot.textContent = p.role === 'human' ? '🧑' : p.role === 'roach' ? '🪳' : '';
      const name = document.createElement('b'); name.textContent = `${p.isHost ? '👑 ' : ''}${p.nickname}${p.userId === me.userId ? ' (나)' : ''}`;
      const info = document.createElement('small');
      const parts = [];
      if (room.state === 'playing') {
        parts.push(p.role === 'human' ? `인간 · 잡은 수 ${p.catches}` : `바퀴 · 먹은 ${p.eaten}${p.alive ? '' : ' · 잡힘'}`);
      } else {
        parts.push(p.isHost ? '방장' : p.ready ? '준비 완료 ✓' : '준비 중…');
        if (p.role) parts.push(`지난 판 ${p.role === 'human' ? '🧑 인간' : '🪳 바퀴'}`);
      }
      if (!p.connected) parts.push('연결 끊김');
      info.textContent = parts.join(' · ');
      row.append(dot, name, info); root.append(row);
    });
  }
  function renderSettings(room) {
    const host = room.hostId === me.userId; const open = room.state !== 'playing';
    $('#hostSettings').classList.toggle('hidden', !host || !open);
    $('#minutesLabel').textContent = `${room.minutes}분`;
    const n = room.playerCount;
    $('#humansLabel').textContent = room.humans ? `${Math.min(room.humans, maxHumans(n))}명` : `자동 ${autoHumans(n)}명`;
    if (!host) return;
    $('#setMinutes').value = String(room.minutes);
    const select = $('#setHumans');
    const options = [[0, `자동 (${autoHumans(n)}명)`], ...[1, 2, 3, 4, 5].map((k) => [k, `${k}명${k > maxHumans(n) ? ' (인원 부족)' : ''}`])];
    if (select.options.length !== options.length || select.options[0].textContent !== options[0][1]) {
      select.replaceChildren(...options.map(([value, label]) => { const o = document.createElement('option'); o.value = String(value); o.textContent = label; return o; }));
    }
    options.forEach(([value, label], i) => { select.options[i].textContent = label; select.options[i].disabled = value > maxHumans(n); });
    select.value = String(room.humans);
  }
  function renderLastResult() {
    const box = $('#lastResult');
    box.classList.toggle('hidden', !lastResult);
    if (!lastResult) return;
    box.textContent = `지난 판: ${lastResult.winner === 'humans' ? '🧑 인간 팀 승리!' : '🪳 바퀴벌레 팀 승리!'} ${REASON_TEXT[lastResult.reason] || ''} (🍞 ${lastResult.score}/${lastResult.goal})`;
    box.dataset.winner = lastResult.winner;
  }

  function render(room) {
    const wasPlaying = state?.state === 'playing';
    state = room;
    $('#roomTitle').textContent = room.title; document.title = `${room.title} · 그룹 게임 컬렉션-인간 vs 바퀴벌레`;
    $('#playerCount').textContent = `${room.playerCount}/${room.maxPlayers}`;
    const g = room.game;
    $('#teamBadge').textContent = g ? `🧑 ${g.humans} vs 🪳 ${g.aliveRoaches}/${g.roaches}` : `👥 ${room.playerCount}명`;
    renderPlayers(room); renderSettings(room);
    if (!lastResult && room.state === 'finished' && g?.winner) lastResult = { winner: g.winner, reason: g.reason, score: g.score, goal: g.goal };
    renderLastResult();
    const host = room.hostId === me.userId; const mine = playerById(me.userId);
    $('#start').classList.toggle('hidden', !host || room.state === 'playing');
    $('#start').textContent = room.state === 'finished' ? '↻ 한 판 더' : '▶ 게임 시작';
    $('#closeRoom').classList.toggle('hidden', !host || room.state === 'playing');
    $('#ready').classList.toggle('hidden', host || room.state === 'playing');
    $('#ready').textContent = mine?.ready ? '준비 취소' : '✓ 준비하기';
    $('#again').classList.toggle('hidden', !host);
    $('#statusLabel').textContent = room.state === 'playing' ? '🎮 게임 중' : room.state === 'finished' ? '게임 끝' : '대기실';
    $('#statusMessage').textContent = room.state === 'playing' ? '게임이 진행 중이에요'
      : room.state === 'finished' && lastResult ? (lastResult.winner === 'humans' ? '🧑 인간 팀 승리!' : '🪳 바퀴벌레 팀 승리!')
        : `모두 준비하면 방장이 시작해요! (3~${room.maxPlayers}명)`;
    const chatOff = room.state === 'playing';
    $('#chatInput').disabled = chatOff; $('#chatSend').disabled = chatOff;
    $('#chatInput').placeholder = chatOff ? '게임 중에는 채팅할 수 없어요' : '메시지 입력…';
    if (room.state === 'playing' && !wasPlaying && !game) banner('판을 불러오는 중…');
    updateView();
  }
  function updateView() {
    const show = inGame && Boolean(game);
    $('#gameView').classList.toggle('hidden', !show);
    $('#lobbyView').classList.toggle('hidden', show);
    document.body.classList.toggle('roach-in-game', show);
    if (show) resize();
  }

  function addChat(message) {
    const p = document.createElement('p'); p.className = message.type || '';
    if (message.color) p.style.setProperty('--player', message.color);
    p.textContent = message.type === 'chat' ? `${message.nickname}: ${message.text}` : message.text;
    $('#chat').append(p); $('#chat').scrollTop = $('#chat').scrollHeight;
  }

  function showResult(data) {
    lastResult = data;
    const humansWon = data.winner === 'humans';
    const mine = data.stats.find((s) => s.userId === me.userId);
    const iWon = mine && ((mine.role === 'human') === humansWon);
    $('#winnerTitle').textContent = `${humansWon ? '🧑 인간 팀 승리!' : '🪳 바퀴벌레 팀 승리!'}${mine ? (iWon ? ' 🏆' : '') : ''}`;
    $('#resultReason').textContent = `${REASON_TEXT[data.reason] || ''} 🍞 바퀴 팀 점수 ${data.score}/${data.goal}`;
    const list = $('#statList'); list.replaceChildren();
    const sorted = [...data.stats].sort((a, b) => (a.role === b.role ? (b.catches + b.eaten) - (a.catches + a.eaten) : a.role === 'human' ? -1 : 1));
    for (const s of sorted) {
      const li = document.createElement('li'); li.style.setProperty('--player', state?.roster.find((r) => r.userId === s.userId)?.color || '#999');
      const emoji = document.createElement('span'); emoji.textContent = s.role === 'human' ? '🧑' : s.alive ? '🪳' : '💀';
      const name = document.createElement('b'); name.textContent = `${s.nickname || '나간 사람'}${s.userId === me.userId ? ' (나)' : ''}${s.gone ? ' · 나감' : ''}`;
      const tag = document.createElement('strong'); tag.textContent = s.role === 'human' ? `🩴 ${s.catches}마리 잡음` : `🍞 ${s.eaten}점${s.alive ? ' · 생존' : ''}`;
      li.append(emoji, name, tag); list.append(li);
    }
    const dialog = $('#resultDialog'); if (dialog.open) dialog.close(); dialog.showModal();
    renderLastResult();
  }
  function backToLobby() { inGame = false; game = null; banner(''); stopInput(); updateView(); if (state) render(state); }

  // ════════════ 게임 ════════════
  const canvas = $('#arena'); const ctx = canvas.getContext('2d');
  const mini = $('#minimap'); const mctx = mini.getContext('2d');
  let game = null;           // { gameId, map, rules, baked, bakeScale, tickMs }
  const bodies = new Map();  // 번호 → { x, y, a, px, py, pa, flags, at, seen }
  let crumbs = [];
  let self = null;           // 서버가 알려 준 내 정보(쿨타임·숨은 시간)
  let hud = { phase: 'countdown', left: 0, at: 0, score: 0, goal: 1 };
  let tickGap = 50; let lastTickAt = 0;
  const effects = [];        // { kind, n, a, x, y, at, seed }
  const splats = [];         // { x, y, at }
  const floats = [];         // { x, y, text, at }
  let camera = { x: 800, y: 500, zoom: 1 };
  let lastPhase = null;

  const rosterOf = (n) => state?.roster.find((r) => r.n === n);
  const myN = () => self?.n;
  const isHuman = () => self?.role === 'human';

  function applyPlayers(list, now) {
    const seen = new Set();
    for (const [n, x, y, a, flags] of list) {
      seen.add(n);
      const b = bodies.get(n);
      if (!b) bodies.set(n, { x, y, a, px: x, py: y, pa: a, flags, at: now });
      else {
        const cur = interp(b, now);
        // 멀리 순간이동(부활·쫓겨남)이면 미끄러지지 않고 바로 옮긴다.
        const jump = Math.hypot(x - cur.x, y - cur.y) > 80;
        Object.assign(b, { px: jump ? x : cur.x, py: jump ? y : cur.y, pa: cur.a, x, y, a, flags, at: now });
      }
    }
    for (const n of [...bodies.keys()]) if (!seen.has(n)) bodies.delete(n);
  }
  function interp(b, now) {
    const t = Math.min(1, (now - b.at) / tickGap);
    let da = b.a - b.pa; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
    return { x: b.px + (b.x - b.px) * t, y: b.py + (b.y - b.py) * t, a: b.pa + da * Math.min(1, t * 1.5) };
  }

  function onSnapshot(snap) {
    const scale = Math.min(2, Math.max(1, (window.devicePixelRatio || 1) * 1.1));
    if (!game || game.gameId !== snap.gameId) {
      splats.length = 0; effects.length = 0; floats.length = 0; bodies.clear(); lastPhase = null;
    }
    game = { gameId: snap.gameId, map: snap.map, rules: snap.rules, tickMs: snap.tickMs, baked: D.bakeMap(snap.map, scale) };
    tickGap = snap.tickMs; crumbs = snap.crumbs; self = snap.me;
    hud = { phase: snap.phase, left: snap.left, at: performance.now(), score: snap.score, goal: snap.goal };
    applyPlayers(snap.p, performance.now());
    if ($('#resultDialog').open) $('#resultDialog').close();
    inGame = true; banner(''); updateView(); updateHud();
    const role = self?.role === 'human' ? '🧑 인간' : '🪳 바퀴벌레';
    if (snap.phase === 'countdown') toast(`나는 ${role}! ${self?.role === 'human' ? '바퀴벌레를 모두 잡으세요!' : '숨고, 먹고, 살아남으세요!'}`, 3000);
  }

  function onTick(data) {
    if (!game) return;
    const now = performance.now();
    if (lastTickAt) tickGap = tickGap * 0.85 + Math.min(200, now - lastTickAt) * 0.15;
    lastTickAt = now;
    applyPlayers(data.p, now);
    if (data.c) crumbs = data.c;
    const wasAlive = self?.alive;
    self = data.me;
    hud = { phase: data.phase, left: data.left, at: now, score: data.score, goal: data.goal };
    if (self && wasAlive && !self.alive) { banner('💀 잡혔어요! 이제 관전해요 (팀 점수 10점마다 🥚 부활)'); }
    if (self && self.alive && wasAlive === false) banner('');
    for (const e of data.ev || []) handleEvent(e, now);
    if (data.phase !== lastPhase) {
      if (data.phase === 'play' && lastPhase === 'countdown') { banner('시작!', 900); tone([523, 784], 0.12); }
      lastPhase = data.phase;
    }
    updateHud();
  }

  function handleEvent(e, now) {
    const mine = e.n === myN();
    const nearMe = (n) => { const b = bodies.get(n); return !b || Math.hypot(b.x - camera.x, b.y - camera.y) < 700; };
    if (e.k === 'slip') { effects.push({ kind: 'slip', n: e.n, a: e.a, at: now }); if (nearMe(e.n)) noise(0.08, mine ? 0.25 : 0.12, 500); }
    else if (e.k === 'spray') { effects.push({ kind: 'spray', n: e.n, a: e.a, at: now, seed: Math.floor(Math.random() * 1000) }); if (nearMe(e.n)) noise(0.45, mine ? 0.18 : 0.08, 3000); }
    else if (e.k === 'squash') {
      splats.push({ x: e.x, y: e.y, at: now }); tone([160, 90], 0.09, 'square', 0.12);
      const who = rosterOf(e.n)?.nickname || '바퀴벌레';
      if (e.by === myN()) { toast(`🩴 철썩! ${who} 잡았다!`); floats.push({ x: e.x, y: e.y - 20, text: '잡았다!', at: now }); }
      else if (!mine) toast(`🩴 ${who}님이 잡혔어요!`);
    } else if (e.k === 'slow') { if (mine) { toast('🧴 스프레이에 맞았어요! 2초 동안 느려져요'); tone([300, 200], 0.1, 'sawtooth', 0.06); } }
    else if (e.k === 'eat') {
      if (mine) { tone(e.v > 1 ? [784, 988, 1318] : [880], 0.06, 'square', 0.06); floats.push({ x: e.x, y: e.y - 10, text: `+${e.v}`, at: now }); }
    } else if (e.k === 'kick') { if (mine) { toast('⏰ 너무 오래 숨었어요! 가구 밖으로 쫓겨났어요', 2200); tone([600, 300], 0.1, 'triangle', 0.1); } }
    else if (e.k === 'revive') {
      if (mine) { banner('🥚 알에서 다시 태어났어요! (2초 무적)', 2000); tone([523, 659, 784], 0.1); }
      else toast(`🥚 ${rosterOf(e.n)?.nickname || '바퀴벌레'}님이 알에서 부활했어요!`);
    }
  }

  function fmt(sec) { const s = Math.max(0, Math.ceil(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  function updateHud() {
    if (!game || !self) return;
    const dead = !self.alive;
    $('#roleBadge').textContent = dead ? '👻 관전 중' : self.role === 'human' ? '🧑 인간' : '🪳 바퀴벌레';
    $('#roleBadge').dataset.role = dead ? 'dead' : self.role;
    $('#scoreText').textContent = `${hud.score}/${hud.goal}`;
    $('#scoreBar').style.width = `${Math.min(100, (hud.score / Math.max(1, hud.goal)) * 100)}%`;
    const g = state?.game;
    $('#aliveText').textContent = g ? `🪳 ${g.aliveRoaches}/${g.roaches}마리 살아 있음` : '';
    $('#actions').classList.toggle('hidden', !(self.role === 'human'));
    for (const [id, key, total] of [['#btnSlipper', 'slipper', game.rules.slipper.cooldown], ['#btnSpray', 'spray', game.rules.spray.cooldown]]) {
      const wait = self[key] || 0;
      $(id).querySelector('i').style.height = `${Math.min(100, (wait / total) * 100)}%`;
      $(id).classList.toggle('cooling', wait > 0);
    }
    const hiding = self.alive && self.hidden && self.hideLeft != null;
    $('#hideMeter').classList.toggle('hidden', !hiding);
    if (hiding) {
      $('#hideBar').style.width = `${(self.hideLeft / game.rules.hideLimit) * 100}%`;
      $('#hideMeter').classList.toggle('urgent', self.hideLeft < 3);
      $('#hideMeter span').textContent = `🛋️ 숨는 중 · ${Math.ceil(self.hideLeft)}초 뒤 쫓겨나요`;
    }
  }

  // ── 그리기 ──
  let pixelRatio = 1;
  function resize() {
    pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth || innerWidth; const h = canvas.clientHeight || innerHeight;
    canvas.width = Math.round(w * pixelRatio); canvas.height = Math.round(h * pixelRatio);
  }
  addEventListener('resize', () => { if (inGame) resize(); });

  function myPosition(now) {
    const b = bodies.get(myN()); return b ? interp(b, now) : null;
  }
  function frame(nowMs) {
    requestAnimationFrame(frame);
    if (!inGame || !game) return;
    const now = performance.now(); const t = nowMs / 1000;
    const W = canvas.width / pixelRatio; const H = canvas.height / pixelRatio;
    const { map } = game;
    const mine = myPosition(now);
    const spectating = !self?.alive || !mine;
    const zoom = spectating ? Math.min(W / map.w, H / map.h) * 0.98 : Math.max(0.45, Math.min(1.6, Math.sqrt(W * H) / 750));
    const viewW = W / zoom; const viewH = H / zoom;
    let cx = spectating ? map.w / 2 : mine.x; let cy = spectating ? map.h / 2 : mine.y;
    cx = viewW >= map.w ? map.w / 2 : Math.max(viewW / 2, Math.min(map.w - viewW / 2, cx));
    cy = viewH >= map.h ? map.h / 2 : Math.max(viewH / 2, Math.min(map.h - viewH / 2, cy));
    camera = { x: cx, y: cy, zoom };

    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.fillStyle = '#2b211b'; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(pixelRatio * zoom, 0, 0, pixelRatio * zoom, pixelRatio * (W / 2 - cx * zoom), pixelRatio * (H / 2 - cy * zoom));
    ctx.drawImage(game.baked, 0, 0, map.w, map.h);

    for (let i = splats.length - 1; i >= 0; i -= 1) {
      const life = 1 - (now - splats[i].at) / 6000; if (life <= 0) { splats.splice(i, 1); continue; }
      D.splat(ctx, splats[i].x, splats[i].y, life * 1.5);
    }
    for (const [, x, y, v] of crumbs) D.crumb(ctx, x, y, v, t);

    // 캐릭터: 숨지 않은 바퀴 → 인간 → 가구 → (바퀴 화면이면) 숨은 바퀴를 반투명으로 위에
    const list = [...bodies.entries()].map(([n, b]) => ({ n, b, pos: interp(b, now), info: rosterOf(n) }));
    const swingOf = (n) => { const e = effects.findLast((f) => f.kind === 'slip' && f.n === n); return e ? Math.min(1, (now - e.at) / 180) : 0; };
    const sprayingOf = (n) => effects.some((f) => f.kind === 'spray' && f.n === n && now - f.at < 600);
    const drawOne = ({ n, b, pos, info }, alpha) => {
      const flags = b.flags; const isMe = n === myN();
      const blink = (flags & 8) && Math.floor(t * 8) % 2 ? 0.45 : 1;
      if (info?.role === 'human') {
        const sw = swingOf(n);
        D.human(ctx, pos.x, pos.y, pos.a, t, { color: info.color, moving: Boolean(flags & 4), swing: sw > 0 && sw < 1 ? sw : 0, spray: sprayingOf(n), ring: isMe ? '#fde047' : null });
        D.nameTag(ctx, pos.x, pos.y - 34, `${isMe ? '⭐ ' : ''}${info?.nickname || ''}${flags & 16 ? ' (연결 끊김)' : ''}`, info?.color, isMe);
      } else {
        D.roach(ctx, pos.x, pos.y, pos.a, t, { moving: Boolean(flags & 4), slowed: Boolean(flags & 2), seed: n * 1.7, alpha: alpha * blink, ring: isMe ? '#fde047' : null });
        D.nameTag(ctx, pos.x, pos.y - 18, `${isMe ? '⭐ ' : ''}${info?.nickname || ''}${flags & 2 ? ' 💨' : ''}`, info?.color, isMe);
      }
    };
    for (const item of list) if (item.info?.role !== 'human' && !(item.b.flags & 1)) drawOne(item, 1);
    for (const item of list) if (item.info?.role === 'human') drawOne(item, 1);
    for (const f of map.furniture) D.furniture(ctx, f);
    for (const item of list) if (item.info?.role !== 'human' && (item.b.flags & 1)) drawOne(item, 0.55); // 인간에게는 오지도 않음

    for (let i = effects.length - 1; i >= 0; i -= 1) {
      const e = effects[i]; const age = now - e.at; const life = 1 - age / (e.kind === 'spray' ? 700 : 300);
      if (life <= 0) { effects.splice(i, 1); continue; }
      const b = bodies.get(e.n); if (!b) continue; const p = interp(b, now);
      if (e.kind === 'slip' && age > 90) D.slipperHit(ctx, p.x, p.y, e.a, life, game.rules);
      if (e.kind === 'spray') D.sprayCloud(ctx, p.x, p.y, e.a, life, game.rules, e.seed);
    }
    for (let i = floats.length - 1; i >= 0; i -= 1) {
      const f = floats[i]; const age = (now - f.at) / 1000; if (age > 1) { floats.splice(i, 1); continue; }
      ctx.save(); ctx.globalAlpha = 1 - age; ctx.font = '900 18px sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.strokeText(f.text, f.x, f.y - age * 30); ctx.fillStyle = '#16a34a'; ctx.fillText(f.text, f.x, f.y - age * 30);
      ctx.restore();
    }
    // 조이스틱
    if (stick && stick.active) {
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      const r = canvas.getBoundingClientRect();
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(stick.x - r.left, stick.y - r.top, 56, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(stick.hx - r.left, stick.hy - r.top, 24, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
    // 남은 시간(서버 값을 받은 뒤 흐른 만큼 빼서 부드럽게)
    const left = Math.max(0, hud.left - (now - hud.at) / 1000);
    if (hud.phase === 'countdown') { $('#gameTimer').textContent = fmt(left); banner(`${Math.max(1, Math.ceil(left))}`); }
    else if (hud.phase === 'play') {
      $('#gameTimer').textContent = fmt(left);
      if ($('#banner').textContent.length === 1) banner('');
    }
    $('#gameTimer').classList.toggle('urgent', hud.phase === 'play' && left <= 15);
    drawMinimap(list);
  }
  requestAnimationFrame(frame);

  function drawMinimap(list) {
    const { map } = game; const s = mini.width / map.w;
    mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.clearRect(0, 0, mini.width, mini.height);
    mctx.fillStyle = '#e8d8c4'; mctx.fillRect(0, 0, mini.width, mini.height);
    mctx.setTransform(s, 0, 0, s, 0, 0);
    mctx.fillStyle = '#5b4636'; for (const w of map.walls) mctx.fillRect(w.x, w.y, w.w, w.h);
    for (const f of map.furniture) { mctx.fillStyle = f.hide ? '#a0784e' : '#8a8f98'; mctx.fillRect(f.x, f.y, f.w, f.h); }
    mctx.fillStyle = '#eab308'; for (const [, x, y] of crumbs) mctx.fillRect(x - 8, y - 8, 16, 16);
    for (const { n, pos, info } of list) {
      const isMe = n === myN();
      mctx.fillStyle = isMe ? '#facc15' : info?.role === 'human' ? '#ef4444' : '#6b3a1a';
      mctx.beginPath(); mctx.arc(pos.x, pos.y, isMe ? 40 : info?.role === 'human' ? 32 : 22, 0, Math.PI * 2); mctx.fill();
      if (isMe) { mctx.strokeStyle = '#000'; mctx.lineWidth = 10; mctx.stroke(); }
    }
    mctx.strokeStyle = '#ffffffaa'; mctx.lineWidth = 8;
    mctx.strokeRect(camera.x - canvas.width / pixelRatio / camera.zoom / 2, camera.y - canvas.height / pixelRatio / camera.zoom / 2, canvas.width / pixelRatio / camera.zoom, canvas.height / pixelRatio / camera.zoom);
  }

  // ── 조작: 방향(각도)·움직일지·공격만 서버에 보낸다 ──
  const keys = new Set();
  let control = 'keys'; let mouse = null; let stick = null;
  let want = { angle: 0, move: false }; let sent = { angle: NaN, move: null }; let lastSendAt = 0;
  function canControl() { return inGame && game && self?.alive && hud.phase !== 'over'; }
  function keyDir() {
    let dx = 0; let dy = 0;
    if (keys.has('arrowleft') || keys.has('a')) dx -= 1; if (keys.has('arrowright') || keys.has('d')) dx += 1;
    if (keys.has('arrowup') || keys.has('w')) dy -= 1; if (keys.has('arrowdown') || keys.has('s')) dy += 1;
    return dx || dy ? Math.atan2(dy, dx) : null;
  }
  function updateWant() {
    if (control === 'keys') { const a = keyDir(); want = a == null ? { angle: want.angle, move: false } : { angle: a, move: true }; }
    else if (control === 'mouse' && mouse) {
      const p = myPosition(performance.now()); if (!p) return;
      const r = canvas.getBoundingClientRect();
      const sx = (p.x - camera.x) * camera.zoom + r.width / 2 + r.left; const sy = (p.y - camera.y) * camera.zoom + r.height / 2 + r.top;
      const dx = mouse.x - sx; const dy = mouse.y - sy; const d = Math.hypot(dx, dy);
      if (d > 6) want = { angle: Math.atan2(dy, dx), move: mouse.inside && d > 34 };
      else want = { angle: want.angle, move: false };
    }
  }
  function stopInput() { keys.clear(); stick = null; want = { angle: want.angle, move: false }; }
  setInterval(() => {
    if (!canControl()) return;
    updateWant(); // 마우스가 가만히 있어도 내가 움직이면 방향이 바뀐다
    const now = performance.now();
    const changed = want.move !== sent.move || Math.abs(want.angle - sent.angle) > 0.03;
    if (!changed && now - lastSendAt < 1000) return;
    socket.emit('roach:input', { angle: Math.round(want.angle * 1000) / 1000, move: want.move });
    sent = { ...want }; lastSendAt = now;
  }, 50);

  async function attack(type) {
    if (!canControl() || !isHuman()) return;
    if ((self[type] || 0) > 0.05) { if (type === 'spray') toast(`🧴 스프레이 채우는 중… ${Math.ceil(self.spray)}초`, 900); return; }
    // 공격 직전 방향을 먼저 보내서 서버가 지금 보는 방향으로 판정하게 한다.
    updateWant(); socket.emit('roach:input', { angle: Math.round(want.angle * 1000) / 1000, move: want.move }); sent = { ...want };
    try { await emit('roach:action', { type }); }
    catch (error) { if (!/드는 중|채우는 중/.test(error.message)) toast(error.message, 1200); }
  }

  const GAME_KEYS = new Set(['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'w', 'a', 's', 'd', ' ']);
  addEventListener('keydown', (e) => {
    if (!inGame || e.target.closest?.('input, textarea, select, dialog')) return;
    const key = e.key.toLowerCase();
    if (key === ' ' || e.code === 'Space') { e.preventDefault(); if (!e.repeat) attack('slipper'); return; }
    if (key === 'shift' || key === 'e') { if (!e.repeat) attack('spray'); return; }
    if (GAME_KEYS.has(key)) { e.preventDefault(); keys.add(key); control = 'keys'; }
  });
  addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); });
  addEventListener('blur', stopInput);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stopInput(); control = 'keys'; } });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') { mouse = { x: e.clientX, y: e.clientY, inside: true }; if (!keyDir()) control = 'mouse'; return; }
    if (!stick || stick.id !== e.pointerId) return;
    const dx = e.clientX - stick.x; const dy = e.clientY - stick.y; const len = Math.hypot(dx, dy);
    if (len > 56) { stick.x = e.clientX - dx / len * 56; stick.y = e.clientY - dy / len * 56; }
    stick.hx = e.clientX; stick.hy = e.clientY; stick.active = true;
    if (len > 10) want = { angle: Math.atan2(dy, dx), move: true };
  });
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && mouse) mouse.inside = false; });
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') { if (e.button === 0) attack('slipper'); return; }
    if (stick) return;
    control = 'stick'; stick = { id: e.pointerId, x: e.clientX, y: e.clientY, hx: e.clientX, hy: e.clientY, active: true };
    canvas.setPointerCapture?.(e.pointerId);
  });
  for (const type of ['pointerup', 'pointercancel']) {
    canvas.addEventListener(type, (e) => { if (stick && stick.id === e.pointerId) { stick = null; want = { angle: want.angle, move: false }; } });
  }
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  for (const [id, type] of [['#btnSlipper', 'slipper'], ['#btnSpray', 'spray']]) {
    $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); attack(type); });
  }

  // ════════════ 소켓 ════════════
  socket.on('connect', () => emit('roach:room:join', me).catch((error) => { sessionStorage.setItem('roach:exitNotice', error.message); location.replace('/roach'); }));
  socket.on('roach:room:state', render);
  socket.on('roach:snapshot', onSnapshot);
  socket.on('roach:tick', onTick);
  socket.on('roach:chat:message', addChat);
  socket.on('roach:chat:history', (messages) => { $('#chat').replaceChildren(); messages.forEach(addChat); });
  socket.on('roach:game:finished', (data) => {
    stopInput();
    const humansWon = data.winner === 'humans';
    const mineStat = data.stats.find((s) => s.userId === me.userId);
    const iWon = mineStat && ((mineStat.role === 'human') === humansWon);
    tone(iWon ? [523, 659, 784, 1046] : [392, 330, 262, 196], 0.13);
    banner(humansWon ? '🧑 인간 팀 승리!' : '🪳 바퀴벌레 팀 승리!');
    setTimeout(() => showResult(data), inGame ? 1200 : 0);
  });
  socket.on('roach:room:closed', (data) => { sessionStorage.setItem('roach:exitNotice', data?.message || '방장이 방을 종료했습니다.'); location.replace('/roach'); });
  socket.on('disconnect', () => { if (inGame) banner('연결이 끊겼어요. 다시 연결하는 중…'); });

  // ════════════ 단추 ════════════
  $('#ready').onclick = () => emit('roach:room:ready', !playerById(me.userId)?.ready).catch((e) => notice(e.message, 'error'));
  const start = () => emit('roach:game:start', {}).then(() => { if ($('#resultDialog').open) $('#resultDialog').close(); }).catch((e) => notice(e.message, 'error'));
  $('#start').onclick = start;
  $('#again').onclick = () => { $('#resultDialog').close(); backToLobby(); start(); };
  $('#closeResult').onclick = () => $('#resultDialog').close();
  $('#resultDialog').addEventListener('close', () => { if (state?.state !== 'playing') backToLobby(); });
  $('#setMinutes').onchange = () => emit('roach:room:settings', { minutes: Number($('#setMinutes').value) }).catch((e) => notice(e.message, 'error'));
  $('#setHumans').onchange = () => emit('roach:room:settings', { humans: Number($('#setHumans').value) }).catch((e) => notice(e.message, 'error'));
  $('#closeRoom').onclick = () => { if (confirm('정말 이 방을 종료할까요? 모든 참가자가 첫 화면으로 이동합니다.')) emit('roach:room:close', {}).catch((e) => notice(e.message, 'error')); };
  $('#copyCode').onclick = async () => { try { await navigator.clipboard.writeText(code); notice('방 코드를 복사했습니다.', 'success'); } catch { notice(`방 코드: ${code}`, 'success'); } };
  async function chat() { const value = $('#chatInput').value; if (!value.trim()) return; try { await emit('roach:chat:send', { text: value }); $('#chatInput').value = ''; } catch (e) { notice(e.message, 'error'); } }
  $('#chatSend').onclick = chat; $('#chatInput').onkeydown = (event) => { if (event.key === 'Enter' && !event.isComposing) chat(); };
  async function leaveRoom() { await emit('roach:room:leave', {}).catch(() => {}); sessionStorage.setItem('roach:exitNotice', '방에서 나왔습니다.'); location.href = '/roach'; }
  $('#leave').onclick = leaveRoom;
  $('#gameLeave').onclick = () => { if (confirm('게임 중에 나가면 이번 판에는 다시 들어올 수 없어요. 나갈까요?')) leaveRoom(); };
})();
