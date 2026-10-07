const test = require('node:test');
const assert = require('node:assert/strict');
const { createGistSync } = require('../lib/gist-sync');
const { createBrain } = require('../src/word-chain/brain');
const { createOneShotStore } = require('../src/word-chain/one-shot-store');

// 가짜 GitHub: Gist 파일들을 메모리에 두고, 받은 요청을 기록한다(토큰 없이 검사).
function fakeGitHub(files = {}) {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, method: options.method || 'GET', headers: options.headers, body: options.body });
    if (url.startsWith('https://raw/')) return { ok: true, status: 200, text: async () => files[url.slice('https://raw/'.length)] };
    if (options.method === 'PATCH') {
      for (const [name, file] of Object.entries(JSON.parse(options.body).files)) files[name] = file.content;
      return { ok: true, status: 200, json: async () => ({}) };
    }
    const big = (text) => text.length > 30; // 진짜는 1MB가 넘으면 잘려 온다
    return { ok: true, status: 200, json: async () => ({ files: Object.fromEntries(Object.entries(files).map(([name, text]) => [name,
      big(text) ? { truncated: true, content: text.slice(0, 5), raw_url: `https://raw/${name}` } : { truncated: false, content: text }])) }) };
  };
  return { files, requests, fetchImpl };
}

test('Gist 보관: 설정이 없으면 쓰지 않는다', () => {
  assert.equal(createGistSync({ token: '', gistId: 'abc' }), null);
  assert.equal(createGistSync({ token: 't', gistId: '' }), null);
});

test('Gist 보관: 여러 파일을 한 번에 받아 오고, 잘린 큰 파일은 raw 주소에서 받는다', async () => {
  const github = fakeGitHub({ 'small.json': '{"a":1}', 'big.json': JSON.stringify({ text: 'x'.repeat(40) }) });
  const sync = createGistSync({ token: 'secret', gistId: 'g1', fetchImpl: github.fetchImpl });
  const got = {};
  const attach = (name) => sync.attach(name, { absorb: (saved) => { got[name] = saved; }, snapshot: () => '' });
  await Promise.all([attach('small.json'), attach('big.json'), attach('none.json')]);
  assert.deepEqual(got['small.json'], { a: 1 });
  assert.equal(got['big.json'].text.length, 40);
  assert.equal(got['none.json'], undefined); // Gist에 아직 없는 파일은 빈 노트로 시작
  assert.equal(github.requests.filter((r) => r.url === 'https://api.github.com/gists/g1').length, 1);
  assert.equal(github.requests[0].headers.Authorization, 'Bearer secret');
});

test('Gist 보관: 여러 번 바뀌어도 모아서 한 번에 최신 내용을 올린다', async () => {
  const github = fakeGitHub();
  const sync = createGistSync({ token: 't', gistId: 'g1', fetchImpl: github.fetchImpl, saveDelayMs: 60_000 });
  let value = 1;
  await Promise.all([sync.attach('a.json', { absorb() {}, snapshot: () => String(value) }), sync.attach('b.json', { absorb() {}, snapshot: () => 'b' })]);
  sync.save('a.json'); value = 2; sync.save('a.json'); sync.save('b.json');
  await sync.flush();
  assert.equal(github.requests.filter((r) => r.method === 'PATCH').length, 1);
  assert.deepEqual(github.files, { 'a.json': '2', 'b.json': 'b' });
  await sync.flush(); // 바뀐 게 없으면 올리지 않는다
  assert.equal(github.requests.filter((r) => r.method === 'PATCH').length, 1);
});

