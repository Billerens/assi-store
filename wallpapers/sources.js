// The open sources of pictures: how to ask each one and how to read its answer. Every parser
// turns an answer into candidates of one shape and keeps only pictures with a free licence.
// Pure: runs in node (tests, on answers saved in samples/) and in the engine.
//
// A candidate: { source, sourceId, title, author, authorUrl, license, licenseUrl, pageUrl,
//   originalUrl, thumbUrl, width, height (what we will actually download), fullWidth,
//   fullHeight (the original), bytes, mime, probe (size unknown — read the file's header),
//   people (the source says people are in it), downloadLocation (Unsplash) }

var USER_AGENT = 'AssiWallpapers/1.0 (personal wallpaper app on Android)';

// Wikimedia serves only standard thumbnail widths (checked 2026-11-14: 500 and 960 answer,
// 400 does not), so thumbnails are asked at 500.
var WIKIMEDIA_THUMB = 500;

var NAMES = {
  commons: 'Wikimedia Commons',
  openverse: 'Openverse',
  apod: 'NASA APOD',
  'nasa-images': 'NASA Images',
  aic: 'Art Institute of Chicago',
  unsplash: 'Unsplash',
  pexels: 'Pexels'
};

exports.USER_AGENT = USER_AGENT;
exports.NAMES = NAMES;
exports.WIKIMEDIA_THUMB = WIKIMEDIA_THUMB;

/** Which sources need the owner's key, and the name of the secret it is kept under. */
exports.KEYS = {
  unsplash: { secret: 'unsplash.key', title: 'Ключ Unsplash (Access Key)', site: 'https://unsplash.com/developers', required: true },
  pexels: { secret: 'pexels.key', title: 'Ключ Pexels API', site: 'https://www.pexels.com/api/', required: true },
  apod: { secret: 'nasa.key', title: 'Ключ api.nasa.gov (необязательно)', site: 'https://api.nasa.gov/', required: false }
};

/** Sources used for every topic, and those only for space topics (the description: APOD only for «космос»). */
exports.SPACE_ONLY = { apod: true, 'nasa-images': true };

function text(html) {
  return String(html === undefined || html === null ? '' : html)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstHref(html) {
  var match = /href="([^"]+)"/.exec(String(html || ''));
  if (!match) return '';
  var href = match[1].replace(/&amp;/g, '&');
  if (href.indexOf('//') === 0) return 'https:' + href;
  if (href.indexOf('/') === 0) return 'https://commons.wikimedia.org' + href;
  return href;
}

function clip(value, length) {
  var s = String(value || '').trim();
  return s.length > length ? s.slice(0, length - 1).trim() + '…' : s;
}

/** Drops tracking parameters (`utm_*`) the APIs add to links. */
exports.clean = function (url) {
  if (!url) return '';
  var parts = String(url).split('?');
  if (parts.length < 2) return parts[0];
  var kept = parts.slice(1).join('?').split('&').filter(function (pair) { return pair && !/^utm_/.test(pair); });
  return parts[0] + (kept.length ? '?' + kept.join('&') : '');
};

/** Adds query parameters to a link that may already have some. */
exports.withParams = function (url, params) {
  var pairs = Object.keys(params).map(function (key) { return key + '=' + encodeURIComponent(String(params[key])); });
  if (!pairs.length) return url;
  return url + (String(url).indexOf('?') >= 0 ? '&' : '?') + pairs.join('&');
};

/**
 * The address of a standard-width thumbnail of a file on upload.wikimedia.org:
 * …/commons/8/84/Name.jpg → …/commons/thumb/8/84/Name.jpg/500px-Name.jpg (webp and png too).
 */
exports.wikimediaThumb = function (url, width) {
  var match = /^(https?:\/\/upload\.wikimedia\.org\/wikipedia\/[a-z]+)\/([0-9a-f])\/([0-9a-f]{2})\/([^?\/]+)/.exec(String(url || ''));
  if (!match) return '';
  var name = match[4];
  var thumbName = (width || WIKIMEDIA_THUMB) + 'px-' + name + (/\.(tiff?|webp)$/i.test(name) ? '.jpg' : '');
  return match[1] + '/thumb/' + match[2] + '/' + match[3] + '/' + name + '/' + thumbName;
};

