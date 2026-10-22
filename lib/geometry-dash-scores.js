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
// 한 사람 구분용 ID(광질 타이쿤: 새 게임마다 새로 만듦). 영문·숫자·-·_ 64자까지만 받는다.
const sanitizePlayerId = (id) => (typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null);
// 공개 응답에는 playerId를 넣지 않는다(남의 ID로 그 사람 기록을 바꾸지 못하게).
const publicEntry = ({ name, score, at }) => ({ name, score, at });

/**
 * 지오메트리 대쉬 통합 순위를 JSON 파일로 영구 저장하는 간단한 저장소입니다.
 * memory-room-store.js와 같은 이유로, 메서드 이름만 유지하면 나중에 DB 구현으로 바꿀 수 있습니다.
 * Render 무료 서버는 다시 켜질 때 파일이 지워지므로, remote(lib/gist-sync.js)가 있으면 비공개 Gist에도
 * remoteName 파일로 보관하고 시작할 때 불러와 합칩니다(끝말잇기 기억 노트와 같은 방식).
 */
class GeometryDashScoreStore {
  // order: 'desc'(클수록 위, 기본) 또는 'asc'(작을수록 위 — 걸린 시간 순위).
  // perPlayer: true면 같은 playerId는 한 줄만 남기고 더 좋은 기록으로 바꾼다(기본은 기록마다 한 줄).
  constructor(filePath, { remote = null, remoteName = null, order = 'desc', perPlayer = false } = {}) {
    this.filePath = filePath;
    this.better = order === 'asc' ? (a, b) => a.score - b.score : (a, b) => b.score - a.score;
    this.perPlayer = perPlayer;
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
    this.scores = this.tidy(this.scores);
    this.persist();
  }

  // 순서대로 줄 세우고(같은 사람은 가장 좋은 기록 한 줄만) 50개까지 자른다.
  tidy(list) {
    list.sort(this.better);
    if (this.perPlayer) {
      const seenIds = new Set();
      list = list.filter((entry) => {
        if (!entry.id) return true;
        if (seenIds.has(entry.id)) return false;
        seenIds.add(entry.id);
        return true;
      });
    }
    return list.slice(0, MAX_ENTRIES);
  }

  load() {
    try {
      return this.tidy(validEntries(JSON.parse(fs.readFileSync(this.filePath, 'utf8'))));
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
    return this.scores.slice(0, limit).map(publicEntry);
  }

  addScore(rawName, score, rawPlayerId) {
    const entry = { name: sanitizeName(rawName), score, at: Date.now() };
    const id = this.perPlayer ? sanitizePlayerId(rawPlayerId) : null;
    if (id) {
      entry.id = id;
      const old = this.scores.find((item) => item.id === id);
      // 예전 기록이 더 좋거나 같으면 그대로 두고 순위만 알려 준다(이름은 새 이름으로).
      if (old && this.better(old, entry) <= 0) {
        old.name = entry.name;
        this.persist();
        this.remote?.save(this.remoteName);
        return { entry: old, rank: this.scores.indexOf(old) + 1 };
      }
      if (old) this.scores.splice(this.scores.indexOf(old), 1);
    }
    this.scores.push(entry);
    this.scores = this.tidy(this.scores);
    this.persist();
    this.remote?.save(this.remoteName);
    const rank = this.scores.indexOf(entry);
    return { entry, rank: rank >= 0 ? rank + 1 : null };
  }
}

function createGeometryDashScoreStore(filePath, options) {
  return new GeometryDashScoreStore(filePath, options);
}

module.exports = { createGeometryDashScoreStore, sanitizePlayerId, SCORE_MAX, NAME_MAX_LENGTH };
