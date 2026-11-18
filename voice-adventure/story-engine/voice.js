// The voice loop of a story — «Голосовой движок историй», shared by the adventure and the night
// series. It runs here in the engine, on a background thread (spawn), not on the screen: the
// screen may be off and the phone in a pocket. The screen only shows the state (the event
// `story.state`) and sends commands (axiko.call('modules/voice-adventure/story-engine/voice.js', 'command', …)).
//
// One line of the loop: say it (the phone's voice without the network, a recording when there is
// one) → wait for the end of speech → listen (GigaAM on the phone) → understand (service words
// here, the rest — the story's driver) → save → the next line.
//
//   voice.run(driver, options)
//   driver = {
//     id: 'quest', title: 'Приключение', screen: 'modules/voice-adventure/ui/index.html',
//     begin() -> line,                 the first line of the session (a recap, where we are)
//     answer(text, service) -> line,   the owner said something (service: 'where', 'hint'… or null)
//     next() -> line,                  after a line with listen: false — what comes next
//     silence(n, line) -> line|null,   the n-th silence in a row; null — the engine's own way
//     resume() -> line,                after a pause
//     save(), end(reason, minutes),    reason: 'done' | 'pause' | 'stop' | 'error' | 'replaced'
//     info() -> {…}                    anything the screen should show
//   }
//   line = {text, parts: [{text, audio, fade}], audio, listen, end, listenSec, pauseMs, slow,
//           fade: {from, to}, volume, noRepeat}
var phone = require('./phone.js');
var parse = require('./parse.js');
var words = require('./words.js');
var audio = require('./audio.js');
var controls = require('./controls.js');

// The running session outlives a reload of this file (the agent may edit it while a story plays).
var G = typeof global !== 'undefined' ? global : (function () { return this; })();
var REG = G.__storyVoice || (G.__storyVoice = { session: null });

var DEFAULTS = {
  listenSec: 12, pollMs: 200, silenceTries: 2, pauseHoldMin: 20, pttWaitMin: 30,
  pushToTalk: 'auto', pushToTalkInTrip: true, voiceMode: 'auto', voiceSpeed: 0, slowFactor: 0.85,
  doubleMs: 400, headset: true, notice: true, pauseOnCall: true, pauseOnUnplug: true
};

var INTERRUPTS = ['talk', 'repeat', 'pause', 'stop', 'say'];

function merged(options) {
  var out = {};
  Object.keys(DEFAULTS).forEach(function (key) { out[key] = DEFAULTS[key]; });
  Object.keys(options || {}).forEach(function (key) { if (options[key] !== undefined && options[key] !== null) out[key] = options[key]; });
  return out;
}

function snapshot(s) {
  if (!s) return { running: false, phase: 'idle' };
  var info = {};
  try { info = s.driver.info ? s.driver.info() : {}; } catch (error) { info = {}; }
  return {
    id: s.id, title: s.driver.title || '', running: !s.ended, phase: s.ended ? 'idle' : s.phase,
    text: s.showing || (s.last ? (s.last.text || '') : ''), heard: s.heard || '', ptt: !!s.ptt, error: s.error || null,
    startedAt: s.started, info: info
  };
}

function setPhase(s, phase, text) {
  var changed = s.phase !== phase;
  s.phase = phase;
  if (text !== undefined) s.showing = text;
  emit('story.state', snapshot(s));
  if (changed && s.options.notice && !s.ended) {
    var label = { speaking: 'Рассказчик говорит', listening: 'Слушаю', waiting: 'Нажмите «Говорить»',
      thinking: 'Думаю', paused: 'Пауза' }[phase] || '';
    controls.notice(s.handle, s.driver.title || 'История', label + (s.showing ? ' · ' + words.clip(s.showing, 80) : ''), phase);
  }
}

function pushToTalk(s) {
  var mode = s.options.pushToTalk;
  if (mode === 'always') return true;
  if (mode === 'never') return false;
  return !!s.options.pushToTalkInTrip && phone.inTrip();
}

function voiceMode(s) {
  if (s.options.voiceMode === 'local') return 'local';
  return phone.online() ? '' : 'local';
}

