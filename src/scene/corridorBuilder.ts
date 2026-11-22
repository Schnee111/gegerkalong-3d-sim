import * as THREE from 'three';
import {
  OSM_BG_BUILDINGS,
  OSM_FRONT_BUILDINGS,
  OSM_SIDE_ROADS,
  type OsmFrontBuilding
} from '../config/osmCorridorData';
import { CORRIDOR, SCENARIOS, type OneWayDirection, type ScenarioKey } from '../config/scenarios';
import {
  createDetailedKosBuilding,
  createDetailedRuko,
  createTropicalTree,
  createUtilityPole,
  type RukoSpec
} from './buildingFactory';
import {
  createCorridorRibbonGeometry,
  createPolylineRoadGeometry,
  createSlopedTerrainGeometry,
  sampleCorridorFrame
} from './roadSpline';
import {
  createBandungTrashBin,
  createConvexMirror,
  createDishubOfficer,
  createGerobakCart,
  createPlanterBox,
  createSpeedBump,
  createStreetNamePost,
  createTrafficCone,
  createWarningBeacon,
  type AnimatedOfficer
} from './streetProps';
import {
  createKanstinCurbTexture,
  createLeafClusterTexture,
  createNoStopSignTexture,
  createSignTexture,
  loadAsphaltPbr,
  loadClayRoofPbr,
  loadFacadeTexture,
  loadGreyRoofPbr,
  loadPaversPbr,
  loadWeatheredWallPbr
} from './textures';
import { buildDetailedIndonesianScooter, createPedestrianMesh } from './vehicleFactory';

export interface CorridorHandles {
  sidewalkGroup: THREE.Group;
  offstreetGroup: THREE.Group;
  baselineClutterGroup: THREE.Group;
  noStopSignGroup: THREE.Group;
  twoWayArrows: THREE.Group;
  oneWayPagiArrows: THREE.Group;
  oneWaySoreArrows: THREE.Group;
  officers: AnimatedOfficer[];
  beaconBulbMat: THREE.MeshStandardMaterial;
  updateForScenario(key: ScenarioKey, oneWayDir: OneWayDirection): void;
}

interface ShopPreset {
  name: string;
  sub: string;
  bg: string;
  fg: string;
  accent: string;
  awning: string;
  wall: number;
  trim: number;
  roof: RukoSpec['roofType'];
  blade?: boolean;
  porch?: boolean;
}

// Verified real & authentic Gegerkalong Tengah shopfront presets
const SHOP_PRESETS: ShopPreset[] = [
  { name: 'KANTOR KAS BANK BJB', sub: 'Gegerkalong Tengah', bg: '#0c4a6e', fg: '#ffffff', accent: '#facc15', awning: '#0369a1', wall: 0xf1ede4, trim: 0x1e3a5f, roof: 'flat-parapet', blade: true },
  { name: 'BAROKAH MM', sub: 'Jl. Gegerkalong Tengah No. 23', bg: '#1e3a8a', fg: '#ffffff', accent: '#f59e0b', awning: '#1d4ed8', wall: 0xebe6db, trim: 0x334155, roof: 'tile-dark', blade: true },
  { name: 'WARUNG 46', sub: 'Sembako & Harian · No. 46', bg: '#166534', fg: '#fefce8', accent: '#facc15', awning: '#15803d', wall: 0xe6e0d2, trim: 0x57534e, roof: 'tile-red', porch: true },
  { name: 'FOTOKOPI & PRINT UPI', sub: 'Jilid · ATK · Cetak 24 Jam', bg: '#1d4ed8', fg: '#ffffff', accent: '#facc15', awning: '#2563eb', wall: 0xf0ebe0, trim: 0x475569, roof: 'flat-parapet', blade: true },
  { name: 'WARTEG GEGERKALONG', sub: 'Masakan Rumahan Mahasiswa', bg: '#15803d', fg: '#ffffff', accent: '#fbbf24', awning: '#16a34a', wall: 0xe8e2d5, trim: 0x4b5563, roof: 'tile-red', porch: true },
  { name: 'APOTEK GEGERKALONG', sub: 'Obat Resep & Alkes', bg: '#0f766e', fg: '#ffffff', accent: '#5eead4', awning: '#0d9488', wall: 0xf4f1ea, trim: 0x1e293b, roof: 'flat-parapet', blade: true },
  { name: 'LAUNDRY KILOAN UPI', sub: 'Cuci Setrika Express', bg: '#0284c7', fg: '#ffffff', accent: '#38bdf8', awning: '#0369a1', wall: 0xeee9df, trim: 0x64748b, roof: 'spandek-slope' },
  { name: 'WARUNG NASI SUNDA', sub: 'Ayam Goreng · Sambal Dadak', bg: '#9a3412', fg: '#fef3c7', accent: '#f59e0b', awning: '#b45309', wall: 0xe7dfd1, trim: 0x78350f, roof: 'tile-red', porch: true },
  { name: 'TOKO BERAS & SEMBAKO', sub: 'Grosir Pasar Gegerkalong', bg: '#7c2d12', fg: '#fef3c7', accent: '#fb923c', awning: '#c2410c', wall: 0xeae1d3, trim: 0x57534e, roof: 'tile-dark', porch: true },
  { name: 'WARKOP & KOPI BANDUNG', sub: 'Kopi Tubruk · Mie Rebus', bg: '#3f3f46', fg: '#f8fafc', accent: '#eab308', awning: '#52525b', wall: 0xe9e4da, trim: 0x27272a, roof: 'spandek-slope', porch: true },
  { name: 'KONTER PULSA & SERVIS', sub: 'Aksesoris HP · Kuota', bg: '#8b1e24', fg: '#ffffff', accent: '#fcd34d', awning: '#991b1b', wall: 0xefece4, trim: 0x334155, roof: 'flat-parapet', blade: true },
  { name: 'BAKSO & MIE AYAM', sub: 'Porsi Mahasiswa · Halal', bg: '#b45309', fg: '#fffbeb', accent: '#fde047', awning: '#d97706', wall: 0xebe3d5, trim: 0x6b5b4d, roof: 'tile-red', porch: true }
];

