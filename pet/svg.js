// The creature (and its room) as SVG text with its CSS animation inside. Pure: the engine makes
// it for the home card and the agent, the screen asks the engine for it.
var Shapes = require('./shapes.js');

function esc(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Colour tokens of the shapes: the palette, the theme accent on screen, the room's kit colours. */
function colour(value, colors, css) {
  if (value === 'BODY') return css ? 'var(--accent, ' + colors.body + ')' : colors.body;
  if (value === 'DARK') return css ? 'color-mix(in srgb, var(--accent, ' + colors.body + ') 62%, #000)' : colors.dark;
  if (value === 'WALL') return 'var(--surface-2, #252525)';
  if (value === 'FLOOR') return 'var(--surface, #1A1A1A)';
  if (value === 'LINE') return 'var(--line, #2E2E2E)';
  if (value === 'DOOR') return 'var(--surface, #1A1A1A)';
  if (value === 'RUG') return 'var(--accent-soft, #24213A)';
  return value;
}

function style(p, colors, css) {
  var parts = [];
  parts.push('fill: ' + (p.fill === undefined ? 'none' : colour(p.fill, colors, css)));
  if (p.fill === 'DARK' && css) parts.unshift('fill: ' + colors.dark);
  if (p.stroke) {
    if (p.stroke === 'DARK' && css) parts.push('stroke: ' + colors.dark);
    parts.push('stroke: ' + colour(p.stroke, colors, css));
    parts.push('stroke-width: ' + (p.sw || 1));
    if (p.cap) parts.push('stroke-linecap: ' + p.cap + '; stroke-linejoin: ' + p.cap);
    else parts.push('stroke-linejoin: round');
  }
  if (p.op !== undefined) parts.push('opacity: ' + p.op);
  return parts.join('; ');
}

function transform(tf) {
  if (!tf) return '';
  var out = [];
  if (tf.x || tf.y) out.push('translate(' + tf.x + ' ' + tf.y + ')');
  if (tf.rot) out.push('rotate(' + tf.rot + ' ' + (tf.ox || 0) + ' ' + (tf.oy || 0) + ')');
  if (tf.s && tf.s !== 1) out.push('translate(' + (tf.ox || 0) + ' ' + (tf.oy || 0) + ') scale(' + tf.s + ') translate(' + -(tf.ox || 0) + ' ' + -(tf.oy || 0) + ')');
  return out.length ? ' transform="' + out.join(' ') + '"' : '';
}

function node(p, colors, css) {
  var cls = p.cls ? ' class="' + esc(p.cls) + '"' : '';
  if (p.t === 'g') {
    var kids = p.kids.map(function (k) { return node(k, colors, css); }).join('');
    if (!p.clip) return '<g' + cls + transform(p.tf) + '>' + kids + '</g>';
    // The id is made of the clip's own numbers: two pictures on one page that share an id share
    // the shape too, so whichever <clipPath> the page picks is the right one.
    var c = p.clip;
    var id = ('pt-clip-' + round(c.cx) + '-' + round(c.cy) + '-' + round(c.rx) + '-' + round(c.ry)).replace(/\./g, '_');
    return '<clipPath id="' + id + '"><ellipse cx="' + round(c.cx) + '" cy="' + round(c.cy) + '" rx="' + round(c.rx) + '" ry="' + round(c.ry) + '"/></clipPath>' +
      '<g' + cls + transform(p.tf) + ' clip-path="url(#' + id + ')">' + kids + '</g>';
  }
  if (p.t === 'ellipse') {
    return '<ellipse' + cls + ' cx="' + round(p.cx) + '" cy="' + round(p.cy) + '" rx="' + round(p.rx) + '" ry="' + round(p.ry) + '" style="' + style(p, colors, css) + '"/>';
  }
  return '<path' + cls + ' d="' + p.d + '" style="' + style(p, colors, css) + '"/>';
}

function round(n) {
  return String(Math.round(n * 10) / 10);
}

/** The CSS of the animations, one declaration a line. blinkSeconds: 3–7, chosen by the caller. */
function css(blinkSeconds) {
  var lines = [
    '.pet-svg .pt-blink {',
    '  transform-box: fill-box;',
    '  transform-origin: 50% 0%;',
    '  transform: scaleY(0);',
    '  animation: pt-blink ' + blinkSeconds + 's infinite;',
    '}',
    '.pet-svg .pt-m-blink-slow .pt-blink {',
    '  animation-name: pt-blink-slow;',
    '}',
    '.pet-svg .pt-m-perky .pt-blink {',
    '  animation-duration: ' + Math.max(2.5, blinkSeconds - 1.5) + 's;',
    '}',
    '.pet-svg .pt-m-sleep .pt-blink, .pet-svg .pt-m-drink .pt-blink {',
    '  animation: none;',
    '}',
    '.pet-svg .pt-body {',
    '  transform-origin: 160px 286px;',
    '  animation: pt-breath 4s ease-in-out infinite;',
    '}',
    '.pet-svg .pt-m-breath-slow .pt-body, .pet-svg .pt-m-sleep .pt-body {',
    '  animation-duration: 6.5s;',
    '}',
    '.pet-svg .pt-m-yawn .pt-body {',
    '  animation: pt-yawn 5s ease-in-out infinite;',
    '}',
    '.pet-svg .pt-all {',
    '  transform-origin: 160px 296px;',
    '}',
    '.pet-svg .pt-m-sway {',
    '  animation: pt-sway 6s ease-in-out infinite;',
    '}',
    '.pet-svg .pt-m-bounce {',
    '  animation: pt-bounce 3s ease-in-out infinite;',
    '}',
    '.pet-svg .pt-m-perky {',
    '  animation: pt-perky 4s ease-in-out infinite;',
    '}',
    '.pet-svg .pt-m-shift {',
    '  animation: pt-shift 1.8s ease-in-out infinite alternate;',
    '}',
    '.pet-svg .pt-m-nod {',
    '  animation: pt-nod 1.2s ease-in-out 2;',
    '}',
    '.pet-svg .pt-m-drink {',
    '  animation: pt-drink 1.4s ease-in-out 3;',
    '}',
    '.pet-svg .pt-m-look .pt-pupils, .pet-svg .pt-m-shift .pt-pupils {',
    '  animation: pt-look 5s ease-in-out infinite;',
    '}',
    '.pet-svg .pt-m-shift .pt-pupils {',
    '  animation-name: pt-aside;',
    '}',
    '.pet-svg .pt-z {',
    '  animation: pt-float 3s ease-in-out infinite;',
    '}',
    '.pet-svg .pt-z1 {',
    '  animation-delay: .8s;',
    '}',
    '.pet-svg .pt-z2 {',
    '  animation-delay: 1.6s;',
    '}',
    '.pet-svg .pt-steam {',
    '  animation: pt-steam 2.6s ease-in-out infinite;',
    '}',
    '.pet-svg.jump .pt-all {',
    '  animation: pt-jump .5s ease-out 1;',
    '}',
    '.pet-svg.turn .pt-all {',
    '  animation: pt-turn .7s ease-in-out 1;',
    '}',
    '.pet-svg.wink .pt-blink {',
    '  animation: pt-blink-once .35s 1;',
    '}',
    '@keyframes pt-blink {',
    '  0%, 93%, 100% {',
    '    transform: scaleY(0);',
    '  }',
    '  96% {',
    '    transform: scaleY(1);',
    '  }',
    '}',
    '@keyframes pt-blink-slow {',
    '  0%, 82%, 100% {',
    '    transform: scaleY(0);',
    '  }',
    '  88%, 94% {',
    '    transform: scaleY(1);',
    '  }',
    '}',
    '@keyframes pt-blink-once {',
    '  0%, 100% {',
    '    transform: scaleY(0);',
    '  }',
    '  50% {',
    '    transform: scaleY(1);',
    '  }',
    '}',
    '@keyframes pt-breath {',
    '  0%, 100% {',
    '    transform: scaleY(1);',
    '  }',
    '  50% {',
    '    transform: scaleY(1.03);',
    '  }',
    '}',
    '@keyframes pt-yawn {',
    '  0%, 60%, 100% {',
    '    transform: scaleY(1);',
    '  }',
    '  75% {',
    '    transform: scaleY(1.07) scaleX(.98);',
    '  }',
    '}',
    '@keyframes pt-sway {',
    '  0%, 100% {',
    '    transform: rotate(-1.6deg);',
    '  }',
    '  50% {',
    '    transform: rotate(1.6deg);',
    '  }',
    '}',
    '@keyframes pt-bounce {',
    '  0%, 55%, 100% {',
    '    transform: translateY(0);',
    '  }',
    '  65% {',
    '    transform: translateY(-14px);',
    '  }',
    '  75% {',
    '    transform: translateY(0);',
    '  }',
    '  85% {',
    '    transform: translateY(-6px);',
    '  }',
    '}',
    '@keyframes pt-perky {',
    '  0%, 80%, 100% {',
    '    transform: translateY(0);',
    '  }',
    '  88% {',
    '    transform: translateY(-7px);',
    '  }',
    '}',
    '@keyframes pt-shift {',
    '  from {',
    '    transform: translateX(-5px);',
    '  }',
    '  to {',
    '    transform: translateX(5px);',
    '  }',
    '}',
    '@keyframes pt-nod {',
    '  0%, 100% {',
    '    transform: rotate(0deg);',
    '  }',
    '  35% {',
    '    transform: rotate(3deg);',
    '  }',
    '  65% {',
    '    transform: rotate(-1deg);',
    '  }',
    '}',
    '@keyframes pt-drink {',
    '  0%, 100% {',
    '    transform: rotate(0deg);',
    '  }',
    '  50% {',
    '    transform: rotate(-4deg) translateY(-3px);',
    '  }',
    '}',
    '@keyframes pt-look {',
    '  0%, 100% {',
    '    transform: translateX(0);',
    '  }',
    '  25% {',
    '    transform: translateX(-6px);',
    '  }',
    '  75% {',
    '    transform: translateX(6px);',
    '  }',
    '}',
    '@keyframes pt-aside {',
    '  0%, 100% {',
    '    transform: translateX(0);',
    '  }',
    '  50% {',
    '    transform: translateX(3px);',
    '  }',
    '}',
    '@keyframes pt-float {',
    '  0% {',
    '    transform: translateY(6px);',
    '    opacity: 0;',
    '  }',
    '  40% {',
    '    opacity: 1;',
    '  }',
    '  100% {',
    '    transform: translateY(-10px);',
    '    opacity: 0;',
    '  }',
    '}',
    '@keyframes pt-steam {',
    '  0% {',
    '    transform: translateY(0);',
    '    opacity: .8;',
    '  }',
    '  100% {',
    '    transform: translateY(-8px);',
    '    opacity: 0;',
    '  }',
    '}',
    '@keyframes pt-jump {',
    '  0%, 100% {',
    '    transform: translateY(0);',
    '  }',
    '  40% {',
    '    transform: translateY(-20px);',
    '  }',
    '}',
    '@keyframes pt-turn {',
    '  0%, 100% {',
    '    transform: scaleX(1);',
    '  }',
    '  50% {',
    '    transform: scaleX(-1);',
    '  }',
    '}',
    // At rest (the class "rest" on the svg) nothing moves: a picture that is always on a screen,
    // like the home card, moves for a few seconds now and then, because an endless animation
    // keeps the phone drawing the whole screen on every frame.
    '.pet-svg.rest * {',
    '  animation-play-state: paused !important;',
    '}',
    '.pet-svg.rest .pt-blink {',
    '  animation: none !important;',
    '}',
    // Less motion asked: only the blink stays.
    '@media (prefers-reduced-motion: reduce) {',
    '  .pet-svg .pt-anim, .pet-svg .pt-pupils, .pet-svg.jump .pt-all, .pet-svg.turn .pt-all {',
    '    animation: none !important;',
    '  }',
    '}'
  ];
  return lines.join('\n');
}
exports.css = css;

/**
 * SVG text of a look. opts: { room: bool, night: bool, shelf: [items], size (px or null — fluid),
 * blinkSeconds (3–7), label, still: bool (no <style>, no animation-only shapes) }.
 */
exports.render = function (look, opts) {
  opts = opts || {};
  var colors = look.colors || { body: '#7E9C78', dark: '#5D7858' };
  var accent = Boolean(colors.css) && !opts.still;
  var prims = (opts.room ? Shapes.room({ night: opts.night, shelf: opts.shelf }) : []).concat(Shapes.creature(look));
  var strip = function (list) {
    return list.filter(function (p) { return !(opts.still && p.anim); }).map(function (p) {
      if (p.t !== 'g') return p;
      var copy = {};
      Object.keys(p).forEach(function (k) { copy[k] = p[k]; });
      copy.kids = strip(p.kids);
      return copy;
    });
  };
  var size = opts.size ? ' width="' + opts.size + '" height="' + opts.size + '"' : '';
  var blink = opts.blinkSeconds || 4.5;
  return '<svg class="pet-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320"' + size + ' role="img" aria-label="' + esc(opts.label || 'Питомец') + '">' +
    (opts.still ? '' : '<style>' + css(blink) + '</style>') +
    strip(prims).map(function (p) { return node(p, colors, accent); }).join('') + '</svg>';
};
