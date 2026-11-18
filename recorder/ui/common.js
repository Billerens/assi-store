// Helpers shared by the screens of the Диктофон: calls to main.js, time and length in words,
// names of kinds, the player of a recording made of parts (in the screen through blob URLs,
// on the phone when the screen cannot play the file).
(function () {
  const MAIN = 'modules/recorder/main.js';
  const call = (fn, ...args) => axiko.call(MAIN, fn, ...args);
  const KIND = { meeting: 'Встреча', note: 'Мысль', lecture: 'Лекция' };
  const KIND_ICON = { meeting: 'user', note: 'note', lecture: 'book' };
  const STATE = {
    recording: 'Идёт запись', importing: 'Принимаю файл', transcribing: 'Расшифровывается', summarizing: 'Собирается конспект',
    failed: 'Ошибка', ready: ''
  };
  const MONTHS_OF = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const TYPES = { m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', '3gp': 'audio/3gpp', amr: 'audio/amr', ogg: 'audio/ogg', oga: 'audio/ogg',
    opus: 'audio/ogg', webm: 'audio/webm', weba: 'audio/webm', mp3: 'audio/mpeg', wav: 'audio/wav', flac: 'audio/flac' };

  function clock(ms) {
    const s = Math.max(0, Math.floor((ms || 0) / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h ? h + ':' + String(m).padStart(2, '0') + ':' + sec : m + ':' + sec;
  }

  function length(ms) {
    const s = Math.round((ms || 0) / 1000);
    if (s < 60) return s + ' с';
    const m = Math.round(s / 60);
    if (m < 60) return m + ' мин';
    const rest = m % 60;
    return Math.floor(m / 60) + ' ч' + (rest ? ' ' + String(rest).padStart(2, '0') + ' мин' : '');
  }

  function when(time) {
    const d = new Date(time);
    const now = new Date();
    const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    const sameDay = d.toDateString() === now.toDateString();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toDateString() === d.toDateString();
    if (sameDay) return 'сегодня, ' + hm;
    if (yesterday) return 'вчера, ' + hm;
    return d.getDate() + ' ' + MONTHS_OF[d.getMonth()] + (d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : '') + ', ' + hm;
  }

  function dueText(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return 'до ' + d + ' ' + MONTHS_OF[m - 1] + (y !== new Date().getFullYear() ? ' ' + y : '');
  }

  function plural(n, one, few, many) {
    const a = Math.abs(n) % 100;
    const b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }

  function fail(error) {
    ui.toast(String(error && error.message || error).replace(/^Ошибка: /, ''));
  }

  /**
   * The player of a recording in parts: parts = [{ url, file, offsetMs, durationMs }]. In the screen
   * each part comes as a blob (the type set by its extension, seeking works); when the screen
   * cannot play it — on the phone (main.js play), asking its position twice a second.
   */
  function player(parts, onTime, onState) {
    const audio = new Audio();
    audio.preload = 'auto';
    const blobs = {};
    let index = -1;
    let phone = false;
    let poll = null;
    let playing = false;
    const total = parts.reduce((max, p) => Math.max(max, p.offsetMs + p.durationMs), 0);

    function partAt(ms) {
      for (let i = parts.length - 1; i >= 0; i--) if (ms >= parts[i].offsetMs) return i;
      return 0;
    }

    async function load(i) {
      if (index === i && audio.src) return;
      index = i;
      const p = parts[i];
      if (!blobs[i]) {
        const response = await fetch(p.url);
        if (!response.ok) throw new Error('Нет звука');
        const ext = String(p.url).split('.').pop().toLowerCase();
        blobs[i] = URL.createObjectURL(new Blob([await response.arrayBuffer()], { type: TYPES[ext] || 'audio/mp4' }));
      }
      audio.src = blobs[i];
      await new Promise((resolve, reject) => {
        audio.onloadedmetadata = () => resolve();
        audio.onerror = () => reject(new Error('Экран не может играть этот файл'));
      });
    }

    function tellState() {
      if (onState) onState(playing);
    }

    async function phonePlay(ms) {
      phone = true;
      const i = partAt(ms);
      index = i;
      await call('play', parts[i].file, ms - parts[i].offsetMs);
      playing = true;
      tellState();
      clearInterval(poll);
      poll = setInterval(async () => {
        const st = await call('playerState');
        if (st.playing && onTime) onTime(parts[index].offsetMs + st.ms);
      }, 500);
    }

    async function seek(ms, play) {
      const i = partAt(ms);
      if (phone || window.__recorderPhonePlayer) return play || playing ? phonePlay(ms) : null;
      try {
        await load(i);
        audio.currentTime = Math.max(0, (ms - parts[i].offsetMs) / 1000);
        if (play || playing) await audio.play();
      } catch (error) {
        await phonePlay(ms);
      }
    }

    audio.ontimeupdate = () => { if (onTime && index >= 0) onTime(parts[index].offsetMs + audio.currentTime * 1000); };
    audio.onplay = () => { playing = true; tellState(); };
    audio.onpause = () => { if (!audio.ended) { playing = false; tellState(); } };
    audio.onended = () => {
      if (index + 1 < parts.length) seek(parts[index + 1].offsetMs, true).catch(fail);
      else { playing = false; tellState(); }
    };
    axiko.on('recorder.player', (event) => {
      if (!phone || !event || !event.ended) return;
      if (index + 1 < parts.length) phonePlay(parts[index + 1].offsetMs).catch(fail);
      else { playing = false; clearInterval(poll); tellState(); }
    });

    return {
      total,
      seek,
      async toggle(atMs) {
        if (playing) {
          playing = false;
          if (phone) { clearInterval(poll); await call('playerPause'); } else audio.pause();
          tellState();
          return;
        }
        await seek(atMs || 0, true);
      },
      stop() {
        audio.pause();
        clearInterval(poll);
        if (phone) call('playerStop').catch(() => {});
        Object.values(blobs).forEach((u) => URL.revokeObjectURL(u));
      },
      get playing() { return playing; }
    };
  }

  window.rec = { MAIN, call, KIND, KIND_ICON, STATE, clock, length, when, dueText, plural, fail, player };
})();
