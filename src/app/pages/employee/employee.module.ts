import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { EmployeePage } from './employee.page';

@NgModule({
  imports: [
    RouterModule.forChild([
      {
        path: '',
        component: EmployeePage
      }
    ])
  ]
})
export class EmployeePageModule {}