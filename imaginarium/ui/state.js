import { initial, uid } from './data.js';
const native = window.axiko && typeof window.axiko.call === 'function';
const main = 'modules/imaginarium/main.js';
const key = 'imaginarium-library-v1';
let revision = 0,
  tail = Promise.resolve(),
  conflict = null,
  uncertain = null,
  pendingBatch = null,
  lastError = '';
let report = () => {};
export let state;
export function errors(fn) {
  report = fn;
}
export function rememberLayout() {
  state.previousLayout = JSON.parse(
    JSON.stringify({
      objects: state.objects,
      held: state.held,
      books: state.books.map(({ id, place, position }) => ({ id, place, position }))
    })
  );
}
export function undoLayout() {
  const past = state.previousLayout;
  if (!past) return false;
  state.objects = past.objects;
  state.held = past.held;
  for (const entry of past.books) {
    const book = state.books.find((b) => b.id === entry.id);
    if (book) {
      book.place = entry.place;
      book.position = entry.position;
    }
  }
  state.previousLayout = null;
  return true;
}
function snapshot() {
  if (native) return window.axiko.call(main, 'load');
  return JSON.parse(localStorage.getItem(key) || 'null');
}
export async function load() {
  const data = await snapshot();
  revision = data?.revision || 0;
  state = data?.state || initial();
  return state;
}
function clash() {
  conflict = Error(
    'Библиотека изменилась на другом экране. Обновите страницу, чтобы открыть сохранённую редакцию.'
  );
  conflict.name = 'LibraryConflict';
  throw conflict;
}
async function reconcile() {
  if (!uncertain) return;
  const remote = await snapshot(),
    remoteRev = remote?.revision || 0;
  if (remoteRev === uncertain.base + 1 && remote?.state?.saveId === uncertain.id) revision = remoteRev;
  else if (remoteRev !== uncertain.base) clash();
  uncertain = null;
}
async function persist() {
  if (conflict) throw conflict;
  await reconcile();
  const id = uid(),
    copy = JSON.parse(JSON.stringify(state));
  copy.saveId = id;
  const base = revision;
  if (!native) {
    const commit = () => {
      if ((snapshot()?.revision || 0) !== base) clash();
      localStorage.setItem(key, JSON.stringify({ state: copy, revision: base + 1 }));
      revision = base + 1;
    };
    if (navigator.locks) await navigator.locks.request(key, commit);
    else commit();
  } else {
    try {
      revision = await window.axiko.call(main, 'save', base, copy);
    } catch (error) {
      uncertain = { base, id };
      await reconcile();
      if (revision === base) throw error;
    }
  }
  lastError = '';
}
export function save(required = false) {
  if (!pendingBatch) {
    const run = tail.then(() => {
      pendingBatch = null;
      return persist();
    });
    pendingBatch = run;
    tail = run.catch((e) => {
      const message = e.message || String(e);
      if (message !== lastError) {
        lastError = message;
        report(e);
      }
    });
  }
  const writes = pendingBatch;
  return required
    ? writes
    : writes.then(
        () => true,
        () => false
      );
}
export function request(task, input, order = uid()) {
  if (!native)
    return Promise.reject(
      Error('Откройте библиотеку в Axiko и назначьте модель в настройках. Коллекция доступна для чтения.')
    );
  return window.axiko.call(main, 'generate', order, task, input);
}
export async function result(order) {
  return native ? window.axiko.call(main, 'result', order) : null;
}
export function errorText(e) {
  const message = String(e?.message || e);
  return message.length > 350 ? message.slice(0, 350) : message;
}
