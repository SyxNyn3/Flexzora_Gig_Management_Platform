import { describe, expect, it } from 'vitest';
import { checkGeofence, distanceKm } from '../geo';

describe('geo', () => {
  it('measures LA to Las Vegas at roughly 367 km', () => {
    expect(distanceKm({ lat: 34.0522, lng: -118.2437 }, { lat: 36.1699, lng: -115.1398 })).toBeCloseTo(367, -1);
  });

  it('accepts a point inside the geofence and rejects one outside', () => {
    const venue = { lat: 34.043, lng: -118.2673 };
    expect(checkGeofence({ lat: 34.0435, lng: -118.2675 }, venue, 250).inside).toBe(true);
    expect(checkGeofence({ lat: 34.05, lng: -118.2673 }, venue, 250).inside).toBe(false);
  });

  it('tolerates GPS accuracy at the boundary', () => {
    const venue = { lat: 34.043, lng: -118.2673 };
    const point = { lat: 34.0455, lng: -118.2673 }; // ~278 m north
    expect(checkGeofence(point, venue, 250).inside).toBe(false);
    expect(checkGeofence(point, venue, 250, 50).inside).toBe(true);
  });
});
