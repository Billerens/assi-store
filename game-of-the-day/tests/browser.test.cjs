'use strict';
// Real browser checks: layout, typed feedback, failure recovery, in-game sheet, reduced-motion decor.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const store = path.resolve(__dirname, '../..');
const factory = path.resolve(store, '../Axiko/app/src/main/assets/factory');
const decor = require('../../holidays/decor.js');
const screenshots = process.env.TEST_ARTIFACT_DIR || path.join(os.tmpdir(), 'axiko-daily-holidays-review');
fs.mkdirSync(screenshots, { recursive: true });
const entry = { date: '2026-11-15', day: '2026-11-15', slot: 0, title: 'Пульс города',
  pitch: 'Попадите в ритм ночного города: меняйте дорожки, слушайте музыку и собирайте точные серии.',
  made: true, tags: { genre: 'rhythm', controls: 'tap', session: '2m' }, open: '/game', canRate: true,
  reasons: [], comment: '', genrePreference: 'unknown', minutes: 14, costUsd: .12 };
const state = { date: entry.date, hub: true, today: entry, games: [entry], recent: [entry,
  { ...entry, date: '2026-11-14', day: '2026-11-14', title: 'Зеркальный маршрут' }],
  trial: [], offers: [], taste: [], notes: [], counts: { made: 2, ratings: 0, kept: 0 },
  chips: ['залип', 'красиво', 'тормозит', 'неточность ритма', 'неудобное управление'],
  schedule: { slots: [{}], text: 'Каждый день в 08:00', frequency: 'daily', keepDays: 3 },
  drawing: { installed: true, on: true, ready: false, title: 'Рисунок дня', hint: 'Новая тема для рисунка' } };
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error('PAGE ERROR:', error.message); });
    await page.route('http://axiko.test/**', async route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === '/modules/games/daily/2026-11-15/ui/index.html') {
        return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<html lang="ru"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/ui/kit/kit.css"><body><button id="g-exit" class="btn" onclick="window.left=true">Выйти</button><script src="/ui/kit/kit.js"></script><script src="/modules/game-of-the-day/ui/rate.js"></script></body></html>' });
      }
      const file = pathname.startsWith('/ui/') ? path.join(factory, pathname) : path.join(store, pathname.replace(/^\/modules\//, ''));
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ body: fs.readFileSync(file), contentType: file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8' });
    });
    await page.addInitScript(({ state }) => {
      window.testState = state;
      window.savedFeedback = [];
      window.axiko = {
        on() {}, back() { window.left = true; }, open() {}, read: async () => '', native: async () => ({}),
        call: async (module, fn, date, data) => {
          if (fn === 'status') return window.testState;
          if (fn === 'rateInfo') return { ok: true, title: 'Пульс города', genre: 'rhythm', rateAfterSec: 0, chips: window.testState.chips };
          if (fn === 'rate' || fn === 'decide') {
            if (window.failSave) throw new Error('Сохранение временно недоступно');
            window.savedFeedback.push({ fn, date, data });
            Object.assign(window.testState.today, { rating: data.stars, comment: data.comment, genrePreference: data.genrePreference });
            return { ok: true };
          }
          if (fn === 'listen') return 'Тайминг нот расходится со звуком';
          return [];
        }
      };
    }, { state });
    await page.goto('http://axiko.test/modules/game-of-the-day/ui/index.html');
    await page.getByText('Пульс города', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    const layout = await page.evaluate(() => {
      const main = document.querySelector('.page').getBoundingClientRect();
      const button = document.querySelector('.actions .btn').getBoundingClientRect();
      const sections = [...document.querySelectorAll('.col:first-child > section')].filter(el => !el.hidden).map(el => el.getBoundingClientRect());
      return { width: main.width, overflow: document.documentElement.scrollWidth > innerWidth, buttonHeight: button.height,
        gap: sections.length > 1 ? sections[1].top - sections[0].bottom : null };
    });
    assert.ok(layout.width > 1000 && !layout.overflow, JSON.stringify(layout));
    assert.ok(layout.buttonHeight >= 44 && layout.gap >= 22, JSON.stringify(layout));
    await page.screenshot({ path: path.join(screenshots, 'daily-desktop.png'), fullPage: true });
    await page.locator('.actions').getByRole('button', { name: 'Оценить', exact: true }).click();
    await page.locator('.rate-star').first().click();
    await page.locator('#daily-comment').fill('Жанр люблю. Ноты не совпадают со звуком, и нет калибровки.');
    await page.locator('#daily-genre').selectOption('like');
    await page.evaluate(() => { window.failSave = true; });
    await page.getByRole('button', { name: 'Сохранить оценку' }).click();
    await page.waitForFunction(() => !document.querySelector('.sheet .primary').disabled);
    assert.equal(await page.locator('#daily-comment').inputValue(), 'Жанр люблю. Ноты не совпадают со звуком, и нет калибровки.');
    await page.screenshot({ path: path.join(screenshots, 'daily-feedback-desktop.png'), fullPage: true });
    await page.evaluate(() => { window.failSave = false; });
    await page.getByRole('button', { name: 'Сохранить оценку' }).click();
    await page.waitForFunction(() => window.savedFeedback.length === 1);
    const saved = await page.evaluate(() => window.savedFeedback[0]);
    assert.equal(saved.data.stars, 1);
    assert.equal(saved.data.genrePreference, 'like');
    assert.match(saved.data.comment, /калибровки/);
    await page.setViewportSize({ width: 344, height: 900 });
    await page.reload();
    await page.getByText('Пульс города', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('.actions').getByRole('button', { name: 'Оценить', exact: true }).click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(screenshots, 'daily-feedback-mobile.png') });
    assert.equal(await page.evaluate(() => document.querySelector('.sheet').getBoundingClientRect().width > innerWidth), false);
    await page.goto('http://axiko.test/modules/games/daily/2026-11-15/ui/index.html');
    await page.waitForTimeout(50);
    await page.locator('#g-exit').click();
    await page.locator('#gotd-comment').fill('Нужна настройка задержки звука');
    await page.locator('#gotd-genre').selectOption('like');
    await page.getByRole('button', { name: 'Позже', exact: true }).click();
    assert.equal(await page.evaluate(() => window.savedFeedback.length), 0, 'unrated feedback must not disappear');
    await page.locator('.gotd-star').first().click();
    await page.getByRole('button', { name: 'Позже', exact: true }).click();
    await page.waitForFunction(() => window.left === true);
    const hook = await page.evaluate(() => window.savedFeedback[0]);
    assert.equal(hook.data.genrePreference, 'like');
    assert.match(hook.data.comment, /задержки/);
    await page.setViewportSize({ width: 1280, height: 850 });
    const files = Object.fromEntries(fs.readdirSync(path.join(store, 'holidays/decor')).filter(name => name.endsWith('.css')).map(name => [name.slice(0, -4), fs.readFileSync(path.join(store, 'holidays/decor', name), 'utf8')]));
    for (const name of ['snow', 'stars', 'petals', 'leaves', 'fireflies', 'aurora', 'meteors']) {
      const css = decor.css({ key: name, title: name, layers: [name], eggs: [], accent: name === 'leaves' ? '#E9A56A' : '#9BBDF9' }, { files, seed: 15, particleCount: 40, motionSeconds: 6, withAccent: true });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setContent('<html><head><style>' + fs.readFileSync(path.join(factory, 'ui/kit/kit.css'), 'utf8') + css + '</style></head><body><main class="page"><header class="topbar"><h1>Праздничное настроение</h1></header><section class="card"><h2>' + name + '</h2><p>Редкие частицы и спокойный свет. Текст остаётся читаемым.</p><button class="btn primary">Продолжить</button></section></main></body></html>');
      const selector = ['stars', 'meteors'].includes(name) ? '.page' : 'body';
      const properties = await page.evaluate(selector => { const s = getComputedStyle(document.querySelector(selector), '::before'); return { image: s.backgroundImage, repeat: s.backgroundRepeat, animation: s.animationName, pointer: s.pointerEvents }; }, selector);
      assert.match(properties.image, /data:image\/svg\+xml/);
      assert.equal(properties.repeat, 'no-repeat');
      assert.equal(properties.animation, 'none');
      assert.equal(properties.pointer, 'none');
      if (name === 'snow' || name === 'stars' || name === 'petals' || name === 'aurora') await page.screenshot({ path: path.join(screenshots, 'holiday-' + name + '.png') });
    }
    assert.deepEqual(errors, []);
    console.log('Browser: desktop + 344px layout, both feedback flows, saved input after error, 7 reduced-motion effects passed. Screenshots: ' + screenshots);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
