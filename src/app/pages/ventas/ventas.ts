import { Component, NgZone, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { finalize, takeUntil, timeout } from 'rxjs/operators';
import { ClientesService, Cliente } from '../../shared/services/clientes.service';
import { ProductosService, Producto } from '../../shared/services/productos.service';
import { VentasService } from '../../shared/services/ventas.service';
import { AuthService } from '../../shared/services/auth.service';

interface ItemVenta {
  codigo_producto: string;
  nombre_producto: string;
  cantidad: number;
  valor_unitario: number;
  porcentaje_iva: number;
  valor_total: number;
  valor_iva: number;
  valor_total_con_iva: number;
}

@Component({
  selector: 'app-ventas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ventas.html',
  styleUrl: './ventas.scss'
})
export class VentasComponent implements OnDestroy {
  private destroy$ = new Subject<void>();
  private busquedaClienteTimeout: ReturnType<typeof setTimeout> | null = null;
  private busquedaProductoTimeout: ReturnType<typeof setTimeout> | null = null;
  private busquedaClienteSub: Subscription | null = null;
  private busquedaProductoSub: Subscription | null = null;
  private busquedaClienteRequestId = 0;
  private busquedaProductoRequestId = 0;

  cedulaClienteBusqueda = '';
  cedulaUsuario = '';
  codigoProductoBusqueda = '';
  cantidadProducto = 1;

  cliente = signal<Cliente | null>(null);
  producto = signal<Producto | null>(null);
  itemsVenta = signal<ItemVenta[]>([]);

  isBuscandoCliente = signal(false);
  isBuscandoProducto = signal(false);
  isGuardandoVenta = signal(false);

  mensaje = signal<{ tipo: 'exito' | 'error' | ''; texto: string }>({ tipo: '', texto: '' });

  constructor(
    private clientesService: ClientesService,
    private productosService: ProductosService,
    private ventasService: VentasService,
    private authService: AuthService,
    private zone: NgZone
  ) {
    const usuario = this.authService.obtenerUsuarioActual();
    if (usuario?.cedula_usuario) {
      this.cedulaUsuario = String(usuario.cedula_usuario);
    }
  }

  ngOnDestroy(): void {
    if (this.busquedaClienteTimeout) {
      clearTimeout(this.busquedaClienteTimeout);
      this.busquedaClienteTimeout = null;
    }
    if (this.busquedaProductoTimeout) {
      clearTimeout(this.busquedaProductoTimeout);
      this.busquedaProductoTimeout = null;
    }

    if (this.busquedaClienteSub) {
      this.busquedaClienteSub.unsubscribe();
      this.busquedaClienteSub = null;
    }
    if (this.busquedaProductoSub) {
      this.busquedaProductoSub.unsubscribe();
      this.busquedaProductoSub = null;
    }

    this.destroy$.next();
    this.destroy$.complete();
  }

  get subtotalVenta(): number {
    return this.itemsVenta().reduce((acc, item) => acc + item.valor_total, 0);
  }

  get totalIvaVenta(): number {
    return this.itemsVenta().reduce((acc, item) => acc + item.valor_iva, 0);
  }

  get totalConIvaVenta(): number {
    return this.itemsVenta().reduce((acc, item) => acc + item.valor_total_con_iva, 0);
  }

  buscarCliente(): void {
    const cedula = this.cedulaClienteBusqueda.trim();
    if (!/^\d+$/.test(cedula)) {
      this.mostrarMensaje('Ingrese una cédula de cliente válida', 'error');
      return;
    }

    if (this.busquedaClienteSub) {
      this.busquedaClienteSub.unsubscribe();
      this.busquedaClienteSub = null;
    }

    const requestId = ++this.busquedaClienteRequestId;
    this.isBuscandoCliente.set(true);

    if (this.busquedaClienteTimeout) {
      clearTimeout(this.busquedaClienteTimeout);
    }
    this.busquedaClienteTimeout = setTimeout(() => {
      this.zone.run(() => {
        if (this.isBuscandoCliente() && requestId === this.busquedaClienteRequestId) {
          this.isBuscandoCliente.set(false);
          this.mostrarMensaje('La búsqueda de cliente tardó demasiado. Intente nuevamente.', 'error');
        }
        this.busquedaClienteTimeout = null;
      });
    }, 12000);

    this.busquedaClienteSub = this.clientesService.obtenerPorCedula(Number(cedula))
      .pipe(
        takeUntil(this.destroy$),
        timeout(10000),
        finalize(() => {
          this.zone.run(() => {
            this.liberarBusquedaCliente(requestId);
          });
        })
      )
      .subscribe({
        next: (resp) => {
          this.zone.run(() => {
            this.liberarBusquedaCliente(requestId);
            if (resp.success && resp.data) {
              this.cliente.set(resp.data);
              this.mostrarMensaje('Cliente encontrado', 'exito');
            } else {
              this.cliente.set(null);
              this.mostrarMensaje(resp.error || 'Cliente no encontrado', 'error');
            }
          });
        },
        error: () => {
          this.zone.run(() => {
            this.liberarBusquedaCliente(requestId);
            this.cliente.set(null);
            this.mostrarMensaje('La búsqueda de cliente tardó demasiado o falló la conexión', 'error');
          });
        }
      });
  }

  buscarProducto(): void {
    const codigo = this.codigoProductoBusqueda.trim();
    if (!/^\d+$/.test(codigo)) {
      this.mostrarMensaje('Ingrese un código de producto válido', 'error');
      return;
    }

    if (this.busquedaProductoSub) {
      this.busquedaProductoSub.unsubscribe();
      this.busquedaProductoSub = null;
    }

    const requestId = ++this.busquedaProductoRequestId;
    this.isBuscandoProducto.set(true);

    if (this.busquedaProductoTimeout) {
      clearTimeout(this.busquedaProductoTimeout);
    }
    this.busquedaProductoTimeout = setTimeout(() => {
      this.zone.run(() => {
        if (this.isBuscandoProducto() && requestId === this.busquedaProductoRequestId) {
          this.isBuscandoProducto.set(false);
          this.mostrarMensaje('La búsqueda de producto tardó demasiado. Intente nuevamente.', 'error');
        }
        this.busquedaProductoTimeout = null;
      });
    }, 12000);

    this.busquedaProductoSub = this.productosService.obtenerPorCodigo(codigo)
      .pipe(
        takeUntil(this.destroy$),
        timeout(10000),
        finalize(() => {
          this.zone.run(() => {
            this.liberarBusquedaProducto(requestId);
          });
        })
      )
      .subscribe({
        next: (resp) => {
          this.zone.run(() => {
            this.liberarBusquedaProducto(requestId);
            if (resp.success && resp.data) {
              this.producto.set(resp.data);
              this.mostrarMensaje('Producto encontrado', 'exito');
            } else {
              this.producto.set(null);
              this.mostrarMensaje(resp.error || resp.message || 'Producto no encontrado', 'error');
            }
          });
        },
        error: () => {
          this.zone.run(() => {
            this.liberarBusquedaProducto(requestId);
            this.producto.set(null);
            this.mostrarMensaje('La búsqueda de producto tardó demasiado o falló la conexión', 'error');
          });
        }
      });
  }

  agregarProducto(): void {
    const productoActual = this.producto();
    if (!productoActual) {
      this.mostrarMensaje('Primero busque un producto válido', 'error');
      return;
    }

    const cantidad = Number(this.cantidadProducto);
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      this.mostrarMensaje('La cantidad debe ser un entero positivo', 'error');
      return;
    }

    const existente = this.itemsVenta().find((item) => item.codigo_producto === productoActual.codigo_producto);

    if (!existente && this.itemsVenta().length >= 3) {
      this.mostrarMensaje('Solo se permiten tres productos por venta', 'error');
      return;
    }

    const valorUnitario = Number(productoActual.precio_venta);
    const porcentajeIva = Number(productoActual.ivacompra);

    if (existente) {
      const nuevaCantidad = existente.cantidad + cantidad;
      const valorTotal = valorUnitario * nuevaCantidad;
      const valorIva = valorTotal * (porcentajeIva / 100);
      existente.cantidad = nuevaCantidad;
      existente.valor_total = valorTotal;
      existente.valor_iva = valorIva;
      existente.valor_total_con_iva = valorTotal + valorIva;
      this.itemsVenta.set([...this.itemsVenta()]);
    } else {
      const valorTotal = valorUnitario * cantidad;
      const valorIva = valorTotal * (porcentajeIva / 100);

      this.itemsVenta.update((items) => [...items, {
        codigo_producto: productoActual.codigo_producto,
        nombre_producto: productoActual.nombre_producto,
        cantidad,
        valor_unitario: valorUnitario,
        porcentaje_iva: porcentajeIva,
        valor_total: valorTotal,
        valor_iva: valorIva,
        valor_total_con_iva: valorTotal + valorIva
      }]);
    }

    this.codigoProductoBusqueda = '';
    this.cantidadProducto = 1;
    this.producto.set(null);
    this.mostrarMensaje('Producto agregado a la venta', 'exito');
  }

  quitarProducto(codigoProducto: string): void {
    this.itemsVenta.update((items) => items.filter((item) => item.codigo_producto !== codigoProducto));
  }

  registrarVenta(): void {
    const clienteActual = this.cliente();
    if (!clienteActual) {
      this.mostrarMensaje('Debe seleccionar un cliente para registrar la venta', 'error');
      return;
    }

    if (!/^\d+$/.test(this.cedulaUsuario.trim())) {
      this.mostrarMensaje('La cédula del usuario es obligatoria y debe ser numérica', 'error');
      return;
    }

    if (this.itemsVenta().length === 0) {
      this.mostrarMensaje('Debe agregar al menos un producto a la venta', 'error');
      return;
    }

    this.isGuardandoVenta.set(true);

    this.ventasService.registrarVenta({
      cedula_cliente: clienteActual.cedula_cliente,
      cedula_usuario: Number(this.cedulaUsuario),
      detalles: this.itemsVenta().map((item) => ({
        codigo_producto: item.codigo_producto,
        cantidad: item.cantidad
      }))
    })
      .pipe(
        takeUntil(this.destroy$),
        timeout(15000),
        finalize(() => {
          this.isGuardandoVenta.set(false);
        })
      )
      .subscribe({
        next: (resp) => {
          if (resp.success && resp.data?.venta) {
            const codigo = resp.data.venta.codigo_venta;
            this.mostrarMensaje(`Venta registrada correctamente. Código de venta: ${codigo}`, 'exito');
            this.limpiarVenta();
          } else {
            this.mostrarMensaje(resp.error || resp.message || 'No fue posible registrar la venta', 'error');
          }
        },
        error: () => {
          this.mostrarMensaje('La transacción de venta tardó demasiado o falló la conexión', 'error');
        }
      });
  }

  private limpiarVenta(): void {
    this.codigoProductoBusqueda = '';
    this.cantidadProducto = 1;
    this.producto.set(null);
    this.itemsVenta.set([]);
  }

  private liberarBusquedaCliente(requestId?: number): void {
    if (typeof requestId === 'number' && requestId !== this.busquedaClienteRequestId) {
      return;
    }
    this.isBuscandoCliente.set(false);
    if (this.busquedaClienteTimeout) {
      clearTimeout(this.busquedaClienteTimeout);
      this.busquedaClienteTimeout = null;
    }
    this.busquedaClienteSub = null;
  }

  private liberarBusquedaProducto(requestId?: number): void {
    if (typeof requestId === 'number' && requestId !== this.busquedaProductoRequestId) {
      return;
    }
    this.isBuscandoProducto.set(false);
    if (this.busquedaProductoTimeout) {
      clearTimeout(this.busquedaProductoTimeout);
      this.busquedaProductoTimeout = null;
    }
    this.busquedaProductoSub = null;
  }

  private mostrarMensaje(texto: string, tipo: 'exito' | 'error'): void {
    this.mensaje.set({ tipo, texto });
    setTimeout(() => {
      this.zone.run(() => {
        if (this.mensaje().texto === texto) {
          this.mensaje.set({ tipo: '', texto: '' });
        }
      });
    }, 4500);
  }
}
