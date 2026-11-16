/* The beast painter. A beast is drawn from five independently inherited layers — head, body, feet,
   tail, coat — and each layer has fourteen hand-drawn variants, one per species (the visible allele
   of that part picks the variant). The two colour alleles give the main and the second colour; every
   other tint (outline, shade, belly) is derived from them, so any pair stays harmonious.
   All shapes are original; nothing is derived from names supplied by stock. */
(function () {
  'use strict';
  var palette = ['#ddd8c8','#5f6367','#8b9f76','#b77c66','#c5a468','#7d94a5','#9c89a4','#a4a478','#9e695b','#a6c5c6','#80677e','#bca88e'];
  var species = [];
  var serial = 0;
  var HORN = '#efe6cf';
  var ICE = '#cfeaf0';
  var GLOW = '#f8eda6';
  var BEAK = '#e9b55e';
  var BLUSH = '#e88f8c';
  var EYE = '#24211f';
  var WHITE = '#fbf8f0';

  function index(value) {
    if (typeof value === 'number') return Math.max(0, Math.min(13, value));
    var n = species.indexOf(value);
    return n < 0 ? 0 : n;
  }
  function visible(beast, part) {
    var p = (beast.parts || [])[part];
    return index(p && typeof p === 'object' ? p.visible : p);
  }
  function color(value) {
    var n = typeof value === 'number' ? value : Number(value);
    return palette[Number.isFinite(n) ? (n % palette.length + palette.length) % palette.length : 0];
  }
  function rgb(hex) {
    var n = parseInt(String(hex).replace('#', ''), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function mix(a, b, t) {
    var x = rgb(a);
    var y = rgb(b);
    var out = '#';
    for (var i = 0; i < 3; i++) {
      var v = Math.round(x[i] + (y[i] - x[i]) * t).toString(16);
      out += v.length < 2 ? '0' + v : v;
    }
    return out;
  }
  function light(hex) {
    var c = rgb(hex);
    return (c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114) / 255;
  }
  function tones(beast) {
    var c = beast.colors || [0, 1];
    var p = color(c[0]);
    var s = color(c[1]);
    var albino = (beast.traits || []).indexOf('albino') >= 0;
    if (albino) {
      p = '#f3f0e8';
      s = mix(s, '#ffffff', 0.62);
    }
    if (s === p) s = light(p) > 0.6 ? mix(p, '#4a4640', 0.28) : mix(p, '#ffffff', 0.42);
    return {
      p: p,
      s: s,
      d: mix(p, '#1d201f', 0.24),
      l: mix(p, '#ffffff', 0.3),
      b: mix(s, '#ffffff', 0.38),
      sd: mix(s, '#1d201f', 0.22),
      o: mix(p, '#141617', albino ? 0.6 : 0.72),
      iris: albino ? '#a84f66' : EYE
    };
  }

  /* ---- drawing helpers ---- */
  function shape(d, fill, c, extra) {
    return '<path d="' + d + '" fill="' + fill + '" stroke="' + c.o + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"' + (extra || '') + '/>';
  }
  function flat(d, fill, extra) {
    return '<path d="' + d + '" fill="' + fill + '"' + (extra || '') + '/>';
  }
  function line(d, stroke, width, extra) {
    return '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + (width || 1.6) + '" stroke-linecap="round" stroke-linejoin="round"' + (extra || '') + '/>';
  }
  function tube(d, width, fill, c) {
    return line(d, c.o, width + 4.4) + line(d, fill, width);
  }
  function dot(x, y, r, fill, extra) {
    return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + fill + '"' + (extra || '') + '/>';
  }
  function ring(x, y, r, fill, c) {
    return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + fill + '" stroke="' + c.o + '" stroke-width="2.2"/>';
  }
  function glow(x, y, r) {
    return dot(x, y, r * 2.1, GLOW, ' opacity=".28"') + dot(x, y, r, GLOW);
  }
  function both(markup) {
    return markup + '<g transform="translate(79 0) scale(-1 1)">' + markup + '</g>';
  }
  function at(x, y, markup) {
    return '<g transform="translate(' + x + ' ' + y + ')">' + markup + '</g>';
  }

  /* ---- body: 14 silhouettes with their own features ---- */
  var ROUND = 'M47 63C47 49 61 45 76 46C92 47 100 56 99 68C98 80 88 85 72 85C56 85 47 77 47 63Z';
  var SLIM = 'M47 65C47 55 61 52 76 53C90 54 98 60 97 70C96 80 88 84 72 84C56 84 47 77 47 65Z';
  var PLUMP = 'M46 62C46 45 61 41 77 42C95 43 103 54 102 67C101 81 90 86 72 86C54 86 46 78 46 62Z';
  var LONG = 'M47 64C47 53 61 50 78 51C96 52 105 59 104 69C103 80 92 85 74 85C56 85 47 77 47 64Z';
  var BLOCK = 'M47 61C47 50 54 47 64 47L88 48C97 49 101 55 101 63L100 75C99 82 94 85 86 85L60 85C51 85 47 80 47 73Z';
  var BODY = [PLUMP, SLIM, ROUND, ROUND, LONG, PLUMP, SLIM, ROUND, ROUND, LONG, SLIM, ROUND, ROUND, BLOCK];
  var BELLY = '<ellipse cx="70" cy="82" rx="19" ry="8"/>';

  function bodyBack(n, c) {
    if (n === 8) return shape('M60 52L63 38L69 49Z', ICE, c) + shape('M70 49L76 32L82 48Z', ICE, c) + shape('M83 50L90 40L92 54Z', ICE, c) + line('M76 36L76 46', '#ffffff', 1.2, ' opacity=".8"');
    if (n === 12) return shape('M58 53L62 39L69 48L75 34L81 47L89 38L93 55Z', c.s, c);
    return '';
  }
  function bodyInside(n, c) {
    if (n === 0) return flat('M44 64L52 66L50 71L58 72L57 78L65 79L63 85L70 88L44 90Z', c.b) + line('M52 66L50 71L58 72L57 78L65 79L63 85', c.o, 1.2, ' opacity=".4"');
    if (n === 3) return flat('M44 64C50 62 54 66 54 70C60 68 64 73 62 77C68 76 72 82 68 88L44 90Z', c.b) + line('M54 70C54 73 52 75 50 76M62 77C62 80 60 82 58 83', c.o, 1.2, ' opacity=".4"');
    if (n === 5) return flat('M40 62C52 34 96 34 106 62C92 68 60 69 40 62Z', c.d) + line('M52 64C62 67 88 67 102 62M62 44L60 66M75 40L75 67M88 44L90 66', c.o, 1.5, ' opacity=".55"');
    if (n === 7) return '<ellipse cx="70" cy="80" rx="17" ry="9" fill="' + GLOW + '" opacity=".85"/>';
    if (n === 10) return '<g fill="' + c.b + '">' + BELLY + '</g>' + line('M60 78L60 85M68 78L68 86M76 78L76 86M84 78L84 85', c.sd, 1.3, ' opacity=".5"');
    if (n === 11) return flat('M44 78C48 72 54 72 57 76C60 70 68 70 71 76C74 70 82 70 85 76C88 72 96 72 102 78L102 90L44 90Z', c.b);
    if (n === 13) return line('M58 48L62 58L56 66M84 49L80 60L88 70', c.o, 1.4, ' opacity=".5"') + '<g fill="' + c.l + '" opacity=".45"><path d="M64 50L76 49L72 58L62 58Z"/></g>';
    if (n === 1 || n === 2 || n === 4 || n === 9) return '<g fill="' + c.b + '">' + BELLY + '</g>';
    return '';
  }
  function bodyFront(n, c) {
    if (n === 6) return shape('M67 61C63 46 72 35 88 31C86 37 89 40 94 40C90 44 92 48 96 50C89 52 86 60 77 64Z', c.s, c) + line('M70 59C74 50 80 42 87 36M74 61C80 54 86 49 92 46', c.o, 1.3, ' opacity=".5"');
    return '';
  }

  /* ---- feet: one leg drawn around x = 0, from y 74 down to the ground at y 94 ---- */
  var PAW = 'M-4 74V87C-8 87 -9 94 -4 94H4C8 94 7 87 4 87V74Z';
  function leg(n, c, far) {
    var fill = far ? c.d : c.p;
    if (n === 0) return shape('M-4 74V88H4V74Z', fill, c) + shape('M-5.5 87H5.5V92C5.5 94 4 94 3 94H-3C-4 94 -5.5 94 -5.5 92Z', mix(c.o, c.p, 0.25), c);
    if (n === 1) return shape(PAW, fill, c);
    if (n === 2) return shape(PAW, fill, c) + flat('M-7 92L-5 89L-3.5 93ZM-2 93L0 89.5L2 93ZM3 93L5 89L7 92Z', HORN, ' stroke="' + c.o + '" stroke-width=".9" stroke-linejoin="round"');
    if (n === 3) return shape('M-2.5 80V92H-6L-8 94H5L3 92H2.5V80Z', BEAK, c) + shape('M-6 73L-7 82L-3.5 79L-1 84L1.5 79L4 84L6.5 79L6 73Z', far ? c.s : c.b, c);
    if (n === 4) return shape('M-3 72V88C-6 88 -7 94 -3 94H3C6 94 5 88 3 88V72Z', fill, c);
    if (n === 5) return shape('M-6.5 74V89C-6.5 94 -4 94 0 94C4 94 6.5 94 6.5 89V74Z', fill, c) + line('M-3 91.5V94M0 91.5V94M3 91.5V94', c.o, 1.2, ' opacity=".6"');
    if (n === 6) return shape('M-2.5 74V88H2.5V74Z', fill, c) + shape('M-7 94L-5 88H5L7 94L3 91L0 94L-3 91Z', far ? c.sd : c.s, c);
    if (n === 7) return shape(PAW, fill, c) + dot(-3.5, 91.5, 1.5, GLOW) + dot(0, 92, 1.5, GLOW) + dot(3.5, 91.5, 1.5, GLOW);
    if (n === 8) return shape(PAW, fill, c) + flat('M-4 84V87C-8 87 -9 94 -4 94H4C8 94 7 87 4 87V84Z', ICE, ' stroke="' + c.o + '" stroke-width="2.2" stroke-linejoin="round"');
    if (n === 9) return shape('M-4 74V87C-10 87 -11 94 -5 94H5C11 94 10 87 4 87V74Z', fill, c) + line('M-4 91V94M0 90.5V94M4 91V94', c.o, 1.2, ' opacity=".55"');
    if (n === 10) return shape('M-3 74V87H3V74Z', fill, c) + shape('M-9 94C-8 89 -5 86 0 86C5 86 8 89 9 94Z', far ? c.sd : c.s, c) + line('M-3 88L-4.5 93M3 88L4.5 93', c.o, 1.1, ' opacity=".55"');
    if (n === 11) return shape('M-7 86C-10 80 -3 76 0 80C3 76 10 80 7 86C10 90 6 95 0 93C-6 95 -10 90 -7 86Z', far ? mix(c.b, c.d, 0.35) : c.b, c);
    if (n === 12) return shape('M-1.8 74V90L-7 94H7L1.8 90V74Z', BEAK, c) + line('M0 90V94', c.o, 1.1, ' opacity=".6"');
    return shape('M-6 74V94H6V74Z', fill, c) + line('M-6 85L-1 87L2 84L6 86', c.o, 1.3, ' opacity=".55"');
  }
  function behind(x, markup) {
    return '<g transform="translate(' + x + ' 12.2) scale(.86)">' + markup + '</g>';
  }
  function legs(n, c, far, long) {
    var back = long ? 4 : 0;
    return far ? behind(67, leg(n, c, true)) + behind(80 + back, leg(n, c, true)) : at(57, 0, leg(n, c, false)) + at(90 + back, 0, leg(n, c, false));
  }

  /* ---- tail: grows from the back of the body at about (96, 68) ---- */
  function tail(n, c) {
    if (n === 0) return shape('M92 66C101 60 107 59 110 51C114 58 113 66 109 70C104 75 98 75 92 73Z', c.p, c) + line('M103 62L107 60M104 68L109 66', c.o, 1.2, ' opacity=".5"');
    if (n === 1) return shape('M96 62C96 56 104 55 105 60C110 58 114 64 110 68C113 73 107 77 103 74C99 77 93 73 96 69C92 67 93 62 96 62Z', c.b, c);
    if (n === 2) return shape('M92 62L106 53L104 61L114 60L106 67L112 75L92 74Z', c.d, c);
    if (n === 3) return shape('M92 70C96 56 100 44 106 38C110 46 108 60 100 72Z', c.p, c) + shape('M94 72C102 60 110 52 117 50C118 59 112 69 100 75Z', c.s, c) + shape('M94 73C103 68 111 68 116 71C113 78 104 80 95 77Z', c.p, c) + line('M97 67L105 42M98 72L115 53M98 75L114 72', c.o, 1.1, ' opacity=".45"');
    if (n === 4) return tube('M94 70C108 73 115 62 111 51C108 42 99 44 101 51', 5.2, c.p, c) + ring(101, 51, 4.6, c.s, c);
    if (n === 5) return shape('M92 60C104 58 114 62 117 73C108 78 100 78 92 76Z', c.d, c) + line('M100 60L100 77M107 62L106 77M113 66L111 76', c.o, 1.3, ' opacity=".55"');
    if (n === 6) return tube('M94 70C104 72 109 64 106 54', 2.6, c.p, c) + shape('M106 54L99 51L107 40L114 52Z', c.s, c);
    if (n === 7) return tube('M94 70C106 70 110 60 107 48', 3, c.p, c) + dot(107, 44, 11, GLOW, ' opacity=".28"') + ring(107, 44, 5.6, GLOW, c);
    if (n === 8) return tube('M94 70C100 70 104 66 105 60', 3.4, c.p, c) + shape('M105 62L98 50L106 36L114 50Z', ICE, c) + line('M106 40L105 58M100 50L112 50', '#ffffff', 1.1, ' opacity=".8"');
    if (n === 9) return shape('M92 61C105 60 114 67 118 80C108 81 100 79 92 76Z', c.p, c) + flat('M97 72C104 73 111 76 116 79C108 80 101 79 95 76Z', c.b);
    if (n === 10) return tube('M94 70C102 70 106 62 106 50', 2.2, c.sd, c) + shape('M102 52C102 38 104 30 106 30C108 30 110 38 110 52C110 56 102 56 102 52Z', c.s, c) + line('M106 30V24', c.o, 1.6);
    if (n === 11) return ring(99, 67, 7, c.b, c) + ring(108, 59, 5.2, c.b, c) + ring(113, 50, 3.6, c.b, c) + flat('M94 62L100 62L103 68L98 73L93 72Z', c.b);
    if (n === 12) return shape('M92 70C98 52 103 38 114 29C119 44 114 60 100 75Z', c.s, c) + line('M97 70C103 56 108 44 113 33M103 56L109 56M100 63L107 64M106 48L111 47', c.o, 1.2, ' opacity=".5"');
    return tube('M94 70C99 70 102 67 104 63', 4, c.p, c) + shape('M100 52L112 50L115 62L104 66Z', c.d, c) + line('M104 54L108 58L106 63', c.o, 1.2, ' opacity=".55"');
  }

  /* ---- coat: what grows out of the back, and the pattern on body and head ---- */
  function coatBack(n, c) {
    if (n === 0) return shape('M54 56L57 43L63 50L67 39L73 47L78 37L83 47L89 40L93 56Z', c.l, c);
    if (n === 2) return shape('M53 56L52 40L60 49L63 33L70 46L76 30L81 45L89 34L90 48L98 44L95 60Z', c.sd, c);
    return '';
  }
  function coatBody(n, c) {
    if (n === 1) return flat('M40 74C54 70 92 70 106 76L106 92L40 92Z', c.b);
    if (n === 3) return line('M60 58Q64 63 68 58Q72 63 76 58Q80 63 84 58Q88 63 92 58M56 66Q60 71 64 66Q68 71 72 66Q76 71 80 66Q84 71 88 66Q92 71 96 66M60 74Q64 79 68 74Q72 79 76 74Q80 79 84 74Q88 79 92 74', c.s, 1.7);
    if (n === 4) return line('M66 44C63 52 64 58 67 63M76 43C73 52 74 60 77 66M86 44C83 53 84 60 88 65M95 50C92 56 93 62 96 66', c.s, 3.4);
    if (n === 5) return line('M56 60H98M52 70H100M66 46V60M80 44V60M92 48V60M60 60V70M74 60V70M88 60V70M68 70V86M82 70V86', c.sd, 1.5, ' opacity=".7"');
    if (n === 6) return flat('M44 56C52 40 94 38 104 60C92 50 60 50 44 56Z', c.s);
    if (n === 7) return glow(68, 58, 2.6) + glow(80, 54, 2.2) + glow(90, 63, 2.6) + glow(77, 69, 2);
    if (n === 8) return flat('M44 58C52 40 94 38 104 62C92 54 60 53 44 58Z', ICE, ' opacity=".75"') + '<g fill="#ffffff">' + dot(66, 62, 1.5, '#ffffff') + dot(76, 66, 1.3, '#ffffff') + dot(86, 62, 1.5, '#ffffff') + dot(92, 70, 1.2, '#ffffff') + dot(70, 72, 1.2, '#ffffff') + '</g>';
    if (n === 9) return dot(66, 56, 2.1, c.s) + dot(75, 52, 1.7, c.s) + dot(84, 56, 2.1, c.s) + dot(92, 62, 1.7, c.s) + dot(71, 64, 1.7, c.s) + dot(81, 66, 2.1, c.s) + dot(90, 72, 1.7, c.s) + dot(64, 71, 1.6, c.s);
    if (n === 10) return line('M64 46V84M71 44V86M78 44V86M85 44V86M92 46V84', c.s, 1.9, ' opacity=".8"');
    if (n === 11) return flat('M62 52C68 46 78 48 78 55C84 54 86 62 80 65C76 70 64 68 62 62C58 60 58 54 62 52Z', c.s, ' opacity=".9"') + flat('M86 68C90 64 98 66 98 72C102 76 96 82 90 80C84 80 82 72 86 68Z', c.s, ' opacity=".9"');
    if (n === 12) return flat('M60 44C70 40 90 40 98 50C96 62 86 68 74 66C64 64 58 54 60 44Z', c.s);
    if (n === 13) return flat('M62 50L74 47L80 56L70 62L60 58Z', c.s) + flat('M84 62L96 60L99 70L90 76L82 70Z', c.s) + line('M70 62L72 70L66 76M80 56L86 58', c.o, 1.2, ' opacity=".5"');
    return '';
  }
  function coatHead(n, c) {
    if (n === 1) return flat('M14 56C24 52 54 52 66 56L66 72L14 72Z', c.b);
    if (n === 4) return line('M32 24L33 33M39.5 23V34M47 24L46 33', c.s, 3);
    if (n === 6) return flat('M33 22H46L43 40C42 43 37 43 36 40Z', c.s);
    if (n === 7) return glow(39.5, 34, 2.4);
    if (n === 8) return flat('M12 40C20 22 60 22 68 40C56 32 24 32 12 40Z', ICE, ' opacity=".75"');
    if (n === 9) return dot(22, 54, 1.4, c.s) + dot(26, 57, 1.2, c.s) + dot(57, 54, 1.4, c.s) + dot(53, 57, 1.2, c.s) + dot(36, 31, 1.5, c.s) + dot(43, 31, 1.5, c.s);
    if (n === 10) return line('M35 24V33M39.5 23V35M44 24V33', c.s, 1.9, ' opacity=".8"');
    if (n === 11) return flat('M40 30C48 26 62 32 62 46C62 56 52 60 44 56C38 52 36 36 40 30Z', c.s, ' opacity=".9"');
    if (n === 12) return flat('M40 34C46 30 60 34 60 46C60 56 52 60 45 57C39 54 37 40 40 34Z', c.s);
    if (n === 13) return flat('M18 34L30 28L36 36L26 42Z', c.s) + line('M50 28L54 36L50 40', c.o, 1.2, ' opacity=".5"');
    return '';
  }

  /* ---- head: the same round face for every species; ears, horns and muzzle make the kind ---- */
  var HEAD = 'M14 48C14 33 25 24 39.5 24C54 24 65 33 65 48C65 62 54 71 39.5 71C25 71 14 62 14 48Z';
  var SMALL_EAR = 'M19 38C10 34 8 26 13 21C20 21 26 26 28 31Z';
  function headBack(n, c) {
    if (n === 0) return both(shape('M18 42C9 40 6 46 9 51C14 51 18 48 20 45Z', c.p, c)) + both(shape('M25 32C16 27 13 16 19 8C22 17 27 21 33 26Z', HORN, c) + line('M19 17L24 19', c.o, 1.1, ' opacity=".45"'));
    if (n === 1) return both(shape('M21 36C12 22 14 7 23 2C31 8 34 22 34 30Z', c.p, c) + flat('M24 30C19 21 20 12 24 8C28 13 30 21 30 28Z', c.b));
    if (n === 2) return shape('M20 36L17 21L26 28L28 14L35 25L39.5 11L44 25L51 14L53 28L62 21L59 36Z', c.sd, c) + both(ring(18, 37, 5.5, c.p, c));
    if (n === 3) return shape('M39.5 28C30 22 24 12 26 4C34 8 40 18 39.5 28Z', c.s, c) + shape('M39.5 28C49 22 55 12 53 4C45 8 39 18 39.5 28Z', c.s, c) + shape('M39.5 28C34 19 35 7 39.5 1C44 7 45 19 39.5 28Z', c.b, c);
    if (n === 4) return both(shape('M17 40L16 13L37 27Z', c.p, c) + flat('M21 32L20.5 21L30 28Z', c.b));
    if (n === 5) return both(shape('M23 31C18 21 22 13 28 12C33 17 34 24 33 29Z', c.p, c) + flat('M26 27C24 22 25 18 28 17C30 20 31 24 30 27Z', c.b));
    if (n === 6) return both(shape('M19 40C7 31 3 15 11 3C17 14 28 18 35 28Z', c.p, c) + flat('M19 33C13 27 11 19 13 12C18 19 24 23 29 28Z', c.b));
    if (n === 7) return both(ring(18, 35, 6, c.p, c)) + both(line('M32 28C31 18 27 12 21 9', c.o, 2.4) + dot(20, 9, 9, GLOW, ' opacity=".28"') + ring(20, 9, 4.2, GLOW, c));
    if (n === 8) return both(shape(SMALL_EAR, c.p, c)) + both(shape('M27 30L21 10L28 16L32 4L37 27Z', ICE, c) + line('M31 9L31 24M24 15L29 21', '#ffffff', 1.1, ' opacity=".8"'));
    if (n === 9) return both(shape('M21 40C5 35 -1 20 3 7C16 9 31 18 37 28Z', c.p, c) + flat('M19 33C10 29 6 21 7 13C16 16 25 22 30 28Z', c.b));
    if (n === 10) return both(ring(19, 32, 7.5, c.p, c) + dot(19, 32, 3.8, c.b));
    if (n === 11) return both(shape('M18 38C7 38 2 50 7 63C14 65 19 56 21 47Z', c.s, c));
    if (n === 12) return both(shape('M18 40L11 22L29 30Z', c.p, c));
    return both(shape('M22 31C11 28 6 37 9 51C16 53 23 46 25 37Z', c.sd, c));
  }
  function headFront(n, c) {
    if (n === 0) return shape('M28 28L32 35L36 29L39.5 37L43 29L47 35L51 28C46 21 33 21 28 28Z', c.b, c);
    if (n === 5) return flat('M12 40C20 20 59 20 67 40C55 34 24 34 12 40Z', c.d) + line('M16 39C26 34 53 34 63 39M30 25V34M39.5 24V33M49 25V34', c.o, 1.4, ' opacity=".55"');
    if (n === 10) return line('M39.5 25C38 18 34 14 30 13M39.5 25C41 17 45 13 49 13M39.5 25V12', c.o, 2);
    if (n === 12) return shape('M34 30L39.5 6L45 30C42 32 37 32 34 30Z', HORN, c) + line('M37 22L42 21M38 15L41 14.5', c.o, 1.1, ' opacity=".45"');
    return '';
  }
  // The muzzle sits in the lower middle of the face, around (39.5, 59).
  function muzzle(n, c) {
    var mouth = line('M35.5 61.5Q37.5 64.5 39.5 61.5Q41.5 64.5 43.5 61.5', c.o, 1.5);
    var nose = flat('M37 57.5H42C43 57.5 43 59 42 59.8L40.2 61.2C39.8 61.5 39.2 61.5 38.8 61.2L37 59.8C36 59 36 57.5 37 57.5Z', c.o);
    var patch = '<ellipse cx="39.5" cy="61" rx="10" ry="7" fill="' + c.b + '"/>';
    var whiskers = line('M23 60L15 59M23 63L16 65M56 60L64 59M56 63L63 65', c.o, 1, ' opacity=".55"');
    if (n === 3) return shape('M35 57C37 55 42 55 44 57L39.5 64.5Z', BEAK, c);
    if (n === 12) return shape('M32.5 56C36 53 43 53 46.5 56L39.5 68Z', BEAK, c) + line('M34 58.5C37 60 42 60 45 58.5', c.o, 1.1, ' opacity=".55"');
    if (n === 2 || n === 5) return '<ellipse cx="39.5" cy="62" rx="8" ry="6.5" fill="' + c.b + '"/>' + '<ellipse cx="39.5" cy="59" rx="3.6" ry="2.8" fill="' + c.o + '"/>' + line('M39.5 62V64.5M36.5 66Q39.5 68 42.5 66', c.o, 1.4);
    if (n === 0 || n === 10 || n === 13) return patch + '<ellipse cx="39.5" cy="58.5" rx="3.8" ry="2.7" fill="' + c.o + '"/>' + line('M39.5 61V63M35 64Q37.3 67 39.5 64Q41.7 67 44 64', c.o, 1.5);
    if (n === 4 || n === 9) return nose + mouth + whiskers;
    if (n === 6) return nose + mouth + flat('M36.5 63.2L37.6 66L38.7 63.4ZM40.3 63.4L41.4 66L42.5 63.2Z', WHITE);
    if (n === 1) return nose + mouth + flat('M38 63.6H41V66.6C41 67.4 38 67.4 38 66.6Z', WHITE, ' stroke="' + c.o + '" stroke-width=".8"');
    return nose + mouth;
  }
  function eye(x, c, sleepy) {
    if (sleepy) {
      return flat('M' + (x - 5.4) + ' 47.5H' + (x + 5.4) + 'C' + (x + 5.4) + ' 52.5 ' + (x + 3.2) + ' 55.2 ' + x + ' 55.2C' + (x - 3.2) + ' 55.2 ' + (x - 5.4) + ' 52.5 ' + (x - 5.4) + ' 47.5Z', WHITE) +
        flat('M' + (x - 4.6) + ' 47.5H' + (x + 4.6) + 'C' + (x + 4.6) + ' 52 ' + (x + 2.8) + ' 54.6 ' + x + ' 54.6C' + (x - 2.8) + ' 54.6 ' + (x - 4.6) + ' 52 ' + (x - 4.6) + ' 47.5Z', c.iris) +
        dot(x - 1.6, 49.6, 1.5, '#ffffff') + line('M' + (x - 6.2) + ' 47.5H' + (x + 6.2), c.o, 1.8);
    }
    return '<ellipse cx="' + x + '" cy="49" rx="5.4" ry="6.2" fill="' + WHITE + '"/>' +
      '<ellipse cx="' + x + '" cy="49.4" rx="4.6" ry="5.6" fill="' + c.iris + '"/>' +
      dot(x - 1.6, 46.8, 1.9, '#ffffff') + dot(x + 1.7, 51.6, 0.95, '#ffffff', ' opacity=".9"');
  }
  function face(n, c) {
    return '<g fill="' + BLUSH + '" opacity=".5"><ellipse cx="21.5" cy="58" rx="4.2" ry="2.6"/><ellipse cx="57.5" cy="58" rx="4.2" ry="2.6"/></g>' +
      muzzle(n, c) + eye(28.5, c, n === 11) + eye(50.5, c, n === 11);
  }

  function group(part, n, markup) {
    return '<g data-part="' + part + '" data-species="' + n + '">' + markup + '</g>';
  }
  function svg(beast) {
    var key = 'beast-art-' + (++serial);
    var c = tones(beast);
    var head = visible(beast, 0);
    var body = visible(beast, 1);
    var feet = visible(beast, 2);
    var tl = visible(beast, 3);
    var coat = visible(beast, 4);
    var shining = (beast.traits || []).indexOf('glow') >= 0;
    var long = BODY[body] === LONG;
    var clipBody = 'clip-path="url(#' + key + '-b)"';
    var clipHead = 'clip-path="url(#' + key + '-h)"';
    var out = '<svg viewBox="0 0 120 96" class="m-beast-art" role="img" aria-label="' + String(beast.name || 'Зверь').replace(/[&<>"]/g, '') + '">' +
      '<defs><clipPath id="' + key + '-b"><path d="' + BODY[body] + '"/></clipPath><clipPath id="' + key + '-h"><path d="' + HEAD + '"/></clipPath></defs>';
    out += group('tail', tl, tail(tl, c));
    out += group('feet', feet, legs(feet, c, true, long));
    out += group('coat', coat, coatBack(coat, c));
    out += group('body', body, bodyBack(body, c) + shape(BODY[body], c.p, c) + '<g ' + clipBody + '>' + bodyInside(body, c) + '</g>');
    out += group('coat', coat, '<g ' + clipBody + '>' + coatBody(coat, c) + (shining && coat !== 7 ? coatBody(7, c) : '') + '</g>');
    out += line(BODY[body], c.o, 2.2);
    out += group('feet', feet, legs(feet, c, false, long));
    out += group('body', body, bodyFront(body, c));
    out += group('head', head, headBack(head, c) + shape(HEAD, c.p, c));
    out += group('coat', coat, '<g ' + clipHead + '>' + coatHead(coat, c) + '</g>');
    out += group('head', head, '<g ' + clipHead + '>' + (head === 5 ? headFront(5, c) : '') + '</g>' + line(HEAD, c.o, 2.2) + face(head, c) + (head === 5 ? '' : headFront(head, c)));
    return out + '</svg>';
  }
  function draw(beast, options) {
    var o = options || {};
    var host = document.createElement('span');
    host.className = 'm-art' + (o.large ? ' m-art-large' : '');
    host.innerHTML = svg(beast);
    return host;
  }
  window.MenagerieArt = {
    draw: draw,
    svg: svg,
    colors: palette,
    configure: function (catalog) {
      if (catalog.species) species = catalog.species.map(function (s) { return s.id; });
      if (catalog.palette) palette = catalog.palette.map(function (p) { return p.color; });
    }
  };
})();
