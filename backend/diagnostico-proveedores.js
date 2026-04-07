const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function diagnosticar() {
  try {
    console.log('DIAGNÓSTICO DE RENDIMIENTO - PROVEEDORES\n');
    console.log('='.repeat(60));

    // 1. Verificar índices
    console.log('\n1. ÍNDICES EN LA TABLA PROVEEDORES:');
    console.log('-'.repeat(60));
    
    const indicesQuery = `
      SELECT 
        indexname,
        indexdef
      FROM pg_indexes
      WHERE tablename = 'proveedores';
    `;
    
    const indices = await pool.query(indicesQuery);
    
    if (indices.rows.length === 0) {
      console.log('NO HAY ÍNDICES en la tabla proveedores');
      console.log('   Esto puede causar consultas lentas');
    } else {
      indices.rows.forEach(idx => {
        console.log(`${idx.indexname}`);
        console.log(`   ${idx.indexdef}`);
      });
    }

    // 2. Estadísticas de la tabla
    console.log('\n2. ESTADÍSTICAS DE LA TABLA:');
    console.log('-'.repeat(60));
    
    const statsQuery = `
      SELECT 
        n_tup_ins as inserciones,
        n_tup_upd as actualizaciones,
        n_tup_del as eliminaciones,
        n_live_tup as registros_activos,
        n_dead_tup as registros_muertos,
        last_vacuum,
        last_autovacuum,
        last_analyze,
        last_autoanalyze
      FROM pg_stat_user_tables
      WHERE relname = 'proveedores';
    `;
    
    const stats = await pool.query(statsQuery);
    if (stats.rows.length > 0) {
      const s = stats.rows[0];
      console.log(`   Registros activos: ${s.registros_activos}`);
      console.log(`   Registros muertos: ${s.registros_muertos}`);
      console.log(`   Inserciones: ${s.inserciones}`);
      console.log(`   Actualizaciones: ${s.actualizaciones}`);
      console.log(`   Eliminaciones: ${s.eliminaciones}`);
      console.log(`   Último VACUUM: ${s.last_vacuum || 'Nunca'}`);
      console.log(`   Último ANALYZE: ${s.last_analyze || 'Nunca'}`);
    }

    // 3. Medir tiempo de consultas
    console.log('\n3. PRUEBAS DE RENDIMIENTO:');
    console.log('-'.repeat(60));
    
    // Consulta sin ORDER BY
    const start1 = Date.now();
    await pool.query('SELECT * FROM proveedores');
    const time1 = Date.now() - start1;
    console.log(`   SELECT * FROM proveedores: ${time1}ms`);
    
    // Consulta con ORDER BY
    const start2 = Date.now();
    await pool.query('SELECT * FROM proveedores ORDER BY nombre_proveedor');
    const time2 = Date.now() - start2;
    console.log(`   con ORDER BY: ${time2}ms`);
    
    // Consulta con campos específicos
    const start3 = Date.now();
    await pool.query('SELECT nitproveedor, nombre_proveedor, direccion_proveedor, telefono_proveedor, ciudad_proveedor FROM proveedores');
    const time3 = Date.now() - start3;
    console.log(`   con campos específicos: ${time3}ms`);

    // 4. Información del planificador
    console.log('\n4. PLAN DE EJECUCIÓN:');
    console.log('-'.repeat(60));
    
    const explainQuery = `
      EXPLAIN ANALYZE 
      SELECT nitproveedor, nombre_proveedor, direccion_proveedor, telefono_proveedor, ciudad_proveedor 
      FROM proveedores 
      ORDER BY nombre_proveedor;
    `;
    
    const explain = await pool.query(explainQuery);
    explain.rows.forEach(row => {
      console.log(`   ${row['QUERY PLAN']}`);
    });

    // 5. Verificar configuración de la conexión
    console.log('\n5. CONFIGURACIÓN DEL POOL:');
    console.log('-'.repeat(60));
    console.log(`   Total Conexiones: ${pool.totalCount}`);
    console.log(`   Conexiones Activas: ${pool.idleCount}`);
    console.log(`   Esperando Conexión: ${pool.waitingCount}`);

    console.log('\n' + '='.repeat(60));
    console.log('Diagnóstico completado\n');

  } catch (error) {
    console.error('Error en diagnóstico:', error.message);
  } finally {
    await pool.end();
  }
}

diagnosticar();
