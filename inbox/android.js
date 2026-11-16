// What the inbox does with Android itself: reading a notification fully from the live listener
// service (until the shell describes it fully), app icons, "do not disturb", contacts, opening a
// conversation in its messenger and an own notification with a reply button. Engine only.
var assi = require('lib/assi');

var G = typeof global !== 'undefined' ? global : {};
// Kept as long as the process lives: a notification's contentIntent (to open the conversation
// later) and the receiver of the buttons of our own notifications.
var LIVE = G.__inboxAndroid || (G.__inboxAndroid = {
  intents: new java.util.concurrent.ConcurrentHashMap(),
  receiver: null,
  features: null,
  featuresAt: 0
});

/** The shell's additions (docs/shell-changes.md) that are there: ['notice.full', 'dnd', ...]. */
exports.features = function () {
  if (LIVE.features && Date.now() - LIVE.featuresAt < 60000) return LIVE.features;
  var list = [];
  try {
    var got = native('shell.features');
    if (Array.isArray(got)) list = got.map(String);
  } catch (error) {
    list = [];
  }
  LIVE.features = list;
  LIVE.featuresAt = Date.now();
  return list;
};

exports.has = function (feature) {
  return exports.features().indexOf(feature) >= 0;
};

/** The notification listener service of Assi, or null when notification access is off. */
function service() {
  try {
    var type = Packages.app.assi.sense.NoticeService;
    var found = type.Companion.getInstance();
    if (found) return found;
  } catch (error) { /* try the field */ }
  try {
    var field = Packages.app.assi.sense.NoticeService.instance;
    if (field) return field;
  } catch (error) { /* none */ }
  return null;
}

exports.service = service;

function text(value) {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * What the shell does not pass yet, read from the live notification: the messages of its
 * MessagingStyle, the conversation's title, whether it is a group, the owner's own name in it.
 * Also remembers its contentIntent to open the conversation later. Null when not found.
 */
exports.describe = function (key) {
  var svc = service();
  if (!svc || !key) return null;
  var active;
  try {
    active = svc.getActiveNotifications();
  } catch (error) {
    return null;
  }
  if (!active) return null;
  for (var i = 0; i < active.length; i++) {
    var sbn = active[i];
    if (text(sbn.getKey()) !== String(key)) continue;
    var shown = sbn.getNotification();
    var extras = shown.extras;
    var out = { messages: [] };
    try {
      if (shown.contentIntent) LIVE.intents.put(String(key), shown.contentIntent);
    } catch (error) { /* nothing to keep */ }
    try {
      var bundles = extras.getParcelableArray('android.messages');
      for (var j = 0; bundles && j < bundles.length; j++) {
        var bundle = bundles[j];
        if (!(bundle instanceof android.os.Bundle)) continue;
        var sender = bundle.getCharSequence('sender');
        if (!sender) {
          var person = bundle.getParcelable('sender_person');
          if (person) sender = person.getName();
        }
        out.messages.push({ sender: sender ? text(sender) : null, text: text(bundle.getCharSequence('text')), time: Number(bundle.getLong('time')) || 0 });
      }
    } catch (error) { /* no MessagingStyle */ }
    try { out.conversationTitle = text(extras.getCharSequence('android.conversationTitle')); } catch (error) { /* none */ }
    try {
      if (extras.containsKey('android.isGroupConversation')) out.isGroup = Boolean(extras.getBoolean('android.isGroupConversation'));
    } catch (error) { /* unknown */ }
    try {
      var self = extras.getCharSequence('android.selfDisplayName');
      if (!self) {
        var user = extras.getParcelable('android.messagingUser');
        if (user) self = user.getName();
      }
      if (self) out.self = text(self);
    } catch (error) { /* none */ }
    try { out.shortcutId = text(shown.getShortcutId()); } catch (error) { /* none */ }
    try { out.channel = text(shown.getChannelId()); } catch (error) { /* none */ }
    try { out.category = text(shown.category); } catch (error) { /* none */ }
    try { out.user = Number(sbn.getUser().hashCode()); } catch (error) { /* none */ }
    try { out.group = text(shown.getGroup()); } catch (error) { /* none */ }
    return out;
  }
  return null;
};

/** Opens the conversation in its messenger: the shell's notices.open, the kept contentIntent, or the app. */
exports.open = function (key, pkg) {
  if (key && exports.has('notice.open')) {
    try {
      if (native('notices.open', key)) return 'notice';
    } catch (error) { /* fall back */ }
  }
  var pending = key ? LIVE.intents.get(String(key)) : null;
  if (pending) {
    try {
      pending.send();
      return 'intent';
    } catch (error) {
      LIVE.intents.remove(String(key));
    }
  }
  if (!pkg) return null;
  var launch = context.getPackageManager().getLaunchIntentForPackage(String(pkg));
  if (!launch) return null;
  launch.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
  context.startActivity(launch);
  return 'app';
};

exports.forget = function (key) {
  if (key) LIVE.intents.remove(String(key));
};

exports.installed = function (pkg) {
  try {
    context.getPackageManager().getPackageInfo(String(pkg), 0);
    return true;
  } catch (error) {
    return false;
  }
};

exports.label = function (pkg) {
  try {
    var pm = context.getPackageManager();
    return String(pm.getApplicationLabel(pm.getApplicationInfo(String(pkg), 0)));
  } catch (error) {
    return '';
  }
};

/** The app's icon as a PNG in data/inbox/icons/, for the screen: '/data/inbox/icons/<pkg>.png' or null. */
exports.icon = function (pkg) {
  var path = 'data/inbox/icons/' + String(pkg).replace(/[^\w.-]/g, '_') + '.png';
  if (assi.files.exists(path)) return '/' + path;
  try {
    var drawable = context.getPackageManager().getApplicationIcon(String(pkg));
    var size = 96;
    var bitmap = android.graphics.Bitmap.createBitmap(size, size, android.graphics.Bitmap.Config.ARGB_8888);
    var canvas = new android.graphics.Canvas(bitmap);
    drawable.setBounds(0, 0, size, size);
    drawable.draw(canvas);
    var file = new java.io.File(assi.files.path(path));
    file.getParentFile().mkdirs();
    var out = new java.io.FileOutputStream(file);
    try {
      bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, out);
    } finally {
      out.close();
    }
    return '/' + path;
  } catch (error) {
    return null;
  }
};

