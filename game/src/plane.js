// The aircraft: "Kestrel", a high-wing bush plane built from primitives.
// Cream and blaze-orange livery, tundra tyres, a spinning prop and control
// surfaces that actually move with the pilot's input.

import * as THREE from 'three';

export function buildAircraft() {
  const plane = new THREE.Group();
  const cream = new THREE.MeshStandardMaterial({ color: 0xf2e8d5, roughness: 0.55, metalness: 0.08 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xe86a1c, roughness: 0.5, metalness: 0.08 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.6, metalness: 0.2 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fd4e8, roughness: 0.12, metalness: 0.35 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.95 });

  // Fuselage: a tapered body, nose forward (-Z is forward in our model space).
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, 5.6, 10), cream);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.set(0, 0, 0.4);
  plane.add(fuselage);
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.18, 1.2, 10), orange);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0, -2.9);
  plane.add(nose);
  const tailCone = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.12, 2.4, 10), cream);
  tailCone.rotation.x = Math.PI / 2;
  tailCone.position.set(0, 0.15, 4.2);
  plane.add(tailCone);

  // Cabin glasshouse.
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.85, 2.0), glass);
  cabin.position.set(0, 0.62, -0.4);
  plane.add(cabin);
  const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.16, 1.9), orange);
  cabinRoof.position.set(0, 1.08, -0.4);
  plane.add(cabinRoof);

  // High wing with orange tips and a slight dihedral.
  const wingGeo = new THREE.BoxGeometry(3.4, 0.16, 1.5);
  const leftWing = new THREE.Mesh(wingGeo, cream);
  leftWing.position.set(-3.4, 1.05, -0.5);
  leftWing.rotation.z = 0.07;
  plane.add(leftWing);
  const rightWing = new THREE.Mesh(wingGeo, cream);
  rightWing.position.set(3.4, 1.05, -0.5);
  rightWing.rotation.z = -0.07;
  plane.add(rightWing);
  const tipGeo = new THREE.BoxGeometry(0.7, 0.18, 1.5);
  const leftTip = new THREE.Mesh(tipGeo, orange);
  leftTip.position.set(-6.9, 1.3, -0.5);
  leftTip.rotation.z = 0.07;
  plane.add(leftTip);
  const rightTip = new THREE.Mesh(tipGeo, orange);
  rightTip.position.set(6.9, 1.3, -0.5);
  rightTip.rotation.z = -0.07;
  plane.add(rightTip);

  // Ailerons (move with roll input) at the wing trailing edges.
  const aileronGeo = new THREE.BoxGeometry(2.6, 0.1, 0.55);
  const leftAileron = new THREE.Mesh(aileronGeo, orange);
  leftAileron.position.set(-4.4, 1.02, 0.5);
  plane.add(leftAileron);
  const rightAileron = new THREE.Mesh(aileronGeo, orange);
  rightAileron.position.set(4.4, 1.02, 0.5);
  plane.add(rightAileron);

  // Tail: horizontal stabiliser + elevator, vertical fin + rudder.
  const stabGeo = new THREE.BoxGeometry(2.4, 0.12, 0.9);
  const stab = new THREE.Mesh(stabGeo, cream);
  stab.position.set(0, 0.35, 5.0);
  plane.add(stab);
  const elevatorGeo = new THREE.BoxGeometry(2.3, 0.09, 0.5);
  const elevator = new THREE.Mesh(elevatorGeo, orange);
  elevator.position.set(0, 0.35, 5.65);
  plane.add(elevator);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.5, 1.4), orange);
  fin.position.set(0, 0.9, 5.0);
  plane.add(fin);
  const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.3, 0.7), cream);
  rudder.position.set(0, 0.85, 5.85);
  plane.add(rudder);

  // Propeller: hub, two blades and a translucent spin disc.
  const prop = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 8), dark);
  hub.rotation.x = Math.PI / 2;
  prop.add(hub);
  const bladeGeo = new THREE.BoxGeometry(0.28, 3.4, 0.08);
  const blade1 = new THREE.Mesh(bladeGeo, dark);
  prop.add(blade1);
  const blade2 = new THREE.Mesh(bladeGeo, dark);
  blade2.rotation.z = Math.PI / 2;
  prop.add(blade2);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.75, 24),
    new THREE.MeshBasicMaterial({ color: 0x888888, transparent: true, opacity: 0.12, side: THREE.DoubleSide }),
  );
  prop.add(disc);
  prop.position.set(0, 0, -3.6);
  plane.add(prop);

  // Fixed gear with tundra tyres and struts.
  const gear = new THREE.Group();
  for (const side of [-1, 1]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.42, 12), tyre);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.05, -1.15, -0.9);
    gear.add(wheel);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.3, 6), dark);
    strut.position.set(side * 0.9, -0.55, -0.9);
    strut.rotation.z = side * 0.35;
    gear.add(strut);
  }
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.2, 10), tyre);
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -0.75, 4.9);
  gear.add(tailWheel);
  plane.add(gear);

  // Nav lights: red left, green right, white tail.
  const navMat = (c) => new THREE.MeshBasicMaterial({ color: c });
  const leftNav = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), navMat(0xff2222));
  leftNav.position.set(-7.2, 1.3, -0.5);
  plane.add(leftNav);
  const rightNav = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), navMat(0x22ff66));
  rightNav.position.set(7.2, 1.3, -0.5);
  plane.add(rightNav);
  const tailNav = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), navMat(0xffffff));
  tailNav.position.set(0, 0.3, 6.2);
  plane.add(tailNav);

  plane.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return { group: plane, prop, leftAileron, rightAileron, elevator, rudder, gear };
}

export function animateAircraft(rig, input, dt, throttle) {
  rig.prop.rotation.z += dt * (4 + throttle * 26);
  const roll = input.roll, pitch = input.pitch, yaw = input.yaw;
  rig.leftAileron.rotation.x = roll * 0.5;
  rig.rightAileron.rotation.x = -roll * 0.5;
  rig.elevator.rotation.x = pitch * 0.45;
  rig.rudder.rotation.y = -yaw * 0.4;
}
