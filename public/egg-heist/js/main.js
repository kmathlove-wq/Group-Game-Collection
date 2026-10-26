// ===== main.js =====
// 계란 훔치기 화면: 키보드·손가락 조이스틱 입력, 알림(토스트), 소리, 상점, 저장, 순위.
// localStorage: 'egg-heist:save'(game.toSave), 'egg-heist:playerId'(순위 한 줄 열쇠), 'egg-heist:sound'('off'면 끔),
// 'egg-heist:guide-seen'(설명 창을 본 적 있음). 글은 모두 textContent로만 넣는다.
(function (E) {
  'use strict';
  var G = E.Game, D = E.Draw;
  var $ = function (id) { return document.getElementById(id); };
  var SAVE_KEY = 'egg-heist:save', ID_KEY = 'egg-heist:playerId', SOUND_KEY = 'egg-heist:sound', GUIDE_KEY = 'egg-heist:guide-seen';

  function get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function set(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* 무시 */ } }

  var playerId = get(ID_KEY);
  if (!playerId || !/^[A-Za-z0-9_-]{1,64}$/.test(playerId)) {
    playerId = 'egg-' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    set(ID_KEY, playerId);
  }
  var ranking = window.GroupRanking.create({ slug: 'egg-heist', unit: '원', top: 50, playerId: function () { return playerId; } });

  var saved = null;
  try { saved = JSON.parse(get(SAVE_KEY) || 'null'); } catch (e) { saved = null; }
  var state = G.create(null, saved);

  var canvas = $('game');
  var ctx = canvas.getContext('2d');
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = D.VIEW_W * dpr; canvas.height = D.VIEW_H * dpr;

  // ----- 소리 -----
  var muted = get(SOUND_KEY) === 'off';
  var audio = null;
  function beep(notes, type, gap) {
    if (muted) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var t = audio.currentTime;
      notes.forEach(function (n, i) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.type = type || 'sine'; o.frequency.value = n;
        var at = t + i * (gap || 0.08);
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.15, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
        o.connect(g); g.connect(audio.destination); o.start(at); o.stop(at + 0.2);
      });
    } catch (e) { /* 무시 */ }
  }
  function refreshSound() { $('soundBtn').textContent = muted ? '🔇' : '🔊'; $('soundBtn').setAttribute('aria-label', muted ? '소리 켜기' : '소리 끄기'); }
  refreshSound();

  // ----- 알림 -----
  var toastTimer = null;
  function toast(msg, kind) {
    var el = $('toast');
    el.textContent = msg;
    el.className = 'toast show ' + (kind || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast'; }, 2200);
  }
  var BOT_NAME = { red: '빨강봇', blue: '초록봇' };
  function onEvent(e) {
    var tierName = e.tier != null ? G.TIERS[e.tier].name : '';
    if (e.type === 'pickup') { beep([660, 990]); if (e.tier >= 2) toast('✨ ' + tierName + ' 알을 주웠어요! 기지로 달려가요!', 'good'); }
    else if (e.type === 'steal') { beep([880, 1175, 1568]); toast('😎 ' + G.BASES[e.from].name.replace(' 기지', '') + '의 ' + tierName + ' 알을 훔쳤어요!', 'good'); }
    else if (e.type === 'deposit') { beep([523, 784]); }
    else if (e.type === 'hatch') { beep([523, 659, 784, 1046]); toast('🐣 ' + tierName + ' 알이 깨어나 ' + e.pet + ' 펫이 됐어요! (+' + G.TIERS[e.tier].income + '원/초)', 'good'); refreshShop(); }
    else if (e.type === 'pen-full') { beep([300, 250], 'square'); toast('🧺 우리가 꽉 찼어요! 상점에서 칸을 늘리거나 펫을 팔아요.', 'bad'); }
    else if (e.type === 'caught') { beep([400, 300, 200], 'sawtooth'); toast(e.guard + ' 지킴이에게 잡혀서 알을 놓쳤어요!', 'bad'); }
    else if (e.type === 'stolen') { beep([300, 200], 'square'); toast('🚨 ' + BOT_NAME[e.bot] + '이 내 ' + tierName + ' 알을 훔쳐 가요! 쫓아가서 부딪혀요!', 'bad'); }
    else if (e.type === 'tag') { beep([700, 500]); toast('💥 ' + BOT_NAME[e.bot] + '에게 부딪혀서 알을 떨어뜨리게 했어요!', 'good'); }
  }

  // ----- 입력 -----
  var keys = {};
  document.addEventListener('keydown', function (e) {
    if (e.target && (e.target.tagName === 'INPUT')) return;
    keys[e.key.toLowerCase()] = true;
    if (e.key === 'b' || e.key === 'B') openShop();
    if (e.key === 'l' || e.key === 'L') doLock();
    if (e.key.indexOf('Arrow') === 0) e.preventDefault();
  });
  document.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', function () { keys = {}; });
  function keyInput() {
    var x = 0, y = 0;
    if (keys.arrowleft || keys.a) x -= 1;
    if (keys.arrowright || keys.d) x += 1;
    if (keys.arrowup || keys.w) y -= 1;
    if (keys.arrowdown || keys.s) y += 1;
    return { x: x, y: y };
  }
  // 손가락: 누른 자리가 조이스틱 가운데, 끈 방향으로 움직임
  var stick = null;
  function canvasPos(e) {
    var r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * D.VIEW_W, y: (e.clientY - r.top) / r.height * D.VIEW_H };
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
    if (stick && Math.hypot(stick.dx, stick.dy) > 8) return { x: stick.dx, y: stick.dy };
    return keyInput();
  }

  // ----- 화면 위 숫자 -----
  function money(n) { return Math.floor(n).toLocaleString('ko-KR'); }
  function refreshHud() {
    $('money').textContent = '💰 ' + money(state.money) + '원';
    $('income').textContent = '+' + money(G.income(state)) + '원/초';
    $('carry').textContent = '🥚 ' + state.player.carry.length + '/' + G.capacity(state.up.carry);
    var base = state.bases[0];
    var lockBtn = $('lockBtn');
    lockBtn.hidden = !state.up.lock;
    if (base.lockUntil > state.t) lockBtn.textContent = '🔒 잠김 ' + Math.ceil(base.lockUntil - state.t);
    else if (base.lockReadyAt > state.t) lockBtn.textContent = '🔒 ' + Math.ceil(base.lockReadyAt - state.t) + '초 뒤';
    else lockBtn.textContent = '🔒 잠그기';
    lockBtn.disabled = base.lockReadyAt > state.t;
  }
  function doLock() {
    var r = G.lock(state);
    if (r.ok) { beep([440, 880]); toast('🔒 ' + G.LOCK_SECONDS + '초 동안 봇이 내 기지에 못 들어와요!', 'good'); }
    else if (r.why === 'cooldown') toast('잠금 장치를 식히는 중이에요. ' + r.wait + '초 뒤에 다시 쓸 수 있어요.');
    refreshHud();
  }
  $('lockBtn').addEventListener('click', doLock);

  // ----- 상점 -----
  function openShop() { refreshShop(); $('shop').hidden = false; }
  function closeShop() { $('shop').hidden = true; }
  function refreshShop() {
    var list = $('upgrades');
    list.textContent = '';
    var inBase = G.inMyBase(state);
    $('shopWhere').textContent = inBase ? '🏠 기지 안이라 살 수 있어요.' : '🚶 기지 밖이에요. 물건은 기지 안에서만 살 수 있어요(펫 팔기는 어디서나).';
    Object.keys(G.UPGRADES).forEach(function (key) {
      var u = G.UPGRADES[key], lv = state.up[key];
      var row = document.createElement('div'); row.className = 'row';
      var name = document.createElement('span'); name.className = 'name'; name.textContent = u.name + (u.max > 1 ? ' (' + lv + '/' + u.max + ')' : lv ? ' ✅' : '');
      var btn = document.createElement('button'); btn.type = 'button';
      if (lv >= u.max) { btn.textContent = '최고 단계'; btn.disabled = true; }
      else {
        var price = u.cost(lv);
        btn.textContent = money(price) + '원';
        btn.disabled = !inBase || state.money < price;
        btn.addEventListener('click', function () {
          var r = G.buy(state, key);
          if (r.ok) { beep([660, 880, 1320]); toast('🛒 ' + u.name + ' 샀어요!', 'good'); save(); }
          refreshShop(); refreshHud();
        });
      }
      row.appendChild(name); row.appendChild(btn);
      list.appendChild(row);
    });
    var pens = $('pens');
    pens.textContent = '';
    state.bases[0].slots.forEach(function (sl, i) {
      var row = document.createElement('div'); row.className = 'row';
      var name = document.createElement('span'); name.className = 'name';
      if (!sl) name.textContent = (i + 1) + '번 칸 · 비어 있음';
      else if (sl.kind === 'egg') name.textContent = (i + 1) + '번 칸 · ' + G.TIERS[sl.tier].name + ' 알 (부화까지 ' + Math.ceil(sl.left) + '초)';
      else name.textContent = (i + 1) + '번 칸 · ' + G.TIERS[sl.tier].pets[sl.pet] + ' ' + G.TIERS[sl.tier].name + ' 펫 (+' + G.TIERS[sl.tier].income + '원/초)';
      row.appendChild(name);
      if (sl && sl.kind === 'pet') {
        var btn = document.createElement('button'); btn.type = 'button';
        btn.textContent = '팔기 ' + money(G.sellPrice(sl.tier)) + '원';
        btn.addEventListener('click', function () {
          if (!confirm(G.TIERS[sl.tier].pets[sl.pet] + ' 펫을 ' + money(G.sellPrice(sl.tier)) + '원에 팔까요?')) return;
          G.sell(state, i); beep([880, 660]); save(); refreshShop(); refreshHud();
        });
        row.appendChild(btn);
      }
      pens.appendChild(row);
    });
  }
  $('shopBtn').addEventListener('click', openShop);
  $('shopClose').addEventListener('click', closeShop);
  $('shop').addEventListener('click', function (e) { if (e.target === $('shop')) closeShop(); });

  // ----- 저장·순위 -----
  function save() { set(SAVE_KEY, JSON.stringify(G.toSave(state))); }
  setInterval(save, 5000);
  document.addEventListener('visibilitychange', function () { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);
  var lastSent = 0;
  setInterval(function () {
    var earned = Math.floor(state.earned);
    if (!ranking.hasName() || earned <= lastSent || earned <= 0) return;
    lastSent = earned;
    ranking.quietSubmit(earned).catch(function () { lastSent = 0; });
  }, 20000);
  $('rankBtn').addEventListener('click', function () {
    var earned = Math.floor(state.earned);
    if (earned > lastSent) { lastSent = earned; ranking.show(earned); } else ranking.show(0);
  });
  $('soundBtn').addEventListener('click', function () { muted = !muted; set(SOUND_KEY, muted ? 'off' : 'on'); refreshSound(); });
  $('resetBtn').addEventListener('click', function () {
    if (!confirm('정말 처음부터 다시 할까요? 돈·업그레이드·펫이 모두 사라져요.')) return;
    if (!confirm('진짜로요? 되돌릴 수 없어요!')) return;
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 무시 */ }
    playerId = 'egg-' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    set(ID_KEY, playerId);
    state = G.create(null, null);
    lastSent = 0;
    closeShop();
    toast('새 게임을 시작했어요!', 'good');
  });

  // ----- 설명 창 -----
  function openGuide() { $('guide').hidden = false; }
  $('guideBtn').addEventListener('click', openGuide);
  $('guideClose').addEventListener('click', function () { $('guide').hidden = true; set(GUIDE_KEY, '1'); });
  if (!get(GUIDE_KEY)) openGuide();

  // ----- 시간 흐름 -----
  var last = performance.now();
  var hudTimer = 0;
  function loop(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    var paused = !$('guide').hidden;
    if (!paused) G.update(state, input(), dt).forEach(onEvent);
    hudTimer += dt;
    if (hudTimer > 0.15) { hudTimer = 0; refreshHud(); if (!$('shop').hidden) refreshShopLive(); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    D.frame(ctx, state, now / 1000, stick);
    requestAnimationFrame(loop);
  }
  // 상점이 열려 있으면 살 수 있는지·칸 모양이 바뀔 때만 다시 그림(누르는 중에 단추가 새로 만들어져 눌림이 사라지지 않게)
  var shopSig = '';
  function refreshShopLive() {
    var sig = [G.inMyBase(state), JSON.stringify(state.up)].concat(Object.keys(G.UPGRADES).map(function (k) {
      return state.up[k] < G.UPGRADES[k].max && state.money >= G.UPGRADES[k].cost(state.up[k]);
    }), state.bases[0].slots.map(function (sl) { return sl ? sl.kind + sl.tier : '-'; })).join('|');
    if (sig !== shopSig) { shopSig = sig; refreshShop(); }
  }

  refreshHud();
  requestAnimationFrame(loop);
  window.Egg.debug = { get state() { return state; } };
})(window.Egg);
