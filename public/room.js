const socket = io({ reconnection: true, reconnectionAttempts: Infinity, reconnectionDelayMax: 3000 });
const params = new URLSearchParams(location.search);
const roomCode = (params.get('code') || sessionStorage.getItem('catchmind:roomCode') || '').toUpperCase();
const userId = localStorage.getItem('catchmind:userId');
const nickname = localStorage.getItem('catchmind:nickname');

if (!roomCode || !userId || !nickname) location.replace('/');

const $ = (selector) => document.querySelector(selector);
const elements = {
  roomTitle: $('#roomTitle'), roomCode: $('#roomCode'), socketStatus: $('#socketStatus'), toast: $('#toast'),
  playerCount: $('#playerCount'), playerList: $('#playerList'), readyButton: $('#readyButton'), startButton: $('#startButton'),
  restartButton: $('#restartButton'), lobbyButton: $('#lobbyButton'), settingsButton: $('#settingsButton'),
  closeRoomLobbyButton: $('#closeRoomLobbyButton'), playersPanel: $('#playersPanel'), tabletLobbyButton: $('#tabletLobbyButton'),
  tabletLobbyClose: $('#tabletLobbyClose'), tabletLobbyBackdrop: $('#tabletLobbyBackdrop'), tabletPlayerCount: $('#tabletPlayerCount'),
  roundLabel: $('#roundLabel'), statusLabel: $('#statusLabel'), hintLabel: $('#hintLabel'), timerLabel: $('#timerLabel'),
  canvas: $('#drawingCanvas'), canvasOverlay: $('#canvasOverlay'), drawerTools: $('#drawerTools'), spectatorNotice: $('#spectatorNotice'),
  chatMessages: $('#chatMessages'), chatForm: $('#chatForm'), chatInput: $('#chatInput'), roundDialog: $('#roundDialog'),
  settingsDialog: $('#settingsDialog'), resultDialog: $('#resultDialog'), resultContent: $('#resultContent'), drawerSelect: $('#drawerSelect'),
  playerActionMenu: $('#playerActionMenu'), playerActionName: $('#playerActionName'), participationNote: $('#hostParticipationNote'),
  customWordList: $('[name="customWordList"]'), customWordCount: $('#customWordCount')
};

let room = null;
let secretAnswer = '';
let muted = localStorage.getItem('catchmind:muted') === 'true';
let timerWarningPlayed = false;
let knownChatIds = new Set();
let drawingActions = [];
let pendingRender = [];
let isDrawing = false;
let currentStrokeId = '';
let lastPoint = null;
let pendingSegments = [];
let sendTimer = null;
let selectedTool = 'pen';
let selectedColor = '#2d3436';
let selectedWidth = 6;
let selectedManagedPlayer = null;
const ctx = elements.canvas.getContext('2d');

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove('show'), 3200);
}

function emitAck(event, payload = {}, onSuccess) {
  socket.emit(event, payload, (result) => {
    if (!result?.ok) return showToast(result?.error || '요청을 처리하지 못했습니다.');
    onSuccess?.(result);
  });
}

function returnHomeWithNotice(message) {
  sessionStorage.removeItem('catchmind:roomCode');
  sessionStorage.setItem('catchmind:exitNotice', message);
  location.replace('/');
}

function me() { return room?.players.find((player) => player.userId === userId); }
function isHost() { return room?.hostId === userId; }
function isDrawer() { return room?.game.drawerId === userId && room?.state === 'playing'; }

function stateLabel(state) {
  return { waiting: '대기실', playing: '게임 중', roundResult: '라운드 결과', finished: '게임 종료' }[state] || state;
}

