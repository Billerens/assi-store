'use strict';
// Real Chromium pixels: external currentColor SVGs must use the badge palette, including in widgets.
// PLAYWRIGHT_MODULE / PLAYWRIGHT_CHROMIUM_EXECUTABLE may point to an existing local installation.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
const games = ['merge-forge', 'word-weaver', 'evolution', 'fishing', 'blocks'];

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<!doctype html><body style="background:#101010;color:#eee;font:15px system-ui"><main style="display:flex;gap:14px;flex-wrap:wrap"></main>');
    await page.addScriptTag({ path: path.join(root, 'achievements/ui/badge.js') });
    const result = await page.evaluate(async sources => {
      async function pixels(svg) {
        const picture = new Image();
        await new Promise((resolve, reject) => {
          picture.onload = resolve;
          picture.onerror = () => reject(new Error('Could not render the badge SVG'));
          picture.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
        });
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 100;
        const context = canvas.getContext('2d');
        context.drawImage(picture, 0, 0, 100, 100);
        const data = context.getImageData(32, 32, 36, 36).data;
        let purple = 0, gray = 0, red = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 100) continue;
          const [r, g, b] = data.slice(i, i + 3);
          if (r > 150 && g > 120 && b > 210) purple++;
          if (r > 80 && r < 145 && Math.abs(r - g) < 3 && Math.abs(r - b) < 3) gray++;
          if (r > 200 && g < 40 && b < 40) red++;
        }
        return { purple, gray, red };
      }
      async function badge(icon, text, got) {
        const holder = document.createElement('section');
        holder.innerHTML = Badge.svg({ group: 'Игротека', icon, gotCount: got ? 1 : 0, tiers: [{ rarity: 'common' }] }, { size: 100 });
        const svg = holder.querySelector('svg');
        svg.style.setProperty('--ink-3', '#777777');
        if (text) svg.querySelector('image').setAttribute('href', 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text));
        document.querySelector('main').append(holder);
        return { svg, pixels: await pixels(svg) };
      }
      const rows = [];
      for (const source of sources) {
        const icon = 'modules/games/games/' + source.id + '/icon.svg';
        const got = await badge(icon, source.text, true);
        const locked = await badge(icon, source.text, false);
        rows.push({ game: source.id, got: got.pixels, locked: locked.pixels });
      }
      const inline = (await badge('sun', null, true)).pixels;
      // Raster artwork keeps its own colour; only SVG silhouettes are recoloured.
      const raster = await badge('modules/example/icon.png', null, true);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 24;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 24, 24);
      raster.svg.querySelector('image').setAttribute('href', canvas.toDataURL());
      const rasterPixels = await pixels(raster.svg);
      const ids = Array.from(document.querySelectorAll('filter')).map(filter => filter.id);
      return { rows, inline, raster: rasterPixels, uniqueFilters: new Set(ids).size === ids.length };
    }, games.map(id => ({ id, text: fs.readFileSync(path.join(root, id, 'icon.svg'), 'utf8') })));
    for (const row of result.rows) {
      assert(row.got.purple > 20, row.game + ': earned icon must be light purple, not black');
      assert(row.locked.gray > 20, row.game + ': locked icon must use the muted palette');
    }
    assert(result.inline.purple > 20, 'inline icons retain the same palette');
    assert(result.raster.red > 100, 'raster pictures retain their colour');
    assert(result.uniqueFilters, 'badge filter ids must not collide in a grid or widget');
    assert.deepEqual(errors, []);
    if (process.env.BADGE_SCREENSHOT) await page.screenshot({ path: process.env.BADGE_SCREENSHOT, fullPage: true });
    console.log(JSON.stringify({ games: games.length, earnedPalette: true, lockedPalette: true, inlinePalette: true, rasterColourPreserved: true, uniqueFilters: true, pageErrors: errors }));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
