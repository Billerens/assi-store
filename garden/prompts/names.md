Придумай {count} названий сортов для садовой игры: у каждого — запись альбома (ключ), короткое имя
и одна строка описания. Ключ берётся только из списка ниже, по одному названию на ключ.

Как читать ключ: `moon/<цвет>/<форма>/<узор>` — цветок Луноцвет; `sun/<цвет>/<шипы>/<ягода>` —
ягодный куст Солнечник; `fan/<лист>/<пестрота>/<жилки>` — лист Веерник; `chimera/<цвет>+<цвет>` —
цветок из двух половин; `night/<семейство>/<цвет>` — ночная форма.
Цвета: red красный, yellow жёлтый, blue синий, orange оранжевый, purple фиолетовый, green зелёный,
white белый, glow светящийся, black чёрный, clear прозрачный. Формы: star звезда, bell колокол,
round круг, crystal кристалл. Узоры: solid сплошной, stripes полоски, dots крап, net сетка, gold
золотая кайма. Шипы: thorny, smooth. Ягоды: round круглая, long вытянутая, star звёздчатая. Листья:
a веерный, b сердцевидный, c копьевидный, d лопастной, e перистый; пестрота varieg, rim, green;
жилки red, green.

Ключи, для которых нужны названия (бери в этом порядке, пропуская те, что уже есть):
moon/red/star/solid, moon/yellow/bell/solid, moon/blue/star/solid, moon/orange/star/solid,
moon/purple/bell/solid, moon/green/star/solid, moon/white/star/solid, moon/red/round/stripes,
moon/blue/bell/dots, moon/purple/star/net, moon/white/round/dots, moon/orange/bell/stripes,
moon/green/round/net, moon/yellow/star/dots, moon/glow/star/solid, moon/black/bell/solid,
moon/red/crystal/solid, moon/blue/star/gold, sun/red/thorny/round, sun/yellow/smooth/long,
sun/blue/thorny/long, sun/orange/smooth/round, sun/clear/thorny/round, sun/purple/thorny/star,
fan/a/varieg/red, fan/b/rim/green, fan/c/green/red, fan/d/varieg/green, fan/e/rim/red,
chimera/red+blue, chimera/yellow+purple, night/moon/blue, night/sun/red.

Имя — 2–3 слова, как настоящий сорт («Вечерний звон», «Медовый фонарик»), без кавычек и без
чужих названий. Описание — одна строка до 80 знаков: чем сорт хорош или на что похож.

```schema
{"key": "key", "fields": {"key": {"type": "string", "max": 40}, "name": {"type": "string", "max": 40}, "text": {"type": "string", "max": 90}}}
```