/** Is a licence name one we may use for wallpapers: public domain, CC0, CC BY, CC BY-SA, plain «Attribution». */
exports.freeLicense = function (name) {
  var n = String(name || '').toLowerCase().trim();
  if (!n) return false;
  if (/\bnc\b|non-?commercial|\bnd\b|no-?deriv|fair use|all rights reserved/.test(n)) return false;
  return /^(cc0|cc[ -]?zero|public domain|pd\b|pd-|pdm|cc[ -]by|by\b|by-sa|attribution$|attribution\b|no restrictions|unsplash license|pexels license|nasa)/.test(n);
};

/** A short licence name from an Openverse code: by-sa 4.0 → CC BY-SA 4.0, cc0 → CC0 1.0, pdm → Public Domain Mark. */
exports.openverseLicense = function (code, version) {
  var c = String(code || '').toLowerCase();
  var v = version ? ' ' + version : '';
  if (c === 'cc0') return 'CC0' + v;
  if (c === 'pdm') return 'Public Domain Mark' + v;
  return 'CC ' + c.toUpperCase() + v;
};

function scaled(width, height, minSide) {
  // A picture asked at `minSide` on its shorter side (the APIs scale on the server).
  var w = Number(width) || 0;
  var h = Number(height) || 0;
  if (!w || !h) return { width: w, height: h, scale: 1 };
  var shortSide = Math.min(w, h);
  if (!minSide || shortSide <= minSide) return { width: w, height: h, scale: 1 };
  var scale = minSide / shortSide;
  return { width: Math.round(w * scale), height: Math.round(h * scale), scale: scale };
}

exports.scaled = scaled;

// ---- the requests -----------------------------------------------------------------------------

/**
 * The request for a source: { url, headers }.
 * opts: { query, pageSize, minSide, aspect (openverse), key (unsplash, pexels, apod), apodCount (apod) }
 */
exports.request = function (source, opts) {
  var q = String(opts.query || '').trim();
  var n = Math.max(1, Math.min(50, Number(opts.pageSize) || 20));
  var min = Math.max(1, Number(opts.minSide) || 1);
  var headers = { 'User-Agent': USER_AGENT };
  if (source === 'commons') {
    var search = q + ' filetype:bitmap filew:>' + (min - 1) + ' fileh:>' + (min - 1);
    return {
      url: 'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&generator=search&gsrnamespace=6' +
        '&gsrlimit=' + n + '&gsrsearch=' + encodeURIComponent(search) +
        '&prop=imageinfo&iiprop=url%7Csize%7Cmime%7Cextmetadata&iiurlwidth=' + WIKIMEDIA_THUMB +
        '&iiextmetadatafilter=' + encodeURIComponent('LicenseShortName|LicenseUrl|Artist|ObjectName|ImageDescription|AttributionRequired|Copyrighted|UsageTerms|Credit|Restrictions'),
      headers: headers
    };
  }
  if (source === 'openverse') {
    var aspect = opts.aspect && opts.aspect !== 'any' ? '&aspect_ratio=' + opts.aspect : '';
    return {
      url: 'https://api.openverse.org/v1/images/?q=' + encodeURIComponent(q) + '&size=large' + aspect + '&license_type=all&mature=false&page_size=' + n,
      headers: headers
    };
  }
  if (source === 'apod') {
    var count = Math.max(1, Math.min(100, Number(opts.apodCount) || 10));
    return { url: 'https://api.nasa.gov/planetary/apod?api_key=' + inAddress(opts.key || 'DEMO_KEY') + '&count=' + count + '&thumbs=true', headers: headers };
  }
  if (source === 'nasa-images') {
    return { url: 'https://images-api.nasa.gov/search?q=' + encodeURIComponent(q) + '&media_type=image&page_size=' + n, headers: headers };
  }
  if (source === 'aic') {
    return {
      url: 'https://api.artic.edu/api/v1/artworks/search?q=' + encodeURIComponent(q) + '&query%5Bterm%5D%5Bis_public_domain%5D=true' +
        '&fields=id,title,artist_title,artist_display,image_id,thumbnail,is_public_domain,date_display,copyright_notice,place_of_origin&limit=' + n,
      headers: { 'User-Agent': USER_AGENT, 'AIC-User-Agent': USER_AGENT }
    };
  }
  if (source === 'unsplash') {
    return {
      url: 'https://api.unsplash.com/search/photos?query=' + encodeURIComponent(q) + '&per_page=' + n + '&orientation=portrait&content_filter=high',
      headers: { 'User-Agent': USER_AGENT, Authorization: 'Client-ID ' + (opts.key || ''), 'Accept-Version': 'v1' }
    };
  }
  if (source === 'pexels') {
    return {
      url: 'https://api.pexels.com/v1/search?query=' + encodeURIComponent(q) + '&per_page=' + n + '&orientation=portrait&size=large',
      headers: { 'User-Agent': USER_AGENT, Authorization: opts.key || '' }
    };
  }
  throw new Error('Нет источника ' + source);
};

