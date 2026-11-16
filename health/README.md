# Здоровье и привычки

Сон, шаги, вода, лекарства по расписанию и привычки с цепочками дней; разбор сна раз в неделю;
места. Главное для соседей — **сводка дня**: одна честная картина, на которой стоят Питомец,
Ачивки, Жизнь-RPG, Гороскоп, Траты и Тайная жизнь телефона. Описание — `docs/modules/health.md`
в Assi. Ставится в `modules/health`, данные — в `data/health/` и в общей базе `lib/base.js`.

## Что включить на телефоне

На экране модуля, вкладка «Настройки» → «Доступы» — у каждого пункта своя кнопка:

- **Физическая активность** — шаги с датчика телефона.
- **Health Connect** (Android 14+) — шаги, сон и тренировки из Samsung Health (в Samsung Health
  включить синхронизацию с Health Connect). Нужна правка оболочки 16 (разрешения в манифесте);
  без неё пункт так и говорит.
- **Доступ к статистике использования** — экранное время и сон по экрану. Кнопка открывает
  системный экран, а при запущенном Shizuku выдаёт сама (`appops set … GET_USAGE_STATS allow`).
  Без доступа модуль сам ведёт журнал экрана (`on('screen')`) — через сутки появятся минуты и
  разблокировки, но без приложений и соцсетей.
- **Местоположение** (и «в фоне») — только если включён сбор мест (по умолчанию выключен).
- **Уведомления** и **работа в фоне без ограничений батареи** — для напоминаний и ночного сбора.

## Экран

`ui/index.html`, вкладки «Сегодня», «Неделя», «Привычки», «Настройки» (`?tab=today|week|habits|settings`).
На сложенном Fold — одна колонка, на разложенном — карточки слева, графики справа (сон и шаги за
14 дней с линией цели, календарь привычек: закрашено — отмечено, штриховка — пауза). Все числа —
в настройках, схема в `logic/settings.js`. Виджет — три строки (шаги, сон и вода, что осталось).
На «Сегодня» есть карточка «Фокус» — минуты фокус-сессий за день (`focusMin` сводки, записи
`focus` модуля «Фокус»); она видна, только если модуль «Фокус» стоит или за день есть минуты.
Все значки — из `kit.js` (`pill`, `steps` и `smile` добавлены в его `ICONS` ради этого модуля;
экран — `phone`, фокус — `clock`).

## API для других модулей

`var health = require('modules/health/main.js');` — эти имена стабильны.

### Сводка дня

| Функция | Что возвращает |
|---|---|
| `day(date?)` | Сводку суток `'YYYY-MM-DD'` (без даты — сегодняшних; `'yesterday'` — вчерашних). |
| `days(from, to)` | Массив сводок с `from` по `to` включительно, по порядку, не дальше сегодня. |
| `today()` | Сводку сегодняшних суток плюс «на сейчас»: `now`, `hour`, `minute`, `screenOn`, `night` (сейчас ночное окно), `prevLateMin`, `prevLateAfter2Min`, `prevKnownScreen`, `goals`. Для Питомца. |
| `goals()` | `{ stepsGoal, sleepGoal, waterGoal, glassMl, bedtime, strideM, dayEnd, nightStart, nightEnd, lateAfter }`. |
| `recompute(from?, to?)` | Пересчитать мимо кэша и вернуть сводки. |

Сутки — от «конца суток» (05:00) до следующего; сон относится к дню, утром которого человек
проснулся; экран в 01:30 — к предыдущему дню. Поля сводки:

```
{ date, paused: null | 'sick' | 'vacation' | 'rest',
  known: { sleep, steps, screen, places, spend },
  sleepMin, bedtime, wake, sleepFrom: 'manual' | 'hc' | 'screen', sleepQuality, sleepConfidence, sleepGoal,
  steps, stepsGoal, stepsFrom: 'hc' | 'sensor', distanceKm, workoutMin,
  waterMl, waterGoal, medsDue, medsTaken, medsLate,
  habitsDue, habitsDone, habitIds: [...], chains: { habitId: дней подряд },
  screenMin, socialMin, unlocks, lateMin, lateAfter2Min,
  places: [placeId], newPlaces, newCells, farthestKm, homeOnly,
  spend, noSpend, deliveryLate, budgetOk, focusMin, playMin, mood,
  left: [названия того, что ещё не отмечено сегодня] }
```

