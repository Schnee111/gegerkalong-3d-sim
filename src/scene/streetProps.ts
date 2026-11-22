import * as THREE from 'three';
import { createSignTexture } from './textures';

export interface AnimatedOfficer {
  group: THREE.Group;
  rightArm: THREE.Mesh;
}

/**
 * Indonesian street food cart (Gerobak Bakso / Gorengan) with plastic stools beside it.
 */
export function createGerobakCart(umbrellaHex = 0x1d4ed8): THREE.Group {
  const g = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.85 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xe2f1ff,
    roughness: 0.12,
    transparent: true,
    opacity: 0.62
  });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x3f3f46, roughness: 0.45, metalness: 0.5 });

  const base = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.72, 0.76), woodMat);
  base.position.y = 0.64;
  base.castShadow = true;
  g.add(base);

  const showcase = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.58, 0.66), glassMat);
  showcase.position.y = 1.29;
  g.add(showcase);

  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.08, 0.82), woodMat);
  cap.position.y = 1.62;
  cap.castShadow = true;
  g.add(cap);

  const wheelGeo = new THREE.TorusGeometry(0.28, 0.04, 8, 16);
  for (const wz of [-0.42, 0.42]) {
    const wheel = new THREE.Mesh(wheelGeo, metalMat);
    wheel.position.set(0.15, 0.3, wz);
    g.add(wheel);
  }

  for (const hz of [-0.32, 0.32]) {
    const h = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 6), woodMat);
    h.rotation.z = Math.PI / 2;
    h.position.set(-0.98, 0.92, hz);
    g.add(h);
  }

  // Umbrella
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.35, 6), metalMat);
  pole.position.set(0.3, 1.35, 0);
  g.add(pole);

  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(1.18, 0.44, 8),
    new THREE.MeshStandardMaterial({ color: umbrellaHex, roughness: 0.72 })
  );
  canopy.position.set(0.3, 2.58, 0);
  canopy.castShadow = true;
  g.add(canopy);

  // Two classic Indonesian blue/red plastic warung stools (kursi bakso)
  for (const [sx, sz, col] of [[1.3, 0.35, 0x2563eb], [1.3, -0.35, 0xdc2626]] as const) {
    const stool = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 0.44, 8),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.55 })
    );
    stool.position.set(sx, 0.22, sz);
    stool.castShadow = true;
    g.add(stool);
  }

  return g;
}

/**
 * Concrete street planter box with lush tropical shrubs & magenta bougainvillea blooms.
 */
export function createPlanterBox(): THREE.Group {
  const g = new THREE.Group();
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.52, 0.72),
    new THREE.MeshStandardMaterial({ color: 0xbcb8b0, roughness: 0.9 })
  );
  box.position.y = 0.26;
  box.castShadow = true;
  box.receiveShadow = true;
  g.add(box);

  const soil = new THREE.Mesh(
    new THREE.BoxGeometry(1.36, 0.08, 0.58),
    new THREE.MeshStandardMaterial({ color: 0x4b3b2c, roughness: 0.95 })
  );
  soil.position.y = 0.5;
  g.add(soil);

  const shrubMat = new THREE.MeshStandardMaterial({ color: 0x2f6f3e, roughness: 0.85 });
  const bloomMat = new THREE.MeshStandardMaterial({ color: 0xdb2777, roughness: 0.7 });
  for (const ox of [-0.42, 0, 0.42]) {
    const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 1), shrubMat);
    bush.position.set(ox, 0.72, 0);
    bush.scale.set(1.1, 0.85, 0.9);
    bush.castShadow = true;
    g.add(bush);
    const flower = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), bloomMat);
    flower.position.set(ox + 0.12, 0.92, 0.1);
    g.add(flower);
  }
  return g;
}

/**
 * Bandung Twin Trash Bins (Organik hijau / Anorganik kuning).
 */
export function createBandungTrashBin(): THREE.Group {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.5, metalness: 0.5 });
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.06, 0.06), frameMat);
  post.position.y = 0.55;
  g.add(post);

  for (const [bx, col] of [[-0.26, 0x16a34a], [0.26, 0xeab308]] as const) {
    const bin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.15, 0.62, 10),
      new THREE.MeshStandardMaterial({ color: col, roughness: 0.48 })
    );
    bin.position.set(bx, 0.42, 0);
    bin.castShadow = true;
    g.add(bin);
  }
  return g;
}

/**
 * Indonesian Green-White Street Name Sign ("Jl. Gegerkalong Tengah").
 */
export function createStreetNamePost(streetName: string): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.045, 3.2, 8),
    new THREE.MeshStandardMaterial({ color: 0x52525b, metalness: 0.6, roughness: 0.4 })
  );
  pole.position.y = 1.6;
  pole.castShadow = true;
  g.add(pole);

  const tex = createSignTexture(streetName, 'Kec. Sukasari · Kota Bandung', '#15803d', '#ffffff', '#fde047');
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.72, 0.08),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  board.position.set(0, 2.95, 0);
  g.add(board);
  return g;
}

/**
 * Convex Traffic Safety Mirror (Cermin Cembung Tikungan) at Simpang Girang.
 */
