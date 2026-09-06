import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { Role, User } from './models';

const TOKEN_KEY = 'ponto.token';
const USER_KEY = 'ponto.user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  /** Utilizador autenticado, restaurado do armazenamento local ao arrancar. */
  readonly user = signal<User | null>(readStoredUser());
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly role = computed<Role | null>(() => this.user()?.role ?? null);
  readonly isAdmin = computed(() => this.role() === 'admin');
  /** Admin e gestor consultam relatórios; o operador apenas regista pontos. */
  readonly canViewReports = computed(() => this.role() === 'admin' || this.role() === 'gestor');
  readonly canScan = computed(() => this.isAuthenticated());

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  async login(email: string, password: string): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<{ token: string; user: User }>(`${environment.apiUrl}/auth/login`, { email, password }),
    );
    localStorage.setItem(TOKEN_KEY, response.token);
    localStorage.setItem(USER_KEY, JSON.stringify(response.user));
    this.user.set(response.user);
  }

  /**
   * Confirma junto da API que a sessão guardada continua válida.
   * Um token expirado ou uma conta desactivada terminam a sessão.
   */
  async restoreSession(): Promise<boolean> {
    if (!this.token) return false;
    try {
      const { user } = await firstValueFrom(
        this.http.get<{ user: User }>(`${environment.apiUrl}/auth/me`),
      );
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      this.user.set(user);
      return true;
    } catch {
      this.clear();
      return false;
    }
  }

  changePassword(current_password: string, new_password: string) {
    return firstValueFrom(
      this.http.post<{ message: string }>(`${environment.apiUrl}/auth/change-password`, {
        current_password,
        new_password,
      }),
    );
  }

  logout(): void {
    this.clear();
    this.router.navigateByUrl('/login', { replaceUrl: true });
  }

  clear(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.user.set(null);
  }

  /** Ecrã inicial de cada perfil: o operador vai direito ao leitor de QR Code. */
  homeRoute(): string {
    return this.role() === 'operador' ? '/scan' : '/dashboard';
  }
}

function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}
