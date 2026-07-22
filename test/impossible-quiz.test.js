const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  TOTAL_QUESTIONS, MAX_SCORE, ALWAYS_WRONG_QUESTION_IDS, questions, evaluate, gradeHistory
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
  assert.deepEqual(questions.filter((question) => question.scorable === false).map(({ id }) => id), [4, 5]);
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
  assert.equal(evaluate(questions[7], '7', 0).correct, true);
  assert.equal(evaluate(questions[7], '7마리', 0).correct, true);
  assert.equal(evaluate(questions[7], '10마리', 0).correct, false);
  assert.equal(evaluate(questions[19], '05', 5).correct, true);
  assert.equal(evaluate(questions[19], '5.0', 5).correct, false);
  assert.equal(evaluate(questions[19], '-1', 0).correct, false);
});

test('객관식 저장 기록은 화면에서 선택한 값을 우선하여 다시 채점한다', () => {
  const graded = gradeHistory([{ id: 8, answer: '10마리', choice: '7마리', correct: true }]);
  assert.equal(graded.score, 1);
  assert.equal(graded.history[0].answer, '7마리');
  assert.equal(graded.history[0].correct, true);
});

test('저장된 답안 기록에서 마지막 문제 직전 점수를 다시 계산한다', () => {
  const answers = {
    1: '서울특별시',
    2: '미국의 기술 기업',
    3: '2',
    4: '파랑',
    5: '0개',
    6: '6',
    7: '동쪽',
    8: '7마리',
    9: '35개',
    10: '60분',
    11: '2',
    12: '20장',
    13: '예',
    14: '1살',
    15: 'AI 이미지 편집기',
    16: 'pneumonoultramicroscopicsilicovolcanoconiosis',
    17: 'first',
    18: '0점',
    19: '19번째'
  };
  const gradedBeforeFinal = gradeHistory(Object.entries(answers).map(([id, answer]) => ({ id: Number(id), answer })));
  for (const record of gradedBeforeFinal.history) {
    if (!ALWAYS_WRONG_QUESTION_IDS.includes(record.id)) assert.equal(record.correct, true, `${record.id}번 정답이 점수로 인정되어야 한다`);
  }
  assert.equal(gradedBeforeFinal.score, 17);
  assert.equal(gradedBeforeFinal.scoreBeforeFinalQuestion, null);

  const gradedWithFinal = gradeHistory([...gradedBeforeFinal.history, { id: 20, answer: '17' }]);
  assert.equal(gradedWithFinal.scoreBeforeFinalQuestion, 17);
  assert.equal(gradedWithFinal.score, 18);
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

test('20번 제출 후 저장된 답안을 화면 재렌더링에서 제거하지 않는다', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'impossible-quiz.js'), 'utf8');
  assert.match(script, /question\.id === 20 && !currentHistory\(question\)/);
});
