// Regression check for OMM-based SGP4 ground-track behavior.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  eciToGeodetic,
  gstime,
  json2satrec,
  propagate,
  twoline2satrec,
} from "satellite.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(
  fs.readFileSync(path.join(rootDir, "data", "active-catalog.json"), "utf8")
);
const iss = catalog.satellites.find((record) => record.noradId === 25544);
if (!iss?.omm && (!iss?.line1 || !iss?.line2)) {
  console.error("FAIL ISS orbital elements not found in data/active-catalog.json");
  process.exit(1);
}

const satrec = iss.omm
  ? json2satrec(iss.omm)
  : twoline2satrec(iss.line1, iss.line2);
const t0 = iss.omm
  ? new Date(`${iss.omm.EPOCH.replace(/Z$/, "")}Z`)
  : (() => {
      const shortYear = Number(iss.line1.slice(18, 20));
      const year = shortYear < 57 ? shortYear + 2000 : shortYear + 1900;
      const day = Number(iss.line1.slice(20, 32));
      return new Date(Date.UTC(year, 0, 1) + (day - 1) * 86_400_000);
    })();
const t1 = new Date(t0.getTime() + 30 * 60 * 1000);

function groundPoint(date) {
  const pv = propagate(satrec, date);
  if (!pv.position) throw new Error("propagate returned no position");
  const geo = eciToGeodetic(pv.position, gstime(date));
  return {
    lonDeg: (geo.longitude * 180) / Math.PI,
    latDeg: (geo.latitude * 180) / Math.PI,
    heightKm: geo.height,
  };
}

function groundDistanceKm(a, b) {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.latDeg - a.latDeg);
  const dLon = toRad(b.lonDeg - a.lonDeg);
  const lat1 = toRad(a.latDeg);
  const lat2 = toRad(b.latDeg);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

let failures = 0;
function check(ok, message) {
  console.log(`${ok ? "PASS" : "FAIL"} ${message}`);
  if (!ok) failures += 1;
}

try {
  const p0 = groundPoint(t0);
  const p1 = groundPoint(t1);
  check(
    p0.heightKm > 300 && p0.heightKm < 500,
    `ISS is in LEO (geodetic altitude ${p0.heightKm.toFixed(0)} km)`
  );
  check(
    groundDistanceKm(p0, p1) > 1000,
    `ISS ground track moves >1000 km in 30 min (${groundDistanceKm(p0, p1).toFixed(0)} km)`
  );

  const lons = [];
  const lats = [];
  for (let minute = 0; minute <= 100; minute += 5) {
    const point = groundPoint(new Date(t0.getTime() + minute * 60_000));
    lons.push(point.lonDeg);
    lats.push(point.latDeg);
  }
  check(
    Math.max(...lons) - Math.min(...lons) > 90,
    "ISS ground track sweeps a wide longitude range"
  );
  check(
    Math.max(...lats) > 30 && Math.min(...lats) < -30,
    "ISS ground track crosses both hemispheres"
  );
} catch (error) {
  check(false, `propagation threw: ${error.message}`);
}

if (failures > 0) process.exit(1);
console.log("All ground-track assertions passed.");
