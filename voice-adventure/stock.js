// Arithmetic of the adventure that needs no phone: which chapters to write ahead, plot ids,
// which achievements are earned. Pure logic (engine and node).

/**
 * The chapters to write so that `ahead` ready chapters wait beyond the one being played.
 * written — the highest chapter number written; current — the chapter being played; done — it is finished.
 */
function missing(written, current, done, ahead) {
  var playing = playingChapter(current, done);
  var want = playing + Math.max(0, ahead);
  var out = [];
  for (var n = Math.max(written + 1, 1); n <= want; n++) out.push(n);
  return out;
}

/** The chapter to be played next: the current one, or the one after it when it is finished. */
function playingChapter(current, done) {
  var n = Math.max(1, current || 1);
  return done ? n + 1 : n;
}

/** Chapters ready beyond the one being played (negative: the one to play is not written yet). */
function readyAhead(written, current, done) {
  return written - playingChapter(current, done);
}

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}

/** A plot id from the moment it was started: «p20261114-0815». */
function plotId(time) {
  var d = new Date(time);
  return 'p' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
}

/**
 * Achievements of the adventure for «Ачивки за жизнь» (shown in the game hub as well).
 * stats: {chaptersDone, lastChapterHints}; granted: keys already given.
 */
function achievements(stats, granted) {
  var out = [];
  var have = granted || [];
  if (stats.chaptersDone >= 5 && have.indexOf('stories/quest/five-chapters') < 0) {
    out.push({ key: 'stories/quest/five-chapters', title: 'Пять глав', text: 'Пройдено пять глав голосового приключения' });
  }
  if (stats.lastChapterDone && stats.lastChapterHints === 0 && have.indexOf('stories/quest/no-hints') < 0) {
    out.push({ key: 'stories/quest/no-hints', title: 'Без подсказок', text: 'Глава приключения пройдена без единой подсказки' });
  }
  return out;
}

/** A line of the plot for a card: «Глава 3 · Затопленная обсерватория». */
function cardLine(chapter, title, done) {
  if (!chapter) return 'Новое приключение';
  return 'Глава ' + chapter + (title ? ' · ' + title : '') + (done ? ' · пройдена' : '');
}

exports.missing = missing;
exports.playingChapter = playingChapter;
exports.readyAhead = readyAhead;
exports.plotId = plotId;
exports.achievements = achievements;
exports.cardLine = cardLine;
