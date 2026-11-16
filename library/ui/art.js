// The pictures of «Библиотека»: line drawings on a 24×24 grid, one for every thing that comes in a
// list — kinds of books, branches, halls, unique tomes, seats of the council, events, buildings, the
// reading upgrades and the cards. A picture sits on a small plate of the thing's colour (a branch,
// paper, gold, grey); the lines are the colour of paper. No text inside, no shadows.
//   LibArt.icon('kind3', { tone: 'b2', size: 'big', off: true })  → <span class="l-ic …"><svg/></span>
//   LibArt.has(name), LibArt.svg(name)
// Inside a drawing: plain shapes are outlines; class="f" adds a soft fill; class="d" is a solid dot.
(function () {
  const P = {
    // ---- the 8 kinds of books ----
    kind0: '<rect class="f" x="4" y="8" width="16" height="4" rx="1"/><rect class="f" x="5" y="12" width="14" height="4" rx="1"/><rect class="f" x="4" y="16" width="16" height="4" rx="1"/><path d="M12 8v12M12 8c-2-3.5-5-2.5-3.5-.5M12 8c2-3.5 5-2.5 3.5-.5"/>',
    kind1: '<rect class="f" x="4" y="5" width="4" height="14" rx="1"/><rect x="8" y="7" width="4" height="12" rx="1"/><path class="f" d="M13.2 8.2l3.8-1 3 11.2-3.8 1z"/><path d="M3 19.5h18M5.5 8h1M9.5 10h1"/>',
    kind2: '<rect class="f" x="5" y="4" width="13" height="16" rx="1.5"/><path d="M9 4v16M12 8h3.5M12 11h3.5M18 7h2.5v3H18M18 12h2.5v3H18"/>',
    kind3: '<path class="f" d="M4 6h13v12H6a2 2 0 0 1-2-2z"/><path d="M17 9h3v7a2 2 0 0 1-2 2h-2M7 9h7M7 12h3M7 15h3"/><rect x="12" y="12" width="2.5" height="3"/>',
    kind4: '<rect class="f" x="3" y="6" width="18" height="13" rx="1.5"/><path d="M6 16l3.5-4 2.5 3 2-2 3.5 3"/><circle cx="15.5" cy="10" r="1.3"/>',
    kind5: '<rect class="f" x="5" y="3.5" width="13" height="17" rx="1.5"/><path d="M8.5 3.5v17M18 8.5h2.5v2.5H18M18 14h2.5v2.5H18M13.2 7l2 2-2 2-2-2zM11.5 15h3.5"/>',
    kind6: '<path class="f" d="M7 5h11v11a3 3 0 0 1-3 3H7z"/><path d="M7 7H3V5.5a2 2 0 0 1 4 0zM15 19H6.5a2.5 2.5 0 0 1-2.5-2.5V16h8M10 9h5M10 12h5"/>',
    kind7: '<rect class="f" x="4" y="3.5" width="16" height="17" rx="1.5"/><path d="M4 9.2h16M4 14.8h16M7 5.5v3.7M9.5 5.5v3.7M13 6l1.5 3.2M7 11.2v3.6M15 11.2v3.6M17.5 11.2v3.6M10 16.8v3.7M12.5 16.8v3.7"/>',

    // ---- the 6 branches ----
    branch0: '<path class="f" d="M5 19c0-9 5-14 14-14 0 9-5 14-14 14z"/><path d="M5 19l9-9M9.5 14.5h4M11.5 12.5v-4"/>',
    branch1: '<path class="f" d="M8 7h8v12H8z"/><path d="M5 20h14M6 7h12M7 4.5h10M10.7 9v8M13.3 9v8"/>',
    branch2: '<path class="f" d="M20 4c-7 0-12 4-13 11l3 2c7-1 10-6 10-13z"/><path d="M4 20l6-6M12.5 9.5l2.5 2.5"/>',
    branch3: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><rect class="f" x="7" y="7" width="10" height="10"/><path d="M7 15l3-3 2 2 2-2 3 3"/>',
    branch4: '<path class="f" d="M4 6h10l3 2.5V11H4z"/><path d="M9.5 11v9.5M17.5 14v6.5M15.5 14h4"/>',
    branch5: '<circle class="f" cx="8" cy="8" r="4.2"/><circle class="d" cx="8" cy="8" r="1"/><path d="M11 11l8.5 8.5M15 15l2.2-2.2M17.8 17.8L20 15.6"/>',

    // ---- reading upgrades ----
    lamp: '<path class="f" d="M8 4h7l3 6.5H5z"/><path d="M11.5 10.5V19M7.5 20h8M9.5 13.5h4"/>',
    glasses: '<circle class="f" cx="7.5" cy="14" r="3.5"/><circle class="f" cx="16.5" cy="14" r="3.5"/><path d="M11 14c.6-1 1.4-1 2 0M4.2 13L6 6.5M19.8 13L18 6.5"/>',
    silence: '<path class="f" d="M7 16v-5a5 5 0 0 1 10 0v5l2 2H5z"/><path d="M10.5 20.5h3M4 4l16 16"/>',

    // ---- halls ----
    reading: '<path class="f" d="M3.5 7.5c3-1.5 5.5-1.5 8.5 0 3-1.5 5.5-1.5 8.5 0v10c-3-1.5-5.5-1.5-8.5 0-3-1.5-5.5-1.5-8.5 0z"/><path d="M12 7.5v10M6 10.5h3.5M6 13.5h3.5M14.5 10.5H18M14.5 13.5H18"/>',
    children: '<rect class="f" x="4" y="12" width="7" height="7.5" rx="1"/><rect x="11" y="12" width="7" height="7.5" rx="1"/><rect class="f" x="7.5" y="4.5" width="7" height="7.5" rx="1"/><path d="M9.5 8.2h3M6 15.8h3"/>',
    periodicals: '<path d="M3.5 5h17"/><path class="f" d="M6 5h12v14H6z"/><path d="M9 9h6M9 12h6M9 15h3"/>',
    lending: '<rect class="f" x="3.5" y="6" width="17" height="12" rx="1.5"/><path d="M6.5 10h6M6.5 13.5h4"/><circle cx="16" cy="13" r="2.2"/>',
    herbarium: '<rect class="f" x="5" y="3.5" width="14" height="17" rx="1"/><path d="M12 18v-8M12 14c-2.2 0-3.2-1.2-3.2-3M12 12.5c2.2 0 3.2-1.2 3.2-3"/><circle cx="12" cy="8" r="1.6"/>',
    maps: '<path class="f" d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2z"/><path d="M9 4v14M15 6v14"/>',
    gallery: '<path d="M12 3L7 7M12 3l5 4"/><rect class="f" x="5" y="7" width="14" height="12.5" rx="1"/><path d="M8 16.5l3-3 2 2 3-3"/>',
    manuscripts: '<path class="f" d="M5 14h9v4a2.5 2.5 0 0 1-2.5 2.5h-4A2.5 2.5 0 0 1 5 18z"/><path d="M7 14v-2h5v2M10.5 11L19 3M19 3c0 4-1.8 6-5 7"/>',
    music: '<path d="M9 17V6.5l10-2.5v11"/><circle class="f" cx="6.5" cy="17" r="2.5"/><circle class="f" cx="16.5" cy="15" r="2.5"/><path d="M9 10l10-2.5"/>',
    secret: '<path class="f" d="M6 20V9.5a6 6 0 0 1 12 0V20z"/><circle cx="12" cy="12" r="1.6"/><path d="M12 13.6V17M4 20h16"/>',
    scrolls: '<rect class="f" x="6" y="5" width="12" height="14"/><path d="M4 5h16M4 19h16M9 9h6M9 12h6M9 15h4"/>',
    observatory: '<path class="f" d="M5 19v-5a7 7 0 0 1 14 0v5z"/><path d="M3 19.5h18M12 7v12M13.5 9.5L19.5 4"/>',
    lab: '<rect class="f" x="4" y="4" width="16" height="16" rx="1"/><path d="M8 4v8h4M16 20v-8h-4M8 16h4M12 8h4"/>',

    // ---- the council ----
    desks: '<path class="f" d="M3 8h18v3H3z"/><path d="M5 11v9M19 11v9M13 11v5h6"/>',
    coins: '<ellipse class="f" cx="12" cy="7" rx="7" ry="3"/><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
    vault: '<rect class="f" x="4" y="4" width="16" height="16" rx="2"/><circle cx="12" cy="12" r="3.5"/><path d="M12 8.5V7M12 17v-1.5M15.5 12H17M7 12h1.5"/>',
    read: '<path d="M6 4h12M6 20h12"/><path class="f" d="M7 4c0 5 5 5 5 8s-5 3-5 8h10c0-5-5-5-5-8s5-3 5-8z"/>',
    offline: '<path class="f" d="M19 14.5A8 8 0 1 1 9.5 5a6.5 6.5 0 0 0 9.5 9.5z"/><path d="M16.5 3.5v3M15 5h3"/>',
    librarian: '<circle class="f" cx="12" cy="8" r="3.5"/><path class="f" d="M5 20c0-4 3-6 7-6s7 2 7 6z"/>',
    unique: '<path class="f" d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.3 6-5.4-3.1-5.4 3.1 1.3-6L3.4 9.3l6-.7z"/>',
    memory: '<path class="f" d="M7 3.5h10v17l-5-4-5 4z"/><path d="M10 8h4"/>',
    catalog: '<rect class="f" x="4" y="5" width="16" height="6" rx="1"/><rect class="f" x="4" y="13" width="16" height="6" rx="1"/><path d="M10 8h4M10 16h4"/>',

    // ---- cards and resources ----
    crate: '<path class="f" d="M4 8l8-4 8 4v9l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v9"/>',
    heart: '<path class="f" d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
    treatise: '<path class="f" d="M6 3.5h9l4 4v13H6z"/><path d="M15 3.5v4h4M9 12h7M9 15h7M9 18h4"/>',
    exhibit: '<path class="f" d="M5 10h14v7H5z"/><path d="M4 20h16M7 17v3M17 17v3M8 10V6h8v4M11 8h2"/>',
    restore: '<path class="f" d="M14 4l6 6-7 7-6-6z"/><path d="M7 11l-3 9 9-3"/>',
    exlibris: '<path class="f" d="M9.5 4h5v5l2 4h-9l2-4z"/><path d="M5 16h14v4H5z"/>',
    clock: '<circle class="f" cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
    plus: '<path d="M12 6v12M6 12h12"/>',
    closed: '<rect class="f" x="6" y="11" width="12" height="9" rx="1.5"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 14.5v2"/>',
    unknown: '<rect class="f" x="6" y="4" width="12" height="16" rx="1.5"/><path d="M9 4v16"/>',
    road: '<path class="f" d="M5 5h14v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M5 11h14M8 17l-2 3M16 17l2 3M8.5 14h.5M15 14h.5"/>',

    // ---- buildings ----
    building0: '<path class="f" d="M4 11l8-6 8 6v9H4z"/><path d="M10 20v-5h4v5M3 20h18"/>',
    building1: '<path class="f" d="M4 20V8h7v12M11 20V4h9v16"/><path d="M6.5 11h2M6.5 14h2M14 8h3M14 11h3M14 14h3M3 20h18"/>',
    building2: '<path class="f" d="M3 9l9-5 9 5z"/><path d="M5.5 9v9M9.5 9v9M14.5 9v9M18.5 9v9M3 20.5h18M4 18h16"/>',
    building3: '<path class="f" d="M7 11a5 5 0 0 1 10 0z"/><path d="M12 6V3M4 11h16M5.5 11v9M18.5 11v9M3 20.5h18M9.5 14v6M14.5 14v6"/>',
    building4: '<path class="f" d="M8 20V7h8v13"/><path d="M3 20v-9h5M16 11h5v9M2 20.5h20M12 7V3h3.5M10.5 11h3M10.5 14h3"/>',

    // ---- events ----
    excursion: '<path d="M6 21V4"/><path class="f" d="M6 5h11.5l-2.5 3.5 2.5 3.5H6z"/>',
    professor: '<path class="f" d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.5V16c2 2 10 2 12 0v-4.5M21 9.5V15"/>',
    tea: '<path class="f" d="M5 10h11v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z"/><path d="M16 11h2a2 2 0 0 1 0 4h-2M8.5 4v3M12.5 4v3"/>',
    returned: '<rect class="f" x="9" y="5" width="10.5" height="14" rx="1"/><path d="M12 5v14M6 9l-3 3 3 3M3 12h6"/>',
    bookseller: '<path class="f" d="M5 9h14l-1.5 11.5h-11z"/><path d="M9 9V7a3 3 0 0 1 6 0v2"/>',
    note: '<path class="f" d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5M8 9h8M8 12h5"/>',
    contest: '<path class="f" d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5c0 3 1 4 3 4M16 6h3c0 3-1 4-3 4M12 13v4M8 20h8M9.5 17h5"/>',
    roof: '<path d="M3 10l9-6 9 6"/><path class="f" d="M12 11c2 3 3 4.5 3 6a3 3 0 0 1-6 0c0-1.5 1-3 3-6z"/>',
    opendoors: '<path d="M4 20.5h16M6 20V4h12v16"/><path class="f" d="M6 4l7 2v16l-7-2z"/><path d="M10.5 13v1.2"/>',
    students: '<path class="f" d="M5 19l1-4L16 5l3 3L9 18z"/><path d="M14 7l3 3M5 19l4-1"/>',
    cat: '<path class="f" d="M5 20V9L4 4l4 3h8l4-3-1 5v11z"/><path d="M9 12v1.2M15 12v1.2M11 16h2"/>',

    // ---- the 20 unique tomes ----
    atlas: '<circle cx="12" cy="12" r="7.5"/><path class="f" d="M12 6l2 6-2 6-2-6z"/><path d="M6.5 12h11"/>',
    rain: '<path d="M10 14V5l6-1.5V11"/><circle class="f" cx="8" cy="14" r="2"/><circle class="f" cx="14" cy="11" r="2"/><path d="M7 19v1.5M12 18v2.5M17 17v2.5"/>',
    stars: '<path class="f" d="M9 5l1.2 3.3 3.3 1.2-3.3 1.2L9 14l-1.2-3.3-3.3-1.2 3.3-1.2z"/><path d="M17 13v4M15 15h4M17.5 5v2M16.5 6h2"/>',
    lighthouse: '<path class="f" d="M9.5 9h5L16 20H8z"/><path d="M10 9V6h4v3M12 6V4M5 6l3 1M19 6l-3 1M6.5 20.5h11"/>',
    trades: '<path class="f" d="M4 8h13c0 2-2 4-5 4v3h3v3H7v-3h2v-3C6 12 4 10 4 8z"/><path d="M17 8h3.5"/>',
    stones: '<ellipse class="f" cx="12" cy="17.5" rx="7" ry="2.5"/><ellipse class="f" cx="12" cy="12.5" rx="5" ry="2.5"/><ellipse class="f" cx="12" cy="7.5" rx="3" ry="2.5"/>',
    city: '<path class="f" d="M4 20v-8h4v8M10 20V6h4v14M16 20v-6h4v6"/><path d="M3 20.5h18M12 6V3"/>',
    herb: '<path d="M12 21V9"/><path class="f" d="M12 9c-4 0-5-3-5-5 4 0 5 2 5 5zM12 15c4 0 5-3 5-5-4 0-5 2-5 5z"/>',
    letters: '<rect class="f" x="3.5" y="6" width="17" height="12" rx="1.5"/><path d="M4 7l8 6 8-6"/>',
    hush: '<circle class="f" cx="9" cy="9" r="5.5"/><path d="M13 13l7 7M5.5 6.5l6 6M12.5 6.5l-6.5 6"/>',
    chapter: '<path class="f" d="M5 4h14v10l-3 2-2-2-2 3-3-2-4 2z"/><path d="M8 8h8M8 11h6"/>',
    ferry: '<path class="f" d="M3 14h18l-3 5.5H6z"/><path d="M12 14V4M12 5l5 6h-5"/>',
    attics: '<path class="f" d="M3 18l9-12 9 12z"/><circle cx="12" cy="13.5" r="2"/><path d="M2.5 18.5h19"/>',
    stairs: '<path class="f" d="M4 20v-4h4v-4h4V8h4V4h4v16z"/>',
    dreams: '<path class="f" d="M15 15.5A7 7 0 1 1 8 5a5.5 5.5 0 0 0 7 10.5z"/><path d="M15 5h4l-4 4h4"/>',
    clouds: '<path class="f" d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1A4.5 4.5 0 0 1 17 18z"/>',
    birds: '<path d="M3 9c2-2 4-2 5 1 1-3 3-3 5-1M11 16c1.5-1.5 3-1.5 4 .5 1-2 2.5-2 4-.5"/><circle class="d" cx="17.5" cy="6.5" r="1"/>',
    streets: '<path class="f" d="M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',
    diary: '<rect class="f" x="5" y="4" width="12.5" height="16" rx="1.5"/><path d="M8.5 4v16M17.5 10h2.5v4h-2.5"/>'
  };
  // Shared drawings under other names: a tome or an event that is the same thing as a card's picture.
  const ALIAS = { building5: 'lab', quiet: 'silence', bookmark: 'memory', writer: 'branch2' };

  function body(name) { return P[name] || P[ALIAS[name]] || ''; }
  function has(name) { return !!body(name); }
  function svg(name) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (body(name) || P.unknown) + '</svg>'; }

  /** A plate with the picture. o.tone: b0–b5 (a branch), paper, gold, grey (default); o.size: small, big; o.off: closed. */
  function icon(name, o) {
    o = o || {};
    const el = document.createElement('span');
    el.className = 'l-ic t-' + (o.tone || 'grey') + (o.size ? ' ' + o.size : '') + (o.off ? ' off' : '') + (o.cls ? ' ' + o.cls : '');
    el.innerHTML = svg(name);
    return el;
  }

  window.LibArt = { icon: icon, has: has, svg: svg, names: Object.keys(P).concat(Object.keys(ALIAS)) };
})();
