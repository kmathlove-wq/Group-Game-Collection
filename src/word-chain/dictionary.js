// 국립국어원 공식 Open API(표준국어대사전·우리말샘) 조회기. 키는 서버 환경 변수에서만 읽고 응답에 넣지 않는다.
// 요청 매개변수와 응답 해석은 P07(끝말잇기 한방단어 검색기) app.py의 fetch_dictionary()/normalize_item()과 같다.
const { allowedStarts, cleanWord, WORD_MIN, WORD_MAX } = require('./rules');
const { createOneShotStore } = require('./one-shot-store');

const DICTIONARIES = {
  stdict: { name: '표준국어대사전', endpoint: 'https://stdict.korean.go.kr/api/search.do', keyEnv: 'STDICT_API_KEY' },
  opendict: { name: '우리말샘', endpoint: 'https://opendict.korean.go.kr/api/search', keyEnv: 'OPENDICT_API_KEY' }
};
const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 5_000;
const REQUEST_TIMEOUT_MS = 8_000;
const PAGE_SIZE = 100;
const RANDOM_PAGE_MAX = 10;

class DictionaryError extends Error {}

const asList = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const scalar = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) value = value['#text'] ?? value.text;
  if (Array.isArray(value)) value = value[0];
  return String(value ?? '').trim();
};

// 사전 항목 하나를 { word, senses: [{ pos, definition }] } 꼴로 정리한다(동음이의어·뜻 여러 개 모두 보존).
function normalizeItem(item) {
  const senses = asList(item.sense).map((sense) => ({
    pos: scalar(sense?.pos || item.pos), definition: scalar(sense?.definition || item.definition)
  }));
  if (!senses.length) senses.push({ pos: scalar(item.pos), definition: scalar(item.definition) });
  return { word: cleanWord(scalar(item.word)), senses };
}

function parseResponse(data) {
  if (data && (data.error || data.message) && !data.channel) throw new DictionaryError(`사전 오류: ${scalar(data.error?.message || data.error || data.message)}`);
  const channel = data?.channel || data || {};
  return { items: asList(channel.item).map(normalizeItem), total: Number(scalar(channel.total)) || 0 };
}

// 끝말잇기에 쓸 수 있는 낱말: 한글 2~20자 명사(품사 정보가 없으면 P07처럼 통과).
const isNounSense = (sense) => sense.pos.includes('명사') || ['', '품사 미상', '품사 없음'].includes(sense.pos);
function playable(item) {
  const length = item.word.length;
  return /^[가-힣]+$/.test(item.word) && length >= WORD_MIN && length <= WORD_MAX && item.senses.some(isNounSense);
}
const definitionOf = (item) => item.senses.find(isNounSense)?.definition || '';

