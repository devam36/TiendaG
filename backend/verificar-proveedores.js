require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function verificarProveedores() {
  try {
    console.log('Verificando tabla de proveedores...\n');

    // Verificar estructura de la tabla
    const estructuraQuery = `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'proveedores'
      ORDER BY ordinal_position;
    `;
    
    const estructura = await pool.query(estructuraQuery);
    
    if (estructura.rows.length === 0) {
      console.log('La tabla "proveedores" no existe.');
      console.log('\nCreando tabla proveedores...\n');
      
      // Crear tabla si no existe
      await pool.query(`
        CREATE TABLE IF NOT EXISTS proveedores (
          nit_proveedor VARCHAR(20) PRIMARY KEY,
          nombre_proveedor VARCHAR(100) NOT NULL,
          direccion VARCHAR(200) NOT NULL,
          telefono VARCHAR(20) NOT NULL,
          ciudad VARCHAR(50) NOT NULL
        );
      `);
      
      console.log('Tabla proveedores creada exitosamente\n');
      
      // Insertar datos de ejemplo
      console.log('Insertando proveedores de ejemplo...\n');
      
      await pool.query(`
        INSERT INTO proveedores (nit_proveedor, nombre_proveedor, direccion, telefono, ciudad)
        VALUES 
          ('900123456-7', 'Distribuidora Nacional S.A.S.', 'Calle 100 # 15-23', '6013456789', 'Bogotá'),
          ('890234567-8', 'Comercializadora del Valle', 'Carrera 25 # 50-10', '3201234567', 'Cali'),
          ('800345678-9', 'Suministros del Norte LTDA', 'Avenida Oriental # 80-45', '3159876543', 'Medellín')
        ON CONFLICT (nit_proveedor) DO NOTHING;
      `);
      
      console.log('Proveedores de ejemplo insertados\n');
    } else {
      console.log('Tabla "proveedores" existe\n');
      console.log('Estructura de la tabla:\n');
      estructura.rows.forEach(col => {
        console.log(`   - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'NO' ? 'Obligatorio' : 'Opcional'})`);
      });
    }

    // Contar proveedores
    const countResult = await pool.query('SELECT COUNT(*) FROM proveedores');
    const count = parseInt(countResult.rows[0].count);
    
    console.log(`\nTotal de proveedores registrados: ${count}\n`);

    // Insertar datos de ejemplo si no hay proveedores
    if (count === 0) {
      console.log('Insertando proveedores de ejemplo...\n');
      
      await pool.query(`
        INSERT INTO proveedores (nitproveedor, nombre_proveedor, direccion_proveedor, telefono_proveedor, ciudad_proveedor)
        VALUES 
          (900123456, 'Distribuidora Nacional S.A.S.', 'Calle 100 # 15-23', '6013456789', 'Bogotá'),
          (890234567, 'Comercializadora del Valle', 'Carrera 25 # 50-10', '3201234567', 'Cali'),
          (800345678, 'Suministros del Norte LTDA', 'Avenida Oriental # 80-45', '3159876543', 'Medellín')
        ON CONFLICT (nitproveedor) DO NOTHING;
      `);
      
      console.log('Proveedores de ejemplo insertados\n');
      
      // Actualizar count
      const newCountResult = await pool.query('SELECT COUNT(*) FROM proveedores');
      const newCount = parseInt(newCountResult.rows[0].count);
      console.log(`Total de proveedores ahora: ${newCount}\n`);
    }

    if (count > 0 || true) {
      console.log('Proveedores registrados:\n');
      const proveedores = await pool.query('SELECT * FROM proveedores ORDER BY nombre_proveedor');
      
      proveedores.rows.forEach(p => {
        console.log(`   NIT: ${p.nitproveedor}`);
        console.log(`   Nombre: ${p.nombre_proveedor}`);
        console.log(`   Dirección: ${p.direccion_proveedor}`);
        console.log(`   Teléfono: ${p.telefono_proveedor}`);
        console.log(`   Ciudad: ${p.ciudad_proveedor}`);
        console.log('   ---');
      });
    }

    console.log('\nVerificación completada exitosamente');
  } catch (error) {
    console.error('Error durante la verificación:', error.message);
  } finally {
    await pool.end();
  }
}

verificarProveedores();
