// node tests/parse.test.js — the dumpsys parsers on the bundled samples (samples/*.txt).
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var parse = require('../parse');

var count = 0;
var failed = 0;
function test(name, fn) {
  count++;
  try {
    fn();
    console.log('ok ' + count + ' ' + name);
  } catch (error) {
    failed++;
    console.log('not ok ' + count + ' ' + name + '\n  ' + (error && error.stack ? error.stack.split('\n').slice(0, 3).join('\n  ') : error));
  }
}
function sample(name) {
  return fs.readFileSync(path.join(__dirname, '..', 'samples', name + '.txt'), 'utf8');
}
function local(y, mo, d, h, mi, s) {
  return new Date(y, mo - 1, d, h, mi, s || 0).getTime();
}

test('duration: dumpsys forms', function () {
  assert.strictEqual(parse.duration('+1h02m03s123ms'), 3723123);
  assert.strictEqual(parse.duration('-12m3s456ms'), -723456);
  assert.strictEqual(parse.duration('0'), 0);
  assert.strictEqual(parse.duration('+567ms'), 567);
  assert.strictEqual(parse.duration('+1d0h0m0s0ms'), 864e5);
  assert.strictEqual(parse.duration('running'), null);
  assert.strictEqual(parse.duration(''), null);
});

test('uidOf: u0a123, u10a5, isolated, system', function () {
  assert.strictEqual(parse.uidOf('u0a123'), 10123);
  assert.strictEqual(parse.uidOf('u10a5'), 1010005);
  assert.strictEqual(parse.uidOf('u0i7'), 99007);
  assert.strictEqual(parse.uidOf('1000'), 1000);
  assert.strictEqual(parse.uidOf('u0s1001'), 1001);
  assert.strictEqual(parse.uidOf('nonsense'), null);
  assert.strictEqual(parse.uidGroup(1000), 'system');
  assert.strictEqual(parse.uidGroup(10245), 'app');
  assert.strictEqual(parse.uidGroup(-5), 'tethering');
});

test('denied: permission errors and empty output', function () {
  assert.ok(parse.denied('Permission Denial: can\'t dump AlarmManager from from pid=123, uid=10199 due to missing android.permission.DUMP permission'));
  assert.ok(parse.denied(''));
  assert.ok(parse.denied('  \n '));
  assert.ok(!parse.denied(sample('alarm-evening')));
});

test('usage kinds: screen, unlock, apps, boots', function () {
  assert.strictEqual(parse.usageKind(15), 'screen_on');
  assert.strictEqual(parse.usageKind(16), 'screen_off');
  assert.strictEqual(parse.usageKind(18), 'unlock');
  assert.strictEqual(parse.usageKind(1), 'resumed');
  assert.strictEqual(parse.usageKind(26), 'shutdown');
  assert.strictEqual(parse.usageKind(27), 'startup');
  assert.strictEqual(parse.usageKind(5), null);
});

test('alarm: per-package Alarm Stats', function () {
  var evening = parse.parseAlarm(sample('alarm-evening'));
  assert.ok(evening.ok, evening.note);
  assert.strictEqual(evening.from, 'Alarm Stats');
  assert.strictEqual(evening.elapsed, 3600000);
  assert.deepStrictEqual(evening.packages['ru.marketplace.app'], { uid: 10245, wakeups: 230, alarms: 230 });
  assert.deepStrictEqual(evening.packages['com.google.android.gms'], { uid: 10160, wakeups: 412, alarms: 450 });
  assert.deepStrictEqual(evening.packages.android, { uid: 1000, wakeups: 2024, alarms: 2024 });
  assert.strictEqual(Object.keys(evening.packages).length, 5);
});

