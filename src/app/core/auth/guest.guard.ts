import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** impede que um usuário já logado acesse a tela de login */
export const guestGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.waitUntilReady();

  if (authService.currentUser()) {
    return router.createUrlTree(['/']);
  }
  return true;
};
