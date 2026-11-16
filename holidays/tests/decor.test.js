// node tests/decor.test.js — what the day looks like and the CSS that draws it.
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var calendar = require('../calendar.js');
var decor = require('../decor.js');
var occasions = require('../occasions.json');
var t = require('./harness.js');

var files = {};
fs.readdirSync(path.join(__dirname, '..', 'decor')).forEach(function (name) {
  if (/\.css$/.test(name)) files[name.replace(/\.css$/, '')] = fs.readFileSync(path.join(__dirname, '..', 'decor', name), 'utf8');
});
var known = Object.keys(files).concat(['confetti']);
var off = require('../settings.js').OFF_BY_DEFAULT;
var enabled = occasions.filter(function (occasion) { return off.indexOf(occasion.id) < 0; });

// As main.js does it: the occasions the owner left on (the defaults here), then the plan.
function planFor(day, options, ctx) {
  var settings = { strength: 'full', powerSave: 'color', confetti: false, known: known };
  Object.keys(options || {}).forEach(function (key) { settings[key] = options[key]; });
  return decor.plan(calendar.activeOn(enabled, day, ctx || {}), settings);
}

t.test('каждое украшение из occasions.json есть в decor/ или рисуется кодом', function () {
  occasions.forEach(function (occasion) {
    [].concat(occasion.decor || []).concat(occasion.egg || []).forEach(function (name) {
      if (name === 'joke') return;
      assert.ok(decor.DECORS[name], occasion.id + ': ' + name + ' не описан в DECORS');
      if (!decor.DECORS[name].generated) assert.ok(files[name], occasion.id + ': нет decor/' + name + '.css');
    });
  });
});

t.test('20 декабря: снег и новогодний цвет, без гирлянды', function () {
  var plan = planFor('2026-12-20');
  assert.strictEqual(plan.id, 'new-year');
  assert.strictEqual(plan.key, 'new-year@2026-12-31');
  assert.strictEqual(plan.accent, '#7FB8FF');
  assert.deepStrictEqual(plan.layers, ['snow']);
  assert.deepStrictEqual(plan.eggs, []);
});

t.test('31 декабря: снег, гирлянда и искры', function () {
  var plan = planFor('2026-12-31');
  assert.deepStrictEqual(plan.layers, ['snow']);
  assert.deepStrictEqual(plan.eggs, ['garland', 'sparks']);
});

t.test('7 января: снег Нового года и звезда Рождества', function () {
  var plan = planFor('2027-01-07');
  assert.strictEqual(plan.id, 'new-year');
  assert.deepStrictEqual(plan.layers, ['snow']);
  assert.deepStrictEqual(plan.eggs, ['home-star']);
});

t.test('9 января: ничего', function () {
  assert.strictEqual(planFor('2027-01-09'), null);
});

t.test('сила «только цвет» и режим энергосбережения', function () {
  var color = planFor('2026-12-31', { strength: 'color' });
  assert.deepStrictEqual([color.layers, color.eggs, color.accent], [[], [], '#7FB8FF']);
  var saving = planFor('2026-12-31', { powerSaveMode: true, powerSave: 'color' });
  assert.deepStrictEqual(saving.layers, []);
  assert.strictEqual(planFor('2026-12-31', { strength: 'off' }), null);
  assert.strictEqual(planFor('2026-12-31', { powerSaveMode: true, powerSave: 'off' }), null);
});

t.test('9 мая: только цвет, без игривого', function () {
  var plan = planFor('2026-05-09');
  assert.strictEqual(plan.id, 'victory-day');
  assert.strictEqual(plan.solemn, true);
  assert.deepStrictEqual([plan.layers, plan.eggs], [[], []]);
});

t.test('1 апреля и 1 сентября оформление не меняют', function () {
  assert.strictEqual(planFor('2027-04-01'), null);
  assert.strictEqual(planFor('2026-09-01'), null);
});

t.test('день рождения владельца: конфетти только в разрешённые минуты', function () {
  var ctx = { owner: { year: 1990, month: 6, day: 20 } };
  assert.deepStrictEqual(planFor('2026-06-20', { confetti: false }, ctx).layers, []);
  var plan = planFor('2026-06-20', { confetti: true }, ctx);
  assert.strictEqual(plan.id, 'birthday-owner');
  assert.deepStrictEqual(plan.layers, ['confetti']);
});

