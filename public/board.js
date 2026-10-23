// 게임 선택 화면의 개선사항·댓글 게시판.
// 내 글 열쇠(localStorage board:ownerKey)를 늘 함께 보내서, 같은 브라우저에서는 내가 쓴 글을 고치거나 지울 수 있다.
// 숨은 관리자 신호: Ctrl 두 번 → 잠깐 쉬고 → Ctrl 두 번. 비밀번호 확인은 서버가 한다(이 파일엔 비밀번호가 없음).
(() => {
  const $ = (id) => document.getElementById(id);
  const list = $('boardList');
  const form = $('boardForm');
  const nameInput = $('boardName');
  const textInput = $('boardText');
  const message = $('boardMessage');
  const adminBar = $('boardAdminBar');
  const modal = $('boardAdminModal');
  const passwordInput = $('boardAdminPassword');
  const adminError = $('boardAdminError');

  const store = {
    get(area, key) { try { return window[area].getItem(key); } catch { return null; } },
    set(area, key, value) { try { if (value == null) window[area].removeItem(key); else window[area].setItem(key, value); } catch { /* 저장 못 해도 동작 */ } }
  };
  let adminToken = store.get('sessionStorage', 'board:adminToken');
  let posts = null; // 아직 못 불러왔으면 null
  let openReply = null; // 답글 입력칸이 열린 글 번호
  let editing = null; // 고치는 중인 글(원글·답글) 번호

  // 처음 오면 무작위 열쇠를 만들어 둔다. 저장이 안 되는 브라우저면 이번 화면에서만 쓴다.
  const ownerKey = store.get('localStorage', 'board:ownerKey') || (() => {
    const key = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
    store.set('localStorage', 'board:ownerKey', key);
    return key;
  })();

  nameInput.value = store.get('localStorage', 'board:nickname') || '';

  async function api(url, options = {}) {
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), 'X-Board-Owner': ownerKey, ...(adminToken ? { 'X-Board-Admin': adminToken } : {}) };
    const response = await fetch(url, { ...options, headers, body: options.body ? JSON.stringify(options.body) : undefined });
    const data = await response.json().catch(() => ({}));
    if (response.status === 403 && adminToken && !options.asOwner) setAdmin(null);
    if (!response.ok) throw new Error(data.error || '잠시 문제가 생겼어요. 다시 해 주세요.');
    return data;
  }

  function showMessage(text, kind = 'error') {
    message.textContent = text;
    message.className = `notice ${kind}`;
    clearTimeout(showMessage.timer);
    showMessage.timer = setTimeout(() => message.classList.add('hidden'), 4000);
  }

  function timeAgo(at) {
    const minutes = Math.floor((Date.now() - at) / 60000);
    if (minutes < 1) return '방금';
    if (minutes < 60) return `${minutes}분 전`;
    if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}시간 전`;
    return `${Math.floor(minutes / 60 / 24)}일 전`;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text; // 사용자 글은 항상 textContent로 넣는다
    return node;
  }

  function button(label, className, onClick) {
    const node = el('button', className, label);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  }

  function header(item, { pinned = false } = {}) {
    const head = el('div', 'board-item-head');
    head.append(el('b', 'board-name', item.name));
    if (item.admin) head.append(el('span', 'board-badge admin', '👑 관리자'));
    if (pinned) head.append(el('span', 'board-badge pin', '📌 고정'));
    const time = el('time', 'board-time', timeAgo(item.at));
    time.dateTime = new Date(item.at).toISOString();
    time.title = new Date(item.at).toLocaleString('ko-KR');
    head.append(time);
    if (item.edited) head.append(el('span', 'board-time', '(수정됨)'));
    if (item.expiresAt) {
      const days = Math.max(0, Math.ceil((item.expiresAt - Date.now()) / 86_400_000));
      if (days <= 7) head.append(el('span', 'board-expire', days <= 1 ? '곧 사라져요' : `${days}일 뒤 사라져요`));
    }
    return head;
  }

  async function remove(id) {
    if (!confirm('이 글을 지울까요? 지우면 되돌릴 수 없어요.')) return;
    try { render((await api(`/api/board/items/${id}`, { method: 'DELETE', asOwner: !adminToken })).posts); } catch (error) { showMessage(error.message); }
  }

  // 글 내용 자리에 고치기 칸을 띄운다.
  function editForm(item) {
    const box = el('form', 'board-reply-form');
    const text = el('textarea');
    text.maxLength = 400;
    text.rows = 3;
    text.required = true;
    text.value = item.text;
    const foot = el('div', 'board-form-foot');
    foot.append(button('취소', 'secondary', () => { editing = null; render(posts); }), el('button', 'primary', '고친 내용 저장'));
    box.append(text, foot);
    box.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const data = await api(`/api/board/items/${item.id}`, { method: 'PATCH', body: { text: text.value }, asOwner: true });
        editing = null;
        render(data.posts);
        showMessage('글을 고쳤어요!', 'success');
      } catch (error) { showMessage(error.message); }
    });
    setTimeout(() => { text.focus(); text.setSelectionRange(text.value.length, text.value.length); });
    return box;
  }

  // 글 본문: 고치는 중이면 고치기 칸, 아니면 내용.
  const body = (item) => (editing === item.id ? editForm(item) : el('p', 'board-text', item.text));

  // 내 글이면 수정 버튼, 내 글이거나 관리자면 삭제 버튼.
  function ownButtons(item) {
    const buttons = [];
    if (item.mine) buttons.push(button('✏️ 수정', 'board-link', () => { editing = editing === item.id ? null : item.id; render(posts); }));
    if (item.mine || adminToken) buttons.push(button('🗑 삭제', 'board-link danger-text', () => remove(item.id)));
    return buttons;
  }

  async function pin(id, pinned) {
    try { render((await api(`/api/board/posts/${id}/pin`, { method: 'POST', body: { pinned } })).posts); } catch (error) { showMessage(error.message); }
  }

  function replyForm(post) {
    const replyBox = el('form', 'board-reply-form');
    const replyName = el('input');
    replyName.maxLength = 20;
    replyName.placeholder = '닉네임 (안 쓰면 익명)';
    replyName.value = nameInput.value;
    replyName.hidden = Boolean(adminToken);
    const replyText = el('textarea');
    replyText.maxLength = 400;
    replyText.rows = 2;
    replyText.required = true;
    replyText.placeholder = `${post.name}님 글에 답글 쓰기`;
    const foot = el('div', 'board-form-foot');
    foot.append(button('취소', 'secondary', () => { openReply = null; render(posts); }), el('button', 'primary', '답글 올리기'));
    replyBox.append(replyName, replyText, foot);
    replyBox.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const data = await api(`/api/board/posts/${post.id}/replies`, { method: 'POST', body: { name: replyName.value, text: replyText.value } });
        rememberName(replyName.value);
        openReply = null;
        render(data.posts);
      } catch (error) { showMessage(error.message); }
    });
    setTimeout(() => replyText.focus());
    return replyBox;
  }

  function render(next) {
    posts = next;
    if (!posts) return;
    list.replaceChildren();
    if (!posts.length) { list.append(el('p', 'board-empty', '아직 글이 없어요. 첫 글을 남겨 주세요!')); return; }
    for (const post of posts) {
      const card = el('article', `board-post${post.pinned ? ' pinned' : ''}${post.admin ? ' by-admin' : ''}`);
      card.append(header(post, { pinned: post.pinned }), body(post));
      const actions = el('div', 'board-actions');
      actions.append(button(`💬 답글${post.replies.length ? ` ${post.replies.length}` : ''}`, 'board-link', () => { openReply = openReply === post.id ? null : post.id; render(posts); }));
      if (adminToken) actions.append(button(post.pinned ? '📌 고정 풀기' : '📌 맨 위에 고정', 'board-link', () => pin(post.id, !post.pinned)));
      actions.append(...ownButtons(post));
      card.append(actions);
      if (post.replies.length) {
        const replies = el('div', 'board-replies');
        for (const reply of post.replies) {
          const row = el('div', `board-reply${reply.admin ? ' by-admin' : ''}`);
          row.append(header(reply), body(reply), ...ownButtons(reply));
          replies.append(row);
        }
        card.append(replies);
      }
      if (openReply === post.id) card.append(replyForm(post));
      list.append(card);
    }
  }

  async function load() {
    try { render((await api('/api/board')).posts); } catch { list.replaceChildren(el('p', 'board-empty', '글을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.')); }
  }

  function rememberName(name) { if (!adminToken) store.set('localStorage', 'board:nickname', name.trim() || null); }

  textInput.addEventListener('input', () => { $('boardCount').textContent = `${[...textInput.value].length} / 400`; });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const data = await api('/api/board/posts', { method: 'POST', body: { name: nameInput.value, text: textInput.value } });
      rememberName(nameInput.value);
      textInput.value = '';
      $('boardCount').textContent = '0 / 400';
      render(data.posts);
      showMessage('글이 올라갔어요!', 'success');
    } catch (error) { showMessage(error.message); }
  });

  // ── 관리자 모드 ──
  function setAdmin(token) {
    adminToken = token;
    store.set('sessionStorage', 'board:adminToken', token);
    adminBar.classList.toggle('hidden', !token);
    nameInput.hidden = Boolean(token);
    textInput.placeholder = token ? '👑 관리자 이름으로 글을 써요' : '내용을 적어 주세요 (400자까지)';
    render(posts);
  }

  function openAdminModal() {
    if (adminToken) return;
    adminError.classList.add('hidden');
    passwordInput.value = '';
    modal.classList.remove('hidden');
    passwordInput.focus();
  }
  const closeAdminModal = () => modal.classList.add('hidden');

  $('boardAdminCancel').addEventListener('click', closeAdminModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeAdminModal(); });
  $('boardAdminForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const { token } = await api('/api/board/admin/login', { method: 'POST', body: { password: passwordInput.value } });
      closeAdminModal();
      setAdmin(token);
      showMessage('👑 관리자 모드가 열렸어요.', 'success');
    } catch (error) {
      adminError.textContent = error.message;
      adminError.classList.remove('hidden');
      passwordInput.select();
    }
  });
  $('boardAdminExit').addEventListener('click', () => {
    api('/api/board/admin/logout', { method: 'POST' }).catch(() => {});
    setAdmin(null);
  });

  // 숨은 신호: Ctrl 두 번(빠르게) → 잠깐 쉬기 → Ctrl 두 번(빠르게)
  const QUICK_MS = 400; // 두 번 누르기 사이의 최대 간격
  const PAUSE_MIN_MS = 250; // 가운데 "잠깐 쉬기"의 최소·최대 길이
  const PAUSE_MAX_MS = 1500;
  let taps = [];
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Control') { taps = []; return; }
    if (event.repeat) return;
    taps = [...taps, performance.now()].slice(-4);
    if (taps.length < 4) return;
    const [a, b, c, d] = taps;
    if (b - a <= QUICK_MS && d - c <= QUICK_MS && c - b >= PAUSE_MIN_MS && c - b <= PAUSE_MAX_MS && c - b > Math.max(b - a, d - c)) {
      taps = [];
      openAdminModal();
    }
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeAdminModal(); });

  if (adminToken) {
    api('/api/board/admin/check').then(({ admin }) => setAdmin(admin ? adminToken : null)).catch(() => setAdmin(null));
  }
  load();
})();