export function buildCorridorEnvironment(scene: THREE.Scene): CorridorHandles {
  const worldGroup = new THREE.Group();
  scene.add(worldGroup);

  // 1. Sloping Bandung Utara Terrain (lush muted urban-canopy tone fading softly into atmospheric mist)
  const terrainGeo = createSlopedTerrainGeometry(860, 560);
  const ground = new THREE.Mesh(
    terrainGeo,
    new THREE.MeshStandardMaterial({
      color: 0xc5cbb7,
      roughness: 0.97,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2
    })
  );
  ground.receiveShadow = true;
  worldGroup.add(ground);

  // Dense Bandung Utara tropical tree canopy surrounding the urban blocks (eliminates bare flat ground!)
  addNeighborhoodCanopy(worldGroup);

  // 2. Real Curved & Sloping OSM Asphalt Carriageway (Way 125178979: Jalan Gegerkalong Tengah)
  const asphalt = loadAsphaltPbr();
  asphalt.map.repeat.set(1, 1);
  if (asphalt.normalMap) asphalt.normalMap.repeat.set(1, 1);
  const roadMat = new THREE.MeshStandardMaterial({
    map: asphalt.map,
    normalMap: asphalt.normalMap,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 0.84,
    metalness: 0.05
  });

  const mainRoadGeo = createCorridorRibbonGeometry(-14, CORRIDOR.lengthM + 14, 0, CORRIDOR.roadWidthM, 0.04, 2.5, 7.5);
  const mainRoad = new THREE.Mesh(mainRoadGeo, roadMat);
  mainRoad.receiveShadow = true;
  worldGroup.add(mainRoad);

  // 3. All 15 Real OpenStreetMap Side Roads & Alleys (Simpang Gegerkalong Girang + Gang Tengah 9, dll.)
  const alleyMat = new THREE.MeshStandardMaterial({
    color: 0xc2c6cc,
    map: asphalt.map,
    roughness: 0.88,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
  for (const sr of OSM_SIDE_ROADS) {
    const isGirang = sr.name.toLowerCase().includes('girang');
    const srGeo = createPolylineRoadGeometry(sr.points, sr.width, isGirang ? 0.032 : 0.02);
    const srMesh = new THREE.Mesh(srGeo, isGirang ? roadMat : alleyMat);
    srMesh.receiveShadow = true;
    worldGroup.add(srMesh);
  }

  // Continuous weathered concrete/paver shoulder apron on both sides (eliminates bare beige gaps)
  const shoulderPavers = loadPaversPbr(1, 1);
  const shoulderMat = new THREE.MeshStandardMaterial({
    color: 0xd0ccc2,
    map: shoulderPavers.map,
    normalMap: shoulderPavers.normalMap,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 0.9,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2
  });
  for (const shSign of [-1, 1]) {
    const shGeo = createCorridorRibbonGeometry(
      -8,
      CORRIDOR.lengthM + 8,
      shSign * (CORRIDOR.roadWidthM / 2 + 1.45),
      2.6,
      0.012,
      3.0,
      3.2
    );
    const shMesh = new THREE.Mesh(shGeo, shoulderMat);
    shMesh.receiveShadow = true;
    worldGroup.add(shMesh);
  }

  // Concrete drainage gutters + iron grates hugging both curved road edges
  const gutterMat = new THREE.MeshStandardMaterial({ color: 0x8c929c, roughness: 0.88 });
  const grateMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.55, metalness: 0.65 });
  for (const sideSign of [-1, 1]) {
    const gutterLat = sideSign * (CORRIDOR.roadWidthM / 2 + 0.17);
    const gutterGeo = createCorridorRibbonGeometry(0, CORRIDOR.lengthM, gutterLat, 0.34, 0.045, 3.0, 6.0);
    const gutter = new THREE.Mesh(gutterGeo, gutterMat);
    gutter.receiveShadow = true;
    worldGroup.add(gutter);

    for (let m = 16; m < CORRIDOR.lengthM - 16; m += 24) {
      const f = sampleCorridorFrame(m, gutterLat);
      const grate = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.025, 0.28), grateMat);
      grate.position.set(f.x, f.y + 0.055, f.z);
      grate.rotation.order = 'YXZ';
      grate.rotation.y = f.yaw;
      grate.rotation.z = f.pitch;
      worldGroup.add(grate);
    }
  }

  // Speed bumps flanking real Pasar Gegerkalong zone (280 m & 346 m)
  for (const mBump of [278, 346]) {
    const f = sampleCorridorFrame(mBump, 0);
    const bump = createSpeedBump(CORRIDOR.roadWidthM);
    bump.position.set(f.x, f.y + 0.045, f.z);
    bump.rotation.order = 'YXZ';
    bump.rotation.y = f.yaw;
    bump.rotation.z = f.pitch;
    worldGroup.add(bump);
  }

  // Zebra crosswalks at Simpang Girang (3 m) and Southern approach (351 m)
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.68, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (const mZebra of [4, CORRIDOR.lengthM - 4]) {
    for (let s = -1.35; s <= 1.35; s += 0.68) {
      const f = sampleCorridorFrame(mZebra, s);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.02, 0.34), stripeMat);
      stripe.position.set(f.x, f.y + 0.072, f.z);
      stripe.rotation.order = 'YXZ';
      stripe.rotation.y = f.yaw;
      stripe.rotation.z = f.pitch;
      worldGroup.add(stripe);
    }
  }

  // Continuous crisp edge lines (no center divider on authentic 3.8 m narrow street)
  for (const edgeSign of [-1, 1]) {
    const edgeGeo = createCorridorRibbonGeometry(
      0,
      CORRIDOR.lengthM,
      edgeSign * (CORRIDOR.roadWidthM / 2 - 0.16),
      0.11,
      0.072,
      3.0,
      10
    );
    worldGroup.add(new THREE.Mesh(edgeGeo, stripeMat));
  }

  // Flashing amber warning beacon + Convex Safety Mirror + Green Street Name Sign at Simpang Girang
  const beacon = createWarningBeacon();
  const fBeac = sampleCorridorFrame(2, -4.4);
  beacon.group.position.set(fBeac.x, fBeac.y, fBeac.z);
  worldGroup.add(beacon.group);

  const mirror = createConvexMirror();
  const fMir = sampleCorridorFrame(3, 4.2);
  mirror.position.set(fMir.x, fMir.y, fMir.z);
  mirror.rotation.y = fMir.yaw + Math.PI * 0.78;
  worldGroup.add(mirror);

  const streetSign = createStreetNamePost('Jl. Gegerkalong Tengah');
  const fSign = sampleCorridorFrame(8, -4.8);
  streetSign.position.set(fSign.x, fSign.y, fSign.z);
  streetSign.rotation.y = fSign.yaw;
  worldGroup.add(streetSign);

  const twoWayArrows = buildCurvedRoadArrows('twoway');
  const oneWayPagiArrows = buildCurvedRoadArrows('pagi');
  const oneWaySoreArrows = buildCurvedRoadArrows('sore');
  worldGroup.add(twoWayArrows, oneWayPagiArrows, oneWaySoreArrows);

  // 4. Baseline Street Clutter (parked scooters encroaching the narrow curved road + gerobak)
  const baselineClutterGroup = new THREE.Group();
  const scooterColors = [0x1f2937, 0xb91c1c, 0x1d4ed8, 0xf8fafc, 0x0f766e];
  const clutterSpotsM = [36, 45, 72, 134, 156, 210, 268, 294, 308, 326];
  clutterSpotsM.forEach((m, idx) => {
    const side = idx % 2 === 0 ? 1 : -1;
    const f = sampleCorridorFrame(m, side * (CORRIDOR.roadWidthM / 2 + 0.36));
    const sc = buildDetailedIndonesianScooter(scooterColors[idx % scooterColors.length], false, false);
    sc.position.set(f.x, f.y + 0.05, f.z);
    sc.rotation.y = f.yaw + (side === 1 ? -0.42 : 0.42);
    baselineClutterGroup.add(sc);
  });
  for (const [mCart, side, hex] of [[304, 1, 0x1d4ed8], [66, -1, 0xb91c1c]] as const) {
    const f = sampleCorridorFrame(mCart, side * (CORRIDOR.roadWidthM / 2 + 0.95));
    const cart = createGerobakCart(hex);
    cart.position.set(f.x, f.y + 0.05, f.z);
    cart.rotation.y = f.yaw;
    baselineClutterGroup.add(cart);
  }
  worldGroup.add(baselineClutterGroup);

  // 5. Toggleable Curved Raised Sidewalk (Poly Haven Pavers + Black-White Kanstin Curb)
  const sidewalkGroup = new THREE.Group();
  const pavers = loadPaversPbr(1, 1);
  const swLat = -(CORRIDOR.roadWidthM / 2 + CORRIDOR.sidewalkWidthM / 2 + 0.24);
  const swGeo = createCorridorRibbonGeometry(0, CORRIDOR.lengthM, swLat, CORRIDOR.sidewalkWidthM, 0.26, 2.5, 2.2);
  const sidewalk = new THREE.Mesh(
    swGeo,
    new THREE.MeshStandardMaterial({
      map: pavers.map,
      normalMap: pavers.normalMap,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughness: 0.82
    })
  );
  sidewalk.receiveShadow = true;
  sidewalkGroup.add(sidewalk);

  // Vertical Kanstin curb edge along the curved sidewalk
  const kanstinTex = createKanstinCurbTexture();
  kanstinTex.repeat.set(1, 1);
  const curbLat = -(CORRIDOR.roadWidthM / 2 + 0.34);
  const curbGeo = createCorridorRibbonGeometry(0, CORRIDOR.lengthM, curbLat, 0.22, 0.265, 2.5, 2.0);
  sidewalkGroup.add(new THREE.Mesh(curbGeo, new THREE.MeshStandardMaterial({ map: kanstinTex, roughness: 0.78 })));

  const bollardMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.38, metalness: 0.68 });
  const bollardStripeMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 });
  for (let m = 14; m <= CORRIDOR.lengthM - 14; m += 13) {
    if (m > CORRIDOR.dropoffBay.startM - 2 && m < CORRIDOR.dropoffBay.endM + 2) continue;
    const f = sampleCorridorFrame(m, -(CORRIDOR.roadWidthM / 2 + 0.52));
    const bPost = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.78, 8), bollardMat);
    bPost.position.set(f.x, f.y + 0.65, f.z);
    bPost.castShadow = true;
    sidewalkGroup.add(bPost);

    const bBand = new THREE.Mesh(new THREE.CylinderGeometry(0.064, 0.064, 0.12, 8), bollardStripeMat);
    bBand.position.set(f.x, f.y + 0.9, f.z);
    sidewalkGroup.add(bBand);
  }

  for (let m = 24; m <= CORRIDOR.lengthM - 24; m += 34) {
    if (m > CORRIDOR.dropoffBay.startM - 6 && m < CORRIDOR.dropoffBay.endM + 6) continue;
    const fTree = sampleCorridorFrame(m, -(CORRIDOR.roadWidthM / 2 + 1.45));
    const tree = createTropicalTree(0.75 + (m % 3) * 0.08);
    tree.position.set(fTree.x, fTree.y + 0.26, fTree.z);
    sidewalkGroup.add(tree);

    const fBin = sampleCorridorFrame(m + 6, -(CORRIDOR.roadWidthM / 2 + 1.1));
    const bin = createBandungTrashBin();
    bin.position.set(fBin.x, fBin.y + 0.26, fBin.z);
    bin.rotation.y = fBin.yaw;
    sidewalkGroup.add(bin);

    const fPlanter = sampleCorridorFrame(m + 14, -(CORRIDOR.roadWidthM / 2 + 1.25));
    const planter = createPlanterBox();
    planter.position.set(fPlanter.x, fPlanter.y + 0.26, fPlanter.z);
    planter.rotation.y = fPlanter.yaw;
    sidewalkGroup.add(planter);
  }
  worldGroup.add(sidewalkGroup);

  // 6. Toggleable Off-Street Drop-Off Bay & Dedicated Parking Lot (Skenario 1 & 2)
  const offstreetGroup = new THREE.Group();
  const dropGeo = createCorridorRibbonGeometry(
    CORRIDOR.dropoffBay.startM,
    CORRIDOR.dropoffBay.endM,
    -(CORRIDOR.roadWidthM / 2 + 1.35),
    2.4,
    0.052,
    2.5,
    4.0
  );
  const dropPad = new THREE.Mesh(
    dropGeo,
    new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.72, transparent: true, opacity: 0.42 })
  );
  offstreetGroup.add(dropPad);

  const dropMid = sampleCorridorFrame((CORRIDOR.dropoffBay.startM + CORRIDOR.dropoffBay.endM) / 2, -(CORRIDOR.roadWidthM / 2 + 3.2));
  const dropSign = createPoleSign(
    'ZONA DROP-OFF',
    'Singgah Maks. 30 dtk · Bebas Badan Jalan',
    '#0369a1',
    '#ffffff',
    '#38bdf8'
  );
  dropSign.position.set(dropMid.x, dropMid.y, dropMid.z);
  dropSign.rotation.y = dropMid.yaw;
  offstreetGroup.add(dropSign);

  const parkGeo = createCorridorRibbonGeometry(
    CORRIDOR.parkingLot.startM,
    CORRIDOR.parkingLot.endM,
    CORRIDOR.roadWidthM / 2 + 1.65,
    3.0,
    0.052,
    2.5,
    4.0
  );
  const parkPad = new THREE.Mesh(
    parkGeo,
    new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.76, transparent: true, opacity: 0.4 })
  );
  offstreetGroup.add(parkPad);

  const parkMid = sampleCorridorFrame((CORRIDOR.parkingLot.startM + CORRIDOR.parkingLot.endM) / 2, CORRIDOR.roadWidthM / 2 + 3.9);
  const parkSign = createPoleSign(
    'PARKIR KHUSUS PASAR',
    'Luar Badan Jalan · Sebelum Pasar',
    '#047857',
    '#ffffff',
    '#34d399'
  );
  parkSign.position.set(parkMid.x, parkMid.y, parkMid.z);
  parkSign.rotation.y = parkMid.yaw + Math.PI;
  offstreetGroup.add(parkSign);

  for (let m = CORRIDOR.dropoffBay.startM; m <= CORRIDOR.dropoffBay.endM; m += 10.5) {
    const f = sampleCorridorFrame(m, -(CORRIDOR.roadWidthM / 2 + 0.15));
    const cone = createTrafficCone();
    cone.position.set(f.x, f.y + 0.05, f.z);
    offstreetGroup.add(cone);
  }

  const officers: AnimatedOfficer[] = [];
  for (const [mOff, lat, flip] of [[24, -4.3, false], [292, 4.1, true]] as const) {
    const f = sampleCorridorFrame(mOff, lat);
    const off = createDishubOfficer();
    off.group.position.set(f.x, f.y + 0.05, f.z);
    off.group.rotation.y = f.yaw + (flip ? Math.PI : 0);
    offstreetGroup.add(off.group);
    officers.push(off);
  }
  worldGroup.add(offstreetGroup);

  // 7. Toggleable No-Stopping Signs (Rambu S Coret) along curved corridor
  const noStopSignGroup = new THREE.Group();
  const noStopTex = createNoStopSignTexture();
  const signMat = new THREE.MeshBasicMaterial({ map: noStopTex, transparent: true, side: THREE.DoubleSide });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.45, metalness: 0.55 });
  for (let m = 28; m <= CORRIDOR.lengthM - 28; m += 52) {
    for (const side of [-1, 1]) {
      const f = sampleCorridorFrame(m, side * (CORRIDOR.roadWidthM / 2 + 0.85));
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.75, 8), poleMat);
      p.position.set(f.x, f.y + 1.38, f.z);
      noStopSignGroup.add(p);

      const disc = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.84), signMat);
      disc.position.set(f.x, f.y + 2.55, f.z);
      disc.rotation.y = f.yaw + Math.PI / 2;
      noStopSignGroup.add(disc);
    }
  }
  worldGroup.add(noStopSignGroup);

  // 8. ALL 66 REAL OPENSTREETMAP FRONT-ROW BUILDINGS (EXACT GPS POSITIONS, SIZES & ANGLES!)
  buildOsmFrontBuildings(worldGroup);

  // 9. AUTHENTIC PASAR GEGERKALONG ARCHED CANOPY CORRIDOR AT REAL GPS LOCATION (distM ~292-340 m)
  buildPasarGegerkalongRealZone(worldGroup);

  // 10. ALL 119 REAL OPENSTREETMAP BACKGROUND NEIGHBORHOOD POLYGON BUILDINGS
  buildOsmBackgroundPolygons(worldGroup);

  // 11. Curved PLN Utility Poles + Sagging Catenary Overhead Cables (cleanly clear of Pasar Gegerkalong!)
  const poleXPositions: THREE.Vector3[] = [];
  for (let m = 16; m <= CORRIDOR.lengthM - 12; m += 38) {
    if (m >= 288 && m <= 346) continue; // Keep Pasar Gegerkalong frontage 100% clear of poles & wires
    const f = sampleCorridorFrame(m, CORRIDOR.roadWidthM / 2 + 0.95);
    const pole = createUtilityPole();
    pole.position.set(f.x, f.y, f.z);
    pole.rotation.y = f.yaw;
    worldGroup.add(pole);
    poleXPositions.push(new THREE.Vector3(f.x, f.y + 7.55, f.z));
  }
  const cableMat = new THREE.LineBasicMaterial({ color: 0x27272a });
  for (let i = 0; i < poleXPositions.length - 1; i++) {
    const pA = poleXPositions[i];
    const pB = poleXPositions[i + 1];
    for (const zOff of [-0.55, 0, 0.55]) {
      const mid = pA.clone().lerp(pB, 0.5);
      mid.y -= 0.72;
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(pA.x, pA.y, pA.z + zOff),
        new THREE.Vector3(mid.x, mid.y, mid.z + zOff),
        new THREE.Vector3(pB.x, pB.y, pB.z + zOff)
      );
      worldGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(10)), cableMat));
    }
  }

  // 12. Intersection Portal Banners (Simpang Gegerkalong Girang & Simpang Gegerkalong Hilir)
  const fNorth = sampleCorridorFrame(0, 0);
  const northBanner = createIntersectionPortal('SIMPANG GEGERKALONG GIRANG', 'Utara (0 m · 901 m dpl · UPI)');
  northBanner.position.set(fNorth.x, fNorth.y, fNorth.z);
  northBanner.rotation.y = fNorth.yaw;
  worldGroup.add(northBanner);

  const fSouth = sampleCorridorFrame(CORRIDOR.lengthM, 0);
  const southBanner = createIntersectionPortal('SIMPANG GEGERKALONG HILIR', 'Selatan (355 m · 885 m dpl · Pasar)');
  southBanner.position.set(fSouth.x, fSouth.y, fSouth.z);
  southBanner.rotation.y = fSouth.yaw;
  worldGroup.add(southBanner);

  // Market shoppers near Pasar Gegerkalong real zone
  for (let i = 0; i < 6; i++) {
    const mShop = 294 + i * 7.5;
    const f = sampleCorridorFrame(mShop, CORRIDOR.roadWidthM / 2 + 1.35 + (i % 2) * 0.5);
    const shopper = createPedestrianMesh({
      id: 900 + i,
      xM: mShop,
      dir: i % 2 === 0 ? 1 : -1,
      speedMs: 0,
      lateralJitterM: 0,
      shirtHex: [0x1d4ed8, 0x15803d, 0xb91c1c, 0x7c3aed, 0x0f766e, 0xd97706][i]
    });
    shopper.group.position.set(f.x, f.y + 0.08, f.z);
    shopper.group.rotation.y = f.yaw + (i % 2 === 0 ? 0.5 : -0.6);
    worldGroup.add(shopper.group);
  }

  return {
    sidewalkGroup,
    offstreetGroup,
    baselineClutterGroup,
    noStopSignGroup,
    twoWayArrows,
    oneWayPagiArrows,
    oneWaySoreArrows,
    officers,
    beaconBulbMat: beacon.bulbMat,
    updateForScenario(key: ScenarioKey, oneWayDir: OneWayDirection): void {
      const cfg = SCENARIOS[key];
      sidewalkGroup.visible = cfg.hasSidewalk;
      offstreetGroup.visible = cfg.hasOffstreet;
      baselineClutterGroup.visible = !cfg.hasOffstreet;
      noStopSignGroup.visible = cfg.hasNoStopSign;
      twoWayArrows.visible = cfg.twoWay;
      oneWayPagiArrows.visible = !cfg.twoWay && oneWayDir === 1;
      oneWaySoreArrows.visible = !cfg.twoWay && oneWayDir === -1;
    }
  };
}

/**
 * Places all 66 real OpenStreetMap front-row buildings at their exact GPS footprints,
 * orientations, and elevations along Jalan Gegerkalong Tengah.
 */
function buildOsmFrontBuildings(parent: THREE.Group): void {
  let kosCount = 0;
  let usedBjb = false;
  let usedBarokah = false;
  let usedWarung46 = false;
  OSM_FRONT_BUILDINGS.forEach((b: OsmFrontBuilding, idx: number) => {
    // Keep the immediate Pasar canopy apron clean where our dedicated Pasar complex sits
    if (b.distM >= 292 && b.distM <= 338 && b.side === 1 && b.width * b.depth > 95) {
      return;
    }

    // Large multi-story boarding house (Kos UPI) footprints in the northern UPI zone
    if (b.levels >= 4 && b.width >= 10 && kosCount < 3) {
      kosCount++;
      const kos = createDetailedKosBuilding(b.width, b.depth, 4);
      kos.position.set(b.cx, b.y, b.cz);
      // Kos front faces +Z locally; rotate so it faces the road (side = 1 means building is on +Z, so face -Z -> PI)
      kos.rotation.y = b.angleY + (b.side === 1 ? Math.PI : 0);
      parent.add(kos);
      return;
    }

    // Assign real verified local landmarks at their approximate real positions
    let preset: ShopPreset;
    if (!usedBjb && b.distM >= 295 && b.distM <= 335 && b.side === -1) {
      usedBjb = true;
      preset = SHOP_PRESETS[0]; // Kantor Kas Bank BJB seberang Pasar Gegerkalong!
    } else if (!usedBarokah && b.distM >= 140 && b.distM <= 175 && b.side === -1) {
      usedBarokah = true;
      preset = SHOP_PRESETS[1]; // Barokah MM No. 23
    } else if (!usedWarung46 && b.distM >= 205 && b.distM <= 240 && b.side === 1) {
      usedWarung46 = true;
      preset = SHOP_PRESETS[2]; // Warung 46 near Jl. Gegerkalong Tengah 8/9
    } else {
      preset = SHOP_PRESETS[3 + (idx % (SHOP_PRESETS.length - 3))];
    }

    const ruko = createDetailedRuko({
      width: Math.max(4.0, b.width),
      depth: Math.max(4.5, b.depth),
      floors: Math.min(3, Math.max(1, b.levels)),
      wallHex: preset.wall,
      trimHex: preset.trim,
      roofType: preset.roof,
      shopName: b.name || preset.name,
      shopSub: preset.sub,
      signBg: preset.bg,
      signFg: preset.fg,
      signAccent: preset.accent,
      awningHex: preset.awning,
      facingDir: b.side === 1 ? -1 : 1,
      hasBladeSign: preset.blade && b.width >= 6,
      hasPorchStall: preset.porch && b.width >= 5.5
    });

    ruko.position.set(b.cx, b.y, b.cz);
    ruko.rotation.y = b.angleY;
    parent.add(ruko);
  });
}

