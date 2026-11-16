// bots.js — the fighters on both teams. A bot perceives (sight with a field
// of view, plus gunfire noise), remembers last-seen positions, follows the
// waypoint graph to its objective, holds angles when defending, plants and
// defuses the charge, and fights with the same weapons and damage rules as
// the player — bursts, reaction time and aim error scaled by its skill.

import * as THREE from 'three';
import { Actor, BODY } from './actors.js';
import { TEAM, WEAPONS } from './config.js';
import { tryFire } from './combat.js';
import { angleLerp, clamp, dist2D, lineBlocked, moveWithCollision } from './util.js';
import { findPath } from './world.js';

export const BOT_NAMES = {
  warden: ['Vex', 'Moss', 'Hale', 'Ilsa'],
  jackal: ['Rook', 'Sable', 'Dune', 'Pyre', 'Kett'],
};

const SIGHT_RANGE = 68;
const SIGHT_BLOCK_H = 1.45; // cover at least this tall hides a standing fighter
const BOT_SPEED = 4.7;

export function buildBotMesh(team) {
  const group = new THREE.Group();
  const suit = new THREE.MeshLambertMaterial({ color: team === TEAM.WARDEN ? 0x2e7f7a : 0xb45a32 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x33373d });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a37e });
  const legGeo = new THREE.BoxGeometry(0.16, 0.78, 0.2);
  const legL = new THREE.Mesh(legGeo, dark);
  legL.position.set(-0.13, 0.39, 0);
  const legR = new THREE.Mesh(legGeo, dark);
  legR.position.set(0.13, 0.39, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.68, 0.3), suit);
  torso.position.set(0, 1.12, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skin);
  head.position.set(0, 1.66, 0);
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.34), suit);
  helmet.position.set(0, 1.82, 0);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.72), dark);
  gun.position.set(0.18, 1.32, -0.3);
  group.add(legL, legR, torso, head, helmet, gun);
  return { group, legL, legR, torso, head };
}

export class Bot extends Actor {
  constructor(team, spawn, name, skill) {
    super(team, spawn.x, spawn.z, spawn.yaw);
    this.isPlayer = false;
    this.name = name;
    this.skill = skill; // 0..1 — reaction time and aim error scale with it
    this.mesh = null;
    // Brain state.
    this.state = 'advance';
    this.role = 'holder'; // carrier | escort | lurk | holder | rotator
    this.site = null; // target site object for attackers
    this.post = null; // {x, z, yaw} hold position for defenders
    this.goal = null; // {x, z} current movement goal
    this.path = null;
    this.pathIdx = 0;
    this.target = null;
    this.lastSeen = null; // {x, z, age}
    this.reactionLeft = 0;
    this.thinkLeft = Math.random() * 0.1;
    this.burstLeft = 0;
    this.burstPause = 0;
    this.strafeDir = 1;
    this.strafeLeft = 0;
    this.scanLeft = 0;
    this.deathTime = 0;
    this.investigate = null;
  }

  resetForRound(spawn, money) {
    super.resetForRound(spawn, money);
    this.state = 'advance';
    this.target = null;
    this.lastSeen = null;
    this.path = null;
    this.investigate = null;
    this.deathTime = 0;
    if (this.mesh) {
      this.mesh.group.rotation.set(0, this.yaw, 0);
      this.mesh.group.visible = true;
    }
  }

