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
      '말레이시아 같은 동남아시아에 살아요.'] },
    // ----- 위키미디어 공용 사진(2026-10-27) -----
    { id: 'saramagwi', file: 'saramagwi', name: '사마귀', sci: 'Tenodera angustipennis', where: '우리나라·동아시아', credit: 'Diego Delso · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '우리나라 풀밭에서 가장 흔하게 볼 수 있어요. 이름도 가장 간단해요.',
      '몸이 가늘고 길쭉하며 초록색이나 갈색이에요.',
      '우리나라에서 가장 큰 종과 닮았지만 조금 더 작고 날씬해요.'] },
    { id: 'withered-leaf', file: 'withered-leaf', name: 'South American Dead Leaf Mantis', sci: 'Acanthops falcata', where: '남아메리카', credit: 'Diego Tartaglia · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '몸이 바싹 말라 오그라든 갈색 잎처럼 생겼어요.',
      '위험하면 앞다리를 모으고 꼼짝 않고 있어 진짜 낙엽 같아요.',
      '남아메리카 열대 숲에 살아요.'] },
    { id: 'pale-dwarf', file: 'pale-dwarf', name: 'Ameles decolor', sci: 'Ameles decolor', where: '유럽 남쪽', credit: 'Holger Krisp · CC BY 4.0 · 위키미디어 공용', hints: [
      '몸길이가 2~3cm밖에 안 되는 아주 작은 사마귀예요.',
      '색이 연한 갈색·회색이라 마른 풀에 잘 숨어요.',
      '지중해 근처 유럽 남쪽에 살아요.'] },
    { id: 'round-belly-dwarf', file: 'round-belly-dwarf', name: 'European Dwarf Mantis', sci: 'Ameles spallanzania', where: '유럽 남쪽·북아프리카', credit: 'Lies Van Rompaey · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '작은 몸에 배가 동글동글 위로 휘어 있어요.',
      '암컷은 날개가 짧아서 잘 날지 못해요.',
      '지중해 둘레의 덤불에 살아요.'] },
    { id: 'aussie-stick', file: 'aussie-stick', name: 'Large Brown Mantis', sci: 'Archimantis latistyla', where: '오스트레일리아', credit: 'Graham Wise from Brisbane, Australia · CC BY 2.0 · 위키미디어 공용', hints: [
      '몸이 나뭇가지처럼 아주 길고 가늘어요. 10cm가 넘기도 해요.',
      '갈색이라 마른 나무 위에 있으면 잘 안 보여요.',
      '캥거루의 나라에 사는 큰 사마귀예요.'] },
    { id: 'thistle', file: 'thistle', name: 'Thistle Mantis', sci: 'Blepharopsis mendica', where: '북아프리카·서아시아', credit: 'Bernard DUPONT from FRANCE · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '몸에 하얀 점무늬가 잔뜩 있고 가장자리가 울퉁불퉁해요.',
      '머리 위에 뾰족한 뿔 같은 돌기가 있어요.',
      '사막 근처 덤불에 사는데, 가시 많은 풀과 닮았대요.'] },
    { id: 'short-wing-steppe', file: 'short-wing-steppe', name: 'Bolivaria brachyptera', sci: 'Bolivaria brachyptera', where: '동유럽·중앙아시아', credit: 'ElenaLitera · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '날개가 아주 짧아서 날지 못하고 걸어 다녀요.',
      '회색·갈색 몸으로 메마른 땅 위에 숨어요.',
      '넓은 초원과 마른 땅에 살아요.'] },
    { id: 'brunner-stick', file: 'brunner-stick', name: 'Brunner\'s Stick Mantis', sci: 'Brunneria borealis', where: '북아메리카', credit: 'NCGeno · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '몸이 풀줄기처럼 아주 가늘고 길쭉한 초록색이에요.',
      '수컷이 없이 암컷 혼자 알을 낳아 새끼를 퍼뜨려요.',
      '미국 남쪽의 풀밭에 살아요.'] },
    { id: 'unicorn-asia', file: 'unicorn-asia', name: 'Unicorn Mantis', sci: 'Ceratomantis saussurii', where: '동남아시아', credit: 'Bernard DUPONT from FRANCE · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '머리 위에 기다란 뿔이 하나 솟아 있어요.',
      '몸이 갈색 마른 잎 조각처럼 생겼어요.',
      '동남아시아 숲의 나뭇가지에 붙어 살아요.'] },
    { id: 'leaf-shield', file: 'leaf-shield', name: 'Tropical Shield Mantis', sci: 'Choeradodis rhombicollis', where: '중앙·남아메리카', credit: 'Charles J. Sharp · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '가슴이 아주 넓고 납작해서 초록 잎사귀를 덮어쓴 것 같아요.',
      '잎 위에 납작 엎드리면 잎과 구별이 안 돼요.',
      '중앙아메리카 열대 숲에 살아요.'] },
    { id: 'tree-runner', file: 'tree-runner', name: 'Tree-running Mantis', sci: 'Ciulfina 무리', where: '오스트레일리아', credit: 'Graham Wise from Brisbane, Australia · CC BY 2.0 · 위키미디어 공용', hints: [
      '나무줄기 위를 쪼르르 빠르게 뛰어다녀요.',
      '몸이 납작하고 나무껍질 같은 얼룩무늬예요.',
      '호주 숲의 나무줄기에서 살아요.'] },
    { id: 'jeweled-flower', file: 'jeweled-flower', name: 'Jeweled Flower Mantis', sci: 'Creobroter gemmatus', where: '동남아시아', credit: 'Vengolis · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '날개에 노란 테두리를 두른 동그란 눈알 무늬가 있어요.',
      '하얀색·초록색 몸으로 꽃 위에서 벌과 나비를 기다려요.',
      '인도와 동남아시아에 살아요.'] },
    { id: 'ghost-leaf', file: 'ghost-leaf', name: 'Southeast Asian Dead Leaf Mantis', sci: 'Deroplatys lobata', where: '동남아시아', credit: 'Fritz Geller-Grimm · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '가슴 옆이 넓게 퍼져 찢어진 낙엽처럼 보여요.',
      '놀라면 앞다리를 들고 안쪽의 진한 무늬를 보여 줘요.',
      '말레이시아 같은 동남아시아 숲 바닥에 살아요.'] },
    { id: 'bush-african', file: 'bush-african', name: 'Dystacta alticeps', sci: 'Dystacta alticeps', where: '아프리카 동쪽', credit: 'Bernard DUPONT from FRANCE · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '날개가 짧고 몸이 굵직한 갈색이에요.',
      '땅 가까이 덤불 사이를 걸어 다니며 사냥해요.',
      '탄자니아·케냐 같은 아프리카 동쪽에 살아요.'] },
    { id: 'cone-banded', file: 'cone-banded', name: 'Empusa fasciata', sci: 'Empusa fasciata', where: '유럽 남동쪽·서아시아', credit: 'Kirospe · CC0 · 위키미디어 공용', hints: [
      '머리 위에 원뿔 모양 뾰족한 왕관이 있어요.',
      '배 가장자리가 잎처럼 납작하게 튀어나와 있어요.',
      '발칸반도와 터키 같은 곳에 살아요.'] },
    { id: 'cone-african', file: 'cone-african', name: 'Empusa guttula', sci: 'Empusa guttula', where: '아프리카', credit: 'yakovlev.alexey from Moscow, Russia · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '머리에 길쭉한 뿔이 솟아 있고 몸이 아주 가늘어요.',
      '더듬이가 깃털처럼 생긴 수컷도 있어요.',
      '아프리카의 마른 풀밭에 살아요.'] },
    { id: 'conehead', file: 'conehead', name: 'Conehead Mantis', sci: 'Empusa pennata', where: '유럽 남쪽·북아프리카', credit: 'Mkrc85 · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '머리 위에 뾰족한 원뿔 모자를 쓴 것 같아요.',
      '다리 군데군데 잎사귀처럼 생긴 작은 판이 붙어 있어요.',
      '애벌레(어린 시절)가 겨울을 나는 특이한 사마귀예요.'] },
    { id: 'grass-cone', file: 'grass-cone', name: 'Double-coned Grass Mantis', sci: 'Episcopomantis 무리', where: '아프리카', credit: 'RudiSteenkamp · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '머리 위에 뾰족한 뿔이 길게 솟아 있어요.',
      '몸이 가늘고 초록색이라 풀잎과 똑같아요.',
      '아프리카 풀밭에 살아요.'] },
    { id: 'desert', file: 'desert', name: 'Desert Mantis', sci: 'Eremiaphila 무리', where: '북아프리카·서아시아', credit: 'Ahmad Rasteh · CC BY 3.0 · 위키미디어 공용', hints: [
      '모래와 돌 색깔이라 사막 바닥에 있으면 안 보여요.',
      '날개가 아주 작아서 날지 못하고 빠르게 뛰어다녀요.',
      '뜨거운 사막에 사는 몇 안 되는 사마귀예요.'] },
    { id: 'giraffe', file: 'giraffe', name: 'Giraffe Mantis', sci: 'Euchomenella heteroptera', where: '동남아시아', credit: 'Bernard DUPONT from FRANCE · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '목(가슴 부분)이 엄청나게 길어요.',
      '몸 전체가 가늘고 긴 막대 같아요.',
      '이름처럼 목이 긴 동물을 닮았어요. 동남아시아에 살아요.'] },
    { id: 'bark-african', file: 'bark-african', name: 'Galepsus', sci: 'Galepsus 무리', where: '아프리카', credit: 'Bernard DUPONT from FRANCE · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '몸이 납작하고 회갈색 얼룩이라 나무껍질에 착 붙어 숨어요.',
      '날개를 등에 납작하게 접고 있어요.',
      '아프리카 여러 곳에 살아요.'] },
    { id: 'ground-dwarf', file: 'ground-dwarf', name: 'Geomantis larvoides', sci: 'Geomantis larvoides', where: '유럽 남쪽·북아프리카', credit: 'Sputniktilt · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '어른이 되어도 날개가 없어서 아기처럼 보여요.',
      '땅 위 마른 풀 사이를 걸어 다녀요.',
      '지중해 근처의 메마른 땅에 살아요.'] },
    { id: 'lichen-gray', file: 'lichen-gray', name: 'Grizzled Mantis', sci: 'Gonatista grisea', where: '북아메리카 남쪽·카리브해', credit: 'gailhampshire from Cradley, Malvern, U.K · CC BY 2.0 · 위키미디어 공용', hints: [
      '몸이 회색·초록 얼룩이라 이끼 낀 나무껍질과 똑같아요.',
      '나무줄기에 납작 붙어 꼼짝하지 않아요.',
      '미국 플로리다와 카리브해 섬에 살아요.'] },
    { id: 'three-color-flower', file: 'three-color-flower', name: 'Harpagomantis tricolor', sci: 'Harpagomantis tricolor', where: '아프리카 남쪽', credit: 'Alandmanson · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '몸에 초록·흰색·분홍빛 얼룩 줄무늬가 있어요.',
      '꽃 위에 앉아 있으면 꽃잎과 헷갈려요.',
      '남아프리카에 살아요.'] },
    { id: 'boxer-unicorn', file: 'boxer-unicorn', name: 'Unicorn Boxer Mantis', sci: 'Hestiasula brunneriana', where: '동남아시아', credit: 'Shiv\'s fotografia · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '앞다리를 권투 선수처럼 들고 흔들어요.',
      '머리에 작은 뿔이 있고 몸이 마른 잎 색이에요.',
      '동남아시아 숲에 사는 작은 사마귀예요.'] },
    { id: 'giant-rainforest', file: 'giant-rainforest', name: 'Giant Rainforest Mantis', sci: 'Hierodula majuscula', where: '오스트레일리아', credit: 'Delta176 · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '초록색 몸이 크고 튼튼해요. 호주에서 손꼽히게 커요.',
      '넓은 앞날개에 작은 점이 하나씩 있어요.',
      '호주 북동쪽 열대 숲에 살아요.'] },
    { id: 'giant-asian', file: 'giant-asian', name: 'Giant Asian Mantis', sci: 'Hierodula membranacea', where: '남아시아·동남아시아', credit: 'Charles Lam · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '몸이 크고 튼튼한 초록색 사마귀예요.',
      '작은 새나 도마뱀을 잡았다는 이야기도 있을 만큼 힘이 세요.',
      '인도와 동남아시아에 살아요.'] },
    { id: 'vein-wing', file: 'vein-wing', name: 'Hierodula venosa', sci: 'Hierodula venosa', where: '동남아시아', credit: 'Phaeton68 · CC BY 3.0 · 위키미디어 공용', hints: [
      '날개의 잎맥 무늬가 잎사귀처럼 선명해요.',
      '연두색 몸으로 나뭇잎 사이에 숨어요.',
      '동남아시아에 살아요.'] },
    { id: 'stick-african', file: 'stick-african', name: 'African Stick Mantis', sci: 'Hoplocorypha 무리', where: '아프리카', credit: 'Bernard DUPONT from FRANCE · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '몸이 연필처럼 가늘고 길쭉해요.',
      '날개가 없거나 아주 짧아요.',
      '아프리카의 풀과 나뭇가지 사이에 살아요.'] },
    { id: 'bark-indian', file: 'bark-indian', name: 'Humbertiella', sci: 'Humbertiella 무리', where: '남아시아', credit: 'Vengolis · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '몸이 납작한 회갈색이라 나무줄기와 구별이 어려워요.',
      '나무줄기를 따라 위아래로 재빨리 움직여요.',
      '인도와 스리랑카에 살아요.'] },
    { id: 'slim-stick', file: 'slim-stick', name: 'Hypsicorypha gracilis', sci: 'Hypsicorypha gracilis', where: '북아프리카·유럽 남쪽', credit: 'Falkoholiker · Public domain · 위키미디어 공용', hints: [
      '아주 가늘고 긴 몸에 긴 다리를 가졌어요.',
      '머리 위가 뾰족하게 솟아 있어요.',
      '지중해 근처 마른 풀밭에 살아요.'] },
    { id: 'mediterranean', file: 'mediterranean', name: 'Mediterranean Mantis', sci: 'Iris oratoria', where: '지중해·서아시아', credit: 'Julien Seguinot from Lille, France · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '위협을 받으면 뒷날개를 펼쳐 눈알 무늬를 보여 줘요.',
      '몸이 갈색이나 연두색이고 날씬해요.',
      '지중해 근처에서 시작해 미국까지 퍼져 살아요.'] },
    { id: 'long-wing-stick', file: 'long-wing-stick', name: 'Ischnomantis', sci: 'Ischnomantis 무리', where: '아프리카', credit: 'Rudolph Steenkamp · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '몸과 날개가 아주 길고 가늘어요.',
      '갈색 나뭇가지처럼 보여요.',
      '아프리카의 풀밭과 덤불에 살아요.'] },
    { id: 'lichen-runner', file: 'lichen-runner', name: 'Liturgusa', sci: 'Liturgusa 무리', where: '중앙·남아메리카', credit: 'Graham Wise from Brisbane, Australia · CC BY 2.0 · 위키미디어 공용', hints: [
      '이끼 낀 나무껍질 무늬의 납작한 몸이에요.',
      '나무줄기 위를 아주 빠르게 달려요.',
      '아마존 같은 남아메리카 숲에 살아요.'] },
    { id: 'tiny-maya', file: 'tiny-maya', name: 'Little Yucatan Mantis', sci: 'Mantoida maya', where: '중앙아메리카', credit: '(c) Francisco Farriols Sarabia, some rights reserved (CC BY) · CC BY 4.0 · 위키미디어 공용', hints: [
      '몸길이가 2cm쯤인 아주 작은 사마귀예요.',
      '어릴 때는 개미처럼 생겨서 적을 속여요.',
      '멕시코 같은 중앙아메리카에 살아요.'] },
    { id: 'metallic', file: 'metallic', name: 'Metallic Mantis', sci: 'Metallyticus splendidus', where: '동남아시아', credit: 'Zleng · CC BY 2.0 · 위키미디어 공용', hints: [
      '몸이 파란색·초록색 금속처럼 반짝반짝 빛나요.',
      '몸이 납작해서 나무껍질 틈에 쏙 들어가요.',
      '말레이시아 같은 동남아시아에 살아요.'] },
    { id: 'egyptian-pygmy', file: 'egyptian-pygmy', name: 'Egyptian Pygmy Mantis', sci: 'Miomantis paykullii', where: '아프리카', credit: 'Luc Viatour · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '가늘고 작은 연두색·갈색 사마귀예요.',
      '날개가 반투명하게 비쳐 보여요.',
      '아프리카 여러 곳에 살아요.'] },
    { id: 'ant', file: 'ant', name: 'Asian Ant Mantis', sci: 'Odontomantis planiceps', where: '동남아시아', credit: 'Renjusplace · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '새끼 때 까만색이라 개미와 똑같이 생겼어요.',
      '개미인 척해서 무서운 적을 피해요.',
      '동남아시아에 살아요.'] },
    { id: 'zebra', file: 'zebra', name: 'Zebra Mantis', sci: 'Omomantis zebrata', where: '아프리카 남쪽', credit: 'Bernard DUPONT from FRANCE · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '배에 검은 줄무늬가 있어요.',
      '연두색 몸에 날씬한 모습이에요.',
      '남아프리카에 살아요.'] },
    { id: 'garden-aussie', file: 'garden-aussie', name: 'Australian Garden Mantis', sci: 'Orthodera ministralis', where: '오스트레일리아', credit: 'Graham Wise from Brisbane, Australia · CC BY 2.0 · 위키미디어 공용', hints: [
      '가슴 양옆이 넓적하게 퍼진 초록색 사마귀예요.',
      '앞다리 안쪽에 파란 점이 있어요.',
      '호주의 집 마당에서도 자주 볼 수 있어요.'] },
    { id: 'new-zealand', file: 'new-zealand', name: 'New Zealand Mantis', sci: 'Orthodera novaezealandiae', where: '뉴질랜드', credit: 'Greg O’Beirne · CC BY 4.0 · 위키미디어 공용', hints: [
      '뉴질랜드에만 사는 초록색 사마귀예요.',
      '앞다리 안쪽에 보라·파란 점이 있어요.',
      '다른 나라에서 온 사마귀 때문에 수가 줄고 있대요.'] },
    { id: 'boxer-african', file: 'boxer-african', name: 'East African Boxer Mantis', sci: 'Otomantis scutigera', where: '아프리카 동쪽', credit: 'Bernard DUPONT from FRANCE · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '앞다리를 권투 선수처럼 접었다 폈다 해요.',
      '머리 위에 뾰족한 뿔이 솟아 있어요.',
      '케냐·탄자니아 같은 아프리카 동쪽에 살아요.'] },
    { id: 'brown-african', file: 'brown-african', name: 'Paramantis', sci: 'Paramantis 무리', where: '아프리카', credit: 'Dave U · CC BY 4.0 · 위키미디어 공용', hints: [
      '날씬한 갈색 몸으로 마른 풀과 닮았어요.',
      '밤에는 불빛에 날아오기도 해요.',
      '아프리카에 살아요.'] },
    { id: 'bark-crumb', file: 'bark-crumb', name: 'Paraoxypilus', sci: 'Paraoxypilus 무리', where: '오스트레일리아', credit: 'Patrick_K59 · CC BY 2.0 · 위키미디어 공용', hints: [
      '몸이 울퉁불퉁한 흙덩이·나무 부스러기처럼 생겼어요.',
      '땅 위를 재빨리 뛰어다니며 개미를 잡아먹어요.',
      '호주에 살아요.'] },
    { id: 'budwing', file: 'budwing', name: 'Budwing Mantis', sci: 'Parasphendale affinis', where: '아프리카 동쪽', credit: 'MicrocosmicWorld · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '수컷과 달리 암컷은 날개가 꽃봉오리처럼 짧아요.',
      '겁을 주려고 날개를 펼쳐 진한 무늬를 보여 줘요.',
      '아프리카 동쪽에 살아요.'] },
    { id: 'pearl', file: 'pearl', name: 'Perlamantis allibertii', sci: 'Perlamantis allibertii', where: '유럽 남쪽·북아프리카', credit: 'Paulo Martins · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '몸길이 2cm쯤으로 바퀴벌레처럼 납작하게 생겼어요.',
      '밤에 땅 위를 돌아다녀요.',
      '프랑스 남쪽과 스페인 같은 곳에 살아요.'] },
    { id: 'texas-unicorn', file: 'texas-unicorn', name: 'Texas Unicorn Mantis', sci: 'Phyllovates chlorophaea', where: '북·중앙아메리카', credit: 'ALAN SCHMIERER · CC0 · 위키미디어 공용', hints: [
      '머리 위에 끝이 갈라진 뿔 하나가 솟아 있어요.',
      '다리에 잎사귀 같은 판이 붙어 있어요.',
      '미국 텍사스에서 중앙아메리카까지 살아요.'] },
    { id: 'flag-madagascar', file: 'flag-madagascar', name: 'Polyspilota aeruginosa', sci: 'Polyspilota aeruginosa', where: '아프리카·마다가스카르', credit: 'SAplants · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '아주 크고 길쭉한 사마귀예요.',
      '가슴과 다리에 줄무늬가 있어요.',
      '아프리카와 마다가스카르 섬에 살아요.'] },
    { id: 'tree-african', file: 'tree-african', name: 'Prohierodula', sci: 'Prohierodula 무리', where: '아프리카', credit: 'TheEnoderr · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '크고 튼튼한 초록색 사마귀예요.',
      '큰 눈과 두꺼운 앞다리로 큰 먹이도 잡아요.',
      '아프리카 숲의 나무 위에 살아요.'] },
    { id: 'spotted-eye-flower', file: 'spotted-eye-flower', name: 'Gambian Spotted-eye Flower Mantis', sci: 'Pseudoharpax virescens', where: '아프리카 서쪽', credit: 'Happy1892 · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '작은 연두색 꽃사마귀예요.',
      '앞날개에 점 무늬가 있어요.',
      '감비아 같은 아프리카 서쪽에 살아요.'] },
    { id: 'ground-spain', file: 'ground-spain', name: 'Rivetina baetica', sci: 'Rivetina baetica', where: '유럽 남쪽·서아시아', credit: 'Guillermo García-Saúco · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '굵고 튼튼한 회갈색 몸이에요.',
      '앞다리 안쪽에 검은 점무늬가 있어요.',
      '스페인처럼 덥고 메마른 곳에 살아요.'] },
    { id: 'lichen-crown', file: 'lichen-crown', name: 'Cryptic Mantis', sci: 'Sibylla pretiosa', where: '아프리카', credit: 'Bernard DUPONT from FRANCE · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '머리 위에 끝이 갈라진 왕관 모양 뿔이 있어요.',
      '몸과 다리가 이끼 낀 나뭇가지처럼 얼룩덜룩해요.',
      '아프리카 숲의 나무줄기에 붙어 살아요.'] },
    { id: 'african-green', file: 'african-green', name: 'Sphodromantis gastrica', sci: 'Sphodromantis gastrica', where: '아프리카 남쪽', credit: 'Bernard DUPONT from FRANCE · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '크고 통통한 초록색 사마귀예요.',
      '앞날개에 하얀 점이 하나씩 있어요.',
      '남아프리카에 살아요.'] },
    { id: 'giant-african', file: 'giant-african', name: 'Sphodromantis viridis', sci: 'Sphodromantis viridis', where: '아프리카·스페인 남쪽', credit: 'EL HOUCEIN OUAKOUZ · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '크고 튼튼한 연두색 사마귀예요.',
      '앞날개 가운데쯤에 하얀 점이 있어요.',
      '아프리카에 살고 스페인 남쪽에서도 보여요.'] },
    { id: 'carolina', file: 'carolina', name: 'Carolina Mantis', sci: 'Stagmomantis carolina', where: '북아메리카', credit: 'Alexander Veiga Malta · CC BY 4.0 · 위키미디어 공용', hints: [
      '미국에 원래부터 살던 사마귀예요.',
      '회색·갈색 얼룩이라 나무껍질과 닮았어요.',
      '미국 남동쪽에 많이 살아요.'] },
    { id: 'bordered', file: 'bordered', name: 'Bordered Mantis', sci: 'Stagmomantis limbata', where: '북아메리카 남서쪽', credit: 'Gregory "Slobirdr" Smith · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '암컷은 배가 통통하고 날개가 짧아요.',
      '초록색이나 갈색이고 날개 가장자리 색이 달라요.',
      '미국 남서쪽과 멕시코에 살아요.'] },
    { id: 'leaf-unicorn', file: 'leaf-unicorn', name: 'Stenophylla lobivertex', sci: 'Stenophylla lobivertex', where: '남아메리카', credit: 'Schwarz CJ, Glaw F · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '머리 위에 잎사귀 모양의 기다란 뿔이 있어요.',
      '몸 전체가 마른 잎 조각처럼 울퉁불퉁해요.',
      '아마존 열대 숲에 사는 아주 드문 사마귀예요.'] },
    { id: 'bark-mother', file: 'bark-mother', name: 'Tarachodes', sci: 'Tarachodes 무리', where: '아프리카', credit: 'Bernard DUPONT from FRANCE · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '몸이 납작한 회색이라 나무껍질에 붙으면 안 보여요.',
      '엄마가 알집 위에 앉아 지키는 것으로 유명해요.',
      '아프리카에 살아요.'] },
    { id: 'purple-wing', file: 'purple-wing', name: 'Purple-winged Mantis', sci: 'Tenodera australasiae', where: '오스트레일리아·동남아시아', credit: 'dhobern · CC BY 2.0 · 위키미디어 공용', hints: [
      '날개를 펴면 보랏빛이 돌아요.',
      '몸이 가늘고 긴 연두색이에요.',
      '호주와 동남아시아의 풀밭에 살아요.'] },
    { id: 'banded-flower', file: 'banded-flower', name: 'Banded Flower Mantis', sci: 'Theopropus elegans', where: '동남아시아', credit: 'Fungus Guy · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '날개에 검은 줄과 노란 테가 있는 화려한 꽃사마귀예요.',
      '하얀색·노란색 몸으로 꽃 위에서 사냥해요.',
      '동남아시아에 살아요.'] },
    { id: 'grass', file: 'grass', name: 'Grass-like Mantis', sci: 'Thesprotia graminis', where: '북아메리카', credit: 'Alex Abair · CC BY 4.0 · 위키미디어 공용', hints: [
      '몸이 마른 풀줄기처럼 아주 가늘어요.',
      '암컷은 날개가 없어요.',
      '미국 남동쪽 풀밭에 살아요.'] },
    { id: 'mexican-ground', file: 'mexican-ground', name: 'Yersinia mexicana', sci: 'Yersinia mexicana', where: '북·중앙아메리카', credit: 'Juan Carlos Fonseca Mata · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '날개가 짧고 몸이 연한 갈색이에요.',
      '땅 가까이 마른 풀 사이를 걸어 다녀요.',
      '미국 남서쪽과 멕시코에 살아요.'] },
    { id: 'greek-dwarf', file: 'greek-dwarf', name: 'Ameles heldreichi', sci: 'Ameles heldreichi', where: '유럽 남동쪽', credit: 'Chaym Turak · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '작고 갈색인 사마귀로 몸길이가 3cm쯤이에요.',
      '마른 풀 위에서 몸을 쭉 펴고 숨어요.',
      '그리스와 발칸반도에 살아요.'] },
    { id: 'wingless-green', file: 'wingless-green', name: 'Apteromantis aptera', sci: 'Apteromantis aptera', where: '스페인·포르투갈', credit: 'gailhampshire · CC BY 2.0 · 위키미디어 공용', hints: [
      '어른이 되어도 날개가 없어요.',
      '가늘고 초록색이라 풀잎 사이에 쏙 숨어요.',
      '스페인과 포르투갈에만 살아서 보호받는 곤충이에요.'] },
    { id: 'horn-stick', file: 'horn-stick', name: 'Ceratocrania macra', sci: 'Ceratocrania macra', where: '동남아시아', credit: 'Pavel Kirillov from St.Petersburg, Russia · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '머리 위에 뾰족한 뿔이 길게 솟아 있어요.',
      '몸이 갈색 나뭇가지처럼 가늘고 길어요.',
      '동남아시아 숲에 살아요.'] },
    { id: 'argentina', file: 'argentina', name: 'Coptopteryx', sci: 'Coptopteryx 무리', where: '남아메리카', credit: 'Romulo Filipini from Formigueiro rs, Brasil · CC BY 2.0 · 위키미디어 공용', hints: [
      '연두색 몸에 날개 끝이 각지게 생겼어요.',
      '낮은 담장이나 풀숲에서 사냥해요.',
      '아르헨티나 같은 남아메리카 남쪽에 살아요.'] },
    { id: 'thread-african', file: 'thread-african', name: 'Danuria', sci: 'Danuria 무리', where: '아프리카', credit: 'Bernard DUPONT from FRANCE · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '몸과 다리가 실처럼 아주 가늘어요.',
      '갈색이라 마른 풀줄기와 똑같아 보여요.',
      '아프리카 풀밭에 살아요.'] },
    { id: 'tiny-flower-african', file: 'tiny-flower-african', name: 'Galinthias amoena', sci: 'Galinthias amoena', where: '아프리카', credit: 'Bernard DUPONT from FRANCE · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '아주 작은 연두색 꽃사마귀예요.',
      '눈 사이에 줄무늬가 있어요.',
      '아프리카의 꽃과 잎 위에 살아요.'] },
    { id: 'chinese-giant', file: 'chinese-giant', name: 'Hierodula chinensis', sci: 'Hierodula chinensis', where: '중국·동아시아', credit: 'Kyu3a · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '크고 통통한 초록색 사마귀예요.',
      '앞다리 밑동에 노란 혹 같은 무늬가 있어요.',
      '중국 남쪽에 많이 살아요.'] },
    { id: 'taiwan', file: 'taiwan', name: 'Hierodula formosana', sci: 'Hierodula formosana', where: '대만·동아시아', credit: 'LiCheng Shih · CC BY 2.0 · 위키미디어 공용', hints: [
      '초록색의 튼튼한 사마귀예요.',
      '가슴이 짧고 넓적한 편이에요.',
      '이름에 섬나라 이름이 들어가요.'] },
    { id: 'caucasus', file: 'caucasus', name: 'Hierodula transcaucasica', sci: 'Hierodula transcaucasica', where: '서아시아·동유럽', credit: 'Andrey Butko · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '크고 연두색인 사마귀예요.',
      '요즘 유럽 쪽으로 사는 곳이 점점 넓어지고 있어요.',
      '코카서스 산맥 근처에서 처음 발견됐어요.'] },
    { id: 'two-dot', file: 'two-dot', name: 'Miomantis binotata', sci: 'Miomantis binotata', where: '아프리카', credit: 'Happy1892 · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '작고 날씬한 연두색 사마귀예요.',
      '새끼 때 몸에 분홍·초록 줄무늬가 있어요.',
      '아프리카에 살아요.'] },
    { id: 'scudder-grass', file: 'scudder-grass', name: 'Oligonicella scudderi', sci: 'Oligonicella scudderi', where: '북아메리카', credit: 'Emmett Tullos from Jackson AL, United States · CC BY 2.0 · 위키미디어 공용', hints: [
      '몸이 바늘처럼 아주 가늘고 길어요.',
      '크기가 3cm쯤으로 작아요.',
      '미국 남쪽 풀밭에 살아요.'] },
    { id: 'wide-garden', file: 'wide-garden', name: 'Orthodera burmeisteri', sci: 'Orthodera burmeisteri', where: '오스트레일리아', credit: 'Dana Lee Ling · CC0 · 위키미디어 공용', hints: [
      '가슴 양옆이 넓게 퍼진 초록색이에요.',
      '잎 위에 납작 붙으면 잎과 똑같아요.',
      '호주에 살아요.'] },
    { id: 'bumpy-bark', file: 'bumpy-bark', name: 'Oxypilus', sci: 'Oxypilus 무리', where: '아프리카', credit: 'Bernard DUPONT from FRANCE · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '몸이 울퉁불퉁 돌기투성이라 나무 부스러기 같아요.',
      '작은 몸으로 나무껍질 위를 재빨리 다녀요.',
      '아프리카에 살아요.'] },
    { id: 'red-budwing', file: 'red-budwing', name: 'Parasphendale agrionina', sci: 'Parasphendale agrionina', where: '아프리카 동쪽', credit: 'Nico Bruns · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '날개 안쪽에 붉은 무늬가 있어요.',
      '놀라면 날개를 펼쳐 적을 겁줘요.',
      '아프리카 동쪽에 살아요.'] },
    { id: 'brazil-leaf', file: 'brazil-leaf', name: 'Parastagmatoptera', sci: 'Parastagmatoptera 무리', where: '남아메리카', credit: '(c) Naelin, some rights reserved (CC BY) · CC BY 4.0 · 위키미디어 공용', hints: [
      '초록 잎 색깔의 날씬한 사마귀예요.',
      '넓은 잎 뒷면에 잘 숨어요.',
      '브라질 같은 남아메리카에 살아요.'] },
    { id: 'false-garden', file: 'false-garden', name: 'False Garden Mantis', sci: 'Pseudomantis albofimbriata', where: '오스트레일리아', credit: 'Graham Wise from Brisbane, Australia · CC BY 2.0 · 위키미디어 공용', hints: [
      '가늘고 긴 갈색·초록 사마귀예요.',
      '날개 가장자리에 하얀 테두리가 있어요.',
      '호주의 꽃밭과 풀밭에서 흔해요.'] },
    { id: 'short-wing-med', file: 'short-wing-med', name: 'Pseudoyersinia', sci: 'Pseudoyersinia 무리', where: '지중해 섬·유럽 남쪽', credit: 'Calogero Muscarella · CC BY-SA 3.0 · 위키미디어 공용', hints: [
      '날개가 짧아서 날지 못해요.',
      '갈색 몸으로 나뭇가지와 마른 풀에 숨어요.',
      '지중해의 섬들에 사는 종류가 많아요.'] },
    { id: 'grass-cone-african', file: 'grass-cone-african', name: 'Pyrgomantis', sci: 'Pyrgomantis 무리', where: '아프리카', credit: 'Bernard DUPONT from FRANCE · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '머리가 뾰족한 원뿔처럼 생겼어요.',
      '몸이 납작하고 길어서 마른 풀잎과 똑같아요.',
      '아프리카 초원에 살아요.'] },
    { id: 'rhombus', file: 'rhombus', name: 'Rhombomantis', sci: 'Rhombomantis 무리', where: '동남아시아', credit: 'Jewel Johnson · CC BY 4.0 · 위키미디어 공용', hints: [
      '가슴이 마름모꼴로 살짝 넓어요.',
      '회갈색 얼룩 몸으로 나무에 숨어요.',
      '동남아시아에 살아요.'] },
    { id: 'two-horn-thread', file: 'two-horn-thread', name: 'Schizocephala bicornis', sci: 'Schizocephala bicornis', where: '남아시아', credit: 'Rajatyadavjaora · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '세상에서 가장 가늘고 긴 사마귀 중 하나예요.',
      '머리 위에 작은 뿔이 두 개 있어요.',
      '인도와 스리랑카 풀밭에 살아요.'] },
    { id: 'african-lined', file: 'african-lined', name: 'African Mantis', sci: 'Sphodromantis lineola', where: '아프리카', credit: 'AdagioRibbit · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '크고 튼튼한 초록색 또는 갈색 사마귀예요.',
      '앞날개에 하얀 점이 하나씩 있어요.',
      '아프리카에 살고, 집에서 많이 기르는 사마귀예요.'] },
    { id: 'california', file: 'california', name: 'California Mantis', sci: 'Stagmomantis californica', where: '북아메리카 서쪽', credit: 'USFWS - Pacific Region · Public domain · 위키미디어 공용', hints: [
      '위협을 받으면 날개를 펴서 검은 무늬를 보여 줘요.',
      '갈색이나 초록색 몸이에요.',
      '미국 서쪽과 멕시코에 살아요.'] },
    { id: 'forest-jom', file: 'forest-jom', name: 'Statilia nemoralis', sci: 'Statilia nemoralis', where: '동아시아', credit: 'karliatje · CC BY 4.0 · 위키미디어 공용', hints: [
      '갈색이고 작은 편의 사마귀예요.',
      '앞다리 안쪽에 검은 무늬가 있어요.',
      '일본·중국 같은 동아시아의 숲에 살아요.'] },
    { id: 'new-guinea', file: 'new-guinea', name: 'Tamolanica tamolana', sci: 'Tamolanica tamolana', where: '뉴기니·오스트레일리아 북쪽', credit: 'Krapfi · CC BY-SA 4.0 · 위키미디어 공용', hints: [
      '크고 통통한 사마귀로 갈색이나 초록색이에요.',
      '넓은 날개에 잎맥 무늬가 뚜렷해요.',
      '뉴기니섬과 그 근처에 살아요.'] },
    { id: 'african-long', file: 'african-long', name: 'Tenodera superstitiosa', sci: 'Tenodera superstitiosa', where: '아프리카', credit: 'Bernard DUPONT from FRANCE · CC BY-SA 2.0 · 위키미디어 공용', hints: [
      '몸이 아주 가늘고 길쭉한 사마귀예요.',
      '날개 가장자리에 초록 줄이 있어요.',
      '아프리카 풀밭에 살아요.'] }
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
