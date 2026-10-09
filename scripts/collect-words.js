// 🏆 고수 컴퓨터의 "단어 지도" 재료 모으기: 가~힣 11,172자를 하나씩 사전에 "이 글자로 시작하는 낱말 다 알려 줘"(method=start)
// 라고 물어, 게임과 똑같은 기준(dictionary.js `playable` — 한글 2~20자 명사, 단어·구만)을 통과한 낱말을 모은다.
// 서버가 아니라 내 컴퓨터에서 한 번만 돌린다(미리 공부하기와 사전 질문 한도를 나눠 쓰지 않게).
//
//   node scripts/collect-words.js [stdict|opendict]
//
// - 끝낸 글자는 data/word-chain-words-<사전>.partial.tsv에 한 줄씩 적어서, 중간에 끊겨도 다시 켜면 이어서 한다.
// - 모두 끝나면 data/word-chain-words-<사전>.txt(한 줄에 한 낱말, 가나다순)를 만든다. 두 파일 모두 Git 제외.
// - 키는 .env(또는 환경 변수)의 STDICT_API_KEY / OPENDICT_API_KEY만 쓰고 화면에 찍지 않는다.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { DICTIONARIES, parseResponse, playable, WORD_TYPES } = require('../src/word-chain/dictionary');
const { firstSyllable } = require('../src/word-chain/rules');

const PAGE_SIZE = 100;        // 한 번에 받을 낱말 수(사전이 허용하는 최대)
const WORKERS = 3;            // 동시에 물어볼 글자 수
const TRIES = 4;              // 연결 문제로 실패하면 다시 묻는 횟수
const TIMEOUT_MS = 20_000;
const FIRST = 0xac00; const LAST = 0xd7a3;

const dict = process.argv[2] || 'stdict';
const config = DICTIONARIES[dict];
if (!config) { console.error(`모르는 사전이에요: ${dict} (stdict 또는 opendict)`); process.exit(1); }
const key = String(process.env[config.keyEnv] || '').trim();
if (!key) { console.error(`${config.keyEnv}가 없어요. .env에 키를 넣어 주세요.`); process.exit(1); }

const dataDir = path.join(__dirname, '..', 'data');
const partialPath = path.join(dataDir, `word-chain-words-${dict}.partial.tsv`);
const outPath = path.join(dataDir, `word-chain-words-${dict}.txt`);

class StopError extends Error {} // 키 오류·하루 한도처럼 다시 물어도 소용없는 문제

async function page(syllable, start) {
  const params = new URLSearchParams({ key, q: syllable, req_type: 'json', type_search: 'search', method: 'start', start: String(start), num: String(PAGE_SIZE), advanced: 'y', type1: WORD_TYPES });
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(`${config.endpoint}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      if (!body.trim()) return { items: [], total: 0 };
      let data;
      try { data = JSON.parse(body); } catch {
        const message = body.match(/<message>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*<\/message>/s)?.[1]?.trim();
        throw new StopError(message || '사전에서 이상한 응답이 왔어요.');
      }
      return parseResponse(data);
    } catch (error) {
      if (error instanceof StopError || attempt >= TRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
    }
  }
}

// 한 글자로 시작하는 쓸 수 있는 낱말 전부. 묶음이 100개로 꽉 차 있으면 다음 묶음을 계속 본다.
async function wordsStartingWith(syllable) {
  const words = new Set();
  for (let start = 1; ; start += 1) {
    const { items, total } = await page(syllable, start);
    for (const item of items) if (firstSyllable(item.word) === syllable && playable(item)) words.add(item.word);
    if (items.length < PAGE_SIZE || start * PAGE_SIZE >= total) return [...words];
  }
}

async function main() {
  fs.mkdirSync(dataDir, { recursive: true });
  const done = new Map(); // 글자 → 낱말 목록
  if (fs.existsSync(partialPath)) {
    for (const line of fs.readFileSync(partialPath, 'utf8').split('\n')) {
      const [syllable, list = ''] = line.split('\t');
      if (syllable) done.set(syllable, list ? list.split(' ') : []);
    }
  }
  const todo = [];
  for (let code = FIRST; code <= LAST; code += 1) if (!done.has(String.fromCharCode(code))) todo.push(String.fromCharCode(code));
  console.log(`${config.name}: 이미 끝낸 글자 ${done.size}개, 남은 글자 ${todo.length}개`);

  const total = LAST - FIRST + 1; const startedAt = Date.now(); let finished = 0; let stopped = null;
  async function worker() {
    while (todo.length && !stopped) {
      const syllable = todo.shift();
      try {
        const words = await wordsStartingWith(syllable);
        fs.appendFileSync(partialPath, `${syllable}\t${words.join(' ')}\n`);
        done.set(syllable, words); finished += 1;
        if (finished % 200 === 0) {
          const perOne = (Date.now() - startedAt) / finished;
          console.log(`${done.size}/${total}자 (${syllable}) · 낱말 ${[...done.values()].reduce((n, w) => n + w.length, 0)}개 · 남은 시간 약 ${Math.round((perOne * todo.length) / WORKERS / 60_000)}분`);
        }
      } catch (error) {
        stopped = { syllable, error }; // 이 글자는 끝내지 못했으니 다음에 여기부터 다시 한다
      }
    }
  }
  await Promise.all(Array.from({ length: WORKERS }, worker));
  if (stopped) {
    console.error(`'${stopped.syllable}'에서 멈췄어요: ${stopped.error.message}`);
    console.error('다시 실행하면 끝낸 글자는 건너뛰고 이어서 해요(하루 한도라면 내일 다시).');
    process.exit(1);
  }
  const all = [...new Set([...done.values()].flat())].sort();
  fs.writeFileSync(outPath, all.join('\n') + '\n');
  console.log(`다 모았어요! 낱말 ${all.length}개 → ${path.relative(process.cwd(), outPath)}`);
}

main();
