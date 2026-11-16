'use strict';
// Local Chromium smoke: the real engine and game, an isolated bridge and temporary files.
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
// ASSI_ROOT may point to an Assi checkout; otherwise expect it beside assi-store.
const assiRoot = process.env.ASSI_ROOT || path.resolve(__dirname, '../../../Assi');
const H = require(path.join(assiRoot, 'scripts/games/harness.js'));
const { open } = require('./env');
const { chromium } = require(process.env.EVOLUTION_PLAYWRIGHT || process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const chrome = process.env.EVOLUTION_CHROMIUM || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const artifacts = path.resolve(process.env.ASSI_TEST_ARTIFACTS || path.join(__dirname, '../../build/artifacts'));

async function run() {
  const setup = open();
  const env = setup.env;
  const x = setup.x;
  fs.mkdirSync(artifacts, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(artifacts, 'evolution-browser-'));
  fs.cpSync(path.join(H.FACTORY, 'ui', 'kit'), path.join(env.root, 'ui', 'kit'), { recursive: true });
  const errors = [];
  const external = [];
  const report = [];
  const links = { mult: 1, steps: { on: true, energy: 20 }, passenger: { on: false }, bet: { on: false } };
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(req.url.split('?')[0]);
    if (pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
    const file = path.resolve(env.root, '.' + pathname);
    if (!file.startsWith(env.root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      errors.push('Missing local asset: ' + pathname);
      res.writeHead(404).end();
      return;
    }
    const type = ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' })[path.extname(file)] || 'application/octet-stream';
    res.setHeader('Content-Type', type + '; charset=utf-8');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = ['http:', '', '127.0.0.1:' + server.address().port].join('/');
  const browser = await chromium.launch({ headless: true, executablePath: chrome, args: ['--disable-background-networking'] });
  try {
    for (const width of [344, 760]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      page.on('pageerror', error => errors.push(width + ': ' + error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(width + ': ' + message.text()); });
      page.on('request', request => { if (!request.url().startsWith(address)) external.push(request.url()); });
      let saved = null;
      await page.exposeFunction('evolutionTestBridge', async (fn, args) => {
        if (fn === 'boot') return { game: x.game, config: x.cfg, rows: [], lastSeq: 0, links, stock: {}, features: [], audio: { silent: true } };
        if (fn === 'save') { saved = args[2]; return { ok: true }; }
        if (fn === 'links') return links;
        if (fn === 'settings') return { config: x.cfg };
        if (fn === 'segments') return [{ from: args[1], to: args[2], mult: 1 }];
        if (['inbox', 'saves', 'older'].includes(fn)) return [];
        if (fn === 'spend') return { ok: true, left: 19 };
        if (fn === 'stockTake') return null;
        return {};
      });
      await page.addInitScript(() => {
        window.assi = {
          call: (_module, fn, ...args) => window.evolutionTestBridge(fn, args),
          native: async () => ({}), stage: async () => true,
          on: () => () => {}, back: () => {}, open: async () => true,
          vibrate: async () => true
        };
      });
      await page.goto(address + '/modules/games/evolution/ui/index.html');
      await page.waitForFunction(() => window.__game && document.querySelector('.ev-resource')?.textContent);
      if (await page.evaluate(() => __game.state.run.universeChoices.length > 0)) {
        await page.locator('[data-choice]').first().click();
        assert.strictEqual(await page.evaluate(() => __game.state.run.universeChoices.length), 0);
      }
      const stages = [];
      async function enter(stage) {
        await page.evaluate(stageId => {
          const g = window.__game;
          g.act(state => {
            state.run.pendingMutations = [];
            state.run.universeChoices = [];
            state.run.constant = 'balanced';
            state.run.finished = false;
            g.sim.enterStage(state, { now: Date.now(), config: g.config, rng: g.rng, mult: 1 }, stageId);
            state.run.resource = '1e60';
            state.layers.universe.currency = '1000';
          });
          g.redraw();
        }, stage);
        await page.waitForFunction(stageId => document.querySelector('.g-app').dataset.stage === String(stageId), stage);
      }
      for (let stage = 1; stage <= 8; stage++) {
        console.log('BROWSER', width, 'stage', stage);
        await enter(stage);
        const metrics = await page.evaluate(() => {
          const panels = ['.g-top', '.g-field', '.g-actions'].map(selector => {
            const element = document.querySelector(selector);
            const rect = element.getBoundingClientRect();
            return { selector, width: element.clientWidth, scroll: element.scrollWidth, x: rect.x, right: rect.right, top: rect.top, bottom: rect.bottom };
          });
          const buttons = Array.from(document.querySelectorAll('.ev-app button')).filter(element => {
            const style = getComputedStyle(element);
            return style.display !== 'none' && element.getBoundingClientRect().width > 0;
          }).map(element => {
            const rect = element.getBoundingClientRect();
            return { text: element.innerText, width: rect.width, height: rect.height };
          });
          return { panels, buttons, body: document.documentElement.scrollWidth, text: document.body.innerText, layout: __game.layout };
        });
        assert.ok(metrics.body <= width, 'Body overflow: ' + width + '/' + stage);
        assert.ok(metrics.panels.every(panel => panel.scroll <= panel.width + 1 && panel.x >= -1 && panel.right <= width + 1), 'Panel overflow: ' + JSON.stringify({ width, stage, panels: metrics.panels }));
        assert.ok(metrics.buttons.every(button => button.width >= 44 && button.height >= 44), 'Tap target too small: ' + JSON.stringify({ width, stage, buttons: metrics.buttons.filter(button => button.width < 44 || button.height < 44) }));
        assert.ok(!/NaN|Infinity|undefined/.test(metrics.text), 'Invalid visible text: ' + width + '/' + stage);
        if (stage === 1) {
          await page.locator('[data-producer="0"]').click();
          assert.strictEqual(await page.evaluate(() => __game.state.run.producers[0]), 1);
        }
        if (stage === 2) {
          await page.locator('[data-producer="1"]').click();
          assert.strictEqual(await page.evaluate(() => __game.state.run.levels.capacity), 1);
        }
        if (stage === 3) {
          await page.evaluate(() => { const g = __game; g.act(s => g.sim.leap(s, { now: Date.now(), config: g.config, rng: g.rng, mult: 1 })); g.redraw(); });
          await page.locator('[data-choice]').first().click();
          assert.ok(await page.evaluate(() => Object.keys(__game.state.run.mutations).length > 0));
          await page.evaluate(() => { const g = __game; g.act(s => g.sim.leap(s, { now: Date.now(), config: g.config, rng: g.rng, mult: 1 })); g.redraw(); });
        }
        if (stage === 4) {
          await page.evaluate(() => { const g = __game; g.act(s => g.sim.triggerEvent(s, { now: Date.now(), config: g.config, rng: g.rng }, 'meteor')); g.redraw(); });
          await page.locator('.ev-event').click();
          await page.locator('.g-sheet .ev-choice').first().click();
          assert.strictEqual(await page.evaluate(() => __game.state.run.event), null);
        }
        if (stage === 5) {
          const hexMetrics = await page.locator('.ev-hex').evaluateAll(elements => elements.map(element => {
            const rect = element.getBoundingClientRect();
            return { width: rect.width, height: rect.height, left: rect.left, right: rect.right };
          }));
          assert.strictEqual(hexMetrics.length, 37);
          assert.ok(hexMetrics.every(hex => hex.width >= 44 && hex.height >= 44 && hex.left >= 0 && hex.right <= width));
          await page.locator('.ev-hex').first().click();
          await page.locator('.ev-mechanics .primary').click();
          assert.strictEqual(await page.evaluate(() => __game.state.run.hexes.filter(hex => hex.owned).length), 1);
          const next = await page.evaluate(() => __game.sim.bestHex(__game.state, __game.config));
          await page.locator('.ev-hex').nth(next).click();
          await page.locator('.ev-mechanics .primary').click();
          assert.strictEqual(await page.evaluate(() => __game.state.run.hexes.filter(hex => hex.owned).length), 2);
        }
        if (stage === 6) {
          await page.locator('input[type="range"]').first().evaluate(input => { input.value = '75'; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); });
          const roles = await page.evaluate(() => __game.state.run.roles);
          assert.ok(roles[0] > 0.45 && Math.abs(roles.reduce((a, b) => a + b, 0) - 1) < 1e-9);
        }
        if (stage === 7) {
          await page.locator('.ev-discoveries button').nth(2).click();
          assert.strictEqual(await page.evaluate(() => __game.state.run.discoveries[2]), true);
        }
        if (stage === 8) {
          await page.locator('.ev-mechanics button').first().click();
          assert.strictEqual(await page.evaluate(() => __game.state.run.colonies.length), 1);
          await page.evaluate(() => { const g = __game; g.act(s => { s.run.colonies[0].done = true; s.run.worlds += 1; }); g.redraw(); });
          await page.locator('.ev-mechanics button').first().click();
          assert.strictEqual(await page.evaluate(() => __game.state.run.colonies.length), 2);
        }
        await page.screenshot({ path: path.join(scratch, 'stage-' + stage + '-' + width + '.png') });
        stages.push({ stage, horizontalOverflow: false, tapTargets: true });
      }
      console.log('BROWSER', width, 'universe and law');
      await enter(1);
      await page.evaluate(() => { __game.act(s => { s.run.universeChoices = ['gravity', 'light', 'ocean']; }); __game.redraw(); });
      await page.locator('[data-choice="gravity"]').click();
      assert.strictEqual(await page.evaluate(() => __game.state.run.constant), 'gravity');
      await page.locator('.ev-tools button').last().click();
      await page.getByRole('button', { name: 'Законы природы', exact: true }).click();
      await page.locator('.ev-law-list button').first().click();
      assert.strictEqual(await page.evaluate(() => __game.state.meta.laws.stage1), 1);
      await page.screenshot({ path: path.join(scratch, 'laws-' + width + '.png') });
      assert.ok(saved, 'UI changes invoke saving');
      await context.close();
      report.push({ width, stages, interactions: ['producer', 'capacity', 'mutation', 'event', 'hex', 'roles', 'discovery', 'repeat colony', 'universe', 'law'] });
    }
    assert.deepStrictEqual(errors, [], 'Browser errors');
    assert.deepStrictEqual(external, [], 'External requests');
    fs.writeFileSync(path.join(scratch, 'report.json'), JSON.stringify({ report, errors, external }, null, 2));
    console.log(JSON.stringify({ report, errors, external, scratch }, null, 2));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
    env.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });


