/**
 * Conceptual CAD prototype for aircraft concepts (server-side exporters).
 *
 * Phase 1 (this file): deterministic, dependency-free parametric geometry.
 * We tessellate an approximate aircraft (fuselage + wings + tail + fin) from a
 * simple spec and export it to STL (ASCII) and glTF (2.0 JSON).
 *
 * Phase 2 upgrade path: swap this tessellator for a B-Rep kernel
 * (occt-wasm / brepjs) to emit true solids and STEP files. The spec and export
 * surface here are intentionally kernel-agnostic so that swap stays local.
 *
 * NOT airworthy or manufacturing-valid geometry — conceptual only.
 * Uses Node Buffer (glTF base64) — import only on the server.
 */

import { normalizeGeometry } from "./geometry";
import type { AircraftGeometrySpec } from "../types";

export { DEFAULT_AIRCRAFT_GEOMETRY, normalizeGeometry } from "./geometry";

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

  const sweep = Math.tan((g.wingSweepDeg * Math.PI) / 180) * (g.wingSpan / 2);
  const dihedral = Math.tan((g.wingDihedralDeg * Math.PI) / 180) * (g.wingSpan / 2);
  const wingX = x0 + bodyLen * 0.45 - sweep / 2;
  const halfSpan = g.wingSpan / 2;
  pushBox(mesh, wingX, dihedral / 2, halfSpan / 2 + g.fuselageRadius, g.wingChord, 0.12, halfSpan);
  pushBox(mesh, wingX, dihedral / 2, -(halfSpan / 2 + g.fuselageRadius), g.wingChord, 0.12, halfSpan);

  const tailX = x1 - g.tailLength * 0.5;
  const tailHalf = g.tailSpan / 2;
  pushBox(mesh, tailX, 0, tailHalf / 2 + g.fuselageRadius * 0.5, g.tailChord, 0.1, tailHalf);
  pushBox(mesh, tailX, 0, -(tailHalf / 2 + g.fuselageRadius * 0.5), g.tailChord, 0.1, tailHalf);

  pushBox(mesh, tailX, g.finHeight / 2 + g.fuselageRadius * 0.5, 0, g.tailChord, g.finHeight, 0.1);

  return mesh;
}

/** Export the aircraft mesh as ASCII STL. */
export function meshToStl(spec: AircraftGeometrySpec): string {
  const { positions, indices } = buildAircraftMesh(spec);
  const lines: string[] = ["solid radius_aircraft_concept"];
  const p = (idx: number): [number, number, number] => [
    positions[idx * 3],
    positions[idx * 3 + 1],
    positions[idx * 3 + 2],
  ];
  for (let i = 0; i < indices.length; i += 3) {
    const va = p(indices[i]);
    const vb = p(indices[i + 1]);
    const vc = p(indices[i + 2]);
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
  const pad = (4 - (posBytes.length % 4)) % 4;
  const idxBytes = Buffer.from(idxBuf.buffer);
  const combined = Buffer.concat([posBytes, Buffer.alloc(pad), idxBytes]);

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
      { bufferView: 1, componentType: 5125, count: indices.length, type: "SCALAR" },
    ],
  };
  return JSON.stringify(gltf, null, 2);
}
