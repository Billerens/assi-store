import * as T from './vendor/three.module.js';
import { state, save, request, result, errorText, rememberLayout } from './state.js';
import { rooms, places, uid } from './data.js';
import { paper, sheet, el, open, button, row, field, choices, toast } from './paper.js';
import { shapeGroup } from './stage.js';
import { studioLight } from './artisan.js';
let changed = () => {},
  selectObject = () => {},
  previewRenderer = null;
const working = new Set();
export function workshopActions(update, select) {
  changed = update;
  selectObject = select;
}
function desk() {
  return state.work || (state.work = { prompt: '', variants: [], current: 0 });
}
function cleanView(group) {
  group.traverse((node) => {
    if (node.isMesh && ['TubeGeometry', 'BufferGeometry'].includes(node.geometry.type))
      node.geometry.dispose();
  });
}
function display(canvas, shape) {
  let renderer;
  try {
    renderer =
      previewRenderer ||
      (previewRenderer = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' }));
  } catch (e) {
    canvas.replaceWith(el('p', 'muted', 'Предпросмотр требует WebGL. Форма доступна для сохранения.'));
    return;
  }
  const surface = renderer.domElement;
  surface.className = 'preview';
  surface.tabIndex = 0;
  surface.setAttribute('aria-label', 'Объёмный эскиз. Потяните или нажмите стрелки для поворота.');
  canvas.replaceWith(surface);
  renderer.setPixelRatio(Math.min(1.5, devicePixelRatio));
  const scene = new T.Scene();
  studioLight(scene);
  scene.background = new T.Color('#41584c');
  const camera = new T.PerspectiveCamera(42, 1, 0.01, 100);
  const group = shapeGroup(shape),
    bounds = new T.Box3().setFromObject(group),
    center = bounds.getCenter(new T.Vector3()),
    extent = bounds.getSize(new T.Vector3());
  group.position.sub(center);
  scene.add(group);
  const size = Math.max(0.1, extent.length() * 0.68);
  scene.add(new T.HemisphereLight(0xffe9cc, 0xa4b0a1, 2.1));
  const key = new T.DirectionalLight(0xffd9a8, 2.4);
  key.position.set(-2, 4, 3);
  scene.add(key);
  let angle = 0.46,
    tilt = 0.26,
    drag = null;
  function paint() {
    const w = surface.clientWidth || 300,
      h = surface.clientHeight || 190;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const d = size * 2.6;
    camera.position.set(
      d * Math.sin(angle) * Math.cos(tilt),
      d * Math.sin(tilt),
      d * Math.cos(angle) * Math.cos(tilt)
    );
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }
  surface.onpointerdown = (e) => {
    surface.setPointerCapture(e.pointerId);
    drag = [e.clientX, e.clientY];
  };
  surface.onpointermove = (e) => {
    if (drag) {
      angle -= (e.clientX - drag[0]) * 0.014;
      tilt = T.MathUtils.clamp(tilt + (e.clientY - drag[1]) * 0.009, -1.2, 1.2);
      drag = [e.clientX, e.clientY];
      paint();
    }
  };
  surface.onpointerup = surface.onpointercancel = () => {
    drag = null;
  };
  surface.onkeydown = (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      angle += e.key === 'ArrowLeft' ? -0.18 : 0.18;
      paint();
      e.preventDefault();
    }
  };
  requestAnimationFrame(paint);
  document.addEventListener(
    'paper-change',
    () => {
      surface.onpointerdown =
        surface.onpointermove =
        surface.onpointerup =
        surface.onpointercancel =
        surface.onkeydown =
          null;
      cleanView(group);
    },
    { once: true }
  );
}
export function editObject(object) {
  state.work = {
    prompt: object.prompt,
    variants: [object.shape],
    current: 0,
    replacing: object.id,
    room: object.room,
    citation: object.citation || null
  };
  save();
  workshop();
}
async function harvest(order, shape) {
  const w = desk();
  if (w.order?.key !== order.key) return;
  w.variants.push(window.ImaginariumSchema.shape(shape));
  w.current = w.variants.length - 1;
  w.order = null;
  w.prompt = order.prompt;
  await save();
  if (sheet.open && paper.querySelector('h2')?.textContent === 'Мастерская формы') workshop();
  else toast('Эскиз готов');
}
async function execute(order) {
  if (!order || working.has(order.key)) return;
  working.add(order.key);
  const w = desk();
  try {
    await save(true);
    if (w.order?.key !== order.key) return;
    const shape = await request(
      'shape',
      { description: order.prompt, previous: order.previous, source: order.quote || undefined },
      order.key
    );
    await harvest(order, shape);
  } catch (e) {
    if (w.order?.key === order.key) {
      w.order.error = errorText(e);
      await save();
      if (sheet.open && paper.querySelector('h2')?.textContent === 'Мастерская формы') workshop();
    }
  } finally {
    working.delete(order.key);
  }
}
export async function recoverWorkshop() {
  const order = desk().order;
  if (order) {
    const saved = await result(order.key);
    if (saved) await harvest(order, saved);
  }
}
export function workshop(citation) {
  const w = desk();
  if (citation) {
    w.citation = citation;
    save();
  }
  open('Переплётная · Верстак', 'Мастерская формы');
  const shape = w.variants[w.current];
  paper.append(el('p', 'intro', 'Опишите вещь, которую хотите здесь видеть.'));
  if (shape) {
    const cv = el('div', 'preview');
    paper.append(el('h3', '', shape.name), cv);
    display(cv, shape);
    const options = row();
    if (w.current > 0)
      options.append(
        button('← Предыдущий', () => {
          w.current--;
          save();
          workshop();
        })
      );
    if (w.current < w.variants.length - 1)
      options.append(
        button('Следующий →', () => {
          w.current++;
          save();
          workshop();
        })
      );
    options.append(el('small', 'muted', 'Вариант ' + (w.current + 1) + ' / ' + w.variants.length));
    paper.append(options);
  }
  const prompt = field(
    shape ? 'Что изменить в выбранном эскизе?' : 'Описание предмета',
    w.prompt || '',
    'area'
  );
  prompt.input.placeholder = 'Например, модель дирижабля с медной гондолой';
  prompt.input.oninput = () => {
    w.prompt = prompt.input.value;
    save();
  };
  paper.append(prompt.root);
  if (w.citation)
    paper.append(
      el('p', 'muted', 'Из книги: ' + w.citation.quote.slice(0, 180)),
      button('Открепить цитату', () => {
        w.citation = null;
        save();
        workshop();
      })
    );
  if (w.order) {
    paper.append(
      el('p', 'muted', w.order.error || 'Эскиз заказан. Можно вернуться к чтению.'),
      row(
        button('Проверить', async () => {
          await recoverWorkshop();
          workshop();
        }),
        button('Отменить', () => {
          w.order = null;
          save();
          workshop();
        })
      )
    );
    if (w.order.error || !working.has(w.order.key))
      paper.append(button('Повторить заказ', () => execute(w.order)));
  } else
    paper.append(
      row(
        button(
          shape ? 'Создать вариант' : 'Изготовить по описанию',
          async () => {
            if (!prompt.input.value.trim()) return prompt.input.focus();
            const order = {
              key: uid(),
              prompt: prompt.input.value.trim().slice(0, 1800),
              previous: shape || null,
              quote: w.citation?.quote?.slice(0, 1400)
            };
            w.order = order;
            await save();
            workshop();
            await execute(order);
          },
          'action'
        )
      )
    );
  if (shape) {
    const room = choices(
        'Помещение',
        rooms.map((r, i) => [i, r.name]),
        w.room ?? state.room
      ),
      scale = field('Размер относительно эскиза', String(w.scale || 1), 'number');
    const mount = choices(
      'Размещение',
      [
        ['floor', 'На полу'],
        ['surface', 'На столе'],
        ['wall', 'На стене'],
        ['ceiling', 'Под потолком']
      ],
      shape.mount
    );
    scale.input.min = '.15';
    scale.input.max = '3';
    scale.input.step = '.1';
    paper.append(room.root, mount.root, scale.root);
    paper.append(
      row(
        button(
          w.replacing ? 'Принять эту редакцию' : 'Поставить в комнате',
          () => {
            const ri = Number(room.input.value),
              ratio = Number(scale.input.value);
            if (!(ratio >= 0.15 && ratio <= 3)) throw Error('Размер от 0,15 до 3.');
            rememberLayout();
            let o = state.objects.find((v) => v.id === w.replacing);
            const previous = o?.shape,
              keepPosition = o?.room === ri && (o.mount || o.shape.mount) === mount.input.value;
            if (!o) {
              o = { id: uid(), x: rooms[ri].x + 1.16, z: 1.0, y: 0, angle: 0, room: ri };
              state.objects.push(o);
            }
            o.room = ri;
            o.shape = shape;
            o.scale = ratio;
            o.prompt = w.prompt;
            o.citation = w.citation || null;
            o.mount = mount.input.value;
            if (!keepPosition) {
              o.x = rooms[ri].x + 1.16;
              o.z = 1.0;
              o.y = 0;
              if (o.mount === 'ceiling') o.y = 2.63;
              else if (o.mount === 'wall') {
                o.y = 1.8;
                o.z = -4.0;
              } else if (o.mount === 'surface') {
                const table = places.find((p) => p.room === ri && !p.shelf);
                o.x = table.x;
                o.y = table.y + 0.023;
                o.z = table.z;
              }
            }
            const filled = {};
            for (const b of state.books
              .filter((b) => b.place?.startsWith(o.id + '-'))
              .sort((a, b) => a.position - b.position)) {
              const index = Number(b.place.slice(o.id.length + 1)),
                old = previous?.parts[index];
              let newIndex = old
                ? shape.parts.findIndex((p) => p.action === old.action && p.label === old.label)
                : -1;
              if (newIndex < 0 && ['shelf', 'surface'].includes(shape.parts[index]?.action)) newIndex = index;
              const part = shape.parts[newIndex],
                capacity = part
                  ? Math.max(1, Math.floor((part.size[0] * ratio) / 0.42)) *
                    (part.action === 'surface' ? 3 : 1)
                  : 0;
              if ((filled[newIndex] || 0) >= capacity) {
                b.place = 'cart';
                continue;
              }
              filled[newIndex] = (filled[newIndex] || 0) + 1;
              b.place = o.id + '-' + newIndex;
            }
            state.work = { prompt: '', variants: [], current: 0 };
            changed();
            selectObject(o);
          },
          'action'
        )
      )
    );
  }
  if (w.variants.length || w.replacing || w.citation)
    paper.append(
      row(
        button('Начать другой предмет', () => {
          state.work = { prompt: '', variants: [], current: 0 };
          save();
          workshop();
        })
      )
    );
  if (state.objects.length) {
    paper.append(el('h3', '', 'В библиотеке'));
    for (const o of state.objects)
      paper.append(button(o.shape.name + ' · ' + rooms[o.room].name, () => selectObject(o), 'choice'));
  }
}
