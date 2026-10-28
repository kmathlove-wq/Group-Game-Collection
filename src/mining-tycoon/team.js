// 광질 타이쿤 ⚔️ 팀전 — `mt:team:*` Socket.IO 이벤트(사용자 결정 2026-10-28).
// 방장이 팀 수(2~4)를 정해 방을 만들고, 들어오는 사람은 팀을 고른다(방장도 팀에 들어가 함께 함, 팀 인원 제한 없음).
// 방장이 시작하면 모두 같은 새 땅(같은 씨앗)에서 돈 0원부터 시작하고, 보물을 먼저 캔 팀이 이긴다.
// 땅은 모두 함께 쓰고(친구와 함께와 같은 방식), 돈·업그레이드·가방은 팀끼리 함께 쓴다(team-econ.js — 차이만 받아 더함).
// 차 물리·연료·체력은 각 브라우저가 한다. 점수 부정 검사는 하지 않는다(다른 광질 타이쿤 기능과 같음).
const crypto = require('crypto');
const Rules = require('../../public/mining-tycoon/js/rules.js');
const World = require('../../public/mining-tycoon/js/world.js');
const Econ = require('../../public/mining-tycoon/js/team-econ.js');

const MAX_PLAYERS = 16;
const MAX_ROOMS = 100;
const GRACE_MS = 15_000;
const END_KEEP_MS = 60_000; // 끝난 방은 1분 뒤 지운다
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CELLS = Rules.WIDTH * (Rules.DEPTH + 1);
const ORE_MAX = Rules.ORES.length - 1;
const TILES_PER_MESSAGE = 2_000;
const TEAMS = [
  { name: '빨강팀', emoji: '🔴', color: '#ff5a5a' },
  { name: '파랑팀', emoji: '🔵', color: '#4d8dff' },
  { name: '초록팀', emoji: '🟢', color: '#3cc46b' },
  { name: '보라팀', emoji: '🟣', color: '#a66bff' }
];

function cleanName(value) {
  return [...String(value ?? '').replace(/[<>\p{Cc}]/gu, '').trim()].slice(0, 20).join('') || '이름없음';
}

