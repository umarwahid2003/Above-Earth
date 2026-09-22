# Above Earth

An interactive, full-screen 3D Earth globe built with **Next.js**, **CesiumJS**, and **satellite.js**. It models active-satellite positions from current CelesTrak OMM orbital elements with SGP4, provides a smaller categorized Explore view, and can render the complete active catalog as batched GPU points. Values shown are propagation estimates, not live onboard telemetry.

## Stack

- Next.js 16 (App Router, Turbopack) + React 19
- TypeScript
- Tailwind CSS v4
- CesiumJS (client-only, no SSR)
- satellite.js (SGP4 orbital propagation)
- zustand (UI state), lucide-react (icons), clsx + tailwind-merge (utilities)

## Requirements

- Node.js 20.9+ and npm

## Setup

```bash
npm install
```

`npm install` runs `postinstall`, which copies Cesium's static runtime files (`Assets`, `ThirdParty`, `Widgets`, `Workers`) from `node_modules/cesium` into `public/cesium`. Cesium loads those files from the base URL `/cesium` (set via `window.CESIUM_BASE_URL = "/cesium"` in `components/cesium-globe.tsx`).

To re-copy those assets at any time (repeatable script):

```bash
npm run cesium:copy
```

It also runs automatically before `next dev` and `next build` via the `predev` and `prebuild` hooks.

## Satellite catalog

The server loads CelesTrak's active-satellite OMM catalog, which preserves modern six-digit NORAD catalog IDs. The Explore view is selected from that authoritative catalog by name/category; it does not pair curated names with unrelated elements. `data/active-catalog.json` is the offline fallback and can be refreshed with `node scripts/build-active-catalog.mjs`.

> Positions, velocities, and altitudes are SGP4 estimates derived from orbital elements, not live onboard telemetry. The UI reports element freshness and clearly labels stale fallback data.

## Run

Development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Production

```bash
npm run build
npm run start
```

