// The built-in dictionary of shops: how banks spell them → the name to show and the category.
// The owner's corrections and the model's answers live in data/spending/merchants.json and win
// over this list. `package` is the app of a subscription service (for "how often it was opened").
// Pure data plus one function; keys are brought to the form of merchant.key().
var merchant = require('./merchant.js');

var LIST = [
  // Продукты
  ['Пятёрочка', 'Продукты', ['PYATEROCHKA', 'PYATYOROCHKA', 'Пятёрочка', '5KA', 'PYATEROCHKA GM']],
  ['Перекрёсток', 'Продукты', ['PEREKRESTOK', 'Перекрёсток', 'PEREKRESTOK VPROK', 'VPROK']],
  ['Магнит', 'Продукты', ['MAGNIT', 'Магнит', 'MAGNIT MM', 'MAGNIT GM', 'MAGNIT KOSMETIK']],
  ['ВкусВилл', 'Продукты', ['VKUSVILL', 'VKUS VILL', 'ВкусВилл', 'IZBENKA']],
  ['Лента', 'Продукты', ['LENTA', 'Лента']],
  ['Ашан', 'Продукты', ['AUCHAN', 'ASHAN', 'Ашан']],
  ['Дикси', 'Продукты', ['DIXY', 'DIKSI', 'Дикси']],
  ['Азбука вкуса', 'Продукты', ['AZBUKA VKUSA', 'Азбука вкуса', 'AV DAILY']],
  ['Metro Cash & Carry', 'Продукты', ['METRO CC', 'METRO CASH']],
  ['О\'кей', 'Продукты', ['OKEY', 'O KEY', 'Окей']],
  ['Spar', 'Продукты', ['SPAR', 'EUROSPAR']],
  ['Верный', 'Продукты', ['VERNYY', 'VERNYI', 'Верный']],
  ['Светофор', 'Продукты', ['SVETOFOR', 'Светофор']],
  ['Бристоль', 'Продукты', ['BRISTOL', 'Бристоль']],
  ['Красное & Белое', 'Продукты', ['KRASNOE BELOE', 'KRASNOE I BELOE', 'KRASNOE&BELOE', 'Красное и белое']],
  ['Fix Price', 'Дом', ['FIX PRICE', 'FIXPRICE', 'Фикс прайс']],
  ['Самокат', 'Доставка еды', ['SAMOKAT', 'Самокат']],
  ['Яндекс Лавка', 'Доставка еды', ['YANDEX LAVKA', 'LAVKA', 'Яндекс Лавка', 'Лавка']],
  ['Купер', 'Доставка еды', ['KUPER', 'SBERMARKET', 'Купер', 'СберМаркет']],
  ['Яндекс Еда', 'Доставка еды', ['YANDEX EDA', 'EDA YANDEX', 'Яндекс Еда', 'YANDEX FOOD']],
  ['Delivery Club', 'Доставка еды', ['DELIVERY CLUB', 'DELIVERYCLUB', 'Деливери']],
  ['Кухня на районе', 'Доставка еды', ['KUKHNYA NA RAYONE', 'Кухня на районе']],
  ['Додо Пицца', 'Доставка еды', ['DODO PIZZA', 'DODO', 'Додо']],
  // Кафе и рестораны
  ['Вкусно — и точка', 'Кафе и рестораны', ['VKUSNO I TOCHKA', 'VKUSNO TOCHKA', 'Вкусно и точка']],
  ['Бургер Кинг', 'Кафе и рестораны', ['BURGER KING', 'BURGERKING', 'Бургер Кинг']],
  ['Rostic\'s', 'Кафе и рестораны', ['ROSTICS', 'ROSTIC S', 'KFC']],
  ['Шоколадница', 'Кафе и рестораны', ['SHOKOLADNITSA', 'SHOKOLADNICA', 'Шоколадница']],
  ['Кофе Хауз', 'Кафе и рестораны', ['COFFEE HOUSE', 'KOFE KHAUZ']],
  ['Cofix', 'Кафе и рестораны', ['COFIX']],
  ['Coffee Like', 'Кафе и рестораны', ['COFFEE LIKE', 'COFFEELIKE']],
  ['Surf Coffee', 'Кафе и рестораны', ['SURF COFFEE']],
  ['Double B', 'Кафе и рестораны', ['DOUBLE B', 'DOUBLEB']],
  ['Даблби', 'Кафе и рестораны', ['DABLBI']],
  ['Stars Coffee', 'Кафе и рестораны', ['STARS COFFEE']],
  ['Теремок', 'Кафе и рестораны', ['TEREMOK', 'Теремок']],
  ['Якитория', 'Кафе и рестораны', ['YAKITORIYA', 'Якитория']],
  ['Тануки', 'Кафе и рестораны', ['TANUKI', 'Тануки']],
  ['Му-Му', 'Кафе и рестораны', ['MU MU', 'MUMU', 'Му-Му']],
  ['Грабли', 'Кафе и рестораны', ['GRABLI', 'Грабли']],
  ['Столовая', 'Кафе и рестораны', ['STOLOVAYA', 'Столовая']],
  // Такси
  ['Яндекс Go', 'Такси', ['YANDEX TAXI', 'YANDEX GO', 'YANDEXGO', 'TAXI YANDEX', 'Яндекс Такси', 'Яндекс Go', 'YANDEX TAKSI']],
  ['Ситимобил', 'Такси', ['CITYMOBIL', 'Ситимобил']],
  ['Uber', 'Такси', ['UBER']],
  ['Bolt', 'Такси', ['BOLT', 'BOLT EU']],
  ['Максим', 'Такси', ['TAXI MAKSIM', 'MAKSIM', 'Такси Максим']],
  // Транспорт
  ['Метро', 'Транспорт', ['MOSCOW METRO', 'METRO MOSKVA', 'METROPOLITEN', 'Метрополитен', 'MOSMETRO']],
  ['Тройка', 'Транспорт', ['TROYKA', 'Тройка']],
  ['Транспорт Москвы', 'Транспорт', ['MOSGORTRANS', 'MGT', 'TRANSPORT MOSKVY']],
  ['ЦППК', 'Транспорт', ['TSPPK', 'CPPK', 'ЦППК']],
  ['РЖД', 'Транспорт', ['RZD', 'РЖД', 'PASSAZHIRSKIE PEREVOZKI']],
  ['Аэрофлот', 'Транспорт', ['AEROFLOT', 'Аэрофлот']],
  ['Победа', 'Транспорт', ['POBEDA', 'Победа']],
  ['S7', 'Транспорт', ['S7', 'SIBIR AIRLINES']],
  ['Делимобиль', 'Транспорт', ['DELIMOBIL', 'Делимобиль']],
  ['Ситидрайв', 'Транспорт', ['CITYDRIVE', 'Ситидрайв']],
  ['Яндекс Драйв', 'Транспорт', ['YANDEX DRIVE', 'Яндекс Драйв']],
  ['Whoosh', 'Транспорт', ['WHOOSH']],
  ['Юрент', 'Транспорт', ['URENT', 'Юрент']],
  ['Московский паркинг', 'Транспорт', ['MOSKOVSKIY PARKING', 'PARKING', 'Парковка']],
  ['Лукойл', 'Транспорт', ['LUKOIL', 'AZS LUKOIL', 'Лукойл']],
  ['Роснефть', 'Транспорт', ['ROSNEFT', 'Роснефть']],
  ['Газпромнефть', 'Транспорт', ['GAZPROMNEFT', 'GPN', 'Газпромнефть']],
  ['Татнефть', 'Транспорт', ['TATNEFT', 'Татнефть']],
  ['Shell', 'Транспорт', ['SHELL']],
  // Связь и интернет
  ['МТС', 'Связь и интернет', ['MTS', 'МТС']],
  ['Билайн', 'Связь и интернет', ['BEELINE', 'Билайн']],
  ['МегаФон', 'Связь и интернет', ['MEGAFON', 'МегаФон']],
  ['Т2', 'Связь и интернет', ['TELE2', 'T2 MOBILE', 'Теле2']],
  ['Ростелеком', 'Связь и интернет', ['ROSTELECOM', 'Ростелеком']],
  ['Дом.ру', 'Связь и интернет', ['DOM RU', 'ERTELECOM', 'ER TELECOM']],
  ['МГТС', 'Связь и интернет', ['MGTS', 'МГТС']],
  ['Yota', 'Связь и интернет', ['YOTA']],
  // Подписки
  ['Кинопоиск', 'Подписки', ['KINOPOISK', 'Кинопоиск'], 'ru.kinopoisk'],
  ['Яндекс Плюс', 'Подписки', ['YANDEX PLUS', 'PLUS YANDEX', 'Яндекс Плюс', 'YANDEX PLYUS'], 'ru.yandex.music'],
  ['Яндекс Музыка', 'Подписки', ['YANDEX MUSIC', 'Яндекс Музыка', 'YANDEX MUZYKA'], 'ru.yandex.music'],
  ['Okko', 'Подписки', ['OKKO', 'Окко'], 'ru.more.play'],
  ['Иви', 'Подписки', ['IVI', 'IVI RU', 'Иви'], 'ru.ivi.client'],
  ['Wink', 'Подписки', ['WINK'], 'ru.rt.video.app.mobile'],
  ['Start', 'Подписки', ['START RU', 'START ONLINE'], 'ru.start.androidmobile'],
  ['Premier', 'Подписки', ['PREMIER', 'PREMIER ONE'], 'gpm.tnt_premier'],
  ['Кион', 'Подписки', ['KION', 'Кион'], 'ru.mts.mtstv'],
  ['VK Музыка', 'Подписки', ['VK MUSIC', 'VK MUZYKA', 'BOOM', 'VK COMBO'], 'com.uma.musicvk'],
  ['СберПрайм', 'Подписки', ['SBERPRIME', 'SBER PRIME', 'СберПрайм'], 'ru.sberbankmobile'],
  ['Альфа Смарт', 'Подписки', ['ALFA SMART', 'ALFA-SMART'], 'ru.alfabank.mobile.android'],
  ['Т-Банк Pro', 'Подписки', ['TINKOFF PRO', 'TBANK PRO', 'T BANK PRO'], 'com.idamob.tinkoff.android'],
  ['Литрес', 'Подписки', ['LITRES', 'Литрес'], 'ru.litres.android'],
  ['YouTube Premium', 'Подписки', ['YOUTUBE', 'YOUTUBE PREMIUM'], 'com.google.android.youtube'],
  ['Spotify', 'Подписки', ['SPOTIFY'], 'com.spotify.music'],
  ['Netflix', 'Подписки', ['NETFLIX', 'NETFLIX COM'], 'com.netflix.mediaclient'],
  ['Telegram Premium', 'Подписки', ['TELEGRAM', 'TELEGRAM PREMIUM'], 'org.telegram.messenger'],
  ['Apple', 'Подписки', ['APPLE', 'APPLE COM', 'ITUNES']],
  ['Google Play', 'Подписки', ['GOOGLE PLAY', 'GOOGLE']],
  ['ChatGPT', 'Подписки', ['OPENAI', 'CHATGPT']],
  // Здоровье
  ['Ригла', 'Здоровье', ['RIGLA', 'Ригла']],
  ['36,6', 'Здоровье', ['36 6', 'APTEKA 36 6', 'Аптека 36,6']],
  ['Горздрав', 'Здоровье', ['GORZDRAV', 'Горздрав']],
  ['Аптека Апрель', 'Здоровье', ['APTEKA APREL', 'APREL']],
  ['ЕАптека', 'Здоровье', ['EAPTEKA', 'ЕАптека']],
  ['Столички', 'Здоровье', ['STOLICHKI', 'Столички']],
  ['Аптека', 'Здоровье', ['APTEKA', 'Аптека', 'PHARMACY']],
  ['Инвитро', 'Здоровье', ['INVITRO', 'Инвитро']],
  ['Гемотест', 'Здоровье', ['GEMOTEST', 'Гемотест']],
  ['СберЗдоровье', 'Здоровье', ['SBERZDOROVIE', 'SBERHEALTH']],
  ['Стоматология', 'Здоровье', ['STOMATOLOGIYA', 'Стоматология', 'DENTAL']],
  ['World Class', 'Здоровье', ['WORLD CLASS']],
  ['DDX Fitness', 'Здоровье', ['DDX', 'DDX FITNESS']],
  ['Spirit Fitness', 'Здоровье', ['SPIRIT FITNESS']],
  // Одежда
  ['Спортмастер', 'Одежда', ['SPORTMASTER', 'Спортмастер']],
  ['Gloria Jeans', 'Одежда', ['GLORIA JEANS', 'GLORIAJEANS']],
  ['Lamoda', 'Одежда', ['LAMODA', 'Ламода']],
  ['Zarina', 'Одежда', ['ZARINA']],
  ['Befree', 'Одежда', ['BEFREE']],
  ['Love Republic', 'Одежда', ['LOVE REPUBLIC']],
  ['Ostin', 'Одежда', ['OSTIN', 'O STIN']],
  ['Uniqlo', 'Одежда', ['UNIQLO']],
  ['Ecco', 'Одежда', ['ECCO']],
  ['Kari', 'Одежда', ['KARI']],
  ['Твоё', 'Одежда', ['TVOE', 'Твоё']],
  // Дом
  ['Леруа Мерлен', 'Дом', ['LEROY MERLIN', 'LEMANA PRO', 'LEMANAPRO', 'Леруа Мерлен']],
  ['Hoff', 'Дом', ['HOFF']],
  ['Икеа', 'Дом', ['IKEA', 'Икеа']],
  ['Твой дом', 'Дом', ['TVOY DOM']],
  ['OBI', 'Дом', ['OBI']],
  ['DNS', 'Дом', ['DNS', 'DNS SHOP', 'DNS RETAIL']],
  ['М.Видео', 'Дом', ['MVIDEO', 'M VIDEO', 'Эм видео']],
  ['Эльдорадо', 'Дом', ['ELDORADO', 'Эльдорадо']],
  ['Ситилинк', 'Дом', ['CITILINK', 'Ситилинк']],
  ['Улыбка радуги', 'Дом', ['ULYBKA RADUGI', 'Улыбка радуги']],
  ['Золотое яблоко', 'Одежда', ['ZOLOTOE YABLOKO', 'GOLDAPPLE', 'GOLD APPLE']],
  ['Летуаль', 'Одежда', ['LETUAL', 'L ETOILE', 'LETOILE']],
  ['Мосэнергосбыт', 'Дом', ['MOSENERGOSBYT', 'Мосэнергосбыт']],
  ['ЕИРЦ', 'Дом', ['EIRTS', 'MOSOBLEIRTS', 'ЕИРЦ', 'ZHKU', 'ЖКУ']],
  ['Госуслуги', 'Прочее', ['GOSUSLUGI', 'Госуслуги']],
  // Развлечения
  ['Яндекс Афиша', 'Развлечения', ['YANDEX AFISHA', 'Яндекс Афиша']],
  ['Кассир.ру', 'Развлечения', ['KASSIR', 'KASSIR RU']],
  ['Синема Парк', 'Развлечения', ['CINEMA PARK', 'Синема Парк']],
  ['Каро', 'Развлечения', ['KARO', 'KARO FILM']],
  ['Формула Кино', 'Развлечения', ['FORMULA KINO']],
  ['Steam', 'Развлечения', ['STEAM', 'STEAMPOWERED', 'VALVE']],
  ['PlayStation', 'Развлечения', ['PLAYSTATION', 'SONY PLAYSTATION', 'PSN']],
  ['Читай-город', 'Развлечения', ['CHITAY GOROD', 'Читай-город']],
  ['Мир Кубиков', 'Развлечения', ['MIR KUBIKOV']],
  ['Детский мир', 'Развлечения', ['DETSKIY MIR', 'Детский мир']],
  // Маркетплейсы и прочее: что внутри заказа, банк не говорит
  ['Ozon', 'Прочее', ['OZON', 'OZON RU', 'Озон']],
  ['Wildberries', 'Прочее', ['WILDBERRIES', 'WB', 'Вайлдберриз']],
  ['Яндекс Маркет', 'Прочее', ['YANDEX MARKET', 'MARKET YANDEX', 'Яндекс Маркет']],
  ['AliExpress', 'Прочее', ['ALIEXPRESS', 'ALIBABA']],
  ['Мегамаркет', 'Прочее', ['MEGAMARKET', 'Мегамаркет']],
  ['Почта России', 'Прочее', ['POCHTA ROSSII', 'Почта России', 'POCHTA']],
  ['СДЭК', 'Прочее', ['CDEK', 'СДЭК']],
  ['Снятие наличных', 'Прочее', ['ATM', 'Банкомат', 'BANKOMAT', 'Снятие наличных', 'Выдача наличных']]
];

/** The built-in dictionary as { KEY: { name, category, package } }. */
exports.dictionary = function () {
  var out = {};
  LIST.forEach(function (item) {
    item[2].forEach(function (spelling) {
      var k = merchant.key(spelling);
      if (k && !out[k]) out[k] = { name: item[0], category: item[1], package: item[3] || null };
    });
  });
  return out;
};

/** Packages of subscription services by shop name: { 'Кинопоиск': 'ru.kinopoisk' }. */
exports.packages = function () {
  var out = {};
  LIST.forEach(function (item) { if (item[3]) out[item[0]] = item[3]; });
  return out;
};
