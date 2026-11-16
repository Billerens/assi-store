// The health screen: «Сегодня», «Неделя», «Привычки», «Настройки». Everything comes from
// modules/health/main.js in one call (view) and every change goes back through it.
const h = ui.h;
const MAIN = 'modules/health/main.js';
const call = (fn, ...args) => assi.call(MAIN, fn, ...args);
const NB = ' ';
const DAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const PAUSES = [['sick', 'Болею'], ['vacation', 'В отпуске'], ['rest', 'Перерыв']];
const FROM = { manual: 'вручную', hc: 'Health Connect', screen: 'по экрану' };
const STATES = { taken: 'принято', late: 'с опозданием', skipped: 'пропущено', missed: 'пропущено' };

let V = null;
let schema = null;
let calendarHabit = 'all';

// Every icon comes from kit.js (`pill`, `steps` and `smile` were added there for this module).
function glyph(name) {
  return ui.icon(name);
}

// ---- words and numbers ------------------------------------------------------------------------

function num(n) {
  const digits = String(Math.abs(Math.round(Number(n) || 0)));
  return (n < 0 ? '-' : '') + digits.replace(/\B(?=(\d{3})+(?!\d))/g, NB);
}

function dur(m) {
  if (m === null || m === undefined || isNaN(m)) return '—';
  m = Math.max(0, Math.round(m));
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  if (!hours) return rest + NB + 'мин';
  return rest ? hours + NB + 'ч ' + rest + NB + 'мин' : hours + NB + 'ч';
}

function liters(ml) {
  return ((Number(ml) || 0) / 1000).toFixed(1).replace('.', ',');
}

function dateLong(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  return m ? Number(m[3]) + ' ' + MONTHS[Number(m[2]) - 1] : String(date || '');
}

function weekdayOf(date) {
  const d = new Date(date + 'T12:00:00');
  return (d.getDay() + 6) % 7;
}

function addDays(date, n) {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function clock(ms) {
  const d = new Date(ms);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function fail(error) {
  ui.toast(String((error && error.message) || error || 'Не получилось'));
}

/** Runs a change, shows what went wrong, redraws. */
async function act(fn, quiet) {
  try {
    const out = await fn();
    if (!quiet) await load();
    return out;
  } catch (error) {
    fail(error);
    return null;
  }
}

function card(icon, title, extra, ...body) {
  return h('section', { class: 'card hc' },
    h('div', { class: 'hc-head' },
      icon && h('span', { class: 'mark' }, glyph(icon)),
      h('h3', {}, title),
      extra || null),
    ...body);
}

function bar(value, goal) {
  const share = goal > 0 ? Math.min(1, Math.max(0, value / goal)) : 0;
  return h('div', { class: 'bar' + (share >= 1 ? ' done' : ''), role: 'progressbar', 'aria-valuenow': Math.round(share * 100) },
    h('i', { style: 'width: ' + Math.round(share * 100) + '%' }));
}

function iconBtn(icon, label, onclick) {
  return h('button', { class: 'icon-btn', 'aria-label': label, title: label, onclick }, glyph(icon));
}

function empty(text, ...actions) {
  return h('div', { class: 'section' }, h('p', { class: 'hint' }, text), actions.length ? h('div', { class: 'row' }, ...actions) : null);
}

// ---- «Сегодня» ----------------------------------------------------------------------------------

function sleepCard(d) {
  const fix = h('button', { class: 'btn small soft', onclick: () => sleepSheet(d) }, 'Поправить');
  if (!d.known.sleep) {
    return card('moon', 'Сон', fix, empty('Сон этой ночи пока не найден. Его видно по выключенному экрану (нужен доступ к статистике или день работы модуля), ' +
      'по Health Connect — или впишите сами.'));
  }
  const share = d.sleepGoal ? d.sleepMin / d.sleepGoal : 0;
  return card('moon', 'Сон', fix,
    h('div', { class: 'big' }, dur(d.sleepMin), h('span', { class: 'of' }, ' / ' + dur(d.sleepGoal))),
    bar(d.sleepMin, d.sleepGoal),
    h('div', { class: 'sub' }, 'Отбой ' + d.bedtime + ' · подъём ' + d.wake + ' · ' + (FROM[d.sleepFrom] || d.sleepFrom) +
      (d.sleepQuality !== null ? ' · качество ' + Math.round(d.sleepQuality) + '%' : '') +
      (d.sleepFrom === 'screen' && d.sleepConfidence !== null && d.sleepConfidence < 0.6 ? ' · неточно' : '')),
    share < 1 && V.settings.bedtime ? h('div', { class: 'sub' }, 'Целевой отбой — ' + V.settings.bedtime) : null);
}

function sleepSheet(d) {
  const night = h('input', { class: 'input', type: 'date', value: todayCalendar(), max: todayCalendar() });
  const bed = h('input', { class: 'input', type: 'time', value: d.known.sleep ? d.bedtime : '00:00' });
  const wake = h('input', { class: 'input', type: 'time', value: d.known.sleep ? d.wake : '08:00' });
  let close = null;
  close = ui.sheet([
    h('h3', {}, 'Поправить сон'),
    h('p', { class: 'hint' }, 'Ночь записывается за то утро, когда вы проснулись. Правка вручную главнее экрана и Health Connect.'),
    h('label', { class: 'field' }, h('span', {}, 'Утро'), night),
    h('div', { class: 'two' },
      h('label', { class: 'field' }, h('span', {}, 'Лёг'), bed),
      h('label', { class: 'field' }, h('span', {}, 'Встал'), wake)),
    h('div', { class: 'actions' },
      d.sleepFrom === 'manual' ? h('button', { class: 'btn', onclick: () => act(async () => {
        await call('clearManualSleep', night.value);
        close();
      }) }, 'Убрать правку') : h('button', { class: 'btn', onclick: () => close() }, 'Отмена'),
      h('button', { class: 'btn primary', onclick: () => act(async () => {
        const out = await call('setSleep', { night: night.value, bed: bed.value, wake: wake.value });
        close();
        ui.toast('Сон: ' + dur(out.minutes));
      }) }, 'Сохранить'))
  ]);
}

function todayCalendar() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function stepsCard(d) {
  if (!d.known.steps) {
    const st = V.status;
    const why = st.sensor && !st.sensor.present ? 'На телефоне нет датчика шагов. ' : '';
    return card('steps', 'Шаги', null, empty(why + 'Шагов пока нет: нужен доступ к физической активности (датчик телефона) или Health Connect. ' +
      'Первые цифры появятся после следующего сбора.',
      st.sensor && st.sensor.present && !st.sensor.granted ? h('button', { class: 'btn small primary', onclick: () => grant('steps') }, 'Разрешить датчик') : null,
      st.hc && st.hc.available && !st.hc.steps ? h('button', { class: 'btn small soft', onclick: () => grant('hc') }, 'Health Connect') : null));
  }
  const hours = V.stepHours || [];
  const max = Math.max(1, ...hours);
  return card('steps', 'Шаги', null,
    h('div', { class: 'big' }, num(d.steps), h('span', { class: 'of' }, ' / ' + num(d.stepsGoal))),
    bar(d.steps, d.stepsGoal),
    h('div', { class: 'sub' }, d.distanceKm + NB + 'км' + (d.stepsFrom ? ' · ' + (d.stepsFrom === 'hc' ? 'Health Connect' : 'датчик телефона') : '') +
      (d.workoutMin ? ' · тренировки ' + d.workoutMin + NB + 'мин' : '')),
    hours.length ? h('div', { class: 'hours', 'aria-label': 'Шаги по часам' },
      hours.map((n, i) => h('i', { class: n ? '' : 'zero', title: i + ':00 — ' + n, style: 'height: ' + Math.max(4, Math.round(n / max * 100)) + '%' }))) : null,
    hours.length ? h('div', { class: 'hours-axis' }, h('span', {}, '0'), h('span', {}, '6'), h('span', {}, '12'), h('span', {}, '18'), h('span', {}, '23')) : null,
    h('button', { class: 'btn small soft', onclick: workoutSheet }, 'Записать тренировку'));
}

function workoutSheet() {
  const minutes = h('input', { class: 'input', type: 'number', inputMode: 'numeric', min: 1, max: 600, value: 30 });
  const type = h('input', { class: 'input', placeholder: 'бег, зал, йога…' });
  let close = null;
  close = ui.sheet([
    h('h3', {}, 'Тренировка'),
    h('div', { class: 'two' },
      h('label', { class: 'field' }, h('span', {}, 'Минут'), minutes),
      h('label', { class: 'field' }, h('span', {}, 'Что'), type)),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: () => close() }, 'Отмена'),
      h('button', { class: 'btn primary', onclick: () => act(async () => {
        await call('addWorkout', { minutes: Number(minutes.value), type: type.value.trim() || 'тренировка' });
        close();
      }) }, 'Записать'))
  ]);
}

