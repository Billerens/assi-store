// When occasions happen: pure date rules, no Android. The same file runs in node (tests/) and in
// the Axiko engine (Rhino), so it keeps to what both understand: no classes, no async, no Intl.
//
// Days are ISO strings 'YYYY-MM-DD'. Arithmetic goes through day numbers counted in UTC, so a
// time zone or a change of summer time never moves a date.
//
// An occasion (occasions.json, data/holidays/own.json):
//   { id, title, rule, from, to, eggFrom, eggTo, priority, decor, egg, accent, ... }
// Kinds of rule:
//   { fixed: 'MM-DD' }                       the same day every year
//   { easter: -55 }                          days from Orthodox Easter
//   { nth: { month: 11, weekday: 7, n: -1 } } n-th weekday of a month (1 = Mon … 7 = Sun, -1 = last)
//   { date: 'YYYY-MM-DD' }                   once
//   { owner: 'birthday' }                    the owner's birthday (ctx.owner)
//   { contact: 'id' | '*' }                  a close person's birthday ('*' = every close person)
//   { install: true }                        the anniversary of installing Axiko (ctx.installDay)
//   { calendar: 'слово' }                    an event of the phone's calendar with the word (ctx.calendar)
//   { weather: 'snow' }                      the day the weather first showed it (ctx.weather.snow)
// `from` / `to` widen the window around the day (days, may be negative); `eggFrom` / `eggTo` is the
// part of it when the small surprises are on (the whole window when not given).

var DAY = 86400000;

function pad(number) {
  return (number < 10 ? '0' : '') + number;
}

function iso(year, month, day) {
  return year + '-' + pad(month) + '-' + pad(day);
}

function parse(text) {
  var found = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(text || ''));
  if (!found) return null;
  return { year: Number(found[1]), month: Number(found[2]), day: Number(found[3]) };
}

function dayNumber(text) {
  var date = parse(text);
  if (!date) throw new Error('Не дата: ' + text);
  return Math.round(Date.UTC(date.year, date.month - 1, date.day) / DAY);
}

function fromNumber(number) {
  var date = new Date(number * DAY);
  return iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function addDays(text, days) {
  return fromNumber(dayNumber(text) + days);
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isLeap(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** The day a yearly date falls on in that year; 29 February becomes 28 February in other years. */
function onYear(month, day, year) {
  if (month === 2 && day === 29 && !isLeap(year)) day = 28;
  return iso(year, month, day);
}

exports.iso = iso;
exports.parse = parse;
exports.dayNumber = dayNumber;
exports.fromNumber = fromNumber;
exports.addDays = addDays;
exports.daysInMonth = daysInMonth;
exports.isLeap = isLeap;
exports.onYear = onYear;

/** Days from a to b (positive when b is later). */
exports.diff = function (a, b) {
  return dayNumber(b) - dayNumber(a);
};

/** 1 = Monday … 7 = Sunday. */
exports.weekday = function (text) {
  return (new Date(dayNumber(text) * DAY).getUTCDay() + 6) % 7 + 1;
};

/** The local calendar day of a Date (or of milliseconds) as ISO. */
exports.today = function (date) {
  var at = date === undefined ? new Date() : (typeof date === 'number' ? new Date(date) : date);
  return iso(at.getFullYear(), at.getMonth() + 1, at.getDate());
};

/** 'MM-DD' of a day. */
exports.monthDay = function (text) {
  return String(text).slice(5, 10);
};

/**
 * Orthodox Easter: the Meeus algorithm for the Julian calendar, then moved to the Gregorian one
 * (13 days in 1900–2099, 14 in 2100–2199 — the general formula below).
 */
exports.easter = function (year) {
  var a = year % 4;
  var b = year % 7;
  var c = year % 19;
  var d = (19 * c + 15) % 30;
  var e = (2 * a + 4 * b - d + 34) % 7;
  var month = Math.floor((d + e + 114) / 31);
  var day = ((d + e + 114) % 31) + 1;
  var shift = Math.floor(year / 100) - Math.floor(year / 400) - 2;
  return addDays(iso(year, month, day), shift);
};

/** The n-th weekday (1 = Mon … 7 = Sun) of a month; n = -1 is the last one. Null when there is none. */
exports.nth = function (year, month, weekday, n) {
  var last = daysInMonth(year, month);
  var day;
  if (n > 0) {
    var first = exports.weekday(iso(year, month, 1));
    day = 1 + (weekday - first + 7) % 7 + (n - 1) * 7;
  } else if (n < 0) {
    var end = exports.weekday(iso(year, month, last));
    day = last - (end - weekday + 7) % 7 + (n + 1) * 7;
  } else {
    return null;
  }
  return day >= 1 && day <= last ? iso(year, month, day) : null;
};

/** WMO weather codes that mean snow (snowfall, snow grains, snow showers). */
exports.isSnowCode = function (code) {
  code = Number(code);
  return (code >= 71 && code <= 77) || code === 85 || code === 86;
};

/** A date as people type it: '14.06', '14.06.2027', '2027-06-14', '06-14' → { year|null, month, day } or null. */
exports.parseUserDate = function (text) {
  var value = String(text || '').trim();
  var found;
  var year = null;
  var month;
  var day;
  if ((found = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value))) {
    year = Number(found[1]);
    month = Number(found[2]);
    day = Number(found[3]);
  } else if ((found = /^(\d{1,2})-(\d{1,2})$/.exec(value))) {
    month = Number(found[1]);
    day = Number(found[2]);
  } else if ((found = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{4}))?$/.exec(value))) {
    day = Number(found[1]);
    month = Number(found[2]);
    year = found[3] ? Number(found[3]) : null;
  } else {
    return null;
  }
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year || 2000, month)) return null;
  return { year: year, month: month, day: day };
};

