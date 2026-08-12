# Above Earth

An interactive, full-screen 3D Earth globe built with **Next.js** (App Router, TypeScript, Tailwind CSS), **CesiumJS**, and **satellite.js**. It renders a realistic full-colour Earth (Esri World Imagery) beneath a strictly black-and-white UI, with a curated catalog of 123 real satellites (crisp white satellite-shaped markers), propagating their positions in real time from checked-in TLE data — refreshed live from CelesTrak when available — with a searchable/filterable catalog, selectable satellites (details + orbital trail + a 3D model), an Earth/map imagery toggle, playback controls, and a live orbital-diagnostics readout. A **Full Catalog** mode switches the browser to the complete CelesTrak active-satellite set (tens of thousands of objects) rendered as batched GPU points.

## Stack

- Next.js 16 (App Router, Turbopack) + React 19
- TypeScript
- Tailwind CSS v4
- CesiumJS (client-only, no SSR)
- satellite.js (SGP4 orbital propagation; pure-JS core vendored into `lib/satellite`)
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

Checked-in Two-Line Elements for 123 satellites live in `data/tles.ts`, categorized as ISS/Crewed, Communications, GPS/Navigation, Weather, or Science. Validate every record against satellite.js (parses, propagates, and sanity-checks the resulting radius):

```bash
npm run tles:check
```

Rebuild `data/tles.ts` from the curated element table in `scripts/generate-tles.mjs`:

```bash
npm run tles:generate
```

> Positions are calculated from recent orbital elements, not live telemetry. The checked-in catalog uses epoch 2026-08-11; the server refreshes it from CelesTrak on demand and caches the result (see "Live data" below).

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
  api/satellites/   # Route handler: TLE source pipeline (CelesTrak → cache → catalog)
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
  tles.ts           # Checked-in TLE records for 123 satellites (source of truth)
lib/
  orbital-data.ts   # Server-side fetch + parse + shared active fetch + 6 h caches + full catalog
  orbits.ts         # Pure helpers: parse TLE facts (altitude, velocity, orbit type, …)
  satellite-sprite.ts # Data-URI SVG billboard per category
  satellite/        # Vendored pure-JS satellite.js core (SGP4, no wasm) + package.json
store/
  satellites.ts     # zustand store: selection, playback, readiness, valid count, catalog mode + full catalog
scripts/
  copy-cesium.mjs   # Copies Cesium static assets into public/cesium
  validate-tles.mjs # Validates data/tles.ts against satellite.js
  generate-tles.mjs # Rebuilds the curated catalog from orbital elements
  generate-satellite-model.mjs # Regenerates public/models/satellite.gltf
