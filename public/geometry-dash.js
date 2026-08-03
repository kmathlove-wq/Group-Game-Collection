(() => {
  'use strict';

  // 원작 게임의 그래픽·음원을 쓰지 않는 독자 구현. "네모가 점프해서
  // 장애물을 피한다"는 장르 규칙만 참고하고, 도형과 효과음은 새로 만든다.
  const SCORES_KEY = 'group-game:geometry-dash:scores:v1';
  const MUTE_KEY = 'group-game:geometry-dash:muted:v1';
  const MAX_SCORES = 10;

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
  const clearScoresButton = document.querySelector('#gdClearScoresButton');

  let muted = localStorage.getItem(MUTE_KEY) === '1';
  let audioCtx = null;
  let player = null;
  let obstacles = [];
  let particles = [];
  let speed = START_SPEED;
  let elapsed = 0;
  let distance = 0;
  let running = false;
  let lastTime = 0;
  let rafId = 0;

  function loadScores() {
    try {
      const raw = JSON.parse(localStorage.getItem(SCORES_KEY) || '[]');
      if (!Array.isArray(raw)) return [];
      return raw.filter((n) => Number.isFinite(n)).sort((a, b) => b - a).slice(0, MAX_SCORES);
    } catch {
      return [];
    }
  }

  function saveScore(score) {
    const scores = loadScores();
    scores.push(score);
    scores.sort((a, b) => b - a);
    const top = scores.slice(0, MAX_SCORES);
    localStorage.setItem(SCORES_KEY, JSON.stringify(top));
    return top;
  }

  function renderLeaderboard(scores) {
    const list = scores || loadScores();
    bestScoreText.textContent = list.length ? list[0] : 0;
    if (!list.length) {
      leaderboardList.innerHTML = '<li class="gd-leaderboard-empty">아직 기록이 없어요. 첫 게임을 시작해 보세요!</li>';
      return;
    }
    leaderboardList.innerHTML = list
      .map((score, index) => `
        <li class="gd-rank-${index + 1}">
          <span class="gd-rank-badge">${index + 1}위</span>
          <span>${score}m</span>
        </li>
      `)
      .join('');
  }

  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function playTone(freq, duration, type = 'square') {
    if (muted) return;
    try {
      const context = getAudioCtx();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = freq;
      gain.gain.setValueAtTime(0.12, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + duration);
    } catch {
      // 오디오를 지원하지 않는 환경에서는 조용히 무시한다.
    }
  }

  function updateMuteButton() {
    muteButton.textContent = muted ? '🔇 효과음 꺼짐' : '🔊 효과음 켜짐';
    muteButton.setAttribute('aria-pressed', String(muted));
  }

  function createPlayer() {
    return { y: GROUND_Y - PLAYER_SIZE, vy: 0, grounded: true, rotation: 0 };
  }

  function randomRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function createObstacle(x) {
    const roll = Math.random();
    if (roll < 0.55) {
      const width = 34;
      return { type: 'spike', x, width, height: 38 };
    }
    if (roll < 0.8) {
      const width = 64;
      return { type: 'spike-double', x, width, height: 38 };
    }
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

  function resetGame() {
    player = createPlayer();
    obstacles = [];
    particles = [];
    speed = START_SPEED;
    elapsed = 0;
    distance = 0;
    ensureObstacles();
    scoreText.textContent = '0';
  }

  function jump() {
    if (!running || !player.grounded) return;
    player.vy = JUMP_VELOCITY;
    player.grounded = false;
    playTone(520, 0.09, 'square');
  }

  function spawnLandingParticles() {
    for (let i = 0; i < 6; i += 1) {
      particles.push({
        x: PLAYER_X + PLAYER_SIZE / 2,
        y: GROUND_Y,
        vx: randomRange(-90, 90),
        vy: randomRange(-160, -40),
        life: 0.4
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
    playTone(140, 0.35, 'sawtooth');
    const finalScore = Math.floor(distance / 10);
    finalScoreText.textContent = String(finalScore);
    const top = saveScore(finalScore);
    const rank = top.indexOf(finalScore);
    rankText.textContent = rank >= 0 && rank < MAX_SCORES
      ? `내 순위 기록 ${rank + 1}위에 올랐어요!`
      : '';
    renderLeaderboard(top);
    overOverlay.hidden = false;
  }

  function update(dt) {
    elapsed += dt;
    speed = START_SPEED + (MAX_SPEED - START_SPEED) * Math.min(1, elapsed / SPEED_RAMP_SECONDS);
    distance += speed * dt;
    scoreText.textContent = String(Math.floor(distance / 10));

    player.vy += GRAVITY * dt;
    player.y += player.vy * dt;
    if (player.y >= GROUND_Y - PLAYER_SIZE) {
      player.y = GROUND_Y - PLAYER_SIZE;
      if (!player.grounded) spawnLandingParticles();
      player.vy = 0;
      player.grounded = true;
    }
    player.rotation = player.grounded ? 0 : player.rotation + dt * 9;

    obstacles.forEach((obstacle) => { obstacle.x -= speed * dt; });
    obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.width > -20);
    ensureObstacles();

    particles.forEach((particle) => {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += GRAVITY * 0.6 * dt;
      particle.life -= dt;
    });
    particles = particles.filter((particle) => particle.life > 0);

    if (checkCollision()) endGame();
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    gradient.addColorStop(0, '#141728');
    gradient.addColorStop(1, '#0b0c14');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

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

  function drawPlayer() {
    const cx = PLAYER_X + PLAYER_SIZE / 2;
    const cy = player.y + PLAYER_SIZE / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(player.rotation);
    ctx.fillStyle = '#3dd6ff';
    ctx.shadowColor = 'rgba(61,214,255,0.65)';
    ctx.shadowBlur = 16;
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
    ctx.fillStyle = 'rgba(61,214,255,0.8)';
    particles.forEach((particle) => {
      ctx.globalAlpha = Math.max(0, particle.life / 0.4);
      ctx.fillRect(particle.x - 2, particle.y - 2, 4, 4);
    });
    ctx.globalAlpha = 1;
  }

  function draw() {
    drawBackground();
    obstacles.forEach(drawObstacle);
    drawGround();
    drawParticles();
    drawPlayer();
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
    resetGame();
    running = true;
    lastTime = performance.now();
    startOverlay.hidden = true;
    overOverlay.hidden = true;
    draw();
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
    if (document.hidden) running = false;
  });

  startButton.addEventListener('click', startGame);
  retryButton.addEventListener('click', startGame);
  muteButton.addEventListener('click', () => {
    muted = !muted;
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    updateMuteButton();
  });
  clearScoresButton.addEventListener('click', () => {
    localStorage.removeItem(SCORES_KEY);
    renderLeaderboard([]);
  });

  updateMuteButton();
  renderLeaderboard();
  player = createPlayer();
  draw();
})();
