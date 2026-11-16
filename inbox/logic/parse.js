// A messenger's notification -> the messages in it: { chat, isGroup, messages: [{ sender, text,
// time, msgTime, hidden, otp }] }. Pure: the notification comes in as plain data, the rules of
// each messenger as data too (parsers.json), so the agent fixes them without touching code.

/** Messengers collected by default when they are installed. */
exports.KNOWN = [
  'org.telegram.messenger', 'org.telegram.messenger.web', 'org.thunderdog.challegram',
  'com.whatsapp', 'com.whatsapp.w4b', 'com.viber.voip', 'com.vkontakte.android', 'com.vk.im',
  'ru.oneme.app', 'com.samsung.android.messaging', 'com.google.android.apps.messaging',
  'org.thoughtcrime.securesms'
];

var INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

/** A text as shown, without the invisible direction marks messengers put in. */
function clean(text) {
  return String(text === null || text === undefined ? '' : text).replace(INVISIBLE, '').replace(/\r/g, '').trim();
}

exports.clean = clean;

/** A chat's name in the form used to tell chats apart: lower case, single spaces, ё as е. */
function normalize(title) {
  return clean(title).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

exports.normalize = normalize;

/** The id of a chat: package + ':' + its name (and the profile of a dual messenger). */
exports.chatId = function (pkg, title, user) {
  var id = String(pkg) + ':' + normalize(title);
  return user !== undefined && user !== null && Number(user) > 0 ? id + '#' + Number(user) : id;
};

function regex(source, flags) {
  try {
    return new RegExp(source, flags === undefined ? 'i' : flags);
  } catch (error) {
    return null;
  }
}

function any(patterns, text) {
  var lower = String(text).toLowerCase();
  for (var i = 0; i < (patterns || []).length; i++) {
    var re = regex(patterns[i]);
    if (re && re.test(lower)) return true;
  }
  return false;
}

/** The factory parsers with the owner's or the agent's ones over them (same id replaces). */
exports.merge = function (factory, saved) {
  var list = ((factory && factory.parsers) || []).slice();
  var generic = (saved && saved.generic) || (factory && factory.generic) || { id: 'generic', text: [], hidden: [] };
  ((saved && saved.parsers) || []).forEach(function (own) {
    if (!own || !own.id) return;
    var at = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === own.id) at = i;
    if (at >= 0) list[at] = own;
    else list.push(own);
  });
  return { parsers: list, generic: generic };
};

/** The parser of a package, or the generic one. */
exports.parserFor = function (pkg, all) {
  var list = (all && all.parsers) || [];
  for (var i = 0; i < list.length; i++) {
    if ((list[i].packages || []).indexOf(pkg) >= 0) return list[i];
  }
  return (all && all.generic) || { id: 'generic', text: [], hidden: [] };
};

/** The name of the app as the parsers know it, for packages that do not say. */
exports.appName = function (pkg, all) {
  var parser = exports.parserFor(pkg, all);
  return parser && parser.name ? parser.name : '';
};

