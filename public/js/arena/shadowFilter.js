// Adapted from StarKnightt/counter-strike-in-browser (MIT License, Copyright (c) 2026 StarKnightt)
import * as THREE from '../three.js';

let warnedAnchorMismatch = false;
const SOFTWARE_WEBGL_RE = /swiftshader|llvmpipe|softpipe|software|microsoft basic/i;

/**
 * Detects software WebGL rasterizers (SwiftShader, llvmpipe, Microsoft Basic Render Driver)
 * so heavy shadow filters and half-res SSAO/SMAA passes can fall back safely without GPU TDR/context loss.
 */
export function isSoftwareWebGLRenderer(renderer) {
  try {
    const gl = renderer?.getContext?.();
    if (!gl || typeof gl.getParameter !== 'function') return false;
    let unmasked = '';
    const ext = gl.getExtension?.('WEBGL_debug_renderer_info');
    if (ext && ext.UNMASKED_RENDERER_WEBGL != null) {
      unmasked = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    }
    const raw = String(gl.getParameter(gl.RENDERER) || '');
    return SOFTWARE_WEBGL_RE.test(`${unmasked} ${raw}`);
  } catch {
    return false;
  }
}

/**
 * Stable 4-tap fixed-orientation Vogel disk PCF (4x4 = 16 bilinear samples) + receiver-plane depth bias (Isidoro 2006)
 * adapted for Three.js r170 RGBA-packed `sampler2D` directional/spot shadow maps.
 *
 * Eliminates per-frame penumbra shimmer while strafing and removes grazing-angle self-shadow
 * acne without detaching contact shadows under crates, walls, and stairs.
 * Must run before any lit material compiles (e.g. `setupLights()` in `Game3D` constructor).
 * Append `?pcf=stock` to keep Three.js r170's built-in shadow filter for A/B comparison.
 */
export function installStablePCF({ taps = 4, maxSlope = 3.0, extent = 40, depthRange = 220 } = {}) {
  const chunk = THREE.ShaderChunk?.shadowmap_pars_fragment;
  if (!chunk || chunk.includes('vogelDiskFixed')) return false;

  try {
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('pcf') === 'stock') {
      return false;
    }
  } catch {
    // Non-browser / headless environment
  }

  // Verify exact Three.js r170 `getShadow( sampler2D shadowMap, ... )` anchor before patching
  const re =
    /float getShadow\(\s*sampler2D shadowMap,\s*vec2 shadowMapSize,\s*float shadowIntensity,\s*float shadowBias,\s*float shadowRadius,\s*vec4 shadowCoord\s*\)\s*\{[\s\S]*?return mix\(\s*1\.0,\s*shadow,\s*shadowIntensity\s*\);\s*\}/;
  if (!re.test(chunk)) {
    if (!warnedAnchorMismatch) {
      warnedAnchorMismatch = true;
      console.warn('[shadowFilter] Three.js r170 getShadow(sampler2D, ...) anchor not found — stock filtering kept');
    }
    return false;
  }

  const tapCount = Math.max(4, Math.min(16, Math.round(taps) || 4));
  const safeRange = Math.max(1, Number(depthRange) || 220);
  const safeExtent = Math.max(1, Number(extent) || 40);
  const safeSlope = Math.max(0.25, Number(maxSlope) || 3.0);
  // dz/duv clamp in normalized shadow-map units: tan(theta) * (frustumWidth / depthRange)
  const maxGrad = ((safeSlope * 2 * safeExtent) / safeRange).toFixed(4);

  // Fixed-orientation golden-angle Vogel disk literals (unit radius)
  const disk = Array.from({ length: tapCount }, (_, i) => {
    const r = Math.sqrt((i + 0.5) / tapCount);
    const th = i * 2.399963229728653 + 0.7;
    return `vec2( ${(Math.cos(th) * r).toFixed(5)}, ${(Math.sin(th) * r).toFixed(5)} )`;
  });

  THREE.ShaderChunk.shadowmap_pars_fragment = chunk.replace(
    re,
    /* glsl */ `
	// Fixed-orientation ${tapCount}-tap Vogel disk + receiver-plane depth bias (shadowFilter.js)
	const vec2 vogelDiskFixed[ ${tapCount} ] = vec2[ ${tapCount} ]( ${disk.join(', ')} );
	float slTexture2DShadowLerp( sampler2D depths, vec2 size, vec2 uv, float compare ) {
		vec2 texelSize = vec2( 1.0 ) / size;
		vec2 st = uv * size - 0.5;
		vec2 f = fract( st );
		vec2 baseUV = ( floor( st ) + 0.5 ) * texelSize;
		float lb = texture2DCompare( depths, baseUV, compare );
		float lt = texture2DCompare( depths, baseUV + vec2( 0.0, texelSize.y ), compare );
		float rb = texture2DCompare( depths, baseUV + vec2( texelSize.x, 0.0 ), compare );
		float rt = texture2DCompare( depths, baseUV + texelSize, compare );
		return mix( mix( lb, lt, f.y ), mix( rb, rt, f.y ), f.x );
	}
	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		float shadow = 1.0;
		shadowCoord.xyz /= shadowCoord.w;
		shadowCoord.z += shadowBias;
		// Evaluate screen-space derivatives outside non-uniform branch for clean frustum borders
		vec3 slShadowDx = dFdx( shadowCoord.xyz );
		vec3 slShadowDy = dFdy( shadowCoord.xyz );
		bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
		bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
		if ( frustumTest ) {
		#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			vec2 radius = max( 1.0, shadowRadius ) * texelSize;
			float det = slShadowDx.x * slShadowDy.y - slShadowDx.y * slShadowDy.x;
			vec2 dzduv = abs( det ) > 1e-14
				? vec2( slShadowDx.z * slShadowDy.y - slShadowDx.y * slShadowDy.z, slShadowDx.x * slShadowDy.z - slShadowDx.z * slShadowDy.x ) / det
				: vec2( 0.0 );
			dzduv = clamp( dzduv, vec2( -${maxGrad} ), vec2( ${maxGrad} ) );
			float slack = 0.5 * length( dzduv * texelSize );
			float acc = 0.0;
			for ( int i = 0; i < ${tapCount}; i ++ ) {
				vec2 o = vogelDiskFixed[ i ] * radius;
				float cmpZ = shadowCoord.z + dot( dzduv, o ) - slack;
				acc += slTexture2DShadowLerp( shadowMap, shadowMapSize, shadowCoord.xy + o, cmpZ );
			}
			shadow = acc / ${tapCount}.0;
		#elif defined( SHADOWMAP_TYPE_VSM )
			shadow = VSMShadow( shadowMap, shadowCoord.xy, shadowCoord.z );
		#else
			shadow = texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z );
		#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}`
  );

  return true;
}

export function isStablePCFInstalled() {
  return Boolean(THREE.ShaderChunk?.shadowmap_pars_fragment?.includes('vogelDiskFixed'));
}
