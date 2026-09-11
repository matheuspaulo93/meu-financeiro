import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CreditCardService } from '../../../core/services/credit-card.service';
import { AccountService } from '../../../core/services/account.service';
import { InvoiceService } from '../../../core/services/invoice.service';
import { Account, CreditCard } from '../../../models';

@Component({
  selector: 'app-credit-cards-list',
  standalone: true,
  imports: [
    RouterLink,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './credit-cards-list.html',
  styleUrl: './credit-cards-list.scss',
})
export class CreditCardsList {
  private readonly creditCardService = inject(CreditCardService);
  private readonly accountService = inject(AccountService);
  private readonly invoiceService = inject(InvoiceService);
  private readonly router = inject(Router);

  readonly displayedColumns = ['name', 'dueDay', 'debitAccount', 'active', 'actions'];
  readonly cards = signal<CreditCard[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  private readonly accountsById = computed(
    () => new Map(this.accounts().map((a) => [a.id, a])),
  );

  constructor() {
    this.reload();
  }

  debitAccountName(card: CreditCard): string {
    return this.accountsById().get(card.debitAccountId)?.name ?? '-';
  }

  dueDayLabel(dueDay: number): string {
    return `Dia ${dueDay}`;
  }

  async openCardInvoice(card: CreditCard): Promise<void> {
    try {
      this.loading.set(true);
      const invoices = await this.invoiceService.listByCard(card.id);
      const openInvoice = invoices.find((i) => i.status === 'open') ?? invoices[0];
      if (openInvoice) {
        await this.router.navigate(['/invoices', openInvoice.id]);
      } else {
        const upcoming = this.invoiceService.getUpcomingInvoices(card, 1);
        const invoice = await this.invoiceService.getOrCreate(card.id, upcoming[0].dueDate);
        await this.router.navigate(['/invoices', invoice.id]);
      }
    } catch (error) {
      console.error('Erro ao abrir fatura do cartão', error);
      this.errorMessage.set('Não foi possível abrir a fatura do cartão.');
      this.loading.set(false);
    }
  }

  async toggleActive(card: CreditCard): Promise<void> {
    try {
      const newActive = !card.active;
      await this.creditCardService.setActive(card.id, newActive);
      this.cards.update((list) =>
        list.map((c) => (c.id === card.id ? { ...c, active: newActive } : c)),
      );
    } catch (error) {
      console.error('Erro ao alterar status do cartão', error);
      this.errorMessage.set('Não foi possível alterar o status do cartão.');
    }
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const [cards, accounts] = await Promise.all([
        this.creditCardService.list(),
        this.accountService.list(),
      ]);
      this.cards.set(cards);
      this.accounts.set(accounts);
    } catch (error) {
      console.error('Erro ao carregar cartões de crédito', error);
      this.errorMessage.set('Não foi possível carregar os cartões de crédito.');
    } finally {
      this.loading.set(false);
    }
  }
}

