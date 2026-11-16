// Checks of the pet on the phone (module_check). Every check puts back what it changes.
var assi = require('lib/assi');
var MAIN = 'modules/pet/main.js';
var SCREEN = 'modules/pet/ui/index.html';

function pet() {
  return require(MAIN);
}

/** A health.today()-like day for the stub: a good one by default, at hh:mm. */
function day(hm, patch) {
  var m = /^(\d+):(\d+)$/.exec(hm);
  var goals = { stepsGoal: 8000, sleepGoal: 450, waterGoal: 2000, glassMl: 250, dayEnd: '05:00', nightStart: '00:30', nightEnd: '05:00' };
  var out = {
    date: '2001-01-03', hour: Number(m[1]), minute: Number(m[1]) * 60 + Number(m[2]), night: false, screenOn: true,
    known: { sleep: true, steps: true, screen: true }, sleepMin: 460, steps: 8000, stepsGoal: 8000, sleepGoal: 450,
    prevLateMin: 0, prevKnownScreen: true, habitsDue: 0, habitsDone: 0, medsDue: 0, medsTaken: 0, waterMl: 2000, waterGoal: 2000,
    newPlaces: 0, left: [], paused: null, goals: goals
  };
  Object.keys(patch || {}).forEach(function (key) { out[key] = patch[key]; });
  return out;
}

/** Keeps data/pet/<name> as it was. */
function keeping(names, fn) {
  var saved = {};
  names.forEach(function (name) {
    var path = 'data/pet/' + name;
    saved[path] = assi.files.exists(path) ? assi.files.read(path) : null;
  });
  try {
    return fn();
  } finally {
    Object.keys(saved).forEach(function (path) {
      if (saved[path] === null) {
        if (assi.files.exists(path)) assi.files.remove(path);
      } else {
        assi.files.write(path, saved[path]);
      }
    });
  }
}

exports['настроение: сценарий описания — короткая ночь, потом 3 000 шагов'] = function (t) {
  var p = pet();
  var morning = p.preview(day('09:30', { sleepMin: 300, prevLateMin: 60, steps: 400 }));
  t.equal(morning.state, 'unrested', 'сон 300 мин и 60 мин ночью');
  var walked = p.preview(day('09:30', { sleepMin: 300, prevLateMin: 60, steps: 3000 }));
  t.ok(walked.state !== 'unrested', 'после 3 000 шагов всё ещё «невыспавшийся»');
  t.ok(morning.why.length >= 4, 'в «Почему так» мало строк');
};

exports['настроение: пауза, ночь, мало данных'] = function (t) {
  var p = pet();
  t.equal(p.preview(day('11:00', { paused: 'sick' })).state, 'blanket', 'пауза «болею»');
  t.equal(p.preview(day('11:00', { paused: 'vacation' })).state, 'vacation', 'пауза «отпуск»');
  t.equal(p.preview(day('01:30', { night: true, screenOn: false })).state, 'asleep', 'ночь, экран выключен');
  var night = p.preview(day('01:30', { night: true, screenOn: true }));
  t.ok(night.state === 'woken' || (night.state === 'asleep' && p.settings().nightWoken === false), 'ночь с телефоном в руках: ' + night.state);
  t.equal(p.preview(day('15:00', { known: {}, prevKnownScreen: false })).state, 'calm', 'без данных');
};

exports['фразы: все шаблоны проходят фильтр слов'] = function (t) {
  var Phrases = require('modules/pet/phrases.js');
  var banned = pet().settings().banned;
  var book = assi.files.readJson('modules/pet/phrases.json', {});
  var own = assi.files.readJson('data/pet/phrases.json', null);
  [book, own || {}].forEach(function (b, i) {
    Object.keys(b).forEach(function (kind) {
      (b[kind] || []).forEach(function (text) {
        var filled = Phrases.fill(text, { name: 'Листик', title: 'Проверка' });
        t.ok(Phrases.clean(filled, banned), (i ? 'data/pet/phrases.json' : 'phrases.json') + ', ' + kind + ': «' + filled + '»');
      });
    });
  });
  require('modules/pet/mood.js').STATES.forEach(function (s) {
    t.ok((book[s.id] || []).length >= 5, 'мало фраз для ' + s.id);
  });
};

exports['состояние: пересчёт пишет state.json и строку истории'] = function (t) {
  var st = pet().recompute();
  t.ok(require('modules/pet/mood.js').STATES.some(function (s) { return s.id === st.state; }), 'неизвестное состояние ' + st.state);
  t.ok(typeof st.phrase === 'string' && st.phrase.length > 0, 'нет фразы');
  t.ok(assi.files.exists('data/pet/state.json'), 'нет state.json');
  var history = assi.files.readJson('data/pet/history.json', []);
  t.ok(history.length > 0 && history[history.length - 1].date === st.date, 'нет строки истории за ' + st.date);
  var settings = assi.files.readJson('data/pet/settings.json', {});
  t.ok(typeof settings.name === 'string' && settings.palette && Array.isArray(settings.stages), 'Жизнь-RPG не найдёт имя, палитру и пороги');
};

exports['рисунок: все 12 состояний в SVG и в Canvas'] = function (t) {
  var p = pet();
  require('modules/pet/mood.js').STATES.forEach(function (s) {
    var svg = p.svg({ state: s.id, room: true });
    t.ok(svg.indexOf('<svg') === 0 && svg.indexOf('NaN') < 0, 'SVG ' + s.id);
    var png = p.png({ state: s.id, size: 96 });
    t.ok(png.indexOf('data:image/png;base64,') === 0 && png.length > 400, 'PNG ' + s.id);
  });
};

