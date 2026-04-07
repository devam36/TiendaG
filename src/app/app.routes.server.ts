import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: '',
    renderMode: RenderMode.Prerender
  },
  {
    path: 'login',
    renderMode: RenderMode.Prerender
  },
  {
    path: 'home',
    renderMode: RenderMode.Prerender
  },
  {
    path: 'usuarios',
    renderMode: RenderMode.Client
  },
  {
    path: 'clientes',
    renderMode: RenderMode.Client
  },
  {
    path: 'proveedores',
    renderMode: RenderMode.Client
  },
  {
    path: 'productos',
    renderMode: RenderMode.Client
  },
  {
    path: 'ventas',
    renderMode: RenderMode.Client
  },
  {
    path: 'reportes',
    renderMode: RenderMode.Client
  },
  {
    path: '**',
    renderMode: RenderMode.Client
  }
];
