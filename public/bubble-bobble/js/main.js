// ===== main.js =====
// 부팅, 게임 루프(고정 timestep), 상태 머신.
(function (BB) {
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // --- 게임 전체 상태 ---
  BB.game = {
    state: 'BOOT',        // BOOT / TITLE / PLAYING / ROUND_CLEAR / MISS / GAME_OVER / ENDING
    score: 0,
    hiScore: 0,
    lives: 3,
    round: 1,
    loadProgress: 0,
    stateTime: 0,         // 지금 상태로 바뀐 뒤 흐른 시간(초)
    paused: false,
    roundFruitScore: 0,   // 이번 판에서 과일로 번 점수 (ROUND CLEAR 연출용)
    combo: 0,             // 잇따라 터뜨린 적 수
    comboTimer: 0,
    rush: 0,             // 시간이 지날수록 커지는 난이도
    roundElapsed: 0,
    killCount: 0,        // 이번 판에서 잡은 적 수 (아이템 드랍 조건)
    extend: {},          // 모은 EXTEND 글자 {0:true,...}
    setState: function (s) { this.state = s; this.stateTime = 0; }
  };

  // 최고 점수 불러오기
  try {
    BB.game.hiScore = parseInt(localStorage.getItem('bb_hiscore') || '0', 10) || 0;
  } catch (e) { /* file:// 등에서 막히면 무시 */ }

  // --- 화면 확대 (큰 화면=정수배 / 작은 화면=꽉 채우기) ---
  function resize() {
    var isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    var availH = window.innerHeight - (isTouch ? 96 : 0);
    // 옆에 전체 순위표가 보이면 그만큼 뺀 너비에 맞춘다 (20px = 사이 간격)
    var board = document.getElementById('bbBoard');
    var boardW = board && board.offsetWidth ? board.offsetWidth + 20 : 0;
    var scale = Math.min((window.innerWidth - boardW) / BB.CONFIG.VW, availH / BB.CONFIG.VH);
    if (scale >= 1) scale = Math.floor(scale);
    scale = Math.max(scale, 0.1);
    canvas.style.width = (BB.CONFIG.VW * scale) + 'px';
    canvas.style.height = (BB.CONFIG.VH * scale) + 'px';
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  resize();

  // --- 에셋 로드 후 타이틀로 ---
  BB.assets.load(function (p) { BB.game.loadProgress = p; }).then(function () {
    BB.game.setState('TITLE');
  });

  // --- 라운드 로드 ---
  function loadRound(n) {
    if (!BB.LEVELS || !BB.Level || !BB.Player) return;
    var def = BB.LEVELS[(n - 1) % BB.LEVELS.length] || BB.LEVELS[0];
    BB.level = new BB.Level(def);
    BB.player = new BB.Player(BB.level.playerStart.x, BB.level.playerStart.y);
    BB.bubbles = [];
    BB.fruits = [];
    BB.enemies = [];
    BB.powerups = [];
    BB.extendLetters = [];
    BB.effects = [];
    BB.whale = null;
    BB.boss = null;
    if (def.boss && BB.Boss) BB.boss = new BB.Boss(BB.CONFIG.VW / 2 - 23, 60);
    BB.game.roundFruitScore = 0;
    BB.game.combo = 0;
    BB.game.comboTimer = 0;
    BB.game.rush = 0;
    BB.game.roundElapsed = 0;
    BB.game.killCount = 0;
    if (!BB.game.extend) BB.game.extend = {};
    for (var i = 0; i < BB.level.enemySpawns.length; i++) {
      var e = BB.level.enemySpawns[i];
      if (BB.Enemy) BB.enemies.push(new BB.Enemy(e.type, e.x, e.y));
    }
  }
  BB.loadRound = loadRound;

  function respawnPlayer() {
    var st = BB.level.playerStart;
    BB.player = new BB.Player(st.x, st.y);
    BB.bubbles = [];
    BB.whale = null;                              // 죽으면 고래는 물러남
    // 죽으면 시간을 넉넉히 되돌려준다 (바로 또 HURRY / 고래 나오지 않게)
    if (BB.level.timeLeft < BB.level.time * 0.55) BB.level.timeLeft = BB.level.time * 0.6;
    BB.game.rush = Math.max(0, BB.game.rush - 0.5);
    BB.game.roundElapsed = Math.min(BB.game.roundElapsed, 20);
  }

  function startGame() {
    BB.game.score = 0;
    BB.game.lives = 3;
    BB.game.round = 1;
    BB.game.rankShown = false;
    loadRound(1);
    BB.game.setState('PLAYING');
  }

  function addScore(n) {
    var before = BB.game.score;
    BB.game.score += n;
    // 3만점마다 목숨 +1
    if (Math.floor(BB.game.score / 30000) > Math.floor(before / 30000)) {
      BB.game.lives++;
      if (BB.sfx) BB.sfx.play('extend');
    }
    if (BB.game.score > BB.game.hiScore) {
      BB.game.hiScore = BB.game.score;
      try { localStorage.setItem('bb_hiscore', String(BB.game.hiScore)); } catch (e) {}
    }
  }
  BB.addScore = addScore;

  function playerDie() {
    if (BB.player.invuln > 0) return;
    BB.game.lives--;
    if (BB.sfx) BB.sfx.play('miss');
    BB.game.setState('MISS');
  }

  // --- 충돌 처리 ---
  function handleCollisions(dt) {
    var p = BB.player;

    // 콤보 타이머 (여러 마리를 잇따라 터뜨리면 등급 상승)
    if (BB.game.comboTimer > 0) {
      BB.game.comboTimer -= dt;
      if (BB.game.comboTimer <= 0) BB.game.combo = 0;
    }

    // 날아가는 거품(방울1) vs 걷는 적  → 적이 떠오름 / 보스 → hp 감소
    for (var i = 0; i < BB.bubbles.length; i++) {
      var b = BB.bubbles[i];
      if (b.state !== 'shoot') continue;
      if (BB.boss && BB.boss.state === 'walk' && BB.util.aabb(b.box(), BB.boss.box())) {
        BB.boss.hit();
        b.pop();
        continue;
      }
      for (var j = 0; j < BB.enemies.length; j++) {
        var en = BB.enemies[j];
        if (en.state === 'walk' && BB.util.aabb(b.box(), en.box())) {
          en.captureFloat();
          b.pop();
          break;
        }
      }
    }

    // 주인공 vs 보스
    if (BB.boss && BB.boss.state === 'walk' && p.invuln <= 0 &&
        BB.util.aabb(p.box(), BB.boss.box())) {
      playerDie();
      return;
    }

    // 특수 거품 효과(물·번개·불) vs 적  → 즉사 + 과일
    for (var fx = 0; fx < BB.effects.length; fx++) {
      var box = BB.effects[fx].hitBox();
      for (var fe = 0; fe < BB.enemies.length; fe++) {
        var te = BB.enemies[fe];
        if (te.state === 'walk' && BB.util.aabb(box, te.box())) {
          te.captureFloat();
          te.popKill();
          BB.game.killCount++;
          BB.fruits.push(new BB.Fruit(te.x, te.y, 2));
        }
      }
    }

    // 주인공 vs 적
    for (var k = 0; k < BB.enemies.length; k++) {
      var e = BB.enemies[k];
      if (!BB.util.aabb(p.box(), e.box())) continue;
      if (e.state === 'floating') {
        // 떠오른 적을 터뜨림 → 죽고 과일 떨굼
        BB.game.combo++;
        BB.game.comboTimer = 1.6;
        BB.game.killCount++;
        var tier = BB.fruitTier(BB.game.combo);
        e.popKill();
        BB.fruits.push(new BB.Fruit(e.x, e.y, tier));
        maybeDrop(e.x, e.y);
        if (BB.sfx) BB.sfx.play(BB.game.combo >= 2 ? 'combo' : 'enemyPop');
      } else if (e.state === 'walk') {
        playerDie();
        return;
      }
    }

    // 주인공 vs 과일
    for (var m = BB.fruits.length - 1; m >= 0; m--) {
      var f = BB.fruits[m];
      if (BB.util.aabb(p.box(), f.box())) {
        addScore(f.score);
        BB.game.roundFruitScore += f.score;
        if (BB.sfx) BB.sfx.play('fruit');
        BB.fruits.splice(m, 1);
      }
    }

    // 주인공 vs 파워업
    for (var q = BB.powerups.length - 1; q >= 0; q--) {
      var pu = BB.powerups[q];
      if (BB.util.aabb(p.box(), pu.box())) {
        applyPowerUp(pu.kind);
        addScore(pu.info.score);
        if (BB.sfx) BB.sfx.play('item');
        BB.powerups.splice(q, 1);
      }
    }

    // 주인공 vs EXTEND 글자
    for (var r = BB.extendLetters.length - 1; r >= 0; r--) {
      var el = BB.extendLetters[r];
      if (BB.util.aabb(p.box(), el.box())) {
        BB.game.extend[el.idx] = true;
        addScore(500);
        if (BB.sfx) BB.sfx.play('extend');
        BB.extendLetters.splice(r, 1);
        // 6글자 다 모으면 목숨 +1 + 다음 판
        var all = true;
        for (var z = 0; z < 6; z++) if (!BB.game.extend[z]) all = false;
        if (all) {
          BB.game.extend = {};
          BB.game.lives++;
          BB.whale = null;
          if (BB.sfx) BB.sfx.play('roundClear');
          BB.game.setState('ROUND_CLEAR');
        }
      }
    }
  }

  // 적을 터뜨렸을 때 확률로 아이템/글자 드랍
  function maybeDrop(x, y) {
    var r = Math.random();
    // EXTEND 글자: 아직 안 모은 것 중 하나
    if (r < 0.14) {
      var missing = [];
      for (var i = 0; i < 6; i++) if (!BB.game.extend[i]) missing.push(i);
      if (missing.length) {
        BB.extendLetters.push(new BB.ExtendLetter(x, y, BB.util.choice(missing)));
        return;
      }
    }
    // 파워업: 콤보 2+ 거나 5마리째마다, 낮은 확률
    if (BB.game.combo >= 2 || BB.game.killCount % 5 === 0 || r < 0.10) {
      var kind = BB.util.choice(BB.POWER_KINDS);
      BB.powerups.push(new BB.PowerUp(x, y, kind));
    }
  }

  function applyPowerUp(kind) {
    var st = BB.player.stats;
    if (kind === 'shoe') st.speed = Math.min(st.speed + 0.35, 2.2);
    else if (kind === 'candyYellow') st.bubbleRange = Math.min(st.bubbleRange + 0.35, 2.5);
    else if (kind === 'candyRed') st.bubbleCooldown = Math.min(st.bubbleCooldown + 0.4, 2.5);
    else if (kind === 'candyBlue') st.bubbleRise = Math.min(st.bubbleRise + 0.4, 2.5);
    else if (kind === 'umbrella') {
      // 몇 판 건너뛰기
      var skip = BB.util.choice([2, 3, 4]);
      BB.game.round = Math.min(BB.game.round + skip, BB.LEVELS.length);
      BB.whale = null;
      BB.game.setState('ROUND_CLEAR');
    } else if (kind === 'potion') {
      // 화면에 과일 쏟기
      for (var i = 0; i < 10; i++) {
        BB.fruits.push(new BB.Fruit(BB.util.rand(30, BB.CONFIG.VW - 30), BB.util.rand(40, 200), BB.util.randInt(1, 3)));
      }
    }
    // ring 은 순수 점수 (addScore 는 호출부에서)
  }

  // --- 업데이트 ---
  function update(dt) {
    BB.game.stateTime += dt;
    var s = BB.game.state;

    if (BB.input.pressed('mute') && BB.sfx) BB.sfx.toggleMute();

    if (s === 'TITLE') {
      if (BB.input.pressed('jump') || BB.input.pressed('bubble') || BB.input.pressed('start')) startGame();

    } else if (s === 'PLAYING') {
      if (BB.input.pressed('pause')) BB.game.paused = !BB.game.paused;
      if (BB.game.paused) return;

      BB.game.roundElapsed += dt;
      BB.level.update(dt);
      BB.player.update(dt, BB.level);

      // --- 난이도: 시간이 지날수록 적이 빨라지고, 얼마 안 남으면 화남 ---
      var t = BB.level, frac = t.timeLeft / t.time;   // 1 → 0
      BB.game.rush = BB.util.clamp((1 - frac) * 1.1 + BB.game.roundElapsed / 90, 0, 1.4);
      var hurry = t.timeLeft <= t.time * 0.22 && t.timeLeft > 0;
      var lastOne = BB.enemies.length === 1;
      for (var a = 0; a < BB.enemies.length; a++) {
        var en = BB.enemies[a];
        if (en.state === 'walk') en.angry = hurry || lastOne;
      }

      // --- 심술고래: 시간이 다 되면 등장, 무적으로 주인공만 쫓음 ---
      if (t.timeLeft <= 0 && !BB.whale && BB.Whale) {
        BB.whale = new BB.Whale();
        if (BB.sfx) BB.sfx.play('whale');
      }
      if (BB.whale) BB.whale.update(dt, BB.player);
      if (BB.boss) BB.boss.update(dt, BB.level, BB.player);

      var i, j;
      for (i = 0; i < BB.bubbles.length; i++) BB.bubbles[i].update(dt, BB.level);
      for (i = 0; i < BB.enemies.length; i++) BB.enemies[i].update(dt, BB.level, BB.player);
      for (i = 0; i < BB.fruits.length; i++) BB.fruits[i].update(dt, BB.level);
      for (i = 0; i < BB.powerups.length; i++) BB.powerups[i].update(dt, BB.level);
      for (i = 0; i < BB.extendLetters.length; i++) BB.extendLetters[i].update(dt, BB.level);
      for (i = 0; i < BB.effects.length; i++) BB.effects[i].update(dt);

      handleCollisions(dt);

      // 심술고래에 닿으면 죽음
      if (BB.whale && BB.player.invuln <= 0 && BB.util.aabb(BB.player.box(), BB.whale.box())) {
        playerDie();
      }

      for (j = BB.bubbles.length - 1; j >= 0; j--) if (BB.bubbles[j].dead) BB.bubbles.splice(j, 1);
      for (j = BB.enemies.length - 1; j >= 0; j--) if (BB.enemies[j].dead) BB.enemies.splice(j, 1);
      for (j = BB.fruits.length - 1; j >= 0; j--) if (BB.fruits[j].dead) BB.fruits.splice(j, 1);
      for (j = BB.powerups.length - 1; j >= 0; j--) if (BB.powerups[j].dead) BB.powerups.splice(j, 1);
      for (j = BB.extendLetters.length - 1; j >= 0; j--) if (BB.extendLetters[j].dead) BB.extendLetters.splice(j, 1);
      for (j = BB.effects.length - 1; j >= 0; j--) if (BB.effects[j].dead) BB.effects.splice(j, 1);

      // --- 판 클리어 판정 ---
      if (BB.game.state === 'PLAYING') {
        if (BB.boss) {
          if (BB.boss.dead) {
            BB.whale = null; BB.boss = null;
            if (BB.sfx) BB.sfx.play('roundClear');
            BB.game.setState('ROUND_CLEAR');
          }
        } else if (BB.enemies.length === 0) {
          BB.whale = null;
          if (BB.sfx) BB.sfx.play('roundClear');
          BB.game.setState('ROUND_CLEAR');
        }
      }

    } else if (s === 'MISS') {
      if (BB.game.stateTime > 1.4) {
        if (BB.game.lives <= 0) {
          BB.game.setState('GAME_OVER');
        } else {
          respawnPlayer();
          BB.game.setState('PLAYING');
        }
      }

    } else if (s === 'ROUND_CLEAR') {
      if (BB.game.stateTime > 2.4) {
        if (BB.game.round >= BB.LEVELS.length) {
          BB.game.setState('ENDING');
        } else {
          BB.game.round++;
          loadRound(BB.game.round);
          BB.game.setState('PLAYING');
        }
      }

    } else if (s === 'GAME_OVER' || s === 'ENDING') {
      // 잠깐 결과를 보여준 뒤 순위 등록 창을 띄우고, 창을 닫으면 처음 화면으로
      if (!BB.game.rankShown && BB.game.stateTime > (s === 'ENDING' ? 2.5 : 1.2)) {
        BB.game.rankShown = true;
        BB.ranking.open(BB.game.score, s === 'ENDING' ? '모든 판 클리어!' : 'GAME OVER', function () {
          BB.game.setState('TITLE');
        });
      }
    }
  }

  // --- 그리기 ---
  function render() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, BB.CONFIG.VW, BB.CONFIG.VH);
    var s = BB.game.state;

    if (s === 'BOOT') {
      text('로딩... ' + Math.round(BB.game.loadProgress * 100) + '%', BB.CONFIG.VW / 2, BB.CONFIG.VH / 2);

    } else if (s === 'TITLE') {
      var cx = BB.CONFIG.VW / 2;
      // 주인공 그림
      var hero = BB.assets.images['주인공1'];
      if (hero) ctx.drawImage(hero, cx - 24, 40, 48, 48);
      text('내가 만든 버블보블', cx, 118, 22, '#ffe14d');

      // 조작 안내 상자
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(cx - 150, 150, 300, 92);
      ctx.strokeStyle = '#ff7fd0';
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - 150, 150, 300, 92);
      text('조작 방법', cx, 166, 12, '#ff9fdc');
      text('이동   ← →   또는   A D', cx, 190, 13, '#ffffff');
      text('점프   스페이스   또는   W', cx, 210, 13, '#ffffff');
      text('거품   마우스 왼쪽 클릭', cx, 230, 13, '#ffffff');

      var blink = (Math.floor(BB.game.stateTime * 2) % 2) === 0;
      if (blink) text('스페이스를 눌러 시작', cx, 272, 16, '#7dff7d');
      text('최고 점수  ' + BB.game.hiScore, cx, 306, 11, '#cccccc');

    } else if (s === 'PLAYING' || s === 'MISS' || s === 'ROUND_CLEAR') {
      drawWorld();
      var cx2 = BB.CONFIG.VW / 2, cy2 = BB.CONFIG.VH / 2;
      drawHud();

      if (s === 'MISS') {
        panel(cx2, cy2, 160, 44);
        text('MISS!', cx2, cy2, 26, '#ff6a6a');
      } else if (s === 'ROUND_CLEAR') {
        panel(cx2, cy2, 240, 88);
        text('ROUND ' + BB.game.round + ' 클리어!', cx2, cy2 - 22, 20, '#ffe14d');
        // 과일 점수가 또르륵 합산되는 연출
        var shown = Math.floor(BB.util.clamp(BB.game.stateTime / 1.4, 0, 1) * BB.game.roundFruitScore);
        text('과일 보너스   ' + shown, cx2, cy2 + 6, 14, '#fff');
        if (BB.game.stateTime > 1.5) text('다음 판으로!', cx2, cy2 + 30, 12, '#7dff7d');
      }
      if (BB.game.paused) { panel(cx2, cy2, 140, 40); text('일시정지', cx2, cy2, 16); }

    } else if (s === 'GAME_OVER') {
      drawWorld();
      panel(BB.CONFIG.VW / 2, BB.CONFIG.VH / 2, 280, 110);
      text('GAME OVER', BB.CONFIG.VW / 2, BB.CONFIG.VH / 2 - 28, 26, '#ff5a5a');
      text('최종 점수  ' + BB.game.score, BB.CONFIG.VW / 2, BB.CONFIG.VH / 2, 15, '#fff');
      text('최고 점수  ' + BB.game.hiScore, BB.CONFIG.VW / 2, BB.CONFIG.VH / 2 + 22, 12, '#ffe14d');

    } else if (s === 'ENDING') {
      var hero2 = BB.assets.images['주인공1'];
      if (hero2) ctx.drawImage(hero2, BB.CONFIG.VW / 2 - 24, 60, 48, 48);
      text('축하합니다!', BB.CONFIG.VW / 2, 130, 24, '#ffe14d');
      text('모든 판을 깼어요', BB.CONFIG.VW / 2, 164, 15, '#fff');
      text('총 점수  ' + BB.game.score, BB.CONFIG.VW / 2, 196, 16, '#7dff7d');
      text('만든 사람 · 그림 · 음악 :  김민결', BB.CONFIG.VW / 2, 250, 11, '#aaa');
      text('팬이 공부용으로 만든 게임', BB.CONFIG.VW / 2, 268, 10, '#888');
    }
  }

  // 화면 가운데 반투명 상자
  function panel(cx, cy, w, h) {
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
    ctx.strokeStyle = '#ff7fd0';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - w / 2, cy - h / 2, w, h);
  }

  // 화면 정보(HUD) 그리기
  function drawHud() {
    // 위: 점수 / 최고점수 / 라운드
    text('1UP  ' + BB.game.score, 12, 11, 11, '#fff', 'left');
    text('HIGH  ' + BB.game.hiScore, BB.CONFIG.VW / 2, 11, 11, '#ffe14d');
    text('ROUND ' + BB.game.round + ' / ' + BB.LEVELS.length, BB.CONFIG.VW - 12, 11, 11, '#fff', 'right');

    // EXTEND 글자 (모은 것만 밝게)
    var EX = 'EXTEND';
    var ex = BB.game.extend || {};
    for (var c = 0; c < 6; c++) {
      var got = ex[c];
      text(EX[c], BB.CONFIG.VW / 2 - 33 + c * 13, 26, 12, got ? '#7dff7d' : 'rgba(255,255,255,0.28)');
    }

    // 아래 왼쪽: 남은 목숨 = 작은 공룡 그림 + 숫자
    var hero = BB.assets.images['주인공1'];
    var n = Math.max(0, BB.game.lives);
    var iconY = BB.CONFIG.VH - 22;
    for (var i = 0; i < Math.min(n, 6); i++) {
      if (hero) ctx.drawImage(hero, 8 + i * 20, iconY, 18, 18);
    }
    if (n > 6 || !hero) {
      text('목숨 x ' + n, 40, BB.CONFIG.VH - 12, 12, '#8ef');
    }
    // 콤보 표시
    if (BB.game.combo >= 2 && BB.game.comboTimer > 0) {
      text(BB.game.combo + ' 연속!', BB.CONFIG.VW - 60, BB.CONFIG.VH - 14, 12, '#ffd23f');
    }

    // 시간 막대 (아래쪽 얇게)
    if (BB.level) {
      var frac = BB.util.clamp(BB.level.timeLeft / BB.level.time, 0, 1);
      var barW = BB.CONFIG.VW - 24;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(12, BB.CONFIG.VH - 4, barW, 3);
      ctx.fillStyle = frac < 0.22 ? '#ff4444' : '#7dd0ff';
      ctx.fillRect(12, BB.CONFIG.VH - 4, barW * frac, 3);
      if (frac < 0.22 && (Math.floor(BB.game.stateTime * 4) % 2) === 0 && BB.level.timeLeft > 0) {
        text('HURRY!', BB.CONFIG.VW / 2, 28, 16, '#ff5a5a');
      }
      if (BB.whale) text('심술고래 등장! 빨리 깨!', BB.CONFIG.VW / 2, 28, 13, '#ffffff');
    }
    if (BB.sfx && BB.sfx.muted) text('🔇 M', BB.CONFIG.VW - 12, BB.CONFIG.VH - 14, 10, '#aaa', 'right');
  }

  // 게임 월드(지형·거품·적·과일·주인공) 그리기
  function drawWorld() {
    if (!BB.level) return;
    BB.level.draw(ctx);
    var i;
    for (i = 0; i < BB.fruits.length; i++) BB.fruits[i].draw(ctx);
    for (i = 0; i < BB.powerups.length; i++) BB.powerups[i].draw(ctx);
    for (i = 0; i < BB.extendLetters.length; i++) BB.extendLetters[i].draw(ctx);
    for (i = 0; i < BB.bubbles.length; i++) BB.bubbles[i].draw(ctx);
    for (i = 0; i < BB.effects.length; i++) BB.effects[i].draw(ctx);
    for (i = 0; i < BB.enemies.length; i++) BB.enemies[i].draw(ctx);
    if (BB.boss) BB.boss.draw(ctx);
    if (BB.whale) BB.whale.draw(ctx);
    if (BB.player) BB.player.draw(ctx);
  }

  function text(str, x, y, size, color, align) {
    ctx.font = 'bold ' + (size || 14) + 'px "Segoe UI", "맑은 고딕", monospace';
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    // 검은 테두리로 어디서나 잘 보이게
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillText(str, x + 1, y + 1);
    ctx.fillText(str, x - 1, y + 1);
    ctx.fillStyle = color || '#fff';
    ctx.fillText(str, x, y);
  }

  // --- 고정 timestep 루프 ---
  var acc = 0;
  var last = performance.now();
  function frame(now) {
    acc += Math.min((now - last) / 1000, 0.25);
    last = now;
    var steps = 0;
    while (acc >= BB.CONFIG.STEP && steps < BB.CONFIG.MAX_STEPS) {
      update(BB.CONFIG.STEP);
      acc -= BB.CONFIG.STEP;
      steps++;
    }
    render();
    BB.input.update();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})(window.BB);
