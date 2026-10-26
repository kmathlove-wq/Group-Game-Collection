// ===== multi.js =====
// 👫 친구와 함께: 방장 땅에 친구가 놀러 와서 같은 땅을 판다. 돈·차·업그레이드는 각자 것이다.
// 내 차는 늘 내 브라우저가 움직이고, 0.1초마다 ① 내 차 위치 ② 바뀐 땅 칸을 서버(`mt:*`)에 보낸다.
// 바뀐 땅은 "마지막으로 맞춘 땅(그림자)"과 지금 땅을 견줘 찾는다 — 그래서 파기·자동 드릴·보물 등 어떤 변화도 빠지지 않는다.
// 놀러 간 동안 내 원래 땅과 자동 드릴은 home에 맡겨 두고, 저장할 때는 savable()로 원래 땅을 끼워 저장한다.
(function (MT) {
  var Rules = MT.Rules, Game = MT.Game;
  var SEND_EVERY = 0.1; // 0.1초마다 보낸다
  var MOVE_KEEPALIVE = 1; // 차가 가만히 있어도 1초마다 한 번은 위치를 보낸다
  var CHUNK = 2000; // 한 번에 보내는 칸 수(서버 한도와 같음)

  // hooks: { getState, renderer, toast, onEvents(events), onChange(), onEnd(reason) }
  function Multi(hooks) {
    this.hooks = hooks;
    this.socket = null;
    this.role = null; // null · 'host'(내 땅에 부름) · 'guest'(친구 땅에 놀러 감)
    this.code = null;
    this.key = null;
    this.you = -1;
    this.players = [];
    this.friends = {}; // 번호 → { name, color, x, y(그리는 자리), tx, ty(받은 자리), f, d, t, l, h }
    this.shadowTiles = null;
    this.shadowOres = null;
    this.home = null; // 놀러 간 동안 맡겨 둔 { world, autos }
    this.sendTimer = 0;
    this.lastMove = '';
    this.moveTimer = 0;
    this.offline = false;
  }

  Multi.prototype.active = function () { return !!this.role; };
  Multi.prototype.count = function () { return this.players.length; };

  // 저장용 상태: 놀러 가 있으면 원래 땅·자동 드릴을 끼우고 차는 내 땅 지상에 둔다(친구 땅이 내 저장을 덮지 않게).
  Multi.prototype.savable = function (s) {
    if (this.role !== 'guest' || !this.home) return s;
    return Object.assign({}, s, { world: this.home.world, autos: this.home.autos, car: { x: Rules.SPAWN_X, y: Game.SURFACE_Y, face: s.car.face }, inCore: false });
  };

  Multi.prototype.connect = function () {
    if (this.socket) return this.socket;
    var self = this;
    var socket = this.socket = io();
    socket.on('mt:move', function (m) {
      var f = self.friends[m.id];
      if (!f) return;
      if (f.tx == null) { f.x = m.x; f.y = m.y; }
      f.tx = m.x; f.ty = m.y; f.f = m.f; f.d = m.d; f.t = m.t; f.l = m.l; f.h = m.h;
    });
    socket.on('mt:tiles', function (list) { self.applyTiles(list); });
    socket.on('mt:roster', function (players) { self.setPlayers(players); });
    socket.on('mt:joined', function (p) { self.hooks.toast('👋 ' + p.name + '님이 놀러 왔어요!'); });
    socket.on('mt:left', function (p) { self.hooks.toast(p.reason === 'gone' ? '📶 ' + p.name + '님의 연결이 끊겼어요.' : '👋 ' + p.name + '님이 집으로 돌아갔어요.'); });
    socket.on('mt:closed', function (d) { self.finish(d.reason); });
    socket.on('disconnect', function () {
      if (!self.role) return;
      self.offline = true;
      self.hooks.toast('📶 연결이 끊겼어요. 다시 연결하는 중…', 4000);
    });
    socket.on('connect', function () {
      if (!self.role || !self.offline) return;
      socket.emit('mt:rejoin', { code: self.code, key: self.key }, function (r) {
        if (!self.role) return;
        if (!r || !r.ok) { self.finish('lost'); return; }
        self.offline = false;
        self.setPlayers(r.players);
        self.merge(new Uint8Array(r.tiles), new Uint8Array(r.ores));
        self.hooks.toast('📶 다시 연결됐어요!');
      });
    });
    return socket;
  };

  function emit(socket, event, data) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; resolve({ ok: false, message: '서버가 대답하지 않아요. 인터넷 연결을 확인해 주세요.' }); } }, 10000);
      socket.emit(event, data, function (r) { if (done) return; done = true; clearTimeout(timer); resolve(r || { ok: false, message: '잘못된 대답이에요.' }); });
    });
  }

  // 🏠 내 땅에 친구 부르기
  Multi.prototype.host = function (s) {
    var self = this;
    if (this.role) return Promise.resolve({ ok: false, message: '이미 친구와 함께 하고 있어요.' });
    return emit(this.connect(), 'mt:host', { name: s.name, tiles: s.world.tiles, ores: s.world.ores }).then(function (r) {
      if (!r.ok) return r;
      self.start('host', r);
      s.multi = true;
      return r;
    });
  };

  // 🚪 친구 땅에 놀러 가기
  Multi.prototype.join = function (s, code) {
    var self = this;
    if (this.role) return Promise.resolve({ ok: false, message: '이미 친구와 함께 하고 있어요.' });
    return emit(this.connect(), 'mt:join', { name: s.name, code: code }).then(function (r) {
      if (!r.ok) return r;
      var tiles = new Uint8Array(r.tiles), ores = new Uint8Array(r.ores);
      self.home = { world: s.world, autos: s.autos };
      s.world = { w: Rules.WIDTH, h: Rules.DEPTH + 1, seed: 0, tiles: tiles, ores: ores, seen: new Uint8Array(tiles.length) };
      s.autos = []; // 내 자동 드릴은 내 땅에서 기다린다(집에 오면 다시 일함)
      s.guest = true;
      s.multi = true;
      s.left = null;
      Game.teleportHome(s);
      self.start('guest', r);
      return r;
    });
  };

  Multi.prototype.start = function (role, r) {
    var s = this.hooks.getState();
    this.role = role;
    this.code = r.code;
    this.key = r.key;
    this.you = r.you;
    this.offline = false;
    this.friends = {};
    this.shadowTiles = new Uint8Array(s.world.tiles);
    this.shadowOres = new Uint8Array(s.world.ores);
    this.lastMove = '';
    this.setPlayers(r.players);
  };

  // 👋 그만하기. quiet이면 알림 없이(게임이 끝났을 때 등).
  Multi.prototype.leave = function (quiet) {
    if (!this.role) return;
    if (this.socket && this.socket.connected) this.socket.emit('mt:leave', {}, function () {});
    this.finish(quiet ? 'quiet' : this.role === 'host' ? 'closed-by-me' : 'left-by-me');
  };

  // 끝: 놀러 갔으면 내 땅으로 돌아온다.
  Multi.prototype.finish = function (reason) {
    if (!this.role) return;
    var s = this.hooks.getState();
    if (s) {
      if (this.role === 'guest' && this.home) {
        s.world = this.home.world;
        s.autos = this.home.autos;
        s.guest = false;
        s.left = null;
        Game.teleportHome(s);
      }
      s.multi = false;
    }
    this.role = null;
    this.code = this.key = null;
    this.home = null;
    this.players = [];
    this.friends = {};
    this.shadowTiles = this.shadowOres = null;
    this.hooks.renderer.friends = [];
    this.hooks.onEnd(reason);
  };

  Multi.prototype.setPlayers = function (players) {
    var self = this;
    this.players = players || [];
    var keep = {};
    this.players.forEach(function (p) {
      if (p.id === self.you) return;
      keep[p.id] = true;
      var f = self.friends[p.id];
      if (!f) {
        f = self.friends[p.id] = { x: Rules.SPAWN_X, y: Game.SURFACE_Y, tx: null, ty: null, f: 1, d: 0, t: 0, l: 0, h: 0 };
        if (p.pos) { f.x = f.tx = p.pos.x; f.y = f.ty = p.pos.y; f.f = p.pos.f; f.l = p.pos.l; f.h = p.pos.h; }
      }
      f.name = p.name; f.color = p.color; f.online = p.online;
    });
    Object.keys(this.friends).forEach(function (id) { if (!keep[id]) delete self.friends[id]; });
    this.hooks.onChange();
  };

  // 친구가 바꾼 칸들을 내 땅과 그림자에 함께 적는다(그림자에도 적어야 다시 되돌려 보내지 않는다).
  Multi.prototype.applyTiles = function (list) {
    var s = this.hooks.getState();
    if (!s || !this.role || !this.shadowTiles) return;
    var events = [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      Game.applyTile(s, c[0], c[1], c[2], events);
      this.shadowTiles[c[0]] = c[1];
      this.shadowOres[c[0]] = c[2];
    }
    if (events.length) this.hooks.onEvents(events);
  };

  // 다시 연결됐을 때 서버 땅과 맞춘다. 내가 안 바꾼 칸은 서버 것을 받고, 내가 바꾼 칸은 다음에 다시 보낸다.
  Multi.prototype.merge = function (tiles, ores) {
    var s = this.hooks.getState();
    if (!s || !this.shadowTiles) return;
    var w = s.world, events = [];
    for (var i = 0; i < tiles.length; i++) {
      var mine = w.tiles[i] !== this.shadowTiles[i] || w.ores[i] !== this.shadowOres[i];
      if (!mine && (tiles[i] !== this.shadowTiles[i] || ores[i] !== this.shadowOres[i])) Game.applyTile(s, i, tiles[i], ores[i], events);
      this.shadowTiles[i] = tiles[i];
      this.shadowOres[i] = ores[i];
    }
    Game.fixStuck(s);
    if (events.length) this.hooks.onEvents(events);
  };

  // 매 화면마다 부른다: 친구 차를 부드럽게 움직이고, 0.1초마다 내 것을 보낸다.
  Multi.prototype.tick = function (dt) {
    if (!this.role) return;
    var list = [];
    var k = Math.min(1, dt * 12);
    for (var id in this.friends) {
      var f = this.friends[id];
      if (f.tx != null) {
        // 멀리 떨어져 있으면(워프·귀환) 미끄러지지 않고 바로 옮긴다
        if (Math.abs(f.tx - f.x) > 4 || Math.abs(f.ty - f.y) > 4) { f.x = f.tx; f.y = f.ty; }
        f.x += (f.tx - f.x) * k; f.y += (f.ty - f.y) * k;
      }
      if (f.online !== false) list.push(f);
    }
    this.hooks.renderer.friends = list;

    this.sendTimer += dt;
    this.moveTimer += dt;
    if (this.sendTimer < SEND_EVERY || !this.socket || !this.socket.connected || this.offline) return;
    this.sendTimer = 0;
    var s = this.hooks.getState();
    if (!s) return;
    this.sendTiles(s);
    this.sendMove(s);
  };

  Multi.prototype.sendTiles = function (s) {
    var w = s.world, st = this.shadowTiles, so = this.shadowOres;
    if (!st || w.tiles.length !== st.length) return;
    var changes = [];
    for (var i = 0; i < w.tiles.length; i++) {
      if (w.tiles[i] !== st[i] || w.ores[i] !== so[i]) {
        changes.push([i, w.tiles[i], w.ores[i]]);
        st[i] = w.tiles[i];
        so[i] = w.ores[i];
      }
    }
    for (var j = 0; j < changes.length; j += CHUNK) this.socket.emit('mt:tiles', changes.slice(j, j + CHUNK));
  };

  Multi.prototype.sendMove = function (s) {
    var d = s.dig;
    var m = {
      x: Math.round(s.car.x * 100) / 100, y: Math.round(s.car.y * 100) / 100,
      f: d && d.dx ? d.dx : s.car.face, d: d ? (d.dy ? 1 : 2) : 0, t: s.thrusting ? 1 : 0,
      l: s.levels.drill, h: s.levels.heat
    };
    var sig = [m.x, m.y, m.f, m.d, m.t, m.l, m.h].join(',');
    if (sig === this.lastMove && this.moveTimer < MOVE_KEEPALIVE) return;
    this.lastMove = sig;
    this.moveTimer = 0;
    this.socket.emit('mt:move', m);
  };

  MT.Multi = Multi;
})(window.MT = window.MT || {});
