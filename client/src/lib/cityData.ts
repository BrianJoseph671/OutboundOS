export interface CityEntry {
  name: string;
  lat: number;
  lng: number;
  /** Alternate phrasings this city should also match, e.g. LinkedIn-style "Greater X Area" text. */
  aliases: string[];
}

/**
 * A bundled list of major world cities/metros, used to resolve free-text contact
 * locations (e.g. "San Francisco, CA", "Greater Chicago Area") to map coordinates
 * without any external geocoding API. See matchCityFromLocation.ts for the matcher.
 */
export const CITIES: CityEntry[] = [
  // ── United States ──────────────────────────────────────────────────────────
  { name: "New York", lat: 40.7128, lng: -74.006, aliases: ["nyc", "new york city", "greater new york city area", "manhattan", "brooklyn"] },
  { name: "San Francisco", lat: 37.7749, lng: -122.4194, aliases: ["sf", "bay area", "san francisco bay area", "sf bay area"] },
  { name: "Los Angeles", lat: 34.0522, lng: -118.2437, aliases: ["la", "greater los angeles area", "l.a."] },
  { name: "Chicago", lat: 41.8781, lng: -87.6298, aliases: ["greater chicago area", "chicagoland"] },
  { name: "Boston", lat: 42.3601, lng: -71.0589, aliases: ["greater boston area", "greater boston"] },
  { name: "Washington", lat: 38.9072, lng: -77.0369, aliases: ["washington dc", "washington d.c.", "dc", "d.c.", "greater washington dc area"] },
  { name: "Seattle", lat: 47.6062, lng: -122.3321, aliases: ["greater seattle area"] },
  { name: "Austin", lat: 30.2672, lng: -97.7431, aliases: ["greater austin area"] },
  { name: "Denver", lat: 39.7392, lng: -104.9903, aliases: ["greater denver area", "denver metro area"] },
  { name: "Atlanta", lat: 33.749, lng: -84.388, aliases: ["greater atlanta area"] },
  { name: "Miami", lat: 25.7617, lng: -80.1918, aliases: ["greater miami area", "south florida"] },
  { name: "Dallas", lat: 32.7767, lng: -96.797, aliases: ["dallas-fort worth", "dfw", "dallas fort worth metroplex"] },
  { name: "Houston", lat: 29.7604, lng: -95.3698, aliases: ["greater houston"] },
  { name: "Philadelphia", lat: 39.9526, lng: -75.1652, aliases: ["philly", "greater philadelphia area"] },
  { name: "Phoenix", lat: 33.4484, lng: -112.074, aliases: ["greater phoenix area", "phoenix metro area"] },
  { name: "San Diego", lat: 32.7157, lng: -117.1611, aliases: ["greater san diego area"] },
  { name: "San Jose", lat: 37.3382, lng: -121.8863, aliases: ["san jose ca"] },
  { name: "Detroit", lat: 42.3314, lng: -83.0458, aliases: ["greater detroit area"] },
  { name: "Minneapolis", lat: 44.9778, lng: -93.265, aliases: ["twin cities", "minneapolis-st. paul", "greater minneapolis"] },
  { name: "Portland", lat: 45.5152, lng: -122.6784, aliases: ["greater portland area", "pdx"] },
  { name: "Nashville", lat: 36.1627, lng: -86.7816, aliases: ["greater nashville area"] },
  { name: "Charlotte", lat: 35.2271, lng: -80.8431, aliases: ["greater charlotte area"] },
  { name: "Raleigh", lat: 35.7796, lng: -78.6382, aliases: ["raleigh-durham", "research triangle", "rtp"] },
  { name: "Salt Lake City", lat: 40.7608, lng: -111.891, aliases: ["greater salt lake city area", "slc"] },
  { name: "Las Vegas", lat: 36.1699, lng: -115.1398, aliases: ["greater las vegas area", "vegas"] },
  { name: "Pittsburgh", lat: 40.4406, lng: -79.9959, aliases: ["greater pittsburgh area"] },
  { name: "Baltimore", lat: 39.2904, lng: -76.6122, aliases: ["greater baltimore area"] },
  { name: "St. Louis", lat: 38.627, lng: -90.1994, aliases: ["saint louis", "greater st. louis area"] },
  { name: "Indianapolis", lat: 39.7684, lng: -86.1581, aliases: ["greater indianapolis area", "indy"] },
  { name: "Columbus", lat: 39.9612, lng: -82.9988, aliases: ["greater columbus area"] },
  { name: "Kansas City", lat: 39.0997, lng: -94.5786, aliases: ["greater kansas city area"] },
  { name: "Sacramento", lat: 38.5816, lng: -121.4944, aliases: ["greater sacramento area"] },
  { name: "Orlando", lat: 28.5383, lng: -81.3792, aliases: ["greater orlando area"] },
  { name: "Tampa", lat: 27.9506, lng: -82.4572, aliases: ["tampa bay area", "greater tampa bay area"] },
  { name: "Cincinnati", lat: 39.1031, lng: -84.512, aliases: ["greater cincinnati area"] },
  { name: "Cleveland", lat: 41.4993, lng: -81.6944, aliases: ["greater cleveland area"] },
  { name: "Milwaukee", lat: 43.0389, lng: -87.9065, aliases: ["greater milwaukee area"] },
  { name: "New Orleans", lat: 29.9511, lng: -90.0715, aliases: ["greater new orleans area", "nola"] },
  { name: "South Bend", lat: 41.6764, lng: -86.2519, aliases: ["michiana"] },
  { name: "Providence", lat: 41.824, lng: -71.4128, aliases: ["greater providence area"] },
  { name: "Richmond", lat: 37.5407, lng: -77.436, aliases: ["greater richmond area"] },
  { name: "Chattanooga", lat: 35.0456, lng: -85.3097, aliases: ["greater chattanooga area"] },
  { name: "Ann Arbor", lat: 42.2808, lng: -83.743, aliases: [] },
  { name: "Boulder", lat: 40.015, lng: -105.2705, aliases: [] },
  { name: "Palo Alto", lat: 37.4419, lng: -122.143, aliases: ["silicon valley"] },
  { name: "Guam", lat: 13.4443, lng: 144.7937, aliases: [] },

  // ── Canada ─────────────────────────────────────────────────────────────────
  { name: "Toronto", lat: 43.6532, lng: -79.3832, aliases: ["greater toronto area", "gta"] },
  { name: "Vancouver", lat: 49.2827, lng: -123.1207, aliases: ["greater vancouver area"] },
  { name: "Montreal", lat: 45.5019, lng: -73.5674, aliases: ["greater montreal area"] },
  { name: "Ottawa", lat: 45.4215, lng: -75.6972, aliases: [] },
  { name: "Calgary", lat: 51.0447, lng: -114.0719, aliases: [] },

  // ── UK & Ireland ───────────────────────────────────────────────────────────
  { name: "London", lat: 51.5072, lng: -0.1276, aliases: ["greater london area", "london, uk", "london, england"] },
  { name: "Manchester", lat: 53.4808, lng: -2.2426, aliases: [] },
  { name: "Edinburgh", lat: 55.9533, lng: -3.1883, aliases: [] },
  { name: "Dublin", lat: 53.3498, lng: -6.2603, aliases: ["dublin, ireland"] },

  // ── Western Europe ─────────────────────────────────────────────────────────
  { name: "Paris", lat: 48.8566, lng: 2.3522, aliases: ["paris, france"] },
  { name: "Berlin", lat: 52.52, lng: 13.405, aliases: [] },
  { name: "Munich", lat: 48.1351, lng: 11.582, aliases: [] },
  { name: "Frankfurt", lat: 50.1109, lng: 8.6821, aliases: [] },
  { name: "Amsterdam", lat: 52.3676, lng: 4.9041, aliases: [] },
  { name: "Brussels", lat: 50.8503, lng: 4.3517, aliases: [] },
  { name: "Zurich", lat: 47.3769, lng: 8.5417, aliases: [] },
  { name: "Geneva", lat: 46.2044, lng: 6.1432, aliases: [] },
  { name: "Madrid", lat: 40.4168, lng: -3.7038, aliases: [] },
  { name: "Barcelona", lat: 41.3851, lng: 2.1734, aliases: [] },
  { name: "Lisbon", lat: 38.7223, lng: -9.1393, aliases: [] },
  { name: "Milan", lat: 45.4642, lng: 9.19, aliases: [] },
  { name: "Rome", lat: 41.9028, lng: 12.4964, aliases: [] },
  { name: "Vienna", lat: 48.2082, lng: 16.3738, aliases: [] },
  { name: "Copenhagen", lat: 55.6761, lng: 12.5683, aliases: [] },
  { name: "Stockholm", lat: 59.3293, lng: 18.0686, aliases: [] },
  { name: "Oslo", lat: 59.9139, lng: 10.7522, aliases: [] },
  { name: "Helsinki", lat: 60.1699, lng: 24.9384, aliases: [] },

  // ── Eastern Europe ─────────────────────────────────────────────────────────
  { name: "Warsaw", lat: 52.2297, lng: 21.0122, aliases: [] },
  { name: "Prague", lat: 50.0755, lng: 14.4378, aliases: [] },
  { name: "Budapest", lat: 47.4979, lng: 19.0402, aliases: [] },

  // ── Middle East ────────────────────────────────────────────────────────────
  { name: "Tel Aviv", lat: 32.0853, lng: 34.7818, aliases: ["greater tel aviv area"] },
  { name: "Dubai", lat: 25.2048, lng: 55.2708, aliases: [] },
  { name: "Abu Dhabi", lat: 24.4539, lng: 54.3773, aliases: [] },
  { name: "Riyadh", lat: 24.7136, lng: 46.6753, aliases: [] },
  { name: "Doha", lat: 25.2854, lng: 51.531, aliases: [] },

  // ── Africa ─────────────────────────────────────────────────────────────────
  { name: "Cairo", lat: 30.0444, lng: 31.2357, aliases: [] },
  { name: "Lagos", lat: 6.5244, lng: 3.3792, aliases: [] },
  { name: "Nairobi", lat: -1.2921, lng: 36.8219, aliases: [] },
  { name: "Cape Town", lat: -33.9249, lng: 18.4241, aliases: [] },
  { name: "Johannesburg", lat: -26.2041, lng: 28.0473, aliases: [] },

  // ── South & Southeast Asia ─────────────────────────────────────────────────
  { name: "Mumbai", lat: 19.076, lng: 72.8777, aliases: [] },
  { name: "Bangalore", lat: 12.9716, lng: 77.5946, aliases: ["bengaluru"] },
  { name: "Delhi", lat: 28.7041, lng: 77.1025, aliases: ["new delhi"] },
  { name: "Hyderabad", lat: 17.385, lng: 78.4867, aliases: [] },
  { name: "Pune", lat: 18.5204, lng: 73.8567, aliases: [] },
  { name: "Singapore", lat: 1.3521, lng: 103.8198, aliases: [] },
  { name: "Bangkok", lat: 13.7563, lng: 100.5018, aliases: [] },
  { name: "Jakarta", lat: -6.2088, lng: 106.8456, aliases: [] },
  { name: "Manila", lat: 14.5995, lng: 120.9842, aliases: [] },
  { name: "Kuala Lumpur", lat: 3.139, lng: 101.6869, aliases: [] },
  { name: "Ho Chi Minh City", lat: 10.8231, lng: 106.6297, aliases: ["saigon"] },

  // ── East Asia ──────────────────────────────────────────────────────────────
  { name: "Tokyo", lat: 35.6762, lng: 139.6503, aliases: ["greater tokyo area"] },
  { name: "Osaka", lat: 34.6937, lng: 135.5023, aliases: [] },
  { name: "Seoul", lat: 37.5665, lng: 126.978, aliases: [] },
  { name: "Beijing", lat: 39.9042, lng: 116.4074, aliases: [] },
  { name: "Shanghai", lat: 31.2304, lng: 121.4737, aliases: [] },
  { name: "Shenzhen", lat: 22.5431, lng: 114.0579, aliases: [] },
  { name: "Hong Kong", lat: 22.3193, lng: 114.1694, aliases: [] },
  { name: "Taipei", lat: 25.033, lng: 121.5654, aliases: [] },

  // ── Oceania ────────────────────────────────────────────────────────────────
  { name: "Sydney", lat: -33.8688, lng: 151.2093, aliases: ["greater sydney area"] },
  { name: "Melbourne", lat: -37.8136, lng: 144.9631, aliases: ["greater melbourne area"] },
  { name: "Auckland", lat: -36.8485, lng: 174.7633, aliases: [] },

  // ── Latin America ──────────────────────────────────────────────────────────
  { name: "Mexico City", lat: 19.4326, lng: -99.1332, aliases: ["ciudad de mexico", "cdmx"] },
  { name: "São Paulo", lat: -23.5505, lng: -46.6333, aliases: ["sao paulo"] },
  { name: "Rio de Janeiro", lat: -22.9068, lng: -43.1729, aliases: ["rio"] },
  { name: "Buenos Aires", lat: -34.6037, lng: -58.3816, aliases: [] },
  { name: "Bogotá", lat: 4.711, lng: -74.0721, aliases: ["bogota"] },
  { name: "Santiago", lat: -33.4489, lng: -70.6693, aliases: [] },
];
