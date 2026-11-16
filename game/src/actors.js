// actors.js — the state every fighter shares, player and bots alike:
// position, health, armour, a weapon loadout, and the damage rule. Keeping
// this in one class means combat resolves identically no matter who pulls
// the trigger.

import { WEAPONS } from './config.js';

export const BODY = {
  radius: 0.42,
  height: 1.78,
  eye: 1.62,
  crouchEye: 1.12,
  crouchHeight: 1.28,
  headCenter: 1.64,
  crouchHeadCenter: 1.14,
  headRadius: 0.24,
};

export class Loadout {
  constructor() {
    this.owned = { kestrel: true }; // everyone starts with the sidearm
    this.ammo = {};
    for (const id of Object.keys(WEAPONS)) {
      this.ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
    }
    this.current = 'kestrel';
    this.vest = false;
    this.frags = 0;
    this.cooldown = 0; // seconds until the next shot is allowed
    this.reloadLeft = 0; // seconds left in the current reload
    this.triggerHeld = false;
    this.bloom = 0; // extra spread from sustained fire, decays over time
  }

  get weapon() {
    return WEAPONS[this.current];
  }

  get state() {
    return this.ammo[this.current];
  }

  bestPrimary() {
    for (const id of ['osprey', 'halberd', 'boar', 'marten']) {
      if (this.owned[id]) return id;
    }
    return null;
  }

  equipBest() {
    const primary = this.bestPrimary();
    this.current = primary ?? 'kestrel';
    this.reloadLeft = 0;
    this.cooldown = Math.max(this.cooldown, 0.25);
  }

  switchTo(id) {
    if (!this.owned[id] || id === this.current) return false;
    this.current = id;
    this.reloadLeft = 0;
    this.cooldown = Math.max(this.cooldown, 0.3);
    return true;
  }

  startReload() {
    const w = this.weapon;
    const s = this.state;
    if (this.reloadLeft > 0 || s.mag >= w.mag || s.reserve <= 0) return false;
    this.reloadLeft = w.reloadSec;
    return true;
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.bloom > 0) this.bloom = Math.max(0, this.bloom - dt * 0.05);
    if (this.reloadLeft > 0) {
      this.reloadLeft -= dt;
      if (this.reloadLeft <= 0) {
        const w = this.weapon;
        const s = this.state;
        const need = w.mag - s.mag;
        const take = Math.min(need, s.reserve);
        s.mag += take;
        s.reserve -= take;
      }
    }
  }
}

let nextActorId = 1;

export class Actor {
  constructor(team, x, z, yaw) {
    this.id = nextActorId++;
    this.team = team;
    this.pos = { x, z };
    this.vel = { x: 0, z: 0 };
    this.yaw = yaw;
    this.pitch = 0;
    this.health = 100;
    this.armor = 0;
    this.alive = true;
    this.crouching = false;
    this.loadout = new Loadout();
    this.money = 0;
    this.kills = 0;
    this.deaths = 0;
    this.speedNow = 0; // magnitude of ground velocity, drives spread
    this.hasBomb = false;
    this.channel = null; // { kind: 'plant'|'defuse', left, total } while busy
  }

  get eyeHeight() {
    return this.crouching ? BODY.crouchEye : BODY.eye;
  }

  get height() {
    return this.crouching ? BODY.crouchHeight : BODY.height;
  }

  get headY() {
    return this.crouching ? BODY.crouchHeadCenter : BODY.headCenter;
  }

  resetForRound(spawn, money) {
    this.pos.x = spawn.x;
    this.pos.z = spawn.z;
    this.vel.x = 0;
    this.vel.z = 0;
    this.yaw = spawn.yaw;
    this.pitch = 0;
    this.health = 100;
    this.armor = this.loadout.vest ? 100 : 0;
    this.alive = true;
    this.crouching = false;
    this.channel = null;
    this.hasBomb = false;
    this.speedNow = 0;
    if (money !== undefined) this.money = money;
    // Magazines refill between rounds; reserve stays as bought.
    for (const id of Object.keys(this.loadout.ammo)) {
      this.loadout.ammo[id].mag = WEAPONS[id].mag;
    }
    this.loadout.reloadLeft = 0;
    this.loadout.cooldown = 0;
    this.loadout.equipBest();
  }

  // Apply damage with the armour rule. Returns true when this kills.
  damage(amount, attacker) {
    if (!this.alive) return false;
    let remaining = amount;
    if (this.armor > 0) {
      // The vest soaks 60% of the hit until its points run out.
      const absorbed = Math.min(this.armor, amount * 0.6);
      this.armor -= absorbed;
      remaining = amount - absorbed;
    }
    this.health -= remaining;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.deaths++;
      if (attacker && attacker !== this) attacker.kills++;
      return true;
    }
    return false;
  }
}
