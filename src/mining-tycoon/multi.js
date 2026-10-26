// 광질 타이쿤 👫 친구와 함께(멀티) — `mt:*` Socket.IO 이벤트.
// 방장이 자기 땅을 올리면 4글자 방 코드가 나오고, 친구는 코드로 그 땅에 놀러 온다(최대 4명).
// 땅은 같이 쓰고 돈·차·업그레이드는 각자 것이다(사용자 결정 2026-10-26).
// 차는 각 브라우저가 스스로 움직이고, 서버는 ① 차 위치 ② 바뀐 땅 칸만 같은 방 사람들에게 전해 준다.
// 서버도 땅을 한 벌 들고 있어서 새로 온 친구·다시 연결한 사람에게 지금 땅을 통째로 준다.
const crypto = require('crypto');
const Rules = require('../../public/mining-tycoon/js/rules.js');

const MAX_PLAYERS = 4;
const MAX_ROOMS = 200;
const GRACE_MS = 15_000; // 연결이 끊겨도 15초 안에 돌아오면 그대로 이어 한다
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 O·0·I·1은 뺌
const CODE_LENGTH = 4;
const CELLS = Rules.WIDTH * (Rules.DEPTH + 1);
const ORE_MAX = Rules.ORES.length - 1;
const TILES_PER_MESSAGE = 2_000; // 5×5로 넓게 파도 한 번에 25칸이라 넉넉하다
const COLORS = ['#ff9f43', '#ff7aa8', '#5ad1ff', '#8be36b']; // 자리마다 친구 화면에 보일 차 색(0번 = 방장). 내 화면의 내 차는 늘 노란색이라 노랑은 뺌

function cleanName(value) {
  return [...String(value ?? '').replace(/[<>\p{Cc}]/gu, '').trim()].slice(0, 20).join('') || '이름없음';
}

// 브라우저가 보낸 땅(칸 종류·광석)이 진짜 광질 타이쿤 땅 크기·값인지 확인한다.
function readGrid(value, max) {
  if (!value || typeof value !== 'object') return null;
  const bytes = Buffer.isBuffer(value) ? value : ArrayBuffer.isView(value) ? Buffer.from(value.buffer, value.byteOffset, value.byteLength) : value instanceof ArrayBuffer ? Buffer.from(value) : null;
  if (!bytes || bytes.length !== CELLS) return null;
  for (let i = 0; i < bytes.length; i++) if (bytes[i] > max) return null;
  return Buffer.from(bytes); // 복사해서 갖는다
}