function waterCard(d) {
  const glass = V.settings.glassMl;
  const goalGlasses = Math.max(1, Math.round(d.waterGoal / glass));
  const have = Math.floor(d.waterMl / glass);
  const cups = [];
  for (let i = 0; i < Math.max(goalGlasses, have); i++) cups.push(h('i', { class: i < have ? 'full' : '' }));
  return card('drop', 'Вода', null,
    h('div', { class: 'big' }, liters(d.waterMl), h('span', { class: 'of' }, ' / ' + liters(d.waterGoal) + NB + 'л')),
    h('div', { class: 'water' },
      h('button', { class: 'round', 'aria-label': 'Убрать последний стакан', onclick: () => act(() => call('undoWater')) }, ui.icon('undo')),
      h('div', { class: 'glasses', 'aria-hidden': 'true' }, cups),
      h('button', { class: 'round primary', 'aria-label': 'Плюс стакан', onclick: () => act(async () => {
        await call('addWater');
        ui.toast('+' + glass + NB + 'мл');
      }) }, ui.icon('plus'))),
    h('div', { class: 'sub' }, 'Стакан — ' + glass + NB + 'мл'));
}

function medsCard() {
  const doses = V.doses || [];
  if (!doses.length && !V.meds.length) return null;
  const body = doses.length ? h('div', {}, doses.map(dose => {
    const right = dose.status ?
      [h('span', { class: 'state ' + dose.status }, STATES[dose.status] || dose.status),
        iconBtn('undo', 'Отменить отметку', () => act(() => call('medUndo', dose.medId, dose.due)))] :
      [iconBtn('close', 'Пропустить', () => act(() => call('medTaken', dose.medId, dose.due, 'skipped'))),
        h('button', { class: 'round primary', 'aria-label': 'Принял', onclick: () => act(() => call('medTaken', dose.medId, dose.due, 'taken')) }, ui.icon('check'))];
    return h('div', { class: 'dose' },
      h('span', { class: 'time' }, dose.time),
      h('div', { class: 'what' }, h('div', { 'data-raw': '' }, dose.name), dose.dose ? h('div', { class: 'small', 'data-raw': '' }, dose.dose) : null),
      h('div', { class: 'acts' }, right));
  })) : empty('Сегодня приёмов нет.');
  return card('pill', 'Лекарства', null, body);
}

