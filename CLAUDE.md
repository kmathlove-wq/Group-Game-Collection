# 그룹 게임 컬렉션 — CLAUDE.md

## 프로젝트 개요
그룹 게임 컬렉션은 여럿이 함께 즐기는 온라인 게임을 한곳에 모으는 플랫폼이다.
현재 그림 퀴즈 `두들팡`, 노래 퀴즈 `송캐치`, 2~4인 `삼각형 땅따먹기`, 여럿/컴퓨터 대결 `끝말잇기`, 1인용 `절대 못 맞히는 퀴즈쇼`·`지오메트리 대쉬`·`버블보블`을 제공한다.
Express와 Socket.IO가 서로 분리된 두 게임의 방과 상태를 동기화한다.
방 상태는 메모리, 송캐치 음원 메타데이터와 관리자는 SQLite에 저장한다.

## 기술 구성
- 런타임: Node.js 20 이상
- 서버: Express 4, Socket.IO 4, SQLite, 세션·bcrypt·Multer
- 클라이언트: HTML, CSS, 바닐라 JavaScript, HTML Canvas
- 테스트: Node.js 내장 테스트 러너, `socket.io-client`
- 저장소: 게임 방은 메모리, 송캐치 콘텐츠는 SQLite
- 외부 유료 API와 프런트엔드 프레임워크는 사용하지 않음

## 파일 구조
```text
/
├── server.js                       # HTTP/Socket.IO 서버와 게임 규칙
├── package.json                    # start/dev/test 명령과 의존성
├── package-lock.json
├── README.md                       # 설치·테스트·배포·확장 설명
├── CLAUDE.md                       # Claude용 프로젝트 지식
├── AGENTS.md                       # Codex/에이전트용 작업 지침
├── lib/
│   ├── memory-room-store.js        # 교체 가능한 메모리 방 저장소
│   └── geometry-dash-scores.js     # 지오메트리 대쉬 전체 순위 파일 저장소
├── data/
│   ├── words.json                  # easy/normal/hard 제시어 목록 (난이도별 40개)
│   ├── music-game.db               # Git 제외, 송캐치 메타데이터
│   └── geometry-dash-scores.json   # Git 제외, 지오메트리 대쉬 전체 순위
├── src/music/ · triangle/ · word-chain/ # 송캐치 / 삼각형 땅따먹기 / 끝말잇기(사전 API) 서버
├── uploads/                        # Git 제외, 음원·이미지
├── public/
│   ├── games.html                  # 루트 게임 선택 화면
│   ├── index.html                  # 닉네임, 방 생성·검색·코드 입장
│   ├── room.html                   # 대기실, 게임, 모달 마크업
│   ├── main.js                     # 첫 화면과 공개 방 목록 로직
│   ├── room.js                     # 방 상태, 채팅, Canvas 클라이언트
│   ├── style.css                   # 전체 PC/모바일 반응형 스타일
│   ├── music*.html/js              # 송캐치 개인전·단체전
│   ├── impossible-quiz.*            # 20문제 1인용 퀴즈쇼
│   ├── bubble-bobble/              # 버블보블(원래 P17) 게임 파일·그림·음악
│   ├── admin*.html/js              # 숨겨진 관리자 화면
│   └── assets/                     # 두들팡 로고 PNG, geometry-dash/ 게임 그림
└── test/
    └── server.test.js              # 실제 Socket.IO 통합 테스트
```

## 실행과 검증
```bash
npm install
npm run dev       # http://localhost:3000
npm start         # node server.js
npm test          # node --test
```
- 서버 상태 확인: `GET /health`
- 기본 포트: `process.env.PORT || 3000`
- JS 변경 후 `node --check <파일>`과 `npm test`를 실행한다.
- `npm test`는 로컬 임시 포트를 열기 때문에 제한된 샌드박스에서는 권한 승인이 필요할 수 있다.

## 송캐치 운영 규칙
- `/music/solo`는 임시 서버 세션으로 3/5/10초 단계와 주관식·4지선다를 처리한다.
- `/music/lobby`, `/music/room`은 별도 `music:*` 이벤트와 최대 30인 방을 사용한다.
- `/admin-login`은 공개 메뉴에 표시하지 않고 서버 세션과 bcrypt 검증을 거친다.
- 최초 관리자는 관리자 테이블이 비었을 때 `ADMIN_USERNAME`, `ADMIN_PASSWORD`로만 생성한다.
- 공개 API와 방 상태에는 정답·별칭·저장 파일명을 넣지 않으며 음원은 만료 토큰으로 Range 스트리밍한다.
- 운영에서는 `MUSIC_DB_PATH`, `MUSIC_UPLOAD_DIR`를 SQLite와 업로드용 영구 디스크 안으로 지정한다.

