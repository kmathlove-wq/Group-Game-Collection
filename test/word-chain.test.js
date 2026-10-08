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

// 🧩 어려운 노트를 뺀 나머지 노트 내용(성장 모드에선 나온 단어마다 🧩가 적힐 수 있어 따로 본다).
const notes = (brain, dict) => ({ shot: brain.words(dict, 'shot').sort(), trap: brain.words(dict, 'trap').sort(), risky: brain.words(dict, 'risky').sort() });

// ── 가짜 사전: 실제 API 대신 정해진 낱말만 아는 사전(키 없이도 게임 흐름을 검사) ──
const WORDS = ['사과', '과자', '자두', '두부', '부엉이', '이빨', '빨대', '알루미늄', '경력', '역사', '공알'];
function fakeDictionary(words = WORDS) {
  const known = new Map(); // 진짜와 같이 한 번 확인한 끝 글자는 기억한다
  const continuations = (syllable) => { const starts = R.allowedStarts(syllable); return words.filter((w) => starts.includes(R.firstSyllable(w))); };
  const left = (syllable, used) => !used || continuations(syllable).some((w) => !used.has(w));
  return {
    known,
    isConfigured: () => true,
    // used(이번 판에 나온 단어)를 주면 그 단어들은 빼고 이어 갈 단어가 남는지 본다(늡 → 늡늡처럼 자기 자신뿐인 경우).
    knownContinuation: (_dict, syllable, used) => (known.get(syllable) === undefined ? undefined : known.get(syllable) && left(syllable, used)),
    fewContinuations: (_dict, syllable) => { const next = continuations(syllable); return next.length && next.length <= 5 ? next : undefined; },
    async lookup(_dict, word) { return words.includes(word) ? { found: true, word, definition: `${word}의 뜻` } : { found: false, reason: '사전에 없는 단어예요.' }; },
    async hasContinuation(_dict, syllable, used) {
      const has = continuations(syllable).length > 0;
      known.set(syllable, has); return has && left(syllable, used);
    },
    async countContinuation(_dict, syllable) { const starts = R.allowedStarts(syllable); return words.filter((w) => starts.includes(R.firstSyllable(w))).length; },
    requests: 0,
    async candidates(_dict, syllable, used) {
      const starts = R.allowedStarts(syllable);
      return words.filter((w) => starts.includes(R.firstSyllable(w)) && !used.has(w)).map((word) => ({ word, definition: `${word}의 뜻` }));
    },
    async wordsEndingWith(_dict, syllable) { return words.filter((w) => w.at(-1) === syllable).map((word) => ({ word, definition: `${word}의 뜻` })); },
    async pickWord(_dict, syllable, used, { dueum = true, prefer = null } = {}) { // extraPage는 가짜 사전에선 의미 없음
      const starts = dueum ? R.allowedStarts(syllable) : [syllable];
      const all = words.filter((w) => starts.includes(R.firstSyllable(w)) && !used.has(w));
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
  assert.equal(params.get('type1'), 'word,phrase', '속담·관용구(값싼 비지떡)는 묻지 않는다');
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
  const { url } = await startServer(t, {}, [...openers.map((o) => `${o}과`), '과자', '과일', '자두']); // '과일'이 없으면 과자를 쓴 뒤 '과'가 한방이 된다
  const warm = await fetch(`${url}/api/word-chain/solo/warm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"dictionary":"stdict"}' });
  assert.equal(warm.status, 204);
  const start = await post(`${url}/api/word-chain/solo`, { dictionary: 'stdict', first: 'computer' });
  assert.equal(start.ok, true);
  assert.match(start.computer.word, /^.과$/); assert.deepEqual(start.nextStarts, ['과']);
  const reply = await post(`${url}/api/word-chain/solo/${start.id}/word`, { word: '과자' });
  assert.equal(reply.computer.word[0], '자');
  assert.match((await post(`${url}/api/word-chain/solo/${start.id}/word`, { word: '호과' })).message, new RegExp(`'${reply.computer.word.at(-1)}'`)); // 컴퓨터 단어(자과·자두 중 하나)의 끝 글자로 시작하지 않는 단어
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

test('끝말잇기 성장 모드: 레벨 규칙은 0부터 시작해 10개마다 1씩 오르고 확률은 0~1이며 배울수록 약해지지 않는다', () => {
  let before = strengthOf(0);
  assert.deepEqual([0, 9, 10, 20, 29, 30].map((n) => strengthOf(n).level), [0, 0, 1, 2, 2, 3]);
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

  // 성장 모드에서 이기면 마지막 세 단어를 배운다.
  let game = await play('growth');
  assert.equal(game.info.level, 5);
  assert.equal((await game.say('수산화나트륨')).computer.word, '윰차');
  assert.equal((await game.say('차풰')).result, 'win');
  for (let i = 0; i < 50 && brain.count('opendict') < 3; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(notes(brain, 'opendict'), { shot: ['차풰'], trap: ['수산화나트륨'], risky: ['윰차'] });
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
  assert.deepEqual(notes(brain, 'opendict'), { shot: [], trap: [], risky: [] });
  assert.equal(brain.has('opendict', '차풰', 'hard'), true);
});

test('끝말잇기: 여럿이 방 — 한방 확인이 사전 문제로 실패해도 다시 물어서 상대를 탈락시킨다', async (t) => {
  const { url, dictionary } = await startServer(t, { oneShotRetryMs: 10 });
  let calls = 0; const original = dictionary.hasContinuation;
  dictionary.hasContinuation = async (dict, syllable, ...rest) => { // '늄' 확인은 처음 두 번 실패(사전 서버가 불안정한 날)
    if (syllable === '늄' && (calls += 1) <= 2) throw new DictionaryError('표준국어대사전 응답이 늦어요.');
    return original(dict, syllable, ...rest);
  };
  const a = await connect(url); const b = await connect(url);
  t.after(() => { a.close(); b.close(); });
  const { code } = await emitAck(a, 'wc:room:create', { userId: 'r-a', nickname: '가', turnTime: 0 });
  assert.equal((await emitAck(b, 'wc:room:join', { userId: 'r-b', nickname: '나', code })).ok, true);
  assert.equal((await emitAck(b, 'wc:room:ready', true)).ok, true);
  const playing = new Promise((resolve) => a.on('wc:room:state', (room) => { if (room.state === 'playing') resolve(room); }));
  assert.equal((await emitAck(a, 'wc:game:start')).ok, true);
  await playing; a.removeAllListeners('wc:room:state');

  assert.equal((await emitAck(a, 'wc:word', { word: '공알' })).ok, true);
  const boom = new Promise((resolve) => b.once('wc:one-shot', resolve));
  const finished = new Promise((resolve) => b.once('wc:game:finished', resolve));
  assert.equal((await emitAck(b, 'wc:word', { word: '알루미늄' })).ok, true);
  assert.deepEqual(await boom, { word: '알루미늄', userId: 'r-b', victimId: 'r-a' });
  assert.deepEqual((await finished).ranking.map((r) => [r.userId, r.rank]), [['r-b', 1], ['r-a', 2]]);
  assert.equal(calls, 3); // 미리 묻기 실패 → 확인 실패 → 다시 물어 성공
});

test('끝말잇기: 두음 시작 글자들을 한꺼번에 묻고, 일부만 실패하면 한방이라고 단정하지 않는다', async () => {
  const R_STARTS = R.allowedStarts('력'); // 력·역 등
  const asked = [];
  const make = (fail, words) => createDictionary({ env: { STDICT_API_KEY: 'k' }, random: () => 0, fetchImpl: async (url) => {
    const q = new URL(url).searchParams.get('q'); asked.push(q);
    if (q === fail) return { ok: false, status: 500 };
    const item = (words[q] || []).map((word) => ({ word, pos: '명사', sense: { definition: `${word}의 뜻` } }));
    return { ok: true, status: 200, text: async () => JSON.stringify({ channel: { total: item.length, item } }) };
  } });
  // '력'은 사전이 실패해도 '역'에 단어가 있으면 이어 갈 수 있다(나머지를 기다리지 않음).
  assert.equal(await make('력', { 역: ['역사'] }).hasContinuation('stdict', '력'), true);
  // '력'을 못 물었는데 나머지는 비었으면 한방인지 모르는 것이므로 실패로 돌려준다.
  await assert.rejects(make('력', {}).hasContinuation('stdict', '력'));
  // 컴퓨터 단어 고르기도 시작 글자들을 한꺼번에 묻는다.
  asked.length = 0;
  const pick = await make(null, { 역: ['역사'] }).pickWord('stdict', '력', new Set());
  assert.equal(pick.word, '역사');
  assert.deepEqual([...new Set(asked)].sort(), [...R_STARTS].sort());
});

test('끝말잇기 성장 모드: 🔭 상대가 이어 갈 단어가 적은 쪽을 고르고, 🚫 조심 단어의 끝 글자로 끝나는 단어는 피한다', async (t) => {
  const words = ['사과', '과자', '과일', '자두', '자라', '자석', '일기'];
  const brain = createBrain(null);
  const { url } = await startServer(t, { brain, random: () => 0, lookaheadMs: 500, strength: () => ({ level: 1, memoryChance: 1, attackChance: 1 }) }, words);
  const play = async () => {
    const { id } = await post(`${url}/api/word-chain/solo`, { dictionary: 'stdict', mode: 'growth' });
    return post(`${url}/api/word-chain/solo/${id}/word`, { word: '사과' });
  };
  // '과자'를 내면 상대가 '자'로 3개, '과일'을 내면 '일'로 1개 → 과일
  assert.equal((await play()).computer.word, '과일');
  // '일'로 끝나는 단어에서 진 적이 있으면(조심 단어 '추일') '일'로 끝나는 단어는 피한다 → 과자
  brain.remember('stdict', '추일', '', 'risky');
  assert.equal((await play()).computer.word, '과자');
});

test('끝말잇기 성장 모드: 📚 미리 공부하기 — 한방 글자를 찾아 그 글자로 끝나는 단어를 외우고 하루 한도·게임 중 쉬기를 지킨다', async () => {
  const { createStudy, SYLLABLES } = require('../src/word-chain/study');
  assert.equal(SYLLABLES.length, 11_172);
  let clock = Date.parse('2026-10-05T03:00:00Z');
  let failing = false; let requests = 0;
  const known = new Map();
  const dictionary = {
    isConfigured: () => true,
    knownContinuation: (_d, s) => known.get(s),
    get requests() { return requests; },
    async hasContinuation(_d, s) {
      requests += 1;
      if (failing) throw new DictionaryError('사전 응답이 늦어요.');
      known.set(s, s !== '각'); return s !== '각'; // '각'만 한방 글자
    },
    async wordsEndingWith(_d, s) { requests += 1; return s === '각' ? [{ word: '시각', definition: '뜻' }, { word: '감각', definition: '뜻' }] : []; },
    fewContinuations: () => undefined
  };
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wc-study-')), 'study.json');
  const brain = createBrain(null);
  const errors = []; const original = console.error; console.error = (...a) => errors.push(a.join(' '));
  try {
    const study = createStudy({ dictionary, brain, dictionaries: ['stdict'], filePath: file, budget: 4, idleMs: 30_000, backoffMs: 60_000, now: () => clock });
    for (let i = 0; i < 5; i += 1) await study.step();
    // 가(1번) → 각(한방: 묻기 1 + 끝나는 단어 1) → 갂(1번) = 4번에서 오늘은 멈춘다
    assert.deepEqual(study.info('stdict'), { studied: 3, total: 11_172, usedToday: 4, budget: 4 });
    assert.deepEqual(brain.words('stdict', 'shot').sort(), ['감각', '시각']);

    clock += 24 * 60 * 60 * 1000; // 다음 날
    study.gameActive(); await study.step();
    assert.equal(study.info('stdict').studied, 3); // 게임 중이면 쉰다
    clock += 31_000; known.set('갃', true); await study.step();
    assert.equal(study.info('stdict').studied, 5); // 이미 아는 '갃'은 묻지 않고 건너뛰고 '간'을 공부

    failing = true; clock += 1; await study.step();
    assert.equal(study.info('stdict').studied, 5); // 사전이 안 되면 그 글자에 머물고 1분 쉰다
    failing = false; clock += 1; await study.step();
    assert.equal(study.info('stdict').studied, 5);
    clock += 60_000; await study.step();
    assert.equal(study.info('stdict').studied, 6);

    await new Promise((resolve) => setTimeout(resolve, 2_200)); // 파일 저장(2초 모아 쓰기)
    const again = createStudy({ dictionary, brain, dictionaries: ['stdict'], filePath: file, now: () => clock });
    assert.equal(again.info('stdict').studied, 6); // 서버가 다시 켜져도 이어서
  } finally { console.error = original; }
  assert.ok(errors.some((e) => e.includes('잠시 쉼')));
});

test('끝말잇기: 이어 갈 단어가 자기 자신뿐인 단어(늡늡)는 이미 나온 단어를 빼고 판단해 한방으로 본다', async () => {
  const fetchImpl = async (url) => {
    const q = new URL(url).searchParams.get('q');
    const item = q === '늡' ? [{ word: '늡늡', sense: { pos: '', definition: '늡늡한 모양.' } }, { word: '늡늡하다', sense: { pos: '형용사', definition: '너그럽다.' } }] : [];
    return { ok: true, status: 200, text: async () => JSON.stringify({ channel: { total: item.length, item } }) };
  };
  const dict = createDictionary({ env: { STDICT_API_KEY: 'k' }, fetchImpl });
  assert.equal(await dict.hasContinuation('stdict', '늡'), true); // 사전에는 '늡늡'이 있다
  assert.deepEqual(dict.fewContinuations('stdict', '늡'), ['늡늡']); // 늡늡하다는 명사가 아니라 빠진다
  assert.equal(await dict.hasContinuation('stdict', '늡', new Set(['늡늡'])), false); // 늡늡을 이미 썼으면 한방
  assert.equal(dict.knownContinuation('stdict', '늡', new Set(['늡늡'])), false);
  assert.equal(dict.knownContinuation('stdict', '늡', new Set(['사과'])), true);
});

test('끝말잇기: 앞 묶음이 한 글자 낱말로 가득해도 전체 수가 많으면 이어 갈 단어가 "많다"고 센다(우리말샘 장)', async () => {
  // 우리말샘 '장'은 6,229개인데 앞 80개가 장(場)·장(醬)… 한 글자 낱말이라 끝말잇기에 쓸 단어가 거의 안 보인다.
  const fetchImpl = async (url) => {
    const params = new URL(url).searchParams;
    const page = Number(params.get('start'));
    const item = params.get('q') !== '장' ? [] : page === 1
      ? [...Array.from({ length: 39 }, () => ({ word: '장', sense: { pos: '명사', definition: '한 글자 낱말' } })), { word: '장가', sense: { pos: '명사', definition: '장가' } }]
      : Array.from({ length: 40 }, () => ({ word: '장', sense: { pos: '명사', definition: '한 글자 낱말' } }));
    return { ok: true, status: 200, text: async () => JSON.stringify({ channel: { total: item.length ? 6229 : 0, item } }) };
  };
  const dict = createDictionary({ env: { OPENDICT_API_KEY: 'k' }, fetchImpl });
  assert.ok(await dict.countContinuation('opendict', '장', 10) > 10);
});

test('끝말잇기 성장 모드: 🏆 필승 단어 — 갈륨(→윰차는 차풰💥, 윰라대왕은 왕듸 → 이리듐·채매앝💥)을 거슬러 배워 다음 판에 쓴다', async (t) => {
  const brain = createBrain(null);
  for (const word of ['차풰', '채매앝']) brain.remember('opendict', word, `${word}의 뜻`, 'shot'); // 다른 판에서 이미 배운 한방
  const words = ['사갈', '갈륨', '갈가마귀', '귀신', '귀가', '귀환', '윰차', '차풰', '윰라대왕', '왕듸', '듸굴이', '이리듐', '듸림부채', '채매앝'];
  const { url } = await startServer(t, { brain, random: () => 0, strength: () => ({ level: 1, memoryChance: 1, attackChance: 1 }) }, words);
  const start = async () => (await post(`${url}/api/word-chain/solo`, { dictionary: 'opendict', mode: 'growth' })).id;
  const say = (id, word) => post(`${url}/api/word-chain/solo/${id}/word`, { word });

  // 첫 판: 컴퓨터가 우연히(🔭 이어 갈 단어가 적은 쪽) 갈륨을 골라 이리듐으로 이긴다.
  const id = await start();
  assert.equal((await say(id, '사갈')).computer.word, '갈륨');
  assert.equal((await say(id, '윰라대왕')).computer.word, '왕듸');
  assert.equal((await say(id, '듸굴이')).computer.word, '이리듐');
  assert.equal((await (await fetch(`${url}/api/word-chain/solo/${id}/one-shot`)).json()).oneShot, true);
  // 마지막 세 단어(왕듸 → 듸굴이 → 이리듐)만이 아니라, 두 칸 앞의 갈륨도 필승이라 🪤에 적는다.
  assert.deepEqual([brain.has('opendict', '왕듸', 'trap'), brain.has('opendict', '갈륨', 'trap')], [true, true]);

  // 다음 판: 사갈에는 갈가마귀가 아니라 갈륨을 노리고 낸다.
  const reply = await say(await start(), '사갈');
  assert.equal(reply.computer.word, '갈륨'); assert.equal(reply.computer.how, 'trap');
});

test('끝말잇기 성장 모드: 🏆 갈륨·왕듸가 🧩 어려운 노트에만 있어도 필승인 걸 알아보고 갈가외 대신 갈륨을 낸다', async (t) => {
  const brain = createBrain(null);
  for (const word of ['차풰', '채매앝', '이리듐']) brain.remember('opendict', word, `${word}의 뜻`, 'shot');
  for (const word of ['갈륨', '왕듸']) brain.remember('opendict', word, `${word}의 뜻`, 'hard'); // 이어 갈 단어가 2개뿐이라 🧩에 적혀 있던 단어
  const words = ['사갈', '갈가외', '갈륨', '외계인', '윰차', '차풰', '윰라대왕', '왕듸', '듸굴이', '이리듐', '듸림부채', '채매앝'];
  const { url } = await startServer(t, { brain, random: () => 0, strength: () => ({ level: 1, memoryChance: 1, attackChance: 1 }) }, words);
  const { id } = await post(`${url}/api/word-chain/solo`, { dictionary: 'opendict', mode: 'growth' });
  const reply = await post(`${url}/api/word-chain/solo/${id}/word`, { word: '사갈' });
  assert.equal(reply.computer.word, '갈륨'); assert.equal(reply.computer.how, 'trap');
  assert.equal(brain.has('opendict', '갈륨', 'trap'), true); // 다음부터는 🪤 함정 노트에서 바로 꺼낸다
});

test('끝말잇기: 옛한글 — 우리말샘 PUA 코드를 표준 옛한글로 바꾸고, 단추로 넣은 낱자를 한 글자로 조립한다(놉ᄂᆞ가ᄫᅵ)', async (t) => {
  const O = require('../src/word-chain/old-hangul');
  const word = '놉ᄂᆞ가ᄫᅵ'; // 놉ᄂᆞ가ᄫᅵ(표준 옛한글)
  const pua = '놉가'; // 우리말샘이 보내는 모양
  assert.equal(R.typedWord('놉ㄴㆍ가ㅸㅣ'), word); // 놉 → ㄴ → [ㆍ] → 가 → [ㅸ] → ㅣ
  assert.equal(R.typedWord('ㄱㅏ나'), '가나'); // 현대 글자로 조립되면 보통 글자
  assert.equal(R.typedWord('양ㅅ깃'), '양ㅅ깃'); // 모음이 안 따라오는 낱자는 그대로
  assert.deepEqual([O.fromPua(pua), O.toPua(word)], [word, pua]);
  assert.equal(R.syllables(word).length, 4);
  assert.equal(R.lastSyllable(word), 'ᄫᅵ'); // 끝 글자 ᄫᅵ
  assert.equal(R.precheck(word, null, new Set()), null);
  assert.equal(R.precheck(word, '사놉', new Set()), null);
  assert.deepEqual(R.allowedStarts('ᄫᅵ'), ['ᄫᅵ']); // 옛한글은 두음법칙 없음

  // 사전: 물을 땐 PUA로, 받은 낱말·뜻은 표준 옛한글로.
  const asked = [];
  const fetchImpl = async (url) => {
    const params = new URL(url).searchParams; asked.push(params.get('q'));
    const item = params.get('q') === pua ? [{ word: '놉-가', sense: { pos: '명사', definition: '‘높낮이’의 옛말.' } }] : [];
    return { ok: true, status: 200, text: async () => JSON.stringify({ channel: { total: item.length, item } }) };
  };
  const dict = createDictionary({ env: { OPENDICT_API_KEY: 'k' }, fetchImpl });
  assert.deepEqual(await dict.lookup('opendict', word), { found: true, word, definition: '‘높낮이’의 옛말.' });
  assert.equal(await dict.hasContinuation('opendict', 'ᄫᅵ'), false); // ᄫᅵ로 시작하는 낱말 없음 → 한방
  assert.ok(asked.includes(''));

  // 게임: 옛한글 끝 글자로도 끝말을 잇는다(가ᄫᅵ → ᄫᅵ다).
  const { url } = await startServer(t, {}, ['가ᄫᅵ', 'ᄫᅵ다']);
  const { id } = await post(`${url}/api/word-chain/solo`, { dictionary: 'opendict' });
  const reply = await post(`${url}/api/word-chain/solo/${id}/word`, { word: 'ㄱㅏㅸㅣ' });
  assert.equal(reply.player.word, '가ᄫᅵ');
  assert.equal(reply.computer.word, 'ᄫᅵ다');
  assert.deepEqual(reply.nextStarts, ['다']);
});

test('끝말잇기: 앞 묶음이 한 글자 낱말(정 71개)로 가득해도 컴퓨터는 다음 묶음에서 이어 갈 단어를 찾는다(열정 → 정열)', async () => {
  const one = (n) => Array.from({ length: n }, () => ({ word: '정', sense: { pos: '명사', definition: '한 글자 낱말' } }));
  const fetchImpl = async (url) => {
    const params = new URL(url).searchParams;
    const page = Number(params.get('start'));
    const item = params.get('q') !== '정' ? [] : page === 1 ? one(40) : page === 2 ? [...one(31), { word: '정열', sense: { pos: '명사', definition: '뜨거운 마음' } }] : [];
    return { ok: true, status: 200, text: async () => JSON.stringify({ channel: { total: item.length ? 72 : 0, item } }) };
  };
  const dict = createDictionary({ env: { OPENDICT_API_KEY: 'k' }, fetchImpl, random: () => 0 });
  assert.deepEqual((await dict.candidates('opendict', '정', new Set(['열정']))).map((c) => c.word), ['정열']);
  assert.equal((await dict.pickWord('opendict', '정', new Set(['열정']))).word, '정열');
});

test('끝말잇기 성장 모드: 상대의 🏆 필승 단어로 이어지는 단어(나가나병 → 병아리매듭)는 내지 않는다', async (t) => {
  const brain = createBrain(null);
  for (const word of ['기픠', '새뱍']) brain.remember('opendict', word, `${word}의 뜻`, 'shot'); // 듭기 → 기픠💥, 듭새 → 새뱍💥
  brain.remember('opendict', '병아리매듭', '병아리매듭의 뜻', 'trap');
  const words = ['사나', '나가나병', '나무', '무지', '무게', '병아리매듭', '듭기', '듭새', '기픠', '새뱍'];
  const { url } = await startServer(t, { brain, random: () => 0, strength: () => ({ level: 1, memoryChance: 1, attackChance: 1 }) }, words);
  const { id } = await post(`${url}/api/word-chain/solo`, { dictionary: 'opendict', mode: 'growth' });
  // 🔭로만 보면 나가나병('병' 뒤 1개)이 나무('무' 뒤 2개)보다 좋아 보이지만, 병아리매듭에 지므로 피한다.
  assert.equal((await post(`${url}/api/word-chain/solo/${id}/word`, { word: '사나' })).computer.word, '나무');
});

test('끝말잇기: 성장 컴퓨터는 🧩 어려운 단어를 내기 전에 다시 세어, 이어 갈 단어가 많으면 내지 않고 노트에서 지운다', async (t) => {
  const brain = createBrain(null);
  brain.remember('opendict', '름장', '름장의 뜻', 'hard'); // 예전 세기 실수로 잘못 적힌 단어
  const words = ['사름', '름장', ...[...'가나다라마바사아자차카'].map((c) => `장${c}`)]; // '장' 뒤 11개
  const { url } = await startServer(t, { brain, random: () => 0, strength: () => ({ level: 1, memoryChance: 1, attackChance: 1 }) }, words);
  const { id } = await post(`${url}/api/word-chain/solo`, { dictionary: 'opendict', mode: 'growth' });
  const reply = await post(`${url}/api/word-chain/solo/${id}/word`, { word: '사름' });
  assert.notEqual(reply.computer.how, 'hard'); // 🧩 힌트("대답하기 어려운 단어")가 다시 뜨지 않는다
  assert.equal(brain.has('opendict', '름장', 'hard'), false);
});

test('끝말잇기: 사전이 전체 수를 안 알려 줘도 묶음이 40개로 꽉 차면 이어 갈 단어가 "많다"고 센다', async () => {
  const fetchImpl = async (url) => {
    const item = new URL(url).searchParams.get('q') === '장' ? Array.from({ length: 40 }, () => ({ word: '장', sense: { pos: '명사', definition: '한 글자 낱말' } })) : [];
    return { ok: true, status: 200, text: async () => JSON.stringify({ channel: { total: item.length, item } }) };
  };
  const dict = createDictionary({ env: { OPENDICT_API_KEY: 'k' }, fetchImpl });
  assert.ok(await dict.countContinuation('opendict', '장', 10) > 10);
});

test('끝말잇기: 우리말샘 낱자 낱말(양ㅅ-깃·ㄱ자-관)을 허용한다 — 끝 글자는 완성된 글자, 낱자로 시작하면 첫 단어로만', async (t) => {
  assert.equal(R.precheck('양ㅅ깃', null, new Set()), null);
  assert.equal(R.typedWord('양ㅅ-깃'), '양ㅅ깃');
  for (const word of ['양ㅅ', 'ㅅㅅ']) assert.match(R.precheck(word, null, new Set()), /끝 글자는 완성된 글자/);
  // 낱자로 시작하는 단어(ㄱ자-관, ㄱㄴㄷ-순)는 첫 단어로만 낼 수 있다.
  for (const word of ['ㄱ자관', 'ㄱㄴㄷ순']) assert.equal(R.precheck(word, null, new Set()), null);
  assert.match(R.precheck('ㄱ자관', '얘기', new Set()), /첫 단어/);
  assert.equal(R.lastSyllable('양ㅅ깃'), '깃');
  const fetchImpl = async (url) => {
    const q = new URL(url).searchParams.get('q');
    const item = q === '양ㅅ깃' ? [{ word: '양ㅅ-깃', sense: { pos: '명사', definition: '옛말' } }] : [];
    return { ok: true, status: 200, text: async () => JSON.stringify({ channel: { total: item.length, item } }) };
  };
  assert.equal((await createDictionary({ env: { OPENDICT_API_KEY: 'k' }, fetchImpl }).lookup('opendict', '양ㅅ깃')).found, true);
  const { url } = await startServer(t, {}, ['사양', '양ㅅ깃', '깃발']);
  const { id } = await post(`${url}/api/word-chain/solo`, { dictionary: 'opendict' });
  assert.equal((await post(`${url}/api/word-chain/solo/${id}/word`, { word: '양ㅅ깃' })).computer.word, '깃발');
  const second = await startServer(t, {}, ['ㄱ자관', '관리']);
  const game = await post(`${second.url}/api/word-chain/solo`, { dictionary: 'opendict' });
  assert.equal((await post(`${second.url}/api/word-chain/solo/${game.id}/word`, { word: 'ㄱ자-관' })).computer.word, '관리');
});

test('끝말잇기: 늡늡 — 혼자 모드는 컴퓨터가 쓰면 바로 지고, 여럿이 방은 첫 단어로 못 쓰고 쓰면 다음 사람이 탈락한다', async (t) => {
  const { url } = await startServer(t, {}, ['사늡', '늡늡', '공사']);
  const { id } = await post(`${url}/api/word-chain/solo`, { dictionary: 'stdict' });
  const reply = await post(`${url}/api/word-chain/solo/${id}/word`, { word: '사늡' });
  assert.equal(reply.computer.word, '늡늡');
  assert.equal(reply.finished, true); assert.equal(reply.result, 'lose'); assert.equal(reply.oneShot, true);

  const a = await connect(url); const b = await connect(url);
  t.after(() => { a.close(); b.close(); });
  const { code } = await emitAck(a, 'wc:room:create', { userId: 'n-a', nickname: '가', turnTime: 0 });
  assert.equal((await emitAck(b, 'wc:room:join', { userId: 'n-b', nickname: '나', code })).ok, true);
  assert.equal((await emitAck(b, 'wc:room:ready', true)).ok, true);
  const playing = new Promise((resolve) => a.on('wc:room:state', (room) => { if (room.state === 'playing') resolve(room); }));
  assert.equal((await emitAck(a, 'wc:game:start')).ok, true);
  await playing; a.removeAllListeners('wc:room:state');
  assert.match((await emitAck(a, 'wc:word', { word: '늡늡' })).message, /한방단어/); // 첫 단어로는 못 쓴다
  assert.equal((await emitAck(a, 'wc:word', { word: '공사' })).ok, true);
  assert.equal((await emitAck(b, 'wc:word', { word: '사늡' })).ok, true);
  const boom = new Promise((resolve) => b.once('wc:one-shot', resolve));
  assert.equal((await emitAck(a, 'wc:word', { word: '늡늡' })).ok, true);
  assert.deepEqual(await boom, { word: '늡늡', userId: 'n-a', victimId: 'n-b' });
});

test('끝말잇기 성장 모드: 📚 미리 공부하기는 이어 갈 단어가 자기 자신뿐인 글자를 찾으면 그 단어를 한방으로 외운다', async () => {
  const { createStudy, SYLLABLES } = require('../src/word-chain/study');
  const known = new Map(SYLLABLES.slice(0, SYLLABLES.indexOf('늡')).map((s) => [s, true])); // '늡' 앞 글자는 이미 안다
  const dictionary = {
    isConfigured: () => true, requests: 0,
    knownContinuation: (_d, s) => known.get(s),
    async hasContinuation(_d, s) { known.set(s, true); return true; },
    fewContinuations: (_d, s) => (s === '늡' ? ['늡늡'] : undefined),
    async wordsEndingWith() { return []; }
  };
  const brain = createBrain(null);
  const study = createStudy({ dictionary, brain, dictionaries: ['stdict'], idleMs: 0 });
  for (let i = 0; i < 5 && !brain.has('stdict', '늡늡', 'shot'); i += 1) await study.step();
  assert.deepEqual(brain.words('stdict', 'shot'), ['늡늡']);
});

test('끝말잇기: 예전(버전 1) 한방 단어장의 "있음" 기록은 단어 목록이 없어 버리고 다시 묻는다', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wc-store-v1-')), 'one-shot.json');
  const now = Date.now();
  fs.writeFileSync(file, JSON.stringify({ version: 1, entries: { 'stdict|늡': { has: true, at: now }, 'stdict|늄': { has: false, at: now } } }));
  const store = createOneShotStore(file);
  assert.equal(store.get('stdict', '늡'), undefined); // 다시 물어서 목록까지 받는다
  assert.equal(store.get('stdict', '늄'), false);     // 한방 글자 기록은 그대로
});

test('끝말잇기 성장 모드: 컴퓨터가 한방단어로 이긴 판도 배운다(컴퓨터 A → 나 B → 컴퓨터 C💥: C 한방, B 조심, A 함정)', async (t) => {
  const words = ['가자', '자공', '공알', '알루미늄'];
  const brain = createBrain(null);
  const { url } = await startServer(t, { brain, random: () => 0, lookaheadMs: 200 }, words);
  const wait = async (check) => { for (let i = 0; i < 100 && !check(); i += 1) await new Promise((resolve) => setTimeout(resolve, 5)); };

  // 기본 모드에서 져도 성장 컴퓨터가 배운다(공알 → 알루미늄💥: 알루미늄 한방, 공알 조심).
  let { id } = await post(`${url}/api/word-chain/solo`, { dictionary: 'stdict' });
  await post(`${url}/api/word-chain/solo/${id}/word`, { word: '공알' });
  await (await fetch(`${url}/api/word-chain/solo/${id}/one-shot`)).json();
  await wait(() => brain.has('stdict', '알루미늄', 'shot'));
  assert.deepEqual(notes(brain, 'stdict'), { shot: ['알루미늄'], trap: [], risky: ['공알'] });

  // 성장 모드: 나 '가자' → 컴퓨터 '자공' → 나 '공알' → 컴퓨터 '알루미늄' 💥 ('늄'은 이미 한방 글자로 알고 있음)
  ({ id } = await post(`${url}/api/word-chain/solo`, { dictionary: 'stdict', mode: 'growth' }));
  assert.equal((await post(`${url}/api/word-chain/solo/${id}/word`, { word: '가자' })).computer.word, '자공');
  const reply = await post(`${url}/api/word-chain/solo/${id}/word`, { word: '공알' });
  assert.equal(reply.computer.word, '알루미늄'); assert.equal(reply.result, 'lose');
  await wait(() => brain.has('stdict', '자공', 'trap'));
  assert.deepEqual(brain.words('stdict', 'shot'), ['알루미늄']);
  assert.deepEqual(brain.words('stdict', 'risky'), ['공알']); // 내가 말한 단어 = 컴퓨터가 조심할 단어
  assert.deepEqual(brain.words('stdict', 'trap'), ['자공']);
});

test('끝말잇기 성장 모드: 🪤 함정은 이어 갈 단어가 3개 이하일 때만 — 요요(→요리·요가·요금·요새)는 함정이 아니다', async (t) => {
  const words = ['요요', '요리', '리튬', '요가', '요금', '요새', '가방', '가지', '금붕어', '금요일', '새우', '새벽', '공요'];
  const brain = createBrain(null);
  const { url } = await startServer(t, { brain, random: () => 0, lookaheadMs: 200 }, words);
  const wait = async (check) => { for (let i = 0; i < 100 && !check(); i += 1) await new Promise((resolve) => setTimeout(resolve, 5)); };

  // 나 '요요' → 컴퓨터 '요리' → 나 '리튬' 💥 : 리튬은 한방, 요리는 조심. 요요 뒤에는 이어 갈 단어가 5개라 함정 아님.
  let { id } = await post(`${url}/api/word-chain/solo`, { dictionary: 'stdict', mode: 'growth' });
  assert.equal((await post(`${url}/api/word-chain/solo/${id}/word`, { word: '요요' })).computer.word, '요리');
  assert.equal((await post(`${url}/api/word-chain/solo/${id}/word`, { word: '리튬' })).result, 'win');
  await wait(() => brain.has('stdict', '리튬', 'shot'));
  await new Promise((resolve) => setTimeout(resolve, 20)); // 함정 확인(뒤에서)이 끝날 시간
  assert.deepEqual(notes(brain, 'stdict'), { shot: ['리튬'], trap: [], risky: ['요리'] });

  // 예전에 조건 없이 적힌 함정(요요)은 쓰려고 할 때 확인해서 지운다.
  brain.remember('stdict', '요요', '', 'trap');
  ({ id } = await post(`${url}/api/word-chain/solo`, { dictionary: 'stdict', mode: 'growth' }));
  const reply = await post(`${url}/api/word-chain/solo/${id}/word`, { word: '공요' });
  assert.notEqual(reply.computer.how, 'trap');
  assert.equal(brain.has('stdict', '요요', 'trap'), false);
});

test('끝말잇기 성장 모드: 나온 단어 중 이어 갈 단어가 1~10개인 단어는 🧩 어려운 노트에 적는다(기본 모드도)', async (t) => {
  const manyJa = [...'가나다라마바사아차카타'].map((c) => `자${c}`); // '자'로 시작하는 단어 11개(그 뒤 '가' 등은 이어 갈 단어 없음)
  const words = ['사과', '과자', ...manyJa];
  const brain = createBrain(null);
  const { url } = await startServer(t, { brain, random: () => 0, lookaheadMs: 200 }, words);
  const play = async (mode) => {
    const { id } = await post(`${url}/api/word-chain/solo`, { dictionary: 'stdict', mode });
    assert.equal((await post(`${url}/api/word-chain/solo/${id}/word`, { word: '사과' })).computer.word, '과자');
    assert.equal((await post(`${url}/api/word-chain/solo/${id}/word`, { word: '자가' })).result, 'win');
    await new Promise((resolve) => setTimeout(resolve, 30)); // 뒤에서 세는 시간
  };
  await play('basic');
  assert.deepEqual(brain.words('stdict', 'hard'), ['사과']); // '과' 뒤 1개(과자) → 🧩
  // 과자('자' 뒤 11개)는 너무 많아서, 자가('가' 뒤 0개)는 한방이라서 🧩가 아니다
  assert.deepEqual(brain.words('stdict', 'shot'), ['자가']);
});

test('끝말잇기 성장 모드: 📒 한방단어(가돌리늄)를 알면 그 글자로 끝나는 단어(…가)는 내지 않는다 — 중간에도, 첫 단어로도', async (t) => {
  const knowsGadolinium = () => { const brain = createBrain(null); brain.remember('stdict', '가돌리늄', '', 'shot'); return brain; }; // 시험마다 새 노트
  const brain = knowsGadolinium();
  // 중간: '과가'(가 뒤 1개)가 '과자'(자 뒤 2개)보다 내다보기로는 좋아 보여도, 가돌리늄에 당하니 과자를 낸다.
  const { url } = await startServer(t, { brain, random: () => 0, lookaheadMs: 200 }, ['사과', '과가', '과자', '자두', '자라', '가돌리늄']);
  const { id } = await post(`${url}/api/word-chain/solo`, { dictionary: 'stdict', mode: 'growth' });
  assert.equal((await post(`${url}/api/word-chain/solo/${id}/word`, { word: '사과' })).computer.word, '과자');

  // 낼 수 있는 게 위험한 단어뿐이면 어쩔 수 없이 낸다.
  const only = await startServer(t, { brain: knowsGadolinium(), random: () => 0, lookaheadMs: 200 }, ['사과', '과가', '가돌리늄']);
  const game = await post(`${only.url}/api/word-chain/solo`, { dictionary: 'stdict', mode: 'growth' });
  assert.equal((await post(`${only.url}/api/word-chain/solo/${game.id}/word`, { word: '사과' })).computer.word, '과가');

  // 첫 단어: 흔한 시작 글자 20개마다 '…가'(위험) 단어가 있고 안전한 건 '다자'뿐이면 성장 컴퓨터는 매번 다자로 시작한다.
  const openers = ['가', '고', '기', '나', '노', '다', '도', '마', '무', '바', '부', '사', '수', '시', '오', '우', '자', '주', '하', '호'];
  const first = await startServer(t, { brain: knowsGadolinium(), lookaheadMs: 200 }, [...openers.map((o) => `${o}가`), '다자', '자두', '가돌리늄']);
  for (let i = 0; i < 4; i += 1) {
    const start = await post(`${first.url}/api/word-chain/solo`, { dictionary: 'stdict', first: 'computer', mode: 'growth' });
    assert.equal(start.computer.word, '다자');
  }
});

test('끝말잇기: 사전이 대답을 안 하면 1.5초 뒤 같은 질문을 하나 더 보내 먼저 온 답을 쓴다', async () => {
  const answer = { ok: true, status: 200, text: async () => JSON.stringify({ channel: { total: 1, item: [{ word: '사과', pos: '명사', sense: { definition: '열매.' } }] } }) };
  // plan: 질문마다 'answer'(바로 답) / 'hang'(신호로 취소될 때까지 무응답) / 'reset'(바로 연결 끊김)
  const makeDict = (plan, extra = {}) => {
    const calls = { sent: 0, aborted: 0 };
    const fetchImpl = (_url, { signal }) => {
      const kind = plan[calls.sent++] ?? 'answer';
      if (kind === 'answer') return Promise.resolve(answer);
      if (kind === 'reset') return Promise.reject(new TypeError('fetch failed'));
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => { calls.aborted += 1; reject(signal.reason); }));
    };
    return { calls, dict: createDictionary({ env: { STDICT_API_KEY: 'k' }, fetchImpl, hedgeMs: 30, requestTimeoutMs: 300, ...extra }) };
  };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // 바로 답하면 질문은 하나뿐(1.5초가 지나도 더 보내지 않는다).
  let { calls, dict } = makeDict(['answer']);
  assert.equal((await dict.lookup('stdict', '사과')).found, true);
  await wait(60); assert.equal(calls.sent, 1);

  // 첫 질문이 무응답이면 1.5초(여기선 30ms) 뒤 하나 더 보내고, 답이 오면 남은 질문은 취소한다.
  ({ calls, dict } = makeDict(['hang', 'answer']));
  const started = Date.now();
  assert.equal((await dict.lookup('stdict', '사과')).found, true);
  assert.ok(Date.now() - started < 250, '8초(여기선 300ms)를 기다리지 않는다');
  assert.equal(calls.sent, 2); assert.equal(calls.aborted, 1);
  assert.equal(dict.requests, 2); // 하루 한도 계산에는 실제로 보낸 질문 수가 들어간다

  // 첫 질문이 바로 끊기면 1.5초를 기다리지 않고 곧바로 다시 묻는다.
  ({ calls, dict } = makeDict(['reset', 'answer'], { hedgeMs: 10_000 }));
  assert.equal((await dict.lookup('stdict', '사과')).found, true);
  assert.equal(calls.sent, 2);

  // 둘 다 안 되면 알려 준다(끊김 → 연결 못 함, 무응답 → 늦어요).
  ({ dict } = makeDict(['reset', 'reset']));
  await assert.rejects(dict.lookup('stdict', '사과'), /연결하지 못했어요/);
  ({ dict } = makeDict(['hang', 'hang']));
  await assert.rejects(dict.lookup('stdict', '사과'), /응답이 늦어요/);
});

test('끝말잇기: 컴퓨터 후보 묶음 — 전체 수를 알면 첫 묶음과 무작위 묶음을 동시에 묻고, 미리 묻기와 같은 묶음을 쓴다', async () => {
  const asked = []; const LETTERS = '가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허';
  const fetchImpl = async (url) => {
    const params = new URL(url).searchParams; const page = Number(params.get('start'));
    asked.push(page);
    const item = [{ word: `과자${LETTERS[page - 1]}`, pos: '명사', sense: { definition: '뜻' } }]; // 묶음마다 다른 단어(과자가, 과자나…)
    return { ok: true, status: 200, text: async () => JSON.stringify({ channel: { total: 450, item } }) };
  };
  const dict = createDictionary({ env: { STDICT_API_KEY: 'k' }, fetchImpl, random: () => 0.5 });
  // 처음 보는 글자: 전체 수를 모르니 첫 묶음만
  assert.deepEqual((await dict.candidates('stdict', '과', new Set(), { dueum: false })).map((c) => c.word), ['과자가']);
  assert.deepEqual(asked, [1]);
  // 미리 묻기: 전체 수(450)를 아니까 무작위 묶음을 바로 묻는다(첫 묶음은 이미 기억)
  dict.warmCandidates('stdict', '과');
  await new Promise((resolve) => setImmediate(resolve));
  const extra = asked.at(-1);
  assert.ok(extra >= 2 && extra <= 25, `무작위 묶음 ${extra}`);
  // 실제 고르기는 미리 물어 둔 같은 묶음을 다시 쓴다(새로 묻지 않음)
  const words = (await dict.candidates('stdict', '과', new Set(), { dueum: false })).map((c) => c.word);
  assert.deepEqual(words, ['과자가', `과자${LETTERS[extra - 1]}`]);
  assert.equal(asked.length, 2);
});

test('끝말잇기: 여럿이 방과 첫 단어 막힘도 성장 컴퓨터가 배운다', async (t) => {
  const brain = createBrain(null);
  const { url } = await startServer(t, { brain }, ['공사', '사과', '과늄', '알루미늄']);
  const wait = async (check) => { for (let i = 0; i < 100 && !check(); i += 1) await new Promise((resolve) => setTimeout(resolve, 5)); };

  // 혼자 모드(기본): 첫 단어로 한방단어를 내서 막혀도 그 단어를 📒로 배운다.
  const { id } = await post(`${url}/api/word-chain/solo`, { dictionary: 'stdict' });
  const blocked = await post(`${url}/api/word-chain/solo/${id}/word`, { word: '알루미늄' });
  assert.match(blocked.message, /한방단어/); assert.equal(blocked.oneShotWord, undefined); // 화면엔 학습 정보를 보내지 않는다
  await wait(() => brain.has('stdict', '알루미늄', 'shot'));
  assert.equal(brain.has('stdict', '알루미늄', 'shot'), true);

  // 여럿이 방: 공사 → 사과 → 과늄💥 로 탈락하면 이 줄기의 세 단어를 배운다('사' 뒤엔 사과 하나뿐이라 공사는 함정).
  const a = await connect(url); const b = await connect(url);
  t.after(() => { a.close(); b.close(); });
  const { code } = await emitAck(a, 'wc:room:create', { userId: 'L-a', nickname: '가', turnTime: 0 });
  assert.equal((await emitAck(b, 'wc:room:join', { userId: 'L-b', nickname: '나', code })).ok, true);
  assert.equal((await emitAck(b, 'wc:room:ready', true)).ok, true);
  const playing = new Promise((resolve) => a.on('wc:room:state', (room) => { if (room.state === 'playing') resolve(room); }));
  assert.equal((await emitAck(a, 'wc:game:start')).ok, true);
  await playing; a.removeAllListeners('wc:room:state');
  assert.equal((await emitAck(a, 'wc:word', { word: '공사' })).ok, true);
  assert.equal((await emitAck(b, 'wc:word', { word: '사과' })).ok, true);
  const boom = new Promise((resolve) => b.once('wc:one-shot', resolve));
  assert.equal((await emitAck(a, 'wc:word', { word: '과늄' })).ok, true);
  await boom;
  await wait(() => brain.has('stdict', '공사', 'trap'));
  assert.deepEqual(notes(brain, 'stdict'), { shot: ['과늄', '알루미늄'], trap: ['공사'], risky: ['사과'] });
  assert.equal(brain.has('stdict', '사과', 'hard'), true); // '과' 뒤 1개 → 🧩
});

test('끝말잇기: 특수문자·띄어쓰기는 자동으로 지우고 낸다', async (t) => {
  assert.equal(R.typedWord(' 사과! '), '사과');
  assert.equal(R.typedWord('사-과?~'), '사과');
  assert.equal(R.typedWord('🍎사과…'), '사과');
  assert.equal(R.typedWord('수산화^나트륨'), '수산화나트륨'); // 표준국어대사전에서 복사하면 붙는 ^(띄어 쓸 수 있는 자리)·-(붙임표)
  assert.equal(R.typedWord('늑막-염'), '늑막염');
  assert.equal(R.typedWord('사과a1'), '사과a1'); // 영어·숫자는 남겨서 "한글만" 안내를 받는다
  const { url } = await startServer(t);
  const { id } = await post(`${url}/api/word-chain/solo`, { dictionary: 'stdict' });
  assert.match((await post(`${url}/api/word-chain/solo/${id}/word`, { word: '!!!' })).message, /입력/);
  assert.match((await post(`${url}/api/word-chain/solo/${id}/word`, { word: 'apple' })).message, /한글/);
  const reply = await post(`${url}/api/word-chain/solo/${id}/word`, { word: '사과!!' });
  assert.equal(reply.player.word, '사과'); assert.equal(reply.computer.word, '과자');
});
