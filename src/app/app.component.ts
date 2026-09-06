import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  barChartOutline, calendarNumberOutline, documentTextOutline, gridOutline,
  logOutOutline, peopleOutline, personCircleOutline, qrCodeOutline, settingsOutline,
} from 'ionicons/icons';
import { AuthService } from './core/auth.service';

interface MenuLink {
  title: string;
  url: string;
  icon: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterModule, IonicModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  readonly auth = inject(AuthService);

  /** O menu mostra apenas o que o perfil da sessão pode abrir. */
  readonly links = computed<MenuLink[]>(() => {
    const role = this.auth.role();
    if (!role) return [];

    const scan: MenuLink = { title: 'Ler QR Code', url: '/scan', icon: 'qr-code-outline' };
    if (role === 'operador') return [scan];

    const shared: MenuLink[] = [
      { title: 'Painel', url: '/dashboard', icon: 'grid-outline' },
      scan,
      { title: 'Pessoas registadas', url: '/membros', icon: 'people-outline' },
      { title: 'Registos de ponto', url: '/registos', icon: 'calendar-number-outline' },
      { title: 'Relatórios', url: '/relatorios', icon: 'bar-chart-outline' },
    ];

    return role === 'admin'
      ? [
          ...shared,
          { title: 'Contas de acesso', url: '/utilizadores', icon: 'person-circle-outline' },
          { title: 'Configurações', url: '/configuracoes', icon: 'settings-outline' },
        ]
      : shared;
  });

  readonly roleLabel = computed(() => {
    switch (this.auth.role()) {
      case 'admin': return 'Administrador';
      case 'gestor': return 'Gestor';
      case 'operador': return 'Operador';
      default: return '';
    }
  });

  constructor() {
    addIcons({
      barChartOutline, calendarNumberOutline, documentTextOutline, gridOutline,
      logOutOutline, peopleOutline, personCircleOutline, qrCodeOutline, settingsOutline,
    });
  }

  logout(): void {
    this.auth.logout();
  }
}