function renderRoom() {
  if (!room) return;
  const self = me();
  elements.roomTitle.textContent = room.settings.title;
  elements.roomCode.textContent = room.code;
  elements.playerCount.textContent = `${room.players.length}/${room.settings.maxPlayers}`;
  elements.tabletPlayerCount.textContent = room.players.length;
  elements.roundLabel.textContent = room.state === 'waiting' ? '대기실' : `${room.game.round} / ${room.game.totalRounds}`;
  document.title = `${room.settings.title} · 두들팡 | 그룹 게임 컬렉션`;

  document.querySelectorAll('.host-only').forEach((element) => element.classList.toggle('hidden', !isHost()));
  elements.readyButton.classList.toggle('hidden', room.state !== 'waiting' || isHost());
  elements.readyButton.textContent = self?.ready ? '✓ 준비 완료' : '✓ 준비하기';
  elements.readyButton.classList.toggle('ready', Boolean(self?.ready));
  elements.startButton.classList.toggle('hidden', !isHost() || !['waiting', 'roundResult'].includes(room.state));
  elements.startButton.textContent = room.state === 'roundResult' ? '▶ 다음 라운드' : '▶ 게임 시작';
  elements.restartButton.classList.toggle('hidden', !isHost() || room.state !== 'finished');
  elements.lobbyButton.classList.toggle('hidden', !isHost() || room.state !== 'finished');
  elements.settingsButton.classList.toggle('hidden', !isHost() || room.state === 'playing');
  elements.closeRoomLobbyButton.classList.toggle('hidden', !isHost() || room.state !== 'waiting');

  renderPlayers();
  renderChatHistory();
  renderGameStatus();
  updateCanvasAccess();
  updateRoundForm();
}

function renderPlayers() {
  const sorted = [...room.players].sort((a, b) => b.score - a.score || Number(b.isHost) - Number(a.isHost));
  elements.playerList.replaceChildren(...sorted.map((player, index) => {
    const item = document.createElement('div');
    item.className = `player-item ${player.userId === userId ? 'me' : ''} ${!player.connected ? 'offline' : ''}`;
    const avatar = document.createElement('span');
    avatar.className = 'player-avatar';
    avatar.textContent = ['🐣', '🐰', '🐻', '🐸', '🦊', '🐼'][index % 6];
    const info = document.createElement('div');
    info.className = 'player-info';
    const name = document.createElement('strong');
    name.textContent = player.nickname;
    const badges = document.createElement('small');
    badges.textContent = [player.isHost && '👑 방장', player.isHost && (room.settings.hostParticipates ? '🎮 게임 참여' : '👁 진행 전용'), player.isDrawer && '✏️ 출제자', player.hasGuessed && '✅ 정답', !player.connected && '재접속 대기', room.state === 'waiting' && player.ready && '준비 완료'].filter(Boolean).join(' · ') || (player.userId === userId ? '나' : '참가자');
    info.append(name, badges);
    const score = document.createElement('b');
    score.className = 'player-score';
    score.textContent = `${player.score}점`;
    item.append(avatar, info, score);
    if (isHost() && player.userId !== userId) {
      const menu = document.createElement('button');
      menu.className = 'player-menu'; menu.textContent = '⋮'; menu.title = '참가자 관리';
      menu.addEventListener('click', (event) => {
        event.stopPropagation();
        openPlayerMenu(player, event.currentTarget);
      });
      item.append(menu);
    }
    return item;
  }));
}

function setTabletLobby(open) {
  elements.playersPanel.classList.toggle('tablet-open', open);
  elements.tabletLobbyBackdrop.classList.toggle('open', open);
  elements.tabletLobbyButton.setAttribute('aria-expanded', String(open));
  if (open) elements.tabletLobbyClose.focus();
}

function openPlayerMenu(player, anchor) {
  selectedManagedPlayer = player;
  elements.playerActionName.textContent = player.nickname;
  elements.playerActionMenu.classList.remove('hidden');

  const anchorRect = anchor.getBoundingClientRect();
  const menuRect = elements.playerActionMenu.getBoundingClientRect();
  const viewportPadding = 8;
  const left = Math.min(
    window.innerWidth - menuRect.width - viewportPadding,
    Math.max(viewportPadding, anchorRect.right - menuRect.width)
  );
  let top = anchorRect.bottom + 6;
  if (top + menuRect.height > window.innerHeight - viewportPadding) {
    top = anchorRect.top - menuRect.height - 6;
  }
  elements.playerActionMenu.style.left = `${left}px`;
  elements.playerActionMenu.style.top = `${Math.max(viewportPadding, top)}px`;
}

