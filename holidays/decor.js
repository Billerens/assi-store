// The look of an occasion: which decorations are on today and the CSS that draws them.
// Pure — the engine passes in the texts of decor/*.css and the owner's theme; tests do the same.
//
// The CSS goes either into the shell's decoration layer (theme.decor: drawn after the owner's
// theme, which stays as it is) or, without that layer, into a theme of its own, "holiday", made
// from the owner's theme plus the occasion. Rules every decoration keeps:
//   - a layer that never takes a touch (pointer-events: none), below the sheets of the kit;
//   - colours from the kit's variables; an outline picture is an SVG in a data: URI, and since
//     currentColor does not reach a background, its colour is written in from the tokens here;
//   - movement only for --holiday-motion seconds after a screen opens, then it stands still,
//     and none at all when the phone asks for less motion (prefers-reduced-motion);
//   - no shadows, no emoji.

/** The kit's own colours (ui/kit/kit.css): what a theme does not set. */
var KIT = {
  bg: '#101010',
  surface: '#1A1A1A',
  'surface-2': '#252525',
  ink: '#EDEDED',
  'ink-2': '#A6A6A6',
  'ink-3': '#707070',
  line: '#2E2E2E',
  accent: '#8B7CFF',
  'accent-ink': '#0F0E17',
  'accent-soft': '#24213A',
  danger: '#FF7B72',
  'danger-soft': '#3A1F21',
  ok: '#5FD08A'
};

exports.KIT = KIT;

/**
 * The decorations: what each is called on the screen, which selectors it moves (stopped under
 * reduced motion) and which only flash (hidden under reduced motion). `generated`: drawn here,
 * not from a file.
 */
var DECORS = {
  snow: { title: 'тихий снег', animated: ['body::before'] },
  garland: { title: 'гирлянда в шапке', animated: ['.topbar::after', '.hello::after'] },
  sparks: { title: 'искры от кнопок', transient: ['.btn:active::after'] },
  pancakes: { title: 'блины в пустых местах', animated: [] },
  stars: { title: 'звёзды в фоне', animated: ['.page::before'] },
  petals: { title: 'редкие весенние лепестки', animated: ['body::before'] },
  leaves: { title: 'осенние листья', animated: ['body::before'] },
  fireflies: { title: 'тёплые светлячки', animated: ['body::before'] },
  aurora: { title: 'мягкое северное сияние', animated: ['body::before'] },
  meteors: { title: 'следы метеоров', animated: ['.page::before'] },
  rocket: { title: 'ракета у кнопки чата', animated: ['html::after'] },
  'home-star': { title: 'звезда у заголовка главного экрана', animated: [] },
  pumpkins: { title: 'тыквы в углу', animated: ['.page::after'] },
  flicker: { title: 'мягкий отклик карточек', animated: ['.card:active'] },
  confetti: { title: 'конфетти при первом открытии', transient: ['body::after'], generated: true }
};

exports.DECORS = DECORS;

/** Outline pictures, drawn for this module: { box, width, d }. */
var SHAPES = {
  star: { box: '0 0 24 24', d: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>' },
  pumpkin: {
    box: '0 0 24 24',
    d: '<path d="M12 8c-4.4 0-8 2.6-8 6s3.6 6 8 6 8-2.6 8-6-3.6-6-8-6z"/>' +
      '<path d="M12 8c-1.8 0-3 2.7-3 6s1.2 6 3 6 3-2.7 3-6-1.2-6-3-6z"/>' +
      '<path d="M12 8V5.6c0-1 .6-1.8 1.6-2.1M13.2 5.3c1.4-.7 2.8-.1 3.3 1.1"/>'
  },
  rocket: {
    box: '0 0 24 24',
    d: '<path d="M12 2.8c2.9 1.9 4.4 5.2 4.4 9v3.4H7.6v-3.4c0-3.8 1.5-7.1 4.4-9z"/>' +
      '<circle cx="12" cy="9.6" r="1.6"/>' +
      '<path d="M7.6 12.6L5 15.2v3.4l2.6-1.8M16.4 12.6l2.6 2.6v3.4l-2.6-1.8M10.2 18.4c.4 1.3 1 2.1 1.8 2.8.8-.7 1.4-1.5 1.8-2.8"/>'
  },
  pancakes: {
    box: '0 0 24 24',
    d: '<ellipse cx="12" cy="8.5" rx="8" ry="2.6"/>' +
      '<path d="M4 8.5v2.4c0 1.4 3.6 2.6 8 2.6s8-1.2 8-2.6V8.5M4 10.9v2.4c0 1.4 3.6 2.6 8 2.6s8-1.2 8-2.6v-2.4"/>' +
      '<path d="M9.5 8.3c1.3.6 3.7.6 5 0M10 4.8c.6-.7-.4-1.3.2-2M14 4.8c.6-.7-.4-1.3.2-2"/>'
  },
  'garland-wire': { box: '0 0 48 18', width: 1.2, d: '<path d="M0 2.5c8 6 16 6 24 0s16-6 24 0"/>' },
  'garland-bulb': {
    box: '0 0 48 18',
    width: 1.4,
    d: '<path d="M12 6.9v1.4"/><path d="M12 8.6c-1.5 0-2.5 1.6-2.5 3.3 0 1.5 1.1 2.5 2.5 2.5s2.5-1 2.5-2.5c0-1.7-1-3.3-2.5-3.3z"/>'
  }
};

exports.SHAPES = SHAPES;

var SAFE_COLOR = /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,\s%]+\)|hsla?\([0-9.,\s%a-z]+\)|[a-zA-Z]+)$/;

