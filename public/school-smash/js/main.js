// ===== main.js =====
// 학교 뿌시기 화면: 학교 그리기·도구(망치·폭탄·운석·지진)·파편과 떨어지는 블록·화면 흔들림·소리·모드.
// 모드: challenge(60초, 도구 개수 제한, 순위) / free(마음껏, 순위 없음).
// localStorage: 'school-smash:best'(도전 최고 점수), 'school-smash:sound'('off'면 끔). 글은 textContent로만 넣는다.
(function (SM) {
  'use strict';
  var Wd = SM.World;
  var $ = function (id) { return document.getElementById(id); };
  var BEST_KEY = 'school-smash:best', SOUND_KEY = 'school-smash:sound';
  var W = Wd.W, H = Wd.H, CELL = Wd.CELL;
  var TOOL_ORDER = ['hammer', 'bomb', 'meteor', 'quake'];

  var canvas = $('game');
  var ctx = canvas.getContext('2d');
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr; canvas.height = H * dpr;
  var ranking = window.GroupRanking.create({ slug: 'school-smash', unit: '점', top: 50 });

  var state = {
    mode: null, phase: 'ready', world: Wd.create(), tool: 'hammer', counts: {}, timeLeft: Wd.CHALLENGE_SECONDS,
    particles: [], blocks: [], effects: [], shake: 0, quakeLeft: 0, lastUse: {}, pointer: null, submitted: false
  };

  function get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function set(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* 무시 */ } }

  // ----- 소리(파일 없이 합성) -----
  var muted = get(SOUND_KEY) === 'off';
  var audio = null, noiseBuf = null;
  function ac() {
    if (!audio) {
      audio = new (window.AudioContext || window.webkitAudioContext)();
      noiseBuf = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return audio;
  }
  function noise(dur, freq, vol) {
    if (muted) return;
    try {
      var a = ac(), t = a.currentTime;
      var src = a.createBufferSource(); src.buffer = noiseBuf;
      var f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
      var g = a.createGain();
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(a.destination);
      src.start(t); src.stop(t + dur);
    } catch (e) { /* 소리가 안 돼도 게임은 계속 */ }
  }
  function tone(freq, dur) {
    if (muted) return;
    try {
      var a = ac(), t = a.currentTime, o = a.createOscillator(), g = a.createGain();
      o.type = 'triangle'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur);
    } catch (e) { /* 무시 */ }
  }
  var lastSmashSound = 0;
  function smashSound(result, big) {
    var now = performance.now();
    if (!big && now - lastSmashSound < 60) return;
    lastSmashSound = now;
    if (big) noise(0.9, 500, 0.6);
    else if (result.destroyed.length || result.damaged.length) noise(0.12, 1800, 0.25);
    if (result.destroyed.some(function (d) { return d.type === 'glass'; })) tone(2200 + Math.random() * 800, 0.15);
  }
  function refreshSound() { $('soundBtn').textContent = muted ? '🔇' : '🔊'; $('soundBtn').setAttribute('aria-label', muted ? '소리 켜기' : '소리 끄기'); }
  refreshSound();

  // ----- 부서진 결과를 파편·떨어지는 블록으로 -----
  function spawn(result, x, y, force) {
    result.destroyed.forEach(function (d) {
      var p = Wd.cellCenter(d.c, d.r);
      var n = d.type === 'glass' ? 5 : 3;
      for (var i = 0; i < n; i++) {
        var a = Math.atan2(p.y - y, p.x - x) + (Math.random() - 0.5) * 1.6;
        var sp = (80 + Math.random() * 220) * force;
        state.particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120 * force, size: 2 + Math.random() * 4, color: d.color, life: 1.2 + Math.random() * 0.8, rot: Math.random() * 6 });
      }
    });
    result.fallen.forEach(function (d) {
      var p = Wd.cellCenter(d.c, d.r);
      state.blocks.push({ x: p.x, y: p.y, vx: (p.x - W / 2) * 0.15 + (Math.random() - 0.5) * 40, vy: -Math.random() * 40, rot: 0, spin: (Math.random() - 0.5) * 6, color: d.color, type: d.type });
    });
    if (result.fallen.length > 8) noise(1.2, 300, 0.5);
    refreshHud();
    if (state.world.destroyed >= state.world.total) finish(true);
  }

  // ----- 도구 쓰기 -----
  function canUse(tool) {
    if (state.phase !== 'playing') return false;
    if (state.mode === 'challenge' && state.counts[tool] <= 0) return false;
    var now = performance.now() / 1000;
    if (now - (state.lastUse[tool] || 0) < Wd.TOOLS[tool].cooldown) return false;
    state.lastUse[tool] = now;
    return true;
  }
  function spend(tool) {
    if (state.mode === 'challenge' && isFinite(state.counts[tool])) state.counts[tool]--;
    if (state.counts[tool] <= 0) state.tool = 'hammer'; // 다 쓰면 망치로(눌러도 아무 일이 없던 문제)
    refreshTools();
  }

  function use(x, y) {
    var tool = state.tool, T = Wd.TOOLS[tool];
    if (!canUse(tool)) return;
    spend(tool);
    if (tool === 'hammer') {
      var r = Wd.hit(state.world, x, y, T.radius, T.power);
      smashSound(r, false);
      state.effects.push({ kind: 'hammer', x: x, y: y, t: 0, life: 0.18 });
      spawn(r, x, y, 0.6);
    } else if (tool === 'bomb') {
      state.effects.push({ kind: 'bomb', x: x, y: y, t: 0, life: 0.45, onEnd: function () { boom(x, y, T, 1.2, 0.5); } });
    } else if (tool === 'meteor') {
      state.effects.push({ kind: 'meteor', x: x, y: y, t: 0, life: 0.6, onEnd: function () { boom(x, y, T, 2, 1); } });
    } else if (tool === 'quake') {
      state.quakeLeft = 2.2;
      noise(2.2, 120, 0.7);
    }
  }
  function boom(x, y, T, force, shake) {
    var r = Wd.hit(state.world, x, y, T.radius, T.power);
    smashSound(r, true);
    state.shake = Math.max(state.shake, shake);
    state.effects.push({ kind: 'blast', x: x, y: y, t: 0, life: 0.5, size: T.radius * CELL * 1.4 });
    for (var i = 0; i < 12; i++) state.particles.push({ x: x, y: y, vx: (Math.random() - 0.5) * 120, vy: -40 - Math.random() * 80, size: 14 + Math.random() * 18, color: 'smoke', life: 1.2 + Math.random(), rot: 0 });
    spawn(r, x, y, force);
  }

  function pointerPos(e) {
    var rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width * W, y: (e.clientY - rect.top) / rect.height * H };
  }
  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    var p = pointerPos(e);
    state.pointer = p;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    use(p.x, p.y);
  });
  canvas.addEventListener('pointermove', function (e) { if (state.pointer) state.pointer = pointerPos(e); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { canvas.addEventListener(ev, function () { state.pointer = null; }); });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // ----- 화면 표시 -----
  function refreshHud() {
    $('percent').textContent = '🏫 ' + Wd.percent(state.world).toFixed(1) + '% 부숨';
    $('score').textContent = state.world.score.toLocaleString('ko-KR') + '점';
    $('time').hidden = state.mode !== 'challenge';
    $('time').textContent = '⏱ ' + Math.ceil(state.timeLeft);
    $('time').classList.toggle('low', state.timeLeft <= 10);
    $('meter').style.width = Wd.percent(state.world) + '%';
  }
  function refreshTools() {
    document.querySelectorAll('.tool').forEach(function (btn) {
      var tool = btn.dataset.tool, n = state.counts[tool];
      btn.setAttribute('aria-pressed', String(tool === state.tool));
      var badge = btn.querySelector('.count');
      badge.textContent = state.mode === 'challenge' && isFinite(n) ? '×' + n : '∞';
      btn.disabled = state.mode === 'challenge' && n <= 0;
    });
  }
  function pickTool(tool) {
    if (state.mode === 'challenge' && state.counts[tool] <= 0) return;
    state.tool = tool;
    refreshTools();
  }
  document.querySelectorAll('.tool').forEach(function (btn) { btn.addEventListener('click', function () { pickTool(btn.dataset.tool); }); });
  document.addEventListener('keydown', function (e) {
    if (ranking.isOpen()) return;
    var n = Number(e.key);
    if (n >= 1 && n <= 4) pickTool(TOOL_ORDER[n - 1]);
  });

  function overlay(emoji, title, textStr, showRank) {
    $('ovEmoji').textContent = emoji;
    $('ovTitle').textContent = title;
    $('ovText').textContent = textStr;
    $('ovRank').hidden = !showRank;
    var best = Number(get(BEST_KEY)) || 0;
    $('ovBest').textContent = best ? '🏅 도전 모드 최고 점수 ' + best.toLocaleString('ko-KR') + '점' : '';
    $('overlay').hidden = false;
  }

  // ----- 진행 -----
  function start(mode) {
    state.mode = mode;
    state.phase = 'playing';
    state.world = Wd.create();
    state.timeLeft = Wd.CHALLENGE_SECONDS;
    state.particles = []; state.blocks = []; state.effects = [];
    state.quakeLeft = 0; state.shake = 0; state.submitted = false;
    state.counts = {};
    TOOL_ORDER.forEach(function (t) { state.counts[t] = mode === 'challenge' ? Wd.TOOLS[t].count : Infinity; });
    state.tool = 'hammer';
    $('overlay').hidden = true;
    $('rebuildBtn').hidden = mode !== 'free';
    $('endBtn').hidden = mode !== 'challenge';
    refreshTools();
    refreshHud();
  }

  function finish(all) {
    if (state.phase !== 'playing') return;
    if (state.mode === 'free') {
      if (all) setTimeout(function () { overlay('🎉', '학교를 전부 부쉈어요!', '모든 블록을 부쉈어요. 다시 지어서 또 부숴 볼까요?', false); state.phase = 'over'; }, 1200);
      return;
    }
    state.phase = 'over';
    var bonus = all ? Wd.clearBonus(state.timeLeft) : 0;
    state.world.score = Math.min(Wd.SCORE_MAX, state.world.score + bonus);
    var best = Number(get(BEST_KEY)) || 0;
    var record = state.world.score > best;
    if (record) set(BEST_KEY, String(state.world.score));
    refreshHud();
    setTimeout(function () {
      overlay(all ? '🏆' : '⏰', all ? '100% 완파!' : '시간 끝!',
        '학교를 ' + Wd.percent(state.world).toFixed(1) + '% 부숴서 ' + state.world.score.toLocaleString('ko-KR') + '점!' +
        (bonus ? '\n남은 시간 보너스 +' + bonus + '점' : '') + (record ? '\n🏅 최고 점수 새 기록!' : ''), state.world.score > 0);
    }, all ? 1200 : 300);
  }

  $('modeChallenge').addEventListener('click', function () { start('challenge'); });
  $('modeFree').addEventListener('click', function () { start('free'); });
  $('rebuildBtn').addEventListener('click', function () { start('free'); });
  $('endBtn').addEventListener('click', function () { if (state.phase === 'playing') finish(false); });
  $('ovRank').addEventListener('click', function () {
    if (state.submitted) return ranking.show(0);
    state.submitted = true;
    $('ovRank').hidden = true;
    ranking.show(state.world.score);
  });
  $('rankBtn').addEventListener('click', function () { ranking.show(0); });
  $('soundBtn').addEventListener('click', function () { muted = !muted; set(SOUND_KEY, muted ? 'off' : 'on'); refreshSound(); });

  // ----- 그리기 -----
  function drawSchool() {
    var w = state.world;
    for (var r = 0; r < Wd.ROWS; r++) {
      for (var c = 0; c < Wd.COLS; c++) {
        var cell = w.cells[r * Wd.COLS + c];
        if (!cell) continue;
        var x = Wd.LEFT + c * CELL, y = Wd.TOP + r * CELL;
        ctx.fillStyle = cell.color;
        ctx.fillRect(x, y, CELL, CELL);
        if (cell.type === 'brick' || cell.type === 'line' || cell.type === 'base') {
          ctx.fillStyle = 'rgba(0,0,0,0.08)';
          ctx.fillRect(x, y + CELL - 2, CELL, 2);
          if (r % 2) ctx.fillRect(x + CELL / 2, y, 1, CELL); else ctx.fillRect(x, y, 1, CELL);
        } else if (cell.type === 'glass') {
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          if ((c + r) % 3 === 0) ctx.fillRect(x + 2, y + 2, 3, 3);
        }
        var max = Wd.TYPES[cell.type].hp;
        if (cell.hp < max) { // 금
          ctx.strokeStyle = 'rgba(0,0,0,' + (0.25 + 0.45 * (1 - cell.hp / max)) + ')';
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(x + 2, y + 3); ctx.lineTo(x + 6, y + 7); ctx.lineTo(x + 4, y + 11);
          if (cell.hp <= max / 2) { ctx.moveTo(x + 6, y + 7); ctx.lineTo(x + 11, y + 5); }
          ctx.stroke();
        }
      }
    }
    // 간판 글자·시계 바늘은 남아 있는 칸 안에만 보이게
    clipTo('sign', function () {
      ctx.fillStyle = '#fff'; ctx.font = '900 18px Pretendard, "Noto Sans KR", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('뿌시기 초등학교', W / 2, Wd.TOP + 8 * CELL);
    });
    clipTo('clock', function () {
      var cx = W / 2, cy = Wd.TOP + 3.5 * CELL;
      ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI * 2); ctx.stroke();
      var now = new Date(), m = now.getMinutes() / 60 * Math.PI * 2, h = (now.getHours() % 12 + now.getMinutes() / 60) / 12 * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(m) * 12, cy - Math.cos(m) * 12); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(h) * 8, cy - Math.cos(h) * 8); ctx.stroke();
    });
  }
  function clipTo(type, draw) {
    var w = state.world, any = false;
    ctx.save(); ctx.beginPath();
    for (var i = 0; i < w.cells.length; i++) {
      var cell = w.cells[i];
      if (cell && cell.type === type) { any = true; ctx.rect(Wd.LEFT + (i % Wd.COLS) * CELL, Wd.TOP + Math.floor(i / Wd.COLS) * CELL, CELL, CELL); }
    }
    if (any) { ctx.clip(); draw(); }
    ctx.restore();
  }

  function drawBackground() {
    var sky = ctx.createLinearGradient(0, 0, 0, Wd.GROUND);
    sky.addColorStop(0, '#89c9ff'); sky.addColorStop(1, '#e0f2ff');
    ctx.fillStyle = sky; ctx.fillRect(-20, -20, W + 40, Wd.GROUND + 20);
    ctx.fillStyle = '#fff';
    [[120, 80, 1], [760, 60, 1.3], [520, 110, 0.8]].forEach(function (c) {
      ctx.beginPath(); ctx.arc(c[0], c[1], 22 * c[2], 0, 7); ctx.arc(c[0] + 24 * c[2], c[1] - 10 * c[2], 20 * c[2], 0, 7); ctx.arc(c[0] + 48 * c[2], c[1], 22 * c[2], 0, 7); ctx.fill();
    });
    ctx.fillStyle = '#6cbf4a'; ctx.fillRect(-20, Wd.GROUND, W + 40, H - Wd.GROUND + 20);
    ctx.fillStyle = '#c9a66b'; ctx.fillRect(Wd.LEFT - 40, Wd.GROUND, Wd.COLS * CELL + 80, 8);
    // 운동장 나무 두 그루(배경, 안 부서짐)
    [[60, '#2f8f46'], [W - 60, '#3a9d52']].forEach(function (t) {
      ctx.fillStyle = '#7b5230'; ctx.fillRect(t[0] - 6, Wd.GROUND - 80, 12, 80);
      ctx.fillStyle = t[1]; ctx.beginPath(); ctx.arc(t[0], Wd.GROUND - 100, 36, 0, 7); ctx.fill();
    });
  }

  function drawEffects() {
    state.effects.forEach(function (e) {
      var v = e.t / e.life;
      if (e.kind === 'hammer') {
        ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(-0.8 + v * 0.8);
        ctx.font = '30px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🔨', 10, -14);
        ctx.restore();
      } else if (e.kind === 'bomb') {
        ctx.font = '28px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('💣', e.x, e.y + Math.sin(e.t * 40) * 2);
      } else if (e.kind === 'meteor') {
        var sx = e.x + 300 * (1 - v), sy = e.y - 500 * (1 - v);
        ctx.strokeStyle = 'rgba(255,140,0,0.6)'; ctx.lineWidth = 14; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(sx + 60, sy - 100); ctx.lineTo(sx, sy); ctx.stroke();
        ctx.fillStyle = '#6d4c41'; ctx.beginPath(); ctx.arc(sx, sy, 22, 0, 7); ctx.fill();
        ctx.fillStyle = '#ff7043'; ctx.beginPath(); ctx.arc(sx - 6, sy - 6, 8, 0, 7); ctx.fill();
      } else if (e.kind === 'blast') {
        ctx.fillStyle = 'rgba(255,200,60,' + (1 - v) + ')';
        ctx.beginPath(); ctx.arc(e.x, e.y, e.size * (0.4 + v), 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,220,' + (1 - v) + ')';
        ctx.beginPath(); ctx.arc(e.x, e.y, e.size * 0.5 * (0.4 + v), 0, 7); ctx.fill();
      }
    });
  }

  function drawParticles() {
    state.blocks.forEach(function (b) {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
      ctx.fillStyle = b.color; ctx.fillRect(-CELL / 2, -CELL / 2, CELL, CELL);
      ctx.restore();
    });
    state.particles.forEach(function (p) {
      if (p.color === 'smoke') {
        ctx.fillStyle = 'rgba(90,90,100,' + Math.min(0.45, p.life * 0.3) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    });
  }

  // ----- 시간 흐름 -----
  var last = performance.now();
  function loop(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state.phase === 'playing') {
      if (state.mode === 'challenge') {
        state.timeLeft -= dt;
        if (state.timeLeft <= 0) { state.timeLeft = 0; finish(false); }
      }
      // 망치는 누르고 있으면 계속 때림
      if (state.pointer && state.tool === 'hammer') use(state.pointer.x, state.pointer.y);
      if (state.quakeLeft > 0) {
        state.quakeLeft -= dt;
        state.shake = Math.max(state.shake, 0.35);
        var r = Wd.quake(state.world, 6, Wd.TOOLS.quake.power);
        if (r.destroyed.length) spawn(r, W / 2, Wd.GROUND, 0.5);
      }
      refreshHud();
    }
    state.effects.forEach(function (e) { e.t += dt; });
    state.effects = state.effects.filter(function (e) {
      if (e.t >= e.life) { if (e.onEnd) e.onEnd(); return false; }
      return true;
    });
    state.particles.forEach(function (p) {
      p.vy += (p.color === 'smoke' ? -30 : 900) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (p.color !== 'smoke' && p.y > Wd.GROUND - p.size / 2) { p.y = Wd.GROUND - p.size / 2; p.vy *= -0.3; p.vx *= 0.6; }
    });
    state.particles = state.particles.filter(function (p) { return p.life > 0; });
    if (state.particles.length > 1500) state.particles.splice(0, state.particles.length - 1500);
    state.blocks.forEach(function (b) {
      b.vy += 900 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.spin * dt;
      if (b.y >= Wd.GROUND - CELL / 2) {
        b.dead = true;
        for (var i = 0; i < 3; i++) state.particles.push({ x: b.x, y: Wd.GROUND - 3, vx: (Math.random() - 0.5) * 160, vy: -60 - Math.random() * 120, size: 2 + Math.random() * 4, color: b.color, life: 0.8 + Math.random() * 0.6 });
      }
    });
    state.blocks = state.blocks.filter(function (b) { return !b.dead; });
    state.shake = Math.max(0, state.shake - dt);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (state.shake > 0) ctx.translate((Math.random() - 0.5) * 16 * state.shake, (Math.random() - 0.5) * 16 * state.shake);
    drawBackground();
    drawSchool();
    drawParticles();
    drawEffects();
    requestAnimationFrame(loop);
  }

  refreshTools();
  refreshHud();
  overlay('🏫', '학교 뿌시기', '망치·폭탄·운석·지진으로 학교를 와르르 부숴요!\n아래를 부수면 위쪽이 무너져 떨어져요.', false);
  requestAnimationFrame(loop);
})(window.Smash);