function closePlayerMenu() {
  elements.playerActionMenu.classList.add('hidden');
  selectedManagedPlayer = null;
}

function appendChat(message) {
  if (!message?.id || knownChatIds.has(message.id)) return;
  knownChatIds.add(message.id);
  const row = document.createElement('div');
  row.className = `chat-row ${message.type}`;
  if (message.type === 'system') {
    const text = document.createElement('span'); text.textContent = message.text; row.append(text);
  } else {
    const name = document.createElement('b'); name.textContent = message.nickname;
    const text = document.createElement('span'); text.textContent = message.text;
    row.append(name, text);
  }
  elements.chatMessages.append(row);
  while (elements.chatMessages.children.length > 100) elements.chatMessages.firstElementChild.remove();
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function renderChatHistory() { room.chat.forEach(appendChat); }

function renderGameStatus() {
  const game = room.game;
  elements.canvasOverlay.classList.toggle('hidden', room.state === 'playing');
  if (room.state === 'waiting') {
    elements.statusLabel.textContent = '친구들을 기다리는 중';
    elements.hintLabel.textContent = '모두 모이면 방장이 시작해요!';
    elements.timerLabel.textContent = '--';
  } else if (room.state === 'playing') {
    const drawer = room.players.find((player) => player.userId === game.drawerId);
    elements.statusLabel.textContent = isDrawer() ? '내가 그릴 차례!' : `${drawer?.nickname || '출제자'}님이 그리는 중`;
    elements.hintLabel.textContent = secretAnswer ? `제시어: ${secretAnswer}` : game.hint ? `힌트: ${game.hint}` : game.wordLength ? `정답: ${'○'.repeat(game.wordLength)} (${game.wordLength}글자)` : '그림을 보고 정답을 맞혀 보세요!';
  } else if (room.state === 'roundResult') {
    elements.statusLabel.textContent = '라운드 종료'; elements.hintLabel.textContent = '방장이 다음 라운드를 시작할 수 있어요.'; elements.timerLabel.textContent = '--';
  } else {
    elements.statusLabel.textContent = '게임 종료'; elements.hintLabel.textContent = '최종 순위를 확인해 보세요!'; elements.timerLabel.textContent = '--';
  }
}

function updateCanvasAccess() {
  const drawer = isDrawer();
  elements.canvas.style.touchAction = drawer ? 'none' : 'auto';
  elements.canvas.classList.toggle('drawable', drawer);
  elements.drawerTools.classList.toggle('drawer-active', drawer);
  elements.spectatorNotice.classList.toggle('hidden', drawer || room?.state !== 'playing');
}

function updateRoundForm() {
  if (!room) return;
  const current = elements.drawerSelect.value;
  const availableDrawers = room.players.filter((player) => player.connected && (room.settings.hostParticipates || !player.isHost));
  elements.drawerSelect.replaceChildren(...availableDrawers.map((player) => {
    const option = document.createElement('option'); option.value = player.userId; option.textContent = player.nickname; return option;
  }));
  if ([...elements.drawerSelect.options].some((option) => option.value === current)) elements.drawerSelect.value = current;

  const participatingHost = isHost() && room.settings.hostParticipates;
  const roundForm = $('#roundForm');
  const randomWordMode = roundForm.querySelector('[name="wordMode"][value="random"]');
  roundForm.querySelectorAll('[name="wordMode"][value="selected"], [name="wordMode"][value="custom"]').forEach((field) => { field.disabled = participatingHost; });
  ['preparedWord', 'customWord', 'acceptedAnswers'].forEach((name) => { roundForm.elements[name].disabled = participatingHost; });
  const selectedWordMode = roundForm.querySelector('[name="wordMode"]:checked');
  if (participatingHost && ['selected', 'custom'].includes(selectedWordMode?.value)) randomWordMode.checked = true;
  elements.participationNote.classList.toggle('hidden', !participatingHost);
}

function customWordsFromInput() {
  return elements.customWordList.value.split(/\r?\n/).map((word) => word.trim()).filter(Boolean);
}

function updateCustomWordCount() {
  const customWords = customWordsFromInput();
  const uniqueWords = new Set(customWords.map((word) => word.toLocaleLowerCase('ko-KR').replace(/\s/g, '')));
  const duplicateCount = customWords.length - uniqueWords.size;
  elements.customWordCount.textContent = `${customWords.length}개 / 최소 10개 · ${duplicateCount ? `중복 ${duplicateCount}개` : '중복 없음'}`;
  elements.customWordCount.classList.toggle('invalid', customWords.length > 0 && (customWords.length < 10 || duplicateCount > 0));
}

function openSettings() {
  const form = $('#settingsForm');
  Object.entries(room.settings).forEach(([key, value]) => {
    const field = form.elements[key];
    if (!field) return;
    if (field.type === 'checkbox') field.checked = value;
    else field.value = String(value);
  });
  elements.settingsDialog.showModal();
}

function showResult(data) {
  const topThree = data.ranking.slice(0, 3);
  elements.resultContent.replaceChildren();
  const eyebrow = document.createElement('p'); eyebrow.className = 'eyebrow'; eyebrow.textContent = data.finished ? '최종 결과' : '라운드 결과';
  const heading = document.createElement('h2'); heading.textContent = data.finished ? '🏆 게임 종료!' : `정답은 “${data.answer}”`;
  const podium = document.createElement('div'); podium.className = 'podium';
  topThree.forEach((entry, index) => {
    const card = document.createElement('div'); card.className = `podium-card place-${index + 1}`;
    const medal = document.createElement('span'); medal.textContent = ['🥇', '🥈', '🥉'][index];
    const name = document.createElement('b'); name.textContent = entry.nickname;
    const score = document.createElement('strong'); score.textContent = `${entry.score}점`;
    card.append(medal, name, score); podium.append(card);
  });
  const answerers = document.createElement('div'); answerers.className = 'answerer-list';
  if (data.correctOrder.length) data.correctOrder.forEach((entry) => {
    const row = document.createElement('p'); const name = document.createElement('span'); name.textContent = entry.nickname; const score = document.createElement('b'); score.textContent = `+${entry.points}점`; row.append(name, score); answerers.append(row);
  });
  else answerers.textContent = '이번 라운드에는 정답자가 없었어요.';
  const fullRanking = document.createElement('div'); fullRanking.className = 'answerer-list full-ranking';
  data.ranking.forEach((entry) => {
    const row = document.createElement('p');
    const name = document.createElement('span'); name.textContent = `${entry.rank}위 · ${entry.nickname}`;
    const score = document.createElement('b'); score.textContent = `${entry.score}점`;
    row.append(name, score); fullRanking.append(row);
  });
  const actions = document.createElement('div'); actions.className = 'result-actions';
  const closeButton = document.createElement('button'); closeButton.className = 'button secondary full'; closeButton.textContent = '결과 닫기'; closeButton.addEventListener('click', () => elements.resultDialog.close());
  actions.append(closeButton);
  if (data.finished) {
    const bestGuesser = [...data.ranking].sort((a, b) => b.correctCount - a.correctCount)[0];
    const bestDrawer = [...data.ranking].sort((a, b) => b.drawCount - a.drawCount)[0];
    const awards = document.createElement('p'); awards.className = 'special-awards';
    awards.textContent = `🎯 최다 정답 ${bestGuesser?.nickname || '-'} (${bestGuesser?.correctCount || 0}회) · 🎨 최다 출제 ${bestDrawer?.nickname || '-'} (${bestDrawer?.drawCount || 0}회)`;
    if (isHost()) {
      const restart = document.createElement('button'); restart.className = 'button primary full'; restart.textContent = '↻ 다시 하기'; restart.addEventListener('click', () => emitAck('game:restart', {}, () => elements.resultDialog.close()));
      const lobby = document.createElement('button'); lobby.className = 'button ghost full'; lobby.textContent = '대기실로'; lobby.addEventListener('click', () => emitAck('game:lobby', {}, () => elements.resultDialog.close()));
      actions.prepend(restart, lobby);
    }
    const leave = document.createElement('button'); leave.className = 'button danger-outline full'; leave.textContent = '방 나가기'; leave.addEventListener('click', () => emitAck('room:leave', {}, () => returnHomeWithNotice('방에서 나왔습니다.')));
    actions.append(leave);
    elements.resultContent.append(eyebrow, heading, podium, answerers, fullRanking, awards, actions);
    elements.resultDialog.showModal();
    playSound('finish');
    return;
  }
  elements.resultContent.append(eyebrow, heading, podium, answerers, fullRanking, actions);
  elements.resultDialog.showModal();
  playSound(data.finished ? 'finish' : 'round');
}

function playSound(type) {
  if (muted) return;
  try {
    const audio = new (window.AudioContext || window.webkitAudioContext)();
    const frequencies = { join: 520, start: 660, correct: 880, wrong: 180, warning: 440, round: 330, finish: 740 };
    const oscillator = audio.createOscillator(); const gain = audio.createGain();
    oscillator.frequency.value = frequencies[type] || 440; oscillator.type = type === 'wrong' ? 'sawtooth' : 'sine';
    gain.gain.setValueAtTime(0.08, audio.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.18);
    oscillator.connect(gain).connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + 0.18);
  } catch { /* 오디오를 지원하지 않는 브라우저에서는 조용히 무시 */ }
}