/**
 * Builds the authentic Pasar Gegerkalong landmark right at its real GPS coordinates
 * (distM ≈ 315 m, West side +Z), featuring:
 * - Photorealistic open market stall colonnade (facade_pasar.jpg)
 * - Authentic arched translucent blue polycarbonate market canopy roof (matching real street photos)
 * - Front street-edge produce stalls, wooden crates, and Gapura Pasar Gegerkalong signage
 */
function buildPasarGegerkalongRealZone(parent: THREE.Group): void {
  // Aligned to the exact chord (300 m -> 334 m) and set cleanly back from the bend so ALL 4 corners stay > 2 m outside the asphalt!
  const fStart = sampleCorridorFrame(300, 0);
  const fEnd = sampleCorridorFrame(334, 0);
  const chordYaw = -Math.atan2(fEnd.z - fStart.z, fEnd.x - fStart.x);
  const f = sampleCorridorFrame(317, CORRIDOR.roadWidthM / 2 + 10.6);
  const g = new THREE.Group();
  g.position.set(f.x, f.y - 0.15, f.z);
  g.rotation.y = chordYaw;

  const W = 34;
  const D = 12.2;
  const wallH = 4.6;

  // Deep concrete plinth anchored into the slope + tiled interior market aisle floor
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0xbcb6ac, roughness: 0.9 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W + 1.4, 2.0, D + 1.6), concreteMat);
  floor.position.set(0, -0.64, 0);
  floor.receiveShadow = true;
  g.add(floor);

  const aisleMat = new THREE.MeshStandardMaterial({ color: 0xd6d2c8, roughness: 0.82 });
  const aisle = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, 0.04, 3.6), aisleMat);
  aisle.position.set(0, 0.37, 0);
  aisle.receiveShadow = true;
  g.add(aisle);

  // Structural steel columns along both sides supporting the arched blue polycarbonate canopy
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.55 });
  const wallMaps = loadWeatheredWallPbr();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe6dccb, map: wallMaps.map, roughness: 0.88 });
  const tileBaseMat = new THREE.MeshStandardMaterial({ color: 0xdbe7e4, roughness: 0.55 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x7c5434, roughness: 0.86 });
  const sackMat = new THREE.MeshStandardMaterial({ color: 0xe7dfd0, roughness: 0.92 });
  const basketMat = new THREE.MeshStandardMaterial({ color: 0xb08952, roughness: 0.9 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, emissive: 0xfbbf24, emissiveIntensity: 1.9 });
  const awningColors = [0x1d4ed8, 0xd97706, 0x15803d, 0xb91c1c, 0x0f766e];
  const produceColors = [0xdc2626, 0x16a34a, 0xea580c, 0xeab308, 0x15803d, 0xf97316, 0x65a30d, 0x991b1b];

  // Low perimeter masonry dwarf walls + steel columns along outer back (+Z) and road-facing (-Z) edges
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(W, 2.8, 0.35), wallMat);
  backWall.position.set(0, 1.75, D / 2 - 0.2);
  backWall.castShadow = true;
  g.add(backWall);

  // Photorealistic Pasar stall backdrop on interior rear wall
  const pasarTex = loadFacadeTexture('pasar', 3, 1);
  const pasarMat = new THREE.MeshStandardMaterial({
    map: pasarTex,
    emissive: 0x3b2a14,
    emissiveMap: pasarTex,
    emissiveIntensity: 0.28,
    roughness: 0.84
  });
  const backBackdrop = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.6, wallH - 0.4), pasarMat);
  backBackdrop.position.set(0, wallH / 2 + 0.35, D / 2 - 0.42);
  backBackdrop.rotation.y = Math.PI;
  g.add(backBackdrop);

  // Front road-facing stall colonnade + columns (open lower bays so you see the bustling stalls inside!)
  for (let i = 0; i <= 7; i++) {
    const cx = -W / 2 + 0.6 + (i / 7) * (W - 1.2);
    for (const cz of [-D / 2 + 0.3, D / 2 - 0.3]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.32, wallH, 0.32), steelMat);
      col.position.set(cx, wallH / 2 + 0.35, cz);
      col.castShadow = true;
      g.add(col);
    }
    // Overhead cross-tie beam + warm hanging market lamp down the central aisle
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, D - 0.6), steelMat);
    tie.position.set(cx, wallH + 0.28, 0);
    g.add(tie);

    if (i > 0 && i < 7) {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.85, 4), steelMat);
      cord.position.set(cx, wallH - 0.15, 0);
      g.add(cord);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), bulbMat);
      bulb.position.set(cx, wallH - 0.62, 0);
      g.add(bulb);
    }
  }

  // TWO FULL INTERIOR ROWS OF MARKET STALLS (14 richly stocked Kios/Lapak flanking the central aisle!)
  const numBays = 7;
  const baySpan = (W - 2.4) / numBays;
  for (let i = 0; i < numBays; i++) {
    const bx = -W / 2 + 1.2 + (i + 0.5) * baySpan;

    for (const rowSide of [-1, 1] as const) {
      const stallZ = rowSide * (D / 2 - 2.45);
      const faceIn = -rowSide;

      // White-green tiled concrete stall counter base (meja los pasar)
      const base = new THREE.Mesh(new THREE.BoxGeometry(baySpan - 0.45, 0.86, 2.2), tileBaseMat);
      base.position.set(bx, 0.78, stallZ);
      base.castShadow = true;
      base.receiveShadow = true;
      g.add(base);

      // Slanted wooden display rack on top of stall
      const rack = new THREE.Mesh(new THREE.BoxGeometry(baySpan - 0.65, 0.12, 1.75), woodMat);
      rack.position.set(bx, 1.32, stallZ + faceIn * 0.15);
      rack.rotation.x = faceIn * 0.16;
      g.add(rack);

      // Overhead stall partition frame & colorful mini tarpaulin valance
      const stallCanopy = new THREE.Mesh(
        new THREE.BoxGeometry(baySpan - 0.35, 0.07, 2.55),
        new THREE.MeshStandardMaterial({
          color: awningColors[(i + (rowSide > 0 ? 2 : 0)) % awningColors.length],
          roughness: 0.78
        })
      );
      stallCanopy.position.set(bx, 2.95, stallZ);
      stallCanopy.rotation.x = faceIn * 0.15;
      stallCanopy.castShadow = true;
      g.add(stallCanopy);

      // 3 woven baskets & colorful produce mounds (tomat, cabai, sayur, jeruk, pisang)
      for (let c = -1; c <= 1; c++) {
        const px = bx + c * 1.25;
        const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.36, 8), basketMat);
        basket.position.set(px, 1.48, stallZ + faceIn * 0.25);
        g.add(basket);

        const mound = new THREE.Mesh(
          new THREE.SphereGeometry(0.4, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.58),
          new THREE.MeshStandardMaterial({
            color: produceColors[(i * 3 + c + (rowSide > 0 ? 4 : 1) + 8) % produceColors.length],
            roughness: 0.88
          })
        );
        mound.scale.set(1.05, 0.65, 0.95);
        mound.position.set(px, 1.62, stallZ + faceIn * 0.25);
        g.add(mound);
      }

      // Rice sacks (karung beras) & plastic crates stacked next to the stall
      const sack = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.68, 8), sackMat);
      sack.position.set(bx + 1.65, 0.7, stallZ + faceIn * 1.35);
      sack.castShadow = true;
      g.add(sack);

      // Vendor standing behind alternate stalls
      if ((i + (rowSide > 0 ? 1 : 0)) % 2 === 0) {
        const vendor = createPedestrianMesh({
          id: 940 + i * 2 + (rowSide > 0 ? 1 : 0),
          xM: 314,
          dir: 1,
          speedMs: 0,
          lateralJitterM: 0,
          shirtHex: [0x15803d, 0xb91c1c, 0x1d4ed8, 0xd97706, 0x6d28d9, 0x0f766e, 0x334155][i]
        });
        vendor.group.position.set(bx - 0.4, 0.38, stallZ - faceIn * 1.35);
        vendor.group.rotation.y = faceIn > 0 ? -Math.PI / 2 : Math.PI / 2;
        g.add(vendor.group);
      }
    }
  }

  // Bustling shoppers walking inside the central tiled market aisle!
  for (let s = 0; s < 10; s++) {
    const sx = -W / 2 + 3.2 + s * 3.4;
    const sz = (s % 2 === 0 ? -0.65 : 0.65);
    const shopper = createPedestrianMesh({
      id: 970 + s,
      xM: 314,
      dir: s % 2 === 0 ? 1 : -1,
      speedMs: 0,
      lateralJitterM: 0,
      shirtHex: [0x1e40af, 0x047857, 0xbe123c, 0xb45309, 0x4338ca, 0x0f766e][s % 6]
    });
    shopper.group.position.set(sx, 0.38, sz);
    shopper.group.rotation.y = s % 2 === 0 ? 0.15 : Math.PI - 0.15;
    g.add(shopper.group);
  }

  // Authentic Arched Translucent Blue Polycarbonate Canopy Roof + White Steel Arch Ribs
  const archGeo = new THREE.CylinderGeometry(D / 2 + 0.5, D / 2 + 0.5, W + 0.8, 20, 1, true, 0, Math.PI);
  archGeo.rotateZ(Math.PI / 2);
  archGeo.scale(1, 0.42, 1);
  const blueCanopyMat = new THREE.MeshPhysicalMaterial({
    color: 0x2563eb,
    roughness: 0.24,
    metalness: 0.12,
    transparent: true,
    opacity: 0.66,
    side: THREE.DoubleSide
  });
  const archRoof = new THREE.Mesh(archGeo, blueCanopyMat);
  archRoof.position.set(0, wallH + 0.32, 0);
  archRoof.castShadow = true;
  g.add(archRoof);

  const ribMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.45, metalness: 0.5 });
  for (let rx = -W / 2 + 1.5; rx <= W / 2 - 1.5; rx += 5.0) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(D / 2 + 0.46, 0.08, 6, 20, Math.PI), ribMat);
    rib.rotation.y = Math.PI / 2;
    rib.scale.set(1, 0.42, 1);
    rib.position.set(rx, wallH + 0.32, 0);
    g.add(rib);
  }

  // Front Gapura Pasar Gegerkalong Signboard facing Jalan Gegerkalong Tengah + End-arch Signboard!
  const signTex = createSignTexture(
    'PASAR GEGERKALONG',
    'Jl. Gegerkalong Tengah No. 35A · PD Pasar Bermartabat',
    '#7c2d12',
    '#fef3c7',
    '#f59e0b'
  );
  const gapuraBeam = new THREE.Mesh(
    new THREE.BoxGeometry(14.5, 2.0, 0.65),
    new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.7 })
  );
  gapuraBeam.position.set(0, wallH + 1.15, -D / 2 - 0.15);
  gapuraBeam.castShadow = true;
  g.add(gapuraBeam);

  const signPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(13.8, 1.78),
    new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide })
  );
  signPlane.position.set(0, wallH + 1.15, -D / 2 - 0.5);
  signPlane.rotation.y = Math.PI;
  g.add(signPlane);

  // South entrance fascia beam over the arched market corridor opening
  const endBeam = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 1.1, D - 0.4),
    new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.7 })
  );
  endBeam.position.set(W / 2 - 0.1, wallH + 0.25, 0);
  g.add(endBeam);

  parent.add(g);
}

