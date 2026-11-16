// Builds the offline dictionary of «Словоплёт» on a computer:
//
//   node tools/build-dict.js --cache <folder for downloads> [--out _data/assets] [--top 20000]
//
// Sources (addresses in tools/sources.json, downloaded once into --cache, never into the game):
//   - OpenCorpora dictionary (CC BY-SA 3.0): lemmas with the part of speech NOUN, without the
//     marks name, surname, patronymic, toponym, organisation, trademark, abbreviation, error,
//     distortion, slang (and initials, vulgar); without hyphens, digits, Latin; 3..12 letters;
//   - hunspell ru_RU of A. I. Lebedev (BSD-style): only words the spell checker accepts in lower
//     case stay — this cleans the markup noise and the proper names;
//   - FrequencyWords (CC BY-SA 4.0): the frequency of a lemma is the sum over its forms that are
//     not also forms of another part of speech; the dictionary is written most frequent first,
//     so the first `dict.commonTop` lines are the common words (the game's setting).
// Ё and Е: a word keeps its ё for show; two nouns that differ only by ё/е become one (the more
// frequent). Each line: the word, then a tab and its nominative plural as «how many letters to
// cut from the end» + «what to add» (кошка → 1и), for «Переулок форм»; plural-only nouns have none.
//
// Writes: <out>/dict.txt, <out>/LICENSE.txt, tools/dict-report.txt (counts, removed by mark with
// examples, 200 random words to check by eye, the control list of names, cities and brands).
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');

const HERE = __dirname;
const GAME = path.resolve(HERE, '..');
const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const CACHE = arg('cache', null);
if (!CACHE && require.main === module) {
  console.log('Укажите папку для загрузок: node tools/build-dict.js --cache <папка>');
  process.exit(2);
}
const OUT = path.resolve(arg('out', path.join(GAME, '_data', 'assets')));
const TOP = Number(arg('top', 20000));
const REPORT = path.resolve(arg('report', path.join(HERE, 'dict-report.txt')));
const SOURCES = JSON.parse(fs.readFileSync(path.join(HERE, 'sources.json'), 'utf8'));

const MARKS = {
  Name: 'имя', Surn: 'фамилия', Patr: 'отчество', Geox: 'топоним', Orgn: 'организация', Trad: 'торговая марка',
  Abbr: 'аббревиатура', Erro: 'ошибка', Dist: 'искажение', Slng: 'жаргон', Init: 'инициал', Vulg: 'грубое', Obsc: 'грубое'
};
const MIN_LEN = 3;
const MAX_LEN = 12;

const yo = (w) => w.replace(/ё/g, 'е');

// ---- downloads --------------------------------------------------------------------------------------

async function download(src) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, src.file);
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) return { file, url: '(кэш)' };
  const errors = [];
  for (const url of src.urls) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'dict-builder' }, redirect: 'follow' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 1000) throw new Error('слишком мало: ' + buf.length + ' байт');
      if (/\.zip$/.test(src.file) && buf.readUInt32LE(0) !== 0x04034b50) throw new Error('не zip');
      fs.writeFileSync(file, buf);
      console.log('скачано ' + src.file + ' (' + buf.length + ' байт) из ' + url);
      return { file, url };
    } catch (error) {
      errors.push(url + ': ' + error.message);
    }
  }
  throw new Error('Не скачать ' + src.file + ':\n  ' + errors.join('\n  '));
}

// ---- zip: the entries, one streamed line by line or read whole -------------------------------------

