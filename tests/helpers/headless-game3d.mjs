// Headless Game3D harness for Node tests: custom ESM hooks (three.js / ../shared / ../server specifiers used by the
// browser modules), minimal window / document / canvas mocks and a deterministic fake WebGLRenderer.
// Importing this module installs the globals; import Game3D only through `loadGame3D()` afterwards.

import { register } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..');

// Register custom ESM resolve & load hooks so browser modules in `public/js/` that import
// `../vendor/three/three.module.js`, `../shared/*`, or `../server/*` resolve cleanly in Node,
// and `THREE.WebGLRenderer` uses a deterministic headless implementation.
const rootUrl = pathToFileURL(ROOT_DIR + '/').href;
const loaderCode = `
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  if (specifier === '../vendor/three/three.module.js' || specifier === './vendor/three/three.module.js') {
    return nextResolve(new URL('node_modules/three/build/three.module.js', ${JSON.stringify(rootUrl)}).href, context);
  }
  if (context.parentURL && context.parentURL.includes('/public/js/')) {
    if (specifier.startsWith('../shared/')) {
      const rel = specifier.slice('../'.length);
      return nextResolve(new URL(rel, ${JSON.stringify(rootUrl)}).href, context);
    }
    if (specifier.startsWith('../server/')) {
      const rel = specifier.slice('../'.length);
      return nextResolve(new URL(rel, ${JSON.stringify(rootUrl)}).href, context);
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('node_modules/three/build/three.module.js')) {
    const filePath = fileURLToPath(url);
    const src = fs.readFileSync(filePath, 'utf8');
    const patched = src.replace(
      'WebGLRenderer,',
      '_HeadlessWebGLRenderer as WebGLRenderer,'
    ) + '\\nconst _HeadlessWebGLRenderer = globalThis.__HeadlessWebGLRenderer || WebGLRenderer;\\n';
    return {
      format: 'module',
      shortCircuit: true,
      source: patched,
    };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(loaderCode)}`);

// Setup lightweight DOM / Window / Canvas / WebGLRenderer mocks for headless Node testing of 3D & UI modules
function createMockCanvasContext() {
  const noop = () => {};
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    shadowColor: '',
    shadowBlur: 0,
    globalAlpha: 1,
    fillRect: noop,
    clearRect: noop,
    strokeRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    ellipse: noop,
    fill: noop,
    stroke: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    drawImage: noop,
    fillText: noop,
    strokeText: noop,
    measureText: (text) => ({ width: String(text).length * 8 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    putImageData: noop,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  };
}

function createMockCanvas(width = 256, height = 256) {
  const ctx = createMockCanvasContext();
  const canvas = {
    width,
    height,
    style: {},
    getContext: () => ctx,
    toDataURL: () => 'data:image/png;base64,',
    addEventListener: () => {},
    removeEventListener: () => {},
    requestPointerLock: () => {
      if (globalThis.document) {
        globalThis.document.pointerLockElement = canvas;
        globalThis.document.dispatchEvent({ type: 'pointerlockchange' });
      }
    },
  };
  return canvas;
}

const windowListeners = new Map();
const documentListeners = new Map();
const mockDomElements = new Map();

globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  location: { search: '' },
  addEventListener(type, fn) {
    if (!windowListeners.has(type)) windowListeners.set(type, []);
    windowListeners.get(type).push(fn);
  },
  removeEventListener(type, fn) {
    const arr = windowListeners.get(type);
    if (!arr) return;
    const idx = arr.indexOf(fn);
    if (idx !== -1) arr.splice(idx, 1);
  },
  dispatchEvent(evt) {
    const arr = windowListeners.get(evt.type) || [];
    for (const fn of arr) fn(evt);
  },
};

globalThis.document = {
  pointerLockElement: null,
  activeElement: { tagName: 'BODY' },
  createElement(tag) {
    if (tag === 'canvas') return createMockCanvas();
    return {
      tagName: String(tag).toUpperCase(),
      textContent: '',
      style: {},
      children: [],
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      setAttribute: () => {},
    };
  },
  getElementById(id) {
    if (!mockDomElements.has(id)) {
      if (id === 'minimap-canvas') {
        mockDomElements.set(id, createMockCanvas(184, 184));
      } else {
        mockDomElements.set(id, {
          id,
          textContent: '',
          style: {},
          children: [],
          appendChild(child) {
            this.children.push(child);
            return child;
          },
        });
      }
    }
    return mockDomElements.get(id);
  },
  addEventListener(type, fn) {
    if (!documentListeners.has(type)) documentListeners.set(type, []);
    documentListeners.get(type).push(fn);
  },
  dispatchEvent(evt) {
    const arr = documentListeners.get(evt.type) || [];
    for (const fn of arr) fn(evt);
  },
  exitPointerLock() {
    this.pointerLockElement = null;
    this.dispatchEvent({ type: 'pointerlockchange' });
  },
};

globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

globalThis.__HeadlessWebGLRenderer = class HeadlessWebGLRenderer {
  constructor(params = {}) {
    this.params = params;
    this.domElement = createMockCanvas(1280, 720);
    this.shadowMap = {
      enabled: false,
      type: 0,
      autoUpdate: false,
      needsUpdate: false,
    };
    this.capabilities = {
      getMaxAnisotropy: () => 8,
    };
    this.toneMapping = 0;
    this.toneMappingExposure = 1.0;
    this.width = 1280;
    this.height = 720;
    this.pixelRatio = 1;
    this.renderCount = 0;
  }
  setSize(w, h) {
    this.width = w;
    this.height = h;
    this.domElement.width = w;
    this.domElement.height = h;
  }
  setPixelRatio(r) {
    this.pixelRatio = r;
  }
  render(scene, camera) {
    this.renderCount++;
    this.lastScene = scene;
    this.lastCamera = camera;
  }
  dispose() {
    this.disposed = true;
  }
};

export async function loadGame3D() {
  const THREE = await import('three');
  const { Game3D } = await import('../../public/js/game3d.js');
  return { THREE, Game3D };
}

/** Creates a Game3D instance inside the mocked DOM. */
export async function createTestGame3D(callbacks = {}) {
  const { Game3D } = await loadGame3D();
  windowListeners.clear();
  documentListeners.clear();
  globalThis.document.pointerLockElement = null;
  const container = globalThis.document.createElement('div');
  return new Game3D(container, callbacks);
}
