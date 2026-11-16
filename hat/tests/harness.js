// Маленький прогон тестов под node: test('имя', fn); итог и код выхода — при завершении.
var passed = 0;
var failed = 0;

exports.test = function (name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    failed += 1;
    console.log('НЕ ПРОШЛО: ' + name + '\n  ' + (error && error.stack ? error.stack.split('\n').slice(0, 3).join('\n  ') : error));
  }
};

/** Детерминированный «случай» для перемешиваний. */
exports.seeded = function (seed) {
  var state = seed || 1;
  return function () {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
};

process.on('exit', function () {
  console.log((failed ? 'ОШИБКИ' : 'ок') + ': прошло ' + passed + ', не прошло ' + failed + ' — ' + require('path').basename(process.argv[1]));
  if (failed) process.exitCode = 1;
});
