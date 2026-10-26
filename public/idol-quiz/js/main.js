// ===== main.js =====
// 아이돌 초성퀴즈 화면: 시작 → 15문제(문제마다 15초) → 결과·순위.
// 고른 종류는 localStorage 'idol-quiz:kind'에 기억한다. 글은 모두 textContent로만 넣는다.
(function (Q) {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var KIND_KEY = 'idol-quiz:kind';
  var screens = { start: $('startScreen'), play: $('playScreen'), end: $('endScreen') };
  var ranking = window.GroupRanking.create({ slug: 'idol-quiz', unit: '점', top: 50 });

  var kind = 'all';
  var questions = [];
  var index = 0;
  var score = 0;
  var hints = 0;        // 이번 문제에 쓴 힌트 수(0~2)
  var deadline = 0;     // 이번 문제가 끝나는 시각(ms)
  var timer = null;
  var waiting = false;  // 정답·넘기기 뒤 다음 문제로 가는 동안
  var results = [];     // { group, ok, points }
  var submitted = false;

  function get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function set(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* 무시 */ } }

  function show(name) {
    Object.keys(screens).forEach(function (k) { screens[k].hidden = k !== name; });
  }

  $('qCount').textContent = Q.QUESTION_COUNT;
  $('qSec').textContent = Q.SECONDS;

  function setKind(k) {
    kind = ['all', 'girl', 'boy'].indexOf(k) >= 0 ? k : 'all';
    set(KIND_KEY, kind);
    document.querySelectorAll('.kind-btn').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.kind === kind)); });
  }
  document.querySelectorAll('.kind-btn').forEach(function (b) {
    b.addEventListener('click', function () { setKind(b.dataset.kind); });
  });
  setKind(get(KIND_KEY) || 'all');

  function start() {
    questions = Q.pickQuestions(kind, Q.QUESTION_COUNT);
    index = 0; score = 0; results = []; submitted = false;
    $('scoreNow').textContent = '0점';
    show('play');
    ask();
  }

  function ask() {
    var g = questions[index];
    hints = 0;
    waiting = false;
    $('qNo').textContent = (index + 1) + ' / ' + questions.length;
    $('chosung').textContent = Q.chosung(g.name);
    $('chosung').className = 'chosung';
    $('hint').textContent = '';
    $('feedback').textContent = '';
    $('feedback').className = 'feedback';
    $('hintBtn').disabled = false;
    $('answer').value = '';
    $('answer').disabled = false;
    $('answer').focus();
    deadline = Date.now() + Q.SECONDS * 1000;
    clearInterval(timer);
    timer = setInterval(tick, 100);
    tick();
  }

  function tick() {
    var left = Math.max(0, deadline - Date.now());
    $('timerBar').style.width = (left / (Q.SECONDS * 1000) * 100) + '%';
    $('timerBar').classList.toggle('low', left < 5000);
    $('secLeft').textContent = Math.ceil(left / 1000) + '초';
    if (left <= 0) finishQuestion(false, '⏰ 시간 끝!');
  }

  function finishQuestion(ok, message) {
    if (waiting) return;
    waiting = true;
    clearInterval(timer);
    var g = questions[index];
    var points = ok ? Q.scoreFor((deadline - Date.now()) / 1000, hints) : 0;
    score += points;
    results.push({ group: g, ok: ok, points: points });
    $('scoreNow').textContent = score.toLocaleString('ko-KR') + '점';
    $('chosung').textContent = g.name;
    $('chosung').className = 'chosung ' + (ok ? 'good' : 'bad');
    $('feedback').textContent = ok ? '⭕ 정답! +' + points + '점' : message + ' 정답은 "' + g.name + '"';
    $('feedback').className = 'feedback ' + (ok ? 'good' : 'bad');
    $('answer').disabled = true;
    $('hintBtn').disabled = true;
    setTimeout(next, ok ? 1100 : 1800);
  }

  function next() {
    index++;
    if (index >= questions.length) end();
    else ask();
  }

  $('answerForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (waiting) return;
    var typed = $('answer').value;
    if (!Q.normalize(typed)) return;
    if (Q.isCorrect(questions[index], typed)) return finishQuestion(true);
    $('feedback').textContent = '❌ 아니에요. 다시 써 보세요!';
    $('feedback').className = 'feedback bad';
    $('answer').select();
    var input = $('answer');
    input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake');
  });

  $('hintBtn').addEventListener('click', function () {
    if (waiting || hints >= 2) return;
    hints++;
    var g = questions[index];
    $('hint').textContent = hints === 1
      ? '💡 ' + Q.hintText(g)
      : '💡 ' + Q.hintText(g) + ' · 첫 글자 "' + Q.reveal(g.name, 1) + '"';
    if (hints >= 2) $('hintBtn').disabled = true;
    $('answer').focus();
  });
  $('skipBtn').addEventListener('click', function () { finishQuestion(false, '⏭ 넘겼어요.'); });

  function end() {
    show('end');
    var right = results.filter(function (r) { return r.ok; }).length;
    $('finalScore').textContent = score.toLocaleString('ko-KR');
    $('finalLine').textContent = results.length + '문제 중 ' + right + '문제를 맞혔어요!' +
      (right === results.length ? ' 완벽해요! 👑' : right >= results.length * 0.7 ? ' 아이돌 박사네요! ✨' : '');
    $('endRankBtn').hidden = score <= 0;
    var list = $('review');
    list.textContent = '';
    results.forEach(function (r) {
      var li = document.createElement('li');
      li.className = r.ok ? 'good' : 'bad';
      var a = document.createElement('span'); a.className = 'cho'; a.textContent = Q.chosung(r.group.name);
      var b = document.createElement('span'); b.className = 'nm'; b.textContent = (r.ok ? '⭕ ' : '❌ ') + r.group.name;
      var c = document.createElement('span'); c.className = 'pt'; c.textContent = r.points ? '+' + r.points : '';
      li.appendChild(a); li.appendChild(b); li.appendChild(c);
      list.appendChild(li);
    });
  }

  $('startBtn').addEventListener('click', start);
  $('againBtn').addEventListener('click', function () { show('start'); });
  $('endRankBtn').addEventListener('click', function () {
    if (submitted) return ranking.show(0);
    submitted = true;
    $('endRankBtn').hidden = true;
    ranking.show(score);
  });
  $('rankBtn').addEventListener('click', function () { ranking.show(0); });

  // 다른 탭으로 가면 시간이 흐르지 않게 남은 시간을 멈춰 둔다.
  var pausedLeft = null;
  document.addEventListener('visibilitychange', function () {
    if (screens.play.hidden || waiting) return;
    if (document.hidden) { pausedLeft = deadline - Date.now(); clearInterval(timer); }
    else if (pausedLeft != null) { deadline = Date.now() + pausedLeft; pausedLeft = null; timer = setInterval(tick, 100); }
  });
})(window.IdolQuiz);
