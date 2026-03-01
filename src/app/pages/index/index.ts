import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-index',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './index.html',
  styleUrl: './index.scss'
})
export class IndexComponent {
  title = 'Gestión Comercial';
  description = 'Sistema de gestión comercial moderno y eficiente';
}
