// «Обои дня»: every morning a photograph from open sources, chosen for the weather, the season
// and the owner's taste, cropped for the Fold's outer and inner screens and the lock screen.
// Screens call these functions with axiko.call('modules/wallpapers/main.js', name, ...args);
// the agent calls them with require('modules/wallpapers/main.js').
//
// Logic without Android is in settings.js, context.js, sources.js, select.js, fold.js (tested
// in node); the Android side is in android.js.

var axiko = require('lib/axiko');
var settingsLib = require('./settings');
var ctx = require('./context');
var sources = require('./sources');
var select = require('./select');
var fold = require('./fold');
var phone = require('./android');

var ID = 'wallpapers';
var MAIN = 'modules/wallpapers/main.js';
var SCREEN = 'modules/wallpapers/ui/index.html';
var DATA = 'data/wallpapers';
var NOTICE_ID = 71517;
var MB = 1048576;

var db = axiko.db('wallpapers');
db.exec('create table if not exists history (id integer primary key autoincrement, day text not null, set_at integer, source text, ' +
  'source_id text, title text, author text, author_url text, license text, license_url text, page_url text, original_url text, ' +
  'width integer, height integer, dhash text, brightness real, topic text, weather text, season text, query text, focus_x real, ' +
  'focus_y real, favorite integer default 0, vote integer default 0, reverted integer default 0, files integer default 0, dir text, ' +
  'reason text, mode text, screens text, dry integer default 0, manual integer default 0, again integer, judged text, download_location text)');
db.exec('create index if not exists history_day on history (day)');
db.exec('create index if not exists history_pick on history (source, source_id)');
db.exec('create table if not exists weights (kind text not null, value text not null, weight real not null default 0, primary key (kind, value))');
// The country of a picture (for «Путешественник»), where the source gives it; older tables get the column.
try { db.exec('alter table history add column country text'); } catch (exists) { /* already there */ }

var HEALTH = 'modules/health/main.js';
var PET = 'modules/pet/main.js';
var PET_STATE = 'data/pet/state.json';
var ACHIEVEMENTS = 'modules/achievements/main.js';
var OUTBOX = 'data/games/achievements-outbox.json';

var running = new java.util.concurrent.locks.ReentrantLock();

// ---- settings and state -----------------------------------------------------------------------

function loadSettings() {
  return settingsLib.normalize(axiko.files.readJson(DATA + '/settings.json', {}));
}

function loadState() {
  return axiko.files.readJson(DATA + '/state.json', {});
}

function saveState(state) {
  axiko.files.writeJson(DATA + '/state.json', state);
  return state;
}

function patchState(fields) {
  var state = loadState();
  Object.keys(fields).forEach(function (key) { state[key] = fields[key]; });
  return saveState(state);
}

function progress(step, text) {
  try { emit('wallpapers.progress', { step: step, text: text }); } catch (ignored) { /* no screen open */ }
}

function keys() {
  var out = {};
  Object.keys(sources.KEYS).forEach(function (id) {
    var name = sources.KEYS[id].secret;
    try { out[id] = axiko.secret.has ? axiko.secret.has(name) === true : Boolean(axiko.secret.get(name)); } catch (error) { out[id] = false; }
  });
  return out;
}

/**
 * How a source's key goes into a request. The module does not hold the key: it names the secret
 * ('{{secret:name}}') and the shell puts the value in when it sends the request. A shell that cannot
 * do that yet (it has no axiko.secret.has) gives the key itself, as before.
 */
function keyOf(id) {
  if (!sources.KEYS[id]) return null;
  var name = sources.KEYS[id].secret;
  try {
    if (axiko.secret.has) return axiko.secret.has(name) === true ? '{{secret:' + name + '}}' : null;
    return axiko.secret.get(name);
  } catch (error) { return null; }
}

/** Is a model there for this role, and does it see pictures? */
function model(role) {
  try {
    var target = native('models.resolve', role);
    if (!target || !target.model) return { ready: false, vision: false };
    var options = target.options || {};
    return { ready: true, vision: options.vision !== false, model: target.model };
  } catch (error) {
    return { ready: false, vision: false };
  }
}

function today() { return ctx.dayKey(new Date()); }

function rowUrls(row) {
  if (!row) return row;
  var version = row.set_at || 0;
  var dir = row.dir ? '/' + row.dir : '';
  row.thumbUrl = dir ? dir + '/thumb.jpg?v=' + version : '';
  row.innerUrl = dir && row.files ? dir + '/inner.jpg?v=' + version : '';
  row.coverUrl = dir && row.files ? dir + '/cover.jpg?v=' + version : '';
  row.sourceName = sources.NAMES[row.source] || (row.source === 'url' ? 'ссылка' : row.source);
  row.credit = 'Фото: ' + (row.author || 'автор не указан') + ', ' + row.sourceName;
  return row;
}

function getRow(id) {
  var rows = db.query('select * from history where id = ?', [id]);
  return rows.length ? rows[0] : null;
}

// ---- place and weather ------------------------------------------------------------------------

/** Where the phone is: the city from the settings, or the phone's coarse location, or null. */
function placeFor(settings, state, notes) {
  if (settings.city) {
    if (state.place && state.place.city === settings.city && typeof state.place.latitude === 'number') return state.place;
    var answer = phone.getJson(ctx.geocodeUrl(settings.city), { 'User-Agent': sources.USER_AGENT });
    var found = answer.ok ? ctx.parsePlace(answer.json) : null;
    if (found) {
      state.place = { city: settings.city, name: found.name, latitude: found.latitude, longitude: found.longitude, from: 'город', at: Date.now() };
      saveState(state);
      return state.place;
    }
    if (notes) notes.push('город «' + settings.city + '» не нашёлся');
    return null;
  }
  var seen = phone.lastLocation();
  if (typeof seen.latitude === 'number') {
    state.place = { latitude: seen.latitude, longitude: seen.longitude, from: 'геолокация', at: Date.now() };
    saveState(state);
    return state.place;
  }
  if (state.place && state.place.from === 'геолокация') return state.place;
  if (notes) notes.push('погода неизвестна: ' + (seen.error || 'нет местоположения') + ' — укажите город в настройках');
  return null;
}

function weatherFor(settings, state, place, maxAgeMinutes, notes) {
  var cached = state.weather;
  var fresh = cached && Date.now() - cached.at <= maxAgeMinutes * 60000 &&
    Math.abs(cached.latitude - place.latitude) < 0.05 && Math.abs(cached.longitude - place.longitude) < 0.05;
  if (fresh) return cached;
  var answer = phone.getJson(ctx.weatherUrl(place.latitude, place.longitude), { 'User-Agent': sources.USER_AGENT });
  var parsed = answer.ok ? ctx.parseWeather(answer.json) : null;
  if (!parsed) {
    if (notes) notes.push('погода не пришла: ' + (answer.error || sources.failure(answer.status, answer.text)));
    return cached || null;
  }
  parsed.at = Date.now();
  parsed.latitude = place.latitude;
  parsed.longitude = place.longitude;
  state.weather = parsed;
  saveState(state);
  return parsed;
}

/**
 * The weather now for other modules (Праздничные пасхалки asks it for the first snow):
 * null | { at, latitude, longitude, code, word, snow, temperature, isDay }.
 */
exports.weatherNow = function (maxAgeMinutes) {
  try {
    var settings = loadSettings();
    var state = loadState();
    var place = placeFor(settings, state, null);
    if (!place) return null;
    var weather = weatherFor(settings, state, place, Number(maxAgeMinutes) || settings.weatherMaxAge, null);
    if (!weather) return null;
    return {
      at: weather.at, latitude: weather.latitude, longitude: weather.longitude, code: weather.code, word: weather.word,
      snow: Boolean(weather.snow), temperature: weather.temperature, isDay: weather.isDay
    };
  } catch (error) {
    return null;
  }
};

