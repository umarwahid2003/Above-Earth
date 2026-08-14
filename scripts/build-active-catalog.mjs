import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputFile = path.join(rootDir, "data", "active-catalog.json");

const GROUPS = [
  "stations",
  "visual",
  "starlink",
  "oneweb",
  "gps-ops",
  "glo-ops",
  "galileo",
  "beidou",
  "science",
  "weather",
  "resource",
  "sarsat",
  "geo",
  "iridium-NEXT",
  "planet",
  "spire",
  "swarm",
  "cubesat",
  "other-comm",
  "military",
  "radar",
  "amateur",
  "active",
  "fengyun-1c-debris",
  "cosmos-2251-debris",
  "iridium-33-debris"
];

function detectObjectType(name, group) {
  const upper = name.toUpperCase();
  if (
    group?.toLowerCase().includes("debris") ||
    /\b(DEB|DEBRIS|FRAG|FRAGMENT|COOLANT|SHROUD|DISCARDED|COVER)\b/.test(upper) ||
    upper.includes(" DEB") ||
    upper.endsWith(" DEB") ||
    upper.includes(" DEBRIS")
  ) {
    return "debris";
  }
  if (
    group?.toLowerCase().includes("rocket") ||
    /\b(R\/B|ROCKET BODY|STAGE|CENTAUR|BREEZE-M|FREGAT|TITAN 3C)\b/.test(upper) ||
    upper.includes(" R/B") ||
    upper.endsWith(" R/B") ||
    upper.includes("ROCKET BODY")
  ) {
    return "rocketBody";
  }
  return "active";
}

function parseTles(text, groupName) {
  const lines = text.replace(/\r/g, "").split("\n").map(l => l.trimEnd());
  const records = [];
  for (let i = 0; i < lines.length; i += 3) {
    const name = lines[i]?.trim() ?? "";
    const line1 = lines[i + 1] ?? "";
    const line2 = lines[i + 2] ?? "";
    if (!/^1 /.test(line1) || !/^2 /.test(line2)) continue;
    const noradId = Number(line2.slice(2, 7));
    if (!Number.isInteger(noradId) || noradId <= 0) continue;
    records.push({
      id: `cat-${noradId}`,
      name,
      noradId,
      objectType: detectObjectType(name, groupName),
      line1,
      line2,
      group: groupName,
    });
  }
  return records;
}

async function run() {
  const satelliteMap = new Map();
  console.log("Fetching satellite groups from CelesTrak...");

  for (const group of GROUPS) {
    try {
      const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": `above-earth-build/0.1 (${group})`,
          Accept: "text/plain,*/*",
        },
      });
      if (!res.ok) {
        console.warn(`Group ${group} returned ${res.status}`);
        continue;
      }
      const text = await res.text();
      const parsed = parseTles(text, group);
      let newCount = 0;
      for (const rec of parsed) {
        if (!satelliteMap.has(rec.noradId)) {
          satelliteMap.set(rec.noradId, rec);
          newCount++;
        }
      }
      console.log(`✓ Group [${group}]: +${newCount} new objects (${parsed.length} total in group)`);
    } catch (e) {
      console.warn(`Error fetching ${group}:`, e.message);
    }
  }

  const allObjects = Array.from(satelliteMap.values()).sort((a, b) => a.noradId - b.noradId);
  const counts = { active: 0, rocketBody: 0, debris: 0 };
  for (const obj of allObjects) {
    counts[obj.objectType] = (counts[obj.objectType] || 0) + 1;
  }
  console.log(`\nTotal unique orbital objects collected: ${allObjects.length}`);
  console.log(`Active: ${counts.active}, Rocket Bodies (R/B): ${counts.rocketBody}, Debris: ${counts.debris}`);

  if (allObjects.length > 0) {
    const snapshot = {
      source: "catalog",
      lastUpdated: new Date().toISOString(),
      count: allObjects.length,
      satellites: allObjects,
    };
    fs.writeFileSync(outputFile, JSON.stringify(snapshot), "utf8");
    console.log(`Saved ${allObjects.length} objects to ${outputFile}`);
  }
}

run();
