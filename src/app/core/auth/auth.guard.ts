import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  await authService.waitUntilReady();

  if (authService.currentUser()) {
    return true;
  }
  return router.createUrlTree(['/login']);
};
