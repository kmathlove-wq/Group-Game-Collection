const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const words = require('./data/words.json');
const { MemoryRoomStore } = require('./lib/memory-room-store');

const PORT = Number(process.env.PORT) || 3000;
const MAX_CHAT_HISTORY = 100;
const RECONNECT_GRACE_MS = 30_000;
const ROOM_IDLE_MS = 6 * 60 * 60 * 1000;
const DRAWING_ACTION_LIMIT = 2_000;
const NICKNAME_MAX_LENGTH = 30;
const MAX_ROUNDS = 100;
const CUSTOM_WORD_LIST_MIN = 10;
const CUSTOM_WORD_LIST_MAX = 100;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 200_000,
  pingTimeout: 20_000,
  pingInterval: 25_000
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

const rooms = new MemoryRoomStore();
const roomTimers = new Map();

function cleanText(value, maxLength) {
  return String(value ?? '').replace(/[<>]/g, '').trim().slice(0, maxLength);
}

function cleanNickname(value) {
  return [...String(value ?? '').trim()].slice(0, NICKNAME_MAX_LENGTH).join('');
}

function validateNickname(value) {
  const raw = String(value ?? '');
  const nickname = raw.trim();
  if (!nickname) return '닉네임을 입력해 주세요.';
  if ([...nickname].length > NICKNAME_MAX_LENGTH) return `닉네임은 최대 ${NICKNAME_MAX_LENGTH}자까지 입력할 수 있습니다.`;
  if (/\p{Cc}/u.test(nickname)) return '닉네임에는 제어 문자를 사용할 수 없습니다.';
  return null;
}

function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function normalizeSettings(raw = {}, existing = {}) {
  const allowedTimes = [30, 60, 90, 120];
  const roundTime = Number(raw.roundTime ?? existing.roundTime ?? 60);
  return {
    title: cleanText(raw.title ?? existing.title ?? '즐거운 두들팡', 30) || '즐거운 두들팡',
    maxPlayers: Math.min(30, Math.max(2, Number(raw.maxPlayers ?? existing.maxPlayers ?? 10) || 10)),
    isPublic: raw.isPublic === undefined ? (existing.isPublic ?? true) : Boolean(raw.isPublic),
    roundTime: allowedTimes.includes(roundTime) ? roundTime : 60,
    totalRounds: Math.min(MAX_ROUNDS, Math.max(1, Number(raw.totalRounds ?? existing.totalRounds ?? 5) || 5)),
    showWordLength: raw.showWordLength === undefined ? (existing.showWordLength ?? true) : Boolean(raw.showWordLength),
    hintsEnabled: raw.hintsEnabled === undefined ? (existing.hintsEnabled ?? true) : Boolean(raw.hintsEnabled),
    allowLateJoin: raw.allowLateJoin === undefined ? (existing.allowLateJoin ?? false) : Boolean(raw.allowLateJoin),
    hostParticipates: raw.hostParticipates === undefined ? (existing.hostParticipates ?? false) : Boolean(raw.hostParticipates),
    ignoreSpaces: raw.ignoreSpaces === undefined ? (existing.ignoreSpaces ?? true) : Boolean(raw.ignoreSpaces)
  };
}

function createPlayer({ userId, nickname, socket }) {
  return {
    userId,
    socketId: socket.id,
    nickname: cleanNickname(nickname),
    score: 0,
    ready: false,
    connected: true,
    joinedAt: Date.now(),
    correctCount: 0,
    drawCount: 0,
    disconnectTimer: null
  };
}

function publicPlayer(player, room) {
  return {
    userId: player.userId,
    nickname: player.nickname,
    score: player.score,
    ready: player.ready,
    connected: player.connected,
    isHost: room.hostId === player.userId,
    isDrawer: room.game.drawerId === player.userId,
    hasGuessed: room.game.guessedIds.has(player.userId),
    correctCount: player.correctCount,
    drawCount: player.drawCount
  };
}

