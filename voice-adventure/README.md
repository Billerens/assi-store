# Текстовое приключение для дороги

Классический квест целиком голосом — для метро, машины или прогулки в наушниках. Рассказчик
описывает место, владелец отвечает голосом («иди на север», «возьми лампу», «открой дверь
ключом»). Игра работает без сети и сохраняется после каждой реплики. Описание —
`docs/modules/voice-adventure.md` в Assi. Ставится в `modules/voice-adventure`.

Здесь же лежит **голосовой движок историй** (`story-engine/`). Он общий с «Сериалом на ночь»
(`bedtime-series`), и тот берёт его через `require('modules/voice-adventure/story-engine/…')`.

## Что включить на телефоне

- **Распознавание речи на телефоне** (GigaAM) в настройках голоса Assi. Без него игра не
  начинается и прямо говорит почему.
- **Доступ к микрофону.** Его спросят при первом запуске.
- **Модель роли «Приключение: главы»** (`stories.write`) — любая модель с сетью. Пока её нет,
  можно играть только в готовую первую главу «Маяк на Сухой косе».
- По желанию:
  - **«Приключение: модель на телефоне»** (`stories.local`) — скачанная модель на устройстве.
    Она понимает фразы, которые разбор не понял, и коротко отвечает о том, чего в мире нет («что
    написано на стене?»). Без неё игра переспрашивает.
  - **Голос `tts`** и настройка «Записывать облачный голос заранее». На Wi-Fi и зарядке тексты
    следующих глав записываются в файлы и потом звучат без сети.
  - **«Пассажир»** из Игротеки. Пока он видит поездку, игра слушает только по кнопке
    («нажми и говори»), чтобы объявления станций не принимались за ход.
  - **«Жизнь-RPG»** (`rpg`) и настройка «Уровень и места из «Жизни-RPG»» (`life.rpg`). Тогда
    в задание новой главы уходят уровень и до `life.places` игровых имён открытых мест (без
    дома и работы) как материал сюжета. Без RPG главы пишутся как раньше.

## Как устроено

- **Глава — это данные:** комнаты, предметы с падежными формами, выходы, загадки с тремя
  подсказками и цель. Пишет её модель (`prompts/chapter.md`), пока есть сеть.
  - Движок проверяет главу (`story-engine/chapter.js`): все комнаты достижимы, ключ лежит до
    замка, для тёмной комнаты есть свет, у каждой загадки ровно три подсказки, тексты не длиннее
    `maxTextChars`, в них нет эмодзи и списков.
  - Не прошла проверку — модель получает список ошибок в той же беседе и переписывает, до
    `fixTries` раз. Если исправить не вышло, глава в запас не попадает.
- **Запас.** Впереди лежат `ahead` (2) готовые главы. Он пополняется:
  - работой `stories:refill` (раз в `refillEveryMin` = 180 мин);
  - при появлении сети;
  - при подключении зарядки;
  - после каждой игры.

  После неудачи события сети не зовут модель `retryAfterMin` (15) минут, чтобы в метро не
  стучаться на каждой станции. Между главами хранятся библия сюжета (`bible.json`) и пересказы
  (`summaries.json`); в промпт идут библия и последние `recapChapters` (3) пересказа.
- **Игра без сети.**
  - Фразы разбирает `story-engine/parse.js`: служебные слова, глаголы с синонимами, направления,
    предметы по формам и по опечаткам распознавания (Левенштейн ≤ `parse.maxTypos`).
  - Ход делает `story-engine/quest.js` — детерминированно, состояние сохраняется после каждой
    реплики.
- **Голосовой цикл** (`story-engine/voice.js`) крутится в движке, в фоновом потоке: экран можно
  погасить. Один шаг цикла — сказать, дождаться конца речи, слушать, понять, сохранить.
  - Тишина: сначала «Я подожду», потом пауза.
  - Управление без экрана:
    - уведомление с кнопками «Говорить / Повторить / Пауза» (`notify.actions`, без них — своё
      уведомление с приёмником);
    - кнопка гарнитуры через `MediaSession`: нажатие — «говорить», двойное — «повтори».
  - Пауза наступает при звонке и когда отключили наушники.
- **Сохранение** (`story-engine/store.js`): запись во временный файл, затем переименование.
  Предыдущая версия лежит рядом (`state.prev.json`), и испорченный файл заменяется ею. После
  перерыва дольше `recapAfterMin` (30) мин игра начинается с пересказа.
- **Записанный голос** (`story-engine/audio.js`).
  - Запись идёт через `speech.render`, если оболочка его умеет; иначе — прямым запросом
    `POST {baseUrl}/audio/speech` роли `tts` (сырой PCM получает заголовок WAV). Прямые вызовы
    пишутся в свой журнал `data/stories/audio-log.json`.
  - Файлы лежат в `audio/c<глава>-<узел>.wav`. Записанные куски реплики играет `MediaPlayer`,
    остальное говорит голос телефона.
  - Потолок места — `audio.maxMb` (300 МБ): сверх него старые записи удаляются.
- **Факты и ачивки.**
  - Каждая игра от минуты записывается в общую базу:
    `base.add({kind: 'play', title: 'Приключение', amount: минуты, unit: 'min', source: 'stories', data: {game: 'voice-adventure', plot, chapter, trip}})`.
  - Ачивки «Пять глав» (`stories/quest/five-chapters`) и «Без подсказок»
    (`stories/quest/no-hints`) уходят в «Ачивки» через `grant()`. Если модуля ачивок нет, они
    ложатся в ящик Игротеки `data/games/achievements-outbox.json`.
- **Все числа — настройки** (`schema.js`). На экране их меняют через значок `settings`; хранятся
  они в `data/stories/settings.json`.

