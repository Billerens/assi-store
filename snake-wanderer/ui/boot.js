// Оболочка для Игротеки. Движок Игротеки даёт сохранения, ачивки, меню и связки; сама игра
// открывается во вложенном кадре (play.html) и берёт всё это через window.parent.__hub.
// Так стили игры и стили Игротеки не мешают друг другу.
(async function () {
  var frame = document.getElementById('play');
  try {
    var g = await Game.start({ sim: window.GameSim, render: function () {} });
    window.__hub = g;
  } catch (e) {
    console.error('Игротека не запустилась, игра пойдёт без неё', e);
  }
  frame.src = 'play.html';
})();
