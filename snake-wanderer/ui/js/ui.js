// Интерфейс: HUD поверх мира и экраны меню. Всё на DOM, игра его только кормит данными.
import { svg, pic, IMG, RELIC, RELICS, PERMS, permCost, SKINS, ACHS, DIFFS, LEVELUPS, ARTIFACTS, activeArts, ACTIVE, ACTIVES, PET, PETS, BEASTS, TAGS, tagCounts, EVOS, MODULES, MODULE, modSlots, SPECIES, circleText } from './data.js';
import { LORE, SOURCE } from './lore.js';
import { fmtTime, clamp } from './util.js';
import { canExit, hasHub } from './host.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hexCss = (h) => '#' + h.toString(16).padStart(6, '0');
const plural = (n, a, b, c) => (n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? b : c);

/** Всё, что попадает в альманах. key — он же имя картинки. */
const KIND = ['Обычная реликвия', 'Редкая реликвия', 'Легендарная реликвия', 'Лунная реликвия', 'Эволюция'];
const recipe = (r) => `Срастается сама, когда собраны «${RELIC[r.evo[0]].name}» и «${RELIC[r.evo[1]].name}»`;
const ENTRIES = [
  ...RELICS.map((r) => ({ key: r.id, name: r.name, desc: r.desc, cls: 'rar' + r.rar, label: r.trophy ? 'Трофей босса' : KIND[r.rar] + (r.tag ? ' · ' + TAGS[r.tag].name.toLowerCase() : ''), group: r.trophy ? 'tr' : 'r' + r.rar, src: r.trophy ? 'Только с хозяина логова: одолей его' : r.evo ? recipe(r) : r.rar === 3 ? SOURCE.lunar : SOURCE.relic, unlock: r.unlock })),
  ...ACTIVES.map((a) => ({ key: 'a_' + a.id, name: a.name, desc: a.desc, cls: 'rarA', label: `Активный предмет · перезарядка ${a.cd} с`, group: 'a', src: SOURCE.active })),
  ...PETS.map((p) => ({ key: 'pet_' + p.id, name: p.name, desc: p.desc + ' Теряет сердце, когда тебя ранят; сердец три.', cls: 'rarP', label: 'Спутник', group: 'p', src: SOURCE.pet })),
  ...ARTIFACTS.map((a) => ({ key: 'art_' + a.id, art: a.id, name: a.name, desc: a.desc, cls: 'rarR', label: 'Артефакт' + (a.bonus ? ` · осколков +${Math.round(a.bonus * 100)}%` : ''), group: 't', src: SOURCE.art })),
  ...SPECIES.map((q) => ({ key: 'sp_' + q.id, species: q, name: q.name, desc: q.desc, cls: 'rarA', label: 'Вид змеи', group: 'sp', src: 'Выбирается в меню перед забегом' })),
  ...MODULES.map((m) => ({ key: 'mod_' + m.id, name: m.name, desc: m.desc, cls: 'rarD', label: 'Модуль звена', group: 'd', src: 'Ящики вдоль пути. Садится на каждое четвёртое звено тела' })),
  ...BEASTS.map((b) => ({ key: b.id, beast: b.kind, free: b.free, name: b.name, desc: b.desc, tip: b.tip, cls: b.kind === 'mob' ? 'rarM' : 'rarB', label: b.kind === 'mob' ? 'Враг' : 'Зверь', group: b.kind === 'mob' ? 'm' : 'b' })),
];
const ENTRY = Object.fromEntries(ENTRIES.map((e) => [e.key, e]));
const GROUPS = [['sp', 'Змеи'], ['r0', 'Обычные реликвии'], ['r1', 'Редкие реликвии'], ['r2', 'Легендарные реликвии'], ['r3', 'Лунные реликвии'], ['r4', 'Эволюции'], ['tr', 'Трофеи боссов'], ['a', 'Активные предметы'], ['p', 'Спутники'], ['d', 'Модули звеньев'], ['t', 'Артефакты'], ['m', 'Враги'], ['b', 'Звери']];

