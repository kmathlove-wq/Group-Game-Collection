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
const HEDGE_MS = 1_500;
const EXTRA_PAGE_KEEP_MS = 30_000;
const SLOW_LOG_MS = 2_000; // 이 안에 답이 없으면 같은 질문을 하나 더 보낸다
// 'start' 질문 한 묶음의 단어 수. 100개씩 받으면 사전 서버가 3초쯤 걸려서 40개로 줄였다(2026-10 실측 비교).
// 무작위 묶음은 앞쪽 약 1,000개 안에서 고르도록 묶음 번호 상한을 25로 둔다(예전 100개 × 10묶음과 같은 범위).
const PAGE_SIZE = 40;
const RANDOM_PAGE_MAX = 25;
const END_PAGE_SIZE = 100; // 미리 공부하기의 "○로 끝나는 단어"는 속도보다 많이 받는 게 중요해서 100개씩
const FEW_WORDS = 5; // 이어 갈 단어가 이만큼 이하면 목록을 기억해 "이미 나온 단어"를 빼고 한방 여부를 판단한다

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
// hedgeMs·requestTimeoutMs는 테스트에서 짧게 돌리려고 둔 값이다.
function createDictionary({ env = process.env, fetchImpl = globalThis.fetch, random = Math.random, store = createOneShotStore(null),
  hedgeMs = HEDGE_MS, requestTimeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const cache = new Map();
  const checking = new Map(); // 같은 글자를 동시에 두 번 묻지 않게 진행 중인 확인을 공유한다
  let requests = 0; // 실제로 사전에 물어본 횟수(미리 공부하기가 하루 한도를 지키는 데 쓴다)

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

  // 사전 서버가 어떤 질문엔 아예 대답을 안 하는 날이 있다(대답할 땐 1초 안에 온다). 그래서 1.5초(hedgeMs) 안에
  // 답이 없거나 첫 질문이 바로 실패하면 같은 질문을 하나 더 보내고 먼저 온 답을 쓴다(나머지는 취소).
  // 각 질문은 최대 8초 기다린다. 둘 다 실패하면 "응답이 늦어요/연결하지 못했어요"를 알린다.
  async function request(dictionary, query, method, start, num) {
    const config = configOf(dictionary);
    const key = String(env[config.keyEnv] || '').trim();
    if (!key) throw new DictionaryError(`${config.name} API 키가 설정되지 않았어요. 관리자에게 알려 주세요.`);
    const params = new URLSearchParams({ key, q: query, req_type: 'json', type_search: 'search', method, start: String(start), num: String(num), advanced: 'y' });
    const controllers = [];

    async function ask() {
      requests += 1;
      const askedAt = Date.now();
      try { return await answer(); }
      finally {
        // 2초 넘게 걸린 질문은 Render 기록(Logs)에 남긴다(키는 남기지 않음). 느린 곳을 찾는 데 쓴다.
        const ms = Date.now() - askedAt;
        if (ms > SLOW_LOG_MS) console.warn(`[word-chain] 느린 사전 질문 ${config.name} ${method} '${query}' ${start}쪽: ${ms}ms`);
      }
    }
    async function answer() {
      const controller = new AbortController(); controllers.push(controller);
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(requestTimeoutMs)]);
      const response = await fetchImpl(`${config.endpoint}?${params}`, { signal });
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
    }

    let hedgeTimer = null;
    try {
      return await new Promise((resolve, reject) => {
        let pending = 0; let secondSent = false;
        const launch = () => {
          pending += 1;
          ask().then(resolve, (error) => {
            pending -= 1;
            if (error instanceof DictionaryError) reject(error); // 서버가 분명히 거절한 건 다시 물어도 같다
            else if (!secondSent) sendSecond(); // 첫 질문이 금방 실패하면 1.5초를 기다리지 않고 바로 다시
            else if (pending === 0) reject(error); // 둘 다 실패
          });
        };
        const sendSecond = () => { if (secondSent) return; secondSent = true; clearTimeout(hedgeTimer); launch(); };
        launch();
        hedgeTimer = setTimeout(sendSecond, hedgeMs);
      });
    } catch (error) {
      if (error instanceof DictionaryError) throw error;
      const slow = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      throw new DictionaryError(slow ? `${config.name} 응답이 늦어요. 잠시 후 다시 해 주세요.` : `${config.name}에 연결하지 못했어요.`);
    } finally {
      clearTimeout(hedgeTimer); // 답이 왔으면 "하나 더 묻기"는 하지 않는다
      for (const controller of controllers) controller.abort(); // 늦게 오는 나머지 질문은 취소
    }
  }


  const search = (dictionary, query, method, start = 1, num = PAGE_SIZE) =>
    remember(`${dictionary}|${method}|${query}|${start}|${num}`, () => request(dictionary, query, method, start, num).then((page) => {
      if (method === 'start' && start === 1 && num === PAGE_SIZE) totals.set(`${dictionary}|${query}`, page.total);
      return page;
    }));

  // 컴퓨터 단어 고르기는 첫 묶음 + 다양하게 고르려고 무작위 묶음 하나를 더 본다. 예전엔 첫 묶음이 와야 전체 수를 알고
  // 무작위 묶음을 물어서 "3초 + 3초"가 걸렸다. 이제 시작 글자별 전체 수를 기억해 두고 두 묶음을 동시에 묻는다.
  // 처음 보는 글자는 첫 묶음만 쓴다. 고른 무작위 묶음 번호는 30초 동안 같게 해서, 미리 묻기와 실제 고르기가 같은 답을 함께 쓴다.
  const totals = new Map();      // "사전|시작 글자" → 전체 단어 수
  const extraPages = new Map();  // "사전|시작 글자" → { page, at }
  function extraPageFor(dictionary, start) {
    const key = `${dictionary}|${start}`;
    const total = totals.get(key);
    const pageCount = total ? Math.min(RANDOM_PAGE_MAX, Math.ceil(total / PAGE_SIZE)) : 0;
    if (pageCount <= 1) return null;
    const chosen = extraPages.get(key);
    if (chosen && Date.now() - chosen.at < EXTRA_PAGE_KEEP_MS && chosen.page <= pageCount) return chosen.page;
    const page = 2 + Math.floor(random() * (pageCount - 1));
    extraPages.set(key, { page, at: Date.now() });
    if (extraPages.size > CACHE_MAX) extraPages.delete(extraPages.keys().next().value);
    return page;
  }
  // 시작 글자 하나의 후보 묶음들(첫 묶음 + 무작위 묶음)을 동시에 묻는다.
  function pagesOf(dictionary, start, extraPage = true) {
    const page = extraPage ? extraPageFor(dictionary, start) : null;
    return Promise.all([search(dictionary, start, 'start'), page ? search(dictionary, start, 'start', page).catch(() => ({ items: [] })) : null])
      .then((pages) => pages.filter(Boolean));
  }
  // 내 단어를 확인하는 동안 컴퓨터가 쓸 후보 묶음을 미리 물어 둔다(결과는 캐시에 남아 실제 고르기가 다시 쓴다).
  const warmCandidates = (dictionary, syllable) => {
    for (const start of allowedStarts(syllable)) pagesOf(dictionary, start).catch(() => {});
  };

  // 이 단어가 사전에 있는 명사인지 확인한다.
  async function lookup(dictionary, word) {
    const { items } = await search(dictionary, word, 'exact', 1, 10);
    const same = items.filter((item) => item.word === word);
    const match = same.find(playable);
    if (match) return { found: true, word, definition: definitionOf(match) };
    return { found: false, reason: same.length ? '명사가 아니라서 쓸 수 없어요.' : `${configOf(dictionary).name}에 없는 단어예요.` };
  }

  // 시작 글자(두음 변형 포함)들을 한꺼번에 묻고 { has, words }로 답한다.
  //   words: 이어 갈 단어가 FEW_WORDS(5)개 이하로 적을 때 그 목록. 많으면 null.
  //   한 글자라도 "많다"가 오면 나머지를 기다리지 않고 바로 답한다.
  //   하나라도 묻지 못했는데 나머지에서 단어를 못 찾았다면 한방이라고 단정할 수 없으므로 실패로 돌려준다.
  function askContinuation(dictionary, syllable) {
    const askOne = async (start) => {
      const first = await search(dictionary, start, 'start');
      const wordsIn = (page) => page.items.filter((item) => item.word[0] === start && playable(item)).map((item) => item.word);
      let words = wordsIn(first);
      // 첫 묶음이 전부 한 글자 단어 등으로 걸러져도 뒤에 더 있으면 한 묶음만 더 본다(P07과 같은 기준).
      if (!words.length && first.total > PAGE_SIZE) words = wordsIn(await search(dictionary, start, 'start', 2));
      return { words: [...new Set(words)], many: first.total > PAGE_SIZE && words.length > 0 };
    };
    const starts = allowedStarts(syllable);
    return new Promise((resolve, reject) => {
      let left = starts.length; let failure = null; const found = new Set();
      const settle = () => {
        if (--left > 0) return;
        if (failure && found.size) resolve({ has: true, words: null }); // 일부를 못 물어 목록이 완전하지 않으니 "적다"고 하지 않는다
        else if (failure) reject(failure);
        else resolve({ has: found.size > 0, words: found.size && found.size <= FEW_WORDS ? [...found] : null });
      };
      for (const start of starts) {
        askOne(start).then(({ words, many }) => {
          for (const word of words) found.add(word);
          if (many || found.size > FEW_WORDS) resolve({ has: true, words: null });
          settle();
        }, (error) => { failure = error; settle(); });
      }
    });
  }
  // 단어장의 답을 이번 판 상황에 맞춘다. 이어 갈 단어가 몇 개뿐이고 그게 다 이미 나왔다면(늡 → 늡늡) 한방이다.
  const judge = (entry, used) => {
    if (!entry) return undefined;
    if (!entry.has) return false;
    return entry.words && used ? entry.words.some((word) => !used.has(word)) : true;
  };
  // 단어장에 이미 있으면 바로 답한다(true/false). 모르면 undefined — 사전에 묻지 않는다.
  // used(이번 판에 나온 단어들)를 주면 그 단어들은 다시 못 쓰는 것으로 계산한다.
  const knownContinuation = (dictionary, syllable, used = null) => judge(store.entry(dictionary, syllable), used);

  // 시작 글자(두음 변형 포함)로 시작하는 쓸 수 있는 낱말이 남아 있는지(= 한방단어가 아닌지).
  // 확인한 답은 단어장에 남긴다(파일 쓰기는 나중에 모아서 하므로 기다리지 않는다).
  function hasContinuation(dictionary, syllable, used = null) {
    const known = store.entry(dictionary, syllable);
    if (known) return Promise.resolve(judge(known, used));
    const key = `${dictionary}|${syllable}`;
    if (!checking.has(key)) {
      const promise = askContinuation(dictionary, syllable)
        .then((answer) => { store.set(dictionary, syllable, answer.has, answer.words); return answer; })
        .finally(() => checking.delete(key));
      checking.set(key, promise);
    }
    return checking.get(key).then((answer) => judge(answer, used));
  }
  // 이어 갈 수 있는 단어가 몇 개뿐일 때 그 목록(모르거나 많으면 undefined). 미리 공부하기가 늡늡 같은 단어를 찾는 데 쓴다.
  const fewContinuations = (dictionary, syllable) => store.entry(dictionary, syllable)?.words;

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

  // 이 글자로 "끝나는" 낱말들(미리 공부하기: 한방 글자를 찾으면 그 글자로 끝나는 단어가 곧 한방단어다). 최대 pages 묶음.
  async function wordsEndingWith(dictionary, syllable, pages = 3) {
    const found = new Map();
    for (let page = 1; page <= pages; page += 1) {
      const { items, total } = await search(dictionary, syllable, 'end', page, END_PAGE_SIZE);
      for (const item of items) if (item.word.at(-1) === syllable && playable(item) && !found.has(item.word)) found.set(item.word, definitionOf(item));
      if (page * END_PAGE_SIZE >= total) break;
    }
    return [...found].map(([word, definition]) => ({ word, definition }));
  }

  // 컴퓨터 차례: 이어 갈 수 있는 낱말 중 아직 안 나온 것을 무작위로 고른다. 없으면 null(컴퓨터 패배).
  // dueum=false면 그 글자 하나만, extraPage=false면 첫 묶음만 본다(컴퓨터의 첫 단어처럼 빨리 골라야 할 때).
  // prefer(단어) → 점수. 주어지면 점수가 가장 높은 후보들 중에서만 고른다(성장 모드의 공격·방어).
  async function pickWord(dictionary, syllable, usedWords, { dueum = true, extraPage = true, prefer = null } = {}) {
    const all = await candidates(dictionary, syllable, usedWords, { dueum, extraPage });
    if (!all.length) return null;
    const best = prefer ? Math.max(...all.map((c) => prefer(c.word))) : 0;
    const words = prefer ? all.filter((c) => prefer(c.word) === best) : all;
    return words[Math.floor(random() * words.length)];
  }

  // 이어 갈 수 있는 낱말 후보 전부([{ word, definition }]). 성장 컴퓨터는 이걸 받아 직접 비교해서 고른다.
  async function candidates(dictionary, syllable, usedWords, { dueum = true, extraPage = true } = {}) {
    const candidates = new Map();
    // 시작 글자(두음 변형 포함)마다 차례로 묻지 않고 한꺼번에 물어서 기다리는 시간을 줄인다.
    const starts = dueum ? allowedStarts(syllable) : [syllable];
    const found = await Promise.all(starts.map((start) => pagesOf(dictionary, start, extraPage)));
    for (const [i, start] of starts.entries()) {
      for (const page of found[i]) {
        for (const item of page.items) {
          if (item.word[0] === start && playable(item) && !usedWords.has(item.word) && !candidates.has(item.word)) candidates.set(item.word, definitionOf(item));
        }
      }
    }
    return [...candidates].map(([word, definition]) => ({ word, definition }));
  }

  return { isConfigured, warmCandidates, lookup, hasContinuation, knownContinuation, fewContinuations, countContinuation, pickWord, candidates, wordsEndingWith, get requests() { return requests; } };
}

module.exports = { createDictionary, DictionaryError, DICTIONARIES, normalizeItem, parseResponse };