exports['виджет: две строки и картинка'] = function (t) {
  var had = assi.files.exists('data/pet/widget.png');
  try {
    var w = pet().widget();
    t.ok(w.title.indexOf(' · ') > 0, 'заголовок: ' + w.title);
    t.ok(/^Энергия /.test(w.text), 'текст: ' + w.text);
    t.ok(w.open === SCREEN, 'открывает не комнату');
    var path = pet().drawWidget();
    t.ok(assi.files.exists(path), 'картинка не нарисовалась');
    var size = new java.io.File(assi.files.path(path)).length();
    t.ok(size > 1000, 'картинка подозрительно мала: ' + size);
  } finally {
    // The picture is drawn again from the state in force, or taken away when there was none.
    if (!had && assi.files.exists('data/pet/widget.png')) assi.files.remove('data/pet/widget.png');
  }
};

exports['вещи: дать, надеть, снять, одна вещь на место'] = function (t) {
  var p = pet();
  var a = 'check-hat-' + Date.now();
  var b = a + '-2';
  keeping(['items.json', 'state.json'], function () {
    try {
      t.equal(p.give({ id: a, from: 'check', slot: 'head', worn: false }).already, false, 'первая выдача');
      t.equal(p.give({ id: a, from: 'check', slot: 'head' }).already, true, 'вторая выдача той же вещи');
      p.addItem({ id: b, from: 'check', slot: 'head', worn: false });
      p.wear(a, true);
      p.wear(b, true);
      var items = p.items();
      var first = items.filter(function (x) { return x.id === a; })[0];
      var second = items.filter(function (x) { return x.id === b; })[0];
      t.ok(first && !first.worn && second && second.worn, 'на голове две вещи сразу');
      t.ok(p.look('calm').items.some(function (x) { return x.id === b; }), 'надетой вещи нет в облике');
    } finally {
      p._drop(a);
      p._drop(b);
    }
  });
};

exports['праздники: уровень и ачивка'] = function (t) {
  var p = pet();
  keeping(['state.json', 'items.json'], function () {
    p.celebrate('achievement', { id: 'check', title: 'Проверка', rarity: 'rare' });
    t.ok(p.look('calm').extras.indexOf('badge') >= 0, 'не держит значок');
    var held = p.seen();
    t.ok(held !== null, 'seen() не вернул значок');
    t.ok(p.look('calm').extras.indexOf('badge') < 0, 'значок остался в руках');
    if (p.settings().shelfFrom !== 'off') {
      var placed = p.items().filter(function (x) { return x.id === held.shelf; })[0];
      t.ok(placed && placed.slot === 'shelf' && placed.rarity === 'rare', 'редкий значок не встал на полку');
    }
    p.celebrate('level', { level: 7 });
    t.ok(p.look('calm').extras.indexOf('party') >= 0, 'нет праздника');
    t.throws(function () { p.celebrate('nope', {}); }, 'неизвестный праздник принят');
  });
  pet().recompute();
};

exports['соседи: Фокус, Тайная жизнь телефона, Игротека — с ними и без них'] = function (t) {
  var p = pet();
  var st = p.recompute();
  var focus = assi.files.exists('modules/focus/main.js') ? require('modules/focus/main.js').left() : null;
  if (focus && focus.running && focus.kind !== 'break' && p.settings().focusOn) t.equal(st.state, 'calm', 'идёт Фокус, а он не спокоен');
  else t.ok(!st.focus, 'Фокуса нет, а он «на сессии»');
  if (!assi.files.exists('modules/phone-night/main.js')) t.ok(st.lateSource !== 'phone-night', 'ночь из модуля, которого нет');
  if (!assi.files.exists('modules/games/main.js')) t.equal(st.playMin || 0, 0, 'игры без Игротеки');
  t.ok(p.status().phoneNight === assi.files.exists('modules/phone-night/main.js'), 'status() не знает о Тайной жизни телефона');
};

exports['крючки: life.mark, life.place и life.day подключены'] = function (t) {
  if (!assi.files.exists('modules/health/main.js')) t.skip('модуля «Здоровье» нет');
  var hooks = require('modules/health/main.js').hooks();
  ['life.mark', 'life.place', 'life.day'].forEach(function (event) {
    t.ok(hooks.some(function (x) { return x.event === event && x.path === MAIN; }), 'нет крючка ' + event);
  });
  keeping(['state.json'], function () {
    t.equal(pet().onMark({ type: 'water', amount: 250, at: Date.now() }), 'water', 'реакция на воду');
    t.ok(pet().view({ quiet: true }).reaction.kind === 'water', 'реакции нет в виде');
  });
  pet().recompute();
};

exports['инструмент pet_state на месте и отвечает'] = function (t) {
  t.ok(assi.files.exists('tools/pet_state.js'), 'нет tools/pet_state.js');
  var text = pet().tool();
  t.ok(text.indexOf(pet().settings().name) === 0, 'ответ без имени: ' + text);
};

exports['экран: комната, вкладки и отладка'] = function (t) {
  var page = t.screen(SCREEN);
  t.wait(800);
  t.ok(page.count('#room svg') === 1, 'в комнате нет существа');
  t.ok(String(page.text('#state')).length > 0, 'нет строки состояния');
  t.ok(page.count('.why-line') >= 4, 'нет карточки «Почему так»');
  t.ok(page.count('.strip .day') >= 7, 'нет полосы настроений');
  page.click('[data-id="debug"]');
  t.wait(600);
  page.click('[data-state="asleep"]');
  t.wait(1200);
  t.ok(page.count('.compare svg') === 1 && page.count('.compare img') === 1, 'нет сравнения SVG и Canvas');
  page.click('[data-id="now"]');
};
