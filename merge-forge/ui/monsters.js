// The monsters and bosses of «Кузница слияний», drawn on the gate's canvas: window.MFMonsters.
// Every kind (rat, blob, bones, golem, wolf, rider, serpent, ghost, dragon and the spare `beast`)
// is a flat drawing in a 100×100 box, feet on the bottom edge, looking left at the gate. The tones
// come from the monster's own colour, the details (eyes, steel, embers, moss) from the palette of
// the gate and the blades (art.js). A boss is larger, wears a crown and stands in an aura.
// No shadows; the motion is breathing, small sways of parts and a white flash on a hit.
(function () {
  'use strict';

  const INK = '#14151a';
  const ST = '#c3cad6'; // steel, light
  const SM = '#8d97a5'; // steel
  const SD = '#4d5560'; // iron
  const WD = '#7a5638'; // wood
  const WL = '#a47a52'; // wood, light
  const GO = '#e6c870'; // gold
  const GD = '#b8923e'; // gold, dark
  const EM = '#e07b4f'; // ember
  const FL = '#ffb347'; // flame
  const IC = '#7fc8e6'; // ice
  const RD = '#c0504a'; // cloth, a tongue
  const CA = '#d8cdb4'; // bone, a fang
  const PK = '#c98f86'; // a rat's skin
  const MS = '#6f8f55'; // moss

  const SHAPES = ['rat', 'blob', 'bones', 'golem', 'wolf', 'rider', 'serpent', 'ghost', 'dragon'];

  // A kind for a monster without one (or with one we do not draw): by its name.
  const BY_NAME = [
    ['dragon', /дракон|виверн|ящер|dragon|wyvern/],
    ['serpent', /зме[йяюи]|полоз|червь|угорь|serpent|snake|worm/],
    ['rat', /крыс|мыш|хорёк|хорек|rat|mouse/],
    ['wolf', /волк|волч|пёс|пес\b|псы|лис|шакал|стая|вожак|wolf|hound|fox/],
    ['rider', /всадник|рыцарь|кузнец|палач|странник|rider|knight/],
    ['bones', /кост|скелет|череп|мертв|bone|skelet|skull/],
    ['ghost', /дух|туман|призрак|привидени|тень|мгла|шёпот|шепот|ghost|spirit|mist|wraith/],
    ['golem', /голем|колосс|страж|сторож|истукан|идол|ржав|желез|медн|бронз|часов|golem|colossus|guard/],
    ['blob', /болот|слиз|жаб|тин[аы]|гриб|ил\b|blob|slime|swamp|bog/]
  ];

  /** The kind to draw: the given one when we know it, else a guess by the name, else `beast`. */
  function shapeOf(shape, title) {
    if (SHAPES.indexOf(shape) >= 0 || shape === 'beast') return shape;
    const name = String(title || '').toLowerCase();
    for (let i = 0; i < BY_NAME.length; i++) if (BY_NAME[i][1].test(name)) return BY_NAME[i][0];
    return 'beast';
  }

  function rgb(hex) {
    const n = parseInt(String(hex).slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mix(a, b, k) {
    const x = rgb(a);
    const y = rgb(b);
    return '#' + x.map((v, i) => ('0' + Math.round(v + (y[i] - v) * k).toString(16)).slice(-2)).join('');
  }

  /** The tones of a hide: c the colour itself, d and dd darker, l and ll lighter. */
  function tones(color) {
    const c = /^#[0-9a-fA-F]{6}$/.test(String(color)) ? String(color) : '#7a7f86';
    return { c: c, d: mix(c, '#0c0d10', 0.3), dd: mix(c, '#0c0d10', 0.55), l: mix(c, '#ffffff', 0.2), ll: mix(c, '#ffffff', 0.45) };
  }

  const PATHS = {};
  const path = (d) => PATHS[d] || (PATHS[d] = new Path2D(d));

  /** Short calls for a drawing: F fill a path, S stroke it, C a circle, E an ellipse, R a rect, T a turned part. */
  function brush(ctx) {
    const base = ctx.globalAlpha;
    const al = (a) => { ctx.globalAlpha = base * (a == null ? 1 : a); };
    return {
      ctx: ctx,
      F: (d, fill, a) => { al(a); ctx.fillStyle = fill; ctx.fill(path(d)); },
      S: (d, stroke, w, a) => { al(a); ctx.strokeStyle = stroke; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(path(d)); },
      C: (x, y, r, fill, a) => { al(a); ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); },
      E: (x, y, rx, ry, fill, a, rot) => { al(a); ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); ctx.fill(); },
      R: (x, y, w, h, fill, a) => { al(a); ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); },
      T: (px, py, deg, fn) => { ctx.save(); ctx.translate(px, py); ctx.rotate(deg * Math.PI / 180); ctx.translate(-px, -py); fn(); ctx.restore(); },
      // a glowing eye: a soft ring, the eye, a light point
      eye: function (x, y, r, color, big) {
        this.C(x, y, r * (big ? 3 : 2.3), color, 0.22);
        this.C(x, y, r, color);
        this.C(x - r * 0.25, y - r * 0.25, r * 0.38, '#ffffff', 0.85);
      },
      alpha: al
    };
  }

  const wave = (t, period, phase) => Math.sin(t / period + (phase || 0));

  // ---- the kinds. b — the brush, p — the tones, t — ms, m — the monster ({boss, mark}) ----

  const DRAW = {
    rat: function (b, p, t, m) {
      // the tail curls and wags
      b.T(78, 88, wave(t, 300) * 5, () => {
        b.S('M77 88C95 88 99 70 90 60C84 54 79 60 84 64', PK, 3.6);
        b.S('M77 88C95 88 99 70 90 60', mix(PK, INK, 0.25), 1, 0.6);
      });
      // the far ear, the haunch, the body
      b.C(42, 47, 7.5, p.dd);
      b.F('M22 78C22 58 38 40 58 42C76 44 87 60 85 80C84 92 74 98 58 98L30 98C24 96 22 88 22 78z', p.c);
      b.F('M52 43l3-8 4 8zM62 44l5-7 2 9zM71 49l7-5-1 9zM78 57l7-2-3 8z', p.d);
      b.F('M85 80C84 92 74 98 58 98L30 98C40 94 52 96 62 90C72 84 80 80 85 72z', p.d);
      b.E(67, 84, 13, 12, p.d);
      b.F('M56 78C62 72 74 74 78 82C72 78 62 78 56 78z', p.l, 0.5);
      b.F('M52 95h20c3 0 3 5 0 5H50z', PK);
      b.S('M56 97.5h2M62 97.5h2M68 97.5h2', mix(PK, INK, 0.35), 1);
      b.F('M28 97C36 88 50 88 58 97L56 98H30z', p.l, 0.55);
      // the head: a long snout, a nose, an eye, whiskers, teeth
      b.T(36, 70, wave(t, 700) * 2, () => {
        b.F('M6 75C9 62 22 51 36 53C45 55 48 66 43 77C38 87 22 89 11 83C7 81 5 79 6 75z', p.c);
        b.F('M11 83C22 89 38 87 43 77C36 82 22 83 12 79z', p.d);
        b.C(34, 49, 9.5, p.d);
        b.C(33, 50, 6, PK);
        b.F('M12 82h3.2v4.5h-3.2zM16 82.6h3v3.6h-3z', CA);
        b.C(7.5, 75.5, 3, PK);
        b.S('M11 78L1 73M11 79L0 80M12 80L2 87', p.ll, 0.8, 0.8);
        b.F('M16 62C20 58 27 58 30 62C26 61 20 61 16 62z', p.dd);
        b.eye(23, 66, 3, m.boss ? FL : '#f2c84b', m.boss);
        b.C(22.3, 66.3, 1.4, INK);
      });
      // the near paw with claws
      b.F('M34 84C30 88 27 94 25 98h11l4-10z', p.d);
      b.F('M22 96h15c2 0 2 4 0 4H21z', PK);
      b.S('M25 98h1.5M30 98h1.5', mix(PK, INK, 0.35), 1);
    },

    blob: function (b, p, t, m) {
      const k = wave(t, 640);
      // the puddle and the reeds behind the head
      b.E(50, 97, 46, 3.6, p.dd);
      b.T(44, 36, wave(t, 900) * 4, () => {
        b.S('M44 36L39 12', MS, 1.8);
        b.E(38.6, 10, 2.8, 6.5, WD, 1, -0.2);
        b.S('M38 3.5L37.5 0.5', WL, 1.2);
      });
      b.T(58, 35, wave(t, 900, 1.2) * 4, () => {
        b.S('M58 35L62 14', MS, 1.8);
        b.E(62.5, 12, 2.6, 6, WD, 1, 0.18);
        b.F('M51 35C46 26 49 16 53 11C54 20 54 28 53 35z', mix(MS, '#ffffff', 0.15));
      });
      // the arms hang and drip
      b.F('M18 62C6 64 1 78 5 90C7 95 13 93 12 88C11 82 14 76 21 74z', p.c);
      b.F('M82 60C94 62 99 76 95 88C93 93 87 91 88 86C89 80 86 74 79 72z', p.d);
      b.C(8.5, 93 + ((t / 30) % 40 < 6 ? (t / 30) % 40 : 0), 1.8, p.c);
      // the body: a mound with a dripping hem
      b.F('M12 96C7 70 19 33 50 31C81 33 93 68 88 96C80 99 73 93 66 97C60 100 54 94 48 97C41 100 35 94 28 97C22 100 16 99 12 96z', p.c);
      b.F('M12 96C10 86 11 78 14 70C30 84 70 84 86 70C89 80 90 88 88 96C80 99 73 93 66 97C60 100 54 94 48 97C41 100 35 94 28 97C22 100 16 99 12 96z', p.d);
      b.F('M24 50C28 40 38 34 50 34C42 38 32 44 28 54z', p.l, 0.55);
      b.C(22, 66, 3, p.l, 0.7);
      b.C(76, 82, 4, p.c);
      b.C(75, 81, 1.4, p.ll, 0.6);
      b.C(20, 86, 2.4, p.c);
      b.C(66, 88, 1.8, p.c);
      // the eyes of different size, heavy lids, the mouth with two teeth
      b.C(36, 56, 8.5, '#e6e0a2');
      b.C(61, 54, 10, '#e6e0a2');
      b.C(34 + k, 57, 3.6, INK);
      b.C(59 + k, 55.5, 4.2, INK);
      b.C(33 + k, 55.8, 1.1, '#ffffff', 0.9);
      b.C(57.8 + k, 54, 1.3, '#ffffff', 0.9);
      b.F('M26.5 54C28 45 42 44 45.5 53C40 49 32 49 26.5 54z', p.d);
      b.F('M50 51C52 41 68 40 72 50C66 45 56 45 50 51z', p.d);
      if (m.boss) {
        b.C(36, 56, 12, FL, 0.16);
        b.C(61, 54, 14, FL, 0.16);
      }
      b.F('M28 72C40 84 62 84 74 70C62 77 42 78 28 72z', INK);
      b.F('M38 76.4l3 5 3-4.6zM58 76l3 4.6 2.6-5.6z', CA);
      // bubbles rise by the shoulder
      for (let i = 0; i < 3; i++) {
        const u = ((t / 2600) + i / 3) % 1;
        b.alpha(0.7 * (1 - u));
        b.ctx.strokeStyle = p.ll;
        b.ctx.lineWidth = 0.9;
        b.ctx.beginPath();
        b.ctx.arc(84 + Math.sin(u * 6 + i) * 3, 52 - u * 34, 1.6 + i * 0.7, 0, Math.PI * 2);
        b.ctx.stroke();
      }
      b.alpha(1);
    },

    bones: function (b, p, t, m) {
      const bone = p.c;
      const shade = p.d;
      b.T(50, 100, wave(t, 800) * 1.2, () => {
        // the spear behind
        b.S('M79 99L75 12', WD, 2.6);
        b.F('M75 0l5.2 14-5 5.4-4.6-5z', ST);
        b.F('M75 0l5.2 14-5 5.4z', SM);
        b.F('M71.5 22l8-.5 5 9-6-2.4-3 4.6z', RD);
        // a torn cloak
        b.F('M38 40C44 44 58 44 64 40L70 70 66 80 62 72 58 84 54 74 50 82 46 72 42 78 36 68z', mix(RD, INK, 0.55));
        // legs
        b.S('M45 70L41 84L43 96M56 70L60 84L58 96', bone, 4);
        b.S('M43 96L34 97.5M58 96L49 97.5', bone, 3.6);
        b.C(41, 84, 3.2, shade);
        b.C(60, 84, 3.2, shade);
        // the pelvis, the spine, the ribs
        b.F('M39 64h22l-3 9h-5l-3-4-3 4h-5z', bone);
        b.S('M50 40V64', shade, 3.6);
        b.S('M50 44C42 42 37 45 38 50M50 50C42 48 38 51 39 56M50 56C44 55 40 57 41 61', bone, 2.8);
        b.S('M50 44C58 42 63 45 62 50M50 50C58 48 62 51 61 56M50 56C56 55 60 57 59 61', bone, 2.8);
        b.S('M36 40H64', bone, 4.6);
        b.C(36, 40, 3.6, shade);
        b.C(64, 40, 3.6, shade);
        // the arm with the spear
        b.S('M64 40L73 50L77 58', bone, 3.4);
        b.C(77, 58, 3, bone);
        // the skull, the jaw chatters
        const jaw = Math.max(0, wave(t, 170)) * (Math.floor(t / 1700) % 3 === 0 ? 1.6 : 0);
        b.ctx.save();
        b.ctx.translate(0, jaw);
        b.F('M41 33h18l-1.5 7.5h-15z', bone);
        b.S('M45 34.5v4M48.4 34.5v4M51.8 34.5v4M55 34.5v4', INK, 0.9);
        b.ctx.restore();
        b.F('M35 23C35 11 43 6 50 6C58 6 66 11 65 23C65 29 61 32 59 33L59 36H41V33C38 31 35 28 35 23z', bone);
        b.F('M59 33L59 36H41V33C46 35 54 35 59 33z', shade);
        b.E(43.5, 24, 4.4, 5, INK);
        b.E(55.5, 24, 4, 5, INK);
        b.eye(43.5, 24.6, 1.7, m.boss ? FL : IC, m.boss);
        b.eye(55.5, 24.6, 1.7, m.boss ? FL : IC, m.boss);
        b.F('M49.5 28l2 4h-4z', INK);
        b.S('M61 12L57 17L59.5 21', shade, 0.9);
        // the helmet of old iron
        b.F('M33 21C33 8 42 3 50 3C59 3 67 8 67 21L62 17.5H38z', SD);
        b.F('M33 21C33 8 42 3 50 3C44 6 39 11 38 17.5z', SM);
        b.F('M31 19.5h38v3.4H31z', mix(SD, INK, 0.3));
        b.F('M48.5 17.5h3V27h-3z', SD);
        if (!m.boss) b.F('M47.6 4L50 -1 52.4 4z', SM);
        b.C(37, 21.2, 1, ST);
        b.C(63, 21.2, 1, ST);
        // the shield arm in front
        b.S('M36 40L27 51L25 60', bone, 3.4);
        b.C(23, 61, 15.5, SD);
        b.C(23, 61, 13, WD);
        b.S('M13.5 52.5L32.5 69.5M32.5 52.5L13.5 69.5', WL, 1.6);
        b.S('M23 48V74', mix(WD, INK, 0.35), 1);
        b.C(23, 61, 4.6, SM);
        b.C(22, 60, 1.6, ST);
        b.F('M12 66l6 2-3 6z', INK, 0.5);
      });
    },

    golem: function (b, p, t, m) {
      const rust = mix(p.c, '#3a1c0c', 0.5);
      // smoke from the pipe
      for (let i = 0; i < 3; i++) {
        const u = ((t / 2400) + i / 3) % 1;
        b.C(66 + u * 8 + Math.sin(u * 5 + i) * 2, 10 - u * 12, 2.4 + u * 3.5, '#8d97a5', 0.32 * (1 - u));
      }
      b.F('M62 13h7v24h-7z', p.dd);
      b.F('M60 11h11v4H60z', SD);
      // legs
      b.F('M30 78h15v18H30zM55 78h15v18H55z', p.d);
      b.F('M26 92h22v8H26zM52 92h22v8H52z', p.dd);
      b.F('M26 92h22v2H26zM52 92h22v2H52z', p.c);
      b.C(37.5, 84, 2.2, p.dd);
      b.C(62.5, 84, 2.2, p.dd);
      // the far arm
      b.T(80, 46, wave(t, 900, 2) * 2.5, () => {
        b.F('M77 50h13v16H77z', p.dd);
        b.F('M75 64h18v22l-4 5H79l-4-5z', p.d);
        b.F('M74 86h20v11H74z', p.dd);
      });
      // the torso of plates
      b.F('M21 46L30 36H70L79 46V78L71 85H29L21 78z', p.c);
      b.F('M21 62H79V78L71 85H29L21 78z', p.d);
      b.F('M21 46L30 36H70L79 46H21z', p.l);
      b.S('M21 62H79', p.dd, 1.2);
      b.F('M24 50C28 48 31 52 29 56C27 59 23 57 24 50zM68 66C73 64 76 69 73 73C70 76 66 72 68 66zM33 70C37 69 38 74 35 76C32 77 31 73 33 70z', rust, 0.8);
      [[25, 47], [75, 47], [25, 76], [75, 76], [32, 82], [68, 82]].forEach((q) => b.C(q[0], q[1], 1.3, p.ll, 0.8));
      if (m.mark === 'clock') {
        // the Clockmaker: a dial with turning hands
        b.C(50, 60, 14.5, GD);
        b.C(50, 60, 12.4, CA);
        for (let i = 0; i < 12; i++) b.T(50, 60, i * 30, () => b.R(49.5, 48.6, 1, i % 3 ? 2 : 3.6, INK));
        b.T(50, 60, (t / 60) % 360, () => b.S('M50 60V50.5', INK, 1.3));
        b.T(50, 60, (t / 720) % 360, () => b.S('M50 60V53.5', INK, 2));
        b.C(50, 60, 1.8, RD);
      } else {
        // the furnace in the chest
        const f = 0.7 + 0.3 * wave(t, 140) * wave(t, 61);
        b.F('M38 47h24v17H38z', INK);
        b.F('M40 64C40 55 44 52 46 49C47 54 50 54 50 50C53 53 55 53 55 49C58 53 60 57 60 64z', EM);
        b.F('M44 64C44 59 47 57 48.5 54C50 58 52 58 53 55C55 58 56 60 56 64z', FL, f);
        b.S('M42 47v17M46 47v17M50 47v17M54 47v17M58 47v17', SD, 1.3);
        b.S('M38 47h24v17H38z', SM, 1.6);
        b.C(50, 56, 15, EM, 0.1 * f);
      }
      // the head sunk into the shoulders
      b.F('M40 22h20v16H40z', p.l);
      b.F('M40 34h20v4H40z', p.d);
      b.F('M42 27h16v5.4H42z', INK);
      b.eye(46.5, 29.7, 1.7, m.boss ? '#fff0a8' : FL, m.boss);
      b.eye(53.5, 29.7, 1.7, m.boss ? '#fff0a8' : FL, m.boss);
      b.C(41.6, 24, 0.9, p.dd);
      b.C(58.4, 24, 0.9, p.dd);
      b.S('M46 36.5h8', p.dd, 1);
      // shoulders and the near arm with a heavy fist
      b.C(79, 45, 10.5, p.d);
      b.C(21, 45, 11.5, p.l);
      b.C(21, 45, 4, p.d);
      b.C(21, 45, 1.6, p.ll);
      b.T(20, 46, wave(t, 900) * 2.5, () => {
        b.F('M10 52h14v15H10z', p.d);
        b.F('M6 64h20v22l-4 5H10l-4-5z', p.c);
        b.F('M6 64h20v3H6z', p.l);
        b.F('M4 85h23v12H4z', p.d);
        b.S('M10.5 88v9M16 88v9M21.5 88v9', p.dd, 1.1);
        b.F('M8 72C11 71 12 75 10 77C8 78 7 75 8 72z', rust, 0.8);
        b.C(22.5, 68.5, 1.1, p.ll, 0.8);
      });
    },

    wolf: function (b, p, t, m) {
      // the tail
      b.T(80, 58, wave(t, 380) * 6, () => {
        b.F('M78 54C90 44 100 52 97 66C95 74 90 78 86 76C90 70 88 64 78 64z', p.c);
        b.F('M97 66C95 74 90 78 86 76C90 72 92 68 93 62z', p.ll);
      });
      // the far legs
      b.F('M68 64l8 16-3 16h-7l2-16-7-10zM36 68l-1 28h-7l1-28z', p.dd);
      // the body, lean and arched
      b.F('M20 52C30 40 50 38 66 44C80 48 86 58 81 70C74 77 60 74 50 73C38 76 26 72 21 62z', p.c);
      b.F('M50 73C60 74 74 77 81 70C84 62 82 54 76 50C78 60 70 68 50 68z', p.d);
      // the near legs with paws
      b.F('M62 60C70 60 77 68 73 79L71 96h-9l2-15C57 78 56 66 62 60z', p.c);
      b.F('M60 94h12v6H59z', p.d);
      b.F('M29 64h11l-3 32h-9l2-17z', p.c);
      b.F('M25 94h13v6H24z', p.d);
      b.S('M34 95.5l-.6 4M29.5 95.5l-.6 4M68 95.5l-.6 4M63.5 95.5l-.6 4', p.dd, 1);
      // the chest fur and the mane on end
      b.F('M20 60l4 7 2-5 3 9 3-6 3 9 4-6 3 7C36 79 24 77 20 67z', p.l);
      b.F('M26 46l1-10 5 7 3-10 5 9 4-9 4 10 6-7 2 10 7-5 0 10C56 46 40 44 26 50z', p.d);
      // the head, low, the jaws open
      b.T(30, 54, wave(t, 600) * 2.5, () => {
        b.F('M24 46l-3-13 9 9zM31 44l3-13 6 13z', p.d);
        b.F('M25 43l-2-7 5 5z', PK, 0.7);
        b.F('M5 64L20 62 24 66 16 73C10 73 6 69 5 64z', mix(RD, INK, 0.45));
        b.F('M3 57L18 45C22 39 31 39 35 45C40 52 37 62 29 66L20 62 6 62C3 61 2 59 3 57z', p.c);
        b.F('M3 57L18 45C14 50 10 55 8 58z', p.l, 0.6);
        b.F('M5 64L20 64 17 72C11 72 7 69 5 64z', p.d);
        b.F('M7 62l1.6 4.4 1.8-4.4zM12 62l1.6 3.6 1.6-3.6zM9 66.4l1.4-3 1.6 3zM14 67l1.4-2.6 1.4 2.6z', CA);
        b.C(4.6, 57.6, 2.6, INK);
        b.F('M16 49C19 46.5 23 46.5 26 49L21 51z', p.dd);
        b.eye(21, 51.6, 2.1, m.boss ? '#fff0a8' : FL, true);
        b.E(21, 51.6, 0.7, 1.8, INK);
      });
      // embers drift off the hide
      for (let i = 0; i < 4; i++) {
        const u = ((t / 2200) + i / 4) % 1;
        b.R(46 + i * 11 + Math.sin(u * 7 + i) * 3, 42 - u * 26, 1.6, 1.6, i % 2 ? FL : EM, 0.9 * (1 - u));
      }
    },

    rider: function (b, p, t, m) {
      const horse = mix(p.c, '#0c0d10', 0.5);
      const far = mix(p.c, '#0c0d10', 0.68);
      const eyes = m.boss ? FL : '#cfd8ff';
      // the tail of smoke and the far legs
      b.T(78, 58, wave(t, 500) * 4, () => b.F('M76 54C90 54 97 70 92 88C88 80 86 70 76 66z', far));
      b.F('M38 70l2 14-3 14h5l3-14-1-14zM62 70l1 14-3 14h5l3-14v-14z', far);
      // the horse: the body, the neck, the long head
      b.F('M24 52C36 45 62 45 75 51C83 55 83 68 76 72C62 77 38 77 28 72C21 68 20 58 24 52z', horse);
      b.F('M30 68l-4 16 2 14h5l-1-14 6-14zM70 66l6 16-3 16h5l4-16-5-18z', horse);
      b.F('M32 56C26 46 22 38 15 33L5 47C3 51 5 55 9 55L16 51C18 58 22 62 28 64z', horse);
      b.F('M14 34l0-8 6 6z', horse);
      b.S('M19 34C24 38 28 44 31 52M22 33C28 36 32 42 35 49', far, 2.2);
      b.eye(11.5, 43.5, 1.5, eyes, m.boss);
      b.S('M5 50L8 49', p.ll, 0.8, 0.7);
      // mist where the hooves should knock
      for (let i = 0; i < 4; i++) b.E([28, 40, 63, 77][i] + wave(t, 700, i) * 2, 97, 7.5, 2.8, p.ll, 0.28);
      // what the rider carries behind the shoulder
      if (m.mark === 'hammer') {
        b.S('M66 62L84 20', WD, 2.6);
        b.F('M73 8h25v12H73z', SD);
        b.F('M73 8h25v3H73z', SM);
        b.F('M71 10h3v8h-3z', ST);
        b.C(86, 14, 7, EM, 0.2 + 0.12 * wave(t, 300));
      } else {
        b.S('M66 62L71 7', WD, 2.4);
        // a boss wears a crown, so its blade looks back
        b.F(m.boss ? 'M70 5C84 0 95 8 99 22C91 13 81 11 71 12z' : 'M72 5C58 0 44 6 37 18C48 11 60 11 71 12z', ST);
        b.F(m.boss ? 'M70 5C84 0 95 8 99 22C92 10 81 7 71 8z' : 'M72 5C58 0 44 6 37 18C48 8 60 7 71 8z', SM);
      }
      // the cloak streams back, the hood is empty but for two lights
      const fl = wave(t, 450) * 3;
      b.F('M44 52C42 36 46 24 54 19C63 22 69 34 70 50C76 57 82 ' + (58 + fl).toFixed(1) + ' 90 ' + (54 + fl).toFixed(1) +
        'C88 ' + (66 + fl).toFixed(1) + ' 74 70 62 63L46 61z', p.c);
      b.F('M56 30C60 40 62 50 62 63L46 61 44 52C46 46 52 38 56 30z', p.d);
      b.F('M70 50C76 57 82 ' + (58 + fl).toFixed(1) + ' 90 ' + (54 + fl).toFixed(1) + 'C84 ' + (62 + fl).toFixed(1) + ' 76 62 68 56z', p.l, 0.5);
      b.S('M46 52L30 50', p.d, 3.4);
      b.C(30, 50, 2.2, far);
      b.S('M30 50L14 45', far, 0.9);
      b.F('M45 24C44 11 53 5 61 8C68 11 70 20 67 28C62 32 51 32 47 29z', p.l);
      b.F('M61 8C68 11 70 20 67 28C64 30 60 31 57 31C63 25 64 15 61 8z', p.c);
      b.E(52.5, 20.5, 5.2, 7.4, '#0e0f14', 1, 0.12);
      b.eye(50.6, 19.6, 1.2, eyes, m.boss);
      b.eye(55, 20, 1.2, eyes, m.boss);
    },

    serpent: function (b, p, t, m) {
      const sway = wave(t, 760) * 3;
      // the tail tip and the coils, stone on stone
      b.F('M86 96C99 92 99 78 92 70C94 80 90 86 82 88z', p.d);
      b.F('M10 97C6 80 28 70 54 70C82 70 96 82 91 97z', p.c);
      b.F('M10 97C9 92 11 88 14 85C30 92 72 92 88 84C91 88 92 92 91 97z', p.d);
      b.F('M22 78C22 64 40 58 58 60C75 62 84 72 81 81C66 73 40 73 22 78z', p.l);
      b.F('M22 78C40 73 66 73 81 81C82 77 81 73 79 70C64 66 38 66 23 72z', p.c);
      b.S('M30 74l2 12M44 71l1 14M58 71l-1 14M72 74l-3 11M38 62l2 8M54 60v9M68 63l-2 8', p.dd, 1.1, 0.8);
      b.F('M16 88C19 84 25 85 26 89C24 92 18 92 16 88zM62 86C66 83 72 85 72 89C69 92 63 91 62 86zM44 62C47 60 51 61 51 64C48 66 45 65 44 62z', MS, 0.9);
      b.F('M28 70l3-6 3 5zM46 60l3-7 3 6zM66 62l4-6 2 7z', p.dd);
      // the neck rises in an S
      const neck = 'M62 70C80 54 72 ' + (38 + sway * 0.3).toFixed(1) + ' 54 ' + (36 + sway * 0.4).toFixed(1) + 'C42 ' + (34 + sway * 0.6).toFixed(1) + ' 38 ' + (27 + sway).toFixed(1) + ' 30 ' + (25 + sway).toFixed(1);
      b.ctx.save();
      b.alpha(1);
      b.ctx.lineCap = 'round';
      b.ctx.lineJoin = 'round';
      b.ctx.strokeStyle = p.c;
      b.ctx.lineWidth = 17;
      b.ctx.stroke(new Path2D(neck));
      b.ctx.strokeStyle = p.l;
      b.ctx.lineWidth = 6;
      b.ctx.translate(-3.5, 3.5);
      b.ctx.stroke(new Path2D(neck));
      b.ctx.restore();
      b.S('M70 50l-9 1M68 42l-8 5M58 36l-3 9M48 32l1 9', p.dd, 1.1, 0.8);
      b.F('M70 40l7-4-2 8zM62 31l5-6 1 8zM50 27l2-7 4 6z', p.d);
      b.F('M64 58C67 55 71 57 70 61C67 63 64 61 64 58z', MS, 0.9);
      // the head: a heavy brow, horns of stone, an amber eye, the tongue flicks
      b.ctx.save();
      b.ctx.translate(0, sway);
      const flick = Math.floor(t / 900) % 3 === 0 ? 1 : 0.35;
      b.S('M8 29L' + (8 - 7 * flick).toFixed(1) + ' 31', RD, 1.2);
      b.S('M' + (8 - 7 * flick).toFixed(1) + ' 31l-2.4-2M' + (8 - 7 * flick).toFixed(1) + ' 31l-2 2.6', RD, 1);
      b.F('M30 14l8-9-1 12zM24 12l3-9 4 10z', CA);
      b.F('M6 27C10 16 23 9 34 13C41 16 42 28 35 33C27 38 13 36 7 31C5.6 30 5.4 28.4 6 27z', p.c);
      b.F('M7 31C13 36 27 38 35 33C38 30 39 27 39 24C32 30 18 31 7 28z', p.l);
      b.S('M7 29.4C13 31.6 20 31.6 26 29', p.dd, 1);
      b.F('M14 17C19 13 26 13 30 17L24 20z', p.dd);
      b.eye(22.5, 21, 2.6, m.boss ? FL : '#e6b040', m.boss);
      b.E(22.5, 21, 0.8, 2.3, INK);
      b.C(8.6, 25.4, 0.8, INK);
      b.S('M32 16l3 5M28 24l5 2', p.dd, 0.9, 0.7);
      b.ctx.restore();
    },

    ghost: function (b, p, t, m) {
      const c = b.ctx;
      const fy = wave(t, 700) * 2.5;
      // mist on the road
      b.E(34 + wave(t, 1100) * 3, 96.5, 20, 3.2, p.c, 0.22);
      b.E(66 - wave(t, 900) * 3, 97.5, 24, 2.6, p.c, 0.18);
      c.save();
      c.translate(0, fy - 3);
      // the arms reach out, sleeves in tatters
      b.F('M29 44C18 40 8 44 3 55C9 50 16 51 20 55C24 58 28 58 31 56z', p.d, 0.9);
      b.F('M72 46C82 44 91 50 95 61C90 55 84 55 80 58C77 60 74 59 71 57z', p.d, 0.8);
      // the body with a hem that waves
      const hem = [];
      for (let i = 0; i <= 10; i++) hem.push([75 - i * 5, 90 + (i % 2 ? -7 : 2) + Math.sin(t / 260 + i * 1.3) * 2]);
      b.alpha(0.93);
      c.fillStyle = p.c;
      c.beginPath();
      c.moveTo(25, 42);
      c.bezierCurveTo(25, 18, 38, 7, 50, 7);
      c.bezierCurveTo(64, 7, 75, 19, 75, 42);
      c.lineTo(76, 84);
      hem.forEach((q, i) => { if (i) c.quadraticCurveTo(q[0] + 2.5, (hem[i - 1][1] + q[1]) / 2 + (i % 2 ? 3 : -3), q[0], q[1]); else c.lineTo(q[0], q[1]); });
      c.lineTo(24, 84);
      c.closePath();
      c.fill();
      b.F('M36 38C36 22 43 15 50 15C58 15 65 23 65 38L66 70C58 77 43 77 35 70z', p.ll, 0.45);
      b.F('M25 42C25 18 38 7 50 7C40 12 33 24 32 42L31 80 24 84z', p.d, 0.5);
      // hollow eyes with cold lights, the mouth blows the candles out
      b.E(41.5, 36, 5, 7, '#1a222c', 1, 0.25);
      b.E(58.5, 36, 5, 7, '#1a222c', 1, -0.25);
      b.eye(42, 37.5, 1.6, m.boss ? FL : '#dff4ff', m.boss);
      b.eye(58, 37.5, 1.6, m.boss ? FL : '#dff4ff', m.boss);
      b.E(50, 53, 4, 5 + wave(t, 520) * 1.6, '#1a222c');
      b.S('M34 26C36 24 39 23.4 42 24M58 24C61 23.4 64 24 66 26', p.d, 1.1);
      c.restore();
      // the breath: a cold wisp towards the gate
      for (let i = 0; i < 3; i++) {
        const u = ((t / 2000) + i / 3) % 1;
        b.C(44 - u * 34, 53 + fy + Math.sin(u * 6 + i) * 3, 1.6 + u * 3, p.ll, 0.4 * (1 - u));
      }
    },

    dragon: function (b, p, t, m) {
      const belly = mix(p.c, '#f0d0a0', 0.45);
      const flap = wave(t, 620) * 4;
      // the wings: the far one, then the near one with its fingers
      b.T(58, 48, -flap * 0.7, () => b.F('M56 46L46 8L64 22L72 4L79 26L95 18L82 50z', p.dd));
      // the tail with a spade
      b.T(78, 72, wave(t, 520) * 3, () => {
        b.F('M74 66C90 70 97 82 91 92L99 93 90 100 83 92C87 84 82 80 72 80z', p.c);
        b.F('M91 92L99 93 90 100z', p.d);
      });
      // the hind leg, the body, the plated belly glowing between the plates
      b.F('M30 62C34 50 52 43 68 47C83 51 88 66 81 78C73 89 50 91 38 85C30 81 28 70 30 62z', p.c);
      b.F('M52 46l3-7 4 7zM62 46l4-6 3 8zM72 50l6-4 0 8z', p.d);
      b.F('M31 68C35 82 48 89 62 87C50 93 36 91 31 80z', belly);
      b.S('M33 74C38 77 42 78 46 78M36 81C41 84 46 85 51 85', EM, 1.1, 0.55 + 0.35 * wave(t, 400));
      b.F('M62 72C73 70 80 79 75 90L77 97H62L65 88C58 86 57 77 62 72z', p.d);
      b.F('M60 96l3-3 3 3 3-3 3 3 3-3 2 4H60z', CA);
      b.F('M36 78l-2 13-6 6h14l1-19z', p.d);
      b.F('M27 96l3-3 3 3 3-3 3 3 3-3 1 4H27z', CA);
      b.T(56, 48, flap, () => {
        b.F('M54 48L32 8C45 10 53 17 57 26C61 15 69 8 80 5C78 20 76 34 72 50z', p.d);
        b.S('M54 48L32 8M56 46L57 26M58 46L80 5', p.l, 1.4, 0.8);
        b.F('M32 8l-3-5 6 3z', CA);
      });
      // the neck and the horned head
      b.T(34, 60, wave(t, 680) * 2, () => {
        b.F('M34 66C25 56 25 42 21 34L34 30C38 42 42 50 47 55z', p.c);
        b.F('M34 66C28 58 27 48 25 40L29 39C31 48 35 56 41 60z', belly);
        b.F('M36 32l5-5 1 8zM40 41l6-3-1 8z', p.d);
        b.F('M27 21L39 7 33 24zM22 19L30 5 28 21z', CA);
        b.F('M6 37L24 39 20 45C12 45 8 41 6 37z', p.d);
        b.F('M3 30C7 22 17 17 28 20C35 22 37 31 32 37C26 41 11 40 5 36C3 34.6 2.4 32 3 30z', p.c);
        b.F('M3 30C7 22 17 17 28 20C20 21 12 25 8 31z', p.l, 0.6);
        b.F('M8 37.6l1.4 3.6 1.6-3.4zM13 38.2l1.4 3.4 1.6-3.2zM18 38.6l1.2 3 1.4-2.8z', CA);
        b.C(6, 30.6, 1, INK);
        b.F('M16 23.4C19 21.6 23 21.8 26 24L21 26z', p.dd);
        b.eye(21.4, 26.4, 2.1, m.boss ? '#fff0a8' : FL, true);
        b.E(21.4, 26.4, 0.7, 1.8, INK);
        // hot ash on the breath
        for (let i = 0; i < 4; i++) {
          const u = ((t / 1800) + i / 4) % 1;
          b.C(4 - u * 10, 39 + u * 8 + Math.sin(u * 6 + i * 2) * 3, 1.2 + u * 2.4, i % 2 ? '#9a938c' : EM, 0.6 * (1 - u));
        }
      });
    },

    // The spare kind: a horned one-eyed brute.
    beast: function (b, p, t, m) {
      b.F('M30 34C22 30 16 20 18 8C24 14 32 18 38 26zM70 34C78 30 84 20 82 8C76 14 68 18 62 26z', CA);
      b.F('M18 8C20 14 24 20 30 24L27 27C22 22 18 16 18 8zM82 8C80 14 76 20 70 24L73 27C78 22 82 16 82 8z', mix(CA, INK, 0.3));
      b.T(22, 58, wave(t, 800) * 3, () => {
        b.F('M24 52C10 54 4 68 6 84L16 86C14 74 18 66 28 64z', p.d);
        b.F('M3 82h15l-1 9-3-4-2 5-3-5-3 4z', CA);
      });
      b.T(78, 58, -wave(t, 800) * 3, () => {
        b.F('M76 52C90 54 96 68 94 84L84 86C86 74 82 66 72 64z', p.dd);
        b.F('M82 82h15l-3 9-3-4-2 5-3-5-3 4z', CA);
      });
      b.F('M26 86h18v14H24zM56 86h18l2 14H56z', p.d);
      b.F('M20 96h26v4H20zM54 96h26v4H54z', p.dd);
      b.F('M20 92C14 66 22 28 50 26C78 28 86 66 80 92C70 97 30 97 20 92z', p.c);
      b.F('M20 92C19 84 19 76 20 70C34 82 66 82 80 70C81 76 81 84 80 92C70 97 30 97 20 92z', p.d);
      b.F('M30 44C34 34 42 29 50 29C42 34 36 40 34 48z', p.l, 0.6);
      b.F('M36 30l4-7 4 6zM48 27l3-7 4 7zM58 29l5-6 2 8z', p.d);
      b.C(50, 50, 11, '#e6e0a2');
      b.C(48.5 + wave(t, 900) * 1.5, 51, 5, m.boss ? EM : '#7a4a8a');
      b.C(48.5 + wave(t, 900) * 1.5, 51, 2.2, INK);
      b.C(46.8, 48.6, 1.4, '#ffffff', 0.9);
      b.F('M38 46C42 36 58 36 62 46C56 41 44 41 38 46z', p.d);
      b.F('M32 72C42 80 58 80 68 72C60 86 40 86 32 72z', INK);
      b.F('M35 73.4l3 7 3-5.4zM65 73.4l-3 7-3-5.4zM46 77l2 4 2-4zM51 77l2 4 2-4z', CA);
      b.C(28, 62, 2, p.l, 0.6);
      b.C(72, 78, 2.6, p.dd, 0.6);
    }
  };

  // Where the crown sits: x, y of its base and its tilt, in the box of the kind.
  const CROWN = {
    rat: [29, 45, -16], blob: [50, 33, 0], bones: [50, 5, 0], golem: [50, 23, 0], wolf: [27, 39, -18],
    rider: [57, 9, 8], serpent: [24, 13, -14], ghost: [50, 9, 0], dragon: [19, 20, -18], beast: [50, 27, 0]
  };

  function crown(b, t) {
    b.F('M-12 0L-14.5 -12 -6.5 -6 0 -15.5 6.5 -6 14.5 -12 12 0z', GO);
    b.F('M-12 0L-14.5 -12 -6.5 -6 -4 0z', GD, 0.55);
    b.F('M-12.4 -4h24.8v4.6h-24.8z', GD);
    b.F('M-12.4 -4h24.8v1.2h-24.8z', '#fff3c4', 0.7);
    b.C(0, -1.7, 1.9, RD);
    b.C(-7.4, -1.7, 1.3, IC);
    b.C(7.4, -1.7, 1.3, IC);
    b.C(-14.5, -12.4, 1.7, GO);
    b.C(14.5, -12.4, 1.7, GO);
    b.C(0, -16, 2, GO);
    b.C(0.3, -16.4, 0.8, '#ffffff', 0.5 + 0.5 * wave(t, 300));
  }

  /** The aura of a boss behind it: slow rays, a halo and a ring on the road. */
  function aura(ctx, x, ground, s, t, color, alpha) {
    const pulse = 0.5 + 0.5 * wave(t, 600);
    const cy = ground - s * 0.48;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - s * 1.2, ground - s * 1.6, s * 2.4, s * 1.6);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha * 0.1;
    ctx.beginPath();
    ctx.arc(x, cy, s * (0.5 + 0.03 * pulse), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha * 0.08;
    ctx.beginPath();
    ctx.arc(x, cy, s * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(x, cy);
    ctx.rotate(t / 9000);
    ctx.globalAlpha = alpha * (0.13 + 0.07 * pulse);
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6);
      const len = s * (i % 2 ? 0.58 : 0.72) * (0.94 + 0.06 * pulse);
      ctx.beginPath();
      ctx.moveTo(-s * 0.045, -s * 0.2);
      ctx.lineTo(0, -len);
      ctx.lineTo(s * 0.045, -s * 0.2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha * (0.35 + 0.3 * pulse);
    ctx.lineWidth = Math.max(1, s * 0.016);
    ctx.beginPath();
    ctx.ellipse(x, ground - 1, s * (0.46 + 0.05 * pulse), Math.max(1.5, s * 0.035), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ---- painted monsters (art/monster/<art>.webp) and the looks of their modifiers -------------------------

  /** How a modifier shows: a tint over the picture, how solid it is, what flies around it, the boss's aura. */
  const LOOK = {
    golden: { tint: '#ffd34d', tintA: 0.42, sparkle: '#fff0b0' },
    giant: {},
    feeble: { filter: 'grayscale(0.55) brightness(1.06)', wobble: 3 },
    swift: { lean: -8, lines: true },
    ghostly: { tint: '#d6ecff', tintA: 0.32, alpha: 0.55, float: true },
    enraged: { tint: '#ff3b30', tintA: 0.24, pulse: true, shake: 1.2 },
    frosty: { tint: '#9ad8ff', tintA: 0.38, snow: true },
    burning: { tint: '#ff7a2e', tintA: 0.26, embers: true },
    treasure: { chest: true },
    rainbow: { rainbow: true, sparkle: '#ffffff' },
    regal: {},
    colossal: {},
    frenzied: { tint: '#ff5a3c', tintA: 0.16, pulse: true, shake: 0.8, aura: '#ff5a3c' },
    hoarder: { tint: '#ffd34d', tintA: 0.3, sparkle: '#fff0b0', aura: '#ffd34d' },
    shadow: { tint: '#24182f', tintA: 0.42, alpha: 0.9, aura: '#9a7ae0' },
    enduring: { aura: '#6fd08a' }
  };

  /** A four-point star with its middle in (x, y). */
  function star(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.28, y - r * 0.28);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x + r * 0.28, y + r * 0.28);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r * 0.28, y + r * 0.28);
    ctx.lineTo(x - r, y);
    ctx.lineTo(x - r * 0.28, y - r * 0.28);
    ctx.closePath();
    ctx.fill();
  }

  // Fixed places around the figure for what flies about it (0…1 across and down its box).
  const SPOTS = [[0.12, 0.2], [0.86, 0.32], [0.3, 0.72], [0.7, 0.08], [0.95, 0.75], [0.05, 0.55], [0.55, 0.45]];

  /** What flies around a figure (x — its middle, top — its top, w × h its box). */
  function around(ctx, look, x, top, w, h, ground, t, alpha, walking, s) {
    ctx.save();
    if (look.sparkle) {
      ctx.fillStyle = look.sparkle;
      SPOTS.forEach((p, i) => {
        const tw = 0.5 + 0.5 * wave(t, 210 + i * 37, i * 1.7);
        ctx.globalAlpha = alpha * tw;
        star(ctx, x - w / 2 + p[0] * w, top + p[1] * h, Math.max(1.5, s * 0.035) * (0.6 + tw));
      });
    }
    if (look.snow) {
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 7; i++) {
        const fall = ((t / 22 + i * 41) % (h * 1.1));
        ctx.globalAlpha = alpha * 0.8 * (1 - fall / (h * 1.1));
        ctx.beginPath();
        ctx.arc(x - w / 2 + SPOTS[i][0] * w + wave(t, 400, i) * 3, top + fall, Math.max(1, s * 0.012), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (look.embers) {
      for (let i = 0; i < 7; i++) {
        const rise = ((t / 16 + i * 53) % (h * 1.15));
        ctx.globalAlpha = alpha * (1 - rise / (h * 1.15));
        ctx.fillStyle = i % 2 ? '#ffb347' : '#ff6a2a';
        ctx.beginPath();
        ctx.arc(x - w / 2 + SPOTS[i][0] * w + wave(t, 260, i) * 4, ground - rise, Math.max(1, s * 0.014), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (look.lines && walking) {
      ctx.strokeStyle = '#f2f2f2';
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1, s * 0.012);
      for (let i = 0; i < 3; i++) {
        const y = top + h * (0.3 + i * 0.22);
        const from = x + w * 0.42 + i * 4;
        ctx.globalAlpha = alpha * (0.35 + 0.25 * wave(t, 90, i));
        ctx.beginPath();
        ctx.moveTo(from, y);
        ctx.lineTo(from + s * 0.16, y);
        ctx.stroke();
      }
    }
    if (look.chest) {
      const chest = window.MFArt && MFArt.img('ui', 'chest');
      const side = Math.max(14, s * 0.24);
      const bob = wave(t, 300) * 2;
      ctx.globalAlpha = alpha;
      if (chest) ctx.drawImage(chest, x - side / 2, top - side * 0.85 + bob, side, side);
    }
    ctx.restore();
  }

  let sbuf = null;

  /**
   * A painted monster with its feet at (x, ground) in a box s wide and high, as draw() does with a
   * drawn one; m.mod — its modifier, m.size — how much bigger or smaller it is, m.hue — the turn of
   * its colours for the older rounds. o.room — the height it may take at most.
   */
  function sprite(ctx, im, m, x, ground, s, t, o) {
    const look = LOOK[m.mod] || {};
    const boss = !!m.boss;
    const hit = Math.max(0, Math.min(1, o.hit || 0));
    const alpha = o.alpha == null ? 1 : Math.max(0, Math.min(1, o.alpha));
    if (alpha <= 0 || s <= 0) return;
    let box = s * (boss ? 0.86 : 1) * (m.size > 0 ? m.size : 1);
    if (o.room > 0) box = Math.min(box, o.room * (boss ? 0.86 : 1));
    const k = box / Math.max(im.naturalWidth, im.naturalHeight);
    const dw = im.naturalWidth * k;
    const dh = im.naturalHeight * k;
    const pulse = 0.5 + 0.5 * wave(t, 260);
    if (boss) aura(ctx, x, ground, Math.max(s, box), t, look.aura || o.accent || EM, alpha);
    // its shadow on the road
    ctx.save();
    ctx.globalAlpha = alpha * 0.28 * (look.alpha || 1);
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.ellipse(x, ground - 1, dw * 0.36, Math.max(2, dh * 0.05), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // into the buffer: the picture, its tint, the flash of a strike
    const tr = ctx.getTransform ? ctx.getTransform() : { a: 1 };
    const dpr = tr.a || 1;
    const bw = Math.max(1, Math.ceil(dw * dpr));
    const bh = Math.max(1, Math.ceil(dh * dpr));
    if (!sbuf) sbuf = document.createElement('canvas');
    if (sbuf.width !== bw || sbuf.height !== bh) {
      sbuf.width = bw;
      sbuf.height = bh;
    }
    const c = sbuf.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.clearRect(0, 0, bw, bh);
    if (look.filter) c.filter = look.filter;
    c.drawImage(im, 0, 0, bw, bh);
    c.filter = 'none';
    const tint = (look.tintA || 0) * (look.pulse ? 0.55 + 0.45 * pulse : 1);
    if (look.tint && tint > 0) {
      c.globalCompositeOperation = 'source-atop';
      c.globalAlpha = tint;
      c.fillStyle = look.tint;
      c.fillRect(0, 0, bw, bh);
    }
    if (hit >= 0.02) {
      c.globalCompositeOperation = 'source-atop';
      c.globalAlpha = hit * 0.7;
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, bw, bh);
    }
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    // onto the gate: it breathes, hops as it walks, recoils from a strike
    const breath = 1 + 0.016 * wave(t, 520);
    const hop = o.walk ? -Math.abs(wave(t, 150)) * 3 * s / 100 : 0;
    const float = look.float ? wave(t, 700) * s * 0.03 - s * 0.03 : 0;
    const shake = look.shake ? wave(t, 23) * look.shake : 0;
    const lean = ((o.walk ? -3 : 0) + (look.lean && o.walk ? look.lean : 0) + hit * 5 + (look.wobble ? wave(t, 380) * look.wobble : 0)) * Math.PI / 180;
    ctx.save();
    ctx.globalAlpha = alpha * (look.alpha || 1) * (look.float ? 0.85 + 0.15 * wave(t, 400) : 1);
    if (look.rainbow) ctx.filter = 'hue-rotate(' + Math.round(t / 6 % 360) + 'deg) saturate(1.5)';
    else if (m.hue) ctx.filter = 'hue-rotate(' + Math.round(m.hue) + 'deg)';
    ctx.translate(x + hit * s * 0.05 + shake, ground + hop + float);
    ctx.rotate(lean);
    ctx.scale((2 - breath) * (1 + hit * 0.04), breath * (1 - hit * 0.05));
    ctx.drawImage(sbuf, -dw / 2, -dh, dw, dh);
    ctx.restore();
    const top = ground - dh + hop + float;
    around(ctx, look, x, top, dw, dh, ground, t, alpha, !!o.walk, s);
    if (boss) {
      // the crown of a boss over its head (the heads look left, to the gate)
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x - dw * 0.12, top + dh * 0.04);
      const q = Math.max(0.2, s / 100) * 0.95;
      ctx.scale(q, q);
      crown(brush(ctx), t);
      ctx.restore();
    }
  }

  let buffer = null;

  /**
   * Draws the monster m ({shape, color, title, boss, mark}) with its feet at (x, ground) in a box
   * s wide and s high (a boss with its crown stays inside the same box). t — ms. o:
   *   walk   true while it walks up (it hops and leans);
   *   hit    0…1, the white flash and the recoil of a strike;
   *   alpha  0…1, how solid it is (it fades in at the far end of the road);
   *   accent the colour of a boss's aura.
   */
  function draw(ctx, m, x, ground, s, t, o) {
    o = o || {};
    const im = m.art && window.MFArt ? MFArt.img('monster', m.art) : null;
    if (im) {
      sprite(ctx, im, m, x, ground, s, t, o);
      return;
    }
    const kind = shapeOf(m.shape, m.title);
    const p = tones(m.color);
    const hit = Math.max(0, Math.min(1, o.hit || 0));
    const alpha = o.alpha == null ? 1 : Math.max(0, Math.min(1, o.alpha));
    const boss = !!m.boss;
    if (alpha <= 0 || s <= 0) return;
    if (boss) aura(ctx, x, ground, s, t, o.accent || EM, alpha);
    const paint = (c, cx, cg) => {
      const k = s / 100 * (boss ? 0.86 : 1);
      const breath = 1 + 0.016 * wave(t, 520);
      const hop = o.walk ? -Math.abs(wave(t, 150)) * 3 : 0;
      c.save();
      c.translate(cx + hit * s * 0.05, cg);
      c.scale(k, k);
      c.translate(0, hop);
      c.rotate(((o.walk ? -3 : 0) + hit * 5) * Math.PI / 180);
      c.scale((2 - breath) * (1 + hit * 0.04), breath * (1 - hit * 0.05));
      c.translate(-50, -100);
      const b = brush(c);
      DRAW[kind](b, p, t, m);
      b.alpha(1);
      if (boss) {
        const q = CROWN[kind];
        c.translate(q[0], q[1]);
        c.rotate(q[2] * Math.PI / 180);
        crown(b, t);
        b.alpha(1);
      }
      c.restore();
    };
    if (hit < 0.02 && alpha >= 1) {
      paint(ctx, x, ground);
      return;
    }
    // Through a buffer: the whole figure flashes white or fades as one piece.
    const tr = ctx.getTransform ? ctx.getTransform() : { a: 1 };
    const dpr = tr.a || 1;
    const w = s * 1.7;
    const h = s * 1.3;
    if (!buffer) buffer = document.createElement('canvas');
    const bw = Math.ceil(w * dpr);
    const bh = Math.ceil(h * dpr);
    if (buffer.width !== bw || buffer.height !== bh) {
      buffer.width = bw;
      buffer.height = bh;
    }
    const c = buffer.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.clearRect(0, 0, w, h);
    paint(c, w / 2, h - s * 0.06);
    if (hit >= 0.02) {
      c.globalCompositeOperation = 'source-atop';
      c.globalAlpha = hit * 0.7;
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = 1;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(buffer, x - w / 2, ground - (h - s * 0.06), w, h);
    ctx.restore();
  }

  window.MFMonsters = { draw: draw, shapeOf: shapeOf, shapes: SHAPES, looks: LOOK };
})();
