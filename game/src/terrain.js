// Kestrel Valley terrain: one deterministic heightfield, a river, a town,
// three out-strips and the pine forest. The same heightAt() drives both the
// visible mesh and the flight model's ground collisions, so what you see is
// exactly what you can hit.

import * as THREE from 'three';
import { WORLD, RUNWAY, OUT_STRIPS } from './config.js';
import { fbm, mulberry32, clamp, lerp } from './rng.js';

const SEED = WORLD.seed;

function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// The river meanders down the west side of the valley, bending further
// west past Kestrel Field so it never crosses the main strip.
export function riverX(z) {
  const bend = -260 * Math.exp(-(((z - 300) / 260) ** 2));
  return -420 + 300 * Math.sin(z * 0.0011 + 1.2) + 120 * Math.sin(z * 0.0029) + bend;
}

function flattenMask(x, z, cx, cz, rx, rz) {
  const dx = (x - cx) / rx, dz = (z - cz) / rz;
  const d = Math.sqrt(dx * dx + dz * dz);
  return 1 - smoothstep(0.55, 1.0, d);
}

export function groundHeight(x, z) {
  const half = WORLD.size / 2;
  const r = Math.hypot(x, z) / half;
  // Rim mountains rise toward the map edge.
  const rim = smoothstep(0.52, 1.02, r) * WORLD.mountainHeight;
  // Rolling hills, stronger away from the valley floor.
  const hills = fbm(x * 0.0016 + 7.3, z * 0.0016 + 2.1, SEED, 4) * 95
    + fbm(x * 0.007 + 1.7, z * 0.007 + 8.4, SEED + 31, 3) * 26;
  const valleyFloor = 4 + fbm(x * 0.004, z * 0.004, SEED + 77, 3) * 5;
  // The valley corridor (|x| small) stays low; the walls rise with |x|.
  const corridor = smoothstep(140, 1150, Math.abs(x));
  let h = lerp(valleyFloor, valleyFloor + Math.max(0, hills) + rim, corridor);
  h += rim * 0.35;
  // Carve the river bed.
  const riverDist = Math.abs(x - riverX(z));
  h = lerp(-3, h, smoothstep(18, 90, riverDist));
  // Flatten the airfields and the town apron.
  const flat = Math.max(
    flattenMask(x, z, RUNWAY.x, RUNWAY.z, 560, 420),
    ...OUT_STRIPS.map((s) => flattenMask(x, z, s.x, s.z, 320, 300)),
    flattenMask(x, z, 320, 620, 420, 320),
  );
  h = lerp(h, RUNWAY.thresholdAlt, flat);
  return h;
}

function groundColor(x, z, h, rng) {
  // Slope from a quick finite difference, for rock on steep faces.
  const slope = Math.abs(groundHeight(x + 6, z) - h) + Math.abs(groundHeight(x, z + 6) - h);
  const n = fbm(x * 0.02, z * 0.02, SEED + 55, 2);
  const forest = fbm(x * 0.003 + 4, z * 0.003 + 9, SEED + 91, 3) > 0.18;
  let r, g, b;
  if (h > WORLD.snowLine && slope > 2) { r = 0.92; g = 0.93; b = 0.96; }          // snow
  else if (slope > 9 || h > 380) { r = 0.42; g = 0.38; b = 0.34; }                  // bare rock
  else if (forest && h < WORLD.treeLine) { r = 0.16; g = 0.32; b = 0.13; }         // forest floor
  else if (h < 6) { r = 0.72; g = 0.66; b = 0.45; }                                 // river sand
  else { r = 0.32 + n * 0.06; g = 0.5 + n * 0.07; b = 0.2 + n * 0.03; }            // meadow
  const shade = 0.92 + rng() * 0.12;
  return [r * shade, g * shade, b * shade];
}

export function buildTerrain(scene) {
  const rng = mulberry32(SEED);
  const size = WORLD.size, seg = WORLD.segments;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = groundHeight(x, z);
    pos.setY(i, h);
    const [r, g, b] = groundColor(x, z, h, rng);
    colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
  );
  ground.receiveShadow = true;
  scene.add(ground);

  buildRiver(scene);
  buildStrips(scene);
  buildTown(scene, rng);
  buildForest(scene, rng);
  return { groundHeight };
}

function buildRiver(scene) {
  const points = [];
  for (let z = -WORLD.size / 2; z <= WORLD.size / 2; z += 60) {
    points.push(new THREE.Vector3(riverX(z), 0.9, z));
  }
  const ribbon = [];
  const width = 46;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(width / 2);
    ribbon.push(a.x - side.x, 0.9, a.z - side.z, a.x + side.x, 0.9, a.z + side.z,
      b.x - side.x, 0.9, b.z - side.z, b.x + side.x, 0.9, b.z + side.z,
      b.x - side.x, 0.9, b.z - side.z, a.x + side.x, 0.9, a.z + side.z);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(ribbon, 3));
  geo.computeVertexNormals();
  const water = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0x35749e, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.8 }),
  );
  scene.add(water);
}

