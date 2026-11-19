// The drawn pictures of «Кузница слияний» (window.MFArt): one SVG 40×40 for every upgrade of the
// forge, every node of «Горн мастера», the events, the runes and the buttons, in the metals of the
// blades (sim.baseSvg): steel, bronze guard, wooden hilt, ember. No text inside a picture, no
// shadows. MFArt.gate draws the still backdrop of the gate onto the canvas.
(function () {
  'use strict';

  // The palette: the same metals, wood and fire the blades are drawn with.
  const ST = '#c3cad6'; // steel, light
  const SM = '#8d97a5'; // steel
  const SD = '#4d5560'; // iron
  const DK = '#1c1d20'; // a hole, a pupil
  const WD = '#7a5638'; // wood
  const WL = '#a47a52'; // wood, light
  const LE = '#8a7458'; // leather (the guard of the first blades)
  const GO = '#e6c870'; // gold (the guard of the star blades)
  const GD = '#b8923e'; // gold, dark
  const EM = '#e07b4f'; // ember
  const FL = '#ffb347'; // flame
  const IC = '#7fc8e6'; // ice, water, air
  const RD = '#c0504a'; // cloth
  const SK = '#d9a37c'; // skin
  const SN = '#6b7078'; // stone
  const SL = '#8a9099'; // stone, light
  const CL = '#3a3d45'; // coal
  const CA = '#d8cdb4'; // canvas, bone

  const ANVIL = 'M3 13h30v4h-6c-1.5 1-2.5 2.5-2.5 4.5V25h5v5h-19v-5h5v-3.5c0-3-3-5.5-8-6-2-.3-3.5-1-4.5-2.5z';
  const anvil = (t) => '<g' + (t ? ' transform="' + t + '"' : '') + '><path d="' + ANVIL + '" fill="' + SM + '"/><rect x="9" y="13" width="24" height="1.8" fill="' + ST + '"/></g>';
  // An upright sword on x = 20 (the frame of the blades), in a group the caller turns.
  const sword = (t, metal) => '<g transform="' + t + '"><path d="M18 27V8l2-5 2 5v19z" fill="' + metal + '"/><path d="M20 25V10" stroke="#000000" stroke-opacity=".25" stroke-width="1"/>' +
    '<rect x="14" y="26.5" width="12" height="2.6" rx="1.2" fill="' + GO + '"/><rect x="19" y="29" width="2" height="6" rx=".8" fill="' + WD + '"/><circle cx="20" cy="36.4" r="1.8" fill="' + GO + '"/></g>';
  // A four-point spark with its middle in (x, y).
  const spark = (x, y, r, fill) => '<path d="M' + x + ' ' + (y - r) + 'l' + r * 0.3 + ' ' + r * 0.7 + ' ' + r * 0.7 + ' ' + r * 0.3 + '-' + r * 0.7 + ' ' + r * 0.3 + '-' + r * 0.3 + ' ' + r * 0.7 + '-' + r * 0.3 + '-' + r * 0.7 + '-' + r * 0.7 + '-' + r * 0.3 + ' ' + r * 0.7 + '-' + r * 0.3 + 'z" fill="' + (fill || GO) + '"/>';
  const coin = (x, y, r) => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + GO + '"/><circle cx="' + x + '" cy="' + y + '" r="' + r * 0.55 + '" fill="' + GD + '"/>';
  const ingot = (x, y) => '<path d="M' + x + ' ' + (y + 9) + 'l3-9h12l3 9z" fill="' + SM + '"/><path d="M' + (x + 3) + ' ' + y + 'h12l.9 2.7H' + (x + 2.1) + 'z" fill="' + ST + '"/>';
  const gem = (x, y, fill) => '<path d="M' + x + ' ' + (y - 8) + 'l6 8-6 8-6-8z" fill="' + fill + '"/><path d="M' + x + ' ' + (y - 8) + 'l6 8h-6z" fill="#ffffff" fill-opacity=".3"/>';
  const stone = '<path d="M20 3l13 7.5v19L20 37 7 29.5v-19z" fill="' + SD + '"/><path d="M20 3l13 7.5-13 7.5L7 10.5z" fill="#ffffff" fill-opacity=".08"/>';
  const crucible = '<path d="M10 16h20l-3 13H13z" fill="' + SD + '"/><rect x="8" y="14" width="24" height="3.4" rx="1.5" fill="' + SM + '"/><rect x="11.5" y="17.4" width="17" height="2.2" fill="' + FL + '"/>';
  const chest = '<path d="M6 18c0-6 4-9 14-9s14 3 14 9z" fill="' + WL + '"/><rect x="6" y="18" width="28" height="15" rx="2" fill="' + WD + '"/>' +
    '<rect x="6" y="17" width="28" height="2.6" fill="' + GD + '"/><rect x="10" y="9.6" width="2.4" height="23.4" fill="' + GD + '"/><rect x="27.6" y="9.6" width="2.4" height="23.4" fill="' + GD + '"/>' +
    '<rect x="17.5" y="16" width="5" height="7.5" rx="1.2" fill="' + GO + '"/><circle cx="20" cy="20.4" r="1.1" fill="' + DK + '"/>';
  const gear = (x, y) => {
    let teeth = '';
    for (let a = 0; a < 8; a++) teeth += '<rect x="' + (x - 1.9) + '" y="' + (y - 10.6) + '" width="3.8" height="4.4" rx=".8" transform="rotate(' + a * 45 + ' ' + x + ' ' + y + ')"/>';
    return '<g fill="' + SM + '">' + teeth + '<circle cx="' + x + '" cy="' + y + '" r="7.2"/></g><circle cx="' + x + '" cy="' + y + '" r="2.8" fill="' + DK + '"/>';
  };
  const line = (d, stroke, w) => '<path d="' + d + '" stroke="' + stroke + '" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';

  const UP = {
    ember: crucible + '<path d="M20 2c3 3.5 5 6 5 9a5 5 0 0 1-10 0c0-2 1-3.4 2.2-5 .5 1.6 1 2.3 1.6 2.3.6-2.2.6-4 1.2-6.3z" fill="' + FL + '"/>' +
      line('M9 9c1-2 1-3.5 0-5.5M31 9c-1-2-1-3.5 0-5.5', EM, 1.8) + '<rect x="14" y="31" width="12" height="4" rx="1.5" fill="' + CL + '"/>',
    pilot: '<path d="M20 4c5.5 6.5 10 10.5 10 17a10 10 0 0 1-20 0c0-4.4 2.2-6.8 4.4-10 1.1 3.2 2.2 4.4 3.3 4.4 1.2-4.2 1.2-7.4 2.3-11.4z" fill="' + EM + '"/>' +
      '<path d="M20 16c3 3.2 4.5 5.2 4.5 8.4a4.5 4.5 0 0 1-9 0c0-3.2 2-5.2 4.5-8.4z" fill="' + FL + '"/>' +
      '<rect x="7" y="32" width="26" height="5" rx="2" fill="' + CL + '"/>' + line('M11 34.5h18', SD, 1.4),
    hammer: anvil('translate(3 11) scale(.8)') + '<path d="M15 23L27 9l3 2.5-12 14z" fill="' + WD + '"/>' +
      '<path d="M20 6l9-3 7 10-9 4z" fill="' + SM + '"/><path d="M29 3l7 10-2.5 1-7-10z" fill="' + ST + '"/>' +
      spark(13, 20, 4.5, FL) + line('M6 11l3 4M5 20h3M18 10l-1 4', EM, 1.8),
    stall: '<rect x="7" y="13" width="3" height="22" fill="' + WD + '"/><rect x="30" y="13" width="3" height="22" fill="' + WD + '"/>' +
      '<path d="M4 14l5-9h22l5 9z" fill="' + RD + '"/><path d="M14 5h5l-1 9h-7zM24 5h5l4 9h-7z" fill="' + CA + '"/>' +
      '<path d="M4 14h32v3c-2 2-4 2-6 0-2 2-4 2-6 0-2 2-4 2-6 0-2 2-4 2-6 0-2 2-4 2-8 0z" fill="' + RD + '"/>' +
      sword('translate(3 12) scale(.48)', ST) + coin(27, 23, 5) + '<rect x="5" y="29" width="30" height="6" rx="1" fill="' + WL + '"/>' + line('M8 31h24', WD, 1.4),
    bellows: '<rect x="1.5" y="17.2" width="7" height="5.6" rx="1.6" fill="' + WD + '"/><rect x="30" y="18.2" width="8" height="3.6" rx="1" fill="' + SM + '"/>' +
      '<path d="M11 6c9.5 0 16.5 5 21.5 14-5 9-12 14-21.5 14-4.5 0-6-4-6-14S6.5 6 11 6z" fill="' + LE + '"/>' +
      '<path d="M11.5 9.5c7.5 0 13 3.8 17 10.5-4 6.7-9.5 10.5-17 10.5-2.8 0-3.8-3-3.8-10.5S8.7 9.5 11.5 9.5z" fill="' + WL + '"/>' +
      '<circle cx="14.5" cy="20" r="2.8" fill="' + DK + '"/>' + line('M20 13.5c2 2 3.2 4 3.8 6.5M20 26.5c2-2 3.2-4 3.8-6.5', WD, 1.4) +
      '<circle cx="10" cy="8" r="1" fill="' + GO + '"/><circle cx="10" cy="32" r="1" fill="' + GO + '"/><circle cx="20.5" cy="10" r="1" fill="' + GO + '"/><circle cx="20.5" cy="30" r="1" fill="' + GO + '"/><circle cx="28" cy="15.5" r="1" fill="' + GO + '"/><circle cx="28" cy="24.5" r="1" fill="' + GO + '"/>',
    steel: ingot(3, 24) + ingot(19, 24) + ingot(11, 13) + spark(33, 8, 5),
    sharp: '<rect x="4" y="25" width="26" height="9" rx="2" fill="' + SN + '"/><rect x="4" y="25" width="26" height="3" rx="1.5" fill="' + SL + '"/>' +
      '<path d="M9 23.5L31 5l4.5.5-.5 4.5L13 27z" fill="' + ST + '"/><path d="M9 23.5L31 5l1.4.2L10.4 24.8z" fill="#ffffff" fill-opacity=".45"/>' +
      line('M31 19l4 1M30 24l4 3M27 16l2-3', FL, 1.8),
    purse: '<path d="M13 8c2 2 4.5 3 7 3s5-1 7-3l1.5 6h-17z" fill="#a08a6a"/><path d="M12 14c-5 7-7 12-4 17 2 3.5 6 5 12 5s10-1.5 12-5c3-5 1-10-4-17z" fill="' + LE + '"/>' +
      '<rect x="11" y="12.8" width="18" height="2.8" rx="1.4" fill="' + GD + '"/>' + coin(20, 25.5, 5.4),
    eye: '<path d="M3 20C8 11 14 7 20 7s12 4 17 13c-5 9-11 13-17 13S8 29 3 20z" fill="#e9edf2"/><circle cx="20" cy="20" r="8" fill="' + EM + '"/><circle cx="20" cy="20" r="3.8" fill="' + DK + '"/>' +
      '<circle cx="22.8" cy="17.2" r="1.7" fill="#ffffff"/>' + line('M20 1.5v3M20 35.5v3', GO, 2.2),
    hand: '<path d="M7.5 34L23 15l3 2.4L10.5 36.5z" fill="' + WD + '"/><path d="M16 10l12-7 9 11-12 7z" fill="' + SM + '"/><path d="M28 3l9 11-2.6 1.5-9-11z" fill="' + ST + '"/>' +
      line('M4 12c2-4 5-7 9-8M3 20c1-2 2-3.5 4-5', GO, 2),
    wide: anvil('translate(2 6)') + line('M14 6H5l3.2-3.2M5 6l3.2 3.2M26 6h9l-3.2-3.2M35 6l-3.2 3.2', GO, 2.2),
    twin: sword('rotate(45 20 20) translate(-6.5 0)', ST) + sword('rotate(45 20 20) translate(6.5 0)', '#e0b060'),
    melt: '<path d="M6 9h19l-3 14H9z" fill="' + SD + '"/><rect x="4" y="7" width="23" height="3.4" rx="1.5" fill="' + SM + '"/><rect x="7.6" y="10.4" width="15.8" height="2.2" fill="' + FL + '"/>' +
      '<path d="M26 8.2c5.5 1.5 7 6 6.4 13h-2.6c.4-5.4-.8-8.4-3.8-9.8z" fill="' + FL + '"/><path d="M31 23c2.2 3.2 3.4 4.8 3.4 6.6a3.4 3.4 0 0 1-6.8 0c0-1.8 1.2-3.4 3.4-6.6z" fill="' + EM + '"/>' + spark(12, 31, 5),
    apprentice: '<path d="M7 37c0-8 5.5-13 13-13s13 5 13 13z" fill="#5b6b7a"/><path d="M14.5 37V27.5h11V37z" fill="' + LE + '"/>' + line('M15.5 27.5l-1.5-3M24.5 27.5l1.5-3', LE, 1.8) +
      '<circle cx="20" cy="14" r="6.5" fill="' + SK + '"/><path d="M13 13a7 7 0 0 1 14 0c-2-1.6-4.4-2.4-7-2.4s-5 .8-7 2.4z" fill="' + WD + '"/>' +
      '<rect x="31" y="14" width="2.2" height="14" rx="1" fill="' + WL + '"/><rect x="27.6" y="11" width="9" height="5" rx="1.2" fill="' + SM + '"/>',
    hourglass: '<path d="M12 7h16c0 6.5-5 8.5-5 13s5 6.5 5 13H12c0-6.5 5-8.5 5-13s-5-6.5-5-13z" fill="#46505e"/>' +
      '<path d="M14.2 11.5h11.6c-1 3-3.2 4.6-5.8 6.5-2.6-1.9-4.8-3.5-5.8-6.5z" fill="' + GO + '"/><rect x="19.4" y="17.5" width="1.2" height="9.5" fill="' + GO + '"/>' +
      '<path d="M13.4 33c.8-4 3.6-6.2 6.6-6.2s5.8 2.2 6.6 6.2z" fill="' + GO + '"/>' +
      '<rect x="9" y="3.5" width="22" height="3.6" rx="1.6" fill="' + WD + '"/><rect x="9" y="32.9" width="22" height="3.6" rx="1.6" fill="' + WD + '"/>',
    hunter: '<path d="M10.5 13.5C6.5 12.5 4 8.5 5 4c2 3 4.2 4.6 7.5 5.2z" fill="' + LE + '"/><path d="M29.5 13.5C33.5 12.5 36 8.5 35 4c-2 3-4.2 4.6-7.5 5.2z" fill="' + LE + '"/>' +
      '<path d="M10 18a10 10 0 0 1 20 0c0 3.8-1.5 6.4-4 8v4.5H14V26c-2.5-1.6-4-4.2-4-8z" fill="#dfe3e8"/>' +
      '<circle cx="15.8" cy="18" r="2.9" fill="' + DK + '"/><circle cx="24.2" cy="18" r="2.9" fill="' + DK + '"/><path d="M20 21.5l1.7 3.2h-3.4z" fill="' + DK + '"/>' +
      line('M17 27.5v3M20 27.5v3M23 27.5v3', '#8d97a5', 1.2) + coin(31, 31.5, 5.5),
    temper: '<path d="M30.5 2l3.5 3.5-14 19.5h-5z" fill="' + ST + '"/><path d="M21.4 14.7l3.6 2.6L20 25h-5z" fill="' + EM + '"/>' +
      '<path d="M5 24h30l-3 12H8z" fill="' + WD + '"/><rect x="5.5" y="24" width="29" height="3.6" fill="' + IC + '"/><rect x="6.5" y="30" width="27" height="1.8" fill="' + SD + '"/>' +
      line('M9 20c-2-2 2-3.5 0-6.5M29 20.5c2-2-1.5-3.5.5-6.5', '#cfd6de', 1.8),
    runeMason: '<rect x="3" y="16" width="25" height="19" rx="2.5" fill="' + SN + '"/><rect x="3" y="16" width="25" height="3.2" rx="1.6" fill="' + SL + '"/>' +
      '<path d="M15.5 20.5l5 6-5 6-5-6z" fill="' + DK + '" stroke="' + IC + '" stroke-width="1.3"/>' +
      '<path d="M24.5 13.5l3.5 3.5-3 3-3.5-3.5z" fill="' + ST + '"/><path d="M27.5 10.5l6-6 3.5 3.5-6 6z" fill="' + WD + '"/><rect x="31" y="27" width="3" height="3" fill="' + SL + '"/><rect x="33.5" y="33" width="2.4" height="2.4" fill="' + SN + '"/>',
    runePower: stone + line('M20 11v18M20 14.5l5 5M20 21l-5 5', FL, 2.6) + line('M1.5 20h3M35.5 20h3M4.5 5.5l2 2M35.5 5.5l-2 2M4.5 34.5l2-2M35.5 34.5l-2-2', FL, 1.8),
    caravan: '<path d="M5 24v-8.5C5 10.5 10 7 18 7s13 3.5 13 8.5V24z" fill="' + CA + '"/>' + line('M11.5 9.5V24M18 7.5V24M24.5 9.5V24', '#b3a688', 1.2) +
      '<rect x="3" y="23" width="30" height="5" rx="1.2" fill="' + WD + '"/><rect x="33" y="24.5" width="5.5" height="2" rx="1" fill="' + WL + '"/>' +
      '<circle cx="11" cy="31" r="5.5" fill="' + SD + '"/><circle cx="11" cy="31" r="2" fill="' + WL + '"/><circle cx="26" cy="31" r="5.5" fill="' + SD + '"/><circle cx="26" cy="31" r="2" fill="' + WL + '"/>',
    night: '<path d="M27 2.5a11 11 0 1 0 10.5 14A8.5 8.5 0 0 1 27 2.5z" fill="' + GO + '"/>' + spark(8, 8, 3.5, ST) + spark(14.5, 15.5, 2.5, ST) + anvil('translate(2 15) scale(.65)'),
    cry: '<path d="M4 13c.5 10 7 17.5 19 18.5l3.5-8c-8 0-13.5-3.5-14.5-10.5z" fill="' + CA + '"/><rect x="3.5" y="11" width="9" height="3" rx="1.2" fill="' + GO + '"/>' +
      '<ellipse cx="25" cy="27" rx="3.2" ry="5.4" transform="rotate(22 25 27)" fill="' + WD + '"/>' + line('M30 18c2.5 3 3.3 6.5 2.5 10.5M34 14c4 5 5 10.5 3.5 17', EM, 2.2),
    remelt: crucible + '<path d="M14 37.5c-2.2-3-.2-5.2 1.5-6.8.5 2 2 2.2 2.5 3.6 1-2 .5-4 2-5.6 1 2.6 3.5 3.6 3 6 1-.8 1.5-1.5 2-3 1.6 2 1.6 4.2.5 5.8z" fill="' + EM + '"/>' +
      '<path d="M15.5 2.5h7l1 5.5-3.5 4-5.5-2.5z" fill="' + ST + '"/><path d="M26.5 5l4.5 1.2-1.2 4.3-3.8-1.3z" fill="' + SM + '"/>',
    banner: '<rect x="7" y="3" width="2.6" height="34" rx="1.2" fill="' + WL + '"/><circle cx="8.3" cy="3.5" r="2.4" fill="' + GO + '"/>' +
      '<path d="M9.6 6h24v19l-6-4.5-6 4.5-6-4.5-6 4.5z" fill="' + RD + '"/><path d="M21.6 8.5l4 5-4 5-4-5z" fill="' + GO + '"/>'
  };

  const coinStack = (x, n) => {
    let out = '';
    for (let i = 0; i < n; i++) {
      const y = 32 - i * 4;
      out += '<ellipse cx="' + x + '" cy="' + (y + 1.6) + '" rx="7.5" ry="2.8" fill="' + GD + '"/><ellipse cx="' + x + '" cy="' + y + '" rx="7.5" ry="2.8" fill="' + GO + '"/>';
    }
    return out;
  };

  const MF = {
    rhythm: '<circle cx="20" cy="20" r="16" fill="' + DK + '" stroke="' + GD + '" stroke-width="2"/>' +
      line('M20 5v3M35 20h-3M20 35v-3M5 20h3', GO, 2) +
      '<g transform="rotate(-30 20 20)"><rect x="18.5" y="14" width="3" height="16" rx="1" fill="' + WL + '"/><rect x="11" y="9" width="18" height="7" rx="1.5" fill="' + SM + '"/><rect x="11" y="9" width="18" height="2" rx="1" fill="' + ST + '"/></g>' +
      line('M27 21c-1 4-4 7-8 8M30 22c-1 5-4 9-9 11', EM, 1.8) + spark(32, 7, 4, GO),
    trade: '<path d="M17 12h6l1 11h-8z" fill="' + WD + '"/><circle cx="20" cy="9" r="6" fill="' + WL + '"/>' +
      '<path d="M13 22h14l3 5H10z" fill="' + GD + '"/><rect x="8" y="27" width="24" height="8" rx="1.5" fill="' + SM + '"/><rect x="8" y="27" width="24" height="2" rx="1" fill="' + ST + '"/>' +
      '<path d="M15 32l2 2 3-3 3 3 2-2" fill="none" stroke="' + GO + '" stroke-width="1.8" stroke-linejoin="round"/>' + coin(31.5, 17.5, 5.5) + spark(8, 10, 4, GO),
    startGold: coinStack(12, 5) + coinStack(28, 2) + spark(29, 12, 6),
    rush: '<path d="M3 9l10 11L3 31h6l10-11L9 9z" fill="' + EM + '"/><path d="M16 9l10 11-10 11h6l10-11L22 9z" fill="' + FL + '"/>' + coin(33.5, 8, 4.5),
    startLevel: sword('translate(0 0)', ST) + line('M4 17l4.5-4.5L13 17M4 24l4.5-4.5L13 24M27 17l4.5-4.5L36 17M27 24l4.5-4.5L36 24', GO, 2.4),
    auto: gear(14.5, 25) + '<path d="M19.5 21L31 9.5l2.4 2.4L21.9 23.4z" fill="' + WD + '"/><path d="M27 3.5l9.5 9.5-3.5 3.5L23.5 7z" fill="' + ST + '"/>',
    rune: gem(20, 12, EM) + gem(10, 27, IC) + gem(30, 27, GO),
    memory: anvil('translate(2 8)') + sword('translate(41 -9) rotate(90)', ST) + spark(7, 31, 4.5)
  };

  MF.team = '<circle cx="12" cy="11" r="6" fill="' + SK + '"/><circle cx="28" cy="11" r="6" fill="' + SK + '"/>' +
    '<path d="M3 34V25c0-10 18-10 18 0v9z" fill="' + ST + '"/><path d="M19 34V25c0-10 18-10 18 0v9z" fill="' + LE + '"/>' + line('M13 29l7 5 7-5', GO, 2.2);
  MF.dragonCare = '<path d="M7 28C3 20 9 7 20 4c11 3 17 16 13 24-4 10-22 10-26 0z" fill="' + EM + '" stroke="' + GO + '" stroke-width="2"/>' +
    line('M18 10l5 6-6 5 5 6-3 5', WD, 2) + spark(31, 8, 4, GO);
  MF.command = '<path d="M7 35V6h3v29zM10 6h23l-5 7 5 7H10z" fill="' + GO + '"/>' +
    '<circle cx="17" cy="29" r="4" fill="' + ST + '"/><circle cx="28" cy="29" r="4" fill="' + EM + '"/>' + line('M13 36h19', GO, 2);

  const EV = {
    caravan: chest,
    wanderer: '<rect x="31" y="5" width="2.2" height="32" rx="1" fill="' + WD + '"/><path d="M19 4c-6 0-9 5-9 10 0 3.5-4 14-5 22h28c-1-8-5-18.5-5-22 0-5-3-10-9-10z" fill="#5b6b7a"/>' +
      '<ellipse cx="19" cy="14.5" rx="4.6" ry="5.6" fill="' + DK + '"/>',
    starfall: line('M5 5l16 16M22 3l8 8M3 20l8 8', GO, 2.2).replace('fill="none"', 'fill="none" stroke-opacity=".55"') + spark(26, 26, 8) + spark(33, 14, 4.5) + spark(13.5, 30.5, 4.5),
    storm: '<path d="M9.5 19A6 6 0 0 1 11 7.2 8 8 0 0 1 26 6a6.5 6.5 0 0 1 4.5 13z" fill="' + SM + '"/><path d="M20.5 16l-7 11h5.5l-3 10 11-13h-6l4-8z" fill="' + GO + '"/>',
    order: '<path d="M6 28L4 12l8 7 8-12 8 12 8-7-2 16z" fill="' + GO + '"/><rect x="6" y="28" width="28" height="4.5" rx="1.2" fill="' + GD + '"/><circle cx="20" cy="30.2" r="1.6" fill="' + EM + '"/>' +
      '<circle cx="12" cy="30.2" r="1.3" fill="' + IC + '"/><circle cx="28" cy="30.2" r="1.3" fill="' + IC + '"/>'
  };

  const RUNE = {
    fire: stone + '<path d="M20.5 9c4 5 7 8.5 7 13a7.5 7.5 0 0 1-15 0c0-3 2-5.5 3.2-7.5.8 2 2 3 3 3 0-3 .2-5.8 1.8-8.5z" fill="' + EM + '"/><path d="M20 20c2 2.6 3.2 4 3.2 6a3.2 3.2 0 0 1-6.4 0c0-2 1.2-3.4 3.2-6z" fill="' + FL + '"/>',
    ice: stone + line('M20 9.5v21M10.9 14.750l18.2 10.5M29.1 14.750l-18.2 10.5', IC, 2.4) + line('M17 11.5l3 2.5 3-2.5M17 28.5l3-2.5 3 2.5', IC, 1.6),
    greed: stone + coin(20, 20, 8) + '<path d="M20 15.5l3.5 4.5-3.5 4.5-3.5-4.5z" fill="' + GO + '"/>'
  };

  const UI = {
    forge: '<rect x="16.5" y="1.5" width="7" height="7" rx="1" fill="' + SD + '"/><path d="M6 37V19C6 11.5 12 6 20 6s14 5.5 14 13v18z" fill="' + SN + '"/>' +
      line('M6 24h5M29 24h5M6 31h4M30 31h4M13 10.5v4M27 10.5v4', SL, 1.2) +
      '<path d="M12.5 37V25a7.5 7.5 0 0 1 15 0v12z" fill="' + DK + '"/>' +
      '<path d="M20 20.5c3.2 4.4 5.4 6.8 5.4 10.5a5.4 5.4 0 0 1-10.8 0c0-2.2 1-3.8 2.2-5.4.6 1.4 1.4 2.2 2.2 2.2 0-2.6.2-4.9 1-7.3z" fill="' + EM + '"/>' +
      '<path d="M20 28c1.6 2.2 2.7 3.4 2.7 5.2a2.7 2.7 0 0 1-5.4 0c0-1.8 1.1-3 2.7-5.2z" fill="' + FL + '"/>',
    chest: chest + coin(31.5, 31, 5),
    upgrades: anvil('translate(2 9)') + '<path d="M14 17.5L24.5 7l2.3 2.3L16.3 19.8z" fill="' + WD + '"/><path d="M21 1.5l10 10-3.5 3.5-10-10z" fill="' + ST + '"/>' + spark(34.5, 6, 3.5, FL),
    master: line('M13 29l-3.5 8.5M27 29l3.5 8.5', SD, 3) + '<path d="M5 19h30c0 8-6.5 13-15 13S5 27 5 19z" fill="' + SD + '"/><rect x="4" y="17.5" width="32" height="3" rx="1.5" fill="' + SM + '"/>' +
      '<circle cx="12.5" cy="15" r="3.8" fill="' + CL + '"/><circle cx="27.5" cy="15" r="3.8" fill="' + CL + '"/><circle cx="20" cy="13.5" r="4.6" fill="' + CL + '"/>' +
      '<path d="M20 3c2.6 3.6 4.4 5.6 4.4 8.6a4.4 4.4 0 0 1-8.8 0c0-1.8.8-3.1 1.8-4.4.5 1.2 1.2 1.8 1.8 1.8 0-2.1.1-4 .8-6z" fill="' + EM + '"/>' +
      '<circle cx="12" cy="14.5" r="1.2" fill="' + FL + '"/><circle cx="28" cy="15" r="1.2" fill="' + FL + '"/>',
    coal: '<path d="M6 25l4.5-12L20 8l10 5.5L34 24l-6.5 9.5h-14z" fill="' + CL + '"/><path d="M10.5 13L20 8l2.5 9.5-8 4z" fill="#4c505b"/><path d="M22.5 17.5L30 13.5 34 24l-8 1z" fill="#30333a"/>' +
      '<path d="M14.5 21.5l8-4 3.5 7.5-6.5 4.5z" fill="' + EM + '"/><path d="M17.5 22.5l4-2 1.8 4-3.3 2.2z" fill="' + FL + '"/><path d="M13.5 33.5l6-4 3.5 4z" fill="' + EM + '" fill-opacity=".7"/>',
    blow: '<path d="M26 5c5 6.5 8.5 10.5 8.5 16.5a8.5 8.5 0 0 1-17 0c0-3.5 1.8-6 3.5-8.5.8 2.2 2 3.4 3.2 3.4 0-4 .3-7.6 1.8-11.4z" fill="' + EM + '"/>' +
      '<path d="M26 19c2.4 3.2 4 5 4 7.6a4 4 0 0 1-8 0c0-2.6 1.6-4.4 4-7.6z" fill="' + FL + '"/>' + line('M3 14h9c2.5 0 2.5-4 0-4M2 21h12M4 28h8c2.5 0 2.5 4 0 4', IC, 2.2),
    lock: line('M14 18v-4.5a6 6 0 0 1 12 0V18', SD, 3.4) + '<rect x="10" y="18" width="20" height="15" rx="3" fill="' + SD + '"/><circle cx="20" cy="25" r="2.2" fill="' + DK + '"/>',
    check: line('M9 21l7.5 7.5L32 12', '#7fd08a', 4.5)
  };

  const SETS = { up: UP, mf: MF, ev: EV, rune: RUNE, ui: UI };

  // ---- the painted pictures: art/<folder>/<id>.webp ---------------------------------------------------
  // Low-poly pictures for the icons, the heroes, the monsters and the backdrops of the worlds. The SVG
  // ones above stay for what has none (the lock, the check) and for the canvas while one loads.
  const RASTER = {
    ability: ["breath", "mark", "riposte", "seal", "split"],
    artifact: ["apprenticeGear", "apprenticeSpring", "coinDie", "crySpark", "digestiveCoal", "dragonChime", "dragonCradle", "emberSpark", "emberVein", "feedingBowl", "focusCrystal", "forgeHeart", "frozenClock", "goldenSeal", "heavyPommel", "hotBellows", "hourNeedle", "hungryCrop", "keenLens", "keeperSand", "marchingBoot", "marketBell", "mentorBook", "mossVial", "nightLantern", "pairHammer", "petTalisman", "petTreat", "rallyCrest", "rallyHorn", "runePrism", "sandPin", "shieldAwl", "tradeScale", "twinLever", "warStandard", "whetstone"],
    bg: ["candy", "desert", "kitchen", "neon", "road", "sea", "space", "swamp", "toys", "volcano"],
    dragon: ["ash", "egg", "frost", "storm", "young"],
    ev: ["caravan", "order", "starfall", "storm", "wanderer"],
    hero: ["bran", "corvin", "eira", "veya"],
    mf: ["auto", "command", "dragonCare", "memory", "rhythm", "rune", "rush", "startGold", "startLevel", "team", "trade"],
    monster: ["alien", "angler", "ashwolf", "bat", "cabbage", "cactus", "cheese", "crab", "crystalbug", "cupcake", "cyberdog", "drake", "drone", "duck", "forkspider", "ghostneon", "gingerbread", "goblin", "gremlin", "gummy", "jackal", "jackbox", "jelly", "kettle", "lavagolem", "lollisnake", "marshmallow", "mech", "mosquito", "mummy", "obsidianbug", "octopus", "puffer", "rat", "salamanderfoe", "saucer", "scorpion", "shroom", "slime", "snail", "soldier", "spacesquid", "stump", "teddy", "toad", "toaster", "trashgolem", "troll", "windup", "worm"],
    pet: ["fox", "raven", "salamander", "turtle"],
    rune: ["fire", "greed", "ice", "resonant"],
    ui: ["blow", "boss", "chest", "coal", "forge", "master", "upgrades"],
    up: ["apprentice", "banner", "bellows", "caravan", "cry", "ember", "eye", "hammer", "hand", "hourglass", "hunter", "melt", "night", "pilot", "purse", "remelt", "runeMason", "runePower", "sharp", "stall", "steel", "temper", "twin", "wide"]
  };;
  const BASE = '../art/';

  function has(folder, id) { return !!(RASTER[folder] && RASTER[folder].indexOf(id) >= 0); }
  function url(folder, id) { return BASE + folder + '/' + id + '.webp'; }

  const images = {};
  const listeners = [];
  /** fn(key) runs whenever a picture for the canvas has loaded (to draw it anew). */
  function onLoad(fn) { listeners.push(fn); }

  /** The loaded image of a picture for the canvas, or null while it loads or when there is none. */
  function img(folder, id) {
    if (!has(folder, id)) return null;
    const key = folder + '/' + id;
    let im = images[key];
    if (!im) {
      im = images[key] = new Image();
      im.decoding = 'async';
      im.onload = () => listeners.forEach((fn) => { try { fn(key); } catch (e) { /* a listener's own trouble */ } });
      im.src = url(folder, id);
    }
    return im.complete && im.naturalWidth > 0 ? im : null;
  }

  /** The markup of a picture: MFArt.svg('up', 'bellows'); '' when there is no such one. */
  function svg(set, id) {
    const body = SETS[set] && SETS[set][id];
    return body ? '<svg viewBox="0 0 40 40" aria-hidden="true">' + body + '</svg>' : '';
  }

  /** The painted picture when there is one, else the SVG one. */
  function html(set, id) {
    if (has(set, id)) return '<img src="' + url(set, id) + '" alt="" draggable="false" decoding="async">';
    return svg(set, id);
  }

  /** A <span class="mf-ic …"> with the picture inside (cls — extra classes). */
  function el(set, id, cls) {
    const span = document.createElement('span');
    span.className = 'mf-ic' + (has(set, id) ? ' mf-ic-img' : '') + (cls ? ' ' + cls : '');
    span.innerHTML = html(set, id);
    return span;
  }

  /**
   * The backdrop of a world on the canvas: the picture covers the box, its bottom (the road) and its
   * left side (the gate) always in sight; a shade at the top keeps the wave's name and the bars
   * readable. False while the picture loads.
   */
  // Where the feet stand on each backdrop: a share of its height, on its road (the rest: FLOOR_ANY).
  const FLOOR = { road: 0.8, neon: 0.84, sea: 0.85, toys: 0.85, desert: 0.88 };
  const FLOOR_ANY = 0.86;

  function backdrop(ctx, W, H, id, top) {
    const im = img('bg', id);
    if (!im) return 0;
    const scale = Math.max(W / im.naturalWidth, H / im.naturalHeight);
    const dw = im.naturalWidth * scale;
    const dh = im.naturalHeight * scale;
    ctx.drawImage(im, 0, H - dh, dw, dh);
    const shade = Math.min(H, Math.max(top + 24, H * 0.45));
    const grad = ctx.createLinearGradient(0, 0, 0, shade);
    grad.addColorStop(0, 'rgba(10, 11, 14, 0.62)');
    grad.addColorStop(1, 'rgba(10, 11, 14, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, shade);
    return H - dh + dh * (FLOOR[id] || FLOOR_ANY);
  }

  /**
   * The still backdrop of the gate on the canvas — the painted one of a world when it has loaded,
   * else the drawn one: far hills, the road, the wall with the tower,
   * the dark archway with its grate and two torches (they flicker with t, in ms). `gx` is the
   * middle of the archway, `top` the room the bars take above.
   */
  function gate(ctx, W, H, gx, top, t, world) {
    // The line the monster and the heroes stand on: the road of the painting, or the bottom.
    const floor = world ? backdrop(ctx, W, H, world, top) : 0;
    if (floor) return floor;
    const ground = H - 8;
    // far hills
    ctx.fillStyle = '#1e2025';
    ctx.beginPath();
    ctx.moveTo(0, ground);
    const hill = Math.max(10, Math.min(34, (ground - top) * 0.45));
    for (let x = 0; x <= W; x += 8) ctx.lineTo(x, ground - hill * (0.55 + 0.3 * Math.sin(x / 47 + 1.3) + 0.15 * Math.sin(x / 19)));
    ctx.lineTo(W, ground);
    ctx.closePath();
    ctx.fill();
    // the road
    ctx.fillStyle = '#2b2824';
    ctx.fillRect(0, ground, W, H - ground);
    ctx.fillStyle = '#3d3831';
    ctx.fillRect(0, ground, W, 2);
    ctx.fillStyle = '#34302a';
    for (let x = 14; x < W; x += 46) ctx.fillRect(x + (x % 3) * 5, ground + 4, 9, 2);
    const wallTop = Math.max(top, ground - Math.max(30, Math.min(84, (ground - top) * 0.92)));
    const wallH = ground - wallTop;
    if (wallH < 16) return ground;
    const right = gx + 26;
    // the wall and its battlements
    ctx.fillStyle = '#3b3e45';
    ctx.fillRect(0, wallTop + 6, right, wallH - 6);
    for (let x = 0; x < right - 4; x += 12) ctx.fillRect(x, wallTop, 7, 7);
    // courses of stone
    ctx.fillStyle = '#30333a';
    for (let y = wallTop + 13, row = 0; y < ground - 3; y += 9, row++) {
      ctx.fillRect(0, y, right, 1);
      for (let x = (row % 2) * 8 + 3; x < right - 2; x += 16) ctx.fillRect(x, y - 8, 1, 8);
    }
    ctx.fillStyle = '#4a4e57';
    ctx.fillRect(right - 2, wallTop + 6, 2, wallH - 6);
    // the archway
    const half = Math.min(17, right / 2 - 6);
    const archTop = Math.max(wallTop + 10 + half, ground - Math.min(wallH - 12, 46) + half);
    ctx.fillStyle = '#5a5e68';
    ctx.beginPath();
    ctx.moveTo(gx - half - 3, ground);
    ctx.lineTo(gx - half - 3, archTop);
    ctx.arc(gx, archTop, half + 3, Math.PI, 0);
    ctx.lineTo(gx + half + 3, ground);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#121316';
    ctx.beginPath();
    ctx.moveTo(gx - half, ground);
    ctx.lineTo(gx - half, archTop);
    ctx.arc(gx, archTop, half, Math.PI, 0);
    ctx.lineTo(gx + half, ground);
    ctx.closePath();
    ctx.fill();
    // the grate, lifted
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = '#6f7682';
    ctx.lineWidth = 1.5;
    const grate = archTop - half + Math.max(8, half * 0.9);
    ctx.beginPath();
    for (let x = gx - half + 4; x < gx + half; x += 6) {
      ctx.moveTo(x, archTop - half);
      ctx.lineTo(x, grate + 3);
    }
    ctx.moveTo(gx - half, grate - 4);
    ctx.lineTo(gx + half, grate - 4);
    ctx.stroke();
    ctx.restore();
    // torches by the archway
    const flick = 0.75 + 0.25 * Math.sin(t / 130) * Math.sin(t / 53);
    [gx - half - 9, gx + half + 9].forEach((x, i) => {
      if (x < 4 || x > right - 3) return;
      const y = archTop + 2;
      ctx.fillStyle = '#7a5638';
      ctx.fillRect(x - 1, y, 2, 9);
      ctx.fillStyle = '#e07b4f';
      ctx.beginPath();
      ctx.ellipse(x, y - 2, 3, 4.5 * (i ? flick : 1.5 - flick * 0.6), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffb347';
      ctx.beginPath();
      ctx.ellipse(x, y - 1, 1.5, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    return ground;
  }

  window.MFArt = { svg: svg, html: html, el: el, gate: gate, sets: SETS, raster: RASTER, has: has, img: img, url: url, onLoad: onLoad };
})();
