# Integración Login con Base de Datos

## Cambios realizados

### 1. Backend (server.js)
Se agregó el endpoint de autenticación:
- **POST /api/login** - Valida usuario y contraseña contra la tabla de usuarios

Parámetros requeridos:
```json
{
  "nombre_usuario": "admin",
  "contrasena": "contraseña_usuario"
}
```

Respuesta exitosa:
```json
{
  "success": true,
  "message": "Login exitoso",
  "user": {
    "cedula_usuario": 12345678,
    "usuario": "admin",
    "nombre_usuario": "admin",
    "email_usuario": "usuario@email.com"
  }
}
```

**IMPORTANTE:**
- `nombre_usuario`: Es el username para iniciar sesión (ej: "admin", "maria", "juan")
- `usuario`: Es el tipo/rol del usuario (ej: "admin", "vendedor", "supervisor")
```

### 2. Frontend - Servicios

**Nuevo archivo:** `src/app/shared/services/auth.service.ts`
- Servicio de autenticación con métodos:
  - `login(nombre_usuario: string, contrasena: string)` - Realiza el login
  - `logout()` - Cierra sesión
  - `obtenerUsuarioActual()` - Obtiene datos del usuario autenticado
  - `estaAutenticado()` - Verifica si el usuario está autenticado
  - `usuarioActual$` - Observable del usuario actual

### 3. Frontend - Componente Login

**Actualizado:** `src/app/pages/login/login.ts`
- Integración con servicio de autenticación
- Manejo de estados de carga
- Redireccionamiento a /home después del login exitoso
- Almacenamiento de sesión en localStorage

**Actualizado:** `src/app/pages/login/login.html`
- Visualización de mensajes de error
- Indicador de carga en botón
- Deshabilitación de campos durante el login

**Actualizado:** `src/app/pages/login/login.scss`
- Estilos para mensaje de error
- Estilos para botones deshabilitados

### 4. Configuración de la aplicación

**Actualizado:** `src/app/app.config.ts`
- Agregado `provideHttpClient()` para permitir llamadas HTTP

## Requisitos para funcionar

### Backend
1. Variable de entorno `DATABASE_URL` configurada (ej: postgresql://user:pass@host:5432/dbname)
2. Puerto debe estar configurado en variables de entorno (PORT)
3. Backend debe estar ejecutándose en `http://localhost:3000`

### Frontend
1. API debe ser accesible desde `http://localhost:3000/api`

## Datos de prueba

Para probar el login, primero debes insertar un usuario en la tabla:

**ESTRUCTURA CORRECTA:**
- `nombre_usuario`: Username para login
- `usuario`: Tipo/rol del usuario (admin, vendedor, supervisor, etc.)

```sql
INSERT INTO usuarios (cedula_usuario, usuario, nombre_usuario, email_usuario, password)
VALUES (12345678, 'admin', 'admin', 'admin@empresa.com', 'admin123');
```

### Clientes de ejemplo

Para cargar algunos clientes de prueba puedes ejecutar:

```sql
-- estructura de la tabla clientes
CREATE TABLE IF NOT EXISTS clientes (
  cedula_cliente bigint PRIMARY KEY,
  nombre_cliente text NOT NULL,
  direccion_cliente text,
  telefono_cliente text,
  email_cliente text
);

INSERT INTO clientes (cedula_cliente, nombre_cliente, direccion_cliente, telefono_cliente, email_cliente)
VALUES
  (11111111, 'Cliente Uno', 'Calle Falsa 123', '+57 300 0000001', 'uno@correo.com'),
  (22222222, 'Cliente Dos', 'Avenida Real 45', '+57 300 0000002', 'dos@correo.com');
```

## Cómo usar

1. **Iniciar el backend:**
   ```bash
   cd backend
   npm install
   npm start
   ```

2. **Iniciar el frontend:**
   ```bash
   npm start
   ```

3. **Acceder al login:**
   - Navega a la página de login
   - Ingresa nombre de usuario (campo `nombre_usuario`): `admin`
   - Ingresa contraseña: `admin123`
   - Haz clic en "Aceptar"

## Notas importantes

- El login utiliza el campo `nombre_usuario` para autenticar
- El campo `usuario` almacena el tipo/rol del usuario (admin, vendedor, supervisor)
- Asegúrate de que tus datos en la BD sigan esta estructura

## Flujo de autenticación

1. Usuario ingresa credenciales en el formulario
2. Se envía POST request a `/api/login`
3. Backend valida contra la base de datos
4. Si es válido:
   - Respuesta con datos del usuario
   - Datos se guardan en localStorage
   - Usuario se redirige a /home
5. Si es inválido:
   - Se muestra mensaje de error
   - Usuario no es redirigido

## Seguridad (IMPORTANTE)

⚠️ **NOTA DE SEGURIDAD:** El código actual almacena la contraseña en texto plano en la base de datos. Para producción:

1. Usar hashing seguro (bcrypt, Argon2, etc.)
2. Implementar HTTPS
3. Usar tokens JWT para autenticación
4. Implementar rate limiting en el endpoint de login
5. Validar y sanitizar todas las entradas

## Próximos pasos recomendados

1. Crear un guard para proteger rutas autenticadas
2. Implementar JWT tokens
3. Crear servicio de logout
4. Implementar "Recordarme" (opcional)
5. Agregar validación de campos más robusta
6. Proteger la contraseña con hashing