test('alarm: Top Alarms only when the stats are missing', function () {
  var text = sample('alarm-evening').split('  Alarm Stats:')[0];
  var parsed = parse.parseAlarm(text);
  assert.ok(parsed.ok);
  assert.strictEqual(parsed.from, 'Top Alarms');
  assert.strictEqual(parsed.packages['ru.marketplace.app'].wakeups, 230);
  assert.ok(/Top Alarms/.test(parsed.note));
});

test('alarm: unknown text is «no data», not an error', function () {
  var parsed = parse.parseAlarm('Current Alarm Manager state:\n  nothing here at all, sorry\n');
  assert.strictEqual(parsed.ok, false);
  assert.ok(parsed.note);
  assert.strictEqual(parse.parseAlarm('Permission Denial: missing android.permission.DUMP').ok, false);
});

test('alarm diff: wake-ups of the night, new apps, most first', function () {
  var diff = parse.alarmDiff(parse.parseAlarm(sample('alarm-evening')), parse.parseAlarm(sample('alarm-morning')));
  assert.ok(diff.ok, diff.note);
  assert.strictEqual(diff.rebooted, false);
  var by = {};
  diff.packages.forEach(function (row) { by[row.pkg] = row; });
  assert.strictEqual(by.android.wakeups, 76);
  assert.strictEqual(by['com.google.android.gms'].wakeups, 19);
  assert.strictEqual(by['ru.marketplace.app'].wakeups, 9);
  assert.strictEqual(by['com.whatsapp'].wakeups, 4);
  assert.strictEqual(by['app.assi'].wakeups, 2);
  assert.strictEqual(diff.packages[0].pkg, 'android');
  assert.strictEqual(diff.total, 76 + 19 + 9 + 3 + 2 + 4);
});

test('alarm diff: a reboot between snapshots makes it invalid', function () {
  var evening = parse.parseAlarm(sample('alarm-evening'));
  var morning = parse.parseAlarm(sample('alarm-morning').replace('nowELAPSED=33150000', 'nowELAPSED=1200000'));
  var diff = parse.alarmDiff(evening, morning);
  assert.strictEqual(diff.ok, false);
  assert.strictEqual(diff.rebooted, true);
  assert.ok(/перезагружался/.test(diff.note));
});

test('history: levels, screen, doze, wake reasons, alarms, jobs on the real format', function () {
  var from = local(2026, 11, 13, 22, 0);
  var to = local(2026, 11, 14, 7, 12, 30);
  var h = parse.parseHistory(sample('history'), { from: from, to: to });
  assert.ok(h.ok, h.note);
  assert.ok(h.based);
  assert.strictEqual(h.levelAtFrom, 100);
  assert.deepStrictEqual(h.points[0], { at: local(2026, 11, 13, 22, 58), level: 92 });
  assert.strictEqual(h.points[h.points.length - 1].level, 81);
  // The screen was already on since the reset line, so «+screen» at 23:20 is no change.
  assert.deepStrictEqual(h.screen.map(function (e) { return e.on; }), [false, true, false, true]);
  assert.strictEqual(h.screen[0].at, local(2026, 11, 13, 23, 39, 40));
  assert.strictEqual(h.wakeups, 3);
  assert.strictEqual(h.wakeReasons.Alarm, 2);
  assert.strictEqual(h.alarms.length, 2);
  assert.strictEqual(h.alarms[0].uid, 10245);
  assert.strictEqual(h.alarms[0].at, local(2026, 11, 14, 0, 12));
  assert.strictEqual(h.jobs[10160], 1);
  assert.ok(h.wakelocks[10245] >= 2);
  var full = h.doze.filter(function (d) { return d.mode === 'full'; });
  assert.strictEqual(full.length, 3);
  assert.strictEqual(full[0].from, local(2026, 11, 14, 2, 10));
  assert.strictEqual(full[0].to, local(2026, 11, 14, 2, 40));
  assert.strictEqual(full[2].to, local(2026, 11, 14, 7, 5));
  assert.strictEqual(h.plugged.length, 0);
});

