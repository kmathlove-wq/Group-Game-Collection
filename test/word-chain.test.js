const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { io: createClient } = require('socket.io-client');
const R = require('../src/word-chain/rules');
const { createDictionary, DictionaryError } = require('../src/word-chain/dictionary');
const { setupWordChainGame, rankPlayers } = require('../src/word-chain');
const { createOneShotStore } = require('../src/word-chain/one-shot-store');
const { createBrain, strengthOf } = require('../src/word-chain/brain');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ── 가짜 사전: 실제 API 대신 정해진 낱말만 아는 사전(키 없이도 게임 흐름을 검사) ──
const WORDS = ['사과', '과자', '자두', '두부', '부엉이', '이빨', '빨대', '알루미늄', '경력', '역사', '공알'];
function fakeDictionary(words = WORDS) {
  const known = new Map(); // 진짜와 같이 한 번 확인한 끝 글자는 기억한다
  return {
    known,
    isConfigured: () => true,
    knownContinuation: (_dict, syllable) => known.get(syllable),
    async lookup(_dict, word) { return words.includes(word) ? { found: true, word, definition: `${word}의 뜻` } : { found: false, reason: '사전에 없는 단어예요.' }; },
    async hasContinuation(_dict, syllable) {
      const starts = R.allowedStarts(syllable); const has = words.some((w) => starts.includes(w[0]));
      known.set(syllable, has); return has;
    },
    async countContinuation(_dict, syllable) { const starts = R.allowedStarts(syllable); return words.filter((w) => starts.includes(w[0])).length; },
    async pickWord(_dict, syllable, used, { dueum = true, prefer = null } = {}) { // extraPage는 가짜 사전에선 의미 없음
      const starts = dueum ? R.allowedStarts(syllable) : [syllable];
      const all = words.filter((w) => starts.includes(w[0]) && !used.has(w));
      const best = prefer && all.length ? Math.max(...all.map(prefer)) : 0;
      const word = all.find((w) => !prefer || prefer(w) === best); // 진짜는 무작위, 가짜는 목록 순서대로
      return word ? { word, definition: `${word}의 뜻` } : null;
    }
  };
}

