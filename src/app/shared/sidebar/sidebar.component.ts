import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent {
  @Input() isOpen: boolean = true;

  menuItems = [
    { label: 'Usuarios', path: '/usuarios', icon: '👥' },
    { label: 'Clientes', path: '/clientes', icon: '🧑‍💼' },
    { label: 'Proveedores', path: '/proveedores', icon: '🏢' },
    { label: 'Productos', path: '/productos', icon: '📦' },
    { label: 'Ventas', path: '/ventas', icon: '💰' },
    { label: 'Reportes', path: '/reportes', icon: '📊' }
  ];
}
