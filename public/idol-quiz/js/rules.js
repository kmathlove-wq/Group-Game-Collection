// ===== rules.js =====
// 아이돌 그룹 초성퀴즈의 문제 목록과 채점 규칙(화면을 모름). 브라우저(window.IdolQuiz)와 Node 시험이 함께 쓴다.
// 그룹 한 줄 = 한글 이름|성별(boy/girl)|데뷔 연도|다른 정답(쉼표로, 없으면 비움)
// 초성은 한글 이름에서 자동으로 뽑는다. 새 그룹은 아래 목록에 한 줄 더 쓰면 된다.
(function (root) {
  'use strict';

  var GROUPS = `
    방탄소년단|boy|2013|방탄,bts
    블랙핑크|girl|2016|blackpink
    트와이스|girl|2015|twice
    뉴진스|girl|2022|newjeans
    아이브|girl|2021|ive
    르세라핌|girl|2022|lesserafim
    에스파|girl|2020|aespa
    세븐틴|boy|2015|seventeen,세븐
    스트레이키즈|boy|2018|스키즈,straykids
    엔시티드림|boy|2016|nctdream
    있지|girl|2019|itzy
    투모로우바이투게더|boy|2019|투바투,txt
    엔하이픈|boy|2020|enhypen
    레드벨벳|girl|2014|redvelvet
    마마무|girl|2014|mamamoo
    빅뱅|boy|2006|bigbang
    소녀시대|girl|2007|소시,snsd
    샤이니|boy|2008|shinee
    엑소|boy|2012|exo
    오마이걸|girl|2015|ohmygirl
    에이티즈|boy|2018|ateez
    더보이즈|boy|2017|theboyz
    트레저|boy|2020|treasure
    케플러|girl|2022|kep1er
    아이들|girl|2018|여자아이들,idle,gidle
    스테이씨|girl|2020|stayc
    엔믹스|girl|2022|nmixx
    베이비몬스터|girl|2023|베몬,babymonster
    키스오브라이프|girl|2023|키오프,kissoflife
    보이넥스트도어|boy|2023|boynextdoor
    라이즈|boy|2023|riize
    투어스|boy|2024|tws
    제로베이스원|boy|2023|제베원,zerobaseone,zb1
    아일릿|girl|2024|illit
    위너|boy|2014|winner
    아이콘|boy|2015|ikon
    몬스타엑스|boy|2015|monstax
    비투비|boy|2012|btob
    우주소녀|girl|2016|wjsn
    프로미스나인|girl|2018|프나,fromis9
    에이핑크|girl|2011|apink
    원더걸스|girl|2007|wondergirls
    카라|girl|2007|kara
    동방신기|boy|2003|tvxq
    슈퍼주니어|boy|2005|슈주,superjunior
    투애니원|girl|2009|2ne1
    여자친구|girl|2015|gfriend
    데이식스|boy|2015|day6
    피프티피프티|girl|2022|fiftyfifty
    트리플에스|girl|2023|triples
    엔시티위시|boy|2024|nctwish
    지오디|boy|1999|god
    에이치오티|boy|1996|hot
    젝스키스|boy|1997|젝키,sechskies
    신화|boy|1998|shinhwa
    비스트|boy|2009|beast
    인피니트|boy|2010|infinite
    블락비|boy|2011|blockb
    빅스|boy|2012|vixx
    갓세븐|boy|2014|got7
    아스트로|boy|2016|astro
    펜타곤|boy|2016|pentagon
    엔시티|boy|2016|nct
    워너원|boy|2017|wannaone
    골든차일드|boy|2017|goldenchild
    에이비식스|boy|2019|ab6ix
    크래비티|boy|2020|cravity
    피원하모니|boy|2020|p1harmony
    싸이커스|boy|2023|xikers
    앤팀|boy|2022|andteam
    원어스|boy|2019|oneus
    베리베리|boy|2019|verivery
    온앤오프|boy|2017|onf
    위아이|boy|2020|wei
    비원에이포|boy|2011|b1a4
    틴탑|boy|2010|teentop
    엠블랙|boy|2009|mblaq
    씨엔블루|boy|2010|cnblue
    에프티아일랜드|boy|2007|ftisland
    엔플라잉|boy|2015|nflying
    뉴이스트|boy|2012|nuest
    유키스|boy|2008|ukiss
    에이티비오|boy|2022|atbo
    템페스트|boy|2022|tempest
    플레이브|boy|2023|plave
    웨이션브이|boy|2019|wayv
    투피엠|boy|2008|2pm
    투에이엠|boy|2008|2am
    엑스원|boy|2019|x1
    넥스지|boy|2024|nexz
    아홉|boy|2025|ahof
    클로즈유어아이즈|boy|2024|클유아,closeyoureyes
    핑클|girl|1998|finkl
    에스이에스|girl|1997|ses
    베이비복스|girl|1997|babyvox
    쥬얼리|girl|2001|jewelry
    브라운아이드걸스|girl|2006|브아걸,browneyedgirls
    씨스타|girl|2010|sistar
    미쓰에이|girl|2010|missa
    애프터스쿨|girl|2009|afterschool
    포미닛|girl|2009|4minute
    티아라|girl|2009|tara
    걸스데이|girl|2010|girlsday
    러블리즈|girl|2014|lovelyz
    아이오아이|girl|2016|ioi
    구구단|girl|2016|gugudan
    위키미키|girl|2017|weki meki,wekimeki
    이달의소녀|girl|2018|이달소,loona
    드림캐쳐|girl|2017|드림캐처,dreamcatcher
    에버글로우|girl|2019|everglow
    위클리|girl|2020|weeekly
    브레이브걸스|girl|2011|bravegirls
    클라씨|girl|2022|classy
    하이키|girl|2022|h1key
    빌리|girl|2021|billlie
    퍼플키스|girl|2021|purplekiss
    라잇썸|girl|2021|lightsum
    이세계아이돌|girl|2021|이세돌
    영파씨|girl|2023|youngposse
    미야오|girl|2024|meovv
    키키|girl|2025|kiiikiii
    하츠투하츠|girl|2025|heartstohearts
    이즈나|girl|2024|izna
    유니스|girl|2024|unis
    아이즈원|girl|2018|izone
    시크릿|girl|2009|secret
    달샤벳|girl|2011|dalshabet
    라붐|girl|2014|laboum
    에프엑스|girl|2009|fx
  `.trim().split('\n').map(function (line) {
    var p = line.trim().split('|');
    return { name: p[0], type: p[1], year: Number(p[2]), aliases: p[3] ? p[3].split(',') : [] };
  });

  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  var QUESTION_COUNT = 15;
  var SECONDS = 15;
  var SCORE_MAX = 99999;

  function isSyllable(ch) {
    var c = ch.charCodeAt(0);
    return c >= 0xac00 && c <= 0xd7a3;
  }

  // '블랙핑크' → 'ㅂㄹㅍㅋ'
  function chosung(text) {
    return Array.from(text).map(function (ch) {
      return isSyllable(ch) ? CHO[Math.floor((ch.charCodeAt(0) - 0xac00) / 588)] : ch;
    }).join('');
  }

  // 힌트 2단계: 앞 글자 n개를 보여 주고 나머지는 초성 '블ㄹㅍㅋ'
  function reveal(text, n) {
    var chars = Array.from(text);
    return chars.slice(0, n).join('') + chosung(chars.slice(n).join(''));
  }

  // 띄어쓰기·기호를 빼고 영어는 소문자로: '블랙 핑크!' → '블랙핑크', 'BTS' → 'bts'
  function normalize(text) {
    return String(text || '').toLowerCase().replace(/[^0-9a-z가-힣]/g, '');
  }

  function isCorrect(group, input) {
    var typed = normalize(input);
    if (!typed) return false;
    return [group.name].concat(group.aliases).some(function (answer) { return normalize(answer) === typed; });
  }

  // 정답 점수: 기본 100 + 남은 초 × 10, 힌트 하나에 30점씩 뺌(최소 20점)
  function scoreFor(secondsLeft, hints) {
    var left = Math.max(0, Math.min(SECONDS, Math.ceil(secondsLeft)));
    return Math.max(20, 100 + left * 10 - hints * 30);
  }

  // kind: 'all' | 'boy' | 'girl' — 겹치지 않게 count개
  function pickQuestions(kind, count, rand) {
    rand = rand || Math.random;
    var pool = GROUPS.filter(function (g) { return kind === 'all' || g.type === kind; });
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    return pool.slice(0, count);
  }

  function hintText(group) {
    return (group.type === 'boy' ? '보이그룹' : '걸그룹') + ' · ' + group.year + '년 데뷔';
  }

  var api = {
    GROUPS: GROUPS, QUESTION_COUNT: QUESTION_COUNT, SECONDS: SECONDS, SCORE_MAX: SCORE_MAX,
    chosung: chosung, reveal: reveal, normalize: normalize, isCorrect: isCorrect, scoreFor: scoreFor,
    pickQuestions: pickQuestions, hintText: hintText
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.IdolQuiz = api;
})(typeof window !== 'undefined' ? window : this);
