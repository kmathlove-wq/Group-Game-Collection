(() => {
  let clicks = 0; let timer;
  document.querySelector('#brandMark').addEventListener('click', () => {
    clicks += 1; clearTimeout(timer); timer = setTimeout(() => { clicks = 0; }, 1800);
    if (clicks >= 5) location.href = '/admin-login';
  });
})();
