// ===== piano-rhythm/js/main.js =====
// 🎹 피아노 리듬 화면: 웹오디오 피아노 소리, 떨어지는 음표 그리기(Canvas), 건반 입력, 판정·점수 표시.
// 시계는 화면 시계가 아니라 소리 시계(AudioContext.currentTime)를 쓴다 — 소리와 음표가 어긋나지 않게.
// 다른 탭으로 가면 소리 시계를 멈춰(suspend) 노래도 멈춘다. 고른 곡·난이도는 'piano-rhythm:song'·':diff',
// 곡·난이도별 최고 점수는 'piano-rhythm:best'에 기억한다. 글은 모두 textContent로만 넣는다.
(function (R) {
  'use strict';

  var SONG_KEY = 'piano-rhythm:song';
  var DIFF_KEY = 'piano-rhythm:diff';
  var BEST_KEY = 'piano-rhythm:best';
  var LANE_COLORS = ['#ff6b6b', '#ff922b', '#fcc419', '#51cf66', '#22b8cf', '#4c6ef5', '#845ef7', '#f06595'];
  var JUDGE_COLORS = { perfect: '#ffd43b', great: '#69db7c', good: '#74c0fc', miss: '#ff8787' };

  var ranking = window.GroupRanking.create({ slug: 'piano-rhythm', unit: '점', top: 50 });
  function $(id) { return document.getElementById(id); }
  function get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function set(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* 무시 */ } }
  function bests() { try { return JSON.parse(get(BEST_KEY)) || {}; } catch (e) { return {}; } }

  var screens = { start: $('startScreen'), play: $('playScreen'), end: $('endScreen') };
  function show(name) { Object.keys(screens).forEach(function (k) { screens[k].hidden = k !== name; }); }

  var songId = R.songById(get(SONG_KEY)).id;
  var diffKey = R.DIFFICULTIES[get(DIFF_KEY)] ? get(DIFF_KEY) : 'normal';

  // ---------- 소리 ----------
  var ctx = null;
  var master = null;
  function audio() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      var comp = ctx.createDynamicsCompressor(); // 여러 음이 겹쳐도 찢어지지 않게
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(comp);
      comp.connect(ctx.destination);
    }
    if (ctx.state === 'suspended' && !paused) ctx.resume();
    return ctx;
  }
  // 피아노 비슷한 소리: 바탕음(삼각파) + 배음 두 개, 빨리 커졌다가 천천히 작아짐
  function playNote(lane, when) {
    var c = audio();
    var t = when || c.currentTime;
    var f = R.FREQS[lane];
    var out = c.createGain();
    var filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(4000, t);
    filter.frequency.exponentialRampToValueAtTime(900, t + 1.2);
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.4, t + 0.006);
    out.gain.exponentialRampToValueAtTime(0.12, t + 0.25);
    out.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    filter.connect(out);
    out.connect(master);
    [[1, 'triangle', 1], [2, 'sine', 0.35], [3, 'sine', 0.12]].forEach(function (p) {
      var o = c.createOscillator();
      var g = c.createGain();
      o.type = p[1];
      o.frequency.value = f * p[0];
      g.gain.value = p[2];
      o.connect(g);
      g.connect(filter);
      o.start(t);
      o.stop(t + 1.7);
    });
  }
  // 시작 전 '똑 똑 똑' 박자 소리
  function tick(when, high) {
    var c = audio();
    var o = c.createOscillator();
    var g = c.createGain();
    o.frequency.value = high ? 1600 : 1100;
    g.gain.setValueAtTime(0.25, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
    o.connect(g);
    g.connect(master);
    o.start(when);
    o.stop(when + 0.08);
  }
  function missSound() {
    var c = audio();
    var o = c.createOscillator();
    var g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(140, c.currentTime);
    o.frequency.exponentialRampToValueAtTime(70, c.currentTime + 0.15);
    g.gain.setValueAtTime(0.06, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.16);
    o.connect(g);
    g.connect(master);
    o.start();
    o.stop(c.currentTime + 0.18);
  }

  // ---------- 시작 화면 ----------
  function renderSongs() {
    var list = $('songList');
    list.textContent = '';
    R.SONGS.forEach(function (song) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'song-btn';
      b.setAttribute('aria-pressed', String(song.id === songId));
      var emo = document.createElement('span'); emo.className = 'emo'; emo.textContent = song.emoji;
      var text = document.createElement('span');
      var name = document.createElement('b'); name.textContent = song.title;
      var lv = document.createElement('small'); lv.textContent = '난이도 ' + '★'.repeat(song.level) + '☆'.repeat(3 - song.level);
      text.appendChild(name); text.appendChild(lv);
      b.appendChild(emo); b.appendChild(text);
      b.addEventListener('click', function () {
        songId = song.id;
        set(SONG_KEY, songId);
        renderSongs();
        // 곡을 고르면 첫 음 몇 개를 미리 들려준다
        var c = audio();
        R.buildChart(song, 'normal').notes.slice(0, 4).forEach(function (n) { playNote(n.lane, c.currentTime + 0.05 + n.time); });
      });
      list.appendChild(b);
    });
    renderBest();
  }
  function renderDiffs() {
    document.querySelectorAll('.diff-btn').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.diff === diffKey)); });
    renderBest();
  }
  function renderBest() {
    var best = bests()[songId + ':' + diffKey];
    $('bestLine').textContent = best ? '🏅 이 곡 ' + R.DIFFICULTIES[diffKey].name + ' 최고 점수: ' + best.toLocaleString('ko-KR') + '점' : '';
  }
  document.querySelectorAll('.diff-btn').forEach(function (b) {
    b.addEventListener('click', function () { diffKey = b.dataset.diff; set(DIFF_KEY, diffKey); renderDiffs(); });
  });

  // ---------- 건반 ----------
  var keyEls = [];
  (function buildKeys() {
    var box = $('keys');
    R.NAMES.forEach(function (name, lane) {
      var k = document.createElement('button');
      k.type = 'button';
      k.className = 'pkey';
      k.style.setProperty('--lane', LANE_COLORS[lane]);
      k.setAttribute('aria-label', name);
      var b = document.createElement('b'); b.textContent = name === '높은도' ? '도↑' : name;
      var s = document.createElement('small'); s.textContent = R.KEY_LABELS[lane];
      k.appendChild(b); k.appendChild(s);
      k.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        if (k.hasPointerCapture && e.pointerId != null) { try { k.releasePointerCapture(e.pointerId); } catch (err) { /* 무시 */ } }
        down(lane);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { k.addEventListener(ev, function () { up(lane); }); });
      k.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      box.appendChild(k);
      keyEls.push(k);
    });
  })();

  // ---------- 게임 상태 ----------
  var game = null;     // { song, diff, chart, t0, counts, combo, maxCombo, ended }
  var paused = false;
  var flashes = [0, 0, 0, 0, 0, 0, 0, 0]; // 줄마다 빛나는 남은 시간
  var popups = [];     // 판정 글씨 { text, color, born }
  var raf = 0;

  function now() { return ctx ? ctx.currentTime - game.t0 : 0; } // 곡 시작부터 몇 초째(시작 전엔 음수)

  function start() {
    var song = R.songById(songId);
    var diff = R.DIFFICULTIES[diffKey];
    var chart = R.buildChart(song, diffKey);
    var c = audio();
    var countIn = 4 * chart.spb;
    var lead = Math.max(diff.travel, countIn) + 0.4;
    game = {
      song: song, diffKey: diffKey, diff: diff, chart: chart, t0: c.currentTime + lead,
      counts: { perfect: 0, great: 0, good: 0, miss: 0 }, combo: 0, maxCombo: 0, ended: false, submitted: false
    };
    for (var i = 1; i <= 4; i++) tick(game.t0 - i * chart.spb, i === 4);
    flashes = [0, 0, 0, 0, 0, 0, 0, 0];
    popups = [];
    paused = false;
    $('pauseCard').hidden = true;
    $('songName').textContent = song.emoji + ' ' + song.title + ' · ' + diff.name;
    $('scoreNow').textContent = '0';
    show('play');
    resize();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function addJudge(result, lane) {
    var g = game;
    g.counts[result]++;
    if (result === 'miss') { g.combo = 0; missSound(); }
    else {
      g.combo++;
      if (g.combo > g.maxCombo) g.maxCombo = g.combo;
      if (lane != null) flashes[lane] = 0.25;
    }
    popups.push({ text: R.JUDGE_TEXT[result], color: JUDGE_COLORS[result], born: performance.now() });
    if (popups.length > 3) popups.shift();
    $('scoreNow').textContent = R.scoreFor(g.counts, g.chart.notes.length, g.maxCombo, g.diffKey).toLocaleString('ko-KR');
  }

  var held = [false, false, false, false, false, false, false, false];
  function down(lane) {
    if (held[lane] || paused) return;
    held[lane] = true;
    keyEls[lane].classList.add('down');
    playNote(lane);
    if (!game || game.ended || paused || screens.play.hidden) return;
    var res = R.press(game.chart.notes, lane, now(), game.diff.windows);
    if (res.note) {
      res.note.judged = res.result;
      addJudge(res.result, lane);
    } else if (res.wrong && game.combo > 0) {
      game.combo = 0; // 엉뚱한 건반: 콤보만 끊김
      popups.push({ text: '앗, 다른 건반!', color: '#ff8787', born: performance.now() });
    }
  }
  function up(lane) {
    held[lane] = false;
    keyEls[lane].classList.remove('down');
  }

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape' && !screens.play.hidden) { togglePause(); return; }
    if (screens.play.hidden && screens.start.hidden) return; // 결과 화면에서는 소리만 내지 않음
    if (document.querySelector('.gr-dialog:not([hidden])')) return; // 순위 창에서 이름 쓰는 중
    var lane = R.KEYS.indexOf(e.key.toLowerCase());
    if (lane < 0) return;
    e.preventDefault();
    if (!e.repeat) down(lane);
  });
  document.addEventListener('keyup', function (e) {
    var lane = R.KEYS.indexOf(e.key.toLowerCase());
    if (lane >= 0) up(lane);
  });
  window.addEventListener('blur', function () { for (var i = 0; i < 8; i++) up(i); });

  // ---------- 그리기 ----------
  var canvas = $('stage');
  var g2d = canvas.getContext('2d');
  var W = 0, H = 0;
  function resize() {
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    g2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', function () { if (!screens.play.hidden) resize(); });

  function roundRect(x, y, w, h, r) {
    g2d.beginPath();
    g2d.moveTo(x + r, y);
    g2d.arcTo(x + w, y, x + w, y + h, r);
    g2d.arcTo(x + w, y + h, x, y + h, r);
    g2d.arcTo(x, y + h, x, y, r);
    g2d.arcTo(x, y, x + w, y, r);
    g2d.closePath();
  }

  var lastFrame = 0;
  function frame(ms) {
    raf = requestAnimationFrame(frame);
    var dt = lastFrame ? Math.min(0.1, (ms - lastFrame) / 1000) : 0;
    lastFrame = ms;
    if (!game) return;
    var t = now();

    if (!game.ended && !paused) {
      R.expired(game.chart.notes, t, game.diff.windows).forEach(function (n) { n.judged = 'miss'; addJudge('miss'); });
      if (t > game.chart.length + 0.8 && game.chart.notes.every(function (n) { return n.judged; })) finish();
    }
    for (var i = 0; i < 8; i++) flashes[i] = Math.max(0, flashes[i] - dt);
    $('progressBar').style.width = Math.max(0, Math.min(100, t / game.chart.length * 100)) + '%';
    draw(t);
  }

  function draw(t) {
    var laneW = W / 8;
    var lineY = H - 28;
    var travel = game.diff.travel;
    g2d.clearRect(0, 0, W, H);

    // 줄 바탕과 빛
    for (var i = 0; i < 8; i++) {
      g2d.fillStyle = i % 2 ? '#181d3d' : '#141833';
      g2d.fillRect(i * laneW, 0, laneW, H);
      if (flashes[i] > 0 || held[i]) {
        var grad = g2d.createLinearGradient(0, lineY, 0, 0);
        grad.addColorStop(0, LANE_COLORS[i] + (flashes[i] > 0 ? '88' : '40'));
        grad.addColorStop(1, LANE_COLORS[i] + '00');
        g2d.fillStyle = grad;
        g2d.fillRect(i * laneW, 0, laneW, lineY);
      }
    }
    // 판정선
    g2d.fillStyle = '#ffffffcc';
    g2d.fillRect(0, lineY - 2, W, 4);

    // 음표: 판정선에서 위로 (남은 초 ÷ 내려오는 초) 만큼
    var noteH = Math.max(16, Math.min(24, laneW * 0.45));
    g2d.textAlign = 'center';
    g2d.textBaseline = 'middle';
    game.chart.notes.forEach(function (n) {
      if (n.judged && n.judged !== 'miss') return;
      var y = lineY - (n.time - t) / travel * lineY;
      if (y < -200 || y > H + noteH) return;
      var x = n.lane * laneW + 4;
      var w = laneW - 8;
      var tail = Math.max(0, n.dur / travel * lineY - noteH - 4); // 음 길이를 흐린 꼬리로 보여 줌(누르고 있을 필요는 없음)
      g2d.globalAlpha = n.judged === 'miss' ? 0.25 : 1;
      if (tail > 0) {
        g2d.fillStyle = LANE_COLORS[n.lane] + '33';
        roundRect(x + w * 0.3, y - noteH / 2 - tail, w * 0.4, tail, 4);
        g2d.fill();
      }
      g2d.fillStyle = LANE_COLORS[n.lane];
      roundRect(x, y - noteH / 2, w, noteH, 8);
      g2d.fill();
      g2d.fillStyle = '#fff';
      g2d.font = '900 ' + Math.round(noteH * 0.6) + 'px sans-serif';
      g2d.fillText(R.NAMES[n.lane] === '높은도' ? '도↑' : R.NAMES[n.lane], x + w / 2, y + 1);
      g2d.globalAlpha = 1;
    });

    // 시작 전 3·2·1
    if (t < 0) {
      var beatsLeft = Math.ceil(-t / game.chart.spb);
      if (beatsLeft <= 4) {
        g2d.fillStyle = '#ffffffdd';
        g2d.font = '900 64px sans-serif';
        g2d.fillText(beatsLeft === 4 ? '준비!' : String(beatsLeft), W / 2, H * 0.4);
      }
    }
    // 판정 글씨와 콤보
    var nowMs = performance.now();
    popups = popups.filter(function (p) { return nowMs - p.born < 600; });
    var last = popups[popups.length - 1];
    if (last) {
      var age = (nowMs - last.born) / 600;
      g2d.globalAlpha = 1 - age;
      g2d.fillStyle = last.color;
      g2d.font = '900 ' + Math.round(30 + 8 * (1 - age)) + 'px sans-serif';
      g2d.fillText(last.text, W / 2, H * 0.55 - age * 20);
      g2d.globalAlpha = 1;
    }
    if (game.combo >= 3) {
      g2d.fillStyle = '#ffffffaa';
      g2d.font = '900 22px sans-serif';
      g2d.fillText(game.combo + ' 콤보', W / 2, H * 0.55 + 36);
    }
  }

  // ---------- 멈춤 ----------
  function togglePause() {
    if (!game || game.ended) return;
    if (paused) resume(); else pause();
  }
  function pause() {
    if (!game || game.ended || paused) return;
    paused = true;
    if (ctx) ctx.suspend();
    $('pauseCard').hidden = false;
  }
  function resume() {
    if (!paused) return;
    paused = false;
    $('pauseCard').hidden = true;
    // 1초 되감아 음표가 다시 내려오는 걸 보고 이어서 누를 수 있게
    game.t0 += 1;
    if (ctx) ctx.resume();
  }
  $('pauseBtn').addEventListener('click', pause);
  $('resumeBtn').addEventListener('click', resume);
  $('quitBtn').addEventListener('click', function () {
    paused = false;
    if (ctx) ctx.resume();
    game.ended = true;
    cancelAnimationFrame(raf);
    show('start');
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) pause(); });

  // ---------- 끝 ----------
  function finish() {
    var g = game;
    g.ended = true;
    cancelAnimationFrame(raf);
    var total = g.chart.notes.length;
    var acc = R.accuracy(g.counts, total);
    var score = R.scoreFor(g.counts, total, g.maxCombo, g.diffKey);
    var grade = R.gradeFor(acc);
    var key = g.song.id + ':' + g.diffKey;
    var all = bests();
    var isBest = !all[key] || score > all[key];
    if (isBest) { all[key] = score; set(BEST_KEY, JSON.stringify(all)); }

    $('endTitle').textContent = g.counts.miss === 0 ? (g.counts.perfect === total ? '🌟 올 퍼펙트!' : '🎉 풀 콤보!') : '🎉 연주 끝!';
    $('grade').textContent = grade;
    $('finalScore').textContent = score.toLocaleString('ko-KR');
    $('finalLine').textContent = g.song.title + ' · ' + g.diff.name + ' — 정확도 ' + (acc * 100).toFixed(1) + '%, 최대 콤보 ' + g.maxCombo +
      (isBest ? ' · 🏅 내 최고 기록!' : '');
    $('cPerfect').textContent = g.counts.perfect;
    $('cGreat').textContent = g.counts.great;
    $('cGood').textContent = g.counts.good;
    $('cMiss').textContent = g.counts.miss;
    $('endRankBtn').hidden = score <= 0;
    g.score = score;
    show('end');
  }

  $('startBtn').addEventListener('click', start);
  $('againBtn').addEventListener('click', start);
  $('menuBtn').addEventListener('click', function () { show('start'); renderBest(); });
  $('endRankBtn').addEventListener('click', function () {
    if (game.submitted) return ranking.show(0);
    game.submitted = true;
    $('endRankBtn').hidden = true;
    ranking.show(game.score);
  });
  $('rankBtn').addEventListener('click', function () { ranking.show(0); });

  // 콘솔·자동 확인용 통로(게임 진행에는 안 씀)
  R.debug = { get game() { return game; }, now: function () { return game ? now() : 0; }, down: down, up: up };

  renderSongs();
  renderDiffs();
})(window.PianoRhythm);
