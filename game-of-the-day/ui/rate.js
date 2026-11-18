// The rating sheet of «Игра дня» inside a game of the day: its screen
// (modules/games/daily/<date>/ui/index.html) loads this file before </body>. On «Выйти» after a
// session longer than rateAfterSec, when the game is not rated yet: five stars, the reason chips,
// one line by voice, «Оставить в Игротеке» / «Удалить» / «Позже». Then the game exits as usual
// (its last save and session go first; the move waits settleSec in the engine).
(function () {
  'use strict';
  // «2026-11-14» or, for a later game of that day, «2026-11-14-2».
  var match = /^\/modules\/games\/daily\/(\d{4}-\d{2}-\d{2}(?:-[2-9])?)\//.exec(location.pathname);
  if (!match || !window.axiko) return;
  if (new URLSearchParams(location.search).get('preview') === '1') return;   // the preview frames of checks
  var DATE = match[1];
  var MAIN = 'modules/game-of-the-day/main.js';

  var info = null;
  var activeMs = 0;
  var since = Date.now();
  var visible = true;
  var passing = false;
  var decided = false;
  var reported = false;

  function load() {
    return window.axiko.call(MAIN, 'rateInfo', DATE).then(function (got) {
      info = got;
      return got;
    }).catch(function () {
      info = null;
      return null;
    });
  }
  load();

  function played() {
    return activeMs + (visible ? Date.now() - since : 0);
  }

  function pause() {
    if (!visible) return;
    activeMs += Date.now() - since;
    visible = false;
  }

  function resume() {
    if (visible) return;
    since = Date.now();
    visible = true;
  }

  // Left without the sheet (the back button, another app): the time played is kept for the screen.
  function leftWithout() {
    if (passing || decided || reported || !info || !info.ok || info.rated) return;
    if (played() < info.rateAfterSec * 1000) return;
    reported = true;
    window.axiko.call(MAIN, 'played', DATE, Math.round(played() / 1000)).catch(function () {});
  }

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      pause();
      leftWithout();
    } else {
      resume();
      reported = false;
    }
  });
  window.addEventListener('pagehide', function () {
    pause();
    leftWithout();
  });

  function leave() {
    passing = true;
    var exit = document.getElementById('g-exit');
    if (exit) exit.click();
    else window.axiko.back();
  }

  function style() {
    if (document.getElementById('gotd-style')) return;
    var css = [
      '.gotd-stars {', '  display: flex;', '  gap: 4px;', '  justify-content: center;', '  margin: 8px 0 4px;', '}',
      '.gotd-star {', '  width: 52px;', '  height: 52px;', '  border: 0;', '  border-radius: 12px;', '  background: transparent;',
      '  color: var(--ink-3);', '  display: grid;', '  place-items: center;', '}',
      '.gotd-star svg {', '  width: 30px;', '  height: 30px;', '}',
      '.gotd-star.on {', '  color: var(--accent);', '}',
      '.gotd-chips {', '  display: flex;', '  flex-wrap: wrap;', '  gap: 8px;', '  margin: 12px 0;', '}',
      '.gotd-chips .chip {', '  min-height: 44px;', '}',
      '.gotd-voice {', '  color: var(--ink-2);', '  font-size: 15px;', '  line-height: 1.35;', '  margin: 8px 0;', '  overflow-wrap: anywhere;', '}',
      '.gotd-actions {', '  display: grid;', '  gap: 8px;', '  margin-top: 12px;', '}',
      '.gotd-actions .btn {', '  min-height: 48px;', '}',
      '.gotd-label {', '  text-align: center;', '  color: var(--ink-3);', '  font-size: 13px;', '  min-height: 18px;', '}',
      '.gotd-form { max-height: 78vh; overflow-y: auto; overscroll-behavior: contain; }',
      '.gotd-field { display: grid; gap: 8px; margin: 18px 0; }',
      '.gotd-field label { font-size: 14px; font-weight: 600; }',
      '.gotd-field .input { width: 100%; min-width: 0; }',
      '.gotd-field textarea { min-height: 100px; resize: vertical; }',
      '.gotd-hint { font-size: 13px; line-height: 1.5; color: var(--ink-2); margin: 0; }',
      '.gotd-form button { cursor: pointer; }',
      '.gotd-form button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }',
      '@media (min-width: 700px) { .gotd-back { align-items: center; justify-content: center; padding: 24px; } .gotd-sheet { max-width: 640px; border-radius: 22px; padding: 24px; } .gotd-actions { grid-template-columns: 1fr 1fr; } .gotd-actions .primary { grid-column: 1 / -1; } }'
    ].join('\n');
    var tag = document.createElement('style');
    tag.id = 'gotd-style';
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  function openSheet() {
    var ui = window.ui;
    var h = ui.h;
    style();
    var stars = 0;
    var picked = [];
    var voiceText = '';
    var starButtons = [];
    var label = h('div', { class: 'gotd-label' }, '');
    var voiceLine = h('div', { class: 'gotd-voice', 'data-raw': '' });
    var close = null;
    var saving = false;
    var actionButtons = [];
    var comment = h('textarea', { class: 'input', id: 'gotd-comment', rows: 3, maxlength: 1000,
      placeholder: 'Что понравилось, что мешало и что стоит исправить?', 'aria-label': 'Комментарий к реализации игры' });
    comment.value = info.comment || '';
    var genre = h('select', { class: 'input', id: 'gotd-genre', 'aria-label': 'Отношение к жанру' },
      h('option', { value: 'unknown' }, 'Пока не хочу оценивать жанр'), h('option', { value: 'like' }, 'Жанр нравится'),
      h('option', { value: 'neutral' }, 'Отношусь нейтрально'), h('option', { value: 'dislike' }, 'Сам жанр не нравится'));
    genre.value = info.genrePreference || 'unknown';

    function paint() {
      starButtons.forEach(function (button, i) {
        button.classList.toggle('on', i < stars);
        button.setAttribute('aria-pressed', i < stars ? 'true' : 'false');
      });
      label.textContent = stars ? ui.t('{} из 5', stars) : '';
    }

    for (var i = 1; i <= 5; i++) {
      (function (n) {
        var button = h('button', { class: 'gotd-star', 'aria-label': ui.t('{} из 5', n), onclick: function () {
          stars = stars === n ? 0 : n;
          paint();
        } }, ui.icon('star'));
        starButtons.push(button);
      })(i);
    }

    var chips = (info.chips || []).map(function (reason) {
      var chip = h('button', { class: 'chip', onclick: function () {
        var at = picked.indexOf(reason);
        if (at >= 0) picked.splice(at, 1);
        else picked.push(reason);
        chip.classList.toggle('on', at < 0);
        chip.setAttribute('aria-pressed', at < 0 ? 'true' : 'false');
      } }, reason);
      return chip;
    });

    var voiceButton = h('button', { class: 'btn', onclick: function () {
      voiceButton.disabled = true;
      voiceLine.textContent = 'Слушаю…';
      window.axiko.call(MAIN, 'listen').then(function (text) {
        voiceText = String(text || '').trim();
        voiceLine.textContent = voiceText ? '«' + voiceText + '»' : 'Ничего не расслышал';
      }).catch(function () {
        voiceLine.textContent = 'Распознавание речи недоступно';
      }).then(function () { voiceButton.disabled = false; });
    } }, ui.icon('mic'), 'Сказать голосом');

    function finish(decision) {
      if (saving) return;
      if (!stars && (picked.length || voiceText || comment.value.trim() || genre.value !== 'unknown')) {
        ui.toast('Добавьте оценку реализации от 1 до 5, чтобы сохранить отзыв');
        return;
      }
      saving = true;
      actionButtons.forEach(function (button) { button.disabled = true; });
      var data = { stars: stars || null, reasons: picked, voice: voiceText, comment: comment.value, genrePreference: genre.value,
        playedSec: Math.round(played() / 1000), decision: decision };
      window.axiko.call(MAIN, 'decide', DATE, data).then(function () {
        decided = decision !== 'later' || stars > 0;
        if (close) close();
        leave();
      }).catch(function (error) {
        saving = false;
        actionButtons.forEach(function (button) { button.disabled = false; });
        if (ui.toast) ui.toast(error.message);
      });
    }

    actionButtons = [
      h('button', { class: 'btn primary', onclick: function () { finish('keep'); } }, ui.icon('check'), 'Оставить в Игротеке'),
      h('button', { class: 'btn danger', onclick: function () { finish('remove'); } }, ui.icon('trash'), 'Удалить'),
      h('button', { class: 'btn', onclick: function () { finish('later'); } }, ui.icon('clock'), 'Позже')
    ];
    close = ui.sheet(h('div', { class: 'gotd-form' }, [
      h('h3', {}, info.title ? ui.t('Как вам «{}»?', info.title) : 'Как вам игра дня?'),
      h('p', { class: 'gotd-hint' }, 'Звёзды — за качество этой реализации, а не за весь жанр.'),
      h('div', { class: 'gotd-stars', role: 'group', 'aria-label': 'Оценка реализации игры' }, starButtons),
      label,
      h('div', { class: 'gotd-chips' }, chips),
      h('div', { class: 'gotd-field' }, h('label', { for: 'gotd-comment' }, 'Что стоит улучшить?'), comment),
      h('div', { class: 'gotd-field' }, h('label', { for: 'gotd-genre' }, 'А сам жанр' + (info.genre ? ' «' + info.genre + '»' : '') + '?'), genre,
        h('p', { class: 'gotd-hint' }, 'Отдельный ответ. Плохая игра не понижает интерес к жанру.')),
      voiceButton,
      voiceLine,
      h('div', { class: 'gotd-actions' }, actionButtons)
    ]));
    var panel = document.querySelector('.gotd-form');
    panel.parentElement.classList.add('gotd-sheet');
    panel.parentElement.parentElement.classList.add('gotd-back');
  }

  // Before the engine's own handler of «Выйти» (capture on the document comes first).
  document.addEventListener('click', function (event) {
    var exit = event.target && event.target.closest ? event.target.closest('#g-exit') : null;
    if (!exit || passing || decided) return;
    if (!window.ui || !window.ui.sheet) return;
    if (!info || !info.ok || info.rated || info.pending) return;
    if (played() < info.rateAfterSec * 1000) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    load().then(function (fresh) {
      if (!fresh || !fresh.ok || fresh.rated || fresh.pending) leave();
      else openSheet();
    });
  }, true);
})();
