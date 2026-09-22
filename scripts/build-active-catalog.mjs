import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { json2satrec, propagate } from "satellite.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputFile = path.join(rootDir, "data", "active-catalog.json");
const endpoint =
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=csv";

function finite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [headers, ...values] = rows;
  return values.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]))
  );
}

function normalize(value) {
  const noradId = finite(value?.NORAD_CAT_ID);
  const name = String(value?.OBJECT_NAME ?? "").trim();
  const epoch = String(value?.EPOCH ?? "").replace(/Z$/, "");
  if (!Number.isInteger(noradId) || noradId <= 0 || !name) return null;

  const omm = {
    OBJECT_NAME: name,
    OBJECT_ID: String(value?.OBJECT_ID ?? ""),
    EPOCH: epoch,
    MEAN_MOTION: finite(value?.MEAN_MOTION),
    ECCENTRICITY: finite(value?.ECCENTRICITY),
    INCLINATION: finite(value?.INCLINATION),
    RA_OF_ASC_NODE: finite(value?.RA_OF_ASC_NODE),
    ARG_OF_PERICENTER: finite(value?.ARG_OF_PERICENTER),
    MEAN_ANOMALY: finite(value?.MEAN_ANOMALY),
    EPHEMERIS_TYPE: 0,
    CLASSIFICATION_TYPE: value?.CLASSIFICATION_TYPE === "C" ? "C" : "U",
    NORAD_CAT_ID: noradId,
    ELEMENT_SET_NO: finite(value?.ELEMENT_SET_NO),
    REV_AT_EPOCH: finite(value?.REV_AT_EPOCH),
    BSTAR: finite(value?.BSTAR),
    MEAN_MOTION_DOT: finite(value?.MEAN_MOTION_DOT),
    MEAN_MOTION_DDOT: finite(value?.MEAN_MOTION_DDOT),
  };
  const numeric = Object.values(omm).filter(
    (field) => typeof field === "number"
  );
  if (
    !numeric.every(Number.isFinite) ||
    !Number.isFinite(new Date(`${epoch}Z`).getTime()) ||
    omm.MEAN_MOTION <= 0
  ) {
    return null;
  }

  try {
    const position = propagate(json2satrec(omm), new Date(`${epoch}Z`)).position;
    if (!position) return null;
  } catch {
    return null;
  }

  return {
    id: `cat-${noradId}`,
    name,
    noradId,
    objectType: "active",
    omm,
  };
}

async function run() {
  console.log("Fetching the CelesTrak active-satellite OMM catalog...");
  const response = await fetch(endpoint, {
    headers: {
      "User-Agent": "above-earth-build/0.2",
      Accept: "text/csv",
    },
  });
  if (!response.ok) throw new Error(`CelesTrak responded ${response.status}`);
  const payload = parseCsv(await response.text());
  if (payload.length === 0) throw new Error("CelesTrak returned invalid CSV");

  const byId = new Map();
  for (const value of payload) {
    const record = normalize(value);
    if (record) byId.set(record.noradId, record);
  }
  const satellites = [...byId.values()].sort((a, b) => a.noradId - b.noradId);
  if (satellites.length < 10_000) {
    throw new Error(`Refusing incomplete catalog with only ${satellites.length} records`);
  }

  const snapshot = {
    source: "celestrak",
    lastUpdated: new Date().toISOString(),
    count: satellites.length,
    satellites,
  };
  fs.writeFileSync(outputFile, JSON.stringify(snapshot), "utf8");
  console.log(`Saved ${satellites.length} active satellites to ${outputFile}`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
