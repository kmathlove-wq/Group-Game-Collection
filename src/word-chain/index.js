const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { precheck, lastSyllable, allowedStarts } = require('./rules');
const { DictionaryError, DICTIONARIES } = require('./dictionary');

const MAX_PLAYERS = 8;
const TURN_TIMES = [10, 15, 20, 30];
const COLORS = ['#ff4d75', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
const DISCONNECT_GRACE_MS = 3_000;
const RECONNECT_MS = 30_000;
const CHAT_LIMIT = 100;
const PUBLIC_WORD_LIMIT = 60;
const MIN_RESUME_MS = 1_500;   // 틀린 단어를 낸 뒤 다시 입력할 최소 시간
const SOLO_TTL_MS = 30 * 60 * 1000;
const SOLO_MAX = 1_000;

function text(value, maxLength) {
  return [...String(value ?? '').replace(/[<>\p{Cc}]/gu, '').trim()].slice(0, maxLength).join('');
}
const dictionaryCode = (value) => (Object.hasOwn(DICTIONARIES, value) ? value : 'stdict');

// 단어 하나를 규칙 → 사전 → (첫 단어면) 한방단어 순서로 검사한다. 빠른 검사부터 해서 사전 호출을 아낀다.
async function checkWord(dictionary, dictName, raw, previousWord, usedWords) {
  const word = String(raw ?? '').replace(/\s/g, '').slice(0, 40);
  const problem = precheck(word, previousWord, usedWords);
  if (problem) return { ok: false, message: problem };
  try {
    const found = await dictionary.lookup(dictName, word);
    if (!found.found) return { ok: false, message: found.reason };
    if (!previousWord && !(await dictionary.hasContinuation(dictName, lastSyllable(word)))) {
      return { ok: false, message: '첫 단어로는 한방단어(이어 말할 단어가 없는 단어)를 쓸 수 없어요.' };
    }
    return { ok: true, word, definition: found.definition };
  } catch (error) {
    if (!(error instanceof DictionaryError)) console.error('[word-chain]', error);
    return { ok: false, dictionaryError: true, message: error instanceof DictionaryError ? error.message : '사전을 확인하다 문제가 생겼어요.' };
  }
}

// 살아남은 사람이 1등, 나머지는 늦게 탈락한 순서대로 등수를 매긴다(나간 사람은 빠짐).
function rankPlayers(players, eliminated) {
  const list = [...players];
  const alive = list.filter((p) => p.alive);
  const out = [...eliminated].reverse().map((id) => list.find((p) => p.userId === id && !p.alive)).filter(Boolean);
  return [...alive.map((p) => ({ p, rank: 1 })), ...out.map((p, i) => ({ p, rank: alive.length + i + 1 }))]
    .map(({ p, rank }) => ({ rank, userId: p.userId, nickname: p.nickname, color: p.color, score: p.score }));
}

// secondMs는 테스트에서 차례 시간을 짧게 돌리려고 둔 값이다(운영은 항상 1000).
function setupWordChainGame({ app, io, rootDir, dictionary, secondMs = 1000 }) {
  const page = (name) => (_req, res) => res.sendFile(path.join(rootDir, 'public', name));
  app.get('/word-chain', page('word-chain.html'));
  app.get('/word-chain/solo', page('word-chain-solo.html'));
  app.get('/word-chain/lobby', page('word-chain-lobby.html'));
  app.get('/word-chain/room', page('word-chain-room.html'));
  const json = express.json({ limit: '2kb' });

  app.get('/api/word-chain/status', (_req, res) => {
    res.json({ dictionaries: Object.entries(DICTIONARIES).map(([code, d]) => ({ code, name: d.name, ready: dictionary.isConfigured(code) })) });
  });

  // ── 컴퓨터랑 대결: 진행 상황은 서버가 기억하고, 단어 검사도 서버가 한다 ──
  const soloGames = new Map();
  const soloCleanup = setInterval(() => {
    const now = Date.now();
    for (const [id, game] of soloGames) if (now - game.lastActive > SOLO_TTL_MS) soloGames.delete(id);
  }, 60_000);
  soloCleanup.unref();

  app.post('/api/word-chain/solo', json, (req, res) => {
    const dict = dictionaryCode(req.body?.dictionary);
    if (!dictionary.isConfigured(dict)) return res.status(503).json({ ok: false, message: `${DICTIONARIES[dict].name} API 키가 아직 설정되지 않았어요.` });
    if (soloGames.size >= SOLO_MAX) soloGames.delete(soloGames.keys().next().value);
    const id = crypto.randomUUID();
    soloGames.set(id, { dictionary: dict, used: new Set(), lastWord: null, score: 0, busy: false, finished: false, lastActive: Date.now() });
    res.json({ ok: true, id, dictionary: dict });
  });

  app.post('/api/word-chain/solo/:id/word', json, async (req, res) => {
    const game = soloGames.get(req.params.id);
    if (!game) return res.status(404).json({ ok: false, message: '게임이 오래되어 끝났어요. 새 게임을 시작해 주세요.' });
    if (game.finished) return res.status(400).json({ ok: false, message: '이미 끝난 게임이에요.' });
    if (game.busy) return res.status(429).json({ ok: false, message: '앞 단어를 확인하는 중이에요.' });
    game.busy = true; game.lastActive = Date.now();
    try {
      const result = await checkWord(dictionary, game.dictionary, req.body?.word, game.lastWord, game.used);
      if (!result.ok) return res.json(result);
      game.used.add(result.word);
      let computer;
      try { computer = await dictionary.pickWord(game.dictionary, lastSyllable(result.word), game.used); }
      catch (error) {
        game.used.delete(result.word); // 컴퓨터가 대답을 못 한 건 사전 연결 문제이니 내 단어를 없던 일로 한다
        return res.json({ ok: false, dictionaryError: true, message: error instanceof DictionaryError ? error.message : '사전을 확인하다 문제가 생겼어요.' });
      }
      game.score += 1;
      const player = { word: result.word, definition: result.definition };
      if (!computer) {
        game.finished = true; game.lastWord = result.word;
        return res.json({ ok: true, player, computer: null, finished: true, result: 'win', score: game.score });
      }
      game.used.add(computer.word); game.lastWord = computer.word;
      res.json({ ok: true, player, computer, nextStarts: allowedStarts(lastSyllable(computer.word)), finished: false, score: game.score });
    } finally { game.busy = false; }
  });

  app.post('/api/word-chain/solo/:id/giveup', (req, res) => {
    const game = soloGames.get(req.params.id);
    if (!game) return res.status(404).json({ ok: false, message: '게임을 찾을 수 없어요.' });
    game.finished = true;
    res.json({ ok: true, result: 'lose', score: game.score });
  });

  // ── 여럿이 방에서 ──
  const rooms = new Map();
  const timers = new Map();
  const channel = (room) => `wc:${room.code}`;
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

  function publicGame(game) {
    if (!game) return null;
    return { words: game.words.slice(-PUBLIC_WORD_LIMIT), wordCount: game.words.length, turnUserId: game.turnUserId,
      turnMsLeft: game.checking ? game.pausedMs : game.turnEndsAt ? Math.max(0, game.turnEndsAt - Date.now()) : null,
      checking: game.checking, lastWord: game.lastWord, nextStarts: game.lastWord ? allowedStarts(lastSyllable(game.lastWord)) : null,
      ranking: game.ranking || null };
  }
  function publicRoom(room) {
    return { code: room.code, title: room.title, state: room.state, hostId: room.hostId, maxPlayers: room.maxPlayers,
      turnTime: room.turnTime, dictionary: room.dictionary, dictionaryName: DICTIONARIES[room.dictionary].name,
      isPublic: room.isPublic, playerCount: room.players.size,
      players: [...room.players.values()].map((p) => ({ userId: p.userId, nickname: p.nickname, color: p.color, ready: p.ready,
        connected: p.connected, alive: p.alive, score: p.score, isHost: room.hostId === p.userId })),
      game: publicGame(room.game) };
  }
  function publicList() {
    return [...rooms.values()].filter((r) => r.isPublic).map((r) => ({ code: r.code, title: r.title,
      playerCount: r.players.size, maxPlayers: r.maxPlayers, state: r.state, turnTime: r.turnTime,
      dictionaryName: DICTIONARIES[r.dictionary].name, canJoin: r.state !== 'playing' && r.players.size < r.maxPlayers,
      hostNickname: r.players.get(r.hostId)?.nickname || '', createdAt: r.createdAt }));
  }

  function emitList() { io.emit('wc:rooms:list', publicList()); }
  function emitState(room) { io.to(channel(room)).emit('wc:room:state', publicRoom(room)); emitList(); }
  function addChat(room, message) {
    room.chat.push({ id: crypto.randomUUID(), at: Date.now(), ...message });
    if (room.chat.length > CHAT_LIMIT) room.chat.splice(0, room.chat.length - CHAT_LIMIT);
    io.to(channel(room)).emit('wc:chat:message', room.chat.at(-1));
  }
  function clearTimer(room) { clearTimeout(timers.get(room.code)); timers.delete(room.code); }
  function membership(socket) {
    const room = rooms.get(socket.data.wcRoomCode);
    const player = room?.players.get(socket.data.wcUserId);
    if (!room || !player || player.socketId !== socket.id) return {};
    return { room, player };
  }
  const aliveCount = (room) => [...room.players.values()].filter((p) => p.alive).length;

  function finishGame(room, reason = '') {
    clearTimer(room);
    room.state = 'finished';
    Object.assign(room.game, { turnUserId: null, turnEndsAt: null, checking: false, checkToken: null });
    room.game.ranking = rankPlayers(room.players.values(), room.game.eliminated);
    if (reason) addChat(room, { type: 'system', text: reason });
    io.to(channel(room)).emit('wc:game:finished', { ranking: room.game.ranking });
    emitState(room);
  }

  function startTimer(room, ms) {
    clearTimer(room);
    const { game } = room; const userId = game.turnUserId;
    game.turnEndsAt = Date.now() + ms;
    timers.set(room.code, setTimeout(() => {
      if (room.state !== 'playing' || game.turnUserId !== userId || game.checking) return;
      const player = room.players.get(userId);
      if (player) eliminate(room, player, `⏰ ${player.nickname}님 시간 초과! 탈락했어요.`);
    }, ms));
  }

  // 지금 차례 다음의, 아직 탈락하지 않은 접속 중인 사람에게 차례를 넘긴다.
  function nextTurn(room) {
    clearTimer(room);
    const { game } = room; const { order } = game;
    Object.assign(game, { checking: false, checkToken: null, pausedMs: null });
    const current = Math.max(0, order.indexOf(game.turnUserId));
    let next = null;
    for (let step = 1; step <= order.length; step += 1) {
      const p = room.players.get(order[(current + step) % order.length]);
      if (p?.alive && p.connected) { next = p.userId; break; }
    }
    game.turnUserId = next;
    if (next) startTimer(room, room.turnTime * secondMs); else game.turnEndsAt = null;
  }

  // 탈락하면 끝말이 끊기고, 다음 사람은 아무 단어로 새로 시작한다(한방단어 금지는 다시 적용).
  function eliminate(room, player, message) {
    player.alive = false;
    room.game.eliminated.push(player.userId);
    room.game.lastWord = null;
    addChat(room, { type: 'out', userId: player.userId, color: player.color, text: message });
    io.to(channel(room)).emit('wc:player:out', { userId: player.userId });
    if (aliveCount(room) <= 1) {
      const winner = [...room.players.values()].find((p) => p.alive);
      return finishGame(room, winner ? `🏆 ${winner.nickname}님이 끝까지 살아남았어요!` : '게임이 끝났어요.');
    }
    addChat(room, { type: 'system', text: '끝말이 끊겼어요. 다음 사람은 아무 단어로 새로 시작해요.' });
    nextTurn(room); emitState(room);
  }

  function startGame(room) {
    const order = [...room.players.keys()];
    for (const p of room.players.values()) Object.assign(p, { alive: true, score: 0 });
    room.game = { id: ++gameCounter, order, turnUserId: order.at(-1), turnEndsAt: null, words: [], used: new Set(), lastWord: null,
      eliminated: [], checking: false, checkToken: null, pausedMs: null, ranking: null };
    room.state = 'playing';
    nextTurn(room); // 마지막 사람 다음 = 첫 번째 사람부터
    addChat(room, { type: 'system', text: `게임 시작! ${DICTIONARIES[room.dictionary].name} 기준이에요. 첫 단어는 한방단어를 쓸 수 없어요.` });
    emitState(room);
  }

  function leave(socket, reason = 'left') {
    const { room, player } = membership(socket);
    if (!room) return;
    clearTimeout(player.disconnectTimer);
    room.players.delete(player.userId);
    socket.leave(channel(room));
    socket.data.wcRoomCode = null;
    if (!room.players.size) { clearTimer(room); rooms.delete(room.code); emitList(); return; }
    if (room.hostId === player.userId) room.hostId = room.players.keys().next().value;
    addChat(room, { type: 'system', text: `${player.nickname}님이 방에서 나갔습니다.`, reason });
    if (room.state === 'playing') {
      if (aliveCount(room) <= 1) return finishGame(room, '살아남은 참가자가 1명뿐이라 게임을 끝냅니다.');
      if (room.game.turnUserId === player.userId) nextTurn(room);
    }
    emitState(room);
  }

  function closeRoom(room, message = '방장이 방을 종료했습니다.') {
    clearTimer(room);
    io.to(channel(room)).emit('wc:room:closed', { message });
    for (const player of room.players.values()) {
      clearTimeout(player.disconnectTimer);
      const playerSocket = io.sockets.sockets.get(player.socketId);
      if (!playerSocket) continue;
      playerSocket.leave(channel(room));
      if (playerSocket.data.wcRoomCode === room.code) playerSocket.data.wcRoomCode = null;
    }
    rooms.delete(room.code); emitList();
  }

  io.on('connection', (socket) => {
    socket.on('wc:rooms:list', () => socket.emit('wc:rooms:list', publicList()));

    socket.on('wc:room:create', (raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const nickname = text(raw?.nickname, 30); const userId = text(raw?.userId, 80);
      if (!nickname || !userId) return ack({ ok: false, message: '닉네임을 입력해 주세요.' });
      const dict = dictionaryCode(raw?.dictionary);
      if (!dictionary.isConfigured(dict)) return ack({ ok: false, message: `${DICTIONARIES[dict].name} API 키가 아직 설정되지 않았어요.` });
      const turnTime = Number(raw?.turnTime);
      const code = roomCode();
      const room = { code, title: text(raw?.title, 30) || '끝말잇기', isPublic: raw?.isPublic !== false, dictionary: dict,
        maxPlayers: Math.min(MAX_PLAYERS, Math.max(2, Number(raw?.maxPlayers) || MAX_PLAYERS)),
        turnTime: TURN_TIMES.includes(turnTime) ? turnTime : 15,
        hostId: userId, players: new Map(), state: 'waiting', game: null, chat: [], createdAt: Date.now() };
      room.players.set(userId, { userId, nickname, socketId: socket.id, connected: true, ready: true, alive: true, score: 0, color: COLORS[0] });
      rooms.set(code, room); socket.data.wcRoomCode = code; socket.data.wcUserId = userId; socket.join(channel(room));
      addChat(room, { type: 'system', text: `${nickname}님이 방을 만들었습니다.` }); emitState(room); ack({ ok: true, code });
    });

    socket.on('wc:room:join', (raw, ack = () => {}) => {
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
      const player = existing || { userId, ready: false, alive: true, score: 0, color: freeColor(room) };
      const wasAway = existing && !existing.connected;
      clearTimeout(player.disconnectTimer);
      Object.assign(player, { nickname, socketId: socket.id, connected: true });
      room.players.set(userId, player);
      socket.data.wcRoomCode = code; socket.data.wcUserId = userId; socket.join(channel(room));
      if (!existing) addChat(room, { type: 'system', text: `${nickname}님이 참가했습니다.` });
      socket.emit('wc:chat:history', room.chat);
      // 모두 끊겨 멈춰 있던 게임이면 돌아온 사람부터 다시 진행한다.
      if (wasAway && room.state === 'playing' && !room.game.turnUserId && player.alive) {
        const { order } = room.game;
        room.game.turnUserId = order[(order.indexOf(userId) - 1 + order.length) % order.length];
        nextTurn(room);
      }
      emitState(room); ack({ ok: true, code });
    });

    socket.on('wc:room:ready', (ready, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket); if (!room) return ack({ ok: false });
      if (room.hostId === player.userId) return ack({ ok: false, message: '방장은 준비할 필요가 없습니다.' });
      player.ready = Boolean(ready); emitState(room); ack({ ok: true });
    });

    socket.on('wc:game:start', (_raw, ack = () => {}) => {
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

    socket.on('wc:word', async (raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket);
      if (!room || room.state !== 'playing') return ack({ ok: false, message: '게임 중이 아닙니다.' });
      const { game } = room;
      if (game.turnUserId !== player.userId) return ack({ ok: false, message: '내 차례가 아니에요.' });
      if (game.checking) return ack({ ok: false, message: '사전에서 확인하는 중이에요.' });
      // 사전을 확인하는 동안은 시계를 멈춘다(국립국어원 서버가 느려도 억울하게 시간이 줄지 않게).
      const token = crypto.randomUUID();
      Object.assign(game, { checking: true, checkToken: token, pausedMs: Math.max(0, (game.turnEndsAt || Date.now()) - Date.now()) });
      clearTimer(room); game.turnEndsAt = null; emitState(room);
      const result = await checkWord(dictionary, room.dictionary, raw?.word, game.lastWord, game.used);
      // 확인하는 사이에 나가거나 끊겨 차례가 넘어갔으면 결과를 버린다.
      if (rooms.get(room.code) !== room || room.game !== game || game.checkToken !== token) return ack({ ok: false, message: '차례가 이미 넘어갔어요.' });
      game.checking = false; game.checkToken = null;
      if (!result.ok) {
        const tried = String(raw?.word ?? '').replace(/\s/g, '').slice(0, 20);
        if (tried) addChat(room, { type: 'reject', userId: player.userId, color: player.color, text: `${player.nickname}: ${tried} ✗ ${result.message}` });
        startTimer(room, Math.max(game.pausedMs, Math.min(MIN_RESUME_MS, room.turnTime * secondMs))); game.pausedMs = null;
        emitState(room); return ack(result);
      }
      game.words.push({ word: result.word, definition: result.definition, userId: player.userId, nickname: player.nickname, color: player.color });
      game.used.add(result.word); game.lastWord = result.word; player.score += 1;
      io.to(channel(room)).emit('wc:word:accepted', { word: result.word, userId: player.userId });
      ack({ ok: true, word: result.word });
      nextTurn(room); emitState(room);
    });

    socket.on('wc:chat:send', (raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket); if (!room) return ack({ ok: false });
      const value = text(raw?.text, 200); if (!value) return ack({ ok: false });
      addChat(room, { type: 'chat', userId: player.userId, nickname: player.nickname, text: value }); ack({ ok: true });
    });

    socket.on('wc:room:close', (_raw, ack = () => {}) => {
      if (typeof ack !== 'function') return;
      const { room, player } = membership(socket);
      if (!room || room.hostId !== player.userId) return ack({ ok: false, message: '방장만 방을 종료할 수 있습니다.' });
      closeRoom(room); ack({ ok: true });
    });

    socket.on('wc:room:leave', (_raw, ack = () => {}) => { leave(socket); if (typeof ack === 'function') ack({ ok: true }); });

    // 새로고침·화면 이동처럼 금방 돌아오는 경우를 위해 3초 기다린 뒤에야 "연결 끊김"으로 처리하고 차례를 넘긴다.
    socket.on('disconnect', () => {
      const { room, player } = membership(socket); if (!room) return;
      player.disconnectTimer = setTimeout(() => {
        if (room.players.get(player.userId) !== player || player.socketId !== socket.id) return;
        player.connected = false;
        if (room.state === 'playing' && room.game.turnUserId === player.userId) nextTurn(room);
        emitState(room);
        player.disconnectTimer = setTimeout(() => {
          if (!player.connected && room.players.get(player.userId) === player) {
            socket.data.wcRoomCode = room.code; socket.data.wcUserId = player.userId; leave(socket, 'disconnect');
          }
        }, RECONNECT_MS);
      }, DISCONNECT_GRACE_MS);
    });
  });

  return { rooms, soloGames, publicList,
    close: () => { clearInterval(soloCleanup); for (const timer of timers.values()) clearTimeout(timer); rooms.clear(); soloGames.clear(); } };
}

module.exports = { setupWordChainGame, rankPlayers, checkWord, TURN_TIMES };
