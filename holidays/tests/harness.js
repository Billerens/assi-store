// A tiny test runner: test('name', fn) prints one line per case; done() exits non-zero on failure.
var passed = 0;
var failed = 0;

exports.test = function (name, fn) {
  try {
    fn();
    passed++;
    console.log('ok    ' + name);
  } catch (error) {
    failed++;
    console.log('FAIL  ' + name + '\n      ' + (error && error.message ? error.message : error));
  }
};

exports.done = function (file) {
  console.log((file ? file + ': ' : '') + passed + ' прошло, ' + failed + ' не прошло');
  if (failed) process.exitCode = 1;
};
