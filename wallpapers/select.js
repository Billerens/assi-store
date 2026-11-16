// Choosing the picture: filters without a model (size, repeats, similar pictures, authors,
// brightness), the simple score, the prompts and answers of the two models, the crops for the
// two screens of a Fold and the arithmetic of reading a big file without filling the memory.
// Pure: runs in node (tests) and in the engine.

// ---- perceptual hash and brightness ---------------------------------------------------------

/** dHash of a 9×8 grayscale picture (72 values 0..255, row by row): 64 bits as 16 hex digits. */
exports.dhash = function (gray) {
  if (!gray || gray.length < 72) return '';
  var hex = '';
  for (var row = 0; row < 8; row++) {
    var nibble = 0;
    var bits = 0;
    for (var col = 0; col < 8; col++) {
      var bit = gray[row * 9 + col] > gray[row * 9 + col + 1] ? 1 : 0;
      nibble = (nibble << 1) | bit;
      bits++;
      if (bits === 4) {
        hex += nibble.toString(16);
        nibble = 0;
        bits = 0;
      }
    }
  }
  return hex;
};

var POPCOUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/** Bits that differ between two dHashes; 64 when one of them is missing. */
exports.hamming = function (a, b) {
  a = String(a || '');
  b = String(b || '');
  if (a.length !== 16 || b.length !== 16) return 64;
  var count = 0;
  for (var i = 0; i < 16; i++) {
    var x = parseInt(a.charAt(i), 16) ^ parseInt(b.charAt(i), 16);
    if (isNaN(x)) return 64;
    count += POPCOUNT[x];
  }
  return count;
};

/** Luma 0..255 of an ARGB int (as Bitmap.getPixels gives). */
exports.luma = function (argb) {
  var r = (argb >> 16) & 255;
  var g = (argb >> 8) & 255;
  var b = argb & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
};

/** Mean brightness 0..1 of grayscale values 0..255. */
exports.brightness = function (gray) {
  if (!gray || !gray.length) return 0;
  var sum = 0;
  for (var i = 0; i < gray.length; i++) sum += gray[i];
  return Math.round(sum / gray.length / 255 * 1000) / 1000;
};

/**
 * How sharp the middle of a picture is: the mean difference of neighbours in the central half
 * of a size×size grayscale square, 0..1. A blurred or empty middle scores low.
 */
exports.centerContrast = function (gray, size) {
  if (!gray || gray.length < size * size || size < 4) return 0;
  var from = Math.floor(size / 4);
  var to = Math.ceil(size * 3 / 4) - 1;
  var sum = 0;
  var count = 0;
  for (var y = from; y < to; y++) {
    for (var x = from; x < to; x++) {
      var here = gray[y * size + x];
      sum += Math.abs(here - gray[y * size + x + 1]) + Math.abs(here - gray[(y + 1) * size + x]);
      count += 2;
    }
  }
  return count ? Math.round(sum / count / 255 * 1000) / 1000 : 0;
};

// ---- the size of a picture from its first bytes ----------------------------------------------

function u16(bytes, at, little) {
  return little ? bytes[at] | (bytes[at + 1] << 8) : (bytes[at] << 8) | bytes[at + 1];
}

function u32be(bytes, at) {
  return ((bytes[at] << 24) >>> 0) + (bytes[at + 1] << 16) + (bytes[at + 2] << 8) + bytes[at + 3];
}

/**
 * Width and height from the beginning of a JPEG, PNG or WebP file (bytes 0..255), so the size
 * of a picture is known without downloading it whole: { width, height, type } or null.
 */
exports.imageSize = function (bytes) {
  if (!bytes || bytes.length < 24) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return { type: 'png', width: u32be(bytes, 16), height: u32be(bytes, 20) };
  }
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45) {
    var chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
    if (chunk === 'VP8X' && bytes.length >= 30) {
      return { type: 'webp', width: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)), height: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) };
    }
    if (chunk === 'VP8 ' && bytes.length >= 30) return { type: 'webp', width: u16(bytes, 26, true) & 0x3FFF, height: u16(bytes, 28, true) & 0x3FFF };
    if (chunk === 'VP8L' && bytes.length >= 25) {
      var b0 = bytes[21];
      var b1 = bytes[22];
      var b2 = bytes[23];
      var b3 = bytes[24];
      return { type: 'webp', width: 1 + (((b1 & 0x3F) << 8) | b0), height: 1 + (((b3 & 0xF) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6)) };
    }
    return null;
  }
  if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;
  var at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xFF) { at++; continue; }
    var marker = bytes[at + 1];
    if (marker === 0xFF) { at++; continue; }
    if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { at += 2; continue; }
    var length = u16(bytes, at + 2, false);
    // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      return { type: 'jpeg', height: u16(bytes, at + 5, false), width: u16(bytes, at + 7, false) };
    }
    if (marker === 0xDA) return null;
    at += 2 + length;
  }
  return null;
};

