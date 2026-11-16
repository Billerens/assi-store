Придумай {count} самостоятельных событий для игры «Башня»: оригинальная тёмная сказка о подъёме по лестницам. Событие читается за несколько секунд, предлагает два или три коротких выбора. Хотя бы один выбор должен быть бесплатным и безопасным. Никаких реальных людей, чужих персонажей, брендов, ссылок, эмодзи, HTML или кода.

Верни массив объектов. Каждый объект имеет id (уникальный латинский идентификатор), title, text и choices. Выбор имеет title, text (честное описание результата), effects (массив эффектов). Допустимы только эти эффекты: gold, damage, heal, relic, upgrade, swap, skip, ally, strength, defense, agility, will, curse, removeRelic. Эффект — объект {"type":"имя","key":"ключ настройки"}; key можно опустить только для единичных relic, upgrade, swap, skip, ally и removeRelic. Пустой effects означает пройти мимо.

Стоимость задаётся отдельно: cost:{"type":"gold" или "health","key":"ключ настройки"}. Для случайного выбора добавь chanceKey и failEffects; effects применяются при успехе. Не добавляй произвольные числа, выражения, поля состояния или команды: все величины берутся из настроек игры. Разрешённые ключи и их стандартный смысл:

- event.well.cost: 20 золота; event.well.chance: 50%.
- event.guard.cost: 10 здоровья; event.guard.ally: союзник против босса.
- event.stairs.cost: 10 здоровья; event.stairs.skip: пропустить обычный этаж.
- event.shelf.gold: 30 золота; event.shelf.upgrade: один уровень приёма.
- event.pantry.heal: 12 здоровья.
- event.forge.cost: 15 золота; event.forge.strength: одна сила.
- event.mirror.cost: 8 здоровья; event.mirror.agility: 3% ловкости.
- event.fountain.heal: 18 здоровья; event.fountain.curse: одно бремя башни.
- event.toll.cost: 12 золота; event.toll.gold: 24 золота; event.toll.damage: 8 урона; event.toll.chance: 50%.
- event.nest.chance: 65%; event.nest.gold: 20 золота; event.nest.damage: 6 урона.
- event.cairn.cost: 10 золота; event.cairn.defense: одна защита.
- event.hour.will: один заряд воли.
- event.trader.gold: 35 золота для стоимости покупки.
- event.bell.cost: 6 здоровья; event.bell.relic: одна реликвия.

Не выбирай стоимость здоровья для варианта, который обещает безопасный исход. Не обещай конкретную реликвию при случайном эффекте relic. Описывай только фактические разрешённые эффекты. Выбор с removeRelic не должен обещать награду при отсутствии реликвии. Вложенную структуру и ключи дополнительно проверяет sim.validateStock.

Пример элемента:
{"id":"dusty-step","title":"Пыльная ступень","text":"Под камнем что-то тихо звенит.","choices":[{"title":"Поднять камень","text":"Получить 20 золота с шансом 65%, иначе потерять 6 здоровья.","effects":[{"type":"gold","key":"event.nest.gold"}],"chanceKey":"event.nest.chance","failEffects":[{"type":"damage","key":"event.nest.damage"}]},{"title":"Пройти мимо","text":"Ничего не изменится.","effects":[]}]}

```schema
{"key":"id","fields":{"id":{"type":"string","min":3,"max":60},"title":{"type":"string","min":3,"max":70},"text":{"type":"string","min":10,"max":260},"choices":{"type":"array","max":3}}}
```
