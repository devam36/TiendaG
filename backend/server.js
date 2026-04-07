const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const { Pool } = require('pg');
const multer = require('multer');
const bcrypt = require('bcryptjs');

const app = express();

function resolvePort(rawPort) {
  const fallbackPort = 3000;

  if (rawPort === undefined || rawPort === null || rawPort === '') {
    return fallbackPort;
  }

  const parsedPort = Number(rawPort);
  const isValidPort = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535;

  if (!isValidPort) {
    console.warn(
      `Valor de PORT invalido (${rawPort}). Usando puerto por defecto ${fallbackPort}.`
    );
    return fallbackPort;
  }

  return parsedPort;
}

const PORT = resolvePort(process.env.PORT);
const HOST = process.env.HOST || '127.0.0.1';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

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

app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    if (!req.originalUrl.startsWith('/api')) {
      return;
    }

    console.log(
      `[HTTP] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${elapsedMs(startedAt).toFixed(1)} ms)`
    );
  });

  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ success: true, status: 'ok' });
});

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

function elapsedMs(startTime) {
  return Number(process.hrtime.bigint() - startTime) / 1e6;
}

async function timedQuery(label, queryText, params = []) {
  const startedAt = process.hrtime.bigint();

  try {
    const result = await pool.query(queryText, params);
    console.log(
      `[SQL] ${label} -> ${elapsedMs(startedAt).toFixed(1)} ms (${result.rowCount ?? result.rows.length} rows)`
    );
    return result;
  } catch (error) {
    console.error(`[SQL] ${label} falló tras ${elapsedMs(startedAt).toFixed(1)} ms: ${error.message}`);
    throw error;
  }
}

const CAMPOS_CSV_PRODUCTOS = [
  'codigo_producto',
  'nombre_producto',
  'nitproveedor',
  'precio_compra',
  'ivacompra',
  'precio_venta'
];

const BCRYPT_SALT_ROUNDS = 10;

function esHashBcrypt(valor) {
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(valor);
}

function parseCsvLine(linea) {
  const columnas = [];
  let valorActual = '';
  let enComillas = false;

  for (let i = 0; i < linea.length; i += 1) {
    const caracter = linea[i];

    if (caracter === '"') {
      if (enComillas && linea[i + 1] === '"') {
        valorActual += '"';
        i += 1;
      } else {
        enComillas = !enComillas;
      }
      continue;
    }

    if (caracter === ',' && !enComillas) {
      columnas.push(valorActual.trim());
      valorActual = '';
      continue;
    }

    valorActual += caracter;
  }

  columnas.push(valorActual.trim());
  return columnas;
}

function esEnteroPositivo(valor) {
  if (!/^\d+$/.test(valor)) {
    return false;
  }

  const numero = Number(valor);
  return Number.isInteger(numero) && numero > 0;
}

function esDecimalValido(valor) {
  if (!/^\d+(\.\d+)?$/.test(valor)) {
    return false;
  }

  const numero = Number(valor);
  return Number.isFinite(numero) && numero >= 0;
}

function withTimeout(promise, timeoutMs, errorMessage) {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  return Promise.race([
    promise.finally(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }),
    timeoutPromise
  ]);
}