test('Gist 보관: 서버가 다시 켜져도 컴퓨터 기억 노트와 한방 단어장이 남는다', async () => {
  const github = fakeGitHub();
  const sync = () => createGistSync({ token: 't', gistId: 'g1', fetchImpl: github.fetchImpl, saveDelayMs: 60_000 });

  // 첫 번째 서버: 배우고 저장한 뒤 꺼진다(디스크 파일 없이 Gist만 사용).
  let remote = sync();
  let brain = createBrain(null, { remote }); let store = createOneShotStore(null, { remote });
  await Promise.all([brain.ready, store.ready]);
  brain.remember('opendict', '차풰', '뜻'); brain.remember('opendict', '윰차', '', 'risky');
  store.set('opendict', '풰', false);
  await Promise.all([brain.flush(), store.flush()]);
  assert.equal(github.requests.filter((r) => r.method === 'PATCH').length, 1); // 두 파일을 한 번에

  // 두 번째 서버: Gist에서 다시 불러온다. 불러오는 사이에 배운 것도 지워지지 않는다.
  remote = sync();
  brain = createBrain(null, { remote }); store = createOneShotStore(null, { remote });
  brain.remember('opendict', '새단어', '', 'trap');
  await Promise.all([brain.ready, store.ready]);
  assert.deepEqual(brain.counts('opendict'), { shot: 1, trap: 1, risky: 1, hard: 0 });
  assert.equal(store.get('opendict', '풰'), false);
});

test('Gist 보관: 시작할 때 GitHub가 안 돼도 서버는 돌고, 나중에 원래 기억과 합쳐서 올린다(덮어쓰기 금지)', async () => {
  const github = fakeGitHub({ 'word-chain-brain.json': JSON.stringify({ version: 1, entries: { 'shot|stdict|옛단어': { definition: '', at: Date.now() } } }) });
  let down = true;
  const fetchImpl = async (url, options) => (down ? { ok: false, status: 503 } : github.fetchImpl(url, options));
  const remote = createGistSync({ token: 't', gistId: 'g1', fetchImpl, saveDelayMs: 60_000, retryDelayMs: 60_000 });
  const errors = []; const original = console.error; console.error = (...args) => errors.push(args.join(' '));
  try {
    const brain = createBrain(null, { remote });
    await brain.ready;
    assert.equal(brain.count('stdict'), 0); // 못 불러왔지만 서버는 계속 돈다
    brain.remember('stdict', '늑막염');
    await brain.flush(); // GitHub가 아직 안 되면 올리지 않는다
    assert.equal(github.requests.filter((r) => r.method === 'PATCH').length, 0);

    down = false;
    await brain.flush(); // 다시 불러와 합친 뒤에 올린다
    assert.equal(brain.count('stdict'), 2);
    const saved = JSON.parse(github.files['word-chain-brain.json']);
    assert.deepEqual(Object.keys(saved.entries).sort(), ['shot|stdict|늑막염', 'shot|stdict|옛단어']);
  } finally { console.error = original; }
  assert.ok(errors.some((e) => e.includes('불러오기 실패')) && errors.some((e) => e.includes('저장 실패')));
  assert.ok(errors.every((e) => !e.includes('Bearer') && !e.includes(' t '))); // 토큰은 로그에 남기지 않는다
});

test('Gist 보관: 서버가 다시 켜져도 지오메트리 대쉬 순위가 남는다(같은 기록은 한 번만)', async () => {
  const fs = require('fs'); const os = require('os'); const path = require('path');
  const { createGeometryDashScoreStore } = require('../lib/geometry-dash-scores');
  const github = fakeGitHub();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-scores-'));
  const open = (file) => createGeometryDashScoreStore(path.join(dir, file), {
    remote: createGistSync({ token: 't', gistId: 'g1', fetchImpl: github.fetchImpl, saveDelayMs: 60_000 }), remoteName: 'geometry-dash-scores.json' });

  // 첫 번째 서버: 점수 두 개를 저장하고 꺼진다.
  let store = open('a.json'); await store.ready;
  store.addScore('하나', 300); store.addScore('둘', 500);
  await store.remote.flush();

  // 두 번째 서버: 디스크 파일이 지워진 상태(다른 파일)여도 Gist에서 순위를 불러온다.
  store = open('b.json'); await store.ready;
  assert.deepEqual(store.getTop().map((e) => [e.name, e.score]), [['둘', 500], ['하나', 300]]);
  store.absorb(JSON.parse(github.files['geometry-dash-scores.json'])); // 같은 기록을 또 합쳐도
  assert.equal(store.getTop().length, 2); // 두 번 들어가지 않는다
  fs.rmSync(dir, { recursive: true, force: true });
});