function drawSegment(segment) {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = segment.width;
  ctx.strokeStyle = segment.tool === 'eraser' ? '#ffffff' : segment.color;
  ctx.globalCompositeOperation = 'source-over';
  ctx.beginPath(); ctx.moveTo(segment.fromX * elements.canvas.width, segment.fromY * elements.canvas.height); ctx.lineTo(segment.toX * elements.canvas.width, segment.toY * elements.canvas.height); ctx.stroke();
  ctx.restore();
}

function queueRender(segments) {
  pendingRender.push(...segments);
  if (queueRender.frame) return;
  queueRender.frame = requestAnimationFrame(() => {
    pendingRender.splice(0).forEach(drawSegment); queueRender.frame = null;
  });
}

function redrawCanvas() {
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, elements.canvas.width, elements.canvas.height);
  drawingActions.forEach((action) => action.segments?.forEach(drawSegment));
}

function pointerPoint(event) {
  const rect = elements.canvas.getBoundingClientRect();
  return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
}

function startDrawing(event) {
  if (!isDrawer()) return;
  event.preventDefault(); elements.canvas.setPointerCapture(event.pointerId);
  isDrawing = true; currentStrokeId = `${userId}-${Date.now()}-${Math.random().toString(16).slice(2)}`; lastPoint = pointerPoint(event); pendingSegments = [];
}

