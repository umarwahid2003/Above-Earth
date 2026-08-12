import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { twoline2satrec, propagate, gstime, eciToEcf } from "satellite.js";

/**
 * Curates the Orbit Atlas satellite catalog: builds real-ish Two-Line
 * Elements per satellite (correct checksums), validates that satellite.js can
 * parse and propagate every entry, then writes data/tles.ts.
 *
 * Run: npm run tles:generate
 */

const CATEGORIES = [
  "ISS/Crewed",
  "Communications",
  "GPS/Navigation",
  "Weather",
  "Science",
];

// Epoch for "recent" orbital elements (2026-08-11T12:00:00Z -> year 26, DOY 223.5).
const EPOCH_DOY = 223.5;
const EPOCH = `26${String(Math.floor(EPOCH_DOY)).padStart(3, "0")}.50000000`;

const pad = (num, width) => String(num).padStart(width, "0");

function checksum(line) {
  let sum = 0;
  for (let i = 0; i < 68; i++) {
    const ch = line[i] ?? " ";
    if (ch === "-") sum += 1;
    else if (ch >= "0" && ch <= "9") sum += Number(ch);
  }
  return String(sum % 10);
}

const formatFloat = (value, width, decimals) =>
  value.toFixed(decimals).padStart(width, " ");

function formatNdott(value) {
  const sign = value >= 0 ? "+" : "-";
  const mantissa = pad(
    Math.abs(value).toFixed(8).replace(/[.-]/g, "").slice(0, 8),
    8
  );
  return `${sign}.${mantissa}`;
}

function formatSci(value) {
  const sign = value >= 0 ? "+" : "-";
  const abs = Math.abs(value);
  if (abs === 0) return " 00000+0";
  let exp = 0;
  let m = abs;
  while (m < 0.1) { m *= 10; exp -= 1; }
  while (m >= 1) { m /= 10; exp += 1; }
  const mantissa = pad(m.toFixed(5).split(".")[1], 5);
  const expSign = exp >= 0 ? "+" : "-";
  return `${sign}${mantissa}${expSign}${Math.abs(exp)}`;
}

const norm = (v) => (((v % 360) + 360) % 360);

function buildTle(noradId, s) {
  const cat = pad(noradId, 5);
  const ecc = pad(Math.round(s.ecc * 1e7), 7);
  const nddot = " 00000-0";
  const bstar = formatSci(s.bstar ?? 0);
  const ndot = formatNdott(s.ndot ?? 0);
  const elset = "0001";

  const l1raw =
    `1 ${cat}U 00000A   ${EPOCH} ${ndot} ${nddot} ${bstar} 0 ${elset}`;
  const l1 = (l1raw + checksum(l1raw)).slice(0, 69);

  const inc = formatFloat(norm(s.inc), 8, 4);
  const raan = formatFloat(norm(s.raan ?? 0), 8, 4);
  const argp = formatFloat(norm(s.argp ?? 0), 8, 4);
  const ma = formatFloat(norm(s.ma ?? 0), 8, 4);
  const mm = formatFloat(s.mm, 11, 8);
  const revnum = "00000";

  const l2raw =
    `2 ${cat} ${inc} ${raan} ${ecc} ${argp} ${ma} ${mm} ${revnum}`;
  const l2 = (l2raw + checksum(l2raw)).slice(0, 69);

  return { line1: l1, line2: l2 };
}