function roomState(room) {
  return {
    code: room.code,
    settings: room.settings,
    state: room.state,
    hostId: room.hostId,
    players: [...room.players.values()].map((p) => publicPlayer(p, room)),
    chat: room.chat,
    createdAt: room.createdAt,
    game: {
      round: room.game.round,
      totalRounds: room.settings.totalRounds,
      drawerId: room.game.drawerId,
      endAt: room.game.endAt,
      hint: room.game.hint,
      wordLength: room.settings.showWordLength ? room.game.answer.replace(/\s/g, '').length : null,
      correctOrder: room.game.correctOrder.map((item) => ({
        userId: item.userId,
        nickname: item.nickname,
        points: item.points
      }))
    }
  };
}

function roomListItem(room) {
  const host = room.players.get(room.hostId);
  return {
    code: room.code,
    title: room.settings.title,
    hostNickname: host?.nickname ?? '-',
    playerCount: room.players.size,
    maxPlayers: room.settings.maxPlayers,
    state: room.state,
    roundTime: room.settings.roundTime,
    allowLateJoin: room.settings.allowLateJoin,
    createdAt: room.createdAt,
    canJoin: room.players.size < room.settings.maxPlayers && (room.state === 'waiting' || room.settings.allowLateJoin)
  };
}

function publicRoomList() {
  return [...rooms.values()].filter((room) => room.settings.isPublic).map(roomListItem);
}

function emitRoomList() {
  io.emit('rooms:list', publicRoomList());
}

function emitRoomState(room) {
  io.to(room.code).emit('room:state', roomState(room));
  emitRoomList();
}

function canSeeSecret(room, userId) {
  return room.game.drawerId === userId || (!room.settings.hostParticipates && room.hostId === userId);
}

function sendSecret(room) {
  if (!room.game.answer) return;
  const targets = new Set([room.game.drawerId]);
  if (!room.settings.hostParticipates) targets.add(room.hostId);
  for (const userId of targets) {
    const player = room.players.get(userId);
    if (player?.connected) io.to(player.socketId).emit('game:secret', { answer: room.game.answer });
  }
}

function findMembership(socket) {
  const room = rooms.get(socket.data.roomCode);
  if (!room) return {};
  const player = room.players.get(socket.data.userId);
  if (!player || player.socketId !== socket.id) return {};
  return { room, player };
}

function requireMember(socket, ack) {
  const membership = findMembership(socket);
  if (!membership.room) {
    ack?.({ ok: false, error: '방 참가자만 사용할 수 있습니다.' });
    return null;
  }
  return membership;
}

function requireHost(socket, ack) {
  const membership = requireMember(socket, ack);
  if (!membership || membership.room.hostId !== membership.player.userId) {
    if (membership) ack?.({ ok: false, error: '방장만 사용할 수 있습니다.' });
    return null;
  }
  return membership;
}

function addSystemChat(room, text, type = 'system') {
  room.chat.push({ id: `${Date.now()}-${Math.random()}`, type, text, at: Date.now() });
  if (room.chat.length > MAX_CHAT_HISTORY) room.chat.splice(0, room.chat.length - MAX_CHAT_HISTORY);
}

function leaveImmediately(room, userId, reason = 'left') {
  const player = room.players.get(userId);
  if (!player) return;
  if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
  room.players.delete(userId);
  addSystemChat(room, `${player.nickname}님이 방을 나갔습니다.`);

  if (room.players.size === 0) {
    clearRoom(room.code);
    return;
  }
  if (room.hostId === userId) room.hostId = [...room.players.keys()][0];
  if (room.game.drawerId === userId && room.state === 'playing') {
    endRound(room, 'drawer-left');
  } else {
    emitRoomState(room);
  }
  if (reason === 'kicked') io.to(player.socketId).emit('room:kicked');
}

function clearRoom(code) {
  const timer = roomTimers.get(code);
  if (timer) clearTimeout(timer);
  roomTimers.delete(code);
  rooms.delete(code);
  emitRoomList();
}

