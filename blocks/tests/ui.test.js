// DOM wiring smoke checks. This deliberately does not emulate layout or replace a real-device check.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('node:assert/strict');
const { HUB, GAME } = require('../tools/hub.js');
const { test, done } = require(path.join(process.env.AXIKO_ROOT || path.resolve(__dirname, '../../../Axiko'), 'scripts/games/harness.js'));

class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.listeners = {};
    this.className = '';
    this._text = '';
    this.disabled = false;
    this.hidden = false;
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: name => { if (!this.classList.contains(name)) this.className += ' ' + name; },
      toggle: (name, force) => {
        const on = force === undefined ? !this.classList.contains(name) : force;
        this.className = this.className.split(/\s+/).filter(x => x && x !== name).concat(on ? name : []).join(' ');
        return on;
      }
    };
  }
  append(...items) {
    items.flat(Infinity).forEach(item => {
      if (item === null || item === undefined || item === false) return;
      if (!(item instanceof Element)) { const node = new Element('#text'); node._text = String(item); item = node; }
      if (item.tagName === '#FRAGMENT') return this.append(...item.children.slice());
      item.parentNode = this;
      this.children.push(item);
    });
  }
  prepend(...items) { const old = this.children; this.children = []; this.append(...items); this.children.push(...old); }
  replaceChildren(...items) { this.children = []; this._text = ''; this.append(...items); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(item => item !== this); }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(item => item.textContent).join(''); }
  setAttribute(key, value) { this.attributes[key] = String(value); if (key === 'class') this.className = String(value); }
  getAttribute(key) { return this.attributes[key]; }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  fire(name, event = {}) { for (const fn of this.listeners[name] || []) fn(Object.assign({ target: this, button: 0, preventDefault() {} }, event)); }
  getBoundingClientRect() { return { left: 10, top: 150, width: 320, height: 320, right: 330, bottom: 470 }; }
  getContext() { return new Proxy({}, { get: (target, key) => target[key] || (() => {}), set: (target, key, value) => { target[key] = value; return true; } }); }
  setPointerCapture() {}
  scrollIntoView() {}
}

function walk(root, predicate) {
  const found = [];
  function visit(node) { if (predicate(node)) found.push(node); node.children.forEach(visit); }
  visit(root);
  return found;
}