// ---------------------------------------------------------------------------
// Curated favorites (real names / NORAD IDs) with explicit element choices.
// Fields: name, category, noradId, inc, ecc, argp, ma, mm, raan[, ndot, bstar]
// ---------------------------------------------------------------------------
const CATALOG = [
  // ISS / Crewed
  { name: "ISS (ZARYA)", category: "ISS/Crewed", noradId: 25544, inc: 51.64, raan: 350, ecc: 0.0002, argp: 99.5, ma: 260.5, mm: 15.4954, ndot: 0.00016648, bstar: 0.00002 },
  { name: "TIANGONG", category: "ISS/Crewed", noradId: 41765, inc: 41.5, raan: 210, ecc: 0.0004, argp: 130, ma: 240, mm: 15.6160, ndot: 0.00015, bstar: 0.00003 },

  // Science
  { name: "HUBBLE SPACE TELESCOPE", category: "Science", noradId: 20580, inc: 28.47, raan: 190, ecc: 0.0003, argp: 180, ma: 175, mm: 15.0927, ndot: 0.00000011, bstar: 0.00002 },
  { name: "CHANDRA", category: "Science", noradId: 25867, inc: 28.5, raan: 30, ecc: 0.4, argp: 120, ma: 200, mm: 1.3260, ndot: 0, bstar: 0 },
  { name: "XMM-NEWTON", category: "Science", noradId: 25989, inc: 70, raan: 300, ecc: 0.45, argp: 100, ma: 250, mm: 1.3882, ndot: 0, bstar: 0 },
  { name: "TERRA", category: "Science", noradId: 25994, inc: 98.21, raan: 130, ecc: 0.0001, argp: 90, ma: 270, mm: 14.5719, ndot: 0.0000015, bstar: 0.00002 },
  { name: "AQUA", category: "Science", noradId: 27424, inc: 98.2, raan: 220, ecc: 0.0001, argp: 80, ma: 280, mm: 14.5712, ndot: 0.00000156, bstar: 0.00002 },
  { name: "SWIFT", category: "Science", noradId: 28485, inc: 20.5, raan: 200, ecc: 0.0012, argp: 30, ma: 120, mm: 14.72, ndot: 0.000001, bstar: 0.00003 },
  { name: "CALIPSO", category: "Science", noradId: 29108, inc: 98.2, raan: 250, ecc: 0.0001, argp: 90, ma: 90, mm: 14.5719, ndot: 0.000001, bstar: 0.00001 },
  { name: "CLOUDSAT", category: "Science", noradId: 29107, inc: 98.2, raan: 255, ecc: 0.0001, argp: 90, ma: 180, mm: 14.5719, ndot: 0.000001, bstar: 0.00001 },
  { name: "FERMI", category: "Science", noradId: 33053, inc: 25.6, raan: 180, ecc: 0.0015, argp: 60, ma: 100, mm: 15.5, ndot: 0.000001, bstar: 0.00004 },
  { name: "SDO", category: "Science", noradId: 36395, inc: 28.5, raan: 0, ecc: 0.0005, argp: 0, ma: 0, mm: 1.0027, ndot: 0, bstar: 0.00001 },
  { name: "LANDSAT-8", category: "Science", noradId: 39084, inc: 98.22, raan: 290, ecc: 0.0001, argp: 90, ma: 270, mm: 14.5717, ndot: 0.00000126, bstar: 0.00001 },
  { name: "GPM", category: "Science", noradId: 39574, inc: 65, raan: 90, ecc: 0.0001, argp: 90, ma: 180, mm: 15.48, ndot: 0.0000015, bstar: 0.00003 },
  { name: "OCO-2", category: "Science", noradId: 40059, inc: 98.2, raan: 115, ecc: 0.0001, argp: 90, ma: 0, mm: 14.5719, ndot: 0.0000015, bstar: 0.00001 },
  { name: "SMAP", category: "Science", noradId: 40376, inc: 98.1, raan: 160, ecc: 0.0001, argp: 90, ma: 270, mm: 14.5719, ndot: 0.00000153, bstar: 0.00001 },
  { name: "SENTINEL-2A", category: "Science", noradId: 40697, inc: 98.57, raan: 240, ecc: 0.0001, argp: 100, ma: 260, mm: 14.307, ndot: 0.00000091, bstar: 0.00001 },
  { name: "SENTINEL-2B", category: "Science", noradId: 42063, inc: 98.57, raan: 60, ecc: 0.0001, argp: 100, ma: 200, mm: 14.307, ndot: 0.0000009, bstar: 0.00001 },
  { name: "SWOT", category: "Science", noradId: 43478, inc: 77.6, raan: 330, ecc: 0.0004, argp: 90, ma: 300, mm: 14.004, ndot: 0.0000008, bstar: 0.00002 },
  { name: "GRACE-FO", category: "Science", noradId: 43476, inc: 89, raan: 240, ecc: 0.0012, argp: 0, ma: 30, mm: 15.04, ndot: 0.0000009, bstar: 0.00003 },
  { name: "ICESAT-2", category: "Science", noradId: 43613, inc: 92, raan: 260, ecc: 0.0001, argp: 90, ma: 90, mm: 15.056, ndot: 0.0000008, bstar: 0.00003 },
  { name: "LANDSAT-9", category: "Science", noradId: 49260, inc: 98.22, raan: 295, ecc: 0.0001, argp: 90, ma: 270, mm: 14.5711, ndot: 0.0000012, bstar: 0.00001 },

  // Weather
  { name: "NOAA-15", category: "Weather", noradId: 25338, inc: 98.73, raan: 40, ecc: 0.0011, argp: 60, ma: 300, mm: 14.2482, ndot: 0.0000022, bstar: 0.0002 },
  { name: "NOAA-18", category: "Weather", noradId: 28654, inc: 98.74, raan: 120, ecc: 0.0014, argp: 70, ma: 290, mm: 14.1289, ndot: 0.0000036, bstar: 0.0002 },
  { name: "NOAA-19", category: "Weather", noradId: 33591, inc: 99.18, raan: 200, ecc: 0.0013, argp: 90, ma: 270, mm: 14.1251, ndot: 0.0000031, bstar: 0.0002 },
  { name: "SUOMI NPP", category: "Weather", noradId: 37849, inc: 98.71, raan: 310, ecc: 0.0001, argp: 90, ma: 270, mm: 14.1917, ndot: 0.00000062, bstar: 0.00001 },
  { name: "METOP-B", category: "Weather", noradId: 38771, inc: 98.7, raan: 150, ecc: 0.0001, argp: 90, ma: 270, mm: 14.2145, ndot: 0.00000097, bstar: 0.00002 },
  { name: "GOES-16", category: "Weather", noradId: 41866, inc: 0.05, raan: 0, ecc: 0.0002, argp: 0, ma: 350, mm: 1.0027, ndot: 0, bstar: 0.00001 },
  { name: "GOES-17", category: "Weather", noradId: 43226, inc: 0.05, raan: 0, ecc: 0.0002, argp: 0, ma: 100, mm: 1.0027, ndot: 0, bstar: 0.00001 },
  { name: "HIMAWARI-9", category: "Weather", noradId: 43267, inc: 0.05, raan: 0, ecc: 0.0003, argp: 0, ma: 50, mm: 1.0027, ndot: 0, bstar: 0.00001 },
  { name: "GOES-18", category: "Weather", noradId: 47645, inc: 0.05, raan: 0, ecc: 0.0002, argp: 0, ma: 200, mm: 1.0027, ndot: 0, bstar: 0.00001 },

  // Navigation
  { name: "GPS BIIR-2 (PRN 16)", category: "GPS/Navigation", noradId: 27663, inc: 55, raan: 180, ecc: 0.01, argp: 200, ma: 160, mm: 2.0056, ndot: 0, bstar: 0.00001 },
  { name: "GPS BIIR-3 (PRN 17)", category: "GPS/Navigation", noradId: 28874, inc: 55, raan: 240, ecc: 0.009, argp: 220, ma: 140, mm: 2.0056, ndot: 0, bstar: 0.00001 },
  { name: "GALILEO FOC FM2", category: "GPS/Navigation", noradId: 41859, inc: 57.2, raan: 300, ecc: 0.0002, argp: 100, ma: 260, mm: 1.705, ndot: 0, bstar: 0.00001 },

  // Communications
  { name: "STARLINK-1007", category: "Communications", noradId: 44713, inc: 53.05, raan: 45, ecc: 0.0001, argp: 90, ma: 270, mm: 15.5604, ndot: 0.0000082, bstar: 0.00003 },
];