// ---- the taste ----------------------------------------------------------------------------------

function tasteRows() { return db.query('select kind, value, weight from weights'); }

function bump(kind, value, delta) {
  if (!value) return;
  var key = String(value).toLowerCase();
  var was = db.query('select weight from weights where kind = ? and value = ?', [kind, key]);
  var next = Math.max(-20, Math.min(20, (was.length ? Number(was[0].weight) : 0) + delta));
  db.exec('insert or replace into weights (kind, value, weight) values (?, ?, ?)', [kind, key, Math.round(next * 100) / 100]);
}

function remember(text) {
  var settings = loadSettings();
  if (!settings.rememberTaste) return;
  try { require('lib/memory').save(text, ['обои', 'вкус']); } catch (ignored) { /* memory is optional */ }
}

// ---- the day's context ------------------------------------------------------------------------

function recentTopics(limit) {
  // One topic per day, newest first: the streak rule looks at days, not at button presses.
  var rows = db.query('select day, topic from history where dry = 0 and topic is not null order by set_at desc limit 60');
  var days = [];
  var out = [];
  rows.forEach(function (row) {
    if (days.indexOf(row.day) >= 0) return;
    days.push(row.day);
    out.push(row.topic);
  });
  return out.slice(0, limit || 30);
}

function findTopic(settings, name) {
  var wanted = String(name || '').toLowerCase().trim();
  if (!wanted) return null;
  var found = settings.topics.filter(function (topic) {
    return topic.name.toLowerCase() === wanted || topic.query.indexOf(wanted) >= 0;
  })[0];
  return found || null;
}