test('history: fed line by line gives the same', function () {
  var opts = { from: local(2026, 11, 13, 22, 0), to: local(2026, 11, 14, 7, 12, 30) };
  var reader = parse.historyReader(opts);
  sample('history').split('\n').forEach(function (line) { reader.line(line); });
  var streamed = reader.result();
  assert.deepStrictEqual(streamed, parse.parseHistory(sample('history'), opts));
});

test('history: charging, full, reboot START, absolute-time format', function () {
  var text = [
    '                    0 (14) RESET:TIME: 2026-11-13-22-00-00',
    '                    0 (2) 040 status=discharging health=good plug=none temp=270',
    '             +1h40m00s000ms (2) 040 status=charging plug=ac +plugged',
    '             +3h15m00s000ms (2) 100 status=full',
    '             +5h00m00s000ms (14) SHUTDOWN',
    '             +5h03m00s000ms (8) START',
    '             +5h03m01s000ms (14) TIME: 2026-11-14-03-03-01',
    '             +8h00m00s000ms (2) 100 status=discharging plug=none -plugged'
  ].join('\n');
  var h = parse.parseHistory(text, { from: local(2026, 11, 13, 22, 0), to: local(2026, 11, 14, 7, 30) });
  assert.ok(h.ok, h.note);
  assert.strictEqual(h.plugged.length, 1);
  assert.strictEqual(h.plugged[0].from, local(2026, 11, 13, 23, 40));
  assert.strictEqual(h.plugged[0].to, local(2026, 11, 14, 6, 0));
  assert.deepStrictEqual(h.boots.map(function (b) { return b.kind; }), ['shutdown', 'start']);
  assert.strictEqual(h.boots[0].at, local(2026, 11, 14, 3, 0));
  var absolute = parse.parseHistory([
    '11-14 01:12:02.345 (2) 087 +screen',
    '11-14 01:18:00.000 (2) 086 -screen device_idle=full',
    '11-14 03:00:00.000 (2) 085 device_idle=off'
  ].join('\n'), { from: local(2026, 11, 14, 0, 0), to: local(2026, 11, 14, 7, 0) });
  assert.ok(absolute.ok, absolute.note);
  assert.strictEqual(absolute.screen[0].at, local(2026, 11, 14, 1, 12, 2) + 345);
  assert.strictEqual(absolute.doze[0].to - absolute.doze[0].from, (3 * 60 - 78) * 60000);
});

test('history: no time base -> no data, and a cut head with the base kept works', function () {
  var noBase = parse.parseHistory('          +1h02m03s123ms (2) 087 +screen\n', { from: 0, to: 9e15 });
  assert.strictEqual(noBase.ok, false);
  assert.ok(/RESET:TIME/.test(noBase.note));
  var lines = sample('history').split('\n');
  var cut = lines.slice(0, 4).concat(['----8<----', 'ry broken half line (2) 09', ''], lines.slice(12)).join('\n');
  var h = parse.parseHistory(cut, { from: local(2026, 11, 13, 22, 0), to: local(2026, 11, 14, 7, 12, 30) });
  assert.ok(h.ok, h.note);
  assert.strictEqual(h.points[h.points.length - 1].level, 81);
});

test('checkin: wake locks, wake-up alarms, cpu, estimated power, names', function () {
  var c = parse.parseCheckin(sample('checkin-evening'));
  assert.ok(c.ok, c.note);
  assert.strictEqual(c.batteryRealtime, 17869000);
  assert.strictEqual(c.names[10245], 'ru.marketplace.app');
  assert.strictEqual(c.uids[10160].wlMs, 720000);
  assert.strictEqual(c.uids[10160].wua, 300);
  assert.strictEqual(c.uids[10160].cpuMs, 370000);
  assert.strictEqual(c.uids[10160].mah, 35.2);
  assert.strictEqual(c.other.scrn, 120.4);
});

