/* Pictures of the colony: window.AcArt. Hand-drawn SVG, 32×32, one palette (the resource colours of
   game.css). AcArt.svg(name) is markup, AcArt.el(name, cls) an element; an unknown name gives a
   plain rock, so a new item of the catalog still has a picture. */
(function () {
  'use strict';
  var O = '#d8a58c';
  var Od = '#8f6552';
  var I = '#a2c8de';
  var Id = '#5f8298';
  var E = '#e5cd86';
  var Ed = '#96823f';
  var D = '#a4c5ae';
  var Dd = '#5f8069';
  var S = '#c0c7ca';
  var M = '#858b8f';
  var K = '#444a4d';
  var B = '#232628';
  var R = '#e6a39b';
  var V = '#b9a6dc';
  var Vd = '#6d5c94';

  function P(d, fill, stroke, w) {
    return '<path d="' + d + '" fill="' + (fill || 'none') + '"' + (stroke ? ' stroke="' + stroke + '" stroke-width="' + (w || 1.5) + '"' : '') + '/>';
  }
  function L(d, stroke, w) { return P(d, null, stroke || S, w || 1.5); }
  function C(x, y, r, fill, stroke, w) {
    return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + (fill || 'none') + '"' + (stroke ? ' stroke="' + stroke + '" stroke-width="' + (w || 1.5) + '"' : '') + '/>';
  }
  function X(x, y, w, h, r, fill, stroke, sw) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (r || 0) + '" fill="' + (fill || 'none') + '"' + (stroke ? ' stroke="' + stroke + '" stroke-width="' + (sw || 1.5) + '"' : '') + '/>';
  }

  // Parts used by several pictures.
  var rock = P('M5 17 9 9l8-3 8 4 3 8-5 7-10 1-6-5z', Od, O) + L('m9 9 5 6 9-2m-9 2-1 9m10-11 2 9', O, 1);
  var lump = function (x, y, c, cd) { return P('M' + x + ' ' + (y + 4) + 'l2-4 5-1 4 3-1 5-6 1z', cd || Od, c || O, 1.2); };
  var eye = function (x, y) { return C(x, y, 1.6, E); };
  var drop = function (x, y, s, fill, stroke) {
    return P('M' + x + ' ' + y + 'c' + (s * 0.9) + ' ' + (s * 1.2) + ' ' + (s * 1.2) + ' ' + (s * 1.9) + ' ' + (s * 1.2) + ' ' + (s * 2.6) + 'a' + (s * 1.2) + ' ' + (s * 1.2) + ' 0 0 1-' + (s * 2.4) + ' 0c0-' + (s * 0.7) + ' ' + (s * 0.3) + '-' + (s * 1.4) + ' ' + (s * 1.2) + '-' + (s * 2.6) + 'z', fill, stroke, 1.4);
  };
  var bolt = function (x, y, s, fill) { return P('M' + (x + 2 * s) + ' ' + y + 'l-' + (4 * s) + ' ' + (6 * s) + 'h' + (3 * s) + 'l-' + (1.5 * s) + ' ' + (5 * s) + ' ' + (4.5 * s) + '-' + (6.5 * s) + 'h-' + (3 * s) + 'z', fill || E); };
  var person = function (x, y, c) { return C(x, y, 2.6, c || S) + P('M' + (x - 4.5) + ' ' + (y + 11) + 'a4.5 5.5 0 0 1 9 0z', c || S); };
  var spark = function (x, y, s, c) { return P('M' + x + ' ' + (y - s) + 'l' + (s * 0.3) + ' ' + (s * 0.7) + ' ' + (s * 0.7) + ' ' + (s * 0.3) + '-' + (s * 0.7) + ' ' + (s * 0.3) + '-' + (s * 0.3) + ' ' + (s * 0.7) + '-' + (s * 0.3) + '-' + (s * 0.7) + '-' + (s * 0.7) + '-' + (s * 0.3) + ' ' + (s * 0.7) + '-' + (s * 0.3) + 'z', c || E); };
  var wrench = P('M22 4a6 6 0 0 0-6.6 8L5 22.4a2.6 2.6 0 0 0 3.7 3.7L19 15.6A6 6 0 0 0 27 9l-4 4-3-1-1-3z', K, S);
  var rocket = function (c) { return P('M16 3c5 4 6 10 5 17H11C10 13 11 7 16 3z', K, S) + C(16, 11, 2.4, c || I) + P('M11 16l-4 6 4-1zm10 0 4 6-4-1z', M) + P('M13 22h6l-3 7z', E); };
  var station = function (c, core) {
    return X(2, 12, 7, 8, 1, c, null) + X(23, 12, 7, 8, 1, c, null) + L('M9 16h3m8 0h3', S) + L('M3.5 16h4m17 0h4M5.5 12v8m21-8v8', B, 1) +
      C(16, 16, 6.5, K, S) + core + L('M16 4v5.5m0 13V28', S) + C(16, 3.5, 1.5, c);
  };
  var dish = P('M8 14a9 9 0 0 0 13 8z', K, S) + L('m15 17 5-6', S) + C(21, 10, 1.8, E) + L('M13 23l-3 6h10l-4-5', S);
  var waves = function (c) { return L('M23 4a8 8 0 0 1 6 6M24 0a12 12 0 0 1 8 9', c || D, 1.3); };
  var chip = X(9, 9, 14, 14, 2, Dd, D) + X(13, 13, 6, 6, 1, B, D, 1) + L('M12 5v4m4-4v4m4-4v4M12 23v4m4-4v4m4-4v4M5 12h4m-4 4h4m-4 4h4m14-8h4m-4 4h4m-4 4h4', D, 1.3);
  var flask = P('M13 4h6M14 4v8L7 25a2 2 0 0 0 2 3h14a2 2 0 0 0 2-3l-7-13V4', K, S) + P('M10.5 20h11l2.6 5a1 1 0 0 1-1 1.5H9a1 1 0 0 1-1-1.5z', D) + C(14, 23, 1, B) + C(18.5, 22, .8, B);
  var dome = P('M4 24a12 12 0 0 1 24 0z', B, I) + L('M16 12v12M9.5 14.5C12 17 12 21 12 24m10.500-9.500C20 17 20 21 20 24', Id, 1) + L('M2 24h28', S) + X(13.5, 20, 5, 4, 0, E);
  var crate = X(5, 9, 22, 16, 1.5, K, S) + L('M5 14h22M5 20h22M12 9v16m8-16v16', M, 1) + X(13.500, 14.800, 5, 4.400, .5, O);
  var furnace = P('M6 28V13l5-6h10l5 6v15z', K, S) + P('M11 28v-7a5 5 0 0 1 10 0v7z', B, M, 1) + P('M16 19c2 2 3 3.500 3 5.200a3 3 0 0 1-6 0c0-1.200.800-2 1.500-2.800.300 1 1 1.300 1.500 1.100-.600-1.300-.500-2.500 0-3.500z', O) + L('M13 7V4m6 3V4', S);
  var engine = P('M10 4h12l3 12H7z', K, S) + P('M9 16h14l4 7H5z', M, S) + L('M12 4v12m8-12v12', M, 1) + P('M9 23h14l-7 7z', V) + L('M3 9h4M25 9h4', V);
  var gear = function (x, y, c) {
    return '<g transform="translate(' + x + ' ' + y + ')">' + P('M-1.500-7h3l.500 2 1.800.800 1.800-1.100 2.100 2.100-1.100 1.800.800 1.800 2 .500v3l-2 .500-.800 1.800 1.100 1.800-2.100 2.100-1.800-1.100-1.800.800-.500 2h-3l-.500-2-1.800-.800-1.800 1.100-2.100-2.100 1.100-1.800-.800-1.800-2-.500v-3l2-.500.800-1.800-1.100-1.800 2.100-2.100 1.800 1.100 1.800-.800z', K, c || S, 1.300) + C(0, 0, 2.200, B, c || S, 1.200) + '</g>';
  };
  var star = function (r, fill, ring) { return C(16, 16, r + 3.500, null, ring, 1) + C(16, 16, r, fill); };
  var ice = P('M16 3l6 7-2 13-4 6-4-6-2-13z', Id, I) + L('M10 10h12M16 3v26m-4-6 4-13 4 13', I, 1);
  var ingot = P('M9 12h14l5 10H4z', M, S) + P('M9 12h14l-2-3H11z', S) + L('M10 18h12', S, 1);
  var canister = X(8, 9, 16, 19, 2.500, K, S) + X(12, 4, 8, 5, 1, M, S, 1.200) + X(11, 15, 10, 9, 1, E) + L('M8 12.500h16', S, 1);
  var nodes = L('M8 9l8 7 8-7M16 16v8', D) + C(8, 9, 3, Dd, D) + C(24, 9, 3, Dd, D) + C(16, 16, 3.400, D) + C(16, 25, 3, Dd, D);
  var dm = P('M16 3l11 13-11 13L5 16z', Vd, V) + P('M16 9l6 7-6 7-6-7z', B, V, 1) + C(16, 16, 2, V);
  var beacon = P('M12 28l2-15h4l2 15z', K, S) + X(12, 8, 8, 5, 1, E) + L('M10 28h12M13 20h6', S, 1.200) + L('M8 7 4 5m4 6H3m21-4 4-2m-4 6h5', E, 1.300) + P('M13 8l3-4 3 4z', S);
  var moon = P('M21 4a12 12 0 1 0 7 17A10 10 0 0 1 21 4z', Ed, E);
  var pick = L('M8 26 22 10', S, 2.200) + P('M12 5c6-1 12 2 15 8-4-3-8-4-12-3z', O, null);
  var chevrons = function (c) { return L('M9 17l7-7 7 7M9 25l7-7 7 7', c || O, 2.400); };

  function droneBody(x, y, w, hgt) { return X(x, y, w, hgt, 2.500, K, S) + eye(x + w / 2, y + hgt / 2); }

  var ART = {
    // ---- drones, by tier ----
    drone0: droneBody(9, 6, 14, 9) + L('M12 15v7m8-7v7', S) + P('M5 22h22l-3 5H8z', O) + L('M9 6 7 3m16 3 2-3', M, 1.200),
    drone1: droneBody(9, 3, 14, 10) + P('M10 13h12l-6 16z', Od, O) + L('M11.500 17h9m-7.500 4h6m-4.500 4h3', O, 1.200),
    drone2: P('M5 13l-4 3 4 3z', E) + droneBody(5, 11, 12, 10) + L('M17 16h4', S) + P('M21 11l5-2 4 5-1 6-6 2-3-5z', Od, O),
    drone3: droneBody(3, 4, 12, 10) + L('M13 13l6 6', S, 2) + C(21, 21, 7.500, B, O) + C(21, 21, 7.500, null, O, 3.500).replace('/>', ' stroke-dasharray="2.300 3.600"/>') + C(21, 21, 2, O),
    drone4: P('M3 4h10l-2 22H3z', K, S) + P('M29 4H19l2 22h8z', K, S) + L('M5 9h6M5 14h5.500M5 19h5m16-10h-6m6 5h-5.500M27 19h-5', M, 1.200) + lump(12.500, 9, O, Od).replace('M12.500 13', 'M13 13') + C(14.500, 22, 1.600, O) + C(18, 25, 1.200, O) + C(16.500, 28.500, 1, O),
    drone5: droneBody(2, 10, 12, 12) + X(14, 13, 5, 6, 1, M, S, 1.200) + L('M19 16h10', E, 3) + L('M19 16h10', '#fff6d2', 1) + L('M27 10l2-2m-2 14 2 2m-5-15v-3m0 20v-3', E, 1.200),
    drone6: C(16, 16, 12, null, D, 1.300).replace('/>', ' stroke-dasharray="3 3"/>') + C(16, 16, 7.500, null, D, 1.300) + P('M12 16l2-4 4 0 2 4-2 4-4 0z', Od, O) + L('M16 2v4m0 20v4M2 16h4m20 0h4', S),
    drone7: [[8, 7], [22, 6], [15, 15], [7, 23], [24, 22]].map(function (p, i) { return P('M' + p[0] + ' ' + (p[1] - 4) + 'l4 4-4 4-4-4z', i === 2 ? O : K, i === 2 ? O : S, 1.300) + C(p[0], p[1], 1.100, i === 2 ? B : E); }).join('') + L('M11 10l2 2m5-1 2-2m-8 9-2 2m8-1 3 2', M, 1),
    // ---- icebreakers ----
    breaker0: P('M9 3h14l-7 15z', K, S) + L('M12.500 7h7', M, 1.200) + P('M3 18h10l3 4 3-4h10v10H3z', Id, I) + L('M16 22l-2 3 3 3', I, 1.200),
    breaker1: droneBody(9, 2, 14, 9) + P('M11 11h10l-5 13z', Ed, E) + L('M12.500 15h7m-5.500 4h4', E, 1.200) + P('M3 21h9l4 5 4-5h9v8H3z', Id, I),
    breaker2: P('M5 19h22l-4 9H9z', K, S) + L('M5 19h22', I, 2) + L('M10 15c-2-3 2-4 0-7m6 7c-2-3 2-5 0-9m6 9c-2-3 2-4 0-7', I, 1.600),
    // ---- colony upgrades ----
    power: lump(4, 18) + lump(17, 19) + chevrons(E).replace('M9 17l7-7 7 7M9 25l7-7 7 7', 'M9 10l7-7 7 7M9 17l7-7 7 7'),
    hull: P('M16 3l11 4v8c0 7-5 11-11 14C10 26 5 22 5 15V7z', M, S) + P('M16 3v26C10 26 5 22 5 15V7z', K) + L('M16 3l11 4v8c0 7-5 11-11 14C10 26 5 22 5 15V7z', S) + L('M10 11h4m-4 5h4m4-5h4m-4 5h4', B, 1.300),
    dispatch: dish + waves(D),
    repair: wrench,
    // ---- buildings ----
    panels: P('M4 8l20-4 4 14-20 4z', Ed, E) + L('M10.700 6.700l4 14M17.300 5.300l4 14M5.300 12.700l20-4M6.700 17.300l20-4', B, 1.200) + L('M17 21v7m-6 0h12', S),
    reactor: C(16, 16, 4, E) + '<ellipse cx="16" cy="16" rx="13" ry="5" fill="none" stroke="' + S + '" stroke-width="1.400"/>' + '<ellipse cx="16" cy="16" rx="13" ry="5" fill="none" stroke="' + S + '" stroke-width="1.400" transform="rotate(60 16 16)"/>' + '<ellipse cx="16" cy="16" rx="13" ry="5" fill="none" stroke="' + S + '" stroke-width="1.400" transform="rotate(120 16 16)"/>',
    peak: L('M2 20h6l3-13 4 20 4-14 2 7h9', E, 2) + C(11, 7, 2, '#fff6d2'),
    smelter: furnace,
    purifier: drop(11, 3, 3.400, Id, I) + P('M19 12h9l-3 6v8l-3 2v-10z', K, S) + L('M4 22h10M6 26h6', I, 1.300),
    electro: drop(9, 5, 3.600, Id, I) + L('M15 16h4', S) + bolt(22, 6, 1.250, E) + L('M5 26h22', M, 1.200) + C(20, 26, 1.500, I) + C(25, 26, 1.500, E),
    factory: chip,
    lab: flask,
    dome: dome,
    hangar: P('M3 27V15A13 13 0 0 1 29 15v12z', K, S) + P('M9 27v-9a7 7 0 0 1 14 0v9z', B, M, 1) + '<g transform="translate(8.800 12.400) scale(.450)">' + rocket(I) + '</g>',
    autosmelt: gear(13, 18, S) + P('M24 3l6 7h-4v8h-4v-8h-4z', D),
    // ---- research not covered by the things it opens ----
    far: dish + waves(E) + spark(6, 7, 3, E),
    jump: engine,
    queue: L('M5 8h14M5 16h14M5 24h14', S, 2) + P('M22 5l6 3-6 3z', D) + C(25, 16, 2, M) + C(25, 24, 2, M),
    // ---- expeditions ----
    exp0: lump(9, 11) + '<ellipse cx="16" cy="16" rx="13" ry="7" fill="none" stroke="' + M + '" stroke-width="1.200" stroke-dasharray="2 3"/>' + P('M26 12l4 5-6 0z', I),
    exp1: [[4, 20, 2.200], [9, 13, 1.600], [15, 9, 2.600], [22, 10, 1.800], [27, 15, 2.200], [12, 21, 1.300], [20, 17, 1.400]].map(function (p) { return C(p[0], p[1], p[2], Od, O, 1); }).join('') + P('M13 28l5-3-1 5z', I) + L('M3 28c6-2 8-1 11 0', M, 1).replace('/>', ' stroke-dasharray="2 2"/>'),
    exp2: lump(2, 17) + '<g transform="translate(17 2)">' + lump(0, 0, I, Id) + '</g>' + L('M11 19c3-6 6-9 9-10', S, 1.300).replace('/>', ' stroke-dasharray="2 2.500"/>') + P('M19 6l4 2.500-4 2z', S),
    exp3: '<g transform="translate(-3 9) scale(.700) rotate(40 16 16)">' + rocket(I) + '</g>' + spark(25, 7, 5, E) + C(6, 6, 1, S) + C(13, 3, .800, S) + C(28, 20, .800, S) + C(21, 27, 1, S),
    container: crate,
    flight: '<g transform="rotate(45 16 16)">' + rocket(I) + '</g>',
    // ---- the jump tab ----
    engine: engine,
    'meta-mine': pick + spark(8, 9, 4, V),
    'meta-research': nodes.split(D).join(V).split(Dd).join(Vd),
    'meta-build': X(4, 17, 10, 10, 1, K, S) + X(18, 17, 10, 10, 1, K, S) + X(11, 6, 10, 10, 1, Vd, V) + L('M24 6h6', V, 2.200),
    'meta-exp': '<g transform="translate(6 0)">' + rocket(V) + '</g>' + L('M3 9h5M1 15h7M3 21h5', V, 1.800),
    'meta-offline': moon.split(E).join(V).split(Ed).join(Vd) + spark(24, 9, 3, V) + C(19, 16, 1, V),
    'meta-colonists': person(9, 11, S) + person(23, 11, S) + person(16, 14, V),
    'meta-memory': droneBody(10, 11, 12, 10) + L('M6 12a11 11 0 0 1 19-4M26 20a11 11 0 0 1-19 4', V, 1.600) + P('M26 4v6h-6zM6 28v-6h6z', V),
    'st-ore': station(O, C(16, 16, 2.600, O)),
    'st-ice': station(I, P('M16 12l3 4-3 4-3-4z', I)),
    'st-sun': station(E, C(16, 16, 2.600, E)),
    'st-lab': station(D, P('M14.500 12.500h3v2.500l2 4h-7l2-4z', D)),
    'st-dock': station(S, X(13, 13.500, 6, 5, .500, O)),
    cluster: L('M6 8l9 4 9-6M15 12l-5 11 13 2-8-13M24 6l-1 19', M, 1.200) + C(6, 8, 2.400, E) + C(15, 12, 3.200, V) + C(24, 6, 2, I) + C(10, 23, 2.400, O) + C(23, 25, 2.800, E),
    // ---- resources ----
    'res-ore': rock,
    'res-ice': ice,
    'res-alloy': ingot,
    'res-water': drop(16, 2, 5.600, Id, I) + L('M11 20a5 5 0 0 0 4 4.500', '#e6f3fa', 1.600),
    'res-fuel': canister,
    'res-chip': chip,
    'res-data': nodes,
    'res-colonists': '<g transform="translate(-8 -4) scale(1.5)">' + person(16, 8, S) + '</g>',
    'res-energy': bolt(15, 3, 2.100, E),
    'res-dm': dm,
    'res-beacon': beacon,
    // ---- samples ----
    's-chondrite': rock + C(11, 14, 1.600, S) + C(19, 12, 1.300, S) + C(17, 21, 1.800, S) + C(23, 18, 1, S),
    's-stoneice': P('M5 19l3-6h16l3 6-5 8H10z', Od, O) + P('M8 13l3-6 5-3 5 3 3 6-4 3-4-2-4 2z', Id, I) + L('M16 4v11', I, 1),
    's-glass': P('M9 28L5 13l8-10 13 6-3 16z', Dd, D) + L('M13 3l2 12 11-6M15 15L9 28m6-13 8 10', '#e2f1e6', 1),
    's-olivine': P('M10 28L6 14l5-9h5l4 9-3 14z', Dd, D) + P('M19 28l-1-10 3-6h4l3 7-3 9z', '#7fa089', D, 1.300) + L('M11 5l1 23m9-16 1 16', '#e2f1e6', 1),
    's-darkdust': P('M3 27c3-8 8-13 13-13s10 5 13 13z', Vd, V) + C(10, 9, 1.300, V) + C(17, 6, 1, V) + C(23, 10, 1.500, V) + C(14, 11, .800, V) + C(12, 21, 1, B) + C(19, 19, 1.200, B) + C(22, 24, .900, B),
    's-debris': P('M4 9l12-4 2 7-11 5z', I, null) + L('M8 7.700l2.500 7M12 6.300l2.500 7', B, 1.100) + L('M17 10l5 4', S, 1.600) + P('M19 14l7-2 3 6-2 8-7-1-3-5z', K, S) + C(24, 19, 2, E) + L('M3 22l4 2m-3 4 5-1', M, 1.200),
    's-seeds': P('M9 14a7 7 0 0 1 14 0v8a7 7 0 0 1-14 0z', K, S) + L('M9 16h14', S, 1.200) + L('M16 26v-7', D, 1.600) + P('M16 21c-3 0-4.500-1.500-4.500-4 3 0 4.500 1.500 4.500 4zm0-2c0-2.500 1.500-4 4.500-4 0 2.500-1.500 4-4.500 4z', D) + L('M13 7V4h6v3', S),
    's-magnet': P('M6 5h7v11a3 3 0 0 0 6 0V5h7v11a10 10 0 0 1-20 0z', R, null) + P('M6 5h7v5H6zm13 0h7v5h-7z', S) + L('M3 26l3-2m23 2-3-2M16 28v3', E, 1.300),
    's-ringdust': '<ellipse cx="16" cy="17" rx="13" ry="5" fill="none" stroke="' + I + '" stroke-width="2.500" stroke-dasharray="1.500 2.500"/>' + C(16, 15, 6, Od, O) + P('M3.500 18.500a13 5 0 0 0 25 0', null, I, 2.500).replace('/>', ' stroke-dasharray="1.500 2.500"/>') + C(6, 8, .900, I) + C(26, 25, .900, I),
    's-stardust': P('M3 28c2-6 7-10 13-10s11 4 13 10z', Ed, E) + spark(16, 9, 6, E) + spark(6, 14, 2.500, '#fff6d2') + spark(26, 13, 3, '#fff6d2') + C(11, 24, .900, B) + C(18, 22, 1, B) + C(22, 25, .800, B),
    's-signal': X(3, 6, 26, 20, 2.500, B, M) + L('M5 16h3l2-6 3 12 3-9 2 6 2-3h7', D, 1.700),
    's-amber': P('M16 3c6 7 9 11 9 16a9 9 0 0 1-18 0c0-5 3-9 9-16z', '#5a4636', O) + L('M11 19a5 5 0 0 0 4 5', O, 1.300) + P('M17 13l2 3-1 3-2-2z', B) + C(14, 15, .900, B),
    // ---- stars ----
    'star-yellow': star(8, E, Ed),
    'star-red': star(5.500, R, '#8a5650') + L('M16 4v3m0 18v3M4 16h3m18 0h3', '#8a5650', 1.200),
    'star-blue': star(10, I, Id) + L('M24 5l3-3m-1 7 4-1', '#e6f3fa', 1.500) + P('M22 6c3 0 5 2 5 5-2-1-4-2-5-5z', '#e6f3fa'),
    'star-white': star(4.500, '#eef0f1', M) + C(16, 16, 12, null, K, 1),
    'star-nebula': P('M4 18c-1-6 4-10 9-9 2-5 10-5 12 1 5 1 6 8 1 10-1 5-8 6-11 3-5 2-10-1-11-5z', Vd, V) + C(13, 15, 1.500, E) + C(20, 18, 1, '#eef0f1') + C(18, 11, .900, I) + C(10, 20, .800, '#eef0f1'),
    'star-binary': C(11, 14, 7, E) + C(22, 20, 5, R) + '<ellipse cx="16" cy="17" rx="14" ry="11" fill="none" stroke="' + M + '" stroke-width="1" stroke-dasharray="2 3" transform="rotate(25 16 17)"/>',
    'star-pulsar': P('M16 16L3 2h5zm0 0l13 14h-5z', Id) + C(16, 16, 5, '#e6f3fa', I) + L('M24 7a12 12 0 0 1 2 5M8 25a12 12 0 0 1-2-5', I, 1.300),
    'star-neutron': C(16, 16, 3, '#eef0f1') + C(16, 16, 6.500, null, I, 1.300) + C(16, 16, 10, null, Id, 1.200) + C(16, 16, 13.500, null, K, 1.200),
    'star-hole': '<ellipse cx="16" cy="16" rx="14" ry="5.500" fill="none" stroke="' + O + '" stroke-width="2.500" transform="rotate(-18 16 16)"/>' + C(16, 16, 7, '#0c0d0e', E) + P('M3.200 20a14 5.500 -18 0 0 26-8', null, O, 2.500),
    // ---- events ----
    'ev-meteor': L('M4 3l9 9M14 2l8 8M3 13l7 7', E, 1.500) + lump(11, 11) + lump(20, 9) + lump(8, 20),
    'ev-comet': P('M3 4l17 9-7 6z', Id, null) + L('M3 4l13 12M5 10l8 6M9 4l9 9', I, 1.200) + C(20, 19, 6, '#e6f3fa', I),
    'ev-flare': C(16, 16, 6.500, E) + L('M16 2v5m0 18v5M2 16h5m18 0h5M6 6l3.500 3.500m13 13L26 26M26 6l-3.500 3.500m-13 13L6 26', E, 2),
    'ev-wreck': P('M3 12l10-5 3 7-10 5z', I, null) + L('M7 10l3 7m1-9 3 7', B, 1.100) + P('M17 13l8-4 4 7-3 9-8 1-3-7z', K, S) + L('M17 13l5 6 7-3m-7 3-1 7', M, 1.100) + L('M4 24l4 1m-2 4 5-2', M, 1.300),
    'ev-signal': dish + waves(E),
    'ev-fault': droneBody(4, 12, 14, 11).replace(E, R) + L('M7 23v4m8-4v4', S) + P('M23 3l7 13H16z', E) + L('M23 8v4', B, 1.800) + C(23, 14, .900, B),
    'ev-truck': P('M3 11h17v10H3z', K, S) + L('M8.500 11v10m5.500-10v10', M, 1.200) + P('M20 13h5l4 4v4h-9z', M, S) + P('M3 14l-2 2 2 2z', E) + C(9, 25, 2.200, B, S) + C(23, 25, 2.200, B, S),
    'ev-dust': L('M3 9c4-3 7 3 11 0s7-3 11 0M5 16c4-3 7 3 11 0s7-3 11 0M3 23c4-3 7 3 11 0s7-3 11 0', O, 1.800) + C(27, 6, 1, O) + C(4, 28, 1, O),
    'ev-settlers': person(8, 10, S) + person(16, 8, D) + person(24, 10, S) + L('M3 27h26', M, 1.300),
    'ev-swarm': dome + C(6, 5, 1.200, O) + C(13, 3, .900, O) + C(21, 5, 1.300, O) + C(27, 9, .900, O) + L('M6 5l3 4m12-4-2 4', Od, 1),
    'ev-link': dish + L('M22 3l7 7m0-7-7 7', R, 1.800),
    'ev-vein': rock + P('M7 20l6-5 4 3 7-7', null, E, 2.600) + spark(24, 8, 3.500, '#fff6d2'),
    'ev-mirror': P('M5 17 9 9l8-3 8 4 3 8-5 7-10 1-6-5z', K, S) + P('M9 9l8-3 2 9-6 3z', '#e6f3fa') + L('M17 6l2 9 9 3m-9-3-6 3-5 9', S, 1) + spark(25, 6, 3.500, E),
    'ev-clot': dm,
    'ev-calm': X(3, 9, 23, 14, 2.500, K, S) + X(26, 13, 3, 6, 1, S) + X(5.500, 11.500, 18, 9, 1, D),
    away: moon + lump(3, 19),
    log: P('M7 3h14l5 5v21H7z', K, S) + L('M21 3v5h5M11 13h10m-10 5h10m-10 5h6', S, 1.300),
    steps: P('M9 4c3 0 4 3 4 6s-1 6-1 8H7c0-2-2-5-2-8s1-6 4-6zm-2 16h5v3a2.500 2.500 0 0 1-5 0z', S) + P('M22 9c3 0 4 3 4 6s-2 6-2 8h-5c0-2-1-5-1-8s1-6 4-6zm-3 16h5v1.500a2.500 2.500 0 0 1-5 0z', E),
    rock: rock
  };

  var ALIAS = {
    'r-grab': 'drone2', 'r-smelt': 'smelter', 'r-ice': 'breaker0', 'r-purify': 'purifier', 'r-dome': 'dome', 'r-electro': 'electro',
    'r-crush': 'drone4', 'r-chips': 'factory', 'r-reactor': 'reactor', 'r-gravity': 'drone6', 'r-dispatch': 'dispatch',
    'r-autosmelt': 'autosmelt', 'r-far': 'far', 'r-jump': 'jump',
    'b-smelter': 'smelter', 'b-purifier': 'purifier', 'b-electro': 'electro', 'b-factory': 'factory', 'b-lab': 'lab'
  };

  function svg(name) {
    var body = ART[name] || ART[ALIAS[name]] || ART.rock;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">' + body + '</svg>';
  }

  function el(name, cls) {
    var box = document.createElement('span');
    box.className = 'ac-pic' + (cls ? ' ' + cls : '');
    box.innerHTML = svg(name);
    return box;
  }

  window.AcArt = { svg: svg, el: el, has: function (name) { return !!(ART[name] || ART[ALIAS[name]]); }, names: Object.keys(ART) };
})();
