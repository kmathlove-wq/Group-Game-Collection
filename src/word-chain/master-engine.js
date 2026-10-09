// 🏆 고수 컴퓨터의 두뇌. 사전 전체 낱말로 "단어 지도"를 만들고 수를 읽는다(끝말잇기 엔진 ggeugle의 방법을 우리 규칙으로 새로 짰다).
//   위치 = 방금 나온 단어의 끝 글자 X. 갈 수 있는 길 = 시작 글자가 allowedStarts(X)(두음법칙 포함)인 아직 안 나온 낱말.
//   ① 승패 도미노(역행 분석): 길이 없는 글자는 필패 → 필패로 보낼 수 있는 글자는 필승 → 모든 길이 필승으로 가는 글자는 필패 …
//      길이 자기 자신으로 돌아오는 단어(몫몫)뿐이면 그 수가 홀수면 필승, 짝수면 필패.
//      두음법칙 때문에 한 낱말이 다른 글자의 "돌아오는 길"이기도 하다: 릅에서 늡늡을 내면 늡늡은 늡의 돌아오는 길이라
//      상대는 "돌아오는 길이 하나 줄어든 늡"(늡⁻)을 받는다. 늡⁻은 길이 0개라 필패 → 릅은 필승(집주릅을 내면 진다).
//   ② 끝까지 안 정해진 글자(루트)는 정해진 시간 동안 끝까지 따라가 본다(이기는 수를 찾으면 바로 낸다).
//   ③ 질 수밖에 없으면 상대가 이어 갈 단어가 가장 적은 수(사람은 사전 없이 찾기 어렵다).
// 같은 첫 글자·끝 글자 낱말(각가속도·각도 = 각→도)은 결과가 같아서 "길 하나에 낱말 n개"로 묶어 계산한다.
// 이번 판에 나온 단어는 지도에서 뺀 채로 매번 다시 계산한다(단어가 나오면 길이 사라져 승패가 바뀔 수 있다).
// 이 파일은 계산만 한다. 시간이 오래 걸리므로 서버에서는 master.js가 따로 일하는 일꾼(worker_threads)에서 돌린다.
const { allowedStarts, firstSyllable, lastSyllable, isHangulWord, syllables, WORD_MIN } = require('./rules');

const WIN = 1; const LOSE = 2; // 정해지지 않은 글자(루트)는 0
const LOOPED = '\u0001';       // 글자 뒤에 붙여 "돌아오는 길이 하나 줄어든 글자"(e⁻)를 나타낸다
const MAX_SEARCH_DEPTH = 2_000; // 너무 깊으면 "모름"으로 본다(호출 스택 보호)
const OPENER_SAMPLES = 24;      // 첫 단어를 깊이 생각할 때 살펴볼 후보 수
class OutOfTime extends Error {}

