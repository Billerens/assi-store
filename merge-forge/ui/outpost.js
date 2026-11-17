// The outpost shares the game's render/animation loop; it owns no timer or background work.
(function () {
  'use strict';
  const COLORS = { steel: '#b5c4dd', dark: '#293449', brass: '#d7b86e', ember: '#ed9b68', ice: '#8fd0de', violet: '#c3a7e8', ink: '#1b202b' };
  const TEMPER = { fire: COLORS.ember, ice: COLORS.ice, resonant: COLORS.violet };
  function tr(text, ...args) { return window.ui.t(text, ...args); }
  function path(ctx, points, fill, stroke) {
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function ellipse(ctx, x, y, rx, ry, color) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
  }
  function line(ctx, points, color, width) {
    ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.strokeStyle = color; ctx.lineWidth = width || 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
  }
  function blade(ctx, weapon, x, y, tilt) {
    if (!weapon) return;
    const n = weapon.level || 1;
    const tint = TEMPER[weapon.temper] || (n >= 30 ? COLORS.violet : n >= 20 ? COLORS.brass : COLORS.steel);
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt || 0);
    const wide = n % 3 === 0 ? 4 : 2.6;
    path(ctx, [[-wide, -4], [-wide * 0.75, -21], [0, -27], [wide * 0.75, -21], [wide, -4]], tint, COLORS.ink);
    line(ctx, [[0, -23], [0, -5]], '#eff1e5', 0.8);
    line(ctx, [[-6, -3], [6, -3]], COLORS.brass, 2.6);
    line(ctx, [[0, -1], [0, 7]], COLORS.dark, 3.5);
    ellipse(ctx, 0, 8, 2.2, 2.2, COLORS.brass);
    if (weapon.temper) ellipse(ctx, 0, -3, 1.6, 1.6, tint);
    ctx.restore();
  }
  function hero(ctx, item, x, y, scale, t, action) {
    const bran = item.id === 'bran', eira = item.id === 'eira', corvin = item.id === 'corvin';
    const color = bran ? '#7f9aad' : eira ? '#9e94be' : corvin ? '#6f8970' : '#805474';
    const cloak = bran ? '#476879' : eira ? '#55557f' : corvin ? '#3f5c51' : '#805474';
    const bob = Math.sin(t * 2.3 + (bran ? 0 : 2)) * 0.65, swing = action || 0;
    ctx.save(); ctx.translate(x, y + bob); ctx.scale(scale, scale); ctx.lineWidth = 1.2;
    ellipse(ctx, 0, 2, 15, 3, 'rgba(12,16,24,.32)');
    path(ctx, [[-10, -27], [8, -27], [eira ? 17 : 14, eira ? 0 : -4], [1, -8], [eira ? -16 : -13, eira ? 0 : -2]], cloak);
    line(ctx, [[-4, -12], [-5, 0], [-10, 0]], COLORS.ink, 5);
    line(ctx, [[5, -12], [7, 0], [12, 0]], COLORS.ink, 5);
    path(ctx, [[-9, -27], [7, -28], [10, -12], [-7, -10]], color, COLORS.ink);
    line(ctx, [[-5, -25], [4, -16]], COLORS.brass, 2);
    ellipse(ctx, 0, -35, 6.5, 7, '#d7b38f');
    if (eira) {
      path(ctx, [[-8, -33], [-6, -42], [0, -49], [8, -39], [7, -32], [2, -38], [-3, -38]], '#6c638b');
      line(ctx, [[-3, -42], [0, -45], [3, -41]], COLORS.ice, 1.4);
      line(ctx, [[-7, -22], [-14, -19]], color, 4);
      path(ctx, [[-16, -29], [-12, -23], [-16, -17], [-20, -23]], COLORS.ice, COLORS.steel);
      line(ctx, [[-16, -26], [-16, -20]], '#ffffff', 1);
    } else if (corvin) {
      path(ctx, [[-9, -31], [-8, -40], [0, -45], [8, -40], [9, -31], [3, -36], [-3, -36]], '#365046');
      path(ctx, [[-5, -33], [7, -33], [4, -28], [-4, -28]], '#38413e');
      line(ctx, [[-7, -40], [-14, -47]], COLORS.brass, 1.4);
      path(ctx, [[-15, -47], [-12, -46], [-11, -41]], '#b1c6ad');
      path(ctx, [[-13, -17], [-7, -17], [-6, -8], [-14, -8]], '#9f7853', COLORS.brass);
      line(ctx, [[-12, -14], [-8, -14]], COLORS.brass, 1);
    } else {
      path(ctx, bran ? [[-7, -35], [-6, -42], [2, -44], [7, -39], [6, -34]] : [[-8, -32], [-7, -42], [4, -44], [9, -34], [4, -37], [0, -40]], bran ? COLORS.steel : '#493b53');
    }
    line(ctx, [[2, -35], [4, -35]], COLORS.ink, 1.1);
    line(ctx, [[8, -25], [14 + swing * 3, -17 - swing * 4]], color, 5);
    if (item.equipment) blade(ctx, item.equipment, 15 + swing * 3, -17 - swing * 4, (bran ? 0.22 : eira ? -0.16 : corvin ? 0.4 : 0.62 + Math.sin(t * 1.9) * 0.025) - swing * 0.65);
    else ellipse(ctx, 14, -17, 2.5, 2.5, '#d7b38f');
    if (bran) {
      path(ctx, [[-18, -24], [-8, -26], [-8, -12], [-13, -7], [-19, -14]], '#557688', COLORS.steel);
      line(ctx, [[-14, -22], [-13, -11]], COLORS.brass, 1.4);
    } else if (!eira && !corvin) line(ctx, [[-8, -25], [-14, -12]], '#8c657c', 4);
    ctx.restore();
  }
  function pet(ctx, item, x, y, scale, t, action) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    const bob = Math.sin(t * 3) * 0.6;
    if (item.id === 'raven') {
      line(ctx, [[-3, -3], [-5, 1], [-8, 1]], COLORS.brass, 1.8);
      line(ctx, [[4, -3], [5, 1], [8, 1]], COLORS.brass, 1.8);
      path(ctx, [[-9, -5], [-18, -2], [-16, -10], [-9, -15], [4, -16], [10, -7], [4, -3]], '#43445f', '#77778f');
      path(ctx, [[-7, -12], [-11, -5], [2, -6], [7, -11]], '#5b577c');
      ellipse(ctx, 8, -18 + bob, 6, 6, '#45445d');
      path(ctx, [[12, -20 + bob], [22, -16 + bob], [12, -15 + bob]], '#bea570');
      ellipse(ctx, 10, -19 + bob, 1.1, 1.1, '#ead789');
      ellipse(ctx, 1, -8, 2.5, 2.5, COLORS.brass);
      line(ctx, [[-10, -9], [-17, -6]], '#8783a0', 1);
    } else if (item.id === 'turtle') {
      ellipse(ctx, -9, 0, 4, 2.6, '#5b8a7b'); ellipse(ctx, 8, 0, 4, 2.6, '#5b8a7b');
      ellipse(ctx, 16, -5, 5.5, 4, '#86b49a');
      path(ctx, [[-15, -3], [-13, -11], [-6, -16], [5, -16], [12, -11], [14, -3]], '#526d76', '#9fb9b6');
      path(ctx, [[-7, -6], [-6, -12], [1, -14], [6, -10], [5, -4]], '#667f87', '#adc3bd');
      line(ctx, [[-2, -11], [1, -8], [-2, -5]], COLORS.ice, 1.5);
      line(ctx, [[-11, -8], [-7, -6], [-10, -2]], '#adc3bd', 1);
      ellipse(ctx, 18, -6, 1, 1.2, COLORS.ink);
      if (action > 0) {
        ctx.globalAlpha = action;
        line(ctx, [[-21, -7], [-19, -23], [0, -30], [21, -23], [23, -7], [4, 5]], COLORS.ice, 2);
        ctx.globalAlpha = 1;
      }
    } else if (item.id === 'fox') {
      path(ctx, [[-7, -4], [-20, -10 - bob], [-25, -5], [-19, 0], [-7, 0]], '#bd7953');
      path(ctx, [[-19, -10 - bob], [-25, -5], [-19, 0], [-16, -5]], '#e0c3a0');
      ellipse(ctx, 0, -6 + bob, 10, 6, '#d18e5c');
      line(ctx, [[-5, -3], [-6, 1]], '#81533e', 3); line(ctx, [[7, -3], [8, 1]], '#81533e', 3);
      path(ctx, [[5, -8], [4, -19], [10, -14], [15, -18], [17, -8], [12, -4]], '#de9a63');
      path(ctx, [[9, -9], [21, -7], [13, -3]], '#ead7b9');
      ellipse(ctx, 20, -7, 1.6, 1.5, COLORS.ink); ellipse(ctx, 13, -10, 1, 1.3, COLORS.ink);
      ellipse(ctx, 7, -5, 2.3, 2.3, COLORS.brass);
    } else {
      line(ctx, [[-4, -4], [-15, -5], [-20, -10 - bob]], '#b65e48', 5);
      ellipse(ctx, 1, -5, 11, 5.5, '#d87f53');
      ellipse(ctx, 11, -7, 6.5, 4.5, '#e8975f');
      for (let i = 0; i < 3; i++) ellipse(ctx, i * 5 - 5, -7.5, 1.3, 1.8, COLORS.brass);
      line(ctx, [[-4, -2], [-9, 1]], '#a14f42', 2.4); line(ctx, [[7, -2], [11, 1]], '#a14f42', 2.4);
      ellipse(ctx, 14, -8, 1.2, 1.2, COLORS.ink);
      if ((item.charge || 0) > 0) path(ctx, [[-2, -12], [0, -20 - bob], [3, -15], [5, -17], [6, -10]], '#efb96c');
    }
    ctx.restore();
  }
  function dragon(ctx, item, x, y, scale, t, action) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale); ctx.lineWidth = 1.4;
    const bob = Math.sin(t * 1.8) * 0.8, form = item.form || 'ash', frost = form === 'frost', storm = form === 'storm';
    const skin = frost ? '#89a9b8' : storm ? '#8f87b5' : '#aa7460';
    const wing = frost ? '#557f99' : storm ? '#56547d' : '#6a4950';
    const light = frost ? '#d4eef0' : storm ? '#d1c4f3' : '#ce9d72';
    const edge = frost ? '#afdee8' : storm ? '#d5c8ee' : '#af7960';
    if (item.stage === 'egg') {
      ellipse(ctx, 0, 0, 18, 4, '#4a3f39');
      ctx.beginPath(); ctx.moveTo(-13, -9); ctx.bezierCurveTo(-16, -20, -7, -39, 0, -39); ctx.bezierCurveTo(8, -39, 17, -19, 13, -9); ctx.bezierCurveTo(10, 2, -10, 2, -13, -9); ctx.fillStyle = '#948775'; ctx.fill();
      line(ctx, [[-5, -31], [1, -25], [-4, -20], [5, -13], [1, -6]], COLORS.ember, 2);
      for (let i = 0; i < 3; i++) ellipse(ctx, i * 7 - 7, -13 - i % 2 * 10, 2, 3, '#ad9e88');
    } else {
      const adult = item.stage === 'adult';
      line(ctx, [[-5, -7], [-22, -7 - bob], [-34, -15], [-38, -12]], skin, storm ? 4 : 6);
      path(ctx, [[-7, -16], [-23, -35 - bob], [-25, -17], [-16, -20], [-10, -8]], wing, edge);
      if (adult) path(ctx, [[7, -17], [20, -39 + bob], [27, -18], [17, -22], [10, -8]], wing, edge);
      ellipse(ctx, 0, -9, adult ? (storm ? 22 : 20) : 15, storm ? 7 : adult ? 11 : 9, skin);
      ellipse(ctx, 6, -6, adult ? 11 : 8, 6, light);
      line(ctx, [[-9, -6], [-12, 1], [-6, 1]], skin, 4); line(ctx, [[9, -5], [12, 1], [17, 1]], skin, 4);
      ctx.beginPath(); ctx.moveTo(7, -10); ctx.quadraticCurveTo(9, -26, 18, -26); ctx.lineTo(29, -21); ctx.lineTo(29, -16); ctx.lineTo(17, -14); ctx.lineTo(13, -5); ctx.closePath(); ctx.fillStyle = skin; ctx.fill();
      if (frost) {
        line(ctx, [[14, -26], [12, -36], [9, -39]], light, 2); line(ctx, [[12, -34], [17, -39]], light, 1.5);
        line(ctx, [[23, -25], [26, -36], [30, -39]], light, 2); line(ctx, [[26, -34], [22, -38]], light, 1.5);
        for (let i = 0; i < 3; i++) path(ctx, [[i * 7 - 10, -17], [i * 7 - 8, -26], [i * 7 - 4, -17]], edge);
      } else if (storm) {
        path(ctx, [[13, -25], [11, -36], [16, -31], [18, -39], [21, -26]], light);
        line(ctx, [[28, -18], [37, -24], [34, -29]], edge, 1.3); line(ctx, [[28, -16], [36, -10], [32, -6]], edge, 1.3);
        line(ctx, [[-13, -14], [-6, -17], [-8, -10], [1, -13]], light, 1.8);
      } else {
        path(ctx, [[14, -25], [12, -34], [19, -28]], COLORS.brass); path(ctx, [[23, -24], [24, -32], [28, -23]], COLORS.brass);
      }
      ellipse(ctx, 23, -23, 1.8, 1.4, light); ellipse(ctx, 23.5, -23, 0.6, 1.4, COLORS.ink);
      line(ctx, [[22, -17], [29, -18]], wing, 1);
      if (item.ready || action > 0) {
        const reach = 41 + (action || 0) * 15;
        if (storm) line(ctx, [[31, -20], [37, -24 - bob], [35, -18], [reach, -21]], light, 1.6);
        else if (frost) { line(ctx, [[31, -19], [reach, -19]], light, 1.5); line(ctx, [[36, -23], [39, -15]], light, 1); }
        else path(ctx, [[31, -20], [36, -23 - bob], [35, -19], [reach, -17], [34, -16]], '#e9aa61');
        ellipse(ctx, 13, -12, 3, 4, light);
      }
    }
    ctx.restore();
  }
  function portrait(kind, item) {
    const canvas = window.ui.h('canvas', { class: 'mfo-portrait', width: 112, height: 100, 'aria-hidden': 'true' });
    const ctx = canvas.getContext('2d'); ctx.scale(2, 2);
    if (kind === 'hero') hero(ctx, item, 27, 45, 0.88, 0);
    else if (kind === 'pet') pet(ctx, item, 29, 36, 1, 0);
    else dragon(ctx, item, 26, 44, item.stage === 'egg' ? 0.9 : 0.69, 0);
    return canvas;
  }
  function create(options) {
    const g = options.g, sim = options.sim, core = sim.outpost || window.MFOutpost, h = window.ui.h;
    let model = null, closeSheet = null, sheetBody = null, notice = null, tab = 'heroes', picker = null, sheetKey = '', stripKey = '', avatarKey = '', disposed = false;
    const controls = {}, cooldowns = {}, expandedTalents = {};
    let adventures = null, hitEvent = null, selectedHero = '', bladeIntent = null;
    const expanded = {};
    const launchTitle = h('span', { class: 'mfo-launch-title' }, tr('Форпост'));
    const launchSub = h('span', { class: 'mfo-launch-sub' });
    const avatar = h('canvas', { class: 'mfo-avatar', width: 64, height: 72, 'aria-hidden': 'true' });
    const launch = h('button', { class: 'g-btn mfo-launch', id: 'outpost', onclick: () => open() }, avatar, h('span', { class: 'mfo-launch-copy' }, launchTitle, launchSub));
    const skillbar = h('div', { class: 'mfo-skills', role: 'group', 'aria-label': tr('Умения отряда') });
    const element = h('div', { class: 'mfo-bar' }, launch, skillbar);
    const cfg = () => g.config;
    const unlockWave = key => cfg()['outpost.' + ({ heroes: 'hero', pets: 'pet', tempers: 'temper', dragon: 'dragon' })[key] + '.wave'] || core.defaults['outpost.' + ({ heroes: 'hero', pets: 'pet', tempers: 'temper', dragon: 'dragon' })[key] + '.wave'];
    const fmt = value => g.fmt(value);
    const xpFmt = value => g.fmt(value, { digits: 2 });
    function text(node, value) { if (node && node.textContent !== value) node.textContent = value; }
    const msg = text => { if (notice) { notice.textContent = tr(text); notice.hidden = !text; } };
    function stateModel() { return core.model(g.state, cfg()); }
    function paintAvatar() {
      const member = model.heroes.find(item => item.active && item.equipment) || model.heroes.find(item => item.active);
      const helper = model.pets.find(item => item.selected);
      const d = model.dragon.unlocked ? model.dragon : null;
      const focus = tab === 'dragon' && d ? { kind: 'dragon', item: d } : tab === 'pets' && helper ? { kind: 'pet', item: helper }
        : member ? { kind: 'hero', item: member } : helper ? { kind: 'pet', item: helper } : d ? { kind: 'dragon', item: d } : null;
      const key = focus ? focus.kind + ':' + JSON.stringify([focus.item.id, focus.item.equipment, focus.item.stage, focus.item.form, focus.item.ready]) : 'gate';
      if (key === avatarKey) return;
      avatarKey = key;
      const ctx = avatar.getContext('2d'); ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.clearRect(0, 0, 32, 36);
      if (focus && focus.kind === 'hero') hero(ctx, focus.item, 12, 53, 1.1, 0);
      else if (focus && focus.kind === 'pet') pet(ctx, focus.item, 12, 29, 1.1, 0);
      else if (focus) dragon(ctx, focus.item, focus.item.stage === 'egg' ? 16 : 11, 35, focus.item.stage === 'egg' ? 0.85 : 0.72, 0);
      else {
        path(ctx, [[3, 30], [3, 13], [8, 13], [8, 17], [12, 17], [12, 13], [20, 13], [20, 17], [24, 17], [24, 13], [29, 13], [29, 30]], '#84949e');
        ctx.fillStyle = COLORS.ink; ctx.fillRect(13, 23, 6, 8); line(ctx, [[10, 9], [16, 4], [22, 9]], COLORS.brass, 2);
      }
    }
    function act(fn, success) {
      let result;
      const returnId = picker ? pickerOrigin() : '';
      try { result = g.act(fn, { now: true, reason: 'outpost' }); }
      catch (error) { msg(error.message || String(error)); return { ok: false }; }
      if (!result || result.ok === false) {
        g.sfx('deny'); msg(result && result.reason || 'Действие сейчас недоступно');
      } else {
        g.sfx('tap'); g.buzz('tap'); picker = null; bladeIntent = null; sheetKey = ''; render(g.state); msg(success || 'Готово'); if (returnId) focusById(returnId);
      }
      return result;
    }
    function skill(id) {
      const result = g.act(s => sim.useAbility(s, cfg(), id, Date.now()));
      if (result && result.ok !== false) { g.sfx(id === 'dragon' ? 'boss' : 'clang'); g.buzz('tap'); }
      else g.sfx('deny');
      render(g.state);
    }
    function button(text, handler, disabled, attrs) {
      return h('button', Object.assign({ class: 'g-btn small', disabled: !!disabled, onclick: handler }, attrs || {}), text);
    }
    function pill(text, cls) { return h('span', { class: 'mfo-pill' + (cls ? ' ' + cls : '') }, text); }
    function note(text, attrs) { return h('p', Object.assign({ class: 'g-note mfo-note' }, attrs || {}), text); }
    function disclosure(id, title, ...content) {
      const box = h('details', { class: 'mfo-disclosure', open: !!expanded[id] }, h('summary', { id }, title), ...content);
      box.addEventListener('toggle', () => { if (box.isConnected) expanded[id] = box.open; });
      return box;
    }
    function weaponArt(weapon) {
      const wrap = h('span', { class: 'mfo-blade-art', 'aria-hidden': 'true' });
      if (options.putBlade) options.putBlade(wrap, weapon.level);
      else {
        const canvas = h('canvas', { width: 56, height: 72 });
        const ctx = canvas.getContext('2d'); ctx.scale(2, 2); blade(ctx, weapon, 14, 28, 0); wrap.append(canvas);
      }
      return wrap;
    }
    function weaponText(weapon) {
      if (!weapon) return tr('Без оружия');
      const temper = (core.TEMPERS || []).find(t => t.id === weapon.temper);
      return tr('Клинок ур. {}', weapon.level) + (temper ? ' · ' + tr(temper.title) : '');
    }
    function chooseCell(kind, heroId, selection) {
      picker = Object.assign({ kind, hero: heroId, cell: null, level: null, source: 'grid' }, selection || {}, { kind, hero: heroId });
      selectedHero = heroId || selectedHero; bladeIntent = null; sheetKey = ''; msg(''); buildSheet(true); focusById('outpost-picker-back');
    }
    function cancelPicker() {
      const returnId = picker ? pickerOrigin() : 'outpost-hero-' + selectedHero;
      picker = null; bladeIntent = null; sheetKey = ''; buildSheet(true); msg(''); focusById(returnId);
    }
    function selectionValid(p) {
      if (!p || p.cell === null) return false;
      if (p.source === 'rack') {
        const weapon = model.rack[p.cell];
        return !!weapon && weapon.level === p.level && weapon.temper === p.temper;
      }
      return sim.openCells(g.state, cfg()).includes(p.cell) && g.state.run.grid[p.cell] === p.level;
    }
    function equipmentPreview(p) {
      const item = model.heroes.find(member => member.id === p.hero);
      if (!item || !selectionValid(p)) return { ok: false, reason: 'Клинок изменился. Выберите его снова.' };
      const copy = JSON.parse(JSON.stringify(g.state));
      const result = p.source === 'rack' ? core.equipRack(copy, cfg(), p.cell, p.hero) : core.equip(copy, cfg(), p.cell, p.hero, sim.openCells(copy, cfg()));
      if (!result.ok) return result;
      const before = item.equipment;
      const destination = !before ? (p.source === 'rack' ? tr('Клинок будет передан герою со стойки.') : tr('Клинок будет снят с наковальни и передан герою.'))
        : p.source === 'rack' || before.temper ? tr('Прежнее оружие останется на стойке.') : tr('Прежнее оружие займёт освободившуюся клетку.');
      return { ok: true, item, before, after: copy.run.outpost.equipment[p.hero], powerBefore: item.power, powerAfter: Big.str(core.heroPower(copy, cfg(), p.hero)), destination };
    }
    function withCell(fn, success) {
      const selection = picker && Object.assign({}, picker);
      if (!selection || selection.cell === null) return;
      return act(s => {
        if (selection.source === 'grid' && s.run.grid[selection.cell] !== selection.level) return { ok: false, reason: 'Клинок изменился. Выберите его снова.' };
        if (selection.source === 'rack') {
          const current = core.model(s, cfg()).rack[selection.cell];
          if (!current || current.level !== selection.level || current.temper !== selection.temper) return { ok: false, reason: 'Стойка изменилась. Выберите оружие снова.' };
        }
        return fn(s, selection);
      }, success || (selection.kind === 'feed' ? 'Клинок передан дракону' : 'Оружие выдано герою'));
    }
    function cellPicker() {
      const p = picker;
      if (p.kind === 'molt') {
        const perk = (model.dragon.moltPreview && model.dragon.moltPreview.perks || []).find(item => item.id === p.perk);
        return h('section', { class: 'mfo-picker', 'data-picker': 'molt' },
          h('div', { class: 'mfo-card-head' }, h('h4', {}, tr('Подтвердить линьку'))),
          note(tr('Дракон останется взрослым. Часть усвоенной силы будет потрачена навсегда.')),
          h('div', { class: 'mfo-feed-preview' }, h('strong', {}, perk ? tr(perk.title) : p.perk),
            h('div', {}, tr('Потеря усвоенной силы: {}', fmt(p.cost))),
            h('div', {}, tr('Останется: {}', fmt(p.absorbedAfter))),
            perk ? note(tr(perk.description)) : null),
          button(tr('Провести линьку'), () => act(s => {
            const current = core.model(s, cfg()).dragon;
            if (current.lineage !== p.lineage || !Big.eq(current.absorbed, p.absorbed) || !current.moltPreview || !Big.eq(current.moltPreview.cost, p.cost)) return { ok: false, reason: 'Накопление изменилось. Проверьте условия линьки снова.' };
            return core.molt(s, cfg(), p.perk);
          }, 'Линька завершена'), false, { id: 'outpost-molt-confirm', class: 'g-btn mfo-danger' }));
      }
      if (p.kind === 'release') {
        const room = sim.freeCells(g.state, cfg()).length > 0;
        return h('section', { class: 'mfo-picker', 'data-picker': 'release' },
          h('div', { class: 'mfo-card-head' }, h('h4', {}, tr('Вернуть клинок на поле'))),
          h('strong', {}, weaponText(p)),
          note(tr('Закалка будет снята. Уровень клинка сохранится.')),
          room ? null : note(tr('Сначала освободите клетку на наковальне.')),
          button(tr('Снять закалку и вернуть'), () => withCell((s, selection) => core.releaseRack(s, cfg(), selection.cell, sim.openCells(s, cfg())), 'Клинок возвращён на поле'), !room,
            { id: 'outpost-release-confirm', class: 'g-btn mfo-danger' }));
      }
      const isFeed = p.kind === 'feed';
      const target = !isFeed && model.heroes.find(item => item.id === p.hero);
      const body = h('section', { class: 'mfo-picker', 'data-picker': p.kind },
        h('div', { class: 'mfo-card-head' }, h('h4', {}, isFeed ? tr('Покормить дракона') : tr('Оружие героя: {}', target ? tr(target.title) : ''))));
      if (!isFeed && target) body.append(h('div', { class: 'mfo-picker-target' }, portrait('hero', target),
        h('div', {}, h('strong', {}, tr(target.title)), note(target.active ? tr('В отряде') : tr('В резерве · оружие пока не участвует в бою')))));
      else body.append(note(tr('Выберите один клинок. Он исчезнет, а его сила останется у дракона.')),
        h('div', { class: 'mfo-pills' },
          pill(tr('Кормление: {} / {} мест занято', model.dragon.queue.length, model.dragon.queueCapacity)),
          pill(tr('За забег: {} / {}', model.dragon.eaten, model.dragon.feedLimit)),
          pill(model.dragon.feedMaxLevel >= 1 ? tr('Клинки до ур. {}', model.dragon.feedMaxLevel) : tr('Выкуйте клинок сильнее'))));

      // Keep the result and its single confirmation before the inventory: no hunt for a button below 35 items.
      const resultBox = h('div', { class: 'mfo-selection', id: 'outpost-picker-selection', 'aria-live': 'polite' });
      if (p.cell === null || !selectionValid(p)) {
        resultBox.append(note(tr('Выберите клинок ниже — здесь появится результат.')));
      } else if (isFeed) {
        const preview = core.feedPreview(g.state, cfg(), p.cell, sim.openCells(g.state, cfg()));
        const rune = sim.runeAt(g.state, cfg(), p.cell);
        resultBox.append(h('div', { class: 'mfo-selected-weapon' }, weaponArt(p), h('div', {}, h('strong', {}, weaponText(p)),
          note(tr('Будет израсходован один клинок')))));
        if (preview.ok) {
          resultBox.append(h('div', { class: 'mfo-values mfo-feed-preview' },
            h('div', {}, h('small', {}, tr('В постоянный запас')), h('strong', {}, '+' + fmt(preview.absorbed))),
            h('div', {}, h('small', {}, tr('Сила после очереди')), h('strong', {}, fmt(preview.powerAfter)))),
            note(tr('Сейчас в бою: {} · переваривание: {} с', fmt(preview.powerBefore), Math.round(preview.seconds * 10) / 10), { 'data-feed-time': '' }));
          if (rune) resultBox.append(note(tr('Клетка с руной опустеет. Руна останется на наковальне.')));
        } else resultBox.append(note(tr(preview.reason)));
        resultBox.append(button(tr('Скормить клинок ур. {}', p.level), () => withCell((s, selection) => core.feed(s, cfg(), selection.cell, sim.openCells(s, cfg()))), !preview.ok,
          { id: 'outpost-feed-confirm', class: 'g-btn primary mfo-danger' }));
      } else {
        const preview = equipmentPreview(p);
        if (preview.ok) {
          resultBox.append(h('div', { class: 'mfo-equip-compare', id: 'outpost-equip-preview' },
            h('div', {}, h('small', {}, tr('Сейчас')), preview.before ? weaponArt(preview.before) : null, h('strong', {}, weaponText(preview.before)), note(tr('Сила героя: {}', fmt(preview.powerBefore)), { 'data-equip-power': 'before' })),
            h('span', { class: 'mfo-compare-arrow', 'aria-hidden': 'true' }, '→'),
            h('div', {}, h('small', {}, tr('После замены')), weaponArt(preview.after), h('strong', {}, weaponText(preview.after)), note(tr('Сила героя: {}', fmt(preview.powerAfter)), { 'data-equip-power': 'after' }))),
            note(preview.destination));
          if (!preview.item.active) resultBox.append(note(tr('Герой в резерве. Чтобы он сражался, добавьте его в отряд.')));
        } else resultBox.append(note(tr(preview.reason)));
        resultBox.append(button(tr('Выдать герою'), () => withCell((s, selection) => selection.source === 'rack'
          ? core.equipRack(s, cfg(), selection.cell, selection.hero)
          : core.equip(s, cfg(), selection.cell, selection.hero, sim.openCells(s, cfg()))), !preview.ok,
          { id: 'outpost-equip-confirm', class: 'g-btn primary' }));
      }
      body.append(resultBox);
      const cells = sim.openCells(g.state, cfg()).filter(cell => g.state.run.grid[cell] > 0);
      const slots = h('div', { class: 'mfo-cell-picker', role: 'group', 'aria-label': tr('Клинки на наковальне') });
      const groups = new Map();
      cells.forEach(cell => {
        const level = g.state.run.grid[cell], rune = sim.runeAt(g.state, cfg(), cell);
        const key = level + ':' + (rune ? rune.rune : '');
        if (!groups.has(key)) groups.set(key, { level, rune: rune && rune.rune, cells: [] });
        groups.get(key).cells.push(cell);
      });
      Array.from(groups.values()).sort((a, b) => (isFeed ? a.level - b.level : b.level - a.level) || Number(!!a.rune) - Number(!!b.rune)).forEach(group => {
        const selected = p.source === 'grid' && group.cells.includes(p.cell) && p.level === group.level;
        const cell = selected ? p.cell : group.cells[0];
        // The dragon takes only blades a few levels below the best of the run: the others are shown, not offered.
        const b = button('', () => { p.source = 'grid'; p.cell = cell; p.level = group.level; p.temper = ''; sheetKey = ''; buildSheet(); }, isFeed && group.level > model.dragon.feedMaxLevel,
          { id: 'outpost-cell-' + cell, class: 'g-btn mfo-weapon-choice' + (selected ? ' selected' : ''), 'data-equip-cell': cell,
            'data-weapon-count': group.cells.length, 'aria-pressed': String(selected) });
        b.append(weaponArt(group), h('strong', {}, tr('Ур. {}', group.level)), h('span', { class: 'mfo-choice-note' }, tr('{} шт.', group.cells.length)));
        if (group.rune) b.append(h('span', { class: 'mfo-choice-note' }, tr('На руне: {}', tr(({ fire: 'Огонь', ice: 'Лёд', greed: 'Жадность' })[group.rune] || group.rune))));
        slots.append(b);
      });
      body.append(h('div', { class: 'mfo-label' }, tr('На наковальне')), slots);
      if (!cells.length) body.append(note(tr('На наковальне нет клинков.')));
      if (!isFeed && model.rack.length) {
        const rack = h('div', { class: 'mfo-rack' });
        model.rack.forEach((weapon, i) => {
          const selected = p.source === 'rack' && p.cell === i;
          rack.append(button(weaponText(weapon), () => { p.source = 'rack'; p.cell = i; p.level = weapon.level; p.temper = weapon.temper; sheetKey = ''; buildSheet(); }, false,
            { id: 'outpost-rack-' + i, class: 'g-btn mfo-rack-choice' + (selected ? ' selected' : ''), 'data-rack-index': i, 'aria-pressed': String(selected) }));
        });
        body.append(h('div', { class: 'mfo-label' }, tr('На стойке')), rack);
      }
      return body;
    }
    function talentTree(item) {
      const tree = h('details', { class: 'mfo-talents', 'data-talents': item.id, open: !!expandedTalents[item.id] });
      tree.addEventListener('toggle', () => { if (tree.isConnected) expandedTalents[item.id] = tree.open; });
      const chosen = (item.talents || []).filter(tier => !!tier.selected).length;
      tree.append(h('summary', { id: 'talents-' + item.id }, tr('Таланты: {} / {}', chosen, (item.talents || []).length)),
        note(tr('Один выбор на ступень. Сменить его можно, когда умение готово и не подготовлено к удару.')));
      (item.talents || []).forEach(tier => {
        const row = h('section', { class: 'mfo-talent-tier' + (tier.unlocked ? '' : ' locked'), 'data-talent-tier': tier.rank },
          h('div', { class: 'mfo-label' }, tr('Ранг {}', tier.rank)));
        const choices = h('div', { class: 'mfo-talent-choices' });
        tier.choices.forEach(choice => {
          const selected = tier.selected === choice.id;
          const b = button('', () => act(s => core.chooseTalent(s, cfg(), item.id, tier.rank, choice.id), 'Талант выбран'),
            !tier.unlocked || !item.talentReady || selected,
            { class: 'g-btn mfo-talent' + (selected ? ' selected' : ''), 'data-talent-hero': item.id, 'data-talent-rank': tier.rank, 'data-talent': choice.id, 'aria-pressed': String(selected) });
          b.append(h('strong', {}, tr(choice.title)), h('span', { class: 'mfo-choice-note' }, tr(choice.description)),
            h('span', { class: 'mfo-choice-state' }, selected ? tr('Выбрано') : tier.unlocked ? tr('Выбрать') : tr('Нужен ранг {}', tier.rank)));
          choices.append(b);
        });
        row.append(choices); tree.append(row);
      });
      return tree;
    }
    function heroRoster() {
      const list = h('div', { class: 'mfo-roster', role: 'group', 'aria-label': tr('Выберите героя') });
      const members = model.heroes.filter(item => bladeIntent ? item.unlocked : item.available);
      members.sort((a, b) => Number(b.active) - Number(a.active));
      if (!members.some(item => item.id === selectedHero) && members.length) selectedHero = members[0].id;
      members.forEach(item => {
        const selected = !bladeIntent && item.id === selectedHero;
        const row = button('', () => {
          selectedHero = item.id;
          if (bladeIntent) chooseCell('equip', item.id, bladeIntent);
          else { sheetKey = ''; msg(''); buildSheet(); }
        }, false, { id: 'outpost-hero-' + item.id, class: 'g-btn mfo-roster-row' + (selected ? ' selected' : ''),
          'data-hero-select': item.id, 'aria-pressed': String(selected) });
        row.append(portrait('hero', item), h('span', { class: 'mfo-roster-copy' }, h('strong', {}, tr(item.title)),
          h('span', { class: 'mfo-choice-note' }, item.unlocked ? weaponText(item.equipment) : tr('Можно пригласить'))),
          pill(item.active ? tr('В отряде') : item.unlocked ? tr('Резерв') : tr('Новый'), item.active ? 'active' : ''));
        list.append(row);
      });
      return list;
    }
    function heroCard(item) {
      const badge = item.active ? pill(tr('В отряде'), 'active') : item.unlocked ? pill(tr('В резерве')) : pill(tr('Можно пригласить'));
      const head = h('div', { class: 'mfo-card-head' }, portrait('hero', item), h('div', { class: 'mfo-card-title' }, h('h4', {}, tr(item.title)), badge));
      const card = h('section', { class: 'mfo-card mfo-hero-detail', 'data-hero': item.id }, head);
      if (!item.unlocked) {
        card.append(note(tr(item.description)),
          button(tr('Пригласить'), () => act(s => core.recruit(s, cfg(), item.id), 'Герой присоединился'), false, { 'data-recruit': item.id, class: 'g-btn primary' }));
        return card;
      }
      card.append(h('div', { class: 'mfo-detail', 'data-hero-progress': item.id }, tr('Ранг {} · опыт {}', item.level, xpFmt(item.xp))),
        h('div', { class: 'mfo-selected-weapon' }, item.equipment ? weaponArt(item.equipment) : null,
          h('div', {}, h('strong', { class: 'mfo-weapon-line' }, weaponText(item.equipment)), note(tr('Сила героя: {}', fmt(item.power)), { 'data-hero-power': item.id }))),
        button(item.equipment ? tr('Сменить оружие') : tr('Вооружить героя'), () => chooseCell('equip', item.id), false,
          { id: 'outpost-equip-' + item.id, 'data-equip-hero': item.id, class: 'g-btn primary' }),
        note(tr(item.description || item.ability)));
      const active = model.heroes.filter(member => member.active);
      const actions = h('div', { class: 'mfo-actions' });
      if (item.active) actions.append(button(tr('В резерв'), () => act(s => core.reserveHero(s, cfg(), item.id), 'Состав отряда изменён'), false, { 'data-reserve-hero': item.id }));
      else if (active.length < model.slots) card.append(button(tr('В отряд'), () => act(s => core.selectHero(s, cfg(), item.id), 'Состав отряда изменён'), false, { 'data-select-hero': item.id }));
      else {
        const formation = disclosure('hero-formation-' + item.id, tr('Добавить в отряд'), note(tr('Выберите, кого заменить в отряде:')));
        active.forEach(member => formation.append(button(tr('Вместо {}', tr(member.title)), () => act(s => core.selectHero(s, cfg(), item.id, member.id), 'Состав отряда изменён'), false,
          { 'data-select-hero': item.id, 'data-replace-hero': member.id })));
        card.append(formation);
      }
      if (item.equipment) actions.append(button(tr('Снять оружие'), () => act(s => core.unequip(s, cfg(), item.id, sim.openCells(s, cfg())), 'Клинок возвращён'), false, { 'data-unequip': item.id }));
      const tools = disclosure('hero-tools-' + item.id, tr('Состав и оружие'), actions);
      if (item.equipment && model.unlocks.tempers) {
        const temperRow = h('div', { class: 'mfo-tempers' });
        (core.TEMPERS || []).forEach(temper => {
          const selected = item.equipment.temper === temper.id;
          const option = button('', () => act(s => core.temper(s, cfg(), item.id, temper.id), 'Закалка нанесена'), selected || !Big.gte(g.state.run.gold, item.temperCost),
            { class: 'g-btn mfo-temper ' + temper.id + (selected ? ' selected' : ''), 'data-temper': temper.id });
          option.append(h('strong', {}, tr(({ fire: 'Огонь', ice: 'Лёд', resonant: 'Звон' })[temper.id] || temper.title)),
            h('span', { class: 'mfo-choice-note' }, tr(temper.description || temper.title)));
          temperRow.append(option);
        });
        tools.append(h('div', { class: 'mfo-label' }, tr('Закалка: {} золота', fmt(item.temperCost))), temperRow);
      }
      if (actions.childElementCount || item.equipment && model.unlocks.tempers) card.append(tools);
      if (item.id === 'eira' && item.attunements) {
        const elements = h('div', { class: 'mfo-tempers' });
        item.attunements.forEach(element => elements.append(button(tr(({ fire: 'Огонь', ice: 'Лёд', resonant: 'Звон' })[element.id] || element.title), () => act(s => core.setAttunement(s, cfg(), element.id), 'Стихия приёма выбрана'), !item.attunementReady || item.attunement === element.id,
          { class: 'g-btn small mfo-temper ' + element.id + (item.attunement === element.id ? ' selected' : ''), 'data-attunement': element.id, 'aria-pressed': String(item.attunement === element.id) })));
        card.append(disclosure('hero-attunement-' + item.id, tr('Стихия следующего приёма'), note(tr('Меняет умение Эйры. Закалка оружия сохраняется.')), elements));
      }
      if (item.talents) card.append(talentTree(item));
      return card;
    }
    function petCard(item) {
      const card = h('section', { class: 'mfo-card' + (item.available ? '' : ' locked'), 'data-pet': item.id },
        h('div', { class: 'mfo-card-head' }, portrait('pet', item), h('div', { class: 'mfo-card-title' }, h('h4', {}, tr(item.title)), item.selected ? pill(tr('Помогает кузне'), 'active') : null)),
        note(tr(item.description)));
      if (!item.available) card.append(note(tr('Откроется с волны {}', item.wave || unlockWave('pets'))));
      else {
        card.append(h('div', { class: 'mfo-detail', 'data-pet-progress': item.id }, tr('Ранг {} · опыт {}', item.level, xpFmt(item.xp))));
        if (item.selected && item.chargeMax > 0) {
          const ratio = item.chargeMax ? Math.min(1, item.charge / item.chargeMax) : 0;
          card.append(h('div', { class: 'mfo-meter', role: 'meter', 'data-pet-meter': item.id, 'aria-label': tr('Заряд помощника'), 'aria-valuemin': 0, 'aria-valuemax': item.chargeMax || 1, 'aria-valuenow': item.charge || 0 }, h('i', { style: 'width:' + ratio * 100 + '%' })),
            h('p', { class: 'g-note mfo-note', 'data-pet-charge': item.id }, tr('Заряд: {} / {}', xpFmt(item.charge), xpFmt(item.chargeMax))));
        } else if (item.selected) card.append(note(item.id === 'raven' ? tr('Бонус к награде за заказ: {}', g.fmt.pct(model.benefits && model.benefits.contractBonus || 0)) : tr('Защит от ослабления: {} за встречу', model.benefits && model.benefits.casterWards || 1)));
        else card.append(button(tr('Выбрать помощника'), () => act(s => core.choosePet(s, cfg(), item.id), 'Помощник выбран'), false, { 'data-choose-pet': item.id }));
      }
      return card;
    }
    function dragonPanel() {
      const d = model.dragon;
      const selectedForm = (d.forms || []).find(form => form.id === d.form);
      const title = d.stage === 'adult' ? tr(selectedForm ? selectedForm.title : 'Пепельный дракон') : d.stage === 'young' ? tr('Молодой дракон') : tr('Яйцо под кузницей');
      const card = h('section', { class: 'mfo-card mfo-dragon-card' },
        h('div', { class: 'mfo-card-head' }, portrait('dragon', d), h('div', { class: 'mfo-card-title' }, h('h4', {}, title),
          pill(d.stage === 'egg' ? tr('До вылупления: {} / {} клинков', d.fed, d.hatch) : d.stage === 'young' ? tr('До взрослой формы: {} / {} клинков', d.fed, d.adult) : tr('Скормлено клинков: {}', d.fed)))));
      if (!d.unlocked) {
        card.append(note(tr('Логово откроется с волны {}', unlockWave('dragon'))));
        return card;
      }
      card.append(note(tr('Отдавайте ненужные клинки. Они исчезают, а накопленная сила сохраняется после перековки.')),
        button(d.eaten >= d.feedLimit ? tr('Дракон сыт до перековки') : d.queue.length >= d.queueCapacity ? tr('Очередь кормления заполнена') : tr('Покормить дракона'),
          () => chooseCell('feed'), d.eaten >= d.feedLimit || d.queue.length >= d.queueCapacity,
          { id: 'outpost-feed', class: 'g-btn primary' }));
      const queue = h('div', { class: 'mfo-queue', 'aria-label': tr('Кормление') },
        h('div', { class: 'mfo-label' }, tr('Кормление: {} / {} мест занято', d.queue.length, d.queueCapacity)),
        h('div', { class: 'mfo-label' }, tr('За забег: {} / {}', d.eaten, d.feedLimit) + ' · ' +
          (d.feedMaxLevel >= 1 ? tr('Клинки до ур. {}', d.feedMaxLevel) : tr('Выкуйте клинок сильнее'))));
      if (!d.queue.length) queue.append(note(tr('Выберите клинок, чтобы увидеть прибавку силы до кормления.')));
      d.queue.forEach((entry, i) => queue.append(h('div', { class: 'mfo-queue-item' },
        h('span', {}, tr('Клинок ур. {}', entry.level)), h('span', { class: 'g-num', 'data-digest': i }, i === 0 ? tr('{} с', Math.ceil(entry.left)) : tr('В очереди')))));
      card.append(queue, h('div', { class: 'mfo-values' },
        h('div', {}, h('small', {}, tr('Сила в бою')), h('strong', { class: 'g-num' }, fmt(d.power))),
        h('div', {}, h('small', {}, tr('Постоянный запас')), h('strong', { class: 'g-num' }, fmt(d.absorbed)))));
      if (d.stage !== 'egg') {
        const ratio = d.chargeMax ? Math.min(1, d.charge / d.chargeMax) : 0;
        card.append(h('div', { class: 'mfo-meter dragon', role: 'meter', 'data-dragon-meter': '', 'aria-label': tr('Дыхание'), 'aria-valuemin': 0, 'aria-valuemax': d.chargeMax || 1, 'aria-valuenow': d.charge || 0 }, h('i', { style: 'width:' + ratio * 100 + '%' })),
          h('div', { class: 'mfo-detail', 'data-dragon-charge': '' }, tr('Дыхание: {} / {}', xpFmt(d.charge), xpFmt(d.chargeMax))));
      }
      card.append(disclosure('dragon-growth', tr('Как растёт сила'),
        note(tr('Дракон усваивает исходную силу клинков. Накопление сохраняется после перековки, а боевую отдачу ограничивает текущий горн.'))));
      if (d.forms && d.stage === 'adult') {
        const forms = disclosure('dragon-forms', tr('Форма дыхания: {}', selectedForm ? tr(selectedForm.title) : ''),
          note(tr('Форму можно менять у взрослого дракона, когда дыхание готово и не подготовлено.')));
        d.forms.forEach(form => {
          const item = Object.assign({}, d, { form: form.id });
          const b = button('', () => act(s => core.selectForm(s, cfg(), form.id), 'Форма дракона выбрана'), !form.unlocked || !d.formReady || form.selected,
            { class: 'g-btn mfo-form' + (form.selected ? ' selected' : ''), 'data-dragon-form': form.id, 'aria-pressed': String(form.selected) });
          b.append(portrait('dragon', item), h('span', { class: 'mfo-form-copy' }, h('strong', {}, tr(form.title)), h('span', { class: 'mfo-choice-note' }, tr(form.description)),
            h('span', { class: 'mfo-choice-state' }, form.selected ? tr('Выбрано') : form.unlocked ? tr('Выбрать') : tr('Откроется с волны {}', d.formsWave))));
          forms.append(b);
        });
        card.append(forms);
      } else if (d.stage === 'young') card.append(note(tr('Новые формы появятся у взрослого дракона с волны {}.', d.formsWave)));
      if (d.moltPreview && d.stage === 'adult') {
        const preview = d.moltPreview;
        const molt = disclosure('dragon-molt', tr('Линька · поколение {}', d.lineage || 0),
          note(tr('Новый рекорд открывает развитие дыхания. Возраст и форма сохраняются.')));
        if (!preview.ok) molt.append(note(tr(preview.reason || 'Линька пока недоступна')), note(tr('Следующая цель: рекорд {} и {} кормлений', preview.nextWave, preview.nextFed)));
        else molt.append(note(tr('Цена: {} усвоенной силы. Останется {}.', fmt(preview.cost), fmt(preview.absorbedAfter))));
        const choices = h('div', { class: 'mfo-talent-choices' });
        (preview.perks || []).forEach(perk => {
          const b = button('', () => { picker = { kind: 'molt', perk: perk.id, cost: preview.cost, absorbed: d.absorbed, absorbedAfter: preview.absorbedAfter, lineage: d.lineage }; sheetKey = ''; buildSheet(); },
            !preview.ok || perk.level >= perk.max, { class: 'g-btn mfo-talent', 'data-molt-perk': perk.id });
          b.append(h('strong', {}, tr(perk.title)), h('span', { class: 'mfo-choice-note' }, tr(perk.description)), h('span', { class: 'mfo-choice-state' }, tr('Уровень {} / {}', perk.level, perk.max)));
          choices.append(b);
        });
        molt.append(choices); card.append(molt);
      }
      return card;
    }
    function adventurePane() {
      if (!adventures && window.MFAdventuresUI) adventures = window.MFAdventuresUI.create({ g, sim });
      if (!adventures) return note(tr('Поручения пока недоступны'));
      adventures.render(g.state);
      return adventures.element;
    }
    function focusSelector(node) {
      if (!node || !node.getAttribute) return '';
      if (node.id) return '#' + CSS.escape(node.id);
      const attrs = Array.from(node.attributes).filter(attr => attr.name.indexOf('data-') === 0);
      return attrs.length ? node.tagName.toLowerCase() + attrs.map(attr => '[' + attr.name + '="' + CSS.escape(attr.value) + '"]').join('') : '';
    }
    function focusById(id) {
      const node = sheetBody && sheetBody.querySelector('#' + CSS.escape(id));
      if (node) node.focus();
    }
    function pickerOrigin() {
      return picker && picker.kind === 'equip' ? 'outpost-equip-' + picker.hero : picker && picker.kind === 'molt' ? 'dragon-molt'
        : picker && picker.kind === 'release' ? 'outpost-rack-open' : 'outpost-feed';
    }
    function sheetFingerprint(state) {
      return JSON.stringify({ tab, picker, selectedHero, bladeIntent, prepared: state.run.encounter && state.run.encounter.pending, heroes: model.heroes.map(item => [item.id, item.available, item.unlocked, item.active, item.level, item.equipment, item.talents, item.talentReady, item.attunement, item.attunementReady, Big.gte(state.run.gold, item.temperCost || 0)]), pets: model.pets.map(item => [item.id, item.available, item.selected, item.level]), dragon: [model.dragon.unlocked, model.dragon.stage, model.dragon.fed, model.dragon.anchorLevel, model.dragon.power, model.dragon.queue.length, model.dragon.form, model.dragon.formReady, model.dragon.lineage, model.dragon.moltPreview], rack: model.rack, cells: picker ? state.run.grid : null });
    }
    function buildSheet(resetScroll) {
      if (!sheetBody || disposed) return;
      const navigationBack = sheetBody.closest('.mfo-sheet').querySelector('#outpost-picker-back');
      if (navigationBack) navigationBack.hidden = !picker && !bladeIntent;
      const focus = focusSelector(document.activeElement);
      const scroller = sheetBody.closest('.sheet') || sheetBody;
      const oldScroll = resetScroll ? 0 : scroller.scrollTop;
      sheetBody.textContent = '';
      if (picker) sheetBody.append(cellPicker());
      else if (tab === 'heroes') {
        if (bladeIntent) {
          sheetBody.append(h('div', { class: 'mfo-card-head' }, h('h4', {}, tr('Кому выдать клинок ур. {}?', bladeIntent.level))),
            note(tr('Выберите героя. Перед передачей можно сравнить оружие.')), heroRoster());
          if (!model.heroes.some(item => item.unlocked)) sheetBody.append(note(tr('Сначала пригласите героя во вкладке «Отряд».')),
            button(tr('Показать героев'), () => { bladeIntent = null; sheetKey = ''; buildSheet(true); focusById('outpost-hero-' + selectedHero); }, false,
              { id: 'outpost-show-heroes', class: 'g-btn primary' }));
        } else {
          const active = model.heroes.filter(item => item.active).length;
          sheetBody.append(h('div', { class: 'mfo-section-heading' }, h('strong', {}, tr('Боевой отряд')), pill(tr('{} / {} мест', active, model.slots))), heroRoster());
          const selected = model.heroes.find(item => item.id === selectedHero && item.available);
          if (selected) sheetBody.append(heroCard(selected));
          const next = model.heroes.find(item => !item.available);
          if (next) sheetBody.append(h('div', { class: 'mfo-next-unlock' }, portrait('hero', next),
            h('div', {}, h('strong', {}, tr(next.title)), note(tr('Откроется с волны {}', next.wave || unlockWave('heroes'))))));
          if (model.rack.length) {
            const rack = h('div', { class: 'mfo-rack' });
            model.rack.forEach((weapon, i) => rack.append(h('div', { class: 'mfo-queue-item' }, h('span', {}, weaponText(weapon)),
              button(tr('Вернуть на поле'), () => { picker = { kind: 'release', source: 'rack', cell: i, level: weapon.level, temper: weapon.temper }; sheetKey = ''; buildSheet(true); }, false, { 'data-release-rack': i }))));
            sheetBody.append(disclosure('outpost-rack-open', tr('Стойка оружия: {} / {}', model.rack.length, model.rackCapacity),
              note(tr('Клинки со стойки доступны при смене оружия героя.')), rack));
          }
        }
      } else if (tab === 'pets') {
        sheetBody.append(note(tr('Один активный помощник. Коллекция и развитие сохраняются после перековки.')));
        model.pets.filter(item => item.available).forEach(item => sheetBody.append(petCard(item)));
        const next = model.pets.find(item => !item.available);
        if (next) sheetBody.append(h('div', { class: 'mfo-next-unlock' }, portrait('pet', next),
          h('div', {}, h('strong', {}, tr(next.title)), note(tr('Откроется с волны {}', next.wave)))));
      } else if (tab === 'adventures') sheetBody.append(adventurePane());
      else sheetBody.append(dragonPanel());
      sheetKey = sheetFingerprint(g.state);
      scroller.scrollTop = oldScroll;
      if (focus) { const target = sheetBody.querySelector(focus); if (target) target.focus({ preventScroll: true }); }
    }
    function open(wanted, selection) {
      if (disposed) return;
      const returnFocus = document.activeElement;
      if (closeSheet) closeSheet();
      model = stateModel(); tab = wanted || 'heroes'; picker = null; bladeIntent = null; sheetKey = '';
      if (selection && selection.source === 'grid' && Number.isInteger(selection.cell) && Number.isInteger(selection.level)) {
        const offered = { kind: selection.kind, source: 'grid', cell: selection.cell, level: selection.level, temper: '' };
        if (selection.kind === 'feed') { tab = 'dragon'; picker = offered; }
        else if (selection.kind === 'equip') { tab = 'heroes'; bladeIntent = offered; }
      }
      const tabs = h('div', { class: 'mfo-tabs', role: 'tablist', 'aria-label': tr('Форпост') });
      const tabButtons = {};
      [['heroes', 'Отряд'], ['pets', 'Питомцы'], ['dragon', 'Дракон'], ['adventures', 'Поручения']].forEach(([id, title]) => {
        tabButtons[id] = h('button', { id: 'outpost-tab-' + id, class: 'g-btn small' + (tab === id ? ' selected' : ''), role: 'tab',
          'aria-controls': 'outpost-panel', 'aria-selected': String(tab === id), tabindex: tab === id ? 0 : -1, 'data-outpost-tab': id, onclick: () => {
          tab = id; picker = null; bladeIntent = null; sheetKey = '';
          Object.entries(tabButtons).forEach(([key, btn]) => { btn.classList.toggle('selected', key === id); btn.setAttribute('aria-selected', String(key === id)); btn.tabIndex = key === id ? 0 : -1; });
          sheetBody.setAttribute('aria-labelledby', 'outpost-tab-' + id);
          buildSheet(true); msg('');
        } }, tr(title)); tabs.append(tabButtons[id]);
      });
      tabs.addEventListener('keydown', event => {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].indexOf(event.key) < 0 || !event.target.matches('[role="tab"]')) return;
        const list = Object.values(tabButtons), index = list.indexOf(event.target);
        if (index < 0) return;
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length;
        event.preventDefault(); list[next].focus(); list[next].click();
      });
      notice = h('div', { class: 'mfo-notice', role: 'status', 'aria-live': 'polite', hidden: true });
      sheetBody = h('div', { class: 'mfo-sheet-body', id: 'outpost-panel', role: 'tabpanel', 'aria-labelledby': 'outpost-tab-' + tab });
      const content = h('div', { class: 'mfo-sheet', id: 'outpost-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'outpost-title' },
        h('div', { class: 'mfo-navigation' },
          h('div', { class: 'mfo-sheet-head' }, h('h3', { id: 'outpost-title' }, tr('Форпост')),
            button(tr('Назад'), cancelPicker, false, { id: 'outpost-picker-back', hidden: true }),
            button(tr('Закрыть'), () => { if (closeSheet) closeSheet(); }, false, { id: 'outpost-close' })), tabs), notice, sheetBody);
      content.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          event.preventDefault(); event.stopPropagation();
          if (picker || bladeIntent) cancelPicker(); else if (closeSheet) closeSheet();
        } else if (event.key === 'Tab') {
          const nodes = Array.from(content.querySelectorAll('button:not(:disabled),summary,[tabindex="0"]')).filter(node => node.getClientRects().length && node.tabIndex >= 0);
          const first = nodes[0], last = nodes[nodes.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      });
      closeSheet = g.sheet(content, () => {
        closeSheet = null; sheetBody = null; notice = null; picker = null; bladeIntent = null; sheetKey = '';
        if (returnFocus && returnFocus.isConnected) returnFocus.focus({ preventScroll: true });
      });
      const dialog = content.closest('.sheet');
      if (dialog) {
        dialog.classList.add('mfo-dialog');
        const backdrop = dialog.closest('.sheet-back');
        if (backdrop) backdrop.classList.add('mfo-backdrop');
      }
      buildSheet(true); tabButtons[tab].focus({ preventScroll: true }); if (options.onLayout) options.onLayout();
    }
    function render(state) {
      if (disposed) return;
      model = core.model(state, cfg());
      hitEvent = state.run.lastOutpostFx || null;
      paintAvatar();
      const active = model.heroes.filter(item => item.active && item.equipment);
      launchSub.textContent = model.nextUnlock ? tr('{} · волна {}', tr(model.nextUnlock.title), model.nextUnlock.wave) : tr('Герои, помощник и дракон');
      const skills = active.map(item => ({ id: item.id, title: item.ability || (item.id === 'bran' ? 'Раскол' : 'Рипост'), ready: item.abilityReady, cooldown: item.cooldown }));
      if (model.dragon.unlocked && model.dragon.stage !== 'egg') skills.push({ id: 'dragon', title: 'Дыхание', ready: model.dragon.ready, cooldown: model.dragon.cooldown });
      const newStrip = skills.map(item => item.id).join('|');
      if (newStrip !== stripKey) {
        stripKey = newStrip; skillbar.textContent = '';
        Object.keys(controls).forEach(id => { delete controls[id]; delete cooldowns[id]; });
        skills.forEach(item => {
          const name = h('span', { class: 'mfo-skill-title' }, tr(item.title));
          const sub = h('span', { class: 'mfo-skill-sub' }); cooldowns[item.id] = sub;
          controls[item.id] = button('', () => skill(item.id), false, { class: 'g-btn mfo-skill', 'data-ability': item.id });
          controls[item.id].append(name, sub); skillbar.append(controls[item.id]);
        });
        if (options.onLayout) options.onLayout();
      }
      skills.forEach(item => {
        const btn = controls[item.id]; btn.disabled = !item.ready;
        btn.classList.toggle('ready', !!item.ready);
        cooldowns[item.id].textContent = item.cooldown > 0 ? tr('{} с', Math.ceil(item.cooldown)) : item.ready ? tr('Готово') : tr('Нужен заряд');
      });
      skillbar.hidden = !skills.length;
      element.classList.toggle('has-skills', !!skills.length);
      element.classList.toggle('has-many-skills', skills.length > 1);
      if (sheetBody) {
        if (picker && picker.cell !== null && picker.source === 'grid' && state.run.grid[picker.cell] !== picker.level) {
          picker.cell = null; picker.level = null;
          msg('Клинок изменился. Выберите его снова.');
        }
        const key = sheetFingerprint(state);
        if (tab === 'adventures') { if (!adventures || !sheetBody.contains(adventures.element)) buildSheet(); else adventures.render(state); }
        else if (key !== sheetKey) { sheetKey = key; buildSheet(); }
        model.dragon.queue.forEach((entry, i) => text(sheetBody.querySelector('[data-digest="' + i + '"]'), i === 0 ? tr('{} с', Math.ceil(entry.left)) : tr('В очереди')));
        model.heroes.forEach(item => {
          text(sheetBody.querySelector('[data-hero-progress="' + item.id + '"]'), tr('Ранг {} · опыт {}', item.level, xpFmt(item.xp)));
          text(sheetBody.querySelector('[data-hero-power="' + item.id + '"]'), tr('Сила героя: {}', fmt(item.power)));
        });
        model.pets.forEach(item => {
          text(sheetBody.querySelector('[data-pet-progress="' + item.id + '"]'), tr('Ранг {} · опыт {}', item.level, xpFmt(item.xp)));
          text(sheetBody.querySelector('[data-pet-charge="' + item.id + '"]'), tr('Заряд: {} / {}', xpFmt(item.charge), xpFmt(item.chargeMax)));
          const meter = sheetBody.querySelector('[data-pet-meter="' + item.id + '"]'); if (meter) { meter.setAttribute('aria-valuenow', item.charge); meter.firstChild.style.width = Math.min(1, item.charge / Math.max(1, item.chargeMax)) * 100 + '%'; }
        });
        text(sheetBody.querySelector('[data-dragon-charge]'), tr('Дыхание: {} / {}', xpFmt(model.dragon.charge), xpFmt(model.dragon.chargeMax)));
        if (picker && selectionValid(picker)) {
          if (picker.kind === 'feed') {
            const preview = core.feedPreview(state, cfg(), picker.cell, sim.openCells(state, cfg()));
            if (preview.ok) text(sheetBody.querySelector('[data-feed-time]'), tr('Сейчас в бою: {} · переваривание: {} с', fmt(preview.powerBefore), Math.round(preview.seconds * 10) / 10));
          } else if (picker.kind === 'equip' && sheetBody.querySelector('[data-equip-power="after"]')) {
            // heroPower only reads gear and progression. Replace the candidate gear in a small
            // view copy, without moving a blade or rebuilding the inventory on fractional XP.
            const equipment = Object.assign({}, state.run.outpost.equipment);
            equipment[picker.hero] = { level: picker.level, temper: picker.temper || '' };
            const candidate = Object.assign({}, state, { run: Object.assign({}, state.run, { outpost: Object.assign({}, state.run.outpost, { equipment }) }) });
            const current = model.heroes.find(item => item.id === picker.hero);
            if (current) text(sheetBody.querySelector('[data-equip-power="before"]'), tr('Сила героя: {}', fmt(current.power)));
            text(sheetBody.querySelector('[data-equip-power="after"]'), tr('Сила героя: {}', fmt(core.heroPower(candidate, cfg(), picker.hero))));
          }
        }
        const dragonMeter = sheetBody.querySelector('[data-dragon-meter]'); if (dragonMeter) { dragonMeter.setAttribute('aria-valuenow', model.dragon.charge); dragonMeter.firstChild.style.width = Math.min(1, model.dragon.charge / Math.max(1, model.dragon.chargeMax)) * 100 + '%'; }
      }
    }
    function draw(ctx, box, time, still) {
      if (disposed || !model || !box || !(box.width > 0 && box.height > 0)) return;
      const actors = model.heroes.filter(item => item.active);
      const helper = model.pets.find(item => item.selected);
      const d = model.dragon.unlocked ? model.dragon : null;
      if (!actors.length && !helper && !d) return;
      const t = still ? 0 : time || 0;
      const effect = id => {
        if (still || !hitEvent || !Array.isArray(hitEvent.ids) || hitEvent.ids.indexOf(id) < 0) return 0;
        const age = (time || 0) - hitEvent.at / 1000;
        return age >= 0 && age < 0.6 ? 1 - age / 0.6 : 0;
      };
      const columns = actors.length + (helper ? 1 : 0) + (d ? 1.3 : 0);
      const size = Math.min(box.height / 51, box.width / Math.max(1, columns) / 47, 1.8);
      const step = box.width / Math.max(1, columns);
      let cursor = box.x + step * 0.45;
      ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.width, box.height); ctx.clip();
      actors.forEach(item => { const action = effect(item.id); hero(ctx, item, cursor, box.y + box.height - 3, size, t, action); cursor += step; });
      if (helper) { pet(ctx, helper, cursor, box.y + box.height - 3, size, t, effect(helper.id)); cursor += step; }
      if (d) dragon(ctx, d, Math.min(box.x + box.width - 25 * size, cursor), box.y + box.height - 3, size, t, effect('dragon'));
      ctx.restore();
    }
    function dispose() { disposed = true; if (closeSheet) closeSheet(); if (adventures) adventures.dispose(); element.remove(); }
    render(g.state);
    return { element, render, open, draw, dispose, inspect: () => ({ model, sheetOpen: !!sheetBody, picker, skills: Object.keys(controls) }) };
  }
  window.MFOutpostUI = { create, portrait, drawHero: hero, drawPet: pet, drawDragon: dragon };
})();