async function startServer(t, options = {}, words = WORDS) {
  const app = express(); const server = http.createServer(app); const io = new Server(server);
  const dictionary = fakeDictionary(words);
  const game = setupWordChainGame({ app, io, rootDir: `${__dirname}/..`, dictionary, ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { game.close(); await new Promise((resolve) => io.close(resolve)); });
  return { url, game, dictionary };
}
const post = async (url, body) => (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })).json();
function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = createClient(url, { transports: ['websocket'], forceNew: true });
    socket.once('connect', () => resolve(socket)); socket.once('connect_error', reject);
  });
}
function emitAck(socket, event, payload = {}) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${event} 응답 시간 초과`)), 2_000);
    socket.emit(event, payload, (result) => { clearTimeout(timeout); resolve(result); });
  });
}

test('끝말잇기: 두음법칙은 원음·정방향·역방향을 모두 허용한다', () => {
  assert.equal(R.dueumVariant('력'), '역');
  assert.equal(R.dueumVariant('라'), '나');
  assert.equal(R.dueumVariant('녀'), '여');
  assert.equal(R.dueumVariant('가'), '가');
  assert.deepEqual(R.allowedStarts('력'), ['력', '역']);
  assert.deepEqual(R.allowedStarts('여'), ['여', '려', '녀']);
  assert.deepEqual(R.allowedStarts('노'), ['노', '로']);
  assert.equal(R.lastSyllable('알루미늄'), '늄');
  assert.equal(R.cleanWord('사과^나무-'), '사과나무');
});

test('끝말잇기: 사전에 묻기 전 규칙을 검사한다', () => {
  const used = new Set(['과자']);
  assert.match(R.precheck('', null, used), /입력/);
  assert.match(R.precheck('apple', null, used), /한글/);
  assert.match(R.precheck('ㄱㄴ', null, used), /한글/);
  assert.match(R.precheck('차', null, used), /두 글자/);
  assert.match(R.precheck('두부', '사과', used), /'과'/);
  assert.match(R.precheck('과자', '사과', used), /이미/);
  assert.equal(R.precheck('역사', '경력', used), null); // 두음법칙
  assert.equal(R.precheck('사과', null, used), null);   // 첫 단어는 아무 글자나
});

test('끝말잇기: 사전 응답(JSON·XML 오류)을 해석하고 결과를 기억한다', async () => {
  const calls = [];
  const replies = {
    'exact|사과': { channel: { total: 2, item: [
      { word: '사과', pos: '명사', sense: { definition: '사과나무의 열매.' } },
      { word: '사과', sense: [{ pos: '동사', definition: '잘못을 빌다.' }] }] } },
    'exact|달리다': { channel: { total: 1, item: { word: '달리다', sense: { pos: '동사', definition: '뛰어가다.' } } } },
    'exact|없는말': { channel: { total: 0, item: [] } },
    'start|과': { channel: { total: 2, item: [{ word: '과', pos: '명사', sense: {} }, { word: '과자', pos: '명사', sense: { definition: '간식.' } }] } },
    'start|늄': { channel: { total: 0, item: [] } }
  };
  const fetchImpl = async (url) => {
    const params = new URL(url).searchParams; calls.push(params);
    const body = replies[`${params.get('method')}|${params.get('q')}`];
    return { ok: true, status: 200, text: async () => (body ? JSON.stringify(body) : '') };
  };
  const dict = createDictionary({ env: { STDICT_API_KEY: 'test-key' }, fetchImpl, random: () => 0 });
  assert.equal(dict.isConfigured('stdict'), true);
  assert.equal(dict.isConfigured('opendict'), false);
  assert.deepEqual(await dict.lookup('stdict', '사과'), { found: true, word: '사과', definition: '사과나무의 열매.' });
  assert.match((await dict.lookup('stdict', '달리다')).reason, /명사/);
  assert.match((await dict.lookup('stdict', '없는말')).reason, /없는 단어/);
  assert.equal(await dict.hasContinuation('stdict', '과'), true);   // 한 글자 '과'는 빼고 '과자'로 판정
  assert.equal(await dict.hasContinuation('stdict', '늄'), false);
  assert.deepEqual(await dict.pickWord('stdict', '과', new Set()), { word: '과자', definition: '간식.' });
  assert.equal(await dict.pickWord('stdict', '과', new Set(['과자'])), null);
  const params = calls[0];
  assert.equal(params.get('key'), 'test-key'); assert.equal(params.get('req_type'), 'json'); assert.equal(params.get('advanced'), 'y');
  const before = calls.length; await dict.lookup('stdict', '사과');
  assert.equal(calls.length, before, '같은 질문은 다시 보내지 않는다');

  await assert.rejects(dict.lookup('opendict', '사과'), (error) => error instanceof DictionaryError && /키가 설정/.test(error.message));
  const xml = createDictionary({ env: { OPENDICT_API_KEY: 'k' }, fetchImpl: async () => ({ ok: true, status: 200, text: async () => '<error><error_code>020</error_code><message>등록되지 않은 키입니다.</message></error>' }) });
  await assert.rejects(xml.lookup('opendict', '사과'), /우리말샘: 등록되지 않은 키/);
});

test('끝말잇기: 순위는 살아남은 사람 → 늦게 탈락한 순서다', () => {
  const players = [{ userId: 'a', alive: false, score: 3 }, { userId: 'b', alive: true, score: 1 }, { userId: 'c', alive: false, score: 5 }];
  assert.deepEqual(rankPlayers(players, ['c', 'a']).map((r) => [r.userId, r.rank]), [['b', 1], ['a', 2], ['c', 3]]);
});

test('끝말잇기: 컴퓨터랑 대결 — 첫 한방단어 금지, 컴퓨터가 막히면 승리', async (t) => {
  const { url } = await startServer(t);
  const status = await (await fetch(`${url}/api/word-chain/status`)).json();
  assert.deepEqual(status.dictionaries.map((d) => [d.code, d.ready]), [['stdict', true], ['opendict', true]]);
  const { id } = await post(`${url}/api/word-chain/solo`, { dictionary: 'opendict' });
  const say = (word) => post(`${url}/api/word-chain/solo/${id}/word`, { word });
  assert.match((await say('알루미늄')).message, /한방단어/);
  assert.match((await say('바나나')).message, /없는/);
  let reply = await say('사과');
  assert.equal(reply.computer.word, '과자'); assert.deepEqual(reply.nextStarts, ['자']);
  assert.match((await say('사과')).message, /'자'/);
  reply = await say('자두'); assert.equal(reply.computer.word, '두부');
  reply = await say('부엉이'); assert.equal(reply.computer.word, '이빨');
  reply = await say('빨대');
  assert.equal(reply.finished, true); assert.equal(reply.result, 'win'); assert.equal(reply.computer, null); assert.equal(reply.score, 4);
  assert.match((await say('대추')).message, /끝난/);
  assert.equal((await post(`${url}/api/word-chain/solo/없는게임/word`, { word: '사과' })).ok, false);
});

test('끝말잇기: 여럿이 방 — 차례·틀린 단어·시간 초과 탈락·우승', async (t) => {
  const { url } = await startServer(t, { secondMs: 5 }); // 10초 차례 = 50ms
  const host = await connect(url); const guest = await connect(url);
  t.after(() => { host.close(); guest.close(); });

  const created = await emitAck(host, 'wc:room:create', { userId: 'wc-host', nickname: '방장', turnTime: 10, dictionary: 'opendict' });
  assert.equal(created.ok, true);
  const { code } = created;
  assert.equal((await emitAck(guest, 'wc:room:join', { userId: 'wc-guest', nickname: '손님', code })).ok, true);
  assert.equal((await emitAck(guest, 'wc:room:ready', true)).ok, true);

  const started = new Promise((resolve) => host.on('wc:room:state', (room) => { if (room.state === 'playing') resolve(room); }));
  assert.equal((await emitAck(host, 'wc:game:start')).ok, true);
  const room = await started; host.removeAllListeners('wc:room:state');
  assert.equal(room.dictionaryName, '우리말샘');
  assert.equal(room.game.turnUserId, 'wc-host');
  assert.match((await emitAck(guest, 'wc:word', { word: '사과' })).message, /차례/);
  assert.match((await emitAck(host, 'wc:word', { word: '알루미늄' })).message, /한방단어/);
  assert.equal((await emitAck(host, 'wc:word', { word: '사과' })).ok, true);
  assert.match((await emitAck(guest, 'wc:word', { word: '두부' })).message, /'과'/);
  assert.equal((await emitAck(guest, 'wc:word', { word: '과자' })).ok, true);

  // 방장이 아무것도 내지 않으면 시간 초과로 탈락하고 손님이 우승한다.
  const { ranking } = await new Promise((resolve) => guest.once('wc:game:finished', resolve));
  assert.deepEqual(ranking.map((r) => [r.userId, r.rank, r.score]), [['wc-guest', 1, 1], ['wc-host', 2, 1]]);
  assert.equal((await emitAck(host, 'wc:word', { word: '자두' })).ok, false);

  const closed = new Promise((resolve) => guest.once('wc:room:closed', resolve));
  assert.equal((await emitAck(guest, 'wc:room:close')).ok, false);
  assert.equal((await emitAck(host, 'wc:room:close')).ok, true);
  await closed;
});

test('끝말잇기: 한방 단어장은 기억한 답을 파일에 저장하고 다시 읽는다', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wc-store-')), 'one-shot.json');
  const store = createOneShotStore(file);
  assert.equal(store.get('stdict', '늄'), undefined);
  store.set('stdict', '늄', false); store.set('stdict', '과', true);
  assert.equal(store.get('stdict', '늄'), false);
  assert.equal(store.get('opendict', '늄'), undefined); // 사전마다 따로
  assert.deepEqual(store.deadEnds('stdict'), ['늄']);
  await store.flush();
  const again = createOneShotStore(file);
  assert.equal(again.get('stdict', '늄'), false); assert.equal(again.get('stdict', '과'), true); assert.equal(again.size, 2);

  // 사전 조회기는 한 번 확인한 끝 글자를 단어장에서 바로 답하고 다시 묻지 않는다.
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return { ok: true, status: 200, text: async () => JSON.stringify({ channel: { total: 0, item: [] } }) }; };
  const memory = createOneShotStore(null);
  const dict = createDictionary({ env: { STDICT_API_KEY: 'k' }, fetchImpl, store: memory });
  assert.equal(dict.knownContinuation('stdict', '슘'), undefined);
  const [a, b] = await Promise.all([dict.hasContinuation('stdict', '슘'), dict.hasContinuation('stdict', '슘')]);
  assert.equal(a, false); assert.equal(b, false);
  assert.equal(memory.get('stdict', '슘'), false);
  const before = calls;
  assert.equal(await createDictionary({ env: { STDICT_API_KEY: 'k' }, fetchImpl, store: memory }).hasContinuation('stdict', '슘'), false);
  assert.equal(calls, before, '새 조회기라도 단어장에 있으면 묻지 않는다');
});

test('끝말잇기: 컴퓨터의 한방단어 — 처음엔 뒤에서 확인, 두 번째부터는 바로 끝난다', async (t) => {
  const { url, dictionary } = await startServer(t);
  let { id } = await post(`${url}/api/word-chain/solo`, { dictionary: 'stdict' });
  let reply = await post(`${url}/api/word-chain/solo/${id}/word`, { word: '공알' });
  assert.equal(reply.computer.word, '알루미늄');
  assert.equal(reply.finished, false); assert.equal(reply.checkOneShot, true); // 응답은 기다리지 않고 먼저 온다
  const check = await (await fetch(`${url}/api/word-chain/solo/${id}/one-shot`)).json();
  assert.equal(check.oneShot, true); assert.equal(check.result, 'lose');
  assert.equal(dictionary.known.get('늄'), false); // 단어장에 남았다

  ({ id } = await post(`${url}/api/word-chain/solo`, { dictionary: 'stdict' }));
  reply = await post(`${url}/api/word-chain/solo/${id}/word`, { word: '공알' });
  assert.equal(reply.finished, true); assert.equal(reply.oneShot, true); assert.equal(reply.result, 'lose');
});

test('끝말잇기: 여럿이 방 — 제한 없음·한방단어 즉시 탈락·포기', async (t) => {
  const { url } = await startServer(t);
  const a = await connect(url); const b = await connect(url); const c = await connect(url);
  t.after(() => { a.close(); b.close(); c.close(); });
  const { code } = await emitAck(a, 'wc:room:create', { userId: 'p-a', nickname: '가', turnTime: 0 });
  for (const [socket, userId, nickname] of [[b, 'p-b', '나'], [c, 'p-c', '다']]) {
    assert.equal((await emitAck(socket, 'wc:room:join', { userId, nickname, code })).ok, true);
    assert.equal((await emitAck(socket, 'wc:room:ready', true)).ok, true);
  }
  const playing = new Promise((resolve) => a.on('wc:room:state', (room) => { if (room.state === 'playing') resolve(room); }));
  assert.equal((await emitAck(a, 'wc:game:start')).ok, true);
  const room = await playing; a.removeAllListeners('wc:room:state');
  assert.equal(room.turnTime, 0); assert.equal(room.game.turnMsLeft, null); // 시계 없음

  assert.equal((await emitAck(a, 'wc:word', { word: '공알' })).ok, true);
  const boom = new Promise((resolve) => a.once('wc:one-shot', resolve));
  const afterBoom = new Promise((resolve) => a.on('wc:room:state', (r) => { if (r.players.find((p) => p.userId === 'p-c')?.alive === false) resolve(r); }));
  assert.equal((await emitAck(b, 'wc:word', { word: '알루미늄' })).ok, true);
  assert.deepEqual(await boom, { word: '알루미늄', userId: 'p-b', victimId: 'p-c' });
  const state = await afterBoom; a.removeAllListeners('wc:room:state');
  assert.equal(state.game.turnUserId, 'p-a');   // 탈락한 다음 사람 건너 새 끝말
  assert.equal(state.game.lastWord, null);
  assert.equal(state.game.words.at(-1).oneShot, true);

  assert.match((await emitAck(b, 'wc:giveup')).message, /내 차례/);
  const finished = new Promise((resolve) => b.once('wc:game:finished', resolve));
  assert.equal((await emitAck(a, 'wc:giveup')).ok, true);
  const { ranking } = await finished;
  assert.deepEqual(ranking.map((r) => [r.userId, r.rank]), [['p-b', 1], ['p-a', 2], ['p-c', 3]]);
});

test('끝말잇기: 컴퓨터 먼저 — 한방단어가 아닌 첫 단어로 시작한다', async (t) => {
  const openers = ['가', '고', '기', '나', '노', '다', '도', '마', '무', '바', '부', '사', '수', '시', '오', '우', '자', '주', '하', '호'];
  const { url } = await startServer(t, {}, [...openers.map((o) => `${o}과`), '과자', '자두']);
  const warm = await fetch(`${url}/api/word-chain/solo/warm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"dictionary":"stdict"}' });
  assert.equal(warm.status, 204);
  const start = await post(`${url}/api/word-chain/solo`, { dictionary: 'stdict', first: 'computer' });
  assert.equal(start.ok, true);
  assert.match(start.computer.word, /^.과$/); assert.deepEqual(start.nextStarts, ['과']);
  const reply = await post(`${url}/api/word-chain/solo/${start.id}/word`, { word: '과자' });
  assert.equal(reply.computer.word[0], '자');
  assert.match((await post(`${url}/api/word-chain/solo/${start.id}/word`, { word: '두부' })).message, new RegExp(`'${reply.computer.word.at(-1)}'`));
  const second = await post(`${url}/api/word-chain/solo`, { dictionary: 'stdict', first: 'computer' }); // 미리 준비된 다음 단어
  assert.equal(second.ok, true); assert.match(second.computer.word, /^.과$/);
});