async function asegurarTablaProductos(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS productos (
      codigo_producto BIGINT PRIMARY KEY,
      nombre_producto VARCHAR(255) NOT NULL,
      nitproveedor BIGINT NOT NULL,
      precio_compra NUMERIC(14,2) NOT NULL,
      ivacompra NUMERIC(14,2) NOT NULL,
      precio_venta NUMERIC(14,2) NOT NULL,
      CONSTRAINT fk_productos_proveedores
        FOREIGN KEY (nitproveedor)
        REFERENCES proveedores(nitproveedor)
    )
  `);
}

async function asegurarTablasVentas(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ventas (
      codigo_venta BIGSERIAL PRIMARY KEY,
      cedula_cliente BIGINT NOT NULL,
      cedula_usuario BIGINT NOT NULL,
      valor_total_venta NUMERIC(14,2) NOT NULL,
      valor_iva NUMERIC(14,2) NOT NULL,
      valor_total_con_iva NUMERIC(14,2) NOT NULL,
      fecha_venta TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT fk_ventas_clientes
        FOREIGN KEY (cedula_cliente)
        REFERENCES clientes(cedula_cliente),
      CONSTRAINT fk_ventas_usuarios
        FOREIGN KEY (cedula_usuario)
        REFERENCES usuarios(cedula_usuario)
    )
  `);

  await client.query('ALTER TABLE ventas ADD COLUMN IF NOT EXISTS codigo_venta BIGINT');
  await client.query('ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cedula_cliente BIGINT');
  await client.query('ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cedula_usuario BIGINT');
  await client.query('ALTER TABLE ventas ADD COLUMN IF NOT EXISTS valor_total_venta NUMERIC(14,2)');
  await client.query('ALTER TABLE ventas ADD COLUMN IF NOT EXISTS valor_iva NUMERIC(14,2)');
  await client.query('ALTER TABLE ventas ADD COLUMN IF NOT EXISTS valor_total_con_iva NUMERIC(14,2)');
  await client.query('ALTER TABLE ventas ADD COLUMN IF NOT EXISTS fecha_venta TIMESTAMP DEFAULT NOW()');

  await client.query(`
    CREATE TABLE IF NOT EXISTS detalleventas (
      id_detalle BIGSERIAL PRIMARY KEY,
      codigo_venta BIGINT NOT NULL,
      codigo_producto BIGINT NOT NULL,
      cantidad INTEGER NOT NULL,
      valor_unitario NUMERIC(14,2) NOT NULL,
      valor_total NUMERIC(14,2) NOT NULL,
      porcentaje_iva NUMERIC(10,2) NOT NULL,
      valor_iva NUMERIC(14,2) NOT NULL,
      CONSTRAINT fk_detalleventas_venta
        FOREIGN KEY (codigo_venta)
        REFERENCES ventas(codigo_venta)
        ON DELETE CASCADE,
      CONSTRAINT fk_detalleventas_producto
        FOREIGN KEY (codigo_producto)
        REFERENCES productos(codigo_producto)
    )
  `);

  await client.query('ALTER TABLE detalleventas ADD COLUMN IF NOT EXISTS codigo_venta BIGINT');
  await client.query('ALTER TABLE detalleventas ADD COLUMN IF NOT EXISTS codigo_producto BIGINT');
  await client.query('ALTER TABLE detalleventas ADD COLUMN IF NOT EXISTS cantidad INTEGER');
  await client.query('ALTER TABLE detalleventas ADD COLUMN IF NOT EXISTS valor_unitario NUMERIC(14,2)');
  await client.query('ALTER TABLE detalleventas ADD COLUMN IF NOT EXISTS valor_total NUMERIC(14,2)');
  await client.query('ALTER TABLE detalleventas ADD COLUMN IF NOT EXISTS porcentaje_iva NUMERIC(10,2)');
  await client.query('ALTER TABLE detalleventas ADD COLUMN IF NOT EXISTS valor_iva NUMERIC(14,2)');
}

