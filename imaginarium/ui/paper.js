export const $ = (s) => document.querySelector(s),
  paper = $('#paper'),
  sheet = $('#sheet');
export function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
export function button(label, fn, cls = 'quiet') {
  const node = el('button', cls, label);
  node.type = 'button';
  node.onclick = async () => {
    try {
      await fn(node);
    } catch (e) {
      showError(e);
    }
  };
  return node;
}
export function row(...items) {
  const node = el('div', 'row');
  node.append(...items);
  return node;
}
export function field(label, value = '', type = 'text') {
  const root = el('label', '', label),
    input = el(type === 'area' ? 'textarea' : 'input');
  if (type !== 'area') input.type = type;
  input.value = value;
  root.append(input);
  return { root, input };
}
export function choices(label, values, selected) {
  const root = el('label', '', label),
    input = el('select');
  for (const [id, title] of values) {
    const o = el('option', '', title);
    o.value = id;
    o.selected = String(id) === String(selected);
    input.append(o);
  }
  root.append(input);
  return { root, input };
}
export function open(section, title, reader = false) {
  document.dispatchEvent(new Event('paper-change'));
  sheet.classList.toggle('text-mode', reader);
  sheet.classList.remove('night');
  $('#section').textContent = section;
  paper.replaceChildren(el('h2', '', title));
  if (!sheet.open) sheet.showModal();
  sheet.scrollTop = 0;
}
export function close() {
  if (sheet.open) sheet.close();
}
export function showError(e) {
  const message = e?.message || String(e);
  (sheet.open ? paper : $('#notice')).append(el('p', 'error', message));
}
let timer;
export function toast(msg) {
  const box = $('#notice');
  box.textContent = msg;
  clearTimeout(timer);
  timer = setTimeout(() => box.replaceChildren(), 3500);
}
$('.x').onclick = close;
sheet.addEventListener('click', (e) => {
  if (e.target === sheet) {
    const r = sheet.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
  }
});
sheet.addEventListener('close', () => document.dispatchEvent(new Event('paper-change')));
