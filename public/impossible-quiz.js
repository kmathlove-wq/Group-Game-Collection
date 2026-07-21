(() => {
  'use strict';
  const { TOTAL_QUESTIONS, MAX_SCORE, questions, evaluate } = window.ImpossibleQuizData;
  const STORAGE_KEY = 'group-game:impossible-quiz:v1';
  const symbols = ['①', '②', '③', '④', '⑤'];
  const questionView = document.querySelector('#questionView');
  const resultView = document.querySelector('#resultView');
  const progressText = document.querySelector('#progressText');
  const examPaper = document.querySelector('#examPaper');
  const muteButton = document.querySelector('#muteButton');
  const resetButton = document.querySelector('#resetButton');
  let timerId = null;
  let movingLabels = null;
  let lastLabelMove = 0;
  let labelMoveCount = 0;
  let fleeCount = 0;

  function freshState() { return { index: 0, score: 0, history: [], answers: {}, scoreBeforeFinalQuestion: null, q9Deadline: null, muted: false }; }
  function readState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || !Number.isInteger(saved.index) || saved.index < 0 || saved.index > TOTAL_QUESTIONS || !Array.isArray(saved.history)) return freshState();
      return { ...freshState(), ...saved, score: Math.max(0, Math.min(MAX_SCORE, Number(saved.score) || 0)) };
    } catch { return freshState(); }
  }
  let state = readState();
  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function clearTimer() { if (timerId) clearInterval(timerId); timerId = null; }
  function setMutedLabel() { muteButton.textContent = state.muted ? '🔇 음소거됨' : '🔊 소리 켜짐'; muteButton.setAttribute('aria-pressed', String(state.muted)); }
  function playTone(correct) {
    if (state.muted || !window.AudioContext) return;
    const context = new AudioContext(); const oscillator = context.createOscillator(); const gain = context.createGain();
    oscillator.frequency.value = correct ? 560 : 180; gain.gain.setValueAtTime(.035, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .13);
    oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .13); oscillator.onended = () => context.close();
  }
  function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function currentHistory(question) { return state.history.find((item) => item.id === question.id); }
  function displayedNumber(question) { return question.displayNumber || question.id; }

  function render() {
    clearTimer();
    resultView.hidden = true; questionView.hidden = false; questionView.replaceChildren();
    if (state.index >= TOTAL_QUESTIONS) return renderResults();
    const question = questions[state.index];
    if (question.id === 20 && state.scoreBeforeFinalQuestion === null) { state.scoreBeforeFinalQuestion = state.score; save(); }
    progressText.textContent = `현재 문항: ${displayedNumber(question)} / ${TOTAL_QUESTIONS}`;
    if (question.preface) questionView.append(el('p', 'question-preface', question.preface));
    const heading = el('h2', 'question-heading');
    if (question.type === 'tiny-clue') {
      heading.append(document.createTextNode(`${question.id}. 유치원에서 20명이 `), el('small', 'tiny-clue', '선생님 포함'), document.createTextNode('\n놀이동산에 왔을 때\n표를 몇 장 사야 할까요?'));
    } else heading.textContent = `${question.id}. ${question.question}`;
    questionView.append(heading);
    if (question.type === 'count-ones') renderOnesBoard();
    if (question.type === 'math-input') renderMath();
    if (question.image) { const image = el('img', 'prompt-image'); image.src = question.image; image.alt = '문제에 제시된 사이트 로고'; questionView.append(image); }
    const form = el('form', 'answer-form'); form.noValidate = true;
    const answered = currentHistory(question);
    if (question.type === 'image-choice') renderImageOptions(form, question, answered);
    else if (['math-input', 'image-input', 'score-input'].includes(question.type)) renderWritten(form, question, answered);
    else renderOptions(form, question, answered);
    const actions = el('div', 'action-row');
    if (!answered) { const submit = el('button', 'exam-button', '답안 제출'); submit.type = 'submit'; submit.disabled = !state.answers[question.id]; submit.dataset.role = 'submit'; actions.append(submit); }
    else actions.append(nextButton(question));
    form.append(actions); questionView.append(form);
    if (answered) showFeedback(answered, question, false);
    form.addEventListener('submit', (event) => { event.preventDefault(); submitAnswer(question); });
    if (question.type === 'count-ones' && !answered) startTimer(question);
    if (question.type === 'math-input' && window.MathJax?.typesetPromise) window.MathJax.typesetPromise([questionView]).catch(() => {});
  }

  function renderOptions(form, question, answered) {
    const list = el('fieldset', `option-list${question.type === 'fleeing-answer' ? ' flee-zone' : ''}`); list.setAttribute('aria-label', '답안 보기');
    const values = question.type === 'moving-label' ? (movingLabels ||= [...question.options]) : question.options;
    values.forEach((value, index) => {
      const button = el('button', 'option-button'); button.type = 'button'; button.dataset.value = value; button.disabled = Boolean(answered);
      const symbol = el('span', 'option-symbol', symbols[index]); button.append(symbol, document.createTextNode(value));
      if (question.id === 4) button.classList.add(value === '파랑' ? 'color-red' : 'color-blue');
      if (question.id === 16) button.classList.add('long-word');
      if (state.answers[question.id] === value) button.classList.add('selected');
      if (answered && (answered.choice || answered.answer) === value) button.classList.add('graded', answered.correct ? 'correct' : 'wrong');
      if (!answered) button.addEventListener('click', () => selectOption(question, value, button));
      if (!answered && question.type === 'moving-label') {
        button.addEventListener('pointerenter', () => { if (button.dataset.value === '동쪽') moveEastLabel(question); });
        button.addEventListener('pointerdown', (event) => {
          if (event.pointerType !== 'mouse' && button.dataset.value === '동쪽' && labelMoveCount < 8) { event.preventDefault(); moveEastLabel(question); }
        });
      }
      if (!answered && question.type === 'fleeing-answer' && value === '6') {
        button.addEventListener('pointerenter', () => flee(button, list));
        button.addEventListener('pointerdown', (event) => { if (fleeCount < 8) { event.preventDefault(); flee(button, list); } });
      }
      list.append(button);
    });
    form.append(list);
    if (question.type === 'other-choice') {
      const row = el('div', 'other-answer'); row.hidden = state.answers[question.id] !== '기타';
      const label = el('label', '', '답:'); label.htmlFor = `other-${question.id}`;
      const input = el('input', 'answer-input'); input.id = `other-${question.id}`; input.placeholder = '정답을 직접 입력하세요.'; input.autocomplete = 'off'; input.disabled = Boolean(answered); input.value = state.answers[`${question.id}:other`] || '';
      input.addEventListener('input', () => { state.answers[`${question.id}:other`] = input.value; save(); updateSubmit(form, input.value.trim()); });
      row.append(label, input); form.append(row); if (!row.hidden && !answered) queueMicrotask(() => input.focus());
    }
  }

  function renderWritten(form, question, answered) {
    const row = el('div', 'written-answer'); const label = el('label', '', '답:'); label.htmlFor = `answer-${question.id}`;
    const input = el('input', 'answer-input'); input.id = `answer-${question.id}`; input.inputMode = question.type === 'score-input' ? 'numeric' : 'text'; input.autocomplete = 'off'; input.disabled = Boolean(answered); input.value = state.answers[question.id] || '';
    input.addEventListener('input', () => { state.answers[question.id] = input.value; save(); updateSubmit(form, input.value.trim()); });
    row.append(label, input); form.append(row);
  }

  function renderImageOptions(form, question, answered) {
    const list = el('fieldset', 'option-list image-options'); list.setAttribute('aria-label', '이미지 답안 보기');
    question.options.forEach((option, index) => {
      const button = el('button', 'option-button'); button.type = 'button'; button.dataset.value = option.value; button.disabled = Boolean(answered); button.setAttribute('aria-label', `${index + 1}번 이미지`);
      const image = el('img'); image.src = option.src; image.alt = `${index + 1}번 한자 이미지 보기`; button.append(image);
      if (state.answers[question.id] === option.value) button.classList.add('selected');
      if (answered && answered.answer === option.value) button.classList.add('graded', answered.correct ? 'correct' : 'wrong');
      if (!answered) button.addEventListener('click', () => selectOption(question, option.value, button)); list.append(button);
    }); form.append(list);
  }

  function selectOption(question, value, button) {
    state.answers[question.id] = value; save();
    button.closest('.option-list').querySelectorAll('.option-button').forEach((item) => item.classList.toggle('selected', item === button));
    const other = button.closest('form').querySelector('.other-answer'); if (other) { other.hidden = value !== '기타'; if (!other.hidden) other.querySelector('input').focus(); }
    updateSubmit(button.closest('form'), value !== '기타' || Boolean(state.answers[`${question.id}:other`]?.trim()));
  }
  function updateSubmit(form, enabled) { const submit = form.querySelector('[data-role="submit"]'); if (submit) submit.disabled = !enabled; }
  function selectedAnswer(question) { return question.type === 'other-choice' && state.answers[question.id] === '기타' ? (state.answers[`${question.id}:other`] || '').trim() : (state.answers[question.id] || '').trim(); }

  function submitAnswer(question, forcedTimeout = false) {
    if (currentHistory(question)) return;
    const answer = forcedTimeout ? '시간 초과' : selectedAnswer(question); if (!answer) return;
    const result = evaluate(question, answer, state.scoreBeforeFinalQuestion);
    if (result.correct) state.score += 1;
    const record = { id: question.id, answer, choice: state.answers[question.id], correct: result.correct, message: result.message };
    state.history.push(record); state.q9Deadline = null; save(); clearTimer(); playTone(result.correct);
    if (question.type === 'tiny-clue') document.querySelector('.tiny-clue')?.classList.add('revealed');
    render(); examPaper.classList.toggle('gentle-shake', !result.correct); setTimeout(() => examPaper.classList.remove('gentle-shake'), 260);
  }
  function showFeedback(record, question, announce = true) {
    const feedback = el('div', `feedback ${record.correct ? 'correct' : 'wrong'}`, record.message); feedback.setAttribute('role', announce ? 'alert' : 'status'); questionView.append(feedback);
    if (question.type === 'tiny-clue') { const clue = document.querySelector('.tiny-clue'); clue?.classList.add('revealed'); setTimeout(() => clue?.classList.remove('revealed'), 1800); }
  }
  function nextButton(question) { const button = el('button', 'exam-button', question.id === TOTAL_QUESTIONS ? '시험 종료' : '다음 문항'); button.type = 'button'; button.addEventListener('click', () => { state.index += 1; movingLabels = null; fleeCount = 0; labelMoveCount = 0; save(); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }); return button; }

  function renderOnesBoard() {
    const timer = el('p', 'timer', '남은 시간: 60초'); timer.id = 'questionTimer'; questionView.append(timer);
    const board = el('div', 'ones-board'); board.setAttribute('aria-label', '숫자 1이 흩어져 있는 자료 영역');
    for (let index = 0; index < 35; index += 1) {
      const mark = el('span', 'one-mark', '1'); const rotation = ((index * 37) % 31) - 15; const scaleX = index % 6 === 0 ? -1 : 1; const scaleY = index % 9 === 0 ? -1 : 1;
      mark.style.cssText = `font-size:${17 + (index * 7) % 19}px;opacity:${.62 + (index % 5) * .08};transform:rotate(${rotation}deg) scale(${scaleX},${scaleY})`; board.append(mark);
    }
    console.assert(board.children.length === 35, '9번 자료 영역에는 숫자 1이 정확히 35개여야 합니다.'); questionView.append(board);
  }
  function startTimer(question) {
    if (!state.q9Deadline) { state.q9Deadline = Date.now() + question.timeLimit * 1000; save(); }
    const update = () => { const seconds = Math.max(0, Math.ceil((state.q9Deadline - Date.now()) / 1000)); const timer = document.querySelector('#questionTimer'); if (timer) { timer.textContent = `남은 시간: ${seconds}초`; timer.classList.toggle('urgent', seconds <= 10); } if (seconds <= 0) submitAnswer(question, true); };
    update(); timerId = setInterval(update, 250);
  }
  function renderMath() {
    const math = el('div', 'math-expression'); math.setAttribute('aria-label', 'x가 0으로 갈 때, 분자는 루트 1 더하기 사인 2x 빼기 루트 1 빼기 사인 2x이고 분모는 탄젠트 x인 극한식');
    math.textContent = '\\[\\lim_{x\\to 0}\\frac{\\sqrt{1+\\sin 2x}-\\sqrt{1-\\sin 2x}}{\\tan x}\\]'; questionView.append(math);
  }
  function flee(button, zone) {
    if (fleeCount >= 8) return; fleeCount += 1;
    const maxX = Math.max(0, zone.clientWidth - button.offsetWidth - 8); const maxY = Math.max(0, zone.clientHeight - button.offsetHeight - 8);
    button.style.left = `${Math.round(8 + Math.random() * Math.max(0, maxX - 8))}px`; button.style.top = `${Math.round(8 + Math.random() * Math.max(0, maxY - 8))}px`;
  }
  function moveEastLabel(question) {
    const now = Date.now(); if (labelMoveCount >= 8 || now - lastLabelMove < 180) return; lastLabelMove = now; labelMoveCount += 1;
    const eastIndex = movingLabels.indexOf('동쪽'); let next = (eastIndex + 1 + Math.floor(Math.random() * 3)) % movingLabels.length; if (next === eastIndex) next = (next + 1) % movingLabels.length;
    [movingLabels[eastIndex], movingLabels[next]] = [movingLabels[next], movingLabels[eastIndex]]; state.answers[question.id] = ''; save(); render();
  }

  function finalMessage(score) {
    if (score === 0) return '0점...\n이 정도면 문제를 푼 게 아니라 문제와 싸운 겁니다ㅋㅋ';
    if (score <= 4) return '상식적으로 생각한 결과입니다.\n이 퀴즈쇼에서는 상식이 가장 큰 약점이에요ㅎㅎ';
    if (score <= 8) return '문제를 조금씩 이해하기 시작했네요.\n하지만 이 퀴즈쇼를 믿은 순간들이 아직 많았습니다ㅋㅋ';
    if (score <= 12) return '절반 이상 맞혔습니다.\n정상적인 사고와 이상한 사고 사이에서 잘 버티셨네요.';
    if (score <= 16) return '이 정도면 출제자의 생각을 읽고 있습니다.\n혹시 문제 만드는 걸 옆에서 보셨나요?ㅋㅋ';
    if (score === 17) return '거의 다 맞혔습니다.\n정상보다 비정상에 가까우시군요.\n축하해야 하는지는 모르겠습니다ㅎㅎ';
    return '18점 만점?!\n시스템이 이런 상황은 예상하지 못했습니다.\n혹시 출제자 본인이세요?ㅋㅋㅋㅋ';
  }
  function renderResults() {
    clearTimer(); questionView.hidden = true; resultView.hidden = false; progressText.textContent = '20 / 20 완료'; resultView.replaceChildren();
    resultView.append(el('h2', '', '채점 결과'));
    const sheet = el('div', 'score-sheet'); const rows = [['총 문항 수', '20문항'], ['맞힌 문제', `${state.score}문항`], ['틀린 문제', `${TOTAL_QUESTIONS - state.score}문항`], ['최고 가능 점수', `${MAX_SCORE}점`], ['최종 점수', `${state.score} / ${MAX_SCORE}`], ['정답률', `${Math.round((state.score / MAX_SCORE) * 100)}%`]];
    rows.forEach(([label, value], index) => { const row = el('div', `score-row${index === 4 ? ' final-score' : ''}`); row.append(el('span', '', label), el('strong', '', value)); sheet.append(row); }); resultView.append(sheet, el('p', 'final-message', finalMessage(state.score)));
    const actions = el('div', 'result-actions'); const again = el('button', 'exam-button', '다시 풀기'); again.type = 'button'; again.addEventListener('click', resetGame); const home = el('a', 'exam-button', '그룹 게임 컬렉션으로 돌아가기'); home.href = '/'; actions.append(again, home); resultView.append(actions);
  }
  function resetGame() { clearTimer(); const muted = state.muted; state = freshState(); state.muted = muted; save(); movingLabels = null; fleeCount = 0; labelMoveCount = 0; render(); window.scrollTo({ top: 0 }); }

  muteButton.addEventListener('click', () => { state.muted = !state.muted; save(); setMutedLabel(); });
  resetButton.addEventListener('click', () => { if (confirm('현재 진행 기록을 지우고 1번부터 다시 시작할까요?')) resetGame(); });
  setMutedLabel(); render();
})();