function normalizeAnswer(text, ignoreSpaces) {
  let normalized = String(text ?? '').trim().toLocaleLowerCase('ko-KR').replace(/\s+/g, ' ');
  if (ignoreSpaces) normalized = normalized.replace(/\s/g, '');
  return normalized;
}

function chooseDrawer(room, payload) {
  const connected = [...room.players.values()].filter((p) => p.connected && (room.settings.hostParticipates || p.userId !== room.hostId));
  if (!connected.length) return null;
  if (payload.drawerMode === 'selected') return connected.some((p) => p.userId === payload.drawerId) ? payload.drawerId : null;
  let candidates = connected;
  if (payload.drawerMode === 'different' && connected.length > 1) {
    candidates = connected.filter((p) => p.userId !== room.game.previousDrawerId);
  }
  return candidates[Math.floor(Math.random() * candidates.length)].userId;
}

function chooseWord(payload) {
  if (payload.wordMode === 'custom') {
    const custom = cleanText(payload.customWord, 30);
    if (custom.length >= 1) return custom;
    return null;
  }
  if (payload.wordMode === 'selected') {
    const selected = cleanText(payload.preparedWord, 30);
    return Object.values(words).flat().includes(selected) ? selected : null;
  }
  const difficulty = ['easy', 'normal', 'hard'].includes(payload.difficulty) ? payload.difficulty : 'normal';
  const list = words[difficulty];
  return list[Math.floor(Math.random() * list.length)];
}

function validateCustomWordList(input) {
  if (!Array.isArray(input)) return { error: `사용자 단어 목록을 ${CUSTOM_WORD_LIST_MIN}개 이상 입력해 주세요.` };
  if (input.length > CUSTOM_WORD_LIST_MAX) return { error: `사용자 단어 목록은 최대 ${CUSTOM_WORD_LIST_MAX}개까지 입력할 수 있습니다.` };

  const customWords = [];
  for (const value of input) {
    const raw = String(value ?? '').trim();
    if (!raw) continue;
    if ([...raw].length > 30) return { error: '사용자 단어는 항목당 최대 30자까지 입력할 수 있습니다.' };
    if (/\p{Cc}/u.test(raw)) return { error: '사용자 단어에는 제어 문자를 사용할 수 없습니다.' };
    customWords.push(cleanText(raw, 30));
  }
  if (customWords.length < CUSTOM_WORD_LIST_MIN) return { error: `사용자 단어 목록을 ${CUSTOM_WORD_LIST_MIN}개 이상 입력해 주세요.` };

  const normalized = customWords.map((word) => normalizeAnswer(word, true));
  if (new Set(normalized).size !== normalized.length) return { error: '사용자 단어 목록에 중복된 단어가 있습니다.' };
  return { words: customWords };
}

function maskAnswer(answer, revealCount) {
  let seen = 0;
  return [...answer].map((char) => {
    if (/\s/.test(char)) return ' ';
    seen += 1;
    return seen <= revealCount ? char : '○';
  }).join('');
}

function hintRevealCount(answer, elapsedRatio) {
  const letters = [...String(answer ?? '')].filter((char) => !/\s/.test(char)).length;
  if (letters <= 2) return 0;
  if (elapsedRatio >= 0.66) return Math.max(1, Math.floor(letters / 2));
  return elapsedRatio >= 0.4 ? 1 : 0;
}

function scheduleRound(room) {
  const oldTimer = roomTimers.get(room.code);
  if (oldTimer) clearTimeout(oldTimer);
  const timer = setTimeout(() => endRound(room, 'time'), Math.max(0, room.game.endAt - Date.now()));
  roomTimers.set(room.code, timer);
}

