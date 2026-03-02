import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule], 
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class LoginComponent {
  nombre_usuario: string = '';
  contrasena: string = '';
  isLoading: boolean = false;
  errorMessage: string = '';

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  aceptar() {
    if (this.nombre_usuario.trim() && this.contrasena.trim()) {
      this.isLoading = true;
      this.errorMessage = '';
      
      this.authService.login(this.nombre_usuario, this.contrasena).subscribe({
        next: (response) => {
          this.isLoading = false;
          if (response.success) {
            console.log('Login exitoso:', response.user);
            alert(`¡Bienvenido ${response.user?.nombre_usuario}!`);
            // Redirigir al home o dashboard
            this.router.navigate(['/home']);
          } else {
            this.errorMessage = response.error || 'Error en login';
            alert(this.errorMessage);
          }
        },
        error: (error) => {
          this.isLoading = false;
          this.errorMessage = 'Error al conectar con el servidor';
          console.error('Error en login:', error);
          alert(this.errorMessage);
        }
      });
    } else {
      alert('Por favor completa todos los campos');
    }
  }

  cancelar() {
    this.nombre_usuario = '';
    this.contrasena = '';
    this.errorMessage = '';
    console.log('Inicio de sesión cancelado');
  }
}
