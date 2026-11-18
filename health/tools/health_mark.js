// The module "Здоровье" (modules/health): marks from the chat or the voice — water, a habit, a
// medicine, how the owner feels, a workout, a sleep correction, a pause — and new habits and
// medicine courses (also from a photo of a prescription the main agent has read). The module
// copies this file into tools/ at its start.

exports.name = 'health_mark';
exports.description = 'Отметить в модуле «Здоровье»: воду («выпил стакан воды»), привычку («сделал зарядку»), ' +
  'приём лекарства («принял витамин D»), самочувствие 1–5, тренировку, поправку сна («лёг в час, встал в восемь»), ' +
  'паузу («я болею до пятницы» — цепочки замораживаются, напоминания о привычках молчат) и её конец. ' +
  'Ещё — завести привычку (add_habit) или курс лекарства с расписанием (add_med), например по фото рецепта; перед add_med ' +
  'перескажите владельцу, что поняли из рецепта, и заводите после его «да». Модуль сам считает цепочки, цели и сводку дня — ' +
  'это вернее, чем base_add. Отвечает одной строкой — перескажите её.';
exports.parameters = {
  type: 'object',
  properties: {
    what: { type: 'string', 'enum': ['water', 'habit', 'med', 'mood', 'workout', 'sleep', 'pause', 'unpause', 'add_habit', 'add_med'], description: 'Что сделать' },
    name: { type: 'string', description: 'Привычка или лекарство (как назвал владелец); для тренировки — её вид; для паузы — подпись' },
    amount: { type: 'number', description: 'Вода — сколько (в единицах unit; без unit — миллилитры, а число до 20 — стаканы; без amount — один стакан); самочувствие — 1–5; тренировка — минуты; привычка — значение (или цель для add_habit)' },
    unit: { type: 'string', description: 'Для воды: ml, l или glass (стакан — объём из настроек модуля); для add_habit — единица цели (мин, стр.)' },
    status: { type: 'string', 'enum': ['taken', 'skipped'], description: 'Для лекарства: принял или пропустил (по умолчанию принял)' },
    bed: { type: 'string', description: 'Для сна: время отбоя, ЧЧ:ММ' },
    wake: { type: 'string', description: 'Для сна: время подъёма, ЧЧ:ММ' },
    type: { type: 'string', 'enum': ['sick', 'vacation', 'rest'], description: 'Для паузы: болею, отпуск, перерыв' },
    date: { type: 'string', description: 'Для сна — утро ночи (ГГГГ-ММ-ДД, по умолчанию сегодня); для паузы — последний день паузы включительно (без даты — пока не скажет); для add_med — последний день курса' },
    times: { type: 'array', items: { type: 'string' }, description: 'Для add_med: время приёмов, ЧЧ:ММ' },
    dose: { type: 'string', description: 'Для add_med: доза («1 таблетка»)' },
    note: { type: 'string', description: 'Для add_med: заметка («после еды»)' },
    days: { type: 'array', items: { type: 'number' }, description: 'Для add_habit и add_med: дни недели 1–7 (1 — понедельник); без них — каждый день' },
    per_week: { type: 'number', description: 'Для add_habit: сколько раз в неделю (вместо дней)' },
    remind: { type: 'string', description: 'Для add_habit: время напоминания ЧЧ:ММ (без него — не напоминать)' }
  },
  required: ['what']
};

exports.run = function (args) {
  if (!require('lib/axiko').files.exists('modules/health/main.js')) return 'Модуль «Здоровье» не установлен.';
  return require('modules/health/main.js').tool(args || {});
};
