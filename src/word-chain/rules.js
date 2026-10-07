// 끝말잇기 글자 규칙. 두음법칙 표는 P07(끝말잇기 한방단어 검색기) app.py와 같은 규칙을 옮겨 왔다.
// "글자"는 눈에 보이는 한 글자다(옛한글 'ᄂᆞ'는 조각 2개지만 한 글자, old-hangul.js).
const { composeTyped, graphemes, isSyllable, isJamo } = require('./old-hangul');
const HANGUL_BASE = 0xac00;
const HANGUL_END = 0xd7a3;
const INITIALS = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const VOWELS = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
const L_TO_IEUNG = new Set(['ㅑ', 'ㅕ', 'ㅖ', 'ㅛ', 'ㅠ', 'ㅣ']);
const L_TO_NIEUN = new Set(['ㅏ', 'ㅐ', 'ㅓ', 'ㅔ', 'ㅗ', 'ㅚ', 'ㅜ', 'ㅡ']);
const N_TO_IEUNG = new Set(['ㅑ', 'ㅕ', 'ㅖ', 'ㅛ', 'ㅠ', 'ㅣ']);
const WORD_MIN = 2;
const WORD_MAX = 20;
// 끝말잇기 낱말 모양: 끝 글자는 완성된 한글(현대·옛한글, 다음 사람이 이어야 하니까), 앞·가운데에는 우리말샘의 낱자도 허용한다
// (양ㅅ-깃 → 양ㅅ깃, ㄱ자-관 → ㄱ자관, ㄱㄴㄷ-순 → ㄱㄴㄷ순, 옛말 놉ᄂᆞ가ᄫᅵ). 낱자로 시작하는 단어는 끝말이 새로 시작될 때만 낼 수 있다.
const syllables = (word) => graphemes(word);
const firstSyllable = (word) => syllables(word)[0] ?? '';
function isHangulWord(word) {
  const parts = syllables(word);
  return parts.length > 0 && parts.every((g) => isSyllable(g) || isJamo(g)) && isSyllable(parts.at(-1));
}
const startsWithJamo = (word) => isJamo(firstSyllable(word));

function split(syllable) {
  const code = syllable?.length === 1 ? syllable.charCodeAt(0) : 0;
  if (code < HANGUL_BASE || code > HANGUL_END) return null;
  const offset = code - HANGUL_BASE;
  return { initial: INITIALS[Math.floor(offset / 588)], vowelIndex: Math.floor((offset % 588) / 28), finalIndex: offset % 28 };
}
function compose(initial, vowelIndex, finalIndex) {
  return String.fromCharCode(HANGUL_BASE + INITIALS.indexOf(initial) * 588 + vowelIndex * 28 + finalIndex);
}

// 정방향: 력→역, 라→나, 녀→여
function dueumVariant(syllable) {
  const s = split(syllable); if (!s) return syllable;
  const vowel = VOWELS[s.vowelIndex];
  if (s.initial === 'ㄹ' && L_TO_IEUNG.has(vowel)) return compose('ㅇ', s.vowelIndex, s.finalIndex);
  if (s.initial === 'ㄹ' && L_TO_NIEUN.has(vowel)) return compose('ㄴ', s.vowelIndex, s.finalIndex);
  if (s.initial === 'ㄴ' && N_TO_IEUNG.has(vowel)) return compose('ㅇ', s.vowelIndex, s.finalIndex);
  return syllable;
}

// 역방향(원래 소리): 여→려·녀, 나→라. 한방 판정과 시작 글자 허용을 같은 기준으로 맞추려고 함께 쓴다.
function dueumReverseVariants(syllable) {
  const s = split(syllable); if (!s) return [];
  const vowel = VOWELS[s.vowelIndex]; const out = [];
  if (s.initial === 'ㅇ' && L_TO_IEUNG.has(vowel)) out.push(compose('ㄹ', s.vowelIndex, s.finalIndex), compose('ㄴ', s.vowelIndex, s.finalIndex));
  if (s.initial === 'ㄴ' && L_TO_NIEUN.has(vowel)) out.push(compose('ㄹ', s.vowelIndex, s.finalIndex));
  return [...new Set(out)];
}

// 앞 단어 끝 글자 다음에 올 수 있는 시작 글자들(원음 + 두음 변환음).
function allowedStarts(lastSyllable) {
  return [...new Set([lastSyllable, dueumVariant(lastSyllable), ...dueumReverseVariants(lastSyllable)])];
}

function lastSyllable(word) {
  return syllables(word).findLast(isSyllable) ?? '';
}

// 사전 표제어의 띄어쓰기 기호(^)·붙임표(-)·공백을 지운다.
function cleanWord(word) {
  return String(word || '').replace(/[\s^\-]/g, '');
}

// 사전에 묻기 전에 먼저 검사할 수 있는 규칙. 통과하면 null, 아니면 이유 문장을 돌려준다.
// 사람이 입력한 단어 다듬기: 띄어쓰기와 특수문자(!?-~·, 이모지 등)는 자동으로 지운다('사과!' → '사과').
// 글자(한글·영어 등)와 숫자는 남겨서, 한글이 아니면 precheck가 "완성된 한글 글자만"이라고 알려 준다.
// 옛한글 단추로 넣은 낱자('ㄴ'+'ㆍ')는 한 글자('ᄂᆞ')로 조립한다.
function typedWord(raw) {
  return composeTyped(String(raw ?? '').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 60));
}
function precheck(word, previousWord, usedWords) {
  if (!word) return '단어를 입력해 주세요.';
  if (!isHangulWord(word)) return '한글만 입력할 수 있어요(끝 글자는 완성된 글자).';
  const length = syllables(word).length;
  if (length < WORD_MIN) return '두 글자 이상 단어만 쓸 수 있어요.';
  if (length > WORD_MAX) return `${WORD_MAX}글자 이하로 입력해 주세요.`;
  if (previousWord) {
    if (startsWithJamo(word)) return '낱자(ㄱ·ㄴ…)로 시작하는 단어는 끝말이 새로 시작될 때(첫 단어)만 쓸 수 있어요.';
    const starts = allowedStarts(lastSyllable(previousWord));
    if (!starts.includes(firstSyllable(word))) return `'${starts.join("' 또는 '")}'(으)로 시작해야 해요.`;
  }
  if (usedWords.has(word)) return '이번 판에 이미 나온 단어예요.';
  return null;
}

module.exports = { typedWord, isHangulWord, syllables, firstSyllable, dueumVariant, dueumReverseVariants, allowedStarts, lastSyllable, cleanWord, precheck, WORD_MIN, WORD_MAX };
