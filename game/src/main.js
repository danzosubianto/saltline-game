// main.js — SALTLINE's entry point. Owns the renderer, the fixed-step
// simulation loop, the effect pools (tracers, sparks, explosions) and the
// menu/pause flow. The simulation itself lives in the modules: world
// (map), actors (fighters), combat (shots), bots (AI), round (match
// structure), hud (DOM). State lives on the one `game` object passed to
// every system.

import * as THREE from 'three';
import { SoundBank } from './audio.js';
import { Actor } from './actors.js';
import { Bot, BOT_NAMES, buildBotMesh } from './bots.js';
import { throwGrenade, tryFire, updateGrenades } from './combat.js';
import { MATCH, TEAM } from './config.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Player, buildViewModel, poseViewModel } from './player.js';
import { RoundManager } from './round.js';
import { makeRng } from './util.js';
import { buildWorld } from './world.js';

const params = new URLSearchParams(location.search);
const seed = parseInt(params.get('seed') ?? '1', 10) || 1;
const shotScene = params.get('shot');

const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(78, 1, 0.08, 400);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const world = buildWorld(scene);
const sounds = new SoundBank();
const input = new Input(canvas);
const hud = new Hud(document.getElementById('hud'));

// ---------------------------------------------------------------- actors

const player = new Player(TEAM.WARDEN, world.spawns.warden[0]);
player.name = 'YOU';
const actors = [player];
const bots = [];
{
  const rngBots = makeRng(seed * 7 + 3);
  world.spawns.warden.slice(1).forEach((spawn, i) => {
    const bot = new Bot(TEAM.WARDEN, spawn, BOT_NAMES.warden[i], 0.5 + rngBots() * 0.35);
    actors.push(bot);
    bots.push(bot);
  });
  world.spawns.jackal.forEach((spawn, i) => {
    const bot = new Bot(TEAM.JACKAL, spawn, BOT_NAMES.jackal[i], 0.45 + rngBots() * 0.4);
    actors.push(bot);
    bots.push(bot);
  });
}
for (const bot of bots) {
  bot.mesh = buildBotMesh(bot.team);
  scene.add(bot.mesh.group);
}

// ------------------------------------------------------------------- game

const game = {
  world,
  actors,
  player,
  bots,
  sounds,
  input,
  hud,
  rng: makeRng(seed),
  events: [],
  grenades: [],
  noise: [],
  time: 0,
  state: 'menu', // menu | playing
  buyOpen: false,
  frozen: false, // staged screenshot scenes hold the sim still
  onNoise(x, z, team) {
    this.noise.push({ x, z, team, at: this.time });
    if (this.noise.length > 24) this.noise.shift();
  },
  recentNoise(bot) {
    for (let i = this.noise.length - 1; i >= 0; i--) {
      const n = this.noise[i];
      if (this.time - n.at > 2.5) continue;
      if (n.team === bot.team) continue;
      const d = Math.hypot(n.x - bot.pos.x, n.z - bot.pos.z);
      if (d < 30) return n;
    }
    return null;
  },
  tryPlant(actor) {
    return this.round.tryPlant(actor);
  },
  tryDefuse(actor) {
    return this.round.tryDefuse(actor);
  },
};
game.round = new RoundManager(game);
const round = game.round;

// ------------------------------------------------------------- view model

const viewModel = buildViewModel();
camera.add(viewModel);
scene.add(camera);

// The charge: a dark brick with a blinking lamp, parented to nothing — it
// is placed each frame on the carrier, the ground, or the plant spot.
const bombMesh = new THREE.Group();
{
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.24, 0.3),
    new THREE.MeshLambertMaterial({ color: 0x3a3f45 }),
  );
  body.position.y = 0.12;
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.08), lampMat);
  lamp.position.set(0.1, 0.26, 0);
  bombMesh.add(body, lamp);
  bombMesh.userData.lampMat = lampMat;
  scene.add(bombMesh);
}

// ---------------------------------------------------------------- effects

