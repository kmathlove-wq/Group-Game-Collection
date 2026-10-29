const path = require('path');
const crypto = require('crypto');
const Arena = require('./arena');

// 인간 vs 바퀴벌레: 3~12명. 시작하면 서버가 무작위로 인간(1~3명)과 바퀴벌레(나머지)를 나눈다.
// 판은 서버가 0.05초마다 움직이고(서버 권위 틱), 화면은 방향(각도)·움직임 여부·공격만 보낸다.
// 숨은 바퀴벌레의 위치는 인간에게 절대 보내지 않는다(보는 사람에 따라 틱 내용이 다름).
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 12;
const MINUTES = [2, 3, 4];
const COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#a855f7'];
const DISCONNECT_GRACE_MS = 3_000;
const RECONNECT_MS = 30_000;
const CHAT_LIMIT = 100;
const REASONS = {
  caught: '🩴 인간이 바퀴벌레를 모두 잡았어요!',
  noRoaches: '🚪 바퀴벌레가 모두 나가서 인간이 이겼어요.',
  crumbs: '🍞 바퀴벌레가 부스러기 목표를 다 먹었어요!',
  time: '⏰ 시간이 끝날 때까지 바퀴벌레가 살아남았어요!',
  noHumans: '🚪 인간이 모두 나가서 바퀴벌레가 이겼어요.'
};

function text(value, maxLength) {
  return Array.from(String(value ?? '').replace(/\p{Cc}/gu, '').trim()).slice(0, maxLength).join('');
}

