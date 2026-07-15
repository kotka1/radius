/**
 * Self-contained conceptual 3D preview for aircraft concepts.
 * Renders inside a sandboxed iframe using Three.js from a CDN, so the app
 * avoids heavy WASM/bundler config in v1. Client-safe (no Node Buffer).
 *
 * Phase 2: replace the primitive scene with tessellated output from a B-Rep
 * kernel (occt-wasm / brepjs) for higher-fidelity, STEP-exportable geometry.
 */

import { normalizeGeometry } from "./geometry";
import type { AircraftGeometrySpec } from "../types";

export function aircraftPreviewHtml(spec?: Partial<AircraftGeometrySpec>): string {
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
