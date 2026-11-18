// The agents' tool "phone_night": what the phone did at night — the story of the module
// «Тайная жизнь телефона» (modules/phone-night) to read aloud. The module puts a stub
// tools/phone_night.js into the workspace that points here (see installTool in main.js).
exports.name = 'phone_night';
exports.description = 'Что телефон делал ночью, пока владелец спал: кто его будил, кто ходил в сеть, куда ушла батарея, ' +
  'брал ли владелец телефон. Для вопросов «что телефон делал ночью?», «почему села батарея за ночь?». ' +
  'Возвращает готовый рассказ — зачитайте его как есть, не добавляя своих чисел.';
exports.parameters = {
  type: 'object',
  properties: {
    night: { type: 'string', description: 'ГГГГ-ММ-ДД — дата вечера, с которого началась ночь; по умолчанию последняя ночь' }
  }
};

exports.run = function (args) {
  if (!require('lib/axiko').files.exists('modules/phone-night/main.js')) return 'Модуль «Тайная жизнь телефона» не установлен.';
  return require('modules/phone-night/main.js').toolReport(args || {});
};
