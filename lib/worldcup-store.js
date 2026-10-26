const fs = require('fs');
const path = require('path');

const COUNT_MAX = 1_000_000_000;

const cleanCount = (value) => (Number.isInteger(value) && value >= 0 ? Math.min(value, COUNT_MAX) : 0);

/**
 * 이상형 월드컵 전체 통계 저장소. 주제마다 끝까지 한 판 수(plays), 항목별 1위 횟수(wins)·결승 진출 횟수(finals)를 센다.
 * data/worldcup-stats.json에 두고, Gist가 있으면 worldcup-stats.json으로도 보관해 다시 켜져도 남는다.
 * 숫자는 늘기만 하므로 Gist와 합칠 때는 칸마다 더 큰 값을 고른다(같은 판을 두 번 세지 않게).
 * 모양: { topics: { [주제]: { plays, wins: { [항목]: n }, finals: { [항목]: n } } } }
 */
class WorldcupStore {
  constructor(filePath, { remote = null, remoteName = 'worldcup-stats.json' } = {}) {
    this.filePath = filePath;
    this.topics = {};
    this.absorb(this.load(), { save: false });
    this.remote = remote || null;
    this.remoteName = remoteName;
    this.ready = this.remote
      ? this.remote.attach(remoteName, { absorb: (saved) => this.absorb(saved), snapshot: () => JSON.stringify(this.toJSON()) })
      : Promise.resolve();
  }

  load() {
    try { return JSON.parse(fs.readFileSync(this.filePath, 'utf8')); } catch { return null; }
  }

  toJSON() {
    return { topics: this.topics };
  }

  topic(id) {
    this.topics[id] ||= { plays: 0, wins: {}, finals: {} };
    return this.topics[id];
  }

  absorb(saved, { save = true } = {}) {
    const topics = saved && typeof saved.topics === 'object' && saved.topics ? saved.topics : {};
    for (const [id, data] of Object.entries(topics)) {
      if (!data || typeof data !== 'object') continue;
      const mine = this.topic(id);
      mine.plays = Math.max(mine.plays, cleanCount(data.plays));
      for (const kind of ['wins', 'finals']) {
        const counts = data[kind] && typeof data[kind] === 'object' ? data[kind] : {};
        for (const [item, n] of Object.entries(counts)) mine[kind][item] = Math.max(mine[kind][item] || 0, cleanCount(n));
      }
    }
    if (save) this.persist();
  }

  persist() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.toJSON()));
    } catch {
      // 파일 저장에 실패해도 메모리 통계는 계속 응답한다.
    }
  }

  // 한 판 결과: 1위(winner)와 결승에서 진 항목(runnerUp)
  record(topicId, winner, runnerUp) {
    const t = this.topic(topicId);
    t.plays = Math.min(t.plays + 1, COUNT_MAX);
    t.wins[winner] = Math.min((t.wins[winner] || 0) + 1, COUNT_MAX);
    for (const item of [winner, runnerUp]) t.finals[item] = Math.min((t.finals[item] || 0) + 1, COUNT_MAX);
    this.persist();
    this.remote?.save(this.remoteName);
  }

  stats(topicId) {
    const t = this.topics[topicId] || { plays: 0, wins: {}, finals: {} };
    return { plays: t.plays, wins: { ...t.wins }, finals: { ...t.finals } };
  }
}

function createWorldcupStore(filePath, options) {
  return new WorldcupStore(filePath, options);
}

module.exports = { createWorldcupStore };
