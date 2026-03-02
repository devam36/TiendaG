require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const clientes = [
  {
    cedula: 1234567890,
    nombre: 'Juan Pérez',
    direccion: 'Calle 123 #45-67',
    telefono: '3001234567',
    email: 'juan.perez@email.com'
  },
  {
    cedula: 9876543210,
    nombre: 'María García',
    direccion: 'Carrera 45 #12-34',
    telefono: '3109876543',
    email: 'maria.garcia@email.com'
  },
  {
    cedula: 5555555555,
    nombre: 'Carlos López',
    direccion: 'Avenida 78 #90-12',
    telefono: '3205555555',
    email: 'carlos.lopez@email.com'
  },
  {
    cedula: 1111222233,
    nombre: 'Ana Martínez',
    direccion: 'Diagonal 34 #56-78',
    telefono: '3151112222',
    email: 'ana.martinez@email.com'
  }
];

async function insertarClientes() {
  try {
    console.log('🔄 Insertando clientes de prueba...\n');
    
    for (const cliente of clientes) {
      await pool.query(
        'INSERT INTO clientes (cedula_cliente, nombre_cliente, direccion_cliente, telefono_cliente, email_cliente) VALUES ($1, $2, $3, $4, $5)',
        [cliente.cedula, cliente.nombre, cliente.direccion, cliente.telefono, cliente.email]
      );
      console.log(`✅ Cliente insertado: ${cliente.nombre} (${cliente.cedula})`);
    }
    
    const result = await pool.query('SELECT COUNT(*) FROM clientes');
    console.log(`\n📊 Total de clientes en BD: ${result.rows[0].count}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

insertarClientes();