/** Headers to download a source's files with (the Art Institute's image server asks for its own). */
exports.fileHeaders = function (source) {
  if (source === 'aic') return { 'User-Agent': USER_AGENT, 'AIC-User-Agent': USER_AGENT };
  return { 'User-Agent': USER_AGENT };
};

/** Says what a non-JSON answer means: a check for robots (Cloudflare), a limit, a wrong key. */
exports.failure = function (status, body) {
  var b = String(body || '');
  if (/just a moment|challenges\.cloudflare|cf-chl/i.test(b)) return 'источник отвечает проверкой на робота — пропущен';
  if (status === 401 || status === 403) return 'ключ не подошёл или доступ закрыт (' + status + ')';
  if (status === 429) return 'исчерпан лимит запросов, попробуйте позже';
  if (status >= 500) return 'источник не отвечает (' + status + ')';
  return 'ответ ' + status;
};

// ---- the answers ------------------------------------------------------------------------------

function base(source, fields) {
  var out = {
    source: source, sourceId: '', title: '', author: '', authorUrl: '', license: '', licenseUrl: '', pageUrl: '',
    originalUrl: '', thumbUrl: '', width: 0, height: 0, fullWidth: 0, fullHeight: 0, bytes: 0, mime: '', probe: false,
    people: false, downloadLocation: '', country: ''
  };
  Object.keys(fields).forEach(function (key) { out[key] = fields[key]; });
  if (!out.fullWidth) out.fullWidth = out.width;
  if (!out.fullHeight) out.fullHeight = out.height;
  return out;
}

function commons(json) {
  var pages = (json && json.query && json.query.pages) || [];
  if (!Array.isArray(pages)) pages = Object.keys(pages).map(function (key) { return pages[key]; });
  var items = [];
  var skipped = 0;
  pages.slice().sort(function (a, b) { return (a.index || 0) - (b.index || 0); }).forEach(function (page) {
    var info = page.imageinfo && page.imageinfo[0];
    if (!info) return;
    var meta = info.extmetadata || {};
    var value = function (key) { return meta[key] ? meta[key].value : ''; };
    var license = text(value('LicenseShortName'));
    var mime = String(info.mime || '');
    if (!exports.freeLicense(license) || !/^image\/(jpeg|png|webp)$/.test(mime)) { skipped++; return; }
    var name = String(page.title || '').replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '');
    var restrictions = text(value('Restrictions')).toLowerCase();
    items.push(base('commons', {
      sourceId: String(page.pageid),
      title: clip(text(value('ObjectName')) || name, 120),
      author: clip(text(value('Artist')) || text(value('Credit')) || 'автор не указан', 80),
      authorUrl: firstHref(value('Artist')),
      license: license,
      licenseUrl: text(value('LicenseUrl')),
      pageUrl: exports.clean(info.descriptionurl || ''),
      originalUrl: exports.clean(info.url || ''),
      thumbUrl: exports.clean(info.thumburl || exports.wikimediaThumb(info.url, WIKIMEDIA_THUMB)),
      width: Number(info.width) || 0,
      height: Number(info.height) || 0,
      bytes: Number(info.size) || 0,
      mime: mime,
      people: /personality/.test(restrictions)
    }));
  });
  return { items: items, note: skipped ? 'без свободной лицензии или не фото: ' + skipped : '' };
}

