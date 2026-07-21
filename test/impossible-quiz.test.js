const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  TOTAL_QUESTIONS, MAX_SCORE, ALWAYS_WRONG_QUESTION_IDS, questions, evaluate
} = require('../public/impossible-quiz-data');

test('절대 못 맞히는 퀴즈쇼는 20문제를 고정 순서와 18점 만점으로 제공한다', () => {
  assert.equal(TOTAL_QUESTIONS, 20);
  assert.equal(MAX_SCORE, 18);
  assert.deepEqual(ALWAYS_WRONG_QUESTION_IDS, [4, 5]);
  assert.deepEqual(questions.map(({ id }) => id), Array.from({ length: 20 }, (_, index) => index + 1));
  assert.equal(questions[18].displayNumber, 20);
  assert.equal(questions[18].id, 19, '19번은 실제 순서와 정답 판정에서만 19번이어야 한다');
  assert.equal(questions[18].correctAnswer, '19번째');
});

test('4번과 5번은 모든 선택에서 오답이며 점수 대상이 아니다', () => {
  for (const id of ALWAYS_WRONG_QUESTION_IDS) {
    const question = questions[id - 1];
    assert.equal(question.scorable, false);
    for (const option of question.options) assert.equal(evaluate(question, option, 0).correct, false);
  }
});

test('직접 입력과 마지막 누적 점수 판정 규칙을 적용한다', () => {
  assert.equal(evaluate(questions[0], ' 서울 특별시 ', 0).correct, true);
  assert.equal(evaluate(questions[0], '서울', 0).correct, false);
  assert.equal(evaluate(questions[1], '  미국의 IT 기업 ', 0).correct, true);
  assert.equal(evaluate(questions[14], 'ai이미지편집기', 0).correct, true);
  assert.equal(evaluate(questions[19], '05', 5).correct, true);
  assert.equal(evaluate(questions[19], '5.0', 5).correct, false);
  assert.equal(evaluate(questions[19], '-1', 0).correct, false);
});

test('특수 문제 데이터와 제공 이미지 경로가 완전하다', () => {
  assert.equal(questions[8].timeLimit, 60);
  assert.equal(questions[8].correctAnswer, '35개');
  for (const option of questions[13].options) assert.equal(evaluate(questions[13], option, 0).correct, true);
  assert.equal(questions[16].correctAnswer, 'first');
  const assets = ['ai-image-editor-logo.png', 'hanja-scroll.png', 'hanja-grid.png', 'hanja-black.png'];
  for (const name of assets) assert.equal(fs.existsSync(path.join(__dirname, '..', 'public', 'assets', 'impossible-quiz', name)), true, `${name} 파일이 필요합니다.`);
});

test('게임 선택 화면에 새 1인용 게임 진입 카드가 있다', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'games.html'), 'utf8');
  assert.match(html, /href="\/impossible-quiz"/);
  assert.match(html, /절대 못 맞히는 퀴즈쇼/);
  assert.match(html, /혼자 하기 · 총 20문제/);
});
