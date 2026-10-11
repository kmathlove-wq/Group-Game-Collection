(() => {
  const { kind, rules, $, emit, notice, sounds } = window.Duel;
  const Clock = window.DuelClock;
  const socket = io();
  const call = (event, data) => emit(socket, event, data);
  const show = (message, type) => notice($('#notice'), message, type);
  let me = null;          // 로비에 들어간 내 정보 { userId, nickname }
  let lobby = { users: [], matches: [] };
  let offer = null;       // 주고받는 중인 신청
  let offerDeadline = 0;
  let termsTarget = null; // 조건 창: { mode: 'send', toId } 또는 { mode: 'modify' }

  // ── 닉네임 · 입장 ──
  $('#nickname').value = window.Duel.nickname();
  const countNickname = () => { $('#nicknameCount').textContent = `${Array.from($('#nickname').value).length}/30`; };
  countNickname(); $('#nickname').addEventListener('input', countNickname);
  const exitNotice = sessionStorage.getItem('duel:exitNotice'); sessionStorage.removeItem('duel:exitNotice');
  if (exitNotice) show(exitNotice, 'success');

  async function enter() {
    const nickname = $('#nickname').value.trim();
    if (!nickname) { show('닉네임을 입력해 주세요.', 'error'); $('#nickname').focus(); return; }
    try {
      const result = await call('lobby:enter', { userId: window.Duel.userId(), nickname });
      window.Duel.saveNickname(nickname); me = { userId: window.Duel.userId(), nickname };
      sessionStorage.setItem(`duel:${kind}:inLobby`, '1');
      $('#myName').textContent = nickname;
      $('#enterCard').classList.add('hidden'); $('#lobby').classList.remove('hidden');
      document.querySelector('.songcatch-lobby-features').classList.add('hidden');
      renderLobby(result.lobby);
    } catch (error) { show(error.message, 'error'); }
  }
  $('#enter').onclick = enter;
  $('#nickname').onkeydown = (event) => { if (event.key === 'Enter' && !event.isComposing) enter(); };
  $('#rename').onclick = () => {
    me = null; sessionStorage.removeItem(`duel:${kind}:inLobby`);
    $('#lobby').classList.add('hidden'); $('#enterCard').classList.remove('hidden');
    document.querySelector('.songcatch-lobby-features').classList.remove('hidden');
    $('#nickname').focus();
  };

  socket.on('connect', () => {
    $('#connectionStatus').textContent = '● 서버 연결됨'; $('#connectionStatus').classList.add('connected');
    // 새로고침·대결 뒤 돌아왔을 때나 연결이 다시 붙었을 때 자동으로 로비에 다시 들어간다.
    if (me || (sessionStorage.getItem(`duel:${kind}:inLobby`) && window.Duel.nickname())) enter();
  });
  socket.on('disconnect', () => { $('#connectionStatus').textContent = '● 서버 연결 끊김'; $('#connectionStatus').classList.remove('connected'); });

  // ── 로비 목록 ──
  const colorName = (color) => rules.colorNames[color];
  function renderLobby(state) {
    lobby = state;
    const users = $('#users'); users.replaceChildren();
    const sorted = [...state.users].sort((a, b) => (b.userId === me?.userId) - (a.userId === me?.userId));
    $('#userCount').textContent = String(sorted.length);
    for (const user of sorted) {
      const row = document.createElement('div'); row.className = 'duel-user';
      const name = document.createElement('b'); name.textContent = user.nickname + (user.userId === me?.userId ? ' (나)' : '');
      const status = document.createElement('small'); status.textContent = user.busy ? '신청 주고받는 중…' : '대기 중';
      status.className = user.busy ? 'busy' : 'idle';
      const info = document.createElement('div'); info.append(name, status);
      row.append(info);
      if (user.userId !== me?.userId) {
        const button = document.createElement('button'); button.className = 'primary music-compact';
        button.textContent = '대결 신청'; button.disabled = user.busy || Boolean(offer);
        button.onclick = () => openTerms({ mode: 'send', toId: user.userId, toName: user.nickname });
        row.append(button);
      }
      users.append(row);
    }
    if (sorted.length <= 1) {
      const empty = document.createElement('p'); empty.className = 'duel-empty';
      empty.textContent = '아직 다른 사람이 없어요. 친구에게 이 주소를 알려 주세요!';
      users.append(empty);
    }

    const matches = $('#matches'); matches.replaceChildren();
    $('#matchCount').textContent = String(state.matches.length);
    for (const match of [...state.matches].sort((a, b) => b.createdAt - a.createdAt)) {
      const card = document.createElement('article'); card.className = 'duel-match-card';
      const title = document.createElement('b');
      title.textContent = match.seats.map((s) => `${colorName(s.color)} ${s.nickname}`).join('  vs  ');
      const meta = document.createElement('small');
      meta.textContent = `${match.moveCount}수째 · 👀 ${match.spectators}명 · ${match.summary}`;
      const button = document.createElement('a'); button.className = 'secondary music-compact duel-watch';
      button.href = `/${kind}/match?id=${encodeURIComponent(match.id)}`; button.textContent = '관전하기';
      const info = document.createElement('div'); info.append(title, meta);
      card.append(info, button); matches.append(card);
    }
    if (!state.matches.length) {
      const empty = document.createElement('p'); empty.className = 'duel-empty'; empty.textContent = '지금 진행 중인 대결이 없어요.';
      matches.append(empty);
    }
  }
  socket.on(`${kind}:lobby:state`, (state) => { if (me) renderLobby(state); });

  // ── 대결 조건 창 ──
  const savedTerms = () => { try { return JSON.parse(localStorage.getItem(`duel:${kind}:terms`)) || {}; } catch { return {}; } };
  const fillSelect = (select, values, format, value) => {
    select.replaceChildren(...values.map((v) => new Option(format(v), String(v))));
    select.value = String(value);
  };

  function renderColorChoices(value) {
    const root = $('#colorChoices'); root.replaceChildren();
    const choices = [...rules.colors.map((color, i) => [color, `${colorName(color)}${i === 0 ? ' (먼저 둬요)' : ''}`]), ['random', '🎲 무작위']];
    for (const [color, label] of choices) {
      const item = document.createElement('label');
      const input = document.createElement('input'); input.type = 'radio'; input.name = 'myColor'; input.value = color; input.checked = color === value;
      const text = document.createElement('span'); text.textContent = label;
      item.append(input, text); root.append(item);
    }
  }

  // 게임마다 쓰는 시간 방식: 오목 = 한 수 타이머, 바둑 = 처음 시간 + 초읽기, 체스 = 피셔
  const MODE_LABELS = { none: '제한 없음', move: '한 수 타이머', byoyomi: '처음 시간 + 초읽기', fischer: '피셔 (체스에서 많이 쓰는 시간)' };
  fillSelect($('#timeMode'), rules.timeModes, (mode) => MODE_LABELS[mode], 'none');
  function renderTime(time) {
    $('#timeMode').value = time.mode;
    const move = Clock.normalizeTime({ ...time, mode: 'move' }); const fischer = Clock.normalizeTime({ ...time, mode: 'fischer' });
    const byo = Clock.normalizeTime({ ...time, mode: 'byoyomi' });
    fillSelect($('#moveSeconds'), Clock.MOVE_SECONDS, (v) => `${v}초`, move.perMove);
    $('#fischerPreset').replaceChildren(...Clock.FISCHER_PRESETS.map((p) => new Option(Clock.fischerName(p.main, p.inc), `${p.main}+${p.inc}`)));
    $('#fischerPreset').value = `${fischer.main}+${fischer.inc}`;
    fillSelect($('#byoMain'), Clock.BYOYOMI_MAIN, (v) => (v ? `${v}분` : '없음'), byo.main);
    fillSelect($('#byoPeriod'), Clock.PERIOD_SECONDS, (v) => `${v}초`, byo.period);
    fillSelect($('#byoPeriods'), Clock.PERIOD_COUNTS, (v) => `${v}번`, byo.periods);
    updateTimeFields();
  }
  function readTime() {
    const mode = $('#timeMode').value;
    if (mode === 'move') return Clock.normalizeTime({ mode, perMove: $('#moveSeconds').value }, rules.timeModes);
    if (mode === 'fischer') {
      const [main, inc] = $('#fischerPreset').value.split('+');
      return Clock.normalizeTime({ mode, main, inc }, rules.timeModes);
    }
    if (mode === 'byoyomi') return Clock.normalizeTime({ mode, main: $('#byoMain').value, period: $('#byoPeriod').value, periods: $('#byoPeriods').value }, rules.timeModes);
    return { mode: 'none' };
  }
  function updateTimeFields() {
    const mode = $('#timeMode').value;
    $('#moveFields').classList.toggle('hidden', mode !== 'move');
    $('#fischerFields').classList.toggle('hidden', mode !== 'fischer');
    $('#byoyomiFields').classList.toggle('hidden', mode !== 'byoyomi');
    const time = readTime();
    $('#timeHelp').textContent = {
      none: '시간 걱정 없이 천천히 둬요.',
      move: `내 차례마다 ${time.perMove}초가 새로 주어져요. 그 안에 두지 못하면 져요.`,
      fischer: `각자 ${time.main}분을 갖고, 한 수를 둘 때마다 ${time.inc}초를 더 받아요. 내 시간을 다 쓰면 져요.`,
      byoyomi: `${time.main ? `처음 ${time.main}분을 다 쓰면 ` : '처음부터 '}한 수를 ${time.period}초 안에 둬야 해요. 제때 두면 다시 ${time.period}초가 되고, 넘기면 기회가 한 번씩 줄어요. ${time.periods}번을 다 쓰면 져요.`
    }[mode];
  }
  for (const id of ['#timeMode', '#moveSeconds', '#fischerPreset', '#byoMain', '#byoPeriod', '#byoPeriods']) $(id).addEventListener('change', updateTimeFields);

  // ── 게임별 규칙 칸 ──
  const ruleForms = {
    omok: {
      render(root, rule) {
        const presets = Object.entries(rules.PRESETS);
        const field = document.createElement('div'); field.className = 'field';
        const label = document.createElement('label'); label.htmlFor = 'omokPreset'; label.textContent = '오목 규칙';
        const select = document.createElement('select'); select.id = 'omokPreset';
        for (const [key, preset] of presets) select.append(new Option(preset.name, key));
        select.append(new Option('직접 정하기', 'custom'));
        select.value = rule.preset;
        const help = document.createElement('p'); help.className = 'duel-help';
        const table = document.createElement('table'); table.className = 'duel-rule-table';
        const head = table.createTHead().insertRow();
        for (const text of ['', '흑', '백']) { const th = document.createElement('th'); th.textContent = text; head.append(th); }
        const body = table.createTBody();
        for (const [key, text] of [['d33', '3-3 금지'], ['d44', '4-4 금지'], ['d34', '4-3 금지']]) {
          const row = body.insertRow(); const th = document.createElement('th'); th.textContent = text; row.append(th);
          for (const color of rules.colors) {
            const input = document.createElement('input'); input.type = 'checkbox'; input.dataset.color = color; input.dataset.key = key;
            input.setAttribute('aria-label', `${colorName(color)} ${text}`); row.insertCell().append(input);
          }
        }
        const overRow = body.insertRow(); const overTh = document.createElement('th'); overTh.textContent = '6개 이상(장목)'; overRow.append(overTh);
        for (const color of rules.colors) {
          const choice = document.createElement('select'); choice.dataset.color = color; choice.dataset.key = 'overline';
          choice.setAttribute('aria-label', `${colorName(color)} 장목`);
          for (const [value, text] of [['win', '이김'], ['none', '승리 아님'], ['ban', '금수']]) choice.append(new Option(text, value));
          overRow.insertCell().append(choice);
        }
        const fillTable = (value) => {
          for (const input of table.querySelectorAll('[data-key]')) {
            const v = value[input.dataset.color][input.dataset.key];
            if (input.type === 'checkbox') input.checked = v; else input.value = v;
          }
        };
        const update = () => {
          const current = select.value === 'custom' ? readTable() : rules.normalizeSettings({ preset: select.value });
          if (select.value !== 'custom') fillTable(current);
          for (const input of table.querySelectorAll('[data-key]')) input.disabled = select.value !== 'custom';
          help.textContent = `${rules.describeSettings(current)} · 금수 자리는 판에 ✕로 보이고 둘 수 없어요. 오목이 완성되는 수는 금수보다 승리가 먼저예요.`;
        };
        const readTable = () => {
          const value = { preset: 'custom', black: {}, white: {} };
          for (const input of table.querySelectorAll('[data-key]')) value[input.dataset.color][input.dataset.key] = input.type === 'checkbox' ? input.checked : input.value;
          return rules.normalizeSettings(value);
        };
        fillTable(rule);
        select.onchange = update; table.onchange = update;
        field.append(label, select); root.append(field, table, help); update();
        this.read = () => (select.value === 'custom' ? readTable() : rules.normalizeSettings({ preset: select.value }));
      }
    },
    baduk: {
      render(root, rule) {
        const field = document.createElement('div'); field.className = 'field';
        const label = document.createElement('label'); label.htmlFor = 'badukSize'; label.textContent = '바둑판 크기';
        const select = document.createElement('select'); select.id = 'badukSize';
        for (const size of rules.SIZES) select.append(new Option(`${size}줄${size === 19 ? ' (정식)' : size === 9 ? ' (빨리 끝나요)' : ''}`, String(size)));
        select.value = String(rule.size);
        const help = document.createElement('p'); help.className = 'duel-help'; help.textContent = `백은 나중에 두는 대신 덤 ${rules.KOMI}집을 받아요.`;
        field.append(label, select); root.append(field, help);
        this.read = () => rules.normalizeSettings({ size: select.value });
      }
    },
    chess: { render(root) { const help = document.createElement('p'); help.className = 'duel-help'; help.textContent = rules.describeSettings({}); root.append(help); }, read: () => ({}) }
  };
  const ruleForm = ruleForms[kind];

  // terms(신청한 사람 기준)를 "내 기준"으로 바꿔 창에 채운다.
  function openTerms(target) {
    termsTarget = target;
    let terms = savedTerms();
    if (target.mode === 'modify') {
      const mineIsFrom = offer.from.userId === me.userId; const { fromColor } = offer.terms;
      terms = { myColor: fromColor === 'random' || mineIsFrom ? fromColor : rules.colors.find((c) => c !== fromColor), time: offer.terms.time, rule: offer.terms.rule };
    }
    renderColorChoices(terms.myColor || 'random');
    renderTime(Clock.normalizeTime(terms.time, rules.timeModes));
    $('#ruleFields').replaceChildren(); ruleForm.render($('#ruleFields'), rules.normalizeSettings(terms.rule));
    $('#termsEyebrow').textContent = target.mode === 'send' ? `${target.toName}님에게` : '조건 바꾸기';
    $('#termsTitle').textContent = target.mode === 'send' ? '대결 신청하기' : '수정 요청하기';
    $('#termsSubmit').textContent = target.mode === 'send' ? '신청 보내기' : '수정 요청 보내기';
    if ($('#offerDialog').open) $('#offerDialog').close();
    $('#termsDialog').showModal();
  }
  function readTerms() {
    const myColor = document.querySelector('input[name="myColor"]:checked')?.value || 'random';
    return { myColor, time: readTime(), rule: ruleForm.read() };
  }
  $('#termsSubmit').onclick = async () => {
    const terms = readTerms();
    try {
      if (termsTarget.mode === 'send') await call('offer:send', { toId: termsTarget.toId, terms });
      else await call('offer:reply', { id: offer.id, action: 'modify', terms });
      localStorage.setItem(`duel:${kind}:terms`, JSON.stringify(terms));
      $('#termsDialog').close();
    } catch (error) { show(error.message, 'error'); }
  };
  for (const button of document.querySelectorAll('.music-modal-close')) button.onclick = () => {
    const dialog = button.closest('dialog'); dialog.close();
    if (dialog.id === 'termsDialog' && termsTarget?.mode === 'modify' && offer) $('#offerDialog').showModal();
  };

  // ── 신청 창 ──
  function renderOffer() {
    const mine = offer.from.userId === me.userId; const myTurn = offer.waitingFor === me.userId;
    const opponent = mine ? offer.to.nickname : offer.from.nickname;
    const { fromColor, time } = offer.terms;
    const myColor = fromColor === 'random' ? 'random' : mine ? fromColor : rules.colors.find((c) => c !== fromColor);
    $('#offerEyebrow').textContent = offer.round === 1 ? '대결 신청' : `수정 요청 ${offer.round - 1}번째`;
    $('#offerTitle').textContent = myTurn
      ? (offer.round === 1 ? `${opponent}님이 대결을 신청했어요!` : `${opponent}님이 조건을 바꿔 보냈어요!`)
      : `${opponent}님의 답을 기다리는 중…`;
    const list = $('#offerTerms'); list.replaceChildren();
    const rows = [
      ['내 색', myColor === 'random' ? '🎲 무작위 (시작할 때 정해져요)' : `${colorName(myColor)}${myColor === rules.colors[0] ? ' (먼저 둬요)' : ''}`],
      ['상대', `${opponent}${myColor === 'random' ? '' : ` · ${colorName(rules.colors.find((c) => c !== myColor))}`}`],
      ['시간', Clock.describeTime(time)],
      ['규칙', rules.describeSettings(offer.terms.rule)]
    ];
    for (const [term, value] of rows) { const dt = document.createElement('dt'); dt.textContent = term; const dd = document.createElement('dd'); dd.textContent = value; list.append(dt, dd); }
    for (const id of ['#offerAccept', '#offerModify', '#offerDecline']) $(id).classList.toggle('hidden', !myTurn);
    $('#offerCancel').classList.toggle('hidden', myTurn);
    tickOffer();
    if (!$('#offerDialog').open && !$('#termsDialog').open) $('#offerDialog').showModal();
  }
  function tickOffer() {
    if (!offer) return;
    const left = Math.max(0, Math.ceil((offerDeadline - Date.now()) / 1000));
    $('#offerTimer').textContent = `⏳ ${left}초 안에 답이 없으면 신청이 취소돼요.`;
  }
  setInterval(tickOffer, 500);
  socket.on(`${kind}:offer`, (data) => {
    const isNewForMe = data.waitingFor === me?.userId && (!offer || offer.round !== data.round);
    offer = data; offerDeadline = Date.now() + data.msLeft;
    renderOffer(); renderLobby(lobby);
    if (isNewForMe) sounds.alert();
  });
  socket.on(`${kind}:offer:closed`, (data) => {
    if (offer?.id !== data.id) return;
    offer = null;
    for (const id of ['#offerDialog', '#termsDialog']) if ($(id).open && (id === '#offerDialog' || termsTarget?.mode === 'modify')) $(id).close();
    show(data.message); renderLobby(lobby);
  });
  socket.on(`${kind}:offer:accepted`, (data) => {
    sessionStorage.setItem(`duel:${kind}:inLobby`, '1');
    location.href = `/${kind}/match?id=${encodeURIComponent(data.matchId)}`;
  });
  const reply = (action) => call('offer:reply', { id: offer.id, action }).catch((error) => show(error.message, 'error'));
  $('#offerAccept').onclick = () => reply('accept');
  $('#offerDecline').onclick = () => reply('decline');
  $('#offerCancel').onclick = () => reply('cancel');
  $('#offerModify').onclick = () => openTerms({ mode: 'modify' });
  // 신청 창은 바깥을 눌러도 닫히지 않게(실수로 놓치지 않도록) Esc만 막는다.
  $('#offerDialog').addEventListener('cancel', (event) => event.preventDefault());
})();
