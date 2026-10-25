const path = require('path');
const crypto = require('crypto');

// 마피아 게임: 밤에는 마피아가 한 명을 노리고, 의사는 한 명을 살리고, 경찰은 한 명을 조사한다.
// 낮에는 모두 채팅으로 토론한 뒤 투표로 한 명을 내보낸다. 마피아를 모두 찾으면 시민 승리,
// 마피아 수가 나머지 수와 같아지면 마피아 승리. 직업은 서버만 알고 각자에게 'mafia:secret'으로 자기 몫만 보낸다.
const MIN_PLAYERS = 4;
const MAX_PLAYERS = 12;
const DAY_TIMES = [60, 90, 120, 180];
const NIGHT_TIMES = [20, 30, 45, 60];
const VOTE_SECONDS = 30;
const NEWS_SECONDS = 5; // 아침 발표·투표 결과를 보여 주는 시간
const COLORS = ['#ff4d75', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#a855f7'];
const DISCONNECT_GRACE_MS = 3_000;
const RECONNECT_MS = 30_000;
const CHAT_LIMIT = 150;
const NEWS_LIMIT = 40;
const ROLES = {
  mafia: { name: '마피아', emoji: '🔪' },
  doctor: { name: '의사', emoji: '💉' },
  police: { name: '경찰', emoji: '🔍' },
  citizen: { name: '시민', emoji: '🙂' }
};

function text(value, maxLength) {
  return Array.from(String(value ?? '').replace(/\p{Cc}/gu, '').trim()).slice(0, maxLength).join('');
}
// 마지막 글자에 받침이 있는지(한글이 아니면 없다고 본다).
function hasBatchim(word) {
  const code = String(word).charCodeAt(String(word).length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}

// 인원에 따라 마피아 수가 정해진다: 4~6명 1명, 7~9명 2명, 10~12명 3명.
const mafiaCount = (n) => (n >= 10 ? 3 : n >= 7 ? 2 : 1);

// 직업 나누기: 섞은 뒤 앞에서부터 마피아 → 의사 → 경찰, 나머지는 시민.
function assignRoles(ids, randomInt = crypto.randomInt) {
  const order = [...ids];
  for (let i = order.length - 1; i > 0; i -= 1) { const j = randomInt(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  const roles = new Map();
  const mafias = mafiaCount(order.length);
  order.forEach((id, i) => roles.set(id, i < mafias ? 'mafia' : i === mafias ? 'doctor' : i === mafias + 1 ? 'police' : 'citizen'));
  return roles;
}

// 이긴 쪽: 마피아가 0명이면 시민, 마피아 수가 나머지 이상이면 마피아, 아니면 아직(null).
function winnerOf(roles, alive) {
  const mafias = [...alive].filter((id) => roles.get(id) === 'mafia').length;
  if (mafias === 0) return 'citizens';
  if (mafias >= alive.size - mafias) return 'mafia';
  return null;
}

// 표 세기: votes는 투표한 사람 → 찍은 사람(또는 'skip' 기권). 가장 많이 받은 사람이 한 명이고 기권보다 많아야 내보낸다.
function tallyVotes(votes) {
  const counts = new Map();
  for (const target of votes.values()) counts.set(target, (counts.get(target) || 0) + 1);
  const best = Math.max(0, ...counts.values());
  const top = [...counts].filter(([, n]) => n === best).map(([id]) => id);
  const executedId = best > 0 && top.length === 1 && top[0] !== 'skip' ? top[0] : null;
  return { counts: Object.fromEntries(counts), executedId };
}

function setupMafiaGame({ app, io, rootDir, secondMs = 1000 }) {
  const page = (name) => (_req, res) => res.sendFile(path.join(rootDir, 'public', name));
  app.get('/mafia', page('mafia.html'));
  app.get('/mafia/room', page('mafia-room.html'));

  const rooms = new Map();
  const timers = new Map();
  const channel = (room) => `mafia:${room.code}`;
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
  const roleOf = (room, id) => room.game?.roles.get(id);
  const isAlive = (room, id) => Boolean(room.game?.alive.has(id));
  const playing = (room) => room.state === 'playing' && room.game;

  // ── 모두에게 보내는 상태(직업은 죽었거나 게임이 끝난 사람만) ──
  function publicGame(game) {
    if (!game) return null;
    return { phase: game.phase, day: game.day, msLeft: game.endsAt ? Math.max(0, game.endsAt - Date.now()) : null,
      phaseSeconds: game.phaseSeconds, alive: [...game.alive], votedIds: game.phase === 'vote' ? [...game.votes.keys()] : [],
      lastVote: game.lastVote, news: game.news, winner: game.winner, mafiaCount: mafiaCount(game.roles.size) };
  }
  function publicRoom(room) {
    const { game } = room;
    return { code: room.code, title: room.title, state: room.state, hostId: room.hostId, maxPlayers: room.maxPlayers,
      dayTime: room.dayTime, nightTime: room.nightTime, isPublic: room.isPublic, playerCount: room.players.size,
      players: [...room.players.values()].map((p) => {
        const revealed = game && game.roles.has(p.userId) && (!game.alive.has(p.userId) || room.state === 'finished');
        return { userId: p.userId, nickname: p.nickname, color: p.color, ready: p.ready, connected: p.connected,
          isHost: room.hostId === p.userId, inGame: Boolean(game?.roles.has(p.userId)), alive: game ? game.alive.has(p.userId) : true,
          role: revealed ? game.roles.get(p.userId) : null };
      }),
      game: publicGame(game) };
  }
  function publicList() {
    return [...rooms.values()].filter((r) => r.isPublic).map((r) => ({ code: r.code, title: r.title,
      playerCount: r.players.size, maxPlayers: r.maxPlayers, state: r.state, dayTime: r.dayTime,
      canJoin: r.state !== 'playing' && r.players.size < r.maxPlayers,
      hostNickname: r.players.get(r.hostId)?.nickname || '', createdAt: r.createdAt }));
  }

  // ── 나만 아는 정보: 내 직업, (마피아면) 동료와 오늘 밤 노리는 사람, (경찰이면) 조사 결과, (죽었으면) 모두의 직업 ──
  function secretFor(room, userId) {
    const { game } = room;
    const role = game?.roles.get(userId);
    if (!role) return null;
    const seesAll = !game.alive.has(userId) || room.state === 'finished';
    const secret = { gameId: game.id, role, roles: null, mafiaIds: null, mafiaTarget: null, myTarget: game.night?.picks.get(userId) ?? null, investigations: null };
    if (role === 'mafia' || seesAll) secret.mafiaIds = [...game.roles].filter(([, r]) => r === 'mafia').map(([id]) => id);
    if (role === 'mafia') secret.mafiaTarget = game.night?.mafiaTarget ?? null;
    if (role === 'police') secret.investigations = game.investigations;
    if (seesAll) secret.roles = Object.fromEntries(game.roles);
    return secret;
  }
  function sendSecrets(room) {
    for (const player of room.players.values()) {
      const secret = secretFor(room, player.userId);
      if (secret) io.to(player.socketId).emit('mafia:secret', secret);
    }
  }
  function emitList() { io.emit('mafia:rooms:list', publicList()); }
  function emitState(room) { io.to(channel(room)).emit('mafia:room:state', publicRoom(room)); sendSecrets(room); emitList(); }

  // ── 채팅: 'all'(모두) · 'mafia'(밤의 마피아끼리) · 'dead'(죽은 사람끼리). 죽은 사람은 마피아 대화도 엿볼 수 있다 ──
  function canSee(room, userId, message) {
    if (message.audience === 'all' || !playing(room)) return true;
    if (!isAlive(room, userId) && roleOf(room, userId)) return true;
    return message.audience === 'mafia' && roleOf(room, userId) === 'mafia';
  }
  function addChat(room, message, audience = 'all') {
    room.chat.push({ id: crypto.randomUUID(), at: Date.now(), audience, ...message });
    if (room.chat.length > CHAT_LIMIT) room.chat.splice(0, room.chat.length - CHAT_LIMIT);
    const entry = room.chat.at(-1);
    if (audience === 'all') { io.to(channel(room)).emit('mafia:chat:message', entry); return; }
    for (const player of room.players.values()) if (canSee(room, player.userId, entry)) io.to(player.socketId).emit('mafia:chat:message', entry);
  }
  function chatHistory(room, userId) { return room.chat.filter((m) => canSee(room, userId, m)); }

  function addNews(room, textValue, type = 'info') {
    const { game } = room;
    game.news.push({ day: game.day, type, text: textValue });
    if (game.news.length > NEWS_LIMIT) game.news.splice(0, game.news.length - NEWS_LIMIT);
    addChat(room, { type: 'system', text: textValue });
  }
  function clearTimer(room) { clearTimeout(timers.get(room.code)); timers.delete(room.code); }
  function membership(socket) {
    const room = rooms.get(socket.data.mafiaRoomCode);
    const player = room?.players.get(socket.data.mafiaUserId);
    if (!room || !player || player.socketId !== socket.id) return {};
    return { room, player };
  }
  const nameOf = (room, id) => room.players.get(id)?.nickname || room.game?.names.get(id) || '누군가';
  // 받침이 있으면 '이었어요', 없으면 '였어요'(시민이었어요 · 마피아였어요).
  const wasRole = (role) => `${ROLES[role].emoji} ${ROLES[role].name}${hasBatchim(ROLES[role].name) ? '이었어요' : '였어요'}`;

  function setPhase(room, phase, seconds, onTimeout) {
    clearTimer(room);
    const { game } = room;
    Object.assign(game, { phase, phaseSeconds: seconds || null, endsAt: seconds ? Date.now() + seconds * secondMs : null });
    const day = game.day;
    timers.set(room.code, setTimeout(() => {
      if (room.game !== game || game.phase !== phase || game.day !== day) return;
      onTimeout();
    }, seconds * secondMs));
  }

  // 누군가 죽으면(밤에 당하거나·투표로 나가거나·방을 나가면) 직업을 공개한다. 이긴 쪽이 생기면 바로 끝낸다.
  function kill(room, id) {
    room.game.alive.delete(id);
    return checkWinner(room);
  }
  function checkWinner(room) {
    const winner = winnerOf(room.game.roles, room.game.alive);
    if (winner) finishGame(room, winner);
    return Boolean(winner);
  }

  function finishGame(room, winner) {
    clearTimer(room);
    const { game } = room;
    Object.assign(game, { phase: 'result', winner, endsAt: null, phaseSeconds: null });
    room.state = 'finished';
    addNews(room, winner === 'mafia' ? '🔪 마피아 승리! 마을이 마피아에게 넘어갔어요.' : '🙌 시민 승리! 마피아를 모두 찾아냈어요.', 'end');
    emitState(room);
    io.to(channel(room)).emit('mafia:game:finished', { winner, roles: Object.fromEntries(game.roles) });
  }

  // ── 밤 ──
  function startNight(room) {
    const { game } = room;
    game.night = { mafiaTarget: null, doctorTarget: null, policeTarget: null, picks: new Map() };
    setPhase(room, 'night', room.nightTime, () => endNight(room));
    addNews(room, `🌙 ${game.day}번째 밤이 되었어요. 마피아·의사·경찰은 몰래 할 일을 고르세요.`, 'night');
    emitState(room);
  }
  // 할 일이 있는 사람(살아 있고 접속 중)이 모두 골랐으면 밤을 일찍 끝낸다.
  function maybeEndNight(room) {
    const { game } = room;
    if (!playing(room) || game.phase !== 'night') return;
    const active = (role) => [...game.alive].some((id) => game.roles.get(id) === role && room.players.get(id)?.connected);
    const done = (!active('mafia') || game.night.mafiaTarget) && (!active('doctor') || game.night.doctorTarget) && (!active('police') || game.night.policeTarget);
    if (done) endNight(room);
  }
  function endNight(room) {
    const { game } = room;
    const { mafiaTarget, doctorTarget } = game.night;
    if (mafiaTarget && game.alive.has(mafiaTarget) && mafiaTarget !== doctorTarget) {
      addNews(room, `☀️ 아침이 밝았어요. 밤사이 ${nameOf(room, mafiaTarget)}님이 마피아에게 당했어요… (${wasRole(game.roles.get(mafiaTarget))})`, 'dead');
      if (kill(room, mafiaTarget)) return;
    } else if (mafiaTarget && mafiaTarget === doctorTarget) {
      addNews(room, '☀️ 아침이 밝았어요. 💉 의사가 마피아의 공격에서 한 명을 살려 냈어요! 아무도 죽지 않았어요.', 'save');
    } else {
      addNews(room, '☀️ 아침이 밝았어요. 조용한 밤이었어요. 아무도 죽지 않았어요.', 'info');
    }
    game.night = null;
    setPhase(room, 'morning', NEWS_SECONDS, () => startDay(room));
    emitState(room);
  }

  // ── 낮: 토론 → 투표 → 결과 ──
  function startDay(room) {
    setPhase(room, 'day', room.dayTime, () => startVote(room));
    addNews(room, `💬 ${room.game.day}번째 낮! 누가 마피아일지 이야기해 보세요. (${room.dayTime}초)`, 'day');
    emitState(room);
  }
  function startVote(room) {
    room.game.votes = new Map();
    setPhase(room, 'vote', VOTE_SECONDS, () => countVotes(room));
    addNews(room, `🗳️ 투표 시간! 마피아라고 생각하는 사람을 찍거나 기권하세요. (${VOTE_SECONDS}초)`, 'vote');
    emitState(room);
  }
  function maybeCountVotes(room) {
    const { game } = room;
    if (!playing(room) || game.phase !== 'vote') return;
    const voters = [...game.alive].filter((id) => room.players.get(id)?.connected);
    if (voters.every((id) => game.votes.has(id))) countVotes(room);
  }
  function countVotes(room) {
    const { game } = room;
    const { counts, executedId } = tallyVotes(game.votes);
    game.lastVote = { day: game.day, counts, votes: Object.fromEntries(game.votes), executedId };
    // 받은 표를 많은 순으로 알려 준다(누가 누구를 찍었는지는 알리지 않는다).
    const tally = Object.entries(counts).sort((a, b) => b[1] - a[1])
      .map(([id, n]) => `${id === 'skip' ? '기권' : nameOf(room, id)} ${n}표`).join(' · ');
    addNews(room, `🗳️ 투표 결과: ${tally || '아무도 투표하지 않았어요'}`, 'vote');
    if (executedId) {
      addNews(room, `⚖️ 투표 결과 ${nameOf(room, executedId)}님이 마을에서 쫓겨났어요. (${wasRole(game.roles.get(executedId))})`, 'dead');
      if (kill(room, executedId)) return;
    } else {
      addNews(room, '⚖️ 표가 갈리거나 기권이 많아서 아무도 쫓겨나지 않았어요.', 'info');
    }
    setPhase(room, 'verdict', NEWS_SECONDS, () => { game.day += 1; startNight(room); });
    emitState(room);
  }

  function startGame(room) {
    const ids = [...room.players.keys()];
    const roles = assignRoles(ids);
    room.game = { id: ++gameCounter, day: 1, phase: 'night', roles, alive: new Set(ids),
      names: new Map(ids.map((id) => [id, room.players.get(id).nickname])), night: null, votes: new Map(),
      investigations: [], lastVote: null, news: [], winner: null, endsAt: null, phaseSeconds: null };
    room.state = 'playing';
    addChat(room, { type: 'system', text: `게임 시작! 마피아 ${mafiaCount(ids.length)}명·의사 1명·경찰 1명·시민 ${ids.length - mafiaCount(ids.length) - 2}명이에요. 내 직업을 확인하세요!` });
    startNight(room);
  }

  // 게임 중 사람이 빠지면 그 사람은 죽은 것으로 보고 직업을 공개한다.
  function afterPlayerGone(room, userId) {
    const { game } = room;
    if (!playing(room) || !game.alive.has(userId)) return;
    addNews(room, `🚪 ${nameOf(room, userId)}님이 게임을 떠났어요. (${wasRole(game.roles.get(userId))})`, 'dead');
    if (kill(room, userId)) return;
    game.votes.delete(userId);
    if (game.night?.mafiaTarget === userId) game.night.mafiaTarget = null;
    maybeEndNight(room); maybeCountVotes(room);
  }

  function leave(socket, reason = 'left') {
    const { room, player } = membership(socket);
    if (!room) return;
    clearTimeout(player.disconnectTimer);
    room.players.delete(player.userId);
    socket.leave(channel(room));
    socket.data.mafiaRoomCode = null;
    if (!room.players.size) { clearTimer(room); rooms.delete(room.code); emitList(); return; }
    if (room.hostId === player.userId) room.hostId = room.players.keys().next().value;
    addChat(room, { type: 'system', text: `${player.nickname}님이 방에서 나갔습니다.`, reason });
    afterPlayerGone(room, player.userId);
    emitState(room);
  }

  function closeRoom(room, message = '방장이 방을 종료했습니다.') {
    clearTimer(room);
    io.to(channel(room)).emit('mafia:room:closed', { message });
    for (const player of room.players.values()) {
      clearTimeout(player.disconnectTimer);
      const playerSocket = io.sockets.sockets.get(player.socketId);
      if (!playerSocket) continue;
      playerSocket.leave(channel(room));
      if (playerSocket.data.mafiaRoomCode === room.code) playerSocket.data.mafiaRoomCode = null;
    }
    rooms.delete(room.code); emitList();
  }

  io.on('connection', (socket) => {
    socket.on('mafia:rooms:list', () => socket.emit('mafia:rooms:list', publicList()));

    socket.on('mafia:room:create', (raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const nickname = text(raw?.nickname, 30); const userId = text(raw?.userId, 80);
      if (!nickname || !userId) return ack({ ok: false, message: '닉네임을 입력해 주세요.' });
      const dayTime = Number(raw?.dayTime); const nightTime = Number(raw?.nightTime);
      const code = roomCode();
      const room = { code, title: text(raw?.title, 30) || '마피아 게임', isPublic: raw?.isPublic !== false,
        maxPlayers: Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Number(raw?.maxPlayers) || 8)),
        dayTime: DAY_TIMES.includes(dayTime) ? dayTime : 120, nightTime: NIGHT_TIMES.includes(nightTime) ? nightTime : 30,
        hostId: userId, players: new Map(), state: 'waiting', game: null, chat: [], createdAt: Date.now() };
      room.players.set(userId, { userId, nickname, socketId: socket.id, connected: true, ready: true, color: COLORS[0] });
      rooms.set(code, room); socket.data.mafiaRoomCode = code; socket.data.mafiaUserId = userId; socket.join(channel(room));
      addChat(room, { type: 'system', text: `${nickname}님이 방을 만들었습니다.` }); emitState(room); ack({ ok: true, code });
    });

    socket.on('mafia:room:join', (raw, ack = () => {}) => {
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
      const player = existing || { userId, ready: false, color: freeColor(room) };
      clearTimeout(player.disconnectTimer);
      Object.assign(player, { nickname, socketId: socket.id, connected: true });
      room.players.set(userId, player);
      socket.data.mafiaRoomCode = code; socket.data.mafiaUserId = userId; socket.join(channel(room));
      if (!existing) addChat(room, { type: 'system', text: `${nickname}님이 참가했습니다.` });
      socket.emit('mafia:chat:history', chatHistory(room, userId));
      emitState(room); ack({ ok: true, code }); // emitState가 내 비밀(직업)도 다시 보낸다
    });

    socket.on('mafia:room:ready', (ready, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket); if (!room) return ack({ ok: false });
      if (room.hostId === player.userId) return ack({ ok: false, message: '방장은 준비할 필요가 없습니다.' });
      player.ready = Boolean(ready); emitState(room); ack({ ok: true });
    });

    socket.on('mafia:game:start', (_raw, ack = () => {}) => {
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

    // 밤의 할 일: 마피아 = 노릴 사람(마피아끼리 하나를 함께 정함, 마지막으로 고른 사람), 의사 = 살릴 사람(나도 됨), 경찰 = 조사할 사람(밤마다 한 번).
    socket.on('mafia:act', (raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket);
      if (!room || !playing(room) || room.game.phase !== 'night') return ack({ ok: false, message: '지금은 밤이 아니에요.' });
      const { game } = room; const me = player.userId; const role = game.roles.get(me);
      if (!game.alive.has(me)) return ack({ ok: false, message: '죽은 사람은 할 수 없어요.' });
      const targetId = text(raw?.targetId, 80);
      if (!game.alive.has(targetId)) return ack({ ok: false, message: '살아 있는 사람만 고를 수 있어요.' });
      if (role === 'mafia') {
        if (game.roles.get(targetId) === 'mafia') return ack({ ok: false, message: '같은 마피아는 노릴 수 없어요.' });
        game.night.mafiaTarget = targetId;
        addChat(room, { type: 'mafia-pick', text: `🔪 ${player.nickname}님이 ${nameOf(room, targetId)}님을 노리기로 했어요.` }, 'mafia');
      } else if (role === 'doctor') {
        game.night.doctorTarget = targetId;
      } else if (role === 'police') {
        if (game.night.policeTarget) return ack({ ok: false, message: '오늘 밤 조사는 이미 했어요.' });
        if (targetId === me) return ack({ ok: false, message: '나 자신은 조사할 수 없어요.' });
        game.night.policeTarget = targetId;
        game.investigations.push({ day: game.day, targetId, nickname: nameOf(room, targetId), isMafia: game.roles.get(targetId) === 'mafia' });
      } else {
        return ack({ ok: false, message: '시민은 밤에 할 일이 없어요. 푹 자요 😴' });
      }
      game.night.picks.set(me, targetId);
      const investigation = role === 'police' ? game.investigations.at(-1) : null;
      ack({ ok: true, investigation });
      sendSecrets(room);
      maybeEndNight(room);
    });

    socket.on('mafia:skip-day', (_raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket);
      if (!room || room.hostId !== player.userId) return ack({ ok: false, message: '방장만 넘길 수 있어요.' });
      if (!playing(room) || room.game.phase !== 'day') return ack({ ok: false, message: '지금은 토론 시간이 아니에요.' });
      ack({ ok: true }); startVote(room);
    });

    // 투표: 살아 있는 사람만, 살아 있는 다른 사람 또는 'skip'(기권). 끝나기 전엔 바꿀 수 있다.
    socket.on('mafia:vote', (raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket);
      if (!room || !playing(room) || room.game.phase !== 'vote') return ack({ ok: false, message: '지금은 투표 시간이 아니에요.' });
      const { game } = room;
      if (!game.alive.has(player.userId)) return ack({ ok: false, message: '죽은 사람은 투표할 수 없어요.' });
      const targetId = text(raw?.targetId, 80);
      if (targetId === player.userId) return ack({ ok: false, message: '나 자신은 찍을 수 없어요.' });
      if (targetId !== 'skip' && !game.alive.has(targetId)) return ack({ ok: false, message: '살아 있는 사람만 찍을 수 있어요.' });
      game.votes.set(player.userId, targetId);
      ack({ ok: true }); emitState(room);
      maybeCountVotes(room);
    });

    socket.on('mafia:chat:send', (raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket); if (!room) return ack({ ok: false });
      const value = text(raw?.text, 200); if (!value) return ack({ ok: false });
      let audience = 'all';
      if (playing(room) && room.game.roles.has(player.userId)) {
        if (!room.game.alive.has(player.userId)) audience = 'dead';
        else if (room.game.phase === 'night') {
          if (room.game.roles.get(player.userId) !== 'mafia') return ack({ ok: false, message: '밤에는 조용히! 마피아만 몰래 이야기할 수 있어요.' });
          audience = 'mafia';
        }
      }
      addChat(room, { type: 'chat', userId: player.userId, nickname: player.nickname, color: player.color, text: value }, audience);
      ack({ ok: true, audience });
    });

    socket.on('mafia:room:close', (_raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket);
      if (!room || room.hostId !== player.userId) return ack({ ok: false, message: '방장만 방을 종료할 수 있습니다.' });
      closeRoom(room); ack({ ok: true });
    });

    socket.on('mafia:room:leave', (_raw, ack = () => {}) => { leave(socket); if (typeof ack === 'function') ack({ ok: true }); });

    // 새로고침처럼 금방 돌아오는 경우를 위해 3초 기다린 뒤에야 "연결 끊김"으로 보고, 밤·투표가 그 사람을 기다리지 않게 한다.
    socket.on('disconnect', () => {
      const { room, player } = membership(socket); if (!room) return;
      player.disconnectTimer = setTimeout(() => {
        if (room.players.get(player.userId) !== player || player.socketId !== socket.id) return;
        player.connected = false;
        maybeEndNight(room); maybeCountVotes(room);
        if (rooms.get(room.code) === room) emitState(room);
        player.disconnectTimer = setTimeout(() => {
          if (!player.connected && room.players.get(player.userId) === player) {
            socket.data.mafiaRoomCode = room.code; socket.data.mafiaUserId = player.userId; leave(socket, 'disconnect');
          }
        }, RECONNECT_MS);
      }, DISCONNECT_GRACE_MS);
    });
  });

  return { rooms, publicList,
    close: () => { for (const timer of timers.values()) clearTimeout(timer); rooms.clear(); } };
}

module.exports = { setupMafiaGame, assignRoles, winnerOf, tallyVotes, mafiaCount, ROLES };
