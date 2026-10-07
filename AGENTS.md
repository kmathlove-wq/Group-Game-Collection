# 그룹 게임 컬렉션 — AGENTS.md

## 프로젝트 목적
그룹 게임 컬렉션은 그림 퀴즈 `두들팡`, 음원 퀴즈 `송캐치`, 2~4인 `삼각형 땅따먹기`, 여럿/컴퓨터 대결 `끝말잇기`, 1인용 `절대 못 맞히는 퀴즈쇼`·`지오메트리 대쉬`·`버블보블`을 운영한다.
이 문서는 코드 에이전트가 기존 보안·게임 규칙을 훼손하지 않고 변경하도록 돕는 저장소 지침이다.

## 빠른 시작
```bash
npm install
npm run dev       # http://localhost:3000
npm test          # Socket.IO 통합 테스트
```
- Node.js 20 이상을 사용한다. 송캐치 SQLite 드라이버의 지원 범위 때문에 18은 지원하지 않는다.
- `PORT`가 없으면 3000번 포트에서 실행하고, `GET /health`로 서버와 현재 방 수를 확인한다.

## 저장소 지도
```text
server.js                    Express/Socket.IO, 방·라운드·점수·권한
lib/memory-room-store.js     메모리 방 저장소 경계
lib/geometry-dash-scores.js  지오메트리 대쉬 전체 순위 파일 저장소
data/words.json              난이도별 기본 제시어
public/index.html            첫 화면과 방 생성/검색 모달
public/main.js               닉네임, 사용자 ID, 공개 방 목록
public/room.html             대기실/게임/결과 화면 마크업
public/room.js               방 상태 렌더링, 채팅, Canvas, 효과음
public/style.css             공통·PC·모바일 전체 스타일
public/assets/               두들팡 로고 이미지
public/impossible-quiz.*     1인용 퀴즈쇼 화면·스타일·문제 데이터·진행
public/assets/impossible-quiz/ 퀴즈쇼 15·17번 문제 이미지
public/bubble-bobble/        버블보블 게임(그림·음악 포함), 설계 문서는 docs/bubble-bobble/
src/music/ · triangle/ · word-chain/  송캐치 / 삼각형 땅따먹기 / 끝말잇기(사전 API) 서버
public/music*·admin*         송캐치 첫 화면·개인전·단체전 / 숨겨진 관리자 화면
uploads/                     Git에 넣지 않는 관리자 음원·이미지
test/server.test.js          실제 소켓을 여는 통합 테스트
README.md                    사용자용 설치·배포 문서
CLAUDE.md                    상세 프로젝트 지식
```

## 아키텍처 경계
- 서버가 Express 정적 파일과 Socket.IO를 한 HTTP 서버에서 제공한다.
- `MemoryRoomStore`는 Map 기반이며 서버 재시작 시 모든 데이터가 사라진다.
- 브라우저는 화면 상태를 소유하지 않고 서버의 `room:state`를 렌더링한다.
- 한 사용자는 `localStorage`의 `catchmind:userId`로 식별한다. legacy 키이므로 이름만 보고 임의 변경하지 않는다.
- socket의 `socket.data.userId`와 `socket.data.roomCode`를 서버 권한 검사의 출발점으로 사용한다.

