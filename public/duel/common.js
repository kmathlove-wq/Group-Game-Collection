// 오목·바둑·체스 화면 공통 도우미. 게임 종류는 주소(/omok, /baduk/match …)의 첫 칸으로 안다.
window.Duel = (() => {
  const kind = location.pathname.split('/')[1];
  const rules = window.DuelRules[kind];
  const $ = (selector) => document.querySelector(selector);

  // 세 게임이 같은 사람 표시(userId)·닉네임을 함께 쓴다.
  function userId() {
    let id = localStorage.getItem('duel:userId');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('duel:userId', id); }
    return id;
  }
  const nickname = () => localStorage.getItem('duel:nickname') || '';
  const saveNickname = (value) => localStorage.setItem('duel:nickname', value);

  function emit(socket, event, data) {
    return new Promise((resolve, reject) => socket.emit(`${kind}:${event}`, data, (result) => (result?.ok ? resolve(result) : reject(new Error(result?.message || '요청에 실패했어요.')))));
  }

  function notice(element, message, type = '', keepMs = 2800) {
    element.textContent = message; element.classList.remove('error', 'success');
    if (type) element.classList.add(type);
    element.classList.toggle('hidden', !message);
    clearTimeout(element.hideTimer);
    if (message && keepMs) element.hideTimer = setTimeout(() => element.classList.add('hidden'), keepMs);
  }

  // ── 효과음: AudioContext는 하나만 만들어 재사용한다 ──
  let audio;
  function beep(freqs, length = 0.1, type = 'triangle') {
    try {
      audio ||= new AudioContext();
      freqs.forEach((freq, i) => {
        const osc = audio.createOscillator(); const gain = audio.createGain();
        const at = audio.currentTime + i * length;
        osc.type = type; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.12, at); gain.gain.exponentialRampToValueAtTime(0.001, at + length);
        osc.connect(gain).connect(audio.destination); osc.start(at); osc.stop(at + length);
      });
    } catch { /* 소리가 안 나도 게임은 계속 */ }
  }
  const sounds = {
    stone: () => beep([900], 0.05, 'square'),
    myTurn: () => beep([660, 880], 0.08),
    capture: () => beep([520, 390], 0.08),
    win: () => beep([523, 659, 784, 1046], 0.13),
    lose: () => beep([392, 330, 262], 0.16),
    alert: () => beep([880, 660, 880], 0.1)
  };

  return { kind, rules, $, userId, nickname, saveNickname, emit, notice, sounds };
})();
