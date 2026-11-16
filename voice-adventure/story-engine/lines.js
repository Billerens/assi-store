// A line of the narrator is one or more parts; a part whose text was recorded in advance is
// played from its file, the rest is spoken by the voice. Pure logic (engine and node).
//
//   lines.segments('Вы взяли лампу. Тяжёлая и тёплая.', [{text: 'Тяжёлая и тёплая.', audio: 'data/…/item-lamp.wav'}])
//   -> [{text: 'Вы взяли лампу.'}, {text: 'Тяжёлая и тёплая.', audio: 'data/…/item-lamp.wav'}]

/** Splits the text into parts, giving each known text its recording. */
function segments(text, known) {
  var parts = [{ text: String(text || '') }];
  var list = (known || []).filter(function (entry) { return entry && entry.text && entry.audio; })
    .slice().sort(function (a, b) { return b.text.length - a.text.length; });
  list.forEach(function (entry) {
    var next = [];
    parts.forEach(function (part) {
      if (part.audio) { next.push(part); return; }
      var rest = part.text;
      var at = rest.indexOf(entry.text);
      while (at >= 0) {
        if (at > 0) next.push({ text: rest.slice(0, at) });
        next.push({ text: entry.text, audio: entry.audio });
        rest = rest.slice(at + entry.text.length);
        at = rest.indexOf(entry.text);
      }
      if (rest) next.push({ text: rest });
    });
    parts = next;
  });
  return parts.map(function (part) {
    return part.audio ? part : { text: part.text.replace(/\s+/g, ' ').trim() };
  }).filter(function (part) { return part.audio || part.text; });
}

/**
 * The volume plan of the last scenes of a night episode: the voice grows quieter from 1 to `to`
 * across the last `count` scenes. Returns {sceneId: {from, to}} for those scenes.
 */
function fadePlan(order, count, to) {
  var out = {};
  var tail = order.slice(Math.max(0, order.length - count));
  tail.forEach(function (id, i) {
    var from = 1 - (1 - to) * (i / tail.length);
    var end = 1 - (1 - to) * ((i + 1) / tail.length);
    out[id] = { from: Math.round(from * 1000) / 1000, to: Math.round(end * 1000) / 1000 };
  });
  return out;
}

/** The volume at a moment of a part: linear between from and to. */
function volumeAt(fade, position, duration) {
  if (!fade) return 1;
  if (!duration || duration <= 0) return fade.from;
  var k = Math.max(0, Math.min(1, position / duration));
  return fade.from + (fade.to - fade.from) * k;
}

exports.segments = segments;
exports.fadePlan = fadePlan;
exports.volumeAt = volumeAt;
