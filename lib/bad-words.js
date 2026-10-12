// 게시판 글의 비속어·욕설을 걸러낸다. 완벽할 수는 없으므로 화면에도 "비속어·욕설 금지" 안내를 함께 둔다.
// "시.발", "시1발", "시 발"처럼 사이에 기호·숫자·띄어쓰기를 넣어 피하는 경우도 잡는다.
// 단, 띄어쓰기는 한 글자씩 떨어진 경우만 붙인다("다시 발견"이 "다시발견"이 되어 막히면 안 되기 때문).
const BAD_WORDS = [
  '씨발', '시발', '씨바', '씨팔', '시팔', '쓰발', '씨빨', '시빨', '썅', 'ㅅㅂ', 'ㅆㅂ', 'ㅆㅃ',
  '병신', '븅신', '빙신', '병쉰', 'ㅂㅅ', 'ㅄ',
  '좆', '존나', '존내', '졸라', 'ㅈㄴ',
  '개새끼', '개새기', '개색기', '개색끼', '개세끼', '개쉐이', '새끼야', '새끼들아',
  '니애미', '느금마', '느그엄마', '니미럴', '엠창', '애미뒤', '애비없',
  '지랄', 'ㅈㄹ', '미친놈', '미친년', '미친새끼', '또라이', '닥쳐', '꺼져', '염병', '엿먹',
  '개같은', '개년', '개놈', '걸레같', '창녀',
  'fuck', 'shit', 'bitch', 'asshole', 'motherfucker'
];
// 욕 글자가 들어 있지만 욕이 아닌 낱말
const ALLOWED = ['시발점', '시발역'];

function normalize(text) {
  const cleaned = String(text ?? '').normalize('NFC').toLowerCase()
    .replace(/[^가-힣ㄱ-ㅎㅏ-ㅣa-z\s]/g, '');
  const words = cleaned.split(/\s+/).filter(Boolean);
  const joined = [];
  for (const word of words) {
    const last = joined.length - 1;
    // 한 글자짜리끼리 이어진 것("시 발")은 붙여 본다
    if (word.length === 1 && last >= 0 && joined[last].single) joined[last].text += word;
    else joined.push({ text: word, single: word.length === 1 });
  }
  return joined.map((part) => part.text).join(' ');
}

function hasBadWord(text) {
  let normalized = normalize(text);
  for (const word of ALLOWED) normalized = normalized.split(word).join(' ');
  return BAD_WORDS.some((word) => normalized.includes(word));
}

module.exports = { hasBadWord, normalize };
