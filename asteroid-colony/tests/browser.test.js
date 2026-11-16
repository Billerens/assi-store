'use strict';
// Local Chromium check with the real Assi engine, a temporary harness workspace and local bridge.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { spawn } = require('child_process');
const { load } = require('./support');
const { FACTORY } = require(path.join(process.env.ASSI_ROOT || path.resolve(__dirname, '../../../Assi'), 'scripts/games/harness.js'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function run() {
  const x = load();
  const main = x.env.require('modules/games/main.js');
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'asteroid-colony-browser-'));
  fs.cpSync(path.join(FACTORY, 'ui', 'kit'), path.join(x.env.root, 'ui', 'kit'), { recursive: true });
  const faults = [];
  const english = Object.assign({}, JSON.parse(fs.readFileSync(path.join(FACTORY, 'ui', 'i18n', 'en.json'), 'utf8')), JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'i18n-en.json'), 'utf8')));
  const stub = `<script>window.assi={call:async function(module,fn,...args){const r=await fetch('/__call',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fn,args})}); const out=await r.json();if(out.error)throw new Error(out.error);return out.value;},native:async()=>({}),stage:async()=>true,on:()=>()=>{},back:()=>{},open:async()=>true};</script>`;
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === '/__call') {
        let body = '';
        for await (const chunk of req) body += chunk;
        const { fn, args } = JSON.parse(body);
        if (typeof main[fn] !== 'function') throw new Error('No bridge method ' + fn);
        const value = await main[fn].apply(main, args);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ value }));
        return;
      }
      const relative = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
      const file = path.resolve(x.env.root, relative);
      if (!file.startsWith(x.env.root + path.sep)) throw new Error('Invalid local path');
      if (!fs.existsSync(file)) {
        if (!relative.endsWith('favicon.ico')) faults.push('404 ' + relative);
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
      const ext = path.extname(file);
      res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml' })[ext] || 'application/octet-stream');
      let value = fs.readFileSync(file);
      if (ext === '.html') {
        const language = req.url.includes('lang=en') ? '<script>window.__lang="en";window.__i18n=' + JSON.stringify(english).replace(/</g, '\\u003c') + ';</script>' : '';
        value = value.toString().replace('<body>', '<body>' + language + stub);
      }
      res.end(value);
    } catch (error) {
      faults.push(String(error.stack));
      res.statusCode = 500;
      res.end(JSON.stringify({ error: error.message }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
  assert.ok(chrome, 'Local Chromium required');
  const child = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + scratch, '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-sync', '--disable-extensions', '--disable-gpu', 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let socket;
  try {
    const portFile = path.join(scratch, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await pause(100);
    assert.ok(fs.existsSync(portFile), 'Chromium did not start');
    const debugPort = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    const targets = await (await fetch('http://127.0.0.1:' + debugPort + '/json/list')).json();
    socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let serial = 0;
    const pending = new Map();
    socket.onmessage = event => {
      const m = JSON.parse(event.data);
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id); pending.delete(m.id);
        if (m.error) p.reject(new Error(JSON.stringify(m.error))); else p.resolve(m.result);
      }
      if (m.method === 'Runtime.exceptionThrown') faults.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') faults.push(m.params.args.map(a => a.value || a.description).join(' '));
    };
    function cdp(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++serial;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
        setTimeout(() => { if (pending.delete(id)) reject(new Error('CDP timeout ' + method)); }, 20000).unref();
      });
    }
    async function evaluate(expression) {
      const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    }
    await cdp('Runtime.enable');
    await cdp('Page.enable');
    const report = [];
    for (const width of [344, 411, 760]) {
      const height = width === 411 ? 914 : 900;
      await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await cdp('Page.navigate', { url: 'http://127.0.0.1:' + port + '/modules/games/asteroid-colony/ui/index.html' + (width === 411 ? '?lang=en' : '') });
      let ready = false;
      for (let i = 0; i < 150; i++) {
        ready = await evaluate('!!window.__game && !!document.querySelector(".ac-tabs")');
        if (ready) break;
        await pause(100);
      }
      assert.ok(ready, 'UI not ready at ' + width + ': ' + faults.join('\n'));
      await pause(100);
      const bounds = await evaluate(`(()=>{const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}};return {width:innerWidth,body:document.documentElement.scrollWidth,tabs:rect(document.querySelector('.ac-tabs')),buttons:[...document.querySelectorAll('.ac-tabs button')].map(rect),text:document.body.innerText}})()`);
      assert.ok(bounds.body <= width, 'horizontal overflow ' + JSON.stringify(bounds));
      assert.ok(bounds.tabs.bottom <= height + 1, 'tabs outside viewport');
      assert.ok(bounds.buttons.every(b => b.height >= 44 && b.width >= 44), 'small tab target');
      if(width === 411){
        const layout = await evaluate(`(()=>{const r=e=>{const b=e.getBoundingClientRect();return {top:b.top,bottom:b.bottom,height:b.height}};return {lang:window.__lang,field:r(document.querySelector('.g-field')),canvas:r(document.querySelector('.world-scene canvas')),panel:r(document.querySelector('.ac-panel')),buy:r(document.querySelector('.ac-buy')),text:document.body.innerText}})()`);
        const shot = await cdp('Page.captureScreenshot', {format:'png',captureBeyondViewport:false});
        fs.writeFileSync(path.join(scratch,'english-411.png'),Buffer.from(shot.data,'base64'));
        assert.equal(layout.lang,'en');assert.ok(layout.text.includes('Drones'),'English UI requested');
        assert.ok(layout.canvas.top>=layout.field.top&&layout.canvas.bottom<=layout.field.bottom+1,'whole scene must fit at 411x914: '+JSON.stringify(layout));
        assert.ok(layout.panel.height>=180,'purchases must keep useful space beside the complete scene');
        assert.ok(layout.buy.top>=layout.panel.top&&layout.buy.bottom<=layout.panel.bottom+1,'first purchase must remain fully visible: '+JSON.stringify(layout));
      }
      for (let i = 0; i < 5; i++) {
        await evaluate(`document.querySelectorAll('.ac-tabs button')[${i}].click()`);
        await pause(40);
      }
      await evaluate(`document.querySelectorAll('.ac-tabs button')[0].click()`);
      const png = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(scratch, 'screen-' + width + '.png'), Buffer.from(png.data, 'base64'));
      if (width === 344) {
        const bought = await evaluate(`(()=>{const g=window.__game; const b=document.querySelector('.ac-buy'); b.click(); return g.state.run.drones[0];})()`);
        assert.ok(bought >= 1, 'first buy through UI');
      }
      await evaluate(`(()=>{const g=window.__game;g.act(s=>{const sim=g.sim;sim.js(s).star=6;s.meta.atlas[6]='binary';sim.RESEARCH.forEach(x=>s.run.research[x.id]=true);sim.BUILDINGS.forEach(x=>s.run.b[x.id]=4);for(const k of ['ore','ice','alloy','water','fuel','chip','data'])s.run[k]=1000000;s.run.drones=[25,10,5,3,2,2,2,1];s.run.drones2=[10,5,2,1,1,1,1,1];s.run.breakers=[30,10,2];s.run.panels=10;s.run.dome=5;s.run.colonists=70;s.run.hangar=2;s.run.auto.dispatch=false;s.run.auto.smelt=false;s.run.event={id:'mirror',until:Date.now()+30000};s.run.eventAt=Date.now()+600000;});g.redraw();})()`);
      for (let i=0; i<5; i++) {
        await evaluate(`document.querySelectorAll('.ac-tabs button')[${i}].click()`);
        await pause(30);
        const result = await evaluate(`(()=>{const a=document.querySelector('#ac-energy').getBoundingClientRect();const b=document.querySelector('.ac-tabs').getBoundingClientRect();return {width:document.documentElement.scrollWidth,energy:a.bottom,tabs:b.bottom,text:document.body.innerText}})()`);
        assert.ok(result.width <= width && result.energy < height && result.tabs <= height + 1, 'advanced layout '+width+' tab '+i);
        assert.ok(!/NaN|Infinity|undefined/.test(result.text), 'bad UI number');
      }
      const colonies = await evaluate(`(()=>{const canvas=document.querySelector('.world-scene canvas');if(canvas){const g=__game,m=ColonyScene.model(g.state,g.config,{}, {star:g.sim.star(g.state)}),r=canvas.getBoundingClientRect();return {canvas:true,width:r.width,star:m.star.id,second:m.drones2};}const p=document.querySelector('.ac-asteroids').getBoundingClientRect();return [...document.querySelectorAll('.ac-rock')].map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,parentRight:p.right,display:getComputedStyle(e).display}})})()`);
      if(colonies.canvas){assert.ok(colonies.width>0);assert.equal(colonies.star,'binary');assert.equal(colonies.second,8,'second asteroid uses actual drone roster');}
      else {assert.strictEqual(colonies.length,2);assert.ok(colonies.every(r=>r.width>0&&r.right<=r.parentRight+1&&r.display!=='none'),'both binary colonies visible: '+JSON.stringify(colonies));}
      await evaluate(`document.querySelectorAll('.ac-tabs button')[1].click()`);
      const advanced = await cdp('Page.captureScreenshot', { format:'png', captureBeyondViewport:false });
      fs.writeFileSync(path.join(scratch,'advanced-'+width+'.png'),Buffer.from(advanced.data,'base64'));
      report.push({ width, horizontalOverflow: false, tabsVisible: true, allFiveTabs: true, advancedState: true, screenshot: path.join(scratch, 'screen-' + width + '.png') });
    }
    await evaluate(`(()=>{const g=window.__game;g.act(s=>{s.run.panels=1;s.run.reactor=0;s.run.exps=[{k:0,from:Date.now()-120000,until:Date.now()-60000}];});return g.debug.offline(0.05);})()`);
    const summary=await evaluate('document.body.innerText');
    assert.ok(summary.includes('Руда:')&&summary.includes('→')&&summary.includes('Вернулись:')&&summary.includes('Дефицит энергии:'),'detailed real-engine offline summary');
    assert.ok(!/NaN|Infinity|undefined/.test(summary),'bad offline summary number');
    assert.deepStrictEqual(faults, [], 'console/bridge/network errors');
    console.log(JSON.stringify({ screens: report, errors: faults, scratch }, null, 2));
  } finally {
    if (socket) socket.close();
    child.kill();
    await new Promise(resolve => server.close(resolve));
    x.env.close();
  }
}
// Run all CDP control code from our own temporary directory, never the user's desktop.
if (process.env.ASTEROID_CDP_RUNNER === '1') {
  run().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const runnerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asteroid-colony-cdp-'));
  const runnerFile = path.join(runnerDir, 'runner.cjs');
  const source = fs.readFileSync(__filename, 'utf8').replace("require('./support')", 'require(' + JSON.stringify(path.join(__dirname, 'support.js')) + ')').replace("path.join(__dirname, '..', 'i18n-en.json')", JSON.stringify(path.join(__dirname, '..', 'i18n-en.json')));
  fs.writeFileSync(runnerFile, source);
  const result = require('child_process').spawnSync(process.execPath, [runnerFile], {
    stdio: 'inherit', windowsHide: true, env: Object.assign({}, process.env, { ASTEROID_CDP_RUNNER: '1' })
  });
  if (result.error) throw result.error;
  process.exitCode = result.status === null ? 1 : result.status;
}