## 브랜드와 UI
- 전체 사이트명은 `그룹 게임 컬렉션`, 패키지명은 `group-game-collection`이다.
- `두들팡`은 전체 사이트 안에 포함된 개별 게임 이름이다. 두 이름을 같은 의미로 사용하지 않는다.
- 현재 사용 로고는 `public/assets/doodlepang-logo-green.png`이다.
- 전체 사이트 탭/대표 로고는 `group-game-logo.png`, 게임 선택 배경은 `group-game-background.png`, 송캐치 로고는 초록 배경의 `songcatch-logo.png`다.
- 두 게임의 첫 화면은 컬렉션 상단 바와 중앙 카드 구조를 공유하며, 송캐치는 `songcatch-background.png`와 개인/단체 모드 선택을 사용한다.
- 화면 본문 이름은 `두들팡`, `송캐치`이고 브라우저 탭만 `그룹 게임 컬렉션-두들팡`, `그룹 게임 컬렉션-송캐치`를 사용한다. 송캐치 단체전 입장은 닉네임 카드와 방 만들기/공개 방/코드 입장 모달을 사용하고 PC 게임방은 참가자/문제판/채팅 3열이다.
- 송캐치 공개 방 모달은 제목 검색, 최신순/인원순 정렬, 입장 가능 필터와 두들팡형 방 카드를 제공한다.
- 송캐치 공개 방 검색창과 정렬 선택창은 두들팡 입력 필드와 같은 1.5px 테두리, 12px 모서리와 포커스 링을 사용한다.
- 송캐치 닉네임 입력은 브라우저 기본 모양이 남지 않도록 두들팡과 같은 전체 너비, 패딩, 배경, outline과 포커스 링을 명시한다.
- 송캐치 단체전 입장 카드·로고·모달·공개 방 카드 애니메이션은 `music-lobby.css`에 두고 `prefers-reduced-motion`에서 제거한다.
- 송캐치 방 종료는 방장 전용 `music:room:close`가 타이머와 방을 삭제하고 `music:room:closed`로 전원을 로비에 돌려보낸다.
- 송캐치 관리자 전용 레이아웃과 애니메이션은 `admin.css`에 두고 `prefers-reduced-motion`을 지원한다.
- 관리자 숨은 진입은 게임 선택 또는 송캐치 첫 화면의 송캐치 로고를 빠르게 5번 누른다. G 로고에는 연결하지 않는다.
- 첫 화면은 가운데 정렬된 카드, 게임방 PC 화면은 참가자/Canvas/채팅 3열이다.
- 모바일은 그림/채팅/참가자 하단 탭을 사용하며 기본 탭은 그림이다. 출제자에게만 그림 탭 안에 도구를 함께 표시한다.
- 출제자 도구의 빠른 색상 팔레트는 확장 색상을 가로 목록과 좌우 화살표로 제공하고 선택 색상을 강조한다.
- 태블릿은 그림판과 채팅을 2열로 동시에 표시하고 참가자 대기실은 헤더 버튼으로 여는 별도 창을 사용하며, 휴대폰만 하단 탭 레이아웃을 사용한다.
- 태블릿의 방장 시작/종료 메뉴는 세로 여유가 있으면 그림판 아래, 넓고 낮은 화면이면 그림판 왼쪽을 채워 배치한다.
- 태블릿 대기 화면의 비방장 Canvas 안내는 남는 공간까지 채우고, 정답자는 참가자 목록과 채팅 정답 알림에서 초록색으로 강조한다.
- 주요 CSS 변수는 `--purple`, `--purple-dark`, `--pink`, `--yellow`, `--mint`, `--ink`, `--muted`, `--line`이다.
- 사용자 문자열은 `innerHTML`로 삽입하지 말고 `textContent`를 사용한다.

