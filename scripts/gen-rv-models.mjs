// Polyfill FileReader for Node.js (needed by GLTFExporter Blob handling)
if (typeof FileReader === 'undefined') {
  global.FileReader = class {
    readAsArrayBuffer(blob) {
      (blob.arrayBuffer ? blob.arrayBuffer() : Promise.resolve(blob)).then(buf => {
        this.result = buf;
        if (this.onloadend) this.onloadend({ target: this });
      });
    }
  };
}

import * as THREE from '/home/runner/workspace/node_modules/.pnpm/three@0.182.0/node_modules/three/build/three.module.js';
import { GLTFExporter } from '/home/runner/workspace/node_modules/.pnpm/three@0.182.0/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { writeFileSync, mkdirSync } from 'fs';

const OUT = '/home/runner/workspace/artifacts/rv-marketplace/public/models';
mkdirSync(OUT, { recursive: true });

const GREEN   = '#4a7a5a';
const DKGREEN = '#3a6248';
const WINDOW  = '#0d1f2a';
const WHEEL_C = '#1a1a1a';
const ROOF    = '#888';
const HITCH   = '#555';

function box(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(color) })
  );
  m.position.set(x, y + h / 2, z);
  return m;
}
function wheel(x, y, z, r = 0.4) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, 0.26, 14),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(WHEEL_C) })
  );
  m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

function save(scene, name) {
  return new Promise((res, rej) => {
    new GLTFExporter().parse(scene, buf => {
      if (!buf || buf.byteLength === 0) { rej(new Error('Empty buffer')); return; }
      writeFileSync(`${OUT}/${name}`, Buffer.from(buf));
      console.log(`✓ ${name} (${(buf.byteLength / 1024).toFixed(0)} KB)`);
      res();
    }, rej, { binary: true });
  });
}

// ─── CLASS A ────────────────────────────────────────────────────────
{
  const s = new THREE.Scene();
  s.add(box(2.55, 3.55, 12.2, GREEN));
  s.add(box(2.55, 3.75, 1.1, DKGREEN, 0, 0, -6.15));
  s.add(box(2.55, 0.25, 10.5, DKGREEN, 0, 3.55, -0.5));
  s.add(box(0.95, 0.28, 0.8, ROOF, 0, 3.8, 0.5));
  s.add(box(0.95, 0.28, 0.8, ROOF, 0, 3.8, -2.5));
  s.add(box(0.02, 1.8, 2.0, WINDOW, 1.28, 1.8, -5.5));
  for (const z of [-4, -1.5, 1.0, 3.5])
    s.add(box(0.02, 1.0, 1.3, WINDOW, 1.28, 2.0, z));
  for (const z of [-4.5, 4.5]) {
    s.add(wheel(-1.28, 0.4, z)); s.add(wheel(1.28, 0.4, z));
  }
  await save(s, 'rv-class-a.glb');
}

// ─── CLASS B ─────────────────────────────────────────────────────────
{
  const s = new THREE.Scene();
  s.add(box(2.0, 2.7, 5.6, '#5a8a6a'));
  s.add(box(2.0, 1.8, 1.6, '#3d6a50', 0, 0, -3.6));
  s.add(box(2.0, 0.45, 1.8, '#4d7a5e', 0, 2.7, -1.6));
  s.add(box(0.02, 1.1, 1.1, WINDOW, 1.01, 1.4, -3.3));
  s.add(box(0.02, 0.85, 2.2, WINDOW, 1.01, 1.7, 0.5));
  for (const z of [-2.0, 1.5]) {
    s.add(wheel(-0.95, 0.35, z, 0.35)); s.add(wheel(0.95, 0.35, z, 0.35));
  }
  await save(s, 'rv-class-b.glb');
}

