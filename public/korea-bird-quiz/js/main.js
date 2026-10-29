// ===== main.js =====
// 한국 새 맞히기 화면: 시작 → 10문제(사진 + 4지선다, 힌트) → 결과, 맞힌 새는 도감에.
// localStorage: 'korea-bird-quiz:dex'(맞힌 새 id 목록), 'korea-bird-quiz:best'(최고 점수). 글은 모두 textContent로만 넣는다.
(function (M) {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var DEX_KEY = 'korea-bird-quiz:dex';
  var BEST_KEY = 'korea-bird-quiz:best';
  var screens = { start: $('startScreen'), play: $('playScreen'), end: $('endScreen'), dex: $('dexScreen') };
  var maxScore = M.QUESTION_COUNT * M.scoreFor(0);

  var quiz = [];
  var index = 0;
  var score = 0;
  var hintsSeen = 0;   // 이번 문제에서 직접 누른 힌트 수
  var shownHints = 0;  // 화면에 보이는 힌트 수(사진이 없으면 하나는 공짜로 보여 줌)
  var answered = false;
  var right = 0;
  var dexReturn = 'start';

  function get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function set(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* 무시 */ } }
  function dex() {
    try { var list = JSON.parse(get(DEX_KEY) || '[]'); return Array.isArray(list) ? list : []; } catch (e) { return []; }
  }
  function addDex(id) {
    var list = dex();
    if (list.indexOf(id) < 0) { list.push(id); set(DEX_KEY, JSON.stringify(list)); return true; }
    return false;
  }

  function show(name) {
    Object.keys(screens).forEach(function (k) { screens[k].hidden = k !== name; });
    window.scrollTo(0, 0);
  }

  // ----- 사진 찾기: img/<file>.jpg → .png → .webp → .jpeg 순서로 있는 것을 쓴다(찾은 주소는 기억) -----
  var photoCache = {};
  function findPhoto(s, done) {
    if (s.id in photoCache) return done(photoCache[s.id]);
    var i = 0;
    (function tryNext() {
      if (i >= M.EXTENSIONS.length) { photoCache[s.id] = null; return done(null); }
      var url = 'img/' + s.file + '.' + M.EXTENSIONS[i++];
      var img = new Image();
      img.onload = function () { photoCache[s.id] = url; done(url); };
      img.onerror = tryNext;
      img.src = url;
    })();
  }

  // ----- 시작 화면 -----
  function refreshStart() {
    $('qCount').textContent = M.QUESTION_COUNT;
    var best = Number(get(BEST_KEY)) || 0;
    $('bestLine').textContent = best ? '🏅 내 최고 점수: ' + best + '점' : '';
    $('dexLine').textContent = '📘 도감 ' + dex().length + ' / ' + M.SPECIES.length + '종';
  }
  refreshStart();

  function start() {
    quiz = M.makeQuiz(M.QUESTION_COUNT);
    index = 0; score = 0; right = 0;
    $('scoreNow').textContent = '0점';
    show('play');
    ask();
  }

  function ask() {
    var q = quiz[index];
    answered = false;
    hintsSeen = 0;
    shownHints = 0;
    $('qNo').textContent = (index + 1) + ' / ' + quiz.length;
    $('feedback').textContent = '';
    $('feedback').className = 'feedback';
    $('hints').textContent = '';
    $('nextBtn').hidden = true;
    $('hintBtn').hidden = false;
    $('hintBtn').disabled = false;
    $('credit').textContent = q.answer.credit ? '사진: ' + q.answer.credit : '';
    $('photo').hidden = true;
    $('noPhoto').hidden = true;
    var asking = index;
    findPhoto(q.answer, function (url) {
      if (asking !== index) return;
      if (url) {
        $('photo').src = url;
        $('photo').hidden = false;
      } else {
        $('noPhoto').hidden = false;
        if (shownHints === 0) showHint(false); // 사진이 없으면 힌트 하나는 공짜
      }
    });
    var box = $('choices');
    box.textContent = '';
    q.choices.forEach(function (s) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice';
      btn.textContent = s.name;
      btn.addEventListener('click', function () { choose(s, btn); });
      box.appendChild(btn);
    });
  }

  function showHint(paid) {
    var q = quiz[index];
    if (shownHints >= q.answer.hints.length) return;
    if (paid) hintsSeen++;
    var li = document.createElement('li');
    li.textContent = q.answer.hints[shownHints++];
    $('hints').appendChild(li);
    if (shownHints >= q.answer.hints.length) $('hintBtn').disabled = true;
  }

  function choose(s, btn) {
    if (answered) return;
    answered = true;
    var q = quiz[index];
    var ok = s === q.answer;
    document.querySelectorAll('.choice').forEach(function (b) {
      b.disabled = true;
      if (b.textContent === q.answer.name) b.classList.add('good');
    });
    if (!ok) btn.classList.add('bad');
    if (ok) {
      var pts = M.scoreFor(hintsSeen);
      score += pts; right++;
      var isNew = addDex(q.answer.id);
      $('feedback').textContent = '⭕ 정답! +' + pts + '점' + (isNew ? ' · 📘 도감에 새로 등록!' : '');
      $('feedback').className = 'feedback good';
    } else {
      $('feedback').textContent = '❌ 아쉬워요! 정답은 "' + q.answer.name + '"';
      $('feedback').className = 'feedback bad';
    }
    $('scoreNow').textContent = score + '점';
    // 답을 고른 뒤에는 남은 힌트를 모두 펼쳐서 특징을 배워 가게 한다.
    while (shownHints < q.answer.hints.length) showHint(false);
    $('hintBtn').hidden = true;
    $('nextBtn').hidden = false;
    $('nextBtn').textContent = index + 1 >= quiz.length ? '결과 보기 →' : '다음 문제 →';
    $('nextBtn').focus();
  }

  function next() {
    index++;
    if (index >= quiz.length) return end();
    ask();
  }

  function end() {
    var best = Number(get(BEST_KEY)) || 0;
    if (score > best) set(BEST_KEY, String(score));
    $('finalScore').textContent = score;
    $('finalMax').textContent = maxScore;
    $('finalLine').textContent = quiz.length + '문제 중 ' + right + '문제를 맞혔어요!' +
      (score > best && best ? ' 🏅 최고 점수 새 기록!' : '') +
      (right === quiz.length ? ' 한국 새 박사 인정! 👑' : '');
    show('end');
  }

  // ----- 도감 -----
  function openDex(from) {
    dexReturn = from;
    var caught = dex();
    $('dexCount').textContent = caught.length + ' / ' + M.SPECIES.length;
    var grid = $('dexGrid');
    grid.textContent = '';
    M.SPECIES.forEach(function (s) {
      var have = caught.indexOf(s.id) >= 0;
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'dex-card' + (have ? '' : ' locked');
      var pic = document.createElement('div'); pic.className = 'dex-pic';
      var name = document.createElement('b'); name.textContent = have ? s.name : '???';
      var where = document.createElement('small'); where.textContent = have ? s.where : '아직 못 맞혔어요';
      card.appendChild(pic); card.appendChild(name); card.appendChild(where);
      if (have) {
        pic.textContent = '🐦';
        findPhoto(s, function (url) { if (url) { pic.textContent = ''; pic.style.backgroundImage = 'url("' + url + '")'; } });
        card.addEventListener('click', function () { openCard(s); });
      } else {
        pic.textContent = '❔';
        card.disabled = true;
      }
      grid.appendChild(card);
    });
    show('dex');
  }

  function openCard(s) {
    $('dexName').textContent = s.name;
    $('dexSci').textContent = s.sci + ' · ' + s.where;
    $('dexCredit').textContent = s.credit ? '사진: ' + s.credit : '';
    var box = $('dexPhotoBox');
    box.textContent = '🐦';
    box.style.backgroundImage = '';
    findPhoto(s, function (url) { if (url) { box.textContent = ''; box.style.backgroundImage = 'url("' + url + '")'; } });
    var list = $('dexHints');
    list.textContent = '';
    s.hints.forEach(function (h) { var li = document.createElement('li'); li.textContent = h; list.appendChild(li); });
    $('dexDialog').hidden = false;
    $('dexClose').focus();
  }
  function closeCard() { $('dexDialog').hidden = true; }

  $('startBtn').addEventListener('click', start);
  $('hintBtn').addEventListener('click', function () { if (!answered) showHint(true); });
  $('nextBtn').addEventListener('click', next);
  $('againBtn').addEventListener('click', function () { refreshStart(); show('start'); });
  $('endDexBtn').addEventListener('click', function () { openDex('end'); });
  $('dexBtn').addEventListener('click', function () {
    if (!screens.play.hidden && !confirm('문제를 풀던 중이에요. 그만두고 도감을 볼까요?')) return;
    openDex(screens.end.hidden ? 'start' : 'end');
  });
  $('dexBack').addEventListener('click', function () { refreshStart(); show(dexReturn); });
  $('dexClose').addEventListener('click', closeCard);
  $('dexDialog').addEventListener('click', function (e) { if (e.target === $('dexDialog')) closeCard(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeCard();
    if (!screens.play.hidden && !answered && e.key >= '1' && e.key <= '4') {
      var btns = document.querySelectorAll('.choice');
      if (btns[e.key - 1]) btns[e.key - 1].click();
    }
  });
})(window.KoreaBird);