## 게임 컬렉션 확장 원칙
- 전체 사이트 브랜드는 `그룹 게임 컬렉션`, 현재 개별 게임 브랜드는 `두들팡`이다.
- 게임이 두 개 이상이 되면 `/`를 게임 선택 화면으로 만들고 두들팡을 포함한 모든 실제 게임을 카드로 제공한다.
- 새 게임은 고유 slug와 진입점, 서버 상태, 클라이언트 로직을 가져야 한다.
- 공통 사용자 경험과 사이트 셸만 공유하고 게임별 정답·점수·방 상태는 분리한다.
- 기존 두들팡 이벤트 이름과 동작을 새 게임의 규칙에 억지로 재사용하지 않는다.
- 아직 구현하지 않은 게임은 선택 화면에 작동하는 것처럼 노출하지 않는다.
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
- `/impossible-quiz`는 서버 방 없이 브라우저 `localStorage`로 진행을 복구하는 고정 순서 20문제 1인용 게임이다.
- `/geometry-dash`는 서버 방 없이 Canvas로 직접 그린 1인용 점프 액션 게임이다. 원작 그래픽·음원은 쓰지 않는다. 배경·캐릭터·장애물은 `public/assets/geometry-dash/`의 그림을 `drawImage`로 그리고, 효과음·배경음악은 WebAudio로 합성한다. 순위는 개인 저장이 아니라 `lib/geometry-dash-scores.js`가 `data/geometry-dash-scores.json`(Git 제외)에 상위 50개를 저장하는 전체 통합 순위이며, `GET/POST /api/geometry-dash/scores`로 조회·제출한다(`SCORE_MAX`, IP당 2초 쿨다운, 물리 재현 없음). 가시·블록·구덩이 외에 누르면 뜨고 떼면 떨어지는 비행 구간이 있다. 점프·비행 물리 상수를 바꾸면 통과 가능성을 오프라인 시뮬레이션으로 먼저 검증한다. `/bubble-bobble/`은 원래 별도 프로젝트(P17)였던 순수 Canvas 1인용 게임으로 `public/bubble-bobble/`에 그림·음악과 함께 들어 있고 상대경로로 에셋을 읽으므로 끝 슬래시 주소를 쓴다(설계 문서는 `docs/bubble-bobble/`). 순위는 `server.js`의 `registerScoreboard(slug, scoreMax)`로 지오메트리 대쉬와 같은 저장소 구현을 쓰되 `data/bubble-bobble-scores.json`(Git 제외)·`/api/bubble-bobble/scores`·쿨다운을 따로 둔다(상한 9,999,999점). 게임오버·엔딩 때 HTML 순위 창(`js/ranking.js`)을 띄우고 닫혀야 타이틀로 가며, `data-ui` 요소 안의 키·마우스 입력은 `input.js`가 게임 조작으로 가로채지 않는다.
- 퀴즈쇼 4·5번은 항상 오답이며 최고 가능 점수는 18점이다. 진행 중 실제 점수는 20번 판정 때문에 공개하지 않는다.
- 퀴즈쇼 저장 점수는 신뢰하지 않고 `history`를 다시 채점해 복구하며, 객관식은 저장된 `choice`를 우선하고 20번 진입·제출 시에도 앞선 답안을 즉시 재채점한다.
- 퀴즈쇼 9번은 35개의 1을 불규칙 배치하며, Ctrl을 500ms 안에 두 번 누르고 비밀번호를 통과하면 문제·보기·정오답 MP3를 순서대로 재생한다. 여러 오답 파일은 `WRONG_AUDIO_VARIANTS`의 선택지별 번호를 따른다.

## 송캐치 불변 조건
- `/`는 게임 선택, `/doodlepang`은 두들팡, `/music`은 송캐치 진입점이다.
- 관리자 계정은 환경 변수로 최초 생성하고 bcrypt 해시·서버 세션·로그인 제한을 사용한다.
- 실제 음원 파일명과 정답·별칭은 공개 목록이나 `music:room:state`에 포함하지 않는다.
- 음원은 만료되는 무작위 토큰으로만 스트리밍하며 Range 요청을 지원한다.
- SQLite와 업로드 폴더는 `MUSIC_DB_PATH`, `MUSIC_UPLOAD_DIR`로 영구 디스크에 함께 저장하고 Git에는 올리지 않는다.
- 송캐치 단체전은 별도 `music:*` 이벤트와 메모리 방을 사용하며 최대 30명이다.
- 정답과 점수는 서버에서 판정하며, 이미 맞힌 사용자는 해당 문제에서 답안·채팅을 다시 보낼 수 없다.
- 업로드는 확장자·MIME·크기·구간을 검사하고 저작권 확인 동의를 필수로 받는다.

## 핵심 상태
- 방 상태: `waiting` → `playing` → `roundResult` → 다음 `playing` 또는 `finished`.
- 방은 `settings`, `hostId`, `players`, `chat`, `game`, 생성/활동 시간을 가진다.
- 참가자는 `userId`, `socketId`, 닉네임, 점수, 준비/연결 상태, 정답/출제 횟수를 가진다.
- 게임은 라운드, 출제자, 비공개 정답, 허용 답안, 정답자 집합, 종료 시각, 힌트, 그림 액션을 가진다.
- `roomState()`는 공개 가능한 값만 반환해야 한다. 정답과 허용 답안을 추가하지 않는다.