function dayContext(settings, state, now, options, notes) {
  var day = ctx.dayKey(now);
  var place = null;
  try { place = placeFor(settings, state, notes); } catch (error) { notes.push('место: ' + phone.message(error)); }
  var weather = null;
  if (settings.useWeather && place) {
    try { weather = weatherFor(settings, state, place, settings.weatherMaxAge, notes); } catch (error) { notes.push('погода: ' + phone.message(error)); }
  }
  var occasion = null;
  if (settings.useHolidays && !options.topic && !options.query) {
    try {
      var holidays = require('modules/holidays/main.js');
      if (holidays && typeof holidays.occasionToday === 'function') occasion = holidays.occasionToday(day);
    } catch (absent) {
      occasion = null;
    }
  }
  var taste = select.taste(tasteRows());
  var topic = null;
  var asked = options.query || (options.topic && !findTopic(settings, options.topic) ? options.topic : null);
  var words = asked ? String(asked).toLowerCase().replace(/[^a-z0-9 '\-]/g, ' ').replace(/\s+/g, ' ').trim() : '';
  if (words) topic = { name: 'по просьбе', query: words, weight: 1 };
  else if (options.topic) topic = findTopic(settings, options.topic);
  else if (occasion) topic = ctx.occasionTopic(occasion);
  if (asked && !words) notes.push('«' + asked + '» — не тема из настроек и не английские слова: тема выбрана по весам');
  var badNight = false;
  var petMood = null;
  if (!topic || !topic.query) {
    var topics = settings.topics;
    badNight = settings.calmAfterBadNight && lastNightBad(settings, notes);
    petMood = petCalm(settings, day, notes);
    if (badNight || petMood) {
      var calm = settingsLib.topic({ name: settings.calmTopic, query: settings.calmQuery, weight: settings.calmWeight });
      if (calm) topics = ctx.calmTopics(topics, calm);
      else notes.push('тема после плохой ночи не задана (нужны название и английские слова)');
    }
    topic = ctx.pickTopic(topics, recentTopics(), { streak: settings.topicStreak, votes: taste.topic, voteStep: settings.voteStep });
  }
  var weatherWord = weather ? ctx.weatherWord(weather.code) : null;
  return {
    day: day,
    now: now.getTime(),
    place: place,
    weather: weatherWord ? { key: weatherWord.key, word: weatherWord.ru, en: weatherWord.en, code: weather.code } : null,
    season: ctx.season(now, place ? place.latitude : null),
    month: ctx.monthName(now),
    topic: topic,
    occasion: occasion && topic && topic.occasion ? occasion : null,
    badNight: Boolean(badNight),
    petMood: petMood,
    taste: taste
  };
}

/**
 * The pet's mood (data/pet/state.json of «Питомец», read only) by the setting calmFromPet: its word
 * («невыспавшийся») when it asks for calm pictures today, else null. No module — null.
 */
function petCalm(settings, day, notes) {
  if (settings.calmFromPet === 'off' || !axiko.files.exists(PET)) return null;
  try {
    return ctx.petCalm(axiko.files.readJson(PET_STATE, null), settings.calmFromPet, day);
  } catch (error) {
    notes.push('настроение Питомца: ' + phone.message(error));
    return null;
  }
}

/** Last night from the health module's day summary: short by settings.calmShortMin or more? No module, no data — no. */
function lastNightBad(settings, notes) {
  if (!axiko.files.exists(HEALTH)) return false;
  try {
    var health = require(HEALTH);
    var day = typeof health.today === 'function' ? health.today() : null;
    var goals = typeof health.goals === 'function' ? health.goals() : {};
    return ctx.badNight(day, (day && day.sleepGoal) || (goals && goals.sleepGoal), settings.calmShortMin);
  } catch (error) {
    notes.push('сон из «Здоровья»: ' + phone.message(error));
    return false;
  }
}

function makeQueries(settings, context, notes) {
  var plain = ctx.queries(context, settings.queryTemplate);
  if (!settings.useModelQuery || context.topic.name === 'по просьбе') return plain;
  var role = model('wallpapers.query');
  if (!role.ready) return plain;
  try {
    var prompt = select.queryPrompt(context, context.taste);
    var answer = require('lib/ai').ask({ role: 'wallpapers.query', system: prompt.system, prompt: prompt.prompt, json: true });
    var written = select.parseQueries(answer);
    if (written) {
      notes.push('запрос написала модель');
      return written.concat(plain.filter(function (query) { return written.indexOf(query) < 0; }));
    }
    notes.push('ответ модели запроса не подошёл — по шаблону');
  } catch (error) {
    notes.push('модель запроса не ответила — по шаблону');
  }
  return plain;
}

// ---- candidates -------------------------------------------------------------------------------

function aicMaxArea(state) {
  if (state.aicMaxArea && Date.now() - state.aicMaxArea.at < 30 * 864e5) return state.aicMaxArea.value;
  return 0;
}

function learnAicArea(state, item) {
  // The image server says its limit in info.json; asked once a month.
  if (!item || !item.imageId) return 0;
  var answer = phone.getJson('https://www.artic.edu/iiif/2/' + item.imageId + '/info.json', sources.fileHeaders('aic'));
  var area = answer.ok ? sources.iiifMaxArea(answer.json) : 0;
  if (area) {
    state.aicMaxArea = { value: area, at: Date.now() };
    saveState(state);
  }
  return area;
}

function probeSizes(items, settings) {
  items.forEach(function (item) {
    if (!item.probe) return;
    try {
      var head = phone.headBytes(item.originalUrl, 65536, sources.fileHeaders(item.source));
      var size = head ? select.imageSize(head) : null;
      if (size && size.width && size.height) {
        item.width = item.fullWidth = size.width;
        item.height = item.fullHeight = size.height;
        item.probe = false;
      } else {
        item.width = item.height = 0;
        item.probe = false;
      }
    } catch (error) {
      item.width = item.height = 0;
      item.probe = false;
    }
  });
}

/**
 * Asks the sources in turn with the queries (most specific first) until enough candidates
 * passed both sieves. Returns { pool, status, dropped }.
 */
function gather(settings, state, context, queries, history, cacheDir, limits) {
  var available = keys();
  var order = sources.order(settings.sources, context.topic, available);
  var status = [];
  var dropped = {};
  var pool = [];
  var analysed = [];
  var asked = 0;
  var apodAsked = false;
  var count = 0;
  function drop(list) {
    list.forEach(function (entry) { dropped[entry.why.split(':')[0]] = (dropped[entry.why.split(':')[0]] || 0) + 1; });
  }
  for (var q = 0; q < queries.length && analysed.length < settings.candidates; q++) {
    for (var s = 0; s < order.length && analysed.length < settings.candidates; s++) {
      var source = order[s];
      if (source === 'apod' && apodAsked) continue;
      if (asked >= limits.maxRequests) break;
      if (source === 'apod') apodAsked = true;
      asked++;
      progress('search', 'Ищу: ' + sources.NAMES[source] + ' — «' + queries[q] + '»');
      var req = sources.request(source, {
        query: queries[q], pageSize: settings.pageSize, minSide: settings.minSide, aspect: settings.openverseAspect, key: keyOf(source),
        apodCount: settings.apodCount
      });
      var answer = phone.getJson(req.url, req.headers);
      var line = { source: source, name: sources.NAMES[source], query: queries[q], ok: answer.ok, found: 0, kept: 0, note: '' };
      if (!answer.ok) {
        line.note = answer.error || sources.failure(answer.status, answer.text);
        status.push(line);
        continue;
      }
      var parsed = sources.parse(source, answer.json, { minSide: settings.minSide, maxArea: aicMaxArea(state) });
      if (source === 'aic' && parsed.items.length && !aicMaxArea(state) && learnAicArea(state, parsed.items[0])) {
        parsed = sources.parse(source, answer.json, { minSide: settings.minSide, maxArea: aicMaxArea(state) });
      }
      line.found = parsed.items.length;
      line.note = parsed.note || '';
      parsed.items.forEach(function (item) {
        item.query = queries[q];
        item.topic = context.topic.name;
      });
      probeSizes(parsed.items, settings);
      var fresh = sources.dedupe(pool.concat(parsed.items)).slice(pool.length);
      var first = select.prefilter(fresh, history, settings, context.day, ctx.daysBetween);
      drop(first.dropped);
      pool = pool.concat(first.kept);
      // Thumbnails of the new ones: brightness, sharpness, dHash.
      var looked = [];
      first.kept.forEach(function (item) {
        if (analysed.length + looked.length >= settings.candidates * 2) return;
        try {
          var path = cacheDir + '/' + (count++) + '.jpg';
          phone.download(item.thumbUrl, path, sources.fileHeaders(item.source), 8 * MB);
          var seen = phone.analyze(path);
          if (!seen) throw new Error('миниатюра не читается');
          item.thumbPath = path;
          item.brightness = seen.brightness;
          item.contrast = seen.contrast;
          item.dhash = seen.dhash;
        } catch (error) {
          item.dhash = '';
        }
        looked.push(item);
      });
      var second = select.postfilter(looked, history.concat(analysed.map(function (item) {
        return { dhash: item.dhash, day: context.day };
      })), settings, context.topic, context.day, ctx.daysBetween);
      drop(second.dropped);
      analysed = analysed.concat(second.kept);
      line.kept = second.kept.length;
      status.push(line);
    }
  }
  return { pool: analysed, status: status, dropped: dropped, requests: asked };
}

/** The best candidate: the model with sight when it may and can, the simple score otherwise. */
function choose(settings, context, pool, notes) {
  var ranked = select.rank(pool, settings, context.taste);
  var top = ranked.slice(0, settings.candidates);
  var pick = { order: top, index: 0, focus: null, judged: '' };
  if (!top.length) return pick;
  pick.reasons = 'по простой оценке: яркость ' + top[0].brightness + ', ' + top[0].width + '×' + top[0].height;
  if (!settings.useJudge) return pick;
  var judge = model('wallpapers.judge');
  if (!judge.ready) return pick;
  if (!judge.vision) {
    notes.push('у модели-судьи нет зрения — выбрано по простой оценке');
    return pick;
  }
  try {
    progress('judge', 'Модель смотрит ' + top.length + ' кандидатов');
    var images = top.map(function (item) { return phone.dataUrl(item.thumbPath, settings.judgeThumb); });
    var answer = require('lib/ai').ask({ role: 'wallpapers.judge', prompt: select.judgePrompt(top.length, settings, context), images: images, json: true });
    var verdict = select.parseJudge(answer, top.length);
    if (!verdict) {
      notes.push('ответ модели-судьи не подошёл — выбрано по простой оценке');
      return pick;
    }
    // The rest keep their order after the chosen one, rejected ones go last.
    var rest = top.filter(function (item, i) { return i !== verdict.best && verdict.reject.indexOf(i) < 0; });
    var rejected = top.filter(function (item, i) { return i !== verdict.best && verdict.reject.indexOf(i) >= 0; });
    pick.order = [top[verdict.best]].concat(rest, rejected);
    pick.focus = verdict.focus;
    pick.reasons = verdict.reasons || 'выбрала модель';
    pick.judged = JSON.stringify({ best: verdict.best + 1, reject: verdict.reject.map(function (i) { return i + 1; }), of: top.length, model: judge.model });
  } catch (error) {
    notes.push('модель-судья не ответила — выбрано по простой оценке');
  }
  return pick;
}

// ---- files ------------------------------------------------------------------------------------

function dirFor(day) {
  var dir = DATA + '/' + day;
  var n = 2;
  while (axiko.files.exists(dir + '/thumb.jpg')) dir = DATA + '/' + day + '-' + (n++);
  return dir;
}

/** Downloads the original, cuts the two crops and the thumbnails; the original is not kept. */
function makeFiles(settings, item, focus, dir, coverItem, coverFocus) {
  var made = {};
  var original = dir + '/original.tmp';
  var maxPixels = settings.maxDecodeMegapixels * 1e6;
  function cut(from, fromFocus, screen, target) {
    phone.download(from.originalUrl, original, sources.fileHeaders(from.source), settings.maxDownloadMb * MB);
    try {
      var size = phone.bounds(original);
      if (size.width <= 0) throw new Error('файл не читается как картинка');
      if (Math.min(size.width, size.height) < settings.minSide * 0.9 && from.source !== 'url') {
        throw new Error('файл меньше обещанного: ' + size.width + '×' + size.height);
      }
      from.realWidth = size.width;
      from.realHeight = size.height;
      var rect = select.cropRect(size.width, size.height, screen.width, screen.height, fromFocus, { hinge: screen.hinge, focusY: settings.focusY });
      phone.crop(original, rect, screen.width, screen.height, target, settings.jpegQuality, maxPixels);
      return rect;
    } finally {
      axiko.files.remove(original);
    }
  }
  var screens = select.targets(settings);
  var innerScreen = screens[0];
  var coverScreen = screens[1];
  if (coverItem && coverItem !== item) {
    made.innerRect = cut(item, focus, innerScreen, dir + '/inner.jpg');
    made.coverRect = cut(coverItem, coverFocus, coverScreen, dir + '/cover.jpg');
  } else {
    // One download, two crops.
    phone.download(item.originalUrl, original, sources.fileHeaders(item.source), settings.maxDownloadMb * MB);
    try {
      var size = phone.bounds(original);
      if (size.width <= 0) throw new Error('файл не читается как картинка');
      if (Math.min(size.width, size.height) < settings.minSide * 0.9 && item.source !== 'url') {
        throw new Error('файл меньше обещанного: ' + size.width + '×' + size.height);
      }
      item.realWidth = size.width;
      item.realHeight = size.height;
      made.innerRect = select.cropRect(size.width, size.height, innerScreen.width, innerScreen.height, focus, { hinge: innerScreen.hinge, focusY: settings.focusY });
      made.coverRect = select.cropRect(size.width, size.height, coverScreen.width, coverScreen.height, focus, { focusY: settings.focusY });
      phone.crop(original, made.innerRect, innerScreen.width, innerScreen.height, dir + '/inner.jpg', settings.jpegQuality, maxPixels);
      phone.crop(original, made.coverRect, coverScreen.width, coverScreen.height, dir + '/cover.jpg', settings.jpegQuality, maxPixels);
    } finally {
      axiko.files.remove(original);
    }
  }
  // The thumbnail is also the widget's picture (widget.image takes JPEG too).
  phone.shrink(dir + '/inner.jpg', settings.thumbSide, dir + '/thumb.jpg', 85, false);
  made.inner = dir + '/inner.jpg';
  made.cover = dir + '/cover.jpg';
  return made;
}

function filesOf(row) {
  return { inner: row.dir + '/inner.jpg', cover: row.dir + '/cover.jpg' };
}

function hasFiles(row) {
  return row && row.dir && axiko.files.exists(row.dir + '/inner.jpg') && axiko.files.exists(row.dir + '/cover.jpg');
}

/** Re-makes the crops of a picture whose full files were cleaned away, from its original link. */
function restoreFiles(settings, row) {
  if (hasFiles(row)) return true;
  if (!row.original_url) return false;
  var dir = row.dir || dirFor(row.day);
  var item = { source: row.source, originalUrl: row.original_url };
  makeFiles(settings, item, row.focus_x === null || row.focus_x === undefined ? null : { x: row.focus_x, y: row.focus_y }, dir, null, null);
  db.exec('update history set files = 1, dir = ? where source = ? and source_id = ?', [dir, row.source, row.source_id]);
  row.dir = dir;
  row.files = 1;
  return true;
}

// ---- putting it on the screens ------------------------------------------------------------------

function foldPlan(settings, state) {
  var info = state.fold || {};
  return fold.plan(info.summary || null, settings.foldMode, info.confirmed || null, info.failed || {});
}

function setOnPhone(settings, state, files) {
  var plan = foldPlan(settings, state);
  var want = { inner: settings.setInner, cover: settings.setCover, lock: settings.setLock, lockShot: settings.lockScreen };
  var allowed = phone.canSet();
  if (!allowed.ok) {
    return {
      ok: false, mode: plan.mode, screens: [], denied: true,
      error: !allowed.declared ? 'в Axiko нет разрешения SET_WALLPAPER (нужна сборка с ним)' : !allowed.allowed ? 'установка обоев запрещена на этом телефоне' : 'обои не поддерживаются'
    };
  }
  var result = phone.setWallpaper(plan, files, want, settings);
  if (result.cropsFailed) {
    var info = state.fold || {};
    info.failed = info.failed || {};
    info.failed.crops = result.cropsFailed;
    state.fold = info;
    saveState(state);
  }
  return result;
}

function notifySet(settings, row, title) {
  if (!settings.notify) return;
  var options = {
    title: title || 'Новые обои: ' + row.title,
    text: 'Фото: ' + (row.author || 'автор не указан') + ', ' + (sources.NAMES[row.source] || row.source),
    open: SCREEN,
    silent: true,
    id: NOTICE_ID
  };
  if (phone.has('notify.actions')) {
    options.id = 'wallpapers.daily';
    options.actions = [
      { title: 'Вернуть вчерашние', call: MAIN, fn: 'revert', args: {} },
      { title: 'В избранное', call: MAIN, fn: 'favorite', args: { id: row.id, on: true } }
    ];
  }
  try { axiko.notify(options); } catch (error) { /* a notice is not worth a failure */ }
}

function changed(id) {
  try { emit('wallpapers.changed', { id: id }); } catch (ignored) { /* no screen */ }
  try { axiko.widget.refresh(ID); } catch (ignored) { /* no widget */ }
}

function insertRow(fields) {
  var names = Object.keys(fields);
  db.exec('insert into history (' + names.join(', ') + ') values (' + names.map(function () { return '?'; }).join(', ') + ')',
    names.map(function (name) { return fields[name]; }));
  return db.lastId();
}

// ---- the main run -----------------------------------------------------------------------------

function cleanCache(dir) {
  try { axiko.files.remove(dir); } catch (ignored) { /* nothing there */ }
}

/**
 * Finds, chooses, crops and sets a picture.
 * options: { dryRun (choose and crop, do not set), manual, topic (a topic's name), query
 * (English words), limit (candidates, for checks), sources ({id: true} to ask only these) }.
 * Returns { ok, id, title, credit, reason, mode, screens, notes, status, dropped, error }.
 */
exports.run = function (options) {
  options = options || {};
  if (!running.tryLock()) return { ok: false, busy: true, error: 'обои уже подбираются' };
  var settings = loadSettings();
  var state = loadState();
  var notes = [];
  var cacheDir = DATA + '/cache/' + Date.now();
  var started = Date.now();
  if (options.limit) settings.candidates = Math.max(1, Math.min(settings.candidates, Number(options.limit)));
  if (options.sources) {
    var only = {};
    settingsLib.SOURCE_IDS.forEach(function (id) { only[id] = Boolean(options.sources[id]) && settings.sources[id]; });
    settings.sources = only;
  }
  var outcome = { ok: false, notes: notes };
  try {
    progress('context', 'Смотрю погоду и сезон');
    var now = new Date();
    var context = dayContext(settings, state, now, options, notes);
    var queries = makeQueries(settings, context, notes);
    var history = db.query('select source, source_id, author, day, dhash from history');
    var found = gather(settings, state, context, queries, history, cacheDir, { maxRequests: settings.maxRequests });
    outcome.status = found.status;
    outcome.dropped = found.dropped;
    if (!found.pool.length) {
      outcome.error = 'не нашлось ни одной подходящей картинки';
      throw new Error(outcome.error);
    }
    var pick = choose(settings, context, found.pool, notes);
    var made = null;
    var item = null;
    var coverItem = null;
    var attempts = 0;
    var dir = dirFor(context.day);
    for (var i = 0; i < pick.order.length && attempts < settings.applyAttempts && !made; i++) {
      item = pick.order[i];
      coverItem = settings.shots === 'different' && pick.order[i + 1] ? pick.order[i + 1] : null;
      attempts++;
      try {
        progress('crop', 'Скачиваю и кадрирую: ' + item.title);
        made = makeFiles(settings, item, i === 0 ? pick.focus : null, dir, coverItem, null);
        if (i > 0) notes.push('первый выбор не скачался — взят следующий');
      } catch (error) {
        notes.push(item.title + ': ' + phone.message(error));
        made = null;
      }
    }
    if (!made) {
      // A half-made folder (inner cut, cover failed) belongs to no row: it goes.
      try { axiko.files.remove(dir); } catch (ignored) { /* nothing there */ }
      throw new Error('ни одна из выбранных картинок не скачалась');
    }
    var reason = ctx.reason(context);
    var row = {
      day: context.day, set_at: Date.now(), source: item.source, source_id: item.sourceId, title: item.title, author: item.author,
      author_url: item.authorUrl, license: item.license, license_url: item.licenseUrl, page_url: item.pageUrl, original_url: item.originalUrl,
      width: item.realWidth || item.width, height: item.realHeight || item.height, dhash: item.dhash, brightness: item.brightness,
      topic: context.topic.name, weather: context.weather ? context.weather.word : null, season: context.season.ru,
      query: item.query, focus_x: pick.focus ? pick.focus.x : null, focus_y: pick.focus ? pick.focus.y : null, files: 1, dir: dir,
      reason: reason + (pick.reasons ? ' · ' + pick.reasons : ''), dry: options.dryRun ? 1 : 0, manual: options.manual ? 1 : 0,
      judged: pick.judged || null, download_location: item.downloadLocation || null, country: item.country || null
    };
    if (options.dryRun) {
      row.mode = 'проба';
      row.screens = '';
      var dryId = insertRow(row);
      outcome = { ok: true, dry: true, id: dryId, title: item.title, credit: sources.credit(item), reason: row.reason, notes: notes, status: found.status, dropped: found.dropped };
      return outcome;
    }
    progress('set', 'Ставлю обои');
    var result = setOnPhone(settings, state, made);
    row.mode = result.ok ? result.mode : 'вручную';
    row.screens = (result.screens || []).join(',');
    var id = insertRow(row);
    if (coverItem) {
      // The second picture of the day (outer screen) is in the history too, so it does not repeat.
      insertRow({ day: context.day, set_at: Date.now(), source: coverItem.source, source_id: coverItem.sourceId, title: coverItem.title,
        author: coverItem.author, author_url: coverItem.authorUrl, license: coverItem.license, license_url: coverItem.licenseUrl,
        page_url: coverItem.pageUrl, original_url: coverItem.originalUrl, width: coverItem.realWidth || coverItem.width,
        height: coverItem.realHeight || coverItem.height, dhash: coverItem.dhash, brightness: coverItem.brightness, topic: context.topic.name,
        weather: row.weather, season: row.season, query: coverItem.query, files: 0, dir: dir, reason: 'внешний экран к #' + id, dry: 0,
        mode: 'внешний', screens: 'cover', manual: row.manual, again: id, country: coverItem.country || null });
    }
    state = loadState();
    state.current = id;
    state.manualNeeded = result.ok ? null : { id: id, why: result.error };
    if (result.ok && item.source === 'unsplash' && item.downloadLocation) {
      phone.ping(item.downloadLocation, { Authorization: 'Client-ID ' + (keyOf('unsplash') || ''), 'Accept-Version': 'v1', 'User-Agent': sources.USER_AGENT });
    }
    if (result.ok && item.source === 'unsplash' && !item.country) {
      var country = unsplashCountry(item.sourceId);
      if (country) db.exec('update history set country = ? where id = ?', [country, id]);
    }
    saveState(state);
    var saved = getRow(id);
    if (result.ok) notifySet(settings, saved);
    else if (settings.notifyErrors) {
      try {
        axiko.notify({ title: 'Обои подобраны, но не поставлены', text: result.error + '. Откройте «Обои дня» и нажмите «Поставить вручную».', open: SCREEN, silent: true, id: NOTICE_ID });
      } catch (ignored) { /* no notice */ }
    }
    changed(id);
    awards();
    outcome = {
      ok: result.ok, id: id, title: item.title, credit: sources.credit(item), reason: row.reason, mode: row.mode,
      screens: result.screens || [], notes: notes, status: found.status, dropped: found.dropped, error: result.ok ? null : result.error
    };
    return outcome;
  } catch (error) {
    outcome.ok = false;
    outcome.error = outcome.error || phone.message(error);
    return outcome;
  } finally {
    cleanCache(cacheDir);
    try {
      var last = loadState();
      last.lastRun = {
        at: started, ms: Date.now() - started, ok: outcome.ok, dry: Boolean(options.dryRun), error: outcome.error || null,
        notes: notes.slice(0, 12), status: outcome.status || [], dropped: outcome.dropped || {}
      };
      saveState(last);
    } catch (ignored) { /* state is best effort */ }
    progress('done', '');
    running.unlock();
  }
};

/** Stage 1 of the description: any picture by its link, cropped by the middle, on the screens. */
exports.setFromUrl = function (url, title) {
  var settings = loadSettings();
  var state = loadState();
  var day = today();
  var dir = dirFor(day);
  var name = decodeURIComponent(String(url).split('?')[0].split('/').pop() || 'картинка').replace(/\.[a-z0-9]+$/i, '');
  var item = { source: 'url', sourceId: String(url), originalUrl: String(url), title: title || name };
  var made = makeFiles(settings, item, null, dir, null, null);
  var seen = null;
  try { seen = phone.analyze(dir + '/thumb.jpg'); } catch (ignored) { /* the hash is a nicety here */ }
  var result = setOnPhone(settings, state, made);
  var id = insertRow({
    day: day, set_at: Date.now(), source: 'url', source_id: String(url), title: item.title, author: 'не указан', license: 'неизвестна (поставлено по ссылке)',
    page_url: String(url), original_url: String(url), width: item.realWidth, height: item.realHeight, files: 1, dir: dir,
    dhash: seen ? seen.dhash : null, brightness: seen ? seen.brightness : null,
    reason: 'по ссылке', mode: result.ok ? result.mode : 'вручную', screens: (result.screens || []).join(','), manual: 1, dry: 0
  });
  state = loadState();
  state.current = id;
  state.manualNeeded = result.ok ? null : { id: id, why: result.error };
  saveState(state);
  changed(id);
  return { ok: result.ok, id: id, mode: result.mode, screens: result.screens, error: result.error || null };
};

/** Puts a picture from the history on the screens again (its files are re-made if they were cleaned). */
exports.setAgain = function (id, why) {
  var settings = loadSettings();
  var row = getRow(id);
  if (!row) throw new Error('Нет такой картинки в истории');
  if (!restoreFiles(settings, row)) throw new Error('Файлов этой картинки больше нет, и ссылка на оригинал не сохранилась');
  var state = loadState();
  var result = setOnPhone(settings, state, filesOf(row));
  var copyId = insertRow({
    day: today(), set_at: Date.now(), source: row.source, source_id: row.source_id, title: row.title, author: row.author, author_url: row.author_url,
    license: row.license, license_url: row.license_url, page_url: row.page_url, original_url: row.original_url, width: row.width, height: row.height,
    dhash: row.dhash, brightness: row.brightness, topic: row.topic, weather: row.weather, season: row.season, query: row.query,
    focus_x: row.focus_x, focus_y: row.focus_y, favorite: row.favorite, vote: row.vote, files: 1, dir: row.dir, country: row.country || null,
    reason: why || 'поставлено снова', mode: result.ok ? result.mode : 'вручную', screens: (result.screens || []).join(','), manual: 1, dry: 0, again: row.again || row.id
  });
  state = loadState();
  state.current = copyId;
  state.manualNeeded = result.ok ? null : { id: copyId, why: result.error };
  saveState(state);
  changed(copyId);
  return { ok: result.ok, id: copyId, title: row.title, mode: result.mode, error: result.error || null };
};

/** «Вернуть вчерашние»: the picture before the current one again; the current gets a weak minus. */
exports.revert = function () {
  var settings = loadSettings();
  var state = loadState();
  var current = state.current ? getRow(state.current) : null;
  var previous = db.query('select * from history where dry = 0 and reverted = 0 and coalesce(screens, \'\') != ? and id != ? ' +
    (current ? 'and not (source = ? and source_id = ?) ' : '') + 'order by set_at desc limit 1',
  current ? ['cover', current.id, current.source, current.source_id] : ['cover', -1])[0];
  if (!previous) return { ok: false, error: 'Вернуть нечего: это первые обои' };
  if (current) {
    db.exec('update history set reverted = 1 where id = ?', [current.id]);
    if (current.day === today()) {
      select.voteTargets(current).forEach(function (target) { bump(target.kind, target.value, -settings.revertPenalty); });
    }
  }
  var result = exports.setAgain(previous.id, 'вернули вчерашние');
  return result;
};

/** «Другие сейчас»: a new pick right away, no more often than the setting allows. */
exports.other = function () {
  var settings = loadSettings();
  var state = loadState();
  var hour = Date.now() - 3600000;
  var times = (state.otherTimes || []).filter(function (time) { return time > hour; });
  if (times.length >= settings.otherPerHour) {
    var wait = Math.ceil((times[0] + 3600000 - Date.now()) / 60000);
    return { ok: false, limited: true, error: 'Лимит: ' + settings.otherPerHour + ' раз в час. Попробуйте через ' + wait + ' мин' };
  }
  times.push(Date.now());
  patchState({ otherTimes: times });
  var current = state.current ? getRow(state.current) : null;
  if (current && current.day === today()) {
    select.voteTargets(current).forEach(function (target) { bump(target.kind, target.value, -settings.revertPenalty / 2); });
  }
  return exports.run({ manual: true });
};

/** «Поставь что-нибудь с горами»: a pick on a topic (its name) or on English words. */
exports.pickTopic = function (topicOrWords) {
  var settings = loadSettings();
  var known = findTopic(settings, topicOrWords);
  if (known) return exports.run({ manual: true, topic: known.name });
  return exports.run({ manual: true, query: String(topicOrWords) });
};

/** Puts a picture into the favourites or takes it out (every row of that picture). */
exports.favorite = function (args, on) {
  var id = args && typeof args === 'object' ? args.id : args;
  var value = args && typeof args === 'object' && args.on !== undefined ? args.on : on;
  var state = loadState();
  var row = getRow(id || state.current);
  if (!row) throw new Error('Нет такой картинки');
  var next = value === undefined ? !row.favorite : Boolean(value);
  db.exec('update history set favorite = ? where source = ? and source_id = ?', [next ? 1 : 0, row.source, row.source_id]);
  if (next && !hasFiles(row)) {
    try { restoreFiles(loadSettings(), row); } catch (ignored) { /* the original may be gone */ }
  }
  changed(row.id);
  if (next) awards();
  return { id: row.id, favorite: next };
};

/** «Больше такого» (1) / «Меньше такого» (−1): the topic, the author, the source and the words move. */
exports.vote = function (id, value) {
  var settings = loadSettings();
  var state = loadState();
  var row = getRow(id || state.current);
  if (!row) throw new Error('Нет такой картинки');
  var v = Number(value) > 0 ? 1 : Number(value) < 0 ? -1 : 0;
  var delta = v - (row.vote || 0);
  db.exec('update history set vote = ? where source = ? and source_id = ?', [v, row.source, row.source_id]);
  if (delta) {
    select.voteTargets(row).forEach(function (target) { bump(target.kind, target.value, delta); });
    remember('Вкус к обоям: ' + (v > 0 ? 'нравится' : 'не нравится') + ' — тема «' + (row.topic || '') + '», ' +
      (row.author ? 'автор ' + row.author + ', ' : '') + 'запрос «' + (row.query || '') + '», «' + row.title + '»');
  }
  changed(row.id);
  return { id: row.id, vote: v };
};

/** For the agent: «больше не показывай города» → prefer('word', 'city', -3); kind: topic | author | source | word. */
exports.prefer = function (kind, value, delta) {
  if (['topic', 'author', 'source', 'word'].indexOf(kind) < 0) throw new Error('kind — topic, author, source или word');
  bump(kind, value, Number(delta) || 0);
  remember('Вкус к обоям: ' + (delta > 0 ? 'больше' : 'меньше') + ' — ' + kind + ' «' + value + '»');
  return exports.weights();
};

/** The learned taste: [{ kind, value, weight }]. */
exports.weights = function () {
  return db.query('select kind, value, weight from weights where weight != 0 order by kind, weight desc');
};

exports.forgetWeight = function (kind, value) {
  db.exec('delete from weights where kind = ? and value = ?', [kind, String(value).toLowerCase()]);
  return exports.weights();
};

// ---- the schedule -----------------------------------------------------------------------------

/**
 * The favourite shown longest ago, if it rested favoriteGapDays; anyway: the longest rested even
 * if not enough (without Wi-Fi a favourite is better than yesterday's picture).
 */
function pickFavorite(settings, anyway) {
  var favorites = db.query('select source, source_id, max(set_at) as last, max(id) as id from history where favorite = 1 and dry = 0 ' +
    'group by source, source_id order by last asc');
  if (!favorites.length) return null;
  var gap = settings.favoriteGapDays * 864e5;
  var ready = favorites.filter(function (row) { return Date.now() - row.last >= gap; });
  if (ready.length) return ready[0];
  return anyway ? favorites[0] : null;
}

function setFavoriteOfDay(settings, why, anyway) {
  var chosen = pickFavorite(settings, anyway);
  if (!chosen) return null;
  var result = exports.setAgain(chosen.id, why);
  if (result.ok) notifySet(settings, getRow(result.id), 'Обои из избранного: ' + result.title);
  changed(result.id);
  return result;
}

function retryOff() {
  try { unjob('wallpapers.retry'); } catch (ignored) { /* none */ }
  patchState({ pending: null });
}

function retryLater(settings) {
  var at = Date.now() + settings.retryMinutes * 60000;
  if (phone.has('job.once')) job('wallpapers.retry', { once: at }, exports.retry);
  else job('wallpapers.retry', { every: settings.retryMinutes }, exports.retry);
}

/** The morning job: a new picture — or a favourite on the favourite days — and the notice. */
exports.daily = function () {
  var settings = loadSettings();
  if (!settings.enabled) return { ok: false, error: 'выключено в настройках' };
  var day = today();
  var manual = db.query('select id from history where day = ? and dry = 0 and manual = 1 limit 1', [day]);
  if (manual.length) return { ok: true, skipped: 'сегодня обои уже выбраны вручную' };
  exports.clean();
  if (settings.favoriteDays.indexOf(ctx.weekday(new Date())) >= 0) {
    var favorite = setFavoriteOfDay(settings, 'день из избранного');
    if (favorite) return favorite;
  }
  if (settings.wifiOnly && !phone.network().wifi) {
    patchState({ pending: { day: day, since: Date.now() } });
    retryLater(settings);
    return { ok: false, pending: true, error: 'нет Wi-Fi — повторю через ' + settings.retryMinutes + ' мин' };
  }
  var outcome = exports.run({});
  if (!outcome.ok && !outcome.busy && settings.notifyErrors && outcome.id === undefined) {
    try {
      axiko.notify({ title: 'Обои не сменились', text: outcome.error || 'не получилось', open: SCREEN, silent: true, id: NOTICE_ID });
    } catch (ignored) { /* no notice */ }
  }
  return outcome;
};

/** Without Wi-Fi in the morning: tried again until the setting's hour, then a favourite. */
exports.retry = function () {
  var settings = loadSettings();
  var state = loadState();
  if (!state.pending || state.pending.day !== today()) {
    retryOff();
    return { ok: false, error: 'нечего повторять' };
  }
  if (phone.network().wifi) {
    retryOff();
    return exports.run({});
  }
  if (ctx.atOrAfter(Date.now(), settings.retryUntil)) {
    retryOff();
    return setFavoriteOfDay(settings, 'без Wi-Fi до ' + settings.retryUntil + ' — из избранного', true) || { ok: false, error: 'Wi-Fi так и не появился, избранного нет' };
  }
  if (phone.has('job.once')) retryLater(settings);
  return { ok: false, pending: true };
};

function onNetwork(event) {
  if (!event || !event.wifi) return;
  var state = loadState();
  if (!state.pending || state.pending.day !== today()) return;
  spawn(function () { exports.retry(); });
}

/** Registers the morning job and the network listener; boot calls it (module.json: autostart). */
exports.start = function () {
  var settings = loadSettings();
  if (settings.enabled) job('wallpapers.daily', { at: settings.time }, exports.daily);
  else {
    try { unjob('wallpapers.daily'); } catch (ignored) { /* none */ }
  }
  on('network', onNetwork, 'wallpapers.network');
  var state = loadState();
  if (state.pending && state.pending.day === today()) retryLater(settings);
  else if (state.pending) retryOff();
  return { ok: true, time: settings.time, enabled: settings.enabled };
};

exports.stop = function () {
  try { unjob('wallpapers.daily'); } catch (ignored) { /* none */ }
  retryOff();
  return true;
};

/** Removes the full files of old pictures (not the favourites, not the thumbnails) and dry runs' leftovers. */
exports.clean = function () {
  var settings = loadSettings();
  var limit = ctx.dayKey(new Date(Date.now() - settings.keepFiles * 864e5));
  var old = db.query('select distinct dir from history where files = 1 and dir is not null and day < ? and dir not in ' +
    '(select dir from history where favorite = 1 and dir is not null) and dir not in (select dir from history where day >= ? and dir is not null)', [limit, limit]);
  old.forEach(function (row) {
    ['inner.jpg', 'cover.jpg'].forEach(function (name) {
      try { axiko.files.remove(row.dir + '/' + name); } catch (ignored) { /* gone */ }
    });
    db.exec('update history set files = 0 where dir = ?', [row.dir]);
  });
  try { axiko.files.remove(DATA + '/cache'); } catch (ignored) { /* none */ }
  return { cleaned: old.length };
};

/** Removes the picks of dry runs (the «не ставить, только выбрать» trials) with their files; id — only that one. */
exports.clearDry = function (id) {
  var rows = id ? db.query('select id, dir from history where dry = 1 and id = ?', [id]) : db.query('select id, dir from history where dry = 1');
  rows.forEach(function (row) {
    var shared = db.query('select count(*) as n from history where dir = ? and id != ?', [row.dir, row.id])[0].n;
    if (row.dir && !shared) {
      try { axiko.files.remove(row.dir); } catch (ignored) { /* gone */ }
    }
    db.exec('delete from history where id = ?', [row.id]);
  });
  return { removed: rows.length };
};

// ---- for the screen and the agent ---------------------------------------------------------------

/** What the «Сегодня» tab shows. */
exports.today = function () {
  var settings = loadSettings();
  var state = loadState();
  var current = state.current ? rowUrls(getRow(state.current)) : null;
  var plan = foldPlan(settings, state);
  var hour = Date.now() - 3600000;
  var left = settings.otherPerHour - (state.otherTimes || []).filter(function (time) { return time > hour; }).length;
  var previous = db.query('select count(*) as n from history where dry = 0 and reverted = 0 and coalesce(screens, \'\') != ?' + (current ? ' and id != ?' : ''),
    current ? ['cover', current.id] : ['cover'])[0].n;
  return {
    current: current,
    canRevert: previous > 0,
    otherLeft: Math.max(0, left),
    running: running.isLocked(),
    lastRun: state.lastRun || null,
    manualNeeded: state.manualNeeded || null,
    pending: state.pending || null,
    plan: plan,
    foldLine: fold.honest(plan, (state.fold || {}).summary || null),
    canSet: phone.canSet(),
    weather: state.weather || null,
    place: state.place || null,
    settings: { innerWidth: settings.innerWidth, innerHeight: settings.innerHeight, coverWidth: settings.coverWidth, coverHeight: settings.coverHeight, time: settings.time, enabled: settings.enabled }
  };
};

/** The history: { limit, offset, favorites } → rows with picture links, newest first. */
exports.history = function (options) {
  options = options || {};
  var limit = Math.max(1, Math.min(500, Number(options.limit) || 60));
  var offset = Math.max(0, Number(options.offset) || 0);
  var rows;
  if (options.favorites) {
    rows = db.query('select * from history where id in (select max(id) from history where favorite = 1 and dry = 0 and coalesce(screens, \'\') != ? group by source, source_id) ' +
      'order by set_at desc limit ' + limit + ' offset ' + offset, ['cover']);
  } else {
    rows = db.query('select * from history where dry = 0 order by set_at desc limit ' + limit + ' offset ' + offset);
  }
  return rows.map(rowUrls);
};

exports.get = function (id) { return rowUrls(getRow(id)); };

exports.openOriginal = function (id) {
  var row = getRow(id || loadState().current);
  if (!row) throw new Error('Нет такой картинки');
  axiko.openUrl(row.page_url || row.original_url);
  return true;
};

/** Without the permission: the system's own «set as wallpaper» screen for this picture. */
exports.applyManually = function (id) {
  var state = loadState();
  var row = getRow(id || (state.manualNeeded && state.manualNeeded.id) || state.current);
  if (!row) throw new Error('Нет такой картинки');
  var settings = loadSettings();
  if (!restoreFiles(settings, row)) throw new Error('Файлов этой картинки больше нет');
  var opened = phone.openSetIntent(row.dir + '/inner.jpg', 'axiko-wallpaper-' + row.day + '.jpg', state.mediaUri || null);
  patchState({ mediaUri: opened.uri, manualNeeded: null });
  return opened;
};

// ---- settings, keys, place, screens -------------------------------------------------------------

exports.settings = function () {
  var settings = loadSettings();
  var state = loadState();
  var plan = foldPlan(settings, state);
  return {
    values: settings,
    schema: settingsLib.SCHEMA,
    keys: keys(),
    keyInfo: sources.KEYS,
    sourceNames: sources.NAMES,
    spaceOnly: sources.SPACE_ONLY,
    canSet: phone.canSet(),
    features: phone.features(),
    plan: plan,
    foldLine: fold.honest(plan, (state.fold || {}).summary || null),
    fold: state.fold || null,
    place: state.place || null,
    location: phone.hasLocationPermission(),
    models: { query: model('wallpapers.query'), judge: model('wallpapers.judge') }
  };
};

exports.saveSettings = function (values) {
  var merged = loadSettings();
  Object.keys(values || {}).forEach(function (key) { merged[key] = values[key]; });
  var normalized = settingsLib.normalize(merged);
  axiko.files.writeJson(DATA + '/settings.json', normalized);
  exports.start();
  return exports.settings();
};

/** Sets one setting by name (for the agent: «меняй обои в 8» → set('time', '08:00')). */
exports.set = function (key, value) {
  var patch = {};
  patch[key] = value;
  return exports.saveSettings(patch).values[key];
};

/** Asks the owner for a source's key in the system dialog (never in the chat). */
exports.askKey = function (source) {
  var info = sources.KEYS[source];
  if (!info) throw new Error('Этому источнику ключ не нужен');
  return axiko.secret.ask(info.secret, info.title, 'Ключ берётся бесплатно: ' + info.site);
};

exports.removeKey = function (source) {
  var info = sources.KEYS[source];
  if (!info) return false;
  axiko.secret.remove(info.secret);
  return true;
};

exports.keys = keys;

/** Asks for the coarse location (from the screen) and finds the place. */
exports.askLocation = function () {
  var granted = axiko.permission(['ACCESS_COARSE_LOCATION']);
  var state = loadState();
  var notes = [];
  var place = granted ? placeFor(loadSettings(), state, notes) : null;
  return { granted: granted, place: place, note: notes.join('; ') };
};

exports.place = function () {
  var notes = [];
  var place = placeFor(loadSettings(), loadState(), notes);
  return { place: place, note: notes.join('; ') };
};

/** The reflection probe of the Fold's screens; the raw lists go to data/wallpapers/fold-probe.json. */
exports.probeFold = function () {
  var raw = phone.probeFold();
  axiko.files.writeJson(DATA + '/fold-probe.json', raw);
  var summary = fold.summarize(raw);
  var state = loadState();
  var info = state.fold || {};
  info.summary = summary;
  info.at = Date.now();
  state.fold = info;
  saveState(state);
  var plan = foldPlan(loadSettings(), state);
  return { summary: summary, shell: raw.shell, plan: plan, line: fold.honest(plan, summary) };
};

/** Tries a found flag with the current outer-screen crop: the owner folds the phone and looks. */
exports.testFlag = function (name, withSystem) {
  var state = loadState();
  var summary = (state.fold || {}).summary;
  var flag = summary && summary.flags.filter(function (f) { return f.name === name; })[0];
  if (!flag) throw new Error('Такого флага разведка не нашла');
  var current = state.current ? getRow(state.current) : null;
  if (!current || !hasFiles(current)) throw new Error('Сначала подберите обои: проверка ставит внешний кадр текущих');
  var which = withSystem ? (flag.value | android.app.WallpaperManager.FLAG_SYSTEM) : flag.value;
  try {
    phone.testFlag(current.dir + '/cover.jpg', which);
  } catch (error) {
    return { ok: false, error: phone.message(error) };
  }
  var info = state.fold || {};
  info.testing = { name: flag.name, value: flag.value, which: which, at: Date.now() };
  state.fold = info;
  saveState(state);
  return { ok: true, which: which, ask: 'Сложите телефон: на внешнем экране узкий кадр этих обоев, а внутренний не изменился?' };
};

/** The owner's answer after testFlag: true — the flag works and is used from now on. */
exports.confirmFlag = function (works) {
  var state = loadState();
  var info = state.fold || {};
  if (!info.testing) throw new Error('Сначала проверьте флаг');
  if (works) {
    info.confirmed = info.testing;
    if (info.failed) delete info.failed.flag;
  } else {
    info.rejected = (info.rejected || []).concat([info.testing.name + ' (' + info.testing.which + ')']);
  }
  info.testing = null;
  state.fold = info;
  saveState(state);
  var current = state.current ? getRow(state.current) : null;
  if (current && hasFiles(current)) {
    // Put back what the test changed.
    try { setOnPhone(loadSettings(), state, filesOf(current)); } catch (ignored) { /* the next morning fixes it */ }
  }
  return exports.settings();
};

exports.forgetFold = function () {
  patchState({ fold: null });
  return exports.settings();
};

/** The screen in front now, in pixels — to write the sizes of the outer or the inner screen into the settings. */
exports.screenNow = function () { return phone.screenNow(); };

/** The home-screen widget: «Обои дня» / «Туман над Ладогой · Unsplash · 07:00». */
exports.widget = function () {
  var state = loadState();
  var row = state.current ? getRow(state.current) : null;
  if (!row) return { title: 'Обои дня', text: 'Обои ещё не выбирались', open: SCREEN };
  var time = new Date(row.set_at);
  var clock = (time.getHours() < 10 ? '0' : '') + time.getHours() + ':' + (time.getMinutes() < 10 ? '0' : '') + time.getMinutes();
  var out = { title: 'Обои дня', text: row.title + '\n' + (sources.NAMES[row.source] || row.source) + ' · ' + clock, open: SCREEN };
  if (phone.has('widget.image') && row.dir && axiko.files.exists(row.dir + '/thumb.jpg')) out.image = row.dir + '/thumb.jpg';
  return out;
};

/** Numbers for other modules (Ачивки): { shown, favorites, sources: { id: count }, authors }. */
exports.stats = function () {
  var shown = db.query('select count(distinct source || \':\' || source_id) as n from history where dry = 0')[0].n;
  var favorites = db.query('select count(distinct source || \':\' || source_id) as n from history where dry = 0 and favorite = 1')[0].n;
  var authors = db.query('select count(distinct lower(author)) as n from history where dry = 0 and author is not null')[0].n;
  var bySource = {};
  db.query('select source, count(distinct source_id) as n from history where dry = 0 group by source').forEach(function (row) { bySource[row.source] = row.n; });
  var countries = db.query("select count(distinct lower(country)) as n from history where dry = 0 and country is not null and country != ''")[0].n;
  return { shown: shown, favorites: favorites, sources: bySource, authors: authors, countries: countries };
};

// ---- achievements -----------------------------------------------------------------------------

/** The two achievements of the description; the thresholds are settings. */
var AWARDS = [
  { key: 'wallpapers/collector', stat: 'favorites', setting: 'collectorFavorites', title: 'Коллекционер', icon: 'star',
    text: function (n) { return n + ' обоев в избранном'; } },
  { key: 'wallpapers/traveller', stat: 'countries', setting: 'travellerCountries', title: 'Путешественник', icon: 'globe',
    text: function (n) { return 'Обои из ' + n + ' стран'; } }
];

/** Hands an achievement to the achievements module (grant), or leaves it in its outbox while the module is missing. */
function handIn(item) {
  if (axiko.files.exists(ACHIEVEMENTS)) {
    try {
      require(ACHIEVEMENTS).grant(item);
      return true;
    } catch (error) {
      console.warn('wallpapers: ачивка ' + item.key + ': ' + phone.message(error));
      return false;
    }
  }
  try {
    var box = axiko.files.readJson(OUTBOX, []);
    var list = Array.isArray(box) ? box : (box && Array.isArray(box.items) ? box.items : []);
    if (!list.some(function (one) { return one && one.key === item.key; })) list.push(item);
    if (Array.isArray(box) || !box) axiko.files.writeJson(OUTBOX, list);
    else {
      box.items = list;
      axiko.files.writeJson(OUTBOX, box);
    }
    return true;
  } catch (error) {
    console.warn('wallpapers: ящик ачивок: ' + phone.message(error));
    return false;
  }
}

/** Checks the counts against the thresholds and hands in what was reached, once each. Returns the keys handed in. */
function awards() {
  try {
    var settings = loadSettings();
    if (!settings.awards) return [];
    var stats = exports.stats();
    var given = loadState().awarded || {};
    var out = [];
    AWARDS.forEach(function (award) {
      var need = settings[award.setting];
      if (given[award.key] || !(stats[award.stat] >= need)) return;
      var item = { key: award.key, source: ID, category: 'Обои', title: award.title, text: award.text(need), at: Date.now(), icon: award.icon };
      if (handIn(item)) {
        given[award.key] = Date.now();
        out.push(award.key);
      }
    });
    if (out.length) patchState({ awarded: given });
    return out;
  } catch (error) {
    console.warn('wallpapers: ачивки: ' + phone.message(error));
    return [];
  }
}
exports.awards = awards;

/** Unsplash search answers seldom carry the place; the photo's own page does: its country, or ''. */
function unsplashCountry(photoId) {
  var key = keyOf('unsplash');
  if (!key || !photoId) return '';
  try {
    var answer = phone.getJson('https://api.unsplash.com/photos/' + encodeURIComponent(photoId),
      { Authorization: 'Client-ID ' + key, 'Accept-Version': 'v1', 'User-Agent': sources.USER_AGENT });
    var location = answer.ok && answer.json ? answer.json.location : null;
    return location && location.country ? String(location.country).trim().slice(0, 60) : '';
  } catch (error) {
    return '';
  }
}

/** A short answer for the agent and the voice: what is on the screens now. */
exports.describe = function () {
  var state = loadState();
  var row = state.current ? getRow(state.current) : null;
  if (!row) return 'Обои ещё не выбирались.';
  return 'Сейчас обои «' + row.title + '». ' + rowUrls(row).credit + ', лицензия ' + (row.license || 'не указана') + '. Почему: ' + (row.reason || '—') + '.';
};
