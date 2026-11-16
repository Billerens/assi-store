// The drawn pictures of «Зверинец» beside the beasts themselves (art.js): the four qualities,
// upgrades, traits and events. The palette is the beasts' own (sage, sand, clay, slate), flat
// shapes, no text; a 32×32 SVG that reads at 16–44 px.  window.MenagerieIcons.el(name, size).
(function () {
  'use strict';
  var SAGE = '#8fae92';
  var SAGE_D = '#5c7560';
  var SAND = '#d0b580';
  var SAND_D = '#9a7f4e';
  var CLAY = '#c98478';
  var CLAY_D = '#8f5148';
  var SLATE = '#94a0ae';
  var SLATE_D = '#5b6673';
  var VIOLET = '#a094c0';
  var TEAL = '#79acae';
  var TEAL_D = '#4a7577';
  var GOLD = '#d6ba5e';
  var GOLD_D = '#9a8032';
  var BROWN = '#8d6b62';
  var BROWN_D = '#5e443d';
  var PALE = '#e4e2d6';
  var INK = '#1f2423';

  function p(d, fill, o) { return '<path d="' + d + '" fill="' + fill + '"' + (o ? ' opacity="' + o + '"' : '') + '/>'; }
  function r(x, y, w, h, fill, rx) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + fill + '"' + (rx ? ' rx="' + rx + '"' : '') + '/>'; }
  function c(cx, cy, rad, fill, o) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + rad + '" fill="' + fill + '"' + (o ? ' opacity="' + o + '"' : '') + '/>'; }
  function e(cx, cy, rx, ry, fill) { return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + fill + '"/>'; }
  function l(d, stroke, w) { return '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round"/>'; }
  function g(t, body) { return '<g transform="' + t + '">' + body + '</g>'; }

  var STAR = 'M16 3l3.700 8 8.800 1-6.500 6 1.800 8.700L16 22.300 8.200 26.700 10 18l-6.500-6 8.800-1z';
  var HEART = 'M16 28C7 21 3 16 3 11a6.500 6.500 0 0 1 13-2 6.500 6.500 0 0 1 13 2c0 5-4 10-13 17z';
  var SHIELD = 'M4 4h24v11c0 8-5 12-12 15C9 27 4 23 4 15z';
  function egg(x, y, s, a, b) { return g('translate(' + x + ' ' + y + ') scale(' + s + ')', p('M0-12c5 0 8 7 8 13a8 8 0 0 1-16 0c0-6 3-13 8-13z', a) + p('M0-12c5 0 8 7 8 13a8 8 0 0 1-8 8c4-5 5-14 0-21z', b)); }
  function paw(x, y, s, fill) { return g('translate(' + x + ' ' + y + ') scale(' + s + ')', e(0, 4, 6, 5, fill) + e(-7, -3, 2.600, 3.400, fill) + e(-2.500, -7, 2.600, 3.600, fill) + e(2.500, -7, 2.600, 3.600, fill) + e(7, -3, 2.600, 3.400, fill)); }

  var ART = {
    // The four qualities.
    q0: g('rotate(-35 16 16)', r(8, 14, 16, 4, SLATE) + r(4, 8, 5, 16, CLAY, 1.500) + r(23, 8, 5, 16, CLAY, 1.500) + r(1, 11, 3, 10, CLAY_D, 1.500) + r(28, 11, 3, 10, CLAY_D, 1.500)),
    q1: p('M2 20C6 9 16 3 30 3c-2 6-6 9-11 10 3 0 6 0 8-1-2 5-7 8-13 8 2 1 5 1 7 0-3 5-10 7-19 0z', TEAL) + l('M3 20c7-3 14-8 21-14M2 26h9M5 29.500h9', TEAL_D, 1.800),
    q2: p(SHIELD, SLATE) + p('M16 4h12v11c0 8-5 12-12 15z', SLATE_D) + g('translate(8 8.500) scale(0.5)', p(HEART, CLAY)),
    q3: p('M1 16c5-8 10-11 15-11s10 3 15 11c-5 8-10 11-15 11S6 24 1 16z', PALE) + c(16, 16, 7, GOLD) + p('M16 9c2 4.500 2 9.500 0 14-2-4.500-2-9.500 0-14z', INK) + c(13, 12.500, 1.500, PALE),

    // The upgrades.
    nest: p('M2 17h28c0 8-5 12-14 12S2 25 2 17z', BROWN) + l('M4 20c7 3 17 3 24 0M7 25c5 2 13 2 18 0M3 17c8-3 18-3 26 0', SAND_D, 1.500) + egg(11, 14, 0.800, PALE, SAND) + egg(20.500, 13.500, 0.850, PALE, SAND),
    aviary: r(2, 27, 28, 3, SAGE_D, 1.500) + l('M5 27V9M11 27V7M16 27V6M21 27V7M27 27V9', SAND, 2.200) + l('M3 12h26M3 21h26', SAND_D, 2.200) + p('M5 9 16 2l11 7z', CLAY),
    bedding: p('M3 20c0-4 5-6 13-6s13 2 13 6v5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z', SAND) + l('M6 20l4 2M12 18l5 2M20 20l5-2M9 25l5-1M18 25l6 1', SAND_D, 1.500) +
      l('M10 10c-1.500-2 1.500-3 0-5.500M16 10c-1.500-2 1.500-3 0-5.500M22 10c-1.500-2 1.500-3 0-5.500', CLAY, 1.800),
    feed: p('M2 17h28l-3 9a4 4 0 0 1-4 3H9a4 4 0 0 1-4-3z', SLATE) + p('M4 17c1-6 6-9 12-9s11 3 12 9z', SAND) + c(11, 13, 1.500, SAND_D) + c(16, 11.500, 1.500, SAND_D) + c(21, 13.500, 1.500, SAND_D) + c(14, 15, 1.200, SAND_D) +
      r(1, 16, 30, 3, SLATE_D, 1.500) + paw(16, 23.500, 0.350, PALE),
    training: '<circle cx="16" cy="17" r="11" fill="none" stroke="' + SAND + '" stroke-width="4"/><circle cx="16" cy="17" r="11" fill="none" stroke="' + SAND_D + '" stroke-width="1" stroke-dasharray="3 3"/>' +
      p('M16 10l5 13H11z', CLAY) + r(12.500, 17, 7, 2, PALE) + r(9, 22.500, 14, 2.500, CLAY_D, 1.200),
    vet: r(3, 10, 26, 18, PALE, 3) + l('M11 10V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3', SLATE, 2.200) + r(13.500, 13, 5, 12, CLAY, 1) + r(10, 16.500, 12, 5, CLAY, 1),
    book: p('M4 5h20a4 4 0 0 1 4 4v19H8a4 4 0 0 1-4-4z', BROWN) + p('M8 24h20v4H8a2 2 0 0 1 0-4z', PALE) + r(7, 5, 2, 19, BROWN_D) + paw(18, 14.500, 0.620, SAND),
    pedigree: l('M16 8v6M8 20v-4h16v4M16 14v2', SLATE, 2) + c(16, 6, 4.500, GOLD) + c(8, 23.500, 4.500, SAGE) + c(24, 23.500, 4.500, CLAY) + c(16, 6, 1.800, GOLD_D) + c(8, 23.500, 1.800, SAGE_D) + c(24, 23.500, 1.800, CLAY_D),
    selection: p('M2 4h28L19 17v10l-6 3V17z', TEAL) + p('M2 4h28l-3 3.500H5z', TEAL_D) + c(9, 0, 0, INK) + c(12, 9.500, 1.500, PALE) + c(18, 10.500, 1.500, GOLD) + c(15, 14, 1.300, PALE),
    luck: g('translate(16 14)', p('M0 0c-6-8-12-2-8 2 2 2 5 1 8-2z', SAGE) + g('rotate(90)', p('M0 0c-6-8-12-2-8 2 2 2 5 1 8-2z', SAGE_D)) + g('rotate(180)', p('M0 0c-6-8-12-2-8 2 2 2 5 1 8-2z', SAGE)) + g('rotate(270)', p('M0 0c-6-8-12-2-8 2 2 2 5 1 8-2z', SAGE_D))) +
      l('M16 15c1 5 3 9 7 14', SAGE_D, 2.200),
    catcher: l('M27 29 15 15', BROWN, 2.600) + '<circle cx="11" cy="11" r="9" fill="none" stroke="' + SAND + '" stroke-width="2.400"/>' + l('M5 7l12 9M4 12l11 6M8 4l9 12M13 3l5 9M3.500 9.500l8 9.500', SAND_D, 1),
    arena: e(16, 22, 14, 7, SAND_D) + e(16, 21, 12, 5.500, SAND) + l('M9 4 20 17M23 4 12 17', SLATE, 2.400) + l('M17 16.500l4.500-3M15 16.500l-4.500-3', BROWN, 2.400),
    banners: l('M6 30V3M26 30V3', BROWN, 2) + l('M6 6h20', BROWN, 1.500) + p('M7 6h6v10l-3-2.500L7 16z', CLAY) + p('M13 6h6v12l-3-2.500L13 18z', GOLD) + p('M19 6h6v10l-3-2.500L19 16z', TEAL),
    bench: r(2, 17, 28, 4, BROWN, 1.500) + r(5, 21, 3, 8, BROWN_D) + r(24, 21, 3, 8, BROWN_D) + paw(8.500, 9.500, 0.420, SAND) + paw(16, 9.500, 0.420, SAND) + paw(23.500, 9.500, 0.420, SAND) + r(2, 15, 28, 2, SAND_D, 1),
    tactician: r(3, 5, 26, 22, SAGE_D, 3) + r(5, 7, 22, 18, SAGE, 2) + l('M9 21c2-6 6-8 12-8', PALE, 1.800) + p('M24 13l-5-3v6z', PALE) + l('M8 10l4 4M12 10l-4 4', CLAY_D, 1.800) + '<circle cx="22.500" cy="20.500" r="2.500" fill="none" stroke="' + INK + '" stroke-width="1.600"/>',
    coach: p('M4 15a8 8 0 0 0 16 0v-3H4z', SLATE) + r(18, 11, 12, 5, SLATE, 1.500) + c(12, 15, 3, SLATE_D) + r(27, 11, 3, 5, SLATE_D, 1) + l('M12 23c0 4 3 6 7 6', CLAY, 1.800) + l('M7 4l1.500 3.500M12 2.500v4M17 4l-1.500 3.500', GOLD, 1.800),
    incubator: p('M4 21a12 12 0 0 1 24 0z', TEAL, 0.4) + l('M4 21a12 12 0 0 1 24 0', TEAL, 1.800) + egg(16, 17, 0.850, PALE, SAND) + r(2, 21, 28, 4, SLATE, 2) + r(6, 25, 20, 4, SLATE_D, 1) + c(10, 27, 1.200, GOLD) + c(14, 27, 1.200, CLAY) +
      l('M16 2v3M10 3.500l1 2.500M22 3.500l-1 2.500', GOLD, 1.800),
    chronicle: p('M7 4h17a3 3 0 0 1 3 3v17H10a3 3 0 0 1-3-3z', PALE) + p('M7 4a3 3 0 0 0-3 3v2h6V7a3 3 0 0 0-3-3zM27 24a3 3 0 0 1-6 0v-1h-11v1a3 3 0 0 0 3 3h11a3 3 0 0 0 3-3z', SAND) +
      l('M13 9h10M13 13h10M13 17h6', BROWN, 1.500),
    double: egg(11, 18, 0.950, PALE, SAND) + egg(21, 18, 0.950, SAND, SAND_D) + p('M16 1l1.200 3 3 1.200-3 1.200-1.200 3-1.200-3-3-1.200 3-1.200z', GOLD),
    keeper: p('M16 2l10 13h-5l7 10H4l7-10H6z', SAGE) + p('M16 2l10 13h-5l7 10H16z', SAGE_D) + r(14.500, 25, 3, 5, BROWN) + g('translate(9.500 13) scale(0.400)', p(SHIELD, GOLD)),

    // The traits.
    tireless: p('M18 2 7 18h7l-3 12 14-18h-8z', GOLD) + p('M18 2 7 18h7z', PALE, 0.5),
    trickster: p('M3 9c4-3 8-3 13 0 5-3 9-3 13 0 0 8-3 14-8 14-2 0-3-2-5-2s-3 2-5 2c-5 0-8-6-8-14z', VIOLET) + p('M7 13c2-1.500 4-1.500 6 0-1 2.500-5 2.500-6 0zM19 13c2-1.500 4-1.500 6 0-1 2.500-5 2.500-6 0z', INK) + l('M12 18.500c2 1.500 6 1.500 8 0', INK, 1.500),
    longlife: r(6, 2, 20, 3, BROWN, 1.500) + r(6, 27, 20, 3, BROWN, 1.500) + p('M8 5h16c0 6-4 8-6 11 2 3 6 5 6 11H8c0-6 4-8 6-11-2-3-6-5-6-11z', PALE, 0.35) +
      p('M10.500 9h11c-1 3-3.500 4.500-5.500 7-2-2.500-4.500-4-5.500-7z', SAND) + p('M10 27c1-3 4-4 6-5 2 1 5 2 6 5z', SAND) + l('M16 16v5', SAND, 1.500),
    fertile: egg(9, 21, 0.650, PALE, SAND) + egg(16, 15, 0.800, PALE, SAND) + egg(23, 21, 0.650, PALE, SAND) + p('M16 1c2 1 3 2.500 3 4-2 0-3-.5-3-2-0 1.500-1 2-3 2 0-1.500 1-3 3-4z', SAGE),
    albino: paw(16, 17, 1.150, PALE) + c(16, 21.500, 2.200, CLAY, 0.7),
    glow: c(16, 16, 12, GOLD, 0.25) + c(16, 16, 7.500, GOLD, 0.5) + c(16, 16, 4, PALE) + c(5, 7, 1.500, GOLD) + c(27, 9, 1.200, GOLD) + c(7, 26, 1.200, GOLD) + c(26, 25, 1.500, GOLD),
    leader: p('M3 24 5 8l6 7 5-9 5 9 6-7 2 16z', GOLD) + r(3, 23, 26, 4, GOLD_D, 1.500) + c(16, 19, 2, CLAY) + c(9, 20, 1.300, PALE) + c(23, 20, 1.300, PALE),
    stubborn: p('M10 30c-2-6-1-12 6-12s8 6 6 12z', BROWN) + '<path d="M11 16C5 16 2 12 3 8s6-5 8-2-1 5-3 4" fill="none" stroke="' + SAND + '" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M21 16c6 0 9-4 8-8s-6-5-8-2 1 5 3 4" fill="none" stroke="' + SAND + '" stroke-width="3" stroke-linecap="round"/>' + c(13, 23, 1.200, INK) + c(19, 23, 1.200, INK),
    keen: '<circle cx="16" cy="16" r="11" fill="none" stroke="' + TEAL + '" stroke-width="2.400"/>' + l('M16 1v7M16 24v7M1 16h7M24 16h7', TEAL, 2.400) + c(16, 16, 4.500, PALE) + c(16, 16, 2, INK),
    resilient: p(HEART, CLAY) + p('M16 28C7 21 3 16 3 11a6.500 6.500 0 0 1 6-6.500C6 9 8 18 16 28z', CLAY_D) + g('rotate(-35 16 15)', r(7, 12, 18, 6, PALE, 2) + l('M14 13.500v3M18 13.500v3', SAND_D, 1.300)),
    vigorous: p('M16 1c7 6 11 11 11 17a11 11 0 0 1-22 0c0-4 2-7 4-9 0 3 1 5 3 6 0-6 1-10 4-14z', CLAY) + p('M16 14c3 3 5 5.500 5 8a5 5 0 0 1-10 0c0-1.500.6-2.800 1.500-3.800.3 1.500 1 2.300 2 2.300 0-2.500.3-4.500 1.500-6.500z', GOLD),

    // The events.
    circus: p('M16 3 3 14v14h26V14z', CLAY) + p('M16 3l-5 25h10z', PALE) + p('M3 14c2 2 4 2 6 0 2 2 4 2 7 0 3 2 5 2 7 0 2 2 4 2 6 0v3H3z', PALE) + p('M14 28c0-4 1-6 2-6s2 2 2 6z', INK) + l('M16 3V0', BROWN, 1.500) + p('M16 0l5 1.500-5 1.500z', GOLD),
    guest: p('M1 30c0-8 4-12 8-12 1-5 5-8 9-8s7 3 8 7c3 1 5 5 5 13z', SAGE_D) + p('M1 30c1-5 3-7 6-7 2-4 5-6 8-6s6 2 8 5c3 0 6 3 8 8z', SAGE) + c(13, 21.500, 1.600, GOLD) + c(19, 21.500, 1.600, GOLD) + p('M10 12l2-6 3 5zM22 12l-2-6-3 5z', BROWN),
    fair: c(11, 20, 9, GOLD_D) + c(11, 19, 9, GOLD) + c(22, 12, 8, GOLD_D) + c(22, 11, 8, GOLD) + paw(22, 11.500, 0.420, GOLD_D) + paw(11, 19.500, 0.480, GOLD_D),
    illness: g('rotate(40 16 16)', r(13, 2, 6, 20, PALE, 3) + c(16, 25, 5.500, PALE) + c(16, 25, 3.500, CLAY) + r(14.700, 10, 2.600, 14, CLAY) + l('M19 6h-2.500M19 10h-2.500', SLATE_D, 1.200)),
    strong: egg(16, 18, 1.250, PALE, SAND) + g('translate(9 10) scale(0.440)', p(STAR, GOLD)),
    trophy: p('M9 3h14v9a7 7 0 0 1-14 0z', GOLD) + l('M9 6H4c0 5 2 7 6 8M23 6h5c0 5-2 7-6 8', GOLD_D, 2) + r(14.500, 19, 3, 5, GOLD_D) + r(9, 24, 14, 4, BROWN, 1.500) + p('M16 3h7v9a7 7 0 0 1-7 7z', GOLD_D, 0.5)
  };

  function svg(name, size) {
    var s = size || 36;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="' + s + '" height="' + s + '" class="m-icon" aria-hidden="true">' + (ART[name] || ART.strong) + '</svg>';
  }

  function el(name, size) {
    var box = document.createElement('span');
    box.className = 'm-pic';
    box.innerHTML = svg(name, size);
    return box;
  }

  var api = { svg: svg, el: el, names: Object.keys(ART) };
  if (typeof window !== 'undefined') window.MenagerieIcons = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
