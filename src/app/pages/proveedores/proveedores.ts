import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ProveedoresService, Proveedor } from '../../shared/services/proveedores.service';

@Component({
  selector: 'app-proveedores',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './proveedores.html',
  styleUrl: './proveedores.scss'
})
export class ProveedoresComponent implements OnInit, OnDestroy {
  private proveedoresService = inject(ProveedoresService);
  private destroy$ = new Subject<void>();

  // Estado del componente
  proveedores: Proveedor[] = [];
  isLoading = false;
  modo: 'crear' | 'actualizar' = 'crear';

  // Formulario
  formulario: Proveedor = {
    nitproveedor: '',
    nombre_proveedor: '',
    direccion_proveedor: '',
    telefono_proveedor: '',
    ciudad_proveedor: ''
  };

  // Mensajes
  mensaje = {
    texto: '',
    tipo: 'exito' as 'exito' | 'error'
  };

  ngOnInit(): void {
    if (!this.destroy$.closed) {
      this.cargarProveedores();
    }
  }

  ngOnDestroy(): void {
    if (!this.destroy$.closed) {
      this.destroy$.next();
      this.destroy$.complete();
    }
  }

  // Cargar todos los proveedores
  cargarProveedores(): void {
    if (this.destroy$.closed) {
      return;
    }

    this.isLoading = true;
    
    this.proveedoresService.cargarProveedores()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.proveedores = response.data;
          } else {
            this.mostrarMensaje(response.message || 'No se pudieron cargar los proveedores', 'error');
          }
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error al cargar proveedores:', error);
          this.mostrarMensaje('Error al cargar proveedores', 'error');
          this.isLoading = false;
        }
      });
  }

  // Buscar proveedor por NIT
  buscarPorNit(): void {
    const nit = this.formulario.nitproveedor.trim();
    
    if (!nit) {
      this.mostrarMensaje('Por favor ingrese un NIT para buscar', 'error');
      return;
    }

    this.isLoading = true;
    this.proveedoresService.obtenerPorNit(nit)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.formulario = { ...response.data };
            this.modo = 'actualizar';
            this.mostrarMensaje('Proveedor encontrado', 'exito');
          } else {
            this.mostrarMensaje('Proveedor no encontrado', 'error');
            this.limpiarFormulario();
          }
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error al buscar proveedor:', error);
          this.mostrarMensaje('Error al buscar proveedor', 'error');
          this.isLoading = false;
        }
      });
  }

  // Crear nuevo proveedor
  crearProveedor(): void {
    if (!this.validarFormulario()) {
      return;
    }

    this.isLoading = true;
    this.proveedoresService.crearProveedor(this.formulario)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.mostrarMensaje('Proveedor creado exitosamente', 'exito');
            this.limpiarFormulario();
            this.cargarProveedores();
          } else {
            this.mostrarMensaje(response.message || 'Error al crear proveedor', 'error');
          }
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error al crear proveedor:', error);
          this.mostrarMensaje('Error al crear proveedor', 'error');
          this.isLoading = false;
        }
      });
  }

  // Actualizar proveedor existente
  actualizarProveedor(): void {
    if (!this.validarFormulario()) {
      return;
    }

    const nit = this.formulario.nitproveedor;
    this.isLoading = true;

    this.proveedoresService.actualizarProveedor(nit, this.formulario)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.mostrarMensaje('Proveedor actualizado exitosamente', 'exito');
            this.limpiarFormulario();
            this.cargarProveedores();
          } else {
            this.mostrarMensaje(response.message || 'Error al actualizar proveedor', 'error');
          }
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error al actualizar proveedor:', error);
          this.mostrarMensaje('Error al actualizar proveedor', 'error');
          this.isLoading = false;
        }
      });
  }

  // Eliminar proveedor
  eliminarProveedor(): void {
    const nit = this.formulario.nitproveedor.trim();
    
    if (!nit) {
      this.mostrarMensaje('Por favor ingrese un NIT para eliminar', 'error');
      return;
    }

    if (!confirm(`¿Está seguro que desea eliminar el proveedor con NIT ${nit}?`)) {
      return;
    }

    this.isLoading = true;
    this.proveedoresService.eliminarProveedor(nit)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.mostrarMensaje('Proveedor eliminado exitosamente', 'exito');
            this.limpiarFormulario();
            this.cargarProveedores();
          } else {
            this.mostrarMensaje(response.message || 'Error al eliminar proveedor', 'error');
          }
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error al eliminar proveedor:', error);
          this.mostrarMensaje('Error al eliminar proveedor', 'error');
          this.isLoading = false;
        }
      });
  }

  // Seleccionar proveedor de la tabla para editar
  seleccionarProveedor(proveedor: Proveedor): void {
    this.formulario = { ...proveedor };
    this.modo = 'actualizar';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Eliminar desde la tabla
  eliminarDesdeTabla(nit: string): void {
    if (!confirm(`¿Está seguro que desea eliminar el proveedor con NIT ${nit}?`)) {
      return;
    }

    this.isLoading = true;
    this.proveedoresService.eliminarProveedor(nit)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.mostrarMensaje('Proveedor eliminado exitosamente', 'exito');
            this.cargarProveedores();
          } else {
            this.mostrarMensaje(response.message || 'Error al eliminar proveedor', 'error');
          }
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error al eliminar proveedor:', error);
          this.mostrarMensaje('Error al eliminar proveedor', 'error');
          this.isLoading = false;
        }
      });
  }

  // Validar formulario
  validarFormulario(): boolean {
    const { nitproveedor, nombre_proveedor, direccion_proveedor, telefono_proveedor, ciudad_proveedor } = this.formulario;

    if (!nitproveedor?.trim()) {
      this.mostrarMensaje('El NIT es obligatorio', 'error');
      return false;
    }

    if (!nombre_proveedor?.trim()) {
      this.mostrarMensaje('El nombre del proveedor es obligatorio', 'error');
      return false;
    }

    if (!direccion_proveedor?.trim()) {
      this.mostrarMensaje('La dirección es obligatoria', 'error');
      return false;
    }

    if (!telefono_proveedor?.trim()) {
      this.mostrarMensaje('El teléfono es obligatorio', 'error');
      return false;
    }

    if (!ciudad_proveedor?.trim()) {
      this.mostrarMensaje('La ciudad es obligatoria', 'error');
      return false;
    }

    return true;
  }

  // Limpiar formulario
  limpiarFormulario(): void {
    this.formulario = {
      nitproveedor: '',
      nombre_proveedor: '',
      direccion_proveedor: '',
      telefono_proveedor: '',
      ciudad_proveedor: ''
    };
    this.modo = 'crear';
  }

  // Guardar (crear o actualizar según el modo)
  guardarProveedor(): void {
    if (this.modo === 'crear') {
      this.crearProveedor();
    } else {
      this.actualizarProveedor();
    }
  }

  // Mostrar mensaje
  mostrarMensaje(texto: string, tipo: 'exito' | 'error'): void {
    this.mensaje = { texto, tipo };
    setTimeout(() => {
      this.mensaje = { texto: '', tipo: 'exito' };
    }, 5000);
  }

  // TrackBy para optimizar el renderizado del *ngFor
  trackByNit(index: number, proveedor: Proveedor): string {
    return proveedor.nitproveedor;
  }
}