// store: 끝 글자별 한방 여부 단어장(없으면 메모리에만 기억).
function createDictionary({ env = process.env, fetchImpl = globalThis.fetch, random = Math.random, store = createOneShotStore(null) } = {}) {
  const cache = new Map();
  const checking = new Map(); // 같은 글자를 동시에 두 번 묻지 않게 진행 중인 확인을 공유한다

  function remember(key, make) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.promise;
    const promise = make();
    cache.set(key, { at: Date.now(), promise });
    promise.catch(() => cache.delete(key)); // 실패한 응답은 기억하지 않는다
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return promise;
  }

  function configOf(dictionary) {
    const config = DICTIONARIES[dictionary];
    if (!config) throw new DictionaryError('알 수 없는 사전입니다.');
    return config;
  }
  const isConfigured = (dictionary) => Boolean(String(env[configOf(dictionary).keyEnv] || '').trim());

  async function request(dictionary, query, method, start, num) {
    const config = configOf(dictionary);
    const key = String(env[config.keyEnv] || '').trim();
    if (!key) throw new DictionaryError(`${config.name} API 키가 설정되지 않았어요. 관리자에게 알려 주세요.`);
    const params = new URLSearchParams({ key, q: query, req_type: 'json', type_search: 'search', method, start: String(start), num: String(num), advanced: 'y' });
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetchImpl(`${config.endpoint}?${params}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = await response.text();
        if (!body.trim()) return { items: [], total: 0 }; // 결과가 하나도 없으면 빈 응답이 올 때가 있다
        let data;
        try { data = JSON.parse(body); } catch {
          // 키 오류 같은 응답은 JSON 대신 XML로 올 수 있다.
          const message = body.match(/<message>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*<\/message>/s)?.[1]?.trim();
          throw new DictionaryError(message ? `${config.name}: ${message}` : `${config.name}에서 이상한 응답이 왔어요. 잠시 후 다시 해 주세요.`);
        }
        return parseResponse(data);
      } catch (error) {
        if (error instanceof DictionaryError) throw error;
        lastError = error;
      }
    }
    const slow = lastError?.name === 'TimeoutError' || lastError?.name === 'AbortError';
    throw new DictionaryError(slow ? `${config.name} 응답이 늦어요. 잠시 후 다시 해 주세요.` : `${config.name}에 연결하지 못했어요.`);
  }

  const search = (dictionary, query, method, start = 1, num = PAGE_SIZE) =>
    remember(`${dictionary}|${method}|${query}|${start}|${num}`, () => request(dictionary, query, method, start, num));

  // 이 단어가 사전에 있는 명사인지 확인한다.
  async function lookup(dictionary, word) {
    const { items } = await search(dictionary, word, 'exact', 1, 10);
    const same = items.filter((item) => item.word === word);
    const match = same.find(playable);
    if (match) return { found: true, word, definition: definitionOf(match) };
    return { found: false, reason: same.length ? '명사가 아니라서 쓸 수 없어요.' : `${configOf(dictionary).name}에 없는 단어예요.` };
  }

  async function askContinuation(dictionary, syllable) {
    for (const start of allowedStarts(syllable)) {
      const first = await search(dictionary, start, 'start');
      if (first.items.some(playable)) return true;
      // 첫 묶음이 전부 한 글자 단어 등으로 걸러져도 뒤에 더 있으면 한 묶음만 더 본다(P07과 같은 기준).
      if (first.total > PAGE_SIZE && (await search(dictionary, start, 'start', 2)).items.some(playable)) return true;
    }
    return false;
  }

  // 단어장에 이미 있으면 바로 답한다(true/false). 모르면 undefined — 사전에 묻지 않는다.
  const knownContinuation = (dictionary, syllable) => store.get(dictionary, syllable);

  // 시작 글자(두음 변형 포함)로 시작하는 쓸 수 있는 낱말이 하나라도 있는지(= 한방단어가 아닌지).
  // 확인한 답은 단어장에 남긴다(파일 쓰기는 나중에 모아서 하므로 기다리지 않는다).
  function hasContinuation(dictionary, syllable) {
    const known = store.get(dictionary, syllable);
    if (known !== undefined) return Promise.resolve(known);
    const key = `${dictionary}|${syllable}`;
    if (!checking.has(key)) {
      const promise = askContinuation(dictionary, syllable)
        .then((has) => { store.set(dictionary, syllable, has); return has; })
        .finally(() => checking.delete(key));
      checking.set(key, promise);
    }
    return checking.get(key);
  }

  // 이 글자 뒤에 이어 갈 수 있는 낱말이 몇 개인지 센다. limit을 넘으면 거기서 멈춘다(정확한 수보다 "많다"만 알면 됨).
  async function countContinuation(dictionary, syllable, limit) {
    let count = 0;
    for (const start of allowedStarts(syllable)) {
      const first = await search(dictionary, start, 'start');
      count += first.items.filter(playable).length;
      if (count <= limit && first.total > PAGE_SIZE) count += (await search(dictionary, start, 'start', 2)).items.filter(playable).length;
      if (count > limit) return count;
    }
    return count;
  }

  // 컴퓨터 차례: 이어 갈 수 있는 낱말 중 아직 안 나온 것을 무작위로 고른다. 없으면 null(컴퓨터 패배).
  // dueum=false면 그 글자 하나만, extraPage=false면 첫 묶음만 본다(컴퓨터의 첫 단어처럼 빨리 골라야 할 때).
  // prefer(단어) → 점수. 주어지면 점수가 가장 높은 후보들 중에서만 고른다(성장 모드의 공격·방어).
  async function pickWord(dictionary, syllable, usedWords, { dueum = true, extraPage = true, prefer = null } = {}) {
    const candidates = new Map();
    for (const start of dueum ? allowedStarts(syllable) : [syllable]) {
      const first = await search(dictionary, start, 'start');
      const pages = [first];
      const pageCount = Math.min(RANDOM_PAGE_MAX, Math.ceil(first.total / PAGE_SIZE));
      // 늘 같은 단어만 나오지 않게, 결과가 많으면 다른 묶음 하나를 더 섞는다.
      if (extraPage && pageCount > 1) pages.push(await search(dictionary, start, 'start', 2 + Math.floor(random() * (pageCount - 1))).catch(() => ({ items: [] })));
      for (const page of pages) {
        for (const item of page.items) {
          if (item.word[0] === start && playable(item) && !usedWords.has(item.word) && !candidates.has(item.word)) candidates.set(item.word, definitionOf(item));
        }
      }
    }
    if (!candidates.size) return null;
    const all = [...candidates.keys()];
    const best = prefer ? Math.max(...all.map(prefer)) : 0;
    const words = prefer ? all.filter((w) => prefer(w) === best) : all;
    const word = words[Math.floor(random() * words.length)];
    return { word, definition: candidates.get(word) };
  }

  return { isConfigured, lookup, hasContinuation, knownContinuation, countContinuation, pickWord };
}

module.exports = { createDictionary, DictionaryError, DICTIONARIES, normalizeItem, parseResponse };