function habitsCard(d) {
  const live = V.habits;
  if (!live.length) {
    return card('check', 'Привычки', null, empty('Привычек пока нет.', h('button', { class: 'btn small primary', onclick: () => habitSheet(null) }, 'Добавить')));
  }
  const today = live.filter(x => x.due || x.done);
  const other = live.filter(x => !x.due && !x.done);
  const chip = habit => h('button', {
    class: 'chip' + (habit.done ? ' on' : ''),
    'aria-pressed': habit.done ? 'true' : 'false',
    onclick: () => act(async () => {
      if (habit.done) await call('unmarkHabit', habit.id);
      else {
        const out = await call('markHabit', habit.id);
        ui.toast('«' + out.title + '» — ' + out.chain + ' дн. подряд');
      }
    })
  }, ui.icon(habit.icon || 'check'), h('span', { 'data-raw': '' }, habit.title), h('span', { class: 'count' }, String(habit.chain)));
  return card('check', 'Привычки', null,
    today.length ? h('div', { class: 'chips' }, today.map(chip)) : h('p', { class: 'hint' }, 'На сегодня отметок по расписанию нет.'),
    other.length ? h('div', { class: 'sub' }, 'Не по расписанию сегодня, но можно отметить:') : null,
    other.length ? h('div', { class: 'chips' }, other.map(chip)) : null,
    d.paused ? h('div', { class: 'sub' }, 'Пауза: цепочки заморожены, пропуски не считаются.') : null);
}

function screenCard(d) {
  if (!d.known.screen) {
    return card('phone', 'Экран', null, empty('Экранного времени пока нет. Нужен доступ к статистике использования — или модуль сам начнёт вести журнал экрана, ' +
      'и через сутки цифры появятся.', V.status.usage && !V.status.usage.granted ? h('button', { class: 'btn small primary', onclick: () => grant('usage') }, 'Дать доступ') : null));
  }
  const sc = V.screen || {};
  return card('phone', 'Экран', null,
    h('div', { class: 'facts' },
      h('div', { class: 'fact' }, h('b', {}, dur(d.screenMin)), h('span', {}, 'всего')),
      h('div', { class: 'fact' }, h('b', {}, String(d.unlocks)), h('span', {}, 'разблокировок')),
      d.socialMin !== null ? h('div', { class: 'fact' }, h('b', {}, dur(d.socialMin)), h('span', {}, 'соцсети')) : null,
      h('div', { class: 'fact' }, h('b', {}, dur(d.lateMin)), h('span', {}, 'в ночном окне'))),
    sc.first ? h('div', { class: 'sub' }, 'Первый раз ' + sc.first + ' · последний ' + sc.last + (sc.from === 'log' ? ' · по журналу модуля (без приложений)' : '')) : null,
    sc.apps && sc.apps.length ? h('div', { class: 'apps' }, sc.apps.map(app => h('div', {}, h('span', { 'data-raw': '' }, app.name), h('span', {}, dur(app.minutes))))) : null);
}

/** Focus minutes of the day (records `focus` of the «Фокус» module): only when the module is there or there is data. */
function focusCard(d) {
  if (!V.focus && !(d.focusMin > 0)) return null;
  return card('clock', 'Фокус', null,
    d.focusMin > 0 ?
      h('div', { class: 'facts' }, h('div', { class: 'fact' }, h('b', {}, dur(d.focusMin)), h('span', {}, 'в фокусе сегодня'))) :
      empty('Сегодня фокус-сессий ещё не было.'));
}

function placesCard(d) {
  if (!V.settings.placesOn && !V.visits.length) return null;
  const list = V.visits;
  return card('pin', 'Места', null,
    list.length ? h('div', {}, list.map(v => h('div', { class: 'line-row' },
      h('div', { class: 'grow' }, h('div', { 'data-raw': '' }, v.title), h('div', { class: 'small' },
        clock(v.start) + ' · ' + dur(v.minutes) + (v.type === 'home' ? ' · дом' : v.type === 'work' ? ' · работа' : '') + (v.firstTime ? ' · впервые' : '')))))) :
      empty(d.known.places ? 'Сегодня визитов не было.' : 'Сегодня точек ещё нет.'),
    d.farthestKm !== null ? h('div', { class: 'sub' }, 'Дальше всего от дома: ' + String(d.farthestKm).replace('.', ',') + NB + 'км') : null);
}

function moodCard(d) {
  if (!V.settings.moodOn) return null;
  return card('smile', 'Самочувствие', null,
    h('div', { class: 'moods' }, [1, 2, 3, 4, 5].map(n => h('button', {
      class: d.mood === n ? 'on' : '', 'aria-label': 'Самочувствие ' + n + ' из 5',
      onclick: () => act(() => call('setMood', n))
    }, String(n)))),
    h('div', { class: 'moods-legend' }, h('span', {}, 'плохо'), h('span', {}, 'отлично')));
}

// ---- charts -------------------------------------------------------------------------------------

const SVG = 'http://www.w3.org/2000/svg';

function svg(tag, attrs, ...children) {
  const node = document.createElementNS(SVG, tag);
  Object.keys(attrs || {}).forEach(key => node.setAttribute(key, attrs[key]));
  children.forEach(child => {
    if (child === null || child === undefined) return;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  });
  return node;
}

