// The drawn pictures of «Ветки поездов»: window.TSArt. Every list of like things has its own
// picture — the chapters, the extra modes, the upgrades of the workshop, the achievements, the
// states of a level. One style: a 48 × 48 tile, flat fills, a clear silhouette, no text inside.
//   TSArt.pic(name, size?)   an <svg> element (the name of a chapter is 'ch1'…'ch10', of an
//                            upgrade 'up-<id>', of an achievement 'ach-<id>')
//   TSArt.svg(name, size?)   the markup
//   TSArt.names              every picture there is
(function () {
  const K = {
    tile: '#232830', ink: '#E8ECF2', steel: '#8B95A5', dark: '#12151A', mute: '#4A5260',
    gold: '#E8C547', red: '#E5533D', blue: '#3B82F6', green: '#22C55E', orange: '#F97316',
    violet: '#A855F7', pink: '#EC4899', sky: '#38BDF8', grey: '#9A9A9A', moon: '#9DBBFF'
  };

  /** A track: two rails as a wide line with a dark core. */
  function track(d, color) {
    return '<path d="' + d + '" fill="none" stroke="' + (color || K.steel) + '" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="' + d + '" fill="none" stroke="' + K.tile + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
  }

  function diamond(x, y, r, fill, stroke) {
    return '<path d="M' + x + ' ' + (y - r) + 'L' + (x + r) + ' ' + y + 'L' + x + ' ' + (y + r) + 'L' + (x - r) + ' ' + y + 'Z" fill="' + fill + '" stroke="' + (stroke || K.tile) + '" stroke-width="2" stroke-linejoin="round"/>';
  }

  function star(x, y, r, fill) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5;
      const q = i % 2 ? r * 0.45 : r;
      pts.push((x + Math.cos(a) * q).toFixed(1) + ',' + (y + Math.sin(a) * q).toFixed(1));
    }
    return '<polygon points="' + pts.join(' ') + '" fill="' + fill + '" stroke="' + fill + '" stroke-width="1" stroke-linejoin="round"/>';
  }

  function dot(x, y, r, fill) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + fill + '"/>'; }

  function rect(x, y, w, h, rx, fill) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + rx + '" fill="' + fill + '"/>'; }

  function line(d, color, width) {
    return '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + width + '" stroke-linecap="round" stroke-linejoin="round"/>';
  }

  function shed(x) {
    return '<path d="M' + x + ' 39V23Q' + x + ' 11 ' + (x + 8) + ' 11Q' + (x + 16) + ' 11 ' + (x + 16) + ' 23V39Z" fill="' + K.ink + '"/>' +
      '<path d="M' + (x + 4) + ' 39V26Q' + (x + 4) + ' 19 ' + (x + 8) + ' 19Q' + (x + 12) + ' 19 ' + (x + 12) + ' 26V39Z" fill="' + K.dark + '"/>';
  }

  function calendar(mark) {
    return rect(9, 11, 30, 29, 5, K.ink) +
      '<path d="M9 21V16a5 5 0 0 1 5-5h20a5 5 0 0 1 5 5v5Z" fill="' + K.red + '"/>' +
      line('M17 8v6M31 8v6', K.steel, 3) + mark;
  }

  const fork = track('M24 42V28L11 10') + track('M24 28L37 10');

  const P = {
    // ---- the chapters ----
    ch1: track('M6 37H42') + rect(11, 21, 14, 11, 1.5, K.ink) + '<path d="M8.5 22L18 13L27.5 22Z" fill="' + K.red + '" stroke="' + K.red + '" stroke-width="1.5" stroke-linejoin="round"/>' +
      rect(16, 25, 4, 7, 0.5, K.dark) + rect(33, 24, 2.5, 8, 1, K.steel) + dot(34.2, 20, 6.5, K.green),
    ch2: track('M10 41L24 25V7') + track('M38 41L24 25') + dot(24, 25, 4.5, K.gold),
    ch3: track('M24 42V28L37 10', K.mute) + track('M24 42V28L11 10', K.ink) + diamond(24, 29, 7.5, '#FACC15') +
      line('M18 8Q24 2 30 8', K.gold, 2.5) + '<path d="M14.5 6.5L20 5.500L18.5 11Z" fill="' + K.gold + '"/><path d="M33.5 6.5L28 5.500L29.5 11Z" fill="' + K.gold + '"/>',
    ch4: track('M24 43V30L10 14') + track('M24 30V12') + track('M24 30L38 14') + dot(10, 12, 5.5, K.red) + rect(19, 5, 10, 10, 1.5, K.blue) +
      '<path d="M38 6L44 16H32Z" fill="' + K.green + '" stroke="' + K.green + '" stroke-width="1" stroke-linejoin="round"/>',
    ch5: fork + diamond(24, 27, 12, K.sky) + dot(18.5, 27, 2, K.dark) + dot(24, 27, 2, K.dark) + dot(29.5, 27, 2, K.dark),
    ch6: line('M4 39H44', K.steel, 2.5) + rect(4, 20, 11, 13, 2, K.blue) + rect(17, 20, 11, 13, 2, K.blue) +
      '<path d="M30 33V17a2 2 0 0 1 2-2h6q6 2 6 12v6Z" fill="' + K.ink + '"/>' + rect(34, 19, 5, 6, 1, K.dark) +
      line('M15 29h2M28 29h2', K.steel, 2) + dot(7.5, 35, 2.5, K.steel) + dot(11.5, 35, 2.5, K.steel) + dot(20.5, 35, 2.5, K.steel) + dot(24.5, 35, 2.5, K.steel) +
      dot(34, 35, 2.5, K.steel) + dot(40, 35, 2.5, K.steel),
    ch7: track('M5 31H43') + track('M9 31L17 16H31L39 31') +
      '<path d="M4 25.500L4 36.500L13 31Z" fill="' + K.red + '" stroke="' + K.tile + '" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M29 10.500L29 21.500L20 16Z" fill="' + K.blue + '" stroke="' + K.tile + '" stroke-width="1.5" stroke-linejoin="round"/>',
    ch8: track('M24 36H43') + '<circle cx="24" cy="23" r="13" fill="none" stroke="' + K.steel + '" stroke-width="5"/><circle cx="24" cy="23" r="13" fill="none" stroke="' + K.tile + '" stroke-width="1.8"/>' +
      diamond(24, 36, 6.5, '#FACC15') + '<path d="M13 12L19 9L18 16Z" fill="' + K.ink + '"/>',
    ch9: dot(13, 12, 5, K.red) + dot(35, 12, 5, K.red) + '<circle cx="24" cy="26" r="15" fill="' + K.ink + '"/>' + '<circle cx="24" cy="26" r="11" fill="' + K.tile + '"/>' +
      line('M24 26V18M24 26L30 30', K.gold, 3) + line('M12 42l3-4M36 42l-3-4', K.steel, 3),
    ch10: '<path d="M8 26Q8 9 24 9Q40 9 40 26Z" fill="' + K.blue + '"/>' + rect(8, 25, 32, 6, 1, K.dark) + rect(8, 25, 32, 6, 1, 'rgba(232,236,242,0.25)') +
      '<path d="M7 31H41Q38 42 24 42Q10 42 7 31Z" fill="' + K.ink + '"/>' + diamond(24, 18, 6, K.gold, K.blue),

    // ---- the extra modes ----
    daily: calendar(diamond(24, 30, 7, '#FACC15', K.ink) + dot(24, 30, 2, K.dark)),
    weekly: line('M13 8V41', K.steel, 3.5) + '<path d="M15 9L40 17L15 26Z" fill="' + K.violet + '" stroke="' + K.violet + '" stroke-width="1.5" stroke-linejoin="round"/>' +
      star(23, 17.5, 4.5, K.ink) + line('M8 41H19', K.steel, 3.5),
    endless: track('M24 24C19 13 7 15 7 24C7 33 19 35 24 24C29 13 41 15 41 24C41 33 29 35 24 24Z') +
      '<rect x="9" y="11.5" width="13" height="7" rx="3.5" fill="' + K.green + '" stroke="' + K.tile + '" stroke-width="1.5" transform="rotate(-12 15.5 15)"/>',
    shop: line('M15 37L29 21', K.ink, 6) + dot(33, 16, 8.5, K.ink) + '<path d="M33 16L44 5L46 16Z" fill="' + K.tile + '"/>' + '<path d="M33 16L37 3L45 9Z" fill="' + K.tile + '"/>' +
      '<polygon points="13,7 19.1,10.5 19.1,17.5 13,21 6.9,17.5 6.9,10.5" fill="' + K.gold + '"/>' + dot(13, 14, 3, K.tile),
    awards: '<path d="M14 5H22L26 22H18Z" fill="' + K.red + '"/><path d="M34 5H26L22 22H30Z" fill="' + K.blue + '"/>' + dot(24, 31, 11.5, K.gold) + star(24, 31, 6.5, K.dark),

    // ---- the upgrades of the workshop ----
    'up-hint': dot(24, 19, 11.5, K.gold) + '<path d="M18 27H30L28 34H20Z" fill="' + K.gold + '"/>' + rect(19.5, 35, 9, 3, 1.5, K.steel) + rect(21, 39.5, 6, 3, 1.5, K.steel) +
      line('M20 21l4-4 4 4', K.dark, 2.5),
    'up-back': '<path d="M23 11V37L7 24Z" fill="' + K.ink + '" stroke="' + K.ink + '" stroke-width="2" stroke-linejoin="round"/>' +
      '<path d="M41 11V37L25 24Z" fill="' + K.ink + '" stroke="' + K.ink + '" stroke-width="2" stroke-linejoin="round"/>',
    'up-ghosts': '<rect x="14" y="10" width="28" height="13" rx="6.5" fill="none" stroke="' + K.blue + '" stroke-width="2.5" stroke-dasharray="4 3.5"/>' +
      '<path d="M6 40Q8 24 22 23" fill="none" stroke="' + K.blue + '" stroke-width="2.5" stroke-dasharray="1 5" stroke-linecap="round"/>' +
      rect(6, 30, 20, 10, 5, K.blue) + dot(21, 35, 1.8, K.ink),
    'up-brake': line('M11 31A15 15 0 0 1 22 18', K.mute, 3) + line('M21 37L31 12', K.ink, 4.5) + dot(31.5, 11, 5.5, K.red) + rect(10, 36, 28, 6, 2.5, K.steel),
    'up-signal': rect(22, 30, 4, 11, 1, K.steel) + rect(15, 40, 18, 3.5, 1.5, K.steel) + rect(15, 5, 18, 28, 7, K.ink) + dot(24, 13.5, 5, K.red) + dot(24, 25, 5, K.mute),
    'up-life': '<path d="M24 40C9 30 7 20 12.5 14.500C17 10 22.5 12 24 17C25.5 12 31 10 35.5 14.500C41 20 39 30 24 40Z" fill="' + K.red + '" stroke="' + K.red + '" stroke-width="1.5" stroke-linejoin="round"/>' +
      line('M15 19Q16 16 19 16', K.ink, 2.5),
    'up-warn': '<path d="M24 9L41 38H7Z" fill="' + K.gold + '" stroke="' + K.gold + '" stroke-width="4" stroke-linejoin="round"/>' + rect(22.2, 17, 3.6, 12, 1.8, K.dark) + dot(24, 34, 2.2, K.dark),
    'up-siding': track('M5 34H29') + rect(29, 15, 6, 25, 1.5, K.red) + rect(23, 20, 18, 6, 2, K.ink) + dot(32, 23, 1.6, K.red),
    'up-wide': '<circle cx="24" cy="24" r="17" fill="none" stroke="' + K.violet + '" stroke-width="2.5" stroke-dasharray="5 4.5" stroke-linecap="round"/>' + diamond(24, 24, 10, K.grey) + dot(24, 24, 3, K.tile),
    'up-desk': rect(7, 9, 34, 30, 5, K.ink) + dot(14.5, 17, 3, K.red) + rect(20, 15.5, 15, 3, 1.5, K.mute) + dot(14.5, 24, 3, K.blue) + rect(20, 22.5, 11, 3, 1.5, K.mute) +
      dot(14.5, 31, 3, K.green) + rect(20, 29.5, 15, 3, 1.5, K.mute),
    'up-series': rect(8, 29, 8, 11, 2, K.steel) + rect(20, 20, 8, 20, 2, K.orange) + rect(32, 10, 8, 30, 2, K.gold) + line('M9 21L19 13M19 13h-5M19 13v5', K.ink, 2.5),
    'up-quick': '<path d="M28 5L11 27H22L19 43L37 20H26Z" fill="' + K.gold + '" stroke="' + K.gold + '" stroke-width="1.5" stroke-linejoin="round"/>',
    'up-map': '<path d="M7 13L18 9L30 13L41 9V35L30 39L18 35L7 39Z" fill="' + K.ink + '" stroke="' + K.ink + '" stroke-width="1.5" stroke-linejoin="round"/>' +
      line('M18 9V35M30 13V39', K.steel, 1.5) + line('M12 30L19 21L28 27L36 16', K.red, 2.8) + dot(12, 30, 2.8, K.red) + dot(36, 16, 2.8, K.red),
    'up-skin': rect(8, 8, 26, 11, 3.5, K.pink) + line('M34 13.500H40V24H24V30', K.steel, 2.8) + rect(21, 29, 6, 13, 2.5, K.ink),
    'up-night': '<path d="M29 8A16 16 0 1 0 40 30A13.5 13.5 0 0 1 29 8Z" fill="' + K.moon + '"/>' + star(38, 13, 3.5, K.gold) + dot(31, 20, 1.3, K.gold),
    'up-depot2': shed(5) + shed(27) + line('M4 42H44', K.steel, 2.5),

    // ---- the achievements ----
    'ach-first-level': track('M24 42V28L37 10', K.mute) + track('M24 42V28L13 13', K.green) + '<path d="M9.5 8L17.5 10L9.5 16.500Z" fill="' + K.green + '" stroke="' + K.green + '" stroke-width="1.5" stroke-linejoin="round"/>' +
      diamond(24, 29, 7.5, K.grey),
    'ach-chapter-stars': star(11, 29, 7, K.gold) + star(24, 17, 9.5, K.gold) + star(37, 29, 7, K.gold),
    'ach-no-crash-100': '<path d="M24 5L40 11V24C40 33 33 39 24 43C15 39 8 33 8 24V11Z" fill="' + K.green + '" stroke="' + K.green + '" stroke-width="1.5" stroke-linejoin="round"/>' +
      line('M16 24L22 30L33 17', K.dark, 4),
    'ach-all-kinds': diamond(14, 14, 9, K.grey) + diamond(34, 14, 9, '#FACC15') + diamond(14, 34, 9, K.sky) + diamond(34, 34, 8, K.tile, K.red) + dot(34, 34, 2.8, K.red) +
      dot(14, 14, 2.5, K.tile) + line('M30.5 14h7', K.dark, 2) + dot(11, 34, 1.3, K.dark) + dot(14, 34, 1.3, K.dark) + dot(17, 34, 1.3, K.dark),
    'ach-daily-30': calendar(line('M17 30L22 35L31 25', K.green, 4)),
    'ach-record-1000': line('M14 12H8Q8 22 16 22M34 12H40Q40 22 32 22', K.gold, 3) + '<path d="M13 7H35V18Q35 30 24 30Q13 30 13 18Z" fill="' + K.gold + '"/>' + rect(21.5, 29, 5, 8, 0, K.gold) +
      rect(14, 36, 20, 6, 2, K.gold) + star(24, 17, 5, K.dark),

    // ---- states ----
    lock: line('M17 22V16A7 7 0 0 1 31 16V22', K.steel, 4) + rect(12, 21, 24, 19, 4.5, K.steel) + dot(24, 29, 2.8, K.dark) + rect(22.8, 29, 2.4, 6, 1, K.dark),
    secret: line('M17 22V16A7 7 0 0 1 31 16V22', K.mute, 4) + rect(12, 21, 24, 19, 4.5, K.mute) + star(24, 30.5, 5, K.tile)
  };

  function svg(name, size) {
    const body = P[name];
    if (!body) return '';
    const z = size || 44;
    return '<svg class="ts-pic-svg" viewBox="0 0 48 48" width="' + z + '" height="' + z + '" aria-hidden="true">' +
      '<rect x="0" y="0" width="48" height="48" rx="12" fill="' + K.tile + '"/>' + body + '</svg>';
  }

  /** A small round badge over a picture: 'lock' or 'check'. */
  function badge(kind) {
    const body = kind === 'check' ?
      '<circle cx="12" cy="12" r="11" fill="' + K.green + '" stroke="' + K.dark + '" stroke-width="2"/>' + line('M7 12.500L10.5 16L17 8.5', K.dark, 2.8) :
      '<circle cx="12" cy="12" r="11" fill="' + K.mute + '" stroke="' + K.dark + '" stroke-width="2"/>' +
      line('M9 11V9.500A3 3 0 0 1 15 9.500V11', K.ink, 2) + rect(7.5, 11, 9, 7, 1.5, K.ink);
    return '<svg class="ts-badge" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' + body + '</svg>';
  }

  function el(markup) {
    const holder = document.createElement('span');
    holder.innerHTML = markup;
    return holder.firstChild;
  }

  /** The picture in its holder; state: 'locked' greys it and pins a lock, 'done' pins a check. */
  function pic(name, size, state) {
    const box = document.createElement('span');
    box.className = 'ts-pic' + (state ? ' ' + state : '');
    const s = el(svg(name, size) || svg('lock', size));
    box.appendChild(s);
    if (state === 'locked') box.appendChild(el(badge('lock')));
    if (state === 'done') box.appendChild(el(badge('check')));
    return box;
  }

  window.TSArt = { svg: svg, pic: pic, badge: badge, names: Object.keys(P), palette: K };
})();
