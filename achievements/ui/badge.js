// Badges of achievements, drawn as SVG from one template: the frame tells the rarity
// (circle, octagon, shield, star with rays, double frame), a line icon sits in the middle,
// the fill is two tones of the group's palette. Original shapes, no emoji, no text.
(function () {
  // Contours of this module (24×24, stroke only) for what the kit has no icon for.
  var EXTRA = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    shoe: '<path d="M3 15V9l4 1 3 3 6 1a4 4 0 0 1 4 4v1H3zM3 20h18"/>',
    drop: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
    pill: '<rect x="3" y="8" width="18" height="8" rx="4"/><path d="M12 8v8"/>',
    map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"/>',
    coin: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>',
    cup: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M10 17h4"/>',
    sofa: '<path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M3 11h18v6H3zM5 17v2M19 17v2"/>',
    flame: '<path d="M12 3c1 4 5 6 5 11a5 5 0 0 1-10 0c0-3 2-4 2-7 1 1 2 2 2 4 1-2 1-5 1-8z"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6"/>'
  };

  // Two tones per group: a deep fill and a light line. Muted, to sit on the dark base.
  var PALETTES = {
    'Сон': ['#2B2F5C', '#A9B1FF'],
    'Движение': ['#1F4A3A', '#7FE0B4'],
    'Привычки': ['#4A3A1C', '#F2C46B'],
    'Экран': ['#2A3F52', '#8CC8F2'],
    'Места': ['#4A2A3A', '#F29CC0'],
    'Траты': ['#3A4220', '#C8DC7A'],
    'Жизнь': ['#45291F', '#F2A27C'],
    'Игротека': ['#33284A', '#C4A8FF']
  };
  var SPARE = [['#203C44', '#7CD6E6'], ['#43202A', '#F28A9E'], ['#34391F', '#D6E07C'], ['#2E2A44', '#B4A8F2']];

  function palette(group) {
    if (PALETTES[group]) return PALETTES[group];
    var hash = 0;
    String(group || '').split('').forEach(function (ch) { hash = (hash * 31 + ch.charCodeAt(0)) >>> 0; });
    return SPARE[hash % SPARE.length];
  }

  function polygon(points, cx, cy) {
    return points.map(function (p) { return (cx + p[0]).toFixed(1) + ',' + (cy + p[1]).toFixed(1); }).join(' ');
  }

  function ring(count, radius, turn) {
    var out = [];
    for (var i = 0; i < count; i++) {
      var a = (Math.PI * 2 * i) / count + (turn || 0);
      out.push([Math.cos(a) * radius, Math.sin(a) * radius]);
    }
    return out;
  }

  function star(points, outer, inner) {
    var out = [];
    for (var i = 0; i < points * 2; i++) {
      var r = i % 2 ? inner : outer;
      var a = (Math.PI * i) / points - Math.PI / 2;
      out.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return out;
  }

  /** The frame of a rarity as SVG shapes, filled and stroked as given. */
  function frame(rarity, fill, stroke) {
    var common = 'fill="' + fill + '" stroke="' + stroke + '" stroke-width="3" stroke-linejoin="round"';
    switch (rarity) {
      case 'uncommon':
        return '<polygon points="' + polygon(ring(8, 43, Math.PI / 8), 50, 50) + '" ' + common + '/>';
      case 'rare':
        return '<path d="M50 6 L86 18 V48 C86 72 70 86 50 95 C30 86 14 72 14 48 V18 Z" ' + common + '/>';
      case 'epic':
        return '<polygon points="' + polygon(star(12, 47, 38), 50, 50) + '" ' + common + '/>' +
          '<circle cx="50" cy="50" r="30" fill="none" stroke="' + stroke + '" stroke-width="1.5" opacity=".55"/>';
      case 'legendary':
        return '<circle cx="50" cy="50" r="46" fill="none" stroke="' + stroke + '" stroke-width="2.5"/>' +
          '<polygon points="' + polygon(ring(8, 39, Math.PI / 8), 50, 50) + '" ' + common + '/>';
      default:
        return '<circle cx="50" cy="50" r="42" ' + common + '/>';
    }
  }

  function iconPaths(name) {
    if (EXTRA[name]) return EXTRA[name];
    if (window.ui && ui.iconNames.indexOf(name) >= 0) return ui.icon(name).innerHTML;
    return null;
  }

  var iconSequence = 0;

  function attribute(value) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function center(icon, color) {
    if (icon && /[\/.]/.test(icon)) {
      var href = '/' + String(icon).replace(/^\/+/, '');
      var filter = '', definition = '';
      if (/\.svg(?:[?#]|$)/i.test(icon)) {
        // An SVG loaded through <image> cannot inherit this badge's currentColor.
        // Colour its alpha silhouette with the same palette as the inline line icons.
        var id = 'achievement-icon-' + (++iconSequence);
        definition = '<defs><filter id="' + id + '" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">' +
          '<feFlood flood-color="' + attribute(color) + '" result="tone"/>' +
          '<feComposite in="tone" in2="SourceAlpha" operator="in"/></filter></defs>';
        filter = ' filter="url(#' + id + ')"';
      }
      return definition + '<image href="' + attribute(href) + '" x="31" y="31" width="38" height="38" opacity=".9"' + filter + '/>';
    }
    var paths = iconPaths(icon) || iconPaths('star');
    return '<svg x="30" y="30" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="' + color +
      '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
  }

  function pips(count, done, color, dim) {
    if (count < 2) return '';
    var out = '';
    var start = 50 - (count - 1) * 5;
    for (var i = 0; i < count; i++) {
      out += '<circle cx="' + (start + i * 10) + '" cy="82" r="2.6" fill="' + (i < done ? color : 'none') + '" stroke="' + (i < done ? color : dim) + '" stroke-width="1.4"/>';
    }
    return out;
  }

  /**
   * The badge of an item as the engine's view() describes it:
   *   { group, icon, rarity, masked, gotCount, tiers }
   * state: 'got' (coloured) or 'open' (gray outline); a masked item is a silhouette with «?».
   */
  function svg(item, options) {
    options = options || {};
    var size = options.size || 96;
    var head = '<svg class="badge" viewBox="0 0 100 100" width="' + size + '" height="' + size + '" aria-hidden="true">';
    if (item.masked) {
      return head + '<circle cx="50" cy="50" r="42" fill="var(--surface-2)" stroke="var(--line)" stroke-width="3"/>' +
        '<path d="M41 40a9 9 0 1 1 13 8c-3 2-4 3.5-4 7.5M50 64v.5" fill="none" stroke="var(--ink-3)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    }
    var tiers = (item.tiers || []).length || 1;
    var got = item.gotCount || 0;
    var rarity = options.rarity || (got ? (item.tiers[Math.min(got, tiers) - 1] || {}).rarity : item.rarity) || 'common';
    if (got) {
      var tones = palette(item.group);
      return head + frame(rarity, tones[0], tones[1]) + center(item.icon, tones[1]) + pips(tiers, got, tones[1], 'var(--ink-3)') + '</svg>';
    }
    return head + frame(rarity, 'none', 'var(--ink-3)') + center(item.icon, 'var(--ink-3)') + pips(tiers, 0, 'var(--ink-3)', 'var(--ink-3)') + '</svg>';
  }

  var RARITY = { common: 'обычная', uncommon: 'необычная', rare: 'редкая', epic: 'эпическая', legendary: 'легендарная' };

  window.Badge = { svg: svg, palette: palette, rarity: function (r) { return RARITY[r] || r; } };
})();