/** Bars of 14 days with a dashed goal line. */
function barsChart(days, value, goal, low) {
  const W = 336;
  const H = 150;
  const top = 10;
  const bottom = 22;
  const n = days.length;
  const step = W / n;
  const values = days.map(value);
  const max = Math.max(goal * 1.25, ...values.filter(v => v !== null));
  const y = v => top + (H - top - bottom) * (1 - v / max);
  const root = svg('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
  days.forEach((d, i) => {
    const v = values[i];
    const x = i * step + step * 0.18;
    const w = step * 0.64;
    const cls = v === null ? (d.paused ? 'b paused' : 'b none') : (low(v) ? 'b low' : 'b');
    const yy = v === null ? H - bottom - 4 : y(v);
    const rect = svg('rect', { class: cls, x: x.toFixed(1), y: yy.toFixed(1), width: w.toFixed(1), height: Math.max(2, H - bottom - yy).toFixed(1), rx: 3 });
    rect.appendChild(svg('title', {}, d.date + ': ' + (v === null ? 'нет данных' : String(v))));
    root.appendChild(rect);
    root.appendChild(svg('text', { x: (i * step + step / 2).toFixed(1), y: H - 6, 'text-anchor': 'middle' }, DAYS[weekdayOf(d.date)]));
  });
  root.appendChild(svg('line', { class: 'goal', x1: 0, x2: W, y1: y(goal).toFixed(1), y2: y(goal).toFixed(1) }));
  return root;
}

function sleepChart() {
  const goal = V.settings.sleepGoal;
  return card('moon', 'Сон за 14 ночей', null,
    barsChart(V.days, d => d.known.sleep ? d.sleepMin : null, goal, v => v < goal - V.settings.badSleepBelow),
    h('div', { class: 'legend' }, h('span', {}, h('i'), 'сон'), h('span', {}, h('i', { class: 'goal' }), 'цель ' + dur(goal))));
}

function stepsChart() {
  const goal = V.settings.stepsGoal;
  return card('steps', 'Шаги за 14 дней', null,
    barsChart(V.days, d => d.known.steps ? d.steps : null, goal, v => v < goal / 2),
    h('div', { class: 'legend' }, h('span', {}, h('i'), 'шаги'), h('span', {}, h('i', { class: 'goal' }), 'цель ' + num(goal))));
}

/** Weeks as columns, Monday on top: filled — marked, hatched — pause. */
function calendarChart() {
  const cal = V.calendar;
  if (!V.habits.length) return null;
  const weeks = cal.weeks;
  const size = 15;
  const gap = 4;
  const left = 22;
  const W = left + weeks * (size + gap);
  const H = 7 * (size + gap);
  const root = svg('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', style: 'max-width: ' + (W * 1.6) + 'px' });
  const defs = svg('defs', {}, svg('pattern', { id: 'hatch', class: 'hatch', width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
    svg('line', { x1: 0, y1: 0, x2: 0, y2: 5 })));
  root.appendChild(defs);
  [0, 2, 4, 6].forEach(i => root.appendChild(svg('text', { x: 0, y: i * (size + gap) + size - 3 }, DAYS[i])));
  const total = V.habits.length;
  for (let w = 0; w < weeks; w++) {
    for (let i = 0; i < 7; i++) {
      const date = addDays(cal.from, w * 7 + i);
      if (date > cal.to) continue;
      const done = cal.done[date] || [];
      const paused = cal.paused[date];
      const share = calendarHabit === 'all' ? done.filter(id => V.habits.some(x => x.id === id)).length / total : (done.indexOf(calendarHabit) >= 0 ? 1 : 0);
      const x = left + w * (size + gap);
      const y = i * (size + gap);
      const cell = svg('rect', { class: 'cell' + (share > 0 ? ' on' : ''), x, y, width: size, height: size, rx: 3 });
      if (share > 0 && share < 1) cell.setAttribute('fill-opacity', (0.35 + share * 0.65).toFixed(2));
      cell.appendChild(svg('title', {}, dateLong(date) + (paused ? ' — пауза' : '') + (done.length ? ' — отмечено: ' + done.length : '')));
      root.appendChild(cell);
      if (paused && share === 0) root.appendChild(svg('rect', { x, y, width: size, height: size, rx: 3, fill: 'url(#hatch)' }));
      if (date === cal.to) root.appendChild(svg('rect', { class: 'today-mark', x: x - 1, y: y - 1, width: size + 2, height: size + 2, rx: 4 }));
    }
  }
  const pick = h('div', { class: 'chips' },
    h('button', { class: 'chip' + (calendarHabit === 'all' ? ' on' : ''), onclick: () => { calendarHabit = 'all'; drawToday(); } }, 'Все'),
    V.habits.map(x => h('button', { class: 'chip' + (calendarHabit === x.id ? ' on' : ''), onclick: () => { calendarHabit = x.id; drawToday(); } },
      h('span', { 'data-raw': '' }, x.title))));
  return card('calendar', 'Календарь привычек', null, pick, root,
    h('div', { class: 'legend' }, h('span', {}, h('i'), 'отмечено'), h('span', {}, h('i', { class: 'paused' }), 'пауза')));
}

function drawToday() {
  const d = V.summary;
  document.getElementById('today').replaceChildren(...[sleepCard(d), stepsCard(d), waterCard(d), medsCard(), habitsCard(d), screenCard(d), focusCard(d), placesCard(d), moodCard(d)].filter(Boolean));
  document.getElementById('charts').replaceChildren(...[sleepChart(), stepsChart(), calendarChart()].filter(Boolean));
}

// ---- pause ------------------------------------------------------------------------------------

function drawPause() {
  const box = document.getElementById('pause');
  const p = V.pause;
  if (!p) {
    box.replaceChildren();
    return;
  }
  const title = (PAUSES.filter(x => x[0] === p.type)[0] || [0, 'Пауза'])[1];
  box.replaceChildren(h('section', { class: 'card accent banner' },
    ui.icon('pause'),
    h('div', { class: 'grow' }, h('div', { style: 'font-weight: 600' }, title + (p.until ? ' до ' + dateLong(p.until) : '')),
      h('div', { class: 'small muted' }, 'Цепочки заморожены, о привычках не напоминаю. О лекарствах — напоминаю.')),
    h('button', { class: 'btn small', onclick: () => act(() => call('unpause')) }, 'Закончить')));
}

function pauseSheet(type) {
  const until = h('input', { class: 'input', type: 'date', min: V.date });
  const title = (PAUSES.filter(x => x[0] === type)[0] || [0, 'Пауза'])[1];
  let close = null;
  close = ui.sheet([
    h('h3', {}, title),
    h('p', { class: 'hint' }, 'На время паузы цепочки привычек заморожены, цели не считаются невыполненными, напоминания о привычках молчат. ' +
      'Питомец, ачивки и RPG тоже знают о паузе.'),
    h('label', { class: 'field' }, h('span', {}, 'Последний день паузы (можно не указывать)'), until),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: () => close() }, 'Отмена'),
      h('button', { class: 'btn primary', onclick: () => act(async () => {
        await call('pause', { type, until: until.value || null });
        close();
      }) }, 'Начать'))
  ]);
}

// ---- «Неделя» ---------------------------------------------------------------------------------

