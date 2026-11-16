// The canvas of «Ветки поездов»: window.TSDraw. The scheme (ballast, sleepers, two rails; bridges
// over), depots as engine sheds, stations as little houses of their colour, switches as diamonds
// with the pointer of the open way and a bar across the closed one, trains as a locomotive with
// wagons. No shadows; everything scales with the cell, so it reads at 380 px and unfolded.
//   TSDraw.env = {theme: 'day' | 'night', skin}   what the screen sets before drawing
(function () {
  // Six colours, each with its own shape mark: told apart without colour too.
  const COLORS = ['#E5533D', '#3B82F6', '#22C55E', '#F97316', '#A855F7', '#EC4899'];
  const SHAPES = ['circle', 'square', 'triangle', 'diamond', 'cross', 'hex'];
  const THEMES = {
    day: {
      bg: '#0F1114', dot: '#20242B', bed: '#191C22', tie: '#3A414C', rail: '#98A2B1', on: '#F2F5F9', dim: '#3B424D',
      ink: '#EDEDED', ink3: '#737B88', surface: '#1A1D22', surface2: '#2A2F37', deck: '#59616E'
    },
    night: {
      bg: '#070A12', dot: '#131C30', bed: '#0C1322', tie: '#24345C', rail: '#5570AE', on: '#C2D4FF', dim: '#1D2B4C',
      ink: '#E6ECFF', ink3: '#5D6C91', surface: '#0E1526', surface2: '#18243F', deck: '#3A4E82'
    }
  };
  const KIND_FILL = { m: '#A7AEB9', f: '#FACC15', n: '#38BDF8' };
  const WARN = '#FF7B72';
  const HINT = '#8B7CFF';
  const env = { theme: 'day', skin: 'plain' };

  function theme() { return THEMES[env.theme] || THEMES.day; }

  function shapePoints(shape, x, y, r) {
    if (shape === 'triangle') return [[x, y - r], [x + r * 0.92, y + r * 0.7], [x - r * 0.92, y + r * 0.7]];
    if (shape === 'diamond') return [[x, y - r], [x + r, y], [x, y + r], [x - r, y]];
    if (shape === 'hex') {
      const out = [];
      for (let i = 0; i < 6; i++) out.push([x + r * Math.cos(Math.PI / 3 * i), y + r * Math.sin(Math.PI / 3 * i)]);
      return out;
    }
    if (shape === 'cross') {
      const a = r * 0.36;
      return [[x - a, y - r], [x + a, y - r], [x + a, y - a], [x + r, y - a], [x + r, y + a], [x + a, y + a], [x + a, y + r], [x - a, y + r], [x - a, y + a], [x - r, y + a], [x - r, y - a], [x - a, y - a]];
    }
    return null;
  }

  function shapePath(ctx, color, x, y, r) {
    const shape = SHAPES[color] || 'circle';
    ctx.beginPath();
    if (shape === 'circle') ctx.arc(x, y, r * 0.85, 0, Math.PI * 2);
    else if (shape === 'square') ctx.rect(x - r * 0.75, y - r * 0.75, r * 1.5, r * 1.5);
    else {
      const pts = shapePoints(shape, x, y, r);
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
    }
  }

  /** A small SVG of a colour's shape mark: for the ribbon, the legend, the workshop. */
  function mark(color, size) {
    const NS = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(NS, 'svg');
    const z = size || 22;
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', z);
    s.setAttribute('height', z);
    s.setAttribute('class', 'ts-mark');
    const shape = SHAPES[color] || 'circle';
    let el;
    if (shape === 'circle') {
      el = document.createElementNS(NS, 'circle');
      el.setAttribute('cx', 12);
      el.setAttribute('cy', 12);
      el.setAttribute('r', 8);
    } else if (shape === 'square') {
      el = document.createElementNS(NS, 'rect');
      el.setAttribute('x', 5);
      el.setAttribute('y', 5);
      el.setAttribute('width', 14);
      el.setAttribute('height', 14);
    } else {
      el = document.createElementNS(NS, 'polygon');
      el.setAttribute('points', shapePoints(shape, 12, 12, 9).map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' '));
    }
    el.setAttribute('fill', COLORS[color] || '#888');
    s.append(el);
    return s;
  }

  function roundRect(ctx, x, y, w, hh, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + hh - r);
    ctx.quadraticCurveTo(x + w, y + hh, x + w - r, y + hh);
    ctx.lineTo(x + r, y + hh);
    ctx.quadraticCurveTo(x, y + hh, x, y + hh - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function cxy(b, d) { return [(d.x - (b.x0 || 0) + 0.5) * b.cell, (d.y - (b.y0 || 0) + 0.5) * b.cell]; }

  function seg(ctx, a, z, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(z[0], z[1]);
    ctx.stroke();
  }

  /** The measures of a track for a cell: the gap between the rails, a rail, the ballast. */
  function gauge(c) {
    const inner = Math.max(4, c * 0.11);
    const rail = Math.max(1.6, c * 0.036);
    return { inner, rail, outer: inner + rail * 2, bed: inner + rail * 2 + Math.max(5, c * 0.12) };
  }

  /**
   * The scheme: the ground first, then the bridges with a gap around them. o: {vis, open(i),
   * side(i) → 0 | 1 | -1 (not shown) | -2 (the siding), left(i), fixed(i), hint(i), blink(i),
   * letters, fail, ghosts, siding}.
   */
  function drawNet(b, net, o) {
    const ctx = b.ctx;
    const T = theme();
    const c = b.cell;
    const nodes = net.nodes;
    const vis = o.vis || null;
    const seen = (i) => !vis || vis[i];
    const G = gauge(c);
    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, c * b.cols, c * b.rows);
    // The ground: quiet marks at the corners of the cells, the tracks never run over them.
    ctx.fillStyle = T.dot;
    const m = Math.max(1.5, c * 0.03);
    for (let x = 0; x <= b.cols; x++) for (let y = 0; y <= b.rows; y++) ctx.fillRect(x * c - m, y * c - m, m * 2, m * 2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Every piece of track with its colour: 0 closed, 1 plain, 2 open.
    const segs = [];
    nodes.forEach((d, i) => {
      if (!seen(i)) return;
      const outs = d.o || [];
      outs.forEach((j, k) => {
        if (j < 0 || !seen(j)) return;
        if (d.t === 'W' && k > 0 && o.open && !o.open(i)) return;
        const e = nodes[j];
        let rank = 1;
        if (d.t === 'W' && outs.length > 1 && o.side) {
          const s = o.side(i);
          if (s >= 0) rank = s === k ? 2 : 0;
          else if (s === -2) rank = 0;
        }
        segs.push({ a: cxy(b, d), z: cxy(b, e), rank, up: (d.z || 0) + (e.z || 0) > 0 ? 1 : 0, d, k, outs: outs.length });
      });
    });
    segs.sort((p, q) => p.rank - q.rank);
    const colorOf = [T.dim, T.rail, T.on];
    for (let pass = 0; pass < 2; pass++) {
      const list = segs.filter((s) => s.up === pass);
      if (!list.length) continue;
      if (pass === 1) {
        // A bridge: a gap in the ground under it, parapets along it.
        list.forEach((s) => seg(ctx, s.a, s.z, T.bg, G.bed + Math.max(8, c * 0.16)));
        list.forEach((s) => seg(ctx, s.a, s.z, T.deck, G.bed + Math.max(3, c * 0.07)));
      }
      list.forEach((s) => seg(ctx, s.a, s.z, T.bed, G.bed));
      list.forEach((s) => seg(ctx, s.a, s.z, colorOf[s.rank], G.outer));
      list.forEach((s) => seg(ctx, s.a, s.z, T.bed, G.inner));
      // Sleepers between the rails.
      ctx.lineCap = 'butt';
      list.forEach((s) => {
        const dx = s.z[0] - s.a[0];
        const dy = s.z[1] - s.a[1];
        const len = Math.hypot(dx, dy) || 1;
        const n = Math.max(2, Math.round(len / (c * 0.21)));
        const px = -dy / len * G.inner / 2;
        const py = dx / len * G.inner / 2;
        ctx.strokeStyle = s.rank === 0 ? T.dim : T.tie;
        ctx.lineWidth = Math.max(1.5, c * 0.04);
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const f = (i + 0.5) / n;
          const x = s.a[0] + dx * f;
          const y = s.a[1] + dy * f;
          ctx.moveTo(x - px, y - py);
          ctx.lineTo(x + px, y + py);
        }
        ctx.stroke();
      });
      ctx.lineCap = 'round';
      list.forEach((s) => {
        if (s.d.t !== 'W' || s.outs < 2) return;
        const dx = s.z[0] - s.a[0];
        const dy = s.z[1] - s.a[1];
        const len = Math.hypot(dx, dy) || 1;
        if (s.rank === 0) {
          // The closed way: a bar across it.
          const f = (c * 0.56) / len;
          const x = s.a[0] + dx * f;
          const y = s.a[1] + dy * f;
          const px = -dy / len * (G.outer / 2 + c * 0.05);
          const py = dx / len * (G.outer / 2 + c * 0.05);
          seg(ctx, [x - px, y - py], [x + px, y + py], T.ink3, Math.max(2.5, c * 0.06));
        }
        // A colour switch: its colour marks the way «налево».
        if (s.d.k === 'c' && s.k === 0) {
          const x = s.a[0] + dx * 0.62;
          const y = s.a[1] + dy * 0.62;
          ctx.fillStyle = T.bg;
          ctx.beginPath();
          ctx.arc(x, y, c * 0.16, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = COLORS[s.d.c] || '#888';
          shapePath(ctx, s.d.c, x, y, c * 0.12);
          ctx.fill();
        }
      });
    }
    // Ghosts: the paths the trains would take, dashed.
    if (o.ghosts) {
      ctx.setLineDash([c * 0.12, c * 0.14]);
      ctx.lineWidth = Math.max(2.5, c * 0.055);
      o.ghosts.forEach((g1, j) => {
        if (!g1.path || g1.path.length < 2) return;
        const off = ((j % 3) - 1) * c * 0.09;
        ctx.strokeStyle = COLORS[g1.c] || '#999';
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        g1.path.forEach((n, k) => {
          const p = cxy(b, nodes[n]);
          if (k) ctx.lineTo(p[0] + off, p[1] + off);
          else ctx.moveTo(p[0] + off, p[1] + off);
        });
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
    }
    // Nodes.
    nodes.forEach((d, i) => {
      if (!seen(i)) return;
      const p = cxy(b, d);
      if (d.t === 'D') drawDepot(b, p, (o.letters && o.letters[i]) || '');
      else if (d.t === 'S') drawStation(b, p, d.c);
      else if (d.t === 'M') {
        ctx.fillStyle = T.bed;
        ctx.strokeStyle = T.rail;
        ctx.lineWidth = G.rail;
        ctx.beginPath();
        ctx.arc(p[0], p[1], G.inner * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (d.t === 'W' && (d.o || []).length > 1 && (!vis || (o.open ? o.open(i) : true))) {
        drawSwitch(b, net, d, i, p, o);
      }
    });
    if (o.fail) {
      const d = nodes[o.fail.node];
      if (d) {
        const p = cxy(b, d);
        ctx.strokeStyle = WARN;
        ctx.lineWidth = Math.max(3, c * 0.07);
        ctx.setLineDash([c * 0.16, c * 0.1]);
        ctx.beginPath();
        ctx.arc(p[0], p[1], c * 0.48, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  /** A depot: an engine shed with its letter in the gate. */
  function drawDepot(b, p, letter) {
    const ctx = b.ctx;
    const T = theme();
    const c = b.cell;
    const s = c * 0.74;
    const x = p[0];
    const y = p[1];
    const arch = (w, top, bottom) => {
      ctx.beginPath();
      ctx.moveTo(x - w / 2, bottom);
      ctx.lineTo(x - w / 2, top + w * 0.42);
      ctx.quadraticCurveTo(x - w / 2, top, x, top);
      ctx.quadraticCurveTo(x + w / 2, top, x + w / 2, top + w * 0.42);
      ctx.lineTo(x + w / 2, bottom);
      ctx.closePath();
    };
    arch(s, y - s / 2, y + s / 2);
    ctx.fillStyle = T.surface2;
    ctx.fill();
    ctx.strokeStyle = T.ink3;
    ctx.lineWidth = Math.max(2, c * 0.045);
    ctx.stroke();
    arch(s * 0.66, y - s * 0.3, y + s / 2 - ctx.lineWidth / 2);
    ctx.fillStyle = T.bg;
    ctx.fill();
    ctx.fillStyle = T.ink;
    ctx.font = '700 ' + Math.max(14, Math.round(c * 0.3)) + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, x, y + s * 0.12);
  }

  /** A station: a little house in its colour, the shape mark of the colour inside. */
  function drawStation(b, p, color) {
    const ctx = b.ctx;
    const T = theme();
    const c = b.cell;
    const x = p[0];
    const y = p[1];
    const col = COLORS[color] || '#888';
    const w = c * 0.33;
    ctx.beginPath();
    ctx.moveTo(x - w, y + c * 0.34);
    ctx.lineTo(x - w, y - c * 0.07);
    ctx.lineTo(x, y - c * 0.37);
    ctx.lineTo(x + w, y - c * 0.07);
    ctx.lineTo(x + w, y + c * 0.34);
    ctx.closePath();
    ctx.fillStyle = T.surface;
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(3.5, c * 0.085);
    ctx.stroke();
    // The roof is solid, so the house reads at a glance.
    ctx.beginPath();
    ctx.moveTo(x - w, y - c * 0.07);
    ctx.lineTo(x, y - c * 0.37);
    ctx.lineTo(x + w, y - c * 0.07);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.fillStyle = col;
    shapePath(ctx, color, x, y + c * 0.13, c * 0.14);
    ctx.fill();
  }

  function drawSwitch(b, net, d, i, p, o) {
    const ctx = b.ctx;
    const T = theme();
    const c = b.cell;
    const r = c * 0.3;
    const side = o.side ? o.side(i) : -1;
    // The pointer of the open way first, under the diamond.
    if (side >= 0) {
      const q = cxy(b, net.nodes[d.o[side]]);
      const ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
      const ux = Math.cos(ang);
      const uy = Math.sin(ang);
      const tip = c * 0.66;
      const base = c * 0.4;
      const half = c * 0.17;
      const head = () => {
        ctx.beginPath();
        ctx.moveTo(p[0] + ux * tip, p[1] + uy * tip);
        ctx.lineTo(p[0] + ux * base - uy * half, p[1] + uy * base + ux * half);
        ctx.lineTo(p[0] + ux * base + uy * half, p[1] + uy * base - ux * half);
        ctx.closePath();
      };
      seg(ctx, p, [p[0] + ux * base, p[1] + uy * base], T.bg, Math.max(6, c * 0.15));
      seg(ctx, p, [p[0] + ux * base, p[1] + uy * base], T.ink, Math.max(3, c * 0.08));
      head();
      ctx.strokeStyle = T.bg;
      ctx.lineWidth = Math.max(3, c * 0.07);
      ctx.stroke();
      ctx.fillStyle = T.ink;
      ctx.fill();
    }
    const blink = o.blink && o.blink(i) && Math.floor(performance.now() / 220) % 2 === 0;
    const k = d.k || 'm';
    ctx.beginPath();
    ctx.moveTo(p[0], p[1] - r);
    ctx.lineTo(p[0] + r, p[1]);
    ctx.lineTo(p[0], p[1] + r);
    ctx.lineTo(p[0] - r, p[1]);
    ctx.closePath();
    ctx.fillStyle = blink ? WARN : k === 'c' ? T.surface : KIND_FILL[k] || KIND_FILL.m;
    ctx.strokeStyle = T.bg;
    ctx.lineWidth = Math.max(4, c * 0.1);
    ctx.stroke();
    ctx.fill();
    const dark = '#11151B';
    if (k === 'c') {
      ctx.strokeStyle = COLORS[d.c] || '#888';
      ctx.lineWidth = Math.max(3, c * 0.07);
      ctx.stroke();
      ctx.fillStyle = COLORS[d.c] || '#888';
      shapePath(ctx, d.c, p[0], p[1], r * 0.45);
      ctx.fill();
    } else if (k === 'n') {
      ctx.fillStyle = dark;
      ctx.font = '800 ' + Math.max(15, Math.round(c * 0.3)) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(o.left ? o.left(i) : d.n || 1), p[0], p[1] + 1);
    } else if (k === 'f') {
      // Two arrows, there and back: it flips after every train.
      const a = r * 0.42;
      const hgt = r * 0.2;
      ctx.fillStyle = dark;
      [[-1, -hgt * 1.15], [1, hgt * 1.15]].forEach((v) => {
        ctx.beginPath();
        ctx.moveTo(p[0] + v[0] * a, p[1] + v[1]);
        ctx.lineTo(p[0] + v[0] * (a - hgt * 1.5), p[1] + v[1] - hgt);
        ctx.lineTo(p[0] + v[0] * (a - hgt * 1.5), p[1] + v[1] + hgt);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(p[0] - a * 0.9, p[1] + v[1] - hgt * 0.32, a * 1.5, hgt * 0.64);
      });
    } else {
      // A hand switch: the knob of its lever.
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(p[0], p[1], r * 0.26, 0, Math.PI * 2);
      ctx.fill();
    }
    if (o.fixed && o.fixed(i)) {
      // Fixed by the level: a padlock at the corner.
      const lx = p[0] + r * 0.98;
      const ly = p[1] - r * 0.9;
      const u = Math.max(4.5, c * 0.1);
      ctx.fillStyle = T.bg;
      ctx.beginPath();
      ctx.arc(lx, ly, u * 1.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = T.ink;
      ctx.lineWidth = Math.max(1.5, u * 0.32);
      ctx.beginPath();
      ctx.arc(lx, ly - u * 0.25, u * 0.48, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = T.ink;
      roundRect(ctx, lx - u * 0.8, ly - u * 0.25, u * 1.6, u * 1.15, u * 0.25);
      ctx.fill();
    }
    if (o.hint && o.hint(i)) {
      ctx.strokeStyle = HINT;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p[0], p[1], r * 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (o.siding === i) {
      // «Тупик-отстойник»: a short dead end with a buffer beside the switch.
      const on = o.side && o.side(i) === -2;
      ctx.strokeStyle = on ? WARN : T.ink3;
      ctx.lineWidth = Math.max(3, c * 0.07);
      ctx.beginPath();
      ctx.moveTo(p[0] - r * 0.3, p[1] + r * 1.25);
      ctx.lineTo(p[0] - r * 1.2, p[1] + r * 1.25);
      ctx.moveTo(p[0] - r * 1.2, p[1] + r * 0.8);
      ctx.lineTo(p[0] - r * 1.2, p[1] + r * 1.7);
      ctx.stroke();
    }
  }

  function locoPath(ctx, L, W) {
    const r = W * 0.24;
    const n = W * 0.5;
    ctx.beginPath();
    ctx.moveTo(-L / 2 + r, -W / 2);
    ctx.lineTo(L / 2 - n, -W / 2);
    ctx.quadraticCurveTo(L / 2, -W / 2, L / 2, 0);
    ctx.quadraticCurveTo(L / 2, W / 2, L / 2 - n, W / 2);
    ctx.lineTo(-L / 2 + r, W / 2);
    ctx.quadraticCurveTo(-L / 2, W / 2, -L / 2, W / 2 - r);
    ctx.lineTo(-L / 2, -W / 2 + r);
    ctx.quadraticCurveTo(-L / 2, -W / 2, -L / 2 + r, -W / 2);
    ctx.closePath();
  }

  /**
   * A train seen from above: a locomotive of its colour (the cab at the back, the windscreen and
   * the headlight at the nose, the shape mark of the colour on the roof); a long train pulls a
   * wagon. The skin is the pattern of the roofs.
   */
  function drawTrain(b, x, y, ang, color, len, alpha) {
    const ctx = b.ctx;
    const T = theme();
    const c = b.cell;
    const col = COLORS[color] || '#999';
    const L = c * 0.68;
    const W = c * 0.38;
    const edge = Math.max(2.5, c * 0.06);
    ctx.save();
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.lineJoin = 'round';
    if (len > 1) {
      const wl = c * 0.5;
      const ww = W * 0.9;
      const wx = -(L / 2 + c * 0.06 + wl / 2);
      ctx.lineCap = 'butt';
      seg(ctx, [wx + wl / 2 - 1, 0], [-L / 2 + 1, 0], T.ink3, Math.max(2.5, c * 0.07));
      roundRect(ctx, wx - wl / 2, -ww / 2, wl, ww, ww * 0.2);
      ctx.strokeStyle = T.bg;
      ctx.lineWidth = edge;
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.translate(wx, 0);
      skinPattern(ctx, env.skin, wl, ww);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(-wl / 2, -ww / 2, wl * 0.14, ww);
      ctx.fillRect(wl / 2 - wl * 0.14, -ww / 2, wl * 0.14, ww);
      ctx.restore();
    }
    locoPath(ctx, L, W);
    ctx.strokeStyle = T.bg;
    ctx.lineWidth = edge;
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.fill();
    ctx.save();
    ctx.clip();
    skinPattern(ctx, env.skin, L, W);
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.fillRect(-L / 2, -W / 2, L * 0.2, W);
    ctx.restore();
    // The windscreen and the headlight.
    ctx.fillStyle = 'rgba(255,255,255,0.86)';
    roundRect(ctx, L / 2 - W * 0.6, -W * 0.3, W * 0.17, W * 0.6, W * 0.08);
    ctx.fill();
    ctx.fillStyle = '#FFF1A8';
    ctx.beginPath();
    ctx.arc(L / 2 - W * 0.17, 0, W * 0.1, 0, Math.PI * 2);
    ctx.fill();
    // The mark of the colour on the roof, upright.
    const mx = (-L / 2 + L * 0.2 + L / 2 - W * 0.6) / 2;
    ctx.translate(mx, 0);
    ctx.rotate(-ang);
    ctx.fillStyle = 'rgba(10,10,10,0.8)';
    shapePath(ctx, color, 0, 0, W * 0.3);
    ctx.fill();
    ctx.restore();
  }

  /** The next train of a depot: its colour and mark on the depot's corner. */
  function drawWaiting(b, p, color) {
    const ctx = b.ctx;
    const r = b.cell * 0.17;
    const x = p[0] + b.cell * 0.34;
    const y = p[1] - b.cell * 0.34;
    ctx.fillStyle = theme().bg;
    ctx.beginPath();
    ctx.arc(x, y, r + Math.max(2.5, b.cell * 0.05), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS[color] || '#999';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(10,10,10,0.8)';
    shapePath(ctx, color, x, y, r * 0.58);
    ctx.fill();
  }

  /** A light at a train held by «Светофор»: a head with the red lamp on. */
  function drawSignal(b, x, y) {
    const ctx = b.ctx;
    const T = theme();
    const c = b.cell;
    const w = Math.max(9, c * 0.2);
    const hh = w * 1.75;
    const sx = x + c * 0.3;
    const sy = y - c * 0.42;
    roundRect(ctx, sx - w / 2, sy - hh / 2, w, hh, w * 0.35);
    ctx.fillStyle = T.surface2;
    ctx.fill();
    ctx.strokeStyle = T.bg;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = WARN;
    ctx.beginPath();
    ctx.arc(sx, sy - hh * 0.22, w * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = T.ink3;
    ctx.beginPath();
    ctx.arc(sx, sy + hh * 0.22, w * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  function skinPattern(ctx, skin, L, W) {
    if (!skin || skin === 'plain') return;
    const u = Math.max(5, W * 0.42);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.fillStyle = 'rgba(0,0,0,0.27)';
    ctx.lineWidth = Math.max(1.5, u * 0.3);
    ctx.lineCap = 'butt';
    ctx.beginPath();
    if (skin === 'stripes') {
      for (let x = -L / 2 + u / 2; x < L / 2; x += u) {
        ctx.moveTo(x, -W);
        ctx.lineTo(x, W);
      }
      ctx.stroke();
    } else if (skin === 'dots') {
      for (let x = -L / 2 + u * 0.4; x < L / 2; x += u) for (let y = -W / 2 + u * 0.35; y < W / 2; y += u * 0.9) ctx.rect(x, y, u * 0.38, u * 0.38);
      ctx.fill();
    } else if (skin === 'chevron') {
      for (let x = -L / 2 - u; x < L / 2; x += u) {
        ctx.moveTo(x, -W / 2);
        ctx.lineTo(x + u / 2, 0);
        ctx.lineTo(x, W / 2);
      }
      ctx.stroke();
    } else if (skin === 'check') {
      for (let x = -L / 2; x < L / 2; x += u) ctx.rect(x, -W / 2, u / 2, W / 2);
      for (let x2 = -L / 2 + u / 2; x2 < L / 2; x2 += u) ctx.rect(x2, 0, u / 2, W / 2);
      ctx.fill();
    } else if (skin === 'wave') {
      ctx.moveTo(-L / 2, 0);
      for (let x = -L / 2; x <= L / 2; x += 1.5) ctx.lineTo(x, Math.sin(x / (u * 0.4)) * W * 0.25);
      ctx.stroke();
    }
  }

  /** A skin on a small canvas of the workshop: a locomotive with a wagon. */
  function skinPreview(canvas, skin, w, hh) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hh * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hh);
    const cell = Math.min(hh / 0.5, w / 1.36);
    const keep = env.skin;
    env.skin = skin;
    drawTrain({ ctx, cell }, w / 2 + cell * 0.28, hh / 2, 0, 1, 2, 1);
    env.skin = keep;
  }

  window.TSDraw = {
    COLORS, SHAPES, THEMES, env, theme, mark, shapePath, roundRect, cxy,
    net: drawNet, train: drawTrain, waiting: drawWaiting, signal: drawSignal, skinPreview
  };
})();