// ---- filters ---------------------------------------------------------------------------------

/**
 * The first sieve, before anything is downloaded: size, the same picture in the history, the
 * same author lately, a file too big, people when the owner does not want them.
 * history: rows { source, source_id, author, day, dhash } (dry runs included).
 * Returns { kept: [...], dropped: [{ item, why }] }.
 */
exports.prefilter = function (items, history, settings, todayKey, daysBetween) {
  var kept = [];
  var dropped = [];
  var seen = {};
  var authors = {};
  (history || []).forEach(function (row) {
    var age = daysBetween(row.day, todayKey);
    if (age <= settings.noRepeatDays) seen[row.source + ':' + row.source_id] = true;
    if (row.author && age < settings.authorDays) authors[String(row.author).toLowerCase()] = true;
  });
  var maxBytes = settings.maxDownloadMb * 1024 * 1024;
  items.forEach(function (item) {
    var why = '';
    var shortSide = Math.min(item.width || 0, item.height || 0);
    if (!item.probe && shortSide < settings.minSide) why = 'мала: ' + item.width + '×' + item.height;
    else if (seen[item.source + ':' + item.sourceId]) why = 'уже была';
    else if (item.author && authors[String(item.author).toLowerCase()]) why = 'автор был недавно';
    else if (item.bytes && item.bytes > maxBytes) why = 'файл больше ' + settings.maxDownloadMb + ' МБ';
    else if (item.people && !settings.allowPeople) why = 'люди в кадре';
    else if (!item.originalUrl || !item.thumbUrl) why = 'нет ссылки на файл';
    if (why) dropped.push({ item: item, why: why });
    else kept.push(item);
  });
  return { kept: kept, dropped: dropped };
};

/**
 * The second sieve, after the thumbnails were looked at (item.dhash, item.brightness): a
 * picture like one shown within noRepeatDays, a picture too bright for a dark theme (unless
 * the topic is allowed to be bright). Returns { kept, dropped }.
 */
exports.postfilter = function (items, history, settings, topic, todayKey, daysBetween) {
  var hashes = (history || []).filter(function (row) {
    return row.dhash && daysBetween(row.day, todayKey) <= settings.noRepeatDays;
  }).map(function (row) { return row.dhash; });
  var kept = [];
  var dropped = [];
  items.forEach(function (item) {
    var why = '';
    if (!item.dhash) why = 'миниатюра не прочиталась';
    else if (hashes.some(function (hash) { return exports.hamming(hash, item.dhash) <= settings.dhashDistance; })) why = 'похожа на бывшую';
    else if (!(topic && topic.bright) && item.brightness > settings.maxBrightness) why = 'слишком светлая: ' + item.brightness;
    if (!why) {
      // Two candidates of today that are the same picture: keep the first.
      for (var i = 0; i < kept.length; i++) {
        if (exports.hamming(kept[i].dhash, item.dhash) <= settings.dhashDistance) { why = 'похожа на другую из найденных'; break; }
      }
    }
    if (why) dropped.push({ item: item, why: why });
    else kept.push(item);
  });
  return { kept: kept, dropped: dropped };
};

// ---- the owner's taste ------------------------------------------------------------------------

/** Words of a title or query that say something (English and Russian, three letters and more). */
exports.words = function (textValue) {
  return String(textValue || '').toLowerCase().split(/[^a-zа-яё0-9]+/).filter(function (word) {
    return word.length >= 3 && ['the', 'and', 'with', 'from', 'над', 'под', 'для'].indexOf(word) < 0;
  });
};

/** weights rows [{ kind, value, weight }] → { topic: {}, author: {}, source: {}, word: {} }. */
exports.taste = function (rows) {
  var out = { topic: {}, author: {}, source: {}, word: {} };
  (rows || []).forEach(function (row) {
    if (out[row.kind]) out[row.kind][String(row.value).toLowerCase()] = Number(row.weight) || 0;
  });
  return out;
};

