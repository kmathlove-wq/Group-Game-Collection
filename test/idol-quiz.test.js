const test = require('node:test');
const assert = require('node:assert/strict');
// 순위 시험 점수가 진짜 순위 파일(data/)에 쌓이지 않게 임시 폴더를 쓴다(server.js를 불러오기 전에 정해야 함).
process.env.SCORES_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'idol-scores-'));
const Q = require('../public/idol-quiz/js/rules.js');

test('초성 뽑기·힌트 글자·정답 다듬기', () => {
  assert.equal(Q.chosung('블랙핑크'), 'ㅂㄹㅍㅋ');
  assert.equal(Q.chosung('투모로우바이투게더'), 'ㅌㅁㄹㅇㅂㅇㅌㄱㄷ');
  assert.equal(Q.reveal('블랙핑크', 1), '블ㄹㅍㅋ');
  assert.equal(Q.normalize(' 블랙 핑크! '), '블랙핑크');
  assert.equal(Q.normalize('BTS'), 'bts');
});

test('그룹 목록: 이름은 한글, 초성이 겹치지 않고, 종류·연도가 올바르다', () => {
  const seen = new Map();
  for (const g of Q.GROUPS) {
    assert.match(g.name, /^[가-힣]+$/, g.name);
    assert.ok(['boy', 'girl'].includes(g.type), g.name);
    assert.ok(g.year >= 1990 && g.year <= 2026, g.name);
    const cho = Q.chosung(g.name);
    assert.ok(!seen.has(cho), `${g.name}·${seen.get(cho)} 초성이 같음`);
    seen.set(cho, g.name);
  }
  assert.ok(Q.GROUPS.filter((g) => g.type === 'boy').length >= Q.QUESTION_COUNT);
  assert.ok(Q.GROUPS.filter((g) => g.type === 'girl').length >= Q.QUESTION_COUNT);
});

test('정답 판정: 이름·다른 이름·띄어쓰기를 받고 남의 이름은 틀림', () => {
  const bts = Q.GROUPS.find((g) => g.name === '방탄소년단');
  assert.ok(Q.isCorrect(bts, '방탄 소년단'));
  assert.ok(Q.isCorrect(bts, 'BTS'));
  assert.ok(Q.isCorrect(bts, '방탄'));
  assert.ok(!Q.isCorrect(bts, '세븐틴'));
  assert.ok(!Q.isCorrect(bts, '  '));
});

test('점수: 빨리 맞힐수록 높고 힌트마다 30점 빠지며 20점 아래로는 안 내려감', () => {
  assert.equal(Q.scoreFor(15, 0), 250);
  assert.equal(Q.scoreFor(0.2, 0), 110);
  assert.equal(Q.scoreFor(10, 2), 140);
  assert.equal(Q.scoreFor(0, 5), 20);
  assert.ok(Q.scoreFor(99, 0) <= 250);
});

test('문제 뽑기: 겹치지 않고 고른 종류만', () => {
  for (const kind of ['all', 'boy', 'girl']) {
    const qs = Q.pickQuestions(kind, Q.QUESTION_COUNT);
    assert.equal(qs.length, Q.QUESTION_COUNT);
    assert.equal(new Set(qs.map((g) => g.name)).size, qs.length);
    if (kind !== 'all') assert.ok(qs.every((g) => g.type === kind));
  }
});

test('아이돌 초성퀴즈 순위 API: 상한 3,750점', async (t) => {
  const { server, io, rooms } = require('../server');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    rooms.clear();
    await new Promise((resolve) => io.close(resolve));
  });
  assert.equal((await fetch(`${url}/idol-quiz/`)).status, 200);
  assert.equal((await fetch(`${url}/shared/ranking.js`)).status, 200);
  const post = (body) => fetch(`${url}/api/idol-quiz/scores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({ name: '시험', score: 3751 })).status, 400);
  const ok = await post({ name: '아이돌박사', score: 3750 });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).rank, 1);
});
