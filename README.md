[![make.fun](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/nmlyz/flight-game/rank.svg)](https://make.fun/c/best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/nmlyz/flight-game/reward.svg)](https://make.fun/c/best-flight-game-20261126-0057)

# Sky Courier

A 3D bush-plane flight game that runs entirely offline in a desktop browser. Fly the Kestrel, a high-wing bush plane, through Kestrel Valley — a procedural valley with mountains, a river, a lakeside town and four airstrips.

## How to play

Serve `game/` with any static server (`node serve.ts`, then open http://localhost:8080) and fly with keyboard and mouse:

- **W / S** — throttle up / down
- **Arrow keys** — pitch and bank
- **A / D** — rudder
- **Mouse** — hold and steer to bank
- **G** — landing gear, **F** — flaps, **C** — chase / cockpit camera
- **P** — pause, **M** — sound, **R** — restart

## Missions

1. **Ring Run** — fly through 10 rings down the valley before the clock runs out.
2. **Courier** — deliver three parcels to three short mountain strips; smooth landings score more.
3. **Storm Rescue** — land at Ridge Top in heavy rain, pick up a stranded hiker, and bring them home.

Fuel burns with throttle and refills when you land on a strip. Hard landings and terrain strikes damage the airframe; below stall speed the wing quits, so keep your speed up and your turns coordinated.

## What is inside

- A deterministic procedural valley (fixed seed): heightfield terrain, river, town, pine forest, snow-capped rim mountains.
- A flight model with lift, drag, stall, flaps, gear drag and ground effect — no arcade rails.
- Lit instruments: attitude ball, airspeed, altimeter, vertical speed, compass tape, throttle and fuel gauges.
- Synthesized sound (WebAudio): engine drone, wind rush, ring chimes, landing thuds, stall warnings. No audio files.
- Three.js (vendored under `game/vendor/`), everything else written for this game.

## Layout

- `main.ts` — hands the game in: copies `game/` and `screenshots/` to the output directory and writes `dossier.json`.
- `game/index.html` — the playable game.
- `game/src/` — one file per job: `flight.js` (flight model), `terrain.js` (valley), `plane.js` (aircraft), `sky.js` (sky and weather), `missions.js` (missions and scoring), `hud.js` (instruments), `audio.js` (sound), `input.js` (controls), `shots.js` (screenshot staging), `main.js` (loop and camera).
- `screenshots/` — real renders of the game, taken in a browser.

## License

MIT — see [LICENSE](LICENSE).
