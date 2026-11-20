(function (api) {
  'use strict';
  function fail(message) {
    throw new Error(message);
  }
  function text(value, limit) {
    return typeof value === 'string' ? value.trim().slice(0, limit) : '';
  }
  function number(value, min, max) {
    if (typeof value !== 'number' || !isFinite(value) || value < min || value > max)
      fail('Координата или размер вне границ эскиза.');
    return value;
  }
  function vector(value, min, max) {
    if (!Array.isArray(value) || value.length !== 3) fail('Нужны три координаты.');
    return value.map(function (component) {
      return number(component, min, max);
    });
  }
  function strings(value, count, length) {
    return (Array.isArray(value) ? value : [])
      .slice(0, count)
      .map(function (item) {
        return text(item, length);
      })
      .filter(Boolean);
  }
  function oneOf(value, choices, fallback) {
    return choices.indexOf(value) < 0 ? fallback : value;
  }
  api.shape = function (raw) {
    if (!raw || !Array.isArray(raw.parts) || !raw.parts.length || raw.parts.length > 64)
      fail('Мастерская принимает от одной до 64 деталей.');
    var shape = {
      name: text(raw.name, 80) || 'Эскиз',
      mount: oneOf(raw.mount, ['floor', 'surface', 'wall', 'ceiling'], 'floor'),
      parts: []
    };
    var kinds = ['box', 'sphere', 'cylinder', 'cone', 'torus', 'curve', 'mesh', 'profile'];
    raw.parts.forEach(function (part) {
      if (!part || kinds.indexOf(part.type) < 0) fail('Неизвестная форма детали.');
      var clean = {
        type: part.type,
        label: text(part.label, 70),
        at: vector(part.at || [0, 0, 0], -4, 4),
        size: vector(part.size || [1, 1, 1], 0.002, 5),
        rot: vector(part.rot || [0, 0, 0], -360, 360),
        color: /^#[a-f0-9]{6}$/i.test(part.color) ? part.color : '#987b61',
        material: oneOf(
          part.material,
          ['matte', 'metal', 'glass', 'wood', 'cloth', 'leather', 'paper', 'porcelain'],
          'matte'
        ),
        action: oneOf(part.action, ['light', 'seat', 'shelf', 'surface', 'catalog', 'hinge'], '')
      };
      if (part.pivot != null) clean.pivot = vector(part.pivot, -4, 4);
      if (part.type === 'box' && part.bevel != null) clean.bevel = number(part.bevel, 0, 1.5);
      if (part.type === 'profile') {
        if (!Array.isArray(part.profile) || part.profile.length < 2 || part.profile.length > 48)
          fail('Нужен профиль из 2–48 колец.');
        var previous = -5;
        clean.profile = part.profile.map(function (pair) {
          if (!Array.isArray(pair) || pair.length !== 2) fail('Укажите высоту и радиус кольца.');
          var y = number(pair[0], -4, 4),
            r = number(pair[1], 0, 4);
          if (y < previous) fail('Кольца профиля идут от основания к вершине.');
          previous = y;
          return [y, r];
        });
      }
      if (part.parent != null) {
        if (
          typeof part.parent !== 'number' ||
          part.parent !== Math.floor(part.parent) ||
          part.parent < 0 ||
          part.parent >= shape.parts.length
        )
          fail('Деталь может крепиться к предыдущей детали.');
        clean.parent = part.parent;
      }
      if (clean.action === 'hinge') clean.axis = oneOf(part.axis, ['x', 'y', 'z'], 'x');
      if (part.type === 'curve' || part.type === 'mesh') {
        var min = part.type === 'mesh' ? 3 : 2;
        if (!Array.isArray(part.points) || part.points.length < min || part.points.length > 96)
          fail('Неверное количество точек.');
        clean.points = part.points.map(function (point) {
          return vector(point, -4, 4);
        });
      }
      if (part.type === 'curve') clean.radius = number(part.radius == null ? 0.035 : part.radius, 0.003, 0.5);
      if (part.type === 'mesh') {
        if (!Array.isArray(part.faces) || !part.faces.length || part.faces.length > 160)
          fail('Нужны треугольные грани.');
        clean.faces = part.faces.map(function (face) {
          var tri = vector(face, 0, clean.points.length - 1);
          if (
            tri.some(function (n) {
              return n !== Math.floor(n);
            }) ||
            tri[0] === tri[1] ||
            tri[1] === tri[2] ||
            tri[0] === tri[2]
          )
            fail('Повреждённая треугольная грань.');
          return tri;
        });
      }
      shape.parts.push(clean);
    });
    return shape;
  };
  api.choices = function (raw) {
    var options = strings(raw && raw.options, 3, 700).filter(function (v, i, a) {
      return a.indexOf(v) === i;
    });
    if (options.length < 2) fail('Модель не вернула разные варианты.');
    return options;
  };
  api.chapter = function (raw) {
    if (!raw || !text(raw.title, 100)) fail('Глава пришла без заглавия.');
    var paragraphs = strings(raw.paragraphs, 45, 2600);
    if (!paragraphs.length || paragraphs.join(' ').length < 65) fail('Для главы пока недостаточно текста.');
    return {
      title: text(raw.title, 100),
      paragraphs: paragraphs,
      summary: text(raw.summary, 1100) || paragraphs[0].slice(0, 400),
      facts: strings(raw.facts, 14, 420),
      threads: strings(raw.threads, 8, 320)
    };
  };
  api.memory = function (book, note, count) {
    var chapters = book.chapters.slice(0, count),
      last = chapters[chapters.length - 1];
    var terms = (String(note || '') + ' ' + (last ? last.threads.join(' ') : ''))
      .toLowerCase()
      .split(/[^a-zа-яё0-9]+/i)
      .filter(function (v) {
        return v.length > 3;
      });
    var sources = [];
    chapters.forEach(function (chapter, index) {
      chapter.paragraphs.forEach(function (p) {
        var score = terms.reduce(function (sum, term) {
          return sum + (p.toLowerCase().indexOf(term.slice(0, 6)) >= 0 ? 1 : 0);
        }, 0);
        if (score) sources.push({ chapter: index + 1, score: score, text: p.slice(0, 900) });
      });
    });
    sources.sort(function (a, b) {
      return b.score - a.score || b.chapter - a.chapter;
    });
    var timeline = chapters.map(function (c, i) {
      return [i + 1, c.summary.slice(0, i + 8 < chapters.length ? 165 : 430)];
    });
    var canon = chapters.map(function (c, i) {
      return c.facts.map(function (f) {
        return [i + 1, f];
      });
    });
    return {
      timeline: timeline.slice(-120),
      canon: [].concat.apply([], canon).slice(-120),
      sources: sources.slice(0, 6),
      open: last ? last.threads : [],
      last: last ? last.paragraphs.slice(-2) : []
    };
  };
})(typeof exports === 'object' ? exports : (window.ImaginariumSchema = {}));