## 권한 불변 조건
- `requireMember()` 없이 방 내부 변경 이벤트를 처리하지 않는다.
- 방장 작업은 반드시 `requireHost()`를 통과한다.
- `hostParticipates=false`인 방장은 진행 전용으로 출제·정답 판정·점수·순위에서 제외하고 정답을 받을 수 있다.
- `hostParticipates=true`인 방장은 일반 참가자와 같은 정답 비공개 규칙을 적용하며 무작위 계열(`random`·`customList`, 무작위 후보 `choose`) 제시어만 허용한다.
- Canvas 이벤트는 서버에서 `playing`과 `drawerId`를 검사한다.
- 정답 판정, 점수 계산, 라운드 종료는 서버만 수행한다.
- 클라이언트가 보낸 점수, 정답 여부, 역할을 신뢰하지 않는다.
- 방 정원은 어떤 입장 경로에서도 30명을 넘을 수 없다.
- 강퇴·방 종료·직접 퇴장은 각각 다른 사용자 메시지를 유지한다.
- 방 종료 버튼은 `waiting`, `roundResult`, `finished`와 결과 모달에서 표시하고 `playing` 중에는 숨기며 서버의 `requireHost()` 검사는 항상 유지한다.

## 정답 비공개 규칙
- `room:state`, `rooms:list`, HTML, 공개 API에 현재 정답을 넣지 않는다.
- `game:secret`은 출제자와 게임에 참여하지 않는 진행 전용 방장의 개인 socket ID에만 보낸다.
- 힌트는 `maskAnswer()`가 만든 마스킹 문자열만 전송한다.
- 공백을 제외한 정답이 2글자 이하면 시간이 지나도 글자 힌트를 공개하지 않는다.
- 출제자나 이미 맞힌 사람이 정답 문자열을 채팅에 입력해도 일반 채팅으로 방송하지 않는다.
- 정답(2글자 이상)과 정확히 한 글자 차이인 오답은 `answer:close`로 그 소켓에만 보내고 방송·기록하지 않는다(`isOneEditApart`).
- 라운드 진행 중 출제자와 이미 정답을 맞힌 참가자는 어떤 채팅도 보낼 수 없으며 클라이언트와 서버에서 모두 차단한다.
- 라운드 종료 후에만 `round:ended`로 정답을 공개하고 서버의 현재 정답을 지운다.

## 방과 재접속
- 방 코드는 혼동 문자를 제외한 6자리 영문 대문자·숫자다.
- 닉네임은 최대 30자, 공백만 입력 및 제어문자 금지다. 이모지/특수문자는 허용한다.
- 같은 방의 닉네임 중복은 `ko-KR` 소문자 비교로 막는다.
- 연결 해제 뒤 3초(`DISCONNECT_ANNOUNCE_MS`)까지는 알림·오프라인 처리를 미루고 그 안에 재접속하면 조용히 복구한다. 이후 30초 유예 뒤 `leaveImmediately()`, 3초 뒤에도 출제자가 없으면 `endRound('drawer-left')`.
- 유예 내 재접속은 socket ID, 방 상태, Canvas, 필요 시 비밀 제시어와 `game:choose-word` 후보를 복구한다.
- 방장이 나가거나 유예 후에도 없으면 접속 중인 첫 참가자에게 위임하고 진행 전용이면 `sendSecret()`을 다시 보낸다. 첫 화면(`main.js`)은 미리 입장하지 않고 게임 화면에서만 `room:join`한다.
- 참가자가 0명이 되면 타이머와 방을 즉시 삭제한다.

## 라운드와 점수
- 전체 라운드 설정은 1~100회 범위로 서버에서 제한한다.
- 출제자는 직접 선택, 무작위, 이전 출제자 제외 무작위로 고른다.
- 제시어는 직접 입력, 준비 목록 선택, 난이도별 무작위, 사용자 목록 무작위, 출제자가 후보에서 고르기(`choose`)를 지원한다.
- 사용자 단어 목록은 서버에서 10~100개의 서로 다른 항목과 항목당 최대 30자를 검사하며 방 상태로 방송하지 않는다.
- `choose`는 후보 2~5개(무작위 또는 방장 입력, 참여 방장은 무작위만)를 `game:choose-word`로 출제자에게만 보내고, `game:pick-word` 또는 15초(`WORD_CHOICE_MS`) 자동 선택 시 `beginDrawing()`으로 `endAt`을 시작한다. 그 전에는 그리기·정답·힌트가 잠긴다.
- 한 게임의 무작위 제시어는 `room.game.usedWords`로 기억해 남은 후보가 있으면 중복 출제하지 않는다(`pickFresh`).
- `data/words.json`은 난이도별 40개다.
- 제한 시간은 서버의 `endAt`과 서버 timeout이 기준이다.
- 기본 점수는 100/80/60/40이고 남은 시간 보너스를 더한다.
- 출제자는 정답자 한 명당 10점을 얻는다.
- 모든 유효 참가자가 맞히거나 시간이 끝나거나 출제자가 이탈하면 라운드를 끝낸다.
- 최종 결과는 순위, 정답 횟수, 출제 횟수를 포함한다.