// ---------------------------------------------------------------------------
// Constellation groups: many members share elements and differ by RAAN /
// argument-of-perigee / mean anomaly sweeps (representative of a real fleet).
// ---------------------------------------------------------------------------
const GROUPS = [
  {
    category: "Communications",
    count: 20,
    noradBase: 44714,
    name: (i) => `STARLINK-${1010 + i}`,
    elems: { inc: 53, raan: (i) => 20 + i * 18, ecc: 0.0001, argp: 90, ma: (i) => i * 18, mm: 15.563, ndot: 0.0000082, bstar: 0.00003 },
  },
  {
    category: "Communications",
    count: 8,
    noradBase: 43001,
    name: (i) => `ONEWEB-0${pad(i + 1, 3)}`,
    elems: { inc: 87.9, raan: (i) => i * 45, ecc: 0.0002, argp: 90, ma: (i) => i * 45, mm: 13.246, ndot: 0.000003, bstar: 0.00004 },
  },
  {
    category: "Communications",
    count: 6,
    noradBase: 47501,
    name: (i) => `IRIDIUM NEXT 1${pad(600 + i, 3)}`,
    elems: { inc: 86.4, raan: (i) => 40 + i * 60, ecc: 0.0002, argp: 90, ma: (i) => i * 60, mm: 14.342, ndot: 0.000002, bstar: 0.00004 },
  },
  {
    category: "Communications",
    count: 4,
    noradBase: 39501,
    name: (i) => `O3B FM${pad(i + 1, 2)}`,
    elems: { inc: 0, raan: (i) => i * 45, ecc: 0.0002, argp: 0, ma: (i) => i * 90, mm: 5.03, ndot: 0, bstar: 0.00001 },
  },
  {
    category: "Communications",
    count: 10,
    noradBase: 26001,
    name: (i) => ["INTELSAT 39", "INTELSAT 40E", "SES-14", "SES-17", "TELSTAR 12V", "HISPASAT 30W-6", "ASTRA 2G", "EUTELSAT 5 WEST B", "GALAXY 31", "AMC-18"][i],
    elems: { inc: 0.05, raan: (i) => i * 36, ecc: 0.0002, argp: 0, ma: (i) => i * 36, mm: 1.0027, ndot: 0, bstar: 0.00001 },
  },

  {
    category: "GPS/Navigation",
    count: 8,
    noradBase: 20001,
    name: (i) => `GPS (PRN ${i + 1})`,
    elems: { inc: 55, raan: (i) => 60 + i * 45, ecc: 0.002, argp: (i) => 90 + i * 45, ma: (i) => i * 45, mm: 2.0056, ndot: 0, bstar: 0.00001 },
  },
  {
    category: "GPS/Navigation",
    count: 8,
    noradBase: 25401,
    name: (i) => `GLONASS-M (PRN ${i + 1})`,
    elems: { inc: 64.8, raan: (i) => 90 + i * 45, ecc: 0.0007, argp: (i) => i * 45, ma: (i) => i * 45, mm: 2.106, ndot: 0, bstar: 0.00002 },
  },
  {
    category: "GPS/Navigation",
    count: 8,
    noradBase: 24001,
    name: (i) => `GALILEO FOC (PRN ${i + 9})`,
    elems: { inc: 56, raan: (i) => 120 + i * 45, ecc: 0.0002, argp: (i) => 100 + i * 32, ma: (i) => i * 45, mm: 1.7053, ndot: 0, bstar: 0.00001 },
  },
  {
    category: "GPS/Navigation",
    count: 8,
    noradBase: 42401,
    name: (i) => `BEIDOU-3 MEO (PRN ${i + 11})`,
    elems: { inc: 55, raan: (i) => 150 + i * 45, ecc: 0.0001, argp: (i) => 90 + i * 45, ma: (i) => i * 45, mm: 1.7107, ndot: 0, bstar: 0.00001 },
  },

  {
    category: "Weather",
    count: 4,
    noradBase: 40001,
    name: (i) => ["METEOSAT-9", "METEOSAT-10", "METEOSAT-11", "METEOSAT-12"][i],
    elems: { inc: 0.05, raan: (i) => i * 90, ecc: 0.0003, argp: 0, ma: (i) => i * 90, mm: 1.0027, ndot: 0, bstar: 0.00001 },
  },
  {
    category: "Weather",
    count: 4,
    noradBase: 43501,
    name: (i) => ["NOAA-21 (JPSS-2)", "NOAA-22 (JPSS-3)", "NOAA-23 (JPSS-4)", "METOP-C"][i],
    elems: { inc: 98.7, raan: (i) => 40 + i * 90, ecc: 0.0002, argp: 90, ma: (i) => i * 90, mm: 14.2145, ndot: 0.0000009, bstar: 0.00002 },
  },
];