function stripMesh(x, z, heading, length, width, name) {
  const group = new THREE.Group();
  const asphalt = new THREE.Mesh(
    new THREE.PlaneGeometry(width, length),
    new THREE.MeshStandardMaterial({ color: 0x2e2e33, roughness: 0.95 }),
  );
  asphalt.rotation.x = -Math.PI / 2;
  asphalt.position.y = 0.15;
  asphalt.receiveShadow = true;
  group.add(asphalt);
  // Centreline dashes and threshold bars.
  const paint = new THREE.MeshStandardMaterial({ color: 0xf5f2e8, roughness: 0.9 });
  for (let d = -length / 2 + 30; d < length / 2 - 20; d += 40) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 18), paint);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, 0.2, d);
    group.add(dash);
  }
  for (const end of [-1, 1]) {
    for (let i = -2; i <= 2; i++) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(3, 14), paint);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(i * 4.4, 0.2, end * (length / 2 - 14));
      group.add(bar);
    }
  }
  // Edge lights.
  const lightGeo = new THREE.SphereGeometry(0.55, 6, 6);
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xffc861, emissive: 0xff9d00, emissiveIntensity: 1.6 });
  for (let d = -length / 2 + 10; d <= length / 2 - 10; d += 60) {
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(lightGeo, lightMat);
      lamp.position.set(side * (width / 2 + 2), 0.6, d);
      group.add(lamp);
    }
  }
  // Windsock.
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 9, 6),
    new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.6 }),
  );
  pole.position.set(width / 2 + 12, 4.5, -length / 2 + 30);
  group.add(pole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(1.5, 5, 8),
    new THREE.MeshStandardMaterial({ color: 0xff6b35, roughness: 0.7 }),
  );
  sock.rotation.z = Math.PI / 2;
  sock.position.set(width / 2 + 15.5, 8.6, -length / 2 + 30);
  group.add(sock);
  group.position.set(x, RUNWAY.thresholdAlt + 0.1, z);
  group.rotation.y = heading;
  group.userData.stripName = name;
  return group;
}

function buildStrips(scene) {
  scene.add(stripMesh(RUNWAY.x, RUNWAY.z, RUNWAY.heading, RUNWAY.length, RUNWAY.width, 'Kestrel Field'));
  for (const s of OUT_STRIPS) {
    scene.add(stripMesh(s.x, s.z, s.heading, s.length, s.width, s.name));
  }
  // Two hangars and a fuel hut beside the main strip.
  const hangarMat = new THREE.MeshStandardMaterial({ color: 0x8a7f72, roughness: 0.85 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5d6b7a, roughness: 0.8 });
  for (const [hx, hz, w] of [[-58, 330, 34], [-58, 390, 26]]) {
    const hangar = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, 12, 30), hangarMat);
    body.position.y = 6;
    hangar.add(body);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, w / 2 + 1, 30, 4, 1), roofMat);
    roof.rotation.x = Math.PI / 2; roof.rotation.y = Math.PI / 4;
    roof.scale.set(1, 1, 1);
    roof.position.y = 13.5;
    hangar.add(roof);
    hangar.position.set(hx, RUNWAY.thresholdAlt, hz);
    scene.add(hangar);
  }
}

function buildTown(scene, rng) {
  const bodyGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofGeo = new THREE.ConeGeometry(0.75, 0.6, 4);
  const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  const spots = [];
  for (let i = 0; i < 90; i++) {
    const x = 180 + rng() * 420, z = 380 + rng() * 460;
    if (Math.abs(x - RUNWAY.x) < 90 && Math.abs(z - RUNWAY.z) < 380) continue;
    spots.push([x, z]);
  }
  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, spots.length);
  const roofs = new THREE.InstancedMesh(roofGeo, roofMat, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const palette = [0xe8dcc8, 0xd9b48a, 0xc9a06a, 0xb98d5f, 0xe0cfae];
  const roofPalette = [0x9e3d2e, 0x5d6b7a, 0x7a4a2e, 0x4a5d3a];
  spots.forEach(([x, z], i) => {
    const w = 9 + rng() * 7, h = 6 + rng() * 5, d = 9 + rng() * 7;
    const y = groundHeight(x, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI);
    m.compose(new THREE.Vector3(x, y + h / 2, z), q, new THREE.Vector3(w, h, d));
    bodies.setMatrixAt(i, m);
    bodies.setColorAt(i, new THREE.Color(palette[i % palette.length]));
    m.compose(new THREE.Vector3(x, y + h + 0.3, z), q, new THREE.Vector3(w * 1.05, h * 0.55, d * 1.05));
    roofs.setMatrixAt(i, m);
    roofs.setColorAt(i, new THREE.Color(roofPalette[i % roofPalette.length]));
  });
  bodies.castShadow = true;
  scene.add(bodies, roofs);
}

function buildForest(scene, rng) {
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 5, 5);
  const crownGeo = new THREE.ConeGeometry(4.2, 14, 7);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4128, roughness: 1 });
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x2c5a26, roughness: 1 });
  const spots = [];
  let guard = 0;
  while (spots.length < 1400 && guard++ < 20000) {
    const x = (rng() * 2 - 1) * (WORLD.size / 2 - 80);
    const z = (rng() * 2 - 1) * (WORLD.size / 2 - 80);
    const h = groundHeight(x, z);
    if (h > WORLD.treeLine || h < 4) continue;
    if (Math.abs(x - riverX(z)) < 60) continue;
    if (Math.abs(x - RUNWAY.x) < 320 && Math.abs(z - RUNWAY.z) < 420) continue;
    if (OUT_STRIPS.some((st) => Math.abs(x - st.x) < 200 && Math.abs(z - st.z) < 200)) continue;
    if (Math.abs(x - 380) < 320 && Math.abs(z - 620) < 300) continue;
    spots.push([x, z, h]);
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, spots.length);
  const m = new THREE.Matrix4();
  spots.forEach(([x, z, h], i) => {
    const s = 0.8 + rng() * 0.7;
    m.makeScale(s, s, s);
    m.setPosition(x, h + 2.5 * s, z);
    trunks.setMatrixAt(i, m);
    m.makeScale(s, s, s);
    m.setPosition(x, h + (5 + 7) * s, z);
    crowns.setMatrixAt(i, m);
  });
  crowns.castShadow = true;
  scene.add(trunks, crowns);
}
