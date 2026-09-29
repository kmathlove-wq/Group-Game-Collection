require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const words = require('./data/words.json');
const { MemoryRoomStore } = require('./lib/memory-room-store');
const { setupMusicGame } = require('./src/music');
const { setupTriangleGame } = require('./src/triangle');
const { createGeometryDashScoreStore, SCORE_MAX } = require('./lib/geometry-dash-scores');

const BUBBLE_BOBBLE_SCORE_MAX = 9_999_999;

const PORT = Number(process.env.PORT) || 3000;
const MAX_CHAT_HISTORY = 100;
const RECONNECT_GRACE_MS = 30_000;
const DISCONNECT_ANNOUNCE_MS = 3_000;
const ROOM_IDLE_MS = 6 * 60 * 60 * 1000;
const DRAWING_ACTION_LIMIT = 2_000;
const NICKNAME_MAX_LENGTH = 30;
const MAX_ROUNDS = 100;
const CUSTOM_WORD_LIST_MIN = 10;
const CUSTOM_WORD_LIST_MAX = 100;
const USED_WORD_MEMORY = 500;
const WORD_CHOICE_MS = 15_000;
const CHOOSE_WORD_MIN = 2;
const CHOOSE_WORD_MAX = 5;

const app = express();
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 200_000,
  pingTimeout: 20_000,
  pingInterval: 25_000
});

const rooms = new MemoryRoomStore();
const roomTimers = new Map();
const SCORE_SUBMIT_COOLDOWN_MS = 2_000;

const musicGame = setupMusicGame({ app, io, rootDir: __dirname });
const triangleGame = setupTriangleGame({ app, io, rootDir: __dirname });
app.use(express.json({ limit: '2kb' }));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'games.html')));
app.get('/doodlepang', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/impossible-quiz', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'impossible-quiz.html')));
app.get('/geometry-dash', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'geometry-dash.html')));
app.get('/music', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'music.html')));
app.get('/music/solo', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'music-solo.html')));
app.get('/music/lobby', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'music-lobby.html')));
app.get('/music/room', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'music-room.html')));
app.get('/admin-login', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin-login.html')));
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// 1인용 게임의 전체 순위 API(GET 조회, POST 제출)를 게임별 파일 저장소로 연결한다.
function registerScoreboard(slug, scoreMax) {
  const store = createGeometryDashScoreStore(path.join(__dirname, 'data', `${slug}-scores.json`));
  const submitAt = new Map();
  app.get(`/api/${slug}/scores`, (_req, res) => {
    res.json({ scores: store.getTop(10) });
  });
  app.post(`/api/${slug}/scores`, (req, res) => {
    const score = Number(req.body?.score);
    if (!Number.isInteger(score) || score < 0 || score > scoreMax) {
      return res.status(400).json({ error: '유효하지 않은 점수입니다.' });
    }
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const lastSubmitAt = submitAt.get(ip) || 0;
    if (now - lastSubmitAt < SCORE_SUBMIT_COOLDOWN_MS) {
      return res.status(429).json({ error: '너무 빠르게 제출했습니다. 잠시 후 다시 시도하세요.' });
    }
    submitAt.set(ip, now);
    const { rank } = store.addScore(req.body?.name, score);
    res.json({ scores: store.getTop(10), rank });
  });
}
registerScoreboard('geometry-dash', SCORE_MAX);
registerScoreboard('bubble-bobble', BUBBLE_BOBBLE_SCORE_MAX);
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size, musicRooms: musicGame.groupGame.rooms.size, triangleRooms: triangleGame.rooms.size }));

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
    disconnectTimer: null,
    announceTimer: null
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
      choosing: room.game.choosing,
      chooseDeadline: room.game.choosing ? room.game.chooseDeadline : null,
      wordLength: room.settings.showWordLength && !room.game.choosing && room.game.answer
        ? room.game.answer.replace(/\s/g, '').length : null,
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
  if (player.announceTimer) clearTimeout(player.announceTimer);
  room.players.delete(userId);
  addSystemChat(room, `${player.nickname}님이 방을 나갔습니다.`);

  if (room.players.size === 0) {
    clearRoom(room.code);
    return;
  }
  if (room.hostId === userId) {
    const nextHost = [...room.players.values()].find((p) => p.connected) || [...room.players.values()][0];
    room.hostId = nextHost.userId;
    addSystemChat(room, `${nextHost.nickname}님이 새 방장이 되었습니다.`);
  }
  if (room.game.drawerId === userId && room.state === 'playing') {
    endRound(room, 'drawer-left');
  } else {
    sendSecret(room);
    emitRoomState(room);
  }
  if (reason === 'kicked') io.to(player.socketId).emit('room:kicked');
}

