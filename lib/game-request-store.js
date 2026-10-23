const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TEXT_MAX_LENGTH = 200;
const MAX_ITEMS = 1000;

const validItem = (item) => item && typeof item.id === 'string' && typeof item.text === 'string' && Number.isFinite(item.at);

/**
 * 게임 추천받기 창(정해진 기간에만 뜸)에 들어온 "이런 게임이 있으면 좋겠어요" 저장소. 닉네임 없이 내용만 받는다.
 * data/game-requests.json에 두고, Gist가 있으면 game-requests.json으로도 보관해 다시 켜져도 남는다.
 * 지운 번호(deleted)도 저장해 Gist와 합칠 때 되살아나지 않게 한다(게시판과 같은 방식).
 * 항목: { id, text, at }
 */
class GameRequestStore {
  constructor(filePath, { remote = null, remoteName = 'game-requests.json', now = Date.now } = {}) {
    this.filePath = filePath;
    this.now = now;
    this.items = [];
    this.deleted = new Set();
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
    return { items: this.items, deleted: [...this.deleted] };
  }

  absorb(saved, { save = true } = {}) {
    for (const id of Array.isArray(saved?.deleted) ? saved.deleted : []) if (typeof id === 'string') this.deleted.add(id);
    for (const item of (Array.isArray(saved?.items) ? saved.items : []).filter(validItem)) {
      if (!this.items.some((mine) => mine.id === item.id)) this.items.push({ id: item.id, text: item.text, at: item.at });
    }
    this.items = this.items.filter((item) => !this.deleted.has(item.id)).sort((a, b) => b.at - a.at).slice(0, MAX_ITEMS);
    if (save) this.persist();
  }

  persist() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.toJSON()));
    } catch {
      // 파일 저장에 실패해도 메모리의 추천은 남아 있다.
    }
  }

  changed() {
    this.persist();
    this.remote?.save(this.remoteName);
  }

  // 최신 추천 먼저
  list() {
    return this.items.map((item) => ({ ...item }));
  }

  add(text) {
    const item = { id: crypto.randomBytes(8).toString('hex'), text, at: this.now() };
    this.items.unshift(item);
    this.items = this.items.slice(0, MAX_ITEMS);
    this.changed();
    return item;
  }

  remove(id) {
    const index = this.items.findIndex((item) => item.id === id);
    if (index < 0) return false;
    this.items.splice(index, 1);
    this.deleted.add(id);
    this.changed();
    return true;
  }
}

function createGameRequestStore(filePath, options) {
  return new GameRequestStore(filePath, options);
}

module.exports = { createGameRequestStore, TEXT_MAX_LENGTH };