function drawWeek() {
  const report = V.weekly;
  const run = h('button', { class: 'btn small soft', onclick: async () => {
    run.disabled = true;
    run.textContent = 'Считаю…';
    await act(() => call('weekly'));
  } }, 'Разобрать сейчас');
  const left = [];
  if (!report) {
    left.push(card('chart', 'Разбор сна', run, empty('Разбора ещё не было. Он приходит раз в неделю (' + weekDayName(V.settings.weeklyDay) + ', ' +
      V.settings.weeklyAt + ') и считает, что совпадало с короткими ночами за последние ' + V.settings.weeklyDepth + ' ночей.')));
  } else {
    left.push(card('chart', 'Разбор сна · ' + report.week.replace('-W', ', неделя '), run,
      h('p', { class: 'weekly-text', 'data-raw': '' }, report.text),
      h('div', { class: 'sub' }, 'Ночей с данными: ' + report.table.nights + ', коротких (до ' + dur(report.table.limit) + '): ' + report.table.bad +
        ' · ' + (report.by === 'model' ? 'текст написала модель' : 'текст по шаблону') + ' · ' + new Date(report.made).toLocaleString('ru', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))));
    const rows = report.table.rows.slice().sort((a, b) => (b.report - a.report) || Math.abs(b.diffPp || 0) - Math.abs(a.diffPp || 0));
    left.push(card('list', 'Что совпадало с короткими ночами', null, h('div', {}, rows.map(r => h('div', { class: 'match' + (r.report ? '' : ' quiet') },
      h('div', {}, r.label + (r.report ? '' : ' — мало данных или нет разницы')),
      h('div', { class: 'nums' }, r.withN ?
        'с признаком: ' + r.withBad + ' из ' + r.withN + (r.pWith !== null ? ' (' + r.pWith + '%)' : '') +
        ' · без: ' + r.withoutBad + ' из ' + r.withoutN + (r.pWithout !== null ? ' (' + r.pWithout + '%)' : '') +
        (r.diffMin ? ' · сон ' + (r.diffMin < 0 ? 'короче' : 'длиннее') + ' на ' + dur(Math.abs(r.diffMin)) : '') : 'таких дней не было')))),
      h('p', { class: 'hint' }, 'Совпадение — не обязательно причина.')));
  }
  document.getElementById('week').replaceChildren(...left);
  const side = [];
  const avg = report ? report.averages : null;
  const now = avg ? avg.now : averages(V.days.slice(-7));
  const prev = avg ? avg.prev : averages(V.days.slice(0, 7));
  const row = (label, a, b, fmt, better) => {
    const diff = a !== null && b !== null ? a - b : null;
    const good = diff === null || diff === 0 ? '' : (better(diff) ? 'ok-text' : 'bad-text');
    return h('tr', {}, h('td', {}, label), h('td', {}, a === null ? '—' : fmt(a)), h('td', {}, b === null ? '—' : fmt(b)),
      h('td', { class: good }, diff === null ? '' : (diff > 0 ? '+' : '−') + fmt(Math.abs(diff))));
  };
  side.push(card('history', 'Неделя против прошлой', null, h('table', { class: 'compare' },
    h('tr', {}, h('th', {}, ''), h('th', {}, 'эта'), h('th', {}, 'прошлая'), h('th', {}, '')),
    row('Сон', now.sleepMin, prev.sleepMin, dur, x => x > 0),
    row('Шаги', now.steps, prev.steps, num, x => x > 0),
    row('Экран', now.screenMin, prev.screenMin, dur, x => x < 0),
    row('Вода', now.waterMl, prev.waterMl, x => liters(x) + NB + 'л', x => x > 0)),
    h('p', { class: 'hint' }, 'Средние по дням, где данные были.')));
  side.push(sleepChart());
  document.getElementById('week-side').replaceChildren(...side);
}

function averages(days) {
  const pick = (key, known) => {
    const list = days.filter(d => (!known || d.known[known]) && typeof d[key] === 'number').map(d => d[key]);
    return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
  };
  return { sleepMin: pick('sleepMin', 'sleep'), steps: pick('steps', 'steps'), screenMin: pick('screenMin', 'screen'), waterMl: pick('waterMl') };
}

function weekDayName(n) {
  return ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'][(Number(n) || 7) - 1];
}

// ---- «Привычки» -------------------------------------------------------------------------------

function drawHabits() {
  const live = V.habits;
  const rows = live.map(x => h('div', { class: 'line-row' },
    h('span', { class: 'mark' }, ui.icon(x.icon || 'check')),
    h('button', { class: 'grow', onclick: () => habitSheet(x) },
      h('div', { 'data-raw': '' }, x.title),
      h('div', { class: 'small' }, x.when + (x.measure ? ' · ' + x.measure.amount + NB + x.measure.unit : '') + (x.remind ? ' · в ' + x.remind : '') +
        ' · цепочка ' + x.chain + ', лучшая ' + x.best)),
    iconBtn('edit', 'Изменить', () => habitSheet(x))));
  const pauseButtons = V.pause ? h('div', { class: 'row' }, h('span', { class: 'grow hint' }, 'Пауза идёт.'),
    h('button', { class: 'btn small', onclick: () => act(() => call('unpause')) }, 'Закончить')) :
    h('div', { class: 'chips' }, PAUSES.map(p => h('button', { class: 'chip', onclick: () => pauseSheet(p[0]) }, p[1])));
  const archived = V.archived.length ? card('box', 'Архив', null, h('div', {}, V.archived.map(x => h('div', { class: 'line-row' },
    h('div', { class: 'grow' }, h('div', { 'data-raw': '' }, x.title), h('div', { class: 'small' }, 'в архиве')),
    h('button', { class: 'btn small soft', onclick: () => act(() => call('archiveHabit', x.id, false)) }, 'Вернуть'),
    iconBtn('trash', 'Удалить', async () => {
      if (!(await ui.confirm('Удалить «' + x.title + '» из списка? Отметки в базе останутся.', 'Удалить', true))) return;
      act(() => call('removeHabit', x.id));
    }))))) : null;
  document.getElementById('habits').replaceChildren(...[
    card('check', 'Привычки', h('button', { class: 'btn small primary', onclick: () => habitSheet(null) }, 'Добавить'),
      live.length ? h('div', {}, rows) : empty('Пока пусто. Например: «Чтение 20 минут» каждый день или «Зал» 3 раза в неделю.')),
    card('pause', 'Пауза', null, h('p', { class: 'hint' }, 'Болезнь, отпуск или просто перерыв: цепочки не рвутся, цели не горят.'), pauseButtons),
    archived
  ].filter(Boolean));
  drawMeds();
}

