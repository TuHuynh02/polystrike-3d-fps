import * as THREE from '../three.js';
import {
  BTN,
  DEFAULT_MAP_ID,
  FIXED_DT,
  INTERP_DELAY_MAX_MS,
  MATCH_CONFIG,
  WEAPONS,
  WEAPON_ORDER,
  commandTimeMs,
  computeSpreadAmount,
  createMovementState,
  createShotState,
  getEffectiveFireRateMs,
  getMapConfig,
  hasLineOfSight,
  isFireIntervalOk,
  isPointInsideInflatedBoxes,
  isValidMoveAck,
  planShot,
  resetShotState,
  stepCommand,
  stepGrenade
} from '../shared.js';
import { ClientPrediction, INPUT_BATCH_INTERVAL_MS } from '../prediction.js';
import { SnapshotInterpolator } from '../snapshotBuffer.js';
import { buildSkyAndAtmosphere, buildArena } from '../arenaBuilder.js';
import { createWeaponMesh, getThirdPersonWeaponTemplate, setWeaponAdsCulling } from '../weaponModels.js';
import { createChamferedBlockGeometry } from '../weapons/weaponMaterials.js';
import { roundedBox } from '../weapons/roundedBox.js';
import {
  RIG_MAT_CACHE,
  createRemotePlayerMesh,
  animateHumanoidRig,
  disposeObject3D,
  getCachedGeo,
  poseOperatorCryzenPoster,
  resolveCryzenVariantFromColor
} from '../humanoidRig.js';
import { TacticalMinimap } from '../minimap.js';
import { sfx } from '../audio.js';
import {
  PerfOverlay,
  QUALITY,
  applyMetalnessCap,
  detectInitialTier,
  isPerfOverlayRequested,
  loadQualityChoice,
  resolveTier,
  saveQualityChoice
} from '../quality.js';
import { getAssetManager } from '../assets.js';
import { applyPbrToSlots, revertPbrSlots, surfaceSetsForMap } from '../surfaceMaterials.js';
import { CRATE_MODEL_NAMES } from '../arenaProps.js';
import { applyWeaponAssetOverride, isWeaponOverrideEnabled, measureWeaponGroup } from '../weaponAssetOverrides.js';
import {
  canUseCs2WeaponGlb,
  createCs2WorldWeaponMesh,
  isCs2WeaponSupported,
  loadCs2ViewmodelGlb,
  refreshAllCs2WeaponEnvMaps,
  refreshCs2WeaponEnvMap,
  resetCs2ViewmodelParts
} from '../weapons/cs2WeaponGlb.js';

export function shadowTypeFor(kind) {
  if (kind === 'pcfsoft') return THREE.PCFSoftShadowMap;
  if (kind === 'pcf') return THREE.PCFShadowMap;
  return THREE.BasicShadowMap;
}

export const DEATH_BODY_MAX_MS = 1500;

export class WeaponsAndShowcaseMethods {
  createWeaponMesh(weaponId, isFirstPerson = false) {
    const mesh = createWeaponMesh(weaponId, isFirstPerson);
    applyMetalnessCap(mesh, this.quality?.envMapSize === 0 ? 0.35 : null); // Low: no env map, keep metals from going black
    return mesh;
  }

  /**
   * World-space weapon (dropped pickups + lobby showcase). Procedural body first; when the opt-in glTF override
   * (weaponAssetOverrides.js, ?glbWeapons=1) is enabled and loads, its visual replaces the body (contracts are untouched).
   */
  createShowcaseWeaponMesh(weaponId) {
    const mesh = this.createWeaponMesh(weaponId, false);
    if (this.assetsEnabled && isWeaponOverrideEnabled()) {
      const procBox = measureWeaponGroup(mesh);
      applyWeaponAssetOverride(mesh, weaponId, this.assets, procBox);
    }
    return mesh;
  }