Open [http://localhost:3000](http://localhost:3000).

## Lint / Type-check

```bash
npm run lint
npx tsc --noEmit
```

## Project structure

```
app/
  layout.tsx        # Root layout + metadata
  page.tsx          # Renders the Orbit Atlas scene
  globals.css       # Dark space theme + Cesium widget CSS + scrollbar helpers
  api/satellites/   # Route handler: OMM source pipeline (CelesTrak → cache → catalog)
  api/full-catalog/ # Route handler: complete active-satellite catalog (CelesTrak → cache)
components/
  scene.tsx            # Client layout: globe + panels + empty state
  cesium-globe.tsx     # Client-only Cesium viewer: entities, hover/click, trail, model, clock, full-catalog points
  satellite-panel.tsx  # Left glass panel: search, category chips, live count, list
  detail-panel.tsx     # Selected-satellite details (right panel / mobile bottom sheet)
  transport-controls.tsx # Bottom play/pause + 1x/10x/60x + disclosure caption
  map-control.tsx      # Earth imagery ↔ dark map toggle + data source badge
  data-status.tsx      # "Live elements / Cached / Using bundled catalog" pill
  orbital-diagnostics.tsx # Floating live readout: clock time, sim T, date, velocity
data/
  active-catalog.json # Checked-in active-satellite fallback snapshot
lib/
  orbital-data.ts   # Validated OMM fetch, freshness checks, shared cache, fallback
  orbits.ts         # Helpers for OMM/TLE facts and satellite.js records
  satellite-sprite.ts # Data-URI SVG billboard per category
store/
  satellites.ts     # zustand store: selection, playback, readiness, valid count, catalog mode + full catalog
scripts/
  copy-cesium.mjs   # Copies Cesium static assets into public/cesium
  build-active-catalog.mjs # Refreshes the checked-in OMM fallback
  generate-satellite-model.mjs # Regenerates public/models/satellite.gltf
public/cesium       # Generated Cesium runtime assets (git-ignored)
public/models       # satellite.gltf — lightweight low-poly selected-satellite model
```

## Live data

`GET /api/satellites` returns the categorized Explore selection from the freshest validated active catalog it can obtain:

1. **CelesTrak** — fetches `GROUP=active&FORMAT=csv` OMM elements and strictly validates every record.
2. **Cache** — the validated result is shared by both APIs and cached for two hours.
3. **Catalog** — if the source and cache are unavailable, only active records from the checked-in snapshot are used.

The response includes source, fetch time, fresh/stale counts, oldest/newest element epochs, and records. Elements older than 3.5 days are reported as stale; a recent cache is not mislabeled as telemetry.

## Full Catalog

`GET /api/full-catalog` returns the same validated active catalog as sorted `CatalogRecord`s. Explore and Full Catalog share one in-memory/in-flight/disk pipeline, avoiding duplicate source downloads.

- The satellite browser's mode switch toggles **Explore** and **Full Catalog · Active satellites**.
- The full catalog is fetched **only after activation** and only once; the panel shows a loading state, then the real count.
- Thousands of objects render as one batched `PointPrimitiveCollection` (small dim points, no per-object labels/icons/paths). A rolling SGP4 slice (1/12th per frame) plus cheap linear extrapolation keeps propagation cheap; the selected object is propagated exactly.
- Full interactivity is limited to the hovered/selected satellite. Search matches name or NORAD ID.
- **No silent fallback**: if the fetch fails and no cache exists the route responds `503` and the panel shows an explicit error with **Retry** and **Back to Explore** — it never substitutes the 123-satellite Explore catalog.

## Notes

- Cesium runs entirely in a client component loaded with `next/dynamic` + `ssr: false`, so no Cesium code executes on the server.
- All Cesium default UI widgets (animation, timeline, base-layer picker, geocoder, home button, scene mode picker, nav help, fullscreen, info box, selection indicator) are disabled.
- The Earth uses high-resolution Esri World Imagery tiles (`UrlTemplateImageryProvider`) with Cesium's sun-driven day/night lighting, a subtle blue atmospheric rim, and a restrained canvas-generated monochrome starfield that is hidden at default/close zoom and fades in smoothly only as the camera pulls far back (distance-driven opacity, reduced-motion aware), so the default view stays a clean black void and satellites always remain the clearest element. No global post-processing is applied, so the Earth renders full-colour and detailed; only the reference overlays are desaturated per-layer (`imageryLayer.saturation = 0`) so borders and place labels stay subtle grey annotations. The "Earth / Map" toggle switches imagery off to reveal the matte black globe (grid + borders + labels remain available). If network tiles are unavailable the globe falls back to its matte black base color without breaking.
- Satellite motion: each OMM record is parsed once with `json2satrec`; legacy TLE parsing remains only for older fallback snapshots. Every Cesium clock tick is propagated with satellite.js and converted ECI -> ECEF.
- Markers are white satellite-shaped billboards (light-grey body + two solar wings) with a small monochrome symbol per category; size and opacity — never colour — differentiate categories, and hover/selection enlarge and brighten the icon with a soft halo. Labels are hidden by default and appear for the hovered or selected satellite. Points and labels use `disableDepthTestDistance` so they never disappear behind the globe.
- Clicking a satellite (or a list row) selects it, opens the detail panel, and flies the camera to it. The selected satellite shows a glowing orbital trail (~700 sampled points).
- The detail panel shows modeled geodetic altitude, ECI orbital-speed magnitude, orbital facts, and the source element epoch.
- Per-satellite propagation failures are isolated: only the affected satellite is skipped; if no satellites are valid, a graceful empty state is shown. The viewer never crashes.
- Playback uses the Cesium simulation clock (default 60x real time); Play/Pause and 1x/10x/60x change `clock.shouldAnimate` / `clock.multiplier`.
- The selected satellite is rendered with a lightweight low-poly glTF model (`public/models/satellite.gltf`, regenerable via `npm run model:gen`) oriented to its flight direction, with a floating summary label. All other satellites use white satellite-shaped billboards which grow/brighten on hover/selection.
- A live orbital-diagnostics readout (`orbital-diagnostics.tsx`) floats in the bottom-right corner showing the simulation clock time, simulation ticks, UTC date, and the selected satellite's live velocity/altitude.
