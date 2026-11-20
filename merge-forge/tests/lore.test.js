// The stories of the blades: the 40 named levels have a theme, a phrase and a story in both languages,
// and the artist is asked for a story and keeps it. node tests/lore.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { test, done, GAME } = require('./env');

const read = (f) => fs.readFileSync(path.join(GAME, f), 'utf8');
const blades = JSON.parse(read('content/blades.json'));
const en = JSON.parse(read('i18n-en.json'));

test('у каждого из 40 клинков есть тема, фраза и история — и их перевод', () => {
  assert.strictEqual(blades.list.length, 40);
  for (const b of blades.list) {
    for (const f of ['theme', 'text', 'lore']) {
      assert.ok(typeof b[f] === 'string' && b[f].trim(), b.level + ': нет ' + f);
      assert.ok(en[b[f]], b.level + ': нет перевода ' + f);
    }
    assert.ok(b.text.length <= 100 && !/\.$/.test(b.text), b.level + ': фраза до 100 знаков, без точки');
    assert.ok(b.lore.length >= 20 && b.lore.length <= 420, b.level + ': история 20–420 знаков');
  }
});

test('художник пишет историю и движок её хранит', () => {
  const prompt = read('prompts/blades.md');
  const schema = JSON.parse(prompt.slice(prompt.indexOf('```schema') + 9, prompt.lastIndexOf('```')));
  assert.ok(schema.fields.lore, 'в схеме ответа нет истории');
  assert.ok(/история/.test(prompt));
  const game = JSON.parse(read('game.json'));
  const decl = game.stock.find((d) => d.kind === 'blades');
  assert.deepStrictEqual(decl.artist.keep, ['title', 'text', 'theme', 'lore', 'svg']);
});

done('lore');
