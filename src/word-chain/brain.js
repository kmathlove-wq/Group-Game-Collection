// 컴퓨터의 "기억 노트": 사람에게 진 판의 마지막 세 단어(사람 A → 컴퓨터 B → 사람 C💥)를 종류별로 적어 둔다.
//   shot(📒 한방): C — 그 글자가 오면 꺼내 써서 이긴다
//   trap(🪤 함정): A — 컴퓨터가 먼저 써서 사람이 B로 막으면 C로 끝내는 2단 공격
//   risky(🚫 조심): B — 같은 글자가 와도 되도록 다른 단어로 막는다
//   hard(🧩 어려운): 한방인 줄 알았는데 사전이 바뀌어 이어 갈 단어가 생긴 것 중, 이어 갈 단어가 10개 이하인 것
// 이 노트는 시간이 지나도 지우지 않는다(한방 단어장만 6개월마다 새로 확인한다).
// 모든 사람이 같은 컴퓨터를 함께 키운다. 저장 방식은 one-shot-store.js와 같다(모아 두었다가 나중에 한꺼번에 파일 쓰기,
// remote가 있으면 Gist에도 올려서 Render 무료 서버가 다시 켜져도 기억이 남는다).
const fs = require('fs');
const path = require('path');

const WRITE_DELAY_MS = 2_000;
const MAX_WORDS = 30_000; // 사전·종류마다 이만큼까지만 기억한다(미리 공부하기로 한방단어가 수천 개 생길 수 있음, 넘치면 가장 오래된 것부터 잊음)
const KINDS = ['shot', 'trap', 'risky', 'hard'];
const REMOTE_NAME = 'word-chain-brain.json';

// 배운 단어 개수(세 종류 합) → 컴퓨터의 실력.
//   level: 화면에 보여 줄 레벨(1부터)
//   memoryChance: 기억 노트에 맞는 단어가 있을 때 실제로 꺼내 쓸 확률(0~1)
//   attackChance: 한방 글자로 끝나는 단어를 일부러 골라 공격할 확률(0~1)
function strengthOf(learned) {
  // 10개 배울 때마다 레벨 1 업, 레벨 제한 없음.
  // 목표는 "절대 이길 수 없는 컴퓨터"라서 기억·공격은 레벨과 상관없이 항상(100%) 쓴다. 레벨은 배운 양을 보여 주는 숫자다.
  const level = 1 + Math.floor(learned / 10);
  return { level, memoryChance: 1, attackChance: 1 };
}

function createBrain(filePath, { remote = null } = {}) {
  const entries = new Map(); // "종류|사전|단어" → { definition, at }
  let timer = null;
  let writing = Promise.resolve();

  // 저장된 노트를 읽어 들인다. 이미 아는 단어는 그대로 두고 모르는 것만 더한다(불러오는 사이에 배운 것을 지키려고).
  function absorb(saved) {
    for (const [key, value] of Object.entries(saved?.entries || {})) {
      if (typeof value?.at === 'number' && KINDS.includes(key.split('|')[0]) && !entries.has(key)) entries.set(key, { definition: String(value.definition || ''), at: value.at });
    }
  }
  if (filePath) {
    try { absorb(JSON.parse(fs.readFileSync(filePath, 'utf8'))); } catch { /* 파일이 없거나 깨졌으면 아무것도 모르는 컴퓨터로 시작 */ }
  }
  const snapshot = () => JSON.stringify({ version: 1, entries: Object.fromEntries(entries) });
  const ready = remote ? remote.attach(REMOTE_NAME, { absorb, snapshot }) : Promise.resolve();

  function flush() {
    timer = null;
    if (!filePath) return writing;
    const body = snapshot();
    writing = writing.then(async () => {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(`${filePath}.tmp`, body);
      await fs.promises.rename(`${filePath}.tmp`, filePath);
    }).catch((error) => console.error('[word-chain] 컴퓨터 기억 노트 저장 실패:', error.message));
    return writing;
  }

  const prefixOf = (kind, dictionary) => `${kind}|${dictionary}|`;
  const wordsOf = (kind, dictionary) => {
    const prefix = prefixOf(kind, dictionary);
    return [...entries.keys()].filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length));
  };

  return {
    ready,
    remember(dictionary, word, definition = '', kind = 'shot') {
      if (!KINDS.includes(kind)) throw new Error(`알 수 없는 기억 종류: ${kind}`);
      const key = prefixOf(kind, dictionary) + word;
      if (entries.has(key)) return false;
      entries.set(key, { definition, at: Date.now() });
      const mine = wordsOf(kind, dictionary);
      if (mine.length > MAX_WORDS) entries.delete(prefixOf(kind, dictionary) + mine[0]); // Map은 넣은 순서를 지키므로 맨 앞이 가장 오래됨
      if (filePath && !timer) { timer = setTimeout(flush, WRITE_DELAY_MS); timer.unref?.(); }
      remote?.save(REMOTE_NAME);
      return true;
    },
    // starts(두음 변형 포함 시작 글자들) 중 하나로 시작하고 아직 안 나온 기억 단어를 무작위로 하나 고른다.
    find(dictionary, starts, used, random = Math.random, kind = 'shot') {
      const hits = wordsOf(kind, dictionary).filter((word) => starts.includes(word[0]) && !used.has(word));
      if (!hits.length) return null;
      const word = hits[Math.floor(random() * hits.length)];
      return { word, definition: entries.get(prefixOf(kind, dictionary) + word).definition };
    },
    forget(dictionary, word, kind) {
      if (!entries.delete(prefixOf(kind, dictionary) + word)) return false;
      if (filePath && !timer) { timer = setTimeout(flush, WRITE_DELAY_MS); timer.unref?.(); }
      remote?.save(REMOTE_NAME);
      return true;
    },
    definitionOf: (dictionary, word, kind) => entries.get(prefixOf(kind, dictionary) + word)?.definition ?? '',
    has: (dictionary, word, kind) => entries.has(prefixOf(kind, dictionary) + word),
    words: (dictionary, kind) => wordsOf(kind, dictionary),
    counts: (dictionary) => Object.fromEntries(KINDS.map((kind) => [kind, wordsOf(kind, dictionary).length])),
    count: (dictionary) => KINDS.reduce((sum, kind) => sum + wordsOf(kind, dictionary).length, 0),
    flush: () => { clearTimeout(timer); return Promise.all([flush(), remote?.flush()]); }
  };
}

module.exports = { createBrain, strengthOf };
