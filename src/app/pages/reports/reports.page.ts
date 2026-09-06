import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { documentTextOutline, downloadOutline, refreshOutline } from 'ionicons/icons';
import { ApiService } from '../../core/api.service';
import { apiErrorMessage } from '../../core/auth.interceptor';
import { Category, ReportRow, ReportSummary } from '../../core/models';

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function firstOfMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  templateUrl: './reports.page.html',
  styleUrls: ['./reports.page.scss'],
})
export class ReportsPage implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastController);

  readonly report = signal<ReportSummary | null>(null);
  readonly categories = signal<Category[]>([]);
  readonly loading = signal(true);
  readonly exporting = signal(false);
  readonly expanded = signal<string | null>(null);

  from = firstOfMonth();
  to = todayIso();
  categoryFilter: number | null = null;

  constructor() {
    addIcons({ documentTextOutline, downloadOutline, refreshOutline });
  }

  ngOnInit(): void {
    void this.load();
    void this.api.categories().then((c) => this.categories.set(c)).catch(() => undefined);
  }

  async load(event?: CustomEvent): Promise<void> {
    this.loading.set(true);
    try {
      this.report.set(
        await this.api.reportSummary({ from: this.from, to: this.to, category_id: this.categoryFilter }),
      );
    } catch (error) {
      await this.notify(apiErrorMessage(error, 'Não foi possível gerar o relatório'), 'danger');
    } finally {
      this.loading.set(false);
      (event?.target as HTMLIonRefresherElement | undefined)?.complete();
    }
  }

  setMonth(offset: number): void {
    const now = new Date();
    const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const last = new Date(target.getFullYear(), target.getMonth() + 1, 0);
    const pad = (n: number) => String(n).padStart(2, '0');

    this.from = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-01`;
    // No mês corrente o relatório termina hoje, não no fim do mês.
    this.to = offset === 0 ? todayIso() : `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`;
    void this.load();
  }

  toggle(memberId: string): void {
    this.expanded.set(this.expanded() === memberId ? null : memberId);
  }

  async exportCsv(): Promise<void> {
    this.exporting.set(true);
    try {
      const blob = await this.api.exportReport({
        from: this.from,
        to: this.to,
        category_id: this.categoryFilter,
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `presencas_${this.from}_${this.to}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      await this.notify(apiErrorMessage(error, 'Não foi possível exportar'), 'danger');
    } finally {
      this.exporting.set(false);
    }
  }

  rateColor(rate: number): string {
    if (rate >= 90) return 'success';
    if (rate >= 70) return 'warning';
    return 'danger';
  }

  private async notify(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toast.create({ message, duration: 2600, color });
    await toast.present();
  }

  trackByMember = (_: number, item: ReportRow) => item.member_id;
}
