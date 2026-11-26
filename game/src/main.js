// Sky Courier — boot, game loop, camera and state machine.
// Menu -> playing -> paused / crashed / mission complete, with the chase
// camera doing the flying-camera work and the cockpit camera for landings.

import * as THREE from 'three';
import { WORLD, CAMERA, WEATHER, RUNWAY } from './config.js';
import { buildTerrain, groundHeight } from './terrain.js';
import { buildAircraft, animateAircraft } from './plane.js';
import { buildSky, applyAtmosphere } from './sky.js';
import { FlightModel, FlightPhase } from './flight.js';
import { MissionManager, MissionKind } from './missions.js';
import { InputState } from './input.js';
import { Hud } from './hud.js';
import { AudioEngine } from './audio.js';
import { applyShot } from './shots.js';
import { clamp, lerp, damp } from './rng.js';

const NEUTRAL_INPUT = { pitch: 0, roll: 0, yaw: 0, throttleUp: false, throttleDown: false };

export class SkyCourierGame {
  constructor() {
    this.state = 'menu';
    this.timeOfDay = 0.42;          // late morning by default
    this.weather = WEATHER.clear;
    this.weatherName = 'Clear · light wind';
    this.cameraMode = 'chase';
    this.muted = false;
    this.shotMode = null;
    this.shotFrames = 0;
    this.elapsed = 0;
    this.cameraOnTarget = true;
    this.crashShown = false;
    this.warnedStall = false;
    this.warnedFuel = false;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    document.getElementById('scene').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xc8d8e8, 0.00016);
    this.camera = new THREE.PerspectiveCamera(CAMERA.fovBase, window.innerWidth / window.innerHeight, 0.5, 9000);
    this.camera.position.set(0, 60, 260);

    buildTerrain(this.scene);
    this.sky = buildSky(this.scene, this.renderer);
    const aircraft = buildAircraft();
    this.planeRig = aircraft;
    this.scene.add(aircraft.group);

    this.flight = new FlightModel();
    this.mission = new MissionManager(this.scene);
    this.input = new InputState();
    this.input.attach(this.renderer.domElement);
    this.hud = new Hud(document.getElementById('hud'));
    this.audio = new AudioEngine();
    this.camPos = new THREE.Vector3(0, 60, 260);
    this.camLook = new THREE.Vector3(0, 10, 0);

