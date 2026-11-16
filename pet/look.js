// How the creature looks: one set of parameters for the screen (SVG) and the widget (Canvas), so
// the two never drift apart. Pure.
//
// look(state, opts) → { state, eyes, pupil, brows, browLift, stem, stage, posture, sturdy, extras,
//   items, palette, colors, motion }
//   eyes:    'open' | 'half' | 'closed' | 'happy' | 'one' | 'wide'
//   pupil:   horizontal look, −1 (left) … 1 (right)
//   brows:   tilt in degrees, −20 (tired, outer ends down) … +20 (bright, outer ends up)
//   stem:    'straight' | 'droop' | 'curl'; stage 0–4 (sprout, two leaves, four leaves, bud, flower)
//   posture: 'stand' | 'sit' | 'curl' | 'sink' | 'lean' | 'stretch'
//   extras:  blanket, mug, panama, zzz, nightcap, backpack, badge, party
//   items:   worn things [{ id, slot: 'neck' | 'head' | 'hand' }] (shelf things stay in the room)
//   motion:  the animation of the state (the screen plays it; the widget is still)

var PALETTES = {
  moss: { body: '#7E9C78', dark: '#5D7858' },
  clay: { body: '#C2906F', dark: '#966A4F' },
  dusk: { body: '#8E88C4', dark: '#69639D' },
  // The theme's accent: the screen takes var(--accent); the widget (Canvas) takes these.
  accent: { body: '#8B7CFF', dark: '#6457C2', css: true }
};
exports.PALETTES = PALETTES;

exports.STAGE_TITLES = ['Росток', 'Два листа', 'Четыре листа', 'Бутон', 'Цветок'];
exports.TRAIT_TITLES = { backpack: 'Рюкзак-карта', sturdy: 'Крепкие ножки', nightcap: 'Ночной колпак' };
exports.ITEM_TITLES = {
  scarf: 'Шарф', 'hiking-hat': 'Походная шляпа', lantern: 'Фонарик', trophy: 'Кубок',
  'party-hat': 'Праздничный колпак', 'pumpkin-hat': 'Тыквенная шапка', 'winter-hat': 'Зимняя шапка', 'winter-scarf': 'Зимний шарф'
};
exports.SLOT_TITLES = { head: 'На голову', neck: 'На шею', hand: 'В руку', shelf: 'На полку' };

/** The name of a thing: from the list, or what its giver called it, or its id. */
exports.itemTitle = function (item) {
  if (!item) return '';
  return exports.ITEM_TITLES[item.id] || item.title || String(item.id);
};

var BY_STATE = {
  blanket: { eyes: 'half', brows: 0, stem: 'droop', posture: 'sit', extras: ['blanket', 'mug'], motion: 'breath-slow' },
  vacation: { eyes: 'happy', brows: 6, stem: 'straight', posture: 'lean', extras: ['panama'], motion: 'sway' },
  asleep: { eyes: 'closed', brows: -4, stem: 'curl', posture: 'curl', extras: ['zzz'], motion: 'sleep' },
  woken: { eyes: 'one', brows: -6, stem: 'curl', posture: 'sit', extras: [], motion: 'yawn' },
  unrested: { eyes: 'half', brows: -15, stem: 'droop', posture: 'sink', extras: [], motion: 'blink-slow' },
  sleepy: { eyes: 'half', brows: -8, stem: 'droop', posture: 'stand', extras: [], motion: 'sway' },
  restless: { eyes: 'open', brows: 4, stem: 'straight', posture: 'stand', extras: [], motion: 'shift', pupil: 1 },
  curious: { eyes: 'wide', brows: 12, stem: 'straight', posture: 'stand', extras: ['backpack'], motion: 'look' },
  content: { eyes: 'happy', brows: 10, stem: 'straight', posture: 'stand', extras: [], motion: 'bounce' },
  cheerful: { eyes: 'open', brows: 14, stem: 'straight', posture: 'stretch', extras: [], motion: 'perky' },
  calm: { eyes: 'open', brows: 0, stem: 'straight', posture: 'stand', extras: [], motion: 'breath' },
  quiet: { eyes: 'half', brows: -6, stem: 'droop', posture: 'sink', extras: [], motion: 'breath-slow' }
};
exports.BY_STATE = BY_STATE;