/** Takes a waiting command that interrupts the story; waits up to ms for one. */
function takeInterrupt(s, ms) {
  var deadline = Date.now() + (ms || 0);
  while (true) {
    var left = deadline - Date.now();
    var cmd = left > 0 ? s.queue.poll(left, java.util.concurrent.TimeUnit.MILLISECONDS) : s.queue.poll();
    if (!cmd) return null;
    if (INTERRUPTS.indexOf(cmd.type) >= 0) return cmd;
    if (Date.now() >= deadline) return null;
  }
}

/** Waits for a command of the given kinds up to ms; others are dropped. */
function waitCommand(s, ms, kinds) {
  var deadline = Date.now() + ms;
  while (!s.stopped && Date.now() < deadline) {
    var cmd = s.queue.poll(Math.min(500, Math.max(1, deadline - Date.now())), java.util.concurrent.TimeUnit.MILLISECONDS);
    if (cmd && kinds.indexOf(cmd.type) >= 0) return cmd;
  }
  return s.stopped ? { type: 'stop' } : null;
}

function waitSpeech(s) {
  var deadline = Date.now() + 180000;
  sleep(60);
  while (Date.now() < deadline) {
    if (s.stopped) {
      native('speech.stop');
      return { type: 'stop' };
    }
    var cmd = takeInterrupt(s, s.options.pollMs);
    if (cmd) {
      native('speech.stop');
      return cmd;
    }
    if (!phone.speech().speaking) return null;
  }
  return null;
}

function slowDown(s) {
  var before = native('pref.get', 'tts.local.speed');
  var base = Number(before || 1) || 1;
  native('pref.set', 'tts.local.speed', String(Math.round(base * s.options.slowFactor * 100) / 100));
  return function () { native('pref.set', 'tts.local.speed', before === undefined || before === null ? null : String(before)); };
}

function sayText(s, text, line) {
  var chunks = line && line.pauseMs ? words.sentences(text) : [String(text)];
  var restore = line && line.slow ? slowDown(s) : null;
  try {
    for (var i = 0; i < chunks.length; i++) {
      native('speech.say', chunks[i], voiceMode(s));
      var cmd = waitSpeech(s);
      if (cmd) return cmd;
      if (line && line.pauseMs && i < chunks.length - 1) {
        cmd = takeInterrupt(s, line.pauseMs);
        if (cmd) return cmd;
      }
    }
  } finally {
    if (restore) restore();
  }
  return null;
}

function speakLine(s, line) {
  var parts = line.parts || [{ text: line.text, audio: line.audio }];
  setPhase(s, 'speaking', line.text || parts.map(function (part) { return part.text || ''; }).join(' '));
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    if (s.stopped) return { type: 'stop' };
    var cmd = null;
    if (part.audio) {
      var caught = null;
      var result = audio.play(part.audio, {
        pollMs: s.options.pollMs, fade: part.fade || line.fade, volume: line.volume,
        interrupted: function () {
          if (s.stopped) return true;
          caught = takeInterrupt(s, 0);
          return !!caught;
        }
      });
      if (caught) return caught;
      if (s.stopped) return { type: 'stop' };
      if (result === 'error' && part.text) cmd = sayText(s, part.text, line);
    } else if (part.text) {
      cmd = sayText(s, part.text, line);
    }
    if (cmd) return cmd;
  }
  return null;
}

function fromCommand(cmd) {
  if (!cmd) return { kind: 'silence' };
  if (cmd.type === 'stop') return { kind: 'stop' };
  if (cmd.type === 'pause') return { kind: 'pause' };
  if (cmd.type === 'repeat') return { kind: 'repeat' };
  if (cmd.type === 'say') return { kind: 'text', text: String(cmd.text || ''), typed: true };
  return { kind: 'silence' };
}

function hear(s, line, immediate) {
  s.ptt = pushToTalk(s);
  if (s.ptt && !immediate) {
    setPhase(s, 'waiting');
    var cmd = waitCommand(s, s.options.pttWaitMin * 60000, ['talk', 'say', 'repeat', 'pause', 'stop', 'resume']);
    if (!cmd) return { kind: 'idle' };
    if (cmd.type !== 'talk' && cmd.type !== 'resume') return fromCommand(cmd);
  }
  setPhase(s, 'listening');
  var sec = line.listenSec || s.options.listenSec;
  var until = Date.now() + sec * 1000;
  var text = '';
  while (!s.stopped) {
    var left = Math.ceil((until - Date.now()) / 1000);
    try {
      text = String(native('speech.listen', Math.max(2, left)) || '').trim();
    } catch (error) {
      var message = String(error && error.message ? error.message : error);
      if (/Уже слушаю/.test(message) && Date.now() < until) {
        sleep(400);
        continue;
      }
      throw error;
    }
    var interrupt = takeInterrupt(s, 0);
    if (interrupt && interrupt.type !== 'talk') return fromCommand(interrupt);
    if (text || s.ptt || Date.now() >= until - 1500) break;
  }
  if (s.stopped) return { kind: 'stop' };
  return text ? { kind: 'text', text: text } : { kind: 'silence' };
}

