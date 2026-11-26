// Sky, sun, clouds and weather. One gradient dome, a low sun with a
// matching directional light, drifting billboard clouds, and rain for the
// storm mission — all procedural, no textures.

import * as THREE from 'three';
import { mulberry32, clamp, lerp } from './rng.js';

export function buildSky(scene, renderer) {
  const skyGeo = new THREE.SphereGeometry(5200, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x2f6fb8) },
      midColor: { value: new THREE.Color(0x9eccec) },
      lowColor: { value: new THREE.Color(0xf6d9a8) },
      sunDir: { value: new THREE.Vector3(0.5, 0.35, 0.78).normalize() },
      sunColor: { value: new THREE.Color(0xffe6b0) },
      haze: { value: 0.35 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 topColor, midColor, lowColor, sunColor;
      uniform vec3 sunDir;
      uniform float haze;
      void main() {
        float h = clamp(vDir.y, -0.08, 1.0);
        vec3 col = mix(lowColor, midColor, smoothstep(0.0, 0.22, h));
        col = mix(col, topColor, smoothstep(0.2, 0.75, h));
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += sunColor * pow(s, 220.0) * 1.4 + sunColor * pow(s, 18.0) * 0.12;
        col = mix(col, lowColor, pow(1.0 - clamp(h, 0.0, 1.0), 3.0) * haze);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(skyGeo, skyMat);
  scene.add(dome);

  const sun = new THREE.DirectionalLight(0xfff1cf, 2.6);
  sun.position.set(1400, 900, 2100);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -160; sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160; sun.shadow.camera.bottom = -160;
  sun.shadow.camera.far = 5200;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x4a5d3a, 0.85);
  scene.add(hemi);

  // Clouds: soft billboards made from a radial-gradient canvas texture.
  const cloudTex = makePuffTexture();
  const rng = mulberry32(777);
  const clouds = new THREE.Group();
  const cloudMat = new THREE.MeshBasicMaterial({
    map: cloudTex, transparent: true, opacity: 0.85, depthWrite: false,
  });
  const cloudMeshes = [];
  for (let i = 0; i < 46; i++) {
    const puffs = 3 + Math.floor(rng() * 4);
    const cluster = new THREE.Group();
    for (let p = 0; p < puffs; p++) {
      const size = 180 + rng() * 260;
      const sprite = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 0.55), cloudMat);
      sprite.position.set((rng() - 0.5) * 320, (rng() - 0.5) * 40, (rng() - 0.5) * 160);
      cluster.add(sprite);
    }
    cluster.position.set((rng() - 0.5) * 7000, 520 + rng() * 260, (rng() - 0.5) * 7000);
    cluster.userData.drift = 2 + rng() * 4;
    clouds.add(cluster);
    cloudMeshes.push(cluster);
  }
  scene.add(clouds);

  // Rain: one Points cloud, recycled above the aircraft.
  const rainCount = 2400;
  const rainPos = new Float32Array(rainCount * 3);
  for (let i = 0; i < rainCount; i++) {
    rainPos[i * 3] = (rng() - 0.5) * 160;
    rainPos[i * 3 + 1] = rng() * 90;
    rainPos[i * 3 + 2] = (rng() - 0.5) * 160;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({
    color: 0xaec6d8, size: 0.35, transparent: true, opacity: 0.4,
  }));
  rain.visible = false;
  scene.add(rain);

  return { dome, skyMat, sun, hemi, clouds, cloudMeshes, rain, rainPos, rainCount };
}

function makePuffTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  for (const [x, y, r] of [[70, 80, 55], [128, 62, 62], [186, 82, 52], [110, 88, 48], [160, 90, 44]]) {
    const g = ctx.createRadialGradient(x, y, 4, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

// timeOfDay: 0 = dawn, 0.5 = noon, 1 = dusk. weather: a WEATHER preset.
export function applyAtmosphere(sky, timeOfDay, weather, elapsed, cameraPos) {
  const u = sky.skyMat.uniforms;
  const warm = 1 - Math.abs(timeOfDay - 0.5) * 2; // 1 at dawn/dusk, 0 at noon
  u.topColor.value.setHSL(0.58 - warm * 0.06, 0.72 - warm * 0.2, 0.42 + warm * 0.08 - weather.cloudCover * 0.12);
  u.midColor.value.setHSL(0.56 - warm * 0.1, 0.6 - warm * 0.15, 0.72 - warm * 0.1 - weather.cloudCover * 0.14);
  u.lowColor.value.setHSL(0.09 + warm * 0.02, 0.75, 0.78 - warm * 0.22 - weather.cloudCover * 0.18);
  const sunAngle = lerp(0.12, Math.PI - 0.12, timeOfDay);
  const sunDir = new THREE.Vector3(Math.cos(sunAngle) * 0.55, Math.sin(sunAngle) * 0.8 + 0.08, 0.78).normalize();
  u.sunDir.value.copy(sunDir);
  u.haze.value = 0.25 + weather.cloudCover * 0.35;
  sky.sun.position.copy(sunDir).multiplyScalar(2600);
  sky.sun.intensity = 2.6 * weather.sun * (0.55 + 0.45 * Math.sin(sunAngle));
  sky.sun.color.setHSL(0.1 + warm * 0.02, 0.85, 0.72 - warm * 0.12);
  sky.hemi.intensity = 0.85 * (0.35 + 0.65 * weather.sun);
  sky.dome.position.y = 0;
  // Clouds drift with the wind and always face the camera.
  for (const cluster of sky.cloudMeshes) {
    cluster.position.x += cluster.userData.drift * weather.wind * 0.016;
    if (cluster.position.x > 3800) cluster.position.x = -3800;
    if (cameraPos) cluster.children.forEach((s) => s.lookAt(cameraPos));
  }
  sky.rain.visible = weather.rain > 0;
}
