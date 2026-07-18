const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function json(value, fallback = []) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function mapSong(row, { privateFields = false } = {}) {
  if (!row) return null;
  const song = {
    id: row.id,
    title: row.title,
    artist: row.artist,
    titleAliases: json(row.title_aliases),
    artistAliases: json(row.artist_aliases),
    startTime: row.start_time,
    firstDuration: row.first_duration,
    secondDuration: row.second_duration,
    thirdDuration: row.third_duration,
    duration: row.duration,
    genre: row.genre,
    difficulty: row.difficulty,
    releaseYear: row.release_year,
    tags: json(row.tags),
    description: row.description,
    isActive: Boolean(row.is_active),
    useInSolo: Boolean(row.use_in_solo),
    useInGroup: Boolean(row.use_in_group),
    hasImage: Boolean(row.image_filename),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  if (privateFields) {
    song.audioFilename = row.audio_filename;
    song.imageFilename = row.image_filename;
  }
  return song;
}

function createMusicDatabase({ filename, bcrypt, adminUsername, adminPassword }) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      title_aliases TEXT NOT NULL DEFAULT '[]',
      artist_aliases TEXT NOT NULL DEFAULT '[]',
      audio_filename TEXT NOT NULL UNIQUE,
      image_filename TEXT,
      start_time REAL NOT NULL DEFAULT 0,
      first_duration REAL NOT NULL DEFAULT 3,
      second_duration REAL NOT NULL DEFAULT 5,
      third_duration REAL NOT NULL DEFAULT 10,
      duration REAL NOT NULL,
      genre TEXT NOT NULL DEFAULT '',
      difficulty TEXT NOT NULL DEFAULT '보통',
      release_year INTEGER,
      tags TEXT NOT NULL DEFAULT '[]',
      description TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      use_in_solo INTEGER NOT NULL DEFAULT 1,
      use_in_group INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS songs_active_idx ON songs(is_active, use_in_solo, use_in_group);
    CREATE TABLE IF NOT EXISTS question_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      description TEXT NOT NULL DEFAULT '',
      is_random INTEGER NOT NULL DEFAULT 0,
      use_in_solo INTEGER NOT NULL DEFAULT 1,
      use_in_group INTEGER NOT NULL DEFAULT 1,
      is_public INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS question_set_songs (
      set_id INTEGER NOT NULL REFERENCES question_sets(id) ON DELETE CASCADE,
      song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(set_id, song_id)
    );
    CREATE TABLE IF NOT EXISTS admin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL DEFAULT '',
      target_id TEXT NOT NULL DEFAULT '',
      detail TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  if (adminUsername && adminPassword && !db.prepare('SELECT id FROM admins LIMIT 1').get()) {
    const hash = bcrypt.hashSync(adminPassword, 12);
    db.prepare('INSERT INTO admins(username, password_hash) VALUES (?, ?)').run(adminUsername.trim(), hash);
  }

  const statements = {
    adminByName: db.prepare('SELECT * FROM admins WHERE username = ? COLLATE NOCASE'),
    adminById: db.prepare('SELECT id, username, created_at, updated_at FROM admins WHERE id = ?'),
    updatePassword: db.prepare("UPDATE admins SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"),
    songById: db.prepare('SELECT * FROM songs WHERE id = ?'),
    deleteSong: db.prepare('DELETE FROM songs WHERE id = ?'),
    duplicate: db.prepare('SELECT id FROM songs WHERE lower(title) = lower(?) AND lower(artist) = lower(?) LIMIT 1'),
    log: db.prepare('INSERT INTO admin_logs(admin_id, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?)')
  };

  function listSongs({ search = '', genre = '', difficulty = '', active, limit = 100, offset = 0, privateFields = false } = {}) {
    const where = [];
    const values = [];
    if (search) {
      where.push('(title LIKE ? OR artist LIKE ? OR tags LIKE ?)');
      values.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (genre) { where.push('genre = ?'); values.push(genre); }
    if (difficulty) { where.push('difficulty = ?'); values.push(difficulty); }
    if (active !== undefined) { where.push('is_active = ?'); values.push(active ? 1 : 0); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = db.prepare(`SELECT * FROM songs ${clause} ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`).all(...values, limit, offset);
    const total = db.prepare(`SELECT COUNT(*) count FROM songs ${clause}`).get(...values).count;
    return { songs: rows.map((row) => mapSong(row, { privateFields })), total };
  }

  function getSong(id, privateFields = false) {
    return mapSong(statements.songById.get(id), { privateFields });
  }

  function insertSong(song) {
    const result = db.prepare(`INSERT INTO songs(
      title, artist, title_aliases, artist_aliases, audio_filename, image_filename,
      start_time, first_duration, second_duration, third_duration, duration,
      genre, difficulty, release_year, tags, description, is_active, use_in_solo, use_in_group
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(song.title, song.artist, JSON.stringify(song.titleAliases), JSON.stringify(song.artistAliases),
        song.audioFilename, song.imageFilename || null, song.startTime, song.firstDuration,
        song.secondDuration, song.thirdDuration, song.duration, song.genre, song.difficulty,
        song.releaseYear, JSON.stringify(song.tags), song.description, song.isActive ? 1 : 0,
        song.useInSolo ? 1 : 0, song.useInGroup ? 1 : 0);
    return getSong(result.lastInsertRowid, true);
  }

  function updateSong(id, song) {
    db.prepare(`UPDATE songs SET title=?, artist=?, title_aliases=?, artist_aliases=?, image_filename=?,
      start_time=?, first_duration=?, second_duration=?, third_duration=?, duration=?, genre=?, difficulty=?,
      release_year=?, tags=?, description=?, is_active=?, use_in_solo=?, use_in_group=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?`).run(song.title, song.artist, JSON.stringify(song.titleAliases), JSON.stringify(song.artistAliases),
      song.imageFilename || null, song.startTime, song.firstDuration, song.secondDuration, song.thirdDuration,
      song.duration, song.genre, song.difficulty, song.releaseYear, JSON.stringify(song.tags), song.description,
      song.isActive ? 1 : 0, song.useInSolo ? 1 : 0, song.useInGroup ? 1 : 0, id);
    return getSong(id, true);
  }

  function listSets({ publicOnly = false } = {}) {
    const rows = db.prepare(`SELECT qs.*, COUNT(qss.song_id) song_count FROM question_sets qs
      LEFT JOIN question_set_songs qss ON qss.set_id = qs.id ${publicOnly ? 'WHERE qs.is_public = 1' : ''}
      GROUP BY qs.id ORDER BY qs.updated_at DESC`).all();
    return rows.map((row) => ({ id: row.id, name: row.name, description: row.description,
      isRandom: Boolean(row.is_random), useInSolo: Boolean(row.use_in_solo),
      useInGroup: Boolean(row.use_in_group), isPublic: Boolean(row.is_public), songCount: row.song_count }));
  }

  function getSetSongIds(id, mode) {
    const modeColumn = mode === 'group' ? 'use_in_group' : 'use_in_solo';
    return db.prepare(`SELECT s.id FROM question_set_songs qss JOIN songs s ON s.id=qss.song_id
      WHERE qss.set_id=? AND s.is_active=1 AND s.${modeColumn}=1 ORDER BY qss.position, qss.song_id`).all(id).map((r) => r.id);
  }

  const saveSet = db.transaction((id, data) => {
    let setId = id;
    if (setId) {
      db.prepare(`UPDATE question_sets SET name=?, description=?, is_random=?, use_in_solo=?, use_in_group=?,
        is_public=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(data.name, data.description, data.isRandom ? 1 : 0,
        data.useInSolo ? 1 : 0, data.useInGroup ? 1 : 0, data.isPublic ? 1 : 0, setId);
      db.prepare('DELETE FROM question_set_songs WHERE set_id=?').run(setId);
    } else {
      setId = Number(db.prepare(`INSERT INTO question_sets(name, description, is_random, use_in_solo, use_in_group, is_public)
        VALUES (?, ?, ?, ?, ?, ?)`).run(data.name, data.description, data.isRandom ? 1 : 0,
        data.useInSolo ? 1 : 0, data.useInGroup ? 1 : 0, data.isPublic ? 1 : 0).lastInsertRowid);
    }
    const add = db.prepare('INSERT INTO question_set_songs(set_id, song_id, position) VALUES (?, ?, ?)');
    data.songIds.forEach((songId, index) => add.run(setId, songId, index));
    return setId;
  });

  return {
    db, mapSong, listSongs, getSong, insertSong, updateSong, listSets, getSetSongIds, saveSet,
    findAdmin: (username) => statements.adminByName.get(username),
    getAdmin: (id) => statements.adminById.get(id),
    updatePassword: (id, hash) => statements.updatePassword.run(hash, id),
    hasDuplicate: (title, artist, exceptId) => {
      const found = statements.duplicate.get(title, artist);
      return Boolean(found && Number(found.id) !== Number(exceptId));
    },
    deleteSong: (id) => statements.deleteSong.run(id),
    log: (adminId, action, targetType = '', targetId = '', detail = '') =>
      statements.log.run(adminId || null, action, targetType, String(targetId), String(detail).slice(0, 500)),
    getLogs: () => db.prepare('SELECT * FROM admin_logs ORDER BY id DESC LIMIT 200').all(),
    deleteSet: (id) => db.prepare('DELETE FROM question_sets WHERE id=?').run(id),
    getSet: (id) => {
      const row = db.prepare('SELECT * FROM question_sets WHERE id=?').get(id);
      if (!row) return null;
      return { id: row.id, name: row.name, description: row.description, isRandom: Boolean(row.is_random),
        useInSolo: Boolean(row.use_in_solo), useInGroup: Boolean(row.use_in_group), isPublic: Boolean(row.is_public),
        songIds: db.prepare('SELECT song_id FROM question_set_songs WHERE set_id=? ORDER BY position').all(id).map((r) => r.song_id) };
    }
  };
}

module.exports = { createMusicDatabase };
