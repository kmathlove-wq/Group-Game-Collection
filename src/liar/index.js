const path = require('path');
const crypto = require('crypto');
const TOPICS = require('./words.json');

// 라이어 게임: 한 사람(라이어)만 제시어를 모른다. 차례대로 한 줄 설명 → 토론 → 투표 → (잡히면) 라이어의 제시어 맞히기.
// 라이어가 누구인지와 제시어는 서버만 알고, 각자에게 자기 몫만 'liar:secret'으로 따로 보낸다.
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 10;
const HINT_TIMES = [0, 20, 30, 45, 60]; // 0 = 제한 없음
const TALK_TIMES = [60, 90, 120, 180];
const VOTE_SECONDS = 30;
const GUESS_SECONDS = 30;
const LIAR_WIN_SCORE = 3;
const CITIZEN_WIN_SCORE = 1;
const COLORS = ['#ff4d75', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];
const DISCONNECT_GRACE_MS = 3_000;
const RECONNECT_MS = 30_000;
const CHAT_LIMIT = 100;

function text(value, maxLength) {
  return Array.from(String(value ?? '').replace(/\p{Cc}/gu, '').trim()).slice(0, maxLength).join('');
}
const topicCode = (value) => (value === 'random' || Object.hasOwn(TOPICS, value) ? value : 'random');
const pick = (list) => list[crypto.randomInt(list.length)];

// 라이어가 말한 답이 제시어와 같은지: 띄어쓰기·대소문자는 무시한다('피 자' = '피자', 'pc방' = 'PC방').
const normalizeGuess = (value) => String(value ?? '').replace(/\s+/g, '').toLocaleLowerCase('ko-KR');
const isCorrectGuess = (guess, word) => Boolean(normalizeGuess(guess)) && normalizeGuess(guess) === normalizeGuess(word);

// 표를 센다: 가장 많이 받은 사람이 한 명이면 그 사람, 아무도 안 찍었거나 동점이면 null(라이어를 못 찾음).
function tallyVotes(votes) {
  const counts = new Map();
  for (const target of votes.values()) counts.set(target, (counts.get(target) || 0) + 1);
  const best = Math.max(0, ...counts.values());
  const top = [...counts].filter(([, n]) => n === best).map(([id]) => id);
  return { counts: Object.fromEntries(counts), accusedId: best > 0 && top.length === 1 ? top[0] : null };
}

