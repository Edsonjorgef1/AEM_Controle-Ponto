import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ReportPage } from './report.page';

@NgModule({
  imports: [
    RouterModule.forChild([
      {
        path: '',
        component: ReportPage
      }
    ])
  ]
})
export class ReportPageModule {}