function monthDayOf(text) {
  var found = /^(\d{2})-(\d{2})$/.exec(String(text || ''));
  return found ? { month: Number(found[1]), day: Number(found[2]) } : null;
}

/** Is the rule one this file understands? An occasion with a broken rule is left out, not a crash. */
exports.validRule = function (rule) {
  if (!rule || typeof rule !== 'object') return false;
  if (rule.fixed !== undefined) {
    var fixed = monthDayOf(rule.fixed);
    return Boolean(fixed && fixed.month >= 1 && fixed.month <= 12 && fixed.day >= 1 && fixed.day <= daysInMonth(2000, fixed.month));
  }
  if (rule.easter !== undefined) return typeof rule.easter === 'number' && Math.abs(rule.easter) < 200;
  if (rule.nth) {
    return rule.nth.month >= 1 && rule.nth.month <= 12 && rule.nth.weekday >= 1 && rule.nth.weekday <= 7 &&
      rule.nth.n !== 0 && Math.abs(rule.nth.n) <= 5;
  }
  if (rule.date !== undefined) return Boolean(parse(rule.date));
  if (rule.owner !== undefined) return rule.owner === 'birthday';
  if (rule.contact !== undefined) return Boolean(rule.contact);
  if (rule.install !== undefined) return true;
  if (rule.calendar !== undefined) return String(rule.calendar).trim().length > 0;
  if (rule.weather !== undefined) return rule.weather === 'snow';
  return false;
};

/** The days of one year the occasion is about (its "anchor" days; most rules give one). */
exports.anchors = function (occasion, year, ctx) {
  var rule = occasion.rule || {};
  ctx = ctx || {};
  if (rule.fixed !== undefined) {
    var fixed = monthDayOf(rule.fixed);
    return fixed ? [onYear(fixed.month, fixed.day, year)] : [];
  }
  if (rule.easter !== undefined) return [addDays(exports.easter(year), Number(rule.easter) || 0)];
  if (rule.nth) {
    var found = exports.nth(year, rule.nth.month, rule.nth.weekday, rule.nth.n);
    return found ? [found] : [];
  }
  if (rule.date !== undefined) {
    var once = parse(rule.date);
    return once && once.year === year ? [iso(once.year, once.month, once.day)] : [];
  }
  if (rule.owner !== undefined) {
    return ctx.owner && ctx.owner.month ? [onYear(ctx.owner.month, ctx.owner.day, year)] : [];
  }
  if (rule.contact !== undefined) {
    var person = (ctx.people || []).filter(function (item) { return String(item.id) === String(rule.contact); })[0];
    return person && person.birthday ? [onYear(person.birthday.month, person.birthday.day, year)] : [];
  }
  if (rule.install !== undefined) {
    var installed = parse(ctx.installDay);
    return installed && year > installed.year ? [onYear(installed.month, installed.day, year)] : [];
  }
  if (rule.calendar !== undefined) {
    var word = String(rule.calendar).toLowerCase();
    var days = [];
    (ctx.calendar || []).forEach(function (event) {
      if (String(event.day).slice(0, 4) !== String(year)) return;
      if (String(event.title || '').toLowerCase().indexOf(word) < 0) return;
      if (days.indexOf(event.day) < 0) days.push(event.day);
    });
    return days;
  }
  if (rule.weather !== undefined) {
    // Which days of the season count as "first snow" is a setting the engine applies when it
    // records the day; here it is only the day that was recorded.
    var seen = ctx.weather && ctx.weather[rule.weather];
    if (!seen || !seen.day || String(seen.day).slice(0, 4) !== String(year)) return [];
    return [seen.day];
  }
  return [];
};

/** The days the occasion is "on" around one of its anchor days. */
exports.windowOf = function (occasion, anchor, ctx) {
  var from = Number(occasion.from) || 0;
  var to = Number(occasion.to) || 0;
  var rule = occasion.rule || {};
  // The winter look after the first snow lasts as many days as the owner set.
  if (rule.weather !== undefined && ctx && ctx.weatherDays) to = Math.max(0, Number(ctx.weatherDays) - 1);
  return { start: addDays(anchor, Math.min(from, to)), end: addDays(anchor, Math.max(from, to)) };
};

