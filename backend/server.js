require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();

app.use(cors());
app.use(express.json());

// Conexión a Neon
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Ruta de prueba
app.get('/api/usuarios', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM usuarios');
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error en la base de datos' });
  }
});

// Crear usuario
app.post('/api/usuarios', async (req, res) => {
  const { nombre, email } = req.body;

  try {
    const result = await pool.query(
      'INSERT INTO usuarios(nombre, email) VALUES($1, $2) RETURNING *',
      [nombre, email]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al insertar' });
  }
});

app.listen(process.env.PORT, () => {
  console.log(`Servidor corriendo en puerto ${process.env.PORT}`);
});