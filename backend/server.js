require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const { Pool } = require('pg');
const multer = require('multer');

const app = express();
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

const CAMPOS_CSV_PRODUCTOS = [
  'codigo_producto',
  'nombre_producto',
  'nitproveedor',
  'precio_compra',
  'ivacompra',
  'precio_venta'
];

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

// Login endpoint
// IMPORTANTE: 
// - nombre_usuario: campo usado para el login (username: "admin", "maria", etc.)
// - usuario: campo que indica el tipo/rol del usuario ("admin", "vendedor", "supervisor")
app.post('/api/login', async (req, res) => {
  console.log('Solicitud recibida en /api/login');
  console.log('Headers:', req.headers);
  console.log('Body recibido:', req.body);
  
  const { nombre_usuario, contrasena } = req.body;

  if (!nombre_usuario || !contrasena) {
    console.log('Validación fallida - Campos faltantes');
    console.log('   nombre_usuario:', nombre_usuario);
    console.log('   contrasena:', contrasena);
    return res.status(400).json({ 
      success: false, 
      error: 'Nombre de usuario y contraseña son requeridos' 
    });
  }

  try {
    console.log(`Buscando usuario: ${nombre_usuario}`);
    // Buscar por nombre_usuario (el username para login)
    const result = await pool.query(
      'SELECT cedula_usuario, usuario, nombre_usuario, email_usuario FROM usuarios WHERE nombre_usuario = $1 AND password = $2',
      [nombre_usuario, contrasena]
    );

    if (result.rows.length === 0) {
      console.log('Usuario o contraseña inválido');
      return res.status(401).json({ 
        success: false, 
        error: 'Usuario o contraseña inválidos' 
      });
    }

    const usuarioData = result.rows[0];
    console.log('Login exitoso:', usuarioData.nombre_usuario);
    res.json({ 
      success: true, 
      message: 'Login exitoso',
      user: usuarioData 
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
    const result = await pool.query(
      'SELECT cedula_usuario, usuario, nombre_usuario, email_usuario, password FROM usuarios ORDER BY cedula_usuario'
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
    const { cedula_usuario, usuario, nombre_usuario, email_usuario, password } = req.body;
    console.log('PUT /api/usuarios/' + cedula, { usuario, nombre_usuario });

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

    console.log('Usuario eliminado:', usuarioExistente.rows[0].nombre_usuario);
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
    console.log('GET /api/proveedores');
    const result = await pool.query(
      'SELECT nitproveedor, nombre_proveedor, direccion_proveedor, telefono_proveedor, ciudad_proveedor FROM proveedores ORDER BY nombre_proveedor'
    );
    
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

    console.log('Proveedor eliminado:', proveedorExistente.rows[0].nombre_proveedor);
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

// ------------------------------------------------------------------
// CARGA MASIVA DE PRODUCTOS POR CSV
// ------------------------------------------------------------------

app.post('/api/productos/cargar-csv', upload.single('archivo'), async (req, res) => {
  try {
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

    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await asegurarTablaProductos(client);

      const proveedoresResult = await client.query('SELECT nitproveedor FROM proveedores');
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

        const insertResult = await client.query(
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
    return res.status(500).json({
      success: false,
      message: 'Error procesando el archivo CSV',
      error: error.message
    });
  }
});



app.listen(process.env.PORT, () => {
  console.log(`Servidor corriendo en puerto ${process.env.PORT}`);
});