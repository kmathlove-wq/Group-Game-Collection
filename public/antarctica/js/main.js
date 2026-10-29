// ===== main.js =====
// 남극 탐험 화면: 키보드·손가락 조이스틱·단추 입력, 알림, 동물 카드, 도감, 장비 창, 소리(바람·발소리 합성), 저장, 순위.
// localStorage: 'antarctica:save'(game.toSave), 'antarctica:sound'('off'면 끔), 'antarctica:guide-seen'(설명 창을 봄).
// 다른 탭으로 가면(document.hidden) 시간이 멈춘다. 글은 모두 textContent로만 넣는다.
(function (A) {
  'use strict';
  var G = A.Game, D = A.Draw;
  var $ = function (id) { return document.getElementById(id); };
  var SAVE_KEY = 'antarctica:save', SOUND_KEY = 'antarctica:sound', GUIDE_KEY = 'antarctica:guide-seen';
  var ANIMAL = {}, SAMPLE = {};
  G.ANIMALS.forEach(function (a) { ANIMAL[a.id] = a; });
  G.SAMPLES.forEach(function (sm) { SAMPLE[sm.id] = sm; });

  function get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function set(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* 무시 */ } }

  var ranking = window.GroupRanking.create({ slug: 'antarctica', unit: '점', top: 50 });

  var saved = null;
  try { saved = JSON.parse(get(SAVE_KEY) || 'null'); } catch (e) { saved = null; }
  var state = G.create(null, saved);

  // ----- 캔버스 크기(휴대폰 세로는 더 세로로 긴 화면) -----
  var canvas = $('game');
  var ctx = canvas.getContext('2d');
  var view = { w: 960, h: 600 }, dpr = 1;
  function fitView() {
    var narrow = window.innerWidth <= 640 && window.innerHeight > window.innerWidth;
    view = narrow ? { w: 540, h: 620 } : { w: 960, h: 600 };
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(view.w * dpr); canvas.height = Math.round(view.h * dpr);
    canvas.style.aspectRatio = view.w + ' / ' + view.h;
  }
  fitView();
  window.addEventListener('resize', fitView);

  // ----- 소리(웹오디오로 직접 합성) -----
  var muted = get(SOUND_KEY) === 'off';
  var audio = null, wind = null, noiseBuf = null;
  function ensureAudio() {
    if (muted) return null;
    try {
      if (!audio) {
        audio = new (window.AudioContext || window.webkitAudioContext)();
        noiseBuf = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        var src = audio.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
        var filter = audio.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 500; filter.Q.value = 0.8;
        var gain = audio.createGain(); gain.gain.value = 0;
        src.connect(filter); filter.connect(gain); gain.connect(audio.destination); src.start();
        wind = { filter: filter, gain: gain };
      }
      if (audio.state === 'suspended') audio.resume();
      return audio;
    } catch (e) { return null; }
  }
  function beep(notes, type, gap, vol) {
    if (muted || !ensureAudio()) return;
    var t = audio.currentTime;
    notes.forEach(function (n, i) {
      var o = audio.createOscillator(), g = audio.createGain();
      o.type = type || 'sine'; o.frequency.value = n;
      var at = t + i * (gap || 0.08);
      g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol || 0.13, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
      o.connect(g); g.connect(audio.destination); o.start(at); o.stop(at + 0.22);
    });
  }
  // 발소리: 짧은 잡음을 땅 종류에 따라 다르게 거름
  function footstep(terrain) {
    if (muted || !audio || !noiseBuf) return;
    var src = audio.createBufferSource(); src.buffer = noiseBuf;
    var f = audio.createBiquadFilter(), g = audio.createGain(), t = audio.currentTime;
    if (terrain === G.T.ICE) { f.type = 'highpass'; f.frequency.value = 2600; }
    else if (terrain === G.T.DEEP) { f.type = 'lowpass'; f.frequency.value = 500; }
    else { f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 1.2; }
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(terrain === G.T.ICE ? 0.05 : 0.11, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    src.connect(f); f.connect(g); g.connect(audio.destination);
    src.start(t, Math.random()); src.stop(t + 0.1);
  }
  var windTimer = 0;
  function updateWind(dt, paused) {
    if (!wind) return;
    windTimer -= dt;
    if (windTimer > 0) return;
    windTimer = 0.4;
    var inside = G.baseAt(state.player.x, state.player.y) >= 0 || state.player.camping;
    var storm = state.weather.phase === 'storm';
    var level = muted || paused ? 0 : inside ? 0.008 : storm ? 0.16 : 0.025 + G.latAt(state.player.y) * 0.03;
    var t = audio.currentTime;
    wind.gain.gain.setTargetAtTime(level, t, 0.5);
    wind.filter.frequency.setTargetAtTime((storm ? 700 : 380) + Math.random() * 300, t, 0.6);
  }
  function refreshSound() { $('soundBtn').textContent = muted ? '🔇' : '🔊'; $('soundBtn').setAttribute('aria-label', muted ? '소리 켜기' : '소리 끄기'); }
  refreshSound();
  ['keydown', 'pointerdown'].forEach(function (ev) { document.addEventListener(ev, function () { ensureAudio(); }, { passive: true }); });

  // ----- 알림 -----
  var toastTimer = null;
  function toast(msg, kind) {
    var el = $('toast');
    el.textContent = msg;
    el.className = 'toast show ' + (kind || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast'; }, 2600);
  }
  var cardTimer = null;
  function showCard(type, id, name, desc, points) {
    D.icon($('cardIcon'), type, id);
    $('cardName').textContent = name;
    $('cardDesc').textContent = desc;
    $('cardPoints').textContent = points;
    $('card').hidden = false;
    clearTimeout(cardTimer);
    cardTimer = setTimeout(function () { $('card').hidden = true; }, 7000);
  }
  $('card').addEventListener('click', function () { $('card').hidden = true; });

  function onEvent(e) {
    var p = state.player;
    switch (e.type) {
      case 'step': footstep(e.terrain); break;
      case 'observe': {
        var a = ANIMAL[e.sp];
        if (e.first) { beep([660, 880, 1175]); showCard('animal', a.id, '🔍 ' + a.name + ' (새로 발견!)', a.desc, '+' + a.points + ' 연구 점수 · 도감에 적었어요'); }
        else { beep([660]); showCard('animal', a.id, a.name, a.desc, '이미 도감에 있어요'); }
        break;
      }
      case 'collect': {
        var sm = SAMPLE[e.kind];
        beep([520, 780]);
        showCard('sample', sm.id, '🧪 ' + sm.name + ' 표본을 주웠어요', sm.desc, '기지에 가져가면 +' + sm.points + ' 연구 점수 (가방 ' + p.bag.length + '/' + G.capacity(state.up) + ')');
        break;
      }
      case 'bag-full': beep([300, 250], 'square'); toast('🎒 가방이 꽉 찼어요! 기지에 가져가거나 🛷 썰매를 사요.', 'bad'); break;
      case 'nothing': toast('주변에 관찰하거나 주울 것이 없어요. 동물이나 반짝이는 표본에 다가가요.'); break;
      case 'deliver': beep([523, 659, 784, 1046]); toast('🔬 표본 ' + e.count + '개를 연구했어요! +' + e.points + '점', 'good'); save(); break;
      case 'crevasse': beep([500, 300, 150], 'sawtooth', 0.1); toast('😱 크레바스에 빠졌어요! 체온이 떨어졌어요. 파란 틈을 조심해요!', 'bad'); break;
      case 'rescue': beep([392, 330, 262], 'triangle', 0.15); toast('🚁 너무 추워서 구조대가 ' + G.world().bases[e.base].name + '로 데려왔어요.' + (e.lost ? ' 가방 속 표본 ' + e.lost + '개를 잃었어요.' : ''), 'bad'); save(); break;
      case 'cold': beep([880, 880], 'square', 0.15, 0.08); toast('🥶 너무 추워요! 기지로 돌아가거나 ⛺ 텐트를 쳐요.', 'bad'); break;
      case 'hungry': toast('🍫 배가 고파서 힘이 없어요! 기지나 보급 상자에서 먹어요.', 'bad'); break;
      case 'cache': beep([700, 900]); toast('📦 보급 상자! 초콜릿을 먹고 힘이 났어요 (+식량, +체온)', 'good'); break;
      case 'blizzard-warn': beep([440, 415, 392], 'triangle', 0.2); toast('🌨️ 곧 눈보라가 와요! 기지나 텐트로 피해요.', 'info'); break;
      case 'blizzard-start': toast('🌨️ 눈보라 시작! 체온이 3배 빨리 내려가요.', 'bad'); break;
      case 'blizzard-end': toast('☀️ 눈보라가 그쳤어요.', 'good'); break;
      case 'tent-on': beep([392, 523]); toast('⛺ 텐트를 쳤어요. 움직이면 걷어요. (이번에 남은 텐트 ' + e.left + '번)', 'good'); break;
      case 'tent-off': toast('⛺ 텐트를 걷었어요.'); break;
      case 'tent-none': toast('⛺ 텐트가 없어요. 🛠️ 장비에서 사요.'); break;
      case 'tent-empty': toast('⛺ 이번 탐험에 쓸 텐트를 다 썼어요. 기지에 들르면 다시 채워져요.'); break;
      case 'tent-base': toast('기지 안에서는 텐트가 필요 없어요. 🙂'); break;
      case 'discover-base': beep([523, 784, 1046]); toast('🏠 ' + G.world().bases[e.base].name + '를 찾았어요! 이제 여기서도 쉬고 구조돼요.', 'good'); break;
      case 'enter-base': if (!toastShowing()) toast('🏠 ' + G.world().bases[e.base].name + ' · 몸을 녹이는 중 (B = 장비)', 'info'); break;
      case 'mission': {
        beep([523, 659, 784, 1046, 1318], 'triangle', 0.09);
        var next = G.MISSIONS[e.index + 1];
        toast('🎯 미션 완료! ' + G.MISSIONS[e.index].text + ' (+' + e.bonus + '점)' + (next ? ' → 다음: ' + next.text : ''), 'good');
        save();
        break;
      }
      case 'pole-early': toast('🚩 남극점이에요! 미션을 차례로 끝내면 마지막에 여기서 엔딩을 볼 수 있어요.', 'info'); break;
      case 'pole-again': toast('🚩 다시 찾아온 남극점! 도감을 모두 채워 봐요.', 'info'); break;
      case 'ending': save(); setTimeout(showEnding, 900); break;
    }
  }
  function toastShowing() { return $('toast').className.indexOf('show') >= 0; }

  // ----- 입력 -----
  var keys = {}, actQueued = false, tentQueued = false;
  function anyDialog() { return !$('shop').hidden || !$('dex').hidden || !$('guide').hidden || !$('ending').hidden || ranking.isOpen(); }
  document.addEventListener('keydown', function (e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    var k = e.key.toLowerCase();
    if (k === 'escape') { closeAll(); return; }
    if (anyDialog()) return;
    keys[k] = true;
    if (!e.repeat) {
      if (k === 'e' || k === ' ' || k === 'enter' || k === 'ㄷ') { actQueued = true; e.preventDefault(); }
      if (k === 't' || k === 'ㅅ') tentQueued = true;
      if (k === 'b' || k === 'ㅠ') openShop();
      if (k === 'f' || k === 'ㄹ') openDex();
    }
    if (k.indexOf('arrow') === 0) e.preventDefault();
  });
  document.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', function () { keys = {}; stick = null; });
  function keyInput() {
    var x = 0, y = 0;
    if (keys.arrowleft || keys.a || keys['ㅁ']) x -= 1;
    if (keys.arrowright || keys.d || keys['ㅇ']) x += 1;
    if (keys.arrowup || keys.w || keys['ㅈ']) y -= 1;
    if (keys.arrowdown || keys.s || keys['ㄴ']) y += 1;
    return { x: x, y: y };
  }
  // 손가락: 누른 자리가 조이스틱 가운데, 끈 방향으로 움직임(멀리 끌수록 빠름)
  var stick = null;
  function canvasPos(e) {
    var r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * view.w, y: (e.clientY - r.top) / r.height * view.h };
  }
  canvas.addEventListener('pointerdown', function (e) {
    var p = canvasPos(e);
    stick = { id: e.pointerId, ox: p.x, oy: p.y, dx: 0, dy: 0 };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!stick || e.pointerId !== stick.id) return;
    var p = canvasPos(e), dx = p.x - stick.ox, dy = p.y - stick.oy, d = Math.hypot(dx, dy);
    if (d > 46) { dx = dx / d * 46; dy = dy / d * 46; }
    stick.dx = dx; stick.dy = dy;
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { canvas.addEventListener(ev, function () { stick = null; }); });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  function input() {
    var inp = keyInput();
    if (stick && Math.hypot(stick.dx, stick.dy) > 8) inp = { x: stick.dx / 46, y: stick.dy / 46 };
    inp.act = actQueued; inp.tent = tentQueued;
    actQueued = false; tentQueued = false;
    return inp;
  }
  $('actBtn').addEventListener('click', function () { actQueued = true; });
  $('tentBtn').addEventListener('click', function () { tentQueued = true; });

  // ----- 화면 위 숫자 -----
  function num(n) { return Math.floor(n).toLocaleString('ko-KR'); }
  function refreshHud() {
    var p = state.player, mw = G.maxWarm(state.up);
    $('warmFill').style.width = Math.max(0, p.warm / mw * 100) + '%';
    $('warmFill').classList.toggle('low', p.warm < mw * 0.25);
    $('warmText').textContent = Math.ceil(p.warm) + '/' + mw;
    $('foodFill').style.width = Math.max(0, p.food) + '%';
    $('foodText').textContent = Math.ceil(p.food);
    $('bag').textContent = '🎒 ' + p.bag.length + '/' + G.capacity(state.up);
    $('points').textContent = '🔬 ' + num(state.rp) + '점';
    var ph = state.weather.phase;
    $('weather').textContent = ph === 'storm' ? '🌨️ 눈보라' : ph === 'warn' ? '🌥️ 곧 눈보라' : '☀️ 맑음';
    $('weather').classList.toggle('storm', ph !== 'calm');
    var m = G.MISSIONS[state.mission];
    $('mission').textContent = m ? '🎯 미션 ' + (state.mission + 1) + '/' + G.MISSIONS.length + ': ' + m.text + ' (' + m.progress(state) + ')'
      : '🏆 모든 미션 완료! 도감 ' + G.seenCount(state) + '/' + G.ANIMALS.length + ' — 남은 동물을 찾아봐요.';
    var tentText = state.up.tent ? '⛺ 텐트 ' + (p.camping ? '걷기' : p.tentsLeft + '번') : '⛺ 텐트';
    $('tentBtn').firstChild.textContent = tentText + ' ';
  }

  // ----- 장비 창 -----
  function openShop() { refreshShop(); $('shop').hidden = false; }
  function closeShop() { $('shop').hidden = true; }
  var shopSig = '';
  function refreshShop() {
    var list = $('upgrades');
    list.textContent = '';
    var inBase = G.baseAt(state.player.x, state.player.y) >= 0;
    $('shopWhere').textContent = (inBase ? '🏠 기지 안이라 살 수 있어요.' : '🚶 기지 밖이에요. 장비는 기지 안에서만 살 수 있어요.') + ' 연구 점수: ' + num(state.rp) + '점';
    Object.keys(G.UPGRADES).forEach(function (key) {
      var u = G.UPGRADES[key], lv = state.up[key];
      var row = document.createElement('div'); row.className = 'row';
      var name = document.createElement('span'); name.className = 'name';
      name.textContent = u.name + (u.max > 1 ? ' (' + lv + '/' + u.max + ')' : lv ? ' ✅' : '');
      var small = document.createElement('small'); small.textContent = u.desc; name.appendChild(small);
      var btn = document.createElement('button'); btn.type = 'button';
      if (lv >= u.max) { btn.textContent = '최고 단계'; btn.disabled = true; }
      else {
        var price = u.costs[lv];
        btn.textContent = '🔬 ' + num(price) + '점';
        btn.disabled = !inBase || state.rp < price;
        btn.addEventListener('click', function () {
          var r = G.buy(state, key);
          if (r.ok) { beep([660, 880, 1320]); toast('🛠️ ' + u.name + ' ' + state.up[key] + '단계!', 'good'); save(); }
          refreshShop(); refreshHud();
        });
      }
      row.appendChild(name); row.appendChild(btn);
      list.appendChild(row);
    });
    shopSig = sig();
  }
  function sig() { return [G.baseAt(state.player.x, state.player.y) >= 0, state.rp, JSON.stringify(state.up)].join('|'); }
  $('shopBtn').addEventListener('click', openShop);
  $('shopClose').addEventListener('click', closeShop);
  $('shop').addEventListener('click', function (e) { if (e.target === $('shop')) closeShop(); });

  // ----- 도감 -----
  function dexItem(type, id, name, desc, known, extra) {
    var item = document.createElement('div'); item.className = 'dex-item' + (known ? '' : ' locked');
    var cv = document.createElement('canvas'); cv.width = 108; cv.height = 108;
    D.icon(cv, type, id);
    var box = document.createElement('div');
    var b = document.createElement('b'); b.textContent = known ? name : '❓ ???';
    var p = document.createElement('p'); p.textContent = known ? desc : extra;
    box.appendChild(b); box.appendChild(p);
    item.appendChild(cv); item.appendChild(box);
    return item;
  }
  var ZONE_HINT = { coast: '바닷가에서 볼 수 있어요.', seaice: '바닷가 얼음 위에서 볼 수 있어요.', mountain: '내륙의 산 근처에서 볼 수 있어요.' };
  function openDex() {
    var an = $('dexAnimals'), sa = $('dexSamples');
    an.textContent = ''; sa.textContent = '';
    G.ANIMALS.forEach(function (a) { an.appendChild(dexItem('animal', a.id, a.name, a.desc, !!state.seen[a.id], ZONE_HINT[a.zone])); });
    G.SAMPLES.forEach(function (sm) {
      var n = state.delivered[sm.id];
      sa.appendChild(dexItem('sample', sm.id, sm.name + ' · 연구 ' + n + '개 (' + sm.points + '점)', sm.desc, n > 0, sm.where + '에서 찾을 수 있어요. (' + sm.points + '점)'));
    });
    $('dexCount').textContent = '관찰한 동물 ' + G.seenCount(state) + '/' + G.ANIMALS.length + ' · 연구한 표본 ' + G.deliveredTotal(state) + '개';
    $('dex').hidden = false;
  }
  $('dexBtn').addEventListener('click', openDex);
  $('dexClose').addEventListener('click', function () { $('dex').hidden = true; });
  $('dex').addEventListener('click', function (e) { if (e.target === $('dex')) $('dex').hidden = true; });

  // ----- 엔딩 -----
  function showEnding() {
    var ul = $('endingStats');
    ul.textContent = '';
    var mins = Math.max(1, Math.round(state.play / 60));
    ['⏱️ 탐험 시간 약 ' + mins + '분', '🐧 관찰한 동물 ' + G.seenCount(state) + '/' + G.ANIMALS.length + '종', '🧪 연구한 표본 ' + G.deliveredTotal(state) + '개',
      '🚁 구조된 횟수 ' + state.rescues + '번', '🔬 모은 연구 점수 ' + num(state.total) + '점'].forEach(function (t) {
      var li = document.createElement('li'); li.textContent = t; ul.appendChild(li);
    });
    $('ending').hidden = false;
    beep([523, 659, 784, 1046, 784, 1046, 1318], 'triangle', 0.13);
  }
  $('endingRank').addEventListener('click', function () { $('ending').hidden = true; showRank(); });
  $('endingClose').addEventListener('click', function () { $('ending').hidden = true; });

  // ----- 저장·순위 -----
  function save() { set(SAVE_KEY, JSON.stringify(G.toSave(state))); }
  setInterval(save, 5000);
  window.addEventListener('pagehide', save);
  var lastRanked = 0;
  function showRank() {
    var total = Math.floor(state.total);
    if (total > lastRanked) { lastRanked = total; ranking.show(total); } else ranking.show(0);
  }
  $('rankBtn').addEventListener('click', showRank);
  $('soundBtn').addEventListener('click', function () {
    muted = !muted; set(SOUND_KEY, muted ? 'off' : 'on'); refreshSound();
    if (!muted) ensureAudio(); else if (wind) wind.gain.gain.value = 0;
  });
  $('resetBtn').addEventListener('click', function () {
    if (!confirm('정말 처음부터 다시 할까요? 연구 점수·장비·도감이 모두 사라져요.')) return;
    if (!confirm('진짜로요? 되돌릴 수 없어요!')) return;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 무시 */ }
    state = G.create(null, null);
    lastRanked = 0;
    closeShop();
    toast('새 탐험을 시작했어요!', 'good');
  });

  // ----- 설명 창 -----
  $('guideBtn').addEventListener('click', function () { $('guide').hidden = false; });
  $('guideClose').addEventListener('click', function () { $('guide').hidden = true; set(GUIDE_KEY, '1'); });
  if (!get(GUIDE_KEY)) $('guide').hidden = false;

  function closeAll() {
    ['shop', 'dex', 'guide', 'ending'].forEach(function (id) { $(id).hidden = true; });
    if (!get(GUIDE_KEY)) set(GUIDE_KEY, '1');
  }

  // ----- 다른 탭이면 멈춤 -----
  var last = performance.now();
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { save(); keys = {}; stick = null; if (wind) wind.gain.gain.value = 0; }
    else last = performance.now();
  });

  // ----- 시간 흐름 -----
  var hudTimer = 0;
  function loop(now) {
    var dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    var paused = document.hidden || anyDialog();
    if (!paused) G.update(state, input(), dt).forEach(onEvent);
    else { actQueued = false; tentQueued = false; }
    updateWind(dt, paused);
    hudTimer += dt;
    if (hudTimer > 0.15) { hudTimer = 0; refreshHud(); if (!$('shop').hidden && sig() !== shopSig) refreshShop(); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.frame(ctx, state, now / 1000, { view: view, stick: stick, cardOpen: !$('card').hidden });
    requestAnimationFrame(loop);
  }
  refreshHud();
  requestAnimationFrame(loop);
  A.debug = { get state() { return state; }, set state(v) { state = v; } };
})(window.Antarctica);
