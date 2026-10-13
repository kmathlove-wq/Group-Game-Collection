(() => {
  const $ = (s) => document.querySelector(s);
  const socket = io();
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* 저장이 막혀도 게임은 계속 */ } }
  };
  let userId = store.get('land:userId');
  if (!userId) { userId = `land-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`; store.set('land:userId', userId); }
  $('#nickname').value = store.get('land:nickname') || store.get('catchmind:nickname') || '';

  const canvas = $('#board'); const ctx = canvas.getContext('2d');
  const mini = $('#minimap'); const mctx = mini.getContext('2d');
  let size = 360; let owner = new Uint8Array(size * size);
  let brush = 1.5; let tickMs = 100; let lastTickAt = performance.now();
  let you = 0;                    // 내 플레이어 번호(0 = 아직 안 함/탈락)
  const heads = new Map();        // id → { x, y, px, py, angle, pangle, safe, outside }
  const trails = new Map();       // id → [x, y, x, y, …] 땅 밖에서 지나간 머리 자리
  const roster = new Map();       // id → { nickname, color, bot, land, edge, trail, head, rgb }
  let scores = [];
  let camera = null;              // 화면 가운데(칸 좌표)
  let miniImage = mctx.createImageData(size, size);

  // ── 색: 서버가 hsl(색상 72% 52%)을 주면 땅·꼬리·머리용으로 밝기를 바꿔 쓴다 ──
  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12; const a = s * Math.min(l, 1 - l);
    const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
    return [f(0), f(8), f(4)];
  }
  function paint(color) {
    const hue = Number(/hsl\((\d+)/.exec(color)?.[1] ?? 150);
    return { land: `hsl(${hue} 62% 62%)`, edge: `hsl(${hue} 50% 46%)`, trail: `hsl(${hue} 70% 75%)`,
      head: `hsl(${hue} 60% 50%)`, headTop: `hsl(${hue} 65% 62%)`, rgb: hslToRgb(hue, 62, 62) };
  }
  const fallback = { nickname: '', ...paint('hsl(0') };
  const look = (id) => roster.get(id) || fallback;

  // ── 효과음: 소리 파일 없이 웹오디오로 직접 만든다. 🔊 단추로 끄고 켜며 다음에 와도 기억한다. ──
  let audio = null;
  let muted = store.get('land:sound') === 'off';
  function showSound() {
    const button = $('#sound');
    button.textContent = muted ? '🔇' : '🔊';
    button.setAttribute('aria-label', muted ? '소리 켜기' : '소리 끄기');
  }
  showSound();
  $('#sound').addEventListener('click', () => {
    muted = !muted; store.set('land:sound', muted ? 'off' : 'on'); showSound();
    if (!muted) { wakeAudio(); sfx.spawn(); }
  });
  // 브라우저는 사용자가 누르기 전엔 소리를 막으므로, 시작 단추를 누를 때 소리 장치를 켠다.
  function wakeAudio() {
    try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch { audio = null; }
  }
  // 음 하나: type(소리 모양), 시작·끝 높이(Hz), 길이(초), 몇 초 뒤에, 크기
  function tone(type, from, to, length, delay = 0, volume = 0.12) {
    if (muted || !audio) return;
    try {
      const at = audio.currentTime + delay;
      const osc = audio.createOscillator(); const gain = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, at);
      if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, at + length);
      gain.gain.setValueAtTime(volume, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + length);
      osc.connect(gain).connect(audio.destination);
      osc.start(at); osc.stop(at + length + 0.02);
    } catch { /* 소리가 안 나도 게임은 계속 */ }
  }
  // 짧은 "칙" 소리(잡음)
  function noise(length, delay = 0, volume = 0.18) {
    if (muted || !audio) return;
    try {
      const at = audio.currentTime + delay;
      const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * length), audio.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const source = audio.createBufferSource(); const gain = audio.createGain();
      source.buffer = buffer; gain.gain.value = volume;
      source.connect(gain).connect(audio.destination); source.start(at);
    } catch { /* 소리가 안 나도 게임은 계속 */ }
  }
  const sfx = {
    spawn() { tone('sine', 440, 880, 0.12); tone('sine', 660, 1320, 0.14, 0.09); },          // 뾰롱
    gain(cells) {                                                                         // 띠리링: 많이 얻을수록 높게
      const up = Math.min(12, Math.max(0, Math.round(Math.log2(Math.max(1, cells) / 30) * 3)));
      [0, 4, 7].forEach((step, i) => { const f = 523.25 * 2 ** ((step + up) / 12); tone('triangle', f, f, 0.16, i * 0.07, 0.11); });
    },
    kill() { noise(0.09, 0, 0.22); tone('square', 1200, 600, 0.1, 0, 0.06); },             // 착!
    death() { tone('sawtooth', 600, 110, 0.65, 0, 0.09); noise(0.25, 0.05, 0.08); },        // 뿌우웅
    conquer() {                                                                            // 빠바밤~
      [[523.25, 0], [659.25, 0.14], [783.99, 0.28], [1046.5, 0.42]].forEach(([f, d]) => tone('triangle', f, f, d === 0.42 ? 0.7 : 0.18, d, 0.13));
      tone('sine', 523.25, 523.25, 0.9, 0.42, 0.06);
    }
  };
  socket.on('land:gain', ({ gained }) => sfx.gain(gained));
  socket.on('land:kill', () => sfx.kill());

  // ── 서버에서 받은 판 ──
  function loadSnapshot(snap) {
    size = snap.size; brush = snap.brush;
    owner = new Uint8Array(snap.owner);
    heads.clear(); trails.clear();
    for (const [id, x, y, angle, safe, outside] of snap.players) heads.set(id, { x, y, px: x, py: y, angle, pangle: angle, safe, outside });
    for (const [id, points] of snap.trails) trails.set(id, points.slice());
    if (mini.width !== size) { mini.width = size; mini.height = size; }
    miniImage = mctx.createImageData(size, size);
    for (let c = 0; c < owner.length; c += 1) miniPixel(c);
  }
  function miniPixel(c) {
    const id = owner[c];
    const rgb = id ? look(id).rgb : [234, 243, 251];
    const i = c * 4;
    miniImage.data[i] = rgb[0]; miniImage.data[i + 1] = rgb[1]; miniImage.data[i + 2] = rgb[2]; miniImage.data[i + 3] = 255;
  }
  function setRoster(list) {
    roster.clear();
    for (const p of list) roster.set(p.id, { ...p, ...paint(p.color) });
    for (let c = 0; c < owner.length; c += 1) miniPixel(c);
    renderRanking();
  }

  socket.on('land:tick', ({ p, o }) => {
    // 바뀐 땅: [시작 칸, 길이, 주인, …]
    for (let i = 0; i < o.length; i += 3) {
      const end = o[i] + o[i + 1];
      for (let c = o[i]; c < end; c += 1) { owner[c] = o[i + 2]; miniPixel(c); }
    }
    const alive = new Set();
    for (const [id, x, y, angle, safe, outside] of p) {
      alive.add(id);
      const h = heads.get(id);
      // 많이 뛰었으면(새로 태어남) 미끄러지지 않게 바로 옮긴다.
      const jump = !h || Math.hypot(h.x - x, h.y - y) > 6;
      heads.set(id, { x, y, px: jump ? x : h.x, py: jump ? y : h.y, angle, pangle: jump ? angle : h.angle, safe, outside });
      // 땅 밖에 있는 동안의 머리 자리를 이어 꼬리를 만든다. 땅으로 돌아오면(또는 탈락) 꼬리를 지운다.
      if (outside) { if (!trails.has(id)) trails.set(id, []); trails.get(id).push(x, y); } else trails.delete(id);
    }
    for (const id of heads.keys()) if (!alive.has(id)) { heads.delete(id); trails.delete(id); }
    lastTickAt = performance.now();
  });
  socket.on('land:snapshot', loadSnapshot);
  socket.on('land:roster', setRoster);
  socket.on('land:scores', (list) => { scores = list; renderRanking(); });

  // ── 순위표와 내 기록 ──
  function renderRanking() {
    const sorted = [...scores].sort((a, b) => b[1] - a[1]);
    const total = size * size;
    const ol = $('#ranking'); ol.replaceChildren();
    sorted.slice(0, 10).forEach(([id, cells], i) => {
      const li = document.createElement('li'); if (id === you) li.className = 'me';
      const rank = document.createElement('b'); rank.textContent = i + 1;
      const dot = document.createElement('i'); dot.style.background = look(id).head;
      const name = document.createElement('span'); name.textContent = look(id).nickname;
      const pct = document.createElement('small'); pct.textContent = `${(cells / total * 100).toFixed(2)}%`;
      li.append(rank, dot, name, pct); ol.append(li);
    });
    $('#peopleCount').textContent = `${sorted.length}명`;
    const mine = sorted.find((s) => s[0] === you);
    $('#myStat').classList.toggle('hidden', !mine);
    if (mine) {
      $('#myPercent').textContent = `${(mine[1] / total * 100).toFixed(2)}%`;
      $('#myKills').textContent = `잡은 수 ${mine[2]} · ${sorted.indexOf(mine) + 1}등`;
    }
  }

  socket.on('land:feed', ({ victim, killer, reason }) => {
    const li = document.createElement('li');
    const text = { cut: '꼬리를 끊었어요', crash: '머리끼리 부딪혔어요', surrounded: '땅을 모두 차지했어요' };
    li.textContent = killer ? `✂️ ${killer} → ${victim} ${text[reason] || ''}` : `💥 ${victim} 스스로 탈락`;
    const feed = $('#feed'); feed.append(li);
    while (feed.children.length > 4) feed.firstChild.remove();
    setTimeout(() => li.remove(), 4500);
  });

  socket.on('land:conquered', ({ nickname }) => { sfx.conquer(); banner([`🎉 ${nickname}님이 판을 정복했어요!`, '새 판이 시작돼요'], 4000); });
  function banner(lines, ms) {
    const el = $('#banner'); el.replaceChildren();
    lines.forEach((line, i) => { if (i) el.append(document.createElement('br')); el.append(line); });
    el.classList.remove('hidden'); clearTimeout(banner.timer); banner.timer = setTimeout(() => el.classList.add('hidden'), ms);
  }

  // ── 시작·탈락 카드 ──
  function showOverlay(view) {
    $('#overlay').classList.toggle('hidden', !view);
    $('#startView').classList.toggle('hidden', view !== 'start');
    $('#deadView').classList.toggle('hidden', view !== 'dead');
  }
  function status(message, error = false) { const el = $('#status'); el.textContent = message; el.classList.toggle('error', error); }

  socket.on('land:died', (info) => {
    you = 0;
    if (!info.conquered) sfx.death();
    $('#deadTitle').textContent = info.conquered ? '🎉 판 정복!' : '탈락!';
    $('#deadReason').textContent = info.by ? `${info.by}님에게 ${info.reason}` : info.reason;
    $('#deadPercent').textContent = `${info.percent}%`;
    $('#deadKills').textContent = info.kills;
    $('#deadTime').textContent = `${Math.round(info.seconds)}초`;
    showOverlay('dead'); status('');
    renderRanking();
  });

  function play() {
    const nickname = $('#nickname').value.trim();
    if (!nickname) { showOverlay('start'); status('닉네임을 입력해 주세요.', true); $('#nickname').focus(); return; }
    store.set('land:nickname', nickname);
    wakeAudio();
    status('들어가는 중…');
    socket.emit('land:play', { nickname }, (result) => {
      if (!result?.ok) { status(result?.message || '들어가지 못했어요.', true); return; }
      you = result.you; status(''); showOverlay(null); sentAngle = null; renderRanking(); sfx.spawn();
    });
  }
  $('#play').addEventListener('click', play);
  $('#again').addEventListener('click', play);
  $('#nickname').addEventListener('keydown', (e) => { if (e.key === 'Enter') play(); });

  socket.on('connect', () => {
    status('● 판을 불러오는 중…');
    socket.emit('land:enter', { userId }, (result) => {
      if (!result?.ok) { status(result?.message || '연결에 실패했어요.', true); return; }
      tickMs = result.tickMs; loadSnapshot(result.snapshot); setRoster(result.roster); scores = result.scores;
      you = result.you;
      if (you) showOverlay(null); else { if ($('#deadView').classList.contains('hidden')) showOverlay('start'); status('● 연결됐어요! 닉네임을 쓰고 시작하세요.'); }
      renderRanking();
    });
  });
  socket.on('disconnect', () => { status('연결이 끊겼어요. 다시 연결하는 중…', true); if (you) showOverlay('start'); });

  // ── 조작: 가고 싶은 방향(각도)을 보낸다. 서버가 조금씩 돌려 곡선으로 움직인다. ──
  // PC = 마우스가 있는 쪽 또는 방향키·WASD(8방향), 휴대폰 = 손가락을 끄는 방향(조이스틱처럼)
  let sentAngle = null; let wantAngle = null; let lastSend = 0;
  function steer(angle) { if (you) wantAngle = angle; }
  setInterval(() => { // 너무 자주 보내지 않게 0.05초마다 가장 최근 방향만 보낸다
    if (wantAngle === null || !you) return;
    if (sentAngle !== null && Math.abs(wantAngle - sentAngle) < 0.03) return;
    sentAngle = wantAngle; lastSend = performance.now(); socket.emit('land:steer', Math.round(wantAngle * 1000) / 1000);
  }, 50);

  const keys = new Set();
  const KEYS = { ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
  function keyAngle() {
    let dx = 0; let dy = 0;
    for (const code of keys) { dx += KEYS[code][0]; dy += KEYS[code][1]; }
    if (dx || dy) steer(Math.atan2(dy, dx));
  }
  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || !(e.code in KEYS)) return;
    e.preventDefault(); keys.add(e.code); keyAngle();
  });
  addEventListener('keyup', (e) => { keys.delete(e.code); });
  addEventListener('blur', () => keys.clear());

  let stick = null; // 손가락 조이스틱 시작점
  canvas.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') stick = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      // 마우스: 내 머리(화면 위치)에서 마우스 쪽으로
      const me = headScreen();
      if (me && Math.hypot(e.clientX - me.x, e.clientY - me.y) > 8) steer(Math.atan2(e.clientY - me.y, e.clientX - me.x));
      return;
    }
    if (!stick) return;
    const dx = e.clientX - stick.x; const dy = e.clientY - stick.y; const length = Math.hypot(dx, dy);
    if (length < 12) return;
    steer(Math.atan2(dy, dx));
    if (length > 70) { stick.x = e.clientX - dx / length * 70; stick.y = e.clientY - dy / length * 70; } // 시작점이 손가락을 따라옴
  });
  for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, () => { stick = null; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ── 그리기 ──
  let view = { ox: 0, oy: 0, cell: 10 };
  function headScreen() {
    const h = heads.get(you); if (!h) return null;
    const pos = position(h, Math.min(1, (performance.now() - lastTickAt) / tickMs));
    return { x: view.ox + pos.x * view.cell, y: view.oy + pos.y * view.cell };
  }
  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(innerWidth * ratio); canvas.height = Math.round(innerHeight * ratio);
  }
  addEventListener('resize', resize); resize();

  function position(h, t) { return { x: h.px + (h.x - h.px) * t, y: h.py + (h.y - h.py) * t }; }
  function lerpAngle(a, b, t) {
    let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  // 땅을 매끈하게: 칸마다 "둘레 9칸 중 그 주인 땅이 얼마나 되나"(가운데 4·옆 2·대각선 1 무게, 0~1)를 재고,
  // 칸 가운데 4점을 한 묶음으로 보아(마칭 스퀘어) 그 값이 0.5가 되는 자리를 비율로 찾아 잇는다.
  // 45°로만 깎던 예전 방식은 완만한 비탈이 계단처럼 울퉁불퉁했다.
  const SMOOTH = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  function landPaths(x0, y0, x1, y1, ox, oy, cell) {
    const paths = new Map();
    const at = (x, y) => (x < 0 || y < 0 || x >= size || y >= size ? 0 : owner[y * size + x]);
    const pathOf = (id) => { let p = paths.get(id); if (!p) { p = new Path2D(); paths.set(id, p); } return p; };
    const share = (id, x, y) => {
      let sum = 0;
      for (let k = 0; k < 9; k += 1) if (at(x + (k % 3) - 1, y + Math.floor(k / 3) - 1) === id) sum += SMOOTH[k];
      return sum / 16;
    };
    for (let y = y0 - 1; y <= y1; y += 1) {
      const sy = oy + (y + 0.5) * cell;
      let runId = 0; let runStart = 0;
      const flush = (x) => { if (runId) pathOf(runId).rect(ox + (runStart + 0.5) * cell, sy, (x - runStart) * cell + 0.6, cell + 0.6); runId = 0; };
      for (let x = x0 - 1; x <= x1; x += 1) {
        // 둘레까지 4×4칸이 모두 같은 주인이면 경계가 없으니 한 줄 직사각형으로 묶는다
        const a = at(x, y); let same = true;
        for (let k = 0; k < 16 && same; k += 1) same = at(x - 1 + (k % 4), y - 1 + (k >> 2)) === a;
        if (same) {
          if (a !== runId) { flush(x); if (a) { runId = a; runStart = x; } }
          continue;
        }
        flush(x);
        const ids = new Set();
        for (let k = 0; k < 16; k += 1) { const id = at(x - 1 + (k % 4), y - 1 + (k >> 2)); if (id) ids.add(id); }
        // 시계 방향 꼭짓점: 왼위, 오른위, 오른아래, 왼아래
        const sx = ox + (x + 0.5) * cell;
        const cx = [sx, sx + cell, sx + cell, sx]; const cy = [sy, sy, sy + cell, sy + cell];
        for (const id of ids) {
          const v = [share(id, x, y), share(id, x + 1, y), share(id, x + 1, y + 1), share(id, x, y + 1)];
          const inside = v.map((n) => n >= 0.5);
          if (!inside.some(Boolean)) continue;
          const p = pathOf(id); let started = false;
          const to = (px, py) => { started ? p.lineTo(px, py) : p.moveTo(px, py); started = true; };
          for (let k = 0; k < 4; k += 1) {
            const n = (k + 1) % 4;
            if (inside[k]) to(cx[k], cy[k]);
            if (inside[k] !== inside[n]) { const t = (0.5 - v[k]) / (v[n] - v[k]); to(cx[k] + (cx[n] - cx[k]) * t, cy[k] + (cy[n] - cy[k]) * t); }
          }
          p.closePath();
        }
      }
      flush(x1 + 1);
    }
    return paths;
  }

  function draw(now) {
    requestAnimationFrame(draw);
    const ratio = window.devicePixelRatio || 1;
    const w = canvas.width / ratio; const hgt = canvas.height / ratio;
    const cell = Math.max(6, Math.min(16, Math.min(w, hgt) / 70));
    const t = Math.min(1, (now - lastTickAt) / tickMs);

    // 카메라: 내 머리 → 없으면 1등 → 없으면 판 가운데
    const leader = [...scores].sort((a, b) => b[1] - a[1])[0];
    const target = heads.get(you) || heads.get(leader?.[0]);
    const goal = target ? position(target, t) : { x: size / 2, y: size / 2 };
    if (!camera || heads.has(you)) camera = { ...goal };
    else { camera.x += (goal.x - camera.x) * 0.05; camera.y += (goal.y - camera.y) * 0.05; }

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#c9d6e3'; ctx.fillRect(0, 0, w, hgt); // 판 밖
    const ox = w / 2 - camera.x * cell; const oy = hgt / 2 - camera.y * cell;
    view = { ox, oy, cell };
    const x0 = Math.max(0, Math.floor(-ox / cell)); const x1 = Math.min(size - 1, Math.ceil((w - ox) / cell));
    const y0 = Math.max(0, Math.floor(-oy / cell)); const y1 = Math.min(size - 1, Math.ceil((hgt - oy) / cell));

    ctx.fillStyle = '#e4f0fb'; ctx.fillRect(ox, oy, size * cell, size * cell);
    ctx.strokeStyle = '#d6e6f5'; ctx.lineWidth = 1; ctx.beginPath(); // 10칸마다 옅은 줄
    for (let x = Math.ceil(x0 / 10) * 10; x <= x1 + 1; x += 10) { ctx.moveTo(ox + x * cell, oy + y0 * cell); ctx.lineTo(ox + x * cell, oy + (y1 + 1) * cell); }
    for (let y = Math.ceil(y0 / 10) * 10; y <= y1 + 1; y += 10) { ctx.moveTo(ox + x0 * cell, oy + y * cell); ctx.lineTo(ox + (x1 + 1) * cell, oy + y * cell); }
    ctx.stroke();

    // 땅: 진한 색을 조금 아래에 먼저 칠해 종이를 쌓은 듯한 두께를 낸다
    const paths = landPaths(x0, y0, x1, y1, ox, oy, cell);
    // 비스듬히 깎은 경계를 둥근 붓으로 한 번 더 덧칠해 계단 모양을 부드럽게 만든다
    const depth = Math.max(3, cell * 0.45);
    ctx.lineJoin = 'round'; ctx.lineWidth = cell * 1.1;
    ctx.save(); ctx.translate(0, depth);
    for (const [id, path] of paths) { ctx.fillStyle = ctx.strokeStyle = look(id).edge; ctx.fill(path); ctx.stroke(path); }
    ctx.restore();
    for (const [id, path] of paths) { ctx.fillStyle = ctx.strokeStyle = look(id).land; ctx.fill(path); ctx.stroke(path); }

    // 꼬리: 지나간 자리를 굵고 둥근 선으로 이어 그리고, 끝은 지금 머리까지 잇는다
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = brush * 2 * cell;
    for (const [id, points] of trails) {
      const h = heads.get(id); if (!h || points.length < 2) continue;
      const pos = position(h, t);
      ctx.strokeStyle = look(id).trail; ctx.beginPath();
      ctx.moveTo(ox + points[0] * cell, oy + points[1] * cell);
      for (let i = 2; i < points.length - 2; i += 2) ctx.lineTo(ox + points[i] * cell, oy + points[i + 1] * cell);
      ctx.lineTo(ox + pos.x * cell, oy + pos.y * cell);
      ctx.stroke();
    }
    ctx.strokeStyle = '#8ea3b8'; ctx.lineWidth = 3; ctx.strokeRect(ox, oy, size * cell, size * cell);

    // 머리: 가는 방향으로 돌린 정육면체 + 이름
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.font = `800 ${Math.round(Math.max(11, cell * 0.9))}px Pretendard, "Noto Sans KR", system-ui, sans-serif`;
    const s = cell * brush * 2.2;
    for (const [id, h] of heads) {
      const pos = position(h, t); const c = look(id);
      const px = ox + pos.x * cell; const py = oy + pos.y * cell;
      if (px < -60 || py < -60 || px > w + 60 || py > hgt + 60) continue;
      if (h.safe && Math.floor(now / 120) % 2) ctx.globalAlpha = 0.45; // 무적일 때 깜빡임
      ctx.save(); ctx.translate(px, py); ctx.rotate(lerpAngle(h.pangle, h.angle, t));
      ctx.fillStyle = '#00000026'; ctx.fillRect(-s / 2 + 2, -s / 2 + depth, s, s);
      ctx.fillStyle = c.head; ctx.fillRect(-s / 2, -s / 2 + depth * 0.6, s, s);
      ctx.fillStyle = c.headTop; ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.fillStyle = '#ffffffcc'; ctx.fillRect(s * 0.12, -s * 0.28, s * 0.22, s * 0.18); ctx.fillRect(s * 0.12, s * 0.1, s * 0.22, s * 0.18); // 눈
      ctx.restore(); ctx.globalAlpha = 1;
      ctx.lineWidth = 3; ctx.strokeStyle = '#ffffffd9'; ctx.strokeText(c.nickname, px, py - s * 0.75);
      ctx.fillStyle = id === you ? '#065f46' : '#1f2937'; ctx.fillText(c.nickname, px, py - s * 0.75);
    }

    // 작은 지도: 판 전체 + 지금 보이는 곳 네모 + 내 위치
    mctx.putImageData(miniImage, 0, 0);
    mctx.strokeStyle = '#111827'; mctx.lineWidth = 2;
    mctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    const me = heads.get(you);
    if (me) { mctx.fillStyle = '#e11d48'; mctx.beginPath(); mctx.arc(me.x, me.y, 5, 0, Math.PI * 2); mctx.fill(); }
  }
  requestAnimationFrame(draw);
})();
