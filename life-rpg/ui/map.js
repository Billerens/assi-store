// The map of Жизнь-RPG: open cells on a dark grid, fog over the rest, locations as dots.
// Two ways: an abstract SVG without network (always works), or Leaflet over OpenStreetMap tiles
// when the owner turned the base map on. Home and work have no dot: only their cell is open.
// Plain script for the screen: window.RpgMap. Needs window.Geo (../geo.js).
(function () {
  var NS = 'http://www.w3.org/2000/svg';
  var LEAFLET = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/';

  function el(name, attrs) {
    var node = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    return node;
  }

  /** Projects degrees to meters around a center (equirectangular is plenty for a district). */
  function projector(lat0, lon0) {
    var kx = 111320 * Math.cos(lat0 * Math.PI / 180);
    var ky = 110540;
    return {
      x: function (lon) { return (lon - lon0) * kx; },
      y: function (lat) { return (lat0 - lat) * ky; }
    };
  }

  /**
   * The abstract map. data: { cells: [{ cell }], locations: [{ id, name, cell, lat, lon, hidden, visits }] }.
   * handlers: { onLocation(location) }. Returns { fit(), zoom(k) }.
   */
  function svg(holder, data, handlers) {
    handlers = handlers || {};
    holder.replaceChildren();
    var cells = data.cells.map(function (c) { return c.cell; });
    if (!cells.length) return null;
    var box = Geo.bounds(cells);
    var lat0 = (box.south + box.north) / 2;
    var lon0 = (box.west + box.east) / 2;
    var p = projector(lat0, lon0);
    var sample = Geo.decode(cells[0]);
    var cw = p.x(sample.east) - p.x(sample.west);
    var ch = p.y(sample.south) - p.y(sample.north);
    var pad = Math.max(cw, ch) * 6;
    var full = {
      x: p.x(box.west) - pad, y: p.y(box.north) - pad,
      w: p.x(box.east) - p.x(box.west) + pad * 2, h: p.y(box.south) - p.y(box.north) + pad * 2
    };
    var root = el('svg', { class: 'rpg-map', role: 'img', 'aria-label': 'Карта открытых клеток' });
    var defs = el('defs');
    var grid = el('pattern', { id: 'rpg-grid', patternUnits: 'userSpaceOnUse', width: cw, height: ch, x: p.x(sample.west), y: p.y(sample.north) });
    grid.appendChild(el('path', { d: 'M ' + cw + ' 0 L 0 0 0 ' + ch, fill: 'none', class: 'grid-line', 'stroke-width': Math.max(cw, ch) * 0.04 }));
    defs.appendChild(grid);
    var mask = el('mask', { id: 'rpg-fog', maskUnits: 'userSpaceOnUse', x: full.x - full.w, y: full.y - full.h, width: full.w * 3, height: full.h * 3 });
    mask.appendChild(el('rect', { x: full.x - full.w, y: full.y - full.h, width: full.w * 3, height: full.h * 3, fill: 'white' }));
    var open = el('g', { class: 'open' });
    cells.forEach(function (cell) {
      var b = Geo.decode(cell);
      var attrs = { x: p.x(b.west), y: p.y(b.north), width: p.x(b.east) - p.x(b.west), height: p.y(b.south) - p.y(b.north) };
      mask.appendChild(el('rect', Object.assign({ fill: 'black' }, attrs)));
      open.appendChild(el('rect', attrs));
    });
    defs.appendChild(mask);
    root.appendChild(defs);
    root.appendChild(el('rect', { class: 'ground', x: full.x - full.w, y: full.y - full.h, width: full.w * 3, height: full.h * 3 }));
    root.appendChild(el('rect', { x: full.x - full.w, y: full.y - full.h, width: full.w * 3, height: full.h * 3, fill: 'url(#rpg-grid)' }));
    root.appendChild(open);
    root.appendChild(el('rect', { class: 'fog', x: full.x - full.w, y: full.y - full.h, width: full.w * 3, height: full.h * 3, mask: 'url(#rpg-fog)' }));

    var dots = el('g', { class: 'dots' });
    var shown = data.locations.filter(function (l) { return !l.hidden && (typeof l.lat === 'number' || l.cell); });
    shown.sort(function (a, b) { return b.visits - a.visits; });
    var named = shown.slice(0, 25).map(function (l) { return l.id; });
    var r = Math.max(cw, ch) * 0.32;
    var labels = [];
    shown.forEach(function (location) {
      var lat = location.lat;
      var lon = location.lon;
      if (typeof lat !== 'number') { var c = Geo.decode(location.cell); lat = c.lat; lon = c.lon; }
      var g = el('g', { class: 'dot', tabindex: '0', role: 'button', 'aria-label': location.name });
      g.appendChild(el('circle', { cx: p.x(lon), cy: p.y(lat), r: r * 2.2, class: 'hit' }));
      g.appendChild(el('circle', { cx: p.x(lon), cy: p.y(lat), r: r }));
      if (named.indexOf(location.id) >= 0) {
        var text = el('text', { x: p.x(lon) + r * 1.6, y: p.y(lat) + r * 0.6 });
        text.textContent = location.name;
        labels.push(text);
        g.appendChild(text);
      }
      g.addEventListener('click', function (event) {
        event.stopPropagation();
        if (handlers.onLocation) handlers.onLocation(location);
      });
      dots.appendChild(g);
    });
    root.appendChild(dots);
    holder.appendChild(root);

    // Pan and zoom by changing the viewBox: drag, pinch, wheel, buttons.
    var view = { x: full.x, y: full.y, w: full.w, h: full.h };
    function apply() {
      var rect = holder.getBoundingClientRect();
      var aspect = rect.width && rect.height ? rect.width / rect.height : 1.4;
      var w = view.w;
      var h = view.h;
      if (w / h > aspect) h = w / aspect; else w = h * aspect;
      var cx = view.x + view.w / 2;
      var cy = view.y + view.h / 2;
      root.setAttribute('viewBox', (cx - w / 2) + ' ' + (cy - h / 2) + ' ' + w + ' ' + h);
      var unit = w / Math.max(1, rect.width || 360);
      // Labels in the order of visits; one that would overlap a shown label stays hidden.
      var placed = [];
      labels.forEach(function (text) {
        text.setAttribute('font-size', 12 * unit);
        var x = Number(text.getAttribute('x')) / unit;
        var y = Number(text.getAttribute('y')) / unit;
        var width = String(text.textContent).length * 7;
        var clash = placed.some(function (b) { return x < b.x + b.w + 6 && x + width + 6 > b.x && Math.abs(y - b.y) < 16; });
        text.style.display = clash ? 'none' : '';
        if (!clash) placed.push({ x: x, y: y, w: width });
      });
      dots.querySelectorAll('circle:not(.hit)').forEach(function (dot) { dot.setAttribute('r', Math.max(r, 5 * unit)); });
      dots.querySelectorAll('circle.hit').forEach(function (dot) { dot.setAttribute('r', Math.max(r * 2.2, 22 * unit)); });
    }
    function zoom(k, fx, fy) {
      var cx = fx === undefined ? view.x + view.w / 2 : fx;
      var cy = fy === undefined ? view.y + view.h / 2 : fy;
      var w = Math.max(cw * 4, Math.min(full.w * 4, view.w * k));
      var ratio = w / view.w;
      view.x = cx - (cx - view.x) * ratio;
      view.y = cy - (cy - view.y) * ratio;
      view.w = w;
      view.h = view.h * ratio;
      apply();
    }
    function fit() {
      view = { x: full.x, y: full.y, w: full.w, h: full.h };
      apply();
    }
    function toWorld(clientX, clientY) {
      var rect = root.getBoundingClientRect();
      var vb = root.viewBox.baseVal;
      return { x: vb.x + (clientX - rect.left) / rect.width * vb.width, y: vb.y + (clientY - rect.top) / rect.height * vb.height };
    }
    var pointers = {};
    var pinch = null;
    root.addEventListener('pointerdown', function (event) {
      pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
      if (root.setPointerCapture && !event.target.closest('.dot')) root.setPointerCapture(event.pointerId);
    });
    root.addEventListener('pointermove', function (event) {
      var last = pointers[event.pointerId];
      if (!last) return;
      var ids = Object.keys(pointers);
      if (ids.length === 2) {
        var other = pointers[ids[0] == event.pointerId ? ids[1] : ids[0]];
        var dist = Math.hypot(event.clientX - other.x, event.clientY - other.y);
        if (pinch) {
          var mid = toWorld((event.clientX + other.x) / 2, (event.clientY + other.y) / 2);
          zoom(pinch / Math.max(1, dist), mid.x, mid.y);
        }
        pinch = dist;
      } else {
        var vb = root.viewBox.baseVal;
        var rect = root.getBoundingClientRect();
        view.x -= (event.clientX - last.x) / rect.width * vb.width;
        view.y -= (event.clientY - last.y) / rect.height * vb.height;
        apply();
      }
      pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
    });
    function up(event) {
      delete pointers[event.pointerId];
      pinch = null;
    }
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    root.addEventListener('wheel', function (event) {
      event.preventDefault();
      var at = toWorld(event.clientX, event.clientY);
      zoom(event.deltaY > 0 ? 1.2 : 1 / 1.2, at.x, at.y);
    }, { passive: false });
    if (window.ResizeObserver) new ResizeObserver(apply).observe(holder);
    fit();
    return { fit: fit, zoom: function (k) { zoom(k); } };
  }

  // ---- OpenStreetMap through Leaflet ------------------------------------------------------------

  var loading = null;
  function leaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = LEAFLET + 'leaflet.css';
      document.head.appendChild(css);
      var script = document.createElement('script');
      script.src = LEAFLET + 'leaflet.js';
      script.onload = function () { resolve(window.L); };
      script.onerror = function () { loading = null; reject(new Error('Leaflet не загрузился')); };
      document.head.appendChild(script);
    });
    return loading;
  }

  /** The map over OSM tiles; fog is one polygon with the open cells cut out. Resolves to { fit, zoom }. */
  function osm(holder, data, handlers) {
    handlers = handlers || {};
    return leaflet().then(function (L) {
      // A fresh element each time: Leaflet will not start twice on the same one.
      var box0 = document.createElement('div');
      box0.className = 'leaf';
      holder.replaceChildren(box0);
      var cells = data.cells.map(function (c) { return c.cell; });
      var map = L.map(box0, { zoomControl: false, attributionControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);
      var box = Geo.bounds(cells);
      var outer = [[box.south - 2, box.west - 3], [box.north + 2, box.west - 3], [box.north + 2, box.east + 3], [box.south - 2, box.east + 3]];
      var holes = cells.map(function (cell) {
        var b = Geo.decode(cell);
        return [[b.south, b.west], [b.north, b.west], [b.north, b.east], [b.south, b.east]];
      });
      L.polygon([outer].concat(holes), { stroke: false, fillColor: '#101010', fillOpacity: 0.72, interactive: false }).addTo(map);
      var accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#8B7CFF';
      data.locations.forEach(function (location) {
        if (location.hidden || typeof location.lat !== 'number') return;
        L.circleMarker([location.lat, location.lon], { radius: 7, color: accent, weight: 2, fillColor: accent, fillOpacity: 0.85 })
          .bindTooltip(location.name, { direction: 'right', offset: [8, 0] })
          .on('click', function () { if (handlers.onLocation) handlers.onLocation(location); })
          .addTo(map);
      });
      function fit() {
        map.fitBounds([[box.south, box.west], [box.north, box.east]], { padding: [24, 24] });
      }
      fit();
      if (window.ResizeObserver) new ResizeObserver(function () { map.invalidateSize(); }).observe(holder);
      return { fit: fit, zoom: function (k) { if (k < 1) map.zoomIn(); else map.zoomOut(); } };
    });
  }

  window.RpgMap = { svg: svg, osm: osm };
})();