function openverse(json) {
  var items = [];
  var skipped = 0;
  ((json && json.results) || []).forEach(function (item) {
    var license = exports.openverseLicense(item.license, item.license_version);
    if (!exports.freeLicense(license) || item.mature) { skipped++; return; }
    var url = String(item.url || '');
    var wiki = /upload\.wikimedia\.org/.test(url);
    items.push(base('openverse', {
      sourceId: String(item.id),
      title: clip(text(item.title) || 'без названия', 120),
      author: clip(text(item.creator) || 'автор не указан', 80),
      authorUrl: String(item.creator_url || ''),
      license: license,
      licenseUrl: String(item.license_url || ''),
      pageUrl: String(item.foreign_landing_url || ''),
      originalUrl: url,
      // Openverse cannot render thumbnails of Wikimedia files (checked 2026-11-14: 424); ask Wikimedia itself.
      thumbUrl: wiki ? exports.wikimediaThumb(url, WIKIMEDIA_THUMB) : String(item.thumbnail || ''),
      width: Number(item.width) || 0,
      height: Number(item.height) || 0,
      bytes: Number(item.filesize) || 0,
      mime: item.filetype ? 'image/' + String(item.filetype).replace('jpg', 'jpeg') : '',
      probe: !item.width || !item.height,
      provider: String(item.provider || '')
    }));
  });
  return { items: items, note: skipped ? 'не подошла лицензия: ' + skipped : '' };
}

/** APOD answers since apod.nasa.gov moved: every day is the NASA logo (seen 2026-11-14). */
exports.apodPlaceholder = function (item) {
  return /nasa-logo/i.test(String(item.url || '') + String(item.hdurl || '')) || String(item.title || '') === 'NASA Science';
};

function apodPage(date) {
  var match = /^(\d{2})(\d{2})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  return match ? 'https://apod.nasa.gov/apod/ap' + match[2] + match[3] + match[4] + '.html' : 'https://apod.nasa.gov/apod/';
}

function apod(json) {
  var list = Array.isArray(json) ? json : json ? [json] : [];
  var items = [];
  var placeholders = 0;
  var skipped = 0;
  list.forEach(function (item) {
    if (exports.apodPlaceholder(item)) { placeholders++; return; }
    if (item.media_type !== 'image' || item.copyright) { skipped++; return; }
    var url = String(item.hdurl || item.url || '');
    items.push(base('apod', {
      sourceId: String(item.date || url),
      title: clip(text(item.title), 120),
      author: 'NASA',
      authorUrl: 'https://apod.nasa.gov/',
      license: 'Public domain (NASA)',
      licenseUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
      pageUrl: apodPage(item.date),
      originalUrl: url,
      thumbUrl: String(item.url || url),
      probe: true
    }));
  });
  var notes = [];
  if (placeholders) notes.push('вместо снимков заглушки: ' + placeholders + ' (API APOD сломан после переезда сайта)');
  if (skipped) notes.push('видео или чужие права: ' + skipped);
  return { items: items, note: notes.join('; '), placeholders: placeholders };
}

function nasaImages(json) {
  var items = [];
  var skipped = 0;
  var list = (json && json.collection && json.collection.items) || [];
  list.forEach(function (item) {
    var data = (item.data && item.data[0]) || {};
    var links = item.links || [];
    var original = links.filter(function (link) { return link.rel === 'canonical'; })[0];
    var preview = links.filter(function (link) { return link.rel === 'preview'; })[0] || links[0];
    var credit = [data.secondary_creator, data.photographer, data.description].join(' ');
    // Material of others in the NASA library is marked as such: leave it out.
    if (data.media_type !== 'image' || !original || /©|copyright/i.test(credit)) { skipped++; return; }
    items.push(base('nasa-images', {
      sourceId: String(data.nasa_id || original.href),
      title: clip(text(data.title), 120),
      author: clip(text(data.secondary_creator || data.photographer || ('NASA ' + (data.center || '')).trim()), 80),
      authorUrl: '',
      license: 'NASA (без авторских ограничений)',
      licenseUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
      pageUrl: 'https://images.nasa.gov/details/' + encodeURIComponent(String(data.nasa_id || '')),
      originalUrl: String(original.href),
      thumbUrl: preview ? String(preview.href) : '',
      width: Number(original.width) || 0,
      height: Number(original.height) || 0,
      bytes: Number(original.size) || 0,
      probe: !original.width || !original.height
    }));
  });
  return { items: items, note: skipped ? 'без оригинала или с чужими правами: ' + skipped : '' };
}

