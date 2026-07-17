const socket = io();

const elements = {
  nickname: document.querySelector('#nickname'), nicknameCount: document.querySelector('#nicknameCount'),
  connectionStatus: document.querySelector('#connectionStatus'), toast: document.querySelector('#toast'),
  createDialog: document.querySelector('#createDialog'), roomsDialog: document.querySelector('#roomsDialog'),
  codeDialog: document.querySelector('#codeDialog'), howToDialog: document.querySelector('#howToDialog'),
  roomList: document.querySelector('#roomList'), roomSearch: document.querySelector('#roomSearch'),
  roomSort: document.querySelector('#roomSort'), joinableOnly: document.querySelector('#joinableOnly')
};

let rooms = [];
const userId = getOrCreateUserId();
elements.nickname.value = localStorage.getItem('catchmind:nickname') || '';
updateNicknameCount();

function getOrCreateUserId() {
  let id = localStorage.getItem('catchmind:userId');
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem('catchmind:userId', id);
  }
  return id;
}

function validateNickname() {
  const nickname = elements.nickname.value.trim();
  if (!nickname) return showToast('닉네임을 입력해 주세요.'), null;
  if ([...nickname].length > 30) return showToast('닉네임은 최대 30자까지 입력할 수 있어요.'), null;
  localStorage.setItem('catchmind:nickname', nickname);
  return nickname;
}

function updateNicknameCount() {
  elements.nicknameCount.textContent = `${[...elements.nickname.value].length}/30`;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove('show'), 3200);
}

const roomExitNotice = sessionStorage.getItem('catchmind:exitNotice');
if (roomExitNotice) {
  sessionStorage.removeItem('catchmind:exitNotice');
  // 화면이 그려진 뒤 알림이 자연스럽게 나타나도록 한 프레임 기다린다.
  requestAnimationFrame(() => showToast(roomExitNotice));
}

function enterRoom(code) {
  sessionStorage.setItem('catchmind:roomCode', code);
  location.href = `/room.html?code=${encodeURIComponent(code)}`;
}

function joinRoom(code) {
  const nickname = validateNickname();
  if (!nickname) return;
  socket.emit('room:join', { code, userId, nickname }, (result) => {
    if (!result?.ok) return showToast(result?.error || '방에 입장하지 못했습니다.');
    enterRoom(result.code);
  });
}

function renderRooms() {
  const query = elements.roomSearch.value.trim().toLocaleLowerCase('ko-KR');
  const filtered = rooms
    .filter((room) => !query || room.title.toLocaleLowerCase('ko-KR').includes(query))
    .filter((room) => !elements.joinableOnly.checked || room.canJoin)
    .sort((a, b) => elements.roomSort.value === 'players' ? b.playerCount - a.playerCount : b.createdAt - a.createdAt);
  if (!filtered.length) {
    elements.roomList.innerHTML = '<div class="empty-state"><span>🪁</span><b>조건에 맞는 공개 방이 없어요.</b><small>새 방을 만들어 친구들을 불러 보세요!</small></div>';
    return;
  }
  elements.roomList.replaceChildren(...filtered.map((room) => {
    const card = document.createElement('article');
    card.className = 'room-card';
    const status = room.state === 'waiting' ? '대기 중' : '게임 중';
    card.innerHTML = `<div class="room-card-main"><span class="status-pill ${room.state}">${status}</span><h3></h3><p>방장 <b></b> · ${room.roundTime}초</p></div><div class="room-card-side"><strong>👥 ${room.playerCount}/${room.maxPlayers}</strong><button class="button compact ${room.canJoin ? 'primary' : ''}" ${room.canJoin ? '' : 'disabled'}>${room.canJoin ? '입장' : '입장 불가'}</button></div>`;
    card.querySelector('h3').textContent = room.title;
    card.querySelector('p b').textContent = room.hostNickname;
    card.querySelector('button').addEventListener('click', () => joinRoom(room.code));
    return card;
  }));
}

socket.on('connect', () => {
  elements.connectionStatus.textContent = '● 서버 연결됨';
  elements.connectionStatus.classList.add('connected');
  socket.emit('rooms:request');
});
socket.on('disconnect', () => {
  elements.connectionStatus.textContent = '○ 연결이 끊겼습니다. 재연결 중…';
  elements.connectionStatus.classList.remove('connected');
});
socket.on('rooms:list', (nextRooms) => { rooms = nextRooms; renderRooms(); });

elements.nickname.addEventListener('input', updateNicknameCount);
document.querySelector('#createRoomButton').addEventListener('click', () => { if (validateNickname()) elements.createDialog.showModal(); });
document.querySelector('#browseRoomsButton').addEventListener('click', () => { if (validateNickname()) { socket.emit('rooms:request'); elements.roomsDialog.showModal(); } });
document.querySelector('#joinCodeButton').addEventListener('click', () => { if (validateNickname()) elements.codeDialog.showModal(); });
document.querySelector('#howToButton').addEventListener('click', () => elements.howToDialog.showModal());
document.querySelectorAll('.close-modal').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); }));

document.querySelector('#createForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const nickname = validateNickname();
  if (!nickname) return;
  const data = new FormData(event.currentTarget);
  const settings = {
    title: data.get('title'), maxPlayers: Number(data.get('maxPlayers')), isPublic: data.get('isPublic') === 'true',
    roundTime: Number(data.get('roundTime')), totalRounds: Number(data.get('totalRounds')),
    showWordLength: data.has('showWordLength'), hintsEnabled: data.has('hintsEnabled'), allowLateJoin: data.has('allowLateJoin'),
    hostParticipates: data.has('hostParticipates')
  };
  socket.emit('room:create', { userId, nickname, settings }, (result) => {
    if (!result?.ok) return showToast(result?.error || '방을 만들지 못했습니다.');
    enterRoom(result.code);
  });
});

document.querySelector('#codeForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const code = new FormData(event.currentTarget).get('code').trim().toUpperCase();
  if (code.length !== 6) return showToast('6자리 방 코드를 입력해 주세요.');
  joinRoom(code);
});

document.querySelector('.code-input').addEventListener('input', (event) => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
document.querySelector('#refreshRooms').addEventListener('click', () => socket.emit('rooms:request'));
[elements.roomSearch, elements.roomSort, elements.joinableOnly].forEach((element) => element.addEventListener('input', renderRooms));