/** What a vote changes: the topic, the author, the source and the words of the query. */
exports.voteTargets = function (row) {
  var list = [];
  if (row.topic) list.push({ kind: 'topic', value: String(row.topic) });
  if (row.author) list.push({ kind: 'author', value: String(row.author).toLowerCase() });
  if (row.source) list.push({ kind: 'source', value: String(row.source) });
  exports.words(row.query).forEach(function (word) { list.push({ kind: 'word', value: word }); });
  return list;
};

/** −1..1: how much the owner's votes like this candidate. */
exports.tasteScore = function (item, taste) {
  if (!taste) return 0;
  var sum = 0;
  sum += taste.author[String(item.author || '').toLowerCase()] || 0;
  sum += (taste.source[item.source] || 0) * 0.5;
  exports.words(item.title).forEach(function (word) { sum += (taste.word[word] || 0) * 0.5; });
  return Math.max(-1, Math.min(1, sum / 4));
};

/**
 * The score without a model: near the wanted brightness, more pixels, a sharp middle, liked by
 * the owner. Weights are settings.
 */
exports.score = function (item, settings, taste) {
  var limit = Math.max(0.01, settings.maxBrightness);
  var bright = 1 - Math.min(1, Math.abs((item.brightness || 0) - settings.targetBrightness) / limit);
  var shortSide = Math.min(item.width || 0, item.height || 0);
  var resolution = Math.max(0, Math.min(1, Math.log(Math.max(1, shortSide / Math.max(1, settings.minSide))) / Math.log(2)));
  var contrast = Math.min(1, (item.contrast || 0) * 8);
  return settings.scoreBrightness * bright + settings.scoreResolution * resolution + settings.scoreContrast * contrast +
    settings.scoreTaste * exports.tasteScore(item, taste);
};

/** Candidates from best to worst by the simple score. */
exports.rank = function (items, settings, taste) {
  return items.map(function (item) { return { item: item, score: exports.score(item, settings, taste) }; })
    .sort(function (a, b) { return b.score - a.score; })
    .map(function (entry) {
      entry.item.score = Math.round(entry.score * 1000) / 1000;
      return entry.item;
    });
};

// ---- the models -------------------------------------------------------------------------------

/** The prompt for the role wallpapers.query: 2–3 English search queries as JSON. */
exports.queryPrompt = function (context, taste) {
  var likes = [];
  var dislikes = [];
  ['topic', 'word', 'source', 'author'].forEach(function (kind) {
    Object.keys(taste[kind] || {}).forEach(function (value) {
      var weight = taste[kind][value];
      if (weight > 0) likes.push(value);
      if (weight < 0) dislikes.push(value);
    });
  });
  return {
    system: 'Ты подбираешь фотографию для обоев телефона по контексту дня. Пиши поисковые запросы для фотобанков на английском: ' +
      '2–3 запроса по 2–5 слов, без кавычек и операторов. Тёмная тема телефона: предпочитай спокойные, не слишком яркие кадры ' +
      'без текста и людей. Ответ — только JSON {"queries": ["…", "…"]}.',
    prompt: JSON.stringify({
      topic: context.topic ? context.topic.query : '',
      topicName: context.topic ? context.topic.name : '',
      occasion: context.occasion ? context.occasion.title : null,
      weather: context.weather ? context.weather.en : null,
      season: context.season ? context.season.en : null,
      likes: likes.slice(0, 12),
      dislikes: dislikes.slice(0, 12)
    })
  };
};

