// The module "Питомец" (modules/pet): how the creature is now, for «как там Листик?». The module
// copies this file into tools/.

exports.name = 'pet_state';
exports.description = 'Состояние питомца владельца из модуля «Питомец»: настроение сейчас (например, «невыспавшийся», «бодрый», ' +
  '«под пледом»), почему так, энергия 0–100, его фраза, стадия роста и вещи на нём. Для вопросов «как там <имя питомца>?», ' +
  '«что с питомцем». Отвечайте от его лица или о нём — тепло, без упрёков владельцу; голосом — через axiko.speech.say.';
exports.parameters = {
  type: 'object',
  properties: {}
};

exports.run = function () {
  if (!require('lib/axiko').files.exists('modules/pet/main.js')) return 'Модуль «Питомец» не установлен.';
  return require('modules/pet/main.js').tool();
};
