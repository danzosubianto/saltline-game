// world.js — the Brineworks: SALTLINE's only map, built from data. One list
// of blocks becomes both the visible geometry and the collider set the
// simulation moves and shoots against, so what you see is exactly what
// blocks you. Also defines the two plant sites, the spawns and the waypoint
// graph the bots navigate by.

import * as THREE from 'three';

// The palette: dawn over a coastal salt plant. Warm sand and concrete,
// brine teal for the Wardens' side of the world, rust for the Jackals'.
export const PALETTE = {
  sky: 0xf2c99a,
  fog: 0xe8c39a,
  ground: 0xb8a888,
  groundDark: 0x9a8a6e,
  concrete: 0xcfc8b8,
  concreteDark: 0x8f887a,
  rust: 0xb45a32,
  teal: 0x2e7f7a,
  salt: 0xf4efe4,
  metal: 0x6b7078,
  crate: 0xa67c4e,
  dark: 0x3a3f45,
};

// A block: center x/z, width (x), depth (z), height, material key, and
// whether it enters the collider list (pure decoration passes solid:false).
const BLOCKS = [
  // Perimeter walls (height 4, everything outside is out of play)
  { x: 0, z: -40, w: 106, d: 2, h: 4, mat: 'concreteDark' },
  { x: 0, z: 40, w: 106, d: 2, h: 4, mat: 'concreteDark' },
  { x: -52, z: 0, w: 2, d: 82, h: 4, mat: 'concreteDark' },
  { x: 52, z: 0, w: 2, d: 82, h: 4, mat: 'concreteDark' },

  // --- Site A: the Cistern (north-west) ---
  // Low cistern rim walls (block movement, not sight) around a sunken pool.
  { x: -34, z: -27, w: 16, d: 1, h: 0.9, mat: 'teal' },
  { x: -34, z: -15, w: 16, d: 1, h: 0.9, mat: 'teal' },
  { x: -41.5, z: -21, w: 1, d: 13, h: 0.9, mat: 'teal' },
  { x: -26.5, z: -21, w: 1, d: 7, h: 0.9, mat: 'teal' },
  // Pump house behind A: two walls making an L of hard cover.
  { x: -44, z: -32, w: 12, d: 1.5, h: 3.2, mat: 'concrete' },
  { x: -44, z: -26, w: 1.5, d: 12, h: 3.2, mat: 'concrete' },
  // Crates on A.
  { x: -30, z: -24, w: 2.2, d: 2.2, h: 1.1, mat: 'crate' },
  { x: -30, z: -24, w: 2.2, d: 2.2, h: 2.2, mat: 'crate', y: 1.1, solid: false },
  { x: -37, z: -18, w: 2.2, d: 2.2, h: 1.1, mat: 'crate' },

  // --- Site B: the Silo yard (north-east) ---
  // Two silo bases (square colliders stand in for the cylinders you see).
  { x: 30, z: -28, w: 7, d: 7, h: 9, mat: 'metal' },
  { x: 41, z: -20, w: 7, d: 7, h: 9, mat: 'metal' },
  // Yard walls and cover.
  { x: 24, z: -14, w: 10, d: 1.5, h: 3.2, mat: 'concrete' },
  { x: 45, z: -30, w: 1.5, d: 12, h: 3.2, mat: 'concrete' },
  { x: 35, z: -16, w: 2.2, d: 2.2, h: 1.1, mat: 'crate' },
  { x: 27, z: -19, w: 2.2, d: 2.2, h: 1.1, mat: 'crate' },
  { x: 27, z: -19, w: 2.2, d: 2.2, h: 2.2, mat: 'crate', y: 1.1, solid: false },

  // --- Mid: the pump hall, a wall with two door gaps splitting the map ---
  { x: -14, z: -4, w: 24, d: 2, h: 3.6, mat: 'concrete' },
  { x: 16, z: -4, w: 26, d: 2, h: 3.6, mat: 'concrete' },
  { x: 0, z: -12, w: 2, d: 14, h: 3.6, mat: 'concreteDark' }, // mid spine north
  { x: -6, z: 6, w: 2.2, d: 2.2, h: 1.1, mat: 'crate' },
  { x: 7, z: 8, w: 2.2, d: 2.2, h: 1.1, mat: 'crate' },
  { x: 0, z: 16, w: 8, d: 1.2, h: 1.5, mat: 'metal' }, // low pipe barrier

  // --- West lane (Jackal spawn -> A) ---
  { x: -44, z: 4, w: 10, d: 1.5, h: 3.2, mat: 'concrete' },
  { x: -38, z: -6, w: 2.2, d: 2.2, h: 1.1, mat: 'crate' },
  { x: -46, z: 18, w: 2.2, d: 4.4, h: 1.1, mat: 'crate' },
  { x: -30, z: 2, w: 1.2, d: 10, h: 1.5, mat: 'metal' },

  // --- East lane (Jackal spawn -> B) ---
  { x: 44, z: 6, w: 10, d: 1.5, h: 3.2, mat: 'concrete' },
  { x: 38, z: -4, w: 2.2, d: 2.2, h: 1.1, mat: 'crate' },
  { x: 46, z: 20, w: 4.4, d: 2.2, h: 1.1, mat: 'crate' },
  { x: 30, z: 4, w: 1.2, d: 10, h: 1.5, mat: 'metal' },

  // --- South yard (Jackal spawn) cover ---
  { x: -16, z: 26, w: 2.2, d: 2.2, h: 1.1, mat: 'crate' },
  { x: 16, z: 26, w: 2.2, d: 2.2, h: 1.1, mat: 'crate' },
  { x: 0, z: 30, w: 10, d: 1.5, h: 3.2, mat: 'concrete' },

  // --- North lane behind the sites (Warden rotation) ---
  { x: -12, z: -32, w: 2.2, d: 2.2, h: 1.1, mat: 'crate' },
  { x: 12, z: -32, w: 2.2, d: 2.2, h: 1.1, mat: 'crate' },
  { x: 0, z: -26, w: 6, d: 1.2, h: 1.5, mat: 'metal' },
];

