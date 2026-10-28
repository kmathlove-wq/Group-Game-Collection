// ===== story.js =====
// 초이스 게임 "막대맨 우주 대탈출"의 이야기 지도와 진행 규칙(화면을 모름). 브라우저(window.Choice.Story)와 Node 시험이 함께 쓴다.
// 장면(node) 종류: choice(선택지) · fail(실패 장면, 다시 하기는 마지막 선택 장면으로) · ending(엔딩).
// choice 장면에 timer(초)가 있으면 그 안에 못 고를 때 timeout 장면으로 간다.
// 선택지에 lead(들어가는 말)가 있으면 다음 장면 글 앞에 붙여 보여 준다 — 여러 길이 같이 쓰는 장면에서 길마다 '어떻게 왔는지'를 말하려고(2026-10-28: 자석 길이 열쇠로 문을 연 이야기 없이 화물칸에 뚝 떨어졌음).
  // art는 scenes.js의 그림 이름. 그림 이름과 장면 id는 같을 때가 많지만 달라도 된다.
(function (root) {
  'use strict';

  var START = 'cell';
  var NODES = {
    // ----- 1. 감옥 -----
    cell: { type: 'choice', art: 'cell', text: '눈을 떠 보니 외계인 우주선 감옥 안이다! 창밖으로 지구가 보인다. 주머니에 든 것 중 하나로 탈출하자.',
      choices: [
        { icon: '🥄', label: '숟가락으로 바닥 파기', next: 'f_spoon' },
        { icon: '📱', label: '엄마한테 전화하기', next: 'f_phone' },
        { icon: '🍌', label: '바나나 껍질 던지기', next: 'hall' },
        { icon: '👽', label: '외계인 변장 키트', next: 'kitchen' },
        { icon: '😴', label: '일단 한숨 자기', next: 'f_sleep' },
        { icon: '🎸', label: '우주 기타로 슬픈 노래 부르기', next: 'f_song' },
        { icon: '🧲', label: '자석으로 열쇠 끌어오기', next: 'cargo', lead: '자석을 쭉 내밀자 경비병 허리춤의 열쇠가 휙! 날아와 철컥 붙었다. 그 열쇠로 감옥 문을 따고 살금살금 빠져나왔다.' },
        { icon: '🍕', label: '피자 배달 시키기', next: 'f_pizza' },
        { icon: '🧻', label: '휴지로 미라 변장', next: 'f_mummy' },
        { icon: '🪥', label: '칫솔로 환기구 나사 풀기', next: 'vent' }
      ] },
    f_song: { type: 'fail', art: 'f_song', title: '눈물 바다', text: '노래가 너무 슬퍼서 경비병이 펑펑 울었다. 눈물이 차올라 감옥이 수영장이 됐다. 막대맨은 수영을 못 한다.' },
    f_pizza: { type: 'fail', art: 'f_pizza', title: '배달 예정: 1000년 뒤', text: '"우주선 감옥이요? 배달 예정 시간은 1000년 뒤입니다." 피자는 따뜻하게 도착할 거라고 했다.' },
    f_mummy: { type: 'fail', art: 'f_mummy', title: '휴지가 모자라', text: '휴지를 감다 보니 한 칸이 모자랐다. 외계인 경비병이 친절하게 한 칸을 더 감아 주고 그대로 상자에 넣어 버렸다.' },
    f_spoon: { type: 'fail', art: 'f_spoon', title: '3년 동안 팠다', text: '숟가락으로 철판 바닥을 3년 동안 팠다. 뚫고 내려가 보니… 아래층은 외계인 화장실이었다.' },
    f_phone: { type: 'fail', art: 'f_phone', title: '숙제는 했니?', text: '"엄마 나 우주선에 갇혔어!" "숙제는 다 하고 갇힌 거니?" … 통화 요금이 우주 요금으로 나왔다.' },
    f_sleep: { type: 'fail', art: 'f_sleep', title: '푹 잤다', text: '정말 푹 잤다. 일어나 보니 외계인 동물원의 "지구 생물" 전시품이 되어 있었다.' },

    // ----- 2-A. 복도(바나나 길) -----
    hall: { type: 'choice', art: 'hall', text: '바나나 껍질에 경비병이 미끄러지며 열쇠를 떨어뜨렸다! 문을 열고 나왔는데… 순찰 로봇이 다가온다! 빨리!', timer: 4, timeout: 'f_freeze',
      choices: [
        { icon: '📦', label: '상자 속에 숨기', next: 'control' },
        { icon: '🏃', label: '전속력으로 달리기', next: 'f_run' },
        { icon: '🕺', label: '로봇 춤 추기', next: 'f_dance' },
        { icon: '🧹', label: '청소 로봇인 척하기', next: 'f_mop' },
        { icon: '🍌', label: '바나나 하나 더 던지기', next: 'f_banana2' },
        { icon: '🚪', label: '옆 문으로 뛰어들기', next: 'cargo', lead: '옆 문으로 몸을 날려 뛰어들고 문을 쾅 닫았다. 휴, 로봇은 못 봤다!' }
      ] },
    f_mop: { type: 'fail', art: 'f_mop', title: '청소 당번', text: '로봇이 믿었다! 그리고 우주선 전체 청소를 맡겼다. 화장실만 342개다.' },
    f_banana2: { type: 'fail', art: 'f_banana2', title: '바퀴는 안 미끄러진다', text: '로봇은 바퀴라서 바나나를 그냥 밟고 지나갔다. 대신 막대맨이 자기 바나나에 미끄러졌다.' },
    f_freeze: { type: 'fail', art: 'f_freeze', title: '얼음!', text: '너무 놀라서 얼음이 되어 버렸다. 로봇: "땡." … 땡은 없었다.' },
    f_run: { type: 'fail', art: 'f_run', title: '로봇은 바퀴가 있다', text: '열심히 달렸지만 로봇은 바퀴로 시속 200km를 달렸다. 막대맨은 다리가 막대다.' },
    f_dance: { type: 'fail', art: 'f_dance', title: '댄스 배틀', text: '로봇도 같이 춤을 췄다. 너무 잘 춰서 구경 온 경비병 50명에게 둘러싸였다.' },

    // ----- 3. 조종실 -----
    control: { type: 'choice', art: 'control', text: '로봇이 상자를 지나쳤다. 살금살금 들어간 곳은 우주선 조종실! 버튼이 잔뜩 있다.',
      choices: [
        { icon: '🔴', label: '"절대 누르지 마시오" 빨간 버튼', next: 'f_red' },
        { icon: '🟢', label: '초록 버튼', next: 'pods' },
        { icon: '🕹️', label: '조종간 잡기', next: 'pilot' },
        { icon: '📢', label: '방송 마이크', next: 'e_vacation' },
        { icon: '🎵', label: '라디오 버튼', next: 'f_radio' },
        { icon: '🍩', label: '도넛 모양 버튼', next: 'f_donut' },
        { icon: '🔵', label: '파란 버튼', next: 'f_gravity' },
        { icon: '🖥️', label: '화면에 "지구 가는 길" 검색', next: 'f_search' }
      ] },
    f_radio: { type: 'fail', art: 'f_radio', title: '무한 반복', text: '외계 아이돌 노래가 우주선 전체에 울려 퍼졌다. 끄는 버튼이 없다. 막대맨은 3일째 그 노래를 흥얼거리는 중이다.' },
    f_donut: { type: 'fail', art: 'f_donut', title: '선장님 간식', text: '버튼이 아니라 진짜 도넛이었다. 한 입 깨문 순간 선장님이 들어왔다. "내… 도넛…"' },
    f_gravity: { type: 'fail', art: 'f_gravity', title: '둥둥 파티', text: '중력이 꺼졌다! 모두가 둥둥 떠다니는데, 막대맨만 천장에 머리가 끼었다.' },
    f_search: { type: 'fail', art: 'f_search', title: '검색 결과 없음', text: '"지구 가는 길"을 검색했더니 "혹시 지구 과자를 찾으셨나요?"만 나왔다. 그 사이 경비병이 왔다.' },
    f_red: { type: 'fail', art: 'f_red', title: '누르지 말라니까', text: '"자폭까지 3, 2, 1…" 펑! 누르지 말라는 버튼은 누르지 말자.' },
    pilot: { type: 'choice', art: 'pilot', text: '우주선을 몰고 지구로 출발! 앗, 커다란 운석이 날아온다! 빨리 피해!', timer: 2, timeout: 'f_rock',
      choices: [
        { icon: '⬅️', label: '왼쪽으로', next: 'e_hero' },
        { icon: '➡️', label: '오른쪽으로', next: 'f_moon' },
        { icon: '⬆️', label: '위로', next: 'f_up' },
        { icon: '⬇️', label: '아래로', next: 'f_down' }
      ] },
    f_up: { type: 'fail', art: 'f_up', title: '우주 경찰', text: '위에는 우주 경찰 순찰선이 있었다. "면허증 보여 주세요." 막대맨은 자전거 면허도 없다.' },
    f_down: { type: 'fail', art: 'f_down', title: '쏘옥', text: '아래에는 작은 블랙홀이 있었다. 우주선이 스파게티 면처럼 쭈욱 늘어났다.' },
    f_rock: { type: 'fail', art: 'f_rock', title: '쾅!', text: '운석과 정면으로 부딪혔다. 우주선은 납작한 우주 호떡이 되었다.' },
    f_moon: { type: 'fail', art: 'f_moon', title: '달에 꽂혔다', text: '운석은 피했지만 오른쪽에 달이 있었다. 우주선이 달에 깃발처럼 꽂혔다.' },

    // ----- 4. 탈출 포드 -----
    pods: { type: 'choice', art: 'pods', text: '초록 버튼을 누르자 탈출 포드 보관실 문이 열렸다! 그런데 경보가 울린다!',
      choices: [
        { icon: '🚀', label: '탈출 포드에 타기', next: 'launch' },
        { icon: '🧑‍🚀', label: '우주복 입고 뛰어내리기', next: 'f_float' },
        { icon: '🐙', label: '구석에서 떨고 있는 외계인 아기 데려가기', next: 'e_friend' },
        { icon: '🍔', label: '포드에 간식 잔뜩 싣기', next: 'f_snack' },
        { icon: '🐶', label: '외계인 강아지도 태우기', next: 'f_pet' },
        { icon: '🪂', label: '낙하산 챙기고 포드 타기', next: 'launch' }
      ] },
    f_snack: { type: 'fail', art: 'f_snack', title: '너무 무거워', text: '간식을 2톤 실었더니 포드가 꿈쩍도 안 했다. 그래서 다 먹었다. 이제는 막대맨이 너무 무겁다.' },
    f_pet: { type: 'fail', art: 'f_pet', title: '물어뜯기 대장', text: '외계인 강아지가 포드의 전선을 전부 씹어 먹었다. 꼬리를 흔드는 걸 보니 아주 맛있었나 보다.' },
    launch: { type: 'choice', art: 'launch', text: '포드 문이 닫히는 중! 발사 버튼을 지금 눌러!', timer: 2, timeout: 'f_door',
      choices: [
        { icon: '🔘', label: '발사!', next: 'e_pod' },
        { icon: '🎵', label: '출발 음악부터 틀기', next: 'f_door' },
        { icon: '📸', label: '기념 셀카 찍기', next: 'f_selfie' }
      ] },
    f_selfie: { type: 'fail', art: 'f_selfie', title: '찰칵', text: '셀카는 아주 잘 나왔다. 뒤에서 화난 경비병 열 명이 브이를 하고 있었다.' },
    f_door: { type: 'fail', art: 'f_door', title: '문이 열린 채로', text: '발사 버튼을 조금 늦게 눌렀다(출발 음악을 고르느라, 또는 머뭇거리느라). 그래서 포드 문이 덜 닫힌 채로 발사됐다. 막대맨은 포드 밖에 매달려 갔다.' },
    f_float: { type: 'fail', art: 'f_float', title: '우주 미아', text: '멋지게 뛰어내렸지만 우주에는 바닥이 없었다. 막대맨은 지금도 빙글빙글 떠다니는 중이다.' },

    // ----- 2-B. 주방(변장 길) -----
    kitchen: { type: 'choice', art: 'kitchen', text: '변장 성공! 경비병이 동료인 줄 알고 문을 열어 줬다. 그런데 주방장이 붙잡는다. "새로 온 요리사지? 손님이 기다려!"',
      choices: [
        { icon: '🍜', label: '지구 라면 끓이기', next: 'captain' },
        { icon: '🙅', label: '"저 요리사 아닌데요"', next: 'f_truth' },
        { icon: '🌶️', label: '아주 매운 소스 듬뿍', next: 'f_spicy' },
        { icon: '🍳', label: '커다란 알로 계란 프라이', next: 'f_egg' },
        { icon: '🧁', label: '컵케이크 굽기', next: 'f_cake' },
        { icon: '🍧', label: '우주 얼음으로 빙수 만들기', next: 'f_bingsu' },
        { icon: '🎤', label: '요리 대신 노래로 시간 끌기', next: 'f_karaoke' },
        { icon: '🗑️', label: '음식물 쓰레기통으로 탈출', next: 'f_trash' }
      ] },
    f_bingsu: { type: 'fail', art: 'f_bingsu', title: '머리가 띵!', text: '우주 얼음은 너무 차가웠다. 빙수를 한 입 먹은 주방장이 머리가 띵! 하고 얼어붙었다. 막대맨은 다시 감옥으로.' },
    f_egg: { type: 'fail', art: 'f_egg', title: '엄마가 왔다', text: '그 알은 외계 공룡의 알이었다. 프라이팬에 올리자마자 엄마 공룡이 주방 문을 부수고 들어왔다.' },
    f_cake: { type: 'fail', art: 'f_cake', title: '크림 폭발', text: '우주 밀가루는 지구보다 100배 부푼다. 오븐이 펑 터지고 주방이 크림 바다가 됐다.' },
    f_karaoke: { type: 'fail', art: 'f_karaoke', title: '100점!', text: '노래방 기계가 100점을 줬다. 손님들이 앵콜을 외쳐서 막대맨은 지금 우주 투어 공연 중이다.' },
    f_trash: { type: 'fail', art: 'f_trash', title: '우주 쓰레기', text: '쓰레기통은 우주로 바로 버려지는 통이었다. 막대맨은 지금 바나나 껍질과 함께 우주를 여행 중이다.' },
    f_truth: { type: 'fail', art: 'f_truth', title: '너무 정직했다', text: '정직은 좋은 거지만… 변장이 들통났다. 다시 감옥으로 직행!' },
    f_spicy: { type: 'fail', art: 'f_spicy', title: '불 뿜는 외계인', text: '한 입 먹은 외계인들이 불을 뿜었다. 주방이 홀랑 타고 막대맨 눈썹도 탔다.' },
    captain: { type: 'choice', art: 'captain', text: '라면 냄새에 선장님이 직접 왔다. "이… 이 맛은 뭐지?! 우주 최고야! 소원을 하나 말해라."',
      choices: [
        { icon: '🏠', label: '"집에 보내 주세요"', next: 'e_home' },
        { icon: '🤝', label: '"우주 라면 가게를 차려 주세요"', next: 'e_ramen' },
        { icon: '💨', label: '대답 대신 방귀', next: 'f_fart' },
        { icon: '📸', label: '"같이 사진 찍어요!"', next: 'f_photo' },
        { icon: '👑', label: '"선장 자리를 주세요"', next: 'e_captain' },
        { icon: '📚', label: '"숙제 좀 대신 해 주세요"', next: 'e_homework' }
      ] },
    f_photo: { type: 'fail', art: 'f_photo', title: '눈부셔!', text: '외계인 눈은 빛에 아주 약했다. 플래시 한 번에 선장님이 기절했고, 막대맨은 다시 감옥으로.' },
    f_fart: { type: 'fail', art: 'f_fart', title: '뿡', text: '외계인에게 방귀는 "전쟁을 선포한다"는 뜻이었다. 우주 전쟁이 시작될 뻔했다.' },

    // ----- 2-C. 화물칸(자석·옆 문 길) -----
    cargo: { type: 'choice', art: 'cargo', text: '들어선 곳은 커다란 화물칸! 이상한 이름표가 붙은 상자가 가득하다. 어떻게 할까?',
      choices: [
        { icon: '🍮', label: '"우주 젤리" 상자 열기', next: 'f_jelly' },
        { icon: '🦖', label: '"절대 깨우지 마시오" 상자 열기', next: 'f_dino' },
        { icon: '🛵', label: '작은 우주 오토바이 타기', next: 'bike' },
        { icon: '🎁', label: '"지구행 택배" 상자에 들어가기', next: 'e_parcel' },
        { icon: '🧊', label: '냉동고에 숨기', next: 'f_freezer' },
        { icon: '🗺️', label: '우주선 지도 보고 엔진실 찾아가기', next: 'engine' }
      ] },
    f_jelly: { type: 'fail', art: 'f_jelly', title: '살아 있는 젤리', text: '우주 젤리는 살아 있었다. 막대맨을 쏙 삼키고 말랑말랑 행복해했다.' },
    f_dino: { type: 'fail', art: 'f_dino', title: '깨우지 말랬지', text: '상자 안에는 자고 있던 우주 공룡이 있었다. 공룡이 하품을 하자 막대맨은 머리카락이 다 날아갔다(원래 없었다).' },
    f_freezer: { type: 'fail', art: 'f_freezer', title: '꽁꽁', text: '숨는 건 성공했다. 문제는 안에서 문이 안 열린다는 것. 막대맨은 막대 아이스크림이 되었다.' },
    bike: { type: 'choice', art: 'bike', text: '우주 오토바이 시동 성공! 화물칸 문이 닫히고 있다! 빨리!', timer: 2.5, timeout: 'f_closed',
      choices: [
        { icon: '🚀', label: '부스터 쾅!', next: 'e_bike' },
        { icon: '🛑', label: '일단 브레이크', next: 'f_brake' },
        { icon: '📯', label: '경적 울리기', next: 'f_horn' }
      ] },
    f_closed: { type: 'fail', art: 'f_closed', title: '쿵', text: '머뭇거리는 사이 문이 닫혔다. 오토바이와 막대맨이 문에 납작 붙었다.' },
    f_brake: { type: 'fail', art: 'f_brake', title: '끼이익', text: '브레이크를 너무 세게 잡아서 막대맨만 앞으로 날아갔다. 오토바이는 얌전히 서 있다.' },
    f_horn: { type: 'fail', art: 'f_horn', title: '빵빵!', text: '경적 소리가 "경비병 모여라!" 신호였다. 경비병들이 줄을 서서 박수를 쳤다.' },

    // ----- 2-D. 환기구(칫솔 길) -----
    vent: { type: 'choice', art: 'vent', text: '칫솔로 나사를 풀고 환기구 속으로 쏙! 먼지투성이 길이 여러 갈래로 나뉜다.',
      choices: [
        { icon: '⬆️', label: '위쪽 길', next: 'garden' },
        { icon: '⬇️', label: '아래쪽 길', next: 'engine' },
        { icon: '➡️', label: '오른쪽 바람 부는 길', next: 'f_fan' },
        { icon: '🤧', label: '참지 말고 재채기', next: 'f_sneeze' },
        { icon: '🐭', label: '우주 쥐 따라가기', next: 'f_mouse' }
      ] },
    f_fan: { type: 'fail', art: 'f_fan', title: '빙글빙글', text: '바람의 정체는 커다란 환풍기였다. 막대맨은 3시간째 빙글빙글 도는 중. 어지럽다.' },
    f_sneeze: { type: 'fail', art: 'f_sneeze', title: '에취!', text: '재채기가 환기구를 타고 우주선 전체에 울렸다. "에취이이이…" 모두가 소리 난 곳을 쳐다봤다.' },
    f_mouse: { type: 'fail', art: 'f_mouse', title: '쥐 마을', text: '우주 쥐를 따라가니 쥐 마을이 나왔다. 막대맨은 쥐 마을 이장님이 되어 치즈 축제를 열고 있다.' },

    // ----- 4-B. 외계인 식물원 -----
    garden: { type: 'choice', art: 'garden', text: '환기구를 나오니 반짝이는 외계인 식물원! 이상한 식물이 가득하다.',
      choices: [
        { icon: '🌸', label: '노래하는 꽃 따기', next: 'f_flower' },
        { icon: '🍄', label: '빛나는 버섯 먹어 보기', next: 'f_mushroom' },
        { icon: '🌳', label: '하늘까지 닿은 나무 오르기', next: 'e_tree' },
        { icon: '💦', label: '스프링클러로 경비병 물벼락', next: 'f_water' },
        { icon: '🪴', label: '화분 속에 숨기', next: 'f_pot' }
      ] },
    f_flower: { type: 'fail', art: 'f_flower', title: '꺄아아악!', text: '꽃을 꺾자 꽃이 비명을 질렀다. 식물원의 모든 꽃이 따라 소리 질렀다. 엄청난 합창이었다.' },
    f_mushroom: { type: 'fail', art: 'f_mushroom', title: '풍선 막대맨', text: '버섯을 먹자 몸이 풍선처럼 부풀었다. 천장에 둥둥 떠서 내려올 수가 없다.' },
    f_water: { type: 'fail', art: 'f_water', title: '쑥쑥', text: '외계인은 물을 맞으면 쑥쑥 자란다. 경비병이 천장만큼 커졌다.' },
    f_pot: { type: 'fail', art: 'f_pot', title: '물 주는 시간', text: '화분에 숨자 정원사 로봇이 물을 주고 비료를 줬다. 막대맨 머리에서 새싹이 났다.' },

    // ----- 5. 엔진실 -----
    engine: { type: 'choice', art: 'engine', text: '부우웅… 우주선의 심장, 엔진실이다! 커다란 레버와 이상한 장치들이 있다.',
      choices: [
        { icon: '🔧', label: '렌치로 엔진 손보기', next: 'f_wrench' },
        { icon: '🔌', label: '커다란 플러그 뽑기', next: 'f_dark' },
        { icon: '🌀', label: '"워프" 레버 당기기', next: 'warp' },
        { icon: '🥤', label: '연료통에 콜라 붓기', next: 'f_cola' },
        { icon: '🐹', label: '엔진 돌리는 햄스터에게 쉬는 시간 주기', next: 'f_hamster' }
      ] },
    f_wrench: { type: 'fail', art: 'f_wrench', title: '더 좋아졌다', text: '엔진을 고쳤더니 우주선이 두 배 빨라졌다. 지구랑 반대 방향으로.' },
    f_dark: { type: 'fail', art: 'f_dark', title: '깜깜', text: '불이 다 꺼졌다! 깜깜한 데서 손을 더듬다 잡은 건… 경비병의 손이었다. "안녕?"' },
    f_cola: { type: 'fail', art: 'f_cola', title: '트림 엔진', text: '우주선이 "꺼어억!" 하고 트림을 하더니 반대로 날아갔다. 김 빠진 콜라 냄새가 난다.' },
    f_hamster: { type: 'fail', art: 'f_hamster', title: '햄스터 휴가', text: '햄스터가 쉬자 우주선이 멈췄다. 이제 막대맨이 바퀴를 돌린다. 하루에 3만 바퀴.' },
    warp: { type: 'choice', art: 'warp', text: '워프 장치가 켜졌다! 화면에 갈 곳이 떴다. 어디로 순간이동할까?',
      choices: [
        { icon: '🌍', label: '지구', next: 'e_warp' },
        { icon: '🦕', label: '1억 년 전', next: 'f_dino_age' },
        { icon: '🍭', label: '과자 행성', next: 'e_candy' }
      ] },
    f_dino_age: { type: 'fail', art: 'f_dino_age', title: '1억 년 전 지구', text: '지구는 맞는데 1억 년 전이었다. 티라노사우루스가 막대맨을 이쑤시개인 줄 알았다.' },

    // ----- 엔딩 -----
    e_hero: { type: 'ending', art: 'e_hero', title: '영웅 귀환 엔딩', text: '운석을 멋지게 피하고 지구에 착륙! 뉴스에 "외계인 우주선을 훔쳐 온 막대맨" 이 나왔다. 우주선은 지금 학교 운동장에 있다.' },
    e_pod: { type: 'ending', art: 'e_pod', title: '탈출 포드 엔딩', text: '포드는 쏜살같이 날아가 집 앞마당에 쿵! 엄마: "숙제는 했니?"' },
    e_vacation: { type: 'ending', art: 'e_vacation', title: '모두 휴가 엔딩', text: '"선장이다. 오늘부터 모두 한 달 휴가!" 외계인들이 신나서 다 떠났다. 텅 빈 우주선은 이제 막대맨 것!' },
    e_friend: { type: 'ending', art: 'e_friend', title: '우주 친구 엔딩', text: '외계인 아기와 함께 포드를 타고 지구로! 둘은 단짝이 되었고, 가끔 아기의 엄마가 우주선을 타고 놀러 온다.' },
    e_home: { type: 'ending', art: 'e_home', title: '집으로 엔딩', text: '선장님이 우주선으로 집 앞까지 데려다줬다. 대신 매주 라면 100개를 우주로 택배 보내기로 했다.' },
    e_parcel: { type: 'ending', art: 'e_parcel', title: '택배 도착 엔딩', text: '띵동! "고객님의 택배가 도착했습니다." 상자를 열자 막대맨이 튀어나왔다. 배송비는 착불이었다.' },
    e_bike: { type: 'ending', art: 'e_bike', title: '우주 라이더 엔딩', text: '닫히는 문 사이로 슝! 우주 오토바이를 타고 지구까지 달렸다. 지금은 우주 배달 라이더로 일한다.' },
    e_tree: { type: 'ending', art: 'e_tree', title: '씨앗 낙하산 엔딩', text: '나무 꼭대기에 커다란 민들레 씨앗이 있었다. 씨앗을 타고 둥실둥실 지구까지 날아왔다. 착지한 곳에서 새 나무가 자랐다.' },
    e_warp: { type: 'ending', art: 'e_warp', title: '순간이동 엔딩', text: '번쩍! 눈을 떠 보니 내 방 침대 위였다. 시계를 보니 학교 가기 5분 전. 꿈이었을까?' },
    e_candy: { type: 'ending', art: 'e_candy', title: '과자 행성 엔딩', text: '산은 초콜릿, 강은 딸기 우유, 구름은 솜사탕! 막대맨은 과자 행성의 왕이 되었다. 치과는 없다.' },
    e_captain: { type: 'ending', art: 'e_captain', title: '막대 선장 엔딩', text: '"좋다! 오늘부터 네가 선장이다!" 막대맨 선장의 첫 명령: "모두 지구로! 그리고 라면 파티!"' },
    e_homework: { type: 'ending', art: 'e_homework', title: '숙제 해방 엔딩', text: '선장님이 외계인 숙제 기계를 선물했다. 막대맨은 지구에 돌아와 평생 숙제 걱정 없이 살았다. (선생님은 아직 모른다.)' },
    e_ramen: { type: 'ending', art: 'e_ramen', title: '우주 라면 사장님 엔딩', text: '"막대 라면" 우주 1호점 개업! 은하계 최고 맛집이 되어 손님이 줄을 선다. 주말엔 지구 집에도 간다.' }
  };

  var ENDING_IDS = Object.keys(NODES).filter(function (id) { return NODES[id].type === 'ending'; });
  var FAIL_IDS = Object.keys(NODES).filter(function (id) { return NODES[id].type === 'fail'; });

  // ----- 진행 규칙 -----
  function create() {
    return { node: START, lastChoice: START, path: [] };
  }

  function current(state) { return NODES[state.node]; }

  // 선택지 i를 고른다. 바뀐 장면 id를 돌려준다.
  function choose(state, i) {
    var node = current(state);
    if (node.type !== 'choice' || !node.choices[i]) return state.node;
    state.lastChoice = state.node;
    state.path.push(state.node + ':' + i);
    state.node = node.choices[i].next;
    return state.node;
  }

  function timeout(state) {
    var node = current(state);
    if (node.type !== 'choice' || !node.timeout) return state.node;
    state.lastChoice = state.node;
    state.path.push(state.node + ':timeout');
    state.node = node.timeout;
    return state.node;
  }

  // 실패하면 마지막으로 고르던 장면부터 다시
  function retry(state) {
    state.node = state.lastChoice;
    return state.node;
  }

  var api = { START: START, NODES: NODES, ENDING_IDS: ENDING_IDS, FAIL_IDS: FAIL_IDS, create: create, current: current, choose: choose, timeout: timeout, retry: retry };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.Choice = root.Choice || {}; root.Choice.Story = api; }
})(typeof window !== 'undefined' ? window : this);
