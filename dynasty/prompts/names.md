Придумай {count} старинных имён для людей выдуманного королевства — как в славянских сказках и
былинах, но не настоящих и не известных: «Ведислав», «Милорада», «Ярогост», «Звенислава».

- имя — одно слово русскими буквами, с заглавной, 3–14 букв, без дефисов и пробелов;
- пол — m (мужское) или f (женское), поровну тех и других;
- не повторяй известные имена (Владимир, Ольга и т.п.) и имена реальных людей.

Примерно к половине имён добавь прозвище правителя — по его главной черте, в роде того же пола
(«Скупой» / «Скупая», «Зодчий» / «Зодчая»), но своё, не повторяющее название черты: «Тугой
кошель», «Ясноокая», «Камнеруб». Прозвище — одно или два слова русскими буквами, первое с
заглавной, второе со строчной («Тугой кошель»), до 16 букв в слове. trait — id черты, к которой
оно относится, строго из списка:

wise Мудрый, generous Щедрый, stingy Скупой, brave Храбрый, coward Трусливый, sturdy Крепкий,
sickly Болезненный, eloquent Красноречивый, pious Набожный, learned Учёный, cunning Хитрый,
honest Честный, cruel Жестокий, kind Добрый, lazy Ленивый, diligent Трудолюбивый, giant Великан,
longlived Долгожитель, merry Весельчак, melancholic Меланхолик, builder Строитель, seafarer Мореход,
stargazer Звездочёт, lefthanded Левша, cautious Осторожный, fertile Плодовитый, bookish Книжник,
diplomat Дипломат, portly Тучный, tireless Неутомимый.

Прозвище не должно быть обидным сверх самой черты. Без прозвища не пиши ни nick, ни trait.

```schema
{"key": "name", "fields": {
  "name": {"type": "string", "min": 3, "max": 14},
  "gender": {"type": "string", "oneOf": ["m", "f"]},
  "nick": {"type": "string", "min": 3, "max": 29, "required": false},
  "trait": {"type": "string", "oneOf": ["wise", "generous", "stingy", "brave", "coward", "sturdy", "sickly", "eloquent", "pious", "learned", "cunning", "honest", "cruel", "kind", "lazy", "diligent", "giant", "longlived", "merry", "melancholic", "builder", "seafarer", "stargazer", "lefthanded", "cautious", "fertile", "bookish", "diplomat", "portly", "tireless"], "required": false}
}}
```
