// ===== main.js =====
// 전체를 묶는다: 입력(키보드·터치) → Game.update → 사건(events)을 소리·글자·순위로 → 그리기.
// 상단 막대·가게 창·시작/멈춤/확인/엔딩 창도 여기서 다룬다. 사용자 글자는 모두 textContent로 넣는다.
(function (MT) {
  var Rules = MT.Rules, Game = MT.Game, Save = MT.Save, Link = MT.Link, fmt = MT.format;
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
  var SYNC_EVERY = 30; // 📱 연동된 월드는 30초마다 서버에 올린다
  var syncTimer = 0;
  var syncing = false;

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
  $('mtConfirmNo').addEventListener('click', function () {
    confirmAction = null;
    closeModal('mtConfirmModal');
    if (!state) showStart(false); // 시작 화면에서 연 확인 창이었으면 시작 화면으로 돌아간다
  });

  // ---------- 시작 ----------
  function newPlayerId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  // notice를 주면 망가짐 안내 자리에 그 글을 보여 준다(다른 기기에서 월드가 끝났을 때 등).
  function showStart(broken, notice) {
    var saved = broken ? null : Save.load();
    if (saved && saved.broken) { broken = true; saved = null; Save.clear(); }
    if (saved && saved.state.destroyedTime != null) { saved = null; Save.clear(); } // 지구가 부서진 판은 끝
    if (!saved && Link.get()) Link.clear(); // 저장이 없는데 연동 정보만 남았으면 버린다
    $('mtBrokenNotice').textContent = notice || '저장이 망가졌어요. 새로 시작할게요.';
    $('mtBrokenNotice').classList.toggle('hidden', !broken && !notice);
    var destroyed = Save.destroyedCount();
    $('mtDestroyedBadge').classList.toggle('hidden', !destroyed);
    $('mtDestroyedBadge').textContent = '🌍 지구를 부순 횟수: ' + destroyed + '번';
    var hidden = Save.hiddenCounts();
    $('mtHiddenBadge').classList.toggle('hidden', !hidden[1] && !hidden[2]);
    $('mtHiddenBadge').textContent = [hidden[1] ? '🕳️ 지각 정복 ' + hidden[1] + '번' : '', hidden[2] ? '🌋 지구 속 정복 ' + hidden[2] + '번' : ''].filter(Boolean).join(' · ');
    $('mtNameInput').value = Save.getName();
    if (saved) {
      var s = saved.state;
      $('mtSaveInfo').textContent = (Link.get() ? '📱 ' : '') + s.name + ' · 번 돈 ' + fmt.money(s.earned) + ' · 가장 깊이 ' + s.maxDepth + 'm · ' + fmt.time(s.time);
      $('mtContinueBox').classList.remove('hidden');
      $('mtNewButton').textContent = '처음부터 새로 시작';
      $('mtContinueButton').disabled = false;
      $('mtContinueButton').textContent = '이어하기';
      $('mtContinueButton').onclick = function () { continueSaved(s); };
    } else {
      $('mtContinueBox').classList.add('hidden');
      $('mtNewButton').textContent = '새로 시작';
    }
    openModal('mtStartModal');
    refreshWorlds();
  }

  function startNew() {
    var name = $('mtNameInput').value.trim().slice(0, 20) || '이름없음';
    Save.setName(name);
    ranking.reset();
    begin(Game.newGame({ name: name, playerId: newPlayerId() }));
  }

  $('mtNewButton').addEventListener('click', function () {
    if (!$('mtContinueBox').classList.contains('hidden')) {
      askConfirm('처음부터 새로 시작할까요?', '저장된 게임(땅·돈·업그레이드)이 모두 사라져요.' + linkedWarning(), function () {
        askConfirm('정말 지울까요?', '되돌릴 수 없어요. 순위표의 기록은 그대로 남아요.', function () {
          endLinkedWorld(function () { Save.clear(); startNew(); });
        });
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

  // 지구가 부서진 판은 다시 저장하지 않는다. soon이면(팔기·사기) 연동된 월드를 곧 서버에도 올린다.
  function saveNow(soon) {
    if (state && state.destroyedTime == null) {
      Save.save(multi.savable(state));
      Link.markDirty();
      if (soon) syncTimer = Math.max(syncTimer, SYNC_EVERY - 2);
    }
    saveTimer = 0;
  }

  // ---------- 📱 다른 기기 연동 ----------
  function notice(text) {
    if (modal === 'mtStartModal') { $('mtBrokenNotice').textContent = text; $('mtBrokenNotice').classList.remove('hidden'); } else toast(text, 4000);
  }
  function linkedWarning() { return Link.get() ? ' 📱 연동된 다른 기기에서도 모두 처음부터 시작해요.' : ''; }
  function summaryText(depth, earned, time) { return '가장 깊이 ' + depth + 'm · 번 돈 ' + fmt.money(earned) + ' · ' + fmt.time(time); }
  function agoText(at) {
    var minutes = Math.floor((Date.now() - at) / 60000);
    if (minutes < 1) return '방금';
    if (minutes < 60) return minutes + '분 전';
    if (minutes < 60 * 24) return Math.floor(minutes / 60) + '시간 전';
    return Math.floor(minutes / 60 / 24) + '일 전';
  }

  // 연동된 월드면 서버에서도 끝낸다(모든 기기가 처음부터). 인터넷이 안 되면 멈추고 알려 준다.
  function endLinkedWorld(after) {
    if (!Link.get()) { after(); return; }
    Link.end('reset').then(function (result) {
      if (result.ok || result.gone) { after(); return; }
      if (!state) showStart(false);
      notice('📱 연동된 월드라서 인터넷이 있어야 처음부터 다시 할 수 있어요. ' + result.error);
    });
  }

  // 다른 기기 때문에 월드가 사라졌을 때.
  var GONE_TEXT = {
    reset: '🔄 다른 기기에서 "처음부터 다시"를 해서 이 월드가 끝났어요. 새로 시작해 주세요.',
    destroyed: '🌍 다른 기기에서 지구를 부숴서 이 월드가 끝났어요. 새로 시작해 주세요.',
    unlinked: '✂️ 다른 기기에서 연동을 끊어서, 이 기기에서는 이 월드를 더 할 수 없어요.'
  };
  function handleGone(reason) {
    Link.clear();
    updateLinkButton();
    if (reason === 'expired') { toast('📱 30일 동안 아무 기기에서도 안 해서 연동이 끝났어요. 이 기기에서 혼자 계속해요.', 5000); return; }
    multi.leave(true);
    Save.clear();
    state = null;
    closePanel();
    if (modal) closeModal(modal);
    showStart(false, GONE_TEXT[reason] || GONE_TEXT.reset);
  }

  // 서버 것으로 바꿔 끼운다.
  function replaceState(s, rev) {
    multi.leave(true); // 친구와 하던 중이면 먼저 끝낸다(땅이 통째로 바뀌므로)
    state = s;
    Link.adopt(rev);
    renderer.cam = null;
    closePanel();
    Save.save(state);
  }

  function doSync(force, keepalive) {
    if (!state || !Link.get() || syncing) return;
    syncing = true;
    syncTimer = 0;
    Link.sync(multi.savable(state), force, keepalive).then(function (result) {
      syncing = false;
      if (result.gone) handleGone(result.gone);
      else if (result.taken) showTaken(result.summary, '다른 기기에서 이 월드를 열었어요');
      // 인터넷이 안 되는 등 다른 오류는 다음 차례에 다시 올린다
    });
  }

  // 두 상태를 보여 주고 고르게 한다(게임은 창이 열린 동안 멈춤).
  function showTaken(server, title) {
    if (!state) return;
    $('mtTakenTitle').textContent = '📱 ' + title;
    $('mtTakenServer').textContent = server ? summaryText(server.depth, server.earned, server.time) : '-';
    $('mtTakenLocal').textContent = summaryText(state.maxDepth, Math.floor(state.earned), state.time);
    openModal('mtTakenModal');
  }
  $('mtTakenServerButton').addEventListener('click', function () {
    var b = this;
    b.disabled = true;
    Link.adopt(-1); // 판 번호를 지워서 서버 것을 꼭 받아 온다
    Link.open().then(function (result) {
      b.disabled = false;
      if (result.gone) { handleGone(result.gone); return; }
      if (!result.ok) { toast(result.error); return; }
      closeModal('mtTakenModal');
      if (result.state) replaceState(result.state, result.rev);
      toast('☁️ 서버에 있던 내용으로 이어 해요!');
    });
  });
  $('mtTakenLocalButton').addEventListener('click', function () {
    closeModal('mtTakenModal');
    toast('📱 이 기기 것으로 계속해요. 다른 기기는 멈춰요.');
    doSync(true);
  });

  // 이어하기: 연동된 월드면 먼저 서버에 더 새로운 내용이 있는지 본다.
  function continueSaved(local) {
    if (!Link.get()) { begin(local); return; }
    var b = $('mtContinueButton');
    b.disabled = true;
    b.textContent = '☁️ 불러오는 중…';
    Link.open().then(function (result) {
      if (result.gone) {
        if (result.gone !== 'expired') { handleGone(result.gone); return; }
        begin(local);
        handleGone('expired');
        return;
      }
      if (!result.ok) { begin(local); toast('📶 인터넷이 안 돼서 이 기기 저장으로 할게요. 연결되면 다시 맞춰요.', 4000); return; }
      if (!result.state) { begin(local); return; }
      if (!Link.dirty()) {
        Link.adopt(result.rev);
        begin(result.state);
        toast('☁️ 다른 기기에서 한 내용을 불러왔어요!', 3500);
        return;
      }
      begin(local); // 두 곳 모두 바뀌었으면 고르게 한다
      showTaken(result.summary, '다른 기기에서도 이 월드를 했어요');
    });
  }

  // 시작 화면: 적은 이름으로 연동된 월드 목록.
  var worldsTimer = null;
  var joinTarget = null;
  function refreshWorlds() {
    clearTimeout(worldsTimer);
    worldsTimer = setTimeout(function () {
      var name = $('mtNameInput').value.trim();
      if (!name) { $('mtLinkWorlds').classList.add('hidden'); return; }
      Link.list(name).then(function (worlds) {
        if (modal !== 'mtStartModal' || $('mtNameInput').value.trim() !== name) return;
        var list = $('mtLinkWorldList');
        list.textContent = '';
        worlds.forEach(function (w) {
          var li = el('li');
          li.append(el('span', null, '⛏️ ' + summaryText(w.depth, w.earned, w.time) + ' · ' + agoText(w.updatedAt) + ' · 기기 ' + w.devices + '대'),
            button('하기', 'mt-buy', function () { askJoin(w); }));
          list.append(li);
        });
        $('mtLinkWorlds').classList.toggle('hidden', !worlds.length);
      });
    }, 400);
  }
  $('mtNameInput').addEventListener('input', refreshWorlds);

  function askJoin(world) {
    joinTarget = world;
    var open = function () {
      $('mtJoinInfo').textContent = '⛏️ ' + summaryText(world.depth, world.earned, world.time);
      $('mtJoinPassword').value = '';
      $('mtJoinError').classList.add('hidden');
      openModal('mtJoinModal');
      $('mtJoinPassword').focus();
    };
    if ($('mtContinueBox').classList.contains('hidden')) { open(); return; }
    askConfirm('이 기기의 월드가 사라져요', '다른 기기에서 하던 월드를 열면, 이 기기에 저장된 지금 월드는 지워져요.', function () {
      askConfirm('정말 바꿀까요?', '되돌릴 수 없어요. 순위표의 기록은 그대로 남아요.', open);
    });
  }
  $('mtJoinCancel').addEventListener('click', function () { closeModal('mtJoinModal'); showStart(false); });
  $('mtJoinForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var b = $('mtJoinSubmit');
    b.disabled = true;
    Link.join(joinTarget.id, $('mtJoinPassword').value).then(function (result) {
      b.disabled = false;
      if (!result.ok) {
        $('mtJoinError').textContent = result.gone ? '이 월드는 이제 없어요.' : result.error;
        $('mtJoinError').classList.remove('hidden');
        return;
      }
      closeModal('mtJoinModal');
      Save.setName(result.state.name);
      ranking.reset();
      begin(result.state);
      updateLinkButton();
      toast('📱 다른 기기에서 하던 월드를 불러왔어요! 이제 연동된 기기들이 같은 월드를 함께 써요.', 4500);
    });
  });

  // 📱 단추: 연동 시작 또는 관리(비밀번호 바꾸기·연동 끊기).
  function updateLinkButton() { $('mtLinkButton').textContent = Link.get() ? '📱 연동됨' : '📱 다른 기기'; }
  function linkDesc(devices) {
    return '이 월드는 ' + (devices ? '기기 ' + devices + '대에 ' : '다른 기기와 ') + '연동되어 있어요. 30초마다 저장을 맞춰요. 다른 기기의 시작 화면에서 이름 "' + state.name + '"을 쓰면 이 월드가 나와요.';
  }
  function openLinkModal() {
    if (!state) { notice('📱 게임을 시작한 다음 눌러 주세요. 다른 기기에서 하던 월드는 이름 칸에 같은 이름을 쓰면 아래에 나와요.'); return; }
    if (modal) return;
    var linked = !!Link.get();
    $('mtLinkTitle').textContent = linked ? '📱 연동된 월드' : '📱 다른 기기에서 하기';
    $('mtLinkDesc').textContent = linked ? linkDesc(0)
      : '지금 월드를 서버에 올려서 다른 기기에서도 이어 할 수 있어요. 다른 기기의 시작 화면에서 이름 "' + state.name + '"을 쓰고 비밀번호를 넣으면 돼요. 연동된 기기들은 같은 월드를 함께 써요.';
    $('mtLinkPasswordLabel').textContent = linked ? '새 비밀번호 (4자 이상)' : '비밀번호 (4자 이상)';
    $('mtLinkSubmit').textContent = linked ? '비밀번호 바꾸기' : '연동 시작';
    $('mtUnlinkButton').classList.toggle('hidden', !linked);
    $('mtLinkPassword').value = $('mtLinkPassword2').value = '';
    $('mtLinkError').classList.add('hidden');
    openModal('mtLinkModal');
    if (linked) {
      Link.info().then(function (result) {
        if (result.gone) { handleGone(result.gone); return; }
        if (result.ok && modal === 'mtLinkModal') $('mtLinkDesc').textContent = linkDesc(result.devices);
      });
    }
  }
  $('mtLinkButton').addEventListener('click', openLinkModal);
  $('mtLinkClose').addEventListener('click', function () { closeModal('mtLinkModal'); });
  $('mtLinkForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var password = $('mtLinkPassword').value;
    var error = function (text) { $('mtLinkError').textContent = text; $('mtLinkError').classList.remove('hidden'); };
    if (password.length < 4) { error('비밀번호는 4자 이상이어야 해요.'); return; }
    if (password !== $('mtLinkPassword2').value) { error('두 비밀번호가 달라요. 똑같이 써 주세요.'); return; }
    var linked = !!Link.get();
    var b = $('mtLinkSubmit');
    b.disabled = true;
    saveNow();
    (linked ? Link.setPassword(password) : Link.create(multi.savable(state), password)).then(function (result) {
      b.disabled = false;
      if (result.gone) { handleGone(result.gone); return; }
      if (!result.ok) { error(result.error); return; }
      closeModal('mtLinkModal');
      updateLinkButton();
      toast(linked ? '🔑 비밀번호를 바꿨어요!' : '📱 연동했어요! 다른 기기의 시작 화면에서 이름 "' + state.name + '"을 쓰면 이 월드가 나와요.', 5000);
    });
  });
  $('mtUnlinkButton').addEventListener('click', function () {
    askConfirm('✂️ 연동을 끊을까요?', '이 기기만 이 월드를 계속하고, 연동된 다른 기기에서는 이 월드가 사라져서 더 할 수 없어요.', function () {
      askConfirm('정말 끊을까요?', '되돌릴 수 없어요.', function () {
        Link.unlink().then(function (result) {
          if (result.gone) { handleGone(result.gone); return; }
          if (!result.ok) { toast('✂️ 연동을 끊지 못했어요. ' + result.error, 4000); return; }
          updateLinkButton();
          saveNow();
          toast('✂️ 연동을 끊었어요. 이제 이 기기에서만 하는 월드예요.', 4000);
        });
      });
    });
  });

  // ---------- 👫 친구와 함께 ----------
  var multi = new MT.Multi({
    getState: function () { return state; },
    renderer: renderer,
    toast: toast,
    onEvents: function (events) { handle(events); },
    onChange: function () { updateMultiButton(); if (modal === 'mtMultiModal') renderMulti(); },
    onEnd: function (reason) {
      renderer.cam = null;
      updateMultiButton();
      if (modal === 'mtMultiModal') renderMulti();
      if (!state) return;
      saveNow();
      var text = {
        'host-left': '🏠 방장이 방을 닫아서 내 땅으로 돌아왔어요.',
        'host-gone': '📶 방장의 연결이 끊겨서 내 땅으로 돌아왔어요.',
        lost: '📶 서버와 연결이 끊겨서 다시 혼자 해요.',
        'closed-by-me': '🚪 방을 닫았어요. 다시 혼자 해요.',
        'left-by-me': '🏠 내 땅으로 돌아왔어요!'
      }[reason];
      if (text) toast(text, 4000);
    }
  });

  function updateMultiButton() {
    $('mtMultiButton').textContent = multi.active() ? '👫 함께 ' + multi.count() + '명' : '👫 친구와 함께';
  }
  function multiError(text) {
    $('mtMultiError').textContent = text || '';
    $('mtMultiError').classList.toggle('hidden', !text);
  }
  function openMulti() {
    if (!state) { notice('👫 게임을 시작한 다음 눌러 주세요.'); return; }
    if (modal && modal !== 'mtMultiModal') return;
    multiError('');
    $('mtMultiCode').value = '';
    renderMulti();
    openModal('mtMultiModal');
  }
  function renderMulti() {
    var on = multi.active();
    $('mtMultiIdle').classList.toggle('hidden', on);
    $('mtMultiRoom').classList.toggle('hidden', !on);
    $('mtMultiTitle').textContent = !on ? '친구와 함께' : multi.role === 'host' ? '🏠 내 땅에 친구를 불렀어요' : '🚪 친구 땅에 놀러 왔어요';
    if (!on) return;
    $('mtMultiCodeShow').textContent = multi.code;
    $('mtMultiRoomDesc').textContent = multi.role === 'host'
      ? '친구에게 이 코드를 알려 주세요. 친구는 👫 단추에서 코드를 넣으면 내 땅에 들어와요. (최대 4명)'
      : '같은 땅을 함께 파요. 캔 광석·돈은 내 것이고, 집으로 돌아가면 내 땅에서 이어 해요.';
    $('mtMultiLeave').textContent = multi.role === 'host' ? '🚪 방 닫기 (친구들은 집으로 돌아가요)' : '🏠 집으로 돌아가기';
    var list = $('mtMultiPlayers');
    list.textContent = '';
    multi.players.forEach(function (p) {
      var li = el('li');
      var dot = el('i');
      dot.style.background = p.id === multi.you ? '#f5c518' : p.color; // 내 화면에서 내 차는 늘 노란색
      li.append(dot, el('span', null, (p.host ? '👑 ' : '') + p.name + (p.id === multi.you ? ' (나)' : '')));
      if (p.online === false) li.append(el('small', null, '📶 연결 끊김'));
      list.append(li);
    });
  }
  function multiBlocked() {
    if (state.inCore) return '⭐ 지구의 중심에서는 친구와 함께 할 수 없어요.';
    return '';
  }
  $('mtMultiButton').addEventListener('click', openMulti);
  $('mtMultiClose').addEventListener('click', function () { closeModal('mtMultiModal'); });
  $('mtMultiHost').addEventListener('click', function () {
    var blocked = multiBlocked();
    if (blocked) { multiError(blocked); return; }
    var b = this;
    b.disabled = true;
    multiError('');
    saveNow();
    multi.host(state).then(function (r) {
      b.disabled = false;
      if (!r.ok) { multiError(r.message); return; }
      updateMultiButton();
      renderMulti();
      sound.buy();
    });
  });
  $('mtMultiJoinForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var code = $('mtMultiCode').value.trim().toUpperCase();
    if (code.length !== 4) { multiError('방 코드 4글자를 넣어 주세요.'); return; }
    var blocked = multiBlocked();
    if (blocked) { multiError(blocked); return; }
    var b = $('mtMultiJoin');
    b.disabled = true;
    multiError('');
    saveNow(); // 떠나기 전에 내 땅을 저장해 둔다
    multi.join(state, code).then(function (r) {
      b.disabled = false;
      if (!r.ok) { multiError(r.message); return; }
      closePanel();
      renderer.cam = null;
      updateMultiButton();
      closeModal('mtMultiModal');
      sound.recall();
      toast('🚪 친구 땅에 놀러 왔어요! 캔 광석은 내 가방에 들어가요.', 4000);
    });
  });
  $('mtMultiLeave').addEventListener('click', function () {
    var host = multi.role === 'host';
    askConfirm(host ? '🚪 방을 닫을까요?' : '🏠 집으로 돌아갈까요?', host ? '놀러 온 친구들은 모두 자기 땅으로 돌아가요.' : '내 땅 지상으로 돌아가요. 여기서 번 돈·광석은 그대로 내 것이에요.', function () {
      closePanel();
      multi.leave();
    });
  });

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
    setText('mtWarpText', String(state.warps.length));
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
      saveNow(true);
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
    shopRow(body, '📍 지정 워프석 (가진 것 ' + state.warps.length + '/' + Rules.WARP_MAX + '개)', '원하는 곳에서 위치를 한 번 저장하면, T(휴대폰 📍)로 어디서든 몇 번이든 그 자리로 가요', fmt.money(Rules.WARP_PRICE), function () {
      buyItem(Game.buyWarp(state), '📍 워프석을 샀어요! 원하는 곳에서 T(휴대폰 📍)를 눌러 위치를 저장해요.');
    }, state.debt > 0 || state.money < Rules.WARP_PRICE || state.warps.length >= Rules.WARP_MAX);
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
          var used = Game.useTicket(state);
          if (used.ok) { closePanel(); sound.recall(); renderer.cam = null; toast('⭐ 지구의 중심에 왔어요… 저 빨간 버튼은 뭘까요?', 4000); saveNow(); }
          else failBuy(used.reason);
        }, false);
      } else {
        shopRow(body, '🎫 지구 핵 입장권', block === 'heat' ? '🔥 열보호 5단계가 있어야 살 수 있어요 · 지구의 중심으로 가는 표예요' : '지구의 중심으로 바로 가는 표예요', fmt.money(Rules.TICKET_PRICE), function () {
          buyItem(Game.buyTicket(state), '🎫 입장권을 샀어요! "지금 가기"를 누르면 지구의 중심으로 가요.');
        }, !!block || state.debt > 0 || state.money < Rules.TICKET_PRICE);
      }
    }
    renderGacha(body, open);
    body.append(button('🔄 처음부터 다시', 'mt-reset', function () {
      if (multi.active()) { failBuy('multi'); return; }
      askConfirm('처음부터 다시 할까요?', '땅·돈·업그레이드가 모두 사라지고 새 땅에서 시작해요.' + linkedWarning(), function () {
        askConfirm('정말 지울까요?', '되돌릴 수 없어요. 순위표의 기록은 그대로 남아요.', function () {
          endLinkedWorld(function () { Save.clear(); state = null; closePanel(); showStart(false); updateLinkButton(); });
        });
      });
    }));
  }

  // 🎰 뽑기: 보물 전에는 일반 뽑기, 보물 뒤에는 특수 뽑기만 보인다(특수 뽑기는 보물 전에 🔒로 미리 보여 줌).
  function gachaOdds(kind) {
    return Rules.GACHA[kind].ores.map(function (item) { return Rules.ORES[item[0]].name + ' ' + item[1] + '%'; }).join(' · ');
  }
  function renderGacha(body, open) {
    body.append(el('h3', 'mt-shop-head', '🎰 뽑기'));
    var kind = open ? 'special' : 'normal';
    var g = Rules.GACHA[kind];
    var block = Game.gachaBlock(state, kind);
    var row = el('div', 'mt-shop-row');
    var info = el('div', 'mt-shop-info');
    info.append(el('b', null, g.icon + ' ' + g.name), el('small', null, block === 'bag' ? '🎒 가방이 가득 찼어요. 먼저 팔고 오세요!' : '광석이 하나 나와서 가방에 들어가요'), el('small', 'mt-gacha-odds', gachaOdds(kind)));
    row.append(info, button(fmt.money(g.price), 'mt-buy', function () { pullGacha(kind); }, !!block || state.debt > 0 || state.money < g.price));
    body.append(row);
    if (!open) shopRow(body, '🌟 특수 뽑기', '🔒 보물을 찾으면 열려요 · 맨틀~내핵 광석(페리도트~별의 심장)이 나와요', '🔒', function () {}, true, 'mt-locked');
  }
  function pullGacha(kind) {
    var result = Game.gacha(state, kind);
    if (!result.ok) { failBuy(result.reason); return; }
    var ore = Rules.ORES[result.ore];
    var weight = Rules.GACHA[kind].ores.filter(function (item) { return item[0] === result.ore; })[0][1];
    var rare = weight <= 3; // 3% 이하가 나오면 대박
    if (rare) { sound.treasure(); renderer.shake = 0.5; } else sound.pickup(result.ore);
    renderer.floatText('+' + ore.name, state.car.x, state.car.y - 1, ore.shine);
    toast((rare ? '✨ 대박! 나온 광석은 ' : '🎰 두구두구… 나온 광석은 ') + ore.name + ' (' + fmt.money(ore.value) + ')!', rare ? 4000 : 2600);
    saveNow();
    renderPanel();
  }

  function buyItem(result, message) {
    if (!result.ok) { failBuy(result.reason); return; }
    sound.buy();
    if (message) toast(message);
    saveNow(true);
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
      core: '⭐ 지구의 중심에서는 워프석을 쓸 수 없어요.',
      heat: '🔥 열보호 5단계가 있어야 살 수 있어요.',
      have: '🎫 이미 입장권을 가지고 있어요.',
      ended: '🎰 일반 뽑기는 보물을 찾기 전까지만 할 수 있어요.',
      bag: '🎒 가방이 가득 찼어요. 먼저 팔고 오세요!',
      multi: '👫 친구와 함께 하는 동안은 할 수 없어요. 👫 단추에서 먼저 끝내 주세요.'
    }[reason] || '이미 최고 단계예요.');
  }

  function buy(key) {
    var result = Game.buyUpgrade(state, key);
    if (!result.ok) { failBuy(result.reason); return; }
    sound.buy();
    var up = Rules.UPGRADES[key];
    toast(up.icon + ' ' + up.name + (key === 'autoHeat' ? '를 달았어요!' : ' ' + (result.level + 1) + '단계가 됐어요!'));
    if (key === 'range' && result.level === 1) toast('💥 넓게 파기! Q(휴대폰은 💥)로 1칸 파기와 바꿀 수 있어요.', 3500);
    saveNow(true);
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
  // 📍 지정 워프석 창: 저장한 워프석은 [가기], 아직 안 정한 워프석은 [여기 저장], 모두 [버리기].
  function warpPlace(p) {
    var depth = p.y > 0 ? Math.floor(p.y) + 1 : 0;
    var side = p.x < Rules.WIDTH / 3 ? '왼쪽' : p.x > Rules.WIDTH * 2 / 3 ? '오른쪽' : '가운데';
    return (depth ? depth + 'm' : '지상') + ' · ' + side;
  }
  function openWarp() {
    if (!state || (modal && modal !== 'mtWarpModal')) return;
    if (!state.warps.length) { toast('📍 워프석이 없어요. 상점에서 살 수 있어요.'); return; }
    if (state.inCore) { toast('⭐ 지구의 중심에서는 워프석을 쓸 수 없어요.'); return; }
    renderWarp();
    openModal('mtWarpModal');
  }
  function renderWarp() {
    $('mtWarpTitle').textContent = '📍 지정 워프석 (' + state.warps.length + '개)';
    var list = $('mtWarpList');
    list.textContent = '';
    state.warps.forEach(function (p, i) {
      var li = el('li');
      li.append(el('span', null, (i + 1) + '번 · ' + (p ? '📍 ' + warpPlace(p) : '아직 저장 안 함')));
      if (p) {
        li.append(button('가기', 'mt-buy', function () {
          if (!Game.useWarp(state, i).ok) return;
          closeModal('mtWarpModal');
          sound.recall();
          renderer.cam = null;
          toast('📍 ' + warpPlace(p) + ' 자리로 순간이동했어요!');
          saveNow();
        }));
      } else {
        li.append(button('여기 저장', 'mt-buy', function () {
          askConfirm('📍 여기를 저장할까요?', (i + 1) + '번 워프석에 지금 자리(' + warpPlace(state.car) + ')를 저장해요. 한 번 저장하면 바꿀 수 없어요.', function () {
            Game.saveWarp(state, i);
            saveNow(true);
            toast('📍 ' + (i + 1) + '번 워프석에 ' + warpPlace(state.car) + ' 자리를 저장했어요!');
          });
        }));
      }
      li.append(button('버리기', 'mt-buy mt-drop', function () {
        askConfirm('🗑 ' + (i + 1) + '번 워프석을 버릴까요?', (p ? '저장한 자리(' + warpPlace(p) + ')도 함께 사라져요. ' : '') + '돈은 돌려받지 못해요.', function () {
          Game.dropWarp(state, i);
          saveNow(true);
          if (state.warps.length) openWarp();
          toast('🗑 워프석을 버렸어요.');
        });
      }));
      list.append(li);
    });
  }
  $('mtWarpClose').addEventListener('click', function () { closeModal('mtWarpModal'); });

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
          else if (e.reason === 'guest-treasure') toast('🏆 이 보물은 방장 것이라 캘 수 없어요. 내 땅의 보물을 찾아보세요!', 3500);
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
        case 'hidden':
          pendingHidden.push(e.n);
          if (!modal) showHidden();
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
  $('mtEndingContinue').addEventListener('click', function () { closeModal('mtEndingModal'); showHidden(); });

  // 🤫 히든 엔딩: 보물 엔딩과 같은 순간에 생기면 앞 창을 닫은 뒤 차례로 보여 준다.
  var pendingHidden = [];
  var HIDDEN_INFO = {
    1: { emoji: '🕳️', title: '히든 엔딩 1 — 지각 정복', text: '300m까지 팔 수 있는 땅을 한 칸도 남김없이 다 팠어요! 지각이 텅 비었어요.', badge: '🕳️ 지각 정복' },
    2: { emoji: '🌋', title: '히든 엔딩 2 — 지구 속 정복', text: '1000m까지 팔 수 있는 땅을 전부 다 팠어요!! 지구 속이 텅 비었어요. 정말 대단해요!', badge: '🌋 지구 속 정복' }
  };
  function showHidden() {
    if (!pendingHidden.length || !state) return;
    var n = pendingHidden.shift();
    var info = HIDDEN_INFO[n];
    var count = Save.addHidden(n);
    $('mtHiddenEmoji').textContent = info.emoji;
    $('mtHiddenTitle').textContent = info.title;
    $('mtHiddenText').textContent = info.text;
    $('mtHiddenTime').textContent = fmt.time(n === 1 ? state.hidden1Time : state.hidden2Time);
    $('mtHiddenCount').textContent = info.badge + ' 배지 ' + count + '번째!';
    sound.treasure();
    renderer.shake = 0.8;
    openModal('mtHiddenModal');
    saveNow();
  }
  $('mtHiddenContinue').addEventListener('click', function () { closeModal('mtHiddenModal'); showHidden(); });

  // 📖 설명 창: 처음 들어오면 한 번 뜨고, ❓ 설명 단추로 언제든 다시 본다. 닫으면 원래 열려 있던 창으로 돌아간다.
  var guideReturn = null;
  (function fillGuide() {
    var tbody = $('mtGuideOres');
    var layer = -1;
    for (var i = 1; i < Rules.ORES.length; i++) {
      var ore = Rules.ORES[i];
      var l = Rules.layerOf(ore.minDepth);
      if (l !== layer) {
        layer = l;
        var head = el('tr', 'mt-guide-layer');
        var cell = el('td', null, Rules.LAYERS[l].name + (l ? ' (보물을 찾은 뒤에 갈 수 있어요)' : ''));
        cell.colSpan = 3;
        head.append(cell);
        tbody.append(head);
      }
      var tr = el('tr');
      var name = el('td');
      var dot = el('i', 'mt-ore-dot'); dot.style.background = ore.color;
      name.append(dot, document.createTextNode(' ' + ore.name));
      tr.append(name, el('td', null, ore.minDepth + 'm~'), el('td', null, fmt.money(ore.value)));
      tbody.append(tr);
    }
    $('mtGuideGacha').textContent = '🎰 일반 뽑기(' + fmt.money(Rules.GACHA.normal.price) + '): 석탄~다이아몬드가 나와요. 보물을 찾기 전까지만 할 수 있어요. '
      + '🌟 특수 뽑기(' + fmt.money(Rules.GACHA.special.price) + '): 페리도트~별의 심장이 나와요. 보물을 찾은 뒤부터 할 수 있어요. 뽑은 광석은 가방에 들어가요.';
  })();
  function openGuide() {
    if (modal === 'mtGuideModal') return;
    guideReturn = modal;
    openModal('mtGuideModal');
    $('mtGuideClose').focus();
  }
  function closeGuide() {
    Save.setGuideSeen();
    closeModal('mtGuideModal');
    var back = guideReturn;
    guideReturn = null;
    if (back) openModal(back);
  }
  $('mtGuideButton').addEventListener('click', function () { if (ranking.isOpen()) ranking.close(); openGuide(); });
  $('mtGuideClose').addEventListener('click', closeGuide);
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
    if (Link.get()) { Link.end('destroyed'); Link.clear(); updateLinkButton(); } // 연동된 다른 기기에서도 끝난다
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
    if (document.hidden) { saveNow(); pause(); sound.pause(); if (Link.dirty()) doSync(false, true); }
  });
  window.addEventListener('pagehide', function () { saveNow(); if (Link.dirty()) doSync(false, true); });

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
      if (modal === 'mtWarpModal') { closeModal('mtWarpModal'); return; }
      if (modal === 'mtMultiModal') { closeModal('mtMultiModal'); return; }
      if (modal === 'mtEndingModal') { $('mtEndingContinue').click(); return; }
      if (modal === 'mtHiddenModal') { $('mtHiddenContinue').click(); return; }
      if (modal === 'mtGuideModal') { closeGuide(); return; }
      if (panelKey) { closePanel(); return; }
      pause();
      return;
    }
    if (modal || ranking.isOpen()) return;
    var key = KEYS[e.code];
    if (key) { input[key] = true; e.preventDefault(); return; }
    if (e.code === 'KeyQ') toggleWide();
    if (e.code === 'KeyR') askRecall();
    if (e.code === 'KeyT') openWarp();
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
    b.addEventListener('click', function () { sound.unlock(); var action = b.getAttribute('data-action'); if (action === 'wide') toggleWide(); else if (action === 'instant') instantSell(); else if (action === 'warp') openWarp(); else askRecall(); });
  });
  if (window.matchMedia && matchMedia('(pointer: coarse)').matches) {
    $('mtHelp').textContent = '◀ ▶ 이동·옆으로 파기 · ▼ 아래로 파기 · ▲ 날기(날면서 ◀ ▶로 옆도 파요) · 💥 넓게/1칸 · 🌀 귀환석 · 📍 워프석 · 💸 즉시 팔기';
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
      syncTimer += dt;
      if (syncTimer >= SYNC_EVERY && Link.dirty()) doSync();
      if (panelKey) renderPanelThrottled(dt);
    }
    if (state) {
      multi.tick(dt); // 👫 멈춤 창이 떠 있어도 친구 차·땅은 계속 받는다
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
    var sig = [panelKey, state.money, state.debt, Math.ceil(state.fuel), Math.ceil(state.hp), Game.bagCount(state), state.recall, state.warps.length, state.instant, state.ticket, state.autos.length, JSON.stringify(state.levels)].join('|');
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

  updateLinkButton();
  showStart(false);
  if (!Save.guideSeen()) openGuide();
  requestAnimationFrame(frame);
})(window.MT = window.MT || {});
