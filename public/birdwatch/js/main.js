// ===== main.js =====
// 탐조 여행 화면: 지역 고르기 → 새가 나타나면 눌러서 발견 → 도감·기록장·상점·미션.
// localStorage: 'birdwatch:save'(진행 저장, rules.sanitize로 다듬어 읽음), 'birdwatch:sound'('off'면 소리 끔).
// 사람이 읽는 글은 모두 textContent로 넣는다. innerHTML은 art.js가 data.js 숫자·색으로 만든 SVG에만 쓴다.
(function () {
  'use strict';

  var BW = window.Birdwatch, D = BW.Data, R = BW.Rules, A = BW.Art;
  var SAVE_KEY = 'birdwatch:save', SOUND_KEY = 'birdwatch:sound';
  var $ = function (id) { return document.getElementById(id); };
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 저장이 안 돼도 게임은 계속 */ } }

  function load() {
    var raw = null;
    try { raw = JSON.parse(get(SAVE_KEY) || 'null'); } catch (e) { raw = null; }
    return R.sanitize(raw);
  }
  var save = load();
  function store() { set(SAVE_KEY, JSON.stringify(save)); }

  // ----- 소리(웹오디오로 직접 만든 새소리) -----
  var muted = get(SOUND_KEY) === 'off', audio = null;
  function soundButton() {
    $('soundBtn').textContent = muted ? '🔇' : '🔊';
    $('soundBtn').setAttribute('aria-pressed', String(muted));
    $('soundBtn').setAttribute('aria-label', muted ? '소리 켜기' : '소리 끄기');
  }
  function tone(freqs, start, dur, type, vol) {
    var t0 = audio.currentTime + start;
    var o = audio.createOscillator(), g = audio.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freqs[0], t0);
    for (var i = 1; i < freqs.length; i++) o.frequency.linearRampToValueAtTime(freqs[i], t0 + dur * i / (freqs.length - 1));
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.12, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(audio.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function play(fn) {
    if (muted) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      fn();
    } catch (e) { /* 소리가 안 돼도 게임은 계속 */ }
  }
  var sound = {
    chirp: function (size) { // 작은 새는 높고 빠르게, 큰 새는 낮게
      var base = Math.max(500, 3400 - size * 22);
      play(function () { for (var i = 0; i < 3; i++) tone([base, base * 1.35, base * 0.9], i * 0.11, 0.09, 'sine', 0.08); });
    },
    found: function () { play(function () { [660, 880, 1100, 1320].forEach(function (f, i) { tone([f, f], i * 0.09, 0.12, 'triangle', 0.1); }); }); },
    coin: function () { play(function () { tone([990, 1320], 0, 0.12, 'square', 0.04); }); },
    miss: function () { play(function () { tone([500, 300], 0, 0.15, 'sine', 0.05); }); }
  };

  // ----- 글 도우미 -----
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function fmt(nm) { return Number(nm).toLocaleString('ko-KR'); }
  function artFor(b, silhouette, pose) {
    var box = el('div', 'bw-pic');
    box.innerHTML = A.bird(b, pose || restPose(b), silhouette).svg; // data.js 값으로만 만든 SVG
    return box;
  }
  function restPose(b) {
    var w = D.SHAPES[b.shape];
    return w === 'water' ? 'swim' : w === 'shore' ? 'stand' : 'perch';
  }
  function endangeredText(lv) { return lv === 1 ? '멸종위기 Ⅰ급' : lv === 2 ? '멸종위기 Ⅱ급' : ''; }
  function dateText(t) {
    if (!t) return '';
    var d = new Date(t);
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  // ----- 상단·미션 표시 -----
  function hud() {
    $('pointsLabel').textContent = '🪙 ' + fmt(save.points);
    var st = R.stats(save);
    $('dexLabel').textContent = '📖 ' + st.species + '/' + st.total;
    var c = R.currentMission(save);
    if (!c.mission) {
      $('missionText').textContent = '🏆 모든 미션 완료!';
      $('missionCount').textContent = R.MISSIONS.length + '/' + R.MISSIONS.length;
    } else {
      $('missionText').textContent = c.mission.title + ' (' + c.value + '/' + c.mission.goal + ')';
      $('missionCount').textContent = (c.index + 1) + '/' + R.MISSIONS.length;
    }
  }

  var toastTimer = 0;
  function toast(text) {
    var t = $('toast');
    t.textContent = text;
    t.hidden = false;
    t.classList.remove('show');
    void t.offsetWidth;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function missionToasts(list) {
    if (!list || !list.length) return;
    var m = list[list.length - 1];
    setTimeout(function () {
      toast('🎯 미션 완료! ' + m.title + ' +' + list.reduce(function (s, x) { return s + x.reward; }, 0));
      sound.coin();
    }, 400);
  }

  // ===== 지역 고르기 =====
  function showMap() {
    leaveField();
    $('mapView').hidden = false;
    $('fieldView').hidden = true;
    var grid = $('regionGrid');
    grid.textContent = '';
    D.REGIONS.forEach(function (r) {
      var open = save.regions.indexOf(r.id) >= 0;
      var card = el('article', 'region' + (open ? '' : ' locked'));
      card.appendChild(el('div', 'region-emoji', open ? r.emoji : '🔒'));
      var body = el('div', 'region-body');
      body.appendChild(el('h2', null, r.name));
      body.appendChild(el('small', null, r.place));
      body.appendChild(el('p', null, r.desc));
      var pr = R.regionProgress(save, r.id);
      body.appendChild(el('span', 'region-progress', '🐦 본 새 ' + pr.seen + '/' + pr.total));
      var btn = el('button', open ? 'go' : 'unlock');
      btn.type = 'button';
      if (open) {
        btn.textContent = '탐조하러 가기 →';
        btn.addEventListener('click', function () { enterRegion(r.id); });
      } else {
        btn.textContent = '🪙 ' + fmt(r.cost) + ' 포인트로 열기';
        btn.disabled = save.points < r.cost;
        btn.addEventListener('click', function () { tryUnlock(r.id); showMap(); });
      }
      body.appendChild(btn);
      card.appendChild(body);
      grid.appendChild(card);
    });
    hud();
  }

  function tryUnlock(id) {
    var res = R.unlockRegion(save, id);
    if (res.ok) {
      store();
      sound.coin();
      toast('🗺️ ' + D.region(id).name + '을(를) 열었어요!');
      missionToasts(res.missions);
    } else if (res.error === 'points') toast('포인트가 모자라요. 새를 더 찾아보세요!');
    hud();
    return res.ok;
  }

  // ===== 탐조 화면 =====
  var field = null; // { region, scene, birds: [], perchUsed: {}, spawnT, last, running, refreshAt }

  function enterRegion(id) {
    var r = D.region(id);
    if (!r || save.regions.indexOf(id) < 0) return;
    save.current = id; store();
    $('mapView').hidden = true;
    $('fieldView').hidden = false;
    $('regionLabel').textContent = r.emoji + ' ' + r.name;
    var sc = A.buildScene(r);
    $('scene').innerHTML = sc.svg; // art.js가 만든 배경(사용자 글 없음)
    $('birds').textContent = '';
    field = { region: r, scene: sc, birds: [], perchUsed: {}, spawnT: 0, last: 0, running: true, refreshAt: 0 };
    spawn(); spawn();
    hud();
    requestAnimationFrame(loop);
    window.scrollTo(0, 0);
  }

  function leaveField() {
    if (!field) return;
    field.running = false;
    field.birds.forEach(function (o) { o.el.remove(); });
    field = null;
  }

  // 새 크기(무대 폭의 %). 휴대폰처럼 무대가 좁으면 최대 1.5배까지 키워 누르기 쉽게 한다(쌍안경으로 넓힌 폭은 빼고 셈).
  function sizePct(b) {
    var w = $('viewport').clientWidth || 600;
    var boost = Math.max(1, Math.min(1.5, 640 / w));
    return Math.min(22, (7 + Math.sqrt(b.size || 20) * 0.7) * boost);
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pickArea(list) { return list.length ? list[Math.floor(Math.random() * list.length)] : null; }

  // 어디에 어떤 자세로 나타날지 고른다.
  function placeBird(b) {
    var where = D.SHAPES[b.shape], sc = field.scene, roll = Math.random();
    if (b.shape === 'raptor' && roll < 0.55) return { pose: 'soar' };
    if (where === 'perch' && roll < 0.75) {
      var free = [];
      sc.perches.forEach(function (p, i) { if (!field.perchUsed[i]) free.push(i); });
      if (free.length) {
        var i = free[Math.floor(Math.random() * free.length)];
        return { pose: 'perch', x: sc.perches[i].x, y: sc.perches[i].y, perch: i };
      }
    }
    if (where === 'water' && roll < 0.75) {
      var a = pickArea(sc.areas.water);
      if (a) return { pose: 'swim', x: rnd(a.x0, a.x1), y: rnd(a.y0, a.y1), area: a };
    }
    if (where === 'shore' && roll < 0.75) {
      var s = pickArea(sc.areas.shore);
      if (s) return { pose: 'stand', x: rnd(s.x0, s.x1), y: rnd(s.y0, s.y1), area: s };
    }
    if (where === 'ground' && roll < 0.85) {
      var g = pickArea(sc.areas.ground);
      if (g) return { pose: 'perch', x: rnd(g.x0, g.x1), y: rnd(g.y0, g.y1), area: g };
    }
    return { pose: 'fly' };
  }

  function makeEl(o) {
    var btn = el('button', 'bw-bird');
    btn.type = 'button';
    btn.setAttribute('aria-label', '새');
    var art = el('div', 'bw-art');
    btn.appendChild(art);
    o.el = btn; o.art = art;
    setArt(o, o.pose);
    btn.style.width = sizePct(o.b) + '%';
    btn.style.zIndex = String(Math.round(40 - sizePct(o.b)) + (o.pose === 'fly' || o.pose === 'soar' ? 20 : 0));
    btn.addEventListener('click', function (e) { e.preventDefault(); catchBird(o); });
    $('birds').appendChild(btn);
  }
  function setArt(o, pose) {
    var drawPose = pose === 'soar' || pose === 'leave' ? 'fly' : pose;
    var a = A.bird(o.b, drawPose, false);
    o.art.innerHTML = a.svg; // data.js 값으로만 만든 SVG
    o.foot = a.foot;
    o.el.classList.toggle('flying', drawPose === 'fly');
    o.el.classList.toggle('soaring', pose === 'soar');
  }
  function position(o) {
    o.el.style.left = (o.x / A.W * 100) + '%';
    o.el.style.top = (o.y / A.H * 100) + '%';
    o.el.style.transform = 'translate(-50%,' + (-o.foot * 100) + '%)';
    o.art.style.transform = 'scaleX(' + o.dir + ')';
  }

  function spawn() {
    if (!field) return;
    var b = R.pickBird(field.region.id, Math.random);
    var pl = placeBird(b);
    var o = { b: b, pose: pl.pose, t: 0, dir: Math.random() < 0.5 ? 1 : -1, perch: pl.perch, area: pl.area,
      stay: R.stayTime(b.rarity, save.scope), phase: Math.random() * 6.28 };
    if (pl.pose === 'fly') {
      var speed = (A.W + 240) / R.crossTime(b.rarity, save.scope);
      o.vx = speed * o.dir;
      o.x = o.dir > 0 ? -120 : A.W + 120;
      o.y = rnd(70, 330); o.y0 = o.y;
    } else if (pl.pose === 'soar') {
      o.cx = rnd(250, 750); o.cy = rnd(120, 260); o.rad = rnd(70, 130);
      o.w = (Math.random() < 0.5 ? 1 : -1) * rnd(0.5, 0.8) / (1 + 0.25 * save.scope);
      o.x = o.cx; o.y = o.cy;
    } else {
      o.x = pl.x; o.y = pl.y; o.x0 = pl.x; o.y0 = pl.y;
      if (pl.perch != null) field.perchUsed[pl.perch] = true;
      if (pl.pose === 'swim') o.vx = rnd(6, 14) * o.dir;
    }
    makeEl(o);
    o.el.classList.add('arrive');
    position(o);
    field.birds.push(o);
    if (Math.random() < 0.6) sound.chirp(b.size || 20);
  }

  function removeBird(o) {
    if (o.perch != null && field) delete field.perchUsed[o.perch];
    o.el.remove();
    if (field) field.birds.splice(field.birds.indexOf(o), 1);
  }

  // 머무는 시간이 끝나면 날아가 버린다(그때는 못 누름).
  function flyAway(o) {
    if (o.pose === 'leave') return;
    if (o.perch != null && field) { delete field.perchUsed[o.perch]; o.perch = null; }
    o.pose = 'leave';
    o.el.classList.add('gone');
    o.el.disabled = true;
    o.vx = (o.dir || 1) * rnd(260, 360);
    o.vy = -rnd(160, 240);
    setArt(o, 'leave');
  }

  function step(o, dt) {
    o.t += dt;
    var bob = reduceMotion ? 0 : 1;
    switch (o.pose) {
      case 'fly':
        o.x += o.vx * dt;
        o.y = o.y0 + Math.sin(o.t * 3 + o.phase) * 10 * bob;
        if (o.x < -160 || o.x > A.W + 160) return false;
        break;
      case 'soar':
        var ang = o.phase + o.t * o.w;
        o.x = o.cx + Math.cos(ang) * o.rad;
        o.y = o.cy + Math.sin(ang) * o.rad * 0.4;
        o.dir = Math.sin(ang) * o.w > 0 ? -1 : 1;
        if (o.t > o.stay) flyAway(o);
        break;
      case 'swim':
        o.x += o.vx * dt;
        if (o.x < o.area.x0 || o.x > o.area.x1) { o.vx = -o.vx; o.dir = -o.dir; o.x = Math.max(o.area.x0, Math.min(o.area.x1, o.x)); }
        o.y = o.y0 + Math.sin(o.t * 1.5 + o.phase) * 1.5 * bob;
        if (o.t > o.stay) flyAway(o);
        break;
      case 'leave':
        o.x += o.vx * dt; o.y += o.vy * dt;
        if (o.y < -120 || o.x < -160 || o.x > A.W + 160) return false;
        break;
      default: // perch·stand: 가끔 고개를 돌림(방향 바꿈)
        if (Math.sin(o.t * 0.9 + o.phase) > 0.995) o.dir = -o.dir;
        o.y = o.y0 - Math.max(0, Math.sin(o.t * 5 + o.phase) - 0.92) * 40 * bob;
        if (o.t > o.stay) flyAway(o);
    }
    position(o);
    return true;
  }

  function busy() { return !$('modal').hidden || !$('card').hidden || document.hidden; }

  function loop(ts) {
    if (!field || !field.running) return;
    var dt = field.last ? Math.min(0.05, (ts - field.last) / 1000) : 0;
    field.last = ts;
    if (!busy()) {
      field.birds.slice().forEach(function (o) {
        if (!step(o, dt)) {
          if (o.pose === 'fly' && !o.caught) missed(o);
          removeBird(o);
        }
      });
      field.spawnT += dt;
      var active = field.birds.filter(function (o) { return o.pose !== 'leave'; }).length;
      if (field.spawnT >= R.spawnGap(save.feed)) {
        field.spawnT = 0;
        if (active < R.maxBirds(save.feed)) spawn();
      }
    }
    requestAnimationFrame(loop);
  }

  function missed(o) {
    if (!save.dex[o.b.id] && o.b.rarity !== 'common') toast('앗, 처음 보는 새가 날아가 버렸어요!');
  }

  // ----- 새를 눌렀을 때 -----
  function catchBird(o) {
    if (!field || o.pose === 'leave' || o.caught || busy()) return;
    o.caught = true;
    var res = R.recordSighting(save, o.b.id, field.region.id, Date.now());
    store();
    pop(o, '+' + res.points);
    removeBird(o);
    hud();
    if (res.isNew) {
      sound.found();
      showCard(o.b, true, res.points);
    } else {
      sound.coin();
      toast(o.b.name + ' 또 만났어요! +' + res.points + ' (' + save.dex[o.b.id].count + '번째)');
    }
    missionToasts(res.missions);
  }
  function pop(o, text) {
    var p = el('div', 'pop', text);
    p.style.left = (o.x / A.W * 100) + '%';
    p.style.top = (o.y / A.H * 100) + '%';
    $('birds').appendChild(p);
    setTimeout(function () { p.remove(); }, 900);
  }

  // ----- 새 정보 카드 -----
  function showCard(b, isNew, points) {
    var c = $('cardBody');
    c.textContent = '';
    if (isNew) c.appendChild(el('div', 'card-new', '🎉 새 발견! +' + points + ' 포인트'));
    var pic = artFor(b, false);
    pic.classList.add('big');
    c.appendChild(pic);
    c.appendChild(el('h2', 'card-name', b.name));
    c.appendChild(el('p', 'card-sci', b.sci));
    var tags = el('div', 'tags');
    var rar = D.RARITIES[b.rarity];
    var rt = el('span', 'tag', rar.name);
    rt.style.background = rar.color;
    rt.style.color = '#fff';
    tags.appendChild(rt);
    tags.appendChild(el('span', 'tag', b.season));
    if (b.monument) tags.appendChild(el('span', 'tag mon', '천연기념물'));
    if (b.endangered) tags.appendChild(el('span', 'tag end', endangeredText(b.endangered)));
    c.appendChild(tags);
    var dl = el('dl', 'facts');
    function row(k, v) { if (!v) return; dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, v)); }
    row('크기', b.size ? '몸길이 약 ' + b.size + 'cm' : '');
    row('사는 곳', b.habitat);
    var me = save.dex[b.id];
    if (me) {
      row('처음 본 곳', (D.region(me.where) || {}).name || '');
      row('처음 본 때', dateText(me.first));
      row('본 횟수', me.count + '번');
    }
    c.appendChild(dl);
    c.appendChild(el('p', 'card-fact', '💡 ' + b.fact));
    $('card').hidden = false;
    $('cardClose').focus();
  }

  // ----- 창(도감·기록장·상점·미션) -----
  function openModal(title) {
    $('modalTitle').textContent = title;
    $('modalBody').textContent = '';
    $('modal').hidden = false;
    $('modalClose').focus();
    return $('modalBody');
  }

  var dexFilter = 'all';
  function showDex() {
    var body = openModal('📖 새 도감');
    var st = R.stats(save);
    body.appendChild(el('p', 'modal-sub', '찾은 새 ' + st.species + '종 / 전체 ' + st.total + '종'));
    var tabs = el('div', 'tabs');
    [['all', '전체'], ['here', field ? '이 지역' : '지금 지역']].forEach(function (t) {
      var b = el('button', dexFilter === t[0] ? 'on' : '', t[1]);
      b.type = 'button';
      b.addEventListener('click', function () { dexFilter = t[0]; showDex(); });
      tabs.appendChild(b);
    });
    body.appendChild(tabs);
    var reg = D.region(save.current);
    var list = dexFilter === 'here' && reg ? reg.birds.map(D.bird) : D.BIRDS;
    var grid = el('div', 'dex');
    list.forEach(function (b) {
      var seen = !!save.dex[b.id];
      var cell = el('button', 'dex-cell' + (seen ? '' : ' unseen'));
      cell.type = 'button';
      cell.appendChild(artFor(b, !seen));
      cell.appendChild(el('b', null, seen ? b.name : '???'));
      var rar = D.RARITIES[b.rarity];
      var dot = el('small', null, rar.name + (seen ? ' · ' + save.dex[b.id].count + '번' : ''));
      dot.style.color = rar.color;
      cell.appendChild(dot);
      if (seen) cell.addEventListener('click', function () { showCard(b, false); });
      else cell.disabled = true;
      grid.appendChild(cell);
    });
    body.appendChild(grid);
  }

  function showLog() {
    var body = openModal('📝 탐조 기록장');
    if (!save.log.length) { body.appendChild(el('p', 'modal-sub', '아직 기록이 없어요. 새를 찾아 눌러 보세요!')); return; }
    body.appendChild(el('p', 'modal-sub', '모두 ' + fmt(save.sightings) + '번 관찰했어요 (최근 ' + save.log.length + '개)'));
    var ul = el('ul', 'log');
    save.log.slice().reverse().forEach(function (e) {
      var li = el('li', e.isNew ? 'new' : '');
      li.appendChild(el('span', 'log-time', dateText(e.t)));
      li.appendChild(el('span', 'log-where', D.region(e.region).name));
      li.appendChild(el('b', null, D.bird(e.bird).name + (e.isNew ? ' 🎉 첫 발견' : '')));
      ul.appendChild(li);
    });
    body.appendChild(ul);
  }

  function showShop() {
    var body = openModal('🛒 상점');
    body.appendChild(el('p', 'modal-sub', '내 포인트 🪙 ' + fmt(save.points)));
    function item(icon, name, desc, level, kind) {
      var row = el('div', 'shop-row');
      row.appendChild(el('div', 'shop-icon', icon));
      var mid = el('div', 'shop-mid');
      mid.appendChild(el('b', null, name + ' ' + level + '/' + R.MAX_LEVEL + '단계'));
      mid.appendChild(el('small', null, desc));
      row.appendChild(mid);
      var cost = R.upgradeCost(kind, level);
      var btn = el('button', 'buy', cost == null ? '최고 단계' : '🪙 ' + fmt(cost));
      btn.type = 'button';
      btn.disabled = cost == null || save.points < cost;
      btn.addEventListener('click', function () {
        var res = R.buyUpgrade(save, kind);
        if (res.ok) { store(); sound.coin(); toast(name + ' ' + save[kind] + '단계가 됐어요!'); missionToasts(res.missions); }
        hud(); showShop();
      });
      row.appendChild(btn);
      body.appendChild(row);
    }
    item('🔭', '망원경', '새가 더 오래 머물고, 하늘을 천천히 날아요.', save.scope, 'scope');
    item('🌰', '새 모이', '새가 더 많이, 더 자주 나타나요.', save.feed, 'feed');
    body.appendChild(el('h3', 'shop-h', '🗺️ 탐조 지역 열기'));
    D.REGIONS.forEach(function (r) {
      var open = save.regions.indexOf(r.id) >= 0;
      var row = el('div', 'shop-row');
      row.appendChild(el('div', 'shop-icon', r.emoji));
      var mid = el('div', 'shop-mid');
      mid.appendChild(el('b', null, r.name));
      mid.appendChild(el('small', null, r.place));
      row.appendChild(mid);
      var btn = el('button', 'buy', open ? '열림 ✅' : '🪙 ' + fmt(r.cost));
      btn.type = 'button';
      btn.disabled = open || save.points < r.cost;
      btn.addEventListener('click', function () { tryUnlock(r.id); showShop(); });
      row.appendChild(btn);
      body.appendChild(row);
    });
  }

  function showMissions() {
    var body = openModal('🎯 미션');
    var cur = R.currentMission(save);
    var ol = el('ol', 'missions');
    R.MISSIONS.forEach(function (m, i) {
      var state = i < save.mission ? 'done' : i === save.mission ? 'now' : 'later';
      var li = el('li', state);
      li.appendChild(el('span', 'm-mark', state === 'done' ? '✅' : state === 'now' ? '▶' : '🔒'));
      li.appendChild(el('span', 'm-title', state === 'later' ? '???' : m.title));
      var right = state === 'now' ? cur.value + '/' + m.goal : state === 'done' ? '완료' : '';
      li.appendChild(el('span', 'm-right', right + ' · 🪙' + m.reward));
      ol.appendChild(li);
    });
    body.appendChild(ol);
  }

  // ----- 단추들 -----
  function refreshBirds() {
    if (!field) return;
    var now = performance.now();
    if (now < field.refreshAt) { toast('조금 뒤에 다시 찾을 수 있어요.'); return; }
    field.refreshAt = now + 6000;
    field.birds.slice().forEach(function (o) { if (o.pose !== 'leave') flyAway(o); });
    setTimeout(function () { if (field) { spawn(); spawn(); spawn(); } }, 500);
    toast('🔄 새로운 새들을 기다려요…');
  }

  function toggleZoom() {
    var v = $('viewport'), on = !v.classList.contains('zoomed');
    v.classList.toggle('zoomed', on);
    $('zoomBtn').setAttribute('aria-pressed', String(on));
    $('zoomBtn').textContent = on ? '🔭 원래대로' : '🔭 쌍안경';
    if (on) { v.scrollLeft = (v.scrollWidth - v.clientWidth) / 2; v.scrollTop = (v.scrollHeight - v.clientHeight) / 2; }
  }

  $('soundBtn').addEventListener('click', function () { muted = !muted; set(SOUND_KEY, muted ? 'off' : 'on'); soundButton(); if (!muted) sound.coin(); });
  $('mapBtn').addEventListener('click', showMap);
  $('dexBtn').addEventListener('click', showDex);
  $('mapDexBtn').addEventListener('click', showDex);
  $('logBtn').addEventListener('click', showLog);
  $('mapLogBtn').addEventListener('click', showLog);
  $('shopBtn').addEventListener('click', showShop);
  $('mapShopBtn').addEventListener('click', showShop);
  $('refreshBtn').addEventListener('click', refreshBirds);
  $('zoomBtn').addEventListener('click', toggleZoom);
  $('missionBox').addEventListener('click', showMissions);
  $('mapMissionBtn').addEventListener('click', showMissions);
  $('modalClose').addEventListener('click', function () { $('modal').hidden = true; if (!$('mapView').hidden) showMap(); });
  $('cardClose').addEventListener('click', function () { $('card').hidden = true; });
  [$('modal'), $('card')].forEach(function (m) {
    m.addEventListener('click', function (e) { if (e.target === m) m.querySelector('.close').click(); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!$('card').hidden) $('cardClose').click();
    else if (!$('modal').hidden) $('modalClose').click();
  });
  window.addEventListener('pagehide', store);

  soundButton();
  showMap();
  // 자동 확인용 통로(콘솔에서 상태 보기)
  BW.debug = { get save() { return save; }, get field() { return field; }, spawn: spawn };
})();