    window.addEventListener('resize', () => this.onResize());
    const params = new URLSearchParams(window.location.search);
    const shot = params.get('shot');
    if (params.get('debug')) {
      window.__skyDebug = () => JSON.stringify({
        calls: this.renderer.info.render.calls,
        tris: this.renderer.info.render.triangles,
        cam: this.camera.position.toArray().map((v) => Math.round(v)),
        plane: this.flight.position.toArray().map((v) => Math.round(v)),
        children: this.scene.children.length,
        state: this.state,
        speed: Math.round(this.flight.speed * 10) / 10,
        phase: this.flight.phase,
        fuel: Math.round(this.flight.fuel),
        mission: this.mission.kind,
        missionStatus: this.mission.status,
        score: this.mission.score,
      });
    }
    if (shot) {
      this.state = 'playing';
      applyShot(this, shot);
      this.audio.muted = true;
      this.muted = true;
    }
  }

  get timeLabel() {
    const minutes = Math.round(lerp(360, 1170, this.timeOfDay));
    const hh = Math.floor(minutes / 60), mm = minutes % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  startMission(kind) {
    this.flight.reset();
    this.mission.start(kind);
    this.state = 'playing';
    this.crashShown = false;
    this.audio.resume();
    if (kind === MissionKind.RESCUE) {
      this.timeOfDay = 0.97;
      this.weather = WEATHER.storm;
      this.weatherName = 'Storm · heavy rain';
    } else if (kind === MissionKind.RINGS) {
      this.timeOfDay = 0.42;
      this.weather = WEATHER.clear;
      this.weatherName = 'Clear · light wind';
    } else if (kind === MissionKind.COURIER) {
      this.timeOfDay = 0.86;
      this.weather = WEATHER.dusk;
      this.weatherName = 'Golden hour · calm';
    }
    this.hud.toast(kind === MissionKind.NONE ? 'Free flight — the valley is yours' : 'Mission started — good flying');
  }

  handleKeys() {
    const input = this.input;
    if (input.take('KeyM')) {
      this.muted = this.audio.toggleMute();
      this.hud.toast(this.muted ? 'Sound off' : 'Sound on');
    }
    if (input.take('KeyC')) {
      this.cameraMode = this.cameraMode === 'chase' ? 'cockpit' : 'chase';
      this.hud.toast(this.cameraMode === 'cockpit' ? 'Cockpit view' : 'Chase view');
    }
    if (this.state === 'menu') {
      if (input.take('Digit1')) this.startMission(MissionKind.RINGS);
      else if (input.take('Digit2')) this.startMission(MissionKind.COURIER);
      else if (input.take('Digit3')) this.startMission(MissionKind.RESCUE);
      else if (input.take('Digit0')) this.startMission(MissionKind.NONE);
      return;
    }
    if (input.take('KeyP')) {
      if (this.state === 'playing') this.state = 'paused';
      else if (this.state === 'paused') this.state = 'playing';
      return;
    }
    if (input.take('KeyR') && (this.state === 'crashed' || this.state === 'complete' || this.state === 'playing')) {
      this.startMission(this.mission.kind);
      return;
    }
    if (this.state === 'complete') {
      if (input.take('Digit1')) this.startMission(MissionKind.RINGS);
      else if (input.take('Digit2')) this.startMission(MissionKind.COURIER);
      else if (input.take('Digit3')) this.startMission(MissionKind.RESCUE);
      return;
    }
    if (this.state !== 'playing') return;
    if (input.take('KeyG')) {
      this.flight.gearDown = !this.flight.gearDown;
      this.hud.toast(this.flight.gearDown ? 'Gear down' : 'Gear up');
      this.audio.blip(this.flight.gearDown ? 440 : 520, 0.1, 'square', 0.08);
    }
    if (input.take('KeyF')) {
      this.flight.flaps = !this.flight.flaps;
      this.hud.toast(this.flight.flaps ? 'Flaps down — slower, more lift' : 'Flaps up');
    }
  }

  // One simulation step. silent=true skips audio and input (screenshot staging).
  tick(dt, silent = false) {
    this.elapsed += dt;
    if (!silent) {
      this.input.poll();
      this.handleKeys();
    }
    const active = this.state === 'playing';
    const input = silent ? NEUTRAL_INPUT : this.input;
    if (active) {
      const wasFlying = !this.flight.onGround;
      this.flight.update(dt, input, this.weather);
      const event = this.mission.update(dt, this.flight);
      if (event === 'ring') { this.audio.chime(); this.hud.toast('Ring! +' + 150); }
      if (event === 'deliver') { this.audio.chime(); this.hud.toast('Parcel delivered'); }
      if (event === 'rescue') { this.audio.chime(); this.hud.toast('Hiker aboard — take them home!'); }
      if (event === 'complete') {
        this.state = 'complete';
        this.audio.chime();
      }
      if (event === 'timeup') {
        this.state = 'complete';
        this.audio.warn();
      }
      if (wasFlying && this.flight.onGround && this.flight.phase === FlightPhase.LANDED) {
        this.audio.thud();
        const l = this.flight.lastLanding;
        if (l) this.hud.toast(`${l.quality} landing — sink ${l.vs.toFixed(1)} m/s`, l.quality === 'smooth' ? '#6dff9e' : '#ffb454');
      }
      if (this.flight.phase === FlightPhase.CRASHED || this.flight.phase === FlightPhase.DITCHED) {
        if (!this.crashShown) {
          this.crashShown = true;
          this.state = 'crashed';
          this.audio.thud();
          this.audio.warn();
        }
      }
      if (this.flight.stalled && !this.warnedStall) {
        this.warnedStall = true;
        this.audio.warn();
      } else if (!this.flight.stalled) this.warnedStall = false;
      if (this.flight.fuel < 20 && !this.warnedFuel) {
        this.warnedFuel = true;
        this.hud.toast('Low fuel — land on a strip to refuel', '#ffb454');
        this.audio.warn();
      } else if (this.flight.fuel > 25) this.warnedFuel = false;
      this.audio.update(this.flight.throttle, this.flight.speed, this.flight.stalled, !this.flight.onGround);
    }
    // The aircraft follows the flight model every frame, even in the menu.
    this.flight.applyOrientation(this.planeRig.group);
    animateAircraft(this.planeRig, input, dt, this.flight.throttle);
    // Sun shadow and rain follow the plane.
    const sunDir = this.sky.skyMat.uniforms.sunDir.value;
    this.sky.sun.position.copy(this.flight.position).addScaledVector(sunDir, 2600);
    this.sky.sun.target.position.copy(this.flight.position);
    this.sky.sun.target.updateMatrixWorld();
    this.sky.rain.position.set(this.flight.position.x, this.flight.position.y - 20, this.flight.position.z);
    const rainPos = this.sky.rainPos;
    for (let i = 0; i < this.sky.rainCount; i++) {
      rainPos[i * 3 + 1] -= 55 * dt;
      if (rainPos[i * 3 + 1] < -20) rainPos[i * 3 + 1] = 70;
    }
    this.sky.rain.geometry.attributes.position.needsUpdate = true;
    applyAtmosphere(this.sky, this.timeOfDay, this.weather, this.elapsed, this.camera.position);
    this.scene.fog.density = this.weather.fog;
    this.scene.fog.color.setHSL(0.58, 0.25, 0.72 - this.weather.cloudCover * 0.18);
    this.updateCamera(dt);
  }

  updateCamera(dt) {
    const f = this.flight;
    const forward = new THREE.Vector3(-Math.sin(f.heading), 0, -Math.cos(f.heading));
    if (this.cameraMode === 'cockpit') {
      const eye = f.position.clone()
        .addScaledVector(forward, 1.6)
        .add(new THREE.Vector3(0, 1.15, 0));
      const look = f.position.clone()
        .addScaledVector(forward, 60)
        .add(new THREE.Vector3(0, Math.sin(f.pitch) * 30, 0));
      this.camPos.lerp(eye, 1 - Math.exp(-12 * dt));
      this.camLook.lerp(look, 1 - Math.exp(-12 * dt));
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.camLook);
      this.camera.fov = damp(this.camera.fov, 68, 4, dt);
      this.camera.updateProjectionMatrix();
      this.planeRig.group.visible = false;
      return;
    }
    this.planeRig.group.visible = true;
    const back = f.position.clone()
      .addScaledVector(forward, -CAMERA.chaseDistance)
      .add(new THREE.Vector3(0, CAMERA.chaseHeight + f.speed * 0.008, 0));
    const look = f.position.clone().addScaledVector(forward, CAMERA.lookAhead);
    look.y += Math.sin(f.pitch) * 12;
    const rate = this.state === 'menu' ? 1.2 : CAMERA.smoothing;
    this.camPos.lerp(back, 1 - Math.exp(-rate * dt));
    this.camLook.lerp(look, 1 - Math.exp(-rate * 1.4 * dt));
    // Never let the camera sink into the ground.
    const ground = groundHeight(this.camPos.x, this.camPos.z);
    if (this.camPos.y < ground + 2.5) this.camPos.y = ground + 2.5;
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    const targetFov = CAMERA.fovBase + clamp(f.speed / 72, 0, 1) * CAMERA.fovSpeed;
    this.camera.fov = damp(this.camera.fov, targetFov, 3, dt);
    this.camera.updateProjectionMatrix();
  }

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.tick(dt);
    this.hud.draw(this);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(() => this.frame());
  }

  start() {
    this.clock = new THREE.Clock();
    // Menu backdrop: the plane parked on the strip, camera drifting.
    // In screenshot staging the shot already placed the plane — leave it.
    if (!this.shotMode) this.flight.reset();
    this.frame();
  }
}

const game = new SkyCourierGame();
game.start();
