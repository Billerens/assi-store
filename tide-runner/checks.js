var kit = require('../engine/checks-kit.js');
var checks = kit.standard(__dirname, { pace: false, zeroOffline: true, play: function () { return 0; } });
for (var key in checks) exports[key] = checks[key];
exports['Five gates triple the bank'] = function (t) {
  var race = require('./race.js');
  t.equal(race.value(650, 5), 1950, 'full wave');
  t.equal(race.value(500, 4), 1000, 'early exit');
};
