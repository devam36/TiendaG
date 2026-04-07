import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientesService, Cliente } from '../../shared/services/clientes.service';
import { Subject, of } from 'rxjs';
import { catchError, finalize, takeUntil, timeout } from 'rxjs/operators';

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './clientes.html',
  styleUrl: './clientes.scss'
})
export class ClientesComponent implements OnInit, OnDestroy {
  formulario = {
    cedula_cliente: '',
    nombre_cliente: '',
    direccion_cliente: '',
    telefono_cliente: '',
    email_cliente: ''
  };

  clientes: Cliente[] = [];
  todosClientes: Cliente[] = [];
  clienteSeleccionado: Cliente | null = null;
  modo: 'crear' | 'actualizar' = 'crear';
  isLoading = false;
  isSavingCliente = false;
  isBuscandoCedula = false;
  isEliminando = false;
  mensaje: { tipo: 'exito' | 'error' | ''; texto: string } = { tipo: '', texto: '' };
  cedulaBusqueda: string | number = '';
  filtroCedulaActivo: string | null = null;

  private destroy$ = new Subject<void>();
  private reintentoInicialClientes = false;
  private reintentoTimeout: ReturnType<typeof setTimeout> | null = null;
  private mensajeTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(private clientesService: ClientesService) {}

  ngOnInit(): void {
    this.clientesService.clientesActualizados$
      .pipe(takeUntil(this.destroy$))
      .subscribe((clientes) => {
        this.todosClientes = clientes;
        this.aplicarFiltroEnLista();
      });

    this.cargarClientes();
  }

