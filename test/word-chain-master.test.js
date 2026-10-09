const test = require('node:test');
const assert = require('node:assert/strict');
const { createMasterEngine } = require('../src/word-chain/master-engine');

const engine = (words) => createMasterEngine(words, { random: () => 0 });

test('고수 컴퓨터: 이어 갈 단어가 없는 글자는 필패, 그 글자로 보낼 수 있으면 필승(나트륨)', () => {
  const m = engine(['사나', '나트륨']);
  const a = m.analyze(new Set());
  assert.equal(a.typeOf('륨'), m.LOSE);
  assert.equal(a.typeOf('나'), m.WIN);
  assert.deepEqual(m.pick('사나', ['사나']), { word: '나트륨', how: 'win', type: 'win' });
  assert.equal(m.pick('나트륨', ['사나', '나트륨']), null); // 륨으로 시작하는 낱말이 없으면 낼 게 없다
});

test('고수 컴퓨터: 두음법칙으로 이어지는 길도 지도에 들어간다(경력 → 역사)', () => {
  const m = engine(['경력', '역사']);
  assert.equal(m.pick('경력', ['경력']).word, '역사');
});

test('고수 컴퓨터: 이미 나온 단어는 빼고 다시 계산한다', () => {
  const m = engine(['사나', '나트륨', '나비']);
  assert.equal(m.pick('사나', ['사나', '나트륨']).word, '나비');
});

test('고수 컴퓨터: 돌아오는 단어(몫몫)뿐이면 홀수 개는 필승, 짝수 개는 필패', () => {
  assert.equal(engine(['몫몫']).analyze(new Set()).typeOf('몫'), 1);
  const even = engine(['몫몫', '몫이몫']);
  assert.equal(even.analyze(new Set()).typeOf('몫'), even.LOSE);
});

test('고수 컴퓨터: 두음으로 다른 글자의 돌아오는 길을 쓰면 그 길이 하나 줄어든다(집주릅 → 늡늡💥)', () => {
  // 릅에서는 두음으로 늡늡을 낼 수 있고, 늡늡을 내면 상대는 늡을 받지만 늡의 유일한 길(늡늡)은 방금 썼다 → 릅은 필승
  const m = engine(['집주릅', '늡늡', '집합', '합격', '격식', '식혜']);
  const a = m.analyze(new Set());
  assert.equal(a.typeOf('늡'), m.WIN); // 처음부터 늡을 받으면 늡늡으로 이긴다(몫몫 1개)
  assert.equal(a.typeOf('릅'), m.WIN); // 예전엔 늡늡이 이미 쓰인 걸 빼먹어서 필패로 봤다
  assert.deepEqual(m.pick('집주릅', ['집주릅']), { word: '늡늡', how: 'win', type: 'win' });
  // 집에서 집주릅을 내면 상대가 늡늡으로 이기므로 내지 않는다(집합 → 합격 → 격식 → 식혜💥 쪽이 낫다)
  assert.notEqual(m.pick('누집', ['누집'], 100).word, '집주릅');
});

test('고수 컴퓨터: 질 수밖에 없으면 상대가 이어 갈 단어가 가장 적은 수를 낸다(버티기)', () => {
  // 가 → 다(다륨·다수·다도 3개) / 라(라륨 1개): 둘 다 상대 필승이라 가는 필패
  const m = engine(['가다', '가라', '다륨', '다수', '다도', '라륨']);
  assert.equal(m.analyze(new Set(), ['가']).typeOf('가'), m.LOSE); // '가'로 끝나는 낱말이 없어 위치로 직접 넣는다
  assert.deepEqual(m.pick('누가', ['누가']), { word: '가라', how: 'hold', type: 'lose' });
});

test('고수 컴퓨터: 루트 글자는 끝까지 따라가 보고 이기는 수를 찾는다', () => {
  // 가 ⇄ 나만 도는 길: 도미노로는 안 정해진다. 가에서 가나 → 나가 → 가다나 하면 상대가 나에서 막힌다.
  const win = engine(['가나', '나가', '가다나']);
  assert.equal(win.analyze(new Set()).typeOf('가'), 0);
  const move = win.pick('보가', ['보가'], 200);
  assert.equal(move.how, 'think'); assert.equal(move.proven, true);
  // 가나 · 나가 하나씩뿐이면 가에서는 진다 → 버티기
  assert.equal(engine(['가나', '나가']).pick('보가', ['보가'], 200).how, 'hold');
});

test('고수 컴퓨터: 첫 단어는 상대를 필패(이어 갈 단어는 있는) 글자로 보낸다', () => {
  const m = engine(['누가', '가다', '가라', '다륨', '다수', '다도', '라륨']);
  assert.deepEqual(m.opener([], 100), { word: '누가', how: 'win', type: 'win' });
});

test('고수 컴퓨터: 새 단어는 더하고 사전에서 빠진 단어는 지운다', () => {
  const m = engine(['사나']);
  assert.equal(m.add('나트륨'), true); assert.equal(m.add('나트륨'), false);
  assert.equal(m.pick('사나', ['사나']).word, '나트륨');
  assert.equal(m.remove('나트륨'), true);
  assert.equal(m.has('나트륨'), false); assert.equal(m.pick('사나', ['사나']), null);
  assert.equal(m.add('가'), false); // 한 글자 낱말은 쓰지 않는다
});
