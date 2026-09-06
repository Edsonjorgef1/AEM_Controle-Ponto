import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AttendanceRecord, Category, Dashboard, Member, Paged,
  ReportSummary, ScanResult, User, WorkSchedule,
} from './models';

/** Constrói HttpParams ignorando filtros vazios. */
function params(source: Record<string, string | number | boolean | null | undefined>): HttpParams {
  let result = new HttpParams();
  for (const [key, value] of Object.entries(source)) {
    if (value === null || value === undefined || value === '') continue;
    result = result.set(key, String(value));
  }
  return result;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  // ---- Categorias -----------------------------------------------------------
  categories() {
    return firstValueFrom(this.http.get<Category[]>(`${this.base}/categories`));
  }

  createCategory(body: Partial<Category>) {
    return firstValueFrom(this.http.post<Category>(`${this.base}/categories`, body));
  }

  updateCategory(id: number, body: Partial<Category>) {
    return firstValueFrom(this.http.patch<Category>(`${this.base}/categories/${id}`, body));
  }

  deleteCategory(id: number) {
    return firstValueFrom(this.http.delete<void>(`${this.base}/categories/${id}`));
  }

  // ---- Pessoas registadas ---------------------------------------------------
  members(filters: { q?: string; category_id?: number | null; active?: boolean | null } = {}) {
    return firstValueFrom(
      this.http.get<Paged<Member>>(`${this.base}/members`, {
        params: params({
          q: filters.q,
          category_id: filters.category_id,
          active: filters.active === null || filters.active === undefined ? undefined : String(filters.active),
          limit: 500,
        }),
      }),
    );
  }

  createMember(body: Partial<Member>) {
    return firstValueFrom(this.http.post<Member>(`${this.base}/members`, body));
  }

  updateMember(id: string, body: Partial<Member>) {
    return firstValueFrom(this.http.patch<Member>(`${this.base}/members/${id}`, body));
  }

  deleteMember(id: string) {
    return firstValueFrom(this.http.delete<void>(`${this.base}/members/${id}`));
  }

  memberQrCode(id: string) {
    return firstValueFrom(
      this.http.get<{ id: string; full_name: string; internal_code: string; category_name: string; image: string }>(
        `${this.base}/members/${id}/qrcode`,
      ),
    );
  }

  regenerateQrCode(id: string) {
    return firstValueFrom(
      this.http.post<{ id: string; internal_code: string; qr_token: string }>(
        `${this.base}/members/${id}/regenerate-qr`, {},
      ),
    );
  }

  // ---- Registo de ponto -----------------------------------------------------
  scan(code: string, action: 'auto' | 'entrada' | 'saida' = 'auto') {
    return firstValueFrom(this.http.post<ScanResult>(`${this.base}/attendance/scan`, { code, action }));
  }

  attendanceToday() {
    return firstValueFrom(this.http.get<AttendanceRecord[]>(`${this.base}/attendance/today`));
  }

  attendance(filters: { from?: string; to?: string; member_id?: string; category_id?: number | null } = {}) {
    return firstValueFrom(
      this.http.get<Paged<AttendanceRecord>>(`${this.base}/attendance`, { params: params(filters) }),
    );
  }

  manualAttendance(body: {
    member_id: string; work_date: string; check_in?: string | null;
    check_out?: string | null; status?: string; notes?: string | null;
  }) {
    return firstValueFrom(this.http.post<AttendanceRecord>(`${this.base}/attendance/manual`, body));
  }

  deleteAttendance(id: string) {
    return firstValueFrom(this.http.delete<void>(`${this.base}/attendance/${id}`));
  }

  // ---- Relatórios -----------------------------------------------------------
  dashboard() {
    return firstValueFrom(this.http.get<Dashboard>(`${this.base}/reports/dashboard`));
  }

  reportSummary(filters: { from?: string; to?: string; category_id?: number | null } = {}) {
    return firstValueFrom(
      this.http.get<ReportSummary>(`${this.base}/reports/summary`, { params: params(filters) }),
    );
  }

  /** CSV do relatório, devolvido como Blob para descarregar no browser. */
  exportReport(filters: { from?: string; to?: string; category_id?: number | null } = {}) {
    return firstValueFrom(
      this.http.get(`${this.base}/reports/export`, {
        params: params(filters),
        responseType: 'blob',
      }),
    );
  }

  // ---- Horários -------------------------------------------------------------
  schedules() {
    return firstValueFrom(this.http.get<WorkSchedule[]>(`${this.base}/schedules`));
  }

  saveSchedule(body: WorkSchedule) {
    return firstValueFrom(this.http.put<WorkSchedule>(`${this.base}/schedules`, body));
  }

  deleteSchedule(categoryId: number) {
    return firstValueFrom(this.http.delete<void>(`${this.base}/schedules/${categoryId}`));
  }

  // ---- Contas do sistema ----------------------------------------------------
  users() {
    return firstValueFrom(this.http.get<User[]>(`${this.base}/users`));
  }

  createUser(body: { name: string; email: string; password: string; role: string }) {
    return firstValueFrom(this.http.post<User>(`${this.base}/users`, body));
  }

  updateUser(id: string, body: Partial<User> & { password?: string }) {
    return firstValueFrom(this.http.patch<User>(`${this.base}/users/${id}`, body));
  }

  deleteUser(id: string) {
    return firstValueFrom(this.http.delete<void>(`${this.base}/users/${id}`));
  }
}
