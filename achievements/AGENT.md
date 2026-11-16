# Ачивки за жизнь — для агента

Модуль `modules/achievements/`. Ачивки — данные в `data/achievements/list.json` (массив
определений), их читает `rules.js`. Модель для проверки не нужна: ты только переводишь просьбу
владельца в правило.

## Как добавить ачивку

1. Составь определение (формат ниже).
2. Проверь: инструмент `achievements` с `{ "action": "preview", "entry": {…} }` — ответ скажет,
   нет ли ошибок, сколько дней по истории условие выполнялось (`matched`) и что выдастся сразу
   (`wouldGrant`). Если `matched` огромно (условие выполняется почти всегда) — правило слишком
   лёгкое, скажи владельцу и предложи порог выше.
3. Добавь: `{ "action": "add", "entry": {…} }` — определение записывается в `list.json` и сразу
   проверяется по истории; если условие уже выполнялось и в настройках «засчитывать прошлое»,
   ачивка выдаётся с пометкой «за прошлое».
4. Можно и править `list.json` руками — тогда `checks.js` модуля сам проверит все правила после
   твоего хода (`module_check achievements`).

Убрать: `{ "action": "disable", "id": "…" }` (полученное остаётся — ачивки не отзываются).
«Убери колкие ачивки» — `{ "action": "settings", "settings": { "tease": false } }`.

## Определение

```json
{ "id": "three-k", "title": "Три тысячи", "text": "3 дня подряд от 5 000 шагов",
  "group": "Движение", "icon": "flag", "rarity": "common",
  "rule": { "type": "streak", "when": { "metric": "steps", "op": ">=", "value": 5000 }, "days": 3 } }
```

- `id` — строчные латинские буквы, цифры, `-`, `/`, `_`; уникален.
- `title`, `text` (условие словами — его видит владелец), `group` — одна из: Сон, Движение,
  Привычки, Экран, Места, Траты, Жизнь, Игротека (или своя).
- `icon` — иконка кита (`moon`, `dumbbell`, `pin`, `wallet`, `book`, `star`, `heart`, `flag`,
  `globe`, `phone`, `lock`, `eye`, `home`, `calendar`, `check`, `mic`, `cart`, `tag`, `refresh`,
  `grid`, `bolt`…) или своя модуля: `sun`, `shoe`, `drop`, `pill`, `map`, `coin`, `cup`, `sofa`,
  `flame`, `target`.
- `rarity` — `common` | `uncommon` | `rare` | `epic` | `legendary` (опыт 50/100/200/500/1000 —
  настройка); для ступеней — список по ступеням.
- `hidden: true` — скрыта до получения; `tease: true` — колкая (шутка над собой: тихо, без опыта,
  выключается настройкой); `negative: true` — условие «отсутствия» («меньше 300 шагов», «без
  трат»): в дни паузы не проверяется никогда.
- `tiers: [7, 30, 100]` — ступени под одним id («Пешеход I / II / III»); ступень заменяет главное
  число правила. Свои названия ступеней — `titles: ["Неделя", "Месяц", "Сотня"]`.
- `item: { "id": "scarf", "slot": "neck" | "head" | "hand" | "shelf", "tier": 0 }` — вещь Питомцу.

## Правила

| type | Поля | Смысл |
|---|---|---|
| `day` | `when` | хоть один день выполнил условие |
| `streak` | `when`, `days`, `pause?: "skip" \| "break"` | N дней подряд |
| `count` | `when`, `times`, `within` | условие в M днях из окна `within` дней |
| `total` | `metric`, `value`, `within?` | сумма метрики за окно или за всё время |
| `event` | `event`, `where?`, `count?`, `history?` | событие: `mark`, `place.new`, `grant`, `subscription.cancel` |
| `records` | `query`, `count`, `within?` | число записей общей базы (`query` как у `base.find`: `kind`/`kinds`, `tag`, `source`, `text`) |
| `custom` | `fn`, свои поля | функция из `modules/achievements/custom.js` (`dawn`, `comeback`, `phoenix`, `cells`, `regular`, `nightPlace`) |

`when`: `{ "metric": "steps", "op": ">=", "value": 5000 }`, или сравнение с другой метрикой
`{ "metric": "steps", "op": ">=", "ref": "stepsGoal" }`, или `{ "all": [ … ] }` / `{ "any": [ … ] }`.
Операции: `>=`, `>`, `<=`, `<`, `==`, `!=`. Логические метрики сравнивай с `true`/`false`.

`records` считает только то, что модули правда пишут в общую базу (`kind` / `source`):
`workout`, `mood`, `habit`, `water`, `med`, `sleep`, `steps`, `screen`, `place`, `visit` (Здоровье);
`expense` (Траты; от `recorder` — голосом); `focus` (Фокус); `note` и `event` (Диктофон, `recorder`);
`event` от `hat`, `draw-guess`, `rpg` (уровень), `holidays` (день рождения), `spending` (тег
«подписка отменена»); `story` (`series`, в `data` — `"asleep":true`, если уснул); `play` (игры хаба
`games`, Приключение `stories`; в `data` — `"trip":true`, если в поездке); `trip`, `bet`, `rating`
(`games`); `phone_night`; `messages` (`inbox`); `achievement` (сами ачивки). `text` ищет в
названии, тегах и JSON поля `data`. Не придумывай вид записи, которого никто не пишет.

День без нужных данных (`known` ложно — телефон лежал, нет разрешения) в сериях пропускается:
не рвёт и не засчитывается.

## Метрики дня

Сон: `sleepMin`, `sleepQuality`, `wakeMin` (подъём, минут от полуночи: 07:00 = 420),
`bedtimeMin` (отбой, минут от полудня: 00:00 = 720), `bedtimeLate` (позже цели, мин),
`bedtimeDev` (|отбой − цель|), `sleepGoal`.
Движение: `steps`, `stepsGoal`, `distanceKm`, `workoutMin`.
Забота: `waterMl`, `waterGoal`, `medsDue`, `medsTaken`, `medsLate`, `medsAllOnTime`,
`habitsDue`, `habitsDone`, `habitsAll`, `distinctHabits`, `maxChain`, `anyMark`.
Экран: `screenMin`, `socialMin`, `unlocks`, `lateMin` (в ночном окне), `lateAfter2Min`,
`maxLaunches` (запусков одного приложения).
Места: `newPlaces`, `newCells`, `farthestKm`, `homeOnly`, `placesCount`.
Траты: `spend`, `noSpend`, `deliveryLate`, `budgetOk`.
Прочее: `focusMin`, `playMin`, `mood`, `hasData`, `perfect` (сон и шаги не меньше цели, все
привычки, вода), `paused`.

## Что отвечать владельцу

`{ "action": "summary" }` — сколько получено, что недавно, что ближе всего. Скрытые до получения
отдаются только числом (`hiddenLeft`): не называй их и не намекай на условие.

Ачивки с правилом `{ "type": "event", "event": "grant" }` и полем `key` (`inbox/zero`, `hat/telepath`,
`spending/month-in-budget`…) выдают сами модули-источники через `grant()`: их условие видно только им.
Не переписывай им правило — оно ничего не проверяет здесь; пороги меняются в настройках того модуля.

Другие модули зовут `require('modules/achievements/main.js')`: `grant(item)` (Игротека, Шляпа,
Входящие, Диктофон, Праздники, Траты, Фокус),
`event(name, data)` (например, Траты — `event('subscription.cancel', { merchant })`),
`closest(n)`, `recent(days)`, `summary()`.
