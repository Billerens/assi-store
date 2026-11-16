// The pictures of «Пасьянс-рогалик»: window.SolArt. Everything is drawn here as SVG, 48×48, in the
// colours of the table (card grey, gold, wax, glass), with no text inside. A picture is markup;
// SolArt.el(markup, size) wraps it in a span.
//   SolArt.deck(id)              the back of a deck with its emblem
//   SolArt.upgrade(id)           an improvement of the workshop
//   SolArt.relic(id, rarity)     a tile with the sign of a relic (an unknown id gets the amulet)
//   SolArt.seal(id)              a seal as a stamp of wax
//   SolArt.host(id)              the master of a deal
//   SolArt.curse(id)             a cursed card
//   SolArt.service(kind)         the shop's services: remove, candle, reroll
//   SolArt.unknown()             a thing not met yet
(function () {
  const GOLD = '#d0a53a';
  const WAX = '#d8c79c';
  const GLASS = '#7fb3c4';
  const FACE = '#c9c9c6';
  const INK = '#1b1b1b';
  const RED = '#c4493f';
  const RARE = { common: '#b9b9b4', rare: GLASS, legend: GOLD };
  const BACKS = { normal: ['#34363a', '#8a8d94'], short: ['#2f4a3a', '#7fc09a'], lunar: ['#2d3157', '#b7b0e0'], twosuit: ['#4a2f2c', '#e0a08f'], widow: ['#1f1b24', '#a493b8'] };

  function svg(inner) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" aria-hidden="true">' + inner + '</svg>';
  }

  function tile(color, inner) {
    return svg('<rect x="1" y="1" width="46" height="46" rx="10" fill="' + color + '" fill-opacity="0.13" stroke="' + color + '" stroke-opacity="0.45" stroke-width="1.5"/>' + inner);
  }

  // ---- the decks: two cards, the upper one shows the back with the emblem ----

  const EMBLEM = {
    normal: (c) => '<path d="M24 14l7 10-7 10-7-10z" fill="none" stroke="' + c + '" stroke-width="1.8" stroke-linejoin="round"/><path d="M24 19l3.5 5-3.5 5-3.5-5z" fill="' + c + '"/>',
    short: (c) => '<path d="M17 18h14M17 24h14M17 30h14" stroke="' + c + '" stroke-width="3" stroke-linecap="round"/><path d="M12 39l24 0" stroke="' + c + '" stroke-width="1.6" stroke-dasharray="2 3"/>',
    lunar: (c) => '<path d="M30 30a9 9 0 1 1-6-15.5 7.5 7.5 0 0 0 6 15.5z" fill="' + c + '"/><circle cx="30" cy="16" r="1.2" fill="' + c + '"/><circle cx="18" cy="33" r="1" fill="' + c + '"/>',
    twosuit: (c) => '<path d="M19 12l5 7-5 7-5-7z" fill="' + c + '"/><path d="M29 22c-3 3.5-5 5.5-5 8a2.7 2.7 0 0 0 4.2 2.2L27 36h4l-1.2-3.8A2.7 2.7 0 0 0 34 30c0-2.5-2-4.5-5-8z" fill="#e8e4dc"/>',
    widow: (c) => '<path d="M24 12c2.5 3.5 4 5.5 4 8a4 4 0 0 1-8 0c0-2.5 1.5-4.5 4-8z" fill="' + c + '"/><path d="M21 27h6v9h-6z" fill="none" stroke="' + c + '" stroke-width="1.8" stroke-linejoin="round"/><path d="M15 39h18" stroke="' + c + '" stroke-width="1.8" stroke-linecap="round"/>'
  };

  function deck(id) {
    const b = BACKS[id] || BACKS.normal;
    return svg('<rect x="13" y="6" width="26" height="38" rx="4" fill="' + b[0] + '" stroke="' + b[1] + '" stroke-opacity="0.5" stroke-width="1.2" transform="rotate(9 26 25)"/>' +
      '<rect x="10" y="5" width="28" height="39" rx="4" fill="' + b[0] + '" stroke="' + b[1] + '" stroke-width="1.5"/>' +
      '<rect x="13" y="8" width="22" height="33" rx="2.5" fill="none" stroke="' + b[1] + '" stroke-opacity="0.4" stroke-width="1"/>' + (EMBLEM[id] || EMBLEM.normal)(b[1]));
  }

  // ---- shared pieces ----

  function candle(x, w, top, color) {
    const cx = x + w / 2;
    return '<path d="M' + cx + ' ' + (top - 11) + 'c2.5 3.5 3.5 5 3.5 7a3.5 3.5 0 0 1-7 0c0-2 1-3.5 3.5-7z" fill="#f0b84a"/>' +
      '<path d="M' + cx + ' ' + (top - 5.5) + 'c1 1.5 1.5 2 1.5 3a1.5 1.5 0 0 1-3 0c0-1 .5-1.5 1.5-3z" fill="#fff0c2"/>' +
      '<rect x="' + x + '" y="' + top + '" width="' + w + '" height="' + (40 - top) + '" rx="2" fill="' + (color || WAX) + '"/>' +
      '<path d="M' + (x + w - 2.5) + ' ' + top + 'v7a1.6 1.6 0 0 1-3.2 0v-7z" fill="#f1e7c8"/>';
  }

  function card(x, y, w, hgt, fill, extra) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + hgt + '" rx="3" fill="' + (fill || FACE) + '" stroke="#77777a" stroke-width="1.2"' + (extra || '') + '/>';
  }

  const COINS = '<ellipse cx="20" cy="34" rx="11" ry="4.5" fill="#8a6a1c"/><path d="M9 29v5c0 2.5 5 4.5 11 4.5s11-2 11-4.5v-5z" fill="#a8801f"/><ellipse cx="20" cy="29" rx="11" ry="4.5" fill="' + GOLD + '"/>' +
    '<path d="M17 19v5c0 2.5 5 4.5 11 4.5s11-2 11-4.5v-5z" fill="#a8801f"/><ellipse cx="28" cy="19" rx="11" ry="4.5" fill="#e6c460"/><ellipse cx="28" cy="19" rx="6" ry="2.2" fill="none" stroke="#a8801f" stroke-width="1.2"/>';

  // ---- the workshop ----

  const UP = {
    wick: candle(15, 18, 20) + '<path d="M11 41h26" stroke="#8a7a52" stroke-width="2.4" stroke-linecap="round"/>',
    joker: card(13, 7, 22, 34, '#b7b0e0') + '<path d="M24 14l2.6 6.4 6.9.5-5.3 4.4 1.7 6.7-5.9-3.7-5.9 3.7 1.7-6.7-5.3-4.4 6.9-.5z" fill="#3a2f7a"/>',
    glance: card(9, 20, 20, 24, '#34363a', ' transform="rotate(-8 19 32)"') + card(17, 17, 20, 26) +
      '<path d="M16 12c4-6 12-6 16 0-4 6-12 6-16 0z" fill="#f1e7c8" stroke="' + INK + '" stroke-width="1.4"/><circle cx="24" cy="12" r="2.8" fill="' + INK + '"/><path d="M27 25l3 4.5-3 4.5-3-4.5z" fill="' + RED + '"/>',
    coins: COINS,
    wideshop: '<path d="M8 20h32v20H8z" fill="#3a3c40" stroke="#8a8d94" stroke-width="1.4"/><path d="M5 20l4-11h30l4 11z" fill="' + RED + '"/><path d="M13.5 9l-2 11M22 9l-1 11M31 9l1 11M38 14l2 6" stroke="#f1e7c8" stroke-width="3.4"/>' +
      '<path d="M5 20a4.2 4.2 0 0 0 8.4 0 4.2 4.2 0 0 0 8.4 0 4.2 4.2 0 0 0 8.4 0 4.2 4.2 0 0 0 8.4 0 2.2 2.2 0 0 0 4.4 0z" fill="#8a2e22"/><rect x="13" y="27" width="9" height="13" fill="#1f2022"/><rect x="26" y="27" width="10" height="7" fill="' + GLASS + '" fill-opacity="0.7"/>',
    discount: '<path d="M8 22L24 6h15a3 3 0 0 1 3 3v15L26 40a3 3 0 0 1-4.2 0L8 26.2A3 3 0 0 1 8 22z" fill="' + GOLD + '" stroke="#7a5c12" stroke-width="1.4" stroke-linejoin="round"/><circle cx="34" cy="14" r="3" fill="#1f2022"/>' +
      '<path d="M17 28l10-10" stroke="#3d2e08" stroke-width="2.4" stroke-linecap="round"/><circle cx="18" cy="20.5" r="2.4" fill="none" stroke="#3d2e08" stroke-width="1.8"/><circle cx="26" cy="27" r="2.4" fill="none" stroke="#3d2e08" stroke-width="1.8"/>',
    startrelic: '<path d="M14 6c0 8 4 12 10 14 6-2 10-6 10-14" fill="none" stroke="#8a8d94" stroke-width="2" stroke-linecap="round"/><path d="M24 17l11 9-11 16-11-16z" fill="' + GLASS + '" stroke="#3f6f7e" stroke-width="1.4" stroke-linejoin="round"/>' +
      '<path d="M13 26h22M24 17l-4 9 4 16 4-16z" fill="none" stroke="#3f6f7e" stroke-width="1.2" stroke-linejoin="round"/><path d="M24 17l-4 9h-7z" fill="#c4e2ea"/>'
  };

  function upgrade(id) {
    return tile(WAX, UP[id] || UP.wick);
  }

  // ---- the relics: a sign 24×24 in the colour of the rarity; @ is a soft fill ----

  const RE = {
    aces: '<rect x="6" y="3" width="12" height="18" rx="2"@/><path d="M12 8l3 4-3 4-3-4z"/>',
    third: '<rect x="3" y="6" width="5" height="12" rx="1"/><rect x="9.5" y="6" width="5" height="12" rx="1"/><rect x="16" y="6" width="5" height="12" rx="1"@/><path d="M18.5 10v4"/>',
    moon: '<path d="M18 15a7.5 7.5 0 1 1-6-11.5 6 6 0 0 0 6 11.5z"@/><path d="M18 4v3M16.5 5.5h3"/>',
    double: '<path d="M3 20h5v-5h5v-5h5V5h3"/><path d="M5 12c1-5 5-8 9-8"/><path d="M11 3l3 1-1 3"/>',
    suit: '<path d="M7 7l4 5-4 5-4-5z"@/><path d="M17 7l4 5-4 5-4-5z"@/>',
    tallow: '<path d="M12 2c1.5 2 2.2 3 2.2 4.2a2.2 2.2 0 0 1-4.4 0C9.8 5 10.5 4 12 2z"@/><path d="M8 10h8v11H8z"/><path d="M14 10v4a1 1 0 0 1-2 0v-4"/>',
    holder: '<path d="M12 2c1.3 1.8 2 2.7 2 3.8a2 2 0 0 1-4 0c0-1.1.7-2 2-3.8z"@/><path d="M10 9h4v6h-4z"/><path d="M5 15h14a7 4 0 0 1-14 0zM12 19v2M8 21.5h8"/>',
    pocket: '<path d="M5 4h14v9a7 7 0 0 1-14 0z"@/><path d="M5 8h14" stroke-dasharray="2 2"/>',
    pocket2: '<path d="M2.5 6h8v6a4 4 0 0 1-8 0z"@/><path d="M13.5 6h8v6a4 4 0 0 1-8 0z"@/><path d="M6.5 19h11"/>',
    peek: '<rect x="4" y="10" width="10" height="11" rx="1.5"/><path d="M9 6c3-3.5 9-3.5 12 0-3 3.5-9 3.5-12 0z"@/><circle cx="15" cy="6" r="1.2"/>',
    clair: '<circle cx="12" cy="10" r="7"@/><path d="M6 21l2-4.5h8l2 4.5z"/><path d="M9 9c.5-1.5 1.5-2.5 3-3"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    sandundo: '<path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"/><path d="M9 20c1-2 2-3 3-3s2 1 3 3z"@/>',
    shuffle: '<path d="M3 7h4c5 0 5 10 10 10h4M3 17h4c2 0 3-1.5 4-3M21 7h-4c-1.5 0-2.5.8-3.3 2"/><path d="M18.5 4.5L21 7l-2.5 2.5M18.5 14.5L21 17l-2.5 2.5"/>',
    miser: '<ellipse cx="12" cy="7" rx="7" ry="3"@/><path d="M5 7v5c0 1.7 3 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3 3 7 3s7-1.3 7-3v-5"/>',
    usurer: '<path d="M12 3v18M7 21h10M4 7h16"/><path d="M4 7l-2.5 6a2.7 2.7 0 0 0 5 0zM20 7l-2.5 6a2.7 2.7 0 0 0 5 0z"@/>',
    wick: '<path d="M12 2c1.5 2 2.2 3 2.2 4.2a2.2 2.2 0 0 1-4.4 0C9.8 5 10.5 4 12 2z"@/><path d="M12 8.5c0 3-4 2.5-4 5s8 2 8 4.5-4 2-4 4"/>',
    memory: '<path d="M4 9l3.5 3.5L12 6l4.5 6.5L20 9l-1.5 9h-13z"@/><path d="M3 21L21 4"/>',
    sparkstone: '<path d="M4 19l2-7 5-3 5 4-1 6-6 2z"@/><path d="M18 3v4M16 5h4M20.5 10v2M19.5 11h2"/>',
    ember: '<path d="M4 17c0-3 2-5 5-5 1 0 2 .5 3 1 1-1 2.5-1.5 4-1 3 1 4 3 4 5s-2 3.5-8 3.5S4 19.5 4 17z"@/><path d="M12 3c1.5 2 2.5 3.2 2.5 4.7a2.5 2.5 0 0 1-5 0C9.5 6.2 10.5 5 12 3z"/>',
    turncoat: '<rect x="3" y="8" width="7" height="10" rx="1.5"@/><rect x="14" y="6" width="7" height="10" rx="1.5"/><path d="M8 5c2-2 5-2 7 0M16 20c-2 1.8-5 1.8-7 0"/><path d="M13.5 2.5L15 5l-2.5 1M10.5 22L9 20l2-1.5"/>',
    draft: '<path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7a2.5 2.5 0 1 1-2.5 2.5"/>',
    parity: '<path d="M8 9.5h8M8 14.5h8"/><circle cx="4" cy="9.5" r="1.3"@/><circle cx="4" cy="14.5" r="1.3"@/><circle cx="20" cy="9.5" r="1.3"@/><circle cx="20" cy="14.5" r="1.3"@/>',
    shadowmaster: '<path d="M7 16V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v9z"@/><path d="M2 16h20M7 12h10"/><path d="M6 19c2 2 10 2 12 0"/>',
    eternal: '<path d="M12 2c1.5 2 2.2 3 2.2 4.2a2.2 2.2 0 0 1-4.4 0C9.8 5 10.5 4 12 2z"@/><path d="M12 16.5c-1.5-2.5-3-3.5-4.5-3.5a3.5 3.5 0 0 0 0 7c1.5 0 3-1 4.5-3.5s3-3.5 4.5-3.5a3.5 3.5 0 0 1 0 7c-1.5 0-3-1-4.5-3.5z"/>',
    bottomless: '<ellipse cx="12" cy="8" rx="9" ry="4"@/><path d="M3 8c0 6 4 9 9 13 5-4 9-7 9-13"/><path d="M8 8.5c1 1.5 7 1.5 8 0"/>',
    shopkeeper: '<path d="M4 10h16v10H4z"/><path d="M2 10l2.5-6h15L22 10z"@/><path d="M8 4l-1 6M12 4v6M16 4l1 6M9 20v-5h4v5"/>',
    joker: '<path d="M4 18c0-6 1.5-10 3.5-10S10 12 12 12s2.5-4 4.5-4S20 12 20 18z"@/><circle cx="7.5" cy="6" r="1.5"/><circle cx="16.5" cy="6" r="1.5"/><circle cx="12" cy="10" r="1.5"/><path d="M3 21h18"/>',
    jokers2: '<path d="M8 4l1.5 3.5 3.5.3-2.7 2.4.9 3.6L8 11.8l-3.2 2 .9-3.6L3 7.8l3.5-.3z"@/><path d="M17 11l1.2 2.7 2.8.3-2.1 1.9.7 2.9-2.6-1.6-2.6 1.6.7-2.9-2.1-1.9 2.8-.3z"@/>',
    reverse: '<path d="M17 3v10a5 5 0 0 1-10 0V7"/><path d="M3 11l4-4 4 4"/><path d="M4 21h16"/>',
    amulet: '<path d="M7 3c0 4 2 6 5 7 3-1 5-3 5-7"/><path d="M12 9l5 5-5 8-5-8z"@/>'
  };

  function relic(id, rarity) {
    const color = RARE[rarity] || '#c9a0e0';
    const body = (RE[id] || RE.amulet).replace(/@/g, ' fill="' + color + '" fill-opacity="0.3"');
    return tile(color, '<g transform="translate(7 7) scale(1.42)" fill="none" stroke="' + color + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + body + '</g>');
  }

  // ---- the seals: a round stamp of wax with the sign pressed in ----

  const SE = {
    gold: [GOLD, '#5c4410', '<circle cx="24" cy="24" r="6.5" fill="none"/><path d="M24 20v8"/>'],
    wax: [WAX, '#6e6240', '<path d="M24 16c3 4 5 6.5 5 9.5a5 5 0 0 1-10 0c0-3 2-5.5 5-9.5z"/>'],
    twin: ['#b0624d', '#3d1c14', '<rect x="16" y="19" width="10" height="10" rx="1.5"/><rect x="22" y="17" width="10" height="10" rx="1.5" fill="none"/>'],
    glass: [GLASS, '#274a55', '<path d="M24 15l8 9-8 9-8-9z" fill="none"/><path d="M16 24h16M24 15l-3 9 3 9 3-9z" fill="none"/>'],
    key: ['#8d7bd6', '#2c2358', '<circle cx="19" cy="24" r="4" fill="none"/><path d="M23 24h10M29 24v4M33 24v3" fill="none"/>'],
    echo: ['#6aa58a', '#1f3d30', '<circle cx="24" cy="24" r="3"/><circle cx="24" cy="24" r="6.5" fill="none"/><path d="M14 18a11.5 11.5 0 0 0 0 12M34 18a11.5 11.5 0 0 1 0 12" fill="none"/>']
  };

  function seal(id) {
    const s = SE[id] || SE.gold;
    return svg('<path d="M24 4c4 0 5 3 8 4s6 0 8 3-1 6 0 9 4 4 3 8-5 4-7 7-1 6-5 8-6-1-9-1-6 2-9-1-1-6-3-9-6-4-5-8 4-4 5-8-1-7 2-9 6 0 9-2 3-1 3-1z" fill="' + s[0] + '"/>' +
      '<circle cx="24" cy="24" r="13" fill="none" stroke="' + s[1] + '" stroke-opacity="0.45" stroke-width="1.4"/><path d="M13 14c2-3 5-5 9-5.5" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="2" stroke-linecap="round"/>' +
      '<g fill="' + s[1] + '" stroke="' + s[1] + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + s[2] + '</g>');
  }

  // ---- the masters: a hooded figure with its own attribute ----

  function figure(attr) {
    return '<path d="M8 44c0-10 4-17 9-19-3-2-4-5-4-9 0-7 5-11 11-11s11 4 11 11c0 4-1 7-4 9 5 2 9 9 9 19z" fill="#3a2a2a" stroke="' + RED + '" stroke-opacity="0.6" stroke-width="1.2"/>' +
      '<ellipse cx="24" cy="17" rx="6.5" ry="7.5" fill="#141515"/>' + attr;
  }

  const HO = {
    miser: figure('<circle cx="21.5" cy="16" r="1.2" fill="' + GOLD + '"/><circle cx="26.5" cy="16" r="1.2" fill="' + GOLD + '"/><path d="M18 31c-3 3-4 6-4 8 0 3 3 4 10 4s10-1 10-4c0-2-1-5-4-8z" fill="#b08a55"/><path d="M18 31c1.5-1.5 1.5-3 0-4.5h12c-1.5 1.5-1.5 3 0 4.5z" fill="#c9a36a"/><circle cx="24" cy="37" r="2.8" fill="' + GOLD + '"/>'),
    blind: figure('<path d="M16 15h16v4H16z" fill="' + WAX + '"/><path d="M32 16l5 3M32 18l4 5" stroke="' + WAX + '" stroke-width="2" stroke-linecap="round"/>' + card(18, 30, 12, 13, '#34363a')),
    mirror: figure('<circle cx="21.5" cy="16" r="1.2" fill="' + GLASS + '"/><circle cx="26.5" cy="16" r="1.2" fill="' + GLASS + '"/><ellipse cx="24" cy="34" rx="6.5" ry="7.5" fill="' + GLASS + '" stroke="#e8e4dc" stroke-width="1.6"/><path d="M20.5 31c1-2 2.5-3 4.5-3" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/>'),
    clock: figure('<circle cx="21.5" cy="16" r="1.2" fill="' + WAX + '"/><circle cx="26.5" cy="16" r="1.2" fill="' + WAX + '"/><circle cx="24" cy="35" r="8" fill="#e8e4dc" stroke="#77777a" stroke-width="1.6"/><path d="M24 30v5l3.5 2" fill="none" stroke="' + INK + '" stroke-width="1.8" stroke-linecap="round"/>'),
    guard: figure('<circle cx="21.5" cy="16" r="1.2" fill="' + WAX + '"/><circle cx="26.5" cy="16" r="1.2" fill="' + WAX + '"/><path d="M24 26l9 3v6c0 4.5-3.5 7.5-9 9-5.5-1.5-9-4.5-9-9v-6z" fill="#8a8d94" stroke="#e8e4dc" stroke-width="1.4" stroke-linejoin="round"/><path d="M24 30l3.5 5-3.5 5-3.5-5z" fill="' + INK + '"/>'),
    lender: figure('<circle cx="21.5" cy="16" r="1.2" fill="#f0b84a"/><circle cx="26.5" cy="16" r="1.2" fill="#f0b84a"/><path d="M24 25c1.8 2.5 2.6 3.6 2.6 5a2.6 2.6 0 0 1-5.2 0c0-1.4.8-2.5 2.6-5z" fill="#f0b84a"/><rect x="20.5" y="33" width="7" height="10" rx="1.5" fill="' + WAX + '"/><circle cx="35" cy="38" r="4" fill="' + GOLD + '" stroke="#7a5c12" stroke-width="1.2"/>')
  };

  function host(id) {
    return tile(RED, HO[id] || figure(''));
  }

  // ---- the cursed cards ----

  const CU = {
    stone: card(12, 6, 24, 36, '#5d5d5a') + '<path d="M16 30l3-10 6-4 6 5-1 9-7 3z" fill="#8a8a86" stroke="#2c2c2a" stroke-width="1.4" stroke-linejoin="round"/><path d="M19 20l6-4 6 5-7 2z" fill="#a9a9a6"/>',
    thorn: card(12, 6, 24, 36) + '<path d="M15 34l3-7 3 7 3-7 3 7 3-7 3 7" fill="none" stroke="' + RED + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><path d="M24 12l4 5.5-4 5.5-4-5.5z" fill="' + INK + '"/>',
    shadow: card(12, 6, 24, 36, '#6e6e6b') + '<path d="M17 36V22a7 7 0 0 1 14 0v14l-3.5-2.5L24 36l-3.5-2.5z" fill="#1d1d1d"/><circle cx="21.5" cy="22" r="1.4" fill="#c9c9c6"/><circle cx="26.5" cy="22" r="1.4" fill="#c9c9c6"/>',
    dud: '<rect x="12" y="6" width="24" height="36" rx="3" fill="none" stroke="#a9a9a6" stroke-width="1.6" stroke-dasharray="4 3"/><path d="M19 19l10 10M29 19l-10 10" stroke="#a9a9a6" stroke-width="2" stroke-linecap="round"/>',
    lock: card(12, 6, 24, 36, '#8f8f8b') + '<rect x="17" y="23" width="14" height="11" rx="2" fill="#2c2c2a"/><path d="M20 23v-3.5a4 4 0 0 1 8 0V23" fill="none" stroke="#2c2c2a" stroke-width="2.2"/><circle cx="24" cy="28.5" r="1.6" fill="' + GOLD + '"/>',
    weed: card(12, 6, 24, 36) + '<path d="M24 38V20" stroke="#3d6b3a" stroke-width="2" stroke-linecap="round"/><path d="M24 28c-5 0-7-2.5-7-6 5 0 7 2.5 7 6zM24 23c0-4 2.5-6.5 7-6.5 0 4-2.5 6.5-7 6.5zM24 34c3.5 0 5.5-2 6-5-3.5 0-5.5 2-6 5z" fill="#4f8a4a"/>'
  };

  function curse(id) {
    return tile('#a9a9a6', CU[id] || CU.dud);
  }

  // ---- the shop's services ----

  const SV = {
    remove: card(15, 7, 22, 34, FACE, ' transform="rotate(8 26 24)"') + '<path d="M10 14l28 22" stroke="' + RED + '" stroke-width="3" stroke-linecap="round"/><path d="M38 14L10 36" stroke="' + RED + '" stroke-width="3" stroke-linecap="round"/>',
    candle: candle(17, 14, 20) + '<path d="M11 41h26" stroke="#8a7a52" stroke-width="2.4" stroke-linecap="round"/>',
    reroll: card(9, 12, 16, 24, '#34363a', ' transform="rotate(-10 17 24)"') + card(23, 10, 16, 24, FACE, ' transform="rotate(8 31 22)"') + '<path d="M11 41c6 4 18 4 25 0M36 41l-1-4.5M36 41l-4.6 1" fill="none" stroke="' + WAX + '" stroke-width="2" stroke-linecap="round"/>'
  };

  function service(kind) {
    return tile(WAX, SV[kind] || SV.candle);
  }

  function unknown() {
    return tile('#6e6e6b', '<circle cx="24" cy="24" r="10" fill="none" stroke="#6e6e6b" stroke-width="3" stroke-dasharray="4 5" stroke-linecap="round"/><circle cx="24" cy="24" r="2.5" fill="#6e6e6b"/>');
  }

  function el(markup, size, cls) {
    const span = document.createElement('span');
    span.className = 'p-art' + (cls ? ' ' + cls : '');
    if (size) {
      span.style.width = size + 'px';
      span.style.height = size + 'px';
    }
    span.innerHTML = markup;
    return span;
  }

  window.SolArt = { deck, upgrade, relic, seal, host, curse, service, unknown, el, BACKS };
})();