## Canvas 규칙
- 입력 좌표는 모두 0~1 범위 정규화 값이다.
- `canvas:draw`는 한 번에 최대 30개 선분을 받는다.
- 색상은 6자리 hex, 굵기는 1~40, 도구는 `pen`/`eraser`만 허용한다.
- 클라이언트는 약 24ms 단위로 선분을 배치하고 `requestAnimationFrame`으로 그린다.
- 서버의 현재 라운드 `drawingActions`가 재접속 복구 원본이다.
- `clear`는 액션으로 기록해 undo가 이전 그림을 복구할 수 있게 한다.
- 전체 bitmap을 프레임마다 전송하는 구현으로 바꾸지 않는다.

## 클라이언트 UI 규칙
- 전체 사이트명은 `그룹 게임 컬렉션`, 현재 게임명은 `두들팡`, 현재 게임 로고는 `doodlepang-logo-green.png`다.
- 전체 사이트 탭/대표 로고는 `group-game-logo.png`, 게임 선택 기본 배경은 `group-game-background.png`, 송캐치 로고는 초록 배경의 `songcatch-logo.png`다.
- 두들팡과 송캐치 첫 화면은 같은 상단 컬렉션 바와 중앙 카드 형식을 사용하며, 송캐치는 전용 `songcatch-background.png` 위에 개인/단체 모드를 함께 제공한다.
- 화면 본문 브랜드는 `두들팡`과 `송캐치`를 사용하고 브라우저 탭 제목만 `그룹 게임 컬렉션-두들팡`, `그룹 게임 컬렉션-송캐치` 형식을 사용한다. 송캐치 단체전은 참가자/음악 문제판/채팅 3열 구조를 기본으로 한다.
- 송캐치 단체전 입장 화면은 닉네임 카드에서 방 만들기/공개 방/코드 입장 모달을 여는 두들팡과 같은 흐름을 사용한다.
- 송캐치 공개 방 모달은 두들팡과 동일하게 제목 검색, 최신/인원 정렬, 입장 가능 필터와 카드형 목록을 제공하며 `music:rooms:list`에는 이를 위한 공개 정보만 포함한다.
- 송캐치 공개 방 검색·정렬 입력은 브라우저 기본 모양이 아니라 두들팡과 같은 공통 입력 테두리·여백·포커스 스타일을 사용한다.
- 송캐치 닉네임 입력도 너비·전체 패딩·배경·outline 초기화를 포함한 두들팡 공통 입력 스타일을 완전히 적용한다.
- 송캐치 단체전 입장 카드·로고·모달·공개 방 카드는 가벼운 등장/호버 애니메이션을 사용하고 `prefers-reduced-motion`에서는 비활성화한다.
- 송캐치 방장은 어느 진행 상태에서든 `music:room:close`로 방을 종료할 수 있고, 서버 권한 확인·타이머 정리·전체 참가자 로비 이동을 수행한다.
- 송캐치 관리자 화면은 `admin.css`가 레이아웃·반응형·애니메이션을 담당하며 기능 ID는 `admin.js`와 맞춰 유지한다.
- 관리자 로그인 숨은 진입은 G가 아니라 송캐치 로고를 1.8초 안에 5번 누르는 동작이다.
- 사용자 생성 문자열은 `textContent`로 넣는다. 템플릿 `innerHTML`에는 사용자 값을 보간하지 않는다.
- 방장 전용 요소는 `.host-only`와 현재 서버 상태를 함께 사용해 표시한다.
- 참가자 점 세 개 메뉴는 방장 위임/강퇴를 제공하며 바깥 클릭과 Esc로 닫힌다.
- 첫 화면 퇴장 알림은 `catchmind:exitNotice` 세션 키로 한 번만 표시한다.
- PC는 3열, 모바일은 `.mobile-tabs`와 `.mobile-tab-panel`을 사용한다.
- 모바일 기본 탭은 그림이며 하단에는 그림/채팅/참가자만 둔다. 그림 도구는 출제자의 그림 탭 안에서만 표시한다.
- 빠른 색상 팔레트는 기본색 외 확장 색상을 제공하고 좌우 화살표로 넘기며 현재 선택 색상을 표시한다.
- 태블릿 기본 화면은 그림판과 채팅만 나란히 표시하고 참가자 대기실은 헤더 버튼으로 여는 별도 창을 사용한다. 휴대폰만 모바일 탭 레이아웃으로 전환한다.
- 태블릿 방장 시작/종료 메뉴는 세로 여유가 있으면 그림판 아래, 넓고 낮은 화면이면 그림판 왼쪽을 세로로 채워 표시한다.
- 태블릿 대기 화면에서 방장 메뉴가 없는 사용자는 Canvas 안내 오버레이가 남는 공간을 채우며, 정답자는 참가자 목록과 채팅 정답 알림에서 초록색으로 강조한다.
- Canvas DOM 크기와 내부 좌표계의 비율을 바꿀 때 모든 클라이언트가 같은 그림을 보도록 검증한다.
- Canvas 표시 영역에 letterbox 여백을 만들지 않아 포인터 좌표와 실제 그림 위치가 일치하게 유지한다.
- 대기 안내 `.canvas-overlay`는 바깥 레이아웃이 아니라 실제 Canvas의 화면상 위치와 크기에 정확히 맞춘다.

