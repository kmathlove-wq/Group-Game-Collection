// ===== main.js =====
// 초이스 게임 진행 화면: 장면 그림(Canvas) + 이야기 글 + 선택지 단추, 시간 제한 선택, 실패·엔딩 카드, 엔딩 모음.
// localStorage: 'choice-game:seen'({ endings: [...], fails: [...] }), 'choice-game:sound'('off'면 소리 끔).
(function (C) {
  'use strict';
  var Story = C.Story, Scenes = C.Scenes;
  var $ = function (id) { return document.getElementById(id); };
  var SEEN_KEY = 'choice-game:seen', SOUND_KEY = 'choice-game:sound';
  var CHOICE_DELAY = 0.6; // 장면이 조금 움직인 뒤 선택지가 나타남(초)
  var CARD_DELAY = 1.7;   // 실패·엔딩 장면을 보여 준 뒤 카드가 뜸(초)

  var canvas = $('stage');
  var ctx = canvas.getContext('2d');
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Scenes.W * dpr; canvas.height = Scenes.H * dpr;

  var game = Story.create();
  var startedAt = performance.now();
  var shownChoices = false;
  var cardShown = false;
  var deadline = 0;

  function get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function set(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* 무시 */ } }
  function seen() {
    try {
      var s = JSON.parse(get(SEEN_KEY) || '{}');
      return { endings: Array.isArray(s.endings) ? s.endings : [], fails: Array.isArray(s.fails) ? s.fails : [] };
    } catch (e) { return { endings: [], fails: [] }; }
  }
  function remember(kind, id) {
    var s = seen();
    if (s[kind].indexOf(id) >= 0) return false;
    s[kind].push(id);
    set(SEEN_KEY, JSON.stringify(s));
    return true;
  }

  // ----- 소리 -----
  var muted = get(SOUND_KEY) === 'off';
  var audio = null;
  function beep(notes, type) {
    if (muted) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var t = audio.currentTime;
      notes.forEach(function (n, i) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.type = type || 'triangle'; o.frequency.value = n;
        g.gain.setValueAtTime(0.0001, t + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.2, t + i * 0.12 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.25);
        o.connect(g); g.connect(audio.destination);
        o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.28);
      });
    } catch (e) { /* 소리가 안 돼도 게임은 계속 */ }
  }
  function refreshSound() {
    $('soundBtn').textContent = muted ? '🔇' : '🔊';
    $('soundBtn').setAttribute('aria-label', muted ? '소리 켜기' : '소리 끄기');
  }
  refreshSound();

  // ----- 장면 바꾸기 -----
  var lead = ''; // 방금 고른 선택지의 들어가는 말(story.js의 lead)
  function enter() {
    var node = Story.current(game);
    startedAt = performance.now();
    shownChoices = false;
    cardShown = false;
    $('card').hidden = true;
    $('choices').textContent = '';
    $('timer').hidden = true;
    $('story').textContent = node.type === 'choice' ? (lead ? lead + ' ' : '') + node.text : '';
    lead = ''; // 들어가는 말은 이번 한 번만(다시 하기·시간 초과 땐 없음)
    deadline = node.type === 'choice' && node.timer ? startedAt + node.timer * 1000 : 0;
    if (deadline) { showChoices(); $('timer').hidden = false; beep([880, 880], 'square'); }
    if (node.type === 'fail') beep([300, 240, 180], 'sawtooth');
    if (node.type === 'ending') beep([523, 659, 784, 1046]);
    refreshProgress();
  }

  function showChoices() {
    if (shownChoices) return;
    shownChoices = true;
    var node = Story.current(game);
    var box = $('choices');
    box.textContent = '';
    box.className = 'choices' + (node.choices.length === 1 ? ' one' : '');
    node.choices.forEach(function (c, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice';
      var icon = document.createElement('span'); icon.className = 'icon'; icon.textContent = c.icon;
      var label = document.createElement('span'); label.className = 'label'; label.textContent = c.label;
      var key = document.createElement('kbd'); key.textContent = i < 9 ? String(i + 1) : i === 9 ? '0' : ''; // 10번째는 0 키
      btn.appendChild(key); btn.appendChild(icon); btn.appendChild(label);
      btn.addEventListener('click', function () { pick(i); });
      box.appendChild(btn);
    });
  }

  function pick(i) {
    var node = Story.current(game);
    if (node.type !== 'choice' || !shownChoices || !node.choices[i]) return;
    beep([660]);
    lead = node.choices[i].lead || '';
    Story.choose(game, i);
    enter();
  }

  function showCard() {
    cardShown = true;
    var node = Story.current(game);
    var isNew = remember(node.type === 'ending' ? 'endings' : 'fails', node.art);
    $('cardTag').textContent = node.type === 'ending' ? '🏆 엔딩' : '💥 실패';
    $('card').className = 'card ' + node.type;
    $('cardTitle').textContent = node.title;
    $('cardText').textContent = node.text;
    $('cardNew').textContent = isNew ? (node.type === 'ending' ? '✨ 새 엔딩을 찾았어요!' : '📕 새 실패 장면을 모았어요!') : '';
    $('retryBtn').hidden = node.type !== 'fail';
    $('restartBtn').textContent = node.type === 'ending' ? '처음부터 다시' : '처음부터';
    $('card').hidden = false;
    (node.type === 'fail' ? $('retryBtn') : $('restartBtn')).focus();
    refreshProgress();
  }

  function refreshProgress() {
    var s = seen();
    $('progress').textContent = '🏆 엔딩 ' + s.endings.length + '/' + Story.ENDING_IDS.length + ' · 💥 실패 ' + s.fails.length + '/' + Story.FAIL_IDS.length;
  }

  // ----- 그림 그리기 -----
  function frame(now) {
    var node = Story.current(game);
    var t = (now - startedAt) / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, Scenes.W, Scenes.H);
    var art = Scenes.ART[node.art];
    if (art) art(ctx, t);
    if (node.type === 'ending') Scenes.endingStamp(ctx, t);
    if (node.type === 'choice') {
      if (!shownChoices && t >= CHOICE_DELAY) showChoices();
      if (deadline) {
        var left = Math.max(0, deadline - now);
        $('timerBar').style.width = (left / (node.timer * 1000) * 100) + '%';
        if (left <= 0) { deadline = 0; Story.timeout(game); enter(); }
      }
    } else if (!cardShown && t >= CARD_DELAY) {
      showCard();
    }
    requestAnimationFrame(frame);
  }

  // ----- 엔딩 모음 -----
  function openCollection() {
    var s = seen();
    var list = $('collection');
    list.textContent = '';
    function add(id, kind) {
      var node = Story.NODES[id];
      var have = s[kind].indexOf(id) >= 0;
      var li = document.createElement('li');
      li.className = have ? 'have' : 'locked';
      var b = document.createElement('b'); b.textContent = have ? node.title : '???';
      var p = document.createElement('small'); p.textContent = have ? node.text : (kind === 'endings' ? '아직 못 본 엔딩이에요.' : '아직 못 본 실패예요.');
      li.appendChild(b); li.appendChild(p);
      list.appendChild(li);
    }
    var h1 = document.createElement('li'); h1.className = 'head'; h1.textContent = '🏆 엔딩 ' + s.endings.length + ' / ' + Story.ENDING_IDS.length; list.appendChild(h1);
    Story.ENDING_IDS.forEach(function (id) { add(id, 'endings'); });
    var h2 = document.createElement('li'); h2.className = 'head'; h2.textContent = '💥 실패 장면 ' + s.fails.length + ' / ' + Story.FAIL_IDS.length; list.appendChild(h2);
    Story.FAIL_IDS.forEach(function (id) { add(id, 'fails'); });
    $('collectionDialog').hidden = false;
    $('collectionClose').focus();
  }

  $('retryBtn').addEventListener('click', function () { Story.retry(game); enter(); });
  $('restartBtn').addEventListener('click', function () { game = Story.create(); enter(); });
  $('cardList').addEventListener('click', openCollection);
  $('listBtn').addEventListener('click', openCollection);
  $('collectionClose').addEventListener('click', function () { $('collectionDialog').hidden = true; });
  $('collectionDialog').addEventListener('click', function (e) { if (e.target === $('collectionDialog')) $('collectionDialog').hidden = true; });
  $('soundBtn').addEventListener('click', function () { muted = !muted; set(SOUND_KEY, muted ? 'off' : 'on'); refreshSound(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') $('collectionDialog').hidden = true;
    if (!$('collectionDialog').hidden) return;
    var n = Number(e.key);
    if (e.key >= '1' && e.key <= '9') pick(n - 1);
    if (e.key === '0') pick(9);
    if (e.key === ' ' && Story.current(game).choices && Story.current(game).choices.length === 1) { e.preventDefault(); pick(0); }
  });
  // 휴대폰에서 선택지가 하나뿐인 빨리 누르기 장면은 그림을 눌러도 된다
  canvas.addEventListener('pointerdown', function () {
    var node = Story.current(game);
    if (node.type === 'choice' && node.choices.length === 1) pick(0);
  });

  enter();
  requestAnimationFrame(frame);
})(window.Choice);
