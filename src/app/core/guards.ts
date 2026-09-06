import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Role } from './models';

/** Exige sessão iniciada; tenta restaurar a guardada antes de recusar. */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated() || (await auth.restoreSession())) return true;
  return router.createUrlTree(['/login']);
};

/** Exige sessão iniciada com um dos perfis indicados. */
export function roleGuard(...roles: Role[]): CanActivateFn {
  return async () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.isAuthenticated() && !(await auth.restoreSession())) {
      return router.createUrlTree(['/login']);
    }
    // Sem permissão: devolve o utilizador ao ecrã inicial do seu perfil.
    return roles.includes(auth.role()!) ? true : router.createUrlTree([auth.homeRoute()]);
  };
}

/** Impede que uma sessão activa volte ao ecrã de login. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated() ? router.createUrlTree([auth.homeRoute()]) : true;
};
