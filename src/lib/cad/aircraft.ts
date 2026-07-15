/**
 * Conceptual CAD prototype for aircraft concepts.
 *
 * Phase 1 (this file): deterministic, dependency-free parametric geometry.
 * We tessellate an approximate aircraft (fuselage + wings + tail + fin) from a
 * simple spec and export it to STL (ASCII) and glTF (2.0 JSON). A self-contained
 * Three.js preview (loaded from a CDN inside a sandboxed iframe) renders the
 * primitives so we avoid heavy WASM/bundler config in v1.
 *
 * Phase 2 upgrade path: swap this tessellator for a B-Rep kernel
 * (occt-wasm / brepjs) to emit true solids and STEP files. The spec and
 * export surface here are intentionally kernel-agnostic so that swap is local.
 *
 * NOT airworthy or manufacturing-valid geometry — conceptual only.
 */

import type { AircraftGeometrySpec } from "../types";

export const DEFAULT_AIRCRAFT_GEOMETRY: AircraftGeometrySpec = {
  units: "m",
  fuselageLength: 8,
  fuselageRadius: 0.7,
  noseLength: 1.6,
  tailLength: 2,
  wingSpan: 11,
  wingChord: 1.4,
  wingSweepDeg: 6,
  wingDihedralDeg: 4,
  tailSpan: 3.4,
  tailChord: 0.9,
  finHeight: 1.4,
};

export function normalizeGeometry(
  partial?: Partial<AircraftGeometrySpec>
): AircraftGeometrySpec {
  const g = { ...DEFAULT_AIRCRAFT_GEOMETRY, ...(partial ?? {}) };
  const clamp = (v: number, lo: number, hi: number) =>
    Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;
  return {
    units: "m",
    fuselageLength: clamp(g.fuselageLength, 2, 80),
    fuselageRadius: clamp(g.fuselageRadius, 0.2, 6),
    noseLength: clamp(g.noseLength, 0.3, 20),
    tailLength: clamp(g.tailLength, 0.3, 20),
    wingSpan: clamp(g.wingSpan, 1, 90),
    wingChord: clamp(g.wingChord, 0.3, 12),
    wingSweepDeg: clamp(g.wingSweepDeg, 0, 60),
    wingDihedralDeg: clamp(g.wingDihedralDeg, 0, 20),
    tailSpan: clamp(g.tailSpan, 0.5, 30),
    tailChord: clamp(g.tailChord, 0.2, 8),
    finHeight: clamp(g.finHeight, 0.3, 12),
  };
}

type Mesh = { positions: number[]; indices: number[] };

function pushBox(
  mesh: Mesh,
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number
) {
  const hx = sx / 2;
  const hy = sy / 2;
  const hz = sz / 2;
  const base = mesh.positions.length / 3;
  const corners: Array<[number, number, number]> = [
    [cx - hx, cy - hy, cz - hz],
    [cx + hx, cy - hy, cz - hz],
    [cx + hx, cy + hy, cz - hz],
    [cx - hx, cy + hy, cz - hz],
    [cx - hx, cy - hy, cz + hz],
    [cx + hx, cy - hy, cz + hz],
    [cx + hx, cy + hy, cz + hz],
    [cx - hx, cy + hy, cz + hz],
  ];
  for (const c of corners) mesh.positions.push(c[0], c[1], c[2]);
  const faces = [
    [0, 1, 2, 3],
    [5, 4, 7, 6],
    [4, 0, 3, 7],
    [1, 5, 6, 2],
    [3, 2, 6, 7],
    [4, 5, 1, 0],
  ];
  for (const f of faces) {
    mesh.indices.push(base + f[0], base + f[1], base + f[2]);
    mesh.indices.push(base + f[0], base + f[2], base + f[3]);
  }
}

function pushCylinderX(
  mesh: Mesh,
  x0: number,
  x1: number,
  radius: number,
  segments = 16
) {
  const base = mesh.positions.length / 3;
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const y = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    mesh.positions.push(x0, y, z);
    mesh.positions.push(x1, y, z);
  }
  for (let i = 0; i < segments; i++) {
    const a = base + i * 2;
    const b = base + ((i + 1) % segments) * 2;
    mesh.indices.push(a, b, a + 1);
    mesh.indices.push(b, b + 1, a + 1);
  }
  // Nose + tail caps (fan)
  const capStart = mesh.positions.length / 3;
  mesh.positions.push(x0, 0, 0);
  mesh.positions.push(x1, 0, 0);
  for (let i = 0; i < segments; i++) {
    const a = base + i * 2;
    const b = base + ((i + 1) % segments) * 2;
    mesh.indices.push(capStart, b, a);
    mesh.indices.push(capStart + 1, a + 1, b + 1);
  }
}

