export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in meters (haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function distanceKm(a: LatLng, b: LatLng): number {
  return distanceMeters(a, b) / 1000;
}

export interface GeofenceResult {
  inside: boolean;
  distanceM: number;
  radiusM: number;
}

/** Whether `point` is within `radiusM` of `center`, with GPS accuracy tolerance. */
export function checkGeofence(point: LatLng, center: LatLng, radiusM: number, accuracyM = 0): GeofenceResult {
  const distanceM = distanceMeters(point, center);
  return { inside: distanceM - accuracyM <= radiusM, distanceM, radiusM };
}

export function getCurrentPosition(options: PositionOptions = { enableHighAccuracy: true, timeout: 15_000 }) {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Geolocation is not supported on this device'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}
