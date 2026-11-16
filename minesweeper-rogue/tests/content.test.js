'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {test, done} = require(path.join(process.env.ASSI_ROOT || path.resolve(__dirname, '../../../Assi'), 'scripts/games/harness.js'));
const root = path.resolve(__dirname, '..');
const json = name => JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
test('полный каталог: 10 инструментов, 20 талисманов, 5 сапёров, 6 улучшений, 4 хозяина, 12 глубин',()=>{
  const finds=json('content/finds.json');
  assert.equal(finds.filter(x=>x.kind==='tool').length,10);
  assert.equal(finds.filter(x=>x.kind==='talisman').length,20);
  assert.equal(new Set(finds.map(x=>x.id)).size,30);
  assert.equal(json('content/sappers.json').length,5);
  assert.equal(json('content/workshop.json').length,6);
  assert.equal(json('content/bosses.json').length,4);
  assert.deepEqual(json('content/depths.json').map(x=>x.n),Array.from({length:12},(_,i)=>i+1));
});
test('манифест подключает руду к ставке, Пассажира и заряд Щупа от шагов',()=>{
  const game=json('game.json');
  assert.equal(game.links.bet.currency,'ore');
  assert.equal(game.currencies.find(x=>x.id==='ore').path,'meta.ore');
  assert.equal(game.links.passenger.income,true);
  assert(game.links.steps.spend.some(x=>x.id==='probe-start'));
  assert.equal(game.prestige[0].id,'depth');
  assert.deepEqual(game.achievements.map(x=>x.id),['flawless','no-tools','depth-12','cells-10000']);
});
test('семь размеров и ключевые параметры совпадают со спецификацией',()=>{
  const cfg=json('config.json');
  const fields=[[7,9,10],[8,11,14],[8,12,18],[9,13,22],[9,14,26],[9,16,30],[9,16,28]];
  fields.forEach((a,i)=>assert.deepEqual(['w','h','mines'].map(k=>cfg['field.'+i+'.'+k].value),a));
  assert.equal(cfg.flagHoldMs.value,300);
  assert.equal(cfg.scrollCancelPx.value,8);
  assert.equal(cfg.enumLimit.value,24);
  assert.equal(cfg.repairTries.value,40);
  assert.equal(cfg.pregen.value,2);
  assert.equal(cfg['start.hearts'].value,3);
  assert.equal(cfg['workshop.growth'].value,1.4);
});
done('content minesweeper-rogue');