t.test('первый снег без согласия — не надевается', function () {
  var ctx = { weather: { snow: { day: '2026-11-03', accepted: null } }, weatherDays: 3 };
  assert.strictEqual(planFor('2026-11-04', {}, ctx), null);
  ctx.weather.snow.accepted = true;
  assert.deepStrictEqual(planFor('2026-11-04', {}, ctx).layers, ['snow']);
});

t.test('у повода без вида главным становится тот, что меняет вид', function () {
  var ctx = { people: [{ id: '5', name: 'Аня', birthday: { year: 1990, month: 10, day: 30 }, close: true }] };
  var plan = planFor('2026-10-30', {}, ctx);
  assert.strictEqual(plan.id, 'halloween');
});

t.test('цвета акцента подобраны к фону', function () {
  var tokens = decor.accentTokens('#7FB8FF', '#101010');
  assert.strictEqual(tokens.accent, '#7FB8FF');
  assert.strictEqual(tokens['accent-ink'], '#0F0E17');
  assert.strictEqual(tokens['accent-soft'], decor.mix('#7FB8FF', '#101010', 0.2));
  assert.strictEqual(decor.accentTokens('#3A2A8F', '#000000')['accent-ink'], '#FFFFFF');
  assert.deepStrictEqual(decor.accentTokens('red', '#000'), {});
});

t.test('картинки в CSS: без ";" и "#", цвет вписан из токенов', function () {
  var url = decor.svgUrl('pumpkin', '#FF8A3D');
  assert.ok(url.indexOf(';') < 0);
  assert.ok(url.indexOf('#') < 0);
  assert.ok(url.indexOf('%23FF8A3D') > 0);
  var css = decor.render('a { background: svg(star, accent, .5); }', { accent: '#E8C468' });
  assert.ok(css.indexOf('svg(') < 0);
  assert.ok(css.indexOf('%23E8C468') > 0);
  assert.ok(css.indexOf('stroke-opacity') > 0);
  assert.ok(decor.render('a { background: svg(star, accent); }', { accent: '"><script>' }).indexOf('script') < 0, 'чужое значение токена не попадает в картинку');
});

t.test('CSS декора: слой, токены, движение по настройке, reduced-motion, без теней', function () {
  var plan = planFor('2026-12-31');
  var css = decor.css(plan, { files: files, tokens: { bg: '#000000' }, motionSeconds: 6, withAccent: true });
  assert.ok(css.indexOf('/* holidays: new-year@2026-12-31 */') === 0);
  assert.ok(css.indexOf('--accent: #7FB8FF;') > 0);
  assert.ok(css.indexOf('--holiday-motion: 6s;') > 0);
  assert.ok(css.indexOf('@media (prefers-reduced-motion: reduce)') > 0);
  assert.ok(/body::before[^{]*\{\s*animation: none !important/.test(css.slice(css.indexOf('@media (prefers-reduced-motion'))));
  assert.ok(css.indexOf('.btn:active::after') > 0);
  assert.ok(css.indexOf('box-shadow') < 0);
  assert.ok(css.indexOf('pointer-events: none') > 0);
  assert.ok(css.indexOf('svg(') < 0);
  var themed = decor.css(plan, { files: files, tokens: {}, withAccent: false });
  assert.ok(themed.indexOf('--accent:') < 0, 'в теме акцент идёт в токены, а не в css');
});

t.test('ни в одном файле декора нет теней и эмодзи, у движения есть место в reduced-motion', function () {
  Object.keys(files).forEach(function (name) {
    var text = files[name];
    assert.ok(text.indexOf('box-shadow') < 0 && text.indexOf('text-shadow') < 0 && text.indexOf('drop-shadow') < 0, name + ': тень');
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text), name + ': эмодзи');
    if (/animation:/.test(text) && !/\.(btn|card):active/.test(text)) {
      var hooks = (decor.DECORS[name].animated || []).concat(decor.DECORS[name].transient || []);
      assert.ok(hooks.length > 0, name + ': движется, но не описан в DECORS');
    }
  });
});

