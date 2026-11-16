// input.js — keyboard and mouse state, plus pointer lock. The simulation
// polls this module each fixed step; edge-triggered actions (reload, buy
// keys, plant) are consumed through `pressed()` so a held key fires once.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressedSet = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.mousePressed = false;
    this.rightDown = false;
    this.locked = false;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressedSet.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
      this.rightDown = false;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) {
        this.mouseDown = true;
        this.mousePressed = true;
      }
      if (e.button === 2) this.rightDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.rightDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) {
        this.mouseDown = false;
        this.rightDown = false;
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
  }

  lock() {
    this.canvas.requestPointerLock();
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(code) {
    return this.keys.has(code);
  }

  // Edge-triggered: true once per physical press.
  pressed(code) {
    return this.pressedSet.has(code);
  }

  // Called by the game at the end of each rendered frame: clears the edges
  // and the accumulated mouse motion.
  flushFrame() {
    this.pressedSet.clear();
    this.mousePressed = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