class Effects {
  constructor(sceneRef) {
    // Tracers: a fixed pool of line segments, each with a short life.
    this.tracerCount = 96;
    this.tracerPos = new Float32Array(this.tracerCount * 6);
    this.tracerLife = new Float32Array(this.tracerCount);
    this.tracerNext = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3));
    this.tracers = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.85 }),
    );
    this.tracers.frustumCulled = false;
    sceneRef.add(this.tracers);
    // Impact sparks: one Points cloud, particles with velocity and life.
    this.sparkCount = 240;
    this.sparkPos = new Float32Array(this.sparkCount * 3);
    this.sparkVel = new Float32Array(this.sparkCount * 3);
    this.sparkLife = new Float32Array(this.sparkCount);
    this.sparkNext = 0;
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    this.sparks = new THREE.Points(
      sgeo,
      new THREE.PointsMaterial({ color: 0xffcf7a, size: 0.09, transparent: true, opacity: 0.95 }),
    );
    this.sparks.frustumCulled = false;
    sceneRef.add(this.sparks);
    for (let i = 0; i < this.sparkCount; i++) this.sparkPos[i * 3 + 1] = -10;
    // Explosion: an expanding shell + a light flash.
    this.boom = new THREE.Mesh(
      new THREE.SphereGeometry(1, 18, 12),
      new THREE.MeshBasicMaterial({ color: 0xffa63f, transparent: true, opacity: 0 }),
    );
    this.boom.visible = false;
    sceneRef.add(this.boom);
    this.boomLight = new THREE.PointLight(0xff9a3f, 0, 30);
    sceneRef.add(this.boomLight);
    this.boomLife = 0;
    // Grenade bodies.
    this.grenadeMeshes = [];
    const gGeo = new THREE.SphereGeometry(0.09, 10, 8);
    const gMat = new THREE.MeshLambertMaterial({ color: 0x2c2f26 });
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(gGeo, gMat);
      m.visible = false;
      sceneRef.add(m);
      this.grenadeMeshes.push(m);
    }
    // Muzzle flashes for bots: small additive planes at the gun tip.
    this.flashMat = new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0 });
    this.flashes = new Map();
  }

  tracer(x0, y0, z0, x1, y1, z1) {
    const i = this.tracerNext;
    this.tracerNext = (this.tracerNext + 1) % this.tracerCount;
    this.tracerPos.set([x0, y0, z0, x1, y1, z1], i * 6);
    this.tracerLife[i] = 0.07;
    this.tracers.geometry.attributes.position.needsUpdate = true;
  }

  impact(x, y, z) {
    for (let n = 0; n < 5; n++) {
      const i = this.sparkNext;
      this.sparkNext = (this.sparkNext + 1) % this.sparkCount;
      this.sparkPos.set([x, y, z], i * 3);
      this.sparkVel.set([(Math.random() - 0.5) * 2.4, Math.random() * 2.2, (Math.random() - 0.5) * 2.4], i * 3);
      this.sparkLife[i] = 0.3;
    }
  }

  explosion(x, y, z, big) {
    this.boom.position.set(x, y, z);
    this.boom.visible = true;
    this.boomLife = big ? 1.4 : 0.8;
    this.boomScale = big ? 9 : 5;
    this.boomLight.position.set(x, y + 1, z);
  }

  muzzle(actor) {
    if (actor.isPlayer) return;
    let mesh = this.flashes.get(actor.id);
    if (!mesh) {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), this.flashMat.clone());
      scene.add(mesh);
      this.flashes.set(actor.id, mesh);
    }
    const fx = actor.pos.x - Math.sin(actor.yaw) * 0.75;
    const fz = actor.pos.z - Math.cos(actor.yaw) * 0.75;
    mesh.position.set(fx, 1.32, fz);
    mesh.material.opacity = 0.95;
  }

  update(dt) {
    for (let i = 0; i < this.tracerCount; i++) {
      if (this.tracerLife[i] > 0) {
        this.tracerLife[i] -= dt;
        if (this.tracerLife[i] <= 0) this.tracerPos.fill(0, i * 6, i * 6 + 6);
      }
    }
    this.tracers.geometry.attributes.position.needsUpdate = true;
    for (let i = 0; i < this.sparkCount; i++) {
      if (this.sparkLife[i] <= 0) continue;
      this.sparkLife[i] -= dt;
      this.sparkVel[i * 3 + 1] -= 6 * dt;
      this.sparkPos[i * 3] += this.sparkVel[i * 3] * dt;
      this.sparkPos[i * 3 + 1] += this.sparkVel[i * 3 + 1] * dt;
      this.sparkPos[i * 3 + 2] += this.sparkVel[i * 3 + 2] * dt;
      if (this.sparkLife[i] <= 0) this.sparkPos[i * 3 + 1] = -10;
    }
    this.sparks.geometry.attributes.position.needsUpdate = true;
    if (this.boomLife > 0) {
      this.boomLife -= dt;
      const t = 1 - Math.max(0, this.boomLife) / 1.4;
      const s = 0.5 + t * (this.boomScale ?? 5);
      this.boom.scale.set(s, s * 0.7, s);
      this.boom.material.opacity = 0.55 * (1 - t);
      this.boomLight.intensity = 60 * (1 - t);
      if (this.boomLife <= 0) {
        this.boom.visible = false;
        this.boomLight.intensity = 0;
      }
    }
    for (const mesh of this.flashes.values()) {
      if (mesh.material.opacity > 0) mesh.material.opacity = Math.max(0, mesh.material.opacity - dt * 16);
    }
    // Grenade bodies follow the simulated grenades.
    this.grenadeMeshes.forEach((mesh, i) => {
      const g = game.grenades[i];
      if (g) {
        mesh.visible = true;
        mesh.position.set(g.pos.x, g.pos.y, g.pos.z);
      } else {
        mesh.visible = false;
      }
    });
  }
}

