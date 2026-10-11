// 대결 시계. 서버(시간패 판정)와 브라우저(남은 시간 표시)가 같은 파일을 쓴다.
// none    = 시간 제한 없음(세 게임 모두)
// move    = 한 수 타이머(오목): 내 차례마다 perMove초가 새로 주어지고, 넘기면 시간패.
// fischer = 피셔(체스): 각자 기본 시간, 한 수 둘 때마다 inc초를 더해 준다.
// byoyomi = 초읽기(바둑): 기본 시간을 다 쓰면 한 수를 period초 안에 둬야 한다.
//           제때 두면 초읽기가 다시 꽉 차고, 넘기면 한 번(periods)씩 줄며 다 쓰면 시간패.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DuelClock = api;
})(typeof self !== 'undefined' ? self : this, () => {
  const MODES = ['none', 'move', 'fischer', 'byoyomi'];
  const MOVE_SECONDS = [10, 15, 20, 30, 60];
  // 체스에서 많이 쓰는 피셔 시간(분, 초)
  const FISCHER_PRESETS = [
    { main: 1, inc: 0, name: '불릿' }, { main: 2, inc: 1, name: '불릿' },
    { main: 3, inc: 0, name: '블리츠' }, { main: 3, inc: 2, name: '블리츠' }, { main: 5, inc: 0, name: '블리츠' }, { main: 5, inc: 3, name: '블리츠' },
    { main: 10, inc: 0, name: '래피드' }, { main: 10, inc: 5, name: '래피드' }, { main: 15, inc: 10, name: '래피드' },
    { main: 30, inc: 0, name: '클래식' }, { main: 30, inc: 20, name: '클래식' }
  ];
  const BYOYOMI_MAIN = [0, 1, 3, 5, 10, 20, 30, 60];
  const PERIOD_SECONDS = [10, 20, 30, 40, 60];
  const PERIOD_COUNTS = [1, 2, 3, 5];
  const pick = (value, list, fallback) => (list.includes(Number(value)) ? Number(value) : fallback);

  // allowed = 그 게임이 쓰는 방식들. 목록에 없는 방식·값은 기본값으로 바꾼다.
  function normalizeTime(raw, allowed = MODES) {
    const mode = MODES.includes(raw?.mode) && allowed.includes(raw.mode) ? raw.mode : 'none';
    if (mode === 'move') return { mode, perMove: pick(raw.perMove, MOVE_SECONDS, 30) };
    if (mode === 'fischer') {
      const preset = FISCHER_PRESETS.find((p) => p.main === Number(raw.main) && p.inc === Number(raw.inc)) || { main: 10, inc: 5 };
      return { mode, main: preset.main, inc: preset.inc };
    }
    if (mode === 'byoyomi') return { mode, main: pick(raw.main, BYOYOMI_MAIN, 10), period: pick(raw.period, PERIOD_SECONDS, 30), periods: pick(raw.periods, PERIOD_COUNTS, 3) };
    return { mode };
  }
  const fischerName = (main, inc) => `${FISCHER_PRESETS.find((p) => p.main === main && p.inc === inc)?.name || '피셔'} ${main}분 + ${inc}초`;

  function describeTime(time) {
    if (time.mode === 'move') return `한 수 ${time.perMove}초`;
    if (time.mode === 'fischer') return `${fischerName(time.main, time.inc)}(한 수마다 추가)`;
    if (time.mode === 'byoyomi') return `${time.main ? `기본 ${time.main}분 + ` : ''}초읽기 ${time.period}초 ${time.periods}회`;
    return '시간 제한 없음';
  }

  function startClock(time) {
    if (time.mode === 'none') return null;
    if (time.mode === 'move') return { main: time.perMove * 1000, periods: 0 };
    return { main: time.main * 60_000, periods: time.periods || 0 };
  }

  // 한 차례 동안 spent(ms)를 쓴 뒤의 시계. 시간패면 null. periodLeft = 지금 초읽기에서 남은 ms.
  function spend(clock, spent, time) {
    const main = clock.main - spent;
    if (main >= 0) return { main, periods: clock.periods, periodLeft: time.mode === 'byoyomi' ? time.period * 1000 : 0 };
    if (time.mode !== 'byoyomi') return null;
    const period = time.period * 1000; const over = -main;
    const periods = clock.periods - Math.floor(over / period);
    return periods > 0 ? { main: 0, periods, periodLeft: period - (over % period) } : null;
  }

  // 차례가 끝났을 때 시계에 반영한다: 초읽기는 다시 꽉 차고, 피셔는 추가 시간을 더한다.
  function commit(clock, spent, time) {
    const after = spend(clock, spent, time);
    if (!after) return null;
    if (time.mode === 'move') return { main: time.perMove * 1000, periods: 0 };
    return { main: after.main + (time.mode === 'fischer' ? time.inc * 1000 : 0), periods: after.periods };
  }

  // 지금 차례가 시작된 뒤 몇 ms가 지나면 시간패인지
  const msUntilFlag = (clock, time) => clock.main + (time.mode === 'byoyomi' ? clock.periods * time.period * 1000 : 0);

  function format(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(total / 60); const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }
  // 화면용 글자: "9:58" 또는 "초읽기 27초 · 3회"
  function label(clock, spent, time) {
    if (!clock) return '∞';
    const now = spend(clock, spent, time);
    if (!now) return '0:00';
    if (now.main > 0 || time.mode !== 'byoyomi') return format(now.main);
    return `초읽기 ${Math.ceil(now.periodLeft / 1000)}초 · ${now.periods}회`;
  }
  // 거의 끝나 가는지(빨간색 표시용)
  function urgent(clock, spent, time) {
    if (!clock) return false;
    const now = spend(clock, spent, time);
    if (!now) return true;
    if (time.mode === 'move') return now.main <= 5_000;
    if (now.main > 0) return now.main <= 10_000;
    return time.mode === 'byoyomi' ? now.periodLeft <= 10_000 : true;
  }

  return { MODES, MOVE_SECONDS, FISCHER_PRESETS, BYOYOMI_MAIN, PERIOD_SECONDS, PERIOD_COUNTS, normalizeTime, fischerName, describeTime, startClock, spend, commit, msUntilFlag, label, urgent };
});
