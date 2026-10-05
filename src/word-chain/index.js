const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { precheck, lastSyllable, allowedStarts } = require('./rules');
const { DictionaryError, DICTIONARIES } = require('./dictionary');
const { createBrain, strengthOf } = require('./brain');

const MAX_PLAYERS = 8;
const TURN_TIMES = [0, 10, 15, 20, 30]; // 0 = 제한 없음
const COLORS = ['#ff4d75', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
const DISCONNECT_GRACE_MS = 3_000;
const RECONNECT_MS = 30_000;
const CHAT_LIMIT = 100;
const PUBLIC_WORD_LIMIT = 60;
const MIN_RESUME_MS = 1_500;   // 틀린 단어를 낸 뒤 다시 입력할 최소 시간
const SOLO_TTL_MS = 30 * 60 * 1000;
const SOLO_MAX = 1_000;
const ONE_SHOT_WAIT_MS = 25_000;
const ONE_SHOT_TRIES = 3;         // 한방 확인이 사전 문제로 실패하면 이만큼까지 다시 묻는다
const ONE_SHOT_RETRY_MS = 3_000;  // 다시 묻기 전 기다리는 시간
// 컴퓨터가 먼저 할 때 첫 단어를 고를 시작 글자 후보(흔하게 쓰이는 글자)
const COMPUTER_OPENERS = ['가', '고', '기', '나', '노', '다', '도', '마', '무', '바', '부', '사', '수', '시', '오', '우', '자', '주', '하', '호'];
const TRAP_LIMIT = 3;  // 🪤 함정은 그 단어 뒤에 이어 갈 단어가 이 수 이하일 때만(많으면 상대가 다른 단어로 빠져나간다)
const HARD_LIMIT = 10; // 기억한 한방단어가 한방이 아니게 됐을 때, 이어 갈 단어가 이 수 이하면 🧩 어려운 단어로 남긴다
const LOOKAHEAD_SIZE = 6;     // 🔭 한 번에 비교해 볼 후보 수
const LOOKAHEAD_LIMIT = 30;   // 상대가 이어 갈 단어는 이만큼까지만 센다(그 이상은 "많음")
const LOOKAHEAD_MS = 1_500;   // 내다보기에 쓰는 최대 시간
const OPENER_PARALLEL = 3; // 첫 단어 후보 글자를 동시에 몇 개 알아볼지 // 컴퓨터 대결 화면이 뒤에서 한방 확인 결과를 기다리는 최대 시간

function text(value, maxLength) {
  return [...String(value ?? '').replace(/[<>\p{Cc}]/gu, '').trim()].slice(0, maxLength).join('');
}
const dictionaryCode = (value) => (Object.hasOwn(DICTIONARIES, value) ? value : 'stdict');

// 단어 하나를 규칙 → 사전 → (첫 단어면) 한방단어 순서로 검사한다. 빠른 검사부터 해서 사전 호출을 아낀다.
async function checkWord(dictionary, dictName, raw, previousWord, usedWords) {
  const word = String(raw ?? '').replace(/\s/g, '').slice(0, 40);
  const problem = precheck(word, previousWord, usedWords);
  if (problem) return { ok: false, message: problem };
  // 규칙을 통과하면 사전 확인을 기다리는 동안 이 단어 끝 글자의 한방 여부도 미리 물어 둔다(동시에 묻기).
  // 그러면 단어가 통과될 때쯤 답이 와 있어서 한방이면 바로 처리되고, 컴퓨터가 단어를 찾을 때도 같은 답을 다시 쓴다.
  dictionary.hasContinuation(dictName, lastSyllable(word)).catch(() => {}); // 미리 묻기(결과는 단어장에 남는다)
  try {
    const found = await dictionary.lookup(dictName, word);
    if (!found.found) return { ok: false, message: found.reason };
    if (!previousWord && !(await dictionary.hasContinuation(dictName, lastSyllable(word), usedWith(usedWords, word)))) {
      return { ok: false, message: '첫 단어로는 한방단어(이어 말할 단어가 없는 단어)를 쓸 수 없어요.' };
    }
    return { ok: true, word, definition: found.definition };
  } catch (error) {
    if (!(error instanceof DictionaryError)) console.error('[word-chain]', error);
    return { ok: false, dictionaryError: true, message: error instanceof DictionaryError ? error.message : '사전을 확인하다 문제가 생겼어요.' };
  }
}

// "이번 판에 나온 단어들 + 지금 내려는 단어"를 Set처럼 쓸 수 있게 한다(새 Set을 만들지 않아 후보가 많아도 가볍다).
// 이어 갈 단어가 자기 자신뿐인 단어(늡 → 늡늡)는 내는 순간 한방이 되므로 한방 판단에 꼭 넣어야 한다.
const usedWith = (used, word) => ({ has: (w) => w === word || used.has(w) });

// 살아남은 사람이 1등, 나머지는 늦게 탈락한 순서대로 등수를 매긴다(나간 사람은 빠짐).
function rankPlayers(players, eliminated) {
  const list = [...players];
  const alive = list.filter((p) => p.alive);
  const out = [...eliminated].reverse().map((id) => list.find((p) => p.userId === id && !p.alive)).filter(Boolean);
  return [...alive.map((p) => ({ p, rank: 1 })), ...out.map((p, i) => ({ p, rank: alive.length + i + 1 }))]
    .map(({ p, rank }) => ({ rank, userId: p.userId, nickname: p.nickname, color: p.color, score: p.score }));
}

// secondMs는 테스트에서 차례 시간을 짧게 돌리려고 둔 값이다(운영은 항상 1000).
// brain·strength·random은 성장 모드용이다(테스트에서 바꿔 끼울 수 있게 밖에서 받는다).
function setupWordChainGame({ app, io, rootDir, dictionary, secondMs = 1000, oneShotRetryMs = ONE_SHOT_RETRY_MS, lookaheadMs = LOOKAHEAD_MS, study = null, brain = createBrain(null), strength = strengthOf, random = Math.random }) {
  const page = (name) => (_req, res) => res.sendFile(path.join(rootDir, 'public', name));
  app.get('/word-chain', page('word-chain.html'));
  app.get('/word-chain/solo', page('word-chain-solo.html'));
  app.get('/word-chain/lobby', page('word-chain-lobby.html'));
  app.get('/word-chain/room', page('word-chain-room.html'));
  const json = express.json({ limit: '2kb' });
  // 응답과 상관없이 뒤에서 끝 글자의 한방 여부를 확인해 단어장에 남긴다.
  const learn = (dict, syllable) => { if (dictionary.knownContinuation(dict, syllable) === undefined) dictionary.hasContinuation(dict, syllable).catch(() => {}); };

  app.get('/api/word-chain/status', (_req, res) => {
    res.json({ dictionaries: Object.entries(DICTIONARIES).map(([code, d]) => ({ code, name: d.name, ready: dictionary.isConfigured(code) })) });
  });

  // 끝 글자의 한방 여부를 묻는다. 사전 문제로 실패하면 3초 뒤 다시 묻고(최대 3번), stillNeeded()가 거짓이 되면 그만둔다.
  async function continuationWithRetry(dict, syllable, used, stillNeeded) {
    for (let attempt = 1; ; attempt += 1) {
      try { return await dictionary.hasContinuation(dict, syllable, used); }
      catch (error) {
        if (attempt >= ONE_SHOT_TRIES || !stillNeeded()) throw error;
        await new Promise((resolve) => setTimeout(resolve, oneShotRetryMs));
        if (!stillNeeded()) throw error;
      }
    }
  }

  // ── 컴퓨터랑 대결: 진행 상황은 서버가 기억하고, 단어 검사도 서버가 한다 ──
  const soloGames = new Map();
  const soloCleanup = setInterval(() => {
    const now = Date.now();
    for (const [id, game] of soloGames) if (now - game.lastActive > SOLO_TTL_MS) soloGames.delete(id);
  }, 60_000);
  soloCleanup.unref();

  // ── 성장 모드: 진 판의 마지막 세 단어를 기억 노트(brain.js)에 적고, 다음 판에 꺼내 쓴다. 기본 모드는 아래 함수들을 쓰지 않는다 ──
  const brainInfo = (dict) => { const learned = brain.count(dict); return { learned, level: strength(learned).level, ...brain.counts(dict), study: study?.info(dict) ?? null }; };
  // 한방단어로 끝난 판의 마지막 세 단어 A → B → C를 배운다. 누가 이겼든 모양이 같다:
  //   사람이 이김: 사람 A → 컴퓨터 B → 사람 C💥 / 컴퓨터가 이김: 컴퓨터 A → 사람 B → 컴퓨터 C💥
  //   C는 📒 한방, B는 🚫 조심(컴퓨터가 B를 말하면 상대가 C로 끝낼 수 있다), A는 🪤 함정.
  // C의 끝 글자가 정말 한방 글자일 때만 배운다(컴퓨터가 우연히 못 찾았거나 이번 판에서만 막힌 경우는 빼려고).
  function learnWin(game, known) {
    const chain = [...game.used]; // Set은 넣은 순서를 지키므로 곧 단어가 나온 순서다
    const [a, b, c] = [chain.at(-3), chain.at(-2), chain.at(-1)]; // 짧은 판이면 a·b가 없을 수 있다
    const note = () => {
      brain.remember(game.dictionary, c, game.defs.get(c), 'shot');
      if (b) brain.remember(game.dictionary, b, game.defs.get(b), 'risky');
      // 🪤 A 뒤에 이어 갈 단어가 3개 이하일 때만 함정이다(요요 → '요'로 시작하는 단어는 많아서 함정이 못 된다).
      if (a) {
        dictionary.countContinuation(game.dictionary, lastSyllable(a), TRAP_LIMIT)
          .then((count) => { if (count <= TRAP_LIMIT) brain.remember(game.dictionary, a, game.defs.get(a), 'trap'); })
          .catch(() => {});
      }
    };
    if (known === false && dictionary.knownContinuation(game.dictionary, lastSyllable(c), usedWith(new Set(), c)) === false) { note(); return; }
    // 이번 판에서만 막힌 경우(이어 갈 단어가 앞에서 이미 다 나옴)는 다음 판엔 한방이 아니므로, C 자신만 뺀 채로 다시 판단한다.
    dictionary.hasContinuation(game.dictionary, lastSyllable(c), usedWith(new Set(), c)).then((has) => { if (!has) note(); }).catch(() => {});
  }
  // 📒 한방 노트의 단어가 이제는 한방이 아니라고 판정됐을 때(사전에 새 단어가 생기는 등): 게임은 그대로 두고
  // 뒤에서 조용히 이어 갈 단어 수를 세어, 10개 이하면 🧩 어려운 노트로 옮기고 더 많으면 노트에서 지운다.
  // 🧩 성장 모드에서 나온 단어(나·컴퓨터 모두)마다 뒤에서 조용히 이어 갈 단어 수를 세어, 1~10개면 어려운 노트에 적는다.
  // 0개(한방)이거나 이어 갈 단어가 자기 자신뿐인 단어(늡늡)는 📒 한방 쪽에서 다룬다. 같은 글자를 이미 물어 봤으면 30분 캐시를 다시 써서 거의 공짜다.
  function noteHard(game, { word, definition }) {
    if (game.mode !== 'growth') return;
    const dict = game.dictionary; const syllable = lastSyllable(word);
    if (brain.has(dict, word, 'hard') || brain.has(dict, word, 'shot')) return;
    dictionary.countContinuation(dict, syllable, HARD_LIMIT).then((count) => {
      const deadEnd = dictionary.knownContinuation(dict, syllable, usedWith(new Set(), word)) === false;
      if (count >= 1 && count <= HARD_LIMIT && !deadEnd && !brain.has(dict, word, 'shot')) brain.remember(dict, word, definition, 'hard');
    }).catch(() => {}); // 사전이 안 되면 이번엔 그냥 넘어간다
  }
  function recheckShot(dict, word) {
    if (!brain.has(dict, word, 'shot')) return;
    dictionary.countContinuation(dict, lastSyllable(word), HARD_LIMIT).then((count) => {
      const definition = brain.definitionOf(dict, word, 'shot');
      if (!brain.forget(dict, word, 'shot')) return; // 그사이 이미 옮겼으면 그만
      if (count <= HARD_LIMIT) brain.remember(dict, word, definition, 'hard');
    }).catch(() => {}); // 사전에 못 물어보면 다음에 다시 쓸 때 또 확인한다
  }
  // 쓸 수 있는 🪤 함정을 찾는다. 이미 아는 바로 이어 갈 단어가 3개보다 많아진 함정은(예전에 조건 없이 적혔거나
  // 사전에 단어가 늘어남) 쓰지 않고 노트에서 지운다. 모르면 배울 때 확인했으니 믿고 쓴다.
  function findTrap(dict, starts, used) {
    for (;;) {
      const trap = brain.find(dict, starts, used, random, 'trap');
      if (!trap) return null;
      const syllable = lastSyllable(trap.word);
      const known = dictionary.knownContinuation(dict, syllable);
      const few = dictionary.fewContinuations(dict, syllable);
      if (known !== true || (few && few.length <= TRAP_LIMIT)) return trap;
      brain.forget(dict, trap.word, 'trap');
    }
  }
  // 성장 모드 컴퓨터의 차례(위에서부터 되는 것을 쓴다):
  //   ① 📒 한방 노트로 바로 끝내기 → ② 🪤 함정 단어로 2단 공격 준비 → ③ 한방 글자로 끝나는 사전 단어로 공격
  //   → ④ 🧩 어려운 노트(조심 단어·글자는 빼고) → ⑤ 🔭 한 수 내다보기: 🚫 조심 단어와 조심 단어의 끝 글자로 끝나는 단어는 빼고,
  //     상대가 이어 갈 단어가 가장 적게 남는 단어를 고른다.
  async function growthPick(dict, syllable, used) {
    const power = strength(brain.count(dict));
    const starts = allowedStarts(syllable);
    const pickFrom = (list) => list[Math.floor(random() * list.length)];
    const remembers = random() < power.memoryChance;
    if (remembers) {
      const shot = brain.find(dict, starts, used, random, 'shot');
      if (shot) return { ...shot, how: 'memory' };
      const trap = findTrap(dict, starts, used);
      if (trap) return { ...trap, how: 'trap' };
    }
    const all = await dictionary.candidates(dict, syllable, used);
    if (!all.length) return null;
    const deadEnds = all.filter((c) => dictionary.knownContinuation(dict, lastSyllable(c.word), usedWith(used, c.word)) === false);
    if (deadEnds.length && random() < power.attackChance) return { ...pickFrom(deadEnds), how: 'attack' };
    const riskyWords = new Set(remembers ? brain.words(dict, 'risky') : []);
    const riskyEnds = new Set([...riskyWords].map(lastSyllable));
    const isSafe = (word) => !riskyWords.has(word) && !riskyEnds.has(lastSyllable(word));
    if (remembers) {
      const hard = brain.find(dict, starts, used, random, 'hard', isSafe); // 🧩 어려운 단어도 🚫 조심 단어·글자는 피한다
      if (hard) return { ...hard, how: 'hard' };
    }
    const safe = all.filter((c) => isSafe(c.word));
    return lookahead(dict, safe.length ? safe : all, pickFrom);
  }
  // 🔭 후보 몇 개의 "다음에 상대가 이어 갈 단어 수"를 한꺼번에 세어 가장 적은 것을 고른다.
  // 사전이 느려도 컴퓨터 차례가 너무 길어지지 않게 lookaheadMs(1.5초) 안에 센 것만 보고 고른다.
  async function lookahead(dict, pool, pickFrom) {
    const offset = Math.floor(random() * pool.length);
    const sample = pool.length <= LOOKAHEAD_SIZE ? pool : Array.from({ length: LOOKAHEAD_SIZE }, (_, i) => pool[(offset + i) % pool.length]);
    const counts = new Map();
    const jobs = sample.map((c) => dictionary.countContinuation(dict, lastSyllable(c.word), LOOKAHEAD_LIMIT).then((n) => counts.set(c.word, n)).catch(() => {}));
    let timer;
    await Promise.race([Promise.all(jobs), new Promise((resolve) => { timer = setTimeout(resolve, lookaheadMs); })]);
    clearTimeout(timer);
    if (!counts.size) return pickFrom(pool);
    const fewest = Math.min(...counts.values());
    return pickFrom(sample.filter((c) => counts.get(c.word) === fewest));
  }

  app.get('/api/word-chain/solo/brain', (req, res) => res.json({ ok: true, ...brainInfo(dictionaryCode(req.query.dictionary)) }));

  // 컴퓨터가 먼저 할 때: 흔한 글자로 시작하는, 한방단어가 아닌 첫 단어를 고른다.
  // 서로 다른 글자 몇 개를 동시에 알아보고 가장 먼저 통과한 단어를 쓴다(하나씩 차례로 하면 느리다).
  async function computerOpener(dict, used) {
    const syllables = [...COMPUTER_OPENERS].sort(() => Math.random() - 0.5).slice(0, OPENER_PARALLEL);
    const tryOne = async (syllable) => {
      const pick = await dictionary.pickWord(dict, syllable, used, { dueum: false, extraPage: false });
      if (pick && await dictionary.hasContinuation(dict, lastSyllable(pick.word), usedWith(used, pick.word))) return pick;
      throw new Error('후보 없음');
    };
    try { return await Promise.any(syllables.map(tryOne)); }
    catch (error) {
      const dictionaryError = error.errors?.find((e) => e instanceof DictionaryError);
      if (dictionaryError) throw dictionaryError;
      return null;
    }
  }

  // 컴퓨터의 첫 단어를 사전마다 하나씩 미리 골라 둔다. 쓰면 바로 다음 것을 뒤에서 다시 준비한다.
  const openers = new Map(); // 사전 → Promise<단어|null>
  const prepareOpener = (dict) => {
    const promise = computerOpener(dict, new Set()).catch(() => null);
    openers.set(dict, promise); return promise;
  };
  async function takeOpener(dict, used) {
    const ready = openers.get(dict) || prepareOpener(dict);
    openers.delete(dict);
    const pick = await ready;
    prepareOpener(dict);
    return pick || computerOpener(dict, used); // 미리 고른 게 실패했으면 그 자리에서 다시
  }
  // 화면에서 '컴퓨터 먼저'를 고르면 부른다. 바로 대답하고 준비는 뒤에서 한다.
  app.post('/api/word-chain/solo/warm', json, (req, res) => {
    const dict = dictionaryCode(req.body?.dictionary);
    if (dictionary.isConfigured(dict) && !openers.has(dict)) prepareOpener(dict);
    res.status(204).end();
  });

  app.post('/api/word-chain/solo', json, async (req, res) => {
    study?.gameActive(); // 게임이 사전을 쓰는 동안 미리 공부하기는 쉰다
    const dict = dictionaryCode(req.body?.dictionary);
    if (!dictionary.isConfigured(dict)) return res.status(503).json({ ok: false, message: `${DICTIONARIES[dict].name} API 키가 아직 설정되지 않았어요.` });
    const mode = req.body?.mode === 'growth' ? 'growth' : 'basic'; // basic = 원래의 무작위 컴퓨터
    const game = { mode, dictionary: dict, used: new Set(), defs: new Map(), lastWord: null, score: 0, busy: false, finished: false, pending: null, lastActive: Date.now() };
    let computer = null;
    if (req.body?.first === 'computer') {
      try { computer = await takeOpener(dict, game.used); }
      catch (error) { return res.status(503).json({ ok: false, message: error instanceof DictionaryError ? error.message : '사전을 확인하다 문제가 생겼어요.' }); }
      if (!computer) return res.status(503).json({ ok: false, message: '컴퓨터가 첫 단어를 고르지 못했어요. 다시 시작해 주세요.' });
      game.used.add(computer.word); game.defs.set(computer.word, computer.definition); game.lastWord = computer.word; noteHard(game, computer);
    }
    if (soloGames.size >= SOLO_MAX) soloGames.delete(soloGames.keys().next().value);
    const id = crypto.randomUUID();
    soloGames.set(id, game);
    res.json({ ok: true, id, dictionary: dict, mode, brain: mode === 'growth' ? brainInfo(dict) : null, computer, nextStarts: computer ? allowedStarts(lastSyllable(computer.word)) : null });
  });

  app.post('/api/word-chain/solo/:id/word', json, async (req, res) => {
    study?.gameActive();
    const game = soloGames.get(req.params.id);
    if (!game) return res.status(404).json({ ok: false, message: '게임이 오래되어 끝났어요. 새 게임을 시작해 주세요.' });
    if (game.finished) return res.status(400).json({ ok: false, message: '이미 끝난 게임이에요.' });
    if (game.busy) return res.status(429).json({ ok: false, message: '앞 단어를 확인하는 중이에요.' });
    game.busy = true; game.lastActive = Date.now();
    try {
      const result = await checkWord(dictionary, game.dictionary, req.body?.word, game.lastWord, game.used);
      if (!result.ok) return res.json(result);
      game.used.add(result.word); game.defs.set(result.word, result.definition); noteHard(game, result);
      const playerSyllable = lastSyllable(result.word);
      // 내 단어가 이미 단어장에 한방으로 있으면 컴퓨터에게 물어볼 것도 없이 바로 승리.
      const playerOneShot = dictionary.knownContinuation(game.dictionary, playerSyllable, game.used) === false;
      let computer = null;
      try { if (!playerOneShot) computer = game.mode === 'growth' ? await growthPick(game.dictionary, playerSyllable, game.used) : await dictionary.pickWord(game.dictionary, playerSyllable, game.used); }
      catch (error) {
        game.used.delete(result.word); // 컴퓨터가 대답을 못 한 건 사전 연결 문제이니 내 단어를 없던 일로 한다
        return res.json({ ok: false, dictionaryError: true, message: error instanceof DictionaryError ? error.message : '사전을 확인하다 문제가 생겼어요.' });
      }
      game.score += 1;
      const player = { word: result.word, definition: result.definition };
      if (!computer) {
        game.finished = true; game.lastWord = result.word;
        if (game.mode === 'growth') learnWin(game, playerOneShot ? false : undefined);
        res.json({ ok: true, player, computer: null, finished: true, result: 'win', oneShot: playerOneShot, score: game.score });
        if (game.mode !== 'growth' && !playerOneShot) learn(game.dictionary, playerSyllable); // 응답을 보낸 뒤 뒤에서 단어장에 남긴다
        return;
      }
      game.used.add(computer.word); game.defs.set(computer.word, computer.definition); game.lastWord = computer.word; noteHard(game, computer);
      const computerSyllable = lastSyllable(computer.word);
      const known = dictionary.knownContinuation(game.dictionary, computerSyllable, game.used);
      if (known === false) { // 컴퓨터가 한방단어를 썼다는 걸 이미 알면 바로 끝낸다
        game.finished = true;
        if (game.mode === 'growth') learnWin(game, known); // 컴퓨터가 이긴 판도 기억한다
        return res.json({ ok: true, player, computer, finished: true, result: 'lose', oneShot: true, score: game.score });
      }
      // 모르면 게임은 그대로 진행하고, 뒤에서 확인해 단어장에 남긴다(화면은 /one-shot으로 결과를 따로 받는다).
      const remembered = computer.how === 'memory'; // 📒 한방 노트에서 꺼낸 단어인데 한방이 아니면 뒤에서 다시 분류한다
      if (remembered && known === true) recheckShot(game.dictionary, computer.word);
      game.pending = known === undefined
        ? { word: computer.word, promise: continuationWithRetry(game.dictionary, computerSyllable, game.used, () => !game.finished && game.lastWord === computer.word)
          .then((has) => { if (has && remembered) recheckShot(game.dictionary, computer.word); return has; }).catch(() => true) }
        : null;
      res.json({ ok: true, player, computer, nextStarts: allowedStarts(computerSyllable), finished: false, checkOneShot: Boolean(game.pending), score: game.score });
    } finally { game.busy = false; }
  });

  // 컴퓨터 단어가 한방단어인지 뒤에서 확인한 결과. 그동안 사람은 계속 단어를 생각하고 입력할 수 있다.
  app.get('/api/word-chain/solo/:id/one-shot', async (req, res) => {
    const game = soloGames.get(req.params.id);
    const pending = game?.pending;
    if (!pending) return res.json({ ok: true, oneShot: false });
    const has = await Promise.race([pending.promise, new Promise((resolve) => setTimeout(resolve, ONE_SHOT_WAIT_MS, true))]);
    if (has || game.finished || game.lastWord !== pending.word) return res.json({ ok: true, oneShot: false });
    game.finished = true; game.pending = null;
    if (game.mode === 'growth') learnWin(game, false); // 컴퓨터가 이긴 판도 기억한다
    res.json({ ok: true, oneShot: true, word: pending.word, result: 'lose', score: game.score });
  });

  app.post('/api/word-chain/solo/:id/giveup', (req, res) => {
    const game = soloGames.get(req.params.id);
    if (!game) return res.status(404).json({ ok: false, message: '게임을 찾을 수 없어요.' });
    game.finished = true;
    res.json({ ok: true, result: 'lose', score: game.score });
  });

  // ── 여럿이 방에서 ──
  const rooms = new Map();
  const timers = new Map();
  const channel = (room) => `wc:${room.code}`;
  let gameCounter = 0;

  function roomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do code = Array.from({ length: 6 }, () => chars[crypto.randomInt(chars.length)]).join('');
    while (rooms.has(code));
    return code;
  }
  function freeColor(room) {
    const used = new Set([...room.players.values()].map((p) => p.color));
    return COLORS.find((c) => !used.has(c)) || COLORS[0];
  }

  function publicGame(game) {
    if (!game) return null;
    return { words: game.words.slice(-PUBLIC_WORD_LIMIT), wordCount: game.words.length, turnUserId: game.turnUserId,
      turnMsLeft: game.checking ? game.pausedMs : game.turnEndsAt ? Math.max(0, game.turnEndsAt - Date.now()) : null,
      checking: game.checking, lastWord: game.lastWord, nextStarts: game.lastWord ? allowedStarts(lastSyllable(game.lastWord)) : null,
      ranking: game.ranking || null };
  }
  function publicRoom(room) {
    return { code: room.code, title: room.title, state: room.state, hostId: room.hostId, maxPlayers: room.maxPlayers,
      turnTime: room.turnTime, dictionary: room.dictionary, dictionaryName: DICTIONARIES[room.dictionary].name,
      isPublic: room.isPublic, playerCount: room.players.size,
      players: [...room.players.values()].map((p) => ({ userId: p.userId, nickname: p.nickname, color: p.color, ready: p.ready,
        connected: p.connected, alive: p.alive, score: p.score, isHost: room.hostId === p.userId })),
      game: publicGame(room.game) };
  }
  function publicList() {
    return [...rooms.values()].filter((r) => r.isPublic).map((r) => ({ code: r.code, title: r.title,
      playerCount: r.players.size, maxPlayers: r.maxPlayers, state: r.state, turnTime: r.turnTime,
      dictionaryName: DICTIONARIES[r.dictionary].name, canJoin: r.state !== 'playing' && r.players.size < r.maxPlayers,
      hostNickname: r.players.get(r.hostId)?.nickname || '', createdAt: r.createdAt }));
  }

  function emitList() { io.emit('wc:rooms:list', publicList()); }
  function emitState(room) { io.to(channel(room)).emit('wc:room:state', publicRoom(room)); emitList(); }
  function addChat(room, message) {
    room.chat.push({ id: crypto.randomUUID(), at: Date.now(), ...message });
    if (room.chat.length > CHAT_LIMIT) room.chat.splice(0, room.chat.length - CHAT_LIMIT);
    io.to(channel(room)).emit('wc:chat:message', room.chat.at(-1));
  }
  function clearTimer(room) { clearTimeout(timers.get(room.code)); timers.delete(room.code); }
  function membership(socket) {
    const room = rooms.get(socket.data.wcRoomCode);
    const player = room?.players.get(socket.data.wcUserId);
    if (!room || !player || player.socketId !== socket.id) return {};
    return { room, player };
  }
  const aliveCount = (room) => [...room.players.values()].filter((p) => p.alive).length;

  function finishGame(room, reason = '') {
    clearTimer(room);
    room.state = 'finished';
    Object.assign(room.game, { turnUserId: null, turnEndsAt: null, checking: false, checkToken: null });
    room.game.ranking = rankPlayers(room.players.values(), room.game.eliminated);
    if (reason) addChat(room, { type: 'system', text: reason });
    io.to(channel(room)).emit('wc:game:finished', { ranking: room.game.ranking });
    emitState(room);
  }

  function startTimer(room, ms) {
    clearTimer(room);
    const { game } = room; const userId = game.turnUserId;
    game.turnEndsAt = Date.now() + ms;
    timers.set(room.code, setTimeout(() => {
      if (room.state !== 'playing' || game.turnUserId !== userId || game.checking) return;
      const player = room.players.get(userId);
      if (player) eliminate(room, player, `⏰ ${player.nickname}님 시간 초과! 탈락했어요.`);
    }, ms));
  }

  // 지금 차례 다음의, 아직 탈락하지 않은 접속 중인 사람에게 차례를 넘긴다.
  function nextTurn(room) {
    clearTimer(room);
    const { game } = room; const { order } = game;
    Object.assign(game, { checking: false, checkToken: null, pausedMs: null });
    const current = Math.max(0, order.indexOf(game.turnUserId));
    let next = null;
    for (let step = 1; step <= order.length; step += 1) {
      const p = room.players.get(order[(current + step) % order.length]);
      if (p?.alive && p.connected) { next = p.userId; break; }
    }
    game.turnUserId = next;
    if (next && room.turnTime) startTimer(room, room.turnTime * secondMs); else game.turnEndsAt = null;
  }

  // 탈락하면 끝말이 끊기고, 다음 사람은 아무 단어로 새로 시작한다(한방단어 금지는 다시 적용).
  function eliminate(room, player, message) {
    player.alive = false;
    room.game.eliminated.push(player.userId);
    room.game.lastWord = null;
    addChat(room, { type: 'out', userId: player.userId, color: player.color, text: message });
    io.to(channel(room)).emit('wc:player:out', { userId: player.userId });
    if (aliveCount(room) <= 1) {
      const winner = [...room.players.values()].find((p) => p.alive);
      return finishGame(room, winner ? `🏆 ${winner.nickname}님이 끝까지 살아남았어요!` : '게임이 끝났어요.');
    }
    addChat(room, { type: 'system', text: '끝말이 끊겼어요. 다음 사람은 아무 단어로 새로 시작해요.' });
    nextTurn(room); emitState(room);
  }

  // 방금 나온 단어가 한방단어인지 본다. 단어장에 있으면 바로, 없으면 뒤에서 사전에 물어 확인·저장한다.
  // 한방이면 다음 사람은 이어 갈 수 없으니 기다리지 않고 바로 탈락시킨다.
  function watchOneShot(room, game, entry) {
    const syllable = lastSyllable(entry.word);
    const known = dictionary.knownContinuation(room.dictionary, syllable, game.used);
    if (known === true) return;
    if (known === false) { oneShotHit(room, game, entry); return; }
    const stillNeeded = () => rooms.get(room.code) === room && room.game === game && room.state === 'playing' && game.lastWord === entry.word;
    continuationWithRetry(room.dictionary, syllable, game.used, stillNeeded).then((has) => { if (!has) oneShotHit(room, game, entry); }).catch(() => {});
  }
  function oneShotHit(room, game, entry) {
    // 그사이 게임이 끝났거나 끝말이 이미 바뀌었으면 아무것도 하지 않는다.
    if (rooms.get(room.code) !== room || room.game !== game || room.state !== 'playing' || game.lastWord !== entry.word) return;
    const victim = room.players.get(game.turnUserId);
    if (!victim) return;
    entry.oneShot = true;
    if (game.checking) { game.checking = false; game.checkToken = null; } // 확인 중이던 단어는 어차피 이어질 수 없다
    io.to(channel(room)).emit('wc:one-shot', { word: entry.word, userId: entry.userId, victimId: victim.userId });
    eliminate(room, victim, `💥 한방단어 '${entry.word}'! ${victim.nickname}님은 이어 갈 단어가 없어 탈락했어요.`);
  }

  function startGame(room) {
    const order = [...room.players.keys()];
    for (const p of room.players.values()) Object.assign(p, { alive: true, score: 0 });
    room.game = { id: ++gameCounter, order, turnUserId: order.at(-1), turnEndsAt: null, words: [], used: new Set(), lastWord: null,
      eliminated: [], checking: false, checkToken: null, pausedMs: null, ranking: null };
    room.state = 'playing';
    nextTurn(room); // 마지막 사람 다음 = 첫 번째 사람부터
    addChat(room, { type: 'system', text: `게임 시작! ${DICTIONARIES[room.dictionary].name} 기준이에요. 첫 단어는 한방단어를 쓸 수 없어요.` });
    emitState(room);
  }

  function leave(socket, reason = 'left') {
    const { room, player } = membership(socket);
    if (!room) return;
    clearTimeout(player.disconnectTimer);
    room.players.delete(player.userId);
    socket.leave(channel(room));
    socket.data.wcRoomCode = null;
    if (!room.players.size) { clearTimer(room); rooms.delete(room.code); emitList(); return; }
    if (room.hostId === player.userId) room.hostId = room.players.keys().next().value;
    addChat(room, { type: 'system', text: `${player.nickname}님이 방에서 나갔습니다.`, reason });
    if (room.state === 'playing') {
      if (aliveCount(room) <= 1) return finishGame(room, '살아남은 참가자가 1명뿐이라 게임을 끝냅니다.');
      if (room.game.turnUserId === player.userId) nextTurn(room);
    }
    emitState(room);
  }

  function closeRoom(room, message = '방장이 방을 종료했습니다.') {
    clearTimer(room);
    io.to(channel(room)).emit('wc:room:closed', { message });
    for (const player of room.players.values()) {
      clearTimeout(player.disconnectTimer);
      const playerSocket = io.sockets.sockets.get(player.socketId);
      if (!playerSocket) continue;
      playerSocket.leave(channel(room));
      if (playerSocket.data.wcRoomCode === room.code) playerSocket.data.wcRoomCode = null;
    }
    rooms.delete(room.code); emitList();
  }

  io.on('connection', (socket) => {
    socket.on('wc:rooms:list', () => socket.emit('wc:rooms:list', publicList()));

    socket.on('wc:room:create', (raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const nickname = text(raw?.nickname, 30); const userId = text(raw?.userId, 80);
      if (!nickname || !userId) return ack({ ok: false, message: '닉네임을 입력해 주세요.' });
      const dict = dictionaryCode(raw?.dictionary);
      if (!dictionary.isConfigured(dict)) return ack({ ok: false, message: `${DICTIONARIES[dict].name} API 키가 아직 설정되지 않았어요.` });
      const turnTime = Number(raw?.turnTime);
      const code = roomCode();
      const room = { code, title: text(raw?.title, 30) || '끝말잇기', isPublic: raw?.isPublic !== false, dictionary: dict,
        maxPlayers: Math.min(MAX_PLAYERS, Math.max(2, Number(raw?.maxPlayers) || MAX_PLAYERS)),
        turnTime: TURN_TIMES.includes(turnTime) ? turnTime : 15,
        hostId: userId, players: new Map(), state: 'waiting', game: null, chat: [], createdAt: Date.now() };
      room.players.set(userId, { userId, nickname, socketId: socket.id, connected: true, ready: true, alive: true, score: 0, color: COLORS[0] });
      rooms.set(code, room); socket.data.wcRoomCode = code; socket.data.wcUserId = userId; socket.join(channel(room));
      addChat(room, { type: 'system', text: `${nickname}님이 방을 만들었습니다.` }); emitState(room); ack({ ok: true, code });
    });

    socket.on('wc:room:join', (raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const code = text(raw?.code, 6).toUpperCase(); const room = rooms.get(code);
      const nickname = text(raw?.nickname, 30); const userId = text(raw?.userId, 80);
      if (!nickname || !userId) return ack({ ok: false, message: '닉네임을 입력해 주세요.' });
      if (!room) return ack({ ok: false, message: '방을 찾을 수 없습니다.' });
      const existing = room.players.get(userId);
      if (!existing && room.players.size >= room.maxPlayers) return ack({ ok: false, message: '방이 가득 찼습니다.' });
      if (!existing && room.state === 'playing') return ack({ ok: false, message: '이미 게임이 시작되었습니다.' });
      const lower = nickname.toLocaleLowerCase('ko-KR');
      if ([...room.players.values()].some((p) => p.userId !== userId && p.nickname.toLocaleLowerCase('ko-KR') === lower)) {
        return ack({ ok: false, message: '이미 사용 중인 닉네임입니다.' });
      }
      const player = existing || { userId, ready: false, alive: true, score: 0, color: freeColor(room) };
      const wasAway = existing && !existing.connected;
      clearTimeout(player.disconnectTimer);
      Object.assign(player, { nickname, socketId: socket.id, connected: true });
      room.players.set(userId, player);
      socket.data.wcRoomCode = code; socket.data.wcUserId = userId; socket.join(channel(room));
      if (!existing) addChat(room, { type: 'system', text: `${nickname}님이 참가했습니다.` });
      socket.emit('wc:chat:history', room.chat);
      // 모두 끊겨 멈춰 있던 게임이면 돌아온 사람부터 다시 진행한다.
      if (wasAway && room.state === 'playing' && !room.game.turnUserId && player.alive) {
        const { order } = room.game;
        room.game.turnUserId = order[(order.indexOf(userId) - 1 + order.length) % order.length];
        nextTurn(room);
      }
      emitState(room); ack({ ok: true, code });
    });

    socket.on('wc:room:ready', (ready, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket); if (!room) return ack({ ok: false });
      if (room.hostId === player.userId) return ack({ ok: false, message: '방장은 준비할 필요가 없습니다.' });
      player.ready = Boolean(ready); emitState(room); ack({ ok: true });
    });

    // 대기실에서 방장이 차례 순서를 바꾼다: { userId, dir: -1(위로)|1(아래로) } 또는 { shuffle: true }
    socket.on('wc:room:order', (raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket);
      if (!room || room.hostId !== player.userId) return ack({ ok: false, message: '방장만 순서를 바꿀 수 있어요.' });
      if (room.state === 'playing') return ack({ ok: false, message: '게임 중에는 순서를 바꿀 수 없어요.' });
      const order = [...room.players.keys()];
      if (raw?.shuffle) {
        for (let i = order.length - 1; i > 0; i -= 1) { const j = crypto.randomInt(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
      } else {
        const from = order.indexOf(text(raw?.userId, 80)); const to = from + (Number(raw?.dir) < 0 ? -1 : 1);
        if (from < 0 || to < 0 || to >= order.length) return ack({ ok: false, message: '더 옮길 수 없어요.' });
        [order[from], order[to]] = [order[to], order[from]];
      }
      // Map은 넣은 순서를 기억하므로, 새 순서로 다시 만들면 목록·게임 차례가 모두 그 순서를 따른다.
      room.players = new Map(order.map((id) => [id, room.players.get(id)]));
      if (raw?.shuffle) addChat(room, { type: 'system', text: `🔀 차례 순서를 섞었어요: ${order.map((id) => room.players.get(id).nickname).join(' → ')}` });
      emitState(room); ack({ ok: true });
    });

    socket.on('wc:game:start', (_raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket);
      if (!room || room.hostId !== player.userId) return ack({ ok: false, message: '방장만 시작할 수 있습니다.' });
      if (room.state === 'playing') return ack({ ok: false, message: '이미 게임 중입니다.' });
      if (room.players.size < 2) return ack({ ok: false, message: '2명 이상 모여야 시작할 수 있습니다.' });
      if ([...room.players.values()].some((p) => p.userId !== room.hostId && !p.ready)) {
        return ack({ ok: false, message: '모든 참가자가 준비해야 합니다.' });
      }
      startGame(room); ack({ ok: true });
    });

    socket.on('wc:word', async (raw, ack = () => {}) => {
      study?.gameActive();
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket);
      if (!room || room.state !== 'playing') return ack({ ok: false, message: '게임 중이 아닙니다.' });
      const { game } = room;
      if (game.turnUserId !== player.userId) return ack({ ok: false, message: '내 차례가 아니에요.' });
      if (game.checking) return ack({ ok: false, message: '사전에서 확인하는 중이에요.' });
      // 사전을 확인하는 동안은 시계를 멈춘다(국립국어원 서버가 느려도 억울하게 시간이 줄지 않게).
      const token = crypto.randomUUID();
      Object.assign(game, { checking: true, checkToken: token, pausedMs: Math.max(0, (game.turnEndsAt || Date.now()) - Date.now()) });
      clearTimer(room); game.turnEndsAt = null; emitState(room);
      const result = await checkWord(dictionary, room.dictionary, raw?.word, game.lastWord, game.used);
      // 확인하는 사이에 나가거나 끊겨 차례가 넘어갔으면 결과를 버린다.
      if (rooms.get(room.code) !== room || room.game !== game || game.checkToken !== token) return ack({ ok: false, message: '차례가 이미 넘어갔어요.' });
      game.checking = false; game.checkToken = null;
      if (!result.ok) {
        const tried = String(raw?.word ?? '').replace(/\s/g, '').slice(0, 20);
        if (tried) addChat(room, { type: 'reject', userId: player.userId, color: player.color, text: `${player.nickname}: ${tried} ✗ ${result.message}` });
        if (room.turnTime) startTimer(room, Math.max(game.pausedMs, Math.min(MIN_RESUME_MS, room.turnTime * secondMs)));
        game.pausedMs = null;
        emitState(room); return ack(result);
      }
      const entry = { word: result.word, definition: result.definition, userId: player.userId, nickname: player.nickname, color: player.color };
      game.words.push(entry);
      game.used.add(result.word); game.lastWord = result.word; player.score += 1;
      io.to(channel(room)).emit('wc:word:accepted', { word: result.word, userId: player.userId });
      ack({ ok: true, word: result.word });
      nextTurn(room); emitState(room);
      watchOneShot(room, game, entry); // 다음 차례는 이미 시작됐고, 한방 확인은 뒤에서 한다
    });

    // 시간 제한이 없을 때 막히면 스스로 탈락할 수 있다(내 차례에만).
    socket.on('wc:giveup', (_raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket);
      if (!room || room.state !== 'playing') return ack({ ok: false, message: '게임 중이 아닙니다.' });
      if (room.game.turnUserId !== player.userId) return ack({ ok: false, message: '내 차례에만 포기할 수 있어요.' });
      if (room.game.checking) return ack({ ok: false, message: '사전에서 확인하는 중이에요.' });
      ack({ ok: true });
      eliminate(room, player, `🏳 ${player.nickname}님이 포기했어요.`);
    });

    socket.on('wc:chat:send', (raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket); if (!room) return ack({ ok: false });
      const value = text(raw?.text, 200); if (!value) return ack({ ok: false });
      addChat(room, { type: 'chat', userId: player.userId, nickname: player.nickname, text: value }); ack({ ok: true });
    });

    socket.on('wc:room:close', (_raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket);
      if (!room || room.hostId !== player.userId) return ack({ ok: false, message: '방장만 방을 종료할 수 있습니다.' });
      closeRoom(room); ack({ ok: true });
    });

    socket.on('wc:room:leave', (_raw, ack = () => {}) => { leave(socket); if (typeof ack === 'function') ack({ ok: true }); });

    // 새로고침·화면 이동처럼 금방 돌아오는 경우를 위해 3초 기다린 뒤에야 "연결 끊김"으로 처리하고 차례를 넘긴다.
    socket.on('disconnect', () => {
      const { room, player } = membership(socket); if (!room) return;
      player.disconnectTimer = setTimeout(() => {
        if (room.players.get(player.userId) !== player || player.socketId !== socket.id) return;
        player.connected = false;
        if (room.state === 'playing' && room.game.turnUserId === player.userId) nextTurn(room);
        emitState(room);
        player.disconnectTimer = setTimeout(() => {
          if (!player.connected && room.players.get(player.userId) === player) {
            socket.data.wcRoomCode = room.code; socket.data.wcUserId = player.userId; leave(socket, 'disconnect');
          }
        }, RECONNECT_MS);
      }, DISCONNECT_GRACE_MS);
    });
  });

  return { rooms, soloGames, publicList,
    close: () => { clearInterval(soloCleanup); for (const timer of timers.values()) clearTimeout(timer); rooms.clear(); soloGames.clear(); } };
}

module.exports = { setupWordChainGame, rankPlayers, checkWord, TURN_TIMES };