/**
 * Extrudes all 119 real OpenStreetMap second-row neighborhood building footprints
 * with weathered Bandung plaster walls and Poly Haven clay/dark roof caps.
 */
function buildOsmBackgroundPolygons(parent: THREE.Group): void {
  const wallMaps = loadWeatheredWallPbr();
  const clayMaps = loadClayRoofPbr();
  const greyMaps = loadGreyRoofPbr();

  const bgWallMats = [0xe8e2d6, 0xdfd8c9, 0xede8dd, 0xd8d3c8].map(
    (hex) =>
      new THREE.MeshStandardMaterial({
        color: hex,
        map: wallMaps.map,
        roughness: 0.9
      })
  );
  const bgRoofMats = [
    new THREE.MeshStandardMaterial({ map: clayMaps.map, roughness: 0.82 }),
    new THREE.MeshStandardMaterial({ map: greyMaps.map, roughness: 0.78 }),
    new THREE.MeshStandardMaterial({ color: 0x7c5844, roughness: 0.85 })
  ];

  OSM_BG_BUILDINGS.forEach((b, idx) => {
    if (b.poly.length < 3) return;
    const shape = new THREE.Shape();
    shape.moveTo(b.poly[0][0], -b.poly[0][1]);
    for (let i = 1; i < b.poly.length; i++) {
      shape.lineTo(b.poly[i][0], -b.poly[i][1]);
    }
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, { depth: b.height + 1.4, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, [bgRoofMats[idx % bgRoofMats.length], bgWallMats[idx % bgWallMats.length]]);
    mesh.position.y = b.y - 1.4;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
  });
}

