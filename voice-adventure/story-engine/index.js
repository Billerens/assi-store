// «Голосовой движок историй» — everything at once for other modules (engine only):
//   var story = require('modules/voice-adventure/story-engine');
//   story.voice.run(driver, options); story.branch.choose(text, options); story.store.saveState(dir, state)
// Pure parts can also be required one by one (they run under node too): words, parse, quest,
// chapter, branch, lines, settings, wav.
exports.words = require('./words.js');
exports.parse = require('./parse.js');
exports.quest = require('./quest.js');
exports.chapter = require('./chapter.js');
exports.branch = require('./branch.js');
exports.lines = require('./lines.js');
exports.settings = require('./settings.js');
exports.wav = require('./wav.js');
exports.phone = require('./phone.js');
exports.store = require('./store.js');
exports.audio = require('./audio.js');
exports.controls = require('./controls.js');
exports.voice = require('./voice.js');
exports.VERSION = 1;