// 라운드/게임 진행 상태만 초기화한다(참가자 점수는 건드리지 않음).
function resetGame(room) {
  const timer = roomTimers.get(room.code);
  if (timer) clearTimeout(timer);
  roomTimers.delete(room.code);
  Object.assign(room.game, {
    round: 0, drawerId: null, previousDrawerId: null, answer: '', acceptedAnswers: [],
    pendingAcceptedAnswers: [], guessedIds: new Set(), correctOrder: [], endAt: null,
    hint: '', hintStage: 0, choosing: false, candidates: [], chooseDeadline: null,
    usedWords: [], drawingActions: [], redoActions: []
  });
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

// 이번 게임에서 이미 나온 단어(usedWords, 정규화됨)를 빼고 무작위로 count개를 뽑는다.
// 남은 후보가 모자라면 전체 목록에서 다시 뽑아 같은 단어가 또 나올 수 있게 한다.
function pickFresh(list, usedWords = [], count = 1) {
  const used = new Set(usedWords);
  let pool = list.filter((word) => !used.has(normalizeAnswer(word, true)));
  if (pool.length < count) pool = [...list];
  const bag = [...pool];
  const picks = [];
  while (picks.length < count && bag.length) {
    picks.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
  }
  return picks;
}

function difficultyOf(payload) {
  return ['easy', 'normal', 'hard'].includes(payload.difficulty) ? payload.difficulty : 'normal';
}

function chooseWord(payload, room) {
  if (payload.wordMode === 'custom') {
    const custom = cleanText(payload.customWord, 30);
    if (custom.length >= 1) return custom;
    return null;
  }
  if (payload.wordMode === 'selected') {
    const selected = cleanText(payload.preparedWord, 30);
    return Object.values(words).flat().includes(selected) ? selected : null;
  }
  return pickFresh(words[difficultyOf(payload)], room.game.usedWords, 1)[0] || null;
}

// 출제자가 고를 후보 단어 목록(2~5개)을 만든다. 출처는 무작위 또는 방장 직접 입력.
function chooseCandidates(payload, room) {
  if (payload.chooseSource === 'custom') {
    const raw = Array.isArray(payload.chooseWords) ? payload.chooseWords : [];
    const cleaned = [];
    for (const value of raw) {
      if (/\p{Cc}/u.test(String(value ?? ''))) return { error: '후보 단어에는 제어 문자를 사용할 수 없습니다.' };
      const word = cleanText(value, 30);
      if (word) cleaned.push(word);
    }
    const unique = [...new Map(cleaned.map((word) => [normalizeAnswer(word, true), word])).values()];
    if (unique.length < CHOOSE_WORD_MIN) return { error: `후보 단어를 ${CHOOSE_WORD_MIN}개 이상 입력해 주세요.` };
    return { candidates: unique.slice(0, CHOOSE_WORD_MAX) };
  }
  const count = Math.min(CHOOSE_WORD_MAX, Math.max(CHOOSE_WORD_MIN, Number(payload.chooseCount) || CHOOSE_WORD_MIN));
  const picks = pickFresh(words[difficultyOf(payload)], room.game.usedWords, count);
  if (picks.length < CHOOSE_WORD_MIN) return { error: '후보 단어를 만들 수 없습니다.' };
  return { candidates: picks };
}

// 두 글자열이 딱 한 글자만 다른지 검사한다(교체·추가·삭제 1회). 같으면 false.
function isOneEditApart(aText, bText) {
  if (aText === bText) return false;
  const a = [...aText];
  const b = [...bText];
  if (Math.abs(a.length - b.length) > 1) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) { i += 1; j += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (shorter.length === longer.length) { i += 1; j += 1; } else { j += 1; }
  }
  edits += longer.length - j;
  return edits === 1;
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

// 출제자가 후보 중 하나를 고를 때까지 기다리다가, 시간이 지나면 무작위로 하나 골라 라운드를 시작한다.
function scheduleWordChoice(room) {
  const oldTimer = roomTimers.get(room.code);
  if (oldTimer) clearTimeout(oldTimer);
  const timer = setTimeout(() => {
    if (room.state === 'playing' && room.game.choosing && room.game.candidates.length) {
      beginDrawing(room, room.game.candidates[Math.floor(Math.random() * room.game.candidates.length)]);
    }
  }, WORD_CHOICE_MS);
  roomTimers.set(room.code, timer);
}

// 제시어가 확정되어 실제로 그림을 그리기 시작하는 단계. (choose 모드는 출제자가 고른 뒤, 나머지는 즉시)
function beginDrawing(room, word) {
  room.game.choosing = false;
  room.game.candidates = [];
  room.game.chooseDeadline = null;
  room.game.answer = word;
  room.game.acceptedAnswers = [word, ...(room.game.pendingAcceptedAnswers || [])]
    .map((value) => cleanText(value, 30)).filter(Boolean).slice(0, 5);
  room.game.pendingAcceptedAnswers = [];
  room.game.guessedIds = new Set();
  room.game.correctOrder = [];
  room.game.endAt = Date.now() + room.settings.roundTime * 1000;
  room.game.hint = maskAnswer(word, 0);
  room.game.hintStage = 0;
  room.game.usedWords.push(normalizeAnswer(word, true));
  if (room.game.usedWords.length > USED_WORD_MEMORY) {
    room.game.usedWords.splice(0, room.game.usedWords.length - USED_WORD_MEMORY);
  }
  const drawer = room.players.get(room.game.drawerId);
  if (drawer) drawer.drawCount += 1;
  addSystemChat(room, `${room.game.round}라운드가 시작되었습니다!`);
  io.to(room.code).emit('canvas:sync', []);
  emitRoomState(room);
  sendSecret(room);
  scheduleRound(room);
}

function startRound(room, payload) {
  const hiddenWordModes = ['random', 'customList'];
  const choosesFromRandom = payload.wordMode === 'choose' && payload.chooseSource !== 'custom';
  if (room.settings.hostParticipates && !hiddenWordModes.includes(payload.wordMode) && !choosesFromRandom) {
    return '게임에 참여하는 방장은 무작위 제시어 방식만 사용할 수 있습니다.';
  }
  const drawerId = chooseDrawer(room, payload);
  if (!drawerId) return '그릴 사람을 선택해 주세요.';

  let word = null;
  let candidates = null;
  if (payload.wordMode === 'choose') {
    const built = chooseCandidates(payload, room);
    if (built.error) return built.error;
    candidates = built.candidates;
  } else if (payload.wordMode === 'customList') {
    const customList = validateCustomWordList(payload.customWords);
    if (customList.error) return customList.error;
    word = pickFresh(customList.words, room.game.usedWords, 1)[0];
  } else {
    word = chooseWord(payload, room);
  }
  if (!candidates && !word) return '올바른 제시어를 입력하거나 선택해 주세요.';

  room.state = 'playing';
  room.game.round += 1;
  room.game.previousDrawerId = room.game.drawerId;
  room.game.drawerId = drawerId;
  room.game.drawingActions = [];
  room.game.redoActions = [];
  room.game.guessedIds = new Set();
  room.game.correctOrder = [];
  room.game.pendingAcceptedAnswers = ['selected', 'custom'].includes(payload.wordMode) && Array.isArray(payload.acceptedAnswers)
    ? payload.acceptedAnswers : [];

  if (candidates) {
    room.game.choosing = true;
    room.game.candidates = candidates;
    room.game.answer = '';
    room.game.acceptedAnswers = [];
    room.game.endAt = null;
    room.game.hint = '';
    room.game.hintStage = 0;
    room.game.chooseDeadline = Date.now() + WORD_CHOICE_MS;
    io.to(room.code).emit('canvas:sync', []);
    emitRoomState(room);
    const drawer = room.players.get(drawerId);
    if (drawer?.connected) io.to(drawer.socketId).emit('game:choose-word', { candidates });
    scheduleWordChoice(room);
  } else {
    beginDrawing(room, word);
  }
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
  const aborted = room.game.choosing && !answer;
  room.game.choosing = false;
  room.game.candidates = [];
  room.game.chooseDeadline = null;
  room.state = room.game.round >= room.settings.totalRounds ? 'finished' : 'roundResult';
  room.game.endAt = null;
  room.game.drawingActions = [];
  room.game.redoActions = [];
  addSystemChat(room, aborted ? '출제자가 나가 이번 라운드를 건너뜁니다.' : `라운드 종료! 정답은 “${answer}”입니다.`);
  io.to(room.code).emit('round:ended', {
    answer: aborted ? '' : answer,
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
        pendingAcceptedAnswers: [], guessedIds: new Set(), correctOrder: [], endAt: null,
        hint: '', hintStage: 0, choosing: false, candidates: [], chooseDeadline: null,
        usedWords: [], drawingActions: [], redoActions: []
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
      if (existing.announceTimer) { clearTimeout(existing.announceTimer); existing.announceTimer = null; }
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
      if (room.game.choosing && room.game.drawerId === userId) socket.emit('game:choose-word', { candidates: room.game.candidates });
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
    if (room.state === 'playing' && player.userId === room.game.drawerId) {
      return ack({ ok: false, error: '출제 중에는 채팅을 입력할 수 없습니다.' });
    }
    if (room.state === 'playing' && room.game.guessedIds.has(player.userId)) {
      return ack({ ok: false, error: '정답을 맞힌 뒤에는 이번 라운드의 채팅을 입력할 수 없습니다.' });
    }
    if (!rateLimit(player, 'chat', 5_000, 7)) return ack({ ok: false, error: '메시지를 너무 빠르게 보내고 있습니다.' });

    if (room.state === 'playing' && !room.game.choosing) {
      const guess = normalizeAnswer(text, room.settings.ignoreSpaces);
      const accepted = room.game.acceptedAnswers.map((answer) => normalizeAnswer(answer, room.settings.ignoreSpaces));
      const correct = accepted.includes(guess);
      // 정답을 아는 진행 전용 방장이 정답 문자열을 일반 채팅으로 새지 않게 막는다.
      if (correct && player.userId === room.hostId && !room.settings.hostParticipates) {
        return ack({ ok: false, error: '진행 전용 방장은 정답에 참여할 수 없습니다.' });
      }
      // 정답이 두 글자 이상인데 딱 한 글자 차이면 본인에게만 "거의 맞았어요" 안내 (오타 구제).
      if (!correct && accepted.some((answer) => [...answer].length >= 2 && isOneEditApart(answer, guess))) {
        socket.emit('answer:close', { text });
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
    resetGame(room);
    room.state = 'waiting';
    addSystemChat(room, '새 게임을 준비합니다.');
    emitRoomState(room);
    ack({ ok: true });
  });

  socket.on('game:lobby', (_payload, ack = () => {}) => {
    const membership = requireHost(socket, ack);
    if (!membership) return;
    const { room } = membership;
    if (room.state !== 'finished') return ack({ ok: false, error: '게임이 끝난 뒤에 대기실로 돌아갈 수 있습니다.' });
    resetGame(room);
    room.state = 'waiting';
    addSystemChat(room, '대기실로 돌아왔습니다. 점수는 그대로 이어집니다.');
    emitRoomState(room);
    ack({ ok: true });
  });

  socket.on('game:pick-word', (payload = {}, ack = () => {}) => {
    const membership = requireMember(socket, ack);
    if (!membership) return;
    const { room, player } = membership;
    if (room.state !== 'playing' || !room.game.choosing || room.game.drawerId !== player.userId) {
      return ack({ ok: false, error: '지금은 제시어를 고를 수 없습니다.' });
    }
    const word = cleanText(payload.word, 30);
    if (!room.game.candidates.includes(word)) return ack({ ok: false, error: '제시된 후보 중에서 골라 주세요.' });
    const timer = roomTimers.get(room.code);
    if (timer) clearTimeout(timer);
    roomTimers.delete(room.code);
    beginDrawing(room, word);
    ack({ ok: true });
  });

  socket.on('canvas:draw', (payload = {}, ack = () => {}) => {
    const membership = requireMember(socket, ack);
    if (!membership) return;
    const { room, player } = membership;
    if (room.state !== 'playing' || room.game.choosing || room.game.drawerId !== player.userId) return ack({ ok: false, error: '현재 출제자만 그릴 수 있습니다.' });
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
    if (room.state !== 'playing' || room.game.choosing || room.game.drawerId !== player.userId) return ack({ ok: false, error: '현재 출제자만 캔버스를 바꿀 수 있습니다.' });
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
    // 화면 이동·짧은 끊김에는 알림을 내지 않는다. 3초 뒤에도 안 돌아오면 그때 처리한다.
    player.socketId = null;
    if (player.announceTimer) clearTimeout(player.announceTimer);
    player.announceTimer = setTimeout(() => {
      player.announceTimer = null;
      if (player.socketId) return; // 이미 재접속함
      player.connected = false;
      addSystemChat(room, `${player.nickname}님의 연결이 끊겼습니다. 30초 동안 기다립니다.`);
      emitRoomState(room);
      if (room.game.drawerId === player.userId && room.state === 'playing') endRound(room, 'drawer-left');
      player.disconnectTimer = setTimeout(() => leaveImmediately(room, player.userId, 'timeout'), RECONNECT_GRACE_MS);
    }, DISCONNECT_ANNOUNCE_MS);
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
  hintRevealCount, isOneEditApart, musicGame, triangleGame
};