function buildCurvedRoadArrows(mode: 'twoway' | 'pagi' | 'sore'): THREE.Group {
  const group = new THREE.Group();
  const arrowMat = new THREE.MeshStandardMaterial({
    color: mode === 'twoway' ? 0xf8fafc : 0xfacc15,
    roughness: 0.65
  });

  for (let m = 28; m <= CORRIDOR.lengthM - 28; m += 52) {
    if (mode === 'twoway') {
      group.add(createCurvedRoadArrow(m, CORRIDOR.laneOffsetZ, 1, arrowMat));
      group.add(createCurvedRoadArrow(m + 20, -CORRIDOR.laneOffsetZ, -1, arrowMat));
    } else if (mode === 'pagi') {
      group.add(createCurvedRoadArrow(m, 0, 1, arrowMat));
    } else {
      group.add(createCurvedRoadArrow(m, 0, -1, arrowMat));
    }
  }
  return group;
}

function createCurvedRoadArrow(
  distM: number,
  lateralZ: number,
  dir: 1 | -1,
  mat: THREE.Material
): THREE.Group {
  const f = sampleCorridorFrame(distM, lateralZ);
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.02, 0.22), mat);
  shaft.position.x = -0.5;
  g.add(shaft);

  const headShape = new THREE.Shape();
  headShape.moveTo(0.45, -0.42);
  headShape.lineTo(1.3, 0);
  headShape.lineTo(0.45, 0.42);
  headShape.closePath();

  const headGeo = new THREE.ShapeGeometry(headShape);
  headGeo.rotateX(-Math.PI / 2);
  const head = new THREE.Mesh(headGeo, mat);
  head.position.y = 0.012;
  g.add(head);

  g.position.set(f.x, f.y + 0.082, f.z);
  g.rotation.order = 'YXZ';
  g.rotation.y = dir === 1 ? f.yaw : f.yaw + Math.PI;
  g.rotation.z = dir === 1 ? f.pitch : -f.pitch;
  return g;
}

