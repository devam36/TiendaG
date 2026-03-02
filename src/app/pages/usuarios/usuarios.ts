import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UsuariosService, Usuario } from '../../shared/services/usuarios.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './usuarios.html',
  styleUrl: './usuarios.scss'
})
export class UsuariosComponent implements OnInit, OnDestroy {
  // Formulario
  formulario = {
    cedula_usuario: '',
    nombre_usuario: '',
    email_usuario: '',
    usuario: '',
    password: ''
  };

  // Estado del componente
  usuarios: Usuario[] = [];
  usuarioSeleccionado: Usuario | null = null;
  modo: 'crear' | 'actualizar' = 'crear';
  isLoading = false;
  mensaje: { tipo: 'exito' | 'error' | ''; texto: string } = { tipo: '', texto: '' };
  cedulaBusqueda: string = '';
  usuarioBuscado: Usuario | null = null;
  mostrarFormulario = true;
  mostrarBusqueda = true;

  private destroy$ = new Subject<void>();
  private cargarUsuariosTimeout: any;

  constructor(private usuariosService: UsuariosService) {}

  ngOnInit(): void {
    // Cargar usuarios de forma segura
    this.cargarUsuarios();
  }

  ngOnDestroy(): void {
    // Limpiar timeout si existe
    if (this.cargarUsuariosTimeout) {
      clearTimeout(this.cargarUsuariosTimeout);
    }
    // Completar el subject para cancelar todas las subscripciones
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Cargar lista de usuarios
   */
  cargarUsuarios(): void {
    // Prevenir carga si el componente ya fue destruido
    if (this.destroy$.closed) {
      return;
    }
    
    this.isLoading = true;
    this.usuariosService.cargarUsuarios()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isLoading = false;
          if (response.success && response.data) {
            this.usuarios = response.data;
            // No mostrar mensaje en carga inicial
            if (this.usuarios.length > 0) {
              console.log('✅ Usuarios cargados:', this.usuarios.length);
            } else {
              console.log('ℹ️ No hay usuarios registrados');
            }
          } else {
            console.error('Error al cargar usuarios:', response.error);
            this.mostrarMensaje(response.error || 'Error al cargar usuarios', 'error');
          }
        },
        error: (error) => {
          this.isLoading = false;
          console.error('Error de conexión:', error);
          // Solo mostrar mensaje si el componente sigue vivo
          if (!this.destroy$.closed) {
            this.mostrarMensaje('Error de conexión con el servidor', 'error');
          }
        }
      });
  }

  /**
   * Buscar usuario por cédula
   */
  buscarPorCedula(): void {
    if (!this.cedulaBusqueda || this.cedulaBusqueda.trim() === '') {
      this.mostrarMensaje('Ingrese una cédula para buscar', 'error');
      return;
    }

    const cedula = Number(this.cedulaBusqueda);
    if (isNaN(cedula)) {
      this.mostrarMensaje('La cédula debe ser un número válido', 'error');
      return;
    }

    this.isLoading = true;
    this.usuariosService.obtenerPorCedula(cedula)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isLoading = false;
          if (response.success && response.data) {
            this.usuarioBuscado = response.data;
            this.cargarEnFormulario(response.data);
            this.modo = 'actualizar';
            this.mostrarMensaje('Usuario encontrado', 'exito');
          } else {
            this.mostrarMensaje('Usuario no encontrado', 'error');
            this.usuarioBuscado = null;
          }
        },
        error: (error) => {
          this.isLoading = false;
          this.mostrarMensaje('Error al buscar usuario', 'error');
        }
      });
  }

  /**
   * Cargar datos del usuario en el formulario
   */
  cargarEnFormulario(usuario: Usuario): void {
    this.formulario = {
      cedula_usuario: usuario.cedula_usuario.toString(),
      nombre_usuario: usuario.nombre_usuario,
      email_usuario: usuario.email_usuario,
      usuario: usuario.usuario,
      password: usuario.password
    };
  }

  /**
   * Crear nuevo usuario
   */
  crearUsuario(): void {
    const validacion = this.validarFormulario();
    if (!validacion.valido) {
      this.mostrarMensaje(validacion.error || 'Error en validación', 'error');
      return;
    }

    const usuario: Usuario = {
      cedula_usuario: Number(this.formulario.cedula_usuario),
      nombre_usuario: this.formulario.nombre_usuario.trim(),
      email_usuario: this.formulario.email_usuario.trim(),
      usuario: this.formulario.usuario.trim(),
      password: this.formulario.password.trim()
    };

    // Validar con el servicio
    const validacionServicio = this.usuariosService.validarUsuario(usuario);
    if (!validacionServicio.valido) {
      this.mostrarMensaje(validacionServicio.error || 'Error en validación', 'error');
      return;
    }

    this.isLoading = true;
    this.usuariosService.crearUsuario(usuario)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isLoading = false;
          if (response.success) {
            this.mostrarMensaje('✓ Usuario creado correctamente', 'exito');
            this.limpiarFormulario();
            this.cargarUsuarios();
          } else {
            this.mostrarMensaje(response.error || 'Error al crear usuario', 'error');
          }
        },
        error: (error) => {
          this.isLoading = false;
          this.mostrarMensaje('Error de conexión al crear usuario', 'error');
          console.error('Error:', error);
        }
      });
  }

  /**
   * Actualizar usuario existente
   */
  actualizarUsuario(): void {
    if (!this.usuarioBuscado) {
      this.mostrarMensaje('Debe buscar un usuario primero', 'error');
      return;
    }

    const validacion = this.validarFormulario();
    if (!validacion.valido) {
      this.mostrarMensaje(validacion.error || 'Error en validación', 'error');
      return;
    }

    const usuario: Usuario = {
      cedula_usuario: Number(this.formulario.cedula_usuario),
      nombre_usuario: this.formulario.nombre_usuario.trim(),
      email_usuario: this.formulario.email_usuario.trim(),
      usuario: this.formulario.usuario.trim(),
      password: this.formulario.password.trim()
    };

    // Validar con el servicio
    const validacionServicio = this.usuariosService.validarUsuario(usuario);
    if (!validacionServicio.valido) {
      this.mostrarMensaje(validacionServicio.error || 'Error en validación', 'error');
      return;
    }

    this.isLoading = true;
    this.usuariosService.actualizarUsuario(this.usuarioBuscado.cedula_usuario, usuario)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isLoading = false;
          if (response.success) {
            this.mostrarMensaje('✓ Usuario actualizado correctamente', 'exito');
            this.limpiarFormulario();
            this.cargarUsuarios();
            this.usuarioBuscado = null;
            this.modo = 'crear';
          } else {
            this.mostrarMensaje(response.error || 'Error al actualizar usuario', 'error');
          }
        },
        error: (error) => {
          this.isLoading = false;
          this.mostrarMensaje('Error de conexión al actualizar usuario', 'error');
          console.error('Error:', error);
        }
      });
  }

  /**
   * Eliminar usuario
   */
  eliminarUsuario(cedula: number): void {
    if (!confirm('¿Está seguro de que desea eliminar este usuario? Esta acción no se puede deshacer.')) {
      return;
    }

    this.isLoading = true;
    this.usuariosService.eliminarUsuario(cedula)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isLoading = false;
          if (response.success) {
            this.mostrarMensaje('✓ Usuario eliminado correctamente', 'exito');
            this.cargarUsuarios();
            if (this.usuarioBuscado?.cedula_usuario === cedula) {
              this.limpiarFormulario();
              this.usuarioBuscado = null;
              this.modo = 'crear';
            }
          } else {
            this.mostrarMensaje(response.error || 'Error al eliminar usuario', 'error');
          }
        },
        error: (error) => {
          this.isLoading = false;
          this.mostrarMensaje('Error de conexión al eliminar usuario', 'error');
          console.error('Error:', error);
        }
      });
  }

  /**
   * Limpiar formulario
   */
  limpiarFormulario(): void {
    this.formulario = {
      cedula_usuario: '',
      nombre_usuario: '',
      email_usuario: '',
      usuario: '',
      password: ''
    };
    this.cedulaBusqueda = '';
    this.usuarioBuscado = null;
    this.modo = 'crear';
  }

  /**
   * Validar formulario
   */
  private validarFormulario(): { valido: boolean; error?: string } {
    if (!this.formulario.cedula_usuario || this.formulario.cedula_usuario.trim() === '') {
      return { valido: false, error: 'La cédula es requerida' };
    }
    if (!this.formulario.nombre_usuario || this.formulario.nombre_usuario.trim() === '') {
      return { valido: false, error: 'El nombre completo es requerido' };
    }
    if (!this.formulario.email_usuario || this.formulario.email_usuario.trim() === '') {
      return { valido: false, error: 'El correo electrónico es requerido' };
    }
    if (!this.formulario.usuario || this.formulario.usuario.trim() === '') {
      return { valido: false, error: 'El tipo/rol de usuario es requerido' };
    }
    if (!this.formulario.password || this.formulario.password.trim() === '') {
      return { valido: false, error: 'La contraseña es requerida' };
    }

    return { valido: true };
  }

  /**
   * Mostrar mensaje temporal
   */
  mostrarMensaje(texto: string, tipo: 'exito' | 'error'): void {
    this.mensaje = { tipo, texto };
    setTimeout(() => {
      this.mensaje = { tipo: '', texto: '' };
    }, 4000);
  }

  /**
   * Cancelar operación actual
   */
  cancelar(): void {
    this.limpiarFormulario();
    this.usuarioBuscado = null;
  }
}

