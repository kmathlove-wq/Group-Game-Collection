// ===== species.js =====
// 사마귀 종류 맞히기의 사마귀 목록과 문제 만들기(화면을 모름). 브라우저(window.Mantis)와 Node 시험이 함께 쓴다.
// 사진은 사용자가 직접 받아 img/<file>.jpg(또는 .png·.webp·.jpeg)로 넣는다. 사진이 없으면 화면이 "사진 준비 중"을 보여 준다.
// credit: 사진 출처(저작자 표시가 필요한 사진이면 여기에 적으면 사진 아래에 나온다).
(function (root) {
  'use strict';

  var SPECIES = [
    { id: 'wang', file: 'wang', name: '왕사마귀', sci: 'Tenodera sinensis', where: '우리나라', credit: '', hints: [
      '우리나라에 사는 사마귀 중에서 가장 커요. 몸길이가 7~9cm나 돼요.',
      '몸 색깔은 초록색도 있고 갈색도 있어요.',
      '뒷날개를 펴면 밑부분에 진한 갈색 무늬가 있어요.'] },
    { id: 'jom', file: 'jom', name: '좀사마귀', sci: 'Statilia maculata', where: '우리나라', credit: '', hints: [
      '이름의 "좀"은 작다는 뜻이에요. 몸길이는 5cm 안팎이에요.',
      '몸이 대부분 갈색이라 마른 풀이나 낙엽 사이에 잘 숨어요.',
      '앞다리 안쪽에 검은색과 흰색 무늬가 있어요.'] },
    { id: 'neopjeokbae', file: 'neopjeokbae', name: '넓적배사마귀', sci: 'Hierodula patellifera', where: '우리나라', credit: '', hints: [
      '이름처럼 배가 넓적하고 통통해요.',
      '초록색 앞날개 가운데쯤에 하얀 점이 하나씩 있어요.',
      '풀밭보다 나무 위에서 자주 보여요.'] },
    { id: 'hangra', file: 'hangra', name: '항라사마귀', sci: 'Mantis religiosa', where: '우리나라·세계 여러 곳', credit: '', hints: [
      '앞다리 밑동 안쪽에 검은 테두리의 동그란 눈알 무늬가 있어요.',
      '앞다리를 모은 모습이 기도하는 것 같아 영어로 "기도하는 사마귀"라고 불려요.',
      '유럽, 아시아, 아프리카 등 세계 여러 곳에 살아요.'] },
    { id: 'aegi', file: 'aegi', name: '애기사마귀', sci: 'Acromantis japonica', where: '우리나라 남쪽', credit: '', hints: [
      '이름처럼 아주 작아요. 몸길이가 3cm쯤이에요.',
      '우리나라 남쪽 지방과 제주도의 숲에서 볼 수 있어요.',
      '갈색 몸이라 나뭇잎 위에서 잘 안 보여요.'] },
    { id: 'orchid', file: 'orchid', name: '난초사마귀', sci: 'Hymenopus coronatus', where: '동남아시아', credit: '', hints: [
      '하얀색이나 분홍색이라 꽃과 똑같이 생겼어요.',
      '다리가 꽃잎처럼 넓적해요.',
      '꽃인 줄 알고 날아온 곤충을 잡아먹어요. 동남아시아 열대 숲에 살아요.'] },
    { id: 'spiny-flower', file: 'spiny-flower', name: '가시꽃사마귀', sci: 'Pseudocreobotra wahlbergii', where: '아프리카', credit: '', hints: [
      '날개에 소용돌이 모양의 커다란 눈 무늬가 있어요.',
      '몸 곳곳에 작은 가시가 돋아 있어요.',
      '아프리카에 살고, 꽃 위에서 먹이를 기다려요.'] },
    { id: 'devil-flower', file: 'devil-flower', name: '악마꽃사마귀', sci: 'Idolomantis diabolica', where: '아프리카 동쪽', credit: '', hints: [
      '꽃사마귀 중에서 가장 큰 편이에요. 10cm가 넘기도 해요.',
      '앞다리를 펼치면 빨간색·파란색·흰색이 화려하게 드러나 적을 놀라게 해요.',
      '아프리카 동쪽에 살아요. 이름에 무서운 "악마"가 들어가요.'] },
    { id: 'ghost', file: 'ghost', name: '유령사마귀', sci: 'Phyllocrania paradoxa', where: '아프리카', credit: '', hints: [
      '머리 위에 잎사귀 모양의 뾰족한 왕관이 있어요.',
      '몸 전체가 쭈글쭈글한 마른 나뭇잎처럼 생겼어요.',
      '아프리카에 살아요. 이름에 "유령"이 들어가요.'] },
    { id: 'dead-leaf', file: 'dead-leaf', name: '가랑잎사마귀', sci: 'Deroplatys desiccata', where: '동남아시아', credit: '', hints: [
      '가슴 부분이 넓게 퍼져서 바싹 마른 낙엽처럼 보여요.',
      '위험하면 낙엽처럼 툭 쓰러져 죽은 척을 하기도 해요.',
      '동남아시아 숲의 낙엽 사이에 살아요.'] },
    { id: 'violin', file: 'violin', name: '바이올린사마귀', sci: 'Gongylus gongylodes', where: '남아시아', credit: '', hints: [
      '가슴 부분이 아주 가늘고 길어서 악기처럼 보여요.',
      '다리 군데군데에 잎사귀 같은 납작한 판이 붙어 있어요.',
      '인도와 스리랑카 같은 남아시아에 살아요.'] },
    { id: 'lichen', file: 'lichen', name: '이끼사마귀', sci: 'Pogonogaster tristani', where: '중앙아메리카', credit: '', hints: [
      '몸이 초록색·회색 얼룩덜룩이라 나무껍질에 핀 이끼와 똑같아요.',
      '나무줄기에 착 붙어 있으면 거의 안 보여요.',
      '코스타리카 같은 중앙아메리카에 살아요.'] },
    { id: 'twig', file: 'twig', name: '나뭇가지사마귀', sci: 'Popa spurca', where: '아프리카', credit: '', hints: [
      '몸이 가늘고 길쭉한 갈색이라 마른 나뭇가지처럼 보여요.',
      '가만히 있으면 진짜 가지와 구별하기 어려워요.',
      '아프리카에 살아요.'] },
    { id: 'shield', file: 'shield', name: '방패사마귀', sci: 'Rhombodera basalis', where: '동남아시아', credit: '', hints: [
      '가슴 부분이 마름모꼴 방패처럼 넓게 퍼져 있어요.',
      '몸이 크고 선명한 초록색이에요.',
      '말레이시아 같은 동남아시아에 살아요.'] }
  ];

  var QUESTION_COUNT = 10;
  var CHOICES = 4;
  var EXTENSIONS = ['jpg', 'png', 'webp', 'jpeg'];

  function shuffle(list, rand) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // 겹치지 않게 count종을 뽑고, 문제마다 정답 + 다른 사마귀 3개를 섞은 보기를 만든다.
  function makeQuiz(count, rand) {
    rand = rand || Math.random;
    return shuffle(SPECIES, rand).slice(0, count).map(function (answer) {
      var others = shuffle(SPECIES.filter(function (s) { return s !== answer; }), rand).slice(0, CHOICES - 1);
      return { answer: answer, choices: shuffle(others.concat([answer]), rand) };
    });
  }

  // 정답 점수: 힌트를 안 보면 10점, 하나 볼 때마다 3점씩 줄어든다(최소 1점).
  function scoreFor(hintsSeen) {
    return Math.max(1, 10 - hintsSeen * 3);
  }

  var api = { SPECIES: SPECIES, QUESTION_COUNT: QUESTION_COUNT, CHOICES: CHOICES, EXTENSIONS: EXTENSIONS, makeQuiz: makeQuiz, scoreFor: scoreFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Mantis = api;
})(typeof window !== 'undefined' ? window : this);
