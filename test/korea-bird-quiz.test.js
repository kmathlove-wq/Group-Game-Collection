const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const B = require('../public/korea-bird-quiz/js/species.js');

const IMG = path.join(__dirname, '../public/korea-bird-quiz/img');
const GROUPS = ['small', 'land', 'duck', 'heron', 'shore', 'raptor'];

test('새 목록: 140종 이상, id·파일·이름이 겹치지 않고 힌트가 3개씩', () => {
  assert.ok(B.SPECIES.length >= 140, `새 ${B.SPECIES.length}종`);
  assert.equal(new Set(B.SPECIES.map((s) => s.id)).size, B.SPECIES.length);
  assert.equal(new Set(B.SPECIES.map((s) => s.file)).size, B.SPECIES.length);
  assert.equal(new Set(B.SPECIES.map((s) => s.name)).size, B.SPECIES.length);
  assert.equal(new Set(B.SPECIES.map((s) => s.sci)).size, B.SPECIES.length);
  for (const s of B.SPECIES) {
    assert.match(s.file, /^[a-z-]+$/, s.name);
    assert.ok(GROUPS.includes(s.group), `${s.name} 무리 ${s.group}`);
    assert.ok(s.sci && s.where, s.name);
    assert.equal(s.hints.length, 3, s.name);
    // 힌트에 정답 이름이 그대로 나오면 안 된다
    s.hints.forEach((h) => assert.ok(h && !h.includes(s.name), `${s.name} 힌트에 이름이 나옴: ${h}`));
  }
});

test('사진: 모든 새에 진짜 JPEG 사진이 있고, 위키미디어 출처(찍은 사람 · 라이선스)를 밝힌다', () => {
  for (const s of B.SPECIES) {
    const file = path.join(IMG, s.file + '.jpg');
    assert.ok(fs.existsSync(file), `${s.name} 사진 없음`);
    const head = fs.readFileSync(file).subarray(0, 3);
    assert.deepEqual([...head], [0xff, 0xd8, 0xff], `${s.name} 사진이 JPEG가 아님`);
    const parts = s.credit.split(' · ');
    assert.equal(parts.length, 3, `${s.name} 출처 모양: ${s.credit}`);
    assert.ok(parts[0].trim(), `${s.name} 찍은 사람 없음`);
    assert.match(parts[1], /^(CC BY(-SA)? [0-9.]+( [a-z]+)?|CC0|퍼블릭 도메인)$/, `${s.name} 라이선스: ${parts[1]}`);
    assert.equal(parts[2], '위키미디어 공용', s.name);
  }
});

test('문제 만들기: 10문제가 겹치지 않고, 보기 4개(중복 없음)에 정답이 하나, 같은 무리 오답이 섞인다', () => {
  for (let round = 0; round < 80; round++) {
    const quiz = B.makeQuiz(B.QUESTION_COUNT);
    assert.equal(quiz.length, B.QUESTION_COUNT);
    assert.equal(new Set(quiz.map((q) => q.answer.id)).size, quiz.length);
    for (const q of quiz) {
      assert.equal(q.choices.length, B.CHOICES);
      assert.equal(new Set(q.choices.map((c) => c.id)).size, B.CHOICES);
      assert.equal(new Set(q.choices.map((c) => c.name)).size, B.CHOICES);
      assert.equal(q.choices.filter((c) => c === q.answer).length, 1);
      const same = q.choices.filter((c) => c !== q.answer && c.group === q.answer.group).length;
      assert.ok(same >= B.SAME_GROUP, `${q.answer.name} 같은 무리 오답 ${same}개`);
    }
  }
});

test('보기 순서는 무작위: 정답이 여러 자리에 나온다', () => {
  const spots = new Set();
  for (let i = 0; i < 40; i++) {
    for (const q of B.makeQuiz(B.QUESTION_COUNT)) spots.add(q.choices.indexOf(q.answer));
  }
  assert.equal(spots.size, B.CHOICES);
});

test('점수: 힌트마다 3점씩 줄고 1점 아래로는 안 내려감', () => {
  assert.deepEqual([0, 1, 2, 3, 9].map(B.scoreFor), [10, 7, 4, 1, 1]);
});

test('화면: 이름 잠금 스크립트와 저장 키', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/korea-bird-quiz/index.html'), 'utf8');
  assert.ok(html.includes('/shared/name-lock.js'));
  const main = fs.readFileSync(path.join(__dirname, '../public/korea-bird-quiz/js/main.js'), 'utf8');
  assert.ok(main.includes("'korea-bird-quiz:dex'") && main.includes("'korea-bird-quiz:best'"));
  assert.ok(!/innerHTML/.test(main), 'innerHTML 금지');
});
