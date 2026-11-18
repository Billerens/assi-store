'use strict';
// Browser regression for currency autosave: report, refreshed totals, pending FX, failed writes and queued settings.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const moduleRoot = path.resolve(__dirname, '..');
const factory = path.resolve(moduleRoot, '../../Axiko/app/src/main/assets/factory');
const defaults = require('../logic/settings.js').normalize({ currency: 'RUB', budget: null, importDays: 0 });

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
  try {
    async function openCase(options = {}) {
      const page = await browser.newPage({ viewport: { width: 1000, height: 850 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('http://axiko.test/**', route => {
        const pathname = new URL(route.request().url()).pathname;
        const file = pathname.startsWith('/ui/') ? path.join(factory, pathname) : path.join(moduleRoot, pathname.replace('/modules/spending/', ''));
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
        return route.fulfill({ body: fs.readFileSync(file), contentType: file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8' });
      });
      await page.addInitScript(({ defaults, options }) => {
        const settings = JSON.parse(JSON.stringify(defaults));
        if (options.budget) settings.budget = 500;
        window.testSettings = settings;
        window.calls = [];
        window.savedPatches = [];
        const handlers = {};
        window.testHandlers = handlers;
        window.pendingFx = 0;
        window.conversion = { currency: settings.currency, processed: 1, updated: 0, pending: 0, legacy: 0 };
        function configured() {
          return { settings: JSON.parse(JSON.stringify(settings)), defaults, month: { key: '2026-11', plan: { total: settings.budget, limits: settings.categoryLimits } },
            models: {}, state: {}, features: [], smsPermission: true, usageAccess: true, conversion: window.conversion, pendingRates: window.pendingFx };
        }
        function transaction() {
          return { id: 1, at: Date.UTC(2026, 10, 15), amount: 100, currency: 'BYN', currencyKnown: !options.unknown,
            amountBase: window.pendingFx ? null : settings.currency === 'BYN' ? 100 : 3000,
            fx: window.pendingFx ? 'pending' : settings.currency === 'BYN' ? null : 'cbr', name: 'Тестовый магазин', category: 'Продукты', type: 'purchase', source: 'manual' };
        }
        function apply(patch) {
          if (options.fail) throw new Error('Ошибка записи настроек');
          Object.assign(settings, patch);
          window.savedPatches.push(patch);
          if (patch.currency) {
            window.pendingFx = options.pending ? 1 : 0;
            window.conversion = { currency: settings.currency, processed: 1, updated: 1, pending: window.pendingFx, legacy: 0 };
          }
          handlers['spending.changed']?.({ type: 'settings' });
          return configured();
        }
        window.axiko = {
          on(name, callback) { handlers[name] = callback; }, native: async () => ({}), back() {}, read: async () => '',
          call: async (module, fn, arg) => {
            window.calls.push(fn);
            if (fn === 'settings') return configured();
            if (fn === 'saveSettings') {
              if (options.defer && arg.currency) return new Promise((resolve, reject) => {
                window.finishCurrencySave = () => { try { resolve(apply(arg)); } catch (e) { reject(e); } };
              });
              return apply(arg);
            }
            if (fn === 'overview') {
              const tx = transaction();
              const spent = tx.amountBase || 0;
              return { period: { label: 'Ноябрь', year: 2026, start: Date.UTC(2026, 10, 1) },
                summary: { spent, budget: settings.budget, byCategory: [], byDay: [spent], pace: 0, left: 0, perDay: 0, daysLeft: 0 },
                currency: settings.currency, recent: [tx], count: 1, upcoming: [], thresholds: [80, 100], imported: true,
                pendingRates: window.pendingFx, conversion: window.conversion };
            }
            if (fn === 'feed') {
              const tx = transaction();
              return { currency: settings.currency, categories: settings.categories, days: [{ label: '15 ноября', total: tx.amountBase || 0, items: [tx] }], more: false, pendingRates: window.pendingFx, conversion: window.conversion };
            }
            return [];
          }
        };
      }, { defaults, options });
      await page.goto('http://axiko.test/modules/spending/ui/index.html?tab=settings');
      await page.locator('#budgetCurrency').waitFor();
      await page.evaluate(() => {
        window.toastLog = [];
        const original = ui.toast;
        ui.toast = text => { window.toastLog.push(text); return original(text); };
      });
      assert.deepEqual(errors, []);
      return { page, errors };
    }

    const first = await openCase({ defer: true });
    assert.equal(await first.page.getByText(/числа бюджета и лимитов остаются прежними/).count(), 0, 'no warning for unset plans');
    await first.page.locator('#budgetCurrency').selectOption('BYN');
    await first.page.waitForFunction(() => !!window.finishCurrencySave);
    assert.equal(await first.page.locator('#budgetCurrency').isDisabled(), true);
    assert.match(await first.page.locator('#currencyStatus').textContent(), /пересчитываю/);
    await first.page.evaluate(() => {
      const wallet = [...document.querySelectorAll('label')].find(node => node.querySelector('textarea') && node.firstElementChild.textContent === 'Кошельки').querySelector('textarea');
      wallet.value += '\nexample.wallet';
      wallet.dispatchEvent(new Event('change', { bubbles: true }));
      window.testHandlers['spending.changed']({ type: 'rates' });
    });
    await first.page.waitForTimeout(600);
    assert.equal(await first.page.evaluate(() => window.calls.filter(x => x === 'saveSettings').length), 1, 'settings saves must not overlap');
    await first.page.evaluate(() => window.finishCurrencySave());
    await first.page.waitForFunction(() => window.savedPatches.length === 2 && !document.querySelector('#budgetCurrency').disabled);
    assert.match(await first.page.locator('#currencyStatus').textContent(), /BYN/);
    assert.equal(await first.page.evaluate(() => window.toastLog.some(text => /Пересчитано операций: 1/.test(text))), true);
    assert.equal(await first.page.evaluate(() => window.testSettings.wallets.includes('example.wallet')), true);
    assert.equal(await first.page.evaluate(() => window.testSettings.wallets.includes('com.samsung.android.wallet*')), true, 'Wallet support preserved');
    assert.deepEqual(await first.page.evaluate(() => window.calls.filter(x => x === 'overview' || x === 'feed').sort()), ['feed', 'overview']);
    assert.match(await first.page.locator('#overview .big').first().textContent(), /100.*BYN/);
    assert.equal(await first.page.locator('#feed .op .sum .small').count(), 0, 'same-currency original amount has no stale RUB-derived secondary sum');
    assert.deepEqual(first.errors, []);
    await first.page.close();

    const second = await openCase({ pending: true, budget: true, unknown: true });
    assert.equal(await second.page.getByText(/числа бюджета и лимитов остаются прежними/).count(), 1);
    await second.page.locator('#budgetCurrency').selectOption('USD');
    await second.page.waitForFunction(() => window.savedPatches.length === 1 && !document.querySelector('#budgetCurrency').disabled);
    assert.match(await second.page.locator('#currencyStatus').textContent(), /Ждут курса: 1/);
    assert.match(await second.page.locator('#overview [data-pending-rates]').textContent(), /не входят в итог/);
    assert.match(await second.page.locator('#feed [data-pending-rates]').textContent(), /Ждут курса/);
    assert.match(await second.page.locator('#feed .op').textContent(), /ждёт курса/);
    assert.equal(await second.page.locator('#feed .op .sum .small').count(), 0);
    assert.equal((await second.page.locator('#feed .op .sum').textContent()).trim(), '100', 'unknown original currency must not acquire a RUB/BYN/USD label');
    assert.match(await second.page.locator('#feed .op').textContent(), /валюта не указана/);
    await second.page.evaluate(() => { window.pendingFx = 0; window.conversion.pending = 0; window.testHandlers['spending.changed']({ type: 'rates' }); });
    await second.page.waitForFunction(() => !document.querySelector('#currencyStatus').textContent.includes('Ждут курса'));
    assert.deepEqual(second.errors, []);
    await second.page.close();

    const third = await openCase({ fail: true });
    await third.page.locator('#budgetCurrency').selectOption('BYN');
    await third.page.waitForFunction(() => document.querySelector('#currencyStatus').textContent.includes('Не удалось') && !document.querySelector('#budgetCurrency').disabled);
    assert.equal(await third.page.locator('#budgetCurrency').inputValue(), 'RUB');
    assert.equal(await third.page.evaluate(() => window.testSettings.currency), 'RUB');
    assert.equal(await third.page.evaluate(() => window.calls.includes('overview') || window.calls.includes('feed')), false);
    assert.deepEqual(third.errors, []);
    await third.page.close();
    console.log('Spending UI: currency report, summary/feed refresh, queued Wallet settings, pending FX completion and failed save passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
