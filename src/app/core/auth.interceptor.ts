import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Junta o token JWT a cada pedido e termina a sessão quando a API o rejeita. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token;

  const request = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      // 401 significa token inválido/expirado. 403 é falta de permissão numa
      // sessão válida — nesse caso a sessão mantém-se.
      if (error.status === 401 && !req.url.endsWith('/auth/login')) {
        auth.clear();
        router.navigateByUrl('/login', { replaceUrl: true });
      }
      return throwError(() => error);
    }),
  );
};

/** Mensagem legível a partir de um erro devolvido pela API. */
export function apiErrorMessage(error: unknown, fallback = 'Ocorreu um erro inesperado'): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) return 'Sem ligação à API. Verifique se o servidor está a correr.';
    const body = error.error;
    if (body?.details?.length) {
      return body.details.map((d: { campo: string; erro: string }) => `${d.campo}: ${d.erro}`).join('; ');
    }
    if (body?.error) return body.error;
  }
  return fallback;
}