t.test('конфетти: столько кусочков, сколько в настройке, исчезает в конце', function () {
  var css = decor.confetti(30, 42);
  assert.strictEqual((css.match(/linear-gradient\(/g) || []).length, 30);
  assert.ok(css.indexOf('var(--holiday-confetti)') > 0);
  assert.ok(/to \{[^}]*opacity: 0/.test(css));
  assert.strictEqual(decor.confetti(30, 42), css, 'тот же день — те же конфетти');
  var plan = { key: 'birthday-owner@2026-06-20', layers: ['confetti'], eggs: [], accent: '#FFB86B' };
  var full = decor.css(plan, { files: files, confettiPieces: 12, confettiSeconds: 4 });
  assert.strictEqual((full.match(/linear-gradient\(/g) || []).length, 12);
  assert.ok(/body::after \{\s*display: none !important/.test(full.slice(full.indexOf('@media (prefers-reduced-motion'))));
});

t.test('праздничная тема: токены владельца + акцент, его css сохранён, предыдущая тема записана', function () {
  var base = { id: 'midnight', tokens: { bg: '#000000', surface: '#0E0E0E', accent: '#8B7CFF' }, css: '.card { border-radius: 4px; }' };
  var plan = planFor('2026-12-20');
  var css = decor.css(plan, { files: files, tokens: base.tokens });
  var theme = decor.theme(base, plan, css, 'midnight');
  assert.strictEqual(theme.name, 'Праздник: Новый год');
  assert.strictEqual(theme.tokens.bg, '#000000');
  assert.strictEqual(theme.tokens.surface, '#0E0E0E');
  assert.strictEqual(theme.tokens.accent, '#7FB8FF');
  assert.strictEqual(theme.tokens['accent-soft'], decor.mix('#7FB8FF', '#000000', 0.2));
  assert.ok(theme.css.indexOf('.card { border-radius: 4px; }') === 0);
  assert.ok(theme.css.indexOf('/* snow */') > 0);
  assert.strictEqual(theme.previous, 'midnight');
  assert.strictEqual(base.tokens.accent, '#8B7CFF', 'тема владельца не испорчена');
});

t.test('описание для экрана', function () {
  assert.strictEqual(decor.describe(planFor('2026-12-31')), 'праздничный цвет, тихий снег, гирлянда в шапке, искры от кнопок');
  assert.strictEqual(decor.describe(null), '');
});

t.test('поля частиц нерегулярны, ограничены и меняются с днём, без повторяющихся плиток', function () {
  ['snow', 'stars', 'petals', 'leaves', 'fireflies', 'aurora', 'meteors', 'garland'].forEach(function (name) {
    var one = decor.render(files[name], {}, { seed: 123, particleCount: 24 });
    assert.strictEqual(one, decor.render(files[name], {}, { seed: 123, particleCount: 24 }));
    assert.notStrictEqual(one, decor.render(files[name], {}, { seed: 124, particleCount: 24 }));
    assert.ok(!/scatter\(/.test(one), name + ': шаблон не заменён');
    assert.ok(/no-repeat/.test(one), name + ': повторяющееся поле');
    assert.ok(!/background-position:|background-size:.*\d+px|steps\(/.test(one), name + ': перерисовка или сетка');
  });
  var svg = decodeURIComponent(decor.scatter('snow', 123, 100000, {}).slice(24, -2));
  assert.strictEqual((svg.match(/<g /g) || []).length, 56, 'плотность ограничена даже при неверных настройках');
  var points = Array.from(svg.matchAll(/translate\((\d+) (\d+)\)/g)).map(function (match) { return match[1] + ',' + match[2]; });
  assert.strictEqual(new Set(points).size, points.length);
});

t.test('каждый новый эффект отключает движение, ноль также останавливает отклик кнопок', function () {
  ['petals', 'leaves', 'fireflies', 'aurora', 'meteors'].forEach(function (name) {
    var css = decor.css({ key: 'test', layers: [name], eggs: [] }, { files: files, seed: 9 });
    assert.ok(css.indexOf('animation: none !important') > 0, name);
    assert.ok(!/infinite|filter:|box-shadow/.test(css));
  });
  var off = decor.css({ key: 'test', layers: ['snow'], eggs: ['sparks'] }, { files: files, motionSeconds: 0 });
  assert.ok(/@media all/.test(off));
  assert.ok(/transform: translate3d/.test(decor.confetti(30, 1)));
  assert.strictEqual((decor.confetti(99999, 1).match(/linear-gradient\(/g) || []).length, 80);
});

t.done('decor');
