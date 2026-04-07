const shapefile = require('shapefile');
const path = require('path');

let entityGeoJSON = null;
let municipalityGeoJSON = null;

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

    try {
        const entityPath = path.join(__dirname, '../../shaphefile Guerrero/ENTIDAD.shp');
        const muniPath = path.join(__dirname, '../../shaphefile Guerrero/MUNICIPIO.shp');

        // Load Entity (Guerrero Estado)
        entityGeoJSON = await shapefile.read(entityPath);
        
        // Load Municipalities
        municipalityGeoJSON = await shapefile.read(muniPath);

        console.log('✅ Shapefiles loaded successfully for PiP Validation');
    } catch (err) {
        console.error('❌ Error loading shapefiles:', err);
    }
}

async function isLocationInGuerrero(lat, lng) {
    await loadShapefiles();
    if (!entityGeoJSON) return true; // Fallback if failed

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
    await loadShapefiles();
    if (!municipalityGeoJSON) return true; // Fallback if failed

    // Find the feature for the given municipalityId
    // Note: The property name for muni ID depends on the shapefile. 
    // In Mexico's INE shapefiles, it's often 'CLAVE_MUNI' or 'MUNICIPIO'
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

module.exports = {
    isLocationInGuerrero,
    isLocationInMunicipality
};
