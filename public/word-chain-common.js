// 끝말잇기 혼자/여럿 화면이 함께 쓰는 작은 도우미. 사용자·사전 문자열은 항상 textContent로 넣는다.
window.WordChainUI = (() => {
  // 눈에 보이는 글자 단위로 자른다(옛한글 'ᄂᆞ'는 조각 2개지만 한 글자).
  const segmenter = window.Intl?.Segmenter ? new Intl.Segmenter('ko', { granularity: 'grapheme' }) : null;
  const letters = (text) => (segmenter ? Array.from(segmenter.segment(text), (part) => part.segment) : [...text]);
  const OLD_HANGUL = /[ᄀ-ᇿꥠ-꥿ힰ-퟿]/; // 옛한글 조각

  // 단어 말풍선 하나: 끝 글자를 강조해 다음 사람이 무엇으로 시작할지 바로 보이게 한다.
  function wordItem({ word, definition, who, color, side, oneShot }) {
    const li = document.createElement('li');
    li.className = `wc-word ${side || ''}${oneShot ? ' one-shot' : ''}`;
    if (color) li.style.setProperty('--player', color);
    const name = document.createElement('small'); name.textContent = who;
    const big = document.createElement('b');
    if (OLD_HANGUL.test(word)) big.classList.add('wc-old-hangul'); // 옛한글을 그릴 수 있는 글꼴로
    const parts = letters(word);
    const last = document.createElement('em'); last.textContent = parts.at(-1) || '';
    big.append(parts.slice(0, -1).join(''), last);
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

  // 옛한글 단추: 키보드로 못 치는 옛 낱자를 입력창에 넣는다. 서버가 'ㄴ'+'ㆍ'를 'ᄂᆞ'로 조립한다(old-hangul.js).
  const OLD_KEYS = ['ㆍ', 'ㆎ', 'ㅸ', 'ㅿ', 'ㆁ', 'ㆆ', 'ㅹ', 'ㆄ', 'ㅱ', 'ㅺ', 'ㅼ', 'ㅽ', 'ㅾ', 'ㅲ', 'ㅳ', 'ㅶ', 'ㅷ', 'ㅴ', 'ㅵ'];
  function oldHangulKeys(input, form) {
    const box = document.createElement('details'); box.className = 'wc-old-keys';
    const summary = document.createElement('summary'); summary.textContent = '옛한글 글자 넣기';
    const help = document.createElement('p'); help.className = 'wc-old-hangul';
    help.textContent = '낱자를 차례로 넣으면 한 글자로 합쳐져요. 예) 놉 → ㄴ → [ㆍ] → 가 → [ㅸ] → ㅣ = 놉ᄂᆞ가ᄫᅵ';
    const row = document.createElement('div');
    for (const key of OLD_KEYS) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = key; button.setAttribute('aria-label', `옛한글 ${key} 넣기`);
      // 단추를 누르면 입력창의 한글 조합이 먼저 끝나고(포커스가 빠짐), 그 자리에 낱자를 넣은 뒤 다시 입력창으로 돌아간다.
      button.addEventListener('click', () => {
        if (input.disabled) return;
        const start = input.selectionStart ?? input.value.length; const end = input.selectionEnd ?? start;
        input.setRangeText(key, start, end, 'end');
        input.focus();
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      row.append(button);
    }
    box.append(summary, help, row);
    form.after(box);
  }
  const wordInput = document.getElementById('word'); const wordForm = document.getElementById('wordForm');
  if (wordInput && wordForm) oldHangulKeys(wordInput, wordForm);

  return { wordItem, beep, startsText };
})();