/** Stage 0–4 of a level by the thresholds [1, 5, 15, 30, 50]. */
exports.stageFor = function (level, thresholds) {
  var t = Array.isArray(thresholds) && thresholds.length ? thresholds : [1, 5, 15, 30, 50];
  var index = 0;
  for (var i = 0; i < t.length; i++) if ((Number(level) || 1) >= t[i]) index = i;
  return Math.min(index, 4);
};

/**
 * Seasonal things for a date: [{ id, slot }]. occasion — the holidays module's occasion id of
 * the day (or null); month 1–12.
 */
exports.season = function (occasion, month, winterMonths) {
  var out = [];
  if (occasion === 'birthday-owner') out.push({ id: 'party-hat', slot: 'head', season: true });
  else if (occasion === 'halloween') out.push({ id: 'pumpkin-hat', slot: 'head', season: true });
  else if (occasion === 'new-year' || occasion === 'christmas') out.push({ id: 'winter-hat', slot: 'head', season: true });
  if ((winterMonths || []).indexOf(month) >= 0) out.push({ id: 'winter-scarf', slot: 'neck', season: true });
  return out;
};

/**
 * opts: { stage (0–4), traits: [...], items: [{ id, slot, worn }], palette, season: [{ id, slot }],
 *         holding: { rarity } | null, party: bool, reaction: 'water' | 'habit' | 'med' | 'tap' | … }
 */
exports.look = function (state, opts) {
  opts = opts || {};
  var base = BY_STATE[state] || BY_STATE.calm;
  var traits = opts.traits || [];
  var extras = base.extras.slice();
  if (traits.indexOf('backpack') >= 0 && extras.indexOf('backpack') < 0 && state !== 'asleep' && state !== 'blanket') extras.push('backpack');
  if (state === 'asleep' && traits.indexOf('nightcap') >= 0) extras.push('nightcap');
  if (opts.holding && state !== 'asleep') extras.push('badge');
  if (opts.party && state !== 'asleep') extras.push('party');

  // Worn things, one a slot: what the owner put on wins over the season's; a hat gives way to the
  // panama on holiday, to the nightcap in sleep, and nothing is worn under the blanket but a hat.
  var slots = {};
  (opts.season || []).forEach(function (item) { if (item && item.slot && item.slot !== 'shelf') slots[item.slot] = item; });
  (opts.items || []).forEach(function (item) { if (item && item.worn && item.slot && item.slot !== 'shelf') slots[item.slot] = item; });
  if (extras.indexOf('panama') >= 0 || extras.indexOf('nightcap') >= 0) delete slots.head;
  if (state === 'blanket') delete slots.neck;
  if (state === 'blanket' || state === 'asleep' || extras.indexOf('badge') >= 0) delete slots.hand;
  var items = Object.keys(slots).sort().map(function (slot) { return { id: slots[slot].id, slot: slot }; });

  var palette = PALETTES[opts.palette] ? opts.palette : 'moss';
  var motion = base.motion;
  var eyes = base.eyes;
  var brows = base.brows;
  if (['water', 'habit', 'level', 'welcome', 'achievement'].indexOf(opts.reaction) >= 0) {
    if (state !== 'asleep' && state !== 'blanket') {
      eyes = 'happy';
      brows = Math.max(brows, 8);
    }
    motion = opts.reaction === 'water' ? 'drink' : 'bounce';
  } else if (opts.reaction === 'med') {
    motion = 'nod';
  }
  return {
    state: state,
    eyes: eyes,
    pupil: typeof base.pupil === 'number' ? base.pupil : 0,
    brows: brows,
    browLift: brows > 8 ? -3 : brows < -8 ? 3 : 0,
    stem: base.stem,
    stage: Math.max(0, Math.min(4, Number(opts.stage) || 0)),
    posture: base.posture,
    sturdy: traits.indexOf('sturdy') >= 0,
    extras: extras,
    items: items,
    holding: opts.holding || null,
    palette: palette,
    colors: PALETTES[palette],
    motion: motion,
    drink: opts.reaction === 'water'
  };
};
