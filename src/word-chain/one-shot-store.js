// 끝 글자별 "이어 갈 단어가 있는지(false = 그 글자로 끝나면 한방단어)"를 기억하는 파일 저장소.
// P07 syllable_count_cache처럼 약 6개월 기억한다. 쓰기는 모아서 나중에 하므로 단어 확인 시간에 끼어들지 않는다.
// remote(lib/gist-sync.js)가 있으면 서버 바깥 Gist에도 올려서, Render 무료 서버가 다시 켜져도 지워지지 않게 한다.
const fs = require('fs');
const path = require('path');

const TTL_MS = 180 * 24 * 60 * 60 * 1000;
const WRITE_DELAY_MS = 2_000;
const REMOTE_NAME = 'word-chain-one-shot.json';

function createOneShotStore(filePath, { remote = null } = {}) {
  const entries = new Map(); // "사전|글자" → { has, at }
  let timer = null;
  let writing = Promise.resolve();

  // 저장된 내용을 읽어 들인다. 이미 아는 글자는 그대로 두고 모르는 것만 더한다(불러오는 사이에 배운 것을 지키려고).
  function absorb(saved) {
    for (const [key, value] of Object.entries(saved?.entries || {})) {
      if (typeof value?.has === 'boolean' && Date.now() - value.at < TTL_MS && !entries.has(key)) entries.set(key, value);
    }
  }
  if (filePath) {
    try { absorb(JSON.parse(fs.readFileSync(filePath, 'utf8'))); } catch { /* 파일이 없거나 깨졌으면 빈 단어장으로 시작 */ }
  }
  // 저장할 때 6개월이 지난 글자는 빼서, 파일·Gist에 오래된 답이 쌓이지 않게 한다.
  const snapshot = () => JSON.stringify({ version: 1, entries: Object.fromEntries([...entries].filter(([, v]) => Date.now() - v.at < TTL_MS)) });
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

  return {
    ready,
    // true = 이어 갈 단어 있음, false = 한방(막다른) 글자, undefined = 아직 모름
    get(dictionary, syllable) {
      const hit = entries.get(`${dictionary}|${syllable}`);
      if (!hit) return undefined;
      if (Date.now() - hit.at >= TTL_MS) { entries.delete(`${dictionary}|${syllable}`); return undefined; }
      return hit.has;
    },
    set(dictionary, syllable, has) {
      entries.set(`${dictionary}|${syllable}`, { has: Boolean(has), at: Date.now() });
      if (filePath && !timer) { timer = setTimeout(flush, WRITE_DELAY_MS); timer.unref?.(); }
      remote?.save(REMOTE_NAME);
    },
    deadEnds: (dictionary) => [...entries].filter(([key, v]) => key.startsWith(`${dictionary}|`) && !v.has).map(([key]) => key.split('|')[1]),
    get size() { return entries.size; },
    flush: () => { clearTimeout(timer); return Promise.all([flush(), remote?.flush()]); }
  };
}

module.exports = { createOneShotStore };