test('끝말잇기: 방장이 차례 순서를 바꾸고 섞을 수 있다', async (t) => {
  const { url } = await startServer(t);
  const a = await connect(url); const b = await connect(url); const c = await connect(url);
  t.after(() => { a.close(); b.close(); c.close(); });
  const { code } = await emitAck(a, 'wc:room:create', { userId: 'o-a', nickname: '가', turnTime: 0 });
  for (const [socket, userId, nickname] of [[b, 'o-b', '나'], [c, 'o-c', '다']]) {
    await emitAck(socket, 'wc:room:join', { userId, nickname, code }); await emitAck(socket, 'wc:room:ready', true);
  }
  const nextState = () => new Promise((resolve) => a.once('wc:room:state', resolve));
  assert.match((await emitAck(b, 'wc:room:order', { userId: 'o-c', dir: -1 })).message, /방장/);
  assert.match((await emitAck(a, 'wc:room:order', { userId: 'o-a', dir: -1 })).message, /옮길 수 없/);
  let state = nextState();
  assert.equal((await emitAck(a, 'wc:room:order', { userId: 'o-c', dir: -1 })).ok, true);
  assert.deepEqual((await state).players.map((p) => p.userId), ['o-a', 'o-c', 'o-b']);
  state = nextState();
  assert.equal((await emitAck(a, 'wc:room:order', { shuffle: true })).ok, true);
  const shuffled = (await state).players.map((p) => p.userId);
  assert.deepEqual([...shuffled].sort(), ['o-a', 'o-b', 'o-c']);
  // 게임은 정한 순서의 첫 사람부터 시작한다.
  const playing = new Promise((resolve) => a.on('wc:room:state', (room) => { if (room.state === 'playing') resolve(room); }));
  await emitAck(a, 'wc:game:start');
  assert.equal((await playing).game.turnUserId, shuffled[0]);
  a.removeAllListeners('wc:room:state');
  assert.match((await emitAck(a, 'wc:room:order', { shuffle: true })).message, /게임 중/);
});