## 게임 컬렉션 구조
- 루트 `/`는 전체 게임 선택 화면이며 실제 제공 중인 모든 게임을 같은 수준의 카드로 표시한다.
- 각 게임은 고유 이름, 로고, 설명과 진입 경로를 가지며 서로의 상태와 로직을 섞지 않는다.
- 공통 사이트 헤더와 선택 화면은 `그룹 게임 컬렉션` 브랜드를 사용한다.
- 두들팡 방·Canvas·정답 로직은 게임 전용 모듈로 이동할 수 있게 새 공통 코드와 결합도를 낮게 유지한다.
- 실제 두 번째 게임을 추가하기 전에는 기능 없는 빈 게임 카드나 작동하지 않는 선택지를 노출하지 않는다.
- `/triangle`(입장)·`/triangle/room`은 2~4인 `삼각형 땅따먹기`다. `src/triangle/index.js`가 `tri:*` 이벤트·메모리 방·차례·점수를 소유하고, `src/triangle/geometry.js`는 서버와 브라우저(`/triangle-geometry.js`)가 함께 쓰는 판정 모듈이다(화면 `public/triangle-*`, 테스트 `test/triangle.test.js`, 사용자 키 `triangle:userId`). 점 수 `인원×7+4`, 선 교차·점 스침(`POINT_CLEARANCE`) 금지, 새 선으로 닫힌 "안에 점 없는" 삼각형만 그은 사람 땅(동시 2개 가능), 보너스 차례 없음, 차례 시간 15/30/60초/무제한(0, 방장 선택), 게임 중 입장 불가, 끊김 3초 유예 뒤 차례 건너뜀, 더 그을 선이 없으면 종료하고 동점은 같은 등수다. 점은 칸 나눔+흔들기로 배치하고 일직선 검사는 이웃 점끼리만 한다(판 전체 검사는 점 20개 이상에서 수학적으로 불가능). 그래서 테두리 근처 작은 틈은 땅이 안 될 수 있다.
- `/word-chain`(모드 선택)·`/word-chain/solo`(컴퓨터 대결)·`/word-chain/lobby`·`/word-chain/room`(2~8인)은 `끝말잇기`다. `src/word-chain/index.js`가 `wc:*` 이벤트·메모리 방과 `/api/word-chain/solo*` 서버 세션(30분)·`/api/word-chain/status`를, `rules.js`가 두음법칙(P07 `app.py`와 같은 표, 원음+정방향+역방향 시작 허용)·사전 전 검사(한글 2~20자, 이어짐, 중복)와 입력 다듬기(`typedWord`: 띄어쓰기·특수문자·이모지는 자동으로 지우고 글자·숫자는 남김 — '사과!'→'사과')를, `dictionary.js`가 국립국어원 공식 API(표준국어대사전 `STDICT_API_KEY`·우리말샘 `OPENDICT_API_KEY`, P07과 같은 키 이름·매개변수, `method=exact` 단어 확인·`method=start` 이어짐/컴퓨터 단어, 30분 캐시)를, `one-shot-store.js`가 끝 글자별 이어짐 여부 단어장(`data/word-chain-one-shot.json` 또는 `WORD_CHAIN_STORE_PATH`, Git 제외, 약 6개월, 2초 모아 쓰기)을 소유한다. 사전은 방장이 방 만들 때(혼자는 시작 전) 하나 고르고, 명사만 허용하며, 끝말이 새로 시작될 때(첫 단어·탈락 직후)만 한방단어 입력을 거부한다. 통과한 단어의 한방 여부는 단어 확인 시간에 넣지 않는다: 단어장에 있으면 즉시, 없으면 차례를 넘긴 뒤 뒤에서 `hasContinuation`으로 확인·저장하고(`watchOneShot`), 한방이면 `wc:one-shot`과 함께 지금 차례인 사람을 바로 탈락시킨다(끝말이 이미 바뀌었으면 무시). 혼자 모드는 컴퓨터 단어가 한방이면 즉시 패배, 모르면 `checkOneShot` 응답 뒤 화면이 `GET /solo/:id/one-shot`으로 결과를 따로 기다린다. 혼자는 내가/컴퓨터 먼저(`first`, 컴퓨터는 흔한 글자 중 한방 아닌 첫 단어) 선택. 방장은 대기실에서 `wc:room:order`(▲▼ `dir`·`shuffle`)로 차례 순서를 정하며 `room.players` Map 순서가 곧 차례다. 차례 시간 0(제한 없음)/10/15/20/30초, 내 차례 `wc:giveup` 포기, 사전 확인 중 시계 정지, 틀리면 시간 안 재입력, 시간 초과·포기는 탈락 후 다음 사람이 새 단어로 시작, 끊김은 3초 뒤 차례 건너뜀, 마지막 생존자 우승이다. 키는 서버에만 두며, 테스트(`test/word-chain.test.js`)는 가짜 사전과 `secondMs` 옵션으로 키 없이 돈다. 사용자 키 `wordchain:userId`.
- 끝말잇기 혼자 모드는 `mode`로 `basic`(원래 무작위 컴퓨터, 그대로 유지)과 `growth`(성장하는 컴퓨터)를 고른다. 성장 모드에서 사람이 이기면 끝 글자가 한방으로 확인된 경우에만 마지막 세 단어(사람 A→컴퓨터 B→사람 C)를 `brain.js` 기억 노트(`data/word-chain-brain.json` 또는 `WORD_CHAIN_BRAIN_PATH`, Git 제외, 모두 공유, 사전·종류별 30,000개)에 C=📒`shot`·A=🪤`trap`·B=🚫`risky`로 적는다. 컴퓨터가 한방단어로 이긴 판(즉시 판정·`/one-shot` 판정 모두)도 같은 방식으로 컴퓨터 A→사람 B→컴퓨터 C를 배운다(사람이 말한 B가 🚫조심). 🪤 함정 A는 A의 끝 글자 뒤 `countContinuation`이 3개(`TRAP_LIMIT`) 이하일 때만 적고(요요→요리·요가… 는 빠져나갈 수 있어 제외, 수산화나트륨→윰 단어 2개는 함정), 쓸 때(`findTrap`)도 단어장 목록(`fewContinuations`)상 3개를 넘는 함정은 쓰지 않고 지운다. 컴퓨터 차례 순서는 아래 `growthPick` 항목을 따른다(응답 `computer.how` = memory/trap/attack/hard). 레벨·확률은 `strengthOf(배운 개수)`(0부터 10개마다 1레벨 — 0~9개 레벨 0, 레벨 제한 없음, 두 확률은 항상 1 — 목표는 이길 수 없는 컴퓨터), 현황은 `GET /api/word-chain/solo/brain`. 기본 모드 컴퓨터는 배운 걸 쓰지 않지만(원래 무작위 그대로), 기본 모드·여럿이 방에서 나온 단어도 성장 컴퓨터가 배운다: 혼자 모드는 모드와 상관없이 한방으로 끝난 판을 `learnWin`(→`learnChain`)으로, 여럿이 방은 `oneShotHit` 때 그 끝말 줄기(마지막 `fresh` 단어부터)의 마지막 세 단어를 `learnChain`으로 배우고, 첫 단어 한방 거절(`checkWord`의 `oneShotWord`, 화면 응답에선 뺌)은 모든 모드에서 `learnBlocked`로 📒에 적는다. 기억 노트는 지우지 않고(종류 `hard`=🧩 포함), 한방 단어장만 글자별 6개월 뒤 다시 확인한다. 📒 단어를 썼는데 한방이 아니라고 판정되면 게임은 그대로 두고 뒤에서 `countContinuation`으로 세어 10개(`HARD_LIMIT`) 이하면 `hard`로 옮기고 넘으면 지운다. 또 성장 모드에서 나온 모든 단어(사람·컴퓨터)는 뒤에서 `noteHard`가 끝 글자 뒤 `countContinuation`을 세어 1~10개면 `hard`에 적는다(0개·자기 자신뿐인 단어는 shot 쪽, 혼자 모드 기본·성장과 여럿이 방 모두). 컴퓨터는 끝낼 공격이 없을 때 🚫조심 단어·조심 글자로 끝나는 것을 뺀 `hard`를 쓴다(`how: 'hard'`, `brain.find`의 `accept`). 꺼내 쓴 `hard` 단어는 뒤에서 `recheckHard`가 다시 세어 10개를 넘으면 지운다. `countContinuation`은 앞 두 묶음(80개)만 보므로, 못 본 단어(`total` - 본 수)가 limit보다 많으면 "많다"(limit+1)로 본다(우리말샘 '장'은 앞쪽이 한 글자 낱말로 가득해 '름장'이 🧩로 잘못 적혔던 문제).
- 끝말잇기 🏆 필승 단어(`forcedWin`, `FORCED_DEPTH` 3): 한방이거나, 상대가 이어 낼 단어(단어장 `fewContinuations` 목록이 있을 때만)마다 📒·🪤 노트(`answerBook`)에 다시 필승인 답이 있는 단어. 사전에 새로 묻지 않는다. `learnChain`은 마지막 세 단어를 배운 뒤 끝에서 3·5번째 단어(C와 같은 쪽)가 필승이면 🪤 `trap`에 적고(사갈→갈륨→윰라대왕→왕듸→듸굴이→이리듐💥이면 왕듸·갈륨, 갈륨의 다른 답 윰차→차풰💥), `findTrap`은 필승 함정을 3개 제한·`safeFor` 없이 먼저 쓴다. `answerBook`과 필승 찾기는 🧩 `hard` 노트도 본다(갈륨·왕듸는 이어 갈 단어가 2개라 🪤보다 🧩에 먼저 적힘, 컴퓨터 후보는 앞쪽 묶음뿐이라 갈륨을 못 봄). 🧩에서 찾은 필승 단어는 쓰면서 🪤에 옮겨 적는다.
- 끝말잇기 컴퓨터 후보 묶음(`candidates`): 첫 묶음(`start` 1쪽)과 다양성용 무작위 묶음을 동시에 묻는다. 시작 글자별 전체 수(`totals`, 1쪽 응답 때 기록)를 알아야 무작위 묶음 번호를 고를 수 있어 처음 보는 글자는 1쪽만 쓰고, 고른 묶음 번호는 30초(`EXTRA_PAGE_KEEP_MS`) 유지한다. 혼자 모드는 `checkWord(..., { warm: true })`가 내 단어 확인 중에 `warmCandidates`로 컴퓨터 후보 묶음을 미리 물어 둔다(여럿이 방은 안 함). 응답의 `took`(check·computer ms)와 2초 넘는 사전 질문 로그(`SLOW_LOG_MS`)는 느린 곳을 찾는 용도다. `start` 질문은 한 묶음 40개(`PAGE_SIZE`, 100개는 Render에서 묶음당 약 3초), 무작위 묶음 상한 25(약 1,000개 범위), 끝 글자 검색은 100개(`END_PAGE_SIZE`). 2026-10-06 실측(표준국어대사전·기본 모드 8단어): 컴퓨터 고르기 평균 예전 약 5초 → 동시 묻기 2.1초 → +40개 묶음 0.8초.
- 끝말잇기 사전 질문(`dictionary.js` `request`): 사전 서버가 일부 질문에 아예 대답하지 않는 날이 있어(대답할 땐 1초 안), 1.5초(`hedgeMs`) 안에 답이 없거나 첫 질문이 바로 끊기면 같은 질문을 하나 더 보내 먼저 온 답을 쓰고 나머지는 취소한다(질문당 최대 8초 `requestTimeoutMs`, 최대 2개, 답이 오면 예약된 두 번째 질문은 보내지 않음, `requests`는 실제로 보낸 수). 서버가 분명히 거절한 `DictionaryError`(키 오류 등)는 다시 묻지 않는다.
- 끝말잇기 사전 속도·한방 판정: `checkWord`는 규칙 통과 직후 끝 글자 `hasContinuation`을 미리 묻는다(사전 확인과 동시, 결과는 단어장·진행 중 질문 공유로 재사용). `askContinuation`·`pickWord`는 두음 시작 글자들을 한꺼번에 묻고, `askContinuation`은 `{ has, words }`(이어 갈 단어 5개(`FEW_WORDS`) 이하면 목록, 한 글자라도 많으면 바로 답)를 단어장에 남기고, 일부 실패+나머지 없음이면 실패(한방 단정 금지), 일부 실패+단어 있음이면 목록 없이 true. 한방 판단(`knownContinuation`/`hasContinuation`의 `used`)은 항상 이번 판에 나온 단어를 빼고 한다: 이어 갈 단어가 자기 자신뿐인 단어(표준국어대사전 '늡늡' — '늡'으로 시작하는 명사가 늡늡뿐)는 내는 순간 한방이다. 그래서 혼자 모드 판정·방의 `watchOneShot`·첫 단어 한방 금지(`usedWith(used, word)`)·성장 컴퓨터 공격 후보·첫 단어 고르기에 모두 `used`를 넘기고, 성장 노트 학습(`learnWin`)은 그 판 사정이 아닌 C 자신만 뺀 기준으로 확인하며, 미리 공부하기는 이어 갈 단어가 자기 자신 하나뿐인 글자(`fewContinuations`)의 그 단어를 `shot`으로 적는다. 한방 단어장 파일은 버전 2(`words` 포함)이며, 버전 1 파일의 `has: true` 기록은 목록이 없어 불러올 때 버리고 다시 묻는다(`has: false`는 유지). 방·혼자 모두 한방 확인이 사전 오류로 실패하면 `continuationWithRetry`가 3초(`oneShotRetryMs`) 뒤 최대 3번 다시 묻고 끝말이 바뀌면 그만둔다.
- 끝말잇기 성장 컴퓨터 고르기 순서(`growthPick`): 📒shot → 🪤trap → 한방 글자로 끝나는 사전 후보(`attack`) → 🧩hard → 🔭내다보기. 🪤·🧩·🔭는 `safeFor`가 위험하다고 본 단어를 뺀다: 🚫risky 단어, risky 단어의 끝 글자로 끝나는 단어, 끝 글자(두음 포함) 뒤에 상대가 쓸 수 있는(아직 안 나온) 📒shot 단어가 있는 단어(가돌리늄을 알면 '…가'로 끝나는 단어). 내다보기는 안전한 후보가 없으면 전체에서 고르고(어쩔 수 없을 때), 후보 최대 6개(`LOOKAHEAD_SIZE`)의 끝 글자 `countContinuation`(30개까지)을 한꺼번에 세어 1.5초(`lookaheadMs`) 안에 센 것 중 가장 적은 것을 고른다. 사전 후보 목록은 `dictionary.candidates`(pickWord는 기본 모드·첫 단어용). 성장 모드의 컴퓨터 첫 단어도 미리 골라 둔 단어가 위험하면 `growthOpener`가 흔한 시작 글자 후보 중 안전하고 한방 아닌 단어로 바꾼다(못 찾으면 그대로).
- 📚 미리 공부하기(`src/word-chain/study.js`): 서버가 깨어 있고 최근 30초 게임(`study.gameActive()`)이 없을 때 3초마다 가~힣 11,172자를 차례로 `hasContinuation`해 한방 글자면 `wordsEndingWith`(method=end, 최대 300개)로 그 글자로 끝나는 단어를 brain `shot`에 적는다(레벨에 포함, brain은 사전·종류별 30,000개). 한방 단어장에 답이 있는 글자는 건너뛰고, 사전별 하루(한국 시간) 1,000번(`dictionary.requests` 차이로 셈)까지, 사전 오류 시 그 글자에 머물고 1분 쉰다. 진행(`cursor`·`day`·`used`)은 `data/word-chain-study.json`(또는 `WORD_CHAIN_STUDY_PATH`, Git 제외)과 Gist `word-chain-study.json`에 남고, 현황은 `/solo/brain`의 `study`. 타이머는 `server.js`가 직접 실행할 때만 켠다.
- Render 무료 서버는 다시 켜질 때 파일이 지워지므로 `lib/gist-sync.js`가 `GIST_TOKEN`·`GIST_ID` 설정 시 한방 단어장·기억 노트를 비공개 Gist에도 보관한다(시작 때 한 번에 불러와 합침, 10초 모아 한 번의 PATCH, SIGTERM/SIGINT 때 flush, 실패 시 1분 뒤 재시도). 불러오기에 성공하기 전에는 그 파일을 절대 올리지 않는다(빈 노트로 Gist를 덮어쓰는 사고 방지). 토큰은 환경 변수로만 받고 로그에 넣지 않으며, 테스트(`test/gist-sync.test.js`)는 가짜 GitHub로 돈다.
- `/impossible-quiz`는 서버 방 없이 `group-game:impossible-quiz:v1` 로컬 저장 상태를 사용하는 1인용 고정 순서 게임이다.
- `/geometry-dash`는 서버 방 없이 Canvas로 직접 그린 1인용 점프 액션 게임이다. 원작 그래픽·음원은 쓰지 않는다. 배경·캐릭터·장애물은 `public/assets/geometry-dash/`의 자체 제작 그림(AI 생성 후 투명 배경·워터마크 보정)을 `drawImage`로 그리고(로드 실패 시 단색 도형 대체, 구덩이는 항상 벡터), 비행 구간 장애물은 그림 하나를 위아래로 뒤집어 재사용한다. 효과음·배경음악은 WebAudio로 직접 합성한다. 순위는 `lib/geometry-dash-scores.js`가 `data/geometry-dash-scores.json`(Git 제외)에 상위 50개를 저장하는 전체 통합 순위이며, `GET/POST /api/geometry-dash/scores`로 조회·제출한다. 제출은 점수 상한과 IP당 2초 쿨다운으로만 검사하고 서버가 물리를 재현하지는 않는다. 가시·블록·구덩이 외에 누르고 있으면 뜨고 떼면 떨어지는 비행 구간(`flight-ceiling`/`flight-floor`)이 있다. 점프·비행 물리 상수를 바꾸면 통과 가능성을 오프라인 시뮬레이션으로 먼저 검증한다(임의 컨트롤러로 실패율 0%가 기준).
- `/bubble-bobble/`은 원래 별도 프로젝트(P17)였던 순수 Canvas 1인용 게임으로 `public/bubble-bobble/`에 그림·음악과 함께 들어 있고 상대경로로 에셋을 읽으므로 끝 슬래시 주소를 쓴다(설계 문서는 `docs/bubble-bobble/`). 순위는 `server.js`의 `registerScoreboard(slug, scoreMax)`로 지오메트리 대쉬와 같은 저장소 구현을 쓰되 `data/bubble-bobble-scores.json`(Git 제외)·`/api/bubble-bobble/scores`·쿨다운을 따로 둔다(상한 9,999,999점). 게임오버·엔딩 때 HTML 순위 창(`js/ranking.js`)을 띄우고 닫혀야 타이틀로 가며, `data-ui` 요소 안의 키·마우스 입력은 `input.js`가 게임 조작으로 가로채지 않는다.
- 퀴즈쇼는 총 20문항, 4·5번 항상 오답, 18점 만점이며 20번 제출 전까지 누적 점수를 화면에 노출하지 않는다.
- 퀴즈쇼 저장 점수는 답안 `history`를 다시 채점해 복구하며, 객관식은 저장된 `choice`를 우선하고 20번 진입·제출 시에도 저장된 `score` 대신 앞선 답안을 즉시 재채점한다.
- 퀴즈쇼 9번은 35개의 1을 절대 위치로 불규칙 배치하고, Ctrl 두 번 숨은 창의 비밀번호가 맞으면 퀴즈 음성을 문제→보기와 정오답 순서로 재생한다. 분기 오답 파일은 `WRONG_AUDIO_VARIANTS`로 명시한다.