export const SITES = {
  A: { id: 'A', name: 'Cistern A', x: -34, z: -21, r: 6.5 },
  B: { id: 'B', name: 'Silo B', x: 34, z: -22, r: 6.5 },
};

export const SPAWNS = {
  warden: [
    { x: -6, z: -34, yaw: Math.PI },
    { x: -2, z: -35, yaw: Math.PI },
    { x: 2, z: -35, yaw: Math.PI },
    { x: 6, z: -34, yaw: Math.PI },
    { x: 0, z: -33, yaw: Math.PI },
  ],
  jackal: [
    { x: -6, z: 34, yaw: 0 },
    { x: -2, z: 35, yaw: 0 },
    { x: 2, z: 35, yaw: 0 },
    { x: 6, z: 34, yaw: 0 },
    { x: 0, z: 33, yaw: 0 },
  ],
};

// Waypoint graph: nodes on open ground, edges walkable in a straight line.
// Bots path node to node (BFS), then steer freely toward their goal.
const NODES = [
  { x: 0, z: 30 }, // 0 jackal spawn mid
  { x: -20, z: 28 }, // 1 south-west yard
  { x: 20, z: 28 }, // 2 south-east yard
  { x: -40, z: 24 }, // 3 west lane south
  { x: 40, z: 24 }, // 4 east lane south
  { x: -40, z: 8 }, // 5 west lane mid
  { x: 40, z: 8 }, // 6 east lane mid
  { x: -40, z: -8 }, // 7 west lane north (A door)
  { x: 40, z: -8 }, // 8 east lane north (B door)
  { x: -34, z: -21 }, // 9 site A centre
  { x: 34, z: -22 }, // 10 site B centre
  { x: -20, z: -2 }, // 11 mid-west door
  { x: 22, z: -2 }, // 12 mid-east door
  { x: 0, z: 10 }, // 13 mid south
  { x: 0, z: -18 }, // 14 mid north
  { x: -18, z: -18 }, // 15 north-west lane
  { x: 18, z: -18 }, // 16 north-east lane
  { x: 0, z: -33 }, // 17 warden spawn
  { x: -24, z: -30 }, // 18 A approach west
  { x: 24, z: -30 }, // 19 B approach east
  { x: -34, z: -33 }, // 20 A back (pump house)
  { x: 36, z: -33 }, // 21 B back
  { x: -12, z: 12 }, // 22 mid-west south
  { x: 12, z: 12 }, // 23 mid-east south
  { x: -24, z: -8 }, // 24 A short
  { x: 24, z: -10 }, // 25 B short
];

const EDGES = [
  [0, 1], [0, 2], [0, 13],
  [1, 3], [1, 22],
  [2, 4], [2, 23],
  [3, 5],
  [4, 6],
  [5, 7], [5, 11],
  [6, 8], [6, 12],
  [7, 9], [7, 24],
  [8, 10], [8, 25],
  [9, 18], [9, 20], [9, 24],
  [10, 19], [10, 21], [10, 25],
  [11, 13], [11, 15], [11, 22],
  [12, 14], [12, 16], [12, 23],
  [13, 22], [13, 23],
  [14, 15], [14, 16], [14, 17],
  [15, 18],
  [16, 19],
  [17, 18], [17, 19], [17, 20], [17, 21],
  [18, 20],
  [19, 21],
  [24, 15],
  [25, 16],
];

export function buildGraph() {
  const adjacency = NODES.map(() => []);
  for (const [a, b] of EDGES) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  return { nodes: NODES, adjacency };
}

