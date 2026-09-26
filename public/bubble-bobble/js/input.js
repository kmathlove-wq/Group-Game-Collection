// ===== input.js =====
// 키보드 입력 관리. 매 프레임 끝에 BB.input.update() 를 부르면
// "이번 프레임에 처음 눌림(pressed)" 상태가 초기화된다.
(function (BB) {
  var KEYMAP = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'jump',
    KeyA: 'left',
    KeyD: 'right',
    KeyW: 'jump',
    Space: 'jump',        // 스페이스 = 점프
    KeyZ: 'bubble',       // 마우스 대신 쓸 수 있는 공격키(예비)
    KeyX: 'bubble',
    KeyM: 'mute',
    KeyP: 'pause',
    Enter: 'start'
  };

  var held = {};      // 지금 눌려있는가
  var pressed = {};   // 이번 프레임에 처음 눌렸는가

  // 순위 창·순위표(data-ui) 안의 입력칸·버튼을 쓰는 중이면 게임 조작으로 가로채지 않는다
  function isUiTarget(e) {
    return !!(e.target && e.target.closest && e.target.closest('[data-ui]'));
  }

  window.addEventListener('keydown', function (e) {
    if (isUiTarget(e)) return;
    var action = KEYMAP[e.code];
    if (!action) return;
    e.preventDefault();
    if (!held[action]) pressed[action] = true;
    held[action] = true;
  });

  window.addEventListener('keyup', function (e) {
    if (isUiTarget(e)) return;
    var action = KEYMAP[e.code];
    if (!action) return;
    e.preventDefault();
    held[action] = false;
  });

  // 창을 벗어나면 눌린 키 해제 (키가 눌린 채로 멈추는 버그 방지)
  window.addEventListener('blur', function () {
    for (var k in held) held[k] = false;
  });

  // 마우스 왼쪽 클릭 = 공격(거품)
  window.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    if (e.target && e.target.closest && e.target.closest('#touch')) return;
    if (isUiTarget(e)) return;
    setAct('bubble', true);
  });
  window.addEventListener('mouseup', function (e) {
    if (e.button !== 0) return;
    held.bubble = false;
  });
  // 오른쪽 클릭 메뉴가 게임 위에서 뜨지 않게
  window.addEventListener('contextmenu', function (e) { if (!isUiTarget(e)) e.preventDefault(); });

  function setAct(a, on) {
    if (on) { if (!held[a]) pressed[a] = true; held[a] = true; }
    else held[a] = false;
  }
  BB._setAct = setAct;

  // ===== 모바일 터치 조작 =====
  var isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  function setupTouch() {
    var pad = document.getElementById('touch');
    if (!pad) return;
    if (isTouch) pad.hidden = false;
    var btns = pad.querySelectorAll('.tbtn');
    btns.forEach(function (b) {
      var act = b.getAttribute('data-act');
      function on(e) { e.preventDefault(); setAct(act, true); }
      function off(e) { e.preventDefault(); setAct(act, false); }
      b.addEventListener('touchstart', on, { passive: false });
      b.addEventListener('touchend', off, { passive: false });
      b.addEventListener('touchcancel', off, { passive: false });
      b.addEventListener('mousedown', on);
      b.addEventListener('mouseup', off);
      b.addEventListener('mouseleave', off);
    });
    // 화면 아무 곳이나 탭하면 시작/계속 (타이틀·게임오버)
    var stage = document.getElementById('stage');
    if (stage) stage.addEventListener('touchstart', function () {
      var s = BB.game && BB.game.state;
      if (s === 'TITLE' || s === 'GAME_OVER' || s === 'ENDING') setAct('start', true);
    }, { passive: true });
  }
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', setupTouch);
  } else {
    setupTouch();
  }

  BB.input = {
    held: function (a) { return !!held[a]; },
    pressed: function (a) { return !!pressed[a]; },
    update: function () { for (var k in pressed) delete pressed[k]; }
  };
})(window.BB);
