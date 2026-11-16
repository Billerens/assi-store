// The pictures of «Подземка»: window.SubwayArt. Every thing of a list (a line, an upgrade, a node
// of the Бюро, a patent, an event, a task, a milestone, a retro train, a resource) has its own
// drawn SVG in one style: a 48×48 rounded tile, a signage pictogram of round 2.6 px strokes and
// flat fills, no text inside, no shadows. The tile says the kind: a line — its colour with a dark
// sign, the Бюро — a blueprint, a patent — gold, an event — violet, the rest — graphite.
//   SubwayArt.svg('bureau:depot', { state: 'done' })   the markup
//   SubwayArt.el('line:3', { color: '#A0704F' })       an <svg class="sw-art"> element
//   names: line:N, retro:N, mile:N, up:*, city:*, task:*, bureau:*, patent:*, event:*, res:*, ui:*
//   o.color / o.color2 — the colour of a line (two for a transfer), o.state — 'done' | 'locked'.
(function () {
  var INK = '#EDEDED';
  var K = '#101010';
  var Y = '#F2C230';
  var R = '#E5484D';
  var B = '#5AA2F8';
  var G = '#5FD08A';
  var M = '#8A93A0';
  var BROWN = '#A0704F';

  function f(fill, d) { return '<path d="' + d + '" fill="' + fill + '" stroke="none"/>'; }
  function fs(fill, d) { return '<path d="' + d + '" fill="' + fill + '"/>'; }
  function p(d, stroke, width) { return '<path d="' + d + '"' + (stroke ? ' stroke="' + stroke + '"' : '') + (width ? ' stroke-width="' + width + '"' : '') + '/>'; }
  function c(x, y, r, fill, stroke) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '"' + (fill ? ' fill="' + fill + '"' : '') + (stroke ? ' stroke="' + stroke + '"' : '') + '/>'; }
  function dot(x, y, r, fill) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + fill + '" stroke="none"/>'; }
  function r(x, y, w, h, rx, fill, stroke) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (rx || 0) + '"' + (fill ? ' fill="' + fill + '"' : '') + (stroke ? ' stroke="' + stroke + '"' : '') + '/>'; }
  function star(cx, cy, R1, R2, fill) {
    var d = '';
    for (var i = 0; i < 10; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 5;
      var rr = i % 2 ? R2 : R1;
      d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ' ' + (cy + Math.sin(a) * rr).toFixed(1);
    }
    return f(fill, d + 'z');
  }
  var PLANE = 'M24 6c2 0 3 2 3 5v7l13 8v4l-13-4v8l4 3v3l-7-2-7 2v-3l4-3v-8l-13 4v-4l13-8v-7c0-3 1-5 3-5z';
  var CAPSULE = p('M9 24a8 8 0 0 1 8-8h13a8 8 0 0 1 0 16H17a8 8 0 0 1-8-8z') + p('M30 16v16') + p('M3 17h5M2 31h6M41 11v26');
  var SNOW = 'M24 8v32M10.1 16l27.8 16M10.1 32l27.8-16M20 11l4 4 4-4M20 37l4-4 4 4M9.5 22.5l5.5-1.5-1.5-5.5M38.5 25.5L33 27l1.5 5.5M13.5 32.5L15 27l-5.5-1.5M34.5 15.5L33 21l5.5 1.5';
  var CAP = 'M5 20l19-8 19 8-19 8z';
  var TICKET = 'M7 15h34v6a3 3 0 0 0 0 6v6H7v-6a3 3 0 0 0 0-6z';
  function gear(x, y, rad, col) {
    var d = '';
    for (var i = 0; i < 6; i++) {
      var a = i * Math.PI / 3;
      d += 'M' + (x + Math.cos(a) * rad).toFixed(1) + ' ' + (y + Math.sin(a) * rad).toFixed(1) + 'L' + (x + Math.cos(a) * (rad + 3)).toFixed(1) + ' ' + (y + Math.sin(a) * (rad + 3)).toFixed(1);
    }
    return c(x, y, rad, K, col) + p(d, col) + dot(x, y, 1.6, col);
  }
  function rings(a, b) { return '<circle cx="18" cy="24" r="8.5" stroke="' + a + '" stroke-width="4"/><circle cx="30" cy="24" r="8.5" stroke="' + b + '" stroke-width="4"/>'; }
  function clock(x, y, rad) { return c(x, y, rad) + p('M' + x + ' ' + (y - rad * 0.6).toFixed(1) + 'V' + y + 'l' + (rad * 0.45).toFixed(1) + ' ' + (rad * 0.3).toFixed(1)); }
  function bell(col) { return fs(col || 'none', 'M24 8a10 10 0 0 1 10 10v8l4 7H10l4-7v-8a10 10 0 0 1 10-10z') + p('M21 37a3 3 0 0 0 6 0'); }

  // ---- the lines: a dark sign on the colour of the line ------------------------------------------------
  var LINES = {
    1: p('M8 39h32M13 39V27h7M28 39V29h7v10M20 39V19l4-9 4 9v20') + dot(24, 26, 1.8, K),
    2: p('M24 7v15M24 9l10 11H24M13 23h22l-3 5H16z') + p('M8 34q4-4 8 0t8 0 8 0 8 0M8 41q4-4 8 0t8 0 8 0 8 0'),
    3: p('M7 39V25l8 5v-5l8 5v-5l7 4V9h7v30z') + p('M13 34h4M22 34h4'),
    4: dot(24, 11, 4.2, K) + dot(17.5, 15.5, 4.2, K) + dot(30.5, 15.5, 4.2, K) + dot(20, 23, 4.2, K) + dot(28, 23, 4.2, K) + p('M24 26v15M24 37q8-1 9-8q-8 0-9 8M24 39q-7-1-8-6q7 0 8 6'),
    5: f(K, CAP) + p('M13 25v8q11 7 22 0v-8M43 20v11'),
    6: c(24, 10, 3.2) + p('M24 13v26M16 20h16M9 27c1 8 6 12 15 12s14-4 15-12M9 27l-2 5M39 27l2 5'),
    7: c(24, 15, 8) + p('M24 10v5l3 2') + p('M7 40h34M11 40V28h26v12M20 40v-7h8v7'),
    8: p(SNOW),
    9: f(K, 'M24 5l9 12h-4l8 10h-5l7 9H9l7-9h-5l8-10h-4z') + p('M24 36v6', K, 4),
    10: f(K, PLANE),
    11: p('M24 14V7M16 7h16') + r(12, 14, 24, 23, 5) + p('M12 26h24M24 14v12M16 41l2-4M32 41l-2-4') + dot(17, 32, 1.8, K) + dot(31, 32, 1.8, K),
    12: p('M5 13l38-6M24 10v8') + r(13, 18, 22, 18, 5) + p('M13 27h22M24 18v9M20 41h8'),
    13: CAPSULE + dot(20, 24, 3, K)
  };

  // ---- upgrades of a line and of the city --------------------------------------------------------------
  var UP = {
    boost: f(Y, 'M27 5L11 27h10l-3 16 18-23H25z'),
    districts: r(8, 8, 14, 14, 3) + r(26, 8, 14, 14, 3, Y, Y) + r(8, 26, 14, 14, 3) + r(26, 26, 14, 14, 3) + dot(15, 15, 2, INK) + dot(15, 33, 2, INK) + dot(33, 33, 2, INK) + dot(33, 15, 2, K),
    cars: r(4, 20, 18, 14, 3) + r(26, 20, 18, 14, 3) + p('M22 28h4M8 25h10M30 25h10') + dot(9, 37, 2.2, INK) + dot(17, 37, 2.2, INK) + dot(31, 37, 2.2, INK) + dot(39, 37, 2.2, INK) + p('M24 5v10M19 10h10', Y, 3),
    express: p('M19 13h9c9 0 14 7 14 12v6H19z') + p('M30 13v8h11') + p('M5 17h9M3 24h11M7 31h7', Y) + p('M17 38h26'),
    duty: f(Y, 'M29 6a15 15 0 1 0 12 24A13 13 0 0 1 29 6z') + star(11, 11, 4, 1.7, INK) + dot(38, 12, 1.6, INK) + p('M7 42h34'),
    recon: r(6, 19, 36, 10, 2) + f(Y, 'M10 29l8-10h6l-8 10zM22 29l8-10h6l-8 10zM34 29l6-8v8z') + p('M12 29v12M36 29v12M7 41h10M31 41h10') + dot(24, 10, 4, R),
    tariff: p(TICKET) + '<path d="M29 17v14" stroke-dasharray="2 4"/>' + dot(18, 24, 4.5, Y) + p('M35 22v4'),
    transfer: function (o) { return rings(o.color || R, o.color2 || B); },
    ring: '<circle cx="24" cy="24" r="14" stroke="' + M + '" stroke-width="5"/>' + c(24, 10, 3.6, K) + c(38, 24, 3.6, K) + c(24, 38, 3.6, K) + c(10, 24, 3.6, K),
    airport: '<g transform="translate(24 20) rotate(45) scale(.72) translate(-24 -24)">' + f(Y, PLANE) + '</g>' + p('M6 41h36M12 37v8M24 37v8M36 37v8'),
    auto: function (o) {
      var on = o.on !== false;
      return r(7, 16, 34, 16, 8, on ? '#1E3B2A' : K, on ? G : M) + dot(on ? 33 : 15, 24, 5, on ? G : M);
    }
  };

  // ---- the city: the move, the tasks ---------------------------------------------------------------------
  var CITY = {
    move: p('M6 40V24h8v16M14 40V13h10v27M18 19h2M18 26h2M18 33h2M4 40h24') + p('M29 27h13M36 20l7 7-7 7', Y, 3),
    general: p('M24 12L12 41M24 12l12 29M16 31h16', Y) + c(24, 9, 3.2, K, Y) + star(24, 23, 3.4, 1.5, INK)
  };
  var TASK = {
    lines: p('M9 13h30', R, 4) + p('M9 24h30', B, 4) + p('M9 35h30', G, 4) + c(15, 13, 3, K) + c(31, 24, 3, K) + c(21, 35, 3, K),
    stations: '<circle cx="24" cy="21" r="11" stroke="' + R + '" stroke-width="4.5"/>' + r(7, 18, 34, 6.5, 1.5, INK, INK) + p('M24 33v9M17 42h14'),
    transfers: rings(INK, Y),
    income: c(24, 24, 16, K, Y) + p('M14 31l7-8 5 5 8-10M28 18h6v6', Y, 3),
    calm: dot(17, 13, 4.2, INK) + p('M9 34v-6a8 8 0 0 1 16 0v6M5 40h38') + p('M29 17l5 5 9-11', G, 3.2)
  };
  var MILE = ['#C98A4B', '#C9CED6', Y];
  function mile(i) {
    var col = MILE[Math.min(i, 2)];
    var out = fs(R, 'M15 5l9 14 9-14z') + c(24, 29, 12, K, col) + star(24, 29, 7, 3, col);
    if (i > 2) out += p('M6 22l4 2M42 22l-4 2M6 38l4-2M42 38l-4-2', Y);
    return out;
  }

  // ---- the retro trains: side views in the colour of their line --------------------------------------------
  function wheels(xs) { return xs.map(function (x) { return c(x, 37, 2.6, K, INK); }).join(''); }
  function body(col, x, w) { return r(x, 18, w, 16, 4, col, INK); }
  var RETRO = [
    function (col) { return body(col, 4, 18) + body(col, 26, 18) + p('M22 27h4') + r(8, 22, 10, 5, 1, K, K) + r(30, 22, 10, 5, 1, K, K) + wheels([9, 17, 31, 39]) + p('M3 41h42'); },
    function (col) { return body(col, 5, 38) + f(Y, 'M6.3 28h35.4v3H6.3z') + r(10, 21, 6, 5, 1, K, K) + r(21, 21, 6, 5, 1, K, K) + r(32, 21, 6, 5, 1, K, K) + wheels([12, 20, 30, 38]) + p('M3 41h42'); },
    function (col) { return body(col, 5, 38) + r(9, 21, 30, 4.5, 1, K, K) + p('M12 28v6M19 28v6M26 28v6M33 28v6', K, 1.6) + p('M5 15h38') + wheels([12, 20, 30, 38]) + p('M3 41h42'); },
    function (col) { return body(col, 5, 38) + r(9, 21, 30, 7, 2, '#BFE3F5', K) + p('M39 18V7') + f(Y, 'M39 7h-8l2 3-2 3h8z') + wheels([12, 20, 30, 38]) + p('M3 41h42'); },
    function (col) { return body(col, 5, 38) + r(15, 21, 18, 10, 1.5, INK, K) + p('M15 22l9 6 9-6', K, 1.8) + wheels([12, 20, 30, 38]) + p('M3 41h42'); },
    function () { return body('#C98A4B', 5, 38) + star(24, 26, 6, 2.6, Y) + r(8, 21, 6, 5, 1, K, K) + r(34, 21, 6, 5, 1, K, K) + p('M5 15h38', Y) + wheels([12, 20, 30, 38]) + p('M3 41h42'); },
    function (col) { return body(col, 14, 29) + fs(Y, 'M14 22L3 40h11z') + r(22, 21, 7, 5, 1, K, K) + r(33, 21, 6, 5, 1, K, K) + wheels([22, 37]) + p('M3 41h42') + dot(6, 14, 1.6, INK) + dot(12, 9, 1.6, INK) + dot(20, 12, 1.6, INK) + dot(3, 24, 1.6, INK); },
    function (col) { return f(Y, 'M30 26L45 17v18z') + body(col, 3, 28) + r(7, 21, 6, 5, 1, K, K) + r(17, 21, 6, 5, 1, K, K) + dot(29, 26, 2.4, Y) + wheels([9, 24]) + p('M3 41h42') + star(40, 9, 3.4, 1.4, INK) + dot(31, 7, 1.4, INK); }
  ];

  // ---- Бюро инженера: white lines on a blueprint ---------------------------------------------------------
  var BUREAU = {
    budget: r(6, 15, 36, 20, 3) + c(24, 25, 5.5, Y, Y) + p('M11 20v2M37 28v2'),
    dispatch: p('M11 28v-4a13 13 0 0 1 26 0v4') + r(7, 27, 7, 11, 3) + r(34, 27, 7, 11, 3) + p('M37 38c0 4-5 5-10 5', Y) + dot(25, 43, 2, Y),
    longShift: clock(24, 24, 14) + p('M9 8l-4 4M39 8l4 4', Y),
    nightShift: clock(20, 28, 12) + f(Y, 'M37 6a8.5 8.5 0 1 0 7 14A7.5 7.5 0 0 1 37 6z'),
    depot: p('M6 40V19l18-11 18 11v21M15 40V25h18v15M15 31h18') + dot(20, 36, 1.8, Y) + dot(28, 36, 1.8, Y),
    design: p('M8 40V13l27 27zM14 34v-7l7 7z') + p('M34 6l8 8-11 11-8 2 2-8zM30 10l8 8', Y),
    transfers: rings('#DCEBFA', '#DCEBFA') + p('M39 5v10M34 10h10', Y, 3),
    quickStart: p('M8 12l9 12-9 12M20 12l9 12-9 12') + p('M32 12l9 12-9 12', Y, 3),
    loud: bell() + p('M41 11q3.5 6 0 12M7 11q-3.5 6 0 12', Y),
    sense: p('M5 24q19-19 38 0q-19 19-38 0z') + c(24, 24, 6, Y, Y) + dot(24, 24, 2.2, K),
    tariffs: p(TICKET) + '<path d="M17 17v14" stroke-dasharray="2 4"/>' + gear(30, 24, 5, Y),
    sleep: p('M5 38V17M5 31h38v7M43 31v-4a5 5 0 0 0-5-5H17v9') + dot(11, 25, 3, '#DCEBFA') + f(Y, 'M34 5a6.5 6.5 0 1 0 6 10A5.5 5.5 0 0 1 34 5z'),
    experience: star(22, 23, 14, 6, Y) + p('M38 30v12M32 36h12', '#DCEBFA', 3),
    hub: p('M24 24L10 10M24 24l14-14M24 24L10 38M24 24l14 14') + c(10, 10, 4, K) + c(38, 10, 4, K) + c(10, 38, 4, K) + c(38, 38, 4, K) + c(24, 24, 6.5, Y, Y),
    memory: p('M9 32a15 15 0 0 1 30 0z') + r(7, 32, 34, 8, 2) + p('M16 32v-7h5v7M21 32V18h6v14M27 32v-5h5v5', Y),
    autoTransfer: rings('#DCEBFA', '#DCEBFA') + gear(38, 11, 4.5, Y)
  };

  // ---- Патентное бюро: gold --------------------------------------------------------------------------------
  var PATENT = {
    pneumo: CAPSULE + dot(20, 24, 3, Y),
    bridge: p('M3 31h42M9 31a15 13 0 0 1 30 0M16 31v-7M24 31V18M32 31v-7') + p('M5 31v10M43 31v10M5 36h4M39 36h4') + dot(24, 12, 2.2, Y),
    autobuild: p('M12 42V9h24M12 17l8-8M36 9v10M7 42h10M12 9l-5 7') + r(30, 19, 12, 8, 1.5, Y, Y) + gear(26, 36, 4.5, Y),
    capital: fs(Y, 'M6 40l3-9h11l3 9zM25 40l3-9h11l3 9zM15 29l3-9h12l3 9z')
  };

  // ---- the events ------------------------------------------------------------------------------------------
  var EVENT = {
    match: c(24, 24, 15) + f(INK, 'M24 16l7 5-2.7 8.3h-8.6L17 21z') + p('M24 16V9M31 21l7-3M28.3 29.3l4.5 6.5M19.7 29.3l-4.5 6.5M17 21l-7-3'),
    rain: p('M14 26a7.5 7.5 0 0 1 1-15 9.5 9.5 0 0 1 18 2 6.5 6.5 0 0 1 1 13z') + p('M15 32l-2.5 8M24 32l-2.5 8M33 32l-2.5 8', B, 3),
    suitcase: r(7, 16, 34, 24, 4, BROWN, INK) + p('M18 16v-5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5M15 16v24M33 16v24'),
    school: p('M13 21a11 11 0 0 1 22 0v17a3 3 0 0 1-3 3H16a3 3 0 0 1-3-3zM20 10a4 4 0 0 1 8 0') + r(18, 27, 12, 9, 2, Y, Y) + p('M13 24h22'),
    musician: p('M17 35V12l19-5v23') + dot(12.5, 35, 4.8, Y) + dot(31.5, 30, 4.8, Y) + p('M17 19l19-5'),
    fair: fs(R, 'M7 20l5-11h24l5 11z') + p('M7 20a4.25 4.25 0 0 0 8.5 0 4.25 4.25 0 0 0 8.5 0 4.25 4.25 0 0 0 8.5 0 4.25 4.25 0 0 0 8.5 0M11 25v15M37 25v15M6 40h36M18 9l-2 11M30 9l2 11'),
    mall: fs(Y, 'M11 18h26l2 23H9z') + p('M17 18v-3a7 7 0 0 1 14 0v3') + dot(17, 24, 1.6, K) + dot(31, 24, 1.6, K),
    snow: p(SNOW, B),
    museums: p('M6 19l18-11 18 11zM11 23v13M19.5 23v13M28.5 23v13M37 23v13M6 40h36') + star(24, 15, 2.6, 1.1, Y),
    tourist: r(6, 16, 36, 24, 4) + p('M16 16l2.5-5h11l2.5 5') + c(24, 28, 7.5) + dot(24, 28, 3.2, Y) + dot(36, 21, 1.4, INK),
    escalator: p('M5 40h11l17-20h10M5 32h7l17-20h14') + fs(Y, 'M31 43l5.5-10 5.5 10z'),
    inspector: fs(M, 'M8 24c0-12 32-12 32 0l-2 5H10z') + p('M10 29h28q-1 8-14 8t-14-8z') + star(24, 20, 4, 1.8, Y),
    graduation: f(Y, CAP) + p('M13 25v8q11 7 22 0v-8M43 20v11') + dot(43, 33, 2.2, Y),
    retro: r(20, 4, 8, 7, 1) + c(24, 25, 14, K) + c(24, 25, 5, Y, Y) + p('M8 42h32M14 36l-3 6M34 36l3 6'),
    sept1: bell(Y) + p('M24 8V4') + fs(R, 'M24 4l-8-3v6zM24 4l8-3v6z'),
    newyear: fs(G, 'M24 9l8 10h-4l7 9h-4l7 8H10l7-8h-4l7-9h-4z') + p('M24 36v6') + star(24, 7, 4.5, 1.9, Y) + dot(21, 24, 1.6, R) + dot(28, 31, 1.6, Y) + dot(18, 32, 1.6, B),
    rush: clock(20, 24, 13) + p('M37 20l4-5 4 5M37 30l4-5 4 5', Y, 3),
    glove: fs(R, 'M13 42V22a8.5 8.5 0 0 1 17 0v3l5-4a3.2 3.2 0 0 1 4.5 4.5L31 35v7z') + p('M13 35h18'),
    sparkle: star(24, 24, 15, 6, Y)
  };

  // ---- resources and the two buy buttons (no tile) -----------------------------------------------------------
  var RES = {
    money: c(24, 24, 18, Y, '#B8901C') + '<circle cx="24" cy="24" r="11" stroke="#8A6A10" stroke-width="2.6" fill="none"/>' + r(21.5, 14, 5, 20, 2, '#8A6A10', '#8A6A10'),
    oi: fs(Y, 'M8 32a16 16 0 0 1 32 0z') + fs(Y, 'M4 32h40v5H4z') + p('M24 16v9M17 18v6M31 18v6', K, 2.2),
    blueprints: r(7, 9, 34, 30, 3, '#2B6CB0', '#DCEBFA') + p('M7 19h34M7 29h34M18 9v30M30 9v30', '#5C93CC', 1.4) + p('M14 33V17l14 16z', '#DCEBFA', 2.4),
    patents: fs(R, 'M16 28l-4 16 8-4 4 6 4-6 8 4-4-16z') + c(24, 20, 14, Y, '#B8901C') + star(24, 20, 8, 3.4, '#8A6A10')
  };
  var UI = {
    turnstile: '<rect x="7" y="17" width="15" height="27" rx="4" stroke-width="3.6"/><path d="M22 23h20M22 28l15 11M22 21L34 8" stroke-width="3.6"/><circle cx="14.5" cy="25" r="2.4" fill="currentColor" stroke="none"/>',
    station: '<circle cx="24" cy="24" r="14" stroke-width="5"/>' + '<rect x="4" y="19.5" width="40" height="9" rx="2" fill="currentColor" stroke="none"/>',
    train: '<rect x="10" y="5" width="28" height="33" rx="7" stroke-width="3.6"/><path d="M10 24h28M19 11h10" stroke-width="3.6"/><circle cx="17" cy="31" r="2.6" fill="currentColor" stroke="none"/><circle cx="31" cy="31" r="2.6" fill="currentColor" stroke="none"/><path d="M15 38l-4 6M33 38l4 6" stroke-width="3.6"/>'
  };

  var TILES = {
    line: function (o) { return { fill: o.color || M, edge: 'none', ink: K }; },
    up: function () { return { fill: '#23262B', edge: '#3A3F47', ink: INK }; },
    city: function () { return { fill: '#23262B', edge: '#3A3F47', ink: INK }; },
    task: function () { return { fill: '#1B1D21', edge: '#4A505A', ink: INK, dash: true }; },
    mile: function () { return { fill: '#23262B', edge: '#3A3F47', ink: INK }; },
    retro: function () { return { fill: '#1B1D21', edge: '#3A3F47', ink: INK }; },
    bureau: function () { return { fill: '#173A5E', edge: '#3F77AE', ink: '#DCEBFA', grid: true }; },
    patent: function () { return { fill: '#2B2410', edge: Y, ink: INK }; },
    event: function () { return { fill: '#2A2547', edge: '#8B7CFF', ink: INK }; }
  };
  var SETS = { up: UP, city: CITY, task: TASK, bureau: BUREAU, patent: PATENT, event: EVENT, res: RES, ui: UI };

  function glyph(kind, id, o) {
    if (kind === 'line') return LINES[id] || LINES[1];
    if (kind === 'retro') return RETRO[Number(id) % RETRO.length](o.color || M);
    if (kind === 'mile') return mile(Number(id) || 0);
    var set = SETS[kind] || {};
    var g = set[id] || (kind === 'event' ? EVENT.sparkle : null);
    if (!g) return star(24, 24, 13, 5.5, M);
    return typeof g === 'function' ? g(o) : g;
  }

  /** The markup of a picture: name is 'kind:id', o = {color, color2, state, on, cls, size}. */
  function svg(name, o) {
    o = o || {};
    var at = String(name).indexOf(':');
    var kind = at < 0 ? name : name.slice(0, at);
    var id = at < 0 ? '' : name.slice(at + 1);
    var plain = kind === 'res' || kind === 'ui';
    var tile = plain ? null : (TILES[kind] || TILES.up)(o);
    var ink = plain ? 'currentColor' : tile.ink;
    var out = '<svg class="sw-art' + (o.cls ? ' ' + o.cls : '') + (o.state ? ' is-' + o.state : '') + '"' + (o.size ? ' width="' + o.size + '" height="' + o.size + '"' : '') + ' viewBox="0 0 48 48" aria-hidden="true">';
    if (tile) {
      out += '<rect x="1" y="1" width="46" height="46" rx="11" fill="' + tile.fill + '" stroke="' + tile.edge + '" stroke-width="1.5"' + (tile.dash ? ' stroke-dasharray="5 4"' : '') + '/>';
      if (tile.grid) out += '<path d="M12.5 2v44M24 2v44M35.5 2v44M2 12.5h44M2 24h44M2 35.5h44" stroke="#24507F" stroke-width="1" fill="none"/>';
    }
    out += '<g fill="none" stroke="' + ink + '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"' + (o.state === 'locked' ? ' opacity=".38"' : '') + '>' + glyph(kind, id, o) + '</g>';
    if (o.state === 'done') {
      out += '<circle cx="38" cy="38" r="9" fill="' + G + '" stroke="' + K + '" stroke-width="2"/><path d="M33.5 38l3.2 3.2 5.6-6.2" fill="none" stroke="' + K + '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>';
    } else if (o.state === 'locked') {
      out += '<circle cx="38" cy="38" r="9" fill="#33373E" stroke="' + K + '" stroke-width="2"/><rect x="33.5" y="37" width="9" height="6.5" rx="1.5" fill="' + INK + '"/><path d="M35.5 37v-2a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="' + INK + '" stroke-width="1.8"/>';
    }
    return out + '</svg>';
  }

  function el(name, o) {
    var holder = document.createElement('span');
    holder.innerHTML = svg(name, o);
    return holder.firstChild;
  }

  window.SubwayArt = {
    svg: svg, el: el,
    names: {
      line: Object.keys(LINES), up: Object.keys(UP), city: Object.keys(CITY), task: Object.keys(TASK), bureau: Object.keys(BUREAU),
      patent: Object.keys(PATENT), event: Object.keys(EVENT), res: Object.keys(RES), ui: Object.keys(UI), retro: RETRO.length
    }
  };
})();
