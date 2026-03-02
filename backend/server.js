require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const { Pool } = require('pg');

const app = express();

// Habilitar compresión gzip
app.use(compression());

// Configuración explícita de CORS
const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requests sin origin (como Postman) o desde localhost
    if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Conexión a Neon con configuración optimizada
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 10,
  min: 2,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 5000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
});

// Login endpoint
// IMPORTANTE: 
// - nombre_usuario: campo usado para el login (username: "admin", "maria", etc.)
// - usuario: campo que indica el tipo/rol del usuario ("admin", "vendedor", "supervisor")
app.post('/api/login', async (req, res) => {
  console.log('📍 Solicitud recibida en /api/login');
  console.log('Headers:', req.headers);
  console.log('Body recibido:', req.body);
  
  const { nombre_usuario, contrasena } = req.body;

  if (!nombre_usuario || !contrasena) {
    console.log('❌ Validación fallida - Campos faltantes');
    console.log('   nombre_usuario:', nombre_usuario);
    console.log('   contrasena:', contrasena);
    return res.status(400).json({ 
      success: false, 
      error: 'Nombre de usuario y contraseña son requeridos' 
    });
  }

  try {
    console.log(`🔍 Buscando usuario: ${nombre_usuario}`);
    // Buscar por nombre_usuario (el username para login)
    const result = await pool.query(
      'SELECT cedula_usuario, usuario, nombre_usuario, email_usuario FROM usuarios WHERE nombre_usuario = $1 AND password = $2',
      [nombre_usuario, contrasena]
    );

    if (result.rows.length === 0) {
      console.log('❌ Usuario o contraseña inválido');
      return res.status(401).json({ 
        success: false, 
        error: 'Usuario o contraseña inválidos' 
      });
    }

    const usuarioData = result.rows[0];
    console.log('✅ Login exitoso:', usuarioData.nombre_usuario);
    res.json({ 
      success: true, 
      message: 'Login exitoso',
      user: usuarioData 
    });
  } catch (error) {
    console.error('❌ Error en login:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error en la base de datos: ' + error.message
    });
  }
});

// ------------------------------------------------------------------
// CRUD para USUARIOS
// ------------------------------------------------------------------

// Obtener todos los usuarios
app.get('/api/usuarios', async (req, res) => {
  try {
    console.log('📍 GET /api/usuarios');
    const result = await pool.query(
      'SELECT cedula_usuario, usuario, nombre_usuario, email_usuario, password FROM usuarios ORDER BY cedula_usuario'
    );
    
    res.json({
      success: true,
      message: 'Usuarios obtenidos correctamente',
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Error obteniendo usuarios:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error en la base de datos: ' + error.message 
    });
  }
});

// Obtener usuario por cédula
app.get('/api/usuarios/cedula/:cedula', async (req, res) => {
  try {
    const { cedula } = req.params;
    console.log('📍 GET /api/usuarios/cedula/' + cedula);
    
    const result = await pool.query(
      'SELECT cedula_usuario, usuario, nombre_usuario, email_usuario, password FROM usuarios WHERE cedula_usuario = $1',
      [cedula]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Usuario encontrado',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error obteniendo usuario:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error en la base de datos: ' + error.message 
    });
  }
});

// Crear nuevo usuario
app.post('/api/usuarios', async (req, res) => {
  try {
    const { cedula_usuario, usuario, nombre_usuario, email_usuario, password } = req.body;
    console.log('📍 POST /api/usuarios', { cedula_usuario, usuario, nombre_usuario, email_usuario });

    // Validaciones
    if (!cedula_usuario || !usuario || !nombre_usuario || !email_usuario || !password) {
      return res.status(400).json({
        success: false,
        error: 'Todos los campos son requeridos'
      });
    }

    // Verificar si el usuario ya existe
    const usuarioExistente = await pool.query(
      'SELECT cedula_usuario FROM usuarios WHERE cedula_usuario = $1',
      [cedula_usuario]
    );

    if (usuarioExistente.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'La cédula ya está registrada'
      });
    }

    const result = await pool.query(
      'INSERT INTO usuarios (cedula_usuario, usuario, nombre_usuario, email_usuario, password) VALUES ($1, $2, $3, $4, $5) RETURNING cedula_usuario, usuario, nombre_usuario, email_usuario, password',
      [cedula_usuario, usuario, nombre_usuario, email_usuario, password]
    );

    console.log('✅ Usuario creado:', result.rows[0].nombre_usuario);
    res.status(201).json({
      success: true,
      message: 'Usuario creado correctamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error creando usuario:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error en la base de datos: ' + error.message 
    });
  }
});

