import * as THREE from 'three';
import type { PedestrianAgent, VehicleAgent } from '../simulation/types';
import { createBandungPlateTexture, createContactShadowTexture } from './textures';

export interface VehicleMeshBundle {
  group: THREE.Group;
  wheels: THREE.Object3D[];
  brakeMat: THREE.MeshStandardMaterial;
  hazardMat: THREE.MeshStandardMaterial;
}

export interface PedestrianMeshBundle {
  group: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  phaseOffset: number;
}

// Shared high-detail wheel & trim materials
const tireTorusGeo = new THREE.TorusGeometry(0.24, 0.095, 10, 20);
const rimDiscGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.15, 14);
rimDiscGeo.rotateX(Math.PI / 2);
const spokeGeo = new THREE.BoxGeometry(0.32, 0.036, 0.18);

const tireMat = new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.88 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xd4d4d8, roughness: 0.2, metalness: 0.88 });
const bumperMat = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.62, metalness: 0.18 });
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xededf0, roughness: 0.14, metalness: 0.92 });
const interiorMat = new THREE.MeshStandardMaterial({ color: 0x1f242b, roughness: 0.9 });
const seatMat = new THREE.MeshStandardMaterial({ color: 0x3b3733, roughness: 0.85 });
const leatherMat = new THREE.MeshStandardMaterial({ color: 0x1e2024, roughness: 0.72 });

const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0x1e2f42,
  roughness: 0.05,
  metalness: 0.15,
  clearcoat: 1.0,
  clearcoatRoughness: 0.04,
  transparent: true,
  opacity: 0.56
});
const headlightMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0xfef3c7,
  emissiveIntensity: 1.2
});

const shadowTex = createContactShadowTexture();
const contactShadowMat = new THREE.MeshBasicMaterial({
  map: shadowTex,
  transparent: true,
  depthWrite: false
});

const privatePlateMat = new THREE.MeshBasicMaterial({ map: createBandungPlateTexture('D 1824 UY', false) });
const publicPlateMat = new THREE.MeshBasicMaterial({ map: createBandungPlateTexture('D 1942 AA', true) });
const motorPlateMat = new THREE.MeshBasicMaterial({ map: createBandungPlateTexture('D 4821 ZB', false) });

function createDetailedWheel(scale = 1.0): THREE.Group {
  const w = new THREE.Group();
  const tire = new THREE.Mesh(tireTorusGeo, tireMat);
  tire.castShadow = true;
  w.add(tire);
  w.add(new THREE.Mesh(rimDiscGeo, rimMat));
  for (let i = 0; i < 3; i++) {
    const sp = new THREE.Mesh(spokeGeo, bumperMat);
    sp.rotation.z = (i * Math.PI) / 3;
    w.add(sp);
  }
  w.scale.setScalar(scale);
  return w;
}

function addContactShadow(group: THREE.Group, L: number, W: number): void {
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(L * 1.18, W * 1.24), contactShadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.025;
  group.add(shadow);
}

/**
 * Reusable high-detail Indonesian automatic scooter (Honda Beat / Vario silhouette):
 * curved front apron, front fender, dual chrome fork tubes, sculpted handlebar cowl + mirrors,
 * step-through floorboard, curved tapered tail cowling, stepped seat, chrome grab rail,
 * exhaust muffler, Bandung D plate, and optional articulated commuter / green ojol rider.
 */
