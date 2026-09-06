import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { alertCircleOutline, homeOutline, peopleOutline, refreshOutline, timeOutline, walkOutline } from 'ionicons/icons';
import { ApiService } from '../../core/api.service';
import { apiErrorMessage } from '../../core/auth.interceptor';
import { Dashboard } from '../../core/models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, IonicModule],
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
})
export class DashboardPage implements OnInit {
  private api = inject(ApiService);

  readonly data = signal<Dashboard | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    addIcons({ alertCircleOutline, homeOutline, peopleOutline, refreshOutline, timeOutline, walkOutline });
  }

  ngOnInit(): void {
    void this.load();
  }

  async load(event?: CustomEvent): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.data.set(await this.api.dashboard());
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'Não foi possível carregar o painel'));
    } finally {
      this.loading.set(false);
      (event?.target as HTMLIonRefresherElement | undefined)?.complete();
    }
  }

  /** Percentagem de presenças de uma categoria, para a barra de progresso. */
  rate(present: number, total: number): number {
    return total > 0 ? present / total : 0;
  }
}
