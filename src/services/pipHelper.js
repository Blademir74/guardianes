let shapefile;
try {
    shapefile = require('shapefile');
} catch (e) {
    console.warn('[PIP] Módulo shapefile no disponible. Geofencing desactivado.');
    shapefile = null;
}
const path = require('path');

let entityGeoJSON = null;
let municipalityGeoJSON = null;
let sectionGeoJSON = null;
let _loadPromise = null; // Caché de promesa para evitar cargas concurrentes

// Ray-casting algorithm for Point-in-Polygon
function pointInPolygon(point, vs) {
    const x = point[0], y = point[1];
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        const xi = vs[i][0], yi = vs[i][1];
        const xj = vs[j][0], yj = vs[j][1];
        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

async function loadShapefiles() {
    if (entityGeoJSON && municipalityGeoJSON) return;
    if (_loadPromise) return _loadPromise; // Evitar cargas concurrentes

    // Si shapefile no está disponible en este entorno, salir sin error
    if (!shapefile) {
        console.warn('[PIP] loadShapefiles() omitido: módulo shapefile no disponible.');
        return;
    }

    _loadPromise = (async () => {
        try {
            // ══════════════════════════════════════════════════════════════
            // RUTA CORREGIDA: 'shaphefile Guerrero' → 'shapefile_guerrero'
            // ══════════════════════════════════════════════════════════════
            const entityPath = path.join(__dirname, '../../shapefile_guerrero/ENTIDAD.shp');
            const muniPath = path.join(__dirname, '../../shapefile_guerrero/MUNICIPIO.shp');
            const sectionPath = path.join(__dirname, '../../shapefile_guerrero/SECCION.shp');

            entityGeoJSON = await shapefile.read(entityPath);
            municipalityGeoJSON = await shapefile.read(muniPath);
            sectionGeoJSON = await shapefile.read(sectionPath);

            console.log('✅ Shapefiles loaded successfully for PiP Validation');
        } catch (err) {
            console.error('❌ Error loading shapefiles:', err.message);
            entityGeoJSON = null;
            municipalityGeoJSON = null;
            sectionGeoJSON = null;
        }
    })();

    return _loadPromise;
}

async function isLocationInGuerrero(lat, lng) {
    // Si no hay coords, aprobar directamente
    if (lat === null || lat === undefined || lng === null || lng === undefined) return true;

    await loadShapefiles();

    // Fallback: si el módulo no cargó o los shapefiles fallaron, aprobar
    if (!entityGeoJSON) return true;

    for (const feature of entityGeoJSON.features) {
        const coords = feature.geometry.coordinates;
        if (feature.geometry.type === 'Polygon') {
            if (pointInPolygon([lng, lat], coords[0])) return true;
        } else if (feature.geometry.type === 'MultiPolygon') {
            for (const poly of coords) {
                if (pointInPolygon([lng, lat], poly[0])) return true;
            }
        }
    }
    return false;
}

async function isLocationInMunicipality(lat, lng, muniId) {
    // Si no hay coords, aprobar directamente
    if (lat === null || lat === undefined || lng === null || lng === undefined) return true;

    await loadShapefiles();

    // Fallback: si el módulo no cargó o los shapefiles fallaron, aprobar
    if (!municipalityGeoJSON) return true;

    for (const feature of municipalityGeoJSON.features) {
        const props = feature.properties;
        const featureMuniId = parseInt(props.MUNICIPIO || props.CLAVE_MUNI || props.ID || props.id, 10);

        if (featureMuniId === parseInt(muniId, 10)) {
            const coords = feature.geometry.coordinates;
            if (feature.geometry.type === 'Polygon') {
                if (pointInPolygon([lng, lat], coords[0])) return true;
            } else if (feature.geometry.type === 'MultiPolygon') {
                for (const poly of coords) {
                    if (pointInPolygon([lng, lat], poly[0])) return true;
                }
            }
        }
    }
    return false;
}

async function isLocationInSection(lat, lng, sectionId) {
    if (lat === null || lat === undefined || lng === null || lng === undefined) return true;
    await loadShapefiles();
    if (!sectionGeoJSON) return true; // Fallback

    for (const feature of sectionGeoJSON.features) {
        const props = feature.properties;
        const featureSectionId = parseInt(props.SECCION || props.seccion, 10);
        if (featureSectionId === parseInt(sectionId, 10)) {
            const coords = feature.geometry.coordinates;
            if (feature.geometry.type === 'Polygon') {
                if (pointInPolygon([lng, lat], coords[0])) return true;
            } else if (feature.geometry.type === 'MultiPolygon') {
                for (const poly of coords) {
                    if (pointInPolygon([lng, lat], poly[0])) return true;
                }
            }
        }
    }
    return false;
}

module.exports = {
    isLocationInGuerrero,
    isLocationInMunicipality,
    isLocationInSection
};