export function buildDetailedIndonesianScooter(
  bodyHex: number,
  withRider: boolean,
  isOjol: boolean,
  wheelsOut?: THREE.Object3D[],
  brakeMatOverride?: THREE.MeshStandardMaterial,
  hazardMatOverride?: THREE.MeshStandardMaterial
): THREE.Group {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: bodyHex,
    roughness: 0.24,
    metalness: 0.28,
    clearcoat: 0.82
  });
  const brakeMat =
    brakeMatOverride ??
    new THREE.MeshStandardMaterial({ color: 0x991b1b, emissive: 0xef4444, emissiveIntensity: 0.2 });
  const hazardMat =
    hazardMatOverride ??
    new THREE.MeshStandardMaterial({ color: 0xb45309, emissive: 0xfacc15, emissiveIntensity: 0.0 });

  // Front & rear slim multi-spoke motorcycle wheels
  for (const wx of [0.64, -0.62]) {
    const w = createDetailedWheel(0.76);
    w.scale.z = 0.52;
    w.position.set(wx, 0.25, 0);
    group.add(w);
    if (wheelsOut) wheelsOut.push(w);
  }

  // Telescopic chrome front fork tubes + front fender hugging front wheel
  for (const fz of [-0.09, 0.09]) {
    const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.62, 8), chromeMat);
    fork.position.set(0.54, 0.52, fz);
    fork.rotation.z = 0.34;
    group.add(fork);
  }
  const frontFender = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.14, 12, 1, true, -0.9, 1.5),
    bodyMat
  );
  frontFender.rotation.x = Math.PI / 2;
  frontFender.position.set(0.64, 0.26, 0);
  group.add(frontFender);

  // Curved front leg-shield / apron (ExtrudeGeometry)
  const apronShape = new THREE.Shape();
  apronShape.moveTo(0.24, 0.26);
  apronShape.lineTo(0.42, 0.26);
  apronShape.quadraticCurveTo(0.64, 0.56, 0.48, 0.96);
  apronShape.lineTo(0.32, 0.96);
  apronShape.quadraticCurveTo(0.38, 0.56, 0.24, 0.26);
  apronShape.closePath();
  const apronGeo = new THREE.ExtrudeGeometry(apronShape, {
    depth: 0.36,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.03,
    bevelSegments: 2
  });
  apronGeo.translate(0, 0, -0.18);
  const apron = new THREE.Mesh(apronGeo, bodyMat);
  apron.castShadow = true;
  group.add(apron);

  // Sculpted handlebar cowl + clear visor + headlight + handlebar grips + rearview mirrors
  const cowl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.38), bodyMat);
  cowl.position.set(0.42, 1.04, 0);
  cowl.rotation.z = -0.2;
  cowl.castShadow = true;
  group.add(cowl);

  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 0.22), headlightMat);
  hl.position.set(0.53, 1.03, 0);
  group.add(hl);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.24), glassMat);
  visor.position.set(0.46, 1.15, 0);
  visor.rotation.z = 0.35;
  group.add(visor);

  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.68, 8), bumperMat);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(0.38, 1.04, 0);
  group.add(bar);

  for (const mz of [-0.26, 0.26]) {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.18, 6), bumperMat);
    stalk.position.set(0.39, 1.16, mz);
    stalk.rotation.x = mz > 0 ? 0.25 : -0.25;
    group.add(stalk);
    const mir = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.11), bumperMat);
    mir.position.set(0.39, 1.24, mz * 1.15);
    group.add(mir);
  }

  // Step-through deck + underbody engine cover
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.38), bumperMat);
  deck.position.set(0.02, 0.32, 0);
  group.add(deck);

  // Curved tapered rear cowling (ExtrudeGeometry)
  const rearShape = new THREE.Shape();
  rearShape.moveTo(-0.18, 0.34);
  rearShape.lineTo(0.06, 0.34);
  rearShape.lineTo(0.02, 0.72);
  rearShape.quadraticCurveTo(-0.45, 0.78, -0.84, 0.74);
  rearShape.quadraticCurveTo(-0.74, 0.46, -0.18, 0.34);
  rearShape.closePath();
  const rearGeo = new THREE.ExtrudeGeometry(rearShape, {
    depth: 0.34,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.03,
    bevelSegments: 2
  });
  rearGeo.translate(0, 0, -0.17);
  const rearBody = new THREE.Mesh(rearGeo, bodyMat);
  rearBody.castShadow = true;
  group.add(rearBody);

  // Contoured stepped leather seat + chrome rear grab rail (behel)
  const seatFront = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.32), leatherMat);
  seatFront.position.set(-0.16, 0.78, 0);
  group.add(seatFront);
  const seatRear = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.3), leatherMat);
  seatRear.position.set(-0.52, 0.82, 0);
  group.add(seatRear);

  const grabRail = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 6, 12, Math.PI), chromeMat);
  grabRail.rotation.x = Math.PI / 2;
  grabRail.rotation.z = Math.PI / 2;
  grabRail.position.set(-0.72, 0.84, 0);
  group.add(grabRail);

  // Angled exhaust muffler pipe on right side (+Z)
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.042, 0.56, 8), bumperMat);
  exhaust.rotation.z = Math.PI / 2 - 0.18;
  exhaust.position.set(-0.48, 0.34, 0.21);
  group.add(exhaust);
  const heatShield = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.03), chromeMat);
  heatShield.position.set(-0.48, 0.35, 0.26);
  group.add(heatShield);

  // Rear tail light, blinkers & Bandung D license plate
  const bl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.18), brakeMat);
  bl.position.set(-0.85, 0.72, 0);
  group.add(bl);

  const hz = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), hazardMat);
  hz.position.set(-0.86, 0.64, 0.1);
  group.add(hz);

  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.11, 0.22), motorPlateMat);
  plate.position.set(-0.86, 0.52, 0);
  plate.rotation.z = 0.25;
  group.add(plate);

  // Articulated Commuter / Green Ojol Rider!
  if (withRider) {
    const jacketColor = isOjol ? 0x15803d : [0x1e293b, 0x3f3f46, 0x7f1d1d, 0x1d4ed8][bodyHex % 4];
    const jacketMat = new THREE.MeshStandardMaterial({ color: jacketColor, roughness: 0.78 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.88 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.85 });
    const helmetMat = new THREE.MeshStandardMaterial({
      color: isOjol ? 0x16a34a : 0xf8fafc,
      roughness: 0.22,
      metalness: 0.15
    });

    // Rider torso leaning slightly forward
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.52, 0.38), jacketMat);
    torso.position.set(-0.14, 1.15, 0);
    torso.rotation.z = -0.22;
    torso.castShadow = true;
    group.add(torso);

    // Backpack (commuter / UPI student)
    const pack = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.4, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.85 })
    );
    pack.position.set(-0.34, 1.18, 0);
    pack.rotation.z = -0.22;
    pack.castShadow = true;
    group.add(pack);

    // Articulated arms reaching forward to grip the handlebars!
    for (const sz of [-0.24, 0.24]) {
      const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.32, 8), jacketMat);
      upperArm.position.set(-0.02, 1.24, sz);
      upperArm.rotation.z = -1.05;
      group.add(upperArm);

      const foreArm = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.042, 0.32, 8), jacketMat);
      foreArm.position.set(0.22, 1.12, sz * 1.12);
      foreArm.rotation.z = -1.25;
      group.add(foreArm);
    }

    // Bent thighs + shins + shoes resting on foot deck
    for (const lz of [-0.18, 0.18]) {
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.38, 8), pantsMat);
      thigh.position.set(0.0, 0.82, lz);
      thigh.rotation.z = -1.28;
      group.add(thigh);

      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.42, 8), pantsMat);
      shin.position.set(0.14, 0.58, lz);
      shin.rotation.z = 0.18;
      group.add(shin);

      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.1), shoeMat);
      shoe.position.set(0.18, 0.39, lz);
      group.add(shoe);
    }

    // Full-face helmet + tinted visor
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.175, 12, 10), helmetMat);
    helmet.position.set(-0.04, 1.56, 0);
    helmet.castShadow = true;
    group.add(helmet);

    const visorBand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.178, 0.178, 0.1, 12, 1, true, -0.7, 1.4),
      glassMat
    );
    visorBand.rotation.y = Math.PI / 2;
    visorBand.position.set(-0.02, 1.56, 0);
    group.add(visorBand);
  }

  return group;
}

