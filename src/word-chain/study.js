// 성장 컴퓨터의 "미리 공부하기": 아무도 게임하지 않는 틈에 한글 글자를 하나씩 사전에 물어 한방 글자를 찾고,
// 그 글자로 끝나는 단어를 📒 한방 노트에 적는다. 사람에게 지지 않아도 컴퓨터가 강해진다.
//   - 게임 중(최근 30초 안에 사전을 쓴 게임이 있으면)에는 쉬어서 친구들 게임이 느려지지 않게 한다.
//   - 사전마다 하루(한국 시간) 1,000번까지만 묻는다. 진행 위치·오늘 쓴 횟수는 파일·Gist에 남겨 서버가 잠들어도 이어서 한다.
//   - 한방 단어장에 이미 답이 있는 글자는 묻지 않고 건너뛴다(6개월이 지나 잊으면 다음 바퀴에 다시 확인).
const fs = require('fs');
const path = require('path');
const { lastSyllable } = require('./rules');

const DAILY_BUDGET = 1_000;
const STEP_MS = 3_000;        // 한 글자 공부 사이 쉬는 시간
const IDLE_MS = 30_000;       // 게임이 이만큼 조용해야 공부한다
const BACKOFF_MS = 60_000;    // 사전이 대답을 못 하면 이만큼 쉬었다 다시
const SKIP_PER_STEP = 500;    // 한 번에 건너뛸 수 있는 "이미 아는 글자" 수
const END_PAGES = 3;          // 한방 글자로 끝나는 단어는 최대 300개까지 적는다
const REMOTE_NAME = 'word-chain-study.json';
const WRITE_DELAY_MS = 2_000;
const SYLLABLES = Array.from({ length: 0xd7a3 - 0xac00 + 1 }, (_, i) => String.fromCharCode(0xac00 + i)); // 가~힣 11,172자

// 한국 시간 날짜("2026-10-05"). 하루 공부량은 이 날짜가 바뀌면 다시 0부터.
const koreaDay = (now = Date.now()) => new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

function createStudy({ dictionary, brain, dictionaries, filePath = null, remote = null, budget = DAILY_BUDGET,
  stepMs = STEP_MS, idleMs = IDLE_MS, backoffMs = BACKOFF_MS, now = Date.now } = {}) {
  const progress = {}; // 사전 → { cursor, day, used }
  let lastGameAt = 0;
  let timer = null;
  let running = false;
  let pausedUntil = 0;
  let turn = 0;
  let writeTimer = null;

  const stateOf = (dict) => (progress[dict] ||= { cursor: 0, day: koreaDay(now()), used: 0 });
  // 저장된 진행 상황을 합친다. 같은 사전이면 더 많이 나아간 쪽·오늘 더 많이 쓴 쪽을 믿는다(한도를 넘지 않게).
  function absorb(saved) {
    for (const [dict, value] of Object.entries(saved?.progress || {})) {
      if (!dictionaries.includes(dict) || !Number.isInteger(value?.cursor)) continue;
      const mine = stateOf(dict);
      mine.cursor = Math.max(mine.cursor, value.cursor % SYLLABLES.length);
      if (value.day === mine.day) mine.used = Math.max(mine.used, Number(value.used) || 0);
    }
  }
  if (filePath) {
    try { absorb(JSON.parse(fs.readFileSync(filePath, 'utf8'))); } catch { /* 처음이면 '가'부터 */ }
  }
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
        .catch((error) => console.error('[word-chain] 공부 진행 저장 실패:', error.message));
    }, WRITE_DELAY_MS);
    writeTimer.unref?.();
  }

  // 글자 하나를 공부한다. 공부했으면 true, 오늘 할 일이 없으면 false.
  async function studyOne(dict) {
    const state = stateOf(dict);
    const today = koreaDay(now());
    if (state.day !== today) Object.assign(state, { day: today, used: 0 });
    if (state.used >= budget || !dictionary.isConfigured(dict)) return false;
    // 이미 답을 아는 글자는 사전에 묻지 않고 건너뛴다.
    for (let skipped = 0; skipped < SKIP_PER_STEP && dictionary.knownContinuation(dict, SYLLABLES[state.cursor]) !== undefined; skipped += 1) {
      state.cursor = (state.cursor + 1) % SYLLABLES.length;
    }
    const syllable = SYLLABLES[state.cursor];
    if (dictionary.knownContinuation(dict, syllable) !== undefined) { saveSoon(); return true; }
    const before = dictionary.requests;
    try {
      if (!(await dictionary.hasContinuation(dict, syllable))) {
        for (const { word, definition } of await dictionary.wordsEndingWith(dict, syllable, END_PAGES)) {
          if (lastSyllable(word) === syllable) brain.remember(dict, word, definition, 'shot');
        }
      } else {
        // 이어 갈 단어가 자기 자신 하나뿐인 글자(늡 → 늡늡)라면, 그 단어는 내는 순간 한방이다.
        const few = dictionary.fewContinuations(dict, syllable);
        if (few?.length === 1 && lastSyllable(few[0]) === syllable) brain.remember(dict, few[0], '', 'shot');
      }
      state.cursor = (state.cursor + 1) % SYLLABLES.length;
      return true;
    } finally {
      state.used += Math.max(1, dictionary.requests - before); // 같은 때 게임이 물은 것까지 세질 수 있어 한도를 넘지 않는 쪽으로 센다
      saveSoon();
    }
  }

  // 사전들을 번갈아 가며 한 글자씩 공부한다.
  async function step() {
    if (running || now() < pausedUntil || now() - lastGameAt < idleMs) return;
    running = true;
    try {
      for (let i = 0; i < dictionaries.length; i += 1) {
        const dict = dictionaries[(turn + i) % dictionaries.length];
        if (await studyOne(dict)) { turn = (turn + i + 1) % dictionaries.length; return; }
      }
    } catch (error) {
      pausedUntil = now() + backoffMs; // 사전 서버가 불안정하면 잠깐 쉰다(진행 위치는 그대로라 그 글자부터 다시)
      console.error('[word-chain] 미리 공부하기 잠시 쉼:', error.message);
    } finally { running = false; }
  }

  return {
    ready,
    step,
    // 게임이 사전을 쓰면 부른다. 그 뒤 30초 동안은 공부를 쉰다.
    gameActive() { lastGameAt = now(); },
    start() { if (!timer) { timer = setInterval(step, stepMs); timer.unref?.(); } },
    stop() { clearInterval(timer); timer = null; },
    // 화면에 보여 줄 공부 진행 상황(이번 바퀴에서 몇 번째 글자까지 왔는지).
    info(dict) { const state = stateOf(dict); return { studied: state.cursor, total: SYLLABLES.length, usedToday: state.day === koreaDay(now()) ? state.used : 0, budget }; },
    flush: () => remote?.flush()
  };
}

module.exports = { createStudy, SYLLABLES, koreaDay };
