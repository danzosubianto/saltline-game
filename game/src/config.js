// config.js — every tuning number for SALTLINE in one place: weapons,
// economy, round structure and team setup. No logic lives here.

// Teams. The player always fights for the Wardens (defenders); the Jackals
// attack and carry the breach charge.
export const TEAM = { WARDEN: 'warden', JACKAL: 'jackal' };

export const MATCH = {
  roundsToWin: 7,
  maxRounds: 13,
  buySeconds: 12,
  roundSeconds: 100,
  plantSeconds: 3.2,
  defuseSeconds: 5,
  bombSeconds: 35,
  endSeconds: 4.5, // round-end banner before the next buy phase
  startMoney: 800,
  maxMoney: 16000,
  killReward: 300,
  plantReward: 800,
  winReward: 1400,
  lossReward: 1000,
  teamSize: 5, // per side, including the player on the Warden side
};

// Weapons. Damage is per pellet/bullet at point blank, before the head
// multiplier and range falloff in combat.js. spread is in radians at rest;
// fireMode 'auto' holds to fire, 'semi' needs a click per shot.
export const WEAPONS = {
  kestrel: {
    name: 'Kestrel P9',
    slot: 'sidearm',
    price: 0,
    damage: 34,
    headMult: 4,
    rpm: 380,
    fireMode: 'semi',
    mag: 12,
    reserve: 96,
    reloadSec: 1.6,
    spread: 0.012,
    range: 55,
    pellets: 1,
    zoom: 1,
  },
  marten: {
    name: 'Marten SMG',
    slot: 'primary',
    price: 900,
    damage: 26,
    headMult: 4,
    rpm: 780,
    fireMode: 'auto',
    mag: 30,
    reserve: 120,
    reloadSec: 2.1,
    spread: 0.02,
    range: 45,
    pellets: 1,
    zoom: 1,
  },
  boar: {
    name: 'Boar-12',
    slot: 'primary',
    price: 1100,
    damage: 11,
    headMult: 2,
    rpm: 68,
    fireMode: 'semi',
    mag: 6,
    reserve: 30,
    reloadSec: 2.8,
    spread: 0.055,
    range: 22,
    pellets: 8,
    zoom: 1,
  },
  halberd: {
    name: 'Halberd AR',
    slot: 'primary',
    price: 2700,
    damage: 36,
    headMult: 4,
    rpm: 620,
    fireMode: 'auto',
    mag: 30,
    reserve: 120,
    reloadSec: 2.4,
    spread: 0.014,
    range: 80,
    pellets: 1,
    zoom: 1,
  },
  osprey: {
    name: 'Osprey DMR',
    slot: 'primary',
    price: 4200,
    damage: 97,
    headMult: 3,
    rpm: 48,
    fireMode: 'semi',
    mag: 5,
    reserve: 30,
    reloadSec: 2.9,
    spread: 0.002,
    range: 140,
    pellets: 1,
    zoom: 3.2, // right-mouse scope magnification
  },
};

export const GEAR = {
  vest: { name: 'Kevlar Vest', price: 650, absorb: 0.6 },
  frag: { name: 'Frag Charge', price: 300, damage: 115, radius: 6.5, fuseSec: 1.6 },
};

// Buy menu rows, in display order: [key, label group].
export const BUY_ROWS = [
  { id: 'marten', kind: 'weapon' },
  { id: 'boar', kind: 'weapon' },
  { id: 'halberd', kind: 'weapon' },
  { id: 'osprey', kind: 'weapon' },
  { id: 'vest', kind: 'gear' },
  { id: 'frag', kind: 'gear' },
];
