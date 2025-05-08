import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AttendancePage } from './attendance.page';

@NgModule({
  imports: [
    RouterModule.forChild([
      {
        path: '',
        component: AttendancePage
      }
    ])
  ]
})
export class AttendancePageModule {}