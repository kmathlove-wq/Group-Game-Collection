const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { createMusicDatabase } = require('./database');
const { createGroupGame } = require('./group-game');
const {
  AUDIO_MIMES, AUDIO_EXTENSIONS, IMAGE_MIMES, IMAGE_EXTENSIONS,
  text, boolean, number, parseSong, checkAnswer, shuffle, createTokenStore
} = require('./service');

function setupMusicGame({ app, io, rootDir }) {
  const dataDir = path.join(rootDir, 'data');
  const uploadRoot = process.env.MUSIC_UPLOAD_DIR || path.join(rootDir, 'uploads');
  const audioDir = path.join(uploadRoot, 'audio');
  const imageDir = path.join(uploadRoot, 'images');
  fs.mkdirSync(audioDir, { recursive: true }); fs.mkdirSync(imageDir, { recursive: true });

  const database = createMusicDatabase({ filename: process.env.MUSIC_DB_PATH || path.join(dataDir, 'music-game.db'),
    bcrypt, adminUsername: process.env.ADMIN_USERNAME, adminPassword: process.env.ADMIN_PASSWORD });
  const tokenStore = createTokenStore();
  const soloSessions = new Map();
  const sessionMiddleware = session({ name: 'groupgame.admin', secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 60 * 60_000 } });

  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-origin' } }));
  app.use(express.json({ limit: '200kb' }));
  app.use(express.urlencoded({ extended: false, limit: '200kb' }));
  app.use(sessionMiddleware);

  app.use('/api/admin', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    try {
      if (origin && new URL(origin).host !== req.get('host')) return res.status(403).json({ ok: false, message: '허용되지 않은 요청 출처입니다.' });
    } catch {
      return res.status(403).json({ ok: false, message: '요청 출처를 확인할 수 없습니다.' });
    }
    next();
  });

  function adminOnly(req, res, next) {
    if (!req.session?.adminId) return res.status(401).json({ ok: false, message: '관리자 로그인이 필요합니다.' });
    next();
  }

  const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false,
    message: { ok: false, message: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.' } });

  app.get('/api/admin/session', (req, res) => {
    const admin = req.session?.adminId ? database.getAdmin(req.session.adminId) : null;
    res.json({ authenticated: Boolean(admin), admin, configured: Boolean(database.db.prepare('SELECT id FROM admins LIMIT 1').get()) });
  });
  app.post('/api/admin/login', loginLimiter, async (req, res) => {
    const admin = database.findAdmin(text(req.body.username, 80));
    const valid = admin && await bcrypt.compare(String(req.body.password || ''), admin.password_hash);
    if (!valid) return res.status(401).json({ ok: false, message: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    req.session.regenerate((error) => {
      if (error) return res.status(500).json({ ok: false, message: '로그인 세션을 만들지 못했습니다.' });
      req.session.adminId = admin.id; database.log(admin.id, 'login'); res.json({ ok: true, admin: database.getAdmin(admin.id) });
    });
  });
  app.post('/api/admin/logout', adminOnly, (req, res) => req.session.destroy(() => res.json({ ok: true })));
  app.post('/api/admin/password', adminOnly, async (req, res) => {
    const row = database.db.prepare('SELECT * FROM admins WHERE id=?').get(req.session.adminId);
    if (!row || !await bcrypt.compare(String(req.body.currentPassword || ''), row.password_hash)) return res.status(400).json({ ok: false, message: '현재 비밀번호가 맞지 않습니다.' });
    const next = String(req.body.newPassword || '');
    if (next.length < 10) return res.status(400).json({ ok: false, message: '새 비밀번호는 10자 이상이어야 합니다.' });
    database.updatePassword(row.id, await bcrypt.hash(next, 12)); database.log(row.id, 'password_change'); res.json({ ok: true });
  });

  const storage = (directory, extensions) => multer.diskStorage({ destination: directory,
    filename: (_req, file, callback) => {
      const ext = path.extname(file.originalname).toLowerCase();
      callback(extensions.has(ext) ? null : new Error('지원하지 않는 파일 확장자입니다.'), `${crypto.randomUUID()}${ext}`);
    } });
  const audioUpload = multer({ storage: storage(audioDir, AUDIO_EXTENSIONS), limits: { fileSize: Number(process.env.MAX_AUDIO_MB || 30) * 1024 * 1024 },
    fileFilter: (_req, file, callback) => callback(AUDIO_MIMES.has(file.mimetype) ? null : new Error('지원하지 않는 음원 형식입니다.'), AUDIO_MIMES.has(file.mimetype)) }).single('audio');
  const imageUpload = multer({ storage: storage(imageDir, IMAGE_EXTENSIONS), limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => callback(IMAGE_MIMES.has(file.mimetype) ? null : new Error('지원하지 않는 이미지 형식입니다.'), IMAGE_MIMES.has(file.mimetype)) }).single('image');
  const runUpload = (uploader) => (req, res, next) => uploader(req, res, (error) => error ? res.status(400).json({ ok: false, message: error.message }) : next());

  app.get('/api/admin/songs', adminOnly, (req, res) => {
    const result = database.listSongs({ search: text(req.query.search, 100), genre: text(req.query.genre, 50),
      difficulty: text(req.query.difficulty, 20), active: req.query.active === undefined ? undefined : req.query.active === 'true',
      limit: Math.min(200, Math.max(1, Number(req.query.limit) || 100)), offset: Math.max(0, Number(req.query.offset) || 0), privateFields: false });
    res.json(result);
  });
  app.get('/api/admin/songs/:id', adminOnly, (req, res) => {
    const song = database.getSong(Number(req.params.id), false);
    res.status(song ? 200 : 404).json(song || { message: '음원을 찾을 수 없습니다.' });
  });
  app.post('/api/admin/songs', adminOnly, runUpload(audioUpload), (req, res) => {
    const parsed = parseSong(req.body);
    if (!req.file) return res.status(400).json({ ok: false, message: '음원 파일을 선택해 주세요.' });
    if (!boolean(req.body.copyrightConfirmed, false)) { fs.unlinkSync(req.file.path); return res.status(400).json({ ok: false, message: '음원 사용 권한 확인에 동의해야 합니다.' }); }
    if (parsed.error) { fs.unlinkSync(req.file.path); return res.status(400).json({ ok: false, message: parsed.error }); }
    if (database.hasDuplicate(parsed.value.title, parsed.value.artist)) { fs.unlinkSync(req.file.path); return res.status(409).json({ ok: false, message: '같은 제목과 가수의 음원이 이미 있습니다.' }); }
    try {
      parsed.value.audioFilename = req.file.filename;
      const song = database.insertSong(parsed.value); database.log(req.session.adminId, 'song_create', 'song', song.id, `${song.title} - ${song.artist}`);
      res.status(201).json({ ok: true, song });
    } catch (error) { if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); res.status(500).json({ ok: false, message: '음원 정보를 저장하지 못했습니다.' }); }
  });
  app.put('/api/admin/songs/:id', adminOnly, (req, res) => {
    const current = database.getSong(Number(req.params.id), true); if (!current) return res.status(404).json({ ok: false, message: '음원을 찾을 수 없습니다.' });
    const parsed = parseSong(req.body, current); if (parsed.error) return res.status(400).json({ ok: false, message: parsed.error });
    if (database.hasDuplicate(parsed.value.title, parsed.value.artist, current.id)) return res.status(409).json({ ok: false, message: '같은 제목과 가수의 음원이 이미 있습니다.' });
    const song = database.updateSong(current.id, parsed.value); database.log(req.session.adminId, 'song_update', 'song', song.id); res.json({ ok: true, song });
  });
  app.post('/api/admin/songs/:id/image', adminOnly, runUpload(imageUpload), (req, res) => {
    const current = database.getSong(Number(req.params.id), true); if (!current || !req.file) return res.status(404).json({ ok: false, message: '음원 또는 이미지를 찾을 수 없습니다.' });
    const old = current.imageFilename; current.imageFilename = req.file.filename; const song = database.updateSong(current.id, current);
    if (old) fs.rm(path.join(imageDir, old), { force: true }, () => {}); database.log(req.session.adminId, 'song_image', 'song', song.id); res.json({ ok: true, song });
  });
  app.delete('/api/admin/songs/:id', adminOnly, (req, res) => {
    const song = database.getSong(Number(req.params.id), true); if (!song) return res.status(404).json({ ok: false });
    database.deleteSong(song.id); fs.rm(path.join(audioDir, song.audioFilename), { force: true }, () => {});
    if (song.imageFilename) fs.rm(path.join(imageDir, song.imageFilename), { force: true }, () => {});
    database.log(req.session.adminId, 'song_delete', 'song', song.id, `${song.title} - ${song.artist}`); res.json({ ok: true });
  });
  app.post('/api/admin/songs/batch-active', adminOnly, (req, res) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger).slice(0, 500) : [];
    if (!ids.length) return res.status(400).json({ ok: false, message: '음원을 선택해 주세요.' });
    const placeholders = ids.map(() => '?').join(','); database.db.prepare(`UPDATE songs SET is_active=?, updated_at=CURRENT_TIMESTAMP WHERE id IN (${placeholders})`).run(boolean(req.body.active) ? 1 : 0, ...ids);
    database.log(req.session.adminId, 'songs_batch_active', 'song', ids.join(',')); res.json({ ok: true });
  });
  app.post('/api/admin/songs/:id/preview', adminOnly, (req, res) => {
    const song = database.getSong(Number(req.params.id), true); if (!song) return res.status(404).json({ ok: false });
    res.json({ ok: true, audioToken: tokenStore.issue({ songId: song.id, filename: song.audioFilename, scope: `admin:${req.session.adminId}` }) });
  });

  function parseSet(body) {
    return { name: text(body.name, 80), description: text(body.description, 500), isRandom: boolean(body.isRandom, false),
      useInSolo: boolean(body.useInSolo), useInGroup: boolean(body.useInGroup), isPublic: boolean(body.isPublic),
      songIds: [...new Set((Array.isArray(body.songIds) ? body.songIds : []).map(Number).filter(Number.isInteger))].slice(0, 500) };
  }
  app.get('/api/admin/sets', adminOnly, (_req, res) => res.json({ sets: database.listSets() }));
  app.get('/api/admin/sets/:id', adminOnly, (req, res) => { const set = database.getSet(Number(req.params.id)); res.status(set ? 200 : 404).json(set || { message: '문제집을 찾을 수 없습니다.' }); });
  app.post('/api/admin/sets', adminOnly, (req, res) => { const data = parseSet(req.body); if (!data.name || !data.songIds.length) return res.status(400).json({ ok: false, message: '이름과 한 곡 이상의 음원이 필요합니다.' }); const id = database.saveSet(null, data); database.log(req.session.adminId, 'set_create', 'set', id); res.status(201).json({ ok: true, set: database.getSet(id) }); });
  app.put('/api/admin/sets/:id', adminOnly, (req, res) => { const id = Number(req.params.id); if (!database.getSet(id)) return res.status(404).json({ ok: false }); const data = parseSet(req.body); if (!data.name || !data.songIds.length) return res.status(400).json({ ok: false, message: '이름과 한 곡 이상의 음원이 필요합니다.' }); database.saveSet(id, data); database.log(req.session.adminId, 'set_update', 'set', id); res.json({ ok: true, set: database.getSet(id) }); });
  app.delete('/api/admin/sets/:id', adminOnly, (req, res) => { database.deleteSet(Number(req.params.id)); database.log(req.session.adminId, 'set_delete', 'set', req.params.id); res.json({ ok: true }); });
  app.get('/api/admin/logs', adminOnly, (_req, res) => res.json({ logs: database.getLogs() }));

  app.get('/api/music/options', (_req, res) => {
    const rows = database.db.prepare(`SELECT genre, difficulty FROM songs WHERE is_active=1 AND (use_in_solo=1 OR use_in_group=1)`).all();
    res.json({ genres: [...new Set(rows.map((r) => r.genre).filter(Boolean))].sort(), difficulties: [...new Set(rows.map((r) => r.difficulty).filter(Boolean))].sort(), sets: database.listSets({ publicOnly: true }) });
  });

  function soloChallenge(game) {
    if (game.index >= game.songIds.length) return { finished: true, score: game.score, correctCount: game.correctCount, total: game.songIds.length };
    const song = database.getSong(game.songIds[game.index], true); const duration = [song.firstDuration, song.secondDuration, song.thirdDuration][game.stage - 1];
    const result = { round: game.index + 1, total: game.songIds.length, stage: game.stage, startTime: song.startTime, duration,
      audioToken: tokenStore.issue({ songId: song.id, filename: song.audioFilename, scope: `solo:${game.id}` }), answerMode: game.answerMode, inputType: game.inputType };
    if (game.inputType === 'choice') {
      const field = game.answerMode === 'artist' ? 'artist' : 'title';
      const distractors = database.listSongs({ active: true, limit: 500 }).songs.filter((s) => s.id !== song.id).map((s) => s[field]);
      result.choices = shuffle([...new Set([song[field], ...shuffle(distractors).slice(0, 3)])]);
    }
    return result;
  }
  app.post('/api/music/solo/start', (req, res) => {
    const answerMode = ['title', 'artist', 'both'].includes(req.body.answerMode) ? req.body.answerMode : 'title';
    const inputType = req.body.inputType === 'choice' && answerMode !== 'both' ? 'choice' : 'text'; const count = Math.min(50, Math.max(1, Number(req.body.count) || 10));
    let songs = database.listSongs({ active: true, genre: text(req.body.genre, 50), difficulty: text(req.body.difficulty, 20), limit: 500 }).songs.filter((s) => s.useInSolo);
    if (Number(req.body.setId)) { const allowed = new Set(database.getSetSongIds(Number(req.body.setId), 'solo')); songs = songs.filter((s) => allowed.has(s.id)); }
    const songIds = shuffle(songs.map((s) => s.id)).slice(0, count); if (!songIds.length) return res.status(400).json({ ok: false, message: '조건에 맞는 개인전 음원이 없습니다.' });
    const id = crypto.randomBytes(24).toString('base64url'); const game = { id, songIds, index: 0, stage: 1, score: 0, correctCount: 0, answerMode, inputType, answered: false, expiresAt: Date.now() + 2 * 60 * 60_000 };
    soloSessions.set(id, game); res.json({ ok: true, sessionId: id, challenge: soloChallenge(game) });
  });
  function getSolo(req, res) { const game = soloSessions.get(String(req.body.sessionId || req.query.sessionId || '')); if (!game || game.expiresAt < Date.now()) { if (game) soloSessions.delete(game.id); res.status(404).json({ ok: false, message: '게임 세션이 만료되었습니다.' }); return null; } return game; }
  app.post('/api/music/solo/answer', (req, res) => {
    const game = getSolo(req, res); if (!game) return; if (game.answered) return res.status(400).json({ ok: false, message: '이미 처리한 문제입니다.' });
    const song = database.getSong(game.songIds[game.index], true); const correct = checkAnswer(song, game.answerMode, req.body);
    if (correct) { const points = [100, 70, 40][game.stage - 1]; game.score += points; game.correctCount += 1; game.answered = true; return res.json({ ok: true, correct: true, points, answer: { title: song.title, artist: song.artist }, score: game.score }); }
    if (game.stage < 3) { game.stage += 1; return res.json({ ok: true, correct: false, nextHint: soloChallenge(game) }); }
    game.answered = true; res.json({ ok: true, correct: false, answer: { title: song.title, artist: song.artist }, score: game.score });
  });
  app.post('/api/music/solo/skip', (req, res) => { const game = getSolo(req, res); if (!game) return; if (game.answered) return res.status(400).json({ ok: false, message: '이미 처리한 문제입니다.' }); const song = database.getSong(game.songIds[game.index], true); game.answered = true; res.json({ ok: true, answer: { title: song.title, artist: song.artist }, score: game.score }); });
  app.post('/api/music/solo/next', (req, res) => { const game = getSolo(req, res); if (!game) return; if (!game.answered) return res.status(400).json({ ok: false, message: '현재 문제를 먼저 풀어 주세요.' }); game.index += 1; game.stage = 1; game.answered = false; const challenge = soloChallenge(game); if (challenge.finished) soloSessions.delete(game.id); res.json({ ok: true, challenge }); });

  app.get('/api/music/audio/:token', (req, res) => {
    const access = tokenStore.get(req.params.token); if (!access) return res.status(404).end();
    const file = path.join(audioDir, path.basename(access.filename)); if (!fs.existsSync(file)) return res.status(404).end();
    const size = fs.statSync(file).size; const range = req.headers.range;
    const contentTypes = { '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg' };
    res.setHeader('Content-Type', contentTypes[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Accept-Ranges', 'bytes'); res.setHeader('Cache-Control', 'private, no-store');
    if (!range) { res.setHeader('Content-Length', size); return fs.createReadStream(file).pipe(res); }
    const match = /bytes=(\d*)-(\d*)/.exec(range); if (!match) return res.status(416).end();
    const start = match[1] ? Number(match[1]) : 0; const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start > end || start >= size) return res.status(416).setHeader('Content-Range', `bytes */${size}`).end();
    res.status(206); res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`); res.setHeader('Content-Length', end - start + 1); fs.createReadStream(file, { start, end }).pipe(res);
  });

  const groupGame = createGroupGame({ io, database, issueAudioToken: (payload) => tokenStore.issue(payload) });
  app.get('/api/admin/rooms', adminOnly, (_req, res) => res.json({ rooms: groupGame.publicList() }));
  app.post('/api/admin/rooms/:code/action', adminOnly, (req, res) => {
    const room = groupGame.rooms.get(text(req.params.code, 6).toUpperCase()); if (!room) return res.status(404).json({ ok: false });
    if (req.body.action === 'announce') io.to(`music:${room.code}`).emit('music:admin:announcement', { text: text(req.body.text, 300) });
    else if (req.body.action === 'end') groupGame.endRoom(room.code);
    else return res.status(400).json({ ok: false, message: '지원하지 않는 관리 동작입니다.' });
    database.log(req.session.adminId, `room_${req.body.action}`, 'room', room.code); res.json({ ok: true });
  });

  return { database, groupGame, close: () => { groupGame.close(); tokenStore.clear(); database.db.close(); } };
}

module.exports = { setupMusicGame };