export function createVehicleMesh(agent: VehicleAgent): VehicleMeshBundle {
  const group = new THREE.Group();
  group.userData.vehicleId = agent.id;
  const wheels: THREE.Object3D[] = [];

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: agent.colorHex,
    roughness: 0.22,
    metalness: 0.28,
    clearcoat: 0.85,
    clearcoatRoughness: 0.12
  });

  const brakeMat = new THREE.MeshStandardMaterial({
    color: 0x7f1d1d,
    emissive: 0xef4444,
    emissiveIntensity: 0.18
  });

  const hazardMat = new THREE.MeshStandardMaterial({
    color: 0xb45309,
    emissive: 0xfacc15,
    emissiveIntensity: 0.0
  });

  const L = agent.lengthM;
  const W = agent.widthM;
  const H = agent.heightM;

  addContactShadow(group, L, W);

  if (agent.kind === 'Motor') {
    const isOjol = agent.id % 3 === 0;
    const scooter = buildDetailedIndonesianScooter(
      agent.colorHex,
      true,
      isOjol,
      wheels,
      brakeMat,
      hazardMat
    );
    group.add(scooter);
  } else if (agent.kind === 'Boks Muat') {
    buildBoxTruck(group, wheels, L, W, H, bodyMat, brakeMat, hazardMat);
  } else if (agent.kind === 'Angkot') {
    buildBandungAngkot(group, wheels, L, W, H, bodyMat, brakeMat, hazardMat);
  } else {
    buildSculptedMPV(group, wheels, L, W, H, bodyMat, brakeMat, hazardMat);
  }

  group.traverse(obj => {
    obj.userData.vehicleId = agent.id;
  });

  return { group, wheels, brakeMat, hazardMat };
}

