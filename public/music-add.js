// 🎵 송캐치 노래 추가: 누구나 올리고, 올린 노래는 모든 사람의 문제로 나온다(서버 POST /api/music/songs).
(() => {
  const $ = (id) => document.getElementById(id);
  const form = $('addForm');
  const player = $('player');
  let duration = 0; // 노래 전체 길이(초) — 브라우저가 파일을 읽어 알아낸다
  let stopTimer = 0;

  try { $('uploader').value = localStorage.getItem('catchmind:nickname') || ''; } catch { /* 저장소를 못 써도 됨 */ }
  fetch('/api/music/songs/count').then((r) => r.json()).then((d) => { $('songCount').textContent = `(지금 ${d.total}곡)`; }).catch(() => {});

  function notice(text, kind = 'error') {
    const el = $('notice');
    el.textContent = text;
    el.className = `notice ${kind}`;
  }

  $('audio').addEventListener('change', () => {
    const file = $('audio').files[0];
    duration = 0;
    $('listen').disabled = $('useNow').disabled = true;
    if (!file) { player.classList.add('hidden'); return; }
    if (player.src) URL.revokeObjectURL(player.src);
    player.src = URL.createObjectURL(file);
    player.classList.remove('hidden');
    player.onloadedmetadata = () => {
      duration = player.duration;
      $('startTime').max = Math.max(0, duration - 10).toFixed(1);
      $('listen').disabled = $('useNow').disabled = false;
    };
    player.onerror = () => notice('이 파일은 노래로 읽을 수 없어요. 다른 파일을 골라 주세요.');
  });

  $('listen').addEventListener('click', () => {
    clearTimeout(stopTimer);
    player.currentTime = Number($('startTime').value) || 0;
    player.play().catch(() => {});
    stopTimer = setTimeout(() => player.pause(), 3000);
  });
  $('useNow').addEventListener('click', () => { $('startTime').value = player.currentTime.toFixed(1); });

  let sending = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending) return;
    if (!duration) { notice('노래 파일을 읽는 중이에요. 잠시 뒤 다시 눌러 주세요.'); return; }
    const start = Number($('startTime').value) || 0;
    if (start + 10 > duration) { notice(`시작 위치부터 10초를 들을 수 있어야 해요. ${Math.max(0, duration - 10).toFixed(1)}초보다 앞으로 해 주세요.`); return; }
    const data = new FormData(form);
    data.set('duration', duration.toFixed(2));
    data.set('copyrightConfirmed', String($('copyrightConfirmed').checked));
    sending = true;
    $('submit').disabled = true;
    $('submit').textContent = '올리는 중…';
    try {
      const response = await fetch('/api/music/songs', { method: 'POST', body: data });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || result.error || '노래를 올리지 못했어요.');
      try { localStorage.setItem('catchmind:nickname', $('uploader').value.trim()); } catch { /* 괜찮음 */ }
      notice(`🎉 「${result.song.title} - ${result.song.artist}」을(를) 올렸어요! 이제 모두의 문제로 나와요.`, 'success');
      const keepName = $('uploader').value;
      form.reset();
      $('uploader').value = keepName;
      player.pause();
      player.classList.add('hidden');
      duration = 0;
      $('listen').disabled = $('useNow').disabled = true;
      fetch('/api/music/songs/count').then((r) => r.json()).then((d) => { $('songCount').textContent = `(지금 ${d.total}곡)`; }).catch(() => {});
    } catch (error) {
      notice(error.message);
    } finally {
      sending = false;
      $('submit').disabled = false;
      $('submit').textContent = '노래 올리기';
    }
  });
})();
