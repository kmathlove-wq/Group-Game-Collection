// ===== bracket.js =====
// 이상형 월드컵 대진표 규칙(화면을 모름). 브라우저(window.Worldcup.Bracket)와 Node 시험이 함께 쓴다.
// 후보를 섞어 size개를 뽑고, 두 개씩 붙여 고른 쪽만 다음 라운드로 올린다. 마지막 하나가 1위.
(function (root) {
  'use strict';

  function shuffle(list, rand) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function create(items, size, rand) {
    rand = rand || Math.random;
    return { size: size, round: shuffle(items, rand).slice(0, size), next: [], index: 0, history: [], winner: null, runnerUp: null };
  }

  // 지금 붙는 두 후보 [왼쪽, 오른쪽]
  function current(b) {
    if (b.winner) return null;
    return [b.round[b.index], b.round[b.index + 1]];
  }

  // 라운드 이름: 16강·8강·4강·결승
  function roundName(b) {
    var n = b.round.length;
    return n === 2 ? '결승' : n + '강';
  }

  // side 0 = 왼쪽, 1 = 오른쪽
  function pick(b, side) {
    var pair = current(b);
    if (!pair) return b;
    b.history.push({ round: b.round.slice(), next: b.next.slice(), index: b.index });
    if (b.round.length === 2) {
      b.winner = pair[side];
      b.runnerUp = pair[1 - side];
      return b;
    }
    b.next.push(pair[side]);
    b.index += 2;
    if (b.index >= b.round.length) {
      b.round = b.next;
      b.next = [];
      b.index = 0;
    }
    return b;
  }

  function undo(b) {
    var last = b.history.pop();
    if (!last) return false;
    b.round = last.round; b.next = last.next; b.index = last.index;
    b.winner = null; b.runnerUp = null;
    return true;
  }

  // 전체 대결 수(size-1) 중 몇 번째인지(진행 막대용)
  function progress(b) {
    return { done: b.history.length, total: b.size - 1 };
  }

  var api = { create: create, current: current, roundName: roundName, pick: pick, undo: undo, progress: progress, shuffle: shuffle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.Worldcup = root.Worldcup || {}; root.Worldcup.Bracket = api; }
})(typeof window !== 'undefined' ? window : this);
