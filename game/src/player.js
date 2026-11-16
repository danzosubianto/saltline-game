// player.js — the local player: mouse look, acceleration-based movement
// with crouching, and the first-person view (camera + view model). Movement
// is deliberately weighty: you accelerate, you slide a little, and your
// spread blooms while you move — stopping to shoot is the game's core skill.

import * as THREE from 'three';
import { Actor, BODY } from './actors.js';
import { clamp, moveWithCollision } from './util.js';

const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const ACCEL = 42;
const FRICTION = 10;

export class Player extends Actor {
  constructor(team, spawn) {
    super(team, spawn.x, spawn.z, spawn.yaw);
    this.isPlayer = true;
    this.recoil = 0; // camera pitch kick from firing, decays
    this.landDip = 0;
  }

  // Advance the player one fixed step from the input state.
  update(dt, input, colliders, frozen) {
    // Mouse look.
    const SENS = 0.0021;
    this.yaw -= input.mouseDX * SENS;
    this.pitch -= input.mouseDY * SENS;
    this.pitch = clamp(this.pitch, -1.45, 1.45);

    this.crouching = input.down('ControlLeft') || input.down('KeyC');

    // Wish direction in world space from the movement keys.
    let fwd = 0;
    let strafe = 0;
    if (!frozen) {
      if (input.down('KeyW') || input.down('ArrowUp')) fwd += 1;
      if (input.down('KeyS') || input.down('ArrowDown')) fwd -= 1;
      if (input.down('KeyA') || input.down('ArrowLeft')) strafe -= 1;
      if (input.down('KeyD') || input.down('ArrowRight')) strafe += 1;
    }
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    // Facing -Z when yaw is 0: forward is (-sin(yaw), -cos(yaw)) in x/z.
    let wishX = -sin * fwd + cos * strafe;
    let wishZ = -cos * fwd - sin * strafe;
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 0) {
      wishX /= wishLen;
      wishZ /= wishLen;
    }
    const maxSpeed = this.crouching ? CROUCH_SPEED : WALK_SPEED;
    this.vel.x += wishX * ACCEL * dt;
    this.vel.z += wishZ * ACCEL * dt;
    // Friction: exponential damping, stronger when no input.
    const damp = Math.exp(-FRICTION * dt * (wishLen > 0 ? 0.45 : 1));
    this.vel.x *= damp;
    this.vel.z *= damp;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (speed > maxSpeed) {
      this.vel.x = (this.vel.x / speed) * maxSpeed;
      this.vel.z = (this.vel.z / speed) * maxSpeed;
    }
    this.speedNow = Math.hypot(this.vel.x, this.vel.z);
    if (this.alive && !this.channel) {
      moveWithCollision(colliders, this.pos, this.vel.x * dt, this.vel.z * dt, BODY.radius);
    }
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 5.5);
    this.loadout.update(dt);
  }

  // Point the camera. Called once per rendered frame.
  applyCamera(camera) {
    camera.position.set(this.pos.x, this.eyeHeight, this.pos.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = this.yaw;
    camera.rotation.x = this.pitch + this.recoil * 0.012;
    camera.rotation.z = 0;
  }
}

// The view model: a low, chunky rifle built from boxes, parented to the
// camera. It bobs as you move, kicks when you fire and dips when you reload.
export function buildViewModel() {
  const group = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
  const mid = new THREE.MeshLambertMaterial({ color: 0x4a4f58 });
  const accent = new THREE.MeshLambertMaterial({ color: 0x2e7f7a });
  const parts = [
    [0, 0, -0.5, 0.07, 0.09, 0.55, mid], // receiver
    [0, 0.015, -0.85, 0.045, 0.045, 0.3, dark], // barrel
    [0, -0.07, -0.42, 0.05, 0.14, 0.09, dark], // magazine
    [0, 0.075, -0.52, 0.03, 0.05, 0.12, accent], // sight block
    [0, -0.045, -0.2, 0.055, 0.1, 0.16, dark], // grip/stock hint
  ];
  for (const [x, y, z, w, h, d, mat] of parts) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    group.add(mesh);
  }
  group.position.set(0.27, -0.27, -0.4);
  group.scale.setScalar(0.85);
  return group;
}

export function poseViewModel(group, player, time, firing) {
  const speed = player.speedNow;
  const bob = Math.min(1, speed / 5) * 0.012;
  group.position.y = -0.27 + Math.sin(time * 9) * bob - (player.loadout.reloadLeft > 0 ? 0.09 : 0);
  group.position.x = 0.27 + Math.cos(time * 4.5) * bob * 0.6;
  group.rotation.x = (firing ? 0.05 : 0) + (player.loadout.reloadLeft > 0 ? 0.5 : 0);
}
