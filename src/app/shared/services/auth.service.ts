import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

export interface Usuario {
  cedula_usuario: number;
  // la propiedad "usuario" puede representar un identificador interno
  usuario: string;
  nombre_usuario: string;
  email_usuario: string;
}

export interface LoginResponse {
  success: boolean;
  message?: string;
  error?: string;
  user?: Usuario;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = 'http://localhost:3000/api';
  private usuarioActual = new BehaviorSubject<Usuario | null>(null);
  
  usuarioActual$ = this.usuarioActual.asObservable();

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    // Cargar usuario del localStorage solo en el navegador
    if (isPlatformBrowser(this.platformId)) {
      const usuarioGuardado = localStorage.getItem('usuario');
      if (usuarioGuardado) {
        this.usuarioActual.next(JSON.parse(usuarioGuardado));
      }
    }
  }

  // Cambiamos el parámetro a nombre_usuario para que coincida
  // con la columna de la base de datos.
  login(nombre_usuario: string, contrasena: string): Observable<LoginResponse> {
    console.log('Intentando login:', { nombre_usuario, contrasena });
    
    const payload = {
      nombre_usuario,
      contrasena
    };
    
    console.log('Enviando payload:', payload);
    
    return this.http.post<LoginResponse>(`${this.apiUrl}/login`, payload).pipe(
      tap(response => {
        console.log('Respuesta del servidor:', response);
        if (response.success && response.user) {
          // Guardar usuario en localStorage solo en el navegador
          if (isPlatformBrowser(this.platformId)) {
            localStorage.setItem('usuario', JSON.stringify(response.user));
          }
          this.usuarioActual.next(response.user);
        }
      }),
      catchError((error: any) => {
        console.error('Error en login:', error);
        const detalles = error?.error ?? error?.message ?? String(error);
        console.error('   Detalles del error:', detalles);

        const mensajeUsuario =
          // status 0 o errores tipo TypeError suelen indicar fallo de conexión
          error?.status === 0 || (typeof detalles === 'string' && detalles.includes('Failed to fetch')) || error instanceof TypeError
            ? 'No se pudo conectar al servidor. Verifica que el backend esté ejecutándose en http://localhost:3000'
            : error?.error?.error || 'Error al conectar con el servidor';

        return of({
          success: false,
          error: mensajeUsuario
        });
      })
    );
  }

  logout(): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem('usuario');
    }
    this.usuarioActual.next(null);
  }

  obtenerUsuarioActual(): Usuario | null {
    return this.usuarioActual.value;
  }

  estaAutenticado(): boolean {
    return this.usuarioActual.value !== null;
  }
}
