// ===== piano-rhythm/js/rules.js =====
// 🎹 피아노 리듬: 곡 악보·난이도·판정·점수. 화면을 모르는 계산만 둔다(브라우저 window.PianoRhythm, Node module.exports 겸용).
// 악보는 한글 계이름을 띄어 쓴다: '도 레 미 파 솔 라 시 높은도', 쉼표는 '쉼', 마디 줄 '|'는 무시.
// 길이: 그냥 쓰면 1박, 뒤에 '-'마다 +1박, '.'은 +0.5박, '~'는 반 박(예: '솔-' 2박, '솔.' 1.5박, '라~' 0.5박).
// 곡은 모두 저작권이 끝난 옛 노래의 가락만 쓴다(노랫말 없음).
(function (root) {
  'use strict';

  var NAMES = ['도', '레', '미', '파', '솔', '라', '시', '높은도'];
  var KEYS = ['a', 's', 'd', 'f', 'j', 'k', 'l', ';'];
  var KEY_LABELS = ['A', 'S', 'D', 'F', 'J', 'K', 'L', ';'];
  // 도4(가운데 도)부터 높은 도5까지의 진동수(Hz)
  var FREQS = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25];

  var SONGS = [
    { id: 'twinkle', title: '반짝반짝 작은 별', emoji: '⭐', bpm: 100, level: 1,
      score: '도 도 솔 솔 라 라 솔- | 파 파 미 미 레 레 도- | 솔 솔 파 파 미 미 레- | 솔 솔 파 파 미 미 레- | ' +
             '도 도 솔 솔 라 라 솔- | 파 파 미 미 레 레 도-' },
    { id: 'lamb', title: '메리의 어린 양', emoji: '🐑', bpm: 110, level: 1,
      score: '미 레 도 레 | 미 미 미- | 레 레 레- | 미 솔 솔- | 미 레 도 레 | 미 미 미 미 | 레 레 미 레 | 도---' },
    { id: 'butterfly', title: '나비야', emoji: '🦋', bpm: 92, level: 2,
      score: '솔~ 미~ 미 | 파~ 레~ 레 | 도~ 레~ 미~ 파~ | 솔~ 솔~ 솔 | 솔~ 미~ 미~ 미~ | 파~ 레~ 레~ 레~ | 도~ 미~ 솔~ 솔~ | 미~ 미~ 미 | ' +
             '레~ 레~ 레~ 레~ | 레~ 미~ 파 | 미~ 미~ 미~ 미~ | 미~ 파~ 솔 | 솔~ 미~ 미~ 미~ | 파~ 레~ 레~ 레~ | 도~ 미~ 솔~ 솔~ | 도-' },
    { id: 'london', title: '런던 다리', emoji: '🌉', bpm: 112, level: 2,
      score: '솔. 라~ 솔 파 | 미 파 솔- | 레 미 파- | 미 파 솔- | 솔. 라~ 솔 파 | 미 파 솔- | 레- 솔- | 미 도-' },
    { id: 'joy', title: '환희의 송가', emoji: '🎼', bpm: 116, level: 3,
      score: '미 미 파 솔 | 솔 파 미 레 | 도 도 레 미 | 미. 레~ 레- | 미 미 파 솔 | 솔 파 미 레 | 도 도 레 미 | 레. 도~ 도- | ' +
             '레 레 미 도 | 레 미~ 파~ 미 도 | 레 미~ 파~ 미 레 | 도 레 솔- | 미 미 파 솔 | 솔 파 미 레 | 도 도 레 미 | 레. 도~ 도-' },
    // 2026-10-31 사용자 요청으로 5곡 더함(모두 1700~1800년대 곡, 흰 건반만으로 칠 수 있게 다장조로 옮김)
    { id: 'jingle', title: '징글벨', emoji: '🔔', bpm: 120, level: 2,
      score: '미 미 미- | 미 미 미- | 미 솔 도. 레~ | 미--- | 파 파 파. 파~ | 파 미 미 미~ 미~ | 미 레 레 미 | 레- 솔- | ' +
             '미 미 미- | 미 미 미- | 미 솔 도. 레~ | 미--- | 파 파 파. 파~ | 파 미 미 미~ 미~ | 솔 솔 파 레 | 도---' },
    { id: 'susanna', title: '오 수재너', emoji: '🪕', bpm: 120, level: 2,
      score: '도~ 레~ | 미 솔 솔. 라~ | 솔 미 도. 레~ | 미 미 레 도 | 레- 쉼 도~ 레~ | 미 솔 솔. 라~ | 솔 미 도. 레~ | 미 미 레 레 | 도-- 쉼 | ' +
             '파- 라- | 라- 솔 솔 | 미 도 레- | 쉼 쉼 도~ 레~ | 미 솔 솔. 라~ | 솔 미 도. 레~ | 미 미 레 레 | 도---' },
    { id: 'lullaby', title: '브람스 자장가', emoji: '🌙', bpm: 100, level: 2,
      score: '미 미 솔- | 미 미 솔- | 미 솔 높은도- 시 | 라 라 솔- | 레 미 파- | 레 레 미 파- | 레 파 시 라 솔 | 시 높은도-- | ' +
             '도 도 높은도-- | 라 파 솔-- | 미 도 파 솔 라 | 솔-- | 도 도 높은도-- | 라 파 솔-- | 미 도 파 미 레 | 도---' },
    { id: 'grace', title: '어메이징 그레이스', emoji: '🕊️', bpm: 96, level: 2,
      score: '도 | 파- 라~ 파~ | 라- 솔 | 파- 레 | 도- 도 | 파- 라~ 파~ | 라- 솔 | 높은도--- 쉼 | ' +
             '라. 높은도~ 라~ 파~ | 라- 솔 | 파- 레 | 도- 도 | 파- 라~ 파~ | 라- 솔 | 파---' },
    { id: 'rowboat', title: '노를 저어라', emoji: '🚣', bpm: 120, level: 3,
      score: '도. 도. | 도 레~ 미. | 미 레~ 미 파~ | 솔-- | 높은도~ 높은도~ 높은도~ 솔~ 솔~ 솔~ | 미~ 미~ 미~ 도~ 도~ 도~ | 솔 파~ 미 레~ | 도-- | ' +
             '도. 도. | 도 레~ 미. | 미 레~ 미 파~ | 솔-- | 높은도~ 높은도~ 높은도~ 솔~ 솔~ 솔~ | 미~ 미~ 미~ 도~ 도~ 도~ | 솔 파~ 미 레~ | 도--' }
  ];

  // 난이도: 박자 빠르기 배율(tempo), 음표가 위에서 판정선까지 내려오는 초(travel), 판정 폭(밀리초)
  var DIFFICULTIES = {
    easy: { name: '쉬움', tempo: 0.85, travel: 2.4, windows: { perfect: 70, great: 120, good: 180 } },
    normal: { name: '보통', tempo: 1, travel: 1.8, windows: { perfect: 50, great: 95, good: 140 } },
    hard: { name: '어려움', tempo: 1.25, travel: 1.3, windows: { perfect: 35, great: 70, good: 110 } }
  };
  // 순위는 곡·난이도마다 따로라서(사용자 결정 2026-10-31) 점수는 모두 100만 점 만점이다.
  var SCORE_MAX = 1000000;

  // 곡·난이도별 순위표 이름(서버 /api/<이름>/scores) 목록과 이름 만들기
  function boardSlug(songId, diffKey) { return 'piano-rhythm-' + songId + '-' + diffKey; }
  function boardSlugs() {
    var out = [];
    SONGS.forEach(function (s) { Object.keys(DIFFICULTIES).forEach(function (d) { out.push(boardSlug(s.id, d)); }); });
    return out;
  }
  var JUDGE_VALUE = { perfect: 1, great: 0.7, good: 0.4, miss: 0 };
  var JUDGE_TEXT = { perfect: '퍼펙트!', great: '좋아요!', good: '괜찮아요', miss: '놓침' };

  // 악보 글 → [{ lane, beat, beats }] (lane -1 = 쉼표는 빼고 돌려줌)
  function parseScore(text) {
    var out = [];
    var beat = 0;
    text.split(/\s+/).forEach(function (token) {
      if (!token || token === '|') return;
      var m = /^(.+?)([-.~]*)$/.exec(token);
      var name = m[1];
      var marks = m[2];
      var lane = name === '쉼' ? -1 : NAMES.indexOf(name);
      if (lane === -1 && name !== '쉼') throw new Error('모르는 계이름: ' + token);
      var len = marks.indexOf('~') >= 0 ? 0.5 : 1;
      for (var i = 0; i < marks.length; i++) {
        if (marks[i] === '-') len += 1;
        else if (marks[i] === '.') len += 0.5;
      }
      if (lane >= 0) out.push({ lane: lane, beat: beat, beats: len });
      beat += len;
    });
    return out;
  }

  function songById(id) {
    for (var i = 0; i < SONGS.length; i++) if (SONGS[i].id === id) return SONGS[i];
    return SONGS[0];
  }

  // 곡+난이도 → 음표 목록. time·dur은 곡 시작부터의 초.
  function buildChart(song, diffKey) {
    var diff = DIFFICULTIES[diffKey] || DIFFICULTIES.normal;
    var spb = 60 / (song.bpm * diff.tempo); // 1박의 초
    var notes = parseScore(song.score).map(function (n, i) {
      return { id: i, lane: n.lane, time: n.beat * spb, dur: n.beats * spb, judged: null };
    });
    var last = notes[notes.length - 1];
    return { notes: notes, spb: spb, length: last.time + last.dur };
  }

  // 시간 차(초, 누른 시각 - 음표 시각)를 판정 이름으로. 폭 밖이면 null.
  function judge(diffSec, windows) {
    var ms = Math.abs(diffSec) * 1000;
    if (ms <= windows.perfect) return 'perfect';
    if (ms <= windows.great) return 'great';
    if (ms <= windows.good) return 'good';
    return null;
  }

  // 건반을 눌렀을 때: 그 줄에서 아직 판정 안 된 가장 이른 음표가 판정 폭 안이면 { note, result }.
  // 아니면 다른 줄 음표가 폭 안에 있을 때만 { wrong: true }(엉뚱한 건반 → 콤보 끊김), 아무 음표도 없으면 {}.
  function press(notes, lane, t, windows) {
    var reach = windows.good / 1000;
    var wrong = false;
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i];
      if (n.judged) continue;
      if (n.time - t > reach) break; // 음표는 시간 순서라 더 볼 필요 없음
      if (t - n.time > reach) continue;
      if (n.lane === lane) return { note: n, result: judge(t - n.time, windows) };
      wrong = true;
    }
    return wrong ? { wrong: true } : {};
  }

  // 판정 폭을 지나쳐 버린 음표들(놓침)
  function expired(notes, t, windows) {
    var reach = windows.good / 1000;
    return notes.filter(function (n) { return !n.judged && t - n.time > reach; });
  }

  // 정확도 0~1: 판정마다 퍼펙트 1, 좋아요 0.7, 괜찮아요 0.4
  function accuracy(counts, total) {
    if (!total) return 0;
    var sum = counts.perfect * JUDGE_VALUE.perfect + counts.great * JUDGE_VALUE.great + counts.good * JUDGE_VALUE.good;
    return sum / total;
  }

  // 점수: 정확도 90% + 최대 콤보 10% 로 100만 점
  function scoreFor(counts, total, maxCombo) {
    if (!total) return 0;
    return Math.round(SCORE_MAX * (0.9 * accuracy(counts, total) + 0.1 * Math.min(1, maxCombo / total)));
  }

  function gradeFor(acc) {
    if (acc >= 0.95) return 'S';
    if (acc >= 0.85) return 'A';
    if (acc >= 0.7) return 'B';
    if (acc >= 0.5) return 'C';
    return 'D';
  }

  var api = {
    NAMES: NAMES, KEYS: KEYS, KEY_LABELS: KEY_LABELS, FREQS: FREQS, SONGS: SONGS, DIFFICULTIES: DIFFICULTIES,
    SCORE_MAX: SCORE_MAX, JUDGE_TEXT: JUDGE_TEXT, boardSlug: boardSlug, boardSlugs: boardSlugs,
    parseScore: parseScore, songById: songById, buildChart: buildChart, judge: judge, press: press,
    expired: expired, accuracy: accuracy, scoreFor: scoreFor, gradeFor: gradeFor
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PianoRhythm = api;
})(typeof window !== 'undefined' ? window : this);
