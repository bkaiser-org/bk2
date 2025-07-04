import { Routes } from '@angular/router';

export const appRoutes: Routes = [
  {
    path: '', loadChildren: () => import('./tabs/tabs.routes').then((m) => m.routes),
  },
];
