require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function verUsuarios() {
  try {
    console.log('Consultando usuarios en la base de datos...\n');
    const result = await pool.query('SELECT cedula_usuario, usuario, nombre_usuario, email_usuario FROM usuarios');
    
    if (result.rows.length === 0) {
      console.log('❌ No hay usuarios en la tabla.');
      console.log('\nPara crear un usuario de prueba, ejecuta este SQL:');
      console.log('\n⚠️  ESTRUCTURA: nombre_usuario=username para login, usuario=tipo/rol\n');
      console.log(`
INSERT INTO usuarios (cedula_usuario, usuario, nombre_usuario, email_usuario, password)
VALUES (12345678, 'admin', 'admin', 'admin@empresa.com', 'admin123');
      `);  
    } else {
      console.log(`✅ Se encontraron ${result.rows.length} usuario(s):\n`);
      result.rows.forEach((user, index) => {
        console.log(`Usuario ${index + 1}:`);
        console.log(`  - Cédula: ${user.cedula_usuario}`);
        console.log(`  - Tipo/Rol: ${user.usuario}`);
        console.log(`  - Username (login): ${user.nombre_usuario}`);
        console.log(`  - Email: ${user.email_usuario}`);
        console.log('');
      });
      
      console.log('⚠️  IMPORTANTE:');
      console.log('   - Para iniciar sesión, usa el valor de "Username (login)"');
      console.log('   - El campo "Tipo/Rol" indica los permisos del usuario (admin, vendedor, etc.)');
    }
    
    await pool.end();
  } catch (error) {
    console.error('Error al consultar la base de datos:', error.message);
    process.exit(1);
  }
}

verUsuarios();
