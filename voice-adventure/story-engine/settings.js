// Settings as a schema: every tunable number has a default, a title, limits; what the owner
// changed is kept apart and merged over the defaults. Pure logic (engine, node and screens).
//
//   schema = {listenSec: {value: 12, title: 'Слушать, секунд', min: 3, max: 60}}
//   settings.values(schema, {listenSec: 99}) -> {listenSec: 60}

function clampNumber(value, spec) {
  var n = Number(String(value).replace(',', '.'));
  if (!isFinite(n)) return spec.value;
  if (spec.min !== undefined && n < spec.min) n = spec.min;
  if (spec.max !== undefined && n > spec.max) n = spec.max;
  if (spec.integer) n = Math.round(n);
  return n;
}

function validTime(value) {
  var match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  var h = Number(match[1]);
  var m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return (h < 10 ? '0' : '') + h + ':' + match[2];
}

/** One value brought to the type and the limits of its spec; the default when it does not fit. */
function coerce(spec, value) {
  if (value === undefined || value === null || value === '') return spec.value;
  var kind = spec.type || (Array.isArray(spec.value) ? 'list' : typeof spec.value);
  if (kind === 'number') return clampNumber(value, spec);
  if (kind === 'boolean') return value === true || value === 'true' || value === 1 || value === 'on';
  if (kind === 'time') return validTime(value) || spec.value;
  if (kind === 'list') return Array.isArray(value) ? value : spec.value;
  if (kind === 'object') return value && typeof value === 'object' && !Array.isArray(value) ? value : spec.value;
  if (spec.options && spec.options.length) {
    var ids = spec.options.map(function (option) { return Array.isArray(option) ? option[0] : option; });
    return ids.indexOf(String(value)) >= 0 ? String(value) : spec.value;
  }
  return String(value);
}

/** The values to work with: the defaults with the owner's changes over them. */
function values(schema, saved) {
  var out = {};
  saved = saved || {};
  Object.keys(schema).forEach(function (key) { out[key] = coerce(schema[key], saved[key]); });
  return out;
}

/** Only what differs from the defaults: that is what gets saved. */
function changes(schema, wanted) {
  var out = {};
  Object.keys(wanted || {}).forEach(function (key) {
    if (!schema[key]) return;
    var value = coerce(schema[key], wanted[key]);
    if (JSON.stringify(value) !== JSON.stringify(schema[key].value)) out[key] = value;
  });
  return out;
}

/** The schema with the current values, for a settings screen: [{key, title, value, …}]. */
function describe(schema, saved) {
  var now = values(schema, saved);
  return Object.keys(schema).map(function (key) {
    var spec = schema[key];
    var row = { key: key, value: now[key], fallback: spec.value, type: spec.type || (Array.isArray(spec.value) ? 'list' : typeof spec.value) };
    ['title', 'hint', 'min', 'max', 'step', 'group', 'options', 'unit'].forEach(function (field) {
      if (spec[field] !== undefined) row[field] = spec[field];
    });
    return row;
  });
}

/** Minutes since midnight of «ЧЧ:ММ». */
function minutesOf(time) {
  var fixed = validTime(time);
  if (!fixed) return null;
  return Number(fixed.slice(0, 2)) * 60 + Number(fixed.slice(3));
}

exports.coerce = coerce;
exports.values = values;
exports.changes = changes;
exports.describe = describe;
exports.validTime = validTime;
exports.minutesOf = minutesOf;
