// The drawn pictures of «Династия»: characteristics, holdings, the court, campaigns, colonies, laws.
// One palette (parchment, gold, stone, a red and a blue for the cloth), flat shapes, no text;
// every picture is a 32×32 SVG that reads at 28–44 px.  window.DynastyArt.el(name, size) → <svg>.
(function () {
  'use strict';
  var GOLD = '#e0b85a';
  var GOLD_D = '#a67c2e';
  var CREAM = '#eadfc4';
  var CREAM_D = '#bfae87';
  var STONE = '#9aa1ad';
  var STONE_D = '#626978';
  var WOOD = '#9a6a42';
  var WOOD_D = '#6b4528';
  var RED = '#c2554a';
  var RED_D = '#8a352e';
  var GREEN = '#6f9e5c';
  var GREEN_D = '#49703d';
  var BLUE = '#5d8fc4';
  var BLUE_D = '#3b648f';
  var INK = '#23262e';

  function p(d, fill) { return '<path d="' + d + '" fill="' + fill + '"/>'; }
  function r(x, y, w, h, fill, rx) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + fill + '"' + (rx ? ' rx="' + rx + '"' : '') + '/>'; }
  function c(cx, cy, rad, fill) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + rad + '" fill="' + fill + '"/>'; }
  function l(d, stroke, w) { return '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round"/>'; }

  /** A coin with a sector of the inheritance: the share grows from law to law. */
  function share(part) {
    var a = Math.PI * 2 * part - Math.PI / 2;
    var x = (16 + 11 * Math.cos(a)).toFixed(2);
    var y = (16 + 11 * Math.sin(a)).toFixed(2);
    return c(16, 16, 13, GOLD_D) + c(16, 16, 11, STONE_D) +
      p('M16 16V5A11 11 0 ' + (part > 0.5 ? 1 : 0) + ' 1 ' + x + ' ' + y + 'z', GOLD) + c(16, 16, 3, GOLD_D);
  }

  var sword = p('M15 3h2l1.5 3V19h-5V6z', CREAM) + p('M16 3l1.5 3V19H16z', STONE) + r(9, 19, 14, 3, GOLD, 1.5) + r(14.5, 22, 3, 5, WOOD) + c(16, 28.5, 2, GOLD_D);

  var ART = {
    // The characteristics.
    adm: p('M7 6h15a3 3 0 0 1 3 3v15H10a3 3 0 0 1-3-3z', CREAM) + p('M7 6a3 3 0 0 1 3 3v15a3 3 0 0 1-3-3z', CREAM_D) +
      l('M13 11h8M13 15h8M13 19h4', WOOD_D, 1.6) + c(22, 24, 4.5, RED) + c(22, 24, 2, RED_D),
    trade: l('M16 5v20M6 9h20', GOLD_D, 2) + c(16, 5, 2, GOLD) + p('M2 17h10a5 5 0 0 1-10 0z', GOLD) + p('M20 17h10a5 5 0 0 1-10 0z', GOLD) +
      l('M7 9 3 17M7 9l4 8M25 9l-4 8M25 9l4 8', GOLD_D, 1.2) + r(10, 25, 12, 3, GOLD_D, 1.5),
    war: sword,
    learn: p('M3 8c5-2 9-1 13 2v17c-4-3-8-4-13-2z', CREAM) + p('M29 8c-5-2-9-1-13 2v17c4-3 8-4 13-2z', CREAM_D) +
      l('M6 12c3-.6 5 0 7 1.2M6 16c3-.6 5 0 7 1.2M26 12c-3-.6-5 0-7 1.2M26 16c-3-.6-5 0-7 1.2', WOOD_D, 1.3) + r(15, 9, 2, 19, BLUE_D),
    health: p('M16 28C7 21 3 16 3 11a6.5 6.5 0 0 1 13-2 6.5 6.5 0 0 1 13 2c0 5-4 10-13 17z', RED) +
      p('M16 28C7 21 3 16 3 11a6.5 6.5 0 0 1 6-6.5C6 9 8 18 16 28z', RED_D) + l('M9 15h4l2-4 3 8 2-4h4', CREAM, 1.8),

    // The holdings, from a farmstead to a factory.
    farm: r(2, 26, 28, 3, GREEN_D, 1.5) + r(8, 16, 16, 11, CREAM_D) + p('M4 17 16 5l12 12z', GOLD_D) + p('M16 5l12 12h-6z', WOOD) +
      r(14, 20, 5, 7, WOOD_D) + l('M3 26v-5M5.5 26v-4', GOLD, 1.5),
    village: r(2, 26, 28, 3, GREEN_D, 1.5) + r(4, 17, 11, 10, CREAM_D) + p('M2 18 9.5 9 17 18z', RED) + r(17, 14, 11, 13, CREAM) +
      p('M15 15 22.5 5 30 15z', RED_D) + r(8, 21, 3, 6, WOOD_D) + r(21, 20, 4, 7, WOOD_D) + r(20.5, 16, 2, 2, BLUE_D) + r(24.5, 16, 2, 2, BLUE_D),
    mill: r(2, 27, 28, 2.5, GREEN_D, 1.2) + p('M11 28 13 13h6l2 15z', CREAM_D) + p('M12 13 16 8l4 5z', RED_D) + r(14.5, 22, 3, 6, WOOD_D) +
      l('M16 12 5 4M16 12 27 4M16 12 6 22M16 12 26 22', WOOD, 1.6) + p('M5 4l5 1-2 4zM27 4l-1 5-4-2zM6 22l1-5 4 2zM26 22l-5-1 2-4z', CREAM) + c(16, 12, 2, GOLD),
    market: r(2, 27, 28, 2.5, STONE_D, 1.2) + r(5, 15, 2, 12, WOOD_D) + r(25, 15, 2, 12, WOOD_D) + p('M3 15 6 7h20l3 8z', RED) +
      p('M8.6 7h3.7l-.8 8H6.8zM16 7h3.7l.9 8h-4.7zM23.4 7H26l3 8h-4.7z', CREAM) + r(7, 19, 18, 8, WOOD) + c(11, 18.5, 2.2, GOLD) + c(16, 18.5, 2.2, GREEN) + c(21, 18.5, 2.2, RED_D),
    mine: p('M1 28 11 8l6 9 4-5 10 16z', STONE_D) + p('M11 8l3 4.5-3 2.5-3-1.5z', CREAM) + p('M11 28v-7a5 5 0 0 1 10 0v7z', INK) +
      l('M10.5 28v-7.5a5.5 5.5 0 0 1 11 0V28', WOOD, 1.8) + l('M21 6 28 13', WOOD, 1.8) + l('M23 3c3 1 6 4 7 7', STONE, 2.2),
    city: r(2, 27, 28, 2.5, STONE_D, 1.2) + r(5, 15, 22, 12, STONE) + p('M5 15v-4h3v2h3v-2h3v2h4v-2h3v2h3v-2h3v4z', STONE) +
      r(3, 9, 6, 18, STONE_D) + r(23, 9, 6, 18, STONE_D) + p('M2 9 6 3l4 6zM22 9l4-6 4 6z', RED) + p('M13 27v-6a3 3 0 0 1 6 0v6z', WOOD_D) + r(5, 13, 2, 3, INK) + r(25, 13, 2, 3, INK),
    port: p('M0 24c3-2.5 5-2.5 8 0s5 2.5 8 0 5-2.5 8 0 5 2.5 8 0v7H0z', BLUE_D) + p('M4 19h24l-4 6H8z', WOOD) + r(15, 3, 2, 16, WOOD_D) +
      p('M17 4c6 2 9 7 9 13h-9z', CREAM) + p('M15 7c-5 2-7 6-7 10h7z', CREAM_D) + p('M17 3l5 1.5-5 2z', RED) +
      l('M1 28c3-2.5 5-2.5 8 0s5 2.5 8 0 5-2.5 8 0 4 2 6 .5', BLUE, 1.6),
    capital: r(2, 27, 28, 2.5, STONE_D, 1.2) + r(6, 17, 20, 10, STONE) + p('M6 17v-3h3v1.5h3V14h3v3z', STONE) + p('M26 17v-3h-3v1.5h-3V14h-3v3z', STONE) +
      r(12, 9, 8, 18, CREAM_D) + p('M10 10 16 3l6 7z', BLUE_D) + r(15.3, 0, 1.4, 4, WOOD_D) + p('M16.7 0l5 1.6-5 1.8z', GOLD) +
      p('M13.5 27v-5a2.5 2.5 0 0 1 5 0v5z', WOOD_D) + r(14.8, 12.5, 2.4, 4, INK, 1.2) + r(8, 20, 2, 3, INK) + r(22, 20, 2, 3, INK),
    factory: r(2, 27, 28, 2.5, STONE_D, 1.2) + p('M4 27V17l7 4v-4l7 4v-4l7 4v6z', RED_D) + r(22, 7, 5, 20, RED) + r(21, 6, 7, 2.5, STONE) +
      c(24, 3, 2.4, STONE) + c(27.5, 1.8, 1.8, STONE_D) + r(7, 23, 3, 2.5, GOLD) + r(13, 23, 3, 2.5, GOLD) + r(19, 23, 2, 2.5, GOLD),

    // The court: every place is a purse of the treasury.
    court: p('M10 12h12c5 5 7 10 5 14-1.5 3-4.5 3-11 3s-9.500 0-11-3c-2-4 0-9 5-14z', WOOD) + p('M11 6l2.500 2 2.500-2.500L18.500 8 21 6l1 6H10z', WOOD_D) +
      r(9.500, 11, 13, 2.600, GOLD_D, 1.300) + c(16, 21, 4.500, GOLD) + c(16, 21, 2.200, GOLD_D),

    // The campaigns.
    border: l('M7 29 23 5', WOOD, 2.2) + p('M23 5l3-3 .5 6.500z', STONE) + p('M21 8 8 10l7 5 2 8z', RED) + p('M21 8l-6 7 2 8z', RED_D),
    campaign: '<g transform="rotate(38 16 16)">' + sword + '</g><g transform="rotate(-38 16 16)">' + sword + '</g>',
    great: p('M5 4h22v12c0 7-5 11-11 13C10 27 5 23 5 16z', BLUE_D) + p('M16 4h11v12c0 7-5 11-11 13z', BLUE) +
      p('M9 13l2.500-5 2.500 4 2-5 2 5 2.500-4 2.500 5-1 6H10z', GOLD) + r(10, 19, 12, 2.400, GOLD_D, 1.200),
    march: l('M6 29V4', WOOD, 2.2) + p('M7 5h19l-5 6 5 6H7z', RED) + p('M7 11h14l5 6H7z', RED_D) + c(6, 3.500, 2, GOLD),

    // The colonies and the ship at sea.
    isle: p('M0 25c3-2.500 5-2.500 8 0s5 2.500 8 0 5-2.500 8 0 5 2.500 8 0v6H0z', BLUE_D) + p('M5 25c3-6 16-6 22 0z', GOLD) +
      l('M16 21c0-5 .5-9 2-12', WOOD, 2) + p('M18 9c-5-3-9-2-11 1 4-1 7 0 11-1zM18 9c4-4 8-4 11-2-4 0-7 1-11 2zM18 9c0-4-2-6-6-7 2 2 4 4 6 7zM18 9c3 1 6 4 6 8-2-3-4-5-6-8z', GREEN),
    coast: p('M0 25c3-2.500 5-2.500 8 0s5 2.500 8 0 5-2.500 8 0 5 2.500 8 0v6H0z', BLUE_D) + p('M12 26 16 12l5 3 3-6 8 4v13z', STONE_D) + p('M24 9l8 4v4l-9-3z', GREEN_D) +
      r(4, 12, 4, 13, CREAM) + r(4, 16, 4, 3, RED) + p('M3 12l3-4 3 4z', RED_D) + p('M8 9l5-1.500v3z', GOLD),
    spice: p('M7 13h18c3 5 4 9 3 13-1 3-4 3-12 3s-11 0-12-3c-1-4 0-8 3-13z', CREAM_D) + p('M9 13c-1-3 0-5 2-6l5 2 5-2c2 1 3 3 2 6z', CREAM) +
      r(8.500, 12, 15, 2.400, RED_D, 1.200) + c(12, 20, 2, RED) + c(17, 22, 2, GOLD_D) + c(21, 19, 2, RED) + c(15, 17.500, 1.600, GOLD_D),
    newland: c(16, 16, 13, WOOD_D) + c(16, 16, 11, CREAM) + p('M16 6l3 10-3 10-3-10z', STONE_D) + p('M16 6l3 10h-6z', RED) +
      p('M6 16l10-2.200 10 2.200-10 2.200z', CREAM_D) + c(16, 16, 1.800, GOLD),
    ship: p('M0 24c3-2.500 5-2.500 8 0s5 2.500 8 0 5-2.500 8 0 5 2.500 8 0v7H0z', BLUE_D) + p('M3 18h26l-4 7H8z', WOOD) + p('M3 18h26l-1 2H4z', WOOD_D) +
      r(15, 2, 2, 16, WOOD_D) + p('M6 6h20c-1 3-1 6 0 9H6c1-3 1-6 0-9z', CREAM) + p('M14 6h4v9h-4z', RED),

    // Patronage.
    scholar: '<g transform="rotate(-32 16 16)">' + r(3, 13, 12, 6, WOOD) + r(15, 12, 9, 8, GOLD_D) + r(24, 11, 4, 10, GOLD) + r(1.500, 12.500, 2, 7, GOLD) + '</g>' +
      l('M16 19 10 30M16 19l6 11M16 19v9', STONE_D, 1.800) + p('M25 3l.8 2.200L28 6l-2.200.8L25 9l-.8-2.200L22 6l2.200-.8z', CREAM),

    // The laws of the house.
    elder: share(0.2),
    majorat: share(0.3),
    treasury: share(0.4),
    indivisible: share(0.5),
    healers: p('M12 3h8v2.500h-1.500V11c5 4 8 8 8 12a6 6 0 0 1-6 6h-9a6 6 0 0 1-6-6c0-4 3-8 8-12V5.500H12z', CREAM) +
      p('M7.500 19c4-2 8 2 17-1 1.500 2 2 4 2 5a6 6 0 0 1-6 6h-9a6 6 0 0 1-6-6c0-1.300.6-2.700 2-4z', GREEN) + r(14.500, 19.500, 3, 8, CREAM) + r(12, 22, 8, 3, CREAM),
    chronicler: p('M4 8h17v19a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z', CREAM) + l('M8 13h9M8 17h9M8 21h5', WOOD_D, 1.500) +
      p('M29 2c-6 1-10 6-11 13l-2 6 3-1c6-2 10-8 10-18z', BLUE) + l('M27 5 15.500 23', BLUE_D, 1.400),
    steward: c(10, 11, 7, GOLD) + c(10, 11, 3, INK) + p('M14.500 13.500 28 27l-1 3h-3.500v-3h-3v-3h-3l-5-5z', GOLD) + p('M14.500 13.500 28 27l-1 1.500L13.500 15z', GOLD_D),
    chancellor: r(13, 3, 6, 9, WOOD_D, 3) + r(11, 11, 10, 5, WOOD) + p('M6 16h20v6a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z', RED) + r(6, 16, 20, 2.500, RED_D) +
      r(4, 26.500, 24, 3, CREAM_D, 1.500) + p('M16 18.500l1.100 2.300 2.400.3-1.800 1.700.5 2.500-2.200-1.300-2.200 1.300.5-2.500-1.800-1.700 2.400-.3z', GOLD),
    matchmaker: '<circle cx="11.500" cy="19" r="7" fill="none" stroke="' + GOLD + '" stroke-width="3"/><circle cx="20.500" cy="19" r="7" fill="none" stroke="' + GOLD_D + '" stroke-width="3"/>' +
      p('M11.500 3l3.500 4-3.500 5-3.500-5z', BLUE) + p('M11.500 3l3.500 4h-7z', CREAM),
    voivode: p('M6 20C6 10 10 5 16 5s10 5 10 15v2H6z', STONE) + p('M16 5c6 0 10 5 10 15v2h-10z', STONE_D) + r(4, 20, 24, 3.500, GOLD_D, 1.500) +
      p('M14.500 20v7a1.500 1.500 0 0 0 3 0v-7z', GOLD) + p('M16 5c0-3 3-4 6-3-2 .5-3 1.500-3 3z', RED),
    regency: p('M4 14 7 4l5 6 4-7 4 7 5-6 3 10z', GOLD) + r(4, 13, 24, 3.500, GOLD_D, 1.500) + c(16, 14.800, 1.600, RED) +
      p('M6 20h20c0 5-4 9-10 9S6 25 6 20z', WOOD) + l('M8 29.500h16', WOOD_D, 2) + p('M9 20c0-2 3-3 7-3s7 1 7 3z', CREAM),
    nightwatch: p('M21 2a8 8 0 1 0 8 10 6.500 6.500 0 0 1-8-10z', CREAM) + r(8, 14, 9, 14, STONE_D) + p('M6 14h3v-2.500h2.500V14h2V11.500H16V14h3v3H6z', STONE) +
      r(11, 19, 3, 4, GOLD) + r(5, 28, 15, 2.500, STONE_D, 1.200) + c(25.500, 22, 1, CREAM) + c(22, 27, .8, CREAM),

    // A deed in the chronicle.
    deed: l('M9 27C4 22 4 13 9 6M23 27c5-5 5-14 0-21', GREEN, 2) +
      p('M9 6l-4 1 2 4zM6 12l-4 2 3 3zM5.500 19l-3.500 3 4 2zM23 6l4 1-2 4zM26 12l4 2-3 3zM26.500 19l3.500 3-4 2z', GREEN) +
      p('M16 9l2.200 4.500 5 .7-3.600 3.500.9 5-4.500-2.400-4.500 2.400.9-5-3.600-3.500 5-.7z', GOLD)
  };

  function svg(name, size) {
    var s = size || 36;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="' + s + '" height="' + s + '" class="d-art" aria-hidden="true">' + (ART[name] || ART.deed) + '</svg>';
  }

  function el(name, size) {
    var box = document.createElement('span');
    box.className = 'd-pic';
    box.innerHTML = svg(name, size);
    return box;
  }

  var api = { svg: svg, el: el, names: Object.keys(ART) };
  if (typeof window !== 'undefined') window.DynastyArt = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