const effects = new Effects(scene);

// ------------------------------------------------------------- buy (player)

import { BUY_ROWS, GEAR, WEAPONS } from './config.js';

// Give a loadout a weapon with fresh ammunition (buy menu + staging).
function grantWeapon(loadout, id) {
  loadout.owned[id] = true;
  loadout.ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
}

function tryBuyPlayer(rowIndex) {
  const row = BUY_ROWS[rowIndex];
  if (!row || round.phase !== 'buy') return;
  const L = player.loadout;
  let price = 0;
  if (row.kind === 'weapon') {
    price = WEAPONS[row.id].price;
    if (L.owned[row.id] || player.money < price) return sounds.denied();
    grantWeapon(L, row.id);
    L.switchTo(row.id);
  } else if (row.id === 'vest') {
    price = GEAR.vest.price;
    if (L.vest || player.money < price) return sounds.denied();
    L.vest = true;
    player.armor = 100;
  } else {
    price = GEAR.frag.price;
    if (L.frags >= 2 || player.money < price) return sounds.denied();
    L.frags++;
  }
  player.money -= price;
  sounds.buy();
  hud.refreshBuy(player);
}

// ------------------------------------------------------------ event intake

function consumeEvents() {
  for (const e of game.events) {
    switch (e.type) {
      case 'tracer':
        effects.tracer(e.x0, e.y0, e.z0, e.x1, e.y1, e.z1);
        break;
      case 'muzzle':
        effects.muzzle(e.actor);
        break;
      case 'impact':
        effects.impact(e.x, e.y, e.z);
        break;
      case 'kill':
        hud.addKill(e.killer, e.victim, e.headshot);
        if (e.killer === player) sounds.kill();
        break;
      case 'hitmarker':
        if (e.killer === player) {
          hud.flashHitmarker(e.head, e.killed);
          sounds.hit();
        }
        break;
      case 'playerHurt':
        sounds.hurt();
        hud.flashHurt(e.fromX, e.fromZ, player);
        break;
      case 'explosion':
        effects.explosion(e.x, e.y, e.z, e.big);
        break;
      case 'planted':
        hud.showBanner('CHARGE PLANTED', `Site ${e.site.name} — defuse it before it blows`, 2600);
        break;
      case 'roundStart':
        hud.showBanner(`ROUND ${e.round}`, 'Buy phase — press B', 1800);
        game.buyOpen = true;
        break;
      case 'roundLive':
        game.buyOpen = false;
        break;
      case 'roundEnd': {
        const won = e.winner === TEAM.WARDEN;
        hud.showBanner(won ? 'ROUND WON' : 'ROUND LOST', e.reason, 4000);
        break;
      }
      case 'matchOver':
        hud.showOver(e.winner, round.score);
        input.unlock();
        break;
      default:
        break;
    }
  }
  game.events.length = 0;
}

// -------------------------------------------------------------- simulation

const STEP = 1 / 60;
let grenadeCooldown = 0;