// ─── CLASS C ─────────────────────────────────────────────────────────
{
  const s = new THREE.Scene();
  s.add(box(2.5, 3.2, 8.8, '#5a7a6a'));
  s.add(box(2.5, 2.0, 1.8, '#3d5e4c', 0, 0, -5.3));
  s.add(box(2.5, 1.1, 2.2, '#4a6a58', 0, 3.2, -4.1));
  s.add(box(0.9, 0.28, 0.78, ROOF, 0, 3.2, 1.0));
  s.add(box(0.02, 1.3, 1.3, WINDOW, 1.26, 1.4, -5.2));
  for (const z of [-3, 0, 2.5])
    s.add(box(0.02, 1.0, 1.2, WINDOW, 1.26, 1.9, z));
  for (const z of [-3.5, 3.5]) {
    s.add(wheel(-1.2, 0.42, z)); s.add(wheel(1.2, 0.42, z));
  }
  await save(s, 'rv-class-c.glb');
}

// ─── TRAVEL TRAILER ──────────────────────────────────────────────────
{
  const s = new THREE.Scene();
  s.add(box(2.4, 2.85, 8.5, '#7a9a8a'));
  s.add(box(2.4, 0.22, 8.5, '#6a8a78', 0, 2.85, 0));
  s.add(box(0.3, 2.2, 3.5, '#8aaa9a', 1.35, 0.35, 0));
  s.add(box(0.14, 0.1, 1.8, HITCH, 0, 0.45, -5.15));
  const tankGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.42, 10);
  const tankMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c8c8c8') });
  for (const x of [-0.3, 0.3]) {
    const t = new THREE.Mesh(tankGeo, tankMat);
    t.rotation.z = Math.PI / 2; t.position.set(x, 0.5, -4.6);
    s.add(t);
  }
  s.add(wheel(-1.1, 0.38, 0.8, 0.38)); s.add(wheel(1.1, 0.38, 0.8, 0.38));
  await save(s, 'rv-travel-trailer.glb');
}

// ─── FIFTH WHEEL ────────────────────────────────────────────────────
{
  const s = new THREE.Scene();
  s.add(box(2.6, 2.6, 11.0, '#8a7a6a'));
  s.add(box(2.6, 1.4, 3.2, '#7a6a5a', 0, 2.6, -3.9));
  s.add(box(0.3, 2.4, 4.2, '#9a8a7a', 1.45, 0.1, 1.2));
  s.add(box(0.3, 2.4, 4.2, '#9a8a7a', -1.45, 0.1, 1.2));
  s.add(box(0.18, 0.55, 0.18, '#888', 0, 0, -5.5));
  s.add(box(0.12, 0.9, 0.12, '#666', -0.85, 0, -3.0));
  s.add(box(0.12, 0.9, 0.12, '#666', 0.85, 0, -3.0));
  for (const z of [1.2, 3.0]) {
    s.add(wheel(-1.25, 0.44, z)); s.add(wheel(1.25, 0.44, z));
  }
  await save(s, 'rv-fifth-wheel.glb');
}

// ─── TOY HAULER ─────────────────────────────────────────────────────
{
  const s = new THREE.Scene();
  s.add(box(2.62, 3.1, 10.5, '#6a7a8a'));
  s.add(box(2.62, 3.1, 2.8, '#5a6a7a', 0, 0, 4.85));
  s.add(box(2.6, 2.95, 0.05, '#222', 0, 0.08, 6.27));
  s.add(box(0.3, 2.8, 4.5, '#7a8a9a', 1.46, 0.15, 0.5));
  s.add(box(0.12, 0.9, 0.12, '#666', -0.85, 0, -4.0));
  s.add(box(0.12, 0.9, 0.12, '#666', 0.85, 0, -4.0));
  for (const z of [1.0, 3.0]) {
    s.add(wheel(-1.26, 0.44, z)); s.add(wheel(1.26, 0.44, z));
  }
  await save(s, 'rv-toy-hauler.glb');
}

console.log('\nAll 6 RV models generated!');
