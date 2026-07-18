(() => {
  const $ = (s) => document.querySelector(s); const socket = io(); const common = MusicCommon; const code = new URLSearchParams(location.search).get('code')?.toUpperCase();
  const me = { userId: common.userId(), nickname: common.nickname(), code }; let state; let stopTimer;
  if (!code || !me.nickname) location.replace('/music/lobby'); $('#roomCode').textContent = code || '';
  function emit(event, data) { return new Promise((resolve, reject) => socket.emit(event, data, (result) => result?.ok ? resolve(result) : reject(new Error(result?.message || result?.error || '요청 실패')))); }
  function notice(message, type = '') { common.setNotice($('#result'), message, type); }
  function addChat(message) { const p = document.createElement('p'); p.className = message.type || ''; p.textContent = message.type === 'chat' ? `${message.nickname}: ${message.text}` : message.points ? `${message.text} (+${message.points}점)` : message.text; $('#chat').append(p); $('#chat').scrollTop = $('#chat').scrollHeight; }
  function render(room) {
    state = room; $('#roomTitle').textContent = room.title; document.title = `${room.title} · 그룹 게임 컬렉션-송캐치`; $('#players').replaceChildren();
    for (const player of room.players) { const tag = document.createElement('span'); tag.className = `player ${player.hasGuessed ? 'guessed' : ''}`; tag.textContent = `${player.isHost ? '👑 ' : ''}${player.nickname} · ${player.score}점${player.ready ? ' ✓' : ''}`; $('#players').append(tag); }
    const mine = room.players.find((p) => p.userId === me.userId); const host = room.hostId === me.userId;
    $('#playerCount').textContent = `${room.playerCount}/${room.maxPlayers}`; $('#roundLabel').textContent = room.state === 'waiting' ? '대기실' : `${room.round} / ${room.totalRounds}`;
    $('#start').classList.toggle('hidden', !host); $('#closeRoom').classList.toggle('hidden', !host); $('#ready').classList.toggle('hidden', host || room.state !== 'waiting'); $('#ready').textContent = mine?.ready ? '준비 취소' : '준비';
    $('#answerArea').classList.toggle('hidden', room.state !== 'playing' || mine?.hasGuessed); $('#artist').classList.toggle('hidden', room.answerMode !== 'both'); $('#chatInput').disabled = Boolean(mine?.hasGuessed && room.state === 'playing');
    if (room.state === 'waiting') { $('#status').textContent = '친구들을 기다리는 중'; $('#statusMessage').textContent = '모두 준비하면 방장이 시작해요!'; $('#stage').textContent = '--'; $('#quizTitle').textContent = '모두 준비하면 방장이 시작해요'; }
    if (room.state === 'roundResult') { $('#status').textContent = '정답 공개'; $('#statusMessage').textContent = '잠시 후 다음 문제가 시작됩니다.'; $('#stage').textContent = '결과'; }
    if (room.state === 'finished') { $('#status').textContent = '게임 종료'; $('#statusMessage').textContent = '최종 순위를 확인해 보세요.'; $('#stage').textContent = '완료'; }
  }
  socket.on('connect', () => emit('music:room:join', me).catch((error) => { sessionStorage.setItem('music:exitNotice', error.message); location.replace('/music/lobby'); }));
  socket.on('music:room:state', render); socket.on('music:chat:message', addChat); socket.on('music:admin:announcement', (data) => addChat({ type: 'system', text: `[관리자] ${data.text}` }));
  socket.on('music:room:closed', (data) => { sessionStorage.setItem('music:exitNotice', data?.message || '방장이 방을 종료했습니다.'); location.replace('/music/lobby'); });
  socket.on('music:playback', (data) => { clearTimeout(stopTimer); $('#roundLabel').textContent = `${data.round} / ${data.totalRounds}`; $('#status').textContent = '음악을 듣는 중'; $('#statusMessage').textContent = '누구보다 빠르게 정답을 맞혀 보세요!'; $('#stage').textContent = `${data.stage}단계 · ${data.duration}초`; $('#quizTitle').textContent = state?.answerMode === 'artist' ? '가수를 맞혀 보세요!' : state?.answerMode === 'both' ? '제목과 가수를 맞혀 보세요!' : '노래 제목을 맞혀 보세요!'; $('#answerArea').classList.remove('hidden');
    const audio = $('#audio'); audio.src = `/api/music/audio/${encodeURIComponent(data.audioToken)}`; audio.load(); const delay = Math.max(0, data.playAt - Date.now()); setTimeout(() => { audio.currentTime = data.startTime; audio.play().then(() => $('#disc').classList.add('playing')).catch(() => notice('브라우저의 재생 버튼을 한 번 눌러 주세요.', 'error')); stopTimer = setTimeout(() => { audio.pause(); $('#disc').classList.remove('playing'); }, data.duration * 1000); }, delay); });
  socket.on('music:round:ended', (data) => { $('#audio').pause(); $('#disc').classList.remove('playing'); $('#answerArea').classList.add('hidden'); notice(`정답: ${data.answer.title} — ${data.answer.artist}`, 'success'); });
  socket.on('music:game:finished', (data) => { const winner = data.ranking[0]; $('#quizTitle').textContent = winner ? `🏆 ${winner.nickname} 우승!` : '게임 종료'; $('#stage').textContent = winner ? `${winner.score}점` : ''; $('#answerArea').classList.add('hidden'); });
  $('#ready').onclick = () => { const mine = state.players.find((p) => p.userId === me.userId); emit('music:room:ready', !mine.ready).catch((e) => notice(e.message, 'error')); }; $('#start').onclick = () => emit('music:game:start', {}).catch((e) => notice(e.message, 'error'));
  async function answer() { try { const value = $('#answer').value; const result = await emit('music:answer', { value, title: value, artist: $('#artist').value }); if (!result.correct) notice('정답이 아니에요.', 'error'); $('#answer').value = ''; $('#artist').value = ''; } catch (e) { notice(e.message, 'error'); } }
  $('#answerButton').onclick = answer; $('#answer').onkeydown = (event) => { if (event.key === 'Enter') answer(); };
  $('#copyCode').onclick = async () => { try { await navigator.clipboard.writeText(code); notice('방 코드를 복사했습니다.', 'success'); } catch { notice(`방 코드: ${code}`, 'success'); } };
  $('#closeRoom').onclick = () => { if (confirm('정말 이 방을 종료할까요? 모든 참가자가 로비로 이동합니다.')) emit('music:room:close', {}).catch((error) => notice(error.message, 'error')); };
  async function chat() { const value = $('#chatInput').value; try { await emit('music:chat:send', { text: value }); $('#chatInput').value = ''; } catch (e) { notice(e.message, 'error'); } } $('#chatSend').onclick = chat; $('#chatInput').onkeydown = (event) => { if (event.key === 'Enter') chat(); };
  $('#leave').onclick = async () => { await emit('music:room:leave', {}).catch(() => {}); location.href = '/music/lobby'; };
})();
