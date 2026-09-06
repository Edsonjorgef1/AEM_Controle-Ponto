import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlertController, IonicModule, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, closeOutline, refreshOutline, saveOutline, trashOutline } from 'ionicons/icons';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { apiErrorMessage } from '../../core/auth.interceptor';
import { AttendanceRecord, Category, Member } from '../../core/models';

/** "YYYY-MM-DD" na hora local — evita o desvio do toISOString() em UTC. */
function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function today(): string {
  return isoDate(new Date());
}

@Component({
  selector: 'app-attendance',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  templateUrl: './attendance.page.html',
  styleUrls: ['./attendance.page.scss'],
})
export class AttendancePage implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastController);
  private alerts = inject(AlertController);
  readonly auth = inject(AuthService);

  readonly records = signal<AttendanceRecord[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly members = signal<Member[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);

  from = today();
  to = today();
  categoryFilter: number | null = null;

  readonly manualOpen = signal(false);
  manual = {
    member_id: '',
    work_date: today(),
    check_in: '',
    check_out: '',
    status: 'No horário' as AttendanceRecord['status'],
    notes: '',
  };

  readonly statuses: AttendanceRecord['status'][] = ['No horário', 'Atrasado', 'Ausente', 'Justificado'];

  constructor() {
    addIcons({ addOutline, closeOutline, refreshOutline, saveOutline, trashOutline });
  }

  ngOnInit(): void {
    void this.load();
    void this.loadReferences();
  }

  private async loadReferences(): Promise<void> {
    try {
      const [categories, members] = await Promise.all([this.api.categories(), this.api.members({ active: true })]);
      this.categories.set(categories);
      this.members.set(members.items);
    } catch (error) {
      console.error('[registos] falha a carregar dados de apoio:', error);
    }
  }

  async load(event?: CustomEvent): Promise<void> {
    this.loading.set(true);
    try {
      const page = await this.api.attendance({
        from: this.from,
        to: this.to,
        category_id: this.categoryFilter,
      });
      this.records.set(page.items);
    } catch (error) {
      await this.notify(apiErrorMessage(error, 'Não foi possível carregar os registos'), 'danger');
    } finally {
      this.loading.set(false);
      (event?.target as HTMLIonRefresherElement | undefined)?.complete();
    }
  }

  /** Atalhos de período usados no dia-a-dia. */
  setRange(range: 'hoje' | 'semana' | 'mes'): void {
    const now = new Date();
    if (range === 'hoje') {
      this.from = this.to = today();
    } else if (range === 'semana') {
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      this.from = isoDate(monday);
      this.to = today();
    } else {
      this.from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      this.to = today();
    }
    void this.load();
  }

  openManual(): void {
    this.manual = {
      member_id: '', work_date: today(), check_in: '',
      check_out: '', status: 'No horário', notes: '',
    };
    this.manualOpen.set(true);
  }

  async saveManual(): Promise<void> {
    if (!this.manual.member_id) {
      await this.notify('Escolha a pessoa', 'danger');
      return;
    }

    this.saving.set(true);
    try {
      await this.api.manualAttendance({
        member_id: this.manual.member_id,
        work_date: this.manual.work_date,
        check_in: this.manual.check_in || null,
        check_out: this.manual.check_out || null,
        status: this.manual.status,
        notes: this.manual.notes.trim() || null,
      });
      await this.notify('Registo guardado', 'success');
      this.manualOpen.set(false);
      await this.load();
    } catch (error) {
      await this.notify(apiErrorMessage(error, 'Não foi possível guardar o registo'), 'danger');
    } finally {
      this.saving.set(false);
    }
  }

  async confirmDelete(record: AttendanceRecord): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Eliminar registo',
      message: `Eliminar o registo de ${record.full_name} em ${record.work_date}?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: () => {
            void this.remove(record);
          },
        },
      ],
    });
    await alert.present();
  }

  private async remove(record: AttendanceRecord): Promise<void> {
    try {
      await this.api.deleteAttendance(record.id);
      await this.notify('Registo eliminado', 'success');
      await this.load();
    } catch (error) {
      await this.notify(apiErrorMessage(error, 'Não foi possível eliminar'), 'danger');
    }
  }

  statusColor(status: AttendanceRecord['status']): string {
    switch (status) {
      case 'No horário': return 'success';
      case 'Atrasado': return 'warning';
      case 'Justificado': return 'tertiary';
      default: return 'danger';
    }
  }

  private async notify(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toast.create({ message, duration: 2600, color });
    await toast.present();
  }

  trackById = (_: number, item: AttendanceRecord) => item.id;
}
