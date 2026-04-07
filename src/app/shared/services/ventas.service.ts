import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

export interface VentaDetallePayload {
  codigo_producto: string;
  cantidad: number;
}

export interface RegistrarVentaPayload {
  cedula_cliente: number;
  cedula_usuario: number;
  detalles: VentaDetallePayload[];
}

export interface VentaRegistrada {
  codigo_venta: number;
  cedula_cliente: number;
  cedula_usuario: number;
  valor_total_venta: number;
  valor_iva: number;
  valor_total_con_iva: number;
}

export interface RegistrarVentaResponse {
  success: boolean;
  message?: string;
  error?: string;
  data?: {
    venta: VentaRegistrada;
    detalles: Array<{
      codigo_producto: string;
      cantidad: number;
      valor_unitario: number;
      valor_total: number;
      porcentaje_iva: number;
      valor_iva: number;
    }>;
  };
}

@Injectable({
  providedIn: 'root'
})
export class VentasService {
  private readonly apiUrl = '/api/ventas';

  constructor(private http: HttpClient) {}

  registrarVenta(payload: RegistrarVentaPayload): Observable<RegistrarVentaResponse> {
    return this.http.post<RegistrarVentaResponse>(this.apiUrl, payload).pipe(
      catchError((error) => {
        console.error('Error registrando venta:', error);
        return of({
          success: false,
          error: error?.error?.error || error?.error?.message || 'No se pudo registrar la venta'
        });
      })
    );
  }
}