## 사용자와 방 규칙
- 브라우저별 임시 사용자 ID는 legacy 키 `catchmind:userId`로 `localStorage`에 저장한다.
- 닉네임도 `catchmind:nickname`에 저장한다. 키 이름은 브랜드 변경 전 호환성을 위해 유지 중이다.
- 닉네임은 공백만 입력할 수 없고 최대 30자이며, 이모지와 일반 특수문자는 허용한다.
- 같은 방에서는 대소문자를 무시한 중복 닉네임을 허용하지 않는다.
- 방 코드는 혼동 문자를 뺀 영문 대문자·숫자 6자리다.
- 최대 인원은 2~30명, 라운드 시간은 30/60/90/120초, 전체 라운드는 1~100회다.
- 방 상태는 `waiting`, `playing`, `roundResult`, `finished` 네 종류다.
- 공개방만 목록에 보이며 진행 중 입장은 `allowLateJoin`이 켜진 경우에만 허용한다.
- 마지막 참가자가 나가면 방을 즉시 삭제한다.

## 방장 기능
- 게임 시작, 설정 변경, 강퇴, 방장 위임, 방 종료는 서버에서 방장 권한을 검사한다.
- `hostParticipates`가 꺼진 방장은 진행 전용이며 출제·정답 판정·점수·순위에서 제외되고 정답을 볼 수 있다.
- `hostParticipates`가 켜진 방장은 일반 참가자처럼 출제와 정답 맞히기에 참여하며, 출제자가 아닐 때는 정답을 받지 않는다.
- 참여 방장이 게임을 시작할 때는 최종 정답을 미리 알 수 없도록 무작위 계열 제시어(`random`·`customList`, 또는 무작위 후보를 쓰는 `choose`)만 허용한다.
- 사용자 단어 목록은 한 줄에 하나씩 10~100개를 입력하며, 서버가 공백·대소문자를 정규화해 중복과 항목당 30자 제한을 검사한다.
- `wordMode` `choose`는 후보 2~5개(무작위 또는 방장 직접 입력)를 `game:choose-word`로 출제자에게만 보내고, 출제자의 `game:pick-word` 또는 15초 자동 선택 뒤 `endAt`이 시작된다. 그 전까지는 그리기·정답이 잠긴다.
- 한 게임에서 이미 나온 무작위 제시어는 `room.game.usedWords`로 기억해 남은 후보가 있으면 다시 뽑지 않는다.
- 참가자 이름 옆 점 세 개 버튼은 방장 넘기기/강퇴하기 팝업 메뉴를 연다.
- 대기실의 방 종료 버튼은 방장에게만 보인다.
- 방장이 나가거나 30초 안에 재접속하지 않으면 접속 중인 다음 참가자에게 방장을 자동 위임하고, 진행 전용이면 정답을 다시 보낸다.
- 방 종료 시 `room:closed`, 강퇴 시 `room:kicked`를 대상에게 전송한다.
- 방 종료 버튼은 대기실·라운드 결과·최종 결과와 결과 모달에서 사용할 수 있고 진행 중 라운드에서는 숨긴다.
- 직접 퇴장과 강퇴는 첫 화면에서 서로 다른 일회성 알림을 표시한다.

