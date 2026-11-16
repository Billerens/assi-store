// A tiny test runner: test('name', fn) prints one line per case; done() exits non-zero on failure.
var fs = require('fs');
var path = require('path');

var passed = 0;
var failed = 0;

exports.test = function (name, fn) {
  try {
    fn();
    passed++;
    console.log('ok    ' + name);
  } catch (error) {
    failed++;
    console.log('FAIL  ' + name + '\n      ' + (error && error.stack ? error.stack.split('\n').slice(0, 3).join('\n      ') : error));
  }
};

exports.done = function (file) {
  console.log((file ? path.basename(file) + ': ' : '') + passed + ' прошло, ' + failed + ' не прошло');
  if (failed) process.exitCode = 1;
};

/** A saved answer from samples/ (real answers of the APIs, or the documented format). */
exports.sample = function (name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'samples', name + '.json'), 'utf8'));
};
