import { Component, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, Subscription } from 'rxjs';
import { finalize, takeUntil, timeout } from 'rxjs/operators';
import { Usuario } from '../../shared/services/usuarios.service';
import { Cliente } from '../../shared/services/clientes.service';
import { ReportesService, VentaPorCliente } from '../../shared/services/reportes.service';

@Component({
  selector: 'app-reportes',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './reportes.html',
  styleUrl: './reportes.scss'
})
export class ReportesComponent implements OnDestroy {
  private destroy$ = new Subject<void>();

  private usuariosSub: Subscription | null = null;
  private clientesSub: Subscription | null = null;
  private ventasSub: Subscription | null = null;

  private usuariosReqId = 0;
  private clientesReqId = 0;
  private ventasReqId = 0;

  usuarios = signal<Usuario[]>([]);
  clientes = signal<Cliente[]>([]);
  ventasPorCliente = signal<VentaPorCliente[]>([]);

  loadingUsuarios = signal(false);
  loadingClientes = signal(false);
  loadingVentasPorCliente = signal(false);

  usuariosVisibles = signal(true);
  clientesVisibles = signal(true);
  ventasPorClienteVisibles = signal(true);

  mensaje = signal<{ tipo: 'exito' | 'error' | ''; texto: string }>({ tipo: '', texto: '' });

  constructor(private reportesService: ReportesService) {}

  ngOnDestroy(): void {
    if (this.usuariosSub) {
      this.usuariosSub.unsubscribe();
      this.usuariosSub = null;
    }
    if (this.clientesSub) {
      this.clientesSub.unsubscribe();
      this.clientesSub = null;
    }
    if (this.ventasSub) {
      this.ventasSub.unsubscribe();
      this.ventasSub = null;
    }

    this.destroy$.next();
    this.destroy$.complete();
  }

  consultarUsuarios(): void {
    this.usuariosVisibles.set(true);

    if (this.usuariosSub) {
      this.usuariosSub.unsubscribe();
      this.usuariosSub = null;
    }

    const reqId = ++this.usuariosReqId;
    this.loadingUsuarios.set(true);

    this.usuariosSub = this.reportesService.obtenerListadoUsuarios()
      .pipe(
        takeUntil(this.destroy$),
        timeout(12000),
        finalize(() => {
          if (reqId === this.usuariosReqId) {
            this.loadingUsuarios.set(false);
          }
        })
      )
      .subscribe({
        next: (resp) => {
          if (reqId !== this.usuariosReqId) {
            return;
          }

          if (resp.success && Array.isArray(resp.data)) {
            this.usuarios.set(resp.data);
            this.mostrarMensaje('Listado de usuarios actualizado', 'exito');
          } else {
            this.usuarios.set([]);
            this.mostrarMensaje(resp.error || 'No fue posible consultar usuarios', 'error');
          }
        },
        error: () => {
          if (reqId !== this.usuariosReqId) {
            return;
          }

          this.usuarios.set([]);
          this.mostrarMensaje('La consulta de usuarios tardó demasiado o falló la conexión', 'error');
        }
      });
  }

  consultarClientes(): void {
    this.clientesVisibles.set(true);

    if (this.clientesSub) {
      this.clientesSub.unsubscribe();
      this.clientesSub = null;
    }

    const reqId = ++this.clientesReqId;
    this.loadingClientes.set(true);

    this.clientesSub = this.reportesService.obtenerListadoClientes()
      .pipe(
        takeUntil(this.destroy$),
        timeout(12000),
        finalize(() => {
          if (reqId === this.clientesReqId) {
            this.loadingClientes.set(false);
          }
        })
      )
      .subscribe({
        next: (resp) => {
          if (reqId !== this.clientesReqId) {
            return;
          }

          if (resp.success && Array.isArray(resp.data)) {
            this.clientes.set(resp.data);
            this.mostrarMensaje('Listado de clientes actualizado', 'exito');
          } else {
            this.clientes.set([]);
            this.mostrarMensaje(resp.error || 'No fue posible consultar clientes', 'error');
          }
        },
        error: () => {
          if (reqId !== this.clientesReqId) {
            return;
          }

          this.clientes.set([]);
          this.mostrarMensaje('La consulta de clientes tardó demasiado o falló la conexión', 'error');
        }
      });
  }

  consultarVentasPorCliente(): void {
    this.ventasPorClienteVisibles.set(true);

    if (this.ventasSub) {
      this.ventasSub.unsubscribe();
      this.ventasSub = null;
    }

    const reqId = ++this.ventasReqId;
    this.loadingVentasPorCliente.set(true);

    this.ventasSub = this.reportesService.obtenerVentasPorCliente()
      .pipe(
        takeUntil(this.destroy$),
        timeout(12000),
        finalize(() => {
          if (reqId === this.ventasReqId) {
            this.loadingVentasPorCliente.set(false);
          }
        })
      )
      .subscribe({
        next: (resp) => {
          if (reqId !== this.ventasReqId) {
            return;
          }

          if (resp.success && Array.isArray(resp.data)) {
            this.ventasPorCliente.set(resp.data);
            this.mostrarMensaje('Reporte de ventas por cliente actualizado', 'exito');
          } else {
            this.ventasPorCliente.set([]);
            this.mostrarMensaje(resp.error || 'No fue posible consultar ventas por cliente', 'error');
          }
        },
        error: () => {
          if (reqId !== this.ventasReqId) {
            return;
          }

          this.ventasPorCliente.set([]);
          this.mostrarMensaje('La consulta de ventas por cliente tardó demasiado o falló la conexión', 'error');
        }
      });
  }

  formatearMoneda(valor: number | string): string {
    const numero = Number(valor);
    if (!Number.isFinite(numero)) {
      return '0';
    }

    return numero.toLocaleString('es-CO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  get totalVentasGeneral(): number {
    return this.ventasPorCliente().reduce((acumulado, venta) => {
      const total = Number(venta.total_con_iva);
      return acumulado + (Number.isFinite(total) ? total : 0);
    }, 0);
  }

  toggleUsuariosVisibles(): void {
    this.usuariosVisibles.update((valor) => !valor);
  }

  toggleClientesVisibles(): void {
    this.clientesVisibles.update((valor) => !valor);
  }

  toggleVentasPorClienteVisibles(): void {
    this.ventasPorClienteVisibles.update((valor) => !valor);
  }

  private mostrarMensaje(texto: string, tipo: 'exito' | 'error'): void {
    this.mensaje.set({ tipo, texto });
    setTimeout(() => {
      if (this.mensaje().texto === texto) {
        this.mensaje.set({ tipo: '', texto: '' });
      }
    }, 4000);
  }
}