export function createConvexMirror(): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 3.4, 8),
    new THREE.MeshStandardMaterial({ color: 0x3f3f46, metalness: 0.6, roughness: 0.4 })
  );
  pole.position.y = 1.7;
  pole.castShadow = true;
  g.add(pole);

  const hood = new THREE.Mesh(
    new THREE.CylinderGeometry(0.46, 0.46, 0.12, 20),
    new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.5 })
  );
  hood.rotation.z = Math.PI / 2;
  hood.position.set(0.08, 3.15, 0);
  g.add(hood);

  const mirror = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.35),
    new THREE.MeshPhysicalMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.05 })
  );
  mirror.rotation.z = -Math.PI / 2;
  mirror.position.set(0.1, 3.15, 0);
  g.add(mirror);
  return g;
}

export function createParkedScooter(bodyHex: number): THREE.Group {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyHex, roughness: 0.32, metalness: 0.28 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.85 });

  const wheelGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.1, 12);
  wheelGeo.rotateX(Math.PI / 2);
  for (const wx of [0.58, -0.58]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.position.set(wx, 0.22, 0);
    g.add(w);
  }

  const fairing = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.62, 0.42), bodyMat);
  fairing.position.set(0.42, 0.56, 0);
  fairing.rotation.z = -0.22;
  fairing.castShadow = true;
  g.add(fairing);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.38), darkMat);
  deck.position.set(0, 0.28, 0);
  g.add(deck);

  const rear = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.36, 0.4), bodyMat);
  rear.position.set(-0.3, 0.52, 0);
  rear.castShadow = true;
  g.add(rear);

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.14, 0.34), darkMat);
  seat.position.set(-0.22, 0.75, 0);
  g.add(seat);

  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.58, 6), darkMat);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(0.48, 0.92, 0);
  g.add(bar);
  return g;
}

export function createDishubOfficer(): AnimatedOfficer {
  const g = new THREE.Group();
  const navyMat = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.8 });
  const vestMat = new THREE.MeshStandardMaterial({
    color: 0x84cc16,
    emissive: 0x65a30d,
    emissiveIntensity: 0.22,
    roughness: 0.6
  });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xdcb092, roughness: 0.72 });

  for (const lz of [-0.09, 0.09]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.82, 6), navyMat);
    leg.position.set(0, 0.41, lz);
    leg.castShadow = true;
    g.add(leg);
  }

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.56, 0.42), vestMat);
  torso.position.y = 1.08;
  torso.castShadow = true;
  g.add(torso);

  const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.54, 6), navyMat);
  leftArm.position.set(0, 1.05, -0.27);
  g.add(leftArm);

  const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.58, 6), navyMat);
  rightArm.position.set(0, 1.24, 0.28);
  rightArm.rotation.x = 0.6;
  g.add(rightArm);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 10), skinMat);
  head.position.y = 1.54;
  g.add(head);

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.1, 10),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 })
  );
  cap.position.y = 1.66;
  g.add(cap);

  return { group: g, rightArm };
}

export function createTrafficCone(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.05, 0.36),
    new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.85 })
  );
  base.position.y = 0.025;
  g.add(base);

  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.14, 0.58, 12),
    new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.55 })
  );
  cone.position.y = 0.32;
  cone.castShadow = true;
  g.add(cone);

  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(0.065, 0.095, 0.12, 12),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 })
  );
  band.position.y = 0.38;
  g.add(band);
  return g;
}

export function createSpeedBump(roadWidthM: number): THREE.Group {
  const g = new THREE.Group();
  const segCount = 8;
  const segW = (roadWidthM - 0.5) / segCount;
  for (let i = 0; i < segCount; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: i % 2 === 0 ? 0xfacc15 : 0x18181b,
      roughness: 0.7
    });
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, segW, 8, 1, false, 0, Math.PI), mat);
    seg.rotation.x = Math.PI / 2;
    seg.scale.set(1.8, 1, 0.45);
    seg.position.set(0, 0.05, -(roadWidthM - 0.5) / 2 + (i + 0.5) * segW);
    g.add(seg);
  }
  return g;
}

export function createWarningBeacon(): { group: THREE.Group; bulbMat: THREE.MeshStandardMaterial } {
  const g = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3f3f46, metalness: 0.55, roughness: 0.4 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5.2, 8), poleMat);
  pole.position.y = 2.6;
  pole.castShadow = true;
  g.add(pole);

  const housing = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.85, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.6 })
  );
  housing.position.y = 5.0;
  g.add(housing);

  const bulbMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 2.0
  });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 10), bulbMat);
  bulb.position.set(0.22, 5.0, 0);
  g.add(bulb);

  return { group: g, bulbMat };
}

export function createBandungMountainBackdrop(): THREE.Group {
  const g = new THREE.Group();
  const farMat = new THREE.MeshStandardMaterial({ color: 0x8aa6ba, roughness: 1.0, metalness: 0.0 });
  const midMat = new THREE.MeshStandardMaterial({ color: 0x678a7f, roughness: 0.98, metalness: 0.0 });

  const peaks: [number, number, number, number, boolean][] = [
    [-260, -215, 115, 62, true],
    [-120, -235, 145, 78, true],
    [40, -230, 135, 70, true],
    [210, -220, 125, 64, true],
    [-180, -180, 95, 38, false],
    [-10, -190, 115, 44, false],
    [150, -185, 105, 40, false]
  ];
  for (const [px, pz, rad, h, isFar] of peaks) {
    const ridge = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 7), isFar ? farMat : midMat);
    ridge.scale.set(1.8, 1, 0.65);
    ridge.position.set(px, h / 2 - 4, pz);
    g.add(ridge);
  }
  return g;
}