function buildSculptedMPV(
  group: THREE.Group,
  wheels: THREE.Object3D[],
  L: number,
  W: number,
  H: number,
  bodyMat: THREE.Material,
  brakeMat: THREE.Material,
  hazardMat: THREE.Material
): void {
  const halfL = L / 2;
  const lower = new THREE.Shape();
  lower.moveTo(-halfL + 0.08, 0.34);
  lower.lineTo(halfL - 0.08, 0.34);
  lower.quadraticCurveTo(halfL + 0.05, 0.52, halfL - 0.02, 0.78);
  lower.quadraticCurveTo(halfL - 0.14, 0.94, halfL - 0.98, 1.0);
  lower.lineTo(-halfL + 0.12, 1.02);
  lower.quadraticCurveTo(-halfL - 0.02, 0.92, -halfL + 0.02, 0.54);
  lower.closePath();

  const extrudeW = W - 0.18;
  const lowerGeo = new THREE.ExtrudeGeometry(lower, {
    depth: extrudeW,
    bevelEnabled: true,
    bevelThickness: 0.09,
    bevelSize: 0.07,
    bevelSegments: 4
  });
  lowerGeo.translate(0, 0, -extrudeW / 2);
  const lowerMesh = new THREE.Mesh(lowerGeo, bodyMat);
  lowerMesh.castShadow = true;
  lowerMesh.receiveShadow = true;
  group.add(lowerMesh);

  const dash = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.38, W * 0.76), interiorMat);
  dash.position.set(halfL - 1.32, 1.02, 0);
  group.add(dash);
  for (const sx of [0.15, -0.75]) {
    for (const sz of [-0.36, 0.36]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.52, 0.44), seatMat);
      seat.position.set(sx, 1.08, sz);
      group.add(seat);
    }
  }

  const glassShape = new THREE.Shape();
  glassShape.moveTo(halfL - 0.96, 0.99);
  glassShape.quadraticCurveTo(halfL - 1.32, H - 0.08, halfL - 1.62, H - 0.03);
  glassShape.lineTo(-halfL + 0.56, H - 0.03);
  glassShape.quadraticCurveTo(-halfL + 0.28, H - 0.1, -halfL + 0.16, 0.99);
  glassShape.closePath();
  const glassGeo = new THREE.ExtrudeGeometry(glassShape, {
    depth: W - 0.24,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.03,
    bevelSegments: 2
  });
  glassGeo.translate(0, 0, -(W - 0.24) / 2);
  group.add(new THREE.Mesh(glassGeo, glassMat));

  const roof = new THREE.Mesh(new THREE.BoxGeometry(L * 0.48, 0.08, W - 0.22), bodyMat);
  roof.position.set(-0.24, H, 0);
  roof.castShadow = true;
  group.add(roof);

  for (const rz of [-W * 0.34, W * 0.34]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(L * 0.42, 0.055, 0.055), chromeMat);
    rail.position.set(-0.24, H + 0.07, rz);
    group.add(rail);
  }
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, W * 0.86), bodyMat);
  spoiler.position.set(-halfL + 0.48, H + 0.02, 0);
  group.add(spoiler);

  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, W + 0.02), bumperMat);
  frontBumper.position.set(halfL + 0.02, 0.42, 0);
  group.add(frontBumper);

  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, W + 0.02), bumperMat);
  rearBumper.position.set(-halfL - 0.02, 0.42, 0);
  group.add(rearBumper);

  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, W * 0.48), bumperMat);
  grille.position.set(halfL + 0.04, 0.72, 0);
  group.add(grille);
  const grilleBar = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.045, W * 0.44), chromeMat);
  grilleBar.position.set(halfL + 0.05, 0.74, 0);
  group.add(grilleBar);

  for (const sz of [-W / 2 - 0.12, W / 2 + 0.12]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.11, 0.18), bodyMat);
    mirror.position.set(halfL - 1.24, 1.06, sz);
    group.add(mirror);
  }

  for (const px of [halfL + 0.11, -halfL - 0.11]) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, 0.44), privatePlateMat);
    plate.position.set(px, 0.46, 0);
    group.add(plate);
  }

  addFourWheelsAndLights(group, wheels, L, W, 0.74, 0.78, brakeMat, hazardMat);
}

