import { CITIES, type CityEntry } from "./cityData";

export interface CityMatch {
  name: string;
  lat: number;
  lng: number;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/\*+/g, "") // strip import artifacts like leading "**"
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface Candidate {
  key: string;
  city: CityEntry;
}

// Every city name + alias, normalized. Sorted longest-key-first so a more specific
// alias (e.g. "greater chicago area") wins over a shorter one that might also
// appear as a substring elsewhere.
const candidates: Candidate[] = CITIES.flatMap((city) => [
  { key: normalize(city.name), city },
  ...city.aliases.map((alias) => ({ key: normalize(alias), city })),
]).sort((a, b) => b.key.length - a.key.length);

/**
 * Resolves a free-text contact location (e.g. "San Francisco, CA",
 * "** Greater Chicago Area.") to a known city + coordinates, using a bundled
 * city list — no external geocoding call. Returns null when nothing matches,
 * so callers can bucket those contacts as "unmapped" instead of guessing.
 */
export function matchCityFromLocation(location: string | null | undefined): CityMatch | null {
  if (!location) return null;
  const normalized = normalize(location);
  if (!normalized) return null;

  for (const { key, city } of candidates) {
    if (!key) continue;
    // Word-boundary match so short aliases (e.g. "la") don't fire inside unrelated
    // words (e.g. "Atlanta").
    const pattern = new RegExp(`(^|[^a-z])${escapeRegExp(key)}([^a-z]|$)`);
    if (pattern.test(normalized)) {
      return { name: city.name, lat: city.lat, lng: city.lng };
    }
  }
  return null;
}