function colorOf(colors, token) {
  var value = colors && colors[token];
  if (value === undefined || value === null || !SAFE_COLOR.test(String(value).trim())) value = KIT[token];
  if (value === undefined && SAFE_COLOR.test(token) && token.charAt(0) === '#') value = token;
  return String(value || KIT.ink).trim();
}

/** url("data:image/svg+xml,…") of an outline shape in a colour; no ';' and no '#' inside. */
exports.svgUrl = function (name, color, opacity) {
  var shape = SHAPES[name];
  if (!shape) throw new Error('Нет рисунка ' + name);
  var markup = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + shape.box + '" fill="none" stroke="' + color +
    '" stroke-width="' + (shape.width || 1.6) + '" stroke-linecap="round" stroke-linejoin="round"' +
    (opacity !== undefined && opacity < 1 ? ' stroke-opacity="' + opacity + '"' : '') + '>' + shape.d + '</svg>';
  return 'url("data:image/svg+xml,' + encodeURIComponent(markup) + '")';
};

/** A decor file with its pictures put in: every svg(shape, token[, opacity]) becomes a data: URI. */
exports.render = function (source, colors, options) {
  options = options || {};
  return String(source || '').replace(/scatter\(([a-z-]+)\)/g, function (all, kind) {
    return exports.scatter(kind, options.seed || 7, options.particleCount, colors);
  }).replace(/svg\(\s*([a-z-]+)\s*,\s*([#a-z0-9-]+)\s*(?:,\s*([0-9.]+)\s*)?\)/g, function (all, shape, token, opacity) {
    return exports.svgUrl(shape, colorOf(colors, token), opacity === undefined ? undefined : Number(opacity));
  });
};

function rgb(hex) {
  var value = String(hex).replace('#', '');
  if (value.length === 3) value = value.charAt(0) + value.charAt(0) + value.charAt(1) + value.charAt(1) + value.charAt(2) + value.charAt(2);
  return [0, 2, 4].map(function (at) { return parseInt(value.slice(at, at + 2), 16); });
}

function hex(parts) {
  return '#' + parts.map(function (part) {
    var text = Math.max(0, Math.min(255, Math.round(part))).toString(16).toUpperCase();
    return text.length < 2 ? '0' + text : text;
  }).join('');
}

function isHex(value) {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(value || '').trim());
}

exports.isHex = isHex;

/** a·share + b·(1 − share), as the settings screen mixes tints. */
exports.mix = function (a, b, share) {
  var x = rgb(a);
  var y = rgb(b);
  return hex(x.map(function (part, index) { return part * share + y[index] * (1 - share); }));
};

/** Is a colour light enough for dark text on it? */
exports.bright = function (color) {
  var parts = rgb(color);
  return (parts[0] * 299 + parts[1] * 587 + parts[2] * 114) / 1000 > 140;
};

/** The accent of an occasion as the three tokens a theme needs, matched to the background. */
exports.accentTokens = function (accent, bg) {
  if (!isHex(accent)) return {};
  var base = isHex(bg) ? bg : KIT.bg;
  return {
    accent: accent.toUpperCase(),
    'accent-soft': exports.mix(accent, base, 0.2),
    'accent-ink': exports.bright(accent) ? '#0F0E17' : '#FFFFFF'
  };
};

/** A repeatable sequence of numbers in [0, 1): the same confetti for the same day. */
function random(seed) {
  var state = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return function () {
    state = (state * 48271) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

/** One finite SVG field, never a repeated tile. The daily seed changes positions, sizes and angles. */
exports.scatter = function (kind, seed, count, colors) {
  var salt = 0;
  for (var k = 0; k < kind.length; k++) salt = salt * 31 + kind.charCodeAt(k);
  var next = random(seed + salt);
  count = Math.max(8, Math.min(56, Math.round(Number(count) || 28)));
  var elements = [];
  var positions = [];
  var accent = colorOf(colors, 'accent');
  var ink = colorOf(colors, 'ink');
  if (kind === 'garland') {
    elements.push('<path d="M-5 8Q250 38 500 8T1005 8" fill="none" stroke="' + colorOf(colors, 'ink-3') + '" stroke-opacity=".5"/>');
    for (var lamp = 24; lamp < 990; lamp += 52 + Math.round(next() * 42)) {
      var drop = lamp <= 500 ? 8 + 24 * (lamp / 500) * (1 - lamp / 500) : 8 - 24 * ((lamp - 500) / 500) * (1 - (lamp - 500) / 500);
      elements.push('<path d="M' + lamp + ' ' + drop.toFixed(1) + 'v5" stroke="' + colorOf(colors, 'ink-3') + '"/>');
      elements.push('<ellipse cx="' + lamp + '" cy="' + (drop + 8).toFixed(1) + '" rx="2.2" ry="3.5" fill="' +
        (next() < .65 ? accent : colorOf(colors, 'ok')) + '" opacity="' + (.45 + next() * .45).toFixed(2) + '"/>');
    }
  } else if (kind === 'aurora') {
    for (var band = 0; band < 3; band++) {
      var y = Math.round(80 + next() * 250);
      elements.push('<path d="M-100 ' + y + ' C180 ' + (y - 120) + ' 380 ' + (y + 180) + ' 600 ' + y +
        ' S900 ' + (y - 90) + ' 1120 ' + (y + 50) + '" stroke="' + accent + '" stroke-width="' +
        Math.round(50 + next() * 75) + '" fill="none" stroke-opacity=".055"/>');
    }
  } else {
    if (kind === 'meteors') count = Math.min(count, 8);
    for (var i = 0; i < count; i++) {
      var x, y;
      // Reject close neighbours so particles remain sparse without becoming a lattice.
      for (var attempt = 0; attempt < 30; attempt++) {
        x = Math.round(12 + next() * 976); y = Math.round(12 + next() * 976);
        if (positions.every(function (p) { return Math.pow(p[0] - x, 2) + Math.pow(p[1] - y, 2) > 2304; })) break;
      }
      positions.push([x, y]);
      var size = (1 + next() * 2.5).toFixed(1);
      var alpha = (.16 + next() * .35).toFixed(2);
      var angle = Math.round(next() * 330);
      var color = next() > .4 ? ink : accent;
      var shape;
      if (kind === 'petals') shape = '<ellipse rx="' + (3 + next() * 4).toFixed(1) + '" ry="' + size + '" fill="' + accent + '"/>';
      else if (kind === 'leaves') shape = '<path d="M-6 5Q-9-7 7-6Q10 7-6 5ZM-6 5L5-4" fill="none" stroke="' + accent + '" stroke-width="1.4"/>';
      else if (kind === 'meteors') shape = '<path d="M0 0L' + Math.round(12 + next() * 24) + ' -18" fill="none" stroke="' + color + '" stroke-width="1.3" stroke-linecap="round"/>';
      else if (kind === 'stars' && next() > .65) shape = '<path d="M-3 0H3M0-3V3" stroke="' + color + '" stroke-width="1"/>';
      else shape = '<circle r="' + size + '" fill="' + (kind === 'fireflies' ? accent : color) + '"/>';
      if (kind === 'fireflies') shape += '<circle r="' + (Number(size) * 3).toFixed(1) + '" fill="' + accent + '" opacity=".12"/>';
      elements.push('<g transform="translate(' + x + ' ' + y + ') rotate(' + angle + ')" opacity="' + alpha + '">' + shape + '</g>');
    }
  }
  return 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 ' + (kind === 'garland' ? '40' : '1000') + '">' + elements.join('') + '</svg>') + '")';
};

/** Confetti: `count` small rectangles falling once for --holiday-confetti seconds, then gone. */
exports.confetti = function (count, seed) {
  var colors = ['var(--accent)', 'var(--ok)', 'var(--danger)', 'var(--ink)', 'var(--ink-2)', 'var(--accent)'];
  var next = random(seed || 7);
  var images = [];
  var sizes = [];
  var from = [];
  count = Math.max(1, Math.min(80, Math.round(Number(count) || 30)));
  for (var i = 0; i < count; i++) {
    var color = colors[i % colors.length];
    images.push('linear-gradient(' + color + ', ' + color + ')');
    var wide = next() < 0.5;
    sizes.push((wide ? 9 + Math.floor(next() * 5) : 4 + Math.floor(next() * 3)) + 'px ' + (wide ? 4 + Math.floor(next() * 3) : 9 + Math.floor(next() * 6)) + 'px');
    var x = Math.round(next() * 100);
    from.push(x + '% ' + Math.round(next() * 30) + 'vh');
  }
  return [
    'body::after {',
    '  content: "";',
    '  position: fixed;',
    '  inset: 0;',
    '  z-index: 45;',
    '  pointer-events: none;',
    '  background-image: ' + images.join(', ') + ';',
    '  background-size: ' + sizes.join(', ') + ';',
    '  background-repeat: no-repeat;',
    '  background-position: ' + from.join(', ') + ';',
    '  opacity: 0;',
    '  animation: holiday-confetti var(--holiday-confetti) cubic-bezier(.25, .6, .45, 1) 1 both;',
    '}',
    '',
    '@keyframes holiday-confetti {',
    '  from {',
    '    transform: translate3d(0, -35vh, 0) rotate(-2deg);',
    '    opacity: 1;',
    '  }',
    '  80% {',
    '    opacity: 1;',
    '  }',
    '  to {',
    '    transform: translate3d(0, 115vh, 0) rotate(3deg);',
    '    opacity: 0;',
    '  }',
    '}'
  ].join('\n');
};

/** The reduced-motion block for the decorations in use: moving ones stand still, flashes are hidden. */
exports.reducedMotion = function (names) {
  var still = [];
  var hidden = [];
  (names || []).forEach(function (name) {
    var known = DECORS[name];
    if (!known) return;
    (known.animated || []).forEach(function (selector) { if (still.indexOf(selector) < 0) still.push(selector); });
    (known.transient || []).forEach(function (selector) { if (hidden.indexOf(selector) < 0) hidden.push(selector); });
  });
  var lines = ['@media (prefers-reduced-motion: reduce) {'];
  if (still.length) lines.push('  ' + still.join(', ') + ' {', '    animation: none !important;', '  }');
  if (hidden.length) lines.push('  ' + hidden.join(', ') + ' {', '    display: none !important;', '  }');
  if (!still.length && !hidden.length) lines.push('  :root {', '    --holiday-motion: 0s;', '  }');
  lines.push('}');
  return lines.join('\n');
};

/**
 * What the day looks like: from the active occasions (calendar.activeOn, most important first)
 * to { key, id, title, anchor, accent, layers, eggs, strength, solemn } — or null for no change.
 * options: { strength: 'full'|'color'|'off', powerSaveMode, powerSave, confetti (allowed now),
 * known: names of the decorations there are }.
 */
exports.plan = function (active, options) {
  options = options || {};
  var strength = options.powerSaveMode ? (options.powerSave || 'color') : (options.strength || 'full');
  if (strength === 'off') return null;
  var known = options.known || Object.keys(DECORS);
  var usable = function (name) { return known.indexOf(name) >= 0 && (name !== 'confetti' || options.confetti); };
  // Only occasions that change the look count here: a day with Easter and a friend's birthday is
  // Easter's look, whichever of them is "more important" in the calendar.
  var shown = (active || []).filter(function (item) {
    var occasion = item.occasion || {};
    if (item.consent === false) return false;
    if (isHex(occasion.accent)) return true;
    if (strength !== 'full' || occasion.solemn) return false;
    return [].concat(occasion.decor || []).some(usable) || (item.egg && [].concat(occasion.egg || []).some(usable));
  });
  if (!shown.length) return null;
  var main = shown[0];
  var solemn = Boolean(main.occasion && main.occasion.solemn);
  var accent = null;
  shown.forEach(function (item) {
    if (!accent && item.occasion && isHex(item.occasion.accent)) accent = item.occasion.accent;
  });
  var layers = [];
  var eggs = [];
  if (strength === 'full' && !solemn) {
    shown.forEach(function (item) {
      var occasion = item.occasion || {};
      if (occasion.solemn) return;
      [].concat(occasion.decor || []).forEach(function (name) {
        if (name === 'confetti' && !options.confetti) return;
        if (known.indexOf(name) >= 0 && layers.indexOf(name) < 0) layers.push(name);
      });
      if (!item.egg) return;
      [].concat(occasion.egg || []).forEach(function (name) {
        if (name === 'confetti' && !options.confetti) return;
        if (known.indexOf(name) >= 0 && eggs.indexOf(name) < 0 && layers.indexOf(name) < 0) eggs.push(name);
      });
    });
  }
  if (!accent && !layers.length && !eggs.length) return null;
  return {
    key: main.id + '@' + main.anchor,
    id: main.id,
    title: main.title,
    anchor: main.anchor,
    accent: accent,
    layers: layers,
    eggs: eggs,
    strength: strength,
    solemn: solemn
  };
};

/**
 * The CSS of a plan. options: { files: {name: css text}, tokens: the owner's colours (with the
 * kit's for what the theme leaves), motionSeconds, confettiSeconds, confettiPieces, seed,
 * withAccent: put the accent tokens in a :root block (the decoration layer; a theme carries
 * them in its own tokens instead) }.
 */
exports.css = function (plan, options) {
  if (!plan) return '';
  options = options || {};
  var files = options.files || {};
  var tokens = {};
  Object.keys(KIT).forEach(function (key) { tokens[key] = KIT[key]; });
  Object.keys(options.tokens || {}).forEach(function (key) { tokens[key] = options.tokens[key]; });
  var accent = plan.accent ? exports.accentTokens(plan.accent, tokens.bg) : {};
  Object.keys(accent).forEach(function (key) { tokens[key] = accent[key]; });

  var root = [
    '  --holiday-motion: ' + Math.max(0, Number(options.motionSeconds === undefined ? 6 : options.motionSeconds)) + 's;',
    '  --holiday-confetti: ' + Math.max(0, Number(options.confettiSeconds === undefined ? 4 : options.confettiSeconds)) + 's;'
  ];
  if (options.withAccent) {
    Object.keys(accent).forEach(function (key) { root.push('  --' + key + ': ' + accent[key] + ';'); });
  }
  var parts = ['/* holidays: ' + plan.key + ' */', ':root {\n' + root.join('\n') + '\n}'];
  var used = [];
  plan.layers.concat(plan.eggs).forEach(function (name) {
    if (name === 'confetti') {
      parts.push(exports.confetti(Math.max(1, Number(options.confettiPieces) || 30), options.seed || 7));
      used.push(name);
      return;
    }
    if (!files[name]) return;
    parts.push('/* ' + name + ' */\n' + exports.render(files[name], tokens, options).trim());
    used.push(name);
  });
  parts.push(exports.reducedMotion(used));
  if (Number(options.motionSeconds) === 0) {
    // Also stop tap animations when the owner explicitly disables motion.
    parts.push(exports.reducedMotion(used).replace('@media (prefers-reduced-motion: reduce)', '@media all'));
  }
  return parts.join('\n\n') + '\n';
};

/**
 * The fallback "holiday" theme: the owner's theme (its tokens and css) with the occasion's
 * accent and the decoration CSS after it. `previous` is kept in the file, so a lost state can
 * still put the owner's theme back.
 */
exports.theme = function (base, plan, css, previous) {
  base = base || {};
  var tokens = {};
  Object.keys(base.tokens || {}).forEach(function (key) { tokens[key] = base.tokens[key]; });
  var accent = plan.accent ? exports.accentTokens(plan.accent, tokens.bg || KIT.bg) : {};
  Object.keys(accent).forEach(function (key) { tokens[key] = accent[key]; });
  var own = base.css ? String(base.css).trim() + '\n\n' : '';
  return {
    name: 'Праздник: ' + plan.title,
    tokens: tokens,
    css: own + (css || ''),
    holiday: plan.key,
    previous: previous || ''
  };
};

/** Words for the screen: what the plan puts on. */
exports.describe = function (plan) {
  if (!plan) return '';
  var words = [];
  if (plan.accent) words.push('праздничный цвет');
  plan.layers.concat(plan.eggs).forEach(function (name) { if (DECORS[name]) words.push(DECORS[name].title); });
  return words.join(', ');
};
