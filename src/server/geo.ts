import CONFIG from '../config.js';

export interface GeoCoordinate {
  latitude: number;
  longitude: number;
}

export interface HubDistanceResult {
  hubId: string;
  hubCode: string;
  hubName: string;
  latitude: number;
  longitude: number;
  physicalAddress: string;
  distanceMeters: number;
  distanceKm: number;
  bearingDegrees: number;
  cardinalDirection: string;
  geofenceRadiusM: number;
  isWithinGeofence: boolean;
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate distance between two GPS coordinates using Haversine Formula
 * Returns distance in meters.
 */
export function calculateHaversineDistance(
  coord1: GeoCoordinate,
  coord2: GeoCoordinate
): number {
  const R = CONFIG.GEO.EARTH_RADIUS_KM * 1000; // in meters
  const dLat = toRadians(coord2.latitude - coord1.latitude);
  const dLon = toRadians(coord2.longitude - coord1.longitude);

  const lat1 = toRadians(coord1.latitude);
  const lat2 = toRadians(coord2.latitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10; // 1 decimal place meter precision
}

/**
 * Calculate compass bearing from origin to target in degrees (0 - 360)
 */
export function calculateBearing(origin: GeoCoordinate, target: GeoCoordinate): number {
  const lat1 = toRadians(origin.latitude);
  const lat2 = toRadians(target.latitude);
  const dLon = toRadians(target.longitude - origin.longitude);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  const brng = Math.atan2(y, x);
  return (brng * (180 / Math.PI) + 360) % 360;
}

/**
 * Convert bearing degrees to 8-point compass cardinal
 */
export function degreesToCardinal(degrees: number): string {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'];
  const index = Math.round((degrees % 360) / 45);
  return directions[index];
}

/**
 * Find and sort all active hubs by distance from a given GPS coordinate
 */
export function findNearestHubs(
  workerCoord: GeoCoordinate,
  hubs: Array<{
    id: string;
    hubCode: string;
    name: string;
    latitude: number;
    longitude: number;
    physicalAddress: string;
    geofenceRadiusM: number;
    isActive: boolean;
  }>
): HubDistanceResult[] {
  return hubs
    .filter((h) => h.isActive)
    .map((hub) => {
      const hubCoord: GeoCoordinate = {
        latitude: hub.latitude,
        longitude: hub.longitude,
      };
      const distanceMeters = calculateHaversineDistance(workerCoord, hubCoord);
      const bearing = calculateBearing(workerCoord, hubCoord);

      return {
        hubId: hub.id,
        hubCode: hub.hubCode,
        hubName: hub.name,
        latitude: hub.latitude,
        longitude: hub.longitude,
        physicalAddress: hub.physicalAddress,
        distanceMeters,
        distanceKm: Math.round((distanceMeters / 1000) * 100) / 100,
        bearingDegrees: Math.round(bearing),
        cardinalDirection: degreesToCardinal(bearing),
        geofenceRadiusM: hub.geofenceRadiusM,
        isWithinGeofence: distanceMeters <= hub.geofenceRadiusM,
      };
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}
