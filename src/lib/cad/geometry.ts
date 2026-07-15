/**
 * Pure, dependency-free aircraft geometry helpers.
 * Safe to import from both client and server (no Node Buffer / WASM).
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
