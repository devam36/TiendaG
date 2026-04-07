import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UsuariosService, Usuario, UsuarioPayload, UsuarioResponse } from '../../shared/services/usuarios.service';
import { Subject, of } from 'rxjs';
import { catchError, finalize, takeUntil, timeout } from 'rxjs/operators';

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
  todosUsuarios: Usuario[] = [];
  modo: 'crear' | 'actualizar' = 'crear';
  isLoading = false;
  isSavingUsuario = false;
  isBuscandoCedula = false;
  isEliminando = false;
  cambiarPassword = false;
  mensaje: { tipo: 'exito' | 'error' | ''; texto: string } = { tipo: '', texto: '' };
  cedulaBusqueda: string | number = '';
  usuarioBuscado: Usuario | null = null;
  filtroCedulaActivo: string | null = null;

  private destroy$ = new Subject<void>();
  private cargarUsuariosTimeout: ReturnType<typeof setTimeout> | null = null;
  private mensajeTimeout: ReturnType<typeof setTimeout> | null = null;
  private guardadoTimeout: ReturnType<typeof setTimeout> | null = null;
  private reintentoInicialUsuarios = false;

  constructor(private usuariosService: UsuariosService) {}

  ngOnInit(): void {
    this.usuariosService.usuariosActualizados$
      .pipe(takeUntil(this.destroy$))
      .subscribe((usuarios) => {
        this.todosUsuarios = usuarios;
        this.aplicarFiltroEnLista();
      });

    // Cargar usuarios de forma segura
    this.cargarUsuarios();
  }

  ngOnDestroy(): void {
    // Limpiar timeout si existe
    if (this.cargarUsuariosTimeout) {
      clearTimeout(this.cargarUsuariosTimeout);
      this.cargarUsuariosTimeout = null;
    }
    if (this.mensajeTimeout) {
      clearTimeout(this.mensajeTimeout);
      this.mensajeTimeout = null;
    }
    if (this.guardadoTimeout) {
      clearTimeout(this.guardadoTimeout);
      this.guardadoTimeout = null;
    }
    // Completar el subject para cancelar todas las subscripciones
    this.destroy$.next();
    this.destroy$.complete();
  }

  private iniciarGuardado(): void {
    this.isSavingUsuario = true;
    if (this.guardadoTimeout) {
      clearTimeout(this.guardadoTimeout);
    }

    this.guardadoTimeout = setTimeout(() => {
      if (this.isSavingUsuario) {
        this.isSavingUsuario = false;
        this.mostrarMensaje('La actualización tardó demasiado. Verifique en la tabla si el cambio ya se aplicó.', 'error');
      }
      this.guardadoTimeout = null;
    }, 15000);
  }

  private finalizarGuardado(): void {
    this.isSavingUsuario = false;
    if (this.guardadoTimeout) {
      clearTimeout(this.guardadoTimeout);
      this.guardadoTimeout = null;
    }
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
          if (response?.success && Array.isArray(response.data)) {
            this.todosUsuarios = response.data;
            this.aplicarFiltroEnLista();
            this.reintentoInicialUsuarios = false;
          } else if (Array.isArray(response?.data)) {
            // Compatibilidad con respuestas parciales (ej. caché del navegador).
            this.todosUsuarios = response.data;
            this.aplicarFiltroEnLista();
            this.reintentoInicialUsuarios = false;
          } else {
            console.error('Error al cargar usuarios:', response.error);
            this.mostrarMensaje(response.error || 'No fue posible actualizar la lista de usuarios', 'error');
            this.reintentoInicialUsuarios = false;
          }
        },
        error: (error) => {
          this.isLoading = false;
          console.error('Error de conexión:', error);
          // Solo mostrar mensaje si el componente sigue vivo
          if (!this.destroy$.closed) {
            this.mostrarMensaje('Error de conexión con el servidor', 'error');
          }
          this.reintentarCargaInicialUsuarios();
        }
      });
  }

  private reintentarCargaInicialUsuarios(): void {
    if (this.reintentoInicialUsuarios || this.destroy$.closed) {
      return;
    }

    this.reintentoInicialUsuarios = true;
    this.cargarUsuariosTimeout = setTimeout(() => {
      if (!this.destroy$.closed) {
        this.cargarUsuarios();
      }
      this.cargarUsuariosTimeout = null;
    }, 1500);
  }

  /**
   * Buscar usuario por cédula
   */
  buscarPorCedula(): void {
    const cedulaTexto = String(this.cedulaBusqueda ?? '').trim();

    if (!cedulaTexto) {
      this.mostrarMensaje('Ingrese una cédula para buscar', 'error');
      return;
    }

    if (!/^\d+$/.test(cedulaTexto)) {
      this.mostrarMensaje('La cédula debe ser un número válido', 'error');
      return;
    }

    this.cedulaBusqueda = cedulaTexto;

    // Si ya está en la lista local, aplica filtro inmediato sin esperar red.
    const usuarioLocal = this.todosUsuarios.find(
      (usuario) => String(usuario.cedula_usuario) === cedulaTexto
    );

    if (usuarioLocal) {
      this.usuarioBuscado = usuarioLocal;
      this.filtroCedulaActivo = cedulaTexto;
      this.aplicarFiltroEnLista();
      this.cargarEnFormulario(usuarioLocal);
      this.modo = 'actualizar';
      this.mostrarMensaje('Usuario encontrado', 'exito');
      return;
    }

    const cedula = Number(cedulaTexto);

    this.isBuscandoCedula = true;
    this.usuariosService.obtenerPorCedula(cedula)
      .pipe(takeUntil(this.destroy$))
      .pipe(
        timeout(8000),
        catchError(() => of({ success: false, data: undefined })),
        finalize(() => {
          this.isBuscandoCedula = false;
        })
      )
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.usuarioBuscado = response.data;
            this.filtroCedulaActivo = cedulaTexto;
            this.aplicarFiltroEnLista();
            this.cargarEnFormulario(response.data);
            this.modo = 'actualizar';
            this.mostrarMensaje('Usuario encontrado', 'exito');
          } else {
            this.mostrarMensaje('Usuario no encontrado', 'error');
            this.usuarioBuscado = null;
            this.filtroCedulaActivo = cedulaTexto;
            this.aplicarFiltroEnLista();
          }
        },
        error: () => {
          this.mostrarMensaje('Error al buscar usuario', 'error');
        }
      });
  }

  accionPrincipalListaUsuarios(): void {
    const cedulaTexto = String(this.cedulaBusqueda ?? '').trim();

    if (!cedulaTexto) {
      this.filtroCedulaActivo = null;
      this.cargarUsuarios();
      return;
    }

    this.buscarPorCedula();
  }

  limpiarFiltroLista(): void {
    this.cedulaBusqueda = '';
    this.filtroCedulaActivo = null;
    this.cargarUsuarios();
  }

  /**
   * Cargar usuario desde la tabla para edición inmediata
   */
  seleccionarUsuario(usuario: Usuario): void {
    this.usuarioBuscado = usuario;
    this.filtroCedulaActivo = String(usuario.cedula_usuario);
    this.aplicarFiltroEnLista();
    this.cedulaBusqueda = String(usuario.cedula_usuario);
    this.cargarEnFormulario(usuario);
    this.cambiarPassword = false;
    this.modo = 'actualizar';
    this.mostrarMensaje('Usuario cargado para edición', 'exito');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
      password: ''
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

    const cedulaFormulario = String(this.formulario.cedula_usuario ?? '').trim();

    const usuario: UsuarioPayload = {
      cedula_usuario: Number(cedulaFormulario),
      nombre_usuario: this.formulario.nombre_usuario.trim(),
      email_usuario: this.formulario.email_usuario.trim(),
      usuario: this.formulario.usuario.trim(),
      password: this.formulario.password.trim()
    };

    // Validar con el servicio
    const validacionServicio = this.usuariosService.validarUsuario(usuario, true);
    if (!validacionServicio.valido) {
      this.mostrarMensaje(validacionServicio.error || 'Error en validación', 'error');
      return;
    }

    this.iniciarGuardado();
    this.usuariosService.crearUsuario(usuario)
      .pipe(
        takeUntil(this.destroy$),
        timeout(12000),
        catchError(() => of({ success: false, error: 'Tiempo de espera agotado al crear usuario' } as UsuarioResponse)),
        finalize(() => {
          this.finalizarGuardado();
        })
      )
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.mostrarMensaje('✓ Usuario creado correctamente', 'exito');
            this.limpiarFormulario();
          } else {
            this.mostrarMensaje(response.error || 'Error al crear usuario', 'error');
          }
        },
        error: (error) => {
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

    const validacion = this.validarFormulario(false);
    if (!validacion.valido) {
      this.mostrarMensaje(validacion.error || 'Error en validación', 'error');
      return;
    }

    const cedulaFormulario = String(this.formulario.cedula_usuario ?? '').trim();

    const usuario: UsuarioPayload = {
      cedula_usuario: Number(cedulaFormulario),
      nombre_usuario: this.formulario.nombre_usuario.trim(),
      email_usuario: this.formulario.email_usuario.trim(),
      usuario: this.formulario.usuario.trim()
    };

    const nuevaContrasena = this.formulario.password.trim();
    if (this.cambiarPassword && nuevaContrasena) {
      usuario.password = nuevaContrasena;
    }

    // Validar con el servicio
    const validacionServicio = this.usuariosService.validarUsuario(usuario, false);
    if (!validacionServicio.valido) {
      this.mostrarMensaje(validacionServicio.error || 'Error en validación', 'error');
      return;
    }

    this.iniciarGuardado();
    this.usuariosService.actualizarUsuario(this.usuarioBuscado.cedula_usuario, usuario)
      .pipe(
        takeUntil(this.destroy$),
        timeout(12000),
        catchError(() => of({ success: false, error: 'Tiempo de espera agotado al actualizar usuario' } as UsuarioResponse)),
        finalize(() => {
          this.finalizarGuardado();
        })
      )
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.mostrarMensaje('✓ Usuario actualizado correctamente', 'exito');
            this.limpiarFormulario();
            this.usuarioBuscado = null;
            this.modo = 'crear';
          } else {
            this.mostrarMensaje(response.error || 'Error al actualizar usuario', 'error');
          }
        },
        error: (error) => {
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

    this.isEliminando = true;
    this.usuariosService.eliminarUsuario(cedula)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isEliminando = false;
        })
      )
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.mostrarMensaje('✓ Usuario eliminado correctamente', 'exito');
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
    this.filtroCedulaActivo = null;
    this.cambiarPassword = false;
    this.aplicarFiltroEnLista();
    this.modo = 'crear';
  }

  private aplicarFiltroEnLista(): void {
    if (this.filtroCedulaActivo === null) {
      this.usuarios = [...this.todosUsuarios];
      return;
    }

    this.usuarios = this.todosUsuarios.filter(
      (usuario) => String(usuario.cedula_usuario) === this.filtroCedulaActivo
    );
  }

  /**
   * Validar formulario
   */
  private validarFormulario(requierePassword: boolean = true): { valido: boolean; error?: string } {
    const cedulaFormulario = String(this.formulario.cedula_usuario ?? '').trim();

    if (!cedulaFormulario) {
      return { valido: false, error: 'La cédula es requerida' };
    }
    if (!/^\d+$/.test(cedulaFormulario)) {
      return { valido: false, error: 'La cédula debe contener solo números' };
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
    if (requierePassword && (!this.formulario.password || this.formulario.password.trim() === '')) {
      return { valido: false, error: 'La contraseña es requerida' };
    }

    return { valido: true };
  }

  /**
   * Mostrar mensaje temporal
   */
  mostrarMensaje(texto: string, tipo: 'exito' | 'error'): void {
    this.mensaje = { tipo, texto };
    if (this.mensajeTimeout) {
      clearTimeout(this.mensajeTimeout);
    }
    this.mensajeTimeout = setTimeout(() => {
      this.mensaje = { tipo: '', texto: '' };
      this.mensajeTimeout = null;
    }, 4000);
  }

  trackByCedula(_index: number, usuario: Usuario): number {
    return usuario.cedula_usuario;
  }

  /**
   * Cancelar operación actual
   */
  cancelar(): void {
    this.limpiarFormulario();
    this.usuarioBuscado = null;
  }
}

