import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { retry } from 'rxjs/operators';

export interface Usuario {
  cedula_usuario: number;
  nombre_usuario: string;
  email_usuario: string;
  usuario: string;
}

export interface UsuarioPayload {
  cedula_usuario: number;
  nombre_usuario: string;
  email_usuario: string;
  usuario: string;
  password?: string;
}

export interface UsuarioResponse {
  success: boolean;
  message?: string;
  error?: string;
  user?: Usuario;
  data?: Usuario;
}

export interface ListaUsuariosResponse {
  success: boolean;
  message?: string;
  error?: string;
  data?: Usuario[];
}

@Injectable({
  providedIn: 'root'
})
export class UsuariosService {
  private readonly apiUrl = '/api/usuarios';
  private usuariosActualizados = new BehaviorSubject<Usuario[]>([]);
  
  usuariosActualizados$ = this.usuariosActualizados.asObservable();

  constructor(private http: HttpClient) {
    // No cargar usuarios automáticamente para evitar problemas de ciclo de vida
  }

  /**
   * Cargar todos los usuarios
   */
  cargarUsuarios(): Observable<ListaUsuariosResponse> {
    return this.http.get<ListaUsuariosResponse>(this.apiUrl).pipe(
      retry({ count: 2, delay: 700 }),
      tap(response => {
        if (response.success && response.data) {
          this.usuariosActualizados.next(response.data);
        }
      }),
      catchError(error => {
        console.error('Error al cargar usuarios:', error);
        return of({
          success: false,
          error: error.error?.error || 'Error al cargar usuarios'
        });
      })
    );
  }

  /**
   * Obtener usuario por cédula
   */
  obtenerPorCedula(cedula: number): Observable<UsuarioResponse> {
    return this.http.get<UsuarioResponse>(`${this.apiUrl}/cedula/${cedula}`).pipe(
      catchError(error => {
        console.error('Error al obtener usuario:', error);
        return of({
          success: false,
          error: error.error?.error || 'Usuario no encontrado'
        });
      })
    );
  }

  /**
   * Crear nuevo usuario
   */
  crearUsuario(usuario: UsuarioPayload): Observable<UsuarioResponse> {
    return this.http.post<UsuarioResponse>(this.apiUrl, usuario).pipe(
      tap(response => {
        if (response.success && response.data) {
          const actual = this.usuariosActualizados.getValue();
          this.usuariosActualizados.next(this.ordenarPorCedula([...actual, response.data]));
        }
      }),
      catchError(error => {
        console.error('Error al crear usuario:', error);
        return of({
          success: false,
          error: error.error?.error || 'Error al crear usuario'
        });
      })
    );
  }

  /**
   * Actualizar usuario existente
   */
  actualizarUsuario(cedula: number, usuario: UsuarioPayload): Observable<UsuarioResponse> {
    return this.http.put<UsuarioResponse>(`${this.apiUrl}/${cedula}`, usuario).pipe(
      tap(response => {
        if (response.success && response.data) {
          const actual = this.usuariosActualizados.getValue();
          const actualizados = actual.map(item =>
            item.cedula_usuario === cedula ? response.data as Usuario : item
          );
          this.usuariosActualizados.next(this.ordenarPorCedula(actualizados));
        }
      }),
      catchError(error => {
        console.error('Error al actualizar usuario:', error);
        return of({
          success: false,
          error: error.error?.error || 'Error al actualizar usuario'
        });
      })
    );
  }

  /**
   * Eliminar usuario por cédula
   */
  eliminarUsuario(cedula: number): Observable<UsuarioResponse> {
    return this.http.delete<UsuarioResponse>(`${this.apiUrl}/${cedula}`).pipe(
      tap(response => {
        if (response.success) {
          const actual = this.usuariosActualizados.getValue();
          this.usuariosActualizados.next(actual.filter(item => item.cedula_usuario !== cedula));
        }
      }),
      catchError(error => {
        console.error('Error al eliminar usuario:', error);
        return of({
          success: false,
          error: error.error?.error || 'Error al eliminar usuario'
        });
      })
    );
  }

  /**
   * Validar que todos los campos requeridos estén completos
   */
  validarUsuario(usuario: UsuarioPayload, requierePassword: boolean = true): { valido: boolean; error?: string } {
    if (!usuario.cedula_usuario) {
      return { valido: false, error: 'La cédula es requerida' };
    }
    if (!usuario.nombre_usuario || usuario.nombre_usuario.trim() === '') {
      return { valido: false, error: 'El nombre completo es requerido' };
    }
    if (!usuario.email_usuario || usuario.email_usuario.trim() === '') {
      return { valido: false, error: 'El correo electrónico es requerido' };
    }
    if (!usuario.usuario || usuario.usuario.trim() === '') {
      return { valido: false, error: 'El usuario (rol) es requerido' };
    }
    if (requierePassword && (!usuario.password || usuario.password.trim() === '')) {
      return { valido: false, error: 'La contraseña es requerida' };
    }

    // Validaciones adicionales
    if (usuario.cedula_usuario < 0) {
      return { valido: false, error: 'La cédula debe ser un número positivo' };
    }

    // Validar email básico
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(usuario.email_usuario)) {
      return { valido: false, error: 'El correo electrónico no es válido' };
    }

    return { valido: true };
  }

  private ordenarPorCedula(usuarios: Usuario[]): Usuario[] {
    return [...usuarios].sort((a, b) => a.cedula_usuario - b.cedula_usuario);
  }
}