function setupLiarGame({ app, io, rootDir, secondMs = 1000 }) {
  const page = (name) => (_req, res) => res.sendFile(path.join(rootDir, 'public', name));
  app.get('/liar', page('liar.html'));
  app.get('/liar/room', page('liar-room.html'));
  app.get('/api/liar/topics', (_req, res) => res.json({ topics: Object.keys(TOPICS) }));

  const rooms = new Map();
  const timers = new Map();
  const channel = (room) => `liar:${room.code}`;
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

  // 모두에게 보내는 게임 상태. 라이어·제시어·누가 누구를 찍었는지는 끝나기 전엔 절대 넣지 않는다.
  function publicGame(game) {
    if (!game) return null;
    const msLeft = game.endsAt ? Math.max(0, game.endsAt - Date.now()) : null;
    return { phase: game.phase, topic: game.topic, order: game.order, turnUserId: game.phase === 'hint' ? game.order[game.turn] ?? null : null,
      hints: game.hints, msLeft, phaseSeconds: game.phaseSeconds, votedIds: [...game.votes.keys()],
      accusedId: game.accusedId, result: game.result };
  }
  function publicRoom(room) {
    return { code: room.code, title: room.title, state: room.state, hostId: room.hostId, maxPlayers: room.maxPlayers,
      mode: room.mode, topic: room.topic, hintTime: room.hintTime, talkTime: room.talkTime, isPublic: room.isPublic, playerCount: room.players.size,
      players: [...room.players.values()].map((p) => ({ userId: p.userId, nickname: p.nickname, color: p.color, ready: p.ready,
        connected: p.connected, score: p.score, isHost: room.hostId === p.userId })),
      game: publicGame(room.game) };
  }
  function publicList() {
    return [...rooms.values()].filter((r) => r.isPublic).map((r) => ({ code: r.code, title: r.title,
      playerCount: r.players.size, maxPlayers: r.maxPlayers, state: r.state, mode: r.mode, topic: r.topic,
      canJoin: r.state !== 'playing' && r.players.size < r.maxPlayers,
      hostNickname: r.players.get(r.hostId)?.nickname || '', createdAt: r.createdAt }));
  }

  function emitList() { io.emit('liar:rooms:list', publicList()); }
  function emitState(room) { io.to(channel(room)).emit('liar:room:state', publicRoom(room)); emitList(); }
  function addChat(room, message) {
    room.chat.push({ id: crypto.randomUUID(), at: Date.now(), ...message });
    if (room.chat.length > CHAT_LIMIT) room.chat.splice(0, room.chat.length - CHAT_LIMIT);
    io.to(channel(room)).emit('liar:chat:message', room.chat.at(-1));
  }
  function clearTimer(room) { clearTimeout(timers.get(room.code)); timers.delete(room.code); }
  function membership(socket) {
    const room = rooms.get(socket.data.liarRoomCode);
    const player = room?.players.get(socket.data.liarUserId);
    if (!room || !player || player.socketId !== socket.id) return {};
    return { room, player };
  }

  // 각자에게 자기 비밀만 보낸다. 바보 모드에선 라이어도 (다른) 제시어를 받아 모양이 똑같다 — 화면 코드를 봐도 구별이 안 된다.
  function secretFor(room, userId) {
    const { game } = room;
    if (!game || !game.order.includes(userId)) return null;
    if (game.liarId !== userId) return { topic: game.topic, word: game.word };
    return room.mode === 'fool' ? { topic: game.topic, word: game.foolWord } : { topic: game.topic, word: null };
  }
  function sendSecret(room, player) {
    const secret = secretFor(room, player.userId);
    if (secret) io.to(player.socketId).emit('liar:secret', secret);
  }

  // 단계마다 서버 시계가 끝을 정한다. seconds가 0이면 제한 없음.
  function setPhase(room, phase, seconds, onTimeout) {
    clearTimer(room);
    const { game } = room;
    Object.assign(game, { phase, phaseSeconds: seconds || null, endsAt: seconds ? Date.now() + seconds * secondMs : null });
    if (!seconds) return;
    const turn = game.turn;
    timers.set(room.code, setTimeout(() => {
      if (room.game !== game || game.phase !== phase || game.turn !== turn) return;
      onTimeout();
    }, seconds * secondMs));
  }

  // 아직 방에 있고 접속 중인 다음 사람에게 설명 차례를 넘긴다. 모두 했으면 토론으로.
  function nextHint(room) {
    const { game } = room;
    while (game.turn < game.order.length) {
      const player = room.players.get(game.order[game.turn]);
      if (player?.connected) break;
      if (player) game.hints.push({ userId: player.userId, nickname: player.nickname, color: player.color, text: '(자리에 없어서 건너뜀)', skipped: true });
      game.turn += 1;
    }
    if (game.turn >= game.order.length) {
      setPhase(room, 'talk', room.talkTime, () => startVote(room));
      addChat(room, { type: 'system', text: `💬 토론 시간! 누가 라이어일지 이야기해 보세요. (${room.talkTime}초)` });
      return;
    }
    setPhase(room, 'hint', room.hintTime, () => {
      const player = room.players.get(game.order[game.turn]);
      if (player) game.hints.push({ userId: player.userId, nickname: player.nickname, color: player.color, text: '⏰ 시간 초과', skipped: true });
      game.turn += 1; nextHint(room); emitState(room);
    });
  }

  function startVote(room) {
    setPhase(room, 'vote', VOTE_SECONDS, () => { countVotes(room); });
    addChat(room, { type: 'system', text: `🗳️ 투표 시간! 라이어라고 생각하는 사람을 누르세요. (${VOTE_SECONDS}초)` });
    emitState(room);
  }

  // 표를 낼 수 있는 사람(게임에 참여했고 지금 접속 중) 모두가 냈으면 바로 센다.
  function maybeCountVotes(room) {
    const { game } = room;
    if (game?.phase !== 'vote') return;
    const voters = game.order.filter((id) => room.players.get(id)?.connected);
    if (voters.every((id) => game.votes.has(id))) countVotes(room);
  }

  function countVotes(room) {
    const { game } = room;
    const { counts, accusedId } = tallyVotes(game.votes);
    game.counts = counts; game.accusedId = accusedId;
    const accused = room.players.get(accusedId);
    if (!accusedId) return finishGame(room, 'liar', '표가 갈려서 라이어를 정하지 못했어요.');
    if (accusedId !== game.liarId) return finishGame(room, 'liar', `${accused?.nickname || '그 사람'}님은 라이어가 아니었어요!`);
    setPhase(room, 'guess', GUESS_SECONDS, () => finishGame(room, 'citizens', '라이어가 시간 안에 제시어를 맞히지 못했어요.'));
    addChat(room, { type: 'system', text: `🎯 ${accused.nickname}님이 라이어로 지목됐어요! 라이어는 ${GUESS_SECONDS}초 안에 제시어를 맞히면 역전승!` });
    emitState(room);
  }

  // winner: 'liar' | 'citizens' | null(라이어가 나가서 무효)
  function finishGame(room, winner, reason) {
    clearTimer(room);
    const { game } = room;
    const liar = room.players.get(game.liarId);
    if (winner === 'liar' && liar) liar.score += LIAR_WIN_SCORE;
    if (winner === 'citizens') for (const id of game.order) if (id !== game.liarId && room.players.has(id)) room.players.get(id).score += CITIZEN_WIN_SCORE;
    game.result = { winner, reason, liarId: game.liarId, liarNickname: game.liarNickname, word: game.word,
      foolWord: room.mode === 'fool' ? game.foolWord : null, guess: game.guess ?? null, counts: game.counts || tallyVotes(game.votes).counts,
      votes: Object.fromEntries(game.votes) };
    Object.assign(game, { phase: 'result', endsAt: null, phaseSeconds: null });
    room.state = 'finished';
    const title = winner === 'liar' ? '🤥 라이어 승리!' : winner === 'citizens' ? '🙌 시민 승리!' : '게임이 끝났어요.';
    addChat(room, { type: 'system', text: `${title} ${reason} 라이어는 ${game.liarNickname}님, 제시어는 '${game.word}'였어요.` });
    emitState(room); // 바뀐 점수를 먼저 보내야 결과 창의 누적 점수가 맞게 나온다
    io.to(channel(room)).emit('liar:game:finished', game.result);
  }

  function startGame(room) {
    const topic = room.topic === 'random' ? pick(Object.keys(TOPICS)) : room.topic;
    const words = TOPICS[topic];
    const word = pick(words);
    const foolWord = pick(words.filter((w) => w !== word));
    // 설명 순서는 방 목록 순서를 무작위 자리에서 시작한다(라이어가 늘 첫째가 되지 않게 라이어와 따로 고른다).
    const ids = [...room.players.keys()];
    const first = crypto.randomInt(ids.length);
    const order = [...ids.slice(first), ...ids.slice(0, first)];
    const liarId = pick(ids);
    room.game = { id: ++gameCounter, topic, word, foolWord, liarId, liarNickname: room.players.get(liarId).nickname, order, turn: 0,
      hints: [], votes: new Map(), accusedId: null, guess: null, result: null, phase: 'hint', endsAt: null, phaseSeconds: null };
    room.state = 'playing';
    for (const player of room.players.values()) sendSecret(room, player);
    addChat(room, { type: 'system', text: `게임 시작! 주제는 '${topic}'이에요. 차례대로 제시어를 한 줄로 설명해 주세요.${room.mode === 'fool' ? ' (바보 모드: 라이어도 제시어를 받아요!)' : ''}` });
    nextHint(room);
    emitState(room);
  }

  // 게임 중 사람이 빠졌을 때: 라이어가 나가면 무효, 남은 사람이 3명보다 적으면 끝, 아니면 차례·투표를 이어 간다.
  function afterPlayerGone(room, player) {
    const { game } = room;
    if (room.state !== 'playing' || !game) return;
    if (!room.players.has(game.liarId)) return finishGame(room, null, '라이어가 방을 나가서 이번 판은 무효예요.');
    if (game.order.filter((id) => room.players.has(id)).length < MIN_PLAYERS) return finishGame(room, null, '사람이 3명보다 적어져서 게임을 끝내요.');
    game.votes.delete(player.userId);
    if (game.phase === 'hint' && game.order[game.turn] === player.userId) { nextHint(room); return; }
    if (game.phase === 'vote') maybeCountVotes(room);
  }

  function leave(socket, reason = 'left') {
    const { room, player } = membership(socket);
    if (!room) return;
    clearTimeout(player.disconnectTimer);
    room.players.delete(player.userId);
    socket.leave(channel(room));
    socket.data.liarRoomCode = null;
    if (!room.players.size) { clearTimer(room); rooms.delete(room.code); emitList(); return; }
    if (room.hostId === player.userId) room.hostId = room.players.keys().next().value;
    addChat(room, { type: 'system', text: `${player.nickname}님이 방에서 나갔습니다.`, reason });
    afterPlayerGone(room, player);
    emitState(room);
  }

  function closeRoom(room, message = '방장이 방을 종료했습니다.') {
    clearTimer(room);
    io.to(channel(room)).emit('liar:room:closed', { message });
    for (const player of room.players.values()) {
      clearTimeout(player.disconnectTimer);
      const playerSocket = io.sockets.sockets.get(player.socketId);
      if (!playerSocket) continue;
      playerSocket.leave(channel(room));
      if (playerSocket.data.liarRoomCode === room.code) playerSocket.data.liarRoomCode = null;
    }
    rooms.delete(room.code); emitList();
  }

  io.on('connection', (socket) => {
    socket.on('liar:rooms:list', () => socket.emit('liar:rooms:list', publicList()));

    socket.on('liar:room:create', (raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const nickname = text(raw?.nickname, 30); const userId = text(raw?.userId, 80);
      if (!nickname || !userId) return ack({ ok: false, message: '닉네임을 입력해 주세요.' });
      const hintTime = Number(raw?.hintTime); const talkTime = Number(raw?.talkTime);
      const code = roomCode();
      const room = { code, title: text(raw?.title, 30) || '라이어 게임', isPublic: raw?.isPublic !== false,
        maxPlayers: Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Number(raw?.maxPlayers) || 8)),
        mode: raw?.mode === 'fool' ? 'fool' : 'normal', topic: topicCode(raw?.topic),
        hintTime: HINT_TIMES.includes(hintTime) ? hintTime : 30, talkTime: TALK_TIMES.includes(talkTime) ? talkTime : 120,
        hostId: userId, players: new Map(), state: 'waiting', game: null, chat: [], createdAt: Date.now() };
      room.players.set(userId, { userId, nickname, socketId: socket.id, connected: true, ready: true, score: 0, color: COLORS[0] });
      rooms.set(code, room); socket.data.liarRoomCode = code; socket.data.liarUserId = userId; socket.join(channel(room));
      addChat(room, { type: 'system', text: `${nickname}님이 방을 만들었습니다.` }); emitState(room); ack({ ok: true, code });
    });

    socket.on('liar:room:join', (raw, ack = () => {}) => {
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
      clearTimeout(player.disconnectTimer);
      Object.assign(player, { nickname, socketId: socket.id, connected: true });
      room.players.set(userId, player);
      socket.data.liarRoomCode = code; socket.data.liarUserId = userId; socket.join(channel(room));
      if (!existing) addChat(room, { type: 'system', text: `${nickname}님이 참가했습니다.` });
      socket.emit('liar:chat:history', room.chat);
      sendSecret(room, player); // 새로고침해도 내 제시어를 다시 받는다
      emitState(room); ack({ ok: true, code });
    });

    socket.on('liar:room:ready', (ready, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket); if (!room) return ack({ ok: false });
      if (room.hostId === player.userId) return ack({ ok: false, message: '방장은 준비할 필요가 없습니다.' });
      player.ready = Boolean(ready); emitState(room); ack({ ok: true });
    });

    socket.on('liar:game:start', (_raw, ack = () => {}) => {
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

    socket.on('liar:hint', (raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket);
      const game = room?.game;
      if (!room || room.state !== 'playing' || game.phase !== 'hint') return ack({ ok: false, message: '지금은 설명 시간이 아니에요.' });
      if (game.order[game.turn] !== player.userId) return ack({ ok: false, message: '내 차례가 아니에요.' });
      const value = text(raw?.text, 40);
      if (!value) return ack({ ok: false, message: '설명을 입력해 주세요.' });
      // 내가 받은 제시어를 그대로 말하면 너무 쉬우니 막는다(띄어쓰기만 바꾼 것도).
      // 라이어는 진짜 제시어로 검사하지 않는다 — 막히는 순간 제시어를 알아채 버리기 때문.
      const myWord = secretFor(room, player.userId)?.word;
      if (myWord && normalizeGuess(value).includes(normalizeGuess(myWord))) return ack({ ok: false, message: '제시어를 그대로 말하면 안 돼요!' });
      game.hints.push({ userId: player.userId, nickname: player.nickname, color: player.color, text: value });
      game.turn += 1;
      ack({ ok: true });
      nextHint(room); emitState(room);
    });

    // 방장은 토론을 일찍 끝내고 바로 투표로 넘어갈 수 있다.
    socket.on('liar:skip-talk', (_raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket);
      if (!room || room.hostId !== player.userId) return ack({ ok: false, message: '방장만 넘길 수 있어요.' });
      if (room.state !== 'playing' || room.game.phase !== 'talk') return ack({ ok: false, message: '지금은 토론 시간이 아니에요.' });
      ack({ ok: true }); startVote(room);
    });

    // 투표는 끝나기 전까지 바꿀 수 있다. 모두 내면 바로 센다.
    socket.on('liar:vote', (raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket);
      const game = room?.game;
      if (!room || room.state !== 'playing' || game.phase !== 'vote') return ack({ ok: false, message: '지금은 투표 시간이 아니에요.' });
      if (!game.order.includes(player.userId)) return ack({ ok: false, message: '이번 판 참가자만 투표할 수 있어요.' });
      const targetId = text(raw?.targetId, 80);
      if (targetId === player.userId) return ack({ ok: false, message: '나 자신은 찍을 수 없어요.' });
      if (!game.order.includes(targetId) || !room.players.has(targetId)) return ack({ ok: false, message: '그 사람은 찍을 수 없어요.' });
      game.votes.set(player.userId, targetId);
      ack({ ok: true }); emitState(room);
      maybeCountVotes(room);
    });

    socket.on('liar:guess', (raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket);
      const game = room?.game;
      if (!room || room.state !== 'playing' || game.phase !== 'guess') return ack({ ok: false, message: '지금은 맞히기 시간이 아니에요.' });
      if (game.liarId !== player.userId) return ack({ ok: false, message: '라이어만 맞힐 수 있어요.' });
      const value = text(raw?.text, 30);
      if (!value) return ack({ ok: false, message: '제시어를 입력해 주세요.' });
      game.guess = value;
      ack({ ok: true });
      if (isCorrectGuess(value, game.word)) finishGame(room, 'liar', `라이어가 제시어 '${value}'를 맞혀 역전했어요!`);
      else finishGame(room, 'citizens', `라이어의 답 '${value}'는 틀렸어요.`);
    });

    socket.on('liar:chat:send', (raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket); if (!room) return ack({ ok: false });
      const value = text(raw?.text, 200); if (!value) return ack({ ok: false });
      addChat(room, { type: 'chat', userId: player.userId, nickname: player.nickname, color: player.color, text: value }); ack({ ok: true });
    });

    socket.on('liar:room:close', (_raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket);
      if (!room || room.hostId !== player.userId) return ack({ ok: false, message: '방장만 방을 종료할 수 있습니다.' });
      closeRoom(room); ack({ ok: true });
    });

    socket.on('liar:room:leave', (_raw, ack = () => {}) => { leave(socket); if (typeof ack === 'function') ack({ ok: true }); });

    // 새로고침처럼 금방 돌아오는 경우를 위해 3초 기다린 뒤에야 "연결 끊김"으로 보고 차례·투표를 넘긴다.
    socket.on('disconnect', () => {
      const { room, player } = membership(socket); if (!room) return;
      player.disconnectTimer = setTimeout(() => {
        if (room.players.get(player.userId) !== player || player.socketId !== socket.id) return;
        player.connected = false;
        const { game } = room;
        if (room.state === 'playing' && game.phase === 'hint' && game.order[game.turn] === player.userId) nextHint(room);
        if (room.state === 'playing') maybeCountVotes(room);
        emitState(room);
        player.disconnectTimer = setTimeout(() => {
          if (!player.connected && room.players.get(player.userId) === player) {
            socket.data.liarRoomCode = room.code; socket.data.liarUserId = player.userId; leave(socket, 'disconnect');
          }
        }, RECONNECT_MS);
      }, DISCONNECT_GRACE_MS);
    });
  });

  return { rooms, publicList,
    close: () => { for (const timer of timers.values()) clearTimeout(timer); rooms.clear(); } };
}

module.exports = { setupLiarGame, tallyVotes, isCorrectGuess, normalizeGuess, TOPICS };
