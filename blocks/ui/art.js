// The drawn pictures of «Блоки» for the shop: one for each of the twenty upgrades. Built from the
// game's own cells (soft slate tones, a gold accent); flat shapes, no text; a 32×32 SVG that reads
// at 28–44 px.  window.BlocksArt.el(name, size) → <span><svg>
(function () {
  'use strict';
  var SLATE = '#9fb4c6';
  var SLATE_D = '#657889';
  var LAV = '#b9aed2';
  var LAV_D = '#7d7299';
  var MINT = '#9fc4b6';
  var MINT_D = '#5f8a7b';
  var ROSE = '#cfa0a0';
  var ROSE_D = '#93605f';
  var SAND = '#cdbf9f';
  var SAND_D = '#8f8264';
  var GOLD = '#e2c468';
  var GOLD_D = '#a58a35';
  var EMPTY = '#34373d';
  var FRAME = '#62666e';
  var PALE = '#e6e8ec';
  var INK = '#1f2125';

  function p(d, fill, o) { return '<path d="' + d + '" fill="' + fill + '"' + (o ? ' opacity="' + o + '"' : '') + '/>'; }
  function r(x, y, w, h, fill, rx) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + fill + '"' + (rx ? ' rx="' + rx + '"' : '') + '/>'; }
  function c(cx, cy, rad, fill, o) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + rad + '" fill="' + fill + '"' + (o ? ' opacity="' + o + '"' : '') + '/>'; }
  function l(d, stroke, w) { return '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round"/>'; }
  function g(t, body) { return '<g transform="' + t + '">' + body + '</g>'; }

  /** A cell of the field: a rounded square with a lighter top edge. */
  function cell(x, y, s, a, b) { return r(x, y, s, s, b, 1.500) + r(x, y, s, s - 1.500, a, 1.500); }
  function grid(x, y, s, n, fill) {
    var out = '';
    for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) out += r(x + j * (s + 1), y + i * (s + 1), s, s, fill, 1);
    return out;
  }
  var SPARK = 'M0-5l1.300 3.700L5 0 1.300 1.300 0 5l-1.300-3.700L-5 0l3.700-1.300z';
  function spark(x, y, s, fill) { return g('translate(' + x + ' ' + y + ') scale(' + s + ')', p(SPARK, fill)); }

  var ART = {
    rotate: cell(11, 9, 6, SLATE, SLATE_D) + cell(11, 16, 6, SLATE, SLATE_D) + cell(18, 16, 6, SLATE, SLATE_D) + l('M5 13a12 12 0 0 1 20-7M27 19a12 12 0 0 1-20 7', GOLD, 2.200) + p('M26 2v6h-6zM6 30v-6h6z', GOLD),
    bomb: c(14, 19, 10, FRAME) + c(14, 19, 10, INK, 0.350) + c(10.500, 15.500, 2.500, PALE, 0.5) + r(16.500, 6, 5, 4, SLATE_D, 1) + l('M19 6c1-3 4-4 7-3', SAND, 1.800) + spark(27, 3.500, 0.700, GOLD),
    slot: p('M3 14h26v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z', SAND_D) + r(3, 12, 26, 4, SAND, 1.500) + cell(9, 3, 6, LAV, LAV_D) + cell(16, 3, 6, LAV, LAV_D) + cell(16, 10, 6, LAV, LAV_D) + r(11, 20, 10, 3, INK, 1.500),
    reroll: cell(3, 3, 7, ROSE, ROSE_D) + cell(22, 3, 7, MINT, MINT_D) + cell(12.500, 22, 7, SLATE, SLATE_D) + l('M12 7h7M24 13l-4 7M10 13l3 6', GOLD, 2) + p('M20 4l3.500 3-3.500 3zM22 22l-4-1 3-3.500zM9.500 22l-.5-4.500 4 2z', GOLD),
    undo: cell(18, 17, 9, SLATE, SLATE_D) + r(18, 6, 9, 9, EMPTY, 1.500) + l('M15 10H7M7 10l4-4M7 10l4 4', GOLD, 2.400) + l('M7 10c-1 8 3 13 9 13', GOLD, 2.400),
    eraser: g('rotate(-40 16 16)', r(4, 10, 24, 12, ROSE, 2.500) + r(4, 10, 9, 12, PALE, 2.500) + r(11, 10, 2, 12, ROSE_D)) + r(3, 27, 26, 2.500, FRAME, 1.200) + spark(26, 6, 0.600, PALE),
    hammer: r(2, 22, 6, 6, MINT, 1) + r(9, 22, 6, 6, MINT, 1) + r(16, 22, 6, 6, MINT, 1) + r(23, 22, 6, 6, MINT, 1) + g('rotate(35 17 10)', r(15.500, 6, 3, 15, SAND_D, 1.500) + r(9, 1, 16, 7, SLATE_D, 1.500) + r(9, 1, 16, 2.500, SLATE, 1.500)),
    ruler: r(2, 2, 6, 6, LAV, 1) + r(2, 9, 6, 6, LAV, 1) + r(2, 16, 6, 6, LAV, 1) + r(2, 23, 6, 6, LAV, 1) + r(14, 2, 10, 28, GOLD, 1.500) + l('M14 6h4M14 10h6M14 14h4M14 18h6M14 22h4M14 26h6', GOLD_D, 1.400),
    streak: p('M16 1c7 6 11 11 11 17a11 11 0 0 1-22 0c0-4 2-7 4-9 0 3 1 5 3 6 0-6 1-10 4-14z', ROSE) + p('M16 13c3.500 3.500 5.500 6 5.500 9a5.500 5.500 0 0 1-11 0c0-1.800.7-3 1.700-4 .3 1.600 1.100 2.500 2.200 2.500 0-2.700.3-5 1.600-7.500z', GOLD),
    mint: r(5, 22, 22, 6, GOLD_D, 3) + r(5, 20, 22, 6, GOLD, 3) + r(7, 14, 18, 6, GOLD_D, 3) + r(7, 12, 18, 6, GOLD, 3) + r(9, 6, 14, 6, GOLD_D, 3) + r(9, 4, 14, 6, GOLD, 3) + l('M13 7h6M11 15h10M9 23h14', GOLD_D, 1.200),
    preview: p('M1 12c5-7 10-10 15-10s10 3 15 10c-5 7-10 10-15 10S6 19 1 12z', PALE) + c(16, 12, 6, SLATE_D) + c(16, 12, 2.800, INK) + c(14, 10, 1.300, PALE) + cell(6, 24, 6, MINT, MINT_D) + cell(13, 24, 6, LAV, LAV_D) + cell(20, 24, 6, ROSE, ROSE_D),
    second: grid(2, 2, 6, 4, EMPTY) + r(9, 9, 13, 13, INK, 1) + p('M16 27c-7-5-10-8.500-10-12a5 5 0 0 1 10-1.500A5 5 0 0 1 26 15c0 3.500-3 7-10 12z', ROSE) + r(14.700, 13, 2.600, 9, PALE, 1) + r(11.500, 16.200, 9, 2.600, PALE, 1),
    lucky: g('translate(15 14)', p('M0 0c-6-8-12-2-8 2 2 2 5 1 8-2z', MINT) + g('rotate(90)', p('M0 0c-6-8-12-2-8 2 2 2 5 1 8-2z', MINT_D)) + g('rotate(180)', p('M0 0c-6-8-12-2-8 2 2 2 5 1 8-2z', MINT)) + g('rotate(270)', p('M0 0c-6-8-12-2-8 2 2 2 5 1 8-2z', MINT_D))) +
      l('M15 15c1 5 3 9 6 13', MINT_D, 2.200) + cell(22, 20, 7, GOLD, GOLD_D),
    color: cell(2, 12, 6, LAV, LAV_D) + cell(9, 12, 6, LAV, LAV_D) + cell(16, 12, 6, LAV, LAV_D) + cell(23, 12, 6, LAV, LAV_D) + spark(8, 6, 0.800, GOLD) + spark(24, 25, 0.900, GOLD) + spark(18, 5, 0.450, PALE) + spark(10, 25, 0.450, PALE),
    gold: cell(4, 12, 16, GOLD, GOLD_D) + p('M7 15h6l-6 6z', PALE, 0.5) + g('rotate(40 23 10)', r(21.700, 5, 2.600, 20, SAND_D, 1.300) + p('M13 6c6-5 14-5 20 0-6-2-14-2-20 0z', SLATE)) + spark(8, 6, 0.550, PALE),
    hint: p('M16 2a9 9 0 0 1 5 16.500V22H11v-3.500A9 9 0 0 1 16 2z', GOLD) + p('M16 2a9 9 0 0 1 5 16.500V22h-5z', GOLD_D, 0.450) + r(11, 22.500, 10, 2.500, FRAME, 1) + r(12.500, 25.500, 7, 2.500, FRAME, 1) +
      r(13, 9, 6, 6, PALE, 1) + l('M3 6l2.500 1.500M29 6l-2.500 1.500M1.500 13H4M28 13h2.500', GOLD, 1.600),
    workshop: '<circle cx="13" cy="19" r="7" fill="none" stroke="' + SLATE + '" stroke-width="4"/>' + l('M13 8v3M13 27v3M2 19h3M21 19h3M5.200 11.200l2.200 2.200M18.600 24.600l2.200 2.200M20.800 11.200l-2.200 2.200M7.400 24.600l-2.200 2.200', SLATE, 3) + c(13, 19, 2, SLATE_D) +
      g('rotate(40 24 9)', r(22.500, 6, 3, 14, GOLD, 1.500) + p('M20 1h3v4h2V1h3v6a4 4 0 0 1-8 0z', GOLD)),
    wide: l('M3 20l5-8 5 8', ROSE, 3) + l('M19 20l5-8 5 8', ROSE, 3) + l('M12 23c2 3 6 3 8 0', GOLD, 2.200) + r(13.500, 13, 5, 5, EMPTY, 1) + l('M3 27h26', FRAME, 2),
    cutter: cell(3, 18, 7, MINT, MINT_D) + cell(11, 18, 7, MINT, MINT_D) + cell(22, 18, 7, MINT, MINT_D) + l('M19.500 15v14', GOLD, 1.600) + c(13, 5, 3, FRAME) + c(26, 5, 3, FRAME) + c(13, 5, 1.200, INK) + c(26, 5, 1.200, INK) +
      l('M15 7l6 7M24 7l-6 7', PALE, 2),
    clean: r(15, 6, 2.500, 24, SAND_D, 1) + p('M17.500 6h11l-3 4.500 3 4.500h-11z', MINT) + p('M17.500 6h11l-1.500 2.200h-9.500z', PALE, 0.4) + spark(8, 9, 1.100, GOLD) + spark(6, 21, 0.650, PALE) + spark(26, 23, 0.650, GOLD) + r(10, 29, 12, 2, FRAME, 1)
  };

  function svg(name, size) {
    var s = size || 36;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="' + s + '" height="' + s + '" class="b-art" aria-hidden="true">' + (ART[name] || ART.hint) + '</svg>';
  }

  function el(name, size) {
    var box = document.createElement('span');
    box.className = 'b-pic';
    box.innerHTML = svg(name, size);
    return box;
  }

  /** The picture of the lobby: a piece of the field with a line about to burn and a figure in the air. */
  function hero() {
    var map = ['.......', '..LL...', '...L...', '.......', 'S..M.RR', 'SS.MMRR', 'GGGGGGG'];
    var tone = { S: [SLATE, SLATE_D], M: [MINT, MINT_D], R: [ROSE, ROSE_D], L: [LAV, LAV_D], G: [GOLD, GOLD_D] };
    var out = '<rect x="1" y="1" width="110" height="110" rx="8" fill="' + INK + '" stroke="' + FRAME + '" stroke-width="1.500"/>';
    for (var i = 0; i < 7; i++) {
      for (var j = 0; j < 7; j++) {
        var x = 6 + j * 14.500;
        var y = 6 + i * 14.500;
        var t = tone[map[i].charAt(j)];
        out += t ? r(x, y, 13, 13, t[1], 2.500) + r(x, y, 13, 11, t[0], 2.500) : r(x, y, 13, 13, EMPTY, 2.500);
      }
    }
    out += spark(104, 98, 1.500, PALE) + spark(9, 99, 1, PALE);
    var box = document.createElement('span');
    box.className = 'b-hero';
    box.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 112" class="b-art" aria-hidden="true">' + out + '</svg>';
    return box;
  }

  var api = { svg: svg, el: el, hero: hero, names: Object.keys(ART) };
  if (typeof window !== 'undefined') window.BlocksArt = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
