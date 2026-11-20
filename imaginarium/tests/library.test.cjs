'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm');
const schema = require('../ui/schema.js');
const chapter = schema.chapter({
  title: 'Отлив',
  paragraphs: [
    'Сестра оставила латунный ключ в запертом шкафчике на пристани, пока почтальон смотрел в другую сторону.'
  ],
  facts: ['Ключ у сестры. Почтальон этого не знает.'],
  threads: ['Ключ от второго замка']
});
const history = {
  chapters: Array.from({ length: 20 }, (_, i) =>
    i === 2
      ? chapter
      : { ...chapter, paragraphs: ['Солнце выглянуло над короткой тихой улицей.'], facts: [], threads: [] }
  )
};
assert.match(schema.memory(history, 'латунный ключ', 20).sources[0].text, /Сестра/);
assert.ok(!schema.memory({ chapters: [] }, 'ключ', 0).sources.length);
const base = {
  name: 'Вещь',
  parts: [
    {
      type: 'mesh',
      points: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0]
      ],
      faces: [[0, 1, 2]]
    },
    {
      type: 'curve',
      points: [
        [0, 0, 0],
        [1, 1, 0]
      ],
      radius: 0.06
    }
  ]
};
assert.equal(schema.shape(base).parts[0].faces.length, 1);
const turned = schema.shape({
  parts: [
    {
      type: 'profile',
      profile: [
        [-0.5, 0.23],
        [-0.25, 0.32],
        [0.18, 0.13],
        [0.5, 0.2]
      ],
      material: 'porcelain'
    }
  ]
});
assert.equal(turned.parts[0].profile.length, 4);
assert.throws(() =>
  schema.shape({
    parts: [
      {
        type: 'profile',
        profile: [
          [0.3, 0.1],
          [-0.3, 0.12]
        ]
      }
    ]
  })
);
assert.throws(() => schema.shape({ ...base, parts: [{ ...base.parts[0], faces: [[0, 1, 3]] }] }));
assert.throws(() => schema.shape({ parts: [{ type: 'script', value: 'anything' }] }));
assert.throws(() => schema.shape({ parts: Array(65).fill({ type: 'box' }) }));
function native() {
  const files = new Map(),
    calls = [],
    registry = {};
  class Lock {
    lock() {}
    unlock() {}
  }
  class File {
    constructor(s) {
      this.path = s;
    }
    toPath() {
      return this.path;
    }
  }
  const context = {
    global: registry,
    java: {
      util: { concurrent: { locks: { ReentrantLock: Lock } } },
      io: { File },
      nio: {
        file: {
          StandardCopyOption: {},
          Files: {
            move: (old, dest) => {
              files.set(dest, files.get(old));
              files.delete(old);
            }
          }
        }
      }
    },
    exports: {},
    require(id) {
      if (id === 'lib/axiko')
        return {
          files: {
            path: (s) => s,
            exists: (s) => files.has(s),
            read: (s) => files.get(s),
            write: (s, v) => files.set(s, v)
          }
        };
      if (id === 'lib/ai')
        return {
          complete: (role, body) => {
            calls.push({ role, body });
            return {
              choices: [{ message: { content: JSON.stringify(role.endsWith('form') ? base : chapter) } }]
            };
          }
        };
      return schema;
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8'), context);
  return { api: context.exports, calls };
}
const { api, calls } = native();
const shape = api.generate('first-id-0', 'shape', { description: 'фантастическая форма' });
assert.equal(shape.name, 'Вещь');
api.generate('first-id-0', 'shape', { description: 'повтор' });
assert.equal(calls.length, 1);
const fixed = api.generate('second-id-0', 'chapter', { title: 'Отлив', tone: 'тихий рассказ' });
assert.equal(fixed.title, 'Отлив');
assert.equal(calls.at(-1).role, 'imaginarium.write');
assert.throws(() => api.generate('../invalid', 'chapter', {}));
assert.equal(api.result('unused-id-0'), null);
const state = { version: 1, books: [], objects: [] };
assert.equal(api.save(0, state), 1);
assert.equal(api.load().revision, 1);
assert.throws(() => api.save(0, state));
console.log(
  'Imaginarium: known facts, data-only meshes, canonical model roles, duplicate receipts and revision conflicts OK'
);
