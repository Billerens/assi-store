// The drawn pictures of «Эволюция»: the eight stages, producers, roles, worlds, epochs, the physical
// constants, mutations, laws of nature, events and the discoveries of the civilization. One muted natural palette, flat shapes, no text;
// every picture is a 32×32 SVG that reads at 24–44 px.  window.EvoArt.el(name, size) → <span><svg>.
(function () {
  'use strict';
  var SAND = '#d3c49c';
  var SAND_D = '#9c8a62';
  var TEAL = '#7fc0ac';
  var TEAL_D = '#4b8676';
  var GREEN = '#a3c47a';
  var GREEN_D = '#5f8748';
  var WATER = '#74b1cf';
  var DEEP = '#3d6c8a';
  var CORAL = '#e0917a';
  var CORAL_D = '#a8563f';
  var ROSE = '#cf7d96';
  var VIOLET = '#ada0dc';
  var VIOLET_D = '#6c5fa3';
  var STONE = '#9a9ea8';
  var STONE_D = '#5d616c';
  var AMBER = '#e8bd5c';
  var AMBER_D = '#b0832a';
  var CREAM = '#efe8d6';
  var INK = '#22262a';

  function p(d, fill, o) { return '<path d="' + d + '" fill="' + fill + '"' + (o ? ' opacity="' + o + '"' : '') + '/>'; }
  function r(x, y, w, h, fill, rx) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + fill + '"' + (rx ? ' rx="' + rx + '"' : '') + '/>'; }
  function c(cx, cy, rad, fill, o) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + rad + '" fill="' + fill + '"' + (o ? ' opacity="' + o + '"' : '') + '/>'; }
  function e(cx, cy, rx, ry, fill) { return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + fill + '"/>'; }
  function l(d, stroke, w) { return '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round"/>'; }
  function ring(cx, cy, rad, stroke, w) { return '<circle cx="' + cx + '" cy="' + cy + '" r="' + rad + '" fill="none" stroke="' + stroke + '" stroke-width="' + (w || 2) + '"/>'; }
  function g(t, body) { return '<g transform="' + t + '">' + body + '</g>'; }

  var BOLT = 'M18 2 8 17h6l-3 13 13-18h-7z';
  var STAR = 'M16 3l2.600 7.400L26 13l-7.400 2.600L16 23l-2.600-7.400L6 13l7.400-2.600z';
  var WAVES = 'M0 24c3-2.500 5-2.500 8 0s5 2.500 8 0 5-2.500 8 0 5 2.500 8 0v8H0z';
  var FISH = 'M3 16c4-6 11-7 17-3l7-5v16l-7-5c-6 4-13 3-17-3z';
  var LEAF = 'M5 27C4 14 12 5 27 5c0 15-9 23-22 22z';

  function planet(a, b, extra) { return c(16, 16, 12, a) + p('M16 4a12 12 0 0 1 0 24 16 16 0 0 0 0-24z', b) + (extra || ''); }
  function cell(x, y, rad, a, b) { return c(x, y, rad, a) + c(x, y, rad * 0.4, b); }
  function small(body, x, y, s) { return g('translate(' + x + ' ' + y + ') scale(' + s + ')', body); }

  var ART = {};

  // ---- the eight stages ----
  ART.stage1 = e(16, 21, 14, 8, SAND_D) + e(16, 20, 12, 6, AMBER) + c(11, 19, 2.200, CREAM) + c(18, 21.500, 1.600, CREAM) + c(21, 18, 1.200, CREAM) +
    c(9, 9, 2, SAND) + c(16, 5, 2.800, SAND) + c(23, 10, 1.800, SAND);
  ART.stage2 = c(16, 16, 13, TEAL_D) + c(16, 16, 11, TEAL) + c(13, 14, 5, TEAL_D) + c(12, 13, 2, CREAM) + c(22, 20, 1.800, CREAM) + c(21, 11, 1.300, TEAL_D);
  ART.stage3 = cell(10, 11, 6.500, GREEN, GREEN_D) + cell(22, 11, 6.500, GREEN, GREEN_D) + cell(10, 22, 6.500, GREEN, GREEN_D) + cell(22, 22, 6.500, GREEN, GREEN_D) + c(16, 16.500, 4.500, CREAM);
  ART.stage4 = p('M0 10c3-2.500 5-2.500 8 0s5 2.500 8 0 5-2.500 8 0 5 2.500 8 0v22H0z', DEEP) + small(p(FISH, WATER) + c(9, 15, 1.500, INK), 4, 10, 0.800) +
    l('M1 7c3-2.500 5-2.500 8 0s5 2.500 8 0 5-2.500 8 0 4 2 6 .5', WATER, 2);
  ART.stage5 = p('M0 30c2-9 8-13 15-13s14 5 17 13z', GREEN_D) + p('M10 30c2-5 6-7 11-7s9 3 11 7z', GREEN) + r(15, 12, 2, 8, SAND_D) +
    p('M16 2l7 9h-4l5 6H8l5-6H9z', GREEN) + c(26, 6, 3, AMBER);
  ART.stage6 = p('M3 28 13 8l10 20z', SAND_D) + p('M13 8l4 20H9z', SAND) + l('M11 5l2 3 2-3', SAND_D, 1.500) +
    p('M25 29c-3 0-4.500-2-4.500-4 0-3 3-4 3.500-8 3 2 5.500 5 5.500 8 0 2-1.500 4-4.500 4z', CORAL) + p('M25 29c-1.500 0-2.300-1-2.300-2.300 0-1.500 1.500-2.200 2.300-4.200 1.200 1.200 2.300 2.700 2.300 4.200 0 1.300-.8 2.300-2.300 2.300z', AMBER) +
    l('M20 30h10', STONE_D, 2);
  ART.stage7 = p('M2 12 16 3l14 9z', CREAM) + r(4, 12, 24, 2.500, SAND) + r(6, 15, 3.500, 11, CREAM) + r(14.200, 15, 3.500, 11, CREAM) + r(22.500, 15, 3.500, 11, CREAM) +
    r(3, 26, 26, 3, SAND_D, 1) + c(16, 8.500, 1.800, AMBER);
  ART.stage8 = c(15, 17, 9, VIOLET) + p('M15 8a9 9 0 0 1 0 18 12 12 0 0 0 0-18z', VIOLET_D) +
    '<ellipse cx="15" cy="17" rx="14" ry="4.500" fill="none" stroke="' + CREAM + '" stroke-width="2" transform="rotate(-20 15 17)"/>' +
    p('M26 2l1 3 3 1-3 1-1 3-1-3-3-1 3-1z', AMBER) + c(5, 5, 1, CREAM);

  // ---- producers: the broth ----
  ART.lightning = p('M4 12a6 6 0 0 1 7-6 7 7 0 0 1 13 1 5 5 0 0 1 3 9H7a4 4 0 0 1-3-4z', STONE) + small(p(BOLT, AMBER), 6, 12, 0.650);
  ART.spring = e(16, 26, 13, 4, DEEP) + e(16, 25.500, 10, 2.500, WATER) + l('M11 21c-2-3 2-5 0-8s2-5 0-8M16 22c-2-3 2-5 0-8s2-5 0-9M21 21c-2-3 2-5 0-8s2-5 0-8', CREAM, 2);
  ART.clay = p('M1 29c2-6 6-9 11-9 4 0 5-4 9-4 5 0 8 6 10 13z', CORAL_D) + p('M4 29c2-4 5-6 9-6 4 0 5-3 8-3 4 0 6 4 8 9z', CORAL) +
    l('M9 26h6M18 23h6', CORAL_D, 1.500) + p('M0 12c3-2 5-2 8 0s5 2 8 0 5-2 8 0 5 2 8 0v3c-3 2-5 2-8 0s-5-2-8 0-5 2-8 0-5-2-8 0z', WATER);
  ART.membrane = p('M16 2c6 8 10 13 10 18a10 10 0 0 1-20 0c0-5 4-10 10-18z', TEAL) + p('M16 8c4 5.500 6 9 6 12a6 6 0 0 1-12 0c0-3 2-6.500 6-12z', TEAL_D) + c(14, 20, 2, CREAM);

  // ---- the cell ----
  ART.mitosis = cell(10.500, 16, 8.500, TEAL, TEAL_D) + cell(21.500, 16, 8.500, TEAL, TEAL_D) + l('M16 5v4M16 23v4', CREAM, 1.800);
  ART.medium = p('M3 14h26c0 8-5 14-13 14S3 22 3 14z', STONE_D) + p('M5 16h22c-.5 6-4.500 10-11 10S5.500 22 5 16z', AMBER) + r(2, 12, 28, 3, STONE, 1.500) +
    c(11, 20, 1.800, CREAM) + c(17, 22, 1.300, CREAM) + c(21, 19, 1.500, CREAM) + p('M16 2c2 2.500 3 4 3 5.500a3 3 0 0 1-6 0c0-1.500 1-3 3-5.500z', AMBER);

  // ---- the multicellular ----
  ART.colony = cell(16, 8, 5.500, GREEN, GREEN_D) + cell(8, 16, 5.500, GREEN, GREEN_D) + cell(24, 16, 5.500, GREEN, GREEN_D) + cell(11, 25, 5.500, GREEN, GREEN_D) + cell(21, 25, 5.500, GREEN, GREEN_D) + c(16, 17, 3.500, CREAM);
  ART.sponge = p('M9 30c-3-8-3-17 0-24 1-3 13-3 14 0 3 7 3 16 0 24z', AMBER) + e(16, 6, 6.500, 2.500, AMBER_D) +
    c(12, 13, 1.800, AMBER_D) + c(19, 12, 1.400, AMBER_D) + c(16, 18, 2, AMBER_D) + c(11, 22, 1.400, AMBER_D) + c(20, 23, 1.800, AMBER_D) + c(21, 17, 1.100, AMBER_D);
  ART.jelly = p('M4 16C4 8 9 3 16 3s12 5 12 13c-2-1.500-4-1.500-6 0-2-1.500-4-1.500-6 0-2-1.500-4-1.500-6 0-2-1.500-4-1.500-6 0z', ROSE) + p('M8 13c0-4 3-7 6-8-2 2-3 5-3 8z', CREAM, 0.6) +
    l('M8 18c-2 4 2 6 0 11M13 18c-2 4 2 6 0 11M19 18c2 4-2 6 0 11M24 18c2 4-2 6 0 11', ROSE, 1.800);
  ART.worm = l('M4 24c0-8 8-8 8-2s8 6 8-2-1-10 6-12', CORAL, 6) + l('M4 24c0-8 8-8 8-2s8 6 8-2-1-10 6-12', CORAL_D, 1) + c(26.500, 7.500, 1.200, INK) +
    l('M6.500 18.500l2.500 1.500M12 23h3M20 21h-3M20.500 12.500l3 1', CORAL_D, 1.300);
  ART.swimmer = p('M2 16c5-8 14-9 20-3l7-6c1 6 1 12 0 18l-7-6c-6 6-15 5-20-3z', WATER) + p('M10 10c3-4 6-5 9-4l-3 5z', DEEP) + c(8, 15, 1.800, INK) + l('M14 13c1 2 1 4 0 6', DEEP, 1.500);

  // ---- the ocean ----
  ART.algae = l('M9 30c-3-6 3-9 0-15s3-8 1-12M16 30c3-6-3-9 0-15s-2-6 0-10M23 30c-3-6 3-9 0-14s2-6 1-9', GREEN_D, 3.500) +
    l('M9 30c-3-6 3-9 0-15s3-8 1-12M16 30c3-6-3-9 0-15s-2-6 0-10M23 30c-3-6 3-9 0-14s2-6 1-9', GREEN, 1.400) + e(16, 30, 13, 2, SAND_D);
  ART.herbivores = p('M3 16c3-8 12-10 19-5l7-5v20l-7-5c-7 5-16 3-19-5z', TEAL) + p('M12 9c2-3 5-4 8-3l-3 5z', TEAL_D) + c(9, 14.500, 1.800, INK) +
    l('M5 19c1.500 1 3 1 4 0', TEAL_D, 1.300) + l('M15 13v6M18.500 12.500v7', TEAL_D, 1.500);
  ART.predators = p('M1 18c6-8 14-10 22-6l7-6-2 9 2 8-7-5c-8 5-16 4-22 0z', STONE) + p('M12 10l4-8 3 9z', STONE_D) + p('M1 18c6 3 12 3 16 0l-1 3-2-2-2 3-2-3-2 3-2-3z', CREAM) +
    c(8, 14.500, 1.400, INK) + p('M1 18c6 4 14 5 22 0-8 5-16 4-22 0z', STONE_D);

  // ---- the civilization ----
  ART.settlement = r(1, 27, 30, 2.500, GREEN_D, 1.200) + p('M2 27 9 13l7 14z', SAND) + p('M9 13l3 14H6z', SAND_D) + p('M15 27l7-16 8 16z', SAND) + p('M22 11l3 16h-6z', SAND_D) +
    l('M8 10l1 3 1-3M21 8l1 3 1-3', SAND_D, 1.300) + c(14, 25, 1.800, CORAL);
  ART.town = r(1, 27, 30, 2.500, STONE_D, 1.200) + r(3, 17, 10, 10, CREAM) + p('M1 18 8 10l7 8z', CORAL) + r(15, 8, 7, 19, SAND) + p('M14 9l4.500-6 4.500 6z', CORAL_D) +
    r(23, 19, 7, 8, CREAM) + p('M22 20l4.500-5 4.500 5z', CORAL) + r(6.500, 21, 3, 6, SAND_D) + r(17, 12, 3, 3, DEEP) + r(17, 18, 3, 3, DEEP) + r(25, 22, 3, 3, DEEP);
  ART.academy = r(1, 27, 30, 2.500, STONE_D, 1.200) + p('M6 14a10 10 0 0 1 20 0z', WATER) + p('M16 4a10 10 0 0 1 10 10H16z', DEEP) + r(15.300, 1, 1.400, 4, AMBER_D) +
    r(4, 14, 24, 2.500, SAND) + r(6, 16.500, 3, 10.500, CREAM) + r(11.500, 16.500, 3, 10.500, CREAM) + r(17.500, 16.500, 3, 10.500, CREAM) + r(23, 16.500, 3, 10.500, CREAM);
  ART.metropolis = r(1, 27, 30, 2.500, STONE_D, 1.200) + r(3, 13, 7, 14, STONE) + r(11, 4, 8, 23, WATER) + p('M11 4l4-3 4 3z', DEEP) + r(20, 10, 9, 17, VIOLET) +
    r(13, 7, 1.500, 2, CREAM) + r(15.800, 7, 1.500, 2, CREAM) + r(13, 12, 1.500, 2, CREAM) + r(15.800, 12, 1.500, 2, CREAM) + r(13, 17, 1.500, 2, CREAM) + r(15.800, 17, 1.500, 2, CREAM) +
    r(5, 16, 3, 2, AMBER) + r(5, 21, 3, 2, AMBER) + r(22, 13, 2, 2, CREAM) + r(25.500, 13, 2, 2, CREAM) + r(22, 18, 2, 2, CREAM) + r(25.500, 18, 2, 2, CREAM);

  // ---- the roles of the tribe ----
  ART.gatherers = p('M4 15h24l-3 12a3 3 0 0 1-3 2H10a3 3 0 0 1-3-2z', SAND_D) + l('M9 15c0-9 14-9 14 0', SAND_D, 2.200) + l('M11 20v6M16 20v6M21 20v6', SAND, 1.500) +
    c(11, 13, 3, ROSE) + c(17, 12, 3.300, CORAL) + c(22, 13.500, 2.600, ROSE) + r(3, 14, 26, 3, SAND, 1.500);
  ART.hunters = l('M8 3c12 3 16 14 16 26', SAND_D, 2.600) + l('M8 3l16 26', CREAM, 1) + l('M3 24 27 9', STONE_D, 2) + p('M27 9l-6 .5 3.500 4.500z', STONE) + l('M3 24l1-4M3 24l4 1', CORAL, 1.800);
  ART.crafters = g('rotate(-35 16 16)', r(14.500, 8, 3, 22, SAND_D, 1.500) + p('M7 3h18l-2 9H9z', STONE) + p('M7 3h18l-.7 3H7.700z', CREAM, 0.7) + l('M12.500 9l7 3M19.500 9l-7 3', SAND, 1.500));
  ART.keepers = r(13, 12, 6, 18, SAND_D, 1.500) + l('M13 18h6M13 23h6', SAND, 1.500) + p('M16 1c4 3 6 6 6 9a6 6 0 0 1-12 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3 0-5 2-8z', CORAL) +
    p('M16 7c2 1.500 3 3 3 4.500a3 3 0 0 1-6 0c0-1.500 1-3 3-4.500z', AMBER) + r(9, 28, 14, 2.500, STONE_D, 1.200);

  // ---- the worlds ----
  ART['planet-near'] = planet(STONE, STONE_D, c(11, 12, 3, STONE_D) + c(18, 20, 2.200, STONE) + c(12, 21, 1.500, STONE_D) + c(20, 10, 1.500, STONE));
  ART['planet-ocean'] = planet(WATER, DEEP, l('M6 13c3-2 5 2 8 0s5-2 7 0M8 20c3-2 5 2 8 0s4-1 6 0', CREAM, 1.500));
  ART['planet-stone'] = planet(CORAL, CORAL_D, l('M9 9l4 5-2 4 5 3M21 8l-2 5 4 3', INK, 1.300) + c(22, 21, 2, CORAL));
  ART['planet-garden'] = planet(WATER, DEEP, p('M8 10c3-3 7-2 8 1s-2 4-1 7-4 4-7 2-3-7 0-10z', GREEN) + p('M20 9c2 0 5 2 6 5-2 1-4 0-5-2z', GREEN_D) + p('M19 20c2-1 5 0 5 2s-3 4-5 3z', GREEN));
  ART['planet-remote'] = c(16, 16, 9, VIOLET) + p('M16 7a9 9 0 0 1 0 18 12 12 0 0 0 0-18z', VIOLET_D) +
    '<ellipse cx="16" cy="16" rx="15" ry="4.500" fill="none" stroke="' + SAND + '" stroke-width="2.200" transform="rotate(-18 16 16)"/>';
  ART['planet-frontier'] = planet(STONE_D, INK, p('M6.500 9.500A12 12 0 0 1 16 4a12 12 0 0 1 9.500 5.500C22 8 10 8 6.500 9.500z', AMBER)) + p('M26 3l.9 2.600L29.500 6.500l-2.600.9L26 10l-.9-2.600-2.600-.9 2.600-.9z', CREAM) + c(5, 26, 1, CREAM) + c(28, 22, .8, CREAM);

  // ---- the epochs of the civilization (a discovery carries the picture of its epoch) ----
  ART['epoch-bronze'] = g('rotate(40 16 16)', r(14.500, 5, 3, 25, SAND_D, 1.500) + p('M5 5c4-3 18-3 22 0-1 5-5 8-11 8S6 10 5 5z', AMBER) + p('M5 5c4-3 18-3 22 0-4 1.500-18 1.500-22 0z', CREAM, 0.6));
  ART['epoch-iron'] = p('M2 9h21c3 0 6 1 8 3-4 0-6 2-7 5h-9c-1-4-6-6-13-8z', STONE) + r(11, 17, 10, 5, STONE_D) + p('M6 29l3-7h14l3 7z', STONE) + p('M2 9h21c3 0 6 1 8 3H12z', CREAM, 0.5);
  ART['epoch-sails'] = p(WAVES, DEEP) + p('M4 20h24l-4 6H8z', SAND_D) + r(15, 2, 2, 18, STONE_D) + p('M17 3c6 3 9 8 9 15h-9z', CREAM) + p('M15 6c-5 3-7 7-7 12h7z', SAND);
  ART['epoch-steam'] = ring(14, 20, 6.500, STONE, 4) + l('M14 10v3M14 27v3M4 20h3M21 20h3M7 13l2 2M19 25l2 2M21 13l-2 2M9 25l-2 2', STONE, 3) + c(14, 20, 2, STONE_D) +
    c(24, 8, 4, CREAM) + c(19, 5, 3, CREAM) + c(27, 4, 2.500, CREAM, 0.7);
  ART['epoch-electricity'] = p('M16 2a9 9 0 0 1 5 16.500V22H11v-3.500A9 9 0 0 1 16 2z', AMBER) + p('M16 2a9 9 0 0 1 5 16.500V22h-5z', AMBER_D, 0.5) + l('M13 13l3 3 3-3M16 16v6', CREAM, 1.500) +
    r(11, 22.500, 10, 2.500, STONE, 1) + r(12, 25.500, 8, 2.500, STONE_D, 1) + r(14, 28.500, 4, 2, STONE);
  ART['epoch-atom'] = '<g fill="none" stroke="' + WATER + '" stroke-width="1.800"><ellipse cx="16" cy="16" rx="14" ry="5.500"/><ellipse cx="16" cy="16" rx="14" ry="5.500" transform="rotate(60 16 16)"/><ellipse cx="16" cy="16" rx="14" ry="5.500" transform="rotate(120 16 16)"/></g>' +
    c(16, 16, 3.500, CORAL) + c(30, 16, 1.600, CREAM) + c(9, 3.900, 1.600, CREAM) + c(9, 28.100, 1.600, CREAM);
  ART['epoch-network'] = l('M16 6 6 13l3 12h14l3-12zM16 6v10M6 13l10 3M26 13l-10 3M9 25l7-9M23 25l-7-9', TEAL_D, 1.600) + c(16, 6, 3, TEAL) + c(6, 13, 3, TEAL) + c(26, 13, 3, TEAL) +
    c(9, 25, 3, TEAL) + c(23, 25, 3, TEAL) + c(16, 16, 3.500, CREAM);
  ART['epoch-stellar-memory'] = p('M16 1l5 9-5 21-5-21z', VIOLET) + p('M16 1l5 9-5 21z', VIOLET_D) + p('M11 10h10l-5 4z', CREAM, 0.7) +
    p('M5 5l.9 2.600L8.500 8.500l-2.600.9L5 12l-.9-2.600L1.500 8.500l2.600-.9zM27 16l.9 2.600 2.600.9-2.600.9L27 23l-.9-2.600-2.600-.9 2.600-.9z', AMBER);
  ART['epoch-far-horizon'] = p('M0 32a16 16 0 0 1 32 0z', DEEP) + p('M3 32a13 13 0 0 1 26 0z', INK) + l('M0 32a16 16 0 0 1 32 0', WATER, 1.500) + small(p(STAR, AMBER), 6.400, -1, 0.600) +
    l('M16 16v6', AMBER, 1.500) + c(5, 6, 1, CREAM) + c(27, 8, 1.200, CREAM);

  // ---- the physical constants ----
  ART.gravity = c(16, 22, 8, STONE_D) + p('M16 14a8 8 0 0 1 0 16 11 11 0 0 0 0-16z', INK, 0.5) + l('M16 2v8M6 4l4 7M26 4l-4 7', AMBER, 2) + p('M16 13l-3-4h6zM11.500 13.500l-4-2.500 4.500-2zM20.500 13.500l4-2.500-4.500-2z', AMBER);
  ART.light = c(9, 16, 5, CREAM) + c(9, 16, 7.500, AMBER, 0.45) + l('M17 16h13M16 10l11-5M16 22l11 5', AMBER, 2.200) + p('M30 16l-5-3v6z', AMBER);
  ART.ocean = planet(WATER, DEEP, l('M5 12c3-2 5 2 8 0s5-2 8 0 4 1 6 0M4.500 18c3-2 5 2 8 0s5-2 8 0 4 1 7-.5M7 24c3-2 5 2 8 0s5-2 9 0', CREAM, 1.500));
  ART.radiation = c(16, 16, 14, AMBER) + '<g fill="' + INK + '">' + p('M16 16 9.500 4.700a13 13 0 0 1 13 0z', INK) + g('rotate(120 16 16)', p('M16 16 9.500 4.700a13 13 0 0 1 13 0z', INK)) + g('rotate(240 16 16)', p('M16 16 9.500 4.700a13 13 0 0 1 13 0z', INK)) + '</g>' +
    c(16, 16, 4, AMBER) + c(16, 16, 2.200, INK);
  ART.cold = l('M16 2v28M3.900 9l24.200 14M3.900 23 28.100 9', WATER, 2.200) + l('M12.500 4.500l3.500 3 3.500-3M12.500 27.500l3.500-3 3.500 3M4 13.500l4.500-1.500-1-4.500M28 18.500l-4.500 1.500 1 4.500M4 18.500l4.500 1.500-1 4.500M28 13.500l-4.500-1.500 1-4.500', CREAM, 1.600) + c(16, 16, 2.500, CREAM);
  ART.broth = p('M2 13h28c0 9-5 16-14 16S2 22 2 13z', SAND_D) + e(16, 13, 14, 4, AMBER) + c(11, 12.500, 2, CREAM, 0.8) + c(18, 14, 1.500, CREAM, 0.8) + c(22, 12, 1.200, CREAM, 0.8) +
    l('M10 8c-1.500-2 1.500-3 0-5M16 8c-1.500-2 1.500-3 0-5M22 8c-1.500-2 1.500-3 0-5', SAND, 1.600);
  ART.slow = r(6, 2, 20, 3, SAND_D, 1.500) + r(6, 27, 20, 3, SAND_D, 1.500) + p('M8 5h16c0 6-4 8-6 11 2 3 6 5 6 11H8c0-6 4-8 6-11-2-3-6-5-6-11z', CREAM, 0.35) +
    p('M10.500 9h11c-1 3-3.500 4.500-5.500 7-2-2.500-4.500-4-5.500-7z', AMBER) + p('M10 27c1-3 4-4 6-5 2 1 5 2 6 5z', AMBER) + l('M16 16v5', AMBER, 1.500);
  ART.chemistry = p('M12 2h8v3h-1.500v6l8 13a4 4 0 0 1-3.500 6H9a4 4 0 0 1-3.500-6l8-13V5H12z', CREAM, 0.4) + p('M10.500 19h11l3.500 5.500A3 3 0 0 1 22.500 29h-13A3 3 0 0 1 7 24.500z', TEAL) +
    c(13, 23, 1.600, CREAM) + c(18, 25, 1.200, CREAM) + c(17, 21, 1, CREAM) + r(11.500, 2, 9, 2.500, STONE, 1.200);
  ART.suns = c(11, 13, 7, AMBER) + c(11, 13, 4.500, CREAM, 0.6) + c(22, 21, 5.500, CORAL) + c(22, 21, 3.300, AMBER, 0.6) + l('M11 2v2M2 13h1.500M4.500 6.500l1.200 1.200M17.500 6.500l-1.200 1.200M29.500 21H31M22 29v1.500', AMBER, 1.800);
  ART.moonless = planet(TEAL, TEAL_D) + '<circle cx="25" cy="7" r="4.500" fill="none" stroke="' + STONE + '" stroke-width="1.600" stroke-dasharray="2.200 2.200"/>';
  ART.compact = c(16, 16, 4.500, VIOLET) + l('M3 3l7 7M29 3l-7 7M3 29l7-7M29 29l-7-7', VIOLET, 2.200) + p('M12 12 6.500 11l4.500-4.500zM20 12l5.500-1L21 6.500zM12 20l-5.500 1 4.500 4.500zM20 20l5.500 1-4.500 4.500z', VIOLET) + c(16, 16, 2, CREAM);
  ART.ancient = c(16, 16, 12, CORAL_D) + c(16, 16, 9, CORAL) + c(13, 13, 4, AMBER, 0.7) + c(20, 20, 2, CORAL_D) + c(21, 11, 1.500, CORAL_D) + c(4, 5, 1, CREAM) + c(28, 27, 1.200, CREAM) + c(27, 4, .8, CREAM);
  ART.constant = c(16, 16, 12, VIOLET_D) + small(p(STAR, CREAM), 4, 4.500, 0.750);

  // ---- the mutations ----
  ART.flagellum = cell(11, 12, 8, TEAL, TEAL_D) + l('M17 18c4 0 2 5 6 5s2 5 6 5', TEAL, 2.500);
  ART.chloroplast = e(16, 16, 13, 8.500, GREEN_D) + e(16, 16, 11, 6.500, GREEN) + l('M9 13v6M13 12v8M17 12v8M21 12.500v7', GREEN_D, 2);
  ART.eyespot = p('M1 16c5-8 10-11 15-11s10 3 15 11c-5 8-10 11-15 11S6 24 1 16z', CREAM) + c(16, 16, 7, CORAL) + c(16, 16, 3.500, INK) + c(13.500, 13.500, 1.500, CREAM);
  ART.fin = p('M3 27C5 13 13 5 27 3c-3 9-5 17-5 24z', WATER) + l('M9 26c2-8 7-14 14-19M15 27c1-7 4-12 9-17', DEEP, 1.500) + l('M2 28h22', DEEP, 2.500);
  ART.gills = p('M3 16c3-9 14-13 26-8v16c-12 5-23 1-26-8z', WATER) + l('M13 9c3 4 3 10 0 14M18 8.500c3 4 3 11 0 15M23 8c3 5 3 11 0 16', CORAL, 2) + c(7.500, 15, 1.500, INK);
  ART.lungs = r(15, 2, 2, 11, CREAM) + l('M16 12l-4 4M16 12l4 4', CREAM, 2) + p('M13 9c-6 1-10 7-10 15 0 5 2 6 5 5s6-3 6-8z', ROSE) + p('M19 9c6 1 10 7 10 15 0 5-2 6-5 5s-6-3-6-8z', ROSE) + l('M8 18l3 3M24 18l-3 3', CORAL_D, 1.500);
  ART.scales = '<g stroke="' + INK + '" stroke-width="1.200">' + c(8, 24, 6, TEAL_D) + c(16, 24, 6, TEAL_D) + c(24, 24, 6, TEAL_D) + c(12, 17, 6, TEAL) + c(20, 17, 6, TEAL) +
    c(8, 10, 6, TEAL_D) + c(16, 10, 6, TEAL_D) + c(24, 10, 6, TEAL_D) + '</g>' + c(6.500, 8.500, 1.500, CREAM, 0.6) + c(14.500, 8.500, 1.500, CREAM, 0.6) + c(22.500, 8.500, 1.500, CREAM, 0.6);
  ART.feather = p('M28 2C15 3 7 10 6 22l-3 7 6-3c12-1 19-9 19-24z', CREAM) + p('M28 2C22 9 14 17 6 25l3 1c12-1 19-9 19-24z', SAND) + l('M26 5 4 28', SAND_D, 1.500) + l('M12 13v6M17 9v6M22 6v5', SAND_D, 1.200);
  ART['warm-blood'] = p('M16 2c7 9 10 14 10 19a10 10 0 0 1-20 0c0-5 3-10 10-19z', CORAL) + p('M16 12c3 3 5 6 5 9a5 5 0 0 1-10 0c0-1.500.6-2.600 1.500-3.500.2 1.500.9 2.500 2 2.500 0-3 0-5 1.500-8z', AMBER);
  ART['shelled-egg'] = p('M16 2c6 0 10 9 10 16a10 10 0 0 1-20 0c0-7 4-16 10-16z', CREAM) + p('M16 2c6 0 10 9 10 16a10 10 0 0 1-10 10c5-5 7-17 0-26z', SAND) + l('M9 15l3 3 3-3 3 3 3-3 3 3', SAND_D, 1.500);
  ART.schooling = small(p(FISH, WATER) + c(8, 15, 1.800, INK), 1, -2, 0.550) + small(p(FISH, TEAL) + c(8, 15, 1.800, INK), 12, 6, 0.600) + small(p(FISH, WATER) + c(8, 15, 1.800, INK), 2, 15, 0.550);
  ART['tail-rudder'] = p('M2 16c6-3 11-3 15 0l11-12c2 8 2 16 0 24L17 16c-4 3-9 3-15 0z', WATER) + l('M19 16l8-7M19 16l8 7M18 16h10', DEEP, 1.500);
  ART['night-vision'] = p('M22 2a9 9 0 1 0 8 13 7 7 0 0 1-8-13z', CREAM) + p('M1 21c4-5 8-7 12-7s8 2 12 7c-4 5-8 7-12 7s-8-2-12-7z', INK) + c(13, 21, 5, AMBER) + p('M13 16.500c1.300 3 1.300 6 0 9-1.300-3-1.300-6 0-9z', INK);
  ART.echolocation = c(5, 16, 3.500, VIOLET) + l('M11 10c3 3.500 3 8.500 0 12M16 6.500c5 5.500 5 13.500 0 19M21.500 3c7 7.500 7 18.500 0 26', VIOLET, 2.200);
  ART.venom = p('M6 2h20c0 9-3 16-10 20C9 18 6 11 6 2z', CREAM) + p('M16 2h10c0 9-3 16-10 20z', SAND) + p('M16 23c2.500 3 3.500 4.500 3.500 6a3.500 3.500 0 0 1-7 0c0-1.500 1-3 3.500-6z', GREEN);
  ART.mimicry = p(LEAF, GREEN) + l('M5 27 22 10', GREEN_D, 1.500) + c(17, 12, 2.500, CREAM) + c(17, 12, 1.200, INK) + l('M12 20l-3-5M16 16l-1-6M12 20l6 1', GREEN_D, 1.200);
  ART.symbiosis = c(12, 16, 9, TEAL) + c(20, 16, 9, AMBER, 0.85) + p('M16 8a9 9 0 0 1 0 16 9 9 0 0 1 0-16z', CREAM);
  ART.hibernation = l('M16 16c0-2 3-2 3 0s-5 4-7 0 3-9 8-7 7 9 3 13-13 3-15-4 4-15 12-14', SAND, 3) + c(25, 6, 2, CREAM) + c(29, 2.500, 1.200, CREAM);
  ART['grasping-hand'] = p('M8 30V17l-4-5c-1-2 1.500-3.500 3-2l3 3V5a2 2 0 0 1 4 0v7-9a2 2 0 0 1 4 0v9-7a2 2 0 0 1 4 0v8-4a2 2 0 0 1 4 0v10c0 4-2 6-4 9z', SAND) + l('M14 12v4M18 12v4M22 13v3', SAND_D, 1.300);
  ART.cilia = cell(16, 16, 9, TEAL, TEAL_D) + l('M16 3v4M16 25v4M3 16h4M25 16h4M6.800 6.800l2.800 2.800M22.400 22.400l2.800 2.800M25.200 6.800l-2.800 2.800M9.600 22.400l-2.800 2.800', TEAL, 2);
  ART['nerve-net'] = l('M16 16 6 6M16 16l11-8M16 16 5 24M16 16l10 10M16 16V3', VIOLET_D, 1.800) + c(16, 16, 5, VIOLET) + c(6, 6, 3, VIOLET) + c(27, 8, 3, VIOLET) + c(5, 24, 3, VIOLET) + c(26, 26, 3, VIOLET) + c(16, 3.500, 2.500, VIOLET) + c(16, 16, 2, CREAM);
  ART.skeleton = g('rotate(-45 16 16)', r(13.500, 6, 5, 20, CREAM, 2) + c(12.500, 5.500, 4, CREAM) + c(19.500, 5.500, 4, CREAM) + c(12.500, 26.500, 4, CREAM) + c(19.500, 26.500, 4, CREAM) + r(15, 9, 2, 14, SAND, 1));
  ART['oxygen-blood'] = e(16, 16, 14, 10, CORAL_D) + e(16, 16, 12, 8, CORAL) + e(16, 16, 6, 3.500, CORAL_D) + c(26, 6, 3, CREAM) + c(29.500, 11, 1.600, CREAM);
  ART.bilateral = p('M15 4C8 5 3 10 4 17s6 11 11 11z', TEAL) + p('M17 4c7 1 12 6 11 13s-6 11-11 11z', TEAL_D) + l('M16 1v30', CREAM, 1.500) + c(10, 13, 2, CREAM) + c(22, 13, 2, CREAM);
  ART.regeneration = l('M26 16a10 10 0 1 1-4-8', GREEN, 3) + p('M19 3l8 3-4 7z', GREEN) + p('M16 10c3 3 4 5 4 7a4 4 0 0 1-8 0c0-2 1-4 4-7z', CORAL);
  ART['sexual-reproduction'] = l('M10 2c0 7 12 7 12 14S10 23 10 30', ROSE, 2.600) + l('M22 2c0 7-12 7-12 14s12 7 12 14', WATER, 2.600) + l('M11.500 6h9M11.500 26h9M12 12.500h8M12 19.500h8', CREAM, 1.500);
  ART.homeostasis = l('M16 6v20', STONE, 2.200) + l('M4 11h24', STONE, 2.200) + c(16, 6, 2.500, CREAM) + p('M1 20h10a5 5 0 0 1-10 0z', WATER) + p('M21 20h10a5 5 0 0 1-10 0z', CORAL) + l('M6 11l-4 9M6 11l4 9M26 11l-4 9M26 11l4 9', STONE, 1.200) + r(10, 26, 12, 3, STONE_D, 1.500);
  ART.photosynthesis = c(23, 9, 5, AMBER) + l('M23 1v1.500M31 9h-1.500M28.600 3.400l-1 1M17.400 3.400l1 1M28.600 14.600l-1-1', AMBER, 1.800) + small(p(LEAF, GREEN) + l('M5 27 20 12', GREEN_D, 2), -1, 7, 0.800);
  ART.shell = p('M3 22C3 12 9 5 17 5s12 6 12 13c0 5-4 9-9 9H3z', SAND) + l('M17 5c-3 6-4 13-3 22M17 5c2 6 3 14 1 22M17 5c5 5 8 12 7 20M17 5C10 9 7 16 7 26', SAND_D, 1.500) + r(2, 25.500, 20, 3, SAND_D, 1.500);
  ART['double-generation'] = cell(10, 11, 7.500, ROSE, CREAM) + cell(22, 21, 7.500, ROSE, CREAM) + l('M19 5h8v8M13 27H5v-8', CREAM, 2) + p('M27 5l-4 0 4 4zM5 27l4 0-4-4z', CREAM);
  ART.mutation = l('M10 2c0 7 12 7 12 14S10 23 10 30', TEAL, 2.600) + l('M22 2c0 7-12 7-12 14s12 7 12 14', GREEN, 2.600) + l('M11.500 6h9M11.500 26h9M12 12.500h8M12 19.500h8', CREAM, 1.500);

  // ---- the laws of nature: a stage with a mark, and the special ones ----
  function marked(base, mark) { return small(base, 0, 0, 0.840) + c(25, 25, 7, INK) + mark; }
  var UP = l('M21.500 26l3.500-4 3.500 4M21.500 29.500l3.500-4 3.500 4', AMBER, 1.800);
  var COG = ring(25, 25, 3, TEAL, 2) + l('M25 19.500v2M25 28.500v2M19.500 25h2M28.500 25h2M21.100 21.100l1.400 1.400M27.500 27.500l1.400 1.400M28.900 21.100l-1.400 1.400M22.500 27.500l-1.400 1.400', TEAL, 1.600);
  for (var i = 1; i <= 8; i++) ART['law-stage' + i] = marked(ART['stage' + i], UP);
  ART['law-auto-broth'] = marked(ART.stage1, COG);
  ART['law-auto-cell'] = marked(ART.stage2, COG);
  ART['law-auto-mutation'] = marked(ART.mutation, COG);
  ART['law-auto-land'] = marked(ART.stage5, COG);
  ART['law-offline'] = p('M20 2a12 12 0 1 0 10 18A10 10 0 0 1 20 2z', CREAM) + ring(11, 21, 8, AMBER, 2) + c(11, 21, 7, INK) + l('M11 16.500V21l3 2', AMBER, 1.800);
  ART['law-memory'] = p('M9 8h14v18a4 4 0 0 1-4 4h-6a4 4 0 0 1-4-4z', WATER, 0.35) + r(8, 3, 16, 5, STONE, 1.500) + small(ART.mutation, 8, 10, 0.500) + l('M9 8h14v18a4 4 0 0 1-4 4h-6a4 4 0 0 1-4-4z', WATER, 1.500);
  ART['law-four-cards'] = g('rotate(-24 16 26)', r(11, 5, 10, 15, STONE_D, 2)) + g('rotate(-8 16 26)', r(11, 5, 10, 15, STONE, 2)) + g('rotate(8 16 26)', r(11, 5, 10, 15, SAND, 2)) +
    g('rotate(24 16 26)', r(11, 5, 10, 15, CREAM, 2) + small(p(STAR, AMBER_D), 11.200, 7, 0.300));
  ART['law-four-universes'] = c(9, 9, 6.500, VIOLET) + c(23, 9, 6.500, WATER) + c(9, 23, 6.500, CORAL) + c(23, 23, 6.500, AMBER) +
    c(7.500, 7.500, 2, CREAM, 0.7) + c(21.500, 7.500, 2, CREAM, 0.7) + c(7.500, 21.500, 2, CREAM, 0.7) + c(21.500, 21.500, 2, CREAM, 0.7);
  ART.law = c(16, 16, 12, STONE_D) + small(p(STAR, AMBER), 4, 4.500, 0.750);

  // ---- the events ----
  ART['event-lightning'] = p(BOLT, AMBER) + p('M18 2 8 17h6z', CREAM, 0.5);
  ART['event-volcano'] = p('M2 30 12 12h8l10 18z', STONE_D) + p('M12 12h8l3 6-4-2-3 4-3-5-3 3z', CORAL) + c(16, 6, 3.500, STONE) + c(21, 3.500, 2.500, STONE, 0.7) + c(11, 4, 2, STONE, 0.7) + l('M14 12l-1-3M18 12l1-3', AMBER, 1.800);
  ART['event-virus'] = l('M16 2v6M16 24v6M2 16h6M24 16h6M6 6l4.500 4.500M21.500 21.500 26 26M26 6l-4.500 4.500M10.500 21.500 6 26', ROSE, 2) + c(16, 16, 8.500, ROSE) + c(16, 2.500, 2, ROSE) + c(16, 29.500, 2, ROSE) + c(2.500, 16, 2, ROSE) + c(29.500, 16, 2, ROSE) +
    c(13, 14, 2, CREAM) + c(19, 18, 1.500, CREAM) + c(18, 12, 1, CREAM);
  ART['event-bloom'] = p(WAVES, DEEP) + c(8, 16, 4, GREEN) + c(17, 13, 5, GREEN) + c(25, 17, 3.500, GREEN) + c(12, 21, 3, GREEN_D) + c(21, 21, 3.500, GREEN_D) + c(17, 13, 2, CREAM, 0.6);
  ART['event-ice'] = p('M2 30 10 8l5 9 4-13 11 26z', WATER) + p('M10 8l5 9-4 13H2zM19 4l4 26h-7z', CREAM, 0.75) + p('M0 27h32v5H0z', DEEP);
  ART['event-meteor'] = l('M30 2 17 15M26 9l-8 8M22 2l-8 9', AMBER, 2.200) + c(11, 21, 8, STONE_D) + c(11, 21, 8, CORAL, 0.45) + c(8.500, 19, 2, INK, 0.5) + c(13.500, 24, 1.500, INK, 0.5);
  ART['event-migration'] = l('M3 26c5-12 14-18 26-18', SAND, 2.200) + p('M29 8l-7-3 1.500 7z', SAND) + c(6, 27, 1.800, CREAM) + c(11, 20.500, 1.800, CREAM) + c(17.500, 15.500, 1.800, CREAM) +
    e(8, 30, 4, 1.200, SAND_D) + e(22, 24, 5, 1.300, SAND_D);
  ART['event-drought'] = c(22, 8, 5, AMBER) + l('M22 0v1.500M30 8h-1.500M27.700 2.300l-1 1M16.300 2.300l1 1', AMBER, 1.800) + p('M0 19h32v13H0z', SAND_D) + l('M5 19l3 5-3 4M8 24l6 1 2 6M14 25l3-6M20 19l2 6 6 2M22 25l-2 6', INK, 1.400);
  ART['event-wanderer'] = c(14, 6, 4, SAND) + p('M8 30l2-15c0-3 8-3 8 0l2 15z', SAND_D) + p('M7 11c4-3 10-3 14 0l-2 2c-3-2-7-2-10 0z', CORAL_D) + l('M24 8v22', SAND, 2) + c(24, 7, 2, AMBER);
  ART['event-wheel'] = ring(16, 16, 11.500, SAND_D, 4) + l('M16 5v22M5 16h22M8.200 8.200l15.600 15.600M23.800 8.200 8.200 23.800', SAND_D, 2) + c(16, 16, 3.500, SAND);
  ART['event-comet'] = p('M30 2 12 14l6 6z', WATER, 0.6) + p('M30 2 14 16l4 4z', CREAM, 0.8) + c(11, 21, 6.500, WATER) + c(11, 21, 3.500, CREAM) + c(26, 24, 1, CREAM) + c(4, 6, 1, CREAM);
  ART['event-plague'] = p('M6 14C6 7 10 3 16 3s10 4 10 11c0 4-2 6-3 8v4H9v-4c-1-2-3-4-3-8z', CREAM) + c(11.500, 14, 3, INK) + c(20.500, 14, 3, INK) + p('M16 17l2 4h-4z', INK) + l('M12.500 26v3M16 26v3M19.500 26v3', INK, 1.500);
  ART['event-signal'] = p('M5 27 15 10l9 9z', STONE) + l('M19.500 14.500 24 10', STONE_D, 2) + c(24.500, 9.500, 2, AMBER) + l('M21 3c4 0 8 4 8 8M19 7.500c3 0 5.500 2.500 5.500 5.500', AMBER, 1.800) + r(3, 27, 14, 3, STONE_D, 1.500);
  ART['event-tide'] = c(23, 7, 5, CREAM) + c(25, 5.500, 4.500, INK) + p('M0 20c4-6 9-7 13-3 2 2 2 5 0 6 5 0 8-4 12-4 3 0 5 2 7 4v9H0z', WATER) + p('M0 26c3-2 5-2 8 0s5 2 8 0 5-2 8 0 5 2 8 0v6H0z', DEEP);
  ART['event-fossil'] = c(16, 16, 13, SAND_D) + l('M16 16c0-2 3-2 3 0s-5 4-7 0 3-9 8-7 7 9 3 13-13 3-15-4', CREAM, 2.200) + l('M22 9.500l3-3M26 15h3.500M24 21.500l3 2.500', CREAM, 1.500);
  ART.event = small(p(STAR, AMBER), 0, 0, 1) + c(16, 13, 3, CREAM);

  // ---- the discoveries of the civilization: one picture each, four per epoch ----
  function dash(d, stroke, w) { return '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-dasharray="1 4"/>'; }
  var SPARK = 'M0 -4l1 3 3 1-3 1-1 3-1-3-3-1 3-1z';
  function spark(x, y, fill, s) { return g('translate(' + x + ' ' + y + ') scale(' + (s || 1) + ')', p(SPARK, fill)); }
  // bronze
  ART['disc-bronze-tools'] = l('M8 28 20 10', SAND_D, 3) + p('M15 4c6-1 11 2 13 8l-8 3-7-7z', AMBER) + p('M15 4c6-1 11 2 13 8l-3 1c-2-4-6-7-11-7z', CREAM, 0.6) + l('M5 14l6 2M4 20h5', SAND, 1.600);
  ART['disc-irrigation'] = r(2, 19, 28, 11, GREEN_D, 2) + l('M5 23h7M5 27h7M20 23h7M20 27h7', GREEN, 1.800) + l('M16 3v11M16 14l-9 7M16 14l9 7M16 14v15', WATER, 3) + c(16, 4, 2.500, CREAM);
  ART['disc-writing'] = r(6, 4, 18, 24, SAND, 3) + r(6, 4, 18, 5, SAND_D, 3) + l('M10 13h10M10 17.500h6M10 22h10', SAND_D, 1.800) + l('M21 20l7 8', STONE_D, 2.400) + p('M19.500 18.500l3 .5-.5 2.500z', INK);
  ART['disc-trade-routes'] = dash('M6 24C9 8 22 24 26 8', CREAM, 2) + c(6, 24, 4, CORAL) + c(6, 24, 1.600, CREAM) + c(26, 8, 4, AMBER) + c(26, 8, 1.600, CREAM) + p('M13 26h8l-1.500-6h-5z', SAND) + r(15, 17, 4, 3, SAND_D, 1);
  // iron
  ART['disc-iron-forge'] = p('M3 13h24c0 3-3 5-8 5v4h5v5H8v-5h5v-4C8 18 3 16 3 13z', STONE) + p('M3 13h24c0 1-1 2-2 2.500H5c-1-.5-2-1.500-2-2.500z', CREAM, 0.5) + r(8, 25, 16, 2, STONE_D) + spark(22, 6, AMBER, 1.200) + spark(11, 7, CORAL, 0.8);
  ART['disc-roads'] = p('M0 30V19l9-6 4 17zM32 30V17l-9-5-4 18z', GREEN_D) + p('M11 30 14.500 4h3L21 30z', STONE) + l('M16 7v3M16 14v4M16 22v5', CREAM, 1.600) + c(26, 6, 3, AMBER);
  ART['disc-watermill'] = r(19, 9, 11, 15, SAND, 1) + p('M17.500 10 24.500 4l7 6z', CORAL_D) + ring(13, 17, 9, SAND_D, 2.500) + l('M13 8v18M4 17h18M6.600 10.600l12.800 12.800M19.400 10.600 6.600 23.400', SAND_D, 1.600) + c(13, 17, 2, CREAM) + p(WAVES, WATER);
  ART['disc-geometry'] = l('M4 27h23L4 7z', CREAM, 2.200) + l('M4 22h5v5', SAND, 1.600) + ring(21, 11, 6, AMBER, 2) + c(21, 11, 1.300, AMBER) + l('M21 11l4.200-4.200', AMBER, 1.600);
  // sails
  ART['disc-keel'] = p(WAVES, DEEP) + p('M3 13h26c-1 6-5 9-13 9S4 19 3 13z', SAND_D) + p('M3 13h26l-1 3H4z', SAND) + p('M13 22h6l-1 8h-4z', STONE) + l('M16 13V3', STONE_D, 2) + p('M17.500 3l8 8h-8z', CREAM);
  ART['disc-compass'] = c(16, 16, 13, SAND_D) + c(16, 16, 10.500, INK) + p('M16 6.500l3.500 9.500h-7z', CORAL) + p('M16 25.500l3.500-9.500h-7z', CREAM) + c(16, 16, 1.800, AMBER) + l('M16 1v2', SAND, 2.400);
  ART['disc-printing'] = l('M6 29V5h20v24', SAND_D, 3) + r(14.500, 5, 3, 9, STONE) + l('M10 9h12', STONE, 2.400) + r(9, 14, 14, 3.500, STONE_D, 1) + r(9, 20, 14, 8, CREAM, 1) + l('M12 23h8M12 25.500h5', STONE_D, 1.200);
  ART['disc-observatory'] = p('M4 22a12 12 0 0 1 24 0z', STONE) + p('M16 10a12 12 0 0 1 12 12H16z', STONE_D, 0.6) + p('M14.500 10.500h3.500l1.500 11.500h-6.500z', INK) + l('M17 16l8-10', CREAM, 3) + r(3, 22, 26, 7, SAND_D, 1) + spark(7, 7, AMBER, 1);
  // steam
  ART['disc-steam-engine'] = r(3, 13, 19, 11, STONE, 5.500) + r(6, 5, 4.500, 9, STONE_D) + c(8, 3.500, 2.500, CREAM) + c(13, 2.500, 1.800, CREAM, 0.7) + l('M7 18h11', STONE_D, 1.600) + l('M19 20h6', AMBER, 2.400) + ring(25, 22, 5, AMBER, 2.200) + c(25, 22, 1.500, CREAM) + r(2, 26, 22, 3, STONE_D, 1);
  ART['disc-railway'] = l('M9 28h14M10 22h12M11.200 16h9.600M12.200 10.500h7.600M13 6h6', SAND_D, 2.600) + l('M9.500 30 14 3M22.500 30 18 3', STONE, 2.200) + c(16, 3, 1.500, AMBER);
  ART['disc-machine-tools'] = ring(12, 19, 6, STONE, 3.600) + l('M12 9.500v3M12 25.500v3M2.500 19h3M18.500 19h3M5.300 12.300l2.100 2.100M16.600 23.600l2.100 2.100M18.700 12.300l-2.100 2.100M7.400 23.600l-2.100 2.100', STONE, 3) + c(12, 19, 2, CREAM) +
    l('M25 3v25M25 3h5M25 11h4', AMBER, 2.400) + l('M26.500 16h2M26.500 20h2M26.500 24h2', CREAM, 1.200);
  ART['disc-public-laboratory'] = p('M9.500 21h13l3.200 5.500c1 1.800 0 3-2 3H8.300c-2 0-3-1.200-2-3z', TEAL) + l('M12.500 3h7M13.500 3v9L6.300 26.500c-1 1.800 0 3 2 3h15.400c2 0 3-1.200 2-3L18.500 12V3', CREAM, 1.800) + c(13, 25, 1.300, CREAM) + c(18, 23.500, 1, CREAM) + c(16, 17, 1.200, TEAL);
  // electricity
  ART['disc-generator'] = ring(16, 16, 12, STONE, 3) + p('M9 10h6v12H9z', CORAL) + p('M17 10h6v12h-6z', WATER) + r(9, 10, 6, 3, CREAM) + r(17, 10, 6, 3, CREAM) + small(p(BOLT, AMBER), 9.600, 22, 0.4);
  ART['disc-power-grid'] = l('M16 3 9 29M16 3l7 26M10.600 22h10.800M12.400 15h7.200M5 9h22M9 9l7-6 7 6', STONE, 1.800) + c(5, 9, 1.800, AMBER) + c(27, 9, 1.800, AMBER) + l('M1 13c2 1.500 3 1.500 4-4M31 13c-2 1.500-3 1.500-4-4', AMBER, 1.300);
  ART['disc-radio'] = l('M16 13v16M10.500 29 16 15l5.500 14M12.500 24h7', STONE, 2) + c(16, 10, 2.800, CORAL) + l('M10 5a8.500 8.500 0 0 0 0 10M22 5a8.500 8.500 0 0 1 0 10M6 2a14 14 0 0 0 0 16M26 2a14 14 0 0 1 0 16', AMBER, 1.700);
  ART['disc-antibiotics'] = g('rotate(-40 16 16)', r(3, 10.500, 26, 11, CREAM, 5.500) + p('M16 10.500h7.500a5.500 5.500 0 0 1 0 11H16z', CORAL) + l('M7 13.500h6', STONE, 1.400)) + spark(6, 7, TEAL, 1) + spark(26, 26, TEAL, 0.8);
  // atom
  ART['disc-reactor'] = p('M7 29c3.500-8 3.500-17 1.500-25h15c-2 8-2 17 1.500 25z', STONE) + p('M16 4h7.500c-2 8-2 17 1.500 25H16z', STONE_D, 0.6) + c(16, 17, 6, INK) + c(16, 17, 2.200, AMBER) +
    '<g fill="none" stroke="' + TEAL + '" stroke-width="1.200"><ellipse cx="16" cy="17" rx="5.500" ry="2.200" transform="rotate(45 16 17)"/><ellipse cx="16" cy="17" rx="5.500" ry="2.200" transform="rotate(-45 16 17)"/></g>';
  ART['disc-semiconductor'] = l('M11.500 4v5M16 4v5M20.500 4v5M11.500 23v5M16 23v5M20.500 23v5M4 11.500h5M4 16h5M4 20.500h5M23 11.500h5M23 16h5M23 20.500h5', AMBER, 1.800) + r(8, 8, 16, 16, TEAL_D, 2.500) + r(11.500, 11.500, 9, 9, TEAL, 1.500) + c(11, 11, 1, CREAM);
  ART['disc-satellite'] = g('rotate(-35 16 16)', r(1, 13.500, 10, 5, WATER, 1) + r(21, 13.500, 10, 5, WATER, 1) + l('M4.500 13.500v5M7.500 13.500v5M24.500 13.500v5M27.500 13.500v5', DEEP, 1) + r(11.500, 11, 9, 10, CREAM, 2) + c(16, 16, 2.200, AMBER) + l('M16 11V6', STONE, 1.600) + c(16, 5, 1.800, STONE)) +
    l('M22 26a6 6 0 0 0 5-5M20 30a10 10 0 0 0 10-9', AMBER, 1.400);
  ART['disc-genetics'] = l('M12 7h8M12.500 12h7M12.500 20h7M12 25h8', CREAM, 1.500) + l('M10 2c0 8 12 8 12 14s-12 6-12 14', ROSE, 2.400) + l('M22 2c0 8-12 8-12 14s12 6 12 14', TEAL, 2.400);
  // network
  ART['disc-global-network'] = ring(16, 16, 12, TEAL, 2) + l('M4 16h24M6 10h20M6 22h20M16 4c-7 6-7 18 0 24M16 4c7 6 7 18 0 24', TEAL_D, 1.400) + l('M9 10l14 2-9 11z', AMBER, 1.200) + c(9, 10, 2.200, AMBER) + c(23, 12, 2.200, AMBER) + c(14, 23, 2.200, AMBER);
  ART['disc-adaptive-machines'] = l('M16 9V4', STONE, 2) + c(16, 3.500, 2.200, AMBER) + r(6, 9, 20, 17, STONE, 5) + c(11.500, 17, 3.200, INK) + c(20.500, 17, 3.200, INK) + c(11.500, 17, 1.500, TEAL) + c(20.500, 17, 1.500, TEAL) +
    l('M12 22.500h8', INK, 1.600) + r(3, 15, 3, 6, STONE_D, 1) + r(26, 15, 3, 6, STONE_D, 1) + l('M10 12h5', CREAM, 1.400);
  ART['disc-closed-ecology'] = p('M3 25a13 13 0 0 1 26 0z', WATER, 0.35) + r(15, 17, 2, 8, SAND_D) + c(16, 14, 5.500, GREEN) + c(13.500, 12.500, 2.500, GREEN_D) + c(9, 23, 2.200, GREEN_D) + c(23.500, 22.500, 2.600, GREEN) +
    l('M3 25a13 13 0 0 1 26 0M8.500 14.500a13 13 0 0 1 6-3.200', CREAM, 1.600) + r(2, 25, 28, 3.500, STONE_D, 1.500);
  ART['disc-interplanetary-drive'] = p('M11.500 21h9l-4.500 10z', AMBER) + p('M14 21h4l-2 6z', CREAM) + p('M11 16l-6 8h6zM21 16l6 8h-6z', CORAL) + p('M16 1c5.500 4.500 6.500 12 5 21H11C9.500 13 10.500 5.500 16 1z', CREAM) + p('M16 1c5.500 4.500 6.500 12 5 21h-5z', STONE, 0.5) + c(16, 11, 2.800, WATER) + ring(16, 11, 2.800, STONE_D, 1);
  // stellar memory
  ART['disc-stellar-archive'] = p('M5 9l11-5 11 5v15l-11 5-11-5z', VIOLET_D) + p('M16 4l11 5v15l-11 5z', VIOLET) + l('M5 9l11 5 11-5M16 14v15', CREAM, 1.200) + spark(16, 9, AMBER, 1) + spark(10.500, 19, CREAM, 0.7) + spark(22, 20, CREAM, 0.7);
  ART['disc-dust-metallurgy'] = c(6, 6, 1.600, VIOLET) + c(12, 4, 1.200, STONE) + c(17, 8, 2, VIOLET) + c(24, 5, 1.400, CREAM) + c(27, 11, 1.800, STONE) + c(9, 12, 1.300, CREAM) + c(21, 13, 1.200, VIOLET) + l('M16 12v5', AMBER, 1.600) +
    p('M6 29l3.500-9h13l3.500 9z', AMBER) + p('M9.500 20h13l-1.500-3.500h-10z', CREAM) + p('M16 20h6.500l3.500 9H16z', AMBER_D, 0.6);
  ART['disc-long-cycle'] = p('M9 5h14c0 5-3.500 8-6 11 2.500 3 6 6 6 11H9c0-5 3.500-8 6-11-2.500-3-6-6-6-11z', CREAM, 0.25) + p('M12 8.500h8c-1 2-2.300 3.500-4 5-1.700-1.500-3-3-4-5zM11.500 25.500h9c-.8-2.500-2.500-4-4.500-6-2 2-3.700 3.500-4.500 6z', AMBER) +
    l('M9 5h14c0 5-3.500 8-6 11 2.500 3 6 6 6 11H9c0-5 3.500-8 6-11-2.500-3-6-6-6-11zM7 5h18M7 27h18', CREAM, 1.800) + l('M16 15v4', AMBER, 1.200);
  ART['disc-old-orbits'] = '<g fill="none" stroke="' + SAND + '" stroke-width="1.500" stroke-dasharray="2.500 2.500"><ellipse cx="16" cy="16" rx="14" ry="6" transform="rotate(-25 16 16)"/><ellipse cx="16" cy="16" rx="14" ry="6" transform="rotate(35 16 16)"/></g>' +
    c(16, 16, 4, AMBER) + c(16, 16, 2, CREAM) + c(4.500, 21, 2.200, VIOLET) + c(26.500, 23, 2, TEAL);
  // far horizon
  ART['disc-quiet-star'] = ring(16, 16, 14, AMBER_D, 1) + ring(16, 16, 10.500, AMBER, 1.400) + c(16, 16, 7, AMBER) + c(16, 16, 4, CREAM) + c(27.500, 8, 1.600, TEAL) + c(4, 21, 1.200, VIOLET);
  ART['disc-deep-beacon'] = l('M16 5V1.500M9.500 7.500 7 5M22.500 7.500 25 5M7.500 13H4M28 13h-3.500', AMBER, 2) + p('M12.500 28 14 15h4l1.500 13z', STONE) + p('M16 15h2l1.500 13H16z', STONE_D, 0.7) + r(10, 27, 12, 3, STONE_D, 1) + c(16, 12, 4.500, AMBER) + c(16, 12, 2.200, CREAM);
  ART['disc-seed-arks'] = spark(6, 6, CREAM, 0.8) + spark(27, 9, CREAM, 0.7) + p('M8 18a8 8 0 0 1 16 0z', TEAL, 0.5) + l('M8 18a8 8 0 0 1 16 0', CREAM, 1.400) + l('M16 18v-5', GREEN, 1.800) + p('M16 14c-3 0-4-1.500-4-3.500 3 0 4 1.500 4 3.500zM16 13c0-2 1-3.500 4-3.500 0 2-1 3.500-4 3.500z', GREEN) +
    p('M2 18h28l-5 8H7z', SAND_D) + p('M2 18h28l-1.500 2.500h-25z', SAND) + c(10, 23, 1.200, AMBER) + c(16, 23, 1.200, AMBER) + c(22, 23, 1.200, AMBER);
  ART['disc-stellar-accord'] = l('M16 8 7 24h18z', CREAM, 1.800) + c(16, 8, 5, VIOLET) + c(14.500, 6.500, 1.500, CREAM, 0.7) + c(7, 24, 5, TEAL) + c(5.500, 22.500, 1.500, CREAM, 0.7) + c(25, 24, 5, AMBER) + c(23.500, 22.500, 1.500, CREAM, 0.7) + c(16, 18.500, 1.800, CREAM);

  function has(name) { return Object.prototype.hasOwnProperty.call(ART, name); }

  function svg(name, size, fallback) {
    var s = size || 36;
    var body = has(name) ? ART[name] : ART[fallback || 'mutation'];
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="' + s + '" height="' + s + '" class="ev-art" aria-hidden="true">' + body + '</svg>';
  }

  function el(name, size, fallback) {
    var box = document.createElement('span');
    box.className = 'ev-pic';
    box.innerHTML = svg(name, size, fallback);
    return box;
  }

  var api = { svg: svg, el: el, has: has, names: Object.keys(ART) };
  if (typeof window !== 'undefined') window.EvoArt = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
