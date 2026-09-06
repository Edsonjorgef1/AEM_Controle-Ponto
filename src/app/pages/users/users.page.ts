import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AlertController, IonicModule, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, closeOutline, createOutline, refreshOutline, saveOutline, trashOutline } from 'ionicons/icons';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { apiErrorMessage } from '../../core/auth.interceptor';
import { Role, User } from '../../core/models';

const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  gestor: 'Gestor (só consulta)',
  operador: 'Operador (só leitura de QR Code)',
};

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  templateUrl: './users.page.html',
  styleUrls: ['./users.page.scss'],
})
export class UsersPage implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastController);
  private alerts = inject(AlertController);
  readonly auth = inject(AuthService);

  readonly users = signal<User[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly formOpen = signal(false);
  readonly editing = signal<User | null>(null);

  readonly roles: Role[] = ['admin', 'gestor', 'operador'];
  readonly roleLabels = ROLE_LABELS;

  form = { name: '', email: '', password: '', role: 'operador' as Role };

  constructor() {
    addIcons({ addOutline, closeOutline, createOutline, refreshOutline, saveOutline, trashOutline });
  }

  ngOnInit(): void {
    void this.load();
  }

  async load(event?: CustomEvent): Promise<void> {
    this.loading.set(true);
    try {
      this.users.set(await this.api.users());
    } catch (error) {
      await this.notify(apiErrorMessage(error, 'Não foi possível carregar as contas'), 'danger');
    } finally {
      this.loading.set(false);
      (event?.target as HTMLIonRefresherElement | undefined)?.complete();
    }
  }

  openCreate(): void {
    this.editing.set(null);
    this.form = { name: '', email: '', password: '', role: 'operador' };
    this.formOpen.set(true);
  }

  openEdit(user: User): void {
    this.editing.set(user);
    // A palavra-passe fica vazia: só é enviada se o administrador escrever uma nova.
    this.form = { name: user.name, email: user.email, password: '', role: user.role };
    this.formOpen.set(true);
  }

  async save(): Promise<void> {
    const name = this.form.name.trim();
    const email = this.form.email.trim();

    if (name.length < 2 || !email) {
      await this.notify('Preencha o nome e o email', 'danger');
      return;
    }
    if (!this.editing() && this.form.password.length < 6) {
      await this.notify('A palavra-passe deve ter pelo menos 6 caracteres', 'danger');
      return;
    }

    this.saving.set(true);
    try {
      const current = this.editing();
      if (current) {
        await this.api.updateUser(current.id, {
          name,
          email,
          role: this.form.role,
          ...(this.form.password ? { password: this.form.password } : {}),
        });
        await this.notify('Conta actualizada', 'success');
      } else {
        await this.api.createUser({ name, email, password: this.form.password, role: this.form.role });
        await this.notify('Conta criada', 'success');
      }
      this.formOpen.set(false);
      await this.load();
    } catch (error) {
      await this.notify(apiErrorMessage(error, 'Não foi possível guardar a conta'), 'danger');
    } finally {
      this.saving.set(false);
    }
  }

  async toggleActive(user: User): Promise<void> {
    try {
      await this.api.updateUser(user.id, { active: !user.active });
      await this.load();
    } catch (error) {
      await this.notify(apiErrorMessage(error, 'Não foi possível alterar o estado'), 'danger');
    }
  }

  async confirmDelete(user: User): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Eliminar conta',
      message: `Eliminar a conta de ${user.name}? O histórico de leituras que fez é mantido.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: () => {
            void this.remove(user);
          },
        },
      ],
    });
    await alert.present();
  }

  private async remove(user: User): Promise<void> {
    try {
      await this.api.deleteUser(user.id);
      await this.notify('Conta eliminada', 'success');
      await this.load();
    } catch (error) {
      await this.notify(apiErrorMessage(error, 'Não foi possível eliminar'), 'danger');
    }
  }

  isSelf(user: User): boolean {
    return this.auth.user()?.id === user.id;
  }

  roleColor(role: Role): string {
    return role === 'admin' ? 'primary' : role === 'gestor' ? 'tertiary' : 'success';
  }

  private async notify(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toast.create({ message, duration: 2600, color });
    await toast.present();
  }

  trackById = (_: number, item: User) => item.id;
}
