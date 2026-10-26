const { TOPICS, SIZES } = require('../../public/worldcup/js/topics.js');

const RESULT_COOLDOWN_MS = 5_000;

/**
 * 💘 이상형 월드컵 통계 API. 게임 진행은 브라우저가 혼자 하고, 끝난 판의 1위·결승 상대만 서버에 알린다.
 * GET  /api/worldcup/stats/:topic  → { plays, wins, finals }
 * POST /api/worldcup/result        { topic, size, winner, runnerUp } → 같은 모양의 새 통계
 * 주제·항목은 topics.js에 있는 것만 받고, 같은 IP는 5초에 한 번만 센다.
 */
function setupWorldcup({ app, store }) {
  const topics = new Map(TOPICS.map((topic) => [topic.id, new Set(topic.items.map((item) => item.id))]));
  const submitAt = new Map();

  app.get('/api/worldcup/stats/:topic', (req, res) => {
    if (!topics.has(req.params.topic)) return res.status(404).json({ error: '없는 주제예요.' });
    res.json(store.stats(req.params.topic));
  });

  app.post('/api/worldcup/result', (req, res) => {
    const { topic, size, winner, runnerUp } = req.body || {};
    const items = topics.get(topic);
    if (!items || !SIZES.includes(size) || !items.has(winner) || !items.has(runnerUp) || winner === runnerUp) {
      return res.status(400).json({ error: '올바르지 않은 결과예요.' });
    }
    const ip = req.ip || 'unknown';
    const now = Date.now();
    if (now - (submitAt.get(ip) || 0) < RESULT_COOLDOWN_MS) {
      return res.status(429).json({ error: '너무 빨리 보냈어요.', ...store.stats(topic) });
    }
    submitAt.set(ip, now);
    if (submitAt.size > 5_000) submitAt.clear();
    store.record(topic, winner, runnerUp);
    res.json(store.stats(topic));
  });
}

module.exports = { setupWorldcup };
