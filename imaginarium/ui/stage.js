import * as T from './vendor/three.module.js';
import { buildInterior } from './interior.js';
import { Cast, bevel, finish, pipe, turning } from './artisan.js';
import { boundVolume as bookGroup } from './book-art.js';
import { allPlaces, rooms, roomAt } from './data.js';
const basic = new T.BoxGeometry(1, 1, 1);
const radians = T.MathUtils.degToRad;
const radiansFor = (list) => list.map(radians);
const geometry = new Map();
const targetMaterial = new T.MeshBasicMaterial({ visible: false });
function primitive(p, coarse = false) {
  if (p.type === 'curve')
    return pipe(p.points, p.radius, Math.min(p.points.length * (coarse ? 2 : 5), coarse ? 30 : 96));
  if (p.type === 'profile') return turning(p.profile, coarse ? 10 : 30);
  if (p.type === 'box' && !coarse) {
    const [w, h, d] = p.size,
      edge = p.bevel ?? Math.min(w, h, d) * 0.069;
    if (edge > 0) return bevel(w, h, d, edge).scale(1 / w, 1 / h, 1 / d);
  }
  if (p.type === 'mesh') {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(p.points.flat(), 3));
    g.setIndex(p.faces.flat());
    g.computeVertexNormals();
    return g;
  }
  const key = p.type + (coarse ? 'low' : 'full');
  if (!geometry.has(key))
    geometry.set(
      key,
      {
        box: () => basic,
        sphere: () => new T.SphereGeometry(0.5, coarse ? 9 : 24, coarse ? 6 : 16),
        cylinder: () => new T.CylinderGeometry(0.5, 0.5, 1, coarse ? 10 : 24),
        cone: () => new T.ConeGeometry(0.5, 1, coarse ? 10 : 24),
        torus: () => new T.TorusGeometry(0.36, 0.14, coarse ? 5 : 10, coarse ? 12 : 28)
      }[p.type]()
    );
  const geo = geometry.get(key);
  geo.userData.shared = true;
  return geo;
}
export function shapeGroup(shape, articulated = false, lights = false, coarse = false) {
  const group = new T.Group(),
    joints = [],
    anchors = [];
  shape.parts.forEach((p, i) => {
    const joint = new T.Group();
    joint.position.set(...(p.pivot || p.at));
    group.add(joint);
    joints.push(joint);
    const mesh = new T.Mesh(
      primitive(p, coarse),
      finish(p.material === 'glass' ? 'clearGlass' : p.material, p.color)
    );
    mesh.position.set(...p.at).sub(joint.position);
    mesh.scale.set(...p.size);
    mesh.rotation.set(...radiansFor(p.rot));
    mesh.userData.part = i;
    joint.add(mesh);
    anchors.push(mesh);
    if (lights && p.action === 'light' && !group.userData.lit) {
      const lamp = new T.SpotLight(p.color, 16, 6, 1.02, 0.66, 1.65);
      lamp.position.copy(mesh.position);
      lamp.target.position.set(0, -0.7, 1).applyEuler(mesh.rotation).add(mesh.position);
      joint.add(lamp, lamp.target);
      group.userData.lit = true;
    }
  });
  shape.parts.forEach((p, i) => {
    if (Number.isInteger(p.parent) && joints[p.parent]) joints[p.parent].attach(joints[i]);
  });
  if (articulated)
    shape.parts.forEach((p, i) => {
      if (p.action === 'hinge') joints[i].rotation[p.axis || 'x'] -= Math.PI * 0.4;
    });
  group.userData.anchors = anchors;
  return group;
}
export class Stage {
  constructor(canvas, events) {
    this.events = events;
    this.canvas = canvas;
    this.scene = new T.Scene();
    this.scene.background = new T.Color('#5c6151');
    this.scene.fog = new T.FogExp2('#9b876a', 0.018);
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'low-power'
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.camera = new T.PerspectiveCamera(57, 1, 0.04, 60);
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(0, 1.88, 3.7);
    this.yaw = 0;
    this.pitch = -0.12;
    this.room = 0;
    this.targets = [];
    this.dynamic = new T.Group();
    this.scene.add(this.dynamic);
    this.hand = new T.Group();
    this.camera.add(this.hand);
    this.ray = new T.Raycaster();
    this.pointer = new T.Vector2();
    this.floor = new T.Plane(new T.Vector3(0, 1, 0), 0);
    this.interior = buildInterior(this.scene);
    this.scene.add(this.camera);
    this.bind();
    this.resize();
    this.travel(0);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
  }
  invalidate() {
    if (!this.frame && !document.hidden) this.frame = requestAnimationFrame(() => this.draw());
  }
  draw() {
    this.frame = 0;
    if (this.dest) {
      const delta = this.dest.clone().sub(this.camera.position);
      const step = Math.min(0.23, delta.length() * 0.15 + 0.015);
      if (delta.length() <= step) {
        this.camera.position.copy(this.dest);
        this.dest = null;
      } else this.camera.position.addScaledVector(delta.normalize(), step);
    }
    const rain = this.room === 1 && this.rain;
    this.interior.drops.visible = rain;
    if (rain) this.interior.rainMap.offset.y = (performance.now() / 6000) % 1;
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    this.interior.visibility(this.camera, this.room);
    this.renderer.render(this.scene, this.camera);
    if (this.dest) this.invalidate();
    else if (rain && !document.querySelector('dialog[open]') && !document.hidden) {
      clearTimeout(this.rainTimer);
      this.rainTimer = setTimeout(() => this.invalidate(), 100);
    }
  }
  resize() {
    const w = this.canvas.clientWidth,
      h = this.canvas.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.72 ? 66 : 55;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }
  travel(index) {
    this.room = index;
    this.dest = null;
    this.camera.position.set(rooms[index].x + 0.78, 1.78, 3.65);
    this.yaw = 0.17;
    this.pitch = -0.13;
    this.invalidate();
  }
  sit() {
    const x = rooms[this.room].x;
    this.dest = null;
    this.camera.position.set(x + 0.85, 1.22, -0.1);
    this.yaw = 0.65;
    this.pitch = -0.08;
    this.invalidate();
  }
  focus(x, z) {
    this.dest = new T.Vector3(x, 1.72, Math.min(3.7, z + 1.28));
    this.yaw = 0;
    this.pitch = -0.33;
    this.invalidate();
  }
  look(angle) {
    this.yaw += angle;
    this.invalidate();
  }
  bind() {
    let start = null;
    this.canvas.addEventListener('pointerdown', (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      start = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false };
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!start) return;
      const dx = e.clientX - start.lastX,
        dy = e.clientY - start.lastY;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) start.moved = true;
      if (start.moved) {
        this.yaw -= dx * 0.005;
        this.pitch = T.MathUtils.clamp(this.pitch - dy * 0.004, -1, 0.83);
        this.invalidate();
      }
      start.lastX = e.clientX;
      start.lastY = e.clientY;
    });
    this.canvas.addEventListener('pointercancel', () => {
      start = null;
    });
    this.canvas.addEventListener('pointerup', (e) => {
      if (start && !start.moved) this.tap(e);
      start = null;
    });
    this.canvas.addEventListener('keydown', (e) => {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(e.key)) return;
      e.preventDefault();
      if (['ArrowLeft', 'a', 'ArrowRight', 'd'].includes(e.key))
        return this.look(['ArrowLeft', 'a'].includes(e.key) ? 0.16 : -0.16);
      const step = ['ArrowUp', 'w'].includes(e.key) ? 0.53 : -0.53;
      this.move(
        this.camera.position.x - Math.sin(this.yaw) * step,
        this.camera.position.z - Math.cos(this.yaw) * step
      );
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.invalidate();
    });
    document.addEventListener('paper-change', () => setTimeout(() => this.invalidate(), 0));
  }
  tap(event) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - r.left) / r.width) * 2 - 1,
      1 - ((event.clientY - r.top) / r.height) * 2
    );
    this.camera.updateMatrixWorld();
    this.scene.updateMatrixWorld();
    this.ray.setFromCamera(this.pointer, this.camera);
    const hit = this.ray.intersectObjects(this.targets, true)[0];
    if (hit) {
      let parent = hit.object;
      while (parent && !parent.userData.pick) parent = parent.parent;
      if (parent) {
        const p = parent.userData.pick;
        if (p.room === this.room && hit.distance < 10) {
          this.events.pick(p);
          return;
        }
      }
    }
    const pos = this.ray.ray.intersectPlane(this.floor, new T.Vector3());
    if (pos && this.ray.ray.origin.distanceTo(pos) < 14) this.move(pos.x, pos.z);
  }
  move(x, z) {
    const current = rooms[this.room].x,
      oldZ = this.camera.position.z;
    let nextX = T.MathUtils.clamp(x, -14.5, 14.5);
    if (roomAt(nextX) !== this.room && Math.min(z, oldZ) < 0.55)
      nextX = T.MathUtils.clamp(nextX, current - 4.6, current + 4.6);
    const nextRoom = roomAt(nextX);
    if (nextRoom !== this.room) {
      this.room = nextRoom;
      this.events.room(nextRoom);
    }
    this.dest = new T.Vector3(nextX, 1.76, T.MathUtils.clamp(z, -3.72, 4.15));
    this.invalidate();
  }
  destroyPicked() {
    for (const child of this.dynamic.children.slice().concat(this.hand.children.slice())) {
      child.traverse((m) => {
        if (!m.isMesh) return;
        if (m.material.userData.ownedMap) {
          m.material.map.dispose();
          m.material.dispose();
        }
        if (m.geometry !== basic && !Array.from(geometry.values()).includes(m.geometry)) m.geometry.dispose();
      });
      child.removeFromParent();
    }
    this.targets = [];
  }
  update(state, preview = null) {
    this.rain = state.weather === 'rain';
    this.destroyPicked();
    const objects = new Map(),
      places = allPlaces(state),
      visibleLights = new Set();
    for (const o of state.objects.concat(preview ? [preview] : [])) {
      const allow = visibleLights.size < 4 && o.room === this.room && o.on !== false;
      const full = shapeGroup(o.shape, !!o.open, allow);
      if (full.userData.lit) visibleLights.add(o.id);
      let group = full;
      if (o.shape.parts.length > 12) {
        group = new T.LOD();
        group.addLevel(full, 0);
        // A far chair must retain its feet and back. Reduce tessellation and batch by
        // material without dropping structural parts or detaching a hinged assembly.
        const detail = shapeGroup(o.shape, !!o.open, false, true),
          cast = new Cast();
        detail.updateMatrixWorld(true);
        detail.traverse((node) => {
          if (node.isMesh) {
            cast.add(node.geometry.clone().applyMatrix4(node.matrixWorld), node.material);
            if (!node.geometry.userData.shared) node.geometry.dispose();
          }
        });
        const coarse = cast.meshes();
        group.addLevel(coarse, 6.8);
      }
      group.position.set(o.x, o.y, o.z);
      group.rotation.y = radians(o.angle || 0);
      group.scale.setScalar(o.scale || 1);
      group.userData.pick = { kind: 'object', id: o.id, room: o.room };
      this.dynamic.add(group);
      this.targets.push(group);
      objects.set(o.id, group);
    }
    const groups = new Map();
    for (const b of state.books) {
      if (state.held === b.id) continue;
      const key = b.place || 'hall-desk';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(b);
    }
    for (const [key, books] of groups) {
      const p = places.find((v) => v.id === key) || places[1];
      books.sort((a, b) => (a.position || 0) - (b.position || 0));
      books.forEach((b, i) => {
        const group = bookGroup(b);
        if (p.parent) {
          const existing = state.objects.find((o) => o.id === p.parent),
            part = existing.shape.parts[p.part],
            parent = objects.get(p.parent);
          const anchors = parent.userData.anchors || parent.levels?.[0]?.object.userData.anchors,
            anchor = anchors[p.part];
          const perRow = Math.max(1, Math.floor((part.size[0] * existing.scale) / 0.44)),
            column = i % perRow;
          const pos = new T.Vector3(
            ((column - (perRow - 1) / 2) * 0.41) / (part.size[0] * existing.scale),
            0.5 + (0.05 + Math.floor(i / perRow) * 0.079) / (part.size[1] * existing.scale),
            0
          );
          anchor.updateWorldMatrix(true, false);
          anchor.localToWorld(pos);
          group.position.copy(pos);
          group.rotation.y = parent.rotation.y;
        } else if (p.shelf) {
          const slots = Math.min(5, Math.max(3, books.length)),
            spacing = 2.0 / slots;
          group.position.set(
            p.x + (((i + 1) % slots) - (slots - 1) / 2) * spacing,
            p.y + 0.389 + Math.floor(i / slots) * 0.115,
            p.z + 0.11
          );
          group.rotation.x = 1.4;
          group.rotation.y = 0.025 * (i % 2 ? 1 : -1);
          group.scale.set(Math.min(1.34, spacing / 0.43), 1.3, 1.32);
        } else {
          group.position.set(p.x + ((i % 3) - 1) * 0.48, p.y + 0.05 + Math.floor(i / 3) * 0.081, p.z + 0.12);
          group.rotation.y = ((i % 3) - 1) * 0.08;
        }
        group.userData.pick = { kind: 'book', id: b.id, room: p.room };
        this.dynamic.add(group);
        this.targets.push(group);
      });
    }
    for (const p of places.filter((p) => !p.parent)) {
      const proxy = new T.Mesh(basic, targetMaterial);
      proxy.scale.set(1.9, 0.15, 0.65);
      proxy.position.set(p.x, p.y - 0.095, p.z);
      proxy.userData.pick = { kind: 'place', id: p.id, room: p.room };
      this.dynamic.add(proxy);
      this.targets.push(proxy);
    }
    for (const x of [-2.55, 2.55]) {
      const stacks = new T.Mesh(basic, targetMaterial);
      stacks.scale.set(3.7, 3.2, 0.55);
      stacks.position.set(x, 1.61, -3.66);
      stacks.userData.pick = { kind: 'stacks', room: 0, x, z: -3.2 };
      this.dynamic.add(stacks);
      this.targets.push(stacks);
    }
    for (const [i, ex] of state.exhibits.entries()) {
      const card = bookGroup({ title: ex.name, color: '#a48a5c' }),
        place = places.find((p) => p.room === ex.room && !p.shelf && !p.parent);
      card.position.set(place.x + 0.65 - (i % 3) * 0.23, place.y + 0.16, place.z + 0.33);
      card.scale.set(0.55, 0.65, 0.56);
      card.rotation.x = 1.12;
      card.userData.pick = { kind: 'exhibit', id: ex.id, room: ex.room };
      this.dynamic.add(card);
      this.targets.push(card);
    }
    const held = state.books.find((b) => b.id === state.held);
    if (held) {
      const book = bookGroup(held);
      book.rotation.set(0.77, -0.14, -0.17);
      book.scale.setScalar(0.52);
      book.position.set(0.13, -0.2, -0.53);
      this.hand.add(book);
    }
    this.invalidate();
  }
}
