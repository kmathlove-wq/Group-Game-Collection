// 광질 타이쿤 📱 다른 기기 연동 API(`/api/mining-tycoon/link/*`).
// 한 월드를 여러 기기(최대 10대)가 함께 쓴다: 비밀번호로 붙고, 붙은 뒤엔 기기 열쇠로 30초마다 저장을 올린다.
// 나중에 연 기기가 이긴다 — 다른 기기가 열면 먼저 하던 기기의 다음 올리기는 409(taken)로 거절된다.
// 몸통은 text/plain JSON으로 받는다(전역 express.json은 2KB까지라 월드 저장(압축 약 14KB)이 안 들어감).
const zlib = require('zlib');
const express = require('express');
const bcrypt = require('bcrypt');
const Save = require('../../public/mining-tycoon/js/save.js');

const BODY_LIMIT = '400kb';
const SAVE_MAX_CHARS = 300_000; // 월드 저장 글자는 약 12만 자
const PASSWORD_MIN = 4;
const PASSWORD_MAX = 100;
const JOIN_WINDOW_MS = 10 * 60 * 1000;
const JOIN_MAX_FAILS = 5; // 비밀번호는 10분에 5번까지 틀릴 수 있다
const CREATE_COOLDOWN_MS = 20_000;
const SYNC_GAP_MS = 3_000; // 같은 기기가 3초 안에 또 올리면 거절(화면은 30초마다 올림)
const CLEANUP_MS = 60 * 60 * 1000;
const ID = /^[0-9a-f]{16}$/;
const KEY = /^[0-9a-f]{48}$/;

