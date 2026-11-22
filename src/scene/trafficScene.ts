import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  CAMERA_PRESETS,
  CORRIDOR,
  SCENARIOS,
  type CameraPresetKey
} from '../config/scenarios';
import type { EngineStateView, PedestrianAgent, VehicleAgent } from '../simulation/types';
import { buildCorridorEnvironment, type CorridorHandles } from './corridorBuilder';
import {
  estimateCorridorDistM,
  getCorridorZoneLabel,
  sampleCorridorFrame
} from './roadSpline';
import { loadEquirectSky } from './textures';
import {
  createPedestrianMesh,
  createVehicleMesh,
  type PedestrianMeshBundle,
  type VehicleMeshBundle
} from './vehicleFactory';

export type LightingMode = 'morning' | 'afternoon';
export type CameraMode = 'free' | 'vehicle' | 'pedestrian' | 'tour';
export type VehiclePovStyle = 'chase' | 'dashcam';

export interface VehicleHoverInfo {
  agent: VehicleAgent;
  screenX: number;
  screenY: number;
}

export interface CameraStatusView {
  mode: CameraMode;
  vehiclePovStyle: VehiclePovStyle;
  activeLabel: string;
  activeDetail: string;
  corridorDistM: number;
  zoneLabel: string;
  northDeg: number;
}

export interface FrameSyncResult {
  hover: VehicleHoverInfo | null;
  cameraStatus: CameraStatusView;
}

/**
 * Architectural Tilt-Shift Depth-of-Field Shader:
 * Keeps the active corridor band razor-sharp while smoothly blurring the upper horizon
 * and lower foreground edges in isometric views (auto-disabled during street POV & Denah).
 */
const TiltShiftShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1280, 720) },
    uFocusY: { value: 0.48 },
    uFocusRange: { value: 0.24 },
    uBlurStrength: { value: 2.2 },
    uVignette: { value: 0.14 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uFocusY;
    uniform float uFocusRange;
    uniform float uBlurStrength;
    uniform float uVignette;
    varying vec2 vUv;

    void main() {
      float distY = abs(vUv.y - uFocusY);
      float blurFactor = smoothstep(uFocusRange * 0.5, 0.52, distY);
      if (vUv.y > uFocusY) {
        blurFactor = min(1.0, blurFactor * 1.18);
      }

      vec2 texel = (blurFactor * uBlurStrength) / uResolution;
      vec4 col = vec4(0.0);
      if (blurFactor > 0.01 && uBlurStrength > 0.01) {
        col += texture2D(tDiffuse, vUv) * 0.16;
        col += texture2D(tDiffuse, vUv + vec2( 1.0,  0.0) * texel * 1.2) * 0.09;
        col += texture2D(tDiffuse, vUv + vec2(-1.0,  0.0) * texel * 1.2) * 0.09;
        col += texture2D(tDiffuse, vUv + vec2( 0.0,  1.0) * texel * 1.2) * 0.09;
        col += texture2D(tDiffuse, vUv + vec2( 0.0, -1.0) * texel * 1.2) * 0.09;
        col += texture2D(tDiffuse, vUv + vec2( 0.7,  0.7) * texel * 2.1) * 0.07;
        col += texture2D(tDiffuse, vUv + vec2(-0.7,  0.7) * texel * 2.1) * 0.07;
        col += texture2D(tDiffuse, vUv + vec2( 0.7, -0.7) * texel * 2.1) * 0.07;
        col += texture2D(tDiffuse, vUv + vec2(-0.7, -0.7) * texel * 2.1) * 0.07;
        col += texture2D(tDiffuse, vUv + vec2( 1.0,  0.0) * texel * 3.1) * 0.05;
        col += texture2D(tDiffuse, vUv + vec2(-1.0,  0.0) * texel * 3.1) * 0.05;
        col += texture2D(tDiffuse, vUv + vec2( 0.0,  1.0) * texel * 3.1) * 0.05;
        col += texture2D(tDiffuse, vUv + vec2( 0.0, -1.0) * texel * 3.1) * 0.05;
      } else {
        col = texture2D(tDiffuse, vUv);
      }

      vec2 centered = vUv - 0.5;
      float vig = 1.0 - dot(centered, centered) * uVignette;
      col.rgb *= clamp(vig, 0.84, 1.0);
      gl_FragColor = col;
    }
  `
};

const OVERVIEW_FOV = 28;
const POV_FOV = 56;
const TOUR_SPEED_MS = 16;

export class TrafficScene3D {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private tiltShiftPass: ShaderPass;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private corridor: CorridorHandles;

  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private fillLight: THREE.DirectionalLight;
  private skyMorning: THREE.Texture;
  private skyAfternoon: THREE.Texture;

  private vehicleMeshes = new Map<number, VehicleMeshBundle>();
  private pedestrianMeshes = new Map<number, PedestrianMeshBundle>();

  private cameraMode: CameraMode = 'free';
  private vehiclePovStyle: VehiclePovStyle = 'chase';
  private followedVehicleId: number | null = null;
  private followedPedId: number | null = null;
  private snapNextPovFrame = false;
  private tourDistM = 0;

  private desiredCamPos: THREE.Vector3 | null = null;
  private desiredTarget: THREE.Vector3 | null = null;
  private desiredFov = OVERVIEW_FOV;
  private targetBlurStrength = 2.2;

  private keysHeld = new Set<string>();
  private raycaster = new THREE.Raycaster();
  private pointerNDC = new THREE.Vector2(-99, -99);
  private pointerScreen = { x: 0, y: 0, active: false };
  private pointerDownPos = { x: 0, y: 0, active: false };
  private pendingClickPick = false;
  private lastHoverCheckSec = -1;
  private cachedHoverVehicleId: number | null = null;

  private elapsedRealSec = 0;
  private elapsedSimSec = 0;

  constructor(container: HTMLElement) {
    this.container = container;

    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.skyMorning = loadEquirectSky('morning');
    this.skyAfternoon = loadEquirectSky('afternoon');
    this.scene.background = new THREE.Color(0xe6edf4);
    this.scene.environment = this.skyMorning;
    this.scene.fog = new THREE.Fog(0xe6edf4, 210, 560);

    this.camera = new THREE.PerspectiveCamera(OVERVIEW_FOV, w / h, 0.35, 2600);
    this.camera.position.set(...CAMERA_PRESETS.isometric.position);

    // Ergonomic OrbitControls: ground-plane panning + zoom-to-cursor + street-level minDistance!
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = false;
    this.controls.zoomToCursor = true;
    this.controls.panSpeed = 1.35;
    this.controls.rotateSpeed = 0.82;
    this.controls.zoomSpeed = 1.15;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.12;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 1250;
    this.controls.target.set(...CAMERA_PRESETS.isometric.target);
    this.controls.addEventListener('start', () => {
      // Any intentional manual drag exits preset/tour lerp cleanly into free exploration
      if (this.cameraMode === 'tour') {
        this.cameraMode = 'free';
        this.desiredFov = OVERVIEW_FOV;
      }
      this.desiredCamPos = null;
      this.desiredTarget = null;
    });

    // High-Resolution 4096x4096 Shadow Sunlight covering the entire 636 m corridor
    this.hemiLight = new THREE.HemisphereLight(0xf2f8ff, 0xb8b3a4, 0.88);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff4de, 1.65);
    this.sunLight.position.set(-110, 175, 115);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 4096;
    this.sunLight.shadow.mapSize.height = 4096;
    this.sunLight.shadow.camera.near = 20;
    this.sunLight.shadow.camera.far = 820;
    const d = 385;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = 215;
    this.sunLight.shadow.camera.bottom = -215;
    this.sunLight.shadow.bias = -0.00035;
    this.scene.add(this.sunLight);

    this.fillLight = new THREE.DirectionalLight(0xcbe0f7, 0.42);
    this.fillLight.position.set(100, 68, -80);
    this.scene.add(this.fillLight);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.2, 0.45, 0.92);
    this.composer.addPass(this.bloomPass);

    this.tiltShiftPass = new ShaderPass(TiltShiftShader);
    this.tiltShiftPass.uniforms.uResolution.value.set(w, h);
    this.composer.addPass(this.tiltShiftPass);

    this.composer.addPass(new OutputPass());

    this.corridor = buildCorridorEnvironment(this.scene);

    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('pointerleave', this.onPointerLeave);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  public setLightingMode(mode: LightingMode): void {
    if (mode === 'morning') {
      this.scene.background = new THREE.Color(0xe6edf4);
      this.scene.environment = this.skyMorning;
      this.sunLight.color.setHex(0xfff4de);
      this.sunLight.intensity = 1.65;
      this.sunLight.position.set(-110, 175, 115);
      this.hemiLight.color.setHex(0xf2f8ff);
      this.hemiLight.groundColor.setHex(0xb8b3a4);
      this.hemiLight.intensity = 0.88;
      this.fillLight.intensity = 0.42;
      this.bloomPass.strength = 0.2;
      (this.scene.fog as THREE.Fog).color.setHex(0xe6edf4);
    } else {
      this.scene.background = new THREE.Color(0xecd5be);
      this.scene.environment = this.skyAfternoon;
      this.sunLight.color.setHex(0xffb56b);
      this.sunLight.intensity = 1.92;
      this.sunLight.position.set(140, 72, 110);
      this.hemiLight.color.setHex(0xffd7b0);
      this.hemiLight.groundColor.setHex(0x827366);
      this.hemiLight.intensity = 0.7;
      this.fillLight.intensity = 0.3;
      this.bloomPass.strength = 0.32;
      (this.scene.fog as THREE.Fog).color.setHex(0xecd5be);
    }
  }

  public setCameraPreset(presetKey: CameraPresetKey): void {
    this.exitPov(false);
    const preset = CAMERA_PRESETS[presetKey];
    this.desiredCamPos = new THREE.Vector3(...preset.position);
    this.desiredTarget = new THREE.Vector3(...preset.target);
    this.desiredFov = OVERVIEW_FOV;
    this.targetBlurStrength = presetKey === 'topdown' ? 0.0 : 2.2;
  }

  public scrubCorridor(distM: number): void {
    const clamped = Math.max(0, Math.min(CORRIDOR.lengthM, distM));
    this.exitPov(false);
    this.tourDistM = clamped;
    this.applyCorridorRailTarget(clamped);
    if (this.desiredCamPos && this.desiredTarget) {
      this.camera.position.lerp(this.desiredCamPos, 0.72);
      this.controls.target.lerp(this.desiredTarget, 0.72);
      this.controls.update();
    }
  }

  public toggleCorridorTour(): void {
    if (this.cameraMode === 'tour') {
      this.exitPov(false);
      return;
    }
    this.restoreHiddenActors();
    this.followedVehicleId = null;
    this.followedPedId = null;
    this.cameraMode = 'tour';
    this.controls.enabled = true;
    this.desiredFov = 36;
    this.targetBlurStrength = 0.6;
    // Start tour from current camera location (or rewind to 0 m if already near Simpang Hilir)
    const cur = estimateCorridorDistM(this.controls.target.x);
    this.tourDistM = cur > CORRIDOR.lengthM - 35 ? 0 : Math.max(0, cur);
  }

  public enterVehiclePov(view: EngineStateView, specificVehicleId?: number): void {
    if (specificVehicleId === undefined && this.cameraMode === 'vehicle') {
      this.exitPov(true);
      return;
    }
    this.restoreHiddenActors();
    this.followedPedId = null;

    let target: VehicleAgent | undefined;
    if (specificVehicleId !== undefined) {
      target = view.vehicles.find(v => v.id === specificVehicleId);
    }
    if (!target) {
      // Prefer a moving or queuing vehicle near the middle/northern corridor (visible & dramatic!)
      const candidates = view.vehicles.filter(v => v.xM > 15 && v.xM < CORRIDOR.lengthM - 25);
      const sorted = (candidates.length > 0 ? candidates : [...view.vehicles]).sort(
        (a, b) => Math.abs(a.xM - 260) - Math.abs(b.xM - 260)
      );
      target = sorted[0];
    }
    if (!target) return;

    this.cameraMode = 'vehicle';
    this.followedVehicleId = target.id;
    this.snapNextPovFrame = true;
    this.desiredCamPos = null;
    this.desiredTarget = null;
    this.desiredFov = POV_FOV;
    this.targetBlurStrength = 0.0;
    this.controls.enabled = false;
  }

  public enterPedestrianPov(view: EngineStateView, specificPedId?: number): void {
    if (specificPedId === undefined && this.cameraMode === 'pedestrian') {
      this.exitPov(true);
      return;
    }
    this.restoreHiddenActors();
    this.followedVehicleId = null;

    let target: PedestrianAgent | undefined;
    if (specificPedId !== undefined) {
      target = view.pedestrians.find(p => p.id === specificPedId);
    }
    if (!target) {
      // Pick a pedestrian right in the bustling Pasar Gegerkalong zone first for maximum LKM-2 social impact!
      const sorted = [...view.pedestrians].sort(
        (a, b) => Math.abs(a.xM - 335) - Math.abs(b.xM - 335)
      );
      target = sorted[0];
    }
    if (!target) return;

    this.cameraMode = 'pedestrian';
    this.followedPedId = target.id;
    this.snapNextPovFrame = true;
    this.desiredCamPos = null;
    this.desiredTarget = null;
    this.desiredFov = POV_FOV;
    this.targetBlurStrength = 0.0;
    this.controls.enabled = false;
  }

  public toggleVehiclePovStyle(): void {
    this.vehiclePovStyle = this.vehiclePovStyle === 'chase' ? 'dashcam' : 'chase';
    this.snapNextPovFrame = true;
  }

  public cyclePovTarget(view: EngineStateView): void {
    if (this.cameraMode === 'vehicle' && view.vehicles.length > 0) {
      const idx = view.vehicles.findIndex(v => v.id === this.followedVehicleId);
      const next = view.vehicles[(idx + 1) % view.vehicles.length];
      this.enterVehiclePov(view, next.id);
    } else if (this.cameraMode === 'pedestrian' && view.pedestrians.length > 0) {
      const idx = view.pedestrians.findIndex(p => p.id === this.followedPedId);
      const next = view.pedestrians[(idx + 1) % view.pedestrians.length];
      this.enterPedestrianPov(view, next.id);
    }
  }

  public exitPov(liftCamera = true): void {
    const wasStreetPov = this.cameraMode === 'vehicle' || this.cameraMode === 'pedestrian';
    this.restoreHiddenActors();
    this.cameraMode = 'free';
    this.followedVehicleId = null;
    this.followedPedId = null;
    this.controls.enabled = true;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.12;
    this.desiredFov = OVERVIEW_FOV;
    this.targetBlurStrength = 2.0;

    if (wasStreetPov && liftCamera) {
      // Smoothly lift camera from eye level back to a comfortable isometric angle right over the current spot!
      const distM = estimateCorridorDistM(this.controls.target.x);
      this.applyCorridorRailTarget(distM);
    }
  }

  public resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.tiltShiftPass.uniforms.uResolution.value.set(w, h);
  }

  public getNorthCompassDeg(): number {
    const fx = this.controls.target.x - this.camera.position.x;
    const fz = this.controls.target.z - this.camera.position.z;
    const len = Math.hypot(fx, fz);
    if (len < 1e-4) return -90;
    const northUp = -fx / len;
    const northRight = fz / len;
    return (Math.atan2(northRight, northUp) * 180) / Math.PI;
  }

  public syncAndRender(view: EngineStateView, realDt: number, simDt: number): FrameSyncResult {
    this.elapsedRealSec += realDt;
    this.elapsedSimSec += simDt;
    this.corridor.updateForScenario(view.scenario, view.oneWayDir);

    // 1. Animate warning beacon & Dishub officers
    this.corridor.beaconBulbMat.emissiveIntensity = Math.sin(this.elapsedRealSec * 6.5) > 0 ? 2.6 : 0.15;
    for (const off of this.corridor.officers) {
      off.rightArm.rotation.x = 0.55 + Math.sin(this.elapsedRealSec * 4.2) * 0.45;
    }

    // 2. Sync vehicles along exact OSM S-curve & Bandung Utara elevation slope
    const activeIds = new Set<number>();
    const blinkOn = Math.floor(view.metrics.simTimeSec * 4) % 2 === 0;

    for (const v of view.vehicles) {
      activeIds.add(v.id);
      let bundle = this.vehicleMeshes.get(v.id);
      if (!bundle) {
        bundle = createVehicleMesh(v);
        this.vehicleMeshes.set(v.id, bundle);
        this.scene.add(bundle.group);
      }

      const lateralZ = v.lane * CORRIDOR.laneOffsetZ + v.zOffsetM;
      const frame = sampleCorridorFrame(v.xM, lateralZ);
      bundle.group.position.set(frame.x, frame.y + 0.07, frame.z);
      bundle.group.rotation.order = 'YXZ';
      bundle.group.rotation.y = v.dir === 1 ? frame.yaw : frame.yaw + Math.PI;
      bundle.group.rotation.z = v.dir === 1 ? frame.pitch : -frame.pitch;

      const spinDelta = (v.speedMs * simDt) / 0.32;
      for (const w of bundle.wheels) {
        w.rotation.z -= spinDelta;
      }

      bundle.brakeMat.emissiveIntensity = v.inQueue || v.speedMs < 1.2 ? 2.4 : 0.18;
      bundle.hazardMat.emissiveIntensity = v.stopPhase === 'stopped' && blinkOn ? 2.8 : 0.0;

      // Hide own vehicle mesh only in 1st-person dashcam mode so hood/roof never blocks lens
      bundle.group.visible = !(
        this.cameraMode === 'vehicle' &&
        this.vehiclePovStyle === 'dashcam' &&
        this.followedVehicleId === v.id
      );
    }

    for (const [id, bundle] of this.vehicleMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(bundle.group);
        bundle.dispose();
        this.vehicleMeshes.delete(id);
      }
    }

    // 3. Sync pedestrians along exact curved sidewalk / road edge
    const cfg = SCENARIOS[view.scenario];
    for (const p of view.pedestrians) {
      let bundle = this.pedestrianMeshes.get(p.id);
      if (!bundle) {
        bundle = createPedestrianMesh(p);
        this.pedestrianMeshes.set(p.id, bundle);
        this.scene.add(bundle.group);
      }
      const lateralZ = cfg.hasSidewalk
        ? -(CORRIDOR.roadWidthM / 2 + CORRIDOR.sidewalkWidthM * 0.5 + 0.24) + p.lateralJitterM * 0.35
        : -(CORRIDOR.roadWidthM / 2 + 0.08) + p.lateralJitterM * 0.1;
      const frame = sampleCorridorFrame(p.xM, lateralZ);
      const walkCycle = this.elapsedSimSec * 6.8 + bundle.phaseOffset;
      const walkBob = Math.abs(Math.sin(walkCycle)) * 0.045;
      const yLift = (cfg.hasSidewalk ? 0.28 : 0.07) + walkBob;

      bundle.group.position.set(frame.x, frame.y + yLift, frame.z);
      bundle.group.rotation.y = p.dir === 1 ? frame.yaw : frame.yaw + Math.PI;

      const stride = Math.sin(walkCycle) * 0.44;
      bundle.leftLegPivot.rotation.z = stride;
      bundle.rightLegPivot.rotation.z = -stride;
      bundle.leftArmPivot.rotation.z = -stride * 0.72;
      bundle.rightArmPivot.rotation.z = stride * 0.72;

      // Hide followed pedestrian's own mesh during 1st-person pedestrian POV
      bundle.group.visible = !(this.cameraMode === 'pedestrian' && this.followedPedId === p.id);
    }

    // 4. Handle click-to-follow on any 3D vehicle
    if (this.pendingClickPick) {
      this.pendingClickPick = false;
      const picked = this.pickHoveredVehicle(view, true);
      if (picked) {
        this.enterVehiclePov(view, picked.agent.id);
      }
    }

    // 5. Update camera based on active mode (Free+WASD / Tour / Vehicle POV / Pedestrian POV)
    const camStatus = this.updateCameraController(view, realDt);

    // 6. Smooth FOV & optical blur + adaptive fog
    if (Math.abs(this.camera.fov - this.desiredFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.desiredFov, Math.min(1, realDt * 6));
      this.camera.updateProjectionMatrix();
    }

    const camHeight = this.camera.position.y;
    const isHighView = camHeight > 125;
    const isStreetPov = this.cameraMode === 'vehicle' || this.cameraMode === 'pedestrian';
    const effectiveBlur = isHighView || isStreetPov ? 0.0 : this.targetBlurStrength;
    const curBlur = this.tiltShiftPass.uniforms.uBlurStrength.value as number;
    this.tiltShiftPass.uniforms.uBlurStrength.value = THREE.MathUtils.lerp(
      curBlur,
      effectiveBlur,
      Math.min(1, realDt * 6)
    );

    const fog = this.scene.fog as THREE.Fog;
    const desiredNear = isStreetPov ? 110 : isHighView ? camHeight + 240 : 195;
    const desiredFar = isStreetPov ? 340 : isHighView ? camHeight + 920 : 520;
    fog.near = THREE.MathUtils.lerp(fog.near, desiredNear, Math.min(1, realDt * 6));
    fog.far = THREE.MathUtils.lerp(fog.far, desiredFar, Math.min(1, realDt * 6));

    this.composer.render();

    const hover = isStreetPov ? null : this.pickHoveredVehicle(view);
    return { hover, cameraStatus: camStatus };
  }

  private updateCameraController(view: EngineStateView, realDt: number): CameraStatusView {
    let activeLabel = '';
    let activeDetail = '';
    let corridorDistM = estimateCorridorDistM(this.controls.target.x);

    if (this.cameraMode === 'vehicle') {
      let agent = view.vehicles.find(v => v.id === this.followedVehicleId);
      if (!agent && view.vehicles.length > 0) {
        // Auto-handoff cleanly to another vehicle when the followed one exits!
        agent = view.vehicles[0];
        this.followedVehicleId = agent.id;
        this.snapNextPovFrame = true;
      }
      if (!agent) {
        this.exitPov(true);
      } else {
        const lateralZ = agent.lane * CORRIDOR.laneOffsetZ + agent.zOffsetM;
        const frame = sampleCorridorFrame(agent.xM, lateralZ);
        const lookFrame = sampleCorridorFrame(
          Math.max(0, Math.min(CORRIDOR.lengthM, agent.xM + agent.dir * 22)),
          lateralZ * 0.7
        );

        let goalPos: THREE.Vector3;
        let goalLook: THREE.Vector3;

        if (this.vehiclePovStyle === 'dashcam') {
          const fwdDist = agent.lengthM * 0.25;
          goalPos = new THREE.Vector3(
            frame.x + frame.tx * agent.dir * fwdDist,
            frame.y + agent.heightM * 0.88 + 0.16,
            frame.z + frame.tz * agent.dir * fwdDist
          );
          goalLook = new THREE.Vector3(lookFrame.x, lookFrame.y + 1.25, lookFrame.z);
        } else {
          const backDist = agent.lengthM * 0.55 + 5.6;
          goalPos = new THREE.Vector3(
            frame.x - frame.tx * agent.dir * backDist,
            frame.y + agent.heightM + 2.15,
            frame.z - frame.tz * agent.dir * backDist
          );
          goalLook = new THREE.Vector3(lookFrame.x, lookFrame.y + 1.35, lookFrame.z);
        }

        if (this.snapNextPovFrame) {
          this.camera.position.copy(goalPos);
          this.controls.target.copy(goalLook);
          this.camera.fov = this.desiredFov;
          this.camera.updateProjectionMatrix();
          this.snapNextPovFrame = false;
        } else {
          const alpha = Math.min(1, realDt * 8.5);
          this.camera.position.lerp(goalPos, alpha);
          this.controls.target.lerp(goalLook, alpha);
        }
        this.camera.lookAt(this.controls.target);

        corridorDistM = Math.max(0, Math.min(CORRIDOR.lengthM, agent.xM));
        const dirText = agent.dir === 1 ? 'Girang → Hilir' : 'Hilir → Girang';
        const kmh = (agent.speedMs * 3.6).toFixed(0);
        const st =
          agent.stopPhase === 'stopped'
            ? agent.stopType === 'onstreet'
              ? 'Berhenti di badan jalan'
              : agent.stopType === 'dropoff'
              ? 'Di Zona Drop-Off'
              : 'Di Parkir Khusus'
            : agent.inQueue
            ? 'Mengantre'
            : 'Melaju';
        activeLabel = `POV ${agent.kind} #${agent.id}`;
        activeDetail = `${dirText} · ${kmh} km/j · ${st}`;
      }
    } else if (this.cameraMode === 'pedestrian') {
      const ped = view.pedestrians.find(p => p.id === this.followedPedId) ?? view.pedestrians[0];
      if (!ped) {
        this.exitPov(true);
      } else {
        this.followedPedId = ped.id;
        const cfg = SCENARIOS[view.scenario];
        // Keep camera cleanly centered on the raised sidewalk (Skenario 1/2) or hugging the narrow road edge (Baseline)
        const lateralZ = cfg.hasSidewalk
          ? -(CORRIDOR.roadWidthM / 2 + CORRIDOR.sidewalkWidthM * 0.5 + 0.24) + ped.lateralJitterM * 0.18
          : -(CORRIDOR.roadWidthM / 2 + 0.08) + ped.lateralJitterM * 0.08;
        const frame = sampleCorridorFrame(ped.xM, lateralZ);
        const lookFrame = sampleCorridorFrame(
          Math.max(0, Math.min(CORRIDOR.lengthM, ped.xM + ped.dir * 18)),
          lateralZ * 0.35 // Look slightly inward toward oncoming traffic & bollards
        );

        const bob = Math.abs(Math.sin(this.elapsedSimSec * 6.8 + ped.id * 1.7)) * 0.032;
        const eyeHeight = (cfg.hasSidewalk ? 0.28 : 0.07) + 1.54 + bob;
        const goalPos = new THREE.Vector3(frame.x, frame.y + eyeHeight, frame.z);
        const goalLook = new THREE.Vector3(lookFrame.x, lookFrame.y + 1.38, lookFrame.z);

        if (this.snapNextPovFrame) {
          this.camera.position.copy(goalPos);
          this.controls.target.copy(goalLook);
          this.camera.fov = this.desiredFov;
          this.camera.updateProjectionMatrix();
          this.snapNextPovFrame = false;
        } else {
          const alpha = Math.min(1, realDt * 8.5);
          this.camera.position.lerp(goalPos, alpha);
          this.controls.target.lerp(goalLook, alpha);
        }
        this.camera.lookAt(this.controls.target);

        corridorDistM = Math.max(0, Math.min(CORRIDOR.lengthM, ped.xM));
        activeLabel = `POV Pejalan Kaki (${Math.round(corridorDistM)} m)`;
        activeDetail = !cfg.hasOffstreet
          ? 'Berjalan di tepi aspal sempit tanpa trotoar (terdesak parkir liar & arus 2 arah)'
          : cfg.twoWay
          ? 'Tepi jalan bebas parkir liar (hambatan samping dipindah ke zona drop-off & parkir)'
          : 'Arus satu arah & bebas parkir liar — konflik pejalan kaki minimal di ruas sempit';
      }
    } else if (this.cameraMode === 'tour') {
      this.tourDistM += TOUR_SPEED_MS * realDt;
      if (this.tourDistM > CORRIDOR.lengthM) {
        this.tourDistM = 0;
      }
      this.applyCorridorRailTarget(this.tourDistM);
      const alpha = Math.min(1, realDt * 3.8);
      if (this.desiredCamPos && this.desiredTarget) {
        this.camera.position.lerp(this.desiredCamPos, alpha);
        this.controls.target.lerp(this.desiredTarget, alpha);
      }
      this.controls.update();
      corridorDistM = this.tourDistM;
      activeLabel = `Tur Koridor (${Math.round(corridorDistM)} m)`;
      activeDetail = getCorridorZoneLabel(corridorDistM);
    } else {
      // Free OrbitControls + smooth keyboard WASD/Arrow ground-plane navigation!
      this.applyKeyboardPan(realDt);
      if (this.desiredCamPos && this.desiredTarget) {
        const alpha = Math.min(1, realDt * 4.8);
        this.camera.position.lerp(this.desiredCamPos, alpha);
        this.controls.target.lerp(this.desiredTarget, alpha);
        if (this.camera.position.distanceTo(this.desiredCamPos) < 0.45) {
          this.desiredCamPos = null;
          this.desiredTarget = null;
        }
      }
      this.controls.update();
      corridorDistM = estimateCorridorDistM(this.controls.target.x);
    }

    return {
      mode: this.cameraMode,
      vehiclePovStyle: this.vehiclePovStyle,
      activeLabel,
      activeDetail,
      corridorDistM,
      zoneLabel: getCorridorZoneLabel(corridorDistM),
      northDeg: this.getNorthCompassDeg()
    };
  }

  private applyCorridorRailTarget(distM: number): void {
    const camFrame = sampleCorridorFrame(Math.max(0, distM - 24), 28);
    const lookFrame = sampleCorridorFrame(Math.min(CORRIDOR.lengthM, distM + 14), 0);
    this.desiredCamPos = new THREE.Vector3(camFrame.x, camFrame.y + 26, camFrame.z);
    this.desiredTarget = new THREE.Vector3(lookFrame.x, lookFrame.y + 2.2, lookFrame.z);
  }

  private applyKeyboardPan(realDt: number): void {
    if (this.keysHeld.size === 0) return;

    const moveFwd =
      (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp') ? 1 : 0) -
      (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown') ? 1 : 0);
    const moveRight =
      (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight') ? 1 : 0) -
      (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft') ? 1 : 0);
    const moveUp = (this.keysHeld.has('KeyE') ? 1 : 0) - (this.keysHeld.has('KeyQ') ? 1 : 0);

    if (moveFwd === 0 && moveRight === 0 && moveUp === 0) return;

    // Cancel active preset transition if user presses navigation keys
    this.desiredCamPos = null;
    this.desiredTarget = null;

    const dist = this.camera.position.distanceTo(this.controls.target);
    const panRate = Math.max(18, Math.min(180, dist * 0.72)) * realDt;

    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(1, 0, 0);
    fwd.normalize();

    const right = new THREE.Vector3().crossVectors(fwd, THREE.Object3D.DEFAULT_UP).normalize();
    const delta = new THREE.Vector3();
    delta.addScaledVector(fwd, moveFwd * panRate);
    delta.addScaledVector(right, moveRight * panRate);

    this.camera.position.add(delta);
    this.controls.target.add(delta);

    if (moveUp !== 0) {
      this.camera.position.y = Math.max(6, Math.min(950, this.camera.position.y + moveUp * panRate * 0.7));
    }

    // Gently keep target elevation synced to Bandung Utara slope as you glide along X
    const distM = estimateCorridorDistM(this.controls.target.x);
    const groundY = sampleCorridorFrame(distM, 0).groundY;
    this.controls.target.y = THREE.MathUtils.lerp(this.controls.target.y, groundY + 2.5, Math.min(1, realDt * 4));
  }

  private restoreHiddenActors(): void {
    for (const b of this.vehicleMeshes.values()) b.group.visible = true;
    for (const b of this.pedestrianMeshes.values()) b.group.visible = true;
  }

  /**
   * Fast O(N) mathematical Ray-vs-Oriented-Bounding-Box (OBB) vehicle picker:
   * Avoids recursive Three.js triangle raycasting across ~1,800 vehicle sub-meshes & torus wheels.
   * Throttled to 15 Hz during passive hover and executed immediately on click.
   */
  private pickHoveredVehicle(view: EngineStateView, forceImmediate = false): VehicleHoverInfo | null {
    if (!this.pointerScreen.active) {
      this.cachedHoverVehicleId = null;
      return null;
    }

    if (!forceImmediate && this.elapsedRealSec - this.lastHoverCheckSec < 0.065) {
      if (this.cachedHoverVehicleId === null) return null;
      const cached = view.vehicles.find(v => v.id === this.cachedHoverVehicleId);
      if (!cached) return null;
      return {
        agent: cached,
        screenX: this.pointerScreen.x,
        screenY: this.pointerScreen.y
      };
    }

    this.lastHoverCheckSec = this.elapsedRealSec;
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);
    const ro = this.raycaster.ray.origin;
    const rd = this.raycaster.ray.direction;

    let bestAgent: VehicleAgent | null = null;
    let bestT = Infinity;

    for (const v of view.vehicles) {
      const bundle = this.vehicleMeshes.get(v.id);
      if (!bundle || !bundle.group.visible) continue;

      const pos = bundle.group.position;
      const yaw = bundle.group.rotation.y;
      const cosY = Math.cos(-yaw);
      const sinY = Math.sin(-yaw);

      // Transform ray origin & direction into vehicle's local horizontal frame
      const dx = ro.x - pos.x;
      const dy = ro.y - pos.y;
      const dz = ro.z - pos.z;

      const lox = dx * cosY - dz * sinY;
      const loy = dy;
      const loz = dx * sinY + dz * cosY;

      const ldx = rd.x * cosY - rd.z * sinY;
      const ldy = rd.y;
      const ldz = rd.x * sinY + rd.z * cosY;

      // Slightly generous hit box around vehicle so motorcycles are easy to hover & click
      const hx = v.lengthM * 0.55 + 0.15;
      const hyMin = -0.1;
      const hyMax = v.heightM + 0.25;
      const hz = Math.max(0.46, v.widthM * 0.56);

      let tMin = 0.2;
      let tMax = bestT;

      // X slab
      if (Math.abs(ldx) < 1e-6) {
        if (lox < -hx || lox > hx) continue;
      } else {
        const inv = 1 / ldx;
        let t1 = (-hx - lox) * inv;
        let t2 = (hx - lox) * inv;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        if (t1 > tMin) tMin = t1;
        if (t2 < tMax) tMax = t2;
        if (tMin > tMax) continue;
      }

      // Y slab
      if (Math.abs(ldy) < 1e-6) {
        if (loy < hyMin || loy > hyMax) continue;
      } else {
        const inv = 1 / ldy;
        let t1 = (hyMin - loy) * inv;
        let t2 = (hyMax - loy) * inv;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        if (t1 > tMin) tMin = t1;
        if (t2 < tMax) tMax = t2;
        if (tMin > tMax) continue;
      }

      // Z slab
      if (Math.abs(ldz) < 1e-6) {
        if (loz < -hz || loz > hz) continue;
      } else {
        const inv = 1 / ldz;
        let t1 = (-hz - loz) * inv;
        let t2 = (hz - loz) * inv;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        if (t1 > tMin) tMin = t1;
        if (t2 < tMax) tMax = t2;
        if (tMin > tMax) continue;
      }

      bestT = tMin;
      bestAgent = v;
    }

    this.cachedHoverVehicleId = bestAgent ? bestAgent.id : null;
    if (!bestAgent) return null;

    return {
      agent: bestAgent,
      screenX: this.pointerScreen.x,
      screenY: this.pointerScreen.y
    };
  }

  private onPointerMove = (ev: PointerEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNDC.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNDC.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    this.pointerScreen = { x: ev.clientX - rect.left, y: ev.clientY - rect.top, active: true };
  };

  private onPointerLeave = (): void => {
    this.pointerScreen.active = false;
    this.pointerDownPos.active = false;
  };

  private onPointerDown = (ev: PointerEvent): void => {
    if (ev.button !== 0) return;
    this.pointerDownPos = { x: ev.clientX, y: ev.clientY, active: true };
  };

  private onPointerUp = (ev: PointerEvent): void => {
    if (ev.button !== 0 || !this.pointerDownPos.active) return;
    const moved = Math.hypot(ev.clientX - this.pointerDownPos.x, ev.clientY - this.pointerDownPos.y);
    this.pointerDownPos.active = false;
    if (moved < 6 && this.cameraMode === 'free') {
      this.pendingClickPick = true;
    }
  };

  private onKeyDown = (ev: KeyboardEvent): void => {
    const tag = (ev.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (ev.code === 'Escape' && this.cameraMode !== 'free') {
      this.exitPov(true);
      return;
    }
    if (ev.code === 'KeyR' && !ev.ctrlKey && !ev.metaKey) {
      this.setCameraPreset('isometric');
      return;
    }
    if (
      ev.code === 'KeyW' ||
      ev.code === 'KeyA' ||
      ev.code === 'KeyS' ||
      ev.code === 'KeyD' ||
      ev.code === 'KeyQ' ||
      ev.code === 'KeyE' ||
      ev.code === 'ArrowUp' ||
      ev.code === 'ArrowDown' ||
      ev.code === 'ArrowLeft' ||
      ev.code === 'ArrowRight'
    ) {
      this.keysHeld.add(ev.code);
    }
  };

  private onKeyUp = (ev: KeyboardEvent): void => {
    this.keysHeld.delete(ev.code);
  };

  public dispose(): void {
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.removeEventListener('pointerleave', this.onPointerLeave);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);

    for (const bundle of this.vehicleMeshes.values()) {
      this.scene.remove(bundle.group);
      bundle.dispose();
    }
    this.vehicleMeshes.clear();
    for (const bundle of this.pedestrianMeshes.values()) {
      this.scene.remove(bundle.group);
      bundle.dispose();
    }
    this.pedestrianMeshes.clear();
    this.skyMorning.dispose();
    this.skyAfternoon.dispose();
    this.composer.dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }
}