function zipEntries(file) {
  const fd = fs.openSync(file, 'r');
  const size = fs.fstatSync(fd).size;
  const tailLen = Math.min(size, 66000);
  const tail = Buffer.alloc(tailLen);
  fs.readSync(fd, tail, 0, tailLen, size - tailLen);
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) {
    if (tail.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('zip без оглавления: ' + file);
  const count = tail.readUInt16LE(eocd + 10);
  const cdSize = tail.readUInt32LE(eocd + 12);
  const cdOffset = tail.readUInt32LE(eocd + 16);
  const cd = Buffer.alloc(cdSize);
  fs.readSync(fd, cd, 0, cdSize, cdOffset);
  const out = [];
  let p = 0;
  for (let n = 0; n < count && cd.readUInt32LE(p) === 0x02014b50; n++) {
    const method = cd.readUInt16LE(p + 10);
    const compSize = cd.readUInt32LE(p + 20);
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const commentLen = cd.readUInt16LE(p + 32);
    const local = cd.readUInt32LE(p + 42);
    const name = cd.slice(p + 46, p + 46 + nameLen).toString('utf8');
    const lh = Buffer.alloc(30);
    fs.readSync(fd, lh, 0, 30, local);
    out.push({ name, method, compSize, start: local + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  fs.closeSync(fd);
  return out;
}

function zipEntry(file) {
  const list = zipEntries(file);
  return list.find((e) => /words\.dawg$/.test(e.name)) || list.find((e) => /(^|\/)dict[^/]*\.(txt|xml)$/.test(e.name)) || list[0];
}

function zipRead(file, e) {
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(e.compSize);
  fs.readSync(fd, buf, 0, e.compSize, e.start);
  fs.closeSync(fd);
  return e.method === 8 ? zlib.inflateRawSync(buf) : buf;
}

function lines(file, onLine) {
  const e = zipEntry(file);
  let stream = fs.createReadStream(file, { start: e.start, end: e.start + e.compSize - 1 });
  if (e.method === 8) stream = stream.pipe(zlib.createInflateRaw());
  else if (e.method !== 0) throw new Error('zip: сжатие ' + e.method + ' не поддержано');
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  rl.on('line', onLine);
  return new Promise((resolve, reject) => {
    rl.on('close', () => resolve(e.name));
    stream.on('error', reject);
  });
}

// ---- the same dictionary compiled by pymorphy (pymorphy3-dicts-ru on PyPI) -----------------------------
// When opencorpora.org is down: the wheel holds the OpenCorpora dictionary of a known revision
// (data/meta.json) as a DAWG of «form \x01 base64(>HH: paradigm, index)» plus the paradigms
// (suffixes, tags, prefixes). The reader below follows dawg-python (Dictionary, Guide, Completer).

function* dawgKeys(buf) {
  const dictSize = buf.readUInt32LE(0);
  const units = new Uint32Array(dictSize);
  for (let i = 0; i < dictSize; i++) units[i] = buf.readUInt32LE(4 + i * 4);
  const gOff = 4 + dictSize * 4;
  const guideSize = buf.readUInt32LE(gOff);
  const guide = buf.subarray(gOff + 4, gOff + 4 + guideSize * 2);
  const offset = (b) => ((b >>> 10) << ((b & (1 << 9)) >>> 6)) >>> 0;
  const label = (b) => (b & ((1 << 31) | 0xff)) >>> 0;
  const hasLeaf = (b) => (b & (1 << 8)) !== 0;
  const follow = (lab, index) => {
    const next = (index ^ offset(units[index]) ^ lab) >>> 0;
    return label(units[next]) === lab ? next : -1;
  };
  const child = (i) => guide[i * 2];
  const sibling = (i) => guide[i * 2 + 1];
  const key = [];
  const stack = [0];
  let last = 0;
  function terminal(index) {
    while (!hasLeaf(units[index])) {
      const lab = child(index);
      index = follow(lab, index);
      if (index < 0) return false;
      key.push(lab);
      stack.push(index);
    }
    last = index;
    return true;
  }
  for (;;) {
    if (!stack.length) return;
    let index = stack[stack.length - 1];
    if (last !== 0) {
      const lab = child(index);
      if (lab) {
        index = follow(lab, index);
        if (index < 0) return;
        key.push(lab);
        stack.push(index);
      } else {
        let moved = false;
        for (;;) {
          const sib = sibling(index);
          if (key.length) key.pop();
          stack.pop();
          if (!stack.length) return;
          index = stack[stack.length - 1];
          if (sib) {
            index = follow(sib, index);
            if (index < 0) return;
            key.push(sib);
            stack.push(index);
            moved = true;
            break;
          }
        }
        if (!moved) return;
      }
    }
    if (!terminal(index)) return;
    yield Buffer.from(key);
  }
}

function pymorphyData(file) {
  const entries = zipEntries(file);
  const get = (suffix) => zipRead(file, entries.find((e) => e.name.endsWith(suffix)));
  const meta = {};
  JSON.parse(get('data/meta.json').toString('utf8')).forEach((p) => { meta[p[0]] = p[1]; });
  const suffixes = JSON.parse(get('data/suffixes.json').toString('utf8'));
  const gramtab = JSON.parse(get('data/gramtab-opencorpora-int.json').toString('utf8'));
  const pb = get('data/paradigms.array');
  const paradigms = [];
  let p = 2;
  const count = pb.readUInt16LE(0);
  for (let i = 0; i < count; i++) {
    const len = pb.readUInt16LE(p);
    p += 2;
    const para = new Uint16Array(len);
    for (let j = 0; j < len; j++) para[j] = pb.readUInt16LE(p + j * 2);
    p += len * 2;
    paradigms.push(para);
  }
  return { meta, suffixes, gramtab, paradigms, prefixes: meta.compile_options.paradigm_prefixes, words: get('data/words.dawg') };
}

/** The lexemes of the pymorphy dictionary: nouns grouped (paradigm + normal form); other forms one by one. */
function pymorphyLexemes(file, onLexeme, d) {
  d = d || pymorphyData(file);
  const nouns = new Map();
  let n = 0;
  for (const raw of dawgKeys(d.words)) {
    const sep = raw.indexOf(1);
    if (sep < 0) continue;
    const word = raw.subarray(0, sep).toString('utf8');
    const val = Buffer.from(raw.subarray(sep + 1).toString('latin1'), 'base64');
    if (val.length < 4) continue;
    const para = d.paradigms[val.readUInt16BE(0)];
    const idx = val.readUInt16BE(2);
    const len = para.length / 3;
    const tag = d.gramtab[para[len + idx]];
    n++;
    const sp = tag.indexOf(' ');
    const lexPart = sp < 0 ? tag : tag.slice(0, sp);
    const formPart = sp < 0 ? '' : tag.slice(sp + 1);
    if (lexPart.slice(0, 5) !== 'NOUN,' && lexPart !== 'NOUN') {
      onLexeme({ lemma: word, lex: new Set(lexPart.split(',')), forms: [{ t: word, g: new Set() }] });
      continue;
    }
    // The normal form: the stem of this form with the suffix and prefix of form 0.
    const prefix = d.prefixes[para[len * 2 + idx]];
    const suffix = d.suffixes[para[idx]];
    const stem = word.slice(prefix.length, suffix ? word.length - suffix.length : word.length);
    const normal = idx === 0 ? word : d.prefixes[para[len * 2]] + stem + d.suffixes[para[0]];
    const k = val.readUInt16BE(0) + '|' + normal;
    let x = nouns.get(k);
    if (!x) {
      const t0 = d.gramtab[para[len]];
      const sp0 = t0.indexOf(' ');
      x = { lemma: normal, lex: new Set((sp0 < 0 ? t0 : t0.slice(0, sp0)).split(',')), forms: [] };
      nouns.set(k, x);
    }
    x.forms.push({ t: word, g: new Set(formPart.split(',').filter(Boolean)) });
  }
  nouns.forEach((x) => onLexeme(x));
  return { forms: n, meta: d.meta };
}

/** Calls onLexeme({lemma, lex: Set, forms: [{t, g: Set}]}) for every lexeme of the export (txt, xml or pymorphy). */
async function lexemes(file, onLexeme) {
  const name = zipEntry(file).name;
  if (/words\.dawg$/.test(name)) {
    if (!lexemes.pym) lexemes.pym = pymorphyData(file);
    const r = pymorphyLexemes(file, onLexeme, lexemes.pym);
    return 'pymorphy3-dicts-ru: OpenCorpora ' + r.meta.source_version + ', ревизия ' + r.meta.source_revision + ', словоформ ' + r.forms;
  }
  if (/\.txt$/.test(name)) {
    let cur = null;
    await lines(file, (line) => {
      if (/^\d+$/.test(line)) {
        cur = { lemma: null, lex: null, forms: [] };
        return;
      }
      if (!line.trim()) {
        if (cur && cur.forms.length) onLexeme(cur);
        cur = null;
        return;
      }
      if (!cur) return;
      const tab = line.indexOf('\t');
      if (tab < 0) return;
      const t = line.slice(0, tab).toLowerCase();
      const tags = line.slice(tab + 1).trim();
      const sp = tags.indexOf(' ');
      const lexPart = sp < 0 ? tags : tags.slice(0, sp);
      const formPart = sp < 0 ? '' : tags.slice(sp + 1);
      if (!cur.lex) {
        cur.lex = new Set(lexPart.split(','));
        cur.lemma = t;
      }
      cur.forms.push({ t, g: new Set(formPart.split(',').filter(Boolean)) });
    });
    return name;
  }
  // XML: <lemma id=".." rev=".."><l t="ёж"><g v="NOUN"/>…</l><f t="ёж"><g v="sing"/><g v="nomn"/></f>…</lemma>
  let buf = '';
  const gs = (s) => new Set((s.match(/<g v="([^"]+)"/g) || []).map((x) => x.slice(6, -1)));
  await lines(file, (line) => {
    buf += line;
    let end;
    while ((end = buf.indexOf('</lemma>')) >= 0) {
      const chunk = buf.slice(0, end);
      buf = buf.slice(end + 8);
      const start = chunk.indexOf('<lemma');
      if (start < 0) continue;
      const body = chunk.slice(start);
      const l = /<l t="([^"]*)">([\s\S]*?)<\/l>/.exec(body);
      if (!l) continue;
      const forms = [];
      const re = /<f t="([^"]*)">([\s\S]*?)<\/f>|<f t="([^"]*)"\/>/g;
      let m;
      while ((m = re.exec(body))) forms.push({ t: (m[1] || m[3] || '').toLowerCase(), g: m[2] ? gs(m[2]) : new Set() });
      onLexeme({ lemma: l[1].toLowerCase(), lex: gs(l[2]), forms });
    }
    if (buf.length > 1e6 && buf.indexOf('<lemma') < 0) buf = '';
  });
  return name;
}

// ---- hunspell (suffixes and prefixes, enough to check initial forms) ------------------------------

function hunspell(affFile, dicFile) {
  const aff = fs.readFileSync(affFile, 'utf8').split(/\r?\n/);
  const sfx = [];
  const pfx = [];
  let needAffix = null;
  let forbidden = null;
  for (const line of aff) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'NEEDAFFIX') needAffix = p[1];
    if (p[0] === 'FORBIDDENWORD') forbidden = p[1];
    if ((p[0] === 'SFX' || p[0] === 'PFX') && p.length >= 5) {
      const strip = p[2] === '0' ? '' : p[2];
      const add = (p[3] === '0' ? '' : p[3]).split('/')[0];
      const cond = p[4] === '.' ? null : new RegExp(p[0] === 'SFX' ? '(' + p[4] + ')$' : '^(' + p[4] + ')');
      (p[0] === 'SFX' ? sfx : pfx).push({ flag: p[1], strip, add, cond });
    }
  }
  const dic = new Map();
  fs.readFileSync(dicFile, 'utf8').split(/\r?\n/).slice(1).forEach((line) => {
    const s = line.trim();
    if (!s) return;
    const slash = s.indexOf('/');
    const word = slash < 0 ? s : s.slice(0, slash);
    const flags = slash < 0 ? '' : s.slice(slash + 1).split(/\s/)[0];
    dic.set(word, (dic.get(word) || '') + flags);
  });
  const ok = (flags) => !(forbidden && flags.indexOf(forbidden) >= 0);
  function bare(w) {
    if (!dic.has(w)) return false;
    const f = dic.get(w);
    return ok(f) && !(needAffix && f.indexOf(needAffix) >= 0);
  }
  function viaSuffix(w) {
    for (const r of sfx) {
      if (r.add && !w.endsWith(r.add)) continue;
      const stem = w.slice(0, w.length - r.add.length) + r.strip;
      if (!stem) continue;
      if (r.cond && !r.cond.test(stem)) continue;
      const f = dic.get(stem);
      if (f && f.indexOf(r.flag) >= 0 && ok(f)) return true;
    }
    return false;
  }
  function viaPrefix(w) {
    for (const r of pfx) {
      if (r.add && !w.startsWith(r.add)) continue;
      const stem = r.strip + w.slice(r.add.length);
      if (r.cond && !r.cond.test(stem)) continue;
      const f = dic.get(stem);
      if (f && f.indexOf(r.flag) >= 0 && ok(f)) return true;
    }
    return false;
  }
  return {
    size: dic.size,
    accepts: (word) => {
      const w = yo(word);
      return bare(w) || viaSuffix(w) || viaPrefix(w) || (w !== word && (bare(word) || viaSuffix(word)));
    }
  };
}

// ---- the build ----------------------------------------------------------------------------------------

function loadFrequency(file) {
  const freq = new Map();
  const text = fs.readFileSync(file, 'utf8');
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    const line = text.slice(start, end);
    start = end + 1;
    const sp = line.lastIndexOf(' ');
    if (sp <= 0) continue;
    const w = yo(line.slice(0, sp).toLowerCase());
    const n = Number(line.slice(sp + 1));
    if (n > 0) freq.set(w, (freq.get(w) || 0) + n);
  }
  return freq;
}

