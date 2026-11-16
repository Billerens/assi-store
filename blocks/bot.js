// Deterministic headless player and the optional hint. It maximizes cleared lines first;
// ties favour compact placement next to occupied cells and board edges. No future RNG is read.
(function (root, make) {
  var api = typeof exports !== 'undefined' ? make(require('./board.js')) : make(root.BlocksBoard);
  if (typeof exports !== 'undefined') { for (var k in api) exports[k] = api[k]; } else { root.BlocksBot = api; }
})(this, function (B) {
  'use strict';

  // A normal hand leaves at most two pieces. Check whether both can still be played, including
  // a line clear by the first one; it is not enough that each fits in the same solitary gap.
  function pairFits(boards, first, second) {
    for (var f = 0; f < boards.length; f++) {
      var positions = B.places(boards[f], first);
      for (var i = 0; i < positions.length; i++) {
        var after = boards[f].slice();
        B.put(after, first, positions[i][0], positions[i][1]);
        if (B.anyFit(after, second)) return true;
        for (var other = 0; other < boards.length; other++) {
          if (other !== f && B.anyFit(boards[other], second)) return true;
        }
      }
    }
    return false;
  }

  function best(game) {
    var chosen = null;
    for (var f = 0; f < game.b.length; f++) {
      var cells = game.b[f];
      var n = B.sideOf(cells);
      var rows = [];
      var cols = [];
      for (var i = 0; i < n; i++) { rows[i] = 0; cols[i] = 0; }
      for (var j = 0; j < cells.length; j++) if (B.solid(cells[j])) { rows[Math.floor(j / n)]++; cols[j % n]++; }
      for (var ti = 0; ti < game.tray.length; ti++) {
        var p = game.tray[ti];
        if (!p) continue;
        var box = B.bounds(p.c);
        for (var r = 0; r <= n - box.h; r++) {
          for (var c = 0; c <= n - box.w; c++) {
            if (!B.fits(cells, p, r, c)) continue;
            var rr = rows.slice();
            var cc = cols.slice();
            var touch = 0;
            for (var q = 0; q < p.c.length; q++) {
              var y = r + p.c[q][0];
              var x = c + p.c[q][1];
              rr[y]++;
              cc[x]++;
              if (y === 0 || cells[(y - 1) * n + x]) touch++;
              if (y === n - 1 || cells[(y + 1) * n + x]) touch++;
              if (x === 0 || cells[y * n + x - 1]) touch++;
              if (x === n - 1 || cells[y * n + x + 1]) touch++;
            }
            var lines = 0;
            var pressure = 0;
            for (var z = 0; z < n; z++) {
              if (rr[z] === n) lines++;
              if (cc[z] === n) lines++;
              pressure += rr[z] * rr[z] + cc[z] * cc[z];
            }
            var tie = touch * 4 + pressure + p.c.length;
            // Among equally scoring moves, avoid blocking another visible tray piece.
            // This uses only the current hand, not the generator or future deals.
            if (!chosen || lines >= chosen.lines) {
              var after = cells.slice();
              B.put(after, p, r, c);
              var remaining = [];
              for (var other = 0; other < game.tray.length; other++) {
                if (other === ti || !game.tray[other]) continue;
                remaining.push(game.tray[other]);
                if (B.anyFit(after, game.tray[other])) tie += 10000;
              }
              if (remaining.length === 2) {
                var boards = game.b.slice();
                boards[f] = after;
                if (pairFits(boards, remaining[0], remaining[1]) || pairFits(boards, remaining[1], remaining[0])) tie += 100000;
              }
            }
            if (!chosen || lines > chosen.lines || (lines === chosen.lines && tie > chosen.tie)) {
              chosen = { ti: ti, f: f, r: r, c: c, lines: lines, tie: tie };
            }
          }
        }
      }
    }
    return chosen;
  }

  function rescue(sim, state, cfg) {
    var g = state.run.game;
    var i;
    // First try the reserve: it costs no charge.
    if (sim.has(state, 'slot') && g.hold) {
      for (i = 0; i < g.tray.length; i++) {
        if (B.fitsAnywhere(g.b, g.hold)) return sim.hold(state, cfg, i);
      }
    }
    if (sim.has(state, 'slot') && !g.hold) {
      var remaining = [];
      for (i = 0; i < g.tray.length; i++) if (g.tray[i]) remaining.push(i);
      if (remaining.length === 1) return sim.hold(state, cfg, remaining[0]);
    }
    if (sim.toolLeft(state, 'rotate')) {
      for (i = 0; i < g.tray.length; i++) {
        if (g.tray[i] && B.fitsAnywhere(g.b, B.rotatePiece(g.tray[i]))) return sim.useTool(state, cfg, 'rotate', { ti: i }).ok;
      }
    }
    // Choose the clearing tool that removes most occupied cells for a single charge.
    var clear = null;
    ['eraser', 'bomb', 'hammer', 'ruler'].forEach(function (tool) {
      if (!sim.toolLeft(state, tool)) return;
      for (var f = 0; f < g.b.length; f++) {
        var cells = g.b[f];
        var n = B.sideOf(cells);
        for (var r = 0; r < n; r++) {
          for (var c = 0; c < n; c++) {
            if (tool === 'hammer' && c > 0) continue;
            if (tool === 'ruler' && r > 0) continue;
            var copy = cells.slice();
            var count = tool === 'bomb' ? B.clearArea(copy, r - 1, c - 1, r + 1, c + 1)
              : tool === 'hammer' ? B.clearArea(copy, r, 0, r, n - 1)
                : tool === 'ruler' ? B.clearArea(copy, 0, c, n - 1, c) : B.clearArea(copy, r, c, r, c);
            if (!clear || count > clear.count) clear = { tool: tool, f: f, r: r, c: c, count: count };
          }
        }
      }
    });
    if (clear && clear.count) return sim.useTool(state, cfg, clear.tool, clear).ok;
    if (sim.toolLeft(state, 'cutter')) {
      for (i = 0; i < g.tray.length; i++) {
        if (g.tray[i] && g.tray[i].c.length > 1) return sim.useTool(state, cfg, 'cutter', { ti: i }).ok;
      }
    }
    if (sim.toolLeft(state, 'reroll')) return sim.useTool(state, cfg, 'reroll').ok;
    // Undo is deliberately not replayed automatically: an identical greedy move would loop.
    return false;
  }

  function play(sim, state, cfg, options) {
    options = options || {};
    var moves = 0;
    var g = state.run.game;
    var limit = options.limit || 10000;
    while (moves < limit && !g.done) {
      var action = best(g);
      if (action) sim.place(state, cfg, action.ti, action.f, action.r, action.c);
      else if (!options.tools || !rescue(sim, state, cfg)) break;
      moves++;
    }
    return { score: g.score, deals: g.deal, moves: moves, used: g.used, capped: moves >= limit };
  }

  return { best: best, rescue: rescue, play: play };
});
