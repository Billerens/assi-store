// node tests/links.test.js — the pet's links to its neighbours, through main.js on a pretend phone:
// the Rhino globals, lib/axiko and lib/base are stand-ins, the neighbours («Здоровье», «Тайная жизнь
// телефона», «Фокус», «Игротека», «Ачивки») are fakes that are there or not. Every link is checked
// with the neighbour present and absent.
var assert = require('assert');
var path = require('path');
var Module = require('module');
var Links = require('../links.js');
var Mood = require('../mood.js');
var Settings = require('../settings.js');

var passed = 0;
var failed = 0;
function test(name, fn) {
  try {
    fresh();
    fn();
    passed++;
  } catch (error) {
    failed++;
    console.error('FAIL ' + name + '\n  ' + (error && error.stack ? error.stack.split('\n').slice(0, 4).join('\n  ') : error));
  }
}

// ---- the pretend phone --------------------------------------------------------------------------

var NOW = new Date(2026, 10, 14, 15, 0, 0, 0).getTime();
var realNow = Date.now;
Date.now = function () { return world.now; };

var GOALS = { stepsGoal: 8000, sleepGoal: 450, waterGoal: 2000, glassMl: 250, dayEnd: '05:00', nightStart: '00:30', nightEnd: '05:00' };
function healthDay(patch) {
  var out = {
    date: '2026-11-14', hour: 15, minute: 15 * 60, night: false, screenOn: true,
    known: { sleep: true, steps: true, screen: true }, sleepMin: 450, steps: 6000, stepsGoal: 8000, sleepGoal: 450,
    prevLateMin: 20, prevKnownScreen: true, habitsDue: 0, habitsDone: 0, medsDue: 0, medsTaken: 0, waterMl: 1000, waterGoal: 2000,
    newPlaces: 0, left: [], paused: null, goals: GOALS
  };
  Object.keys(patch || {}).forEach(function (key) { out[key] = patch[key]; });
  return out;
}

var world;
function fresh() {
  world = { now: NOW, files: {}, modules: {}, records: [], jobs: {}, emitted: [], notices: [], features: ['job.once'], day: healthDay() };
  world.modules['modules/health/main.js'] = {
    today: function () { return JSON.parse(JSON.stringify(world.day)); },
    hook: function () {}, hooks: function () { return []; }, habits: function () { return []; }
  };
  delete global.__petLock;
}

function exists(p) {
  return world.files[p] !== undefined || world.modules[p] !== undefined;
}

var axikoMock = {
  files: {
    exists: exists,
    read: function (p) {
      if (/^modules\/pet\//.test(p)) return require('fs').readFileSync(path.join(__dirname, '..', p.slice('modules/pet/'.length)), 'utf8');
      if (world.files[p] === undefined) throw new Error('нет файла ' + p);
      return world.files[p];
    },
    readJson: function (p, fallback) {
      if (p === 'modules/pet/phrases.json') return JSON.parse(JSON.stringify(require('../phrases.json')));
      return world.files[p] === undefined ? fallback : JSON.parse(world.files[p]);
    },
    write: function (p, text) { world.files[p] = String(text); },
    writeJson: function (p, value) { world.files[p] = JSON.stringify(value); },
    remove: function (p) { delete world.files[p]; },
    path: function (p) { return p; }
  },
  widget: { refresh: function () {} },
  notify: function (options) { world.notices.push(options); }
};

var baseMock = {
  find: function (q) {
    return world.records.filter(function (r) {
      if (q.kind && r.kind !== q.kind) return false;
      if (q.source && r.source !== q.source) return false;
      if (q.since !== undefined && r.at < q.since) return false;
      return true;
    }).slice(0, q.limit || 100);
  },
  add: function (r) { world.records.push(r); return world.records.length; }
};

var MAIN_PATH = path.join(__dirname, '..', 'main.js');
var originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'lib/axiko') return axikoMock;
  if (request === 'lib/base') return baseMock;
  if (/^modules\//.test(request) && !/^modules\/pet\//.test(request)) {
    if (!world.modules[request]) throw new Error('нет модуля ' + request);
    return world.modules[request];
  }
  if (/^modules\/pet\//.test(request)) return originalLoad.call(this, path.join(__dirname, '..', request.slice('modules/pet/'.length)), parent, isMain);
  return originalLoad.apply(this, arguments);
};

