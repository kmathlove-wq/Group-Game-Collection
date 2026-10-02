// 끝말잇기 혼자/여럿 화면이 함께 쓰는 작은 도우미. 사용자·사전 문자열은 항상 textContent로 넣는다.
window.WordChainUI = (() => {
  // 단어 말풍선 하나: 끝 글자를 강조해 다음 사람이 무엇으로 시작할지 바로 보이게 한다.
  function wordItem({ word, definition, who, color, side, oneShot }) {
    const li = document.createElement('li');
    li.className = `wc-word ${side || ''}${oneShot ? ' one-shot' : ''}`;
    if (color) li.style.setProperty('--player', color);
    const name = document.createElement('small'); name.textContent = who;
    const big = document.createElement('b');
    const last = document.createElement('em'); last.textContent = word.slice(-1);
    big.append(word.slice(0, -1), last);
    const meaning = document.createElement('p'); meaning.textContent = definition || '';
    li.append(name, big, meaning);
    return li;
  }

  let audio;
  function beep(freqs, length = 0.1) {
    try {
      audio ||= new AudioContext();
      freqs.forEach((freq, i) => {
        const osc = audio.createOscillator(); const gain = audio.createGain();
        const at = audio.currentTime + i * length;
        osc.frequency.value = freq; osc.type = 'triangle';
        gain.gain.setValueAtTime(0.12, at); gain.gain.exponentialRampToValueAtTime(0.001, at + length);
        osc.connect(gain).connect(audio.destination); osc.start(at); osc.stop(at + length);
      });
    } catch { /* 소리가 안 나도 게임은 계속 */ }
  }

  const startsText = (starts) => starts.map((s) => `'${s}'`).join(' / ');
  return { wordItem, beep, startsText };
})();
