// ===== story.js =====
// 초이스 게임 "막대맨 우주 대탈출"의 이야기 지도와 진행 규칙(화면을 모름). 브라우저(window.Choice.Story)와 Node 시험이 함께 쓴다.
// 장면(node) 종류: choice(선택지) · fail(실패 장면, 다시 하기는 마지막 선택 장면으로) · ending(엔딩).
// choice 장면에 timer(초)가 있으면 그 안에 못 고를 때 timeout 장면으로 간다.
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
        { icon: '😴', label: '일단 한숨 자기', next: 'f_sleep' }
      ] },
    f_spoon: { type: 'fail', art: 'f_spoon', title: '3년 동안 팠다', text: '숟가락으로 철판 바닥을 3년 동안 팠다. 뚫고 내려가 보니… 아래층은 외계인 화장실이었다.' },
    f_phone: { type: 'fail', art: 'f_phone', title: '숙제는 했니?', text: '"엄마 나 우주선에 갇혔어!" "숙제는 다 하고 갇힌 거니?" … 통화 요금이 우주 요금으로 나왔다.' },
    f_sleep: { type: 'fail', art: 'f_sleep', title: '푹 잤다', text: '정말 푹 잤다. 일어나 보니 외계인 동물원의 "지구 생물" 전시품이 되어 있었다.' },

    // ----- 2-A. 복도(바나나 길) -----
    hall: { type: 'choice', art: 'hall', text: '바나나 껍질에 경비병이 미끄러지며 열쇠를 떨어뜨렸다! 문을 열고 나왔는데… 순찰 로봇이 다가온다! 빨리!', timer: 3, timeout: 'f_freeze',
      choices: [
        { icon: '📦', label: '상자 속에 숨기', next: 'control' },
        { icon: '🏃', label: '전속력으로 달리기', next: 'f_run' },
        { icon: '🕺', label: '로봇 춤 추기', next: 'f_dance' }
      ] },
    f_freeze: { type: 'fail', art: 'f_freeze', title: '얼음!', text: '너무 놀라서 얼음이 되어 버렸다. 로봇: "땡." … 땡은 없었다.' },
    f_run: { type: 'fail', art: 'f_run', title: '로봇은 바퀴가 있다', text: '열심히 달렸지만 로봇은 바퀴로 시속 200km를 달렸다. 막대맨은 다리가 막대다.' },
    f_dance: { type: 'fail', art: 'f_dance', title: '댄스 배틀', text: '로봇도 같이 춤을 췄다. 너무 잘 춰서 구경 온 경비병 50명에게 둘러싸였다.' },

    // ----- 3. 조종실 -----
    control: { type: 'choice', art: 'control', text: '로봇이 상자를 지나쳤다. 살금살금 들어간 곳은 우주선 조종실! 버튼이 잔뜩 있다.',
      choices: [
        { icon: '🔴', label: '"절대 누르지 마시오" 빨간 버튼', next: 'f_red' },
        { icon: '🟢', label: '초록 버튼', next: 'pods' },
        { icon: '🕹️', label: '조종간 잡기', next: 'pilot' },
        { icon: '📢', label: '방송 마이크', next: 'e_vacation' }
      ] },
    f_red: { type: 'fail', art: 'f_red', title: '누르지 말라니까', text: '"자폭까지 3, 2, 1…" 펑! 누르지 말라는 버튼은 누르지 말자.' },
    pilot: { type: 'choice', art: 'pilot', text: '우주선을 몰고 지구로 출발! 앗, 커다란 운석이 날아온다! 1초 안에 피해!', timer: 1.5, timeout: 'f_rock',
      choices: [
        { icon: '⬅️', label: '왼쪽으로', next: 'e_hero' },
        { icon: '➡️', label: '오른쪽으로', next: 'f_moon' }
      ] },
    f_rock: { type: 'fail', art: 'f_rock', title: '쾅!', text: '운석과 정면으로 부딪혔다. 우주선은 납작한 우주 호떡이 되었다.' },
    f_moon: { type: 'fail', art: 'f_moon', title: '달에 꽂혔다', text: '운석은 피했지만 오른쪽에 달이 있었다. 우주선이 달에 깃발처럼 꽂혔다.' },

    // ----- 4. 탈출 포드 -----
    pods: { type: 'choice', art: 'pods', text: '초록 버튼을 누르자 탈출 포드 보관실 문이 열렸다! 그런데 경보가 울린다!',
      choices: [
        { icon: '🚀', label: '탈출 포드에 타기', next: 'launch' },
        { icon: '🧑‍🚀', label: '우주복 입고 뛰어내리기', next: 'f_float' },
        { icon: '🐙', label: '구석에서 떨고 있는 외계인 아기 데려가기', next: 'e_friend' }
      ] },
    launch: { type: 'choice', art: 'launch', text: '포드 문이 닫히는 중! 발사 버튼을 지금 눌러!', timer: 1.5, timeout: 'f_door',
      choices: [
        { icon: '🔘', label: '발사!', next: 'e_pod' }
      ] },
    f_door: { type: 'fail', art: 'f_door', title: '문이 열린 채로', text: '조금 늦게 눌러서 포드 문이 덜 닫힌 채로 발사됐다. 막대맨은 포드 밖에 매달려 갔다.' },
    f_float: { type: 'fail', art: 'f_float', title: '우주 미아', text: '멋지게 뛰어내렸지만 우주에는 바닥이 없었다. 막대맨은 지금도 빙글빙글 떠다니는 중이다.' },

    // ----- 2-B. 주방(변장 길) -----
    kitchen: { type: 'choice', art: 'kitchen', text: '변장 성공! 경비병이 동료인 줄 알고 문을 열어 줬다. 그런데 주방장이 붙잡는다. "새로 온 요리사지? 손님이 기다려!"',
      choices: [
        { icon: '🍜', label: '지구 라면 끓이기', next: 'captain' },
        { icon: '🙅', label: '"저 요리사 아닌데요"', next: 'f_truth' },
        { icon: '🌶️', label: '아주 매운 소스 듬뿍', next: 'f_spicy' }
      ] },
    f_truth: { type: 'fail', art: 'f_truth', title: '너무 정직했다', text: '정직은 좋은 거지만… 변장이 들통났다. 다시 감옥으로 직행!' },
    f_spicy: { type: 'fail', art: 'f_spicy', title: '불 뿜는 외계인', text: '한 입 먹은 외계인들이 불을 뿜었다. 주방이 홀랑 타고 막대맨 눈썹도 탔다.' },
    captain: { type: 'choice', art: 'captain', text: '라면 냄새에 선장님이 직접 왔다. "이… 이 맛은 뭐지?! 우주 최고야! 소원을 하나 말해라."',
      choices: [
        { icon: '🏠', label: '"집에 보내 주세요"', next: 'e_home' },
        { icon: '🤝', label: '"우주 라면 가게를 차려 주세요"', next: 'e_ramen' },
        { icon: '💨', label: '대답 대신 방귀', next: 'f_fart' }
      ] },
    f_fart: { type: 'fail', art: 'f_fart', title: '뿡', text: '외계인에게 방귀는 "전쟁을 선포한다"는 뜻이었다. 우주 전쟁이 시작될 뻔했다.' },

    // ----- 엔딩 -----
    e_hero: { type: 'ending', art: 'e_hero', title: '영웅 귀환 엔딩', text: '운석을 멋지게 피하고 지구에 착륙! 뉴스에 "외계인 우주선을 훔쳐 온 막대맨" 이 나왔다. 우주선은 지금 학교 운동장에 있다.' },
    e_pod: { type: 'ending', art: 'e_pod', title: '탈출 포드 엔딩', text: '포드는 쏜살같이 날아가 집 앞마당에 쿵! 엄마: "숙제는 했니?"' },
    e_vacation: { type: 'ending', art: 'e_vacation', title: '모두 휴가 엔딩', text: '"선장이다. 오늘부터 모두 한 달 휴가!" 외계인들이 신나서 다 떠났다. 텅 빈 우주선은 이제 막대맨 것!' },
    e_friend: { type: 'ending', art: 'e_friend', title: '우주 친구 엔딩', text: '외계인 아기와 함께 포드를 타고 지구로! 둘은 단짝이 되었고, 가끔 아기의 엄마가 우주선을 타고 놀러 온다.' },
    e_home: { type: 'ending', art: 'e_home', title: '집으로 엔딩', text: '선장님이 우주선으로 집 앞까지 데려다줬다. 대신 매주 라면 100개를 우주로 택배 보내기로 했다.' },
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
