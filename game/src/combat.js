// combat.js — shooting and grenades, resolved the same way for the player
// and the bots. A shot is a ray from the shooter's eye: it is tested against
// the map's colliders (a wall blocks when it is taller than the ray at the
// crossing point) and against every enemy's body capsule and head sphere.
// Spread grows with movement, air-time bloom and sustained fire, and shrinks
// when crouched — accuracy is a decision, not a dice roll you ignore.

import { BODY } from './actors.js';
import { GEAR } from './config.js';
import { segmentHitsBox } from './util.js';

export function dirFromYawPitch(yaw, pitch) {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

// Cast one bullet. Returns { kind: 'actor'|'wall'|'none', actor?, part?,
// dist, x, y, z } — the impact point is filled for walls and actors.
export function castBullet(world, actors, shooter, ox, oy, oz, dx, dy, dz, maxDist) {
  let bestDist = maxDist;
  let best = { kind: 'none', dist: maxDist, x: ox + dx * maxDist, y: oy + dy * maxDist, z: oz + dz * maxDist };

  // Walls: work in the ground plane, then check the ray's height where it
  // crosses the box.
  for (let i = 0; i < world.colliders.length; i++) {
    const c = world.colliders[i];
    const t = segmentHitsBox(ox, oz, ox + dx * bestDist, oz + dz * bestDist, c);
    if (t === Infinity) continue;
    const dist = t * bestDist;
    const yAt = oy + dy * dist;
    if (yAt < 0 || yAt > c.h) continue; // passes over (or under) this block
    bestDist = dist;
    best = { kind: 'wall', dist, x: ox + dx * dist, y: yAt, z: oz + dz * dist };
  }

  // Actors: closest approach of the ray to the body's vertical segment and
  // to the head sphere.
  for (const a of actors) {
    if (!a.alive || a === shooter || a.team === shooter.team) continue;
    const rx = a.pos.x - ox;
    const rz = a.pos.z - oz;
    const along = rx * dx + rz * dz;
    if (along < 0.5 || along > bestDist) continue;
    const px = ox + dx * along;
    const pz = oz + dz * along;
    const sideDist = Math.hypot(a.pos.x - px, a.pos.z - pz);
    const yAt = oy + dy * along;
    // Head sphere first: it is the smaller, better target.
    const headDy = yAt - a.headY;
    if (sideDist < BODY.headRadius && Math.abs(headDy) < BODY.headRadius) {
      bestDist = along;
      best = { kind: 'actor', actor: a, part: 'head', dist: along, x: px, y: yAt, z: pz };
      continue;
    }
    if (sideDist < BODY.radius && yAt > 0.05 && yAt < a.height) {
      bestDist = along;
      best = { kind: 'actor', actor: a, part: 'body', dist: along, x: px, y: yAt, z: pz };
    }
  }
  return best;
}

function falloff(weapon, dist) {
  const half = weapon.range * 0.5;
  if (dist <= half) return 1;
  if (dist >= weapon.range) return 0.5;
  return 1 - 0.5 * ((dist - half) / half);
}

// Attempt to fire the actor's current weapon once. Handles ammo, cooldown,
// spread, damage, tracers, noise and hit feedback. `aim` is the direction
// the actor is looking (yaw/pitch on the actor). Returns true when a shot
// actually left the barrel.
export function tryFire(game, actor, wantFire) {
  const loadout = actor.loadout;
  const w = loadout.weapon;
  if (!actor.alive || actor.channel) return false;
  if (loadout.reloadLeft > 0) return false;
  if (!wantFire) {
    loadout.triggerHeld = false;
    return false;
  }
  if (w.fireMode === 'semi' && loadout.triggerHeld) return false;
  if (loadout.cooldown > 0) return false;
  const state = loadout.state;
  if (state.mag <= 0) {
    if (!loadout.triggerHeld) game.sounds.dryFire();
    loadout.triggerHeld = true;
    loadout.cooldown = 0.3;
    if (!actor.isPlayer) loadout.startReload();
    return false;
  }
  loadout.triggerHeld = true;
  loadout.cooldown = 60 / w.rpm;
  state.mag--;

  // Spread: base * movement factor * bloom, halved when crouched.
  const moveFactor = 1 + actor.speedNow * 0.55;
  const crouchFactor = actor.crouching ? 0.55 : 1;
  const spread = w.spread * moveFactor * crouchFactor + loadout.bloom;
  loadout.bloom = Math.min(0.02, loadout.bloom + 0.0022);
  if (actor.isPlayer) actor.recoil = Math.min(6, actor.recoil + (loadout.current === 'osprey' ? 5 : 1.4));

  const eye = actor.eyeHeight;
  const rng = game.rng;
  let anyHit = null;
  for (let p = 0; p < w.pellets; p++) {
    const yaw = actor.yaw + (rng() * 2 - 1) * spread;
    const pitch = actor.pitch + (rng() * 2 - 1) * spread;
    const dir = dirFromYawPitch(yaw, pitch);
    const hit = castBullet(game.world, game.actors, actor, actor.pos.x, eye, actor.pos.z, dir.x, dir.y, dir.z, w.range * 1.6);
    game.events.push({
      type: 'tracer',
      x0: actor.pos.x + dir.x * 0.6, y0: eye - 0.08, z0: actor.pos.z + dir.z * 0.6,
      x1: hit.x, y1: hit.y, z1: hit.z,
      team: actor.team,
    });
    if (hit.kind === 'actor') {
      const dmg = w.damage * (hit.part === 'head' ? w.headMult : 1) * falloff(w, hit.dist);
      const killed = hit.actor.damage(Math.round(dmg), actor);
      anyHit = { actor: hit.actor, part: hit.part, killed };
      if (hit.actor.isPlayer) game.events.push({ type: 'playerHurt', fromX: actor.pos.x, fromZ: actor.pos.z });
      if (killed) {
        actor.money = Math.min(16000, actor.money + 300);
        game.events.push({ type: 'kill', killer: actor, victim: hit.actor, headshot: hit.part === 'head' });
      }
    } else if (hit.kind === 'wall') {
      game.events.push({ type: 'impact', x: hit.x, y: hit.y, z: hit.z });
    }
  }
  game.sounds.shot(loadout.current === 'osprey' ? 'sniper' : loadout.current === 'boar' ? 'shotgun' : loadout.current === 'marten' ? 'smg' : 'rifle');
  game.events.push({ type: 'muzzle', actor });
  game.onNoise(actor.pos.x, actor.pos.z, actor.team);
  if (anyHit && actor.isPlayer) game.events.push({ type: 'hitmarker', head: anyHit.part === 'head', killed: anyHit.killed });
  if (state.mag === 0 && !actor.isPlayer) loadout.startReload();
  return true;
}

// --------------------------------------------------------------- grenades

export class Grenade {
  constructor(x, y, z, vx, vy, vz, owner) {
    this.pos = { x, y, z };
    this.vel = { x: vx, y: vy, z: vz };
    this.fuse = GEAR.frag.fuseSec;
    this.owner = owner;
    this.dead = false;
  }
}

export function throwGrenade(game, actor) {
  const loadout = actor.loadout;
  if (loadout.frags <= 0 || !actor.alive || actor.channel) return false;
  loadout.frags--;
  const dir = dirFromYawPitch(actor.yaw, actor.pitch + 0.18);
  const speed = 15;
  const g = new Grenade(
    actor.pos.x, actor.eyeHeight, actor.pos.z,
    dir.x * speed, Math.max(2.5, dir.y * speed), dir.z * speed,
    actor,
  );
  game.grenades.push(g);
  game.sounds.throwWhoosh();
  return true;
}

export function updateGrenades(game, dt) {
  const { colliders } = game.world;
  for (const g of game.grenades) {
    if (g.dead) continue;
    g.fuse -= dt;
    g.vel.y -= 18 * dt;
    let nx = g.pos.x + g.vel.x * dt;
    let nz = g.pos.z + g.vel.z * dt;
    let ny = g.pos.y + g.vel.y * dt;
    // Bounce off walls (ground plane) and the floor, losing energy.
    for (const c of colliders) {
      if (nx > c.minX - 0.1 && nx < c.maxX + 0.1 && nz > c.minZ - 0.1 && nz < c.maxZ + 0.1 && ny < c.h) {
        if (g.pos.x <= c.minX - 0.1 || g.pos.x >= c.maxX + 0.1) g.vel.x *= -0.45;
        else if (g.pos.z <= c.minZ - 0.1 || g.pos.z >= c.maxZ + 0.1) g.vel.z *= -0.45;
        nx = g.pos.x + g.vel.x * dt;
        nz = g.pos.z + g.vel.z * dt;
      }
    }
    if (ny < 0.12) {
      ny = 0.12;
      g.vel.y = Math.abs(g.vel.y) > 1 ? -g.vel.y * 0.4 : 0;
      g.vel.x *= 0.7;
      g.vel.z *= 0.7;
    }
    g.pos.x = nx;
    g.pos.y = ny;
    g.pos.z = nz;
    if (g.fuse <= 0) {
      g.dead = true;
      explode(game, g);
    }
  }
  game.grenades = game.grenades.filter((g) => !g.dead);
}

function explode(game, g) {
  game.sounds.explosion();
  game.events.push({ type: 'explosion', x: g.pos.x, y: g.pos.y + 0.3, z: g.pos.z });
  game.onNoise(g.pos.x, g.pos.z, null);
  const { radius, damage } = GEAR.frag;
  for (const a of game.actors) {
    if (!a.alive) continue;
    const d = Math.hypot(a.pos.x - g.pos.x, a.pos.z - g.pos.z);
    if (d > radius) continue;
    // Cover helps: a tall-enough block between the blast and the actor
    // halves the damage.
    let cover = 1;
    for (const c of game.world.colliders) {
      if (c.h < 1.0) continue;
      const t = segmentHitsBox(g.pos.x, g.pos.z, a.pos.x, a.pos.z, c);
      if (t !== Infinity && t > 0.02 && t < 0.98) { cover = 0.45; break; }
    }
    const amount = Math.round(damage * (1 - d / radius) * cover) + (d < 1.2 ? 25 : 0);
    if (amount <= 0) continue;
    const killed = a.damage(amount, g.owner);
    if (a.isPlayer) game.events.push({ type: 'playerHurt', fromX: g.pos.x, fromZ: g.pos.z });
    if (killed) game.events.push({ type: 'kill', killer: g.owner, victim: a, headshot: false });
  }
}


