const crypto = require('crypto');

const AUDIO_MIMES = new Set(['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.wav', '.ogg']);
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.jfif', '.png', '.webp']);

function text(value, max = 100) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);
}

function list(value, maxItems = 20, maxLength = 100) {
  const source = Array.isArray(value) ? value : String(value || '').split(/[\n,]/);
  return [...new Set(source.map((item) => text(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function boolean(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 'true' || value === '1' || value === 1;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeAnswer(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('ko-KR')
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

function accepted(values) {
  return new Set(values.map(normalizeAnswer).filter(Boolean));
}

function checkAnswer(song, mode, answer) {
  const titleAnswers = accepted([song.title, ...song.titleAliases]);
  const artistAnswers = accepted([song.artist, ...song.artistAliases]);
  if (mode === 'artist') return artistAnswers.has(normalizeAnswer(answer.artist ?? answer.value));
  if (mode === 'both') {
    return titleAnswers.has(normalizeAnswer(answer.title)) && artistAnswers.has(normalizeAnswer(answer.artist));
  }
  return titleAnswers.has(normalizeAnswer(answer.title ?? answer.value));
}

function parseSong(body, current = {}) {
  const startTime = Math.max(0, number(body.startTime, current.startTime || 0));
  const firstDuration = number(body.firstDuration, current.firstDuration || 3);
  const secondDuration = number(body.secondDuration, current.secondDuration || 5);
  const thirdDuration = number(body.thirdDuration, current.thirdDuration || 10);
  const duration = number(body.duration, current.duration || 0);
  const value = {
    title: text(body.title ?? current.title, 100), artist: text(body.artist ?? current.artist, 100),
    titleAliases: list(body.titleAliases ?? current.titleAliases, 30, 100),
    artistAliases: list(body.artistAliases ?? current.artistAliases, 30, 100),
    startTime, firstDuration, secondDuration, thirdDuration, duration,
    genre: text(body.genre ?? current.genre, 50),
    difficulty: text(body.difficulty ?? current.difficulty ?? '보통', 20) || '보통',
    releaseYear: body.releaseYear ? Math.trunc(number(body.releaseYear)) : null,
    tags: list(body.tags ?? current.tags, 30, 40), description: text(body.description ?? current.description, 500),
    isActive: boolean(body.isActive, current.isActive ?? true),
    useInSolo: boolean(body.useInSolo, current.useInSolo ?? true),
    useInGroup: boolean(body.useInGroup, current.useInGroup ?? true),
    audioFilename: current.audioFilename, imageFilename: current.imageFilename
  };
  let error = '';
  if (!value.title || !value.artist) error = '노래 제목과 가수를 입력해 주세요.';
  else if (!(firstDuration > 0 && firstDuration < secondDuration && secondDuration < thirdDuration)) error = '힌트 길이는 0보다 크고 1단계 < 2단계 < 3단계여야 합니다.';
  else if (!(duration > 0) || startTime + thirdDuration > duration + 0.05) error = '재생 구간이 음원 전체 길이를 벗어납니다.';
  else if (value.releaseYear && (value.releaseYear < 1800 || value.releaseYear > 2200)) error = '발매 연도를 확인해 주세요.';
  return { value, error };
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function createTokenStore(ttlMs = 15 * 60_000) {
  const tokens = new Map();
  function issue(payload) {
    const token = crypto.randomBytes(32).toString('base64url');
    tokens.set(token, { ...payload, expiresAt: Date.now() + ttlMs });
    return token;
  }
  function get(token) {
    const item = tokens.get(token);
    if (!item || item.expiresAt < Date.now()) {
      tokens.delete(token);
      return null;
    }
    return item;
  }
  const timer = setInterval(() => {
    for (const [token, item] of tokens) if (item.expiresAt < Date.now()) tokens.delete(token);
  }, Math.min(ttlMs, 60_000));
  timer.unref?.();
  return { issue, get, clear: () => { clearInterval(timer); tokens.clear(); } };
}

module.exports = {
  AUDIO_MIMES, AUDIO_EXTENSIONS, IMAGE_MIMES, IMAGE_EXTENSIONS,
  text, list, boolean, number, normalizeAnswer, checkAnswer, parseSong, shuffle, createTokenStore
};
