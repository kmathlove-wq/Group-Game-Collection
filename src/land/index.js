const path = require('path');
const { createArena } = require('./arena');
const { botTarget } = require('./bot');

const TICK_MS = 100;
const MAX_HUMANS = 60;
const BOT_TARGET = 6;          // 사람+봇이 이 수보다 적으면 봇을 채운다
const BOT_RESPAWN_TICKS = 30;  // 봇은 탈락 3초 뒤 다시 태어남
const DISCONNECT_GRACE_MS = 3_000;
const SCORE_EVERY = 5;         // 0.5초마다 순위 보내기
const CHANNEL = 'land';
const REASONS = { cut: '꼬리를 밟혔어요', self: '내 꼬리를 밟았어요', crash: '머리끼리 부딪혔어요', surrounded: '땅을 모두 빼앗겼어요' };
const BOT_NAMES = ['🤖 꼬마봇', '🤖 네모봇', '🤖 빙글봇', '🤖 슝슝봇', '🤖 콩콩봇', '🤖 반짝봇'];

function text(value, maxLength) {
  return [...String(value ?? '').replace(/[<>\p{Cc}]/gu, '').trim()].slice(0, maxLength).join('');
}

function setupLandGame({ app, io, rootDir, tickMs = TICK_MS, botCount = BOT_TARGET, arenaOptions = {} }) {
  app.get('/land', (_req, res) => res.sendFile(path.join(rootDir, 'public', 'land.html')));

  const arena = createArena({ size: 360, ...arenaOptions });
  const humans = new Map();  // userId → { userId, socketId, nickname, playerId, connected, timer }
  const bots = new Map();    // playerId → { respawnAt }
  let loop = null;

  const playing = () => [...humans.values()].filter((h) => h.playerId && arena.players.get(h.playerId)?.alive).length;
  const humanOf = (playerId) => [...humans.values()].find((h) => h.playerId === playerId);

  function roster() {
    return [...arena.players.values()].map((p) => ({ id: p.id, nickname: p.nickname, color: p.color, bot: p.bot }));
  }
  const emitRoster = () => io.to(CHANNEL).emit('land:roster', roster());

  function scores() {
    return [...arena.players.values()].filter((p) => p.alive).map((p) => [p.id, arena.counts[p.id], p.kills]);
  }

  function stats(p) {
    return { cells: arena.counts[p.id], best: p.best, percent: Math.round(p.best / arena.total * 1000) / 10,
      kills: p.kills, seconds: Math.round((arena.tickNo - p.bornAt) * tickMs / 100) / 10 };
  }

  // 사람 수에 맞춰 봇 수를 맞춘다(사람이 많으면 봇을 뺀다).
  function balanceBots() {
    const people = [...humans.values()].filter((h) => h.playerId).length;
    const want = Math.max(0, botCount - people);
    while (bots.size > want) {
      const id = [...bots.keys()].pop();
      bots.delete(id); arena.removePlayer(id);
    }
    while (bots.size < want) {
      const used = new Set([...arena.players.values()].map((p) => p.nickname));
      const p = arena.addPlayer({ nickname: BOT_NAMES.find((n) => !used.has(n)) || '🤖 봇', bot: true });
      if (!p) break;
      bots.set(p.id, { respawnAt: arena.tickNo });
    }
  }

  function step() {
    for (const [id, info] of bots) {
      const p = arena.players.get(id);
      if (!p.alive) { if (arena.tickNo >= info.respawnAt) { p.botState = null; arena.spawn(p); } continue; }
      arena.steer(id, botTarget(arena, p));
    }
    const result = arena.tick();
    // 바뀐 땅만 보낸다(o = [시작 칸, 길이, 주인 …]). 하나라도 빠지면 판이 어긋나므로 volatile은 쓰지 않는다.
    // 꼬리는 따로 안 보내고, 화면이 "땅 밖에 있는 동안의 머리 위치"를 이어 그린다.
    io.to(CHANNEL).emit('land:tick', { t: result.tick, p: result.players, o: result.owner });

    let rosterChanged = false;
    for (const event of result.events) {
      if (event.type !== 'death') continue;
      const victim = arena.players.get(event.id); const killer = arena.players.get(event.by);
      io.to(CHANNEL).emit('land:feed', { victim: victim.nickname, victimColor: victim.color, killer: killer?.nickname || '', killerColor: killer?.color || '', reason: event.reason });
      if (bots.has(event.id)) { bots.get(event.id).respawnAt = arena.tickNo + BOT_RESPAWN_TICKS; continue; }
      const human = humanOf(event.id);
      if (human) {
        io.to(human.socketId).emit('land:died', { reason: REASONS[event.reason] || '탈락했어요', by: killer?.nickname || '', ...stats(victim) });
        human.playerId = null; arena.removePlayer(event.id); rosterChanged = true;
      }
    }
    const conquer = result.events.find((e) => e.type === 'conquer');
    if (conquer) {
      const winner = arena.players.get(conquer.id);
      for (const human of humans.values()) {
        const p = arena.players.get(human.playerId);
        if (p) io.to(human.socketId).emit('land:died', { reason: '판이 정복되어 새로 시작해요', by: '', conquered: true, ...stats(p) });
        if (human.playerId) { arena.removePlayer(human.playerId); human.playerId = null; }
      }
      arena.reset();
      for (const info of bots.values()) info.respawnAt = arena.tickNo + BOT_RESPAWN_TICKS;
      io.to(CHANNEL).emit('land:conquered', { nickname: winner.nickname, color: winner.color, bot: winner.bot });
      io.to(CHANNEL).emit('land:snapshot', arena.snapshot());
      rosterChanged = true;
    }
    if (rosterChanged) { balanceBots(); emitRoster(); }
    if (result.tick % SCORE_EVERY === 0) io.to(CHANNEL).emit('land:scores', scores());
  }

  // 화면을 보는 사람이 있을 때만 판을 돌린다(무료 서버 CPU 아끼기).
  function updateLoop() {
    const watching = [...humans.values()].some((h) => h.connected);
    if (watching && !loop) {
      balanceBots(); emitRoster();
      loop = setInterval(step, tickMs);
      loop.unref();
    } else if (!watching && loop) {
      clearInterval(loop); loop = null;
      for (const id of bots.keys()) arena.removePlayer(id);
      bots.clear();
    }
  }

  function removeHuman(human) {
    clearTimeout(human.timer);
    if (human.playerId) arena.removePlayer(human.playerId);
    humans.delete(human.userId);
    balanceBots(); emitRoster(); updateLoop();
  }

  const byUser = (socket) => {
    const human = humans.get(socket.data.landUserId);
    return human && human.socketId === socket.id ? human : null;
  };

  io.on('connection', (socket) => {
    // 판 보기 시작: 지금 판 전체와 참가자 목록을 받는다. 같은 userId로 돌아오면 하던 판을 이어 간다.
    socket.on('land:enter', (raw, ack) => {
      if (typeof ack !== 'function') return;
      const userId = text(raw?.userId, 80);
      if (!userId) return ack({ ok: false, message: '잘못된 요청이에요.' });
      let human = humans.get(userId);
      if (human) {
        clearTimeout(human.timer);
        if (human.socketId !== socket.id) io.sockets.sockets.get(human.socketId)?.leave(CHANNEL);
      } else {
        human = { userId, nickname: '', playerId: null };
        humans.set(userId, human);
      }
      Object.assign(human, { socketId: socket.id, connected: true });
      socket.data.landUserId = userId;
      socket.join(CHANNEL);
      updateLoop();
      ack({ ok: true, snapshot: arena.snapshot(), roster: roster(), scores: scores(), you: human.playerId || 0, tickMs });
    });

    socket.on('land:play', (raw, ack) => {
      if (typeof ack !== 'function') return;
      const human = byUser(socket);
      if (!human) return ack({ ok: false, message: '먼저 판에 들어와 주세요.' });
      const nickname = text(raw?.nickname, 20);
      if (!nickname) return ack({ ok: false, message: '닉네임을 입력해 주세요.' });
      if (human.playerId) return ack({ ok: true, you: human.playerId });
      if (playing() >= MAX_HUMANS) return ack({ ok: false, message: `판이 꽉 찼어요(최대 ${MAX_HUMANS}명). 잠시 뒤 다시 해 주세요.` });
      const p = arena.addPlayer({ nickname });
      if (!p) return ack({ ok: false, message: '판이 꽉 찼어요.' });
      if (!arena.spawn(p)) { arena.removePlayer(p.id); return ack({ ok: false, message: '태어날 빈자리가 없어요. 잠시 뒤 다시 해 주세요.' }); }
      human.nickname = nickname; human.playerId = p.id;
      balanceBots(); emitRoster();
      ack({ ok: true, you: p.id });
    });

    // 가고 싶은 방향(라디안 각도). 실제로는 서버가 조금씩 돌려 곡선으로 움직인다.
    socket.on('land:steer', (angle) => {
      const human = byUser(socket);
      if (human?.playerId && typeof angle === 'number') arena.steer(human.playerId, angle);
    });

    socket.on('land:leave', (_raw, ack) => {
      const human = byUser(socket);
      if (human) { socket.leave(CHANNEL); removeHuman(human); }
      if (typeof ack === 'function') ack({ ok: true });
    });

    // 새로고침처럼 금방 돌아오는 경우를 위해 3초 기다린 뒤에야 판에서 뺀다(그동안 캐릭터는 계속 달린다).
    socket.on('disconnect', () => {
      const human = byUser(socket);
      if (!human) return;
      human.connected = false;
      human.timer = setTimeout(() => { if (!human.connected) removeHuman(human); }, DISCONNECT_GRACE_MS);
    });
  });

  return { arena, humans, bots, step, close: () => { clearInterval(loop); loop = null; for (const h of humans.values()) clearTimeout(h.timer); } };
}

module.exports = { setupLandGame, MAX_HUMANS };
