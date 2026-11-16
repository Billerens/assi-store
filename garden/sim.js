// The logic of «Сад»: plants grow by the wall clock (also while the game is closed), crossing
// follows exact rules of inheritance (two alleles a gene, one from each parent, genes
// independent), mutations are rare, the album collects every look. Shared subset of JavaScript:
// it runs on the screen (window.GameSim), in the engine (Rhino, require) and in node. No class,
// no async, no f(...args), no for (let …); randomness only from the rng given; every number of
// the balance comes from the config (ctx.config / cfg).
(function (root, make) {
  var node = typeof require === 'function' && typeof exports !== 'undefined';
  var api = node ? make(require('../engine/big.js'), require('../engine/rng.js')) : make(root.Big, root.Rng);
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.GameSim = api; }
})(this, function (Big, Rng) {
  'use strict';

  var LAYER = 'move';
  var HOUR = 3600000;
  var DAY = 86400000;

  // ---- the families and their genes -----------------------------------------------------------
  // A genotype is a string: two characters (the two alleles) for each gene, in the family's order.
  // group: which level of «Лупа генетика» opens the gene (1 colour, 2 shape, 3 pattern, 4 size,
  // 5 speed, 6 fertility).

  var FAMILIES = {
    moon: {
      title: 'Луноцвет', what: 'цветок', sell: true,
      genes: [
        { id: 'color', title: 'Цвет', alleles: 'RYBWLN', rare: 'LN', group: 1 },
        { id: 'shape', title: 'Форма', alleles: 'sbrk', rare: 'k', group: 2 },
        { id: 'pattern', title: 'Узор', alleles: 'pqdg', rare: 'g', group: 3 },
        { id: 'size1', title: 'Размер 1', alleles: '+-', rare: '', group: 4 },
        { id: 'size2', title: 'Размер 2', alleles: '+-', rare: '', group: 4 },
        { id: 'size3', title: 'Размер 3', alleles: '+-', rare: '', group: 4 },
        { id: 'speed', title: 'Скорость', alleles: 'fnl', rare: '', group: 5 },
        { id: 'fert', title: 'Плодовитость', alleles: '123', rare: '', group: 6 }
      ]
    },
    sun: {
      title: 'Солнечник', what: 'куст', sell: true,
      genes: [
        { id: 'color', title: 'Цвет ягоды', alleles: 'RYBWT', rare: 'T', group: 1 },
        { id: 'berry', title: 'Форма ягоды', alleles: 'oez', rare: 'z', group: 2 },
        { id: 'thorns', title: 'Шипы', alleles: 'Ss', rare: '', group: 3 },
        { id: 'sweet1', title: 'Сладость 1', alleles: '+-', rare: '', group: 4 },
        { id: 'sweet2', title: 'Сладость 2', alleles: '+-', rare: '', group: 4 },
        { id: 'sweet3', title: 'Сладость 3', alleles: '+-', rare: '', group: 4 },
        { id: 'speed', title: 'Скорость', alleles: 'fnl', rare: '', group: 5 },
        { id: 'fert', title: 'Плодовитость', alleles: '123', rare: '', group: 6 }
      ]
    },
    fan: {
      title: 'Веерник', what: 'лист', sell: false,
      genes: [
        { id: 'veins', title: 'Жилки', alleles: 'Kk', rare: '', group: 1 },
        { id: 'leaf', title: 'Форма листа', alleles: 'abcde', rare: '', group: 2 },
        { id: 'varieg', title: 'Пестрота', alleles: 'Vv', rare: '', group: 3 },
        { id: 'speed', title: 'Скорость', alleles: 'fnl', rare: '', group: 5 },
        { id: 'fert', title: 'Плодовитость', alleles: '123', rare: '', group: 6 }
      ]
    }
  };
  var FAMILY_IDS = ['moon', 'sun', 'fan'];

  // The looks, in the order of the album.
  var LOOKS = {
    moon: {
      color: ['red', 'yellow', 'blue', 'orange', 'purple', 'green', 'white', 'glow', 'black'],
      shape: ['star', 'bell', 'round', 'crystal'],
      pattern: ['solid', 'stripes', 'dots', 'net', 'gold']
    },
    sun: {
      color: ['red', 'yellow', 'blue', 'orange', 'purple', 'green', 'white', 'clear'],
      shape: ['thorny', 'smooth'],
      pattern: ['round', 'long', 'star']
    },
    fan: {
      color: ['a', 'b', 'c', 'd', 'e'],
      shape: ['varieg', 'rim', 'green'],
      pattern: ['red', 'green']
    }
  };
  // How the three parts of an album key map to the family's traits.
  var KEY_PARTS = { moon: ['color', 'shape', 'pattern'], sun: ['color', 'thorns', 'berry'], fan: ['leaf', 'varieg', 'veins'] };

  var WORDS = {
    color: {
      red: ['красный', 'красная'], yellow: ['жёлтый', 'жёлтая'], blue: ['синий', 'синяя'], orange: ['оранжевый', 'оранжевая'],
      purple: ['фиолетовый', 'фиолетовая'], green: ['зелёный', 'зелёная'], white: ['белый', 'белая'], glow: ['светящийся', 'светящаяся'],
      black: ['чёрный', 'чёрная'], clear: ['прозрачный', 'прозрачная']
    },
    shape: { star: ['звезда', 1], bell: ['колокол', 0], round: ['круг', 0], crystal: ['кристалл', 0] },
    pattern: { solid: '', stripes: 'в полоску', dots: 'с крапом', net: 'с сеткой', gold: 'с золотой каймой' },
    patternNoun: { solid: 'сплошной узор', stripes: 'полоски', dots: 'крап', net: 'сетка', gold: 'золотая кайма' },
    size: ['крошечный', 'маленький', 'небольшой', 'средний', 'крупный', 'большой', 'огромный', 'гигант'],
    berry: { round: 'круглая', long: 'вытянутая', star: 'звёздчатая' },
    thorns: { thorny: 'шипастый куст', smooth: 'гладкий куст' },
    leaf: { a: 'веерный', b: 'сердцевидный', c: 'копьевидный', d: 'лопастной', e: 'перистый' },
    varieg: { varieg: 'пёстрый', rim: 'с каймой', green: 'зелёный' },
    veins: { red: 'красные жилки', green: 'зелёные жилки' }
  };

  var UPGRADES = ['beds', 'can', 'barrel', 'greenhouse', 'guard', 'dryer', 'lens', 'notebook', 'bank', 'fert', 'lamp', 'hive',
    'vitrine', 'board', 'compost', 'meteo', 'boundary', 'orangery', 'fridge', 'cart'];

  var CLIMATES = ['flood', 'rocky', 'north', 'salt'];
  var EVENTS = ['storm', 'swarm', 'wander', 'warm', 'slugs'];

  // ---- small helpers ---------------------------------------------------------------------------

  function n(v, fallback) {
    var x = Number(v);
    return v === undefined || v === null || x !== x ? fallback : x;
  }

  function cap(text) { return text ? text.charAt(0).toUpperCase() + text.slice(1) : text; }

  function geneAt(fam, id) {
    var genes = FAMILIES[fam].genes;
    for (var i = 0; i < genes.length; i++) if (genes[i].id === id) return i;
    return -1;
  }

  function pair(g, fam, id) {
    var i = geneAt(fam, id);
    return i < 0 ? '' : g.substr(i * 2, 2);
  }

  function count(text, ch) {
    var c = 0;
    for (var i = 0; i < text.length; i++) if (text.charAt(i) === ch) c++;
    return c;
  }

  function has(text, ch) { return text.indexOf(ch) >= 0; }

  // ---- phenotypes: the exact rules ---------------------------------------------------------------

  /**
   * Colour: W is recessive to everything; R, Y, B show together (RY orange, RB purple, YB green);
   * the rare L, N (and T of Солнечник) show only as a pair (LL glowing, NN black, TT clear) and
   * hide behind any other allele; two different "recessive" alleles (W, L, N, T) give white.
   */
  function colorOf(p) {
    var a = p.charAt(0);
    var b = p.charAt(1);
    var BASE = { R: 'red', Y: 'yellow', B: 'blue', W: 'white', L: 'glow', N: 'black', T: 'clear' };
    if (a === b) return BASE[a];
    var ma = 'RYB'.indexOf(a) >= 0;
    var mb = 'RYB'.indexOf(b) >= 0;
    if (ma && mb) {
      var both = a + b;
      if (both === 'RY' || both === 'YR') return 'orange';
      if (both === 'RB' || both === 'BR') return 'purple';
      return 'green';
    }
    if (ma) return BASE[a];
    if (mb) return BASE[b];
    return 'white';
  }

  /** Shape of Луноцвет: s > b > r; kk crystal, k with another is hidden. */
  function shapeOf(p) {
    if (p === 'kk') return 'crystal';
    if (has(p, 's')) return 'star';
    if (has(p, 'b')) return 'bell';
    return 'round';
  }

  /** Pattern: p > q and p > d; qq stripes, dd dots, qd net; gg gold rim, g with another is hidden. */
  function patternOf(p) {
    if (p === 'gg') return 'gold';
    if (has(p, 'p')) return 'solid';
    var q = has(p, 'q');
    var d = has(p, 'd');
    if (q && d) return 'net';
    return q ? 'stripes' : 'dots';
  }

  /** Berry of Солнечник: round > long; zz star, z with another is hidden. */
  function berryOf(p) {
    if (p === 'zz') return 'star';
    return has(p, 'o') ? 'round' : 'long';
  }

  function thornsOf(p) { return has(p, 'S') ? 'thorny' : 'smooth'; }

  /** Leaf of Веерник: a chain of dominance a > b > c > d > e. */
  function leafOf(p) {
    var order = 'abcde';
    return order.charAt(Math.min(order.indexOf(p.charAt(0)), order.indexOf(p.charAt(1))));
  }

  /** Variegation, incomplete dominance: VV variegated, Vv a rim, vv green. */
  function variegOf(p) {
    var v = count(p, 'V');
    return v === 2 ? 'varieg' : v === 1 ? 'rim' : 'green';
  }

  function veinsOf(p) { return has(p, 'K') ? 'red' : 'green'; }

  function plusOf(g, fam, ids) {
    var c = 0;
    for (var i = 0; i < ids.length; i++) c += count(pair(g, fam, ids[i]), '+');
    return c;
  }

  /** Speed: f −step, n 0, l +step, the two alleles add up (a multiplier of the time of growth). */
  function speedOf(g, fam, cfg) {
    var p = pair(g, fam, 'speed');
    var step = n(cfg && cfg['grow.speedStep'], 0.1);
    return 1 + step * (count(p, 'l') - count(p, 'f'));
  }

  /** Fertility: the two alleles 1..3 add up. */
  function fertOf(g, fam) {
    var p = pair(g, fam, 'fert');
    return n(p.charAt(0), 1) + n(p.charAt(1), 1);
  }

  /**
   * The look of a plant or a seed: {fam, key, color, shape, pattern, size, …}. `m` — whole-plant
   * mutations ('G' giant, 'C' chimera, 'N' night), `ch` — the second colour of a chimera.
   */
  function phenotype(fam, g, m, ch) {
    m = m || '';
    var ph = { fam: fam, m: m };
    if (fam === 'moon') {
      ph.color = colorOf(pair(g, fam, 'color'));
      ph.shape = shapeOf(pair(g, fam, 'shape'));
      ph.pattern = patternOf(pair(g, fam, 'pattern'));
      ph.size = has(m, 'G') ? 7 : plusOf(g, fam, ['size1', 'size2', 'size3']);
      ph.key = 'moon/' + ph.color + '/' + ph.shape + '/' + ph.pattern;
      if (has(m, 'C') && ch && ch !== ph.color) ph.color2 = ch;
    } else if (fam === 'sun') {
      ph.color = colorOf(pair(g, fam, 'color'));
      ph.berry = berryOf(pair(g, fam, 'berry'));
      ph.thorns = thornsOf(pair(g, fam, 'thorns'));
      ph.sweet = plusOf(g, fam, ['sweet1', 'sweet2', 'sweet3']);
      ph.key = 'sun/' + ph.color + '/' + ph.thorns + '/' + ph.berry;
    } else {
      ph.leaf = leafOf(pair(g, fam, 'leaf'));
      ph.varieg = variegOf(pair(g, fam, 'varieg'));
      ph.veins = veinsOf(pair(g, fam, 'veins'));
      ph.key = 'fan/' + ph.leaf + '/' + ph.varieg + '/' + ph.veins;
    }
    ph.night = has(m, 'N');
    ph.giant = has(m, 'G');
    ph.chimera = !!ph.color2;
    return ph;
  }

  /** Every ordinary album key of a family, in the album's order. */
  function albumKeys(fam) {
    var L = LOOKS[fam];
    var out = [];
    L.color.forEach(function (a) {
      L.shape.forEach(function (b) {
        L.pattern.forEach(function (c) { out.push(fam + '/' + a + '/' + b + '/' + c); });
      });
    });
    return out;
  }

  /** The special page: chimeras (two colours of Луноцвет) and night forms (Луноцвет and Солнечник). */
  function specialKeys() {
    var out = [];
    var c = LOOKS.moon.color;
    for (var i = 0; i < c.length; i++) for (var j = i + 1; j < c.length; j++) out.push('chimera/' + c[i] + '+' + c[j]);
    c.forEach(function (x) { out.push('night/moon/' + x); });
    LOOKS.sun.color.forEach(function (x) { out.push('night/sun/' + x); });
    return out;
  }

  function chimeraKey(a, b) {
    var c = LOOKS.moon.color;
    return c.indexOf(a) < c.indexOf(b) ? 'chimera/' + a + '+' + b : 'chimera/' + b + '+' + a;
  }

  /** The look in words: «Фиолетовая звезда с крапом», «Синяя вытянутая ягода, гладкий куст». */
  function look(ph) {
    if (ph.fam === 'moon') {
      var shape = WORDS.shape[ph.shape];
      var color = WORDS.color[ph.color][shape[1]];
      var text = color + ' ' + shape[0] + (WORDS.pattern[ph.pattern] ? ' ' + WORDS.pattern[ph.pattern] : '');
      if (ph.color2) text = WORDS.color[ph.color][shape[1]] + '-' + WORDS.color[ph.color2][shape[1]] + ' ' + shape[0] + (WORDS.pattern[ph.pattern] ? ' ' + WORDS.pattern[ph.pattern] : '');
      return cap(text);
    }
    if (ph.fam === 'sun') return cap(WORDS.color[ph.color][1] + ' ' + WORDS.berry[ph.berry] + ' ягода, ' + WORDS.thorns[ph.thorns]);
    return cap(WORDS.leaf[ph.leaf] + ' лист, ' + WORDS.varieg[ph.varieg] + ', ' + WORDS.veins[ph.veins]);
  }

  /** The look of an album key (ordinary or special). */
  function lookOfKey(key) {
    var p = String(key).split('/');
    if (p[0] === 'chimera') {
      var two = p[1].split('+');
      return cap(WORDS.color[two[0]][1] + '-' + WORDS.color[two[1]][1] + ' химера');
    }
    if (p[0] === 'night') {
      if (p[1] === 'moon') return cap('ночной ' + WORDS.color[p[2]][0] + ' луноцвет');
      return cap('ночная ' + WORDS.color[p[2]][1] + ' ягода');
    }
    if (p[0] === 'moon') return look({ fam: 'moon', color: p[1], shape: p[2], pattern: p[3] });
    if (p[0] === 'sun') return look({ fam: 'sun', color: p[1], thorns: p[2], berry: p[3] });
    return look({ fam: 'fan', leaf: p[1], varieg: p[2], veins: p[3] });
  }

  /**
   * Rarity points: a recessive look (white, round, stripes, dots …) 1 each, a mixed colour 1, a net
   * 2, the look of a rare allele 8; a chimera +20.
   */
  function rarity(ph, cfg) {
    var rec = n(cfg['rarity.recessive'], 1);
    var mix = n(cfg['rarity.mixed'], 1);
    var rare = n(cfg['rarity.rare'], 8);
    var r = 0;
    if (ph.fam === 'moon' || ph.fam === 'sun') {
      if (ph.color === 'white') r += rec;
      if (ph.color === 'orange' || ph.color === 'purple' || ph.color === 'green') r += mix;
      if (ph.color === 'glow' || ph.color === 'black' || ph.color === 'clear') r += rare;
    }
    if (ph.fam === 'moon') {
      if (ph.shape === 'round') r += rec;
      if (ph.shape === 'crystal') r += rare;
      if (ph.pattern === 'stripes' || ph.pattern === 'dots') r += rec;
      if (ph.pattern === 'net') r += n(cfg['rarity.net'], 2);
      if (ph.pattern === 'gold') r += rare;
      if (ph.color2) r += n(cfg['rarity.chimera'], 20);
    } else if (ph.fam === 'sun') {
      if (ph.thorns === 'smooth') r += rec;
      if (ph.berry === 'long') r += rec;
      if (ph.berry === 'star') r += rare;
    } else {
      if (ph.leaf === 'c' || ph.leaf === 'd') r += rec;
      if (ph.leaf === 'e') r += 2 * rec;
      if (ph.varieg !== 'varieg') r += rec;
      if (ph.veins === 'green') r += rec;
    }
    return r;
  }

  function rarityOfKey(key, cfg) {
    var p = String(key).split('/');
    if (p[0] === 'chimera') {
      var two = p[1].split('+');
      return rarity({ fam: 'moon', color: two[0], shape: 'star', pattern: 'solid', color2: two[1] }, cfg);
    }
    if (p[0] === 'night') return p[1] === 'moon' ? rarity({ fam: 'moon', color: p[2], shape: 'star', pattern: 'solid' }, cfg) : rarity({ fam: 'sun', color: p[2], thorns: 'thorny', berry: 'round' }, cfg);
    if (p[0] === 'moon') return rarity({ fam: 'moon', color: p[1], shape: p[2], pattern: p[3] }, cfg);
    if (p[0] === 'sun') return rarity({ fam: 'sun', color: p[1], thorns: p[2], berry: p[3] }, cfg);
    return rarity({ fam: 'fan', leaf: p[1], varieg: p[2], veins: p[3] }, cfg);
  }

  // ---- inheritance and mutations -----------------------------------------------------------------

  /** A random allele of the gene: the rare ones weigh mut.rareWeight of a usual one. */
  function randomAllele(gene, rng, cfg) {
    var list = gene.alleles.split('');
    var w = n(cfg['mut.rareWeight'], 0.1);
    return rng.weighted(list, function (a) { return has(gene.rare, a) ? w : 1; });
  }

  /**
   * A child of mother × father (the same family): each gene takes one random allele of each
   * parent, genes independently; then with probability mu one allele of the gene is replaced by
   * a random allele of the gene's full list. Returns {g, mutated: [gene ids]}.
   */
  function crossGenes(fam, gm, gf, rng, mu, cfg) {
    var genes = FAMILIES[fam].genes;
    var out = '';
    var mutated = [];
    for (var i = 0; i < genes.length; i++) {
      var a = gm.charAt(2 * i + rng.int(2));
      var b = gf.charAt(2 * i + rng.int(2));
      if (mu > 0 && rng.chance(mu)) {
        var x = randomAllele(genes[i], rng, cfg);
        if (rng.int(2)) a = x;
        else b = x;
        mutated.push(genes[i].id);
      }
      out += a + b;
    }
    return { g: out, mutated: mutated };
  }

  /** The genotype in a readable form: «Цвет R/W · Форма s/r …» (only the genes in `groups`). */
  function genotypeText(fam, g, upTo) {
    var genes = FAMILIES[fam].genes;
    var parts = [];
    for (var i = 0; i < genes.length; i++) {
      if (genes[i].group > upTo) continue;
      parts.push(genes[i].title + ' ' + g.charAt(2 * i) + '/' + g.charAt(2 * i + 1));
    }
    return parts.join(' · ');
  }

  /**
   * The offspring of A × B without mutations (the notebook): the look's distribution over the
   * album keys [{key, p}] sorted by p, plus per-gene distributions {color: {red: .25, …}, …}.
   */
  function offspring(fam, ga, gb) {
    var parts = KEY_PARTS[fam];
    var per = {};
    var fns = { color: colorOf, shape: shapeOf, pattern: patternOf, berry: berryOf, thorns: thornsOf, leaf: leafOf, varieg: variegOf, veins: veinsOf };
    parts.forEach(function (id) {
      var pa = pair(ga, fam, id);
      var pb = pair(gb, fam, id);
      var d = {};
      for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++) {
        var v = fns[id](pa.charAt(i) + pb.charAt(j));
        d[v] = (d[v] || 0) + 0.25;
      }
      per[id] = d;
    });
    var sizeIds = fam === 'moon' ? ['size1', 'size2', 'size3'] : fam === 'sun' ? ['sweet1', 'sweet2', 'sweet3'] : [];
    var size = { 0: 1 };
    sizeIds.forEach(function (id) {
      var pa = pair(ga, fam, id);
      var pb = pair(gb, fam, id);
      var next = {};
      for (var s in size) {
        for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++) {
          var plus = (pa.charAt(i) === '+' ? 1 : 0) + (pb.charAt(j) === '+' ? 1 : 0);
          var k = Number(s) + plus;
          next[k] = (next[k] || 0) + size[s] * 0.25;
        }
      }
      size = next;
    });
    per.size = size;
    var keys = [];
    var a = per[parts[0]];
    var b = per[parts[1]];
    var c = per[parts[2]];
    for (var x in a) for (var y in b) for (var z in c) keys.push({ key: fam + '/' + x + '/' + y + '/' + z, p: a[x] * b[y] * c[z] });
    keys.sort(function (u, v) { return v.p - u.p || (u.key < v.key ? -1 : 1); });
    return { keys: keys, per: per };
  }

  /** A genotype that shows the given look (for the chest): random among those that do. */
  function genotypeFor(key, rng) {
    var p = String(key).split('/');
    var fam = p[0];
    var genes = FAMILIES[fam].genes;
    var target = {};
    KEY_PARTS[fam].forEach(function (id, i) { target[id] = p[i + 1]; });
    var fns = { color: colorOf, shape: shapeOf, pattern: patternOf, berry: berryOf, thorns: thornsOf, leaf: leafOf, varieg: variegOf, veins: veinsOf };
    var out = '';
    for (var i = 0; i < genes.length; i++) {
      var gene = genes[i];
      var list = gene.alleles.split('');
      var pairs = [];
      for (var x = 0; x < list.length; x++) for (var y = x; y < list.length; y++) {
        var two = list[x] + list[y];
        if (!target[gene.id] || fns[gene.id](two) === target[gene.id]) pairs.push(two);
      }
      if (!target[gene.id]) pairs = pairs.filter(function (two) { return !has(gene.rare, two.charAt(0)) && !has(gene.rare, two.charAt(1)); });
      var chosen = rng.pick(pairs);
      out += rng.int(2) ? chosen : chosen.charAt(1) + chosen.charAt(0);
    }
    return out;
  }

  /** "RW-sr-pq,YW-br-pd" -> genotypes of Луноцвет (missing genes from the default tail). */
  function parseSeeds(text, fam, tail) {
    var list = [];
    var genes = FAMILIES[fam].genes;
    String(text || '').split(',').forEach(function (item) {
      var parts = item.trim().split('-');
      if (!parts[0]) return;
      var g = parts.join('');
      var full = g + String(tail || '').slice(g.length);
      if (full.length !== genes.length * 2) return;
      for (var i = 0; i < genes.length; i++) {
        if (!has(genes[i].alleles, full.charAt(2 * i)) || !has(genes[i].alleles, full.charAt(2 * i + 1))) return;
      }
      list.push(full);
    });
    return list;
  }

  // ---- the state ---------------------------------------------------------------------------------

  function lv(state, id) { return n(state.run.up && state.run.up[id], 0); }

  function humus(state) { return Big.toNumber(Big.of(state.layers[LAYER] ? state.layers[LAYER].currency : 0, 0)); }

  function moves(state) { return n(state.layers[LAYER] && state.layers[LAYER].count, 0); }

  function climate(state) { return state.run.climate || ''; }

  function newId(state) {
    state.run.nid = n(state.run.nid, 0) + 1;
    return 'p' + state.run.nid.toString(36);
  }

  function gain(state, amount) {
    if (!(Big.gt(amount, 0))) return;
    state.run.coins = Big.str(Big.add(state.run.coins, amount));
    state.run.earned = Big.str(Big.add(state.run.earned, amount));
  }

  function news(state, text, now) {
    var r = state.run;
    r.newsSeq = n(r.newsSeq, 0) + 1;
    r.news = (r.news || []).concat([{ n: r.newsSeq, t: now, text: text }]).slice(-12);
  }

  function bedsMax(state, cfg) {
    var max = n(cfg['beds.max'], 24);
    if (climate(state) === 'rocky') max = Math.min(max, n(cfg['climate.rocky.beds'], 16));
    return max;
  }

  function bankCap(state, cfg) { return n(cfg['bank.start'], 30) + lv(state, 'bank') * n(cfg['bank.step'], 20); }

  function orderSlots(state, cfg) { return Math.min(n(cfg['orders.max'], 6), n(cfg['orders.count'], 3) + lv(state, 'board')); }

  function waterHours(state, cfg) { return n(cfg['water.hours'], 3) + lv(state, 'can') * n(cfg['can.hours'], 1); }

  function lensLevel(state, cfg) {
    if (moves(state) >= n(cfg['move.lensAll'], 5)) return 6;
    return Math.min(6, lv(state, 'lens'));
  }

  function unlocked(state, fam, cfg) {
    if (fam === 'moon') return true;
    return !!(state.meta.unlocked && state.meta.unlocked[fam]);
  }

  function albumCount(state, fam) {
    var c = 0;
    var album = state.meta.album || {};
    for (var k in album) {
      var head = k.split('/')[0];
      if (fam ? head === fam : FAMILIES[head]) c++;
    }
    return c;
  }

  function startSeeds(cfg, fam) {
    var tails = { moon: 'RWsrpq+-+---nn12', sun: 'RWoeSs+-+---nn12', fan: 'Kkacvvnn12' };
    var keys = { moon: 'start.seeds', sun: 'start.sunSeeds', fan: 'start.fanSeeds' };
    return parseSeeds(cfg[keys[fam]], fam, tails[fam]);
  }

  function seedOf(state, fam, g, o) {
    o = o || {};
    return { id: newId(state), f: fam, g: g, m: o.m || '', ch: o.ch || '', v: o.v === undefined ? 1 : o.v, at: o.at || 0, par: o.par || '', known: !!o.known, src: o.src || '' };
  }

  function emptyBed() { return { p: null, w: 0, slug: 0 }; }

  function init(ctx) {
    var cfg = ctx.config;
    var now = ctx.now;
    var run = {
      coins: Big.str(Big.of(cfg['start.coins'] || 0)), earned: '0e0', nid: 0, beds: [], bank: [], up: {}, orders: [],
      climate: '', hive: true, lamp: 0, barrelAt: 0, hiveAt: 0, news: [], newsSeq: 0, harvested: 0, sold: 0, crossed: 0,
      ev: { next: null, storm: 0, swarm: 0, warm: 0, wander: null }
    };
    var state = { run: run, meta: {}, layers: {} };
    for (var i = 0; i < n(cfg['start.beds'], 6); i++) run.beds.push(emptyBed());
    startSeeds(cfg, 'moon').forEach(function (g) { run.bank.push(seedOf(state, 'moon', g, { at: now, src: 'start', par: 'start' })); });
    for (var s = 0; s < orderSlots(state, cfg); s++) run.orders.push({ o: null, at: 0 });
    run.ev.next = { type: '', at: now + eventGap(ctx.rng || Rng.make(1), cfg) };
    return { run: run, layers: {}, meta: { album: {}, records: {}, names: {}, streak: { key: '', n: 0 }, unlocked: { moon: true }, given: {} } };
  }

  function ensure(state) {
    var r = state.run;
    r.beds = r.beds || [];
    r.bank = r.bank || [];
    r.up = r.up || {};
    r.orders = r.orders || [];
    r.ev = r.ev || { next: null, storm: 0, swarm: 0, warm: 0, wander: null };
    r.news = r.news || [];
    var m = state.meta;
    m.album = m.album || {};
    m.records = m.records || {};
    m.names = m.names || {};
    m.streak = m.streak || { key: '', n: 0 };
    m.unlocked = m.unlocked || { moon: true };
    m.given = m.given || {};
    if (!state.layers[LAYER]) state.layers[LAYER] = { currency: '0e0', count: 0, best: '0e0', state: {} };
  }

  // ---- time: night hours, watering, growth ---------------------------------------------------------

  function isNight(ms, cfg) {
    var d = new Date(ms);
    var h = d.getHours();
    var from = n(cfg['night.from'], 22);
    var to = n(cfg['night.to'], 6);
    return from > to ? h >= from || h < to : h >= from && h < to;
  }

  /** Seconds of the night hours (local time) within [from, to]. */
  function nightSec(from, to, cfg) {
    var nf = n(cfg['night.from'], 22);
    var nt = n(cfg['night.to'], 6);
    var total = 0;
    var t = from;
    for (var guard = 0; t < to && guard < 2000; guard++) {
      var d = new Date(t);
      var mid = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      var marks = [mid + nt * HOUR, mid + nf * HOUR, mid + 24 * HOUR, mid + (24 + nt) * HOUR];
      var next = to;
      for (var i = 0; i < marks.length; i++) if (marks[i] > t && marks[i] < next) next = marks[i];
      if (isNight(t, cfg)) total += next - t;
      t = next;
    }
    return total / 1000;
  }

  function nightOpen(state, ms, cfg) { return isNight(ms, cfg) || n(state.run.ev && state.run.ev.warm, 0) > ms; }

  function famCfg(fam, cfg) {
    return {
      bud: n(cfg[fam + '.budMin'], 20) * 60,
      bloom: n(cfg[fam + '.bloomMin'], 40) * 60,
      window: n(cfg[fam + '.windowH'], 6) * 3600
    };
  }

  function stageOf(p, cfg) {
    if (p.dead) return 4;
    var f = famCfg(p.f, cfg);
    if (p.gr >= f.bud + f.bloom) return 3;
    if (p.gr >= f.bud) return 2;
    if (p.gr >= f.bud * n(cfg['sprout.share'], 0.25)) return 1;
    return 0;
  }

  /** How far into the current stage (0..1): the ring around a plant. */
  function stageProgress(p, cfg) {
    var f = famCfg(p.f, cfg);
    var sprout = f.bud * n(cfg['sprout.share'], 0.25);
    var st = stageOf(p, cfg);
    if (st === 0) return p.gr / sprout;
    if (st === 1) return (p.gr - sprout) / (f.bud - sprout);
    if (st === 2) return (p.gr - f.bud) / f.bloom;
    if (st === 3) {
      if (p.f === 'fan') return p.pod ? Math.min(1, n(p.podT, 0) / (n(cfg['fan.podMin'], 120) * 60)) : 1;
      return Math.max(0, p.bl) / Math.max(1, n(p.win, f.window));
    }
    return 0;
  }

  /** Growth seconds a real second gives (without water, night, slugs). */
  function growthRate(state, p, cfg) {
    var speed = speedOf(p.g, p.f, cfg);
    var gh = 1 - Math.min(n(cfg['greenhouse.max'], 0.5), lv(state, 'greenhouse') * n(cfg['greenhouse.step'], 0.05));
    var c = climate(state);
    var clim = c === 'flood' ? n(cfg['climate.flood.growth'], 1.3) : c === 'north' ? n(cfg['climate.north.growth'], 0.8) : 1;
    var h = 1 + humus(state) * n(cfg['humus.growth'], 0.03);
    return clim * h / (speed * gh);
  }

  /** Seconds left to the next stage at the current pace (watered or not): for the screen and next(). */
  function secondsToNext(state, bed, p, cfg, now) {
    var f = famCfg(p.f, cfg);
    var st = stageOf(p, cfg);
    var target = st === 0 ? f.bud * n(cfg['sprout.share'], 0.25) : st === 1 ? f.bud : st === 2 ? f.bud + f.bloom : 0;
    if (st >= 3) return st === 3 && p.f !== 'fan' ? Math.max(0, p.bl) : 0;
    var rate = growthRate(state, p, cfg) * (bed.w > now ? 1 / n(cfg['grow.waterMult'], 0.67) : 1);
    return Math.max(0, (target - p.gr) / rate);
  }

  // ---- prices ----------------------------------------------------------------------------------------

  function priceOf(state, p, cfg) {
    var ph = phenotype(p.f, p.g, p.m, p.ch);
    return priceOfLook(state, ph, cfg);
  }

  function priceOfLook(state, ph, cfg) {
    var r = rarity(ph, cfg);
    var factor = 1;
    if (ph.fam === 'moon') factor = n(cfg['price.sizeBase'], 0.6) + n(cfg['price.sizeStep'], 0.1) * ph.size;
    else if (ph.fam === 'sun') factor = n(cfg['price.sizeBase'], 0.6) + n(cfg['price.sizeStep'], 0.1) * (ph.sweet + (climate(state) === 'salt' ? n(cfg['climate.salt.sweet'], 1) : 0));
    else factor = n(cfg['fan.sizeFactor'], 1);
    var mult = (1 + lv(state, 'vitrine') * n(cfg['vitrine.step'], 0.05)) * (1 + humus(state) * n(cfg['humus.price'], 0.05));
    if (ph.night) mult *= n(cfg['night.priceMult'], 3);
    if (ph.giant) mult *= n(cfg['giant.priceMult'], 2);
    if (climate(state) === 'salt' && ph.color === 'white' && ph.fam === 'moon') mult *= n(cfg['climate.salt.white'], 2);
    return n(cfg['price.base'], 5) * (1 + r) * factor * mult;
  }

  /** Coins for the first record of an album key: album.base × 2^rarity (the power capped). */
  function albumReward(key, cfg) {
    return n(cfg['album.base'], 50) * Math.pow(2, Math.min(rarityOfKey(key, cfg), n(cfg['album.capPow'], 16)));
  }

  // ---- the album, records, unlocks ----------------------------------------------------------------

  function record(state, key, now, cfg, out) {
    if (state.meta.album[key]) return false;
    state.meta.album[key] = now;
    var reward = albumReward(key, cfg);
    gain(state, reward);
    if (out) out.album.push(key);
    news(state, 'Новая запись альбома: ' + lookOfKey(key) + ' (+' + Math.round(reward) + ')', now);
    return true;
  }

  /** A plant shows its look (it bloomed): album, records, the clean line, unlocks. */
  function discover(state, p, cfg, now, out) {
    var ph = phenotype(p.f, p.g, p.m, p.ch);
    record(state, ph.key, now, cfg, out);
    if (ph.color2) record(state, chimeraKey(ph.color, ph.color2), now, cfg, out);
    if (ph.night) record(state, 'night/' + p.f + '/' + ph.color, now, cfg, out);
    if (p.f === 'moon') {
      var rk = 'moon/' + ph.color + '/' + ph.shape;
      if (n(state.meta.records[rk], -1) < ph.size) state.meta.records[rk] = ph.size;
    }
    if (p.par && p.par !== 'start') {
      var s = state.meta.streak;
      if (s.key === ph.key) s.n++;
      else {
        s.key = ph.key;
        s.n = 1;
      }
      s.best = Math.max(n(s.best, 0), s.n);
    }
    checkUnlocks(state, cfg, now);
  }

  function giveStart(state, fam, cfg, now) {
    if (state.meta.given[fam]) return;
    state.meta.given[fam] = now;
    startSeeds(cfg, fam).forEach(function (g) { state.run.bank.push(seedOf(state, fam, g, { at: now, src: 'start', par: 'start' })); });
  }

  function checkUnlocks(state, cfg, now) {
    var normal = albumCount(state);
    var u = state.meta.unlocked;
    if (!u.sun && (normal >= n(cfg['unlock.sun'], 20) || lv(state, 'boundary'))) {
      u.sun = now;
      giveStart(state, 'sun', cfg, now);
      news(state, 'Открыт Солнечник: стартовые семена в банке', now);
    }
    if (!u.fan && (normal >= n(cfg['unlock.fan'], 60) || lv(state, 'orangery'))) {
      u.fan = now;
      giveStart(state, 'fan', cfg, now);
      news(state, 'Открыт Веерник: стартовые семена в банке', now);
    }
  }

  // ---- seeds --------------------------------------------------------------------------------------

  /** The mutation rate on a bed: μ × lamp × storm × climate. */
  function muOf(state, bedIndex, cfg, now) {
    var mu = n(cfg['mut.mu'], 0.004);
    if (bedIndex === n(state.run.lamp, 0) && lv(state, 'lamp')) mu *= Math.pow(n(cfg['lamp.mult'], 1.2), lv(state, 'lamp'));
    if (n(state.run.ev.storm, 0) > now) mu *= n(cfg['event.storm.mu'], 5);
    if (climate(state) === 'rocky') mu *= n(cfg['climate.rocky.mu'], 2);
    return Math.min(1, mu);
  }

  /** A seed of mother × father with the mutations of the bed. */
  function childSeed(state, fam, gm, gf, mm, fm, rng, cfg, now, bedIndex) {
    var mu = muOf(state, bedIndex, cfg, now);
    var c = crossGenes(fam, gm, gf, rng, mu, cfg);
    var m = '';
    var ch = '';
    if (fam === 'moon' && rng.chance(n(cfg['mut.giant'], 0.001))) m += 'G';
    if (fam === 'moon' && rng.chance(n(cfg['mut.chimera'], 0.0005))) {
      var own = colorOf(pair(c.g, fam, 'color'));
      var others = LOOKS.moon.color.filter(function (x) { return x !== own; });
      ch = rng.pick(others);
      m += 'C';
    }
    var night = n(cfg['mut.night'], 0.002) * (climate(state) === 'north' ? n(cfg['climate.north.night'], 2) : 1);
    if ((fam === 'moon' || fam === 'sun') && rng.chance(night)) m += 'N';
    var seed = seedOf(state, fam, c.g, { m: m, ch: ch, at: now, par: phenotype(fam, gm, mm).key + '|' + phenotype(fam, gf, fm).key, src: 'cross' });
    if (c.mutated.length) seed.mut = c.mutated.length;
    return seed;
  }

  /** Viability of a seed now: −bank.decayPerDay a day in the bank, not below bank.minViability (a fridge stops it). */
  function viability(state, seed, cfg, now) {
    var v = n(seed.v, 1);
    if (lv(state, 'fridge')) return v;
    var days = Math.max(0, now - n(seed.at, now)) / DAY;
    return Math.max(n(cfg['bank.minViability'], 0.5), Math.min(v, v - days * n(cfg['bank.decayPerDay'], 0.05)));
  }

  /** Puts seeds into the bank up to its capacity; returns how many fit. Chests may overfill it. */
  function store(state, seeds, cfg, force) {
    var room = bankCap(state, cfg) - state.run.bank.length;
    var put = 0;
    for (var i = 0; i < seeds.length; i++) {
      if (!force && put >= room) break;
      state.run.bank.push(seeds[i]);
      put++;
    }
    return put;
  }

  /** The seeds a pod gives: 2 + round(fert / 2) + fertilizer. */
  function podSeeds(state, p, cfg) {
    return n(cfg['seeds.base'], 2) + Math.round(fertOf(p.g, p.f) / 2) + lv(state, 'fert') * n(cfg['fert.step'], 1);
  }

  function harvestPod(state, p, bedIndex, rng, cfg, now) {
    if (!p.pod) return { made: 0, kept: 0 };
    var count = podSeeds(state, p, cfg);
    var seeds = [];
    for (var i = 0; i < count; i++) seeds.push(childSeed(state, p.f, p.g, p.pod, p.m, p.podM || '', rng, cfg, now, bedIndex));
    var kept = store(state, seeds, cfg, false);
    p.pod = null;
    p.podM = '';
    p.podT = 0;
    state.run.crossed = n(state.run.crossed, 0) + 1;
    return { made: count, kept: kept };
  }

  // ---- events ------------------------------------------------------------------------------------

  function eventGap(rng, cfg) {
    return rng.range(n(cfg['event.minH'], 10), n(cfg['event.maxH'], 20)) * HOUR;
  }

  var EVENT_TITLES = { storm: 'Гроза', swarm: 'Пчелиный рой', wander: 'Странница с семенами', warm: 'Тёплая ночь', slugs: 'Слизни' };

  function growingBeds(state, cfg) {
    var out = [];
    state.run.beds.forEach(function (b, i) { if (b.p && !b.p.dead && stageOf(b.p, cfg) < 3 && !b.slug) out.push(i); });
    return out;
  }

  /** A seed with a rare allele in a heterozygote (the wanderer's): its type hidden. */
  function rareSeed(state, rng, cfg, now) {
    var fam = 'moon';
    var genes = FAMILIES[fam].genes;
    var rareGenes = genes.filter(function (gene) { return gene.rare; });
    var gene = rng.pick(rareGenes);
    var g = '';
    for (var i = 0; i < genes.length; i++) {
      var common = genes[i].alleles.split('').filter(function (a) { return !has(genes[i].rare, a); });
      if (genes[i].id === gene.id) g += rng.pick(gene.rare.split('')) + rng.pick(common);
      else g += rng.pick(common) + rng.pick(common);
    }
    return seedOf(state, fam, g, { at: now, src: 'wander', par: 'wander' });
  }

  function startEvent(state, type, at, rng, cfg, out) {
    var ev = state.run.ev;
    if (type === 'storm') ev.storm = at + n(cfg['event.storm.min'], 60) * 60000;
    else if (type === 'swarm') ev.swarm = at + n(cfg['event.swarm.min'], 30) * 60000;
    else if (type === 'warm') ev.warm = at + n(cfg['event.warm.hours'], 8) * HOUR;
    else if (type === 'wander') ev.wander = { seed: rareSeed(state, rng, cfg, at), price: n(cfg['event.wander.price'], 400) * (1 + moves(state)), until: at + n(cfg['event.wander.hours'], 3) * HOUR };
    else if (type === 'slugs') {
      var list = growingBeds(state, cfg);
      if (!list.length) return false;
      var i = rng.pick(list);
      state.run.beds[i].slug = n(cfg['event.slugs.taps'], 3);
    }
    var text = EVENT_TITLES[type] + (type === 'slugs' ? ': рост на грядке остановлен, уберите их касаниями' : type === 'wander' ? ': продаёт семя с редким геном' : '');
    news(state, text, at);
    if (out) out.events.push(EVENT_TITLES[type]);
    return true;
  }

  function pickEvent(state, rng, cfg) {
    var list = EVENTS.slice();
    return rng.weighted(list, function (t) { return n(cfg['event.w.' + t], 1); });
  }

  function runEvents(state, rng, cfg, now, out) {
    var ev = state.run.ev;
    if (!ev.next) ev.next = { type: '', at: now + eventGap(rng, cfg) };
    for (var guard = 0; ev.next.at <= now && guard < 20; guard++) {
      var at = ev.next.at;
      var type = ev.next.type || pickEvent(state, rng, cfg);
      if (!startEvent(state, type, at, rng, cfg, out)) startEvent(state, 'storm', at, rng, cfg, out);
      ev.next = { type: '', at: at + eventGap(rng, cfg) };
    }
    // The meteo station sees the next event ahead: its type is decided as soon as it is in view.
    if (!ev.next.type && ev.next.at - now <= n(cfg['meteo.aheadH'], 2) * HOUR) ev.next.type = pickEvent(state, rng, cfg);
    if (ev.wander && ev.wander.until <= now) ev.wander = null;
  }

  // ---- pollination --------------------------------------------------------------------------------

  function canPollinate(state, a, b, cfg, now) {
    if (!a || !b || a.dead || b.dead || a.f !== b.f) return false;
    if (stageOf(a, cfg) !== 3 || stageOf(b, cfg) !== 3) return false;
    if (b.pod) return false;
    if ((a.m.indexOf('N') >= 0 || b.m.indexOf('N') >= 0) && !nightOpen(state, now, cfg)) return false;
    return true;
  }

  function pollinateRaw(b, a, now) {
    b.pod = a.g;
    b.podM = a.m;
    b.podT = 0;
    b.podAt = now;
  }

  function hive(state, rng, cfg, now, out) {
    var beds = state.run.beds;
    var made = 0;
    for (var i = 0; i < beds.length; i++) {
      var b = beds[i].p;
      if (!b || b.pod || b.dead || stageOf(b, cfg) !== 3) continue;
      var near = [];
      [i - 1, i + 1].forEach(function (j) {
        if (j >= 0 && j < beds.length && beds[j].p && canPollinate(state, beds[j].p, b, cfg, now)) near.push(beds[j].p);
      });
      if (!near.length) continue;
      pollinateRaw(b, rng.pick(near), now);
      made++;
    }
    if (out) out.hive += made;
    return made;
  }

  function swarm(state, dt, rng, cfg, now, out) {
    var beds = state.run.beds;
    var p = 1 - Math.exp(-dt / (n(cfg['event.swarm.meanMin'], 5) * 60));
    for (var i = 0; i < beds.length; i++) {
      var b = beds[i].p;
      if (!b || b.pod || b.dead || stageOf(b, cfg) !== 3 || !rng.chance(p)) continue;
      var same = [];
      beds.forEach(function (x) { if (x.p && canPollinate(state, x.p, b, cfg, now)) same.push(x.p); });
      if (!same.length) continue;
      pollinateRaw(b, rng.pick(same), now);
      if (out) out.swarm++;
    }
  }

  // ---- the step of time -----------------------------------------------------------------------------

  function newOut() { return { sprout: 0, bud: 0, bloom: [], wilt: 0, wiltSeeds: 0, compost: 0, barrel: 0, hive: 0, swarm: 0, events: [], album: [], fanCoins: 0, pods: 0, lost: 0 }; }

  function wilt(state, p, i, rng, cfg, now, out) {
    var h = harvestPod(state, p, i, rng, cfg, now);
    var seeds = h.kept;
    if (!h.made && lv(state, 'dryer')) {
      var self = childSeed(state, p.f, p.g, p.g, p.m, p.m, rng, cfg, now, i);
      self.src = 'self';
      seeds += store(state, [self], cfg, false);
    }
    var coins = 0;
    if (lv(state, 'compost')) {
      coins = priceOf(state, p, cfg) * n(cfg['compost.share'], 0.3);
      gain(state, coins);
    }
    p.dead = 1;
    p.pod = null;
    if (out) {
      out.wilt++;
      out.wiltSeeds += seeds;
      out.compost += coins;
      out.lost += h.made - h.kept;
    }
    news(state, 'Увял: ' + look(phenotype(p.f, p.g, p.m, p.ch)) + (seeds ? ', семян ' + seeds : '') + (coins ? ', компост +' + Math.round(coins) : ''), now);
  }

  /**
   * One stretch of time [now − dt, now]: events, the barrel, growth (water and night counted
   * exactly), bloom windows, wilting, the hive, the swarm, Веерник's coins, orders refilled.
   */
  function step(state, dt, ctx, out) {
    var cfg = ctx.config;
    var now = ctx.now;
    var from = now - dt * 1000;
    var rng = ctx.rng;
    var r = state.run;
    ensure(state);
    runEvents(state, rng, cfg, now, out);
    // The rain barrel waters every bed at its own times.
    if (lv(state, 'barrel')) {
      var every = Math.max(n(cfg['barrel.minH'], 1), n(cfg['barrel.everyH'], 4) - (lv(state, 'barrel') - 1) * n(cfg['barrel.stepMin'], 20) / 60) * HOUR;
      if (!(r.barrelAt > 0)) r.barrelAt = from + every;
      for (var guard = 0; r.barrelAt <= now && guard < 200; guard++) {
        var at = r.barrelAt;
        var until = at + waterHours(state, cfg) * HOUR;
        r.beds.forEach(function (b) { if (b.w < until) b.w = until; });
        if (out) out.barrel++;
        r.barrelAt = at + every;
      }
    }
    var waterMult = n(cfg['grow.waterMult'], 0.67);
    var warm = n(r.ev.warm, 0);
    var nightCache = null;
    var waitUnseen = !!cfg['bloom.waitUnseen'];
    for (var i = 0; i < r.beds.length; i++) {
      var bed = r.beds[i];
      var p = bed.p;
      if (!p || p.dead) continue;
      var night = p.m.indexOf('N') >= 0;
      var openSec = dt;
      if (night) {
        if (nightCache === null) {
          var warmSec = Math.max(0, Math.min(now, warm) - from) / 1000;
          nightCache = Math.min(dt, nightSec(from, now, cfg) + warmSec);
        }
        openSec = nightCache;
      }
      var f = famCfg(p.f, cfg);
      var bloomAt = f.bud + f.bloom;
      var before = stageOf(p, cfg);
      if (!p.bloomed) {
        if (!bed.slug) {
          var wet = Math.max(0, Math.min(now, bed.w) - from) / 1000;
          var eff = growthRate(state, p, cfg) * ((dt - wet) + wet / waterMult);
          if (night) eff *= dt > 0 ? openSec / dt : 0;
          p.gr += eff;
        }
        var after = stageOf(p, cfg);
        if (out && before < 1 && after >= 1) out.sprout++;
        if (out && before < 2 && after >= 2) out.bud++;
        if (after === 3) {
          p.bloomed = 1;
          p.gr = bloomAt;
          p.win = p.f === 'fan' ? 0 : f.window + lv(state, 'guard') * n(cfg['guard.hours'], 1) * 3600;
          p.bl = p.win;
          p.seen = !ctx.offline || !waitUnseen;
          discover(state, p, cfg, now, out);
          if (out) out.bloom.push(look(phenotype(p.f, p.g, p.m, p.ch)));
          news(state, 'Зацвело: ' + look(phenotype(p.f, p.g, p.m, p.ch)), now);
        }
        continue;
      }
      // In bloom.
      if (!ctx.offline) p.seen = true;
      if (p.f === 'fan') {
        if (p.pod) {
          p.podT = n(p.podT, 0) + dt;
          if (p.podT >= n(cfg['fan.podMin'], 120) * 60) {
            var hv = harvestPod(state, p, i, rng, cfg, now);
            if (out) {
              out.pods++;
              out.lost += hv.made - hv.kept;
            }
            news(state, 'Веерник уронил семена: ' + hv.kept, now);
          }
        }
        var income = priceOf(state, p, cfg) * n(cfg['fan.incomeShare'], 0.2) * dt / 3600;
        gain(state, income);
        if (out) out.fanCoins += income;
        continue;
      }
      if (p.seen || !waitUnseen) {
        p.bl -= night ? openSec : dt;
        if (p.bl <= 0) wilt(state, p, i, rng, cfg, now, out);
      }
    }
    if (lv(state, 'hive') && r.hive) {
      var everyHive = n(cfg['hive.everyMin'], 10) * 60000;
      if (!(r.hiveAt > 0)) r.hiveAt = now + everyHive;
      if (r.hiveAt <= now) {
        hive(state, rng, cfg, now, out);
        r.hiveAt = now + everyHive;
      }
    }
    if (n(r.ev.swarm, 0) > from) swarm(state, Math.min(dt, (r.ev.swarm - from) / 1000), rng, cfg, now, out);
    refillOrders(state, rng, cfg, now);
  }

  function tick(state, dt, ctx) {
    step(state, dt, ctx, null);
  }

  /**
   * The absence: the same steps in pieces of offline.chunkSec (growth by the wall clock, no rates
   * recounted), then the summary lines «Пока вас не было».
   */
  function offline(state, sec, ctx) {
    var cfg = ctx.config;
    var out = newOut();
    var end = ctx.now;
    var chunk = Math.max(10, n(cfg['offline.chunkSec'], 300));
    var t = end - sec * 1000;
    var c = {};
    for (var k in ctx) c[k] = ctx[k];
    c.offline = true;
    while (t < end - 1) {
      var to = Math.min(end, t + chunk * 1000);
      c.now = to;
      step(state, (to - t) / 1000, c, out);
      t = to;
    }
    return { events: summaryLines(out) };
  }

  function summaryLines(out) {
    var lines = [];
    // One number per line, so another language translates each line by one pattern.
    if (out.sprout) lines.push('Новых ростков: ' + out.sprout);
    if (out.bud) lines.push('Новых бутонов: ' + out.bud);
    if (out.bloom.length) lines.push('Зацвело растений: ' + out.bloom.length);
    out.bloom.slice(0, 4).forEach(function (look) { lines.push('Зацвело: ' + look); });
    if (out.bloom.length > 4) lines.push('Зацвело ещё: ' + (out.bloom.length - 4));
    if (out.album.length) lines.push('Новых записей альбома: ' + out.album.length);
    if (out.wilt) lines.push('Увяло: ' + out.wilt);
    if (out.wiltSeeds) lines.push('Семян от увядших: ' + out.wiltSeeds);
    if (out.compost) lines.push('Компост: +' + Math.round(out.compost));
    if (out.pods) lines.push('Веерники роняли семена: ' + out.pods);
    if (out.lost) lines.push('Банк семян полон: пропало семян ' + out.lost);
    if (out.barrel) lines.push('Поливов бочкой: ' + out.barrel);
    if (out.hive) lines.push('Улей опылил цветков: ' + out.hive);
    if (out.swarm) lines.push('Рой опылил цветков: ' + out.swarm);
    if (out.events.length) out.events.forEach(function (e) { lines.push('Событие: ' + e); });
    return lines;
  }

  // ---- orders ---------------------------------------------------------------------------------------

  /** Genotypes the owner has of a family: seeds in the bank and plants on the beds. */
  function owned(state, fam) {
    var out = [];
    state.run.bank.forEach(function (s) { if (s.f === fam) out.push(s.g); });
    state.run.beds.forEach(function (b) { if (b.p && !b.p.dead && b.p.f === fam) out.push(b.p.g); });
    return out;
  }

  /**
   * A new order reachable from what the owner has in one cross: two owned genotypes of a family,
   * a look their offspring can have, and two of its traits as the target.
   */
  function makeOrder(state, rng, cfg) {
    var fams = ['moon'];
    if (unlocked(state, 'sun', cfg) && owned(state, 'sun').length) fams.push('sun');
    var fam = rng.pick(fams);
    var list = owned(state, fam);
    if (!list.length) list = startSeeds(cfg, fam);
    if (!list.length) return null;
    var a = rng.pick(list);
    var b = rng.pick(list);
    var off = offspring(fam, a, b);
    var pick = rng.pick(off.keys).key.split('/');
    var o = { id: 'o' + (n(state.run.nid, 0) + 1).toString(36) + rng.int(1000), f: fam, c: '', s: '', p: '', z: 0 };
    state.run.nid = n(state.run.nid, 0) + 1;
    var kind = rng.int(3);
    var maxSize = 0;
    for (var s in off.per.size) if (Number(s) > maxSize) maxSize = Number(s);
    if (fam === 'moon') {
      if (kind === 0) {
        o.c = pick[1];
        o.s = pick[2];
      } else if (kind === 1 && maxSize >= 4) {
        o.p = pick[3];
        o.z = Math.min(maxSize, n(cfg['orders.minSize'], 5));
      } else {
        o.c = pick[1];
        o.p = pick[3];
      }
    } else if (kind === 0) {
      o.c = pick[1];
      o.p = pick[3];
    } else if (kind === 1) {
      o.c = pick[1];
      o.s = pick[2];
    } else {
      o.s = pick[2];
      o.p = pick[3];
    }
    return o;
  }

  function orderText(o) {
    if (o.t) return o.t;
    if (o.f === 'moon') {
      if (o.c && o.s) return cap(WORDS.color[o.c][WORDS.shape[o.s][1]] + ' ' + WORDS.shape[o.s][0]);
      if (o.p && o.z) return cap(WORDS.patternNoun[o.p] + ', любой цвет, размер ' + o.z + '+');
      if (o.c && o.p) return cap(WORDS.color[o.c][0] + ' цветок' + (WORDS.pattern[o.p] ? ' ' + WORDS.pattern[o.p] : ', сплошной'));
      if (o.p) return cap(WORDS.patternNoun[o.p] + ', любой цвет');
      return 'Луноцвет';
    }
    var parts = [];
    if (o.c) parts.push(WORDS.color[o.c][1] + (o.p ? ' ' + WORDS.berry[o.p] : '') + ' ягода');
    else if (o.p) parts.push(WORDS.berry[o.p] + ' ягода');
    if (o.s) parts.push(WORDS.thorns[o.s]);
    return cap(parts.join(', ') || 'Солнечник');
  }

  function matches(o, p) {
    if (!o || !p || o.f !== p.f) return false;
    var ph = phenotype(p.f, p.g, p.m, p.ch);
    if (p.f === 'moon') {
      if (o.c && ph.color !== o.c) return false;
      if (o.s && ph.shape !== o.s) return false;
      if (o.p && ph.pattern !== o.p) return false;
      if (o.z && ph.size < o.z) return false;
      return true;
    }
    if (o.c && ph.color !== o.c) return false;
    if (o.s && ph.thorns !== o.s) return false;
    if (o.p && ph.berry !== o.p) return false;
    return true;
  }

  function refillOrders(state, rng, cfg, now) {
    var r = state.run;
    var slots = orderSlots(state, cfg);
    while (r.orders.length < slots) r.orders.push({ o: null, at: now });
    for (var i = 0; i < r.orders.length; i++) {
      var s = r.orders[i];
      if (!s.o && s.at <= now) {
        s.o = makeOrder(state, rng, cfg);
        s.at = 0;
      }
    }
  }

  // ---- actions (the screen calls them inside g.act) --------------------------------------------------

  function bedOf(state, i) { return state.run.beds[i] || null; }

  /** Plants the seed on an empty bed; it may not sprout (viability). {ok, why?, dud?}. */
  function plant(state, i, seedId, rng, cfg, now) {
    var bed = bedOf(state, i);
    if (!bed || bed.p) return { ok: false, why: 'грядка занята' };
    var k = -1;
    for (var j = 0; j < state.run.bank.length; j++) if (state.run.bank[j].id === seedId) k = j;
    if (k < 0) return { ok: false, why: 'нет такого семени' };
    var seed = state.run.bank[k];
    if (!unlocked(state, seed.f, cfg)) return { ok: false, why: FAMILIES[seed.f].title + ' ещё не открыт' };
    state.run.bank.splice(k, 1);
    if (!rng.chance(viability(state, seed, cfg, now))) return { ok: true, dud: true };
    bed.p = { id: seed.id, f: seed.f, g: seed.g, m: seed.m || '', ch: seed.ch || '', gr: 0, bl: 0, win: 0, seen: true, pod: null, at: now, par: seed.par || '', known: !!seed.known };
    return { ok: true };
  }

  function water(state, i, cfg, now) {
    var bed = bedOf(state, i);
    if (!bed) return false;
    var until = now + waterHours(state, cfg) * HOUR;
    if (bed.w >= until - 60000) return false;
    bed.w = until;
    return true;
  }

  function waterAll(state, cfg, now) {
    var c = 0;
    for (var i = 0; i < state.run.beds.length; i++) if (water(state, i, cfg, now)) c++;
    return c;
  }

  /** Pollen from bed a onto bed b (a === b — self). {ok, why?}. */
  function pollinate(state, a, b, cfg, now) {
    var A = bedOf(state, a);
    var B = bedOf(state, b);
    if (!A || !B || !A.p || !B.p) return { ok: false, why: 'нужны два цветка' };
    if (A.p.f !== B.p.f) return { ok: false, why: 'скрещивать можно только внутри семейства' };
    if (B.p.pod) return { ok: false, why: 'этот цветок уже принял пыльцу' };
    if (!canPollinate(state, A.p, B.p, cfg, now)) return { ok: false, why: 'оба должны цвести' };
    pollinateRaw(B.p, A.p, now);
    return { ok: true };
  }

  function canCut(state, p, cfg, now) {
    if (!p || p.dead || p.f === 'fan' || stageOf(p, cfg) !== 3) return false;
    if (p.m.indexOf('N') >= 0 && !nightOpen(state, now, cfg)) return false;
    return true;
  }

  /**
   * Cuts a blooming plant: an open order it fits takes it (price × orders.mult), else it is sold;
   * its pod gives seeds. {ok, coins, seeds, lost, order?, night?}.
   */
  function cut(state, i, rng, cfg, now, o) {
    o = o || {};
    var bed = bedOf(state, i);
    var p = bed && bed.p;
    if (!canCut(state, p, cfg, now)) return { ok: false };
    var price = priceOf(state, p, cfg);
    var res = { ok: true, coins: price, seeds: 0, lost: 0, order: null, night: p.m.indexOf('N') >= 0, look: look(phenotype(p.f, p.g, p.m, p.ch)) };
    if (o.order !== false) {
      for (var k = 0; k < state.run.orders.length; k++) {
        var s = state.run.orders[k];
        if (s.o && matches(s.o, p) && (!o.orderId || o.orderId === s.o.id)) {
          res.order = orderText(s.o);
          res.coins = price * n(cfg['orders.mult'], 3);
          s.o = null;
          s.at = now + n(cfg['orders.refillMin'], 30) * 60000;
          state.run.fulfilled = n(state.run.fulfilled, 0) + 1;
          break;
        }
      }
    }
    var h = harvestPod(state, p, i, rng, cfg, now);
    res.seeds = h.kept;
    res.lost = h.made - h.kept;
    gain(state, res.coins);
    state.run.harvested = n(state.run.harvested, 0) + 1;
    if (!res.order) state.run.sold = n(state.run.sold, 0) + 1;
    bed.p = null;
    return res;
  }

  /** The cart: cuts everything in bloom at once. */
  function cutAll(state, rng, cfg, now) {
    var total = { n: 0, coins: 0, seeds: 0, orders: 0, lost: 0 };
    for (var i = 0; i < state.run.beds.length; i++) {
      var r = cut(state, i, rng, cfg, now);
      if (!r.ok) continue;
      total.n++;
      total.coins += r.coins;
      total.seeds += r.seeds;
      total.lost += r.lost;
      if (r.order) total.orders++;
    }
    return total;
  }

  /** Clears a wilted plant (or removes a Веерник). */
  function clear(state, i) {
    var bed = bedOf(state, i);
    if (!bed || !bed.p) return false;
    bed.p = null;
    return true;
  }

  /** A tap on slugs: one fewer; true when the bed is free of them. */
  function slugTap(state, i) {
    var bed = bedOf(state, i);
    if (!bed || !bed.slug) return false;
    bed.slug = Math.max(0, bed.slug - 1);
    return bed.slug === 0;
  }

  function chase(state, now) {
    if (!(n(state.run.ev.swarm, 0) > now)) return false;
    state.run.ev.swarm = now;
    return true;
  }

  function buyWander(state, now) {
    var w = state.run.ev.wander;
    if (!w || w.until <= now) return { ok: false, why: 'странница ушла' };
    if (Big.lt(state.run.coins, w.price)) return { ok: false, why: 'не хватает монет' };
    state.run.coins = Big.str(Big.sub(state.run.coins, w.price));
    state.run.bank.push(w.seed);
    state.run.ev.wander = null;
    return { ok: true };
  }

  /**
   * The seed stall: a seed of the start set of an open family (index `idx` of the set, or a
   * random one), so a garden whose lines have lost an allele can always get it back. {ok, seed?, why?}.
   */
  function buySeed(state, fam, idx, rng, cfg, now) {
    fam = fam || 'moon';
    if (!unlocked(state, fam, cfg)) return { ok: false, why: FAMILIES[fam].title + ' ещё не открыт' };
    var price = n(cfg['shop.price'], 30);
    if (Big.lt(state.run.coins, price)) return { ok: false, why: 'не хватает монет' };
    if (state.run.bank.length >= bankCap(state, cfg)) return { ok: false, why: 'банк семян полон' };
    var list = startSeeds(cfg, fam);
    if (!list.length) return { ok: false, why: 'нет стартовых семян' };
    var g = idx >= 0 && idx < list.length ? list[idx] : rng.pick(list);
    state.run.coins = Big.str(Big.sub(state.run.coins, price));
    var seed = seedOf(state, fam, g, { at: now, src: 'shop', par: 'start' });
    state.run.bank.push(seed);
    return { ok: true, seed: seed };
  }

  function discard(state, seedId) {
    var before = state.run.bank.length;
    state.run.bank = state.run.bank.filter(function (s) { return s.id !== seedId; });
    return state.run.bank.length < before;
  }

  /** The bloom spend: every plant in bloom gets spend.bloomHours more. */
  function extendBloom(state, cfg) {
    var c = 0;
    state.run.beds.forEach(function (b) {
      if (b.p && !b.p.dead && b.p.f !== 'fan' && stageOf(b.p, cfg) === 3) {
        b.p.bl += n(cfg['spend.bloomHours'], 3) * 3600;
        b.p.win = n(b.p.win, 0) + n(cfg['spend.bloomHours'], 3) * 3600;
        c++;
      }
    });
    return c;
  }

  // ---- upgrades ---------------------------------------------------------------------------------------

  function upMax(state, id, cfg) {
    if (id === 'beds') return bedsMax(state, cfg) - n(cfg['start.beds'], 6);
    if (id === 'board') return n(cfg['orders.max'], 6) - n(cfg['orders.count'], 3);
    if (id === 'lens') return 6;
    if (id === 'greenhouse') return Math.round(n(cfg['greenhouse.max'], 0.5) / n(cfg['greenhouse.step'], 0.05));
    // 0 in the settings: no limit, the price just keeps growing.
    var max = n(cfg['up.' + id + '.max'], 1);
    return max > 0 ? max : Infinity;
  }

  function upCost(state, id, cfg) {
    return Big.mul(Big.of(cfg['up.' + id + '.base'] || 0), Math.pow(n(cfg['up.' + id + '.growth'], 1), lv(state, id)));
  }

  /** Can the upgrade be bought now: {ok, why, cost}. */
  function upInfo(state, id, cfg) {
    var level = lv(state, id);
    var max = upMax(state, id, cfg);
    var cost = upCost(state, id, cfg);
    if (level >= max) return { ok: false, why: 'максимум', cost: cost, level: level, max: max };
    if (id === 'beds' && state.run.beds.length >= bedsMax(state, cfg)) return { ok: false, why: 'максимум', cost: cost, level: level, max: max };
    if (id === 'notebook' && !lensLevel(state, cfg)) return { ok: false, why: 'нужна Лупа', cost: cost, level: level, max: max };
    if (id === 'boundary' && unlocked(state, 'sun', cfg)) return { ok: false, why: 'уже открыт', cost: cost, level: level, max: max };
    if (id === 'orangery' && unlocked(state, 'fan', cfg)) return { ok: false, why: 'уже открыт', cost: cost, level: level, max: max };
    if (Big.lt(state.run.coins, cost)) return { ok: false, why: 'не хватает монет', cost: cost, level: level, max: max, short: true };
    return { ok: true, cost: cost, level: level, max: max };
  }

  function upgrade(state, id, cfg, now) {
    var info = upInfo(state, id, cfg);
    if (!info.ok) return info;
    state.run.coins = Big.str(Big.sub(state.run.coins, info.cost));
    state.run.up[id] = lv(state, id) + 1;
    if (id === 'beds') state.run.beds.push(emptyBed());
    if (id === 'boundary' || id === 'orangery') checkUnlocks(state, cfg, now);
    if (id === 'fridge') {
      // Seeds keep the viability they have at this moment.
      state.run.up.fridge = 0;
      state.run.bank.forEach(function (s) {
        s.v = viability(state, s, cfg, now);
        s.at = now;
      });
      state.run.up.fridge = 1;
    }
    return { ok: true, cost: info.cost };
  }

  // ---- prestige: the move to a new plot -----------------------------------------------------------------

  function prestigeGain(state, layerId, cfg) {
    ensure(state);
    if (albumCount(state) < n(cfg['move.minAlbum'], 60)) return Big.ZERO;
    var ratio = Big.div(Big.of(state.run.earned, 0), n(cfg['move.divisor'], 10000));
    if (Big.lt(ratio, 1)) return Big.ZERO;
    return Big.floor(Big.sqrt(ratio));
  }

  function bonus(state, layerId, amount, cfg) {
    var h = Big.toNumber(Big.of(amount, 0));
    return 'рост ×' + fmt2(1 + h * n(cfg['humus.growth'], 0.03)) + ', цена ×' + fmt2(1 + h * n(cfg['humus.price'], 0.05));
  }

  function fmt2(x) { return String(Math.round(x * 100) / 100).replace('.', ','); }

  /** The seeds kept by default: rare looks first, then the newest. */
  function defaultKeep(state, cfg) {
    var list = state.run.bank.slice();
    list.sort(function (a, b) {
      var ra = rarity(phenotype(a.f, a.g, a.m, a.ch), cfg) + (a.m ? 10 : 0);
      var rb = rarity(phenotype(b.f, b.g, b.m, b.ch), cfg) + (b.m ? 10 : 0);
      return rb - ra || n(b.at, 0) - n(a.at, 0);
    });
    return list.slice(0, n(cfg['move.keepSeeds'], 10)).map(function (s) { return s.id; });
  }

  /**
   * After the engine's reset: the chosen climate and up to move.keepSeeds seeds come along
   * (state.meta.movePlan, set by the screen before the move; otherwise the defaults).
   */
  function onPrestige(state, layerId, before, ctx) {
    var cfg = ctx.config;
    ensure(state);
    var plan = before.meta && before.meta.movePlan ? before.meta.movePlan : {};
    var keep = plan.seeds && plan.seeds.length ? plan.seeds : defaultKeep(before, cfg);
    keep = keep.slice(0, n(cfg['move.keepSeeds'], 10));
    state.run.climate = CLIMATES.indexOf(plan.climate) >= 0 ? plan.climate : CLIMATES[0];
    state.run.bank = [];
    var now = ctx.now || Date.now();
    (before.run.bank || []).forEach(function (s) {
      if (keep.indexOf(s.id) < 0) return;
      var copy = {};
      for (var k in s) copy[k] = s[k];
      copy.v = viability(before, s, cfg, now);
      copy.at = now;
      state.run.bank.push(copy);
    });
    // Never an empty plot: without two seeds of Луноцвет the start set comes too.
    var moon = state.run.bank.filter(function (s) { return s.f === 'moon'; }).length;
    if (moon < 2) startSeeds(cfg, 'moon').forEach(function (g) { state.run.bank.push(seedOf(state, 'moon', g, { at: now, src: 'start', par: 'start' })); });
    state.run.nid = Math.max(n(state.run.nid, 0), n(before.run.nid, 0));
    if (state.run.climate === 'rocky' && state.run.beds.length > bedsMax(state, cfg)) state.run.beds = state.run.beds.slice(0, bedsMax(state, cfg));
    delete state.meta.movePlan;
    state.meta.climates = state.meta.climates || [];
    state.meta.climates.push(state.run.climate);
    news(state, 'Переезд: новый участок — ' + climateTitle(state.run.climate), now);
  }

  var CLIMATE_TITLES = { flood: 'Пойма', rocky: 'Каменистый склон', north: 'Северный берег', salt: 'Солончак' };
  function climateTitle(id) { return CLIMATE_TITLES[id] || 'Первый участок'; }

  // ---- the engine's other hooks -------------------------------------------------------------------------

  function migrate(state, fromVer) { return state; }

  function validate(state) {
    var r = state.run;
    if (!Array.isArray(r.beds)) return 'нет грядок';
    if (!Array.isArray(r.bank)) return 'нет банка семян';
    if (!Big.valid(r.coins) || Big.sign(r.coins) < 0) return 'монет меньше нуля';
    for (var i = 0; i < r.beds.length; i++) {
      var p = r.beds[i] && r.beds[i].p;
      if (!p) continue;
      if (!FAMILIES[p.f]) return 'неизвестное семейство на грядке ' + (i + 1);
      if (typeof p.g !== 'string' || p.g.length !== FAMILIES[p.f].genes.length * 2) return 'испорчен генотип на грядке ' + (i + 1);
      if (typeof p.gr !== 'number' || p.gr !== p.gr) return 'испорчен рост на грядке ' + (i + 1);
    }
    for (var j = 0; j < r.bank.length; j++) {
      var s = r.bank[j];
      if (!s || !FAMILIES[s.f] || typeof s.g !== 'string' || s.g.length !== FAMILIES[s.f].genes.length * 2) return 'испорчено семя ' + (j + 1);
    }
    return null;
  }

  function summary(state, cfg) {
    ensure(state);
    var parts = ['Альбом ' + albumCount(state) + ' из ' + (albumKeys('moon').length + albumKeys('sun').length + albumKeys('fan').length)];
    var bloom = 0;
    state.run.beds.forEach(function (b) { if (b.p && !b.p.dead && stageOf(b.p, cfg) === 3 && b.p.f !== 'fan') bloom++; });
    if (bloom) parts.push('цветёт ' + bloom);
    parts.push('грядок ' + state.run.beds.length);
    if (moves(state)) parts.push('переездов ' + moves(state));
    return { line: parts.join(' · ') };
  }

  /** The nearest bloom (the notification «Зацвело»). */
  function next(state, now, cfg) {
    ensure(state);
    var best = null;
    state.run.beds.forEach(function (b) {
      var p = b.p;
      if (!p || p.dead || stageOf(p, cfg) >= 3 || b.slug || p.m.indexOf('N') >= 0) return;
      var sec = secondsToNext(state, b, p, cfg, now);
      var f = famCfg(p.f, cfg);
      // To the bloom itself, through the remaining stages at the current pace.
      var rate = growthRate(state, p, cfg) * (b.w > now ? 1 / n(cfg['grow.waterMult'], 0.67) : 1);
      sec = Math.max(sec, (f.bud + f.bloom - p.gr) / rate);
      var at = now + Math.ceil(sec) * 1000;
      if (!best || at < best.at) best = { id: 'bloom', at: at, text: 'Зацвёл: ' + look(phenotype(p.f, p.g, p.m, p.ch)) };
    });
    return best ? [best] : [];
  }

  /** The chest of «Пассажир»: a seed of an album look the owner has not got yet (its look shown). */
  function chest(state, rng, cfg) {
    ensure(state);
    var now = state.lastTick || Date.now();
    var missing = [];
    FAMILY_IDS.forEach(function (fam) {
      if (!unlocked(state, fam, cfg)) return;
      albumKeys(fam).forEach(function (k) { if (!state.meta.album[k]) missing.push(k); });
    });
    if (!missing.length) albumKeys('moon').forEach(function (k) { missing.push(k); });
    var key = rng.pick(missing);
    var fam = key.split('/')[0];
    var seed = seedOf(state, fam, genotypeFor(key, rng), { at: now, src: 'chest', par: 'chest', known: true });
    store(state, [seed], cfg, true);
    return { title: 'Сундук садовника', items: [{ title: 'Семя: ' + lookOfKey(key), amount: 1 }] };
  }

  function procedural(kind, rng) { return null; }

  function validateStock(kind, item) {
    if (/https?:/.test(JSON.stringify(item))) return 'ссылка в тексте';
    if (kind === 'names') {
      var all = albumKeys('moon').concat(albumKeys('sun'), albumKeys('fan'), specialKeys());
      if (all.indexOf(String(item.key)) < 0) return 'нет такой записи альбома: ' + item.key;
    }
    if (kind === 'seasonal') {
      if (item.color && LOOKS.moon.color.indexOf(item.color) < 0) return 'неизвестный цвет ' + item.color;
      if (item.shape && LOOKS.moon.shape.indexOf(item.shape) < 0) return 'неизвестная форма ' + item.shape;
      if (item.pattern && LOOKS.moon.pattern.indexOf(item.pattern) < 0) return 'неизвестный узор ' + item.pattern;
      if (!item.color && !item.shape && !item.pattern) return 'заказ без признаков';
    }
    return null;
  }

  /** A seasonal order from the stock into a free slot (or the first slot). */
  function seasonalOrder(state, item, now) {
    var o = { id: 'o' + now.toString(36), f: 'moon', c: item.color || '', s: item.shape || '', p: item.pattern || '', z: 0, t: item.title || '', x: item.text || '' };
    for (var i = 0; i < state.run.orders.length; i++) {
      if (!state.run.orders[i].o) {
        state.run.orders[i].o = o;
        state.run.orders[i].at = 0;
        return true;
      }
    }
    return false;
  }

  /** A variety name without the model: «Синий колокол Тихой поймы» from the syllable tables. */
  function varietyName(key, tables) {
    var h = Rng.hash(String(key));
    var p = String(key).split('/');
    var head;
    if (p[0] === 'moon') {
      var shape = WORDS.shape[p[2]];
      head = WORDS.color[p[1]][shape[1]] + ' ' + shape[0];
    } else if (p[0] === 'sun') head = WORDS.color[p[1]][1] + ' ягода';
    else if (p[0] === 'fan') head = WORDS.leaf[p[1]] + ' лист';
    else head = lookOfKey(key).toLowerCase();
    var a = (tables && tables.adj) || ['Тихой'];
    var b = (tables && tables.place) || ['поймы'];
    return cap(head + ' ' + a[h % a.length] + ' ' + b[Math.floor(h / a.length) % b.length]);
  }

  // ---- the bot of the checks: a player who visits on trips --------------------------------------------------

  // The bot's shopping list: [upgrade, up to level], bought strictly in this order (it saves for
  // the next one instead of buying whatever is cheap).
  var BOT_PLAN = [['beds', 3], ['lens', 1], ['beds', 5], ['lens', 2], ['bank', 1], ['lens', 3], ['beds', 8], ['vitrine', 3], ['bank', 3],
    ['greenhouse', 2], ['can', 2], ['beds', 11], ['fert', 1], ['board', 1], ['vitrine', 6], ['greenhouse', 4], ['guard', 1], ['beds', 14],
    ['bank', 5], ['fert', 2], ['compost', 1], ['dryer', 1], ['barrel', 1], ['notebook', 1], ['hive', 1], ['boundary', 1], ['beds', 18],
    ['vitrine', 10], ['greenhouse', 6], ['fridge', 1], ['cart', 1], ['meteo', 1], ['lamp', 1], ['orangery', 1], ['beds', 24], ['vitrine', 20]];

  /** What the bot (and the hint on the screen) knows of a seed's look: its key, or '' when hidden. */
  function seenKey(state, seed, cfg) {
    if (seed.known || lensLevel(state, cfg) >= 3) return phenotype(seed.f, seed.g, seed.m, seed.ch).key;
    return '';
  }

  /**
   * The look of a seed as far as the Lens reads it: the album key with the parts it does not see
   * as a star: with the Lens on colour only a red one reads «moon, red, any shape, any pattern».
   */
  function partialKey(state, seed, cfg) {
    var ph = phenotype(seed.f, seed.g, seed.m, seed.ch);
    if (seed.known) return ph.key;
    var lens = lensLevel(state, cfg);
    var parts = ph.key.split('/');
    var genes = FAMILIES[seed.f].genes;
    KEY_PARTS[seed.f].forEach(function (id, i) {
      var group = genes[geneAt(seed.f, id)].group;
      if (group > lens) parts[i + 1] = '*';
    });
    return parts.join('/');
  }

  var ALBUM_CACHE = {};

  /** The share of album keys matching a partial key that are not in the album yet (0..1). */
  function novelty(state, pkey) {
    var p = pkey.split('/');
    var fam = p[0];
    var keys = ALBUM_CACHE[fam] || (ALBUM_CACHE[fam] = albumKeys(fam));
    var all = 0;
    var fresh = 0;
    for (var i = 0; i < keys.length; i++) {
      var q = keys[i].split('/');
      if ((p[1] !== '*' && p[1] !== q[1]) || (p[2] !== '*' && p[2] !== q[2]) || (p[3] !== '*' && p[3] !== q[3])) continue;
      all++;
      if (!state.meta.album[keys[i]]) fresh++;
    }
    return all ? fresh / all : 0;
  }

  /**
   * How much the bot wants a seed: how likely what the Lens reads of it is a look not in the
   * album, less for every bed already given to the same reading or the same parents; fresh blood
   * (the stall, the wanderer, a chest) was bought to be planted.
   */
  function botScore(state, seed, cfg, planted) {
    var pk = partialKey(state, seed, cfg);
    var nov = novelty(state, pk);
    var score = 10 * nov * nov - 3 * (planted[pk] || 0) * nov - (planted['par:' + seed.par] || 0);
    var two = String(seed.par).split('|');
    if (two.length === 2 && two[0] !== two[1]) score += 1;
    if (seed.src === 'shop' || seed.src === 'wander' || seed.src === 'chest') score += 2;
    return score;
  }

  /** The bot discards seeds down to `room`: the least wanted first, of equals the oldest. */
  function botTrim(state, room, cfg) {
    var r = state.run;
    room = Math.max(0, room);
    if (r.bank.length <= room) return;
    var list = r.bank.map(function (sd, i) { return { sd: sd, i: i, v: botScore(state, sd, cfg, {}) }; });
    list.sort(function (x, y) { return y.v - x.v || y.i - x.i; });
    var keep = {};
    list.slice(0, room).forEach(function (e) { keep[e.i] = true; });
    r.bank = r.bank.filter(function (sd, i) { return keep[i]; });
  }

  /**
   * One second of a reasonable player: clear what wilted, chase slugs, cross what blooms (each
   * flower with the next one of its family), cut it (orders first), plant the bank (looks it can
   * read with the Lens: unseen ones first; otherwise seeds of different parents), water, buy
   * upgrades by its list. Returns how many upgrades it bought.
   */
  function botPlay(state, ctx, sim, taps) {
    var cfg = ctx.config;
    var now = ctx.now;
    var rng = ctx.rng;
    ensure(state);
    var r = state.run;
    var beds = r.beds;
    var album = state.meta.album;
    var i;
    for (i = 0; i < beds.length; i++) {
      if (beds[i].p && beds[i].p.dead) clear(state, i);
      while (beds[i].slug) slugTap(state, i);
    }
    var blooming = [];
    for (i = 0; i < beds.length; i++) {
      var q = beds[i].p;
      if (q && (canCut(state, q, cfg, now) || (q.f === 'fan' && !q.dead && stageOf(q, cfg) === 3))) blooming.push(i);
    }
    // With the Lens on colour, shape and pattern it reads the alleles and picks, like the notebook
    // does, the donor whose offspring most likely shows looks not in the album; otherwise the next
    // flower of the family.
    var reads = lensLevel(state, cfg) >= 3;
    blooming.forEach(function (b, k) {
      var B = beds[b].p;
      if (B.pod) return;
      var donor = -1;
      var best = -1;
      for (var j = 1; j <= blooming.length; j++) {
        var a = blooming[(k + j) % blooming.length];
        var A = beds[a].p;
        if (A.f !== B.f) continue;
        var value = 0;
        if (reads) offspring(B.f, B.g, A.g).keys.forEach(function (o) { if (!album[o.key]) value += o.p; });
        else {
          // Blind: the look that differs most from B's (a different colour counts most).
          var pa = phenotype(A.f, A.g, A.m).key.split('/');
          var pb = phenotype(B.f, B.g, B.m).key.split('/');
          value = (pa[1] !== pb[1] ? 2 : 0) + (pa[2] !== pb[2] ? 1 : 0) + (pa[3] !== pb[3] ? 1 : 0) + (a === b ? -1 : 0);
        }
        if (value > best + 1e-9) {
          best = value;
          donor = a;
        }
      }
      if (donor >= 0) pollinate(state, donor, b, cfg, now);
    });
    // Room for the new pods first: an old seed goes rather than a new one being lost.
    var coming = 0;
    blooming.forEach(function (b) { if (beds[b].p.pod && beds[b].p.f !== 'fan') coming += podSeeds(state, beds[b].p, cfg); });
    if (coming) botTrim(state, bankCap(state, cfg) - coming, cfg);
    // A look gone from the garden (no red among the flowers, no stripes …): its allele may be
    // lost, so a start seed that carries it comes from the stall.
    var shown = { color: {}, shape: {}, pattern: {} };
    var harvest = 0;
    blooming.forEach(function (b) {
      var P = beds[b].p;
      if (P.f !== 'moon') return;
      var ph = phenotype('moon', P.g, P.m);
      harvest++;
      var c = ph.color;
      if (c === 'red' || c === 'orange' || c === 'purple') shown.color.R = 1;
      if (c === 'yellow' || c === 'orange' || c === 'green') shown.color.Y = 1;
      if (c === 'blue' || c === 'purple' || c === 'green') shown.color.B = 1;
      shown.shape[ph.shape === 'star' ? 's' : ph.shape === 'bell' ? 'b' : 'r'] = 1;
      if (ph.pattern === 'stripes' || ph.pattern === 'net') shown.pattern.q = 1;
      if (ph.pattern === 'dots' || ph.pattern === 'net') shown.pattern.d = 1;
      if (ph.pattern === 'solid') shown.pattern.p = 1;
    });
    blooming.forEach(function (b) { if (beds[b].p && beds[b].p.f !== 'fan') cut(state, b, rng, cfg, now); });
    if (harvest >= 6) {
      var starts = startSeeds(cfg, 'moon');
      var want = [];
      starts.forEach(function (g, idx) {
        var gone = false;
        'RYB'.split('').forEach(function (a) { if (has(pair(g, 'moon', 'color'), a) && !shown.color[a]) gone = true; });
        if (has(pair(g, 'moon', 'shape'), 's') && !shown.shape.s) gone = true;
        if (has(pair(g, 'moon', 'shape'), 'b') && !shown.shape.b) gone = true;
        if (gone) want.push(idx);
      });
      if (want.length) {
        want = want.slice(0, 3);
        botTrim(state, bankCap(state, cfg) - want.length, cfg);
        want.forEach(function (idx) { buySeed(state, 'moon', idx, rng, cfg, now); });
      }
    }
    var fans = 0;
    var planted = {};
    beds.forEach(function (b) {
      if (!b.p || b.p.dead) return;
      if (b.p.f === 'fan') fans++;
      var k = partialKey(state, b.p, cfg);
      planted[k] = (planted[k] || 0) + 1;
      planted['par:' + b.p.par] = (planted['par:' + b.p.par] || 0) + 1;
    });
    for (i = 0; i < beds.length; i++) {
      if (beds[i].p || !r.bank.length) continue;
      var pick = -1;
      var bestScore = -1e9;
      for (var s = r.bank.length - 1; s >= 0 && s >= r.bank.length - 80; s--) {
        var seed = r.bank[s];
        if (!unlocked(state, seed.f, cfg)) continue;
        if (seed.f === 'fan' && fans >= 2) continue;
        var score = botScore(state, seed, cfg, planted);
        if (score > bestScore) {
          bestScore = score;
          pick = s;
        }
      }
      if (pick < 0) break;
      var chosen = r.bank[pick];
      if (chosen.f === 'fan') fans++;
      var ck = partialKey(state, chosen, cfg);
      planted[ck] = (planted[ck] || 0) + 1;
      planted['par:' + chosen.par] = (planted['par:' + chosen.par] || 0) + 1;
      plant(state, i, chosen.id, rng, cfg, now);
    }
    for (i = 0; i < beds.length; i++) if (beds[i].p && !beds[i].p.dead && stageOf(beds[i].p, cfg) < 3 && beds[i].w <= now) water(state, i, cfg, now);
    var bought = 0;
    for (var round = 0; round < 3; round++) {
      var goal = null;
      for (var u = 0; u < BOT_PLAN.length && !goal; u++) {
        var id = BOT_PLAN[u][0];
        if (lv(state, id) >= BOT_PLAN[u][1]) continue;
        var info = upInfo(state, id, cfg);
        if (!info.ok && !info.short) continue;
        goal = id;
      }
      if (!goal || !upgrade(state, goal, cfg, now).ok) break;
      bought++;
    }
    return bought;
  }

  return {
    LAYER: LAYER, FAMILIES: FAMILIES, FAMILY_IDS: FAMILY_IDS, LOOKS: LOOKS, WORDS: WORDS, UPGRADES: UPGRADES, CLIMATES: CLIMATES, EVENTS: EVENTS,
    EVENT_TITLES: EVENT_TITLES, CLIMATE_TITLES: CLIMATE_TITLES,
    init: init, tick: tick, offline: offline, prestigeGain: prestigeGain, bonus: bonus, onPrestige: onPrestige,
    migrate: migrate, validate: validate, summary: summary, next: next, chest: chest, procedural: procedural, validateStock: validateStock,
    // rules
    colorOf: colorOf, shapeOf: shapeOf, patternOf: patternOf, berryOf: berryOf, thornsOf: thornsOf, leafOf: leafOf, variegOf: variegOf, veinsOf: veinsOf,
    phenotype: phenotype, look: look, lookOfKey: lookOfKey, rarity: rarity, rarityOfKey: rarityOfKey, albumKeys: albumKeys, specialKeys: specialKeys,
    chimeraKey: chimeraKey, crossGenes: crossGenes, childSeed: childSeed, offspring: offspring, genotypeFor: genotypeFor, genotypeText: genotypeText,
    parseSeeds: parseSeeds, startSeeds: startSeeds, pair: pair, speedOf: speedOf, fertOf: fertOf, podSeeds: podSeeds,
    // state and time
    ensure: ensure, lv: lv, humus: humus, moves: moves, climateTitle: climateTitle, bankCap: bankCap, bedsMax: bedsMax, orderSlots: orderSlots,
    waterHours: waterHours, lensLevel: lensLevel, unlocked: unlocked, albumCount: albumCount, isNight: isNight, nightSec: nightSec, nightOpen: nightOpen,
    stageOf: stageOf, stageProgress: stageProgress, growthRate: growthRate, secondsToNext: secondsToNext, famCfg: famCfg, viability: viability,
    priceOf: priceOf, priceOfLook: priceOfLook, albumReward: albumReward, muOf: muOf, step: step, summaryLines: summaryLines, newOut: newOut,
    // orders and actions
    makeOrder: makeOrder, orderText: orderText, matches: matches, seasonalOrder: seasonalOrder,
    plant: plant, water: water, waterAll: waterAll, pollinate: pollinate, canPollinate: canPollinate, canCut: canCut, cut: cut, cutAll: cutAll,
    clear: clear, slugTap: slugTap, chase: chase, buyWander: buyWander, buySeed: buySeed, discard: discard, extendBloom: extendBloom,
    upInfo: upInfo, upCost: upCost, upMax: upMax, upgrade: upgrade, defaultKeep: defaultKeep, varietyName: varietyName,
    botPlay: botPlay, seenKey: seenKey, partialKey: partialKey, novelty: novelty, BOT_PLAN: BOT_PLAN
  };
});
