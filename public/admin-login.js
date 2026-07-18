(() => { const form = document.querySelector('#login'); const notice = document.querySelector('#notice');
  fetch('/api/admin/session').then((r) => r.json()).then((data) => { if (data.authenticated) location.replace('/admin'); if (!data.configured) MusicCommon.setNotice(notice, '서버 환경 변수 ADMIN_USERNAME과 ADMIN_PASSWORD를 설정한 뒤 서버를 다시 시작해 주세요.', 'error'); });
  form.onsubmit = async (event) => { event.preventDefault(); try { await MusicCommon.json('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: document.querySelector('#username').value, password: document.querySelector('#password').value }) }); location.replace('/admin'); } catch (error) { MusicCommon.setNotice(notice, error.message, 'error'); } };
})();
