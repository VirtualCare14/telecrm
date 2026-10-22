/**
 * Haversine straight-line distance & GPS Geofencing verification utility.
 * 
 * Rules:
 * - Sales Agents must be within 150m of hospital coordinates (distance <= 150).
 * - GPS accuracy must be 90m or better (accuracy <= 90).
 * - Earth radius R = 6,371,000 metres.
 */

const MAX_PERMITTED_ACCURACY_METRES = 90;
const MAX_PERMITTED_DISTANCE_METRES = 150;

/**
 * Calculates Haversine straight-line distance in metres between two coordinates.
 * @param {number} lat1 
 * @param {number} lon1 
 * @param {number} lat2 
 * @param {number} lon2 
 * @returns {number|null} distance in metres rounded to 1 decimal place, or null if coordinates invalid
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
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
 * Validates geofence and accuracy requirements for a Sales Agent.
 * @param {Object} params
 * @param {number} params.agentLat
 * @param {number} params.agentLng
 * @param {number} params.accuracy
 * @param {number} params.hospitalLat
 * @param {number} params.hospitalLng
 * @returns {{ allowed: boolean, distance: number|null, reason: string, statusCode: number }}
 */
function validateSalesAgentGeofence({ agentLat, agentLng, accuracy, hospitalLat, hospitalLng }) {
  // 1. Verify hospital coordinates exist
  if (hospitalLat === null || hospitalLat === undefined || hospitalLat === '' ||
      hospitalLng === null || hospitalLng === undefined || hospitalLng === '') {
    return {
      allowed: false,
      distance: null,
      reason: 'Cannot verify geofence: Hospital coordinates are missing or unverified. Please provide verified hospital coordinates or contact an Administrator.',
      statusCode: 400,
    };
  }

  const nHospLat = Number(hospitalLat);
  const nHospLng = Number(hospitalLng);
  if (Number.isNaN(nHospLat) || Number.isNaN(nHospLng) || nHospLat < -90 || nHospLat > 90 || nHospLng < -180 || nHospLng > 180) {
    return {
      allowed: false,
      distance: null,
      reason: 'Cannot verify geofence: Hospital coordinates are invalid. Please provide valid hospital coordinates.',
      statusCode: 400,
    };
  }

  // 2. Verify agent GPS coordinates are provided
  if (agentLat === null || agentLat === undefined || agentLat === '' ||
      agentLng === null || agentLng === undefined || agentLng === '') {
    return {
      allowed: false,
      distance: null,
      reason: 'Valid GPS coordinates are required for Sales Agents. Please enable GPS and allow location access.',
      statusCode: 400,
    };
  }

  const nAgentLat = Number(agentLat);
  const nAgentLng = Number(agentLng);
  if (Number.isNaN(nAgentLat) || Number.isNaN(nAgentLng) || nAgentLat < -90 || nAgentLat > 90 || nAgentLng < -180 || nAgentLng > 180) {
    return {
      allowed: false,
      distance: null,
      reason: 'Captured GPS coordinates are out of valid range [-90..90, -180..180].',
      statusCode: 400,
    };
  }

  // 3. Verify accuracy <= 90
  if (accuracy === null || accuracy === undefined || accuracy === '') {
    return {
      allowed: false,
      distance: null,
      reason: 'GPS accuracy reading is missing. Please retry GPS acquisition.',
      statusCode: 400,
    };
  }

  const nAccuracy = Number(accuracy);
  if (Number.isNaN(nAccuracy) || nAccuracy < 0) {
    return {
      allowed: false,
      distance: null,
      reason: 'GPS accuracy reading is invalid. Please retry GPS acquisition.',
      statusCode: 400,
    };
  }

  if (nAccuracy > MAX_PERMITTED_ACCURACY_METRES) {
    return {
      allowed: false,
      distance: null,
      reason: `GPS accuracy (±${Math.round(nAccuracy)}m) exceeds the permitted threshold of ${MAX_PERMITTED_ACCURACY_METRES} metres. Please retry GPS acquisition in an open area.`,
      statusCode: 400,
    };
  }

  // 4. Calculate straight-line distance
  const distance = calculateHaversineDistance(nAgentLat, nAgentLng, nHospLat, nHospLng);
  if (distance === null) {
    return {
      allowed: false,
      distance: null,
      reason: 'Unable to calculate distance between GPS location and hospital coordinates.',
      statusCode: 400,
    };
  }

  // 5. Verify distance <= 150
  if (distance > MAX_PERMITTED_DISTANCE_METRES) {
    return {
      allowed: false,
      distance,
      reason: `Location verification failed: You are ${Math.round(distance)} metres away from the verified hospital location. Sales Agents must be within ${MAX_PERMITTED_DISTANCE_METRES} metres.`,
      statusCode: 403,
    };
  }

  return {
    allowed: true,
    distance,
    reason: `Verified within ${MAX_PERMITTED_DISTANCE_METRES}m radius (${Math.round(distance)}m away, accuracy ±${Math.round(nAccuracy)}m).`,
    statusCode: 200,
  };
}

module.exports = {
  calculateHaversineDistance,
  validateSalesAgentGeofence,
  MAX_PERMITTED_ACCURACY_METRES,
  MAX_PERMITTED_DISTANCE_METRES,
};
