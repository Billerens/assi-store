Придумай {count} карточек двора для игры о старинном роде выдуманного королевства. Карточка —
маленький случай при дворе, о котором правитель решает за пять секунд: кто пришёл и чего хочет.
У каждой два ответа, и у каждого ответа — действие из списка (поля aEffect и bEffect):

- alliance — союз, +золото до конца поколения; war1 — +1 к Войне на поколение;
- granary — отдать часть казны людям, +1 деяние; fair — праздник, доход ×3 на минуту;
- scholar — +2 Учёность за золото; treasure — найденное золото; temple — пожертвовать, +1 деяние;
- gift — подарок соседям, +1 Земля при следующем браке; blueprint — следующее владение даром;
- chronicler — заплатить летописцу, +1 деяние; bandits — малый поход: Земля или ничего;
- comet — добрый знак: следующий ребёнок с редкой чертой; harvest — праздник, доход ×2 до конца года;
- goldSmall — немного золота; goldLoss — небольшая потеря казны; deed — доброе дело за золото;
- learn1, adm1, trade1, health1 — +1 к Учёности, Управлению, Торговле, Здоровью за золото;
- nothing — ничего не делать.

Ответы должны быть разными (aEffect не равен bEffect), один из них часто nothing.

- название — 2–4 слова: «Купец с востока»;
- текст — одна-две фразы, до 120 знаков: кто пришёл и о чём просит;
- ответы — 1–3 слова, глаголом: «Принять», «Отказать»;
- выдуманный мир: никаких реальных стран, людей, брендов и ссылок; без жестокостей.

```schema
{"key": "title", "fields": {
  "title": {"type": "string", "min": 4, "max": 32},
  "text": {"type": "string", "min": 20, "max": 120},
  "a": {"type": "string", "min": 2, "max": 24},
  "b": {"type": "string", "min": 2, "max": 24},
  "aEffect": {"type": "string", "oneOf": ["alliance", "war1", "granary", "nothing", "fair", "scholar", "treasure", "temple", "gift", "blueprint", "chronicler", "bandits", "comet", "harvest", "goldSmall", "goldLoss", "deed", "learn1", "adm1", "trade1", "health1"]},
  "bEffect": {"type": "string", "oneOf": ["alliance", "war1", "granary", "nothing", "fair", "scholar", "treasure", "temple", "gift", "blueprint", "chronicler", "bandits", "comet", "harvest", "goldSmall", "goldLoss", "deed", "learn1", "adm1", "trade1", "health1"]}
}}
```
