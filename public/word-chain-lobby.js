(() => {
  const $ = (s) => document.querySelector(s); const socket = io();
  const userId = () => {
    let id = localStorage.getItem('wordchain:userId');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('wordchain:userId', id); }
    return id;
  };
  const setNotice = (element, message, type = '') => { element.textContent = message; element.className = `notice songcatch-lobby-notice ${type}`; element.classList.toggle('hidden', !message); };
  $('#nickname').value = localStorage.getItem('wordchain:nickname') || '';
  const exitNotice = sessionStorage.getItem('wordchain:exitNotice'); sessionStorage.removeItem('wordchain:exitNotice');
  if (exitNotice) setNotice($('#notice'), exitNotice, 'success');
  const updateNicknameCount = () => { $('#nicknameCount').textContent = `${Array.from($('#nickname').value).length}/30`; };
  updateNicknameCount(); $('#nickname').addEventListener('input', updateNicknameCount);

  function identity() {
    const value = $('#nickname').value.trim();
    if (!value) throw new Error('닉네임을 입력해 주세요.');
    localStorage.setItem('wordchain:nickname', value);
    return { nickname: value, userId: userId() };
  }
  const openDialog = (dialog) => {
    try { identity(); setNotice($('#notice'), ''); if (dialog.open) dialog.close(); dialog.showModal(); }
    catch (error) { setNotice($('#notice'), error.message, 'error'); $('#nickname').focus(); }
  };
  $('#openCreate').onclick = () => openDialog($('#createDialog'));
  $('#openRooms').onclick = () => { openDialog($('#roomsDialog')); socket.emit('wc:rooms:list'); };
  $('#openCode').onclick = () => openDialog($('#codeDialog'));
  for (const button of document.querySelectorAll('.music-modal-close')) button.onclick = () => button.closest('dialog').close();
  for (const dialog of document.querySelectorAll('.music-lobby-modal')) dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  socket.on('connect', () => { $('#connectionStatus').textContent = '● 서버 연결됨'; $('#connectionStatus').classList.add('connected'); });
  socket.on('disconnect', () => { $('#connectionStatus').textContent = '● 서버 연결 끊김'; $('#connectionStatus').classList.remove('connected'); });

  function enter(code) { location.href = `/word-chain/room?code=${encodeURIComponent(code)}`; }
  function emit(event, data) {
    return new Promise((resolve, reject) => socket.emit(event, data, (result) => result?.ok ? resolve(result) : reject(new Error(result?.message || '요청에 실패했습니다.'))));
  }

  let publicRooms = [];
  function render() {
    const root = $('#rooms'); root.replaceChildren();
    const query = $('#roomSearch').value.trim().toLocaleLowerCase('ko-KR');
    const rooms = publicRooms
      .filter((room) => !query || room.title.toLocaleLowerCase('ko-KR').includes(query))
      .filter((room) => !$('#joinableOnly').checked || room.canJoin)
      .sort((a, b) => $('#roomSort').value === 'players' ? b.playerCount - a.playerCount : b.createdAt - a.createdAt);
    if (!rooms.length) {
      const empty = document.createElement('div'); empty.className = 'music-empty-state';
      const icon = document.createElement('span'); icon.textContent = '🔤';
      const title = document.createElement('b'); title.textContent = '조건에 맞는 공개 방이 없어요.';
      const help = document.createElement('small'); help.textContent = '새 방을 만들어 친구들을 불러 보세요!';
      empty.append(icon, title, help); root.append(empty); return;
    }
    for (const room of rooms) {
      const card = document.createElement('article'); card.className = 'music-room-card';
      const main = document.createElement('div'); main.className = 'music-room-card-main';
      const status = document.createElement('span'); status.className = `music-status-pill ${room.state === 'playing' ? 'playing' : 'waiting'}`;
      status.textContent = room.state === 'playing' ? '게임 중' : '대기 중';
      const title = document.createElement('h3'); title.textContent = room.title;
      const meta = document.createElement('p'); const host = document.createElement('b'); host.textContent = room.hostNickname || '알 수 없음';
      meta.append('방장 ', host, ` · ${room.dictionaryName} · 차례 ${room.turnTime ? `${room.turnTime}초` : '제한 없음'}`); main.append(status, title, meta);
      const side = document.createElement('div'); side.className = 'music-room-card-side';
      const count = document.createElement('strong'); count.textContent = `👥 ${room.playerCount}/${room.maxPlayers}`;
      const button = document.createElement('button'); button.className = `music-compact ${room.canJoin ? 'primary' : 'secondary'}`;
      button.textContent = room.canJoin ? '입장' : '입장 불가'; button.disabled = !room.canJoin;
      button.onclick = async () => { try { const result = await emit('wc:room:join', { ...identity(), code: room.code }); enter(result.code); } catch (error) { setNotice($('#notice'), error.message, 'error'); } };
      side.append(count, button); card.append(main, side); root.append(card);
    }
  }
  socket.on('wc:rooms:list', (rooms) => { publicRooms = rooms; render(); });
  socket.emit('wc:rooms:list'); $('#refresh').onclick = () => socket.emit('wc:rooms:list');
  for (const element of [$('#roomSearch'), $('#roomSort'), $('#joinableOnly')]) element.addEventListener('input', render);

  $('#create').onclick = async () => {
    try {
      const result = await emit('wc:room:create', { ...identity(), title: $('#title').value, maxPlayers: Number($('#maxPlayers').value),
        turnTime: Number($('#turnTime').value), isPublic: $('#isPublic').checked,
        dictionary: document.querySelector('input[name=dictionary]:checked').value });
      enter(result.code);
    } catch (error) { setNotice($('#notice'), error.message, 'error'); }
  };
  $('#join').onclick = async () => { try { const result = await emit('wc:room:join', { ...identity(), code: $('#code').value }); enter(result.code); } catch (error) { setNotice($('#notice'), error.message, 'error'); } };
})();
