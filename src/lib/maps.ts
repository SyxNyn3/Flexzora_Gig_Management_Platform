/**
 * Google Maps helpers — everything degrades to a no-op when
 * VITE_GOOGLE_MAPS_API_KEY isn't set, so the app works fine before the
 * key exists. The key is a public browser key by design; restrict it in
 * Google Cloud to the Maps JavaScript + Geocoding APIs and the
 * flexzora.pro referrer.
 *
 * We only use Map + Marker + Geocoder, so instead of pulling in all of
 * @types/google.maps we declare the slice we touch.
 */

declare global {
  interface Window {
    google?: {
      maps: {
        Map: new (el: HTMLElement, opts: Record<string, unknown>) => unknown;
        Marker: new (opts: Record<string, unknown>) => unknown;
        Geocoder: new () => {
          geocode: (
            req: { address: string },
            cb: (results: GeocoderResult[] | null, status: string) => void,
          ) => void;
        };
      };
    };
  }
}

interface GeocoderResult {
  geometry: { location: { lat: () => number; lng: () => number } };
}

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

export const hasMapsKey = !!API_KEY;

let loadPromise: Promise<NonNullable<Window['google']>> | null = null;

/** Lazily inject the Maps JS script once and resolve the google namespace. */
export function loadGoogleMaps(): Promise<NonNullable<Window['google']>> {
  if (!API_KEY) return Promise.reject(new Error('VITE_GOOGLE_MAPS_API_KEY not set'));
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    if (window.google?.maps) return resolve(window.google);
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${API_KEY}&libraries=geocoding`;
    script.async = true;
    script.onload = () => (window.google ? resolve(window.google) : reject(new Error('Maps loaded without namespace')));
    script.onerror = () => reject(new Error('Maps script failed to load'));
    document.head.appendChild(script);
  });
  return loadPromise;
}

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Geocode a free-text venue address to coordinates. Returns null on no
 * key, no result, or any failure — callers treat maps as best-effort and
 * never block gig creation on it.
 */
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  if (!API_KEY || !address.trim()) return null;
  try {
    const google = await loadGoogleMaps();
    const geocoder = new google.maps.Geocoder();
    const result = await new Promise<GeocoderResult | null>((resolve) => {
      geocoder.geocode({ address }, (results, status) =>
        resolve(status === 'OK' && results?.length ? results[0] : null));
    });
    const loc = result?.geometry.location;
    return loc ? { lat: loc.lat(), lng: loc.lng() } : null;
  } catch {
    return null;
  }
}
