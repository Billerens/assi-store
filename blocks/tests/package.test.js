'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { test, done, workspace, gameOf, engine } = require(path.join(process.env.AXIKO_ROOT || path.resolve(__dirname, '../../../Axiko'), 'scripts/games/harness.js'));
const root = path.resolve(__dirname, '..');
const Core = engine('core.js');
function walk(dir) {
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(d => d.isDirectory() ? walk(path.join(dir,d.name)) : [path.join(dir,d.name)]);
}
const files = walk(root);
test('JS syntax, Rhino subset, offline scan and CSS rules', () => {
  for (const file of files.filter(f=>/\.c?js$/.test(f))) execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
  for (const name of ['board.js','sim.js','levels.js','checks.js','bot.js']) {
    if (fs.existsSync(path.join(root,name))) assert.deepEqual(Core.lint(fs.readFileSync(path.join(root,name),'utf8'),name==='checks.js'),[],name);
  }
  const texts=files.filter(f=>/\.(c?js|html|css|json|svg|md)$/.test(f)).map(f=>({path:path.relative(root,f),text:fs.readFileSync(f,'utf8')}));
  assert.deepEqual(Core.offlineScan(texts),[]);
  const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
  for (const f of texts) {
    assert.ok(!emoji.test(f.text),'emoji in '+f.path);
    if (f.path.endsWith('.css')) for(const line of f.text.split('\n')) {
      assert.ok(!/;\s*[a-z-]+\s*:/.test(line),'multiple declarations '+f.path+': '+line);
      assert.ok(!/\{\s*[a-z-]+\s*:[^}]*;?\s*\}/.test(line),'inline CSS '+line);
      assert.ok(!/\b(box-shadow|text-shadow|drop-shadow)\b/.test(line)||/\bnone\b/.test(line),'shadow '+line);
    }
  }
  console.log('  syntax: '+files.filter(f=>/\.c?js$/.test(f)).length+' JS, shared lint: 5 files, offline scan: '+texts.length+' files');
});
test('All runtime config references and content are present', () => {
  const cfg=JSON.parse(fs.readFileSync(path.join(root,'config.json'),'utf8'));
  for(const name of ['sim.js','board.js','ui/game.js']) {
    const text=fs.readFileSync(path.join(root,name),'utf8');
    for(const m of text.matchAll(/(?:cfg|config)\[['"]([^'"]+)['"]\]/g)) assert.ok(cfg[m[1]] || Core.SETTINGS[m[1]],'missing config '+m[1]);
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'content/upgrades.json'),'utf8')).length,20);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'content/themes.json'),'utf8')).length,5);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,'content/challenges.json'),'utf8')).levels.length,60);
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'store.json'),'utf8'));
  assert.equal(manifest.target,'modules/games/blocks');
});
test('Axiko harness: installed package and engine checks', () => {
  const env=workspace({fixture:false});
  assert.ok(path.resolve(env.root).startsWith(path.resolve(os.tmpdir())+path.sep),'temporary harness workspace');
  try {
    const dest=path.join(env.root,'modules/games/blocks');
    // Match axiko-store/install.ps1: development tools are copied, tests and store metadata are not.
    const excluded = ['store.json', 'README.md', 'tests', '_data'];
    fs.cpSync(root,dest,{recursive:true,filter:f=>!excluded.includes(path.relative(root,f).split(path.sep)[0])});
    const x=gameOf(env,'blocks');
    const hub=env.require('modules/games/main.js');
    assert.ok(hub.games().some(g=>g.id==='blocks'));
    assert.ok(hub.offlineCheck('blocks').ok);
    const checks=env.require('modules/games/blocks/checks.js');
    let passed=0;
    const skipped=[];
    const skipToken={};
    for(const [name,fn] of Object.entries(checks)) {
      if(name.includes('экран открывается')) {skipped.push(name+' (separate headless Chrome/CDP check at 344 and 760 px)');continue;}
      try {
        fn({ok:(v,m)=>assert.ok(v,m),equal:(a,b,m)=>assert.deepEqual(a,b,m),throws:fn=>assert.throws(fn),skip:m=>{skipped.push(name+': '+m);throw skipToken;}});
        passed++;
      }catch(err){if(err!==skipToken)throw new Error(name+': '+err.stack);}
    }
    const ctx={now:Date.UTC(2026,10,14),rng:x.Rng.make(5),config:x.cfg,mult:1};
    const state=x.Core.newState(x.game,x.sim,ctx);
    assert.equal(x.sim.migrate(state,1),state,'version one migration is identity');
    assert.equal(x.Core.validate(state,x.game),null);
    console.log('  module checks: '+passed+' passed; '+skipped.length+' explicit skips: '+skipped.join('; '));
  } finally {env.close();}
});
done('Блоки: пакет');
