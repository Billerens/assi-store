// The 44-byte header that turns raw 16-bit PCM (what the speech API answers) into a .wav file
// any player opens. Pure logic (engine and node): bytes as an array of numbers 0..255.

function le(value, size) {
  var out = [];
  for (var i = 0; i < size; i++) out.push((value >>> (8 * i)) & 255);
  return out;
}

function ascii(text) {
  var out = [];
  for (var i = 0; i < text.length; i++) out.push(text.charCodeAt(i));
  return out;
}

/** The header for dataBytes bytes of PCM: rate (24000), channels (1), bits (16). */
function header(dataBytes, rate, channels, bits) {
  rate = rate || 24000;
  channels = channels || 1;
  bits = bits || 16;
  var block = channels * bits / 8;
  return [].concat(
    ascii('RIFF'), le(36 + dataBytes, 4), ascii('WAVE'),
    ascii('fmt '), le(16, 4), le(1, 2), le(channels, 2), le(rate, 4), le(rate * block, 4), le(block, 2), le(bits, 2),
    ascii('data'), le(dataBytes, 4)
  );
}

/** Does the beginning of these bytes look like a wav file already? */
function isWav(bytes) {
  if (!bytes || bytes.length < 12) return false;
  var text = function (from, n) {
    var s = '';
    for (var i = from; i < from + n; i++) s += String.fromCharCode(bytes[i] & 255);
    return s;
  };
  return text(0, 4) === 'RIFF' && text(8, 4) === 'WAVE';
}

/** Seconds of sound in that many bytes of PCM. */
function seconds(dataBytes, rate, channels, bits) {
  rate = rate || 24000;
  channels = channels || 1;
  bits = bits || 16;
  return dataBytes / (rate * channels * bits / 8);
}

/** The file extension for a Content-Type of a speech answer. */
function extension(contentType) {
  var type = String(contentType || '').toLowerCase();
  if (!type || type.indexOf('audio/pcm') === 0 || type.indexOf('audio/l16') === 0 || type.indexOf('application/octet-stream') === 0) return 'wav';
  if (type.indexOf('wav') >= 0) return 'wav';
  if (type.indexOf('mpeg') >= 0 || type.indexOf('mp3') >= 0) return 'mp3';
  if (type.indexOf('ogg') >= 0 || type.indexOf('opus') >= 0) return 'ogg';
  if (type.indexOf('aac') >= 0 || type.indexOf('mp4') >= 0 || type.indexOf('m4a') >= 0) return 'm4a';
  if (type.indexOf('flac') >= 0) return 'flac';
  return 'bin';
}

/** Whether the answer is raw PCM that needs a header. */
function isRaw(contentType) {
  var type = String(contentType || '').toLowerCase();
  return !type || type.indexOf('audio/pcm') === 0 || type.indexOf('audio/l16') === 0 || type.indexOf('application/octet-stream') === 0;
}

/** The sample rate from a Content-Type like «audio/pcm; rate=24000». */
function rateOf(contentType, fallback) {
  var match = /rate=(\d+)/.exec(String(contentType || ''));
  return match ? Number(match[1]) : (fallback || 24000);
}

exports.header = header;
exports.isWav = isWav;
exports.seconds = seconds;
exports.extension = extension;
exports.isRaw = isRaw;
exports.rateOf = rateOf;