test('끝말잇기 성장 모드: 기억 노트는 종류별로 적고 파일에 남는다', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wc-brain-')), 'brain.json');
  const brain = createBrain(file);
  assert.equal(brain.remember('opendict', '차풰', '뜻'), true);
  assert.equal(brain.remember('opendict', '차풰', '뜻'), false); // 같은 건 두 번 적지 않는다
  brain.remember('opendict', '수산화나트륨', '', 'trap'); brain.remember('opendict', '윰차', '', 'risky');
  assert.deepEqual(brain.find('opendict', ['차'], new Set()), { word: '차풰', definition: '뜻' });
  assert.equal(brain.find('opendict', ['차'], new Set(['차풰'])), null); // 이미 나온 단어는 안 쓴다
  assert.equal(brain.find('stdict', ['차'], new Set()), null); // 사전마다 따로
  assert.equal(brain.has('opendict', '윰차', 'risky'), true);
  assert.throws(() => brain.remember('opendict', '사과', '', 'nope'));
  await brain.flush();
  assert.deepEqual(createBrain(file).counts('opendict'), { shot: 1, trap: 1, risky: 1, hard: 0 });
});

test('끝말잇기 성장 모드: 레벨 규칙은 1부터 시작하고 확률은 0~1이며 배울수록 약해지지 않는다', () => {
  let before = strengthOf(0);
  assert.equal(before.level, 1);
  for (let learned = 1; learned <= 300; learned += 1) {
    const now = strengthOf(learned);
    for (const key of ['memoryChance', 'attackChance']) {
      assert.ok(now[key] >= 0 && now[key] <= 1, `${key}=${now[key]} (배운 단어 ${learned}개)`);
      assert.ok(now[key] >= before[key], `${key}가 줄었어요 (배운 단어 ${learned}개)`);
    }
    assert.ok(now.level >= before.level);
    before = now;
  }
});