test('checkin diff: evening–morning, and a reset is not used', function () {
  var evening = parse.parseCheckin(sample('checkin-evening'));
  var morning = parse.parseCheckin(sample('checkin-morning'));
  var diff = parse.checkinDiff(evening, morning);
  assert.ok(diff.ok, diff.note);
  var by = {};
  diff.uids.forEach(function (row) { by[row.uid] = row; });
  assert.strictEqual(by[10245].wlMs, 2400000);
  assert.strictEqual(by[10160].wlMs, 960000);
  assert.strictEqual(by[10245].wua, 9);
  assert.strictEqual(by[10280].wua, 4);
  var reset = parse.checkinDiff(morning, evening);
  assert.strictEqual(reset.ok, false);
  assert.strictEqual(reset.reset, true);
  assert.ok(/обнулились/.test(reset.note));
});

test('deviceidle: state and the lists exempt from Doze', function () {
  var d = parse.parseDeviceIdle(sample('deviceidle'));
  assert.ok(d.ok);
  assert.strictEqual(d.state, 'IDLE');
  assert.strictEqual(d.lightState, 'OVERRIDE');
  assert.deepStrictEqual(d.user, ['app.assi', 'org.telegram.messenger']);
  assert.deepStrictEqual(d.system, ['com.google.android.gms', 'com.android.phone']);
});

test('jobscheduler: recently completed jobs with times', function () {
  var now = local(2026, 11, 14, 7, 12, 30);
  var j = parse.parseJobs(sample('jobscheduler'), now);
  assert.ok(j.ok, j.note);
  assert.strictEqual(j.jobs.length, 5);
  assert.strictEqual(j.jobs[0].pkg, 'com.google.android.gms');
  assert.strictEqual(j.jobs[0].uid, 10160);
  assert.strictEqual(j.jobs[0].at, now - (10 * 60 + 3) * 1000 - 200);
  assert.strictEqual(j.jobs[4].pkg, 'org.telegram.messenger');
});

test('jobscheduler: the older «Job history» format counts starts only', function () {
  var text = [
    '  Job history:',
    '       -1h29m32s137ms   START: #u0a107/1 com.android.vending/com.google.android.finsky.scheduler.process.mainimpl.PhoneskyJobServiceMain',
    '       -1h29m31s931ms    STOP: #u0a107/1 com.android.vending/com.google.android.finsky.scheduler.process.mainimpl.PhoneskyJobServiceMain',
    '       -20m0s0ms   START-P: #u0a160/3 com.google.android.gms/.gcm.GcmTaskService',
    '  Pending queue:'
  ].join('\n');
  var j = parse.parseJobs(text, 10000000);
  assert.ok(j.ok);
  assert.strictEqual(j.jobs.length, 2);
  assert.strictEqual(j.jobs[0].pkg, 'com.android.vending');
  assert.strictEqual(j.jobs[1].at, 10000000 - 1200000);
});

test('boot reason and Samsung auto restart', function () {
  assert.strictEqual(parse.bootReason('\nreboot,userrequested\n'), 'reboot,userrequested');
  assert.strictEqual(parse.bootReason(''), null);
  assert.strictEqual(parse.classifyBoot('kernel_panic', false, false), 'failure');
  assert.strictEqual(parse.classifyBoot('reboot,userrequested', true, false), 'manual');
  assert.strictEqual(parse.classifyBoot('reboot', true, true), 'planned');
  assert.strictEqual(parse.classifyBoot(null, true, false), 'clean');
  assert.strictEqual(parse.classifyBoot(null, false, false), 'unknown');
  var auto = parse.autoRestart('auto_restart_on=1\nsem_auto_restart_time=180\nscreen_brightness=40\n');
  assert.ok(auto.found);
  assert.ok(auto.on);
  assert.strictEqual(parse.autoRestart('screen_brightness=40').found, false);
});

console.log((count - failed) + ' из ' + count + ' прошли');
if (failed) process.exitCode = 1;