function moveDrawing(event) {
  if (!isDrawing || !isDrawer()) return;
  event.preventDefault();
  const point = pointerPoint(event);
  const segment = { fromX: lastPoint.x, fromY: lastPoint.y, toX: point.x, toY: point.y, color: selectedColor, width: selectedWidth, tool: selectedTool };
  lastPoint = point; pendingSegments.push(segment); queueRender([segment]); scheduleSegmentSend();
}

function endDrawing(event) {
  if (!isDrawing) return;
  event.preventDefault(); isDrawing = false; flushSegments();
}

function scheduleSegmentSend() {
  if (sendTimer) return;
  sendTimer = setTimeout(() => { sendTimer = null; flushSegments(); }, 24);
}

function flushSegments() {
  if (!pendingSegments.length) return;
  const segments = pendingSegments.splice(0, 30);
  socket.emit('canvas:draw', { strokeId: currentStrokeId, segments }, (result) => { if (result && !result.ok) showToast(result.error); });
  if (pendingSegments.length) scheduleSegmentSend();
}

socket.on('connect', () => {
  elements.socketStatus.textContent = '● 연결됨'; elements.socketStatus.classList.add('connected');
  socket.emit('room:join', { code: roomCode, userId, nickname }, (result) => {
    if (!result?.ok) { alert(result?.error || '방에 다시 입장하지 못했습니다.'); location.replace('/'); return; }
    sessionStorage.setItem('catchmind:roomCode', roomCode); if (!room) playSound('join');
  });
});
socket.on('disconnect', () => { elements.socketStatus.textContent = '○ 재연결 중'; elements.socketStatus.classList.remove('connected'); showToast('서버 연결이 끊겼습니다. 자동으로 재연결합니다.'); });
socket.on('room:state', (nextRoom) => { room = nextRoom; renderRoom(); });
socket.on('game:secret', ({ answer }) => { secretAnswer = answer; renderGameStatus(); });
socket.on('game:hint', ({ hint }) => { if (room) room.game.hint = hint; renderGameStatus(); });
socket.on('chat:message', appendChat);
socket.on('answer:correct', ({ userId: winnerId }) => playSound(winnerId === userId ? 'correct' : 'join'));
socket.on('round:ended', (data) => { secretAnswer = ''; showResult(data); });
socket.on('canvas:draw', ({ strokeId, segments }) => {
  let action = drawingActions.at(-1);
  if (action?.strokeId !== strokeId) { action = { type: 'stroke', strokeId, segments: [] }; drawingActions.push(action); }
  action.segments.push(...segments); queueRender(segments);
});
socket.on('canvas:sync', (actions) => { drawingActions = actions || []; redrawCanvas(); });
socket.on('room:kicked', () => returnHomeWithNotice('방장에 의해 강퇴되었습니다.'));
socket.on('room:closed', () => { alert('방장이 방을 종료했습니다.'); sessionStorage.removeItem('catchmind:roomCode'); location.replace('/'); });
socket.on('session:replaced', () => showToast('다른 탭에서 같은 사용자로 접속했습니다.'));

