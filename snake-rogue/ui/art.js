// The pictures of «Змейка-рогалик»: window.SnakeArt. Everything is drawn here as SVG, 48×48, in the
// colours the field uses, with no text inside. A picture is markup; SnakeArt.el(markup, size) wraps it.
//   SnakeArt.snake(id)                 the portrait of a snake of the start screen
//   SnakeArt.upgrade(id)               an improvement of the workshop
//   SnakeArt.ability(id, rarity)       a tile with the sign of an ability (unknown ids get the ring)
//   SnakeArt.enemy(id)                 a beast or a trouble of the album
//   SnakeArt.item(kind)                the burrow's goods that are not abilities: snack, reroll
//   SnakeArt.land(id)                  the emblem of a land
//   SnakeArt.unknown()                 a thing not met yet
(function () {
  const SNAKES = { poloz: '#7cbf6b', copper: '#d38b4c', boa: '#a6a35a', twohead: '#a48fd9', glass: '#9fd4e2' };
  const DARK = '#141516';
  const RARE = { common: '#8fc27a', rare: '#8fb0e0', legend: '#e0c070' };

  function svg(inner) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" aria-hidden="true">' + inner + '</svg>';
  }

  function tile(color, inner) {
    return svg('<rect x="1" y="1" width="46" height="46" rx="10" fill="' + color + '" fill-opacity="0.14" stroke="' + color + '" stroke-opacity="0.45" stroke-width="1.5"/>' + inner);
  }

  // ---- the snakes: a coil on a patch of ground, the head up right ----

  const COIL = 'M9 37c2 6 30 6 30-3 0-8-24-3-24-12 0-7 12-10 19-7';

  function head(x, y, color, flip) {
    const d = flip ? -1 : 1;
    return '<ellipse cx="' + x + '" cy="' + y + '" rx="6.5" ry="5.5" fill="' + color + '"/>' +
      '<circle cx="' + (x + 2 * d) + '" cy="' + (y - 1.6) + '" r="1.5" fill="' + DARK + '"/>' +
      '<path d="M' + (x + 6 * d) + ' ' + (y + 1) + 'l' + (4 * d) + ' -1.5M' + (x + 6 * d) + ' ' + (y + 1) + 'l' + (4 * d) + ' 2" stroke="#e0675a" stroke-width="1.4" stroke-linecap="round" fill="none"/>';
  }

  function snake(id) {
    const c = SNAKES[id] || SNAKES.poloz;
    const wide = id === 'boa' ? 10 : 7.5;
    let s = '<ellipse cx="24" cy="41" rx="19" ry="4" fill="' + c + '" fill-opacity="0.14"/>';
    if (id === 'glass') {
      s += '<path d="' + COIL + '" fill="none" stroke="' + c + '" stroke-opacity="0.45" stroke-width="' + wide + '" stroke-linecap="round"/>' +
        '<path d="' + COIL + '" fill="none" stroke="#f2fbff" stroke-opacity="0.9" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="7 9"/>' +
        '<path d="M9 37c2 6 30 6 30-3" fill="none" stroke="' + c + '" stroke-width="1.2" transform="translate(0 4.4)" stroke-opacity="0.8"/>';
    } else {
      s += '<path d="' + COIL + '" fill="none" stroke="' + c + '" stroke-width="' + wide + '" stroke-linecap="round"/>';
    }
    if (id === 'poloz') s += '<path d="' + COIL + '" fill="none" stroke="#d6f0c4" stroke-opacity="0.55" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="1 5"/>';
    if (id === 'copper') s += '<path d="' + COIL + '" fill="none" stroke="#7a4420" stroke-width="3.4" stroke-linecap="round" stroke-dasharray="0.1 7"/>';
    if (id === 'boa') s += '<path d="' + COIL + '" fill="none" stroke="#5d5b2a" stroke-width="5.5" stroke-dasharray="5 6"/>' +
      '<path d="' + COIL + '" fill="none" stroke="#d9d59a" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="0.1 11" stroke-dashoffset="-2.5"/>';
    if (id === 'twohead') s += '<path d="' + COIL + '" fill="none" stroke="#e3d9ff" stroke-opacity="0.5" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="3 4"/>' +
      head(9.5, 35, c, true);
    s += head(35, 15, c, false);
    return svg(s);
  }

  // ---- the workshop ----

  const UP = {
    long: '<path d="M8 30h32" stroke="#7cbf6b" stroke-width="8" stroke-linecap="round" stroke-dasharray="0.1 10.6"/><circle cx="40" cy="30" r="4" fill="#d6f0c4"/><circle cx="29.4" cy="30" r="4" fill="#d6f0c4"/>' +
      '<path d="M34.5 12v10M29.5 17h10" stroke="#d6f0c4" stroke-width="2.4" stroke-linecap="round"/>',
    skin: '<path d="M24 8l13 5v9c0 8-5 14-13 17-8-3-13-9-13-17v-9z" fill="#a6a35a" stroke="#5d5b2a" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M15 19c3 3 6 3 9 0 3 3 6 3 9 0M16 26c3 3 5 3 8 0 3 3 5 3 8 0M20 33c2 2 3 2 4 0 1 2 2 2 4 0" fill="none" stroke="#5d5b2a" stroke-width="1.6" stroke-linecap="round"/>',
    nose: '<circle cx="21" cy="27" r="9" fill="none" stroke="#e9c95b" stroke-width="4"/><path d="M36 8v8M32 12h8M37 22v4M35 24h4" stroke="#f6e7a6" stroke-width="2" stroke-linecap="round"/>',
    sack: '<path d="M17 16c-6 5-9 11-9 16 0 5 5 8 16 8s16-3 16-8c0-5-3-11-9-16z" fill="#b08a55" stroke="#6e5230" stroke-width="1.5"/><path d="M17 16c2-3 2-5 0-8h14c-2 3-2 5 0 8z" fill="#c9a36a" stroke="#6e5230" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M16 16h16" stroke="#6e5230" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="19" cy="29" rx="2.2" ry="3.2" fill="#e3c46a"/><ellipse cx="27" cy="31" rx="2.2" ry="3.2" fill="#e3c46a" transform="rotate(25 27 31)"/><ellipse cx="24" cy="24" rx="2" ry="3" fill="#e3c46a" transform="rotate(-20 24 24)"/>',
    reroll: '<rect x="8" y="14" width="16" height="22" rx="3" fill="#2c3a4f" stroke="#8fb0e0" stroke-width="1.5" transform="rotate(-10 16 25)"/><rect x="22" y="12" width="16" height="22" rx="3" fill="#3b4d69" stroke="#8fb0e0" stroke-width="1.5" transform="rotate(8 30 23)"/>' +
      '<circle cx="30" cy="23" r="4" fill="none" stroke="#e9c95b" stroke-width="2.2"/><path d="M10 40c5 4 15 4 22 0M32 40l-1-4.5M32 40l-4.6 1" fill="none" stroke="#d6e2f5" stroke-width="2" stroke-linecap="round"/>',
    quiet: '<path d="M38 8C22 10 12 20 11 36c10-1 22-8 27-28z" fill="#9fd4e2" fill-opacity="0.85" stroke="#4d8a99" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 41c6-12 14-21 26-29M16 28l-1-7M22 22l-1-6M19 32l8-1M25 26l7-2" fill="none" stroke="#2f5d69" stroke-width="1.6" stroke-linecap="round"/>'
  };

  function upgrade(id) {
    return tile('#7cbf6b', UP[id] || UP.long);
  }

  // ---- the abilities: a sign 24×24, drawn with the colour of the rarity; @ is a soft fill ----

  const AB = {
    wrap: '<path d="M12 3v5M12 16v5"/><path d="M3 12h17M16 8l4 4-4 4"/>',
    shadow: '<path d="M3 9c3-4 6 4 9 0s6 4 9 0" stroke-width="3"/><path d="M3 17c3-4 6 4 9 0s6 4 9 0" stroke-width="3" opacity="0.4"/>',
    magnet: '<path d="M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4z"@/><path d="M6 8h4M14 8h4M9 21v1M15 21v1"/>',
    ghost: '<path d="M6 20v-9a6 6 0 0 1 12 0v9l-3-2-3 2-3-2z"@/><path d="M10 11v1.5M14 11v1.5"/>',
    ram: '<path d="M5 19l2-9 6-5 6 6-2 8z"@/><path d="M12.5 5.5l-1.5 5 3 2-2 6.5"/>',
    brow: '<path d="M4 16a8 8 0 0 1 16 0v2H4z"@/><path d="M12 8v10M2 21h20"/>',
    tongue: '<path d="M3 12h10l5-4M13 12l5 4"/><circle cx="20.5" cy="12" r="1.6"@/>',
    dash: '<path d="M4 6l6 6-6 6M12 6l6 6-6 6"/><path d="M21 9v6"/>',
    slow: '<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z"@/><path d="M8.5 14.5h2l1-2 1.5 4 1-2h1.5"/>',
    full: '<path d="M12 8c-4-3-8 0-8 5s4 8.5 8 6.5c4 2 8-1.5 8-6.5s-4-8-8-5z"@/><path d="M12 8c0-2 1-4 3-5"/>',
    molt: '<path d="M3 15c3-6 5 2 8-3s5 2 8-3" stroke-dasharray="2.5 3"/><circle cx="6" cy="19" r="1.8"@/><circle cx="13" cy="18" r="1.8"@/><circle cx="19" cy="15" r="1.8"@/>',
    venom: '<path d="M5 4c0 6 2 10 5 14 1-4 1.5-9 1.5-14z"@/><path d="M17 11c1.5 2 2.5 3.5 2.5 5a2.5 2.5 0 0 1-5 0c0-1.5 1-3 2.5-5z"@/>',
    whip: '<path d="M4 20c0-8 4-14 10-14 4 0 5 3.5 3 5.5s-5 0-4-2.5"/><path d="M19 15l2 1M18 18l1.5 2M21 12h1"/>',
    sight: '<path d="M2 12c3-5 7-7 10-7s7 2 10 7c-3 5-7 7-10 7s-7-2-10-7z"/><circle cx="12" cy="12" r="3.2"@/>',
    warm: '<path d="M12 3c1 4 5.5 6 5.5 11a5.5 5.5 0 0 1-11 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-4-1-6 1.5-9.5z"@/>',
    twin: '<circle cx="8" cy="15" r="4.5"@/><circle cx="16.5" cy="13" r="4.5"@/><path d="M8 10.5c0-2 1-3.5 2.5-4.5M16.5 8.5c0-2 1-3.5 2.5-4.5"/>',
    nose: '<circle cx="10" cy="14" r="5.5"/><path d="M18 3v5M15.5 5.5h5M19.5 12v3M18 13.5h3"/>',
    armor: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"@/><path d="M7 10c1.7 1.6 3.3 1.6 5 0 1.7 1.6 3.3 1.6 5 0M8 14.5c1.3 1.4 2.7 1.4 4 0 1.3 1.4 2.7 1.4 4 0"/>',
    curl: '<path d="M12 13a1 1 0 0 1 0-2 3 3 0 0 1 0 6 5 5 0 0 1 0-10 7 7 0 0 1 0 14" stroke-width="2.4"/>',
    reserve: '<circle cx="4.5" cy="14" r="2.5"@/><circle cx="10.5" cy="14" r="2.5"@/><circle cx="16.5" cy="14" r="2.5"@/><path d="M19.5 4v6M16.5 7h6"/>',
    hunger: '<circle cx="15.5" cy="12" r="5"@/><path d="M2 8h6M1 12h6M2 16h6"/>',
    reverse: '<path d="M7 20V9a5 5 0 0 1 10 0v8"/><path d="M13 13l4 4 4-4"/>',
    grain: '<ellipse cx="7" cy="15" rx="2.5" ry="4" transform="rotate(-20 7 15)"@/><ellipse cx="13" cy="9" rx="2.5" ry="4" transform="rotate(15 13 9)"@/><ellipse cx="17" cy="17" rx="2.5" ry="4" transform="rotate(35 17 17)"@/>',
    luck: '<circle cx="8.5" cy="8.5" r="3.5"@/><circle cx="15.5" cy="8.5" r="3.5"@/><circle cx="8.5" cy="15.5" r="3.5"@/><circle cx="15.5" cy="15.5" r="3.5"@/><path d="M12 12l5 9"/>',
    spine: '<path d="M8 3c9 2 9 7 0 9s-9 7 0 9"/><path d="M12 5.5l2-2M12 12l3 0M11 18.5l2 2M5 9l-2 0M5 15.5l-2 0"/>',
    short: '<path d="M6 21V4l11 3.5L6 11"@/><path d="M11 20h3M17 20h3"/>',
    devour: '<path d="M20 6.5a9 9 0 1 0 0 11l-8-5.5z"@/><path d="M11 7.5v.5"/><circle cx="20" cy="12" r="1.2"/>',
    rattle: '<circle cx="6.5" cy="16.5" r="4"@/><circle cx="12.5" cy="11" r="3"@/><circle cx="17" cy="7" r="2"@/><path d="M19 13c1 1 1 2.5 0 3.5M21.5 11c2 2 2 5.5 0 7.5"/>',
    herbs: '<path d="M12 21V8"/><path d="M12 13c-4 0-6-2-6-5 4 0 6 2 6 5zM12 9c0-3 2-5 6-5 0 3-2 5-6 5zM12 18c2.5 0 4.5-1.5 5-4-2.5 0-4.5 1.5-5 4z"@/>',
    ring: '<circle cx="12" cy="12" r="8" stroke-width="3"/><circle cx="12" cy="12" r="2"@/><circle cx="19" cy="8" r="1.2"/>'
  };

  function ability(id, rarity) {
    const color = RARE[rarity] || '#c9a0e0';
    const body = (AB[id] || AB.ring).replace(/@/g, ' fill="' + color + '" fill-opacity="0.3"');
    return tile(color, '<g transform="translate(7 7) scale(1.42)" fill="none" stroke="' + color + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + body + '</g>');
  }

  // ---- beasts and troubles, as they look on the glade ----

  const EN = {
    stone: '<path d="M10 30l4-14 12-7 11 8 2 13-9 9-14-1z" fill="#6c7078"/><path d="M14 16l12-7 11 8-12 5z" fill="#8b9098"/><path d="M25 22l-3 16M25 22l12-5" stroke="#4d5158" stroke-width="1.5" fill="none"/>',
    hedgehog: '<path d="M6 34C6 20 14 12 25 12s17 9 17 22z" fill="#7b654c"/><path d="M10 22l-5-5M15 16l-3-7M22 13l-1-8M29 13l2-8M35 17l5-6M39 23l6-3" stroke="#9a8062" stroke-width="2.4" stroke-linecap="round"/>' +
      '<path d="M6 34c0-5 3-8 8-8l4 8z" fill="#c9b08a"/><circle cx="11" cy="30" r="1.4" fill="' + DARK + '"/><circle cx="5.5" cy="33.5" r="1.8" fill="' + DARK + '"/><path d="M4 35h40" stroke="#4a3d2e" stroke-width="2" stroke-linecap="round"/>',
    beetle: '<path d="M12 14l-6-4M11 24H4M12 33l-6 5M36 14l6-4M37 24h7M36 33l6 5" stroke="#8c8f94" stroke-width="2" stroke-linecap="round"/><ellipse cx="24" cy="27" rx="12" ry="14" fill="#2a2c2f" stroke="#8c8f94" stroke-width="1.5"/>' +
      '<path d="M24 14v27" stroke="#8c8f94" stroke-width="1.5"/><path d="M15 16a9 7 0 0 1 18 0z" fill="#4a4d52" stroke="#8c8f94" stroke-width="1.5"/><path d="M20 9l-3-5M28 9l3-5" stroke="#8c8f94" stroke-width="1.6" stroke-linecap="round"/><path d="M17 24c2-1 3-1 4 0M28 30c2-1 3-1 4 0" stroke="#8c8f94" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
    mouse: '<path d="M38 30c5 0 7 3 4 6s-8 2-12 2" fill="none" stroke="#d9a9a0" stroke-width="2" stroke-linecap="round"/><ellipse cx="23" cy="29" rx="16" ry="10" fill="#b3ada3"/><circle cx="14" cy="18" r="5.5" fill="#b3ada3"/><circle cx="14" cy="18" r="3" fill="#d9a9a0"/>' +
      '<circle cx="24" cy="17" r="4.5" fill="#9a948b"/><circle cx="12" cy="27" r="1.6" fill="' + DARK + '"/><circle cx="6.5" cy="31" r="1.8" fill="#d9a9a0"/><path d="M8 33l-5 1M8 34.5l-4 3" stroke="#e8e4dc" stroke-width="1" stroke-linecap="round"/>',
    hawk: '<rect x="13" y="26" width="22" height="18" rx="2" fill="#000000" fill-opacity="0.35" stroke="#d0d0d0" stroke-width="1.2" stroke-dasharray="3 3"/><path d="M24 14C17 6 9 6 3 10c6 1 9 4 12 9zM24 14c7-8 15-8 21-4-6 1-9 4-12 9z" fill="#9a8468"/>' +
      '<path d="M24 10c-4 3-5 9-3 14l3 5 3-5c2-5 1-11-3-14z" fill="#c9b08a"/><path d="M22.5 13l1.5 3 1.5-3z" fill="#e3a25a"/><circle cx="22" cy="12" r="0.9" fill="' + DARK + '"/><circle cx="26" cy="12" r="0.9" fill="' + DARK + '"/>',
    vine: '<path d="M8 42c2-12 12-10 14-18s-6-9-8-4 6 9 14 5 10-12 12-18" fill="none" stroke="#3f7d48" stroke-width="3.5" stroke-linecap="round"/><path d="M13 35c-5-1-7-4-7-8 5 0 7 3 7 8zM27 27c0-5 3-8 8-8 0 5-3 8-8 8zM36 15c-4-2-5-5-4-9 4 2 5 5 4 9zM20 28c4 2 6 5 5 9-4-2-6-5-5-9z" fill="#5fa868"/>',
    mire: '<ellipse cx="24" cy="28" rx="20" ry="13" fill="#25433f"/><ellipse cx="22" cy="27" rx="13" ry="7" fill="#32605a"/><circle cx="17" cy="26" r="2.5" fill="none" stroke="#7fb5a8" stroke-width="1.4"/><circle cx="28" cy="30" r="1.8" fill="none" stroke="#7fb5a8" stroke-width="1.4"/>' +
      '<path d="M34 20v-9M34 11c-3-1-4-3-3-6M34 14c3-1 4-3 3-6" fill="none" stroke="#56704a" stroke-width="2" stroke-linecap="round"/>',
    holes: '<ellipse cx="12" cy="34" rx="9" ry="6" fill="#0b0c0d" stroke="#5a6a8a" stroke-width="2"/><ellipse cx="36" cy="18" rx="9" ry="6" fill="#0b0c0d" stroke="#8a7a5a" stroke-width="2"/><path d="M12 26c0-10 8-16 18-14" fill="none" stroke="#c8ccd4" stroke-width="1.8" stroke-dasharray="3 3" stroke-linecap="round"/><path d="M30 12l-3.5-2.5M30 12l-3 3" stroke="#c8ccd4" stroke-width="1.8" stroke-linecap="round"/>',
    rival: '<path d="M9 37c2 6 30 6 30-3 0-8-24-3-24-12 0-7 12-10 19-7" fill="none" stroke="#cf6a6a" stroke-width="7.5" stroke-linecap="round"/><path d="M9 37c2 6 30 6 30-3 0-8-24-3-24-12 0-7 12-10 19-7" fill="none" stroke="#7a2e2e" stroke-width="3" stroke-linecap="round" stroke-dasharray="0.1 8"/>' +
      '<ellipse cx="35" cy="15" rx="6.5" ry="5.5" fill="#cf6a6a"/><circle cx="37" cy="13.5" r="1.5" fill="' + DARK + '"/><path d="M33 10l5 2" stroke="' + DARK + '" stroke-width="1.4" stroke-linecap="round"/>',
    rockfall: '<rect x="9" y="30" width="30" height="13" rx="2" fill="#c0703a" fill-opacity="0.3" stroke="#c0703a" stroke-width="1.5"/><path d="M18 33l12 7M30 33l-12 7" stroke="#c0703a" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M17 18l3-9 8-3 6 6-1 8-7 4z" fill="#6c7078"/><path d="M20 9l8-3 6 6-9 2z" fill="#8b9098"/><path d="M14 4v6M24 1v3M35 3v5" stroke="#c8ccd4" stroke-width="1.6" stroke-linecap="round" stroke-opacity="0.6"/>'
  };

  function enemy(id) {
    return tile('#9aa0a8', EN[id] || EN.stone);
  }

  // ---- the burrow's goods ----

  const ITEM = {
    snack: '<path d="M24 16c-8-6-16 0-16 10s8 16 16 12c8 4 16-2 16-12s-8-16-16-10z" fill="#e0675a"/><path d="M24 16c0-4 2-7 6-9" fill="none" stroke="#6e5230" stroke-width="2.4" stroke-linecap="round"/><path d="M26 11c4-3 8-2 10 1-4 3-8 2-10-1z" fill="#7cbf6b"/><path d="M14 24c1-3 3-5 6-5" fill="none" stroke="#f6c4bd" stroke-width="2" stroke-linecap="round"/>',
    reroll: UP.reroll
  };

  function item(kind) {
    return tile('#e3a25a', ITEM[kind] || ITEM.snack);
  }

  // ---- the lands ----

  const LAND = {
    meadow: ['#7cbf6b', '<path d="M6 40c4-9 6-14 6-22M12 40c0-10 2-16 6-24M22 40c0-8-1-13-4-18M28 40c1-10 4-17 9-22M36 40c0-7 2-11 6-15" fill="none" stroke="#7cbf6b" stroke-width="2.6" stroke-linecap="round"/><circle cx="30" cy="12" r="4" fill="#e9c95b"/><path d="M4 41h40" stroke="#4d7d43" stroke-width="2.4" stroke-linecap="round"/>'],
    bog: ['#5fa39a', EN.mire],
    ridge: ['#9aa0a8', '<path d="M3 40l11-22 6 9 7-17 8 14 4-6 6 22z" fill="#6c7078"/><path d="M27 10l-3 7 4 2 3-5zM14 18l-2 5 3 1 2-3z" fill="#c8ccd4"/><path d="M3 41h42" stroke="#4d5158" stroke-width="2.4" stroke-linecap="round"/>']
  };

  function land(id) {
    const l = LAND[id] || LAND.meadow;
    return tile(l[0], l[1]);
  }

  function unknown() {
    return tile('#6c7078', '<circle cx="24" cy="24" r="10" fill="none" stroke="#6c7078" stroke-width="3" stroke-dasharray="4 5" stroke-linecap="round"/><circle cx="24" cy="24" r="2.5" fill="#6c7078"/>');
  }

  function el(markup, size, cls) {
    const span = document.createElement('span');
    span.className = 's-art' + (cls ? ' ' + cls : '');
    if (size) {
      span.style.width = size + 'px';
      span.style.height = size + 'px';
    }
    span.innerHTML = markup;
    return span;
  }

  window.SnakeArt = { snake, upgrade, ability, enemy, item, land, unknown, el, SNAKES };
})();
