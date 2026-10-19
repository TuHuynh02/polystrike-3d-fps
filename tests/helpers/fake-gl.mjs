// A permissive fake WebGL2 context so the REAL three.js WebGLRenderer can run in Node (no GPU, no pixels).
// It lets the perf probe count what the renderer would do per frame: draw calls, triangles, shader programs compiled,
// geometries / textures alive, and how much JS time three.js itself spends. It cannot tell how long a GPU or driver takes.

const FAKE_PARAMS = {
  MAX_TEXTURE_SIZE: 8192,
  MAX_CUBE_MAP_TEXTURE_SIZE: 8192,
  MAX_VERTEX_TEXTURE_IMAGE_UNITS: 16,
  MAX_TEXTURE_IMAGE_UNITS: 16,
  MAX_VERTEX_ATTRIBS: 16,
  MAX_VERTEX_UNIFORM_VECTORS: 1024,
  MAX_VARYING_VECTORS: 30,
  MAX_FRAGMENT_UNIFORM_VECTORS: 1024,
  MAX_SAMPLES: 4,
  MAX_COMBINED_TEXTURE_IMAGE_UNITS: 32,
  MAX_RENDERBUFFER_SIZE: 8192,
  MAX_3D_TEXTURE_SIZE: 2048,
  MAX_ARRAY_TEXTURE_LAYERS: 256,
  MAX_DRAW_BUFFERS: 8,
  MAX_COLOR_ATTACHMENTS: 8,
  MAX_UNIFORM_BUFFER_BINDINGS: 24
};

export function createFakeGL(canvas) {
  const stats = {
    programsLinked: 0,
    shadersCompiled: 0,
    drawCalls: 0,
    buffersCreated: 0,
    buffersDeleted: 0,
    bufferUploads: 0,
    texturesCreated: 0,
    texturesDeleted: 0,
    textureUploads: 0,
    uniformCalls: 0,
    totalCalls: 0
  };
  const constants = new Map();
  let nextConst = 0x1000;
  const constOf = (name) => {
    if (!constants.has(name)) constants.set(name, nextConst++);
    return constants.get(name);
  };
  const nameOf = new Map();
  const handle = () => ({});

  const impl = {
    getContextAttributes: () => ({ alpha: false, depth: true, stencil: false, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'default' }),
    getSupportedExtensions: () => [],
    getExtension: () => null,
    getParameter(p) {
      const name = nameOf.get(p);
      if (name === 'VERSION') return 'WebGL 2.0 (fake)';
      if (name === 'SHADING_LANGUAGE_VERSION') return 'WebGL GLSL ES 3.00 (fake)';
      if (name === 'VENDOR' || name === 'RENDERER') return 'fake';
      if (name === 'VIEWPORT' || name === 'SCISSOR_BOX') return new Int32Array([0, 0, canvas.width || 1280, canvas.height || 720]);
      if (name && name in FAKE_PARAMS) return FAKE_PARAMS[name];
      return 0;
    },
    getShaderPrecisionFormat: () => ({ precision: 23, rangeMin: 127, rangeMax: 127 }),
    createShader: () => handle(),
    shaderSource() {},
    compileShader() { stats.shadersCompiled++; },
    getShaderParameter: () => true,
    getShaderInfoLog: () => '',
    getShaderSource: () => '',
    createProgram: () => handle(),
    attachShader() {},
    bindAttribLocation() {},
    linkProgram() { stats.programsLinked++; },
    getProgramParameter: (prog, pname) => (nameOf.get(pname) === 'LINK_STATUS' ? true : 0),
    getProgramInfoLog: () => '',
    getActiveUniform: () => null,
    getActiveAttrib: () => null,
    getUniformLocation: () => handle(),
    getAttribLocation: () => 0,
    createBuffer() { stats.buffersCreated++; return handle(); },
    deleteBuffer() { stats.buffersDeleted++; },
    bufferData() { stats.bufferUploads++; },
    bufferSubData() { stats.bufferUploads++; },
    createTexture() { stats.texturesCreated++; return handle(); },
    deleteTexture() { stats.texturesDeleted++; },
    texImage2D() { stats.textureUploads++; },
    texImage3D() { stats.textureUploads++; },
    texSubImage2D() { stats.textureUploads++; },
    drawArrays() { stats.drawCalls++; },
    drawElements() { stats.drawCalls++; },
    drawArraysInstanced() { stats.drawCalls++; },
    drawElementsInstanced() { stats.drawCalls++; },
    checkFramebufferStatus: () => constOf('FRAMEBUFFER_COMPLETE'),
    getError: () => 0,
    isContextLost: () => false,
    createVertexArray: () => handle(),
    createFramebuffer: () => handle(),
    createRenderbuffer: () => handle(),
    createQuery: () => handle(),
    createSampler: () => handle()
  };

  const target = typeof globalThis.WebGL2RenderingContext === 'function'
    ? Object.create(globalThis.WebGL2RenderingContext.prototype)
    : {};
  const gl = new Proxy(target, {
    get(t, prop) {
      if (prop === 'canvas') return canvas;
      if (prop === 'drawingBufferWidth') return canvas.width || 1280;
      if (prop === 'drawingBufferHeight') return canvas.height || 720;
      if (typeof prop === 'symbol') return t[prop];
      if (prop in impl) {
        const fn = impl[prop];
        return (...args) => { stats.totalCalls++; return fn(...args); };
      }
      if (/^[A-Z0-9_]+$/.test(prop)) {
        const v = constOf(prop);
        nameOf.set(v, prop);
        return v;
      }
      if (/^uniform/.test(prop)) return () => { stats.uniformCalls++; };
      return () => { stats.totalCalls++; };
    }
  });
  return { gl, stats };
}

export function installFakeWebGL2Class() {
  if (typeof globalThis.WebGL2RenderingContext !== 'function') {
    globalThis.WebGL2RenderingContext = class WebGL2RenderingContext {};
  }
}
