// Drawn pictures of «Рыбалка»: tackle and gear of the shop, baits, waters and the trophies of the
// wall. All SVG on a 48×48 field in one palette (water blue, reed green, brass, rust, bone), flat
// fills, no text, no shadows. window.FishArt.
(function () {
  'use strict';

  var WATER = '#6FB6D9';
  var DEEP = '#2F5F7A';
  var REED = '#7FBF8A';
  var BRASS = '#D9B45A';
  var RUST = '#C07A4E';
  var BONE = '#E6E1D3';
  var RED = '#D9655A';
  var DIM = '#6F7C85';
  var BG = '#101315';

  function s(c, d, w) { return '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="' + (w || 2.5) + '" stroke-linecap="round" stroke-linejoin="round"/>'; }
  function f(c, d) { return '<path d="' + d + '" fill="' + c + '"/>'; }
  function dot(c, x, y, r) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + c + '"/>'; }
  function ring(c, x, y, r, w) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="none" stroke="' + c + '" stroke-width="' + (w || 2.5) + '"/>'; }
  function box(c, x, y, w, h, r, fill) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (r || 0) + '" fill="' + (fill || 'none') + '" stroke="' + c + '" stroke-width="2.5" stroke-linejoin="round"/>'; }
  function wrap(inner, size) { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="' + (size || 48) + '" height="' + (size || 48) + '">' + inner + '</svg>'; }

  var wave = function (y, c) { return s(c || WATER, 'M4 ' + y + 'c4-3 6-3 10 0s6 3 10 0 6-3 10 0 6 3 10 0', 2); };
  var fish = function (c, x, y, k) {
    // A small fish looking right, k is its scale.
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + k + ')">' + f(c, 'M-12 0c4-6 12-7 18-2l6-5v14l-6-5c-6 5-14 4-18-2z') + dot(BG, -6, -1, 1.3) + '</g>';
  };
  var hook = function (c, x, y) { return s(c, 'M' + x + ' ' + y + 'v14a6 6 0 0 1-12 0l3 2'); };

  var UP = {
    rod: s(RUST, 'M6 42L40 6', 3.5) + s(BONE, 'M40 6c2 10 0 18-4 24', 1.5) + ring(BRASS, 13, 35, 3.5) + s(BONE, 'M22 25l-2-2M30 17l-2-2', 2) + s(BRASS, 'M36 30v4a3 3 0 0 1-6 0', 2),
    reel: ring(BRASS, 22, 24, 13) + ring(BRASS, 22, 24, 5) + s(BRASS, 'M22 11v8M22 29v8M9 24h8M27 24h8', 2) + s(BONE, 'M33 15l8-7', 3) + dot(BONE, 42, 7, 3),
    line: box(RUST, 14, 8, 20, 32, 3) + s(RUST, 'M8 8h32M8 40h32', 3) + s(WATER, 'M14 14h20M14 19h20M14 24h20M14 29h20M14 34h20', 2) + s(WATER, 'M34 34c6 0 8 4 6 9', 2),
    hook: s(BONE, 'M28 6v24a9 9 0 0 1-18 0v-3l5 4', 3.2) + ring(BONE, 28, 7, 3, 2),
    float: f(RED, 'M24 8c6 6 7 12 7 16H17c0-4 1-10 7-16z') + f(BONE, 'M17 24h14c0 6-3 10-7 12-4-2-7-6-7-12z') + s(BONE, 'M24 2v6M24 36v8', 2) + wave(40),
    aquarium: box(WATER, 5, 10, 38, 30, 3) + s(WATER, 'M5 17c5-3 8 3 13 0s8 3 13 0 7 3 12 0', 2) + fish(BRASS, 22, 28, 0.8) + s(REED, 'M38 40c-3-6 3-8 0-14M34 40c-2-4 2-5 0-9', 2) + dot(WATER, 10, 26, 1.3) + dot(WATER, 12, 22, 1),
    filter: box(DIM, 14, 6, 20, 26, 3) + s(DIM, 'M14 14h20M14 22h20', 2) + s(WATER, 'M24 32v8M24 40h-9M24 40h9', 2.5) + dot(WATER, 12, 44, 1.5) + dot(WATER, 36, 44, 1.5) + dot(WATER, 24, 45, 1.5) + s(REED, 'M19 10h10', 2.5),
    light: s(BRASS, 'M8 12h32', 5) + s(BRASS, 'M12 20l-3 8M24 20v10M36 20l3 8', 2) + fish(WATER, 24, 38, 0.8),
    cat: f(RUST, 'M10 42V22l-2-12 9 6h14l9-6-2 12v20z') + dot(BG, 18, 26, 2.2) + dot(BG, 30, 26, 2.2) + f(BG, 'M22 32h4l-2 3z') + s(BG, 'M6 30l8 2M42 30l-8 2', 1.5),
    landing: ring(BONE, 20, 18, 12) + s(DIM, 'M11 14l18 8M9 20l20 2M14 9l12 18M22 7l4 22M28 11l-12 16', 1.3) + s(RUST, 'M29 27l13 15', 3.5),
    sonar: box(DIM, 8, 8, 32, 24, 3) + s(WATER, 'M13 26c4-10 18-10 22 0', 2) + s(WATER, 'M18 26c3-5 9-5 12 0', 2) + dot(BRASS, 24, 25, 2) + s(DIM, 'M24 32v8M16 42h16', 2.5),
    spoon: f(BONE, 'M24 6c6 4 8 14 0 24-8-10-6-20 0-24z') + s(BG, 'M24 10v14', 1.5) + ring(BONE, 24, 33, 2.5, 2) + hook(BRASS, 28, 34) + dot(RED, 24, 12, 2),
    jig: f(BRASS, 'M17 14a8 8 0 0 1 14 0l-2 10H19z') + dot(BG, 24, 15, 2) + s(BONE, 'M24 24v10a6 6 0 0 1-11 2', 2.5) + s(BONE, 'M24 6V2', 2) + s(WATER, 'M34 30l2 3-2 3M38 22l2 3-2 3', 1.6),
    keepnet: ring(RUST, 24, 10, 12, 2.5) + s(RUST, 'M12 12c0 10 3 18 6 28h12c3-10 6-18 6-28', 2.5) + s(DIM, 'M14 20h20M15 28h18M17 35h14M20 14v26M28 14v26', 1.3) + fish(WATER, 24, 30, 0.55),
    absorber: s(BONE, 'M4 24h7', 2.5) + s(BRASS, 'M11 24l3-8 4 16 4-16 4 16 4-16 4 16 3-8', 2.5) + s(BONE, 'M37 24h7', 2.5) + ring(BONE, 42, 24, 0.1) + s(WATER, 'M14 38h20M30 34l4 4-4 4M18 34l-4 4 4 4', 2),
    boat: f(RUST, 'M4 26h40l-6 12H10z') + s(BONE, 'M22 26V6', 2.5) + f(BONE, 'M24 8l12 14H24z') + wave(43),
    rod2: s(RUST, 'M4 42L26 8', 3) + s(DIM, 'M18 42L40 8', 3) + s(BONE, 'M26 8c2 8 1 13-2 18M40 8c2 8 1 13-2 18', 1.5) + dot(RED, 24, 28, 2.5) + dot(RED, 38, 28, 2.5),
    journal: box(RUST, 9, 6, 30, 36, 3) + s(RUST, 'M15 6v36', 2) + fish(BONE, 28, 20, 0.7) + s(BONE, 'M20 30h14M20 35h9', 2)
  };

  var BAIT = {
    worm: s(RUST, 'M10 34c0-8 8-6 8-14s10-8 10 0-8 8-4 14 14 2 14-6', 5) + dot(BG, 37, 29, 1),
    bloodworm: s(RED, 'M8 16c5-5 8 4 13 0s8-5 12 0', 3) + s(RED, 'M12 28c5-5 8 4 13 0s8-5 13 0', 3) + s(RED, 'M9 39c5-5 8 4 13 0s8-5 12 0', 3),
    livebait: fish(WATER, 22, 24, 1.3) + hook(BONE, 40, 6),
    spoon: UP.spoon,
    jig: UP.jig,
    gold: s(BRASS, 'M10 34c0-8 8-6 8-14s10-8 10 0-8 8-4 14 14 2 14-6', 5) + s(BONE, 'M38 6l1.500 3.500L43 11l-3.500 1.500L38 16l-1.500-3.500L33 11l3.500-1.500z', 1.6) + s(BONE, 'M10 10l1 2 2 1-2 1-1 2-1-2-2-1 2-1z', 1.3),
    groundbait: f(RUST, 'M8 30h32l-4 12H12z') + s(RUST, 'M6 30h36', 3) + dot(BRASS, 16, 22, 2.5) + dot(BRASS, 24, 16, 2.5) + dot(BRASS, 31, 23, 2.5) + dot(BRASS, 22, 25, 2) + dot(BRASS, 34, 13, 2) + dot(BRASS, 14, 11, 2)
  };

  // A water: a round window with its sky, its far shore and its water.
  var WATERS = {
    pond: f(REED, 'M4 24c6-8 12-6 18-9s14-3 22 5v4H4z') + s(BONE, 'M6 30h14M10 30v8M17 30v8', 2.2) + ring(REED, 32, 34, 4, 2) + dot(RED, 32, 34, 1.5),
    river: f(REED, 'M4 20h14c-4 8-10 14-14 18zM44 20H30c2 6 8 12 14 16z') + s(WATER, 'M22 20c-2 8-8 14-10 24M27 20c1 8 6 14 10 24', 2),
    lake: f(DIM, 'M4 24l10-12 8 8 8-12 14 16z') + s(REED, 'M8 42V28M12 42V30M36 42V28M40 42V31', 2) + wave(33),
    swamp: f(REED, 'M6 34c2-4 8-4 10 0zM22 40c2-4 8-4 10 0zM32 30c2-4 8-4 10 0z') + s(REED, 'M11 30v-8M27 36v-9M37 26v-8', 2) + s(DIM, 'M24 6v10M20 9l4 4 4-4', 2) + s(DIM, 'M6 24h8M20 24h10M36 20h6', 1.6),
    creek: f(DIM, 'M4 30l10-18 8 10 6-14 16 22z') + f(BONE, 'M28 8l4 6h-7z') + dot(DIM, 14, 38, 4) + dot(DIM, 34, 40, 3) + s(WATER, 'M20 30c0 6 6 6 6 12', 2.5),
    bay: s(BONE, 'M34 30V12', 4) + f(RED, 'M30 8h8v5h-8z') + s(BRASS, 'M28 10l-10-3M28 11l-10 4', 1.6) + f(DIM, 'M26 30h16v4H26z') + wave(38) + wave(44, DEEP),
    ice: f(BONE, 'M4 26h40v6H4z') + f(BG, 'M18 26h12v6H18z') + s(WATER, 'M24 8v18', 1.6) + s(BONE, 'M10 12l2 2M36 10l2 2M14 20l1 1M32 18l1 1M40 20l1 1', 2) + fish(WATER, 24, 40, 0.6),
    cave: f(DIM, 'M4 4h40v8l-4 8-4-8-5 12-5-12-4 6-4-6-5 10-4-10-5 6z') + wave(36) + wave(42, DEEP) + dot(WATER, 24, 28, 1.5)
  };

  function water(id, tint) {
    var sky = tint || '#1b2a35';
    return wrap('<defs><clipPath id="fw-' + id + '"><rect x="2" y="2" width="44" height="44" rx="10"/></clipPath></defs>' +
      '<g clip-path="url(#fw-' + id + ')"><rect width="48" height="48" fill="' + sky + '"/><rect y="24" width="48" height="24" fill="' + DEEP + '" opacity=".55"/>' + (WATERS[id] || wave(34)) + '</g>');
  }

  var TROPHY = {
    key: ring(RUST, 15, 15, 8, 3) + s(RUST, 'M21 21l19 19M34 34l-4 4M39 39l-4 4', 3),
    horseshoe: s(DIM, 'M12 42V20a12 12 0 0 1 24 0v22', 6) + s(BG, 'M12 38h0M12 28h0M36 38h0M36 28h0M17 13h0M31 13h0', 2),
    coin: ring(BRASS, 24, 24, 16, 3) + ring(BRASS, 24, 24, 10, 1.5) + f(BRASS, 'M24 17l2 5h5l-4 3 2 5-5-3-5 3 2-5-4-3h5z'),
    boot: f(REED, 'M16 4h14v24c6 2 12 4 12 12v2H16z') + s(BG, 'M16 12h14M16 38h26', 2),
    kettle: f(DIM, 'M12 20h22v18a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4z') + s(DIM, 'M34 26c6-2 8-6 8-10', 3) + s(DIM, 'M14 20c0-12 18-12 18 0', 2.5) + s(DIM, 'M19 20h8', 4) + s(BG, 'M17 30l5 4', 2),
    spoon: f(BONE, 'M24 4c6 0 8 8 8 12s-4 8-8 8-8-4-8-8 2-12 8-12z') + s(BONE, 'M24 24v20', 3.5) + s(BG, 'M21 10c-1 3-1 6 0 8', 1.5),
    bell: f(BRASS, 'M24 8c9 0 10 10 12 22H12c2-12 3-22 12-22z') + s(BRASS, 'M10 30h28', 3) + dot(BRASS, 24, 37, 3.5) + ring(BRASS, 24, 6, 2.5, 2),
    lure: f(BRASS, 'M24 4c5 4 6 12 0 22-6-10-5-18 0-22z') + ring(BONE, 24, 29, 2.5, 2) + s(BONE, 'M24 32v6M24 38a5 5 0 0 0 9 0M24 38a5 5 0 0 1-9 0', 2) + dot(RED, 24, 10, 2),
    glasses: ring(BONE, 14, 26, 8) + ring(BONE, 34, 26, 8) + s(BONE, 'M22 24c1-2 3-2 4 0M6 24l-2-8M42 24l2-8', 2.2),
    button: ring(BRASS, 24, 24, 16, 3) + s(BRASS, 'M24 14v18M18 19h12M16 28c2 5 14 5 16 0', 2.2) + ring(BRASS, 24, 13, 1.8, 1.5),
    badge: f(REED, 'M24 4l5 4 6-1 2 6 6 3-3 6 3 6-6 3-2 6-6-1-5 4-5-4-6 1-2-6-6-3 3-6-3-6 6-3 2-6 6 1z') + f(BG, 'M24 32c-6 0-8-8-2-14 0 5 6 5 4-2 6 4 6 16-2 16z'),
    mug: f(BONE, 'M10 12h24v26a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4z') + s(BONE, 'M34 18h4a5 5 0 0 1 0 12h-4', 3) + s(WATER, 'M10 16h24', 3) + f(BG, 'M16 26l3 4-2 4z'),
    padlock: box(DIM, 10, 22, 28, 20, 4, DIM) + s(DIM, 'M16 22v-6a8 8 0 0 1 16 0v6', 4) + f(BG, 'M24 28a3 3 0 0 1 2 5l1 4h-6l1-4a3 3 0 0 1 2-5z'),
    whistle: f(BRASS, 'M4 16h24v8a10 10 0 1 1-18 6H4z') + ring(BG, 28, 30, 4, 2) + s(BG, 'M12 16v6', 2) + ring(BRASS, 40, 12, 3, 2),
    thimble: f(DIM, 'M16 14a8 8 0 0 1 16 0l3 24H13z') + s(DIM, 'M10 40h28', 4) + dot(BG, 20, 18, 1.2) + dot(BG, 27, 17, 1.2) + dot(BG, 23, 24, 1.2) + dot(BG, 29, 26, 1.2) + dot(BG, 19, 30, 1.2) + dot(BG, 25, 32, 1.2),
    compass: ring(BRASS, 24, 26, 16, 3) + ring(BRASS, 24, 6, 3, 2) + s(BONE, 'M24 14v3M24 35v3M12 26h3M33 26h3', 2) + dot(DIM, 24, 26, 2.5),
    watch: ring(BRASS, 24, 28, 15, 3) + s(BRASS, 'M24 13V8', 4) + ring(BRASS, 24, 5, 2.5, 2) + s(BONE, 'M24 20v8l6 4', 2.5),
    bottle: f(WATER, 'M19 14h10l4 8v18a3 3 0 0 1-3 3H18a3 3 0 0 1-3-3V22z') + f(RUST, 'M20 5h8v9h-8z') + f(BONE, 'M18 27h12v9H18z') + s(BG, 'M21 31h6', 1.5),
    lamp: s(DIM, 'M16 12a8 8 0 0 1 16 0', 2.5) + f(DIM, 'M14 14h20v5H14zM14 38h20v5H14z') + f(BRASS, 'M17 19h14v19H17z') + f(BG, 'M24 24c3 3 4 5 4 7a4 4 0 0 1-8 0c0-2 1-4 4-7z') + s(DIM, 'M17 19v19M31 19v19', 2),
    anchor: ring(DIM, 24, 9, 4) + s(DIM, 'M24 13v28M16 20h16M8 28c0 8 7 13 16 13s16-5 16-13M8 28l-3 5M8 28l5 3M40 28l3 5M40 28l-5 3', 3),
    ring: ring(BRASS, 24, 28, 13, 4) + f(WATER, 'M18 10l6-6 6 6-6 7z') + s(BONE, 'M21 9l3-2', 1.5),
    medal: f(RED, 'M14 4h8l4 14h-6zM34 4h-8l-4 14h6z') + ring(BRASS, 24, 31, 12, 3) + s(BRASS, 'M19 31c3-3 7 3 10 0', 2.2) + s(BRASS, 'M24 24v3', 2),
    pipe: f(RUST, 'M26 14h14v14a7 7 0 0 1-14 0z') + s(RUST, 'M28 30c-8 4-16 0-24-10', 4) + s(DIM, 'M30 9c0-3 3-3 3-6M36 9c0-2 2-2 2-4', 1.8),
    toy: dot(DIM, 24, 9, 5) + f(RED, 'M17 15h14v14H17z') + f(DIM, 'M18 29h5v13h-5zM25 29h5v13h-5z') + s(DIM, 'M36 6v30', 2.5) + s(RED, 'M31 18l5-2', 3) + f(DIM, 'M14 42h20v3H14z'),
    harmonica: box(DIM, 4, 15, 40, 18, 3, DIM) + s(BG, 'M10 22v6M15 22v6M20 22v6M25 22v6M30 22v6M35 22v6', 2.5) + s(BRASS, 'M5 17h38', 2.5),
    cross: s(BONE, 'M24 10v32M14 20h20', 5) + ring(BONE, 24, 6, 2.5, 2),
    map: f(BONE, 'M6 12l12-4 12 4 12-4v28l-12 4-12-4-12 4z') + s(BG, 'M18 8v28M30 12v28', 1.5) + s(RED, 'M11 28l3-4 6 2 4-6 6 4', 1.8) + s(RED, 'M34 18l5 5M39 18l-5 5', 2.2),
    helmet: f(BRASS, 'M8 26a16 16 0 0 1 32 0v8H8z') + f(BRASS, 'M4 34h40v8H4z') + ring(BG, 24, 24, 7, 2.5) + dot(WATER, 24, 24, 5) + ring(BG, 10, 27, 2.5, 2) + ring(BG, 38, 27, 2.5, 2) + s(BG, 'M10 38h0M18 38h0M30 38h0M38 38h0', 2.5),
    chest: f(RUST, 'M6 22a8 8 0 0 1 8-8h20a8 8 0 0 1 8 8v18H6z') + s(BG, 'M6 24h36', 2) + f(BRASS, 'M21 21h6v8h-6z') + f(BONE, 'M10 8c3-3 8-1 8 3h-9zM30 10c2-4 8-3 9 1z'),
    statue: fish(DIM, 22, 20, 1.5) + f(DIM, 'M12 34h24v4H12zM8 38h32v5H8z') + s(BG, 'M18 18c2 2 2 4 0 6M24 17c2 2 2 5 0 7', 1.5)
  };

  // The panel under the scene: the shop's tackle box, the lantern, the early dawn.
  var UI = {
    shop: f(RUST, 'M6 22h36v17a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3z') + f(BRASS, 'M4 15h40v8H4z') + s(BONE, 'M18 15v-4a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v4', 2.5) + f(BONE, 'M21 20h6v8h-6z') + s(BG, 'M6 33h36', 1.5),
    lantern: s(DIM, 'M18 12a6 6 0 0 1 12 0', 2.5) + f(DIM, 'M16 12h16v5H16zM13 37h22v5H13z') + f(BRASS, 'M17 17h14l2 20H15z') + f(BONE, 'M22 22c2 2 4 5 2 10-3-2-4-6-2-10z'),
    dawn: f(BRASS, 'M11 30a13 13 0 0 1 26 0z') + s(BRASS, 'M24 6v6M7 14l4 4M41 14l-4 4', 2.5) + wave(36) + wave(43, DEEP)
  };

  function lock() {
    return wrap(box(DIM, 13, 22, 22, 18, 3) + s(DIM, 'M17 22v-6a7 7 0 0 1 14 0v6') + dot(DIM, 24, 31, 2.2));
  }

  window.FishArt = {
    up: function (id) { return wrap(UP[id] || UP.hook); },
    bait: function (id) { return wrap(BAIT[id] || BAIT.worm); },
    water: water,
    trophy: function (id) { return wrap(TROPHY[id] || TROPHY.coin); },
    unknown: function () { return wrap(ring(DIM, 24, 24, 15, 2) + s(DIM, 'M18 19a6 6 0 1 1 9 5c-2 1-3 2-3 5', 3) + dot(DIM, 24, 35, 1.8)); },
    note: function () { return wrap(f(WATER, 'M16 16h16l3 6v18a3 3 0 0 1-3 3H16a3 3 0 0 1-3-3V22z') + f(RUST, 'M19 6h10v10H19z') + f(BONE, 'M17 25h14v12H17z') + s(BG, 'M20 29h8M20 33h5', 1.5)); },
    ui: function (id) { return wrap(UI[id] || UP[id] || UP.hook); },
    lock: lock,
    ids: { up: Object.keys(UP), bait: Object.keys(BAIT), water: Object.keys(WATERS), trophy: Object.keys(TROPHY) }
  };
})();
