window.MusicCommon = {
  userId() {
    let id = localStorage.getItem('music:userId');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('music:userId', id); }
    return id;
  },
  nickname() { return localStorage.getItem('music:nickname') || ''; },
  saveNickname(value) { localStorage.setItem('music:nickname', value.trim()); },
  async json(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || '요청을 처리하지 못했습니다.');
    return data;
  },
  setNotice(element, message, type = '') { element.textContent = message; element.className = `notice ${type}`; element.classList.toggle('hidden', !message); }
};
