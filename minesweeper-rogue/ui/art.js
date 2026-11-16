// The pictures of «Сапёр-рогалик»: window.MineArt. Everything is drawn here as SVG in the colours
// of the field (slate, sand, rust, moss), with no text inside. Every function returns markup.
//   MineArt.find(id, kind, rarity)   a find: a tool is a square tile, a talisman a round one; unknown ids get a sign of their kind
//   MineArt.sapper(id)               the portrait of a sapper
//   MineArt.workshop(id)             an improvement of the workshop
//   MineArt.flag(double) / mine()    what stands in a cell of the field (24×24, filled)
//   MineArt.unknown()                a find not met yet
(function () {
  'use strict';
  const SAND = '#d7c8a5';
  const RUST = '#d0756a';
  const MOSS = '#9fbf8f';
  const SKY = '#8fb5cc';
  const GOLD = '#e0b860';
  const SLATE = '#aab0b8';
  const DARK = '#15171a';
  const SKIN = '#e3c3a0';
  const RARE = { common: SLATE, rare: SKY, legend: GOLD };

  function svg(inner) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" aria-hidden="true">' + inner + '</svg>';
  }

  function tile(color, inner, round) {
    return svg('<rect x="1" y="1" width="46" height="46" rx="' + (round ? 23 : 10) + '" fill="' + color + '" fill-opacity="0.13" stroke="' + color + '" stroke-opacity="0.45" stroke-width="1.5"/>' + inner);
  }

  // ---- the finds: a sign 24×24 in the colour of the rarity; @ is a soft fill ----

  const FIND = {
    // tools
    probe: '<path d="M5 21L17 6"/><path d="M15 3l6 5-3 3-6-5z"@/><circle cx="5" cy="21" r="1.3"/><path d="M8 13l3.5 2.5"/>',
    xray: '<path d="M2 12c3-5 7-7 10-7s7 2 10 7c-3 5-7 7-10 7s-7-2-10-7z"/><circle cx="12" cy="12" r="3.2"@/><path d="M12 1.5v2M19 3.5l-1.2 1.6M5 3.5l1.2 1.6"/>',
    shovel: '<path d="M14 3l7 7"/><path d="M17.5 6.5L9 15"/><path d="M9 11l4 4-3 5c-3 1.5-6-1.5-6-5z"@/>',
    lantern: '<path d="M8 8V6a4 4 0 0 1 8 0v2"/><path d="M7 8h10l1.5 12h-13z"@/><path d="M12 11c1.5 1.8 2 2.8 2 3.8a2 2 0 0 1-4 0c0-1 .5-2 2-3.8z"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M16 7l-2 7-6 3 2-7z"@/><circle cx="12" cy="12" r="1"/>',
    flare: '<path d="M12 14l-3-3c1-5 4-8 10-8.5-.5 6-3.5 9-8.5 10z"@/><path d="M9 11l-4 1-1 3 4-1M12 14l-1 4 3-1 1-4"/><path d="M4 20l3-3M7 21l1.5-1.5M3 17l1.5-1.5"/>',
    patch: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"@/><path d="M12 9v6M9 12h6"/>',
    sand: '<path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/><path d="M9 20c1-2 2-3 3-3s2 1 3 3z"@/><path d="M12 12v3"/>',
    brake: '<path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"@/><path d="M8 12h8"/>',
    seismo: '<rect x="2" y="5" width="20" height="14" rx="2"@/><path d="M4 12h3l1.5-4 3 8 2-6 1.5 2H20"/>',
    // talismans
    boots: '<path d="M8 3v10l-4 3v4h16v-3c0-2.5-2-4-6-4.5V3z"@/><path d="M4 17h16M8 7h6"/>',
    oak: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"@/><path d="M9 5v14M15 5v14M4.5 11h15"/>',
    sense: '<circle cx="12" cy="12" r="2.2"@/><path d="M7.5 7.5a6.5 6.5 0 0 0 0 9M16.5 7.5a6.5 6.5 0 0 1 0 9M4.5 4.5a10.5 10.5 0 0 0 0 15M19.5 4.5a10.5 10.5 0 0 1 0 15"/>',
    apprentice: '<path d="M5 21V4M5 5h8l-2 3 2 3H5"@/><path d="M15 21v-8M15 13.5h6l-1.5 2 1.5 2h-6"/><path d="M3 21h4M13 21h4"/>',
    neat: '<path d="M5 21V3M5 4h9l-2.5 3.5L14 11H5"@/><circle cx="17" cy="17" r="4"@/><path d="M17 15.5v3"/>',
    vein: '<path d="M2 16l5-6 4 4 5-8 6 7"/><circle cx="7" cy="18" r="2"@/><circle cx="14" cy="17" r="2.5"@/><circle cx="20" cy="19" r="1.5"@/>',
    nose: '<path d="M12 3l8 9-8 9-8-9z" stroke-dasharray="3 3"/><path d="M12 8l3.5 4-3.5 4-3.5-4z"@/>',
    stride: '<path d="M3 6l6 6-6 6M10 6l6 6-6 6M17 6l5 6-5 6"/>',
    belt: '<path d="M2 8h20v5H2z"@/><rect x="4" y="11" width="5" height="7" rx="1"@/><rect x="15" y="11" width="5" height="7" rx="1"@/><rect x="10" y="7" width="4" height="7" rx="1"/>',
    pendulum: '<path d="M6 3h12M12 3l4 13"/><circle cx="17" cy="18" r="3.5"@/><path d="M7 15c1 3 3 5 6 6" stroke-dasharray="2 2.5"/>',
    heavy: '<path d="M6 21l2-11h8l2 11z"@/><path d="M9.5 10a2.5 2.5 0 1 1 5 0"/><path d="M4 21h16"/>',
    'double-sight': '<circle cx="7" cy="13" r="4.5"@/><circle cx="17" cy="13" r="4.5"@/><path d="M11.5 13h1M2.5 12L4 7M21.5 12L20 7"/><circle cx="7" cy="13" r="1"/><circle cx="17" cy="13" r="1"/>',
    'quiet-shop': '<path d="M3 11l8-8h9v9l-8 8a2 2 0 0 1-2.8 0L3 13.8a2 2 0 0 1 0-2.8z"@/><circle cx="16" cy="7.5" r="1.5"/><path d="M8 13l5-5"/>',
    candle: '<path d="M12 2c1.5 2 2.2 3 2.2 4.2a2.2 2.2 0 0 1-4.4 0C9.8 5 10.5 4 12 2z"@/><path d="M9 10h6v11H9zM6 21h12"/>',
    'old-map': '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"@/><path d="M9 4v14M15 6v14"/><path d="M11 10l2 2M13 10l-2 2"/>',
    spare: '<path d="M8 13S3 10 3 6.5A2.7 2.7 0 0 1 8 5a2.7 2.7 0 0 1 5 1.5C13 10 8 13 8 13z"@/><path d="M15.5 21S10 17.5 10 13.8a3 3 0 0 1 5.5-1.6 3 3 0 0 1 5.5 1.6c0 3.7-5.5 7.2-5.5 7.2z"@/>',
    'greedy-pick': '<path d="M4 20l9-9"/><path d="M9 5c2.5-1.5 7-1 10 2s3.5 7.5 2 10"@/><circle cx="6" cy="8" r="3"@/><path d="M6 7v2"/>',
    'light-hand': '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5M14 10.5V5.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6.5 7-3 0-4.5-1.5-6-4l-1.8-3.2a1.4 1.4 0 0 1 2.3-1.6L8 15"@/>',
    shard: '<path d="M4 5l7-2 3 5 6-1-2 7 2 5-8 2-3-4-5 1z"@/><path d="M11 3v6l-4 3M14 8l-1 6 3 2"/>',
    counter: '<rect x="3" y="6" width="18" height="12" rx="2"@/><path d="M9 6v12M15 6v12"/><circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/>',
    // a find from the stock with no picture of its own
    tool: '<path d="M14 4a5 5 0 0 0-4.5 7L3 17.5V21h3.5L13 14.5A5 5 0 0 0 20 10l-3 3-3-1-1-3 3-3a5 5 0 0 0-2-1z"@/>',
    talisman: '<path d="M7 3c0 4 2 6 5 7 3-1 5-3 5-7"/><path d="M12 9l5 5-5 8-5-8z"@/>'
  };

  function find(id, kind, rarity) {
    const color = RARE[rarity] || SLATE;
    const round = kind !== 'tool';
    const body = (FIND[id] || FIND[round ? 'talisman' : 'tool']).replace(/@/g, ' fill="' + color + '" fill-opacity="0.3"');
    return tile(color, '<g transform="translate(8.5 8.5) scale(1.3)" fill="none" stroke="' + color + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + body + '</g>', round);
  }

  // ---- the sappers: a bust in a helmet, each with its own thing ----

  function bust(cloth, helmet, lamp, extra) {
    return '<path d="M6 46c0-10 6-16 18-16s18 6 18 16z" fill="' + cloth + '"/><circle cx="24" cy="22" r="9" fill="' + SKIN + '"/><circle cx="20.5" cy="23" r="1.3" fill="' + DARK + '"/><circle cx="27.5" cy="23" r="1.3" fill="' + DARK + '"/>' +
      '<path d="M13 19a11 11 0 0 1 22 0z" fill="' + helmet + '"/><path d="M10 19h28" stroke="' + helmet + '" stroke-width="3.4" stroke-linecap="round"/><circle cx="24" cy="12.5" r="3.2" fill="' + lamp + '"/>' + (extra || '');
  }

  const SAPPER = {
    sapper: bust('#5a6470', GOLD, '#fff4c8', '<path d="M20 27c2.5 2 5.5 2 8 0" fill="none" stroke="' + DARK + '" stroke-width="1.4" stroke-linecap="round"/>'),
    geolog: bust('#6a5a44', '#b08a55', '#ffe08a', '<path d="M24 2v4M16 4l2 3.5M32 4l-2 3.5M11 9l3.5 2M37 9l-3.5 2" stroke="#ffe08a" stroke-width="1.8" stroke-linecap="round"/>' +
      '<path d="M38 28v16" stroke="#9a7450" stroke-width="3" stroke-linecap="round"/><path d="M32 28h9l3 4h-12z" fill="' + SLATE + '"/>'),
    cartographer: bust('#4a5f6f', '#7fa3b8', '#e9f4fa', '<path d="M28 33l6-2 6 2 5-2v12l-5 2-6-2-6 2z" fill="#e8dcc0" stroke="#8a7a52" stroke-width="1.2" stroke-linejoin="round"/><path d="M34 31v12M40 33v12" stroke="#8a7a52" stroke-width="1.2"/><path d="M36 36l2 2M38 36l-2 2" stroke="' + RUST + '" stroke-width="1.4" stroke-linecap="round"/>'),
    blaster: bust('#6a3a34', RUST, '#ffd0a0', '<rect x="33" y="30" width="7" height="15" rx="2" fill="' + RUST + '" stroke="#7a2e26" stroke-width="1.2"/><path d="M36.5 30c0-4 3-4 3-7" fill="none" stroke="' + SAND + '" stroke-width="1.6" stroke-linecap="round"/>' +
      '<path d="M39.5 20l1 2.2 2.3.500-1.8 1.5.4 2.3-1.9-1.2-1.9 1.2.4-2.3-1.8-1.5 2.3-.500z" fill="' + GOLD + '"/>'),
    tidy: bust('#d9dde2', '#f2f4f6', '#bfe6ff', '<path d="M38 26v20" stroke="#9a7450" stroke-width="2.6" stroke-linecap="round"/><path d="M33 22h10l-1.5 6h-7z" fill="' + GOLD + '"/><path d="M34.5 18v4M38 17v5M41.5 18v4" stroke="' + GOLD + '" stroke-width="1.8" stroke-linecap="round"/>' +
      '<path d="M8 8l1 2.5 2.5 1L9 12.5 8 15l-1-2.5-2.5-1L7 10.5z" fill="#bfe6ff"/>')
  };

  function sapper(id) {
    return tile(SAND, SAPPER[id] || SAPPER.sapper);
  }

  // ---- the workshop ----

  const COIN = (x, y, r) => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + GOLD + '" stroke="#7a5c12" stroke-width="1.2"/><circle cx="' + x + '" cy="' + y + '" r="' + (r * 0.5) + '" fill="none" stroke="#7a5c12" stroke-width="1"/>';
  const MINI = (x, y, c, t) => '<rect x="' + x + '" y="' + y + '" width="13" height="19" rx="2.5" fill="' + c + '" stroke="' + DARK + '" stroke-width="1" transform="' + t + '"/>';

  const WS = {
    heart: '<path d="M24 42S6 31 6 18a9.5 9.5 0 0 1 18-4.5A9.5 9.5 0 0 1 42 18c0 13-18 24-18 24z" fill="' + RUST + '"/><path d="M12 17a5 5 0 0 1 5-5" fill="none" stroke="#ffffff" stroke-opacity="0.6" stroke-width="2.4" stroke-linecap="round"/>' +
      '<path d="M8 24h32" stroke="' + SLATE + '" stroke-width="5"/><circle cx="14" cy="24" r="1.4" fill="' + DARK + '"/><circle cx="24" cy="24" r="1.4" fill="' + DARK + '"/><circle cx="34" cy="24" r="1.4" fill="' + DARK + '"/>',
    supplies: '<path d="M10 18h28v22a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3z" fill="#8a7450"/><path d="M8 14a4 4 0 0 1 4-4h24a4 4 0 0 1 4 4v6H8z" fill="#a89064"/><path d="M17 10V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v3" fill="none" stroke="#6e5a3a" stroke-width="2.4"/>' +
      '<rect x="19" y="17" width="10" height="8" rx="2" fill="' + SAND + '" stroke="#6e5a3a" stroke-width="1.2"/><path d="M16 30h16M16 36h16" stroke="#6e5a3a" stroke-width="1.8" stroke-linecap="round"/>',
    pouch: '<path d="M17 17c-7 6-10 12-10 18 0 6 6 9 17 9s17-3 17-9c0-6-3-12-10-18z" fill="#b08a55" stroke="#6e5230" stroke-width="1.5"/><path d="M17 17c2-3.5 2-6 0-9.5h14c-2 3.5-2 6 0 9.5z" fill="#c9a36a" stroke="#6e5230" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M15 17h18" stroke="#6e5230" stroke-width="2.6" stroke-linecap="round"/>' + COIN(24, 31, 6.5),
    choice: MINI(4, 16, '#5a6470', 'rotate(-24 10 26)') + MINI(13, 12, '#6f7a88', 'rotate(-8 19 22)') + MINI(22, 12, '#8794a3', 'rotate(8 28 22)') + MINI(31, 16, GOLD, 'rotate(24 37 26)') +
      '<path d="M37.5 21l1 2.2 2.3.400-1.7 1.6.4 2.3-2-1.1" fill="none" stroke="#7a5c12" stroke-width="1.2" stroke-linejoin="round"/>',
    discount: '<path d="M8 22L24 6h15a3 3 0 0 1 3 3v15L26 40a3 3 0 0 1-4.2 0L8 26.2A3 3 0 0 1 8 22z" fill="' + GOLD + '" stroke="#7a5c12" stroke-width="1.4" stroke-linejoin="round"/><circle cx="34" cy="14" r="3" fill="' + DARK + '"/>' +
      '<path d="M17 28l10-10" stroke="#3d2e08" stroke-width="2.4" stroke-linecap="round"/><circle cx="18" cy="20.5" r="2.4" fill="none" stroke="#3d2e08" stroke-width="1.8"/><circle cx="26" cy="27" r="2.4" fill="none" stroke="#3d2e08" stroke-width="1.8"/>',
    luck: '<path d="M24 5l17 19-17 19L7 24z" fill="#3a3f38" stroke="' + SAND + '" stroke-width="1.6" stroke-dasharray="4 3" stroke-linejoin="round"/><circle cx="20" cy="20" r="5" fill="' + MOSS + '"/><circle cx="28" cy="20" r="5" fill="#b8d6a8"/><circle cx="20" cy="28" r="5" fill="#b8d6a8"/><circle cx="28" cy="28" r="5" fill="' + MOSS + '"/>' +
      '<circle cx="24" cy="24" r="2" fill="#4f7a43"/>'
  };

  function workshop(id) {
    return tile(SAND, WS[id] || WS.supplies);
  }

  // ---- what stands in a cell: the styles of .mr-cell svg paint by stroke, so every shape says its own fill ----

  function cell(inner) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + inner + '</svg>';
  }

  function flag(double) {
    return cell('<path d="M7 21V3" stroke="' + SAND + '" stroke-width="2" fill="none"/><path d="M8 4h11l-3 4 3 4H8z" fill="' + RUST + '" stroke="none"/>' +
      (double ? '<path d="M8 13h8l-2 2.5 2 2.5H8z" fill="' + GOLD + '" stroke="none"/>' : '') + '<path d="M4 21h7" stroke="' + SAND + '" stroke-width="2" fill="none"/>');
  }

  function mine() {
    return cell('<path d="M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4M5.3 18.7L18.7 5.3" stroke="#e6c9bf" stroke-width="1.8" fill="none"/><circle cx="12" cy="12" r="6" fill="#2a2224" stroke="#e6c9bf" stroke-width="1.4"/>' +
      '<circle cx="9.8" cy="9.8" r="1.7" fill="#f4e3dc" stroke="none"/>');
  }

  function unknown() {
    return tile('#6a7078', '<circle cx="24" cy="24" r="10" fill="none" stroke="#6a7078" stroke-width="3" stroke-dasharray="4 5" stroke-linecap="round"/><circle cx="24" cy="24" r="2.5" fill="#6a7078"/>');
  }

  window.MineArt = { find: find, sapper: sapper, workshop: workshop, flag: flag, mine: mine, unknown: unknown };
})();
