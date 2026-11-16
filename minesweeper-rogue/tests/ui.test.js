'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const {load, GAME} = require('./helpers');
const x = load();

class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.events = {};
    this.className = '';
    this.clientWidth = 336;
    this.clientHeight = 530;
    this.offsetHeight = 42;
    this.style = {setProperty: (k, v) => { this.style[k] = v; }};
    this.classList = {
      add: (...names) => names.forEach(n => this.classList.toggle(n, true)),
      toggle: (name, on) => {
        const classes = new Set(this.className.split(' ').filter(Boolean));
        if (on) classes.add(name); else classes.delete(name);
        this.className = Array.from(classes).join(' ');
      }
    };
  }
  append(...nodes) {
    nodes.flat().filter(n => n !== null && n !== undefined).forEach(n => {
      if (typeof n !== 'object') { const child = new Element('#text'); child.textContent = String(n); n = child; }
      n.parent = this; this.children.push(n);
      if (this.tagName === 'select' && (this.value === undefined || n.selected)) this.value = n.value;
    });
  }
  replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return (this._text || '') + this.children.map(n => n.textContent).join(''); }
  set innerHTML(value) { this._html = value; this.children = []; }
  get innerHTML() { return this._html || ''; }
  setAttribute(key, value) {
    this.attributes[key] = String(value);
    if (key.startsWith('data-')) this.dataset[key.slice(5)] = String(value);
  }
  addEventListener(name, fn) { (this.events[name] ||= []).push(fn); }
  async fire(name, props = {}) {
    const e = Object.assign({target: this, button: 0, detail: 1, pointerId: 1, clientX: 50, clientY: 50, preventDefault() {}}, props);
    if (this['on' + name]) await this['on' + name](e);
    for (const fn of this.events[name] || []) await fn(e);
  }
  closest(selector) { return this.className.split(' ').includes(selector.slice(1)) ? this : this.parent && this.parent.closest(selector); }
  querySelectorAll(selector) { return this.children.flatMap(n => (n.tagName === selector ? [n] : []).concat(n.querySelectorAll(selector))); }
  focus() { this.focused = true; }
}
function h(tag, attrs, ...children) {
  const el = new Element(tag);
  Object.entries(attrs || {}).forEach(([k, v]) => {
    if (k === 'class') el.className = v;
    else if (k.startsWith('data-') || k.startsWith('aria-')) el.setAttribute(k, v);
    else el[k] = v;
  });
  el.append(...children); return el;
}
async function screen() {
  const root = new Element('body');
  const win = new Element('window');
  const timers = new Map(); let clock = 0; let timerId = 0;
  const saves = []; const workers = []; const toasts = [];
  const state = x.fresh(19);
  let opts;
  const game = {
    state, config: x.cfg, rng: x.Rng.make(19), game: x.game,
    el: Object.fromEntries(['app', 'top', 'field', 'actions'].map(k => [k, new Element('div')])),
    fmt: Object.assign(String, {pct: v => v * 100 + '%'}),
    links: {status: () => ({}), spend: async () => ({ok: true})},
    stock: {take: async () => null},
    on() {}, sfx() {}, buzz() {}, achieve() {}, log() {},
    act(fn, options) { const result = fn(state, game); saves.push(options); opts.render(state); return result; },
    redraw() { opts.render(state); },
    ui: {
      hold(el, ms, fn) { el._hold = fn; },
      prestigeButton() { return h('button', {}, 'Глубина'); },
      line(k, v) { return h('div', {}, k, v); },
      achievements() {}
    },
    sheet(el, close) {
      root.append(el);
      return () => { root.children = root.children.filter(n => n !== el); close(); };
    }
  };
  root.append(game.el.app);
  game.el.app.append(game.el.top, game.el.field, game.el.actions);
  class Worker {
    constructor() { this.messages = []; workers.push(this); }
    postMessage(data) { this.messages.push(data); }
    terminate() {}
  }
  const icons = {add() {}, el: () => h('svg'), svg: () => '<svg></svg>'};
  Object.assign(win, {GameSim: x.sim, MineBoard: x.env.require('modules/games/minesweeper-rogue/logic/board.js'), Worker, innerWidth: 344});
  const context = {
    window: win, document: {body: root}, GameIcons: icons, Big: x.Big, Worker,
    ui: {h, toast: text => toasts.push(text)},
    Game: {start: async options => { opts = options; options.init(game); options.render(state); return game; }},
    fetch: async file => ({ok: true, json: async () => JSON.parse(fs.readFileSync(path.resolve(GAME, 'ui', file), 'utf8'))}),
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, {fn, at: clock + ms}); return id; },
    clearTimeout: id => timers.delete(id),
    console
  };
  // the pictures first, as ui/index.html loads them: art.js needs only window
  vm.runInNewContext(fs.readFileSync(path.join(GAME, 'ui/art.js'), 'utf8'), context);
  await vm.runInNewContext(fs.readFileSync(path.join(GAME, 'ui/game.js'), 'utf8'), context);
  assert.equal(root.children.some(n => n.className === 'g-error'), false, root.textContent);
  function get(id) {
    function find(el) { if (el.id === id) return el; for (const child of el.children) { const found = find(child); if (found) return found; } return null; }
    return find(root);
  }
  function elAt(i) { return get('board').children[i]; }
  async function advance(ms) {
    clock += ms;
    for (const [id, task] of [...timers]) if (task.at <= clock && timers.has(id)) { timers.delete(id); await task.fn(); }
  }
  async function pointer(i, distance = 0, hold = 0) {
    await get('board').fire('pointerdown', {target: elAt(i)});
    if (distance) await win.fire('pointermove', {target: elAt(i), clientY: 50 + distance});
    if (hold) await advance(hold);
    await win.fire('pointerup', {target: elAt(i), clientY: 50 + distance});
  }
  return {game, state, get, elAt, pointer, advance, win, saves, workers, toasts};
}

