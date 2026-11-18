const path = require('node:path');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const N = require('../numbers.js');
const { test, done, engine } = require(path.join(process.env.AXIKO_ROOT || path.resolve(__dirname, '../../../Axiko'), 'scripts/games/harness.js'));

function near(actual, expected, tolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), actual + ' != ' + expected);
}
function finite(value) {
  const n = N.of(value);
  assert.ok(Number.isFinite(n.m));
  assert.ok(Number.isFinite(n.e));
  assert.ok(!/Infinity|NaN/.test(N.str(n)));
  assert.ok(Number.isFinite(N.toNumber(n)));
  assert.ok(Number.isFinite(N.log10(N.abs(n))));
}

test('сохранение точек 1e1500 и ступеней 1e900', () => {
  const saved = JSON.stringify({ points: N.of('1e1500'), tiers: [N.of('1e900')] });
  const loaded = JSON.parse(saved);
  assert.equal(loaded.points, '1e1500');
  assert.equal(loaded.tiers[0], '1e900');
  assert.equal(N.fmt(loaded.points), 'e1,50e3');
  finite(loaded.points);
});

test('нормализация и обычный формат совпадают с Big движка', () => {
  const Big = engine('big.js');
  for (const value of [0, 1, -2, 12.75, '0.005', '1.5e1500', '-3e308', { m: 125, e: 8 }]) {
    assert.ok(Big.eq(Big.of(N.str(value)), Big.of(value)));
  }
  assert.equal(N.fmt(12345), '12345');
  assert.equal(N.fmt('1.23e45'), '1,23e45');
  assert.equal(N.fmt('1e1000'), 'e1,00e3');
});

test('умножение, сравнение и вычитание через границу double', () => {
  assert.equal(N.str(N.mul('1e308', 10)), '1e309');
  assert.equal(N.str(N.div('1e309', 10)), '1e308');
  assert.ok(N.gt('1.000000000001e308', '1e308'));
  assert.ok(N.lt('9.999e307', '1e308'));
  near(N.of(N.sub('1e308', '9e307')).m, 1);
  assert.equal(N.of(N.sub('1e308', '9e307')).e, 307);
  assert.ok(N.eq(N.sub('1e308', '1e308'), 0));
  assert.ok(N.eq(N.sub('1e309', '9e308'), '1e308'));
  finite(N.add('1e308', '1e308'));
});

test('продвижение t0 → t1 и разбор расширенной строки', () => {
  assert.equal(N.of('1e1000000000000000').t, 0);
  assert.equal(N.of('1e1000000000000001').t, 1);
  const n = N.of('t1:2.5e17');
  assert.equal(n.t, 1);
  assert.equal(N.str(n), 't1:2.5e17');
  assert.equal(N.fmt(n), 'ee17,4');
  assert.equal(JSON.parse(JSON.stringify({ n })).n, 't1:2.5e17');
  assert.equal(N.str(N.log(n)), '2.5e17');
});

test('гистерезис t1 → t0 и сравнение в области перекрытия', () => {
  const held = N.of('t1:1e14');
  assert.equal(held.t, 1);
  assert.equal(N.of('t1:9e13').t, 0);
  assert.ok(N.eq(held, '1e100000000000000'));
  assert.ok(N.gt('t1:1.1e14', '1e100000000000000'));
  const down = N.pow(N.of('t1:1.1e15'), 0.01);
  assert.equal(down.t, 0);
  near(N.log10(down), 1.1e13);
  assert.equal(N.pow(N.of('t1:1.1e15'), 0.1).t, 1);
  const quotient = N.div('t1:1.1e15', '1e1000000000000000');
  near(N.log10(quotient), 1e14);
  finite(quotient);
});

test('арифметика t1 суммирует и масштабирует порядки', () => {
  const a = N.of('t1:2.5e17');
  const b = N.of('t1:1e17');
  assert.equal(N.str(N.add(a, b)), N.str(a));
  assert.equal(N.str(N.add(a, a)), N.str(a));
  assert.equal(N.str(N.mul(a, b)), 't1:3.5e17');
  assert.equal(N.str(N.div(a, b)), 't1:1.5e17');
  assert.equal(N.str(N.pow(a, 2)), 't1:5e17');
  assert.equal(N.str(N.root(a, 2)), 't1:1.25e17');
  assert.equal(N.str(N.pow10('2.5e17')), N.str(a));
  assert.equal(N.str(N.sub(a, b)), N.str(a));
  assert.ok(N.isZero(N.sub(b, a)));
  assert.ok(N.eq(N.div(a, a), 1));
  assert.ok(N.isZero(N.div(b, a)));
});

test('обычные знаки, степени, корни и округление', () => {
  assert.equal(N.str(N.pow(2, 10)), '1.024e3');
  assert.ok(N.eq(N.pow(-2, 3), -8));
  assert.ok(N.eq(N.pow(-2, 2), 4));
  assert.ok(N.eq(N.pow(2, -2), 0.25));
  assert.ok(N.eq(N.root(81, 2), 9));
  assert.equal(N.toNumber(N.floor(17.999999999999996)), 18);
  assert.equal(N.toNumber(N.floor(-0.1)), -1);
  assert.equal(N.toNumber(N.sub(2, 3)), -1);
  assert.equal(N.toNumber(N.log('0.01')), -2);
  assert.equal(N.toNumber(N.pow10(-2)), 0.01);
});

test('большие степени не проходят через double', () => {
  const value = N.pow(2, '1e900');
  assert.equal(value.t, 1);
  near(N.of(N.log(value)).m, Math.log10(2) * 10);
  assert.equal(N.of(N.log(value)).e, 899);
  const ten = N.pow10('1e1500');
  assert.equal(N.str(ten), 't1:1e1500');
  assert.equal(N.str(N.log(ten)), '1e1500');
  const deep = N.pow10('t1:1e14');
  assert.equal(N.str(deep), 't1:1e100000000000000');
  assert.ok(N.eq(N.log(deep), 't1:1e14'));
  assert.equal(N.str(N.div('t1:1e2000000000000000', 't1:1e3000000000000000')), '0e0');
  assert.equal(N.str(N.pow('0.5', 't1:1e15')), '0e0');
  for (const n of [value, ten, N.mul(ten, ten), N.pow(ten, 100), N.pow10('t1:1e1500')]) finite(n);
});

test('некорректные сохранения отклоняются без NaN', () => {
  for (const value of [NaN, Infinity, -Infinity, 'NaN', 'Infinity', '', 't2:1e20', 't1:bad', {}, {m: 1, e: Infinity}, {m: 1, e: 5, t: 2}]) {
    assert.equal(N.valid(value), false);
  }
  assert.throws(() => N.div(1, 0));
  assert.throws(() => N.log(-1));
  assert.throws(() => N.pow(-2, 0.5));
});

test('экспорт браузера и строгое подмножество Rhino', () => {
  const source = fs.readFileSync(require.resolve('../numbers.js'), 'utf8');
  const context = {};
  vm.runInNewContext(source, context);
  assert.equal(context.InfinityNumbers.fmt('1e1500'), 'e1,50e3');
  assert.deepEqual(engine('core.js').lint(source, true), []);
});

done('infinity-layers: расширенные числа');