/** Occasions with the template rule { contact: '*' } become one occasion per close person. */
exports.expand = function (occasions, ctx) {
  var out = [];
  (occasions || []).forEach(function (occasion) {
    var rule = occasion.rule || {};
    if (rule.contact === '*') {
      (ctx && ctx.people || []).forEach(function (person) {
        if (!person.close || !person.birthday) return;
        var copy = {};
        Object.keys(occasion).forEach(function (key) { copy[key] = occasion[key]; });
        copy.id = 'birthday:' + person.id;
        copy.template = occasion.id;
        copy.title = (occasion.titlePrefix || 'День рождения: ') + person.name;
        copy.rule = { contact: String(person.id) };
        copy.person = { id: String(person.id), name: person.name, year: person.birthday.year || null };
        out.push(copy);
      });
      return;
    }
    if (!exports.validRule(rule)) return;
    out.push(occasion);
  });
  return out;
};

function item(occasion, anchor, span, dayNo, ctx) {
  var eggOn;
  if (occasion.eggFrom === undefined && occasion.eggTo === undefined) {
    eggOn = true;
  } else {
    var eggStart = dayNumber(anchor) + (Number(occasion.eggFrom) || 0);
    var eggEnd = dayNumber(anchor) + (Number(occasion.eggTo) || 0);
    eggOn = dayNo >= eggStart && dayNo <= eggEnd;
  }
  var rule = occasion.rule || {};
  var consent = true;
  if (occasion.ask && rule.weather !== undefined) {
    var seen = ctx && ctx.weather && ctx.weather[rule.weather];
    consent = Boolean(seen && seen.accepted);
  }
  return {
    id: occasion.id,
    title: occasion.title,
    occasion: occasion,
    anchor: anchor,
    start: span.start,
    end: span.end,
    egg: eggOn,
    consent: consent,
    priority: occasion.priority === undefined ? 50 : Number(occasion.priority)
  };
}

function byPriority(a, b) {
  if (b.priority !== a.priority) return b.priority - a.priority;
  return dayNumber(a.start) - dayNumber(b.start);
}

/** Occasions whose window holds the day, the most important first. */
exports.activeOn = function (occasions, day, ctx) {
  var year = parse(day).year;
  var dayNo = dayNumber(day);
  var seen = {};
  var out = [];
  exports.expand(occasions, ctx).forEach(function (occasion) {
    [year - 1, year, year + 1].forEach(function (y) {
      exports.anchors(occasion, y, ctx).forEach(function (anchor) {
        if (seen[occasion.id]) return;
        var span = exports.windowOf(occasion, anchor, ctx);
        if (dayNo < dayNumber(span.start) || dayNo > dayNumber(span.end)) return;
        seen[occasion.id] = true;
        out.push(item(occasion, anchor, span, dayNo, ctx));
      });
    });
  });
  return out.sort(byPriority);
};

/** The occasion that sets the look of the day: the most important active one. */
exports.pick = function (active) {
  return active && active.length ? active[0] : null;
};

/**
 * What is coming from the day for that many days (and what is on now), by date:
 * [{ id, title, occasion, anchor, start, end, inDays, active, priority, egg, consent }].
 */
exports.upcoming = function (occasions, day, days, ctx) {
  var year = parse(day).year;
  var first = dayNumber(day);
  var last = first + Math.max(0, Number(days) || 0);
  var years = [year - 1, year, year + 1];
  for (var extra = year + 2; extra <= parse(fromNumber(last)).year + 1; extra++) years.push(extra);
  var out = [];
  exports.expand(occasions, ctx).forEach(function (occasion) {
    var taken = {};
    years.forEach(function (y) {
      exports.anchors(occasion, y, ctx).forEach(function (anchor) {
        if (taken[anchor]) return;
        var span = exports.windowOf(occasion, anchor, ctx);
        var startNo = dayNumber(span.start);
        var endNo = dayNumber(span.end);
        var anchorNo = dayNumber(anchor);
        var active = first >= startNo && first <= endNo;
        if (!active && (anchorNo < first || anchorNo > last)) return;
        taken[anchor] = true;
        var entry = item(occasion, anchor, span, first, ctx);
        entry.inDays = anchorNo - first;
        entry.active = active;
        out.push(entry);
      });
    });
  });
  return out.sort(function (a, b) {
    var at = (a.active ? first : dayNumber(a.anchor)) - (b.active ? first : dayNumber(b.anchor));
    return at !== 0 ? at : b.priority - a.priority;
  });
};

/** The winter season a day belongs to, for "once a season" rules: the year it started in. */
exports.season = function (day) {
  var date = parse(day);
  return date.month >= 7 ? date.year : date.year - 1;
};