## 게임과 정답 보안
- 게임 상태와 점수는 항상 서버가 결정한다. 클라이언트가 점수나 정답 여부를 보내게 만들지 않는다.
- `room:state`와 공개 방 목록에는 정답 문자열을 절대 포함하지 않는다.
- 정답은 `game:secret`으로 현재 출제자와 진행 전용 방장의 개인 socket ID에만 전송한다.
- 정답 비교는 앞뒤 공백, 대소문자, 연속 공백을 정규화하고 설정에 따라 모든 공백을 무시한다.
- 정답(2글자 이상)과 정확히 한 글자 차이인 오답은 그 사람에게만 `answer:close`로 알리고 채팅 기록·다른 참가자에게는 남기지 않는다.
- 출제자와 이미 맞힌 참가자가 정답 문자열을 보내도 일반 채팅으로 노출하지 않는다.
- 라운드 진행 중 출제자와 이미 맞힌 참가자는 채팅 입력 전체를 사용할 수 없고 서버도 `chat:send`를 거부한다.
- 점수는 1등 100, 2등 80, 3등 60, 이후 40점에 남은 시간 보너스를 더한다.
- 출제자는 정답자 한 명마다 10점을 얻는다.
- 서버의 `endAt`을 기준으로 타이머를 계산하고 서버 타이머가 라운드를 종료한다.
- 힌트는 서버가 마스킹 문자열만 만들어 보내며 정답 전체를 공개하지 않는다.
- 공백 제외 2글자 이하 정답은 힌트 단계가 진행되어도 글자를 공개하지 않는다.

