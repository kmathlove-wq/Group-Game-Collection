(() => {
  'use strict';

  // 원작 게임의 그래픽·음원을 쓰지 않는 독자 구현. "네모가 점프해서
  // 장애물을 피한다"는 장르 규칙만 참고하고, 도형·배경음악·효과음은 전부 새로 만든다.
  const NICKNAME_KEY = 'catchmind:nickname';
  const MUTE_KEY = 'group-game:geometry-dash:muted:v1';
  const BEST_LOCAL_KEY = 'group-game:geometry-dash:bestLocal:v1';
  const MY_BEST_RANK_KEY = 'group-game:geometry-dash:bestRank:v1';

  const CANVAS_W = 900;
  const CANVAS_H = 340;
  const GROUND_H = 60;
  const GROUND_Y = CANVAS_H - GROUND_H;
  const PLAYER_X = 140;
  const PLAYER_SIZE = 40;
  const GRAVITY = 2200;
  const JUMP_VELOCITY = -760;
  const START_SPEED = 380;
  const MAX_SPEED = 640;
  const SPEED_RAMP_SECONDS = 45;
  const GAP_MIN = 260;
  const GAP_MAX = 460;
  const HITBOX_INSET = 6;
  const MAX_DELTA = 1 / 30;
  const MILESTONE_STEP = 1000; // distance 단위, 100m마다

  // 비행 구간: 누르고 있으면 위로, 떼면 아래로 떨어지는 자체 제작 "날기" 모드.
  const FLIGHT_TOP = 25;
  const FLIGHT_BOTTOM = GROUND_Y;
  const FLIGHT_GRAVITY = 1200;
  const FLIGHT_THRUST = 2400;
  const FLIGHT_MAX_VY = 240;
  const FLIGHT_CORRIDOR_GAP = 170;
  const FLIGHT_CENTER_MIN = 115;
  const FLIGHT_CENTER_MAX = 190;
  const FLIGHT_ZONE_MIN_LEN = 1000;
  const FLIGHT_ZONE_MAX_LEN = 1500;
  const FLIGHT_COOLDOWN_MIN = 1500;
  const FLIGHT_COOLDOWN_MAX = 2400;
  const FLIGHT_PAIR_GAP_MIN = 350;
  const FLIGHT_PAIR_GAP_MAX = 480;
  const FLIGHT_ENTRY_BUFFER = 260;
  const FLIGHT_EXIT_BUFFER = 80;
  const FLIGHT_WALL_WIDTH = 46;
  const FLIGHT_HOLE_WIDTH = 50;
  const FLIGHT_HOLE_GAP = FLIGHT_CORRIDOR_GAP;
  const FLIGHT_SPIKE_WIDTH = 34;
  const FLIGHT_SPIKE_HEIGHT_MIN = 50;
  const FLIGHT_SPIKE_HEIGHT_MAX = 80;
  const FLIGHT_APPROACH_CLEARANCE = 200; // 비행 구간 시작 전 장애물 없는 구간
  const FLIGHT_LANDING_RECOVERY_MIN = 450; // 비행 구간이 끝난 뒤 착지할 여유 거리
  const FLIGHT_LANDING_RECOVERY_MAX = 650;

  // flight-hole.png 원본 그림에서 "구멍"이 차지하는 세로 비율(0~1). 실제 통과 폭은
  // 매번 달라지므로, 이 비율로 그림을 위/아래로 잘라 늘려서 진짜 통과 지점에 맞춘다.
  const FLIGHT_HOLE_TOP_FRAC = 0.2956;
  const FLIGHT_HOLE_BOTTOM_FRAC = 0.7014;

  // ---------- 나노바나나로 만든 게임 그림 ----------
  const ASSET_SOURCES = {
    background: '/assets/geometry-dash/background.png',
    playerGround: '/assets/geometry-dash/player-ground.png',
    playerFlight: '/assets/geometry-dash/player-flight.png',
    spike: '/assets/geometry-dash/spike.png',
    block: '/assets/geometry-dash/block.png',
    flightWall: '/assets/geometry-dash/flight-wall.png',
    flightSpike: '/assets/geometry-dash/flight-spike.png',
    flightHole: '/assets/geometry-dash/flight-hole.png',
    groundStrip: '/assets/geometry-dash/ground-strip.png'
  };
  const assets = {};

  function loadImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null); // 못 불러와도 게임은 계속 진행한다.
      img.src = src;
    });
  }

  async function loadAssets() {
    const entries = Object.entries(ASSET_SOURCES);
    const images = await Promise.all(entries.map(([, src]) => loadImage(src)));
    entries.forEach(([key], index) => { assets[key] = images[index]; });
    startButton.disabled = false;
    startButton.textContent = '시작하기';
  }

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
  const myBestRankText = document.querySelector('#gdMyBestRankText');
  const refreshScoresButton = document.querySelector('#gdRefreshScoresButton');
  const nameInput = document.querySelector('#gdNameInput');

  let muted = localStorage.getItem(MUTE_KEY) === '1';
  let audioCtx = null;
  let bgmState = null;
  let player = null;
  let obstacles = [];
  let particles = [];
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
  let jumpHeld = false;
  let groundCursorX = 0;
  let flightCursorX = 0;
  let flightZones = [];
  let flightCenterY = (FLIGHT_CENTER_MIN + FLIGHT_CENTER_MAX) / 2;

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

  function renderMyBestRank() {
    const raw = localStorage.getItem(MY_BEST_RANK_KEY);
    if (!raw) { myBestRankText.textContent = ''; return; }
    try {
      const { name, score, rank } = JSON.parse(raw);
      myBestRankText.textContent = rank
        ? `내 최고 기록: ${name} · ${score}m · 전체 ${rank}위`
        : `내 최고 기록: ${name} · ${score}m · 순위표 50위 밖`;
    } catch {
      myBestRankText.textContent = '';
    }
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
    const bestLocal = Number(localStorage.getItem(BEST_LOCAL_KEY) || 0);
    const isNewBest = score > bestLocal;
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
      if (isNewBest) {
        localStorage.setItem(MY_BEST_RANK_KEY, JSON.stringify({ name, score, rank: data.rank || null }));
        renderMyBestRank();
      }
    } catch {
      rankText.textContent = '순위 제출에 실패했어요. 인터넷 연결을 확인해 주세요.';
      fetchLeaderboard();
    }
    if (isNewBest) localStorage.setItem(BEST_LOCAL_KEY, String(score));
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

  const SPIKE_COUNTS = { spike: 1, 'spike-double': 2, 'spike-triple': 3 };

  function createObstacle(x) {
    const roll = Math.random();
    if (roll < 0.4) return { type: 'spike', x, width: 34, height: 38 };
    if (roll < 0.6) return { type: 'spike-double', x, width: 64, height: 38 };
    if (roll < 0.72) return { type: 'spike-triple', x, width: 94, height: 38 };
    if (roll < 0.88) {
      const height = 40 + Math.round(Math.random() * 55);
      return { type: 'block', x, width: 42, height };
    }
    return { type: 'pit', x, width: Math.round(randomRange(90, 150)) };
  }

  function ensureObstacles() {
    while (groundCursorX < CANVAS_W + 220) {
      const blockingZone = flightZones.find((zone) => groundCursorX >= zone.x - FLIGHT_APPROACH_CLEARANCE && groundCursorX < zone.x + zone.width + 40);
      if (blockingZone) {
        groundCursorX = blockingZone.x + blockingZone.width + randomRange(FLIGHT_LANDING_RECOVERY_MIN, FLIGHT_LANDING_RECOVERY_MAX);
        continue;
      }
      const obstacle = createObstacle(groundCursorX);
      obstacles.push(obstacle);
      groundCursorX = obstacle.x + obstacle.width + randomRange(GAP_MIN, GAP_MAX);
    }
  }

  function ensureFlightZones() {
    while (flightCursorX < CANVAS_W + 400) {
      const length = randomRange(FLIGHT_ZONE_MIN_LEN, FLIGHT_ZONE_MAX_LEN);
      flightZones.push({ x: flightCursorX, width: length, spawnCursor: flightCursorX + FLIGHT_ENTRY_BUFFER });
      flightCursorX += length + randomRange(FLIGHT_COOLDOWN_MIN, FLIGHT_COOLDOWN_MAX);
    }
  }

  function ensureFlightObstacles() {
    flightZones.forEach((zone) => {
      while (zone.spawnCursor < zone.x + zone.width - FLIGHT_EXIT_BUFFER) {
        const roll = Math.random();
        if (roll < 0.45) {
          flightCenterY = Math.max(FLIGHT_CENTER_MIN, Math.min(FLIGHT_CENTER_MAX, flightCenterY + randomRange(-25, 25)));
          const top = flightCenterY - FLIGHT_CORRIDOR_GAP / 2;
          const bottom = flightCenterY + FLIGHT_CORRIDOR_GAP / 2;
          obstacles.push({ type: 'flight-ceiling', x: zone.spawnCursor, width: FLIGHT_WALL_WIDTH, height: top - FLIGHT_TOP });
          obstacles.push({ type: 'flight-floor', x: zone.spawnCursor, width: FLIGHT_WALL_WIDTH, height: FLIGHT_BOTTOM - bottom });
          zone.spawnCursor += FLIGHT_WALL_WIDTH + randomRange(FLIGHT_PAIR_GAP_MIN, FLIGHT_PAIR_GAP_MAX);
        } else if (roll < 0.8) {
          const fromCeiling = Math.random() < 0.5;
          const height = randomRange(FLIGHT_SPIKE_HEIGHT_MIN, FLIGHT_SPIKE_HEIGHT_MAX);
          obstacles.push({
            type: fromCeiling ? 'flight-spike-ceiling' : 'flight-spike-floor',
            x: zone.spawnCursor, width: FLIGHT_SPIKE_WIDTH, height
          });
          zone.spawnCursor += FLIGHT_SPIKE_WIDTH + randomRange(FLIGHT_PAIR_GAP_MIN, FLIGHT_PAIR_GAP_MAX);
        } else {
          flightCenterY = Math.max(FLIGHT_CENTER_MIN, Math.min(FLIGHT_CENTER_MAX, flightCenterY + randomRange(-25, 25)));
          const top = flightCenterY - FLIGHT_HOLE_GAP / 2;
          const bottom = flightCenterY + FLIGHT_HOLE_GAP / 2;
          obstacles.push({ type: 'flight-hole-top', x: zone.spawnCursor, width: FLIGHT_HOLE_WIDTH, height: top - FLIGHT_TOP });
          obstacles.push({ type: 'flight-hole-bottom', x: zone.spawnCursor, width: FLIGHT_HOLE_WIDTH, height: FLIGHT_BOTTOM - bottom });
          zone.spawnCursor += FLIGHT_HOLE_WIDTH + randomRange(FLIGHT_PAIR_GAP_MIN, FLIGHT_PAIR_GAP_MAX);
        }
      }
    });
  }

  function isInFlightZone() {
    const left = PLAYER_X + HITBOX_INSET;
    const right = PLAYER_X + PLAYER_SIZE - HITBOX_INSET;
    return flightZones.some((zone) => zone.x < right && zone.x + zone.width > left);
  }

  function resetGame() {
    player = createPlayer();
    obstacles = [];
    particles = [];
    speed = START_SPEED;
    elapsed = 0;
    distance = 0;
    shakeTime = 0;
    flashTime = 0;
    nextMilestoneAt = MILESTONE_STEP;
    jumpHeld = false;
    groundCursorX = CANVAS_W + 260;
    flightCursorX = CANVAS_W + 900;
    flightZones = [];
    flightCenterY = (FLIGHT_CENTER_MIN + FLIGHT_CENTER_MAX) / 2;
    ensureObstacles();
    ensureFlightZones();
    ensureFlightObstacles();
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

  const FLIGHT_TOP_TYPES = new Set(['flight-ceiling', 'flight-spike-ceiling', 'flight-hole-top']);
  const FLIGHT_BOTTOM_TYPES = new Set(['flight-floor', 'flight-spike-floor', 'flight-hole-bottom']);

  function obstacleHitbox(obstacle) {
    if (FLIGHT_TOP_TYPES.has(obstacle.type)) {
      return { x: obstacle.x + 3, y: FLIGHT_TOP, width: obstacle.width - 6, height: obstacle.height };
    }
    if (FLIGHT_BOTTOM_TYPES.has(obstacle.type)) {
      return { x: obstacle.x + 3, y: FLIGHT_BOTTOM - obstacle.height, width: obstacle.width - 6, height: obstacle.height };
    }
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
    return obstacles.some((obstacle) => obstacle.type !== 'pit' && boxesOverlap(hitbox, obstacleHitbox(obstacle)));
  }

  function isOverPit() {
    const left = PLAYER_X + HITBOX_INSET;
    const right = PLAYER_X + PLAYER_SIZE - HITBOX_INSET;
    return obstacles.some((obstacle) => obstacle.type === 'pit' && obstacle.x < right && obstacle.x + obstacle.width > left);
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

    const inFlight = isInFlightZone();
    if (inFlight) {
      const accel = jumpHeld ? FLIGHT_GRAVITY - FLIGHT_THRUST : FLIGHT_GRAVITY;
      player.vy = Math.max(-FLIGHT_MAX_VY, Math.min(FLIGHT_MAX_VY, player.vy + accel * dt));
      player.y += player.vy * dt;
      player.grounded = false;
      player.rotation = (player.vy / FLIGHT_MAX_VY) * 0.5;
      if (player.y < FLIGHT_TOP) { player.y = FLIGHT_TOP; player.vy = Math.max(0, player.vy); }
      if (player.y > FLIGHT_BOTTOM - PLAYER_SIZE) { player.y = FLIGHT_BOTTOM - PLAYER_SIZE; player.vy = Math.min(0, player.vy); }
      if (jumpHeld && Math.random() < dt * 40) {
        particles.push({
          x: PLAYER_X, y: player.y + PLAYER_SIZE / 2, vx: -speed * 0.5, vy: randomRange(-30, 30),
          life: 0.3, maxLife: 0.3, color: 'rgba(139,91,255,0.7)'
        });
      }
    } else {
      player.vy += GRAVITY * dt;
      player.y += player.vy * dt;
      const overPit = isOverPit();
      if (player.y >= GROUND_Y - PLAYER_SIZE) {
        if (overPit) {
          player.grounded = false;
          if (player.y >= GROUND_Y - PLAYER_SIZE + 10) { endGame(); return; }
        } else {
          player.y = GROUND_Y - PLAYER_SIZE;
          if (!player.grounded) {
            spawnBurst(PLAYER_X + PLAYER_SIZE / 2, GROUND_Y, 5, ['#3dd6ff'], 110);
            playTone(180, 0.05, 'triangle', 0.05);
          }
          player.vy = 0;
          player.grounded = true;
        }
      }
      player.rotation = player.grounded ? 0 : player.rotation + dt * 9;

      if (player.grounded && Math.random() < dt * 22) {
        particles.push({
          x: PLAYER_X, y: player.y + PLAYER_SIZE - 4, vx: -speed * 0.4, vy: -20,
          life: 0.25, maxLife: 0.25, color: 'rgba(61,214,255,0.6)'
        });
      }
    }

    obstacles.forEach((obstacle) => { obstacle.x -= speed * dt; });
    obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.width > -20);
    groundCursorX -= speed * dt;
    ensureObstacles();

    flightCursorX -= speed * dt;
    flightZones.forEach((zone) => { zone.x -= speed * dt; zone.spawnCursor -= speed * dt; });
    flightZones = flightZones.filter((zone) => zone.x + zone.width > -20);
    ensureFlightZones();
    ensureFlightObstacles();

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
    const img = assets.background;
    if (!img) {
      ctx.fillStyle = '#0b0c14';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      return;
    }
    // 배경 그림 한 장을 두 번 나란히 그려서 옆으로 계속 이어지게 만든다(이음매는 약간 보일 수 있음).
    const scroll = (distance * 0.15) % CANVAS_W;
    ctx.drawImage(img, -scroll, 0, CANVAS_W, CANVAS_H);
    ctx.drawImage(img, CANVAS_W - scroll, 0, CANVAS_W, CANVAS_H);
  }

  function drawGround() {
    const img = assets.groundStrip;
    if (img) {
      const tileWidth = GROUND_H * (img.width / img.height);
      const scroll = distance % tileWidth;
      for (let x = -scroll; x < CANVAS_W; x += tileWidth) {
        ctx.drawImage(img, x, GROUND_Y, tileWidth, GROUND_H);
      }
    } else {
      ctx.fillStyle = '#12141f';
      ctx.fillRect(0, GROUND_Y, CANVAS_W, GROUND_H);
    }
    obstacles.forEach((obstacle) => {
      if (obstacle.type !== 'pit') return;
      const voidGradient = ctx.createLinearGradient(0, GROUND_Y, 0, CANVAS_H);
      voidGradient.addColorStop(0, '#05060a');
      voidGradient.addColorStop(1, '#0b0c14');
      ctx.fillStyle = voidGradient;
      ctx.fillRect(obstacle.x, GROUND_Y, obstacle.width, GROUND_H);
      ctx.fillStyle = '#ff3d63';
      ctx.fillRect(obstacle.x - 3, GROUND_Y, 4, 12);
      ctx.fillRect(obstacle.x + obstacle.width - 1, GROUND_Y, 4, 12);
    });
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
    const flying = isInFlightZone();
    const img = flying ? assets.playerFlight : assets.playerGround;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(player.rotation);
    if (img) {
      // 그림 비율을 유지하면서 정사각형 판정 영역 안에 맞춘다.
      const scale = PLAYER_SIZE / Math.max(img.width, img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    } else {
      ctx.fillStyle = flying ? '#c79bff' : '#3dd6ff';
      ctx.fillRect(-PLAYER_SIZE / 2, -PLAYER_SIZE / 2, PLAYER_SIZE, PLAYER_SIZE);
    }
    ctx.restore();
  }

  function drawBlockObstacle(obstacle) {
    const img = assets.block;
    const x = obstacle.x;
    const y = GROUND_Y - obstacle.height;
    if (img) {
      ctx.drawImage(img, x, y, obstacle.width, obstacle.height);
    } else {
      ctx.fillStyle = '#ff6a3d';
      ctx.fillRect(x, y, obstacle.width, obstacle.height);
    }
  }

  function drawSpikeCluster(obstacle) {
    const img = assets.spike;
    const spikeCount = SPIKE_COUNTS[obstacle.type] || 1;
    const spikeWidth = obstacle.width / spikeCount;
    for (let i = 0; i < spikeCount; i += 1) {
      const startX = obstacle.x + i * spikeWidth;
      if (img) {
        ctx.drawImage(img, startX, GROUND_Y - obstacle.height, spikeWidth, obstacle.height);
      } else {
        ctx.fillStyle = '#ff3d63';
        ctx.beginPath();
        ctx.moveTo(startX, GROUND_Y);
        ctx.lineTo(startX + spikeWidth / 2, GROUND_Y - obstacle.height);
        ctx.lineTo(startX + spikeWidth, GROUND_Y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawFlightWall(obstacle) {
    const img = assets.flightWall;
    const isCeiling = obstacle.type === 'flight-ceiling';
    const y = isCeiling ? FLIGHT_TOP : FLIGHT_BOTTOM - obstacle.height;
    if (!img) {
      ctx.fillStyle = '#8b5bff';
      ctx.fillRect(obstacle.x, y, obstacle.width, obstacle.height);
      return;
    }
    ctx.save();
    if (isCeiling) {
      ctx.drawImage(img, obstacle.x, y, obstacle.width, obstacle.height);
    } else {
      // 그림은 천장에 붙는 모양이라, 바닥용은 위아래로 뒤집어서 그대로 재사용한다.
      ctx.translate(obstacle.x, y + obstacle.height);
      ctx.scale(1, -1);
      ctx.drawImage(img, 0, 0, obstacle.width, obstacle.height);
    }
    ctx.restore();
  }

  function drawFlightSpike(obstacle) {
    const img = assets.flightSpike;
    const fromCeiling = obstacle.type === 'flight-spike-ceiling';
    const y = fromCeiling ? FLIGHT_TOP : FLIGHT_BOTTOM - obstacle.height;
    if (!img) {
      ctx.fillStyle = '#ffb23d';
      ctx.fillRect(obstacle.x, y, obstacle.width, obstacle.height);
      return;
    }
    ctx.save();
    if (fromCeiling) {
      ctx.drawImage(img, obstacle.x, y, obstacle.width, obstacle.height);
    } else {
      // 그림은 천장에서 아래로 향한 가시라, 바닥용은 뒤집어서 위로 향하게 한다.
      ctx.translate(obstacle.x, y + obstacle.height);
      ctx.scale(1, -1);
      ctx.drawImage(img, 0, 0, obstacle.width, obstacle.height);
    }
    ctx.restore();
  }

  // 그림 속 "구멍"은 세로 위치가 고정돼 있지만, 실제로 지나갈 수 있는 위치는 매번 달라진다.
  // 그림을 구멍 위/아래로 잘라서(source crop) 실제 통과 지점에 맞춰 늘려 그리면 위치가 항상 맞는다.
  function drawFlightHolePair(topObstacle, bottomObstacle) {
    const img = assets.flightHole;
    const x = topObstacle.x;
    const width = topObstacle.width;
    const holeTop = FLIGHT_TOP + topObstacle.height;
    const holeBottom = FLIGHT_BOTTOM - bottomObstacle.height;
    if (!img) {
      ctx.fillStyle = '#2fb87a';
      if (holeTop > FLIGHT_TOP) ctx.fillRect(x, FLIGHT_TOP, width, holeTop - FLIGHT_TOP);
      if (FLIGHT_BOTTOM > holeBottom) ctx.fillRect(x, holeBottom, width, FLIGHT_BOTTOM - holeBottom);
      return;
    }
    const srcHoleTop = img.height * FLIGHT_HOLE_TOP_FRAC;
    const srcHoleBottom = img.height * FLIGHT_HOLE_BOTTOM_FRAC;
    if (holeTop > FLIGHT_TOP) {
      ctx.drawImage(img, 0, 0, img.width, srcHoleTop, x, FLIGHT_TOP, width, holeTop - FLIGHT_TOP);
    }
    if (FLIGHT_BOTTOM > holeBottom) {
      ctx.drawImage(
        img, 0, srcHoleBottom, img.width, img.height - srcHoleBottom,
        x, holeBottom, width, FLIGHT_BOTTOM - holeBottom
      );
    }
  }

  function drawObstacle(obstacle) {
    if (obstacle.type === 'pit') return;
    if (obstacle.type === 'block') { drawBlockObstacle(obstacle); return; }
    if (obstacle.type === 'flight-ceiling' || obstacle.type === 'flight-floor') { drawFlightWall(obstacle); return; }
    if (obstacle.type === 'flight-spike-ceiling' || obstacle.type === 'flight-spike-floor') { drawFlightSpike(obstacle); return; }
    if (obstacle.type === 'flight-hole-top') {
      const partner = obstacles.find((other) => other.type === 'flight-hole-bottom' && other.x === obstacle.x);
      if (partner) drawFlightHolePair(obstacle, partner);
      return;
    }
    if (obstacle.type === 'flight-hole-bottom') return; // 짝인 flight-hole-top이 한 번에 같이 그린다.
    drawSpikeCluster(obstacle);
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
    if (isInFlightZone()) {
      ctx.fillStyle = 'rgba(139,91,255,0.08)';
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

  function handlePressStart() {
    if (!running) return;
    if (isInFlightZone()) { jumpHeld = true; return; }
    jump();
  }

  function handlePressEnd() {
    jumpHeld = false;
  }

  document.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' && event.code !== 'ArrowUp') return;
    event.preventDefault();
    handlePressStart();
  });
  document.addEventListener('keyup', (event) => {
    if (event.code !== 'Space' && event.code !== 'ArrowUp') return;
    handlePressEnd();
  });
  canvas.addEventListener('pointerdown', (event) => { event.preventDefault(); handlePressStart(); });
  canvas.addEventListener('pointerup', handlePressEnd);
  canvas.addEventListener('pointercancel', handlePressEnd);
  canvas.addEventListener('pointerleave', handlePressEnd);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      running = false;
      jumpHeld = false;
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
  renderMyBestRank();
  player = createPlayer();
  startButton.disabled = true;
  startButton.textContent = '그림 불러오는 중…';
  loadAssets().then(draw);
})();
