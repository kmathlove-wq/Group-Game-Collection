// 끝 글자별 "이어 갈 단어가 있는지(false = 그 글자로 끝나면 한방단어)"를 기억하는 파일 저장소.
// P07 syllable_count_cache처럼 약 6개월 기억한다. 쓰기는 모아서 나중에 하므로 단어 확인 시간에 끼어들지 않는다.
// remote(lib/gist-sync.js)가 있으면 서버 바깥 Gist에도 올려서, Render 무료 서버가 다시 켜져도 지워지지 않게 한다.
const fs = require('fs');
const path = require('path');

const TTL_MS = 180 * 24 * 60 * 60 * 1000;
const WRITE_DELAY_MS = 2_000;
const REMOTE_NAME = 'word-chain-one-shot.json';
const VERSION = 2; // 2: 이어 갈 단어가 적으면 목록(words)도 함께 적는다

function createOneShotStore(filePath, { remote = null } = {}) {
  const entries = new Map(); // "사전|글자" → { has, at, words? } — words: 이어 갈 단어가 5개 이하로 적을 때 그 목록(늡 → [늡늡])
  let timer = null;
  let writing = Promise.resolve();

  // 저장된 내용을 읽어 들인다. 이미 아는 글자는 그대로 두고 모르는 것만 더한다(불러오는 사이에 배운 것을 지키려고).
  // 버전 1(2026-10 이전)은 "있음"만 적고 적은 단어 목록이 없어서 늡늡 같은 단어를 판단할 수 없다.
  // 그래서 버전 1의 "있음" 기록은 버리고 다시 묻는다("없음" = 한방 글자 기록은 그대로 믿는다).
  function absorb(saved) {
    const legacy = (Number(saved?.version) || 1) < VERSION;
    for (const [key, value] of Object.entries(saved?.entries || {})) {
      if (typeof value?.has !== 'boolean' || !(Date.now() - value.at < TTL_MS) || entries.has(key)) continue;
      if (legacy && value.has) continue;
      const words = Array.isArray(value.words) && value.words.every((w) => typeof w === 'string') ? value.words : undefined;
      entries.set(key, words ? { has: value.has, at: value.at, words } : { has: value.has, at: value.at });
    }
  }
  if (filePath) {
    try { absorb(JSON.parse(fs.readFileSync(filePath, 'utf8'))); } catch { /* 파일이 없거나 깨졌으면 빈 단어장으로 시작 */ }
  }
  // 저장할 때 6개월이 지난 글자는 빼서, 파일·Gist에 오래된 답이 쌓이지 않게 한다.
  const snapshot = () => JSON.stringify({ version: VERSION, entries: Object.fromEntries([...entries].filter(([, v]) => Date.now() - v.at < TTL_MS)) });
  const ready = remote ? remote.attach(REMOTE_NAME, { absorb, snapshot }) : Promise.resolve();

  function flush() {
    timer = null;
    if (!filePath) return writing;
    const body = snapshot();
    // 임시 파일에 다 쓴 뒤 이름을 바꿔서, 쓰는 도중 서버가 꺼져도 파일이 반쯤 깨지지 않게 한다.
    writing = writing.then(async () => {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(`${filePath}.tmp`, body);
      await fs.promises.rename(`${filePath}.tmp`, filePath);
    }).catch((error) => console.error('[word-chain] 한방단어 단어장 저장 실패:', error.message));
    return writing;
  }

  // { has, words? } 또는 undefined(모름). words가 있으면 이어 갈 수 있는 단어가 그것뿐이다.
  function entry(dictionary, syllable) {
    const hit = entries.get(`${dictionary}|${syllable}`);
    if (!hit) return undefined;
    if (Date.now() - hit.at >= TTL_MS) { entries.delete(`${dictionary}|${syllable}`); return undefined; }
    return hit;
  }

  return {
    ready,
    // true = 이어 갈 단어 있음, false = 한방(막다른) 글자, undefined = 아직 모름
    get: (dictionary, syllable) => entry(dictionary, syllable)?.has,
    entry,
    set(dictionary, syllable, has, words = null) {
      entries.set(`${dictionary}|${syllable}`, has && words ? { has: true, at: Date.now(), words: [...words] } : { has: Boolean(has), at: Date.now() });
      if (filePath && !timer) { timer = setTimeout(flush, WRITE_DELAY_MS); timer.unref?.(); }
      remote?.save(REMOTE_NAME);
    },
    deadEnds: (dictionary) => [...entries].filter(([key, v]) => key.startsWith(`${dictionary}|`) && !v.has).map(([key]) => key.split('|')[1]),
    get size() { return entries.size; },
    flush: () => { clearTimeout(timer); return Promise.all([flush(), remote?.flush()]); }
  };
}

module.exports = { createOneShotStore };
