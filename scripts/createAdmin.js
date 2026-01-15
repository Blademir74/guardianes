// backend/src/scripts/createAdmin.js
const bcrypt = require('bcrypt');
const db = require('../src/db');

/**
 * Script para crear administrador inicial
 * Uso: node src/scripts/createAdmin.js [username] [password]
 * 
 * Ejemplos:
 *   node src/scripts/createAdmin.js admin GuardianesGro2026!
 *   node src/scripts/createAdmin.js admin_prod SuperSecretPass123!
 */

async function createAdmin() {
  try {
    // Obtener username y password de argumentos
    const username = process.argv[2] || 'admin';
    const password = process.argv[3] || 'GuardianesGro2026!';

    // Validaciones
    if (username.length < 3) {
      console.error('❌ Username debe tener al menos 3 caracteres');
      process.exit(1);
    }

    if (password.length < 8) {
      console.error('❌ Password debe tener al menos 8 caracteres');
      console.error('   Recomendación: usar letras, números y símbolos');
      process.exit(1);
    }

    console.log('\n🔐 Creando administrador...');
    console.log('═══════════════════════════════════════');
    console.log('Username:', username);
    console.log('Password length:', password.length, 'caracteres');
    console.log('═══════════════════════════════════════\n');

    // Generar hash del password
    console.log('⏳ Generando hash del password...');
    const passwordHash = await bcrypt.hash(password, 10);
    console.log('✅ Hash generado exitosamente');

    // Insertar en BD (o actualizar si ya existe)
    console.log('⏳ Guardando en base de datos...');
    
    const result = await db.query(`
      INSERT INTO admins (username, password_hash, role, is_active)
      VALUES ($1, $2, 'super_admin', true)
      ON CONFLICT (username) 
      DO UPDATE SET 
        password_hash = EXCLUDED.password_hash,
        is_active = true
      RETURNING id, username, role, created_at
    `, [username, passwordHash]);

    const admin = result.rows[0];

    console.log('\n✅ ADMINISTRADOR CREADO/ACTUALIZADO EXITOSAMENTE');
    console.log('═══════════════════════════════════════════════════');
    console.log('   ID:', admin.id);
    console.log('   Username:', admin.username);
    console.log('   Role:', admin.role);
    console.log('   Created:', admin.created_at);
    console.log('═══════════════════════════════════════════════════\n');
    
    console.log('📝 CREDENCIALES DE ACCESO:');
    console.log('═══════════════════════════════════════════════════');
    console.log(`   Username: ${username}`);
    console.log(`   Password: ${password}`);
    console.log('═══════════════════════════════════════════════════\n');
    
    console.log('🌐 ACCEDER AL DASHBOARD:');
    console.log('   URL: http://localhost:3000/admin');
    console.log('   (o http://tu-dominio.com/admin en producción)\n');
    
    console.log('⚠️  IMPORTANTE:');
    console.log('   1. Guarda estas credenciales en un lugar seguro');
    console.log('   2. NUNCA las compartas por canales inseguros');
    console.log('   3. Cámbialas inmediatamente en producción');
    console.log('   4. Usa un password manager (LastPass, 1Password, etc.)\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ ERROR CREANDO ADMINISTRADOR');
    console.error('═══════════════════════════════════════════════════');
    console.error('Error:', error.message);
    console.error('═══════════════════════════════════════════════════\n');
    
    if (error.code === '42P01') {
      console.error('💡 SOLUCIÓN: La tabla "admins" no existe.');
      console.error('   Ejecuta primero el script SQL:');
      console.error('   psql -U postgres -d guardianes_db -f backend/admin-schema.sql\n');
    }
    
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 SOLUCIÓN: PostgreSQL no está corriendo.');
      console.error('   Inicia PostgreSQL primero.\n');
    }
    
    process.exit(1);
  }
}

// Ejecutar
createAdmin();