import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class LoginComponent {
  usuario: string = '';
  contrasena: string = '';

  aceptar() {
    if (this.usuario.trim() && this.contrasena.trim()) {
      console.log('Iniciando sesión con:', {
        usuario: this.usuario,
        contrasena: '***'
      });
      // Aquí iría la lógica de autenticación
      alert(`Bienvenido ${this.usuario}!`);
    } else {
      alert('Por favor completa todos los campos');
    }
  }

  cancelar() {
    this.usuario = '';
    this.contrasena = '';
    console.log('Inicio de sesión cancelado');
  }
}
