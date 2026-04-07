import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, of, takeUntil } from 'rxjs';
import { catchError, finalize, timeout } from 'rxjs/operators';
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
  private reintentoInicialProveedores = false;
  private reintentoTimeout: ReturnType<typeof setTimeout> | null = null;
  private mensajeTimeout: ReturnType<typeof setTimeout> | null = null;

  // Estado del componente
  proveedores: Proveedor[] = [];
  todosProveedores: Proveedor[] = [];
  isLoading = false;
  isSavingProveedor = false;
  isBuscandoNit = false;
  isEliminando = false;
  modo: 'crear' | 'actualizar' = 'crear';
  nitBusqueda = '';
  filtroNitActivo: string | null = null;

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
    this.proveedoresService.proveedores$
      .pipe(takeUntil(this.destroy$))
      .subscribe((proveedores) => {
        this.todosProveedores = proveedores;
        this.aplicarFiltroEnLista();
      });

    if (!this.destroy$.closed) {
      this.cargarProveedores();
    }
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
    if (!this.destroy$.closed) {
      this.destroy$.next();
      this.destroy$.complete();
    }
  }

  // Cargar todos los proveedores
  cargarProveedores(force: boolean = false): void {
    if (this.destroy$.closed) {
      return;
    }

    this.isLoading = true;
    
    this.proveedoresService.cargarProveedores(force)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.todosProveedores = response.data;
            this.aplicarFiltroEnLista();
            this.reintentoInicialProveedores = false;
          } else {
            this.mostrarMensaje(response.message || 'No se pudieron cargar los proveedores', 'error');
            this.reintentarCargaInicialProveedores();
          }
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Error al cargar proveedores:', error);
          this.mostrarMensaje('Error al cargar proveedores', 'error');
          this.isLoading = false;
          this.reintentarCargaInicialProveedores();
        }
      });
  }

  private reintentarCargaInicialProveedores(): void {
    if (this.reintentoInicialProveedores || this.destroy$.closed) {
      return;
    }

    this.reintentoInicialProveedores = true;
    this.reintentoTimeout = setTimeout(() => {
      if (!this.destroy$.closed) {
        this.cargarProveedores(true);
      }
      this.reintentoTimeout = null;
    }, 1500);
  }

  // Buscar proveedor por NIT
  buscarPorNit(): void {
    const nit = String(this.nitBusqueda ?? '').trim();
    
    if (!nit) {
      this.mostrarMensaje('Por favor ingrese un NIT para buscar', 'error');
      return;
    }

    if (!/^\d+$/.test(nit)) {
      this.mostrarMensaje('El NIT debe contener solo números', 'error');
      return;
    }

    const proveedorLocal = this.todosProveedores.find((p) => p.nitproveedor === nit);
    if (proveedorLocal) {
      this.seleccionarProveedor(proveedorLocal);
      this.filtroNitActivo = nit;
      this.aplicarFiltroEnLista();
      this.mostrarMensaje('Proveedor encontrado', 'exito');
      return;
    }

    this.isBuscandoNit = true;
    this.proveedoresService.obtenerPorNit(nit)
      .pipe(
        takeUntil(this.destroy$),
        timeout(8000),
        catchError(() => of({ success: false, message: 'Proveedor no encontrado', data: undefined })),
        finalize(() => {
          this.isBuscandoNit = false;
        })
      )
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.seleccionarProveedor(response.data);
            this.filtroNitActivo = nit;
            this.aplicarFiltroEnLista();
            this.mostrarMensaje('Proveedor encontrado', 'exito');
          } else {
            this.mostrarMensaje('Proveedor no encontrado', 'error');
            this.filtroNitActivo = nit;
            this.aplicarFiltroEnLista();
          }
        },
        error: (error) => {
          console.error('Error al buscar proveedor:', error);
          this.mostrarMensaje('Error al buscar proveedor', 'error');
        }
      });
  }

  accionPrincipalListaProveedores(): void {
    const nit = String(this.nitBusqueda ?? '').trim();

    if (!nit) {
      this.filtroNitActivo = null;
      this.cargarProveedores();
      return;
    }

    this.buscarPorNit();
  }

  limpiarFiltroLista(): void {
    this.nitBusqueda = '';
    this.filtroNitActivo = null;
    this.cargarProveedores();
  }

  // Crear nuevo proveedor
  crearProveedor(): void {
    if (!this.validarFormulario()) {
      return;
    }

    this.isSavingProveedor = true;
    this.proveedoresService.crearProveedor(this.formulario)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isSavingProveedor = false;
        })
      )
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.mostrarMensaje('Proveedor creado exitosamente', 'exito');
            this.limpiarFormulario();
          } else {
            this.mostrarMensaje(response.message || 'Error al crear proveedor', 'error');
          }
        },
        error: (error) => {
          console.error('Error al crear proveedor:', error);
          this.mostrarMensaje('Error al crear proveedor', 'error');
        }
      });
  }

  // Actualizar proveedor existente
  actualizarProveedor(): void {
    if (!this.validarFormulario()) {
      return;
    }

    const nit = this.formulario.nitproveedor;
    this.isSavingProveedor = true;

    this.proveedoresService.actualizarProveedor(nit, this.formulario)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isSavingProveedor = false;
        })
      )
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.mostrarMensaje('Proveedor actualizado exitosamente', 'exito');
            this.limpiarFormulario();
          } else {
            this.mostrarMensaje(response.message || 'Error al actualizar proveedor', 'error');
          }
        },
        error: (error) => {
          console.error('Error al actualizar proveedor:', error);
          this.mostrarMensaje('Error al actualizar proveedor', 'error');
        }
      });
  }

  // Seleccionar proveedor de la tabla para editar
  seleccionarProveedor(proveedor: Proveedor): void {
    this.formulario = { ...proveedor };
    this.nitBusqueda = proveedor.nitproveedor;
    this.filtroNitActivo = proveedor.nitproveedor;
    this.aplicarFiltroEnLista();
    this.modo = 'actualizar';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Eliminar desde la tabla
  eliminarDesdeTabla(nit: string): void {
    if (!confirm(`¿Está seguro que desea eliminar el proveedor con NIT ${nit}?`)) {
      return;
    }

    this.isEliminando = true;
    this.proveedoresService.eliminarProveedor(nit)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isEliminando = false;
        })
      )
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.mostrarMensaje('Proveedor eliminado exitosamente', 'exito');
            if (this.filtroNitActivo === nit) {
              this.filtroNitActivo = null;
              this.nitBusqueda = '';
              this.aplicarFiltroEnLista();
            }
            if (this.formulario.nitproveedor === nit) {
              this.limpiarFormulario();
            }
          } else {
            this.mostrarMensaje(response.message || 'Error al eliminar proveedor', 'error');
          }
        },
        error: (error) => {
          console.error('Error al eliminar proveedor:', error);
          this.mostrarMensaje('Error al eliminar proveedor', 'error');
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

    if (!/^\d+$/.test(nitproveedor.trim())) {
      this.mostrarMensaje('El NIT debe contener solo números', 'error');
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
    this.nitBusqueda = '';
    this.filtroNitActivo = null;
    this.aplicarFiltroEnLista();
    this.modo = 'crear';
  }

  private aplicarFiltroEnLista(): void {
    if (this.filtroNitActivo === null) {
      this.proveedores = [...this.todosProveedores];
      return;
    }

    this.proveedores = this.todosProveedores.filter(
      (proveedor) => proveedor.nitproveedor === this.filtroNitActivo
    );
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
    if (this.mensajeTimeout) {
      clearTimeout(this.mensajeTimeout);
    }
    this.mensajeTimeout = setTimeout(() => {
      this.mensaje = { texto: '', tipo: 'exito' };
      this.mensajeTimeout = null;
    }, 5000);
  }

  // TrackBy para optimizar el renderizado del *ngFor
  trackByNit(index: number, proveedor: Proveedor): string {
    return proveedor.nitproveedor;
  }
}
