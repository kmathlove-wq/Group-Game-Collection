(() => {
  const $ = (s) => document.querySelector(s); const { json, setNotice } = MusicCommon;
  let sessionId = ''; let challenge; let segmentTimer;
  const audio = $('#audio');
  async function loadOptions() {
    const data = await json('/api/music/options');
    for (const genre of data.genres) $('#genre').add(new Option(genre, genre));
    for (const difficulty of data.difficulties) $('#difficulty').add(new Option(difficulty, difficulty));
    for (const set of data.sets.filter((item) => item.useInSolo)) $('#setId').add(new Option(`${set.name} (${set.songCount}곡)`, set.id));
  }
  function play() {
    clearTimeout(segmentTimer); audio.src = `/api/music/audio/${encodeURIComponent(challenge.audioToken)}`;
    audio.addEventListener('loadedmetadata', () => { audio.currentTime = challenge.startTime; audio.play().then(() => $('#disc').classList.add('playing')).catch(() => {}); segmentTimer = setTimeout(() => { audio.pause(); $('#disc').classList.remove('playing'); }, challenge.duration * 1000); }, { once: true });
  }
  function render(item) {
    challenge = item; if (item.finished) { $('#game').innerHTML = `<h1>게임 완료!</h1><p class="lead">${item.correctCount} / ${item.total}문제 정답</p><h2>${item.score}점</h2><a class="primary" href="/music/solo">다시 도전</a>`; return; }
    $('#round').textContent = `${item.round} / ${item.total}`; document.querySelectorAll('.stage-dots i').forEach((dot, i) => dot.classList.toggle('on', i < item.stage));
    $('#prompt').textContent = item.answerMode === 'artist' ? '가수는 누구일까요?' : item.answerMode === 'both' ? '노래 제목과 가수는?' : '노래 제목은 무엇일까요?';
    $('#artistAnswer').classList.toggle('hidden', item.answerMode !== 'both'); $('#textAnswer').classList.toggle('hidden', item.inputType === 'choice'); $('#choices').classList.toggle('hidden', item.inputType !== 'choice');
    $('#choices').replaceChildren(); for (const choice of item.choices || []) { const button = document.createElement('button'); button.className = 'choice'; button.textContent = choice; button.onclick = () => submit({ value: choice }); $('#choices').append(button); }
    $('#answer').value = ''; $('#artistAnswer').value = ''; setNotice($('#result'), ''); $('#next').classList.add('hidden'); $('#skip').classList.remove('hidden'); $('#submit').disabled = false; play();
  }
  async function submit(choice) {
    const payload = choice || { value: $('#answer').value, title: $('#answer').value, artist: $('#artistAnswer').value };
    try { const data = await json('/api/music/solo/answer', { method: 'POST', body: JSON.stringify({ sessionId, ...payload }) });
      if (data.correct || data.answer) { setNotice($('#result'), data.correct ? `정답! +${data.points}점 · ${data.answer.title} — ${data.answer.artist}` : `정답은 ${data.answer.title} — ${data.answer.artist}`, data.correct ? 'success' : 'error'); $('#score').textContent = `${data.score}점`; $('#next').classList.remove('hidden'); $('#skip').classList.add('hidden'); $('#submit').disabled = true; audio.pause(); }
      else { setNotice($('#result'), '아쉬워요. 더 긴 구간을 들어 보세요.', 'error'); render(data.nextHint); }
    } catch (error) { setNotice($('#result'), error.message, 'error'); }
  }
  $('#answerMode').onchange = () => { if ($('#answerMode').value === 'both') $('#inputType').value = 'text'; $('#inputType').disabled = $('#answerMode').value === 'both'; };
  $('#start').onclick = async () => { try { const data = await json('/api/music/solo/start', { method: 'POST', body: JSON.stringify({ answerMode: $('#answerMode').value, inputType: $('#inputType').value, count: $('#count').value, setId: $('#setId').value, genre: $('#genre').value, difficulty: $('#difficulty').value }) }); sessionId = data.sessionId; $('#setup').classList.add('hidden'); $('#game').classList.remove('hidden'); render(data.challenge); } catch (error) { setNotice($('#setupNotice'), error.message, 'error'); } };
  $('#submit').onclick = () => submit(); $('#answer').onkeydown = (event) => { if (event.key === 'Enter') submit(); }; $('#replay').onclick = play;
  $('#skip').onclick = async () => { const data = await json('/api/music/solo/skip', { method: 'POST', body: JSON.stringify({ sessionId }) }); setNotice($('#result'), `정답은 ${data.answer.title} — ${data.answer.artist}`, 'error'); $('#next').classList.remove('hidden'); $('#skip').classList.add('hidden'); };
  $('#next').onclick = async () => { const data = await json('/api/music/solo/next', { method: 'POST', body: JSON.stringify({ sessionId }) }); render(data.challenge); };
  loadOptions().catch((error) => setNotice($('#setupNotice'), error.message, 'error'));
})();
