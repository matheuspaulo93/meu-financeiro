import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AccountService } from '../../../core/services/account.service';
import { Account, AccountType } from '../../../models';

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  wallet: 'Carteira',
  investment: 'Investimentos',
  cash: 'Dinheiro em espécie',
  other: 'Outros',
};

@Component({
  selector: 'app-accounts-list',
  standalone: true,
  imports: [
    RouterLink,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './accounts-list.html',
  styleUrl: './accounts-list.scss',
})
export class AccountsList {
  private readonly accountService = inject(AccountService);

  readonly displayedColumns = ['name', 'institution', 'type', 'initialBalance', 'active', 'actions'];
  readonly accounts = signal<Account[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  constructor() {
    this.reload();
  }

  typeLabel(type: AccountType): string {
    return ACCOUNT_TYPE_LABELS[type];
  }

  formatBalance(cents: number): string {
    return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  async toggleActive(account: Account): Promise<void> {
    await this.accountService.setActive(account.id, !account.active);
    await this.reload();
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      this.accounts.set(await this.accountService.list());
    } catch (error) {
      console.error('Erro ao carregar contas', error);
      this.errorMessage.set('Não foi possível carregar as contas.');
    } finally {
      this.loading.set(false);
    }
  }
}
