import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { eyeOffOutline, eyeOutline, lockClosedOutline, mailOutline, qrCodeOutline } from 'ionicons/icons';
import { AuthService } from '../../core/auth.service';
import { apiErrorMessage } from '../../core/auth.interceptor';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, IonicModule],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly showPassword = signal(false);

  constructor() {
    addIcons({ eyeOffOutline, eyeOutline, lockClosedOutline, mailOutline, qrCodeOutline });
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    try {
      const { email, password } = this.form.getRawValue();
      await this.auth.login(email.trim(), password);
      // Cada perfil entra directamente no ecrã que lhe interessa.
      await this.router.navigateByUrl(this.auth.homeRoute(), { replaceUrl: true });
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'Não foi possível iniciar sessão'));
    } finally {
      this.loading.set(false);
    }
  }
}
