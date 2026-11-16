// The creature of «Питомец» as Жизнь-RPG draws it: a drop-shaped body wider below, two oval legs,
// big eyes with a glint, short brows, no mouth; the stem on top shows the stage of growth.
// Original art from simple shapes. Plain script: window.Creature.svg(look, options) → SVG text.
(function () {
  var PALETTES = {
    moss: { body: '#7E9C78', dark: '#5D7858' },
    'мох': { body: '#7E9C78', dark: '#5D7858' },
    clay: { body: '#C2906F', dark: '#966A4F' },
    'глина': { body: '#C2906F', dark: '#966A4F' },
    dusk: { body: '#8E88C4', dark: '#69639D' },
    'сумерки': { body: '#8E88C4', dark: '#69639D' }
  };
  var LEAF = '#79B072';
  var LEAF_DARK = '#4F8049';

  function leaf(x, y, angle, size) {
    var s = size || 1;
    return '<path transform="translate(' + x + ' ' + y + ') rotate(' + angle + ') scale(' + s + ')" d="M0 0 C 6 -10, 20 -12, 26 -4 C 18 4, 6 6, 0 0 Z" ' +
      'fill="' + LEAF + '" stroke="' + LEAF_DARK + '" stroke-width="1.5"/>';
  }

  function stem(stage) {
    var out = '<path d="M100 60 C 100 50, 97 40, 100 26" fill="none" stroke="' + LEAF_DARK + '" stroke-width="4" stroke-linecap="round"/>';
    if (stage === 0) return out + leaf(100, 30, -30, 0.7);
    out += leaf(100, 34, -25, 1) + leaf(100, 34, 205, 1);
    if (stage === 2) out += leaf(99, 46, -5, 0.8) + leaf(99, 46, 185, 0.8);
    if (stage === 3) {
      out += '<ellipse cx="100" cy="20" rx="7" ry="10" fill="#C77E9C" stroke="#9A5A75" stroke-width="1.5"/>' +
        '<path d="M94 25 L100 31 L106 25" fill="none" stroke="' + LEAF_DARK + '" stroke-width="2" stroke-linejoin="round"/>';
    }
    if (stage >= 4) {
      for (var i = 0; i < 5; i++) {
        var a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        out += '<circle cx="' + (100 + Math.cos(a) * 9).toFixed(1) + '" cy="' + (19 + Math.sin(a) * 9).toFixed(1) + '" r="6.5" fill="#E6C46C" stroke="#B8923F" stroke-width="1.2"/>';
      }
      out += '<circle cx="100" cy="19" r="5" fill="#C98A3E"/>';
    }
    return out;
  }

  function backpack() {
    return '<g class="trait-backpack">' +
      '<rect x="146" y="104" width="38" height="54" rx="10" fill="#8B6F50" stroke="#65503A" stroke-width="2"/>' +
      '<rect x="152" y="118" width="26" height="18" rx="3" fill="#D8C9A3" stroke="#65503A" stroke-width="1.5"/>' +
      '<path d="M158 122 L162 132 L168 124 L173 131" fill="none" stroke="#65503A" stroke-width="1.5" stroke-linejoin="round"/>' +
      '</g>';
  }

  function strap() {
    return '<path d="M132 84 C 140 104, 148 124, 150 150" fill="none" stroke="#65503A" stroke-width="5" stroke-linecap="round"/>';
  }

  function item(slot) {
    if (slot === 'neck') {
      return '<path d="M44 146 C 70 160, 130 160, 156 146 L 156 158 C 130 170, 70 170, 44 158 Z" fill="#C8564B" stroke="#933B33" stroke-width="1.5"/>' +
        '<path d="M128 160 L 136 184 L 146 182 L 140 158" fill="#C8564B" stroke="#933B33" stroke-width="1.5" stroke-linejoin="round"/>';
    }
    if (slot === 'head') {
      return '<ellipse cx="100" cy="66" rx="44" ry="7" fill="#9C8A5E" stroke="#6E6040" stroke-width="1.5"/>' +
        '<path d="M74 66 C 76 50, 90 44, 100 44 C 110 44, 124 50, 126 66 Z" fill="#B4A270" stroke="#6E6040" stroke-width="1.5"/>' +
        '<path d="M75 60 L 125 60" stroke="#6E6040" stroke-width="3"/>';
    }
    if (slot === 'hand') {
      return '<g transform="translate(22 150)"><path d="M0 -18 L 0 -8" stroke="#555" stroke-width="2"/>' +
        '<rect x="-9" y="-8" width="18" height="22" rx="4" fill="#F0D27A" stroke="#7A6532" stroke-width="2"/>' +
        '<path d="M-9 -2 H 9 M-9 8 H 9" stroke="#7A6532" stroke-width="1.5"/></g>';
    }
    return '';
  }

  function nightcap() {
    return '<path d="M70 72 C 80 46, 120 40, 140 54 C 150 62, 160 70, 168 86 L 158 92 C 150 80, 140 72, 130 72 Z" fill="#5E6FA8" stroke="#3F4C7A" stroke-width="1.5"/>' +
      '<circle cx="164" cy="92" r="7" fill="#E9E4D4" stroke="#B0A990" stroke-width="1.2"/>' +
      '<path d="M66 74 C 90 64, 120 64, 134 72" fill="none" stroke="#E9E4D4" stroke-width="7" stroke-linecap="round"/>';
  }

  /**
   * look: { stageIndex (0–4), traits: ['backpack', 'sturdy', 'nightcap'] }
   * options: { size, palette, items: [{ slot }], sleeping, accent }
   */
  function svg(look, options) {
    look = look || {};
    options = options || {};
    var traits = look.traits || [];
    var size = options.size || 160;
    var colors = PALETTES[options.palette] || { body: 'var(--accent)', dark: 'color-mix(in srgb, var(--accent) 62%, #000)' };
    var sturdy = traits.indexOf('sturdy') >= 0;
    var slots = {};
    (options.items || []).forEach(function (one) { slots[one.slot] = true; });
    var legRx = sturdy ? 17 : 13;
    var legRy = sturdy ? 10 : 8;
    var parts = [];
    parts.push('<svg class="creature" viewBox="0 0 200 210" width="' + size + '" height="' + Math.round(size * 1.05) + '" role="img" aria-label="Существо">');
    if (traits.indexOf('backpack') >= 0) parts.push(backpack());
    parts.push('<ellipse class="leg" cx="76" cy="190" rx="' + legRx + '" ry="' + legRy + '" style="fill: ' + colors.dark + '"/>');
    parts.push('<ellipse class="leg" cx="124" cy="190" rx="' + legRx + '" ry="' + legRy + '" style="fill: ' + colors.dark + '"/>');
    parts.push('<g class="breath">');
    parts.push('<path d="M100 58 C 138 58, 166 96, 168 134 C 170 168, 142 186, 100 186 C 58 186, 30 168, 32 134 C 34 96, 62 58, 100 58 Z" style="fill: ' + colors.body + '; stroke: ' + colors.dark + '" stroke-width="2.5"/>');
    if (traits.indexOf('backpack') >= 0) parts.push(strap());
    if (options.sleeping) {
      parts.push('<path d="M68 120 Q 80 128, 92 120 M108 120 Q 120 128, 132 120" fill="none" stroke="#1F1F1F" stroke-width="3" stroke-linecap="round"/>');
    } else {
      parts.push('<g class="eyes">' +
        '<ellipse cx="80" cy="118" rx="13" ry="16" fill="#F4F1EA"/><ellipse cx="120" cy="118" rx="13" ry="16" fill="#F4F1EA"/>' +
        '<circle cx="82" cy="121" r="7.5" fill="#1F1F1F"/><circle cx="122" cy="121" r="7.5" fill="#1F1F1F"/>' +
        '<circle cx="85" cy="117" r="2.6" fill="#FFFFFF"/><circle cx="125" cy="117" r="2.6" fill="#FFFFFF"/></g>');
    }
    parts.push('<path d="M69 95 L 89 98 M111 98 L 131 95" stroke="#2A2A2A" stroke-width="3.5" stroke-linecap="round"/>');
    if (slots.neck) parts.push(item('neck'));
    parts.push('</g>');
    if (slots.head && !(options.sleeping && traits.indexOf('nightcap') >= 0)) parts.push(item('head'));
    parts.push('<g class="stem">' + stem(Math.max(0, Math.min(4, Number(look.stageIndex) || 0))) + '</g>');
    if (options.sleeping && traits.indexOf('nightcap') >= 0) parts.push(nightcap());
    if (slots.hand) parts.push(item('hand'));
    parts.push('</svg>');
    return parts.join('');
  }

  var STAGE_TITLES = ['Росток', 'Два листа', 'Четыре листа', 'Бутон', 'Цветок'];
  var TRAIT_TITLES = { backpack: 'Рюкзак-карта', sturdy: 'Крепкие ножки', nightcap: 'Ночной колпак' };

  window.Creature = {
    svg: svg,
    stageTitle: function (index) { return STAGE_TITLES[Math.max(0, Math.min(4, Number(index) || 0))]; },
    traitTitle: function (id) { return TRAIT_TITLES[id] || id; }
  };
})();
