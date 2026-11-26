// Screenshot staging: ?shot=<name> puts the game into a fixed, composed
// scene so the screenshots are real renders of the game's own code, taken
// the same way every time. Interactive play never uses these paths.

import { groundHeight } from './terrain.js';
import { MissionKind } from './missions.js';
import { WEATHER } from './config.js';

const SHOTS = {
  // Cover: chase view, low over the valley, rings and the runway ahead,
  // golden hour, instruments lit, HUD full.
  cover: {
    mission: MissionKind.RINGS, timeOfDay: 0.86, weather: 'dusk',
    pos: [60, 150, 980], heading: 0.12, pitch: 0.02, roll: -0.12,
    speed: 68, throttle: 0.78, fuel: 82, camera: 'chase', frames: 90,
  },
  // Ring run: threading a ring low between the valley walls.
  rings: {
    mission: MissionKind.RINGS, timeOfDay: 0.42, weather: 'clear',
    pos: [-140, 90, 420], heading: -0.28, pitch: 0.0, roll: 0.22,
    speed: 74, throttle: 0.85, fuel: 64, camera: 'chase', frames: 90,
  },
  // Final approach: gear down, runway threshold ahead at dusk.
  landing: {
    mission: MissionKind.COURIER, timeOfDay: 0.94, weather: 'dusk',
    pos: [-30, 55, 1180], heading: 0.02, pitch: -0.05, roll: 0.02,
    speed: 42, throttle: 0.32, fuel: 47, camera: 'chase', frames: 90,
  },
  // Storm rescue: rain, low cloud, the beacon over Ridge Top.
  storm: {
    mission: MissionKind.RESCUE, timeOfDay: 0.97, weather: 'storm',
    pos: [180, 120, -980], heading: 0.1, pitch: 0.0, roll: -0.08,
    speed: 58, throttle: 0.7, fuel: 38, camera: 'chase', frames: 90,
  },
};

export function applyShot(game, name) {
  const shot = SHOTS[name];
  if (!shot) return false;
  const { flight, mission, sky } = game;
  mission.start(shot.mission);
  // Place the plane: [x, height-above-ground, z].
  const [x, agl, z] = shot.pos;
  flight.position.set(x, groundHeight(x, z) + agl, z);
  flight.heading = shot.heading;
  flight.pitch = shot.pitch;
  flight.roll = shot.roll;
  flight.speed = shot.speed;
  flight.throttle = shot.throttle;
  flight.fuel = shot.fuel;
  flight.gearDown = name === 'landing';
  flight.flaps = name === 'landing';
  flight.onGround = false;
  flight.phase = 'flying';
  flight.verticalSpeed = name === 'landing' ? -2.5 : 0;
  game.timeOfDay = shot.timeOfDay;
  game.weather = WEATHER[shot.weather];
  game.weatherName = shot.weather === 'clear' ? 'Clear · light wind'
    : shot.weather === 'dusk' ? 'Golden hour · calm'
    : 'Storm · heavy rain';
  game.cameraMode = shot.camera;
  game.state = 'playing';
  game.shotMode = name;
  game.shotFrames = shot.frames;
  // Advance the world a fixed number of frames so the prop spins, the
  // clouds drift and the next ring pulses before the picture is taken.
  for (let i = 0; i < shot.frames; i++) {
    game.tick(1 / 60, true);
  }
  return true;
}

export function shotNames() { return Object.keys(SHOTS); }
