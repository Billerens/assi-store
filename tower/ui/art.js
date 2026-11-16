/* Башня: drawn pictures. One 48×48 box, one palette, light outline, flat fills, no text.
   window.TowerArt.el(kind, id) gives a <span class="tw-pic"> with the picture inside. */
(function () {
  'use strict';
  var INK = '#dfe7e1';
  var FILL = { s: '#2b3531', m: '#5b6c64', t: '#8da69c', g: '#d9b25f', r: '#d9785c', b: '#8fb0d6', v: '#a892d6', w: '#ece5d2', k: '#141a18', o: '#94714d' };
  function paint(body) {
    return body
      .replace(/@([smtgrbvwko])/g, function (all, key) { return ' fill="' + FILL[key] + '"'; })
      .replace(/\$([smtgrbvwko])/g, function (all, key) { return ' stroke="' + FILL[key] + '"'; })
      .replace(/!n/g, ' stroke="none"')
      .replace(/!(\d)/g, ' stroke-width="$1"');
  }
  function wrap(body) {
    return '<svg viewBox="0 0 48 48" fill="none" stroke="' + INK + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paint(body) + '</svg>';
  }

  var HEART = 'M24 41C10 31 6 23 6 17a9 9 0 0 1 18-4 9 9 0 0 1 18 4c0 6-4 14-18 24z';
  var SHIELD = 'M24 5l15 5v12c0 10-6 17-15 21-9-4-15-11-15-21V10z';
  var HELM = 'M10 42V24C10 13 16 6 24 6s14 7 14 18v18h-9V29H19v13z';
  var FLAME = 'M24 4c2 9 12 13 12 25a12 12 0 0 1-24 0c0-6 3-9 5-13 1 4 3 5 4 6 0-7 1-12 3-18z';
  var SWORD = '<path@w d="M41 7l-4 12-17 17-6-6 17-17z"/><path$g!4 d="M10 27l11 11"/><path$o!4 d="M13 35l-6 6"/>';
  var CROWN = '<path@g d="M7 37L4 13l10 10L24 7l10 16 10-10-3 24z"/><path d="M7 31h34"/>';
  var PURSE = '<path@o d="M14 17h20c5 6 8 12 8 17 0 5-4 8-18 8S6 39 6 34c0-5 3-11 8-17z"/><path@o d="M15 17c2-4 3-7 2-11h14c-1 4 0 7 2 11z"/><path d="M14 17h20"/>';
  var BELL = 'M24 9c-8 0-12 6-12 14v7l-5 7h34l-5-7v-7c0-8-4-14-12-14z';
  var ANVIL = '<path@m d="M8 23h26c0 4-3 6-7 7v6h6v5H13v-5h6v-6c-6-1-10-3-11-7z"/><path@m d="M34 23h9c0 3-3 5-9 5z"/>';
  var CHEST = '<path@g d="M7 22a9 9 0 0 1 9-9h16a9 9 0 0 1 9 9v3H7z"/><path@o d="M7 25h34v16H7z"/><path@w d="M21 21h6v9h-6z"/><path d="M14 13v28M34 13v28"/>';
  var LOCK = '<path@m d="M14 22h20v18H14z"/><path d="M18 22v-6a6 6 0 0 1 12 0v6"/><circle@k cx="24" cy="30" r="2.5"/><path d="M24 32v3"/>';

  var ART = {
    res: {
      shard: '<path@b d="M24 4l12 14-12 26-12-26z"/><path d="M12 18h24M24 4l-4 14 4 26 4-26z"/>',
      gold: '<circle@g cx="24" cy="24" r="17"/><circle cx="24" cy="24" r="11"/><path d="M20 30v-9l4-3 4 3v9z"/>',
      hp: '<path@r d="' + HEART + '"/>',
      strength: SWORD,
      defense: '<path@t d="' + SHIELD + '"/><path d="M24 12v24"/>',
      will: '<path@v d="M24 4l5 15 15 5-15 5-5 15-5-15-15-5 15-5z"/>',
      xp: '<path@g d="M24 5l6 13 14 2-10 9 3 14-13-7-13 7 3-14L4 20l14-2z"/>',
      level: '<path@g d="M24 6l16 16H30v20H18V22H8z"/>',
      heal: '<path@w d="M6 30L30 6l12 12-24 24z"/><path d="M14 22l12 12M22 14l12 12"/><path$r!3 d="M24 20v8M20 24h8"/>',
      coins: '<path@g d="M8 30h22v10H8z"/><path@g d="M8 30a11 4 0 0 1 22 0 11 4 0 0 1-22 0z"/><path d="M8 35c2 3 20 3 22 0"/><circle@g cx="33" cy="16" r="10"/><circle cx="33" cy="16" r="5"/>',
      lock: LOCK,
      check: '<circle@t cx="24" cy="24" r="19"/><path$k!4 d="M14 25l7 7 13-15"/>',
      sign: '<path$o!4 d="M24 44V8"/><path@o d="M10 10h24l8 6-8 6H10z"/><path@m d="M38 26H14l-8 6 8 6h24z"/>',
      leave: '<path@m d="M10 42V8h20v34z"/><path@k d="M14 12h12v30H14z"/><path$g!3 d="M24 27h18M36 21l6 6-6 6"/>',
      daily: '<path@w d="M7 10h34v32H7z"/><path@r d="M7 10h34v9H7z"/><path d="M15 6v8M33 6v8"/><path@g!n d="M24 23l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6-4.5-4 6-1z"/>',
      up: '<path@m d="M6 42V32h10V22h10V12h10V4h6v38z"/><path$g!3 d="M8 20l12-12M12 8h8v8"/>',
      record: '<path$o!3 d="M12 44V6"/><path@r d="M12 7h26l-7 8 7 8H12z"/>'
    },
    moves: {
      strike: SWORD,
      block: '<path@t d="' + SHIELD + '"/><path d="M24 12v24"/>',
      lunge: '<path$o!4 d="M6 42l22-22"/><path@w d="M24 13L43 5l-8 19z"/><path$t d="M8 20h9M28 40v-9"/>',
      reflect: '<path@b d="M19 8l13 4v10c0 9-5 15-13 19C11 37 6 31 6 22V12z"/><path$g!3 d="M45 30L31 21 43 9"/><path$g!3 d="M36 8l8 0v8"/>',
      sweep: '<path@w d="M3 22c6 18 26 22 38 8l5 4V18H31l5 5c-9 9-22 8-33-1z"/><path$t!3 d="M6 42h10M22 42h6M34 42h8"/>',
      dash: '<path@m d="M20 6h11v19l11 6v9H20z"/><path d="M20 33h22"/><path$g!3 d="M4 14h10M2 24h12M6 34h8"/>',
      read: '<path@w d="M3 24c6-10 14-15 21-15s15 5 21 15c-6 10-14 15-21 15S9 34 3 24z"/><circle@b cx="24" cy="24" r="8"/><circle@k cx="24" cy="24" r="3"/>',
      flame: '<path@r d="' + FLAME + '"/><path@g d="M24 25c3 4 6 7 6 10a6 6 0 0 1-12 0c0-3 3-6 6-10z"/>',
      breathe: '<path$t!4 d="M5 17h22a6 6 0 1 0-6-6"/><path$w!4 d="M5 27h31a6 6 0 1 1-6 6"/><path$t!4 d="M5 37h13"/>',
      execute: '<path$o!4 d="M12 44L31 12"/><path@w d="M29 4c9 0 15 6 15 15-6-3-11-2-15 1l-6-10c2-3 3-4 6-6z"/>'
    },
    doors: {
      combat: '<path$w!5 d="M9 7l23 23M39 7L16 30"/><path$g!4 d="M25 37l12-12M23 37L11 25"/><path$o!4 d="M35 35l6 6M13 35l-6 6"/>',
      event: '<path@w d="M5 11c6-3 13-3 19 1v28c-6-4-13-4-19-1z"/><path@w d="M43 11c-6-3-13-3-19 1v28c6-4 13-4 19-1z"/><path@v!n d="M33 16l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path$m d="M10 19h9M10 26h9M10 33h9"/>',
      chest: CHEST,
      elite: '<path@w d="M24 5C14 5 8 12 8 21c0 5 2 8 6 10v9h20v-9c4-2 6-5 6-10 0-9-6-16-16-16z"/><circle@k cx="17" cy="22" r="4.5"/><circle@k cx="31" cy="22" r="4.5"/><path d="M20 40v-5M24 40v-5M28 40v-5"/><path@k d="M24 27l-2 4h4z"/>',
      boss: '<path@r d="M11 42V25c0-8 5-13 13-13s13 5 13 13v17z"/><path@w d="M12 22C5 20 3 12 5 5c3 6 7 9 12 10zM36 22c7-2 9-10 7-17-3 6-7 9-12 10z"/><path@k d="M16 27h6v5h-6zM26 27h6v5h-6z"/><path d="M20 42v-4M24 42v-4M28 42v-4"/>',
      shop: '<path@r d="M5 19L9 7h30l4 12z"/><path@w d="M5 19a4.75 4.75 0 0 0 9.5 0 4.75 4.75 0 0 0 9.5 0 4.75 4.75 0 0 0 9.5 0 4.75 4.75 0 0 0 9.5 0z"/><path@o d="M9 26h30v16H9z"/><circle@g cx="24" cy="34" r="4.5"/>',
      rest: '<path@r d="M24 3c1 7 10 11 10 20a10 10 0 0 1-20 0c0-5 3-8 4-11 1 3 2 4 4 5 0-6 0-9 2-14z"/><path@g d="M24 19c2 3 4 5 4 8a4 4 0 0 1-8 0c0-3 2-5 4-8z"/><path$o!5 d="M7 43l34-9M7 34l34 9"/>'
    },
    classes: {
      guardian: '<path@t d="' + HELM + '"/><path d="M24 6v23M10 25h28"/>',
      archer: '<path$o!4 d="M13 5c20 7 20 31 0 38"/><path d="M13 5v38"/><path$w!3 d="M5 24h34"/><path@w d="M35 17l9 7-9 7z"/>',
      scholar: '<path@b d="M10 5h26a2 2 0 0 1 2 2v36H13a5 5 0 0 1-5-5V7z"/><path@w d="M8 38a5 5 0 0 1 5-5h25v10H13a5 5 0 0 1-5-5z"/><path@g d="M25 5h8v15l-4-3-4 3z"/>',
      firestarter: '<path@o d="M19 25h10l-2 19h-6z"/><path@r d="M24 2c1 6 9 9 9 16 0 5-4 8-9 8s-9-3-9-8c0-4 2-6 4-8 0 2 1 3 3 4 0-5 0-8 2-12z"/><path@g d="M24 15c2 2 3 4 3 6a3 3 0 0 1-6 0c0-2 1-4 3-6z"/>',
      nameless: '<path@w d="M9 9c10-4 20-4 30 0v13c0 10-6 17-15 21C15 39 9 32 9 22z"/><path@k d="M14 20h8v3h-8zM26 20h8v3h-8z"/>'
    },
    workshop: {
      health: '<path@r d="' + HEART + '"/><path@m d="M6 15h36l-1 9H7z"/><circle@k!n cx="13" cy="19.5" r="1.5"/><circle@k!n cx="24" cy="19.5" r="1.5"/><circle@k!n cx="35" cy="19.5" r="1.5"/>',
      strength: '<path@m d="M11 20a4.5 4.5 0 0 1 9 0 4.5 4.5 0 0 1 9 0 4.5 4.5 0 0 1 9 0v3h1a4.5 4.5 0 0 1 0 9h-1v2c0 5-4 9-9 9h-9c-5 0-9-4-9-9z"/><path d="M20 20v7M29 20v7M11 30h22"/><path$g!3 d="M16 8v-4M24 7V2M32 8v-4"/>',
      defense: '<path@b d="M9 5h30v19c0 9-6 15-15 19-9-4-15-10-15-19z"/><path d="M24 5v38M9 20h30"/><circle@g cx="24" cy="20" r="4"/>',
      agility: '<circle@k cx="24" cy="24" r="19"/><path@r d="M24 8l6 16H18z"/><path@w d="M24 40l6-16H18z"/><circle@g cx="24" cy="24" r="2.5"/>',
      will: '<path@k d="M19 5h10v11l10 19a5 5 0 0 1-5 8H14a5 5 0 0 1-5-8l10-19z"/><path@v d="M13.5 29h21l4.5 7a4.5 4.5 0 0 1-4.5 7h-21a4.5 4.5 0 0 1-4.5-7z"/><path d="M16 5h16"/><circle@w!n cx="21" cy="36" r="2"/><circle@w!n cx="28" cy="33" r="1.5"/>',
      gold: PURSE + '<circle@g cx="24" cy="30" r="6"/><path d="M24 27v6"/>',
      doors: '<path@o d="M11 43V19a13 13 0 0 1 26 0v24z"/><path d="M24 6v37M6 43h36"/><circle@g cx="19" cy="28" r="2"/><circle@g cx="29" cy="28" r="2"/>',
      memory: '<path@k d="M16 5h16v7l7 8v19a4 4 0 0 1-4 4H13a4 4 0 0 1-4-4V20l7-8z"/><path@b d="M24 18l8 9-8 13-8-13z"/><path d="M16 27h16M13 5h22"/>'
    },
    heights: {
      none: '<path@m d="M13 43V17l-3-3V6h6v4h5V6h6v4h5V6h6v8l-3 3v26z"/><path@k d="M19 43V32a5 5 0 0 1 10 0v11z"/><path d="M6 43h36"/>',
      shield: '<path@m d="' + SHIELD + '"/><circle@w!n cx="24" cy="12" r="2"/><circle@w!n cx="16" cy="17" r="2"/><circle@w!n cx="32" cy="17" r="2"/><circle@w!n cx="18" cy="29" r="2"/><circle@w!n cx="30" cy="29" r="2"/><circle@w!n cx="24" cy="36" r="2"/>',
      costly: '<path@g d="M5 24L24 5h18v18L23 42z"/><circle@k cx="34" cy="13" r="3.5"/><path$k!3 d="M15 26l8 8M20 21l8 8"/>',
      quiet: '<path@w d="M27 5a19 19 0 1 0 16 30A17 17 0 0 1 27 5z"/><path@b!n d="M37 7l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path$b!3 d="M30 26l3 3-3 3"/>',
      secondPhase: '<path@r d="M17 6l13 18-13 18L4 24z"/><path@g d="M31 6l13 18-13 18-13-18z"/><path d="M24 15v18"/>',
      fierce: '<path@r d="M11 4c5 12 5 26-2 40 10-12 12-26 8-40zM23 4c5 12 5 26-2 40 10-12 12-26 8-40zM35 4c5 12 5 26-2 40 10-12 12-26 8-40z"/>',
      plated: '<path@m d="M5 9h38v30H5z"/><path d="M5 19h38M5 29h38M18 9v10M31 9v10M11 19v10M24 19v10M37 19v10M18 29v10M31 29v10"/>',
      scarcity: '<circle@m cx="24" cy="24" r="18"/><path$k!3 d="M22 6l5 11-7 6 7 9-4 10"/>',
      vigilance: '<path$o!4 d="M15 45V8"/><path@w d="M15 9c11 0 18 4 20 13-7-3-13-2-20 2z"/><path@w d="M15 2l-5 9h10z"/><path@r d="M15 28h14l-4 5 4 5H15z"/>',
      exhaustion: '<path@w d="M16 27h16v15H16z"/><path d="M24 27v-6"/><path@g d="M24 9c3 4 5 7 5 9a5 5 0 0 1-10 0c0-2 2-5 5-9z"/><path d="M10 42h28"/><path$m d="M16 32c3 2 5-1 7 2"/>',
      curse: '<path$b!3 d="M24 4v40M6.5 14l35 20M41.5 14l-35 20M24 12l-6-5M24 12l6-5M24 36l-6 5M24 36l6 5M13 18l-7 1M13 18l-2-7M35 30l7-1M35 30l2 7M35 18l7 1M35 18l2-7M13 30l-7-1M13 30l-2 7"/>',
      pinnacle: '<path@m d="M24 15l11 18v10H13V33z"/><path d="M24 15V3"/><path@r d="M24 3l11 4-11 4z"/><path@k d="M21 43v-7a3 3 0 0 1 6 0v7z"/><path@g!n d="M8 10l1.5 3.5L13 15l-3.5 1.5L8 20l-1.5-3.5L3 15l3.5-1.5zM41 20l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z"/>'
    },
    relics: {
      buckle: '<path@g d="M7 12h34v24H7z"/><path@k d="M14 18h20v12H14z"/><path$w!3 d="M24 24h16"/><path$o!5 d="M2 24h5M41 24h5"/>',
      whetstone: '<path@m d="M5 30l11-11h27L32 30z"/><path@s d="M5 30h27v9H5z"/><path@s d="M32 30l11-11v9L32 39z"/><path$g!3 d="M20 5v8M13 8l4 6M27 8l-4 6"/>',
      horseshoe: '<path@m d="M10 43V22a14 14 0 0 1 28 0v21h-9V22a5 5 0 0 0-10 0v21z"/><circle@k!n cx="14.5" cy="24" r="1.5"/><circle@k!n cx="14.5" cy="34" r="1.5"/><circle@k!n cx="33.5" cy="24" r="1.5"/><circle@k!n cx="33.5" cy="34" r="1.5"/><circle@k!n cx="24" cy="12" r="1.5"/>',
      purse: '<path@o d="M12 13h20c5 5 8 10 8 15 0 5-4 8-18 8S4 33 4 28c0-5 3-10 8-15z"/><path@o d="M13 13c2-3 3-5 2-9h14c-1 4 0 6 2 9z"/><path d="M12 13h20"/><path@k d="M24 31l5 5h-9z"/><circle@g cx="33" cy="42" r="3.5"/><circle@g cx="41" cy="36" r="2.5"/>',
      lamp: '<path d="M18 13c0-9 12-9 12 0"/><path@m d="M17 13h14l3 6H14z"/><path@g d="M14 19h20v17H14z"/><path@m d="M12 36h24v6H12z"/><path@r!n d="M24 22c2 3 4 5 4 7a4 4 0 0 1-8 0c0-2 2-4 4-7z"/>',
      rations: '<path@o d="M5 29c0-10 8-17 19-17s19 7 19 17v9H5z"/><path$w!3 d="M14 16l3 9M24 13v10M34 16l-3 9"/>',
      feather: '<path@s d="M41 5C22 5 11 15 9 32l-5 12 7-7c17-2 28-13 30-32z"/><path d="M11 37l22-24M18 31h9M23 25h9M17 22v9"/>',
      abacus: '<path@k d="M5 7h38v34H5z"/><path d="M5 18h38M5 30h38"/><circle@g cx="13" cy="18" r="4"/><circle@g cx="22" cy="18" r="4"/><circle@r cx="36" cy="18" r="4"/><circle@r cx="12" cy="30" r="4"/><circle@g cx="28" cy="30" r="4"/><circle@g cx="37" cy="30" r="4"/>',
      knot: '<path$g!4 d="M3 34c9 0 13-3 17-9 4-7 13-10 17-5 4 5-1 12-8 11-9-1-11-11-5-20"/><path$g!4 d="M31 31c4 4 8 6 14 6"/>',
      bell: '<path@g d="' + BELL + '"/><path d="M24 4v5M12 30h24"/><circle@w cx="24" cy="41" r="3"/>',
      eye: '<circle@w cx="24" cy="24" r="18"/><circle@b cx="24" cy="24" r="9"/><circle@k cx="24" cy="24" r="4"/><circle@w!n cx="20" cy="20" r="2"/>',
      bow: '<path$o!4 d="M30 4C8 12 8 36 30 44"/><path$w d="M30 4v40M30 4c8 12 8 28 0 40"/><path@g d="M28 22h4v4h-4z"/>',
      warmStone: '<path@r d="M6 35c0-8 7-12 18-12s18 4 18 12-7 8-18 8S6 43 6 35z"/><path$g!3 d="M15 17c-3-4 3-7 0-12M24 17c-3-4 3-7 0-12M33 17c-3-4 3-7 0-12"/>',
      mirror: '<circle@b cx="24" cy="24" r="19"/><circle@w cx="24" cy="24" r="12"/><path$b!3 d="M18 26l8-8M22 30l8-8"/>',
      map: '<path@w d="M5 10l13-5 12 5 13-5v33l-13 5-12-5-13 5z"/><path$m d="M18 5v33M30 10v33"/><path$r!3 stroke-dasharray="1 5" d="M10 31l6-8 8 4 6-11 8-3"/>',
      snake: '<path$t!6 d="M10 41c18 2 28-2 26-9-2-7-22-3-24-10-2-6 5-10 14-10"/><path@t d="M24 7l10-3 8 6-8 6-10-3z"/><circle@k!n cx="34" cy="9" r="1.5"/><path$r d="M42 10h4"/>',
      chain: '<path$m!4 d="M9 17h6a7 7 0 0 1 0 14H9a7 7 0 0 1 0-14zM33 17h6a7 7 0 0 1 0 14h-6a7 7 0 0 1 0-14z"/><path$w!4 d="M17 24h14"/><path$w!4 d="M21 17h6a7 7 0 0 1 0 14h-6"/>',
      key: '<circle@r cx="14" cy="14" r="9"/><circle@k cx="14" cy="14" r="3.5"/><path$r!5 d="M21 21l20 20"/><path$r!4 d="M33 33l6-6M27 27l5-5"/>',
      hourglass: '<path@k d="M12 6h24v7c0 6-6 8-8 11 2 3 8 5 8 11v7H12v-7c0-6 6-8 8-11-2-3-8-5-8-11z"/><path@g!n d="M16 14h16c-1 4-6 6-8 9-2-3-7-5-8-9zM15 40c1-5 5-6 9-8 4 2 8 3 9 8z"/><path!3 d="M8 6h32M8 42h32"/>',
      bloodCoin: '<circle@r cx="24" cy="24" r="18"/><path@w d="M24 11c4 6 8 10 8 15a8 8 0 0 1-16 0c0-5 4-9 8-15z"/>',
      deck: '<path@m d="M5 17l12-4 9 26-12 4z"/><path@b d="M31 13l12 4-9 26-12-4z"/><path@w d="M16 7h16v30H16z"/><path@r d="M24 14l5 8-5 8-5-8z"/>',
      shadow: '<circle@s cx="31" cy="13" r="7"/><path@s d="M20 43c0-13 4-19 11-19s11 6 11 19z"/><circle@w cx="17" cy="17" r="7"/><path@w d="M6 43c0-12 4-17 11-17s11 5 11 17z"/>',
      crown: CROWN + '<circle@k cx="24" cy="22" r="4"/>',
      heart: '<path@r d="' + HEART + '"/><circle@k cx="24" cy="19" r="4"/><path@k d="M22 21h4l2 10h-8z"/>',
      emptyLantern: '<path d="M24 3v6"/><path@m d="M16 9h16l4 7H12z"/><path@k d="M13 16h22v20H13z"/><path d="M24 16v20"/><path@m d="M11 36h26v6H11z"/>',
      vow: '<path@w d="M20 3h8v27l-4 7-4-7z"/><path$g!4 d="M13 31h22"/><path@o d="M21 33h6v11h-6z"/><path$r!3 d="M17 10l14 8M17 20l14-8"/>',
      vane: '<path$m!3 d="M24 45V15"/><path@g d="M5 13h25V7l13 9-13 9v-6H5z"/><path d="M17 33h14M24 7V3"/>',
      smallChange: '<path@o d="M18 13c-7 5-10 11-10 17 0 6 5 9 16 9s16-3 16-9c0-6-3-12-10-17z"/><path@o d="M18 13l-3-8h18l-3 8z"/><circle@g cx="9" cy="40" r="4.5"/><circle@g cx="39" cy="40" r="4.5"/><circle@g cx="24" cy="28" r="5"/>'
    },
    enemies: {
      piper: '<path@m d="M24 3l13 17-4 25H15l-4-25z"/><path@k d="M17 18c2-5 12-5 14 0l-2 7H19z"/><circle@g!n cx="21" cy="19" r="1.5"/><circle@g!n cx="27" cy="19" r="1.5"/><path$g!3 d="M21 29l20 8"/><circle@k!n cx="29" cy="32" r="1"/><circle@k!n cx="35" cy="34.5" r="1"/>',
      mold: '<path@t d="M7 42c-5-10-1-19 6-21 0-9 7-13 13-10 7-4 15 2 13 10 7 4 7 14 2 21z"/><circle@k cx="18" cy="29" r="3.5"/><circle@k cx="30" cy="29" r="3.5"/><path d="M19 37c3 2 7 2 10 0"/><circle@w!n cx="13" cy="26" r="1.5"/><circle@w!n cx="24" cy="17" r="2"/><circle@w!n cx="36" cy="33" r="1.5"/><circle@w!n cx="33" cy="20" r="1.5"/>',
      lantern: '<path@m d="M10 14c0-6 4-10 9-10s9 4 9 10v3H10z"/><path@w d="M12 17h14v6H12z"/><path@m d="M6 45c0-14 4-22 13-22s13 8 13 22z"/><path d="M29 29l9-5v5"/><path@g d="M32 29h12v12H32z"/><path d="M38 29v12"/>',
      dog: '<path@o d="M9 8l9 9h12l9-9 2 18-9 16H17L7 26z"/><circle@k cx="18" cy="24" r="2.5"/><circle@k cx="30" cy="24" r="2.5"/><path@k d="M20 32h8l-4 5z"/><path@w d="M15 36l3 6M33 36l-3 6"/><path$m!3 stroke-dasharray="4 4" d="M4 45h40"/>',
      weaver: '<circle@v cx="24" cy="29" r="10"/><circle@v cx="24" cy="15" r="6"/><path d="M15 24L5 17M14 30H3M16 36l-9 8M33 24l10-7M34 30h11M32 36l9 8"/><circle@k!n cx="22" cy="14" r="1.5"/><circle@k!n cx="26" cy="14" r="1.5"/><path$w d="M24 3v6"/>',
      double: '<path@w d="M24 5C15 5 9 12 9 22s6 20 15 22z"/><path@s d="M24 5c9 0 15 7 15 17s-6 20-15 22z"/><circle@k cx="17" cy="22" r="3"/><circle@w cx="31" cy="22" r="3"/><path d="M17 33h14"/>',
      pupil: '<path@m d="M14 4h20v13H14z"/><path@m d="M6 17h36v19H6z"/><path@m d="M11 36h10v9H11zM27 36h10v9H27z"/><path@g!n d="M18 9h4v4h-4zM26 9h4v4h-4z"/><path$k d="M13 23l6 7M35 21l-6 5M24 28v8"/>',
      thief: '<path@s d="M24 3C13 3 7 11 7 22v23h34V22C41 11 35 3 24 3z"/><path@w d="M13 17h22v9H13z"/><circle@k cx="19" cy="21.5" r="2"/><circle@k cx="29" cy="21.5" r="2"/><circle@g cx="37" cy="39" r="6"/><path d="M37 36v6"/>',
      knight: '<path@m d="M11 44V23c0-8 5-13 13-13s13 5 13 13v21z"/><path@k d="M15 24h18v5H15z"/><path d="M24 29v15M24 10V5"/><path@g d="M11 5h17V2l9 4-9 4V7H11z"/>',
      maiden: '<circle@w cx="23" cy="12" r="7"/><path@b d="M23 19c9 4 13 14 15 26H8c2-12 6-22 15-26z"/><path$b!3 d="M30 8c6-5 14-3 14 3M33 15c5-1 10 2 10 6M5 28c4-3 8 2 3 5"/><path d="M17 32c4 3 8 3 12 0"/>',
      clockmaker: '<circle@w cx="24" cy="16" r="12"/><path$k!3 d="M24 8v8l6 3"/><path@m d="M10 45c0-10 5-16 14-16s14 6 14 16z"/><path$g!3 d="M24 34v7"/><circle@g cx="24" cy="42" r="2"/>',
      echo: '<path@k$b d="' + HELM + '"/><path$b d="M24 6v23M10 25h28"/><path$b!3 d="M4 12c-3 7-3 17 0 24M44 12c3 7 3 17 0 24"/>',
      gatekeeper: '<path@w d="M9 14L5 3l10 6zM39 14l4-11-10 6z"/><path@m d="M7 45V20c0-9 7-14 17-14s17 5 17 14v25z"/><path@k d="M13 17h22v6H13z"/><circle@r!n cx="19" cy="20" r="1.5"/><circle@r!n cx="29" cy="20" r="1.5"/><path@t d="M11 28h8v12h-8zM20 28h8v12h-8zM29 28h8v12h-8z"/>',
      mistress: '<path@g d="M12 15L9 3l8 6 7-7 7 7 8-6-3 12z"/><path@w d="M12 15h12v30c-7-4-12-11-12-20z"/><path@r d="M24 15h12v10c0 9-5 16-12 20z"/><circle@k cx="18" cy="25" r="2.5"/><circle@k cx="30" cy="25" r="2.5"/><path d="M19 34c3 2 7 2 10 0"/>',
      keykeeper: '<path@v d="M24 3C14 3 10 11 10 21L5 45h38l-5-24c0-10-4-18-14-18z"/><path@k d="M16 16c2-5 14-5 16 0v8H16z"/><circle@g!n cx="20" cy="18" r="1.5"/><circle@g!n cx="28" cy="18" r="1.5"/><circle@g cx="24" cy="32" r="4"/><path$g!3 d="M24 36v8M24 41h4"/>'
    },
    events: {
      well: '<path@o d="M5 15L24 5l19 10z"/><path$o!3 d="M11 15v13M37 15v13"/><path d="M24 15v8"/><path@g d="M21 23h6v5h-6z"/><path@m d="M7 28h34v15H7z"/><path d="M7 35h34M18 28v7M30 28v7M24 35v8M12 35v8M36 35v8"/>',
      guard: '<path@m d="' + HELM + '"/><path d="M24 6v23"/><path$w!5 d="M9 15l30 11"/><path$r!3 d="M22 18l4 5"/>',
      voice: '<path@m d="M5 6h15v36H5z"/><path d="M5 18h15M5 30h15M13 6v12M9 18v12M13 30v12"/><path$v!3 d="M26 18c3 4 3 8 0 12M32 13c6 7 6 15 0 22M38 8c8 10 8 22 0 32"/>',
      stairs: '<path@m d="M5 43V34h9v-8h9v-8h9v-8h11v33z"/><path$k d="M14 34v9M23 26v17M32 18v25"/><path$g!3 d="M6 22l12-12M10 10h8v8"/>',
      shelf: '<path@k d="M5 5h38v38H5z"/><path!3 d="M5 24h38"/><path@r d="M9 9h6v15H9z"/><path@b d="M15 12h5v12h-5z"/><path@g d="M20 8h7v16h-7z"/><path@t d="M30 11l6-2 4 14-6 2z"/><path@t d="M9 29h7v14H9z"/><path@v d="M16 32h6v11h-6z"/><path@o d="M27 35h13v8H27z"/><circle@g cx="33.5" cy="35" r="3"/>',
      pantry: '<path d="M13 23c0-18 22-18 22 0"/><path@g d="M14 23c0-7 20-7 20 0z"/><path@o d="M7 23h34l-4 20H11z"/><path$k d="M10 31h28M17 23l2 20M31 23l-2 20M24 23v20"/>',
      forge: ANVIL + '<path$o!4 d="M32 5L19 18"/><path@w d="M27 1l9 9-5 5-9-9z"/><path$g!3 d="M8 12l3 4M14 7l1 5"/>',
      mirror: '<ellipse@b cx="24" cy="20" rx="14" ry="17"/><path$w!3 d="M20 4l6 11-7 6 8 14"/><path@o d="M20 37h8v5h-8z"/><path!3 d="M13 44h22"/>',
      fountain: '<path@m d="M5 28h38c0 6-6 10-15 10v4h7v3H13v-3h7v-4C11 38 5 34 5 28z"/><path$b!3 d="M24 28V9M24 9c-6 0-11 4-11 11M24 9c6 0 11 4 11 11"/><circle@b cx="24" cy="6" r="2.5"/>',
      toll: '<path@o d="M9 19h9l3 20H6z"/><path@o d="M30 19h9l3 20H27z"/><path!3 d="M3 41h42"/><circle@g cx="24" cy="10" r="5"/><path d="M24 8v4"/>',
      nest: '<circle@w cx="18" cy="23" r="6"/><circle@w cx="30" cy="22" r="6"/><path@o d="M4 26h40c0 11-9 17-20 17S4 37 4 26z"/><path$k d="M10 31l8 4M21 29l10 8M31 31l8-2M14 39l7-3"/><path$g!3 stroke-dasharray="2 4" d="M40 28v15"/>',
      cairn: '<ellipse@m cx="24" cy="39" rx="17" ry="6"/><ellipse@t cx="24" cy="28" rx="12" ry="5.5"/><ellipse@m cx="24" cy="18" rx="8" ry="4.5"/><ellipse@w cx="24" cy="9" rx="5" ry="3.5"/>',
      hour: '<circle@w cx="24" cy="14" r="11"/><path$k!3 d="M24 7v7h5"/><path!3 d="M24 25v10"/><circle@g cx="24" cy="39" r="5.5"/><path$m d="M12 39h4M32 39h4"/>',
      trader: '<path@o d="M6 18l18-9 18 9v17l-18 9-18-9z"/><path d="M6 18l18 9 18-9M24 27v17"/><path$r!4 d="M15 13.5l18 9"/><path@g!n d="M38 2l1.5 3.5L43 7l-3.5 1.5L38 12l-1.5-3.5L33 7l3.5-1.5z"/>',
      bellEvent: '<path$o!5 d="M5 6h38"/><path!3 d="M24 6v6"/><path@o d="M24 12c-8 0-12 6-12 14v6l-5 8h34l-5-8v-6c0-8-4-14-12-14z"/><path d="M12 32h24"/><path$k!3 d="M19 21v5M23 20v6M27 21v5"/>',
      any0: '<path@w d="M17 20h14v22H17z"/><path d="M24 20v-5"/><path@g d="M24 3c3 4 5 7 5 9a5 5 0 0 1-10 0c0-2 2-5 5-9z"/><path!3 d="M10 43h28"/><path$m d="M17 27c3 2 5-1 7 2"/>',
      any1: '<path@m d="M7 43V21a17 17 0 0 1 34 0v22z"/><path@k d="M14 43V23a10 10 0 0 1 20 0v20z"/><path@g!n d="M24 25l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path!3 d="M3 43h42"/>',
      any2: '<path@w d="M10 8h24l6 6v26H10z"/><path d="M34 8v6h6"/><path$m d="M16 18h14M16 25h18M16 32h10"/><circle@r cx="33" cy="35" r="5"/>',
      any3: '<path@m d="M13 7c5-3 9 1 8 7l-2 9c-1 4-7 4-8 0-2-6-2-13 2-16z"/><circle@m cx="15" cy="30" r="3.5"/><path@t d="M33 19c5-3 9 1 8 7l-2 9c-1 4-7 4-8 0-2-6-2-13 2-16z"/><circle@t cx="35" cy="42" r="3.5"/>'
    },
    intents: {
      attack: SWORD,
      defend: '<path@t d="' + SHIELD + '"/><path d="M24 12v24"/>',
      charge: '<path@g d="M28 3L9 27h13l-3 18 20-25H26z"/>',
      curse: '<path@v d="M24 4C13 4 7 11 7 20c0 6 3 10 7 12v8l5-3 5 5 5-5 5 3v-8c4-2 7-6 7-12 0-9-6-16-17-16z"/><circle@k cx="17" cy="20" r="4"/><circle@k cx="31" cy="20" r="4"/>',
      heal: '<path@r d="' + HEART + '"/><path$w!4 d="M24 15v12M18 21h12"/>',
      flame: '<path@r d="' + FLAME + '"/><path@g d="M24 25c3 4 6 7 6 10a6 6 0 0 1-12 0c0-3 3-6 6-10z"/>',
      flee: '<path@m d="M20 6h11v19l11 6v9H20z"/><path d="M20 33h22"/><path$g!3 d="M4 14h10M2 24h12M6 34h8"/>',
      skip: '<path@k d="M12 6h24v7c0 6-6 8-8 11 2 3 8 5 8 11v7H12v-7c0-6 6-8 8-11-2-3-8-5-8-11z"/><path@g!n d="M15 40c1-5 5-6 9-8 4 2 8 3 9 8z"/><path!3 d="M8 6h32M8 42h32"/>',
      hidden: '<path@s d="M3 24c6-10 14-15 21-15s15 5 21 15c-6 10-14 15-21 15S9 34 3 24z"/><path$w!4 d="M8 40L40 8"/>'
    }
  };

  // Door kinds and the event/album fallbacks reuse what is already drawn.
  ART.doors.fight = ART.doors.combat;
  ART.enemies.any = ART.doors.elite;
  ART.relics.any = '<path@v d="M24 4l14 12-14 28L10 16z"/><path d="M10 16h28M24 4l-5 12 5 28 5-28z"/>';

  function hash(value) {
    var sum = 0;
    var s = String(value);
    for (var i = 0; i < s.length; i++) sum = (sum * 31 + s.charCodeAt(i)) % 9973;
    return sum;
  }
  function body(kind, id) {
    var set = ART[kind] || {};
    if (set[id]) return set[id];
    if (kind === 'events') return set['any' + hash(id) % 4];
    return set.any || ART.res.sign;
  }
  function svg(kind, id) { return wrap(body(kind, id)); }
  /** A framed picture. state: 'locked' greys it and pins a lock, 'done' pins a tick. tone: a rarity or 'boss'. */
  function el(kind, id, o) {
    o = o || {};
    var node = document.createElement('span');
    node.className = 'tw-pic' + (o.cls ? ' ' + o.cls : '') + (o.tone ? ' tw-tone-' + o.tone : '') + (o.state ? ' tw-is-' + o.state : '');
    node.setAttribute('aria-hidden', 'true');
    var html = svg(kind, id);
    if (o.state === 'locked') html += '<i class="tw-badge">' + wrap(ART.res.lock) + '</i>';
    if (o.state === 'done') html += '<i class="tw-badge">' + wrap(ART.res.check) + '</i>';
    node.innerHTML = html;
    return node;
  }
  /** A bare inline icon for a number in a line of text (currency, hero stat). */
  function icon(id, cls) {
    var node = document.createElement('i');
    node.className = 'tw-ico' + (cls ? ' ' + cls : '');
    node.setAttribute('aria-hidden', 'true');
    node.innerHTML = svg('res', id);
    return node;
  }

  // The tower itself: three flights and the stair above the roof. `reached` (0–4) lights the flights
  // the hero has been to; `here` (1–4) puts the banner on the current one.
  function tower(reached, here) {
    var tones = ['#8da69c', '#c9ad7f', '#92a7bf'];
    var dim = '#39443f';
    function tier(i) { return i < reached ? tones[i] : dim; }
    var out = '<svg viewBox="0 0 200 160" fill="none" stroke="' + INK + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
    out += '<path fill="#ece5d2" stroke="none" opacity=".85" d="M156 14a17 17 0 1 0 16 25 14 14 0 0 1-16-25z"/>';
    out += '<path stroke="none" fill="#dfe7e1" opacity=".5" d="M30 22l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5zM58 50l1 3 3 1-3 1-1 3-1-3-3-1 3-1zM176 70l1 3 3 1-3 1-1 3-1-3-3-1 3-1z"/>';
    out += '<path fill="#222b28" stroke="none" d="M0 150c20-22 44-30 62-18 14-16 40-18 56-2 16-12 44-8 82 20v10H0z"/>';
    // cellar
    out += '<path fill="' + tier(0) + '" d="M64 152V112h72v40z"/>';
    out += '<path fill="#141a18" d="M90 152v-18a10 10 0 0 1 20 0v18z"/>';
    out += '<path stroke="#141a18" d="M64 124h20M116 124h20M72 138h12M116 138h12"/>';
    // gallery
    out += '<path fill="' + tier(1) + '" d="M70 112V72h60v40z"/>';
    out += '<path fill="#141a18" d="M80 100V88a5 5 0 0 1 10 0v12zM95 100V88a5 5 0 0 1 10 0v12zM110 100V88a5 5 0 0 1 10 0v12z"/>';
    out += '<path d="M60 112h80"/>';
    // spire
    out += '<path fill="' + tier(2) + '" d="M76 72V50h8v-7h8v7h16v-7h8v7h8v22z"/>';
    out += '<path fill="' + tier(2) + '" d="M84 43l16-31 16 31z"/>';
    out += '<path fill="#141a18" d="M96 64v-8a4 4 0 0 1 8 0v8z"/>';
    out += '<path d="M66 72h68M100 12V3"/><path fill="#d9785c" d="M100 3l13 4-13 4z"/>';
    if (reached > 3) out += '<path stroke="#d9b25f" stroke-width="3" stroke-dasharray="3 6" d="M122 26c14-8 24-6 34-16"/>';
    out += '<path d="M40 152h120"/>';
    if (here >= 1 && here <= 3) {
      var y = [132, 92, 56][here - 1];
      out += '<path stroke="#d9b25f" stroke-width="3" d="M40 ' + y + 'h14M48 ' + (y - 6) + 'l6 6-6 6"/>';
    }
    return out + '</svg>';
  }

  window.TowerArt = { svg: svg, el: el, icon: icon, tower: tower, has: function (kind, id) { return !!(ART[kind] && ART[kind][id]); }, ids: function (kind) { return Object.keys(ART[kind] || {}); } };
})();