function startRound(room, payload) {
  const randomWordModes = ['random', 'customList'];
  if (room.settings.hostParticipates && !randomWordModes.includes(payload.wordMode)) {
    return '게임에 참여하는 방장은 기본 무작위 또는 사용자 목록 무작위 제시어만 사용할 수 있습니다.';
  }
  const drawerId = chooseDrawer(room, payload);
  const customList = payload.wordMode === 'customList' ? validateCustomWordList(payload.customWords) : null;
  if (customList?.error) return customList.error;
  const answer = customList
    ? customList.words[Math.floor(Math.random() * customList.words.length)]
    : chooseWord(payload);
  if (!drawerId) return '그릴 사람을 선택해 주세요.';
  if (!answer) return '올바른 제시어를 입력하거나 선택해 주세요.';

  room.state = 'playing';
  room.game.round += 1;
  room.game.previousDrawerId = room.game.drawerId;
  room.game.drawerId = drawerId;
  room.game.answer = answer;
  room.game.acceptedAnswers = [answer, ...(Array.isArray(payload.acceptedAnswers) ? payload.acceptedAnswers : [])]
    .map((v) => cleanText(v, 30)).filter(Boolean).slice(0, 5);
  room.game.guessedIds = new Set();
  room.game.correctOrder = [];
  room.game.endAt = Date.now() + room.settings.roundTime * 1000;
  room.game.hint = maskAnswer(answer, 0);
  room.game.hintStage = 0;
  room.game.drawingActions = [];
  room.game.redoActions = [];
  const drawer = room.players.get(drawerId);
  if (drawer) drawer.drawCount += 1;
  addSystemChat(room, `${room.game.round}라운드가 시작되었습니다!`);
  io.to(room.code).emit('canvas:sync', []);
  emitRoomState(room);
  sendSecret(room);
  scheduleRound(room);
  return null;
}

function ranking(room) {
  return [...room.players.values()]
    .filter((p) => room.settings.hostParticipates || p.userId !== room.hostId)
    .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt)
    .map((p, index) => ({ rank: index + 1, userId: p.userId, nickname: p.nickname, score: p.score, correctCount: p.correctCount, drawCount: p.drawCount }));
}

function endRound(room, reason = 'time') {
  if (room.state !== 'playing') return;
  const timer = roomTimers.get(room.code);
  if (timer) clearTimeout(timer);
  roomTimers.delete(room.code);
  const answer = room.game.answer;
  room.state = room.game.round >= room.settings.totalRounds ? 'finished' : 'roundResult';
  room.game.endAt = null;
  room.game.drawingActions = [];
  room.game.redoActions = [];
  addSystemChat(room, `라운드 종료! 정답은 “${answer}”입니다.`);
  io.to(room.code).emit('round:ended', {
    answer,
    reason,
    correctOrder: room.game.correctOrder,
    ranking: ranking(room),
    finished: room.state === 'finished'
  });
  room.game.answer = '';
  room.game.acceptedAnswers = [];
  room.game.hint = '';
  emitRoomState(room);
  io.to(room.code).emit('canvas:sync', []);
}

function rateLimit(player, key, interval, burst) {
  player.rateLimits ??= {};
  const now = Date.now();
  const list = (player.rateLimits[key] ?? []).filter((time) => now - time < interval);
  if (list.length >= burst) return false;
  list.push(now);
  player.rateLimits[key] = list;
  return true;
}

function validSegment(segment) {
  const nums = ['fromX', 'fromY', 'toX', 'toY'].every((key) => Number.isFinite(segment[key]) && segment[key] >= 0 && segment[key] <= 1);
  return nums && /^#[0-9a-f]{6}$/i.test(segment.color) && Number.isFinite(segment.width) && segment.width >= 1 && segment.width <= 40 && ['pen', 'eraser'].includes(segment.tool);
}

function visibleDrawing(actions) {
  let visible = [];
  for (const action of actions) {
    if (action.type === 'clear') visible = [];
    else visible.push(action);
  }
  return visible;
}