global.native = function (method) {
  if (method === 'shell.features') return world.features;
  if (method === 'job.list') return world.jobs;
  throw new Error('нет операции ' + method);
};
global.on = function () {};
global.off = function () {};
global.job = function (key, when, fn) { world.jobs[key] = { when: when, fn: fn }; };
global.unjob = function (key) { delete world.jobs[key]; };
global.spawn = function (fn) { fn(); };
global.emit = function (name, data) { world.emitted.push([name, data]); };
global.java = { util: { concurrent: { locks: { ReentrantLock: function () {
  return { lock: function () {}, unlock: function () {} };
} } } } };

function pet() {
  delete require.cache[MAIN_PATH];
  return require(MAIN_PATH);
}

function settings(patch) {
  world.files['data/pet/settings.json'] = JSON.stringify(Object.assign({}, Settings.DEFAULTS, patch || {}));
}

function items() {
  return world.files['data/pet/items.json'] ? JSON.parse(world.files['data/pet/items.json']) : [];
}

// ---- links.js on its own ----------------------------------------------------------------------------

test('links: the night before a day, the minutes in any shape', function () {
  assert.strictEqual(Links.nightBefore('2026-11-14'), '2026-11-13');
  assert.strictEqual(Links.nightBefore('2026-03-01'), '2026-02-28');
  assert.strictEqual(Links.nightBefore('нет'), null);
  assert.strictEqual(Links.minutesOf(42, '2026-11-13'), 42);
  assert.strictEqual(Links.minutesOf({ ownerMinutes: 12, night: '2026-11-13' }, '2026-11-13'), 12);
  assert.strictEqual(Links.minutesOf({ ownerMinutes: 12, night: '2026-11-12' }, '2026-11-13'), null, 'another night');
  assert.strictEqual(Links.minutesOf({ minutes: 7 }, '2026-11-13'), 7);
  assert.strictEqual(Links.minutesOf(null, '2026-11-13'), null);
  assert.strictEqual(Links.minutesFromRows([{ night: '2026-11-12', ownerMinutes: 5 }, { night: '2026-11-13', ownerMinutes: 0 }], '2026-11-13'), 0);
  assert.strictEqual(Links.minutesFromRows(null, '2026-11-13'), null);
});

test('links: withLate prefers phone-night, keeps health otherwise', function () {
  var S = Settings.merge({});
  var t = healthDay();
  var pn = Links.withLate(t, S, 50);
  assert.strictEqual(pn.prevLateMin, 50);
  assert.strictEqual(pn.lateSource, 'phone-night');
  assert.strictEqual(t.prevLateMin, 20, 'the day of health is not changed');
  assert.strictEqual(Links.withLate(t, S, null).lateSource, 'health');
  assert.strictEqual(Links.withLate(t, S, null).prevLateMin, 20);
  assert.strictEqual(Links.withLate(t, Settings.merge({ phoneNightOn: false }), 50).prevLateMin, 20, 'the setting off');
});

test('links: a Focus session from left() or its state file', function () {
  assert.deepStrictEqual(Links.focusOf({ running: true, kind: 'work', left: 60000 }, null, NOW), { left: 60000, paused: false });
  assert.strictEqual(Links.focusOf({ running: false }, null, NOW), null);
  assert.strictEqual(Links.focusOf({ running: true, kind: 'break', left: 60000 }, null, NOW), null, 'a break is not a session');
  assert.deepStrictEqual(Links.focusOf(null, { id: 'a', kind: 'work', endAt: NOW + 120000 }, NOW), { left: 120000, paused: false });
  assert.strictEqual(Links.focusOf(null, { id: 'a', kind: 'work', endAt: NOW - 1 }, NOW), null, 'past its end');
  assert.strictEqual(Links.focusOf(null, { id: 'a', kind: 'work', endAt: NOW - 1, pausedAt: NOW - 60000 }, NOW).paused, true);
  assert.strictEqual(Links.focusOf(null, {}, NOW), null);
  assert.strictEqual(Links.focusOf(null, null, NOW), null);
});

test('links: play minutes since the day began', function () {
  var since = Links.dayStart('2026-11-14', '05:00');
  assert.strictEqual(since, new Date(2026, 10, 14, 5, 0, 0, 0).getTime());
  var rows = [
    { kind: 'play', at: since + 1000, amount: 12, unit: 'min' },
    { kind: 'play', at: since - 1000, amount: 50, unit: 'min' },
    { kind: 'play', at: since + 2000, amount: 8 },
    { kind: 'steps', at: since + 3000, amount: 900 }
  ];
  assert.strictEqual(Links.playMinutes(rows, since), 20);
  assert.strictEqual(Links.playMinutes(null, since), 0);
});

