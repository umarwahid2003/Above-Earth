import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Prefer minified production Build/Cesium; fallback to Build/CesiumUnminified
let sourceDir = path.join(
  rootDir,
  "node_modules",
  "cesium",
  "Build",
  "Cesium"
);

if (!fs.existsSync(sourceDir)) {
  sourceDir = path.join(
    rootDir,
    "node_modules",
    "cesium",
    "Build",
    "CesiumUnminified"
  );
}

const assets = ["Assets", "ThirdParty", "Widgets", "Workers"];
const destinationDir = path.join(rootDir, "public", "cesium");

if (!fs.existsSync(sourceDir)) {
  console.error(
    `Cesium package not found at ${sourceDir}. Run \`npm install\` first.`
  );
  process.exit(1);
}

fs.rmSync(destinationDir, { recursive: true, force: true });
fs.mkdirSync(destinationDir, { recursive: true });

// Copy directories
for (const asset of assets) {
  const from = path.join(sourceDir, asset);
  const to = path.join(destinationDir, asset);
  if (!fs.existsSync(from)) {
    console.warn(`Skipping missing asset directory: ${asset}`);
    continue;
  }
  fs.cpSync(from, to, { recursive: true });
}

// Copy Cesium.js standalone bundle if present
const cesiumJsFrom = path.join(sourceDir, "Cesium.js");
const cesiumJsTo = path.join(destinationDir, "Cesium.js");
if (fs.existsSync(cesiumJsFrom)) {
  fs.copyFileSync(cesiumJsFrom, cesiumJsTo);
}

let totalFiles = 0;
totalFiles += countFiles(destinationDir);

console.log(`Cesium static assets copied to public/cesium (${totalFiles} files).`);

function countFiles(dir) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countFiles(fullPath);
    } else {
      count += 1;
    }
  }
  return count;
}