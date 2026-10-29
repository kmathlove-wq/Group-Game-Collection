const path = require('path');
const crypto = require('crypto');
const Rules = require('./rules');

// 눈치게임: 3·2·1 뒤 1부터 숫자를 외친다. 같은 숫자를 0.4초 안에 함께 외치면 겹침, 끝까지 못 외치면 꼴찌.
// 판정은 서버가 받은 순서·시각으로만 한다(rules.js). 화면은 '외치기' 요청만 보내고 숫자도 서버가 정한다.
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 30;
const ROUND_CHOICES = [3, 5, 10];
const COLORS = ['#ff4d75', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
  '#ef4444', '#0ea5e9', '#22c55e', '#eab308', '#a855f7', '#d946ef', '#06b6d4', '#fb923c', '#4f46e5', '#65a30d'];
const DISCONNECT_GRACE_MS = 3_000;
const RECONNECT_MS = 30_000;
const CHAT_LIMIT = 100;
const EMPTY_ROUND_LIMIT = 3; // 아무도 안 누른 라운드가 연달아 이만큼이면 게임을 끝낸다
const WHY_TEXT = { clash: '💥 겹침', last: '🐢 꼴찌', timeout: '⏰ 시간 초과' };

function text(value, maxLength) {
  return Array.from(String(value ?? '').replace(/\p{Cc}/gu, '').trim()).slice(0, maxLength).join('');
}

