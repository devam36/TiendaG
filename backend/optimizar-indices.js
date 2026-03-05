require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function optimizarIndices() {
  try {
    console.log('Optimizando índices de la base de datos...\n');

    // Índice para proveedores (NIT es PK, ya tiene índice)
    // Agregar índice para nombre_proveedor para búsquedas
    console.log('Creando índice para nombre_proveedor...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_proveedores_nombre 
      ON proveedores(nombre_proveedor)
    `);
    console.log('Índice idx_proveedores_nombre creado\n');

    // Índice para ciudad_proveedor si se hacen filtros por ciudad
    console.log('Creando índice para ciudad_proveedor...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_proveedores_ciudad 
      ON proveedores(ciudad_proveedor)
    `);
    console.log('Índice idx_proveedores_ciudad creado\n');

    // Índice para clientes
    console.log('Creando índice para nombre_cliente...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_clientes_nombre 
      ON clientes(nombre_cliente)
    `);
    console.log('Índice idx_clientes_nombre creado\n');

    // Índice para usuarios
    console.log('Creando índice para nombre_usuario...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_usuarios_nombre 
      ON usuarios(nombre_usuario)
    `);
    console.log('Índice idx_usuarios_nombre creado\n');

    // VACUUM ANALYZE para actualizar estadísticas
    console.log('Actualizando estadísticas de la base de datos...');
    await pool.query('VACUUM ANALYZE proveedores');
    await pool.query('VACUUM ANALYZE clientes');
    await pool.query('VACUUM ANALYZE usuarios');
    console.log('Estadísticas actualizadas\n');

    console.log('Optimización completada exitosamente\n');

    // Mostrar índices creados
    console.log('Índices en tabla proveedores:');
    const indices = await pool.query(`
      SELECT indexname, indexdef 
      FROM pg_indexes 
      WHERE tablename = 'proveedores'
      ORDER BY indexname
    `);
    indices.rows.forEach(idx => {
      console.log(`  - ${idx.indexname}`);
    });

  } catch (error) {
    console.error('Error al optimizar índices:', error);
  } finally {
    await pool.end();
  }
}

optimizarIndices();