/** Build an approximate triangle mesh for the aircraft (metres, +X = nose). */
export function buildAircraftMesh(spec: AircraftGeometrySpec): Mesh {
  const g = normalizeGeometry(spec);
  const mesh: Mesh = { positions: [], indices: [] };

  const bodyLen = g.fuselageLength;
  const x0 = -bodyLen / 2;
  const x1 = bodyLen / 2;
  pushCylinderX(mesh, x0, x1, g.fuselageRadius, 18);

  // Main wings (left + right), swept back, with dihedral offset.
  const sweep = Math.tan((g.wingSweepDeg * Math.PI) / 180) * (g.wingSpan / 2);
  const dihedral = Math.tan((g.wingDihedralDeg * Math.PI) / 180) * (g.wingSpan / 2);
  const wingX = x0 + bodyLen * 0.45 - sweep / 2;
  const halfSpan = g.wingSpan / 2;
  pushBox(mesh, wingX, dihedral / 2, halfSpan / 2 + g.fuselageRadius, g.wingChord, 0.12, halfSpan);
  pushBox(mesh, wingX, dihedral / 2, -(halfSpan / 2 + g.fuselageRadius), g.wingChord, 0.12, halfSpan);

  // Horizontal tail.
  const tailX = x1 - g.tailLength * 0.5;
  const tailHalf = g.tailSpan / 2;
  pushBox(mesh, tailX, 0, tailHalf / 2 + g.fuselageRadius * 0.5, g.tailChord, 0.1, tailHalf);
  pushBox(mesh, tailX, 0, -(tailHalf / 2 + g.fuselageRadius * 0.5), g.tailChord, 0.1, tailHalf);

  // Vertical fin.
  pushBox(mesh, tailX, g.finHeight / 2 + g.fuselageRadius * 0.5, 0, g.tailChord, g.finHeight, 0.1);

  return mesh;
}

/** Export the aircraft mesh as ASCII STL. */
export function meshToStl(spec: AircraftGeometrySpec): string {
  const { positions, indices } = buildAircraftMesh(spec);
  const lines: string[] = ["solid radius_aircraft_concept"];
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]];
    const p = (idx: number): [number, number, number] => [
      positions[idx * 3],
      positions[idx * 3 + 1],
      positions[idx * 3 + 2],
    ];
    const va = p(a);
    const vb = p(b);
    const vc = p(c);
    const ux = vb[0] - va[0];
    const uy = vb[1] - va[1];
    const uz = vb[2] - va[2];
    const vx = vc[0] - va[0];
    const vy = vc[1] - va[1];
    const vz = vc[2] - va[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    lines.push(`  facet normal ${nx.toFixed(6)} ${ny.toFixed(6)} ${nz.toFixed(6)}`);
    lines.push("    outer loop");
    for (const v of [va, vb, vc]) {
      lines.push(`      vertex ${v[0].toFixed(6)} ${v[1].toFixed(6)} ${v[2].toFixed(6)}`);
    }
    lines.push("    endloop");
    lines.push("  endfacet");
  }
  lines.push("endsolid radius_aircraft_concept");
  return lines.join("\n");
}

/** Export the aircraft mesh as a minimal, self-contained glTF 2.0 JSON. */
export function meshToGltf(spec: AircraftGeometrySpec): string {
  const { positions, indices } = buildAircraftMesh(spec);
  const posBuf = Float32Array.from(positions);
  const idxBuf = Uint32Array.from(indices);

  const posBytes = Buffer.from(posBuf.buffer);
  // glTF requires 4-byte alignment between buffer views.
  const pad = (posBytes.length % 4 + 4) % 4;
  const idxBytes = Buffer.from(idxBuf.buffer);
  const combined = Buffer.concat([
    posBytes,
    Buffer.alloc(pad),
    idxBytes,
  ]);

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i + k]);
      max[k] = Math.max(max[k], positions[i + k]);
    }
  }

  const gltf = {
    asset: { version: "2.0", generator: "Radius CAD concept prototype" },
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes: [{ mesh: 0, name: "AircraftConcept" }],
    meshes: [
      {
        name: "AircraftConcept",
        primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }],
      },
    ],
    buffers: [
      {
        byteLength: combined.length,
        uri: `data:application/octet-stream;base64,${combined.toString("base64")}`,
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.length, target: 34962 },
      {
        buffer: 0,
        byteOffset: posBytes.length + pad,
        byteLength: idxBytes.length,
        target: 34963,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: "VEC3",
        min,
        max,
      },
      {
        bufferView: 1,
        componentType: 5125,
        count: indices.length,
        type: "SCALAR",
      },
    ],
  };
  return JSON.stringify(gltf, null, 2);
}

