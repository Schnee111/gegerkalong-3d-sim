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
import type { EngineStateView, VehicleAgent } from '../simulation/types';
import { buildCorridorEnvironment, type CorridorHandles } from './corridorBuilder';
import { sampleCorridorFrame } from './roadSpline';
import { loadEquirectSky } from './textures';
import {
  createPedestrianMesh,
  createVehicleMesh,
  type PedestrianMeshBundle,
  type VehicleMeshBundle
} from './vehicleFactory';

export type LightingMode = 'morning' | 'afternoon';

export interface VehicleHoverInfo {
  agent: VehicleAgent;
  screenX: number;
  screenY: number;
}

/**
 * Architectural Tilt-Shift Depth-of-Field Shader:
 * Keeps the active corridor band razor-sharp while smoothly blurring the upper horizon
 * and lower foreground edges like a real tilt-shift isometric miniature lens.
 */
const TiltShiftShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1280, 720) },
    uFocusY: { value: 0.48 },
    uFocusRange: { value: 0.24 },
    uBlurStrength: { value: 2.35 },
    uVignette: { value: 0.16 }
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
      // Slight extra blur on top distant horizon vs foreground
      if (vUv.y > uFocusY) {
        blurFactor = min(1.0, blurFactor * 1.18);
      }

      vec2 texel = (blurFactor * uBlurStrength) / uResolution;
      vec4 col = vec4(0.0);
      if (blurFactor > 0.01 && uBlurStrength > 0.01) {
        // 13-tap disc bokeh kernel for silky smooth optical blur
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

      // Subtle architectural lens vignette
      vec2 centered = vUv - 0.5;
      float vig = 1.0 - dot(centered, centered) * uVignette;
      col.rgb *= clamp(vig, 0.82, 1.0);
      gl_FragColor = col;
    }
  `
};

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

  private desiredCamPos: THREE.Vector3 | null = null;
  private desiredTarget: THREE.Vector3 | null = null;
  private targetBlurStrength = 2.35;

  private raycaster = new THREE.Raycaster();
  private pointerNDC = new THREE.Vector2(-99, -99);
  private pointerScreen = { x: 0, y: 0, active: false };
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

    // Real Photographic CC0 Poly Haven Equirectangular Skies (Reflections) + Soft Atmospheric Horizon Mist
    this.skyMorning = loadEquirectSky('morning');
    this.skyAfternoon = loadEquirectSky('afternoon');
    this.scene.background = new THREE.Color(0xe6edf4);
    this.scene.environment = this.skyMorning;
    this.scene.fog = new THREE.Fog(0xe6edf4, 210, 560);

    // Telephoto Architectural Isometric Lens (26 deg FOV removes wide-angle distortion!)
    this.camera = new THREE.PerspectiveCamera(26, w / h, 1.0, 2600);
    this.camera.position.set(...CAMERA_PRESETS.isometric.position);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.14; // Keeps camera above ugly flat horizon plane
    this.controls.minDistance = 24;
    this.controls.maxDistance = 1250;
    this.controls.target.set(...CAMERA_PRESETS.isometric.target);
    this.controls.addEventListener('start', () => {
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

    // Post-processing pipeline: Render -> Subtle Selective Bloom -> Architectural Tilt-Shift Blur -> Output
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
  }

  public setLightingMode(mode: LightingMode): void {
    if (mode === 'morning') {
      this.scene.background = new THREE.Color(0xe6edf4);
      this.scene.environment = this.skyMorning;
      this.sunLight.color.setHex(0xfff4de);
      this.sunLight.intensity = 1.65;
      this.sunLight.position.set(-85, 130, 82);
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
      this.sunLight.position.set(130, 60, 95);
      this.hemiLight.color.setHex(0xffd7b0);
      this.hemiLight.groundColor.setHex(0x827366);
      this.hemiLight.intensity = 0.7;
      this.fillLight.intensity = 0.3;
      this.bloomPass.strength = 0.32;
      (this.scene.fog as THREE.Fog).color.setHex(0xecd5be);
    }
  }

  public setCameraPreset(presetKey: CameraPresetKey): void {
    const preset = CAMERA_PRESETS[presetKey];
    this.desiredCamPos = new THREE.Vector3(...preset.position);
    this.desiredTarget = new THREE.Vector3(...preset.target);
    // Keep Denah Peta OSM crisp end-to-end; use rich tilt-shift bokeh on isometric/street views
    this.targetBlurStrength = presetKey === 'topdown' ? 0.0 : 2.35;
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

  /**
   * Returns clockwise degrees from screen-Up pointing toward real geographic North (-X / Simpang Girang).
   */
  public getNorthCompassDeg(): number {
    const fx = this.controls.target.x - this.camera.position.x;
    const fz = this.controls.target.z - this.camera.position.z;
    const len = Math.hypot(fx, fz);
    if (len < 1e-4) return -90;
    const northUp = -fx / len;
    const northRight = fz / len;
    return (Math.atan2(northRight, northUp) * 180) / Math.PI;
  }

  public syncAndRender(view: EngineStateView, realDt: number, simDt: number): VehicleHoverInfo | null {
    this.elapsedRealSec += realDt;
    this.elapsedSimSec += simDt;
    this.corridor.updateForScenario(view.scenario, view.oneWayDir);

    // Dynamically adapt fog & tilt-shift blur to camera altitude so high top-down / Denah views are 100% crisp!
    const camHeight = this.camera.position.y;
    const isHighView = camHeight > 125;
    const effectiveBlur = isHighView ? 0.0 : this.targetBlurStrength;
    const curBlur = this.tiltShiftPass.uniforms.uBlurStrength.value as number;
    this.tiltShiftPass.uniforms.uBlurStrength.value = THREE.MathUtils.lerp(
      curBlur,
      effectiveBlur,
      Math.min(1, realDt * 5)
    );
    const fog = this.scene.fog as THREE.Fog;
    const desiredNear = isHighView ? camHeight + 240 : 195;
    const desiredFar = isHighView ? camHeight + 920 : 520;
    fog.near = THREE.MathUtils.lerp(fog.near, desiredNear, Math.min(1, realDt * 6));
    fog.far = THREE.MathUtils.lerp(fog.far, desiredFar, Math.min(1, realDt * 6));

    // Animate flashing warning beacon & Dishub officer arm wave
    this.corridor.beaconBulbMat.emissiveIntensity = Math.sin(this.elapsedRealSec * 6.5) > 0 ? 2.6 : 0.15;
    for (const off of this.corridor.officers) {
      off.rightArm.rotation.x = 0.55 + Math.sin(this.elapsedRealSec * 4.2) * 0.45;
    }

    // Sync vehicles along the EXACT OSM S-curve & Bandung Utara elevation slope
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
    }

    for (const [id, bundle] of this.vehicleMeshes.entries()) {
      if (!activeIds.has(id)) {
        this.scene.remove(bundle.group);
        bundle.dispose();
        this.vehicleMeshes.delete(id);
      }
    }

    // Sync pedestrians along the EXACT curved sidewalk / road edge
    const cfg = SCENARIOS[view.scenario];
    for (const p of view.pedestrians) {
      let bundle = this.pedestrianMeshes.get(p.id);
      if (!bundle) {
        bundle = createPedestrianMesh(p);
        this.pedestrianMeshes.set(p.id, bundle);
        this.scene.add(bundle.group);
      }
      // In Baseline (no sidewalk), pedestrians walk along the outer gutter/shoulder (-2.44 m),
      // close enough to feel tight on the narrow road but clear of vehicle bodies
      const lateralZ = cfg.hasSidewalk
        ? -(CORRIDOR.roadWidthM / 2 + CORRIDOR.sidewalkWidthM * 0.5 + 0.3) + p.lateralJitterM * 0.55
        : -(CORRIDOR.roadWidthM / 2 + 0.54) + p.lateralJitterM * 0.22;
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
    }

    if (this.desiredCamPos && this.desiredTarget) {
      const alpha = Math.min(1, realDt * 4.5);
      this.camera.position.lerp(this.desiredCamPos, alpha);
      this.controls.target.lerp(this.desiredTarget, alpha);
      if (this.camera.position.distanceTo(this.desiredCamPos) < 0.4) {
        this.desiredCamPos = null;
        this.desiredTarget = null;
      }
    }

    this.controls.update();
    this.composer.render();

    return this.pickHoveredVehicle(view);
  }

  private pickHoveredVehicle(view: EngineStateView): VehicleHoverInfo | null {
    if (!this.pointerScreen.active) return null;
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);
    const meshes: THREE.Object3D[] = [];
    for (const bundle of this.vehicleMeshes.values()) {
      meshes.push(bundle.group);
    }
    const hits = this.raycaster.intersectObjects(meshes, true);
    if (hits.length === 0) return null;

    let obj: THREE.Object3D | null = hits[0].object;
    while (obj && obj.userData.vehicleId === undefined) {
      obj = obj.parent;
    }
    if (!obj || typeof obj.userData.vehicleId !== 'number') return null;

    const agent = view.vehicles.find(v => v.id === obj!.userData.vehicleId);
    if (!agent) return null;

    return {
      agent,
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
  };

  public dispose(): void {
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.removeEventListener('pointerleave', this.onPointerLeave);
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
