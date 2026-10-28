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
  assert.ok(Story.ENDING_IDS.length >= 12);
  assert.equal(Story.ENDING_IDS.length, Object.values(NODES).filter((n) => n.type === 'ending').length);
  assert.ok(Story.FAIL_IDS.length >= 45);
  const choiceCount = Object.values(NODES).filter((n) => n.type === 'choice').reduce((sum, n) => sum + n.choices.length, 0);
  assert.ok(choiceCount >= 70, `선택지 ${choiceCount}개`);
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

test('빙수는 라면 장면으로 이어지지 않고, 라면 글은 라면 길에서만 나온다', () => {
  const { NODES } = Story;
  const bingsu = NODES.kitchen.choices.find((c) => c.label.includes('빙수'));
  assert.ok(bingsu && NODES[bingsu.next], '빙수 선택지');
  assert.notEqual(bingsu.next, 'captain');
  assert.ok(!/라면/.test(NODES[bingsu.next].text), '빙수 결과에 라면이 나옴');
  const ramen = NODES.kitchen.choices.find((c) => c.label.includes('라면'));
  assert.equal(ramen.next, 'captain');
});

test('선택지 글에 든 낱말이 이어진 장면에 라면·빙수처럼 어긋나게 나오지 않는다', () => {
  for (const [id, node] of Object.entries(Story.NODES)) {
    if (node.type !== 'choice') continue;
    for (const c of node.choices) {
      const target = Story.NODES[c.next];
      assert.ok(target, `${id} → ${c.next}`);
      for (const word of ['빙수', '라면']) {
        if (c.label.includes(word) && target.type === 'choice') {
          assert.ok(target.text.includes(word), `${id}의 '${c.label}' → ${c.next} 글에 '${word}' 없음`);
        }
      }
    }
  }
});

test('자석으로 열쇠 끌어오기: 열쇠·문 이야기에 맞는 장면으로 이어지고, 공유 장면 글은 한 길에만 맞는 말을 하지 않는다', () => {
  const { NODES } = Story;
  const magnet = NODES.cell.choices.find((c) => c.label.includes('자석'));
  const side = NODES.hall.choices.find((c) => c.label.includes('옆 문'));
  assert.equal(magnet.next, side.next, '둘 다 화물칸');
  const cargo = NODES[magnet.next];
  assert.ok(/열쇠/.test(magnet.lead) && /문/.test(magnet.lead), '자석 길은 열쇠로 문을 연 이야기를 먼저 보여 줘야 함');
  assert.ok(/옆 문/.test(side.lead), '옆 문 길은 옆 문으로 들어온 이야기를 먼저 보여 줘야 함');
  assert.ok(!/도착한|문이 열렸다|열쇠/.test(cargo.text), '같이 쓰는 화물칸 글에는 한 길에만 맞는 말 금지');
  // 여러 선택지가 같이 쓰는 선택 장면의 글에는, 들어오는 선택지 글의 물건 낱말(2글자 이상)이 끼어들면 안 된다
  const incoming = {};
  for (const [id, node] of Object.entries(NODES)) {
    if (node.type !== 'choice') continue;
    for (const c of node.choices) (incoming[c.next] = incoming[c.next] || []).push(c.label);
  }
  for (const [id, labels] of Object.entries(incoming)) {
    if (labels.length < 2 || NODES[id].type !== 'choice') continue;
    for (const label of labels) {
      for (const w of label.replace(/[^가-힣]/g, ' ').split(' ').filter((x) => x.length >= 2 && !['우주선', '엔진실'].includes(x) && !labels.every((l) => l.includes(x)))) {
        assert.ok(!NODES[id].text.includes(w), `${id} 글에 선택지 '${label}'의 낱말 '${w}'가 있어 다른 길과 어긋남`);
      }
    }
  }
});

test('출발 음악부터 틀기 → 문이 덜 닫힘: 글이 음악을 말한다', () => {
  assert.ok(Story.NODES.f_door.text.includes('음악'));
  assert.ok(Story.NODES.f_door.text.includes('늦게'));
});
