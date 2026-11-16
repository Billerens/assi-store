// SHA-1 of a text (UTF-8), as 40 hex digits. Pure JavaScript: runs the same in Assi's engine
// (Rhino) and under node, so the fingerprints of messages are checked on the computer.

function utf8(text) {
  var bytes = [];
  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      var low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i++;
      }
    }
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    } else {
      bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    }
  }
  return bytes;
}

function rotl(value, bits) {
  return (value << bits) | (value >>> (32 - bits));
}

function hex(value) {
  var out = '';
  for (var i = 7; i >= 0; i--) out += ((value >>> (i * 4)) & 15).toString(16);
  return out;
}

exports.sha1 = function (text) {
  var bytes = utf8(String(text));
  var length = bytes.length;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  var high = Math.floor(length / 0x20000000);
  var low = (length * 8) >>> 0;
  bytes.push((high >>> 24) & 255, (high >>> 16) & 255, (high >>> 8) & 255, high & 255);
  bytes.push((low >>> 24) & 255, (low >>> 16) & 255, (low >>> 8) & 255, low & 255);

  var h0 = 0x67452301;
  var h1 = 0xefcdab89;
  var h2 = 0x98badcfe;
  var h3 = 0x10325476;
  var h4 = 0xc3d2e1f0;
  var w = new Array(80);
  for (var block = 0; block < bytes.length; block += 64) {
    for (var t = 0; t < 16; t++) {
      var at = block + t * 4;
      w[t] = (bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3];
    }
    for (var u = 16; u < 80; u++) w[u] = rotl(w[u - 3] ^ w[u - 8] ^ w[u - 14] ^ w[u - 16], 1);
    var a = h0;
    var b = h1;
    var c = h2;
    var d = h3;
    var e = h4;
    for (var k = 0; k < 80; k++) {
      var f;
      var K;
      if (k < 20) { f = (b & c) | (~b & d); K = 0x5a827999; }
      else if (k < 40) { f = b ^ c ^ d; K = 0x6ed9eba1; }
      else if (k < 60) { f = (b & c) | (b & d) | (c & d); K = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; K = 0xca62c1d6; }
      var next = (rotl(a, 5) + f + e + K + w[k]) | 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = next;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }
  return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4);
};
