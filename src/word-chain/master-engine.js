// 🏆 고수 컴퓨터의 두뇌. 사전 전체 낱말로 "단어 지도"를 만들고 수를 읽는다(끝말잇기 엔진 ggeugle의 방법을 우리 규칙으로 새로 짰다).
//   위치 = 방금 나온 단어의 끝 글자 X. 갈 수 있는 길 = 시작 글자가 allowedStarts(X)(두음법칙 포함)인 아직 안 나온 낱말.
//   ① 승패 도미노(역행 분석): 길이 없는 글자는 필패 → 필패로 보낼 수 있는 글자는 필승 → 모든 길이 필승으로 가는 글자는 필패 …
//      길이 자기 자신으로 돌아오는 단어(몫몫)뿐이면 그 수가 홀수면 필승, 짝수면 필패.
//   ② 끝까지 안 정해진 글자(루트)는 정해진 시간 동안 끝까지 따라가 본다(이기는 수를 찾으면 바로 낸다).
//   ③ 질 수밖에 없으면 상대가 이어 갈 단어가 가장 적은 수(사람은 사전 없이 찾기 어렵다).
// 같은 첫 글자·끝 글자 낱말(각가속도·각도 = 각→도)은 결과가 같아서 "길 하나에 낱말 n개"로 묶어 계산한다.
// 이번 판에 나온 단어는 지도에서 뺀 채로 매번 다시 계산한다(단어가 나오면 길이 사라져 승패가 바뀔 수 있다).
// 이 파일은 계산만 한다. 시간이 오래 걸리므로 서버에서는 master.js가 따로 일하는 일꾼(worker_threads)에서 돌린다.
const { allowedStarts, firstSyllable, lastSyllable, isHangulWord, syllables, WORD_MIN } = require('./rules');

const WIN = 1; const LOSE = 2; // 정해지지 않은 글자(루트)는 0
const MAX_SEARCH_DEPTH = 2_000; // 너무 깊으면 "모름"으로 본다(호출 스택 보호)
const OPENER_SAMPLES = 24;      // 첫 단어를 깊이 생각할 때 살펴볼 후보 수
class OutOfTime extends Error {}