function simStep(dt) {
  game.time += dt;
  grenadeCooldown = Math.max(0, grenadeCooldown - dt);
  const phase = round.phase;

  if (game.state === 'playing' && phase !== 'over') {
    const inBuy = phase === 'buy';
    const frozen = inBuy || phase === 'end' || phase === 'idle';

    // The player: frozen in place during buy and the end banner, but the
    // camera always answers the mouse.
    player.update(dt, input, world.colliders, frozen);
    if (player.alive && !frozen) {
      if (input.pressed('KeyR')) player.loadout.startReload();
      if (input.pressed('Digit1')) player.loadout.switchTo('kestrel');
      if (input.pressed('Digit2')) {
        const best = player.loadout.bestPrimary();
        if (best) player.loadout.switchTo(best);
      }
      if (input.pressed('KeyG') && grenadeCooldown <= 0) {
        if (throwGrenade(game, player)) grenadeCooldown = 0.5;
      }
      // Defuse channel: starts on E, breaks if E is released or the
      // player tries to move.
      if (round.bombState === 'planted') {
        if (input.down('KeyE') && !player.channel) round.tryDefuse(player);
        if (player.channel && player.channel.kind === 'defuse') {
          const moving = input.down('KeyW') || input.down('KeyA') || input.down('KeyS') || input.down('KeyD');
          if (!input.down('KeyE') || moving) round.cancelChannel(player, 'interrupted');
        }
      }
      if (player.channel && input.mouseDown) round.cancelChannel(player, 'interrupted');
      tryFire(game, player, input.mouseDown);
    } else {
      player.loadout.update(dt);
    }

    if (!inBuy && phase !== 'end') {
      for (const bot of bots) bot.update(game, dt);
    } else {
      for (const bot of bots) bot.loadout.update(dt);
    }
    updateGrenades(game, dt);
  }

  round.update(dt);
  input.flushFrame();
}

// ------------------------------------------------------------------ render

let fovNow = 78;

function renderFrame() {
  // Camera: the player's eyes, a teammate's eyes when spectating, or a
  // slow orbit over the Brineworks on the menu.
  if (game.state === 'menu') {
    const t = performance.now() * 0.00004;
    camera.position.set(Math.sin(t) * 44, 16, Math.cos(t) * 44 - 4);
    camera.lookAt(0, 1, -6);
    viewModel.visible = false;
  } else if (player.alive) {
    player.applyCamera(camera);
    viewModel.visible = true;
    poseViewModel(viewModel, player, game.time);
  } else {
    const mate = actors.find((a) => a.alive && a.team === TEAM.WARDEN && !a.isPlayer);
    if (mate) {
      camera.position.set(mate.pos.x, 1.62, mate.pos.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(mate.pitch, mate.yaw, 0);
    } else {
      camera.position.set(0, 30, 20);
      camera.lookAt(0, 0, -10);
    }
    viewModel.visible = false;
  }

  // Scope zoom for the Osprey.
  const wantFov = player.alive && player.loadout.current === 'osprey' && input.rightDown ? 78 / 3.2 : 78;
  if (Math.abs(wantFov - fovNow) > 0.1) {
    fovNow += (wantFov - fovNow) * 0.35;
    camera.fov = fovNow;
    camera.updateProjectionMatrix();
  }

  for (const bot of bots) bot.syncMesh(game.time);
  effects.update(1 / 60);

  // Place the charge mesh.
  if (round.bombState === 'planted' || round.bombState === 'dropped') {
    bombMesh.visible = true;
    bombMesh.position.set(round.bombPos.x, 0, round.bombPos.z);
    const urgent = round.bombState === 'planted' && round.bombLeft < 10;
    const blink = Math.sin(game.time * (urgent ? 22 : 7)) > 0;
    bombMesh.userData.lampMat.color.setHex(blink ? 0xff4444 : 0x551111);
  } else {
    const carrier = actors.find((a) => a.hasBomb);
    if (carrier) {
      bombMesh.visible = true;
      bombMesh.position.set(carrier.pos.x, 0.9, carrier.pos.z);
      bombMesh.rotation.y = carrier.yaw;
    } else {
      bombMesh.visible = false;
    }
  }

  hud.setBuyOpen(game.state === 'playing' && game.buyOpen && round.phase === 'buy', player);
  hud.update(game);
  renderer.render(scene, camera);
}

// -------------------------------------------------------------------- loop

let last = performance.now();
let acc = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;
  acc += dt;
  if (!game.frozen) {
    while (acc >= STEP) {
      simStep(STEP);
      acc -= STEP;
    }
  }
  consumeEvents();
  renderFrame();
}