function buildBandungAngkot(
  group: THREE.Group,
  wheels: THREE.Object3D[],
  L: number,
  W: number,
  H: number,
  bodyMat: THREE.Material,
  brakeMat: THREE.Material,
  hazardMat: THREE.Material
): void {
  const halfL = L / 2;
  const profile = new THREE.Shape();
  profile.moveTo(-halfL + 0.06, 0.34);
  profile.lineTo(halfL - 0.06, 0.34);
  profile.quadraticCurveTo(halfL + 0.04, 0.65, halfL - 0.02, 0.98);
  profile.quadraticCurveTo(halfL - 0.16, H - 0.12, halfL - 0.38, H);
  profile.lineTo(-halfL + 0.16, H);
  profile.quadraticCurveTo(-halfL, H - 0.15, -halfL, 0.96);
  profile.closePath();

  const extrudeW = W - 0.14;
  const geo = new THREE.ExtrudeGeometry(profile, {
    depth: extrudeW,
    bevelEnabled: true,
    bevelThickness: 0.07,
    bevelSize: 0.05,
    bevelSegments: 3
  });
  geo.translate(0, 0, -extrudeW / 2);
  const body = new THREE.Mesh(geo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(L + 0.04, 0.24, W + 0.03),
    new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.45 })
  );
  stripe.position.set(0, 0.88, 0);
  group.add(stripe);

  const roofCap = new THREE.Mesh(
    new THREE.BoxGeometry(L - 0.45, 0.12, W - 0.08),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 })
  );
  roofCap.position.set(-0.08, H + 0.04, 0);
  group.add(roofCap);

  const winBand = new THREE.Mesh(new THREE.BoxGeometry(L - 0.38, H * 0.36, W + 0.01), glassMat);
  winBand.position.set(-0.02, 1.38, 0);
  group.add(winBand);

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, W + 0.04), bumperMat);
  bumper.position.set(halfL + 0.04, 0.44, 0);
  group.add(bumper);

  const bullbar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, W * 0.52), chromeMat);
  bullbar.position.set(halfL + 0.12, 0.56, 0);
  group.add(bullbar);

  for (const px of [halfL + 0.14, -halfL - 0.11]) {
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.14, 0.44), publicPlateMat);
    plate.position.set(px, 0.45, 0);
    group.add(plate);
  }

  const routeSign = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.16, 0.68),
    new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xfde047, emissiveIntensity: 0.65 })
  );
  routeSign.position.set(halfL - 0.18, H - 0.14, 0);
  group.add(routeSign);

  addFourWheelsAndLights(group, wheels, L, W, 0.72, 0.72, brakeMat, hazardMat);
}