/** Is "do not disturb" on now? */
exports.dndOn = function () {
  if (exports.has('dnd')) {
    try {
      var state = native('dnd.get');
      if (state && state.filter) return state.filter !== 'all';
    } catch (error) { /* read it directly */ }
  }
  try {
    var filter = Number(context.getSystemService('notification').getCurrentInterruptionFilter());
    return filter > 1;
  } catch (error) {
    return false;
  }
};

function canReadContacts() {
  try {
    return context.checkSelfPermission('android.permission.READ_CONTACTS') === 0;
  } catch (error) {
    return false;
  }
}

/** The contact's name for a phone number (SMS apps show numbers), or ''. Never asks for permission. */
exports.contactName = function (number) {
  var value = String(number || '').trim();
  if (!/^[+\d][\d\s()-]{4,}$/.test(value) || !canReadContacts()) return '';
  try {
    var uri = android.net.Uri.withAppendedPath(android.provider.ContactsContract.PhoneLookup.CONTENT_FILTER_URI, android.net.Uri.encode(value));
    var rows = assi.rows(String(uri), ['display_name'], null, null, null, 1);
    return rows.length && rows[0].display_name ? String(rows[0].display_name) : '';
  } catch (error) {
    return '';
  }
};

/** The owner's own name from the phone's profile card, or ''. */
exports.ownerName = function () {
  if (!canReadContacts()) return '';
  try {
    var rows = assi.rows('content://com.android.contacts/profile', ['display_name'], null, null, null, 1);
    return rows.length && rows[0].display_name ? String(rows[0].display_name) : '';
  } catch (error) {
    return '';
  }
};

var REPLY = 'app.assi.inbox.REPLY';
var READ = 'app.assi.inbox.READ';
var REPLY_KEY = 'inbox.reply';

/** The receiver of our notification's buttons: registered once per process. */
function receiver() {
  if (LIVE.receiver) return;
  var handler = extend(android.content.BroadcastReceiver, {
    onReceive: function (ctx, intent) {
      var action = String(intent.getAction());
      var chatId = String(intent.getStringExtra('chatId') || '');
      var id = Number(intent.getIntExtra('nid', 0));
      var typed = '';
      if (action === REPLY) {
        var results = android.app.RemoteInput.getResultsFromIntent(intent);
        var value = results ? results.getCharSequence(REPLY_KEY) : null;
        typed = value ? String(value) : '';
      }
      spawn(function () {
        try {
          var inbox = require('modules/inbox/main.js');
          if (action === REPLY) inbox.replyFromNotice({ chatId: chatId }, typed);
          else inbox.readFromNotice({ chatId: chatId });
        } catch (error) {
          console.error('inbox: notification button: ' + error);
        }
        try { context.getSystemService('notification').cancel(id); } catch (error) { /* gone */ }
      });
    }
  });
  var filter = new android.content.IntentFilter();
  filter.addAction(REPLY);
  filter.addAction(READ);
  var flags = android.os.Build.VERSION.SDK_INT >= 33 ? 4 : 0;   // RECEIVER_NOT_EXPORTED
  context.registerReceiver(handler, filter, flags);
  LIVE.receiver = handler;
}