export class UI {
  constructor(game) {
    this.G = game;
    this.el = {};
    for (const id of ['hud', 'screen', 'h-lvl', 'h-hp', 'h-hpt', 'h-xp', 'h-sh', 'h-be', 'h-clock', 'h-thr', 'h-thrbar', 'relics', 'banner', 'boss', 'center', 'toasts', 'marks', 'dmg', 'prompt', 'vign', 'b-dash', 'b-whip', 'b-item', 'combo', 'sheet']) this.el[id] = $(id);
    this.itemList = []; this.itemKey = null;
    this.event = null;
    document.querySelectorAll('[data-ic]').forEach((e) => { e.innerHTML = svg(e.dataset.ic, Number(e.dataset.sz) || 18); e.style.display = 'grid'; });
    this.cache = {}; this.marks = []; this.wisp = null; this.centerT = 0; this.dmgPool = []; this.markEls = [];
    for (let i = 0; i < 26; i++) { const e = document.createElement('span'); this.el.dmg.appendChild(e); this.dmgPool.push({ e, t: 0, x: 0, y: 0, z: 0 }); }
    for (let i = 0; i < 7; i++) { const e = document.createElement('div'); e.className = 'mark'; e.innerHTML = '<i></i><b></b><span></span>'; this.el.marks.appendChild(e); this.markEls.push(e); }
    document.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-act]');
      if (!t) return;
      game.sound.init();
      game.act(t.dataset.act, t.dataset.arg);
    });
    // Карточка предмета открыта: стрелки листают, Esc закрывает — и до игры эти клавиши не доходят.
    window.addEventListener('keydown', (ev) => {
      if (this.el.sheet.hidden) return;
      if (ev.key === 'Escape') this.closeItem(); else if (ev.key === 'ArrowLeft') this.navItem(-1); else if (ev.key === 'ArrowRight') this.navItem(1); else return;
      ev.stopImmediatePropagation(); ev.preventDefault();
    }, true);
  }

  set(id, v) { if (this.cache[id] !== v) { this.cache[id] = v; this.el[id].textContent = v; } }
  css(id, prop, v) { const k = id + prop; if (this.cache[k] !== v) { this.cache[k] = v; this.el[id].style.setProperty(prop, v); } }
  hud(on) { this.el.hud.hidden = !on; if (!on) { this.prompt(null); this.banner(null); this.boss(null); this.el.center.hidden = true; } }

  // ---- HUD
  frame(dt) {
    const G = this.G, run = G.run, st = G.stats;
    if (!run) return;
    this.set('h-lvl', String(run.level));
    this.css('h-hp', 'width', clamp((run.hp / st.maxHp) * 100, 0, 100).toFixed(1) + '%');
    this.set('h-hpt', Math.ceil(run.hp) + (run.barrier >= 1 ? ' +' + Math.floor(run.barrier) : '') + ' / ' + st.maxHp);
    this.css('h-xp', 'width', clamp((run.xp / run.xpNext) * 100, 0, 100).toFixed(1) + '%');
    this.set('h-sh', String(run.shards));
    this.set('h-be', String(run.berries));
    this.set('h-clock', G.sky.clock());
    const nightKey = G.sky.night ? 'moon' : 'sun';
    if (this.cache.clockIcon !== nightKey) { this.cache.clockIcon = nightKey; $('h-clockicon').innerHTML = svg(nightKey, 16); }
    this.set('h-thr', G.threat.name);
    this.css('h-thrbar', 'width', clamp(((G.diff - 0.7) / 4.6) * 100, 4, 100).toFixed(0) + '%');
    this.css('hud', '--threat', ['#8fe0a0', '#d8e07a', '#ffc65c', '#ff9a4a', '#ff6a5a', '#d05cff'][G.threat.tier]);
    this.css('b-dash', '--cd', st.dashMax < 1 ? '1' : run.dashN > 0 ? '0' : clamp(run.dashCd / st.dashCd, 0, 1).toFixed(3));
    const dashText = st.dashMax > 1 ? 'Рывок ×' + run.dashN : st.dashMax < 1 ? 'Нет' : 'Рывок';
    if (this.cache.dashText !== dashText) { this.cache.dashText = dashText; this.el['b-dash'].lastElementChild.textContent = dashText; }
    this.css('b-whip', '--cd', clamp(run.whipCd / st.whipCd, 0, 1).toFixed(3));
    if (run.active) this.css('b-item', '--cd', clamp(run.activeCd / ACTIVE[run.active].cd, 0, 1).toFixed(3));
    this.css('vign', 'opacity', clamp(Math.max(run.hurtFlash * 2.2, run.hp < st.maxHp * 0.3 ? 0.35 + Math.sin(G.time * 5) * 0.12 : 0), 0, 1).toFixed(2));

    if (this.centerT > 0) { this.centerT -= dt; if (this.centerT <= 0) this.el.center.hidden = true; }
    // Серия побед: растёт, пока враги падают один за другим.
    const combo = run.combo >= 3 ? run.combo : 0;
    if (this.cache.comboN !== combo) {
      this.cache.comboN = combo;
      const c = this.el.combo;
      c.hidden = !combo;
      if (combo) { c.firstElementChild.textContent = '×' + combo; c.classList.remove('hit'); void c.offsetWidth; c.classList.add('hit'); }
    }
    if (combo) this.css('combo', '--left', clamp(run.comboT / 3.2, 0, 1).toFixed(2));

    // Числа урона плывут вверх над врагами.
    for (const d of this.dmgPool) {
      if (d.t <= 0) continue;
      d.t -= dt;
      if (d.t <= 0) { d.e.style.opacity = 0; continue; }
      const p = G.project(d.x, d.y + (0.7 - d.t) * 1.6, d.z);
      d.e.style.transform = `translate(${p.x.toFixed(0)}px, ${p.y.toFixed(0)}px)`;
      d.e.style.opacity = p.vis ? Math.min(1, d.t * 3) : 0;
    }

    // Указатели на ближайшие вызовы по краям экрана.
    // Артефакт «Мгла» прячет указатели на вызовы и события.
    const fog = run.arts.fog;
    const extra = [];
    if (G.map.compass) extra.push(G.map.compass);
    if (run.pin) extra.push({ x: run.pin.x, z: run.pin.z, icon: 'star', hex: 0xff7ab8 });
    const list = this.wisp ? [{ ...this.wisp, icon: 'wisps', hex: 0xffe066, hot: true }] : fog ? extra : (this.event ? [this.event, ...this.marks] : this.marks).concat(extra);
    const w = innerWidth, h = innerHeight, s = G.snake, fw = G.camFwd, rx = w / 2 - 34, ry = h / 2 - 96;
    for (let i = 0; i < this.markEls.length; i++) {
      const e = this.markEls[i], m = list[i];
      if (!m) { if (e.style.display !== 'none') e.style.display = 'none'; continue; }
      const dx = m.x - s.x, dz = m.z - s.z, d = Math.hypot(dx, dz);
      if (d < (m.hot ? 6 : 26)) { e.style.display = 'none'; continue; }
      const sx = dx * -fw.z + dz * fw.x, sy = dx * fw.x + dz * fw.z, a = Math.atan2(sx, sy);
      e.style.display = '';
      e.style.transform = `translate(${(w / 2 + Math.sin(a) * rx).toFixed(0)}px, ${(h / 2 - 20 - Math.cos(a) * ry).toFixed(0)}px)`;
      e.firstChild.style.transform = `rotate(${a.toFixed(2)}rad)`;
      if (e.dataset.icon !== m.icon) { e.dataset.icon = m.icon; e.children[1].innerHTML = svg(m.icon, 18); e.style.setProperty('--c', hexCss(m.hex)); }
      e.lastChild.textContent = Math.round(d) + ' м' + (m.note ? ' · ' + m.note : '');
      e.classList.toggle('hot', !!m.hot);
    }
  }

  /** Кнопка активного предмета: видна, только когда предмет есть. */
  itemButton() {
    const b = this.el['b-item'], a = ACTIVE[this.G.run.active];
    b.hidden = !a;
    if (a) b.innerHTML = `${pic('a_' + a.id, 38)}<span>${a.name}</span>`;
  }

  setMarks(list) { this.marks = list; }
  setWisp(w) { this.wisp = w; }
  setEvent(e) { this.event = e; }

  dmg(x, y, z, n, cause) {
    let d = this.dmgPool.find((q) => q.t <= 0);
    if (!d) d = this.dmgPool.reduce((a, b) => (a.t < b.t ? a : b));
    d.t = 0.7; d.x = x + (Math.random() - 0.5) * 0.6; d.y = y; d.z = z;
    d.e.textContent = n;
    d.e.className = cause === 'loop' ? 'big' : cause === 'crit' ? 'crit' : cause === 'bleed' ? 'bleed' : cause === 'poison' ? 'psn' : cause === 'zap' || cause === 'wisp' || cause === 'frost' ? 'zap' : cause === 'fire' || cause === 'boom' ? 'fire' : cause === 'spit' ? 'spit' : '';
  }

  toast(text, kind = '') {
    const e = document.createElement('div');
    e.className = 'toast ' + kind; e.textContent = text;
    this.el.toasts.appendChild(e);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
    setTimeout(() => e.classList.add('out'), 2600);
    setTimeout(() => e.remove(), 3100);
  }

  center(title, sub = '') {
    const c = this.el.center;
    c.firstElementChild.textContent = title; c.lastElementChild.textContent = sub;
    c.hidden = false; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
    this.centerT = 2.4;
  }

  banner(text) { const b = this.el.banner; if (text === null) { b.hidden = true; this.cache.banner = null; return; } b.hidden = false; this.set('banner', text); }
  boss(name, frac) {
    const b = this.el.boss;
    if (name === null) { b.hidden = true; return; }
    b.hidden = false; b.firstElementChild.textContent = name; b.lastElementChild.firstElementChild.style.width = (frac * 100).toFixed(1) + '%';
  }

  prompt(p) {
    const e = this.el.prompt;
    if (!p) { e.hidden = true; this.cache.prompt = ''; return; }
    const html = `<div class="p-head"><i>${p.pic ? pic(p.pic, 36) : svg(p.icon, 22)}</i><div><b>${esc(p.title)}</b><small>${esc(p.name)}</small></div></div>
      <p>${esc(p.desc)}</p><p class="p-rew">${esc(p.reward)}</p>
      ${p.can ? `<button class="btn primary" data-act="accept">${esc(p.btn)}<kbd>E</kbd></button>` : `<div class="p-no">${esc(p.why)}</div>`}`;
    // Перерисовываем только при изменении: иначе кнопка может смениться под пальцем и нажатие пропадёт.
    if (this.cache.prompt === html) return;
    this.cache.prompt = html;
    e.hidden = false; e.style.setProperty('--c', hexCss(p.hex));
    e.innerHTML = html;
  }

  relicRow() {
    const run = this.G.run;
    this.el.relics.innerHTML = Object.keys(run.relics).map((id) => {
      const r = RELIC[id], n = run.relics[id];
      return `<span class="rl rar${r.rar}" title="${esc(r.name)}">${pic(id, 24)}${n > 1 ? `<b>${n}</b>` : ''}</span>`;
    }).join('');
  }

  // ---- Экраны
  open(html, cls = '', keepScroll = false) { const s = this.el.screen, y = s.scrollTop; this.closeItem(); s.className = cls; s.innerHTML = html; s.hidden = false; s.scrollTop = keepScroll ? y : 0; }
  close() { this.closeItem(); this.el.screen.hidden = true; this.el.screen.innerHTML = ''; }

  showMenu() {
    const G = this.G, sv = G.save, st = sv.stats, wp = G.startPoints();
    // Картинки предметов подгружаем заранее, чтобы карточки выбора не появлялись пустыми.
    if (!this.preloaded) { this.preloaded = true; setTimeout(() => { for (const k of [...ENTRIES.map((e) => e.key), ...LEVELUPS.map((u) => u.id), ...PERMS.map((q) => q.id), 'x_cache', 'x_egg', 'x_shard']) new Image().src = `${IMG}${k}.webp`; }, 1200); }
    const start = wp[G.startIdx] || wp[0];
    this.open(`<div class="menu">
      <div class="title"><small>бесконечный архипелаг</small><h1>Змейка-<br>странник</h1></div>
      <div class="chips">
        <span class="chip">${svg('shard', 16)}<b>${sv.shards}</b></span>
        <span class="chip">забегов <b>${st.runs}</b></span>
        <span class="chip">аванпостов <b>${st.outposts}</b></span>
        ${sv.moons ? `<span class="chip moon">${svg('moon', 15)}<b>${sv.moons}</b></span>` : ''}
      </div>
      <div class="pick">
        <button class="sel" data-act="diff"><small>Тропа</small><b>${DIFFS[sv.diff].name}</b><span>${DIFFS[sv.diff].desc}</span></button>
        <button class="sel" data-act="startpt"><small>Откуда</small><b>${esc(start.name)}</b><span>${start.dist ? start.dist + ' м от начала мира' : 'Тихое место для первых шагов'}</span></button>
        ${(() => { const sp = SPECIES.find((q) => q.id === sv.species), open = SPECIES.filter((q) => !q.unlock || sv.ach[q.unlock]).length;
          return `<button class="sel ${sv.circle ? '' : 'wide'}" data-act="species"><small>Змея · открыто ${open} из ${SPECIES.length}</small><b>${pic('sp_' + sp.id, 26)}${sp.name}</b><span>${sp.desc}</span></button>`
            + (sv.circle ? `<button class="sel" data-act="circle"><small>Круг · открыто ${sv.circle + 1}</small><b>Круг ${sv.circleOn + 1}</b><span>${circleText(sv.circleOn)}</span></button>` : ''); })()}
        ${(() => {
          const own = ARTIFACTS.filter((a) => sv.arts[a.id]), on = ARTIFACTS.filter((a) => activeArts(sv)[a.id]);
          const text = !own.length ? 'Ищи руины с зелёным лучом' : on.length ? on.map((a) => (window.ui ? window.ui.t(a.name) : a.name)).join(', ') : 'Ни один не включён';
          return `<button class="sel wide" data-act="arts"><small>Артефакты · ${own.length} из ${ARTIFACTS.length}</small><b>${on.length ? 'Включено: ' + on.length : 'Правила забега'}</b><span>${text}</span></button>`;
        })()}
      </div>
      <button class="btn primary big" data-act="play">В путь</button>
      <div class="row">
        <button class="btn" data-act="shop">Улучшения</button>
        <button class="btn" data-act="journal">Журнал</button>
      </div>
      <div class="row icons">
        <button class="btn icon" data-act="sound" aria-label="Звук">${svg(sv.sound ? 'sound' : 'mute', 20)}</button>
        ${hasHub ? `<button class="btn icon" data-act="hubmenu" aria-label="Меню Игротеки: сохранения, настройки">${svg('dots', 20)}</button>` : ''}
        ${canExit ? `<button class="btn icon" data-act="exit" aria-label="Выйти">${svg('back', 20)}</button>` : ''}
      </div>
    </div>`, 'scr-menu');
  }

  showShop() {
    const sv = this.G.save;
    const perms = PERMS.map((p) => {
      const lvl = sv.perms[p.id] || 0, max = lvl >= p.max, cost = permCost(p, lvl);
      return `<div class="item"><i>${pic(p.id, 36)}</i><div class="grow"><b>${p.name}</b><small>${p.desc}</small>
        <div class="pips">${Array.from({ length: p.max }, (_, i) => `<u class="${i < lvl ? 'on' : ''}"></u>`).join('')}</div></div>
        ${max ? `<span class="done">${svg('check', 18)}</span>` : `<button class="btn buy" data-act="buy" data-arg="${p.id}" ${sv.shards < cost ? 'disabled' : ''}>${svg('shard', 14)}${cost}</button>`}</div>`;
    }).join('');
    const skins = SKINS.map((s) => {
      const own = sv.skins.includes(s.id), locked = s.unlock && !sv.ach[s.unlock], cur = sv.skin === s.id;
      const note = cur ? 'надета' : own ? 'надеть' : locked ? 'за стража' : s.cost;
      return `<button class="skin ${cur ? 'cur' : ''}" data-act="skin" data-arg="${s.id}" ${locked || (!own && sv.shards < s.cost) ? 'disabled' : ''}>
        <i style="background:linear-gradient(135deg, ${s.a}, ${s.b})"></i><b>${s.name}</b><small>${own || locked ? '' : svg('shard', 12)}${note}</small></button>`;
    }).join('');
    this.open(`<div class="panel"><header><button class="btn icon" data-act="menu" aria-label="Назад">${svg('back', 20)}</button><h2>Улучшения</h2>
      <span class="chip">${svg('shard', 16)}<b>${sv.shards}</b></span></header>
      <p class="lead">Осколки не пропадают после забега. То, что куплено здесь, остаётся навсегда.</p>
      <div class="list">${perms}</div><h3>Шкурки</h3><div class="skins">${skins}</div></div>`);
  }

  showArts() {
    const sv = this.G.save, on = activeArts(sv);
    let bonus = 0;
    const rows = ARTIFACTS.map((a) => {
      const own = !!sv.arts[a.id];
      if (on[a.id]) bonus += a.bonus;
      return `<button class="item art ${on[a.id] ? 'on' : ''} ${own ? '' : 'locked'}" ${own ? `data-act="art" data-arg="${a.id}"` : 'disabled'}>
        <i>${own ? pic('art_' + a.id, 36) : svg('lock', 22)}</i><div class="grow"><b>${own ? a.name : '???'}</b><small>${own ? a.desc + (a.bonus ? ` Осколков +${Math.round(a.bonus * 100)}%.` : '') : 'Спрятан в руинах. Сними печать — и он твой навсегда.'}</small></div>
        ${own ? `<span class="tog"></span>` : ''}</button>`;
    }).join('');
    this.open(`<div class="panel"><header><button class="btn icon" data-act="menu" aria-label="Назад">${svg('back', 20)}</button><h2>Артефакты</h2>
      ${bonus ? `<span class="chip">${svg('shard', 16)}<b>+${Math.round(bonus * 100)}%</b></span>` : ''}</header>
      <p class="lead">Каждый артефакт меняет правила следующего забега. Включай сколько хочешь — чем рискованнее, тем больше осколков.</p>
      <div class="list">${rows}</div></div>`);
  }

  // ---- Альманах
  /** Состояние предмета: заперт, ещё не попадался, сколько раз найден. */
  entryState(e) {
    const sv = this.G.save;
    if (e.art) return { locked: !sv.arts[e.art], n: sv.arts[e.art] ? 1 : 0 };
    if (e.species) { const open = !e.species.unlock || !!sv.ach[e.species.unlock]; return { locked: !open, n: open ? 1 : 0 }; }
    if (e.beast) { const n = e.free ? 1 : sv.bestiary[e.key] || 0; return { locked: !n, n }; }
    return { locked: !!(e.unlock && !sv.ach[e.unlock]), n: sv.seen[e.key] || 0 };
  }

  /** Плитка предмета. badge — что написать в уголке (по умолчанию — сколько раз найден). */
  tile(key, badge) {
    const e = ENTRY[key], st = this.entryState(e);
    if (badge !== undefined) st.locked = false;   // то, что уже с тобой в забеге, не прячем
    const b = badge !== undefined ? badge : st.n > 1 && !e.free ? '×' + st.n : '';
    return `<button class="tile ${e.cls} ${st.locked ? 'locked' : st.n || badge !== undefined ? '' : 'unseen'}" data-act="item" data-arg="${key}">
      ${pic(key, 72)}<b>${st.locked ? '???' : esc(e.name)}</b>${st.locked ? `<u>${svg('lock', 11)}</u>` : b ? `<u>${b}</u>` : ''}</button>`;
  }

  showItem(key) {
    const e = ENTRY[key];
    if (!e) return;
    const st = this.entryState(e), sh = this.el.sheet, G = this.G;
    if (!this.itemList.includes(key)) this.itemList = [key];
    this.itemKey = key;
    let meta;
    if (e.species) meta = st.locked ? `Откроется за достижение «${ACHS.find((q) => q.id === e.species.unlock).name}»: ${ACHS.find((q) => q.id === e.species.unlock).desc.toLowerCase()}.` : e.src + '.';
    else if (e.beast) meta = e.free ? '' : st.locked ? (e.beast === 'mob' ? 'Ещё не побеждён.' : 'Ещё не поймана добыча.') : (e.beast === 'mob' ? 'Побеждено: ' : 'Поймано: ') + st.n + '.';
    else if (st.locked && e.art) meta = 'Ещё не найден. ' + e.src + '.';
    else if (st.locked) { const ach = ACHS.find((q) => q.id === e.unlock); meta = `Заперта. Откроется за достижение «${ach.name}»: ${ach.desc.toLowerCase()}.`; }
    else if (e.art) meta = 'Найден. Включается перед забегом в меню.';
    else meta = (st.n ? `Попадалась ${st.n} ${plural(st.n, 'раз', 'раза', 'раз')}` : 'Ещё не попадалась') + '. ' + e.src + '.';
    const inRun = G.run && G.screenName === 'pause' && RELIC[key] ? (G.run.relics[key] || 0) : 0;
    const many = this.itemList.length > 1;
    sh.className = e.cls + (st.locked ? ' locked' : '');
    sh.innerHTML = `<div class="sheet-card" data-act="itemclose">
      <div class="sheet-pic">${pic(key, 184)}</div>
      <em>${st.locked && e.art ? 'Артефакт' : e.label}</em>
      <h2>${st.locked ? '???' : esc(e.name)}</h2>
      ${st.locked ? '' : `<p class="fx">${esc(e.desc)}</p><blockquote>${esc(e.tip || LORE[key] || '')}</blockquote>`}
      <small>${inRun ? `Сейчас с тобой: ${inRun}. ` : ''}${esc(meta)}</small>
      <div class="row">${many ? `<button class="btn icon" data-act="itemnav" data-arg="-1" aria-label="Предыдущий">${svg('back', 20)}</button>` : ''}
        <button class="btn" data-act="itemclose">Закрыть</button>
        ${many ? `<button class="btn icon flip" data-act="itemnav" data-arg="1" aria-label="Следующий">${svg('back', 20)}</button>` : ''}</div></div>`;
    sh.hidden = false;
  }

  navItem(d) {
    const L = this.itemList, i = L.indexOf(this.itemKey);
    if (i < 0 || L.length < 2) return;
    this.showItem(L[(i + d + L.length) % L.length]);
  }

  closeItem() { const sh = this.el.sheet; if (!sh.hidden) { sh.hidden = true; sh.innerHTML = ''; } this.itemKey = null; }

  showJournal(tab) {
    tab = tab || this.journalTab || 'almanac'; this.journalTab = tab;
    const sv = this.G.save, st = sv.stats;
    const tabs = [['almanac', 'Альманах'], ['achs', 'Достижения'], ['stats', 'Летопись']].map((t) => `<button class="tab ${t[0] === tab ? 'on' : ''}" data-act="journal" data-arg="${t[0]}">${t[1]}</button>`).join('');
    let body;
    if (tab === 'almanac') {
      const found = ENTRIES.filter((e) => this.entryState(e).n > 0).length;
      this.itemList = ENTRIES.map((e) => e.key);
      body = `<div class="prog-row"><b>Найдено ${found} из ${ENTRIES.length}</b><div class="prog"><i style="width:${(found / ENTRIES.length * 100).toFixed(1)}%"></i></div></div>
        <p class="lead">Всё, что можно встретить в пути. В цветной рамке — то, что уже попадалось; тёмное пока заперто. Нажми на предмет, чтобы рассмотреть.</p>
        ${GROUPS.map((g) => { const list = ENTRIES.filter((e) => e.group === g[0]); return `<h3>${g[1]} · ${list.filter((e) => this.entryState(e).n > 0).length} из ${list.length}</h3><div class="tiles">${list.map((e) => this.tile(e.key)).join('')}</div>`; }).join('')}`;
    } else if (tab === 'achs') {
      body = `<h3>Достижения · ${Object.keys(sv.ach).length} из ${ACHS.length}</h3><div class="list">${ACHS.map((a) => `<div class="ach ${sv.ach[a.id] ? 'on' : ''}"><i>${svg(sv.ach[a.id] ? 'check' : 'lock', 18)}</i><div><b>${a.name}</b><small>${a.desc}${a.gives ? ` · открывает: ${a.gives}` : ''}</small></div></div>`).join('')}</div>`;
    } else {
      const stats = [['Забегов', st.runs], ['Лучшее время', fmtTime(st.bestTime)], ['Лучший уровень', st.bestLevel], ['Самое длинное тело', st.maxLen],
        ['Ягод съедено', st.berries], ['Врагов побеждено', st.kills], ['Побед кольцом', st.loopKills], ['Вызовов принято', st.challenges],
        ['Аванпостов', st.outposts], ['Стражей', st.bosses], ['Дальше всего', st.farthest + ' м'], ['Осколков за всё время', st.shardsTotal],
        ['Событий', st.events], ['Лучшая серия', st.bestCombo], ['Артефактов', Object.keys(sv.arts).length + ' из ' + ARTIFACTS.length]];
      body = `<div class="grid">${stats.map((q) => `<div><small>${q[0]}</small><b>${q[1]}</b></div>`).join('')}</div>`;
    }
    this.open(`<div class="panel wide"><header><button class="btn icon" data-act="menu" aria-label="Назад">${svg('back', 20)}</button><h2>Журнал</h2></header>
      <div class="tabs">${tabs}</div>${body}</div>`);
  }

  /** Выбор одного из трёх: улучшение уровня или реликвия. */
  /** Строчки под карточкой реликвии: какой набор она двигает и какую эволюцию складывает. */
  hintFor(id) {
    const r = RELIC[id], R = this.G.run.relics;
    if (!r) return '';
    let out = '';
    if (r.tag) {
      const n = (tagCounts(R)[r.tag] || 0) + (R[id] ? 0 : 1), T = TAGS[r.tag], goal = n <= 3 || !T.s5 ? 3 : 5;
      out += `<s class="${n === 3 || (n === 5 && T.s5) ? 'hit' : ''}">${T.name} · ${Math.min(n, goal)} из ${goal}</s>`;
    }
    for (const ev of EVOS) {
      const i = ev.evo.indexOf(id);
      if (i >= 0 && !R[ev.id] && R[ev.evo[1 - i]]) out += `<s class="evo">Эволюция: с «${RELIC[ev.evo[1 - i]].name}» станет «${ev.name}»</s>`;
    }
    return out;
  }

  /** Наборы на экране паузы: что собрано и что это даёт. */
  buildExtra() {
    const T = tagCounts(this.G.run.relics), keys = Object.keys(T).sort((a, b) => T[b] - T[a]);
    if (!keys.length) return '';
    return `<h3>Наборы</h3><div class="sets">${keys.map((t) => { const n = T[t], S = TAGS[t];
      return `<div class="set ${n >= 3 ? 'on' : ''}"><b><span>${S.name}</span> · ${n}</b><small><span>${n >= 3 ? S.s3 : `Три разные — ${S.s3.charAt(0).toLowerCase() + S.s3.slice(1)}`}</span>${S.s5 ? '. <span>' + (n >= 5 ? S.s5 : `Пять — ${S.s5.charAt(0).toLowerCase() + S.s5.slice(1)}`) + '</span>' : ''}</small></div>`; }).join('')}</div>`;
  }

  showChoice(title, sub, options, rerolls = 0) {
    this.open(`<div class="choice"><h2>${esc(title)}</h2><p class="lead">${esc(sub)}</p><div class="cards">${options.map((o, i) =>
      `<button class="card rar${o.rar ?? 'x'}" data-act="pick" data-arg="${i}"><i>${o.pic ? pic(o.pic, 84) : svg(o.icon, 30)}</i><b>${esc(o.name)}</b>${o.rar !== undefined ? `<em>${KIND[o.rar]}</em>` : ''}<small>${esc(o.desc)}</small>${o.id ? this.hintFor(o.id) : ''}${o.have ? `<u>уже есть: ${o.have}</u>` : ''}</button>`).join('')}</div>
      ${rerolls ? `<button class="btn reroll" data-act="reroll">${pic('p_reroll', 28)}Перебросить · осталось ${rerolls}</button>` : ''}</div>`, 'scr-choice');
  }

  /** Экран забега: сборка, карта, числа, ход забега. Открывается паузой или клавишей Tab. */
  showPause(tab) {
    tab = tab || this.pauseTab || 'build'; this.pauseTab = tab;
    const G = this.G, run = G.run, sv = G.save, st = G.stats;
    const tabs = [['build', 'Сборка'], ['map', 'Карта'], ['stats', 'Числа'], ['run', 'Забег']].map((t) => `<button class="tab ${t[0] === tab ? 'on' : ''}" data-act="hub" data-arg="${t[0]}">${t[1]}</button>`).join('');
    const num = (v, d = 1) => (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toString().replace('.', window.__lang && window.__lang !== 'ru' ? '.' : ',');
    const pct = (v) => Math.round(v * 100) + '%';
    const grid = (rows) => `<div class="grid">${rows.map((q) => `<div><small>${q[0]}</small><b>${q[1]}</b></div>`).join('')}</div>`;
    let body;
    if (tab === 'build') {
      const ids = Object.keys(run.relics);
      this.itemList = ids.concat(run.active ? ['a_' + run.active] : [], G.pets.map((q) => 'pet_' + q.id), run.mods.map((q) => 'mod_' + q)).filter((k, i, arr) => arr.indexOf(k) === i);
      const slots = modSlots(G.snake.n);
      const relics = ids.map((id) => this.tile(id, run.relics[id] > 1 ? '×' + run.relics[id] : '')).join('');
      const ups = LEVELUPS.filter((u) => run.ups[u.id]).map((u) => `<span class="chip"><span>${u.name}</span> ×${run.ups[u.id]}</span>`).join('');
      body = `${this.buildExtra ? this.buildExtra() : ''}
        ${ups ? `<h3>Улучшения забега</h3><div class="chips wrap">${ups}</div>` : ''}
        ${run.active || G.pets.length ? `<h3>Активный предмет и спутники</h3><div class="tiles">${run.active ? this.tile('a_' + run.active, '') : ''}${G.pets.map((q) => this.tile('pet_' + q.id, q.immortal ? '' : '♥' + q.hp)).join('')}</div>` : ''}
        ${run.mods.length ? `<h3>Модули · работает ${Math.min(run.mods.length, slots)} из ${run.mods.length}</h3><div class="tiles">${run.mods.map((q, i) => this.tile('mod_' + q, i < slots ? 'звено ' + (4 + i * 4) : 'ждёт')).join('')}</div>` : ''}
        <h3>Реликвии</h3>${relics ? `<div class="tiles">${relics}</div>` : '<p class="lead">Пока ни одной. Реликвии дают за вызовы: ищи лучи света.</p>'}`;
    } else if (tab === 'map') {
      body = `<canvas id="bigmap" width="640" height="640"></canvas>
        <div class="row"><button class="btn" data-act="mapzoom" data-arg="-1">Приблизить</button><button class="btn" data-act="mapzoom" data-arg="1">Отдалить</button>${run.pin ? '<button class="btn" data-act="unpin">Снять метку</button>' : ''}</div>
        <p class="lead">Север сверху, видно только разведанное — оно сохраняется между забегами. Нажми на карту, чтобы поставить метку: на неё покажет стрелка.</p>
        <div class="legend"><span><i style="background:#fff"></i>начало мира</span><span><i style="background:#6fe3ff"></i>пройденный аванпост</span><span><i style="background:#ff7ab8"></i>твоя метка</span><span><i style="background:#5b6670"></i>пройдено</span><span><i style="background:#ffc94a"></i>цветные — вызовы</span></div>`;
    } else if (tab === 'stats') {
      body = `<h3>Тело</h3>${grid([['Здоровье', Math.ceil(run.hp) + ' / ' + st.maxHp], ['Восстановление', num(st.regen) + ' в с'], ['Урон по тебе', pct(st.armor)], ['Уклонение', pct(st.dodge)],
        ['Скорость', num(st.speed)], ['Длина тела', Math.floor(run.len)], ['Радиус сбора', num(st.pickR)], ['Удача', '×' + num(st.luck, 2)]])}
        <h3>Атака</h3>${grid([['Укус', num(st.bite)], ['Укусов в секунду', num(1 / st.biteCd)], ['Плевок', num(st.spit)], ['Залпов в секунду', num(1 / st.spitCd)], ['Плевков в залпе', st.shots],
        ['Критический удар', pct(st.crit) + ' · ×' + num(st.critMul)], ['Хвост', '×' + num(st.whipMul) + ' · ' + num(st.whipCd) + ' с'], ['Рывок', '×' + num(st.dashMul) + ' · ' + num(st.dashCd) + ' с'],
        ['Зарядов рывка', st.dashMax], ['Кольцо', '×' + num(st.loopMul)]])}
        <h3>Добыча</h3>${grid([['Осколки', '×' + num(st.shardMul, 2)], ['Опыт', '×' + num(st.xpMul * (1 + G.petXp), 2)], ['Ягода лечит', num(st.berryHeal)], ['Цена тайников', pct(st.cachePrice)]])}`;
    } else {
      const arts = ARTIFACTS.filter((q) => run.arts[q.id]).map((q) => `<span class="chip">${q.name}</span>`).join('');
      body = grid([['Время', fmtTime(run.t)], ['Сейчас', G.sky.night ? 'ночь' : 'день'], ['Угроза', G.threat.name], ['Круг', run.loop + 1], ['Уровень', run.level], ['Побед', run.kills],
        ['Лучшая серия', run.bestCombo], ['Вызовов пройдено', run.challenges], ['Тайников открыто', run.caches], ['Змея', SPECIES.find((q) => q.id === run.species).name], ['Мир', 'круг ' + (run.circle + 1)], ['Проклятий', run.curses], ['Перебросов осталось', run.rerolls], ['Ступень карты', G.map.level() + ' из 5']])
        + (arts ? `<h3>Артефакты забега</h3><div class="chips wrap">${arts}</div>` : '')
        + `<h3>Управление</h3><p class="lead">Джойстик или WASD — ползти. Рывок — пробел. Хвост — Shift. Активный предмет — Q. Принять вызов, открыть тайник — E. Карта и этот экран — Tab или M. Свайп или мышь — камера. Обведи врагов телом и коснись головой хвоста — кольцо ударит всех внутри.</p>`;
    }
    this.open(`<div class="panel ${tab === 'map' ? '' : 'narrow'}"><header><h2>Пауза</h2><span class="chip">${fmtTime(run.t)}</span></header>
      <button class="btn primary big" data-act="resume">Продолжить</button>
      <div class="row"><button class="btn" data-act="sound">${svg(sv.sound ? 'sound' : 'mute', 18)} Звук</button><button class="btn danger" data-act="quit">Закончить забег</button></div>
      <div class="tabs">${tabs}</div>${body}</div>`);
    if (tab === 'map') {
      const cv = $('bigmap'), at = G.map.drawBig(cv, this.mapR || 420);
      cv.onclick = (ev) => { const r = cv.getBoundingClientRect(), q = at(((ev.clientX - r.left) / r.width) * cv.width, ((ev.clientY - r.top) / r.height) * cv.height); run.pin = { x: q.x, z: q.z }; this.showPause('map'); };
    }
  }

  showResult(r) {
    const rows = [['Время', fmtTime(r.time)], ['Уровень', r.level], ['Длина тела', r.len], ['Ягод', r.berries], ['Побеждено врагов', r.kills], ['Лучшая серия', r.combo], ['Вызовов', r.challenges], ['Ушла от начала', r.far + ' м']];
    this.open(`<div class="panel narrow result"><h2>${r.quit ? 'Забег окончен' : 'Змейка уснула'}</h2>
      <div class="earn">${pic('x_shard', 56)}<b>+${r.shards}</b><small>осколков остаются с тобой</small></div>
      <div class="grid">${rows.map((s) => `<div><small>${s[0]}</small><b>${s[1]}</b></div>`).join('')}</div>
      ${r.unlocks.length ? `<h3>Открыто</h3><div class="list">${r.unlocks.map((a) => `<div class="ach on"><i>${svg('check', 18)}</i><div><b>${a.name}</b><small>${a.gives ? 'Теперь доступно: ' + a.gives : a.desc}</small></div></div>`).join('')}</div>` : ''}
      <button class="btn primary big" data-act="play">Ещё забег</button>
      <div class="row"><button class="btn" data-act="shop">Улучшения</button><button class="btn" data-act="menu">В меню</button></div></div>`);
  }
}
