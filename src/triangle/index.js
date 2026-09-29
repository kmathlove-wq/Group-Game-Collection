const path = require('path');
const crypto = require('crypto');
const geometry = require('./geometry');

const MAX_PLAYERS = 4;
const DISCONNECT_GRACE_MS = 3_000;
const RECONNECT_MS = 30_000;
const TURN_TIMES = [0, 15, 30, 60]; // 0 = 제한 없음
const COLORS = ['#ff4d75', '#3b82f6', '#10b981', '#f59e0b'];
const CHAT_LIMIT = 100;

function text(value, maxLength) {
  return [...String(value ?? '').replace(/[<>\p{Cc}]/gu, '').trim()].slice(0, maxLength).join('');
}

// 삼각형 수로 순위를 매긴다. 동점이면 같은 등수(1, 1, 3 …)가 된다.
function rankPlayers(players) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return sorted.map((p, index) => ({
    rank: sorted.findIndex((q) => q.score === p.score) + 1,
    userId: p.userId, nickname: p.nickname, color: p.color, score: p.score
  }));
}

function setupTriangleGame({ app, io, rootDir }) {
  const page = (name) => (_req, res) => res.sendFile(path.join(rootDir, 'public', name));
  app.get('/triangle', page('triangle-lobby.html'));
  app.get('/triangle/room', page('triangle-room.html'));
  app.get('/triangle-geometry.js', (_req, res) => res.sendFile(path.join(__dirname, 'geometry.js')));

  const rooms = new Map();
  const timers = new Map();
  const channel = (room) => `tri:${room.code}`;

  function roomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do code = Array.from({ length: 6 }, () => chars[crypto.randomInt(chars.length)]).join('');
    while (rooms.has(code));
    return code;
  }

  function freeColor(room) {
    const used = new Set([...room.players.values()].map((p) => p.color));
    return COLORS.find((c) => !used.has(c)) || COLORS[0];
  }

  function publicGame(game) {
    if (!game) return null;
    return { points: game.points, edges: game.edges, triangles: game.triangles, turnUserId: game.turnUserId,
      turnMsLeft: game.turnEndsAt ? Math.max(0, game.turnEndsAt - Date.now()) : null,
      moveCount: game.edges.length, ranking: game.ranking || null };
  }

  function publicRoom(room) {
    return { code: room.code, title: room.title, state: room.state, hostId: room.hostId, maxPlayers: room.maxPlayers,
      turnTime: room.turnTime, isPublic: room.isPublic, playerCount: room.players.size,
      players: [...room.players.values()].map((p) => ({ userId: p.userId, nickname: p.nickname, color: p.color,
        ready: p.ready, connected: p.connected, score: p.score, isHost: room.hostId === p.userId })),
      game: publicGame(room.game) };
  }

  function publicList() {
    return [...rooms.values()].filter((r) => r.isPublic).map((r) => ({ code: r.code, title: r.title,
      playerCount: r.players.size, maxPlayers: r.maxPlayers, state: r.state, turnTime: r.turnTime,
      canJoin: r.state !== 'playing' && r.players.size < r.maxPlayers,
      hostNickname: r.players.get(r.hostId)?.nickname || '', createdAt: r.createdAt }));
  }

  function emitList() { io.emit('tri:rooms:list', publicList()); }
  function emitState(room) { io.to(channel(room)).emit('tri:room:state', publicRoom(room)); emitList(); }
  function addChat(room, message) {
    room.chat.push({ id: crypto.randomUUID(), at: Date.now(), ...message });
    if (room.chat.length > CHAT_LIMIT) room.chat.splice(0, room.chat.length - CHAT_LIMIT);
    io.to(channel(room)).emit('tri:chat:message', room.chat.at(-1));
  }
  function clearTimer(room) { clearTimeout(timers.get(room.code)); timers.delete(room.code); }

  function membership(socket) {
    const room = rooms.get(socket.data.triRoomCode);
    const player = room?.players.get(socket.data.triUserId);
    if (!room || !player || player.socketId !== socket.id) return {};
    return { room, player };
  }

  function finishGame(room, reason = '') {
    clearTimer(room);
    room.state = 'finished';
    room.game.turnUserId = null;
    room.game.turnEndsAt = null;
    room.game.ranking = rankPlayers(room.players.values());
    if (reason) addChat(room, { type: 'system', text: reason });
    io.to(channel(room)).emit('tri:game:finished', { ranking: room.game.ranking });
    emitState(room);
  }

  // 지금 차례 다음의 접속 중인 사람에게 차례를 넘긴다(나간·끊긴 사람은 건너뜀).
  function nextTurn(room) {
    clearTimer(room);
    // 떠난 사람도 order에 남겨 두어야 "그 사람 다음 자리"를 정확히 찾을 수 있다.
    const { order } = room.game;
    const current = Math.max(0, order.indexOf(room.game.turnUserId));
    let next = null;
    for (let step = 1; step <= order.length; step += 1) {
      const id = order[(current + step) % order.length];
      if (room.players.get(id)?.connected) { next = id; break; }
    }
    room.game.turnUserId = next;
    if (!next) { room.game.turnEndsAt = null; return; }
    room.game.turnEndsAt = room.turnTime ? Date.now() + room.turnTime * 1000 : null;
    if (room.turnTime) {
      timers.set(room.code, setTimeout(() => {
        if (room.state !== 'playing' || room.game.turnUserId !== next) return;
        addChat(room, { type: 'system', text: `${room.players.get(next)?.nickname || '참가자'}님의 시간이 끝나 차례가 넘어갑니다.` });
        nextTurn(room); emitState(room);
      }, room.turnTime * 1000));
    }
  }

  function startGame(room) {
    const order = [...room.players.keys()];
    for (const p of room.players.values()) p.score = 0;
    room.game = { points: geometry.generatePoints(geometry.pointCountFor(order.length)), edges: [], triangles: [],
      order, turnUserId: order[order.length - 1], turnEndsAt: null, ranking: null };
    room.state = 'playing';
    nextTurn(room); // 마지막 사람 다음 = 첫 번째 사람부터 시작
    addChat(room, { type: 'system', text: `게임 시작! 점 ${room.game.points.length}개가 찍혔어요.` });
    emitState(room);
  }

  function leave(socket, reason = 'left') {
    const { room, player } = membership(socket);
    if (!room) return;
    clearTimeout(player.disconnectTimer);
    room.players.delete(player.userId);
    socket.leave(channel(room));
    socket.data.triRoomCode = null;
    if (!room.players.size) { clearTimer(room); rooms.delete(room.code); emitList(); return; }
    if (room.hostId === player.userId) room.hostId = room.players.keys().next().value;
    addChat(room, { type: 'system', text: `${player.nickname}님이 방에서 나갔습니다.`, reason });
    if (room.state === 'playing') {
      if (room.players.size < 2) return finishGame(room, '참가자가 1명만 남아 게임을 끝냅니다.');
      if (room.game.turnUserId === player.userId) nextTurn(room);
    }
    emitState(room);
  }

  function closeRoom(room, message = '방장이 방을 종료했습니다.') {
    clearTimer(room);
    io.to(channel(room)).emit('tri:room:closed', { message });
    for (const player of room.players.values()) {
      clearTimeout(player.disconnectTimer);
      const playerSocket = io.sockets.sockets.get(player.socketId);
      if (!playerSocket) continue;
      playerSocket.leave(channel(room));
      if (playerSocket.data.triRoomCode === room.code) playerSocket.data.triRoomCode = null;
    }
    rooms.delete(room.code); emitList();
  }

  io.on('connection', (socket) => {
    socket.on('tri:rooms:list', () => socket.emit('tri:rooms:list', publicList()));

    socket.on('tri:room:create', (raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const nickname = text(raw?.nickname, 30); const userId = text(raw?.userId, 80);
      if (!nickname || !userId) return ack({ ok: false, message: '닉네임을 입력해 주세요.' });
      const turnTime = Number(raw?.turnTime);
      const code = roomCode();
      const room = { code, title: text(raw?.title, 30) || '삼각형 땅따먹기', isPublic: raw?.isPublic !== false,
        maxPlayers: Math.min(MAX_PLAYERS, Math.max(2, Number(raw?.maxPlayers) || MAX_PLAYERS)),
        turnTime: TURN_TIMES.includes(turnTime) ? turnTime : 30,
        hostId: userId, players: new Map(), state: 'waiting', game: null, chat: [], createdAt: Date.now() };
      room.players.set(userId, { userId, nickname, socketId: socket.id, connected: true, ready: true, score: 0, color: COLORS[0] });
      rooms.set(code, room); socket.data.triRoomCode = code; socket.data.triUserId = userId; socket.join(channel(room));
      addChat(room, { type: 'system', text: `${nickname}님이 방을 만들었습니다.` }); emitState(room); ack({ ok: true, code });
    });

    socket.on('tri:room:join', (raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const code = text(raw?.code, 6).toUpperCase(); const room = rooms.get(code);
      const nickname = text(raw?.nickname, 30); const userId = text(raw?.userId, 80);
      if (!nickname || !userId) return ack({ ok: false, message: '닉네임을 입력해 주세요.' });
      if (!room) return ack({ ok: false, message: '방을 찾을 수 없습니다.' });
      const existing = room.players.get(userId);
      if (!existing && room.players.size >= room.maxPlayers) return ack({ ok: false, message: '방이 가득 찼습니다.' });
      if (!existing && room.state === 'playing') return ack({ ok: false, message: '이미 게임이 시작되었습니다.' });
      const lower = nickname.toLocaleLowerCase('ko-KR');
      if ([...room.players.values()].some((p) => p.userId !== userId && p.nickname.toLocaleLowerCase('ko-KR') === lower)) {
        return ack({ ok: false, message: '이미 사용 중인 닉네임입니다.' });
      }
      const player = existing || { userId, ready: false, score: 0, color: freeColor(room) };
      const wasAway = existing && !existing.connected;
      clearTimeout(player.disconnectTimer);
      Object.assign(player, { nickname, socketId: socket.id, connected: true });
      room.players.set(userId, player);
      socket.data.triRoomCode = code; socket.data.triUserId = userId; socket.join(channel(room));
      if (!existing) addChat(room, { type: 'system', text: `${nickname}님이 참가했습니다.` });
      socket.emit('tri:chat:history', room.chat); // 새로고침·화면 이동 뒤에도 지난 채팅이 보이게
      // 모두 끊겨 멈춰 있던 게임이면 돌아온 사람부터 다시 진행한다.
      if (wasAway && room.state === 'playing' && !room.game.turnUserId) {
        room.game.turnUserId = room.game.order[(room.game.order.indexOf(userId) - 1 + room.game.order.length) % room.game.order.length];
        nextTurn(room);
      }
      emitState(room); ack({ ok: true, code });
    });

    socket.on('tri:room:ready', (ready, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket); if (!room) return ack({ ok: false });
      if (room.hostId === player.userId) return ack({ ok: false, message: '방장은 준비할 필요가 없습니다.' });
      player.ready = Boolean(ready); emitState(room); ack({ ok: true });
    });

    socket.on('tri:game:start', (_raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket);
      if (!room || room.hostId !== player.userId) return ack({ ok: false, message: '방장만 시작할 수 있습니다.' });
      if (room.state === 'playing') return ack({ ok: false, message: '이미 게임 중입니다.' });
      if (room.players.size < 2) return ack({ ok: false, message: '2명 이상 모여야 시작할 수 있습니다.' });
      if ([...room.players.values()].some((p) => p.userId !== room.hostId && !p.ready)) {
        return ack({ ok: false, message: '모든 참가자가 준비해야 합니다.' });
      }
      startGame(room); ack({ ok: true });
    });

    socket.on('tri:move', (raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket);
      if (!room || room.state !== 'playing') return ack({ ok: false, message: '게임 중이 아닙니다.' });
      if (room.game.turnUserId !== player.userId) return ack({ ok: false, message: '내 차례가 아니에요.' });
      const a = Number(raw?.a); const b = Number(raw?.b);
      const { points, edges } = room.game;
      const check = geometry.checkEdge(points, edges, a, b);
      if (!check.ok) return ack(check);
      edges.push({ a, b, by: player.userId });
      const made = geometry.newTriangles(points, edges, a, b).map(([x, y, z]) => ({ a: x, b: y, c: z, by: player.userId }));
      room.game.triangles.push(...made);
      player.score += made.length;
      io.to(channel(room)).emit('tri:move:made', { a, b, by: player.userId, triangles: made });
      if (made.length) addChat(room, { type: 'land', userId: player.userId, color: player.color, text: `${player.nickname}님이 삼각형 땅 ${made.length}개를 얻었어요!` });
      ack({ ok: true, triangles: made.length });
      if (!geometry.hasAnyMove(points, edges)) return finishGame(room, '더 그을 수 있는 선이 없어요. 게임 끝!');
      nextTurn(room); emitState(room);
    });

    socket.on('tri:chat:send', (raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket); if (!room) return ack({ ok: false });
      const value = text(raw?.text, 200); if (!value) return ack({ ok: false });
      addChat(room, { type: 'chat', userId: player.userId, nickname: player.nickname, text: value }); ack({ ok: true });
    });

    socket.on('tri:room:close', (_raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket);
      if (!room || room.hostId !== player.userId) return ack({ ok: false, message: '방장만 방을 종료할 수 있습니다.' });
      closeRoom(room); ack({ ok: true });
    });

    socket.on('tri:room:leave', (_raw, ack = () => {}) => { leave(socket); if (typeof ack === 'function') ack({ ok: true }); });

    // 새로고침·화면 이동처럼 금방 돌아오는 경우를 위해 3초 기다린 뒤에야 "연결 끊김"으로 처리한다.
    socket.on('disconnect', () => {
      const { room, player } = membership(socket); if (!room) return;
      player.disconnectTimer = setTimeout(() => {
        if (room.players.get(player.userId) !== player || player.socketId !== socket.id) return;
        player.connected = false;
        if (room.state === 'playing' && room.game.turnUserId === player.userId) nextTurn(room);
        emitState(room);
        player.disconnectTimer = setTimeout(() => {
          if (!player.connected && room.players.get(player.userId) === player) {
            socket.data.triRoomCode = room.code; socket.data.triUserId = player.userId; leave(socket, 'disconnect');
          }
        }, RECONNECT_MS);
      }, DISCONNECT_GRACE_MS);
    });
  });

  return { rooms, publicList, close: () => { for (const timer of timers.values()) clearTimeout(timer); rooms.clear(); } };
}

module.exports = { setupTriangleGame, rankPlayers };