// BFS shortest path between the nodes nearest to two points. Returns a list
// of node indices including both ends, or null when unreachable.
export function findPath(graph, fromX, fromZ, toX, toZ) {
  const nearest = (x, z) => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < graph.nodes.length; i++) {
      const n = graph.nodes[i];
      const d = (n.x - x) * (n.x - x) + (n.z - z) * (n.z - z);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  };
  const start = nearest(fromX, fromZ);
  const goal = nearest(toX, toZ);
  if (start === goal) return [start];
  const prev = new Map([[start, -1]]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === goal) break;
    for (const next of graph.adjacency[cur]) {
      if (!prev.has(next)) {
        prev.set(next, cur);
        queue.push(next);
      }
    }
  }
  if (!prev.has(goal)) return null;
  const path = [];
  for (let cur = goal; cur !== -1; cur = prev.get(cur)) path.push(cur);
  return path.reverse();
}

function makeTextSprite(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.font = 'bold 190px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 18;
  ctx.strokeStyle = 'rgba(20,16,10,0.85)';
  ctx.strokeText(text, 128, 138);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 138);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.6, 2.6, 1);
  return sprite;
}

// Build the visible scene and the collider list. Returns everything the sim
// needs from the map in one object.
export function buildWorld(scene) {
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 70, 200);

  const hemi = new THREE.HemisphereLight(0xffe6c4, 0x8a7a5e, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a8, 1.6);
  sun.position.set(-40, 60, 25);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xbcd6ff, 0.35);
  fill.position.set(30, 40, -50);
  scene.add(fill);

  // Ground: one big slab plus a darker apron under each site and painted
  // lane strips, all flat boxes so the light catches their edges.
  const groundMat = new THREE.MeshLambertMaterial({ color: PALETTE.ground });
  const ground = new THREE.Mesh(new THREE.BoxGeometry(110, 0.2, 86), groundMat);
  ground.position.y = -0.1;
  scene.add(ground);

  const colliders = [];
  const boxGeoCache = new Map();
  const matCache = new Map();
  const geometryFor = (w, h, d) => {
    const key = `${w}|${h}|${d}`;
    if (!boxGeoCache.has(key)) boxGeoCache.set(key, new THREE.BoxGeometry(w, h, d));
    return boxGeoCache.get(key);
  };
  const materialFor = (key) => {
    if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color: PALETTE[key] }));
    return matCache.get(key);
  };

  for (const b of BLOCKS) {
    const mesh = new THREE.Mesh(geometryFor(b.w, b.h, b.d), materialFor(b.mat));
    mesh.position.set(b.x, (b.y ?? 0) + b.h / 2, b.z);
    scene.add(mesh);
    if (b.solid !== false) {
      colliders.push({ minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2, h: b.h });
    }
  }

  // Silo cylinders standing on their square bases, and salt piles: pure
  // dressing over colliders that already exist (or none, at the edges).
  const siloMat = materialFor('salt');
  for (const [x, z] of [[30, -28], [41, -20]]) {
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 13, 20), materialFor('metal'));
    silo.position.set(x, 6.5, z);
    scene.add(silo);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 0.5, 20), siloMat);
    cap.position.set(x, 13.2, z);
    scene.add(cap);
  }
  const pileMat = materialFor('salt');
  for (const [x, z, s] of [[-47, 32, 3], [47, -34, 2.4], [-20, -36, 2], [22, 34, 2.6]]) {
    const pile = new THREE.Mesh(new THREE.ConeGeometry(s, s * 0.55, 14), pileMat);
    pile.position.set(x, s * 0.27, z);
    scene.add(pile);
  }
  // Cistern water: a teal disc inside the A rim.
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(6.8, 24),
    new THREE.MeshLambertMaterial({ color: 0x3fa8a0 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(-34, 0.06, -21);
  scene.add(water);

  // Site rings and floating letters, so both sites read at a glance.
  for (const site of [SITES.A, SITES.B]) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.r - 0.5, site.r, 40),
      new THREE.MeshBasicMaterial({ color: site.id === 'A' ? PALETTE.teal : PALETTE.rust, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.05, site.z);
    scene.add(ring);
    const letter = makeTextSprite(site.id, site.id === 'A' ? '#7fe3da' : '#ffb59a');
    letter.position.set(site.x, 3.6, site.z);
    scene.add(letter);
  }

  // Painted lane lines down the three lanes.
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xe8e0cc });
  for (const [x, z, w, d] of [[-40, 16, 0.35, 14], [40, 16, 0.35, 14], [0, 20, 0.35, 12], [-17, -21, 12, 0.35], [17, -21, 12, 0.35]]) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, d), lineMat);
    line.position.set(x, 0.02, z);
    scene.add(line);
  }

  return { colliders, sites: SITES, spawns: SPAWNS, graph: buildGraph() };
}
