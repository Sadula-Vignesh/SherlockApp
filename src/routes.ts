// Google Routes API (computeRoutes) — walking turn-by-turn.
// The legacy Directions API is superseded (Legacy since Mar 2025); Routes API is the
// current one and the only one to take an address string destination directly, so no
// separate Geocoding call is needed.
//
// parseRoute/parseDuration/distanceMeters are PURE (no network) so they are unit-tested
// in __tests__/nav.test.ts.

export interface LatLng {
  lat: number;
  lng: number;
}

export interface NavStep {
  index: number;
  instruction: string; // e.g. "Turn left toward Frontage Rd"
  maneuver: string; // e.g. "TURN_LEFT", "DEPART", "STRAIGHT"
  distanceMeters: number;
  start: LatLng;
  end: LatLng;
}

export interface Route {
  destination: string;
  distanceMeters: number;
  durationSeconds: number;
  polyline: string; // encoded polyline
  steps: NavStep[];
}

const ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';

const FIELD_MASK = [
  'routes.legs.steps.navigationInstruction',
  'routes.legs.steps.distanceMeters',
  'routes.legs.steps.startLocation',
  'routes.legs.steps.endLocation',
  'routes.distanceMeters',
  'routes.duration',
  'routes.polyline.encodedPolyline',
].join(',');

// Routes API returns duration as a string like "900s".
export function parseDuration(d: unknown): number {
  if (typeof d === 'number') {
    return d;
  }
  if (typeof d === 'string') {
    const m = d.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }
  return 0;
}

// Pure: turn a Routes API JSON response into our Route shape. Throws if no route.
export function parseRoute(json: any, destination: string): Route {
  const route = json?.routes?.[0];
  if (!route) {
    throw new Error('No route found for that destination');
  }
  const steps: NavStep[] = [];
  let idx = 0;
  for (const leg of route.legs || []) {
    for (const s of leg.steps || []) {
      steps.push({
        index: idx++,
        instruction: s.navigationInstruction?.instructions || '',
        maneuver: s.navigationInstruction?.maneuver || 'STRAIGHT',
        distanceMeters: s.distanceMeters || 0,
        start: {
          lat: s.startLocation?.latLng?.latitude ?? 0,
          lng: s.startLocation?.latLng?.longitude ?? 0,
        },
        end: {
          lat: s.endLocation?.latLng?.latitude ?? 0,
          lng: s.endLocation?.latLng?.longitude ?? 0,
        },
      });
    }
  }
  return {
    destination,
    distanceMeters: route.distanceMeters || 0,
    durationSeconds: parseDuration(route.duration),
    polyline: route.polyline?.encodedPolyline || '',
    steps,
  };
}

// Haversine distance in metres between two coords.
export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Index of the step to treat as "current": the nearest step-end still ahead, never moving
// backward from `fromIdx`. Using nearest (not a fixed threshold) is robust to GPS noise
// that overshoots a step boundary. Pure — unit-tested.
export function nearestStepAhead(
  cur: LatLng,
  steps: NavStep[],
  fromIdx: number,
): number {
  let best = fromIdx;
  let bestDist = Infinity;
  for (let i = Math.max(0, fromIdx); i < steps.length; i++) {
    const d = distanceMeters(cur, steps[i].end);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

// Have we arrived? Judged by distance to the destination (last step end), independent of
// step tracking, so a missed intermediate step can't block arrival. Pure — unit-tested.
export function isArrived(cur: LatLng, steps: NavStep[], withinM: number): boolean {
  if (steps.length === 0) {
    return true;
  }
  return distanceMeters(cur, steps[steps.length - 1].end) < withinM;
}

export async function computeWalkingRoute(
  origin: LatLng,
  destinationText: string,
  apiKey: string,
): Promise<Route> {
  if (!apiKey) {
    throw new Error('Missing Google API key. Set it in Settings.');
  }
  if (!destinationText.trim()) {
    throw new Error('No destination heard');
  }
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      origin: {location: {latLng: {latitude: origin.lat, longitude: origin.lng}}},
      destination: {address: destinationText},
      travelMode: 'WALK',
      languageCode: 'en-US',
      units: 'METRIC',
    }),
  });
  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Routes API returned a non-JSON response (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(json?.error?.message || `Routes API error ${res.status}`);
  }
  return parseRoute(json, destinationText);
}
