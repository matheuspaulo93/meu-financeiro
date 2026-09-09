import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { FirebaseError } from 'firebase/app';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    const { email, password } = this.form.getRawValue();

    try {
      await this.authService.login(email, password);
      await this.router.navigateByUrl('/');
    } catch (error) {
      console.error('Erro ao entrar', error);
      this.errorMessage.set(this.mapError(error));
    } finally {
      this.loading.set(false);
    }
  }

  private mapError(error: unknown): string {
    if (error instanceof FirebaseError) {
      switch (error.code) {
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
          return 'E-mail ou senha inválidos.';
        case 'auth/too-many-requests':
          return 'Muitas tentativas. Tente novamente mais tarde.';
        default:
          return 'Não foi possível entrar. Tente novamente.';
      }
    }
    return 'Não foi possível entrar. Tente novamente.';
  }
}