/** The largest size the Art Institute's IIIF server gives (its info.json: maxArea). */
exports.aicServed = function (width, height, maxArea) {
  var w = Number(width) || 0;
  var h = Number(height) || 0;
  var area = Number(maxArea) || 0;
  if (!w || !h || !area || w * h <= area) return { width: w, height: h };
  var scale = Math.sqrt(area / (w * h));
  var sw = Math.floor(w * scale);
  var sh = Math.floor(h * sw / w);
  return { width: sw, height: sh };
};

/** maxArea from an IIIF info.json, or 0 when it does not say. */
exports.iiifMaxArea = function (info) {
  var profile = (info && info.profile) || [];
  for (var i = 0; i < profile.length; i++) {
    if (profile[i] && typeof profile[i] === 'object' && profile[i].maxArea) return Number(profile[i].maxArea);
  }
  return Number(info && info.maxArea) || 0;
};

function aic(json, opts) {
  var iiif = (json && json.config && json.config.iiif_url) || 'https://www.artic.edu/iiif/2';
  var maxArea = Number(opts && opts.maxArea) || 0;
  var items = [];
  var skipped = 0;
  ((json && json.data) || []).forEach(function (art) {
    var thumb = art.thumbnail || {};
    if (!art.image_id || art.is_public_domain !== true || art.copyright_notice) { skipped++; return; }
    var served = exports.aicServed(thumb.width, thumb.height, maxArea);
    var title = text(art.title) + (art.date_display ? ', ' + text(art.date_display) : '');
    items.push(base('aic', {
      sourceId: String(art.id),
      title: clip(title, 120),
      author: clip(text(art.artist_title) || text(String(art.artist_display || '').split('\n')[0]) || 'автор не указан', 80),
      authorUrl: '',
      license: 'CC0 (общественное достояние)',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      pageUrl: 'https://www.artic.edu/artworks/' + art.id,
      originalUrl: iiif + '/' + art.image_id + '/full/' + (served.width || 843) + ',/0/default.jpg',
      thumbUrl: iiif + '/' + art.image_id + '/full/500,/0/default.jpg',
      width: served.width,
      height: served.height,
      fullWidth: Number(thumb.width) || 0,
      fullHeight: Number(thumb.height) || 0,
      mime: 'image/jpeg',
      probe: !thumb.width || !thumb.height,
      imageId: String(art.image_id),
      country: clip(text(art.place_of_origin), 60)
    }));
  });
  return { items: items, note: skipped ? 'без картинки или не общественное достояние: ' + skipped : '' };
}

function utm(url) {
  return url ? exports.withParams(url, { utm_source: 'assi', utm_medium: 'referral' }) : '';
}

function unsplash(json, opts) {
  var minSide = Number(opts && opts.minSide) || 0;
  var items = [];
  var skipped = 0;
  ((json && json.results) || []).forEach(function (photo) {
    // Unsplash+ pictures are not under the free Unsplash License.
    if (photo.premium || photo.plus || !photo.urls || !photo.urls.raw) { skipped++; return; }
    var size = scaled(photo.width, photo.height, minSide);
    var user = photo.user || {};
    items.push(base('unsplash', {
      sourceId: String(photo.id),
      title: clip(text(photo.description || photo.alt_description) || 'без названия', 120),
      author: clip(text(user.name || user.username) || 'автор не указан', 80),
      authorUrl: utm(user.links && user.links.html),
      license: 'Unsplash License',
      licenseUrl: 'https://unsplash.com/license',
      pageUrl: utm(photo.links && photo.links.html),
      originalUrl: exports.withParams(String(photo.urls.raw), size.scale < 1 ? { w: size.width, fm: 'jpg', q: 90 } : { fm: 'jpg', q: 90 }),
      thumbUrl: String(photo.urls.small || photo.urls.thumb || ''),
      width: size.width,
      height: size.height,
      fullWidth: Number(photo.width) || 0,
      fullHeight: Number(photo.height) || 0,
      mime: 'image/jpeg',
      downloadLocation: String((photo.links && photo.links.download_location) || ''),
      country: clip(text(photo.location && photo.location.country), 60)
    }));
  });
  return { items: items, note: skipped ? 'платные Unsplash+: ' + skipped : '' };
}

