// Flight model: an arcade model with real bones — lift grows with speed
// squared, the wing stalls, flaps trade drag for lift, and the ground is
// only forgiving when you meet it gently and straight.

import * as THREE from 'three';
import { PLANE, RUNWAY, OUT_STRIPS } from './config.js';
import { groundHeight, riverX } from './terrain.js';
import { clamp, lerp, damp, degToRad } from './rng.js';

export const FlightPhase = {
  PARKED: 'parked', FLYING: 'flying', LANDED: 'landed',
  CRASHED: 'crashed', DITCHED: 'ditched',
};

export class FlightModel {
  constructor() {
    this.reset();
  }

  reset() {
    this.position = new THREE.Vector3(RUNWAY.x, RUNWAY.thresholdAlt + 1.6, RUNWAY.z + 180);
    this.heading = 0;               // radians, 0 = north (-Z)
    this.pitch = 0;                 // radians, nose up positive
    this.roll = 0;                  // radians
    this.speed = 0;                 // m/s along the nose
    this.verticalSpeed = 0;         // m/s
    this.throttle = 0;              // 0..1
    this.flaps = false;
    this.gearDown = true;
    this.fuel = PLANE.maxFuel;
    this.damage = 0;
    this.phase = FlightPhase.PARKED;
    this.onGround = true;
    this.groundSpeed = 0;
    this.stalled = false;
    this.airborneTime = 0;
    this.lastLanding = null;        // { vs, centreOffset, speed, quality }
    this.crashReason = '';
    this.takeoffSpeed = 0;
  }

  get altitude() { return this.position.y - groundHeight(this.position.x, this.position.z); }
  get altitudeMsl() { return this.position.y; }
  get knots() { return this.speed * 1.944; }
  get headingDeg() { return ((360 - (this.heading * 180) / Math.PI) % 360 + 360) % 360; }

  update(dt, input, weather, timeScale = 1) {
    dt *= timeScale;
    if (this.phase === FlightPhase.CRASHED || this.phase === FlightPhase.DITCHED) return;

    // Throttle: W/S keys, clamped, with a slow spool so it feels mechanical.
    const throttleTarget = clamp(this.throttle + (input.throttleUp ? dt * 0.7 : 0)
      - (input.throttleDown ? dt * 0.7 : 0), 0, 1);
    this.throttle = damp(this.throttle, throttleTarget, 8, dt);

    // Fuel burn follows the throttle; empty tank means a glider.
    if (this.throttle > 0.02 && this.fuel > 0) {
      this.fuel = Math.max(0, this.fuel - lerp(0.12, PLANE.fuelBurnFull, this.throttle) * dt);
    }
    const hasPower = this.fuel > 0;

    // Control authority fades at low speed — the plane answers everywhere,
    // but sluggishly when it is barely flying.
    const authority = clamp(this.speed / 45, 0.25, 1);
    const rollRate = 1.9 * authority;
    const pitchRate = 1.15 * authority;
    const targetRoll = clamp(input.roll * 1.15, -1.15, 1.15);
    const targetPitch = clamp(input.pitch * 0.5, -0.45, 0.5);
    this.roll = damp(this.roll, targetRoll, 3.2, dt);
    const pitchTarget = this.onGround ? clamp(targetPitch, -0.06, 0.22) : targetPitch;
    this.pitch = damp(this.pitch, pitchTarget, 2.6, dt);
    // Yaw: rudder plus a coordinated turn from bank.
    this.heading -= (Math.sin(this.roll) * 0.55 + input.yaw * 0.5 * authority) * dt
      * clamp(this.speed / 30, 0.3, 1);
    // Wind gusts push the nose in the storm.
    if (weather.gust > 0) {
      this.heading += Math.sin(performance.now() * 0.0011) * weather.gust * 0.00012 * dt * 60;
      this.roll += Math.sin(performance.now() * 0.0017 + 2) * weather.gust * 0.0009 * dt * 60;
    }

    // Forces along the nose. Thrust balances drag near 75% throttle at
    // cruise speed; push the nose down or pull back to trade speed for climb.
    const thrust = hasPower ? this.throttle * 22 : 0;
    const dragK = 0.0042 + (this.gearDown ? PLANE.gearDrag : 0) + (this.flaps ? PLANE.flapDrag : 0);
    const drag = dragK * this.speed * this.speed + 0.35;
    const accel = thrust - drag - Math.sin(this.pitch) * 9.81 * 0.9;
    this.speed = Math.max(0, this.speed + accel * dt);

    // Lift is 1.0 at cruise speed: level at cruise, sinking below it,
    // climbing when fast or pitched up. Below stall speed the wing quits.
    const liftFactor = this.flaps ? PLANE.flapLift : 1;
    const stall = PLANE.stallSpeed * (this.flaps ? 0.86 : 1);
    this.stalled = !this.onGround && this.speed < stall;
    const lift = this.stalled ? 0.3 : (this.speed * this.speed) / (PLANE.cruiseSpeed * PLANE.cruiseSpeed) * liftFactor;
    const climbTarget = this.onGround ? 0 : (lift - 1) * 9.5 + Math.sin(this.pitch) * this.speed * 0.9;
    this.verticalSpeed = damp(this.verticalSpeed, climbTarget, 1.4, dt);

    // Move along the nose, plus climb.
    const forward = new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
    this.position.addScaledVector(forward, this.speed * dt);
    this.position.y += this.verticalSpeed * dt;

    // Takeoff: fast enough and pulling up lifts off the strip.
    const ground = groundHeight(this.position.x, this.position.z);
    if (this.onGround) {
      this.position.y = ground + 1.6;
      this.groundSpeed = this.speed;
      if (this.speed > stall * 1.05 && this.pitch > 0.08) {
        this.onGround = false;
        this.phase = FlightPhase.FLYING;
        this.takeoffSpeed = this.speed;
      }
      // Rolling off the strip into rough ground slows and shakes the plane.
      if (!this.onStrip() && this.speed > 12) {
        this.speed = Math.max(8, this.speed - 14 * dt);
        this.damage = Math.min(PLANE.maxDamage, this.damage + 2 * dt);
      }
    } else {
      this.airborneTime += dt;
      // Ground contact in the air: a gentle touchdown, or a crash when the
      // slope is steep, the sink rate is wild, or the river catches you.
      if (this.position.y <= ground + 1.6) {
        const slope = (Math.abs(groundHeight(this.position.x + 8, this.position.z) - ground)
          + Math.abs(groundHeight(this.position.x, this.position.z + 8) - ground)) / 8;
        if (slope > 0.45) {
          this.crash('Flew into the mountainside.');
        } else if (-this.verticalSpeed > 11) {
          this.crash('Hit the ground too hard — the airframe broke up.');
        } else {
          this.touchDown(ground);
        }
      }
      // Water: the river is a ditching, not a landing.
      if (this.phase === FlightPhase.FLYING && this.position.y < 1.4
        && Math.abs(this.position.x - riverX(this.position.z)) < 22) {
        this.phase = FlightPhase.DITCHED;
        this.crashReason = 'Ditched in the river. The Kestrel floats, barely.';
      }
    }

    if (this.damage >= PLANE.maxDamage) {
      this.crash('Airframe failure — too much damage to keep flying.');
    }
  }

