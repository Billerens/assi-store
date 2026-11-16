// The feed as the owner sees it: conversations with their bucket and preview, the counts, the
// widget's lines, the summary of a period for Focus, finding a chat by a name said aloud. Pure.
var triage = require('./triage.js');
var digest = require('./digest.js');

var RANK = { important: 3, later: 2, hidden: 2, noise: 1, otp: 1 };

/** The bucket a message counts in on the feed: codes are noise, hidden texts wait. */
function shown(bucket) {
  if (bucket === 'otp') return 'noise';
  if (bucket === 'hidden') return 'later';
  return RANK[bucket] ? bucket : 'later';
}

exports.shown = shown;

/**
 * Did the messenger hide this message's text? Such a message is stored with an empty text; it is
 * in the bucket "hidden", or in the bucket of the owner's rule ("всегда важно", "всегда шум").
 */
exports.isHidden = function (message) {
  if (!message || message.own || message.bucket === 'otp') return false;
  if (message.bucket === 'hidden' || message.hidden === true) return true;
  return message.text !== undefined && String(message.text === null ? '' : message.text) === '';
};

/** The bucket of a conversation: the highest of its new messages; without new ones, of the last. */
exports.bucketOf = function (unread, last) {
  var best = null;
  (unread || []).forEach(function (message) {
    if (!best || (RANK[message.bucket] || 0) > (RANK[best] || 0)) best = message.bucket;
  });
  return shown(best || (last && last.bucket) || 'later');
};

function quote(text, limit) {
  var value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > limit ? value.slice(0, limit - 1) + '…' : value;
}

exports.quote = quote;

/**
 * A conversation card.
 *   chat:   a row of `chats`
 *   last:   its last message
 *   unread: its new messages
 */
exports.card = function (chat, last, unread) {
  unread = unread || [];
  var asks = unread.some(function (message) { return message.asks; });
  return {
    id: chat.id,
    title: chat.title,
    app: chat.app || '',
    package: chat.package,
    isGroup: Boolean(chat.isGroup),
    time: chat.lastTime || (last && last.time) || 0,
    unread: unread.length,
    bucket: exports.bucketOf(unread, last),
    fresh: unread.length > 0,
    asks: asks,
    override: chat.override || '',
    canReply: Boolean(chat.canReply),
    digest: chat.isGroup && chat.digest ? chat.digest : '',
    preview: last ? {
      sender: last.sender || '',
      text: last.bucket === 'otp' ? 'Код подтверждения' : last.text || '',
      hidden: exports.isHidden(last),
      otp: last.bucket === 'otp',
      edited: Boolean(last.edited),
      reason: last.reason || '',
      triagedBy: last.triagedBy || ''
    } : null
  };
};

/** Cards in order: the asking and important first, then by time. */
exports.sort = function (cards) {
  return cards.slice().sort(function (a, b) {
    if (a.fresh !== b.fresh) return a.fresh ? -1 : 1;
    var rank = (RANK[b.bucket] || 0) - (RANK[a.bucket] || 0);
    if (a.fresh && rank) return rank;
    return (b.time || 0) - (a.time || 0);
  });
};

/** Cards of one tab: 'important' | 'later' | 'noise' show conversations with new messages there; 'all' shows all. */
exports.tab = function (cards, which) {
  if (which === 'all') return exports.sort(cards);
  return exports.sort(cards.filter(function (card) { return card.fresh && card.bucket === which; }));
};

exports.counts = function (cards) {
  var out = { important: 0, later: 0, noise: 0, all: cards.length };
  cards.forEach(function (card) { if (card.fresh) out[card.bucket] = (out[card.bucket] || 0) + 1; });
  return out;
};

/** The tab the screen opens on: "important" if there is something, else "later". */
exports.firstTab = function (counts) {
  return counts.important > 0 ? 'important' : 'later';
};

/** One line about a conversation, for the widget and for summaries. */
exports.line = function (card, limit) {
  limit = limit || 80;
  if (card.isGroup && card.unread > 1) {
    var head = card.title + ': ' + card.unread + ' ' + digest.plural(card.unread, 'новое', 'новых', 'новых');
    return card.digest ? quote(head + ', ' + card.digest, limit) : quote(head, limit);
  }
  var preview = card.preview || {};
  var text = preview.hidden ? 'текст скрыт' : preview.text;
  var who = card.isGroup && preview.sender ? card.title + ' · ' + preview.sender : card.title;
  return quote(who + ': ' + text, limit);
};

/** The widget: { title, text, open }. */
exports.widget = function (cards, lines) {
  var counts = exports.counts(cards);
  var head = 'Важно: ' + counts.important + ' · Подождёт: ' + counts.later;
  var shownCards = exports.tab(cards, 'important').concat(exports.tab(cards, 'later')).slice(0, lines === undefined ? 2 : lines);
  var text = [head].concat(shownCards.map(function (card) { return exports.line(card, 60); }));
  if (!cards.length) text = ['Пока пусто: сообщения появятся, когда придут уведомления мессенджеров'];
  return { title: 'Входящие', text: text.join('\n'), open: 'modules/inbox/ui/index.html' };
};

