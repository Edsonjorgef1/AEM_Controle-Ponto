import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { AlertController, IonicModule, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addOutline, closeOutline, createOutline, downloadOutline, printOutline,
  qrCodeOutline, refreshOutline, saveOutline, searchOutline, trashOutline,
} from 'ionicons/icons';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { apiErrorMessage } from '../../core/auth.interceptor';
import { Category, Member } from '../../core/models';

@Component({
  selector: 'app-members',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, IonicModule],
  templateUrl: './members.page.html',
  styleUrls: ['./members.page.scss'],
})
export class MembersPage implements OnInit {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private toast = inject(ToastController);
  private alerts = inject(AlertController);
  readonly auth = inject(AuthService);

  readonly members = signal<Member[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);

  readonly search = signal('');
  readonly categoryFilter = signal<number | null>(null);
  readonly showInactive = signal(false);

  readonly formOpen = signal(false);
  readonly editing = signal<Member | null>(null);

  readonly qrMember = signal<{ member: Member; image: string } | null>(null);

  readonly form = this.fb.nonNullable.group({
    full_name: ['', [Validators.required, Validators.minLength(3)]],
    category_id: [null as number | null, Validators.required],
    position: [''],
    department: [''],
    email: [''],
    phone: [''],
  });

  /** Filtragem local: a lista completa já está em memória. */
  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const category = this.categoryFilter();
    return this.members().filter((m) => {
      if (!this.showInactive() && !m.active) return false;
      if (category !== null && m.category_id !== category) return false;
      if (!term) return true;
      return (
        m.full_name.toLowerCase().includes(term) ||
        m.internal_code.toLowerCase().includes(term) ||
        (m.department ?? '').toLowerCase().includes(term)
      );
    });
  });

  constructor() {
    addIcons({
      addOutline, closeOutline, createOutline, downloadOutline, printOutline,
      qrCodeOutline, refreshOutline, saveOutline, searchOutline, trashOutline,
    });
  }

  ngOnInit(): void {
    void this.load();
  }

  async load(event?: CustomEvent): Promise<void> {
    this.loading.set(true);
    try {
      const [members, categories] = await Promise.all([this.api.members(), this.api.categories()]);
      this.members.set(members.items);
      this.categories.set(categories);
    } catch (error) {
      await this.notify(apiErrorMessage(error, 'Não foi possível carregar as pessoas'), 'danger');
    } finally {
      this.loading.set(false);
      (event?.target as HTMLIonRefresherElement | undefined)?.complete();
    }
  }

  openCreate(): void {
    this.editing.set(null);
    this.form.reset({ full_name: '', category_id: null, position: '', department: '', email: '', phone: '' });
    this.formOpen.set(true);
  }

  openEdit(member: Member): void {
    this.editing.set(member);
    this.form.reset({
      full_name: member.full_name,
      category_id: member.category_id,
      position: member.position ?? '',
      department: member.department ?? '',
      email: member.email ?? '',
      phone: member.phone ?? '',
    });
    this.formOpen.set(true);
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    try {
      const value = this.form.getRawValue();
      const body = {
        full_name: value.full_name.trim(),
        category_id: value.category_id!,
        position: value.position.trim() || null,
        department: value.department.trim() || null,
        email: value.email.trim() || null,
        phone: value.phone.trim() || null,
      };

      const current = this.editing();
      if (current) {
        await this.api.updateMember(current.id, body);
        await this.notify('Dados actualizados', 'success');
      } else {
        const created = await this.api.createMember(body);
        await this.notify(`Registada com o código ${created.internal_code}`, 'success');
      }

      this.formOpen.set(false);
      await this.load();
    } catch (error) {
      await this.notify(apiErrorMessage(error, 'Não foi possível guardar'), 'danger');
    } finally {
      this.saving.set(false);
    }
  }

  async toggleActive(member: Member): Promise<void> {
    try {
      await this.api.updateMember(member.id, { active: !member.active });
      await this.load();
    } catch (error) {
      await this.notify(apiErrorMessage(error, 'Não foi possível alterar o estado'), 'danger');
    }
  }

  async confirmDelete(member: Member): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Eliminar registo',
      message: `Eliminar ${member.full_name} apaga também todo o seu histórico de pontos. Para manter o histórico, desactive a pessoa em vez de a eliminar.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: () => {
            void this.remove(member);
          },
        },
      ],
    });
    await alert.present();
  }

  private async remove(member: Member): Promise<void> {
    try {
      await this.api.deleteMember(member.id);
      await this.notify('Registo eliminado', 'success');
      await this.load();
    } catch (error) {
      await this.notify(apiErrorMessage(error, 'Não foi possível eliminar'), 'danger');
    }
  }

  async showQrCode(member: Member): Promise<void> {
    try {
      const { image } = await this.api.memberQrCode(member.id);
      this.qrMember.set({ member, image });
    } catch (error) {
      await this.notify(apiErrorMessage(error, 'Não foi possível gerar o QR Code'), 'danger');
    }
  }

  /** Guarda o PNG do QR Code com o código interno no nome do ficheiro. */
  downloadQrCode(): void {
    const current = this.qrMember();
    if (!current) return;

    const link = document.createElement('a');
    link.href = current.image;
    link.download = `qrcode-${current.member.internal_code}.png`;
    link.click();
  }

  /** Abre uma folha pronta a imprimir com o cartão da pessoa. */
  printQrCode(): void {
    const current = this.qrMember();
    if (!current) return;

    const win = window.open('', '_blank', 'width=420,height=560');
    if (!win) return;

    const { member, image } = current;
    win.document.write(`
      <html lang="pt">
        <head>
          <title>Cartão ${member.internal_code}</title>
          <style>
            body { font-family: system-ui, sans-serif; text-align: center; padding: 32px; }
            img { width: 260px; height: 260px; }
            h1 { font-size: 18px; margin: 16px 0 4px; }
            p { margin: 2px 0; color: #555; font-size: 13px; }
            .code { font-size: 20px; font-weight: 700; letter-spacing: 2px; margin-top: 8px; }
          </style>
        </head>
        <body>
          <img src="${image}" alt="QR Code de ${member.full_name}" />
          <h1>${member.full_name}</h1>
          <p>${member.category_name}${member.department ? ' · ' + member.department : ''}</p>
          <p class="code">${member.internal_code}</p>
        </body>
      </html>`);
    win.document.close();
    win.focus();
    win.print();
  }

  async regenerateQrCode(member: Member): Promise<void> {
    const alert = await this.alerts.create({
      header: 'Emitir novo QR Code',
      message: `O QR Code actual de ${member.full_name} deixa de funcionar. Use isto quando o cartão for perdido ou copiado.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Emitir novo',
          handler: () => {
            void this.doRegenerate(member);
          },
        },
      ],
    });
    await alert.present();
  }

  private async doRegenerate(member: Member): Promise<void> {
    try {
      await this.api.regenerateQrCode(member.id);
      await this.notify('Novo QR Code emitido. Imprima o cartão actualizado.', 'success');
      await this.load();
      const refreshed = this.members().find((m) => m.id === member.id);
      if (refreshed) await this.showQrCode(refreshed);
    } catch (error) {
      await this.notify(apiErrorMessage(error, 'Não foi possível emitir o novo QR Code'), 'danger');
    }
  }

  private async notify(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toast.create({ message, duration: 2600, color, position: 'bottom' });
    await toast.present();
  }

  trackById = (_: number, item: Member) => item.id;
}