/**
 * "Важное от Пети: …" with "Ответить" and "Прочитано". Through the shell's notify with buttons
 * when it has them; otherwise built here (the buttons work while the process lives).
 */
exports.notifyImportant = function (options) {
  var open = 'modules/inbox/ui/index.html?chat=' + encodeURIComponent(options.chatId);
  var notifyId = Math.abs(String('inbox:' + options.chatId).split('').reduce(function (h, c) { return (h * 31 + c.charCodeAt(0)) | 0; }, 7)) % 1000000000;
  if (exports.has('notify.actions')) {
    var actions = [{ title: 'Прочитано', call: 'modules/inbox/main.js', fn: 'readFromNotice', args: { chatId: options.chatId } }];
    if (options.canReply) actions.unshift({ title: 'Ответить', reply: true, call: 'modules/inbox/main.js', fn: 'replyFromNotice', args: { chatId: options.chatId } });
    return assi.notify({ id: 'inbox:' + options.chatId, title: options.title, text: options.text, open: open, channel: 'alarm', actions: actions });
  }
  var manager = context.getSystemService('notification');
  var channel = new android.app.NotificationChannel('inbox-important', 'Входящие: важное', android.app.NotificationManager.IMPORTANCE_HIGH);
  try { channel.setBypassDnd(true); } catch (error) { /* needs access to the policy */ }
  manager.createNotificationChannel(channel);
  var Intent = android.content.Intent;
  var PendingIntent = android.app.PendingIntent;
  var launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
  launch.putExtra('open', open);
  var content = PendingIntent.getActivity(context, notifyId, launch, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
  var icon = context.getResources().getIdentifier('ic_spark', 'drawable', context.getPackageName());
  var builder = new android.app.Notification.Builder(context, 'inbox-important')
    .setSmallIcon(icon)
    .setContentTitle(String(options.title))
    .setContentText(String(options.text))
    .setStyle(new android.app.Notification.BigTextStyle().bigText(String(options.text)))
    .setCategory(android.app.Notification.CATEGORY_MESSAGE)
    .setContentIntent(content)
    .setAutoCancel(true);
  try {
    receiver();
    if (options.canReply) {
      var replyIntent = new Intent(REPLY).setPackage(context.getPackageName()).putExtra('chatId', String(options.chatId)).putExtra('nid', java.lang.Integer.valueOf(notifyId));
      var replyPending = PendingIntent.getBroadcast(context, notifyId, replyIntent, PendingIntent.FLAG_MUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
      var remote = new android.app.RemoteInput.Builder(REPLY_KEY).setLabel('Ответ').build();
      builder.addAction(new android.app.Notification.Action.Builder(android.graphics.drawable.Icon.createWithResource(context, icon), 'Ответить', replyPending)
        .addRemoteInput(remote).build());
    }
    var readIntent = new Intent(READ).setPackage(context.getPackageName()).putExtra('chatId', String(options.chatId)).putExtra('nid', java.lang.Integer.valueOf(notifyId));
    var readPending = PendingIntent.getBroadcast(context, notifyId + 1, readIntent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    builder.addAction(new android.app.Notification.Action.Builder(android.graphics.drawable.Icon.createWithResource(context, icon), 'Прочитано', readPending).build());
  } catch (error) {
    console.warn('inbox: buttons in the notification: ' + error);
  }
  manager.notify(notifyId, builder.build());
  return notifyId;
};

/** Removes our own notification about a chat. */
exports.cancelImportant = function (chatId) {
  if (exports.has('notify.actions')) {
    try {
      native('notify.cancel', 'inbox:' + chatId);
      return;
    } catch (error) { /* built here */ }
  }
  var notifyId = Math.abs(String('inbox:' + chatId).split('').reduce(function (h, c) { return (h * 31 + c.charCodeAt(0)) | 0; }, 7)) % 1000000000;
  try { context.getSystemService('notification').cancel(notifyId); } catch (error) { /* gone */ }
};
