// «Не забыл» for «Ачивки за жизнь» (handed in by achieve.js): over a whole year every close person's
// birthday had a greeting prepared in time — a draft made on the day or up to awardEarlyDays before it.
// The module never sends greetings itself, so a draft is the honest sign that the owner did not forget.
// What was greeted is kept in data/holidays/greeted.json (drafts' texts are cleaned after a while,
// this mark is not): { since: 'YYYY-MM-DD' (when counting began), greeted: { 'personId:YYYY-MM-DD': draft day } }.
// Pure: runs in node (tests) and in the engine.
var calendar = require('./calendar');
var birthdays = require('./birthdays');

/** The record read from the file, made whole. */
exports.normalize = function (record, day) {
  var out = record && typeof record === 'object' ? record : {};
  if (!out.since || !calendar.parse(String(out.since))) out.since = day;
  if (!out.greeted || typeof out.greeted !== 'object') out.greeted = {};
  return out;
};

/**
 * A draft for a person was made on `day` for the birthday `next`: counts when it is not earlier than
 * earlyDays before it. → true when the record changed.
 */
exports.remember = function (record, personId, day, next, earlyDays) {
  var ahead = calendar.diff(day, next);
  if (ahead < 0 || ahead > Number(earlyDays)) return false;
  var key = String(personId) + ':' + next;
  if (record.greeted[key]) return false;
  record.greeted[key] = day;
  return true;
};

/**
 * Was nobody forgotten? people — with close and birthday ({ month, day }); the birthdays of close
 * people from `yearDays` ago up to yesterday each need a greeting; at least minPeople of them, and the
 * counting has to cover the whole span. → { ok, tracked, due, greeted, missed: [names] }
 */
exports.check = function (people, record, today, yearDays, minPeople) {
  var start = calendar.addDays(today, -Number(yearDays));
  var tracked = Boolean(record.since) && calendar.diff(record.since, start) >= 0;
  var due = 0;
  var greeted = 0;
  var who = {};
  var missed = [];
  (people || []).forEach(function (person) {
    if (!person || !person.close || !person.birthday) return;
    var date = birthdays.next(person.birthday, start);
    var guard = 0;
    while (calendar.diff(date, today) > 0 && guard++ < 5) {
      due++;
      who[person.id] = true;
      if (record.greeted[String(person.id) + ':' + date]) greeted++;
      else missed.push(person.name);
      date = birthdays.next(person.birthday, calendar.addDays(date, 1));
    }
  });
  var count = Object.keys(who).length;
  return { ok: tracked && count >= Number(minPeople) && greeted === due, tracked: tracked, due: due, greeted: greeted, people: count, missed: missed };
};
