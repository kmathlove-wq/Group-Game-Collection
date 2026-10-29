// ===== species.js =====
// 한국 새 맞히기의 새 목록과 문제 만들기(화면을 모름). 브라우저(window.KoreaBird)와 Node 시험이 함께 쓴다.
// 이름은 국립생물자원관 국가생물종목록의 표준 국명. 사진은 위키미디어 공용의 자유 라이선스 사진(살아 있는 새)을
// 눈으로 확인해 받은 img/<file>.jpg(가로 960px)이고, credit에 '찍은 사람 · 라이선스 · 위키미디어 공용'을 적는다.
// group: 비슷한 무리(오답 보기를 헷갈리게 섞을 때 씀) — small 작은 새, land 숲·마을 새, duck 오리·물새,
//        heron 백로·두루미·황새, shore 바닷가 새, raptor 수리·매·부엉이. where: 우리나라에서 보이는 때(텃새·철새).
(function (root) {
  'use strict';

  var SPECIES = [
    { id: 'chamsae', file: 'chamsae', name: '참새', sci: 'Passer montanus', group: 'small', where: '텃새', credit: 'Laitche · 퍼블릭 도메인 · 위키미디어 공용', hints: [
      '사람 사는 마을 어디서나 가장 흔하게 보이는 작은 갈색 새예요.',
      '하얀 뺨 한가운데에 검은 점이 하나 있어요.',
      '여럿이 무리 지어 "짹짹" 울며 곡식이나 풀씨를 먹어요.'] },
    { id: 'kkachi', file: 'kkachi', name: '까치', sci: 'Pica serica', group: 'land', where: '텃새', credit: 'Yoo Chung · CC BY-SA 2.5 · 위키미디어 공용', hints: [
      '검은색과 흰색이 섞인 몸에 꼬리가 길어요.',
      '옛날부터 반가운 손님이 온다는 소식을 알려 주는 새로 여겨졌어요.',
      '높은 나무 위에 나뭇가지로 커다란 둥지를 지어요.'] },
    { id: 'jikbakguri', file: 'jikbakguri', name: '직박구리', sci: 'Hypsipetes amaurotis', group: 'land', where: '텃새', credit: 'Laitche · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '온몸이 회색빛이고, 뺨에 밤색 무늬가 있어요.',
      '머리 깃털이 부스스하게 서 있어요.',
      '"삐이익 삐이익" 시끄럽게 울고, 겨울에는 감이나 열매를 즐겨 먹어요.'] },
    { id: 'baksae', file: 'baksae', name: '박새', sci: 'Parus minor', group: 'small', where: '텃새', credit: 'Laitche · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '가슴에 넥타이처럼 생긴 검은 세로줄이 있어요.',
      '검은 머리에 하얀 뺨이 눈에 잘 띄어요.',
      '"쯔쯔삐 쯔쯔삐" 하고 울며 공원과 숲에 흔해요.'] },
    { id: 'metbidulgi', file: 'metbidulgi', name: '멧비둘기', sci: 'Streptopelia orientalis', group: 'land', where: '텃새', credit: 'J. Patrick Fischer · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '"구구 구구" 하고 낮은 소리로 울어요.',
      '목 옆에 검은색과 푸른빛 줄무늬가 있어요.',
      '날개 깃털 끝이 주황빛이라 비늘처럼 보여요.'] },
    { id: 'cheongdung', file: 'cheongdung', name: '청둥오리', sci: 'Anas platyrhynchos', group: 'duck', where: '겨울 철새', credit: 'Richard Bartz · CC BY-SA 2.5 · 위키미디어 공용', hints: [
      '수컷은 머리가 반짝이는 초록색이고 목에 하얀 띠가 있어요.',
      '부리가 노란색이고 다리는 주황색이에요.',
      '집에서 기르는 오리의 조상이에요.'] },
    { id: 'waegari', file: 'waegari', name: '왜가리', sci: 'Ardea cinerea', group: 'heron', where: '여름 철새(일부 텃새)', credit: 'Giacomo Cimino · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '우리나라에서 볼 수 있는 가장 큰 회색 물새 중 하나예요.',
      '머리 뒤에 검은 댕기 깃털이 길게 나 있어요.',
      '물가에 가만히 서 있다가 긴 부리로 물고기를 잡아요.'] },
    { id: 'jungdaebaekro', file: 'jungdaebaekro', name: '중대백로', sci: 'Ardea alba', group: 'heron', where: '여름 철새', credit: 'Chuck Homler · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '온몸이 새하얀 커다란 물새예요.',
      '목이 아주 길고, 몸을 쭉 펴면 S자 모양이 돼요.',
      '다리와 발이 모두 검은색이에요.'] },
    { id: 'soebaekro', file: 'soebaekro', name: '쇠백로', sci: 'Egretta garzetta', group: 'heron', where: '여름 철새(일부 텃새)', credit: 'Shantanu Kuveskar · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '하얀 물새 중에서 작은 편이에요.',
      '부리와 다리는 검은데, 발가락만 노란색이에요.',
      '노란 발로 물을 휘저어 숨은 물고기를 몰아내요.'] },
    { id: 'mulchongsae', file: 'mulchongsae', name: '물총새', sci: 'Alcedo atthis', group: 'land', where: '여름 철새', credit: 'Tony Wood · CC BY 2.0 · 위키미디어 공용', hints: [
      '등은 반짝이는 파란색, 배는 주황색이에요.',
      '몸은 작은데 부리가 크고 길어요.',
      '물 위로 총알처럼 다이빙해서 물고기를 잡아요.'] },
    { id: 'ttaksae', file: 'ttaksae', name: '딱새', sci: 'Phoenicurus auroreus', group: 'small', where: '텃새', credit: 'Laitche · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '수컷은 머리가 은회색이고 배가 주황색이에요.',
      '검은 날개에 하얀 점이 하나씩 있어요.',
      '"딱딱" 소리를 내면서 꼬리를 바르르 떨어요.'] },
    { id: 'osaek', file: 'osaek', name: '오색딱다구리', sci: 'Dendrocopos major', group: 'land', where: '텃새', credit: 'Charles J. Sharp · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '검은색·흰색 몸에 아랫배가 빨간색이에요.',
      '나무줄기를 부리로 "따다닥" 쪼아 구멍을 뚫어요.',
      '수컷은 뒤통수에 빨간 점이 있어요.'] },
    { id: 'wonang', file: 'wonang', name: '원앙', sci: 'Aix galericulata', group: 'duck', where: '텃새·겨울 철새', credit: 'Francis C. Franklin · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '수컷은 주황색 깃털이 돛처럼 솟아 있어 아주 화려해요.',
      '암컷은 회갈색이고 눈 뒤에 흰 줄이 있어요.',
      '사이좋은 부부를 이 새에 빗대어 말하기도 해요.'] },
    { id: 'durumi', file: 'durumi', name: '두루미', sci: 'Grus japonensis', group: 'heron', where: '겨울 철새', credit: 'Alastair Rae from London, United Kingdom · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '머리 꼭대기에 빨간 피부가 동그랗게 드러나 있어요.',
      '몸은 하얗고 목과 날개 끝이 검은색이에요.',
      '옛 그림에 오래 사는 새로 자주 나오고, 강원도 철원에서 겨울을 나요.'] },
    { id: 'jaedurumi', file: 'jaedurumi', name: '재두루미', sci: 'Antigone vipio', group: 'heron', where: '겨울 철새', credit: 'Spaceaero2 · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '몸이 회색이고, 눈 둘레가 빨간색이에요.',
      '목 뒤쪽에 하얀 줄이 길게 내려와요.',
      '겨울에 한강 하구나 철원 들판에서 볼 수 있어요.'] },
    { id: 'heukdurumi', file: 'heukdurumi', name: '흑두루미', sci: 'Grus monacha', group: 'heron', where: '겨울 철새', credit: 'Alastair Rae from London, United Kingdom · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '몸은 거무스름한 회색이고 머리와 목은 하얘요.',
      '키가 1m쯤으로 두루미 무리 중 작은 편이에요.',
      '겨울에 전라남도 순천만에 많이 찾아와요.'] },
    { id: 'hwangsae', file: 'hwangsae', name: '황새', sci: 'Ciconia boyciana', group: 'heron', where: '겨울 철새(드묾)', credit: 'Christoph Moning · CC BY 4.0 · 위키미디어 공용', hints: [
      '몸은 하얗고 날개 끝이 검은색이에요.',
      '크고 굵은 검은 부리와 빨간 다리를 가졌어요.',
      '우리나라에서 한때 사라져서 지금은 다시 살리려고 애쓰고 있어요.'] },
    { id: 'jeoeosae', file: 'jeoeosae', name: '저어새', sci: 'Platalea minor', group: 'heron', where: '여름 철새', credit: 'Cp9asngf · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '부리 끝이 주걱처럼 넓적하고 검은색이에요.',
      '부리와 얼굴이 검고 몸은 하얘요.',
      '부리를 물속에 넣고 좌우로 휘저으며 먹이를 찾아요.'] },
    { id: 'huinppyam', file: 'huinppyam', name: '흰뺨검둥오리', sci: 'Anas zonorhyncha', group: 'duck', where: '텃새', credit: 'Alpsdake · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '검은 부리 끝이 노란색이에요.',
      '얼굴이 희끄무레하고 눈을 지나는 검은 줄이 있어요.',
      '암수 생김새가 비슷하고, 도시 하천에서 1년 내내 볼 수 있어요.'] },
    { id: 'keungoni', file: 'keungoni', name: '큰고니', sci: 'Cygnus cygnus', group: 'duck', where: '겨울 철새', credit: 'Andreas Trepte · CC BY-SA 2.5 · 위키미디어 공용', hints: [
      '온몸이 하얀 아주 큰 물새예요.',
      '노란 부리 끝이 검은색이에요.',
      '겨울에 강원도 경포호나 낙동강 하구에 무리로 와요.'] },
    { id: 'hokgoni', file: 'hokgoni', name: '혹고니', sci: 'Cygnus olor', group: 'duck', where: '겨울 철새(드묾)', credit: 'Sanchezn · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '하얀 몸에 주황색 부리를 가졌어요.',
      '부리 위쪽 이마에 검은 혹이 튀어나와 있어요.',
      '헤엄칠 때 날개를 살짝 부풀려 우아하게 떠다녀요.'] },
    { id: 'doksuri', file: 'doksuri', name: '독수리', sci: 'Aegypius monachus', group: 'raptor', where: '겨울 철새', credit: 'Tisha Mukherjee · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '날개를 펴면 2.5m가 넘는 아주 큰 새예요.',
      '온몸이 검은 갈색이고 머리에는 깃털이 적어요.',
      '사냥보다 죽은 동물을 먹어 자연을 깨끗하게 해요.'] },
    { id: 'suribueong', file: 'suribueong', name: '수리부엉이', sci: 'Bubo bubo', group: 'raptor', where: '텃새', credit: 'Martin Mecnarowski · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '우리나라에서 가장 큰 부엉이예요.',
      '머리 위에 귀처럼 생긴 깃털이 쫑긋 서 있어요.',
      '커다란 주황색 눈으로 밤에 사냥해요.'] },
    { id: 'sojjeok', file: 'sojjeok', name: '소쩍새', sci: 'Otus sunia', group: 'raptor', where: '여름 철새', credit: 'JJ Harrison · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '손바닥만 한 작은 올빼미 무리예요.',
      '머리에 짧은 귀깃이 있어요.',
      '밤에 "소쩍 소쩍" 하고 울어요.'] },
    { id: 'kkoekkori', file: 'kkoekkori', name: '꾀꼬리', sci: 'Oriolus chinensis', group: 'land', where: '여름 철새', credit: 'J.M.Garg · CC BY 3.0 · 위키미디어 공용', hints: [
      '온몸이 샛노란 색이라 눈에 확 띄어요.',
      '눈을 지나 뒤통수까지 검은 띠가 있어요.',
      '목소리가 아주 고와서 노래 잘하는 사람에 빗대어 말해요.'] },
    { id: 'jebi', file: 'jebi', name: '제비', sci: 'Hirundo rustica', group: 'small', where: '여름 철새', credit: 'Andreas Trepte · CC BY-SA 2.5 · 위키미디어 공용', hints: [
      '이마와 목이 붉은 갈색이고 등은 남색이에요.',
      '꼬리가 가위처럼 길게 둘로 갈라져 있어요.',
      '봄에 남쪽에서 와서 집 처마 밑에 진흙 둥지를 지어요.'] },
    { id: 'hututi', file: 'hututi', name: '후투티', sci: 'Upupa epops', group: 'land', where: '여름 철새', credit: 'Greg Schechter from San Francisco, USA · CC BY 2.0 · 위키미디어 공용', hints: [
      '머리에 부채처럼 펼쳐지는 주황색 깃이 있어요.',
      '날개에 검은색과 흰색 줄무늬가 있어요.',
      '가늘고 휘어진 긴 부리로 땅속 벌레를 꺼내 먹어요.'] },
    { id: 'keunburi', file: 'keunburi', name: '큰부리까마귀', sci: 'Corvus macrorhynchos', group: 'land', where: '텃새', credit: 'Laitche · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '온몸이 새까만 큰 새예요.',
      '부리가 아주 굵고, 이마가 툭 튀어나와 있어요.',
      '머리가 아주 좋은 새로 유명해요.'] },
    { id: 'eochi', file: 'eochi', name: '어치', sci: 'Garrulus glandarius', group: 'land', where: '텃새', credit: 'Luc Viatour · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '날개에 파란색·검은색 줄무늬가 있어요.',
      '몸은 분홍빛이 도는 갈색이에요.',
      '도토리를 땅에 숨겨 두었다가 겨울에 꺼내 먹어요.'] },
    { id: 'dongbak', file: 'dongbak', name: '동박새', sci: 'Zosterops japonicus', group: 'small', where: '텃새', credit: 'Laitche · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '몸이 연두색인 아주 작은 새예요.',
      '눈 둘레에 하얀 테두리가 동그랗게 있어요.',
      '동백꽃 꿀을 좋아해서 남쪽 바닷가에 많아요.'] },
    { id: 'gonjul', file: 'gonjul', name: '곤줄박이', sci: 'Sittiparus varius', group: 'small', where: '텃새', credit: 'Laitche · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '배와 등이 주황빛 밤색이에요.',
      '머리는 검고, 이마와 뺨은 크림색이에요.',
      '사람을 잘 따라서 손바닥에 놓인 땅콩을 먹기도 해요.'] },
    { id: 'noranteok', file: 'noranteok', name: '노랑턱멧새', sci: 'Emberiza elegans', group: 'small', where: '텃새', credit: 'Alpsdake · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '수컷은 머리 깃이 뾰족 서 있어요.',
      '눈썹과 턱이 노란색이에요.',
      '가슴에 검은 삼각형 무늬가 있고, 숲 가장자리에 흔해요.'] },
    { id: 'ttaekkachi', file: 'ttaekkachi', name: '때까치', sci: 'Lanius bucephalus', group: 'land', where: '텃새', credit: 'Alpsdake · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '머리가 주황빛 갈색이고 눈에 검은 띠가 있어요.',
      '부리 끝이 갈고리처럼 휘었어요.',
      '잡은 벌레나 개구리를 나뭇가지 가시에 꽂아 두는 버릇이 있어요.'] },
    { id: 'gamaguji', file: 'gamaguji', name: '민물가마우지', sci: 'Phalacrocorax carbo', group: 'shore', where: '텃새·겨울 철새', credit: 'MPF · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '온몸이 검고 부리 끝이 갈고리처럼 휘었어요.',
      '물속으로 잠수해서 물고기를 잡아요.',
      '날개가 잘 젖어서 바위에 앉아 날개를 펴고 말려요.'] },
    { id: 'gwaengi', file: 'gwaengi', name: '괭이갈매기', sci: 'Larus crassirostris', group: 'shore', where: '텃새', credit: 'MaedaAkihiko · CC0 · 위키미디어 공용', hints: [
      '우는 소리가 고양이 울음과 비슷해요.',
      '노란 부리 끝에 빨간색과 검은색 점이 있어요.',
      '하얀 꼬리 끝에 검은 띠가 있고, 독도에 많이 살아요.'] },
    { id: 'geomeunmeori', file: 'geomeunmeori', name: '검은머리물떼새', sci: 'Haematopus ostralegus', group: 'shore', where: '텃새', credit: 'Andreas Trepte · CC BY-SA 2.5 · 위키미디어 공용', hints: [
      '머리와 등이 검고 배가 하얀 바닷가 새예요.',
      '길고 곧은 주황색 부리를 가졌어요.',
      '부리로 굴이나 조개를 비틀어 열어 먹어요.'] },
    { id: 'ppeokkugi', file: 'ppeokkugi', name: '뻐꾸기', sci: 'Cuculus canorus', group: 'land', where: '여름 철새', credit: 'Andy Morffew from Itchen Abbas, Hampshire, UK · CC BY 2.0 · 위키미디어 공용', hints: [
      '자기 이름과 똑같은 소리로 울어요.',
      '회색 몸에 배에는 가로 줄무늬가 있어요.',
      '다른 새 둥지에 몰래 알을 낳아 대신 키우게 해요.'] },
    { id: 'horangjippagwi', file: 'horangjippagwi', name: '호랑지빠귀', sci: 'Zoothera aurea', group: 'land', where: '여름 철새', credit: 'Charles Lam from Hong Kong, China · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '온몸이 노란빛 갈색에 검은 비늘 무늬로 덮여 있어요.',
      '밤에 "히이-" 하는 쓸쓸한 휘파람 소리로 울어요.',
      '숲 바닥에서 지렁이를 찾아 먹어요.'] },
    { id: 'gaettong', file: 'gaettong', name: '개똥지빠귀', sci: 'Turdus eunomus', group: 'land', where: '겨울 철새', credit: 'Forest Botial-Jarvis · CC BY 4.0 · 위키미디어 공용', hints: [
      '하얀 눈썹선이 뚜렷해요.',
      '날개는 붉은 갈색이고, 가슴에 검은 반점이 많아요.',
      '겨울에 무리로 와서 나무 열매를 먹어요.'] },
    { id: 'milhwa', file: 'milhwa', name: '밀화부리', sci: 'Eophona migratoria', group: 'small', where: '겨울 철새', credit: 'Zinogre · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '아주 굵고 노란 부리를 가졌어요.',
      '수컷은 머리가 검은 두건을 쓴 것 같아요.',
      '굵은 부리로 딱딱한 나무 씨앗을 깨 먹어요.'] },
    { id: 'hwangjorongi', file: 'hwangjorongi', name: '황조롱이', sci: 'Falco tinnunculus', group: 'raptor', where: '텃새', credit: 'Andreas Trepte · CC BY-SA 2.5 · 위키미디어 공용', hints: [
      '등이 붉은 갈색이고 까만 점무늬가 있는 작은 매예요.',
      '하늘 한자리에 날개를 파닥이며 멈춰 떠 있을 수 있어요.',
      '도시 아파트 화분에 둥지를 틀기도 해요.'] },
    { id: 'malttong', file: 'malttong', name: '말똥가리', sci: 'Buteo japonicus', group: 'raptor', where: '겨울 철새', credit: 'NOZO · CC BY 3.0 · 위키미디어 공용', hints: [
      '몸이 통통한 갈색 맹금(사냥하는 새)이에요.',
      '넓은 날개를 펴고 하늘을 빙빙 돌며 들쥐를 찾아요.',
      '겨울 논밭 전봇대 위에 자주 앉아 있어요.'] },
    { id: 'kkwong', file: 'kkwong', name: '꿩', sci: 'Phasianus colchicus', group: 'land', where: '텃새', credit: 'Estormiz · CC0 · 위키미디어 공용', hints: [
      '수컷은 얼굴이 빨갛고 목에 하얀 띠가 있어요.',
      '수컷은 장끼, 암컷은 까투리라고 불러요.',
      '꼬리가 아주 길고, 땅 위를 잘 걸어 다녀요.'] },
    { id: 'mulkkachi', file: 'mulkkachi', name: '물까치', sci: 'Cyanopica cyanus', group: 'land', where: '텃새', credit: 'Zinogre · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '머리는 검은 모자를 쓴 것 같아요.',
      '날개와 긴 꼬리가 하늘색이에요.',
      '여러 마리가 시끄럽게 떼 지어 다녀요.'] },
    { id: 'cheongttak', file: 'cheongttak', name: '청딱다구리', sci: 'Picus canus', group: 'land', where: '텃새', credit: 'Dion Art · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '몸이 연두빛 회색인 딱다구리예요.',
      '수컷은 이마에만 빨간 점이 있어요.',
      '나무를 쪼기도 하지만 땅에 내려와 개미도 잘 먹어요.'] },
    { id: 'soettak', file: 'soettak', name: '쇠딱다구리', sci: 'Yungipicus kizuki', group: 'land', where: '텃새', credit: 'Laitche · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '참새만 한 아주 작은 딱다구리예요.',
      '갈색 바탕에 흰 가로줄 무늬가 있어요.',
      '나무줄기를 빙글빙글 돌며 올라가요.'] },
    { id: 'nonbyeongari', file: 'nonbyeongari', name: '논병아리', sci: 'Tachybaptus ruficollis', group: 'duck', where: '텃새', credit: 'Andreas Trepte · CC BY-SA 2.5 · 위키미디어 공용', hints: [
      '몸이 작고 동글동글해서 꼭 병아리 같아요.',
      '여름에는 목이 붉은 밤색이 돼요.',
      '위험하면 물속으로 쏙 잠수해 사라져요.'] },
    { id: 'muldak', file: 'muldak', name: '물닭', sci: 'Fulica atra', group: 'duck', where: '겨울 철새(일부 텃새)', credit: 'Alexis Lours · CC BY 4.0 · 위키미디어 공용', hints: [
      '온몸이 까만 물새예요.',
      '부리와 이마가 하얀색이에요.',
      '발가락에 넓적한 판이 있어 헤엄을 잘 쳐요.'] },
    { id: 'biori', file: 'biori', name: '비오리', sci: 'Mergus merganser', group: 'duck', where: '겨울 철새', credit: 'Bengt Nyman from Vaxholm, Sweden · CC BY 2.0 · 위키미디어 공용', hints: [
      '수컷은 머리가 초록빛 검은색이고 몸은 하얀색이에요.',
      '빨갛고 가는 부리 끝이 갈고리 모양이에요.',
      '잠수해서 물고기를 잡는 오리예요.'] },
    { id: 'hosabiori', file: 'hosabiori', name: '호사비오리', sci: 'Mergus squamatus', group: 'duck', where: '겨울 철새(드묾)', credit: 'BS Thurner Hof · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '옆구리에 비늘 같은 무늬가 있어요.',
      '수컷은 뒤통수에 긴 댕기 깃털이 있어요.',
      '아주 귀해서 천연기념물로 보호하는 오리예요.'] },
    { id: 'palsaekjo', file: 'palsaekjo', name: '팔색조', sci: 'Pitta nympha', group: 'land', where: '여름 철새', credit: 'Alnus · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '여러 가지 색이 섞여 아주 알록달록해요.',
      '어깨는 파랗고 아랫배는 빨간색이에요.',
      '제주도와 남해안 숲에 사는 귀한 새예요.'] },
    { id: 'chammae', file: 'chammae', name: '참매', sci: 'Accipiter gentilis', group: 'raptor', where: '겨울 철새', credit: 'Norbert Kenntner, Berlin · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '가슴에 가는 회색 가로줄 무늬가 빽빽해요.',
      '눈 위에 하얀 눈썹선이 있어요.',
      '옛날 사람들이 꿩 사냥에 쓰던 날쌘 사냥꾼이에요.'] },
    { id: 'huinkkori', file: 'huinkkori', name: '흰꼬리수리', sci: 'Haliaeetus albicilla', group: 'raptor', where: '겨울 철새', credit: 'Bengt Nyman from Vaxholm, Sweden · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '날개를 펴면 2m가 넘는 큰 수리예요.',
      '어른 새는 꼬리가 하얀색이에요.',
      '겨울 바닷가나 큰 강에서 물고기를 잡아요.'] },
    { id: 'chamsuri', file: 'chamsuri', name: '참수리', sci: 'Haliaeetus pelagicus', group: 'raptor', where: '겨울 철새(드묾)', credit: 'Michael Pinczolits · CC BY 2.0 · 위키미디어 공용', hints: [
      '아주 크고 두꺼운 노란 부리를 가졌어요.',
      '어깨와 꼬리가 하얗고 나머지는 검은 갈색이에요.',
      '세계에서 가장 무거운 수리 중 하나예요.'] },
    { id: 'bulgeunmeori', file: 'bulgeunmeori', name: '붉은머리오목눈이', sci: 'Sinosuthora webbiana', group: 'small', where: '텃새', credit: 'Alnus · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '머리와 날개가 붉은 갈색인 아주 작은 새예요.',
      '부리가 짧고 동그래요.',
      '흔히 "뱁새"라고 불러요.'] },
    { id: 'omokuni', file: 'omokuni', name: '오목눈이', sci: 'Aegithalos caudatus', group: 'small', where: '텃새', credit: 'jasonalexander · CC BY 4.0 · 위키미디어 공용', hints: [
      '몸은 동그랗고 꼬리가 아주 길어요.',
      '눈 위로 굵은 검은 줄이 지나가요.',
      '여러 마리가 함께 나무 사이를 재빨리 옮겨 다녀요.'] },
    { id: 'soebaksae', file: 'soebaksae', name: '쇠박새', sci: 'Poecile palustris', group: 'small', where: '텃새', credit: 'Stephan Sprinz · CC BY 4.0 · 위키미디어 공용', hints: [
      '머리가 검은 모자를 쓴 것 같은 작은 새예요.',
      '목 밑에 작은 검은 점이 있어요.',
      '가슴에는 넥타이 무늬가 없어요.'] },
    { id: 'jinbaksae', file: 'jinbaksae', name: '진박새', sci: 'Periparus ater', group: 'small', where: '텃새', credit: 'Alexis Lours · CC BY 4.0 · 위키미디어 공용', hints: [
      '뒤통수에 하얀 줄이 있어요.',
      '날개에 하얀 줄무늬가 두 줄 있어요.',
      '소나무·잣나무 같은 바늘잎나무 숲을 좋아해요.'] },
    { id: 'noranghalmi', file: 'noranghalmi', name: '노랑할미새', sci: 'Motacilla cinerea', group: 'small', where: '여름 철새(일부 텃새)', credit: 'Herwig Winter · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '배가 샛노란색이고 등은 회색이에요.',
      '아주 긴 꼬리를 위아래로 까딱까딱 흔들어요.',
      '맑은 시냇가 돌 위에서 자주 보여요.'] },
    { id: 'hwangro', file: 'hwangro', name: '황로', sci: 'Bubulcus ibis', group: 'heron', where: '여름 철새', credit: 'Kora27 · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '번식할 때 머리와 목이 주황빛으로 물들어요.',
      '하얀 물새 중에서 목이 짧고 부리가 노래요.',
      '소 곁을 따라다니며 놀라서 튀어나온 벌레를 잡아먹어요.'] },
    { id: 'haeoragi', file: 'haeoragi', name: '해오라기', sci: 'Nycticorax nycticorax', group: 'heron', where: '여름 철새', credit: 'ramidos · CC BY 4.0 · 위키미디어 공용', hints: [
      '빨간 눈과 검은 등을 가진 통통한 물새예요.',
      '목이 짧아서 웅크린 것처럼 보여요.',
      '주로 밤과 저녁에 물고기를 잡아요.'] },
    { id: 'parangsae', file: 'parangsae', name: '파랑새', sci: 'Eurystomus orientalis', group: 'land', where: '여름 철새', credit: 'anukma · CC BY 4.0 · 위키미디어 공용', hints: [
      '부리가 빨간색이에요.',
      '날 때 날개에 동그란 흰 무늬가 보여요.',
      '몸은 푸른빛이 도는 짙은 색이고 높은 나무 꼭대기에 앉아요.'] },
    { id: 'huinppyamori', file: 'huinppyamori', name: '흰뺨오리', sci: 'Bucephala clangula', group: 'duck', where: '겨울 철새', credit: 'flickr 사용자 sbern · CC BY 2.0 · 위키미디어 공용', hints: [
      '수컷은 초록빛 검은 머리에 둥근 흰 점이 있어요.',
      '눈이 노란색이에요.',
      '물에 잠수해서 조개나 물벌레를 잡아요.'] },
    { id: 'gobang', file: 'gobang', name: '고방오리', sci: 'Anas acuta', group: 'duck', where: '겨울 철새', credit: 'J.M.Garg · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '수컷은 꼬리가 바늘처럼 가늘고 길어요.',
      '수컷은 초콜릿색 머리에 목을 따라 흰 줄이 있어요.',
      '목이 길고 날씬한 오리예요.'] },
    { id: 'soeori', file: 'soeori', name: '쇠오리', sci: 'Anas crecca', group: 'duck', where: '겨울 철새', credit: 'Charles J. Sharp · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '우리나라 오리 중 가장 작은 편이에요.',
      '수컷은 밤색 머리에 눈 뒤로 초록 띠가 있어요.',
      '꼬리 아래쪽에 노란 삼각형 무늬가 있어요.'] },
    { id: 'neopjeokburi', file: 'neopjeokburi', name: '넓적부리', sci: 'Spatula clypeata', group: 'duck', where: '겨울 철새', credit: 'Charles J. Sharp · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '부리가 아주 크고 넓적해요.',
      '수컷은 머리가 초록색, 옆구리는 밤색, 가슴은 하얀색이에요.',
      '부리로 물 위를 훑어 작은 먹이를 걸러 먹어요.'] },
    { id: 'soegireogi', file: 'soegireogi', name: '쇠기러기', sci: 'Anser albifrons', group: 'duck', where: '겨울 철새', credit: 'Frank Schulenburg · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '부리 둘레의 이마가 하얀색이에요.',
      '배에 검은 가로 줄무늬가 있어요.',
      '가을에 V자 모양으로 줄지어 날아와요.'] },
    { id: 'gaegaebi', file: 'gaegaebi', name: '개개비', sci: 'Acrocephalus orientalis', group: 'small', where: '여름 철새', credit: 'J.M.Garg · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '갈대밭에서 "개개개 비비" 하고 시끄럽게 울어요.',
      '몸 위는 갈색, 아래는 흰빛이에요.',
      '갈대 줄기 꼭대기에 매달려 노래해요.'] },
    { id: 'bangul', file: 'bangul', name: '방울새', sci: 'Chloris sinica', group: 'small', where: '텃새', credit: 'Francesco Veronesi from Italy · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '날 때 날개의 노란 띠가 눈에 띄어요.',
      '분홍빛 굵은 부리를 가졌어요.',
      '"또르르르" 하고 방울 굴러가는 소리로 울어요.'] },
    { id: 'doesae', file: 'doesae', name: '되새', sci: 'Fringilla montifringilla', group: 'small', where: '겨울 철새', credit: 'Pierre Dalous · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '가슴과 어깨가 주황색이에요.',
      '수컷은 머리가 검은색이에요.',
      '겨울에 수천 마리씩 큰 떼를 지어 다니기도 해요.'] },
    { id: 'sangmo', file: 'sangmo', name: '상모솔새', sci: 'Regulus regulus', group: 'small', where: '겨울 철새', credit: 'Francis C. Franklin · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '우리나라에서 가장 작은 새 중 하나예요.',
      '머리 꼭대기에 노란 줄이 있어요.',
      '바늘잎나무 숲에서 쉬지 않고 움직여요.'] },
    { id: 'donggobi', file: 'donggobi', name: '동고비', sci: 'Sitta europaea', group: 'small', where: '텃새', credit: 'Isiwal · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '등은 푸른 회색이고 눈에 검은 줄이 있어요.',
      '나무줄기를 머리가 아래로 향한 채 거꾸로 내려올 수 있어요.',
      '나무 구멍 입구를 진흙으로 좁혀서 둥지를 지어요.'] },
    { id: 'norangburi', file: 'norangburi', name: '노랑부리저어새', sci: 'Platalea leucorodia', group: 'heron', where: '겨울 철새', credit: 'Andreas Trepte · CC BY-SA 2.5 · 위키미디어 공용', hints: [
      '하얀 몸에 숟가락처럼 생긴 긴 부리를 가졌어요.',
      '부리 끝이 노란색이에요.',
      '겨울 갯벌에서 부리를 좌우로 휘저어 먹이를 찾아요.'] },
    { id: 'solbueong', file: 'solbueong', name: '솔부엉이', sci: 'Ninox japonica', group: 'raptor', where: '여름 철새', credit: 'M.Nishimura · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '머리에 귀깃이 없는 동그란 머리예요.',
      '노란 눈이 크고, 가슴에 갈색 세로줄이 있어요.',
      '여름밤에 "후후 후후" 하고 울어요.'] },
    { id: 'keunyuri', file: 'keunyuri', name: '큰유리새', sci: 'Cyanoptila cyanomelana', group: 'small', where: '여름 철새', credit: 'Tokumi Ohsaka · 퍼블릭 도메인 · 위키미디어 공용', hints: [
      '수컷은 등이 반짝이는 파란색이에요.',
      '얼굴과 가슴은 검고 배는 하얀색이에요.',
      '맑은 계곡 근처 숲에서 고운 소리로 노래해요.'] },
    { id: 'huinnunsseop', file: 'huinnunsseop', name: '흰눈썹황금새', sci: 'Ficedula zanthopygia', group: 'small', where: '여름 철새', credit: 'Khoitran1957 · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '수컷은 가슴과 허리가 샛노란 색이에요.',
      '눈 위에 하얀 눈썹이 있어요.',
      '날개에 하얀 무늬가 있고, 나무 구멍에 둥지를 지어요.'] },
    { id: 'mulsuri', file: 'mulsuri', name: '물수리', sci: 'Pandion haliaetus', group: 'raptor', where: '나그네새·겨울 철새', credit: 'Chuck Homler / Focus On Wildlife · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '머리가 하얗고 눈을 지나는 검은 띠가 있어요.',
      '배는 하얗고 등은 짙은 갈색이에요.',
      '물 위로 발부터 뛰어들어 물고기를 잡아요.'] },
    { id: 'jjireuregi', file: 'jjireuregi', name: '찌르레기', sci: 'Spodiopsar cineraceus', group: 'land', where: '여름 철새', credit: '切干大根 · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '부리가 주황색이에요.',
      '얼굴은 하얗고 몸은 회갈색이에요.',
      '떼를 지어 다니며 "찌르르" 하고 울어요.'] },
    { id: 'soemuldak', file: 'soemuldak', name: '쇠물닭', sci: 'Gallinula chloropus', group: 'duck', where: '여름 철새', credit: 'Alexis Lours · CC BY 4.0 · 위키미디어 공용', hints: [
      '이마와 부리가 빨갛고 부리 끝은 노래요.',
      '옆구리에 하얀 줄이 있어요.',
      '꼬리를 까딱이며 연못가 풀숲에서 헤엄쳐요.'] },
    { id: 'kkomamul', file: 'kkomamul', name: '꼬마물떼새', sci: 'Charadrius dubius', group: 'shore', where: '여름 철새', credit: 'Zeynel Cebeci · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '눈 둘레에 노란 테두리가 있어요.',
      '목에 검은 목걸이 같은 띠가 있어요.',
      '자갈밭에 알을 낳는데, 알이 돌처럼 보여 잘 안 보여요.'] },
    { id: 'alrakkkori', file: 'alrakkkori', name: '알락꼬리마도요', sci: 'Numenius madagascariensis', group: 'shore', where: '나그네새', credit: 'JJ Harrison · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '아래로 휘어진 아주 긴 부리를 가졌어요.',
      '온몸이 갈색 얼룩무늬예요.',
      '봄·가을에 서해안 갯벌에 들러 게를 잡아먹어요.'] },
    { id: 'gachang', file: 'gachang', name: '가창오리', sci: 'Sibirionetta formosa', group: 'duck', where: '겨울 철새', credit: 'Sun Jiao (Interaccoonale) · CC BY 4.0 · 위키미디어 공용', hints: [
      '수컷 얼굴에 노란색·초록색 태극 무늬가 있어요.',
      '겨울 저녁 하늘에 수십만 마리가 군무를 펼쳐요.',
      '금강 하구나 천수만에 많이 찾아와요.'] },
    { id: 'soejebi', file: 'soejebi', name: '쇠제비갈매기', sci: 'Sternula albifrons', group: 'shore', where: '여름 철새', credit: 'PetroKaterynych · CC BY 4.0 · 위키미디어 공용', hints: [
      '노란 부리 끝이 검은색이에요.',
      '이마는 하얗고 머리 위는 검은 모자를 쓴 것 같아요.',
      '물 위에서 정지 비행하다가 물속으로 뛰어들어 작은 물고기를 잡아요.'] },
    { id: 'huinbaejippagwi', file: 'huinbaejippagwi', name: '흰배지빠귀', sci: 'Turdus pallidus', group: 'land', where: '나그네새·겨울 철새', credit: 'Francesco Veronesi from Italy · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '머리와 가슴은 회색빛이 도는 갈색이고, 배는 하얗고 부리는 노랗거나 주황빛이에요.',
      '봄가을에 우리나라를 지나가거나 남쪽에서 겨울을 나는 열매 좋아하는 새예요.',
      '땅에서 지렁이를 찾거나 나무 열매를 따 먹어요.'] },
    { id: 'doejippagwi', file: 'doejippagwi', name: '되지빠귀', sci: 'Turdus hortulorum', group: 'land', where: '여름 철새', credit: 'Alnus · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '옆구리가 주황빛이고 등은 회색빛 도는 갈색이에요.',
      '여름에 우리나라 숲에서 새끼를 키우는 철새예요.',
      '밤과 새벽에 "휘이익 휘이익" 하는 구슬픈 소리로 노래해요.'] },
    { id: 'soejjireuregi', file: 'soejjireuregi', name: '쇠찌르레기', sci: 'Agropsar philippensis', group: 'land', where: '여름 철새', credit: 'M.Nishimura · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '날개와 등에서 보랏빛, 초록빛 광택이 번쩍여요.',
      '머리는 크림색이고, 목 뒤에 어두운 무늬가 있어요.',
      '여름에 숲 가장자리나 마을 가까운 나무 구멍에 둥지를 지어요.'] },
    { id: 'hwanggeumsae', file: 'hwanggeumsae', name: '황금새', sci: 'Ficedula narcissina', group: 'small', where: '나그네새', credit: 'Kuribo · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '수컷은 가슴이 짙은 주황빛 도는 노란색이고, 등은 검어요.',
      '날개에 하얀 무늬가 있어서 날 때 눈에 띄어요.',
      '봄가을에 우리나라를 지나가는 아름다운 작은 숲새예요.'] },
    { id: 'jinhonggaseum', file: 'jinhonggaseum', name: '진홍가슴', sci: 'Calliope calliope', group: 'small', where: '나그네새', credit: 'JJ Harrison · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '수컷은 목 한가운데가 불꽃처럼 붉어요.',
      '눈 위아래에 하얀 줄이 선명해요.',
      '덤불 속 땅바닥 가까이에서 살금살금 다니며 곤충을 잡아요.'] },
    { id: 'yuridakssae', file: 'yuridakssae', name: '유리딱새', sci: 'Tarsiger cyanurus', group: 'small', where: '겨울 철새', credit: 'M.Nishimura · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '수컷은 등이 파랗고, 양쪽 옆구리는 주황빛이에요.',
      '겨울에 숲 가장자리나 공원에서 볼 수 있는 작은 새예요.',
      '꼬리를 아래위로 까딱까딱 흔들어요.'] },
    { id: 'geomeundakssae', file: 'geomeundakssae', name: '검은딱새', sci: 'Saxicola stejnegeri', group: 'small', where: '나그네새', credit: 'Mprasannak · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '수컷은 머리가 검고 목에 흰 무늬가 있으며, 가슴은 주황빛이에요.',
      '풀 끝이나 막대기 위에 앉아서 사방을 살펴요.',
      '봄가을에 풀밭과 논밭 주변을 지나가요.'] },
    { id: 'sangdakssae', file: 'sangdakssae', name: '상딱새', sci: 'Muscicapa griseisticta', group: 'small', where: '나그네새', credit: 'Alpsdake · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '가슴과 배에 회색 세로 줄무늬가 있고 몸 전체가 칙칙한 잿빛이에요.',
      '나뭇가지 끝에 앉아 있다가 날아올라 날벌레를 잡고 돌아와요.',
      '봄가을에 우리나라를 잠깐 들렀다 가는 나그네 새예요.'] },
    { id: 'badajikbakguri', file: 'badajikbakguri', name: '바다직박구리', sci: 'Monticola solitarius', group: 'land', where: '텃새', credit: 'jose maria carretero palacios from jerez · CC BY 2.0 · 위키미디어 공용', hints: [
      '수컷은 온몸이 어두운 푸른빛이에요.',
      '바닷가 바위나 절벽, 때로는 건물 지붕 위에 앉아 있어요.',
      '바위 위에서 아름다운 소리로 노래해요.'] },
    { id: 'metsae', file: 'metsae', name: '멧새', sci: 'Emberiza cioides', group: 'small', where: '텃새', credit: 'Alpsdake · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '얼굴에 검은 줄무늬와 흰 줄무늬가 번갈아 있고, 몸은 밤색이에요.',
      '풀씨를 즐겨 먹어서 풀밭과 덤불 가장자리에 많아요.',
      '우리나라 어디서나 사계절 볼 수 있는 텃새예요.'] },
    { id: 'ssuksae', file: 'ssuksae', name: '쑥새', sci: 'Emberiza rustica', group: 'small', where: '겨울 철새', credit: 'Gin tonic · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '수컷은 머리 깃이 뾰족하게 서 있고 얼굴이 검어요.',
      '가슴에 밤색 띠가 있고 배는 하얘요.',
      '겨울에 논밭 주변과 풀숲에서 풀씨를 먹으러 와요.'] },
    { id: 'chuksae', file: 'chuksae', name: '촉새', sci: 'Emberiza spodocephala', group: 'small', where: '겨울 철새', credit: '大家好64 · CC BY 4.0 · 위키미디어 공용', hints: [
      '머리에서 목까지 어두운 잿빛이고, 얼굴에 검은 빛이 돌아요.',
      '등에는 갈색 세로 줄무늬가 있어요.',
      '봄가을에 덤불과 갈대밭을 지나가는 작은 새예요.'] },
    { id: 'geomeunmeoribangul', file: 'geomeunmeoribangul', name: '검은머리방울새', sci: 'Spinus spinus', group: 'small', where: '겨울 철새', credit: 'Charles J. Sharp · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '수컷은 머리 꼭대기가 검고, 온몸이 연두빛 도는 노란색이에요.',
      '겨울에 오리나무나 자작나무 열매를 먹으러 무리 지어 와요.',
      '가는 부리로 작은 씨앗을 쏙쏙 빼 먹어요.'] },
    { id: 'yangjini', file: 'yangjini', name: '양진이', sci: 'Carpodacus roseus', group: 'small', where: '겨울 철새', credit: 'M.Nishimura · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '수컷은 온몸이 장밋빛 붉은색이고, 이마와 턱이 하얗게 반짝여요.',
      '겨울에 산기슭 땅 위에서 풀씨를 쪼아 먹어요.',
      '짧고 두툼한 부리를 가진 통통한 작은 새예요.'] },
    { id: 'kongsae', file: 'kongsae', name: '콩새', sci: 'Coccothraustes coccothraustes', group: 'small', where: '겨울 철새', credit: 'Charles J. Sharp · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '부리가 아주 굵고 두툼해서 딱딱한 씨앗도 깨뜨려 먹어요.',
      '머리는 갈색이고 목에는 회색 띠, 눈앞에는 검은 무늬가 있어요.',
      '겨울에 숲과 공원에서 볼 수 있어요.'] },
    { id: 'hongyeosae', file: 'hongyeosae', name: '홍여새', sci: 'Bombycilla japonica', group: 'small', where: '겨울 철새', credit: 'sunjiao · CC BY 4.0 · 위키미디어 공용', hints: [
      '머리에 뾰족한 댕기가 있고 꼬리 끝이 붉은색이에요.',
      '겨울에 나무 열매를 찾아 무리 지어 다녀요.',
      '눈가에 검은 줄이 있고 날개 끝에 붉은 무늬가 있어요.'] },
    { id: 'hwangyeosae', file: 'hwangyeosae', name: '황여새', sci: 'Bombycilla garrulus', group: 'small', where: '겨울 철새', credit: 'Tatiana Bulyonkova from Novosibirsk, Rus · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '머리에 뾰족한 댕기가 있고, 꼬리 끝은 노란색이에요.',
      '날개에 하얀색과 노란색, 붉은색 무늬가 섞여 있어요.',
      '겨울에 열매가 달린 나무에 무리 지어 날아와요.'] },
    { id: 'gaegaebisachon', file: 'gaegaebisachon', name: '개개비사촌', sci: 'Cisticola juncidis', group: 'small', where: '여름 철새', credit: 'Alexis Lours · CC BY 4.0 · 위키미디어 공용', hints: [
      '몸이 아주 작고, 갈색 몸에 검은 세로 줄무늬가 있어요.',
      '풀밭 위를 높이 날면서 "찌찌찌" 소리를 내요.',
      '논이나 풀밭 같은 탁 트인 곳에서 살아요.'] },
    { id: 'keunosaek', file: 'keunosaek', name: '큰오색딱다구리', sci: 'Dendrocopos leucotos', group: 'land', where: '텃새', credit: 'Alastair Rae · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '나무를 쪼는 다른 새보다 크고, 등 아래쪽이 하얀 바탕에 검은 줄무늬예요.',
      '수컷은 머리 꼭대기가 붉어요.',
      '오래된 숲의 나무줄기를 두드려 구멍을 뚫어요.'] },
    { id: 'kkamakttakdagu', file: 'kkamakttakdagu', name: '까막딱다구리', sci: 'Dryocopus martius', group: 'land', where: '텃새', credit: 'Dion Art · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '온몸이 새까맣고 머리 꼭대기만 붉어요.',
      '나무를 쪼는 새 중에서 가장 커서 까마귀만 해요.',
      '오래된 나무줄기에 큰 구멍을 파서 둥지를 만드는 귀한 새예요.'] },
    { id: 'jongdari', file: 'jongdari', name: '종다리', sci: 'Alauda arvensis', group: 'small', where: '텃새', credit: 'User:Diliff · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '갈색 몸에 검은 줄무늬가 있고, 머리 깃이 살짝 서 있어요.',
      '하늘 높이 떠서 쉬지 않고 계속 노래를 불러요.',
      '풀밭이나 논밭 땅 위에 둥지를 지어요.'] },
    { id: 'alrakhalmisae', file: 'alrakhalmisae', name: '알락할미새', sci: 'Motacilla alba', group: 'small', where: '텃새', credit: 'Jac. Janssen from BAARLO LB, NL · CC BY 2.0 · 위키미디어 공용', hints: [
      '몸이 검고 하얗고 회색이에요. 가슴에 검은 반달 무늬가 있어요.',
      '꼬리가 길고, 걸을 때 꼬리를 위아래로 흔들어요.',
      '강가, 논, 도시의 잔디밭에서도 자주 볼 수 있어요.'] },
    { id: 'gineunkkoridakssae', file: 'gineunkkoridakssae', name: '긴꼬리딱새', sci: 'Terpsiphone atrocaudata', group: 'small', where: '여름 철새', credit: 'Pokopong · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '수컷은 꼬리가 몸보다 훨씬 길고 리본처럼 늘어져요.',
      '머리는 짙은 푸른빛이 도는 검은색이고, 눈 둘레는 파란색이에요.',
      '여름에 울창한 숲에서 새끼를 키우는 철새예요.'] },
    { id: 'chilttaekkachi', file: 'chilttaekkachi', name: '칡때까치', sci: 'Lanius cristatus', group: 'small', where: '여름 철새', credit: 'Tisha Mukherjee · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '등은 갈색이고 눈을 가로지르는 검은 줄이 있어요.',
      '부리 끝이 갈고리처럼 굽은 작은 맹금이에요.',
      '나뭇가지 끝에 앉아 있다가 곤충과 작은 동물을 잡아요.'] },
    { id: 'gulttuksae', file: 'gulttuksae', name: '굴뚝새', sci: 'Troglodytes troglodytes', group: 'small', where: '텃새', credit: 'Alexis Lours · CC BY 4.0 · 위키미디어 공용', hints: [
      '몸이 아주 작고 갈색이며, 꼬리를 위로 바짝 세워요.',
      '몸집에 비해 소리가 아주 크고 맑아요.',
      '숲속 바위틈이나 덤불 아래에서 쪼르르 돌아다녀요.'] },
    { id: 'gwijebi', file: 'gwijebi', name: '귀제비', sci: 'Cecropis daurica', group: 'small', where: '여름 철새', credit: 'Paulclee · CC0 · 위키미디어 공용', hints: [
      '허리가 밤색이고, 꼬리가 아주 길고 갈라져 있어요.',
      '여름에 다리 밑이나 건물에 진흙으로 호리병 모양 둥지를 지어요.',
      '날벌레를 잡으며 빠르게 날아다녀요.'] },
    { id: 'ssokdokssae', file: 'ssokdokssae', name: '쏙독새', sci: 'Caprimulgus indicus', group: 'land', where: '여름 철새', credit: 'Koshy Koshy · CC BY 2.0 · 위키미디어 공용', hints: [
      '밤에 활동하고, 낮에는 나무나 땅 위에서 몸을 낮추고 가만히 있어요.',
      '몸 색이 나뭇가지와 낙엽 같아서 눈에 잘 띄지 않아요.',
      '입이 아주 커서 날아다니는 곤충을 한입에 잡아요.'] },
    { id: 'hobansae', file: 'hobansae', name: '호반새', sci: 'Halcyon coromanda', group: 'land', where: '여름 철새', credit: 'JJ Harrison · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '온몸이 붉은빛 도는 주황색이고, 부리가 빨개요.',
      '여름에 계곡 가까운 숲에서 지내는 철새예요.',
      '"호로로로" 하는 소리로 울어요.'] },
    { id: 'cheonghobansae', file: 'cheonghobansae', name: '청호반새', sci: 'Halcyon pileata', group: 'land', where: '여름 철새', credit: 'Dibyendu Ash · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '머리가 검고 날개는 파란색이에요.',
      '부리가 길고 빨개요.',
      '여름에 강이나 논, 연못 근처에서 물고기와 개구리를 잡아먹어요.'] },
    { id: 'dugyeoni', file: 'dugyeoni', name: '두견이', sci: 'Cuculus poliocephalus', group: 'land', where: '여름 철새', credit: 'Tisha Mukherjee · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '몸이 회색이고 배에 가는 가로줄무늬가 있어요.',
      '여름에 숲에서 "후후후후" 하고 소리를 내요.',
      '다른 새의 둥지에 알을 몰래 낳는 습성이 있어요.'] },
    { id: 'geomeundeungppeokkugi', file: 'geomeundeungppeokkugi', name: '검은등뻐꾸기', sci: 'Cuculus micropterus', group: 'land', where: '여름 철새', credit: 'Creepanta · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '등이 짙은 회색이고 배는 하얀 바탕에 굵은 가로줄이 있어요.',
      '여름 철새이고 "홀딱 벗고" 하는 것처럼 들리는 소리로 울어요.',
      '다른 새의 둥지에 알을 맡겨서 키우게 해요.'] },
    { id: 'saehoragi', file: 'saehoragi', name: '새호리기', sci: 'Falco subbuteo', group: 'raptor', where: '여름 철새', credit: 'Shantanu Kuveskar · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '작은 매로, 날개가 길고 낫처럼 휘었어요.',
      '허벅지가 밤색이에요.',
      '여름에 하늘에서 잠자리와 작은 새를 잡아요.'] },
    { id: 'mae', file: 'mae', name: '매', sci: 'Falco peregrinus', group: 'raptor', where: '텃새', credit: 'Mykola Swarnyk · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '도시 건물 사이에서도 살 만큼 빠르고 강력한 사냥꾼이에요.',
      '등은 푸른 잿빛이고 가슴에는 가로줄무늬가 있어요.',
      '하늘에서 아주 빠른 속도로 내리꽂으며 새를 사냥해요.'] },
    { id: 'solgae', file: 'solgae', name: '솔개', sci: 'Milvus migrans', group: 'raptor', where: '텃새', credit: 'Andreas Trepte · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '몸이 짙은 갈색이고 꼬리가 브이(V)자 모양으로 살짝 갈라져 있어요.',
      '하늘에서 큰 원을 그리며 날아다녀요.',
      '바닷가나 강가에서 물고기와 죽은 동물을 찾아 먹어요.'] },
    { id: 'saemae', file: 'saemae', name: '새매', sci: 'Accipiter nisus', group: 'raptor', where: '겨울 철새', credit: 'Dion Art · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '작은 맹금이고, 몸 아랫면에 가로줄무늬가 있어요.',
      '날개가 짧고 둥글어서 숲속을 재빠르게 누벼요.',
      '작은 새를 사냥해요.'] },
    { id: 'bulgeunbaesaemae', file: 'bulgeunbaesaemae', name: '붉은배새매', sci: 'Accipiter soloensis', group: 'raptor', where: '여름 철새', credit: 'anukma · CC BY 4.0 · 위키미디어 공용', hints: [
      '수컷은 등이 푸른 회색이고, 가슴은 연한 붉은 분홍빛이에요.',
      '여름에 우리나라에서 새끼를 키우는 철새예요.',
      '개구리와 곤충을 잡아먹어요.'] },
    { id: 'beolmae', file: 'beolmae', name: '벌매', sci: 'Pernis ptilorhynchus', group: 'raptor', where: '여름 철새', credit: 'Timothy A. Gonsalves · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '벌의 애벌레를 파먹으려고 땅속 벌집을 파헤쳐요.',
      '몸 색깔이 다양하고, 머리가 작고 목이 길어 보여요.',
      '여름에 우리나라 숲에서 새끼를 키우는 철새예요.'] },
    { id: 'jaetbitgaeguri', file: 'jaetbitgaeguri', name: '잿빛개구리매', sci: 'Circus cyaneus', group: 'raptor', where: '겨울 철새', credit: 'Александр Чегодаев · CC0 · 위키미디어 공용', hints: [
      '수컷은 몸이 연한 잿빛이고 날개 끝이 검어요.',
      '겨울에 넓은 들판과 갈대밭 위를 낮게 날며 사냥해요.',
      '날개를 살짝 브이(V)자로 들고 천천히 날아요.'] },
    { id: 'chikbueong', file: 'chikbueong', name: '칡부엉이', sci: 'Asio otus', group: 'raptor', where: '겨울 철새', credit: 'Francesco Veronesi from Italy · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '머리 위에 길게 솟은 귀 깃이 있어요.',
      '낮에는 나뭇가지에 붙어서 몸을 길쭉하게 세우고 쉬어요.',
      '겨울에 여러 마리가 모여 쉬기도 해요.'] },
    { id: 'soebueong', file: 'soebueong', name: '쇠부엉이', sci: 'Asio flammeus', group: 'raptor', where: '겨울 철새', credit: 'Sumeet Moghe · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '귀 깃이 거의 보이지 않고 노란 눈 둘레에 검은 선이 있어요.',
      '밤새 무리 중에서 드물게 낮에도 활동해요.',
      '겨울에 탁 트인 들판이나 논밭에서 쥐를 사냥해요.'] },
    { id: 'olppaemi', file: 'olppaemi', name: '올빼미', sci: 'Strix uralensis', group: 'raptor', where: '텃새', credit: 'Jyrki Salmi from Finland · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '얼굴이 둥글고 큰 원반처럼 생겼어요.',
      '머리에 귀 깃이 없고 눈은 검고 커요.',
      '우리나라 숲에서 사는 크고 귀한 텃새예요.'] },
    { id: 'meotdoyo', file: 'meotdoyo', name: '멧도요', sci: 'Scolopax rusticola', group: 'shore', where: '나그네새·겨울 철새', credit: 'Ronald Slabke · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '몸이 갈색 낙엽처럼 얼룩덜룩해서 숲속에서 잘 숨어요.',
      '부리가 길고 눈이 머리 위쪽에 있어요.',
      '해질 무렵에 숲 가장자리의 젖은 땅에서 지렁이를 찾아요.'] },
    { id: 'kkaekdoyo', file: 'kkaekdoyo', name: '꺅도요', sci: 'Gallinago gallinago', group: 'shore', where: '나그네새', credit: 'TRinaud · CC BY 4.0 · 위키미디어 공용', hints: [
      '부리가 아주 길고 곧아요.',
      '몸에 갈색과 검은색 줄무늬가 있고 논이나 습지에서 숨어 지내요.',
      '놀라서 날아오를 때 "꺅" 하는 소리를 내요.'] },
    { id: 'alrakdoyo', file: 'alrakdoyo', name: '알락도요', sci: 'Tringa glareola', group: 'shore', where: '나그네새', credit: 'Abdul Momin · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '등에 하얀 점무늬가 가득 있어요.',
      '다리가 가늘고 노란빛이에요.',
      '봄가을에 논이나 갯벌 가까운 물가를 지나가는 새예요.'] },
    { id: 'cheongdaridoyo', file: 'cheongdaridoyo', name: '청다리도요', sci: 'Tringa nebularia', group: 'shore', where: '나그네새', credit: 'Andreas Trepte · CC BY-SA 2.5 · 위키미디어 공용', hints: [
      '발이 연한 초록빛이에요.',
      '부리가 길고 위로 살짝 휘었어요.',
      '봄가을에 갯벌과 논을 지나가면서 작은 물고기를 잡아요.'] },
    { id: 'madoyo', file: 'madoyo', name: '마도요', sci: 'Numenius arquata', group: 'shore', where: '나그네새·겨울 철새', credit: 'Andreas Trepte · CC BY-SA 2.5 · 위키미디어 공용', hints: [
      '부리가 아래로 길게 휘어 있어요.',
      '물가에 오는 새 중 몸집이 큰 편이에요.',
      '갯벌에서 게와 갯지렁이를 잡아먹어요.'] },
    { id: 'keundwitburidoyo', file: 'keundwitburidoyo', name: '큰뒷부리도요', sci: 'Limosa lapponica', group: 'shore', where: '나그네새', credit: 'Andreas Trepte · CC BY-SA 2.5 · 위키미디어 공용', hints: [
      '부리가 길고 끝이 위로 살짝 들려 있어요.',
      '여름 깃털은 몸 아랫면이 붉은 밤색이에요.',
      '봄가을에 바다 갯벌에서 쉬며 먹이를 먹고 아주 먼 곳으로 날아가요.'] },
    { id: 'heukkkoridoyo', file: 'heukkkoridoyo', name: '흑꼬리도요', sci: 'Limosa limosa', group: 'shore', where: '나그네새', credit: 'Andreas Trepte · CC BY-SA 2.5 · 위키미디어 공용', hints: [
      '부리와 다리가 매우 길어요.',
      '꼬리 끝이 검고 날 때 날개에 하얀 줄이 보여요.',
      '봄가을에 갯벌과 논에서 부리를 푹 꽂아 먹이를 찾아요.'] },
    { id: 'huinmulttesae', file: 'huinmulttesae', name: '흰물떼새', sci: 'Charadrius alexandrinus', group: 'shore', where: '여름 철새', credit: 'Davidvraju · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '가슴 양옆에 검은 점이 있고, 배가 하얘요.',
      '해안가 모래밭이나 갯벌의 땅 위에 둥지를 지어요.',
      '아주 빠르게 종종걸음으로 달려요.'] },
    { id: 'jangdarimulttesae', file: 'jangdarimulttesae', name: '장다리물떼새', sci: 'Himantopus himantopus', group: 'shore', where: '나그네새', credit: 'Charles J. Sharp · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '발이 분홍빛이고 몸에 비해 아주 길어요.',
      '검은 날개에 몸은 하얗고 부리가 가늘고 뾰족해요.',
      '논과 갯벌의 얕은 물에서 긴 발로 성큼성큼 걸어요.'] },
    { id: 'dwitburijangdarimulttesae', file: 'dwitburijangdarimulttesae', name: '뒷부리장다리물떼새', sci: 'Recurvirostra avosetta', group: 'shore', where: '나그네새', credit: 'Andreas Trepte · CC BY-SA 2.5 · 위키미디어 공용', hints: [
      '검정과 하양이 선명하고, 부리가 위로 휘어 올라가 있어요.',
      '부리를 좌우로 휘저으면서 물속 먹이를 훑어 먹어요.',
      '갯벌과 습지에 무리 지어 살아요.'] },
    { id: 'kkapjakdoyo', file: 'kkapjakdoyo', name: '깝작도요', sci: 'Actitis hypoleucos', group: 'shore', where: '나그네새', credit: 'JJ Harrison · CC BY 3.0 · 위키미디어 공용', hints: [
      '몸이 갈색이고 배는 하얀 작은 새예요.',
      '꼬리를 깝죽깝죽 위아래로 흔들며 걸어요.',
      '강가와 물가 자갈밭에서 곤충을 잡아먹어요.'] },
    { id: 'daenggimulttesae', file: 'daenggimulttesae', name: '댕기물떼새', sci: 'Vanellus vanellus', group: 'shore', where: '겨울 철새', credit: 'Andreas Trepte · CC BY-SA 2.5 · 위키미디어 공용', hints: [
      '머리 위에 가늘고 긴 깃이 위로 솟아 있어요.',
      '등은 초록빛 광택이 나는 검은색이에요.',
      '겨울에 논밭에 무리 지어 내려앉아요.'] },
    { id: 'bulgeunburigalmaegi', file: 'bulgeunburigalmaegi', name: '붉은부리갈매기', sci: 'Chroicocephalus ridibundus', group: 'shore', where: '겨울 철새', credit: 'Hans Hillewaert · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '부리와 다리가 붉고, 여름에는 머리가 갈색이에요.',
      '겨울에는 머리가 하얗고 귀 쪽에 검은 점이 있어요.',
      '겨울에 강과 바닷가 항구에서 사람이 주는 과자를 받아먹기도 해요.'] },
    { id: 'geomeunmeorigalmaegi', file: 'geomeunmeorigalmaegi', name: '검은머리갈매기', sci: 'Saundersilarus saundersi', group: 'shore', where: '겨울 철새', credit: 'Kim, Hyun-tae · CC BY 4.0 · 위키미디어 공용', hints: [
      '여름에는 머리가 새까맣고, 눈 위아래에 흰 무늬가 있어요.',
      '다른 바닷새에 비해 몸이 작고 부리가 짧아요.',
      '갯벌에서 게를 잡아먹는 귀한 새예요.'] },
    { id: 'galmaegi', file: 'galmaegi', name: '갈매기', sci: 'Larus canus', group: 'shore', where: '겨울 철새', credit: 'Andreas Trepte · CC BY-SA 2.5 · 위키미디어 공용', hints: [
      '등은 연한 회색이고, 날개 끝은 검은색이에요.',
      '부리는 짧고 노란색이에요.',
      '겨울에 바닷가와 강 하구에서 무리 지어 쉬어요.'] },
    { id: 'cheongmeoriori', file: 'cheongmeoriori', name: '청머리오리', sci: 'Mareca falcata', group: 'duck', where: '겨울 철새', credit: 'Francis C. Franklin · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '수컷은 머리가 반짝이는 초록빛이고, 길고 휜 날개 깃이 낫처럼 늘어져 있어요.',
      '목에 하얀 띠가 있어요.',
      '겨울에 호수나 하천에서 만날 수 있는 철새예요.'] },
    { id: 'alrakori', file: 'alrakori', name: '알락오리', sci: 'Mareca strepera', group: 'duck', where: '겨울 철새', credit: 'Andreas Trepte · CC BY-SA 2.5 · 위키미디어 공용', hints: [
      '수컷은 몸이 회색 물결무늬이고 꼬리 근처가 새까매요.',
      '부리는 회색이고 다리는 주황색이에요.',
      '겨울에 호수와 강, 저수지에서 쉬어요.'] },
    { id: 'hongmeoriori', file: 'hongmeoriori', name: '홍머리오리', sci: 'Mareca penelope', group: 'duck', where: '겨울 철새', credit: 'Laitche · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '수컷은 머리가 밤색이고 이마에 연한 노란색 줄이 있어요.',
      '몸은 회색이고 부리는 푸르스름한 짧은 모양이에요.',
      '겨울에 물풀이나 풀밭에서 풀을 뜯어 먹어요.'] },
    { id: 'daenggihuinjukji', file: 'daenggihuinjukji', name: '댕기흰죽지', sci: 'Aythya fuligula', group: 'duck', where: '겨울 철새', credit: 'Alexis Lours · CC BY 4.0 · 위키미디어 공용', hints: [
      '수컷은 온몸이 검고 옆구리만 새하얗고, 머리 뒤에 짧은 깃이 늘어져 있어요.',
      '눈동자가 노란색이에요.',
      '겨울에 호수나 저수지에서 물속으로 잠수해 먹이를 잡아요.'] },
    { id: 'huinjukji', file: 'huinjukji', name: '흰죽지', sci: 'Aythya ferina', group: 'duck', where: '겨울 철새', credit: 'Alexis Lours · CC BY 4.0 · 위키미디어 공용', hints: [
      '수컷은 머리가 붉은 밤색이고, 가슴은 검고, 몸통은 회색빛이 도는 흰색이에요.',
      '부리 끝은 검고 가운데에 푸른 띠가 있어요.',
      '겨울에 물속으로 잠수해서 먹이를 잡아요.'] },
    { id: 'geomeunmeorihuinjukji', file: 'geomeunmeorihuinjukji', name: '검은머리흰죽지', sci: 'Aythya marila', group: 'duck', where: '겨울 철새', credit: 'Chuck Homler d/b/a Focus On Wildlife · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '수컷은 머리가 어두운 초록빛으로 반짝이고, 옆구리는 하얘요.',
      '부리가 푸르스름하고 눈은 노란색이에요.',
      '겨울에 바다 가까운 물에서 무리 지어 지내요.'] },
    { id: 'huinbiori', file: 'huinbiori', name: '흰비오리', sci: 'Mergellus albellus', group: 'duck', where: '겨울 철새', credit: 'Alpsdake · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '수컷은 몸이 하얗고 눈 둘레와 등에 검은 무늬가 있어요.',
      '작은 물새인데 부리는 가늘고 뾰족해요.',
      '겨울에 강과 호수에서 잠수하며 작은 물고기를 잡아요.'] },
    { id: 'keungireogi', file: 'keungireogi', name: '큰기러기', sci: 'Anser fabalis', group: 'duck', where: '겨울 철새', credit: 'Andrey Gulivanov · CC BY 2.0 · 위키미디어 공용', hints: [
      '몸이 갈색이고, 부리는 검정과 주황색이 섞여 있어요.',
      '겨울에 논밭에 큰 무리를 지어 내려앉아요.',
      '볍씨와 곡식을 먹고 V자 대형으로 날아요.'] },
    { id: 'gaeri', file: 'gaeri', name: '개리', sci: 'Anser cygnoides', group: 'duck', where: '겨울 철새', credit: 'grihahasanov · CC BY 4.0 · 위키미디어 공용', hints: [
      '목 앞쪽은 연한 갈색이고 뒤쪽은 진한 갈색으로 두 가지 색이 확 나뉘어요.',
      '부리가 검고 아주 길어요.',
      '길고 가는 목을 가진 기러기로 우리나라에서는 드문 겨울 철새예요.'] },
    { id: 'ppiponnonbyeongari', file: 'ppiponnonbyeongari', name: '뿔논병아리', sci: 'Podiceps cristatus', group: 'duck', where: '겨울 철새', credit: 'JJ Harrison · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '머리에 검은 뿔 같은 깃이 솟아 있고, 얼굴 옆에 밤색 깃털이 장식처럼 둘러 있어요.',
      '목이 길고 하얀색이에요.',
      '물에 둥둥 떠다니며 잠수해서 물고기를 잡아요.'] },
    { id: 'geomeunmoknonbyeongari', file: 'geomeunmoknonbyeongari', name: '검은목논병아리', sci: 'Podiceps nigricollis', group: 'duck', where: '겨울 철새', credit: 'Andreas Trepte · CC BY-SA 2.5 · 위키미디어 공용', hints: [
      '목이 검고, 눈 뒤에 금빛 털이 부채처럼 퍼져 있어요.',
      '눈이 붉고 몸에는 붉은 밤색 무늬가 있어요.',
      '겨울에 바다와 큰 호수에서 잠수하며 먹이를 찾아요.'] },
    { id: 'geomdaenggihaeoragi', file: 'geomdaenggihaeoragi', name: '검은댕기해오라기', sci: 'Butorides striata', group: 'heron', where: '여름 철새', credit: 'Charles J. Sharp · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '머리가 검고 긴 깃으로 덮이고, 몸은 회색빛이에요.',
      '부리가 길고 노란 눈과 다리가 눈에 띄어요.',
      '여름에 물가에서 몸을 낮추고 기다리다 작은 물고기를 낚아채요.'] },
    { id: 'deombulhaeoragi', file: 'deombulhaeoragi', name: '덤불해오라기', sci: 'Ixobrychus sinensis', group: 'heron', where: '여름 철새', credit: 'JJ Harrison · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '몸이 황갈색이고 작아요.',
      '갈대밭이나 연꽃밭에 숨어서 거의 나오지 않아요.',
      '위험하면 목을 길게 늘여서 갈대인 척해요.'] },
    { id: 'bulgeunwaegari', file: 'bulgeunwaegari', name: '붉은왜가리', sci: 'Ardea purpurea', group: 'heron', where: '여름 철새', credit: 'Pierre Dalous · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '목과 가슴이 붉은 밤색이고 목에 검은 줄무늬가 있어요.',
      '몸이 가늘고 목이 길어 S자로 휘어요.',
      '여름에 갈대밭과 습지에서 숨어 살아요.'] },
    { id: 'bulgeunbaejippagwi', file: 'bulgeunbaejippagwi', name: '붉은배지빠귀', sci: 'Turdus chrysolaus', group: 'land', where: '여름 철새', credit: 'ISAKA Yoji · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '가슴과 배 옆이 밝은 주황빛 붉은색이고, 머리는 어두운 갈색이에요.',
      '여름에 숲에서 새끼를 키우는 철새예요.',
      '땅에서 낙엽을 뒤집으며 곤충과 지렁이를 찾아요.'] },
    { id: 'keunburimilhwabuli', file: 'keunburimilhwabuli', name: '큰부리밀화부리', sci: 'Eophona personata', group: 'small', where: '텃새', credit: 'Francesco Veronesi from Italy · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '부리가 굵고 노랗고 얼굴이 검은 모자를 쓴 것 같아요.',
      '몸은 회색빛이고 날개에 검은색이 섞여 있어요.',
      '숲에서 씨앗을 깨 먹는 튼튼한 부리를 가졌어요.'] },
    { id: 'hongbangulsae', file: 'hongbangulsae', name: '홍방울새', sci: 'Acanthis flammea', group: 'small', where: '겨울 철새', credit: 'Cephas · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '이마가 붉은 점이고, 수컷은 가슴이 분홍빛이에요.',
      '몸에 갈색 세로 줄무늬가 있어요.',
      '겨울에 자작나무와 풀밭에서 씨앗을 먹으러 무리 지어 와요.'] },
    { id: 'minmuldoyo', file: 'minmuldoyo', name: '민물도요', sci: 'Calidris alpina', group: 'shore', where: '겨울 철새', credit: 'Mdf · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '여름에는 배에 검은 큰 점이 있고 등이 붉은 밤색이에요.',
      '부리가 길고 끝이 아래로 살짝 휘어요.',
      '겨울에 갯벌에서 아주 큰 무리를 지어 다니며 먹이를 찾아요.'] },
  ];

  var QUESTION_COUNT = 10;
  var CHOICES = 4;
  var SAME_GROUP = 2; // 오답 3개 중 같은 무리에서 고르는 수(나머지는 아무 새에서 무작위)
  var EXTENSIONS = ['jpg', 'png', 'webp', 'jpeg'];

  function shuffle(list, rand) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // 오답 보기: 같은 무리에서 SAME_GROUP개(모자라면 있는 만큼), 나머지는 다른 새에서 무작위로.
  function pickOthers(answer, rand) {
    var same = shuffle(SPECIES.filter(function (s) { return s !== answer && s.group === answer.group; }), rand).slice(0, SAME_GROUP);
    var rest = shuffle(SPECIES.filter(function (s) { return s !== answer && same.indexOf(s) < 0; }), rand);
    return same.concat(rest.slice(0, CHOICES - 1 - same.length));
  }

  // 겹치지 않게 count종을 뽑고, 문제마다 정답 + 다른 새 3개를 섞은 보기를 만든다.
  function makeQuiz(count, rand) {
    rand = rand || Math.random;
    return shuffle(SPECIES, rand).slice(0, count).map(function (answer) {
      return { answer: answer, choices: shuffle(pickOthers(answer, rand).concat([answer]), rand) };
    });
  }

  // 정답 점수: 힌트를 안 보면 10점, 하나 볼 때마다 3점씩 줄어든다(최소 1점).
  function scoreFor(hintsSeen) {
    return Math.max(1, 10 - hintsSeen * 3);
  }

  var api = { SPECIES: SPECIES, QUESTION_COUNT: QUESTION_COUNT, CHOICES: CHOICES, SAME_GROUP: SAME_GROUP, EXTENSIONS: EXTENSIONS, makeQuiz: makeQuiz, scoreFor: scoreFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KoreaBird = api;
})(typeof window !== 'undefined' ? window : this);
