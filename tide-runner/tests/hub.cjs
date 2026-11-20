'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=process.env.AXIKO_ROOT||path.resolve(__dirname,'../../../assi');
const h=require(path.join(root,'scripts/games/harness.js')),env=h.workspace({fixture:false});
try{
  const src=path.resolve(__dirname,'..');
  fs.cpSync(src,path.join(env.root,'modules/games/tide-runner'),{recursive:true,filter:p=>!['tests','store'].includes(path.basename(p))});
  const checks=env.require('lib/check.js').run('games/tide-runner');
  assert.ok(!checks.missing);
  const relevant=checks.results.filter(r=>!r.name.includes('экран'));
  for(const r of relevant)console.log(r.ok?'PASS':'FAIL',r.name,r.ok?'':r.error);
  assert.deepEqual(relevant.filter(r=>!r.ok).map(r=>r.name+': '+r.error),[]);
}finally{env.close();}
