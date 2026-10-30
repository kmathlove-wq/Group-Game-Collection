// ===== shared/ranking.js =====
// 여러 1인용 게임이 함께 쓰는 🏆 전체 순위 창. 창 모양(DOM)은 스스로 만들고, 꾸미기는 shared/ranking.css.
// 서버 /api/<slug>/scores(registerScoreboard)에 저장·조회한다. 이름은 localStorage '<slug>:nickname'(20자).
// 쓰는 법: var rank = GroupRanking.create({ slug: 'idol-quiz', unit: '점', top: 50 });
// title: 창 제목(기본 '🏆 전체 순위'), nameKey: 이름 저장 키(기본 '<slug>:nickname') — 한 게임이 순위표를 여러 개 쓸 때.
// playerId: 함수를 주면 그 값을 함께 보낸다(서버 perPlayer 순위 — 한 사람(한 판)은 가장 좋은 기록 한 줄).
//          rank.show(점수, 닫힌 뒤 할 일)  — 점수가 0이면 순위만 본다.
// 사용자가 쓴 글은 모두 textContent로만 넣는다.
(function (root) {
  'use strict';

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  // 받침이 있으면 '을', 없으면 '를'(숫자로 끝나면 '을'로 둠)
  function eul(text) {
    var code = text.charCodeAt(text.length - 1) - 0xac00;
    return text + (code >= 0 && code <= 11171 && code % 28 === 0 ? '를' : '을');
  }
  function get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function set(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* 무시 */ } }

  function create(options) {
    var api = '/api/' + options.slug + '/scores';
    var nameKey = options.nameKey || options.slug + ':nickname'; // 순위표 여러 개가 이름 하나를 같이 쓸 때 nameKey를 준다
    var unit = options.unit || '점';
    var top = options.top || 10;
    var format = options.format || function (n) { return n.toLocaleString('ko-KR') + unit; };

    var dialog = el('div', 'gr-dialog');
    dialog.hidden = true;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    var card = el('div', 'gr-card');
    var title = el('h2', null, options.title || '🏆 전체 순위');
    var scoreLine = el('p', 'gr-score');
    var label = el('label', 'gr-label', '내 이름 (20자까지)');
    var row = el('div', 'gr-row');
    var nameInput = el('input');
    nameInput.type = 'text'; nameInput.maxLength = 20; nameInput.autocomplete = 'off'; nameInput.placeholder = '이름을 써 주세요';
    nameInput.id = 'gr-name-' + options.slug;
    label.htmlFor = nameInput.id;
    var saveBtn = el('button', 'gr-ghost', '이름 저장'); saveBtn.type = 'button';
    var submitBtn = el('button', 'gr-primary', '순위에 올리기'); submitBtn.type = 'button';
    var resultEl = el('p', 'gr-result'); resultEl.setAttribute('aria-live', 'polite');
    var listEl = el('ol', 'gr-list');
    var closeBtn = el('button', 'gr-ghost gr-close', '닫기'); closeBtn.type = 'button';
    row.appendChild(nameInput); row.appendChild(saveBtn);
    [title, scoreLine, label, row, submitBtn, resultEl, listEl, closeBtn].forEach(function (n) { card.appendChild(n); });
    dialog.appendChild(card);
    document.body.appendChild(dialog);

    var pending = 0;
    var open = false;
    var onClose = null;
    nameInput.value = (get(nameKey) || '').slice(0, 20);
    function currentName() { return (nameInput.value || '').trim().slice(0, 20); }

    function render(scores) {
      listEl.textContent = '';
      if (!scores || !scores.length) {
        listEl.appendChild(el('li', 'gr-empty', '아직 기록이 없어요. 첫 1위가 되어 보세요!'));
        return;
      }
      scores.forEach(function (item, i) {
        var li = el('li');
        li.appendChild(el('span', 'gr-no', (i + 1) + '위'));
        li.appendChild(el('span', 'gr-nm', item.name));
        li.appendChild(el('span', 'gr-sc', format(item.score)));
        listEl.appendChild(li);
      });
    }

    function load() {
      return fetch(api)
        .then(function (r) { if (!r.ok) throw new Error('bad'); return r.json(); })
        .then(function (data) { render(data.scores); })
        .catch(function () {
          listEl.textContent = '';
          listEl.appendChild(el('li', 'gr-empty', '순위를 불러오지 못했어요. 잠시 뒤에 다시 열어 주세요.'));
        });
    }

    function post(name, score) {
      var body = { name: name, score: score };
      if (options.playerId) body.playerId = options.playerId();
      return fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d && d.error); return d; }); });
    }

    function submit() {
      var name = currentName() || '이름없음';
      set(nameKey, name);
      submitBtn.disabled = true;
      resultEl.textContent = '순위를 확인하는 중이에요…';
      return post(name, pending)
        .then(function (data) {
          render(data.scores);
          resultEl.textContent = data.rank ? '전체 ' + data.rank + '위에 올랐어요!' : '아쉽게도 ' + top + '위 안에는 못 들었어요.';
          pending = 0;
          submitBtn.hidden = true;
        })
        .catch(function () {
          submitBtn.disabled = false;
          resultEl.textContent = '등록하지 못했어요. 잠시 뒤에 다시 눌러 주세요.';
        });
    }

    function show(score, callback) {
      pending = score > 0 ? score : 0;
      onClose = callback || null;
      open = true;
      dialog.hidden = false;
      resultEl.textContent = '';
      submitBtn.hidden = !pending;
      submitBtn.disabled = false;
      scoreLine.textContent = pending ? '이번 기록 ' + eul(format(pending)) + ' 순위에 올릴까요?' : '';
      load();
      if (pending) nameInput.focus();
    }
    function close() {
      if (!open) return;
      open = false;
      dialog.hidden = true;
      nameInput.blur();
      var cb = onClose; onClose = null;
      if (cb) cb();
    }

    submitBtn.addEventListener('click', submit);
    saveBtn.addEventListener('click', function () {
      var name = currentName();
      if (!name) { resultEl.textContent = '이름을 먼저 써 주세요.'; return; }
      set(nameKey, name);
      resultEl.textContent = '이름을 "' + name + '"(으)로 저장했어요.';
    });
    closeBtn.addEventListener('click', close);
    dialog.addEventListener('click', function (e) { if (e.target === dialog) close(); });
    nameInput.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.isComposing && pending) submit();
      if (e.key === 'Escape') close();
    });

    return {
      show: show, close: close, isOpen: function () { return open; },
      hasName: function () { return !!(get(nameKey) || '').trim(); },
      // 이름이 있으면 창 없이 조용히 올린다(계속 늘어나는 기록용). 결과 약속(Promise)을 돌려준다.
      quietSubmit: function (score) { return post((get(nameKey) || '').trim().slice(0, 20) || '이름없음', score); }
    };
  }

  root.GroupRanking = { create: create };
})(window);