function mix(word) {
  let x = 2166136261;
  for (let i = 0; i < word.length; i++) x = Math.imul(x ^ word.charCodeAt(i), 16777619);
  return x >>> 0;
}

function plural(word, form) {
  if (!form || form === word) return '';
  let i = 0;
  while (i < word.length && i < form.length && word[i] === form[i]) i++;
  return String(word.length - i) + form.slice(i);
}

function readList(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).map((s) => s.replace(/#.*/, '').trim().toLowerCase()).filter(Boolean);
}

async function main() {
  const t0 = Date.now();
  const got = {};
  const failed = {};
  for (const key of Object.keys(SOURCES)) {
    const src = SOURCES[key];
    if (key === 'about') continue;
    if (src.fallbackFor && got[src.fallbackFor]) continue;
    try {
      got[src.fallbackFor || key] = await download(src);
      if (src.fallbackFor) {
        got[src.fallbackFor].via = src.title;
        console.log('Вместо ' + src.fallbackFor + ': ' + src.title + '\n  (' + failed[src.fallbackFor].split('\n').join('\n  ') + ')');
      }
    } catch (error) {
      if (Object.keys(SOURCES).some((k) => SOURCES[k].fallbackFor === key)) failed[key] = error.message;
      else throw error;
    }
  }
  if (!got.opencorpora) throw new Error('Нет словаря OpenCorpora: ' + failed.opencorpora);
  const hs = hunspell(got.hunspellAff.file, got.hunspellDic.file);
  console.log('hunspell: ' + hs.size + ' основ');
  const freq = loadFrequency(got.frequency.file);
  console.log('частоты: ' + freq.size + ' словоформ');
  const block = new Set(readList(path.join(HERE, 'blocklist.txt')).map(yo));

  const removed = {};
  function drop(reason, word) {
    const r = removed[reason] = removed[reason] || { n: 0, examples: [] };
    r.n++;
    if (r.examples.length < 12 && r.examples.indexOf(word) < 0) r.examples.push(word);
  }
  const cand = new Map(); // lemma -> {word, forms: Map(form -> true), plural, pltm}
  let nouns = 0;
  let lexCount = 0;
  const source = await lexemes(got.opencorpora.file, (x) => {
    lexCount++;
    if (!x.lex || !x.lex.has('NOUN')) return;
    nouns++;
    // Forms with a mark of their own («гг» in «год») are not forms of the word for the game.
    const forms = x.forms.filter((f) => !Object.keys(MARKS).some((m) => f.g.has(m)));
    const plain = (f) => !f.g.has('Infr') && !f.g.has('Arch') && !f.g.has('V-ey') && !f.g.has('V-oy');
    let pltm = x.lex.has('Pltm');
    const nomn = (number) => forms.find((f) => f.g.has('nomn') && f.g.has(number) && plain(f));
    let first = pltm ? nomn('plur') : nomn('sing');
    if (!first && !pltm && nomn('plur')) {
      // Only the plural is the usual form («деньги»; «деньга» is colloquial): the word is plural-only.
      first = nomn('plur');
      pltm = true;
    }
    const lemma = first ? first.t : (forms[0] || x.forms[0] || { t: x.lemma }).t;
    const marks = Object.keys(MARKS).filter((m) => x.lex.has(m) || (!forms.length && x.forms[0] && x.forms[0].g.has(m)));
    if (marks.length) {
      marks.forEach((m) => drop('помета: ' + MARKS[m] + ' (' + m + ')', lemma));
      return;
    }
    if (/[^а-яё]/.test(lemma)) {
      drop(/-/.test(lemma) ? 'дефис' : /\d/.test(lemma) ? 'цифры' : 'не только русские буквы', lemma);
      return;
    }
    if (lemma.length < MIN_LEN) return drop('короче ' + MIN_LEN + ' букв', lemma);
    if (lemma.length > MAX_LEN) return drop('длиннее ' + MAX_LEN + ' букв', lemma);
    let c = cand.get(lemma);
    if (!c) {
      c = { word: lemma, forms: new Set(), plural: null, pltm };
      cand.set(lemma, c);
    }
    c.pltm = c.pltm && pltm;
    forms.forEach((f) => c.forms.add(yo(f.t)));
    if (!pltm && !c.plural && !x.lex.has('Sgtm') && !x.lex.has('Fixd')) {
      const pl = nomn('plur');
      if (pl && pl.t !== lemma && /^[а-яё]+$/.test(pl.t)) c.plural = pl.t;
    }
  });
  console.log('OpenCorpora (' + source + '): лексем ' + lexCount + ', существительных ' + nouns + ', кандидатов ' + cand.size);

  // A form shared with another noun or another part of speech does not count for the noun's frequency:
  // «черта» would otherwise collect «черта» from «чёрт», «лёт» every «лет» from «год».
  const nounForms = new Map(); // form -> true when it is also a form of something else
  const lemmasOf = new Map(); // form -> how many noun candidates have it
  cand.forEach((c) => c.forms.forEach((f) => {
    nounForms.set(f, false);
    lemmasOf.set(f, (lemmasOf.get(f) || 0) + 1);
  }));
  lemmasOf.forEach((n, f) => { if (n > 1) nounForms.set(f, true); });
  const otherPos = new Set(); // forms that are also forms of another part of speech
  await lexemes(got.opencorpora.file, (x) => {
    if (!x.lex || x.lex.has('NOUN')) return;
    x.forms.forEach((f) => {
      const k = yo(f.t);
      if (nounForms.has(k)) {
        nounForms.set(k, true);
        otherPos.add(k);
      }
    });
  });

  // A form shared only between nouns is split between them in proportion to their own forms,
  // so «мир» keeps most of «мира» and «миро» gets a little. Shared with another part of speech: not counted.
  const own = new Map();
  cand.forEach((c) => {
    let u = 0;
    c.forms.forEach((form) => { if (lemmasOf.get(form) === 1 && !nounForms.get(form)) u += freq.get(form) || 0; });
    own.set(c.word, u);
  });
  const weightOf = new Map(); // shared form -> sum of the sharers' own counts
  cand.forEach((c) => c.forms.forEach((form) => {
    if (lemmasOf.get(form) > 1 && !otherPos.has(form)) weightOf.set(form, (weightOf.get(form) || 0) + own.get(c.word) + 1);
  }));
  const demote = new Set(readList(path.join(HERE, 'demote.txt')).map(yo));

  const kept = [];
  const allShared = []; // every form is also another part of speech: no frequency of its own
  cand.forEach((c) => {
    if (block.has(yo(c.word))) return drop('ручной список (tools/blocklist.txt)', c.word);
    if (!hs.accepts(c.word)) return drop('нет в hunspell ru_RU', c.word);
    let f = 0;
    let counted = false;
    c.forms.forEach((form) => {
      if (!nounForms.get(form)) {
        f += freq.get(form) || 0;
        counted = true;
      } else if (weightOf.has(form)) {
        f += (freq.get(form) || 0) * (own.get(c.word) + 1) / weightOf.get(form);
        counted = true;
      }
    });
    f = Math.floor(f);
    if (!counted) allShared.push(c.word);
    if (demote.has(yo(c.word))) f = 0;
    kept.push({ word: c.word, key: yo(c.word), freq: f, plural: c.plural });
  });
  // Ё/Е: one word per key, the more frequent.
  // Equal counts: shorter first, then a fixed shuffle, so the common/rare border does not cut the alphabet.
  kept.sort((a, b) => b.freq - a.freq || a.word.length - b.word.length || mix(a.word) - mix(b.word) || (a.word < b.word ? -1 : 1));
  const byKey = new Map();
  const out = [];
  kept.forEach((w) => {
    if (byKey.has(w.key)) return drop('то же слово через е/ё', w.word + ' = ' + byKey.get(w.key).word);
    byKey.set(w.key, w);
    out.push(w);
  });

  const text = '# Словоплёт: ' + out.length + ' существительных, частые первыми. Источники и лицензии: LICENSE.txt\n' +
    out.map((w) => w.word + (w.plural ? '\t' + plural(w.word, w.plural) : '')).join('\n') + '\n';
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'dict.txt'), text);
  const gz = zlib.gzipSync(Buffer.from(text), { level: 9 }).length;

  const license = [
    'Словарь игры «Словоплёт» (dict.txt) — производная работа, распространяется на условиях',
    'Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0), совместимых с условиями источников.',
    '',
    'Собран скриптом tools/build-dict.js игры ' + new Date().toISOString().slice(0, 10) + ' из:',
    '',
    '1. Словарь OpenCorpora (opencorpora.org), CC BY-SA 3.0 — леммы и словоформы',
    '   существительных. Файл: ' + source + ' (' + got.opencorpora.url + ').',
    '   Изменения: оставлены нарицательные существительные в начальной форме и их',
    '   именительный падеж множественного числа, убраны слова с пометами имя, фамилия,',
    '   отчество, топоним, организация, торговая марка, аббревиатура, ошибка, искажение,',
    '   жаргон, а также слова с дефисом и цифрами, короче 3 и длиннее 12 букв.',
    '',
    '2. Орфографический словарь hunspell ru_RU — Copyright (c) 1997-2008, Alexander I. Lebedev,',
    '   из словарей LibreOffice; лицензия в стиле BSD (текст ниже). Использован только для',
    '   проверки: в словарь игры попали слова, которые он принимает. Сам он не включён.',
    '',
    '3. FrequencyWords (Hermit Dave, github.com/hermitdave/FrequencyWords), CC BY-SA 4.0 —',
    '   частоты слов по субтитрам OpenSubtitles 2018 (ru_full.txt). Использован для порядка',
    '   слов: частые — первыми; первые ' + TOP + ' строк игра считает обычными словами.',
    '',
    'Лицензии: creativecommons.org/licenses/by-sa/3.0/ и creativecommons.org/licenses/by-sa/4.0/',
    '',
    '---- Лицензия hunspell ru_RU ----',
    fs.readFileSync(got.hunspellReadme.file, 'utf8').trim(),
    ''
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'LICENSE.txt'), license);

  // The report for the owner.
  const common = Math.min(TOP, out.length);
  const control = readList(path.join(HERE, 'control.txt'));
  const leaked = control.filter((w) => byKey.has(yo(w)));
  let seed = 7;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const sample = [];
  const pool = out.slice();
  for (let i = 0; i < 200 && pool.length; i++) sample.push(pool.splice(Math.floor(rand() * pool.length), 1)[0].word);
  const report = [
    'Словарь «Словоплёта» — отчёт сборки ' + new Date().toISOString(),
    '',
    'Слов всего: ' + out.length + ' (обычных ' + common + ', редких ' + (out.length - common) + '; без частоты ' + out.filter((w) => !w.freq).length + ')',
    'С формой множественного числа: ' + out.filter((w) => w.plural).length,
    'dict.txt: ' + Buffer.byteLength(text) + ' байт, сжатым gzip ' + gz + ' байт',
    'OpenCorpora: ' + source + ', лексем ' + lexCount + ', существительных ' + nouns,
    'hunspell ru_RU: ' + hs.size + ' основ; частотный список: ' + freq.size + ' словоформ',
    'Сборка: ' + Math.round((Date.now() - t0) / 1000) + ' с',
    '',
    'Удалено:',
    ...Object.keys(removed).sort((a, b) => removed[b].n - removed[a].n).map((k) => '  ' + k + ': ' + removed[k].n + ' — например: ' + removed[k].examples.join(', ')),
    '',
    'Контрольный список (имена, города, бренды — их быть не должно): ' + control.length + ' слов, просочилось: ' + (leaked.length ? leaked.join(', ') : 'ничего'),
    '',
    'Все формы — ещё и другая часть речи, частоты нет (' + allShared.length + '): ' + allShared.slice(0, 80).join(', '),
    '',
    'Первые 60 по частоте: ' + out.slice(0, 60).map((w) => w.word).join(', '),
    '',
    'Около границы обычных (' + (TOP - 15) + '…' + (TOP + 15) + '): ' + out.slice(TOP - 15, TOP + 15).map((w) => w.word).join(', '),
    '',
    '200 случайных слов на глаз:',
    sample.join(', '),
    ''
  ].join('\n');
  fs.writeFileSync(REPORT, report);
  console.log(report.split('\n').slice(0, 30).join('\n'));
  if (leaked.length) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  });
}
module.exports = { lexemes, hunspell, yo };
