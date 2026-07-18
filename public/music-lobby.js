(() => {
  const $ = (s) => document.querySelector(s); const socket = io(); const { userId, nickname, saveNickname, setNotice } = MusicCommon;
  $('#nickname').value = nickname();
  MusicCommon.json('/api/music/options').then((data) => { for (const set of data.sets.filter((item) => item.useInGroup)) $('#setId').add(new Option(`${set.name} (${set.songCount}곡)`, set.id)); }).catch(() => {});
  function identity() { const value = $('#nickname').value.trim(); if (!value) throw new Error('닉네임을 입력해 주세요.'); saveNickname(value); return { nickname: value, userId: userId() }; }
  function enter(code) { location.href = `/music/room?code=${encodeURIComponent(code)}`; }
  function emit(event, data) { return new Promise((resolve, reject) => socket.emit(event, data, (result) => result?.ok ? resolve(result) : reject(new Error(result?.message || '요청에 실패했습니다.')))); }
  function render(rooms) {
    const root = $('#rooms'); root.replaceChildren();
    if (!rooms.length) { const empty = document.createElement('p'); empty.className = 'lead'; empty.textContent = '지금 열린 공개 방이 없습니다.'; root.append(empty); }
    for (const room of rooms) { const row = document.createElement('div'); row.className = 'room-item'; const info = document.createElement('div'); const title = document.createElement('b'); title.textContent = room.title; const meta = document.createElement('small'); meta.textContent = ` ${room.playerCount}/${room.maxPlayers}명 · ${room.state === 'waiting' ? '대기 중' : '게임 중'}`; info.append(title, document.createElement('br'), meta); const button = document.createElement('button'); button.className = 'primary'; button.textContent = '입장'; button.disabled = !room.canJoin; button.onclick = async () => { try { const result = await emit('music:room:join', { ...identity(), code: room.code }); enter(result.code); } catch (error) { setNotice($('#notice'), error.message, 'error'); } }; row.append(info, button); root.append(row); }
  }
  socket.on('music:rooms:list', render); socket.emit('music:rooms:list'); $('#refresh').onclick = () => socket.emit('music:rooms:list');
  $('#create').onclick = async () => { try { const result = await emit('music:room:create', { ...identity(), title: $('#title').value, maxPlayers: $('#maxPlayers').value, totalRounds: $('#totalRounds').value, setId: $('#setId').value, answerMode: $('#answerMode').value, isPublic: $('#isPublic').checked, allowLateJoin: $('#allowLateJoin').checked }); enter(result.code); } catch (error) { setNotice($('#notice'), error.message, 'error'); } };
  $('#join').onclick = async () => { try { const result = await emit('music:room:join', { ...identity(), code: $('#code').value }); enter(result.code); } catch (error) { setNotice($('#notice'), error.message, 'error'); } };
})();
