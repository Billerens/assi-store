// Real Chromium regression for definitions, persistence and narrow/wide layouts. No device access.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { spawn } = require('child_process');
const H = require(path.join(process.env.AXIKO_ROOT || path.resolve(__dirname, '../../../Axiko'), 'scripts/games/harness.js'));

const GAME = path.resolve(__dirname, '..');
const ID = 'word-weaver';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  const env = H.workspace({ fixture: false });
  fs.cpSync(GAME, path.join(env.root, 'modules', 'games', ID), { recursive: true, filter: (p) => !/[\\/](tests|_data)(?:[\\/]|$)/.test(path.relative(GAME, p) ? '/' + path.relative(GAME, p) : '') });
  fs.cpSync(path.join(H.FACTORY, 'ui', 'kit'), path.join(env.root, 'ui', 'kit'), { recursive: true });
  fs.cpSync(path.join(GAME, '_data'), path.join(env.root, 'data/games/word-weaver'), { recursive: true });
  fs.writeFileSync(path.join(env.root, 'data/games/word-weaver/defs.json'), JSON.stringify({катер:'Небольшое моторное судно.'}));
  const main = env.require('modules/games/main.js');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'word-weaver-browser-'));
  const faults = [];
  let dictionary = '';
  const stub = '<script>window.__stageCalls=[];window.axiko={platform:"web",call:async function(module,fn){if(fn==="defs")return {defs:window.__testModelDefs||{}};if(fn==="check")return {answers:[]};var args=Array.prototype.slice.call(arguments,2);var r=await fetch("/__call",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({fn:fn,args:args})});var out=await r.json();if(out.error)throw new Error(out.error);return out.value;},native:async function(){return {};},stage:async function(on){window.__stageCalls.push(on);return true;},on:function(){return function(){};},back:function(){},open:async function(){return true;}};</script>';
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
    const screens = [];
    for (const width of [344, 760, 1280]) {
      await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
      await cdp('Page.navigate', { url: 'http://127.0.0.1:' + port + '/modules/games/' + ID + '/ui/index.html' });
      await until('!!window.__ww && !!GameSim.current(window.__game.state)', 'Словоплёт готов');
      assert.deepStrictEqual(await evaluate('window.__stageCalls'), [], 'web game must stay in its pane');
      await evaluate(`window.__game.act(s=>{s.run.sets=[{id:543,seed:'катер',letters:'катер',found:[],hints:{},hinted:false,at:Date.now()}];s.run.cur=543;});window.__ww.submit('катер');`);
      await until('document.querySelector(".ww-last-word").textContent.includes("Небольшое моторное судно.")', 'толкование сразу');
      await pause(3000);
      assert.ok(await evaluate('!document.querySelector(".ww-last-word").hidden && document.querySelector(".ww-last-word").textContent.includes("Небольшое моторное судно.")'), 'definition persists after old toast duration');
      await evaluate('window.__ww.submit("ккк")');
      assert.ok(await evaluate('document.querySelector(".ww-last-word").textContent.includes("Небольшое моторное судно.")'), 'invalid guess keeps previous definition');
      const shape = await evaluate(TEXT);
      assert.ok(!shape.bad && shape.width <= shape.inner, 'layout at ' + width + ': ' + JSON.stringify(shape));
      if (width === 344) {
        await evaluate('window.__game.act(s=>{s.run.b.typography=1})');
        assert.ok(await evaluate('document.querySelector("#album-peek").textContent.includes("Небольшое моторное судно.")'), 'typography unlocks inline album on a narrow screen');
      }
      screens.push(await shot('definition-' + width));
      if (width === 1280) {
        await evaluate('window.__ww.submit("река")');
        assert.ok(await evaluate('document.querySelector(".ww-last-word").textContent.includes("ещё готовится")'), 'missing definition has a persistent loading state');
        await evaluate('window.__testModelDefs={"река":"Естественный водный поток."};window.__game.config["defs.everyMin"]=0;window.dispatchEvent(new Event("online"))');
        await until('document.querySelector(".ww-last-word").textContent.includes("Естественный водный поток.")', 'готовое толкование обновилось без нажатия');
      }
      await evaluate('document.querySelector("#album").click()');
      await until('document.querySelector(".ww-sheet .ww-def")', 'альбом открыт');
      await pause(300);
      assert.ok(await evaluate('[...document.querySelectorAll(".ww-sheet .ww-def")].some(e=>e.textContent.includes("Небольшое моторное судно.")) && !document.querySelector(".ww-sheet").innerText.includes("Показать толкование")'), 'album definition is visible without a button or typography');
      screens.push(await shot('album-' + width));
    }
    assert.deepStrictEqual(faults, [], 'browser/bridge faults');
    console.log(JSON.stringify({screens, errors: faults}, null, 2));
    console.log('browser word-weaver: passed at 344, 760, 1280 px');
  } finally {
    if (socket) socket.close();
    child.kill();
    await new Promise(resolve => server.close(resolve));
    env.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
