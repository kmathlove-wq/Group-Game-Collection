const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KEEP_MS = 30 * 24 * 60 * 60 * 1000; // 30일 동안 아무 기기도 안 하면 지운다
const GONE_KEEP_MS = 60 * 24 * 60 * 60 * 1000; // 지운 이유 쪽지는 60일 남긴다(오래 꺼져 있던 기기도 알 수 있게)
const MAX_WORLDS = 60; // 압축한 월드 하나가 약 14KB → Gist 파일 하나에 1MB 안팎
const MAX_DEVICES = 10;
const SAVE_DELAY_MS = 2_000;

const hashKey = (key) => crypto.createHash('sha256').update(String(key)).digest('hex');
const nameKey = (name) => String(name ?? '').trim().toLowerCase();

/**
 * 광질 타이쿤 📱 다른 기기 연동 보관함.
 * 월드: { id, name, hash(bcrypt 비밀번호), rev(올라올 때마다 +1), data(압축한 저장 글자, base64), summary,
 *        keys: [기기 열쇠를 섞은 값], active(지금 하는 기기 열쇠를 섞은 값), createdAt, updatedAt }
 * 지운 월드는 gone[id] = { reason: 'reset' | 'destroyed' | 'unlinked' | 'expired', at } 쪽지로 남겨
 * 다른 기기가 다음에 왔을 때 왜 사라졌는지 알려 준다.
 * 기기 열쇠 원문은 저장하지 않고 섞은 값만 둔다(게시판 내 글 열쇠와 같은 방식).
 */
class MiningLinkStore {
  constructor(filePath, { remote = null, remoteName = 'mining-tycoon-worlds.json', now = Date.now } = {}) {
    this.filePath = filePath;
    this.now = now;
    this.worlds = new Map();
    this.gone = new Map();
    this.timer = null;
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
    return { worlds: [...this.worlds.values()], gone: Object.fromEntries(this.gone) };
  }

  // 파일·Gist에 있던 내용을 합친다. 같은 월드는 판 번호(rev)가 더 큰 쪽, 지운 쪽지가 있으면 다시 들이지 않는다.
  absorb(saved, { save = true } = {}) {
    for (const [id, note] of Object.entries(saved?.gone ?? {})) {
      if (note && Number.isFinite(note.at)) { this.gone.set(id, note); this.worlds.delete(id); }
    }
    for (const world of Array.isArray(saved?.worlds) ? saved.worlds : []) {
      if (!world || typeof world.id !== 'string' || typeof world.data !== 'string' || this.gone.has(world.id)) continue;
      const mine = this.worlds.get(world.id);
      if (!mine || world.rev > mine.rev) this.worlds.set(world.id, world);
    }
    this.prune();
    if (save) this.persist();
  }

  // 30일 동안 안 한 월드를 지우고(쪽지 'expired'), 오래된 쪽지를 버린다. 바뀌면 true.
  prune() {
    const now = this.now();
    let changed = false;
    for (const world of this.worlds.values()) {
      if (world.updatedAt + KEEP_MS <= now) { this.drop(world.id, 'expired'); changed = true; }
    }
    for (const [id, note] of this.gone) if (note.at + GONE_KEEP_MS <= now) { this.gone.delete(id); changed = true; }
    return changed;
  }

  persist() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.toJSON()));
    } catch {
      // 파일 저장이 안 돼도 메모리에는 남아 있다.
    }
  }

  // 30초마다 올라오는 동기화마다 파일을 쓰지 않게 잠깐 모았다가 쓴다. Gist는 gist-sync가 알아서 1분에 한 번 이하로 올린다.
  changed() {
    if (!this.timer) {
      this.timer = setTimeout(() => { this.timer = null; this.persist(); }, SAVE_DELAY_MS);
      this.timer.unref?.();
    }
    this.remote?.save(this.remoteName);
  }

  flush() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; this.persist(); }
  }

  cleanup() {
    if (this.prune()) this.changed();
  }

  drop(id, reason) {
    this.worlds.delete(id);
    this.gone.set(id, { reason, at: this.now() });
  }

  // 번호로 월드를 찾는다. { world } 또는 { gone: 이유 }(쪽지가 없으면 30일이 지나 사라진 것으로 본다).
  find(id) {
    this.cleanup();
    const world = this.worlds.get(id);
    return world ? { world } : { gone: this.gone.get(id)?.reason ?? 'expired' };
  }

  // 월드와 기기 열쇠를 함께 확인한다.
  check(id, key) {
    const found = this.find(id);
    if (found.world && !found.world.keys.includes(hashKey(key))) return { gone: 'unlinked' }; // 연동 끊기로 버려진 열쇠
    return found;
  }

  summaryOf(world) {
    return { id: world.id, name: world.name, rev: world.rev, updatedAt: world.updatedAt, devices: world.keys.length, ...world.summary };
  }

  // 새 연동: 월드를 만들고 이 기기 열쇠를 돌려준다.
  create({ name, hash, data, summary }) {
    this.cleanup();
    if (this.worlds.size >= MAX_WORLDS) return { error: 'full' };
    const key = crypto.randomBytes(24).toString('hex');
    const now = this.now();
    const world = { id: crypto.randomBytes(8).toString('hex'), name, hash, rev: 1, data, summary,
      keys: [hashKey(key)], active: hashKey(key), createdAt: now, updatedAt: now };
    this.worlds.set(world.id, world);
    this.changed();
    return { world, key };
  }

  // 닉네임이 같은(대소문자·앞뒤 빈칸 무시) 연동 월드 목록.
  list(name) {
    this.cleanup();
    const wanted = nameKey(name);
    if (!wanted) return [];
    return [...this.worlds.values()].filter((world) => nameKey(world.name) === wanted)
      .sort((a, b) => b.updatedAt - a.updatedAt).map((world) => this.summaryOf(world));
  }

  // 비밀번호를 맞힌 새 기기를 붙인다. 붙은 기기가 "지금 하는 기기"가 된다(나중에 연 기기가 이김).
  join(world) {
    if (world.keys.length >= MAX_DEVICES) return { error: 'devices' };
    const key = crypto.randomBytes(24).toString('hex');
    world.keys.push(hashKey(key));
    world.active = hashKey(key);
    this.changed();
    return { world, key };
  }

  // 게임을 켤 때: 이 기기가 지금 하는 기기가 된다.
  open(world, key) {
    world.active = hashKey(key);
    this.changed();
  }

  isActive(world, key) {
    return world.active === hashKey(key);
  }

  // 새 저장을 받는다. 판 번호를 올려 돌려준다.
  update(world, key, { data, summary, name }) {
    world.data = data;
    world.summary = summary;
    if (name) world.name = name;
    world.rev += 1;
    world.active = hashKey(key);
    world.updatedAt = this.now();
    this.changed();
    return world.rev;
  }

  setHash(world, hash) {
    world.hash = hash;
    this.changed();
  }

  // 처음부터 다시·지구 파괴·연동 끊기: 월드를 지우고 이유 쪽지를 남긴다.
  end(world, reason) {
    this.drop(world.id, reason);
    this.changed();
  }
}

function createMiningLinkStore(filePath, options) {
  return new MiningLinkStore(filePath, options);
}

module.exports = { createMiningLinkStore, MiningLinkStore, hashKey, KEEP_MS, GONE_KEEP_MS, MAX_WORLDS, MAX_DEVICES };
