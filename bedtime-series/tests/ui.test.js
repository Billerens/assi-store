// Run the actual page script; DOM replaceChildren converts null to visible text, unlike ui.h.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.style = {}; this.classList = { toggle() {} }; }
  replaceChildren(...children) { this.children = children.map(child => child instanceof Element ? child : String(child)); }
  get textContent() { return this.children.map(child => child instanceof Element ? child.textContent : child).join(''); }
  set textContent(value) { this.replaceChildren(String(value)); }
}
const elements = {};
const document = { body: new Element('body'), getElementById: id => elements[id] || (elements[id] = new Element('div')) };
function h(tag, attrs, ...children) {
  const element = Object.assign(new Element(tag), attrs);
  element.replaceChildren(...children.flat(Infinity).filter(child => child !== null && child !== undefined && child !== false));
  return element;
}
const status = { engine: true, season: null, next: {}, seasons: [], voice: { running: false }, speech: { ready: true },
  permissions: { microphone: true }, write: { ok: true }, genres: [{ id: 'city', title: 'Город' }, { id: 'custom', title: 'Своё' }],
  tones: [{ id: 'warm', title: 'Тёплый' }], episodesPerSeason: 12 };
const errors = [];
const scope = vm.createContext({ document, ui: { h, icon: () => new Element('svg'), toast: text => errors.push(text),
  t: (text, ...args) => args.reduce((result, arg) => result.replace('{}', arg), text) },
  assi: { call: async () => status, on() {} } });
const page = fs.readFileSync(path.join(__dirname, '..', 'ui', 'index.html'), 'utf8');
vm.runInContext(page.match(/<script>([\s\S]*?)<\/script>/)[1], scope);
(async () => {
  await new Promise(resolve => setImmediate(resolve));
  assert.deepStrictEqual(errors, []);
  assert.ok(!/null|undefined/.test(elements.newBox.textContent), elements.newBox.textContent);
  assert.ok(elements.newBox.textContent.includes('Начать сезон'));
  vm.runInContext("form.genre = 'custom'; renderNew();", scope);
  assert.ok(elements.newBox.textContent.includes('О чём сезон'));
  status.season = { title: 'Тест', finishedAt: 123 };
  vm.runInContext('renderNew()', scope);
  assert.ok(!/null|undefined/.test(elements.newBox.textContent));
  console.log('series page: 3 passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