test('끝말잇기 성장 모드: 진 판(수산화나트륨→윰차→차풰💥)을 배워 함정·한방·조심으로 쓴다', async (t) => {
  const words = ['수산화나트륨', '윰차', '윰호', '차풰', '과수', '호박', '박수'];
  const brain = createBrain(null);
  const { url } = await startServer(t, { brain, random: () => 0, strength: () => ({ level: 5, memoryChance: 1, attackChance: 0 }) }, words);
  const play = async (mode) => {
    const { id, brain: info } = await post(`${url}/api/word-chain/solo`, { dictionary: 'opendict', mode });
    return { info, say: (word) => post(`${url}/api/word-chain/solo/${id}/word`, { word }) };
  };

  // 기본 모드는 이겨도 아무것도 배우지 않는다.
  let game = await play('basic');
  assert.equal(game.info, null);
  assert.equal((await game.say('수산화나트륨')).computer.word, '윰차');
  assert.equal((await game.say('차풰')).result, 'win');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(brain.count('opendict'), 0);

  // 성장 모드에서 이기면 마지막 세 단어를 배운다.
  game = await play('growth');
  assert.equal(game.info.level, 5);
  assert.equal((await game.say('수산화나트륨')).computer.word, '윰차');
  assert.equal((await game.say('차풰')).result, 'win');
  for (let i = 0; i < 50 && brain.count('opendict') < 3; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(brain.counts('opendict'), { shot: 1, trap: 1, risky: 1, hard: 0 });
  assert.deepEqual((await (await fetch(`${url}/api/word-chain/solo/brain?dictionary=opendict`)).json()).trap, 1);

  // 🪤 '수'가 오면 함정 단어를 먼저 쓰고, 윰차로 막으면 📒 차풰로 끝낸다.
  game = await play('growth');
  let reply = await game.say('과수');
  assert.equal(reply.computer.word, '수산화나트륨'); assert.equal(reply.computer.how, 'trap');
  reply = await game.say('윰차');
  assert.equal(reply.computer.word, '차풰'); assert.equal(reply.computer.how, 'memory');
  assert.equal(reply.finished, true); assert.equal(reply.result, 'lose');

  // 🚫 '륨'이 오면 졌던 윰차 대신 다른 단어로 막는다.
  game = await play('growth');
  assert.equal((await game.say('수산화나트륨')).computer.word, '윰호');
});

test('끝말잇기 성장 모드: 기억한 한방단어가 한방이 아니게 되면 게임은 계속되고, 뒤에서 🧩 어려운 단어로 옮기거나 지운다', async (t) => {
  const words = ['사차', '차풰', '풰공', '공알', '차뢔'];
  const brain = createBrain(null);
  brain.remember('opendict', '차풰', '뜻', 'shot'); brain.remember('opendict', '차뢔', '뜻', 'shot');
  const { url, dictionary } = await startServer(t, { brain, random: () => 0, strength: () => ({ level: 1, memoryChance: 1, attackChance: 1 }) }, words);
  const wait = async (check) => { for (let i = 0; i < 100 && !check(); i += 1) await new Promise((resolve) => setTimeout(resolve, 5)); };
  const play = async (word) => {
    const { id } = await post(`${url}/api/word-chain/solo`, { dictionary: 'opendict', mode: 'growth' });
    return { id, reply: await post(`${url}/api/word-chain/solo/${id}/word`, { word }) };
  };

  // 사전에 '풰공'이 새로 생겨서 '차풰'는 이제 한방이 아니다 → 이어 갈 단어 1개라 🧩 어려운 노트로 옮긴다.
  let { id, reply } = await play('사차');
  assert.equal(reply.computer.word, '차풰'); assert.equal(reply.computer.how, 'memory');
  assert.equal(reply.finished, false); // 게임은 그대로 진행
  assert.equal((await (await fetch(`${url}/api/word-chain/solo/${id}/one-shot`)).json()).oneShot, false);
  await wait(() => brain.has('opendict', '차풰', 'hard'));
  assert.deepEqual([brain.has('opendict', '차풰', 'shot'), brain.has('opendict', '차풰', 'hard')], [false, true]);
  assert.equal((await post(`${url}/api/word-chain/solo/${id}/word`, { word: '풰공' })).computer.word, '공알'); // 내가 이어 갔다

  // '차뢔'는 아직 진짜 한방이라 컴퓨터가 이긴다.
  ({ reply } = await play('사차'));
  assert.equal(reply.computer.word, '차뢔');
  assert.equal(await dictionary.hasContinuation('opendict', '뢔'), false);

  // 6개월이 지나 '뢔'를 다시 확인했더니 이어 갈 단어가 11개 생겼다 → 노트에서 지운다.
  words.push(...[...'가나다라마바사아자차카'].map((c) => `뢔${c}`));
  dictionary.known.delete('뢔'); // 한방 단어장이 6개월 지나 잊은 상태
  ({ reply } = await play('사차'));
  assert.equal(reply.computer.word, '차뢔'); assert.equal(reply.finished, false);
  await wait(() => !brain.has('opendict', '차뢔', 'shot'));
  assert.deepEqual([brain.has('opendict', '차뢔', 'shot'), brain.has('opendict', '차뢔', 'hard')], [false, false]);

  // 끝낼 공격이 없으면 🧩 어려운 단어를 쓴다. 시간이 지나도 노트는 지우지 않는다.
  ({ reply } = await play('사차'));
  assert.equal(reply.computer.word, '차풰'); assert.equal(reply.computer.how, 'hard');
  assert.deepEqual(brain.counts('opendict'), { shot: 0, trap: 0, risky: 0, hard: 1 });
});