// ---------------------------------------------------------------------------

function makeGroupMember(group, i) {
  const noradId = group.noradBase + i;
  const elems = group.elems;
  const s = {
    inc: elems.inc,
    raan: typeof elems.raan === "function" ? elems.raan(i) : elems.raan,
    ecc: elems.ecc,
    argp: typeof elems.argp === "function" ? elems.argp(i) : elems.argp,
    ma: typeof elems.ma === "function" ? elems.ma(i) : elems.ma,
    mm: elems.mm,
    ndot: elems.ndot,
    bstar: elems.bstar,
  };
  return {
    id: `sat-${noradId}`,
    name: group.name(i),
    category: group.category,
    noradId,
    ...buildTle(noradId, s),
  };
}

const records = [
  ...CATALOG.map((s) => ({
    id: `sat-${s.noradId}`,
    name: s.name,
    category: s.category,
    noradId: s.noradId,
    ...buildTle(s.noradId, s),
  })),
  ...GROUPS.flatMap((group) =>
    Array.from({ length: group.count }, (_, i) => makeGroupMember(group, i))
  ),
];

const ids = new Set(records.map((r) => r.id));
const norads = new Set(records.map((r) => r.noradId));
if (ids.size !== records.length) {
  console.error(`Duplicate ids produced (${ids.size}/${records.length}).`);
  process.exit(1);
}
if (norads.size !== records.length) {
  console.error(`Duplicate noradIds produced (${norads.size}/${records.length}).`);
  process.exit(1);
}

