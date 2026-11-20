'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const root = path.join(__dirname, '../ui'),
  screenshot = process.env.IMAGINARIUM_SHOT;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const route = path.resolve(
    root,
    '.' +
      decodeURIComponent(
        url.pathname === '/index.html' || url.pathname === '/' ? '/index.html' : url.pathname
      )
  );
  if (!route.startsWith(root + path.sep) || !fs.existsSync(route)) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader(
    'Content-Type',
    { '.js': 'text/javascript', '.html': 'text/html; charset=utf-8', '.css': 'text/css' }[
      path.extname(route)
    ] || 'application/octet-stream'
  );
  res.end(fs.readFileSync(route));
});
(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.CHROME_EXE ? { executablePath: process.env.CHROME_EXE } : {}),
      args: ['--enable-unsafe-swiftshader']
    });
    const page = await browser.newPage({ viewport: { width: 423, height: 846 }, deviceScaleFactor: 1 });
    const issues = [];
    page.on('pageerror', (e) => issues.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'warning' && m.text().startsWith('Imaginarium 3D:')) issues.push(m.text());
    });
    const url = 'http://127.0.0.1:' + server.address().port + '/index.html',
      btn = (name) => page.getByRole('button', { name, exact: true });
    await page.goto(url);
    // Check actual merged vertices, rather than counting declared legs or their labels.
    const bearing = await page.evaluate(async () => {
      const { readingChair } = await import('./joinery.js');
      const chair = readingChair('#346456'),
        points = [];
      chair.traverse((node) => {
        if (!node.isMesh) return;
        const p = node.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) points.push([p.getX(i), p.getY(i), p.getZ(i)]);
      });
      const inside = (x, z, y, dx, dz, dy) =>
        points.some((p) => Math.abs(p[0] - x) < dx && Math.abs(p[2] - z) < dz && Math.abs(p[1] - y) < dy);
      return [-1, 1].flatMap((x) =>
        [-1, 1].map((z) => ({
          floor: inside(x * 0.535, z * (z > 0 ? 0.424 : 0.46), 0, 0.07, 0.07, 0.001),
          shin: inside(x * 0.5, z * 0.39, 0.157, 0.1, 0.1, 0.008),
          knee: inside(x * 0.49, z * 0.38, 0.365, 0.11, 0.11, 0.008),
          frame: inside(x * 0.455, z * 0.345, 0.496, 0.095, 0.095, 0.008)
        }))
      );
    });
    assert.deepEqual(
      bearing,
      Array.from({ length: 4 }, () => ({ floor: true, shin: true, knee: true, frame: true }))
    );
    await btn('Читать').waitFor();
    await page.waitForTimeout(700);
    if (screenshot) await page.screenshot({ path: screenshot });
    assert.equal(await page.locator('canvas').count(), 1);
    await page.mouse.click(105, 394);
    await page.getByRole('dialog').getByRole('heading', { name: 'Последний переплёт' }).waitFor();
    await btn('Взять в руки').click();
    await btn('Поставить').click();
    await page.getByRole('button', { name: 'Большой зал · Полка читателя' }).click();
    await page.reload();
    await btn('Читать').click();
    await page.locator('.chapter p').nth(1).click();
    await page.getByLabel('Заметка к выбранному абзацу').fill('у ящика');
    await btn('Закладка').click();
    await btn('Закрыть').click();
    await page.locator('#catalog').click();
    await page.locator('.bookrow').first().click();
    await btn('Переставить').click();
    await page.getByRole('button', { name: 'Зимняя веранда · Стол у окна' }).click();
    await page.reload();
    await page.waitForFunction(() =>
      document.querySelector('#navigate').textContent.includes('Зимняя веранда')
    );
    await page.locator('#catalog').click();
    await page.locator('.bookrow').first().click();
    await btn('у ящика').waitFor();
    await btn('Закрыть').click();
    await page.locator('#workshop').click();
    await page.getByLabel('Описание предмета').fill('Коралловое дерево');
    await btn('Изготовить по описанию').click();
    await page.getByText(/Откройте библиотеку в Axiko/).waitFor();
    await btn('Закрыть').click();
    const calls = [];
    await page.exposeFunction('modelFixture', (task, data) => {
      calls.push({ task, data });
      if (task === 'seeds')
        return [
          'Садовница слышит ключи в пустой оранжерее.',
          'У клёна вырастают старые часы.',
          'Секретарь теряет вчерашний протокол.'
        ];
      if (task === 'titles') return ['Ключ оранжереи', 'Время клёна', 'Медная крона'];
      if (task === 'shape')
        return {
          name: 'Коралловый лист',
          mount: 'floor',
          parts: [
            {
              type: 'mesh',
              at: [0, 0, 0],
              size: [1, 1, 1],
              rot: [0, 0, 0],
              material: 'metal',
              color: '#d78b64',
              points: [
                [0, 0, 0],
                [0.7, 0.5, 0],
                [0.1, 1, 0.1],
                [0, 0.3, 0.5]
              ],
              faces: [
                [0, 1, 2],
                [0, 2, 3],
                [0, 3, 1]
              ]
            }
          ]
        };
      return {
        title: 'Записка в саду',
        summary: 'Садовница нашла ключ.',
        facts: ['Ключ у садовницы.'],
        threads: ['Кто принёс ключ?'],
        paragraphs: [
          'У ворот давно пустой оранжереи лежал медный ключ. Садовница подняла его и услышала из-за стекла знакомые шаги.',
          'За калиткой пахло дождём и табачным листом. Она открыла ворота.'
        ]
      };
    });
    await page.addInitScript(() => {
      const key = 'fixture-db';
      window.axiko = {
        platform: 'web',
        call: async (path, method, ...args) => {
          if (method === 'load') return JSON.parse(localStorage.getItem(key) || 'null');
          if (method === 'save') {
            const rev = args[0] + 1;
            localStorage.setItem(key, JSON.stringify({ revision: rev, state: args[1] }));
            return rev;
          }
          if (method === 'result') return null;
          return window.modelFixture(args[1], args[2]);
        }
      };
    });
    await page.reload();
    await page.locator('#bind').click();
    await page.getByLabel('Как должна звучать история?').fill('Тихая мистика');
    await btn('Предложить завязки').click();
    await btn('У клёна вырастают старые часы.').click();
    await btn('Подобрать названия').click();
    await btn('Время клёна').click();
    await btn('Создать книгу и написать начало').click();
    await page.locator('dialog').getByRole('button', { name: 'Читать', exact: true }).click();
    await btn('Написать продолжение').click();
    await btn('Читать').last().waitFor();
    await btn('Закрыть').click();
    await page.locator('#workshop').click();
    await page.getByLabel('Описание предмета').fill('Складной коралловый лист');
    await btn('Изготовить по описанию').click();
    await btn('Поставить в комнате').click();
    await btn('Осмотреть в комнате').click();
    await page.reload();
    const snapshot = await page.evaluate(() => JSON.parse(localStorage.getItem('fixture-db')).state);
    assert.equal(snapshot.books.at(-1).chapters.length, 2);
    assert.equal(snapshot.objects[0].shape.parts[0].type, 'mesh');
    assert.deepEqual(
      calls.map((c) => c.task),
      ['seeds', 'titles', 'chapter', 'chapter', 'shape']
    );
    assert.deepEqual(issues, []);
    await page.setViewportSize({ width: 1365, height: 768 });
    await page.locator('#room').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    await page.locator('#navigate').click();
    await btn('Зимняя веранда · Читальный сад').click();
    await page.locator('#catalog').click();
    await page.locator('.bookrow').first().click();
    await btn('Читать').last().click();
    assert.equal((await page.locator('.chapter p').count()) > 0, true);
    const durability = await page.evaluate(async () => {
      const db = await import('./state.js');
      await db.save(true);
      const original = window.axiko.call;
      let fault = 'after';
      window.axiko.call = async (...args) => {
        if (args[1] !== 'save') return original(...args);
        if (fault === 'before') {
          fault = '';
          throw Error('временная потеря связи');
        }
        const saved = await original(...args);
        if (fault === 'after') {
          fault = '';
          throw Error('потерян ответ');
        }
        return saved;
      };
      db.state.weather = 'clear';
      await db.save(true);
      fault = 'before';
      let rejected = false;
      try {
        await db.save(true);
      } catch (e) {
        rejected = true;
      }
      await db.save(true);
      return { rejected, stored: JSON.parse(localStorage.getItem('fixture-db')).state.weather };
    });
    assert.deepEqual(durability, { rejected: true, stored: 'clear' });
    console.log(
      'Imaginarium browser: physical book selection, WebGL, mobile and desktop, offline read/move/reload, bridge creation, explicit continuation, free mesh and recoverable saves passed'
    );
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
