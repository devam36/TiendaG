import { Component, Inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { isPlatformBrowser } from '@angular/common';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { SidebarComponent } from '../../shared/sidebar/sidebar.component';
import { UsuariosService } from '../../shared/services/usuarios.service';
import { ClientesService } from '../../shared/services/clientes.service';
import { ProveedoresService } from '../../shared/services/proveedores.service';
import { ProductosService } from '../../shared/services/productos.service';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, SidebarComponent],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss'
})
export class MainLayoutComponent implements OnInit {
  isSidebarOpen = signal<boolean>(true);

  constructor(
    @Inject(PLATFORM_ID) private platformId: object,
    private usuariosService: UsuariosService,
    private clientesService: ClientesService,
    private proveedoresService: ProveedoresService,
    private productosService: ProductosService
  ) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.precargarDatosIniciales();
  }

  private precargarDatosIniciales(): void {
    // Dispara carga en segundo plano para que al cambiar de módulo ya exista caché.
    forkJoin([
      this.usuariosService.cargarUsuarios().pipe(catchError(() => of(null))),
      this.clientesService.cargarClientes(50, 0).pipe(catchError(() => of(null))),
      this.proveedoresService.cargarProveedores(false).pipe(catchError(() => of(null))),
      this.productosService.obtenerProductos().pipe(catchError(() => of(null)))
    ]).subscribe();
  }

  toggleSidebar() {
    this.isSidebarOpen.update(value => !value);
  }
}
