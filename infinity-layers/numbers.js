(function (root, make) {
  var api = make();
  if (typeof exports !== 'undefined') {
    for (var key in api) exports[key] = api[key];
  } else {
    root.InfinityNumbers = api;
  }
})(this, function () {
  'use strict';

  // t=0: m * 10^e. t=1: 10^(m * 10^e). The overlap is deliberate:
  // an ordinary value promotes above order 1e15, an extended one demotes below 1e14.
  // Like the engine this is approximate arithmetic, with 15 significant digits.
  // Extended values are nonnegative; subtracting a larger extended value clamps to 0.
  var UP = 1e15;
  var DOWN = 1e14;
  var MAX_E = 9e15;
  var MAX_NUMBER = Number.MAX_VALUE;
  var DROP = 15;
  var NUM = /^\s*([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?\s*$/;
  var lg = Math.log10 || function (x) { return Math.log(x) / Math.LN10; };

  function X(m, e, t) {
    this.m = m;
    this.e = e;
    this.t = t || 0;
  }
  X.prototype.toJSON = function () { return str(this); };
  X.prototype.toString = function () { return str(this); };
  var ZERO = new X(0, 0, 0);
  var ONE = new X(1, 0, 0);

  function bad(message) { return new Error('InfinityNumbers: ' + message); }
  function finite(x) { return typeof x === 'number' && isFinite(x); }
  function ten(n) { return Number('1e' + n); }

  // Normalize a raw pair without promoting it. This also serves the inner order of t=1.
  function pair(m, e) {
    if (!finite(m) || !finite(e)) throw bad('не конечное число');
    if (m === 0) return ZERO;
    var magnitude = Math.abs(m);
    var shift;
    if (magnitude < 1e-300) {
      m *= 1e300;
      e -= 300;
      magnitude = Math.abs(m);
    }
    if (magnitude >= 10 || magnitude < 1) {
      shift = Math.floor(lg(magnitude));
      m = shift >= 0 ? m / ten(shift) : m * ten(-shift);
      e += shift;
    }
    if (Math.abs(m) >= 10) { m /= 10; e++; }
    if (Math.abs(m) < 1) { m *= 10; e--; }
    if (Math.abs(m) >= 10 - 1e-14) { m = m < 0 ? -1 : 1; e++; }
    if (e < -MAX_E) return ZERO;
    if (!finite(e)) throw bad('слишком большой порядок');
    return new X(m, e, 0);
  }

  function ordinary(m, e) {
    var value = pair(m, e);
    if (value.e > UP && value.m > 0) return extended(pair(value.e, 0));
    return value;
  }

  function extended(order) {
    if (order.m <= 0) return pow10(order);
    if (order.e < 14 || (order.e === 14 && order.m < 1)) return pow10(order);
    return order.e > MAX_E ? new X(9.99999999999999, MAX_E, 1) : new X(order.m, order.e, 1);
  }

  function parsePair(text) {
    var match = NUM.exec(String(text));
    if (!match || (!match[2] && !match[3])) throw bad('неверная запись числа');
    var whole = match[2] || '';
    var frac = match[3] || '';
    var digits = whole + frac;
    var lead = 0;
    while (lead < digits.length && digits.charAt(lead) === '0') lead++;
    if (lead === digits.length) return ZERO;
    var significant = digits.slice(lead);
    var exponent = match[4] ? Number(match[4]) : 0;
    if (!finite(exponent)) throw bad('слишком длинный порядок');
    var mantissa = Number(significant.charAt(0) + '.' + significant.slice(1, 17));
    return pair(match[1] === '-' ? -mantissa : mantissa, whole.length - lead - 1 + exponent);
  }

  function of(x, fallback) {
    if (x instanceof X) return x;
    if (x === null || x === undefined) {
      if (arguments.length > 1) return of(fallback);
      throw bad('нет значения');
    }
    if (typeof x === 'number') return ordinary(x, 0);
    if (typeof x === 'string') {
      var text = x.replace(/^\s+|\s+$/g, '');
      if (text.slice(0, 3) === 't1:') return extended(parsePair(text.slice(3)));
      var parsed = parsePair(text);
      return ordinary(parsed.m, parsed.e);
    }
    if (typeof x === 'object' && finite(x.m) && finite(x.e)) {
      if (x.t !== undefined && x.t !== 0 && x.t !== 1) throw bad('неизвестный слой числа');
      var normalized = pair(x.m, Math.round(x.e));
      return x.t === 1 ? extended(normalized) : ordinary(normalized.m, normalized.e);
    }
    throw bad('неверный тип числа');
  }

  function valid(x) { try { of(x); return true; } catch (error) { return false; } }
  function isBig(x) { return x instanceof X; }

  function pairString(x) {
    if (x.m === 0) return '0e0';
    var mantissa = Number(x.m.toPrecision(15));
    var exponent = x.e;
    if (Math.abs(mantissa) >= 10) { mantissa /= 10; exponent++; }
    // Exponents must remain decimal integers so the save parser can read them again.
    return String(mantissa) + 'e' + String(exponent);
  }

  function str(x) { x = of(x); return (x.t === 1 ? 't1:' : '') + pairString(x); }
  function toNumber(x) {
    x = of(x);
    if (x.m === 0) return 0;
    if (x.t === 1 || x.e > 308) return x.m < 0 ? -MAX_NUMBER : MAX_NUMBER;
    if (x.e < -324) return 0;
    var value = x.e < -308 ? (x.m * 1e-308) * ten(x.e + 308) : x.m * ten(x.e);
    if (!finite(value)) return x.m < 0 ? -MAX_NUMBER : MAX_NUMBER;
    return value;
  }

  function rawCmp(a, b) {
    if (a.m === 0) return b.m === 0 ? 0 : b.m > 0 ? -1 : 1;
    if (b.m === 0) return a.m > 0 ? 1 : -1;
    if ((a.m > 0) !== (b.m > 0)) return a.m > 0 ? 1 : -1;
    var polarity = a.m > 0 ? 1 : -1;
    if (a.e !== b.e) return (a.e > b.e ? 1 : -1) * polarity;
    return a.m === b.m ? 0 : a.m > b.m ? 1 : -1;
  }

  // log is the lossless game-facing order. log10/toNumber are finite UI helpers;
  // they saturate to Number.MAX_VALUE when the native double cannot represent an order.
  // log(0) follows the game's zero-income convention and returns 0 rather than -Infinity.
  function log(x) {
    x = of(x);
    if (x.m === 0) return ZERO;
    if (x.m < 0) throw bad('логарифм отрицательного числа');
    if (x.t === 1) return ordinary(x.m, x.e);
    return ordinary(x.e + lg(x.m), 0);
  }
  function log10(x) { return toNumber(log(x)); }

  function cmp(a, b) {
    a = of(a); b = of(b);
    if (a.t === 0 && b.t === 0) return rawCmp(a, b);
    if (a.m <= 0 || b.m <= 0) return a.m <= 0 ? -1 : 1;
    return cmp(log(a), log(b));
  }
  function gte(a, b) { return cmp(a, b) >= 0; }
  function gt(a, b) { return cmp(a, b) > 0; }
  function lte(a, b) { return cmp(a, b) <= 0; }
  function lt(a, b) { return cmp(a, b) < 0; }
  function eq(a, b) { return cmp(a, b) === 0; }
  function max(a, b) { return cmp(a, b) >= 0 ? of(a) : of(b); }
  function min(a, b) { return cmp(a, b) <= 0 ? of(a) : of(b); }
  function isZero(x) { return of(x).m === 0; }
  function sign(x) { var m = of(x).m; return m === 0 ? 0 : m > 0 ? 1 : -1; }
  function abs(x) { x = of(x); return x.m < 0 ? new X(-x.m, x.e, 0) : x; }
  function neg(x) {
    x = of(x);
    if (x.t === 1) throw bad('отрицательное расширенное число не поддерживается');
    return x.m === 0 ? ZERO : new X(-x.m, x.e, 0);
  }

  function add(a, b) {
    a = of(a); b = of(b);
    if (a.m === 0) return b;
    if (b.m === 0) return a;
    if (a.t === 1 || b.t === 1) return max(a, b);
    var gap = a.e - b.e;
    if (gap > DROP) return a;
    if (gap < -DROP) return b;
    return gap >= 0 ? ordinary(a.m + b.m / ten(gap), a.e) : ordinary(a.m / ten(-gap) + b.m, b.e);
  }

  function sub(a, b) {
    a = of(a); b = of(b);
    if (a.t === 1 || b.t === 1) return cmp(a, b) <= 0 ? ZERO : a;
    return add(a, neg(b));
  }

  function pow10(exponent, retainExtended) {
    var order = of(exponent);
    if (order.m === 0) return ONE;
    if (order.t === 1) {
      var innerOrder = pair(order.m, order.e);
      if (rawCmp(innerOrder, pair(MAX_E, 0)) > 0) return new X(9.99999999999999, MAX_E, 1);
      var innerNumber = toNumber(innerOrder);
      var innerWhole = Math.floor(innerNumber);
      return new X(Math.pow(10, innerNumber - innerWhole), innerWhole, 1);
    }
    if (order.m > 0 && (gt(order, UP) || (retainExtended && gte(order, DOWN)))) return extended(order);
    if (order.m < 0 && lt(order, -MAX_E)) return ZERO;
    var value = toNumber(order);
    var whole = Math.floor(value);
    return ordinary(Math.pow(10, value - whole), whole);
  }

  function mul(a, b) {
    a = of(a); b = of(b);
    if (a.m === 0 || b.m === 0) return ZERO;
    if (a.t === 0 && b.t === 0) return ordinary(a.m * b.m, a.e + b.e);
    if (a.m < 0 || b.m < 0) throw bad('отрицательное расширенное число не поддерживается');
    return pow10(add(log(a), log(b)), true);
  }

  function div(a, b) {
    a = of(a); b = of(b);
    if (b.m === 0) throw bad('деление на ноль');
    if (a.m === 0) return ZERO;
    if (a.t === 0 && b.t === 0) return ordinary(a.m / b.m, a.e - b.e);
    if (a.m < 0 || b.m < 0) throw bad('отрицательное расширенное число не поддерживается');
    var orderA = log(a);
    var orderB = log(b);
    if ((orderA.t === 1 || orderB.t === 1) && lt(orderA, orderB)) return ZERO;
    return pow10(sub(orderA, orderB), true);
  }

  function pow(x, exponent) {
    x = of(x);
    var power = of(exponent);
    if (power.m === 0) return ONE;
    if (x.m === 0) {
      if (power.m < 0) throw bad('деление на ноль');
      return ZERO;
    }
    if (eq(power, ONE)) return x;
    var nativePower = toNumber(power);
    if (x.m < 0) {
      if (power.t || power.e > 14 || nativePower % 1 !== 0) throw bad('недопустимая степень отрицательного числа');
      var positive = pow(abs(x), power);
      return nativePower % 2 ? neg(positive) : positive;
    }
    // Small integer powers preserve exact prices and integer milestones.
    if (x.t === 0 && power.t === 0 && Math.abs(nativePower) <= 1048576 && nativePower % 1 === 0) {
      var remaining = Math.abs(nativePower);
      var base = x;
      var result = ONE;
      while (remaining > 0) {
        if (remaining % 2) result = mul(result, base);
        remaining = Math.floor(remaining / 2);
        if (remaining) base = mul(base, base);
      }
      return nativePower < 0 ? div(ONE, result) : result;
    }
    if (power.t === 1 && lt(x, ONE)) return ZERO;
    return pow10(mul(log(x), power), x.t === 1);
  }

  function root(x, degree) { return pow(x, div(ONE, degree)); }
  function sqrt(x) { return root(x, 2); }
  function floor(x) {
    x = of(x);
    if (x.t === 1 || x.e >= 15 || x.m === 0) return x;
    if (x.e < 0) return x.m < 0 ? of(-1) : ZERO;
    return of(Math.floor(Number(toNumber(x).toPrecision(14))));
  }

  function decimal(value, digits) { return value.toFixed(digits).replace('.', ','); }
  function fmt(x, digits) {
    x = of(x);
    digits = digits === undefined ? 2 : Math.max(0, Math.min(6, Math.floor(digits)));
    if (x.t === 1) return 'ee' + decimal(x.e + lg(x.m), 1);
    if (x.m === 0) return '0';
    if (x.e < 6 && x.e >= 0) return String(Math.floor(Number(toNumber(x).toPrecision(14))));
    if (x.e < 0) return String(Math.floor(toNumber(x)));
    if (x.e >= 1000) {
      var order = pair(x.e + lg(Math.abs(x.m)), 0);
      return (x.m < 0 ? '-' : '') + 'e' + decimal(order.m, digits) + 'e' + order.e;
    }
    return decimal(x.m, digits) + 'e' + x.e;
  }

  return {
    of: of, parse: of, str: str, valid: valid, isBig: isBig,
    add: add, sub: sub, mul: mul, div: div, pow: pow, pow10: pow10,
    root: root, sqrt: sqrt, log: log, log10: log10,
    cmp: cmp, gte: gte, gt: gt, lte: lte, lt: lt, eq: eq, max: max, min: min,
    floor: floor, toNumber: toNumber, isZero: isZero, sign: sign, neg: neg, abs: abs,
    fmt: fmt, ZERO: ZERO, ONE: ONE, UP: UP, DOWN: DOWN, MAX_E: MAX_E
  };
});