// 역할 나누기: 섞은 뒤 앞에서부터 인간, 나머지는 바퀴벌레.
function assignRoles(ids, wantedHumans = 0, randomInt = crypto.randomInt) {
  const order = [...ids];
  for (let i = order.length - 1; i > 0; i -= 1) { const j = randomInt(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  const humans = Arena.humanCountFor(order.length, wantedHumans);
  return new Map(order.map((id, i) => [id, i < humans ? 'human' : 'roach']));
}

function setupRoachGame({ app, io, rootDir, tickMs = 50, gameSeconds = null, countdownSeconds = 3 }) {
  const page = (name) => (_req, res) => res.sendFile(path.join(rootDir, 'public', name));
  app.get('/roach', page('roach.html'));
  app.get('/roach/room', page('roach-room.html'));

  const rooms = new Map();
  const channel = (room) => `roach:${room.code}`;
  let gameCounter = 0;

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
  const playing = (room) => room.state === 'playing' && room.game;

  function publicGame(room) {
    const { game } = room; if (!game) return null;
    const a = game.arena;
    const roaches = a.players.filter((p) => p.role === 'roach');
    return { id: game.id, phase: a.phase, left: Arena.timeLeft(a), score: a.score, goal: a.goal, winner: a.winner, reason: a.reason,
      humans: a.players.filter((p) => p.role === 'human').length, roaches: roaches.length, aliveRoaches: roaches.filter((p) => p.alive).length,
      minutes: game.minutes };
  }
  function publicRoom(room) {
    const a = room.game?.arena;
    return { code: room.code, title: room.title, state: room.state, hostId: room.hostId, maxPlayers: room.maxPlayers,
      minutes: room.minutes, humans: room.humans, isPublic: room.isPublic, playerCount: room.players.size,
      players: [...room.players.values()].map((p) => {
        const ap = a?.byId.get(p.userId);
        return { userId: p.userId, nickname: p.nickname, color: p.color, ready: p.ready, connected: p.connected,
          isHost: room.hostId === p.userId, inGame: Boolean(ap), n: ap?.n ?? null, role: ap?.role ?? null,
          alive: ap ? ap.alive : true, eaten: ap?.eaten ?? 0, catches: ap?.catches ?? 0 };
      }),
      // 게임에 있었지만 방을 떠난 사람도 번호로 이름을 찾을 수 있게.
      roster: room.game ? room.game.roster : [],
      game: publicGame(room) };
  }
  function publicList() {
    return [...rooms.values()].filter((r) => r.isPublic).map((r) => ({ code: r.code, title: r.title,
      playerCount: r.players.size, maxPlayers: r.maxPlayers, state: r.state, minutes: r.minutes,
      canJoin: r.state !== 'playing' && r.players.size < r.maxPlayers,
      hostNickname: r.players.get(r.hostId)?.nickname || '', createdAt: r.createdAt }));
  }
  function emitList() { io.emit('roach:rooms:list', publicList()); }
  function emitState(room) { io.to(channel(room)).emit('roach:room:state', publicRoom(room)); emitList(); }

  function addChat(room, message) {
    room.chat.push({ id: crypto.randomUUID(), at: Date.now(), ...message });
    if (room.chat.length > CHAT_LIMIT) room.chat.splice(0, room.chat.length - CHAT_LIMIT);
    io.to(channel(room)).emit('roach:chat:message', room.chat.at(-1));
  }
  function membership(socket) {
    const room = rooms.get(socket.data.roachRoomCode);
    const player = room?.players.get(socket.data.roachUserId);
    if (!room || !player || player.socketId !== socket.id) return {};
    return { room, player };
  }

  // 이 사람이 숨은 바퀴를 볼 수 있나: 바퀴벌레(살았든 잡혔든)만. 인간은 절대 못 본다.
  const seesHidden = (room, userId) => room.game?.arena.byId.get(userId)?.role === 'roach';

  // 처음 들어오거나 다시 들어왔을 때 판 전체를 보낸다.
  function snapshotFor(room, userId) {
    const a = room.game.arena;
    return { gameId: room.game.id, map: Arena.mapData(), rules: Arena.rules(), tickMs, t: a.time, phase: a.phase,
      left: Arena.timeLeft(a), score: a.score, goal: a.goal, crumbs: Arena.crumbList(a),
      p: Arena.viewPlayers(a, seesHidden(room, userId)), me: Arena.selfView(a, userId) };
  }

  function tick(room) {
    const { game } = room; const a = game.arena;
    Arena.step(a, Arena.TICK_SECONDS);
    const ev = Arena.drainEvents(a);
    const base = { t: a.time, phase: a.phase, left: Arena.timeLeft(a), score: a.score, goal: a.goal, ev };
    if (game.sentCrumbs !== a.crumbVersion) { base.c = Arena.crumbList(a); game.sentCrumbs = a.crumbVersion; }
    const views = { true: Arena.viewPlayers(a, true), false: Arena.viewPlayers(a, false) };
    for (const player of room.players.values()) {
      if (!player.connected) continue;
      io.to(player.socketId).emit('roach:tick', { ...base, p: views[seesHidden(room, player.userId)], me: Arena.selfView(a, player.userId) });
    }
    // 바퀴가 잡히거나 부활하면 대기실 목록의 생존 표시도 바꿔 준다.
    if (ev.some((e) => e.k === 'squash' || e.k === 'revive') || (a.phase !== game.lastPhase)) { game.lastPhase = a.phase; emitState(room); }
    if (a.winner) finishGame(room);
  }

  function stopLoop(room) { clearInterval(room.loop); room.loop = null; }

  function finishGame(room) {
    stopLoop(room);
    const a = room.game.arena;
    room.state = 'finished';
    addChat(room, { type: 'system', text: `${a.winner === 'humans' ? '🧑 인간 팀 승리!' : '🪳 바퀴벌레 팀 승리!'} ${REASONS[a.reason] || ''}` });
    emitState(room);
    const stats = a.players.map((p) => ({ userId: p.id, nickname: room.game.names.get(p.id), role: p.role, alive: p.alive && !p.gone,
      gone: p.gone, eaten: p.eaten, catches: p.catches }));
    io.to(channel(room)).emit('roach:game:finished', { gameId: room.game.id, winner: a.winner, reason: a.reason, message: REASONS[a.reason] || '',
      score: a.score, goal: a.goal, stats });
  }

  function startGame(room) {
    const ids = [...room.players.keys()];
    const roles = assignRoles(ids, room.humans);
    const arena = Arena.createArena({ players: ids.map((id) => ({ id, role: roles.get(id) })),
      durationSec: gameSeconds ?? room.minutes * 60, countdownSec: countdownSeconds });
    if (gameSeconds != null) arena.goal = Arena.crumbGoal(ids.length - Arena.humanCountFor(ids.length, room.humans), room.minutes);
    const names = new Map(ids.map((id) => [id, room.players.get(id).nickname]));
    room.game = { id: ++gameCounter, arena, names, minutes: room.minutes, sentCrumbs: -1, lastPhase: arena.phase,
      roster: arena.players.map((p) => ({ n: p.n, userId: p.id, nickname: names.get(p.id), color: room.players.get(p.id).color, role: p.role })) };
    room.state = 'playing';
    const humans = arena.players.filter((p) => p.role === 'human').length;
    addChat(room, { type: 'system', text: `게임 시작! 🧑 인간 ${humans}명 vs 🪳 바퀴벌레 ${ids.length - humans}마리` });
    emitState(room);
    for (const player of room.players.values()) io.to(player.socketId).emit('roach:snapshot', snapshotFor(room, player.userId));
    stopLoop(room);
    room.loop = setInterval(() => tick(room), tickMs);
  }

  function leave(socket, reason = 'left') {
    const { room, player } = membership(socket);
    if (!room) return;
    clearTimeout(player.disconnectTimer);
    room.players.delete(player.userId);
    socket.leave(channel(room));
    socket.data.roachRoomCode = null;
    if (playing(room)) Arena.removePlayer(room.game.arena, player.userId);
    if (!room.players.size) { stopLoop(room); rooms.delete(room.code); emitList(); return; }
    if (room.hostId === player.userId) room.hostId = room.players.keys().next().value;
    addChat(room, { type: 'system', text: `${player.nickname}님이 방에서 나갔습니다.`, reason });
    emitState(room);
  }

  function closeRoom(room, message = '방장이 방을 종료했습니다.') {
    stopLoop(room);
    io.to(channel(room)).emit('roach:room:closed', { message });
    for (const player of room.players.values()) {
      clearTimeout(player.disconnectTimer);
      const playerSocket = io.sockets.sockets.get(player.socketId);
      if (!playerSocket) continue;
      playerSocket.leave(channel(room));
      if (playerSocket.data.roachRoomCode === room.code) playerSocket.data.roachRoomCode = null;
    }
    rooms.delete(room.code); emitList();
  }

  const okAck = (ack) => (typeof ack === 'function' ? ack : () => {});

  io.on('connection', (socket) => {
    socket.on('roach:rooms:list', () => socket.emit('roach:rooms:list', publicList()));

    socket.on('roach:room:create', (raw, ack) => {
      ack = okAck(ack);
      const nickname = text(raw?.nickname, 20); const userId = text(raw?.userId, 80);
      if (!nickname || !userId) return ack({ ok: false, message: '닉네임을 입력해 주세요.' });
      const minutes = Number(raw?.minutes);
      const code = roomCode();
      const room = { code, title: text(raw?.title, 30) || '인간 vs 바퀴벌레', isPublic: raw?.isPublic !== false,
        maxPlayers: Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Number(raw?.maxPlayers) || 8)),
        minutes: MINUTES.includes(minutes) ? minutes : 3, humans: 0,
        hostId: userId, players: new Map(), state: 'waiting', game: null, chat: [], loop: null, createdAt: Date.now() };
      room.players.set(userId, { userId, nickname, socketId: socket.id, connected: true, ready: true, color: COLORS[0] });
      rooms.set(code, room); socket.data.roachRoomCode = code; socket.data.roachUserId = userId; socket.join(channel(room));
      addChat(room, { type: 'system', text: `${nickname}님이 방을 만들었습니다.` }); emitState(room); ack({ ok: true, code });
    });

    socket.on('roach:room:join', (raw, ack) => {
      ack = okAck(ack);
      const code = text(raw?.code, 6).toUpperCase(); const room = rooms.get(code);
      const nickname = text(raw?.nickname, 20); const userId = text(raw?.userId, 80);
      if (!nickname || !userId) return ack({ ok: false, message: '닉네임을 입력해 주세요.' });
      if (!room) return ack({ ok: false, message: '방을 찾을 수 없습니다.' });
      const existing = room.players.get(userId);
      if (!existing && room.players.size >= room.maxPlayers) return ack({ ok: false, message: '방이 가득 찼습니다.' });
      if (!existing && room.state === 'playing') return ack({ ok: false, message: '이미 게임이 시작되었어요. 끝나면 들어올 수 있어요.' });
      const lower = nickname.toLocaleLowerCase('ko-KR');
      if ([...room.players.values()].some((p) => p.userId !== userId && p.nickname.toLocaleLowerCase('ko-KR') === lower)) {
        return ack({ ok: false, message: '이미 사용 중인 닉네임입니다.' });
      }
      const player = existing || { userId, ready: false, color: freeColor(room) };
      clearTimeout(player.disconnectTimer);
      // 게임 중에는 이름을 바꾸지 않는다(판 위 이름표가 바뀌지 않게).
      Object.assign(player, { nickname: existing && playing(room) ? existing.nickname : nickname, socketId: socket.id, connected: true });
      room.players.set(userId, player);
      socket.data.roachRoomCode = code; socket.data.roachUserId = userId; socket.join(channel(room));
      if (playing(room)) Arena.setConnected(room.game.arena, userId, true);
      if (!existing) addChat(room, { type: 'system', text: `${player.nickname}님이 참가했습니다.` });
      socket.emit('roach:chat:history', room.chat);
      emitState(room);
      if (playing(room)) socket.emit('roach:snapshot', snapshotFor(room, userId)); // 다시 들어오면 이어 하기
      ack({ ok: true, code });
    });

    socket.on('roach:room:ready', (ready, ack) => {
      ack = okAck(ack);
      const { room, player } = membership(socket); if (!room) return ack({ ok: false, message: '방에 없어요.' });
      if (room.hostId === player.userId) return ack({ ok: false, message: '방장은 준비할 필요가 없습니다.' });
      if (playing(room)) return ack({ ok: false, message: '게임 중이에요.' });
      player.ready = Boolean(ready); emitState(room); ack({ ok: true });
    });

    // 방장 설정: 시간(2/3/4분)·인간 수(0 = 자동, 바퀴가 항상 더 많게 시작 때 줄임).
    socket.on('roach:room:settings', (raw, ack) => {
      ack = okAck(ack);
      const { room, player } = membership(socket);
      if (!room || room.hostId !== player.userId) return ack({ ok: false, message: '방장만 바꿀 수 있어요.' });
      if (playing(room)) return ack({ ok: false, message: '게임 중에는 바꿀 수 없어요.' });
      if (raw?.minutes !== undefined) {
        const minutes = Number(raw.minutes);
        if (!MINUTES.includes(minutes)) return ack({ ok: false, message: '시간은 2·3·4분 중에서 골라 주세요.' });
        room.minutes = minutes;
      }
      if (raw?.humans !== undefined) {
        const humans = Number(raw.humans);
        if (!Number.isInteger(humans) || humans < 0 || humans > Arena.maxHumans(MAX_PLAYERS)) return ack({ ok: false, message: '인간 수가 올바르지 않아요.' });
        room.humans = humans;
      }
      emitState(room); ack({ ok: true });
    });

    socket.on('roach:game:start', (_raw, ack) => {
      ack = okAck(ack);
      const { room, player } = membership(socket);
      if (!room || room.hostId !== player.userId) return ack({ ok: false, message: '방장만 시작할 수 있습니다.' });
      if (playing(room)) return ack({ ok: false, message: '이미 게임 중입니다.' });
      if (room.players.size < MIN_PLAYERS) return ack({ ok: false, message: `${MIN_PLAYERS}명 이상 모여야 시작할 수 있습니다.` });
      if ([...room.players.values()].some((p) => p.userId !== room.hostId && !p.ready)) {
        return ack({ ok: false, message: '모든 참가자가 준비해야 합니다.' });
      }
      if ([...room.players.values()].some((p) => !p.connected)) return ack({ ok: false, message: '연결이 끊긴 사람이 있어요. 잠깐 기다려 주세요.' });
      startGame(room); ack({ ok: true });
    });

    // 조작: { angle(라디안), move(움직일지) }. 자주 오므로 ack는 있으면만.
    socket.on('roach:input', (raw, ack) => {
      const { room, player } = membership(socket);
      const ok = Boolean(room && playing(room) && Arena.setInput(room.game.arena, player.userId, raw));
      if (typeof ack === 'function') ack(ok ? { ok: true } : { ok: false, message: '지금은 움직일 수 없어요.' });
    });

    // 인간의 공격: 'slipper'(슬리퍼) · 'spray'(스프레이). 맞았는지는 서버가 판정한다.
    socket.on('roach:action', (raw, ack) => {
      ack = okAck(ack);
      const { room, player } = membership(socket);
      if (!room || !playing(room)) return ack({ ok: false, message: '지금은 게임 중이 아니에요.' });
      const type = raw?.type === 'spray' ? 'spray' : raw?.type === 'slipper' ? 'slipper' : null;
      if (!type) return ack({ ok: false, message: '알 수 없는 행동이에요.' });
      const result = Arena.act(room.game.arena, player.userId, type);
      ack(result);
    });

    // 채팅은 대기실·결과 때만(게임 중엔 숨은 자리를 알려 주는 걸 막으려고).
    socket.on('roach:chat:send', (raw, ack) => {
      ack = okAck(ack);
      const { room, player } = membership(socket); if (!room) return ack({ ok: false, message: '방에 없어요.' });
      if (playing(room)) return ack({ ok: false, message: '게임 중에는 채팅할 수 없어요.' });
      const value = text(raw?.text, 200); if (!value) return ack({ ok: false, message: '내용을 입력해 주세요.' });
      addChat(room, { type: 'chat', userId: player.userId, nickname: player.nickname, color: player.color, text: value });
      ack({ ok: true });
    });

    socket.on('roach:room:close', (_raw, ack) => {
      ack = okAck(ack);
      const { room, player } = membership(socket);
      if (!room || room.hostId !== player.userId) return ack({ ok: false, message: '방장만 방을 종료할 수 있습니다.' });
      if (playing(room)) return ack({ ok: false, message: '게임 중에는 방을 닫을 수 없어요.' });
      closeRoom(room); ack({ ok: true });
    });

    socket.on('roach:room:leave', (_raw, ack) => { leave(socket); okAck(ack)({ ok: true }); });

    // 새로고침처럼 금방 돌아오면 이어 하기. 3초 뒤 '연결 끊김'(캐릭터는 멈춤), 30초 뒤 퇴장.
    socket.on('disconnect', () => {
      const { room, player } = membership(socket); if (!room) return;
      player.disconnectTimer = setTimeout(() => {
        if (room.players.get(player.userId) !== player || player.socketId !== socket.id) return;
        player.connected = false;
        if (playing(room)) Arena.setConnected(room.game.arena, player.userId, false);
        if (rooms.get(room.code) === room) emitState(room);
        player.disconnectTimer = setTimeout(() => {
          if (!player.connected && room.players.get(player.userId) === player) {
            socket.data.roachRoomCode = room.code; socket.data.roachUserId = player.userId; leave(socket, 'disconnect');
          }
        }, RECONNECT_MS);
      }, DISCONNECT_GRACE_MS);
    });
  });

  return { rooms, publicList,
    close: () => { for (const room of rooms.values()) { stopLoop(room); for (const p of room.players.values()) clearTimeout(p.disconnectTimer); } rooms.clear(); } };
}

module.exports = { setupRoachGame, assignRoles, MIN_PLAYERS, MAX_PLAYERS };
