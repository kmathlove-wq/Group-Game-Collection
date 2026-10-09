// 🔍 고수 컴퓨터의 "단어 순찰": 아무도 게임하지 않는 틈에 단어 지도의 중요한 시작 글자를 하나씩 사전에 다시 물어,
// 사전에 새로 생긴 낱말은 지도에 더하고 사라진 낱말은 지운다(우리말샘은 거의 매일 낱말이 늘어난다).
//   - 어떤 글자를 볼지는 두뇌가 정한다(master-engine.js patrolTargets): 실제로 받게 되는 시작 글자 중 낱말이 적은 글자부터.
//     '가'(1만 개 넘음)에 하나 느는 건 승패에 거의 상관없지만, '릅'(0개)에 하나 생기면 승패가 뒤집힌다.
//   - 한 글자에 첫 묶음(100개) 한 번만 묻는다. 100개 이하라 전부 받았을 때만 "지도에만 있는 낱말"을 사라진 후보로 보고,
//     그것도 정확히 찾기(lookup)로 다시 확인해서 정말 없을 때만 지운다(사전이 잠깐 빈 답을 줘도 멀쩡한 낱말을 지우지 않게).
//     한 번에 사라진 후보가 너무 많으면(REMOVE_LIMIT) 이상한 답으로 보고 지우지 않는다.
//   - 게임 중엔 쉬고(최근 30초), 사전마다 하루(한국 시간) 2,000번까지. 진행 위치는 파일·Gist에 남는다(미리 공부하기와 같은 방식).
const fs = require('fs');
const path = require('path');
const { koreaDay } = require('./study');

const DAILY_BUDGET = 2_000;
const STEP_MS = 3_000;
const IDLE_MS = 30_000;
const BACKOFF_MS = 60_000;
const REMOVE_LIMIT = 5;
const REMOTE_NAME = 'word-chain-patrol.json';
const WRITE_DELAY_MS = 2_000;

function createPatrol({ dictionary, master, dictionaries, filePath = null, remote = null, budget = DAILY_BUDGET,
  stepMs = STEP_MS, idleMs = IDLE_MS, backoffMs = BACKOFF_MS, now = Date.now } = {}) {
  const progress = {}; // 사전 → { cursor, round, day, used, added, removed }
  const targets = new Map(); // 사전 → 이번 바퀴에 볼 시작 글자 목록(바퀴가 끝나면 다시 받는다)
  let lastGameAt = 0; let timer = null; let running = false; let pausedUntil = 0; let turn = 0; let writeTimer = null;

  const stateOf = (dict) => (progress[dict] ||= { cursor: 0, round: 0, day: koreaDay(now()), used: 0, added: 0, removed: 0 });
  // 저장본을 합친다: 더 많이 나아간 쪽, 오늘 더 많이 쓴 쪽을 믿는다(한도를 넘지 않게).
  function absorb(saved) {
    for (const [dict, value] of Object.entries(saved?.progress || {})) {
      if (!dictionaries.includes(dict) || !Number.isInteger(value?.cursor)) continue;
      const mine = stateOf(dict);
      if ((value.round || 0) > mine.round || ((value.round || 0) === mine.round && value.cursor > mine.cursor)) Object.assign(mine, { cursor: value.cursor, round: value.round || 0 });
      if (value.day === mine.day) for (const k of ['used', 'added', 'removed']) mine[k] = Math.max(mine[k], Number(value[k]) || 0);
    }
  }
  if (filePath) { try { absorb(JSON.parse(fs.readFileSync(filePath, 'utf8'))); } catch { /* 처음이면 처음부터 */ } }
  const snapshot = () => JSON.stringify({ version: 1, progress });
  const ready = remote ? remote.attach(REMOTE_NAME, { absorb, snapshot }) : Promise.resolve();
  function saveSoon() {
    remote?.save(REMOTE_NAME);
    if (!filePath || writeTimer) return;
    writeTimer = setTimeout(() => {
      writeTimer = null;
      fs.promises.mkdir(path.dirname(filePath), { recursive: true })
        .then(() => fs.promises.writeFile(`${filePath}.tmp`, snapshot()))
        .then(() => fs.promises.rename(`${filePath}.tmp`, filePath))
        .catch((error) => console.error('[word-chain] 단어 순찰 진행 저장 실패:', error.message));
    }, WRITE_DELAY_MS);
    writeTimer.unref?.();
  }

  // 글자 하나를 순찰한다. 했으면 true, 오늘 할 일이 없으면 false.
  async function patrolOne(dict) {
    const state = stateOf(dict);
    const today = koreaDay(now());
    if (state.day !== today) Object.assign(state, { day: today, used: 0, added: 0, removed: 0 });
    if (state.used >= budget || !dictionary.isConfigured(dict) || master.status(dict) !== 'ready') return false;
    if (!targets.get(dict)?.length) targets.set(dict, (await master.patrolTargets(dict)) || []);
    const list = targets.get(dict);
    if (!list.length) return false;
    if (state.cursor >= list.length) state.cursor = 0;
    const syllable = list[state.cursor];
    const before = dictionary.requests;
    try {
      const fresh = await dictionary.wordsStartingWith(dict, syllable);
      const known = new Set((await master.wordsStarting(dict, syllable)) || []);
      for (const word of fresh.words) if (!known.has(word) && await master.learn(dict, word)) state.added += 1;
      if (fresh.complete) {
        const kept = new Set(fresh.words);
        const missing = [...known].filter((word) => !kept.has(word));
        if (missing.length > REMOVE_LIMIT) console.warn(`[word-chain] 단어 순찰: ${dict} '${syllable}'에서 사라진 낱말이 ${missing.length}개라 이상해서 지우지 않았어요.`);
        else {
          for (const word of missing) {
            const found = await dictionary.lookup(dict, word);
            if (!found.found && await master.forget(dict, word)) state.removed += 1;
          }
        }
      }
      state.cursor += 1;
      if (state.cursor >= list.length) { state.cursor = 0; state.round += 1; targets.delete(dict); } // 한 바퀴 끝: 다음 바퀴엔 목록을 새로 받는다
      return true;
    } finally {
      state.used += Math.max(1, dictionary.requests - before);
      saveSoon();
    }
  }

  async function step() {
    if (running || now() < pausedUntil || now() - lastGameAt < idleMs) return;
    running = true;
    try {
      for (let i = 0; i < dictionaries.length; i += 1) {
        const dict = dictionaries[(turn + i) % dictionaries.length];
        if (await patrolOne(dict)) { turn = (turn + i + 1) % dictionaries.length; return; }
      }
    } catch (error) {
      pausedUntil = now() + backoffMs; // 사전이 불안정하면 잠깐 쉰다(그 글자부터 다시)
      console.error('[word-chain] 단어 순찰 잠시 쉼:', error.message);
    } finally { running = false; }
  }

  return {
    ready,
    step,
    gameActive() { lastGameAt = now(); },
    start() { if (!timer) { timer = setInterval(step, stepMs); timer.unref?.(); } },
    stop() { clearInterval(timer); timer = null; },
    // 순찰 현황: 이번 바퀴에서 몇 번째 글자인지, 몇 바퀴 돌았는지, 오늘 더하고 지운 낱말 수.
    info(dict) {
      const state = stateOf(dict); const today = state.day === koreaDay(now());
      return { checked: state.cursor, total: targets.get(dict)?.length ?? null, round: state.round,
        usedToday: today ? state.used : 0, addedToday: today ? state.added : 0, removedToday: today ? state.removed : 0, budget };
    },
    flush: () => remote?.flush()
  };
}

module.exports = { createPatrol };
