// The pictures of «Подземелье одной клетки»: window.DungeonArt. Everything is drawn here as SVG,
// 48×48, in one palette (steel, ember, gold, moss, blood), with no text inside. A picture is markup;
// DungeonArt.el(markup, size) wraps it in a span.
//   DungeonArt.hero(id)            the portrait of a hero
//   DungeonArt.foe(id)             an enemy (an unknown id — a foe from the stock — gets the shade); 'boss' is the master
//   DungeonArt.card(kind)          a card of the field: potion, weapon, shield, gold, trap, key, chest, altar, stairs, whet, fog
//   DungeonArt.kind(id)            a good card of the treasury
//   DungeonArt.gift(id)            a gift of the hand
//   DungeonArt.seal(id, rarity)    a tile with the sign of a seal (an unknown id gets the plain seal)
//   DungeonArt.shop(what)          the workshop's own goods: slot, fort, blade
//   DungeonArt.unknown()           a thing not met yet
(function () {
  const STEEL = '#aab4c0';
  const DARK = '#15171a';
  const GOLD = '#e0b04a';
  const EMBER = '#e08a4a';
  const BLOOD = '#d0605a';
  const MOSS = '#6fbf8a';
  const WOOD = '#9a7450';
  const SKIN = '#e3c3a0';
  const VIOLET = '#a48fd9';
  const RARE = { c: '#b9c0c8', r: '#8fb0e0', l: GOLD };

  function svg(inner) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" aria-hidden="true">' + inner + '</svg>';
  }

  function tile(color, inner) {
    return svg('<rect x="1" y="1" width="46" height="46" rx="10" fill="' + color + '" fill-opacity="0.13" stroke="' + color + '" stroke-opacity="0.45" stroke-width="1.5"/>' + inner);
  }

  // ---- shared things ----

  const SWORD = '<path d="M33 5l8 2 2 8-19 19-10-10z" fill="' + STEEL + '"/><path d="M33 5l8 2-22 22-5-5z" fill="#dfe6ee"/><path d="M9 21l18 18" stroke="' + WOOD + '" stroke-width="4.5" stroke-linecap="round"/><path d="M15 33l-8 8" stroke="#6e5230" stroke-width="5" stroke-linecap="round"/><circle cx="6.5" cy="41.5" r="3" fill="' + GOLD + '"/>';
  const POTION = '<path d="M19 6h10v3h-1.5v9c6 3 9.5 8 9.5 14 0 7-5.5 11-13 11s-13-4-13-11c0-6 3.5-11 9.5-14V9H19z" fill="#2a3a36" stroke="' + STEEL + '" stroke-width="1.5" stroke-linejoin="round"/>' +
    '<path d="M12.5 30c2-2 5-2 7.5 0s6 2 8 0 5-2 7.5 0c1 8-4 11.5-11.5 11.5S11.5 38 12.5 30z" fill="' + MOSS + '"/><circle cx="20" cy="35" r="1.8" fill="#c9f0d6"/><circle cx="27" cy="38" r="1.2" fill="#c9f0d6"/><path d="M18 5h12" stroke="' + WOOD + '" stroke-width="4" stroke-linecap="round"/>';
  const SHIELD = '<path d="M24 5l16 5v11c0 11-6.5 18-16 22-9.5-4-16-11-16-22V10z" fill="#5d6a78" stroke="' + STEEL + '" stroke-width="1.6" stroke-linejoin="round"/><path d="M24 5v38c-9.5-4-16-11-16-22V10z" fill="#74828f"/><path d="M24 12v24M14 21h20" stroke="' + GOLD + '" stroke-width="3" stroke-linecap="round"/>';
  const COINS = '<ellipse cx="20" cy="35" rx="12" ry="5" fill="#8a6a1c"/><path d="M8 29v6c0 2.8 5.5 5 12 5s12-2.2 12-5v-6z" fill="#b08a2a"/><ellipse cx="20" cy="29" rx="12" ry="5" fill="' + GOLD + '"/>' +
    '<path d="M16 18v6c0 2.8 5.5 5 12 5s12-2.2 12-5v-6z" fill="#b08a2a"/><ellipse cx="28" cy="18" rx="12" ry="5" fill="#f0cf78"/><ellipse cx="28" cy="18" rx="6.5" ry="2.5" fill="none" stroke="#b08a2a" stroke-width="1.3"/>';
  const KEY = '<circle cx="15" cy="17" r="9" fill="none" stroke="' + GOLD + '" stroke-width="5"/><path d="M21 23l19 19M32 34l5-5M37 39l4-4" stroke="' + GOLD + '" stroke-width="5" stroke-linecap="round"/><circle cx="15" cy="17" r="9" fill="none" stroke="#f6e2a6" stroke-width="1.4" stroke-dasharray="10 50"/>';
  const WHET = '<path d="M6 30l24-12 12 6-24 12z" fill="#8b929b"/><path d="M6 30v6l12 6v-6z" fill="#5f666e"/><path d="M18 36v6l24-12v-6z" fill="#737a83"/><path d="M12 28l20-10" stroke="#dfe6ee" stroke-width="1.6" stroke-linecap="round"/><path d="M34 6l2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1z" fill="' + EMBER + '"/>';
  const CHEST = '<path d="M6 22h36v17a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" fill="' + WOOD + '"/><path d="M6 22v-5a9 9 0 0 1 9-9h18a9 9 0 0 1 9 9v5z" fill="#b08a62"/><path d="M6 22h36M14 8v33M34 8v33" stroke="#4a3620" stroke-width="2"/><rect x="20" y="18" width="8" height="10" rx="2" fill="' + GOLD + '" stroke="#7a5c12" stroke-width="1.2"/><circle cx="24" cy="22.5" r="1.5" fill="' + DARK + '"/>';
  const FLAME = (x, y, k, c1, c2) => '<path d="M' + x + ' ' + y + 'c' + (3 * k) + ' ' + (4.5 * k) + ' ' + (5 * k) + ' ' + (7 * k) + ' ' + (5 * k) + ' ' + (10.5 * k) + 'a' + (5 * k) + ' ' + (5 * k) + ' 0 0 1-' + (10 * k) + ' 0c0-' + (3.5 * k) + ' ' + (2 * k) + '-' + (6 * k) + ' ' + (5 * k) + '-' + (10.5 * k) + 'z" fill="' + c1 + '"/>' +
    '<circle cx="' + x + '" cy="' + (y + 11 * k) + '" r="' + (2.4 * k) + '" fill="' + c2 + '"/>';

  // ---- the heroes: a bust, the head and what the hero carries ----

  function bust(cloth, headgear, extra) {
    return '<path d="M6 46c0-10 6-16 18-16s18 6 18 16z" fill="' + cloth + '"/><circle cx="24" cy="20" r="9" fill="' + SKIN + '"/>' +
      '<circle cx="20.5" cy="20" r="1.3" fill="' + DARK + '"/><circle cx="27.5" cy="20" r="1.3" fill="' + DARK + '"/>' + headgear + (extra || '');
  }

  const HERO = {
    guard: bust('#5d6a78', '<path d="M14 18a10 10 0 0 1 20 0v2H14z" fill="' + STEEL + '"/><path d="M24 8v12" stroke="#dfe6ee" stroke-width="2"/><path d="M13 20h22" stroke="#7b8794" stroke-width="2.4" stroke-linecap="round"/>',
      '<path d="M33 30l9 2.5v5c0 4-3.5 7-9 8.5-5.5-1.5-9-4.5-9-8.5v-5z" fill="#74828f" stroke="' + STEEL + '" stroke-width="1.3" stroke-linejoin="round"/><path d="M33 34v8M29.5 37.5h7" stroke="' + GOLD + '" stroke-width="2" stroke-linecap="round"/>'),
    thief: bust('#3d3550', '<path d="M12 24c-1-10 4-17 12-17s13 7 12 17c-2-6-6-9-12-9s-10 3-12 9z" fill="#5a4d78"/><path d="M15 21h18v3H15z" fill="#2a2438"/>',
      '<circle cx="36" cy="38" r="6" fill="none" stroke="' + GOLD + '" stroke-width="3"/><path d="M36 44v3" stroke="' + GOLD + '" stroke-width="3" stroke-linecap="round"/>'),
    priestess: bust('#d9d2c2', '<path d="M11 30c-2-13 3-23 13-23s15 10 13 23c-1-9-5-15-13-15s-12 6-13 15z" fill="#efe9da"/><circle cx="24" cy="10" r="2.2" fill="' + GOLD + '"/>',
      '<path d="M32 33h6v2h-1v3c3 1.5 4.5 3.5 4.5 6 0 2-2 3-6.5 3s-6.5-1-6.5-3c0-2.5 1.5-4.5 4.5-6v-3h-1z" fill="#2a3a36" stroke="' + STEEL + '" stroke-width="1.1"/><path d="M29.5 43c2-1 9-1 11 0 0 2-2 3-5.5 3s-5.5-1-5.5-3z" fill="' + MOSS + '"/>'),
    smith: bust('#7a4a32', '<path d="M15 24c0 7 4 11 9 11s9-4 9-11c-2 3-5 4-9 4s-7-1-9-4z" fill="#6e5230"/><path d="M15 16c1-5 4-8 9-8s8 3 9 8z" fill="#3a3028"/>',
      '<path d="M37 26v20" stroke="' + WOOD + '" stroke-width="3.4" stroke-linecap="round"/><rect x="30" y="24" width="14" height="8" rx="1.5" fill="' + STEEL + '"/><rect x="30" y="24" width="14" height="3" rx="1.5" fill="#dfe6ee"/>'),
    madman: bust('#6a2f2c', '<path d="M12 18l-3-8 6 3 1-8 5 6 3-8 3 8 5-6 1 8 6-3-3 8c-2-4-6-6-12-6s-10 2-12 6z" fill="#c9c2b4"/><path d="M19 25c3 2.5 7 2.5 10 0" fill="none" stroke="' + DARK + '" stroke-width="1.4" stroke-linecap="round"/>',
      '<path d="M5 28l8 16M43 28l-8 16" stroke="' + STEEL + '" stroke-width="3.4" stroke-linecap="round"/><path d="M5 28l2.5 5M43 28l-2.5 5" stroke="#dfe6ee" stroke-width="1.4" stroke-linecap="round"/>')
  };

  function hero(id) {
    return tile(id === 'madman' ? BLOOD : VIOLET, HERO[id] || HERO.guard);
  }

  // ---- the enemies ----

  const EYES = (x1, x2, y, c) => '<circle cx="' + x1 + '" cy="' + y + '" r="1.7" fill="' + (c || '#f6e2a6') + '"/><circle cx="' + x2 + '" cy="' + y + '" r="1.7" fill="' + (c || '#f6e2a6') + '"/>';

  const FOE = {
    mold: '<path d="M6 40c0-9 4-12 8-12 0-7 4-11 10-11s10 4 10 11c4 0 8 3 8 12z" fill="#5f8a55"/><circle cx="15" cy="34" r="3" fill="#7fb072"/><circle cx="31" cy="30" r="4" fill="#7fb072"/><circle cx="24" cy="38" r="2.2" fill="#7fb072"/>' +
      EYES(20, 28, 24, '#e8f2c8') + '<path d="M13 16v-5M24 10V5M35 16v-5" stroke="#7fb072" stroke-width="2" stroke-linecap="round"/><circle cx="13" cy="9" r="2.2" fill="#b8d98a"/><circle cx="24" cy="4.5" r="2.2" fill="#b8d98a"/><circle cx="35" cy="9" r="2.2" fill="#b8d98a"/>',
    rat: '<path d="M38 34c6-1 8 3 5 6s-9 2-14 2" fill="none" stroke="#c99a94" stroke-width="2.2" stroke-linecap="round"/><path d="M5 34c0-10 7-16 17-16s18 6 18 15c0 6-5 9-17 9S5 40 5 34z" fill="#7d7468"/><circle cx="15" cy="16" r="6" fill="#7d7468"/><circle cx="15" cy="16" r="3.2" fill="#c99a94"/>' +
      '<circle cx="27" cy="15" r="5" fill="#6a6258"/><circle cx="13" cy="28" r="2" fill="' + BLOOD + '"/><circle cx="5.5" cy="33.5" r="2" fill="#c99a94"/><path d="M9 37l4 4 2-4 3 4 2-4" fill="#f2efe6"/>',
    dog: '<path d="M8 14l5-8 5 8zM30 14l5-8 5 8z" fill="#d8d2c0"/><path d="M8 14h32v14c0 8-7 14-16 14S8 36 8 28z" fill="#e8e2d0"/><path d="M15 21l6 3-6 3zM33 21l-6 3 6 3z" fill="' + DARK + '"/><path d="M22 32h4l-2 3z" fill="' + DARK + '"/>' +
      '<path d="M14 37h20" stroke="' + DARK + '" stroke-width="1.4"/><path d="M17 37v4M21 37v5M25 37v5M29 37v4" stroke="' + DARK + '" stroke-width="1.4"/><path d="M19 15l2 4M29 15l-2 4" stroke="#8a8474" stroke-width="1.4" stroke-linecap="round"/>',
    fly: '<path d="M22 20C14 8 5 8 4 15s8 10 18 9zM26 20c8-12 17-12 18-5s-8 10-18 9z" fill="#cfe4ee" fill-opacity="0.75" stroke="#8fb0c0" stroke-width="1.2"/><ellipse cx="24" cy="30" rx="8" ry="11" fill="#3a3f2c"/><path d="M17 29h14M17.5 34h13" stroke="' + GOLD + '" stroke-width="2.2"/>' +
      '<circle cx="24" cy="19" r="5.5" fill="#2a2e20"/><circle cx="21" cy="18" r="2.4" fill="' + BLOOD + '"/><circle cx="27" cy="18" r="2.4" fill="' + BLOOD + '"/><path d="M24 41v4" stroke="' + STEEL + '" stroke-width="1.8" stroke-linecap="round"/>',
    beetle: '<path d="M11 18l-7-5M10 28H3M11 37l-7 5M37 18l7-5M38 28h7M37 37l7 5" stroke="#a8683c" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="24" cy="29" rx="14" ry="15" fill="#b8733f"/><path d="M24 15v29" stroke="#6e3f1c" stroke-width="1.8"/>' +
      '<path d="M13 19a11 8 0 0 1 22 0z" fill="#8a5228"/><path d="M15 26c1-3 3-5 6-6" fill="none" stroke="#f0b98a" stroke-width="2.2" stroke-linecap="round"/><path d="M19 11l-4-6M29 11l4-6" stroke="#a8683c" stroke-width="2" stroke-linecap="round"/>' + EYES(20, 28, 16),
    thief: '<path d="M8 46c0-12 4-20 8-24-2-3-2-6-2-8 0-6 4-10 10-10s10 4 10 10c0 2 0 5-2 8 4 4 8 12 8 24z" fill="#2a2438" stroke="#5a4d78" stroke-width="1.3"/><ellipse cx="24" cy="15" rx="6.5" ry="6" fill="' + DARK + '"/>' + EYES(21.5, 26.5, 15, VIOLET) +
      '<path d="M30 30c-2.5 2.5-3.5 5-3.5 7 0 3 2.5 4 7.5 4s7.5-1 7.5-4c0-2-1-4.5-3.5-7z" fill="#b08a55"/><circle cx="34" cy="36" r="2.2" fill="' + GOLD + '"/>',
    root: '<path d="M24 44V22" stroke="#6e5230" stroke-width="7" stroke-linecap="round"/><path d="M24 30c-6 0-10 3-14 9M24 30c6 0 10 3 14 9M24 36c-3 2-4 5-5 8M24 36c3 2 4 5 5 8" fill="none" stroke="#6e5230" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M10 20c0-8 6-14 14-14s14 6 14 14c0 5-6 8-14 8s-14-3-14-8z" fill="#4f7a48"/><path d="M14 14c2-3 5-5 9-5" fill="none" stroke="#8fc27a" stroke-width="2" stroke-linecap="round"/>' + EYES(19.5, 28.5, 19, '#f0cf78') + '<path d="M19 24c3 1.5 7 1.5 10 0" fill="none" stroke="' + DARK + '" stroke-width="1.4" stroke-linecap="round"/>',
    twin: '<path d="M4 46c0-9 4-14 12-14s12 5 12 14z" fill="#4a5560"/><circle cx="16" cy="22" r="8" fill="#8b98a6"/>' + EYES(13, 19, 22, DARK) + '<path d="M20 46c0-9 4-14 12-14s12 5 12 14z" fill="#2c3238" stroke="' + STEEL + '" stroke-width="1.2" stroke-dasharray="3 3"/><circle cx="32" cy="22" r="8" fill="#3a424a" stroke="' + STEEL + '" stroke-width="1.2" stroke-dasharray="3 3"/>' + EYES(29, 35, 22, BLOOD),
    witch: '<path d="M8 46c0-10 6-15 16-15s16 5 16 15z" fill="#3d2f55"/><circle cx="24" cy="25" r="8" fill="#b9c9a0"/>' + EYES(21, 27, 25, DARK) + '<path d="M9 20c8-3 22-3 30 0-4 2-26 2-30 0z" fill="#2a2038"/><path d="M15 19L26 3l7 16z" fill="#3d2f55"/><path d="M17 16h15" stroke="' + GOLD + '" stroke-width="2.2"/>' +
      '<path d="M21 29c2 1.5 4 1.5 6 0" fill="none" stroke="' + DARK + '" stroke-width="1.3" stroke-linecap="round"/><circle cx="39" cy="36" r="4" fill="' + MOSS + '" fill-opacity="0.8"/><circle cx="41" cy="29" r="1.5" fill="' + MOSS + '"/>',
    boss: '<path d="M6 14l-3-9 9 5zM42 14l3-9-9 5z" fill="#e8e2d0"/><path d="M7 20c0-9 7-14 17-14s17 5 17 14v10c0 8-7 14-17 14S7 38 7 30z" fill="#5a2a2a" stroke="' + BLOOD + '" stroke-width="1.5"/><path d="M13 21l8 3-8 4zM35 21l-8 3 8 4z" fill="' + EMBER + '"/>' +
      '<path d="M14 34h20l-2 5-3-3-2.5 4-2.5-4-2.5 4-2.5-4-3 3z" fill="#f2efe6"/><path d="M16 10l3-6 5 5 5-5 3 6" fill="none" stroke="' + GOLD + '" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>',
    shade: '<path d="M10 44V22a14 14 0 0 1 28 0v22l-5-4-4.5 4-4.5-4-4.5 4-4.5-4z" fill="#4a3a5a" stroke="' + VIOLET + '" stroke-opacity="0.6" stroke-width="1.3"/>' + EYES(19, 29, 22, BLOOD) + '<path d="M19 30c3 2.5 7 2.5 10 0" fill="none" stroke="' + DARK + '" stroke-width="1.6" stroke-linecap="round"/>'
  };

  function foe(id) {
    return svg(FOE[id] || FOE.shade);
  }

  // ---- the cards of the field ----

  const CARD = {
    potion: POTION,
    weapon: SWORD,
    shield: SHIELD,
    gold: COINS,
    key: KEY,
    whet: WHET,
    chest: CHEST,
    trap: '<path d="M4 40h40" stroke="#6a727c" stroke-width="4" stroke-linecap="round"/><path d="M6 40l5-22 5 22zM18 40l6-30 6 30zM32 40l5-22 5 22z" fill="' + STEEL + '"/><path d="M11 18l2.5 22H6zM24 10l3 30h-9zM37 18l2.5 22H32z" fill="#dfe6ee" fill-opacity="0.55"/><path d="M24 10l1.5 6h-3z" fill="' + BLOOD + '"/>',
    altar: '<path d="M8 42h32v-5H8z" fill="#5f666e"/><path d="M12 37h24V25H12z" fill="#737a83"/><path d="M9 25h30v-5H9z" fill="#8b929b"/><path d="M19 37V25M29 37V25" stroke="#4d535a" stroke-width="1.6"/>' + FLAME(24, 3, 1, BLOOD, '#f6c4a0'),
    stairs: '<path d="M6 42V30h9v-8h9v-8h9V6h9v36z" fill="#3a4048"/><path d="M6 30h9v-8h9v-8h9V6h9" fill="none" stroke="' + VIOLET + '" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/><path d="M15 30v12M24 22v20M33 14v28" stroke="#252a30" stroke-width="1.6"/>' +
      '<path d="M10 10v10M6 16l4 4 4-4" fill="none" stroke="' + VIOLET + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    fog: '<path d="M10 20a7 7 0 0 1 13-3 6 6 0 0 1 11 2 5.5 5.5 0 0 1 1 11H12a5.5 5.5 0 0 1-2-10z" fill="#5f666e"/><path d="M8 36h22M34 36h6M12 42h8M24 42h14" stroke="#5f666e" stroke-width="3" stroke-linecap="round"/>'
  };

  function card(kind) {
    return svg(CARD[kind] || CARD.fog);
  }

  // ---- the treasury: the same things, each with the mark of where it came from ----

  const KIND = {
    smith: SWORD + '<path d="M33 30h11v6h-3v5h-5v-5h-3z" fill="#5f666e"/><path d="M33 30h11v2.5H33z" fill="#8b929b"/>',
    hearth: POTION.replace(new RegExp(MOSS, 'g'), EMBER).replace(/#c9f0d6/g, '#ffe2bf') + FLAME(37, 24, 0.8, EMBER, '#ffe2bf'),
    board: '<path d="M24 5l16 5v11c0 11-6.5 18-16 22-9.5-4-16-11-16-22V10z" fill="' + WOOD + '" stroke="#6e5230" stroke-width="1.6" stroke-linejoin="round"/><path d="M16 8v29M24 5v38M32 8v29" stroke="#6e5230" stroke-width="1.6"/>' +
      '<path d="M9 17h30M10 28h28" stroke="' + STEEL + '" stroke-width="3"/><circle cx="13" cy="17" r="1.6" fill="' + DARK + '"/><circle cx="35" cy="17" r="1.6" fill="' + DARK + '"/><circle cx="14" cy="28" r="1.6" fill="' + DARK + '"/><circle cx="34" cy="28" r="1.6" fill="' + DARK + '"/>',
    purse: '<path d="M17 17c-7 6-10 12-10 18 0 6 6 9 17 9s17-3 17-9c0-6-3-12-10-18z" fill="#b08a55" stroke="#6e5230" stroke-width="1.5"/><path d="M17 17c2-3.5 2-6 0-9.5h14c-2 3.5-2 6 0 9.5z" fill="#c9a36a" stroke="#6e5230" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M15 17h18" stroke="#6e5230" stroke-width="2.6" stroke-linecap="round"/><circle cx="24" cy="31" r="6.5" fill="' + GOLD + '" stroke="#7a5c12" stroke-width="1.3"/><circle cx="24" cy="31" r="3" fill="none" stroke="#7a5c12" stroke-width="1.2"/>',
    key: KEY + '<circle cx="36" cy="12" r="6" fill="none" stroke="' + STEEL + '" stroke-width="2.2"/><path d="M36 18v6" stroke="' + STEEL + '" stroke-width="2.2" stroke-linecap="round"/>',
    stone: WHET
  };

  function kind(id) {
    return tile(MOSS, KIND[id] || CARD.chest);
  }

  // ---- the gifts ----

  const MINI = (x, y, c) => '<rect x="' + x + '" y="' + y + '" width="13" height="17" rx="2.5" fill="' + c + '" stroke="' + DARK + '" stroke-width="1"/>';

  const GIFT = {
    swap: MINI(6, 8, STEEL) + MINI(29, 23, EMBER) + '<path d="M23 12h8a5 5 0 0 1 5 5v2M25 36h-8a5 5 0 0 1-5-5v-2" fill="none" stroke="#f2efe6" stroke-width="2.4" stroke-linecap="round"/><path d="M32.5 16l3.5 3.5 3.5-3.5M15.5 32L12 28.5 8.5 32" fill="none" stroke="#f2efe6" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    horseshoe: '<path d="M13 40V22a11 11 0 0 1 22 0v18" fill="none" stroke="' + GOLD + '" stroke-width="7" stroke-linecap="round"/><path d="M13 40V22a11 11 0 0 1 22 0v18" fill="none" stroke="#7a5c12" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="0.1 6"/><path d="M9 40h8M31 40h8" stroke="#f0cf78" stroke-width="4" stroke-linecap="round"/>',
    empty: '<rect x="14" y="20" width="20" height="24" rx="3" fill="none" stroke="' + STEEL + '" stroke-width="2" stroke-dasharray="4 3"/><path d="M19 7c4 0 6 3 6 7s-2 8-5 8-4-3-4-7 1-8 3-8zM31 16c3 0 4.5 2.5 4.5 5.5S34 27 31.5 27s-3-2-3-5 .5-6 2.5-6z" fill="#f2efe6" fill-opacity="0.85"/>',
    sip: '<path d="M10 14h28l-3 26a3 3 0 0 1-3 3H16a3 3 0 0 1-3-3z" fill="#2a3a36" stroke="' + STEEL + '" stroke-width="1.5" stroke-linejoin="round"/><path d="M11.5 24h25l-2 16a2 2 0 0 1-2 2H15.5a2 2 0 0 1-2-2z" fill="' + MOSS + '"/>' +
      '<path d="M24 37s-6-3.5-6-7.5a3.2 3.2 0 0 1 6-1.6 3.2 3.2 0 0 1 6 1.6c0 4-6 7.5-6 7.5z" fill="#f2efe6"/><path d="M31 5c-2 2-2 4 0 6" fill="none" stroke="' + STEEL + '" stroke-width="1.8" stroke-linecap="round"/>',
    whet: WHET,
    glance: '<path d="M3 24c6-10 13-14 21-14s15 4 21 14c-6 10-13 14-21 14S9 34 3 24z" fill="#f2efe6"/><circle cx="24" cy="24" r="9" fill="' + VIOLET + '"/><circle cx="24" cy="24" r="4.5" fill="' + DARK + '"/><circle cx="27" cy="21" r="1.8" fill="#ffffff"/>',
    shot: '<path d="M8 40L34 14" stroke="' + WOOD + '" stroke-width="3" stroke-linecap="round"/><path d="M40 8l-3 12-9-9z" fill="' + STEEL + '"/><path d="M8 40l-3-7M8 40l7 3M12 36l-3-7M12 36l7 3" stroke="' + BLOOD + '" stroke-width="2.2" stroke-linecap="round"/>' +
      '<path d="M22 8a14 14 0 0 1 18 18" fill="none" stroke="#f2efe6" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="2 4"/>',
    silence: '<path d="M14 28V16a10 10 0 0 1 20 0v12l5 7H9z" fill="' + GOLD + '" stroke="#7a5c12" stroke-width="1.5" stroke-linejoin="round"/><circle cx="24" cy="40" r="3.5" fill="#7a5c12"/><path d="M6 6l36 36" stroke="' + BLOOD + '" stroke-width="3.4" stroke-linecap="round"/>',
    squeeze: MINI(17.5, 6, STEEL) + '<path d="M9 30h30v12H9z" fill="#3a4048" stroke="' + STEEL + '" stroke-width="1.3"/><path d="M9 34h30M9 38h30" stroke="' + STEEL + '" stroke-width="1"/><path d="M24 20v12M19 27l5 5 5-5" fill="none" stroke="#f2efe6" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
    double: '<path d="M13 9c4 0 6 3.5 6 8s-2 9-5.5 9S9 22.5 9 18s1.5-9 4-9zM10.5 29h7v3a3.5 3.5 0 0 1-7 0z" fill="#f2efe6"/><path d="M34 19c4 0 6 3.5 6 8s-2 9-5.5 9S30 32.5 30 28s1.5-9 4-9zM31.5 39h7v3a3.5 3.5 0 0 1-7 0z" fill="' + EMBER + '"/>'
  };

  function gift(id) {
    return tile(EMBER, GIFT[id] || GIFT.swap);
  }

  // ---- the seals: a sign 24×24 in the colour of the rarity; @ is a soft fill ----

  const SE = {
    belt: '<path d="M2 9h20v6H2z"@/><rect x="9" y="7" width="6" height="10" rx="1"/><path d="M12 12h3"/>',
    grip: '<path d="M15 3l6 6-9 9-6-6z"@/><path d="M9 15l-6 6M5 13l6 6M8.5 12.5l3 3"/>',
    cauldron: '<path d="M4 10h16v4a8 7 0 0 1-16 0z"@/><path d="M2 10h20M7 20l-1 2M17 20l1 2M9 6c0-1.5 1-1.5 1-3M14 6c0-1.5 1-1.5 1-3"/>',
    piggy: '<path d="M4 13a7 6 0 0 1 14-1l3 1v3l-3 1a7 6 0 0 1-2 2v2h-3v-1.5h-3V21H7v-2.5A6 6 0 0 1 4 13z"@/><path d="M9 8h4M15 12h.01"/>',
    sleep: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"@/><path d="M15 3h4l-4 4h4"/>',
    bolt: '<rect x="3" y="9" width="18" height="6" rx="1"@/><path d="M7 9v6M17 9v6M10 12h8M18 12v-6"/>',
    lockpick: '<path d="M3 21l9-9"/><path d="M12 12c0-2 2-2 2-4s2-2 2-4 2-1.5 4-1.5"/><circle cx="5" cy="19" r="2.5"@/>',
    leech: '<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z"@/><path d="M9.5 13l1.5 3 1-3 1 3 1.5-3"/>',
    counter: '<path d="M4 20L16 8"/><path d="M14 4l6 0 0 6z"@/><path d="M4 14l6 6M20 20l-5-5M20 14l-3 3"/>',
    hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5M14 10.5V5.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6.5 7-3 0-4.5-1.5-6-4l-1.8-3.2a1.4 1.4 0 0 1 2.3-1.6L8 15"@/>',
    abacus: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9.5h18M3 14.5h18"/><circle cx="8" cy="9.5" r="1.8"@/><circle cx="15" cy="9.5" r="1.8"@/><circle cx="11" cy="14.5" r="1.8"@/>',
    quiet: '<path d="M7 20c-2-3-2-9 1-12s6-3 7 0-1 5-3 7 0 5 3 5"/><path d="M18 5c2 2 2 5 0 7"/><circle cx="8.5" cy="4" r="1.2"@/><circle cx="12.5" cy="3" r="1.2"@/>',
    mirror: '<path d="M12 2v20" stroke-dasharray="2 2.5"/><path d="M9 5L4 10l5 9z"@/><path d="M15 5l5 5-5 9z"/>',
    spare: '<path d="M8 3v13M16 3v13"/><path d="M5 16h6M13 16h6M8 16v5M16 16v5"/><path d="M8 3l2 3M16 3l2 3"/>',
    breath: '<path d="M4 20h4v-4h4v-4h4V8h4"/><path d="M3 6c2-2 4-2 6 0s4 2 6 0"/>',
    hunger: '<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"@/><path d="M12 4v-2M9.5 3h5"/>',
    greed: '<circle cx="12" cy="12" r="8"@/><path d="M9 9.5h4.5a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3H15M12 7.5v1.5M12 15.5V17"/><path d="M19 3l2 2-2 2"/>',
    stone: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"@/><path d="M8 9l3 2-1 3 3 1.5 3-3"/>',
    shadow: '<circle cx="9" cy="6" r="3"@/><path d="M4 21v-5a5 5 0 0 1 10 0v5"@/><path d="M15 9a3 3 0 0 1 3 3M16 15a5 5 0 0 1 5 5v1" stroke-dasharray="2 2.5"/>',
    echo: '<circle cx="12" cy="12" r="2"@/><path d="M7.5 7.5a6.5 6.5 0 0 0 0 9M16.5 7.5a6.5 6.5 0 0 1 0 9M4.5 4.5a10.5 10.5 0 0 0 0 15M19.5 4.5a10.5 10.5 0 0 1 0 15"/>',
    last: '<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"@/><path d="M7 13h3l1.5-3 2 6 1.5-3h3"/>',
    master: '<path d="M14.5 3H21v6.5L10 20.5 3.5 14z"@/><path d="M6 17l-3 3M8.5 12.5l3 3"/><path d="M4 4l1 2 2 .500-1.5 1.5.5 2-2-1-2 1 .5-2L1 6.5 3 6z"/>',
    plain: '<circle cx="12" cy="10" r="6"@/><path d="M9 15l-2 6 5-2 5 2-2-6M12 7v6M9 10h6"/>'
  };

  function seal(id, rarity) {
    const color = RARE[rarity] || '#c9a0e0';
    const body = (SE[id] || SE.plain).replace(/@/g, ' fill="' + color + '" fill-opacity="0.3"');
    return tile(color, '<g transform="translate(7 7) scale(1.42)" fill="none" stroke="' + color + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + body + '</g>');
  }

  // ---- the workshop ----

  const SHOP = {
    slot: CHEST + '<circle cx="38" cy="10" r="8" fill="' + DARK + '" stroke="' + MOSS + '" stroke-width="1.6"/><path d="M38 6v8M34 10h8" stroke="' + MOSS + '" stroke-width="2.4" stroke-linecap="round"/>',
    fort: '<path d="M10 44V18h28v26z" fill="#737a83"/><path d="M7 18V8h7v4h6V8h8v4h6V8h7v10z" fill="#8b929b"/><path d="M19 44V33a5 5 0 0 1 10 0v11z" fill="' + DARK + '"/><path d="M14 24h6M28 24h6M12 31h4M32 31h4" stroke="#4d535a" stroke-width="1.8" stroke-linecap="round"/>' +
      '<path d="M24 29s-3-2-3-4.2a1.7 1.7 0 0 1 3-.900 1.7 1.7 0 0 1 3 .900c0 2.2-3 4.2-3 4.2z" fill="' + BLOOD + '"/>',
    blade: SWORD
  };

  function shop(what) {
    return tile(EMBER, SHOP[what] || SHOP.slot);
  }

  function unknown() {
    return tile('#6a727c', '<circle cx="24" cy="24" r="10" fill="none" stroke="#6a727c" stroke-width="3" stroke-dasharray="4 5" stroke-linecap="round"/><circle cx="24" cy="24" r="2.5" fill="#6a727c"/>');
  }

  function el(markup, size, cls) {
    const span = document.createElement('span');
    span.className = 'd-art' + (cls ? ' ' + cls : '');
    if (size) {
      span.style.width = size + 'px';
      span.style.height = size + 'px';
    }
    span.innerHTML = markup;
    return span;
  }

  window.DungeonArt = { hero, foe, card, kind, gift, seal, shop, unknown, el, tile };
})();
