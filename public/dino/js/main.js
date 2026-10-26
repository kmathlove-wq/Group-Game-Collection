// ===== main.js =====
// 입력·반복 실행(requestAnimationFrame + 고정 시간 단계)·기록·순위 연결.
(function (D) {
  'use strict';
  var R = D.Rules;
  var BEST_KEY = 'dino:best';

  var canvas = document.getElementById('game');
  var stage = document.getElementById('stage');
  var hintEl = document.getElementById('hint');
  var bannerEl = document.getElementById('banner');
  var statusEl = document.getElementById('status');
  var soundBtn = document.getElementById('soundBtn');
  var rankBtn = document.getElementById('rankBtn');

  D.Draw.init(canvas);

  function readBest() {
    try { var v = parseInt(localStorage.getItem(BEST_KEY), 10); return v > 0 ? Math.min(v, R.SCORE_MAX) : 0; } catch (e) { return 0; }
  }
  function writeBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* 무시 */ } }

  var best = readBest();
  var state = R.createState(Math.random);
  var clouds = [{ x: 90, y: 30 }, { x: 300, y: 18 }, { x: 470, y: 46 }];
  var blinkTimer = 0;
  var paused = false;
  var accumulator = 0;
  var lastTime = 0;

  var keyJump = false, keyDuck = false;
  var pointers = {};           // 포인터 번호 → 'jump' | 'duck'

  function say(el, text) { el.textContent = text; }

  function updateHint() {
    if (paused) say(hintEl, '다른 화면에 갔다 와서 잠깐 멈췄어요. 아무 키나 눌러 계속해요.');
    else if (state.phase === 'ready') say(hintEl, '스페이스 · ↑ · 화면 터치로 시작해요!');
    else if (state.phase === 'running') say(hintEl, '↑ 점프(오래 누르면 더 높이) · ↓ 숙이기 / 휴대폰은 위쪽 터치 = 점프, 아래쪽 터치 = 숙이기');
    else say(hintEl, R.canRestart(state) ? '스페이스 · 클릭 · 터치로 다시 시작해요!' : '잠깐만요…');
  }

  function updateSoundBtn() {
    var m = D.Sound.isMuted();
    soundBtn.textContent = m ? '🔇 소리 꺼짐' : '🔊 소리 켜짐';
    soundBtn.setAttribute('aria-pressed', m ? 'true' : 'false');
  }

  function startRun() {
    state = R.createState(Math.random);
    R.start(state);
    say(bannerEl, '');
    say(statusEl, '');
    blinkTimer = 0;
    accumulator = 0;
  }

  function handleGameOver() {
    var score = state.score;
    var isNew = score > best && score > 0;
    if (isNew) { best = score; writeBest(best); say(bannerEl, '🎉 새 최고 기록!'); }
    say(statusEl, score + '점');
    if (isNew) {
      if (D.Ranking.hasName()) {
        say(statusEl, score + '점 · 순위에 올리는 중…');
        D.Ranking.quickSubmit(score).then(function (msg) { say(statusEl, score + '점 · ' + msg); });
      } else {
        D.Ranking.show(score);
      }
    }
  }

  // 게임 시작/점프/다시 시작을 한 군데에서 처리한다.
  function pressAction() {
    D.Sound.unlock();
    if (state.phase === 'ready') {
      R.start(state);
    } else if (state.phase === 'over') {
      if (R.canRestart(state)) startRun();
    }
  }

  function inputNow() {
    var pj = false, pd = false, id;
    for (id in pointers) { if (pointers[id] === 'jump') pj = true; else pd = true; }
    return { jump: keyJump || pj, duck: keyDuck || pd };
  }

  function tick(dt) {
    var wasRunning = state.phase === 'running';
    var scrollSpeed = state.speed;
    R.step(state, inputNow());
    for (var i = 0; i < state.events.length; i++) {
      var ev = state.events[i];
      if (ev === 'jump') D.Sound.jump();
      else if (ev === 'milestone') { D.Sound.milestone(); blinkTimer = 0.9; }
      else if (ev === 'crash') { D.Sound.crash(); handleGameOver(); }
    }
    if (blinkTimer > 0) blinkTimer = Math.max(0, blinkTimer - dt);
    if (wasRunning) {
      for (var c = 0; c < clouds.length; c++) {
        clouds[c].x -= scrollSpeed * dt * 0.1;
        if (clouds[c].x < -50) { clouds[c].x = R.WIDTH + 10 + Math.random() * 80; clouds[c].y = 12 + Math.random() * 50; }
      }
    }
  }

  var lastHint = '';
  function frame(now) {
    requestAnimationFrame(frame);
    if (paused || D.Ranking.isOpen()) { lastTime = now; return; }
    if (!lastTime) lastTime = now;
    var elapsed = Math.min(0.25, (now - lastTime) / 1000);
    lastTime = now;
    accumulator += elapsed;
    while (accumulator >= R.DT) {
      tick(R.DT);
      accumulator -= R.DT;
    }
    var blinkOn = blinkTimer <= 0 || Math.floor(blinkTimer / 0.15) % 2 === 1;
    D.Draw.render({ state: state, clouds: clouds, scroll: state.distance, blinkOn: blinkOn, best: best });
    var h = state.phase + (state.phase === 'over' ? R.canRestart(state) : '');
    if (h !== lastHint) { lastHint = h; updateHint(); }
  }

  // ---- 키보드 ----
  function isJumpKey(k) { return k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W'; }
  function isDuckKey(k) { return k === 'ArrowDown' || k === 's' || k === 'S'; }
  window.addEventListener('keydown', function (e) {
    if (D.Ranking.isOpen()) return;
    var k = e.key;
    if (paused && (isJumpKey(k) || isDuckKey(k))) { resume(); e.preventDefault(); return; }
    if (isJumpKey(k)) {
      e.preventDefault();
      if (!e.repeat) pressAction();
      keyJump = true;
    } else if (isDuckKey(k)) {
      e.preventDefault();
      keyDuck = true;
    }
  });
  window.addEventListener('keyup', function (e) {
    if (isJumpKey(e.key)) keyJump = false;
    else if (isDuckKey(e.key)) keyDuck = false;
  });

  // ---- 터치·마우스 (게임판 전체) ----
  stage.addEventListener('pointerdown', function (e) {
    if (D.Ranking.isOpen()) return;
    if (paused) { resume(); return; }
    e.preventDefault();
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    var rect = stage.getBoundingClientRect();
    var lower = (e.clientY - rect.top) > rect.height / 2;
    var kind = (state.phase === 'running' && lower && e.pointerType !== 'mouse') ? 'duck' : 'jump';
    pointers[e.pointerId] = kind;
    if (kind === 'jump') pressAction();
  });
  function releasePointer(e) { delete pointers[e.pointerId]; }
  stage.addEventListener('pointerup', releasePointer);
  stage.addEventListener('pointercancel', releasePointer);
  stage.addEventListener('lostpointercapture', releasePointer);
  stage.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // ---- 일시정지 (다른 탭에 가면) ----
  function pause() {
    if (paused || state.phase !== 'running') return;
    paused = true;
    keyJump = false; keyDuck = false; pointers = {};
    updateHint();
  }
  function resume() {
    paused = false;
    lastTime = 0;
    accumulator = 0;
    updateHint();
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); });
  window.addEventListener('blur', pause);

  // ---- 단추 ----
  soundBtn.addEventListener('click', function () {
    D.Sound.setMuted(!D.Sound.isMuted());
    D.Sound.unlock();
    updateSoundBtn();
    soundBtn.blur();
  });
  rankBtn.addEventListener('click', function () {
    D.Ranking.show(0);
    rankBtn.blur();
  });

  updateSoundBtn();
  updateHint();
  requestAnimationFrame(frame);

  // 시험·확인용 통로
  D.debug = { get state() { return state; }, R: R };
})(window.Dino);
