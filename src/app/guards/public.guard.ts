import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class PublicGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate() {
    return this.authService.isAuthenticated().pipe(
      take(1),
      map(isAuth => {
        if (isAuth) {
          // Se já estiver autenticado, redireciona para página principal
          this.router.navigate(['/admin/employee']);
          return false;
        }
        return true;
      })
    );
  }
}
