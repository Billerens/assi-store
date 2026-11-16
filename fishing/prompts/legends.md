Придумай {count} сезонную легендарную рыбу для игры «Рыбалка»: она появляется на один месяц на
одном из водоёмов. Это выдуманная рыба с поэтичным именем и своими привычками.

Поля:
- `name` — имя, 2–5 слов, с заглавной буквы: «Седой налим из старого русла»;
- `water` — водоём, один из: pond (пруд у дачи), river (река), lake (озеро), swamp (болото),
  creek (горная речка), bay (морской залив);
- `zone` — где стоит: shore (берег), middle (середина), deep (глубина);
- `hours` — когда клюёт, 1–2 из: morning, day, evening, night;
- `weather` — в какую погоду, 1–2 из: clear, cloudy, rain, fog, wind;
- `bait` — любимая наживка, одна из: worm, bloodworm, livebait, spoon, jig;
- `avg` — средний вес в кг, от 1 до 40; `max` — предельный вес, больше среднего, но не больше
  трёх средних;
- `power` — сила на леске, от 1,5 до 4 (обычная рыба около 1–2, легенды около 3);
- `jerks` — рывков в секунду, от 0,1 до 0,6;
- `base` — базовая цена, от 50 до 60 000 (чем дальше водоём, тем выше: пруд около 100,
  морской залив около 1 000);
- `text` — одна фраза о ней, до 160 знаков.

Без реальных людей, брендов, ссылок и эмодзи. Игра сама проверит числа по своим пределам и
отбросит рыбу, которая в них не входит.

```schema
{"key": "name", "fields": {
  "name": {"type": "string", "min": 5, "max": 40},
  "water": {"type": "string", "oneOf": ["pond", "river", "lake", "swamp", "creek", "bay"]},
  "zone": {"type": "string", "oneOf": ["shore", "middle", "deep"]},
  "hours": {"type": "array", "max": 2},
  "weather": {"type": "array", "max": 2},
  "bait": {"type": "string", "oneOf": ["worm", "bloodworm", "livebait", "spoon", "jig"]},
  "avg": {"type": "number", "min": 1, "max": 40},
  "max": {"type": "number", "min": 1, "max": 120},
  "power": {"type": "number", "min": 0.3, "max": 4},
  "jerks": {"type": "number", "min": 0, "max": 0.6},
  "base": {"type": "number", "min": 50, "max": 60000},
  "text": {"type": "string", "min": 10, "max": 160, "required": false}
}}
```
