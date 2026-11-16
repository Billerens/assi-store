// A tiny test runner: node tests/<name>.test.js prints each check and exits with 1 on a failure.
var tests = [];

exports.test = function (name, fn) {
  tests.push({ name: name, fn: fn });
};

exports.run = function (title) {
  var failed = 0;
  tests.forEach(function (item) {
    try {
      item.fn();
      console.log('  ok   ' + item.name);
    } catch (error) {
      failed++;
      console.log('  FAIL ' + item.name + '\n       ' + (error && error.stack ? error.stack.split('\n').slice(0, 3).join('\n       ') : error));
    }
  });
  console.log((title || 'tests') + ': ' + (tests.length - failed) + ' of ' + tests.length + ' passed');
  if (failed) process.exitCode = 1;
};
