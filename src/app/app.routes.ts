import { Routes } from '@angular/router';
import { IndexComponent } from './pages/index/index';
import { LoginComponent } from './pages/login/login';
import { HomeComponent } from './pages/home/home';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'home', redirectTo: '/', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'index', component: IndexComponent }
];
