import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEvent } from '@angular/common/http';
import { Observable, of, BehaviorSubject } from 'rxjs';
import { catchError, retry, timeout, tap } from 'rxjs/operators';

export interface Producto {
  codigo_producto: string;
  nombre_producto: string;
  nitproveedor: string;
  precio_compra: number;
  ivacompra: number;
  precio_venta: number;
}

export interface ProductosResponse {
  success: boolean;
  message?: string;
  data: Producto[];
}

export interface ProductoResponse {
  success: boolean;
  message?: string;
  error?: string;
  data?: Producto;
}

export interface CargaProductosResumen {
  totalRegistros: number;
  cargados: number;
  conErrores: number;
}

export interface CargaProductosError {
  linea: number;
  codigo_producto?: string | null;
  nitproveedor?: string;
  error: string;
}

export interface CargaProductosResponse {
  success: boolean;
  message?: string;
  resumen?: CargaProductosResumen;
  errores?: CargaProductosError[];
}

@Injectable({
  providedIn: 'root'
})
export class ProductosService {
  private http = inject(HttpClient);
  private readonly apiUrl = '/api/productos';
  private productosSubject = new BehaviorSubject<Producto[]>([]);

  productos$ = this.productosSubject.asObservable();

  cargarProductos(force: boolean = false): Observable<ProductosResponse> {
    const cached = this.productosSubject.getValue();
    if (!force && cached.length > 0) {
      return of({
        success: true,
        message: 'Productos obtenidos desde cache',
        data: cached
      });
    }

    return this.http.get<ProductosResponse>(this.apiUrl).pipe(
      retry({ count: 2, delay: 700 }),
      catchError((error) => {
        console.error('Error al obtener productos:', error);
        return of({
          success: false,
          message: error?.error?.message || 'Error al obtener productos',
          data: cached
        });
      })
    );
  }

  obtenerProductos(force: boolean = false): Observable<ProductosResponse> {
    return this.cargarProductos(force).pipe(
      tap((response) => {
        if (response.success && Array.isArray(response.data)) {
          this.productosSubject.next(response.data);
        }
      })
    );
  }

  cargarProductosCsvConProgreso(archivo: File): Observable<HttpEvent<CargaProductosResponse>> {
    const formData = new FormData();
    formData.append('archivo', archivo);

    return this.http.post<CargaProductosResponse>(`${this.apiUrl}/cargar-csv`, formData, {
      observe: 'events',
      reportProgress: true
    }).pipe(
      timeout(30000)
    );
  }

  obtenerPorCodigo(codigo: string): Observable<ProductoResponse> {
    return this.http.get<ProductoResponse>(`${this.apiUrl}/${codigo}`).pipe(
      catchError((error) => {
        console.error('Error al obtener producto por código:', error);
        return of({
          success: false,
          error: error?.error?.error || error?.error?.message || 'Producto no encontrado'
        });
      })
    );
  }
}
