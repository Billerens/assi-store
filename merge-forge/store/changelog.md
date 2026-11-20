# Merge Forge: what’s new

## 0.5.0 — 2026-11-20

- Coals from every run. Waves above the reforge record pay coals in full, waves already passed pay half: a run that stops short of the record is no longer empty. With a record of 106, a run to wave 92 gives 18 coals instead of none. The share is the setting “Coals for waves below the record: share”.
- Each coal gives +10% damage and gold instead of +5%, the coals already earned too: 63 coals make ×7.3 rather than ×4.15.
- The “worth it” mark on the reforge lights up when a reforge would add at least half of your coals, not at wave 60 of every run. The Master's forge shows how many coals a reforge gives now and at which wave the next one comes.
- Every upgrade reaches its milestones. A milestone comes when the price of an upgrade has grown 10,000 times, and at least every 25 levels: Sharpness and Purse as before, every 25; Heavy hand every 17; Temper and Twin forging every 12; Battle cry every 10; Banner every 7. Before, the dear upgrades waited a hundred waves for one. A milestone is ×1.4, every fourth a big one at ×1.8 (×1.1 and ×1.2 for the mechanical ones).
- Perks never end now: every big milestone opens one of the upgrade's two perks in turn, and a perk that comes again adds as much once more (×1.3, ×1.6, ×1.9…). The card shows the level it comes at next and what it gives now. The strength is set so that reforges do not snowball.
- Rune sockets take random open cells. Sockets bought on a small anvil no longer vanish in closed rows — in older runs they move to open cells, each rune staying with its socket. Play a small anvil with a rune under almost every blade, or grow it.
- Effects: a crit is a big orange number, a flash and a knock-back of the foe, a ringing blow; Crushing blow and Burst shake the scene. A merge lights its cell and sparks fly from the other blade; a merge by the Pair hammer or the Twins' lever is signed with the relic's name. Every relic that wakes shows what it did where it did it: “forge −1.5 s” at the forge, gold at the chest, “boss time +2 s” at the timer. A new blade drops onto the anvil, a forge tap strikes sparks, a sale tosses coins, a foe bursts with “+gold”, a boss beaten says “Boss defeated!” with a fanfare, a miss says “Too late”. The battle cry sounds a horn and lights the scene. The crit sound was barely heard — it is loud now; new sounds for a win, a miss, the cry and the relics.
- The scene no longer shrinks on a wide, low screen: the road stays near the bottom and the sky is cut, so the heroes, the dragon, the pet and the foe stand full size again.
- “Try again: boss”, “Meet / Auto / Aim” and the event banner share one row and no longer cover each other; the retry button has its margins back.
- A save written before a new field appeared is no longer taken for damaged. Before, the game could fall back to an old save because of it — two days of progress were lost that way on November 18.

## 0.4.0 — 2026-11-20

- Blades have stories now. A tap on an unlocked metal in the Master's forge → Metals, or the book button of a blade chosen on the anvil, opens a window: the picture, the theme, a phrase about what makes the blade unusual and a small legend. Arrows, the ← → keys and a swipe go through all the unlocked metals.
- The first 40 blades come with stories written in advance, in English and Russian. For every new blade the artist model now invents a story itself — serious, funny or a nod to something, to match the drawing.
- The ice rune is weaker: each further rune and each level of Rune power gives less and less (a logarithm), with no ceiling. The first rune slows the boss timer by 14% (was 25%), seven strong runes about 3.6 times rather than twenty. How fast the gain falls off is the setting “Ice rune: how softly the gain falls off”.
- Run-up: when a foe falls in the very first volley, the next one comes 40% quicker, and so on in a row — down to 0.8 seconds. A foe that survives the first volley ends the run-up; a boss always walks the whole road. Easy waves fly by, and farming and offline income count the same way.
- “Meet” brings the foe to the gate at once (was −1 s), with the same cooldown. Next to it, an “Auto” switch: the forge meets every foe by itself as soon as “Meet” is ready.
- Upgrades with a limit no longer hit a wall — past the limit they do something new. Once Master's eye brings the crit chance to 40%, its further levels are Crushing blow: +2% a level to the chance that a crit strikes once more; past 100%, a second repeat for sure and a chance of a third. Past 35 cells Wider anvil gives Resonance: a blade with an equal one next to it by a side strikes 5% harder a level, and such cells glow. Past 40% heat Undying fire gives Overheat: the heat of taps beyond full fills a burst (about ten taps), and the next volley is stronger — ×2 at the first such level and +1 for each further one; up to three bursts wait. All of this works in the battle on screen only, not offline.
- Remelt has joined the Smith's stall: the stall is open from the start of a run, each of its levels adds 20% to the share of the price a sale gives — up to the full price — and, as before, makes blades and forging surplus dearer. Levels of Remelt already bought count for the stall.
- Upgrades that have nowhere left to grow — Bellows, Rune masonry, Apprentice, Night shift — fold into a “Mastered” row with their level at the bottom of their tab.
- Spacing: the hint with “Sort” and the row of a chosen blade no longer run into the anvil's plate and line up with its edges; the reforge button has room around it.