## Canvas 동기화
- 좌표는 Canvas 크기와 무관하게 0~1 범위로 정규화한다.
- 클라이언트는 포인터 선분을 약 24ms 간격, 최대 30개씩 묶어 `canvas:draw`로 보낸다.
- 서버는 `playing` 상태와 현재 출제자, 좌표·색상·굵기·도구를 검사한다.
- 한 방의 현재 라운드 동작만 `drawingActions`에 보관한다.
- 재접속/중도 입장에는 `canvas:sync`로 현재 보이는 stroke 목록을 전달한다.
- `clear`, `undo`, `redo`는 `canvas:action`으로 처리하며 서버 기록을 기준으로 다시 그린다.
- 전체 Canvas 이미지를 매 프레임 Socket.IO로 보내지 않는다.
- Canvas CSS 요소는 원본 8:5 비율을 보존해야 하며 `object-fit` 여백으로 터치 좌표와 그림 위치가 어긋나게 만들지 않는다.
- 대기 안내 오버레이는 `ResizeObserver`로 실제 Canvas의 화면상 경계에 맞춰 두 겹 그림판처럼 보이지 않게 한다.

## 재접속과 성능
- 연결이 끊기면 3초 뒤에 이탈 알림·오프라인 표시·라운드 정리(출제자면 라운드 종료)를 하며, 그 안에 재접속하면 조용히 복구한다. 이후 30초 동안 참가자, 점수와 역할을 유지한다.
- 첫 화면(`main.js`)은 서버에 미리 입장하지 않고, 게임 화면(`room.js`)에서만 `room:join`한다. 위 3초 지연이 화면 이동 중 오탐 알림을 막는다.
- 같은 `userId`가 돌아오면 기존 socket ID를 교체하고 방/Canvas/비밀 제시어 상태를 복구한다.
- 채팅은 방마다 최근 100개까지만 저장한다.
- 채팅은 사용자별 5초당 7개, 그림 요청은 초당 70개로 제한한다.
- 그림 액션은 최대 2,000개이며 라운드 종료 시 삭제한다.
- Socket.IO room 범위로만 방송하고 전체 사용자에게 그림 이벤트를 보내지 않는다.

