import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { guestGuard } from './core/auth/guest.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
    canActivate: [guestGuard],
  },
  {
    path: '',
    loadComponent: () => import('./core/layout/shell/shell').then((m) => m.Shell),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
        pathMatch: 'full',
      },
      {
        path: 'accounts',
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/accounts/accounts-list/accounts-list').then(
                (m) => m.AccountsList,
              ),
          },
          {
            path: 'new',
            loadComponent: () =>
              import('./features/accounts/account-form/account-form').then((m) => m.AccountForm),
          },
          {
            path: ':id/edit',
            loadComponent: () =>
              import('./features/accounts/account-form/account-form').then((m) => m.AccountForm),
          },
        ],
      },
      {
        path: 'credit-cards',
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/credit-cards/credit-cards-list/credit-cards-list').then(
                (m) => m.CreditCardsList,
              ),
          },
          {
            path: 'new',
            loadComponent: () =>
              import('./features/credit-cards/credit-card-form/credit-card-form').then(
                (m) => m.CreditCardForm,
              ),
          },
          {
            path: ':id/edit',
            loadComponent: () =>
              import('./features/credit-cards/credit-card-form/credit-card-form').then(
                (m) => m.CreditCardForm,
              ),
          },
        ],
      },
      {
        path: 'categories',
        loadComponent: () =>
          import('./features/categories/categories-list/categories-list').then(
            (m) => m.CategoriesList,
          ),
      },
      {
        path: 'tags',
        loadComponent: () =>
          import('./features/tags/tags-list/tags-list').then((m) => m.TagsList),
      },
      {
        path: 'transactions',
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/transactions/transactions-list/transactions-list').then(
                (m) => m.TransactionsList,
              ),
          },
          {
            path: 'new',
            loadComponent: () =>
              import('./features/transactions/transaction-form/transaction-form').then(
                (m) => m.TransactionForm,
              ),
          },
          {
            path: ':id/edit',
            loadComponent: () =>
              import('./features/transactions/transaction-form/transaction-form').then(
                (m) => m.TransactionForm,
              ),
          },
        ],
      },
      {
        path: 'invoices/:id',
        loadComponent: () =>
          import('./features/invoices/invoice-detail/invoice-detail').then(
            (m) => m.InvoiceDetail,
          ),
      },
    ],
  },
];
