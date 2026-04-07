const { isLocationInGuerrero, isLocationInMunicipality } = require('../services/pipHelper');

function toNumberOrNull(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

/**
 * Validates if the given coordinates are within the required territory.
 * Uses surgical PiP (Point-in-Polygon) with official shapefiles.
 */
async function computeLocationStatus({ dbClient, survey, latitude, longitude }) {
  const lat = toNumberOrNull(latitude);
  const lon = toNumberOrNull(longitude);

  if (lat === null || lon === null) {
    return { locationStatus: 'NO_GPS', latitude: null, longitude: null };
  }

  // Determine levels based on survey data
  const levelRaw = (survey?.level || '').toString().toLowerCase();
  const electionTypeRaw = (survey?.election_type || '').toString().toLowerCase();
  const isStateLevel =
    survey?.municipality_id == null ||
    electionTypeRaw === 'gubernatura' ||
    levelRaw === 'estado' ||
    levelRaw.includes('distrit');

  try {
    if (isStateLevel) {
      // Surgical PiP for Guerrero State
      const inGuerrero = await isLocationInGuerrero(lat, lon);
      return {
        locationStatus: inGuerrero ? 'IN_RANGE' : 'OUT_OF_RANGE',
        latitude: lat,
        longitude: lon
      };
    }

    // Surgical PiP for Municipality
    const municipalityId = survey?.municipality_id ? parseInt(survey.municipality_id, 10) : null;
    if (municipalityId) {
      const inMuni = await isLocationInMunicipality(lat, lon, municipalityId);
      return {
        locationStatus: inMuni ? 'IN_RANGE' : 'OUT_OF_RANGE',
        latitude: lat,
        longitude: lon
      };
    }

    // Fallback if no municipalityId is present but not state level
    return { locationStatus: 'UNKNOWN', latitude: lat, longitude: lon };
  } catch (err) {
    console.error('⚠️ Territorial Validation Error:', err.message);
    // Fallback to unknown instead of failing the vote to maintain system availability
    return { locationStatus: 'UNKNOWN', latitude: lat, longitude: lon };
  }
}

module.exports = { computeLocationStatus };


