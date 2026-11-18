// Content and stock contracts through the Axiko node harness.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { load, test, done } = require('./support.js');
const x = load();
process.on('exit', () => x.env.close());
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const json = name => JSON.parse(read(name));
const catalog = json('content/catalog.json');
const dictionary = json('i18n-en.json');
const kinds = ['log', 'stars', 'samples', 'events'];
const schemas = {};

function strings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach(item => strings(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => strings(item, out));
  return out;
}

function literals(source) {
  const found = [];
  for (let i = 0; i < source.length; i++) {
    if (source.slice(i, i + 2) === '//') {
      i = source.indexOf('\n', i);
      if (i < 0) break;
      continue;
    }
    if (source.slice(i, i + 2) === '/*') {
      i = source.indexOf('*/', i + 2) + 1;
      continue;
    }
    if (source[i] !== '"' && source[i] !== "'") continue;
    const start = i;
    const quote = source[i];
    for (i++; i < source.length; i++) {
      if (source[i] === '\\') { i++; continue; }
      if (source[i] === quote) break;
    }
    const token = source.slice(start, i + 1);
    if (/[А-Яа-яЁё]/.test(token)) found.push(vm.runInNewContext(token));
  }
  return found;
}

test('complete canonical lists and research prerequisites', () => {
  const sizes = { DRONES: 8, BREAKERS: 3, BUILDINGS: 5, FACILITIES: 5, RESEARCH: 14, EXPEDITIONS: 4, SAMPLES: 12, STARS: 9, META: 7, STATIONS: 5, EVENTS: 15, RESOURCES: 7 };
  for (const [key, count] of Object.entries(sizes)) {
    assert.strictEqual(catalog[key].length, count, key);
    assert.strictEqual(new Set(catalog[key].map(row => row.id)).size, count, key + ' IDs');
    if (x.sim[key]) assert.deepStrictEqual(catalog[key].map(row => row.title), x.sim[key].map(row => row.title), key + ' runtime labels');
  }
  const ids = new Set(catalog.RESEARCH.map(row => row.id));
  const completed = new Set();
  for (let pass = 0; pass < catalog.RESEARCH.length; pass++) {
    catalog.RESEARCH.forEach(row => {
      row.after.forEach(id => assert.ok(ids.has(id), row.id + ' parent ' + id));
      if (row.after.every(id => completed.has(id))) completed.add(row.id);
    });
  }
  assert.strictEqual(completed.size, ids.size, 'research graph is acyclic');
  assert.deepStrictEqual(catalog.RESEARCH.filter(row => row.cur === 'ore').map(row => row.id), ['grab', 'smelt', 'ice']);
  assert.ok(catalog.STAR_CYCLE.description);
});

test('all four stock prompts have engine schemas and valid built-in content', () => {
  assert.deepStrictEqual(x.game.stock.map(row => row.kind).sort(), kinds.slice().sort());
  let count = 0;
  for (const kind of kinds) {
    const declaration = x.game.stock.find(row => row.kind === kind);
    const schema = x.Core.stock.schema(read(declaration.prompt));
    assert.ifError(schema.error);
    assert.strictEqual(schema.key, 'text', kind + ' text deduplication');
    assert.ok(Object.keys(schema.fields).length >= 2, kind + ' schema fields');
    schemas[kind] = schema;
    const seen = {};
    const entries = json('content/' + kind + '.json');
    for (const item of entries) {
      assert.strictEqual(x.Core.stock.check(item, schema, seen, x.sim, kind), null, kind + ': ' + item.text);
      seen[x.Core.stock.norm(item.text)] = true;
      count++;
    }
  }
  console.log('  Built-in stock entries: ' + count);
});

test('all stock kinds have valid deterministic offline fallback', () => {
  for (const kind of kinds) {
    const schema = schemas[kind] || x.Core.stock.schema(read('prompts/' + kind + '.md'));
    const a = x.Rng.make(91);
    const b = x.Rng.make(91);
    for (let i = 0; i < 64; i++) {
      const item = x.sim.procedural(kind, a);
      assert.deepStrictEqual(item, x.sim.procedural(kind, b), kind + ' reproducible fallback');
      assert.strictEqual(x.Core.stock.check(item, schema, {}, x.sim, kind), null, kind + ': ' + JSON.stringify(item));
    }
  }
});

test('stock rejects malformed items and unknown or mismatched canonical IDs', () => {
  for (const kind of kinds) {
    const schema = schemas[kind] || x.Core.stock.schema(read('prompts/' + kind + '.md'));
    const item = json('content/' + kind + '.json')[0];
    for (const bad of [null, [], {}, { ...item, text: '' }, { ...item, text: 'x'.repeat(300) }]) {
      assert.ok(x.Core.stock.check(bad, schema, {}, x.sim, kind), kind + ' rejected malformed item');
    }
    const network = { ...item, text: 'Read ' + 'https' + '://example.invalid/story for this record.' };
    assert.ok(x.Core.stock.check(network, schema, {}, x.sim, kind), kind + ' network rejected');
    assert.ok(x.Core.stock.check({ ...item, text: item.text + String.fromCodePoint(0x1f680) }, schema, {}, x.sim, kind), kind + ' emoji rejected');
    if (kind !== 'log') {
      assert.ok(x.sim.validateStock(kind, { ...item, id: 'unknown' }), kind + ' unknown ID');
      const other = json('content/' + kind + '.json')[1];
      assert.ok(x.sim.validateStock(kind, { ...item, title: other.title }), kind + ' mismatched title');
    }
  }
});

test('content is local, plain data, without emoji or invalid numeric values', () => {
  for (const name of ['catalog', ...kinds]) {
    const source = read('content/' + name + '.json');
    const value = JSON.parse(source);
    assert.ok(!/NaN|Infinity/.test(source));
    assert.ok(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(source));
    assert.deepStrictEqual(x.Core.offlineScan([{ path: 'content/' + name + '.json', text: source }]), []);
    assert.ok(strings(value).length > 0);
  }
});

test('English dictionary covers the catalog, stock, manifest, settings and UI', () => {
  assert.ok(Object.keys(dictionary).length >= 500);
  for (const [source, translated] of Object.entries(dictionary)) {
    assert.ok(source.length > 0 && typeof translated === 'string' && translated.length > 0);
    assert.ok(!/[А-Яа-яЁё]/.test(translated), 'untranslated value: ' + source);
  }
  const all = strings(catalog).concat(strings(x.game));
  kinds.forEach(kind => strings(json('content/' + kind + '.json'), all));
  for (const spec of Object.values(json('config.json'))) {
    if (spec.title) all.push(spec.title);
    if (spec.group) all.push(spec.group);
  }
  all.push(...literals(read('ui/game.js')));
  const missing = [...new Set(all.filter(text => /[А-Яа-яЁё]/.test(text) && !dictionary[text]))];
  assert.ok(missing.length === 0, 'Missing English entries: ' + JSON.stringify(missing));
});

done('asteroid-colony content');
