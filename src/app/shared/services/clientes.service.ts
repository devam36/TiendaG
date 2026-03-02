import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';

export interface Cliente {
  cedula_cliente: number;
  nombre_cliente: string;
  direccion_cliente: string;
  telefono_cliente: string;
  email_cliente: string;
}

export interface ClienteResponse {
  success: boolean;
  message?: string;
  error?: string;
  data?: Cliente;
}

export interface ListaClientesResponse {
  success: boolean;
  message?: string;
  error?: string;
  data?: Cliente[];
}

@Injectable({
  providedIn: 'root'
})
export class ClientesService {
  private apiUrl = 'http://localhost:3000/api/clientes';

  private clientesActualizados = new BehaviorSubject<Cliente[]>([]);
  clientesActualizados$ = this.clientesActualizados.asObservable();

  constructor(private http: HttpClient) {
    this.cargarClientes().subscribe();
  }

  /**
   * Obtiene todos los clientes
   */
  cargarClientes(): Observable<ListaClientesResponse> {
    return this.http.get<ListaClientesResponse>(this.apiUrl).pipe(
      tap(response => {
        if (response.success && response.data) {
          this.clientesActualizados.next(response.data);
        }
      }),
      catchError(error => {
        console.error('Error al cargar clientes:', error);
        return of({
          success: false,
          error: error.error?.error || 'Error al cargar clientes'
        });
      })
    );
  }

  /**
   * Obtiene un cliente por cédula
   */
  obtenerPorCedula(cedula: number): Observable<ClienteResponse> {
    return this.http.get<ClienteResponse>(`${this.apiUrl}/${cedula}`).pipe(
      catchError(error => {
        console.error('Error al obtener cliente:', error);
        return of({
          success: false,
          error: error.error?.error || 'Cliente no encontrado'
        });
      })
    );
  }

  /**
   * Crea un nuevo cliente
   */
  crearCliente(cliente: Cliente): Observable<ClienteResponse> {
    return this.http.post<ClienteResponse>(this.apiUrl, cliente).pipe(
      tap(response => {
        if (response.success) {
          this.cargarClientes().subscribe();
        }
      }),
      catchError(error => {
        console.error('Error al crear cliente:', error);
        return of({
          success: false,
          error: error.error?.error || 'Error al crear cliente'
        });
      })
    );
  }

  /**
   * Actualiza un cliente existente
   */
  actualizarCliente(cedula: number, cliente: Cliente): Observable<ClienteResponse> {
    return this.http.put<ClienteResponse>(`${this.apiUrl}/${cedula}`, cliente).pipe(
      tap(response => {
        if (response.success) {
          this.cargarClientes().subscribe();
        }
      }),
      catchError(error => {
        console.error('Error al actualizar cliente:', error);
        return of({
          success: false,
          error: error.error?.error || 'Error al actualizar cliente'
        });
      })
    );
  }

  /**
   * Elimina un cliente por cédula
   */
  eliminarCliente(cedula: number): Observable<ClienteResponse> {
    return this.http.delete<ClienteResponse>(`${this.apiUrl}/${cedula}`).pipe(
      tap(response => {
        if (response.success) {
          this.cargarClientes().subscribe();
        }
      }),
      catchError(error => {
        console.error('Error al eliminar cliente:', error);
        return of({
          success: false,
          error: error.error?.error || 'Error al eliminar cliente'
        });
      })
    );
  }

  /**
   * Validaciones básicas en el lado del cliente
   */
  validarCliente(cliente: Cliente): { valido: boolean; error?: string } {
    if (!cliente.cedula_cliente) {
      return { valido: false, error: 'La cédula es requerida' };
    }
    if (!cliente.nombre_cliente || cliente.nombre_cliente.trim() === '') {
      return { valido: false, error: 'El nombre es requerido' };
    }
    if (!cliente.email_cliente || cliente.email_cliente.trim() === '') {
      return { valido: false, error: 'El correo electrónico es requerido' };
    }
    // formato de email simple
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cliente.email_cliente)) {
      return { valido: false, error: 'El correo electrónico no es válido' };
    }

    return { valido: true };
  }
}
