// Local, offline desktop preview. Run with Node, then open the printed loopback address.
// It copies the real engine and kit to an isolated temporary workspace; Axiko is a small stub.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { FACTORY, HUB } = require(path.join(process.env.AXIKO_ROOT || path.resolve(__dirname, '../../../Axiko'), 'scripts/games/harness.js'));
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'minesweeper-rogue-preview-'));
const gameRoot = path.resolve(__dirname, '..');
fs.cpSync(path.join(HUB, 'engine'), path.join(root, 'modules/games/engine'), {recursive: true});
fs.cpSync(path.join(FACTORY, 'ui/kit'), path.join(root, 'ui/kit'), {recursive: true});
const Core = require(path.join(HUB, 'engine/core.js'));
const stub = `
window.previewErrors=[];
window.addEventListener('error',e=>window.previewErrors.push(e.message));
window.addEventListener('unhandledrejection',e=>window.previewErrors.push(String(e.reason)));
window.axiko={
 on:()=>{},stage:async()=>{},back:()=>{},native:async()=>({language:'ru'}),
 call:async function(module,op,...a){
  if(op==='boot')return fetch('/__boot').then(r=>r.json());
  if(op==='save'){window.previewSaved=a[2];return {ok:true,seq:a[1]};}
  if(op==='links')return {mult:1,passenger:{on:false},steps:{on:false},bet:{on:false}};
  if(op==='config')return fetch('/__boot').then(r=>r.json()).then(b=>b.config);
  if(op==='stockTake')return null;
  if(op==='inbox'||op==='older'||op==='saves'||op==='segments')return [];
  if(op==='stockStatus')return {};
  if(op==='spend')return {ok:false,off:true};
  return {ok:true};
 }
};
`;
const page = `<!doctype html><html lang="ru"><meta charset="utf-8"><title>Сапёр-рогалик — проверка 344 и 760</title>
<style>body{background:#101114;color:#ddd;font:16px system-ui;margin:16px}main{display:flex;gap:16px;align-items:start}iframe{border:1px solid #555;height:820px}pre{white-space:pre-wrap}button{min-height:44px;font:inherit}</style>
<h1>Сапёр-рогалик · 344 / 760 px</h1><p>Настоящий движок, локальная заглушка Axiko. Сохранения этого просмотра изолированы.</p>
<button id="check">Проверить экран</button> <button id="start">Открыть первую клетку</button> <button id="rock">Проверить длинное поле</button>
<pre id="report">Ожидание загрузки…</pre>
<main><section>344 px<br><iframe title="344 px" width="344" src="/modules/games/minesweeper-rogue/ui/index.html?testwidth=344"></iframe></section><section>760 px<br><iframe title="760 px" width="760" src="/modules/games/minesweeper-rogue/ui/index.html?testwidth=760"></iframe></section></main>
<script>
function report(){var out=[];document.querySelectorAll('iframe').forEach(function(f){var w=f.contentWindow,d=w.document,g=w.__game,c=d.querySelector('.mr-cell,[data-cell]');out.push({width:w.innerWidth,loaded:!!g,error:d.querySelector('.g-error')?.textContent||null,errors:w.previewErrors||[],overflow:d.documentElement.scrollWidth>w.innerWidth,cell:c?{w:c.getBoundingClientRect().width,h:c.getBoundingClientRect().height}:null,state:g?g.state.run.status:null,worker:typeof w.Worker});});document.getElementById('report').textContent=JSON.stringify(out,null,2);fetch('/__report',{method:'POST',body:JSON.stringify(out)});}
document.getElementById('check').onclick=report;
document.getElementById('start').onclick=function(){document.querySelectorAll('iframe').forEach(function(f){var w=f.contentWindow,g=w.__game;if(!g)return;g.act(function(s){if(s.run.status==='ready')w.GameSim.startRun(s,g.config,{seed:73},{rng:g.rng});var i=Math.floor((s.run.field?.w||7)/2);return w.GameSim.tap(s,i,g.config,1);},{now:true});g.redraw();});setTimeout(report,100);};
document.getElementById('rock').onclick=function(){document.querySelectorAll('iframe').forEach(function(f){var w=f.contentWindow,g=w.__game;if(!g)return;g.act(function(s){if(s.run.status==='ready')w.GameSim.startRun(s,g.config,{seed:73},{rng:g.rng});s.run.fieldIndex=4;s.run.status='shop';w.GameSim.advance(s,g.config);w.GameSim.tap(s,4,g.config,1);},{now:true});g.redraw();});report();};
setTimeout(report,2500);
</script></html>`;
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/__report'&&req.method==='POST'){
    let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{fs.writeFileSync(path.join(root,'report.json'),body);console.log(body);res.end('ok');});return;
  }
  if(url.pathname==='/__boot'){
    const game=JSON.parse(fs.readFileSync(path.join(gameRoot,'game.json'),'utf8'));
    const own=JSON.parse(fs.readFileSync(path.join(gameRoot,'config.json'),'utf8'));
    const config=Core.config(Core.schema(own,game),{},null);
    config['sound.on']=false;config['vibro.on']=false;
    res.setHeader('Content-Type',mime['.json']);res.end(JSON.stringify({game,config,rows:[],lastSeq:0,features:[],stock:{},links:{mult:1},audio:{headphones:false,silent:true}}));return;
  }
  if(url.pathname==='/'){res.setHeader('Content-Type',mime['.html']);res.end(page);return;}
  const prefix='/modules/games/minesweeper-rogue/';
  const base=url.pathname.startsWith(prefix)?gameRoot:root;
  const suffix=url.pathname.startsWith(prefix)?url.pathname.slice(prefix.length):url.pathname.slice(1);
  const filename=path.resolve(base,suffix);
  if(!filename.startsWith(path.resolve(base)+path.sep)){res.writeHead(403);res.end();return;}
  try {
    let body=fs.readFileSync(filename);
    if(filename.endsWith(path.join('ui','index.html'))&&base===gameRoot){
      body=body.toString('utf8').replace('<body>','<body><script>'+stub+'<\/script>');
    }
    res.setHeader('Content-Type',mime[path.extname(filename)]||'application/octet-stream');res.end(body);
  } catch {res.writeHead(404);res.end('Not found');}
}).listen(0,'127.0.0.1',function(){console.log('Preview: http://127.0.0.1:'+this.address().port);console.log('Temporary workspace: '+root);});
