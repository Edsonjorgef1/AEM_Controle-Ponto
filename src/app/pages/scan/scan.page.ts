import { AfterViewInit, Component, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { Html5Qrcode } from 'html5-qrcode';
import { addIcons } from 'ionicons';
import {
  cameraOutline, cameraReverseOutline, checkmarkCircle, closeCircle,
  keypadOutline, logInOutline, logOutOutline, stopCircleOutline,
} from 'ionicons/icons';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { apiErrorMessage } from '../../core/auth.interceptor';
import { ScanResult } from '../../core/models';

const READER_ID = 'qr-reader';

/** Mesmo código lido de novo dentro desta janela é ignorado em silêncio. */
const REPEAT_COOLDOWN_MS = 4000;

interface Feedback {
  kind: 'entrada' | 'saida' | 'erro';
  title: string;
  detail: string;
  at: Date;
}

@Component({
  selector: 'app-scan',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  templateUrl: './scan.page.html',
  styleUrls: ['./scan.page.scss'],
})
export class ScanPage implements AfterViewInit, OnDestroy {
  private api = inject(ApiService);
  readonly auth = inject(AuthService);

  private scanner: Html5Qrcode | null = null;
  private lastCode: { value: string; at: number } | null = null;

  readonly scanning = signal(false);
  readonly starting = signal(false);
  readonly cameraError = signal<string | null>(null);
  readonly processing = signal(false);
  readonly feedback = signal<Feedback | null>(null);
  readonly history = signal<Feedback[]>([]);
  readonly manualMode = signal(false);
  manualCode = '';

  constructor() {
    addIcons({
      cameraOutline, cameraReverseOutline, checkmarkCircle, closeCircle,
      keypadOutline, logInOutline, logOutOutline, stopCircleOutline,
    });
  }

  async ngAfterViewInit(): Promise<void> {
    await this.start();
  }

  async ngOnDestroy(): Promise<void> {
    await this.stop();
  }

  async start(): Promise<void> {
    if (this.scanning() || this.starting()) return;

    this.starting.set(true);
    this.cameraError.set(null);
    try {
      this.scanner ??= new Html5Qrcode(READER_ID, { verbose: false });
      await this.scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 260 } },
        (decoded) => void this.onDecoded(decoded),
        // Cada frame sem QR Code chama este callback: é o funcionamento
        // normal do leitor, não um erro a mostrar ao utilizador.
        () => undefined,
      );
      this.scanning.set(true);
    } catch (error) {
      this.cameraError.set(
        'Não foi possível aceder à câmara. Autorize o acesso no browser ou use a introdução manual do código.',
      );
      console.error('[scan] falha ao iniciar a câmara:', error);
    } finally {
      this.starting.set(false);
    }
  }

  async stop(): Promise<void> {
    if (!this.scanner) return;
    try {
      if (this.scanning()) await this.scanner.stop();
      this.scanner.clear();
    } catch (error) {
      console.error('[scan] falha ao parar a câmara:', error);
    } finally {
      this.scanning.set(false);
      this.scanner = null;
    }
  }

  toggleManual(): void {
    this.manualMode.set(!this.manualMode());
    this.manualCode = '';
  }

  async submitManual(): Promise<void> {
    const code = this.manualCode.trim();
    if (!code) return;
    this.manualCode = '';
    await this.register(code);
  }

  private async onDecoded(code: string): Promise<void> {
    const now = Date.now();
    // A câmara lê o mesmo cartão muitas vezes por segundo enquanto está à frente.
    if (this.lastCode?.value === code && now - this.lastCode.at < REPEAT_COOLDOWN_MS) return;
    this.lastCode = { value: code, at: now };
    await this.register(code);
  }

  private async register(code: string): Promise<void> {
    if (this.processing()) return;
    this.processing.set(true);
    try {
      const result: ScanResult = await this.api.scan(code);
      this.publish({
        kind: result.action,
        title: `${result.record.full_name} — ${result.action === 'entrada' ? 'Entrada' : 'Saída'}`,
        detail: `${result.record.internal_code} · ${result.record.category_name} · ${result.message}`,
        at: new Date(),
      });
      this.signalSuccess();
    } catch (error) {
      this.publish({
        kind: 'erro',
        title: 'Leitura não registada',
        detail: apiErrorMessage(error, 'Não foi possível registar o ponto'),
        at: new Date(),
      });
      this.signalFailure();
    } finally {
      this.processing.set(false);
    }
  }

  private publish(entry: Feedback): void {
    this.feedback.set(entry);
    this.history.update((list) => [entry, ...list].slice(0, 15));
  }

  /** Vibração curta: confirma o registo sem obrigar a olhar para o ecrã. */
  private signalSuccess(): void {
    navigator.vibrate?.(120);
  }

  private signalFailure(): void {
    navigator.vibrate?.([80, 60, 80]);
  }

  trackByTime = (_: number, item: Feedback) => item.at.getTime();
}