Данные модуля лежат в `data/stories/quest/`:

- `index.json` — сюжеты;
- `<сюжет>/ch<N>.json`, `bible.json`, `summaries.json`, `state.json`, `audio/`;
- `stats.json`, `log.json`.

## Что даёт другим

`require('modules/voice-adventure/main.js')`:

- `start()`, `status()`, `settings()`, `settingsView()`, `saveSettings(patch)`;
- `newAdventure({genre, custom, quiet})`, где `genre` — `house` | `expedition` | `maze-city` |
  `custom` | `demo`; `selectPlot(id)`, `removePlot(id)`;
- `play({plot})`, `command(cmd, text)` (`talk`, `release`, `repeat`, `pause`, `resume`, `stop`,
  `say`), `stopPlay()`, `voiceState()`;
- `refill(reason)`, `prerenderNow(force)`, `writeChapter(plotId, n)`;
- `card()` — карточка для каталога Игротеки, `widget()`, `log(limit)`;
- `driver(plotId, {quiet})` — водитель цикла (для проверок), `GENRES`.

**Голосовой движок историй** — `require('modules/voice-adventure/story-engine')`, весь сразу:

- `voice`: `run(driver, options)`, `command(id, cmd, text)`, `action(args)`, `state(id)`,
  `stop(id)`, `speak(text, mode)`, `DEFAULTS`. Водитель:
  `{id, title, screen, pauseLine, begin, answer(text, service), next, silence(n, line), resume, save, end(reason, minutes), info, goodbye}`.
  Реплика:
  `{text, parts, audio, listen, end, reason, listenSec, pauseMs, slow, fade: {from, to}, volume, noRepeat}`.
  Состояние идёт экранам событием `story.state`.
- `parse`: `parse(text, world, {maxTypos})`, `service`, `helpLine`, `canonicalDir`, `dirForms`,
  `isInstrumental`, `VERBS`, `SERVICE`, `DIRECTIONS`, `DOORS`.
- `quest`: `create`, `world`, `act`, `describe`, `hint`, `recap`, `inventoryText`, `whereText`,
  `exitsLine`, `exitsOf`, `nameOf`, `hasLight`, `progress`, `dirPhrase`.
- `chapter`: `tidy`, `reach`, `validate(raw, limits)`, `texts`.
- `branch`: `choose(text, options)`, `yesNo(text)`, `keywordsOf`, `ORDINALS`.
- `lines`: `segments(text, known)`, `fadePlan(order, count, to)`, `volumeAt`.
- `settings`: `values`, `coerce`, `changes`, `describe`, `validTime`, `minutesOf`.
- `wav`: `header`, `isWav`, `seconds`, `extension`, `isRaw`, `rateOf`.
- `words`: `normalize`, `tokens`, `numberWords`, `levenshtein`, `similar`, `stem`,
  `commonPrefix`, `sentences`, `clip`, `joinAnd`, `plural`, `capital`.
- `phone`: `features`, `has`, `online`, `unmetered`, `charging`, `inTrip`, `model(role)`,
  `speech`, `headphones`, `today`.
- `store`: `writeJson`, `readJson`, `saveState`, `loadState`, `removeDir`, `folders`, `file`.
- `audio`: `find`, `known`, `render(dir, node, text, {style, rate})`,
  `prerender(dir, items, options)`, `trim`, `usage`, `play(path, control)`, `safe`.
- `controls`: `notice`, `headset`, `release`, `buttons`.

Чистые части (`words`, `parse`, `quest`, `chapter`, `branch`, `lines`, `settings`, `wav`)
работают и под node.

## Проверки

- На компьютере:
  - `node tests/engine.test.js` (20) — движок: среди прочего 22 типичные фразы понимаются без
    модели и без промахов, а глава из коробки проходится до конца.
  - `node tests/adventure.test.js` (16) — сам модуль через подмену движка Assi
    (`tests/engine-stub.js`): готовая глава без сети, служебные слова, модель на телефоне,
    пересказ, исправление главы моделью, запас, переход между главами с ачивками, запись голоса,
    настройки и удаление.
- На телефоне: `module_check voice-adventure` проверяет:
  - разбор в Rhino и проверку главы;
  - проход готовой главы через водителя цикла с «убийством» посередине;
  - откат испорченного `state.json`;
  - пределы настроек и проигрывание WAV плеером движка;
  - возможности оболочки, карточку и экран.

## Не сделано

- **Проверки на телефоне не запускались.** В этой работе не было ни телефона, ни эмулятора;
  `checks.js` написан и ждёт `module_check`. Только на телефоне можно проверить:
  - качество GigaAM в вагоне с гарнитурой;
  - русский голос Supertonic;
  - перехват кнопки гарнитуры через `MediaSession` из Rhino;
  - работу цикла при погашенном экране (микрофон в фоне);
  - вёрстку на Fold — сложенном и раскрытом.
- **`speech.listen` с порогом громкости** — это правка оболочки, её нет. Дальний шум отсекает
  только режим «нажми и говори».
- **Каталог Игротеки пока не зовёт `card()`.** `modules/games/main.js` в Assi писался
  одновременно и внешних карточек не читает. Карточка готова: нужна строка в `catalog()` Игротеки
  (это код Assi, здесь его не трогали).
- **Запись через `speech.render` не умеет манеру речи (style).** Когда манера нужна (у сериала),
  запрос идёт напрямую, мимо учёта трат оболочки — в свой журнал.
- **Голоса смешиваются в одной реплике.** Записанный кусок звучит облачным голосом, а изменчивая
  часть («Вы взяли …») — голосом телефона.
- **Перебивание рассказчика голосом** не сделано, как и сказано в описании: «стоп» работает
  кнопкой.
