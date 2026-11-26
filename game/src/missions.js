// Missions: three different ways to fly the same valley.
//  - Ring Run: ten rings down the valley against the clock.
//  - Courier: three parcels to three short strips; landing quality is scored.
//  - Storm Rescue: a stranded hiker on Ridge Top, in the rain, and back.
// The manager owns the rings, the beacons and the score; the game loop
// only asks it what to show and what happened.

import * as THREE from 'three';
import { MISSIONS, OUT_STRIPS, RUNWAY } from './config.js';
import { groundHeight, riverX } from './terrain.js';
import { mulberry32, clamp } from './rng.js';

export const MissionKind = { NONE: 'none', RINGS: 'rings', COURIER: 'courier', RESCUE: 'rescue' };

function ringCourse() {
  const rng = mulberry32(4242);
  const rings = [];
  let x = 0, z = 900;
  for (let i = 0; i < MISSIONS.rings.ringCount; i++) {
    z -= 240 + rng() * 120;
    x = clamp(x + (rng() - 0.5) * 700, -900, 900);
    const ground = groundHeight(x, z);
    const alt = ground + 70 + rng() * 110;
    rings.push(new THREE.Vector3(x, alt, z));
  }
  return rings;
}

export class MissionManager {
  constructor(scene) {
    this.scene = scene;
    this.kind = MissionKind.NONE;
    this.score = 0;
    this.status = '';
    this.objective = 'Pick a mission — 1 Ring Run, 2 Courier, 3 Rescue';
    this.timeLeft = 0;
    this.rings = [];
    this.ringMeshes = [];
    this.nextRing = 0;
    this.parcels = 0;
    this.deliveries = 0;
    this.deliveredStrips = new Set();
    this.rescued = false;
    this.returned = false;
    this.finished = false;
    this.finishText = '';
    this.beacon = null;
    this.beaconLight = null;
    this.ringGroup = new THREE.Group();
    scene.add(this.ringGroup);
  }

  clearCourse() {
    for (const m of this.ringMeshes) {
      this.ringGroup.remove(m);
      m.geometry.dispose();
    }
    this.ringMeshes = [];
    this.rings = [];
    this.nextRing = 0;
    if (this.beacon) { this.scene.remove(this.beacon); this.beacon = null; }
    if (this.beaconLight) { this.scene.remove(this.beaconLight); this.beaconLight = null; }
  }

  start(kind) {
    this.clearCourse();
    this.kind = kind;
    this.finished = false;
    this.finishText = '';
    this.deliveries = 0;
    this.deliveredStrips.clear();
    this.rescued = false;
    this.returned = false;
    if (kind === MissionKind.RINGS) {
      this.rings = ringCourse();
      this.timeLeft = MISSIONS.rings.timeLimit;
      this.objective = `Ring Run — fly through ${this.rings.length} rings`;
      this.status = 'Rings: 0 / ' + this.rings.length;
      this.rings.forEach((pos, i) => this.addRing(pos, i));
    } else if (kind === MissionKind.COURIER) {
      this.parcels = MISSIONS.courier.parcels;
      this.objective = 'Courier — deliver 3 parcels to 3 strips';
      this.status = `Parcels on board: ${this.parcels}`;
      this.setBeacon(this.nextStripTarget());
    } else if (kind === MissionKind.RESCUE) {
      this.timeLeft = MISSIONS.rescue.timeLimit;
      this.objective = 'Rescue — pick up the hiker at Ridge Top';
      this.status = 'Fly to Ridge Top in the storm';
      this.setBeacon(new THREE.Vector3(OUT_STRIPS[2].x, groundHeight(OUT_STRIPS[2].x, OUT_STRIPS[2].z) + 40, OUT_STRIPS[2].z));
    }
  }

  nextStripTarget() {
    const remaining = OUT_STRIPS.filter((s) => !this.deliveredStrips.has(s.id));
    if (!remaining.length) return null;
    const s = remaining[0];
    return new THREE.Vector3(s.x, groundHeight(s.x, s.z) + 40, s.z);
  }

