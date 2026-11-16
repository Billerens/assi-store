// The module "Здоровье" (modules/health): the owner's day in words — sleep, steps, water,
// medicines, habits with chains, screen time, places. The module copies this file into tools/.

exports.name = 'health_day';
exports.description = 'Сводка дня владельца из модуля «Здоровье»: сон, шаги, вода, лекарства, привычки и цепочки, экранное время, места, ' +
  'что ещё осталось сегодня. Для вопросов «как я спал», «сколько я сегодня прошёл», «что я ещё не сделал». ' +
  'Сутки — до 05:00 следующего утра (настраивается), сон относится к дню, утром которого владелец проснулся.';
exports.parameters = {
  type: 'object',
  properties: {
    date: { type: 'string', description: 'ГГГГ-ММ-ДД, «today» или «yesterday»; по умолчанию сегодня' }
  }
};

exports.run = function (args) {
  if (!require('lib/assi').files.exists('modules/health/main.js')) return 'Модуль «Здоровье» не установлен.';
  return require('modules/health/main.js').toolDay(args || {});
};
