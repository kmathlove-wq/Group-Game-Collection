// ===== main.js =====
// 깡통 소탕대 화면: 메뉴·스테이지 지도·상점·옷장·끝없는 탑, 키보드·터치 입력, 게임 돌리기, 순위.
// localStorage: 'tin-squad:save'(save.js), 'tin-squad:playerId'(순위 한 줄 열쇠), 'tin-squad:guide-seen', 'tin-squad:sound'. 글은 모두 textContent로만 넣는다.
(function (TS) {
  'use strict';
  var L = TS.Levels, G = TS.Game, D = TS.Draw, S = TS.Sound, V = TS.Save;
  var $ = function (id) { return document.getElementById(id); };
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 무시 */ } }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

  var save = V.load();
  if (!D.SKINS[save.skin]) save.skin = 'orange';
  D.setSkin(save.skin);
  var playerId = get('tin-squad:playerId');
  if (!playerId || !/^[A-Za-z0-9_-]{1,64}$/.test(playerId)) { playerId = 'tin-' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); set('tin-squad:playerId', playerId); }
  function pid() { return playerId; }
  var rankStory = window.GroupRanking.create({ slug: 'tin-squad', unit: '점', top: 50, title: '🏆 모험 점수 순위(40판 최고 점수 합)', nameKey: 'tin-squad:nickname', playerId: pid });
  var rankTower = window.GroupRanking.create({ slug: 'tin-squad-tower', unit: '점', top: 50, title: '🗼 끝없는 탑 순위', nameKey: 'tin-squad:nickname', playerId: pid });

  // ----- 화면 -----
  var canvas = $('game'), ctx = canvas.getContext('2d'), scale = 1;
  function resize() {
    var w = canvas.clientWidth || 960, dpr = Math.min(2, window.devicePixelRatio || 1);
    scale = Math.max(0.75, Math.min(2, w * dpr / L.VIEW_W));
    canvas.width = Math.round(L.VIEW_W * scale); canvas.height = Math.round(L.VIEW_H * scale);
  }
  window.addEventListener('resize', resize);

  var state = null, mode = 'title', paused = false, stageIdx = 0, tower = null, demoT = 0, endWait = 0;
  var SCREENS = ['title', 'map', 'shop', 'skins', 'pause', 'result', 'perk'];
  function show(name) {
    SCREENS.forEach(function (id) { $(id).hidden = id !== name; });
    mode = name || 'play';
    var playing = mode === 'play';
    document.body.classList.toggle('playing', playing);
    $('pauseBtn').hidden = !playing;
    $('touch').hidden = !(playing && touchUI);
    clearInput();
    if (name === 'title') refreshTitle();
    document.querySelectorAll('[data-coins]').forEach(function (n) { n.textContent = '🪙 ' + save.coins.toLocaleString('ko-KR'); });
  }
  function refreshTitle() {
    $('coinText').textContent = '🪙 ' + save.coins.toLocaleString('ko-KR');
    $('starText').textContent = '⭐ ' + V.totalStars(save) + '/' + L.STAGE_COUNT * 3;
    $('towerText').textContent = '🗼 최고 ' + save.towerBest + '층';
    S.music(null);
  }
  function demo() { // 첫 화면 뒤에서 도는 지도 구경
    state = G.create({ stage: Math.floor(Math.random() * 8) * 5, god: true });
    D.reset(); state.events = [];
  }

  // ----- 스테이지 지도 -----
  function openMap() {
    var box = $('worlds'); box.textContent = '';
    var next = 0;
    while (next < L.STAGE_COUNT - 1 && save.stars[next] > 0) next++;
    var focus = null;
    L.WORLDS.forEach(function (w, wi) {
      var open = V.unlocked(save, wi * 5), row = el('div', 'world' + (open ? '' : ' locked')), head = el('div'), list = el('div', 'stages');
      var pal = D.PAL[wi], pic = D.pic('bg_' + w.id);
      row.style.backgroundImage = pic ? 'linear-gradient(rgba(10,14,30,.45), rgba(10,14,30,.45)), url("' + pic.src + '")' : 'linear-gradient(100deg, ' + pal.near + ', ' + pal.far + ')';
      var stars = 0; for (var k = 0; k < 5; k++) stars += save.stars[wi * 5 + k];
      head.appendChild(el('h3', null, (wi + 1) + '. ' + w.name));
      head.appendChild(el('small', null, '⭐ ' + stars + '/15'));
      for (var n = 0; n < 5; n++) (function (i) {
        var info = L.stageInfo(i), can = V.unlocked(save, i), b = el('button', 'stage-btn' + (i === next ? ' next' : ''));
        b.type = 'button'; b.disabled = !can;
        b.appendChild(el('span', null, can ? info.label : '🔒'));
        b.appendChild(el('small', null, info.typeName));
        b.appendChild(el('span', 'st', can ? '★★★'.slice(0, save.stars[i]) + '☆☆☆'.slice(save.stars[i]) : ''));
        b.addEventListener('click', function () { S.play('click'); startStage(i); });
        list.appendChild(b);
        if (i === next) focus = b;
      })(wi * 5 + n);
      row.appendChild(head); row.appendChild(list); box.appendChild(row);
    });
    show('map');
    if (focus) focus.scrollIntoView({ block: 'center' });
  }

  // ----- 상점·옷장 -----
  function openShop() {
    var box = $('shopList'); box.textContent = '';
    V.SHOP.forEach(function (it) {
      var lv = save.up[it.id] || 0, max = it.prices.length, price = it.prices[lv], c = el('div', 'card');
      c.appendChild(el('b', null, it.icon + ' ' + it.name));
      c.appendChild(el('p', null, it.desc));
      c.appendChild(el('span', 'lv', '●'.repeat(lv) + '○'.repeat(max - lv)));
      var b = el('button', null, price == null ? '다 샀어요!' : '🪙 ' + price); b.type = 'button';
      b.disabled = price == null || save.coins < price;
      b.addEventListener('click', function () { if (V.buy(save, it.id)) { V.store(save); S.play('buy'); openShop(); } });
      c.appendChild(b); box.appendChild(c);
    });
    show('shop');
  }
  function openSkins() {
    var box = $('skinList'); box.textContent = '';
    Object.keys(D.SKINS).forEach(function (id) {
      var sk = D.SKINS[id], own = save.skins.indexOf(id) >= 0, c = el('div', 'card'), cv = document.createElement('canvas');
      cv.width = 320; cv.height = 120;
      var x = cv.getContext('2d'); x.translate(160, 112); x.scale(1.35, 1.35);
      D.hero(x, 0, 0, { vx: 0, anim: 0, ground: true, face: 1, ax: 1, ay: 0, weapon: 'screw', melee: 0, shootPose: 0 }, sk);
      c.appendChild(cv); c.appendChild(el('b', null, sk.name));
      var b = el('button', null, save.skin === id ? '입고 있어요' : own ? '입기' : '🪙 ' + sk.price); b.type = 'button';
      b.disabled = save.skin === id || (!own && save.coins < sk.price);
      b.addEventListener('click', function () {
        if (!own) { if (save.coins < sk.price) return; save.coins -= sk.price; save.skins.push(id); S.play('buy'); } else S.play('click');
        save.skin = id; D.setSkin(id); V.store(save); openSkins();
      });
      c.appendChild(b); box.appendChild(c);
    });
    show('skins');
  }

  // ----- 게임 시작 -----
  function begin() {
    D.reset(); paused = false; endWait = 0;
    var i = state.map.info;
    D.banner(i.label + ' ' + i.name, i.type === 'chase' ? '뒤에서 분쇄기가 쫓아와요! 달려요!' : i.type === 'boss' ? '끝에서 보스가 기다려요' : i.type === 'mech' ? '빨래 로봇을 찾아 타요!' : i.typeName, 2.2);
    S.unlock(); S.music(state.map.world, i.type === 'boss');
    show(null); resize();
  }
  function startStage(i) { stageIdx = i; tower = null; state = G.create({ stage: i, up: save.up, seed: Date.now() % 100000 }); begin(); }
  function startTower() { tower = { floor: 1, seed: 1 + Math.floor(Math.random() * 1e6), mods: {}, carry: null, score: 0, coins: 0, pets: 0 }; nextFloor(); }
  function nextFloor() { state = G.create({ floor: tower.floor, seed: tower.seed, up: save.up, mods: tower.mods, carry: tower.carry }); begin(); }

  // ----- 끝났을 때 -----
  function resRow(name, v) { var li = el('li'); li.appendChild(el('span', null, name)); li.appendChild(el('span', null, v)); $('resList').appendChild(li); }
  function finish() {
    S.music(null);
    if (tower) return finishFloor();
    var ok = state.status === 'clear', r = state.result;
    $('resTitle').textContent = ok ? '스테이지 클리어!' : '앗, 실패!';
    $('resStars').textContent = ''; $('resList').textContent = ''; $('resNote').textContent = '';
    if (ok) {
      var f = V.finish(save, stageIdx, r.stars, state.score, state.coins);
      var got = [true, state.deaths === 0, state.pets >= state.petsTotal];
      got.forEach(function (on, i) { var sp = el('span', on ? 'on' : '', '⭐'); sp.style.animationDelay = i * 0.25 + 's'; $('resStars').appendChild(sp); });
      resRow('시간 보너스', '+' + r.time); resRow('하트 보너스', '+' + r.hp); resRow('안 쓰러짐', '+' + r.nodeath); resRow('최고 콤보 ' + state.bestCombo, '+' + r.combo);
      resRow('모두 합해', state.score.toLocaleString('ko-KR') + '점'); resRow('동전', '🪙 ' + (state.coins + f.bonus));
      $('resNote').textContent = f.record ? '🎉 최고 점수를 새로 세웠어요!' : !got[1] ? '쓰러지지 않고 깨면 별을 하나 더!' : !got[2] ? '동물 친구를 모두 구하면 별을 하나 더!' : '별 3개! 완벽해요!';
      S.play('star');
      if (rankStory.hasName()) rankStory.quietSubmit(V.totalScore(save)).catch(function () { /* 다음에 다시 */ });
    } else {
      var half = Math.floor(state.coins / 2); save.coins += half;
      resRow('점수', state.score.toLocaleString('ko-KR') + '점'); resRow('부순 로봇', state.kills + '대'); resRow('챙긴 동전(절반)', '🪙 ' + half);
      var pct = state.boss ? Math.round(100 - state.boss.hp / state.boss.maxHp * 100) : Math.min(99, Math.round(state.p.x / state.map.width * 100));
      $('resNote').textContent = state.boss ? '보스 체력을 ' + pct + '% 깎았어요. 조금만 더!' : pct + '%까지 갔어요. 상점에서 강해지면 쉬워져요!';
    }
    V.store(save);
    var hasNext = ok && stageIdx + 1 < L.STAGE_COUNT;
    $('resNext').textContent = hasNext ? '다음 스테이지 ▶' : ok ? '🎉 모두 깼어요! 탑으로' : '🛒 상점 가기';
    $('resNext').onclick = function () { S.play('click'); if (hasNext) startStage(stageIdx + 1); else if (ok) startTower(); else { demo(); openShop(); } };
    $('resAgain').hidden = false; $('resAgain').onclick = function () { S.play('click'); startStage(stageIdx); };
    show('result');
  }
  function finishFloor() {
    tower.score += state.score; tower.pets += state.pets; tower.coins += Math.round(state.coins * state.st.coin);
    if (state.status === 'clear') {
      var p = state.p;
      tower.carry = { hp: p.hp, weapon: p.weapon, ammo: p.ammo, bombs: p.bombs };
      var floor = tower.floor; tower.floor++;
      if (floor > save.towerBest) { save.towerBest = floor; V.store(save); }
      $('perkTitle').textContent = floor + '층 통과!';
      var list = $('perkList'); list.textContent = '';
      G.perkChoices(tower.mods, Math.random).forEach(function (perk) {
        var b = el('button', 'perk'); b.type = 'button';
        b.appendChild(el('i', null, perk.icon)); b.appendChild(el('b', null, perk.name)); b.appendChild(el('small', null, perk.desc));
        b.addEventListener('click', function () { if (mode !== 'perk') return; S.play('power'); G.applyPerk(perk, tower.mods, tower.carry, Math.random); nextFloor(); });
        list.appendChild(b);
      });
      show('perk');
      return;
    }
    // 탑에서 쓰러짐
    save.coins += tower.coins;
    var rec = tower.score > save.towerScore;
    if (rec) save.towerScore = Math.min(99999999, tower.score);
    V.store(save);
    $('resTitle').textContent = '🗼 ' + tower.floor + '층에서 쓰러졌어요';
    $('resStars').textContent = ''; $('resList').textContent = '';
    resRow('탑 점수', tower.score.toLocaleString('ko-KR') + '점'); resRow('구한 동물', tower.pets + '마리'); resRow('동전', '🪙 ' + tower.coins); resRow('최고 점수', save.towerScore.toLocaleString('ko-KR') + '점');
    $('resNote').textContent = rec ? '🎉 최고 기록이에요!' : '다음엔 더 높이 갈 수 있어요!';
    var sc = tower.score;
    $('resNext').textContent = '🏆 순위에 올리기';
    $('resNext').onclick = function () { rankTower.show(sc); };
    $('resAgain').hidden = false; $('resAgain').onclick = function () { S.play('click'); startTower(); };
    show('result');
  }

  // ----- 입력 -----
  var KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down', KeyZ: 'fire', KeyJ: 'fire', KeyX: 'jump', KeyK: 'jump', Space: 'jump', KeyC: 'bomb', KeyL: 'bomb' };
  var down = {}, touch = {}, touchUI = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  function clearInput() { down = {}; touch = {}; document.querySelectorAll('.tbtn.on').forEach(function (b) { b.classList.remove('on'); }); }
  function typing(e) { var t = e.target; return t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName); }
  window.addEventListener('keydown', function (e) {
    if (typing(e) || rankStory.isOpen() || rankTower.isOpen()) return;
    if (!$('guide').hidden) { if (e.code === 'Escape') closeGuide(); return; }
    if (mode === 'perk' && /^(Digit|Numpad)[123]$/.test(e.code)) { var b = $('perkList').children[+e.code.slice(-1) - 1]; if (b) b.click(); return; }
    if (mode === 'result' && e.code === 'Enter' && e.target.tagName !== 'BUTTON') { $('resNext').click(); return; } // 스페이스는 점프와 헷갈려 넘기지 않는다
    if (e.code === 'KeyP' || e.code === 'Escape') { if (mode === 'play') pause(); else if (mode === 'pause') resume(); else if (e.code === 'Escape' && /^(map|shop|skins)$/.test(mode)) back(); return; }
    if (mode !== 'play' || !KEYS[e.code] || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault(); down[e.code] = true; S.unlock();
  });
  window.addEventListener('keyup', function (e) { delete down[e.code]; });
  window.addEventListener('blur', clearInput);
  function input() {
    var o = {};
    Object.keys(down).forEach(function (k) { o[KEYS[k]] = true; });
    Object.keys(touch).forEach(function (k) { if (touch[k]) o[k] = true; });
    if (o.left && o.right) o.left = o.right = false;
    return o;
  }
  document.querySelectorAll('.tbtn').forEach(function (b) {
    var key = b.getAttribute('data-key');
    b.addEventListener('pointerdown', function (e) { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (x) { /* 무시 */ } touch[key] = true; b.classList.add('on'); S.unlock(); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (n) { b.addEventListener(n, function () { touch[key] = false; b.classList.remove('on'); }); });
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  });
  (function () {
    var st = $('stick'), knob = st.firstElementChild, id = null;
    function move(e) {
      var r = st.getBoundingClientRect(), dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = (e.clientY - r.top - r.height / 2) / (r.height / 2), len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      knob.style.transform = 'translate(' + dx * r.width * 0.3 + 'px,' + dy * r.height * 0.3 + 'px)';
      touch.left = dx < -0.32; touch.right = dx > 0.32; touch.up = dy < -0.42; touch.down = dy > 0.55;
    }
    st.addEventListener('pointerdown', function (e) { e.preventDefault(); id = e.pointerId; try { st.setPointerCapture(id); } catch (x) { /* 무시 */ } S.unlock(); move(e); });
    st.addEventListener('pointermove', function (e) { if (e.pointerId === id) move(e); });
    function end(e) { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; touch.left = touch.right = touch.up = touch.down = false; }
    st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
    st.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  })();
  window.addEventListener('touchstart', function () { if (!touchUI) { touchUI = true; if (mode === 'play') $('touch').hidden = false; } }, { passive: true });

  function pause() { if (mode !== 'play' || state.status !== 'play') return; paused = true; S.pause(true); show('pause'); $('resumeBtn').focus({ preventScroll: true }); }
  function resume() { paused = false; S.pause(false); show(null); lastT = 0; }
  document.addEventListener('visibilitychange', function () { if (document.hidden) { pause(); S.pause(true); } });

  // ----- 돌리기 -----
  var lastT = 0, acc = 0, STEP = 1 / 60;
  function loop(t) {
    requestAnimationFrame(loop);
    var dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0;
    lastT = t;
    if (!state) return;
    if (mode === 'play' && !paused && $('guide').hidden) {
      acc += dt;
      while (acc >= STEP) {
        acc -= STEP;
        G.update(state, input(), STEP);
        for (var i = 0; i < state.events.length; i++) { var e = state.events[i]; D.event(e, state); S.play(e.t, e); if (e.t === 'boss') S.music(state.map.world, true); }
        if (state.status !== 'play') { endWait += STEP; if (endWait > (state.status === 'clear' ? 1.3 : 0.9)) { acc = 0; finish(); break; } }
      }
      D.frame(ctx, state, dt, scale);
    } else if (mode === 'title') {
      demoT += dt;
      state.camX = (Math.sin(demoT * 0.08) * 0.5 + 0.5) * Math.max(0, state.map.width - L.VIEW_W - 400);
      state.p.x = -999; state.p.inv = 0;
      D.frame(ctx, state, dt, scale, true);
    } else D.frame(ctx, state, 0, scale, mode !== 'pause');
  }

  // ----- 단추 -----
  function back() { S.play('click'); if (!state || state.status !== 'play' || tower || mode !== 'title') demo(); show('title'); }
  document.querySelectorAll('[data-back]').forEach(function (b) { b.addEventListener('click', back); });
  function on(id, fn) { $(id).addEventListener('click', function () { S.unlock(); S.play('click'); fn(); }); }
  on('playBtn', openMap); on('towerBtn', startTower); on('shopBtn', openShop); on('skinBtn', openSkins);
  on('pauseBtn', pause); on('resumeBtn', resume);
  on('retryBtn', function () { if (tower) startTower(); else startStage(stageIdx); });
  on('quitBtn', function () { S.music(null); var t = tower; demo(); tower = null; if (t) show('title'); else openMap(); });
  $('resMap').addEventListener('click', function () { S.play('click'); var t = tower; demo(); tower = null; if (t) show('title'); else openMap(); });
  on('rankBtn', function () { pause(); if (tower) rankTower.show(0); else if (mode === 'title') chooseRank(); else rankStory.show(0); });
  // 순위 단추: 첫 화면에서는 모험 순위(내 점수 올리기)를 보여 주고, 닫으면 탑 순위를 이어 보여 준다
  function chooseRank() { rankStory.show(V.totalScore(save), function () { rankTower.show(save.towerScore); }); }
  function soundIcon() { var m = S.mode(); $('soundBtn').textContent = m === 'on' ? '🔊' : m === 'music-off' ? '🔉' : '🔇'; $('soundBtn').setAttribute('aria-label', m === 'on' ? '소리 켜짐. 누르면 음악만 끔' : m === 'music-off' ? '음악 꺼짐. 누르면 모두 끔' : '소리 꺼짐. 누르면 켬'); }
  $('soundBtn').addEventListener('click', function () { S.unlock(); S.next(); soundIcon(); });
  soundIcon();
  function openGuide() { pause(); $('guide').hidden = false; $('guideClose').focus(); }
  function closeGuide() { $('guide').hidden = true; set('tin-squad:guide-seen', '1'); }
  $('guideBtn').addEventListener('click', openGuide);
  $('guideClose').addEventListener('click', closeGuide);
  // 단추에 초점이 남아 스페이스(점프)로 다시 눌리지 않게
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('button'); if (b && mode === 'play') b.blur(); });
  if (touchUI) $('help').textContent = '왼쪽 동그라미로 움직이고 조준해요(위 = 위로 쏘기, 아래 = 숙이기). 오른쪽 단추로 발사·점프·폭탄!';

  D.load(function () {
    var t = D.pic('title');
    if (t) { $('titleImg').src = t.src; $('titleImg').hidden = false; }
    resize(); demo(); show('title');
    if (!get('tin-squad:guide-seen')) openGuide();
    requestAnimationFrame(loop);
  });
  TS.debug = { get state() { return state; }, get mode() { return mode; }, get save() { return save; }, start: startStage, tower: startTower };
})(window.TinSquad);