public/cesium       # Generated Cesium runtime assets (git-ignored)
public/models       # satellite.gltf — lightweight low-poly selected-satellite model
```

## Live data

`GET /api/satellites` returns the 123-satellite catalog with the freshest orbital elements it can obtain:

1. **CelesTrak** — fetches the `active` GP catalog and merges matching NORAD IDs over the checked-in data (fallback `GROUP=stations` is used only in tests). CelesTrak allows roughly one full download every two hours.
2. **Cache** — a successful fetch is written to `.cache/orbital-data.json` (6-hour TTL).
3. **Catalog** — if the network source fails and no cache exists, the checked-in catalog is served untouched.

The response includes `source` (`celestrak` / `cache` / `catalog`), `isStale`, `lastUpdated`, `updatedCount`, and `satellites`; the app shows the source in the status pill (`Live elements · from CelesTrak, updated…`, `Cached data…`, or `Using bundled catalog`). If the network source fails, cached data is served; if there is no cache, the checked-in catalog is used — the globe never breaks.

## Full Catalog

`GET /api/full-catalog` returns the complete CelesTrak `active` GP catalog (all currently tracked active objects — well beyond the 123 curated Explore satellites) as sorted `CatalogRecord`s (`id: cat-<noradId>`, `objectType: "active"`). The raw `GROUP=active` download is shared with the Explore pipeline (`getActiveTles` dedupes concurrent and in-flight fetches) so CelesTrak's one-download-per-update limit is never exceeded, and the result is cached to `.cache/full-catalog.json` (6-hour TTL).

- The satellite browser's mode switch (top of the panel) toggles **Explore · 123** and **Full Catalog · Active satellites**; Explore is the default and is unchanged.
- The full catalog is fetched **only after activation** and only once; the panel shows a loading state, then the real count.
- Thousands of objects render as one batched `PointPrimitiveCollection` (small dim points, no per-object labels/icons/paths). A rolling SGP4 slice (1/12th per frame) plus cheap linear extrapolation keeps propagation cheap; the selected object is propagated exactly.
- Full interactivity is limited to the hovered/selected object (hover label + enlarged point; selection shows the 3D model, summary, detail panel, and camera fly-to). Search matches name or NORAD ID; object-type toggles (Active / Rocket bodies / Debris) filter the list.
- **No silent fallback**: if the fetch fails and no cache exists the route responds `503` and the panel shows an explicit error with **Retry** and **Back to Explore** — it never substitutes the 123-satellite Explore catalog.

## Notes

- Cesium runs entirely in a client component loaded with `next/dynamic` + `ssr: false`, so no Cesium code executes on the server.
- All Cesium default UI widgets (animation, timeline, base-layer picker, geocoder, home button, scene mode picker, nav help, fullscreen, info box, selection indicator) are disabled.
- The Earth uses high-resolution Esri World Imagery tiles (`UrlTemplateImageryProvider`) with Cesium's sun-driven day/night lighting, a subtle blue atmospheric rim, and a restrained canvas-generated monochrome starfield that is hidden at default/close zoom and fades in smoothly only as the camera pulls far back (distance-driven opacity, reduced-motion aware), so the default view stays a clean black void and satellites always remain the clearest element. No global post-processing is applied, so the Earth renders full-colour and detailed; only the reference overlays are desaturated per-layer (`imageryLayer.saturation = 0`) so borders and place labels stay subtle grey annotations. The "Earth / Map" toggle switches imagery off to reveal the matte black globe (grid + borders + labels remain available). If network tiles are unavailable the globe falls back to its matte black base color without breaking.
- Satellite motion: each TLE is parsed once (`twoline2satrec`); on every Cesium clock tick the simulation time is propagated with satellite.js, converted ECI -> ECEF, scaled km -> m, and written into a positions map. Entities read that map via a `CallbackPositionProperty`, so positions are dynamic without recreating entities.
- Markers are white satellite-shaped billboards (light-grey body + two solar wings) with a small monochrome symbol per category; size and opacity — never colour — differentiate categories, and hover/selection enlarge and brighten the icon with a soft halo. Labels are hidden by default and appear for the hovered or selected satellite. Points and labels use `disableDepthTestDistance` so they never disappear behind the globe.
- Clicking a satellite (or a list row) selects it, opens the detail panel, and flies the camera to it. The selected satellite shows a glowing orbital trail (~700 sampled points).
- The detail panel shows NORAD ID, category, altitude, velocity, inclination, period, perigee/apogee, eccentricity, orbit type, and an "Orbital data snapshot" timestamp derived from the TLE epoch.
- Per-satellite propagation failures are isolated: only the affected satellite is skipped; if no satellites are valid, a graceful empty state is shown. The viewer never crashes.
- Playback uses the Cesium simulation clock (default 60x real time); Play/Pause and 1x/10x/60x change `clock.shouldAnimate` / `clock.multiplier`.
- The selected satellite is rendered with a lightweight low-poly glTF model (`public/models/satellite.gltf`, regenerable via `npm run model:gen`) oriented to its flight direction, with a floating summary label. All other satellites use white satellite-shaped billboards which grow/brighten on hover/selection.
- A live orbital-diagnostics readout (`orbital-diagnostics.tsx`) floats in the bottom-right corner showing the simulation clock time, simulation ticks, UTC date, and the selected satellite's live velocity/altitude.
- satellite.js v7 ships a WASM runtime that is irrelevant for this app; the SGP4 implementation was vendored into `lib/satellite` (pure ESM, no wasm) because the package's `exports` map blocks subpath imports and Turbopack hangs on the wasm entry.