// Drawn pictures of «Сад»: the upgrades, the climates of a new plot and the events. All SVG on a
// 48×48 field in the palette of the garden (leaf green, soil, water, pollen yellow, wood), flat
// fills, no text, no shadows. window.GardenArt.
(function () {
  'use strict';

  var LEAF = '#46A758';
  var DARK = '#3F7D3A';
  var SOIL = '#8A6E4B';
  var WOOD = '#B48A4E';
  var WATER = '#6FB6D9';
  var SUN = '#E8C547';
  var PETAL = '#E5484D';
  var VIOLET = '#9B5DE5';
  var BONE = '#EDEDED';
  var DIM = '#7C776C';
  var BG = '#141414';

  function s(c, d, w) { return '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="' + (w || 2.5) + '" stroke-linecap="round" stroke-linejoin="round"/>'; }
  function f(c, d) { return '<path d="' + d + '" fill="' + c + '"/>'; }
  function dot(c, x, y, r) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + c + '"/>'; }
  function ring(c, x, y, r, w) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="none" stroke="' + c + '" stroke-width="' + (w || 2.5) + '"/>'; }
  function box(c, x, y, w, h, r, fill) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (r || 0) + '" fill="' + (fill || 'none') + '" stroke="' + c + '" stroke-width="2.5" stroke-linejoin="round"/>'; }
  function wrap(inner, size) { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="' + (size || 48) + '" height="' + (size || 48) + '">' + inner + '</svg>'; }

  // A sprout and a small flower used in many pictures.
  function sprout(x, y, k) {
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + (k || 1) + ')">' + s(DARK, 'M0 0v-10', 2.2) + f(LEAF, 'M0-8c-6-1-8-5-8-8 5 0 8 3 8 8zM0-10c5-1 7-4 7-7-4 0-7 3-7 7z') + '</g>';
  }
  function bloom(x, y, c, k) {
    var out = '<g transform="translate(' + x + ' ' + y + ') scale(' + (k || 1) + ')">';
    for (var i = 0; i < 5; i++) out += '<ellipse cx="0" cy="-5" rx="3" ry="4.5" fill="' + c + '" transform="rotate(' + i * 72 + ')"/>';
    return out + dot(SUN, 0, 0, 2.3) + '</g>';
  }
  var drop = function (x, y, k) { return '<g transform="translate(' + x + ' ' + y + ') scale(' + (k || 1) + ')">' + f(WATER, 'M0-7c3 4 5 6 5 9a5 5 0 0 1-10 0c0-3 2-5 5-9z') + '</g>'; };

  var UP = {
    beds: f(SOIL, 'M6 30h36l-3 12H9z') + s(BG, 'M8 35h32', 1.5) + sprout(15, 30, 0.9) + sprout(24, 30, 1.1) + sprout(33, 30, 0.9) + s(SUN, 'M38 8v8M34 12h8', 2.5),
    can: f(WATER, 'M14 20h18v20H14z') + s(WATER, 'M32 26l10-8M40 14l4 6', 3) + s(WATER, 'M14 24c-8 0-8 12 0 12', 2.5) + s(BONE, 'M18 20c0-8 10-8 10 0', 2) + dot(WATER, 44, 26, 1.3) + dot(WATER, 41, 30, 1.3) + dot(WATER, 45, 33, 1.3),
    barrel: f(WOOD, 'M12 16h24c3 8 3 18 0 26H12c-3-8-3-18 0-26z') + s(DIM, 'M10 22h28M10 36h28', 2.5) + s(BG, 'M20 16v26M28 16v26', 1.3) + f(WATER, 'M13 12h22v4H13z') + drop(24, 8, 0.8),
    greenhouse: s(BONE, 'M6 42V22L24 8l18 14v20z') + s(BONE, 'M24 8v34M6 22h36M6 32h36M15 15v27M33 15v27', 1.3) + sprout(19, 42, 0.8) + bloom(30, 36, PETAL, 0.7),
    guard: s(WOOD, 'M24 14v30M10 24h28', 3) + dot(WOOD, 24, 11, 6) + f(SUN, 'M12 6h24l-4 4H16z') + f(SUN, 'M17 2h14v5H17z') + s(DIM, 'M10 24v8M38 24v8', 2.5) + f(PETAL, 'M18 26h12l-2 12h-8z'),
    dryer: s(WOOD, 'M6 10h36', 3) + s(DIM, 'M14 10v6M24 10v6M34 10v6', 1.8) + f(DIM, 'M14 16c-4 4-4 12 0 18 4-6 4-14 0-18zM34 16c-4 4-4 12 0 18 4-6 4-14 0-18z') + f(WOOD, 'M24 16c-4 4-4 12 0 18 4-6 4-14 0-18z') + dot(SOIL, 20, 42, 2) + dot(SOIL, 27, 43, 2) + dot(SOIL, 24, 39, 2),
    lens: ring(BONE, 20, 20, 12, 3) + s(WOOD, 'M29 29l13 13', 4.5) + s(LEAF, 'M15 22c0-5 5-5 5 0s5 5 5 0', 2.2) + dot(PETAL, 15, 22, 1.8) + dot(WATER, 25, 22, 1.8),
    notebook: box(WOOD, 9, 6, 30, 36, 3, WOOD) + f(BONE, 'M15 10h20v28H15z') + s(BG, 'M25 12v24M17 24h16', 1.5) + dot(PETAL, 20, 17, 2.5) + dot(SUN, 30, 17, 2.5) + dot(SUN, 20, 31, 2.5) + dot(LEAF, 30, 31, 2.5) + s(DIM, 'M9 12H5M9 20H5M9 28H5M9 36H5', 2),
    bank: box(WOOD, 6, 8, 36, 34, 3) + s(WOOD, 'M6 19h36M6 30h36M18 8v34M30 8v34', 1.8) + dot(SOIL, 12, 14, 2) + dot(SUN, 24, 14, 2) + dot(SOIL, 36, 25, 2) + dot(LEAF, 12, 25, 2) + dot(PETAL, 24, 36, 2) + dot(SOIL, 36, 36, 2),
    fert: f(DIM, 'M12 14h24l2 28H10z') + s(DIM, 'M14 14c0-6 4-6 5-10M34 14c0-6-4-6-5-10', 2.2) + s(BONE, 'M18 22h12', 2) + sprout(24, 38, 1) + dot(SUN, 16, 9, 1.5) + dot(SUN, 32, 9, 1.5) + dot(SUN, 24, 6, 1.5),
    lamp: s(DIM, 'M24 4v8', 2.5) + f(DIM, 'M12 22a12 12 0 0 1 24 0z') + f(SUN, 'M19 22h10a5 5 0 0 1-10 0z') + s(SUN, 'M10 28l-3 5M38 28l3 5M24 31v5', 2) + bloom(24, 42, VIOLET, 0.6),
    hive: f(SUN, 'M16 10h16a4 4 0 0 1 0 8H16a4 4 0 0 1 0-8zM12 19h24a4 4 0 0 1 0 8H12a4 4 0 0 1 0-8zM10 28h28a4 4 0 0 1 0 8H10a4 4 0 0 1 0-8zM14 37h20v5H14z') + f(BG, 'M21 34a3 3 0 0 1 6 0v8h-6z') + dot(BONE, 40, 10, 2.5) + s(BG, 'M39 9l2 2', 1.2) + s(BONE, 'M36 8l-2-3M43 8l2-3', 1.3),
    vitrine: box(BONE, 6, 14, 36, 22, 2) + s(WOOD, 'M4 36h40M10 36v8M38 36v8', 3) + f(PETAL, 'M4 6h40l-3 8H7z') + s(BG, 'M14 6l-1 8M24 6v8M34 6l1 8', 1.5) + bloom(16, 26, VIOLET, 0.75) + bloom(32, 26, SUN, 0.75),
    board: box(WOOD, 6, 6, 36, 30, 2, '#2A2118') + s(WOOD, 'M14 36l-4 8M34 36l4 8', 3) + f(BONE, 'M10 10h11v10H10zM25 12h12v9H25zM14 23h12v9H14z') + dot(PETAL, 15, 11, 1.6) + dot(PETAL, 31, 13, 1.6) + dot(PETAL, 20, 24, 1.6) + s(DIM, 'M12 15h7M27 17h8M16 28h8', 1.3),
    compost: f(SOIL, 'M6 40c2-12 8-20 18-20s16 8 18 20z') + s(WOOD, 'M8 40V18M40 40V18M8 24h32', 2.5) + f(DARK, 'M16 28c2-4 6-4 8 0zM26 32c2-3 5-3 7 0z') + s(LEAF, 'M30 12a7 7 0 1 0-8 6M24 14l-2 4 5 1', 2.2),
    meteo: s(DIM, 'M24 44V14', 2.5) + s(BONE, 'M12 14h24', 2.5) + f(BONE, 'M10 9a4 4 0 0 1 4 4v2h-4zM38 9a4 4 0 0 0-4 4v2h4z') + f(PETAL, 'M24 18l12 5-12 5z') + s(DIM, 'M16 44h16', 2.5) + f(WATER, 'M8 30h9a3 3 0 0 0 0-6 5 5 0 0 0-9 1 2.500 2.500 0 0 0 0 5z'),
    boundary: s(WOOD, 'M10 44V18l3-5 3 5v26M22 44V14l3-5 3 5v30M34 44V18l3-5 3 5v26', 2.5) + s(WOOD, 'M6 24h36M6 36h36', 2.5) + f(SUN, 'M41 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0z'),
    orangery: s(BONE, 'M6 42V24a18 18 0 0 1 36 0v18z') + s(BONE, 'M24 6v36M6 26h36M12 12l6 14M36 12l-6 14', 1.3) + f(LEAF, 'M24 40c-10-4-10-12-8-16 6 2 9 8 8 16zM24 40c10-4 10-12 8-16-6 2-9 8-8 16z') + s(DARK, 'M24 42v-8', 2),
    fridge: box(BONE, 12, 4, 24, 40, 4) + s(BONE, 'M12 18h24M17 9v5M17 23v8', 2.2) + s(WATER, 'M27 26v12M22 29l10 6M32 29l-10 6', 1.8) + dot(SOIL, 27, 11, 2),
    cart: f(DIM, 'M6 16h28l-4 16H12z') + s(WOOD, 'M34 16l10-6', 3) + ring(BONE, 20, 38, 5, 2.5) + s(DIM, 'M30 32l6 10', 2.5) + bloom(14, 13, PETAL, 0.7) + bloom(23, 11, VIOLET, 0.7) + bloom(30, 14, SUN, 0.6)
  };

  // A climate of a new plot: the ground and its sky in a round window.
  var CLIMATE = {
    flood: f('#22384A', 'M0 0h48v48H0z') + f(WATER, 'M0 30c6-4 10 4 16 0s10 4 16 0 10 4 16 0v18H0z') + s(BONE, 'M0 38c6-4 10 4 16 0s10 4 16 0 10 4 16 0', 1.5) + s(DARK, 'M12 30V16M20 30V12M34 30V18', 2.2) + f(SOIL, 'M10 10h4v8h-4zM18 6h4v8h-4zM32 12h4v8h-4z'),
    rocky: f('#2B2A28', 'M0 0h48v48H0z') + f(DIM, 'M0 48l10-20 8 8 8-16 10 14 6-8 6 10v12z') + f('#5A564E', 'M26 20l10 14-6 4-8-6z') + sprout(14, 40, 0.9) + dot(SUN, 38, 10, 5),
    north: f('#1E2A3A', 'M0 0h48v48H0z') + f(BONE, 'M0 34c8-6 16-4 24 0s16 2 24-2v16H0z') + f(DARK, 'M14 34l6-14 6 14zM16 24l4-10 4 10z') + s(BONE, 'M36 8v10M31 13h10M32.500 9.500l7 7M39.500 9.500l-7 7', 1.5) + dot(BONE, 8, 10, 1) + dot(BONE, 20, 6, 1) + dot(BONE, 28, 22, 1),
    salt: f('#3A3326', 'M0 0h48v48H0z') + f('#D9CDB4', 'M0 30h48v18H0z') + s('#8A7F68', 'M0 36l10 4 8-6 10 8 8-6 12 4M10 40l-2 8M28 42l2 6M18 34l-4-4', 1.3) + f(SUN, 'M40 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0z') + s(DARK, 'M10 30c0-6 2-8 4-10M10 30c0-5-2-6-4-8', 2)
  };

  var EVENT = {
    storm: f(DIM, 'M10 26h26a7 7 0 0 0 0-14 10 10 0 0 0-19-2 8 8 0 0 0-7 16z') + f(SUN, 'M26 24l-8 12h6l-3 9 10-13h-6z'),
    warm: s(SUN, 'M30 6a14 14 0 1 0 12 20A12 12 0 0 1 30 6z') + bloom(16, 36, VIOLET, 0.9) + s(PETAL, 'M34 34c2-2 2-4 0-6M40 36c2-2 2-4 0-6', 1.8),
    swarm: dot(SUN, 14, 16, 4) + dot(SUN, 32, 12, 4) + dot(SUN, 26, 28, 4) + dot(SUN, 38, 30, 4) + dot(SUN, 12, 34, 4) + s(BG, 'M14 13v6M32 9v6M26 25v6M38 27v6M12 31v6', 1.5) + s(BONE, 'M11 12l-3-3M17 12l3-3M29 8l-3-3M35 8l3-3M23 24l-3-3M29 24l3-3', 1.3),
    wander: dot(WOOD, 24, 12, 6) + f(DIM, 'M12 6h24l-5 5H17z') + f(VIOLET, 'M14 20h20l4 22H10z') + f(SOIL, 'M30 28h10v10H30z') + dot(SUN, 35, 33, 2),
    slugs: f(WOOD, 'M6 38c0-6 6-8 12-8h14c2-8 10-8 10 0 0 6-4 8-8 8z') + ring(SOIL, 22, 26, 8, 2.5) + ring(SOIL, 22, 26, 3.5, 2) + s(WOOD, 'M38 24l-2-8M41 25l3-7', 2) + f(LEAF, 'M4 44c2-6 8-6 12 0z')
  };

  function climate(id) {
    return wrap('<defs><clipPath id="gdc-' + id + '"><rect x="2" y="2" width="44" height="44" rx="10"/></clipPath></defs><g clip-path="url(#gdc-' + id + ')">' + (CLIMATE[id] || CLIMATE.rocky) + '</g>');
  }

  window.GardenArt = {
    up: function (id) { return wrap(UP[id] || UP.beds); },
    climate: climate,
    event: function (id) { return wrap(EVENT[id] || EVENT.storm); },
    humus: function () { return wrap(f(SOIL, 'M4 40c4-14 12-20 20-20s16 6 20 20z') + s(BG, 'M12 34c4-2 6 2 10 0M26 30c4-2 6 2 10 0', 1.5) + sprout(24, 22, 1.3)); },
    lock: function () { return wrap(box(DIM, 13, 22, 22, 18, 3) + s(DIM, 'M17 22v-6a7 7 0 0 1 14 0v6') + dot(DIM, 24, 31, 2.2)); },
    ids: { up: Object.keys(UP), climate: Object.keys(CLIMATE), event: Object.keys(EVENT) }
  };
})();
