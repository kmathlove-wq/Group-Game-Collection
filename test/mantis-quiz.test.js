const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../public/mantis-quiz/js/species.js');

test('사마귀 목록: id·사진 파일 이름이 겹치지 않고 힌트가 3개씩', () => {
  assert.ok(M.SPECIES.length >= 100, `사마귀 ${M.SPECIES.length}종`);
  const fs = require('fs'), path = require('path');
  for (const s of M.SPECIES) {
    // 새로 넣은 종은 사진이 꼭 있고, 위키미디어 사진은 출처를 밝힌다
    if (s.credit) assert.match(s.credit, /위키미디어 공용$/, s.name);
    assert.ok(M.EXTENSIONS.some((e) => fs.existsSync(path.join(__dirname, '../public/mantis-quiz/img', s.file + '.' + e))), `${s.name} 사진 없음`);
  }
  assert.equal(new Set(M.SPECIES.map((s) => s.id)).size, M.SPECIES.length);
  assert.equal(new Set(M.SPECIES.map((s) => s.file)).size, M.SPECIES.length);
  assert.equal(new Set(M.SPECIES.map((s) => s.name)).size, M.SPECIES.length);
  for (const s of M.SPECIES) {
    assert.match(s.file, /^[a-z-]+$/, s.name);
    assert.equal(s.hints.length, 3, s.name);
    assert.ok(s.sci && s.where, s.name);
    // 힌트에 정답 이름이 그대로 나오면 안 된다
    s.hints.forEach((h) => assert.ok(!h.includes(s.name), `${s.name} 힌트에 이름이 나옴`));
  }
});

test('문제 만들기: 10문제가 겹치지 않고, 보기 4개에 정답이 하나 들어 있다', () => {
  for (let round = 0; round < 50; round++) {
    const quiz = M.makeQuiz(M.QUESTION_COUNT);
    assert.equal(quiz.length, M.QUESTION_COUNT);
    assert.equal(new Set(quiz.map((q) => q.answer.id)).size, quiz.length);
    for (const q of quiz) {
      assert.equal(q.choices.length, M.CHOICES);
      assert.equal(new Set(q.choices.map((c) => c.id)).size, M.CHOICES);
      assert.equal(q.choices.filter((c) => c === q.answer).length, 1);
    }
  }
});

test('점수: 힌트마다 3점씩 줄고 1점 아래로는 안 내려감', () => {
  assert.deepEqual([0, 1, 2, 3, 9].map(M.scoreFor), [10, 7, 4, 1, 1]);
});