// Actualizar usuario
app.put('/api/usuarios/:cedula', async (req, res) => {
  try {
    const { cedula } = req.params;
    const { cedula_usuario, usuario, nombre_usuario, email_usuario, password } = req.body;
    console.log('📍 PUT /api/usuarios/' + cedula, { usuario, nombre_usuario });

    // Validaciones
    if (!usuario || !nombre_usuario || !email_usuario || !password) {
      return res.status(400).json({
        success: false,
        error: 'Todos los campos son requeridos'
      });
    }

    // Verificar si el usuario existe
    const usuarioExistente = await pool.query(
      'SELECT cedula_usuario FROM usuarios WHERE cedula_usuario = $1',
      [cedula]
    );

    if (usuarioExistente.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    const result = await pool.query(
      'UPDATE usuarios SET usuario = $1, nombre_usuario = $2, email_usuario = $3, password = $4 WHERE cedula_usuario = $5 RETURNING cedula_usuario, usuario, nombre_usuario, email_usuario, password',
      [usuario, nombre_usuario, email_usuario, password, cedula]
    );

    console.log('✅ Usuario actualizado:', result.rows[0].nombre_usuario);
    res.json({
      success: true,
      message: 'Usuario actualizado correctamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error actualizando usuario:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error en la base de datos: ' + error.message 
    });
  }
});

// Eliminar usuario
app.delete('/api/usuarios/:cedula', async (req, res) => {
  try {
    const { cedula } = req.params;
    console.log('📍 DELETE /api/usuarios/' + cedula);

    // Verificar si el usuario existe
    const usuarioExistente = await pool.query(
      'SELECT nombre_usuario FROM usuarios WHERE cedula_usuario = $1',
      [cedula]
    );

    if (usuarioExistente.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    await pool.query(
      'DELETE FROM usuarios WHERE cedula_usuario = $1',
      [cedula]
    );

    console.log('✅ Usuario eliminado:', usuarioExistente.rows[0].nombre_usuario);
    res.json({
      success: true,
      message: 'Usuario eliminado correctamente'
    });
  } catch (error) {
    console.error('❌ Error eliminando usuario:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error en la base de datos: ' + error.message 
    });
  }
});

// ------------------------------------------------------------------
// CRUD para clientes
// ------------------------------------------------------------------

// Obtener todos los clientes
app.get('/api/clientes', async (req, res) => {
  try {
    // soporta paginación opcional: ?limit=50&offset=0
    const limit = parseInt(req.query.limit, 10) || null;
    const offset = parseInt(req.query.offset, 10) || 0;

    let queryText = 'SELECT cedula_cliente, nombre_cliente, direccion_cliente, telefono_cliente, email_cliente FROM clientes';
    const params = [];

    if (limit) {
      queryText += ' LIMIT $1 OFFSET $2';
      params.push(limit, offset);
    }

    const result = await pool.query(queryText, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error obteniendo clientes:', error);
    res.status(500).json({ success: false, error: 'Error en la base de datos' });
  }
});

// Obtener un cliente por cédula (opcional)
app.get('/api/clientes/:cedula', async (req, res) => {
  const { cedula } = req.params;
  try {
    const result = await pool.query(
      'SELECT cedula_cliente, nombre_cliente, direccion_cliente, telefono_cliente, email_cliente FROM clientes WHERE cedula_cliente = $1',
      [cedula]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error obteniendo cliente:', error);
    res.status(500).json({ success: false, error: 'Error en la base de datos' });
  }
});

// Crear un nuevo cliente
app.post('/api/clientes', async (req, res) => {
  const {
    cedula_cliente,
    nombre_cliente,
    direccion_cliente,
    telefono_cliente,
    email_cliente
  } = req.body;

  if (!cedula_cliente || !nombre_cliente) {
    return res.status(400).json({
      success: false,
      error: 'Cédula y nombre del cliente son requeridos'
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO clientes(
          cedula_cliente,
          nombre_cliente,
          direccion_cliente,
          telefono_cliente,
          email_cliente
        ) VALUES($1,$2,$3,$4,$5)
        RETURNING cedula_cliente, nombre_cliente, direccion_cliente, telefono_cliente, email_cliente`,
      [
        cedula_cliente,
        nombre_cliente,
        direccion_cliente,
        telefono_cliente,
        email_cliente
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creando cliente:', error);
    res.status(500).json({ error: 'Error en la base de datos' });
  }
});

// Actualizar cliente existente
app.put('/api/clientes/:cedula', async (req, res) => {
  const { cedula } = req.params;
  const {
    nombre_cliente,
    direccion_cliente,
    telefono_cliente,
    email_cliente
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE clientes SET
          nombre_cliente = $1,
          direccion_cliente = $2,
          telefono_cliente = $3,
          email_cliente = $4
        WHERE cedula_cliente = $5
        RETURNING cedula_cliente, nombre_cliente, direccion_cliente, telefono_cliente, email_cliente`,
      [
        nombre_cliente,
        direccion_cliente,
        telefono_cliente,
        email_cliente,
        cedula
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error actualizando cliente:', error);
    res.status(500).json({ success: false, error: 'Error en la base de datos' });
  }
});

// Eliminar cliente
app.delete('/api/clientes/:cedula', async (req, res) => {
  const { cedula } = req.params;
  try {
    const result = await pool.query(
      'DELETE FROM clientes WHERE cedula_cliente = $1 RETURNING cedula_cliente',
      [cedula]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Cliente no encontrado' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error eliminando cliente:', error);
    res.status(500).json({ success: false, error: 'Error en la base de datos' });
  }
});

// ------------------------------------------------------------------
// CRUD para PROVEEDORES
// ------------------------------------------------------------------

// Obtener todos los proveedores
app.get('/api/proveedores', async (req, res) => {
  try {
    console.log('📍 GET /api/proveedores');
    const result = await pool.query(
      'SELECT nitproveedor, nombre_proveedor, direccion_proveedor, telefono_proveedor, ciudad_proveedor FROM proveedores ORDER BY nombre_proveedor'
    );
    
    console.log(`✅ Proveedores obtenidos: ${result.rows.length} registros`);
    res.json({
      success: true,
      message: 'Proveedores obtenidos correctamente',
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Error obteniendo proveedores:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error en la base de datos: ' + error.message 
    });
  }
});

// Obtener proveedor por NIT
app.get('/api/proveedores/:nit', async (req, res) => {
  try {
    const { nit } = req.params;
    console.log('📍 GET /api/proveedores/' + nit);
    
    const result = await pool.query(
      'SELECT nitproveedor, nombre_proveedor, direccion_proveedor, telefono_proveedor, ciudad_proveedor FROM proveedores WHERE nitproveedor = $1',
      [nit]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Proveedor no encontrado'
      });
    }

    res.json({
      success: true,
      message: 'Proveedor encontrado',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error obteniendo proveedor:', error);
    res.status(500).json({ 
      success: false,
      error: 'Error en la base de datos: ' + error.message 
    });
  }
});

// Crear nuevo proveedor
app.post('/api/proveedores', async (req, res) => {
  try {
    const { nitproveedor, nombre_proveedor, direccion_proveedor, telefono_proveedor, ciudad_proveedor } = req.body;
    console.log('📍 POST /api/proveedores', { nitproveedor, nombre_proveedor, ciudad_proveedor });

    // Validaciones
    if (!nitproveedor || !nombre_proveedor || !direccion_proveedor || !telefono_proveedor || !ciudad_proveedor) {
      return res.status(400).json({
        success: false,
        message: 'Todos los campos son requeridos'
      });
    }

    // Verificar si el proveedor ya existe
    const proveedorExistente = await pool.query(
      'SELECT nitproveedor FROM proveedores WHERE nitproveedor = $1',
      [nitproveedor]
    );

    if (proveedorExistente.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'El NIT ya está registrado'
      });
    }

    const result = await pool.query(
      'INSERT INTO proveedores (nitproveedor, nombre_proveedor, direccion_proveedor, telefono_proveedor, ciudad_proveedor) VALUES ($1, $2, $3, $4, $5) RETURNING nitproveedor, nombre_proveedor, direccion_proveedor, telefono_proveedor, ciudad_proveedor',
      [nitproveedor, nombre_proveedor, direccion_proveedor, telefono_proveedor, ciudad_proveedor]
    );

    console.log('✅ Proveedor creado:', result.rows[0].nombre_proveedor);
    res.status(201).json({
      success: true,
      message: 'Proveedor creado correctamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error creando proveedor:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error en la base de datos: ' + error.message 
    });
  }
});

// Actualizar proveedor
app.put('/api/proveedores/:nit', async (req, res) => {
  try {
    const { nit } = req.params;
    const { nombre_proveedor, direccion_proveedor, telefono_proveedor, ciudad_proveedor } = req.body;
    console.log('📍 PUT /api/proveedores/' + nit, { nombre_proveedor, ciudad_proveedor });

    // Validaciones
    if (!nombre_proveedor || !direccion_proveedor || !telefono_proveedor || !ciudad_proveedor) {
      return res.status(400).json({
        success: false,
        message: 'Todos los campos son requeridos'
      });
    }

    // Verificar si el proveedor existe
    const proveedorExistente = await pool.query(
      'SELECT nitproveedor FROM proveedores WHERE nitproveedor = $1',
      [nit]
    );

    if (proveedorExistente.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Proveedor no encontrado'
      });
    }

    const result = await pool.query(
      'UPDATE proveedores SET nombre_proveedor = $1, direccion_proveedor = $2, telefono_proveedor = $3, ciudad_proveedor = $4 WHERE nitproveedor = $5 RETURNING nitproveedor, nombre_proveedor, direccion_proveedor, telefono_proveedor, ciudad_proveedor',
      [nombre_proveedor, direccion_proveedor, telefono_proveedor, ciudad_proveedor, nit]
    );

    console.log('✅ Proveedor actualizado:', result.rows[0].nombre_proveedor);
    res.json({
      success: true,
      message: 'Proveedor actualizado correctamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error actualizando proveedor:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error en la base de datos: ' + error.message 
    });
  }
});

// Eliminar proveedor
app.delete('/api/proveedores/:nit', async (req, res) => {
  try {
    const { nit } = req.params;
    console.log('📍 DELETE /api/proveedores/' + nit);

    // Verificar si el proveedor existe
    const proveedorExistente = await pool.query(
      'SELECT nombre_proveedor FROM proveedores WHERE nitproveedor = $1',
      [nit]
    );

    if (proveedorExistente.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Proveedor no encontrado'
      });
    }

    await pool.query(
      'DELETE FROM proveedores WHERE nitproveedor = $1',
      [nit]
    );

    console.log('✅ Proveedor eliminado:', proveedorExistente.rows[0].nombre_proveedor);
    res.json({
      success: true,
      message: 'Proveedor eliminado correctamente'
    });
  } catch (error) {
    console.error('❌ Error eliminando proveedor:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error en la base de datos: ' + error.message 
    });
  }
});



app.listen(process.env.PORT, () => {
  console.log(`Servidor corriendo en puerto ${process.env.PORT}`);
});