function createPoleSign(
  title: string,
  subtitle: string,
  bg: string,
  fg: string,
  accent: string
): THREE.Group {
  const g = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.45, metalness: 0.6 });
  for (const px of [-2.4, 2.4]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.8, 8), poleMat);
    pole.position.set(px, 1.9, 0);
    g.add(pole);
  }
  const tex = createSignTexture(title, subtitle, bg, fg, accent);
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(6.2, 1.65, 0.14),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  board.position.set(0, 3.45, 0);
  g.add(board);
  return g;
}

function createIntersectionPortal(title: string, subtitle: string): THREE.Group {
  const g = new THREE.Group();
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.42, metalness: 0.65 });
  const span = CORRIDOR.roadWidthM + 3.4;

  for (const pz of [-span / 2, span / 2]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 6.4, 10), poleMat);
    col.position.set(0, 3.2, pz);
    col.castShadow = true;
    g.add(col);
  }

  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, span + 0.4), poleMat);
  crossbar.position.set(0, 6.2, 0);
  g.add(crossbar);

  const tex = createSignTexture(title, subtitle, '#1e3a5f', '#ffffff', '#10b981');
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 1.48, 7.6),
    [
      new THREE.MeshBasicMaterial({ map: tex }),
      new THREE.MeshBasicMaterial({ map: tex }),
      poleMat,
      poleMat,
      poleMat,
      poleMat
    ]
  );
  board.position.set(0, 5.75, 0);
  g.add(board);
  return g;
}

/**
 * Populates open surrounding Bandung Utara parcels with detailed multi-branch botanical trees
 * (alpha-cutout leafy clusters, zero round balls) while strictly avoiding every OSM building,
 * Pasar Gegerkalong, and every side road/alley so NO tree ever overlaps a building.
 */
