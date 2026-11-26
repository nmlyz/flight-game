// Sky Courier — tuning constants and world layout.
// One place for every number the flight model, terrain and missions share,
// so a balance change never has to be hunted across files.

export const WORLD = {
  size: 4200,            // terrain spans -2100..2100 m on X and Z
  segments: 160,         // heightfield resolution
  seed: 20261126,        // fixed seed: the same valley every run
  baseAltitude: 0,       // valley floor height (m)
  mountainHeight: 620,   // rim peaks (m)
  snowLine: 430,         // above this the rock turns to snow
  treeLine: 260,         // trees grow below this
};

export const RUNWAY = {
  // Main strip "Kestrel Field" at the valley floor, heading north.
  x: 0, z: 240, heading: 0, length: 620, width: 26,
  thresholdAlt: 2,
};

export const OUT_STRIPS = [
  { id: 'pine',  name: 'Pine Hollow', x: -1180, z: -900, heading: 0.35, length: 420, width: 20 },
  { id: 'lakes', name: 'Lakeside',    x: 1250,  z: -620, heading: -0.5, length: 380, width: 20 },
  { id: 'ridge', name: 'Ridge Top',   x: 260,   z: -1420, heading: 0.12, length: 340, width: 18 },
];

export const PLANE = {
  stallSpeed: 26,        // m/s — below this the wing stops flying
  cruiseSpeed: 62,       // m/s at 75% throttle, level
  maxSpeed: 72,          // m/s at full throttle, level
  climbRate: 9,          // m/s at full throttle, best climb
  maxFuel: 100,          // units; a full tank
  fuelBurnCruise: 0.55,  // units per second at 75% throttle
  fuelBurnFull: 1.05,    // units per second at 100% throttle
  maxDamage: 100,        // hit points
  gearDrag: 0.0012,      // extra drag coefficient with gear down
  flapLift: 1.22,        // lift multiplier with flaps
  flapDrag: 0.0009,
};

export const MISSIONS = {
  rings: { ringCount: 10, timeLimit: 300, ringScore: 150, timeBonusPerSec: 4 },
  courier: { parcels: 3, deliveryScore: 400, landingBonusMax: 250 },
  rescue: { timeLimit: 420, rescueScore: 900, returnBonus: 400 },
};

export const CAMERA = {
  chaseDistance: 11,
  chaseHeight: 3.2,
  lookAhead: 26,
  smoothing: 9,
  fovBase: 62,
  fovSpeed: 16,
};

export const WEATHER = {
  clear:   { fog: 0.00016, cloudCover: 0.25, wind: 2,  gust: 0,   sun: 1.0, rain: 0 },
  dusk:    { fog: 0.00022, cloudCover: 0.45, wind: 5,  gust: 2,   sun: 0.55, rain: 0 },
  storm:   { fog: 0.00045, cloudCover: 0.9,  wind: 12, gust: 7,   sun: 0.3, rain: 1 },
};
