Придумай {count} сезонных заказов для садовой игры — к ближайшим праздникам и временам года
(Новый год, весна, лето, урожай, первый снег и т. п.). Заказ просит цветок Луноцвет с одним-двумя
признаками.

Признаки (латиницей, как в схеме): color — red, yellow, blue, orange, purple, green, white;
shape — star, bell, round; pattern — solid, stripes, dots, net. Только эти значения: редкие облики в
сезонный заказ не берём, их нельзя гарантированно вывести.

title — название заказа до 40 знаков («Букет к первому снегу»), text — одна строка, кто и зачем
просит (до 80 знаков). Без эмодзи и чужих названий.

```schema
{"key": "title", "fields": {"title": {"type": "string", "max": 40}, "text": {"type": "string", "max": 90}, "color": {"type": "string", "required": false, "oneOf": ["red", "yellow", "blue", "orange", "purple", "green", "white"]}, "shape": {"type": "string", "required": false, "oneOf": ["star", "bell", "round"]}, "pattern": {"type": "string", "required": false, "oneOf": ["solid", "stripes", "dots", "net"]}}}
```