test('UI: tap, 300 ms hold, double flags and immediate saving use the real sim', async () => {
  const s = await screen();
  await s.get('event-action').fire('click');
  assert.equal(s.state.run.status, 'playing');
  await s.pointer(31);
  assert.equal(s.state.run.field.generated, true);
  const hidden = s.state.run.field.vis.indexOf('-');
  const before = s.state.run.actions;
  await s.pointer(hidden, 0, 300);
  assert.equal(s.state.run.field.vis[hidden], 'f');
  assert.equal(s.state.run.actions, before + 1, 'long hold does not also open on release');
  s.state.run.field.doubles = 1;
  await s.pointer(hidden, 0, 300);
  assert.equal(s.state.run.field.vis[hidden], 'F');
  await s.pointer(hidden, 0, 300);
  assert.equal(s.state.run.field.vis[hidden], '-');
  assert.ok(s.saves.every(o => o.now === true));
});

test('UI: scrolling over 8 px, off-board release and pointercancel cannot open cells', async () => {
  const s = await screen();
  await s.get('event-action').fire('click');
  await s.pointer(31, 9, 400);
  assert.equal(s.state.run.field.generated, false);
  await s.get('board').fire('pointerdown', {target: s.elAt(31)});
  await s.win.fire('pointerup', {clientY: 90});
  assert.equal(s.state.run.field.generated, false);
  await s.get('board').fire('pointerdown', {target: s.elAt(31)});
  await s.get('board').fire('pointercancel');
  await s.advance(400);
  await s.win.fire('pointerup');
  assert.equal(s.state.run.field.generated, false);
  await s.pointer(31, 8);
  assert.equal(s.state.run.field.generated, true);
});

test('UI: without «Лёгкая рука» there is no flag mode: a tap opens, a hold flags', async () => {
  const s = await screen();
  await s.get('event-action').fire('click');
  await s.pointer(31);
  assert.equal(s.get('mode-flag').hidden, true);
  s.state.run.inputMode = 'flag';
  s.game.redraw();
  const safe = x.sim.logicalHints(s.state, x.cfg).safe[0];
  assert.notEqual(safe, undefined);
  await s.pointer(safe);
  assert.equal(s.state.run.field.vis[safe], 'o', 'касание без талисмана открывает');
});

test('UI: «Лёгкая рука» flag mode reverses tap/hold and keyboard F still flags', async () => {
  const s = await screen();
  await s.get('event-action').fire('click');
  await s.pointer(31);
  s.state.run.talismans.push('light-hand');
  s.game.redraw();
  assert.equal(s.get('mode-flag').hidden, false);
  await s.get('mode-flag').fire('click');
  const hidden = s.state.run.field.vis.indexOf('-');
  await s.pointer(hidden);
  assert.equal(s.state.run.field.vis[hidden], 'f');
  await s.get('board').fire('keydown', {target: s.elAt(hidden), key: 'F'});
  assert.equal(s.state.run.field.vis[hidden], '-');
  const safe = x.sim.logicalHints(s.state, x.cfg).safe[0];
  assert.notEqual(safe, undefined);
  await s.pointer(safe, 0, 300);
  assert.equal(s.state.run.field.vis[safe], 'o');
});

