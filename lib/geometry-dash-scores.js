const fs = require('fs');
const path = require('path');

const MAX_ENTRIES = 50;
const NAME_MAX_LENGTH = 20;
const SCORE_MAX = 20_000;

function sanitizeName(name) {
  const trimmed = String(name ?? '').trim().slice(0, NAME_MAX_LENGTH);
  return trimmed || '이름없음';
}

/**
 * 지오메트리 대쉬 통합 순위를 JSON 파일로 영구 저장하는 간단한 저장소입니다.
 * memory-room-store.js와 같은 이유로, 메서드 이름만 유지하면 나중에 DB 구현으로 바꿀 수 있습니다.
 */
class GeometryDashScoreStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.scores = this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((entry) => entry && typeof entry.name === 'string' && Number.isInteger(entry.score))
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
    const rank = this.scores.indexOf(entry);
    return { entry, rank: rank >= 0 ? rank + 1 : null };
  }
}

function createGeometryDashScoreStore(filePath) {
  return new GeometryDashScoreStore(filePath);
}

module.exports = { createGeometryDashScoreStore, SCORE_MAX, NAME_MAX_LENGTH };
