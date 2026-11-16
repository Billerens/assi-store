// The context of the day: season, weather, topic, the search queries and the reason the
// screen shows ("туман, ноябрь, тема «природа»"). Pure: runs in node (tests) and in the engine.

var MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

var SEASONS = {
  winter: { key: 'winter', ru: 'зима', en: 'winter' },
  spring: { key: 'spring', ru: 'весна', en: 'spring' },
  summer: { key: 'summer', ru: 'лето', en: 'summer' },
  autumn: { key: 'autumn', ru: 'осень', en: 'autumn' }
};

var WEATHER = {
  clear: { key: 'clear', ru: 'ясно', en: 'clear sky', snow: false },
  cloudy: { key: 'cloudy', ru: 'облачно', en: 'clouds', snow: false },
  fog: { key: 'fog', ru: 'туман', en: 'fog', snow: false },
  rain: { key: 'rain', ru: 'дождь', en: 'rain', snow: false },
  snow: { key: 'snow', ru: 'снег', en: 'snow', snow: true },
  storm: { key: 'storm', ru: 'гроза', en: 'storm', snow: false }
};

function two(n) { return (n < 10 ? '0' : '') + n; }

/** 'YYYY-MM-DD' of a local date. */
exports.dayKey = function (date) {
  var d = date instanceof Date ? date : new Date(date);
  return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate());
};

/** The local date of a 'YYYY-MM-DD' key at midnight. */
exports.fromKey = function (key) {
  var parts = String(key).split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
};

/** Whole days from key a to key b (b later → positive). */
exports.daysBetween = function (a, b) {
  return Math.round((exports.fromKey(b).getTime() - exports.fromKey(a).getTime()) / 864e5);
};

/** Monday 1 … Sunday 7. */
exports.weekday = function (date) {
  var day = (date instanceof Date ? date : new Date(date)).getDay();
  return day === 0 ? 7 : day;
};

exports.monthName = function (date) { return MONTHS[(date instanceof Date ? date : new Date(date)).getMonth()]; };

/** The season by month; the southern hemisphere (negative latitude) is half a year apart. */
exports.season = function (date, latitude) {
  var month = (date instanceof Date ? date : new Date(date)).getMonth();
  if (typeof latitude === 'number' && latitude < 0) month = (month + 6) % 12;
  if (month === 11 || month <= 1) return SEASONS.winter;
  if (month <= 4) return SEASONS.spring;
  if (month <= 7) return SEASONS.summer;
  return SEASONS.autumn;
};

/**
 * A WMO weather code (Open-Meteo `weather_code`) as a word: 0–1 ясно, 2–3 облачно, 45/48
 * туман, 51–67 и ливни 80–82 дождь, 71–77 и снежные ливни 85–86 снег, 95–99 гроза.
 */
exports.weatherWord = function (code) {
  if (code === null || code === undefined || code === '' || !isFinite(Number(code))) return null;
  var c = Number(code);
  if (c <= 1) return WEATHER.clear;
  if (c <= 3) return WEATHER.cloudy;
  if (c === 45 || c === 48) return WEATHER.fog;
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return WEATHER.rain;
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return WEATHER.snow;
  if (c >= 95 && c <= 99) return WEATHER.storm;
  return null;
};

/** The Open-Meteo answer → { code, temperature, isDay, word… }, or null when it is not one. */
exports.parseWeather = function (json) {
  var current = json && json.current;
  if (!current || current.weather_code === undefined) return null;
  var word = exports.weatherWord(current.weather_code);
  return {
    code: Number(current.weather_code),
    temperature: current.temperature_2m === undefined ? null : Number(current.temperature_2m),
    isDay: current.is_day === undefined ? null : Number(current.is_day) === 1,
    key: word ? word.key : null,
    word: word ? word.ru : null,
    en: word ? word.en : null,
    snow: word ? word.snow : false
  };
};

/** The first place Open-Meteo's geocoding found: { name, latitude, longitude, country } or null. */
exports.parsePlace = function (json) {
  var first = json && json.results && json.results[0];
  if (!first || typeof first.latitude !== 'number') return null;
  return { name: String(first.name || ''), latitude: first.latitude, longitude: first.longitude, country: String(first.country || '') };
};

exports.weatherUrl = function (latitude, longitude) {
  return 'https://api.open-meteo.com/v1/forecast?latitude=' + Number(latitude).toFixed(3) + '&longitude=' + Number(longitude).toFixed(3) +
    '&current=weather_code,temperature_2m,is_day&timezone=auto';
};

exports.geocodeUrl = function (city) {
  return 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(String(city).trim()) + '&count=1&language=ru&format=json';
};

/**
 * How much the owner's votes move a weight: every "больше такого" multiplies it by (1 + step),
 * every "меньше такого" divides; never below a twentieth of the base.
 */
exports.voteFactor = function (votes, step) {
  var v = Number(votes) || 0;
  var s = Number(step) || 0;
  var factor = v >= 0 ? Math.pow(1 + s, v) : 1 / Math.pow(1 + s, -v);
  return Math.max(0.05, factor);
};

/**
 * The topic of the day by weights. `recent` — topics of the last days, newest first; a topic
 * that already ran `streak` days in a row is left out (unless it is the only one with weight).
 * `random` — a function returning [0, 1), so tests can fix the choice.
 */