test('UI: after Rock the shop can continue deeper with the current equipment', async () => {
  const s = await screen();
  await s.get('event-action').fire('click');
  Object.assign(s.state.run, {status: 'shop', completed: 6, fieldIndex: 5, tools: {probe: 2}, talismans: ['oak']});
  s.game.redraw();
  await s.get('event-action').fire('click');
  assert.equal(s.get('next-field').textContent, 'К хозяину');
  await s.get('continue-deep').fire('click');
  assert.equal(s.state.run.mode, 'deep');
  assert.equal(s.state.run.fieldIndex, 6);
  assert.equal(s.state.run.tools.probe, 2);
  assert.ok(s.state.run.talismans.includes('oak'));
});

test('UI: tapping an open number chords its safe neighbors even in flag mode', async () => {
  const s = await screen();
  await s.get('event-action').fire('click');
  await s.pointer(31);
  const field = s.state.run.field;
  const board = x.sim.model(s.state, x.cfg);
  const number = board.nb.findIndex((neighbors, i) => field.vis[i] === 'o' && board.sum[i] > 0 && neighbors.some(n => field.vis[n] === '-' && board.m[n] === '.'));
  assert.ok(number >= 0);
  for (const i of board.nb[number]) if (board.m[i] !== '.' && board.m[i] !== 'h') x.sim.flag(s.state, i, x.cfg);
  const safe = board.nb[number].find(i => field.vis[i] === '-' && board.m[i] === '.');
  s.state.run.talismans.push('light-hand');
  s.game.redraw();
  await s.get('mode-flag').fire('click');
  await s.pointer(number);
  assert.equal(field.vis[safe], 'o');
});

test('UI: worker prepares both next fields and saves its returned layouts immediately', async () => {
  const s = await screen();
  await s.get('event-action').fire('click');
  await s.pointer(31);
  await s.advance(0);
  const worker = s.workers[0];
  const plan = worker.messages.at(-1);
  assert.equal(plan.type, 'prepare');
  assert.equal(plan.jobs.length, 2);
  assert.ok(plan.jobs.every(j => j.starts.length === j.spec.w * j.spec.h));
  const job = plan.jobs[0];
  const board = s.win.MineBoard.generate(job.spec, job.seed, job.starts[0], job.options);
  worker.onmessage({data: {type: 'field', key: job.key, start: job.starts[0], field: board}});
  worker.onmessage({data: {type: 'done'}});
  assert.equal(s.state.run.pregen.length, 1);
  assert.equal(s.saves.at(-1).reason, 'запас полей');
  assert.equal(s.saves.at(-1).now, true);
});

test('UI: daily fallback uses wall time and steps cannot consume energy twice', async () => {
  const s = await screen();
  await s.get('expedition-menu').fire('click');
  s.get('run-mode').value = 'daily';
  await s.get('run-mode').fire('change');
  await s.get('start-run').fire('click');
  assert.equal(s.state.run.daily.id, x.sim.dailyFor(Date.now()).id);
  await s.get('expedition-menu').fire('click');
  let spends = 0;
  s.game.links.spend = async () => { spends++; return {ok: true}; };
  await s.get('steps-probe').fire('click');
  await s.get('steps-probe').fire('click');
  assert.equal(spends, 1);
  assert.equal(s.state.meta.nextProbe, true);
});

test('UI: rejected stock fetch recovers and does not end the current run', async () => {
  const s = await screen();
  await s.get('event-action').fire('click');
  await s.pointer(31);
  await s.get('expedition-menu').fire('click');
  s.get('run-mode').value = 'daily';
  await s.get('run-mode').fire('change');
  const before = JSON.stringify(s.state.run);
  s.game.stock.take = async () => { throw new Error('offline stock unavailable'); };
  await s.get('start-run')._hold();
  assert.equal(JSON.stringify(s.state.run), before);
  assert.ok(s.toasts.includes('Не удалось начать забег'));
  s.game.stock.take = async () => null;
  await s.get('start-run')._hold();
  assert.equal(s.state.run.mode, 'daily');
});

test('UI: English dictionary covers the manifest, content, and every named setting', () => {
  const dictionary = JSON.parse(fs.readFileSync(path.join(GAME, 'i18n-en.json'), 'utf8'));
  const strings = new Set();
  function scan(value) {
    if (typeof value === 'string' && /[А-Яа-яЁё]/.test(value)) strings.add(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(scan);
  }
  scan(JSON.parse(fs.readFileSync(path.join(GAME, 'game.json'), 'utf8')));
  scan(JSON.parse(fs.readFileSync(path.join(GAME, 'config.json'), 'utf8')));
  fs.readdirSync(path.join(GAME, 'content')).filter(name => name.endsWith('.json')).forEach(name => {
    scan(JSON.parse(fs.readFileSync(path.join(GAME, 'content', name), 'utf8')));
  });
  assert.deepEqual([...strings].filter(text => !dictionary[text]), []);
  assert.ok(Object.values(dictionary).every(text => typeof text === 'string' && text.length));
});