// Login endpoint
// IMPORTANTE: 
// - nombre_usuario: campo usado para el login (username: "admin", "maria", etc.)
// - usuario: campo que indica el tipo/rol del usuario ("admin", "vendedor", "supervisor")
app.post('/api/login', async (req, res) => {
  const { nombre_usuario, contrasena } = req.body;

  if (!nombre_usuario || !contrasena) {
    return res.status(400).json({ 
      success: false, 
      error: 'Nombre de usuario y contraseña son requeridos' 
    });
  }

  try {
    // Buscar por nombre_usuario y validar contraseña con hash seguro.
    const result = await pool.query(
      'SELECT cedula_usuario, usuario, nombre_usuario, email_usuario, password FROM usuarios WHERE nombre_usuario = $1',
      [nombre_usuario]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        error: 'Usuario o contraseña inválidos' 
      });
    }

    const usuarioData = result.rows[0];
    const passwordGuardado = usuarioData.password || '';
    let credencialesValidas = false;

    if (esHashBcrypt(passwordGuardado)) {
      credencialesValidas = await bcrypt.compare(contrasena, passwordGuardado);
    } else {
      // Compatibilidad temporal con registros legacy en texto plano.
      credencialesValidas = passwordGuardado === contrasena;
      if (credencialesValidas) {
        const hashSeguro = await bcrypt.hash(contrasena, BCRYPT_SALT_ROUNDS);
        await pool.query(
          'UPDATE usuarios SET password = $1 WHERE cedula_usuario = $2',
          [hashSeguro, usuarioData.cedula_usuario]
        );
      }
    }

    if (!credencialesValidas) {
      return res.status(401).json({
        success: false,
        error: 'Usuario o contraseña inválidos'
      });
    }

    const usuarioSeguro = {
      cedula_usuario: usuarioData.cedula_usuario,
      usuario: usuarioData.usuario,
      nombre_usuario: usuarioData.nombre_usuario,
      email_usuario: usuarioData.email_usuario
    };

    res.json({ 
      success: true, 
      message: 'Login exitoso',
      user: usuarioSeguro
    });
  } catch (error) {
    console.error('Error en login:', error);
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
    console.log('GET /api/usuarios');
    const result = await timedQuery(
      'GET /api/usuarios',
      'SELECT cedula_usuario, usuario, nombre_usuario, email_usuario FROM usuarios ORDER BY cedula_usuario'
    );
    
    res.json({
      success: true,
      message: 'Usuarios obtenidos correctamente',
      data: result.rows
    });
  } catch (error) {
    console.error('Error obteniendo usuarios:', error);
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
    console.log('GET /api/usuarios/cedula/' + cedula);
    
    const result = await timedQuery(
      `GET /api/usuarios/cedula/${cedula}`,
      'SELECT cedula_usuario, usuario, nombre_usuario, email_usuario FROM usuarios WHERE cedula_usuario = $1',
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
    console.error('Error obteniendo usuario:', error);
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
    console.log('POST /api/usuarios', { cedula_usuario, usuario, nombre_usuario, email_usuario });

    // Validaciones
    if (!cedula_usuario || !usuario || !nombre_usuario || !email_usuario || !password) {
      return res.status(400).json({
        success: false,
        error: 'Todos los campos son requeridos'
      });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    const result = await timedQuery(
      'POST /api/usuarios',
      'INSERT INTO usuarios (cedula_usuario, usuario, nombre_usuario, email_usuario, password) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (cedula_usuario) DO NOTHING RETURNING cedula_usuario, usuario, nombre_usuario, email_usuario',
      [cedula_usuario, usuario, nombre_usuario, email_usuario, passwordHash]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({
        success: false,
        error: 'La cédula ya está registrada'
      });
    }

    console.log('Usuario creado:', result.rows[0].nombre_usuario);
    res.status(201).json({
      success: true,
      message: 'Usuario creado correctamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error creando usuario:', error);
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
    const { usuario, nombre_usuario, email_usuario, password } = req.body;
    console.log('PUT /api/usuarios/' + cedula, { usuario, nombre_usuario });

    // Validaciones
    if (!usuario || !nombre_usuario || !email_usuario) {
      return res.status(400).json({
        success: false,
        error: 'Usuario, nombre y correo son requeridos'
      });
    }

    let result;
    if (password && password.trim() !== '') {
      const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
      result = await timedQuery(
        `PUT /api/usuarios/${cedula}`,
        'UPDATE usuarios SET usuario = $1, nombre_usuario = $2, email_usuario = $3, password = $4 WHERE cedula_usuario = $5 RETURNING cedula_usuario, usuario, nombre_usuario, email_usuario',
        [usuario, nombre_usuario, email_usuario, passwordHash, cedula]
      );
    } else {
      result = await timedQuery(
        `PUT /api/usuarios/${cedula}`,
        'UPDATE usuarios SET usuario = $1, nombre_usuario = $2, email_usuario = $3 WHERE cedula_usuario = $4 RETURNING cedula_usuario, usuario, nombre_usuario, email_usuario',
        [usuario, nombre_usuario, email_usuario, cedula]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    console.log('Usuario actualizado:', result.rows[0].nombre_usuario);
    res.json({
      success: true,
      message: 'Usuario actualizado correctamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error actualizando usuario:', error);
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
    console.log('DELETE /api/usuarios/' + cedula);

    const result = await timedQuery(
      `DELETE /api/usuarios/${cedula}`,
      'DELETE FROM usuarios WHERE cedula_usuario = $1 RETURNING nombre_usuario',
      [cedula]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    console.log('Usuario eliminado:', result.rows[0].nombre_usuario);
    res.json({
      success: true,
      message: 'Usuario eliminado correctamente'
    });
  } catch (error) {
    console.error('Error eliminando usuario:', error);
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
    const limitParam = Number.parseInt(req.query.limit, 10);
    const offsetParam = Number.parseInt(req.query.offset, 10);
    const limit = Number.isInteger(limitParam) && limitParam > 0
      ? Math.min(limitParam, 500)
      : null;
    const offset = Number.isInteger(offsetParam) && offsetParam >= 0
      ? offsetParam
      : 0;

    let queryText = 'SELECT cedula_cliente, nombre_cliente, direccion_cliente, telefono_cliente, email_cliente FROM clientes ORDER BY cedula_cliente';
    const params = [];

    if (limit) {
      queryText += ' LIMIT $1 OFFSET $2';
      params.push(limit, offset);
    }

    const result = await timedQuery('GET /api/clientes', queryText, params);
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
    const result = await timedQuery(
      `GET /api/clientes/${cedula}`,
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
    const result = await timedQuery(
      'POST /api/clientes',
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
    const result = await timedQuery(
      `PUT /api/clientes/${cedula}`,
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
    const result = await timedQuery(
      `DELETE /api/clientes/${cedula}`,
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
    console.log('GET /api/proveedores');
    const limitParam = Number.parseInt(req.query.limit, 10);
    const offsetParam = Number.parseInt(req.query.offset, 10);
    const limit = Number.isInteger(limitParam) && limitParam > 0
      ? Math.min(limitParam, 500)
      : null;
    const offset = Number.isInteger(offsetParam) && offsetParam >= 0
      ? offsetParam
      : 0;

    let queryText = 'SELECT nitproveedor, nombre_proveedor, direccion_proveedor, telefono_proveedor, ciudad_proveedor FROM proveedores ORDER BY nombre_proveedor';
    const params = [];

    if (limit) {
      queryText += ' LIMIT $1 OFFSET $2';
      params.push(limit, offset);
    }

    const result = await pool.query(queryText, params);
    
    console.log(`Proveedores obtenidos: ${result.rows.length} registros`);
    res.json({
      success: true,
      message: 'Proveedores obtenidos correctamente',
      data: result.rows
    });
  } catch (error) {
    console.error('Error obteniendo proveedores:', error);
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
    console.log('GET /api/proveedores/' + nit);

    if (!esEnteroPositivo(String(nit))) {
      return res.status(400).json({
        success: false,
        message: 'El NIT debe ser un número entero positivo'
      });
    }
    
    const result = await timedQuery(
      `GET /api/proveedores/${nit}`,
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
    console.error('Error obteniendo proveedor:', error);
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
    console.log('POST /api/proveedores', { nitproveedor, nombre_proveedor, ciudad_proveedor });

    // Validaciones
    if (!nitproveedor || !nombre_proveedor || !direccion_proveedor || !telefono_proveedor || !ciudad_proveedor) {
      return res.status(400).json({
        success: false,
        message: 'Todos los campos son requeridos'
      });
    }

    if (!esEnteroPositivo(String(nitproveedor))) {
      return res.status(400).json({
        success: false,
        message: 'El NIT debe ser un número entero positivo'
      });
    }

    const result = await timedQuery(
      'POST /api/proveedores',
      'INSERT INTO proveedores (nitproveedor, nombre_proveedor, direccion_proveedor, telefono_proveedor, ciudad_proveedor) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (nitproveedor) DO NOTHING RETURNING nitproveedor, nombre_proveedor, direccion_proveedor, telefono_proveedor, ciudad_proveedor',
      [nitproveedor, nombre_proveedor, direccion_proveedor, telefono_proveedor, ciudad_proveedor]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({
        success: false,
        message: 'El NIT ya está registrado'
      });
    }

    console.log('Proveedor creado:', result.rows[0].nombre_proveedor);
    res.status(201).json({
      success: true,
      message: 'Proveedor creado correctamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error creando proveedor:', error);
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
    console.log('PUT /api/proveedores/' + nit, { nombre_proveedor, ciudad_proveedor });

    if (!esEnteroPositivo(String(nit))) {
      return res.status(400).json({
        success: false,
        message: 'El NIT debe ser un número entero positivo'
      });
    }

    // Validaciones
    if (!nombre_proveedor || !direccion_proveedor || !telefono_proveedor || !ciudad_proveedor) {
      return res.status(400).json({
        success: false,
        message: 'Todos los campos son requeridos'
      });
    }

    const result = await timedQuery(
      `PUT /api/proveedores/${nit}`,
      'UPDATE proveedores SET nombre_proveedor = $1, direccion_proveedor = $2, telefono_proveedor = $3, ciudad_proveedor = $4 WHERE nitproveedor = $5 RETURNING nitproveedor, nombre_proveedor, direccion_proveedor, telefono_proveedor, ciudad_proveedor',
      [nombre_proveedor, direccion_proveedor, telefono_proveedor, ciudad_proveedor, nit]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Proveedor no encontrado'
      });
    }

    console.log('Proveedor actualizado:', result.rows[0].nombre_proveedor);
    res.json({
      success: true,
      message: 'Proveedor actualizado correctamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error actualizando proveedor:', error);
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
    console.log('DELETE /api/proveedores/' + nit);

    if (!esEnteroPositivo(String(nit))) {
      return res.status(400).json({
        success: false,
        message: 'El NIT debe ser un número entero positivo'
      });
    }

    const result = await timedQuery(
      `DELETE /api/proveedores/${nit}`,
      'DELETE FROM proveedores WHERE nitproveedor = $1 RETURNING nombre_proveedor',
      [nit]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Proveedor no encontrado'
      });
    }

    console.log('Proveedor eliminado:', result.rows[0].nombre_proveedor);
    res.json({
      success: true,
      message: 'Proveedor eliminado correctamente'
    });
  } catch (error) {
    console.error('Error eliminando proveedor:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error en la base de datos: ' + error.message 
    });
  }
});

// ------------------------------------------------------------------
// CONSULTA DE PRODUCTOS
// ------------------------------------------------------------------

app.get('/api/productos', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT codigo_producto, nombre_producto, nitproveedor, precio_compra, ivacompra, precio_venta
       FROM productos
       ORDER BY codigo_producto`
    );

    return res.json({
      success: true,
      message: 'Productos obtenidos correctamente',
      data: result.rows
    });
  } catch (error) {
    if (error.code === '42P01') {
      return res.json({
        success: true,
        message: 'La tabla productos aún no existe',
        data: []
      });
    }

    console.error('Error obteniendo productos:', error);
    return res.status(500).json({
      success: false,
      message: 'Error en la base de datos: ' + error.message
    });
  }
});

app.get('/api/productos/:codigo', async (req, res) => {
  try {
    const { codigo } = req.params;

    if (!esEnteroPositivo(String(codigo))) {
      return res.status(400).json({
        success: false,
        error: 'El código de producto debe ser un entero positivo'
      });
    }

    const result = await timedQuery(
      `GET /api/productos/${codigo}`,
      `SELECT codigo_producto, nombre_producto, nitproveedor, precio_compra, ivacompra, precio_venta
       FROM productos
       WHERE codigo_producto = $1`,
      [codigo]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Producto no encontrado'
      });
    }

    return res.json({
      success: true,
      message: 'Producto encontrado',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error obteniendo producto por código:', error);
    return res.status(500).json({
      success: false,
      error: 'Error en la base de datos: ' + error.message
    });
  }
});

// ------------------------------------------------------------------
// CARGA MASIVA DE PRODUCTOS POR CSV
// ------------------------------------------------------------------

app.post('/api/productos/cargar-csv', upload.single('archivo'), async (req, res) => {
  try {
    console.log('[CSV] Inicio carga de productos');

    res.setTimeout(30000, () => {
      if (!res.headersSent) {
        console.error('[CSV] Timeout de respuesta alcanzado');
        return res.status(504).json({
          success: false,
          message: 'La carga del CSV tardó demasiado y fue cancelada'
        });
      }
    });

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Debe adjuntar un archivo CSV en el campo "archivo"'
      });
    }

    const nombreArchivo = (req.file.originalname || '').toLowerCase();
    const esExtensionCsv = nombreArchivo.endsWith('.csv');

    if (!esExtensionCsv) {
      return res.status(400).json({
        success: false,
        message: 'El formato del archivo no es válido. Debe ser un CSV separado por comas.'
      });
    }

    const contenidoCsv = req.file.buffer.toString('utf8').replace(/^\uFEFF/, '');
    const lineas = contenidoCsv
      .split(/\r?\n/)
      .map((linea) => linea.trim())
      .filter((linea) => linea.length > 0);

    if (lineas.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'El archivo CSV no contiene registros para procesar.'
      });
    }

    const encabezado = parseCsvLine(lineas[0]).map((campo) => campo.toLowerCase());
    const encabezadoValido =
      encabezado.length === CAMPOS_CSV_PRODUCTOS.length
      && CAMPOS_CSV_PRODUCTOS.every((campo, idx) => campo === encabezado[idx]);

    if (!encabezadoValido) {
      return res.status(400).json({
        success: false,
        message: `El formato del archivo no es válido. El encabezado debe ser: ${CAMPOS_CSV_PRODUCTOS.join(', ')}`
      });
    }

    console.log(`[CSV] Archivo recibido con ${lineas.length - 1} registros`);

    const client = await withTimeout(
      pool.connect(),
      10000,
      'Tiempo de espera agotado al obtener conexión con la base de datos'
    );

    try {
      console.log('[CSV] Conexión obtenida, iniciando transacción');
      await withTimeout(client.query('BEGIN'), 10000, 'Tiempo de espera agotado al iniciar la transacción');
      await withTimeout(asegurarTablaProductos(client), 10000, 'Tiempo de espera agotado asegurando la tabla de productos');
      console.log('[CSV] Tabla verificada/asegurada');

      const proveedoresResult = await withTimeout(
        client.query('SELECT nitproveedor FROM proveedores'),
        10000,
        'Tiempo de espera agotado consultando proveedores'
      );
      const proveedoresExistentes = new Set(proveedoresResult.rows.map((p) => String(p.nitproveedor)));

      let cargados = 0;
      const errores = [];
      const codigosEnArchivo = new Set();

      for (let indice = 1; indice < lineas.length; indice += 1) {
        const numeroLinea = indice + 1;
        const columnas = parseCsvLine(lineas[indice]);

        if (columnas.length !== CAMPOS_CSV_PRODUCTOS.length) {
          errores.push({
            linea: numeroLinea,
            error: 'Cantidad de columnas inválida'
          });
          continue;
        }

        const [codigo_producto, nombre_producto, nitproveedor, precio_compra, ivacompra, precio_venta] = columnas.map((c) => c.trim());

        if (!codigo_producto || !nombre_producto || !nitproveedor || !precio_compra || !ivacompra || !precio_venta) {
          errores.push({
            linea: numeroLinea,
            codigo_producto: codigo_producto || null,
            error: 'Registro incompleto. Todos los campos son obligatorios'
          });
          continue;
        }

        if (!esEnteroPositivo(codigo_producto)) {
          errores.push({
            linea: numeroLinea,
            codigo_producto,
            error: 'codigo_producto debe ser un entero positivo'
          });
          continue;
        }

        if (!esEnteroPositivo(nitproveedor)) {
          errores.push({
            linea: numeroLinea,
            codigo_producto,
            error: 'nitproveedor debe ser un entero positivo'
          });
          continue;
        }

        if (!esDecimalValido(precio_compra) || !esDecimalValido(ivacompra) || !esDecimalValido(precio_venta)) {
          errores.push({
            linea: numeroLinea,
            codigo_producto,
            error: 'precio_compra, ivacompra y precio_venta deben ser numéricos y mayores o iguales a 0'
          });
          continue;
        }

        if (codigosEnArchivo.has(codigo_producto)) {
          errores.push({
            linea: numeroLinea,
            codigo_producto,
            error: 'codigo_producto duplicado dentro del archivo'
          });
          continue;
        }

        if (!proveedoresExistentes.has(nitproveedor)) {
          errores.push({
            linea: numeroLinea,
            codigo_producto,
            nitproveedor,
            error: 'El proveedor no se encuentra registrado'
          });
          continue;
        }

        const insertResult = await withTimeout(
          client.query(
            `INSERT INTO productos (codigo_producto, nombre_producto, nitproveedor, precio_compra, ivacompra, precio_venta)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (codigo_producto) DO NOTHING`,
            [
              codigo_producto,
              nombre_producto,
              nitproveedor,
              precio_compra,
              ivacompra,
              precio_venta
            ]
          ),
          10000,
          `Tiempo de espera agotado insertando el producto ${codigo_producto}`
        );

        if (insertResult.rowCount === 0) {
          errores.push({
            linea: numeroLinea,
            codigo_producto,
            error: 'El producto ya existe en la base de datos'
          });
          continue;
        }

        codigosEnArchivo.add(codigo_producto);
        cargados += 1;
      }

      await client.query('COMMIT');
      console.log(`[CSV] Carga terminada: cargados=${cargados}, errores=${errores.length}`);

      const totalRegistros = lineas.length - 1;
      const conErrores = errores.length;

      return res.json({
        success: conErrores === 0,
        message: conErrores === 0
          ? 'Productos cargados correctamente'
          : 'Carga finalizada con errores en algunos registros',
        resumen: {
          totalRegistros,
          cargados,
          conErrores
        },
        errores
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error en carga CSV de productos:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: 'Error procesando el archivo CSV',
        error: error.message
      });
    }
  }
});

// ------------------------------------------------------------------
// GESTION DE VENTAS
// ------------------------------------------------------------------

app.post('/api/ventas', async (req, res) => {
  const { cedula_cliente, cedula_usuario, detalles } = req.body || {};

  if (!esEnteroPositivo(String(cedula_cliente || ''))) {
    return res.status(400).json({
      success: false,
      error: 'La cédula del cliente es obligatoria y debe ser numérica'
    });
  }

  if (!esEnteroPositivo(String(cedula_usuario || ''))) {
    return res.status(400).json({
      success: false,
      error: 'La cédula del usuario es obligatoria y debe ser numérica'
    });
  }

  if (!Array.isArray(detalles) || detalles.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Debe enviar al menos un producto en la venta'
    });
  }

  if (detalles.length > 3) {
    return res.status(400).json({
      success: false,
      error: 'Solo se permiten tres productos por venta'
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await asegurarTablaProductos(client);
    await asegurarTablasVentas(client);

    const clienteExiste = await client.query(
      'SELECT cedula_cliente FROM clientes WHERE cedula_cliente = $1',
      [cedula_cliente]
    );

    if (clienteExiste.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'El cliente indicado no existe'
      });
    }

    const usuarioExiste = await client.query(
      'SELECT cedula_usuario FROM usuarios WHERE cedula_usuario = $1',
      [cedula_usuario]
    );

    if (usuarioExiste.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: 'El usuario indicado no existe'
      });
    }

    const codigos = detalles.map((d) => String(d.codigo_producto || '').trim());
    const cantidades = detalles.map((d) => Number(d.cantidad));

    for (let i = 0; i < codigos.length; i += 1) {
      if (!esEnteroPositivo(codigos[i])) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: `El código de producto en la línea ${i + 1} no es válido`
        });
      }

      if (!Number.isInteger(cantidades[i]) || cantidades[i] <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: `La cantidad en la línea ${i + 1} debe ser un entero positivo`
        });
      }
    }

    const productosResult = await client.query(
      `SELECT codigo_producto, nombre_producto, precio_venta, ivacompra
       FROM productos
       WHERE codigo_producto = ANY($1::bigint[])`,
      [codigos]
    );

    const productosMap = new Map(
      productosResult.rows.map((p) => [String(p.codigo_producto), p])
    );

    if (productosMap.size !== codigos.length) {
      const faltante = codigos.find((codigo) => !productosMap.has(codigo));
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        error: `El producto con código ${faltante} no existe`
      });
    }

    let valorTotalVenta = 0;
    let valorIvaTotal = 0;
    const detalleCalculado = [];

    for (let i = 0; i < codigos.length; i += 1) {
      const codigo = codigos[i];
      const cantidad = cantidades[i];
      const producto = productosMap.get(codigo);

      const valorUnitario = Number(producto.precio_venta);
      const porcentajeIva = Number(producto.ivacompra);
      const valorTotal = valorUnitario * cantidad;
      const valorIva = valorTotal * (porcentajeIva / 100);

      valorTotalVenta += valorTotal;
      valorIvaTotal += valorIva;

      detalleCalculado.push({
        codigo_producto: codigo,
        nombre_producto: producto.nombre_producto,
        cantidad,
        valor_unitario: valorUnitario,
        valor_total: valorTotal,
        porcentaje_iva: porcentajeIva,
        valor_iva: valorIva
      });
    }

    const valorTotalConIva = valorTotalVenta + valorIvaTotal;

    const codigoVentaResult = await client.query(
      'SELECT COALESCE(MAX(codigo_venta), 0) + 1 AS siguiente_codigo FROM ventas'
    );
    const codigoVenta = Number(codigoVentaResult.rows[0].siguiente_codigo);

    const ventaResult = await client.query(
      `INSERT INTO ventas (
        codigo_venta,
        cedula_cliente,
        cedula_usuario,
        valor_total_venta,
        valor_iva,
        valor_total_con_iva
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING codigo_venta, cedula_cliente, cedula_usuario, valor_total_venta, valor_iva, valor_total_con_iva`,
      [
        codigoVenta,
        cedula_cliente,
        cedula_usuario,
        valorTotalVenta,
        valorIvaTotal,
        valorTotalConIva
      ]
    );

    const venta = ventaResult.rows[0];

    for (const item of detalleCalculado) {
      await client.query(
        `INSERT INTO detalleventas (
          codigo_venta,
          codigo_producto,
          cantidad,
          valor_unitario,
          valor_total,
          porcentaje_iva,
          valor_iva
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          venta.codigo_venta,
          item.codigo_producto,
          item.cantidad,
          item.valor_unitario,
          item.valor_total,
          item.porcentaje_iva,
          item.valor_iva
        ]
      );
    }

    await client.query('COMMIT');

    return res.status(201).json({
      success: true,
      message: 'Venta registrada correctamente',
      data: {
        venta,
        detalles: detalleCalculado
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error registrando venta:', error);
    return res.status(500).json({
      success: false,
      error: 'No se pudo registrar la venta: ' + error.message
    });
  } finally {
    client.release();
  }
});

// ------------------------------------------------------------------
// REPORTES
// ------------------------------------------------------------------

app.get('/api/reportes/ventas-por-cliente', async (_req, res) => {
  try {
    const tablaVentasExisteResult = await timedQuery(
      'GET /api/reportes/ventas-por-cliente (verificar tabla ventas)',
      "SELECT to_regclass('public.ventas') IS NOT NULL AS existe"
    );

    const tablaVentasExiste = Boolean(tablaVentasExisteResult.rows[0]?.existe);

    if (!tablaVentasExiste) {
      return res.json({
        success: true,
        message: 'No hay ventas registradas todavía',
        data: []
      });
    }

    const result = await timedQuery(
      'GET /api/reportes/ventas-por-cliente',
      `SELECT
         c.cedula_cliente,
         c.nombre_cliente,
         COUNT(v.codigo_venta)::int AS cantidad_ventas,
         COALESCE(SUM(v.valor_total_venta), 0)::numeric(14,2) AS total_sin_iva,
         COALESCE(SUM(v.valor_iva), 0)::numeric(14,2) AS total_iva,
         COALESCE(SUM(v.valor_total_con_iva), 0)::numeric(14,2) AS total_con_iva
       FROM clientes c
       LEFT JOIN ventas v ON v.cedula_cliente = c.cedula_cliente
       GROUP BY c.cedula_cliente, c.nombre_cliente
       ORDER BY total_con_iva DESC, c.nombre_cliente ASC`
    );

    return res.json({
      success: true,
      message: 'Reporte de total de ventas por cliente obtenido correctamente',
      data: result.rows
    });
  } catch (error) {
    console.error('Error obteniendo reporte de ventas por cliente:', error);
    return res.status(500).json({
      success: false,
      error: 'Error en la base de datos: ' + error.message
    });
  }
});

async function bootstrap() {
  try {
    await pool.query('SELECT 1');
    console.log('Pool de base de datos inicializado');
  } catch (error) {
    console.error('No se pudo inicializar el pool de base de datos:', error.message);
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`Servidor corriendo en ${HOST}:${PORT}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`No se pudo iniciar backend: ${HOST}:${PORT} ya está en uso.`);
    } else {
      console.error('Error iniciando backend:', error);
    }
    process.exit(1);
  });

  process.on('SIGTERM', () => {
    server.close(() => process.exit(0));
  });
}

bootstrap();