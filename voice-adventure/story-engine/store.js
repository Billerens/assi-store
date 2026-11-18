// Saving that survives the app being killed mid-write: the new version goes to a temporary file
// first, the previous one is kept as *.prev.json, and the swap is a rename (java.io.File.renameTo),
// not axiko.files.write, which writes over the file in place. Engine only (Rhino).
//
//   store.saveState('data/stories/quest/observatory', state)
//   store.loadState('data/stories/quest/observatory') -> state or null (the previous version if the last is broken)
var axiko = require('lib/axiko');

var lock = new java.util.concurrent.locks.ReentrantLock();

function file(path) {
  return new java.io.File(String(axiko.files.path(path)));
}

function prevOf(target) {
  var name = String(target.getName());
  var dot = name.lastIndexOf('.');
  var prev = dot > 0 ? name.slice(0, dot) + '.prev' + name.slice(dot) : name + '.prev';
  return new java.io.File(target.getParentFile(), prev);
}

function writeBytes(target, text) {
  target.getParentFile().mkdirs();
  var stream = new java.io.FileOutputStream(target);
  try {
    stream.write(new java.lang.String(String(text)).getBytes('UTF-8'));
    stream.flush();
    stream.getFD().sync();
  } finally {
    stream.close();
  }
}

function readText(target) {
  var bytes = java.nio.file.Files.readAllBytes(target.toPath());
  return String(new java.lang.String(bytes, 'UTF-8'));
}

/** Writes JSON safely; the version it replaces stays as *.prev.json. */
function writeJson(path, value) {
  var target = file(path);
  var temp = new java.io.File(target.getPath() + '.tmp');
  var prev = prevOf(target);
  lock.lock();
  try {
    writeBytes(temp, JSON.stringify(value, null, 1));
    if (target.exists()) {
      if (prev.exists()) prev['delete']();
      if (!target.renameTo(prev)) {
        java.nio.file.Files.copy(target.toPath(), prev.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
      }
    }
    if (!temp.renameTo(target)) {
      java.nio.file.Files.move(temp.toPath(), target.toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
    }
  } finally {
    lock.unlock();
  }
}

/** Reads JSON; a broken or missing file gives way to its previous version, then to fallback. */
function readJson(path, fallback) {
  var target = file(path);
  var candidates = [target, prevOf(target)];
  for (var i = 0; i < candidates.length; i++) {
    if (!candidates[i].isFile()) continue;
    try {
      return JSON.parse(readText(candidates[i]));
    } catch (error) {
      console.warn('story-engine: повреждён ' + candidates[i].getName() + ', беру предыдущую версию');
    }
  }
  return fallback === undefined ? null : fallback;
}

function saveState(dir, state) {
  state.savedAt = Date.now();
  writeJson(dir + '/state.json', state);
  return state.savedAt;
}

function loadState(dir) {
  return readJson(dir + '/state.json', null);
}

/** Removes a folder of data with everything in it (a plot, an episode, recordings). */
function removeDir(path) {
  var target = file(path);
  function wipe(node) {
    if (node.isDirectory()) {
      var inner = node.listFiles() || [];
      for (var i = 0; i < inner.length; i++) wipe(inner[i]);
    }
    node['delete']();
  }
  if (target.exists()) wipe(target);
  return !target.exists();
}

/** Folders inside a data folder (plots, seasons). */
function folders(path) {
  var target = file(path);
  var inner = target.isDirectory() ? (target.listFiles() || []) : [];
  var out = [];
  for (var i = 0; i < inner.length; i++) if (inner[i].isDirectory()) out.push(String(inner[i].getName()));
  return out.sort();
}

exports.writeJson = writeJson;
exports.readJson = readJson;
exports.saveState = saveState;
exports.loadState = loadState;
exports.removeDir = removeDir;
exports.folders = folders;
exports.file = file;