test('links: rarities, the shelf, the badge', function () {
  var S = Settings.merge({});
  assert.strictEqual(S.shelfFrom, 'rare');
  assert.strictEqual(Links.reachesShelf('rare', 'rare'), true);
  assert.strictEqual(Links.reachesShelf('legendary', 'rare'), true);
  assert.strictEqual(Links.reachesShelf('uncommon', 'rare'), false);
  assert.strictEqual(Links.reachesShelf(undefined, 'rare'), false, 'no rarity is common');
  assert.strictEqual(Links.reachesShelf('legendary', 'off'), false);
  assert.strictEqual(Links.rarityOfDef({ rarity: ['uncommon', 'rare', 'epic'] }, 2), 'epic');
  assert.strictEqual(Links.rarityOfDef({ rarity: ['uncommon', 'rare'] }, 5), 'rare');
  assert.strictEqual(Links.rarityOfDef({ rarity: 'legendary' }, 0), 'legendary');
  assert.strictEqual(Links.rarityOfItem([{ id: 'year', rarity: 'legendary', item: { id: 'trophy', slot: 'shelf' } }], 'year'), 'legendary');
  assert.strictEqual(Links.rarityOfItem([{ id: 'walker', rarity: ['uncommon', 'rare', 'epic'], item: { id: 'hiking-hat', tier: 2 } }], 'walker'), 'epic');
  assert.strictEqual(Links.rarityOfItem([], 'year'), null);
  var badge = Links.badgeItem({ id: 'regime', title: 'Режим', rarity: 'rare' }, S, []);
  assert.deepStrictEqual(badge, { id: 'badge-regime-rare', from: 'regime', slot: 'shelf', rarity: 'rare', badge: true, title: 'Режим' });
  assert.strictEqual(Links.badgeItem({ id: 'ten', rarity: 'common' }, S, []), null, 'common stays off the shelf');
  assert.strictEqual(Links.badgeItem({ id: 'year', rarity: 'legendary' }, S, [{ id: 'trophy', from: 'year', slot: 'shelf' }]), null, 'the cup is already there');
  assert.strictEqual(Links.badgeItem({ id: 'regime', rarity: 'rare' }, S, [badge]), null, 'the same badge twice');
  assert.ok(Links.badgeItem({ id: 'regime', rarity: 'epic' }, S, [badge]), 'the next tier gets its own badge');
  var shelf = Links.shelf([{ id: 'a', slot: 'shelf', got: 1 }, { id: 'b', slot: 'shelf', rarity: 'epic', got: 2 }, { id: 'c', slot: 'head' }, { id: 'd', slot: 'shelf', rarity: 'epic', got: 3 }]);
  assert.deepStrictEqual(shelf.map(function (x) { return x.id; }), ['d', 'b', 'a']);
});

test('mood: a Focus session — calm and quiet, but not over a pause or the night', function () {
  var S = Settings.merge({});
  var focus = { left: 60000 };
  var m = Mood.compute(healthDay({ focus: focus, steps: 100, minute: 19 * 60 }), S);
  assert.strictEqual(m.state, 'calm');
  assert.strictEqual(m.focus, true);
  assert.strictEqual(m.reason, 'идёт сессия Фокуса');
  assert.strictEqual(Mood.compute(healthDay({ focus: focus, steps: 100, minute: 19 * 60 }), Settings.merge({ focusOn: false })).state, 'restless', 'the setting off');
  assert.strictEqual(Mood.compute(healthDay({ focus: focus, paused: 'sick' }), S).state, 'blanket');
  assert.strictEqual(Mood.compute(healthDay({ focus: focus, night: true, screenOn: false }), S).state, 'asleep');
  assert.strictEqual(Mood.compute(healthDay({ steps: 100, minute: 19 * 60 }), S).focus, false);
});