setInterval(() => {
  if (!room || room.state !== 'playing' || !room.game.endAt) return;
  const left = Math.max(0, Math.ceil((room.game.endAt - Date.now()) / 1000));
  elements.timerLabel.textContent = left;
  elements.timerLabel.classList.toggle('urgent', left <= 5);
  if (left === 10 && !timerWarningPlayed) { timerWarningPlayed = true; playSound('warning'); }
  if (left > 10) timerWarningPlayed = false;
}, 200);

elements.chatForm.addEventListener('submit', (event) => {
  event.preventDefault(); const text = elements.chatInput.value.trim(); if (!text) return;
  socket.emit('chat:send', { text }, (result) => {
    if (!result?.ok) return showToast(result?.error || '메시지를 보내지 못했습니다.');
    elements.chatInput.value = ''; if (!result.correct && room?.state === 'playing') playSound('wrong');
  });
});
elements.readyButton.addEventListener('click', () => emitAck('room:ready'));
elements.startButton.addEventListener('click', () => { setTabletLobby(false); elements.roundDialog.showModal(); });
elements.restartButton.addEventListener('click', () => emitAck('game:restart'));
elements.lobbyButton.addEventListener('click', () => emitAck('game:lobby'));
elements.settingsButton.addEventListener('click', () => { setTabletLobby(false); openSettings(); });
elements.tabletLobbyButton.addEventListener('click', () => setTabletLobby(true));
elements.tabletLobbyClose.addEventListener('click', () => setTabletLobby(false));
elements.tabletLobbyBackdrop.addEventListener('click', () => setTabletLobby(false));
elements.canvas.addEventListener('pointerdown', startDrawing);
elements.canvas.addEventListener('pointermove', moveDrawing);
elements.canvas.addEventListener('pointerup', endDrawing);
elements.canvas.addEventListener('pointercancel', endDrawing);
elements.customWordList.addEventListener('input', updateCustomWordCount);
updateCustomWordCount();

$('#roundForm').addEventListener('submit', (event) => {
  event.preventDefault(); const data = new FormData(event.currentTarget);
  const payload = { drawerMode: data.get('drawerMode'), drawerId: data.get('drawerId'), wordMode: data.get('wordMode'), customWord: data.get('customWord'), customWords: customWordsFromInput(), preparedWord: data.get('preparedWord'), difficulty: data.get('difficulty'), acceptedAnswers: String(data.get('acceptedAnswers') || '').split(',').map((value) => value.trim()).filter(Boolean) };
  secretAnswer = '';
  emitAck('game:start', payload, () => { elements.roundDialog.close(); playSound('start'); });
});

