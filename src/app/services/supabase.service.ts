import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { BehaviorSubject } from 'rxjs';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;
  private _session = new BehaviorSubject<any>(null);

  constructor(private router: Router) {
    this.supabase = createClient(
      environment.supabaseUrl,
      environment.supabaseKey,
      {
        auth: {
          storage: window.localStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce'
        }
      }
    );

    // Carregar sessão do localStorage
    this.loadSession();

    // Monitorar mudanças na autenticação
    this.supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event, session);
      this._session.next(session);

      if (event === 'SIGNED_IN') {
        console.log('Usuário logado');
      } else if (event === 'SIGNED_OUT') {
        console.log('Usuário deslogado');
        this.router.navigate(['/login']);
      }
    });
  }

  private async loadSession() {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      console.log('Sessão carregada:', session);
      this._session.next(session);
      
      // Remove auto-redirect to login
      if (!session && window.location.pathname.includes('/admin')) {
        console.log('Redirecionando para login...');
        this.router.navigate(['/login']);
      }
    } catch (error) {
      console.error('Erro ao carregar sessão:', error);
      this._session.next(null);
    }
  }

  getClient(): SupabaseClient {
    return this.supabase;
  }

  async signIn(email: string, password: string) {
    try {
      console.log('Tentando login com:', email);
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) {
        console.error('Erro no login Supabase:', error);
        throw error;
      }

      if (data.session) {
        console.log('Login bem sucedido:', data.user?.email);
        this._session.next(data.session);
        window.localStorage.setItem('supabase.auth.token', data.session.access_token);
      }

      return { data, error: null };
    } catch (error) {
      console.error('Erro no processo de login:', error);
      return { data: null, error };
    }
  }

  async signOut() {
    const { error } = await this.supabase.auth.signOut();
    if (error) {
      console.error('Erro ao fazer logout:', error);
    }
    this._session.next(null);
    window.localStorage.removeItem('supabase.auth.token');
    return { error };
  }

  async getCurrentUser() {
    return await this.supabase.auth.getUser();
  }

  async signUp(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });
    
    if (error) console.error('Erro signup:', error);
    return { data, error };
  }

  get session() {
    return this._session.asObservable();
  }

  async refreshSession() {
    const { data: { session }, error } = await this.supabase.auth.getSession();
    if (error) {
      console.error('Erro ao atualizar sessão:', error);
      return null;
    }
    this._session.next(session);
    return session;
  }
}