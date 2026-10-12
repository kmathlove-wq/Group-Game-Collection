const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KEEP_MS = 30 * 24 * 60 * 60 * 1000; // 글은 30일 뒤 사라진다(고정 글은 예외)
const NAME_MAX_LENGTH = 20;
const TEXT_MAX_LENGTH = 400;
const MAX_POSTS = 500; // 원글 최대 개수(넘으면 오래된 안 고정 글부터 지움)
const MAX_REPLIES = 50; // 글 하나에 달 수 있는 답글 수

const validPost = (post) => post && typeof post.id === 'string' && typeof post.text === 'string' && Number.isFinite(post.at);

/**
 * 게임 선택 화면의 개선사항·댓글 게시판 저장소.
 * 글은 data/board.json에 두고, Gist가 있으면 board.json으로도 보관해 Render가 다시 켜지거나 새로 배포해도 남는다.
 * 지운 글 번호(deleted, 30일 보관)도 함께 저장한다 — Gist와 합칠 때 지운 글이 되살아나지 않게 하려고.
 * 글: { id, name, text, at, admin, pinned, keepFrom, replies: [{ id, name, text, at, admin }] }
 * keepFrom = 30일을 세기 시작한 때(쓴 때, 고정을 풀면 푼 때).
 */
class BoardStore {
  constructor(filePath, { remote = null, remoteName = 'board.json', now = Date.now } = {}) {
    this.filePath = filePath;
    this.now = now;
    this.posts = [];
    this.deleted = new Map(); // 글 번호 → 지운 시각
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
    return { posts: this.posts, deleted: Object.fromEntries(this.deleted) };
  }

  // 저장된 내용(파일·Gist)을 합친다. 같은 번호의 글은 답글을 합치고, 지운 번호는 다시 들이지 않는다.
  absorb(saved, { save = true } = {}) {
    for (const [id, at] of Object.entries(saved?.deleted ?? {})) if (Number.isFinite(at)) this.deleted.set(id, at);
    for (const post of (Array.isArray(saved?.posts) ? saved.posts : []).filter(validPost)) {
      if (this.deleted.has(post.id)) continue;
      const mine = this.posts.find((item) => item.id === post.id);
      const replies = (Array.isArray(post.replies) ? post.replies : []).filter(validPost).filter((reply) => !this.deleted.has(reply.id));
      if (!mine) { this.posts.push({ ...post, keepFrom: post.keepFrom ?? post.at, replies }); continue; }
      for (const reply of replies) if (!mine.replies.some((item) => item.id === reply.id)) mine.replies.push(reply);
      mine.replies.sort((a, b) => a.at - b.at);
    }
    for (const post of this.posts) post.replies = post.replies.filter((reply) => !this.deleted.has(reply.id));
    this.posts = this.posts.filter((post) => !this.deleted.has(post.id));
    this.prune();
    if (save) this.persist();
  }

  // 30일 지난 글·답글, 30일 지난 지운 번호 기록을 정리한다. 바뀐 게 있으면 true.
  prune() {
    const limit = this.now() - KEEP_MS;
    const count = () => this.posts.reduce((sum, post) => sum + 1 + post.replies.length, 0) + this.deleted.size;
    const before = count();
    this.posts = this.posts.filter((post) => post.pinned || post.keepFrom > limit);
    for (const post of this.posts) post.replies = post.replies.filter((reply) => reply.at > limit);
    for (const [id, at] of this.deleted) if (at <= limit) this.deleted.delete(id);
    const pinned = this.posts.filter((post) => post.pinned);
    const normal = this.posts.filter((post) => !post.pinned).sort((a, b) => b.at - a.at).slice(0, MAX_POSTS);
    this.posts = [...pinned, ...normal];
    return count() !== before;
  }

  persist() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.toJSON()));
    } catch {
      // 파일 저장에 실패해도 메모리의 글은 계속 보여 준다.
    }
  }

  changed() {
    this.persist();
    this.remote?.save(this.remoteName);
  }

  // 30일 정리를 주기적으로 할 때 부른다.
  cleanup() {
    if (this.prune()) this.changed();
  }

  // 화면에 보낼 목록: 고정 글이 맨 위(고정한 순서 최근 것 먼저), 나머지는 최신 글 먼저.
  list() {
    if (this.prune()) this.changed();
    const view = (item) => ({ id: item.id, name: item.name, text: item.text, at: item.at, admin: Boolean(item.admin) });
    const order = (a, b) => (Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))) || ((b.pinnedAt ?? 0) - (a.pinnedAt ?? 0)) || (b.at - a.at);
    return [...this.posts].sort(order).map((post) => ({
      ...view(post), pinned: Boolean(post.pinned), expiresAt: post.pinned ? null : post.keepFrom + KEEP_MS,
      replies: post.replies.map((reply) => ({ ...view(reply), expiresAt: reply.at + KEEP_MS }))
    }));
  }

  makeEntry(name, text, admin) {
    return { id: crypto.randomBytes(8).toString('hex'), name: admin ? '관리자' : name, text, at: this.now(), admin: Boolean(admin) };
  }

  addPost(name, text, { admin = false } = {}) {
    const post = { ...this.makeEntry(name, text, admin), pinned: false, replies: [] };
    post.keepFrom = post.at;
    this.posts.push(post);
    this.prune();
    this.changed();
    return post;
  }

  addReply(postId, name, text, { admin = false } = {}) {
    const post = this.posts.find((item) => item.id === postId);
    if (!post) return { error: '답글을 달 글이 없어요. 이미 지워졌을 수 있어요.' };
    if (post.replies.length >= MAX_REPLIES) return { error: '이 글에는 답글을 더 달 수 없어요.' };
    const reply = this.makeEntry(name, text, admin);
    post.replies.push(reply);
    this.changed();
    return { reply };
  }

  // 원글이든 답글이든 번호로 지운다. 원글을 지우면 답글도 함께 사라진다.
  remove(id) {
    const now = this.now();
    const index = this.posts.findIndex((post) => post.id === id);
    if (index >= 0) {
      const [post] = this.posts.splice(index, 1);
      this.deleted.set(post.id, now);
      for (const reply of post.replies) this.deleted.set(reply.id, now);
      this.changed();
      return true;
    }
    for (const post of this.posts) {
      const replyIndex = post.replies.findIndex((reply) => reply.id === id);
      if (replyIndex < 0) continue;
      post.replies.splice(replyIndex, 1);
      this.deleted.set(id, now);
      this.changed();
      return true;
    }
    return false;
  }

  // 고정하면 맨 위에 늘 보이고 사라지지 않는다. 고정을 풀면 그때부터 다시 30일을 센다.
  setPinned(id, pinned) {
    const post = this.posts.find((item) => item.id === id);
    if (!post) return false;
    post.pinned = Boolean(pinned);
    if (post.pinned) post.pinnedAt = this.now();
    else { delete post.pinnedAt; post.keepFrom = this.now(); }
    this.changed();
    return true;
  }
}

function createBoardStore(filePath, options) {
  return new BoardStore(filePath, options);
}

module.exports = { createBoardStore, KEEP_MS, NAME_MAX_LENGTH, TEXT_MAX_LENGTH, MAX_REPLIES };