io.on('connection', (socket) => {
  socket.emit('rooms:list', publicRoomList());

  socket.on('rooms:request', () => socket.emit('rooms:list', publicRoomList()));

  socket.on('room:create', (payload = {}, ack = () => {}) => {
    const userId = cleanText(payload.userId, 80);
    const nicknameError = validateNickname(payload.nickname);
    if (!userId || nicknameError) return ack({ ok: false, error: nicknameError || '사용자 ID가 없습니다.' });
    const settings = normalizeSettings(payload.settings);
    const code = makeRoomCode();
    const player = createPlayer({ userId, nickname: payload.nickname, socket });
    const room = {
      code,
      settings,
      hostId: userId,
      state: 'waiting',
      players: new Map([[userId, player]]),
      chat: [],
      createdAt: Date.now(),
      lastActive: Date.now(),
      game: {
        round: 0, drawerId: null, previousDrawerId: null, answer: '', acceptedAnswers: [],
        guessedIds: new Set(), correctOrder: [], endAt: null, hint: '', hintStage: 0,
        drawingActions: [], redoActions: []
      }
    };
    rooms.set(code, room);
    socket.data = { userId, roomCode: code };
    socket.join(code);
    addSystemChat(room, `${player.nickname}님이 방을 만들었습니다.`);
    ack({ ok: true, code });
    emitRoomState(room);
  });

  socket.on('room:join', (payload = {}, ack = () => {}) => {
    const code = cleanText(payload.code, 6).toUpperCase();
    const userId = cleanText(payload.userId, 80);
    const nicknameError = validateNickname(payload.nickname);
    const room = rooms.get(code);
    if (!room) return ack({ ok: false, error: '존재하지 않는 방입니다.' });
    if (!userId || nicknameError) return ack({ ok: false, error: nicknameError || '사용자 ID가 없습니다.' });

    const existing = room.players.get(userId);
    if (existing) {
      if (existing.disconnectTimer) clearTimeout(existing.disconnectTimer);
      if (existing.socketId && existing.socketId !== socket.id) io.to(existing.socketId).emit('session:replaced');
      existing.socketId = socket.id;
      existing.connected = true;
      existing.disconnectTimer = null;
      socket.data = { userId, roomCode: code };
      socket.join(code);
      ack({ ok: true, code, reconnected: true });
      socket.emit('room:state', roomState(room));
      socket.emit('canvas:sync', visibleDrawing(room.game.drawingActions));
      if (canSeeSecret(room, userId) && room.game.answer) socket.emit('game:secret', { answer: room.game.answer });
      emitRoomState(room);
      return;
    }

    if (room.players.size >= room.settings.maxPlayers) return ack({ ok: false, error: '방이 가득 찼습니다.' });
    if (room.state !== 'waiting' && !room.settings.allowLateJoin) return ack({ ok: false, error: '게임이 이미 시작되어 입장할 수 없습니다.' });
    const duplicate = [...room.players.values()].some((p) => p.nickname.toLocaleLowerCase('ko-KR') === cleanNickname(payload.nickname).toLocaleLowerCase('ko-KR'));
    if (duplicate) return ack({ ok: false, error: '같은 방에서 이미 사용 중인 닉네임입니다.' });

    const player = createPlayer({ userId, nickname: payload.nickname, socket });
    room.players.set(userId, player);
    room.lastActive = Date.now();
    socket.data = { userId, roomCode: code };
    socket.join(code);
    addSystemChat(room, `${player.nickname}님이 입장했습니다.`);
    ack({ ok: true, code });
    socket.emit('canvas:sync', visibleDrawing(room.game.drawingActions));
    emitRoomState(room);
  });

  socket.on('session:resume', (payload = {}, ack = () => {}) => {
    const code = cleanText(payload.code, 6).toUpperCase();
    const room = rooms.get(code);
    const player = room?.players.get(cleanText(payload.userId, 80));
    if (!room || !player) return ack({ ok: false, error: '복구할 세션이 없습니다.' });
    socket.emit('room:join:resume-request');
    socket.listeners('room:join')[0]?.({ code, userId: payload.userId, nickname: player.nickname }, ack);
  });

  socket.on('room:leave', (_payload, ack = () => {}) => {
    const membership = requireMember(socket, ack);
    if (!membership) return;
    socket.leave(membership.room.code);
    socket.data.roomCode = null;
    leaveImmediately(membership.room, membership.player.userId);
    ack({ ok: true });
  });

  socket.on('room:ready', (_payload, ack = () => {}) => {
    const membership = requireMember(socket, ack);
    if (!membership || membership.room.state !== 'waiting') return;
    membership.player.ready = !membership.player.ready;
    emitRoomState(membership.room);
    ack({ ok: true });
  });

  socket.on('room:settings', (payload = {}, ack = () => {}) => {
    const membership = requireHost(socket, ack);
    if (!membership) return;
    if (!['waiting', 'roundResult', 'finished'].includes(membership.room.state)) return ack({ ok: false, error: '지금은 설정을 바꿀 수 없습니다.' });
    const next = normalizeSettings(payload, membership.room.settings);
    if (next.maxPlayers < membership.room.players.size) return ack({ ok: false, error: '현재 참가자 수보다 최대 인원을 줄일 수 없습니다.' });
    membership.room.settings = next;
    emitRoomState(membership.room);
    ack({ ok: true });
  });

  socket.on('room:transfer', (payload = {}, ack = () => {}) => {
    const membership = requireHost(socket, ack);
    if (!membership) return;
    if (membership.room.state === 'playing') return ack({ ok: false, error: '라운드 진행 중에는 방장을 넘길 수 없습니다.' });
    const target = membership.room.players.get(payload.userId);
    if (!target) return ack({ ok: false, error: '참가자를 찾을 수 없습니다.' });
    membership.room.hostId = target.userId;
    addSystemChat(membership.room, `${target.nickname}님이 새 방장이 되었습니다.`);
    emitRoomState(membership.room);
    sendSecret(membership.room);
    ack({ ok: true });
  });

  socket.on('room:kick', (payload = {}, ack = () => {}) => {
    const membership = requireHost(socket, ack);
    if (!membership) return;
    if (payload.userId === membership.player.userId) return ack({ ok: false, error: '자신을 강퇴할 수 없습니다.' });
    const target = membership.room.players.get(payload.userId);
    if (!target) return ack({ ok: false, error: '참가자를 찾을 수 없습니다.' });
    io.in(target.socketId).socketsLeave(membership.room.code);
    leaveImmediately(membership.room, target.userId, 'kicked');
    ack({ ok: true });
  });

  socket.on('room:close', (_payload, ack = () => {}) => {
    const membership = requireHost(socket, ack);
    if (!membership) return;
    io.to(membership.room.code).emit('room:closed');
    io.in(membership.room.code).socketsLeave(membership.room.code);
    clearRoom(membership.room.code);
    ack({ ok: true });
  });

  socket.on('chat:send', (payload = {}, ack = () => {}) => {
    const membership = requireMember(socket, ack);
    if (!membership) return;
    const { room, player } = membership;
    const text = cleanText(payload.text, 120);
    if (!text) return ack({ ok: false, error: '메시지를 입력해 주세요.' });
    if (!rateLimit(player, 'chat', 5_000, 7)) return ack({ ok: false, error: '메시지를 너무 빠르게 보내고 있습니다.' });

    if (room.state === 'playing') {
      const guess = normalizeAnswer(text, room.settings.ignoreSpaces);
      const correct = room.game.acceptedAnswers.some((answer) => normalizeAnswer(answer, room.settings.ignoreSpaces) === guess);
      // 출제자나 이미 맞힌 사람의 정답 문자열이 일반 채팅으로 새지 않게 막는다.
      if (correct && player.userId === room.hostId && !room.settings.hostParticipates) {
        return ack({ ok: false, error: '진행 전용 방장은 정답에 참여할 수 없습니다.' });
      }
      if (correct && player.userId === room.game.drawerId) {
        return ack({ ok: false, error: '현재 출제자는 정답을 입력할 수 없습니다.' });
      }
      if (correct && room.game.guessedIds.has(player.userId)) {
        return ack({ ok: true, correct: true, alreadyGuessed: true });
      }
      if (correct) {
        const order = room.game.correctOrder.length;
        const base = [100, 80, 60][order] ?? 40;
        const secondsLeft = Math.max(0, Math.ceil((room.game.endAt - Date.now()) / 1000));
        const bonus = Math.min(30, Math.floor(secondsLeft / 5) * 2);
        const points = base + bonus;
        player.score += points;
        player.correctCount += 1;
        room.game.guessedIds.add(player.userId);
        room.game.correctOrder.push({ userId: player.userId, nickname: player.nickname, points });
        const drawer = room.players.get(room.game.drawerId);
        if (drawer) drawer.score += 10;
        addSystemChat(room, `${player.nickname}님이 정답을 맞혔습니다! (+${points}점)`, 'correct');
        io.to(room.code).emit('answer:correct', { userId: player.userId, nickname: player.nickname, points });
        emitRoomState(room);
        ack({ ok: true, correct: true });
        const eligible = [...room.players.values()].filter((p) => p.connected && p.userId !== room.game.drawerId && (room.settings.hostParticipates || p.userId !== room.hostId));
        if (eligible.length > 0 && eligible.every((p) => room.game.guessedIds.has(p.userId))) endRound(room, 'all-guessed');
        return;
      }
    }

    room.chat.push({ id: `${Date.now()}-${Math.random()}`, type: 'chat', userId: player.userId, nickname: player.nickname, text, at: Date.now() });
    if (room.chat.length > MAX_CHAT_HISTORY) room.chat.splice(0, room.chat.length - MAX_CHAT_HISTORY);
    io.to(room.code).emit('chat:message', room.chat.at(-1));
    ack({ ok: true, correct: false });
  });

  socket.on('game:start', (payload = {}, ack = () => {}) => {
    const membership = requireHost(socket, ack);
    if (!membership) return;
    const { room } = membership;
    if (!['waiting', 'roundResult'].includes(room.state)) return ack({ ok: false, error: '지금은 라운드를 시작할 수 없습니다.' });
    if (room.players.size < 2) return ack({ ok: false, error: '게임을 시작하려면 2명 이상 필요합니다.' });
    const participants = [...room.players.values()].filter((p) => p.connected && (room.settings.hostParticipates || p.userId !== room.hostId));
    if (participants.length < 2) return ack({ ok: false, error: '게임에 참여하는 사람이 2명 이상 필요합니다.' });
    if (room.game.round >= room.settings.totalRounds) return ack({ ok: false, error: '모든 라운드가 끝났습니다. 다시 하기를 눌러 주세요.' });
    const error = startRound(room, payload);
    ack(error ? { ok: false, error } : { ok: true });
  });

  socket.on('game:restart', (_payload, ack = () => {}) => {
    const membership = requireHost(socket, ack);
    if (!membership) return;
    const { room } = membership;
    if (room.state !== 'finished') return ack({ ok: false, error: '게임이 끝난 뒤 다시 시작할 수 있습니다.' });
    for (const player of room.players.values()) {
      player.score = 0; player.correctCount = 0; player.drawCount = 0; player.ready = false;
    }
    room.state = 'waiting';
    room.game.round = 0; room.game.drawerId = null; room.game.previousDrawerId = null;
    room.game.guessedIds = new Set(); room.game.correctOrder = [];
    addSystemChat(room, '새 게임을 준비합니다.');
    emitRoomState(room);
    ack({ ok: true });
  });

  socket.on('game:lobby', (_payload, ack = () => {}) => {
    const membership = requireHost(socket, ack);
    if (!membership) return;
    membership.room.state = 'waiting';
    membership.room.game.round = 0;
    membership.room.game.drawerId = null;
    emitRoomState(membership.room);
    ack({ ok: true });
  });

  socket.on('canvas:draw', (payload = {}, ack = () => {}) => {
    const membership = requireMember(socket, ack);
    if (!membership) return;
    const { room, player } = membership;
    if (room.state !== 'playing' || room.game.drawerId !== player.userId) return ack({ ok: false, error: '현재 출제자만 그릴 수 있습니다.' });
    if (!rateLimit(player, 'draw', 1_000, 70)) return;
    const segments = Array.isArray(payload.segments) ? payload.segments.slice(0, 30) : [];
    if (!segments.length || !segments.every(validSegment)) return ack({ ok: false, error: '잘못된 그림 데이터입니다.' });
    const strokeId = cleanText(payload.strokeId, 50);
    if (!strokeId) return ack({ ok: false, error: '선 식별자가 없습니다.' });
    const last = room.game.drawingActions.at(-1);
    if (last?.type === 'stroke' && last.strokeId === strokeId) last.segments.push(...segments);
    else room.game.drawingActions.push({ type: 'stroke', strokeId, segments: [...segments] });
    room.game.redoActions = [];
    if (room.game.drawingActions.length > DRAWING_ACTION_LIMIT) room.game.drawingActions.splice(0, room.game.drawingActions.length - DRAWING_ACTION_LIMIT);
    socket.to(room.code).emit('canvas:draw', { strokeId, segments });
    ack({ ok: true });
  });

  socket.on('canvas:action', (payload = {}, ack = () => {}) => {
    const membership = requireMember(socket, ack);
    if (!membership) return;
    const { room, player } = membership;
    if (room.state !== 'playing' || room.game.drawerId !== player.userId) return ack({ ok: false, error: '현재 출제자만 캔버스를 바꿀 수 있습니다.' });
    if (payload.action === 'clear' || payload.action === 'reset') {
      room.game.drawingActions.push({ type: 'clear' });
      room.game.redoActions = [];
    } else if (payload.action === 'undo') {
      const removed = room.game.drawingActions.pop();
      if (removed) room.game.redoActions.push(removed);
    } else if (payload.action === 'redo') {
      const restored = room.game.redoActions.pop();
      if (restored) room.game.drawingActions.push(restored);
    } else return ack({ ok: false, error: '알 수 없는 캔버스 동작입니다.' });
    io.to(room.code).emit('canvas:sync', visibleDrawing(room.game.drawingActions));
    ack({ ok: true });
  });

  socket.on('disconnect', () => {
    const { room, player } = findMembership(socket);
    if (!room || !player) return;
    player.connected = false;
    player.socketId = null;
    addSystemChat(room, `${player.nickname}님의 연결이 끊겼습니다. 30초 동안 기다립니다.`);
    emitRoomState(room);
    player.disconnectTimer = setTimeout(() => leaveImmediately(room, player.userId, 'timeout'), RECONNECT_GRACE_MS);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.state === 'playing' && room.settings.hintsEnabled && room.game.answer && room.game.endAt) {
      const elapsedRatio = 1 - Math.max(0, room.game.endAt - now) / (room.settings.roundTime * 1000);
      const nextStage = hintRevealCount(room.game.answer, elapsedRatio);
      if (nextStage > room.game.hintStage) {
        room.game.hintStage = nextStage;
        room.game.hint = maskAnswer(room.game.answer, nextStage);
        io.to(room.code).emit('game:hint', { hint: room.game.hint });
      }
    }
    if (now - room.lastActive > ROOM_IDLE_MS && ![...room.players.values()].some((p) => p.connected)) clearRoom(room.code);
  }
}, 1_000).unref();

if (require.main === module) {
  server.listen(PORT, () => console.log(`Group Game Collection server: http://localhost:${PORT}`));
}

module.exports = {
  app, server, io, rooms, normalizeAnswer, validateNickname, normalizeSettings, canSeeSecret, validateCustomWordList,
  hintRevealCount
};