async function screen() {
  const body = new Element('body');
  const docListeners = {};
  const winListeners = {};
  let game;
  let options;
  let sheet;
  const achievements = [];
  const notices = [];
  const document = {
    body,
    createElement: tag => new Element(tag),
    createDocumentFragment: () => new Element('#fragment'),
    getElementById: id => walk(body, node => node.id === id)[0],
    addEventListener: (name, fn) => { (docListeners[name] ||= []).push(fn); }
  };
  function h(tag, attrs, ...children) {
    const el = new Element(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
      else if (key === 'class') el.className = value;
      else if (key === 'style') el.style.cssText = value;
      else el[key] = value;
    }
    el.append(...children);
    return el;
  }
  const config = Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(path.join(GAME, 'config.json'), 'utf8'))).map(([key, entry]) => [key, entry.value]));
  const context = {
    console,
    document,
    Node: Element,
    performance: { now: () => 0 },
    setTimeout: () => 1,
    clearTimeout() {},
    requestAnimationFrame() {},
    ResizeObserver: class { observe() {} },
    location: { reload() {} },
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: true }),
    addEventListener: (name, fn) => { (winListeners[name] ||= []).push(fn); },
    ui: { h, toast: text => notices.push(text), t: text => text },
    GameIcons: { add() {}, el: () => h('svg', { class: 'i' }) },
    fetch: async url => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(GAME, 'ui', url), 'utf8')) })
  };
  context.window = context;
  context.Game = {
    start: async opts => {
      options = opts;
      const state = context.GameSim.init({ config, rng: context.Rng.make(42), now: 0 });
      state.layers.rank = { currency: '0', count: 0, state: {} };
      const fmt = value => context.Fmt.num(value);
      fmt.mult = value => context.Fmt.mult(value);
      fmt.time = value => context.Fmt.time(value);
      const areas = {};
      for (const key of ['app', 'bar', 'top', 'field', 'actions']) areas[key] = h('div', { class: 'g-' + key });
      areas.app.append(areas.bar, areas.top, areas.field, areas.actions);
      body.append(areas.app);
      game = {
        state,
        config,
        rng: context.Rng.make(42),
        fmt,
        el: areas,
        act: fn => { const out = fn(state); opts.render(state); return out; },
        redraw: () => opts.render(state),
        on() {},
        sfx() {},
        buzz() {},
        achieve: id => { achievements.push(id); },
        stock: { take: async () => null },
        links: { mult: () => 1, spend: async () => ({ ok: true }) },
        sheet: (content, close) => { sheet = content; body.append(content); return () => { content.remove(); if (sheet === content) sheet = null; close(); }; },
        ui: {
          hold: (button, delay, fn) => button.addEventListener('hold', fn),
          line: (key, val) => h('div', {}, key, val),
          prestigeButton: () => h('button', {}, 'Ранг мастера'),
          achievements() {}
        }
      };
      context.__game = game;
      opts.init(game);
      opts.render(state);
      return game;
    }
  };
  vm.createContext(context);
  for (const name of ['big', 'fmt', 'rng']) vm.runInContext(fs.readFileSync(path.join(HUB, 'engine', name + '.js'), 'utf8'), context);
  for (const name of ['board', 'levels', 'sim']) vm.runInContext(fs.readFileSync(path.join(GAME, name + '.js'), 'utf8'), context);
  // The screen's own pictures load before it, as in ui/index.html.
  vm.runInContext(fs.readFileSync(path.join(GAME, 'ui', 'art.js'), 'utf8'), context);
  await vm.runInContext(fs.readFileSync(path.join(GAME, 'ui', 'game.js'), 'utf8'), context);
  assert(game, 'Game.start must succeed');
  assert(!walk(body, node => node.classList.contains('g-error')).length, 'No startup error');
  return {
    game,
    context,
    body,
    achievements,
    notices,
    get sheet() { return sheet; },
    all: className => walk(body, node => node.classList.contains(className)),
    click: (text, root = body) => {
      const el = walk(root, node => node.tagName === 'BUTTON' && node.textContent === text)[0];
      assert(el, 'Button exists: ' + text);
      assert(!el.disabled, 'Button enabled: ' + text);
      el.fire('click');
      return el;
    },
    emit: (target, type, event) => (target === 'window' ? winListeners : docListeners)[type].forEach(fn => fn(event)),
    render: () => options.render(game.state)
  };
}

test('screen starts and wires all tray and tool controls', async () => {
  const s = await screen();
  s.click('Начать партию');
  assert.equal(s.game.state.run.game.n, 8);
  assert.equal(s.all('b-tray-piece').length, 3);
  assert.equal(s.all('b-tool').length, 8);
  assert.equal(s.all('b-board').length, 1);
});

test('tap selection places a real piece using the board API', async () => {
  const s = await screen();
  s.click('Начать партию');
  const game = s.game.state.run.game;
  const piece = game.tray[0];
  const pos = s.context.BlocksBoard.places(game.b[0], piece)[0];
  s.all('b-tray-piece')[0].fire('click');
  s.all('b-board')[0].fire('click', { clientX: 10 + (pos[1] + .5) * 40, clientY: 150 + (pos[0] + .5) * 40 });
  assert.equal(game.score, piece.c.length * s.game.config['score.cell']);
  assert.equal(game.tray[0], null);
});

test('drag shows the 64px lift and places at the displayed preview', async () => {
  const s = await screen();
  s.click('Начать партию');
  const game = s.game.state.run.game;
  const piece = game.tray[0];
  const b = s.context.BlocksBoard.bounds(piece.c);
  s.all('b-tray-piece')[0].fire('pointerdown', { clientX: 60, clientY: 600, pointerId: 1 });
  const x = 10 + b.w * 20;
  const y = 150 + 64 + b.h * 40;
  s.emit('window', 'pointermove', { clientX: x, clientY: y, pointerId: 1, preventDefault() {} });
  assert.equal(s.all('b-drag')[0].style.top, '150px');
  s.emit('window', 'pointerup', { clientX: x, clientY: y, pointerId: 1 });
  assert.equal(game.tray[0], null);
  assert(game.score > 0);
});