function buildBoxTruck(
  group: THREE.Group,
  wheels: THREE.Object3D[],
  L: number,
  W: number,
  H: number,
  bodyMat: THREE.Material,
  brakeMat: THREE.Material,
  hazardMat: THREE.Material
): void {
  const halfL = L / 2;
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(L - 0.2, 0.24, W * 0.72), bumperMat);
  chassis.position.set(0, 0.42, 0);
  group.add(chassis);

  const cabLen = L * 0.29;
  const cabShape = new THREE.Shape();
  cabShape.moveTo(0, 0.5);
  cabShape.lineTo(cabLen, 0.5);
  cabShape.lineTo(cabLen, 1.25);
  cabShape.quadraticCurveTo(cabLen - 0.12, H * 0.84, cabLen - 0.34, H * 0.84);
  cabShape.lineTo(0, H * 0.84);
  cabShape.closePath();

  const cabGeo = new THREE.ExtrudeGeometry(cabShape, {
    depth: W * 0.86,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 3
  });
  cabGeo.translate(halfL - cabLen, 0, -(W * 0.86) / 2);
  const cab = new THREE.Mesh(cabGeo, bodyMat);
  cab.castShadow = true;
  group.add(cab);

  // Clean aerodynamic cab roof wind-deflector wedge flush with cargo box
  const defShape = new THREE.Shape();
  defShape.moveTo(0, 0);
  defShape.lineTo(cabLen * 0.72, 0);
  defShape.quadraticCurveTo(cabLen * 0.25, H * 0.14, 0, H * 0.24);
  defShape.closePath();
  const defGeo = new THREE.ExtrudeGeometry(defShape, {
    depth: W * 0.82,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.02,
    bevelSegments: 2
  });
  defGeo.translate(halfL - cabLen, H * 0.84, -(W * 0.82) / 2);
  const deflector = new THREE.Mesh(
    defGeo,
    new THREE.MeshStandardMaterial({ color: 0xf4f4f5, roughness: 0.42 })
  );
  deflector.castShadow = true;
  group.add(deflector);

  const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.72, W * 0.82), glassMat);
  windshield.position.set(halfL - 0.18, 1.54, 0);
  windshield.rotation.z = 0.26;
  group.add(windshield);

  for (const sz of [-W * 0.54, W * 0.54]) {
    const mir = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.1), bumperMat);
    mir.position.set(halfL - 0.2, 1.5, sz);
    group.add(mir);
  }

  const boxLen = L * 0.67;
  const boxH = H * 0.88;
  const cargoBox = new THREE.Mesh(
    new THREE.BoxGeometry(boxLen, boxH, W),
    new THREE.MeshStandardMaterial({ color: 0xf4f4f5, roughness: 0.42, metalness: 0.22 })
  );
  cargoBox.position.set(-halfL + boxLen / 2, 0.52 + boxH / 2, 0);
  cargoBox.castShadow = true;
  cargoBox.receiveShadow = true;
  group.add(cargoBox);

  for (let rx = -boxLen * 0.42; rx <= boxLen * 0.42; rx += 0.72) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.06, boxH - 0.16, W + 0.04), chromeMat);
    rib.position.set(-halfL + boxLen / 2 + rx, 0.52 + boxH / 2, 0);
    group.add(rib);
  }

  const safetyStripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.14, W * 0.9),
    new THREE.MeshStandardMaterial({ color: 0xdc2626, emissive: 0xef4444, emissiveIntensity: 0.45 })
  );
  safetyStripe.position.set(-halfL - 0.02, 0.62, 0);
  group.add(safetyStripe);

  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.26, W * 0.94), bumperMat);
  frontBumper.position.set(halfL + 0.04, 0.54, 0);
  group.add(frontBumper);

  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.15, 0.46), publicPlateMat);
  plate.position.set(halfL + 0.14, 0.54, 0);
  group.add(plate);

  addFourWheelsAndLights(group, wheels, L, W, 0.86, 0.72, brakeMat, hazardMat, 1.12);
}

function addFourWheelsAndLights(
  group: THREE.Group,
  wheels: THREE.Object3D[],
  L: number,
  W: number,
  hlY: number,
  blY: number,
  brakeMat: THREE.Material,
  hazardMat: THREE.Material,
  wheelScale = 1.0
): void {
  const wheelX = [L * 0.31, -L * 0.31];
  const wheelZ = [-W * 0.46, W * 0.46];
  for (const wx of wheelX) {
    for (const wz of wheelZ) {
      const w = createDetailedWheel(wheelScale);
      w.position.set(wx, 0.32 * wheelScale, wz);
      group.add(w);
      wheels.push(w);
    }
  }

  for (const lz of [-W * 0.34, W * 0.34]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.28), headlightMat);
    hl.position.set(L * 0.5 + 0.02, hlY, lz);
    group.add(hl);

    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.3), brakeMat);
    bl.position.set(-L * 0.5 - 0.02, blY, lz);
    group.add(bl);

    const hz = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), hazardMat);
    hz.position.set(L * 0.48, hlY + 0.12, lz * 1.15);
    group.add(hz);
  }
}

