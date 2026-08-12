import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { twoline2satrec, propagate, gstime, eciToEcf } from "satellite.js";

/**
 * Validates every checked-in TLE in data/tles.ts against satellite.js:
 * parses each TLE, propagates it, converts ECI -> ECF, and checks that the
 * resulting radius is geophysically plausible. Run with `npm run tles:check`.
 */

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = path.join(rootDir, "data", "tles.ts");
const source = fs.readFileSync(file, "utf8");

const tleMatches = [
  ...source.matchAll(
    /\{ id: "([^"]+)", name: "([^"]+)", category: "([^"]+)", noradId: (\d+), line1: "([^"]+)", line2: "([^"]+)" \}/g
  ),
].map((m) => ({
  id: m[1],
  name: m[2],
  category: m[3],
  noradId: Number(m[4]),
  line1: m[5],
  line2: m[6],
}));

if (tleMatches.length === 0) {
  console.error("No TLE records found in data/tles.ts");
  process.exit(1);
}

let failures = 0;

for (const tle of tleMatches) {
  try {
    const satrec = twoline2satrec(tle.line1, tle.line2);
    const date = new Date("2026-08-11T12:00:00Z");
    const pv = propagate(satrec, date);
    if (!pv) {
      console.error(`FAIL null ${tle.name} (${tle.noradId})`);
      failures++;
      continue;
    }
    const gmst = gstime(date);
    const ecf = eciToEcf(pv.position, gmst);
    const radius = Math.sqrt(ecf.x * ecf.x + ecf.y * ecf.y + ecf.z * ecf.z);
    if (!Number.isFinite(radius) || radius < 6300 || radius > 50000) {
      console.error(`FAIL radius ${radius.toFixed(0)} km ${tle.name} (${tle.noradId})`);
      failures++;
      continue;
    }
    console.log(`OK   ${tle.name.padEnd(24)} ${tle.noradId}  r=${radius.toFixed(0)} km`);
  } catch (err) {
    console.error(`THREW ${tle.name} (${tle.noradId}): ${err.message}`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\n${failures} of ${tleMatches.length} TLE records failed validation.`);
  process.exit(1);
}

console.log(`\nAll ${tleMatches.length} TLE records validated and propagate to plausible orbits.`);