function setupMiningTeam({ io, graceMs = GRACE_MS, endKeepMs = END_KEEP_MS }) {
  const rooms = new Map(); // 코드 → 방
  const bySocket = new Map(); // socket.id → { room, player }
  const channel = (room) => 'mtt:' + room.code;
  const teamChannel = (room, team) => 'mtt:' + room.code + ':' + team;
  const reply = (ack, data) => { if (typeof ack === 'function') ack(data); };

  function newCode() {
    for (let tries = 0; tries < 100; tries++) {
      let code = '';
      for (let i = 0; i < 4; i++) code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
      if (!rooms.has(code)) return code;
    }
    return null;
  }

  const teamInfo = (room) => TEAMS.slice(0, room.teamCount).map((t, i) => ({ id: i, ...t }));
  function lobby(room) {
    return { code: room.code, phase: room.phase, teams: teamInfo(room), winner: room.winner,
      players: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, team: p.team, host: p.host, online: p.online })) };
  }
  // 게임 중 친구 차 목록(화면의 Multi가 쓰는 모양): 이름 앞에 팀 표시, 색은 팀 색
  const roster = (room) => [...room.players.values()].map((p) => ({ id: p.id, name: TEAMS[p.team].emoji + ' ' + p.name, color: TEAMS[p.team].color,
    host: p.host, online: p.online, pos: p.pos, team: p.team }));
  function emitLobby(room) {
    io.to(channel(room)).emit('mt:team:lobby', lobby(room));
    if (room.phase !== 'waiting') io.to(channel(room)).emit('mt:team:roster', roster(room));
  }
  // 팀원들이 보낸 차이를 어디까지 받았는지(acks)와 함께 팀 경제를 보낸다.
  function econMessage(room, team) {
    const acks = {};
    room.players.forEach((p) => { if (p.team === team) acks[p.id] = p.seq; });
    return { econ: room.econ[team], acks };
  }
  const emitEcon = (room, team) => io.to(teamChannel(room, team)).emit('mt:team:econ', econMessage(room, team));

  function join(socket, room, player) {
    player.socketId = socket.id;
    player.online = true;
    clearTimeout(player.timer);
    bySocket.set(socket.id, { room, player });
    socket.join(channel(room));
    socket.join(teamChannel(room, player.team));
  }

  function closeRoom(room, reason) {
    if (!rooms.has(room.code)) return;
    rooms.delete(room.code);
    clearTimeout(room.endTimer);
    room.players.forEach((p) => { clearTimeout(p.timer); bySocket.delete(p.socketId); });
    io.to(channel(room)).emit('mt:team:closed', { reason });
    for (let t = 0; t < room.teamCount; t++) io.in(teamChannel(room, t)).socketsLeave(teamChannel(room, t));
    io.in(channel(room)).socketsLeave(channel(room));
  }

  function finish(room, team, reason, by) {
    if (room.phase !== 'playing') return;
    room.phase = 'ended';
    room.winner = team;
    io.to(channel(room)).emit('mt:team:end', { winner: team, reason, by: by || '', teams: teamInfo(room) });
    emitLobby(room);
    room.endTimer = setTimeout(() => closeRoom(room, 'ended'), endKeepMs);
    room.endTimer.unref?.();
  }

  const nonEmptyTeams = (room) => new Set([...room.players.values()].map((p) => p.team));

  function removePlayer(room, player, reason) {
    if (!rooms.has(room.code)) return;
    room.players.delete(player.id);
    clearTimeout(player.timer);
    bySocket.delete(player.socketId);
    const s = io.sockets.sockets.get(player.socketId);
    s?.leave(channel(room));
    s?.leave(teamChannel(room, player.team));
    if (!room.players.size) { closeRoom(room, 'empty'); return; }
    if (player.host) { // 방장이 나가면 다음 사람이 방장
      const next = [...room.players.values()].find((p) => p.online) || room.players.values().next().value;
      next.host = true;
    }
    io.to(channel(room)).emit('mt:team:left', { id: player.id, name: player.name, reason });
    emitLobby(room);
    // 게임 중에 한 팀만 남으면 그 팀이 이긴다
    if (room.phase === 'playing') {
      const left = nonEmptyTeams(room);
      if (left.size === 1) finish(room, [...left][0], 'alone');
    }
  }

  function checkTeam(room, value) {
    const team = Number(value);
    return Number.isInteger(team) && team >= 0 && team < room.teamCount ? team : -1;
  }

  io.on('connection', (socket) => {
    // 🏠 팀전 방 만들기: 팀 수와 내 팀을 정한다.
    socket.on('mt:team:create', (raw, ack) => {
      if (bySocket.has(socket.id)) return reply(ack, { ok: false, message: '이미 팀전 방에 있어요.' });
      if (rooms.size >= MAX_ROOMS) return reply(ack, { ok: false, message: '지금은 방이 너무 많아요. 잠시 뒤 다시 해 주세요.' });
      const teamCount = Math.max(2, Math.min(TEAMS.length, Math.floor(Number(raw?.teams) || 2)));
      const code = newCode();
      if (!code) return reply(ack, { ok: false, message: '방 코드를 만들지 못했어요. 다시 해 주세요.' });
      const room = { code, teamCount, phase: 'waiting', players: new Map(), nextId: 0, seed: 0, tiles: null, ores: null, econ: [], winner: null };
      const team = checkTeam(room, raw?.team);
      const player = { id: room.nextId++, key: crypto.randomBytes(16).toString('hex'), name: cleanName(raw?.name), team: team < 0 ? 0 : team, host: true, pos: null, seq: 0 };
      room.players.set(player.id, player);
      rooms.set(code, room);
      join(socket, room, player);
      reply(ack, { ok: true, code, you: player.id, key: player.key, lobby: lobby(room) });
    });

    // 👀 코드로 방 미리 보기(팀 고르기 전에 팀 목록과 사람 수를 본다)
    socket.on('mt:team:peek', (raw, ack) => {
      const room = rooms.get(String(raw?.code ?? '').trim().toUpperCase());
      if (!room) return reply(ack, { ok: false, message: '그런 방 코드가 없어요. 코드를 다시 확인해 주세요.' });
      if (room.phase !== 'waiting') return reply(ack, { ok: false, message: '이미 게임이 시작된 방이에요.' });
      reply(ack, { ok: true, lobby: lobby(room) });
    });

    // 🚪 들어가기: 팀을 골라서 들어간다(게임이 시작되면 못 들어감).
    socket.on('mt:team:join', (raw, ack) => {
      if (bySocket.has(socket.id)) return reply(ack, { ok: false, message: '이미 팀전 방에 있어요.' });
      const room = rooms.get(String(raw?.code ?? '').trim().toUpperCase());
      if (!room) return reply(ack, { ok: false, message: '그런 방 코드가 없어요. 코드를 다시 확인해 주세요.' });
      if (room.phase !== 'waiting') return reply(ack, { ok: false, message: '이미 게임이 시작된 방이에요.' });
      if (room.players.size >= MAX_PLAYERS) return reply(ack, { ok: false, message: `방이 꽉 찼어요(최대 ${MAX_PLAYERS}명).` });
      const team = checkTeam(room, raw?.team);
      if (team < 0) return reply(ack, { ok: false, message: '팀을 골라 주세요.' });
      const player = { id: room.nextId++, key: crypto.randomBytes(16).toString('hex'), name: cleanName(raw?.name), team, host: false, pos: null, seq: 0 };
      room.players.set(player.id, player);
      join(socket, room, player);
      emitLobby(room);
      reply(ack, { ok: true, code: room.code, you: player.id, key: player.key, lobby: lobby(room) });
    });

    // 🔄 팀 바꾸기(시작 전에만)
    socket.on('mt:team:switch', (raw, ack) => {
      const found = bySocket.get(socket.id);
      if (!found) return reply(ack, { ok: false, message: '팀전 방에 없어요.' });
      const { room, player } = found;
      if (room.phase !== 'waiting') return reply(ack, { ok: false, message: '게임이 시작돼서 팀을 바꿀 수 없어요.' });
      const team = checkTeam(room, raw?.team);
      if (team < 0) return reply(ack, { ok: false, message: '그런 팀이 없어요.' });
      socket.leave(teamChannel(room, player.team));
      player.team = team;
      socket.join(teamChannel(room, team));
      emitLobby(room);
      reply(ack, { ok: true });
    });

    // ▶ 시작(방장만): 팀 두 개 이상에 사람이 있으면 인원이 달라도 시작한다.
    socket.on('mt:team:start', (_raw, ack) => {
      const found = bySocket.get(socket.id);
      if (!found) return reply(ack, { ok: false, message: '팀전 방에 없어요.' });
      const { room, player } = found;
      if (!player.host) return reply(ack, { ok: false, message: '방장만 시작할 수 있어요.' });
      if (room.phase !== 'waiting') return reply(ack, { ok: false, message: '이미 시작했어요.' });
      if (nonEmptyTeams(room).size < 2) return reply(ack, { ok: false, message: '두 팀 이상에 사람이 있어야 시작할 수 있어요.' });
      room.seed = crypto.randomInt(4294967296);
      const world = World.createWorld(room.seed);
      room.tiles = Buffer.from(world.tiles);
      room.ores = Buffer.from(world.ores);
      room.econ = [];
      for (let t = 0; t < room.teamCount; t++) room.econ.push(Econ.empty());
      room.players.forEach((p) => { p.seq = 0; p.pos = null; });
      room.phase = 'playing';
      room.players.forEach((p) => {
        io.to(p.socketId).emit('mt:team:started', { seed: room.seed, you: p.id, team: p.team, teams: teamInfo(room), players: roster(room), econ: econMessage(room, p.team) });
      });
      emitLobby(room);
      reply(ack, { ok: true });
    });

    // 🔌 다시 연결(끊긴 지 15초 안)
    socket.on('mt:team:rejoin', (raw, ack) => {
      const room = rooms.get(String(raw?.code ?? ''));
      const player = room && [...room.players.values()].find((p) => p.key === String(raw?.key ?? ''));
      if (!player) return reply(ack, { ok: false });
      if (player.socketId !== socket.id) {
        bySocket.delete(player.socketId);
        const old = io.sockets.sockets.get(player.socketId);
        old?.leave(channel(room));
        old?.leave(teamChannel(room, player.team));
      }
      join(socket, room, player);
      emitLobby(room);
      const playing = room.phase !== 'waiting';
      reply(ack, { ok: true, you: player.id, lobby: lobby(room), players: roster(room),
        tiles: playing ? room.tiles : undefined, ores: playing ? room.ores : undefined, econ: playing ? econMessage(room, player.team) : undefined });
    });

    // 🚗 차 위치·⛏️ 바뀐 땅: 친구와 함께(multi.js)와 같은 규칙
    socket.on('mt:team:move', (raw) => {
      const found = bySocket.get(socket.id);
      if (!found || found.room.phase !== 'playing' || !raw || typeof raw !== 'object') return;
      const x = Number(raw.x), y = Number(raw.y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > Rules.WIDTH || y < -10 || y > Rules.DEPTH + 1) return;
      const pos = {
        x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100,
        f: raw.f === -1 ? -1 : 1, d: raw.d === 1 || raw.d === 2 ? raw.d : 0, t: raw.t ? 1 : 0,
        l: Math.max(0, Math.min(Rules.UPGRADES.drill.prices.length, Math.floor(Number(raw.l) || 0))),
        h: Math.max(0, Math.min(Rules.UPGRADES.heat.prices.length, Math.floor(Number(raw.h) || 0)))
      };
      found.player.pos = pos;
      socket.to(channel(found.room)).emit('mt:team:move', { id: found.player.id, ...pos });
    });
    socket.on('mt:team:tiles', (raw) => {
      const found = bySocket.get(socket.id);
      if (!found || found.room.phase !== 'playing' || !Array.isArray(raw) || !raw.length || raw.length > TILES_PER_MESSAGE) return;
      const { room } = found;
      const good = [];
      for (const c of raw) {
        if (!Array.isArray(c) || c.length !== 3) continue;
        const [i, tile, ore] = c;
        if (!Number.isInteger(i) || i < 0 || i >= CELLS) continue;
        if (!Number.isInteger(tile) || tile < 0 || tile > Rules.TILE_MAX || !Number.isInteger(ore) || ore < 0 || ore > ORE_MAX) continue;
        room.tiles[i] = tile;
        room.ores[i] = ore;
        good.push([i, tile, ore]);
      }
      if (good.length) socket.to(channel(room)).emit('mt:team:tiles', good);
    });

    // 💰 팀 경제 차이: { seq, d: [숫자 한 줄] } — 더한 뒤 말이 되게 고쳐 팀 전체에 보낸다.
    socket.on('mt:team:econ', (raw) => {
      const found = bySocket.get(socket.id);
      if (!found || found.room.phase !== 'playing' || !raw || !Array.isArray(raw.d) || raw.d.length !== Econ.SIZE) return;
      const { room, player } = found;
      const seq = Math.floor(Number(raw.seq));
      if (!(seq > player.seq)) return; // 이미 받은 것
      player.seq = seq;
      const d = raw.d.map((n) => (Number.isFinite(Number(n)) ? Number(n) : 0));
      room.econ[player.team] = Econ.fix(Econ.add(room.econ[player.team], d));
      emitEcon(room, player.team);
    });

    // 🏪 팀 가방 팔기(서버가 직접 판다)
    socket.on('mt:team:sell', (_raw, ack) => {
      const found = bySocket.get(socket.id);
      if (!found || found.room.phase !== 'playing') return reply(ack, { ok: false, message: '팀전 중이 아니에요.' });
      const { room, player } = found;
      const result = Econ.sell(room.econ[player.team]);
      emitEcon(room, player.team);
      reply(ack, { ok: true, ...result });
    });

    // 🏆 보물을 캤다! 먼저 알린 팀이 이긴다.
    socket.on('mt:team:treasure', (_raw, ack) => {
      const found = bySocket.get(socket.id);
      if (!found) return reply(ack, { ok: false });
      const { room, player } = found;
      const first = room.phase === 'playing';
      finish(room, player.team, 'treasure', player.name);
      reply(ack, { ok: true, first });
    });

    socket.on('mt:team:leave', (_raw, ack) => {
      const found = bySocket.get(socket.id);
      if (found) removePlayer(found.room, found.player, 'left');
      reply(ack, { ok: true });
    });

    socket.on('disconnect', () => {
      const found = bySocket.get(socket.id);
      if (!found) return;
      const { room, player } = found;
      player.online = false;
      emitLobby(room);
      clearTimeout(player.timer);
      player.timer = setTimeout(() => { if (!player.online) removePlayer(room, player, 'gone'); }, graceMs);
      player.timer.unref?.();
    });
  });

  return { rooms };
}

module.exports = { setupMiningTeam, TEAMS, MAX_PLAYERS };
