const root = document.getElementById('brickloop-photo-preview');
const menu = root.querySelector('.menu-toggle');
const panel = root.querySelector('.menu-panel');
function closeMenu() {
  panel.classList.remove('open');
  menu.setAttribute('aria-expanded', 'false');
}
menu.addEventListener('click', () => {
  const open = !panel.classList.contains('open');
  panel.classList.toggle('open', open);
  menu.setAttribute('aria-expanded', String(open));
});
panel.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
root.addEventListener('keydown', event => {
  if (event.key === 'Escape' && panel.classList.contains('open')) {
    closeMenu();
    menu.focus();
  }
});
