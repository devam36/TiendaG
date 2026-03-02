import { Routes } from '@angular/router';
import { IndexComponent } from './pages/index/index';
import { LoginComponent } from './pages/login/login';
import { MainLayoutComponent } from './layouts/main-layout/main-layout.component';
import { HomeComponent } from './pages/home/home';
import { UsuariosComponent } from './pages/usuarios/usuarios';
import { ClientesComponent } from './pages/clientes/clientes';
import { ProveedoresComponent } from './pages/proveedores/proveedores';
import { ProductosComponent } from './pages/productos/productos';
import { VentasComponent } from './pages/ventas/ventas';
import { ReportesComponent } from './pages/reportes/reportes';

export const routes: Routes = [
  // Rutas sin layout (index y login)
  { path: '', component: IndexComponent },
  { path: 'login', component: LoginComponent },

  // Rutas con MainLayout (con sidebar)
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      { path: 'home', component: HomeComponent },
      { path: 'usuarios', component: UsuariosComponent },
      { path: 'clientes', component: ClientesComponent },
      { path: 'proveedores', component: ProveedoresComponent },
      { path: 'productos', component: ProductosComponent },
      { path: 'ventas', component: VentasComponent },
      { path: 'reportes', component: ReportesComponent }
    ]
  }
];
