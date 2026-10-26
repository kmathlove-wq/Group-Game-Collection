// ===== main.js =====
// 이상형 월드컵 화면: 주제 고르기 → 대결 → 결과(+모두의 1위 통계).
// 고른 판 크기는 localStorage 'worldcup:size'에 기억한다. 글은 모두 textContent로만 넣는다.
(function (W) {
  'use strict';
  var Bracket = W.Bracket;
  var SIZE_KEY = 'worldcup:size';

  var $ = function (id) { return document.getElementById(id); };
  var screens = { pick: $('pickScreen'), match: $('matchScreen'), result: $('resultScreen') };
  var homeBtn = $('homeBtn');
  var picks = [$('pickA'), $('pickB')];

  var size = 16;
  var topic = null;
  var bracket = null;
  var busy = false; // 고르는 애니메이션 동안 두 번 눌리지 않게

  function get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function set(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* 무시 */ } }

  // 받침이 있으면 a(을·이), 없으면 b(를·가). 한글이 아니면 받침 없음으로 본다.
  function josa(word, a, b) {
    var code = word.charCodeAt(word.length - 1) - 0xac00;
    return word + (code >= 0 && code <= 11171 && code % 28 ? a : b);
  }

  function show(name) {
    Object.keys(screens).forEach(function (k) { screens[k].hidden = k !== name; });
    homeBtn.hidden = name === 'pick';
    window.scrollTo(0, 0);
  }

  // ----- 1) 주제 고르기 -----
  function setSize(n) {
    size = n === 8 ? 8 : 16;
    set(SIZE_KEY, String(size));
    document.querySelectorAll('.size-btn').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(Number(btn.dataset.size) === size));
    });
  }
  document.querySelectorAll('.size-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { setSize(Number(btn.dataset.size)); });
  });
  setSize(Number(get(SIZE_KEY)) || 16);

  var grid = $('topicGrid');
  W.TOPICS.forEach(function (t) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'topic-card';
    var em = document.createElement('span'); em.className = 'emoji'; em.textContent = t.emoji;
    var title = document.createElement('b'); title.textContent = t.title;
    var sample = document.createElement('small');
    sample.textContent = t.items.slice(0, 4).map(function (i) { return i.emoji; }).join(' ') + ' …';
    btn.appendChild(em); btn.appendChild(title); btn.appendChild(sample);
    btn.addEventListener('click', function () { start(t); });
    grid.appendChild(btn);
  });

  // ----- 2) 대결 -----
  function start(t) {
    topic = t;
    bracket = Bracket.create(t.items, size);
    $('question').textContent = t.question;
    show('match');
    renderMatch();
  }

  function fillCard(btn, item) {
    btn.querySelector('.emoji').textContent = item.emoji;
    btn.querySelector('.name').textContent = item.name;
    btn.setAttribute('aria-label', item.name + ' 고르기');
  }

  function renderMatch() {
    var pair = Bracket.current(bracket);
    if (!pair) return finish();
    var p = Bracket.progress(bracket);
    var inRound = bracket.index / 2 + 1, roundPairs = bracket.round.length / 2;
    $('roundLabel').textContent = Bracket.roundName(bracket) + (roundPairs > 1 ? ' ' + inRound + '/' + roundPairs : '');
    $('progressBar').style.width = Math.round(p.done / p.total * 100) + '%';
    picks.forEach(function (btn, i) {
      btn.classList.remove('chosen', 'lost');
      fillCard(btn, pair[i]);
    });
    $('undoBtn').hidden = p.done === 0;
  }

  function choose(side) {
    if (busy || screens.match.hidden) return;
    busy = true;
    picks[side].classList.add('chosen');
    picks[1 - side].classList.add('lost');
    setTimeout(function () {
      Bracket.pick(bracket, side);
      busy = false;
      renderMatch();
    }, 380);
  }
  picks.forEach(function (btn, i) { btn.addEventListener('click', function () { choose(i); }); });
  $('undoBtn').addEventListener('click', function () {
    if (busy) return;
    if (Bracket.undo(bracket)) renderMatch();
  });
  document.addEventListener('keydown', function (e) {
    if (screens.match.hidden) return;
    if (e.key === 'ArrowLeft') choose(0);
    if (e.key === 'ArrowRight') choose(1);
  });

  // ----- 3) 결과 -----
  function finish() {
    var w = bracket.winner, r = bracket.runnerUp;
    $('winnerEmoji').textContent = w.emoji;
    $('winnerName').textContent = w.name;
    $('runnerUp').textContent = '결승에서 ' + r.emoji + ' ' + josa(r.name, '을', '를') + ' 이겼어요';
    $('share').textContent = '모두의 결과를 불러오는 중이에요…';
    $('statsList').textContent = '';
    $('playCount').textContent = '';
    show('result');
    var t = topic;
    fetch('/api/worldcup/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: t.id, size: bracket.size, winner: w.id, runnerUp: r.id })
    })
      .then(function (res) { return res.json(); })
      .then(function (stats) { if (topic === t) renderStats(t, stats, w); })
      .catch(function () {
        // 보내기에 실패해도 지금까지의 통계는 보여 준다.
        fetch('/api/worldcup/stats/' + t.id).then(function (res) { return res.json(); })
          .then(function (stats) { if (topic === t) renderStats(t, stats, w); })
          .catch(function () { $('share').textContent = '모두의 결과를 불러오지 못했어요.'; });
      });
  }

  function renderStats(t, stats, mine) {
    var plays = stats.plays || 0;
    var wins = stats.wins || {};
    $('playCount').textContent = '(지금까지 ' + plays.toLocaleString('ko-KR') + '판)';
    var myWins = wins[mine.id] || 0;
    $('share').textContent = plays
      ? josa(mine.name, '을', '를') + ' 1위로 뽑은 사람은 전체의 ' + Math.round(myWins / plays * 100) + '%예요!'
      : '';
    var rows = t.items.slice().sort(function (a, b) { return (wins[b.id] || 0) - (wins[a.id] || 0); });
    var list = $('statsList');
    list.textContent = '';
    rows.forEach(function (item, i) {
      var n = wins[item.id] || 0;
      var pct = plays ? n / plays * 100 : 0;
      var li = document.createElement('li');
      if (item.id === mine.id) li.className = 'mine';
      var no = document.createElement('span'); no.className = 'no'; no.textContent = (i + 1) + '';
      var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = item.emoji + ' ' + item.name;
      var bar = document.createElement('span'); bar.className = 'meter';
      var fill = document.createElement('i'); fill.style.width = pct.toFixed(1) + '%'; bar.appendChild(fill);
      var pc = document.createElement('span'); pc.className = 'pc'; pc.textContent = Math.round(pct) + '%';
      li.appendChild(no); li.appendChild(nm); li.appendChild(bar); li.appendChild(pc);
      list.appendChild(li);
    });
  }

  $('againBtn').addEventListener('click', function () { start(topic); });
  $('otherBtn').addEventListener('click', function () { show('pick'); });
  homeBtn.addEventListener('click', function () { show('pick'); });
})(window.Worldcup);