/** The model's answer → up to three clean queries, or null. */
exports.parseQueries = function (answer) {
  var list = answer && Array.isArray(answer.queries) ? answer.queries : Array.isArray(answer) ? answer : null;
  if (!list) return null;
  var out = [];
  list.forEach(function (query) {
    var q = String(query || '').toLowerCase().replace(/[^a-z0-9 '\-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (q && q.split(' ').length <= 8 && out.indexOf(q) < 0) out.push(q);
  });
  return out.length ? out.slice(0, 3) : null;
};

/** The prompt for the role wallpapers.judge: n numbered thumbnails go with it. */
exports.judgePrompt = function (count, settings, context) {
  var cover = settings.coverWidth + '×' + settings.coverHeight;
  var inner = settings.innerWidth + '×' + settings.innerHeight;
  return 'Это ' + count + ' кандидатов в обои складного телефона, по порядку с 1. Тема дня: ' +
    (context.occasion ? context.occasion.title : context.topic ? context.topic.name : 'любая') +
    (context.weather && context.weather.word ? ', погода: ' + context.weather.word : '') +
    (context.season ? ', сезон: ' + context.season.ru : '') + '.\n' +
    'Выбери лучший кадр. Отвергни кадры: с текстом, подписями или водяными знаками; ' +
    (settings.allowPeople ? 'где люди — главное в кадре; ' : 'с людьми и крупными лицами; ') +
    'слишком яркие и пёстрые (на них не читаются часы и значки тёмной темы); с беспокойной верхней третью (там часы). ' +
    'Главный объект должен пережить кадрирование в узкую полосу ' + cover + ' и в почти квадрат ' + inner + '.\n' +
    'Ответ — только JSON: {"best": номер, "reasons": "коротко по-русски, почему", "focus": {"x": 0..1, "y": 0..1}, "reject": [номера]}. ' +
    'focus — где главный объект кадра (доли ширины и высоты).';
};

/** The judge's answer → { best (0-based), reasons, focus, reject (0-based) } or null if it is not usable. */
exports.parseJudge = function (answer, count) {
  if (!answer || typeof answer !== 'object') return null;
  var toIndex = function (value) {
    var n = Math.round(Number(value));
    return n >= 1 && n <= count ? n - 1 : -1;
  };
  var reject = (Array.isArray(answer.reject) ? answer.reject : []).map(toIndex).filter(function (i) { return i >= 0; });
  var best = toIndex(answer.best);
  if (best < 0 || reject.indexOf(best) >= 0) return null;
  var focus = null;
  if (answer.focus && typeof answer.focus === 'object') {
    var x = Number(answer.focus.x);
    var y = Number(answer.focus.y);
    if (isFinite(x) && isFinite(y)) focus = { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  }
  return { best: best, reasons: String(answer.reasons || '').slice(0, 300), focus: focus, reject: reject };
};

// ---- crops ------------------------------------------------------------------------------------

/**
 * The largest part of a W×H picture with the w:h proportions of a screen, placed so that the
 * focus point (0..1 of the picture) sits at (anchorX, anchorY) of the crop, kept inside the
 * picture. hinge > 0: the screen has a hinge down its middle (the Fold's inner screen) — the
 * focus is put that share of the width to the side of it, on the side where it already is.
 */
exports.cropRect = function (W, H, w, h, focus, options) {
  options = options || {};
  var fx = focus && isFinite(focus.x) ? focus.x : 0.5;
  var fy = focus && isFinite(focus.y) ? focus.y : (options.focusY === undefined ? 0.5 : options.focusY);
  var aspect = w / h;
  var cropW = W;
  var cropH = W / aspect;
  if (cropH > H) {
    cropH = H;
    cropW = H * aspect;
  }
  cropW = Math.floor(cropW);
  cropH = Math.floor(cropH);
  var anchorX = 0.5;
  var hinge = Number(options.hinge) || 0;
  if (hinge > 0) anchorX = fx < 0.5 ? 0.5 - hinge : 0.5 + hinge;
  var x = Math.round(fx * W - anchorX * cropW);
  var y = Math.round(fy * H - 0.5 * cropH);
  x = Math.max(0, Math.min(W - cropW, x));
  y = Math.max(0, Math.min(H - cropH, y));
  return { x: x, y: y, width: cropW, height: cropH };
};

/**
 * inSampleSize for reading the crop: the largest power of two that still leaves the crop at
 * least as big as the screen, and more when the crop would not fit in maxPixels.
 */
exports.sampleSize = function (cropW, cropH, w, h, maxPixels) {
  var sample = 1;
  while (cropW / (sample * 2) >= w && cropH / (sample * 2) >= h) sample *= 2;
  while (maxPixels && (cropW / sample) * (cropH / sample) > maxPixels) sample *= 2;
  return sample;
};

/** The screens to make for a pick, from the settings: [{ name, width, height, hinge }]. */
exports.targets = function (settings) {
  var list = [{ name: 'inner', width: settings.innerWidth, height: settings.innerHeight, hinge: settings.hingeShift }];
  list.push({ name: 'cover', width: settings.coverWidth, height: settings.coverHeight, hinge: 0 });
  return list;
};
