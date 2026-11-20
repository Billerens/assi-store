var schema = require('./ui/schema.js');
exports['Свободная геометрия проверяется до изготовления'] = function (t) {
  var object = schema.shape({
    name: 'Складная звезда',
    parts: [
      {
        type: 'mesh',
        points: [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0]
        ],
        faces: [[0, 1, 2]]
      },
      {
        type: 'curve',
        points: [
          [0, 0, 0],
          [1, 1, 0]
        ]
      }
    ]
  });
  t.equal(object.parts.length, 2);
  t.throws(function () {
    schema.shape({
      parts: [
        {
          type: 'mesh',
          points: [
            [0, 0, 0],
            [1, 0, 0],
            [0, 1, 0]
          ],
          faces: [[0, 1, 40]]
        }
      ]
    });
  });
};
exports['Память разных книг отделена'] = function (t) {
  var a = schema.chapter({
    title: 'Ключ',
    paragraphs: [
      'Сестра положила латунный ключ у себя в карман и никому не рассказала, куда пошла после полудня.'
    ],
    facts: ['Ключ у сестры'],
    threads: ['Кто видел ключ?']
  });
  var memory = schema.memory({ chapters: [a] }, 'ключ', 1);
  t.equal(memory.canon[0][1], 'Ключ у сестры');
  t.equal(memory.open[0], 'Кто видел ключ?');
};
exports['Экран библиотеки'] = function (t) {
  var page = t.screen('modules/imaginarium/ui/index.html');
  t.wait(900);
  t.equal(page.text('h1'), 'Imaginarium');
  t.equal(page.count('#room'), 1);
  t.equal(page.count('#catalog'), 1);
};