  addRing(pos, index) {
    const geo = new THREE.TorusGeometry(16, 1.6, 10, 28);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xff7a1a, emissive: 0xff5a00, emissiveIntensity: 0.9, roughness: 0.4,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.position.copy(pos);
    ring.userData.index = index;
    this.ringGroup.add(ring);
    this.ringMeshes.push(ring);
    // A faint centre disc so the hole reads at a distance.
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(15, 24),
      new THREE.MeshBasicMaterial({ color: 0xffb36b, transparent: true, opacity: 0.08, side: THREE.DoubleSide }),
    );
    disc.position.copy(pos);
    this.ringGroup.add(disc);
    this.ringMeshes.push(disc);
  }

  setBeacon(pos) {
    if (this.beacon) this.scene.remove(this.beacon);
    if (!pos) { this.beacon = null; return; }
    const geo = new THREE.CylinderGeometry(2.5, 2.5, 220, 10, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffe066, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false,
    });
    this.beacon = new THREE.Mesh(geo, mat);
    this.beacon.position.set(pos.x, pos.y + 90, pos.z);
    this.scene.add(this.beacon);
    const light = new THREE.PointLight(0xffe066, 60, 300);
    light.position.copy(pos);
    this.beaconLight = light;
    this.scene.add(light);
  }

  // Called every frame; returns an event string for the HUD/audio, or ''.
  update(dt, flight) {
    if (this.kind === MissionKind.NONE || this.finished) return '';
    let event = '';
    if (this.kind === MissionKind.RINGS) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.finish(false, `Out of time — ${this.nextRing} of ${this.rings.length} rings.`);
        return 'timeup';
      }
      const target = this.rings[this.nextRing];
      if (target) {
        const d = flight.position.distanceTo(target);
        if (d < 17) {
          const mesh = this.ringMeshes[this.nextRing * 2];
          mesh.material.color.set(0x2ecc71);
          mesh.material.emissive.set(0x1e9e4a);
          this.nextRing += 1;
          this.score += MISSIONS.rings.ringScore;
          this.status = `Rings: ${this.nextRing} / ${this.rings.length}`;
          event = 'ring';
          if (this.nextRing >= this.rings.length) {
            const bonus = Math.round(this.timeLeft) * MISSIONS.rings.timeBonusPerSec;
            this.score += bonus;
            this.finish(true, `Ring Run complete! Time bonus +${bonus}.`);
            return 'complete';
          }
        }
        // Pulse the next ring so the pilot can find it.
        const mesh = this.ringMeshes[this.nextRing * 2];
        const pulse = 1 + Math.sin(performance.now() * 0.006) * 0.08;
        mesh.scale.setScalar(pulse);
      }
    } else if (this.kind === MissionKind.COURIER) {
      if (flight.phase === 'landed' && flight.lastLanding) {
        const strip = this.stripUnder(flight.position);
        if (strip && !this.deliveredStrips.has(strip.id) && this.parcels > 0) {
          this.deliveredStrips.add(strip.id);
          this.parcels -= 1;
          this.deliveries += 1;
          const landing = flight.lastLanding;
          const landingBonus = landing.quality === 'smooth'
            ? MISSIONS.courier.landingBonusMax
            : landing.quality === 'firm' ? 120 : 30;
          this.score += MISSIONS.courier.deliveryScore + landingBonus;
          this.status = `Delivered to ${strip.name} (${landing.quality} landing +${landingBonus}) — ${this.parcels} left`;
          flight.lastLanding = null;
          event = 'deliver';
          const next = this.nextStripTarget();
          if (next) this.setBeacon(next);
          else {
            this.finish(true, `All parcels delivered! Return to Kestrel Field for a bonus landing.`);
            return 'complete';
          }
        }
      }
    } else if (this.kind === MissionKind.RESCUE) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0 && !this.rescued) {
        this.finish(false, 'The storm closed in — the hiker waits for another pilot.');
        return 'timeup';
      }
      const ridge = OUT_STRIPS[2];
      if (!this.rescued && flight.phase === 'landed'
        && Math.hypot(flight.position.x - ridge.x, flight.position.z - ridge.z) < 200) {
        this.rescued = true;
        this.score += MISSIONS.rescue.rescueScore;
        this.status = 'Hiker aboard! Get back to Kestrel Field.';
        this.objective = 'Rescue — bring the hiker home';
        this.setBeacon(new THREE.Vector3(RUNWAY.x, groundHeight(RUNWAY.x, RUNWAY.z) + 40, RUNWAY.z));
        flight.lastLanding = null;
        event = 'rescue';
      } else if (this.rescued && flight.phase === 'landed'
        && Math.hypot(flight.position.x - RUNWAY.x, flight.position.z - RUNWAY.z) < 320) {
        this.score += MISSIONS.rescue.returnBonus;
        this.finish(true, 'Hiker home safe. The valley owes you one.');
        return 'complete';
      }
    }
    return event;
  }

  stripUnder(pos) {
    for (const s of OUT_STRIPS) {
      if (Math.hypot(pos.x - s.x, pos.z - s.z) < s.length / 2) return s;
    }
    return null;
  }

  finish(won, text) {
    this.finished = true;
    this.finishText = text;
    this.status = won ? 'Mission complete' : 'Mission failed';
    if (this.beacon) { this.scene.remove(this.beacon); this.beacon = null; }
    if (this.beaconLight) { this.scene.remove(this.beaconLight); this.beaconLight = null; }
  }

  reset() {
    this.clearCourse();
    this.kind = MissionKind.NONE;
    this.score = 0;
    this.status = '';
    this.objective = 'Pick a mission — 1 Ring Run, 2 Courier, 3 Rescue';
    this.timeLeft = 0;
    this.finished = false;
    this.finishText = '';
  }
}
