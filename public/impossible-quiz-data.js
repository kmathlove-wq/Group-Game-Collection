(function exposeQuizData(root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.ImpossibleQuizData = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function makeQuizData() {
  const TOTAL_QUESTIONS = 20;
  const MAX_SCORE = 18;
  const ALWAYS_WRONG_QUESTION_IDS = [4, 5];

  const questions = [
    { id: 1, type: 'other-choice', question: '대한민국의 수도는?', options: ['서울', '부산', '인천', '대전', '기타'], correctAnswer: '서울특별시' },
    { id: 2, type: 'other-choice', question: 'Apple의 뜻은?', options: ['사과', '바나나', '포도', '수박', '기타'], accepted: ['미국의 기술 기업', '미국 기술 기업', '미국의 IT 기업', '미국 IT 기업', '애플 회사', '애플 기업', 'Apple 회사', 'Apple 기업', '미국 기업 애플', '미국의 기업 애플'] },
    { id: 3, type: 'multiple-choice', question: '1 + 1은?', options: ['1', '2', '귀요미', '창문'], correctAnswer: '2', correctMessage: '정답입니다.\n수학을 할 줄만 안다면 당연한 거죠.', wrongMessage: '당연히 1+1은 누구한테 물어봐도 2죠ㅋㅋㅋㅋㅋㅋㅋ' },
    { id: 4, type: 'color-trick', question: '빨강은 무엇인가요?', options: ['파랑', '빨강'], alwaysWrong: true, scorable: false },
    { id: 5, type: 'egg-trick', question: '달걀 3개가 있습니다.\n1개를 깨고, 1개를 굽고, 1개를 먹었습니다.\n몇 개가 남았을까요?', options: ['0개', '1개', '2개', '3개'], alwaysWrong: true, scorable: false },
    { id: 6, type: 'fleeing-answer', question: '2 × 3은?', options: ['5', '6', '7', '8'], correctAnswer: '6', correctMessage: '정답입니다.\n이걸 진짜 잡았네요? 집념이 대단하십니다ㅋㅋ', wrongMessage: '2 × 3도 모르시다니 수학을 잘 못하시는군요.' },
    { id: 7, type: 'moving-label', question: '태양은 어느 쪽에서 뜰까요?', options: ['동쪽', '서쪽', '남쪽', '북쪽'], correctAnswer: '동쪽', correctMessage: '정답입니다.\n계속 도망가는데도 동쪽을 잡으셨네요ㅋㅋ' },
    { id: 8, type: 'multiple-choice', question: '어항에 물고기 10마리가 있습니다.\n그중 3마리가 죽었습니다.\n어항 안에는 몇 마리가 있을까요?', options: ['3마리', '7마리', '10마리', '13마리'], correctAnswer: '10마리', correctMessage: '정답입니다.\n근데 죽으면 사람이 치워서 7ㄱ... 아닙니다.', wrongMessage: '죽은 물고기도 아직은 어항 안에 있어요ㅋㅋ\n관리가 잘되면 곧 없어질 수도....' },
    { id: 9, type: 'count-ones', question: '아래 영역 안에 있는 숫자 1은 모두 몇 개일까요?', options: ['33개', '34개', '35개', '36개'], correctAnswer: '35개', timeLimit: 60, correctMessage: '정답입니다.\n저걸 1분 안에 진짜 다 세셨나요? 눈이 무섭네요ㅋㅋ', wrongMessage: '정답은 35개였습니다.\n1분이나 드렸는데 다시 세고 싶으신가요ㅎㅎ' },
    { id: 10, type: 'multiple-choice', question: '의사가 알약 3개를 주며 30분마다 하나씩 먹으라고 했습니다.\n알약을 모두 먹는 데 걸리는 시간은?', options: ['30분', '60분', '90분', '120분'], correctAnswer: '60분', correctMessage: '약은 받자마자 바로 먹어야죠.', wrongMessage: '도대체 왜 30분을 기다리고 먹으세요ㅋㅋㅋ' },
    { id: 11, type: 'math-input', preface: '정답 2개', question: '다음 극한값 개 있는 사과의 개수를 구하세요.\n숫자만 입력하세요.', correctAnswer: '2', correctMessage: '정답입니다.\n설마 이걸 실제로 계산한 건 아니죠?\n위에 이미 정답 2개라고 써 놨는데ㅋㅋㅋㅋ', wrongMessage: '답을 알려줬는데도 못 맞혔내요ㅋㅋㅋㅋㅋㅋㅋㅎㅋㅎ\n정답은 2였습니다.' },
    { id: 12, type: 'tiny-clue', question: '유치원에서 20명이 놀이동산에 왔을 때\n표를 몇 장 사야 할까요?', options: ['1장', '10장', '21장', '20장', '알 수 없다'], correctAnswer: '20장', correctMessage: '선생님 포함이여서 20장!\n눈이 좋으시느에으요.', wrongMessage: '이런 문제 어디서 봤다고 속은 사람 손ㅋㅋ\n선생님 포함 20명이어서 정답은 20장입니다.' },
    { id: 13, type: 'multiple-choice', question: '지금까지 문제가 어렵고 짜증나고\n암튼 절대 못 맞히겠습니까?', options: ['예', '아니오'], correctAnswer: '예', correctMessage: '그렇다면 아주 축하합니다.\n절대 못 맞히는 퀴즈쇼를 정확하게 이해하셨습니다ㅋㅋ', wrongMessage: '아니에요? 그렇죠?\n다시 생각해 보면 분명 절대 못 풉니다.' },
    { id: 14, type: 'all-correct', question: '어떤 배에 양 20마리,\n삼겹살... 아니 돼지 16마리,\n스테... 아니 소 67마리가 있습니다.\n\n이 배 선장의 나이는 몇 살일까요?', options: ['1살', '12살', '30살', '46살', '67살'], correctMessage: '정답입니다.\n그냥 해 봤어요.\n뭘 골라도 정답이었는데 고민하신 건 아니죠?ㅋㅋ' },
    { id: 15, type: 'image-input', question: '이 로고는 무슨 사이트의 로고일까요?\n참고로 제가 만든 겁니다.', image: '/assets/impossible-quiz/ai-image-editor-logo.png', accepted: ['AI 이미지 편집기', 'AI이미지편집기'], correctMessage: '기억력이 매우매우매우 즈옿시네용.\n1번 스쳐 지나갔는데...', wrongMessage: '당연한거죸ㅎ\n정답은 AI 이미지 편집기였습니다.' },
    { id: 16, type: 'multiple-choice', question: '문제가 바닥나서 하는 거니까\n너무 화내지 말아주세요.\n\n세상에서 가장 긴 영어 단어는?', options: ['pneumonoultramicroscopicsilicovolcanoconiosis', 'pneumonoultramocroscopicsilicovolcanoconiosis', 'pnaumonoultramicroscopicsilicovolcanoceniosis'], correctAnswer: 'pneumonoultramicroscopicsilicovolcanoconiosis', correctMessage: '뭐가 정답인지 모르겠으면 정상입니다.\n그래도 맞히셨네요ㅋㅋ', wrongMessage: '정답은 찍은 거.\n첫 번째가 정답이었습니다.' },
    { id: 17, type: 'image-choice', question: '문제가 바닥나서 하는 거니까\n너무 화내지 말아주세요22\n\n세상에서 가장 어려운 한자는?\n근데 쉬움ㅋㅋ', options: [
      { value: 'first', src: '/assets/impossible-quiz/hanja-scroll.png' },
      { value: 'second', src: '/assets/impossible-quiz/hanja-grid.png' },
      { value: 'third', src: '/assets/impossible-quiz/hanja-black.png' }
    ], correctAnswer: 'first', correctMessage: '참 쉽죠?\n종이가 비스듬하게 있는 사진이 정답이었습니다ㅋㅋ', wrongMessage: '대충 더 복잡하게 생긴 거 고르면 되는데.....\n정답은 첫 번째 사진이었습니다.' },
    { id: 18, type: 'multiple-choice', question: '이 퀴즈쇼에 몇 점을 드리겠습니까?', options: ['0점', '1점', '50점', '100점', '9999999999999999999점'], correctAnswer: '0점', correctMessage: '저도 인정합니다.\n솔직한 평가 감사합니다ㅋㅋ', wrongMessage: '그런가요?\n생각보다 높은 점수를 주셨네요ㅎㅎ' },
    { id: 19, type: 'multiple-choice', question: '이 문제는 몇 번째 문제일까요?', options: ['19번째', '20번째', '1번째 (이거는 절대 안 고르겠지?)', '10번째', '67번째'], correctAnswer: '19번째', displayNumber: 20, correctMessage: '문제에 집중했군요..\n가 아니라 문제에 집중 안 하고 번호를 봤군요ㅋㅋ', wrongMessage: '이 퀴즈쇼를 믿으시면 안 되죠.\n실제로는 19번째 문제였습니다ㅋㅋ' },
    { id: 20, type: 'score-input', question: '이 퀴즈쇼에서 솔직히 몇 문제 맞혔나\n솔직히 말해주세용', correctMessage: '솔직하시군요.\n진짜로 지금까지 맞힌 개수와 똑같습니다ㅋㅋ' }
  ];

  function compact(value) { return String(value ?? '').trim().replace(/\s+/g, '').toLocaleLowerCase('ko-KR'); }
  function createOnePositions(count = 35) {
    let seed = 91357;
    const random = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
    const positions = [];
    while (positions.length < count) {
      let candidate = null;
      for (let attempt = 0; attempt < 500; attempt += 1) {
        const next = { x: 4 + random() * 89, y: 5 + random() * 83 };
        const clear = positions.every((point) => Math.hypot((next.x - point.x) * 6.2, (next.y - point.y) * 3.3) >= 30);
        if (clear) { candidate = next; break; }
      }
      if (!candidate) candidate = { x: 4 + random() * 89, y: 5 + random() * 83 };
      positions.push({
        ...candidate,
        size: 16 + Math.round(random() * 19),
        rotation: -68 + Math.round(random() * 136),
        opacity: .62 + random() * .36
      });
    }
    return positions;
  }
  function evaluate(question, answer, scoreBeforeFinalQuestion) {
    const value = String(answer ?? '');
    if (ALWAYS_WRONG_QUESTION_IDS.includes(question.id)) return { correct: false, message: trickMessage(question.id, value) };
    if (question.type === 'all-correct') return { correct: true, message: question.correctMessage };
    if (question.type === 'score-input') {
      const validInteger = /^\d+$/.test(value.trim());
      const correct = validInteger && Number(value.trim()) === scoreBeforeFinalQuestion;
      return { correct, message: correct ? question.correctMessage : `거짓말하지 마셈.\n실제로 맞힌 개수는 ${scoreBeforeFinalQuestion}개였습니다.` };
    }
    let correct = false;
    if (question.accepted) correct = question.accepted.some((item) => compact(item) === compact(value));
    else correct = compact(question.correctAnswer) === compact(value);
    if (question.id === 1) {
      const message = correct ? '정답입니다.\n서울이 아니라 서울특별시까지 정확하게 입력하셨네요ㅋㅋ' : value === '서울' ? '틀렸습니다. 정답은 서울특별시입니다.\n서울과 서울특별시는 엄연히 다르죠ㅎㅎ' : ['부산', '인천', '대전'].includes(value) ? '서울도 아니고 서울특별시도 아니네요ㅋㅋ\n정답은 서울특별시입니다.' : '직접 입력까지 하셨는데 틀렸습니다ㅋㅋ\n정답은 서울특별시입니다.';
      return { correct, message };
    }
    if (question.id === 2) {
      const message = correct ? '정답입니다.\n과일이 아니라 회사를 생각하셨네요ㅋㅋ' : value === '사과' ? '틀렸습니다. 여기서 Apple은 미국의 기술 기업입니다.\n너무 영어 단어처럼만 생각하셨군요ㅋㅋ' : ['바나나', '포도', '수박'].includes(value) ? '사과도 아니고 그 과일도 아닙니다.\n정답은 미국의 기술 기업 Apple입니다.' : '직접 적으셨지만 그것도 아닙니다ㅋㅋ\n정답은 미국의 기술 기업 Apple입니다.';
      return { correct, message };
    }
    if (question.id === 7 && !correct) return { correct, message: `태양이 ${value}에서 뜨다니 그럼 신기하겠네요하하.` };
    return { correct, message: correct ? question.correctMessage : question.wrongMessage };
  }

  function gradeHistory(history) {
    let score = 0;
    let scoreBeforeFinalQuestion = null;
    const gradedHistory = [];
    for (const record of Array.isArray(history) ? history : []) {
      const question = questions.find((item) => item.id === record.id);
      if (!question) continue;
      const usesChoice = !['other-choice', 'math-input', 'image-input', 'score-input'].includes(question.type);
      const answer = usesChoice ? (record.choice ?? record.answer ?? '') : (record.answer ?? record.choice ?? '');
      if (question.type === 'score-input' && scoreBeforeFinalQuestion === null) scoreBeforeFinalQuestion = score;
      const result = evaluate(question, answer, scoreBeforeFinalQuestion);
      if (result.correct && question.scorable !== false) score += 1;
      gradedHistory.push({ ...record, answer, correct: result.correct, message: result.message });
    }
    return { score, scoreBeforeFinalQuestion, history: gradedHistory };
  }

  function trickMessage(id, value) {
    if (id === 4) return value === '파랑' ? '오답입니다.\n정답은 빨강입니다.\n글자를 봐야 할지 색을 봐야 할지 제가 말 안 했죠ㅎㅎ' : '오답입니다.\n정답은 파랑입니다.\n글자만 믿으시면 안 됩니다ㅋㅋ';
    return ({
      '2개': '오답입니다.\n1개는 실수로 깨먹고,\n1개는 구운 계란으로 먹고,\n1개는 날로 먹었습니다.\n그래서 남은 건 0개입니다ㅋㅋ',
      '0개': '오답입니다.\n사실 깬 달걀을 그대로 구워서 먹은 거여서\n달걀은 1개만 쓴 겁니다.\n그래서 2개가 남았어요.',
      '1개': '오답입니다.\n1개가 남았다는 해석은 오늘 문제에는 없습니다ㅎㅎ',
      '3개': '오답입니다.\n아무것도 안 먹은 척하시면 안 됩니다ㅋㅋ'
    })[value];
  }

  return { TOTAL_QUESTIONS, MAX_SCORE, ALWAYS_WRONG_QUESTION_IDS, questions, compact, createOnePositions, evaluate, gradeHistory };
});
