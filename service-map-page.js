(function () {
  'use strict';

  const root = document.documentElement;
  const button = document.getElementById('standalone-theme-toggle');
  let theme = 'light';
  try { theme = localStorage.getItem('goodday:theme') === 'dark' ? 'dark' : 'light'; } catch (_) {}
  root.dataset.theme = theme;

  if (button) button.addEventListener('click', function () {
    theme = theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = theme;
    try { localStorage.setItem('goodday:theme', theme); } catch (_) {}
  });
})();
