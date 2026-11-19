import * as THREE from '../three.js';
import { isSoftwareWebGLRenderer } from '../arena/shadowFilter.js';

/**
 * Unified WebGL2 post-processing pipeline powered by pmndrs/postprocessing + N8AO.
 * Pipeline order:
 *   1. RenderPass (Single linear HDR world render on Layer 0 + shared depth texture)
 *   2. N8AOPostPass (Half-res Performance SSAO on High tier only, disabled automatically on low FPS)
 *   3. EffectPass (SMAA Low on High tier only + MipmapBlur Bloom + AgX ToneMapping + Clarity Contrast + Subtle Vignette)
 * Note: Layer-1 viewmodel rendering runs separately after composer.render() using depth clear.
 */
export class PostProcessPipeline {
  constructor(game) {
    this.game = game;
    this.composer = null;
    this.renderPass = null;
    this.aoPass = null;
    this.effectPass = null;
    this.bloomEffect = null;
    this.smaaEffect = null;
    this.toneMappingEffect = null;
    this.gradeEffect = null;
    this.vignetteEffect = null;
    this.ready = false;
    this._initPromise = null;
    this._disposed = false;
    this._aoDisabledByWatchdog = false;
    this._smaaDisabledByWatchdog = false;
    this._postDisabledByWatchdog = false;
    this._smaaActiveInPass = false;
    this._width = 1280;
    this._height = 720;
    this._pixelRatio = 1;

    const cfg = this._resolvePostConfig();
    this.enabled = cfg.enabled;
    this.aoEnabled = cfg.aoEnabled;
    this.smaaEnabled = cfg.smaaEnabled;
  }

  _canUsePostFx() {
    const renderer = this.game?.renderer;
    return Boolean(
      !this._disposed &&
        renderer?.isWebGLRenderer &&
        !renderer.__fakeGL &&
        typeof window !== 'undefined' &&
        typeof document !== 'undefined' &&
        typeof WebGL2RenderingContext !== 'undefined'
    );
  }

  _resolvePostConfig(q = this.game?.quality) {
    const tier = this.game?.tier || 'medium';
    const postFx = q?.postFx ?? (tier !== 'low' ? 1 : 0);
    const bloomStrength = q?.bloomStrength ?? (tier === 'high' ? 0.28 : tier === 'medium' ? 0.18 : 0);
    const isSoftwareGl = isSoftwareWebGLRenderer(this.game?.renderer);
    const aoRaw = isSoftwareGl ? 0 : (q?.aoEnabled ?? (tier === 'high' ? 1 : 0));
    const smaaRaw = isSoftwareGl ? 0 : (q?.smaaEnabled ?? (tier === 'high' ? 1 : 0));
    return {
      enabled: Number(postFx) > 0,
      bloomStrength: Math.max(0, Number(bloomStrength) || 0),
      aoEnabled: Number(aoRaw) > 0,
      smaaEnabled: Number(smaaRaw) > 0,
      isSoftwareGl
    };
  }

