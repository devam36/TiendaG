import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientesService, Cliente } from '../../shared/services/clientes.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

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
  clienteSeleccionado: Cliente | null = null;
  modo: 'crear' | 'actualizar' = 'crear';
  isLoading = false;
  mensaje: { tipo: 'exito' | 'error' | ''; texto: string } = { tipo: '', texto: '' };

  private destroy$ = new Subject<void>();

  constructor(private clientesService: ClientesService) {}

  ngOnInit(): void {
    this.cargarClientes();
  }

  ngOnDestroy(): void {
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
            this.clientes = response.data;
            this.mostrarMensaje('Clientes cargados correctamente', 'exito');
          } else {
            this.mostrarMensaje(response.error || 'Error al cargar clientes', 'error');
          }
        },
        error: (error) => {
          this.isLoading = false;
          this.mostrarMensaje('Error de conexión', 'error');
          console.error('Error:', error);
        }
      });
  }

  buscarPorCedula(): void {
    const cedula = this.formulario.cedula_cliente.trim();
    
    if (!cedula) {
      this.mostrarMensaje('Por favor ingrese una cédula para buscar', 'error');
      return;
    }

    this.isLoading = true;
    this.clientesService.obtenerPorCedula(Number(cedula))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.formulario = {
              cedula_cliente: response.data.cedula_cliente.toString(),
              nombre_cliente: response.data.nombre_cliente,
              direccion_cliente: response.data.direccion_cliente,
              telefono_cliente: response.data.telefono_cliente,
              email_cliente: response.data.email_cliente
            };
            this.modo = 'actualizar';
            this.mostrarMensaje('Cliente encontrado', 'exito');
          } else {
            this.mostrarMensaje('Cliente no encontrado', 'error');
            this.limpiarFormulario();
          }
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error al buscar cliente:', error);
          this.mostrarMensaje('Error al buscar cliente', 'error');
          this.isLoading = false;
        }
      });
  }

  seleccionarCliente(cliente: Cliente): void {
    this.clienteSeleccionado = cliente;
    this.modo = 'actualizar';
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

    const cliente: Cliente = {
      cedula_cliente: Number(this.formulario.cedula_cliente),
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

    this.isLoading = true;
    if (this.modo === 'crear') {
      this.clientesService.crearCliente(cliente)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            this.isLoading = false;
            if (response.success) {
              this.mostrarMensaje('✓ Cliente creado correctamente', 'exito');
              this.limpiarFormulario();
              this.cargarClientes();
            } else {
              this.mostrarMensaje(response.error || 'Error al crear cliente', 'error');
            }
          },
          error: (error) => {
            this.isLoading = false;
            this.mostrarMensaje('Error de conexión al crear cliente', 'error');
            console.error('Error:', error);
          }
        });
    } else {
      // actualizar
      if (!this.clienteSeleccionado) {
        this.mostrarMensaje('No hay cliente seleccionado', 'error');
        this.isLoading = false;
        return;
      }
      this.clientesService.actualizarCliente(this.clienteSeleccionado.cedula_cliente, cliente)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (response) => {
            this.isLoading = false;
            if (response.success) {
              this.mostrarMensaje('✓ Cliente actualizado correctamente', 'exito');
              this.limpiarFormulario();
              this.cargarClientes();
              this.clienteSeleccionado = null;
              this.modo = 'crear';
            } else {
              this.mostrarMensaje(response.error || 'Error al actualizar cliente', 'error');
            }
          },
          error: (error) => {
            this.isLoading = false;
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
    this.isLoading = true;
    this.clientesService.eliminarCliente(cedula)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.isLoading = false;
          if (response.success) {
            this.mostrarMensaje('✓ Cliente eliminado correctamente', 'exito');
            this.cargarClientes();
            if (this.clienteSeleccionado?.cedula_cliente === cedula) {
              this.limpiarFormulario();
              this.clienteSeleccionado = null;
              this.modo = 'crear';
            }
          } else {
            this.mostrarMensaje(response.error || 'Error al eliminar cliente', 'error');
          }
        },
        error: (error) => {
          this.isLoading = false;
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
    this.clienteSeleccionado = null;
    this.modo = 'crear';
  }

  private validarFormulario(): { valido: boolean; error?: string } {
    if (!this.formulario.cedula_cliente || this.formulario.cedula_cliente.trim() === '') {
      return { valido: false, error: 'La cédula es requerida' };
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
    setTimeout(() => {
      this.mensaje = { tipo: '', texto: '' };
    }, 4000);
  }

  cancelar(): void {
    this.limpiarFormulario();
  }
}

