// 🔑 잠긴 닉네임: 이름 칸에 '관리자'·'개발자' 같은 이름을 쓰면 비밀번호 창을 띄운다(모든 게임 화면에 들어감).
// 진짜 검사는 서버(lib/name-lock.js)가 한다. 이 파일엔 비밀번호가 없고, 맞으면 서버가 30일짜리 쿠키를 준다.
// 소켓은 연결할 때 받은 쿠키만 알기 때문에, 비밀번호가 맞으면 쓰던 이름을 기억해 두고 화면을 새로고침한다.
(() => {
  // lib/name-lock.js의 LOCKED와 같은 목록
  const LOCKED = /관리자|운영자|운영진|개발자|제작자|admin|developer/;
  const RESTORE_KEY = 'name-lock:restore';
  const isLocked = (name) => LOCKED.test(String(name || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''));
  // 이름 칸: 닉네임 칸(autocomplete=nickname, id=nickname)과 순위·게임 이름 칸(id에 Name이 들어감)
  const isNameInput = (el) => el instanceof HTMLInputElement && !['password', 'radio', 'checkbox', 'number', 'hidden'].includes(el.type)
    && (el.autocomplete === 'nickname' || /nick|name/i.test(el.id));

  let unlocked = null; // 아직 모르면 null
  const status = () => (unlocked != null ? Promise.resolve(unlocked)
    : fetch('/api/name-lock/status').then((r) => r.json()).then((d) => (unlocked = !!d.unlocked)).catch(() => false));

  let box = null;
  let target = null;
  let asked = ''; // 같은 이름으로 창을 다시 띄우지 않게
  function build() {
    box = document.createElement('div');
    box.setAttribute('role', 'dialog');
    box.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:none;align-items:center;justify-content:center;background:rgba(20,18,40,.55);padding:16px;font-family:inherit';
    const card = document.createElement('form');
    card.style.cssText = 'background:#fff;color:#222;border-radius:18px;padding:20px;width:min(340px,100%);box-shadow:0 20px 60px rgba(0,0,0,.35);display:grid;gap:10px';
    const title = document.createElement('b');
    title.textContent = '🔑 비밀번호가 필요한 닉네임이에요';
    title.style.fontSize = '1.05rem';
    const desc = document.createElement('p');
    desc.style.cssText = 'margin:0;font-size:.9rem;color:#555';
    desc.textContent = "'관리자'·'개발자' 같은 이름은 비밀번호를 아는 사람만 쓸 수 있어요.";
    const input = document.createElement('input');
    input.type = 'password';
    input.autocomplete = 'off';
    input.maxLength = 100;
    input.setAttribute('aria-label', '닉네임 비밀번호');
    input.style.cssText = 'font:inherit;padding:10px 12px;border:1.5px solid #ccc;border-radius:12px';
    const error = document.createElement('p');
    error.style.cssText = 'margin:0;color:#d33;font-size:.85rem;display:none';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = '다른 이름 쓰기';
    const ok = document.createElement('button');
    ok.type = 'submit';
    ok.textContent = '확인';
    [cancel, ok].forEach((b, i) => { b.style.cssText = `font:inherit;padding:9px 14px;border:0;border-radius:12px;cursor:pointer;${i ? 'background:#6c4ff6;color:#fff;font-weight:700' : 'background:#eee;color:#333'}`; });
    row.append(cancel, ok);
    card.append(title, desc, input, error, row);
    box.append(card);
    document.body.append(box);

    cancel.addEventListener('click', () => {
      box.style.display = 'none';
      if (target) { target.value = ''; target.dispatchEvent(new Event('input', { bubbles: true })); target.focus(); }
    });
    let busy = false;
    card.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy) return;
      busy = true;
      ok.disabled = true;
      ok.textContent = '확인하는 중…';
      error.style.display = 'none';
      try {
        const r = await fetch('/api/name-lock/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: input.value }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || '잠시 문제가 생겼어요. 다시 해 주세요.');
        unlocked = true;
        box.style.display = 'none';
        // 소켓을 쓰는 화면이면 새 쿠키로 다시 연결하도록 새로고침하고, 쓰던 이름은 되살린다.
        if (window.io) {
          try { sessionStorage.setItem(RESTORE_KEY, JSON.stringify({ id: target && target.id, value: target && target.value })); } catch { /* 못 하면 이름만 다시 쓰면 됨 */ }
          location.reload();
        }
      } catch (e) {
        error.textContent = e.message;
        error.style.display = 'block';
        input.select();
      } finally {
        busy = false;
        ok.disabled = false;
        ok.textContent = '확인';
      }
    });
    box.input = input;
    box.error = error;
  }

  function ask(el) {
    if (asked === el.value) return;
    asked = el.value;
    status().then((ok) => {
      if (ok || !isLocked(el.value)) return;
      if (!box) build();
      target = el;
      box.input.value = '';
      box.error.style.display = 'none';
      box.style.display = 'flex';
      box.input.focus();
    });
  }

  let timer = 0;
  document.addEventListener('input', (event) => {
    const el = event.target;
    if (!isNameInput(el)) return;
    clearTimeout(timer);
    if (!isLocked(el.value)) { asked = ''; return; }
    timer = setTimeout(() => ask(el), 700); // 다 쓸 때까지 조금 기다린다
  }, true);
  document.addEventListener('change', (event) => { if (isNameInput(event.target) && isLocked(event.target.value)) ask(event.target); }, true);

  // 새로고침 전에 쓰던 이름 되살리기
  try {
    const saved = JSON.parse(sessionStorage.getItem(RESTORE_KEY) || 'null');
    sessionStorage.removeItem(RESTORE_KEY);
    if (saved && saved.id) {
      const restore = () => {
        const el = document.getElementById(saved.id);
        if (!el) return;
        el.value = saved.value || '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(restore, 0));
      else setTimeout(restore, 0);
    }
  } catch { /* 저장소를 못 쓰는 브라우저 */ }
})();
