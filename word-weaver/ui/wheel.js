// The wheel of letters of «Словоплёт». A word is drawn with a finger over the letters (each letter
// once; back over the previous letter takes the last one off) or tapped letter by letter and sent
// with a tap in the centre (a tap on the last tapped letter takes it off). A letter is caught when
// the finger is within `capture` of its circle — 0.7: passing between two neighbours catches
// neither. window.WWWheel.make({capture, letter, onSubmit(word, how), onChange(word)}).
(function () {
  // The SVG namespace, taken from the parser so the code carries no address.
  var NS = (function () { var box = document.createElement('div'); box.innerHTML = '<svg></svg>'; return box.firstChild.namespaceURI; })();
  var MOVE = 8; // px before a press becomes a drag

  function make(o) {
    var s = { letters: '', pos: [], size: 300, r: 28, cx: 150, cy: 150, inner: 60, path: [], tap: [], drag: false, down: null, pointer: null };
    var h = window.ui.h;
    var root = h('div', { class: 'ww-wheel', 'data-raw': '' });
    var disc = h('div', { class: 'ww-disc' });
    var trail = document.createElementNS(NS, 'svg');
    trail.setAttribute('class', 'ww-trail');
    var line = document.createElementNS(NS, 'polyline');
    line.setAttribute('class', 'ww-trail-line');
    trail.appendChild(line);
    var centre = h('div', { class: 'ww-centre' });
    var keys = [];
    root.append(disc, trail, centre);

    function point(event) {
      var rect = root.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }

    function hit(p, frac) {
      var rr = s.r * frac;
      for (var i = 0; i < s.pos.length; i++) {
        var dx = p.x - s.pos[i].x;
        var dy = p.y - s.pos[i].y;
        if (dx * dx + dy * dy <= rr * rr) return i;
      }
      return -1;
    }

    function inCentre(p) {
      var dx = p.x - s.cx;
      var dy = p.y - s.cy;
      return dx * dx + dy * dy <= s.inner * s.inner;
    }

    function current() {
      var list = s.drag || s.path.length ? s.path : s.tap;
      return list.map(function (i) { return s.letters.charAt(i); }).join('');
    }

    function draw() {
      var used = s.drag || s.path.length ? s.path : s.tap;
      keys.forEach(function (k, i) { k.classList.toggle('on', used.indexOf(i) >= 0); });
      var list = used.map(function (i) { return s.pos[i].x.toFixed(1) + ',' + s.pos[i].y.toFixed(1); });
      if (s.drag && s.pointer && s.path.length) list.push(s.pointer.x.toFixed(1) + ',' + s.pointer.y.toFixed(1));
      line.setAttribute('points', list.join(' '));
      root.classList.toggle('typing', !!s.tap.length && !s.drag);
      if (o.onChange) o.onChange(current());
    }

    function reset() {
      s.path = [];
      s.tap = [];
      s.drag = false;
      s.down = null;
      s.pointer = null;
      draw();
    }

    root.addEventListener('pointerdown', function (event) {
      if (event.target.closest && event.target.closest('.ww-corner')) return;
      if (event.button !== undefined && event.button > 0) return;
      var p = point(event);
      s.down = { x: p.x, y: p.y, letter: hit(p, 1), centre: inCentre(p), id: event.pointerId };
      s.drag = false;
      try { root.setPointerCapture(event.pointerId); } catch (ignored) { /* a synthetic event */ }
      event.preventDefault();
    });

    root.addEventListener('pointermove', function (event) {
      if (!s.down || event.pointerId !== s.down.id) return;
      var p = point(event);
      if (!s.drag) {
        var dx = p.x - s.down.x;
        var dy = p.y - s.down.y;
        if (dx * dx + dy * dy < MOVE * MOVE) return;
        s.drag = true;
        s.tap = [];
        s.path = s.down.letter >= 0 ? [s.down.letter] : [];
      }
      s.pointer = p;
      var j = hit(p, o.capture || 0.7);
      if (j >= 0) {
        var k = s.path.indexOf(j);
        if (k < 0) {
          s.path.push(j);
          if (o.onLetter) o.onLetter();
        } else if (k === s.path.length - 2) s.path.pop();
      }
      draw();
    });

    function up(event, cancelled) {
      if (!s.down || event.pointerId !== s.down.id) return;
      var d = s.down;
      s.down = null;
      if (s.drag) {
        var word = current();
        s.path = [];
        s.drag = false;
        s.pointer = null;
        draw();
        if (!cancelled && word) o.onSubmit(word, 'drag');
        return;
      }
      if (cancelled) return;
      if (d.letter >= 0) {
        var at = s.tap.indexOf(d.letter);
        if (at < 0) {
          s.tap.push(d.letter);
          if (o.onLetter) o.onLetter();
        } else if (at === s.tap.length - 1) s.tap.pop();
        draw();
      } else if (d.centre && s.tap.length) {
        var w = current();
        s.tap = [];
        draw();
        o.onSubmit(w, 'tap');
      }
    }
    root.addEventListener('pointerup', function (event) { up(event, false); });
    root.addEventListener('pointercancel', function (event) { up(event, true); });

    function place() {
      var n = s.letters.length;
      var size = s.size;
      var r = (o.letter || 56) / 2;
      var ring = size / 2 - r - 4;
      if (n > 1) r = Math.min(r, Math.PI * ring / n * 0.88);
      ring = size / 2 - r - 4;
      s.r = r;
      s.cx = size / 2;
      s.cy = size / 2;
      s.inner = Math.max(24, ring - r - 6);
      s.pos = [];
      for (var i = 0; i < n; i++) {
        var angle = -Math.PI / 2 + i * 2 * Math.PI / n;
        s.pos.push({ x: s.cx + ring * Math.cos(angle), y: s.cy + ring * Math.sin(angle) });
      }
      root.style.width = size + 'px';
      root.style.height = size + 'px';
      trail.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
      trail.setAttribute('width', size);
      trail.setAttribute('height', size);
      line.style.strokeWidth = Math.max(6, r * 0.32) + 'px';
      disc.style.width = disc.style.height = (2 * (ring + r + 2)) + 'px';
      centre.style.width = centre.style.height = (2 * s.inner) + 'px';
      keys.forEach(function (k, i) {
        k.style.width = k.style.height = (2 * r) + 'px';
        k.style.left = (s.pos[i].x - r) + 'px';
        k.style.top = (s.pos[i].y - r) + 'px';
        k.style.fontSize = Math.round(r * 0.9) + 'px';
      });
    }

    function setLetters(letters) {
      letters = String(letters || '');
      if (letters === s.letters) return;
      s.letters = letters;
      keys.forEach(function (k) { k.remove(); });
      keys = letters.split('').map(function (ch) { return h('div', { class: 'ww-key' }, ch.toUpperCase()); });
      keys.forEach(function (k) { root.insertBefore(k, centre); });
      s.path = [];
      s.tap = [];
      place();
      draw();
    }

    function resize(size) {
      s.size = Math.round(size);
      place();
      draw();
    }

    function mark(kind) {
      root.classList.remove('ok', 'bad');
      void root.offsetWidth;
      root.classList.add(kind);
      setTimeout(function () { root.classList.remove(kind); }, 450);
    }

    /** Corner buttons outside the circle: where = 'tl' | 'tr' | 'bl' | 'br'. */
    function corner(where, node) {
      node.classList.add('ww-corner', 'ww-' + where);
      root.appendChild(node);
      return node;
    }

    return {
      el: root, centre: centre, setLetters: setLetters, resize: resize, reset: reset, current: current,
      mark: mark, corner: corner, letters: function () { return s.letters; },
      // For checks: the centre of letter i in page coordinates.
      at: function (i) {
        var rect = root.getBoundingClientRect();
        return s.pos[i] ? { x: rect.left + s.pos[i].x, y: rect.top + s.pos[i].y } : null;
      }
    };
  }

  window.WWWheel = { make: make };
})();
