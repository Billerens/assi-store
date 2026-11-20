// The stick and looking surface each own a pointer, so a player can walk and
// turn simultaneously. Mouse drag also works in WebViews without pointer lock.
export class ShipControls {
  constructor(canvas, pad, buttons, active, piloting) {
    this.canvas = canvas;
    this.pad = pad;
    this.buttons = buttons;
    this.keys = new Set();
    this.holds = new Map();
    this.clear();

    pad.addEventListener('pointerdown', event => {
      if (!active() || this.stickId !== null || event.button > 0) return;
      this.stickId = event.pointerId;
      const rect = pad.getBoundingClientRect();
      this.center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, radius: rect.width * .38 };
      pad.setPointerCapture(event.pointerId);
      this.stick(event);
      event.preventDefault();
    });
    pad.addEventListener('pointermove', event => this.stick(event));
    const liftStick = event => {
      if (this.stickId !== event.pointerId) return;
      this.stickId = null;
      this.x = this.y = 0;
      pad.firstElementChild.style.transform = '';
    };
    for (const name of ['pointerup','pointercancel','lostpointercapture']) pad.addEventListener(name,liftStick);

    canvas.addEventListener('pointerdown', event => {
      if (!active() || event.button > 0) return;
      if (document.pointerLockElement === canvas) {
        if (piloting()) this.holds.set('fire',event.pointerId);
        return;
      }
      if (this.lookId !== null) return;
      this.lookId = event.pointerId;
      this.previous = [event.clientX,event.clientY];
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    canvas.addEventListener('pointermove', event => {
      if (this.lookId !== event.pointerId || document.pointerLockElement === canvas) return;
      this.dx += event.clientX - this.previous[0];
      this.dy += event.clientY - this.previous[1];
      this.previous = [event.clientX,event.clientY];
    });
    const endLook = event => {
      if (this.lookId === event.pointerId) this.lookId = null;
      if (this.holds.get('fire') === event.pointerId) this.holds.delete('fire');
    };
    for (const name of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(name,endLook);
    canvas.addEventListener('dblclick', () => {
      if (!active() || !matchMedia('(pointer:fine)').matches) return;
      try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* Drag remains available. */ }
    });
    document.addEventListener('mousemove', event => {
      if (active() && document.pointerLockElement === canvas) { this.dx += event.movementX; this.dy += event.movementY; }
    });
    document.addEventListener('pointerlockchange', () => { this.lookId = null; this.holds.delete('fire'); });
    for (const button of buttons) {
      button.addEventListener('pointerdown', event => {
        if (!active()) return;
        button.setPointerCapture(event.pointerId);
        this.holds.set(button.id,event.pointerId);
        button.classList.add('held');
        event.preventDefault();
      });
      const release = event => {
        if (this.holds.get(button.id) !== event.pointerId) return;
        this.holds.delete(button.id);
        button.classList.remove('held');
      };
      for (const name of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(name,release);
    }
    const movement = new Set(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','KeyW','KeyA','KeyS','KeyD',
      'Space','ShiftLeft','ShiftRight']);
    addEventListener('keydown', event => {
      if (!active() || !movement.has(event.code) || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault(); this.keys.add(event.code);
    });
    addEventListener('keyup', event => this.keys.delete(event.code));
  }
  stick(event) {
    if (this.stickId !== event.pointerId) return;
    const dx = event.clientX - this.center.x, dy = event.clientY - this.center.y;
    const radius = Math.max(this.center.radius, Math.hypot(dx,dy), 1);
    this.x = dx / radius; this.y = dy / radius;
    this.pad.firstElementChild.style.transform = 'translate('+this.x*25+'px,'+this.y*25+'px)';
  }
  axis(positive,negative) { return Number(this.keys.has(positive)) - Number(this.keys.has(negative)); }
  look() {
    const delta = { x: this.dx, y: this.dy };
    this.dx = this.dy = 0;
    return delta;
  }
  held(name, key) { return this.holds.has(name) || this.keys.has(key); }
  clear() {
    this.keys.clear(); this.holds.clear();
    this.lookId = this.stickId = null;
    this.x = this.y = this.dx = this.dy = 0;
    this.pad.firstElementChild.style.transform = '';
    for (const button of this.buttons) button.classList.remove('held');
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }
}