## 주요 Socket.IO 이벤트
| 영역 | 클라이언트 요청 | 서버 알림 |
|---|---|---|
| 방 | `rooms:request`, `room:create`, `room:join`, `room:leave` | `rooms:list`, `room:state` |
| 관리 | `room:ready`, `room:settings`, `room:transfer`, `room:kick`, `room:close` | `room:kicked`, `room:closed` |
| 게임 | `game:start`, `game:restart`, `game:lobby`, `game:pick-word` | `game:secret`, `game:hint`, `game:choose-word`, `round:ended` |
| 채팅 | `chat:send` | `chat:message`, `answer:correct`, `answer:close` |
| 그림 | `canvas:draw`, `canvas:action` | `canvas:draw`, `canvas:sync` |

## 작업 규칙
- 사용자가 변경을 요청하면 답변으로만 설명하지 말고 실제 프로젝트 파일에 반영한다. 검토 결과 바꿀 내용이 없을 때만 그대로 둔다.
- 사용자 요청 없이 기존 변경사항, 파일 또는 기능을 되돌리거나 삭제하지 않는다.
- 변경 전 관련 HTML/JS/CSS와 서버 이벤트를 함께 확인한다.
- 클라이언트 입력을 신뢰하지 말고 권한, 방 상태, 길이와 범위를 서버에서 재검사한다.
- 정답·점수·방장·출제자 권한의 서버 주도 원칙을 깨지 않는다.
- 새 이벤트를 추가하면 요청 측, 수신 측, ack 오류 처리와 재접속 동작을 함께 구현한다.
- 사용자 표시 문자열은 DOM API의 `textContent`를 사용해 XSS를 방지한다.
- 기존 `localStorage`/`sessionStorage` 키를 바꿀 때는 이전 사용자 호환성을 고려한다.
- 모바일과 PC 레이아웃을 모두 확인하고 Canvas 정규화 좌표 규칙을 유지한다.
- 패키지는 꼭 필요한 경우에만 추가하고 `package-lock.json`을 함께 갱신한다.
- 코드 변경 후 최소한 `node --check`, `git diff --check`, `npm test`를 실행한다.
- 테스트 실패를 숨기거나 미완성 기능을 완성된 것처럼 문서화하지 않는다.
- 사용자가 GitHub 업로드를 금지하지 않은 경우, 변경과 검증이 끝나면 관련 파일을 커밋하고 배포 브랜치에 push한다.
- 새로 확인한 중요한 프로젝트 불변 조건은 `CLAUDE.md`와 `AGENTS.md`에 반영한다.

## 배포와 확장 주의
- GitHub Pages만으로는 Socket.IO 서버를 실행할 수 없다.
- Render/Railway/Fly.io/VPS에서 Express와 Socket.IO를 같은 Node.js 서버로 실행한다.
- 현재는 단일 인스턴스 전용이다. 수평 확장 전 Redis 저장소와 Socket.IO Redis adapter가 필요하다.
- 로그인, 영구 전적, 실제 음원, 신고/차단, 운영 환경 30명 장시간 부하 테스트는 아직 없다.
- 비밀키와 토큰은 코드·문서·로그에 넣지 않는다.
