// ===== ranking.js =====
// 전체 순위 세 개: 💰 번 돈(클수록 위) / ⏱️ 보물까지 걸린 시간 / 🌍 지구 파괴까지 걸린 시간(둘 다 짧을수록 위).
// 세 순위 모두 한 사람(새 게임마다 새 playerId)당 한 줄이라, 번 돈은 팔 때마다 같은 줄이 커진다.
(function (MT) {
  var Rules = MT.Rules;

  var MONEY_DELAY_MS = 2500; // 연달아 팔면 마지막 판매 뒤 한 번만 올린다(서버는 같은 IP 2초에 한 번만 받음)

  function formatMoney(n) { return Math.floor(n).toLocaleString('ko-KR') + '원'; }
  function formatTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60;
    var mm = h ? String(m).padStart(2, '0') : String(m);
    return (h ? h + ':' : '') + mm + ':' + String(s).padStart(2, '0');
  }

  function post(api, body) {
    return fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (res) { return res.json().then(function (data) { if (!res.ok) throw new Error(data && data.error); return data; }); });
  }

  function Ranking() {
    this.modal = document.getElementById('mtRankModal');
    this.list = document.getElementById('mtRankList');
    this.note = document.getElementById('mtRankNote');
    this.tabs = Array.prototype.slice.call(document.querySelectorAll('[data-rank-tab]'));
    this.tab = 'money';
    this.moneyTimer = null;
    this.sentEarned = 0;
    var self = this;
    this.tabs.forEach(function (button) {
      button.addEventListener('click', function () { self.show(button.getAttribute('data-rank-tab')); });
    });
  }

  // 번 돈 올리기: 잠깐 모았다가 한 번에. 실패하면(너무 빨리 등) 조금 뒤 다시 시도한다.
  Ranking.prototype.queueMoney = function (state) {
    var self = this;
    clearTimeout(this.moneyTimer);
    this.moneyTimer = setTimeout(function () {
      var earned = Math.floor(state.earned);
      if (earned <= 0 || earned <= self.sentEarned) return;
      post(Rules.MONEY_API, { name: state.name, playerId: state.playerId, score: earned })
        .then(function () { self.sentEarned = Math.max(self.sentEarned, earned); })
        .catch(function () { self.moneyTimer = setTimeout(function () { self.queueMoney(state); }, 3000); });
    }, MONEY_DELAY_MS);
  };

  // 새 게임을 시작하면 "이미 올린 금액"을 처음부터 다시 센다.
  Ranking.prototype.reset = function () { clearTimeout(this.moneyTimer); this.sentEarned = 0; };

  // 시간 기록 올리기(실패하면 2.5초 뒤 최대 3번 다시).
  function submitOnce(api, state, score, tries) {
    return post(api, { name: state.name, playerId: state.playerId, score: Math.round(score) })
      .catch(function (err) {
        if (tries >= 3) throw err;
        return new Promise(function (resolve) { setTimeout(resolve, 2500); }).then(function () { return submitOnce(api, state, score, tries + 1); });
      });
  }
  Ranking.prototype.submitTime = function (state) { return submitOnce(Rules.TIME_API, state, state.treasureTime, 0); };
  Ranking.prototype.submitDestroy = function (state) { return submitOnce(Rules.DESTROY_API, state, state.destroyedTime, 0); };

  Ranking.prototype.open = function (tab) {
    this.modal.classList.remove('hidden');
    this.show(tab || this.tab);
  };
  Ranking.prototype.close = function () { this.modal.classList.add('hidden'); };
  Ranking.prototype.isOpen = function () { return !this.modal.classList.contains('hidden'); };

  Ranking.prototype.show = function (tab) {
    var self = this;
    this.tab = tab;
    this.tabs.forEach(function (button) {
      var on = button.getAttribute('data-rank-tab') === tab;
      button.classList.toggle('active', on);
      button.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    this.note.textContent = { money: '지금까지 번 돈 전체 (쓴 돈은 빼지 않아요)', time: '전설의 보물을 캐기까지 걸린 시간 (짧을수록 위)', destroy: '지구를 부수기까지 걸린 시간 (짧을수록 위)' }[tab];
    this.renderMessage('순위를 불러오는 중이에요…');
    fetch({ money: Rules.MONEY_API, time: Rules.TIME_API, destroy: Rules.DESTROY_API }[tab])
      .then(function (res) { if (!res.ok) throw new Error('bad'); return res.json(); })
      .then(function (data) { if (self.tab === tab) self.render(data.scores || [], tab); })
      .catch(function () { if (self.tab === tab) self.renderMessage('순위를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.'); });
  };

  Ranking.prototype.renderMessage = function (text) {
    this.list.textContent = '';
    var li = document.createElement('li');
    li.className = 'mt-rank-empty';
    li.textContent = text;
    this.list.append(li);
  };

  Ranking.prototype.render = function (scores, tab) {
    if (!scores.length) { this.renderMessage({ money: '아직 기록이 없어요. 첫 1위가 되어 보세요!', time: '아직 보물을 찾은 사람이 없어요!', destroy: '아직 아무도 없어요…' }[tab]); return; }
    this.list.textContent = '';
    var self = this;
    scores.forEach(function (item, index) {
      var li = document.createElement('li');
      li.className = 'mt-rank-row mt-rank-' + (index + 1);
      var badge = document.createElement('span'); badge.className = 'mt-rank-badge'; badge.textContent = (index + 1) + '위';
      var name = document.createElement('span'); name.className = 'mt-rank-name'; name.textContent = item.name;
      var score = document.createElement('b'); score.textContent = tab === 'money' ? formatMoney(item.score) : formatTime(item.score);
      li.append(badge, name, score);
      self.list.append(li);
    });
  };

  MT.Ranking = Ranking;
  MT.format = { money: formatMoney, time: formatTime };
})(window.MT = window.MT || {});
