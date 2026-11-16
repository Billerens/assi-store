Подготовь {count} коротких описаний для игры «Эволюция» на русском языке.
Верни JSON-массив без пояснений. Тон спокойный, любопытный, научно-популярный.
Это только альтернативные описания уже существующих карточек: не меняй правила, цены, множители, длительности или названия.

Для kind mutation выбери один id и соответствующее название из списка:
flagellum — Жгутик; chloroplast — Хлоропласт; eyespot — Глаз-пятно; fin — Плавник; gills — Жабры;
lungs — Лёгкие; scales — Чешуя; feather — Перо; warm-blood — Тёплая кровь; shelled-egg — Яйцо в скорлупе;
schooling — Стайность; tail-rudder — Хвостовой руль; night-vision — Ночное зрение; echolocation — Эхолокация;
venom — Яд; mimicry — Мимикрия; symbiosis — Симбиоз; hibernation — Спячка; grasping-hand — Хватательная кисть;
cilia — Реснички; nerve-net — Нервная сеть; skeleton — Внутренний скелет; oxygen-blood — Перенос кислорода;
bilateral — Двусторонняя симметрия; regeneration — Регенерация; sexual-reproduction — Обмен наследственностью;
homeostasis — Внутреннее равновесие; photosynthesis — Световая фабрика; shell — Панцирь; double-generation — Двойное поколение.

Для kind event выбери один id:
lightning — Удар молнии; volcano — Вулканическое лето; virus — Вирус-попутчик; bloom — Цветение воды;
ice — Ледниковый период; meteor — Метеорит; migration — Великое переселение; drought — Засуха;
wanderer — Странник с востока; wheel — Изобретение колеса; comet — Комета в небе; plague — Чума;
signal — Сигнал из космоса; tide — Прилив; fossil — Окаменелость.

text — одно-два коротких предложения о происходящем, без чисел эффекта.
Никаких ссылок, эмодзи, разметки, кода, имён коммерческих игр или утверждения, что событие уже применено.

```schema
{"key":"id","fields":{"id":{"type":"string","min":3,"max":40},"kind":{"type":"string","oneOf":["mutation","event"]},"title":{"type":"string","min":3,"max":48},"text":{"type":"string","min":15,"max":180}}}
```

