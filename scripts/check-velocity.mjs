// Unit check for the velocity conversions in lib/orbits.ts.
// Run with: node scripts/check-velocity.mjs (or `npm test`).
// Node 24+ type-strips the imported .ts module; it has no runtime imports.

import { formatVelocity, formatVelocityKmh } from "../lib/orbits.ts";

const cases = [
  { fn: formatVelocityKmh, input: 7.67, expected: "27,612 km/h" },
  { fn: formatVelocityKmh, input: 0, expected: "0 km/h" },
  { fn: formatVelocityKmh, input: 11.1, expected: "39,960 km/h" },
  { fn: formatVelocity, input: 7.67, expected: "7.67 km/s" },
];

let failed = 0;
for (const { fn, input, expected } of cases) {
  const actual = fn(input);
  const ok = actual === expected;
  if (!ok) failed += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${fn.name}(${input}) -> ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`
  );
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed — velocity conversion regression.`);
  process.exit(1);
}
console.log(`\nAll ${cases.length} velocity assertions passed.`);
