// The pictures of the hub and the cards of «Последний рубеж»: window.WaveArt (the arena itself
// is ui/draw.js). Everything is drawn here as SVG, 48×48, in the colours of the arena (the teal hero,
// gold, the rarity colours), with no text inside. A picture is markup; WaveArt.el(markup, size) wraps it.
//   WaveArt.hero(id)             the portrait of a hero
//   WaveArt.mode(id)             a mode: normal, sprint, endless, daily
//   WaveArt.storm(level)         the storm: a calm cloud at 0, more lightning as the step grows
//   WaveArt.workshop(id)         an upgrade of the workshop
//   WaveArt.card(kind, id, r)    a level-up card: w weapon, p passive, x a model's card, f fusion, gold, heal; r — rarity 0–3
//   WaveArt.unknown()            a thing not opened yet
(function () {
  const TEAL = '#6fc9b8';
  const DEEP = '#3d7d72';
  const GOLD = '#f0c04a';
  const RED = '#d0605a';
  const BLUE = '#6fa8ff';
  const VIOLET = '#b79cff';
  const STEEL = '#aab4c0';
  const DARK = '#14181a';
  const RARITY = ['#a9aeb4', BLUE, VIOLET, GOLD];

  function svg(inner) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" aria-hidden="true">' + inner + '</svg>';
  }

  function tile(color, inner) {
    return svg('<rect x="1" y="1" width="46" height="46" rx="10" fill="' + color + '" fill-opacity="0.13" stroke="' + color + '" stroke-opacity="0.45" stroke-width="1.5"/>' + inner);
  }

  // ---- the heroes: the round fighter of the arena, each with its own gear ----

  function body(color, line) {
    return '<circle cx="24" cy="26" r="13" fill="' + color + '" stroke="' + line + '" stroke-width="2"/><path d="M13 23h22v6H13z" fill="' + DARK + '"/><circle cx="19.5" cy="26" r="1.8" fill="#e9fff9"/><circle cx="28.5" cy="26" r="1.8" fill="#e9fff9"/>' +
      '<path d="M15 18c2-3 5-5 9-5" fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="2" stroke-linecap="round"/>';
  }

  const SPARK = (x, y, k, c) => '<path d="M' + x + ' ' + (y - 6 * k) + 'l' + (1.8 * k) + ' ' + (4.2 * k) + ' ' + (4.2 * k) + ' ' + (1.8 * k) + '-' + (4.2 * k) + ' ' + (1.8 * k) + '-' + (1.8 * k) + ' ' + (4.2 * k) + '-' + (1.8 * k) + '-' + (4.2 * k) + '-' + (4.2 * k) + '-' + (1.8 * k) + ' ' + (4.2 * k) + '-' + (1.8 * k) + 'z" fill="' + c + '"/>';

  const HERO = {
    wanderer: body(TEAL, DEEP) + SPARK(38, 10, 1, GOLD) + SPARK(9, 12, 0.6, '#fff0c2'),
    keeper: '<circle cx="24" cy="26" r="19" fill="none" stroke="' + STEEL + '" stroke-opacity="0.35" stroke-width="1.5" stroke-dasharray="3 4"/>' + body('#7fb5d6', '#3f6f8f') +
      '<path d="M24 4l4 5-4 3-4-3zM44 26l-5 4-3-4 3-4zM24 48l-4-5 4-3 4 3zM4 26l5-4 3 4-3 4z" fill="' + STEEL + '"/>',
    bomber: body('#c9a25a', '#7a5c22') + '<circle cx="37" cy="37" r="7" fill="#3a3f2c" stroke="#8fa060" stroke-width="1.5"/><path d="M37 28v-4M30 31l-3-2M44 31l3-2" stroke="#8fa060" stroke-width="2" stroke-linecap="round"/><circle cx="37" cy="37" r="2.2" fill="' + RED + '"/>',
    hunter: '<path d="M10 22c0-9 6-15 14-15s14 6 14 15c-4-4-9-5-14-5s-10 1-14 5z" fill="#5a6f4a"/>' + body('#8fc27a', '#4d7d43') + '<path d="M10 22c0-9 6-15 14-15s14 6 14 15c-4-3-9-4-14-4s-10 1-14 4z" fill="#5a6f4a"/>' +
      '<path d="M40 44V30M35 44l2-12M45 44l-2-12" stroke="' + STEEL + '" stroke-width="1.8" stroke-linecap="round"/>',
    mechanic: body('#d39a5a', '#8a5a22') + '<circle cx="19.5" cy="26" r="4" fill="none" stroke="' + GOLD + '" stroke-width="1.8"/><circle cx="28.5" cy="26" r="4" fill="none" stroke="' + GOLD + '" stroke-width="1.8"/>' +
      '<rect x="3" y="7" width="9" height="5" rx="2" fill="' + STEEL + '"/><path d="M1 6h13" stroke="#dfe6ee" stroke-width="1.6" stroke-linecap="round"/><rect x="36" y="5" width="9" height="5" rx="2" fill="' + STEEL + '"/><path d="M34 4h13" stroke="#dfe6ee" stroke-width="1.6" stroke-linecap="round"/>',
    hermit: '<circle cx="24" cy="26" r="20" fill="none" stroke="' + VIOLET + '" stroke-opacity="0.45" stroke-width="1.5"/><circle cx="24" cy="26" r="16.5" fill="none" stroke="' + VIOLET + '" stroke-opacity="0.7" stroke-width="1.5" stroke-dasharray="2 4"/>' + body('#a493c9', '#5a4d78') +
      '<path d="M15 31c2 6 5 9 9 9s7-3 9-9c-3 1-6 1.5-9 1.5S18 32 15 31z" fill="#e8e4f2"/>'
  };

  function hero(id) {
    return tile(TEAL, HERO[id] || HERO.wanderer);
  }

  // ---- the modes ----

  const WAVE = (y, c, o) => '<path d="M4 ' + y + 'c3-4 6-4 9 0s6 4 9 0 6-4 9 0 6 4 9 0 6-4 6-2" fill="none" stroke="' + c + '" stroke-opacity="' + o + '" stroke-width="2.6" stroke-linecap="round"/>';

  const MODE = {
    normal: '<circle cx="24" cy="27" r="15" fill="#22302e" stroke="' + TEAL + '" stroke-width="2.4"/><path d="M20 6h8M24 6v6M36 13l3-3" stroke="' + TEAL + '" stroke-width="2.6" stroke-linecap="round"/><path d="M24 27V17" stroke="#e9fff9" stroke-width="2.6" stroke-linecap="round"/>' +
      '<path d="M24 27l7 5" stroke="' + GOLD + '" stroke-width="2.6" stroke-linecap="round"/><path d="M24 14v2M37 27h-2M24 40v-2M11 27h2M33 18l-1.4 1.4" stroke="' + TEAL + '" stroke-width="1.8" stroke-linecap="round"/>',
    sprint: '<rect x="11" y="5" width="26" height="30" rx="6" fill="#2c4a66" stroke="' + BLUE + '" stroke-width="1.8"/><rect x="15" y="10" width="18" height="10" rx="2" fill="#cfe4ff"/><circle cx="17" cy="28" r="2.4" fill="' + GOLD + '"/><circle cx="31" cy="28" r="2.4" fill="' + GOLD + '"/>' +
      '<path d="M15 35l-6 9M33 35l6 9M13 40h22" stroke="' + STEEL + '" stroke-width="2.4" stroke-linecap="round"/><path d="M2 14h5M1 20h6M3 26h4" stroke="' + BLUE + '" stroke-width="2" stroke-linecap="round"/>',
    endless: '<path d="M24 20c-3.5-5.5-6.5-8-10-8a8 8 0 0 0 0 16c3.5 0 6.5-2.5 10-8s6.5-8 10-8a8 8 0 0 1 0 16c-3.5 0-6.5-2.5-10-8z" fill="none" stroke="' + VIOLET + '" stroke-width="4" stroke-linejoin="round"/>' + WAVE(36, TEAL, 0.9) + WAVE(43, TEAL, 0.450),
    daily: '<rect x="7" y="9" width="34" height="33" rx="5" fill="#2e2a1c" stroke="' + GOLD + '" stroke-width="1.8"/><path d="M7 18h34" stroke="' + GOLD + '" stroke-width="1.8"/><path d="M15 5v8M33 5v8" stroke="' + STEEL + '" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M24 21l2.7 6 6.3.600-4.8 4.2 1.5 6.2-5.7-3.4-5.7 3.4 1.5-6.2-4.8-4.2 6.3-.600z" fill="' + GOLD + '"/>'
  };

  function mode(id) {
    return tile(id === 'sprint' ? BLUE : id === 'endless' ? VIOLET : id === 'daily' ? GOLD : TEAL, MODE[id] || MODE.normal);
  }

  // ---- the storm ----

  const BOLT = (x, y, c) => '<path d="M' + x + ' ' + y + 'l-5 9h4l-2 8 7-10h-4l3-7z" fill="' + c + '"/>';

  function storm(level) {
    const n = level <= 0 ? 0 : level <= 5 ? 1 : level <= 10 ? 2 : 3;
    const cloud = n ? '#56607a' : '#6a727c';
    let s = '';
    if (!n) s += '<circle cx="33" cy="15" r="7" fill="' + GOLD + '" fill-opacity="0.85"/>';
    s += '<path d="M12 28a8 8 0 0 1 3-15 10 10 0 0 1 19 1 7.5 7.5 0 0 1 1 14z" fill="' + cloud + '"/><path d="M15 16a7 7 0 0 1 8-5" fill="none" stroke="#ffffff" stroke-opacity="0.35" stroke-width="2" stroke-linecap="round"/>';
    if (n === 1) s += BOLT(26, 27, GOLD);
    if (n === 2) s += BOLT(20, 27, GOLD) + BOLT(33, 27, GOLD);
    if (n === 3) s += BOLT(16, 27, GOLD) + BOLT(27, 27, '#fff0c2') + BOLT(38, 27, GOLD);
    if (n) s += '<path d="M10 33l-2 5M40 33l-2 5' + (n > 1 ? 'M26 40l-1.5 4' : '') + '" stroke="' + BLUE + '" stroke-width="2" stroke-linecap="round"/>';
    else s += '<path d="M14 36h20M20 42h14" stroke="#6a727c" stroke-width="2.4" stroke-linecap="round"/>';
    return tile(n ? VIOLET : '#8a929c', s);
  }

  // ---- the workshop ----

  const HEART = (c) => '<path d="M24 41S7 31 7 18a9 9 0 0 1 17-4.5A9 9 0 0 1 41 18c0 13-17 23-17 23z" fill="' + c + '"/><path d="M13 17a4.5 4.5 0 0 1 4.5-4.5" fill="none" stroke="#ffffff" stroke-opacity="0.6" stroke-width="2.4" stroke-linecap="round"/>';
  const SHIELD = '<path d="M24 5l16 5v11c0 11-6.5 18-16 22-9.5-4-16-11-16-22V10z" fill="#5d6a78" stroke="' + STEEL + '" stroke-width="1.6" stroke-linejoin="round"/><path d="M24 5v38c-9.5-4-16-11-16-22V10z" fill="#74828f"/><path d="M24 13l8 3v6c0 5-3 9-8 11-5-2-8-6-8-11v-6z" fill="none" stroke="#dfe6ee" stroke-width="1.8" stroke-linejoin="round"/>';
  const CRYSTAL = (x, y, k, c, l) => '<path d="M' + x + ' ' + y + 'l' + (7 * k) + ' ' + (9 * k) + '-' + (7 * k) + ' ' + (13 * k) + '-' + (7 * k) + '-' + (13 * k) + 'z" fill="' + c + '"/><path d="M' + x + ' ' + y + 'l' + (7 * k) + ' ' + (9 * k) + '-' + (7 * k) + ' ' + (3 * k) + 'z" fill="' + l + '"/>';
  const CARDS = '<rect x="9" y="12" width="16" height="24" rx="3" fill="#2c3a4f" stroke="' + BLUE + '" stroke-width="1.5" transform="rotate(-10 17 24)"/><rect x="23" y="10" width="16" height="24" rx="3" fill="#3b4d69" stroke="' + BLUE + '" stroke-width="1.5" transform="rotate(8 31 22)"/>';

  const WS = {
    power: '<path d="M33 5l8 2 2 8-19 19-10-10z" fill="' + STEEL + '"/><path d="M33 5l8 2-22 22-5-5z" fill="#dfe6ee"/><path d="M9 21l18 18" stroke="#9a7450" stroke-width="4.5" stroke-linecap="round"/><path d="M15 33l-8 8" stroke="#6e5230" stroke-width="5" stroke-linecap="round"/>' + SPARK(10, 10, 0.9, RED),
    vitality: HEART(RED) + '<path d="M24 18v12M18 24h12" stroke="#ffffff" stroke-width="3.4" stroke-linecap="round"/>',
    armor: SHIELD,
    speed: '<path d="M18 8v18l-8 6v8h30v-6c0-5-4-8-12-9V8z" fill="#8fb0e0" stroke="#3f5f8f" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 36h30" stroke="#3f5f8f" stroke-width="2"/><path d="M18 14h10M18 20h10" stroke="#3f5f8f" stroke-width="1.8"/>' +
      '<path d="M2 14h9M1 22h8M3 30h5" stroke="' + GOLD + '" stroke-width="2.4" stroke-linecap="round"/>',
    attract: '<path d="M10 8v15a14 14 0 0 0 28 0V8h-9v15a5 5 0 0 1-10 0V8z" fill="' + RED + '"/><path d="M10 8h9v7h-9zM29 8h9v7h-9z" fill="#dfe6ee"/>' + CRYSTAL(24, 30, 0.5, TEAL, '#c9f5ea') + CRYSTAL(9, 34, 0.4, TEAL, '#c9f5ea') + CRYSTAL(39, 34, 0.4, TEAL, '#c9f5ea'),
    luck: '<circle cx="17" cy="16" r="8" fill="#6fbf7a"/><circle cx="31" cy="16" r="8" fill="#8fd48a"/><circle cx="17" cy="30" r="8" fill="#8fd48a"/><circle cx="31" cy="30" r="8" fill="#6fbf7a"/><path d="M24 23l10 20" stroke="#3d7d43" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="23" r="3" fill="#3d7d43"/>',
    xp: CRYSTAL(22, 8, 1.4, TEAL, '#c9f5ea') + '<path d="M38 22V8M32 14l6-6 6 6" fill="none" stroke="' + GOLD + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
    loot: '<path d="M6 24h36v15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z" fill="#9a7450"/><path d="M6 24v-4a8 8 0 0 1 8-8h20a8 8 0 0 1 8 8v4z" fill="#b08a62"/><path d="M6 24h36M14 12v29M34 12v29" stroke="#4a3620" stroke-width="2"/><rect x="20" y="20" width="8" height="9" rx="2" fill="' + GOLD + '"/>' +
      CRYSTAL(18, 2, 0.450, VIOLET, '#e6dcff') + CRYSTAL(30, 1, 0.550, VIOLET, '#e6dcff'),
    reroll: CARDS + '<path d="M10 41c6 4 18 4 26 0M36 41l-1-4.5M36 41l-4.6 1" fill="none" stroke="#e9fff9" stroke-width="2.2" stroke-linecap="round"/>',
    banish: '<rect x="14" y="7" width="20" height="30" rx="3" fill="#3b4d69" stroke="' + BLUE + '" stroke-width="1.5" transform="rotate(6 24 22)"/><path d="M9 12l30 26M39 12L9 38" stroke="' + RED + '" stroke-width="3.4" stroke-linecap="round"/>',
    wind: '<path d="M24 20C17 8 8 6 2 10c5 1 8 3 9 6-3-1-5 0-7 2 4 0 7 2 9 5zM24 20c7-12 16-14 22-10-5 1-8 3-9 6 3-1 5 0 7 2-4 0-7 2-9 5z" fill="#e9fff9"/><path d="M24 44S12 37 12 27.5a6.5 6.5 0 0 1 12-3.3 6.5 6.5 0 0 1 12 3.3C36 37 24 44 24 44z" fill="' + RED + '"/>' +
      '<path d="M16.5 27a3 3 0 0 1 3-3" fill="none" stroke="#ffffff" stroke-opacity="0.6" stroke-width="2" stroke-linecap="round"/>'
  };

  function workshop(id) {
    return tile(GOLD, WS[id] || WS.power);
  }

  // ---- the cards: a sign 24×24 in the colour of the rarity; @ is a soft fill ----

  const W = {
    spark: '<path d="M12 2l2.5 7 7 3-7 3-2.5 7-2.5-7-7-3 7-3z"@/>',
    blades: '<circle cx="12" cy="12" r="2.5"@/><path d="M12 3a9 9 0 0 1 8 5l-4 1.5a5 5 0 0 0-4-2z"@/><path d="M12 3a9 9 0 0 1 8 5l-4 1.5a5 5 0 0 0-4-2z" transform="rotate(120 12 12)"@/><path d="M12 3a9 9 0 0 1 8 5l-4 1.5a5 5 0 0 0-4-2z" transform="rotate(240 12 12)"@/>',
    needles: '<path d="M12 21V3M12 21L4 6M12 21l8-15"/><path d="M10.5 5.5L12 3l1.5 2.5M3.5 8.5L4 6l2.5 1M20.5 8.5L20 6l-2.5 1"/>',
    mortar: '<path d="M4 20l4-9 5 2-4 9z"@/><path d="M11 8c2-5 7-6 10-2" stroke-dasharray="2 2.5"/><circle cx="20" cy="9" r="2.5"@/><path d="M3 22h10"/>',
    ice: '<path d="M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z"@/><path d="M12 11v6M9.5 12.5l5 3M14.5 12.5l-5 3"/>',
    sickle: '<path d="M6 21l3-8"/><path d="M9 13c-3-6 2-11 11-10-5 1.5-8 4.5-7.5 9.5z"@/>',
    chain: '<path d="M4 5l6 5-3 3 7 3-2 3 7 1"/><circle cx="4" cy="5" r="1.8"@/><circle cx="14" cy="16" r="1.8"@/><circle cx="19.5" cy="20" r="1.8"@/>',
    pulse: '<circle cx="12" cy="12" r="2.5"@/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="9.5" stroke-dasharray="3 3"/>',
    drones: '<rect x="8" y="10" width="8" height="5" rx="2"@/><path d="M8 12H4M16 12h4M2 9h5M17 9h5M4 9v3M20 9v3M10 15l-1 4M14 15l1 4"/><circle cx="12" cy="12.5" r="1"/>',
    beacon: '<path d="M9 21l1.5-10h3L15 21z"@/><path d="M9.5 6h5v5h-5zM7 21h10M11 3h2"/><path d="M3 5l4 2.5M21 5l-4 2.5M2 10h4M22 10h-4"/>',
    seeds: '<circle cx="12" cy="13" r="5.5"@/><path d="M12 3v4M4 7l3 2.5M20 7l-3 2.5M3 21h18"/><circle cx="12" cy="13" r="1.5"/>',
    ball: '<circle cx="12" cy="12" r="5.5"@/><path d="M9 11l2 2-1 1.5 3 1.5M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M5 5l1.8 1.8M17.2 17.2L19 19M5 19l1.8-1.8M17.2 6.8L19 5"/>'
  };

  const P = {
    armor: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"@/><path d="M12 7v10M8 11h8"/>',
    core: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"@/><circle cx="12" cy="11.5" r="2"/>',
    accel: '<circle cx="12" cy="13" r="8"@/><path d="M12 9v4l3 2M9.5 2h5M19 5l1.5 1.5"/>',
    lens: '<circle cx="10.5" cy="10.5" r="6.5"@/><path d="M15.5 15.5L21 21M7.5 9a3.5 3.5 0 0 1 3-2.5"/>',
    magnet: '<path d="M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4z"@/><path d="M6 8h4M14 8h4M9 21v1M15 21v1"/>',
    soles: '<path d="M8 3v10l-4 3v4h16v-3c0-2.5-2-4-6-4.5V3z"@/><path d="M4 17h16M8 7h6M8 10h6"/>',
    multi: '<circle cx="6" cy="16" r="2.5"@/><circle cx="12" cy="16" r="2.5"@/><circle cx="18" cy="16" r="2.5"@/><path d="M12 3v7M8.5 6.5h7"/>',
    regen: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"@/><path d="M12 9v5M9.5 11.5h5"/>',
    coin: '<circle cx="12" cy="12" r="8.5"@/><circle cx="12" cy="12" r="5"/><path d="M12 9.5v5"/>',
    sharp: '<path d="M4 20L16 8l3-5 2 2-5 3L4 20z"@/><path d="M4 20l3-1M5 6v3M3.5 7.5h3M19 15v4M17 17h4"/>',
    fuse: '<circle cx="9" cy="15" r="6"@/><path d="M13 10l2-2c1-3 4-1 3 1"/><path d="M19 3v2.5M21.5 6H19M21 3.5L19.5 5"/>',
    pupil: '<path d="M3 5h7a2 2 0 0 1 2 2 2 2 0 0 1 2-2h7v13h-7a2 2 0 0 0-2 2 2 2 0 0 0-2-2H3z"@/><path d="M12 7v13M6 9h3M6 12h3M15 9h3M15 12h3"/>',
    thorns: '<path d="M12 5l6 2.5v4.5c0 3.5-2.5 6-6 7-3.5-1-6-3.5-6-7V7.5z"@/><path d="M12 5V2M18 7.5l2.5-2M6 7.5l-2.5-2M18 13l3 1M6 13l-3 1M15 19l1.5 2.5M9 19l-1.5 2.5"/>',
    scope: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1.5"@/>'
  };

  const OTHER = {
    x: '<rect x="5" y="3" width="14" height="18" rx="2.5"@/><path d="M12 8l1.2 2.8 3 .300-2.3 2 .700 3-2.6-1.6-2.6 1.6.700-3-2.3-2 3-.300z"/>',
    f: '<circle cx="9" cy="12" r="6"@/><circle cx="15" cy="12" r="6"@/><path d="M12 3v2M12 19v2"/>',
    gold: '<ellipse cx="12" cy="7" rx="7" ry="3"@/><path d="M5 7v5c0 1.7 3 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3 3 7 3s7-1.3 7-3v-5"/>',
    heal: '<rect x="3" y="7" width="18" height="13" rx="2.5"@/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M12 10.5v6M9 13.5h6"/>'
  };

  function card(kind, id, r) {
    const color = kind === 'gold' ? GOLD : kind === 'heal' ? RED : kind === 'f' ? GOLD : RARITY[r] || RARITY[0];
    const src = kind === 'w' ? W[id] || W.spark : kind === 'p' ? P[id] || P.coin : OTHER[kind] || OTHER.x;
    const inner = src.replace(/@/g, ' fill="' + color + '" fill-opacity="0.3"');
    return tile(color, '<g transform="translate(7 7) scale(1.42)" fill="none" stroke="' + color + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + inner + '</g>');
  }

  function unknown() {
    return tile('#6a727c', '<circle cx="24" cy="24" r="10" fill="none" stroke="#6a727c" stroke-width="3" stroke-dasharray="4 5" stroke-linecap="round"/><circle cx="24" cy="24" r="2.5" fill="#6a727c"/>');
  }

  function el(markup, size, cls) {
    const span = document.createElement('span');
    span.className = 'ws-art' + (cls ? ' ' + cls : '');
    if (size) {
      span.style.width = size + 'px';
      span.style.height = size + 'px';
    }
    span.innerHTML = markup;
    return span;
  }

  window.WaveArt = { hero, mode, storm, workshop, card, unknown, el };
})();
