# Configuración de Base de Datos - Neon.tech

## 🚀 PASO 5: Importar Schema

### Ejecutar el Schema en Neon

1. **Abrir Neon Console** → Tu proyecto → SQL Editor
2. **Copiar y pegar** el contenido de `neon-schema.sql`
3. **Ejecutar** (botón "Run")

### Verificar Creación de Tablas

```sql
-- Ejecutar para verificar
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Deberías ver estas tablas:
- admins, candidates, elections, electorado_seccional
- incidents, municipalities, predictions, resultados_electorales
- survey_questions, survey_responses, surveys, users

## 🚀 PASO 6: Configurar Variables de Entorno

### Crear archivo .env.local

```bash
# Copiar .env.example a .env.local
cp .env.example .env.local
```

### Editar .env.local

```env
# Base de datos (de Neon)
DATABASE_URL=postgresql://[user]:[password]@[host]/[database]?sslmode=require

# JWT Secrets (generar nuevos seguros)
JWT_SECRET=tu-super-secreto-jwt-aqui-min-32-caracteres
ADMIN_JWT_SECRET=tu-super-secreto-admin-jwt-aqui-min-32-caracteres

# Twilio (opcional para desarrollo)
TWILIO_ACCOUNT_SID=tu-sid
TWILIO_AUTH_TOKEN=tu-token
TWILIO_PHONE_NUMBER=tu-numero

NODE_ENV=development
```

### Generar JWT Secrets Seguros

```bash
# En terminal
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 🚀 PASO 7: Probar Conexión

### Instalar dependencias si no están

```bash
npm install
```

### Crear script de prueba

```javascript
// test-connection.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ Conexión exitosa a Neon!');

    // Probar query
    const result = await client.query('SELECT COUNT(*) as tables FROM information_schema.tables WHERE table_schema = \'public\'');
    console.log(`📊 Encontradas ${result.rows[0].tables} tablas`);

    client.release();
    console.log('🎉 ¡Base de datos lista para producción!');
  } catch (error) {
    console.error('❌ Error de conexión:', error.message);
  } finally {
    await pool.end();
  }
}

testConnection();
```

### Ejecutar prueba

```bash
node test-connection.js
```

## 🚀 PASO 8: Seed de Datos Iniciales

### Ejecutar seed de admin

```bash
npm run seed-admin
```

### Cargar datos históricos (opcional para desarrollo)

```bash
node scripts/cargarDatos.js
```

## ✅ Checklist de Base de Datos

- [ ] Cuenta Neon.tech creada
- [ ] Proyecto creado
- [ ] Schema importado
- [ ] Variables de entorno configuradas
- [ ] Conexión probada
- [ ] Admin creado
- [ ] Datos de prueba cargados (opcional)

## 🔧 Próximos Pasos

Una vez completada la configuración de BD:

1. **Configurar Vercel** con las variables de entorno
2. **Deploy** a Vercel
3. **Verificar** funcionamiento en producción
4. **Configurar monitoreo** post-deployment

¿Necesitas ayuda con algún paso específico de la configuración de Neon? 🎯