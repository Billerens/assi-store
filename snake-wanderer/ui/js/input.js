// Управление: виртуальный джойстик, свайп камеры, клавиатура.
export class Input {
  constructor(game) {
    this.G = game; this.jx = 0; this.jy = 0; this.keys = {}; this.camDX = 0; this.dash = false; this.whip = false; this.accept = false; this.item = false;
    this.joy = document.getElementById('joy'); this.knob = document.getElementById('knob');
    this.joyId = null; this.camId = null; this.camX = 0; this.cx = 0; this.cy = 0;
    const canvas = document.getElementById('c');

    canvas.addEventListener('pointerdown', (e) => {
      game.sound.init();
      if (game.state !== 'play') return;
      const left = e.clientX < innerWidth * 0.45 && e.clientY > innerHeight * 0.35;
      if (left && this.joyId === null && e.pointerType !== 'mouse') {
        this.joyId = e.pointerId; this.cx = e.clientX; this.cy = e.clientY;
        this.joy.style.left = e.clientX + 'px'; this.joy.style.top = e.clientY + 'px'; this.joy.classList.add('on');
      } else if (this.camId === null) { this.camId = e.pointerId; this.camX = e.clientX; }
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.joyId) {
        let dx = e.clientX - this.cx, dy = e.clientY - this.cy;
        const d = Math.hypot(dx, dy), R = 56;
        if (d > R) { dx *= R / d; dy *= R / d; }
        this.jx = dx / R; this.jy = dy / R;
        this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      } else if (e.pointerId === this.camId) { this.camDX += e.clientX - this.camX; this.camX = e.clientX; }
    });
    const up = (e) => {
      if (e.pointerId === this.joyId) { this.joyId = null; this.jx = this.jy = 0; this.knob.style.transform = ''; this.joy.classList.remove('on'); }
      if (e.pointerId === this.camId) this.camId = null;
    };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true; game.sound.init();
      if (e.code === 'Space') { this.dash = true; e.preventDefault(); }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.whip = true;
      if (e.code === 'KeyE' || e.code === 'Enter') this.accept = true;
      if (e.code === 'KeyQ' || e.code === 'KeyF') this.item = true;
      if (e.code === 'Escape' || e.code === 'KeyP') game.act('pause');
      if (e.code === 'Tab' || e.code === 'KeyM') { e.preventDefault(); game.act('hub', 'map'); }
    });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; });
    const btn = (id, key) => document.getElementById(id).addEventListener('pointerdown', (e) => { e.preventDefault(); game.sound.init(); this[key] = true; });
    btn('b-dash', 'dash'); btn('b-whip', 'whip'); btn('b-item', 'item');
  }

  /** Вектор движения в осях экрана: x — вправо, y — вверх; длина 0..1. */
  move() {
    const k = this.keys;
    let x = this.jx, y = -this.jy;
    if (k.KeyA || k.ArrowLeft) x -= 1;
    if (k.KeyD || k.ArrowRight) x += 1;
    if (k.KeyW || k.ArrowUp) y += 1;
    if (k.KeyS || k.ArrowDown) y -= 1;
    const d = Math.hypot(x, y);
    if (d > 1) { x /= d; y /= d; }
    return { x, y, mag: Math.min(1, d) };
  }

  /** Одноразовые нажатия: прочитать и сбросить. */
  take(key) { const v = this[key]; this[key] = false; return v; }
  takeCam() { const v = this.camDX; this.camDX = 0; return v; }
  reset() { this.jx = this.jy = 0; this.joyId = null; this.dash = this.whip = this.accept = this.item = false; this.knob.style.transform = ''; this.joy.classList.remove('on'); }
}
