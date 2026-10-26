// ===== main.js =====
// 새 찾기 진행: 단계마다 새 숲(무작위 씨앗) → 제한 시간 안에 새를 모두 누르면 다음 단계, 시간이 끝나면 게임 끝.
// localStorage: 'bird-find:best'(최고 점수), 'bird-find:sound'('off'면 소리 끔). 글은 textContent로만 넣는다.
(function (BF) {
  'use strict';
  var S = BF.Scene, D = BF.Draw;
  var $ = function (id) { return document.getElementById(id); };
  var BEST_KEY = 'bird-find:best', SOUND_KEY = 'bird-find:sound';
  var RES = 2; // 캔버스 화소 = 논리 크기 × 2(확대해도 선명하게)

  var canvas = $('game');
  var ctx = canvas.getContext('2d');
  canvas.width = S.W * RES; canvas.height = S.H * RES;
  var bg = document.createElement('canvas');
  bg.width = canvas.width; bg.height = canvas.height;
  var bgCtx = bg.getContext('2d');
  var ranking = window.GroupRanking.create({ slug: 'bird-find', unit: '점', top: 50 });

  var state = {
    phase: 'ready',   // ready · playing · paused · cleared · over
    level: 1, score: 0, timeLeft: S.LEVEL_SECONDS, scene: null,
    hintsLeft: 1, hint: null, misses: [], now: 0, submitted: false
  };

  function get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function set(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* 무시 */ } }

  // ----- 소리(파일 없이 웹오디오로 합성) -----
  var audio = null;
  var muted = get(SOUND_KEY) === 'off';
  function refreshSoundBtn() {
    $('soundBtn').textContent = muted ? '🔇' : '🔊';
    $('soundBtn').setAttribute('aria-pressed', String(muted));
    $('soundBtn').setAttribute('aria-label', muted ? '소리 켜기' : '소리 끄기');
  }
  refreshSoundBtn();
  function beep(notes, type) {
    if (muted) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var t = audio.currentTime;
      notes.forEach(function (n, i) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.type = type || 'sine';
        o.frequency.value = n;
        g.gain.setValueAtTime(0.0001, t + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.09 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.2);
        o.connect(g); g.connect(audio.destination);
        o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.22);
      });
    } catch (e) { /* 소리가 안 돼도 게임은 계속 */ }
  }
  var sound = {
    found: function () { beep([880, 1320]); },
    wrong: function () { beep([200, 150], 'square'); },
    clear: function () { beep([660, 880, 990, 1320]); },
    over: function () { beep([440, 330, 220], 'triangle'); }
  };

  // ----- 화면 표시 -----
  function hud() {
    $('levelLabel').textContent = state.level + '단계';
    $('leftLabel').textContent = '🐦 남은 새 ' + (state.scene ? S.remaining(state.scene) : 0);
    $('timeLabel').textContent = '⏱ ' + Math.ceil(state.timeLeft);
    $('timeLabel').classList.toggle('low', state.timeLeft <= 10);
    $('scoreLabel').textContent = state.score.toLocaleString('ko-KR') + '점';
    $('timerBar').style.width = (state.timeLeft / S.LEVEL_SECONDS * 100) + '%';
    $('hintLeft').textContent = state.hintsLeft;
    $('hintBtn').disabled = state.phase !== 'playing' || state.hintsLeft <= 0;
    $('pauseBtn').textContent = state.phase === 'paused' ? '▶ 계속' : '⏸ 멈춤';
    $('pauseBtn').disabled = state.phase !== 'playing' && state.phase !== 'paused';
  }

  function overlay(emoji, title, text, button, showRank) {
    $('ovEmoji').textContent = emoji;
    $('ovTitle').textContent = title;
    $('ovText').textContent = text;
    $('ovBtn').textContent = button;
    $('ovRank').hidden = !showRank;
    var best = Number(get(BEST_KEY)) || 0;
    $('ovBest').textContent = best ? '🏅 내 최고 점수 ' + best.toLocaleString('ko-KR') + '점' : '';
    $('overlay').hidden = false;
    $('ovBtn').focus();
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);
    if (state.scene) {
      ctx.setTransform(RES, 0, 0, RES, 0, 0);
      D.marks(ctx, state.scene, state);
    }
  }

  // ----- 진행 -----
  function startLevel() {
    var seed = (Math.random() * 4294967296) >>> 0;
    state.scene = S.build(state.level, seed);
    state.timeLeft = S.LEVEL_SECONDS;
    state.hintsLeft = 1;
    state.hint = null;
    state.misses = [];
    bgCtx.setTransform(RES, 0, 0, RES, 0, 0);
    D.scene(bgCtx, state.scene);
    state.phase = 'playing';
    $('overlay').hidden = true;
    hud();
    render();
  }

  function newGame() {
    state.level = 1; state.score = 0; state.submitted = false;
    startLevel();
  }

  function levelCleared() {
    var bonus = S.clearBonus(state.timeLeft);
    state.score = Math.min(S.SCORE_MAX, state.score + bonus);
    state.phase = 'cleared';
    sound.clear();
    hud();
    setTimeout(function () {
      overlay('🎉', state.level + '단계 성공!', '남은 시간 보너스 +' + bonus + '점\n다음 단계는 새가 ' + S.levelInfo(state.level + 1).birds + '마리, 더 꼭꼭 숨어 있어요!', '다음 단계 →', false);
    }, 600);
  }

  function gameOver() {
    state.phase = 'over';
    sound.over();
    state.misses = [];
    state.hint = null;
    var best = Number(get(BEST_KEY)) || 0;
    var record = state.score > best;
    if (record) set(BEST_KEY, String(state.score));
    hud();
    render();
    drawMissed();
    setTimeout(function () {
      overlay('⏰', '시간 끝!', state.level + '단계까지 와서 ' + state.score.toLocaleString('ko-KR') + '점을 얻었어요.' + (record ? '\n🏅 최고 점수 새 기록!' : '') + '\n노란 동그라미가 못 찾은 새예요.', '처음부터 다시', state.score > 0);
    }, 1400);
  }

  // 게임이 끝나면 못 찾은 새 자리에 노란 동그라미
  function drawMissed() {
    ctx.setTransform(RES, 0, 0, RES, 0, 0);
    ctx.strokeStyle = '#ffd60a'; ctx.lineWidth = 5;
    state.scene.birds.forEach(function (b) {
      if (b.found) return;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.size * 1.4, 0, Math.PI * 2); ctx.stroke();
    });
  }

  canvas.addEventListener('click', function (e) {
    if (state.phase !== 'playing') return;
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) / rect.width * S.W;
    var y = (e.clientY - rect.top) / rect.height * S.H;
    var b = S.hit(state.scene, x, y);
    if (b) {
      b.found = true;
      state.score = Math.min(S.SCORE_MAX, state.score + S.birdPoints(state.level));
      if (state.hint && state.hint.bird === b) state.hint = null;
      sound.found();
      if (S.remaining(state.scene) === 0) levelCleared();
    } else {
      state.timeLeft = Math.max(0, state.timeLeft - S.WRONG_PENALTY);
      state.misses.push({ x: x, y: y, at: performance.now() });
      sound.wrong();
    }
    hud();
  });

  $('hintBtn').addEventListener('click', function () {
    if (state.phase !== 'playing' || state.hintsLeft <= 0) return;
    var left = state.scene.birds.filter(function (b) { return !b.found; });
    if (!left.length) return;
    var b = left[Math.floor(Math.random() * left.length)];
    // 정확한 자리 대신 "이 근처" 동그라미(새 크기 4배, 가운데를 조금 비껴서)
    var a = Math.random() * Math.PI * 2, off = b.size * 1.5;
    state.hint = { bird: b, x: b.x + Math.cos(a) * off, y: b.y + Math.sin(a) * off, r: b.size * 4, at: performance.now() };
    state.hintsLeft--;
    hud();
  });

  function togglePause() {
    if (state.phase === 'playing') { state.phase = 'paused'; overlay('⏸', '잠깐 멈춤', '준비되면 계속해요.', '계속하기', false); }
    else if (state.phase === 'paused') { state.phase = 'playing'; $('overlay').hidden = true; }
    hud();
  }
  $('pauseBtn').addEventListener('click', togglePause);
  document.addEventListener('visibilitychange', function () { if (document.hidden && state.phase === 'playing') togglePause(); });

  $('ovBtn').addEventListener('click', function () {
    if (state.phase === 'ready' || state.phase === 'over') newGame();
    else if (state.phase === 'cleared') { state.level++; startLevel(); }
    else if (state.phase === 'paused') togglePause();
  });
  $('ovRank').addEventListener('click', function () {
    if (state.submitted) return ranking.show(0);
    state.submitted = true;
    $('ovRank').hidden = true;
    ranking.show(state.score);
  });
  $('rankBtn').addEventListener('click', function () {
    if (state.phase === 'playing') togglePause();
    ranking.show(0);
  });
  $('soundBtn').addEventListener('click', function () {
    muted = !muted;
    set(SOUND_KEY, muted ? 'off' : 'on');
    refreshSoundBtn();
  });
  $('zoomBtn').addEventListener('click', function () {
    var on = !$('viewport').classList.contains('zoomed');
    $('viewport').classList.toggle('zoomed', on);
    $('zoomBtn').setAttribute('aria-pressed', String(on));
    $('zoomBtn').textContent = on ? '🔍 원래대로' : '🔍 크게 보기';
  });

  // ----- 시간 흐름 -----
  var last = performance.now();
  function loop(now) {
    var dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    state.now = now;
    if (state.phase === 'playing') {
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) { state.timeLeft = 0; gameOver(); }
      state.misses = state.misses.filter(function (m) { return now - m.at < 700; });
      if (state.hint && now - state.hint.at > 2500) state.hint = null;
      hud();
    }
    if (state.phase === 'playing' || state.phase === 'cleared') render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // 첫 화면: 연습용 숲을 뒤에 깔아 둔다
  state.scene = S.build(1, 12345);
  bgCtx.setTransform(RES, 0, 0, RES, 0, 0);
  D.scene(bgCtx, state.scene);
  render();
  hud();
  overlay('🐦', '새 찾기', '숲 속 어딘가에 새들이 숨어 있어요.\n제한 시간 ' + S.LEVEL_SECONDS + '초 안에 모두 찾아보세요!', '시작하기', false);
})(window.BirdFind);
