const fs = require('fs');
const path = require('path');

const MAX_ENTRIES = 50;
const NAME_MAX_LENGTH = 20;
const SCORE_MAX = 20_000;

function sanitizeName(name) {
  const trimmed = String(name ?? '').trim().slice(0, NAME_MAX_LENGTH);
  return trimmed || '이름없음';
}

const entryKey = (entry) => `${entry.name}|${entry.score}|${entry.at}`;
const validEntries = (raw) => (Array.isArray(raw) ? raw : [])
  .filter((entry) => entry && typeof entry.name === 'string' && Number.isInteger(entry.score));

/**
 * 지오메트리 대쉬 통합 순위를 JSON 파일로 영구 저장하는 간단한 저장소입니다.
 * memory-room-store.js와 같은 이유로, 메서드 이름만 유지하면 나중에 DB 구현으로 바꿀 수 있습니다.
 * Render 무료 서버는 다시 켜질 때 파일이 지워지므로, remote(lib/gist-sync.js)가 있으면 비공개 Gist에도
 * remoteName 파일로 보관하고 시작할 때 불러와 합칩니다(끝말잇기 기억 노트와 같은 방식).
 */
class GeometryDashScoreStore {
  constructor(filePath, { remote = null, remoteName = null } = {}) {
    this.filePath = filePath;
    this.scores = this.load();
    this.remote = remote && remoteName ? remote : null;
    this.remoteName = remoteName;
    this.ready = this.remote
      ? this.remote.attach(remoteName, { absorb: (saved) => this.absorb(saved), snapshot: () => JSON.stringify(this.scores) })
      : Promise.resolve();
  }

  // Gist에 있던 순위를 합친다. 같은 기록(이름·점수·시각이 같음)은 한 번만 남긴다.
  absorb(saved) {
    const seen = new Set(this.scores.map(entryKey));
    for (const entry of validEntries(saved)) {
      if (!seen.has(entryKey(entry))) { seen.add(entryKey(entry)); this.scores.push(entry); }
    }
    this.scores.sort((a, b) => b.score - a.score);
    this.scores = this.scores.slice(0, MAX_ENTRIES);
    this.persist();
  }

  load() {
    try {
      return validEntries(JSON.parse(fs.readFileSync(this.filePath, 'utf8')))
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_ENTRIES);
    } catch {
      return [];
    }
  }

  persist() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.scores));
    } catch {
      // 파일 저장에 실패해도 메모리 순위는 계속 응답한다.
    }
  }

  getTop(limit = 20) {
    return this.scores.slice(0, limit);
  }

  addScore(rawName, score) {
    const entry = { name: sanitizeName(rawName), score, at: Date.now() };
    this.scores.push(entry);
    this.scores.sort((a, b) => b.score - a.score);
    this.scores = this.scores.slice(0, MAX_ENTRIES);
    this.persist();
    this.remote?.save(this.remoteName);
    const rank = this.scores.indexOf(entry);
    return { entry, rank: rank >= 0 ? rank + 1 : null };
  }
}

function createGeometryDashScoreStore(filePath, options) {
  return new GeometryDashScoreStore(filePath, options);
}

module.exports = { createGeometryDashScoreStore, SCORE_MAX, NAME_MAX_LENGTH };
