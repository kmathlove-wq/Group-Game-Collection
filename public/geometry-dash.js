(() => {
  'use strict';

  // 원작 게임의 그래픽·음원을 쓰지 않는 독자 구현. "네모가 점프해서
  // 장애물을 피한다"는 장르 규칙만 참고하고, 도형·배경음악·효과음은 전부 새로 만든다.
  const NICKNAME_KEY = 'catchmind:nickname';
  const MUTE_KEY = 'group-game:geometry-dash:muted:v1';
  const BEST_LOCAL_KEY = 'group-game:geometry-dash:bestLocal:v1';

  const CANVAS_W = 900;
  const CANVAS_H = 340;
  const GROUND_H = 60;
  const GROUND_Y = CANVAS_H - GROUND_H;
  const PLAYER_X = 140;
  const PLAYER_SIZE = 40;
  const GRAVITY = 2200;
  const JUMP_VELOCITY = -760;
  const START_SPEED = 300;
  const MAX_SPEED = 520;
  const SPEED_RAMP_SECONDS = 45;
  const GAP_MIN = 230;
  const GAP_MAX = 420;
  const HITBOX_INSET = 6;
  const MAX_DELTA = 1 / 30;
  const MILESTONE_STEP = 1000; // distance 단위, 100m마다

  const canvas = document.querySelector('#gdCanvas');
  const ctx = canvas.getContext('2d');
  const scoreText = document.querySelector('#gdScoreText');
  const bestScoreText = document.querySelector('#bestScoreText');
  const startOverlay = document.querySelector('#gdStartOverlay');
  const overOverlay = document.querySelector('#gdOverOverlay');
  const startButton = document.querySelector('#gdStartButton');
  const retryButton = document.querySelector('#gdRetryButton');
  const finalScoreText = document.querySelector('#gdFinalScoreText');
  const rankText = document.querySelector('#gdRankText');
  const muteButton = document.querySelector('#gdMuteButton');
  const leaderboardList = document.querySelector('#gdLeaderboardList');
  const refreshScoresButton = document.querySelector('#gdRefreshScoresButton');
  const nameInput = document.querySelector('#gdNameInput');

  let muted = localStorage.getItem(MUTE_KEY) === '1';
  let audioCtx = null;
  let bgmState = null;
  let player = null;
  let obstacles = [];
  let particles = [];
  let backdropShapes = [];
  let speed = START_SPEED;
  let elapsed = 0;
  let distance = 0;
  let running = false;
  let lastTime = 0;
  let rafId = 0;
  let shakeTime = 0;
  let shakeMagnitude = 0;
  let flashTime = 0;
  let nextMilestoneAt = MILESTONE_STEP;

  nameInput.value = localStorage.getItem(NICKNAME_KEY) || '';

  // ---------- 순위(전체 통합) ----------
  function renderLeaderboard(scores) {
    leaderboardList.innerHTML = '';
    if (!scores || !scores.length) {
      const empty = document.createElement('li');
      empty.className = 'gd-leaderboard-empty';
      empty.textContent = '아직 기록이 없어요. 첫 게임을 시작해 보세요!';
      leaderboardList.append(empty);
      bestScoreText.textContent = '0';
      return;
    }
    bestScoreText.textContent = String(scores[0].score);
    scores.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = `gd-rank-${index + 1}`;
      const badge = document.createElement('span');
      badge.className = 'gd-rank-badge';
      badge.textContent = `${index + 1}위`;
      const name = document.createElement('span');
      name.className = 'gd-rank-name';
      name.textContent = item.name;
      const score = document.createElement('span');
      score.textContent = `${item.score}m`;
      li.append(badge, name, score);
      leaderboardList.append(li);
    });
  }

  async function fetchLeaderboard() {
    try {
      const response = await fetch('/api/geometry-dash/scores');
      if (!response.ok) throw new Error('bad response');
      const data = await response.json();
      renderLeaderboard(data.scores);
    } catch {
      leaderboardList.innerHTML = '';
      const errorItem = document.createElement('li');
      errorItem.className = 'gd-leaderboard-empty';
      errorItem.textContent = '순위를 불러오지 못했어요. 새로고침 버튼을 눌러 주세요.';
      leaderboardList.append(errorItem);
    }
  }

  async function submitScore(score) {
    const name = nameInput.value.trim() || '이름없음';
    localStorage.setItem(NICKNAME_KEY, name);
    try {
      const response = await fetch('/api/geometry-dash/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, score })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'submit failed');
      renderLeaderboard(data.scores);
      rankText.textContent = data.rank ? `전체 순위 ${data.rank}위에 올랐어요!` : '';
    } catch {
      rankText.textContent = '순위 제출에 실패했어요. 인터넷 연결을 확인해 주세요.';
      fetchLeaderboard();
    }
    const bestLocal = Number(localStorage.getItem(BEST_LOCAL_KEY) || 0);
    if (score > bestLocal) localStorage.setItem(BEST_LOCAL_KEY, String(score));
  }

  // ---------- 오디오: 전부 WebAudio로 합성한 자체 효과음·배경음악 ----------
  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function noteFreq(semitoneFromA4) {
    return 440 * (2 ** (semitoneFromA4 / 12));
  }

  function playTone(freq, duration, type = 'square', volume = 0.12) {
    if (muted) return;
    try {
      const context = getAudioCtx();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = freq;
      gain.gain.setValueAtTime(volume, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
    } catch {
      // 오디오를 지원하지 않는 환경에서는 조용히 무시한다.
    }
  }

  function playScheduledTone(context, freq, time, duration, type, volume) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = freq;
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(time);
    oscillator.stop(time + duration);
  }

  function playScheduledTick(context, time) {
    const bufferSize = Math.floor(context.sampleRate * 0.03);
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const noise = context.createBufferSource();
    noise.buffer = buffer;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.05, time);
    noise.connect(gain).connect(context.destination);
    noise.start(time);
  }

  // 신나는 8비트풍 반주: 베이스 + 아르페지오 + 하이햇, 전부 이 프로젝트에서 직접 작곡한 패턴이다.
  const BGM_BPM = 148;
  const BGM_STEP_SECONDS = 60 / BGM_BPM / 2;
  const BGM_BASS_STEPS = [-24, -24, -21, -19, -24, -24, -21, -22];
  const BGM_LEAD_STEPS = [0, 7, 10, 12, 10, 7, 3, 0, -5, 0, 7, 10, 12, 10, 7, 3];

  function scheduleBgmStep(context, time, step) {
    const bassSemi = BGM_BASS_STEPS[step % BGM_BASS_STEPS.length];
    playScheduledTone(context, noteFreq(bassSemi), time, BGM_STEP_SECONDS * 1.8, 'square', 0.05);
    const leadSemi = BGM_LEAD_STEPS[step % BGM_LEAD_STEPS.length];
    playScheduledTone(context, noteFreq(leadSemi + 12), time, BGM_STEP_SECONDS * 0.85, 'square', 0.035);
    if (step % 2 === 1) playScheduledTick(context, time);
  }

  function startBgm() {
    if (muted || bgmState) return;
    const context = getAudioCtx();
    let step = 0;
    let nextNoteTime = context.currentTime + 0.05;
    const state = { timerId: 0, stopped: false };
    function schedulerTick() {
      if (state.stopped) return;
      while (nextNoteTime < context.currentTime + 0.15) {
        scheduleBgmStep(context, nextNoteTime, step);
        nextNoteTime += BGM_STEP_SECONDS;
        step += 1;
      }
      state.timerId = window.setTimeout(schedulerTick, 60);
    }
    bgmState = state;
    schedulerTick();
  }

  function stopBgm() {
    if (!bgmState) return;
    bgmState.stopped = true;
    window.clearTimeout(bgmState.timerId);
    bgmState = null;
  }

  function updateMuteButton() {
    muteButton.textContent = muted ? '🔇 소리 꺼짐' : '🔊 소리 켜짐';
    muteButton.setAttribute('aria-pressed', String(muted));
  }

  // ---------- 게임 상태 ----------
  function createPlayer() {
    return { y: GROUND_Y - PLAYER_SIZE, vy: 0, grounded: true, rotation: 0 };
  }

  function randomRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function createObstacle(x) {
    const roll = Math.random();
    if (roll < 0.55) return { type: 'spike', x, width: 34, height: 38 };
    if (roll < 0.8) return { type: 'spike-double', x, width: 64, height: 38 };
    const height = 40 + Math.round(Math.random() * 30);
    return { type: 'block', x, width: 42, height };
  }

  function ensureObstacles() {
    while (!obstacles.length || obstacles[obstacles.length - 1].x < CANVAS_W + 220) {
      const prev = obstacles[obstacles.length - 1];
      const gap = randomRange(GAP_MIN, GAP_MAX);
      const startX = prev ? prev.x + prev.width + gap : CANVAS_W + 260;
      obstacles.push(createObstacle(startX));
    }
  }

  function createBackdropShapes() {
    const shapes = [];
    for (let i = 0; i < 6; i += 1) {
      shapes.push({
        x: randomRange(0, CANVAS_W),
        y: randomRange(20, GROUND_Y - 60),
        size: randomRange(30, 90),
        kind: Math.random() < 0.5 ? 'circle' : 'diamond',
        hue: Math.random() < 0.5 ? 'rgba(61,214,255,0.06)' : 'rgba(255,106,61,0.06)'
      });
    }
    return shapes;
  }

  function resetGame() {
    player = createPlayer();
    obstacles = [];
    particles = [];
    backdropShapes = createBackdropShapes();
    speed = START_SPEED;
    elapsed = 0;
    distance = 0;
    shakeTime = 0;
    flashTime = 0;
    nextMilestoneAt = MILESTONE_STEP;
    ensureObstacles();
    scoreText.textContent = '0';
  }

  function jump() {
    if (!running || !player.grounded) return;
    player.vy = JUMP_VELOCITY;
    player.grounded = false;
    playTone(520, 0.09, 'square');
  }

  function spawnBurst(x, y, count, colors, speedRange) {
    for (let i = 0; i < count; i += 1) {
      particles.push({
        x,
        y,
        vx: randomRange(-speedRange, speedRange),
        vy: randomRange(-speedRange, speedRange * 0.4),
        life: randomRange(0.35, 0.7),
        maxLife: 0.7,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
  }

  function playerHitbox() {
    return {
      x: PLAYER_X + HITBOX_INSET,
      y: player.y + HITBOX_INSET,
      width: PLAYER_SIZE - HITBOX_INSET * 2,
      height: PLAYER_SIZE - HITBOX_INSET * 2
    };
  }

  function obstacleHitbox(obstacle) {
    return {
      x: obstacle.x + 3,
      y: GROUND_Y - obstacle.height,
      width: obstacle.width - 6,
      height: obstacle.height
    };
  }

  function boxesOverlap(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  function checkCollision() {
    const hitbox = playerHitbox();
    return obstacles.some((obstacle) => boxesOverlap(hitbox, obstacleHitbox(obstacle)));
  }

  function endGame() {
    running = false;
    cancelAnimationFrame(rafId);
    stopBgm();
    playTone(300, 0.12, 'sawtooth', 0.14);
    window.setTimeout(() => playTone(220, 0.14, 'sawtooth', 0.13), 90);
    window.setTimeout(() => playTone(140, 0.3, 'sawtooth', 0.12), 190);
    shakeTime = 0.4;
    shakeMagnitude = 10;
    spawnBurst(PLAYER_X + PLAYER_SIZE / 2, player.y + PLAYER_SIZE / 2, 26, ['#3dd6ff', '#ff6a3d', '#ff3d63'], 260);
    const finalScore = Math.floor(distance / 10);
    finalScoreText.textContent = String(finalScore);
    rankText.textContent = '순위를 확인하는 중…';
    overOverlay.hidden = false;
    submitScore(finalScore);
  }

  function checkMilestone() {
    if (distance < nextMilestoneAt) return;
    nextMilestoneAt += MILESTONE_STEP;
    flashTime = 0.15;
    playTone(880, 0.12, 'triangle', 0.08);
    spawnBurst(PLAYER_X + PLAYER_SIZE / 2, player.y + PLAYER_SIZE / 2, 10, ['#ffd27a', '#3dd6ff'], 140);
  }

  function update(dt) {
    elapsed += dt;
    speed = START_SPEED + (MAX_SPEED - START_SPEED) * Math.min(1, elapsed / SPEED_RAMP_SECONDS);
    distance += speed * dt;
    scoreText.textContent = String(Math.floor(distance / 10));
    checkMilestone();

    player.vy += GRAVITY * dt;
    player.y += player.vy * dt;
    if (player.y >= GROUND_Y - PLAYER_SIZE) {
      player.y = GROUND_Y - PLAYER_SIZE;
      if (!player.grounded) {
        spawnBurst(PLAYER_X + PLAYER_SIZE / 2, GROUND_Y, 5, ['#3dd6ff'], 110);
        playTone(180, 0.05, 'triangle', 0.05);
      }
      player.vy = 0;
      player.grounded = true;
    }
    player.rotation = player.grounded ? 0 : player.rotation + dt * 9;

    if (player.grounded && Math.random() < dt * 22) {
      particles.push({
        x: PLAYER_X, y: player.y + PLAYER_SIZE - 4, vx: -speed * 0.4, vy: -20,
        life: 0.25, maxLife: 0.25, color: 'rgba(61,214,255,0.6)'
      });
    }

    obstacles.forEach((obstacle) => { obstacle.x -= speed * dt; });
    obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.width > -20);
    ensureObstacles();

    backdropShapes.forEach((shape) => {
      shape.x -= speed * 0.15 * dt;
      if (shape.x < -100) shape.x = CANVAS_W + 100;
    });

    particles.forEach((particle) => {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += GRAVITY * 0.5 * dt;
      particle.life -= dt;
    });
    particles = particles.filter((particle) => particle.life > 0);

    if (shakeTime > 0) shakeTime = Math.max(0, shakeTime - dt);
    if (flashTime > 0) flashTime = Math.max(0, flashTime - dt);

    if (checkCollision()) endGame();
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    gradient.addColorStop(0, '#141728');
    gradient.addColorStop(1, '#0b0c14');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    backdropShapes.forEach((shape) => {
      ctx.fillStyle = shape.hue;
      if (shape.kind === 'circle') {
        ctx.beginPath();
        ctx.arc(shape.x, shape.y, shape.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(shape.x, shape.y);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-shape.size / 2, -shape.size / 2, shape.size, shape.size);
        ctx.restore();
      }
    });

    ctx.strokeStyle = 'rgba(61,214,255,0.08)';
    ctx.lineWidth = 1;
    const scroll = (distance * 0.4) % 40;
    for (let x = -scroll; x < CANVAS_W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, GROUND_Y);
      ctx.stroke();
    }
  }

  function drawGround() {
    ctx.fillStyle = '#12141f';
    ctx.fillRect(0, GROUND_Y, CANVAS_W, GROUND_H);
    ctx.fillStyle = '#ff6a3d';
    ctx.fillRect(0, GROUND_Y, CANVAS_W, 3);
    ctx.strokeStyle = 'rgba(255,106,61,0.35)';
    ctx.lineWidth = 2;
    const scroll = distance % 30;
    for (let x = -scroll; x < CANVAS_W; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, GROUND_Y + 14);
      ctx.lineTo(x + 14, GROUND_Y + 14);
      ctx.stroke();
    }
  }

  function drawSpeedLines() {
    if (speed < START_SPEED + 40) return;
    const intensity = Math.min(1, (speed - START_SPEED) / (MAX_SPEED - START_SPEED));
    ctx.strokeStyle = `rgba(244,245,251,${0.05 + intensity * 0.12})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i += 1) {
      const y = 30 + i * 70 + Math.sin(elapsed * 3 + i) * 6;
      const length = 40 + intensity * 60;
      const x = (CANVAS_W - ((distance * 2 + i * 150) % (CANVAS_W + length)));
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + length, y);
      ctx.stroke();
    }
  }

  function drawPlayer() {
    const cx = PLAYER_X + PLAYER_SIZE / 2;
    const cy = player.y + PLAYER_SIZE / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(player.rotation);
    ctx.fillStyle = '#3dd6ff';
    ctx.shadowColor = 'rgba(61,214,255,0.65)';
    ctx.shadowBlur = 14 + Math.sin(elapsed * 8) * 4;
    ctx.fillRect(-PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#0b0c14';
    ctx.fillRect(-PLAYER_SIZE / 2 + 8, -PLAYER_SIZE / 2 + 8, 9, 9);
    ctx.fillRect(PLAYER_SIZE / 2 - 17, -PLAYER_SIZE / 2 + 8, 9, 9);
    ctx.restore();
  }

  function drawObstacle(obstacle) {
    const baseY = GROUND_Y;
    if (obstacle.type === 'block') {
      ctx.fillStyle = '#ff6a3d';
      ctx.shadowColor = 'rgba(255,106,61,0.5)';
      ctx.shadowBlur = 10;
      ctx.fillRect(obstacle.x, baseY - obstacle.height, obstacle.width, obstacle.height);
      ctx.shadowBlur = 0;
      return;
    }
    const spikeCount = obstacle.type === 'spike-double' ? 2 : 1;
    const spikeWidth = obstacle.width / spikeCount;
    ctx.fillStyle = '#ff3d63';
    ctx.shadowColor = 'rgba(255,61,99,0.55)';
    ctx.shadowBlur = 10;
    for (let i = 0; i < spikeCount; i += 1) {
      const startX = obstacle.x + i * spikeWidth;
      ctx.beginPath();
      ctx.moveTo(startX, baseY);
      ctx.lineTo(startX + spikeWidth / 2, baseY - obstacle.height);
      ctx.lineTo(startX + spikeWidth, baseY);
      ctx.closePath();
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  function drawParticles() {
    particles.forEach((particle) => {
      ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x - 2.5, particle.y - 2.5, 5, 5);
    });
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.save();
    if (shakeTime > 0) {
      const magnitude = shakeMagnitude * (shakeTime / 0.4);
      ctx.translate(randomRange(-magnitude, magnitude), randomRange(-magnitude, magnitude));
    }
    drawBackground();
    drawSpeedLines();
    obstacles.forEach(drawObstacle);
    drawGround();
    drawParticles();
    drawPlayer();
    ctx.restore();
    if (flashTime > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flashTime / 0.15 * 0.35})`;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }
  }

  function loop(time) {
    if (!running) return;
    const dt = Math.min(MAX_DELTA, (time - lastTime) / 1000 || 0);
    lastTime = time;
    update(dt);
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function startGame() {
    const name = nameInput.value.trim();
    if (name) localStorage.setItem(NICKNAME_KEY, name);
    resetGame();
    running = true;
    lastTime = performance.now();
    startOverlay.hidden = true;
    overOverlay.hidden = true;
    draw();
    startBgm();
    rafId = requestAnimationFrame(loop);
  }

  function handleJumpInput(event) {
    if (event) event.preventDefault();
    if (!running) return;
    jump();
  }

  document.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' && event.code !== 'ArrowUp') return;
    if (!running) return;
    handleJumpInput(event);
  });
  canvas.addEventListener('pointerdown', handleJumpInput);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      running = false;
      stopBgm();
    }
  });

  startButton.addEventListener('click', startGame);
  retryButton.addEventListener('click', startGame);
  muteButton.addEventListener('click', () => {
    muted = !muted;
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    updateMuteButton();
    if (muted) stopBgm();
    else if (running) startBgm();
  });
  refreshScoresButton.addEventListener('click', fetchLeaderboard);

  updateMuteButton();
  fetchLeaderboard();
  player = createPlayer();
  backdropShapes = createBackdropShapes();
  draw();
})();