  async init() {
    const cfg = this._resolvePostConfig();
    this.enabled = cfg.enabled && !this._postDisabledByWatchdog;
    this.aoEnabled = cfg.aoEnabled && !this._aoDisabledByWatchdog;
    this.smaaEnabled = cfg.smaaEnabled && !this._smaaDisabledByWatchdog;
    if (!this._canUsePostFx()) return false;
    if (this.ready) return true;
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      try {
        const isSoftwareGl = isSoftwareWebGLRenderer(this.game?.renderer);
        const [ppMod, n8aoMod] = await Promise.all([
          import('postprocessing'),
          isSoftwareGl ? Promise.resolve(null) : import('n8ao')
        ]);
        const {
          EffectComposer,
          RenderPass,
          EffectPass,
          BloomEffect,
          BrightnessContrastEffect,
          VignetteEffect,
          ToneMappingEffect,
          ToneMappingMode,
          SMAAEffect,
          SMAAPreset
        } = ppMod;
        const N8AOPostPass = n8aoMod?.N8AOPostPass || null;

        if (!this._canUsePostFx()) return false;

        const renderer = this.game.renderer;
        const width = Math.max(1, window.innerWidth || renderer.domElement?.clientWidth || 1280);
        const height = Math.max(1, window.innerHeight || renderer.domElement?.clientHeight || 720);
        const pr = Math.max(0.5, this.game?.currentPixelRatio || renderer.getPixelRatio?.() || 1);
        this._width = width;
        this._height = height;
        this._pixelRatio = pr;

        renderer.setPixelRatio?.(pr);

        const isWebGL2 = Boolean(renderer.capabilities?.isWebGL2);
        const hasHalfFloat = Boolean(
          isWebGL2 ||
            renderer.extensions?.has?.('EXT_color_buffer_float') ||
            renderer.extensions?.has?.('EXT_color_buffer_half_float')
        );
        const frameBufferType = hasHalfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;

        const composer = new EffectComposer(renderer, {
          frameBufferType,
          multisampling: 0
        });

        const drawSize = renderer.getDrawingBufferSize
          ? renderer.getDrawingBufferSize(new THREE.Vector2())
          : new THREE.Vector2(Math.round(width * pr), Math.round(height * pr));
        const drawW = Math.max(1, Math.floor(drawSize.x || width * pr));
        const drawH = Math.max(1, Math.floor(drawSize.y || height * pr));

        const renderPass = new RenderPass(this.game.scene, this.game.camera);

        let aoPass = null;
        if (!isSoftwareGl && N8AOPostPass) {
          aoPass = new N8AOPostPass(this.game.scene, this.game.camera, drawW, drawH);
          aoPass.setQualityMode('Performance');
          aoPass.configuration.halfRes = true;
          aoPass.configuration.aoRadius = 1.25;
          aoPass.configuration.intensity = 1.55;
          aoPass.configuration.distanceFalloff = 0.85;
          aoPass.configuration.color.setHex(0x141a24);
          aoPass.configuration.gammaCorrection = false;
          aoPass.autosetGamma = false;
          aoPass.autoDetectTransparency = false;
          aoPass.configuration.transparencyAware = false;
        }

        const latestCfg = this._resolvePostConfig();
        this.enabled = latestCfg.enabled && !this._postDisabledByWatchdog;
        this.aoEnabled = Boolean(aoPass) && latestCfg.aoEnabled && !this._aoDisabledByWatchdog;
        this.smaaEnabled = !isSoftwareGl && latestCfg.smaaEnabled && !this._smaaDisabledByWatchdog;
        if (aoPass) {
          aoPass.enabled = Boolean(this.enabled && this.aoEnabled);
        }

        const smaaEffect = isSoftwareGl ? null : new SMAAEffect({ preset: SMAAPreset.LOW });
        const bloomEffect = new BloomEffect({
          mipmapBlur: true,
          luminanceThreshold: 1.35,
          luminanceSmoothing: 0.28,
          intensity: latestCfg.bloomStrength,
          radius: 0.48
        });
        const toneMappingEffect = new ToneMappingEffect({
          mode: ToneMappingMode.AGX
        });
        const gradeEffect = new BrightnessContrastEffect({
          brightness: 0.005,
          contrast: 0.06
        });
        const vignetteEffect = new VignetteEffect({
          offset: 0.42,
          darkness: 0.26
        });

        this._smaaActiveInPass = Boolean(this.smaaEnabled && smaaEffect);
        const effectPass = new EffectPass(
          this.game.camera,
          ...(this._smaaActiveInPass
            ? [smaaEffect, bloomEffect, toneMappingEffect, gradeEffect, vignetteEffect]
            : [bloomEffect, toneMappingEffect, gradeEffect, vignetteEffect])
        );

        composer.addPass(renderPass);
        if (aoPass) composer.addPass(aoPass);
        composer.addPass(effectPass);
        if (smaaEffect && !this._smaaActiveInPass) {
          const alpha = Boolean(renderer.getContext?.()?.getContextAttributes?.()?.alpha);
          smaaEffect.initialize?.(renderer, alpha, frameBufferType);
          smaaEffect.setSize?.(drawW, drawH);
        }
        composer.setSize(width, height, false);

        if (!this.enabled) {
          renderer.autoClear = true;
        }

        this.composer = composer;
        this.renderPass = renderPass;
        this.aoPass = aoPass;
        this.effectPass = effectPass;
        this.smaaEffect = smaaEffect;
        this.bloomEffect = bloomEffect;
        this.toneMappingEffect = toneMappingEffect;
        this.gradeEffect = gradeEffect;
        this.vignetteEffect = vignetteEffect;
        this.ready = true;
        return true;
      } catch {
        this.ready = false;
        return false;
      } finally {
        this._initPromise = null;
      }
    })();

    return this._initPromise;
  }

  setAOEnabled(flag, { fromWatchdog = false } = {}) {
    const next = Boolean(flag);
    this.aoEnabled = next;
    if (fromWatchdog && !next) {
      this._aoDisabledByWatchdog = true;
    } else if (next) {
      this._aoDisabledByWatchdog = false;
    }
    if (this.aoPass) {
      this.aoPass.enabled = Boolean(this.enabled && this.aoEnabled);
    }
    return this.aoEnabled;
  }

  _syncEffectPassSMAA() {
    if (!this.effectPass || !this.bloomEffect || !this.toneMappingEffect || !this.gradeEffect || !this.vignetteEffect) {
      return;
    }
    const wantSmaa = Boolean(this.smaaEnabled && this.smaaEffect);
    if (wantSmaa === this._smaaActiveInPass) return;
    this._smaaActiveInPass = wantSmaa;
    const effects = wantSmaa
      ? [this.smaaEffect, this.bloomEffect, this.toneMappingEffect, this.gradeEffect, this.vignetteEffect]
      : [this.bloomEffect, this.toneMappingEffect, this.gradeEffect, this.vignetteEffect];
    this.effectPass.setEffects(effects);
    this.effectPass.recompile();
    if (this.composer?.stableDepthTexture) {
      this.effectPass.setDepthTexture?.(this.composer.stableDepthTexture);
    }
    if (this.composer && typeof window !== 'undefined') {
      this.setSize(window.innerWidth || this._width, window.innerHeight || this._height, this.game?.currentPixelRatio);
    }
  }

  setSMAAEnabled(flag, { fromWatchdog = false } = {}) {
    const next = Boolean(flag);
    this.smaaEnabled = next;
    if (fromWatchdog && !next) {
      this._smaaDisabledByWatchdog = true;
    } else if (next) {
      this._smaaDisabledByWatchdog = false;
    }
    this._syncEffectPassSMAA();
    return this.smaaEnabled;
  }

  setPostEnabled(flag, { fromWatchdog = false } = {}) {
    const next = Boolean(flag);
    this.enabled = next;
    if (fromWatchdog && !next) {
      this._postDisabledByWatchdog = true;
    } else if (next) {
      this._postDisabledByWatchdog = false;
    }
    if (!this.enabled && this.game?.renderer) {
      this.game.renderer.autoClear = true;
    }
    if (this.enabled && !this.ready && !this._initPromise && this._canUsePostFx()) {
      this.init();
    }
    return this.enabled;
  }

  applyQuality(q = this.game?.quality, { preserveWatchdog = false } = {}) {
    if (!preserveWatchdog) {
      this._aoDisabledByWatchdog = false;
      this._smaaDisabledByWatchdog = false;
      this._postDisabledByWatchdog = false;
    }
    const cfg = this._resolvePostConfig(q);
    this.enabled = cfg.enabled && !this._postDisabledByWatchdog;
    this.aoEnabled = cfg.aoEnabled && !this._aoDisabledByWatchdog;
    this.smaaEnabled = cfg.smaaEnabled && !this._smaaDisabledByWatchdog;

    if (this.bloomEffect) {
      this.bloomEffect.intensity = cfg.bloomStrength;
    }
    if (this.aoPass) {
      this.aoPass.enabled = Boolean(this.enabled && this.aoEnabled);
    }
    this._syncEffectPassSMAA();
    if (!this.enabled && this.game?.renderer) {
      this.game.renderer.autoClear = true;
    }
    if (this.enabled && !this.ready && !this._initPromise && this._canUsePostFx()) {
      this.init();
    }
    if (this.ready && typeof window !== 'undefined') {
      this.setSize(window.innerWidth, window.innerHeight, this.game?.currentPixelRatio);
    }
  }

  setSize(w, h, pr = this.game?.currentPixelRatio) {
    const width = Math.max(1, Number(w) || 1280);
    const height = Math.max(1, Number(h) || 720);
    const pixelRatio = Math.max(0.5, Number(pr) || 1);
    this._width = width;
    this._height = height;
    this._pixelRatio = pixelRatio;

    if (this.composer && this.game?.renderer) {
      this.game.renderer.setPixelRatio?.(pixelRatio);
      this.composer.setSize(width, height, false);
    }
  }

  isActive() {
    const cfg = this._resolvePostConfig();
    return Boolean(this.ready && this.composer && this.enabled && cfg.enabled && this._canUsePostFx());
  }

  render() {
    if (!this.isActive()) return false;
    const renderer = this.game.renderer;
    try {
      if (this.game.scene) {
        this.composer.setMainScene(this.game.scene);
        if (this.aoPass) this.aoPass.scene = this.game.scene;
      }
      if (this.game.camera) {
        this.composer.setMainCamera(this.game.camera);
        if (this.aoPass) this.aoPass.camera = this.game.camera;
      }

      // Render world into Linear HDR target without double tone-mapping;
      // ToneMappingEffect applies AgX inside EffectPass, and Layer-1 viewmodel uses prevToneMapping afterward.
      const prevToneMapping = renderer.toneMapping;
      renderer.toneMapping = THREE.NoToneMapping;
      try {
        this.composer.render();
      } finally {
        renderer.toneMapping = prevToneMapping;
      }
      return true;
    } catch {
      this.enabled = false;
      if (renderer) renderer.autoClear = true;
      return false;
    }
  }

  dispose() {
    this._disposed = true;
    this.ready = false;
    this.enabled = false;
    this.aoEnabled = false;

    if (this.aoPass) {
      const helperProps = [
        'effectShaderQuad',
        'poissonBlurQuad',
        'effectCompositerQuad',
        'depthDownsampleQuad',
        'accumulationQuad',
        'copyQuad',
        'depthCopyPass',
        'depthMipAtlas'
      ];
      for (const prop of helperProps) {
        this.aoPass[prop]?.dispose?.();
      }
      this.aoPass.standardDenoiseMaterial?.dispose?.();
      this.aoPass.neuralDenoiseMaterial?.dispose?.();
      this.aoPass.standardCompositerMaterial?.dispose?.();
      this.aoPass.neuralCompositerMaterial?.dispose?.();
    }

    this.renderPass?.dispose?.();
    this.aoPass?.dispose?.();
    this.smaaEffect?.dispose?.();
    this.effectPass?.dispose?.();
    this.composer?.dispose?.();

    if (this.game?.renderer) {
      this.game.renderer.autoClear = true;
    }

    this.composer = null;
    this.renderPass = null;
    this.aoPass = null;
    this.effectPass = null;
    this.bloomEffect = null;
    this.smaaEffect = null;
    this.toneMappingEffect = null;
    this.gradeEffect = null;
    this.vignetteEffect = null;
  }
}