function daysPicker(selected) {
  const chosen = new Set(selected);
  const box = h('div', { class: 'days-pick' });
  const draw = () => box.replaceChildren(...DAYS.map((name, i) => h('button', {
    class: 'chip' + (chosen.has(i + 1) ? ' on' : ''), type: 'button',
    onclick: () => {
      if (chosen.has(i + 1)) chosen.delete(i + 1);
      else chosen.add(i + 1);
      draw();
    }
  }, name)));
  draw();
  box.value = () => Array.from(chosen).sort();
  return box;
}

function habitSheet(habit) {
  const x = habit || { title: '', icon: 'check', schedule: { days: [1, 2, 3, 4, 5, 6, 7] }, measure: null, remind: null };
  const title = h('input', { class: 'input', value: x.title, placeholder: 'Чтение 20 минут' });
  let icon = x.icon || 'check';
  const picker = h('div', { class: 'picker' });
  const drawPicker = () => picker.replaceChildren(...ui.iconNames.map(name => h('button', {
    type: 'button', class: name === icon ? 'on' : '', 'aria-label': name, onclick: () => { icon = name; drawPicker(); }
  }, ui.icon(name))));
  drawPicker();
  let mode = x.schedule && x.schedule.perWeek ? 'week' : 'days';
  const days = daysPicker(x.schedule && x.schedule.days ? x.schedule.days : [1, 2, 3, 4, 5, 6, 7]);
  const perWeek = h('input', { class: 'input', type: 'number', min: 1, max: 7, value: (x.schedule && x.schedule.perWeek) || 3 });
  const perWeekField = h('label', { class: 'field' }, h('span', {}, 'Сколько раз в неделю'), perWeek);
  const modes = h('div', { class: 'chips' });
  const drawModes = () => {
    modes.replaceChildren(
      h('button', { type: 'button', class: 'chip' + (mode === 'days' ? ' on' : ''), onclick: () => { mode = 'days'; drawModes(); } }, 'По дням недели'),
      h('button', { type: 'button', class: 'chip' + (mode === 'week' ? ' on' : ''), onclick: () => { mode = 'week'; drawModes(); } }, 'N раз в неделю'));
    days.hidden = mode !== 'days';
    perWeekField.hidden = mode !== 'week';
  };
  drawModes();
  const amount = h('input', { class: 'input', type: 'number', min: 0, value: x.measure ? x.measure.amount : '', placeholder: 'не нужно' });
  const unit = h('input', { class: 'input', value: x.measure ? x.measure.unit : 'мин' });
  const remindOn = h('input', { type: 'checkbox', class: 'switch', checked: Boolean(x.remind) });
  const remind = h('input', { class: 'input', type: 'time', value: x.remind || '21:00' });
  let close = null;
  const save = () => act(async () => {
    await call('saveHabit', {
      id: habit ? habit.id : undefined, created: habit ? habit.created : undefined, archived: false,
      title: title.value, icon,
      schedule: mode === 'week' ? { perWeek: Number(perWeek.value) } : { days: days.value() },
      measure: Number(amount.value) > 0 ? { amount: Number(amount.value), unit: unit.value } : null,
      remind: remindOn.checked ? remind.value : null
    });
    close();
  });
  close = ui.sheet([
    h('h3', {}, habit ? 'Привычка' : 'Новая привычка'),
    h('label', { class: 'field' }, h('span', {}, 'Название'), title),
    h('div', { class: 'field' }, h('span', {}, 'Значок'), picker),
    h('div', { class: 'field' }, h('span', {}, 'Когда'), modes, days, perWeekField),
    h('div', { class: 'two' },
      h('label', { class: 'field' }, h('span', {}, 'Цель (число)'), amount),
      h('label', { class: 'field' }, h('span', {}, 'Единица'), unit)),
    h('div', { class: 'row' }, h('span', { class: 'grow' }, 'Напоминать'), remind, remindOn),
    h('div', { class: 'actions' },
      habit ? h('button', { class: 'btn', onclick: () => act(async () => { await call('archiveHabit', habit.id, true); close(); }) }, 'В архив') :
        h('button', { class: 'btn', onclick: () => close() }, 'Отмена'),
      h('button', { class: 'btn primary', onclick: save }, 'Сохранить'))
  ]);
}

function drawMeds() {
  const list = V.meds.filter(m => !m.archived);
  document.getElementById('meds').replaceChildren(card('pill', 'Лекарства', h('button', { class: 'btn small primary', onclick: () => medSheet(null) }, 'Добавить'),
    list.length ? h('div', {}, list.map(m => h('div', { class: 'line-row' },
      h('button', { class: 'grow', onclick: () => medSheet(m) },
        h('div', { 'data-raw': '' }, m.name + (m.dose ? ', ' + m.dose : '')),
        h('div', { class: 'small' }, m.times.join(', ') + ' · ' + (m.days && m.days.length ? m.days.map(n => DAYS[n - 1]).join(' ') : 'каждый день') +
          (m.until ? ' · до ' + dateLong(m.until) : '') + (m.remind ? '' : ' · без напоминаний'))),
      iconBtn('edit', 'Изменить', () => medSheet(m))))) :
      empty('Лекарств нет. Добавьте курс — придут напоминания в нужное время, а отметка «принял» — одним касанием.'),
    h('p', { class: 'hint' }, 'Повтор напоминания — через ' + V.settings.medRepeatMin + NB + 'мин, ' + V.settings.medRepeatCount + ' раз; неотмеченные приёмы при закрытии суток становятся пропущенными.')));
}