// Confirmation codes: digits next to words about a code. Never given to a model.
var CODE_WORDS = /(код|code|пароль|парол|password|passcode|pin|otp|verification|verify|подтвержд|не сообщайте|никому не|do not share|don't share|one-time|одноразов|вход в|login|sign in)/i;
var CODE_DIGITS = /(^|[^\d])(\d{4,8})([^\d]|$)|(^|[^\d])\d{3}[- ]\d{3}([^\d]|$)/;

exports.isOtp = function (text) {
  var value = String(text || '');
  if (value.length > 400) return false;
  return CODE_WORDS.test(value) && CODE_DIGITS.test(value);
};

exports.isHidden = function (text, parser) {
  return any((parser && parser.hidden) || [], clean(text));
};

exports.isSelf = function (sender, parser) {
  var name = clean(sender);
  if (!name) return true;
  return any((parser && parser.self) || ['^(вы|you)$'], name);
};

/** Does the text look like a person's name ("Петя", "Анна Петрова", "@nick")? */
function nameLike(text) {
  var value = clean(text);
  if (!value || value.length > 40) return false;
  if (/^[\d\s+()-]+$/.test(value)) return /\d{5,}/.test(value);   // a phone number is a sender too
  var words = value.split(/\s+/);
  if (words.length > 4) return false;
  if (/[.!?]$/.test(value)) return false;
  var first = value.charAt(0);
  return first === '@' || first !== first.toLowerCase() || /[^\u0000-ɏЀ-ӿ]/.test(first);
}

exports.nameLike = nameLike;

/** "Петя: текст" by the parser's text rules, or null. */
function splitText(text, parser, group) {
  var rules = (parser && parser.text) || [];
  for (var i = 0; i < rules.length; i++) {
    var rule = rules[i];
    if (rule.when === 'group' && !group) continue;
    var re = regex(rule.re);
    var match = re && re.exec(text);
    if (!match) continue;
    var sender = clean(match[rule.sender || 1]);
    var body = clean(match[rule.text || 2]);
    if (!sender || !body || !nameLike(sender)) continue;
    return { sender: sender, text: body };
  }
  return null;
}

exports.splitText = splitText;

/** The sender prefix a text has by the parser's group rules, even when the chat is not known as a group. */
exports.prefixOf = function (text, parser) {
  var found = splitText(clean(text), parser, true);
  return found ? found.sender : null;
};

/**
 * Is a chat a group by the "Name: " prefixes of its latest messages? `prefixes` has one entry per
 * message, '' where there was none. In a group every message has one, and they differ; in a
 * personal chat a colon now and then ("Итак: завтра в семь") does not make it a group.
 */
exports.looksGroup = function (prefixes, enough, share) {
  var seen = {};
  var distinct = 0;
  var marked = 0;
  var all = prefixes || [];
  all.forEach(function (prefix) {
    var key = normalize(prefix);
    if (!key) return;
    marked++;
    if (!seen[key]) {
      seen[key] = true;
      distinct++;
    }
  });
  if (!all.length) return false;
  return distinct >= (enough || 2) && marked / all.length >= (share === undefined ? 0.75 : share);
};

/**
 * One notification -> the messages it carries.
 *   notice:     the event of on('notification'): { app, package, title, text, time, key, canReply, ongoing,
 *               and with the shell's full description messages, conversationTitle, isGroup, user }
 *   parser:     parserFor(package)
 *   knownGroup: function (chatTitle) -> true when that chat is known to be a group
 * Returns { skip: why } or { chat, isGroup, prefix, messages }.
 */
exports.parseNotice = function (notice, parser, knownGroup) {
  notice = notice || {};
  parser = parser || {};
  if (notice.ongoing) return { skip: 'ongoing' };
  var time = Number(notice.time) || 0;
  var title = clean(notice.title);
  (parser.titleClean || []).forEach(function (source) {
    var re = regex(source);
    if (re) title = clean(title.replace(re, ''));
  });
  var conversation = clean(notice.conversationTitle);
  (parser.titleClean || []).forEach(function (source) {
    var re = regex(source);
    if (re) conversation = clean(conversation.replace(re, ''));
  });

  // The full description: every message of the conversation with its sender and time.
  var list = notice.messages && notice.messages.length ? notice.messages : null;
  if (list) {
    var chat = conversation || title;
    var group = notice.isGroup === true || (!!conversation && conversation !== title);
    var out = [];
    var self = notice.self ? normalize(notice.self) : '';
    list.forEach(function (item) {
      if (!item) return;
      if (exports.isSelf(item.sender, parser)) return;
      if (self && normalize(item.sender) === self) return;
      var body = clean(item.text);
      if (!body) return;
      var hidden = exports.isHidden(body, parser);
      out.push({
        sender: clean(item.sender),
        text: hidden ? '' : body,
        time: Number(item.time) || time,
        msgTime: Number(item.time) || null,
        hidden: hidden,
        otp: !hidden && exports.isOtp(body)
      });
    });
    if (!chat) chat = out.length ? out[0].sender : '';
    if (!chat) return { skip: 'empty' };
    if (!out.length) return { skip: 'own' };
    return { chat: chat, isGroup: group, groupSure: notice.isGroup === true || notice.isGroup === false, prefix: null, messages: out };
  }

  var text = clean(notice.text);
  if (!text && !title) return { skip: 'empty' };
  if (!text) return { skip: 'empty' };
  if (any(parser.skipText, text)) return { skip: 'service' };

  if (exports.isHidden(text, parser)) {
    return {
      chat: title || clean(notice.app) || String(notice.package || ''),
      isGroup: notice.isGroup === true,
      groupSure: false,
      prefix: null,
      messages: [{ sender: '', text: '', time: time, msgTime: null, hidden: true, otp: false }]
    };
  }
  if (title && any(parser.skip, title) && !conversation) return { skip: 'summary' };

  // The group is in the title: "Петя @ Семья", "Семья: Петя".
  var rules = parser.title || [];
  for (var i = 0; i < rules.length; i++) {
    var re = regex(rules[i].re);
    var match = re && re.exec(title);
    if (!match) continue;
    var named = clean(match[rules[i].chat]);
    var from = clean(match[rules[i].sender]);
    if (!named || !from) continue;
    return {
      chat: named,
      isGroup: rules[i].group !== false,
      groupSure: true,
      prefix: null,
      messages: [{ sender: from, text: text, time: time, msgTime: null, hidden: false, otp: exports.isOtp(text) }]
    };
  }

  var chatTitle = conversation || title;
  if (!chatTitle) return { skip: 'empty' };
  var known = notice.isGroup === true || !!(knownGroup && knownGroup(chatTitle));
  var split = splitText(text, parser, known);
  if (split) {
    return {
      chat: chatTitle,
      isGroup: true,
      groupSure: notice.isGroup === true,
      prefix: split.sender,
      messages: [{ sender: split.sender, text: split.text, time: time, msgTime: null, hidden: false, otp: exports.isOtp(split.text) }]
    };
  }
  // A personal chat (or a group not yet recognised): the sender is the chat. The prefix, if the
  // text has one, is remembered: two different ones mean the chat is a group after all.
  return {
    chat: chatTitle,
    isGroup: false,
    groupSure: notice.isGroup === false,
    prefix: exports.prefixOf(text, parser),
    messages: [{ sender: chatTitle, text: text, time: time, msgTime: null, hidden: false, otp: exports.isOtp(text) }]
  };
};

/**
 * A chat has just been recognised as a group: its earlier messages, stored with the chat's name
 * as the sender and "Петя: текст" as the text, are split now. Returns [{ id, sender, text }].
 */
exports.reparse = function (messages, chatTitle, parser) {
  var out = [];
  (messages || []).forEach(function (message) {
    if (normalize(message.sender) !== normalize(chatTitle)) return;
    var split = splitText(clean(message.text), parser, true);
    if (split) out.push({ id: message.id, sender: split.sender, text: split.text });
  });
  return out;
};

/** A name in Russian for "from …": Петя -> Пети, Иван -> Ивана; other names as they are. */
exports.genitive = function (name) {
  var value = clean(name);
  if (!/^[А-ЯЁ][а-яё]+$/.test(value) || value.length < 3) return null;
  var last = value.charAt(value.length - 1);
  var before = value.charAt(value.length - 2);
  var stem = value.slice(0, -1);
  if (last === 'я') return stem + 'и';
  if (last === 'а') return /[гкхжчшщ]/.test(before) ? stem + 'и' : stem + 'ы';
  if (last === 'й') return stem + 'я';
  if (/[бвгджзклмнпрстфхцчшщ]/.test(last)) return value + 'а';
  return null;
};
