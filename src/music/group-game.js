const crypto = require('crypto');
const { checkAnswer, shuffle, text } = require('./service');

const MAX_PLAYERS = 30;
const RECONNECT_MS = 30_000;

function createGroupGame({ io, database, issueAudioToken }) {
  const rooms = new Map();
  const timers = new Map();

  function roomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do code = Array.from({ length: 6 }, () => chars[crypto.randomInt(chars.length)]).join('');
    while (rooms.has(code));
    return code;
  }

  function playerView(player, room) {
    return { userId: player.userId, nickname: player.nickname, score: player.score, ready: player.ready,
      connected: player.connected, isHost: room.hostId === player.userId, hasGuessed: room.guessedIds.has(player.userId) };
  }

  function publicRoom(room) {
    return { code: room.code, title: room.title, state: room.state, hostId: room.hostId,
      maxPlayers: room.maxPlayers, allowLateJoin: room.allowLateJoin, answerMode: room.answerMode,
      totalRounds: room.totalRounds, round: room.round, playerCount: room.players.size,
      players: [...room.players.values()].map((p) => playerView(p, room)), chat: room.chat.slice(-100),
      canJoin: room.players.size < room.maxPlayers && (room.state === 'waiting' || room.allowLateJoin) };
  }

  function publicList() {
    return [...rooms.values()].filter((r) => r.isPublic).map((r) => ({ code: r.code, title: r.title,
      playerCount: r.players.size, maxPlayers: r.maxPlayers, state: r.state,
      canJoin: r.players.size < r.maxPlayers && (r.state === 'waiting' || r.allowLateJoin),
      hostNickname: r.players.get(r.hostId)?.nickname || '', answerMode: r.answerMode, createdAt: r.createdAt }));
  }

  function emitList() { io.emit('music:rooms:list', publicList()); }
  function emitState(room) { io.to(`music:${room.code}`).emit('music:room:state', publicRoom(room)); emitList(); }
  function addChat(room, message) {
    room.chat.push({ id: crypto.randomUUID(), at: Date.now(), ...message });
    if (room.chat.length > 100) room.chat.splice(0, room.chat.length - 100);
    io.to(`music:${room.code}`).emit('music:chat:message', room.chat.at(-1));
  }
  function clearRoomTimer(code) { clearTimeout(timers.get(code)); timers.delete(code); }

  function membership(socket) {
    const room = rooms.get(socket.data.musicRoomCode);
    const player = room?.players.get(socket.data.musicUserId);
    if (!room || !player || player.socketId !== socket.id) return {};
    return { room, player };
  }

  function finishRound(room) {
    if (room.state !== 'playing') return;
    clearRoomTimer(room.code);
    const song = database.getSong(room.currentSongId, true);
    room.state = 'roundResult';
    room.lastAnswer = song ? { title: song.title, artist: song.artist } : null;
    io.to(`music:${room.code}`).emit('music:round:ended', { answer: room.lastAnswer,
      round: room.round, scores: [...room.players.values()].map((p) => ({ userId: p.userId, nickname: p.nickname, score: p.score })) });
    emitState(room);
    timers.set(room.code, setTimeout(() => {
      if (room.round >= room.totalRounds) finishGame(room);
      else startRound(room);
    }, 5_000));
  }

  function advanceStage(room) {
    if (room.state !== 'playing') return;
    if (room.stage >= 3) return finishRound(room);
    room.stage += 1;
    sendPlayback(room);
  }

  function sendPlaybackToPlayer(room, player, song, duration, playAt) {
    const audioToken = issueAudioToken({ songId: song.id, filename: song.audioFilename, scope: `group:${room.code}:${player.userId}` });
    io.to(player.socketId).emit('music:playback', { audioToken, startTime: song.startTime,
      duration, stage: room.stage, playAt, endAt: playAt + duration * 1000 + 12_000,
      round: room.round, totalRounds: room.totalRounds });
  }

  function sendPlayback(room) {
    clearRoomTimer(room.code);
    const song = database.getSong(room.currentSongId, true);
    if (!song) return finishRound(room);
    const duration = [song.firstDuration, song.secondDuration, song.thirdDuration][room.stage - 1];
    const playAt = Date.now() + 1_800;
    room.playAt = playAt;
    room.endAt = playAt + duration * 1000 + 12_000;
    for (const player of room.players.values()) {
      if (!player.connected) continue;
      sendPlaybackToPlayer(room, player, song, duration, playAt);
    }
    timers.set(room.code, setTimeout(() => advanceStage(room), duration * 1000 + 12_000));
    emitState(room);
  }

  function startRound(room) {
    clearRoomTimer(room.code);
    if (room.round >= room.songIds.length || room.round >= room.totalRounds) return finishGame(room);
    room.round += 1;
    room.currentSongId = room.songIds[room.round - 1];
    room.stage = 1;
    room.guessedIds.clear();
    room.state = 'playing';
    room.lastAnswer = null;
    sendPlayback(room);
  }

  function finishGame(room) {
    clearRoomTimer(room.code);
    room.state = 'finished';
    room.currentSongId = null;
    const ranking = [...room.players.values()].sort((a, b) => b.score - a.score)
      .map((p, index) => ({ rank: index + 1, userId: p.userId, nickname: p.nickname, score: p.score, correctCount: p.correctCount }));
    io.to(`music:${room.code}`).emit('music:game:finished', { ranking });
    emitState(room);
  }

  function leave(socket, reason = 'left') {
    const { room, player } = membership(socket);
    if (!room) return;
    room.players.delete(player.userId);
    socket.leave(`music:${room.code}`);
    socket.data.musicRoomCode = null;
    if (!room.players.size) { clearRoomTimer(room.code); rooms.delete(room.code); emitList(); return; }
    if (room.hostId === player.userId) room.hostId = room.players.keys().next().value;
    addChat(room, { type: 'system', text: `${player.nickname}님이 방에서 나갔습니다.`, reason });
    emitState(room);
  }

  io.on('connection', (socket) => {
    socket.on('music:rooms:list', () => socket.emit('music:rooms:list', publicList()));
    socket.on('music:room:create', (raw, ack = () => {}) => {
      const nickname = text(raw?.nickname, 30); const userId = text(raw?.userId, 80);
      if (!nickname || !userId) return ack({ ok: false, message: '닉네임을 입력해 주세요.' });
      const code = roomCode();
      const room = { code, title: text(raw.title, 40) || '신나는 노래 퀴즈', isPublic: raw.isPublic !== false,
        maxPlayers: Math.min(MAX_PLAYERS, Math.max(2, Number(raw.maxPlayers) || 10)), allowLateJoin: Boolean(raw.allowLateJoin),
        hostId: userId, players: new Map(), state: 'waiting', totalRounds: Math.min(50, Math.max(1, Number(raw.totalRounds) || 10)),
        answerMode: ['title', 'artist', 'both'].includes(raw.answerMode) ? raw.answerMode : 'title',
        setId: Number(raw.setId) || null, round: 0, stage: 0, songIds: [], currentSongId: null,
        guessedIds: new Set(), chat: [], createdAt: Date.now() };
      room.players.set(userId, { userId, nickname, socketId: socket.id, connected: true, ready: true, score: 0, correctCount: 0 });
      rooms.set(code, room); socket.data.musicRoomCode = code; socket.data.musicUserId = userId; socket.join(`music:${code}`);
      addChat(room, { type: 'system', text: `${nickname}님이 방을 만들었습니다.` }); emitState(room); ack({ ok: true, code });
    });

    socket.on('music:room:join', (raw, ack = () => {}) => {
      const code = text(raw?.code, 6).toUpperCase(); const room = rooms.get(code);
      const nickname = text(raw?.nickname, 30); const userId = text(raw?.userId, 80);
      if (!room) return ack({ ok: false, message: '방을 찾을 수 없습니다.' });
      const existing = room.players.get(userId);
      if (!existing && room.players.size >= room.maxPlayers) return ack({ ok: false, message: '방이 가득 찼습니다.' });
      if (!existing && room.state !== 'waiting' && !room.allowLateJoin) return ack({ ok: false, message: '이미 게임이 시작되었습니다.' });
      if ([...room.players.values()].some((p) => p.userId !== userId && p.nickname.toLocaleLowerCase('ko-KR') === nickname.toLocaleLowerCase('ko-KR'))) return ack({ ok: false, message: '이미 사용 중인 닉네임입니다.' });
      const player = existing || { userId, nickname, ready: false, score: 0, correctCount: 0 };
      clearTimeout(player.disconnectTimer); Object.assign(player, { nickname, socketId: socket.id, connected: true }); room.players.set(userId, player);
      socket.data.musicRoomCode = code; socket.data.musicUserId = userId; socket.join(`music:${code}`);
      addChat(room, { type: 'system', text: `${nickname}님이 참가했습니다.` }); emitState(room); ack({ ok: true, code });
      if (room.state === 'playing') {
        const song = database.getSong(room.currentSongId, true);
        const duration = song && [song.firstDuration, song.secondDuration, song.thirdDuration][room.stage - 1];
        if (song && duration) sendPlaybackToPlayer(room, player, song, duration, Date.now() + 500);
      }
    });

    socket.on('music:room:ready', (ready, ack = () => {}) => {
      const { room, player } = membership(socket); if (!room) return ack({ ok: false });
      if (room.hostId === player.userId) return ack({ ok: false, message: '방장은 준비할 필요가 없습니다.' });
      player.ready = Boolean(ready); emitState(room); ack({ ok: true });
    });

    socket.on('music:game:start', (_raw, ack = () => {}) => {
      const { room, player } = membership(socket); if (!room || room.hostId !== player.userId) return ack({ ok: false, message: '방장만 시작할 수 있습니다.' });
      if (room.state !== 'waiting' && room.state !== 'finished') return ack({ ok: false, message: '지금은 시작할 수 없습니다.' });
      if (room.players.size < 2) return ack({ ok: false, message: '2명 이상 모여야 시작할 수 있습니다.' });
      if ([...room.players.values()].some((p) => p.userId !== room.hostId && !p.ready)) return ack({ ok: false, message: '모든 참가자가 준비해야 합니다.' });
      let ids = room.setId ? database.getSetSongIds(room.setId, 'group') : database.listSongs({ active: true, limit: 500, privateFields: true }).songs.filter((s) => s.useInGroup).map((s) => s.id);
      ids = shuffle(ids).slice(0, room.totalRounds);
      if (!ids.length) return ack({ ok: false, message: '사용 가능한 단체전 음원이 없습니다.' });
      room.songIds = ids; room.totalRounds = ids.length; room.round = 0;
      for (const p of room.players.values()) { p.score = 0; p.correctCount = 0; }
      startRound(room); ack({ ok: true });
    });

    socket.on('music:answer', (raw, ack = () => {}) => {
      const { room, player } = membership(socket);
      if (!room || room.state !== 'playing') return ack({ ok: false, message: '진행 중인 문제가 아닙니다.' });
      if (room.guessedIds.has(player.userId)) return ack({ ok: false, message: '이미 정답을 맞혔습니다.' });
      const song = database.getSong(room.currentSongId, true);
      if (!song || !checkAnswer(song, room.answerMode, raw || {})) {
        return ack({ ok: true, correct: false });
      }
      const base = [100, 70, 40][room.stage - 1]; const speed = Math.max(0, Math.ceil((room.endAt - Date.now()) / 1000));
      const points = base + Math.min(30, speed); player.score += points; player.correctCount += 1; room.guessedIds.add(player.userId);
      addChat(room, { type: 'correct', userId: player.userId, nickname: player.nickname, text: `${player.nickname}님이 정답을 맞혔습니다!`, points });
      io.to(player.socketId).emit('music:answer:result', { correct: true, points }); emitState(room); ack({ ok: true, correct: true, points });
      const eligible = [...room.players.values()].filter((p) => p.connected);
      if (eligible.every((p) => room.guessedIds.has(p.userId))) finishRound(room);
    });

    socket.on('music:chat:send', (raw, ack = () => {}) => {
      const { room, player } = membership(socket); if (!room) return ack({ ok: false });
      if (room.state === 'playing' && room.guessedIds.has(player.userId)) return ack({ ok: false, message: '정답자는 이 라운드에 채팅할 수 없습니다.' });
      const value = text(raw?.text, 200); if (!value) return ack({ ok: false });
      const song = room.currentSongId && database.getSong(room.currentSongId, true);
      if (room.state === 'playing' && song && (checkAnswer(song, 'title', { value }) || checkAnswer(song, 'artist', { value }))) return ack({ ok: false, message: '정답은 답안 칸에 입력해 주세요.' });
      addChat(room, { type: 'chat', userId: player.userId, nickname: player.nickname, text: value }); ack({ ok: true });
    });

    socket.on('music:room:leave', (_raw, ack = () => {}) => { leave(socket); ack({ ok: true }); });
    socket.on('disconnect', () => {
      const { room, player } = membership(socket); if (!room) return;
      player.connected = false; emitState(room);
      player.disconnectTimer = setTimeout(() => {
        if (!player.connected && room.players.get(player.userId) === player) {
          socket.data.musicRoomCode = room.code; socket.data.musicUserId = player.userId; leave(socket, 'disconnect');
        }
      }, RECONNECT_MS);
    });
  });

  function endRoom(code, message = '관리자가 게임을 종료했습니다.') {
    const room = rooms.get(code); if (!room) return false;
    clearRoomTimer(code); room.state = 'finished'; room.currentSongId = null;
    io.to(`music:${room.code}`).emit('music:admin:announcement', { text: message }); emitState(room); return true;
  }

  return { rooms, publicList, endRoom, close: () => { for (const timer of timers.values()) clearTimeout(timer); rooms.clear(); } };
}

module.exports = { createGroupGame };