test('mood: games add a little energy, behind the setting', function () {
  var S = Settings.merge({});
  var base = Mood.compute(healthDay(), S).energy;
  assert.strictEqual(Mood.compute(healthDay({ playMin: 15 }), S).energy, Math.min(100, base + Math.round(S.playBonus * 15 / S.playFull)));
  assert.strictEqual(Mood.compute(healthDay({ playMin: 600 }), S).energy, Math.min(100, base + S.playBonus), 'no more than playBonus');
  assert.strictEqual(Mood.compute(healthDay({ playMin: 15 }), Settings.merge({ playOn: false })).energy, base);
  assert.strictEqual(Mood.compute(healthDay({ playMin: 0 }), S).energy, base);
  var lines = Mood.why(healthDay({ playMin: 15 }), Mood.compute(healthDay({ playMin: 15 }), S).factors, S);
  assert.ok(lines.some(function (l) { return l.key === 'play' && /Игры сегодня 15/.test(l.text.replace(/ /g, ' ')); }));
});

// ---- 1. the night screen: «Тайная жизнь телефона» over «Здоровье» -------------------------------------

test('late: without phone-night — lateMin of «Здоровье»', function () {
  var st = pet().recompute();
  assert.strictEqual(st.lateSource, 'health');
  assert.ok(Math.abs(st.factors.lateScore - (1 - 20 / 60)) < 1e-9);
});

test('late: phone-night present — its ownerMinutes of last night (nights())', function () {
  world.modules['modules/phone-night/main.js'] = { nights: function () { return [{ night: '2026-11-13', ownerMinutes: 50 }, { night: '2026-11-12', ownerMinutes: 5 }]; } };
  var p = pet();
  var st = p.recompute();
  assert.strictEqual(st.lateSource, 'phone-night');
  assert.ok(Math.abs(st.factors.lateScore - (1 - 50 / 60)) < 1e-9);
  var why = p.view({ quiet: true }).why.filter(function (l) { return l.key === 'late'; })[0];
  assert.ok(/в телефоне ночью/.test(why.text), why.text);
});

test('late: phone-night with its export ownerNight(night)', function () {
  var asked = null;
  world.modules['modules/phone-night/main.js'] = {
    ownerNight: function (night) { asked = night; return { night: night, to: NOW - 8 * 3600000, ownerMinutes: 70, sessions: 3 }; },
    nights: function () { return []; }
  };
  var st = pet().recompute();
  assert.strictEqual(asked, '2026-11-13');
  assert.strictEqual(st.lateSource, 'phone-night');
  assert.strictEqual(st.factors.lateScore, 0);
});

test('late: ownerNight() without that night (null) — nights(), then «Здоровье»', function () {
  world.modules['modules/phone-night/main.js'] = { ownerNight: function () { return null; }, nights: function () { return []; } };
  assert.strictEqual(pet().recompute().lateSource, 'health');
});

test('late: phone-night present, the night only in the common base', function () {
  world.modules['modules/phone-night/main.js'] = { nights: function () { return []; } };
  world.records.push({ kind: 'phone_night', source: 'phone-night', at: NOW - 8 * 3600000, data: { night: '2026-11-13', ownerMinutes: 30 } });
  var st = pet().recompute();
  assert.strictEqual(st.lateSource, 'phone-night');
  assert.ok(Math.abs(st.factors.lateScore - 0.5) < 1e-9);
});

test('late: phone-night present, the night not counted yet — back to «Здоровье»', function () {
  world.modules['modules/phone-night/main.js'] = { nights: function () { return [{ night: '2026-11-12', ownerMinutes: 90 }]; } };
  var st = pet().recompute();
  assert.strictEqual(st.lateSource, 'health');
  assert.ok(Math.abs(st.factors.lateScore - (1 - 20 / 60)) < 1e-9);
});

test('late: the setting off — «Здоровье» even with phone-night', function () {
  settings({ phoneNightOn: false });
  world.modules['modules/phone-night/main.js'] = { nights: function () { return [{ night: '2026-11-13', ownerMinutes: 50 }]; } };
  assert.strictEqual(pet().recompute().lateSource, 'health');
});

test('late: phone-night that throws does not break the pet', function () {
  world.modules['modules/phone-night/main.js'] = { nights: function () { throw new Error('база занята'); } };
  var st = pet().recompute();
  assert.strictEqual(st.lateSource, 'health');
});

// ---- 2. «Фокус» ---------------------------------------------------------------------------------------

test('focus: absent — nothing changes', function () {
  world.day = healthDay({ steps: 100, minute: 19 * 60, hour: 19 });
  var st = pet().recompute();
  assert.strictEqual(st.state, 'restless');
  assert.strictEqual(st.focus, null);
  assert.strictEqual(world.jobs['pet:focus'], undefined);
});

