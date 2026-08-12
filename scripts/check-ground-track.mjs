// Debug-only regression check for satellite ground-track behaviour.
// Run with: node scripts/check-ground-track.mjs (or `npm run test:groundtrack`).
// Confirms ISS is propagated from real TLE elements, that its sub-satellite
// latitude/longitude changes over simulated time, and that its ground
// position is not pinned to a fixed continent.
//
// Not shown anywhere in the UI — this is a standalone node script.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  twoline2satrec,
  propagate,
  gstime,
  eciToEcf,
  eciToGeodetic,
} from "satellite.js";

const ISS_NORAD = 25544;
const EARTH_RADIUS_KM = 6371;

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(rootDir, "data", "tles.ts"), "utf8");

const issMatch = [
  ...source.matchAll(
    /\{ id: "([^"]+)", name: "([^"]+)", category: "([^"]+)", noradId: (\d+), line1: "([^"]+)", line2: "([^"]+)" \}/g
  ),
].find((m) => Number(m[4]) === ISS_NORAD);

if (!issMatch) {
  console.error("FAIL ISS TLE not found in data/tles.ts");
  process.exit(1);
}

const satrec = twoline2satrec(issMatch[5], issMatch[6]);

function groundPoint(date) {
  const pv = propagate(satrec, date);
  if (!pv || !pv.position) {
    throw new Error("propagate returned null");
  }
  const gmst = gstime(date);
  const ecf = eciToEcf(pv.position, gmst);
  const geo = eciToGeodetic(pv.position, gmst);
  return {
    lonDeg: (geo.longitude * 180) / Math.PI,
    latDeg: (geo.latitude * 180) / Math.PI,
    heightKm: geo.height,
    radiusKm: Math.sqrt(ecf.x ** 2 + ecf.y ** 2 + ecf.z ** 2),
  };
}

function groundDistanceKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.latDeg - a.latDeg);
  const dLon = toRad(b.lonDeg - a.lonDeg);
  const la1 = toRad(a.latDeg);
  const la2 = toRad(b.latDeg);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const t0 = new Date("2026-08-11T12:00:00Z");
// 30 real seconds at 60x => 30 min of simulated time.
const t1 = new Date(t0.getTime() + 30 * 60 * 1000);

let failures = 0;
const check = (ok, message) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${message}`);
  if (!ok) failures += 1;
};

let p0;
let p1;
try {
  p0 = groundPoint(t0);
  p1 = groundPoint(t1);

  check(
    Number.isFinite(p0.radiusKm) && Number.isFinite(p1.radiusKm),
    `ISS propagates to finite positions (r=${p0.radiusKm.toFixed(0)} km, r=${p1.radiusKm.toFixed(0)} km)`
  );
  check(
    p0.radiusKm > EARTH_RADIUS_KM + 200 && p0.radiusKm < EARTH_RADIUS_KM + 700,
    `ISS sits in LEO, not on the globe surface (alt=${p0.heightKm.toFixed(0)} km)`
  );
  check(
    Math.abs(p1.lonDeg - p0.lonDeg) > 10 || Math.abs(p1.latDeg - p0.latDeg) > 10,
    `ISS latitude/longitude changes over simulated time (${p0.latDeg.toFixed(1)}, ${p0.lonDeg.toFixed(1)}) -> (${p1.latDeg.toFixed(1)}, ${p1.lonDeg.toFixed(1)})`
  );
  check(
    groundDistanceKm(p0, p1) > 1000,
    `Ground track travels > 1000 km in 30 min of sim time (${groundDistanceKm(p0, p1).toFixed(0)} km)`
  );

  // Sweep a full ISS orbit (~93 min) and confirm the ground position is not
  // fixed to a single continent: longitude must sweep a wide range and
  // latitude must cross the equator.
  const lons = [];
  const lats = [];
  for (let minute = 0; minute <= 100; minute += 5) {
    const p = groundPoint(new Date(t0.getTime() + minute * 60 * 1000));
    lons.push(p.lonDeg);
    lats.push(p.latDeg);
  }
  const lonSpan = Math.max(...lons) - Math.min(...lons);
  const latMax = Math.max(...lats);
  const latMin = Math.min(...lats);

  check(
    lonSpan > 90,
    `ISS ground track sweeps a wide longitude range across a full orbit (span=${lonSpan.toFixed(0)} deg)`
  );
  check(
    latMax > 30 && latMin < -30,
    `ISS ground track crosses the equator between hemispheres (lat ${latMin.toFixed(0)}..${latMax.toFixed(0)} deg)`
  );
} catch (err) {
  check(false, `propagation threw: ${err.message}`);
}

if (failures > 0) {
  console.error(`\n${failures} ground-track assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll ground-track assertions passed.");
