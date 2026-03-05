require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function diagnosticarBaseDatos() {
  try {
    console.log('DIAGNÓSTICO COMPLETO DE LA BASE DE DATOS\n');
    console.log('='.repeat(80));

    // 1. Verificar conexión
    console.log('\n1. CONEXIÓN A LA BASE DE DATOS');
    console.log('-'.repeat(80));
    try {
      const testConnection = await pool.query('SELECT NOW()');
      console.log('   Conexión exitosa');
      console.log(`   Hora del servidor: ${testConnection.rows[0].now}`);
    } catch (error) {
      console.error('   Error de conexión:', error.message);
      process.exit(1);
    }

    // 2. Verificar estructura de tablas
    console.log('\n2. VERIFICAR ESTRUCTURA DE TABLAS');
    console.log('-'.repeat(80));

    const tables = ['usuarios', 'proveedores', 'clientes', 'productos', 'ventas', 'detalle_ventas'];
    
    for (const table of tables) {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = $1
        ) as existe;
      `, [table]);
      
      const existe = result.rows[0].existe;
      console.log(`   Tabla "${table}": ${existe ? 'EXISTE' : 'NO EXISTE'}`);
      
      if (existe) {
        const columnas = await pool.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = $1 
          ORDER BY ordinal_position;
        `, [table]);
        
        columnas.rows.forEach(col => {
          console.log(`      ├─ ${col.column_name} (${col.data_type})`);
        });
      }
    }

    // 3. Contar registros
    console.log('\n3. REGISTROS EN CADA TABLA');
    console.log('-'.repeat(80));

    for (const table of tables) {
      try {
        const count = await pool.query(`SELECT COUNT(*) as total FROM ${table}`);
        const total = count.rows[0].total;
        console.log(`   ${table}: ${total} registros`);
        
        // Si hay registros, mostrar algunos
        if (total > 0 && total <= 5) {
          const data = await pool.query(`SELECT * FROM ${table} LIMIT 3`);
          console.log(`      Datos de ejemplo:`);
          data.rows.forEach((row, idx) => {
            console.log(`        [${idx + 1}] ${JSON.stringify(row).substring(0, 80)}`);
          });
        } else if (total > 5) {
          const data = await pool.query(`SELECT * FROM ${table} LIMIT 1`);
          console.log(`      Primer registro:`);
          console.log(`        ${JSON.stringify(data.rows[0]).substring(0, 80)}`);
        }
      } catch (error) {
        console.log(`   Error consultando ${table}: ${error.message}`);
      }
    }

    // 4. Probar consultas específicas
    console.log('\n4. PRUEBAS DE CONSULTAS');
    console.log('-'.repeat(80));

    // Test Usuarios
    console.log('\n   Consulta: SELECT * FROM usuarios');
    try {
      const usuarios = await pool.query('SELECT cedula_usuario, usuario, nombre_usuario, email_usuario FROM usuarios');
      console.log(`      Usuarios encontrados: ${usuarios.rows.length}`);
      usuarios.rows.slice(0, 3).forEach((user, idx) => {
        console.log(`         [${idx + 1}] ${user.nombre_usuario} (${user.usuario})`);
      });
    } catch (error) {
      console.log(`      Error: ${error.message}`);
    }

    // Test Proveedores
    console.log('\n   Consulta: SELECT * FROM proveedores');
    try {
      const proveedores = await pool.query('SELECT nitproveedor, nombre_proveedor, ciudad_proveedor FROM proveedores');
      console.log(`      Proveedores encontrados: ${proveedores.rows.length}`);
      proveedores.rows.slice(0, 3).forEach((prov, idx) => {
        console.log(`         [${idx + 1}] ${prov.nombre_proveedor} (NIT: ${prov.nitproveedor})`);
      });
    } catch (error) {
      console.log(`      Error: ${error.message}`);
    }

    // 5. Verificar índices y constraints
    console.log('\n5. ÍNDICES Y CONSTRAINTS');
    console.log('-'.repeat(80));

    for (const table of tables) {
      const indices = await pool.query(`
        SELECT indexname, indexdef 
        FROM pg_indexes 
        WHERE tablename = $1;
      `, [table]);
      
      if (indices.rows.length > 0) {
        console.log(`\n   ${table}:`);
        indices.rows.forEach(idx => {
          console.log(`      ${idx.indexname}`);
        });
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('Diagnóstico completado\n');

  } catch (error) {
    console.error('Error fatal:', error);
  } finally {
    await pool.end();
  }
}

diagnosticarBaseDatos();