  // ---- perception -------------------------------------------------------
  perceive(game) {
    let best = null;
    let bestDist = Infinity;
    for (const other of game.actors) {
      if (!other.alive || other.team === this.team) continue;
      const d = dist2D(this.pos.x, this.pos.z, other.pos.x, other.pos.z);
      if (d > SIGHT_RANGE) continue;
      // Field of view: 120 degrees, waived at conversational distance.
      if (d > 9) {
        const toA = Math.atan2(-(other.pos.x - this.pos.x), -(other.pos.z - this.pos.z));
        let diff = Math.abs(((toA - this.yaw) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
        if (diff > 2.1) continue;
      }
      if (lineBlocked(game.world.colliders, this.pos.x, this.pos.z, other.pos.x, other.pos.z, SIGHT_BLOCK_H)) continue;
      if (d < bestDist) {
        bestDist = d;
        best = other;
      }
    }
    if (best) {
      if (this.target !== best) this.reactionLeft = 0.24 + (1 - this.skill) * 0.38;
      this.target = best;
      this.lastSeen = { x: best.pos.x, z: best.pos.z, age: 0 };
    } else {
      this.target = null;
    }
    // Gunfire noise: fresh enemy noise nearby becomes an investigate point.
    const noise = game.recentNoise(this);
    if (noise && !this.target) this.investigate = { x: noise.x, z: noise.z };
  }

  // ---- movement ---------------------------------------------------------
  steerTo(game, dt, tx, tz, arriveDist = 1.1) {
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < arriveDist) {
      this.vel.x = 0;
      this.vel.z = 0;
      this.speedNow = 0;
      return true;
    }
    const vx = (dx / d) * BOT_SPEED;
    const vz = (dz / d) * BOT_SPEED;
    this.vel.x = vx;
    this.vel.z = vz;
    this.speedNow = BOT_SPEED;
    if (!this.target) {
      const face = Math.atan2(-vx, -vz);
      this.yaw = angleLerp(this.yaw, face, Math.min(1, dt * 8));
    }
    moveWithCollision(game.world.colliders, this.pos, vx * dt, vz * dt, BODY.radius);
    return false;
  }

  followPathTo(game, dt, tx, tz) {
    if (!this.path || this.pathIdx >= this.path.length) {
      const path = findPath(game.world.graph, this.pos.x, this.pos.z, tx, tz);
      this.path = path;
      this.pathIdx = 0;
      if (!path) return this.steerTo(game, dt, tx, tz);
    }
    const nodes = game.world.graph.nodes;
    // Skip nodes already reached; steer at the current one, or at the goal
    // itself once the last node is behind us.
    while (this.pathIdx < this.path.length) {
      const n = nodes[this.path[this.pathIdx]];
      if (dist2D(this.pos.x, this.pos.z, n.x, n.z) < 1.4) this.pathIdx++;
      else break;
    }
    if (this.pathIdx >= this.path.length) return this.steerTo(game, dt, tx, tz);
    const n = nodes[this.path[this.pathIdx]];
    this.steerTo(game, dt, n.x, n.z, 0.6);
    return false;
  }

  setGoal(x, z) {
    if (!this.goal || Math.abs(this.goal.x - x) > 2 || Math.abs(this.goal.z - z) > 2) {
      this.goal = { x, z };
      this.path = null;
    }
  }

  // ---- the brain ----------------------------------------------------------
  update(game, dt) {
    if (!this.alive) {
      this.deathTime += dt;
      return;
    }
    this.loadout.update(dt);
    if (this.lastSeen) this.lastSeen.age += dt;
    if (this.reactionLeft > 0) this.reactionLeft -= dt;
    if (this.channel) {
      this.vel.x = 0;
      this.vel.z = 0;
      this.speedNow = 0;
      return; // busy planting or defusing; round.js runs the channel
    }
    this.thinkLeft -= dt;
    if (this.thinkLeft <= 0) {
      this.thinkLeft = 0.1;
      this.perceive(game);
      this.decide(game);
    }
    this.act(game, dt);
  }

  decide(game) {
    const round = game.round;
    // Bomb planted: defenders converge, attackers guard the charge.
    if (round.bombState === 'planted') {
      if (this.team === TEAM.WARDEN) {
        this.state = 'defuse';
        this.setGoal(round.bombPos.x, round.bombPos.z);
      } else {
        this.state = 'guard';
        this.setGoal(round.bombPos.x + (this.id % 3 - 1) * 4, round.bombPos.z + ((this.id + 1) % 3 - 1) * 4);
      }
      return;
    }
    if (this.target) {
      this.state = 'engage';
      return;
    }
    if (this.team === TEAM.JACKAL) {
      if (round.bombState === 'dropped' && !this.hasBomb) {
        // The charge is on the ground: the nearest Jackals go and get it.
        this.state = 'advance';
        this.setGoal(round.bombPos.x, round.bombPos.z);
      } else if (this.hasBomb) {
        this.state = 'plant-push';
        this.setGoal(this.site.x, this.site.z);
      } else if (this.role === 'escort') {
        const carrier = game.actors.find((a) => a.hasBomb && a.alive);
        if (carrier) {
          this.state = 'advance';
          this.setGoal(carrier.pos.x, carrier.pos.z);
        }
      } else if (this.role === 'lurk') {
        this.state = this.investigate ? 'investigate' : 'hold';
        if (this.post) this.setGoal(this.post.x, this.post.z);
      }
      return;
    }
    // Wardens.
    if (this.investigate && this.role !== 'holder') {
      this.state = 'investigate';
      this.setGoal(this.investigate.x, this.investigate.z);
    } else if (this.lastSeen && this.lastSeen.age < 4) {
      this.state = 'investigate';
      this.setGoal(this.lastSeen.x, this.lastSeen.z);
    } else {
      this.state = 'hold';
      if (this.post) this.setGoal(this.post.x, this.post.z);
    }
  }

  act(game, dt) {
    const round = game.round;
    switch (this.state) {
      case 'engage': {
        const t = this.target;
        if (!t || !t.alive) {
          this.state = 'advance';
          break;
        }
        const d = dist2D(this.pos.x, this.pos.z, t.pos.x, t.pos.z);
        // Aim: chest height, error shrinking the longer the target is tracked.
        const aimErr = (1 - this.skill) * 0.05 + Math.max(0, this.reactionLeft) * 0.1;
        const targetYaw = Math.atan2(-(t.pos.x - this.pos.x), -(t.pos.z - this.pos.z));
        this.yaw = angleLerp(this.yaw, targetYaw + (game.rng() * 2 - 1) * aimErr, Math.min(1, dt * 10));
        const dy = (t.height * 0.62) - this.eyeHeight;
        this.pitch = Math.atan2(dy, Math.max(1, d)) + (game.rng() * 2 - 1) * aimErr * 0.5;
        // Strafe while fighting; close or open distance toward the band.
        this.strafeLeft -= dt;
        if (this.strafeLeft <= 0) {
          this.strafeLeft = 0.6 + game.rng() * 0.9;
          this.strafeDir = game.rng() < 0.5 ? -1 : 1;
        }
        const perpX = Math.cos(this.yaw) * this.strafeDir;
        const perpZ = -Math.sin(this.yaw) * this.strafeDir;
        let radial = 0;
        if (d > 30) radial = 1;
        else if (d < 8) radial = -0.7;
        const fwdX = -Math.sin(this.yaw);
        const fwdZ = -Math.cos(this.yaw);
        const vx = (perpX * 0.8 + fwdX * radial) * BOT_SPEED * 0.72;
        const vz = (perpZ * 0.8 + fwdZ * radial) * BOT_SPEED * 0.72;
        this.vel.x = vx;
        this.vel.z = vz;
        this.speedNow = Math.hypot(vx, vz);
        moveWithCollision(game.world.colliders, this.pos, vx * dt, vz * dt, BODY.radius);
        // Fire control: bursts with pauses, only after the reaction delay.
        if (this.reactionLeft <= 0) {
          if (this.burstPause > 0) {
            this.burstPause -= dt;
          } else {
            if (this.burstLeft <= 0) this.burstLeft = 3 + Math.floor(game.rng() * 3);
            if (tryFire(game, this, true)) {
              this.burstLeft--;
              if (this.burstLeft <= 0) this.burstPause = 0.28 + game.rng() * 0.4;
            } else if (this.loadout.state.mag === 0) {
              this.loadout.startReload();
            }
          }
        }
        break;
      }
      case 'plant-push': {
        const arrived = this.followPathTo(game, dt, this.site.x, this.site.z);
        if (arrived || dist2D(this.pos.x, this.pos.z, this.site.x, this.site.z) < this.site.r - 1.5) {
          this.vel.x = 0;
          this.vel.z = 0;
          this.speedNow = 0;
          game.tryPlant(this);
        }
        break;
      }
      case 'defuse': {
        const arrived = this.followPathTo(game, dt, round.bombPos.x, round.bombPos.z);
        if (arrived || dist2D(this.pos.x, this.pos.z, round.bombPos.x, round.bombPos.z) < 1.7) {
          this.vel.x = 0;
          this.vel.z = 0;
          this.speedNow = 0;
          game.tryDefuse(this);
        }
        break;
      }
      case 'hold': {
        if (this.goal && !this.steerTo(game, dt, this.goal.x, this.goal.z, 1.4)) break;
        // At post: settle, and slowly sweep the watched angle.
        this.vel.x = 0;
        this.vel.z = 0;
        this.speedNow = 0;
        if (this.post) {
          const sweep = Math.sin(game.time * 0.35 + this.id * 1.7) * 0.5;
          this.yaw = angleLerp(this.yaw, this.post.yaw + sweep, Math.min(1, dt * 3));
        }
        break;
      }
      case 'investigate': {
        if (this.goal) {
          const arrived = this.followPathTo(game, dt, this.goal.x, this.goal.z);
          if (arrived) {
            this.investigate = null;
            this.lastSeen = null;
            this.state = 'hold';
          }
        }
        break;
      }
      case 'guard': {
        if (this.goal && !this.steerTo(game, dt, this.goal.x, this.goal.z, 2.2)) break;
        this.vel.x = 0;
        this.vel.z = 0;
        this.speedNow = 0;
        break;
      }
      default: { // advance
        if (this.goal) this.followPathTo(game, dt, this.goal.x, this.goal.z);
        break;
      }
    }
    if (this.loadout.state.mag === 0 && this.loadout.reloadLeft <= 0) this.loadout.startReload();
  }

  // ---- buying -------------------------------------------------------------
  buy(game) {
    const L = this.loadout;
    const rng = game.rng;
    const spend = (price) => {
      if (this.money < price) return false;
      this.money -= price;
      return true;
    };
    if (!L.vest && this.money >= 1000 && spend(650)) L.vest = true;
    const primary = L.bestPrimary();
    if (!primary) {
      if (this.money >= 2700 && rng() < 0.8) {
        if (spend(WEAPONS.halberd.price)) L.owned.halberd = true;
      } else if (this.money >= 1100 && rng() < 0.3) {
        if (spend(WEAPONS.boar.price)) L.owned.boar = true;
      } else if (this.money >= 900) {
        if (spend(WEAPONS.marten.price)) L.owned.marten = true;
      }
    } else if (primary === 'marten' && this.money >= 3400 && rng() < 0.6) {
      if (spend(WEAPONS.halberd.price)) L.owned.halberd = true;
    }
    if (L.frags === 0 && this.money >= 900 && rng() < 0.5) {
      if (spend(300)) L.frags = 1;
    }
    if (!L.vest && spend(650)) L.vest = true;
    L.equipBest();
    this.armor = L.vest ? 100 : 0;
  }

  // ---- rendering ------------------------------------------------------------
  syncMesh(time) {
    if (!this.mesh) return;
    const { group, legL, legR } = this.mesh;
    group.position.set(this.pos.x, 0, this.pos.z);
    if (!this.alive) {
      const t = Math.min(1, this.deathTime * 2.4);
      group.rotation.set(-Math.PI / 2 * t, this.yaw, 0);
      group.position.y = 0.25 * t;
      return;
    }
    group.rotation.set(0, this.yaw, 0);
    const swing = Math.min(1, this.speedNow / 4) * Math.sin(time * 10 + this.id);
    legL.rotation.x = swing * 0.7;
    legR.rotation.x = -swing * 0.7;
    group.position.y = Math.abs(Math.sin(time * 10 + this.id)) * 0.04 * Math.min(1, this.speedNow / 4);
    const squash = this.crouching ? 0.78 : 1;
    group.scale.set(1, squash, 1);
  }
}
