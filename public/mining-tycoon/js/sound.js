// ===== sound.js =====
// 효과음과 배경음악을 소리 파일 없이 웹오디오(WebAudio)로 그 자리에서 만든다.
// 브라우저는 사람이 한 번 누르거나 키를 친 뒤에만 소리를 낼 수 있어서, 첫 입력 때 unlock()을 부른다.
(function (MT) {
  var Save = MT.Save;

  function Sound() {
    this.ctx = null;
    this.master = null;
    this.on = Save.soundOn();
    this.musicTimer = null;
    this.nextNote = 0;
    this.noteIndex = 0;
    this.noiseBuffer = null;
  }

  Sound.prototype.unlock = function () {
    if (!this.ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.on ? 0.6 : 0;
      this.master.connect(this.ctx.destination);
      var len = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      var data = this.noiseBuffer.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.startMusic();
  };

  Sound.prototype.setOn = function (on) {
    this.on = on;
    Save.setSound(on);
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.6 : 0, this.ctx.currentTime, 0.05);
  };

  // 다른 탭으로 가면 소리도 쉰다.
  Sound.prototype.pause = function () { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); };
  Sound.prototype.resume = function () { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); };

  Sound.prototype.tone = function (freq, dur, type, vol, slideTo, delay) {
    if (!this.ctx || !this.on) return;
    var t = this.ctx.currentTime + (delay || 0);
    var osc = this.ctx.createOscillator();
    var gain = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain); gain.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  };

  Sound.prototype.noise = function (dur, vol, freq, filterType, delay) {
    if (!this.ctx || !this.on) return;
    var t = this.ctx.currentTime + (delay || 0);
    var src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    var filter = this.ctx.createBiquadFilter();
    filter.type = filterType || 'lowpass';
    filter.frequency.value = freq || 800;
    var gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  };

  // 땅 파는 소리: 단단할수록 높고 거칠다.
  Sound.prototype.dig = function (hard) { this.noise(0.09, 0.16, 350 + hard * 350, 'lowpass'); this.tone(70 + hard * 25, 0.07, 'square', 0.04); };
  // 광석 줍기: 비싼 광석일수록 높은 음.
  Sound.prototype.pickup = function (ore) {
    var f = 520 * Math.pow(2, (ore - 1) / 5);
    this.tone(f, 0.12, 'sine', 0.18); this.tone(f * 1.5, 0.14, 'sine', 0.1, null, 0.05);
  };
  Sound.prototype.sell = function () {
    var self = this;
    [1320, 1760, 2093, 2637].forEach(function (f, i) { self.tone(f, 0.12, 'square', 0.06, null, i * 0.06); });
  };
  Sound.prototype.buy = function () {
    var self = this;
    [523, 659, 784, 1047].forEach(function (f, i) { self.tone(f, i === 3 ? 0.35 : 0.12, 'triangle', 0.18, null, i * 0.09); });
  };
  Sound.prototype.fill = function () { this.tone(300, 0.3, 'sine', 0.12, 900); };
  Sound.prototype.hurt = function () { this.tone(240, 0.22, 'sawtooth', 0.12, 90); };
  Sound.prototype.burn = function () { this.noise(0.3, 0.18, 2500, 'highpass'); };
  Sound.prototype.blocked = function () { this.tone(110, 0.1, 'square', 0.08, 80); };
  Sound.prototype.lowFuel = function () { this.tone(880, 0.12, 'square', 0.08); this.tone(880, 0.12, 'square', 0.08, null, 0.2); };
  Sound.prototype.rescue = function () {
    for (var i = 0; i < 4; i++) this.tone(i % 2 ? 620 : 880, 0.22, 'triangle', 0.1, null, i * 0.22);
  };
  Sound.prototype.recall = function () { this.tone(300, 0.55, 'sine', 0.16, 1800); this.noise(0.5, 0.05, 3000, 'highpass'); };
  Sound.prototype.dead = function () { this.tone(400, 0.7, 'sawtooth', 0.12, 60); this.noise(0.6, 0.2, 500); };
  Sound.prototype.treasure = function () {
    var self = this;
    [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach(function (f, i) { self.tone(f, i === 7 ? 0.8 : 0.18, 'triangle', 0.2, null, i * 0.13); });
  };

  // 배경음악: 잔잔한 가단조 아르페지오(화음을 한 음씩 차례로 치기) + 낮은 베이스. 계속 돈다.
  var CHORDS = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]];
  var PATTERN = [0, 1, 2, 1, 0, 2, 1, 2];
  Sound.prototype.startMusic = function () {
    if (this.musicTimer || !this.ctx) return;
    var self = this;
    var beat = 60 / 84 / 2; // 8분음표
    this.nextNote = this.ctx.currentTime + 0.1;
    this.musicTimer = setInterval(function () {
      if (!self.ctx || self.ctx.state !== 'running') return;
      while (self.nextNote < self.ctx.currentTime + 0.3) {
        var bar = Math.floor(self.noteIndex / 8) % CHORDS.length;
        var step = self.noteIndex % 8;
        var chord = CHORDS[bar];
        self.musicNote(chord[PATTERN[step]] * 2, beat * 1.6, 0.035, self.nextNote, 'sine');
        if (step === 0) self.musicNote(chord[0] / 2, beat * 7.5, 0.05, self.nextNote, 'triangle');
        self.nextNote += beat;
        self.noteIndex++;
      }
    }, 100);
  };

  Sound.prototype.musicNote = function (freq, dur, vol, t, type) {
    if (!this.on) return;
    var osc = this.ctx.createOscillator();
    var gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain); gain.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.05);
  };

  MT.Sound = Sound;
})(window.MT = window.MT || {});