test('focus: a session on — calm, his focus phrase, a recount after it, no notification, no voice', function () {
  world.day = healthDay({ steps: 100, minute: 19 * 60, hour: 19 });
  world.modules['modules/focus/main.js'] = { left: function () { return { running: true, kind: 'work', left: 10 * 60000, text: '' }; } };
  // The day's notification is due exactly now (15:00–15:02), so only the session holds it back.
  settings({ notifyOn: true, notifyFrom: '15:00', notifyTo: '15:02', voiceOn: true });
  var p = pet();
  var st = p.recompute();
  assert.strictEqual(st.state, 'calm');
  assert.strictEqual(st.reason, 'идёт сессия Фокуса');
  assert.ok(st.focus && st.focus.left === 10 * 60000);
  assert.ok(require('../phrases.json').focus.indexOf(st.phrase) >= 0, 'not a focus phrase: ' + st.phrase);
  assert.ok(world.jobs['pet:focus'] && world.jobs['pet:focus'].when.once >= NOW + 10 * 60000, 'no recount after the session');
  world.now = NOW + 60000;
  p.tick();
  assert.strictEqual(world.notices.length, 0, 'the notification broke into the session');
  var spoken = false;
  global.native = (function (old) {
    return function (method) {
      if (method === 'speech.say') { spoken = true; return true; }
      return old.apply(null, arguments);
    };
  })(global.native);
  try {
    assert.strictEqual(p.talk().spoken, false);
    assert.strictEqual(spoken, false, 'he spoke aloud during the session');
  } finally {
    global.native = function (method) {
      if (method === 'shell.features') return world.features;
      if (method === 'job.list') return world.jobs;
      throw new Error('нет операции ' + method);
    };
  }
  // The session ends: the next recount brings the evening back, the phrase changes.
  world.modules['modules/focus/main.js'] = { left: function () { return { running: false, text: '' }; } };
  var after = p.recompute();
  assert.strictEqual(after.state, 'restless');
  assert.strictEqual(after.focus, null);
  assert.ok(require('../phrases.json').restless.indexOf(after.phrase) >= 0, after.phrase);
  p.tick();
  assert.strictEqual(world.notices.length, 1, 'after the session the day\'s notification comes');
});

test('focus: a break between sessions is not a session', function () {
  world.day = healthDay({ steps: 100, minute: 19 * 60, hour: 19 });
  world.modules['modules/focus/main.js'] = { left: function () { return { running: true, kind: 'break', left: 60000 }; } };
  assert.strictEqual(pet().recompute().state, 'restless');
});

test('focus: an older Focus without left() — its state file', function () {
  world.day = healthDay({ steps: 100, minute: 19 * 60, hour: 19 });
  world.modules['modules/focus/main.js'] = {};
  world.files['data/focus/state.json'] = JSON.stringify({ id: 's1', kind: 'work', startAt: NOW - 60000, endAt: NOW + 60000 });
  assert.strictEqual(pet().recompute().state, 'calm');
});

test('focus: the setting off', function () {
  world.day = healthDay({ steps: 100, minute: 19 * 60, hour: 19 });
  settings({ focusOn: false });
  world.modules['modules/focus/main.js'] = { left: function () { return { running: true, kind: 'work', left: 60000 }; } };
  assert.strictEqual(pet().recompute().state, 'restless');
});

// ---- 3. «Игротека» --------------------------------------------------------------------------------------

test('games: absent — no bonus even with old play records', function () {
  var plain = pet().recompute().energy;
  world.records.push({ kind: 'play', source: 'games', at: NOW - 3600000, amount: 30, unit: 'min' });
  var st = pet().recompute();
  assert.strictEqual(st.energy, plain);
  assert.strictEqual(st.playMin, 0);
});

test('games: present — today\'s sessions add a little energy; yesterday\'s do not count', function () {
  var plain = pet().recompute().energy;
  world.modules['modules/games/main.js'] = {};
  world.records.push({ kind: 'play', source: 'games', at: NOW - 3600000, amount: 15, unit: 'min' });
  world.records.push({ kind: 'play', source: 'games', at: NOW - 20 * 3600000, amount: 90, unit: 'min' });
  var st = pet().recompute();
  assert.strictEqual(st.playMin, 15);
  var S = Settings.merge({});
  assert.strictEqual(st.energy, Math.min(100, plain + Math.round(S.playBonus * 15 / S.playFull)));
  settings({ playOn: false });
  assert.strictEqual(pet().recompute().energy, plain, 'the setting off');
});