/**
 * What came in a period, for Focus and for the voice: important messages one by one, the rest by
 * conversation in one line each.
 *   messages: [{ id, chatId, sender, text, time, bucket, reason, asks, hidden }] (codes are left out)
 *   chats:    { <id>: chat row }
 */
exports.since = function (messages, chats, from, to, names) {
  var list = (messages || []).filter(function (message) { return message.bucket !== 'otp'; });
  var important = [];
  var groups = {};
  var order = [];
  var byBucket = { important: 0, later: 0, noise: 0 };
  list.forEach(function (message) {
    var chat = chats[message.chatId] || { id: message.chatId, title: message.chatId, isGroup: 0 };
    var bucket = shown(message.bucket);
    byBucket[bucket] = (byBucket[bucket] || 0) + 1;
    if (bucket === 'important') {
      important.push({
        id: message.id, chatId: chat.id, chat: chat.title, app: chat.app || '', isGroup: Boolean(chat.isGroup),
        sender: message.sender || '', text: exports.isHidden(message) ? '' : message.text,
        hidden: exports.isHidden(message), time: message.time, reason: message.reason || '', asks: Boolean(message.asks),
        canReply: Boolean(chat.canReply)
      });
      return;
    }
    if (!groups[chat.id]) {
      groups[chat.id] = { chatId: chat.id, title: chat.title, app: chat.app || '', isGroup: Boolean(chat.isGroup), count: 0, messages: [], digest: chat.digest || '', digestAt: chat.digestAt || 0 };
      order.push(chat.id);
    }
    groups[chat.id].count++;
    groups[chat.id].messages.push(message);
  });
  var others = order.map(function (id) {
    var group = groups[id];
    var mentioned = group.messages.some(function (message) { return !message.hidden && triage.mentions(message.text, names); });
    var asks = group.messages.some(function (message) { return message.asks; });
    var last = group.messages[group.messages.length - 1];
    var about;
    if (group.isGroup && group.digest && group.digestAt >= from) about = group.digest;
    else if (group.isGroup) about = mentioned ? 'вас упомянули' : asks ? 'есть вопрос' : 'вас не упоминали';
    else about = exports.isHidden(last) ? 'текст скрыт' : '«' + quote(last.text, 60) + '»';
    return {
      chatId: id, title: group.title, app: group.app, isGroup: group.isGroup, count: group.count,
      mentioned: mentioned, asks: asks, about: about,
      line: group.title + ' — ' + group.count + ', ' + about
    };
  });
  others.sort(function (a, b) {
    if (a.asks !== b.asks) return a.asks ? -1 : 1;
    return b.count - a.count;
  });
  var chatCount = order.length + important.map(function (item) { return item.chatId; }).filter(function (id, index, all) {
    return all.indexOf(id) === index && order.indexOf(id) < 0;
  }).length;
  return { from: from, to: to, total: list.length, chats: chatCount, important: important, others: others, byBucket: byBucket };
};

/**
 * The chat meant by a name said aloud ("Пете", "маме", "в Семью"): personal chats first, then the
 * most recent. chats: [{ id, title, isGroup, lastTime }]. Returns the chat or null.
 */
var FILLER = ['в', 'во', 'к', 'ко', 'у', 'для', 'чат', 'чате', 'чата', 'группа', 'группу', 'группе', 'беседа', 'беседу', 'беседе', 'диалог', 'личку', 'телеграм', 'телеграме', 'telegram', 'whatsapp', 'вотсап', 'ватсап'];

exports.findChat = function (chats, name) {
  var wanted = triage.words(name).filter(function (word) { return FILLER.indexOf(word) < 0; });
  if (!wanted.length) return null;
  name = wanted.join(' ');
  var best = null;
  var bestScore = 0;
  (chats || []).forEach(function (chat) {
    var title = triage.words(chat.title);
    if (!title.length) return;
    var score = 0;
    if (title.join(' ') === wanted.join(' ')) score = 100;
    else if (triage.sameName(name, chat.title)) score = 80;
    else if (wanted.every(function (word) {
      return word.length >= 3 && title.some(function (other) { return other.length >= 3 && (other.indexOf(word) === 0 || word.indexOf(other) === 0); });
    })) score = 50;
    if (!score) return;
    if (!chat.isGroup) score += 10;
    if (!best || score > bestScore || (score === bestScore && (chat.lastTime || 0) > (best.lastTime || 0))) {
      best = chat;
      bestScore = score;
    }
  });
  return best;
};

/** Start of the local day of a moment, and its "YYYY-MM-DD". */
exports.day = function (time) {
  var date = new Date(time);
  date.setHours(0, 0, 0, 0);
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  return { start: date.getTime(), key: date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) };
};