$('#settingsForm').addEventListener('submit', (event) => {
  event.preventDefault(); const data = new FormData(event.currentTarget);
  emitAck('room:settings', { title: data.get('title'), maxPlayers: Number(data.get('maxPlayers')), roundTime: Number(data.get('roundTime')), totalRounds: Number(data.get('totalRounds')), isPublic: data.get('isPublic') === 'true', showWordLength: data.has('showWordLength'), hintsEnabled: data.has('hintsEnabled'), allowLateJoin: data.has('allowLateJoin'), hostParticipates: data.has('hostParticipates') }, () => elements.settingsDialog.close());
});

$('#leaveButton').addEventListener('click', () => { if (confirm('방에서 나가시겠어요?')) emitAck('room:leave', {}, () => returnHomeWithNotice('방에서 나왔습니다.')); });
function closeRoom() {
  if (confirm('방을 종료하면 모든 참가자가 나가게 됩니다. 계속할까요?')) {
    emitAck('room:close', {}, () => location.replace('/'));
  }
}
$('#closeRoomButton').addEventListener('click', closeRoom);
elements.closeRoomLobbyButton.addEventListener('click', closeRoom);
$('#copyCode').addEventListener('click', async () => { try { await navigator.clipboard.writeText(roomCode); showToast('방 코드를 복사했습니다!'); } catch { showToast(`방 코드: ${roomCode}`); } });
$('#muteButton').addEventListener('click', (event) => { muted = !muted; localStorage.setItem('catchmind:muted', muted); event.currentTarget.textContent = muted ? '🔇' : '🔊'; });
$('#muteButton').textContent = muted ? '🔇' : '🔊';
document.querySelectorAll('.close-modal').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
$('#transferHostButton').addEventListener('click', () => {
  const player = selectedManagedPlayer;
  closePlayerMenu();
  if (!player) return;
  if (confirm(`${player.nickname}님에게 방장을 넘기시겠어요?`)) {
    emitAck('room:transfer', { userId: player.userId });
  }
});
$('#kickPlayerButton').addEventListener('click', () => {
  const player = selectedManagedPlayer;
  closePlayerMenu();
  if (!player) return;
  if (confirm(`${player.nickname}님을 방에서 강퇴하시겠어요?`)) {
    emitAck('room:kick', { userId: player.userId });
  }
});
document.addEventListener('click', (event) => {
  if (!elements.playerActionMenu.contains(event.target)) closePlayerMenu();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { closePlayerMenu(); setTabletLobby(false); }
});
window.addEventListener('resize', closePlayerMenu);

document.querySelectorAll('[data-tool]').forEach((button) => button.addEventListener('click', () => {
  selectedTool = button.dataset.tool; document.querySelectorAll('[data-tool]').forEach((item) => item.classList.toggle('active', item === button));
}));
$('#colorPicker').addEventListener('input', (event) => { selectedColor = event.target.value; selectedTool = 'pen'; });
document.querySelectorAll('[data-color]').forEach((button) => button.addEventListener('click', () => { selectedColor = button.dataset.color; $('#colorPicker').value = selectedColor; selectedTool = 'pen'; }));
$('#widthPicker').addEventListener('input', (event) => { selectedWidth = Number(event.target.value); $('#widthOutput').textContent = selectedWidth; });
$('#undoButton').addEventListener('click', () => emitAck('canvas:action', { action: 'undo' }));
$('#redoButton').addEventListener('click', () => emitAck('canvas:action', { action: 'redo' }));
$('#clearButton').addEventListener('click', () => { if (confirm('캔버스의 그림을 모두 지울까요?')) emitAck('canvas:action', { action: 'clear' }); });

document.querySelectorAll('.mobile-tabs button').forEach((button) => button.addEventListener('click', () => {
  if (button.disabled) return;
  document.querySelectorAll('.mobile-tabs button').forEach((item) => item.classList.toggle('active', item === button));
  document.querySelectorAll('.mobile-tab-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.tab === button.dataset.target));
}));

redrawCanvas();
