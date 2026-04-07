import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { finalize } from 'rxjs/operators';
import {
  ProductosService,
  Producto,
  CargaProductosResumen,
  CargaProductosError
} from '../../shared/services/productos.service';

@Component({
  selector: 'app-productos',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './productos.html',
  styleUrl: './productos.scss'
})
export class ProductosComponent implements OnInit, OnDestroy {
  private productosService = inject(ProductosService);
  private cdr = inject(ChangeDetectorRef);
  private destroy$ = new Subject<void>();
  private cargaReintentoTimeout: ReturnType<typeof setTimeout> | null = null;
  private cargaTimeout: ReturnType<typeof setTimeout> | null = null;
  private cargaReintentosHechos = 0;
  private readonly maxCargaReintentos = 6;

  productos: Producto[] = [];
  isLoading = false;
  isUploading = false;
  progresoCarga = 0;
  textoProgresoCarga = '';
  mensajeError = '';
  mensajeCarga = '';
  resumenCarga: CargaProductosResumen | null = null;
  erroresCarga: CargaProductosError[] = [];
  archivoSeleccionado: File | null = null;

  ngOnInit(): void {
    this.productosService.productos$
      .pipe(takeUntil(this.destroy$))
      .subscribe((productos) => {
        this.productos = productos;
        this.cdr.detectChanges();
      });

    this.cargarProductos(true, true);
  }

  ngOnDestroy(): void {
    if (this.cargaReintentoTimeout) {
      clearTimeout(this.cargaReintentoTimeout);
      this.cargaReintentoTimeout = null;
    }
    if (this.cargaTimeout) {
      clearTimeout(this.cargaTimeout);
      this.cargaTimeout = null;
    }

    this.destroy$.next();
    this.destroy$.complete();
  }

  cargarProductos(force: boolean = false, reiniciarReintentos: boolean = false): void {
    if (reiniciarReintentos) {
      this.cargaReintentosHechos = 0;
      if (this.cargaReintentoTimeout) {
        clearTimeout(this.cargaReintentoTimeout);
        this.cargaReintentoTimeout = null;
      }
    }

    this.isLoading = true;
    this.mensajeError = '';

    this.productosService.obtenerProductos(force)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            this.productos = response.data || [];
            this.cargaReintentosHechos = 0;
            this.isLoading = false;
            this.cdr.detectChanges();
            return;
          }

          this.programarReintentoCarga(response.message || 'No fue posible cargar productos');
          this.cdr.detectChanges();
        },
        error: () => {
          this.programarReintentoCarga('No fue posible cargar productos');
          this.cdr.detectChanges();
        }
      });
  }

  reintentarCargaProductos(): void {
    this.mensajeError = '';
    this.cargarProductos(true, true);
  }

  private programarReintentoCarga(mensaje: string): void {
    if (this.destroy$.closed) {
      return;
    }

    if (this.cargaReintentosHechos < this.maxCargaReintentos) {
      this.cargaReintentosHechos += 1;

      if (this.cargaReintentoTimeout) {
        clearTimeout(this.cargaReintentoTimeout);
      }

      this.cargaReintentoTimeout = setTimeout(() => {
        this.cargaReintentoTimeout = null;
        if (!this.destroy$.closed) {
          this.cargarProductos();
        }
      }, 1500);
      return;
    }

    this.productos = [];
    this.mensajeError = mensaje;
    this.isLoading = false;
    this.cdr.detectChanges();
  }

  private dispararRecargaDespuesDeCarga(): void {
    setTimeout(() => {
      if (!this.destroy$.closed) {
        this.cargarProductos(true, true);
      }
    }, 300);
  }

  onArchivoSeleccionado(event: Event): void {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0] ?? null;

    this.mensajeCarga = '';
    this.resumenCarga = null;
    this.erroresCarga = [];

    if (!archivo) {
      this.archivoSeleccionado = null;
      return;
    }

    const nombre = archivo.name.toLowerCase();
    const esCsv = nombre.endsWith('.csv') || archivo.type === 'text/csv';
    if (!esCsv) {
      this.archivoSeleccionado = null;
      this.mensajeCarga = 'El archivo seleccionado no es CSV. Use un archivo separado por comas.';
      return;
    }

    this.archivoSeleccionado = archivo;
  }

  cargarArchivoCsv(): void {
    if (!this.archivoSeleccionado) {
      this.mensajeCarga = 'Seleccione un archivo CSV antes de cargar.';
      return;
    }

    this.isUploading = true;
    this.progresoCarga = 0;
    this.textoProgresoCarga = 'Preparando carga...';
    this.mensajeCarga = '';
    this.resumenCarga = null;
    this.erroresCarga = [];

    if (this.cargaTimeout) {
      clearTimeout(this.cargaTimeout);
    }

    this.cargaTimeout = setTimeout(() => {
      if (this.isUploading) {
        this.isUploading = false;
        this.progresoCarga = 0;
        this.textoProgresoCarga = '';
        this.mensajeCarga = 'La carga tardó demasiado. Verifique el archivo o el servidor y vuelva a intentar.';
        this.cdr.detectChanges();
      }
      this.cargaTimeout = null;
    }, 25000);

    this.productosService.cargarProductosCsvConProgreso(this.archivoSeleccionado)
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          this.isUploading = false;
          if (this.cargaTimeout) {
            clearTimeout(this.cargaTimeout);
            this.cargaTimeout = null;
          }
          if (this.progresoCarga < 100) {
            this.progresoCarga = 0;
            this.textoProgresoCarga = '';
          }
          this.cdr.detectChanges();
        })
      )
      .subscribe({
        next: (event) => {
          if (event.type === HttpEventType.Sent) {
            this.textoProgresoCarga = 'Enviando archivo...';
            this.cdr.detectChanges();
            return;
          }

          if (event.type === HttpEventType.UploadProgress) {
            const total = event.total ?? 0;
            this.progresoCarga = total > 0 ? Math.min(100, Math.round((event.loaded / total) * 100)) : 0;
            this.textoProgresoCarga = `Subiendo... ${this.progresoCarga}%`;
            this.cdr.detectChanges();
            return;
          }

          if (event.type !== HttpEventType.Response) {
            return;
          }

          const response = event.body;
          if (!response) {
            this.mensajeCarga = 'No se recibió respuesta de la carga.';
            this.cdr.detectChanges();
            return;
          }

          this.progresoCarga = 100;
          this.textoProgresoCarga = 'Procesando respuesta...';
          this.mensajeCarga = response.message || (response.success ? 'Carga completada.' : 'La carga terminó con observaciones.');
          this.resumenCarga = response.resumen || null;
          this.erroresCarga = response.errores || [];

          if (response.success || this.resumenCarga?.cargados) {
            this.dispararRecargaDespuesDeCarga();
          }
          this.cdr.detectChanges();
        },
        error: (error: HttpErrorResponse | Error) => {
          const apiError = (error as HttpErrorResponse).error;
          this.mensajeCarga = apiError?.message || 'No fue posible cargar el archivo CSV.';
          this.resumenCarga = apiError?.resumen || null;
          this.erroresCarga = apiError?.errores || [];
          this.progresoCarga = 0;
          this.textoProgresoCarga = '';
          this.cdr.detectChanges();
        }
      });
  }

  trackByCodigo(index: number, producto: Producto): string {
    return producto.codigo_producto;
  }
}
