#!/usr/bin/env node
// 이상형 월드컵 후보 사진 찾기 (내 컴퓨터에서 가끔 한 번 실행).
// 1단계 `node scripts/worldcup-images.js fetch`  : 위키백과에서 후보마다 문서·대표 사진·출처를 찾아
//                                                 data/worldcup-images-raw.json에 적는다(Git 제외).
// 2단계 (검토)                                    : 문서가 정말 그 후보인지 확인해 data/worldcup-images-review.json에
//                                                 { "<주제>|<후보 id>": true/false }로 적는다.
// 3단계 `node scripts/worldcup-images.js build`  : 검토를 통과한 것만 public/worldcup/js/images.js로 만든다.
// 사진 파일은 받지 않고 위키미디어 주소만 적는다(후보 6천 개를 다 받으면 저장소가 너무 무거움).
// 위키백과 대표 사진(pageimages)은 자유 라이선스 사진만 돌려준다.
'use strict';
const fs = require('fs');
const path = require('path');
const { TOPICS } = require('../public/worldcup/js/topics.js');

const ROOT = path.join(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'worldcup-images-raw.json');
const REVIEW = path.join(ROOT, 'data', 'worldcup-images-review.json');
const OUT = path.join(ROOT, 'public', 'worldcup', 'js', 'images.js');
const API = 'https://ko.wikipedia.org/w/api.php';
const UA = 'GroupGameCollection/1.0 (https://github.com/kmathlove-wq/Group-Game-Collection; worldcup image list)';
const THUMB = 400;
// 실제 사람 주제는 이름만으로 문서를 못 찾아서 검색어에 붙이는 말
const PEOPLE_HINT = { singer: '가수', athlete: '선수', hero: '', actor: '배우', youtuber: '유튜버' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ask(params) {
  const q = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  // 위키백과는 너무 빨리 물으면 429(잠깐 그만)를 돌려준다 → retry-after만큼(없으면 점점 길게) 쉬고 다시 묻는다.
  for (let i = 0; ; i++) {
    let wait = 5000 * (i + 1);
    try {
      const res = await fetch(`${API}?${q}`, { headers: { 'User-Agent': UA } });
      if (res.ok) return await res.json();
      const after = Number(res.headers.get('retry-after'));
      if (after > 0) wait = Math.max(wait, after * 1000);
      throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (i >= 8) throw e;
      console.log(`  (${e.message}, ${Math.round(wait / 1000)}초 쉬고 다시)`);
      await sleep(wait);
    }
  }
}
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

// 사람 이름 '정국(BTS)' → 검색어 '정국 BTS 가수'
function searchText(topic, name) {
  const m = name.match(/^(.*)\((.*)\)$/);
  const base = m ? `${m[1]} ${m[2]}` : name;
  return `${base} ${PEOPLE_HINT[topic.id] || ''}`.trim();
}

async function findTitles(topic) {
  const titles = {};
  if (!topic.people) {
    topic.items.forEach((it) => { titles[it.id] = it.name; });
    return titles;
  }
  // 검색은 위키백과가 자주 막으므로, 괄호 없는 이름은 먼저 문서 제목으로 한꺼번에(50개씩) 찾아보고
  // 없거나 동음이의어 문서일 때만 한 명씩 검색한다.
  const plain = topic.items.filter((it) => !/\(/.test(it.name));
  const direct = await pageInfo(plain.map((it) => it.name));
  plain.forEach((it) => {
    const d = direct[it.name];
    if (d && !d.disambiguation && d.thumb) titles[it.id] = it.name;
  });
  for (const it of topic.items) {
    if (titles[it.id]) continue;
    const r = await ask({ action: 'query', list: 'search', srsearch: searchText(topic, it.name), srlimit: '1' });
    const hit = r.query && r.query.search && r.query.search[0];
    if (hit) titles[it.id] = hit.title;
    await sleep(700);
  }
  return titles;
}

async function pageInfo(titleList) {
  const info = {};
  for (const part of chunk([...new Set(titleList)], 50)) {
    const r = await ask({
      action: 'query', titles: part.join('|'), redirects: '1',
      prop: 'pageimages|pageprops|description', piprop: 'thumbnail|name', pithumbsize: String(THUMB), ppprop: 'disambiguation'
    });
    const q = r.query || {};
    const alias = {};
    (q.normalized || []).concat(q.redirects || []).forEach((n) => { alias[n.from] = n.to; });
    const pages = {};
    (q.pages || []).forEach((p) => { pages[p.title] = p; });
    part.forEach((t) => {
      let to = t;
      for (let i = 0; i < 3 && alias[to]; i++) to = alias[to];
      const p = pages[to];
      if (!p || p.missing) return;
      info[t] = {
        title: p.title,
        desc: p.description || '',
        disambiguation: !!(p.pageprops && 'disambiguation' in p.pageprops),
        file: p.pageimage || '',
        thumb: p.thumbnail ? p.thumbnail.source.replace(/\?.*$/, '') : ''
      };
    });
    await sleep(1000);
  }
  return info;
}

// 사진 출처: 찍은 사람(글자만)·라이선스
async function credits(files) {
  const out = {};
  const clean = (html) => String(html || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  for (const part of chunk([...new Set(files)], 50)) {
    const r = await ask({ action: 'query', titles: part.map((f) => `File:${f}`).join('|'), prop: 'imageinfo', iiprop: 'extmetadata' });
    const q = r.query || {};
    const alias = {};
    (q.normalized || []).forEach((n) => { alias[n.to] = n.from; });
    (q.pages || []).forEach((p) => {
      const m = p.imageinfo && p.imageinfo[0] && p.imageinfo[0].extmetadata;
      if (!m) return;
      const from = (alias[p.title] || p.title).replace(/^File:/, '');
      out[from] = { artist: clean(m.Artist && m.Artist.value), license: clean(m.LicenseShortName && m.LicenseShortName.value) };
    });
    await sleep(1000);
  }
  return out;
}

async function fetchAll() {
  const only = process.argv[3];
  const raw = fs.existsSync(RAW) ? JSON.parse(fs.readFileSync(RAW, 'utf8')) : {};
  for (const topic of TOPICS) {
    if (only ? topic.id !== only : raw[topic.id]) continue; // 주제를 안 정하면 이미 찾은 주제는 건너뜀(이어 하기)
    process.stdout.write(`${topic.title}… `);
    const titles = await findTitles(topic);
    const info = await pageInfo(Object.values(titles));
    const files = Object.values(info).map((i) => i.file).filter(Boolean);
    const cr = await credits(files);
    raw[topic.id] = {};
    topic.items.forEach((it) => {
      const i = info[titles[it.id]];
      if (!i) return;
      raw[topic.id][it.id] = { name: it.name, ...i, credit: i.file ? cr[i.file] || null : null };
    });
    const withPic = Object.values(raw[topic.id]).filter((v) => v.thumb && !v.disambiguation).length;
    console.log(`문서 ${Object.keys(raw[topic.id]).length}개, 사진 후보 ${withPic}개 / ${topic.items.length}`);
    fs.writeFileSync(RAW, JSON.stringify(raw, null, 1));
  }
}

// 찍은 사람 이름만 짧게: 'Copyright: …', '(talk)' 같은 꼬리는 자르고 40자가 넘으면 '…'
function shortArtist(text) {
  let s = String(text || '').split(/\s*(?:Copyright|\(talk\)|\btalk\b|•|\||;)/i)[0].trim();
  if (!s || /^unknown/i.test(s)) return '작자 미상';
  return s.length > 40 ? s.slice(0, 39) + '…' : s;
}

function build() {
  const raw = JSON.parse(fs.readFileSync(RAW, 'utf8'));
  const review = fs.existsSync(REVIEW) ? JSON.parse(fs.readFileSync(REVIEW, 'utf8')) : {};
  const out = {};
  let n = 0;
  TOPICS.forEach((topic) => {
    const rows = raw[topic.id] || {};
    topic.items.forEach((it) => {
      const r = rows[it.id];
      if (!r || !r.thumb || r.disambiguation || !r.credit || review[`${topic.id}|${it.id}`] !== true) return;
      // 주소 앞부분은 늘 같아서 줄여 적는다: 'commons/thumb/' 뒤만
      const short = r.thumb.replace('https://upload.wikimedia.org/wikipedia/', '').replace('https://thumb.wikimedia.org/wikipedia/', '');
      const credit = [shortArtist(r.credit.artist), r.credit.license, '위키미디어 공용'].filter(Boolean).join(' · ');
      (out[topic.id] = out[topic.id] || {})[it.id] = [short, credit];
      n++;
    });
  });
  const body = `// ===== images.js =====
// 자동 생성 파일 — 손으로 고치지 말 것. scripts/worldcup-images.js build로 만든다.
// 후보 사진: { 주제: { 후보 id: [위키미디어 사진 주소 뒷부분, '찍은 사람 · 라이선스 · 위키미디어 공용'] } }
(function (root) {
  'use strict';
  var IMAGES = ${JSON.stringify(out)};
  var BASE = 'https://upload.wikimedia.org/wikipedia/';
  function imageOf(topicId, itemId) {
    var t = IMAGES[topicId];
    var v = t && t[itemId];
    return v ? { src: BASE + v[0], credit: v[1] } : null;
  }
  var api = { IMAGES: IMAGES, imageOf: imageOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WorldcupImages = api;
})(typeof window !== 'undefined' ? window : this);
`;
  fs.writeFileSync(OUT, body);
  console.log(`사진 ${n}개를 ${path.relative(ROOT, OUT)}에 적었어요.`);
}

const cmd = process.argv[2];
if (cmd === 'fetch') fetchAll().catch((e) => { console.error(e); process.exit(1); });
else if (cmd === 'build') build();
else console.log('사용법: node scripts/worldcup-images.js fetch [주제id] | build');
