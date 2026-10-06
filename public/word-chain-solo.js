(() => {
  const $ = (s) => document.querySelector(s);
  const { wordItem, beep, startsText } = window.WordChainUI;
  const STORE_KEY = 'wordchain:solo:settings';

  let game = null;        // { id, turnTime }
  let deadline = null;    // 내 차례가 끝나는 시각(사전 확인 중엔 null)
  let pausedMs = null;    // 확인하는 동안 멈춰 둔 남은 시간
  let busy = false;
  let over = false;

  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    if (saved.dictionary) document.querySelector(`input[name=dictionary][value="${saved.dictionary === 'opendict' ? 'opendict' : 'stdict'}"]`).checked = true;
    if (saved.first === 'computer') document.querySelector('input[name=first][value="computer"]').checked = true;
    if (saved.mode === 'growth') document.querySelector('input[name=mode][value="growth"]').checked = true;
    if (saved.turnTime !== undefined) $('#turnTime').value = String(saved.turnTime);
  } catch { /* 저장된 설정이 없어도 기본값으로 시작 */ }

  function message(text, type = '') {
    const el = $('#message'); el.textContent = text; el.className = `notice ${type}`; el.classList.toggle('hidden', !text);
  }
  async function post(url, body) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok && data.ok !== false) throw new Error('서버에 연결하지 못했어요.');
    return data;
  }

  function setTurn(ms) { pausedMs = null; deadline = game.turnTime ? Date.now() + ms : null; } // 제한 없음이면 시계 없음
  function tick() {
    if (!game || over) return;
    if (!game.turnTime) { $('#timer').textContent = '∞'; $('#timebar').style.width = '100%'; return; }
    const total = game.turnTime * 1000;
    const left = deadline ? Math.max(0, deadline - Date.now()) : pausedMs ?? total;
    $('#timer').textContent = `${Math.ceil(left / 1000)}초`;
    $('#timer').classList.toggle('urgent', left <= 5000 && Boolean(deadline));
    $('#timebar').style.width = `${(left / total) * 100}%`;
    if (deadline && left <= 0) finish(false, '⏰ 시간 초과!');
  }
  setInterval(tick, 100);

  function addWord(word, definition, mine) {
    $('#chain').append(wordItem({ word, definition, who: mine ? '나' : '🤖 컴퓨터', side: mine ? 'mine' : 'other', color: mine ? '#3b82f6' : '#10b981' }));
    $('#chain').scrollTop = $('#chain').scrollHeight;
  }

  // 성장 모드: 컴퓨터가 지금 몇 레벨인지 서버에 물어 시작 화면에 보여 준다.
  // 📚 미리 공부하기 진행률: 한글 11,172자 중 몇 번째 글자까지 사전에 물어봤는지(서버가 깨어 있을 때만 공부한다).
  const studyText = (study) => (study ? ` · 📚 사전 공부 ${Math.floor((study.studied / study.total) * 100)}% (${study.studied.toLocaleString()}/${study.total.toLocaleString()}자)` : '');
  const growthText = (brain) => `🧠 컴퓨터 레벨 ${brain.level} (배운 단어 ${brain.learned}개) · 📒 한방 ${brain.shot} · 🪤 함정 ${brain.trap} · 🚫 조심 ${brain.risky} · 🧩 어려운 ${brain.hard}${studyText(brain.study)}`;
  async function showBrain() {
    const el = $('#brainInfo');
    if (document.querySelector('input[name=mode]:checked').value !== 'growth') { el.classList.add('hidden'); return; }
    const dictionary = document.querySelector('input[name=dictionary]:checked').value;
    try {
      const brain = await (await fetch(`/api/word-chain/solo/brain?dictionary=${dictionary}`)).json();
      el.textContent = growthText(brain); el.classList.remove('hidden');
    } catch { el.classList.add('hidden'); }
  }

  async function finish(win, title, detail = '') {
    if (over) return; over = true; deadline = null;
    $('#word').disabled = true; $('#send').disabled = true; $('#giveup').disabled = true;
    let score = Number($('#score').textContent);
    if (!win && !detail) { try { score = (await post(`/api/word-chain/solo/${game.id}/giveup`)).score ?? score; } catch { /* 결과 표시는 계속 */ } }
    beep(win ? [523, 659, 784, 1046] : [392, 330, 262], 0.13);
    $('#resultTitle').textContent = win ? '🏆 내가 이겼어요!' : title;
    $('#resultText').textContent = detail || (win ? `컴퓨터가 이어 말할 단어를 못 찾았어요. 단어 ${score}개를 이었어요!` : `단어 ${score}개를 이었어요. 다시 도전해 볼까요?`);
    $('#statusLabel').textContent = '게임 끝'; $('#prompt').textContent = win ? '승리!' : '패배';
    $('#resultDialog').showModal();
  }

  async function start() {
    const dictionary = document.querySelector('input[name=dictionary]:checked').value;
    const turnTime = Number($('#turnTime').value);
    const first = document.querySelector('input[name=first]:checked').value;
    const mode = document.querySelector('input[name=mode]:checked').value;
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ dictionary, turnTime, first, mode })); } catch { /* 저장 못 해도 진행 */ }
    $('#start').disabled = true;
    $('#setupNotice').classList.add('hidden');
    if (first === 'computer') $('#start').textContent = '🤖 컴퓨터가 첫 단어를 고르는 중…';
    try {
      const data = await post('/api/word-chain/solo', { dictionary, first, mode });
      if (!data.ok) throw new Error(data.message);
      game = { id: data.id, turnTime, mode };
      $('#brainBadge').textContent = data.brain ? `🌱 레벨 ${data.brain.level} · ${data.brain.learned}개` : ''; $('#brainBadge').classList.toggle('hidden', !data.brain); over = false; busy = false;
      $('#dictBadge').textContent = `📖 ${dictionary === 'opendict' ? '우리말샘' : '표준국어대사전'}`; $('#dictBadge').classList.remove('hidden');
      $('#setup').classList.add('hidden'); $('#game').classList.remove('hidden');
      $('#chain').replaceChildren(); $('#score').textContent = '0'; message('');
      $('#statusLabel').textContent = '내 차례!'; $('#prompt').textContent = '아무 단어로 시작하세요 (한방단어 금지)';
      if (data.computer) { addWord(data.computer.word, data.computer.definition, false); $('#prompt').textContent = `${startsText(data.nextStarts)}(으)로 시작하는 단어`; }
      for (const el of [$('#word'), $('#send'), $('#giveup')]) el.disabled = false;
      setTurn(turnTime * 1000); $('#word').value = ''; $('#word').focus();
    } catch (error) {
      const el = $('#setupNotice'); el.textContent = error.message || '시작하지 못했어요.'; el.classList.remove('hidden');
    } finally { $('#start').disabled = false; $('#start').textContent = '▶ 시작하기'; }
  }

  async function submit(event) {
    event.preventDefault();
    const word = $('#word').value.replace(/\s/g, '');
    if (!word || busy || over) return;
    busy = true; pausedMs = deadline ? Math.max(0, deadline - Date.now()) : null; deadline = null; // 확인하는 동안 시계 멈춤
    $('#send').disabled = true; message('📖 사전에서 확인하는 중…');
    try {
      const data = await post(`/api/word-chain/solo/${game.id}/word`, { word });
      if (over) return;
      if (!data.ok) {
        message(data.message || '쓸 수 없는 단어예요.', 'error'); beep([180], 0.15);
        setTurn(Math.max(pausedMs, 1500)); return;
      }
      addWord(data.player.word, data.player.definition, true);
      $('#score').textContent = String(data.score); $('#word').value = '';
      if (!data.computer) {
        message('');
        const teach = learnNote();
        finish(true, '', (data.oneShot ? `💥 한방단어! 컴퓨터가 이어 말할 단어가 없어요. 단어 ${data.score}개를 이었어요!` : `컴퓨터가 이어 말할 단어를 못 찾았어요. 단어 ${data.score}개를 이었어요!`) + teach);
        return;
      }
      beep([660, 880], 0.08);
      addWord(data.computer.word, data.computer.definition, false);
      if (data.finished) { oneShotLose(data.computer.word, data.score, data.computer.how); return; }
      const hint = { attack: '🌱 컴퓨터가 노리고 낸 단어 같아요… 조심!', trap: '🪤 컴퓨터가 함정을 판 것 같아요… 다음 단어를 잘 골라요!', hard: '🧩 컴퓨터가 대답하기 어려운 단어를 냈어요!' }[data.computer.how];
      if (hint) message(hint);
      if (data.checkOneShot) watchOneShot(game.id, data.computer.word);
      if (!hint) message('');
      $('#prompt').textContent = `${startsText(data.nextStarts)}(으)로 시작하는 단어`;
      setTurn(game.turnTime * 1000);
    } catch (error) {
      message(error.message || '서버에 연결하지 못했어요.', 'error'); setTurn(Math.max(pausedMs ?? 0, 1500));
    } finally {
      busy = false; if (!over) { $('#send').disabled = false; $('#word').focus(); }
    }
  }

  // 한방단어로 끝난 판은 어느 모드든 성장 컴퓨터가 배운다(기본 컴퓨터 자체는 그대로 무작위).
  const learnNote = () => (game?.mode === 'growth' ? ' 🧠 컴퓨터가 이번 판을 기억해 둘 거예요.' : ' 🌱 성장 컴퓨터가 이번 판을 배울 거예요.');
  // how: 성장 모드에서 컴퓨터가 단어를 고른 방법('memory' = 기억 노트, 'attack' = 노리고 낸 단어)
  function oneShotLose(word, score, how) {
    $('#chain').lastElementChild?.classList.add('one-shot');
    const title = how === 'memory' ? '😎 지난번에 배운 단어야!' : how === 'attack' ? '🌱 컴퓨터의 공격 성공!' : '💥 컴퓨터의 한방단어!';
    const remember = learnNote();
    finish(false, title, `'${word}'(으)로 이어 말할 단어가 사전에 없어요. 단어 ${score}개를 이었어요.${remember}`);
  }
  // 컴퓨터 단어가 한방단어인지 서버가 뒤에서 확인하는 동안 나는 계속 입력할 수 있다. 결과가 오면 그때 반응한다.
  async function watchOneShot(id, word) {
    try {
      const data = await (await fetch(`/api/word-chain/solo/${id}/one-shot`)).json();
      if (data.oneShot && !over && game?.id === id) oneShotLose(word, data.score);
    } catch { /* 확인을 못 해도 게임은 계속 */ }
  }

  // '컴퓨터 먼저'를 고르면 서버가 첫 단어를 미리 준비해 두게 한다(시작 버튼을 누르면 바로 나오게).
  function warmOpener() {
    if (document.querySelector('input[name=first]:checked').value !== 'computer') return;
    const dictionary = document.querySelector('input[name=dictionary]:checked').value;
    fetch('/api/word-chain/solo/warm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dictionary }) }).catch(() => {});
  }
  for (const input of document.querySelectorAll('input[name=first], input[name=dictionary]')) input.addEventListener('change', warmOpener);
  for (const input of document.querySelectorAll('input[name=mode], input[name=dictionary]')) input.addEventListener('change', showBrain);
  warmOpener(); showBrain();

  $('#start').onclick = start;
  $('#wordForm').addEventListener('submit', submit);
  $('#giveup').onclick = () => { if (confirm('정말 포기할까요?')) finish(false, '🏳 포기했어요'); };
  $('#again').onclick = () => { $('#resultDialog').close(); $('#game').classList.add('hidden'); $('#setup').classList.remove('hidden'); $('#dictBadge').classList.add('hidden'); $('#brainBadge').classList.add('hidden'); game = null; showBrain(); };
  $('#closeResult').onclick = () => $('#resultDialog').close();
})();
