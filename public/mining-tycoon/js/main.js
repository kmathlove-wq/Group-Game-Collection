// ===== main.js =====
// 전체를 묶는다: 입력(키보드·터치) → Game.update → 사건(events)을 소리·글자·순위로 → 그리기.
// 상단 막대·가게 창·시작/멈춤/확인/엔딩 창도 여기서 다룬다. 사용자 글자는 모두 textContent로 넣는다.
(function (MT) {
  var Rules = MT.Rules, Game = MT.Game, Save = MT.Save, fmt = MT.format;
  var $ = function (id) { return document.getElementById(id); };

  var canvas = $('mtCanvas');
  var renderer = new MT.Renderer(canvas);
  var sound = new MT.Sound();
  var ranking = new MT.Ranking();

  var state = null; // 지금 게임(시작 창에서는 null)
  var input = { left: false, right: false, up: false, down: false };
  var touchKeys = {}; // 터치 버튼이 누르고 있는 방향
  var modal = null; // 지금 열린 창(있으면 게임 멈춤)
  var panelKey = null; // 열린 가게 창
  var lastTime = 0;
  var saveTimer = 0;
  var digSoundTimer = 0;
  var lastBlocked = 0;
  var toastTimer = null;
  var confirmAction = null;

  // ---------- 창 열고 닫기 ----------
  function openModal(id) {
    if (modal && modal !== id) $(modal).classList.add('hidden');
    modal = id;
    $(id).classList.remove('hidden');
    releaseKeys();
  }
  function closeModal(id) {
    $(id).classList.add('hidden');
    if (modal === id) modal = null;
    lastTime = performance.now();
  }
  function releaseKeys() {
    input.left = input.right = input.up = input.down = false;
    touchKeys = {};
  }

  function toast(text, ms) {
    var el = $('mtToast');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.add('hidden'); }, ms || 2600);
  }

  function askConfirm(title, text, onYes) {
    $('mtConfirmTitle').textContent = title;
    $('mtConfirmText').textContent = text;
    confirmAction = onYes;
    openModal('mtConfirmModal');
    $('mtConfirmYes').focus();
  }
  $('mtConfirmYes').addEventListener('click', function () {
    var action = confirmAction;
    confirmAction = null;
    closeModal('mtConfirmModal');
    if (action) action();
  });
  $('mtConfirmNo').addEventListener('click', function () { confirmAction = null; closeModal('mtConfirmModal'); });

  // ---------- 시작 ----------
  function newPlayerId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function showStart(broken) {
    var saved = broken ? null : Save.load();
    if (saved && saved.broken) { broken = true; saved = null; Save.clear(); }
    if (saved && saved.state.destroyedTime != null) { saved = null; Save.clear(); } // 지구가 부서진 판은 끝
    $('mtBrokenNotice').classList.toggle('hidden', !broken);
    var destroyed = Save.destroyedCount();
    $('mtDestroyedBadge').classList.toggle('hidden', !destroyed);
    $('mtDestroyedBadge').textContent = '🌍 지구를 부순 횟수: ' + destroyed + '번';
    $('mtNameInput').value = Save.getName();
    if (saved) {
      var s = saved.state;
      $('mtSaveInfo').textContent = s.name + ' · 번 돈 ' + fmt.money(s.earned) + ' · 가장 깊이 ' + s.maxDepth + 'm · ' + fmt.time(s.time);
      $('mtContinueBox').classList.remove('hidden');
      $('mtNewButton').textContent = '처음부터 새로 시작';
      $('mtContinueButton').onclick = function () { begin(s); };
    } else {
      $('mtContinueBox').classList.add('hidden');
      $('mtNewButton').textContent = '새로 시작';
    }
    openModal('mtStartModal');
  }

  function startNew() {
    var name = $('mtNameInput').value.trim().slice(0, 20) || '이름없음';
    Save.setName(name);
    ranking.reset();
    begin(Game.newGame({ name: name, playerId: newPlayerId() }));
  }

  $('mtNewButton').addEventListener('click', function () {
    if (!$('mtContinueBox').classList.contains('hidden')) {
      askConfirm('처음부터 새로 시작할까요?', '저장된 게임(땅·돈·업그레이드)이 모두 사라져요.', function () {
        askConfirm('정말 지울까요?', '되돌릴 수 없어요. 순위표의 기록은 그대로 남아요.', function () { Save.clear(); startNew(); });
      });
      return;
    }
    startNew();
  });
  $('mtNameInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('mtNewButton').click(); });

  function begin(s) {
    state = s;
    sound.unlock();
    closeModal('mtStartModal');
    panelKey = null;
    $('mtPanel').classList.add('hidden');
    renderer.cam = null;
    saveNow();
    if (state.treasureTime == null) toast('⛏️ 오른쪽 광산으로 가서 ↓ 를 눌러 파 보세요!', 4000);
  }

  function saveNow() { if (state && state.destroyedTime == null) Save.save(state); saveTimer = 0; } // 지구가 부서진 판은 다시 저장하지 않는다

  // ---------- 상단 막대 ----------
  var hudCache = {};
  function setText(id, text) { if (hudCache[id] !== text) { hudCache[id] = text; $(id).textContent = text; } }
  function updateHud() {
    if (!state) return;
    var fuelCap = Game.fuelCap(state), hpCap = Game.hpCap(state);
    var fuelRatio = state.fuel / fuelCap;
    $('mtFuelBar').style.width = (fuelRatio * 100).toFixed(1) + '%';
    $('mtFuelBar').classList.toggle('low', fuelRatio < Rules.LOW_FUEL);
    $('mtHpBar').style.width = (state.hp / hpCap * 100).toFixed(1) + '%';
    setText('mtFuelText', Math.ceil(state.fuel) + '/' + fuelCap);
    setText('mtHpText', Math.ceil(state.hp) + '/' + hpCap);
    var count = Game.bagCount(state), cap = Game.bagCap(state);
    setText('mtBagText', count + '/' + cap);
    $('mtBagText').classList.toggle('full', count >= cap);
    setText('mtMoneyText', fmt.money(state.money));
    $('mtDebt').classList.toggle('hidden', state.debt <= 0);
    setText('mtDebtText', '빚 ' + fmt.money(state.debt));
    var depth = Game.depthOf(state);
    setText('mtDepthText', state.inCore ? '⭐ 지구 중심' : depth + 'm' + (depth ? ' ' + Rules.LAYERS[Rules.layerOf(depth)].name : ''));
    $('mtDepthText').classList.toggle('hot', Game.heatDps(state) > 0);
    setText('mtTimeText', fmt.time(state.time));
    var size = Rules.UPGRADES.range.values[state.levels.range];
    setText('mtWideText', state.wide && state.levels.range > 0 ? size[0] + '×' + size[1] : '1칸');
    setText('mtRecallText', String(state.recall));
    setText('mtInstantText', String(state.instant));
    var showAuto = Game.unlocked(state) && (state.autos.length > 0 || state.autoEarned > 0);
    $('mtAuto').classList.toggle('hidden', !showAuto);
    setText('mtAutoText', state.autos.length + '대 · +' + fmt.money(state.autoEarned));
  }

  // ---------- 가게 창 ----------
  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function button(text, cls, onClick, disabled) {
    var b = el('button', cls, text);
    b.type = 'button';
    b.disabled = !!disabled;
    b.addEventListener('click', onClick);
    return b;
  }

  function openPanel(key) {
    panelKey = key;
    renderPanel();
    $('mtPanel').classList.remove('hidden');
  }
  function closePanel() {
    panelKey = null;
    $('mtPanel').classList.add('hidden');
    canvas.focus();
  }
  $('mtPanelClose').addEventListener('click', closePanel);

  function renderPanel() {
    if (!panelKey || !state) return;
    var b = Rules.BUILDINGS.filter(function (item) { return item.key === panelKey; })[0];
    $('mtPanelTitle').textContent = b.icon + ' ' + b.name;
    var body = $('mtPanelBody');
    body.textContent = '';
    if (panelKey === 'sell') renderSell(body);
    else if (panelKey === 'fuel') renderFill(body, 'fuel');
    else if (panelKey === 'repair') renderFill(body, 'repair');
    else renderShop(body);
  }

  function renderSell(body) {
    var count = Game.bagCount(state);
    if (!count) { body.append(el('p', 'mt-muted', '가방이 비어 있어요. 광산에서 광석을 캐 오세요!')); return; }
    var list = el('ul', 'mt-ore-list');
    for (var i = 1; i < state.bag.length; i++) {
      if (!state.bag[i]) continue;
      var ore = Rules.ORES[i];
      var li = el('li');
      var dot = el('i', 'mt-ore-dot'); dot.style.background = ore.color;
      li.append(dot, el('span', null, ore.name + ' × ' + state.bag[i]), el('b', null, fmt.money(ore.value * state.bag[i])));
      list.append(li);
    }
    body.append(list);
    if (state.debt > 0) body.append(el('p', 'mt-warn', '💳 빚 ' + fmt.money(state.debt) + '은 판 돈에서 먼저 갚아요.'));
    body.append(button('모두 팔기 (' + fmt.money(Game.bagValue(state)) + ')', 'mt-primary mt-wide', function () {
      var result = Game.sell(state);
      sound.sell();
      renderer.floatText('+' + fmt.money(result.total), state.car.x, state.car.y - 1, '#ffe066');
      toast('💰 광석 ' + result.count + '개를 ' + fmt.money(result.total) + '에 팔았어요!' + (result.debtPaid ? ' (빚 ' + fmt.money(result.debtPaid) + ' 갚음)' : ''));
      ranking.queueMoney(state);
      saveNow();
      renderPanel();
    }));
  }

  function renderFill(body, kind) {
    var isFuel = kind === 'fuel';
    var now = isFuel ? state.fuel : state.hp;
    var cap = isFuel ? Game.fuelCap(state) : Game.hpCap(state);
    var cost = isFuel ? Game.refuelCost(state) : Game.repairCost(state);
    body.append(el('p', null, (isFuel ? '⛽ 연료 ' : '❤️ 체력 ') + Math.ceil(now) + ' / ' + cap));
    body.append(el('p', 'mt-muted', (isFuel ? '연료 1만큼 ' + Rules.FUEL_PRICE : '체력 1만큼 ' + Rules.REPAIR_PRICE) + '원이에요. 돈이 모자라면 가진 돈만큼만 채워요.'));
    var full = cost <= 0;
    body.append(button(full ? '가득 차 있어요' : (isFuel ? '가득 채우기' : '모두 고치기') + ' (' + fmt.money(cost) + ')', 'mt-primary mt-wide', function () {
      var result = isFuel ? Game.refuel(state) : Game.repair(state);
      if (result.reason === 'money') { toast('💸 돈이 없어요. 판매소에서 광석을 먼저 팔아요.'); sound.blocked(); return; }
      sound.fill();
      if (result.partial) toast('돈이 모자라서 ' + fmt.money(result.cost) + '만큼만 ' + (isFuel ? '채웠어요.' : '고쳤어요.'));
      saveNow();
      renderPanel();
    }, full));
  }

  function shopRow(body, title, desc, label, onClick, disabled, extraClass) {
    var row = el('div', 'mt-shop-row' + (extraClass ? ' ' + extraClass : ''));
    var info = el('div', 'mt-shop-info');
    info.append(el('b', null, title), el('small', null, desc));
    row.append(info, button(label, 'mt-buy', onClick, disabled));
    body.append(row);
  }

  function renderShop(body) {
    if (state.debt > 0) body.append(el('p', 'mt-warn', '💳 빚(' + fmt.money(state.debt) + ')이 있어서 지금은 살 수 없어요. 광석을 팔면 자동으로 갚아요.'));
    var open = Game.unlocked(state);
    body.append(el('h3', 'mt-shop-head', '⬆️ 업그레이드'));
    Rules.UPGRADE_ORDER.forEach(function (key) {
      var up = Rules.UPGRADES[key];
      var level = state.levels[key];
      var info = Game.upgradeInfo(state, key);
      var title = up.icon + ' ' + up.name + ' ' + (key === 'autoHeat' ? (level ? '✅' : '') : (level + 1) + '/' + up.values.length + '단계');
      if (info.locked) {
        shopRow(body, title, '🔒 보물을 찾으면 열려요 · ' + up.desc, '🔒', function () {}, true, 'mt-locked');
        return;
      }
      var desc = up.desc + ' · ' + describe(key, level) + (info.price != null ? ' → ' + describe(key, level + 1) : '');
      shopRow(body, title, desc, info.price == null ? '최고 단계' : fmt.money(info.price), function () { buy(key); }, info.price == null || state.debt > 0 || state.money < info.price);
    });

    body.append(el('h3', 'mt-shop-head', '🎒 아이템'));
    shopRow(body, '🌀 귀환석 (가진 것 ' + state.recall + '개)', '땅속에서 R을 누르면 바로 지상으로 순간이동해요', fmt.money(Rules.RECALL_PRICE), function () {
      buyItem(Game.buyRecall(state));
    }, state.debt > 0 || state.money < Rules.RECALL_PRICE);
    shopRow(body, '💸 즉시 팔기 (' + state.instant + '/' + Rules.INSTANT_MAX + '개)', '땅속에서 F(휴대폰 💸)를 누르면 가방 속 광석이 바로 돈이 돼요. 한 번 쓰면 없어져요', fmt.money(Rules.INSTANT_PRICE), function () {
      buyItem(Game.buyInstant(state));
    }, state.debt > 0 || state.money < Rules.INSTANT_PRICE || state.instant >= Rules.INSTANT_MAX);
    if (!open) {
      shopRow(body, '🤖 자동 드릴', '🔒 보물을 찾으면 열려요 · 혼자 땅을 파서 광석을 바로 돈으로 바꿔 줘요', '🔒', function () {}, true, 'mt-locked');
    } else {
      shopRow(body, '🤖 자동 드릴 (' + state.autos.length + '/' + Rules.AUTO_MAX + '대)', '혼자 땅을 파서 광석을 바로 돈으로 바꿔요 · ' + Rules.UPGRADES.autoLife.values[state.levels.autoLife] + '초 동안 일해요' + (state.levels.autoHeat ? '' : ' · 지각(300m) 밑으로는 못 가요'), fmt.money(Rules.AUTO_PRICE), function () {
        buyItem(Game.buyAuto(state), '🤖 자동 드릴이 광산으로 출발했어요!');
      }, state.debt > 0 || state.money < Rules.AUTO_PRICE || state.autos.length >= Rules.AUTO_MAX);
      // 🎫 입장권: 엔딩 전에는 아예 안 보인다(비밀). 엔딩 뒤에도 열보호 끝 단계 전에는 살 수 없다.
      var block = Game.ticketBlock(state);
      if (state.ticket > 0) {
        shopRow(body, '🎫 지구 핵 입장권 (가지고 있어요)', '쓰면 바로 지구의 중심으로 가요. 한 번 나가면 다시 사야 해요', '지금 가기', function () {
          if (Game.useTicket(state).ok) { closePanel(); sound.recall(); renderer.cam = null; toast('⭐ 지구의 중심에 왔어요… 저 빨간 버튼은 뭘까요?', 4000); saveNow(); }
        }, false);
      } else {
        shopRow(body, '🎫 지구 핵 입장권', block === 'heat' ? '🔥 열보호 5단계가 있어야 살 수 있어요 · 지구의 중심으로 가는 표예요' : '지구의 중심으로 바로 가는 표예요', fmt.money(Rules.TICKET_PRICE), function () {
          buyItem(Game.buyTicket(state), '🎫 입장권을 샀어요! "지금 가기"를 누르면 지구의 중심으로 가요.');
        }, !!block || state.debt > 0 || state.money < Rules.TICKET_PRICE);
      }
    }
    body.append(button('🔄 처음부터 다시', 'mt-reset', function () {
      askConfirm('처음부터 다시 할까요?', '땅·돈·업그레이드가 모두 사라지고 새 땅에서 시작해요.', function () {
        askConfirm('정말 지울까요?', '되돌릴 수 없어요. 순위표의 기록은 그대로 남아요.', function () {
          Save.clear(); state = null; closePanel(); showStart(false);
        });
      });
    }));
  }

  function buyItem(result, message) {
    if (!result.ok) { failBuy(result.reason); return; }
    sound.buy();
    if (message) toast(message);
    saveNow();
    renderPanel();
  }

  function describe(key, level) {
    var v = Rules.UPGRADES[key].values[level];
    if (key === 'drill') return '속도 ×' + v + (level >= Rules.ROCK_DRILL_LEVEL ? ' · 바위 OK' : '');
    if (key === 'fuel') return '연료 ' + v;
    if (key === 'minigas') return '1초에 +' + v;
    if (key === 'bag') return v + '칸';
    if (key === 'hull') return '체력 ' + v;
    if (key === 'engine') return '날기 ' + v;
    if (key === 'heat') return '열 피해 ' + Math.round(v * 100) + '%';
    if (key === 'autoLife') return v + '초';
    if (key === 'autoHeat') return v ? '지각 밑까지' : '지각까지';
    return v[0] + '×' + v[1];
  }

  function failBuy(reason) {
    sound.blocked();
    toast({
      debt: '💳 빚을 먼저 갚아야 살 수 있어요.',
      money: '💸 돈이 모자라요.',
      locked: '🔒 보물을 찾으면 열려요.',
      full: '이미 가득 가지고 있어요.',
      heat: '🔥 열보호 5단계가 있어야 살 수 있어요.',
      have: '🎫 이미 입장권을 가지고 있어요.'
    }[reason] || '이미 최고 단계예요.');
  }

  function buy(key) {
    var result = Game.buyUpgrade(state, key);
    if (!result.ok) { failBuy(result.reason); return; }
    sound.buy();
    var up = Rules.UPGRADES[key];
    toast(up.icon + ' ' + up.name + (key === 'autoHeat' ? '를 달았어요!' : ' ' + (result.level + 1) + '단계가 됐어요!'));
    if (key === 'range' && result.level === 1) toast('💥 넓게 파기! Q(휴대폰은 💥)로 1칸 파기와 바꿀 수 있어요.', 3500);
    saveNow();
    renderPanel();
  }

  // ---------- 귀환석·넓게 파기·즉시 팔기 ----------
  function askRecall() {
    if (!state || modal) return;
    if (!Game.isUnderground(state)) { toast('🌀 귀환석은 땅속에서만 쓸 수 있어요.'); return; }
    if (state.recall <= 0) { toast('🌀 귀환석이 없어요. 상점에서 살 수 있어요.'); return; }
    askConfirm('🌀 귀환석을 쓸까요?', '바로 지상으로 순간이동해요. (남은 귀환석 ' + state.recall + '개)', function () {
      if (Game.useRecall(state).ok) { sound.recall(); renderer.cam = null; toast('🌀 지상으로 돌아왔어요!'); saveNow(); }
    });
  }
  function toggleWide() {
    if (!state || modal) return;
    if (state.levels.range === 0) { toast('💥 상점에서 "파는 범위"를 사면 넓게 팔 수 있어요.'); return; }
    state.wide = !state.wide;
    toast(state.wide ? '💥 넓게 파기 켜짐' : '⛏️ 1칸만 파기');
  }
  function instantSell() {
    if (!state || modal) return;
    if (!Game.isUnderground(state)) { toast('💸 즉시 팔기는 땅속에서 써요. 지상에서는 판매소에서 팔아요!'); return; }
    var result = Game.useInstant(state);
    if (!result.ok) { sound.blocked(); toast(result.reason === 'empty' ? '🎒 가방이 비어 있어요.' : '💸 즉시 팔기가 없어요. 상점에서 살 수 있어요.'); return; }
    sound.sell();
    renderer.floatText('+' + fmt.money(result.total), state.car.x, state.car.y - 1, '#ffe066');
    toast('💸 즉시 팔기! 광석 ' + result.count + '개를 ' + fmt.money(result.total) + '에 팔았어요. (남은 즉시 팔기 ' + state.instant + '개)' + (result.debtPaid ? ' 빚 ' + fmt.money(result.debtPaid) + ' 갚음' : ''));
    ranking.queueMoney(state);
    saveNow();
  }

  // ---------- 사건 처리 ----------
  var HARD_TILE = [0, Rules.TILE.DIRT, Rules.TILE.STONE, Rules.TILE.ROCK, Rules.TILE.MANTLE, Rules.TILE.OUTER, Rules.TILE.INNER];
  function oreNames(ores) {
    var counts = {};
    ores.forEach(function (o) { counts[o] = (counts[o] || 0) + 1; });
    return Object.keys(counts).map(function (o) { return '+' + Rules.ORES[o].name + (counts[o] > 1 ? '×' + counts[o] : ''); }).join(' ');
  }
  var lastHeatToast = 0;

  function handle(events) {
    var now = performance.now();
    events.forEach(function (e) {
      switch (e.type) {
        case 'dig-done':
          renderer.debris(e.x + 0.5, e.y + 0.5, renderer.tileColor(HARD_TILE[e.hard] || Rules.TILE.ROCK), 6 + e.cells);
          if (e.ores.length) {
            sound.pickup(Math.max.apply(null, e.ores));
            renderer.floatText(oreNames(e.ores), state.car.x, state.car.y - 0.8, Rules.ORES[Math.max.apply(null, e.ores)].shine);
          }
          if (e.full) toast('🎒 가방이 가득 찼어요! 못 담은 광석은 그 자리에 남아 있어요.');
          break;
        case 'pickup':
          sound.pickup(e.ore);
          renderer.floatText('+' + Rules.ORES[e.ore].name, state.car.x, state.car.y - 0.8, Rules.ORES[e.ore].shine);
          break;
        case 'blocked':
          if (now - lastBlocked < 1500) break;
          lastBlocked = now;
          sound.blocked();
          if (e.reason === 'too-hard') toast('⛏️ 드릴이 약해서 못 파요! 상점에서 드릴을 ' + e.need + '단계로 올려요.', 3200);
          else if (e.reason === 'seal') toast('🪨 아주아주 단단한 바닥이에요… 전설의 보물을 찾으면 무슨 일이 생길지도?', 3500);
          else if (e.reason === 'lava') toast('🌋 용암은 팔 수 없어요. 닿으면 뜨거우니 돌아가세요!');
          else if (e.reason === 'no-fuel') toast('⛽ 연료가 없어요. 주유소에서 채워요.');
          break;
        case 'hurt':
          if (e.cause === 'fall') { sound.hurt(); renderer.shake = 0.3; renderer.floatText('-' + Math.round(e.amount), state.car.x, state.car.y - 0.8, '#ff6b6b'); }
          break;
        case 'burn':
          sound.burn();
          toast('🔥 용암에 닿았어요! 뜨거워요!', 1500);
          break;
        case 'heat':
          sound.burn();
          if (now - lastHeatToast > 6000) {
            lastHeatToast = now;
            toast('🔥 너무 뜨거워요! 1초에 체력 -' + (Math.round(e.dps * 10) / 10) + ' · 상점에서 열보호를 올리면 덜 닳아요.', 3500);
          }
          break;
        case 'dead':
          sound.dead();
          renderer.cam = null;
          toast((e.cause === 'heat' ? '🔥 열을 못 견디고 차가 망가졌어요… ' : '💥 차가 망가져서 지상으로 실려 왔어요… ') + (e.lost ? '가방 속 광석 ' + e.lost + '개를 잃었어요.' : ''), 4000);
          saveNow();
          break;
        case 'rescue':
          sound.rescue();
          renderer.cam = null;
          toast('🚁 연료가 떨어져서 구조대가 끌어올렸어요! 비용 ' + fmt.money(e.cost) + (e.owed ? ' (외상 ' + fmt.money(e.owed) + ' — 광석을 팔면 갚아요)' : ''), 5000);
          saveNow();
          break;
        case 'low-fuel':
          sound.lowFuel();
          toast('⛽ 연료가 얼마 안 남았어요! 올라갈 연료를 남겨 두세요.', 3000);
          break;
        case 'building':
          if (e.key) openPanel(e.key); else if (panelKey) closePanel();
          break;
        case 'treasure':
          sound.treasure();
          renderer.shake = 0.8;
          if (e.first) showEnding();
          break;
        case 'auto-ore':
          renderer.floatText('+' + fmt.money(e.value), e.x + 0.5, e.y, Rules.ORES[e.ore].shine);
          ranking.queueMoney(state);
          break;
        case 'auto-end':
          renderer.debris(e.x + 0.5, e.y + 0.5, '#9fc2ff', 10);
          break;
        case 'core-door':
          askConfirm('🚪 나갈까요?', '나가면 입장권이 사라져서, 다시 오려면 입장권을 또 사야 해요.', function () {
            Game.leaveCore(state); renderer.cam = null; sound.recall(); toast('지상으로 돌아왔어요.'); saveNow();
          });
          break;
        case 'core-button':
          askConfirm('🔴 버튼을 누를까요?', '…', function () {
            askConfirm('정말 누를까요?', '…', destroyEarth);
          });
          break;
      }
    });
  }

  function showEnding() {
    $('mtEndingTime').textContent = fmt.time(state.treasureTime);
    $('mtEndingReward').textContent = fmt.money(Rules.TREASURE_REWARD);
    $('mtEndingRank').textContent = '순위를 등록하는 중이에요…';
    openModal('mtEndingModal');
    saveNow();
    ranking.queueMoney(state);
    ranking.submitTime(state)
      .then(function (data) { $('mtEndingRank').textContent = data.rank ? '⏱️ 보물 시간 순위 ' + data.rank + '위에 올랐어요!' : '⏱️ 아쉽게도 50위 안에는 못 들었어요.'; })
      .catch(function () { $('mtEndingRank').textContent = '순위 등록에 실패했어요. 인터넷 연결을 확인해 주세요.'; });
  }
  $('mtEndingContinue').addEventListener('click', function () { closeModal('mtEndingModal'); });
  $('mtEndingRankButton').addEventListener('click', function () { closeModal('mtEndingModal'); openRanking('time'); });

  // 🌍 두 번째 엔딩: 버튼을 누르는 순간 기록·저장을 정리하고(연출 중에 창을 닫아도 남게), 연출이 끝나면 엔딩 창.
  function destroyEarth() {
    var result = Game.pressCoreButton(state);
    if (!result.ok) return;
    closePanel();
    releaseKeys();
    var stats = { time: state.time, earned: state.earned, treasureTime: state.treasureTime, autoBought: state.autoBought };
    var count = Save.addDestroyed();
    Save.clear();
    ranking.queueMoney(state);
    var rankPromise = ranking.submitDestroy(state);
    renderer.startDestroy(performance.now());
    sound.destroy();
    setTimeout(function () {
      $('mtDestroyTime').textContent = fmt.time(stats.time);
      $('mtDestroyEarned').textContent = fmt.money(stats.earned);
      $('mtDestroyTreasure').textContent = stats.treasureTime == null ? '-' : fmt.time(stats.treasureTime);
      $('mtDestroyAutos').textContent = stats.autoBought + '대';
      $('mtDestroyCount').textContent = '🌍 지구를 부순 횟수: ' + count + '번';
      $('mtDestroyRank').textContent = '순위를 등록하는 중이에요…';
      openModal('mtDestroyModal');
      rankPromise
        .then(function (data) { $('mtDestroyRank').textContent = data.rank ? '🌍 지구 파괴 시간 순위 ' + data.rank + '위에 올랐어요!' : '🌍 아쉽게도 50위 안에는 못 들었어요.'; })
        .catch(function () { $('mtDestroyRank').textContent = '순위 등록에 실패했어요. 인터넷 연결을 확인해 주세요.'; });
    }, 6800);
  }
  $('mtDestroyRestart').addEventListener('click', function () {
    closeModal('mtDestroyModal');
    renderer.destroyAt = null;
    state = null;
    showStart(false);
  });
  $('mtDestroyRankButton').addEventListener('click', function () { openRanking('destroy'); });

  // ---------- 순위·멈춤·소리 단추 ----------
  function openRanking(tab) { releaseKeys(); ranking.open(tab); }
  $('mtRankButton').addEventListener('click', function () { openRanking(); });
  $('mtRankClose').addEventListener('click', function () { ranking.close(); lastTime = performance.now(); });

  function pause() {
    if (!state || modal) return;
    saveNow();
    openModal('mtPauseModal');
    $('mtResumeButton').focus();
  }
  $('mtPauseButton').addEventListener('click', pause);
  $('mtResumeButton').addEventListener('click', function () { closeModal('mtPauseModal'); sound.resume(); });

  function renderSoundButton() {
    $('mtSoundButton').textContent = sound.on ? '🔊 소리 켜짐' : '🔇 소리 꺼짐';
    $('mtSoundButton').setAttribute('aria-pressed', sound.on ? 'true' : 'false');
  }
  $('mtSoundButton').addEventListener('click', function () { sound.unlock(); sound.setOn(!sound.on); renderSoundButton(); });
  renderSoundButton();

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { saveNow(); pause(); sound.pause(); }
  });
  window.addEventListener('pagehide', saveNow);

  // ---------- 키보드 ----------
  var KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down' };
  function typing(e) { var t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'); }
  document.addEventListener('keydown', function (e) {
    if (typing(e)) return;
    sound.unlock();
    if (e.code === 'Escape') {
      if (ranking.isOpen()) { ranking.close(); lastTime = performance.now(); return; }
      if (modal === 'mtPauseModal') { closeModal('mtPauseModal'); return; }
      if (modal === 'mtConfirmModal') { $('mtConfirmNo').click(); return; }
      if (modal === 'mtEndingModal') { closeModal('mtEndingModal'); return; }
      if (panelKey) { closePanel(); return; }
      pause();
      return;
    }
    if (modal || ranking.isOpen()) return;
    var key = KEYS[e.code];
    if (key) { input[key] = true; e.preventDefault(); return; }
    if (e.code === 'KeyQ') toggleWide();
    if (e.code === 'KeyR') askRecall();
    if (e.code === 'KeyF') instantSell();
    if (e.code === 'Space') e.preventDefault();
  });
  document.addEventListener('keyup', function (e) {
    var key = KEYS[e.code];
    if (key) input[key] = false;
  });
  window.addEventListener('blur', releaseKeys);

  // ---------- 터치 단추 ----------
  Array.prototype.forEach.call(document.querySelectorAll('[data-key]'), function (b) {
    var key = b.getAttribute('data-key');
    function down(e) { e.preventDefault(); sound.unlock(); touchKeys[key] = true; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (err) {} }
    function up() { touchKeys[key] = false; b.classList.remove('on'); }
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-action]'), function (b) {
    b.addEventListener('click', function () { sound.unlock(); var action = b.getAttribute('data-action'); if (action === 'wide') toggleWide(); else if (action === 'instant') instantSell(); else askRecall(); });
  });
  if (window.matchMedia && matchMedia('(pointer: coarse)').matches) {
    $('mtHelp').textContent = '◀ ▶ 이동·옆으로 파기 · ▼ 아래로 파기 · ▲ 날기 · 💥 넓게/1칸 · 🌀 귀환석 · 💸 즉시 팔기';
  }

  // ---------- 매 화면 ----------
  function frame(now) {
    var dt = Math.min(0.1, (now - (lastTime || now)) / 1000);
    lastTime = now;
    var running = state && !modal && !ranking.isOpen();
    if (running) {
      var merged = {
        left: input.left || !!touchKeys.left, right: input.right || !!touchKeys.right,
        up: input.up || !!touchKeys.up, down: input.down || !!touchKeys.down
      };
      handle(Game.update(state, merged, dt));
      if (state.dig) {
        digSoundTimer -= dt;
        if (digSoundTimer <= 0) {
          digSoundTimer = 0.13;
          sound.dig(state.dig.hard);
          var d = state.dig;
          renderer.debris(state.car.x + (d.dx || 0) * 0.5, state.car.y + (d.dy || 0) * 0.5, renderer.tileColor(d.hard === 1 ? Rules.TILE.DIRT : d.hard === 2 ? Rules.TILE.STONE : Rules.TILE.ROCK), 2);
        }
      }
      saveTimer += dt;
      if (saveTimer >= 5) saveNow();
      if (panelKey) renderPanelThrottled(dt);
    }
    if (state) {
      renderer.render(state, now, running ? dt : 0);
      updateHud();
    } else {
      drawTitleBackground(now);
    }
    requestAnimationFrame(frame);
  }

  // 가게 창 안 숫자가 실제로 바뀌었을 때만 다시 그린다(누르는 중에 단추가 바뀌어 클릭이 사라지지 않게).
  var panelSignature = '';
  function renderPanelThrottled() {
    var sig = [panelKey, state.money, state.debt, Math.ceil(state.fuel), Math.ceil(state.hp), Game.bagCount(state), state.recall, state.instant, state.ticket, state.autos.length, JSON.stringify(state.levels)].join('|');
    if (sig === panelSignature) return;
    panelSignature = sig;
    renderPanel();
  }

  // 시작 창 뒤에 보이는 배경(땅 단면).
  var titleWorld = Game.newGame({ seed: 20261022 });
  titleWorld.car.x = 24.5;
  function drawTitleBackground(now) {
    renderer.render(titleWorld, now, 0.016);
  }

  // 확인용 통로(브라우저 콘솔·자동 시험에서 지금 상태를 본다). 혼자 하는 게임이라 저장도 원래 바꿀 수 있다.
  MT.debug = { get state() { return state; } };

  showStart(false);
  requestAnimationFrame(frame);
})(window.MT = window.MT || {});
