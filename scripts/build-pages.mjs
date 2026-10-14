import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('🔨 Building POLYSTRIKE 3D static bundle for GitHub Pages...');

// 1. Clean dist directory
if (fs.existsSync(DIST_DIR)) {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DIST_DIR, { recursive: true });

// 2. Copy public/* -> dist/*
copyDirRecursive(path.join(ROOT_DIR, 'public'), DIST_DIR);

// 3. Copy shared/* -> dist/shared/*
copyDirRecursive(path.join(ROOT_DIR, 'shared'), path.join(DIST_DIR, 'shared'));

// 4. Copy server simulation modules (roomManager.js & botAI.js) -> dist/server/*
//    Used by networkAdapter.js when running serverless on GitHub Pages
const distServerDir = path.join(DIST_DIR, 'server');
fs.mkdirSync(distServerDir, { recursive: true });
for (const file of ['roomManager.js', 'botAI.js']) {
  fs.copyFileSync(
    path.join(ROOT_DIR, 'server', file),
    path.join(distServerDir, file)
  );
}

// 5. Copy Three.js ES module -> dist/vendor/three/three.module.js
const threeSrc = path.join(ROOT_DIR, 'node_modules', 'three', 'build', 'three.module.js');
const threeDestDir = path.join(DIST_DIR, 'vendor', 'three');
fs.mkdirSync(threeDestDir, { recursive: true });
fs.copyFileSync(threeSrc, path.join(threeDestDir, 'three.module.js'));

// Also copy three.core.js if present in modern Three.js releases
const threeCoreSrc = path.join(ROOT_DIR, 'node_modules', 'three', 'build', 'three.core.js');
if (fs.existsSync(threeCoreSrc)) {
  fs.copyFileSync(threeCoreSrc, path.join(threeDestDir, 'three.core.js'));
}

// 6. Create .nojekyll so GitHub Pages serves all folders and ES modules cleanly
fs.writeFileSync(path.join(DIST_DIR, '.nojekyll'), '');

// 7. Copy index.html to 404.html for SPA fallback on GitHub Pages
fs.copyFileSync(path.join(DIST_DIR, 'index.html'), path.join(DIST_DIR, '404.html'));

console.log('✅ Build complete! Static output ready in ./dist');