function setupMiningTycoon({ app, store, now = Date.now, bcryptRounds = 10, cleanupTimer = true }) {
  const text = express.text({ type: 'text/plain', limit: BODY_LIMIT });
  const joinFails = new Map(); // IP → [틀린 때들]
  const lastCreateAt = new Map(); // IP → 마지막으로 연동을 만든 때
  const lastSyncAt = new Map(); // 기기 열쇠 → 마지막으로 올린 때
  const ipOf = (req) => req.ip || 'unknown';

  function bodyOf(req) {
    try { return typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {}); } catch { return {}; }
  }

  // 저장 글자를 꺼내 진짜 광질 타이쿤 저장인지 확인한다. { text, data, summary, name } 또는 { error }.
  function readSave(body) {
    let saveText;
    try {
      if (body.z === 'deflate-raw') saveText = zlib.inflateRawSync(Buffer.from(String(body.save ?? ''), 'base64'), { maxOutputLength: SAVE_MAX_CHARS * 2 }).toString('utf8');
      else saveText = String(body.save ?? '');
    } catch { return { error: '저장 내용이 망가졌어요.' }; }
    if (!saveText || saveText.length > SAVE_MAX_CHARS) return { error: '저장 내용이 이상해요.' };
    let state;
    try { state = Save.deserialize(saveText); } catch { return { error: '저장 내용이 이상해요.' }; }
    return {
      text: saveText,
      data: zlib.deflateRawSync(saveText, { level: 9 }).toString('base64'),
      name: state.name,
      summary: { depth: Math.floor(state.maxDepth), earned: Math.floor(state.earned), time: Math.floor(state.time), treasure: state.treasureTime != null }
    };
  }

  const savedText = (world) => zlib.inflateRawSync(Buffer.from(world.data, 'base64')).toString('utf8');

  function readPassword(body) {
    const password = String(body.password ?? '');
    if ([...password].length < PASSWORD_MIN) return { error: `비밀번호는 ${PASSWORD_MIN}자 이상이어야 해요.` };
    if (password.length > PASSWORD_MAX) return { error: '비밀번호가 너무 길어요.' };
    return { password };
  }

  // 기기 열쇠가 필요한 요청: 월드를 찾아 req.world에 넣는다. 없으면 410 { gone: 이유 }.
  function withKey(req, res, next) {
    const body = bodyOf(req);
    if (!ID.test(String(body.worldId)) || !KEY.test(String(body.key))) return res.status(400).json({ error: '연동 정보가 이상해요.' });
    const found = store.check(body.worldId, body.key);
    if (found.gone) return res.status(410).json({ gone: found.gone });
    req.linkBody = body;
    req.world = found.world;
    next();
  }

  // 📱 연동 시작: 지금 월드를 올리고 비밀번호를 정한다.
  app.post('/api/mining-tycoon/link/create', text, async (req, res) => {
    const body = bodyOf(req);
    const pass = readPassword(body);
    if (pass.error) return res.status(400).json(pass);
    const save = readSave(body);
    if (save.error) return res.status(400).json(save);
    const ip = ipOf(req);
    if (now() - (lastCreateAt.get(ip) ?? -Infinity) < CREATE_COOLDOWN_MS) return res.status(429).json({ error: '조금 뒤에 다시 해 주세요.' });
    lastCreateAt.set(ip, now());
    const hash = await bcrypt.hash(pass.password, bcryptRounds);
    const result = store.create({ name: save.name, hash, data: save.data, summary: save.summary });
    if (result.error) return res.status(503).json({ error: '연동 보관함이 꽉 찼어요. 나중에 다시 해 주세요.' });
    res.json({ worldId: result.world.id, key: result.key, rev: result.world.rev });
  });

  // 닉네임으로 연동된 월드 찾기(시작 화면).
  app.get('/api/mining-tycoon/link/worlds', (req, res) => {
    res.json({ worlds: store.list(String(req.query.name ?? '').slice(0, 40)).map(({ id, rev, updatedAt, devices, depth, earned, time, treasure }) => ({ id, rev, updatedAt, devices, depth, earned, time, treasure })) });
  });

  // 다른 기기에서 하기: 비밀번호를 맞히면 이 기기 열쇠와 최신 저장을 준다.
  app.post('/api/mining-tycoon/link/join', text, async (req, res) => {
    const body = bodyOf(req);
    if (!ID.test(String(body.worldId))) return res.status(400).json({ error: '월드를 찾을 수 없어요.' });
    const ip = ipOf(req);
    const fails = (joinFails.get(ip) ?? []).filter((at) => now() - at < JOIN_WINDOW_MS);
    if (fails.length >= JOIN_MAX_FAILS) return res.status(429).json({ error: '비밀번호를 너무 많이 틀렸어요. 10분 뒤에 다시 해 주세요.' });
    const { world, gone } = store.find(body.worldId);
    if (!world) return res.status(410).json({ gone });
    const password = String(body.password ?? '').slice(0, PASSWORD_MAX);
    if (!password || !(await bcrypt.compare(password, world.hash))) {
      fails.push(now());
      joinFails.set(ip, fails);
      return res.status(401).json({ error: '비밀번호가 맞지 않아요.' });
    }
    joinFails.delete(ip);
    const result = store.join(world);
    if (result.error) return res.status(409).json({ error: '이 월드에는 기기를 10대까지만 연동할 수 있어요.' });
    res.json({ key: result.key, rev: world.rev, save: savedText(world) });
  });

  // 게임을 켤 때: 이 기기가 지금 하는 기기가 되고, 서버 것이 더 새것이면 저장을 함께 준다.
  app.post('/api/mining-tycoon/link/open', text, withKey, (req, res) => {
    const { world, linkBody: body } = req;
    store.open(world, body.key);
    const newer = !(Number(body.rev) >= world.rev);
    res.json({ rev: world.rev, devices: world.keys.length, summary: world.summary, ...(newer ? { save: savedText(world) } : {}) });
  });

  // 30초마다 올리기. 다른 기기가 그새 열었으면 409 taken(force면 이 기기 것으로 덮고 다시 지금 하는 기기가 됨).
  app.post('/api/mining-tycoon/link/sync', text, withKey, (req, res) => {
    const { world, linkBody: body } = req;
    if (!body.force && (!store.isActive(world, body.key) || Number(body.rev) !== world.rev)) {
      return res.status(409).json({ taken: true, rev: world.rev, summary: world.summary });
    }
    if (now() - (lastSyncAt.get(body.key) ?? -Infinity) < SYNC_GAP_MS) return res.status(429).json({ error: '너무 자주 올렸어요.' });
    const save = readSave(body);
    if (save.error) return res.status(400).json(save);
    lastSyncAt.set(body.key, now());
    res.json({ rev: store.update(world, body.key, save), devices: world.keys.length });
  });

  // 연동 정보(기기 수) 보기.
  app.post('/api/mining-tycoon/link/info', text, withKey, (req, res) => res.json({ devices: req.world.keys.length, rev: req.world.rev }));

  app.post('/api/mining-tycoon/link/password', text, withKey, async (req, res) => {
    const pass = readPassword(req.linkBody);
    if (pass.error) return res.status(400).json(pass);
    store.setHash(req.world, await bcrypt.hash(pass.password, bcryptRounds));
    res.json({ ok: true });
  });

  // 처음부터 다시(reset)·지구 파괴(destroyed): 연동된 모든 기기에서 월드가 끝난다.
  app.post('/api/mining-tycoon/link/end', text, withKey, (req, res) => {
    const reason = req.linkBody.reason === 'destroyed' ? 'destroyed' : 'reset';
    store.end(req.world, reason);
    res.json({ ok: true });
  });

  // ✂️ 연동 끊기: 누른 기기만 월드를 갖고(화면이 연동 정보를 지움), 다른 기기는 다음에 왔을 때 월드를 잃는다.
  app.post('/api/mining-tycoon/link/unlink', text, withKey, (req, res) => {
    store.end(req.world, 'unlinked');
    res.json({ ok: true });
  });

  if (cleanupTimer) setInterval(() => store.cleanup(), CLEANUP_MS).unref();
  return { store };
}

module.exports = { setupMiningTycoon };
