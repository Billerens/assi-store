// Distracting apps during a session: what to do when one comes to the front. Pure: the event
// (on('screen.app')) and the memory of earlier attempts come in, the decision goes out.
//
// memory: { allowed: package let through, at: when it was let through,
//           last: { package, time } — the latest attempt }

/** Is a package in the list (exact package, or a part of it ending with a dot: "com.vk.")? */
exports.listed = function (pkg, list) {
  var value = String(pkg || '');
  return (list || []).some(function (item) {
    var wanted = String(item || '').trim();
    if (!wanted) return false;
    if (wanted.charAt(wanted.length - 1) === '.') return value.indexOf(wanted) === 0;
    return value === wanted;
  });
};

/**
 * What to do with an app that came to the front:
 *   { action: 'none' } — not distracting, or still let through;
 *   { action: 'remind' | 'home', attempt: true } — a reminder, and back home when strict;
 *   { action: 'allow', attempt: true } — the second attempt soon after: let through ("если очень надо").
 * Also the memory to keep. `own` — the packages never touched (Axiko itself, the launcher).
 */
exports.decide = function (pkg, now, memory, s, own) {
  memory = memory || {};
  var next = { allowed: memory.allowed || null, at: memory.at || 0, last: memory.last || null };
  var value = String(pkg || '');
  if (!value || (own || []).indexOf(value) >= 0) {
    // Home or Axiko: a permission ends when the owner leaves the app.
    if (value) next.allowed = null;
    return { action: 'none', memory: next };
  }
  if ((s.passing || []).indexOf(value) >= 0) return { action: 'none', memory: next };
  if (!exports.listed(value, s.distractApps)) {
    next.allowed = null;
    return { action: 'none', memory: next };
  }
  if (next.allowed === value) return { action: 'none', memory: next };
  var again = next.last && next.last.package === value && now - next.last.time <= s.allowSecondSec * 1000;
  next.last = { package: value, time: now };
  if (again) {
    next.allowed = value;
    next.at = now;
    return { action: 'allow', attempt: true, memory: next };
  }
  return { action: s.strictness === 'home' ? 'home' : 'remind', attempt: true, memory: next };
};

/** A session with one more attempt on that package. */
exports.count = function (session, pkg) {
  var apps = {};
  Object.keys(session.blockedApps || {}).forEach(function (key) { apps[key] = session.blockedApps[key]; });
  apps[pkg] = (apps[pkg] || 0) + 1;
  var out = {};
  Object.keys(session).forEach(function (key) { out[key] = session[key]; });
  out.blockedApps = apps;
  out.attempts = (session.attempts || 0) + 1;
  return out;
};

/**
 * Without the accessibility service nothing can be stopped, but the openings can be counted
 * afterwards from the phone's usage events (lib/usage.js): one 'resumed' of a listed app after
 * another app was in front is one opening. Returns { attempts, blockedApps }.
 */
exports.fromUsage = function (events, list, from, to) {
  var apps = {};
  var attempts = 0;
  var front = null;
  (events || []).slice().sort(function (a, b) { return a.time - b.time; }).forEach(function (event) {
    if (event.time < from || event.time > to) return;
    if (event.type !== 'resumed' && event.type !== 'fg-start') return;
    var pkg = String(event.package || '');
    if (pkg === front) return;
    front = pkg;
    if (!exports.listed(pkg, list)) return;
    apps[pkg] = (apps[pkg] || 0) + 1;
    attempts++;
  });
  return { attempts: attempts, blockedApps: apps };
};
