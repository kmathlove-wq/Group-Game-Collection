// ===== sound.js =====
// 효과음을 WebAudio로 직접 만든다(소리 파일 없음). 🔊/🔇 설정은 localStorage 'dino:muted'에 기억한다.
(function (D) {
  'use strict';
  var KEY = 'dino:muted';
  var ctx = null;
  var muted = false;
  try { muted = localStorage.getItem(KEY) === '1'; } catch (e) { muted = false; }

  function ensure() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { ctx = null; }
    return ctx;
  }
  function unlock() {
    var c = ensure();
    if (c && c.state === 'suspended') c.resume();
  }
  function tone(freq, endFreq, dur, type, vol, delay) {
    if (muted) return;
    var c = ensure();
    if (!c) return;
    var t0 = c.currentTime + (delay || 0);
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    gain.gain.setValueAtTime(vol || 0.08, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain); gain.connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  D.Sound = {
    unlock: unlock,
    jump: function () { tone(420, 760, 0.12, 'square', 0.06); },
    milestone: function () { tone(880, null, 0.08, 'square', 0.06); tone(1320, null, 0.12, 'square', 0.06, 0.09); },
    crash: function () { tone(220, 50, 0.35, 'sawtooth', 0.09); tone(120, 40, 0.3, 'square', 0.06, 0.05); },
    isMuted: function () { return muted; },
    setMuted: function (v) {
      muted = !!v;
      try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) { /* 저장 불가는 무시 */ }
    }
  };
})(window.Dino);