function medSheet(med) {
  const m = med || { name: '', dose: '', times: ['09:00'], days: [], from: null, until: null, note: '', remind: true };
  const name = h('input', { class: 'input', value: m.name, placeholder: 'Витамин D' });
  const dose = h('input', { class: 'input', value: m.dose, placeholder: '1 капсула' });
  const times = h('input', { class: 'input', value: m.times.join(', '), placeholder: '09:00, 21:00' });
  const days = daysPicker(m.days && m.days.length ? m.days : [1, 2, 3, 4, 5, 6, 7]);
  const from = h('input', { class: 'input', type: 'date', value: m.from || '' });
  const until = h('input', { class: 'input', type: 'date', value: m.until || '' });
  const note = h('input', { class: 'input', value: m.note || '', placeholder: 'после еды' });
  const remind = h('input', { type: 'checkbox', class: 'switch', checked: m.remind !== false });
  let close = null;
  close = ui.sheet([
    h('h3', {}, med ? 'Лекарство' : 'Новое лекарство'),
    h('label', { class: 'field' }, h('span', {}, 'Название'), name),
    h('div', { class: 'two' },
      h('label', { class: 'field' }, h('span', {}, 'Доза'), dose),
      h('label', { class: 'field' }, h('span', {}, 'Время приёма'), times)),
    h('div', { class: 'field' }, h('span', {}, 'Дни'), days),
    h('div', { class: 'two' },
      h('label', { class: 'field' }, h('span', {}, 'Курс с'), from),
      h('label', { class: 'field' }, h('span', {}, 'по'), until)),
    h('label', { class: 'field' }, h('span', {}, 'Заметка'), note),
    h('div', { class: 'row' }, h('span', { class: 'grow' }, 'Напоминать'), remind),
    h('div', { class: 'actions' },
      med ? h('button', { class: 'btn danger', onclick: async () => {
        if (!(await ui.confirm('Удалить «' + med.name + '»? Отметки о приёмах в базе останутся.', 'Удалить', true))) return;
        await act(() => call('removeMed', med.id));
        close();
      } }, 'Удалить') : h('button', { class: 'btn', onclick: () => close() }, 'Отмена'),
      h('button', { class: 'btn primary', onclick: () => act(async () => {
        await call('saveMed', { id: med ? med.id : undefined, name: name.value, dose: dose.value, times: times.value, days: days.value(),
          from: from.value || null, until: until.value || null, note: note.value, remind: remind.checked });
        close();
      }) }, 'Сохранить'))
  ]);
}

// ---- «Настройки» ------------------------------------------------------------------------------

async function grant(what) {
  await act(() => call('grant', what));
}

function accessRow(title, ok, text, what, button) {
  return h('div', { class: 'line-row' },
    h('div', { class: 'grow' }, h('div', {}, title), h('div', { class: 'small ' + (ok ? 'ok-text' : '') }, text)),
    !ok && what ? h('button', { class: 'btn small soft', onclick: () => grant(what) }, button || 'Выдать') : null);
}

function drawAccess() {
  const st = V.status;
  const hc = st.hc || {};
  const hcText = !hc.available ? 'нет на этом телефоне (нужен Android 14+)' : !hc.declared ? 'оболочка ещё не объявила разрешения Health Connect' :
    hc.steps || hc.sleep ? 'шаги ' + (hc.steps ? 'да' : 'нет') + ', сон ' + (hc.sleep ? 'да' : 'нет') + ', тренировки ' + (hc.exercise ? 'да' : 'нет') +
      (hc.background ? '' : ', в фоне — нет') : 'не разрешено';
  const report = st.lastReport || {};
  const reportLines = Object.keys(report).map(key => h('div', { class: 'small muted' }, key + ': ' + (typeof report[key] === 'object' ? JSON.stringify(report[key]) : String(report[key]))));
  const recompute = h('button', { class: 'btn small soft', onclick: async () => {
    recompute.disabled = true;
    await act(() => call('recompute', addDays(V.date, -13), V.date));
    ui.toast('Пересчитано');
  } }, 'Пересчитать 14 дней');
  const places = V.places || [];
  document.getElementById('access').replaceChildren(...[
    card('lock', 'Доступы', null, h('div', {},
      accessRow('Датчик шагов', st.sensor && st.sensor.granted, !st.sensor || !st.sensor.present ? 'датчика нет' : st.sensor.granted ? 'разрешено' : 'нужно разрешение «Физическая активность»', st.sensor && st.sensor.present ? 'steps' : null),
      accessRow('Health Connect', hc.steps || hc.sleep, hcText, hc.available && hc.declared ? 'hc' : null),
      accessRow('Экранное время', st.usage && st.usage.granted, st.usage && st.usage.granted ? 'доступ к статистике есть' :
        'нет доступа к статистике' + (st.logSince ? '; свой журнал экрана — с ' + new Date(st.logSince).toLocaleDateString('ru') : ''), 'usage', 'Открыть'),
      accessRow('Местоположение', st.location && st.location.granted && (st.location.background || !V.settings.placesOn),
        st.location && st.location.granted ? (st.location.background ? 'разрешено, и в фоне' : 'разрешено, но не в фоне') : 'не разрешено', 'location'),
      accessRow('Уведомления', st.notifications, st.notifications ? 'разрешены' : 'запрещены — напоминаний не будет', 'notifications'),
      accessRow('Работа в фоне', st.battery !== false, st.battery ? 'батарея не ограничивает' : 'система может откладывать сбор', 'battery', 'Открыть'),
      accessRow('Инструменты агента', st.tools, st.tools ? 'health_mark и health_day на месте' : 'появятся после перезапуска модуля', null))),
    card('refresh', 'Сбор данных', null,
      h('div', { class: 'small' }, st.lastCollect ? 'Последний сбор: ' + new Date(st.lastCollect).toLocaleString('ru', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'Сбора ещё не было.'),
      reportLines.length ? h('div', {}, reportLines) : null,
      st.lastClosed ? h('div', { class: 'small muted' }, 'Последние закрытые сутки: ' + dateLong(st.lastClosed)) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn small primary', onclick: collectNow }, 'Собрать сейчас'),
        recompute)),
    places.length ? card('pin', 'Места', null, h('div', {}, places.map(p => h('div', { class: 'line-row' },
      h('button', { class: 'grow', onclick: () => placeSheet(p) },
        h('div', { 'data-raw': '' }, p.title),
        h('div', { class: 'small' }, (p.type === 'home' ? 'дом' : p.type === 'work' ? 'работа' : 'место') + (p.suggested ? ' (угадано)' : '') +
          ' · визитов ' + p.visits + ' · ' + dur(p.minutes))),
      iconBtn('edit', 'Изменить', () => placeSheet(p))))),
    h('p', { class: 'hint' }, 'Координаты не покидают телефон и не показываются; хранятся только названия, клетки карты и визиты.')) : null
  ].filter(Boolean));
}

