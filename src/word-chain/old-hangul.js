// 옛한글(아래아 ㆍ·순경음 비읍 ㅸ·반치음 ㅿ …) 도우미.
// 우리말샘은 옛말의 옛한글 한 글자를 "한양 PUA"(사용자 정의 영역) 코드 하나로 보낸다(예: ᄂᆞ = U+E283, ᄫᅵ = U+E8A1).
// 이 코드는 우리말샘 글꼴에서만 글자로 보이고 복사하면 깨진다. 그래서 받자마자 표준 옛한글(첫소리·가운뎃소리·끝소리 조각을
// 이어 붙인 첫가끝 글자)로 바꿔 쓰고, 사전에 물을 때만 다시 PUA로 바꾼다.
// 변환표(old-hangul-table.json)는 hypua2jamo 0.7(GNU LGPL v3, old-hangul-table.LICENSE-LGPL3.txt)에서 표만 옮겨 왔다.
const table = require('./old-hangul-table.json');

const fromPuaMap = new Map(Object.entries(table.pua).map(([hex, jamo]) => [String.fromCodePoint(parseInt(hex, 16)), jamo]));
const toPuaMap = new Map();
for (const [pua, jamo] of fromPuaMap) if (!toPuaMap.has(jamo)) toPuaMap.set(jamo, pua); // 같은 글자를 가리키는 코드가 둘이면 앞의 것
const PUA = /[-]/g;

// 눈에 보이는 글자 단위로 자른다. 표준 옛한글 'ᄂᆞ'는 조각 2개지만 한 글자로 센다.
const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });
const graphemes = (text) => Array.from(segmenter.segment(String(text ?? '')), (part) => part.segment);

const fromPua = (text) => String(text ?? '').replace(PUA, (char) => fromPuaMap.get(char) ?? char).normalize('NFC');
const toPua = (text) => graphemes(text).map((g) => toPuaMap.get(g) ?? g).join('');

// 화면의 옛한글 단추로 넣은 낱자를 한 글자로 조립한다: 'ㄴ'+'ㆍ' → 'ᄂᆞ', 'ㅸ'+'ㅣ' → 'ᄫᅵ', 'ㄴ'+'ㆍ'+'ㄹ' → 'ᄂᆞᆯ'.
// 모음이 뒤따르지 않는 낱자('양ㅅ깃'의 ㅅ, 'ㄱㄴㄷ순')는 그대로 둔다. 끝소리 뒤에 모음이 오면 그 자음은 다음 글자의 첫소리다.
// 현대 글자로 조립되는 것('ㄱ'+'ㅏ')은 NFC로 보통 글자('가')가 된다.
const { L, V, T } = table.compat;
function composeTyped(text) {
  const chars = [...String(text ?? '')];
  let out = '';
  for (let i = 0; i < chars.length; i += 1) {
    if (!(L[chars[i]] && V[chars[i + 1]])) { out += chars[i]; continue; }
    let syllable = L[chars[i]] + V[chars[i + 1]];
    i += 1;
    if (T[chars[i + 1]] && !V[chars[i + 2]]) { syllable += T[chars[i + 1]]; i += 1; }
    out += syllable;
  }
  return out.normalize('NFC');
}

// 낱말을 이루는 글자 종류
const CHOSEONG = 'ᄀ-ᅟꥠ-꥿';
const JUNGSEONG = 'ᅠ-ᆧힰ-ퟆ';
const JONGSEONG = 'ᆨ-ᇿퟋ-ퟻ';
const SYLLABLE = new RegExp(`^(?:[가-힣]|[${CHOSEONG}]+[${JUNGSEONG}]+[${JONGSEONG}]*)$`); // 완성된 글자(현대·옛한글)
const JAMO = /^[ㄱ-ㆎ]$/; // 낱자(ㄱ·ㅅ·ㆍ…)
const isSyllable = (g) => SYLLABLE.test(g);
const isJamo = (g) => JAMO.test(g);
const hasOldHangul = (text) => new RegExp(`[${CHOSEONG}${JUNGSEONG}${JONGSEONG}]`).test(String(text ?? ''));

module.exports = { fromPua, toPua, composeTyped, graphemes, isSyllable, isJamo, hasOldHangul };
