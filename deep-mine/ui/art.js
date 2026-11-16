// Drawn pictures of «Шахта вглубь»: window.DmArt. Every thing in a list has its own one: crews,
// staff, zones and their equipment, the workshop, edges, artifacts, relics, events, resources.
// One palette (rock browns, steel, amber, water, heat, crystal), a dark outline, a 32×32 box, no
// text inside. DmArt.el('pump') gives an <svg>, DmArt.rock(color, seed) a piece of a rock band.
(function () {
  const K = '#15120f';
  const C = {
    rock: '#5a4a38', rockD: '#3a3028', rockL: '#7d6a50', sand: '#c9a66b', wood: '#9a6b3c',
    steel: '#9aa3ad', steelD: '#5b636c', steelL: '#cfd6dd', amber: '#e0a23a', gold: '#f2c84b',
    water: '#5aa0d8', waterL: '#a9d2f2', gas: '#b9c36a', heat: '#e0643a', fire: '#f6b23c',
    ice: '#8fd3e8', iceL: '#d6f1f8', bone: '#e8dcc0', boneD: '#b9a985', green: '#6fae7a',
    paper: '#3d6f9e', violet: '#a79be0', copper: '#c0774a', night: '#262b3a', dark: '#1b1815'
  };
  const f = (d, c, extra) => '<path d="' + d + '" fill="' + c + '"' + (extra || '') + '/>';
  const l = (d, c, w) => '<path d="' + d + '" fill="none" stroke="' + (c || K) + '" stroke-width="' + (w || 1.5) + '"/>';
  const o = (cx, cy, r, c, extra) => '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + c + '"' + (extra || '') + '/>';
  const r = (x, y, w, h, c, rx) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (rx || 0) + '" fill="' + c + '"/>';
  const NS = ' stroke="none"';

  const crystalBody = f('M10 27l-4-9 4-8 4 8z', C.ice) + f('M17 27l-5-12 5-11 5 11z', C.iceL) + f('M24 27l-3-7 3-6 4 6z', C.ice) + l('M17 4v23M10 10v17M24 14v13', K, 1);
  const caveBody = f('M3 28V17a13 13 0 0 1 26 0v11z', C.rock) + f('M9 28v-9a7 7 0 0 1 14 0v9z', C.dark);
  const echoBody = o(16, 16, 3, C.violet) + l('M9 9a10 10 0 0 0 0 14M23 9a10 10 0 0 1 0 14', C.violet, 2) + l('M5 5a16 16 0 0 0 0 22M27 5a16 16 0 0 1 0 22', '#6f679c', 2);
  const flame = f('M16 3c2 6 8 8 8 16a8 8 0 0 1-16 0c0-4 2-6 3-9 1 3 2 4 3 4 0-4 0-7 2-11z', C.heat) + f('M16 15c2 3 4 4 4 7a4 4 0 0 1-8 0c0-2 1-3 2-5 1 1 1 2 2-2z', C.fire, NS);
  const crownBody = r(8, 5, 16, 12, C.steelD, 1) + l('M8 10h16', K, 1) + f('M8 17l2 8 2-8 2 8 2-8 2 8 2-8 2 8 2-8z', C.ice);

  const ART = {
    // ---- resources ----
    money: o(16, 16, 11, C.gold) + o(16, 16, 7, C.amber) + l('M13 13h5a2 2 0 0 1 0 4h-4a2 2 0 0 0 0 4h5M16 10v2M16 20v2', K, 1.5),
    core: r(10, 3, 12, 26, C.sand, 3) + f('M10 9h12v5H10z', C.rock) + f('M10 18h12v4H10z', C.rockD) + l('M10 9h12M10 14h12M10 18h12M10 22h12', K, 1) + o(14, 6, 1, C.rockL, NS),
    blueprint: r(4, 6, 24, 20, C.paper, 2) + l('M9 21V12l5-3 5 3v9M9 21h14M19 15h4v6', C.iceL, 1.5) + l('M7 9h3M7 23h3', C.waterL, 1),
    map: f('M3 8l8-3 10 3 8-3v19l-8 3-10-3-8 3z', C.bone) + l('M11 5v19M21 8v19', C.boneD, 1.5) + l('M7 19c3-4 5 1 8-3s5-2 9-6', C.heat, 1.5) + o(24, 10, 1.6, C.heat, NS),
    gem: f('M9 6h14l5 7-12 14L4 13z', C.ice) + f('M9 6l3 7h8l3-7z', C.iceL) + l('M4 13h24M12 13l4 14 4-14', K, 1),

    // ---- crews ----
    digger: l('M25 4L12 17', C.wood, 3.5) + l('M22 3l7 7', K, 3) + l('M22 3l7 7', C.steel, 1.5) + f('M13 14l5 5-3 7-9 2 2-9z', C.steel) + l('M10 23l5-5', K, 1),
    barrow: f('M4 11h19l-3 9H9z', C.amber) + l('M23 12l7-4', C.wood, 2.5) + l('M19 20l3 7', K, 2) + o(10, 24, 4, C.steelD) + o(10, 24, 1.3, C.steelL, NS) + f('M8 11l3-4 4 2 3-3 3 5z', C.rockL),
    breaker: l('M6 8h20', K, 4) + l('M6 8h20', C.steelD, 2) + r(11, 5, 10, 12, C.heat, 2) + r(13, 17, 6, 4, C.steelD) + f('M14.5 21h3v5l-1.5 4-1.5-4z', C.steelL) + l('M13 9h6M13 12h6', K, 1),
    cart: f('M8 9l3-4 4 3 3-4 4 2 3 3z', C.amber) + f('M3 10h26l-3 12H6z', C.steel) + l('M5 14h22M11 10l1 12M21 10l-1 12', K, 1) + o(10, 24.5, 3, C.steelD) + o(22, 24.5, 3, C.steelD) + l('M2 29h28', C.rockL, 1.5),
    cage: l('M16 1v6', C.steelL, 2) + f('M8 9l8-4 8 4z', C.steelD) + r(8, 9, 16, 19, C.rockD, 1) + l('M12 9v19M16 9v19M20 9v19', C.steel, 1.5) + r(8, 25, 16, 3, C.amber),
    belt: f('M7 15h18a5 5 0 0 1 0 10H7a5 5 0 0 1 0-10z', C.steelD) + o(7, 20, 3, C.steelL) + o(25, 20, 3, C.steelL) + o(16, 20, 2, C.steel) + f('M8 15l2-4 3 1 2-3 3 3 3-2 3 5z', C.amber) + l('M4 29l4-4M28 29l-4-4', K, 2),
    plant: f('M3 28V15l7 4v-4l7 4V6h6v22z', C.steel) + r(23, 12, 6, 16, C.steelD) + r(7, 22, 3, 3, C.fire) + r(13, 22, 3, 3, C.fire) + r(19, 22, 3, 3, C.fire) + o(20, 3.5, 2, C.steelL) + o(24.5, 2.5, 1.5, C.steelL),
    combine: r(13, 10, 16, 12, C.amber, 2) + r(20, 12, 6, 4, C.night, 1) + r(12, 22, 18, 5, C.steelD, 2.5) + o(15.5, 24.5, 1.2, C.steelL, NS) + o(21, 24.5, 1.2, C.steelL, NS) + o(26.5, 24.5, 1.2, C.steelL, NS) + o(9, 16, 7, C.steel) + l('M9 9v14M2 16h14M4 11l10 10M14 11L4 21', K, 1) + o(9, 16, 2, C.steelD),

    // ---- staff ----
    master: f('M6 20a10 10 0 0 1 20 0z', C.amber) + f('M3 20h26v4H3z', C.gold) + l('M16 10v10M11 12v8M21 12v8', K, 1) + o(16, 14, 3, C.iceL),
    mechanic: f('M22 3a7 7 0 0 0-7 9L4 23l5 5 11-11a7 7 0 0 0 9-7l-5 4-4-4z', C.steel) + o(8, 24, 1.3, C.dark, NS),

    // ---- the drill tab ----
    drill: r(11, 2, 10, 8, C.steelD, 1) + f('M8 10h16l-8 20z', C.steel) + l('M9 13l12 4M11 18l8 3M13 23l5 2', K, 1.2) + l('M13 5h6', C.amber, 2),
    strike: f('M18 2L6 18h8l-2 12 14-17h-8z', C.gold),
    gauge: f('M3 22a13 13 0 0 1 26 0z', C.steelD) + l('M7 22a9 9 0 0 1 4-7.5', C.green, 3) + l('M12.5 13.6a9 9 0 0 1 7 0', C.gold, 3) + l('M21 14.5a9 9 0 0 1 4 7.5', C.heat, 3) + l('M16 22l6-7', C.bone, 2) + o(16, 22, 2, C.bone) + r(3, 22, 26, 4, C.steel, 1),

    // ---- zones ----
    sediment: r(3, 5, 26, 22, C.rockL, 3) + f('M3 12c5-2 8 2 13 0s8-2 13 0v7c-5-2-8 2-13 0s-8-2-13 0z', C.rock) + f('M3 19c5-2 8 2 13 0s8-2 13 0v5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z', C.rockD) + o(9, 8.5, 1, C.sand, NS) + o(21, 9, 1, C.sand, NS) + o(14, 23.5, 1, C.rockL, NS),
    water: f('M16 3c5 7 9 11 9 16a9 9 0 0 1-18 0c0-5 4-9 9-16z', C.water) + l('M11 19a5 5 0 0 0 4 5', C.waterL, 2),
    gas: o(11, 19, 7, C.gas) + o(21, 14, 6, C.gas) + o(21, 24, 4, C.gas) + o(11, 8, 3, C.gas) + o(9, 17, 1.5, '#e3ea9a', NS) + o(20, 12, 1.3, '#e3ea9a', NS),
    heat: f('M12 5a4 4 0 0 1 8 0v12a7 7 0 1 1-8 0z', C.bone) + o(16, 22.5, 4, C.heat) + l('M16 22V9', C.heat, 3) + l('M22 7h3M22 11h3M22 15h3', C.steelL, 1.5),
    crystal: crystalBody,
    void: caveBody + f('M12 9l1.5 5 1.5-5zM18 8l1.5 6 1.5-6z', C.rockL),
    magma: f('M3 28V16l5-5 5 4 4-7 6 6 6-2v16z', C.rockD) + f('M3 28v-6c4-3 6 2 9 0s4-5 8-2 5-1 9 1v7z', C.heat) + f('M7 28c2-3 5-1 7-3s5 0 7 3z', C.fire, NS) + o(22, 17, 1.2, C.fire, NS) + o(10, 16, 1, C.fire, NS),
    vault: f('M4 28V14a12 12 0 0 1 24 0v14h-6V15a6 6 0 0 0-12 0v13z', C.bone) + f('M14 3h4l1 6h-6z', C.boneD) + l('M4 20h6M22 20h6M4 14h6M22 14h6', K, 1) + l('M2 28h28', C.boneD, 2),
    pressure: r(11, 11, 10, 10, C.rockL, 1) + l('M13 14l6 4M14 19l3-1', K, 1) + f('M16 9l-4-6h8zM16 23l-4 6h8zM9 16l-6-4v8zM23 16l6-4v8z', C.steel),
    echo: echoBody,

    // ---- zone equipment ----
    pump: r(7, 13, 13, 14, C.steel, 2) + r(10, 9, 7, 4, C.steelD) + l('M20 17h6v-7', K, 5) + l('M20 17h6v-7', C.steelL, 2.5) + l('M7 19h13', K, 1) + f('M26 3c1.5 2 2.5 3 2.5 4.5a2.5 2.5 0 0 1-5 0c0-1.500 1-2.500 2.500-4.500z', C.water) + l('M5 29h17', C.steelD, 2),
    vent: o(16, 16, 13, C.steelD) + f('M16 16c-1-5 0-9 3-10 2 3 1 7-3 10zM16 16c5-1 9 0 10 3-3 2-7 1-10-3zM16 16c1 5 0 9-3 10-2-3-1-7 3-10zM16 16c-5 1-9 0-10-3 3-2 7-1 10 3z', C.steelL) + o(16, 16, 2.5, C.amber),
    cool: o(16, 16, 13, C.night) + l('M16 5v22M6.500 10.500l19 11M6.500 21.500l19-11', C.ice, 2.2) + l('M13 7l3 3 3-3M13 25l3-3 3 3M7 14.500l4-1-1-4M25 17.500l-4 1 1 4M7 17.500l4 1-1 4M25 14.500l-4-1 1-4', C.iceL, 1.5),
    sink: r(4, 20, 24, 5, C.steelD, 1) + r(6, 6, 3, 14, C.steel) + r(11.500, 6, 3, 14, C.steel) + r(17, 6, 3, 14, C.steel) + r(22.500, 6, 3, 14, C.steel) + l('M6 28c2-2 3 1 5 0s3-2 5 0 3 1 5 0 3-1 5 0', C.heat, 2),
    lens: o(16, 16, 12, C.steelD) + o(16, 16, 8.500, C.ice) + l('M11.500 15a5 5 0 0 1 4-4', C.iceL, 2),
    expedition: f('M12 9a4 4 0 0 1 8 0', 'none') + r(8, 9, 16, 19, C.green, 4) + f('M8 13h16v4a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3z', '#4f8a5c') + r(12, 21, 8, 5, C.sand, 1) + r(14.500, 15, 3, 4, C.gold, 1),
    geo: f('M9 28c2-6 2-12 0-17h14c-2 5-2 11 0 17z', C.steel) + l('M10 17h12M10 23h12', K, 1) + o(13, 7, 3, C.steelL) + o(19, 5, 3.500, C.steelL) + l('M3 28h26', C.heat, 2.5),
    crown: crownBody,
    rule: r(7, 5, 18, 22, C.bone, 2) + l('M11 11h10M11 15h10M11 19h6', C.boneD, 1.5) + f('M19 20l3 3 5-7', 'none') + l('M19 21l3 3 6-8', C.green, 2.5),
    zones: r(10, 2, 12, 28, C.rockD, 2) + r(10, 2, 12, 6, C.rockL, 2) + r(10, 8, 12, 5, C.water) + r(10, 13, 12, 5, C.gas) + r(10, 18, 12, 5, C.heat) + r(10, 23, 12, 7, C.violet, 2) + l('M10 8h12M10 13h12M10 18h12M10 23h12', K, 1) + l('M25 5h4M25 11h2M25 16h4M25 21h2M25 26h4', C.steelL, 1.5),

    // ---- the workshop ----
    bit: r(12, 3, 8, 8, C.steelD, 1) + f('M6 11h20v5l-3 10h-4l-3-6-3 6H9L6 16z', C.gold) + l('M6 16h20M16 11v9', K, 1) + o(11, 14, 1, C.bone, NS) + o(21, 14, 1, C.bone, NS),
    motor: r(5, 12, 19, 14, C.steel, 2) + r(8, 7, 4, 5, C.steelD) + r(14, 7, 4, 5, C.steelD) + r(24, 16, 5, 5, C.steelD) + f('M15 14l-5 6h4l-1 4 5-6h-4z', C.gold, NS) + l('M5 29h19', C.steelD, 2),
    rope: f('M5 13a11 4 0 0 1 22 0v9a11 4 0 0 1-22 0z', C.sand) + l('M5 16a11 4 0 0 0 22 0M5 19a11 4 0 0 0 22 0M5 22a11 4 0 0 0 22 0', C.wood, 1.2) + f('M10 13a6 2 0 0 1 12 0a6 2 0 0 1-12 0z', C.dark) + l('M22 9c4-2 6 1 5 4', C.sand, 2.5) + l('M16 2v4', C.steelL, 2),
    lift: o(16, 9, 7, C.steelD) + o(16, 9, 2, C.steelL) + l('M16 2v14M9 9h14', K, 1) + l('M23 9v9', C.steelL, 1.5) + r(17, 18, 12, 10, C.amber, 1) + l('M21 18v10M25 18v10', K, 1) + f('M4 22l5-6 5 6h-3v6H7v-6z', C.green),
    seismic: r(3, 6, 26, 20, C.night, 2) + l('M5 16h4l2-6 3 12 3-9 2 5 2-2h6', C.green, 2) + l('M3 29h26', C.steelD, 2),
    night: o(16, 16, 13, C.night) + f('M19 6a10 10 0 1 0 7 15 8 8 0 0 1-7-15z', C.gold) + f('M23 8l1 2 2 1-2 1-1 2-1-2-2-1 2-1z', C.iceL, NS),
    crews: f('M10 3h12v9l-6 4-6-4z', C.heat) + l('M14 3v10M18 3v10', C.bone, 1.5) + o(16, 21, 8, C.gold) + f('M16 16l1.500 3.200 3.500.400-2.600 2.400.700 3.500-3.100-1.800-3.100 1.800.700-3.500-2.600-2.400 3.500-.400z', C.amber, NS),
    rig: l('M16 3L6 28M16 3l10 25', K, 4.5) + l('M16 3L6 28M16 3l10 25', C.steel, 2) + l('M11.500 14h9M8.500 22h15M11.500 14l12 8M20.500 14l-12 8', C.steelL, 1.5) + l('M16 3v19', C.amber, 1.5) + r(13, 1, 6, 4, C.steelD, 1) + l('M2 29h28', C.rockL, 2),
    chief: r(6, 5, 20, 24, C.wood, 2) + r(8.500, 8, 15, 19, C.bone, 1) + r(12, 3, 8, 5, C.steel, 1) + l('M11 14l2 2 3-4M11 21l2 2 3-4', C.green, 2) + l('M18 15h3M18 22h3', C.boneD, 1.5),

    // ---- edges ----
    'edge-base': o(16, 16, 13, C.rockL) + f('M3.500 13c5-2 8 2 12.500 0s8-2 12.500 0a13 13 0 0 1 0 6c-4.500-2-8 2-12.500 0s-8-2-12.500 0a13 13 0 0 1 0-6z', C.rock) + f('M5 23c4-2 7 2 11 0s7-2 11 0a13 13 0 0 1-22 0z', C.rockD),
    'edge-volcanic': f('M2 28l9-17h10l9 17z', C.rockD) + f('M11 11h10l-2 5-3-2-3 3z', C.heat) + f('M13 2c1 2 3 3 3 5a3 3 0 0 1-6 0c0-1 2-3 3-5z', C.fire) + o(21, 6, 2, C.steelD) + l('M13 16l-3 8M19 16l4 9', C.heat, 1.5),
    'edge-salt': f('M5 12l11-6 11 6v11l-11 6-11-6z', C.bone) + f('M5 12l11 6 11-6-11-6z', '#fbf6e8') + l('M16 18v11', K, 1.5) + l('M8 17l4 2M20 22l4-2', C.boneD, 1.5),
    'edge-ice': f('M2 28l8-16 5 6 4-13 11 23z', C.ice) + f('M19 5l-2 7 3 2 3-1z', C.iceL) + f('M10 12l-2 4 3 1 2-1z', C.iceL) + l('M2 28h28', K, 1.5),

    // ---- artifacts ----
    shell: f('M16 27C7 25 3 17 5 10c3-4 8-6 11-6s8 2 11 6c2 7-2 15-11 17z', C.sand) + l('M16 27V4M16 27L8 6.500M16 27l8-20.500M16 27L5 12M16 27l11-15', C.wood, 1.2) + f('M12 27h8v3h-8z', C.wood),
    ammonite: o(16, 16, 12, C.sand) + l('M16 16c0-2 3-2 3 0 0 4-6 4-6 0 0-6 9-6 9 0 0 8-12 8-12 0', C.wood, 2) + l('M16 4v3M5 13l3 1M9 26l2-2.500M26 22l-2.500-1.500', C.wood, 1.2),
    fern: r(4, 4, 24, 24, C.rock, 4) + l('M16 26V7', C.green, 2) + l('M16 22l-6-3M16 22l6-3M16 17l-5-3M16 17l5-3M16 12l-4-2.500M16 12l4-2.500', C.green, 2),
    amber: f('M16 3c6 6 10 10 10 16a10 10 0 0 1-20 0c0-6 4-10 10-16z', C.amber) + l('M11 18a5 5 0 0 0 3 6', C.gold, 2) + o(18, 18, 1.5, C.dark, NS) + l('M16.500 16.500l-2-1.500M19.500 16.500l2-1.500', C.dark, 1),
    flint: f('M16 2l8 13-4 7v7h-8v-7l-4-7z', C.steelD) + l('M16 2v20M12 22h8M11 13l5 3 5-3', C.steelL, 1.2),
    disk: o(16, 16, 13, C.rockL) + o(16, 16, 3, C.dark) + l('M16 3v4M16 25v4M3 16h4M25 16h4M7 7l3 3M22 22l3 3M7 25l3-3M22 10l3-3', K, 1.5),
    bear: f('M10 4c4-2 9-2 12 0 2 4 0 9-2 13-1 4-2 9-4 12-2-3-3-8-4-12-2-4-4-9-2-13z', C.bone) + f('M10 4c4-2 9-2 12 0 1 2 1 4 0 6-4 2-8 2-12 0-1-2-1-4 0-6z', C.boneD),
    tablet: r(6, 4, 20, 24, C.copper, 3) + l('M10 9l2 2M15 9v3M19 9l2 2-2 1M10 15h4M17 14l3 3M10 20l2 2 2-2M18 20v3M22 20v3', C.dark, 1.5),
    nail: f('M9 4h14v4H9z', C.copper) + f('M14 8h4l-1 18-1 4-1-4z', C.copper) + l('M12 6h8', C.gold, 1.2),
    lamp: l('M11 8a5 5 0 0 1 10 0', C.steelL, 2) + r(10, 8, 12, 4, C.steelD, 1) + r(11, 12, 10, 12, C.gold, 1) + r(9, 24, 14, 4, C.steelD, 1) + l('M14 12v12M18 12v12', K, 1) + f('M16 15c1 2 2 2 2 4a2 2 0 0 1-4 0c0-1 1-2 2-4z', C.heat, NS),
    pick: l('M8 27L21 10', C.wood, 3.5) + f('M5 9c7-6 16-6 23 1-5-2-9-2-12 0l-3 3-2-2c-2 0-4-1-6-2z', C.copper) + o(13, 9, 1, C.heat, NS) + o(22, 8, 1, C.heat, NS),
    coin: o(16, 16, 12, C.copper) + o(16, 16, 8, '#d99160') + l('M12 16h8M16 12v8', C.copper, 2) + o(22, 9, 1.2, C.green, NS),
    meteor: f('M9 12l8-3 8 4 2 8-6 6-10-1-5-7z', C.rockD) + o(14, 16, 2, C.dark) + o(21, 19, 1.5, C.dark) + o(15, 23, 1.200, C.dark) + l('M4 3l6 6M10 2l4 5M3 9l4 3', C.fire, 2),
    geode: f('M3 17a13 11 0 0 1 26 0c0 6-6 10-13 10S3 23 3 17z', C.rock) + f('M7 17a9 7 0 0 1 18 0c0 4-4 7-9 7s-9-3-9-7z', C.violet) + f('M10 21l2-6 2 6zM14.500 22l1.500-9 1.500 9zM18.500 21l2-6 2 6z', C.iceL),
    bead: o(16, 16, 12, C.water) + o(16, 16, 4, C.dark) + l('M8 13a8 8 0 0 1 5-5', C.waterL, 2.5) + l('M10 24c4 3 9 3 13-1', '#3f79ab', 2),
    pearl: o(16, 17, 11, C.night) + l('M9 15a7 7 0 0 1 5-6', C.violet, 2.5) + o(21, 22, 1.500, '#4a5270', NS),
    vertebra: f('M16 3l3 6c4 0 7 1 10 3l-4 4c1 4-1 9-5 11h-8c-4-2-6-7-5-11l-4-4c3-2 6-3 10-3z', C.bone) + o(16, 18, 4, C.dark) + l('M16 3v6', C.boneD, 1.5),
    ring: o(16, 18, 10, C.violet) + o(16, 18, 6, C.dark) + f('M12 6l4-4 4 4-4 4z', C.ice) + l('M8 14a9 9 0 0 1 4-4', '#d6cffa', 2),
    key: o(10, 10, 7, C.gold) + o(10, 10, 2.500, C.dark) + f('M14 13l3-3 12 12v5h-5v-3h-3v-3h-3z', C.gold),
    egg: f('M16 2c6 0 10 9 10 16a10 10 0 0 1-20 0C6 11 10 2 16 2z', C.rockL) + l('M9 15l3 2 2-3 3 3 2-2 3 2 3-2', C.rockD, 1.5) + o(12, 9, 1.200, C.sand, NS) + o(19, 23, 1.500, C.rock, NS) + o(13, 24, 1, C.rock, NS),

    // ---- relics of the vaults ----
    seal: o(16, 16, 13, C.boneD) + o(16, 16, 9, C.bone) + f('M16 9l6 10H10z', C.violet) + o(16, 16, 1.500, C.dark, NS),
    lantern: f('M11 9h10l3 14H8z', C.violet) + f('M13 12h6l2 9h-10z', C.iceL) + f('M12 4h8l1 5H11z', C.boneD) + r(7, 23, 18, 5, C.boneD, 1) + l('M16 1v3', C.boneD, 2),
    slab: f('M7 28V9a9 6 0 0 1 18 0v19z', C.bone) + l('M11 12h10M11 16h10M11 20h7', C.violet, 2) + l('M4 28h24', C.boneD, 2.5),
    vkey: o(16, 9, 6.500, C.bone) + o(16, 9, 2.500, C.dark) + f('M14 15h4v14h-4z', C.bone) + f('M18 20h5v3h-5zM18 25h4v3h-4z', C.violet),

    // ---- events ----
    'ev-soft': r(3, 5, 26, 22, C.sand, 3) + l('M3 11c4 3 7-3 11 0s7 3 15-1M3 17c4 3 7-3 11 0s7 3 15-1M3 23c4 3 7-3 11 0s7 3 15-1', C.wood, 1.5),
    'ev-nugget': f('M6 20l3-9 8-5 9 4 2 9-7 7-10-1z', C.gold) + l('M9 11l6 4 11-5M15 15l-4 9M15 15l6 4 7 0', C.amber, 1.5) + f('M25 3l1 2.500 2.500 1-2.500 1-1 2.500-1-2.500-2.500-1 2.500-1z', C.iceL, NS),
    'ev-stream': r(3, 4, 26, 24, C.rockD, 3) + f('M3 13c4-3 7 3 11 0s7-3 15 1v9c-8-4-11-1-15-1s-7 3-11 0z', C.water) + l('M7 18c3-2 5 2 8 0M18 17c3-2 5 2 8 0', C.waterL, 1.5),
    'ev-gas': f('M16 3l3 6 6-3-2 7 7 3-7 3 2 7-6-3-3 6-3-6-6 3 2-7-7-3 7-3-2-7 6 3z', C.gas) + o(16, 16, 4, '#e3ea9a', NS),
    'ev-overheat': flame,
    'ev-quartz': r(3, 4, 26, 24, C.rock, 3) + f('M3 20L20 4h7L5 28a3 3 0 0 1-2-3z', C.iceL) + l('M10 16l3 3M17 10l2 2', C.steelL, 1.2) + o(23, 21, 1.200, C.rockL, NS) + o(18, 24, 1, C.rockL, NS),
    'ev-cavern': caveBody + f('M13 28l3-8 3 8z', C.gold) + f('M16 13l.800 2 2 .800-2 .800-.800 2-.800-2-2-.800 2-.800z', C.iceL, NS),
    'ev-crown': crownBody + f('M15 5l3 4-3 3 2 5h-3l-1-5 3-3-2-4z', C.dark),
    'ev-collapse': f('M3 3h26v6l-5 3-4-3-5 4-5-4-4 3-3-2z', C.rock) + f('M7 16l5-2 3 4-3 4-5-1z', C.rockL) + f('M19 14l5 1 1 5-5 2-3-4z', C.rockL) + f('M11 24l4-1 3 3-2 3h-5z', C.sand) + l('M9 11v3M21 10v2M15 14v3', C.steelL, 1.2),
    'ev-drift': r(4, 9, 24, 19, C.dark) + f('M2 5h28v5H2z', C.wood) + f('M4 10h5v18H4zM23 10h5v18h-5z', C.wood) + l('M9 28l4-9h6l4 9', C.steelD, 1.5) + l('M11.500 23h9', C.steelD, 1.5),
    'ev-geologists': l('M9 28L20 12', C.wood, 3.5) + f('M13 6l10-3 6 6-3 2-4-3-5 4z', C.steel) + o(8, 9, 4, C.rockL) + l('M6 8l3 2', K, 1),
    'ev-lake': caveBody + f('M9 22c2-1 3 1 5 0s3-1 5 0 2 1 4 0v6H9z', C.water) + l('M11 25h4M17 26h4', C.waterL, 1.2),
    'ev-silence': r(12, 13, 8, 15, C.bone, 1) + f('M16 3c2 3 3 4 3 6a3 3 0 0 1-6 0c0-2 1-3 3-6z', C.fire) + l('M16 11v2', K, 1.5) + f('M7 28h18v2H7z', C.steelD) + l('M12 18c2 1 3-1 4 0', C.boneD, 1.2),
    'ev-druse': f('M3 28c1-5 5-8 13-8s12 3 13 8z', C.rock) + f('M9 22l-3-9 5 2 1 7zM14 21l-1-15 5 5 0 10zM20 21l2-11 4 3-2 9z', C.ice) + l('M13 6l2.500 15M22 10l-.500 11', C.iceL, 1.2),
    'ev-voice': echoBody + f('M12 20c2 2 6 2 8 0', 'none') + l('M11 2l-1 3M21 2l1 3', C.violet, 1.5)
  };

  function svg(name) {
    const body = ART[name];
    if (!body) return null;
    return '<svg class="dm-art" viewBox="0 0 32 32" aria-hidden="true"><g stroke="' + K + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">' + body + '</g></svg>';
  }

  function toEl(markup) {
    const holder = document.createElement('span');
    holder.innerHTML = markup;
    return holder.firstChild;
  }

  function el(name) { return toEl(svg(name) || svg('sediment')); }

  function hash(i) {
    let x = (i + 1) * 2654435761 % 4294967296;
    x = (x ^ (x >>> 13)) * 1274126177 % 4294967296;
    return (x >>> 0) / 4294967296;
  }

  /** A piece of a rock band: the band's colour with strata and grains placed by the seed. */
  function rock(color, seed) {
    const s = Number(seed) || 0;
    let body = '<rect x="3" y="4" width="26" height="24" rx="4" fill="' + color + '"/>';
    const kind = s % 4;
    for (let j = 0; j < 3; j++) {
      const y = 10 + j * 6 + Math.round(hash(s * 7 + j) * 2);
      if (kind === 0) body += l('M4 ' + y + 'c5-2 7 2 12 0s8-2 12 0', 'rgba(0,0,0,0.35)', 1.2);
      else if (kind === 1) body += l('M4 ' + (y + 3) + 'L28 ' + (y - 3), 'rgba(255,255,255,0.22)', 1.2);
      else if (kind === 2) body += l('M' + (6 + j * 7) + ' ' + (8 + j * 5) + 'l5 3-2 4', 'rgba(0,0,0,0.4)', 1.2);
      else body += l('M4 ' + y + 'h24', 'rgba(0,0,0,0.3)', 1.2);
    }
    for (let j = 0; j < 6; j++) {
      body += '<circle cx="' + (7 + Math.round(hash(s * 13 + j) * 18)) + '" cy="' + (8 + Math.round(hash(s * 31 + j) * 16)) + '" r="' + (j % 2 ? 1 : 1.4) +
        '" fill="' + (j % 2 ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.35)') + '" stroke="none"/>';
    }
    body += '<rect x="3" y="4" width="26" height="24" rx="4" fill="none"/>';
    return toEl('<svg class="dm-art" viewBox="0 0 32 32" aria-hidden="true"><g stroke="' + K + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">' + body + '</g></svg>');
  }

  window.DmArt = { svg: svg, el: el, rock: rock, names: Object.keys(ART), colors: C };
})();
