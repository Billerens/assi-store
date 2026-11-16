// Repeats and edits. A messenger posts its notification again on every change of the
// conversation, under the same key: most events are not new messages. Pure.
var sha1 = require('./sha1.js').sha1;

/** The fingerprint of a message: sha1(package + chat + sender + text). */
exports.hash = function (pkg, chatId, sender, text) {
  return sha1([String(pkg || ''), String(chatId || ''), String(sender || ''), String(text || '')].join('\u0001'));
};

function bigrams(text) {
  var value = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  var out = {};
  var count = 0;
  for (var i = 0; i < value.length - 1; i++) {
    var pair = value.substr(i, 2);
    out[pair] = (out[pair] || 0) + 1;
    count++;
  }
  return { pairs: out, count: count, text: value };
}

/** How alike two texts are, 0..1 (Dice coefficient over pairs of letters). */
exports.similarity = function (a, b) {
  var x = bigrams(a);
  var y = bigrams(b);
  if (x.text === y.text) return 1;
  if (!x.count || !y.count) return 0;
  var common = 0;
  Object.keys(x.pairs).forEach(function (pair) {
    if (y.pairs[pair]) common += Math.min(x.pairs[pair], y.pairs[pair]);
  });
  return (2 * common) / (x.count + y.count);
};

/**
 * What a message just read from a notification is, against the stored messages of its chat
 * (newest first): { kind: 'repeat' } | { kind: 'edit', of: id } | { kind: 'new', text }.
 *   message:  { hash, sender, text, time, msgTime, hidden }
 *   recent:   [{ id, hash, sender, text, time, msgTime, hidden }]
 *   settings: { repeatWindowHours, editWindowSec, editSimilarity }
 */
exports.classify = function (message, recent, settings) {
  settings = settings || {};
  var repeatMs = (settings.repeatWindowHours === undefined ? 6 : settings.repeatWindowHours) * 3600000;
  var editMs = (settings.editWindowSec === undefined ? 120 : settings.editWindowSec) * 1000;
  var alike = settings.editSimilarity === undefined ? 0.5 : settings.editSimilarity;
  recent = recent || [];

  // The same text again. With the messenger's own times two equal texts are two messages
  // when their times differ ("ок" an hour later); without them, a window decides.
  for (var i = 0; i < recent.length; i++) {
    var old = recent[i];
    if (old.hash !== message.hash) continue;
    if (message.msgTime && old.msgTime) {
      if (Math.abs(message.msgTime - old.msgTime) < 1500) return { kind: 'repeat', of: old.id };
      continue;
    }
    if (Math.abs((message.time || 0) - (old.time || 0)) <= repeatMs) return { kind: 'repeat', of: old.id };
  }
  if (message.hidden) return { kind: 'new', text: '' };

  var sameSender = recent.filter(function (old) {
    return !old.hidden && String(old.sender || '') === String(message.sender || '');
  });
  var latest = sameSender[0];

  // The messenger's own time of a message is kept on an edit: same time, other text.
  if (message.msgTime) {
    for (var j = 0; j < sameSender.length; j++) {
      if (sameSender[j].msgTime && Math.abs(sameSender[j].msgTime - message.msgTime) < 1500) {
        return sameSender[j].text === message.text ? { kind: 'repeat', of: sameSender[j].id } : { kind: 'edit', of: sameSender[j].id };
      }
    }
    return { kind: 'new', text: message.text };
  }
  if (!latest) return { kind: 'new', text: message.text };

  // A notification that keeps the conversation as lines: the new part is what follows the old text.
  var text = String(message.text || '');
  var before = String(latest.text || '');
  if (before && text.length > before.length && text.indexOf(before + '\n') === 0) {
    var rest = text.slice(before.length + 1).trim();
    return rest ? { kind: 'new', text: rest } : { kind: 'repeat', of: latest.id };
  }
  // The same lines, fewer of them: nothing new.
  if (text && before.indexOf(text) === 0 && before.charAt(text.length) === '\n') return { kind: 'repeat', of: latest.id };

  // An edit: soon after the first text, and alike it ("буду в 7" -> "буду в 8").
  var first = latest.firstTime || latest.time || 0;
  if (editMs > 0 && (message.time || 0) - first <= editMs && exports.similarity(text, before) >= alike) {
    return { kind: 'edit', of: latest.id };
  }
  return { kind: 'new', text: text };
};
