import type { SatelliteCategory } from "@/data/tles";

/** Crisp monochrome palette shared by every marker (no colour). */
const MONO = {
  outline: "#171717",
  outlineBright: "#52525b",
  panel: "#f4f4f5",
  panelLine: "#a1a1aa",
  body: "#d4d4d8",
  bodyBright: "#fafafa",
  antenna: "#e4e4e7",
  glyph: "#161616",
  glyphBright: "#0a0a0a",
};

/**
 * Small monochrome symbol per category so satellites stay distinguishable on
 * the globe without relying on colour. Drawn on the light-grey central body.
 */
function glyphSvg(category: SatelliteCategory, color: string): string {
  switch (category) {
    case "ISS/Crewed":
      return (
        `<circle cx="16" cy="16" r="2.1" fill="none" stroke="${color}" stroke-width="1.1"/>` +
        `<path d="M16 13.2v1.2M16 17.6v1.2M13.2 16h1.2M17.6 16h1.2" stroke="${color}" stroke-width="1" stroke-linecap="round"/>`
      );
    case "Communications":
      return (
        `<path d="M13.4 17.8v-1.8M15.2 17.8v-3M17 17.8v-4" stroke="${color}" stroke-width="1.1" stroke-linecap="round"/>`
      );
    case "GPS/Navigation":
      return (
        `<path d="M16 13.7l1.9 2.3-1.9 2.3-1.9-2.3z" fill="${color}"/>`
      );
    case "Weather":
      return (
        `<path d="M13.2 18.2l1.4-2.4M15.5 18.2l1.4-2.4M17.8 18.2l1.4-2.4" stroke="${color}" stroke-width="1.1" stroke-linecap="round"/>`
      );
    case "Science":
      return (
        `<circle cx="16" cy="16" r="2.2" fill="none" stroke="${color}" stroke-width="1.1"/>` +
        `<circle cx="16" cy="16" r="0.9" fill="${color}"/>`
      );
  }
}

/**
 * Clean, recognisable satellite billboard: a compact central body with two
 * solar-panel wings and a per-category monochrome glyph. A dark outline keeps
 * it readable against bright Earth imagery; the pale body keeps it visible on
 * dark space. `bright` renders a lighter variant (soft halo) for hover/select.
 */
export function makeSatelliteSprite(
  category: SatelliteCategory,
  bright: boolean
): string {
  const outline = bright ? MONO.outlineBright : MONO.outline;
  const panel = bright ? "#ffffff" : MONO.panel;
  const panelLine = bright ? "#c9c9ce" : MONO.panelLine;
  const body = bright ? MONO.bodyBright : MONO.body;
  const glyph = bright ? MONO.glyphBright : MONO.glyph;

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">',
    ...(bright
      ? [
          "<defs>",
          '<radialGradient id="h" cx="50%" cy="50%" r="50%">',
          '<stop offset="58%" stop-color="#ffffff" stop-opacity="0"/>',
          '<stop offset="82%" stop-color="#ffffff" stop-opacity="0.22"/>',
          '<stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>',
          "</radialGradient>",
          "</defs>",
          '<circle cx="16" cy="16" r="15.5" fill="url(#h)"/>',
        ]
      : []),
    `<g stroke="${outline}" stroke-width="1.2" stroke-linejoin="round">`,
    // Left solar-panel wing.
    `<rect x="2" y="12.5" width="10" height="7" rx="1.5" fill="${panel}"/>`,
    `<rect x="6.4" y="12.5" width="1.2" height="7" fill="${panelLine}"/>`,
    // Right solar-panel wing.
    `<rect x="20" y="12.5" width="10" height="7" rx="1.5" fill="${panel}"/>`,
    `<rect x="24.4" y="12.5" width="1.2" height="7" fill="${panelLine}"/>`,
    // Compact central body.
    `<rect x="12.8" y="10" width="6.4" height="12" rx="1.8" fill="${body}"/>`,
    "</g>",
    // Antenna.
    `<rect x="15.8" y="6" width="1.4" height="4" rx="0.7" fill="${MONO.antenna}" stroke="${outline}" stroke-width="1"/>`,
    glyphSvg(category, glyph),
    "</svg>",
  ].join("");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const baseCache: Partial<Record<SatelliteCategory, string>> = {};
const brightCache: Partial<Record<SatelliteCategory, string>> = {};

export function satelliteSprite(category: SatelliteCategory): string {
  const cached = baseCache[category];
  if (cached) return cached;
  const sprite = makeSatelliteSprite(category, false);
  baseCache[category] = sprite;
  return sprite;
}

export function satelliteSpriteBright(category: SatelliteCategory): string {
  const cached = brightCache[category];
  if (cached) return cached;
  const sprite = makeSatelliteSprite(category, true);
  brightCache[category] = sprite;
  return sprite;
}