exports.pickTopic = function (topics, recent, options) {
  options = options || {};
  var random = options.random || Math.random;
  var streak = Math.max(1, Number(options.streak) || 2);
  var votes = options.votes || {};
  var step = options.voteStep === undefined ? 0.25 : options.voteStep;
  var weighted = topics.map(function (topic) {
    var name = String(topic.name);
    var vote = votes[name] !== undefined ? votes[name] : votes[name.toLowerCase()];
    return { topic: topic, weight: Math.max(0, Number(topic.weight) || 0) * exports.voteFactor(vote, step) };
  }).filter(function (item) { return item.weight > 0; });
  if (!weighted.length) return topics[0] || null;
  var run = recent && recent.length >= streak && recent.slice(0, streak).every(function (name) { return name === recent[0]; }) ? recent[0] : null;
  var allowed = weighted.filter(function (item) { return item.topic.name !== run; });
  if (!allowed.length) allowed = weighted;
  var total = allowed.reduce(function (sum, item) { return sum + item.weight; }, 0);
  var roll = random() * total;
  for (var i = 0; i < allowed.length; i++) {
    roll -= allowed[i].weight;
    if (roll < 0) return allowed[i].topic;
  }
  return allowed[allowed.length - 1].topic;
};

function fill(template, parts) {
  return String(template).replace(/\{(topic|weather|season)\}/g, function (all, name) { return parts[name] || ''; })
    .replace(/\s+/g, ' ').trim();
}

/**
 * Search queries from the template, most specific first, then looser ones in case the first
 * finds nothing: "mountains fog autumn", "mountains autumn", "mountains fog", "mountains".
 */
exports.queries = function (context, template) {
  var topic = context.topic ? context.topic.query : '';
  var weather = context.weather && context.weather.en ? context.weather.en : '';
  var season = context.season ? context.season.en : '';
  var list = [
    fill(template, { topic: topic, weather: weather, season: season }),
    fill(template, { topic: topic, weather: '', season: season }),
    fill(template, { topic: topic, weather: weather, season: '' }),
    topic
  ];
  var seen = {};
  return list.filter(function (query) {
    if (!query || seen[query]) return false;
    seen[query] = true;
    return true;
  });
};

/** "туман, ноябрь, тема «природа»" — why this picture was looked for. */
exports.reason = function (context) {
  var parts = [];
  if (context.occasion) parts.push('повод «' + context.occasion.title + '»');
  if (context.weather && context.weather.word) parts.push(context.weather.word);
  if (context.month) parts.push(context.month);
  if (context.topic && !context.occasion) parts.push('тема «' + context.topic.name + '»');
  if (context.badNight) parts.push('после короткой ночи');
  if (context.petMood) parts.push('Питомец ' + context.petMood);
  if (context.favorite) parts.push('день из избранного');
  return parts.join(', ');
};

/**
 * Was last night bad? night: the day summary of the health module ({ known: { sleep }, sleepMin }),
 * sleepGoal in minutes, shortMin — how much shorter than the goal counts as bad. Unknown → false.
 */
exports.badNight = function (night, sleepGoal, shortMin) {
  if (!night || !night.known || !night.known.sleep || typeof night.sleepMin !== 'number') return false;
  var goal = Number(sleepGoal) || 0;
  if (goal <= 0) return false;
  return night.sleepMin <= goal - Math.max(0, Number(shortMin) || 0);
};

/** The pet's moods that ask for calm pictures, by the setting calmFromPet; and how to name them. */
var PET_CALM = { tired: ['unrested', 'sleepy'], low: ['unrested', 'sleepy', 'quiet', 'blanket'] };
var PET_WORDS = { unrested: 'невыспавшийся', sleepy: 'сонный', quiet: 'притихший', blanket: 'под пледом' };

/**
 * Does the pet's mood ask for calm pictures? pet: data/pet/state.json of «Питомец» ({ state, date }),
 * mode: the setting calmFromPet (off | tired | low), day: today's key. A state of another day — no.
 * Returns the mood's word («невыспавшийся») or null.
 */
exports.petCalm = function (pet, mode, day) {
  var states = PET_CALM[mode];
  if (!states || !pet || typeof pet !== 'object' || !pet.state) return null;
  if (pet.date && day && String(pet.date) !== String(day)) return null;
  return states.indexOf(pet.state) >= 0 ? PET_WORDS[pet.state] : null;
};

/**
 * The topics after a bad night: the calm topic («тишина») gets its weight — the owner's own topic
 * of that name gets the weight added, else it joins the list for the day. Nothing changes the settings.
 */
exports.calmTopics = function (topics, calm) {
  var list = (topics || []).map(function (topic) {
    var out = {};
    Object.keys(topic).forEach(function (key) { out[key] = topic[key]; });
    return out;
  });
  if (!calm || !calm.name || !calm.query || !(Number(calm.weight) > 0)) return list;
  var name = String(calm.name).toLowerCase();
  var own = list.filter(function (topic) { return String(topic.name).toLowerCase() === name; })[0];
  if (own) own.weight = (Number(own.weight) || 0) + Number(calm.weight);
  else list.push({ name: String(calm.name), query: String(calm.query), weight: Number(calm.weight), bright: false, space: false, calm: true });
  return list;
};

/** A topic made from a holiday of the day, as the holidays module describes it. */
exports.occasionTopic = function (occasion) {
  if (!occasion || !occasion.wallpaper) return null;
  var query = String(occasion.wallpaper).toLowerCase().replace(/[^a-z0-9 '\-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!query) return null;
  return { name: String(occasion.title || occasion.id || 'праздник'), query: query, weight: 1, bright: false, space: false, occasion: true };
};

/** Is this time of day (ms) at or after "HH:MM" on its date? */
exports.atOrAfter = function (ms, hhmm) {
  var date = new Date(ms);
  var parts = String(hhmm).split(':').map(Number);
  return date.getHours() * 60 + date.getMinutes() >= parts[0] * 60 + parts[1];
};
