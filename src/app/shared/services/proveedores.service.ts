import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, tap, catchError, of } from 'rxjs';

export interface Proveedor {
  nitproveedor: string;
  nombre_proveedor: string;
  direccion_proveedor: string;
  telefono_proveedor: string;
  ciudad_proveedor: string;
}

export interface ProveedoresResponse {
  success: boolean;
  data: Proveedor[];
  message?: string;
}

export interface ProveedorResponse {
  success: boolean;
  data?: Proveedor;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ProveedoresService {
  private http = inject(HttpClient);
  private apiUrl = 'http://localhost:3000/api/proveedores';
  
  private proveedoresSubject = new BehaviorSubject<Proveedor[]>([]);
  public proveedores$ = this.proveedoresSubject.asObservable();

  // Cargar todos los proveedores
  cargarProveedores(): Observable<ProveedoresResponse> {
    return this.http.get<ProveedoresResponse>(this.apiUrl).pipe(
      tap(response => {
        if (response.success && response.data) {
          this.proveedoresSubject.next(response.data);
        }
      }),
      catchError(error => {
        console.error('Error al cargar proveedores:', error);
        return of({ success: false, data: [], message: 'Error al cargar proveedores' });
      })
    );
  }

  // Obtener proveedor por NIT
  obtenerPorNit(nit: string): Observable<ProveedorResponse> {
    return this.http.get<ProveedorResponse>(`${this.apiUrl}/${nit}`).pipe(
      catchError(error => {
        console.error('Error al obtener proveedor:', error);
        return of({ success: false, message: 'Proveedor no encontrado' });
      })
    );
  }

  // Crear nuevo proveedor
  crearProveedor(proveedor: Proveedor): Observable<ProveedorResponse> {
    return this.http.post<ProveedorResponse>(this.apiUrl, proveedor).pipe(
      catchError(error => {
        console.error('Error al crear proveedor:', error);
        return of({ success: false, message: 'Error al crear proveedor' });
      })
    );
  }

  // Actualizar proveedor
  actualizarProveedor(nit: string, proveedor: Proveedor): Observable<ProveedorResponse> {
    return this.http.put<ProveedorResponse>(`${this.apiUrl}/${nit}`, proveedor).pipe(
      catchError(error => {
        console.error('Error al actualizar proveedor:', error);
        return of({ success: false, message: 'Error al actualizar proveedor' });
      })
    );
  }

  // Eliminar proveedor
  eliminarProveedor(nit: string): Observable<ProveedorResponse> {
    return this.http.delete<ProveedorResponse>(`${this.apiUrl}/${nit}`).pipe(
      catchError(error => {
        console.error('Error al eliminar proveedor:', error);
        return of({ success: false, message: 'Error al eliminar proveedor' });
      })
    );
  }

}
