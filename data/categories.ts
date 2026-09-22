export const SATELLITE_CATEGORIES = [
  "ISS/Crewed",
  "Communications",
  "GPS/Navigation",
  "Weather",
  "Science",
] as const;

export type SatelliteCategory = (typeof SATELLITE_CATEGORIES)[number];
