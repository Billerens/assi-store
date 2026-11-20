import { state, save, request, result, errorText } from './state.js';
import { uid, swatches } from './data.js';
import { paper, sheet, el, open, close, button, row, field, choices, toast, showError } from './paper.js';
let viewer = null,
  refreshWorld = () => {},
  takeBook = () => {},
  placeBook = () => {},
  showExhibit = () => {},
  wizardVersion = 0;
const active = new Set();
export function configureBooks(callbacks) {
  ({ refreshWorld, takeBook, placeBook, showExhibit } = callbacks);
}
document.addEventListener('paper-change', () => {
  viewer = null;
  wizardVersion++;
});
function stamp(text) {
  return new Date().toLocaleDateString() + ' · ' + text;
}
function change() {
  save();
  refreshWorld();
}
export function catalogue(query = '') {
  open('Книжный шкаф', 'Каталог');
  const search = field('Название, герой или пометка', query, 'search');
  paper.append(search.root);
  const list = el('div');
  paper.append(list);
  function filter() {
    const term = search.input.value.trim().toLocaleLowerCase();
    list.replaceChildren();
    for (const b of state.books.filter((book) =>
      [
        book.title,
        book.tone,
        book.premise,
        ...book.chapters.flatMap((c) => c.facts),
        ...(book.notes || []).map((n) => n.text)
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
    )) {
      const item = button('', () => bookCard(b), 'bookrow');
      const ink = el('i');
      ink.style.backgroundColor = b.color;
      const details = el('span');
      details.append(
        el('strong', '', b.title),
        el(
          'small',
          '',
          b.tone + ' · ' + (b.complete ? 'завершена' : 'рукопись') + ' · ' + b.chapters.length + ' гл.'
        )
      );
      item.append(ink, details);
      list.append(item);
    }
    if (!list.children.length) list.append(el('p', 'muted', 'Совпадений нет.'));
  }
  filter();
  search.input.oninput = filter;
  paper.append(row(button('Новая книга', () => bindery(), 'action')));
}
export function bookCard(b) {
  open('Книга', b.title);
  paper.append(el('p', 'intro', b.premise), el('p', 'muted', b.tone));
  if (b.chapters.length)
    paper.append(
      row(
        button('Читать', () => read(b), 'action'),
        button('Взять в руки', () => {
          takeBook(b);
          close();
        }),
        button('Переставить', () => placeBook(b))
      )
    );
  else paper.append(el('p', 'muted', 'Для этого тома ещё не написано начало.'));
  if (!b.chapters.length && !b.order)
    paper.append(
      row(button('Написать начало', () => commission(b, 'chapter', '', 'Обычная глава'), 'action'))
    );
  if (b.order) pendingControls(b);
  if (b.chapters.length > 1) {
    paper.append(el('h3', '', 'Оглавление'));
    b.chapters.forEach((c, i) => paper.append(button(i + 1 + '. ' + c.title, () => read(b, i, 0), 'choice')));
  }
  if (b.marks?.length) {
    paper.append(el('h3', '', 'Закладки'));
    b.marks.forEach((m) =>
      paper.append(button(m.label, () => read(b, m.chapter, m.para, m.edition, true), 'choice'))
    );
  }
  if (b.chapters.length)
    paper.append(
      row(
        button('Авторская тетрадь', () => {
          open('Память книги', b.title);
          paper.append(el('p', 'intro', b.premise));
          const through = Math.min(b.chapters.length, (b.bookmark?.chapter || 0) + 1);
          for (let i = 0; i < through; i++) {
            const chapter = b.chapters[i],
              partial = i === through - 1 && (b.bookmark?.para || 0) < chapter.paragraphs.length - 1;
            paper.append(el('h3', '', i + 1 + '. ' + chapter.title));
            if (partial) {
              paper.append(
                el('p', 'muted', 'До вашей закладки'),
                el('p', '', chapter.paragraphs[Math.max(0, b.bookmark?.para || 0)])
              );
              continue;
            }
            paper.append(el('p', '', chapter.summary));
            for (const fact of chapter.facts) paper.append(el('p', 'muted', fact));
          }
          paper.append(row(button('К книге', () => bookCard(b))));
        })
      )
    );
}
function pendingControls(b) {
  const q = b.order;
  paper.append(
    el('p', 'muted', q.error || 'Заказ передан автору. Можно вернуться в комнату.'),
    row(
      button('Проверить результат', () => recover(b, true)),
      button('Отменить заказ', () => {
        b.order = null;
        change();
        bookCard(b);
      })
    )
  );
  if (q.error || !active.has(q.key))
    paper.append(row(button('Повторить этот запрос', () => runOrder(b, q), 'action')));
}
function chapterByEdition(book, index, id) {
  const c = book.chapters[index];
  return id && c.id !== id ? (c.editions || []).find((e) => e.id === id) || c : c;
}
export function read(
  b,
  index = b.bookmark?.chapter || 0,
  paragraph = b.bookmark?.para || 0,
  edition = null,
  temporary = false
) {
  if (!b.chapters.length) {
    bookCard(b);
    return;
  }
  index = Math.max(0, Math.min(b.chapters.length - 1, index));
  const c = chapterByEdition(b, index, edition);
  paragraph = Math.max(0, Math.min(paragraph, c.paragraphs.length - 1));
  open(b.title, c.title, true);
  viewer = b.id;
  sheet.classList.toggle('night', state.settings.contrast === 'night');
  const content = el('div', 'chapter');
  content.style.setProperty('--read-size', state.settings.font + 'px');
  content.style.setProperty('--spacing', state.settings.spacing || 1.63);
  let current = paragraph;
  function mark(i) {
    current = i;
    [...content.children].forEach((p, j) => p.classList.toggle('marked', i === j));
    if (!temporary) {
      b.bookmark = { chapter: index, para: i };
      save();
    }
  }
  const nav = row(
    button('−А', () => changeSize(-2)),
    button('+А', () => changeSize(2)),
    button('Интервал', () => {
      state.settings.spacing =
        state.settings.spacing === 1.9 ? 1.45 : state.settings.spacing === 1.45 ? 1.63 : 1.9;
      content.style.setProperty('--spacing', state.settings.spacing);
      save();
    }),
    button('Свет / тень', () => {
      state.settings.contrast = sheet.classList.toggle('night') ? 'night' : 'paper';
      save();
    }),
    button('Оглавление', () => bookCard(b))
  );
  function changeSize(delta) {
    state.settings.font = Math.max(15, Math.min(32, state.settings.font + delta));
    content.style.setProperty('--read-size', state.settings.font + 'px');
    save();
    content.children[current]?.scrollIntoView({ block: 'nearest' });
  }
  paper.append(el('small', 'eyebrow', 'Глава ' + (index + 1) + ' / ' + b.chapters.length), nav, content);
  c.paragraphs.forEach((p, i) => {
    const node = el('p', i === paragraph ? 'marked' : '', p);
    node.tabIndex = 0;
    node.onclick = () => mark(i);
    node.onkeydown = (e) => {
      if (e.key === 'Enter') mark(i);
    };
    content.append(node);
  });
  if (!temporary) {
    b.bookmark = { chapter: index, para: paragraph };
    save();
  }
  if (paragraph > 0)
    requestAnimationFrame(() => content.children[paragraph]?.scrollIntoView({ block: 'center' }));
  let timer;
  const onScroll = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!sheet.open || !content.isConnected || temporary) return;
      const top = sheet.getBoundingClientRect().top + 85;
      const paragraphs = [...content.children];
      if (!paragraphs.length || paragraphs[0].getBoundingClientRect().top > top) return;
      let found = paragraphs.findIndex((p) => p.getBoundingClientRect().bottom > top);
      if (found < 0) found = paragraphs.length - 1;
      if (found !== current) mark(found);
    }, 200);
  };
  sheet.addEventListener('scroll', onScroll);
  document.addEventListener(
    'paper-change',
    () => {
      clearTimeout(timer);
      sheet.removeEventListener('scroll', onScroll);
    },
    { once: true }
  );
  const note = field('Заметка к выбранному абзацу', '', 'text');
  function ref() {
    return { book: b.id, chapter: index, para: current, edition: c.id };
  }
  paper.append(
    note.root,
    row(
      button('Закладка', () => {
        (b.marks ||= []).push({
          ...ref(),
          label: note.input.value.trim() || c.paragraphs[current].slice(0, 48)
        });
        save();
        toast('Лента вложена');
      }),
      button('Записать на полях', () => {
        if (!note.input.value.trim()) return note.input.focus();
        (b.notes ||= []).push({ ...ref(), text: note.input.value.trim().slice(0, 600) });
        save();
        toast('Личная запись сохранена');
      }),
      button('На выставку', () =>
        showExhibit({ ...ref(), quote: c.paragraphs[current], label: note.input.value.trim() })
      )
    )
  );
  for (const n of (b.notes || []).filter((n) => n.chapter === index && n.edition === c.id))
    paper.append(el('p', 'muted', '✎ ' + n.text));
  const turns = row();
  if (index > 0) turns.append(button('← Предыдущая', () => read(b, index - 1, 0)));
  if (index + 1 < b.chapters.length)
    turns.append(button('Следующая →', () => read(b, index + 1, 0), 'action'));
  if (turns.childNodes.length) paper.append(turns);
  if (c.editions?.length) {
    paper.append(el('h3', '', 'Другие редакции'));
    for (const edition of c.editions)
      paper.append(
        row(
          button(edition.title, () => read(b, index, 0, edition.id, true)),
          ...(index === b.chapters.length - 1
            ? [
                button('Подшить этот вариант', () => {
                  switchEdition(b, index, edition);
                  read(b, index, 0);
                })
              ]
            : [])
        )
      );
  }
  if (index === b.chapters.length - 1 && !c.id.startsWith('found-')) orderForm(b);
  if (b.complete)
    paper.append(
      el('p', 'muted', 'Книга завершена.'),
      row(
        button('Завести второй том', () => {
          state.draft = {
            tone: b.tone,
            premise: 'После событий книги «' + b.title + '». ' + b.chapters.at(-1).summary,
            title: b.title + ' · Том II'
          };
          save();
          bindery();
        })
      )
    );
  paper.append(row(button('В комнату', close)));
}
function orderForm(b) {
  if (b.order) {
    pendingControls(b);
    return;
  }
  paper.append(el('h3', '', 'Записка автору'));
  const direction = field('Пожелание к следующему запросу', '', 'area'),
    size = choices(
      'Объём',
      [
        ['scene', 'Короткая сцена'],
        ['chapter', 'Обычная глава'],
        ['resolve', 'Развязка сюжетной линии']
      ],
      'chapter'
    );
  paper.append(direction.root, size.root);
  const actions = row();
  if (!b.complete)
    actions.append(
      button(
        'Написать продолжение',
        () => commission(b, 'chapter', direction.input.value, size.input.selectedOptions[0].textContent),
        'action'
      ),
      button('Попросить финал', () => commission(b, 'final', direction.input.value, 'Финальная глава'))
    );
  actions.append(
    button('Другой вариант этой главы', () =>
      commission(b, 'revision', direction.input.value, 'Новая редакция последней главы')
    )
  );
  paper.append(actions);
}
function switchEdition(b, index, edition) {
  const current = b.chapters[index],
    previous = { ...current };
  delete previous.editions;
  b.chapters[index] = {
    ...edition,
    editions: [previous, ...(current.editions || []).filter((e) => e.id !== edition.id)]
  };
  change();
}
async function commission(b, mode, note, length) {
  if (b.order) {
    toast('У книги уже есть заказ');
    return;
  }
  const q = {
    key: uid(),
    mode,
    note: note.slice(0, 800),
    length,
    index: mode === 'revision' ? b.chapters.length - 1 : b.chapters.length
  };
  b.order = q;
  bookCard(b);
  await runOrder(b, q);
}
async function runOrder(b, q) {
  if (active.has(q.key)) return;
  active.add(q.key);
  delete q.error;
  const data = {
    tone: b.tone,
    title: b.title,
    premise: b.premise,
    mode: q.mode,
    length: q.length,
    authorNote: q.note,
    chapter: q.index + 1,
    memory: window.ImaginariumSchema.memory(b, q.note, q.index)
  };
  if (q.mode === 'revision') data.previousVersion = b.chapters[q.index].paragraphs;
  try {
    await save(true);
    if (b.order?.key !== q.key) return;
    const result = await request('chapter', data, q.key);
    finish(b, q, result);
  } catch (e) {
    if (b.order?.key === q.key) {
      q.error = errorText(e);
      await save();
      bookCardIfVisible(b);
      toast('Заказ можно повторить');
    }
  } finally {
    active.delete(q.key);
  }
}
function bookCardIfVisible(b) {
  if (sheet.open && (viewer === b.id || paper.querySelector('h2')?.textContent === b.title)) bookCard(b);
}
function finish(b, q, chapter) {
  if (b.order?.key !== q.key) return;
  const clean = window.ImaginariumSchema.chapter(chapter);
  clean.id = q.key;
  if (q.mode === 'revision') {
    const original = b.chapters[q.index];
    original.editions ||= [];
    original.editions.push(clean);
  } else {
    if (b.chapters.length !== q.index) return;
    b.chapters.push(clean);
    b.complete = q.mode === 'final';
  }
  b.order = null;
  change();
  bookCardIfVisible(b);
  toast(q.mode === 'revision' ? 'Новая редакция готова' : 'Глава готова');
}
export async function recover(b, feedback = false) {
  const q = b.order;
  if (!q) return;
  try {
    const data = await result(q.key);
    if (data) finish(b, q, data);
    else if (feedback) {
      q.error = 'Ответ пока не получен. Можно повторить тот же запрос.';
      save();
      bookCard(b);
    }
  } catch (e) {
    if (feedback) showError(e);
  }
}
export function bindery() {
  open('Переплётная', 'Новая книга');
  const generation = wizardVersion,
    d = (state.draft ||= {});
  let working = false;
  const tone = field('Как должна звучать история?', d.tone || '', 'area');
  tone.input.placeholder = 'Тихая мистика с сухим юмором, действие у моря';
  paper.append(tone.root);
  const seed = field('Завязка', d.premise || '', 'area'),
    title = field('Название', d.title || '');
  const keep = () => {
    d.tone = tone.input.value;
    d.premise = seed.input.value;
    d.title = title.input.value;
    save();
  };
  [tone, seed, title].forEach((f) => (f.input.oninput = keep));
  async function options(task, btn) {
    if (working) return;
    keep();
    if (!d.tone.trim()) return tone.input.focus();
    if (task === 'titles' && !d.premise.trim()) return seed.input.focus();
    working = true;
    btn.disabled = true;
    const before = btn.textContent;
    btn.textContent = 'Автор подбирает…';
    try {
      const list = await request(task, { tone: d.tone, premise: d.premise, title: d.title });
      d[task] = list;
      save();
      if (wizardVersion === generation && sheet.open) bindery();
    } finally {
      working = false;
      btn.disabled = false;
      btn.textContent = before;
    }
  }
  paper.append(row(button('Предложить завязки', (b) => options('seeds', b), 'action')));
  for (const option of d.seeds || [])
    paper.append(
      button(
        option,
        () => {
          seed.input.value = option;
          keep();
          seed.input.focus();
        },
        'choice'
      )
    );
  paper.append(seed.root, row(button('Подобрать названия', (b) => options('titles', b))));
  for (const option of d.titles || [])
    paper.append(
      button(
        option,
        () => {
          title.input.value = option;
          keep();
          title.input.focus();
        },
        'choice'
      )
    );
  paper.append(title.root, el('p', 'muted', 'Ткань переплёта'));
  const palette = el('div', 'palette');
  paper.append(palette);
  swatches.forEach((swatch, i) => {
    const item = button('', () => {
      d.color = swatch;
      save();
      for (const child of palette.children) child.setAttribute('aria-pressed', String(child === item));
    });
    item.style.background = swatch;
    item.setAttribute('aria-label', 'Ткань ' + (i + 1));
    item.setAttribute('aria-pressed', String((d.color || swatches[0]) === swatch));
    palette.append(item);
  });
  paper.append(
    row(
      button(
        'Создать книгу и написать начало',
        async (node) => {
          keep();
          if (!d.tone.trim() || !d.premise.trim() || !d.title.trim())
            throw Error('Укажите тон, завязку и заглавие книги.');
          node.disabled = true;
          const b = {
            id: uid(),
            title: d.title.trim().slice(0, 120),
            premise: d.premise.trim().slice(0, 1600),
            tone: d.tone.trim().slice(0, 700),
            color: d.color || swatches[0],
            chapters: [],
            place: 'bind-table',
            position: Date.now(),
            complete: false,
            bookmark: { chapter: 0, para: 0 },
            marks: [],
            notes: []
          };
          state.books.push(b);
          state.draft = {};
          change();
          await commission(b, 'chapter', '', 'Первая глава');
        },
        'action'
      )
    )
  );
}
