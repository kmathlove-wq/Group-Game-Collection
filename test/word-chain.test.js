const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { io: createClient } = require('socket.io-client');
const R = require('../src/word-chain/rules');
const { createDictionary, DictionaryError } = require('../src/word-chain/dictionary');
const { setupWordChainGame, rankPlayers } = require('../src/word-chain');

// ── 가짜 사전: 실제 API 대신 정해진 낱말만 아는 사전(키 없이도 게임 흐름을 검사) ──
const WORDS = ['사과', '과자', '자두', '두부', '부엉이', '이빨', '빨대', '알루미늄', '경력', '역사'];
function fakeDictionary(words = WORDS) {
  return {
    isConfigured: () => true,
    async lookup(_dict, word) { return words.includes(word) ? { found: true, word, definition: `${word}의 뜻` } : { found: false, reason: '사전에 없는 단어예요.' }; },
    async hasContinuation(_dict, syllable) { const starts = R.allowedStarts(syllable); return words.some((w) => starts.includes(w[0])); },
    async pickWord(_dict, syllable, used) {
      const starts = R.allowedStarts(syllable);
      const word = words.find((w) => starts.includes(w[0]) && !used.has(w));
      return word ? { word, definition: `${word}의 뜻` } : null;
    }
  };
}

async function startServer(t, options = {}) {
  const app = express(); const server = http.createServer(app); const io = new Server(server);
  const game = setupWordChainGame({ app, io, rootDir: `${__dirname}/..`, dictionary: fakeDictionary(), ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { game.close(); await new Promise((resolve) => io.close(resolve)); });
  return { url, game };
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
