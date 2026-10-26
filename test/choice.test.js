const test = require('node:test');
const assert = require('node:assert/strict');
const Story = require('../public/choice/js/story.js');

test('이야기 지도: 모든 길이 있는 장면으로 이어지고, 처음부터 모든 장면에 갈 수 있다', () => {
  const { NODES, START } = Story;
  assert.ok(NODES[START]);
  for (const [id, node] of Object.entries(NODES)) {
    assert.ok(['choice', 'fail', 'ending'].includes(node.type), id);
    assert.ok(node.art, `${id} 그림 이름`);
    if (node.type === 'choice') {
      assert.ok(node.text && node.choices.length >= 1, id);
      for (const c of node.choices) assert.ok(NODES[c.next], `${id} → ${c.next} 없음`);
      if (node.timer) assert.ok(NODES[node.timeout], `${id} 시간 초과 장면 없음`);
    } else {
      assert.ok(node.title && node.text, id);
    }
  }
  const seen = new Set([START]);
  const queue = [START];
  while (queue.length) {
    const node = NODES[queue.shift()];
    if (node.type !== 'choice') continue;
    for (const next of node.choices.map((c) => c.next).concat(node.timeout || [])) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  assert.deepEqual([...seen].sort(), Object.keys(NODES).sort(), '못 가는 장면이 있음');
  assert.ok(Story.ENDING_IDS.length >= 5);
  assert.ok(Story.FAIL_IDS.length >= 10);
});

test('진행: 고르기·시간 초과·실패 뒤 다시 하기는 마지막 선택 장면으로', () => {
  const g = Story.create();
  Story.choose(g, 2); // 바나나
  assert.equal(g.node, 'hall');
  Story.timeout(g);
  assert.equal(g.node, 'f_freeze');
  Story.retry(g);
  assert.equal(g.node, 'hall');
  Story.choose(g, 0); Story.choose(g, 2); Story.choose(g, 0);
  assert.equal(g.node, 'e_hero');
  assert.equal(Story.choose(g, 0), 'e_hero', '엔딩에서는 더 못 고름');
  const g2 = Story.create();
  Story.timeout(g2);
  assert.equal(g2.node, 'cell', '시간 제한 없는 장면은 시간 초과 없음');
});

test('모든 장면 그림이 오류 없이 그려진다(가짜 캔버스)', () => {
  global.window = { Choice: {} };
  delete require.cache[require.resolve('../public/choice/js/scenes.js')];
  require('../public/choice/js/scenes.js');
  const Scenes = global.window.Choice.Scenes;
  const noop = () => {};
  const ctx = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createLinearGradient') return () => ({ addColorStop: noop });
      if (key === 'measureText') return (s) => ({ width: String(s).length * 10 });
      if (key === 'roundRect') return noop;
      return noop;
    },
    set(target, key, value) { target[key] = value; return true; }
  });
  for (const [id, node] of Object.entries(Story.NODES)) {
    const art = Scenes.ART[node.art];
    assert.equal(typeof art, 'function', `${id}의 그림 ${node.art} 없음`);
    for (const t of [0, 0.3, 0.8, 1.2, 1.6, 2.5, 5]) art(ctx, t);
  }
  Scenes.endingStamp(ctx, 2);
  delete global.window;
});