function setupNunchiGame({ app, io, rootDir, clashMs = Rules.CLASH_MS, countdownMs = 3_000, roundMs = 20_000, resultMs = 3_500 }) {
  const page = (name) => (_req, res) => res.sendFile(path.join(rootDir, 'public', name));
  app.get('/nunchi', page('nunchi.html'));
  app.get('/nunchi/room', page('nunchi-room.html'));

  const rooms = new Map();
  const timers = new Map(); // 방 코드 → { phase, settle }
  const channel = (room) => `nunchi:${room.code}`;

  function roomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do code = Array.from({ length: 6 }, () => chars[crypto.randomInt(chars.length)]).join('');
    while (rooms.has(code));
    return code;
  }
  function freeColor(room) {
    const used = new Set([...room.players.values()].map((p) => p.color));
    return COLORS.find((c) => !used.has(c)) || COLORS[room.players.size % COLORS.length];
  }
  const nick = (room, id) => room.players.get(id)?.nickname || '나간 사람';

  function publicGame(game) {
    if (!game) return null;
    const msLeft = game.endsAt ? Math.max(0, game.endsAt - Date.now()) : null;
    const round = game.round;
    return { mode: game.mode, phase: game.phase, roundNo: game.roundNo, totalRounds: game.totalRounds, order: game.order,
      alive: [...game.alive], penalties: Object.fromEntries(game.penalties), outRounds: Object.fromEntries(game.outRounds),
      roundIds: round ? round.ids : game.nextIds || [], number: round ? round.number : 0,
      calls: round ? round.calls.map((c) => ({ userId: c.userId, nickname: c.nickname, color: c.color, number: c.number, status: c.status })) : [],
      msLeft, phaseMs: game.phaseMs, lastResult: game.lastResult, final: game.final };
  }
  function publicRoom(room) {
    return { code: room.code, title: room.title, state: room.state, hostId: room.hostId, maxPlayers: room.maxPlayers,
      mode: room.mode, rounds: room.rounds, isPublic: room.isPublic, playerCount: room.players.size,
      players: [...room.players.values()].map((p) => ({ userId: p.userId, nickname: p.nickname, color: p.color, ready: p.ready,
        connected: p.connected, wins: p.wins, isHost: room.hostId === p.userId })),
      game: publicGame(room.game) };
  }
  function publicList() {
    return [...rooms.values()].filter((r) => r.isPublic).map((r) => ({ code: r.code, title: r.title,
      playerCount: r.players.size, maxPlayers: r.maxPlayers, state: r.state, mode: r.mode, rounds: r.rounds,
      canJoin: r.state !== 'playing' && r.players.size < r.maxPlayers,
      hostNickname: r.players.get(r.hostId)?.nickname || '', createdAt: r.createdAt }));
  }

  function emitList() { io.emit('nunchi:rooms:list', publicList()); }
  function emitState(room) { io.to(channel(room)).emit('nunchi:room:state', publicRoom(room)); emitList(); }
  function addChat(room, message) {
    room.chat.push({ id: crypto.randomUUID(), at: Date.now(), ...message });
    if (room.chat.length > CHAT_LIMIT) room.chat.splice(0, room.chat.length - CHAT_LIMIT);
    io.to(channel(room)).emit('nunchi:chat:message', room.chat.at(-1));
  }
  function roomTimers(room) {
    if (!timers.has(room.code)) timers.set(room.code, {});
    return timers.get(room.code);
  }
  function clearTimers(room) {
    const t = timers.get(room.code); if (!t) return;
    clearTimeout(t.phase); clearTimeout(t.settle); timers.delete(room.code);
  }
  function membership(socket) {
    const room = rooms.get(socket.data.nunchiRoomCode);
    const player = room?.players.get(socket.data.nunchiUserId);
    if (!room || !player || player.socketId !== socket.id) return {};
    return { room, player };
  }

  // 단계마다 서버 시계가 끝을 정한다.
  function setPhase(room, phase, ms, onTimeout) {
    const { game } = room; const t = roomTimers(room);
    clearTimeout(t.phase); clearTimeout(t.settle);
    Object.assign(game, { phase, phaseMs: ms || null, endsAt: ms ? Date.now() + ms : null });
    if (!ms) return;
    t.phase = setTimeout(() => { if (room.game === game && game.phase === phase) onTimeout(); }, ms);
  }

  // 다음 라운드에 나올 사람: 생존 모드 = 살아남은 사람, 점수 모드 = 처음 참가한 사람 중 방에 남은 사람.
  function roundPlayers(room) {
    const { game } = room;
    return game.order.filter((id) => room.players.has(id) && (game.mode === 'score' || game.alive.has(id)));
  }

  function startCountdown(room) {
    const { game } = room;
    game.roundNo += 1; game.round = null; game.nextIds = roundPlayers(room);
    setPhase(room, 'countdown', countdownMs, () => startPlay(room));
    emitState(room);
  }
  function startPlay(room) {
    const { game } = room;
    game.round = Rules.createRound(roundPlayers(room)); game.nextIds = null;
    setPhase(room, 'play', roundMs, () => { Rules.expire(game.round); endRound(room); });
    emitState(room);
  }

  // 외침이 기다리는 중이면 겹침 시간이 끝나는 순간 확정한다.
  function scheduleSettle(room) {
    const { game } = room; const t = roomTimers(room);
    clearTimeout(t.settle);
    const pending = game.round?.pending; if (!pending) return;
    const round = game.round;
    t.settle = setTimeout(() => {
      if (room.game !== game || game.round !== round || round.pending !== pending) return;
      Rules.settle(round);
      if (round.done) endRound(room); else emitState(room);
    }, Math.max(0, pending.at + clashMs - Date.now()) + 5);
  }

  function endRound(room) {
    const { game } = room; const round = game.round;
    if (!round || game.phase !== 'play') return;
    const t = roomTimers(room); clearTimeout(t.phase); clearTimeout(t.settle);
    const result = Rules.outcome(round, game.mode);
    for (const out of result.outs) {
      if (game.mode === 'survival') { game.alive.delete(out.userId); game.outRounds.set(out.userId, game.roundNo); }
      else game.penalties.set(out.userId, (game.penalties.get(out.userId) || 0) + 1);
    }
    game.emptyRounds = result.empty ? game.emptyRounds + 1 : 0;
    const outs = (round.outs || []).map((o) => ({ userId: o.userId, nickname: nick(room, o.userId), why: o.why }));
    let message;
    if (result.redo) {
      message = result.empty ? '아무도 안 외쳤어요! 이번 라운드는 다시 해요.' : '남은 사람이 모두 걸려서 이번 라운드는 다시 해요!';
    } else {
      message = outs.length ? outs.map((o) => `${WHY_TEXT[o.why]} ${o.nickname}`).join(', ') : '아무도 걸리지 않았어요.';
    }
    game.lastResult = { roundNo: game.roundNo, outs, redo: result.redo, clashNumber: round.clashNumber, message };
    game.phase = 'result';
    io.to(channel(room)).emit('nunchi:round:result', game.lastResult);
    addChat(room, { type: 'system', text: `🔔 ${game.roundNo}라운드: ${message}` });

    const inRoom = game.order.filter((id) => room.players.has(id));
    if (game.mode === 'survival' && roundPlayers(room).length <= 1) return finishGame(room);
    if (game.mode === 'score' && (game.roundNo >= game.totalRounds || inRoom.length < 2)) return finishGame(room);
    if (game.emptyRounds >= EMPTY_ROUND_LIMIT) return finishGame(room, '아무도 외치지 않는 라운드가 이어져서 게임을 끝내요.');
    setPhase(room, 'result', resultMs, () => startCountdown(room));
    emitState(room);
  }

  function finishGame(room, reason = '') {
    const { game } = room;
    const t = roomTimers(room); clearTimeout(t.phase); clearTimeout(t.settle);
    const list = game.order.filter((id) => room.players.has(id)).map((userId) => ({ userId, nickname: nick(room, userId),
      outRound: game.mode === 'survival' ? (game.alive.has(userId) ? null : game.outRounds.get(userId) ?? 0) : null,
      penalty: game.penalties.get(userId) || 0 }));
    const ranking = Rules.rankPlayers(list, game.mode);
    // 생존 모드는 끝까지 살아남은 사람(혼자), 점수 모드는 벌점이 가장 적은 사람들(동점이면 함께) 우승.
    const winners = reason ? [] : ranking.filter((p) => p.rank === 1 && (game.mode === 'score' || p.outRound === null)).map((p) => p.userId);
    for (const id of winners) room.players.get(id).wins += 1;
    game.final = { winners, ranking, reason };
    Object.assign(game, { phase: 'done', endsAt: null, phaseMs: null });
    room.state = 'finished';
    const names = winners.map((id) => nick(room, id)).join(', ');
    addChat(room, { type: 'system', text: reason || (names ? `🏆 ${names}님 우승!` : '게임이 끝났어요.') });
    emitState(room); // 바뀐 우승 횟수를 먼저 보내야 결과 창이 맞게 나온다
    io.to(channel(room)).emit('nunchi:game:finished', game.final);
  }

  function startGame(room) {
    const order = [...room.players.keys()];
    room.game = { mode: room.mode, totalRounds: room.mode === 'score' ? room.rounds : null, roundNo: 0, order,
      alive: new Set(order), outRounds: new Map(), penalties: new Map(order.map((id) => [id, 0])), round: null, nextIds: null,
      phase: 'countdown', endsAt: null, phaseMs: null, lastResult: null, final: null, emptyRounds: 0 };
    room.state = 'playing';
    addChat(room, { type: 'system', text: room.mode === 'score'
      ? `게임 시작! 점수 모드 ${room.rounds}라운드 — 걸릴 때마다 벌점 1점, 벌점이 가장 적은 사람이 우승!`
      : '게임 시작! 생존 모드 — 걸리면 구경, 마지막까지 살아남으면 우승!' });
    startCountdown(room);
  }

  // 게임 중 사람이 빠지면: 라운드에서 빼고, 남은 사람이 너무 적으면 끝낸다.
  function afterPlayerGone(room, player) {
    const { game } = room;
    if (room.state !== 'playing' || !game) return;
    if (game.mode === 'survival' && game.alive.delete(player.userId)) game.outRounds.set(player.userId, game.roundNo);
    if (game.phase === 'play' && game.round) {
      Rules.removePlayer(game.round, player.userId);
      if (game.round.done) { endRound(room); return; }
      scheduleSettle(room);
    }
    if (room.state !== 'playing') return;
    const left = roundPlayers(room).length;
    // 생존 모드에서 한 명만 남으면 그 사람이 우승, 그 밖엔 사람이 모자라 그냥 끝낸다.
    if (left < 2) finishGame(room, game.mode === 'survival' && left === 1 ? '' : '사람이 너무 적어져서 게임을 끝내요.');
    else if (game.phase === 'countdown') game.nextIds = roundPlayers(room);
  }

  function leave(socket, reason = 'left') {
    const { room, player } = membership(socket);
    if (!room) return;
    clearTimeout(player.disconnectTimer);
    room.players.delete(player.userId);
    socket.leave(channel(room));
    socket.data.nunchiRoomCode = null;
    if (!room.players.size) { clearTimers(room); rooms.delete(room.code); emitList(); return; }
    if (room.hostId === player.userId) room.hostId = room.players.keys().next().value;
    addChat(room, { type: 'system', text: `${player.nickname}님이 방에서 나갔습니다.`, reason });
    afterPlayerGone(room, player);
    emitState(room);
  }

  function closeRoom(room, message = '방장이 방을 종료했습니다.') {
    clearTimers(room);
    io.to(channel(room)).emit('nunchi:room:closed', { message });
    for (const player of room.players.values()) {
      clearTimeout(player.disconnectTimer);
      const playerSocket = io.sockets.sockets.get(player.socketId);
      if (!playerSocket) continue;
      playerSocket.leave(channel(room));
      if (playerSocket.data.nunchiRoomCode === room.code) playerSocket.data.nunchiRoomCode = null;
    }
    rooms.delete(room.code); emitList();
  }

  const CALL_ERRORS = { early: '아직이에요! 카운트다운이 끝나면 외치세요.', 'not-player': '이번 라운드는 구경 중이에요.',
    already: '이번 라운드에는 벌써 외쳤어요.', done: '이번 라운드는 이미 끝났어요.' };

  io.on('connection', (socket) => {
    socket.on('nunchi:rooms:list', () => socket.emit('nunchi:rooms:list', publicList()));

    socket.on('nunchi:room:create', (raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const nickname = text(raw?.nickname, 30); const userId = text(raw?.userId, 80);
      if (!nickname || !userId) return ack({ ok: false, message: '닉네임을 입력해 주세요.' });
      const rounds = Number(raw?.rounds);
      const code = roomCode();
      const room = { code, title: text(raw?.title, 30) || '눈치게임', isPublic: raw?.isPublic !== false,
        maxPlayers: Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.floor(Number(raw?.maxPlayers)) || 20)),
        mode: raw?.mode === 'score' ? 'score' : 'survival', rounds: ROUND_CHOICES.includes(rounds) ? rounds : 5,
        hostId: userId, players: new Map(), state: 'waiting', game: null, chat: [], createdAt: Date.now() };
      room.players.set(userId, { userId, nickname, socketId: socket.id, connected: true, ready: true, wins: 0, color: COLORS[0], chatTimes: [] });
      rooms.set(code, room); socket.data.nunchiRoomCode = code; socket.data.nunchiUserId = userId; socket.join(channel(room));
      addChat(room, { type: 'system', text: `${nickname}님이 방을 만들었습니다.` }); emitState(room); ack({ ok: true, code });
    });

    socket.on('nunchi:room:join', (raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const code = text(raw?.code, 6).toUpperCase(); const room = rooms.get(code);
      const nickname = text(raw?.nickname, 30); const userId = text(raw?.userId, 80);
      if (!nickname || !userId) return ack({ ok: false, message: '닉네임을 입력해 주세요.' });
      if (!room) return ack({ ok: false, message: '방을 찾을 수 없습니다.' });
      const existing = room.players.get(userId);
      if (!existing && room.players.size >= room.maxPlayers) return ack({ ok: false, message: '방이 가득 찼습니다.' });
      if (!existing && room.state === 'playing') return ack({ ok: false, message: '이미 게임이 시작되었습니다. 끝나면 들어와 주세요.' });
      const lower = nickname.toLocaleLowerCase('ko-KR');
      if ([...room.players.values()].some((p) => p.userId !== userId && p.nickname.toLocaleLowerCase('ko-KR') === lower)) {
        return ack({ ok: false, message: '이미 사용 중인 닉네임입니다.' });
      }
      const player = existing || { userId, ready: false, wins: 0, color: freeColor(room), chatTimes: [] };
      clearTimeout(player.disconnectTimer);
      // 게임 중 다시 들어올 땐 이름을 바꾸지 않는다(외친 기록의 이름과 어긋나지 않게).
      Object.assign(player, { nickname: existing && room.state === 'playing' ? existing.nickname : nickname, socketId: socket.id, connected: true });
      room.players.set(userId, player);
      socket.data.nunchiRoomCode = code; socket.data.nunchiUserId = userId; socket.join(channel(room));
      if (!existing) addChat(room, { type: 'system', text: `${nickname}님이 참가했습니다.` });
      socket.emit('nunchi:chat:history', room.chat);
      emitState(room); ack({ ok: true, code });
    });

    socket.on('nunchi:room:ready', (ready, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket); if (!room) return ack({ ok: false, message: '방에 있지 않아요.' });
      if (room.hostId === player.userId) return ack({ ok: false, message: '방장은 준비할 필요가 없습니다.' });
      player.ready = Boolean(ready); emitState(room); ack({ ok: true });
    });

    socket.on('nunchi:game:start', (_raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket);
      if (!room || room.hostId !== player.userId) return ack({ ok: false, message: '방장만 시작할 수 있습니다.' });
      if (room.state === 'playing') return ack({ ok: false, message: '이미 게임 중입니다.' });
      if (room.players.size < MIN_PLAYERS) return ack({ ok: false, message: `${MIN_PLAYERS}명 이상 모여야 시작할 수 있습니다.` });
      if ([...room.players.values()].some((p) => p.userId !== room.hostId && !p.ready)) {
        return ack({ ok: false, message: '모든 참가자가 준비해야 합니다.' });
      }
      startGame(room); ack({ ok: true });
    });

    // 외치기: 화면은 아무 값도 보내지 않는다. 숫자·시각은 서버가 정한다.
    socket.on('nunchi:call', (_raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const now = Date.now();
      const { room, player } = membership(socket);
      const game = room?.game;
      if (!room || room.state !== 'playing' || !game) return ack({ ok: false, message: '지금은 게임 중이 아니에요.', code: 'idle' });
      if (game.phase !== 'play' || !game.round) {
        const code = game.phase === 'countdown' ? 'early' : 'done';
        return ack({ ok: false, message: CALL_ERRORS[code], code });
      }
      const result = Rules.call(game.round, player.userId, now, clashMs);
      if (game.round.done) { // 앞 숫자를 확정해 보니 라운드가 끝났다
        ack({ ok: false, message: CALL_ERRORS.done, code: 'done' });
        endRound(room); return;
      }
      if (!result.ok) return ack({ ok: false, message: CALL_ERRORS[result.reason] || '외칠 수 없어요.', code: result.reason });
      const entry = game.round.calls.at(-1);
      Object.assign(entry, { nickname: player.nickname, color: player.color });
      ack({ ok: true, number: result.number });
      io.to(channel(room)).emit('nunchi:called', { userId: player.userId, nickname: player.nickname, color: player.color, number: result.number });
      scheduleSettle(room);
      emitState(room);
    });

    socket.on('nunchi:chat:send', (raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket); if (!room) return ack({ ok: false, message: '방에 있지 않아요.' });
      const value = text(raw?.text, 200); if (!value) return ack({ ok: false, message: '메시지를 입력해 주세요.' });
      const now = Date.now();
      player.chatTimes = player.chatTimes.filter((at) => now - at < 5_000);
      if (player.chatTimes.length >= 7) return ack({ ok: false, message: '채팅이 너무 빨라요. 잠깐 쉬었다 보내 주세요.' });
      player.chatTimes.push(now);
      addChat(room, { type: 'chat', userId: player.userId, nickname: player.nickname, color: player.color, text: value }); ack({ ok: true });
    });

    socket.on('nunchi:room:close', (_raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket);
      if (!room || room.hostId !== player.userId) return ack({ ok: false, message: '방장만 방을 종료할 수 있습니다.' });
      closeRoom(room); ack({ ok: true });
    });

    socket.on('nunchi:room:leave', (_raw, ack = () => {}) => { leave(socket); if (typeof ack === 'function') ack({ ok: true }); });

    // 새로고침처럼 금방 돌아오는 경우를 위해 3초 기다린 뒤에야 "연결 끊김"으로 표시한다(라운드는 기다리지 않음).
    socket.on('disconnect', () => {
      const { room, player } = membership(socket); if (!room) return;
      player.disconnectTimer = setTimeout(() => {
        if (room.players.get(player.userId) !== player || player.socketId !== socket.id) return;
        player.connected = false;
        emitState(room);
        player.disconnectTimer = setTimeout(() => {
          if (!player.connected && room.players.get(player.userId) === player) {
            socket.data.nunchiRoomCode = room.code; socket.data.nunchiUserId = player.userId; leave(socket, 'disconnect');
          }
        }, RECONNECT_MS);
      }, DISCONNECT_GRACE_MS);
    });
  });

  return { rooms, publicList,
    close: () => { for (const room of rooms.values()) clearTimers(room); rooms.clear(); } };
}

module.exports = { setupNunchiGame, Rules };
