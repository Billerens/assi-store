// Shop names: "PYATEROCHKA 1234 MOSKVA", "Пятёрочка", "YANDEX*TAXI" brought to one key and one name.
// Pure: no Android, no native.

var LETTERS = {
  'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'E', 'Ж': 'ZH', 'З': 'Z', 'И': 'I', 'Й': 'Y',
  'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U', 'Ф': 'F',
  'Х': 'KH', 'Ц': 'TS', 'Ч': 'CH', 'Ш': 'SH', 'Щ': 'SHCH', 'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'YU', 'Я': 'YA'
};

// Words that say where or what kind of firm, not which shop.
var LEGAL = ['OOO', 'OAO', 'ZAO', 'PAO', 'AO', 'IP', 'LLC', 'LTD', 'INC', 'GMBH', 'NKO', 'FGUP', 'GUP', 'MUP'];
var PLACES = ['MOSKVA', 'MOSCOW', 'MSK', 'SANKT', 'PETERBURG', 'PETERSBURG', 'PETERBU', 'SPB', 'ST', 'SPBURG',
  'EKATERINBURG', 'EKATERINBUR', 'KAZAN', 'NOVOSIBIRSK', 'NIZHNIY', 'NIZHNII', 'NOVGOROD', 'SAMARA', 'ROSTOV',
  'KRASNODAR', 'SOCHI', 'VORONEZH', 'PERM', 'UFA', 'CHELYABINSK', 'OMSK', 'KRASNOYARSK', 'VOLGOGRAD', 'TYUMEN',
  'IRKUTSK', 'KHIMKI', 'MYTISHCHI', 'MYTISCHI', 'PODOLSK', 'BALASHIKHA', 'KRASNOGORSK', 'ODINTSOVO', 'LYUBERTSY',
  'KOROLEV', 'ZELENOGRAD', 'KALININGRAD', 'TOMSK', 'TULA', 'YAROSLAVL', 'RUS', 'RU', 'RUSSIA', 'G', 'OBL', 'MO',
  'MOSKOVSKAYA', 'RF', 'MOSCOW CITY'];

/** Cyrillic letters in Latin, the way banks spell shops in SMS: "Пятёрочка" → "PYATEROCHKA". */
function translit(text) {
  var s = String(text || '').toUpperCase();
  var out = '';
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    out += LETTERS[ch] !== undefined ? LETTERS[ch] : ch;
  }
  return out;
}

