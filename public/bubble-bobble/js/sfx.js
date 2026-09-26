// ===== sfx.js =====
// 효과음을 코드로 만든다 (WebAudio). 원작 음원을 쓰지 않는다.
// 배경음악은 사용자가 만든 assets/음악/배경음악.mp3.
(function (BB) {
  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null;
  var master = null;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
  }

  // 한 음: type(파형) / f0→f1(주파수) / dur(길이) / vol
  function tone(type, f0, f1, dur, vol, delay) {
    if (!ctx) return;
    var t = ctx.currentTime + (delay || 0);
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, delay) {
    if (!ctx) return;
    var t = ctx.currentTime + (delay || 0);
    var n = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = ctx.createBufferSource();
    var g = ctx.createGain();
    g.gain.value = vol;
    src.buffer = buf;
    src.connect(g); g.connect(master);
    src.start(t);
  }

  var SOUNDS = {
    blow:       function () { tone('sine', 300, 720, 0.14, 0.18); },
    pop:        function () { tone('triangle', 640, 160, 0.12, 0.2); noise(0.08, 0.12); },
    jump:       function () { tone('square', 260, 520, 0.12, 0.14); },
    land:       function () { tone('sine', 180, 90, 0.07, 0.12); },
    trap:       function () { tone('square', 420, 900, 0.1, 0.16); },
    enemyPop:   function () { tone('square', 500, 120, 0.16, 0.2); noise(0.1, 0.14); },
    combo:      function () { tone('square', 520, 780, 0.09, 0.18); tone('square', 780, 1180, 0.1, 0.18, 0.09); },
    fruit:      function () { tone('sine', 880, 1320, 0.09, 0.16); },
    item:       function () { tone('triangle', 660, 990, 0.08, 0.18); tone('triangle', 990, 1480, 0.1, 0.18, 0.08); tone('triangle', 1480, 1970, 0.12, 0.16, 0.16); },
    extend:     function () { tone('square', 700, 1050, 0.09, 0.18); tone('square', 1050, 1400, 0.12, 0.18, 0.09); },
    miss:       function () { tone('sawtooth', 400, 80, 0.5, 0.22); },
    roundClear: function () { tone('square', 523, 523, 0.12, 0.18); tone('square', 659, 659, 0.12, 0.18, 0.12); tone('square', 784, 784, 0.12, 0.18, 0.24); tone('square', 1046, 1046, 0.24, 0.2, 0.36); },
    whale:      function () { tone('sawtooth', 140, 60, 0.6, 0.22); noise(0.3, 0.1); },
    bossHit:    function () { tone('square', 200, 80, 0.18, 0.24); noise(0.12, 0.16); }
  };

  BB.sfx = {
    muted: false,
    play: function (name) {
      if (this.muted) return;
      ensure();
      var fn = SOUNDS[name];
      if (fn) try { fn(); } catch (e) {}
    },
    music: {
      el: null,
      start: function () {
        if (BB.sfx.muted) return;
        if (!this.el) {
          this.el = BB.assets.music || new Audio('assets/음악/배경음악.mp3');
          this.el.loop = true;
          this.el.volume = 0.4;
        }
        var pr = this.el.play();
        if (pr && pr.catch) pr.catch(function () {});
      },
      stop: function () { if (this.el) this.el.pause(); }
    },
    toggleMute: function () {
      this.muted = !this.muted;
      if (this.muted) this.music.stop();
      else this.music.start();
      try { localStorage.setItem('bb_muted', this.muted ? '1' : '0'); } catch (e) {}
    }
  };

  try { BB.sfx.muted = localStorage.getItem('bb_muted') === '1'; } catch (e) {}

  // 첫 사용자 입력에 오디오 깨우기 + 음악 시작
  function wake() {
    ensure();
    BB.sfx.music.start();
    window.removeEventListener('keydown', wake);
    window.removeEventListener('mousedown', wake);
  }
  window.addEventListener('keydown', wake);
  window.addEventListener('mousedown', wake);
})(window.BB);
