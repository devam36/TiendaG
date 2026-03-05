import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProductosService, Producto } from '../../shared/services/productos.service';

@Component({
  selector: 'app-productos',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './productos.html',
  styleUrl: './productos.scss'
})
export class ProductosComponent implements OnInit {
  private productosService = inject(ProductosService);

  productos: Producto[] = [];
  isLoading = false;
  mensajeError = '';

  ngOnInit(): void {
    this.cargarProductos();
  }

  cargarProductos(): void {
    this.isLoading = true;
    this.mensajeError = '';

    this.productosService.obtenerProductos().subscribe({
      next: (response) => {
        if (response.success) {
          this.productos = response.data || [];
        } else {
          this.productos = [];
          this.mensajeError = response.message || 'No fue posible cargar productos';
        }
        this.isLoading = false;
      },
      error: () => {
        this.productos = [];
        this.mensajeError = 'No fue posible cargar productos';
        this.isLoading = false;
      }
    });
  }

  trackByCodigo(index: number, producto: Producto): string {
    return producto.codigo_producto;
  }
}