// ---- 4. the shelf of «Ачивки» -----------------------------------------------------------------------------

test('shelf: a rare badge lands on the shelf when seen, in its colour; a common one does not', function () {
  var p = pet();
  p.celebrate('achievement', { id: 'regime', title: 'Режим', rarity: 'rare' });
  assert.strictEqual(items().length, 0, 'not before the owner saw it');
  var seen = p.seen();
  assert.strictEqual(seen.shelf, 'badge-regime-rare');
  var shelf = items().filter(function (x) { return x.slot === 'shelf'; });
  assert.strictEqual(shelf.length, 1);
  assert.strictEqual(shelf[0].rarity, 'rare');
  assert.strictEqual(shelf[0].title, 'Режим');
  var svg = p.svg({ room: true, state: 'calm' });
  assert.ok(svg.indexOf(require('../shapes.js').RARITY.rare) >= 0, 'the badge is not in the rare colour');
  p.celebrate('achievement', { id: 'first-mark', title: 'Первая отметка', rarity: 'common' });
  assert.strictEqual(p.seen().shelf, null);
  assert.strictEqual(items().length, 1);
});

test('shelf: the setting decides from which rarity', function () {
  settings({ shelfFrom: 'off' });
  var p = pet();
  p.celebrate('achievement', { id: 'year', title: 'Год с Axiko', rarity: 'legendary' });
  p.seen();
  assert.strictEqual(items().length, 0);
});

test('shelf: an old payload without rarity — looked up in Ачивки, else common', function () {
  var p = pet();
  p.celebrate('achievement', { id: 'regime', title: 'Режим' });
  assert.strictEqual(p.seen().shelf, null, 'without Ачивки it is common');
  world.modules['modules/achievements/main.js'] = { list: function () { return [{ id: 'regime', rarity: 'rare' }, { id: 'year', rarity: 'legendary', item: { id: 'trophy', slot: 'shelf' } }]; } };
  p = pet();
  p.celebrate('achievement', { id: 'regime', title: 'Режим' });
  assert.strictEqual(p.seen().shelf, 'badge-regime-rare');
  p.give({ id: 'trophy', from: 'year', slot: 'shelf', worn: false });
  var cup = items().filter(function (x) { return x.id === 'trophy'; })[0];
  assert.strictEqual(cup.rarity, 'legendary', 'give() without rarity looks it up');
  p.give({ id: 'lantern', from: 'night-wanderer', slot: 'hand', worn: false, rarity: 'uncommon' });
  assert.strictEqual(items().filter(function (x) { return x.id === 'lantern'; })[0].rarity, 'uncommon', 'a rarity in the payload is taken');
});

test('shelf: the cup of «Год с Axiko» is not doubled by its badge', function () {
  var p = pet();
  p.give({ id: 'trophy', from: 'year', slot: 'shelf', worn: false, rarity: 'legendary' });
  p.celebrate('achievement', { id: 'year', title: 'Год с Axiko', rarity: 'legendary' });
  assert.strictEqual(p.seen().shelf, null);
  assert.strictEqual(items().length, 1);
});

test('shelf: a badge held past holdDays and one replaced by a new badge are not lost', function () {
  var p = pet();
  p.celebrate('achievement', { id: 'regime', title: 'Режим', rarity: 'rare' });
  p.celebrate('achievement', { id: 'juggler', title: 'Жонглёр', rarity: 'rare' });
  assert.deepStrictEqual(items().map(function (x) { return x.id; }), ['badge-regime-rare']);
  world.now = NOW + 15 * 86400000;
  world.day = healthDay({ date: '2026-11-29' });
  p.recompute();
  assert.deepStrictEqual(items().map(function (x) { return x.id; }).sort(), ['badge-juggler-rare', 'badge-regime-rare']);
});

test('shelf: things from before rarities get theirs at start, when Ачивки are there', function () {
  world.files['data/pet/items.json'] = JSON.stringify([{ id: 'trophy', from: 'year', slot: 'shelf', worn: false }]);
  pet().start();
  assert.strictEqual(items()[0].rarity, undefined, 'without Ачивки nothing is made up');
  world.modules['modules/achievements/main.js'] = { list: function () { return [{ id: 'year', rarity: 'legendary' }]; } };
  pet().start();
  assert.strictEqual(items()[0].rarity, 'legendary');
});

Date.now = realNow;
console.log('pet links: ' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
