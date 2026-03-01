import { Routes } from '@angular/router';
import { IndexComponent } from './pages/index/index';
import { LoginComponent } from './pages/login/login';

export const routes: Routes = [
  { path: '', component: IndexComponent },
  { path: 'login', component: LoginComponent },
  { path: 'index', redirectTo: '/', pathMatch: 'full' }
];