  ngOnDestroy(): void {
    if (this.reintentoTimeout) {
      clearTimeout(this.reintentoTimeout);
      this.reintentoTimeout = null;
    }
    if (this.mensajeTimeout) {
      clearTimeout(this.mensajeTimeout);
      this.mensajeTimeout = null;
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  cargarClientes(): void {
    this.isLoading = true;
    this.clientesService.cargarClientes()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isLoading = false;
          if (response.success && response.data) {
            this.todosClientes = response.data;
            this.aplicarFiltroEnLista();
            this.reintentoInicialClientes = false;
          } else {
            this.mostrarMensaje(response.error || 'Error al cargar clientes', 'error');
            this.reintentarCargaInicialClientes();
          }
        },
        error: (error) => {
          this.isLoading = false;
          this.mostrarMensaje('Error de conexión', 'error');
          console.error('Error:', error);
          this.reintentarCargaInicialClientes();
        }
      });
  }

  private reintentarCargaInicialClientes(): void {
    if (this.reintentoInicialClientes || this.destroy$.closed) {
      return;
    }

    this.reintentoInicialClientes = true;
    this.reintentoTimeout = setTimeout(() => {
      if (!this.destroy$.closed) {
        this.cargarClientes();
      }
      this.reintentoTimeout = null;
    }, 1500);
  }

  buscarPorCedula(): void {
    const cedula = String(this.cedulaBusqueda ?? '').trim();
    
    if (!cedula) {
      this.mostrarMensaje('Por favor ingrese una cédula para buscar', 'error');
      return;
    }

    if (!/^\d+$/.test(cedula)) {
      this.mostrarMensaje('La cédula debe contener solo números', 'error');
      return;
    }

    const clienteLocal = this.todosClientes.find(
      (cliente) => String(cliente.cedula_cliente) === cedula
    );

    if (clienteLocal) {
      this.seleccionarCliente(clienteLocal);
      this.filtroCedulaActivo = cedula;
      this.aplicarFiltroEnLista();
      this.mostrarMensaje('Cliente encontrado', 'exito');
      return;
    }

    this.isBuscandoCedula = true;
    this.clientesService.obtenerPorCedula(Number(cedula))
      .pipe(
        takeUntil(this.destroy$),
        timeout(8000),
        catchError(() => of({ success: false, data: undefined })),
        finalize(() => {
          this.isBuscandoCedula = false;
        })
      )
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.seleccionarCliente(response.data);
            this.filtroCedulaActivo = cedula;
            this.aplicarFiltroEnLista();
            this.mostrarMensaje('Cliente encontrado', 'exito');
          } else {
            this.mostrarMensaje('Cliente no encontrado', 'error');
            this.clienteSeleccionado = null;
            this.filtroCedulaActivo = cedula;
            this.aplicarFiltroEnLista();
          }
        },
        error: (error) => {
          console.error('Error al buscar cliente:', error);
          this.mostrarMensaje('Error al buscar cliente', 'error');
        }
      });
  }

  accionPrincipalListaClientes(): void {
    const cedula = String(this.cedulaBusqueda ?? '').trim();

    if (!cedula) {
      this.filtroCedulaActivo = null;
      this.cargarClientes();
      return;
    }

    this.buscarPorCedula();
  }

  limpiarFiltroLista(): void {
    this.cedulaBusqueda = '';
    this.filtroCedulaActivo = null;
    this.cargarClientes();
  }

  seleccionarCliente(cliente: Cliente): void {
    this.clienteSeleccionado = cliente;
    this.modo = 'actualizar';
    this.cedulaBusqueda = String(cliente.cedula_cliente);
    this.filtroCedulaActivo = String(cliente.cedula_cliente);
    this.aplicarFiltroEnLista();
    this.formulario = {
      cedula_cliente: cliente.cedula_cliente.toString(),
      nombre_cliente: cliente.nombre_cliente,
      direccion_cliente: cliente.direccion_cliente,
      telefono_cliente: cliente.telefono_cliente,
      email_cliente: cliente.email_cliente
    };
  }

  guardarCliente(): void {
    const validacion = this.validarFormulario();
    if (!validacion.valido) {
      this.mostrarMensaje(validacion.error || 'Error en validación', 'error');
      return;
    }

    const cedulaTexto = String(this.formulario.cedula_cliente ?? '').trim();

    const cliente: Cliente = {
      cedula_cliente: Number(cedulaTexto),
      nombre_cliente: this.formulario.nombre_cliente.trim(),
      direccion_cliente: this.formulario.direccion_cliente.trim(),
      telefono_cliente: this.formulario.telefono_cliente.trim(),
      email_cliente: this.formulario.email_cliente.trim()
    };

    const validacionServicio = this.clientesService.validarCliente(cliente);
    if (!validacionServicio.valido) {
      this.mostrarMensaje(validacionServicio.error || 'Error en validación', 'error');
      return;
    }

    this.isSavingCliente = true;
    if (this.modo === 'crear') {
      this.clientesService.crearCliente(cliente)
        .pipe(
          takeUntil(this.destroy$),
          finalize(() => {
            this.isSavingCliente = false;
          })
        )
        .subscribe({
          next: (response) => {
            if (response.success) {
              this.mostrarMensaje('✓ Cliente creado correctamente', 'exito');
              this.limpiarFormulario();
            } else {
              this.mostrarMensaje(response.error || 'Error al crear cliente', 'error');
            }
          },
          error: (error) => {
            this.mostrarMensaje('Error de conexión al crear cliente', 'error');
            console.error('Error:', error);
          }
        });
    } else {
      // actualizar
      if (!this.clienteSeleccionado) {
        this.mostrarMensaje('No hay cliente seleccionado', 'error');
        this.isSavingCliente = false;
        return;
      }
      this.clientesService.actualizarCliente(this.clienteSeleccionado.cedula_cliente, cliente)
        .pipe(
          takeUntil(this.destroy$),
          finalize(() => {
            this.isSavingCliente = false;
          })
        )
        .subscribe({
          next: (response) => {
            if (response.success) {
              this.mostrarMensaje('✓ Cliente actualizado correctamente', 'exito');
              this.limpiarFormulario();
            } else {
              this.mostrarMensaje(response.error || 'Error al actualizar cliente', 'error');
            }
          },
          error: (error) => {
            this.mostrarMensaje('Error de conexión al actualizar cliente', 'error');
            console.error('Error:', error);
          }
        });
    }
  }

  eliminarCliente(cedula: number): void {
    if (!confirm('¿Seguro que desea eliminar este cliente?')) {
      return;
    }
    this.isEliminando = true;
    this.clientesService.eliminarCliente(cedula)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isEliminando = false;
        })
      )
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.mostrarMensaje('✓ Cliente eliminado correctamente', 'exito');

            if (this.filtroCedulaActivo === String(cedula)) {
              this.filtroCedulaActivo = null;
              this.cedulaBusqueda = '';
              this.aplicarFiltroEnLista();
            }

            if (this.clienteSeleccionado?.cedula_cliente === cedula) {
              this.limpiarFormulario();
            }
          } else {
            this.mostrarMensaje(response.error || 'Error al eliminar cliente', 'error');
          }
        },
        error: (error) => {
          this.mostrarMensaje('Error de conexión al eliminar cliente', 'error');
          console.error('Error:', error);
        }
      });
  }

  limpiarFormulario(): void {
    this.formulario = {
      cedula_cliente: '',
      nombre_cliente: '',
      direccion_cliente: '',
      telefono_cliente: '',
      email_cliente: ''
    };
    this.cedulaBusqueda = '';
    this.clienteSeleccionado = null;
    this.filtroCedulaActivo = null;
    this.aplicarFiltroEnLista();
    this.modo = 'crear';
  }

  private aplicarFiltroEnLista(): void {
    if (this.filtroCedulaActivo === null) {
      this.clientes = [...this.todosClientes];
      return;
    }

    this.clientes = this.todosClientes.filter(
      (cliente) => String(cliente.cedula_cliente) === this.filtroCedulaActivo
    );
  }

  private validarFormulario(): { valido: boolean; error?: string } {
    const cedulaTexto = String(this.formulario.cedula_cliente ?? '').trim();

    if (!cedulaTexto) {
      return { valido: false, error: 'La cédula es requerida' };
    }
    if (!/^\d+$/.test(cedulaTexto)) {
      return { valido: false, error: 'La cédula debe contener solo números' };
    }
    if (!this.formulario.nombre_cliente || this.formulario.nombre_cliente.trim() === '') {
      return { valido: false, error: 'El nombre es requerido' };
    }
    if (!this.formulario.email_cliente || this.formulario.email_cliente.trim() === '') {
      return { valido: false, error: 'El correo electrónico es requerido' };
    }
    // direccion y telefono opcionales
    return { valido: true };
  }

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

  trackByCedula(_index: number, cliente: Cliente): number {
    return cliente.cedula_cliente;
  }

  cancelar(): void {
    this.limpiarFormulario();
  }
}