function setupMiningMulti({ io, graceMs = GRACE_MS }) {
  const rooms = new Map(); // 코드 → { code, tiles, ores, players: Map(번호 → 사람) }
  const bySocket = new Map(); // socket.id → { room, player }

  function newCode() {
    for (let tries = 0; tries < 100; tries++) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
      if (!rooms.has(code)) return code;
    }
    return null;
  }

  const channel = (room) => 'mt:' + room.code;
  const publicPlayer = (p) => ({ id: p.id, name: p.name, color: p.color, host: p.host, online: p.online, pos: p.pos });
  const roster = (room) => [...room.players.values()].map(publicPlayer);
  const emitRoster = (room) => io.to(channel(room)).emit('mt:roster', roster(room));

  function freeSlot(room) {
    for (let id = 0; id < MAX_PLAYERS; id++) if (!room.players.has(id)) return id;
    return -1;
  }

  function attach(socket, room, player) {
    player.socketId = socket.id;
    player.online = true;
    clearTimeout(player.timer);
    bySocket.set(socket.id, { room, player });
    socket.join(channel(room));
  }

  function closeRoom(room, reason) {
    rooms.delete(room.code);
    room.players.forEach((p) => { clearTimeout(p.timer); bySocket.delete(p.socketId); });
    io.to(channel(room)).emit('mt:closed', { reason });
    io.in(channel(room)).socketsLeave(channel(room));
  }

  // 한 사람을 방에서 뺀다. 방장이 나가면 방이 닫히고 친구들은 각자 집(자기 땅)으로 돌아간다.
  function removePlayer(room, player, reason) {
    if (!rooms.has(room.code)) return;
    if (player.host) { closeRoom(room, reason === 'left' ? 'host-left' : 'host-gone'); return; }
    room.players.delete(player.id);
    clearTimeout(player.timer);
    bySocket.delete(player.socketId);
    io.sockets.sockets.get(player.socketId)?.leave(channel(room));
    io.to(channel(room)).emit('mt:left', { id: player.id, name: player.name, reason });
    emitRoster(room);
  }

  const reply = (ack, data) => { if (typeof ack === 'function') ack(data); };

  io.on('connection', (socket) => {
    // 🏠 방 만들기: 내 땅(칸 종류·광석)을 서버에 올린다.
    socket.on('mt:host', (raw, ack) => {
      if (bySocket.has(socket.id)) return reply(ack, { ok: false, message: '이미 친구와 함께 하고 있어요.' });
      if (rooms.size >= MAX_ROOMS) return reply(ack, { ok: false, message: '지금은 방이 너무 많아요. 잠시 뒤 다시 해 주세요.' });
      const tiles = readGrid(raw?.tiles, Rules.TILE_MAX);
      const ores = readGrid(raw?.ores, ORE_MAX);
      if (!tiles || !ores) return reply(ack, { ok: false, message: '땅 정보가 이상해요.' });
      const code = newCode();
      if (!code) return reply(ack, { ok: false, message: '방 코드를 만들지 못했어요. 다시 해 주세요.' });
      const room = { code, tiles, ores, players: new Map() };
      const player = { id: 0, key: crypto.randomBytes(16).toString('hex'), name: cleanName(raw?.name), color: COLORS[0], host: true, pos: null };
      room.players.set(0, player);
      rooms.set(code, room);
      attach(socket, room, player);
      reply(ack, { ok: true, code, you: 0, key: player.key, color: player.color, players: roster(room) });
    });

    // 🚪 친구 땅에 놀러 가기: 코드로 들어가서 지금 땅을 통째로 받는다.
    socket.on('mt:join', (raw, ack) => {
      if (bySocket.has(socket.id)) return reply(ack, { ok: false, message: '이미 친구와 함께 하고 있어요.' });
      const code = String(raw?.code ?? '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) return reply(ack, { ok: false, message: '그런 방 코드가 없어요. 코드를 다시 확인해 주세요.' });
      const id = freeSlot(room);
      if (id < 0) return reply(ack, { ok: false, message: `방이 꽉 찼어요(최대 ${MAX_PLAYERS}명).` });
      const player = { id, key: crypto.randomBytes(16).toString('hex'), name: cleanName(raw?.name), color: COLORS[id], host: false, pos: null };
      room.players.set(id, player);
      attach(socket, room, player);
      socket.to(channel(room)).emit('mt:joined', { id, name: player.name });
      emitRoster(room);
      reply(ack, { ok: true, code, you: id, key: player.key, color: player.color, players: roster(room), tiles: room.tiles, ores: room.ores });
    });

    // 🔌 다시 연결: 끊긴 지 15초 안이면 같은 자리로 돌아온다. 그동안 바뀐 땅을 맞추도록 지금 땅을 준다.
    socket.on('mt:rejoin', (raw, ack) => {
      const room = rooms.get(String(raw?.code ?? ''));
      const player = room && [...room.players.values()].find((p) => p.key === String(raw?.key ?? ''));
      if (!player) return reply(ack, { ok: false });
      if (player.socketId !== socket.id) {
        bySocket.delete(player.socketId);
        io.sockets.sockets.get(player.socketId)?.leave(channel(room));
      }
      attach(socket, room, player);
      emitRoster(room);
      reply(ack, { ok: true, you: player.id, players: roster(room), tiles: room.tiles, ores: room.ores });
    });

    // 🚗 내 차 위치(0.1초마다). 숫자만 골라 같은 방 다른 사람에게 전한다.
    socket.on('mt:move', (raw) => {
      const found = bySocket.get(socket.id);
      if (!found || !raw || typeof raw !== 'object') return;
      const x = Number(raw.x), y = Number(raw.y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > Rules.WIDTH || y < -10 || y > Rules.DEPTH + 1) return;
      const pos = {
        x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100,
        f: raw.f === -1 ? -1 : 1,
        d: raw.d === 1 || raw.d === 2 ? raw.d : 0, // 0 안 팜 · 1 아래로 파기 · 2 옆으로 파기
        t: raw.t ? 1 : 0, // 날고 있는지(불꽃)
        l: Math.max(0, Math.min(Rules.UPGRADES.drill.prices.length, Math.floor(Number(raw.l) || 0))), // 드릴 단계(모양)
        h: Math.max(0, Math.min(Rules.UPGRADES.heat.prices.length, Math.floor(Number(raw.h) || 0))) // 열보호(파란 줄)
      };
      found.player.pos = pos;
      socket.to(channel(found.room)).emit('mt:move', { id: found.player.id, ...pos });
    });

    // ⛏️ 바뀐 땅 칸들 [[칸 번호, 칸 종류, 광석], ...]: 서버 땅에 적고 같은 방 다른 사람에게 전한다.
    socket.on('mt:tiles', (raw) => {
      const found = bySocket.get(socket.id);
      if (!found || !Array.isArray(raw) || !raw.length || raw.length > TILES_PER_MESSAGE) return;
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
      if (good.length) socket.to(channel(room)).emit('mt:tiles', good);
    });

    // 👋 그만하기: 친구는 집으로, 방장이면 방이 닫힌다.
    socket.on('mt:leave', (_raw, ack) => {
      const found = bySocket.get(socket.id);
      if (found) removePlayer(found.room, found.player, 'left');
      reply(ack, { ok: true });
    });

    socket.on('disconnect', () => {
      const found = bySocket.get(socket.id);
      if (!found) return;
      const { room, player } = found;
      player.online = false;
      emitRoster(room);
      clearTimeout(player.timer);
      player.timer = setTimeout(() => {
        if (!player.online) removePlayer(room, player, 'gone');
      }, graceMs);
      player.timer.unref?.(); // 이 타이머 때문에 서버(시험)가 꺼지지 못하는 일이 없게
    });
  });

  return { rooms };
}

module.exports = { setupMiningMulti, MAX_PLAYERS, CELLS };
