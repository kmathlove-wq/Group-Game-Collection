// ===== data.js =====
// 탐조 여행의 지역·새 자료. 브라우저(window.Birdwatch.Data)와 Node 시험이 함께 쓴다.
// 새 정보는 사람이 직접 적은 사실만 넣는다. 확실하지 않은 칸(천연기념물·멸종위기 등)은 비워 둔다.
//  - size: 몸길이(cm, 부리 끝~꼬리 끝, 도감에 흔히 적힌 값. 암수가 다르면 수컷)
//  - season: 텃새 / 여름철새 / 겨울철새 / 나그네새 (우리나라에서 주로 보이는 모습)
//  - rarity: common(흔함) / normal(보통) / rare(희귀) / legend(전설) — 게임 속 등급
//  - shape: 그림 모양(art.js), look: 몸 색(머리·몸·배·날개·부리·다리)과 무늬
//  - monument: 천연기념물이면 true, endangered: 멸종위기 야생생물 1(Ⅰ급)·2(Ⅱ급), 아니면 0
(function (root) {
  'use strict';

  var SEASONS = ['텃새', '여름철새', '겨울철새', '나그네새'];
  var RARITIES = {
    common: { name: '흔함', points: 10, again: 2, weight: 55, color: '#6c8a5c' },
    normal: { name: '보통', points: 25, again: 5, weight: 30, color: '#2f7bd6' },
    rare: { name: '희귀', points: 60, again: 12, weight: 12, color: '#9b4dca' },
    legend: { name: '전설', points: 150, again: 30, weight: 3, color: '#e8890c' }
  };

  // 모양 → 어디에 나타나는지(앉기·헤엄·서기·땅) — main.js와 시험이 쓴다.
  var SHAPES = {
    song: 'perch', pigeon: 'perch', woodpecker: 'perch', owl: 'perch', raptor: 'perch', kingfisher: 'perch',
    pheasant: 'ground',
    duck: 'water', goose: 'water', swan: 'water', gull: 'water', cormorant: 'water', grebe: 'water',
    heron: 'shore', crane: 'shore', spoonbill: 'shore', stork: 'shore', ibis: 'shore', shore: 'shore'
  };

  // m(무늬 종류, 색): cap 머리꼭대기, cheek 뺨 점, cheekw 흰 뺨, bib 멱(목 앞), mask 눈선, ring 눈테,
  // brow 눈썹, crest 댕기, nape 뒷머리, vent 아랫배, wingbar 날개 무늬, collar 목테, breast 가슴,
  // face 얼굴 맨살, beaktip 부리 끝, shield 이마판, stripe 배 세로줄, tufts 귀깃, tailband 꼬리 띠
  function m(t, c) { return { t: t, c: c }; }
  function look(head, body, belly, wing, beak, leg, marks, extra) {
    var o = { head: head, body: body, belly: belly, wing: wing, beak: beak, leg: leg, marks: marks || [] };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }
  function B(id, name, sci, size, season, rarity, shape, habitat, fact, lk, monument, endangered) {
    return { id: id, name: name, sci: sci, size: size, season: season, rarity: rarity, shape: shape,
      habitat: habitat, fact: fact, look: lk, monument: !!monument, endangered: endangered || 0 };
  }

  var BIRDS = [
    // ---- 마을·공원·숲의 작은 새 ----
    B('sparrow', '참새', 'Passer montanus', 14, '텃새', 'common', 'song', '마을·논밭·공원',
      '뺨에 까만 점이 있고, 사람 사는 곳 가까이에서 무리 지어 살아요.',
      look('#8b4a2b', '#a0703f', '#e8dccb', '#7a5230', '#3a3a3a', '#c9a27a', [m('cheekw', '#f4efe6'), m('cheek', '#222'), m('bib', '#222')])),
    B('magpie', '까치', 'Pica serica', 45, '텃새', 'common', 'song', '마을·공원·농경지',
      '나뭇가지로 크고 둥근 둥지를 지어요. 꼬리가 길고 날개는 파랗게 빛나요.',
      look('#111', '#151515', '#f4f4f4', '#1d3c78', '#111', '#222', [m('wingbar', '#f4f4f4')], { tail: 30, tailColor: '#1a2f5c' })),
    B('dove', '멧비둘기', 'Streptopelia orientalis', 33, '텃새', 'common', 'pigeon', '마을·공원·숲 가장자리',
      "목 옆에 까만 줄무늬가 있고 '구구 구구' 하고 울어요.",
      look('#9a8c8c', '#b08a6e', '#c9aea0', '#8a6a50', '#5b4b4b', '#c0506a', [m('collar', '#3a4256')])),
    B('bulbul', '직박구리', 'Hypsipetes amaurotis', 28, '텃새', 'common', 'song', '공원·숲·정원',
      "'삐이익' 하고 시끄럽게 울고, 꽃꿀과 열매를 좋아해요.",
      look('#8a8f99', '#7b818c', '#a1a6ae', '#6b7079', '#222', '#333', [m('cheek', '#a0522d')], { tail: 20 })),
    B('greattit', '박새', 'Parus minor', 14, '텃새', 'common', 'song', '숲·공원·정원',
      '가슴에 넥타이 같은 까만 세로줄이 있어요.',
      look('#111', '#8a9a7a', '#f2f2f2', '#5d6a72', '#222', '#55607a', [m('cheekw', '#fff'), m('stripe', '#111')])),
    B('marshtit', '쇠박새', 'Poecile palustris', 12, '텃새', 'normal', 'song', '숲·공원',
      '머리꼭대기가 까맣고, 박새와 달리 가슴에 긴 넥타이 무늬가 없어요.',
      look('#ebe7df', '#a39a8c', '#ece6da', '#8a8174', '#222', '#55607a', [m('cap', '#111'), m('bib', '#111')])),
    B('parrotbill', '붉은머리오목눈이', 'Sinosuthora webbiana', 13, '텃새', 'common', 'song', '덤불·갈대밭',
      "'뱁새'라고도 불러요. 덤불 속에서 여럿이 몰려다녀요.",
      look('#b5683f', '#a77c5a', '#e0c7a8', '#8f5f3e', '#7a6a5a', '#a08070', [], { tail: 22, beakType: 'stubby' })),
    B('longtail', '오목눈이', 'Aegithalos caudatus', 14, '텃새', 'normal', 'song', '숲·공원',
      '꼬리가 아주 길고, 털 뭉치처럼 동글동글해요.',
      look('#f8f8f8', '#d8b4b8', '#fbf6f6', '#2b2b2b', '#222', '#333', [m('mask', '#222')], { tail: 28, tailColor: '#222', beakType: 'stubby' })),
    B('redstart', '딱새', 'Phoenicurus auroreus', 14, '텃새', 'normal', 'song', '마을·공원·숲 가장자리',
      '수컷은 배가 주황색이고 날개에 흰 점이 있어요. 꼬리를 바르르 떨어요.',
      look('#c8c8c8', '#333', '#e8762b', '#2a2a2a', '#111', '#222', [m('mask', '#151515'), m('bib', '#151515'), m('wingbar', '#fff')], { tailColor: '#d9692a' })),
    B('gswoodpecker', '오색딱다구리', 'Dendrocopos major', 23, '텃새', 'normal', 'woodpecker', '숲·공원',
      '아랫배가 빨갛고 수컷은 뒷머리도 빨개요. 부리로 나무를 두드려 벌레를 찾아요.',
      look('#111', '#1b1b1b', '#f0ece4', '#151515', '#333', '#555', [m('cheekw', '#f6f3ee'), m('nape', '#d62828'), m('vent', '#e03131'), m('wingbar', '#fff')])),
    B('kestrel', '황조롱이', 'Falco tinnunculus', 33, '텃새', 'rare', 'raptor', '도시·농경지·강가',
      '하늘에서 날갯짓하며 한자리에 떠 있다가 내리꽂아 쥐를 잡아요.',
      look('#8f99a6', '#b5643c', '#f1d8b8', '#a85a34', '#333', '#f2c94c', [m('mask', '#2b2b2b'), m('tailband', '#222')], { tailColor: '#8f99a6' }), true),
    B('pygmywoodpecker', '쇠딱다구리', 'Yungipicus kizuki', 15, '텃새', 'normal', 'woodpecker', '숲·공원',
      '우리나라 딱다구리 가운데 가장 작아요.',
      look('#7a6a5a', '#4a3f37', '#e8e2d6', '#3d3530', '#333', '#666', [m('cheekw', '#f2eee6'), m('wingbar', '#fff')])),
    B('azuremagpie', '물까치', 'Cyanopica cyanus', 37, '텃새', 'common', 'song', '공원·마을 숲',
      '머리는 까맣고 날개와 긴 꼬리는 하늘색이에요. 시끄럽게 무리 지어 다녀요.',
      look('#111', '#b9b2a8', '#e7e2da', '#79aee0', '#111', '#222', [], { tail: 30, tailColor: '#79aee0' })),
    B('greywoodpecker', '청딱다구리', 'Picus canus', 30, '텃새', 'normal', 'woodpecker', '숲·공원',
      '몸이 연두색이고 수컷은 이마가 빨개요.',
      look('#8f9a94', '#7ba05b', '#c7d1bf', '#6c9a4a', '#3a3a3a', '#6b7d6b', [m('cap', '#d62828'), m('mask', '#333')])),
    B('spotbill', '흰뺨검둥오리', 'Anas zonorhyncha', 61, '텃새', 'common', 'duck', '하천·호수·논',
      '부리 끝이 노랗고, 우리나라에서 가장 흔한 텃새 오리예요.',
      look('#d6c7a8', '#4a3a2e', '#5a4838', '#3d3027', '#222', '#f08c00', [m('mask', '#2b2b2b'), m('beaktip', '#f5c400'), m('wingbar', '#2f5fb0')])),
    B('mandarin', '원앙', 'Aix galericulata', 45, '텃새', 'rare', 'duck', '숲속 계곡·호수',
      '수컷은 주황색 돛 모양 깃이 있어 아주 화려해요. 나무 구멍에 둥지를 틀어요.',
      look('#e0832f', '#6b3a4e', '#f2f0ea', '#c46a1f', '#d62828', '#e9a23b', [m('crest', '#3d6b4f'), m('brow', '#ffffff'), m('cap', '#3d6b4f'), m('wingbar', '#e8862a')]), true),
    B('hawkowl', '솔부엉이', 'Ninox japonica', 29, '여름철새', 'rare', 'owl', '숲·공원의 큰 나무',
      "귀깃이 없는 작은 올빼미로, 밤에 '호-호' 하고 울어요.",
      look('#5a3f2e', '#5e4332', '#e9dcc6', '#4d3526', '#222', '#e8c96a', [m('stripe', '#6b4a33')], { eye: '#f5c400' }), true),
    B('oriole', '꾀꼬리', 'Oriolus chinensis', 26, '여름철새', 'normal', 'song', '숲·공원',
      '온몸이 샛노랗고 눈에 까만 띠가 있어요. 목소리가 아주 고와요.',
      look('#f6c90e', '#f2c20c', '#f9d84a', '#222', '#e75480', '#555', [m('mask', '#111')], { tailColor: '#222' })),

    // ---- 호수·저수지·늪 ----
    B('mallard', '청둥오리', 'Anas platyrhynchos', 59, '겨울철새', 'common', 'duck', '호수·하천·논',
      '수컷 머리는 초록빛으로 반짝이고, 집오리의 조상이에요.',
      look('#1f6b3a', '#9a9a9a', '#c9c9c9', '#7a6a5a', '#e5c33a', '#f08c00', [m('collar', '#ffffff'), m('breast', '#6b3d2e'), m('wingbar', '#3b4bb0')])),
    B('teal', '쇠오리', 'Anas crecca', 37, '겨울철새', 'common', 'duck', '호수·하천·논',
      '몸집이 작은 오리예요. 수컷 머리는 밤색에 눈 뒤로 초록 띠가 있어요.',
      look('#8b3a1f', '#9aa0a6', '#e8e1cf', '#7d8287', '#222', '#555', [m('mask', '#1f6b3a'), m('wingbar', '#2f8a4a')])),
    B('coot', '물닭', 'Fulica atra', 39, '겨울철새', 'common', 'grebe', '호수·저수지',
      '온몸이 까맣고 부리와 이마판이 하얘요. 발가락에 넓적한 판이 있어요.',
      look('#111', '#222', '#2b2b2b', '#1a1a1a', '#f4f4f4', '#7a9a4a', [m('shield', '#f4f4f4')], { eye: '#c62828' })),
    B('greyheron', '왜가리', 'Ardea cinerea', 94, '여름철새', 'common', 'heron', '하천·논·호숫가',
      '긴 목을 움츠리고 물가에 가만히 서 있다가 물고기를 잡아요.',
      look('#f2f2f2', '#9aa3ab', '#e8eaec', '#7a8590', '#e9b949', '#c9a24a', [m('crest', '#111'), m('mask', '#111')], { neckColor: '#e6e8ea' })),
    B('whooper', '큰고니', 'Cygnus cygnus', 152, '겨울철새', 'rare', 'swan', '호수·강 하구',
      '온몸이 하얗고, 부리 뿌리 쪽 노란 부분이 넓어요.',
      look('#fbfbfb', '#fbfbfb', '#f2f2f2', '#f4f4f4', '#f5c400', '#222', [m('beaktip', '#111')]), true, 2),
    B('whitenapedcrane', '재두루미', 'Grus vipio', 127, '겨울철새', 'rare', 'crane', '논·강가·습지',
      '눈 둘레가 빨갛고, 목 뒤로 하얀 줄이 있어요.',
      look('#f2f2f2', '#6f7883', '#5d6670', '#b8bec5', '#c9b07a', '#e17b8a', [m('face', '#d62828')], { neckColor: '#eeeeee' }), true, 2),
    B('eurospoonbill', '노랑부리저어새', 'Platalea leucorodia', 86, '겨울철새', 'rare', 'spoonbill', '갯벌·호수·습지',
      '주걱 같은 부리 끝이 노래요. 부리를 물속에서 좌우로 저으며 먹이를 찾아요.',
      look('#fbfbfb', '#fbfbfb', '#f4f4f4', '#f6f6f6', '#2b2b2b', '#222', [m('beaktip', '#f5c400'), m('crest', '#f2e6c9')], { neckColor: '#fbfbfb' }), true, 2),
    B('littlegrebe', '논병아리', 'Tachybaptus ruficollis', 26, '텃새', 'normal', 'grebe', '호수·저수지·하천',
      '작고 동그란 물새로, 놀라면 물속으로 쏙 잠수해요.',
      look('#3b2f2a', '#5a4636', '#6a5040', '#4d3a2c', '#222', '#333', [m('cheek', '#a8432a'), m('beaktip', '#f2e14c')])),

    // ---- 깊은 산 ----
    B('variedtit', '곤줄박이', 'Sittiparus varius', 14, '텃새', 'common', 'song', '산·숲',
      '배가 주황빛 밤색이고, 사람 손에 놓인 땅콩도 받아 가요.',
      look('#efe6cf', '#7f8790', '#c96b2e', '#6e757d', '#222', '#55607a', [m('cap', '#222'), m('bib', '#222')])),
    B('nuthatch', '동고비', 'Sitta europaea', 14, '텃새', 'normal', 'song', '산·숲',
      '나무줄기를 머리부터 거꾸로 타고 내려올 수 있어요.',
      look('#7c8fa3', '#7c8fa3', '#efe6dc', '#6c7d90', '#333', '#8a7a6a', [m('mask', '#111'), m('vent', '#c5732f')], { tail: 8, beakType: 'dagger', bl: 11 })),
    B('jay', '어치', 'Garrulus glandarius', 34, '텃새', 'normal', 'song', '산·숲',
      '날개에 파란 줄무늬가 있고, 도토리를 땅에 묻어 숨겨 두어요.',
      look('#c79a7a', '#c9a48a', '#e5d1c0', '#5a5a5a', '#333', '#c9a59a', [m('cheek', '#111'), m('wingbar', '#3a7bd5')], { tailColor: '#222', tail: 18 })),
    B('yellowthroat', '노랑턱멧새', 'Emberiza elegans', 16, '텃새', 'common', 'song', '산기슭·숲 가장자리',
      '노란 눈썹과 노란 턱, 뾰족한 머리깃이 있어요.',
      look('#222', '#a07a52', '#f2ebe0', '#8a6440', '#555', '#c9a27a', [m('crest', '#222'), m('brow', '#f5d000'), m('bib', '#f5d000'), m('breast', '#222')])),
    B('pheasant', '꿩', 'Phasianus colchicus', 80, '텃새', 'normal', 'pheasant', '산기슭·풀밭·밭',
      "수컷을 '장끼', 암컷을 '까투리'라고 불러요.",
      look('#1f5b3a', '#b5652b', '#8a4a1f', '#a0866a', '#e8d9a8', '#8a8a8a', [m('face', '#d62828'), m('collar', '#ffffff')], { tail: 46, tailColor: '#8f7a55' })),
    B('bluefly', '큰유리새', 'Cyanoptila cyanomelana', 16, '여름철새', 'normal', 'song', '산골짜기 숲',
      '수컷은 등이 파랗게 빛나고, 산골짜기에서 아름답게 노래해요.',
      look('#3a7be0', '#2a5cb8', '#f4f4f4', '#2453a8', '#222', '#333', [m('bib', '#111')])),
    B('wren', '굴뚝새', 'Troglodytes troglodytes', 10, '텃새', 'normal', 'song', '산골짜기·덤불',
      '아주 작고, 짧은 꼬리를 위로 바짝 치켜들고 있어요.',
      look('#6b4a33', '#6b4a33', '#8a6a50', '#5a3e2b', '#444', '#a08070', [m('brow', '#c9b39a')], { tail: 9, tailUp: true, beakType: 'dagger', bl: 8 })),
    B('wbwoodpecker', '큰오색딱다구리', 'Dendrocopos leucotos', 28, '텃새', 'rare', 'woodpecker', '깊은 산 숲',
      '오색딱다구리보다 크고, 가슴에 까만 세로줄 무늬가 있어요.',
      look('#111', '#151515', '#f1ece2', '#151515', '#333', '#555', [m('cheekw', '#f6f3ee'), m('cap', '#d62828'), m('stripe', '#333'), m('vent', '#f08080'), m('wingbar', '#fff')])),
    B('blackwoodpecker', '까막딱다구리', 'Dryocopus martius', 46, '텃새', 'rare', 'woodpecker', '깊은 산 숲',
      '온몸이 까맣고 수컷은 머리꼭대기가 빨개요. 아주 큰 딱다구리예요.',
      look('#111', '#111', '#151515', '#0d0d0d', '#d8d0b8', '#555', [m('cap', '#d62828')], { eye: '#f2f2e8' }), true, 2),
    B('scopsowl', '소쩍새', 'Otus sunia', 20, '여름철새', 'rare', 'owl', '산·숲',
      "밤에 '소쩍 소쩍' 하고 우는 작은 올빼미예요.",
      look('#8a7a68', '#8a7a68', '#b0a08a', '#6e604f', '#444', '#9a8a78', [m('tufts', '#8a7a68'), m('stripe', '#5a4a3a')], { eye: '#f5c400' }), true),

    // ---- 들판·하늘 ----
    B('wfgoose', '쇠기러기', 'Anser albifrons', 72, '겨울철새', 'common', 'goose', '논·호수·강 하구',
      '이마가 하얗고, 배에 까만 가로무늬가 있어요.',
      look('#6b5a4a', '#7a6a5a', '#bfb4a6', '#6a5a4c', '#f0a3b0', '#f08c00', [m('shield', '#ffffff'), m('stripe', '#222')])),
    B('buzzard', '말똥가리', 'Buteo japonicus', 52, '겨울철새', 'normal', 'raptor', '논밭·산기슭',
      '넓은 날개로 하늘을 빙빙 돌며 들쥐를 찾아요.',
      look('#d8c3a0', '#7a5a3e', '#e8d8bc', '#6a4a30', '#333', '#f2c94c', [m('vent', '#5a3a22')])),
    B('cinereousvulture', '독수리', 'Aegypius monachus', 102, '겨울철새', 'rare', 'raptor', '논밭·넓은 들',
      '죽은 동물을 먹는 청소부 새예요. 날개를 펴면 2.5m가 넘어요.',
      look('#6a5a52', '#3a302b', '#3a302b', '#2f2723', '#333', '#c9c0b0', [m('collar', '#2a221e')]), true, 2),
    B('wteagle', '흰꼬리수리', 'Haliaeetus albicilla', 85, '겨울철새', 'legend', 'raptor', '강 하구·호수·바닷가',
      '어른 새는 꼬리가 하얗고 부리가 노래요. 물고기와 물새를 잡아요.',
      look('#d9c9a8', '#6b4a30', '#5a3e28', '#5a3e28', '#f5c400', '#f5c400', [], { tailColor: '#ffffff' }), true, 1),
    B('redcrane', '두루미', 'Grus japonensis', 140, '겨울철새', 'legend', 'crane', '논·강가·습지',
      "머리꼭대기에 빨간 맨살이 있어 '단정학'이라고도 불러요.",
      look('#111', '#ffffff', '#fbfbfb', '#ffffff', '#a0a090', '#333', [m('cap', '#d62828'), m('tailband', '#111')], { neckColor: '#151515' }), true, 1),

    // ---- 늪·갈대밭 ----
    B('moorhen', '쇠물닭', 'Gallinula chloropus', 33, '여름철새', 'normal', 'grebe', '늪·연못·논',
      '빨간 이마판과 끝이 노란 부리가 있어요.',
      look('#2b2b33', '#3a3a40', '#3d3d45', '#4b4a3a', '#d62828', '#c4d14a', [m('shield', '#d62828'), m('beaktip', '#f5d000'), m('wingbar', '#ffffff')])),
    B('greategret', '중대백로', 'Ardea alba', 90, '여름철새', 'common', 'heron', '논·하천·습지',
      '온몸이 하얗고 목이 S자로 길어요. 여름에는 부리가 까매져요.',
      look('#ffffff', '#ffffff', '#f6f6f6', '#fbfbfb', '#2b2b2b', '#222', [], { neckColor: '#ffffff' })),
    B('kingfisher', '물총새', 'Alcedo atthis', 17, '여름철새', 'normal', 'kingfisher', '하천·연못·저수지',
      '물속으로 총알처럼 뛰어들어 물고기를 잡아요.',
      look('#1f7fa8', '#2aa7c9', '#e8762b', '#1e7a9e', '#222', '#e05a3a', [m('cheek', '#e8762b'), m('bib', '#ffffff')], { tail: 6, beakType: 'dagger', bl: 16 })),
    B('reedwarbler', '개개비', 'Acrocephalus orientalis', 18, '여름철새', 'normal', 'song', '갈대밭',
      "갈대 꼭대기에서 '개개개 비비' 하고 시끄럽게 울어요.",
      look('#9a8466', '#9a8466', '#e9dcc5', '#87714f', '#555', '#9a8a78', [m('brow', '#e9dcc5')], { beakType: 'dagger', bl: 9 })),
    B('crestedibis', '따오기', 'Nipponia nippon', 76, '텃새', 'legend', 'ibis', '논·늪·숲',
      '우리나라에서 사라졌다가, 우포늪에서 복원해 다시 자연으로 날려 보냈어요.',
      look('#f3e2e0', '#f3e2e0', '#f6ecea', '#f2b8a8', '#2b2b2b', '#d62828', [m('face', '#d62828'), m('crest', '#efd9d4'), m('beaktip', '#d62828')], { neckColor: '#f3e2e0' }), true, 2),
    B('swallow', '제비', 'Hirundo rustica', 18, '여름철새', 'common', 'song', '마을·논밭',
      '처마 밑에 진흙으로 둥지를 짓고, 꼬리 끝이 깊게 갈라져 있어요.',
      look('#1a2a5a', '#1a2a5a', '#f2ece0', '#14214a', '#111', '#222', [m('bib', '#b5372a')], { tail: 22, fork: true })),

    // ---- 갯벌·바닷가 ----
    B('shelduck', '혹부리오리', 'Tadorna tadorna', 62, '겨울철새', 'normal', 'duck', '갯벌·강 하구',
      '수컷의 빨간 부리 위에는 혹이 볼록 솟아 있어요.',
      look('#1f4a35', '#ffffff', '#fbfbfb', '#111', '#d62828', '#e88a9a', [m('breast', '#b5652b'), m('shield', '#d62828')])),
    B('dunlin', '민물도요', 'Calidris alpina', 19, '겨울철새', 'common', 'shore', '갯벌·강 하구',
      '갯벌에서 수백 마리가 한꺼번에 날아올라 방향을 바꾸며 날아요.',
      look('#a8a39a', '#a8a39a', '#f2f2f2', '#8d877e', '#222', '#222', [], { beakType: 'down', bl: 13 })),
    B('farcurlew', '알락꼬리마도요', 'Numenius madagascariensis', 61, '나그네새', 'rare', 'shore', '갯벌',
      '아래로 휜 아주 긴 부리로 갯벌 속 게를 잡아요.',
      look('#9a7a55', '#8a6a48', '#c9ab84', '#7a5a3a', '#3a2a20', '#6b7a8a', [m('stripe', '#7a5a3a')], { beakType: 'down', bl: 30, legs: 20 }), false, 2),
    B('hoodedcrane', '흑두루미', 'Grus monacha', 100, '겨울철새', 'rare', 'crane', '논·갯벌',
      '몸은 검은 잿빛이고 목과 머리는 하얘요. 순천만에서 겨울을 나요.',
      look('#ffffff', '#4a4e57', '#4a4e57', '#3d4149', '#c9b07a', '#333', [m('cap', '#d62828')], { neckColor: '#f6f6f6' }), true, 2),
    B('oystercatcher', '검은머리물떼새', 'Haematopus ostralegus', 45, '텃새', 'rare', 'shore', '갯벌·바닷가',
      '길고 빨간 부리로 조개 껍데기를 비틀어 열어 먹어요.',
      look('#111', '#111', '#ffffff', '#111', '#e8590c', '#f2a0a0', [m('wingbar', '#ffffff')], { bl: 20, eye: '#d62828' }), true, 2),
    B('blacktailgull', '괭이갈매기', 'Larus crassirostris', 46, '텃새', 'common', 'gull', '바닷가·섬',
      "고양이처럼 '야옹' 하고 울어요. 꼬리 끝에 까만 띠가 있어요.",
      look('#ffffff', '#ffffff', '#ffffff', '#5a6370', '#f5d000', '#f5d000', [m('beaktip', '#d62828'), m('tailband', '#111')])),
    B('blackheadgull', '붉은부리갈매기', 'Chroicocephalus ridibundus', 40, '겨울철새', 'common', 'gull', '강 하구·바닷가·호수',
      '부리와 다리가 빨개요. 겨울에는 눈 뒤에 까만 점이 생겨요.',
      look('#ffffff', '#ffffff', '#ffffff', '#c0c8d0', '#d62828', '#d62828', [m('cheek', '#333'), m('tailband', '#222')])),
    B('cormorant', '민물가마우지', 'Phalacrocorax carbo', 80, '겨울철새', 'normal', 'cormorant', '강·호수·바닷가',
      '물속을 헤엄쳐 물고기를 잡고, 젖은 날개를 쫙 펴서 말려요.',
      look('#111', '#1b1b1b', '#111', '#2f2a20', '#444', '#222', [m('cheekw', '#ffffff'), m('face', '#f5c400')], { eye: '#1f8a5a' })),
    B('littletern', '쇠제비갈매기', 'Sternula albifrons', 28, '여름철새', 'normal', 'gull', '강 하구·모래밭',
      '이마가 하얗고 부리가 노래요. 모래밭에 알을 낳아요.',
      look('#ffffff', '#ffffff', '#ffffff', '#d0d6dc', '#f5d000', '#f5a000', [m('cap', '#111'), m('shield', '#ffffff')], { fork: true })),
    B('pintail', '고방오리', 'Anas acuta', 75, '겨울철새', 'normal', 'duck', '호수·강 하구·논',
      '수컷은 꼬리가 바늘처럼 길고 목이 가늘어요.',
      look('#5a3a2a', '#a6a9ad', '#fbfbfb', '#8a8d90', '#6b7d8a', '#555', [m('collar', '#ffffff'), m('breast', '#ffffff')], { tail: 20, tailColor: '#222' })),
    B('osprey', '물수리', 'Pandion haliaetus', 55, '나그네새', 'rare', 'raptor', '강 하구·호수·바닷가',
      '물 위를 날다가 발부터 물속으로 내리꽂아 물고기를 잡아요.',
      look('#ffffff', '#4a3626', '#ffffff', '#3e2e20', '#222', '#c9ced4', [m('mask', '#3a2a1e'), m('breast', '#8a6a4a')]), false, 2),
    B('littleegret', '쇠백로', 'Egretta garzetta', 61, '여름철새', 'common', 'heron', '논·하천·갯벌',
      '부리와 다리는 까맣고 발가락만 노래요.',
      look('#ffffff', '#ffffff', '#f6f6f6', '#fbfbfb', '#111', '#111', [m('crest', '#ffffff')], { neckColor: '#ffffff', feet: '#f5d000' })),
    B('curlew', '마도요', 'Numenius arquata', 57, '나그네새', 'normal', 'shore', '갯벌',
      '아래로 휜 긴 부리를 가졌고, 날 때 보이는 허리가 하얘요.',
      look('#b0956e', '#a08660', '#e8dcc6', '#8f7552', '#3a2a20', '#6b7a8a', [m('stripe', '#8f7552')], { beakType: 'down', bl: 26, legs: 18 })),
    B('godwit', '큰뒷부리도요', 'Limosa lapponica', 39, '나그네새', 'normal', 'shore', '갯벌',
      '부리가 살짝 위로 휘었어요. 쉬지 않고 1만 km 넘게 날아간 기록이 있어요.',
      look('#c0884f', '#9a8466', '#c97f45', '#8a7458', '#e8a0a0', '#333', [m('beaktip', '#222')], { beakType: 'up', bl: 22, legs: 16 })),
    B('chineseegret', '노랑부리백로', 'Egretta eulophotes', 65, '여름철새', 'rare', 'heron', '갯벌·바닷가 섬',
      '여름에는 부리가 노랗고 뒷머리에 긴 장식깃이 생겨요.',
      look('#ffffff', '#ffffff', '#f6f6f6', '#fbfbfb', '#f5c400', '#222', [m('crest', '#ffffff')], { neckColor: '#ffffff', feet: '#f5d000' }), true, 1),
    B('bfspoonbill', '저어새', 'Platalea minor', 76, '여름철새', 'legend', 'spoonbill', '갯벌·강 하구',
      '얼굴이 까맣고 주걱 같은 부리를 가졌어요. 세계에 수천 마리밖에 없어요.',
      look('#fbfbfb', '#fbfbfb', '#f4f4f4', '#f6f6f6', '#222', '#222', [m('face', '#111'), m('crest', '#f2e6c9')], { neckColor: '#fbfbfb' }), true, 1),
    B('spoonsandpiper', '넓적부리도요', 'Calidris pygmaea', 15, '나그네새', 'legend', 'shore', '갯벌',
      '부리 끝이 숟가락처럼 넓적해요. 세계에 아주 조금만 남은 귀한 새예요.',
      look('#c26b3a', '#7a6a5a', '#f4f0ea', '#6a5a4a', '#222', '#222', [], { beakType: 'spoon', bl: 9, legs: 9 }), false, 1),

    // ---- 철새 무리·귀한 손님 ----
    B('baikalteal', '가창오리', 'Sibirionetta formosa', 40, '겨울철새', 'rare', 'duck', '호수·저수지·논',
      "수십만 마리가 저녁 하늘에서 춤추듯 함께 나는 '군무'로 유명해요.",
      look('#f2d24a', '#9a8f88', '#e0d8cc', '#8a7d70', '#333', '#777', [m('cap', '#2b2b2b'), m('mask', '#1f6b3a'), m('breast', '#b07a5a')])),
    B('orientalstork', '황새', 'Ciconia boyciana', 112, '겨울철새', 'legend', 'stork', '논·습지·강가',
      '다리와 눈 둘레가 빨개요. 충남 예산에서 복원해 자연으로 날려 보내고 있어요.',
      look('#ffffff', '#ffffff', '#fbfbfb', '#222', '#222', '#d62828', [m('ring', '#d62828')], { neckColor: '#ffffff' }), true, 1),
    B('swangoose', '개리', 'Anser cygnoides', 87, '겨울철새', 'rare', 'goose', '강 하구·갯벌',
      '부리가 까맣고 길며, 중국 집거위의 조상이에요.',
      look('#f0e8dc', '#8a7560', '#e2d6c6', '#73604c', '#111', '#f08c00', [m('cap', '#6b4a33')], { neckColor: '#efe6d8' }), true, 2),
    B('whiteeye', '동박새', 'Zosterops japonicus', 12, '텃새', 'normal', 'song', '남부 지방·제주의 숲과 정원',
      '눈 둘레에 하얀 테가 있고, 동백꽃 꿀을 좋아해요.',
      look('#9bbf3a', '#8fb33a', '#e6e2d6', '#7da02e', '#333', '#667', [m('ring', '#ffffff'), m('bib', '#e9d84a')], { beakType: 'dagger', bl: 8 })),
    B('shoveler', '넓적부리', 'Spatula clypeata', 50, '겨울철새', 'normal', 'duck', '호수·저수지·늪',
      '부리가 넓적한 주걱 모양이라 물을 걸러 먹이를 먹어요.',
      look('#1f6b3a', '#8a5030', '#b5562b', '#4a5f80', '#222', '#f08c00', [m('breast', '#ffffff')], { beakType: 'wide' }))
  ];

  // 지역: scene = 배경 모양(art.js), water = 물이 있는지, cost = 여는 값(0이면 처음부터 열림)
  var REGIONS = [
    { id: 'park', name: '동네 공원', place: '우리 동네', scene: 'park', water: false, cost: 0, emoji: '🌳',
      desc: '사람 가까이 사는 텃새를 만나요. 탐조의 첫걸음!',
      birds: ['sparrow', 'magpie', 'dove', 'bulbul', 'greattit', 'parrotbill', 'redstart', 'gswoodpecker', 'pygmywoodpecker', 'kestrel'] },
    { id: 'seoulforest', name: '서울숲', place: '서울 성동구', scene: 'pond', water: true, cost: 0, emoji: '🌲',
      desc: '한강과 중랑천이 만나는 곳에 있는 큰 도시 숲이에요.',
      birds: ['magpie', 'bulbul', 'marshtit', 'longtail', 'azuremagpie', 'greywoodpecker', 'spotbill', 'mandarin', 'oriole', 'hawkowl'] },
    { id: 'junam', name: '주남저수지', place: '경남 창원', scene: 'lake', water: true, cost: 0, emoji: '🦢',
      desc: '겨울마다 큰고니와 재두루미가 찾아오는 저수지예요.',
      birds: ['mallard', 'spotbill', 'teal', 'coot', 'greyheron', 'littlegrebe', 'whooper', 'whitenapedcrane', 'eurospoonbill'] },
    { id: 'jirisan', name: '지리산', place: '경남·전남·전북', scene: 'mountain', water: false, cost: 150, emoji: '⛰️',
      desc: '1967년에 우리나라 첫 번째 국립공원이 된 깊은 산이에요.',
      birds: ['variedtit', 'yellowthroat', 'nuthatch', 'jay', 'pheasant', 'bluefly', 'wren', 'wbwoodpecker', 'blackwoodpecker', 'scopsowl'] },
    { id: 'cheorwon', name: '철원 DMZ', place: '강원 철원', scene: 'field', water: true, cost: 250, emoji: '🌾',
      desc: '비무장지대 가까운 넓은 논에서 두루미가 겨울을 나요.',
      birds: ['wfgoose', 'mallard', 'yellowthroat', 'pheasant', 'buzzard', 'whitenapedcrane', 'cinereousvulture', 'wteagle', 'redcrane'] },
    { id: 'upo', name: '우포늪', place: '경남 창녕', scene: 'marsh', water: true, cost: 300, emoji: '🪷',
      desc: '우리나라에서 가장 큰 자연 내륙 습지예요. 따오기를 복원하는 곳이에요.',
      birds: ['greyheron', 'greategret', 'swallow', 'moorhen', 'littlegrebe', 'kingfisher', 'reedwarbler', 'whooper', 'eurospoonbill', 'crestedibis'] },
    { id: 'suncheon', name: '순천만', place: '전남 순천', scene: 'mudflat', water: true, cost: 400, emoji: '🌾',
      desc: '넓은 갈대밭과 갯벌에 흑두루미가 겨울을 나러 와요.',
      birds: ['parrotbill', 'spotbill', 'greyheron', 'dunlin', 'reedwarbler', 'shelduck', 'farcurlew', 'oystercatcher', 'hoodedcrane'] },
    { id: 'nakdong', name: '낙동강 하구', place: '부산', scene: 'coast', water: true, cost: 450, emoji: '🌊',
      desc: '강물과 바닷물이 만나는 곳이라 철새가 아주 많이 모여요.',
      birds: ['blacktailgull', 'blackheadgull', 'cormorant', 'littletern', 'pintail', 'whooper', 'oystercatcher', 'osprey', 'wteagle'] },
    { id: 'hwaseong', name: '화성호', place: '경기 화성', scene: 'mudflat', water: true, cost: 550, emoji: '🦩',
      desc: '넓은 갯벌에서 먼 길을 가는 도요새들이 쉬어 가요.',
      birds: ['littleegret', 'greategret', 'dunlin', 'curlew', 'godwit', 'farcurlew', 'chineseegret', 'bfspoonbill', 'spoonsandpiper'] },
    { id: 'cheonsu', name: '천수만', place: '충남 서산·홍성', scene: 'field', water: true, cost: 650, emoji: '🌅',
      desc: '가창오리 수십만 마리가 펼치는 저녁 군무로 유명해요.',
      birds: ['wfgoose', 'mallard', 'baikalteal', 'buzzard', 'whooper', 'hoodedcrane', 'eurospoonbill', 'wteagle', 'orientalstork'] },
    { id: 'geolmae', name: '걸매리 갯벌', place: '서해안 갯벌', scene: 'mudflat', water: true, cost: 750, emoji: '🦀',
      desc: '물이 빠지면 드러나는 넓은 갯벌로 저어새가 먹이를 찾으러 와요.',
      birds: ['blacktailgull', 'littleegret', 'greategret', 'farcurlew', 'oystercatcher', 'chineseegret', 'swangoose', 'bfspoonbill'] },
    { id: 'hado', name: '하도리 철새도래지', place: '제주 제주시 구좌읍', scene: 'coast', water: true, cost: 900, emoji: '🏝️',
      desc: '제주 동쪽 바닷가의 철새도래지로, 저어새가 겨울을 나요.',
      birds: ['bulbul', 'whiteeye', 'spotbill', 'coot', 'shoveler', 'pintail', 'osprey', 'eurospoonbill', 'bfspoonbill'] }
  ];

  var byId = {};
  BIRDS.forEach(function (b) { byId[b.id] = b; });
  var regionById = {};
  REGIONS.forEach(function (r) { regionById[r.id] = r; });

  var api = { SEASONS: SEASONS, RARITIES: RARITIES, SHAPES: SHAPES, BIRDS: BIRDS, REGIONS: REGIONS,
    bird: function (id) { return byId[id] || null; },
    region: function (id) { return regionById[id] || null; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.Birdwatch = root.Birdwatch || {}; root.Birdwatch.Data = api; }
})(typeof window !== 'undefined' ? window : this);
