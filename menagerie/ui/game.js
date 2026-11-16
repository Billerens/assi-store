(function () {
  'use strict';
  var h = ui.h;
  var sim = window.GameSim;
  var art = window.MenagerieArt;
  var icons = window.MenagerieIcons;
  var g;
  var catalog = { species: [], parts: ['Голова','Туловище','Лапы','Хвост','Покров'], qualities: ['Сила','Ловкость','Стойкость','Чутьё'], palette: [], traits: [], upgrades: [], events: [], leagues: [] };
  var view = { tab: 'aviary', selected: null, pair: [], sort: 'total', panel: 'info', album: 'parts', founders: false, detail: false, replayAt: 0, replayStep: Infinity, signature: '', holding: false, busy: false, news: null, fieldNote: null };
  var TABS = [['aviary','Вольер','beast'],['nests','Гнёзда','nest'],['tournament','Турнир','trophy'],['reserve','Заповедник','tree'],['upgrades','Улучшения','gear']];
  GameIcons.add('beast', '<path d="m7 10-3-6 5 3 3-4 3 4 5-3-3 6c6 9-2 12-5 10-3 2-11-1-5-10Z"/><path d="M8 13h.01M16 13h.01m-6 4 2 1 2-1"/>');
  GameIcons.add('nest', '<path d="M3 14c1 9 17 9 18 0M4 17h16M7 20h10M7 14c-3-5 1-11 4-11s7 6 4 11M12 14c-2-3 1-7 3-7s5 4 3 7"/>');
  Sfx.add('hatch', [{type:'triangle',f:[520,780],d:0.13,v:0.22},{at:0.1,type:'sine',f:[780,1040],d:0.18,v:0.2}]);
  Sfx.add('breed', [{type:'sine',f:[260,390],d:0.15,v:0.18},{at:0.12,type:'triangle',f:[390,520],d:0.2,v:0.2}]);
  Sfx.add('battle', [{type:'triangle',f:[180,90],d:0.12,v:0.18}]);
  Sfx.add('victory', [{type:'triangle',f:[392,392],d:0.12,v:0.2},{at:0.12,type:'triangle',f:[494,494],d:0.12,v:0.2},{at:0.24,type:'triangle',f:[587,587],d:0.2,v:0.2}]);
  Sfx.add('release', [{type:'sine',f:[440,660],d:0.3,v:0.18}]);
  function button(text, fn, primary, disabled) { return h('button', {class:'g-btn' + (primary ? ' primary' : ''), onclick:fn, disabled:!!disabled, type:'button'}, text); }
  function small(text, fn, disabled) { var b = button(text, fn, false, disabled); b.classList.add('small'); return b; }
  function note(text) { return h('p', {class:'m-note'}, text); }
  function heading(text, extra) { return h('div', {class:'m-heading'}, h('h2', {}, text), extra || h('span', {})); }
  function ctx() { return {now:Date.now(),config:g.config,rng:g.rng,mult:1}; }
  function lookup(list, id) { return list.filter(function (x) { return x.id === id; })[0]; }
  function beast(id) { return sim.find ? sim.find(g.state, id) : g.state.run.beasts.filter(function (b) { return b.id === id; })[0]; }
  function species(id) { return lookup(catalog.species, id) || {name:'Неизвестный вид',ability:'',part:-1}; }
  function level(id) { return g.state.run.upgrades[id] || 0; }
  function total(b) { return b.genes.reduce(function (a, n) { return a + n; }, 0); }
  function num(n) { return g.fmt(n, {digits:1}); }
  function time(sec) { return g.fmt.time(Math.max(0, Math.ceil(sec))); }
  function ready(b) { return Math.max(0, (b.readyAt || 0) - Date.now()); }
  function rest(b) { return Math.max(0, (b.restUntil || 0) - Date.now()); }
  function invalidate() { view.pointerActive=false; view.signature = ''; g.redraw(); }
  function act(fn, sound) {
    var result = g.act(fn, {now:true,reason:'menagerie-action'});
    if (result === false || result && result.ok === false) {
      ui.toast(result.reason || 'Сейчас это недоступно');
      g.sfx('deny');
      g.buzz('deny');
    } else {
      if (sound) g.sfx(sound);
      g.buzz('tap');
      if (view.world && sound) view.world.pulse(sound === 'breed' || sound === 'release' ? sound : 'upgrade', { action: sound }, 1.5);
    }
    invalidate();
    return result;
  }
  function switchTab(id) { view.tab = id; view.detail = false; view.panel = 'info'; view.founders = false; g.el.field.scrollTop=0; view.left.scrollTop=0; view.right.scrollTop=0; invalidate(); }
  function select(id) { view.selected = id; view.detail = true; view.panel = 'info'; g.el.field.scrollTop=0; invalidate(); }
  function ordered() {
    return g.state.run.beasts.slice().sort(function (a,b) {
      if (view.sort === 'generation') return b.generation - a.generation;
      if (view.sort === 'level') return b.level - a.level;
      if (view.sort !== 'total') return b.genes[Number(view.sort)] - a.genes[Number(view.sort)];
      return total(b) - total(a);
    });
  }
  function sortControl() {
    var select = h('select', {class:'m-select','aria-label':'Сортировка зверей',onchange:function (e) {view.sort = e.target.value; invalidate();}});
    [['total','По сумме'],['0','По силе'],['1','По ловкости'],['2','По стойкости'],['3','По чутью'],['generation','По поколению'],['level','По уровню']].forEach(function (item) {
      select.append(h('option', {value:item[0],selected:item[0] === view.sort}, item[1]));
    });
    return select;
  }
  function bars(b, full) {
    var box = h('div', {class:full ? 'm-quality-full' : 'm-quality-mini'});
    b.genes.forEach(function (value,i) {
      var track = h('span', {class:'m-track'}, h('i', {style:'width:' + Math.min(100,value) + '%'}));
      box.append(h('div', {class:'m-quality',title:catalog.qualities[i] + ': ' + num(value)}, h('span', {class:'m-quality-label'}, icons.el('q' + i, full ? 18 : 15), full ? catalog.qualities[i] : null), track, h('span', {class:'m-quality-number'}, full ? num(value) : Math.round(value))));
    });
    return box;
  }
  function legend() {
    return h('div', {class:'m-legend'}, catalog.qualities.map(function (name,i) { return h('span', {class:'m-legend-item'}, icons.el('q' + i, 16), name); }));
  }
  function card(b, onClick, chosen, suffix) {
    return h('button', {class:'m-card' + (chosen ? ' chosen' : ''),type:'button','aria-pressed':!!chosen,onclick:onClick}, art.draw(b), h('span', {class:'m-card-body'}, h('span', {class:'m-card-top'}, h('strong', {'data-raw':true}, b.name), h('span', {class:'m-card-level'}, suffix || 'Ур. ' + b.level)), bars(b, false)));
  }
  function roster(mode) {
    var list = h('div', {class:'m-roster'});
    ordered().forEach(function (b) {
      var chosen = mode === 'pair' ? view.pair.indexOf(b.id) >= 0 : mode === 'team' ? g.state.run.team.indexOf(b.id) >= 0 : mode === 'founders' ? g.state.run.founders.indexOf(b.id) >= 0 : view.selected === b.id;
      var status = mode === 'pair' ? (b.level < Number(g.config['breed.adultLevel']) ? 'Молодой' : rest(b) ? time(rest(b)/1000) : 'Пок. ' + b.generation) : mode === 'team' ? (b.sick ? 'Хворь' : ready(b) ? time(ready(b)/1000) : 'Готов') : null;
      list.append(card(b, function () {
        if (mode === 'pair') {
          var index = view.pair.indexOf(b.id);
          if (index >= 0) view.pair.splice(index, 1);
          else if (view.pair.length < 2) view.pair.push(b.id);
          else view.pair = [view.pair[1], b.id];
          invalidate();
        } else if (mode === 'team') {
          var ids = g.state.run.team.slice();
          var index = ids.indexOf(b.id);
          if (index >= 0) ids.splice(index,1);
          else ids.push(b.id);
          act(function (s) { return sim.setTeam(s,ids,g.config); });
        } else if (mode === 'founders') {
          var ids = g.state.run.founders.slice();
          var index = ids.indexOf(b.id);
          if (index >= 0) ids.splice(index,1);
          else if (ids.length < 3) ids.push(b.id);
          else ids = ids.slice(1).concat([b.id]);
          act(function (s) { return sim.selectFounders(s,ids); });
        } else select(b.id);
      },chosen,status));
    });
    if (g.state.run.beasts.length) list.prepend(legend());
    if (!g.state.run.beasts.length) list.append(note('Вольер пуст. Дождитесь яйца или приручите дикого гостя.'));
    return list;
  }
  function partList(b) {
    var list = h('div', {class:'m-part-list'});
    b.parts.forEach(function (p,i) {
      var shown = species(p.visible);
      var hidden = p.a === p.visible ? p.b : p.a;
      list.append(h('div', {class:'m-part'}, h('strong', {}, catalog.parts[i]), h('span', {}, shown.name), h('span', {class:'m-note'}, 'Скрытый: ' + species(hidden).name), shown.part === i ? h('span', {class:'m-ability'}, shown.ability) : h('span', {})));
    });
    return list;
  }
  function hold(text, fn) {
    var b = button(text, null);
    b.classList.add('m-danger');
    b.addEventListener('pointerdown', function () { view.holding = true; });
    g.ui.hold(b, g.config['prestige.holdMs'], function () {view.holding = false; fn();});
    return b;
  }
  function release(b, circus) {
    var close;
    var value = circus ? total(b)/4*g.config['event.salePerGene']*g.config['event.circusMult'] : sim.retirementGain(b,g.state,g.config);
    var body = h('div', {class:'m-release'}, heading(circus ? 'Бродячий цирк' : 'Отпустить в заповедник'), art.draw(b,{large:true}), h('h3', {},b.name), note(circus ? 'Зверь покинет вольер. Цирк выплатит тройную стоимость; генофонд за продажу не начисляется.' : 'Зверь покинет вольер и сохранится в родословной. Его качества увеличат общий генофонд.'), note(circus ? 'Награда: ' + g.fmt(value) + ' монет' : 'Генофонд: +' + num(value)), hold('Удерживайте, чтобы отпустить', function () {
      var r = act(function (s) {return circus ? sim.eventAction(s,'sell',b.id,ctx()) : sim.retire(s,b.id,ctx());},'release');
      if (!r || r.ok !== false) { close(); view.detail = false; view.selected = null; invalidate(); }
    }));
    close = g.sheet(body);
  }
  function rename(b) {
    if (view.busy) return;
    view.busy = true;
    // An offline stock: the name that fits the beast's breed (the species most of its parts show)
    // and line (a founder or a descendant of a long pedigree) goes first.
    var counts = {};
    var breed = null;
    (b.parts || []).forEach(function (p) { counts[p.visible] = (counts[p.visible] || 0) + 1; if (breed === null || counts[p.visible] > counts[breed]) breed = p.visible; });
    var prefer = { species: breed === null ? null : species(breed).name, line: (b.generation || 1) > 1 ? 'потомок' : 'основатель' };
    g.stock.take('names', prefer).then(function (item) {
      if (item && !sim.validateStock('names',item)) act(function (s) {var live = sim.find(s,b.id); if (live) live.name = item.title;});
      if (item && item.text) ui.toast(item.text);
    }).catch(function () {ui.toast('Имя пока не найдено');}).finally(function () {view.busy=false;});
  }
  function detail(b) {
    var box = h('div', {class:'m-detail'});
    if (!b) return h('div', {class:'m-empty'}, GameIcons.el('beast'), h('h2', {},'Зверь крупным планом'), note('Выберите карточку: качества, способности и родословная появятся здесь.'));
    box.append(h('div', {class:'m-detail-heading'}, small('К списку',function () {view.detail=false;invalidate();}),h('span', {class:'m-kicker'}, 'Поколение ' + b.generation)), art.draw(b,{large:true}), h('div', {class:'m-title-line'}, h('h2', {},b.name), h('span', {class:'m-badge'},'Уровень ' + b.level)), bars(b,true));
    box.append(h('div', {class:'m-stats'}, g.ui.line('Опыт',num(b.xp)), g.ui.line('Бои', b.fights + ' / ' + sim.retirementLimit(b,g.state,g.config)), g.ui.line('Яйца за жизнь',b.eggs + ' / ' + (g.config['breed.maxEggs'])),g.ui.line('На турнир', ready(b) ? time(ready(b)/1000) : 'Готов'),g.ui.line('Разведение', rest(b) ? time(rest(b)/1000) : b.level >= g.config['breed.adultLevel'] ? 'Готов' : 'С уровня ' + g.config['breed.adultLevel'])));
    var traits = h('div', {class:'m-traits'});
    (b.traits || []).forEach(function (id) { var t = lookup(catalog.traits,id); if (t) traits.append(h('span',{class:'m-badge m-trait',title:t.text},icons.el(t.id,18),t.name)); });
    box.append(traits, partList(b));
    var colors = (b.colors || []).map(function (id) {return catalog.palette[id] ? catalog.palette[id].name : String(id);}).join(' + ');
    box.append(note('Окрас: ' + colors), small('Подобрать имя',function () {rename(b);}),small('Родословная',function () {view.panel='lineage';invalidate();},!level('pedigree')), small('Снять отдых · 1 энергия',function () {spend('rest',b.id);},!rest(b)), small('В заповедник',function () {release(b,false);}));
    if (!level('pedigree')) box.append(note('Родословная на четыре колена откроется после покупки улучшения.'));
    return box;
  }
  function ancestry(b) {
    var box = h('div', {class:'m-lineage'},heading('Родословная'),small('К зверю',function () {view.panel='info';invalidate();}));
    function node(item, depth) {
      if (!item || !item.beast) return note('Предок неизвестен');
      var animal = item.beast;
      var row = h('div', {class:'m-ancestor',style:'--depth:' + depth}, h('strong',{},animal.name),h('span',{class:'m-note'},'Пок. ' + animal.generation + ' · ' + animal.genes.map(function (n) {return Math.round(n);}).join(' / ')));
      var branch = h('div',{class:'m-branch'},row);
      (item.parents || []).forEach(function (parent) {branch.append(node(parent,depth + 1));});
      return branch;
    }
    box.append(note('Сила / Ловкость / Стойкость / Чутьё'),node(sim.ancestry(g.state,b.id,4),0));
    return box;
  }
  function eggs() {
    var box = h('div', {class:'m-eggs'},heading('Гнёзда',h('span',{class:'m-badge'},g.state.run.eggs.length + ' / ' + sim.nests(g.state,g.config))));
    if (!g.state.run.eggs.length) box.append(note('Выберите двух взрослых зверей. Качества яйца определятся при закладке.'));
    g.state.run.eggs.forEach(function (egg) {
      var remaining = Math.max(0,egg.remaining);
      var fill = Math.max(0,Math.min(100,100*(1-remaining/egg.duration)));
      box.append(h('div',{class:'m-egg'},GameIcons.el('nest'),h('div',{},h('strong',{},egg.beast.name),note('Поколение ' + egg.beast.generation + ' · ' + (remaining ? time(remaining) : 'Нужно место в вольере')),h('div',{class:'m-track'},h('i',{style:'width:' + fill + '%'})))));
    });
    box.append(note(level('incubator') ? 'Офлайн: полная скорость высиживания.' : 'Офлайн: половина скорости. Инкубатор сохранит полную.'));
    return box;
  }
  function forecast() {
    var box = h('div',{class:'m-forecast'},heading('Будущая кладка'));
    var parents = view.pair.map(beast).filter(Boolean);
    var pair = h('div',{class:'m-parents'});
    parents.forEach(function (b) {pair.append(h('div',{},art.draw(b),h('strong',{},b.name)));});
    box.append(pair);
    if (parents.length < 2) { box.append(note('Выберите двух родителей слева или выше. Повторное касание отменяет выбор.')); return box; }
    var generation = Math.max(parents[0].generation,parents[1].generation) + 1;
    box.append(note('Поколение ' + generation + '. После кладки родители отдыхают; за жизнь число яиц ограничено.'));
    if (!level('book')) {box.append(note('Племенная книга покажет диапазоны качеств и вероятность каждой части.'));return box;}
    var prediction = sim.forecast(g.state,parents[0],parents[1],g.config);
    (prediction.ranges || []).forEach(function (range,i) {box.append(g.ui.line(catalog.qualities[i],num(range[0]) + '–' + num(range[1])));});
    (prediction.parts || []).forEach(function (probabilities,i) {
      var row = h('div',{class:'m-probability'},h('strong',{},catalog.parts[i]));
      Object.keys(probabilities).forEach(function (id) {if (probabilities[id]) row.append(h('span',{},species(Number(id)).name + ' · ' + Math.round(probabilities[id]*100) + '%'));});
      box.append(row);
    });
    box.append(note('Диапазоны учитывают обычный шум наследования. Редкий прорыв способен дать больше.'));
    return box;
  }
  function breed() {
    if (view.pair.length !== 2) return;
    var result = act(function (s) {return sim.breed(s,view.pair[0],view.pair[1],ctx());},'breed');
    if (!result || result.ok !== false) {view.pair=[];invalidate();}
  }
  function fight(training) {
    var result = act(function (s) {return sim.fight(s,ctx(),training);},'battle');
    if (result && result.ok) {
      view.replayAt = Date.now();
      view.replayStep = 0;
      view.requestBattle = true;
      g.stock.take('news').then(function (item) {view.news=item;invalidate();}).catch(function () {});
      invalidate();
    }
  }
  function logText(row, names) {
    var actor = names[row.actor] || row.actor || '';
    var target = names[row.target] || row.target || '';
    var kinds = {attack:'удар',hit:'удар',crit:'критический удар',critical:'критический удар',charge:'разбег',trip:'подсечка',shield:'щит укрытия',enter:'выход на арену',dodge:'уклон',counter:'контратака',reflect:'колючки',skip:'пропуск хода',thorns:'колючки',frost:'холод',mirage:'морок',shelter:'укрытие',pound:'долбёжка',stance:'стойка',substitute:'замена',stun:'подсечка',cold:'холод',blind:'ослепление',stubborn:'остался на ногах',bench:'замена',cover:'укрытие',sand:'зыбучий песок',haze:'морок',peck:'долбёжка',stand:'стойка'};
    return 'Ход ' + row.round + ' · ' + actor + ' — ' + (kinds[row.kind] || row.kind || 'удар') + (target ? ' → ' + target : '') + (row.damage ? ' · −' + num(row.damage) : '');
  }
  function battle() {
    var last = g.state.run.lastBattle;
    var box = h('div',{class:'m-battle'},heading('Арена'));
    if (!last) {box.append(h('div',{class:'m-empty'},GameIcons.el('trophy'),h('h3',{},'Первый выход'),note('Выберите трёх бойцов. Бой идёт автоматически; повтор сохранит то же зерно и результат.')));return box;}
    var result = last.result;
    var log = result.log || [];
    var step = view.replayStep;
    var done = step >= log.length;
    var all = last.team.concat(last.enemies);
    var names = {};
    var hp = {};
    (result.fighters || []).forEach(function (f) {hp[f.id]={hp:f.maxHp,maxHp:f.maxHp};});
    all.forEach(function (b) {names[b.id]=b.name;});
    log.slice(0,Math.min(step,log.length)).forEach(function (row) {if (hp[row.target] && typeof row.hp === 'number') hp[row.target].hp=row.hp;});
    if (done) (result.fighters || []).forEach(function (f) {hp[f.id]={hp:f.hp,maxHp:f.maxHp};});
    box.append(h('div',{class:'m-battle-status','aria-live':'polite'},h('strong',{},done ? (result.win ? 'Победа' : 'Поражение') : 'Бой идёт'),h('span',{},last.training ? 'Учебный бой' : done ? '+' + g.fmt(last.coins) + ' монет · +' + last.xp + ' опыта' : 'Ход ' + (log[Math.min(step,log.length - 1)] || {}).round)));
    var arena = h('div',{class:'m-arena'});
    [last.team,last.enemies].forEach(function (team,index) {
      var side = h('div',{class:'m-side'},h('h3',{},index ? 'Соперники' : 'Ваша команда'));
      team.forEach(function (b) {
        var health = hp[b.id] || {hp:1,maxHp:1};
        var row = h('div',{class:'m-fighter' + (health.hp <= 0 ? ' out' : '')},art.draw(b),h('div',{},h('strong',{},b.name),h('div',{class:'m-track'},h('i',{style:'width:' + Math.max(0,health.hp/health.maxHp*100) + '%'})),h('span',{class:'m-note'},num(Math.max(0,health.hp)) + ' / ' + num(health.maxHp))));
        side.append(row);
      });
      arena.append(side);
    });
    box.append(arena);
    var controls = h('div',{class:'m-row'});
    controls.append(small('Сразу итог',function () {view.replayStep=Infinity;invalidate();},done),small('Пересмотреть',function () {view.replayStep=0;view.replayAt=Date.now();invalidate();}));
    box.append(controls);
    var lines = h('div',{class:'m-battle-log','aria-label':'Ход боя'});
    log.slice(Math.max(0,Math.min(step,log.length)-6),Math.min(step,log.length)).forEach(function (row) {lines.append(h('p',{},logText(row,names)));});
    box.append(lines,note('Зерно боя: ' + last.seed + ' · раундов: ' + result.rounds));
    if (view.news && done) box.append(h('div',{class:'m-news'},h('strong',{},view.news.title),note(view.news.text)));
    return box;
  }
  function reserve() {
    var s = g.state;
    var box = h('div',{class:'m-reserve'},heading('Заповедник'),h('div',{class:'m-pool'},h('strong',{},num(s.meta.genePool)),h('span',{},'общий генофонд')),g.ui.line('Потолок качеств',num(sim.cap(s,g.config))),g.ui.line('Наследие новорождённых','+' + num(sim.legacy(s,g.config))),g.ui.line('Материк',s.meta.continent),note('Генофонд дают отпущенные звери. Он остаётся навсегда и усиливает будущие поколения.'));
    box.append(small('Альбом частей и окрасов',function () {view.panel='album';invalidate();}),small('Летопись рода',function () {view.panel='chronicle';invalidate();},!level('chronicle')),small('Трофеи',function () {view.panel='trophies';invalidate();}));
    var need = g.config['expedition.threshold'] * s.meta.continent;
    box.append(heading('Новый материк'),note('Нужно ' + need + ' очков генофонда и три основателя. Монеты, улучшения и лига начнутся заново; коллекция и генофонд останутся.'),small(view.founders ? 'Скрыть выбор основателей' : 'Выбрать трёх основателей',function () {view.founders=!view.founders;invalidate();}));
    if (view.founders) box.append(note('Касайтесь карточек: выбранные звери продолжат род на новом материке.'),roster('founders'));
    else box.append(note('Основатели: ' + (s.run.founders.map(beast).filter(Boolean).map(function (b) {return b.name;}).join(', ') || 'пока не выбраны')));
    var retired = (s.meta.retired || []).slice().reverse();
    if (retired.length) {
      box.append(heading('В заповеднике'));
      retired.slice(0,12).forEach(function (id) {var b=s.meta.archive[id];if (b) box.append(card(b,function () {view.selected=id;view.panel='lineage';invalidate();},false,'Пок. ' + b.generation));});
    }
    return box;
  }
  function sample(id, colors) {
    return {name:species(id).name,parts:[0,1,2,3,4].map(function () {return {a:id,b:id,visible:id};}),colors:colors || [2,3],traits:[]};
  }
  function album() {
    var data = g.state.meta.album;
    var box = h('div',{class:'m-album'},heading('Полевой альбом'));
    var tabs = h('div',{class:'m-subtabs'});
    [['parts','Части'],['colors','Окрасы'],['pairs','Пары'],['traits','Черты']].forEach(function (p) {var b=small(p[1],function () {view.album=p[0];invalidate();});b.classList.toggle('on',view.album===p[0]);tabs.append(b);});
    box.append(tabs);
    if (view.album === 'parts') {
      box.append(note(Object.keys(data.parts).length + ' / 70 частей'));
      catalog.species.forEach(function (sp) {
        var row = h('div',{class:'m-album-species'},art.draw(sample(sp.id)),h('h3',{},sp.name));
        var parts = h('div',{class:'m-album-parts'});
        catalog.parts.forEach(function (name,i) {var found=!!data.parts[sp.id + '-' + i];parts.append(h('span',{class:found?'found':'missing',title:found?'Открыто':'Не найдено'},name));});
        row.append(parts,note(sp.ability));box.append(row);
      });
    } else if (view.album === 'colors') {
      box.append(note(Object.keys(data.colors).length + ' / 12 окрасов'));
      catalog.palette.forEach(function (color,i) {box.append(h('div',{class:'m-color-row' + (data.colors[i] ? '' : ' missing')},h('i',{style:'background:' + color.color}),h('strong',{},color.name),h('span',{},data.colors[i]?'Открыт':'Не найден')));});
    } else if (view.album === 'pairs') {
      box.append(note(Object.keys(data.pairs).length + ' / 78 сочетаний'));
      var grid = h('div',{class:'m-pair-grid'});
      catalog.palette.forEach(function (a,i) {catalog.palette.forEach(function (b,j) {if (j<i)return;var found=!!data.pairs[i + '-' + j];grid.append(h('div',{class:'m-color-pair' + (found?'':' missing'),title:a.name+' + '+b.name},h('div',{class:'m-swatch-pair'},h('i',{style:'background:'+a.color}),h('i',{style:'background:'+b.color})),h('span',{},a.name+' / '+b.name),h('strong',{},found?'Открыто':'Не найдено')));});});
      box.append(grid);
    } else {
      box.append(note(Object.keys(data.traits).length + ' открытых черт · 8 основных и 3 черты третьего материка'));
      catalog.traits.forEach(function (t) {box.append(h('div',{class:'m-trait-row' + (data.traits[t.id]?'':' missing')},h('div',{class:'m-trait-head'},icons.el(t.id,32),h('strong',{},t.name)),note(t.text),h('span',{},data.traits[t.id]?'Открыта':'Не найдена')));});
    }
    box.append(small('Полевая заметка',function () {g.stock.take('species').then(function (item) {view.fieldNote=item;invalidate();}).catch(function () {});}));
    if (view.fieldNote) box.append(h('div',{class:'m-news'},h('strong',{},view.fieldNote.title),note(view.fieldNote.text)));
    return box;
  }
  function chronicle() {
    var box = h('div',{class:'m-chronicle'},heading('Летопись рода'),note('Средний потенциал всех рождённых зверей каждого поколения.'));
    var rows = g.state.meta.generations;
    Object.keys(rows).sort(function (a,b) {return Number(a)-Number(b);}).forEach(function (key) {
      var row = rows[key];
      var b = {genes:row.sums.map(function (value) {return value/Math.max(1,row.count);})};
      box.append(h('div',{class:'m-generation'},h('h3',{},'Поколение ' + key),note('Зверей: ' + row.count),bars(b,true)));
    });
    return box;
  }
  function trophies() {
    var box=h('div',{},heading('Трофеи'));
    var trophies=g.state.meta.trophies || [];
    if (!trophies.length) box.append(note('Первые трофеи ждут победителей турнирных лиг.'));
    trophies.forEach(function (t) {box.append(h('div',{class:'m-trophy'},icons.el('trophy',32),h('span',{},typeof t==='number'?(catalog.leagues[t] || 'Трофей'):typeof t==='string'?t:(t.title || t.name || catalog.leagues[t.league] || 'Трофей'))));});
    box.append(small('Достижения',function () {g.ui.achievements();}));
    return box;
  }
  function upgrades() {
    var box=h('div',{class:'m-upgrades'},heading('Улучшения'),note('Улучшения действуют до следующей экспедиции.'));
    catalog.upgrades.forEach(function (upgrade) {
      var cost=sim.cost(g.state,upgrade.id,g.config);
      var max=level(upgrade.id)>=g.config['upgrade.'+upgrade.id+'.max'];
      var row=h('div',{class:'m-upgrade' + (level(upgrade.id)?' have':'')},h('div',{class:'m-upgrade-head'},icons.el(upgrade.id,40),h('div',{class:'m-upgrade-copy'},h('h3',{},upgrade.name),note(upgrade.text),h('span',{class:'m-badge'},'Уровень ' + level(upgrade.id)))));
      row.append(small(max?'Максимум':g.fmt.price(cost)+' монет',function () {act(function (s) {return sim.buy(s,upgrade.id,g.config);},'buy');},max || Big.lt(g.state.run.coins,cost)));
      box.append(row);
    });
    return box;
  }
  function eventPanel() {
    var e=g.state.run.event;
    var box=h('div',{class:'m-event'});
    if (!e) return box;
    var entry=lookup(catalog.events,e.id) || {name:'Событие',text:''};
    box.append(h('div',{class:'m-event-title'},icons.el(e.id,36),h('strong',{},entry.name)),note(entry.text));
    if (e.id==='guest') box.append(small('Приручить · ' + (e.taps || 0) + ' / 3',function () {act(function (s) {return sim.eventAction(s,'tame',null,ctx());},'tap');}));
    else if (e.id==='circus') {
      var selected=beast(view.selected) || g.state.run.beasts[0];
      if (selected) box.append(small('Предложить: ' + selected.name,function () {release(selected,true);}));
      box.append(note('Чтобы выбрать другого, откройте его карточку в вольере.'));
    }
    box.append(small('Закрыть событие',function () {act(function (s) {return sim.eventAction(s,'dismiss',null,ctx());});}));
    return box;
  }
  function spend(id, beastId) {
    if (view.busy) return;
    if (id==='rest' && (!beast(beastId) || !rest(beast(beastId)))) return;
    if (id==='walk' && !g.state.run.team.length) {ui.toast('Сначала выберите команду');return;}
    view.busy=true;
    g.links.spend(id).then(function (r) {
      if (!r.ok) {ui.toast(r.off?'Связка «Шаги» выключена':'Нужна энергия: ' + r.need);g.buzz('deny');return;}
      act(function (s) {return id==='walk'?sim.walk(s,ctx()):sim.rest(s,beastId,ctx());},'level');
    }).catch(function () {ui.toast('Не удалось получить энергию');}).finally(function () {view.busy=false;});
  }
  function actionBar() {
    var actions=[];
    if (view.tab==='aviary') actions.push(button('Подобрать пару',function () {switchTab('nests');},true));
    if (view.tab==='nests') actions.push(button('В гнездо' + (view.pair.length ? ' · ' + view.pair.length + ' / 2' : ''),breed,true,view.pair.length!==2));
    if (view.tab==='tournament') {
      actions.push(button('На турнир',function () {fight(false);},true,g.state.run.team.length===0));
      var row=h('div',{class:'m-row'},small('Прогулка · 1 энергия',function () {spend('walk');}));
      if (level('arena')) row.append(small('Учебный бой',function () {fight(true);}));
      actions.push(row);
    }
    if (view.tab==='reserve') actions.push(view.prestige);
    if (view.tab==='upgrades') actions.push(small('Вернуться в вольер',function () {switchTab('aviary');}));
    view.context.replaceChildren.apply(view.context,actions);
  }
  function build(game) {
    g=game;
    g.el.app.classList.add('m-app');
    view.coins=h('strong',{});
    view.pool=h('span',{});
    view.topline=h('span',{});
    g.el.top.append(h('div',{class:'m-top'},h('div',{},h('span',{class:'m-kicker'},'ЗВЕРИНЕЦ'),view.topline),h('div',{class:'m-currencies'},h('div',{},GameIcons.el('coin'),view.coins),view.pool)));
    view.layout=h('div',{class:'m-layout'});
    view.left=h('section',{class:'m-pane m-left','aria-label':'Вольер и управление'});
    view.right=h('section',{class:'m-pane m-right','aria-label':'Подробности'});
    view.layout.append(view.left,view.right);
    if (Game.scene && window.MenagerieScene) {
      view.world=Game.scene({parent:g.el.field,label:'Живой зверинец и арена',width:1000,height:620,className:'m-world',game:g,draw:window.MenagerieScene.draw});
      window.MenagerieScene.onAssetsReady(function(){if(view.worldModel)view.world.update(view.worldModel);});
      g.el.app.classList.add('m-has-world');
    }
    g.el.field.append(view.layout);
    view.context=h('div',{class:'m-context'});
    view.nav=h('nav',{class:'m-nav','aria-label':'Разделы зверинца'});
    view.tabButtons={};
    TABS.forEach(function (tab) {var b=h('button',{type:'button',class:'m-tab',onclick:function () {switchTab(tab[0]);},'aria-label':tab[1]},GameIcons.el(tab[2]),h('span',{},tab[1]));view.tabButtons[tab[0]]=b;view.nav.append(b);});
    g.el.actions.append(view.context,view.nav);
    view.prestige=g.ui.prestigeButton(sim.LAYER,{label:'Отправиться в экспедицию',primary:true});
    document.addEventListener('pointerdown',function () {view.pointerActive=true;});
    document.addEventListener('pointerup',function () {view.holding=false;setTimeout(function(){view.pointerActive=false;},0);});
    document.addEventListener('pointercancel',function () {view.holding=false;view.pointerActive=false;});
    g.on('prestige',function () {view.pair=[];view.selected=null;view.panel='info';view.tab='aviary';view.signature='';});
    g.on('chest',function () {g.sfx('hatch');view.signature='';});
    fetch('../content/catalog.json').then(function (r) {return r.json();}).then(function (data) {catalog=data;art.configure(catalog);invalidate();}).catch(function () {ui.toast('Не удалось открыть полевой справочник');});
  }
  function render(state) {
    if (view.world) {
      var worldModel=window.MenagerieScene.model(state,view);
      var oldWorld=view.worldModel;
      if(oldWorld && worldModel.mode==='arena' && oldWorld.mode==='arena' && oldWorld.seed===worldModel.seed && worldModel.step>oldWorld.step && worldModel.last) view.world.pulse('battle',worldModel.last,.8);
      if(oldWorld && worldModel.mode==='habitat') {
        var previousIds=oldWorld.beasts.map(function(b){return b.id;});
        var born=worldModel.beasts.filter(function(b){return previousIds.indexOf(b.id)<0 && oldWorld.population<worldModel.population;}).map(function(b){return b.id;});
        if(born.length)view.world.pulse('hatch',{ids:born},1.6);
      }
      view.worldModel=worldModel;
      view.world.node.hidden=['reserve','upgrades'].indexOf(view.tab)>=0;
      view.world.update(worldModel);
    }
    view.coins.textContent=g.fmt.live(state.run.coins);
    view.pool.textContent='Генофонд ' + num(state.meta.genePool);
    view.topline.textContent='Материк ' + state.meta.continent + ' · ' + state.run.beasts.length + ' / ' + sim.capacity(state,g.config);
    Object.keys(view.tabButtons).forEach(function (id) {view.tabButtons[id].classList.toggle('on',id===view.tab);view.tabButtons[id].setAttribute('aria-current',id===view.tab?'page':'false');});
    if (sim.achievementIds) sim.achievementIds(state,g.config).forEach(function (id) {g.achieve(id);});
    if (view.holding || view.pointerActive) return;
    var wallSecond=Math.floor(Date.now()/1000);
    if(view.signature && view.lastSecond===wallSecond)return;
    view.lastSecond=wallSecond;
    view.pair=view.pair.filter(function (id) {return !!beast(id);});
    var signature=JSON.stringify([state.run.coins,state.run.beasts,state.run.eggs.map(function(e){return [e.id,Math.ceil(e.remaining)];}),state.run.upgrades,state.run.team,state.run.founders,state.run.league,state.run.step,state.run.streak,state.run.event,state.run.lastBattle?state.run.lastBattle.seed:null,state.meta.genePool,state.meta.continent,view.tab,view.selected,view.pair,view.sort,view.panel,view.album,view.founders,view.detail,view.replayStep,view.news,view.fieldNote,Math.floor(Date.now()/1000)]);
    if (signature===view.signature) return;
    view.signature=signature;
    var left=[];
    var right=[];
    var current=beast(view.selected) || state.meta.archive[view.selected];
    view.layout.classList.toggle('m-aviary-mode',view.tab==='aviary');
    view.layout.classList.toggle('m-detail-mode',view.tab==='aviary' && view.detail);
    if (view.tab==='aviary') {
      left.push(heading('Вольер',sortControl()),note('Выберите зверя, чтобы изучить породу и способности.'),roster('view'));
      if (level('catcher') || state.run.beasts.length<2 && !state.run.eggs.length) left.push(small(level('catcher')?'Позвать ловчего':'Помощь заповедника',function () {act(function (s) {return sim.catchWild(s,ctx());},'hatch');}));
      right.push(view.panel==='lineage' && current ? ancestry(current) : detail(current));
    } else if (view.tab==='nests') {
      left.push(eggs(),heading('Выбор родителей',sortControl()),roster('pair'));
      right.push(forecast());
    } else if (view.tab==='tournament') {
      left.push(heading(catalog.leagues[state.run.league] || 'Турнир'),note('Ступень ' + (state.run.step + 1) + ' / 10 · серия ' + state.run.streak),heading('Состав',h('span',{class:'m-badge'},state.run.team.length + ' / ' + (level('bench')?4:3))),note('Касание включает или убирает зверя. Четвёртый боец — запасной.'),roster('team'));
      if (state.run.fairUntil>Date.now()) left.push(note('Ярмарка: монеты ×2 ещё ' + time((state.run.fairUntil-Date.now())/1000)));
      right.push(battle());
    } else if (view.tab==='reserve') {
      left.push(reserve());
      right.push(view.panel==='album'?album():view.panel==='chronicle'?chronicle():view.panel==='trophies'?trophies():view.panel==='lineage' && current?ancestry(current):h('div',{class:'m-empty'},GameIcons.el('tree'),h('h2',{},'Род продолжается'),note('Сравнивайте поколения, собирайте части и сохраняйте лучших основателей.')));
    } else {
      left.push(upgrades());
      right.push(h('div',{class:'m-empty'},GameIcons.el('nest'),h('h2',{},'Хорошая порода требует времени'),note('Первая кладка высиживается около получаса. Родители отдыхают два часа, а следующий турнир доступен через двадцать минут.'),note('Инкубатор, ветеринар и новые гнёзда помогают вести несколько линий рода одновременно.')));
    }
    if (state.run.event) left.unshift(eventPanel());
    var scrollLeft=view.left.scrollTop;
    var scrollRight=view.right.scrollTop;
    view.left.replaceChildren.apply(view.left,left);
    view.right.replaceChildren.apply(view.right,right);
    view.left.scrollTop=scrollLeft;
    view.right.scrollTop=scrollRight;
    actionBar();
    if(view.requestBattle){view.requestBattle=false;if(window.innerWidth<690)(view.world?view.world.node:view.right).scrollIntoView({block:'start'});}
  }
  function animate() {
    if (!g || !view.replayAt || view.replayStep===Infinity) return;
    var last=g.state.run.lastBattle;
    if (!last) return;
    var count=last.result.log.length;
    var next=Math.min(count,Math.floor((Date.now()-view.replayAt)/650));
    if (next!==view.replayStep) {
      view.replayStep=next;
      if (next>=count) {view.replayAt=0;g.sfx(last.result.win?'victory':'deny');g.buzz(last.result.win?'level':'deny');}
      view.signature='';
      g.redraw();
    }
  }
  Game.start({sim:sim,init:build,render:render,animate:animate});
})();