/** Pause: waits for «Говорить», «Продолжить» or the headset button; false when it is time to end. */
function pause(s, quiet) {
  setPhase(s, 'paused');
  if (!quiet) {
    var early = sayText(s, s.driver.pauseLine || 'Пауза. Чтобы продолжить, нажмите «Говорить» или кнопку на гарнитуре.', {});
    if (early && (early.type === 'talk' || early.type === 'say')) return true;
    if (early && early.type === 'stop') return false;
  }
  var cmd = waitCommand(s, s.options.pauseHoldMin * 60000, ['talk', 'resume', 'say', 'stop']);
  return !!cmd && cmd.type !== 'stop';
}

function finishWords(s) {
  try {
    return s.driver.goodbye ? s.driver.goodbye() : 'Сохранено. До встречи.';
  } catch (error) {
    return 'Сохранено. До встречи.';
  }
}

function loop(s) {
  var reason = 'stop';
  try {
    var line = s.driver.begin();
    while (!s.stopped) {
      if (!line) line = { text: '', listen: true };
      var interrupt = (line.text || line.parts) ? speakLine(s, line) : null;
      if ((line.text || line.parts) && !line.noRepeat) s.last = line;
      if (s.stopped) break;

      var outcome;
      if (interrupt) {
        outcome = interrupt.type === 'talk' ? hear(s, line, true) : fromCommand(interrupt);
      } else if (line.end) {
        reason = line.reason || 'done';
        break;
      } else if (!line.listen) {
        line = s.driver.next ? s.driver.next() : null;
        if (!line) {
          reason = 'done';
          break;
        }
        continue;
      } else {
        outcome = hear(s, line, false);
      }

      var service = outcome.kind === 'text' ? parse.service(outcome.text) : null;
      if (service === 'repeat') outcome = { kind: 'repeat' };
      if (service === 'pause') outcome = { kind: 'pause' };
      if (service === 'stop') outcome = { kind: 'stop' };

      if (outcome.kind === 'stop') {
        reason = 'stop';
        s.driver.save();
        sayText(s, finishWords(s), {});
        break;
      }
      if (outcome.kind === 'pause' || outcome.kind === 'idle') {
        s.driver.save();
        if (!pause(s, outcome.kind === 'idle')) {
          reason = 'pause';
          break;
        }
        s.silence = 0;
        line = s.driver.resume ? s.driver.resume() : s.last;
        continue;
      }
      if (outcome.kind === 'repeat') {
        line = s.last || line;
        continue;
      }
      if (outcome.kind === 'silence') {
        s.silence++;
        var said = s.driver.silence ? s.driver.silence(s.silence, line) : null;
        if (!said) {
          if (s.silence < s.options.silenceTries) {
            said = { text: 'Я подожду.', listen: true, noRepeat: true, listenSec: line.listenSec };
          } else {
            s.driver.save();
            if (!pause(s, false)) {
              reason = 'pause';
              break;
            }
            s.silence = 0;
            line = s.driver.resume ? s.driver.resume() : s.last;
            continue;
          }
        }
        line = said;
        continue;
      }

      s.silence = 0;
      s.heard = outcome.text;
      if (service === 'save') {
        s.driver.save();
        line = { text: 'Сохранено.', listen: true, noRepeat: true };
        continue;
      }
      setPhase(s, 'thinking');
      line = s.driver.answer(outcome.text, service);
      s.driver.save();
    }
    if (s.stopped && s.stopReason) reason = s.stopReason;
  } catch (error) {
    reason = 'error';
    s.error = String(error && error.message ? error.message : error);
    console.error('story-engine: ' + s.error);
    try {
      native('speech.say', 'Что-то пошло не так: ' + words.clip(s.error, 120) + '. Игра сохранена.', 'local');
    } catch (ignored) { /* no voice either */ }
  } finally {
    try { s.driver.save(); } catch (error) { console.error('story-engine: сохранение: ' + error); }
    var minutes = Math.round((Date.now() - s.started) / 60000);
    try { s.driver.end(reason, minutes); } catch (error) { console.error('story-engine: конец: ' + error); }
    teardown(s);
    s.ended = true;
    s.phase = 'idle';
    emit('story.state', snapshot(s));
  }
}

