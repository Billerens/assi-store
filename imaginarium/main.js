'use strict';
var axiko = require('lib/axiko');
var schema = require('./ui/schema.js');
var folder = 'data/imaginarium/';
var savePath = folder + 'library.json';
// The module loader serializes initial evaluation. Keep guards across hot reloads.
var guards =
  global.__imaginariumGuards ||
  (global.__imaginariumGuards = {
    saves: new java.util.concurrent.locks.ReentrantLock(),
    registry: new java.util.concurrent.locks.ReentrantLock(),
    orders: Object.create(null)
  });
function handleOrder(key, work) {
  var entry;
  guards.registry.lock();
  try {
    entry =
      guards.orders[key] ||
      (guards.orders[key] = { lock: new java.util.concurrent.locks.ReentrantLock(), users: 0 });
    entry.users++;
  } finally {
    guards.registry.unlock();
  }
  entry.lock.lock();
  try {
    return work();
  } finally {
    entry.lock.unlock();
    guards.registry.lock();
    try {
      if (--entry.users === 0) delete guards.orders[key];
    } finally {
      guards.registry.unlock();
    }
  }
}
function atomic(path, payload) {
  var text = JSON.stringify(payload);
  axiko.files.write(path + '.tmp', text);
  var target = new java.io.File(axiko.files.path(path)),
    temp = new java.io.File(axiko.files.path(path + '.tmp'));
  java.nio.file.Files.move(
    temp.toPath(),
    target.toPath(),
    java.nio.file.StandardCopyOption.ATOMIC_MOVE,
    java.nio.file.StandardCopyOption.REPLACE_EXISTING
  );
}
function snapshot() {
  return axiko.files.exists(savePath) ? JSON.parse(String(axiko.files.read(savePath))) : null;
}
exports.load = snapshot;
exports.save = function (expected, state) {
  var hold = guards.saves;
  hold.lock();
  try {
    var previous = snapshot();
    if ((previous ? previous.revision : 0) !== expected)
      throw new Error('Библиотека уже изменилась на другом экране. Откройте её снова.');
    if (!state || state.version !== 1 || !Array.isArray(state.books) || !Array.isArray(state.objects))
      throw new Error('Повреждена запись библиотеки.');
    var revision = expected + 1;
    atomic(savePath, { revision: revision, state: state });
    return revision;
  } finally {
    hold.unlock();
  }
};
function receipt(key) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new Error('Неверный номер заказа.');
  return folder + 'orders/' + key + '.json';
}
exports.result = function (key) {
  var path = receipt(key);
  return axiko.files.exists(path) ? JSON.parse(String(axiko.files.read(path))) : null;
};
var bookTasks = {
  seeds:
    'Return {"options":["three distinct opening premises"]}. Exactly three different premises, each 2 sentences with a named protagonist, concrete incident and unresolved question.',
  titles:
    'Return {"options":["title one","title two","title three"]}. Three distinctive, short titles for this premise.',
  chapter:
    'Write a literary chapter in the reader’s requested language and tone. Default to Russian. Return {"title":"...","paragraphs":["..."],"summary":"...","facts":["established fact; who knows it; source"],"threads":["all still-open threads"]}. Write 5–12 substantial paragraphs for a chapter or 3–5 for a short scene. Respect established ownership, private knowledge and chronology. A finale resolves the premise and its open lines. A revision replaces the specified last chapter. Use the author note only as a direction, never as past fact.'
};
var shapeTask =
  'You are a 3D object maker. Make the SPECIFIC requested object (any subject) recognizable from all sides. For an edit preserve unchanged parts, proportions, articulation and materials from the provided design. Return only JSON {"name":"short name in Russian","mount":"floor|surface|wall|ceiling","parts":[{"label":"part name","type":"box|sphere|cylinder|cone|torus|curve|mesh|profile","color":"#rrggbb","at":[x,y,z],"size":[width,height,depth],"rot":[degreesX,degreesY,degreesZ],"material":"matte|metal|glass|wood|cloth|leather|paper|porcelain","action":"optional light|seat|shelf|surface|catalog|hinge"}]}. Real metres: y up, origin at bottom centre, front faces positive Z. Build a complete, freestanding object from front, back and underneath. With ordinary furniture locate every foot on the floor and join supports to the frame; mount arms, hinges and switches. Give edges a useful radius and include grips, piping, joint collars or bindings where present. Use 8–40 parts as useful, max 64; local centres at -4..4, dimensions 0.002..5. For organic or irregular shapes use curve with points [[x,y,z],...] and radius, mesh with points and faces [[index,index,index],...]. For a turned or irregularly tapered part choose profile with profile:[[height,radius],...] in ascending height order, 2–48 rings. Use compact profiles for feet, vase walls, turned lamp posts and knurled knobs. Optional bevel on box is the edge radius in metres. Mesh, profile and curve coordinates are local metres scaled by size, default [1,1,1]. Affordances are optional. No code, textures or URLs. Protect outlined features in edits.';
function generate(key, task, input) {
  var cached = exports.result(key);
  if (cached) return cached;
  if (task !== 'shape' && !Object.prototype.hasOwnProperty.call(bookTasks, task))
    throw new Error('Неизвестный заказ.');
  var role = task === 'shape' ? 'imaginarium.form' : 'imaginarium.write';
  var data = JSON.stringify(input);
  if (data.length > 160000) throw new Error('Слишком длинное описание.');
  var articulation =
    ' Hinges may specify pivot:[x,y,z] in object coordinates and axis:"x","y" or "z". Parts attached to a moving part use parent: zero-based index of an earlier part. Part centres remain in object coordinates in the closed position.';
  var messages = [
    {
      role: 'system',
      content:
        (task === 'shape' ? shapeTask + articulation : bookTasks[task]) +
        ' Output valid JSON only. Use Russian unless the reader chose another language.'
    },
    { role: 'user', content: data }
  ];
  var response = require('lib/ai').complete(role, { messages: messages });
  var message = response && response.choices && response.choices[0] && response.choices[0].message;
  var content = message && message.content;
  if (Array.isArray(content))
    content = content
      .map(function (p) {
        return p.text || '';
      })
      .join('');
  if (!content)
    throw new Error('Модель не прислала ответ. Проверьте назначение роли ' + role + ' в настройках Axiko.');
  var raw = JSON.parse(
    String(content)
      .trim()
      .replace(/^\x60\x60\x60(?:json)?\s*/i, '')
      .replace(/\s*\x60\x60\x60$/, '')
  );
  var result =
    task === 'shape' ? schema.shape(raw) : task === 'chapter' ? schema.chapter(raw) : schema.choices(raw);
  atomic(receipt(key), result);
  return result;
}
exports.generate = function (key, task, input) {
  receipt(key);
  return handleOrder(key, function () {
    return generate(key, task, input);
  });
};
exports.widget = function () {
  return { title: 'Imaginarium', text: 'Вернуться к своей полке', open: 'modules/imaginarium/ui/index.html' };
};
