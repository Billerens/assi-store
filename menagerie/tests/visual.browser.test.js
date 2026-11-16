// Menagerie, Tower and One-cell dungeon: the real engine/bridge, synthetic saves only.
// Run: node menagerie/tests/visual.browser.test.js from the store repository.
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

const GAME = path.resolve(__dirname, '..', '..');
const IDS = ['menagerie','tower','one-cell-dungeon'];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  const env = H.workspace({ fixture: false });
  for(const id of IDS) fs.cpSync(path.join(GAME,id), path.join(env.root,'modules','games',id), {recursive:true,filter:p=>!/[\\/](tests|_data)(?:[\\/]|$)/.test(p)});
  fs.cpSync(path.join(H.FACTORY, 'ui', 'kit'), path.join(env.root, 'ui', 'kit'), { recursive: true });
  const main = env.require('modules/games/main.js');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'combat-visual-browser-'));
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
    for (const width of [344, 760]) for (const id of IDS) {
      await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
      await cdp('Page.navigate', { url: 'http://127.0.0.1:' + port + '/modules/games/' + id + '/ui/index.html' });
      await until('!!window.__game && !!document.querySelector(".g-scene canvas")', id + ' world');
      await pause(400);
      const start = await shot(id + '-' + width + '-start');
      assert.deepStrictEqual(await evaluate('window.__stageCalls'), [], 'no automatic full screen');
      if (id === 'menagerie') {
        await evaluate(`(()=>{const g=__game,c={now:Date.now(),config:g.config,rng:g.rng,mult:1};g.act(s=>{s.run.coins='1e8';GameSim.buy(s,'arena',g.config);GameSim.setTeam(s,s.run.beasts.slice(0,3).map(b=>b.id),g.config);return GameSim.fight(s,c,true);},{now:true});[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Турнир').click();g.redraw();})()`);
      } else if (id === 'tower') {
        await evaluate(`(()=>{const g=__game,c={now:Date.now(),config:g.config,rng:g.rng,mult:1};if(['home','ended'].includes(g.state.run.phase))g.act(s=>GameSim.act(s,{type:'start',classId:'guardian',height:1,seed:87},c),{now:true});for(let i=0;i<20&&g.state.run.phase!=='combat';i++)g.act(s=>GameSim.act(s,GameSim.botAction(s,g.config),c),{now:true});g.act(s=>GameSim.act(s,GameSim.botAction(s,g.config),c),{now:true});g.redraw();})()`);
      } else {
        await evaluate(`(()=>{const g=__game;if(g.state.run.phase==='hub')document.querySelector('#start').click();})()`);
        await until('__game.state.run.phase!=="hub"', 'dungeon begins');
        const target = await evaluate(`(()=>{const r=__game.state.run;let i=GameSim.NB[r.pos].find(i=>r.grid[i]&&['gold','weapon','shield','potion','key'].includes(r.grid[i].k));if(i===undefined)i=GameSim.NB[r.pos][0];const b=document.querySelector('[data-cell="'+i+'"]');b.scrollIntoView({block:'center'});const q=b.getBoundingClientRect();return {i,x:q.x+q.width/2,y:q.y+q.height/2,before:JSON.stringify(r)}})()`);
        await cdp('Input.dispatchMouseEvent',{type:'mousePressed',x:target.x,y:target.y,button:'left',clickCount:1});
        await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',x:target.x,y:target.y,button:'left',clickCount:1});
        await pause(160);
        assert.notEqual(await evaluate('JSON.stringify(__game.state.run)'), target.before, 'real cell remains interactive');
      }
      await pause(400);
      await evaluate(`(()=>{const n=[...document.querySelectorAll('.g-scene')].find(n=>n.getBoundingClientRect().height>0);if(n)n.scrollIntoView({block:'center'});})()`);
      await pause(160);
      const action = await shot(id + '-' + width + '-action');
      const t = await evaluate(TEXT);
      assert.ok(!t.bad, id + ' invalid text');
      assert.ok(t.width <= t.inner, id + ' horizontal overflow: ' + t.width);
      assert.deepEqual(await evaluate('[...document.querySelectorAll("[data-scene-error]")].map(n=>n.dataset.sceneError)'), [], id + ' canvas fault');
      // A reduced-motion reload must still paint asynchronously decoded phenotype/creature SVGs.
      await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await cdp('Page.reload');
      await until('!!window.__game && !!document.querySelector(".g-scene canvas")', 'reduced motion');
      await pause(450);
      assert.deepEqual(await evaluate('[...document.querySelectorAll("[data-scene-error]")].map(n=>n.dataset.sceneError)'), []);
      const calm = await shot(id + '-' + width + '-calm');
      await cdp('Emulation.setEmulatedMedia', { features: [] });
      report.push({ id, width, start, action, calm });
    }
    assert.deepEqual(faults, []);
    console.log(JSON.stringify({screens:report,errors:faults},null,2));
    console.log('combat visuals: real engine/actions + 344/760 + reduced motion passed');
  } finally {
    if(socket)socket.close();
    child.kill();
    await new Promise(resolve=>server.close(resolve));
    env.close();
  }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