function setup(s) {
  s.handle = { screen: s.driver.screen, command: command };
  if (s.options.voiceSpeed > 0) {
    s.speedBefore = native('pref.get', 'tts.local.speed');
    native('pref.set', 'tts.local.speed', String(s.options.voiceSpeed));
    s.speedChanged = true;
  }
  if (s.options.headset) controls.headset(s.handle, s.options.doubleMs);
  s.offs = [];
  if (s.options.pauseOnCall) {
    s.offs.push(on('call', function (event) {
      if (event && event.state && event.state !== 'idle') command(s.id, 'pause');
    }, 'story-voice-call'));
  }
  if (s.options.pauseOnUnplug && phone.headphones()) {
    s.offs.push(on('headset', function (event) {
      if (event && event.plugged === false) command(s.id, 'pause');
    }, 'story-voice-headset'));
  }
}

function teardown(s) {
  (s.offs || []).forEach(function (off) { try { off(); } catch (error) { /* gone */ } });
  if (s.speedChanged) {
    native('pref.set', 'tts.local.speed', s.speedBefore === undefined || s.speedBefore === null ? null : String(s.speedBefore));
  }
  controls.release(s.handle || {});
}

/** Starts a story session in the background; the one already running is ended first. */
function run(driver, options) {
  var old = REG.session;
  if (old && !old.ended) {
    old.stopReason = 'replaced';
    old.stopped = true;
    old.queue.offer({ type: 'stop' });
    try { native('speech.stop'); native('speech.stopListening'); } catch (error) { /* nothing playing */ }
    for (var i = 0; i < 30 && !old.ended; i++) sleep(100);
  }
  var s = {
    id: driver.id, driver: driver, options: merged(options), queue: new java.util.concurrent.LinkedBlockingQueue(),
    phase: 'starting', started: Date.now(), silence: 0, stopped: false, ended: false, last: null, heard: ''
  };
  s.ptt = pushToTalk(s);
  REG.session = s;
  setup(s);
  spawn(function () { loop(s); });
  return snapshot(s);
}

/**
 * A command to the running story: 'talk' (listen now; hold-to-talk sends 'release' on letting go),
 * 'release', 'repeat', 'pause', 'resume', 'stop', 'say' (typed text). False when nothing runs.
 */
function command(id, cmd, text) {
  var s = REG.session;
  if (!s || s.ended || (id && s.id !== id)) return false;
  if (cmd === 'release') {
    if (s.phase === 'listening') native('speech.stopListening');
    return true;
  }
  // Already listening or working out the answer: a «talk» queued now would cut the next line short.
  if ((cmd === 'talk' || cmd === 'resume') && (s.phase === 'listening' || s.phase === 'thinking')) return true;
  if (cmd === 'stop') s.stopped = true;
  s.queue.offer({ type: cmd, text: text === undefined ? null : String(text) });
  if (s.phase === 'speaking' && INTERRUPTS.indexOf(cmd) >= 0) native('speech.stop');
  if (s.phase === 'listening' && cmd !== 'talk' && cmd !== 'resume') native('speech.stopListening');
  return true;
}

/** A button of the shell's notification (`notify.actions`). */
function action(args) {
  return command(null, args && args.cmd);
}

function state(id) {
  var s = REG.session;
  if (!s || (id && s.id !== id)) return { running: false, phase: 'idle', id: id || null };
  return snapshot(s);
}

function stop(id) {
  return command(id, 'stop');
}

/** One phrase aloud, waiting for its end (outside a session). */
function speak(text, mode) {
  native('speech.say', String(text), mode || (phone.online() ? '' : 'local'));
  var deadline = Date.now() + 120000;
  sleep(60);
  while (phone.speech().speaking && Date.now() < deadline) sleep(200);
}

exports.DEFAULTS = DEFAULTS;
exports.run = run;
exports.command = command;
exports.action = action;
exports.state = state;
exports.stop = stop;
exports.speak = speak;
