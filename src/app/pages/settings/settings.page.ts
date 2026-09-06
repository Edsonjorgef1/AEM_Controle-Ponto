import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlertController, IonicModule, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, closeOutline, keyOutline, saveOutline, timeOutline, trashOutline } from 'ionicons/icons';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { apiErrorMessage } from '../../core/auth.interceptor';
import { Category, WorkSchedule } from '../../core/models';

const WEEKDAYS = [
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
  { value: 7, label: 'Domingo' },
];

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
})
export class SettingsPage implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastController);
  private alerts = inject(AlertController);
  readonly auth = inject(AuthService);

  readonly weekdays = WEEKDAYS;
  readonly schedules = signal<WorkSchedule[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);

  readonly scheduleOpen = signal(false);
  readonly editingGlobal = signal(false);
  schedule: WorkSchedule = this.emptySchedule();

  readonly categoryOpen = signal(false);
  categoryForm = { name: '', code_prefix: '', description: '', color: 'primary' };

  readonly passwordOpen = signal(false);
  passwordForm = { current: '', next: '', confirm: '' };

  constructor() {
    addIcons({ addOutline, closeOutline, keyOutline, saveOutline, timeOutline, trashOutline });
  }

  ngOnInit(): void {
    void this.load();
  }

  private emptySchedule(): WorkSchedule {
    return {
      category_id: null,
      start_time: '08:00',
      end_time: '16:00',
      tolerance_minutes: 10,
      work_days: [1, 2, 3, 4, 5],
    };
  }

  async load(event?: CustomEvent): Promise<void> {
    this.loading.set(true);
    try {
      const [schedules, categories] = await Promise.all([this.api.schedules(), this.api.categories()]);
      this.schedules.set(schedules);
      this.categories.set(categories);
    } catch (error) {
      await this.notify(apiErrorMessage(error, 'Não foi possível carregar as configurações'), 'danger');
    } finally {
      this.loading.set(false);
      (event?.target as HTMLIonRefresherElement | undefined)?.complete();
    }
  }

  get globalSchedule(): WorkSchedule | undefined {
    return this.schedules().find((s) => s.category_id === null);
  }

  get categorySchedules(): WorkSchedule[] {
    return this.schedules().filter((s) => s.category_id !== null);
  }

  /** Categorias que ainda não têm horário próprio. */
  get categoriesWithoutSchedule(): Category[] {
    const used = new Set(this.categorySchedules.map((s) => s.category_id));
    return this.categories().filter((c) => !used.has(c.id));
  }

  openSchedule(existing?: WorkSchedule, global = false): void {
    this.editingGlobal.set(global);
    this.schedule = existing
      ? {
          ...existing,
          start_time: existing.start_time.slice(0, 5),
          end_time: existing.end_time.slice(0, 5),
          work_days: [...existing.work_days],
        }
      : { ...this.emptySchedule(), category_id: global ? null : this.categoriesWithoutSchedule[0]?.id ?? null };
    this.scheduleOpen.set(true);
  }

  toggleDay(day: number): void {
    const days = this.schedule.work_days;
    this.schedule.work_days = days.includes(day)
      ? days.filter((d) => d !== day)
      : [...days, day].sort((a, b) => a - b);
  }

  async saveSchedule(): Promise<void> {
    if (!this.schedule.work_days.length) {
      await this.notify('Escolha pelo menos um dia de trabalho', 'danger');
      return;
    }
    if (this.schedule.start_time >= this.schedule.end_time) {
      await this.notify('A hora de saída deve ser posterior à de entrada', 'danger');
      return;
    }

    this.saving.set(true);
    try {
      await this.api.saveSchedule({
        ...this.schedule,
        category_id: this.editingGlobal() ? null : this.schedule.category_id,
      });
      await this.notify('Horário guardado', 'success');
      this.scheduleOpen.set(false);
      await this.load();
    } catch (error) {
      await this.notify(apiErrorMessage(error, 'Não foi possível guardar o horário'), 'danger');
    } finally {
      this.saving.set(false);
    }
  }

  async removeSchedule(item: WorkSchedule): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Remover horário',
      message: `A categoria ${item.category_name} passa a seguir o horário geral.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Remover',
          role: 'destructive',
          handler: () => {
            void this.doRemoveSchedule(item);
          },
        },
      ],
    });
    await alert.present();
  }

  private async doRemoveSchedule(item: WorkSchedule): Promise<void> {
    try {
      await this.api.deleteSchedule(item.category_id!);
      await this.load();
    } catch (error) {
      await this.notify(apiErrorMessage(error, 'Não foi possível remover'), 'danger');
    }
  }

  dayLabels(days: number[]): string {
    return days.map((d) => WEEKDAYS.find((w) => w.value === d)?.label.slice(0, 3)).join(', ');
  }

  // ---- Categorias ------------------------------------------------------------
  openCategory(): void {
    this.categoryForm = { name: '', code_prefix: '', description: '', color: 'primary' };
    this.categoryOpen.set(true);
  }

  async saveCategory(): Promise<void> {
    const name = this.categoryForm.name.trim();
    const prefix = this.categoryForm.code_prefix.trim().toUpperCase();

    if (name.length < 2 || !/^[A-Z]{2,5}$/.test(prefix)) {
      await this.notify('Indique o nome e um prefixo de 2 a 5 letras (ex.: EST)', 'danger');
      return;
    }

    this.saving.set(true);
    try {
      await this.api.createCategory({
        name,
        code_prefix: prefix,
        description: this.categoryForm.description.trim() || null,
        color: this.categoryForm.color,
      });
      await this.notify('Categoria criada', 'success');
      this.categoryOpen.set(false);
      await this.load();
    } catch (error) {
      await this.notify(apiErrorMessage(error, 'Não foi possível criar a categoria'), 'danger');
    } finally {
      this.saving.set(false);
    }
  }

  async deleteCategory(category: Category): Promise<void> {
    try {
      await this.api.deleteCategory(category.id);
      await this.notify('Categoria eliminada', 'success');
      await this.load();
    } catch (error) {
      await this.notify(apiErrorMessage(error, 'Não foi possível eliminar'), 'danger');
    }
  }

  // ---- Palavra-passe ---------------------------------------------------------
  async changePassword(): Promise<void> {
    if (this.passwordForm.next.length < 6) {
      await this.notify('A nova palavra-passe deve ter pelo menos 6 caracteres', 'danger');
      return;
    }
    if (this.passwordForm.next !== this.passwordForm.confirm) {
      await this.notify('A confirmação não coincide', 'danger');
      return;
    }

    this.saving.set(true);
    try {
      await this.auth.changePassword(this.passwordForm.current, this.passwordForm.next);
      await this.notify('Palavra-passe actualizada', 'success');
      this.passwordOpen.set(false);
      this.passwordForm = { current: '', next: '', confirm: '' };
    } catch (error) {
      await this.notify(apiErrorMessage(error, 'Não foi possível alterar a palavra-passe'), 'danger');
    } finally {
      this.saving.set(false);
    }
  }

  private async notify(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toast.create({ message, duration: 2600, color });
    await toast.present();
  }
}