  setupViewmodelWeapons() {
    this.viewmodelRig = new THREE.Group();
    this.camera.add(this.viewmodelRig);

    // 3-point viewmodel camera-rigged lighting (rebalanced under CS2 5.2 sunlight + Layer 1 hemi fill)
    this.viewmodelKeyLight = new THREE.PointLight(0xfff5e8, 0.72, 3.2, 1.4);
    this.viewmodelKeyLight.position.set(0.26, 0.34, -0.22);
    this.camera.add(this.viewmodelKeyLight);

    this.viewmodelRimLight = new THREE.PointLight(0x7dd3fc, 0.58, 3.0, 1.4);
    this.viewmodelRimLight.position.set(-0.28, 0.22, -0.62);
    this.camera.add(this.viewmodelRimLight);

    this.viewmodelFillLight = new THREE.PointLight(0xcbd5e1, 0.42, 2.8, 1.5);
    this.viewmodelFillLight.position.set(-0.18, -0.18, 0.14);
    this.camera.add(this.viewmodelFillLight);

    this.muzzleLight = new THREE.PointLight(0xfef08a, 0, 10, 2);
    this.muzzleLight.position.set(0.21, -0.14, -1.25);
    this.camera.add(this.muzzleLight);

    this.viewmodelMeshes = {};
    this.viewmodelWeapons = this.viewmodelMeshes;
    this._cs2VmPromises = new Map();
    for (const wId of WEAPON_ORDER) {
      const mesh = this.createWeaponMesh(wId, true);
      mesh.visible = wId === this.currentWeapon;
      this.viewmodelRig.add(mesh);
      this.viewmodelMeshes[wId] = mesh;
    }
    this.viewmodelRig.position.set(0.205, -0.19, -0.335);
    this.viewmodelRig.rotation.set(0, 0.045, 0);
    this.inspectUntil = 0;
    this.inspectDuration = 2800;
    this._inspectShotBaseline = -1000;
    this._primeCs2Viewmodels();
  }

  _primeCs2Viewmodels() {
    if (!this.assetsEnabled || !canUseCs2WeaponGlb()) return;
    const priority = [
      this.currentWeapon,
      this.loadout?.primary,
      this.loadout?.melee,
      ...WEAPON_ORDER
    ];
    const seen = new Set();
    for (let i = 0; i < priority.length; i++) {
      const wId = priority[i];
      if (!wId || seen.has(wId) || !isCs2WeaponSupported(wId)) continue;
      seen.add(wId);
      void this._ensureCs2ViewmodelLoaded(wId);
    }
  }

  _ensureCs2ViewmodelLoaded(weaponId) {
    if (!this.assetsEnabled || !canUseCs2WeaponGlb() || !isCs2WeaponSupported(weaponId)) {
      return null;
    }
    if (!this._cs2VmPromises) this._cs2VmPromises = new Map();
    if (this._cs2VmPromises.has(weaponId)) return this._cs2VmPromises.get(weaponId);

    const promise = (async () => {
      try {
        const cs2Vm = await loadCs2ViewmodelGlb(weaponId, this.assets, this.scene?.environment || null);
        if (!cs2Vm || !this.viewmodelRig || !this.viewmodelMeshes) return null;

        const prevVm = this.viewmodelMeshes[weaponId];
        cs2Vm.visible = weaponId === this.currentWeapon;
        if (this.quality?.envMapSize === 0) {
          applyMetalnessCap(cs2Vm, 0.35);
        }
        const latestEnv = this.scene?.environment || null;
        refreshCs2WeaponEnvMap(cs2Vm, latestEnv);
        cs2Vm.userData._boundEnvMap = latestEnv;

        this.viewmodelRig.add(cs2Vm);
        if (prevVm && prevVm !== cs2Vm) {
          prevVm.visible = false;
          this.viewmodelRig.remove(prevVm);
          disposeObject3D(prevVm);
        }
        this.viewmodelMeshes[weaponId] = cs2Vm;
        this.viewmodelWeapons = this.viewmodelMeshes;
        this.syncViewmodelLayers?.();

        if (weaponId === this.currentWeapon && cs2Vm.userData?.cs2Pose?.hip && !this.inMatch) {
          const hp = cs2Vm.userData.cs2Pose.hip;
          this.viewmodelRig.position.set(hp.pos[0], hp.pos[1], hp.pos[2]);
          this.viewmodelRig.rotation.set(hp.rot[0], hp.rot[1], hp.rot[2]);
        }
        return cs2Vm;
      } catch {
        return null;
      }
    })();

    this._cs2VmPromises.set(weaponId, promise);
    return promise;
  }

  refreshCs2WeaponEnvMaps(envMap = this.scene?.environment || null) {
    const resolvedEnv = envMap ?? null;
    refreshAllCs2WeaponEnvMaps(resolvedEnv);
    if (this.viewmodelRig) {
      refreshCs2WeaponEnvMap(this.viewmodelRig, resolvedEnv);
    }
    if (this.lobbyWeaponInspectSpin) {
      refreshCs2WeaponEnvMap(this.lobbyWeaponInspectSpin, resolvedEnv);
    }
    if (this.viewmodelMeshes) {
      for (const vm of Object.values(this.viewmodelMeshes)) {
        if (vm?.userData?.isCs2Glb) {
          vm.userData._boundEnvMap = resolvedEnv;
        }
      }
    }
    if (this.quality?.envMapSize === 0) {
      if (this.viewmodelRig) applyMetalnessCap(this.viewmodelRig, 0.35);
      if (this.lobbyWeaponInspectSpin) applyMetalnessCap(this.lobbyWeaponInspectSpin, 0.35);
    }
  }