Чего нет — то `null`, и `known` говорит, каких источников не было: неизвестное не рвёт цепочки и
не идёт в минус. `budgetOk` берётся у Трат: `require('modules/spending/main.js').dayBudget(date)`
(или `budgetDay`), ответ — `true/false`, `{ ok }`, число-лимит или `{ limit }`; без функции — `null`.

### Пауза, привычки, клетки

| Функция | |
|---|---|
| `paused(date?)` | `'sick' \| 'vacation' \| 'rest' \| null`. |
| `pauses()` | `[{ id, type, title, from, until }]` (`until: null` — без срока). |
| `pause({ type, until, title })` / `unpause()` | Включить / закончить паузу (запись `pause` в базе). |
| `chain(habitIdOrTitle, date?)` | Дней подряд у привычки. |
| `habits()` | Список привычек (`data/health/habits.json`). |
| `cells()` | `{ geohash: когда впервые, мс }` — клетки карты, где телефон был (для открытых клеток RPG). |
| `places()` | `[{ id, title, type: 'home'\|'work'\|'other', confirmed, suggested, visits, minutes, first, last }]` — без координат. |

### Отметки (пишут в базу, обновляют сводку, зовут крючки `life.mark`)

`addWater(ml?)`, `undoWater()`, `markHabit(idOrTitle, value?)`, `unmarkHabit(idOrTitle, date?)`,
`medTaken(idOrName, due?, 'taken' | 'skipped')`, `medUndo(medId, due)`, `setMood(1..5)`,
`addWorkout({ minutes, type })`, `setSleep({ night, bed, wake })`, `clearManualSleep(night)`.

### Крючки: `data/health/hooks.json`

Список `[{ event, path, fn, order? }]`. События:

- `life.mark` — отметка (вода, привычка, лекарство, самочувствие, тренировка, сон, пауза), аргумент:
  `{ type: 'water' | 'habit' | 'med' | 'mood' | 'workout' | 'sleep' | 'pause' | 'unpause', id, at, … }`
  (у привычки ещё `habitId`, `title`; у лекарства — `medId`, `status`, `due`; у воды — `amount`).
- `life.place` — новое место: `{ id, title, type, cell, at }`.
- `life.day` — сутки закрыты, аргумент — дата `'YYYY-MM-DD'`.

Порядок: Ачивки (`modules/achievements/`), Жизнь-RPG (`modules/rpg/`), Питомец (`modules/pet/`),
остальные; число `order` ставит крючок туда, куда сказано. Ошибка одного крючка не мешает другим.
Записаться можно через `hook(event, path, fn, order?)` (повтор ничего не меняет), снять —
`unhook(path, event?, fn?)`, посмотреть — `hooks()`; дописывать файл руками тоже можно — формат
тот же. `fire(event, arg)` вызывает крючки и возвращает `[{ path, fn, ok, error? }]`. Те же события
приходят открытым экранам через `emit` (`assi.on('life.mark', …)`), плюс `health.changed`.

### Остальное

`settings()`, `setSettings(patch)`, `settingsSchema()`, `collect()`, `collectPlace()`,
`closeDay(date?)`, `weekly()`, `weeklies(limit?)`, `status()`, `grant(what)`, `view()`,
`widget()`, `start()`, `stop()`; для чата — `tool(args)` и `toolDay(args)` (инструменты
`health_mark` и `health_day`, модуль кладёт их в `tools/` при старте).

## Данные

Общая база (`lib/base.js`, `source: 'health'`): `sleep` (одна запись на ночь, `data.night` — дата
утра), `steps` (одна на календарный день, `data.hours` — 24 числа), `water`, `med`
(`data: { medId, due, status: taken | late | skipped | missed }`), `habit` (`tags: [habitId]`,
`data: { habitId, value }`), `workout`, `screen` (одна на сутки), `place`, `visit`, `mood`,
`pause` — поля как в таблице `docs/modules/health.md`. Вода, привычки и самочувствие, записанные
из чата через `base_add`, тоже считаются (привычка узнаётся по `data.habitId`, тегу или названию).

Чужая запись, которую читает сон: `story` от «Сериала на ночь» (`data.asleep: true`, `at` — момент,
когда владелец уснул под серию). Если она попала в начало сна, найденного по экрану (не дальше
`storyShiftMax`, 120 мин), начало сна сдвигается на неё: под сериал экран гаснет раньше, чем
владелец засыпает. В записи сна тогда `data.story: true`. Выключается настройкой `sleepFromStory`;
сон из Health Connect и ручной правки не трогается (`logic/sleep.js` → `storyHint`).

