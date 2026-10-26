// ===== ranking.js =====
// 전체 순위(모든 사람의 기록). 서버 /api/dino/scores 에 저장·조회한다(위 50명).
// 이름은 localStorage 'dino:nickname'(20자)에 기억한다. 사용자가 쓴 글은 모두 textContent로만 넣는다.
(function (D) {
  'use strict';
  var API = '/api/dino/scores';
  var NAME_KEY = 'dino:nickname';

  var dialog = document.getElementById('rankDialog');
  var listEl = document.getElementById('rankList');
  var nameInput = document.getElementById('rankName');
  var scoreLine = document.getElementById('rankScoreLine');
  var submitBtn = document.getElementById('rankSubmit');
  var saveNameBtn = document.getElementById('rankSaveName');
  var closeBtn = document.getElementById('rankClose');
  var resultEl = document.getElementById('rankResult');
  var pending = 0;
  var open = false;
  var onClose = null;

  function get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function set(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* 무시 */ } }

  function currentName() { return (nameInput.value || '').trim().slice(0, 20); }
  nameInput.value = (get(NAME_KEY) || '').slice(0, 20);

  function render(scores) {
    listEl.textContent = '';
    if (!scores || !scores.length) {
      var empty = document.createElement('li');
      empty.className = 'rank-empty';
      empty.textContent = '아직 기록이 없어요. 첫 1위가 되어 보세요!';
      listEl.appendChild(empty);
      return;
    }
    scores.forEach(function (item, i) {
      var li = document.createElement('li');
      var no = document.createElement('span'); no.className = 'rank-no'; no.textContent = (i + 1) + '위';
      var nm = document.createElement('span'); nm.className = 'rank-nm'; nm.textContent = item.name;
      var sc = document.createElement('span'); sc.className = 'rank-sc'; sc.textContent = String(item.score);
      li.appendChild(no); li.appendChild(nm); li.appendChild(sc);
      listEl.appendChild(li);
    });
  }

  function load() {
    return fetch(API)
      .then(function (r) { if (!r.ok) throw new Error('bad'); return r.json(); })
      .then(function (data) { render(data.scores); })
      .catch(function () {
        listEl.textContent = '';
        var li = document.createElement('li');
        li.className = 'rank-empty';
        li.textContent = '순위를 불러오지 못했어요. 잠시 뒤에 다시 열어 주세요.';
        listEl.appendChild(li);
      });
  }

  function submit() {
    var name = currentName() || '이름없음';
    set(NAME_KEY, name);
    submitBtn.disabled = true;
    resultEl.textContent = '순위를 확인하는 중이에요…';
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, score: pending })
    })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d && d.error); return d; }); })
      .then(function (data) {
        render(data.scores);
        resultEl.textContent = data.rank ? '전체 ' + data.rank + '위에 올랐어요!' : '아쉽게도 50위 안에는 못 들었어요.';
        pending = 0;
        submitBtn.hidden = true;
      })
      .catch(function () {
        submitBtn.disabled = false;
        resultEl.textContent = '등록하지 못했어요. 잠시 뒤에 다시 눌러 주세요.';
      });
  }

  // score > 0 이면 "이 점수를 등록할래요?" 모양으로 연다.
  function show(score, callback) {
    pending = score > 0 ? score : 0;
    onClose = callback || null;
    open = true;
    dialog.hidden = false;
    resultEl.textContent = '';
    submitBtn.hidden = !pending;
    submitBtn.disabled = false;
    scoreLine.textContent = pending ? '이번 점수 ' + pending + '점을 순위에 올릴까요?' : '';
    load();
    nameInput.focus();
  }
  function close() {
    if (!open) return;
    open = false;
    dialog.hidden = true;
    nameInput.blur();
    if (onClose) onClose();
    onClose = null;
  }

  submitBtn.addEventListener('click', submit);
  saveNameBtn.addEventListener('click', function () {
    var name = currentName();
    if (!name) { resultEl.textContent = '이름을 먼저 써 주세요.'; return; }
    set(NAME_KEY, name);
    resultEl.textContent = '이름을 "' + name + '"(으)로 저장했어요.';
  });
  closeBtn.addEventListener('click', close);
  nameInput.addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Enter' && pending) submit();
    if (e.key === 'Escape') close();
  });

  D.Ranking = {
    show: show,
    isOpen: function () { return open; },
    hasName: function () { return !!(get(NAME_KEY) || '').trim(); },
    // 이름이 이미 있으면 창 없이 조용히 등록한다. 결과 문구를 돌려준다.
    quickSubmit: function (score) {
      var name = (get(NAME_KEY) || '').trim().slice(0, 20) || '이름없음';
      return fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, score: score })
      })
        .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error('x'); return d; }); })
        .then(function (d) { return d.rank ? name + ' 님, 전체 ' + d.rank + '위에 올랐어요!' : '등록했어요. (50위 밖)'; })
        .catch(function () { return '순위 등록에 실패했어요.'; });
    }
  };
})(window.Dino);
