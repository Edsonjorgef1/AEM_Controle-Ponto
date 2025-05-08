import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { EmployeeService } from '../../services/employee.service';
import { Employee, Attendance } from '../../models/employee.model';

interface MonthlyReport {
  employeeId: string;
  employeeName: string;
  totalWorkDays: number;
  totalLateDays: number;
  totalLateMinutes: number;
  attendanceRecords: Attendance[];
}

@Component({
  selector: 'app-report',
  templateUrl: './report.page.html',
  styleUrls: ['./report.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule]
})
export class ReportPage implements OnInit {
  currentYear = new Date().getFullYear();
  currentMonth = new Date().getMonth() + 1;
  employees: Employee[] = [];
  monthlyReports: MonthlyReport[] = [];
  isLoading = false;
  selectedEmployee = '';
  attendanceRecords: Attendance[] = [];
  selectedDate: string;
  maxDate: string;
  minDate: string;

  constructor(private employeeService: EmployeeService) {
    const now = new Date();
    this.selectedDate = now.toISOString();
    
    // Definir intervalo de datas permitido (1 ano para trás e 1 mês para frente)
    const min = new Date();
    min.setFullYear(min.getFullYear() - 1);
    this.minDate = min.toISOString();
    
    const max = new Date();
    max.setMonth(max.getMonth() + 1);
    this.maxDate = max.toISOString();
  }

  async ngOnInit() {
    await this.loadEmployees();
    this.generateReport();
  }

  async loadEmployees() {
    try {
      this.employees = await this.employeeService.getEmployees();
    } catch (error) {
      console.error('Erro ao carregar funcionários:', error);
    }
  }

  async generateReport() {
    try {
      this.isLoading = true;
      const attendanceRecords = await this.employeeService.getAttendanceByMonth(
        this.currentYear,
        this.currentMonth
      );

      this.monthlyReports = this.employees
        .filter(emp => !this.selectedEmployee || emp.id === this.selectedEmployee)
        .map(employee => {
          const employeeRecords = attendanceRecords.filter(
            record => record.employee_id === employee.id
          );

          return {
            employeeId: employee.id!,
            employeeName: employee.name,
            totalWorkDays: employeeRecords.length,
            totalLateDays: employeeRecords.filter(
              record => record.late_minutes && record.late_minutes > 0
            ).length,
            totalLateMinutes: employeeRecords.reduce(
              (total, record) => total + (record.late_minutes || 0),
              0
            ),
            attendanceRecords: employeeRecords.sort((a, b) => 
              new Date(b.date).getTime() - new Date(a.date).getTime()
            )
          };
        });
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
    } finally {
      this.isLoading = false;
    }
  }

  onMonthChange(event: any) {
    const date = new Date(event.detail.value);
    this.currentYear = date.getFullYear();
    this.currentMonth = date.getMonth() + 1;
    this.generateReport();
  }

  onEmployeeChange() {
    this.generateReport();
  }

  formatHours(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h${remainingMinutes}min`;
  }

  getEmployeeName(id: string): string {
    const employee = this.employees.find(emp => emp.id === id);
    return employee ? employee.name : 'Funcionário não encontrado';
  }

  getTotalWorkDays(): number {
    return this.monthlyReports.reduce((total, report) => 
      total + report.totalWorkDays, 0);
  }

  getTotalLateDays(): number {
    return this.monthlyReports.reduce((total, report) => 
      total + report.totalLateDays, 0);
  }

  getTotalAbsences(): number {
    const workDaysInMonth = this.getWorkDaysInMonth();
    const totalPresences = this.getTotalWorkDays();
    return Math.max(0, workDaysInMonth - totalPresences);
  }

  getWorkDaysInMonth(): number {
    const date = new Date(this.currentYear, this.currentMonth - 1, 1);
    const endDate = new Date(this.currentYear, this.currentMonth, 0);
    let workDays = 0;

    while (date <= endDate) {
      if (date.getDay() !== 0 && date.getDay() !== 6) { // Exclui sábado e domingo
        workDays++;
      }
      date.setDate(date.getDate() + 1);
    }
    return workDays;
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'No horário': return 'success';
      case 'Atrasado': return 'warning';
      case 'Em exercício': return 'primary';
      case 'Saída': return 'tertiary';
      case 'Justificado': return 'secondary';
      case 'Ausente': return 'danger';
      default: return 'medium';
    }
  }
}