/**
 * Self-contained HTML that renders the aircraft concept in Three.js (CDN).
 * Rendered inside a sandboxed iframe in the Visual Stage.
 */
export function aircraftPreviewHtml(spec: AircraftGeometrySpec): string {
  const g = normalizeGeometry(spec);
  const json = JSON.stringify(g);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Aircraft concept preview</title>
<style>
  html, body { margin:0; height:100%; background:#0a0d12; overflow:hidden; }
  #tag {
    position:fixed; left:12px; bottom:10px; z-index:2;
    font:500 11px/1.4 system-ui, sans-serif; letter-spacing:.08em;
    text-transform:uppercase; color:#c9a54a; opacity:.85;
  }
  #hint {
    position:fixed; right:12px; bottom:10px; z-index:2;
    font:400 11px/1.4 system-ui, sans-serif; color:#6b7a8f;
  }
</style>
</head>
<body>
<div id="tag">Conceptual geometry — not certified</div>
<div id="hint">drag to orbit</div>
<script type="importmap">
{ "imports": { "three": "https://unpkg.com/three@0.160.0/build/three.module.js" } }
</script>
<script type="module">
import * as THREE from "three";
const g = ${json};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d12);
const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x0a0d12, 1.1));
const key = new THREE.DirectionalLight(0xfff3d6, 1.2);
key.position.set(6, 10, 8);
scene.add(key);

const body = new THREE.MeshStandardMaterial({ color:0xd7dce3, metalness:0.5, roughness:0.35 });
const accent = new THREE.MeshStandardMaterial({ color:0xc9a54a, metalness:0.4, roughness:0.4 });
const root = new THREE.Group();

const fuse = new THREE.Mesh(new THREE.CylinderGeometry(g.fuselageRadius, g.fuselageRadius*0.5, g.fuselageLength, 24), body);
fuse.rotation.z = Math.PI/2;
root.add(fuse);
const nose = new THREE.Mesh(new THREE.ConeGeometry(g.fuselageRadius, g.noseLength, 24), body);
nose.rotation.z = -Math.PI/2;
nose.position.x = g.fuselageLength/2 + g.noseLength/2;
root.add(nose);

function wing(sign){
  const geo = new THREE.BoxGeometry(g.wingChord, 0.12, g.wingSpan/2);
  const m = new THREE.Mesh(geo, accent);
  const sweep = Math.tan(g.wingSweepDeg*Math.PI/180) * (g.wingSpan/4);
  const dih = Math.tan(g.wingDihedralDeg*Math.PI/180) * (g.wingSpan/4);
  m.position.set(g.fuselageLength*0.05 - sweep, dih, sign*(g.wingSpan/4 + g.fuselageRadius));
  root.add(m);
}
wing(1); wing(-1);

function tail(sign){
  const m = new THREE.Mesh(new THREE.BoxGeometry(g.tailChord, 0.1, g.tailSpan/2), body);
  m.position.set(-g.fuselageLength/2 + g.tailLength*0.4, 0, sign*(g.tailSpan/4 + g.fuselageRadius*0.5));
  root.add(m);
}
tail(1); tail(-1);
const fin = new THREE.Mesh(new THREE.BoxGeometry(g.tailChord, g.finHeight, 0.1), body);
fin.position.set(-g.fuselageLength/2 + g.tailLength*0.4, g.finHeight/2 + g.fuselageRadius*0.4, 0);
root.add(fin);

scene.add(root);

const box = new THREE.Box3().setFromObject(root);
const size = box.getSize(new THREE.Vector3()).length();
camera.position.set(size*0.7, size*0.4, size*0.8);
camera.lookAt(0,0,0);

let rx = 0.3, ry = 0.6, down = false, px = 0, py = 0, auto = true;
renderer.domElement.addEventListener("pointerdown", e => { down = true; auto = false; px = e.clientX; py = e.clientY; });
addEventListener("pointerup", () => down = false);
addEventListener("pointermove", e => {
  if(!down) return;
  ry += (e.clientX - px) * 0.01; rx += (e.clientY - py) * 0.01;
  px = e.clientX; py = e.clientY;
});
addEventListener("resize", () => {
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function loop(){
  requestAnimationFrame(loop);
  if(auto) ry += 0.003;
  root.rotation.y = ry; root.rotation.x = rx;
  renderer.render(scene, camera);
}
loop();
</script>
</body>
</html>`;
}
