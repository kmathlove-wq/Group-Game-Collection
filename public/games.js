(() => {
  let clicks = 0; let timer;
  for (const trigger of document.querySelectorAll('.songcatch-admin-trigger')) trigger.addEventListener('click', (event) => {
    event.preventDefault(); event.stopPropagation();
    clicks += 1; clearTimeout(timer); timer = setTimeout(() => { clicks = 0; }, 1800);
    if (clicks >= 5) location.href = '/admin-login';
  });
})();
