import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';

@NgModule({
  imports: [
    RouterModule.forChild([
      {
        path: '',
        loadComponent: () => import('./settings.page').then(m => m.SettingsPage)
      }
    ])
  ]
})
export class SettingsPageModule {}