function pexels(json, opts) {
  var minSide = Number(opts && opts.minSide) || 0;
  var items = [];
  ((json && json.photos) || []).forEach(function (photo) {
    if (!photo.src || !photo.src.original) return;
    var size = scaled(photo.width, photo.height, minSide);
    items.push(base('pexels', {
      sourceId: String(photo.id),
      title: clip(text(photo.alt) || 'без названия', 120),
      author: clip(text(photo.photographer) || 'автор не указан', 80),
      authorUrl: String(photo.photographer_url || ''),
      license: 'Pexels License',
      licenseUrl: 'https://www.pexels.com/license/',
      pageUrl: String(photo.url || ''),
      originalUrl: size.scale < 1
        ? exports.withParams(String(photo.src.original), { auto: 'compress', cs: 'tinysrgb', w: size.width })
        : String(photo.src.original),
      thumbUrl: String(photo.src.medium || photo.src.small || ''),
      width: size.width,
      height: size.height,
      fullWidth: Number(photo.width) || 0,
      fullHeight: Number(photo.height) || 0
    }));
  });
  return { items: items, note: '' };
}

var PARSERS = { commons: commons, openverse: openverse, apod: apod, 'nasa-images': nasaImages, aic: aic, unsplash: unsplash, pexels: pexels };

/** A source's answer → { items: [candidate…], note }. Never throws: a strange answer is "nothing". */
exports.parse = function (source, json, opts) {
  var parser = PARSERS[source];
  if (!parser) return { items: [], note: 'нет такого источника' };
  try {
    return parser(json, opts || {});
  } catch (error) {
    return { items: [], note: 'не понял ответ: ' + (error && error.message ? error.message : error) };
  }
};

/** Leaves one candidate per picture: the same file can come from Commons and from Openverse. */
exports.dedupe = function (list) {
  var seen = {};
  return list.filter(function (item) {
    var file = String(item.originalUrl || '').split('?')[0].toLowerCase();
    var keys = [item.source + ':' + item.sourceId];
    if (file) keys.push(file);
    if (keys.some(function (key) { return seen[key]; })) return false;
    keys.forEach(function (key) { seen[key] = true; });
    return true;
  });
};

/** The caption under a picture: "Фото: Анна Петрова, Unsplash". */
exports.credit = function (item) {
  var name = NAMES[item.source] || item.source;
  return 'Фото: ' + (item.author || 'автор не указан') + ', ' + name;
};

/** A key in an address: a secret named for the shell ('{{secret:name}}') goes in as it is, the shell encodes the value it puts there. */
function inAddress(key) {
  return /^\{\{secret:[A-Za-z0-9_.-]+\}\}$/.test(String(key)) ? String(key) : encodeURIComponent(key);
}

/**
 * Sources to ask for a topic, in order: free ones first (they need nothing), keyed ones when
 * the owner gave a key; NASA Images and APOD only for space topics, and then before the rest.
 */
exports.order = function (enabled, topic, keys) {
  var space = Boolean(topic && topic.space);
  var list = space ? ['nasa-images', 'apod', 'commons', 'openverse', 'aic', 'unsplash', 'pexels']
    : ['commons', 'openverse', 'aic', 'unsplash', 'pexels'];
  return list.filter(function (id) {
    if (!enabled[id]) return false;
    if (exports.SPACE_ONLY[id] && !(topic && topic.space)) return false;
    if (exports.KEYS[id] && exports.KEYS[id].required && !(keys && keys[id])) return false;
    return true;
  });
};
