// 🏆 고수 컴퓨터를 서버에 붙이는 곳. 두뇌(master-engine.js)는 수를 읽느라 몇 초씩 걸리므로 따로 일하는 일꾼(worker_threads)에서 돌려,
// 그동안 다른 게임방·요청이 멈추지 않게 한다. 사전마다 일꾼 하나, 요청은 차례로 처리한다.
//   단어 지도: data/word-chain-words-<사전>.txt(scripts/collect-words.js로 만듦, Git 제외). 없으면 Gist의 같은 이름 파일을 받는다.
//   지도 밖 변화: 사람이 낸 새 낱말(사전 확인 통과)은 더하고(learn), 사전에서 빠진 낱말은 지운다(forget).
//   이 기록은 word-chain-words-extra.json(파일 + Gist)에 남아 서버가 다시 켜져도 지도에 다시 적용된다.
const fs = require('fs');
const path = require('path');
const { Worker } = require('worker_threads');
const { engineFromText } = require('./master-engine');

const REMOTE_NAME = 'word-chain-words-extra.json';
const WRITE_DELAY_MS = 2_000;
const MIN_THINK_SECONDS = 1;
const MAX_THINK_SECONDS = 60;
const DEFAULT_THINK_SECONDS = 5;
const WORKER_HEAP_MB = 192;
const wordsFileName = (dict) => `word-chain-words-${dict}.txt`;

// 화면에서 받은 생각 시간(초)을 1~60초로 맞춘다. 숫자가 아니면 기본 5초.
function thinkSeconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_THINK_SECONDS;
  return Math.min(MAX_THINK_SECONDS, Math.max(MIN_THINK_SECONDS, Math.round(n)));
}

// 단어 지도 파일 글(한 줄에 한 낱말)을 읽는다: 내 컴퓨터의 data 폴더 → 없으면 Gist. 둘 다 없으면 null(고수 컴퓨터는 "준비 중").
// 낱말 배열로 자르지 않고 글 그대로 일꾼에게 넘긴다(불러오는 순간 메모리를 두 배로 쓰지 않게).
async function loadWordList(dict, { dir, token, gistId, fetchImpl = globalThis.fetch } = {}) {
  const local = path.join(dir, wordsFileName(dict));
  let text = null;
  try { text = await fs.promises.readFile(local, 'utf8'); } catch { /* 없으면 Gist에서 */ }
  if (text === null && token && gistId) {
    const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'group-game-collection' };
    const gist = await (await fetchImpl(`https://api.github.com/gists/${gistId}`, { headers, signal: AbortSignal.timeout(30_000) })).json();
    const file = gist.files?.[wordsFileName(dict)];
    if (file) text = await (await fetchImpl(file.raw_url, { headers, signal: AbortSignal.timeout(60_000) })).text();
  }
  return text;
}

// 지도에 더한 낱말·지운 낱말 기록(사전별). 저장 방식은 brain.js와 같다(모아서 파일 쓰기 + Gist).
function createExtras(filePath, { remote = null } = {}) {
  const added = new Map(); const removed = new Map(); // 사전 → Set(낱말)
  const setOf = (map, dict) => { if (!map.has(dict)) map.set(dict, new Set()); return map.get(dict); };
  let timer = null; let writing = Promise.resolve();
  const snapshot = () => JSON.stringify({ version: 1,
    added: Object.fromEntries([...added].map(([d, s]) => [d, [...s]])), removed: Object.fromEntries([...removed].map(([d, s]) => [d, [...s]])) });
  function flush() {
    timer = null;
    if (!filePath) return writing;
    const body = snapshot();
    writing = writing.then(async () => {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(`${filePath}.tmp`, body);
      await fs.promises.rename(`${filePath}.tmp`, filePath);
    }).catch((error) => console.error('[word-chain] 고수 컴퓨터 단어 기록 저장 실패:', error.message));
    return writing;
  }
  function changed() {
    if (filePath && !timer) { timer = setTimeout(flush, WRITE_DELAY_MS); timer.unref?.(); }
    remote?.save(REMOTE_NAME);
  }
  // 저장본을 합친다. 이미 이쪽에서 정한 낱말(더함/지움)은 그대로 둔다.
  function absorb(saved) {
    for (const [kind, mine, other] of [['added', added, removed], ['removed', removed, added]]) {
      for (const [dict, list] of Object.entries(saved?.[kind] || {})) {
        for (const word of Array.isArray(list) ? list : []) if (!setOf(mine, dict).has(word) && !setOf(other, dict).has(word)) setOf(mine, dict).add(String(word));
      }
    }
  }
  if (filePath) { try { absorb(JSON.parse(fs.readFileSync(filePath, 'utf8'))); } catch { /* 처음이면 기록 없음 */ } }
  const ready = remote ? remote.attach(REMOTE_NAME, { absorb, snapshot }) : Promise.resolve();
  const mark = (yes, no, dict, word) => { setOf(no, dict).delete(word); if (!setOf(yes, dict).has(word)) { setOf(yes, dict).add(word); changed(); } };
  return {
    ready,
    added: (dict) => [...setOf(added, dict)],
    removed: (dict) => [...setOf(removed, dict)],
    learn: (dict, word) => mark(added, removed, dict, word),
    forget: (dict, word) => mark(removed, added, dict, word),
    flush: () => { clearTimeout(timer); return Promise.all([flush(), remote?.flush()]); }
  };
}