function placeSheet(p) {
  const title = h('input', { class: 'input', value: p.title });
  let type = p.type;
  const types = h('div', { class: 'chips' });
  const drawTypes = () => types.replaceChildren(...[['home', 'Дом'], ['work', 'Работа'], ['other', 'Другое']].map(t => h('button', {
    type: 'button', class: 'chip' + (type === t[0] ? ' on' : ''), onclick: () => { type = t[0]; drawTypes(); }
  }, t[1])));
  drawTypes();
  let close = null;
  close = ui.sheet([
    h('h3', {}, 'Место'),
    h('label', { class: 'field' }, h('span', {}, 'Название'), title),
    h('div', { class: 'field' }, h('span', {}, 'Что это'), types),
    h('div', { class: 'actions' },
      h('button', { class: 'btn', onclick: () => close() }, 'Отмена'),
      h('button', { class: 'btn primary', onclick: () => act(async () => {
        if (title.value.trim() && title.value.trim() !== p.title) await call('renamePlace', p.id, title.value.trim());
        if (type !== p.type || p.suggested) await call('setPlaceType', p.id, type);
        close();
      }) }, 'Сохранить'))
  ]);
}

function settingField(item, value) {
  const save = async next => {
    try {
      const patch = {};
      patch[item.key] = next;
      V.settings = await call('setSettings', patch);
      ui.toast('Сохранено');
    } catch (error) {
      fail(error);
    }
  };
  if (item.type === 'bool') {
    const input = h('input', { type: 'checkbox', class: 'switch', checked: Boolean(value), 'aria-label': item.label });
    input.onchange = () => save(input.checked);
    return h('label', { class: 'setting' }, h('div', { class: 'grow' }, h('div', {}, item.label), item.hint ? h('div', { class: 'small' }, item.hint) : null), input);
  }
  let input;
  if (item.type === 'select') {
    input = h('select', { class: 'input', 'aria-label': item.label }, item.options.map(o => h('option', { value: o[0], selected: String(value) === o[0] }, o[1])));
  } else if (item.type === 'time') {
    input = h('input', { class: 'input', type: 'time', value, 'aria-label': item.label });
  } else if (item.type === 'int' || item.type === 'num') {
    input = h('input', { class: 'input', type: 'number', inputMode: item.type === 'int' ? 'numeric' : 'decimal', min: item.min, max: item.max, step: item.step, value, 'aria-label': item.label });
  } else {
    input = h('input', { class: 'input long', value: Array.isArray(value) ? value.join(', ') : value || '', 'aria-label': item.label });
  }
  input.onchange = () => save(input.value);
  const long = item.type === 'list' || item.type === 'text';
  return h('div', { class: 'setting' + (long ? ' column' : '') },
    h('div', { class: 'grow' }, h('div', {}, item.label), item.hint ? h('div', { class: 'small' }, item.hint) : null),
    long ? input : h('div', { class: 'row' }, input, item.unit ? h('span', { class: 'unit' }, item.unit) : null));
}

function drawPrefs() {
  if (!schema) return;
  const sections = [];
  schema.forEach(item => {
    let section = sections.filter(s => s.title === item.section)[0];
    if (!section) sections.push(section = { title: item.section, items: [] });
    section.items.push(item);
  });
  document.getElementById('prefs').replaceChildren(...sections.map(s =>
    card(null, s.title, null, h('div', {}, s.items.map(item => settingField(item, V.settings[item.key]))))));
}

// ---- loading ----------------------------------------------------------------------------------

async function collectNow() {
  ui.toast('Собираю…');
  const report = await act(() => call('collect'));
  if (report && report.busy) ui.toast('Сбор уже идёт');
}

async function load() {
  V = await call('view');
  drawPause();
  drawToday();
  drawWeek();
  drawHabits();
  drawAccess();
  drawPrefs();
}

/** A tap on a medicine notification of an older shell: mark the dose and close the screen. */
async function fromNotification() {
  const hash = new URLSearchParams(location.hash.slice(1));
  if (!hash.get('med')) return false;
  try {
    const out = await call('medTaken', hash.get('med'), Number(hash.get('due')), 'taken');
    ui.toast('Отмечено: ' + out.name + (out.status === 'late' ? ', с опозданием' : ''));
    history.replaceState(null, '', location.pathname + location.search);
    setTimeout(() => assi.back(), 1400);
    return true;
  } catch (error) {
    fail(error);
    return false;
  }
}

let pending = null;
function later() {
  clearTimeout(pending);
  pending = setTimeout(() => load().catch(fail), 400);
}

async function main() {
  ui.tabs(document.getElementById('tabs'), [['today', 'Сегодня'], ['week', 'Неделя'], ['habits', 'Привычки'], ['settings', 'Настройки']]);
  document.getElementById('collect').onclick = collectNow;
  if (await fromNotification()) return;
  try {
    schema = await call('settingsSchema');
    await load();
  } catch (error) {
    fail(error);
  }
  assi.on('health.changed', later);
  assi.on('life.place', later);
}

main().catch(fail);
