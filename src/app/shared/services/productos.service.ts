import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

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

@Injectable({
  providedIn: 'root'
})
export class ProductosService {
  private http = inject(HttpClient);
  private apiUrl = 'http://localhost:3000/api/productos';

  obtenerProductos(): Observable<ProductosResponse> {
    return this.http.get<ProductosResponse>(this.apiUrl).pipe(
      catchError((error) => {
        console.error('Error al obtener productos:', error);
        return of({
          success: false,
          message: error?.error?.message || 'Error al obtener productos',
          data: []
        });
      })
    );
  }
}
