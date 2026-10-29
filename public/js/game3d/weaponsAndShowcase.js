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

    this.viewmodelKeyLight = new THREE.PointLight(0xfff4e6, 1.15, 3.0, 1.4);
    this.viewmodelKeyLight.position.set(0.22, 0.28, -0.25);
    this.camera.add(this.viewmodelKeyLight);

    this.muzzleLight = new THREE.PointLight(0xfef08a, 0, 10, 2);
    this.muzzleLight.position.set(0.24, -0.16, -1.30);
    this.camera.add(this.muzzleLight);

    this.viewmodelMeshes = {};
    for (const wId of WEAPON_ORDER) {
      const mesh = this.createWeaponMesh(wId, true);
      mesh.visible = wId === this.currentWeapon;
      this.viewmodelRig.add(mesh);
      this.viewmodelMeshes[wId] = mesh;
    }
    this.viewmodelRig.position.set(0.24, -0.21, -0.40);
  }

  setupLobbyShowcase() {
    this.lobbyShowcaseGroup = new THREE.Group();
    this.lobbyShowcaseGroup.position.set(0, -0.96, -2.62);
    this.camera.add(this.lobbyShowcaseGroup);

    this.lobbyKeyLight = new THREE.PointLight(0xfff7eb, 3.85, 8.5, 1.1);
    this.lobbyKeyLight.position.set(1.3, 2.3, 1.55);
    this.lobbyShowcaseGroup.add(this.lobbyKeyLight);

    this.lobbyRimLight = new THREE.PointLight(0xe5a024, 2.45, 7.2, 1.15);
    this.lobbyRimLight.position.set(-1.35, 1.85, -0.95);
    this.lobbyShowcaseGroup.add(this.lobbyRimLight);

    this.lobbyFillLight = new THREE.PointLight(0xe2e8f0, 2.35, 7.0, 1.2);
    this.lobbyFillLight.position.set(0.15, 0.95, 1.85);
    this.lobbyShowcaseGroup.add(this.lobbyFillLight);

    const pedGroup = new THREE.Group();
    const baseRingMat = new THREE.MeshStandardMaterial({
      color: 0x16191e,
      roughness: 0.42,
      metalness: 0.82
    });
    const chromeRimMat = new THREE.MeshStandardMaterial({
      color: 0x2c333d,
      roughness: 0.34,
      metalness: 0.88
    });
    this.lobbyPedestalGlowMat = new THREE.MeshBasicMaterial({
      color: 0xe5a024,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.78
    });
    this.lobbyHoloConeMat = new THREE.MeshBasicMaterial({
      color: 0xe5a024,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.045,
      depthWrite: false
    });

    const outerDeck = new THREE.Mesh(new THREE.CylinderGeometry(0.70, 0.80, 0.075, 24), baseRingMat);
    outerDeck.position.y = -0.038;
    const innerPad = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.60, 0.082, 24), chromeRimMat);
    innerPad.position.y = -0.026;
    this.lobbyHoloRingOuter = new THREE.Mesh(new THREE.RingGeometry(0.60, 0.65, 32), this.lobbyPedestalGlowMat);
    this.lobbyHoloRingOuter.rotation.x = -Math.PI / 2;
    this.lobbyHoloRingOuter.position.y = 0.017;
    this.lobbyHoloRingInner = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.41, 24), this.lobbyPedestalGlowMat);
    this.lobbyHoloRingInner.rotation.x = -Math.PI / 2;
    this.lobbyHoloRingInner.position.y = 0.019;
    const holoField = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.55, 0.36, 24, 1, true), this.lobbyHoloConeMat);
    holoField.position.y = 0.18;

    pedGroup.add(outerDeck, innerPad, this.lobbyHoloRingOuter, this.lobbyHoloRingInner, holoField);
    this.lobbyShowcaseGroup.add(pedGroup);

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
    this.lobbyShowcaseGroup.add(this.lobbyOperator.group);

    // Pre-warm all remaining operator variants (v2_goggles, v3_ghost, v4_recon) and swatches into RIG_GEO_CACHE / RIG_MAT_CACHE
    // at lobby setup so remote players joining mid-match never trigger geometry merging, outline inflation, or material version bumps.
    for (const warmColor of [0xef4444, 0x94a3b8, 0x4b5320, 0x38bdf8]) {
      const warmRig = createRemotePlayerMesh(
        { id: 'warmup_rig', color: warmColor, weapon: 'rifle' },
        { isShowcase: true }
      );
      warmRig.setOperatorColor?.(warmColor);
      disposeObject3D(warmRig.group);
    }
    applyMetalnessCap(RIG_MAT_CACHE, this.quality?.envMapSize === 0 ? 0.35 : null);

    this.lobbyOperatorYaw = -0.32;
    this.lobbyAutoRotate = true;
    this.lobbyPosterPose = true;
    this.lobbyCrouching = false;
    this.lobbyWalkDemo = false;
    this.lobbyTestShotAt = 0;
  }

  setLobbyWeapon(weaponId) {
    if (!WEAPONS[weaponId] || !this.lobbyOperator) return;
    const op = this.lobbyOperator;
    if (op.currentWeapon !== weaponId) {
      op.currentWeapon = weaponId;
      op.gunHolder.remove(op.gunMesh);
      disposeObject3D(op.gunMesh);
      op.gunMesh = this.createShowcaseWeaponMesh(weaponId);
      op.gunHolder.add(op.gunMesh);
      op.poseForWeapon?.(weaponId);
    }
    op.armPivot.rotation.x = -0.22;
    this.callbacks.onWeaponSwitchSound?.();
  }

  setLobbyOperatorColor(colorHex) {
    this.lobbyOperatorColor = colorHex;
    const nextVariant = resolveCryzenVariantFromColor(colorHex);
    if (this.lobbyOperator && this.lobbyShowcaseGroup && this.lobbyOperator.demoVariant !== nextVariant) {
      const activeWeapon = this.lobbyOperator.currentWeapon || this.currentWeapon || 'rifle';
      this.lobbyShowcaseGroup.remove(this.lobbyOperator.group);
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
      this.lobbyOperator.group.rotation.y = Math.PI + (this.lobbyOperatorYaw || 0);
      this.lobbyShowcaseGroup.add(this.lobbyOperator.group);
      applyMetalnessCap(RIG_MAT_CACHE, this.quality?.envMapSize === 0 ? 0.35 : null);
    } else if (this.lobbyOperator?.setOperatorColor) {
      this.lobbyOperator.setOperatorColor(colorHex);
    }
    if (this.lobbyRimLight) this.lobbyRimLight.color.setHex(colorHex);
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
    this.lobbyOperator.armPivot.rotation.x = 0.22;
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

    const cfg = WEAPONS[weaponId];
    this.equipDuration = cfg.equipMs || 220;
    this.equipUntil = performance.now() + this.equipDuration;

    for (const wId of WEAPON_ORDER) {
      const vm = this.viewmodelMeshes[wId];
      if (vm) {
        vm.visible = wId === weaponId;
        setWeaponAdsCulling(vm, false);
        if (vm.userData?.magMesh && vm.userData.magMesh.userData.basePos) {
          vm.userData.magMesh.position.copy(vm.userData.magMesh.userData.basePos);
        }
        if (vm.userData?.boltMesh && typeof vm.userData.boltMesh.userData.baseZ === 'number') {
          vm.userData.boltMesh.position.z = vm.userData.boltMesh.userData.baseZ;
        }
      }
    }

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
