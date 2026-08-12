// Generates a lightweight, low-poly satellite model as a glTF 2.0 asset
// (embedded base64 buffer, non-indexed triangles) at public/models/satellite.gltf.
// Run with: node scripts/generate-satellite-model.mjs

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outFile = path.join(root, "public", "models", "satellite.gltf");

const FACES = [
  { normal: [1, 0, 0], corners: [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]] },
  { normal: [-1, 0, 0], corners: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { normal: [0, 1, 0], corners: [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]] },
  { normal: [0, -1, 0], corners: [[-1, -1, -1], [-1, -1, 1], [1, -1, 1], [1, -1, -1]] },
  { normal: [0, 0, 1], corners: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { normal: [0, 0, -1], corners: [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]] },
];

function makeBox(center, size) {
  const [cx, cy, cz] = center;
  const [sx, sy, sz] = size;
  const positions = [];
  const normals = [];
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const face of FACES) {
    const [nx, ny, nz] = face.normal;
    for (const corner of face.corners) {
      const px = cx + corner[0] * sx;
      const py = cy + corner[1] * sy;
      const pz = cz + corner[2] * sz;
      positions.push(px, py, pz);
      normals.push(nx, ny, nz);
      minX = Math.min(minX, px); maxX = Math.max(maxX, px);
      minY = Math.min(minY, py); maxY = Math.max(maxY, py);
      minZ = Math.min(minZ, pz); maxZ = Math.max(maxZ, pz);
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  };
}

// Satellite ~10 m across. Long axis along X (solar panels), body in the middle.
const parts = [
  { name: "body", box: makeBox([0, 0, 0], [2.4, 2.4, 3.4]) },
  { name: "panel-left", box: makeBox([-7, 0, 0], [10, 1.6, 0.35]) },
  { name: "panel-right", box: makeBox([7, 0, 0], [10, 1.6, 0.35]) },
  { name: "antenna", box: makeBox([0, 2.1, -1.6], [0.3, 0.7, 0.3]) },
];

const bufferChunks = [];
for (const part of parts) {
  bufferChunks.push(Buffer.from(part.box.positions.buffer));
  bufferChunks.push(Buffer.from(part.box.normals.buffer));
}
const bin = Buffer.concat(bufferChunks);

const bufferViews = [];
const accessors = [];
for (const part of parts) {
  const { positions, normals, min, max } = part.box;
  bufferViews.push({
    buffer: 0,
    byteOffset: 0, // patched below
    byteLength: positions.byteLength,
  });
  accessors.push({
    bufferView: 0, // patched below
    componentType: 5126,
    count: positions.length / 3,
    type: "VEC3",
    min,
    max,
  });
  bufferViews.push({
    buffer: 0,
    byteOffset: 0, // patched below
    byteLength: normals.byteLength,
  });
  accessors.push({
    bufferView: 0, // patched below
    componentType: 5126,
    count: normals.length / 3,
    type: "VEC3",
  });
}

let offset = 0;
for (let i = 0; i < bufferViews.length; i += 2) {
  bufferViews[i].byteOffset = offset;
  bufferViews[i + 1].byteOffset = offset + parts[i / 2].box.positions.byteLength;
  accessors[i].bufferView = i;
  accessors[i + 1].bufferView = i + 1;
  offset += parts[i / 2].box.positions.byteLength * 2;
}

const gltf = {
  asset: {
    version: "2.0",
    generator: "orbit-atlas generate-satellite-model",
  },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [
    { name: "satellite", children: [1, 2, 3, 4] },
    { name: "body", mesh: 0 },
    { name: "panel-left", mesh: 1 },
    { name: "panel-right", mesh: 2 },
    { name: "antenna", mesh: 3 },
  ],
  meshes: [
    { name: "body", primitives: [{ mode: 4, attributes: { POSITION: 0, NORMAL: 1 }, material: 0 }] },
    { name: "panel-left", primitives: [{ mode: 4, attributes: { POSITION: 2, NORMAL: 3 }, material: 1 }] },
    { name: "panel-right", primitives: [{ mode: 4, attributes: { POSITION: 4, NORMAL: 5 }, material: 1 }] },
    { name: "antenna", primitives: [{ mode: 4, attributes: { POSITION: 6, NORMAL: 7 }, material: 2 }] },
  ],
  materials: [
    {
      name: "body",
      pbrMetallicRoughness: {
        baseColorFactor: [0.85, 0.89, 0.93, 1],
        metallicFactor: 0.5,
        roughnessFactor: 0.4,
      },
    },
    {
      name: "solar-panel",
      pbrMetallicRoughness: {
        baseColorFactor: [0.08, 0.08, 0.08, 1],
        metallicFactor: 0.8,
        roughnessFactor: 0.35,
      },
      emissiveFactor: [0.45, 0.45, 0.47],
    },
    {
      name: "antenna",
      pbrMetallicRoughness: {
        baseColorFactor: [0.96, 0.97, 0.98, 1],
        metallicFactor: 0.85,
        roughnessFactor: 0.25,
      },
    },
  ],
  buffers: [
    {
      byteLength: bin.byteLength,
      uri: `data:application/octet-stream;base64,${bin.toString("base64")}`,
    },
  ],
  bufferViews,
  accessors,
};

await mkdir(path.dirname(outFile), { recursive: true });
await writeFile(outFile, JSON.stringify(gltf, null, 1), "utf8");

// Round-trip verification.
const raw = await (await import("node:fs/promises")).readFile(outFile, "utf8");
const parsed = JSON.parse(raw);
const bufView = parsed.buffers[0];
const b64 = bufView.uri.split(",")[1];
const decoded = Buffer.from(b64, "base64");
const expected = parsed.bufferViews.reduce((sum, v) => sum + v.byteLength, 0);
console.log(
  `Wrote ${outFile} (${raw.length} bytes json, ${decoded.length} bytes binary).`
);
console.log(
  decoded.byteLength === bufView.byteLength && decoded.byteLength === expected
    ? `Verify OK: accessors=${parsed.accessors.length}, meshes=${parsed.meshes.length}, total binary=${decoded.length}`
    : "VERIFY FAILED: byte length mismatch"
);