function createMasterEngine(words = [], { random = Math.random, now = () => performance.now() } = {}) {
  const pairs = new Map();  // 첫 글자 → Map(끝 글자 → Set(낱말))
  const ends = new Map();   // 끝 글자 → 그 글자로 끝나는 낱말 수(위치가 될 수 있는 글자들)
  const all = new Set();
  const startsCache = new Map();
  const startsOf = (x) => { let s = startsCache.get(x); if (!s) { s = allowedStarts(x); startsCache.set(x, s); } return s; };

  function add(word) {
    const s = firstSyllable(word); const e = lastSyllable(word);
    if (all.has(word) || !isHangulWord(word) || syllables(word).length < WORD_MIN) return false;
    all.add(word);
    if (!pairs.has(s)) pairs.set(s, new Map());
    const row = pairs.get(s);
    if (!row.has(e)) row.set(e, new Set());
    row.get(e).add(word);
    ends.set(e, (ends.get(e) || 0) + 1);
    return true;
  }
  function remove(word) {
    if (!all.delete(word)) return false;
    const s = firstSyllable(word); const e = lastSyllable(word);
    const row = pairs.get(s); row.get(e).delete(word);
    if (!row.get(e).size) row.delete(e);
    if (!row.size) pairs.delete(s);
    if (ends.get(e) === 1) ends.delete(e); else ends.set(e, ends.get(e) - 1);
    return true;
  }
  for (const word of words) add(word);

  // 이번 판에 나온 단어 수를 길(첫 글자→끝 글자)마다 센다.
  const key = (s, e) => `${s}\u0000${e}`;
  function usedCounts(used) {
    const counts = new Map();
    for (const word of used) {
      if (!all.has(word)) continue;
      const k = key(firstSyllable(word), lastSyllable(word));
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return counts;
  }

  // ① 승패 도미노. 돌려주는 값으로 각 글자의 승패·깊이(몇 수 만에 끝나는지)와 남은 길을 알 수 있다.
  function analyze(used, extra = []) {
    const spent = usedCounts(used);
    const left = (s, e, set) => set.size - (spent.get(key(s, e)) || 0);
    const positions = new Set([...ends.keys(), ...extra]);
    const targets = new Map();  // 위치 → Map(다음 위치 → 낱말 수)
    const remaining = new Map(); const loops = new Map(); const preds = new Map();
    for (const x of positions) {
      const out = new Map();
      for (const s of startsOf(x)) {
        for (const [e, set] of pairs.get(s) || []) {
          const n = left(s, e, set);
          if (n > 0) out.set(e, (out.get(e) || 0) + n);
        }
      }
      targets.set(x, out);
      loops.set(x, out.get(x) || 0);
      remaining.set(x, out.size - (out.has(x) ? 1 : 0));
      for (const e of out.keys()) {
        if (e === x) continue;
        if (!preds.has(e)) preds.set(e, []);
        preds.get(e).push(x);
      }
    }
    const status = new Map(); const depth = new Map(); const queue = [];
    const settle = (x, st, d) => { status.set(x, st); depth.set(x, d); queue.push(x); };
    // 다른 길이 다 막혔을 때(남은 길 0): 돌아오는 길(몫몫)이 없으면 필패, 홀수 개면 필승, 짝수 개면 필패
    const closed = (x, d) => { const k = loops.get(x); settle(x, k % 2 ? WIN : LOSE, k ? Math.max(d, k) : d); };
    for (const x of positions) if (remaining.get(x) === 0) closed(x, 0);
    for (let i = 0; i < queue.length; i += 1) {
      const y = queue[i]; const st = status.get(y); const d = depth.get(y) + 1;
      for (const x of preds.get(y) || []) {
        if (status.has(x)) continue;
        if (st === LOSE) settle(x, WIN, d);
        else { const r = remaining.get(x) - 1; remaining.set(x, r); if (r === 0) closed(x, d); }
      }
    }
    const total = (x, minus = null) => { // 위치 x에서 낼 수 있는 낱말 수(minus 낱말은 이미 썼다고 본다)
      let n = 0; for (const c of (targets.get(x) || new Map()).values()) n += c;
      if (minus && startsOf(x).includes(firstSyllable(minus)) && targets.get(x)?.has(lastSyllable(minus))) n -= 1;
      return n;
    };
    return { status, depth, targets, spent, total, typeOf: (x) => status.get(x) ?? 0 };
  }

  // 위치 x에서 낼 수 있는 길 목록 [{ s, e, n }].
  function movesFrom(x, spent) {
    const list = [];
    for (const s of startsOf(x)) for (const [e, set] of pairs.get(s) || []) {
      const n = set.size - (spent.get(key(s, e)) || 0);
      if (n > 0) list.push({ s, e, n });
    }
    return list;
  }
  // 길 s→e에서 아직 안 나온 낱말 하나를 무작위로 고른다.
  function wordOf(s, e, used) {
    const pool = [...(pairs.get(s)?.get(e) || [])].filter((w) => !used.has(w));
    return pool.length ? pool[Math.floor(random() * pool.length)] : null;
  }

  // ③ 버티기: 상대가 이어 갈 단어가 가장 적은 길(같으면 오래 버티는 쪽).
  function fewestReplies(moves, a, used) {
    let best = null;
    for (const m of moves) {
      const word = wordOf(m.s, m.e, used); if (!word) continue;
      const replies = a.total(m.e, word);
      const d = a.depth.get(m.e) ?? 0;
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
    const rootMoves = (x) => movesFrom(x, spent).filter((m) => a.typeOf(m.e) === 0).sort((p, q) => replies(p.e) - replies(q.e));
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
      const toLose = moves.filter((m) => a.typeOf(m.e) === LOSE);
      const fastest = Math.min(...toLose.map((m) => a.depth.get(m.e) ?? 0));
      const good = toLose.length ? toLose.filter((m) => (a.depth.get(m.e) ?? 0) === fastest) : moves.filter((m) => m.e === x);
      const word = fewestReplies(good, a, used);
      if (word) return { word, how: 'win', type: 'win' };
    }
    if (type === 0) {
      const roots = moves.filter((m) => a.typeOf(m.e) === 0);
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
    for (const [s, row] of pairs) for (const [e, set] of row) {
      const n = set.size - (a.spent.get(key(s, e)) || 0);
      if (n > 0) paths.push({ s, e, n });
    }
    const traps = paths.filter((m) => a.typeOf(m.e) === LOSE && (a.depth.get(m.e) ?? 0) >= 1);
    if (traps.length) {
      const m = traps[Math.floor(random() * traps.length)];
      const word = wordOf(m.s, m.e, used);
      if (word && a.total(m.e, word) > 0) return { word, how: 'win', type: 'win' };
    }
    const roots = paths.filter((m) => a.typeOf(m.e) === 0);
    if (!roots.length) return null;
    const sample = roots.sort(() => random() - 0.5).slice(0, OPENER_SAMPLES);
    const { win, unknown = [] } = think(sample, a, thinkMs);
    const m = win || unknown[0] || sample[0];
    return { word: wordOf(m.s, m.e, used), how: 'think', type: 'root', proven: Boolean(win) };
  }

  return { add, remove, has: (word) => all.has(word), get size() { return all.size; }, analyze, pick, opener, WIN, LOSE };
}

module.exports = { createMasterEngine };
