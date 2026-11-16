// Controls of a story with the screen off: a notification with buttons («Говорить», «Повторить»,
// «Пауза») and the headset button through android.media.session.MediaSession (one press —
// «говорить», two quick presses — «повтори»). Engine only (Rhino).
//
// The notification uses the shell's buttons (`notify.actions`, docs/shell-changes.md) when the
// shell has them; otherwise it is posted here with its own broadcast receiver, which lives as
// long as the story does.
var assi = require('lib/assi');
var phone = require('./phone.js');

var SELF = 'modules/voice-adventure/story-engine/voice.js';
var NOTICE_ID = 'story-voice';
var NOTICE_NUMBER = 7301;
var ACTION = 'app.assi.STORY_VOICE';

function buttons(phase) {
  return [
    { title: 'Говорить', cmd: 'talk' },
    { title: 'Повторить', cmd: 'repeat' },
    phase === 'paused' ? { title: 'Продолжить', cmd: 'resume' } : { title: 'Пауза', cmd: 'pause' }
  ];
}

function ownNotice(handle, title, text, phase) {
  var manager = context.getSystemService('notification');
  var low = android.app.NotificationManager.IMPORTANCE_LOW;
  manager.createNotificationChannel(new android.app.NotificationChannel('assi-quiet', 'Assi: тихие', low));
  var flags = android.app.PendingIntent.FLAG_IMMUTABLE | android.app.PendingIntent.FLAG_UPDATE_CURRENT;
  var launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
  if (handle.screen) launch.putExtra('open', String(handle.screen));
  var content = android.app.PendingIntent.getActivity(context, NOTICE_NUMBER, launch, flags);
  var iconId = context.getResources().getIdentifier('ic_spark', 'drawable', context.getPackageName());
  var builder = new android.app.Notification.Builder(context, 'assi-quiet')
    .setSmallIcon(iconId)
    .setContentTitle(String(title))
    .setContentText(String(text))
    .setContentIntent(content)
    .setOngoing(true)
    .setOnlyAlertOnce(true);
  buttons(phase).forEach(function (button, i) {
    var intent = new android.content.Intent(ACTION).setPackage(context.getPackageName()).putExtra('cmd', button.cmd);
    var pending = android.app.PendingIntent.getBroadcast(context, NOTICE_NUMBER + 1 + i, intent, flags);
    var icon = android.graphics.drawable.Icon.createWithResource(context, iconId);
    builder.addAction(new android.app.Notification.Action.Builder(icon, button.title, pending).build());
  });
  manager.notify(NOTICE_NUMBER, builder.build());
}

function listenButtons(handle, command) {
  if (handle.receiver) return;
  handle.receiver = extend(android.content.BroadcastReceiver, {
    onReceive: function (ctx, intent) {
      var cmd = intent.getStringExtra('cmd');
      if (cmd) command(null, String(cmd));
    }
  });
  var filter = new android.content.IntentFilter(ACTION);
  if (android.os.Build.VERSION.SDK_INT >= 33) context.registerReceiver(handle.receiver, filter, 4);   // RECEIVER_NOT_EXPORTED
  else context.registerReceiver(handle.receiver, filter);
}

/** Shows or refreshes the notification of the running story. */
function notice(handle, title, text, phase) {
  try {
    if (phone.has('notify.actions')) {
      assi.notify({
        id: NOTICE_ID, title: title, text: text, ongoing: true, silent: true, channel: 'quiet', open: handle.screen,
        actions: buttons(phase).map(function (button) {
          return { title: button.title, call: SELF, fn: 'action', args: { cmd: button.cmd } };
        })
      });
      handle.shell = true;
    } else {
      listenButtons(handle, handle.command);
      ownNotice(handle, title, text, phase);
    }
  } catch (error) {
    console.warn('story-engine: уведомление: ' + error);
  }
}

/** The headset button: play/pause = «говорить», twice quickly = «повтори», «next» = «повтори». */
function headset(handle, doubleMs) {
  if (handle.media) return;
  var pending = { at: 0, waiting: false };
  var press = function () {
    var now = Date.now();
    if (pending.waiting && now - pending.at < doubleMs) {
      pending.waiting = false;
      handle.command(null, 'repeat');
      return;
    }
    pending.waiting = true;
    pending.at = now;
    spawn(function () {
      sleep(doubleMs);
      if (pending.waiting && pending.at === now) {
        pending.waiting = false;
        handle.command(null, 'talk');
      }
    });
  };
  try {
    handle.media = ui(function () {
      var session = new android.media.session.MediaSession(context, 'assi-story');
      var callback = extend(android.media.session.MediaSession.Callback, {
        onMediaButtonEvent: function (intent) {
          var event = intent.getParcelableExtra(android.content.Intent.EXTRA_KEY_EVENT);
          if (!event) return false;
          var code = Number(event.getKeyCode());
          var known = [79, 85, 126, 127, 87];   // HEADSETHOOK, PLAY_PAUSE, PLAY, PAUSE, NEXT
          if (known.indexOf(code) < 0) return false;
          if (Number(event.getAction()) !== 0 || Number(event.getRepeatCount()) > 0) return true;
          if (code === 87) handle.command(null, 'repeat');
          else press();
          return true;
        }
      });
      session.setCallback(callback, new android.os.Handler(android.os.Looper.getMainLooper()));
      var actions = android.media.session.PlaybackState.ACTION_PLAY_PAUSE | android.media.session.PlaybackState.ACTION_PLAY |
        android.media.session.PlaybackState.ACTION_PAUSE | android.media.session.PlaybackState.ACTION_SKIP_TO_NEXT;
      session.setPlaybackState(new android.media.session.PlaybackState.Builder()
        .setActions(actions)
        .setState(android.media.session.PlaybackState.STATE_PLAYING, 0, 1)
        .build());
      session.setActive(true);
      return session;
    });
  } catch (error) {
    console.warn('story-engine: кнопка гарнитуры недоступна: ' + error);
    handle.media = null;
  }
}

/** Everything the story set up for control, gone. */
function release(handle) {
  try {
    if (handle.shell) native('notify.cancel', NOTICE_ID);
    else context.getSystemService('notification').cancel(NOTICE_NUMBER);
  } catch (error) { /* nothing to cancel */ }
  if (handle.receiver) {
    try { context.unregisterReceiver(handle.receiver); } catch (error) { /* already gone */ }
    handle.receiver = null;
  }
  if (handle.media) {
    var media = handle.media;
    handle.media = null;
    try { ui(function () { media.setActive(false); media.release(); }); } catch (error) { /* already released */ }
  }
}

exports.notice = notice;
exports.headset = headset;
exports.release = release;
exports.buttons = buttons;
