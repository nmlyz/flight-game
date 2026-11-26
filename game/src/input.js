// Keyboard and mouse input. Arrows fly the plane, W/S work the throttle,
// A/D the rudder, G the gear, F the flaps, C the camera, M the sound.
// The mouse steers too: hold the left button and the plane banks toward it.

export class InputState {
  constructor() {
    this.keys = new Set();
    this.pitch = 0;       // -1..1, positive = pull up
    this.roll = 0;        // -1..1, positive = bank right
    this.yaw = 0;         // -1..1, positive = rudder right
    this.throttleUp = false;
    this.throttleDown = false;
    this.mouseSteer = 0;  // -1..1 from pointer position
    this.mouseActive = false;
    this.pressed = new Set(); // edge-triggered keys, consumed by the game
    this.anyKey = false;
  }

  attach(canvas) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      this.anyKey = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('pointerdown', (e) => {
      this.mouseActive = true;
      this.updateMouse(e);
    });
    window.addEventListener('pointerup', () => { this.mouseActive = false; this.mouseSteer = 0; });
    window.addEventListener('pointermove', (e) => { if (this.mouseActive) this.updateMouse(e); });
  }

  updateMouse(e) {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    this.mouseSteer = Math.max(-1, Math.min(1, x));
  }

  poll() {
    const k = this.keys;
    // ArrowUp pulls the nose up (arcade feel); arrows own pitch, W/S own throttle.
    this.pitch = (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0);
    this.roll = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
    if (this.mouseActive) this.roll = this.mouseSteer;
    this.yaw = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    this.throttleUp = k.has('KeyW') || k.has('ShiftLeft');
    this.throttleDown = k.has('KeyS');
  }

  take(code) {
    if (this.pressed.has(code)) { this.pressed.delete(code); return true; }
    return false;
  }

  clearPressed() { this.pressed.clear(); }
}