test('keyboard selects a tray piece and places it with Enter', async () => {
  const s = await screen();
  s.click('Начать партию');
  const game = s.game.state.run.game;
  const board = s.all('b-board')[0];
  s.emit('document', 'keydown', { key: '1', target: s.body, preventDefault() {} });
  board.fire('focus');
  s.emit('document', 'keydown', { key: 'ArrowRight', target: board, preventDefault() {} });
  s.emit('document', 'keydown', { key: 'Enter', target: board, preventDefault() {} });
  assert.equal(game.tray[0], null);
  assert(game.score > 0);
});

test('shop exposes 20 upgrades and 8 consumables and purchases a charge', async () => {
  const s = await screen();
  s.click('Начать партию');
  s.game.state.run.coins = '100000';
  s.click('Улучшения');
  assert.equal(s.all('b-upgrade').length, 20);
  assert.equal(s.all('b-supply').length, 8);
  const buy = walk(s.all('b-upgrade')[0], n => n.classList.contains('b-buy'))[0];
  buy.fire('click');
  assert.equal(s.game.state.run.up.rotate, 1);
  assert.equal(s.game.state.run.game.ch.rotate, 1);
  const supply = walk(s.all('b-supply')[0], n => n.classList.contains('b-buy'))[0];
  supply.fire('click');
  assert.equal(s.game.state.meta.blocks.supply.rotate, 1);
});

test('master screen selects a permanent charge and theme', async () => {
  const s = await screen();
  s.game.state.layers.rank.currency = '10';
  s.game.state.layers.rank.count = 4;
  s.click('Мастер');
  s.click('Поворот · 0', s.sheet);
  assert.equal(s.game.state.meta.blocks.picks.rotate, 1);
  const themes = walk(s.sheet, n => n.tagName === 'BUTTON' && n.textContent.startsWith('Глина'));
  assert.equal(themes.length, 1);
  themes[0].fire('click');
  assert.equal(s.game.state.meta.blocks.theme, 'clay');
});

test('daily mode launches with deterministic date and hides locked preview', async () => {
  const s = await screen();
  s.click('Задача дня');
  const game = s.game.state.run.game;
  assert.equal(game.mode, 'daily');
  assert.match(game.day, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(s.all('b-next-compact')[0].children.length, 0);
});

test('challenge UI follows the prescribed queue and awards completion', async () => {
  const s = await screen();
  s.click('Испытания · 0 / 60');
  const choice = walk(s.sheet, n => n.tagName === 'BUTTON' && n.textContent.startsWith('01'))[0];
  choice.fire('click');
  const game = s.game.state.run.game;
  assert(game, s.notices.join('; '));
  assert.equal(game.mode, 'challenge');
  const catalogue = JSON.parse(fs.readFileSync(path.join(GAME, 'content/challenges.json'), 'utf8'));
  const level = s.context.BlocksLevels.generate(catalogue.levels[0].seed, catalogue.levels[0]);
  for (const [r, c] of level.moves) {
    s.all('b-tray-piece')[0].fire('click');
    s.all('b-board')[0].fire('click', { clientX: 10 + (c + .5) * 40, clientY: 150 + (r + .5) * 40 });
  }
  assert.equal(game.done, true);
  assert.equal(s.game.state.meta.blocks.chal.done[1], 1);
  assert(s.all('b-success')[0].textContent.includes('Испытание пройдено'));
});

test('all verified catalogue and content strings have English translations', () => {
  const dict = JSON.parse(fs.readFileSync(path.join(GAME, 'i18n-en.json'), 'utf8'));
  for (const name of ['upgrades', 'themes', 'events', 'ranks', 'challenges']) {
    const parsed = JSON.parse(fs.readFileSync(path.join(GAME, 'content', name + '.json'), 'utf8'));
    for (const entry of Array.isArray(parsed) ? parsed : parsed.levels) {
      for (const key of ['title', 'text', 'description']) if (entry[key]) assert(dict[entry[key]], name + ': ' + entry[key]);
    }
  }
});

done('blocks UI (DOM wiring, not browser layout)');
