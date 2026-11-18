'use strict';
// Desktop-only preview. All application writes stay in the harness temporary workspace.
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('node:http');
const {workspace, FACTORY} = require(path.join(process.env.AXIKO_ROOT || path.resolve(__dirname, '../../../Axiko'), 'scripts/games/harness.js'));
const gameRoot = path.resolve(__dirname,'..');
const env = workspace({fixture:false});
if(!path.resolve(env.root).startsWith(path.resolve(os.tmpdir())+path.sep))throw new Error('Unsafe temporary directory');
fs.cpSync(path.join(FACTORY,'ui','kit'),path.join(env.root,'ui','kit'),{recursive:true});
fs.cpSync(gameRoot,path.join(env.root,'modules','games','blocks'),{recursive:true,filter:f=>!['tests','tools'].includes(path.basename(f))});
const hub = env.require('modules/games/main.js');
const diagnostics=[];
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const preview = '<!doctype html><html lang="ru"><meta charset="utf-8"><title>Блоки — проверка 344 и 760</title><style>body{margin:12px;background:#18191c;color:#eee;font:16px system-ui}main{display:flex;gap:20px}iframe{border:1px solid #555;height:840px}p{margin:4px 0 8px}</style><p>Локальная проверка: 344 px и 760 px. Ошибки: <span id="errors">0</span></p><main><iframe title="Внешний экран 344" width="344" src="/modules/games/blocks/ui/index.html?preview=1&width=344"></iframe><iframe title="Развёрнутый экран 760" width="760" src="/modules/games/blocks/ui/index.html?preview=1&width=760"></iframe></main><script>setInterval(async()=>{let r=await fetch("/__reports").then(r=>r.json());document.getElementById("errors").textContent=r.filter(x=>x.kind==="error").length},1000)</script></html>';
const stub = `
window.__previewErrors=[];
function sendReport(data){fetch('/__report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({width:innerWidth},data))}).catch(function(){})}
window.addEventListener('error',function(e){window.__previewErrors.push(e.message);sendReport({kind:'error',message:e.message,stack:e.error&&e.error.stack})});
window.addEventListener('unhandledrejection',function(e){window.__previewErrors.push(String(e.reason));sendReport({kind:'error',message:String(e.reason),stack:e.reason&&e.reason.stack})});
var originalError=console.error;console.error=function(){var args=Array.from(arguments).map(String);sendReport({kind:'error',message:args.join(' ')});originalError.apply(console,arguments)};
window.axiko={on:function(){},stage:function(){return Promise.resolve()},back:function(){},open:function(){return Promise.resolve()},native:function(){return Promise.resolve({language:'ru'})},call:function(module,fn){return fetch('/__call',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fn:fn,args:Array.prototype.slice.call(arguments,2)})}).then(function(r){return r.json()}).then(function(r){if(r.error)throw new Error(r.error);return r.value})}};
var lastReport='';setInterval(function(){var g=window.__game;if(!g)return;var buttons=Array.from(document.querySelectorAll('button')).filter(b=>{var r=b.getBoundingClientRect();return r.width&&r.height});var data={kind:'state',ready:true,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,errors:window.__previewErrors,score:g.state.run.game&&g.state.run.game.score,mode:g.state.run.game&&g.state.run.game.mode,buttons:buttons.length,smallButtons:buttons.filter(b=>b.getBoundingClientRect().height<44).map(b=>({text:b.textContent,h:b.getBoundingClientRect().height})),text:document.body.innerText.slice(0,2000)};var key=JSON.stringify(data);if(key!==lastReport){lastReport=key;sendReport(data)}},500);
`;
async function body(req){let s='';for await(const c of req)s+=c;return JSON.parse(s||'{}');}
function json(res,v){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(v));}
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http'+':'+String.fromCharCode(47,47)+'localhost');
    if(url.pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
    if(url.pathname==='/__reports')return json(res,diagnostics);
    if(url.pathname==='/__report'){diagnostics.push(await body(req));return json(res,{ok:true});}
    if(url.pathname==='/__call'){
      const q=await body(req);
      const allowed=['boot','links','segments','inbox','stockTake','stockStatus','settings','linkSheet','bet','audio','features','screenMode','vibrate','report','inboxClean','session','log','spend'];
      if(!allowed.includes(q.fn))return json(res,{error:'Not a preview method: '+q.fn});
      return json(res,{value:hub[q.fn].apply(hub,q.args||[])});
    }
    if(url.pathname==='/'){res.writeHead(200,{'Content-Type':mime['.html']});return res.end(preview);}
    const decoded=decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const target=path.resolve(env.root,decoded);
    if(!target.startsWith(env.root+path.sep)){res.writeHead(403);return res.end();}
    // Refresh only our source files so CSS and script fixes can be checked without a restart.
    if(decoded.startsWith('modules/games/blocks/')){
      const rel=decoded.slice('modules/games/blocks/'.length);
      const source=path.resolve(gameRoot,rel);
      if(source.startsWith(gameRoot+path.sep)&&fs.existsSync(source)&&fs.statSync(source).isFile()){
        fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);
      }
    }
    if(!fs.existsSync(target)){res.writeHead(404);return res.end('Not found');}
    let value=fs.readFileSync(target);
    if(decoded==='modules/games/blocks/ui/index.html')value=value.toString().replace('<body>','<body><script>'+stub+'</script>');
    res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store'});res.end(value);
  }catch(err){res.writeHead(500);res.end(JSON.stringify({error:err.message}));}
});
server.listen(process.env.BLOCKS_PREVIEW_PORT === undefined ? 8173 : Number(process.env.BLOCKS_PREVIEW_PORT),'127.0.0.1',()=>console.log(JSON.stringify({port:server.address().port,root:env.root})));
module.exports = { server, env };
process.on('SIGINT',()=>server.close(()=>{env.close();process.exit(0)}));
