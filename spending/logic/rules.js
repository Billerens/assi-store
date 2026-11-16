// Built-in rules for messages of Russian banks. The formats here are typical ones written from
// public examples, not copied from the owner's phone: the real texts of the owner's banks are
// checked on the phone (screen «Источники»), and the rules for them go to data/spending/rules.json,
// which is tried before this list. A rule there with the same id and "off": true turns one of
// these off.
//
// A rule: { id, bank, from?: [senders or packages, "prefix*"], type?: fixed type, kinds?: {word: type},
//           re: expression with named groups amount (required), currency, merchant, card, balance,
//           base (the amount in rubles of a foreign purchase), kind (the word of the operation), time }
// Shortcuts in re: {AMT} — an amount, {CUR} — a currency mark, {CARD} — four digits.
// The text a rule sees is one line with ordinary spaces; for a push it is "title. text".
// What a rule leaves out (card, balance) is taken from the text by the general reader.

var OP = String.raw`Отмена покупки|Возврат покупки|Отказ покупка|Отказ|Покупка|Оплата услуг|Оплата|Списание|Перевод|Зачисление зарплаты|Зачисление|Зарплата|Выдача наличных|Выдача|Кэшбэк|Кешбэк`;

module.exports = [
  {
    id: 'sber-sms',
    bank: 'Сбербанк',
    re: String.raw`(?:^|\s)(?<card>(?:MIR|VISA|ECMC|MC|MAESTRO|СЧЁТ|СЧЕТ|МИР|КАРТА)-?{CARD}) (?<time>\d{1,2}:\d{2}) (?<kind>${OP}) (?<amount>{AMT}) ?(?<currency>{CUR})(?: (?<merchant>.+?))?\.?(?: Недостаточно средств\.?)? Баланс:? (?<balance>{AMT}) ?(?:{CUR})`
  },
  {
    id: 'sber-push',
    bank: 'Сбербанк',
    from: ['ru.sberbankmobile*', 'ru.sberbank*'],
    re: String.raw`(?:^|\. )(?<kind>Покупка|Оплата|Входящий перевод|Перевод|Зачисление|Возврат|Списание|Отказ в покупке|Отмена покупки) (?<amount>{AMT}) ?(?<currency>{CUR})(?: (?<merchant>(?:(?!\. )[^,:])+?))?(?:[,:] (?:карта|счёт|счет|недостаточно)|\. Баланс)`
  },
  {
    id: 'tbank-push',
    bank: 'Т-Банк',
    from: ['com.idamob.tinkoff.android', 'ru.tinkoff*', 'ru.tbank*', 'com.tbank*'],
    re: String.raw`(?:^|\. )(?<kind>Покупка|Оплата|Пополнение|Перевод|Возврат|Кешбэк|Кэшбэк|Отказ|Списание|Блокировка|Холд) (?<amount>{AMT}) ?(?<currency>{CUR})\. (?:(?<base>{AMT}) ?₽ по курсу банка\. )?(?<merchant>[^.]+?(?:\.(?:RU|COM|EU|NET|ORG|IO))?)\. (?:[^.]*\. )?(?:Карта \*{CARD}\. )?(?:Доступно|[А-ЯЁ][а-яё]+ [^.]*$)`
  },
  {
    id: 'tbank-sms',
    bank: 'Т-Банк',
    re: String.raw`^(?<kind>Покупка|Оплата|Отмена покупки|Пополнение|Перевод|Возврат|Отказ|Списание|Снятие), (?:карта \*(?<card>{CARD})|сч[её]т [A-Z]{3}(?: \*{CARD})?)\. (?<amount>{AMT}) ?(?<currency>{CUR})\. (?<merchant>[^.]+?(?:\.(?:RU|COM|EU|NET|ORG|IO))?)\.(?: Недостаточно средств\.?)?(?: Доступно (?<balance>{AMT}) ?(?:{CUR}))?`
  },
  {
    id: 'alfa-sms-latin',
    bank: 'Альфа-Банк',
    kinds: { Pokupka: 'purchase', Vozvrat: 'refund', Otkaz: 'declined', Postuplenie: 'income', Perevod: 'transfer_out', 'Snyatie nalichnyh': 'purchase' },
    re: String.raw`Karta \*(?<card>{CARD}); (?<kind>Pokupka|Vozvrat|Otkaz|Postuplenie|Perevod|Snyatie nalichnyh); (?:Uspeshno; )?Summa: (?<amount>{AMT}) (?<currency>{CUR});(?: Ostatok: (?<balance>{AMT}) {CUR};)?(?: Prichina: [^;]*;)? [A-Z]{2}\/[A-Z\-]+\/(?<merchant>[^;]+);`
  },
  {
    id: 'alfa-push',
    bank: 'Альфа-Банк',
    from: ['ru.alfabank*'],
    re: String.raw`(?:^|\. )(?<kind>Покупка|Оплата|Поступление|Перевод|Возврат|Списание|Отклонена покупка|Отмена) (?<amount>{AMT}) ?(?<currency>₽|RUR|RUB|USD|EUR)(?: (?<merchant>[^.]+?(?:\.(?:RU|COM|EU|NET))?))?\. (?:(?:Недостаточно средств|Зарплата)\. )?(?:Карта \*(?<card>{CARD})(?:\. |$))?(?:Баланс|$)`
  },
  {
    id: 'vtb-sms',
    bank: 'ВТБ',
    kinds: { 'Поступление': 'income' },
    re: String.raw`^(?<kind>Списание|Оплата|Поступление|Зарплата|Возврат|Отказ|Перевод|Снятие) (?<amount>{AMT}) ?(?<currency>{CUR}) (?:Карта|Счет|Счёт)\*(?<card>{CARD})(?:\.? (?<merchant>(?!Баланс)\S.*?))?\.?(?: Недостаточно средств)?(?: Баланс (?<balance>{AMT}) ?(?:{CUR}))?(?: (?<time>\d{1,2}:\d{2}))?$`
  },
  {
    id: 'vtb-push',
    bank: 'ВТБ',
    from: ['ru.vtb24*', 'ru.vtb*'],
    re: String.raw`(?:^|\. )(?<kind>Оплата|Списание|Поступление|Перевод|Возврат|Отказ в оплате) (?<amount>{AMT}) ?(?<currency>{CUR})(?: в (?<merchant>.+?) по карте \*(?<card>{CARD})| — (?<what>[^.]+))?\. Доступно (?<balance>{AMT})`
  },
  {
    id: 'ozon-push',
    bank: 'Озон Банк',
    from: ['ru.ozon.fintech*', 'ru.ozon.bank*'],
    re: String.raw`(?:^|\. )(?<kind>Покупка|Оплата|Возврат|Пополнение|Перевод|Списание)(?: на)? (?<amount>{AMT}) ?(?<currency>{CUR})(?: по СБП)? (?:в|от|на) (?<merchant>[^.]+?(?:\.(?:RU|COM))?)\. (?:Карта •• ?(?<card>{CARD})\. )?Баланс (?<balance>{AMT})`
  },
  {
    id: 'yandex-push',
    bank: 'Яндекс Банк',
    from: ['com.yandex.bank*', 'ru.yandex.bank*'],
    re: String.raw`(?:^|\. )(?<kind>Списание|Оплата|Покупка|Возврат|Пополнение|Перевод) (?<amount>{AMT}) ?(?<currency>{CUR}) · (?<merchant>[^·]+?) · (?:Карта \*(?<card>{CARD}) · )?Остаток (?<balance>{AMT})`
  },
  {
    id: 'raif-sms',
    bank: 'Райффайзенбанк',
    kinds: { 'Pokupka': 'purchase', 'Vozvrat pokupki': 'refund', 'Otkaz': 'declined', 'Zachislenie': 'income', 'Snyatie': 'purchase' },
    re: String.raw`Karta \*(?<card>{CARD}); (?<kind>Pokupka|Vozvrat pokupki|Otkaz|Zachislenie|Snyatie): (?<amount>{AMT}) (?<currency>{CUR}); (?<merchant>[^;]+); Data: [\d\/.]+ (?<time>\d{1,2}:\d{2})`
  },
  {
    id: 'gpb-sms',
    bank: 'Газпромбанк',
    kinds: { 'Pokupka': 'purchase', 'Vozvrat': 'refund', 'Otkaz': 'declined', 'Zachislenie': 'income' },
    re: String.raw`Telecard; Card(?<card>{CARD}); (?<kind>Pokupka|Vozvrat|Otkaz|Zachislenie); Summa (?<amount>{AMT}) (?<currency>{CUR}); [\d.]+ (?<time>\d{1,2}:\d{2}); (?<merchant>[^;]+);`
  },
  {
    id: 'halva',
    bank: 'Совкомбанк',
    from: ['ru.sovcombank*'],
    re: String.raw`Халва \*(?<card>{CARD}): (?<kind>Покупка|Оплата|Возврат|Отказ|Пополнение) (?<amount>{AMT}) (?<currency>{CUR})(?: (?<merchant>[^.]+?))?\.(?: Недостаточно средств\.)? Доступно (?<balance>{AMT})`
  },
  {
    id: 'mts-sms',
    bank: 'МТС Банк',
    re: String.raw`^(?<kind>Оплата|Покупка|Возврат|Отказ|Пополнение) (?<amount>{AMT}) (?<currency>{CUR}) по карте \*(?<card>{CARD}) (?<merchant>[^.]+?)\.(?: Недостаточно средств\.)? Доступно (?<balance>{AMT})`
  },
  {
    id: 'pochta-sms',
    bank: 'Почта Банк',
    re: String.raw`^(?<kind>Списание|Зачисление|Возврат|Отказ) (?<amount>{AMT}) (?<currency>{CUR}) Карта \*(?<card>{CARD})\. (?:(?<merchant>[^.]+?)\. )?Баланс (?<balance>{AMT})`
  },
  {
    id: 'samsung-wallet-receipt',
    bank: null,
    wallet: true,
    receipt: true,
    from: ['com.samsung.android.spay*', 'com.samsung.android.samsungpay*', 'com.samsung.android.wallet*'],
    type: 'purchase',
    // Some Wallet versions use the card title and a receipt, without an operation verb.
    // Keep this restricted to Wallet and a card heading, never arbitrary bank/app messages.
    re: String.raw`^(?:Mastercard|Master card|Visa|Мир|Белкарт|Belkart|Maestro|American Express)(?=\s|[*•.])[^.\r\n]{0,100}\. (?<merchant>[^\r\n]{2,100}?) (?<amount>{AMT}) ?(?<currency>{CUR})[.!]?$`
  },
  {
    id: 'samsung-wallet',
    bank: null,
    wallet: true,
    from: ['com.samsung.android.spay*', 'com.samsung.android.samsungpay*', 'com.samsung.android.wallet*'],
    type: 'purchase',
    re: String.raw`(?:^|\. )Оплачено (?<amount>{AMT}) ?(?<currency>{CUR})(?: · Карта (?:Мир |Visa |Mastercard )?\*(?<card>{CARD}))?`
  },
  {
    id: 'mir-pay',
    bank: null,
    wallet: true,
    from: ['ru.nspk.mirpay*'],
    type: 'purchase',
    re: String.raw`(?:^|\. )Покупка на сумму (?<amount>{AMT}) ?(?<currency>{CUR}) по карте (?:Мир )?•• ?(?<card>{CARD})`
  }
];