// 두뇌 하나(사전 하나)를 일꾼에서, 또는 inline(테스트)이면 지금 스레드에서 돌린다. 메서드는 모두 Promise를 돌려준다.
// data = { text, added, removed } (master-engine.js engineFromText 참고)
function spawnBrain(data, { inline = false, random } = {}) {
  if (inline) {
    const engine = engineFromText(data, { random });
    const call = (op, ...args) => Promise.resolve().then(() => (op === 'size' ? engine.size : engine[op](...args)));
    return { call, close: () => {} };
  }
  // 일꾼 메모리 한도: 넉넉하면 V8이 쓰레기를 늦게 치워 지도를 만드는 순간 Render 무료 서버(512MB)를 넘을 수 있다.
  // 한도 안에서는 자주 치운다(우리말샘 지도는 다 만든 뒤 약 70MB, 만드는 동안 잠깐 더 쓴다).
  const worker = new Worker(path.join(__dirname, 'master-worker.js'), { workerData: data, resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB } });
  worker.unref();
  const waiting = new Map(); let nextId = 1;
  const failAll = (error) => { for (const { reject } of waiting.values()) reject(error); waiting.clear(); };
  worker.on('message', ({ id, result, error }) => {
    const job = waiting.get(id); if (!job) return;
    waiting.delete(id);
    if (error) job.reject(new Error(error)); else job.resolve(result);
  });
  worker.on('error', failAll);
  worker.on('exit', (code) => failAll(new Error(`고수 컴퓨터 일꾼이 멈췄어요(${code}).`)));
  const call = (op, ...args) => new Promise((resolve, reject) => {
    const id = nextId++; waiting.set(id, { resolve, reject });
    worker.postMessage({ id, op, args });
  });
  return { call, close: () => worker.terminate() };
}

// loadWords(사전) → Promise<지도 글(한 줄에 한 낱말)|낱말 배열|null>. dictionaries: 고수 컴퓨터를 켤 사전들.
function createMaster({ loadWords, dictionaries = ['stdict'], extras = createExtras(null), inline = false, random = Math.random } = {}) {
  const brains = new Map(); // 사전 → { state: 'loading'|'ready'|'missing', brain, promise }
  function load(dict) {
    if (!dictionaries.includes(dict)) return null;
    if (brains.has(dict)) return brains.get(dict).promise;
    const entry = { state: 'loading', brain: null };
    entry.promise = (async () => {
      try {
        const [loaded] = await Promise.all([loadWords(dict), extras.ready]);
        const text = Array.isArray(loaded) ? loaded.join('\n') : loaded;
        if (!text?.trim()) { entry.state = 'missing'; return null; }
        entry.brain = spawnBrain({ text, added: extras.added(dict), removed: extras.removed(dict) }, { inline, random });
        const size = await entry.brain.call('size'); // 일꾼이 지도를 다 만들 때까지 기다린다
        entry.state = 'ready';
        console.log(`[word-chain] 🏆 고수 컴퓨터 ${dict} 단어 지도 준비 완료(${size.toLocaleString()}개)`);
        return entry.brain;
      } catch (error) {
        console.error(`[word-chain] 고수 컴퓨터 ${dict} 단어 지도를 불러오지 못했어요:`, error.message);
        entry.state = 'missing'; return null;
      }
    })();
    brains.set(dict, entry);
    return entry.promise;
  }
  const readyBrain = (dict) => (brains.get(dict)?.state === 'ready' ? brains.get(dict).brain : null);
  return {
    // 사전 지도를 차례로 불러온다(동시에 불러오면 잠깐 메모리를 많이 쓴다)
    async start() { for (const dict of dictionaries) await load(dict); },
    // 'ready' | 'loading' | 'missing' | 'off'(이 사전은 고수 컴퓨터가 없음)
    status: (dict) => (!dictionaries.includes(dict) ? 'off' : brains.get(dict)?.state ?? 'loading'),
    async pick(dict, lastWord, used, seconds) { return readyBrain(dict)?.call('pick', lastWord, [...used], thinkSeconds(seconds) * 1000) ?? null; },
    async opener(dict, used, seconds) { return readyBrain(dict)?.call('opener', [...used], thinkSeconds(seconds) * 1000) ?? null; },
    // 사전 확인을 통과한 낱말이 지도에 없으면 더한다(사전에 새로 생긴 낱말).
    // 🔍 단어 순찰용(patrol.js): 확인할 시작 글자 목록, 그 글자로 시작하는 지도 낱말들. 지도가 준비 안 됐으면 null.
    async patrolTargets(dict) { return readyBrain(dict)?.call('patrolTargets') ?? null; },
    async wordsStarting(dict, syllable) { return readyBrain(dict)?.call('wordsStarting', syllable) ?? null; },
    async learn(dict, word) {
      const brain = readyBrain(dict); if (!brain) return false;
      const added = await brain.call('add', word);
      if (added) extras.learn(dict, word);
      return added;
    },
    // 사전에서 빠진 낱말을 지도에서 지운다.
    async forget(dict, word) {
      const brain = readyBrain(dict); if (!brain) return false;
      await brain.call('remove', word);
      extras.forget(dict, word);
      return true;
    },
    flush: () => extras.flush(),
    close() { for (const entry of brains.values()) entry.brain?.close(); }
  };
}

module.exports = { createMaster, createExtras, loadWordList, thinkSeconds, DEFAULT_THINK_SECONDS, MIN_THINK_SECONDS, MAX_THINK_SECONDS };
