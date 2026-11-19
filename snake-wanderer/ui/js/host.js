// Связь с приложением Assi. Игра умеет жить в трёх местах:
//  — в Игротеке Assi: страница открыта во вложенном кадре, сохранения, ачивки и меню даёт движок
//    Игротеки (window.parent.__hub);
//  — отдельным модулем Assi: сохранение через main.js модуля;
//  — в обычном браузере: всё на localStorage.
const P = (() => { try { return window.parent !== window ? window.parent : null; } catch (e) { return null; } })();
const hub = (P && P.__hub) || null;
const A = window.axiko || (P && P.axiko) || null;
const KEY = 'snake-wanderer.save';
const match = location.pathname.match(/(modules\/[^/]+)\//);
export const MODULE = match ? match[1] : 'modules/snake-wanderer';
export const hasHub = !!hub;
export const inAssi = !hub && !!(A && A.call);

export async function loadSave() {
  if (hub) {
    // Осколки и лунные чешуйки движок Игротеки может менять сам (ставка на день, сундук за поездку).
    const m = hub.state.meta, s = m.save || {};
    s.shards = m.shards; s.moons = m.moons;
    return s;
  }
  if (inAssi) {
    try { const r = await A.call(MODULE + '/main.js', 'load'); if (r && r.save) return r.save; } catch (e) { console.warn('load', e); }
  }
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
}

let pending = null, timer = 0;
/** Сохранение с задержкой: частые изменения склеиваются в одну запись. */
export function storeSave(save, now = false) {
  if (hub) {
    if (hub.readonly) return;
    hub.act((st) => { st.meta.save = save; st.meta.shards = save.shards; st.meta.moons = save.moons; }, now ? { now: true, reason: 'забег' } : undefined);
    return;
  }
  pending = save;
  clearTimeout(timer);
  if (now) flush(); else timer = setTimeout(flush, 600);
}
function flush() {
  if (!pending) return;
  const s = pending; pending = null;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* хранилище недоступно */ }
  if (inAssi) A.call(MODULE + '/main.js', 'save', { save: s }).catch((e) => console.warn('save', e));
}
addEventListener('pagehide', flush);

/** Достижение уходит и в Игротеку: там оно попадёт в общий список и в «Ачивки за жизнь». */
export function achieve(id) { try { if (hub && !hub.readonly) hub.achieve(id); } catch (e) { console.warn('achieve', e); } }
/** Меню Игротеки: сохранения, настройки, «Как играть». */
export function hubMenu() { try { if (hub) hub.ui.menu(); } catch (e) { console.warn('menu', e); } }
/** Игротека изменила валюты (ставка сыграла, пришёл сундук) — сообщить игре. */
export function watchHub(fn) {
  if (!hub) return;
  const f = () => fn(hub.state.meta);
  try { hub.on('inbox', f); hub.on('chest', f); } catch (e) { console.warn('watch', e); }
}

/** Игре нужен весь экран: убрать кнопку чата и меню приложения. */
export function stage(on) { try { if (A && A.stage) A.stage(on); } catch (e) { /* не в приложении */ } }
export function back() { if (A && A.back) A.back(); else if (history.length > 1) history.back(); }
export const canExit = !!(A && A.back);
export function vibrate(ms) {
  // Браузер разрешает вибрацию только после касания страницы.
  const touched = !navigator.userActivation || navigator.userActivation.hasBeenActive;
  try { if (navigator.vibrate && touched) navigator.vibrate(ms); } catch (e) { /* нет вибрации */ }
}
