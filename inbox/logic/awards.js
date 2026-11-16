// Achievements of the inbox for «Ачивки за жизнь» (they are handed in by achieve.js):
//   «Ноль входящих» — nothing new is left in «Важно» and «Подождёт» on a day when many messages came;
//   «Ответил всем важным до 10:00» — every conversation with an important message of the morning got
//   an answer from the feed before the hour of the settings.
// Pure: rows and numbers come in as arguments. The thresholds are settings (logic/settings.js).

/** 'HH:MM' → minutes after midnight; null when it is not a time. */
exports.minutes = function (text) {
  var found = /^(\d{1,2}):(\d{2})$/.exec(String(text || ''));
  if (!found || Number(found[1]) > 23 || Number(found[2]) > 59) return null;
  return Number(found[1]) * 60 + Number(found[2]);
};

/**
 * «Ноль входящих»: counts — conversations with new messages by tab (feed.counts), came — messages of
 * «Важно» and «Подождёт» that came today, min — the setting zeroMinMessages.
 */
exports.zero = function (counts, came, min) {
  counts = counts || {};
  return !((counts.important || 0) + (counts.later || 0)) && Number(came) >= Number(min);
};

/**
 * «Ответил всем важным»: important — [{ chatId, time }] the last important message of each chat today,
 * sent — [{ chatId, sentAt }] the last answer sent from the feed to each chat today. Every such chat
 * has an answer after its last important message, and there are at least minChats of them.
 * nowMinutes / byMinutes — the time now and the setting answerBy, in minutes after midnight.
 */
exports.answered = function (important, sent, minChats, nowMinutes, byMinutes) {
  if (byMinutes === null || byMinutes === undefined || !(nowMinutes < byMinutes)) return false;
  var last = {};
  (sent || []).forEach(function (row) {
    if (row && row.chatId !== null && row.chatId !== undefined) last[row.chatId] = Math.max(last[row.chatId] || 0, Number(row.sentAt) || 0);
  });
  var chats = {};
  (important || []).forEach(function (row) {
    if (row && row.chatId !== null && row.chatId !== undefined) chats[row.chatId] = Math.max(chats[row.chatId] || 0, Number(row.time) || 0);
  });
  var ids = Object.keys(chats);
  if (ids.length < Number(minChats)) return false;
  return ids.every(function (id) { return last[id] >= chats[id]; });
};
