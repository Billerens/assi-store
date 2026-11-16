// The screen in a desktop Chromium (headless, no network): the real engine of Assi in a harness
// workspace, the games module's own main.js as the bridge (window.assi.call goes to it over a
// local server), the game copied to modules/games/wave-survival. At 344 and 760 points wide:
// the hub and its tabs, a run (the stick moves the hero), the level-up cards (a touch in the
// first pickLockMs does not pick), the pause, putting a run aside and coming back, the end of a
// run and its result; no console errors, no 404, no NaN on the screen, no horizontal scroll.
// node tests/browser.test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { spawn } = require('child_process');
const H = require(path.join(process.env.ASSI_ROOT || path.resolve(__dirname, '../../../Assi'), 'scripts/games/harness.js'));

const GAME = path.resolve(__dirname, '..');
const ID = 'wave-survival';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  const env = H.workspace({ fixture: false });
  fs.cpSync(GAME, path.join(env.root, 'modules', 'games', ID), { recursive: true, filter: (p) => !/[\\/](tests|_data)(?:[\\/]|$)/.test(path.relative(GAME, p) ? '/' + path.relative(GAME, p) : '') });
  fs.cpSync(path.join(H.FACTORY, 'ui', 'kit'), path.join(env.root, 'ui', 'kit'), { recursive: true });
  const main = env.require('modules/games/main.js');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'wave-survival-browser-'));
  const faults = [];
  let dictionary = '';
  const stub = '<script>window.__stageCalls=[];window.assi={platform:"web",call:async function(module,fn){var args=Array.prototype.slice.call(arguments,2);var r=await fetch("/__call",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({fn:fn,args:args})});var out=await r.json();if(out.error)throw new Error(out.error);return out.value;},native:async function(){return {};},stage:async function(on){window.__stageCalls.push(on);return true;},on:function(){return function(){};},back:function(){},open:async function(){return true;}};</script>';
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === '/__call') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const { fn, args } = JSON.parse(body);
        if (typeof main[fn] !== 'function') throw new Error('No bridge method ' + fn);
        const value = await main[fn].apply(main, args);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ value: value === undefined ? null : value }));
        return;
      }
      const relative = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
      const file = path.resolve(env.root, relative);
      if (!file.startsWith(env.root + path.sep)) throw new Error('Invalid local path');
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        if (!relative.endsWith('favicon.ico')) faults.push('404 ' + relative);
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
      const ext = path.extname(file);
      res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml' })[ext] || 'application/octet-stream');
      let value = fs.readFileSync(file);
      if (ext === '.html') value = value.toString().replace('<body>', '<body>' + stub + (dictionary ? '<script>window.__i18n=' + dictionary + ';</script>' : ''));
      res.end(value);
    } catch (error) {
      faults.push(String(error.stack));
      res.statusCode = 500;
      res.end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((f) => fs.existsSync(f));
  assert.ok(chrome, 'нужен Chromium (Chrome или Edge)');
  const child = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + scratch, '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-sync', '--disable-extensions', '--disable-gpu', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let socket;
  try {
    const portFile = path.join(scratch, 'DevToolsActivePort');
    for (let i = 0; i < 150 && !fs.existsSync(portFile); i++) await pause(100);
    assert.ok(fs.existsSync(portFile), 'Chromium не запустился');
    const debugPort = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    const targets = await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json();
    socket = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let serial = 0;
    const pending = new Map();
    socket.onmessage = (event) => {
      const m = JSON.parse(event.data);
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        if (m.error) p.reject(new Error(JSON.stringify(m.error)));
        else p.resolve(m.result);
      }
      if (m.method === 'Runtime.exceptionThrown') faults.push('exception: ' + ((m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description) || m.params.exceptionDetails.text));
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') faults.push('console: ' + m.params.args.map((a) => a.value || a.description).join(' '));
      if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon/.test(m.params.entry.url || m.params.entry.text)) faults.push('log: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
    };
    function cdp(method, params) {
      return new Promise((resolve, reject) => {
        const id = ++serial;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params: params || {} }));
        setTimeout(() => { if (pending.delete(id)) reject(new Error('CDP timeout ' + method)); }, 20000).unref();
      });
    }
    async function evaluate(expression) {
      const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
      return r.result.value;
    }
    async function until(expression, what, ms) {
      for (let i = 0; i < (ms || 8000) / 50; i++) {
        if (await evaluate(expression)) return;
        await pause(50);
      }
      throw new Error('не дождались: ' + what + '\n' + faults.join('\n'));
    }
    async function shot(name) {
      const png = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const file = path.join(scratch, name + '.png');
      fs.writeFileSync(file, Buffer.from(png.data, 'base64'));
      return file;
    }
    const TEXT = '(()=>{const t=document.body.innerText;return {bad:/NaN|Infinity|undefined|\\[object/.test(t),width:document.documentElement.scrollWidth,inner:innerWidth}})()';
    await cdp('Runtime.enable');
    await cdp('Page.enable');
    await cdp('Log.enable');
    const report = [];
    for (const width of [344, 760]) {
      const height = width === 344 ? 780 : 900;
      await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: width < 600 });
      await cdp('Page.navigate', { url: 'http://127.0.0.1:' + port + '/modules/games/' + ID + '/ui/index.html' });
      await until('!!window.__game && !!document.querySelector(".ws-tabs .ws-tab")', 'хаб');
      assert.deepStrictEqual(await evaluate('window.__stageCalls'), [], 'игра не разворачивает веб-хаб автоматически');
      const hub = [];
      for (let i = 0; i < 3; i++) {
        await evaluate('document.querySelectorAll(".ws-tabs .ws-tab")[' + i + '].click()');
        await pause(60);
        const t = await evaluate(TEXT);
        assert.ok(!t.bad, 'NaN/undefined на вкладке ' + i);
        assert.ok(t.width <= t.inner, 'прокрутка вбок на вкладке ' + i + ': ' + t.width);
        hub.push(await shot('hub-' + width + '-' + i));
      }
      await evaluate('document.querySelectorAll(".ws-tabs .ws-tab")[0].click()');
      const sizes = await evaluate('[...document.querySelectorAll(".ws-tab, .ws-actions .g-btn, .g-pick > button")].map(e=>{const r=e.getBoundingClientRect();return [r.width,r.height]})');
      assert.ok(sizes.every((s) => s[0] >= 44 && s[1] >= 44), 'кнопка меньше 44: ' + JSON.stringify(sizes.filter((s) => s[0] < 44 || s[1] < 44)));
      // A run.
      await evaluate('document.querySelector(".ws-actions .g-btn.primary").click()');
      await until('!!window.__waves.run.active && !document.querySelector(".ws-stage").hidden', 'забег');
      const canvas = await evaluate('(()=>{const c=document.querySelector(".ws-canvas");return {w:c.width,h:c.height,cw:c.clientWidth,ch:c.clientHeight}})()');
      assert.strictEqual(canvas.cw, width);
      assert.ok(canvas.w >= width, 'холст: ' + JSON.stringify(canvas));
      // A sturdy hero for the screen checks: the run must not end on its own while the test looks around.
      await evaluate('(()=>{const s=window.__waves.run.world.s;s.hmax=100000;s.hp=100000;})()');
      const hx = await evaluate('window.__waves.run.world.s.hx');
      // The stick: down in the lower part, move, hold.
      const x0 = Math.round(width / 2);
      const y0 = Math.round(height * 0.8);
      await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y: y0 });
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1 });
      await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + 50, y: y0, button: 'left', buttons: 1 });
      await pause(900);
      const moved = await evaluate('window.__waves.run.world.s.hx');
      const joy = await evaluate('window.__waves.joy.mx');
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x0 + 50, y: y0, button: 'left', clickCount: 1 });
      assert.ok(joy > 0.5, 'стик не отклонился: ' + joy);
      assert.ok(moved > hx + 10 || (await evaluate('window.__waves.run.world.s.choice !== null')), 'герой не сдвинулся: ' + hx + ' → ' + moved);
      const beforeKeys = await evaluate('window.__waves.run.world.s.hx');
      await cdp('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyD', key: 'в' });
      await pause(400);
      await cdp('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyD', key: 'в' });
      assert.ok(await evaluate('window.__waves.run.world.s.hx') > beforeKeys + 5, 'WASD работает и при русской раскладке');
      const stopped = await evaluate('window.__waves.run.world.s.hx');
      await pause(200);
      assert.ok(Math.abs(await evaluate('window.__waves.run.world.s.hx') - stopped) < 1, 'отпущенная клавиша не залипает');
      const beforeArrow = await evaluate('window.__waves.run.world.s.hy');
      await cdp('Input.dispatchKeyEvent', { type: 'keyDown', code: 'ArrowUp', key: 'ArrowUp' });
      await pause(350);
      await cdp('Input.dispatchKeyEvent', { type: 'keyUp', code: 'ArrowUp', key: 'ArrowUp' });
      assert.ok(await evaluate('window.__waves.run.world.s.hy') < beforeArrow - 5, 'стрелки управляют героем');
      const stage = await shot('run-' + width);
      // Level-up cards: step the world to the next level in the page.
      await evaluate('(()=>{const w=window.__waves.run.world;for(let i=0;i<60*120&&!w.s.choice&&!w.s.over;i++)WaveWorld.step(w,0.3,0.2);return !!w.s.choice})()');
      await until('!!document.querySelector(".ws-card")', 'карточки').catch(async (e) => { console.log(JSON.stringify(await evaluate('(()=>{const r=window.__waves.run;return {open:r.choiceOpen,paused:r.paused,why:r.why,cd:r.countdown,choice:!!r.world.s.choice,over:r.world.s.over,cls:document.querySelector(".ws-over").className,hidden:document.querySelector(".ws-over").hidden,text:document.querySelector(".ws-over").textContent.slice(0,200),vis:document.visibilityState}})()'))); throw e; });
      const card = await evaluate('(()=>{const r=document.querySelector(".ws-card").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,h:r.height,bottom:r.bottom,top:r.top}})()');
      assert.ok(card.h >= 44 && card.bottom <= height && card.top > height * 0.25, 'карточка: ' + JSON.stringify(card));
      // A touch right away (the steering thumb) does not pick.
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: card.x, y: card.y, button: 'left', clickCount: 1 });
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: card.x, y: card.y, button: 'left', clickCount: 1 });
      assert.ok(await evaluate('!!window.__waves.run.world.s.choice'), 'карточка выбрана касанием в первые доли секунды');
      const cards = await shot('cards-' + width);
      await pause(450);
      const level = await evaluate('window.__waves.run.world.s.level');
      await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: card.x, y: card.y, button: 'left', clickCount: 1 });
      await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: card.x, y: card.y, button: 'left', clickCount: 1 });
      await until('!window.__waves.run.world.s.choice || !!document.querySelector(".ws-card")', 'выбор');
      assert.ok(await evaluate('!!window.__game.state.meta.live'), 'снимка после выбора нет');
      // Pause and put the run aside.
      await until('!window.__waves.run.world.s.choice', 'конец выбора', 4000).catch(async () => {
        await evaluate('(()=>{const w=window.__waves.run.world;while(w.s.choice)WaveWorld.pick(w,0);})()');
      });
      await cdp('Input.dispatchKeyEvent', { type: 'keyDown', code: 'KeyP', key: 'p' });
      await cdp('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyP', key: 'p' });
      await until('document.querySelector(".ws-over.pause") && !document.querySelector(".ws-over").hidden', 'пауза');
      const t1 = await evaluate(TEXT);
      assert.ok(!t1.bad, 'NaN на паузе');
      const paused = await shot('pause-' + width);
      const btn = await evaluate('[...document.querySelectorAll(".ws-over .g-btn")].map(b=>{const r=b.getBoundingClientRect();return [b.textContent.trim(),Math.round(r.bottom),Math.round(r.height)]})');
      assert.ok(btn.every((b) => b[1] <= height && b[2] >= 44), 'кнопки паузы: ' + JSON.stringify(btn));
      const at = await evaluate('window.__waves.run.world.s.t');
      await evaluate('[...document.querySelectorAll(".ws-over .g-btn")].find(b=>/Отложить/.test(b.textContent)).click()');
      await until('!window.__waves.run.active && /Продолжить забег/.test(document.querySelector(".ws-actions").textContent)', 'хаб с отложенным забегом');
      await evaluate('document.querySelector(".ws-actions .g-btn.primary").click()');
      await until('window.__waves.run.active && /Забег на паузе/.test(document.querySelector(".ws-over").textContent)', 'забег на паузе');
      const back = await evaluate('window.__waves.run.world.s.t');
      assert.ok(Math.abs(back - at) < 0.5, 'вернулся не с той секунды: ' + at + ' → ' + back);
      await evaluate('[...document.querySelectorAll(".ws-over .g-btn")].find(b=>/Продолжить/.test(b.textContent)).click()');
      await until('document.querySelector(".ws-over.count")', 'отсчёт');
      await until('document.querySelector(".ws-over").hidden || !!window.__waves.run.world.s.choice', 'конец отсчёта', 6000);
      // The end of the run.
      await evaluate('(()=>{const w=window.__waves.run.world;w.s.choice=null;w.s.hp=0;w.s.revives=0;w.s.over=true;w.s.won=false;w.s.ended="dead";})()');
      await until('!!document.querySelector(".ws-result")', 'итог забега');
      const t2 = await evaluate(TEXT);
      assert.ok(!t2.bad, 'NaN в итоге');
      const result = await shot('result-' + width);
      assert.ok(await evaluate('window.__game.state.meta.live === null && window.__game.state.meta.totals.runs >= 1'), 'забег не засчитан');
      await evaluate('[...document.querySelectorAll(".ws-over .g-btn")].find(b=>/мастерскую/.test(b.textContent)).click()');
      await until('!window.__waves.run.active && !!document.querySelector(".ws-last")', 'хаб после забега');
      report.push({ width, hub, stage, cards, paused, result, hero: Math.round(moved - hx) });
    }
    // English: the game's i18n-en.json as the dictionary of the kit; what it lacks on the screens seen.
    dictionary = fs.readFileSync(path.join(GAME, 'i18n-en.json'), 'utf8');
    await cdp('Page.navigate', { url: 'http://127.0.0.1:' + port + '/modules/games/' + ID + '/ui/index.html' });
    await until('!!window.__game && !!document.querySelector(".ws-tabs .ws-tab")', 'хаб по-английски');
    for (let i = 0; i < 3; i++) {
      await evaluate('document.querySelectorAll(".ws-tabs .ws-tab")[' + i + '].click()');
      await pause(80);
    }
    await evaluate('document.querySelectorAll(".ws-tabs .ws-tab")[0].click()');
    await evaluate('document.querySelector(".ws-actions .g-btn.primary").click()');
    await until('!!window.__waves.run.active', 'забег по-английски');
    await evaluate('(()=>{const w=window.__waves.run.world;w.s.hmax=100000;w.s.hp=100000;for(let i=0;i<60*120&&!w.s.choice&&!w.s.over;i++)WaveWorld.step(w,0.3,0.2);})()');
    await until('!!document.querySelector(".ws-card")', 'карточки по-английски');
    const english = await shot('english-cards-760');
    await evaluate('document.querySelector(".ws-pause").click()');
    await pause(150);
    const missed = await evaluate('Object.keys(window.__i18nMissed || {})');
    console.log('  по-английски без перевода на увиденных экранах: ' + missed.length + (missed.length ? ' — ' + missed.slice(0, 40).join(' | ') : ''));
    report.push({ english });
    assert.deepStrictEqual(faults, [], 'ошибки консоли, моста или сети');
    console.log(JSON.stringify({ screens: report, errors: faults }, null, 2));
    console.log('browser wave-survival: прошло (344 и 760 точек, ошибок консоли нет)');
  } finally {
    if (socket) socket.close();
    child.kill();
    await new Promise((resolve) => server.close(resolve));
    env.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