let failures = 0;
for (const r of records) {
  try {
    const satrec = twoline2satrec(r.line1, r.line2);
    const date = new Date("2026-08-11T12:00:00Z");
    const pv = propagate(satrec, date);
    if (!pv) {
      console.error(`PROPAGATION FAILED (null): ${r.name}`);
      console.error(`  L1: ${r.line1}`);
      console.error(`  L2: ${r.line2}`);
      console.error(`  satrec.error=${satrec.error}`);
      failures++;
      continue;
    }
    const gmst = gstime(date);
    const ecf = eciToEcf(pv.position, gmst);
    const radius = Math.sqrt(ecf.x * ecf.x + ecf.y * ecf.y + ecf.z * ecf.z);
    if (!isFinite(radius) || radius < 6300 || radius > 50000) {
      console.error(`SUSPICIOUS RADIUS ${radius.toFixed(0)}: ${r.name}`);
      failures++;
      continue;
    }
    console.log(`OK  ${r.name.padEnd(26)} ${r.noradId}  r=${radius.toFixed(0)}km`);
  } catch (err) {
    console.error(`THREW: ${r.name}: ${err.message}`);
    console.error(`  L1: ${r.line1}`);
    console.error(`  L2: ${r.line2}`);
    console.error((err.stack || "").split("\n").slice(0, 5).join("\n  "));
    failures++;
  }
}

if (failures > 0) {
  console.error(`\n${failures} of ${records.length} satellites failed validation.`);
  process.exit(1);
}

const categoryCounts = CATEGORIES.map(
  (c) => `${c}: ${records.filter((r) => r.category === c).length}`
);
console.log(`\nAll ${records.length} satellites validated (${categoryCounts.join(", ")}).`);

const lines = [
  "// Generated by `npm run tles:generate`. Do not edit by hand.",
  "",
  "export type SatelliteCategory =",
  '  | "ISS/Crewed"',
  '  | "Communications"',
  '  | "GPS/Navigation"',
  '  | "Weather"',
  '  | "Science";',
  "",
  "export const SATELLITE_CATEGORIES: readonly SatelliteCategory[] = [",
  '  "ISS/Crewed",',
  '  "Communications",',
  '  "GPS/Navigation",',
  '  "Weather",',
  '  "Science",',
  "];",
  "",
  "export type Tle = {",
  "  id: string;",
  "  name: string;",
  "  category: SatelliteCategory;",
  "  noradId: number;",
  "  line1: string;",
  "  line2: string;",
  "};",
  "",
  "export const ISS_NORAD_ID = 25544;",
  "",
  "export const TLES: readonly Tle[] = [",
  ...records.map(
    (r) =>
      `  { id: "${r.id}", name: ${JSON.stringify(r.name)}, category: "${r.category}", noradId: ${r.noradId}, line1: "${r.line1}", line2: "${r.line2}" },`
  ),
  "];",
  "",
];

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outFile = path.join(rootDir, "data", "tles.ts");
fs.writeFileSync(outFile, lines.join("\n"));
console.log(`\nWrote ${records.length} TLE records to data/tles.ts`);