`data/health/`: `settings.json`, `habits.json`, `meds.json`, `hooks.json`, `days.json` (кэш
сводок), `state.json`, `sensor.json` и `sensor-days.json` (датчик шагов), `hc-steps.json`,
`screenlog.json` (свой журнал экрана, 3 дня), `track.json` и `cells.json` (места),
`pending.json` (повторы напоминаний), `weekly/<ГГГГ-Wнн>.json`; `health/fixes.db` — сырые точки
местоположения, 14 дней.

## Работы

`health:collect` (каждые 30 мин), `health:dayclose` (в конец суток; закрывает и дни, пропущенные
при выключенном телефоне, до недели назад), `health:weekly` (в день и час разбора),
`health:places` (если включены места), `health:med:<id>:<ЧЧ:ММ>`, `health:habit:<id>`,
`health:rep:…` (повторы с `job.once`).

## Правки оболочки

`notify.actions` — кнопки «Принял / Пропустить» в напоминании (без неё нажатие открывает экран
с `#med=<id>&due=<мс>`, экран отмечает приём и закрывается); `job.once` — повтор напоминания
точным будильником (без неё — ожидание в фоне, пока жив процесс); `usage` — `lib/usage.js` для
экранного времени (без неё — свой разбор `UsageStatsManager`); `off` — снять подписку при
`stop()`. Разрешения Health Connect (п. 16) — для шагов, сна, тренировок и воды.

## Проверки

`checks.js` (инструмент `module_check`): поля сводки, вода, привычка и цепочка, пауза, порядок и
изоляция крючков, лекарство, ручной сон, виджет, инструменты, настройки, сбор, экран (вкладки и
«плюс стакан»). Всё, что проверки добавляют, они убирают, и крючков других модулей не зовут.
Логика — `node tests/logic.test.js`.

## Отличия от описания

- **Шаги с датчика раскладываются по часам**, а не кладутся целиком в текущий час. Работа
  `health:collect` в Doze может не просыпаться часами (и тем более при выключенном телефоне);
  тогда вся разница счётчика легла бы в один час, а если пропуск пересёк полночь — ещё и во
  вчерашний день вместо сегодняшнего, и график по часам и итог дня были бы неверны. Поэтому
  разница делится поровну между часами с прошлого показания, но не дальше, чем на
  `sensorSpreadHours` (настройка, по умолчанию 24 ч; `logic/steps.js` → `spread`). Значение 1
  даёт поведение описания: всё в текущий час.

## Не сделано

- **Проверка на телефоне.** По условиям работы модуль не ставился и не запускался на Fold5:
  `checks.js` и сценарии из «Как проверить» в описании (200 шагов против Samsung Health,
  перезагрузка, сон против Samsung Health ±30 мин, лекарство «через 2 минуты» при закрытом
  приложении, расход батареи с местами) ждут установки. Движковый код прогонялся только в
  поддельном движке под node.
- **Health Connect на деле.** Код написан по платформенному API Android 14 (`HealthConnectManager`,
  `aggregateGroupByDuration`, `readRecords`, `insertRecords`) без Jetpack; не проверено, выдаются
  ли разрешения через обычный `requestPermissions` (`assi.permission`) и пишет ли Samsung Health
  сон без часов. Если разрешения так не выдаются — нужна операция оболочки, открывающая экран
  разрешений Health Connect.
- **Кнопки в виджете** («плюс стакан», отметка привычки, этап 8): у виджета нет механизма `call`
  ни в оболочке, ни в `docs/shell-changes.md`. Виджет текстовый, нажатие открывает «Сегодня».
  Кнопки в уведомлениях сделаны (через `notify.actions`).
- **Пропадёт ли хвост `#med=…`** у ссылки уведомления на старой оболочке — проверить на телефоне.
- **Лекарства по фото рецепта** — отдельного распознавания в модуле нет: основной агент со
  зрением читает фото и заводит курс инструментом `health_mark` (`what: 'add_med'`), сначала
  пересказав владельцу, что понял.
- **Открытые вопросы описания** решены настройками, а не окончательно: вода в Health Connect —
  настройка «Писать воду в Health Connect» (выключена), «соцсети» — категория
  `CATEGORY_SOCIAL` плюс правки списка, конец суток — настройка, места — внутри модуля,
  выключены по умолчанию.