  triggerWeaponInspect(nowMs = undefined) {
    const now = typeof nowMs === 'number' ? nowMs : performance.now();
    if (!this.alive || !this.inMatch || this.inMenu) return false;
    if (this.reloadingUntil > now || this.reloading) return false;
    if (this.equipUntil > now || this.isAiming || this.isSprinting || this.isSliding) return false;
    if (this.isCookingGrenade || this.grenadeThrowUntil > now || this.meleeSwingUntil > now) return false;
    const isKnife = this.currentWeapon === 'knife';
    const curVm = this.viewmodelMeshes?.[this.currentWeapon];
    const activeWeaponMesh = curVm?.userData?.knifeNode || curVm?.userData?.activeWeaponMesh;
    if (activeWeaponMesh && Math.abs(activeWeaponMesh.rotation.x) > Math.PI) {
      const twoPi = Math.PI * 2;
      activeWeaponMesh.rotation.x = ((((activeWeaponMesh.rotation.x + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
    }
    this.inspectDuration = isKnife ? 2200 : 2800;
    this.inspectUntil = now + this.inspectDuration;
    this._inspectShotBaseline = this.lastShotAt ?? -1000;
    return true;
  }

  setupLobbyShowcase() {
    this.lobbyCameraMode = 'harbor';
    this._lobbyCamPos = new THREE.Vector3(-25, 12.4, 34);
    this._lobbyLookTarget = new THREE.Vector3(18, 7.4, -6);
    this._lobbyDesiredPos = new THREE.Vector3();
    this._lobbyDesiredLook = new THREE.Vector3();
    this._lobbyCamInitialized = false;

    this.lobbyShowcaseGroup = new THREE.Group();
    this.lobbyShowcaseGroup.position.set(0.76, -0.94, -2.72);
    this.camera.add(this.lobbyShowcaseGroup);

    // 3-point Gunsmith / Operator Studio Lighting (elevated cool fill lifts cap-brim face shadow for crisp eyes & MOLLE detail)
    this.lobbyKeyLight = new THREE.PointLight(0xfff5e4, 2.55, 9.8, 1.02);
    this.lobbyKeyLight.position.set(0.95, 2.18, 2.05);
    this.lobbyShowcaseGroup.add(this.lobbyKeyLight);

    this.lobbyRimLight = new THREE.PointLight(0xe5a024, 1.35, 8.0, 1.08);
    this.lobbyRimLight.position.set(-1.45, 1.75, -1.05);
    this.lobbyShowcaseGroup.add(this.lobbyRimLight);

    this.lobbyFillLight = new THREE.PointLight(0xdbeafe, 1.35, 8.0, 1.10);
    this.lobbyFillLight.position.set(-0.72, 1.42, 2.12);
    this.lobbyShowcaseGroup.add(this.lobbyFillLight);

    // Saltline Berth-4 Industrial Steel Inspection Grate Deck (zero sci-fi hologram cones)
    const pedGroup = new THREE.Group();
    this.lobbyPedestalGroup = pedGroup;
    const baseRingMat = new THREE.MeshStandardMaterial({
      color: 0x12161b,
      roughness: 0.56,
      metalness: 0.78
    });
    const chromeRimMat = new THREE.MeshStandardMaterial({
      color: 0x28313d,
      roughness: 0.36,
      metalness: 0.86
    });
    const viseMatteMat = new THREE.MeshStandardMaterial({
      color: 0x1a1f26,
      roughness: 0.68,
      metalness: 0.18
    });
    const viseSteelMat = new THREE.MeshStandardMaterial({
      color: 0x6b7785,
      roughness: 0.24,
      metalness: 0.90
    });
    const viseBadgeMat = new THREE.MeshStandardMaterial({
      color: 0x9c6e26,
      roughness: 0.40,
      metalness: 0.76
    });
    this.lobbyPedestalGlowMat = new THREE.MeshBasicMaterial({
      color: 0xe5a024,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.62
    });
    this.lobbyHoloConeMat = null;

    const outerDeck = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.74, 0.068, 8), baseRingMat);
    outerDeck.position.y = -0.036;
    outerDeck.rotation.y = Math.PI / 8;
    const innerPad = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.58, 0.076, 8), chromeRimMat);
    innerPad.position.y = -0.026;
    innerPad.rotation.y = Math.PI / 8;
    this.lobbyHoloRingOuter = new THREE.Mesh(new THREE.RingGeometry(0.57, 0.595, 8), this.lobbyPedestalGlowMat);
    this.lobbyHoloRingOuter.rotation.x = -Math.PI / 2;
    this.lobbyHoloRingOuter.rotation.z = Math.PI / 8;
    this.lobbyHoloRingOuter.position.y = 0.014;
    this.lobbyHoloRingInner = null;

    pedGroup.add(outerDeck, innerPad, this.lobbyHoloRingOuter);
    this.lobbyShowcaseGroup.add(pedGroup);

    // Gunsmith 3D Weapon Inspection Stage — Sleek Dark Anodized Armory Bench Vise (for 'weapon' camera mode)
    this.lobbyWeaponInspectGroup = new THREE.Group();
    this.lobbyWeaponInspectGroup.visible = false;
    this.lobbyShowcaseGroup.add(this.lobbyWeaponInspectGroup);

    const viseBase = new THREE.Mesh(
      createChamferedBlockGeometry(0.76, 0.026, 0.25, 0.012, 0.008, 0.008, 0.008),
      baseRingMat
    );
    viseBase.position.set(0, -0.205, 0);
    const viseSubTrim = new THREE.Mesh(
      createChamferedBlockGeometry(0.78, 0.008, 0.26, 0.008, 0.003, 0.004, 0.003),
      chromeRimMat
    );
    viseSubTrim.position.set(0, -0.220, 0);
    const viseMatInlay = new THREE.Mesh(roundedBox(0.68, 0.004, 0.19, 0.0015, 1), viseMatteMat);
    viseMatInlay.position.set(0, -0.191, 0);

    // Dual T-slot guide rails & central lead screw + knurled stainless adjustment knobs
    for (const tz of [-0.048, 0.048]) {
      const rail = new THREE.Mesh(roundedBox(0.66, 0.006, 0.016, 0.0015, 1), chromeRimMat);
      rail.position.set(0, -0.188, tz);
      this.lobbyWeaponInspectGroup.add(rail);
    }
    const leadScrew = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.52, 14), viseSteelMat);
    leadScrew.rotation.z = Math.PI / 2;
    leadScrew.position.set(0, -0.168, 0);
    const apronPlate = new THREE.Mesh(roundedBox(0.16, 0.012, 0.006, 0.001, 1), viseBadgeMat);
    apronPlate.position.set(0, -0.204, 0.126);

    // Front & rear CNC anodized vise stanchions with polymer V-cradle jaws
    for (const side of [-1, 1]) {
      const stanchion = new THREE.Mesh(
        createChamferedBlockGeometry(0.048, 0.068, 0.096, 0.008, 0.006, 0.004, 0.004),
        chromeRimMat
      );
      stanchion.position.set(side * 0.185, -0.158, 0);
      const jawL = new THREE.Mesh(roundedBox(0.038, 0.022, 0.016, 0.003, 1), viseMatteMat);
      jawL.position.set(side * 0.185, -0.120, -0.024);
      jawL.rotation.x = 0.26;
      const jawR = new THREE.Mesh(roundedBox(0.038, 0.022, 0.016, 0.003, 1), viseMatteMat);
      jawR.position.set(side * 0.185, -0.120, 0.024);
      jawR.rotation.x = -0.26;
      const handKnob = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.014, 16), viseSteelMat);
      handKnob.rotation.z = Math.PI / 2;
      handKnob.position.set(side * 0.258, -0.168, 0);
      this.lobbyWeaponInspectGroup.add(stanchion, jawL, jawR, handKnob);
    }
    this.lobbyWeaponInspectGroup.add(viseBase, viseSubTrim, viseMatInlay, leadScrew, apronPlate);
    this.lobbyWeaponInspectGroup.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = false;
        c.receiveShadow = false;
      }
    });

    this.lobbyWeaponInspectSpin = new THREE.Group();
    this.lobbyWeaponInspectGroup.add(this.lobbyWeaponInspectSpin);
    this.lobbyWeaponInspectMesh = null;

    // Pre-warm all 11 third-person weapon templates in TP_WEAPON_TEMPLATE_CACHE during lobby setup
    for (const wId of WEAPON_ORDER) {
      getThirdPersonWeaponTemplate(wId);
    }

    this.lobbyOperatorColor = 0xe5a024;
    this.lobbyOperator = this.createRemotePlayerMesh(
      {
        id: 'lobby_showcase',
        name: 'STRIKER',
        color: this.lobbyOperatorColor,
        weapon: this.currentWeapon || 'rifle',
        x: 0,
        y: 0,
        z: 0
      },
      { isShowcase: true }
    );
    this.lobbyOperatorYaw = -0.26;
    if (this.lobbyOperator?.group) {
      this.lobbyOperator.group.position.set(0, 0.012, 0);
      this.lobbyOperator.group.rotation.y = Math.PI + this.lobbyOperatorYaw;
      this.lobbyShowcaseGroup.add(this.lobbyOperator.group);
    }

    // Pre-warm all remaining operator variants (v2_goggles, v3_ghost, v4_recon) and swatches into RIG_GEO_CACHE / RIG_MAT_CACHE
    // at lobby setup so remote players joining mid-match never trigger geometry merging, outline inflation, or material version bumps.
    for (const warmColor of [0xef4444, 0x94a3b8, 0x4b5320, 0x38bdf8]) {
      const warmRig = createRemotePlayerMesh(
        { id: 'warmup_rig', color: warmColor, weapon: 'rifle' },
        { isShowcase: true }
      );
      warmRig.setOperatorColor?.(warmColor);
      warmRig.dispose?.();
      disposeObject3D(warmRig.group);
    }
    applyMetalnessCap(RIG_MAT_CACHE, this.quality?.envMapSize === 0 ? 0.35 : null);

    this.lobbyAutoRotate = true;
    this.lobbyPosterPose = true;
    this.lobbyCrouching = false;
    this.lobbyWalkDemo = false;
    this.lobbyTestShotAt = 0;

    this._rebuildLobbyWeaponInspectMesh(this.currentWeapon || 'rifle');
    this.setLobbyCameraMode('harbor');
  }

  _rebuildLobbyWeaponInspectMesh(weaponId) {
    if (!this.lobbyWeaponInspectSpin || !WEAPONS[weaponId]) return;
    const token = (this._lobbyInspectToken = (this._lobbyInspectToken || 0) + 1);
    if (this.lobbyWeaponInspectMesh) {
      this.lobbyWeaponInspectSpin.remove(this.lobbyWeaponInspectMesh);
      disposeObject3D(this.lobbyWeaponInspectMesh);
      this.lobbyWeaponInspectMesh = null;
    }
    const wMesh = this.createShowcaseWeaponMesh(weaponId);
    wMesh.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = false;
        child.receiveShadow = false;
      }
    });
    const box = measureWeaponGroup(wMesh);
    const sizeX = Math.max(0.08, box.max.x - box.min.x);
    const sizeY = Math.max(0.08, box.max.y - box.min.y);
    const sizeZ = Math.max(0.12, box.max.z - box.min.z);
    const longest = Math.max(sizeX, sizeY, sizeZ);
    const targetSpan = longest < 0.45 ? 0.56 : 0.92;
    const scale = Math.max(0.75, Math.min(2.1, targetSpan / longest));
    const cx = (box.min.x + box.max.x) * 0.5;
    const cy = (box.min.y + box.max.y) * 0.5;
    const cz = (box.min.z + box.max.z) * 0.5;

    const holder = new THREE.Group();
    wMesh.scale.setScalar(scale);
    wMesh.position.set(-cx * scale, -cy * scale + 0.02, -cz * scale);
    holder.add(wMesh);
    holder.userData.weaponMesh = wMesh;
    this.lobbyWeaponInspectMesh = holder;
    this.lobbyWeaponInspectSpin.add(holder);

    if (this.assetsEnabled && canUseCs2WeaponGlb() && isCs2WeaponSupported(weaponId)) {
      void createCs2WorldWeaponMesh(weaponId, this.assets, this.scene?.environment || null, {
        castShadow: false,
        receiveShadow: false
      })
        .then((cs2Mesh) => {
          if (!cs2Mesh || token !== this._lobbyInspectToken || !this.lobbyWeaponInspectSpin) return;
          cs2Mesh.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = false;
              child.receiveShadow = false;
            }
          });
          if (this.quality?.envMapSize === 0) {
            applyMetalnessCap(cs2Mesh, 0.35);
          }
          const latestEnv = this.scene?.environment || null;
          refreshCs2WeaponEnvMap(cs2Mesh, latestEnv);
          cs2Mesh.userData._boundEnvMap = latestEnv;

          cs2Mesh.updateMatrixWorld(true);
          const solidBox = new THREE.Box3();
          cs2Mesh.traverse((child) => {
            if (child.isMesh && !child.userData?.isMuzzleFlash) {
              solidBox.expandByObject(child);
            }
          });
          if (solidBox.isEmpty()) solidBox.copy(measureWeaponGroup(cs2Mesh));

          const sx = Math.max(0.08, solidBox.max.x - solidBox.min.x);
          const sy = Math.max(0.08, solidBox.max.y - solidBox.min.y);
          const sz = Math.max(0.12, solidBox.max.z - solidBox.min.z);
          const maxDim = Math.max(sx, sy, sz);
          const span = maxDim < 0.45 ? 0.54 : 0.92;
          const scl = Math.max(0.75, Math.min(2.1, span / maxDim));
          const mcx = (solidBox.min.x + solidBox.max.x) * 0.5;
          const mcy = (solidBox.min.y + solidBox.max.y) * 0.5;
          const mcz = (solidBox.min.z + solidBox.max.z) * 0.5;

          if (this.lobbyWeaponInspectMesh) {
            this.lobbyWeaponInspectSpin.remove(this.lobbyWeaponInspectMesh);
            disposeObject3D(this.lobbyWeaponInspectMesh);
            this.lobbyWeaponInspectMesh = null;
          }
          const cs2Holder = new THREE.Group();
          cs2Mesh.scale.setScalar(scl);
          cs2Mesh.position.set(-mcx * scl, -mcy * scl - 0.055, -mcz * scl);
          cs2Holder.add(cs2Mesh);
          cs2Holder.userData.weaponMesh = cs2Mesh;
          this.lobbyWeaponInspectMesh = cs2Holder;
          this.lobbyWeaponInspectSpin.add(cs2Holder);
        })
        .catch(() => {});
    }
  }

  setLobbyCameraMode(mode = 'harbor') {
    const valid = mode === 'weapon' || mode === 'operator' ? mode : 'harbor';
    this.lobbyCameraMode = valid;
    if (!this.lobbyShowcaseGroup) return valid;
    if (valid === 'harbor') {
      this.lobbyShowcaseGroup.visible = false;
    } else if (valid === 'weapon') {
      this.lobbyShowcaseGroup.visible = true;
      if (this.lobbyOperator?.group) this.lobbyOperator.group.visible = false;
      if (this.lobbyPedestalGroup) this.lobbyPedestalGroup.visible = false;
      if (this.lobbyWeaponInspectGroup) this.lobbyWeaponInspectGroup.visible = true;
    } else {
      this.lobbyShowcaseGroup.visible = true;
      if (this.lobbyOperator?.group) this.lobbyOperator.group.visible = true;
      if (this.lobbyPedestalGroup) this.lobbyPedestalGroup.visible = true;
      if (this.lobbyWeaponInspectGroup) this.lobbyWeaponInspectGroup.visible = false;
    }
    return valid;
  }

  setLobbyWeapon(weaponId) {
    if (!WEAPONS[weaponId] || !this.lobbyOperator) return;
    const op = this.lobbyOperator;
    if (op.currentWeapon !== weaponId) {
      if (typeof op.setWeapon === 'function') {
        op.setWeapon(weaponId);
        op.gunMesh?.traverse?.((c) => {
          if (c.isMesh) c.castShadow = false;
        });
      } else if (op.gunHolder) {
        op.currentWeapon = weaponId;
        if (op.gunMesh) {
          op.gunHolder.remove(op.gunMesh);
          disposeObject3D(op.gunMesh);
        }
        op.gunMesh = this.createShowcaseWeaponMesh(weaponId);
        op.gunMesh.traverse((c) => {
          if (c.isMesh) c.castShadow = false;
        });
        op.gunHolder.add(op.gunMesh);
        op.poseForWeapon?.(weaponId);
      } else {
        op.currentWeapon = weaponId;
      }
      this._rebuildLobbyWeaponInspectMesh(weaponId);
    } else if (!this.lobbyWeaponInspectMesh) {
      this._rebuildLobbyWeaponInspectMesh(weaponId);
    }
    if (op.armPivot) {
      op.armPivot.rotation.x = -0.22;
    }
    this.callbacks.onWeaponSwitchSound?.();
  }

  setLobbyOperatorColor(colorHex) {
    this.lobbyOperatorColor = colorHex;
    const nextVariant = resolveCryzenVariantFromColor(colorHex);
    if (
      this.lobbyOperator &&
      this.lobbyShowcaseGroup &&
      !this.lobbyOperator._soldierAttached &&
      this.lobbyOperator.demoVariant !== nextVariant
    ) {
      const activeWeapon = this.lobbyOperator.currentWeapon || this.currentWeapon || 'rifle';
      this.lobbyShowcaseGroup.remove(this.lobbyOperator.group);
      this.lobbyOperator.dispose?.();
      disposeObject3D(this.lobbyOperator.group);
      this.lobbyOperator = this.createRemotePlayerMesh(
        {
          id: 'lobby_showcase',
          name: 'STRIKER',
          color: colorHex,
          weapon: activeWeapon,
          x: 0,
          y: 0,
          z: 0
        },
        { isShowcase: true, demoVariant: nextVariant }
      );
      this.lobbyOperator.crouching = Boolean(this.lobbyCrouching);
      if (this.lobbyOperator?.group) {
        this.lobbyOperator.group.position.set(0, 0.012, 0);
        this.lobbyOperator.group.rotation.y = Math.PI + (this.lobbyOperatorYaw || 0);
        this.lobbyOperator.group.visible = this.lobbyCameraMode === 'operator';
        this.lobbyShowcaseGroup.add(this.lobbyOperator.group);
      }
      applyMetalnessCap(RIG_MAT_CACHE, this.quality?.envMapSize === 0 ? 0.35 : null);
    } else if (this.lobbyOperator?.setOperatorColor) {
      this.lobbyOperator.setOperatorColor(colorHex);
    }
    if (this.lobbyRimLight) {
      this.lobbyRimLight.color.setHex(colorHex).offsetHSL(0, -0.12, 0.16);
    }
    if (this.lobbyPedestalGlowMat) this.lobbyPedestalGlowMat.color.setHex(colorHex);
    if (this.lobbyHoloConeMat) this.lobbyHoloConeMat.color.setHex(colorHex);
  }

  toggleLobbyPosterPose(forceState = null) {
    this.lobbyPosterPose = forceState !== null ? Boolean(forceState) : !this.lobbyPosterPose;
    if (!this.lobbyPosterPose && this.lobbyOperator) {
      this.lobbyOperator.poseForWeapon?.(this.lobbyOperator.currentWeapon || 'rifle');
    }
    return this.lobbyPosterPose;
  }

  toggleLobbyCrouch(forceState = null) {
    this.lobbyCrouching = forceState !== null ? Boolean(forceState) : !this.lobbyCrouching;
    if (this.lobbyOperator) {
      this.lobbyOperator.crouching = this.lobbyCrouching;
    }
    return this.lobbyCrouching;
  }

  toggleLobbyWalk(forceState = null) {
    this.lobbyWalkDemo = forceState !== null ? Boolean(forceState) : !this.lobbyWalkDemo;
    return this.lobbyWalkDemo;
  }

  triggerLobbyTestFire() {
    if (!this.lobbyOperator) return;
    const now = performance.now();
    this.lobbyTestShotAt = now;
    this.lobbyOperator.lastShotFlashAt = now;
    if (this.lobbyOperator.gunMesh?.userData?.flashMesh) {
      this.lobbyOperator.gunMesh.userData.flashMesh.visible = true;
    }
    const inspectWep = this.lobbyWeaponInspectMesh?.userData?.weaponMesh;
    if (inspectWep?.userData?.flashMesh) {
      inspectWep.userData.flashMesh.visible = true;
    }
    if (this.lobbyOperator.armPivot) {
      this.lobbyOperator.armPivot.rotation.x = 0.22;
    }
    if (this.lobbyOperator.upperBodyGroup) {
      this.lobbyOperator.upperBodyGroup.rotation.x = -0.09;
    }
  }

  rotateLobbyOperator(deltaYaw) {
    this.lobbyOperatorYaw += deltaYaw;
  }

  setLoadout(loadout = {}, activeWeapon = null) {
    if (loadout.primary && WEAPONS[loadout.primary]?.slot === 1) {
      this.loadout.primary = loadout.primary;
    }
    if (loadout.secondary && WEAPONS[loadout.secondary]?.slot === 2) {
      this.loadout.secondary = loadout.secondary;
    }
    if (loadout.melee && WEAPONS[loadout.melee]?.slot === 3) {
      this.loadout.melee = loadout.melee;
    }
    if (activeWeapon && WEAPONS[activeWeapon]) {
      this.switchWeapon(activeWeapon);
    }
  }

  switchSlot(slotNumber) {
    if (slotNumber === 1) this.switchWeapon(this.loadout.primary);
    else if (slotNumber === 2) this.switchWeapon(this.loadout.secondary);
    else if (slotNumber === 3) this.switchWeapon(this.loadout.melee);
  }

  switchWeapon(weaponId) {
    if (!WEAPONS[weaponId]) return;
    if (this.currentWeapon === weaponId && this.equipUntil === 0) return;

    const prevWeapon = this.currentWeapon;
    this.cancelGrenadeCooking();
    this.inspectUntil = 0;
    if (this.viewmodelRig && Math.abs(this.viewmodelRig.rotation.x) > Math.PI) {
      const twoPi = Math.PI * 2;
      this.viewmodelRig.rotation.x = ((((this.viewmodelRig.rotation.x + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
    }
    this.currentWeapon = weaponId;
    this.reloadingUntil = 0;
    this.nextShellAt = 0;
    this.pumpCycleUntil = 0;
    this.isAiming = false;
    this.adsToggleActive = false;
    this.currentBloom = 0;
    this.recoilShotIndex = 0;
    this.crosshairRecoilKick = 0;
    this.accumulatedRecoilPitch = 0;
    this.accumulatedRecoilYaw = 0;
    this.pendingRecoilPitch = 0;
    this.pendingRecoilYaw = 0;
    this.barrelHeat = 0;
    this.vmSpringImpulse?.('bump', 0.52);

    const cfg = WEAPONS[weaponId];
    this.equipDuration = cfg.equipMs || 220;
    this.equipUntil = performance.now() + this.equipDuration;

    for (const wId of WEAPON_ORDER) {
      const vm = this.viewmodelMeshes[wId];
      if (vm) {
        vm.visible = wId === weaponId;
        setWeaponAdsCulling(vm, false);
        if (vm.userData?.isCs2Glb) {
          resetCs2ViewmodelParts(vm);
        }
        if (vm.userData?.activeWeaponMesh) {
          vm.userData.activeWeaponMesh.rotation.set(0, 0, 0);
          if (vm.userData.knifePivotBasePos) {
            vm.userData.activeWeaponMesh.position.copy(vm.userData.knifePivotBasePos);
          }
        }
        if (vm.userData?.magMesh && vm.userData.magMesh.userData.basePos) {
          vm.userData.magMesh.position.copy(vm.userData.magMesh.userData.basePos);
        }
        if (vm.userData?.boltMesh && typeof vm.userData.boltMesh.userData.baseZ === 'number') {
          vm.userData.boltMesh.position.z = vm.userData.boltMesh.userData.baseZ;
        }
        if (vm.userData?.barrelHeatMesh && vm.userData?.barrelHeatMat) {
          vm.userData.barrelHeatMat.opacity = 0;
          vm.userData.barrelHeatMesh.visible = false;
        }
      }
    }
    this._ensureCs2ViewmodelLoaded?.(weaponId);

    if (prevWeapon !== weaponId) {
      this.callbacks.onWeaponSwitchSound?.();
    }
    this.callbacks.onAimChange?.(false, weaponId);
    this.callbacks.onWeaponChanged?.(
      weaponId,
      this.ammoByWeapon[weaponId],
      this.reserveAmmoByWeapon[weaponId] ?? cfg.reserveAmmo ?? cfg.magSize
    );
  }

  applySwappedWeapon(data) {
    if (!data || !data.weapon || !WEAPONS[data.weapon]) return;
    const wId = data.weapon;
    const cfg = WEAPONS[wId];
    this.loadout.primary = wId;
    this.ammoByWeapon[wId] = typeof data.ammo === 'number' ? data.ammo : cfg.magSize;
    this.reserveAmmoByWeapon[wId] = typeof data.reserveAmmo === 'number' ? data.reserveAmmo : (cfg.reserveAmmo ?? 0);
    this.currentWeapon = '';
    this.switchWeapon(wId);
  }

  startReload() {
    if (!this.inMatch || !this.alive) return;
    const cfg = WEAPONS[this.currentWeapon];
    if (!cfg || cfg.isMelee || cfg.infiniteAmmo) return;
    const now = performance.now();
    if (this.reloadingUntil > now) return;

    const currentAmmo = this.ammoByWeapon[this.currentWeapon];
    const reserveAmmo = this.reserveAmmoByWeapon[this.currentWeapon] ?? 0;
    if (currentAmmo >= cfg.magSize || reserveAmmo <= 0) return;

    if (this.pendingFire && !this.pendingFire.autoReloaded && !cfg.shellByShell) {
      if (this.pendingFire.ammoConsumed) {
        const pWep = this.pendingFire.weapon || this.currentWeapon;
        const pCfg = WEAPONS[pWep] || cfg;
        this.ammoByWeapon[pWep] = Math.min(pCfg.magSize, (this.ammoByWeapon[pWep] ?? 0) + 1);
      }
      this.pendingFire = null;
    }

    this.cancelGrenadeCooking();
    this.inspectUntil = 0;
    this.isAiming = false;
    this.adsToggleActive = false;
    setWeaponAdsCulling(this.viewmodelMeshes[this.currentWeapon], false);
    this.reloadStartedAt = now;

    if (cfg.shellByShell) {
      const missing = Math.max(1, Math.min(cfg.magSize - currentAmmo, reserveAmmo));
      const startDelay = cfg.shellReloadStartMs || 240;
      const shellMs = cfg.shellReloadMs || 390;
      this.reloadMode = 'shell';
      this.reloadDuration = startDelay + missing * shellMs;
      this.nextShellAt = now + startDelay + shellMs;
      this.reloadingUntil = now + this.reloadDuration;
    } else {
      const isTactical = currentAmmo > 0;
      this.reloadMode = isTactical ? 'tactical' : 'empty';
      this.reloadDuration = isTactical ? (cfg.tacticalReloadMs || cfg.reloadMs) : cfg.reloadMs;
      this.nextShellAt = 0;
      this.reloadingUntil = now + this.reloadDuration;
    }

    this.callbacks.onAimChange?.(false, this.currentWeapon);
    this.callbacks.onReloadStart?.(
      this.currentWeapon,
      this.reloadDuration,
      this.reloadMode,
      currentAmmo,
      reserveAmmo
    );
  }
}
