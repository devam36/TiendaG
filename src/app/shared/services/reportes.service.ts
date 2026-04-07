import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, retry } from 'rxjs/operators';
import { ListaUsuariosResponse } from './usuarios.service';
import { ListaClientesResponse } from './clientes.service';

export interface VentaPorCliente {
  cedula_cliente: number;
  nombre_cliente: string;
  cantidad_ventas: number;
  total_sin_iva: number;
  total_iva: number;
  total_con_iva: number;
}

export interface VentasPorClienteResponse {
  success: boolean;
  message?: string;
  error?: string;
  data?: VentaPorCliente[];
}

@Injectable({
  providedIn: 'root'
})
export class ReportesService {
  private readonly usuariosUrl = '/api/usuarios';
  private readonly clientesUrl = '/api/clientes';
  private readonly ventasPorClienteUrl = '/api/reportes/ventas-por-cliente';

  constructor(private http: HttpClient) {}

  obtenerListadoUsuarios(): Observable<ListaUsuariosResponse> {
    return this.http.get<ListaUsuariosResponse>(this.usuariosUrl).pipe(
      retry({ count: 2, delay: 700 }),
      catchError((error) => {
        console.error('Error al consultar listado de usuarios:', error);
        return of({
          success: false,
          error: error?.error?.error || 'No fue posible consultar usuarios'
        });
      })
    );
  }

  obtenerListadoClientes(): Observable<ListaClientesResponse> {
    return this.http.get<ListaClientesResponse>(this.clientesUrl).pipe(
      retry({ count: 2, delay: 700 }),
      catchError((error) => {
        console.error('Error al consultar listado de clientes:', error);
        return of({
          success: false,
          error: error?.error?.error || 'No fue posible consultar clientes'
        });
      })
    );
  }

  obtenerVentasPorCliente(): Observable<VentasPorClienteResponse> {
    return this.http.get<VentasPorClienteResponse>(this.ventasPorClienteUrl).pipe(
      retry({ count: 2, delay: 700 }),
      catchError((error) => {
        console.error('Error al consultar total de ventas por cliente:', error);
        return of({
          success: false,
          error: error?.error?.error || 'No fue posible consultar total de ventas por cliente'
        });
      })
    );
  }
}
