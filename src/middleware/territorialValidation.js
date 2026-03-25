// src/middleware/territorialValidation.js
// Validación territorial sin datos personales:
// - Si no hay GPS: NO_GPS
// - Si hay GPS:
//   - Gubernatura/Distrital (nivel estatal): IN_RANGE / OUT_OF_RANGE por límites de Guerrero
//   - Municipal: IN_RANGE / OUT_OF_RANGE por radio desde el centro del municipio (si existe en DB)
//   - Si faltan datos para validar: UNKNOWN

function toNumberOrNull(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Bounding box aproximado del Estado de Guerrero (MX)
// Lat: ~16.0 a ~18.6  | Lon: ~-102.6 a ~-98.0
function isWithinGuerreroBBox(lat, lon) {
  return lat >= 16.0 && lat <= 18.6 && lon >= -102.6 && lon <= -98.0;
}

async function computeLocationStatus({ dbClient, survey, latitude, longitude }) {
  const lat = toNumberOrNull(latitude);
  const lon = toNumberOrNull(longitude);

  if (lat === null || lon === null) {
    return { locationStatus: 'NO_GPS', latitude: null, longitude: null };
  }

  // Nivel estatal: gubernatura o sin municipio asociado
  const levelRaw = (survey?.level || '').toString().toLowerCase();
  const electionTypeRaw = (survey?.election_type || '').toString().toLowerCase();
  const isStateLevel =
    survey?.municipality_id == null ||
    electionTypeRaw === 'gubernatura' ||
    levelRaw === 'estado' ||
    levelRaw.includes('distrit');

  if (isStateLevel) {
    return {
      locationStatus: isWithinGuerreroBBox(lat, lon) ? 'IN_RANGE' : 'OUT_OF_RANGE',
      latitude: lat,
      longitude: lon
    };
  }

  // Nivel municipal: validar por radio al centro del municipio (si hay coordenadas en tabla municipalities)
  const municipalityId = survey?.municipality_id ? parseInt(survey.municipality_id, 10) : null;
  if (!municipalityId) {
    return { locationStatus: 'UNKNOWN', latitude: lat, longitude: lon };
  }

  try {
    const muniRes = await dbClient.query(
      `SELECT latitude, longitude FROM municipalities WHERE id = $1 LIMIT 1`,
      [municipalityId]
    );
    if (!muniRes.rows.length) {
      return { locationStatus: 'UNKNOWN', latitude: lat, longitude: lon };
    }
    const mLat = toNumberOrNull(muniRes.rows[0].latitude);
    const mLon = toNumberOrNull(muniRes.rows[0].longitude);
    if (mLat === null || mLon === null) {
      return { locationStatus: 'UNKNOWN', latitude: lat, longitude: lon };
    }

    const DEFAULT_RADIUS_KM = 25; // radio práctico municipal (ajustable)
    const distanceKm = haversineKm(lat, lon, mLat, mLon);
    return {
      locationStatus: distanceKm <= DEFAULT_RADIUS_KM ? 'IN_RANGE' : 'OUT_OF_RANGE',
      latitude: lat,
      longitude: lon
    };
  } catch (_) {
    // Si el esquema no tiene lat/long, o falla la consulta, no bloquear el voto.
    return { locationStatus: 'UNKNOWN', latitude: lat, longitude: lon };
  }
}

module.exports = { computeLocationStatus };

