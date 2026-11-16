// The drawn pictures of «Словоплёт»: houses, upgrades, the special buildings of the quarters and the
// kinds of a city. A brick-and-wood palette, flat shapes, no text; a 32×32 SVG that reads at 28–44 px.
//   window.WWArt.el(name, size) → <span><svg>;  WWArt.tiles(n) → a row of n letter tiles.
(function () {
  'use strict';
  var BRICK = '#cf7f61';
  var BRICK_D = '#96553f';
  var WOOD = '#b08a57';
  var WOOD_D = '#735636';
  var STONE = '#aeb1b9';
  var STONE_D = '#6c707c';
  var CREAM = '#eee5cd';
  var CREAM_D = '#c6b991';
  var BLUE = '#7396bd';
  var BLUE_D = '#476a91';
  var GREEN = '#8cb071';
  var GREEN_D = '#587a45';
  var GOLD = '#e0bb5c';
  var GOLD_D = '#a8842f';
  var INK = '#22252c';

  function p(d, fill, o) { return '<path d="' + d + '" fill="' + fill + '"' + (o ? ' opacity="' + o + '"' : '') + '/>'; }
  function r(x, y, w, h, fill, rx) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + fill + '"' + (rx ? ' rx="' + rx + '"' : '') + '/>'; }
  function c(cx, cy, rad, fill, o) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + rad + '" fill="' + fill + '"' + (o ? ' opacity="' + o + '"' : '') + '/>'; }
  function l(d, stroke, w) { return '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round"/>'; }
  function g(t, body) { return '<g transform="' + t + '">' + body + '</g>'; }

  var GROUND = r(1, 27.500, 30, 2.500, STONE_D, 1.200);
  var GRASS = r(1, 27.500, 30, 2.500, GREEN_D, 1.200);
  var WAVES = 'M0 24c3-2.500 5-2.500 8 0s5 2.500 8 0 5-2.500 8 0 5 2.500 8 0v8H0z';
  function win(x, y, w, h) { return r(x, y, w || 3, h || 3.500, GOLD, 0.500); }

  var ART = {
    // The houses.
    izba: GRASS + r(6, 16, 20, 12, WOOD) + l('M6 19h20M6 22h20M6 25h20', WOOD_D, 1) + p('M3 17 16 5l13 12z', WOOD_D) + p('M16 5l13 12h-7z', BRICK_D) +
      win(9, 19, 4, 4.500) + r(18, 20, 5, 8, WOOD_D) + r(21, 6, 3, 6, BRICK),
    stone: GROUND + r(5, 10, 22, 18, STONE) + p('M3 11 16 3l13 8z', BLUE_D) + win(8, 13) + win(14.500, 13) + win(21, 13) + win(8, 20) + win(21, 20) + r(14, 20, 4, 8, WOOD_D) + r(5, 17.500, 22, 1, STONE_D),
    tenement: GROUND + r(6, 4, 20, 24, BRICK) + r(5, 3, 22, 2.500, BRICK_D) + win(9, 7.500) + win(14.500, 7.500) + win(20, 7.500) + win(9, 13.500) + win(14.500, 13.500) + win(20, 13.500) +
      win(9, 19.500) + win(20, 19.500) + r(14, 20, 4, 8, WOOD_D) + r(6, 11.800, 20, 1, BRICK_D) + r(6, 17.800, 20, 1, BRICK_D),

    // The upgrades.
    workshop: p('M3 13h17c3 0 6 1 8 3-4 0-6 2-7 4h-8c-1-3-4-5-10-7z', STONE) + r(11, 20, 9, 4, STONE_D) + p('M7 29l2-5h13l2 5z', STONE) +
      g('rotate(-30 20 8)', r(18.800, 3, 2.400, 13, WOOD) + r(14, 1, 12, 5, STONE_D, 1)),
    market: GROUND + r(5, 15, 2, 12.500, WOOD_D) + r(25, 15, 2, 12.500, WOOD_D) + p('M3 15 6 7h20l3 8z', BRICK) +
      p('M8.600 7h3.700l-.800 8H6.800zM16 7h3.700l.900 8h-4.700zM23.400 7H26l3 8h-4.700z', CREAM) + r(7, 19, 18, 8.500, WOOD) + c(11, 18.500, 2.200, GOLD) + c(16, 18.500, 2.200, GREEN) + c(21, 18.500, 2.200, BRICK_D),
    library: r(4, 22, 24, 6, BLUE, 1) + r(6, 23.500, 20, 3, CREAM) + r(6, 15, 22, 6, BRICK, 1) + r(8, 16.500, 18, 3, CREAM) + r(3, 8, 23, 6, GREEN, 1) + r(5, 9.500, 19, 3, CREAM) +
      r(4, 22, 3, 6, BLUE_D) + r(6, 15, 3, 6, BRICK_D) + r(3, 8, 3, 6, GREEN_D) + p('M20 2h4v8l-2-1.500L20 10z', GOLD),
    typography: r(4, 25, 24, 4, WOOD_D, 1) + r(6, 4, 3, 21, WOOD) + r(23, 4, 3, 21, WOOD) + r(5, 3, 22, 3, WOOD_D, 1) + r(15, 6, 2, 8, STONE_D) + l('M9 9h14', STONE, 2.200) +
      r(10, 14, 12, 3.500, STONE_D, 1) + r(9, 19.500, 14, 5.500, CREAM) + l('M11.500 21.500h9M11.500 23.500h6', WOOD_D, 1),
    tower: GROUND + p('M11 28 13 12h6l2 16z', CREAM_D) + l('M12.500 17h7M12 22h8', STONE_D, 1.200) + r(9, 8, 14, 4.500, BRICK, 1) + p('M9 8 16 1l7 7z', BRICK_D) + r(14.500, 9, 3, 2.500, GOLD) +
      l('M16 1v-.5', WOOD_D, 1.500) + r(14, 22, 4, 6, WOOD_D),
    post: r(3, 8, 26, 18, CREAM, 2.500) + p('M3 10.500 16 20l13-9.500V8H3z', CREAM_D) + l('M4 9l12 9 12-9', WOOD_D, 1.600) + c(23.500, 21, 3.500, BRICK) + c(23.500, 21, 1.600, BRICK_D),
    lamp: r(15, 14, 2, 14, STONE_D) + r(11, 27.500, 10, 2.500, STONE_D, 1.200) + p('M10 6h12l-2 9h-8z', GOLD) + p('M12.500 7.500h7l-1.200 6h-4.600z', CREAM) + p('M9 6 16 1l7 5z', STONE_D) +
      r(11.500, 14.500, 9, 2, STONE_D, 1) + c(16, 10.500, 9, GOLD, 0.220),
    herald: p('M3 13h7l14-7v20l-14-7H3z', GOLD) + p('M10 13l14-7v10H10z', CREAM, 0.350) + r(24, 4, 3, 24, GOLD_D, 1.500) + r(1, 12, 3, 8, GOLD_D, 1.500) + p('M6 19h5l2 8H8z', WOOD) +
      l('M29 11c1.500 2 1.500 8 0 10', GOLD, 1.800),
    quill: p('M29 2C17 3 10 9 9 20l-3 8 7-4c11-1 16-9 16-22z', CREAM) + p('M29 2C22 9 15 17 8 25l5-1c11-1 16-9 16-22z', CREAM_D) + l('M27 5 5 29', WOOD_D, 1.600) +
      p('M19 30a5 5 0 0 1 10 0z', INK) + r(21.500, 21, 5, 4, BLUE_D, 1),
    mill: GRASS + p('M11 28 13 13h6l2 15z', CREAM_D) + p('M12 13 16 8l4 5z', BRICK_D) + r(14.500, 22, 3, 6, WOOD_D) +
      l('M16 12 5 4M16 12 27 4M16 12 6 22M16 12 26 22', WOOD, 1.600) + p('M5 4l5 1-2 4zM27 4l-1 5-4-2zM6 22l1-5 4 2zM26 22l-5-1 2-4z', CREAM) + c(16, 12, 2, GOLD),
    bridge: p(WAVES, BLUE_D) + p('M0 12h32v5c-2 0-3 2-3 5h-4c0-4-3-7-9-7s-9 3-9 7H3c0-3-1-5-3-5z', STONE) + r(0, 9, 32, 3.500, STONE_D, 1) + l('M4 9V6M12 9V6M20 9V6M28 9V6', STONE_D, 1.800),
    school: GROUND + r(5, 14, 22, 14, CREAM) + p('M3 15 16 6l13 9z', BRICK) + r(13.500, 20, 5, 8, WOOD_D) + win(7.500, 18) + win(21.500, 18) + r(14, 1, 4, 5, WOOD_D) + c(16, 4.200, 1.800, GOLD) + c(16, 12, 2, CREAM_D),
    gym: GROUND + p('M3 12 16 4l13 8z', BLUE) + r(4, 12, 24, 2.500, CREAM_D) + r(6, 14.500, 3, 13, CREAM) + r(11.500, 14.500, 3, 13, CREAM) + r(17.500, 14.500, 3, 13, CREAM) + r(23, 14.500, 3, 13, CREAM) +
      c(16, 8.800, 1.800, GOLD) + r(15.400, 0, 1.200, 4, WOOD_D) + p('M16.600 0l4.500 1.400-4.500 1.600z', BRICK),
    archive: r(5, 3, 22, 26, WOOD, 2) + r(7, 5, 18, 6.500, CREAM_D, 1) + r(7, 13, 18, 6.500, CREAM_D, 1) + r(7, 21, 18, 6.500, CREAM_D, 1) + r(13, 7.300, 6, 2, WOOD_D, 1) + r(13, 15.300, 6, 2, WOOD_D, 1) + r(13, 23.300, 6, 2, WOOD_D, 1),
    townhall: GROUND + r(4, 17, 24, 11, CREAM) + r(12, 6, 8, 22, CREAM_D) + p('M10 7 16 1l6 6z', BRICK_D) + c(16, 11.500, 2.800, CREAM) + l('M16 10v1.500l1.200.8', INK, 1) +
      win(6.500, 20) + win(22.500, 20) + r(14, 21, 4, 7, WOOD_D) + r(3, 15.500, 9, 2, BRICK) + r(20, 15.500, 9, 2, BRICK),
    inn: p('M5 9h16v17a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z', GOLD) + p('M5 9h16v4c-2 2-4 0-6 1s-3 2-5 1-3-2-5-1z', CREAM) + '<path d="M21 13h3a4 4 0 0 1 0 9h-3" fill="none" stroke="' + GOLD_D + '" stroke-width="2.600"/>' +
      c(8, 8, 3, CREAM) + c(13, 6.500, 3.500, CREAM) + c(18, 8, 3, CREAM) + l('M9 17v8M13 17v8M17 17v8', GOLD_D, 1.300),
    garden: GRASS + r(11, 20, 10, 8, STONE) + r(9.500, 18.500, 13, 2.500, STONE_D, 1) + c(16, 7, 3.500, CREAM) + p('M11.500 18.500c0-5 2-7.500 4.500-7.500s4.500 2.500 4.500 7.500z', CREAM) +
      c(5, 24, 4, GREEN) + c(27, 24, 4, GREEN) + c(5, 22.500, 1.500, GREEN_D, 0.6) + c(27, 22.500, 1.500, GREEN_D, 0.6),

    // The special buildings of the quarters.
    sloboda: GRASS + r(8, 19, 16, 9, STONE) + l('M8 22h16M8 25h16M12 19v3M18 22v3M15 25v3', STONE_D, 1) + r(8, 9, 2, 10, WOOD_D) + r(22, 9, 2, 10, WOOD_D) + p('M5 10 16 3l11 7z', BRICK_D) +
      l('M16 10v5', WOOD, 1.300) + r(13.500, 14.500, 5, 4, WOOD, 1),
    craft: p('M2 12h18c3 0 7 1 10 4-5 0-7 2-8 5h-9c-1-4-5-6-11-9z', STONE) + r(10, 21, 11, 4, STONE_D) + p('M6 30l2-5h15l2 5z', STONE) +
      p('M18 2c2 2 3 3.500 3 5a3 3 0 0 1-6 0c0-1 .5-2 1.200-2.600.2 1 .7 1.600 1.300 1.600 0-1.500.1-2.800.5-4z', BRICK) + c(10, 6, 1, GOLD) + c(25, 7, 1, GOLD),
    trade: GROUND + r(3, 9, 26, 19, CREAM) + r(2, 6, 28, 3.500, BRICK, 1) + p('M5 28V17a3 3 0 0 1 6 0v11zM13 28V17a3 3 0 0 1 6 0v11zM21 28V17a3 3 0 0 1 6 0v11z', BLUE_D) + r(3, 11.500, 26, 1, CREAM_D) + p('M12 6l4-4 4 4z', BRICK_D),
    uni: GROUND + p('M7 14a9 9 0 0 1 18 0z', BLUE) + p('M16 5a9 9 0 0 1 9 9h-9z', BLUE_D) + r(15.400, 1, 1.200, 4, GOLD_D) + c(16, 1.500, 1.300, GOLD) + r(3, 14, 26, 2.500, CREAM_D) +
      r(5, 16.500, 3, 11, CREAM) + r(10.500, 16.500, 3, 11, CREAM) + r(18.500, 16.500, 3, 11, CREAM) + r(24, 16.500, 3, 11, CREAM) + r(14.500, 20, 3, 7.500, WOOD_D),
    quay: p(WAVES, BLUE_D) + p('M11 26 13 9h6l2 17z', CREAM) + p('M12.300 15h7.400l.400 4h-8.200z', BRICK) + r(11.500, 5, 9, 4.500, STONE_D, 1) + r(13.500, 5.800, 5, 3, GOLD) + p('M12 5l4-4 4 4z', BRICK_D) +
      p('M20.500 6 31 3v8z', GOLD, 0.450) + p('M11.500 6 1 3v8z', GOLD, 0.450),
    forms: r(3, 17, 12, 12, WOOD, 1.500) + r(17, 17, 12, 12, WOOD, 1.500) + r(10, 3, 12, 12, WOOD_D, 1.500) + r(5.500, 19.500, 7, 7, CREAM, 1) + r(19.500, 19.500, 7, 7, CREAM, 1) + r(12.500, 5.500, 7, 7, CREAM, 1) +
      l('M7.500 24.500l1.500-3 1.500 3M21.500 21.500h3M21.500 24.500h3M23 21.500v3M14.500 7.500v3h3', WOOD_D, 1.200),
    old: GROUND + r(10, 9, 12, 19, BRICK) + p('M8 10 16 1l8 9z', BLUE_D) + c(16, 15, 4, CREAM) + l('M16 12.500V15l1.800 1.200', INK, 1.200) + r(14, 21.500, 4, 6.500, WOOD_D, 2) +
      r(3, 20, 7, 8, CREAM_D) + r(22, 20, 7, 8, CREAM_D) + p('M2 20.500l4.500-4 4.500 4zM21 20.500l4.500-4 4.500 4z', BRICK_D),

    // The kinds of a city.
    plain: GRASS + l('M4 28V12M8 28V10M12 28V12M20 28V12M24 28V10M28 28V12', WOOD, 3) + p('M2.500 12 4 9l1.500 3zM6.500 10 8 7l1.500 3zM10.500 12 12 9l1.500 3zM18.500 12 20 9l1.500 3zM22.500 10 24 7l1.500 3zM26.500 12 28 9l1.500 3z', WOOD) +
      r(13, 15, 6, 13, WOOD_D) + l('M3 20h10M19 20h10', WOOD_D, 1.500) + p('M11 15 16 10l5 5z', BRICK),
    sea: p(WAVES, BLUE_D) + p('M4 20h24l-4 6H8z', WOOD) + r(15, 3, 2, 17, WOOD_D) + p('M17 4c6 3 9 8 9 14h-9z', CREAM) + p('M15 7c-5 3-7 6-7 11h7z', CREAM_D) + l('M1 28.500c3-2.500 5-2.500 8 0s5 2.500 8 0 5-2.500 8 0 4 2 6 .5', BLUE, 1.600),
    north: p('M0 30c3-5 8-7 16-7s13 2 16 7z', CREAM) + r(15, 22, 2, 5, WOOD_D) + p('M16 2l6 8h-3l5 6h-3l5 7H6l5-7H8l5-6h-3z', GREEN_D) + p('M16 2l3 4h-6zM12.500 10h7l1.500 2H11zM10.500 16h11l1.500 2H9z', CREAM) +
      c(5, 6, 1, CREAM) + c(27, 9, 1, CREAM) + c(26, 3, .8, CREAM) + c(4, 14, .8, CREAM),
    mountain: p('M0 29 11 8l6 10 4-7 11 18z', STONE_D) + p('M11 8l3.500 6-3.500 3-3.500-2zM21 11l3 5-3 2-2.500-2z', CREAM) + p('M11 8l6 10 4 11H0z', STONE, 0.550) + c(26, 6, 3, GOLD),
    river: r(0, 3, 32, 26, GREEN_D, 3) + p('M20 3c-6 6 8 9 0 14S6 22 9 29h9c-3-6 10-7 14-12V3z', BLUE) + p('M20 3c-6 6 8 9 0 14S6 22 9 29h4c-3-7 6-8 11-12s-6-9-1-14z', BLUE_D, 0.5) +
      p('M5 12l3-5 3 5zM4 23l2.500-4 2.500 4z', GREEN) + r(24, 21, 5, 4, CREAM) + p('M23 21.500l3.500-3 3.500 3z', BRICK)
  };

  function svg(name, size) {
    var s = size || 36;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="' + s + '" height="' + s + '" class="ww-art" aria-hidden="true">' + (ART[name] || ART.izba) + '</svg>';
  }

  function el(name, size) {
    var box = document.createElement('span');
    box.className = 'ww-pic';
    box.innerHTML = svg(name, size);
    return box;
  }

  /** A row of n letter tiles: the picture of «a word of n letters». */
  function tiles(n) {
    var box = document.createElement('span');
    box.className = 'ww-tiles';
    for (var i = 0; i < n; i++) box.appendChild(document.createElement('i'));
    return box;
  }

  var api = { svg: svg, el: el, tiles: tiles, names: Object.keys(ART) };
  if (typeof window !== 'undefined') window.WWArt = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
