// ===== topics.js =====
// 이상형 월드컵 주제와 후보. 브라우저(window.Worldcup.TOPICS)와 서버(require)가 함께 쓴다.
// 주제마다 후보는 정확히 16개(8강·16강 모두 가능). id는 통계 저장 열쇠라 한번 정하면 바꾸지 않는다.
// 새 주제를 넣고 싶으면 아래 모양대로 하나 더 추가하면 된다(후보 16개, id는 영문 소문자).
(function (root) {
  'use strict';
  function list(text) {
    return text.trim().split('\n').map(function (line) {
      var parts = line.trim().split('|');
      return { id: parts[0], emoji: parts[1], name: parts[2] };
    });
  }

  var TOPICS = [
    { id: 'food', emoji: '🍽️', title: '음식', question: '더 먹고 싶은 음식은?', items: list(`
      pizza|🍕|피자
      burger|🍔|햄버거
      chicken|🍗|치킨
      ramen|🍜|라면
      tteokbokki|🌶️|떡볶이
      gimbap|🍙|김밥
      sushi|🍣|초밥
      jjajang|🥢|짜장면
      tonkatsu|🍖|돈가스
      samgyeopsal|🥓|삼겹살
      spaghetti|🍝|스파게티
      curry|🍛|카레
      hotdog|🌭|핫도그
      taco|🌮|타코
      dumpling|🥟|만두
      bibimbap|🍲|비빔밥`) },
    { id: 'dessert', emoji: '🍰', title: '간식·디저트', question: '지금 당장 먹고 싶은 간식은?', items: list(`
      icecream|🍦|아이스크림
      cake|🍰|케이크
      donut|🍩|도넛
      cookie|🍪|쿠키
      chocolate|🍫|초콜릿
      candy|🍬|사탕
      macaron|🟣|마카롱
      waffle|🧇|와플
      pancake|🥞|팬케이크
      pudding|🍮|푸딩
      bingsu|🍧|빙수
      bungeoppang|🐟|붕어빵
      tanghulu|🍡|탕후루
      jelly|🐻|젤리
      cupcake|🧁|컵케이크
      popcorn|🍿|팝콘`) },
    { id: 'animal', emoji: '🐾', title: '동물', question: '키우고 싶은 동물은?', items: list(`
      dog|🐶|강아지
      cat|🐱|고양이
      rabbit|🐰|토끼
      hamster|🐹|햄스터
      panda|🐼|판다
      penguin|🐧|펭귄
      koala|🐨|코알라
      lion|🦁|사자
      tiger|🐯|호랑이
      fox|🦊|여우
      otter|🦦|수달
      dolphin|🐬|돌고래
      giraffe|🦒|기린
      elephant|🐘|코끼리
      hedgehog|🦔|고슴도치
      sloth|🦥|나무늘보`) },
    { id: 'fruit', emoji: '🍓', title: '과일', question: '더 좋아하는 과일은?', items: list(`
      strawberry|🍓|딸기
      watermelon|🍉|수박
      apple|🍎|사과
      banana|🍌|바나나
      grape|🍇|포도
      peach|🍑|복숭아
      mango|🥭|망고
      tangerine|🍊|귤
      pineapple|🍍|파인애플
      cherry|🍒|체리
      kiwi|🥝|키위
      melon|🍈|멜론
      blueberry|🫐|블루베리
      pear|🍐|배
      lemon|🍋|레몬
      coconut|🥥|코코넛`) },
    { id: 'sport', emoji: '⚽', title: '운동', question: '더 하고 싶은 운동은?', items: list(`
      soccer|⚽|축구
      baseball|⚾|야구
      basketball|🏀|농구
      volleyball|🏐|배구
      pingpong|🏓|탁구
      badminton|🏸|배드민턴
      swimming|🏊|수영
      taekwondo|🥋|태권도
      dodgeball|🔴|피구
      jumprope|➰|줄넘기
      skating|⛸️|스케이트
      ski|⛷️|스키
      cycling|🚴|자전거
      bowling|🎳|볼링
      tennis|🎾|테니스
      climbing|🧗|클라이밍`) },
    { id: 'vehicle', emoji: '🚀', title: '탈것', question: '타 보고 싶은 탈것은?', items: list(`
      car|🚗|자동차
      airplane|✈️|비행기
      train|🚄|고속열차
      ship|🚢|크루즈 배
      helicopter|🚁|헬리콥터
      rocket|🚀|로켓
      bicycle|🚲|자전거
      motorcycle|🏍️|오토바이
      bus|🚌|버스
      firetruck|🚒|소방차
      policecar|🚓|경찰차
      balloon|🎈|열기구
      submarine|🌊|잠수함
      skateboard|🛹|스케이트보드
      tractor|🚜|트랙터
      scooter|🛴|킥보드`) },
    { id: 'job', emoji: '🧑‍🚀', title: '꿈·직업', question: '더 해 보고 싶은 직업은?', items: list(`
      youtuber|📹|유튜버
      doctor|🩺|의사
      teacher|🧑‍🏫|선생님
      chef|🧑‍🍳|요리사
      police|👮|경찰관
      firefighter|🧑‍🚒|소방관
      scientist|🧪|과학자
      athlete|🏅|운동선수
      singer|🎤|가수
      gamedev|🎮|게임 개발자
      astronaut|🧑‍🚀|우주비행사
      painter|🎨|화가
      pilot|🧑‍✈️|비행기 조종사
      vet|🐕|수의사
      progamer|🕹️|프로게이머
      baker|🥐|제빵사`) },
    { id: 'place', emoji: '🎢', title: '놀러 갈 곳', question: '이번 주말에 가고 싶은 곳은?', items: list(`
      themepark|🎢|놀이공원
      beach|🏖️|바다
      pool|🏊|수영장
      camping|⛺|캠핑장
      cinema|🎬|영화관
      pcroom|🖥️|PC방
      kidscafe|🧸|키즈카페
      zoo|🦓|동물원
      waterpark|💦|워터파크
      skiresort|🎿|스키장
      karaoke|🎤|노래방
      museum|🏛️|박물관
      aquarium|🐠|아쿠아리움
      library|📚|도서관
      mountain|⛰️|산
      home|🏠|우리 집`) },
    { id: 'power', emoji: '✨', title: '초능력', question: '갖고 싶은 초능력은?', items: list(`
      teleport|🌀|순간이동
      invisible|👻|투명 인간
      fly|🕊️|하늘 날기
      timestop|⏸️|시간 멈추기
      mindread|🧠|마음 읽기
      fire|🔥|불 쏘기
      strength|💪|엄청난 힘
      clone|👯|분신술
      animaltalk|🐾|동물과 대화
      future|🔮|미래 보기
      underwater|🫧|물속에서 숨쉬기
      speed|⚡|엄청 빠르기
      heal|💚|상처 낫게 하기
      resize|🔍|몸 크기 바꾸기
      summon|🪄|아무거나 꺼내기
      learn|📖|보면 바로 외우기`) }
  ];

  var SIZES = [8, 16];
  var api = { TOPICS: TOPICS, SIZES: SIZES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Worldcup = api;
})(typeof window !== 'undefined' ? window : this);
