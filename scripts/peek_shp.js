const shapefile = require('shapefile');
const path = require('path');

async function peek() {
    try {
        const shpPath = path.join(__dirname, '../shaphefile Guerrero/SECCION.shp');
        const dbfPath = path.join(__dirname, '../shaphefile Guerrero/SECCION.dbf');
        const source = await shapefile.open(shpPath, dbfPath);
        const result = await source.read();
        console.log('Record Sample:', JSON.stringify(result.value.properties, null, 2));
        await source.close();
    } catch (err) {
        console.error('Error:', err);
    }
}

peek();
