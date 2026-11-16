// The drawn pictures of «Алхимик» for the workshop: the six sources and the upgrades. (Elements
// keep their own glyphs from content/glyphs.json.) Copper, glass and the bright tones of the
// element palette; flat shapes, no text; a 32×32 SVG that reads at 28–44 px.
//   window.AlchemistArt.el(name, size) → <span><svg>
(function () {
  'use strict';
  var COPPER = '#d0915a';
  var COPPER_D = '#8f5a30';
  var GLASS = '#a9dde0';
  var GLASS_D = '#5fa3a8';
  var STONE = '#a3a7b0';
  var STONE_D = '#636772';
  var FIRE = '#e8603c';
  var AMBER = '#f2a541';
  var YELLOW = '#f4d35e';
  var GREEN = '#8bc34a';
  var GREEN_D = '#3fa34d';
  var BLUE = '#4a90e2';
  var BLUE_D = '#3566a8';
  var VIOLET = '#8b7cff';
  var VIOLET_D = '#5a4fb5';
  var PINK = '#e57ba8';
  var CREAM = '#efe6d0';
  var CREAM_D = '#c4b48e';
  var WOOD = '#a87c50';
  var WOOD_D = '#6e4f31';
  var INK = '#20232a';

  function p(d, fill, o) { return '<path d="' + d + '" fill="' + fill + '"' + (o ? ' opacity="' + o + '"' : '') + '/>'; }
  function r(x, y, w, h, fill, rx) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + fill + '"' + (rx ? ' rx="' + rx + '"' : '') + '/>'; }
  function c(cx, cy, rad, fill, o) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + rad + '" fill="' + fill + '"' + (o ? ' opacity="' + o + '"' : '') + '/>'; }
  function e(cx, cy, rx, ry, fill) { return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + fill + '"/>'; }
  function l(d, stroke, w) { return '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round"/>'; }
  function g(t, body) { return '<g transform="' + t + '">' + body + '</g>'; }

  var FLAME = 'M16 2c5 5 8 9 8 14a8 8 0 0 1-16 0c0-3 1.500-5 3-6.500 0 2.500 1 4 2.500 4.500 0-5 .5-8 2.500-12z';
  var STAR4 = 'M0-4l1.100 2.900L4 0 1.100 1.100 0 4l-1.100-2.900L-4 0l2.900-1.100z';
  function star(x, y, s, fill) { return g('translate(' + x + ' ' + y + ') scale(' + s + ')', p(STAR4, fill)); }

  var ART = {
    // The sources.
    fire: p('M4 29V17a12 12 0 0 1 24 0v12z', STONE_D) + p('M8 29V18a8 8 0 0 1 16 0v11z', INK) + g('translate(5.500 9) scale(0.660)', p(FLAME, FIRE)) +
      g('translate(10 17) scale(0.380)', p(FLAME, YELLOW)) + r(2, 28, 28, 3, STONE, 1.500),
    water: p('M2 24c3-2 6-2 9 0s6 2 10 0 6-2 9 0v5H2z', BLUE_D) + p('M5 22c0-3 3-5 7-5 1-3 9-3 10 0 3 0 5 2 5 5z', STONE) + p('M16 3c3 4 5 7 5 9.500a5 5 0 0 1-10 0C11 10 13 7 16 3z', BLUE) +
      c(14.500, 12, 1.300, CREAM, 0.8) + l('M3 26c3-2 5-2 8 0s5 2 8 0 5-2 9 0', BLUE, 1.500),
    earth: r(2, 4, 28, 7, GREEN_D, 2) + r(2, 9, 28, 7, WOOD) + r(2, 15, 28, 7, WOOD_D) + r(2, 21, 28, 8, STONE_D, 2) + c(9, 12.500, 1.500, CREAM_D) + c(21, 18.500, 1.800, STONE) +
      c(13, 25, 1.800, AMBER) + c(24, 25.500, 1.300, AMBER) + l('M7 4V2M12 4V1.500M20 4V2M25 4V1.500', GREEN, 1.600),
    air: p('M3 9h15l8 7-8 7H3c3-4 3-10 0-14z', WOOD) + p('M3 9h15l8 7H5c0-2.500-.8-5-2-7z', COPPER) + l('M8 11v10M12 10.500v11M16 10v12', WOOD_D, 1.300) + r(25, 14.500, 5, 3, STONE, 1) +
      l('M3 9 1 5M3 23l-2 4', WOOD_D, 2.200),
    ether: p('M3 24a13 13 0 0 1 26 0z', VIOLET_D) + p('M16 11a13 13 0 0 1 13 13H16z', VIOLET) + star(10, 19, 0.700, CREAM) + star(20, 17, 0.900, YELLOW) + star(15, 21.500, 0.450, CREAM) +
      r(2, 24, 28, 4, STONE, 1.500) + star(16, 5, 1.100, YELLOW) + c(6, 7, 1, CREAM) + c(26, 8, 1, CREAM),
    void: p('M4 14h24v13a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z', STONE_D) + l('M4 19h24M4 24h24M10 14v5M22 14v5M16 19v5M9 24v6M23 24v6', INK, 1) + e(16, 14, 12, 4.500, STONE) + e(16, 14, 9, 3, INK) +
      e(16, 14.500, 4, 1.200, VIOLET_D) + star(16, 5, 0.800, VIOLET),

    // The upgrades.
    shelves: r(3, 3, 26, 26, WOOD_D, 2) + r(5, 5, 22, 6, INK) + r(5, 13, 22, 6, INK) + r(5, 21, 22, 6, INK) + r(7, 6.500, 3, 4.500, FIRE, 1) + r(11.500, 7.500, 3, 3.500, BLUE, 1) + c(19, 9, 2, GREEN) +
      r(8, 14.500, 4, 4.500, VIOLET, 1) + c(16.500, 17, 2, AMBER) + r(21, 15, 3, 4, GLASS, 1) + c(9.500, 24.500, 2.200, PINK) + r(14, 22.500, 3, 4.500, YELLOW, 1) + r(19.500, 23, 5, 4, GREEN_D, 1),
    cubes: p('M5 14a8 8 0 0 1 16 0v9a5 5 0 0 1-5 5h-6a5 5 0 0 1-5-5z', COPPER) + p('M13 6a8 8 0 0 1 8 8v9a5 5 0 0 1-5 5h-3z', COPPER_D, 0.550) + r(10, 2, 6, 5, COPPER_D, 1.500) +
      l('M16 4h7c3 0 5 2 5 5v9', COPPER, 2.400) + p('M25.500 18h5l-1 7h-3z', GLASS) + r(3, 28, 20, 2.500, STONE_D, 1.200) + c(9.500, 16, 1.500, CREAM, 0.6),
    coil: l('M16 2v4c8 0 8 5 0 5s-8 5 0 5 8 5 0 5-8 5 0 5v4', COPPER, 3) + l('M16 6c8 0 8 5 0 5M16 16c8 0 8 5 0 5', COPPER_D, 1) + r(13.500, 1, 5, 3, STONE, 1) + r(13.500, 28, 5, 3, STONE, 1),
    crucible: p('M5 12h22l-3 14a3 3 0 0 1-3 2.500H11A3 3 0 0 1 8 26z', STONE_D) + r(3, 10, 26, 4, STONE, 2) + e(16, 12, 10, 2, YELLOW) + star(16, 5, 1.100, YELLOW) + star(8, 6, 0.550, CREAM) + star(24, 4, 0.650, CREAM) +
      p('M13 28.500h6l1 2.500h-8z', STONE),
    shop: r(2, 27.500, 28, 2.500, STONE_D, 1.200) + r(5, 14, 22, 14, CREAM_D) + p('M3 15 6 6h20l3 9z', FIRE) + p('M8.600 6h3.700l-.800 9H6.800zM16 6h3.700l.900 9h-4.700zM23.400 6H26l3 9h-4.700z', CREAM) +
      r(8, 18, 7, 6, INK) + c(11.500, 21, 2, YELLOW) + r(18, 18, 6, 10, WOOD_D),
    clerk: c(16, 9, 5.500, CREAM_D) + p('M6 30c0-8 4-13 10-13s10 5 10 13z', BLUE_D) + p('M13 17h6l-3 6z', CREAM) + r(9, 4, 14, 3, INK, 1.500) + p('M11 4c0-3 10-3 10 0z', INK) + c(22, 24, 4, YELLOW) + c(22, 24, 2, AMBER),
    loupe: l('M20 20l9 9', WOOD_D, 3.600) + c(13, 13, 10, COPPER) + c(13, 13, 7.500, GLASS) + l('M8.500 12a5 5 0 0 1 4-4.500', CREAM, 1.600),
    scroll: p('M7 5h17a3 3 0 0 1 3 3v16H10a3 3 0 0 1-3-3z', CREAM) + p('M7 5a3 3 0 0 0-3 3v2h6V8a3 3 0 0 0-3-3zM27 24a3 3 0 0 1-6 0v-1H10v1a3 3 0 0 0 3 3h11a3 3 0 0 0 3-3z', CREAM_D) +
      c(14, 13, 2.200, FIRE) + c(21, 13, 2.200, BLUE) + l('M16.800 13h1.400M17.500 12.300v1.400', WOOD_D, 1.200) + l('M13 18.500h9', WOOD_D, 1.400),
    apprentice: c(16, 12, 6, CREAM_D) + p('M6 30c0-7 4-11 10-11s10 4 10 11z', GREEN_D) + p('M8 9c0-6 16-6 16 0l-2 1c-3-2-9-2-12 0z', VIOLET) + p('M16 1l2 3h-4z', VIOLET_D) +
      p('M22 20h5l-1 6a1.500 1.500 0 0 1-3 0z', GLASS) + c(24.500, 18, 1, GREEN),
    athanor: r(7, 10, 18, 19, STONE_D, 2) + p('M9 10 12 3h8l3 7z', STONE) + p('M11 29V19a5 5 0 0 1 10 0v10z', INK) + g('translate(9.500 15) scale(0.400)', p(FLAME, AMBER)) + r(13, 0, 6, 4, STONE_D, 1) +
      r(5, 9, 22, 2.500, STONE, 1) + c(16, 14.500, 1.500, YELLOW),
    retort: p('M12 9a9 9 0 1 0 9 9c0-2-.6-3.500-1.500-5L29 8l-2-3-9 5c-2-.8-4-1-6-1z', GLASS, 0.5) + p('M4.500 20h15a8 8 0 0 1-15 0z', GREEN) + c(9, 22, 1.300, CREAM) + c(14, 23.500, 1, CREAM) +
      l('M12 9a9 9 0 1 0 9 9c0-2-.6-3.500-1.500-5L29 8l-2-3-9 5c-2-.8-4-1-6-1z', GLASS_D, 1.600),
    mortar: p('M3 14h26c0 8-5 13-13 13S3 22 3 14z', STONE) + p('M16 14h13c0 8-5 13-13 13z', STONE_D, 0.6) + r(10, 27, 12, 3, STONE_D, 1.500) + g('rotate(35 20 9)', r(18.300, 0, 3.400, 15, WOOD, 1.700)) + e(16, 14, 13, 2.500, STONE_D),
    sieve: e(16, 12, 14, 6, WOOD) + e(16, 12, 11.500, 4.200, INK) + l('M7 11l18 3M6 13.500l15 2.500M10 9l16 3', STONE, 1) + p('M2 12v4c0 3.300 6.300 6 14 6s14-2.700 14-6v-4c0 3.300-6.300 6-14 6S2 15.300 2 12z', WOOD_D) +
      c(11, 26, 1.500, AMBER) + c(16, 28.500, 1.300, YELLOW) + c(21, 25.500, 1.500, AMBER) + c(16, 24, 1, YELLOW),
    seal: p('M11 17l-4 12 5-2 3 4 3-11zM21 17l4 12-5-2-3 4-3-11z', FIRE) + c(16, 12, 10, YELLOW) + c(16, 12, 7, AMBER) + star(16, 12, 1.300, CREAM),
    pointer: r(15, 8, 2.500, 22, WOOD_D) + p('M5 3h18l5 5-5 5H5z', WOOD) + p('M27 15H9l-5 5 5 5h18z', COPPER) + l('M9 8h10M12 20h11', CREAM, 1.600),
    glass: r(6, 2, 20, 3, COPPER_D, 1.500) + r(6, 27, 20, 3, COPPER_D, 1.500) + p('M8 5h16c0 6-4 8-6 11 2 3 6 5 6 11H8c0-6 4-8 6-11-2-3-6-5-6-11z', GLASS, 0.450) +
      p('M10.500 9h11c-1 3-3.500 4.500-5.500 7-2-2.500-4.500-4-5.500-7z', AMBER) + p('M10 27c1-3 4-4 6-5 2 1 5 2 6 5z', AMBER) + l('M16 16v5', AMBER, 1.500),
    catalog: r(4, 5, 24, 22, WOOD, 2) + r(6, 7, 9, 8, CREAM, 1) + r(17, 7, 9, 8, CREAM, 1) + r(6, 17, 9, 8, CREAM, 1) + r(17, 17, 9, 8, CREAM, 1) + c(10.500, 11, 2.200, FIRE) + c(21.500, 11, 2.200, BLUE) +
      c(10.500, 21, 2.200, GREEN_D) + c(21.500, 21, 2.200, VIOLET)
  };

  function svg(name, size) {
    var s = size || 36;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="' + s + '" height="' + s + '" class="a-art" aria-hidden="true">' + (ART[name] || ART.catalog) + '</svg>';
  }

  function el(name, size) {
    var box = document.createElement('span');
    box.className = 'a-pic';
    box.innerHTML = svg(name, size);
    return box;
  }

  var api = { svg: svg, el: el, names: Object.keys(ART) };
  if (typeof window !== 'undefined') window.AlchemistArt = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
