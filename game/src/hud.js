// HUD and instruments: a 2D canvas laid over the 3D view. Lit dials —
// attitude ball, altimeter, airspeed, compass tape, throttle, fuel — plus
// mission panels and the title, pause, crash and debrief screens.

import { clamp, lerp, radToDeg } from './rng.js';

const PANEL = 'rgba(10, 16, 24, 0.72)';
const PANEL_EDGE = 'rgba(140, 200, 255, 0.35)';
const AMBER = '#ffb454';
const CYAN = '#7fd4ff';
const GREEN = '#6dff9e';
const RED = '#ff5a4e';

export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.messages = [];
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
  }

  toast(text, color = CYAN) {
    this.messages.push({ text, color, born: performance.now() });
    if (this.messages.length > 4) this.messages.shift();
  }

  panel(x, y, w, h, radius = 10) {
    const c = this.ctx;
    c.fillStyle = PANEL;
    c.strokeStyle = PANEL_EDGE;
    c.lineWidth = 1;
    c.beginPath();
    c.roundRect(x, y, w, h, radius);
    c.fill();
    c.stroke();
  }

  text(str, x, y, size = 14, color = '#eef6ff', align = 'left', weight = 600) {
    const c = this.ctx;
    c.font = `${weight} ${size}px "Avenir Next", "Segoe UI", system-ui, sans-serif`;
    c.fillStyle = color;
    c.textAlign = align;
    c.textBaseline = 'middle';
    c.fillText(str, x, y);
  }

  draw(game) {
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);
    const { flight, mission } = game;
    if (game.state === 'menu') { this.drawTitle(game); return; }
    this.drawCompassTape(flight.headingDeg);
    this.drawMissionPanel(mission, game);
    this.drawTopRight(game);
    this.drawDashboard(flight, mission, game);
    this.drawFlightMarker(flight, game);
    this.drawToasts();
    if (game.state === 'paused') this.drawPaused();
    if (game.state === 'crashed') this.drawCrash(game);
    if (game.state === 'complete') this.drawDebrief(game);
    if (flight.stalled && game.state === 'playing') {
      this.text('STALL — NOSE DOWN, POWER UP', this.w / 2, this.h * 0.32, 22, RED, 'center', 800);
    }
    if (flight.fuel <= 0 && flight.phase !== 'crashed') {
      this.text('FUEL EMPTY — GLIDING', this.w / 2, this.h * 0.36, 18, AMBER, 'center', 800);
    }
  }

  drawCompassTape(headingDeg) {
    const c = this.ctx;
    const cx = this.w / 2, y = 30, w = 420, h = 34;
    this.panel(cx - w / 2, y - h / 2, w, h, 17);
    c.save();
    c.beginPath();
    c.roundRect(cx - w / 2, y - h / 2, w, h, 17);
    c.clip();
    const pxPerDeg = 3.2;
    for (let d = Math.floor(headingDeg - 60); d <= headingDeg + 60; d += 5) {
      const deg = ((d % 360) + 360) % 360;
      const x = cx + (d - headingDeg) * pxPerDeg;
      const major = deg % 30 === 0;
      c.strokeStyle = major ? CYAN : 'rgba(180,220,255,0.5)';
      c.lineWidth = major ? 2 : 1;
      c.beginPath();
      c.moveTo(x, y + (major ? 6 : 10));
      c.lineTo(x, y + (major ? 16 : 14));
      c.stroke();
      if (major) {
        const label = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[deg] ?? String(deg).padStart(3, '0');
        this.text(label, x, y - 2, 12, major ? '#fff' : '#bfe3ff', 'center', 700);
      }
    }
    c.restore();
    // Centre caret + readout.
    c.fillStyle = AMBER;
    c.beginPath();
    c.moveTo(cx - 7, y + h / 2 - 2);
    c.lineTo(cx + 7, y + h / 2 - 2);
    c.lineTo(cx, y + h / 2 - 10);
    c.closePath();
    c.fill();
    this.text(String(Math.round(headingDeg)).padStart(3, '0') + '°', cx, y + h / 2 + 16, 13, AMBER, 'center', 800);
  }

  drawMissionPanel(mission, game) {
    const x = 16, y = 16;
    this.panel(x, y, 320, 86);
    this.text('SKY COURIER', x + 14, y + 16, 13, AMBER, 'left', 800);
    this.text('SCORE  ' + mission.score.toLocaleString(), x + 306, y + 16, 13, '#fff', 'right', 800);
    // Shrink long objectives so they never run past the panel edge.
    let objSize = 13;
    this.ctx.font = `600 ${objSize}px "Avenir Next", "Segoe UI", system-ui, sans-serif`;
    while (objSize > 10 && this.ctx.measureText(mission.objective).width > 292) objSize -= 1;
    this.text(mission.objective, x + 14, y + 40, objSize, '#dcecff', 'left', 600);
    this.text(mission.status, x + 14, y + 64, 13, CYAN, 'left', 600);
    if (mission.timeLeft > 0 && !mission.finished) {
      const mm = Math.floor(mission.timeLeft / 60);
      const ss = Math.floor(mission.timeLeft % 60).toString().padStart(2, '0');
      this.text(`${mm}:${ss}`, x + 306, y + 64, 15, mission.timeLeft < 60 ? RED : '#fff', 'right', 800);
    }
  }

  drawTopRight(game) {
    const x = this.w - 16, y = 16;
    this.panel(x - 210, y, 210, 86);
    this.text(game.weatherName, x - 14, y + 16, 13, '#dcecff', 'right', 700);
    this.text(game.timeLabel, x - 14, y + 40, 13, '#dcecff', 'right', 600);
    this.text(game.muted ? 'SOUND OFF (M)' : 'SOUND ON (M)', x - 14, y + 64, 12, '#9fb8cc', 'right', 600);
  }

  drawDashboard(flight, mission, game) {
    const c = this.ctx;
    const y = this.h - 152;
    this.panel(16, y, this.w - 32, 136, 14);
    const cx = this.w / 2;
    // Shrink the instrument cluster toward its centre on narrow windows so
    // the attitude ball and the speed/altitude readouts stay on screen.
    const s = Math.min(1, (this.w - 32) / 940);
    c.save();
    c.translate(cx, y + 68);
    c.scale(s, s);
    c.translate(-cx, -(y + 68));
    // Attitude ball.
    this.drawAttitude(cx - 320, y + 68, 50, flight.pitch, flight.roll);
    // Airspeed, altitude and vertical-speed dials.
    this.drawDial(cx - 200, y + 68, 44, flight.knots, 0, 160, 'KT', flight.knots >= 160 ? RED : CYAN);
    this.drawDial(cx - 85, y + 68, 44, flight.altitudeMsl, 0, 600, 'ALT m', CYAN);
    this.drawDial(cx + 30, y + 68, 44, clamp(flight.verticalSpeed, -15, 15), -15, 15, 'V/S', CYAN);
    // Throttle + fuel bars and gear/flaps state.
    this.drawThrottleBar(cx + 110, y + 30, flight.throttle);
    this.drawFuelBar(cx + 110, y + 66, flight.fuel);
    this.drawGearFlaps(cx + 110, y + 102, flight);
    // Right side: big speed and altitude numbers, damage top-right.
    this.text(Math.round(flight.knots) + ' kt', cx + 430, y + 40, 26, '#fff', 'center', 800);
    this.text('SPD', cx + 430, y + 64, 11, '#9fb8cc', 'center', 600);
    this.text(Math.round(flight.altitude) + ' m', cx + 430, y + 98, 26, '#fff', 'center', 800);
    this.text('AGL', cx + 430, y + 122, 11, '#9fb8cc', 'center', 600);
    if (flight.damage > 0) {
      this.text('DMG ' + Math.round(flight.damage) + '%', this.w - 60, y + 22, 15, flight.damage > 60 ? RED : AMBER, 'right', 800);
    }
    c.restore();
    // Controls hint, faint.
    this.text('W/S throttle · ←→ bank · ↑↓ pitch · A/D rudder · G gear · F flaps · C camera · P pause',
      this.w / 2, this.h - 8, 11, 'rgba(200,220,240,0.55)', 'center', 500);
  }

  drawAttitude(x, y, r, pitch, roll) {
    const c = this.ctx;
    c.save();
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.clip();
    c.translate(x, y);
    c.rotate(-roll);
    const pitchPx = clamp(pitch, -0.5, 0.5) * r * 1.6;
    c.fillStyle = '#2f7fc4';
    c.fillRect(-r - 4, -r - 4 - pitchPx, r * 2 + 8, r + 4 + pitchPx);
    c.fillStyle = '#8a6b46';
    c.fillRect(-r - 4, pitchPx, r * 2 + 8, r + 4 - pitchPx);
    c.strokeStyle = 'rgba(255,255,255,0.7)';
    c.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      const yy = pitchPx + i * r * 0.4;
      c.beginPath();
      c.moveTo(-r * 0.5, yy);
      c.lineTo(r * 0.5, yy);
      c.stroke();
    }
    c.restore();
    c.strokeStyle = '#eef6ff';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.stroke();
    // Fixed wings marker.
    c.strokeStyle = AMBER;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(x - r - 4, y);
    c.lineTo(x - r * 0.35, y);
    c.moveTo(x + r * 0.35, y);
    c.lineTo(x + r + 4, y);
    c.stroke();
    this.text('ATT', x, y + r + 12, 10, '#9fb8cc', 'center', 600);
  }

  drawDial(x, y, r, value, min, max, label, color) {
    const c = this.ctx;
    c.fillStyle = '#0b1520';
    c.strokeStyle = PANEL_EDGE;
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    const frac = clamp((value - min) / (max - min), 0, 1);
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    c.strokeStyle = 'rgba(140,200,255,0.3)';
    c.lineWidth = 5;
    c.beginPath();
    c.arc(x, y, r - 7, a0, a1);
    c.stroke();
    c.strokeStyle = color;
    c.beginPath();
    c.arc(x, y, r - 7, a0, a0 + (a1 - a0) * frac);
    c.stroke();
    const ang = a0 + (a1 - a0) * frac;
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(x + Math.cos(ang) * (r - 7), y + Math.sin(ang) * (r - 7), 4, 0, Math.PI * 2);
    c.fill();
    this.text(Math.round(value), x, y - 4, 17, '#fff', 'center', 800);
    this.text(label, x, y + 16, 10, '#9fb8cc', 'center', 600);
  }

  drawThrottleBar(x, y, throttle) {
    const c = this.ctx;
    this.text('THR', x, y - 8, 11, '#9fb8cc', 'left', 600);
    c.fillStyle = '#0b1520';
    c.beginPath();
    c.roundRect(x + 40, y - 14, 120, 12, 6);
    c.fill();
    c.fillStyle = throttle > 0.9 ? RED : GREEN;
    c.beginPath();
    c.roundRect(x + 40, y - 14, 120 * throttle, 12, 6);
    c.fill();
    this.text(Math.round(throttle * 100) + '%', x + 168, y - 8, 12, '#fff', 'left', 700);
  }

  drawFuelBar(x, y, fuel) {
    const c = this.ctx;
    this.text('FUEL', x, y - 8, 11, '#9fb8cc', 'left', 600);
    c.fillStyle = '#0b1520';
    c.beginPath();
    c.roundRect(x + 40, y - 14, 120, 12, 6);
    c.fill();
    c.fillStyle = fuel < 20 ? RED : fuel < 45 ? AMBER : CYAN;
    c.beginPath();
    c.roundRect(x + 40, y - 14, 120 * (fuel / 100), 12, 6);
    c.fill();
    this.text(Math.round(fuel), x + 168, y - 8, 12, '#fff', 'left', 700);
  }

  drawGearFlaps(x, y, flight) {
    this.text(`GEAR ${flight.gearDown ? 'DOWN' : 'UP'}`, x, y, 12, flight.gearDown ? GREEN : AMBER, 'left', 700);
    this.text(`FLAPS ${flight.flaps ? 'ON' : 'OFF'}`, x + 95, y, 12, flight.flaps ? GREEN : '#9fb8cc', 'left', 700);
    this.text(flight.onGround ? 'ON GROUND' : 'AIRBORNE', x + 180, y, 12, flight.onGround ? AMBER : CYAN, 'left', 700);
  }

  drawFlightMarker(flight, game) {
    if (game.state !== 'playing' || !game.cameraOnTarget) return;
    const c = this.ctx;
    const cx = this.w / 2, cy = this.h / 2 - 40;
    c.strokeStyle = 'rgba(127,212,255,0.9)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(cx, cy, 12, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.moveTo(cx - 20, cy);
    c.lineTo(cx - 8, cy);
    c.moveTo(cx + 8, cy);
    c.lineTo(cx + 20, cy);
    c.moveTo(cx, cy - 20);
    c.lineTo(cx, cy - 8);
    c.moveTo(cx, cy + 8);
    c.lineTo(cx, cy + 20);
    c.stroke();
  }

  drawToasts() {
    const now = performance.now();
    this.messages = this.messages.filter((m) => now - m.born < 3600);
    this.messages.forEach((m, i) => {
      const age = (now - m.born) / 3600;
      const alpha = age > 0.75 ? 1 - (age - 0.75) / 0.25 : 1;
      this.ctx.globalAlpha = alpha;
      this.text(m.text, this.w / 2, this.h * 0.22 + i * 26, 17, m.color, 'center', 700);
      this.ctx.globalAlpha = 1;
    });
  }

  drawTitle(game) {
    const c = this.ctx;
    c.fillStyle = 'rgba(6, 12, 20, 0.45)';
    c.fillRect(0, 0, this.w, this.h);
    const cx = this.w / 2;
    // Short windows get a compact title block so the mission panel and the
    // footer lines never overlap.
    const compact = this.h < 620;
    const titleY = this.h * (compact ? 0.12 : 0.2);
    this.text('SKY COURIER', cx, titleY, compact ? 44 : 64, '#fff', 'center', 800);
    this.text('A bush-plane game in Kestrel Valley', cx, titleY + (compact ? 36 : 52), compact ? 16 : 20, AMBER, 'center', 600);
    this.text('Fly the rings, deliver the parcels, bring the hiker home.', cx, titleY + (compact ? 62 : 84), compact ? 13 : 15, '#dcecff', 'center', 500);
    const panelY = this.h * (compact ? 0.32 : 0.38);
    const panelH = compact ? 182 : 218;
    const rowStep = compact ? 40 : 48;
    const rowH = compact ? 32 : 40;
    const pw = Math.min(660, this.w - 24);
    this.panel(cx - pw / 2, panelY, pw, panelH, 16);
    this.text('CHOOSE A MISSION', cx, panelY + 26, 15, AMBER, 'center', 800);
    const rows = [
      ['1', 'RING RUN', '10 rings down the valley — beat the clock', '300 s'],
      ['2', 'COURIER', '3 parcels to 3 short strips — land well, score more', 'Fuel matters'],
      ['3', 'STORM RESCUE', 'Land at Ridge Top in the rain, bring the hiker home', '420 s'],
    ];
    rows.forEach(([key, name, desc, tag], i) => {
      const y = panelY + (compact ? 54 : 62) + i * rowStep;
      c.fillStyle = 'rgba(127,212,255,0.14)';
      c.beginPath();
      c.roundRect(cx - 306, y - rowH / 2, 612, rowH, 10);
      c.fill();
      this.text('[' + key + ']', cx - 288, y, 16, CYAN, 'left', 800);
      this.text(name, cx - 240, y - 4, 16, '#fff', 'left', 800);
      this.text(desc, cx - 240, y + 14, 12, '#9fb8cc', 'left', 500);
      this.text(tag, cx + 288, y, 13, AMBER, 'right', 700);
    });
    this.text('or press 0 for free flight', cx, panelY + panelH - 18, 13, '#9fb8cc', 'center', 600);
    const footY = panelY + panelH + 22;
    this.text('W/S throttle · Arrow keys fly · A/D rudder · G gear · F flaps · C camera · M sound',
      cx, footY, 14, '#dcecff', 'center', 600);
    this.text('Land gently on a strip to refuel. Mind the mountains — and the fuel gauge.',
      cx, footY + 26, 13, '#9fb8cc', 'center', 500);
  }

  drawPaused() {
    const c = this.ctx;
    c.fillStyle = 'rgba(6, 12, 20, 0.55)';
    c.fillRect(0, 0, this.w, this.h);
    this.text('PAUSED', this.w / 2, this.h / 2 - 10, 44, '#fff', 'center', 800);
    this.text('Press P to keep flying', this.w / 2, this.h / 2 + 34, 16, '#dcecff', 'center', 600);
  }

  drawCrash(game) {
    const c = this.ctx;
    c.fillStyle = 'rgba(20, 6, 6, 0.55)';
    c.fillRect(0, 0, this.w, this.h);
    const cx = this.w / 2;
    this.text('DOWN', cx, this.h * 0.34, 56, RED, 'center', 800);
    this.text(game.flight.crashReason || 'The Kestrel is down.', cx, this.h * 0.34 + 48, 18, '#ffe2de', 'center', 600);
    this.text('Score ' + game.mission.score.toLocaleString(), cx, this.h * 0.34 + 92, 18, '#fff', 'center', 800);
    this.text('Press R to fly again — the valley is patient', cx, this.h * 0.34 + 132, 15, '#dcecff', 'center', 600);
  }

  drawDebrief(game) {
    const c = this.ctx;
    c.fillStyle = 'rgba(6, 16, 10, 0.55)';
    c.fillRect(0, 0, this.w, this.h);
    const cx = this.w / 2;
    this.text('MISSION COMPLETE', cx, this.h * 0.3, 44, GREEN, 'center', 800);
    this.text(game.mission.finishText, cx, this.h * 0.3 + 44, 17, '#eafff0', 'center', 600);
    this.text('SCORE  ' + game.mission.score.toLocaleString(), cx, this.h * 0.3 + 92, 26, '#fff', 'center', 800);
    const f = game.flight;
    this.text(`Fuel left ${Math.round(f.fuel)} · Damage ${Math.round(f.damage)}% · Airborne ${Math.round(f.airborneTime)} s`,
      cx, this.h * 0.3 + 128, 14, '#dcecff', 'center', 600);
    this.text('Press 1 / 2 / 3 for another mission, or R to fly again', cx, this.h * 0.3 + 166, 15, '#dcecff', 'center', 600);
  }
}
