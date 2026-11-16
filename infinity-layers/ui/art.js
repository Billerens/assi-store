/* Drawn pictures of the game: window.ILArt. Every stage, tree node, challenge, rule and layer has
   its own geometric sign on a 32×32 grid. Colours come from game.css through classes:
     (none) the main line, currentColor     m  a muted line        f  a line with a soft fill
     d      a solid shape                   k  the accent line     kd an accent solid shape
     b      a patch of the tile's background under a badge */
(function () {
  'use strict';

  var TIERS = [
    // 1 Точка
    '<circle class="m" cx="16" cy="16" r="10.5" stroke-dasharray="2 3.2"/><circle class="d" cx="16" cy="16" r="3.8"/>',
    // 2 Отрезок
    '<path class="m" d="M3.5 25.7L7 23M25 9l3.5-2.7"/><path d="M7 23L25 9"/><circle class="d" cx="7" cy="23" r="2.9"/><circle class="d" cx="25" cy="9" r="2.9"/>',
    // 3 Плоскость
    '<path class="f" d="M3.5 22.5L11 9.5h17.5L21 22.5z"/><path class="m" d="M7.2 16h17.5M19.8 9.5l-7.5 13"/>',
    // 4 Объём
    '<path class="m" d="M12 5v15h15M12 20l-7 7" stroke-dasharray="2 2.5"/><path class="f" d="M5 12h15v15H5z"/><path d="M5 12l7-7h15l-7 7M27 5v15l-7 7"/>',
    // 5 Поток
    '<path class="m" d="M4 8.5q5-5 10 0t10 0M4 23.5q5-5 10 0t10 0"/><path d="M4 16q5-5 10 0t10 0h3.5"/><path d="M24 12.3l4 3.7-4 3.7"/>',
    // 6 Узел
    '<circle cx="16" cy="11" r="6.3"/><circle cx="11.2" cy="19.6" r="6.3"/><circle cx="20.8" cy="19.6" r="6.3"/><circle class="d" cx="16" cy="16.8" r="2"/>',
    // 7 Сеть
    '<path class="m" d="M16 5L6 13l4 12h12l4-12z"/><path d="M16 16V5M16 16L6 13M16 16l10-3M16 16l-6 9M16 16l6 9"/>' +
      '<circle class="d" cx="16" cy="5" r="2.2"/><circle class="d" cx="6" cy="13" r="2.2"/><circle class="d" cx="26" cy="13" r="2.2"/><circle class="d" cx="10" cy="25" r="2.2"/><circle class="d" cx="22" cy="25" r="2.2"/><circle class="d" cx="16" cy="16" r="3"/>',
    // 8 Ткань
    '<rect class="f" x="4.5" y="4.5" width="23" height="23" rx="2"/><path class="m" d="M4.5 10h23M4.5 16h23M4.5 22h23"/><path d="M10 4.5v23M16 4.5v23M22 4.5v23"/>' +
      '<path class="d" d="M8.2 8.2h3.6v3.6H8.2zM20.2 8.2h3.6v3.6h-3.6zM14.2 14.2h3.6v3.6h-3.6zM8.2 20.2h3.6v3.6H8.2zM20.2 20.2h3.6v3.6h-3.6z"/>',
    // 9 Полотно
    '<path class="f" d="M5 6h22v15l-6 6H5z"/><path class="m" d="M10 6l-5 5M16 6L5 17M22 6L5 23M27 7L7 27M27 13L13 27"/><path d="M27 21h-6v6"/>'
  ];

  var BADGE = '<circle class="b" cx="24" cy="24" r="7.5"/><path class="k" d="M27.9 22.7a4.1 4.1 0 1 0 .2 2.9"/><path class="k" d="M29 20.3l-1 2.7-2.7-1"/>';
  var FORK = '<path d="M11 4v9a5 5 0 0 0 10 0V4M16 18v6"/><circle class="d" cx="16" cy="26.2" r="2"/>';
  var COMPRESSION = '<rect class="m" x="4.5" y="4.5" width="23" height="23" rx="1.5" stroke-dasharray="2.5 2.5"/><rect class="f" x="12" y="12" width="8" height="8"/>' +
    '<path d="M5.5 5.5l4 4M26.5 5.5l-4 4M5.5 26.5l4-4M26.5 26.5l-4-4M9.5 6.3v3.2H6.3M22.5 6.3v3.2h3.2M9.5 25.7v-3.2H6.3M22.5 25.7v-3.2h3.2"/>';
  var FOLD = '<path class="f" d="M4 8l8 3 8-3 8 3v14l-8-3-8 3-8-3z"/><path class="m" d="M12 11v14M20 8v14"/>';
  var COLLAPSE = '<circle class="m" cx="16" cy="16" r="12.5" stroke-dasharray="2 3"/><path d="M16 3v7M16 29v-7M3 16h7M29 16h-7M13 7.5l3 3 3-3M13 24.5l3-3 3 3M7.5 13l3 3-3 3M24.5 13l-3 3 3 3"/><circle class="d" cx="16" cy="16" r="3"/>';
  var TRANSITION = '<rect class="m" x="4" y="4" width="24" height="24" rx="1.5"/><rect class="f" x="9.2" y="9.2" width="13.6" height="13.6" transform="rotate(45 16 16)"/><circle class="d" cx="16" cy="16" r="2.4"/>';

  function small(body, scale, dx, dy) {
    return '<g transform="translate(' + (dx || 0) + ' ' + (dy || 0) + ') scale(' + scale + ')">' + body + '</g>';
  }
  function hand(index) { return small(TIERS[index], 0.74, 0, 0) + BADGE; }
  function cells(filled, solidLast) {
    var out = '';
    for (var i = 0; i < 9; i++) {
      var x = 4 + (i % 3) * 8.5, y = 4 + Math.floor(i / 3) * 8.5;
      var cls = solidLast && i === 8 ? 'd' : i < filled ? 'f' : 'm';
      out += '<rect class="' + cls + '" x="' + x + '" y="' + y + '" width="7" height="7" rx="1"' + (cls === 'm' ? ' stroke-dasharray="2 2"' : '') + '/>';
    }
    return out;
  }
  function hundred() {
    var out = '<rect class="m" x="2.5" y="2.5" width="27" height="27" rx="2"/>';
    for (var i = 0; i < 25; i++) {
      var last = i === 24;
      out += '<circle class="' + (last ? 'kd' : 'd') + '" cx="' + (6 + (i % 5) * 5) + '" cy="' + (6 + Math.floor(i / 5) * 5) + '" r="' + (last ? 1.9 : 1.2) + '"/>';
    }
    return out;
  }

  var UPGRADES = {
    autoResonance: FORK + '<path class="m" d="M6.5 6c-1.6 2.8-1.6 6.2 0 9M25.5 6c1.6 2.8 1.6 6.2 0 9"/>',
    memory: '<path class="m" d="M9.5 6L5 13M22.5 6L27 13"/><path d="M5 13v13h22V13"/><circle class="d" cx="10.5" cy="17.6" r="1.7"/><circle class="d" cx="16" cy="17.6" r="1.7"/><circle class="d" cx="21.5" cy="17.6" r="1.7"/><circle class="d" cx="10.5" cy="22.2" r="1.7"/><circle class="d" cx="16" cy="22.2" r="1.7"/><circle class="d" cx="21.5" cy="22.2" r="1.7"/>',
    autoCompression: small(COMPRESSION, 0.74, 0, 0) + BADGE,
    denseStart: '<path class="m" d="M3 28.5h26"/><path class="d" d="M4 26v-6h3.4v6zM9.2 26v-9h3.4v9zM14.4 26V14h3.4v12zM19.6 26V11H23v15zM24.8 26V8h3.4v18z"/>',
    echo: '<circle class="d" cx="6.5" cy="16" r="2.7"/><path d="M12 10.5a8 8 0 0 1 0 11M17 7a13 13 0 0 1 0 18"/><path class="m" d="M22 4a18 18 0 0 1 0 24"/>',
    rhythm: '<circle class="m" cx="16" cy="16" r="12"/><circle cx="16" cy="16" r="7.2"/><circle class="d" cx="16" cy="16" r="2.3"/>',
    night: '<path class="f" d="M19 4.5a11.5 11.5 0 1 0 8.5 16.3A9.6 9.6 0 0 1 19 4.5z"/><circle class="d" cx="24.5" cy="7.5" r="1.3"/><circle class="d" cx="27.5" cy="13" r="1"/>',
    extraFold: small(FOLD, 0.78, 0, 0) + '<circle class="b" cx="24.5" cy="24" r="7"/><path class="k" d="M24.5 19.6v8.8M20.1 24h8.8"/>',
    singularPower: '<path class="m" d="M7.5 7.5l4.2 4.2M24.5 7.5l-4.2 4.2M7.5 24.5l4.2-4.2M24.5 24.5l-4.2-4.2"/><path d="M16 3v6.5M16 22.5V29M3 16h6.5M22.5 16H29"/><circle class="d" cx="16" cy="16" r="3.6"/>',
    challengeMemory: '<path d="M8 28.5V4"/><path class="f" d="M8 5h16l-3.6 5 3.6 5H8z"/><circle class="d" cx="14.5" cy="23.5" r="1.8"/><circle class="d" cx="20" cy="23.5" r="1.8"/><circle class="d" cx="25.5" cy="23.5" r="1.8"/>',
    foldMemory: '<circle class="m" cx="16" cy="16" r="13" stroke-dasharray="2.5 2.8"/>' + small(FOLD, 0.6, 6.4, 6.2)
  };
  for (var a = 0; a < 9; a++) UPGRADES['auto' + (a + 1)] = hand(a);

  var CHALLENGES = {
    1: FORK + '<path class="k" d="M5 27L27 5"/>',
    2: cells(4, false),
    3: '<circle cx="16" cy="8" r="3.6"/><path class="f" d="M9.5 11.6h13L27 27.5H5z"/><path class="m" d="M11 20.5h10"/>',
    4: '<path class="m" d="M3.5 27.5h25"/><path d="M8 4v18M16 4v18M24 4v18M5 18.8l3 3.4 3-3.4M13 18.8l3 3.4 3-3.4M21 18.8l3 3.4 3-3.4"/>',
    5: '<rect class="f" x="10" y="5" width="12" height="12" rx="1.5" transform="rotate(12 16 11)"/><path class="m" d="M4 28h24" stroke-dasharray="2 3"/><path class="m" d="M9 24.5l-2-2.6M16 25v-3.6M23 24.5l2-2.6"/>',
    6: '<path class="f" d="M5 10.5h22V19H5z"/><path d="M5 4.5V19h8.5M18.5 19H27V4.5"/><path class="kd" d="M16 20.5c1.9 2.5 2.8 3.8 2.8 5.1a2.8 2.8 0 0 1-5.6 0c0-1.3.9-2.6 2.8-5.1z"/>',
    7: hundred(),
    8: '<path class="m" d="M16 3L29.5 27.5h-27z"/><path d="M16 10l8.2 14.5H7.8z"/><path class="d" d="M16 16.5l3.4 6h-6.8z"/>'
  };

  var RULES = {
    ninth: cells(0, true),
    prices: '<path class="m" d="M4 27h6v-6h6v-6h6V9h6"/><path d="M4 27c10-1 18-6.5 24-18"/>',
    'resonance-density': '<rect class="f" x="11" y="11" width="10" height="10"/><path d="M7.5 9c-2.2 4-2.2 10 0 14M24.5 9c2.2 4 2.2 10 0 14"/><path class="m" d="M4 6c-2 6-2 14 0 20M28 6c2 6 2 14 0 20"/>',
    rhythm: '<circle class="m" cx="16" cy="16" r="7"/><path d="M16 4.5A11.5 11.5 0 1 1 4.5 16"/><path d="M1.8 12.8l2.7 3.4 3.3-2.8"/><circle class="d" cx="16" cy="16" r="2.3"/>',
    retain: '<circle class="m" cx="22.5" cy="16" r="7.8" stroke-dasharray="2 2.6"/><circle class="d" cx="22.5" cy="16" r="4.4"/><circle class="f" cx="11.5" cy="16" r="2.8"/><circle class="m" cx="4.5" cy="16" r="1.6"/>',
    'auto-fold': small(FOLD, 0.74, 0, 0) + BADGE,
    'singularity-fold': small(FOLD, 0.74, 0, 0) + '<circle class="b" cx="24.5" cy="24" r="7.5"/><circle class="kd" cx="24.5" cy="24" r="2.6"/><path class="k" d="M24.5 18.4V20M24.5 28v1.6M18.9 24h1.6M28.5 24h1.6"/>',
    skip: '<circle class="d" cx="5.5" cy="23" r="2.7"/><circle class="m" cx="16" cy="23" r="2.7"/><circle class="d" cx="26.5" cy="23" r="2.7"/><path d="M5.5 17C8 6.5 24 6.5 26.5 17"/><path d="M22.6 15.3l3.9 2 1.7-4"/>'
  };

  var LAYERS = { compression: COMPRESSION, fold: FOLD, collapse: COLLAPSE, transition: TRANSITION };

  var MISC = {
    resonance: '<path d="M3 16c2.2-9.5 4.3-9.5 6.5 0s4.3 9.5 6.5 0 4.3-9.5 6.5 0 4.3 9.5 6.5 0"/>',
    fluctuation: '<path d="M2.5 16h5.5l3-9.5 5 19 4-13.5 2.2 4h7.3"/>',
    lock: '<rect class="f" x="8.5" y="14.5" width="15" height="12" rx="2"/><path d="M11.5 14.5v-3a4.5 4.5 0 0 1 9 0v3"/><circle class="d" cx="16" cy="20.5" r="1.6"/>',
    check: '<path d="M7 16.5l6 6L25 9.5"/>',
    auto: '<path d="M25 13a9.5 9.5 0 1 0 1 6.5"/><path d="M27.5 6.5L25.5 13l-6.5-2"/>'
  };

  function svg(body) {
    return '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (body || '') + '</svg>';
  }
  /** A <span class="il-ic"> with the picture inside; cls adds a size or a tone. */
  function el(body, cls) {
    var span = document.createElement('span');
    span.className = 'il-ic' + (cls ? ' ' + cls : '');
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = svg(body);
    return span;
  }

  window.ILArt = {
    svg: svg,
    el: el,
    tier: function (index) { return TIERS[index] || TIERS[0]; },
    upgrade: function (id) { return UPGRADES[id] || TRANSITION; },
    challenge: function (id) { return CHALLENGES[id] || CHALLENGES[8]; },
    rule: function (id) { return RULES[id] || TRANSITION; },
    layer: function (id) { return LAYERS[id] || TRANSITION; },
    misc: function (id) { return MISC[id] || ''; },
    names: { tiers: TIERS.length, upgrades: Object.keys(UPGRADES), challenges: Object.keys(CHALLENGES), rules: Object.keys(RULES), layers: Object.keys(LAYERS) }
  };
})();
