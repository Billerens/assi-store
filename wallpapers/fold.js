// The two screens of a Fold: what the reflection probe of WallpaperManager found and which way
// of setting the outer screen apart follows from it. Whether a way really works is seen only on
// the phone — so a found flag is a candidate until the owner confirms it with his own eyes.
// Pure: runs in node (tests) and in the engine.

var PATTERN = /SUB|COVER|FOLD|DISPLAY|WHICH|SCREEN|MULTI|CROP/i;

/** Names worth a look: what may set a wallpaper for one display (Samsung adds its own with "sem"). */
exports.interesting = function (name) {
  var n = String(name || '');
  return PATTERN.test(n) || /^sem/.test(n);
};

/**
 * The raw probe → what it means:
 * probe: { sdk, fields: [{ name, value, isStatic }], methods: [{ name, params: ['android.graphics.Bitmap', …] }], errors: [] }
 */
exports.summarize = function (probe) {
  probe = probe || {};
  var fields = (probe.fields || []).filter(function (f) { return exports.interesting(f.name); });
  var methods = (probe.methods || []).filter(function (m) { return exports.interesting(m.name); });
  // Two shapes of the same Android 15+ feature: a map "screen size → crop" taking a bitmap, or
  // (what Android 16 builds expose publicly) a stream with crops keyed by screen orientation.
  var byMap = (probe.methods || []).filter(function (m) {
    return m.name === 'setBitmapWithCrops' && m.params && m.params[0] === 'android.graphics.Bitmap' &&
      m.params.some(function (p) { return /Map$/.test(p); });
  })[0];
  var byOrientation = (probe.methods || []).filter(function (m) {
    return m.name === 'setStreamWithCrops' && m.params && m.params[0] === 'java.io.InputStream' &&
      m.params.some(function (p) { return /SparseArray$/.test(p); });
  })[0];
  var crops = byMap ? { name: byMap.name, params: byMap.params, kind: 'map' }
    : byOrientation ? { name: byOrientation.name, params: byOrientation.params, kind: 'orientations' } : null;
  // A static int whose name says "the other display": the candidates for the outer screen.
  var flags = fields.filter(function (f) {
    return f.isStatic && typeof f.value === 'number' && /^FLAG_|^SEM_FLAG_|WHICH/.test(f.name) && /SUB|COVER|FOLD|SECOND|DISPLAY/.test(f.name);
  }).map(function (f) { return { name: f.name, value: f.value }; });
  return {
    sdk: probe.sdk || 0,
    device: probe.device || '',
    crops: crops,
    flags: flags,
    fields: fields.map(function (f) { return f.name + (f.value !== undefined && f.value !== null ? ' = ' + f.value : ''); }),
    methods: methods.map(function (m) { return m.name + '(' + (m.params || []).map(function (p) { return String(p).split('.').pop(); }).join(', ') + ')'; }),
    errors: probe.errors || []
  };
};

/**
 * Which way to set the screens: { mode: 'crops' | 'flag' | 'single', flag?, why }.
 * confirmed: the flag the owner saw working ({ name, value }) or null; failed: ways that threw before.
 */
exports.plan = function (summary, setting, confirmed, failed) {
  summary = summary || { flags: [], crops: null };
  failed = failed || {};
  var wantCrops = setting === 'auto' || setting === 'crops';
  var wantFlag = setting === 'auto' || setting === 'flag';
  if (wantFlag && confirmed && confirmed.name && !failed.flag) {
    return { mode: 'flag', flag: confirmed, why: 'внешний экран — флагом ' + confirmed.name + ', владелец проверил' };
  }
  if (wantCrops && summary.crops && !failed.crops) {
    return { mode: 'crops', why: 'одна картинка с кадрированиями под каждый экран (' + summary.crops.name + ')' };
  }
  if (setting === 'flag' && !(confirmed && confirmed.name)) {
    return { mode: 'single', why: 'флаг внешнего экрана не проверен — один кадр на оба экрана' };
  }
  if (setting === 'crops' && (!summary.crops || failed.crops)) {
    return { mode: 'single', why: failed.crops ? 'кадрирования системы не сработали — один кадр на оба экрана' : 'в этой системе нет обоев с кадрированиями — один кадр на оба экрана' };
  }
  return {
    mode: 'single',
    why: setting === 'single' ? 'так выбрано в настройках: один кадр на оба экрана'
      : 'раздельные обои на внешний экран недоступны — один кадр, кадрированный под внутренний с безопасной серединой'
  };
};

/** The line the settings show about the screens, plain and true. */
exports.honest = function (plan, summary) {
  var lines = [plan.why];
  if (summary && summary.flags && summary.flags.length && plan.mode !== 'flag') {
    lines.push('Найдены флаги, похожие на внешний экран: ' + summary.flags.map(function (f) { return f.name; }).join(', ') + ' — их можно проверить.');
  }
  if (!summary || (!summary.sdk && !summary.fields)) lines.push('Разведка экранов ещё не проводилась.');
  return lines.join(' ');
};

/**
 * The crop of the single shot when the system puts one picture on both screens: the inner
 * screen's proportions, the middle kept safe — the outer screen shows a narrow band of it.
 * Returns the proportions to crop the original at.
 */
exports.singleShot = function (settings) {
  return { width: settings.innerWidth, height: settings.innerHeight };
};
