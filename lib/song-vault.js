// 🎵 송캐치 노래 파일 보관함: 노래(음원·그림) 하나마다 비밀 Gist 하나를 만들어 base64 글자로 넣어 둔다(사용자 결정 2026-10-28).
// Render 무료 서버는 다시 켜질 때 uploads/가 지워지므로, 없어진 파일은 Gist에서 다시 받아 온다.
// 공용 Gist(GIST_ID)에 넣지 않는 까닭: 그 Gist는 서버가 켜질 때 통째로 받아 오는데, 노래가 쌓이면 수십 MB가 되어 느려진다.
// 노래 목록(제목·가수·문제집)은 작아서 공용 Gist의 songcatch-songs.json에 둔다(src/music/index.js).
// 토큰은 GIST_TOKEN(Gist 읽기·쓰기 권한만)을 같이 쓴다. 로그·응답에 넣지 않는다.
const API = 'https://api.github.com/gists';
const REQUEST_TIMEOUT_MS = 60_000; // 노래 파일은 커서 넉넉히

function createSongVault({ token, fetchImpl = globalThis.fetch } = {}) {
  if (!token) return null; // 내 컴퓨터처럼 설정이 없으면 파일만 쓴다
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'group-game-collection' };

  async function call(url, options = {}) {
    const response = await fetchImpl(url, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw Object.assign(new Error(`GitHub Gist HTTP ${response.status}`), { status: response.status });
    return response;
  }
  const json = (body) => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const files = (named) => Object.fromEntries(Object.entries(named).map(([name, buffer]) => [name + '.b64', { content: Buffer.from(buffer).toString('base64') }]));

  return {
    // 새 비밀 Gist를 만들고 번호를 돌려준다. named = { 파일 이름: Buffer }
    async create(label, named) {
      const response = await call(API, { method: 'POST', ...json({ description: `송캐치 노래: ${label}`.slice(0, 200), public: false, files: files(named) }) });
      return (await response.json()).id;
    },
    // 파일을 더하거나 바꾼다(그림을 나중에 올릴 때).
    async put(id, named) { await call(`${API}/${id}`, { method: 'PATCH', ...json({ files: files(named) }) }); },
    // 파일 하나 받기(1MB가 넘으면 Gist가 잘라서 주므로 raw 주소에서 받는다). 없으면 null.
    async get(id, name) {
      const gist = await (await call(`${API}/${id}`)).json();
      const file = gist.files?.[name + '.b64'];
      if (!file) return null;
      const text = file.truncated ? await (await call(file.raw_url)).text() : file.content;
      return Buffer.from(text, 'base64');
    },
    async remove(id) {
      try { await call(`${API}/${id}`, { method: 'DELETE' }); } catch (error) { if (error.status !== 404) throw error; }
    }
  };
}

module.exports = { createSongVault };
