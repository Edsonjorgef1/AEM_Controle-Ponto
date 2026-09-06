import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/guards';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
  },
  {
    // Leitura do QR Code: disponível a qualquer sessão, é o ecrã do posto móvel.
    path: 'scan',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/scan/scan.page').then((m) => m.ScanPage),
  },
  {
    path: 'dashboard',
    canActivate: [roleGuard('admin', 'gestor')],
    loadComponent: () => import('./pages/dashboard/dashboard.page').then((m) => m.DashboardPage),
  },
  {
    path: 'membros',
    canActivate: [roleGuard('admin', 'gestor')],
    loadComponent: () => import('./pages/members/members.page').then((m) => m.MembersPage),
  },
  {
    path: 'registos',
    canActivate: [roleGuard('admin', 'gestor')],
    loadComponent: () => import('./pages/attendance/attendance.page').then((m) => m.AttendancePage),
  },
  {
    path: 'relatorios',
    canActivate: [roleGuard('admin', 'gestor')],
    loadComponent: () => import('./pages/reports/reports.page').then((m) => m.ReportsPage),
  },
  {
    path: 'utilizadores',
    canActivate: [roleGuard('admin')],
    loadComponent: () => import('./pages/users/users.page').then((m) => m.UsersPage),
  },
  {
    path: 'configuracoes',
    canActivate: [roleGuard('admin')],
    loadComponent: () => import('./pages/settings/settings.page').then((m) => m.SettingsPage),
  },
  { path: '**', redirectTo: 'login' },
];
