// GitHub Gist(파일 보관함)에 JSON 파일을 보관한다. Render 무료 서버는 다시 켜질 때 디스크 파일이 지워지므로
// 꼭 남아야 하는 작은 데이터(끝말잇기 컴퓨터 기억 노트·한방 단어장)를 서버 바깥에 둔다.
// 토큰은 환경 변수로만 받고 로그·응답에 넣지 않는다. 바뀐 파일은 모아 두었다가 한 번의 요청으로 올린다.
//
// 중요: 불러오기에 성공하기 전에는 그 파일을 절대 올리지 않는다. 시작할 때 GitHub가 잠깐 안 되어 빈 노트로 시작했는데
// 그대로 올리면 Gist에 있던 기억 전체를 덮어써 버리기 때문이다. 대신 올리기 전에 다시 불러와 합친다.
const API = 'https://api.github.com/gists/';
const SAVE_DELAY_MS = 10_000;
// GitHub는 Gist 고치기를 1시간에 100번까지만 받는다(gist_update). 예전엔 미리 공부하기 진도 때문에 12초마다 올려
// 20분 만에 한도를 다 쓰고 40분 동안 모든 저장이 403으로 거절됐다 → 그 사이 다시 켜지면 순위가 사라졌음(2026-10).
// 올리기 사이를 1분 이상 띄워 1시간에 60번 안쪽으로 둔다. 꺼질 때(flush 직접 호출)는 기다리지 않는다.
const MIN_GAP_MS = 60_000;
const RETRY_DELAY_MS = 60_000;
const REQUEST_TIMEOUT_MS = 15_000;

function createGistSync({ token, gistId, fetchImpl = globalThis.fetch, saveDelayMs = SAVE_DELAY_MS, retryDelayMs = RETRY_DELAY_MS,
  minGapMs = MIN_GAP_MS, now = Date.now } = {}) {
  if (!token || !gistId) return null; // 설정이 없으면(내 컴퓨터 등) 파일 저장만 쓴다
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'group-game-collection' };
  const files = new Map(); // 파일 이름 → { absorb, snapshot, loaded }
  const dirty = new Set();
  let timer = null;
  let saving = Promise.resolve();
  let queued = false; // 올리기가 이미 줄 서 있으면 또 세우지 않는다(두 저장소가 동시에 flush해도 한 번만 올림)
  let lastPatchAt = -Infinity; // 마지막으로 올리기 시작한 때
  let blockedUntil = 0; // 한도에 걸렸을 때 GitHub가 다시 받아 주는 때

  async function call(url, options = {}) {
    const response = await fetchImpl(url, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) {
      const error = new Error(`GitHub Gist HTTP ${response.status}`);
      const header = (name) => response.headers?.get?.(name);
      // 한도에 걸렸으면 GitHub가 알려 준 시각까지 기다린다(1분마다 두드려 봐야 계속 거절됨).
      if (header('retry-after')) error.retryAt = now() + Number(header('retry-after')) * 1000;
      else if (header('x-ratelimit-remaining') === '0' && header('x-ratelimit-reset')) error.retryAt = Number(header('x-ratelimit-reset')) * 1000;
      throw error;
    }
    return response;
  }

  // 아직 못 불러온 파일들을 한 번의 요청으로 받아 와 각 저장소에 합친다. 1MB가 넘는 파일은 잘려 오므로 raw 주소에서 받는다.
  let loading = null;
  function loadPending() {
    if ([...files.values()].every((entry) => entry.loaded)) return Promise.resolve(); // 이미 다 불러왔으면 또 묻지 않는다
    loading ||= (async () => {
      const gist = await call(API + gistId).then((response) => response.json());
      for (const [name, entry] of files) {
        if (entry.loaded) continue;
        const file = gist.files?.[name];
        if (file) entry.absorb(JSON.parse(file.truncated ? await (await call(file.raw_url)).text() : file.content));
        entry.loaded = true; // Gist에 파일이 아직 없으면 빈 노트가 맞으므로 올려도 된다
      }
    })().finally(() => { loading = null; });
    return loading;
  }

  function schedule(delay) {
    if (timer) return;
    const wait = Math.max(delay, lastPatchAt + minGapMs - now(), blockedUntil - now());
    timer = setTimeout(flush, wait);
    timer.unref?.();
  }

  function flush() {
    clearTimeout(timer); timer = null;
    if (!dirty.size || queued) return saving;
    queued = true;
    saving = saving.then(async () => {
      queued = false;
      if ([...dirty].some((name) => !files.get(name).loaded)) await loadPending();
      const names = [...dirty];
      dirty.clear();
      const body = Object.fromEntries(names.map((name) => [name, { content: files.get(name).snapshot() }]));
      lastPatchAt = now();
      try {
        await call(API + gistId, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: body }) });
      } catch (error) { for (const name of names) dirty.add(name); throw error; }
    }).catch((error) => {
      if (error.retryAt > now()) blockedUntil = error.retryAt;
      const waitMinutes = Math.max(1, Math.ceil((Math.max(blockedUntil, now() + retryDelayMs) - now()) / 60_000));
      console.error(`[gist-sync] 저장 실패(${waitMinutes}분 뒤 다시 시도):`, error.message);
      schedule(retryDelayMs);
    });
    return saving;
  }

  return {
    // 저장소 하나를 연결한다. absorb(저장된 내용)는 불러온 내용을 합치고, snapshot()은 올릴 최신 내용을 만든다.
    // 돌려주는 Promise는 첫 불러오기가 끝나면(실패해도) 풀린다. 실패하면 다음 저장 때 다시 불러온다.
    attach(name, { absorb, snapshot }) {
      files.set(name, { absorb, snapshot, loaded: false });
      return new Promise((resolve) => setImmediate(resolve)) // 같은 순간에 연결한 파일들을 한 번에 불러오려고 한 박자 기다린다
        .then(loadPending)
        .catch((error) => console.error(`[gist-sync] ${name} 불러오기 실패(저장할 때 다시 시도):`, error.message));
    },
    save(name) { dirty.add(name); schedule(saveDelayMs); },
    flush
  };
}

module.exports = { createGistSync };