function createMasterEngine(words = [], { random = Math.random, now = () => performance.now() } = {}) {
  // 메모리 아끼기(우리말샘은 낱말이 100만 개 가까이 된다): 낱말마다 따로 담지 않고, 같은 길(첫 글자→끝 글자)의 낱말을
  // 줄바꿈으로 이어 붙인 문자열 하나와 개수로 담는다. 칸 = [개수, '낱말1↵낱말2…']. 더하기·지우기는 드물어서 그때만 다시 이어 붙인다.
  const pairs = new Map();  // 첫 글자 → Map(끝 글자 → 칸)
  const ends = new Map();   // 끝 글자 → 그 글자로 끝나는 낱말 수(위치가 될 수 있는 글자들)
  let count = 0;
  const startsCache = new Map();
  const startsOf = (x) => { let s = startsCache.get(x); if (!s) { s = allowedStarts(x); startsCache.set(x, s); } return s; };
  // 길 s→e로 e에 들어가면 상대가 받는 자리: 그 낱말이 e의 돌아오는 길(s가 e에서 시작할 수 있는 글자)이기도 하면 e⁻.
  const minusOne = (e) => `${e}${LOOPED}`;
  const landing = (s, e) => (startsOf(e).includes(s) ? minusOne(e) : e);
  const key = (s, e) => `${s}\u0000${e}`; // 길 이름(첫 글자 + 끝 글자)
  const cellOf = (word) => pairs.get(firstSyllable(word))?.get(lastSyllable(word));
  const wordsIn = (cell) => (cell ? cell[1].split('\n') : []);
  const has = (word) => wordsIn(cellOf(word)).includes(word);

  function add(word) {
    if (!isHangulWord(word) || syllables(word).length < WORD_MIN || has(word)) return false;
    const s = firstSyllable(word); const e = lastSyllable(word);
    if (!pairs.has(s)) pairs.set(s, new Map());
    const row = pairs.get(s); const cell = row.get(e);
    if (cell) { cell[0] += 1; cell[1] += `\n${word}`; } else row.set(e, [1, word]);
    ends.set(e, (ends.get(e) || 0) + 1);
    count += 1;
    return true;
  }
  function remove(word) {
    if (!has(word)) return false;
    const s = firstSyllable(word); const e = lastSyllable(word);
    const row = pairs.get(s); const cell = row.get(e);
    const rest = wordsIn(cell).filter((w) => w !== word);
    if (rest.length) { cell[0] = rest.length; cell[1] = rest.join('\n'); } else row.delete(e);
    if (!row.size) pairs.delete(s);
    if (ends.get(e) === 1) ends.delete(e); else ends.set(e, ends.get(e) - 1);
    count -= 1;
    return true;
  }
  // 처음 지도는 길마다 낱말을 모았다가 한 번에 이어 붙인다(하나씩 add하면 문자열 조각이 쌓여 메모리를 더 쓰고 느리다).
  const groups = new Map(); // "첫\0끝" → Set(낱말)
  for (const word of words) {
    if (!isHangulWord(word) || syllables(word).length < WORD_MIN) continue;
    const k = key(firstSyllable(word), lastSyllable(word));
    if (!groups.has(k)) groups.set(k, new Set());
    groups.get(k).add(word);
  }
  for (const [k, set] of groups) {
    const [s, e] = k.split('\u0000');
    if (!pairs.has(s)) pairs.set(s, new Map());
    pairs.get(s).set(e, [set.size, [...set].join('\n')]);
    ends.set(e, (ends.get(e) || 0) + set.size);
    count += set.size;
  }
  groups.clear();

  // 이번 판에 나온 단어 수를 길(첫 글자→끝 글자)마다 센다.
  function usedCounts(used) {
    const counts = new Map();
    for (const word of used) {
      if (!has(word)) continue;
      const k = key(firstSyllable(word), lastSyllable(word));
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return counts;
  }

  // ① 승패 도미노. 돌려주는 값으로 각 글자의 승패·깊이(몇 수 만에 끝나는지)와 남은 길을 알 수 있다.
  //    자리는 글자 x와 "돌아오는 길이 하나 줄어든 x"(x⁻) 두 가지다. x⁻은 x와 다른 길이 같아서 x가 정해질 때 함께 정해진다.
  function analyze(used, extra = []) {
    const spent = usedCounts(used);
    const left = (s, e, cell) => cell[0] - (spent.get(key(s, e)) || 0);
    const positions = new Set([...ends.keys(), ...extra]);
    const targets = new Map();  // 위치 → Map(상대가 받는 자리(e 또는 e⁻) → 낱말 수)
    const remaining = new Map(); const loops = new Map(); const preds = new Map();
    for (const x of positions) {
      const out = new Map();
      for (const s of startsOf(x)) {
        for (const [e, cell] of pairs.get(s) || []) {
          const n = left(s, e, cell);
          if (n > 0) { const t = landing(s, e); out.set(t, (out.get(t) || 0) + n); }
        }
      }
      const own = minusOne(x); // x의 돌아오는 길(몫몫)로 가면 상대는 x⁻을 받는다
      targets.set(x, out);
      loops.set(x, out.get(own) || 0);
      remaining.set(x, out.size - (out.has(own) ? 1 : 0));
      for (const t of out.keys()) {
        if (t === own) continue;
        if (!preds.has(t)) preds.set(t, []);
        preds.get(t).push(x);
      }
    }
    const status = new Map(); const depth = new Map(); const queue = [];
    const settle = (t, st, d) => { status.set(t, st); depth.set(t, d); queue.push(t); };
    // 필패로 보낼 길이 있어 필승: x⁻도 같은 길이 있으니 필승
    const won = (x, d) => { settle(x, WIN, d); if (loops.get(x)) settle(minusOne(x), WIN, d); };
    // 다른 길이 다 막혔을 때(남은 길 0): 돌아오는 길(몫몫)이 없으면 필패, 홀수 개면 필승, 짝수 개면 필패. x⁻은 하나 적게 센다.
    const parity = (k) => (k % 2 ? WIN : LOSE);
    const closed = (x, d) => {
      const k = loops.get(x);
      settle(x, parity(k), Math.max(d, k));
      if (k) settle(minusOne(x), parity(k - 1), Math.max(d, k - 1));
    };
    for (const x of positions) if (remaining.get(x) === 0) closed(x, 0);
    for (let i = 0; i < queue.length; i += 1) {
      const y = queue[i]; const st = status.get(y); const d = depth.get(y) + 1;
      for (const x of preds.get(y) || []) {
        if (status.has(x)) continue;
        if (st === LOSE) won(x, d);
        else { const r = remaining.get(x) - 1; remaining.set(x, r); if (r === 0) closed(x, d); }
      }
    }
    const total = (x, minus = null) => { // 위치 x에서 낼 수 있는 낱말 수(아직 안 나온 minus 낱말은 이미 썼다고 본다)
      let n = 0; for (const c of (targets.get(x) || new Map()).values()) n += c;
      if (minus && !used.has(minus) && has(minus) && startsOf(x).includes(firstSyllable(minus))) n -= 1;
      return n;
    };
    return { status, depth, targets, spent, total, typeOf: (t) => status.get(t) ?? 0 };
  }

  // 위치 x에서 낼 수 있는 길 목록 [{ s, e, n, t }]. t = 상대가 받는 자리(e 또는 e⁻) — 승패는 항상 t로 본다.
  function movesFrom(x, spent) {
    const list = [];
    for (const s of startsOf(x)) for (const [e, cell] of pairs.get(s) || []) {
      const n = cell[0] - (spent.get(key(s, e)) || 0);
      if (n > 0) list.push({ s, e, n, t: landing(s, e) });
    }
    return list;
  }
  // 길 s→e에서 아직 안 나온 낱말 하나를 무작위로 고른다.
  function wordOf(s, e, used) {
    const pool = wordsIn(pairs.get(s)?.get(e)).filter((w) => !used.has(w));
    return pool.length ? pool[Math.floor(random() * pool.length)] : null;
  }

  // ③ 버티기: 상대가 이어 갈 단어가 가장 적은 길(같으면 오래 버티는 쪽).
  function fewestReplies(moves, a, used) {
    let best = null;
    for (const m of moves) {
      const word = wordOf(m.s, m.e, used); if (!word) continue;
      const replies = a.total(m.e, word);
      const d = a.depth.get(m.t) ?? 0;
      if (!best || replies < best.replies || (replies === best.replies && d > best.d)) best = { word, replies, d };
    }
    return best?.word ?? null;
  }

  // ② 루트 글자에서 끝까지 따라가 보기. 길을 쓰면 그 길의 낱말 수가 하나 줄어든다(두음으로 이어진 다른 위치도 같은 낱말을 쓴다).
  // 루트 밖 글자는 도미노 결과를 믿는다: 필승 글자로 가는 길은 지는 길이라 보지 않는다.
  function searcher(a) {
    const spent = new Map(a.spent);
    let deadline = 0; let visited = 0;
    const replies = (e) => { let n = 0; for (const [t, c] of a.targets.get(e) || []) if (a.typeOf(t) === 0) n += c; return n; };
    const rootMoves = (x) => movesFrom(x, spent).filter((m) => a.typeOf(m.t) === 0).sort((p, q) => replies(p.e) - replies(q.e));
    // x 차례인 사람이 이기는가?
    function wins(x, level) {
      if ((++visited & 255) === 0 && now() > deadline) throw new OutOfTime();
      if (level > MAX_SEARCH_DEPTH) throw new OutOfTime();
      for (const m of rootMoves(x)) {
        const k = key(m.s, m.e);
        spent.set(k, (spent.get(k) || 0) + 1);
        let opponentWins;
        try { opponentWins = wins(m.e, level + 1); } finally { spent.set(k, spent.get(k) - 1); }
        if (!opponentWins) return true;
      }
      return false;
    }
    // 이 길을 내면 이기나? 'win' | 'lose' | 'unknown'(시간 안에 결론 못 냄)
    return function tryMove(m, ms) {
      deadline = now() + ms;
      const k = key(m.s, m.e);
      spent.set(k, (spent.get(k) || 0) + 1);
      try { return wins(m.e, 1) ? 'lose' : 'win'; }
      catch (error) { if (error instanceof OutOfTime) return 'unknown'; throw error; }
      finally { spent.set(k, spent.get(k) - 1); }
    };
  }
  // 후보 길들을 thinkMs 안에 나눠 따져 본다. 처음엔 짧게 한 바퀴, 남은 시간은 결론 안 난 길에 다시 나눠 준다.
  function think(candidates, a, thinkMs) {
    const tryMove = searcher(a);
    const end = now() + thinkMs; const lost = [];
    let unknown = candidates; let firstLap = true;
    while (unknown.length) {
      const left = end - now(); if (left < 5) break;
      const slice = firstLap ? Math.max(10, left / (2 * unknown.length)) : left / unknown.length;
      firstLap = false;
      const next = [];
      for (const [i, m] of unknown.entries()) {
        if (now() >= end) { next.push(...unknown.slice(i)); break; }
        const result = tryMove(m, Math.min(slice, end - now()));
        if (result === 'win') return { win: m };
        (result === 'lose' ? lost : next).push(m);
      }
      unknown = next;
    }
    return { unknown, lost };
  }

  // 컴퓨터 차례: lastWord 다음에 낼 낱말. { word, how: 'win'|'think'|'hold', type } 또는 null(낼 게 없음).
  function pick(lastWord, usedList = [], thinkMs = 5_000) {
    const used = new Set(usedList);
    const x = lastSyllable(lastWord);
    const a = analyze(used, [x]);
    const moves = movesFrom(x, a.spent);
    if (!moves.length) return null;
    const type = a.typeOf(x);
    if (type === WIN) {
      // 필패 글자로 보내는 길 중 가장 빨리 끝나는 것. 그런 길이 없으면 몫몫 홀짝으로 이긴 경우라 돌아오는 길을 낸다.
      const toLose = moves.filter((m) => a.typeOf(m.t) === LOSE);
      const fastest = Math.min(...toLose.map((m) => a.depth.get(m.t) ?? 0));
      const good = toLose.length ? toLose.filter((m) => (a.depth.get(m.t) ?? 0) === fastest) : moves.filter((m) => m.e === x);
      const word = fewestReplies(good, a, used);
      if (word) return { word, how: 'win', type: 'win' };
    }
    if (type === 0) {
      const roots = moves.filter((m) => a.typeOf(m.t) === 0);
      const { win, unknown = [] } = think(roots, a, thinkMs);
      if (win) return { word: wordOf(win.s, win.e, used), how: 'think', type: 'root', proven: true };
      if (unknown.length) return { word: fewestReplies(unknown, a, used), how: 'think', type: 'root', proven: false };
    }
    return { word: fewestReplies(moves, a, used), how: 'hold', type: type === LOSE ? 'lose' : type === WIN ? 'win' : 'root' };
  }

  // 컴퓨터가 먼저 할 때 첫 낱말. 첫 단어로 한방단어는 못 쓰니(규칙) 상대를 "필패지만 이어 갈 단어는 있는" 글자로 보낸다.
  // 그런 낱말이 없으면 루트 글자로 가는 낱말 몇 개를 깊이 따져 보고, 그래도 없으면 루트 글자로 가는 아무 낱말.
  function opener(usedList = [], thinkMs = 5_000) {
    const used = new Set(usedList);
    const a = analyze(used);
    const paths = [];
    for (const [s, row] of pairs) for (const [e, cell] of row) {
      const n = cell[0] - (a.spent.get(key(s, e)) || 0);
      if (n > 0) paths.push({ s, e, n, t: landing(s, e) });
    }
    const traps = paths.filter((m) => a.typeOf(m.t) === LOSE && (a.depth.get(m.t) ?? 0) >= 1);
    if (traps.length) {
      const m = traps[Math.floor(random() * traps.length)];
      const word = wordOf(m.s, m.e, used);
      if (word && a.total(m.e, word) > 0) return { word, how: 'win', type: 'win' };
    }
    const roots = paths.filter((m) => a.typeOf(m.t) === 0);
    if (!roots.length) return null;
    const sample = roots.sort(() => random() - 0.5).slice(0, OPENER_SAMPLES);
    const { win, unknown = [] } = think(sample, a, thinkMs);
    const m = win || unknown[0] || sample[0];
    return { word: wordOf(m.s, m.e, used), how: 'think', type: 'root', proven: Boolean(win) };
  }

  // 🔍 단어 순찰용: 끝말잇기에서 실제로 받게 되는 시작 글자들(어떤 낱말의 끝 글자에서 두음법칙으로 시작할 수 있는 글자),
  // 그 글자로 시작하는 낱말이 적은 순서. 낱말이 0~몇 개뿐인 글자에 새 낱말이 생기면 승패가 뒤집히므로 먼저 본다.
  function patrolTargets() {
    const counts = new Map();
    for (const e of ends.keys()) for (const s of startsOf(e)) {
      if (counts.has(s)) continue;
      let n = 0; for (const cell of (pairs.get(s) || new Map()).values()) n += cell[0];
      counts.set(s, n);
    }
    return [...counts].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).map(([s]) => s);
  }
  // 이 글자로 시작하는 지도 낱말 전부.
  const wordsStarting = (s) => [...(pairs.get(s) || new Map()).values()].flatMap(wordsIn);

  return { add, remove, has, get size() { return count; }, analyze, pick, opener, patrolTargets, wordsStarting, WIN, LOSE };
}

// 단어 지도 파일 글(한 줄에 한 낱말)로 두뇌를 만든다. removed는 빼고 added는 더한다(지도 밖 변화 기록).
// 일꾼에게는 낱말 배열 대신 글 한 덩어리를 넘겨, 불러오는 순간 메모리를 두 배로 쓰지 않게 한다.
function engineFromText({ text = '', added = [], removed = [] }, options) {
  const gone = new Set(removed);
  const words = [];
  for (const line of text.split('\n')) { const word = line.trim(); if (word && !gone.has(word)) words.push(word); }
  for (const word of added) words.push(word);
  return createMasterEngine(words, options);
}

module.exports = { createMasterEngine, engineFromText };
