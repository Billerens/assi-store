var kit = require('../engine/checks-kit.js');
var checks = kit.standard(__dirname, { pace: false, zeroOffline: true, play: function () {} });
for (var name in checks) exports[name] = checks[name];

exports['insured freight is profitable'] = function(t) {
  var sim = require('modules/games/freeboard/sim.js');
  var p = sim.fresh();
  t.ok(sim.trade(p, 0, true), 'cargo purchase');
  var f = { mode: 0, dest: 1, hits: 0, samples: 0, rings: 0 };
  p.flight = f;
  var quote = sim.quote(p, 0, 1);
  t.ok(sim.settle(p, f, false), 'delivery');
  t.equal(p.credits, 220 + quote, 'forecast equals actual profit');
  t.ok(!sim.settle(p, f, false), 'one payment');
};