/**
 * Full articulated 3D human pedestrian (UPI student / Bandung market shopper):
 * hip-pivoted legs + sneakers, shoulder-pivoted swinging arms, sculpted torso,
 * neck + head + hair OR draped hijab, plus student backpack or grocery tote bag.
 */
export function createPedestrianMesh(ped: PedestrianAgent): PedestrianMeshBundle {
  const g = new THREE.Group();
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xdcb092, roughness: 0.72 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: ped.shirtHex, roughness: 0.78 });
  const pantsColors = [0x1e293b, 0x27272a, 0x334155, 0x44403c];
  const pantsMat = new THREE.MeshStandardMaterial({
    color: pantsColors[ped.id % pantsColors.length],
    roughness: 0.88
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: ped.id % 2 === 0 ? 0xf8fafc : 0x18181b,
    roughness: 0.65
  });

  // Hip-pivoted left & right legs with shoes
  const buildLeg = (zOffset: number): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.82, zOffset);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.056, 0.74, 8), pantsMat);
    leg.position.y = -0.37;
    leg.castShadow = true;
    pivot.add(leg);

    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.11), shoeMat);
    shoe.position.set(0.04, -0.77, 0);
    shoe.castShadow = true;
    pivot.add(shoe);
    return pivot;
  };

  const leftLegPivot = buildLeg(-0.095);
  const rightLegPivot = buildLeg(0.095);
  g.add(leftLegPivot, rightLegPivot);

  // Pelvis / waist
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.34), pantsMat);
  pelvis.position.y = 0.84;
  g.add(pelvis);

  // Sculpted upper torso + shoulders
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.52, 0.38), shirtMat);
  torso.position.y = 1.16;
  torso.castShadow = true;
  g.add(torso);

  // Shoulder-pivoted swinging left & right arms + hands
  const buildArm = (zOffset: number, carryBag: boolean): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(0, 1.38, zOffset);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.046, 0.46, 8), shirtMat);
    sleeve.position.y = -0.22;
    sleeve.castShadow = true;
    pivot.add(sleeve);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 8), skinMat);
    hand.position.y = -0.47;
    pivot.add(hand);

    if (carryBag) {
      const bagCol = ped.id % 2 === 0 ? 0xea580c : 0x0284c7;
      const bag = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.28, 0.1),
        new THREE.MeshStandardMaterial({ color: bagCol, roughness: 0.75 })
      );
      bag.position.set(0.02, -0.62, zOffset > 0 ? 0.04 : -0.04);
      bag.castShadow = true;
      pivot.add(bag);
    }
    return pivot;
  };

  const carriesTote = ped.id % 3 === 1;
  const leftArmPivot = buildArm(-0.24, false);
  const rightArmPivot = buildArm(0.24, carriesTote);
  g.add(leftArmPivot, rightArmPivot);

  // Student backpack on ~45% of pedestrians
  if (ped.id % 3 === 0) {
    const bp = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.38, 0.28),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85 })
    );
    bp.position.set(-0.18, 1.18, 0);
    bp.castShadow = true;
    g.add(bp);
  }

  // Neck + Head + Hair OR Draped Bandung Hijab
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.09, 8), skinMat);
  neck.position.y = 1.46;
  g.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 10, 10), skinMat);
  head.position.y = 1.59;
  head.castShadow = true;
  g.add(head);

  const wearsHijab = ped.id % 2 === 1;
  if (wearsHijab) {
    const hijabColors = [0xd6c7b2, 0x9f1239, 0x1e3a5f, 0x475569, 0x0f766e];
    const hijabMat = new THREE.MeshStandardMaterial({
      color: hijabColors[ped.id % hijabColors.length],
      roughness: 0.82
    });
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), hijabMat);
    hood.position.set(-0.02, 1.6, 0);
    g.add(hood);

    const shawl = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.34, 10), hijabMat);
    shawl.position.set(0, 1.38, 0);
    g.add(shawl);
  } else {
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.145, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.56),
      new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 })
    );
    hair.position.set(-0.01, 1.61, 0);
    g.add(hair);
  }

  // Slight natural height variation
  const hScale = 0.94 + (ped.id % 5) * 0.03;
  g.scale.setScalar(hScale);

  return {
    group: g,
    leftLegPivot,
    rightLegPivot,
    leftArmPivot,
    rightArmPivot,
    phaseOffset: ped.id * 1.7
  };
}