function addNeighborhoodCanopy(parent: THREE.Group): void {
  const isPointInPoly = (px: number, pz: number, poly: [number, number][]): boolean => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], zi = poly[i][1];
      const xj = poly[j][0], zj = poly[j][1];
      const intersect = zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi + 1e-9) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const distToSeg = (px: number, pz: number, ax: number, az: number, bx: number, bz: number): number => {
    const vx = bx - ax;
    const vz = bz - az;
    const l2 = vx * vx + vz * vz;
    if (l2 < 1e-6) return Math.hypot(px - ax, pz - az);
    const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2));
    return Math.hypot(px - (ax + t * vx), pz - (az + t * vz));
  };

  const hitsAnyBuildingOrRoad = (px: number, pz: number, distM: number, lat: number): boolean => {
    // 1. Keep Pasar Gegerkalong zone completely clear
    if (distM >= 282 && distM <= 350 && lat > 0 && lat < 26) return true;

    // 2. Check all 41 front-row OSM buildings (with generous 3.8 m canopy radius clearance)
    for (const b of OSM_FRONT_BUILDINGS) {
      const r = Math.hypot(b.width / 2, b.depth / 2) + 3.6;
      if (Math.hypot(px - b.cx, pz - b.cz) < r) return true;
    }

    // 3. Check all 94 background OSM polygon buildings (inside OR within 3.2 m of any wall edge)
    for (const bg of OSM_BG_BUILDINGS) {
      if (isPointInPoly(px, pz, bg.poly)) return true;
      for (let i = 0; i < bg.poly.length; i++) {
        const a = bg.poly[i];
        const b = bg.poly[(i + 1) % bg.poly.length];
        if (distToSeg(px, pz, a[0], a[1], b[0], b[1]) < 3.2) return true;
      }
    }

    // 4. Check all 14 side roads & alleys
    for (const sr of OSM_SIDE_ROADS) {
      const clear = sr.width / 2 + 2.8;
      for (let i = 0; i < sr.points.length - 1; i++) {
        const a = sr.points[i];
        const b = sr.points[i + 1];
        if (distToSeg(px, pz, a.x, a.z, b.x, b.z) < clear) return true;
      }
    }

    return false;
  };

  const spots: { x: number; y: number; z: number; s: number; rot: number }[] = [];
  let seed = 4271;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Candidate sampling with strict clearance & minimum 5.5 m tree-to-tree spacing
  for (let attempt = 0; attempt < 950 && spots.length < 185; attempt++) {
    const distM = -28 + rand() * (CORRIDOR.lengthM + 56);
    const side = attempt % 2 === 0 ? 1 : -1;
    const lat = side * (17 + Math.pow(rand(), 1.08) * 82);
    const f = sampleCorridorFrame(distM, lat);

    if (hitsAnyBuildingOrRoad(f.x, f.z, distM, lat)) continue;
    if (spots.some((sp) => Math.hypot(sp.x - f.x, sp.z - f.z) < 5.4)) continue;

    spots.push({
      x: f.x,
      y: f.y,
      z: f.z,
      s: 0.85 + rand() * 0.75,
      rot: rand() * Math.PI * 2
    });
  }

  if (spots.length === 0) return;

  // Instanced tapered trunks + 3 angled limbs per tree
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.28, 3.2, 6);
  const barkMat = new THREE.MeshStandardMaterial({ color: 0x543e2d, roughness: 0.95 });
  const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, spots.length);

  const limbGeo = new THREE.CylinderGeometry(0.06, 0.12, 1.9, 5);
  const limbs = new THREE.InstancedMesh(limbGeo, barkMat, spots.length * 3);

  // Instanced botanical alpha-cutout leaf-cluster cards (7 angled layered cards per tree!)
  const leafTex = createLeafClusterTexture();
  const leafMat = new THREE.MeshStandardMaterial({
    map: leafTex,
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    roughness: 0.88
  });
  const cardGeo = new THREE.PlaneGeometry(3.3, 3.3);
  const cardsPerTree = 7;
  const leafCards = new THREE.InstancedMesh(cardGeo, leafMat, spots.length * cardsPerTree);
  leafCards.castShadow = true;
  leafCards.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const tints = [
    new THREE.Color(0xdcfce7),
    new THREE.Color(0xeef7dc),
    new THREE.Color(0xcdebd0),
    new THREE.Color(0xf4f7de),
    new THREE.Color(0xd4ead6)
  ];

  const cardOffsets: [number, number, number, number, number, number][] = [
    [0, 4.4, 0, 0.15, 0, 1.15],
    [0, 4.5, 0, -0.2, Math.PI / 3, 1.1],
    [0, 4.4, 0, 0.25, (2 * Math.PI) / 3, 1.05],
    [1.05, 3.6, 0.65, 0.48, 0.4, 0.92],
    [-1.05, 3.65, -0.6, -0.45, 1.4, 0.95],
    [0.55, 3.7, -1.0, 0.42, 2.3, 0.88],
    [-0.6, 3.65, 0.95, -0.4, 0.9, 0.9]
  ];

  spots.forEach((sp, idx) => {
    dummy.position.set(sp.x, sp.y + 1.4 * sp.s, sp.z);
    dummy.rotation.set(0, sp.rot, 0);
    dummy.scale.set(sp.s, sp.s, sp.s);
    dummy.updateMatrix();
    trunks.setMatrixAt(idx, dummy.matrix);

    for (let b = 0; b < 3; b++) {
      const ang = sp.rot + (b * Math.PI * 2) / 3;
      dummy.position.set(sp.x + Math.cos(ang) * 0.55 * sp.s, sp.y + 3.0 * sp.s, sp.z + Math.sin(ang) * 0.55 * sp.s);
      dummy.rotation.set(Math.sin(ang) * 0.55, ang, -Math.cos(ang) * 0.55);
      dummy.scale.setScalar(sp.s);
      dummy.updateMatrix();
      limbs.setMatrixAt(idx * 3 + b, dummy.matrix);
    }

    const tint = tints[idx % tints.length];
    for (let c = 0; c < cardsPerTree; c++) {
      const [ox, oy, oz, rx, ry, sc] = cardOffsets[c];
      const cosR = Math.cos(sp.rot);
      const sinR = Math.sin(sp.rot);
      const wx = sp.x + (ox * cosR - oz * sinR) * sp.s;
      const wz = sp.z + (ox * sinR + oz * cosR) * sp.s;
      dummy.position.set(wx, sp.y + oy * sp.s, wz);
      dummy.rotation.set(rx, ry + sp.rot, (c % 2 === 0 ? 0.2 : -0.2));
      dummy.scale.setScalar(sp.s * sc);
      dummy.updateMatrix();
      const ci = idx * cardsPerTree + c;
      leafCards.setMatrixAt(ci, dummy.matrix);
      leafCards.setColorAt(ci, tint);
    }
  });

  trunks.instanceMatrix.needsUpdate = true;
  limbs.instanceMatrix.needsUpdate = true;
  leafCards.instanceMatrix.needsUpdate = true;
  if (leafCards.instanceColor) leafCards.instanceColor.needsUpdate = true;
  parent.add(trunks, limbs, leafCards);
}
