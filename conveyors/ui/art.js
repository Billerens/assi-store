// Drawn pictures of «Конвейеры»: research, the meta shop, planets, events and items. All SVG on a
// 48×48 field in one palette (steel, furnace orange, assembler violet, port green, dock blue, crate
// tan), flat fills, no text, no shadows. window.CvArt.
(function () {
  'use strict';

  var STEEL = '#B7C0CA';
  var FIRE = '#E0864A';
  var VIOLET = '#8B7CFF';
  var GREEN = '#5FD08A';
  var BLUE = '#7FB3D9';
  var TAN = '#C4A484';
  var GOLD = '#E0B04A';
  var DIM = '#6F767D';
  var INK = '#EDEDED';
  var BG = '#101010';

  function s(c, d, w) { return '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="' + (w || 2.5) + '" stroke-linecap="round" stroke-linejoin="round"/>'; }
  function f(c, d) { return '<path d="' + d + '" fill="' + c + '"/>'; }
  function dot(c, x, y, r) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + c + '"/>'; }
  function ring(c, x, y, r, w) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="none" stroke="' + c + '" stroke-width="' + (w || 2.5) + '"/>'; }
  function box(c, x, y, w, h, r, fill) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (r || 0) + '" fill="' + (fill || 'none') + '" stroke="' + c + '" stroke-width="2.5" stroke-linejoin="round"/>'; }

  var belt = box(DIM, 6, 28, 36, 12, 6) + dot(DIM, 12, 34, 2) + dot(DIM, 36, 34, 2);
  var gear = function (c, x, y, r) {
    var d = '';
    for (var k = 0; k < 16; k++) {
      var a = k * Math.PI / 8;
      var rr = k % 2 ? r * 0.74 : r;
      d += (k ? 'L' : 'M') + (x + Math.cos(a) * rr).toFixed(1) + ' ' + (y + Math.sin(a) * rr).toFixed(1);
    }
    return s(c, d + 'Z', 2.2) + dot(c, x, y, r * 0.22);
  };

  var RESEARCH = {
    belts: belt + s(GREEN, 'M10 18h10M16 13l5 5-5 5M26 18h10M32 13l5 5-5 5'),
    drills: s(STEEL, 'M24 6v8M16 14h16l-3 7H19zM19 21l5 21 5-21') + s(FIRE, 'M20.5 27h7M21.7 33h4.6', 2),
    furnaces: box(STEEL, 9, 8, 30, 32, 4) + f(FIRE, 'M24 16c1 5 7 7 7 13a7 7 0 0 1-14 0c0-3 2-4 3-7 1 2 2 3 3 3 0-3 0-6 1-9z') + f(BG, 'M24 27c2 2 3 3 3 5a3 3 0 0 1-6 0c0-2 2-3 3-5z'),
    assembly: gear(VIOLET, 19, 21, 11) + gear(STEEL, 34, 33, 7),
    trade: ring(GOLD, 20, 20, 11) + s(GOLD, 'M20 14v12M16 17h6.5a2.5 2.5 0 0 1 0 5H16') + s(GREEN, 'M28 40h12M36 36l4 4-4 4', 2.2) + s(GREEN, 'M30 34l8-8M33 26h5v5', 2.2),
    land: s(TAN, 'M6 38l8-22h20l8 22z') + s(TAN, 'M18 16l-3 22M30 16l3 22M11 27h26', 1.8) + s(GREEN, 'M24 4v10M24 5l7 2.5-7 2.5', 2.2),
    deep: s(DIM, 'M6 12h12M30 12h12M6 22h10M32 22h10M6 32h8M34 32h8', 2) + s(STEEL, 'M24 4v26M18 24l6 8 6-8') + f(FIRE, 'M24 36l5 4-5 4-5-4z'),
    double: box(TAN, 6, 20, 18, 18, 3) + box(GREEN, 24, 10, 18, 18, 3, BG) + s(GREEN, 'M33 15v8M29 19h8', 2.2) + s(TAN, 'M11 29h8', 2.2),
    longTunnel: s(STEEL, 'M4 38V26a10 10 0 0 1 20 0v12') + s(STEEL, 'M24 38V26a10 10 0 0 1 20 0v12') + s(BLUE, 'M9 32h30M34 28l5 4-5 4', 2.2),
    blueprints: box(BLUE, 7, 9, 34, 30, 3) + s(BLUE, 'M13 16h8v8h-8zM27 24h8v8h-8zM21 20h10v4', 2) + s(BLUE, 'M13 32h6', 2),
    idle: box(DIM, 10, 16, 28, 24, 3) + s(FIRE, 'M24 22v8', 3) + dot(FIRE, 24, 35, 1.8) + s(FIRE, 'M24 4v5M12 8l3 4M36 8l-3 4', 2.2),
    counters: belt + box(GREEN, 12, 6, 24, 16, 3) + s(GREEN, 'M17 17v-3M22 17v-6M27 17v-4M31 17v-7', 2.2),
    night: s(GOLD, 'M30 6a12 12 0 1 0 12 15A10 10 0 0 1 30 6z') + box(STEEL, 6, 30, 20, 12, 2) + s(STEEL, 'M10 30v-6l6 4v-4l6 4', 2.2) + dot(GOLD, 12, 12, 1.5) + dot(GOLD, 20, 7, 1.2),
    storage: s(TAN, 'M6 16l18-9 18 9v18l-18 9-18-9z') + s(TAN, 'M6 16l18 9 18-9M24 25v18', 2) + s(GREEN, 'M33 6v8M29 10h8', 2.2),
    advanced: f(STEEL, 'M10 30l5-9h20l5 9z') + s(INK, 'M15 21h20', 1.5) + f(DIM, 'M6 40l4-7h14l4 7z') + f(DIM, 'M24 40l4-7h12l4 7z') + s(FIRE, 'M24 5l2 5 5 2-5 2-2 5-2-5-5-2 5-2z', 1.8),
    top: s(VIOLET, 'M14 14l20 20M34 14L14 34') + ring(VIOLET, 12, 12, 5) + ring(VIOLET, 36, 12, 5) + ring(VIOLET, 12, 36, 5) + ring(VIOLET, 36, 36, 5) + box(GOLD, 19, 19, 10, 10, 2, BG),
    logistics: box(STEEL, 8, 6, 22, 30, 3) + s(STEEL, 'M13 14h12M13 20h12M13 26h7', 2) + box(GREEN, 22, 22, 20, 20, 3, BG) + s(GREEN, 'M32 27v6l4 2', 2.2),
    autobuild: s(DIM, 'M6 36h10', 6) + s(GREEN, 'M16 36h10V20h10', 6) + s(BG, 'M18 36h6M26 30v-6M30 20h4', 1.5) + s(INK, 'M36 20l4-10M40 10l2 5', 2.2),
    sidePort: ring(GREEN, 24, 24, 11) + s(GREEN, 'M24 18v12M20 22h8', 2.2) + s(STEEL, 'M4 24h6M44 24h-6M24 4v6M24 44v-6', 2.5) + s(STEEL, 'M7 21l3 3-3 3M41 21l-3 3 3 3', 1.8),
    alloy: f(FIRE, 'M5 30l4-8h16l4 8z') + f(BLUE, 'M19 40l4-8h16l4 8z') + s(GOLD, 'M30 8v12M24 14h12', 3),
    courier: s(BLUE, 'M12 14h24M12 10v4M36 10v4M6 10h12M30 10h12') + s(BLUE, 'M17 14l3 8h8l3-8', 2.2) + s(DIM, 'M24 22v6', 2) + box(TAN, 16, 28, 16, 13, 2) + s(TAN, 'M16 34h16', 1.8)
  };

  var SHOP = {
    money: f(GOLD, 'M10 34c0-2 6-4 14-4s14 2 14 4v4c0 2-6 4-14 4s-14-2-14-4z') + f(BG, 'M10 35c2 2 7 3 14 3s12-1 14-3v1.5c-2 2-7 3-14 3s-12-1-14-3z') + f(GOLD, 'M10 24c0-2 6-4 14-4s14 2 14 4v4c0 2-6 4-14 4s-14-2-14-4z') + f(BG, 'M10 25c2 2 7 3 14 3s12-1 14-3v1.5c-2 2-7 3-14 3s-12-1-14-3z') + s(GREEN, 'M24 15V5M19 9l5-5 5 5'),
    research: s(BLUE, 'M19 6h10M21 6v11l-9 18a4 4 0 0 0 4 6h16a4 4 0 0 0 4-6l-9-18V6') + f(GREEN, 'M16 30h16l3.5 7a2 2 0 0 1-2 3h-19a2 2 0 0 1-2-3z') + dot(BG, 22, 35, 1.6) + dot(BG, 28, 33, 1.2),
    courier: RESEARCH.courier + s(GOLD, 'M40 26l1.5 3.5L45 31l-3.5 1.5L40 36l-1.5-3.5L35 31l3.500-1.5z', 1.6)
  };

  // A planet: a disc of its own tone with its own relief.
  var PLANET = {
    rusty: ['#B5623A', '#8A4526', 'M10 20c6 3 10-2 16 1s8 0 12-1M9 30c5-2 9 2 14 0s10 2 15 0', '#E39A63'],
    icy: ['#7FB3D9', '#4E86B0', 'M12 16l8 6-3 8 9 4M30 12l-2 9 8 3M18 36l6-4', '#DCEFFA'],
    volcanic: ['#3A2A26', '#231816', 'M10 26l7-5 4 6 6-9 5 8 6-3M17 34l5-3 6 4', '#E0564A'],
    dusty: ['#C4A484', '#9B7E5E', 'M8 20c5-3 9 3 14 0s9 3 16 0M9 28c6-3 10 3 15 0s8 3 15 0M12 36c4-2 8 2 12 0s8 2 12 0', '#EAD9BE'],
    ring: ['#3A4048', '#262B31', 'M16 18h16M16 24h16M16 30h16M20 14v20M28 14v20', '#8B7CFF']
  };

  function planet(id) {
    var p = PLANET[id];
    if (!p) {
      // A planet of the model: the tone comes from its id.
      var n = 0;
      for (var i = 0; i < String(id).length; i++) n = (n * 31 + String(id).charCodeAt(i)) % 360;
      p = ['hsl(' + n + ',38%,48%)', 'hsl(' + n + ',38%,32%)', 'M10 22c6 3 10-3 16 0s8 1 12-1M12 32c5-2 8 2 12 0s8 1 12-1', 'hsl(' + n + ',60%,78%)'];
    }
    var body = '<circle cx="24" cy="24" r="16" fill="' + p[0] + '"/>' +
      '<path d="M24 8a16 16 0 0 1 0 32a22 22 0 0 0 0-32z" fill="' + p[1] + '"/>' +
      '<g clip-path="url(#cvp)">' + s(p[3], p[2], 2) + '</g>';
    var extra = id === 'ring' ? '<ellipse cx="24" cy="24" rx="22" ry="6" fill="none" stroke="' + p[3] + '" stroke-width="2"/>' : '';
    return wrap('<defs><clipPath id="cvp"><circle cx="24" cy="24" r="15"/></clipPath></defs>' + body + extra + dot(INK, 6, 8, 1) + dot(INK, 42, 40, 1) + dot(INK, 40, 7, 0.8));
  }

  var EVENT = {
    meteor: s(FIRE, 'M8 6l14 14M18 4l10 10M4 16l12 12', 2.2) + f(TAN, 'M24 24l10-3 7 7-2 10-10 3-7-7z') + s(BG, 'M30 28l3 3M28 35l2 1', 1.8),
    fair: s(GOLD, 'M6 20l18-12 18 12z') + s(GOLD, 'M10 20v20M38 20v20M6 40h36', 2.2) + f(GREEN, 'M16 20c0 4 4 4 4 0zM24 20c0 4 4 4 4 0zM32 20c0 4 4 4 4 0z') + s(GREEN, 'M19 34h10', 2.2),
    outage: box(STEEL, 10, 6, 28, 36, 3) + f(GOLD, 'M27 10L16 26h7l-2 12 11-16h-7z'),
    inspector: box(STEEL, 9, 8, 24, 32, 3) + s(STEEL, 'M14 16h14M14 22h14M14 28h8', 2) + ring(GREEN, 32, 30, 7) + s(GREEN, 'M37 35l6 6', 3),
    storm: s(DIM, 'M6 14h24a5 5 0 1 0-5-5M6 24h34a5 5 0 1 1-5 5M6 34h18a4 4 0 1 1-4 4'),
    rush: f(GOLD, 'M27 4L10 27h11l-3 17 20-25H26z'),
    free: box(GREEN, 8, 18, 32, 22, 3) + s(GREEN, 'M24 18v22M8 26h32M24 18c-8 0-10-10-4-10 4 0 4 6 4 10c0-4 0-10 4-10 6 0 4 10-4 10', 2.2)
  };

  function wrap(inner, size) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="' + (size || 48) + '" height="' + (size || 48) + '">' + inner + '</svg>';
  }

  /** An item of the belt by its shape and colour: the same figure the plot draws, larger and cleaner. */
  function item(def, size) {
    var c = def && def.color ? def.color : '#9A9A9A';
    var kind = def ? def.shape : 'box';
    var d;
    switch (kind) {
      case 'ore': d = f(c, 'M12 22l6-10 12-3 8 8 1 12-9 8-13-2z') + s(BG, 'M18 12l5 9-5 12M23 21l15-4M23 21l7 14', 1.5); break;
      case 'ingot': d = f(c, 'M6 34l6-16h24l6 16z') + s(BG, 'M12 18l4 16M36 18l-4 16M16 34h16', 1.5) + s(INK, 'M15 21h18', 1.5); break;
      case 'brick': d = f(c, 'M6 12h36v24H6z') + s(BG, 'M6 24h36M18 12v12M32 12v12M24 24v12', 2); break;
      case 'wire': d = ring(c, 24, 24, 13, 5) + ring(BG, 24, 24, 13, 1.2) + s(c, 'M35 31l8 8', 3); break;
      case 'gear': d = gear(c, 24, 24, 17); break;
      case 'chip': d = f(c, 'M11 11h26v26H11z') + s(c, 'M17 5v6M24 5v6M31 5v6M17 37v6M24 37v6M31 37v6M5 17h6M5 24h6M5 31h6M37 17h6M37 24h6M37 31h6', 2.2) + s(BG, 'M18 18h12v12H18z', 2); break;
      case 'motor': d = f(c, 'M8 14h24a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H8z') + s(BG, 'M14 14v20M20 14v20M26 14v20', 1.8) + s(c, 'M36 24h8', 4); break;
      case 'frame': d = box(c, 8, 8, 32, 32, 2) + s(c, 'M8 8l32 32M40 8L8 40', 2.2); break;
      case 'drone': d = s(c, 'M14 14l20 20M34 14L14 34', 3) + ring(c, 12, 12, 6) + ring(c, 36, 12, 6) + ring(c, 12, 36, 6) + ring(c, 36, 36, 6) + f(c, 'M19 19h10v10H19z'); break;
      case 'plate': d = f(c, 'M4 28l12-10h28L32 28z') + s(c, 'M4 28v5h28l12-10v-5M32 28v5', 2); break;
      case 'crystal': d = f(c, 'M24 4l12 14-12 26-12-26z') + s(BG, 'M12 18h24M24 4l-5 14 5 26 5-26z', 1.5); break;
      case 'drop': d = f(c, 'M24 5c6 9 13 15 13 24a13 13 0 0 1-26 0c0-9 7-15 13-24z') + s(INK, 'M18 30a6 6 0 0 0 5 6', 2); break;
      case 'cell': d = f(c, 'M13 11h22v32H13z') + f(c, 'M19 5h10v6H19z') + s(BG, 'M26 17l-6 10h8l-6 10', 2.2); break;
      case 'ring': d = ring(c, 24, 24, 15, 5) + s(INK, 'M16 18a10 10 0 0 1 6-4', 2); break;
      case 'tri': d = f(c, 'M24 6l19 34H5z') + s(BG, 'M14 32h5l3-8 4 12 3-4h5', 2); break;
      default: d = f(c, 'M8 16l16-8 16 8v18l-16 8-16-8z') + s(BG, 'M8 16l16 8 16-8M24 24v18', 1.8);
    }
    return wrap(d, size);
  }

  function lock() {
    return wrap(box(DIM, 13, 22, 22, 18, 3) + s(DIM, 'M17 22v-6a7 7 0 0 1 14 0v6') + dot(DIM, 24, 31, 2.2));
  }

  window.CvArt = {
    research: function (id) { return wrap(RESEARCH[id] || RESEARCH.blueprints); },
    shop: function (id) { return wrap(SHOP[id] || SHOP.money); },
    event: function (id) { return wrap(EVENT[id] || EVENT.rush); },
    planet: planet,
    item: item,
    lock: lock,
    ids: { research: Object.keys(RESEARCH), shop: Object.keys(SHOP), planet: Object.keys(PLANET), event: Object.keys(EVENT) }
  };
})();