## 이벤트 체크리스트
- 방: `room:create`, `room:join`, `room:leave`, `room:state`, `rooms:list`
- 방장: `room:settings`, `room:transfer`, `room:kick`, `room:close`
- 게임: `game:start`, `game:restart`, `game:lobby`, `game:pick-word`, `game:secret`, `game:hint`, `game:choose-word`, `round:ended`
- 채팅: `chat:send`, `chat:message`, `answer:correct`, `answer:close`
- 그림: `canvas:draw`, `canvas:action`, `canvas:sync`
- 새 이벤트에는 서버 검증, ack 성공/실패, 대상 범위, 재접속 복구 여부를 모두 고려한다.

## 테스트 방법
1. 변경 JS에 `node --check`를 실행한다.
2. `git diff --check`로 공백 오류를 확인한다.
3. `npm test`로 방 생성, 닉네임, 비밀 제시어, Canvas 권한, 점수 흐름을 확인한다.
4. UI 변경은 일반 창/시크릿 창 두 개로 방장과 참가자 화면을 각각 확인한다.
5. Canvas 변경은 마우스와 모바일 포인터, 창 크기가 다른 두 클라이언트에서 확인한다.
6. 재접속 변경은 플레이 중 새로고침과 30초 유예 만료를 모두 확인한다.

## 작업 규칙
- 사용자가 변경을 요청하면 설명에 그치지 말고 실제 프로젝트 파일에 적용한다. 검토 결과 변경할 내용이 없을 때만 파일을 그대로 둔다.
- 사용자 요청 없이 기존 변경사항을 되돌리거나 관련 없는 파일을 수정하지 않는다.
- 작업 시작 전에 `git status --short`와 관련 파일을 확인한다.
- 검색은 `rg`를 우선 사용하고 없으면 `grep`/`find`를 사용한다.
- 파일 수정은 작고 검토 가능한 단위로 하며 기존 함수와 이벤트 이름을 불필요하게 바꾸지 않는다.
- UI만 숨겨 권한을 구현하지 않는다. 민감한 동작은 반드시 서버에서도 거부한다.
- 현재 정답이 일반 room broadcast나 로그에 섞이지 않았는지 변경마다 확인한다.
- 메모리·이벤트 기록에는 상한을 두고 한 방 이벤트를 전체 소켓에 방송하지 않는다.
- 모바일 반응형 스타일과 접근성 레이블을 함께 유지한다.
- 의존성 추가 전 기존 API와 표준 라이브러리로 해결 가능한지 확인한다.
- 패키지를 변경하면 `package-lock.json`도 갱신한다.
- 코드 변경 후 `node --check`, `git diff --check`, `npm test`를 기본 검증으로 수행한다.
- 테스트가 실패하면 원인을 보고하고 통과했다고 표현하지 않는다.
- 미구현 항목은 TODO 또는 제한 사항으로 명시하고 완성된 것처럼 설명하지 않는다.
- 비밀키, 토큰, 사용자 개인정보를 코드·문서·명령 출력에 노출하지 않는다.
- 사용자가 GitHub 업로드를 금지하지 않은 경우, 변경과 검증이 끝나면 관련 파일을 커밋하고 배포 브랜치에 push한다.
- 중요한 새 불변 조건과 운영 지식은 `AGENTS.md`와 `CLAUDE.md`에 함께 반영한다.

## 배포/확장 주의
- GitHub Pages 단독 배포는 지원하지 않는다. WebSocket이 가능한 Node.js 호스팅이 필요하다.
- Render/Railway는 `npm ci` 후 `npm start`를 사용한다.
- 다중 인스턴스 전환 시 Redis 기반 방 저장소와 Socket.IO Redis adapter를 먼저 도입한다.
- 운영 배포에는 HTTPS, 보안 헤더, Origin 정책, 프록시 요청 제한과 모니터링을 추가한다.
- 계정 인증과 영구 전적은 현재 범위 밖이다.
