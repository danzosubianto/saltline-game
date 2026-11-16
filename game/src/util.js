// util.js — small math helpers and a seeded RNG. Everything the simulation
// needs that is not specific to one system lives here, so modules stay
// single-purpose and the hot loops allocate nothing.

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Distance squared on the ground plane (the sim is 2.5D: full 3D rendering,
// ground-plane gameplay with eye heights).
export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// mulberry32: tiny deterministic RNG so staged screenshot scenes and bot
// behaviour reproduce run to run for a given seed.
export function makeRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Segment vs AABB in 2D: returns the entry distance along the segment in
// [0, 1], or Infinity when the segment misses the box. Used for line of
// sight and bullet blocking against the map's collider list.
export function segmentHitsBox(x0, z0, x1, z1, box) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  let tmin = 0;
  let tmax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (x0 < box.minX || x0 > box.maxX) return Infinity;
  } else {
    let t1 = (box.minX - x0) / dx;
    let t2 = (box.maxX - x0) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  if (Math.abs(dz) < 1e-9) {
    if (z0 < box.minZ || z0 > box.maxZ) return Infinity;
  } else {
    let t1 = (box.minZ - z0) / dz;
    let t2 = (box.maxZ - z0) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

// Does any collider tall enough to block sight interrupt the line a->b?
// `minH` is the eye height the ray travels at; colliders shorter than the
// lower of the two endpoints' sight lines are skipped by the caller passing
// the right threshold. Blocking is tested at the collider's top edge: a ray
// from eye height h0 to h1 passes over a box when both endpoints are above
// it; the sim keeps combat on one level, so a flat threshold is exact here.
export function lineBlocked(colliders, x0, z0, x1, z1, minBlockingH) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.h < minBlockingH) continue;
    if (segmentHitsBox(x0, z0, x1, z1, c) !== Infinity) return true;
  }
  return false;
}

// Move a circle (x, z, radius) against the collider list, axis separated so
// the actor slides along walls instead of sticking to them. Mutates pos.
export function moveWithCollision(colliders, pos, dx, dz, radius) {
  pos.x += dx;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (pos.x + radius > c.minX && pos.x - radius < c.maxX && pos.z + radius > c.minZ && pos.z - radius < c.maxZ) {
      if (dx > 0) pos.x = c.minX - radius;
      else if (dx < 0) pos.x = c.maxX + radius;
    }
  }
  pos.z += dz;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (pos.x + radius > c.minX && pos.x - radius < c.maxX && pos.z + radius > c.minZ && pos.z - radius < c.maxZ) {
      if (dz > 0) pos.z = c.minZ - radius;
      else if (dz < 0) pos.z = c.maxZ + radius;
    }
  }
}
