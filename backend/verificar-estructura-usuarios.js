require('dotenv').config();
const { Pool } = require('pg');
const readline = require('readline');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function pregunta(texto) {
  return new Promise((resolve) => {
    rl.question(texto, resolve);
  });
}

async function verificarEstructura() {
  try {
    console.log('Verificando estructura de usuarios...\n');
    
    const result = await pool.query('SELECT * FROM usuarios');
    
    if (result.rows.length === 0) {
      console.log('No hay usuarios en la tabla.');
      console.log('\nPara crear un usuario con la estructura correcta:');
      console.log('   - nombre_usuario: username para login (ej: "admin", "maria")');
      console.log('   - usuario: tipo/rol (ej: "admin", "vendedor", "supervisor")\n');
      console.log('Ejecuta este SQL:');
      console.log(`
INSERT INTO usuarios (cedula_usuario, usuario, nombre_usuario, email_usuario, password)
VALUES 
  (12345678, 'admin', 'admin', 'admin@empresa.com', 'admin123'),
  (87654321, 'vendedor', 'maria', 'maria@empresa.com', 'maria123');
      `);
      await pool.end();
      rl.close();
      return;
    }
    
    console.log(`Se encontraron ${result.rows.length} usuario(s):\n`);
    
    // Analizar datos para detectar posibles problemas
    let posibleProblema = false;
    
    result.rows.forEach((user, index) => {
      console.log(`Usuario ${index + 1}:`);
      console.log(`  - Cédula: ${user.cedula_usuario}`);
      console.log(`  - usuario (tipo/rol): ${user.usuario}`);
      console.log(`  - nombre_usuario (login): ${user.nombre_usuario}`);
      console.log(`  - Email: ${user.email_usuario}`);
      
      // Detectar si parece que los campos están invertidos
      const usuarioPareceTipo = ['admin', 'vendedor', 'supervisor', 'gerente', 'cajero'].includes(user.usuario?.toLowerCase());
      const nombrePareceTipoONombreCompleto = user.nombre_usuario && (
        ['admin', 'vendedor', 'supervisor', 'gerente', 'cajero'].includes(user.nombre_usuario.toLowerCase()) ||
        user.nombre_usuario.includes(' ') || 
        user.nombre_usuario.length > 15
      );
      
      if (!usuarioPareceTipo && nombrePareceTipoONombreCompleto) {
        console.log(`  POSIBLE PROBLEMA: Parece que los campos están invertidos`);
        posibleProblema = true;
      } else if (usuarioPareceTipo && !nombrePareceTipoONombreCompleto) {
        console.log(`  Estructura parece correcta`);
      }
      
      console.log('');
    });
    
    console.log('\nESTRUCTURA CORRECTA:');
    console.log('   - nombre_usuario: Username para login (ej: "admin", "maria", "juan")');
    console.log('   - usuario: Tipo/rol del usuario (ej: "admin", "vendedor", "supervisor")');
    console.log('\nPara iniciar sesión, usa el valor del campo "nombre_usuario"\n');
    
    if (posibleProblema) {
      console.log('ATENCIÓN: Se detectaron posibles problemas en la estructura de datos.');
      const respuesta = await pregunta('\n¿Deseas ver un script SQL para corregir esto? (s/n): ');
      
      if (respuesta.toLowerCase() === 's') {
        console.log('\nScript SQL para intercambiar los valores:');
        console.log('-- PRECAUCIÓN: Verifica antes de ejecutar\n');
        result.rows.forEach((user) => {
          console.log(`UPDATE usuarios 
SET usuario = '${user.nombre_usuario}', 
    nombre_usuario = '${user.usuario}'
WHERE cedula_usuario = ${user.cedula_usuario};\n`);
        });
        console.log('-- Después de ejecutar, verifica con: SELECT * FROM usuarios;\n');
      }
    }
    
    await pool.end();
    rl.close();
    
  } catch (error) {
    console.error('Error al consultar la base de datos:', error.message);
    await pool.end();
    rl.close();
    process.exit(1);
  }
}

verificarEstructura();
