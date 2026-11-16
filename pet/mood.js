// The pet's mood from the owner's day: four scores, the energy and one of twelve states. Pure.
// Input is the health module's today() (the day so far plus "now": hour, night, screenOn,
// prevLateMin), with what main.js adds from the neighbours (links.js): prevLateMin from
// «Тайная жизнь телефона» (lateSource), focus (a Focus session is on), playMin (today's games).
// What is not known is not bad: its weight goes to the others.

function minutes(hm) {
  var m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

/** The twelve states, checked top to bottom. */
exports.STATES = [
  { id: 'blanket', title: 'Под пледом' },
  { id: 'vacation', title: 'На отдыхе' },
  { id: 'asleep', title: 'Спит' },
  { id: 'woken', title: 'Разбуженный' },
  { id: 'unrested', title: 'Невыспавшийся' },
  { id: 'sleepy', title: 'Сонный' },
  { id: 'restless', title: 'Засиделся' },
  { id: 'curious', title: 'Любопытный' },
  { id: 'content', title: 'Довольный' },
  { id: 'cheerful', title: 'Бодрый' },
  { id: 'calm', title: 'Спокойный' },
  { id: 'quiet', title: 'Притихший' }
];

exports.title = function (id) {
  var found = exports.STATES.filter(function (s) { return s.id === id; })[0];
  return found ? found.title : id;
};

/**
 * The part of the day that has passed for the steps: 0 before activityFrom, then up to 1 at
 * activityTo. After midnight (before the day's end) it is still the evening: 1.
 */
exports.dayShare = function (minute, s, dayEnd) {
  var from = minutes(s.activityFrom);
  var to = minutes(s.activityTo);
  var end = minutes(dayEnd || '05:00') || 0;
  if (minute < end) return 1;
  if (to <= from) return minute >= from ? 1 : 0;
  return clamp((minute - from) / (to - from), 0, 1);
};

/**
 * The four scores (null — not known): { sleepScore, lateScore, activityScore, careScore, dayShare }.
 * t: health.today(); s: the pet's settings.
 */
exports.factors = function (t, s) {
  var known = t.known || {};
  var goals = t.goals || {};
  var minute = typeof t.minute === 'number' ? t.minute : (t.hour || 0) * 60;
  var share = exports.dayShare(minute, s, goals.dayEnd);
  var sleepGoal = t.sleepGoal || goals.sleepGoal || 450;
  var sleepScore = known.sleep && typeof t.sleepMin === 'number' ? Math.min(t.sleepMin / sleepGoal, 1.2) : null;
  var lateMin = typeof t.prevLateMin === 'number' ? t.prevLateMin : null;
  var lateScore = lateMin !== null && t.prevKnownScreen !== false ? clamp(1 - lateMin / s.lateLimit, 0, 1) : null;
  var stepsGoal = t.stepsGoal || goals.stepsGoal || 8000;
  var activityScore = known.steps && typeof t.steps === 'number' && share > 0 ? Math.min(t.steps / (stepsGoal * share), 1.2) : null;
  // Care: habits, medicines and water against what is due — and against how much of the day has gone.
  var habitsDue = Number(t.habitsDue) || 0;
  var medsDue = Number(t.medsDue) || 0;
  var waterGoal = Number(t.waterGoal) || 0;
  var due = habitsDue + medsDue + (waterGoal > 0 ? 1 : 0);
  var careScore;
  if (!due) careScore = 1;
  else if (share <= 0) careScore = null;
  else {
    var done = Math.min(Number(t.habitsDone) || 0, habitsDue) + Math.min(Number(t.medsTaken) || 0, medsDue) +
      (waterGoal > 0 ? Math.min((Number(t.waterMl) || 0) / waterGoal, 1) : 0);
    careScore = Math.min(1, done / (due * share));
  }
  return { sleepScore: sleepScore, lateScore: lateScore, activityScore: activityScore, careScore: careScore, dayShare: share };
};

/** Energy 0–100 from the known scores, weights shared among them; known — the share of weights known. */
exports.energy = function (f, s) {
  var parts = [['sleepScore', s.wSleep], ['lateScore', s.wLate], ['activityScore', s.wActivity], ['careScore', s.wCare]];
  var all = 0;
  var have = 0;
  var sum = 0;
  parts.forEach(function (p) {
    var w = Number(p[1]) || 0;
    all += w;
    if (f[p[0]] === null || f[p[0]] === undefined) return;
    have += w;
    sum += w * Math.min(f[p[0]], 1);
  });
  return { energy: have > 0 ? Math.round(100 * sum / have) : null, known: all > 0 ? have / all : 0 };
};

/**
 * The state: { id, reason } — the first row of the table that holds.
 * t: health.today(); f: factors; e: energy(); s: settings.
 */
exports.state = function (t, f, e, s) {
  var minute = typeof t.minute === 'number' ? t.minute : (t.hour || 0) * 60;
  var known = t.known || {};
  var dayEnd = minutes((t.goals || {}).dayEnd || '05:00') || 0;
  // The clock of the owner's day: after midnight it is still "late evening".
  var dayMinute = minute < dayEnd ? minute + 1440 : minute;
  if (t.paused === 'sick') return { id: 'blanket', reason: 'пауза «болею»' };
  if (t.paused === 'vacation' || t.paused === 'rest') return { id: 'vacation', reason: t.paused === 'vacation' ? 'пауза «отпуск»' : 'пауза «перерыв»' };
  if (t.night) {
    if (t.screenOn === true && s.nightWoken) return { id: 'woken', reason: 'ночное окно, а телефон в руках' };
    return { id: 'asleep', reason: 'ночное окно' };
  }
  // A Focus session: he sits calm and quiet next to the owner until it ends.
  if (t.focus && s.focusOn) return { id: 'calm', reason: 'идёт сессия Фокуса', focus: true };
  var sleepGoal = t.sleepGoal || (t.goals || {}).sleepGoal || 450;
  var lateMin = typeof t.prevLateMin === 'number' && t.prevKnownScreen !== false ? t.prevLateMin : null;
  var shortSleep = known.sleep && typeof t.sleepMin === 'number' && t.sleepMin < s.unrestedSleep;
  var lateNight = lateMin !== null && lateMin >= s.unrestedLate;
  var walked = known.steps && typeof t.steps === 'number' && t.steps >= s.wakeSteps;
  if (minute >= dayEnd && minute < minutes(s.unrestedUntil) && (shortSleep || lateNight) && !walked) {
    return { id: 'unrested', reason: shortSleep ? 'короткая ночь' : 'долго в телефоне ночью' };
  }
  if (known.sleep && typeof t.sleepMin === 'number' && t.sleepMin < sleepGoal - s.sleepyBelow) return { id: 'sleepy', reason: 'сна меньше цели' };
  if (dayMinute >= minutes(s.restlessAfter) && f.activityScore !== null && f.activityScore < s.restlessBelow) {
    return { id: 'restless', reason: 'вечер, а шагов мало' };
  }
  if ((Number(t.newPlaces) || 0) > 0) return { id: 'curious', reason: 'сегодня новое место' };
  var due = (Number(t.habitsDue) || 0) + (Number(t.medsDue) || 0);
  if (due > 0 && Array.isArray(t.left) && t.left.length === 0) return { id: 'content', reason: 'всё положенное отмечено' };
  if (e.energy === null || e.known < s.minKnown) return { id: 'calm', reason: 'данных мало' };
  if (e.energy >= s.cheerfulFrom) return { id: 'cheerful', reason: 'энергия ' + e.energy };
  if (e.energy >= s.calmFrom) return { id: 'calm', reason: 'энергия ' + e.energy };
  return { id: 'quiet', reason: 'энергия ' + e.energy };
};

/**
 * A little energy from today's games (playOn): up to playBonus points, all of them after playFull
 * minutes of play. 0 without games.
 */
exports.playBonus = function (t, s) {
  var played = Number(t && t.playMin) || 0;
  if (!s.playOn || played <= 0 || !(s.playBonus > 0)) return 0;
  var full = Number(s.playFull) > 0 ? Number(s.playFull) : 30;
  return Math.round(s.playBonus * Math.min(1, played / full));
};

/** Everything at once: { state, reason, energy, known, factors, focus }. */
exports.compute = function (t, s) {
  var f = exports.factors(t, s);
  var e = exports.energy(f, s);
  var bonus = exports.playBonus(t, s);
  if (bonus && e.energy !== null) e.energy = Math.min(100, e.energy + bonus);
  f.playBonus = e.energy !== null ? bonus : 0;
  var st = exports.state(t, f, e, s);
  return { state: st.id, reason: st.reason, energy: e.energy, known: Math.round(e.known * 100) / 100, factors: f, focus: Boolean(st.focus) };
};

// ---- «Почему так»: the numbers behind the mood ------------------------------------------------

var NB = ' ';

function dur(m) {
  if (m === null || m === undefined || isNaN(m)) return '—';
  m = Math.max(0, Math.round(m));
  var h = Math.floor(m / 60);
  var r = m % 60;
  if (!h) return r + NB + 'мин';
  return r ? h + NB + 'ч ' + r + NB + 'мин' : h + NB + 'ч';
}

function num(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, NB);
}

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}

