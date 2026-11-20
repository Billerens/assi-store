import { rooms, allPlaces, uid } from './data.js';
import { load, state, save, errors, errorText, rememberLayout, undoLayout } from './state.js';
import { Stage } from './stage.js';
import { $, paper, sheet, open, close, el, button, row, field, choices, toast, showError } from './paper.js';
import { configureBooks, catalogue, bindery, read, bookCard, recover } from './books.js';
import { workshop, editObject, workshopActions, recoverWorkshop } from './workshop.js';
let stage,
  selection = null,
  sound,
  ambient,
  panTimer = null;
errors((error) => {
  if (error?.name === 'LibraryConflict') {
    open('Сохранение', 'Есть другая редакция');
    paper.append(
      el('p', 'intro', error.message),
      row(button('Открыть сохранённую библиотеку', () => location.reload(), 'action'))
    );
  } else showError(error);
});
function update() {
  save();
  refresh();
}
function refresh() {
  $('#navigate').firstChild.textContent = rooms[state.room].name + ' ';
  stage?.update(state);
  document.body.classList.toggle('rain', state.room === 1 && state.weather === 'rain');
  focus();
}
function focus() {
  const target = $('#focus');
  target.replaceChildren();
  const held = state.books.find((b) => b.id === state.held);
  if (held) {
    target.append(
      el('span', '', held.title),
      button('Читать', () => read(held)),
      button('Поставить', () => placeBook(held))
    );
    return;
  }
  const selected = state.books.find((b) => b.id === selection);
  if (selected) {
    target.append(
      el('span', '', selected.title),
      button('Открыть', () => bookCard(selected))
    );
    return;
  }
  const obj = state.objects.find((o) => o.id === selection);
  if (obj) {
    target.append(
      el('span', '', obj.shape.name),
      button('Осмотреть', () => objectView(obj))
    );
    return;
  }
  if (state.room === 0) {
    const book = state.books.find((b) => b.place === 'hall-shelf') || state.books[0];
    target.append(
      el('span', '', book.title),
      button('Читать', () => read(book))
    );
  } else if (state.room === 1)
    target.append(
      el('span', '', 'Кресло у окна'),
      button('Сесть', () => {
        stage?.sit();
        toast('Кресло у окна');
      }),
      button('Веранда', navigation)
    );
  else
    target.append(
      el('span', '', 'Стол переплётчика'),
      button('Создать книгу', () => bindery())
    );
}
function travel(room, hide = true) {
  state.room = room;
  selection = null;
  stage?.travel(room);
  update();
  if (hide) close();
}
function pick(p) {
  if (p.kind === 'book') {
    const b = state.books.find((b) => b.id === p.id);
    if (!b) return;
    selection = b.id;
    const place = allPlaces(state).find((v) => v.id === b.place);
    if (place) stage?.focus(place.x, place.z);
    focus();
    bookCard(b);
  } else if (p.kind === 'object') {
    const o = state.objects.find((v) => v.id === p.id);
    if (o) objectView(o);
  } else if (p.kind === 'stacks') {
    stage?.focus(p.x, p.z);
    catalogue();
  } else if (p.kind === 'place') {
    const b = state.books.find((v) => v.id === state.held);
    if (b) {
      put(b, p.id);
      return;
    }
    const place = allPlaces(state).find((v) => v.id === p.id);
    if (!place) return;
    open(rooms[place.room].name, place.name);
    const books = state.books.filter((b) => b.place === place.id);
    books.forEach((b) => paper.append(button(b.title, () => bookCard(b), 'choice')));
    if (!books.length) paper.append(el('p', 'intro', 'Есть место для книг.'));
    if (place.id === 'bind-table') paper.append(row(button('Новая книга', bindery, 'action')));
    paper.append(
      row(
        button('Подойти', () => {
          stage?.focus(place.x, place.z);
          close();
        })
      )
    );
  } else if (p.kind === 'exhibit') {
    const ex = state.exhibits.find((v) => v.id === p.id);
    if (ex) exhibit(ex);
  }
}
function takeBook(b) {
  rememberLayout();
  if (state.held && state.held !== b.id) {
    const old = state.books.find((v) => v.id === state.held);
    if (old) old.place = allPlaces(state).find((v) => v.room === state.room)?.id || 'cart';
  }
  state.held = b.id;
  selection = b.id;
  update();
  toast('В руках · ' + b.title);
}
function put(b, id) {
  const target = allPlaces(state).find((v) => v.id === id);
  if (!target) return;
  rememberLayout();
  b.place = id;
  b.position = Date.now();
  if (state.held === b.id) state.held = null;
  travel(target.room);
  selection = b.id;
  stage?.focus(target.x, target.z);
  refresh();
  toast('Книга поставлена · ' + target.name);
}
function placeBook(b) {
  open('Расстановка', b.title);
  paper.append(el('p', 'intro', 'Куда поставить том?'));
  for (const p of allPlaces(state))
    paper.append(button(rooms[p.room].name + ' · ' + p.name, () => put(b, p.id), 'choice'));
}
function objectView(o) {
  if (state.room !== o.room) travel(o.room, false);
  selection = o.id;
  focus();
  stage?.focus(o.x, o.z);
  open(rooms[o.room].name, o.shape.name);
  paper.append(el('p', 'intro', o.prompt));
  const abilities = new Set(o.shape.parts.map((p) => p.action));
  const actions = row();
  if (abilities.has('seat'))
    actions.append(
      button('Сесть', () => {
        close();
        if (stage) {
          stage.camera.position.set(o.x, o.y + 0.94 * o.scale, o.z + 0.2);
          stage.dest = null;
          stage.look(0);
        }
      })
    );
  if (abilities.has('catalog')) actions.append(button('Открыть каталог', () => catalogue()));
  if (abilities.has('light'))
    actions.append(
      button(o.on === false ? 'Включить свет' : 'Погасить свет', () => {
        o.on = o.on === false;
        update();
        objectView(o);
      })
    );
  if (abilities.has('hinge'))
    actions.append(
      button(o.open ? 'Закрыть' : 'Открыть', () => {
        o.open = !o.open;
        update();
        objectView(o);
      })
    );
  if (o.citation) actions.append(button('Цитата на основании', () => visit(o.citation)));
  if (actions.children.length) paper.append(actions);
  for (const p of allPlaces(state).filter((p) => p.parent === o.id))
    paper.append(
      button(
        p.name + ' · ' + state.books.filter((b) => b.place === p.id).length + ' книг',
        () => pick({ kind: 'place', id: p.id }),
        'choice'
      )
    );
  const room = choices(
    'Перенести в помещение',
    rooms.map((r, i) => [i, r.name]),
    o.room
  );
  paper.append(room.root);
  room.input.onchange = () => {
    rememberLayout();
    const next = Number(room.input.value);
    o.x += rooms[next].x - rooms[o.room].x;
    o.room = next;
    state.room = next;
    stage?.travel(next);
    update();
    objectView(o);
  };
  function adjust(key, delta) {
    rememberLayout();
    o[key] = (o[key] || 0) + delta;
    const x = rooms[o.room].x;
    o.x = Math.max(x - 4.5, Math.min(x + 4.5, o.x));
    o.y = Math.max(0, Math.min(3.5, o.y));
    o.z = Math.max(-4.1, Math.min(3.8, o.z));
    update();
    info.textContent = location();
  }
  function location() {
    return (
      'От центра ' +
      Math.round((o.x - rooms[o.room].x) * 100) +
      ' см · высота ' +
      Math.round(o.y * 100) +
      ' см · поворот ' +
      (o.angle % 360) +
      '°'
    );
  }
  const info = el('p', 'muted', location());
  paper.append(
    info,
    row(
      button('←', () => adjust('x', -0.25)),
      button('→', () => adjust('x', 0.25)),
      button('Вглубь', () => adjust('z', -0.25)),
      button('Ближе', () => adjust('z', 0.25)),
      button('Выше', () => adjust('y', 0.1)),
      button('Ниже', () => adjust('y', -0.1)),
      button('Повернуть', () => adjust('angle', 15))
    )
  );
  paper.append(
    row(
      button('Осмотреть в комнате', close, 'action'),
      button('Изменить словами', () => editObject(o))
    )
  );
}
function visit(ref) {
  const b = state.books.find((b) => b.id === ref.book);
  if (b) read(b, ref.chapter, ref.para, ref.edition, true);
}
function exhibit(ex) {
  open('Частная выставка', ex.name);
  paper.append(el('p', 'muted', rooms[ex.room].name));
  ex.refs.forEach((ref) => {
    paper.append(
      el('p', 'intro', ref.quote),
      row(
        button(ref.label || 'Открыть отрывок', () => visit(ref)),
        button('Сделать вещь по цитате', () => workshop(ref))
      )
    );
  });
}
function addExhibit(ref) {
  open('Частная выставка', 'Карточка с цитатой');
  paper.append(el('p', 'intro', ref.quote));
  const name = field('Название новой выставки', ref.label || '');
  paper.append(
    name.root,
    row(
      button(
        'Поставить карточку здесь',
        () => {
          if (!name.input.value.trim()) return name.input.focus();
          const ex = { id: uid(), room: state.room, name: name.input.value.trim().slice(0, 90), refs: [ref] };
          state.exhibits.push(ex);
          update();
          exhibit(ex);
        },
        'action'
      ),
      button('В мастерскую с цитатой', () => workshop(ref))
    )
  );
  for (const ex of state.exhibits)
    paper.append(
      button(
        'Добавить к выставке «' + ex.name + '»',
        () => {
          ex.refs.push(ref);
          update();
          exhibit(ex);
        },
        'choice'
      )
    );
}
function rainSound(enabled) {
  if (!enabled) {
    if (ambient) {
      ambient.stop();
      ambient.disconnect();
      ambient = null;
    }
    return;
  }
  try {
    sound ||= new (window.AudioContext || window.webkitAudioContext)();
    sound.resume();
    const buffer = sound.createBuffer(1, sound.sampleRate * 2, sound.sampleRate),
      samples = buffer.getChannelData(0);
    let prior = 0;
    for (let i = 0; i < samples.length; i++) {
      prior = (prior + 0.06 * (Math.random() * 2 - 1)) / 1.045;
      samples[i] = prior * 0.7;
    }
    ambient = sound.createBufferSource();
    ambient.buffer = buffer;
    ambient.loop = true;
    ambient.connect(sound.destination);
    ambient.start();
  } catch (e) {
    toast('Звук недоступен');
  }
}
function navigation() {
  open('Личная библиотека', 'Прогулка');
  rooms.forEach((r, i) => paper.append(button(r.name + ' · ' + r.caption, () => travel(i), 'choice')));
  paper.append(
    row(
      button('Повернуться влево', () => {
        close();
        stage?.look(0.55);
      }),
      button('Повернуться вправо', () => {
        close();
        stage?.look(-0.55);
      }),
      button('Присесть', () => {
        close();
        stage?.sit();
      })
    )
  );
  if (state.room === 1) {
    paper.append(
      row(
        button(state.weather === 'rain' ? 'Остановить дождь' : 'Открыть окно в дождь', () => {
          state.weather = state.weather === 'rain' ? 'clear' : 'rain';
          update();
          if (state.weather === 'clear') rainSound(false);
          navigation();
        }),
        button(ambient ? 'Приглушить окно' : 'Слушать дождь', () => {
          rainSound(!ambient);
          navigation();
        })
      )
    );
  }
  if (state.exhibits.length) {
    paper.append(el('h3', '', 'Частные выставки'));
    for (const ex of state.exhibits)
      paper.append(button(ex.name + ' · ' + rooms[ex.room].name, () => exhibit(ex), 'choice'));
  }
  if (state.objects.length) {
    paper.append(el('h3', '', 'Предметы'));
    for (const o of state.objects)
      paper.append(button(o.shape.name + ' · ' + rooms[o.room].name, () => objectView(o), 'choice'));
  }
  paper.append(
    el(
      'p',
      'muted',
      'Коснитесь пола, чтобы подойти. Потяните для поворота. С клавиатуры используйте стрелки, установив фокус на комнате.'
    )
  );
  if (state.previousLayout)
    paper.append(
      row(
        button('Отменить перестановку', () => {
          if (undoLayout()) {
            selection = null;
            update();
            close();
            toast('Предыдущая расстановка восстановлена');
          }
        })
      )
    );
  if (window.axiko?.back) paper.append(row(button('Выйти из библиотеки', () => window.axiko.back())));
}
async function start() {
  await load();
  configureBooks({ refreshWorld: refresh, takeBook, placeBook, showExhibit: addExhibit });
  workshopActions(update, objectView);
  try {
    stage = new Stage($('#room'), {
      pick,
      room: (r) => {
        state.room = r;
        update();
      }
    });
    stage.travel(state.room);
  } catch (e) {
    console.warn('Imaginarium 3D:', e);
    toast('Для прогулки нужен WebGL. Книги и каталог доступны.');
  }
  $('#navigate').onclick = navigation;
  $('#catalog').onclick = () => catalogue();
  $('#bind').onclick = () => {
    travel(2, false);
    bindery();
  };
  $('#workshop').onclick = () => {
    travel(2, false);
    workshop();
  };
  refresh();
  for (const b of state.books) if (b.order) recover(b);
  recoverWorkshop().catch((e) => toast(errorText(e)));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) rainSound(false);
  });
}
start().catch(showError);