// -------------------------------------------------------------- menu flow

function startPlaying() {
  sounds.ensure();
  hud.showMenu(false);
  hud.hideOver();
  game.state = 'playing';
  round.startMatch();
  input.lock();
}

canvas.addEventListener('click', () => {
  if (shotScene) return;
  if (game.state === 'menu' || round.phase === 'over') startPlaying();
  else if (!input.locked) input.lock();
});

document.addEventListener('pointerlockchange', () => {
  if (shotScene) return;
  if (!input.locked && game.state === 'playing' && round.phase !== 'over') {
    hud.menuHint.textContent = 'Paused — click the view to keep playing';
    hud.showMenu(true);
  } else if (input.locked) {
    hud.showMenu(false);
  }
});

// Buy keys + buy-menu toggle live outside the fixed step (they are UI).
document.addEventListener('keydown', (e) => {
  if (game.state !== 'playing' || round.phase !== 'buy') return;
  if (e.code === 'KeyB') game.buyOpen = !game.buyOpen;
  if (game.buyOpen && /^Digit[1-6]$/.test(e.code)) {
    tryBuyPlayer(parseInt(e.code.slice(5), 10) - 1);
  }
});

// ------------------------------------------------------- screenshot scenes
// Staged, deterministic scenes for the entry screenshots. The sim is
// frozen after staging; only rendering continues.

function place(actor, x, z) {
  actor.pos.x = x;
  actor.pos.z = z;
}

function stage(name) {
  hud.showMenu(name === 'menu');
  if (name === 'menu') {
    game.state = 'menu';
    window.__shotReady = true;
    return;
  }
  game.state = 'playing';
  round.startMatch();
  const setPhase = (phase, left) => {
    round.phase = phase;
    round.phaseLeft = left;
  };
  if (name === 'buy') {
    setPhase('buy', 8.5);
    player.money = 3400;
    game.buyOpen = true;
    player.yaw = Math.PI;
    player.pitch = -0.02;
  } else if (name === 'play') {
    setPhase('live', 63);
    player.money = 1250;
    grantWeapon(player.loadout, 'halberd');
    player.loadout.switchTo('halberd');
    player.loadout.state.mag = 24;
    player.health = 82;
    player.armor = 60;
    place(player, -6, 14);
    player.yaw = 0.35;
    player.pitch = -0.03;
    const j1 = bots.find((b) => b.team === TEAM.JACKAL);
    place(j1, -13, 2);
    j1.yaw = -2.6;
    grantWeapon(j1.loadout, 'marten');
    const j2 = bots.filter((b) => b.team === TEAM.JACKAL)[1];
    place(j2, -3, -2);
    j2.yaw = -3.0;
    j2.health = 55;
    round.score.warden = 3;
    round.score.jackal = 2;
    round.roundNumber = 6;
    for (const bot of bots) bot.syncMesh(0);
  } else if (name === 'planted') {
    setPhase('live', 40);
    player.money = 2600;
    grantWeapon(player.loadout, 'halberd');
    player.loadout.switchTo('halberd');
    player.health = 64;
    player.armor = 45;
    place(player, -26, -13);
    player.yaw = 0.75;
    player.pitch = -0.05;
    round.bombState = 'planted';
    round.bombPos = { x: world.sites.A.x + 1.5, z: world.sites.A.z + 1 };
    round.bombSite = world.sites.A;
    round.bombLeft = 24;
    const guard = bots.find((b) => b.team === TEAM.JACKAL);
    place(guard, -37, -25);
    guard.yaw = -0.8;
    grantWeapon(guard.loadout, 'halberd');
    round.score.warden = 5;
    round.score.jackal = 4;
    round.roundNumber = 10;
    for (const bot of bots) bot.syncMesh(0);
  }
  game.frozen = true;
  game.events.length = 0;
  window.__shotReady = true;
}

if (shotScene) stage(shotScene);
requestAnimationFrame(frame);