/** Is the clock minute inside [start, end), a window that may cross midnight? */
exports.inWindow = function (minute, start, end) {
  var a = minutes(start);
  var b = minutes(end);
  if (a === null || b === null) return false;
  return a <= b ? minute >= a && minute < b : minute >= a || minute < b;
};

/** The second line of the text widget: «Энергия 82 · сон 7:40 · 6 100 шагов». */
exports.widgetLine = function (t, energy) {
  var known = (t && t.known) || {};
  var parts = ['Энергия ' + (typeof energy === 'number' ? energy : '—')];
  if (known.sleep && typeof t.sleepMin === 'number') {
    var m = Math.max(0, Math.round(t.sleepMin));
    parts.push('сон ' + Math.floor(m / 60) + ':' + pad(m % 60));
  }
  if (known.steps && typeof t.steps === 'number') parts.push(num(t.steps) + NB + 'шагов');
  return parts.join(' · ');
};

/** Lines of the «Почему так» card: [{ key, text, score }] (score 0–1 or null). */
exports.why = function (t, f, s) {
  var known = t.known || {};
  var goals = t.goals || {};
  var lines = [];
  var sleepGoal = t.sleepGoal || goals.sleepGoal || 450;
  lines.push({ key: 'sleep', score: f.sleepScore === null ? null : Math.min(1, f.sleepScore),
    text: known.sleep ? 'Сон ' + dur(t.sleepMin) + ' из ' + dur(sleepGoal) + (t.bedtime ? ', отбой ' + t.bedtime : '') : 'Сон: данных нет — не в минус' });
  var lateText;
  if (f.lateScore === null) lateText = 'Экран ночью: данных нет';
  else if (!(t.prevLateMin > 0)) lateText = 'Ночью телефон отдыхал';
  else if (t.lateSource === 'phone-night') lateText = dur(t.prevLateMin) + ' в телефоне ночью, по «Тайной жизни телефона»';
  else lateText = dur(t.prevLateMin) + ' экрана после ' + (goals.nightStart || '00:30');
  lines.push({ key: 'late', score: f.lateScore, text: lateText });
  var clock = typeof t.minute === 'number' ? pad(Math.floor(t.minute / 60)) + ':' + pad(t.minute % 60) : null;
  lines.push({ key: 'steps', score: f.activityScore === null ? null : Math.min(1, f.activityScore),
    text: known.steps ? 'Шаги ' + num(t.steps) + (clock ? ' к ' + clock : '') + ' из ' + num(t.stepsGoal || goals.stepsGoal) :
      'Шаги: данных нет — не в минус' });
  var care = [];
  if (t.habitsDue) care.push('привычки ' + Math.min(t.habitsDone, t.habitsDue) + ' из ' + t.habitsDue);
  if (t.medsDue) care.push('лекарства ' + t.medsTaken + ' из ' + t.medsDue);
  if (t.waterGoal) care.push('вода ' + ((Number(t.waterMl) || 0) / 1000).toFixed(1).replace('.', ',') + ' из ' + (t.waterGoal / 1000).toFixed(1).replace('.', ',') + NB + 'л');
  lines.push({ key: 'care', score: f.careScore, text: care.length ? care.join(', ').replace(/^./, function (c) { return c.toUpperCase(); }) : 'Отметок на сегодня не положено' });
  if (t.newPlaces) lines.push({ key: 'places', score: null, text: 'Новых мест: ' + t.newPlaces });
  if (s.playOn && t.playMin > 0) {
    var bonus = typeof f.playBonus === 'number' ? f.playBonus : exports.playBonus(t, s);
    lines.push({ key: 'play', score: null, text: 'Игры сегодня ' + dur(t.playMin) + (bonus ? ', энергия +' + bonus : '') });
  }
  if (t.focus && s.focusOn) lines.push({ key: 'focus', score: null, text: 'Идёт сессия Фокуса: он сидит тихо и не мешает' });
  return lines;
};