## 0.3.0 — 2026-11-19

- A run starts with a smaller anvil: 12 cells (4×3) instead of 20. “Wider anvil” grows it row by row to 4×5, then to 5×7 as before. The size is the setting “Anvil cells at the start”.
- A run started on an older version keeps its 20 cells until the next reforge: no blade leaves the anvil.
- The first rune socket now lies in the bottom row of the starting anvil, so runes work from their first wave without buying cells.
- Upgrade milestones are now felt. Every 25 levels an upgrade’s effect is multiplied by 1.5, every hundredth by 2 (Twin forging, Hourglass, Caravan master and Hammer strike: 1.2 and 1.4). At levels 50 and 100 each of the 13 upgrades opens a perk of its own: crit chance, boss damage, boss gold, boss time, offline income and more. A milestone reached shows at once; the card tells how far the next one is and what it opens.
- “Wider anvil” is cheaper: its price grows 2.6 times a level instead of 3.2.
- New art for the whole game: upgrades, master nodes, events, runes, abilities, 37 relics, heroes, pets and dragons are low-poly pictures in the style of the blades. SVG stays for locks and checks.
- Ten worlds of twenty waves each: the Royal road, the Misty swamp, the Burning sands, Candy land, the Sea floor, the Nursery, the Giants’ kitchen, the Moon base, the Neon city and the Fiery depths. Each has its backdrop and five foes of its own — 50 in all; bosses are the same foes under names of their own. After wave 200 the worlds come round again with older foes.
- Rare foes: about one in twelve is golden, giant, feeble, swift, ghostly, enraged, frosty, blazing, carries a chest or is even a rainbow one. Each has its own health, pace, reward and look; a blazing one heats the forge when beaten, a frosty one cools it, a chest-bearer leaves two blades. From wave 20 every boss has a modifier of its own: colossal, frenzied, wealthy, shadow or enduring. The share and the numbers are in the “Monsters” settings.
- A roomier screen. The bottom is one row: Chest, Forge, Upgrades, Master. The battle cry and the abilities of the heroes and the dragon are round buttons on the scene with a ring of their cooldown. The outpost opens with a tap on the heroes at the gate; a “!” marks that something waits there. An event is a banner over the scene that folds to its picture and timer after a few seconds. The hint and “Sort” moved into the frame of the anvil, and the scene grew taller.
- Runes are changed on the anvil itself: a tap on a rune stone opens the choice, with “every socket” at once and “Auto” — ice at a boss, greed at the rest. Drag a stone to another cell to move its socket together with its rune.
- The upgrades sheet: its tabs stick to the top with no gap, purchases go by one, by ten or for all the gold; the Upgrades button shows how many can be bought.

## 0.2.1 — 2026-11-18

- The module API is now called `axiko`; this version needs a build of Axiko with that API.

## 0.2.0 — 2026-11-18

- Forge heat: taps on the forge heat it, and while it is hot the blades strike more often. Left alone, it cools in a few seconds. A strip on the forge button shows the heat.
- Two new upgrades: “Hot embers” makes full heat stronger, “Undying fire” keeps part of the heat for good, offline included.
- Damage per second is shown at the top, next to the farm rate.
- Upgrade milestones are worth reaching: every 10th level now adds about 10% instead of 2%, the 100th about 130% in all. Their size is a setting of the game.
- The boss timer and the hourglass upgrade no longer show numbers with a dozen decimals.

## 0.1.2 — 2026-11-18

- Interface texts are translated into English.
- The store listing is in English and Russian.

## 0.1.1 — 2026-11-17

- The dragon can be fed only a blade no higher than the best level of this run minus 3 (setting “Dragon: levels below the run's best blade”).
- No more than 6 feedings per run (setting “Dragon: feedings per run”); a reforge starts the count over.
- New relic “Hungry Crop” (third tier): extra feedings per run, up to +5.
- The dragon screen shows how many feedings are left and up to which level it accepts blades.

## 0.1.0 — 2026-11-16

- First release.
