// The model's artist of the blades (game.json "artist", the engine's series): the bases of every
// level, the real prompt the stock sends, a drawn blade checked by the prompt's schema, taking it
// on the screen. node tests/art.test.js
'use strict';
const assert = require('assert');
const { open, ID, test, done } = require('./env');

const x = open();
const env = x.env;
const main = env.require('modules/games/main.js');
const content = env.files.readJson('modules/games/' + ID + '/content/blades.json');

const DRAWN = '<svg viewBox="0 0 64 64"><defs><linearGradient id="b"><stop offset="0" stop-color="#ffd27a"/><stop offset="1" stop-color="#e05a2a">' +
  '<animate attributeName="stop-color" values="#e05a2a;#ffb347;#e05a2a" dur="2.5s" repeatCount="indefinite"/></stop></linearGradient>' +
  '<filter id="g"><feGaussianBlur stdDeviation="1.5" result="s"/><feMerge><feMergeNode in="s"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
  '<g transform="rotate(45 32 32)"><path d="M28 44V8l4-5 4 5v36z" fill="url(#b)" stroke="#2a1a10" stroke-width="2" filter="url(#g)"/>' +
  '<rect x="22" y="43" width="20" height="4" fill="#5a3a20"/><rect x="30" y="47" width="4" height="10" fill="#8a6a4a"/></g>' +
  '<circle cx="44" cy="20" r="2" fill="#ffffff"><animate attributeName="opacity" values="0;1;0" dur="1.8s" repeatCount="indefinite"/></circle></svg>';

test('база есть у любого уровня: имя у первых 40, дальше форма по кругу и новый цвет', () => {
  const b1 = x.sim.artBase(1, content);
  assert.strictEqual(b1.title, content.list[0].title);
  assert.ok(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 64 64">/.test(b1.svg));
  const a = x.sim.artBase(41, content);
  const b = x.sim.artBase(42, content);
  assert.strictEqual(a.title, null);
  assert.notStrictEqual(a.svg, b.svg);
  assert.ok(x.sim.artBase(100000, content).svg.length > 100);
});

test('настоящий промпт: темы не обязательно серьёзные, уровни с базами, правила анимации', () => {
  const stock = env.require('modules/games/stock.js');
  let hub = null;
  const passenger = env.require('modules/games/links/passenger.js');
  const orig = passenger.status;
  passenger.status = (h, c, g) => {
    hub = h;
    return orig(h, c, g);
  };
  main.links(ID);
  passenger.status = orig;
  let req = null;
  env.shell.ai = (r) => {
    req = r;
    return [
      { level: 1, title: content.list[0].title, text: 'Рыбья чешуя вместо клинка', theme: 'рыбный', svg: DRAWN },
      { level: 2, title: 'Что угодно', text: 'Сучки и смола на лезвии', theme: 'деревянный', svg: DRAWN.replace('#ffd27a', '#c8a060') },
      { level: 3, title: 'Без рисунка', text: 'Рисунка нет совсем', svg: '' },
      { level: 4, title: 'Кривой', text: 'Нарисован сразу по диагонали', theme: 'кривой', svg: '<svg viewBox="0 0 64 64"><path d="M12 52L48 16l4 4-36 36z" fill="#aaaaaa"/></svg>' }
    ];
  };
  const r = stock.fill(hub, main.game(ID), 'blades', {});
  env.shell.ai = null;
  assert.ok(/рыбный/.test(req.prompt) && /Отсылки — это здорово/.test(req.prompt), 'темы и отсылки в промпте');
  assert.ok(/можно отсылки к известным фильмам/.test(req.system) && !/только оригинальное/.test(req.system), 'правило оригинальности снято');
  assert.ok(/Уровень 1 — «/.test(req.prompt) && /База: <svg/.test(req.prompt), req.prompt.slice(0, 400));
  assert.ok(/Можно оживить/.test(req.system) && /Можно свечение/.test(req.system));
  assert.strictEqual(r.added, 2, JSON.stringify(r));
  assert.strictEqual(r.rejected, 2, 'без рисунка и без поворотной группы');
  assert.ok(req.prompt.indexOf('<g transform="rotate(45 32 32)"><g transform="scale(1.6)">') >= 0, 'база в той же раскладке');
});

test('экран забирает рисунки увиденных уровней; имя первых 40 — из content', () => {
  const r = main.seriesSync(ID, 'blades', 2, [1, 2]);
  assert.strictEqual(r.on, true);
  assert.strictEqual(r.items[1].theme, 'рыбный');
  assert.strictEqual(r.items[2].title, content.list[1].title);
  assert.ok(/<filter id="g">/.test(r.items[1].svg) && /<animate/.test(r.items[1].svg));
});

done('art');
