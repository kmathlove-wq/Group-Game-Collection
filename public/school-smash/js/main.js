// ===== main.js =====
// 학교 부수기 화면: 학교 고르기·무기 37개(묶음 6개)·파편과 떨어지는 블록·화면 흔들림·소리·모드.
// 무기마다 kind(world.js TOOL_LIST)에 맞는 "움직임(action)"을 만들어 매 프레임 update·draw한다.
// 모드: challenge(60초, 무기 개수 제한, 순위) / free(마음껏, 순위 없음).
// localStorage: 'school-smash:best'(도전 최고 점수), 'school-smash:sound'('off'면 끔), 'school-smash:school'(고른 학교). 글은 textContent로만 넣는다.
(function (SM) {
  'use strict';
  var Wd = SM.World;
  var $ = function (id) { return document.getElementById(id); };
  var BEST_KEY = 'school-smash:best', SOUND_KEY = 'school-smash:sound', SCHOOL_KEY = 'school-smash:school';
  var W = Wd.W, H = Wd.H, CELL = Wd.CELL;
  var HOLD_MAX = 2; // 개수가 정해진 끌기 무기는 한 번 누를 때 최대 2초

  var canvas = $('game');
  var ctx = canvas.getContext('2d');
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * dpr; canvas.height = H * dpr;
  var ranking = window.GroupRanking.create({ slug: 'school-smash', unit: '점', top: 50 });

  // 받침이 있으면 a(을·이), 없으면 b(를·가)
  function josa(word, a, b) {
    var code = word.charCodeAt(word.length - 1) - 0xac00;
    return word + (code >= 0 && code <= 11171 && code % 28 ? a : b);
  }

  function get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function set(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* 무시 */ } }

  var state = {
    mode: null, phase: 'ready', school: Wd.school(get(SCHOOL_KEY)).id, world: null, tool: 'hammer', group: 'tool', counts: {},
    timeLeft: Wd.CHALLENGE_SECONDS, particles: [], blocks: [], actions: [], drops: [], shake: 0, flash: 0, lastUse: {},
    pointer: null, holdLeft: 0, submitted: false, clock: null
  };
  state.world = Wd.create(state.school);

  // ----- 소리(파일 없이 합성) -----
  var muted = get(SOUND_KEY) === 'off';
  var audio = null, noiseBuf = null;
  function ac() {
    if (!audio) {
      audio = new (window.AudioContext || window.webkitAudioContext)();
      noiseBuf = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return audio;
  }
  function noise(dur, freq, vol) {
    if (muted) return;
    try {
      var a = ac(), t = a.currentTime;
      var src = a.createBufferSource(); src.buffer = noiseBuf;
      var f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
      var g = a.createGain();
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(a.destination);
      src.start(t); src.stop(t + dur);
    } catch (e) { /* 소리가 안 돼도 게임은 계속 */ }
  }
  function tone(freq, dur, type, to) {
    if (muted) return;
    try {
      var a = ac(), t = a.currentTime, o = a.createOscillator(), g = a.createGain();
      o.type = type || 'triangle'; o.frequency.setValueAtTime(freq, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur);
    } catch (e) { /* 무시 */ }
  }
  var lastSmashSound = 0;
  function smashSound(result, big) {
    var now = performance.now();
    if (!big && now - lastSmashSound < 70) return;
    lastSmashSound = now;
    if (big) noise(0.9, 500, 0.6);
    else if (result.destroyed.length || result.damaged.length) noise(0.12, 1800, 0.22);
    if (result.destroyed.some(function (d) { return d.type === 'glass'; })) tone(2200 + Math.random() * 800, 0.15);
  }
  function refreshSound() { $('soundBtn').textContent = muted ? '🔇' : '🔊'; $('soundBtn').setAttribute('aria-label', muted ? '소리 켜기' : '소리 끄기'); }
  refreshSound();

  // ----- 부서진 결과를 파편·떨어지는 블록으로 -----
  // how: 'burst'(밖으로 튐) · 'suck'(블랙홀로 빨려 듦, tx·ty) · 'lift'(위로 떠오름) · 'spin'(빙글빙글 위로)
  function spawn(result, x, y, force, how, tx, ty) {
    result.destroyed.forEach(function (d) {
      var p = Wd.cellCenter(d.c, d.r);
      var n = d.type === 'glass' ? 4 : 2;
      for (var i = 0; i < n; i++) {
        var part = { x: p.x, y: p.y, size: 2 + Math.random() * 4, color: d.color, life: 1.2 + Math.random() * 0.8 };
        if (how === 'suck') { part.tx = tx; part.ty = ty; part.vx = 0; part.vy = 0; part.life = 1.2; }
        else if (how === 'lift') { part.vx = (Math.random() - 0.5) * 40; part.vy = -150 - Math.random() * 120; part.float = true; }
        else if (how === 'spin') { part.vx = (Math.random() - 0.5) * 300; part.vy = -250 - Math.random() * 200; part.float = true; }
        else {
          var a = Math.atan2(p.y - y, p.x - x) + (Math.random() - 0.5) * 1.6;
          var sp = (80 + Math.random() * 220) * force;
          part.vx = Math.cos(a) * sp; part.vy = Math.sin(a) * sp - 120 * force;
        }
        state.particles.push(part);
      }
    });
    result.fallen.forEach(function (d) {
      var p = Wd.cellCenter(d.c, d.r);
      state.blocks.push({ x: p.x, y: p.y, vx: (p.x - W / 2) * 0.15 + (Math.random() - 0.5) * 40, vy: -Math.random() * 40, rot: 0, spin: (Math.random() - 0.5) * 6, color: d.color });
    });
    if (result.fallen.length > 8) noise(1.2, 300, 0.5);
    refreshHud();
    if (state.world.destroyed >= state.world.total) finish(true);
  }
  function smoke(x, y, n, big) {
    for (var i = 0; i < n; i++) state.particles.push({ x: x + (Math.random() - 0.5) * (big || 20), y: y, vx: (Math.random() - 0.5) * 120, vy: -40 - Math.random() * 80, size: 14 + Math.random() * 18, color: 'smoke', life: 1.2 + Math.random(), float: true });
  }
  function sparks(x, y, n, colors) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = 100 + Math.random() * 260;
      state.particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size: 2 + Math.random() * 3, color: colors[i % colors.length], life: 0.5 + Math.random() * 0.6 });
    }
  }
  // 펑! 큰 폭발 한 번
  function boom(x, y, radius, power, force, shake, extra) {
    var r = Wd.hit(state.world, x, y, radius, power);
    smashSound(r, true);
    state.shake = Math.max(state.shake, shake);
    addFx({ life: 0.5, draw: function (v) {
      ctx.fillStyle = 'rgba(255,200,60,' + (1 - v) + ')';
      ctx.beginPath(); ctx.arc(x, y, radius * CELL * 1.4 * (0.4 + v), 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,220,' + (1 - v) + ')';
      ctx.beginPath(); ctx.arc(x, y, radius * CELL * 0.7 * (0.4 + v), 0, 7); ctx.fill();
    } });
    smoke(x, y, Math.min(30, 8 + radius * 2), radius * CELL);
    if (extra && extra.splat) sparks(x, y, 40, extra.splat);
    spawn(r, x, y, force);
  }

  // ----- 움직임(action) -----
  // { t, life, step(dt, a), draw(v, a), end(a) } — 매 프레임 step, 다 되면 end
  function addFx(a) { a.t = 0; state.actions.push(a); return a; }
  function every(a, gap, dt, fn) { a.acc = (a.acc || 0) + dt; while (a.acc >= gap) { a.acc -= gap; fn(); } }
  function emoji(ch, x, y, size, rot) {
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot);
    ctx.globalAlpha = 1; ctx.fillStyle = '#000';
    ctx.font = size + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ch, 0, 0);
    ctx.restore();
  }
  function buildingTopY() { var b = Wd.bounds(state.world); return b.top >= Wd.ROWS ? Wd.GROUND - 40 : Wd.TOP + b.top * CELL; }

  // 비처럼 떨어지는 것: 처음 닿은 칸에서 작게 펑
  function dropRain(T, x) {
    var n = T.n, spread = T.spread * CELL;
    var a = addFx({ life: T.life, made: 0, step: function (dt, me) {
      var want = Math.floor(me.t / T.life * n);
      while (me.made < want) {
        me.made++;
        state.drops.push({ x: x + (Math.random() - 0.5) * spread * 2, y: -20 - Math.random() * 40, vy: 500 + Math.random() * 250, T: T });
      }
    } });
    return a;
  }

  var KIND = {
    tap: function (T, x, y) {
      var r = Wd.hit(state.world, x, y, T.radius, T.power);
      smashSound(r, false);
      state.shake = Math.max(state.shake, 0.15);
      addFx({ life: 0.25, draw: function (v) { emoji(T.icon, x, y - 10 * (1 - v), 34 + v * 10); } });
      spawn(r, x, y, 0.8);
    },
    delay: function (T, x, y) {
      addFx({ life: T.life, draw: function (v) { emoji(T.icon, x + Math.sin(v * 60) * 2, y, 28 + v * 10 + (T.radius > 10 ? 30 : 0)); },
        end: function () { boom(x, y, T.radius, T.power, 1 + T.radius / 8, Math.min(1.5, 0.3 + T.radius / 10), T); if (T.radius > 10) state.flash = 1; } });
      if (T.id === 'dynamite') tone(900, T.life, 'square', 300);
    },
    fall: function (T, x, y) {
      var size = T.id === 'planet' ? 260 : T.id === 'piano' ? 60 : 44;
      addFx({ life: T.life, draw: function (v) {
        var sx = x + 300 * (1 - v), sy = y - 600 * (1 - v);
        if (T.id === 'meteor' || T.id === 'planet') {
          ctx.strokeStyle = 'rgba(255,140,0,0.6)'; ctx.lineWidth = size / 3; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(sx + 60, sy - 100); ctx.lineTo(sx, sy); ctx.stroke();
        }
        emoji(T.id === 'meteor' ? '☄️' : T.icon, sx, sy, size, T.id === 'piano' ? v * 3 : 0);
      }, end: function () {
        boom(x, y, T.radius, T.power, 1 + T.radius / 6, Math.min(2, 0.4 + T.radius / 10));
        if (T.id === 'piano') { tone(220, 0.8, 'sawtooth'); tone(330, 0.8, 'sawtooth'); tone(277, 0.8, 'sawtooth'); }
        if (T.id === 'planet') state.flash = 1;
      } });
    },
    shot: function (T, x, y) {
      var sx = -40, sy = y - 60;
      addFx({ life: T.life, draw: function (v) {
        var px = sx + (x - sx) * v, py = sy + (y - sy) * v;
        smoke(px - 10, py, 1, 4);
        emoji('🚀', px, py, 34, Math.atan2(y - sy, x - sx) + Math.PI / 4);
      }, end: function () { boom(x, y, T.radius, T.power, 1.3, 0.6); } });
      noise(T.life, 2500, 0.15);
    },
    rain: function (T, x) { dropRain(T, x); noise(T.life, 900, 0.2); },
    firework: function (T, x, y) {
      for (var i = 0; i < T.n; i++) (function (i) {
        var bx = x + (Math.random() - 0.5) * 140, by = y + (Math.random() - 0.5) * 120, at = i * 0.12;
        addFx({ life: at + 0.01, end: function () {
          var r = Wd.hit(state.world, bx, by, T.radius, T.power);
          sparks(bx, by, 26, ['#ff006e', '#ffbe0b', '#3a86ff', '#8338ec', '#fb5607']);
          tone(600 + Math.random() * 900, 0.2, 'sine', 200);
          spawn(r, bx, by, 0.8);
        } });
      })(i);
    },
    bolt: function (T, x, y) {
      var r1 = Wd.hitLine(state.world, x, 0, x, y, 0.6, 4);
      spawn(r1, x, y, 0.6);
      boom(x, y, T.radius, T.power, 1, 0.5);
      state.flash = 0.7;
      var pts = [[x, 0]];
      for (var i = 1; i < 8; i++) pts.push([x + (Math.random() - 0.5) * 40, y * i / 8]);
      pts.push([x, y]);
      addFx({ life: 0.3, draw: function (v) {
        ctx.strokeStyle = 'rgba(255,255,140,' + (1 - v) + ')'; ctx.lineWidth = 6; ctx.lineJoin = 'round';
        ctx.beginPath(); pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,' + (1 - v) + ')'; ctx.lineWidth = 2; ctx.stroke();
      } });
      noise(0.6, 4000, 0.5);
    },
    row: function (T, x, y) {
      var r = Wd.hitLine(state.world, -20, y, W + 20, y, T.radius, T.power);
      smashSound(r, true);
      state.shake = Math.max(state.shake, 0.4);
      addFx({ life: 0.5, draw: function (v) {
        ctx.fillStyle = 'rgba(255,240,120,' + (1 - v) + ')'; ctx.fillRect(0, y - T.radius * CELL * (1 - v * 0.5), W, T.radius * CELL * 2 * (1 - v * 0.5));
        ctx.fillStyle = 'rgba(255,255,255,' + (1 - v) + ')'; ctx.fillRect(0, y - 3, W, 6);
        emoji('🔆', 24, y, 40);
      } });
      tone(1200, 0.5, 'sawtooth', 100);
      spawn(r, x, y, 1.2);
    },
    freeze: function (T, x, y) {
      var n = Wd.freeze(state.world, x, y, T.radius);
      tone(1800, 0.4, 'sine', 2600); tone(2400, 0.5, 'sine', 3200);
      sparks(x, y, 40, ['#ffffff', '#cdefff', '#90e0ef']);
      addFx({ life: 0.6, draw: function (v) {
        ctx.strokeStyle = 'rgba(200,240,255,' + (1 - v) + ')'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(x, y, T.radius * CELL * v, 0, 7); ctx.stroke();
        emoji('❄️', x, y, 40);
      } });
      return n;
    },
    quake: function (T) {
      addFx({ life: T.life, step: function () {
        state.shake = Math.max(state.shake, 0.35);
        var r = Wd.quake(state.world, T.n, T.power);
        if (r.destroyed.length) spawn(r, W / 2, Wd.GROUND, 0.5);
      } });
      noise(T.life, 120, 0.7);
    },
    swarm: function (T) {
      var ants = [];
      addFx({ life: T.life, step: function (dt, me) {
        every(me, 0.12, dt, function () {
          var r = Wd.nibble(state.world, T.n, T.power);
          r.destroyed.forEach(function (d) { if (ants.length < 40) ants.push({ p: Wd.cellCenter(d.c, d.r), t: me.t }); });
          if (r.destroyed.length) { spawn(r, W / 2, Wd.GROUND, 0.2); noise(0.05, 3000, 0.08); }
        });
        ants = ants.filter(function (a) { return me.t - a.t < 0.8; });
      }, draw: function () { ants.forEach(function (a) { emoji('🐜', a.p.x, a.p.y, 14); }); } });
    },
    blackhole: function (T, x, y) {
      addFx({ life: T.life, step: function (dt, me) {
        state.shake = Math.max(state.shake, 0.2);
        every(me, 0.1, dt, function () {
          var rr = 1 + T.radius * Math.min(1, me.t / (T.life * 0.7));
          var r = Wd.hit(state.world, x, y, rr, T.power);
          spawn(r, x, y, 0, 'suck', x, y);
        });
      }, draw: function (v) {
        var R = 18 + T.radius * CELL * 0.5 * Math.sin(Math.PI * Math.min(1, v * 1.2));
        var g = ctx.createRadialGradient(x, y, 2, x, y, R * 2);
        g.addColorStop(0, '#000'); g.addColorStop(0.45, 'rgba(60,0,90,0.9)'); g.addColorStop(1, 'rgba(120,40,200,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R * 2, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(200,150,255,0.6)'; ctx.lineWidth = 3;
        for (var i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x, y, R * (0.8 + i * 0.35), v * 20 + i * 2, v * 20 + i * 2 + 2.4); ctx.stroke(); }
      } });
      noise(T.life, 80, 0.6);
    },
    column: function (T, x) {
      addFx({ life: T.life, step: function (dt, me) {
        every(me, 0.1, dt, function () {
          var r = Wd.hitLine(state.world, x, 0, x, Wd.GROUND, T.radius, T.power);
          if (r.destroyed.length || r.fallen.length) spawn(r, x, 0, 0, 'lift');
        });
      }, draw: function (v) {
        var uy = 40 + Math.sin(v * 12) * 4;
        ctx.fillStyle = 'rgba(140,255,170,0.28)';
        ctx.beginPath(); ctx.moveTo(x - 20, uy + 10); ctx.lineTo(x + 20, uy + 10); ctx.lineTo(x + T.radius * CELL * 1.4, Wd.GROUND); ctx.lineTo(x - T.radius * CELL * 1.4, Wd.GROUND); ctx.fill();
        emoji('🛸', x, uy, 60);
      } });
      tone(300, T.life, 'sine', 900);
    },
    pendulum: function (T, x, y) {
      var px = x, py = 0, len = Math.max(80, y);
      addFx({ life: T.life, step: function (dt, me) {
        var ang = Math.sin(me.t * 2.4) * 1.1;
        me.bx = px + Math.sin(ang) * len; me.by = py + Math.cos(ang) * len;
        every(me, 0.05, dt, function () {
          var r = Wd.hit(state.world, me.bx, me.by, T.radius, T.power);
          if (r.destroyed.length) { smashSound(r, false); state.shake = Math.max(state.shake, 0.25); }
          spawn(r, me.bx, me.by, 1);
        });
      }, draw: function (v, me) {
        if (me.bx == null) return;
        ctx.strokeStyle = '#333'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(me.bx, me.by); ctx.stroke();
        ctx.fillStyle = '#2b2b2b'; ctx.beginPath(); ctx.arc(me.bx, me.by, T.radius * CELL * 0.9, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(me.bx - 12, me.by - 12, 10, 0, 7); ctx.fill();
      } });
    },
    stomp: function (T, x) {
      var half = T.radius * CELL;
      addFx({ life: T.life, prev: -60, step: function (dt, me) {
        var v = Math.min(1, me.t / T.life), foot = -60 + (Wd.GROUND + 60) * v * v;
        if (foot > me.prev) {
          var r = Wd.hitRect(state.world, x - half, me.prev, half * 2, foot - me.prev, T.power);
          spawn(r, x, foot, 0.9);
          if (r.destroyed.length) smashSound(r, false);
        }
        me.prev = foot; me.foot = foot;
      }, draw: function (v, me) {
        if (me.foot == null) return;
        ctx.fillStyle = '#4f9d3a';
        ctx.fillRect(x - half * 0.7, me.foot - 400, half * 1.4, 400);
        ctx.beginPath(); ctx.ellipse(x, me.foot - 20, half * 1.05, 26, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#f1f1e6';
        for (var i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x + i * half * 0.6 - 8, me.foot - 8); ctx.lineTo(x + i * half * 0.6, me.foot + 6); ctx.lineTo(x + i * half * 0.6 + 8, me.foot - 8); ctx.fill(); }
      }, end: function () { state.shake = Math.max(state.shake, 1); noise(1, 200, 0.7); smoke(x, Wd.GROUND - 10, 20, half * 2); } });
    },
    sweep: function (T, x, y) {
      var band = T.band, top = buildingTopY();
      var a = { life: T.life, fromRight: false };
      if (band === 'punch') { a.fromRight = x < W / 2 ? false : true; }
      a.step = function (dt, me) {
        var v = me.t / T.life;
        var startX = a.fromRight ? W + 80 : -80, endX = a.fromRight ? -80 : W + 80;
        var hx = band === 'tall' ? x + Math.sin(me.t * 1.6) * 200 : startX + (endX - startX) * v;
        me.hx = hx;
        every(me, band === 'punch' ? 0.03 : 0.08, dt, function () {
          var r;
          if (band === 'tall') r = Wd.hitRect(state.world, hx - T.radius * CELL, top - 20, T.radius * CELL * 2, Wd.GROUND - top + 20, T.power);
          else if (band === 'wave') r = Wd.hitRect(state.world, hx - 3 * CELL, y, 3 * CELL, Wd.GROUND - y, T.power);
          else if (band === 'punch') r = Wd.hitRect(state.world, hx - 3 * CELL, y - T.radius * CELL, 6 * CELL, T.radius * CELL * 2, T.power);
          else if (band === 'ground') r = Wd.hitRect(state.world, hx, Wd.GROUND - 7 * CELL, 4 * CELL, 7 * CELL, T.power);
          else if (band === 'ball') r = Wd.hitRect(state.world, hx - 2 * CELL, Wd.GROUND - 5 * CELL, 4 * CELL, 5 * CELL, T.power);
          else if (band === 'fire') r = Wd.hitLine(state.world, hx, Math.max(40, top - 60), hx + 30, Math.max(40, top - 60) + 160, 1.6, T.power);
          if (r.destroyed.length) smashSound(r, false);
          spawn(r, hx, y, 0.8, band === 'tall' ? 'spin' : null);
        });
      };
      a.draw = function (v, me) {
        if (me.hx == null) return;
        var hx = me.hx;
        if (band === 'tall') {
          for (var i = 0; i < 8; i++) { ctx.strokeStyle = 'rgba(120,120,130,' + (0.5 - i * 0.04) + ')'; ctx.lineWidth = 10; ctx.beginPath(); ctx.ellipse(hx + Math.sin(me.t * 8 + i) * 8, Wd.GROUND - 30 - i * 55, 20 + i * 12, 10 + i * 3, 0, 0, 7); ctx.stroke(); }
        } else if (band === 'wave') {
          ctx.fillStyle = 'rgba(30,136,229,0.65)'; ctx.fillRect(-20, y, hx + 20, Wd.GROUND - y);
          ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(hx, y, 30, 14, 0, 0, 7); ctx.fill();
          emoji('🌊', hx, y - 10, 50);
        } else if (band === 'punch') {
          ctx.fillStyle = '#90a4ae'; ctx.fillRect(a.fromRight ? hx : -40, y - 22, a.fromRight ? W : hx + 40, 44);
          emoji('🤜', hx, y, 90, a.fromRight ? Math.PI : 0);
        } else if (band === 'ground') {
          emoji('🚜', hx + 30, Wd.GROUND - 30, 70);
        } else if (band === 'ball') {
          ctx.fillStyle = '#283593'; ctx.beginPath(); ctx.arc(hx, Wd.GROUND - 2.5 * CELL, 2.5 * CELL, 0, 7); ctx.fill();
          ctx.fillStyle = '#111'; [[-6, -8], [4, -10], [0, 0]].forEach(function (h) { ctx.beginPath(); ctx.arc(hx + h[0], Wd.GROUND - 2.5 * CELL + h[1], 3, 0, 7); ctx.fill(); });
        } else if (band === 'fire') {
          var fy = Math.max(40, top - 60);
          emoji('🐉', hx - 10, fy - 10, 70);
          ctx.fillStyle = 'rgba(255,120,0,0.55)';
          ctx.beginPath(); ctx.moveTo(hx + 10, fy + 10); ctx.lineTo(hx + 60, fy + 170); ctx.lineTo(hx + 0, fy + 170); ctx.fill();
        }
      };
      addFx(a);
      noise(T.life, band === 'wave' ? 700 : 300, 0.4);
    }
  };
  // 끌기 무기: 누르고 있는 동안 cooldown마다
  function dragHit(T, x, y) {
    if (T.id === 'laser' || T.kind === 'beam') {
      var ex = W - 30, ey = 30;
      var r = Wd.hitLine(state.world, ex, ey, x, y, T.radius, T.power);
      spawn(r, x, y, 0.5);
      state.beam = { ex: ex, ey: ey, x: x, y: y, at: performance.now() };
      if (Math.random() < 0.3) tone(1500 + Math.random() * 400, 0.05, 'square');
      return;
    }
    var res = Wd.hit(state.world, x, y, T.radius, T.power);
    smashSound(res, false);
    if (T.id === 'flame') for (var i = 0; i < 6; i++) state.particles.push({ x: x + (Math.random() - 0.5) * 30, y: y + (Math.random() - 0.5) * 30, vx: (Math.random() - 0.5) * 60, vy: -80 - Math.random() * 80, size: 6 + Math.random() * 10, color: ['#ff6d00', '#ffab00', '#ffd600'][i % 3], life: 0.5, float: true });
    if (T.id === 'saw' || T.id === 'drill') sparks(x, y, 3, ['#ffd60a', '#fff']);
    if (T.id === 'sun') state.sunAt = { x: x, y: y, at: performance.now() };
    if (T.id === 'hammer' || T.id === 'axe') addFx({ life: 0.18, draw: function (v) { emoji(T.icon, x + 10, y - 14, 30, -0.8 + v * 0.8); } });
    spawn(res, x, y, 0.6);
  }

  // ----- 무기 쓰기 -----
  function available(id) { return state.mode !== 'challenge' || state.counts[id] > 0; }
  function cooled(T) {
    var now = performance.now() / 1000;
    if (now - (state.lastUse[T.id] || 0) < T.cooldown) return false;
    state.lastUse[T.id] = now;
    return true;
  }
  function spend(T) {
    if (state.mode === 'challenge' && isFinite(state.counts[T.id])) state.counts[T.id]--;
    if (state.counts[T.id] <= 0 && state.pointer == null) { state.tool = 'hammer'; } // 다 쓰면 망치로
    refreshTools();
  }
  function press(x, y) {
    if (state.phase !== 'playing') return;
    var T = Wd.TOOLS[state.tool];
    if (!available(T.id)) return;
    if (T.kind === 'drag' || T.kind === 'beam') {
      if (!cooled(T)) return;
      if (isFinite(T.count) && state.mode === 'challenge') { spend(T); state.holdLeft = HOLD_MAX; } else state.holdLeft = Infinity;
      dragHit(T, x, y);
      return;
    }
    if (!cooled(T)) return;
    spend(T);
    KIND[T.kind](T, x, y);
  }

  function pointerPos(e) {
    var rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width * W, y: (e.clientY - rect.top) / rect.height * H };
  }
  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    var p = pointerPos(e);
    state.pointer = p;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    press(p.x, p.y);
  });
  canvas.addEventListener('pointermove', function (e) { if (state.pointer) state.pointer = pointerPos(e); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { canvas.addEventListener(ev, function () {
    state.pointer = null; state.beam = null;
    if (state.mode === 'challenge' && state.counts[state.tool] <= 0) { state.tool = 'hammer'; refreshTools(); }
  }); });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // ----- 화면 표시 -----
  function refreshHud() {
    var sc = Wd.school(state.school);
    $('percent').textContent = sc.emoji + ' ' + Wd.percent(state.world).toFixed(1) + '% 부숨';
    $('score').textContent = state.world.score.toLocaleString('ko-KR') + '점';
    $('time').hidden = state.mode !== 'challenge';
    $('time').textContent = '⏱ ' + Math.ceil(state.timeLeft);
    $('time').classList.toggle('low', state.timeLeft <= 10);
    $('meter').style.width = Wd.percent(state.world) + '%';
  }

  // 묶음 탭과 무기 단추는 처음에 한 번 만들고, 고를 때마다 표시만 바꾼다.
  var tabs = $('groupTabs'), grid = $('toolGrid'), toolBtns = {};
  Wd.GROUPS.forEach(function (g) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'group-tab'; b.dataset.group = g.id; b.textContent = g.name;
    b.setAttribute('role', 'tab');
    b.addEventListener('click', function () { state.group = g.id; refreshTools(); });
    tabs.appendChild(b);
  });
  Wd.TOOL_LIST.forEach(function (T) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'tool'; b.dataset.tool = T.id;
    var ico = document.createElement('span'); ico.className = 'ico'; ico.textContent = T.icon;
    var nm = document.createElement('b'); nm.textContent = T.name;
    var ct = document.createElement('span'); ct.className = 'count';
    b.appendChild(ico); b.appendChild(nm); b.appendChild(ct);
    b.addEventListener('click', function () { pickTool(T.id); });
    grid.appendChild(b);
    toolBtns[T.id] = b;
  });
  function refreshTools() {
    tabs.querySelectorAll('.group-tab').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.group === state.group)); });
    var n = 0;
    Wd.TOOL_LIST.forEach(function (T) {
      var b = toolBtns[T.id], c = state.counts[T.id];
      var shown = T.group === state.group;
      b.hidden = !shown;
      if (shown) { n++; b.querySelector('.ico').dataset.key = n <= 9 ? String(n) : ''; }
      b.setAttribute('aria-pressed', String(T.id === state.tool));
      b.querySelector('.count').textContent = state.mode === 'challenge' && isFinite(c) ? '×' + c : '∞';
      b.disabled = state.mode === 'challenge' && c <= 0;
    });
    var T = Wd.TOOLS[state.tool];
    $('toolNow').textContent = '지금 무기: ' + T.icon + ' ' + T.name;
  }
  function pickTool(id) {
    if (!available(id)) return;
    state.tool = id;
    state.group = Wd.TOOLS[id].group;
    refreshTools();
  }
  document.addEventListener('keydown', function (e) {
    if (ranking.isOpen()) return;
    var n = Number(e.key);
    if (n >= 1 && n <= 9) {
      var list = Wd.TOOL_LIST.filter(function (T) { return T.group === state.group; });
      if (list[n - 1]) pickTool(list[n - 1].id);
    }
  });

  // 학교 고르기 단추(첫 화면)
  var schoolGrid = $('schoolGrid');
  Wd.SCHOOLS.forEach(function (sc) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'school-btn'; b.dataset.school = sc.id;
    var e = document.createElement('span'); e.textContent = sc.emoji;
    var t = document.createElement('b'); t.textContent = sc.name;
    b.appendChild(e); b.appendChild(t);
    b.addEventListener('click', function () { chooseSchool(sc.id); });
    schoolGrid.appendChild(b);
  });
  function chooseSchool(id) {
    state.school = Wd.school(id).id;
    set(SCHOOL_KEY, state.school);
    schoolGrid.querySelectorAll('.school-btn').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.school === state.school)); });
    if (state.phase !== 'playing') { state.world = Wd.create(state.school); findClock(); refreshHud(); }
  }

  function overlay(emojiStr, title, textStr, showRank) {
    $('ovEmoji').textContent = emojiStr;
    $('ovTitle').textContent = title;
    $('ovText').textContent = textStr;
    $('ovRank').hidden = !showRank;
    var best = Number(get(BEST_KEY)) || 0;
    $('ovBest').textContent = best ? '🏅 도전 모드 최고 점수 ' + best.toLocaleString('ko-KR') + '점' : '';
    $('overlay').hidden = false;
  }

  // ----- 진행 -----
  function start(mode) {
    state.mode = mode;
    state.phase = 'playing';
    state.world = Wd.create(state.school);
    findClock();
    state.timeLeft = Wd.CHALLENGE_SECONDS;
    state.particles = []; state.blocks = []; state.actions = []; state.drops = [];
    state.shake = 0; state.flash = 0; state.submitted = false; state.beam = null;
    state.counts = {};
    Wd.TOOL_LIST.forEach(function (T) { state.counts[T.id] = mode === 'challenge' ? T.count : Infinity; });
    state.tool = 'hammer'; state.group = 'tool';
    $('overlay').hidden = true;
    $('rebuildBtn').hidden = mode !== 'free';
    $('schoolBtn').hidden = mode !== 'free';
    $('endBtn').hidden = mode !== 'challenge';
    refreshTools();
    refreshHud();
  }

  function finish(all) {
    if (state.phase !== 'playing') return;
    var sc = Wd.school(state.school);
    if (state.mode === 'free') {
      if (all) { state.phase = 'over'; setTimeout(function () { overlay('🎉', josa(sc.name, '을', '를') + ' 전부 부쉈어요!', '모든 블록을 부쉈어요. 다른 학교도 부숴 볼까요?', false); }, 1200); }
      return;
    }
    state.phase = 'over';
    state.pointer = null; state.beam = null;
    var bonus = all ? Wd.clearBonus(state.timeLeft) : 0;
    state.world.score = Math.min(Wd.SCORE_MAX, state.world.score + bonus);
    var best = Number(get(BEST_KEY)) || 0;
    var record = state.world.score > best;
    if (record) set(BEST_KEY, String(state.world.score));
    refreshHud();
    setTimeout(function () {
      overlay(all ? '🏆' : '⏰', all ? '100% 완파!' : '시간 끝!',
        josa(sc.name, '을', '를') + ' ' + Wd.percent(state.world).toFixed(1) + '% 부숴서 ' + state.world.score.toLocaleString('ko-KR') + '점!' +
        (bonus ? '\n남은 시간 보너스 +' + bonus + '점' : '') + (record ? '\n🏅 최고 점수 새 기록!' : ''), state.world.score > 0);
    }, all ? 1200 : 300);
  }

  $('modeChallenge').addEventListener('click', function () { start('challenge'); });
  $('modeFree').addEventListener('click', function () { start('free'); });
  $('rebuildBtn').addEventListener('click', function () { start('free'); });
  $('schoolBtn').addEventListener('click', function () { state.phase = 'over'; overlay('🏫', '학교 고르기', '부술 학교를 고르고 시작해요!', false); });
  $('endBtn').addEventListener('click', function () { if (state.phase === 'playing') finish(false); });
  $('ovRank').addEventListener('click', function () {
    if (state.submitted) return ranking.show(0);
    state.submitted = true;
    $('ovRank').hidden = true;
    ranking.show(state.world.score);
  });
  $('rankBtn').addEventListener('click', function () { ranking.show(0); });
  $('soundBtn').addEventListener('click', function () { muted = !muted; set(SOUND_KEY, muted ? 'off' : 'on'); refreshSound(); });

  // ----- 그리기 -----
  function findClock() {
    var cs = [];
    state.world.cells.forEach(function (cell, i) { if (cell && cell.type === 'clock') cs.push(i); });
    if (!cs.length) { state.clock = null; return; }
    var sx = 0, sy = 0;
    cs.forEach(function (i) { var p = Wd.cellCenter(i % Wd.COLS, Math.floor(i / Wd.COLS)); sx += p.x; sy += p.y; });
    state.clock = { x: sx / cs.length, y: sy / cs.length };
    var sign = [];
    state.world.cells.forEach(function (cell, i) { if (cell && cell.type === 'sign') sign.push(i); });
    var sgy = 0, sgx = 0;
    sign.forEach(function (i) { var p = Wd.cellCenter(i % Wd.COLS, Math.floor(i / Wd.COLS)); sgx += p.x; sgy += p.y; });
    state.signAt = sign.length ? { x: sgx / sign.length, y: sgy / sign.length } : null;
  }
  function drawSchool() {
    var w = state.world;
    for (var r = 0; r < Wd.ROWS; r++) {
      for (var c = 0; c < Wd.COLS; c++) {
        var cell = w.cells[r * Wd.COLS + c];
        if (!cell) continue;
        var x = Wd.LEFT + c * CELL, y = Wd.TOP + r * CELL;
        ctx.fillStyle = cell.color;
        ctx.fillRect(x, y, CELL, CELL);
        if (cell.type === 'brick' || cell.type === 'line' || cell.type === 'base' || cell.type === 'tower') {
          ctx.fillStyle = 'rgba(0,0,0,0.08)';
          ctx.fillRect(x, y + CELL - 2, CELL, 2);
          if (r % 2) ctx.fillRect(x + CELL / 2, y, 1, CELL); else ctx.fillRect(x, y, 1, CELL);
        } else if (cell.type === 'glass') {
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          if ((c + r) % 3 === 0) ctx.fillRect(x + 2, y + 2, 3, 3);
        } else if (cell.type === 'metal') {
          ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x, y, CELL, 2);
        } else if (cell.type === 'column') {
          ctx.fillStyle = 'rgba(0,0,0,0.07)'; ctx.fillRect(x + 4, y, 2, CELL);
        }
        if (cell.frozen) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x + 1, y + 1, 4, 2); }
        var max = cell.max || Wd.TYPES[cell.type].hp;
        if (cell.hp < max) { // 금
          ctx.strokeStyle = 'rgba(0,0,0,' + (0.25 + 0.45 * (1 - cell.hp / max)) + ')';
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.moveTo(x + 2, y + 3); ctx.lineTo(x + 6, y + 7); ctx.lineTo(x + 4, y + 11);
          if (cell.hp <= max / 2) { ctx.moveTo(x + 6, y + 7); ctx.lineTo(x + 11, y + 5); }
          ctx.stroke();
        }
      }
    }
    // 간판 글자·시계 바늘은 남아 있는 칸 안에만 보이게
    var sc = Wd.school(state.school);
    if (state.signAt) clipTo('sign', function () {
      ctx.fillStyle = '#fff'; ctx.font = '900 18px Pretendard, "Noto Sans KR", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(sc.sign, state.signAt.x, state.signAt.y);
    });
    if (state.clock) clipTo('clock', function () {
      var cx = state.clock.x, cy = state.clock.y;
      ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI * 2); ctx.stroke();
      var now = new Date(), m = now.getMinutes() / 60 * Math.PI * 2, h = (now.getHours() % 12 + now.getMinutes() / 60) / 12 * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(m) * 12, cy - Math.cos(m) * 12); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(h) * 8, cy - Math.cos(h) * 8); ctx.stroke();
    });
  }
  function clipTo(type, draw) {
    var w = state.world, any = false;
    ctx.save(); ctx.beginPath();
    for (var i = 0; i < w.cells.length; i++) {
      var cell = w.cells[i];
      if (cell && cell.type === type) { any = true; ctx.rect(Wd.LEFT + (i % Wd.COLS) * CELL, Wd.TOP + Math.floor(i / Wd.COLS) * CELL, CELL, CELL); }
    }
    if (any) { ctx.clip(); draw(); }
    ctx.restore();
  }

  function drawBackground(now) {
    var sc = Wd.school(state.school);
    var skyC = sc.sky || ['#89c9ff', '#e0f2ff'];
    var sky = ctx.createLinearGradient(0, 0, 0, Wd.GROUND);
    sky.addColorStop(0, skyC[0]); sky.addColorStop(1, skyC[1]);
    ctx.fillStyle = sky; ctx.fillRect(-20, -20, W + 40, Wd.GROUND + 20);
    if (sc.stars) { ctx.fillStyle = '#fff'; for (var s = 0; s < 70; s++) ctx.fillRect((s * 137) % W, (s * 71) % (Wd.GROUND - 40), 2, 2); }
    else if (sc.bubbles) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
      for (var b = 0; b < 25; b++) { var by = (Wd.GROUND - ((now / 30 + b * 47) % Wd.GROUND)); ctx.beginPath(); ctx.arc((b * 97) % W, by, 3 + b % 5, 0, 7); ctx.stroke(); }
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      [[60, 70, 1], [820, 50, 1.3], [400, 40, 0.7]].forEach(function (c) {
        ctx.beginPath(); ctx.arc(c[0], c[1], 22 * c[2], 0, 7); ctx.arc(c[0] + 24 * c[2], c[1] - 10 * c[2], 20 * c[2], 0, 7); ctx.arc(c[0] + 48 * c[2], c[1], 22 * c[2], 0, 7); ctx.fill();
      });
    }
    ctx.fillStyle = sc.ground || '#6cbf4a'; ctx.fillRect(-20, Wd.GROUND, W + 40, H - Wd.GROUND + 20);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(Wd.LEFT - 40, Wd.GROUND, Wd.COLS * CELL + 80, 8);
    // 운동장 나무 두 그루(배경, 안 부서짐) — 우주·바닷속은 없음
    if (!sc.stars && !sc.bubbles) [[50, '#2f8f46'], [W - 50, '#3a9d52']].forEach(function (t) {
      ctx.fillStyle = '#7b5230'; ctx.fillRect(t[0] - 6, Wd.GROUND - 80, 12, 80);
      ctx.fillStyle = t[1]; ctx.beginPath(); ctx.arc(t[0], Wd.GROUND - 100, 34, 0, 7); ctx.fill();
    });
  }

  function drawParticles() {
    state.blocks.forEach(function (b) {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
      ctx.fillStyle = b.color; ctx.fillRect(-CELL / 2, -CELL / 2, CELL, CELL);
      ctx.restore();
    });
    state.particles.forEach(function (p) {
      if (p.color === 'smoke') {
        ctx.fillStyle = 'rgba(90,90,100,' + Math.min(0.45, p.life * 0.3) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    });
    state.drops.forEach(function (d) { emoji(d.T.drop, d.x, d.y, d.T.id === 'acid' ? 14 : d.T.id === 'hail' ? 16 : 26, d.T.id === 'barrage' ? Math.PI * 0.75 : 0); });
  }
  function drawBeams(now) {
    if (state.beam && now - state.beam.at < 150) {
      var bm = state.beam;
      ctx.strokeStyle = 'rgba(255,40,40,0.85)'; ctx.lineWidth = 8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(bm.ex, bm.ey); ctx.lineTo(bm.x, bm.y); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      emoji('🔴', bm.ex, bm.ey, 30);
    }
    if (state.sunAt && now - state.sunAt.at < 150) {
      var s = state.sunAt;
      ctx.fillStyle = 'rgba(255,240,150,0.35)'; ctx.beginPath(); ctx.arc(s.x, s.y, 5 * CELL, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(s.x, s.y, 10, 0, 7); ctx.fill();
      emoji('🔍', s.x + 40, s.y - 50, 60);
    }
  }

  // ----- 시간 흐름 -----
  var last = performance.now();
  function loop(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state.phase === 'playing') {
      if (state.mode === 'challenge') {
        state.timeLeft -= dt;
        if (state.timeLeft <= 0) { state.timeLeft = 0; finish(false); }
      }
      // 끌기 무기는 누르고 있으면 계속
      var T = Wd.TOOLS[state.tool];
      if (state.pointer && (T.kind === 'drag' || T.kind === 'beam') && state.holdLeft > 0) {
        state.holdLeft -= dt;
        if (cooled(T)) dragHit(T, state.pointer.x, state.pointer.y);
      }
      refreshHud();
    }
    // 움직임
    var acts = state.actions;
    state.actions = [];
    acts.forEach(function (a) {
      a.t += dt;
      if (a.step && a.t <= a.life) a.step(dt, a);
      if (a.t >= a.life) { if (a.end) a.end(a); } else state.actions.push(a);
    });
    // 떨어지는 비: 처음 닿은 칸에서 펑
    state.drops.forEach(function (d) {
      d.y += d.vy * dt;
      var p = Wd.toCell(d.x, d.y);
      if (Wd.get(state.world, Math.floor(p.c), Math.floor(p.r)) || d.y >= Wd.GROUND) {
        d.dead = true;
        var r = Wd.hit(state.world, d.x, d.y, d.T.radius, d.T.power);
        if (d.T.id === 'barrage' || d.T.id === 'shower') { smoke(d.x, d.y, 3, 10); smashSound(r, false); state.shake = Math.max(state.shake, 0.2); }
        spawn(r, d.x, d.y, 0.6);
      }
    });
    state.drops = state.drops.filter(function (d) { return !d.dead; });
    state.particles.forEach(function (p) {
      if (p.tx != null) { // 블랙홀로
        p.x += (p.tx - p.x) * Math.min(1, dt * 4); p.y += (p.ty - p.y) * Math.min(1, dt * 4); p.life -= dt; p.size *= 0.98; return;
      }
      p.vy += (p.color === 'smoke' ? -30 : p.float ? -20 : 900) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      if (!p.float && p.color !== 'smoke' && p.y > Wd.GROUND - p.size / 2) { p.y = Wd.GROUND - p.size / 2; p.vy *= -0.3; p.vx *= 0.6; }
    });
    state.particles = state.particles.filter(function (p) { return p.life > 0; });
    if (state.particles.length > 1800) state.particles.splice(0, state.particles.length - 1800);
    state.blocks.forEach(function (b) {
      b.vy += 900 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.spin * dt;
      if (b.y >= Wd.GROUND - CELL / 2) {
        b.dead = true;
        for (var i = 0; i < 3; i++) state.particles.push({ x: b.x, y: Wd.GROUND - 3, vx: (Math.random() - 0.5) * 160, vy: -60 - Math.random() * 120, size: 2 + Math.random() * 4, color: b.color, life: 0.8 + Math.random() * 0.6 });
      }
    });
    state.blocks = state.blocks.filter(function (b) { return !b.dead; });
    if (state.blocks.length > 2500) state.blocks.splice(0, state.blocks.length - 2500);
    state.shake = Math.max(0, state.shake - dt);
    state.flash = Math.max(0, state.flash - dt * 2);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (state.shake > 0) ctx.translate((Math.random() - 0.5) * 16 * state.shake, (Math.random() - 0.5) * 16 * state.shake);
    drawBackground(now);
    drawSchool();
    drawParticles();
    state.actions.forEach(function (a) { if (a.draw) { ctx.save(); a.draw(Math.min(1, a.t / a.life), a); ctx.restore(); } });
    drawBeams(now);
    if (state.flash > 0) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = 'rgba(255,255,255,' + state.flash * 0.7 + ')'; ctx.fillRect(0, 0, W, H); }
    requestAnimationFrame(loop);
  }

  chooseSchool(state.school);
  refreshTools();
  refreshHud();
  overlay('🏫', '학교 부수기', '학교 12종 · 무기 ' + Wd.TOOL_LIST.length + '개!\n학교를 고르고 와르르 부숴 봐요. 아래를 부수면 위쪽이 무너져 떨어져요.', false);
  requestAnimationFrame(loop);

  // 자동 확인용 통로(콘솔)
  SM.debug = { state: state, press: press, pickTool: pickTool, start: start, chooseSchool: chooseSchool };
})(window.Smash);
