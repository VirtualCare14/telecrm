/**
 * Haversine straight-line distance & GPS Geofencing verification utility (Frontend).
 * 
 * Rules:
 * - Sales Agents must be within 150m of hospital coordinates (distance <= 150).
 * - GPS accuracy must be 90m or better (accuracy <= 90).
 * - Earth radius R = 6,371,000 metres.
 */

export const MAX_PERMITTED_ACCURACY_METRES = 90;
export const MAX_PERMITTED_DISTANCE_METRES = 150;

/**
 * Calculates Haversine straight-line distance in metres between two coordinates.
 * @param {number} lat1 
 * @param {number} lon1 
 * @param {number} lat2 
 * @param {number} lon2 
 * @returns {number|null} distance in metres rounded to 1 decimal place, or null if coordinates invalid
 */
export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  if (lat1 === null || lat1 === undefined || lon1 === null || lon1 === undefined ||
      lat2 === null || lat2 === undefined || lon2 === null || lon2 === undefined) {
    return null;
  }
  const nLat1 = Number(lat1);
  const nLon1 = Number(lon1);
  const nLat2 = Number(lat2);
  const nLon2 = Number(lon2);
  if (Number.isNaN(nLat1) || Number.isNaN(nLon1) || Number.isNaN(nLat2) || Number.isNaN(nLon2)) {
    return null;
  }
  if (nLat1 < -90 || nLat1 > 90 || nLat2 < -90 || nLat2 > 90 ||
      nLon1 < -180 || nLon1 > 180 || nLon2 < -180 || nLon2 > 180) {
    return null;
  }

  const R = 6371000; // Mean Earth radius in metres
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(nLat2 - nLat1);
  const dLon = toRad(nLon2 - nLon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(nLat1)) * Math.cos(toRad(nLat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return Math.round(d * 10) / 10;
}

/**
 * Validates geofence and accuracy requirements.
 * @param {Object} params
 * @param {number} params.agentLat
 * @param {number} params.agentLng
 * @param {number} params.accuracy
 * @param {number} params.hospitalLat
 * @param {number} params.hospitalLng
 * @returns {{ allowed: boolean, distance: number|null, reason: string }}
 */
export function validateSalesAgentGeofence({ agentLat, agentLng, accuracy, hospitalLat, hospitalLng }) {
  if (hospitalLat === null || hospitalLat === undefined || hospitalLat === '' ||
      hospitalLng === null || hospitalLng === undefined || hospitalLng === '') {
    return {
      allowed: false,
      distance: null,
      reason: 'Hospital coordinates are missing or unverified. Please provide verified hospital coordinates.',
    };
  }

  const nHospLat = Number(hospitalLat);
  const nHospLng = Number(hospitalLng);
  if (Number.isNaN(nHospLat) || Number.isNaN(nHospLng) || nHospLat < -90 || nHospLat > 90 || nHospLng < -180 || nHospLng > 180) {
    return {
      allowed: false,
      distance: null,
      reason: 'Hospital coordinates are invalid.',
    };
  }

  if (agentLat === null || agentLat === undefined || agentLat === '' ||
      agentLng === null || agentLng === undefined || agentLng === '') {
    return {
      allowed: false,
      distance: null,
      reason: 'GPS coordinates have not been captured. Please acquire current GPS.',
    };
  }

  const nAgentLat = Number(agentLat);
  const nAgentLng = Number(agentLng);
  if (Number.isNaN(nAgentLat) || Number.isNaN(nAgentLng) || nAgentLat < -90 || nAgentLat > 90 || nAgentLng < -180 || nAgentLng > 180) {
    return {
      allowed: false,
      distance: null,
      reason: 'Captured GPS coordinates are out of valid range.',
    };
  }

  if (accuracy === null || accuracy === undefined || accuracy === '') {
    return {
      allowed: false,
      distance: null,
      reason: 'GPS accuracy reading is missing. Please retry GPS acquisition.',
    };
  }

  const nAccuracy = Number(accuracy);
  if (Number.isNaN(nAccuracy) || nAccuracy < 0) {
    return {
      allowed: false,
      distance: null,
      reason: 'GPS accuracy reading is invalid. Please retry GPS acquisition.',
    };
  }

  if (nAccuracy > MAX_PERMITTED_ACCURACY_METRES) {
    return {
      allowed: false,
      distance: null,
      reason: `GPS accuracy (±${Math.round(nAccuracy)}m) exceeds 90m threshold. Please retry in an open area.`,
    };
  }

  const distance = calculateHaversineDistance(nAgentLat, nAgentLng, nHospLat, nHospLng);
  if (distance === null) {
    return {
      allowed: false,
      distance: null,
      reason: 'Unable to calculate distance from hospital coordinates.',
    };
  }

  if (distance > MAX_PERMITTED_DISTANCE_METRES) {
    return {
      allowed: false,
      distance,
      reason: `Outside permitted radius: You are ${Math.round(distance)}m away (max ${MAX_PERMITTED_DISTANCE_METRES}m allowed).`,
    };
  }

  return {
    allowed: true,
    distance,
    reason: `Pass: Within ${MAX_PERMITTED_DISTANCE_METRES}m radius (${Math.round(distance)}m) with accuracy ±${Math.round(nAccuracy)}m.`,
  };
}
