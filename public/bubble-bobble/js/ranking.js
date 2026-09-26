// ===== ranking.js =====
// 전체 순위(모든 사람의 기록). 서버 /api/bubble-bobble/scores 에 저장·조회한다.
// 게임오버·엔딩 때 이름 입력 창을 띄우고, 창이 닫힐 때까지 게임은 그 화면에서 기다린다.
(function (BB) {
  var API = '/api/bubble-bobble/scores';
  var NICKNAME_KEY = 'bb_nickname';
  var MY_BEST_KEY = 'bb_my_best_rank';

  var overlay = document.getElementById('bbRankOverlay');
  var titleText = document.getElementById('bbRankTitle');
  var finalScoreText = document.getElementById('bbFinalScore');
  var form = document.getElementById('bbRankForm');
  var nameInput = document.getElementById('bbNameInput');
  var submitButton = document.getElementById('bbSubmitButton');
  var resultText = document.getElementById('bbRankResult');
  var closeButton = document.getElementById('bbCloseButton');
  var myBestText = document.getElementById('bbMyBest');
  var refreshButton = document.getElementById('bbRefreshButton');
  var lists = document.querySelectorAll('.bb-rank-list');

  var isOpen = false;
  var onClose = null;
  var currentScore = 0;

  function storageGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function storageSet(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }

  nameInput.value = storageGet(NICKNAME_KEY) || '';

  function emptyItem(message) {
    var li = document.createElement('li');
    li.className = 'bb-rank-empty';
    li.textContent = message;
    return li;
  }

  // 사이드 순위표와 게임오버 창 안의 작은 순위표를 같은 내용으로 그린다.
  function render(scores) {
    lists.forEach(function (list) {
      list.innerHTML = '';
      if (!scores || !scores.length) {
        list.append(emptyItem('아직 기록이 없어요. 첫 1위가 되어 보세요!'));
        return;
      }
      scores.forEach(function (item, index) {
        var li = document.createElement('li');
        li.className = 'bb-rank-' + (index + 1);
        var badge = document.createElement('span');
        badge.className = 'bb-rank-badge';
        badge.textContent = (index + 1) + '위';
        var name = document.createElement('span');
        name.className = 'bb-rank-name';
        name.textContent = item.name;
        var score = document.createElement('span');
        score.textContent = item.score.toLocaleString('ko-KR');
        li.append(badge, name, score);
        list.append(li);
      });
    });
  }

  function renderMyBest() {
    var raw = storageGet(MY_BEST_KEY);
    if (!raw) { myBestText.textContent = ''; return; }
    try {
      var best = JSON.parse(raw);
      myBestText.textContent = '내 최고 기록: ' + best.name + ' · ' + best.score.toLocaleString('ko-KR') +
        (best.rank ? ' · 전체 ' + best.rank + '위' : ' · 순위표 50위 밖');
    } catch (e) {
      myBestText.textContent = '';
    }
  }

  function fetchScores() {
    return fetch(API)
      .then(function (res) { if (!res.ok) throw new Error('bad response'); return res.json(); })
      .then(function (data) { render(data.scores); })
      .catch(function () {
        lists.forEach(function (list) {
          list.innerHTML = '';
          list.append(emptyItem('순위를 불러오지 못했어요. 새로고침을 눌러 주세요.'));
        });
      });
  }

  function submit() {
    var name = nameInput.value.trim() || '이름없음';
    storageSet(NICKNAME_KEY, name);
    submitButton.disabled = true;
    resultText.textContent = '순위를 확인하는 중…';
    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, score: currentScore })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data && data.error);
          return data;
        });
      })
      .then(function (data) {
        render(data.scores);
        resultText.textContent = data.rank ? '전체 순위 ' + data.rank + '위에 올랐어요!' : '아쉽게도 50위 안에는 못 들었어요.';
        var prev = null;
        try { prev = JSON.parse(storageGet(MY_BEST_KEY)); } catch (e) {}
        if (!prev || currentScore > prev.score) {
          storageSet(MY_BEST_KEY, JSON.stringify({ name: name, score: currentScore, rank: data.rank || null }));
          renderMyBest();
        }
        form.hidden = true;
        closeButton.focus();
      })
      .catch(function () {
        submitButton.disabled = false;
        resultText.textContent = '순위 등록에 실패했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.';
      });
  }

  function open(score, title, callback) {
    currentScore = score;
    onClose = callback;
    isOpen = true;
    titleText.textContent = title;
    finalScoreText.textContent = score.toLocaleString('ko-KR');
    resultText.textContent = score > 0 ? '' : '0점은 순위에 올릴 수 없어요.';
    form.hidden = score <= 0;
    submitButton.disabled = false;
    overlay.hidden = false;
    fetchScores();
    if (score > 0) nameInput.focus(); else closeButton.focus();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    overlay.hidden = true;
    nameInput.blur();
    if (onClose) onClose();
  }

  form.addEventListener('submit', function (e) { e.preventDefault(); submit(); });
  closeButton.addEventListener('click', close);
  refreshButton.addEventListener('click', fetchScores);

  fetchScores();
  renderMyBest();

  BB.ranking = {
    open: open,
    isOpen: function () { return isOpen; }
  };
})(window.BB);
