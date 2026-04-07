const shapefile = require('shapefile');
const path = require('path');

async function inspect() {
    try {
        const muniPath = path.join(__dirname, '../shaphefile Guerrero/MUNICIPIO.shp');
        const source = await shapefile.open(muniPath);
        const result = await source.read();
        console.log('Record Sample:', JSON.stringify(result.value.properties, null, 2));
        await source.close();
    } catch (err) {
        console.error('Error:', err);
    }
}
inspect();