  onStrip() {
    // Within any strip rectangle (in that strip's own frame) counts as runway.
    const strips = [{ x: RUNWAY.x, z: RUNWAY.z, heading: RUNWAY.heading, length: RUNWAY.length, width: RUNWAY.width },
      ...OUT_STRIPS];
    for (const s of strips) {
      const dx = this.position.x - s.x, dz = this.position.z - s.z;
      const cos = Math.cos(-s.heading), sin = Math.sin(-s.heading);
      const lx = dx * cos - dz * sin, lz = dx * sin + dz * cos;
      if (Math.abs(lx) < s.width / 2 + 14 && Math.abs(lz) < s.length / 2 + 14) return true;
    }
    return false;
  }

  touchDown(ground) {
    const vs = -this.verticalSpeed;
    const centre = Math.abs(this.position.x - RUNWAY.x);
    const aligned = Math.abs(this.roll) < 0.25 && Math.abs(Math.sin(this.heading)) < 0.2;
    this.position.y = ground + 1.6;
    this.verticalSpeed = 0;
    this.onGround = true;
    this.phase = FlightPhase.LANDED;
    const hard = vs > 6 || this.speed > 55;
    const quality = hard ? 'hard' : vs > 3.5 ? 'firm' : 'smooth';
    this.lastLanding = { vs, centreOffset: centre, speed: this.speed, quality, aligned };
    if (vs > 9 || this.speed > 68) {
      this.damage += 45;
      this.crash('Heavy landing — the gear folded on touchdown.');
      return;
    }
    if (vs > 6) this.damage += 12;
    else if (vs > 3.5) this.damage += 4;
    // A good landing on a strip refuels the plane.
    if (this.onStrip()) this.fuel = Math.min(PLANE.maxFuel, this.fuel + 60);
  }

  crash(reason) {
    if (this.phase === FlightPhase.CRASHED) return;
    this.phase = FlightPhase.CRASHED;
    this.crashReason = reason;
    this.speed = 0;
    this.verticalSpeed = 0;
  }

  applyOrientation(object3d) {
    // Model space is nose-forward on -Z; rotateY(heading) maps -Z onto the
    // flight direction (-sin h, 0, -cos h), then pitch about the wing axis
    // and roll about the nose axis, in that order.
    object3d.position.copy(this.position);
    object3d.rotation.set(0, 0, 0);
    object3d.rotateY(this.heading);
    object3d.rotateX(this.pitch);
    // Positive roll banks right (right wing down), matching the turn.
    object3d.rotateZ(-this.roll);
  }
}