/** The key of a shop: upper-case Latin words without numbers, cities, firm forms and marks. */
function key(raw) {
  if (!raw) return '';
  var s = String(raw).toUpperCase().replace(/Ё/g, 'Е').trim();
  // Payments through the app stores carry the service after a star: "GOOGLE *YouTube".
  var store = /^GOOGLE(?: PLAY)?\s*\*\s*(.+)$/.exec(s);
  if (store) s = store[1];
  if (/APPLE\.COM\/BILL|ITUNES\.COM/.test(s)) s = 'APPLE';
  s = s.replace(/["«»'`’]/g, ' ')
    .replace(/[*>\/\\_|,;:#№()\[\]{}+!?=]/g, ' ')
    .replace(/\.(?=\S)/g, ' ')
    .replace(/\.\s*$/g, '')
    .replace(/\s-\s/g, ' ');
  s = translit(s);
  var words = [];
  s.split(/\s+/).forEach(function (word) {
    if (!word) return;
    // "LENTA-12" → "LENTA"; "SANKT-PETERBURG" → two words, both places.
    word.split('-').forEach(function (part) {
      part = part.replace(/^\.+|\.+$/g, '');
      if (part) words.push(part);
    });
  });
  var kept = words.filter(function (word) {
    if (/^\d+$/.test(word)) return false;
    if (/^[A-Z]{0,2}\d{2,}[A-Z]?$/.test(word)) return false;
    if (LEGAL.indexOf(word) >= 0) return false;
    return true;
  });
  // A name made of digits alone ("36,6") is still a name.
  if (!kept.length) kept = words.filter(function (word) { return LEGAL.indexOf(word) < 0; });
  var noPlaces = kept.filter(function (word, i) { return i === 0 || PLACES.indexOf(word) < 0; });
  // A first word that is a place goes too, unless the name is nothing but places.
  if (noPlaces.length > 1 && PLACES.indexOf(noPlaces[0]) >= 0) noPlaces = noPlaces.slice(1);
  return noPlaces.join(' ').trim();
}

/**
 * A rougher form of a key for comparing spellings: "YANDEKS TAKSI" and "YANDEX TAXI" are one.
 */
function loose(k) {
  return String(k || '').split(' ').map(function (word) {
    return word.replace(/KS/g, 'X').replace(/KH/g, 'H').replace(/TS|TC|CZ/g, 'C').replace(/YO|YE/g, 'E')
      .replace(/YU/g, 'IU').replace(/YA/g, 'IA').replace(/J/g, 'I').replace(/[IY]+/g, 'I').replace(/W/g, 'V')
      .replace(/CK/g, 'K').replace(/Q/g, 'K').replace(/(.)\1+/g, '$1');
  }).join(' ');
}

/**
 * Finds the shop in the dictionary { KEY: { name, category, package } }: the exact key, or the
 * longest key that stands in the name as whole words. Returns { key, entry } or null.
 */
function lookup(raw, dictionary) {
  var k = key(raw);
  if (!k || !dictionary) return null;
  if (dictionary[k]) return { key: k, entry: dictionary[k] };
  var padded = ' ' + k + ' ';
  var joined = ' ' + k.replace(/ /g, '') + ' ';
  var best = null;
  var rough = ' ' + loose(k) + ' ';
  Object.keys(dictionary).forEach(function (candidate) {
    if (!candidate) return;
    var hit = padded.indexOf(' ' + candidate + ' ') >= 0 || joined.indexOf(' ' + candidate.replace(/ /g, '') + ' ') >= 0;
    if (hit && (!best || candidate.length > best.length)) best = candidate;
  });
  if (!best) {
    Object.keys(dictionary).forEach(function (candidate) {
      if (candidate.length < 4) return;
      if (rough.indexOf(' ' + loose(candidate) + ' ') >= 0 && (!best || candidate.length > best.length)) best = candidate;
    });
  }
  return best ? { key: best, entry: dictionary[best] } : null;
}

function capitalize(word) {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** How to show a shop that is not in the dictionary: "SHOKOLADNITSA 12" → "Shokoladnitsa". */
function title(raw) {
  var s = String(raw || '').trim();
  if (!s) return '';
  if (/[А-Яа-яЁё]/.test(s)) {
    // Written in Russian already: keep it, without trailing marks; "ИВАН И" → "Иван И".
    s = s.replace(/[.,;:]+$/, '').replace(/\s+/g, ' ');
    return /[а-яё]/.test(s) ? s : s.split(' ').map(capitalize).join(' ');
  }
  var k = key(s);
  if (!k) return s;
  return k.split(' ').map(capitalize).join(' ');
}

/**
 * The shop as the module keeps it: { key, name, category, package } — from the dictionary when it
 * knows the shop, otherwise the key, a readable name and no category.
 */
function resolve(raw, dictionary) {
  if (!raw) return { key: '', name: '', category: null, package: null };
  var found = lookup(raw, dictionary);
  if (found) {
    return {
      key: found.key,
      name: found.entry.name || title(raw),
      category: found.entry.category || null,
      package: found.entry.package || null
    };
  }
  return { key: key(raw), name: title(raw), category: null, package: null };
}

/**
 * Are these two names the same shop? Yes when they share a word longer than three letters
 * after bringing both to keys (so "Пятёрочка" and "PYATEROCHKA 1234" match).
 */
function similar(a, b) {
  var ka = key(a);
  var kb = key(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  var wa = loose(ka).split(' ').filter(function (w) { return w.length > 3; });
  var wb = loose(kb).split(' ').filter(function (w) { return w.length > 3; });
  for (var i = 0; i < wa.length; i++) {
    for (var j = 0; j < wb.length; j++) {
      if (wa[i] === wb[j]) return true;
      // "YANDEXGO" and "YANDEX GO", "VKUSVILL" and "VKUS VILL".
      if (wa[i].length > 5 && wb[j].length > 5 && (wa[i].indexOf(wb[j]) === 0 || wb[j].indexOf(wa[i]) === 0)) return true;
    }
  }
  return ka.replace(/ /g, '') === kb.replace(/ /g, '');
}

exports.translit = translit;
exports.key = key;
exports.lookup = lookup;
exports.title = title;
exports.resolve = resolve;
exports.similar = similar;
exports.loose = loose;
