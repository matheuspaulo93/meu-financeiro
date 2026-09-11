import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';
import { InvoiceService } from '../../../core/services/invoice.service';
import { CreditCardService } from '../../../core/services/credit-card.service';
import { AccountService } from '../../../core/services/account.service';
import { CategoryService } from '../../../core/services/category.service';
import { SubcategoryService } from '../../../core/services/subcategory.service';
import { TagService } from '../../../core/services/tag.service';
import { TransactionService } from '../../../core/services/transaction.service';
import { Account, Category, CreditCard, Invoice, Subcategory, Tag, Transaction } from '../../../models';
import { parseIsoDate } from '../../../shared/util/date.util';
import { PayInvoiceDialog, PayInvoiceDialogResult } from '../pay-invoice-dialog/pay-invoice-dialog';
import { InstallmentScope, InstallmentScopeDialog } from '../installment-scope-dialog/installment-scope-dialog';
import { EditCardItemDialog, EditCardItemDialogResult } from '../edit-card-item-dialog/edit-card-item-dialog';

@Component({
  selector: 'app-invoice-detail',
  standalone: true,
  imports: [
    RouterLink,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatDialogModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './invoice-detail.html',
  styleUrl: './invoice-detail.scss',
})
export class InvoiceDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly invoiceService = inject(InvoiceService);
  private readonly creditCardService = inject(CreditCardService);
  private readonly accountService = inject(AccountService);
  private readonly categoryService = inject(CategoryService);
  private readonly subcategoryService = inject(SubcategoryService);
  private readonly tagService = inject(TagService);
  private readonly transactionService = inject(TransactionService);
  private readonly dialog = inject(MatDialog);

  readonly invoiceId = this.route.snapshot.paramMap.get('id');

  readonly invoice = signal<Invoice | null>(null);
  readonly card = signal<CreditCard | null>(null);
  readonly debitAccount = signal<Account | null>(null);
  readonly transactions = signal<Transaction[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly subcategories = signal<Subcategory[]>([]);
  readonly tags = signal<Tag[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly displayedColumns = ['date', 'description', 'category', 'tags', 'amount', 'actions'];

  private readonly categoriesById = computed(
    () => new Map(this.categories().map((c) => [c.id, c])),
  );
  private readonly subcategoriesById = computed(
    () => new Map(this.subcategories().map((s) => [s.id, s])),
  );
  private readonly tagsById = computed(() => new Map(this.tags().map((t) => [t.id, t])));

  constructor() {
    this.reload();
  }

  async reload(): Promise<void> {
    if (!this.invoiceId) return;
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const invoice = await this.invoiceService.get(this.invoiceId);
      if (!invoice) {
        this.errorMessage.set('Fatura não encontrada.');
        return;
      }
      this.invoice.set(invoice);

      const [card, transactions, categories, subcategories, tags] = await Promise.all([
        this.creditCardService.get(invoice.creditCardId),
        this.transactionService.listByInvoice(invoice.id),
        this.categoryService.list(),
        this.subcategoryService.list(),
        this.tagService.list(),
      ]);

      this.card.set(card);
      this.transactions.set(transactions);
      this.categories.set(categories);
      this.subcategories.set(subcategories);
      this.tags.set(tags);

      if (card) {
        const debitAccount = await this.accountService.get(card.debitAccountId);
        this.debitAccount.set(debitAccount);
      }
    } catch (error) {
      console.error('Erro ao carregar detalhes da fatura', error);
      this.errorMessage.set('Não foi possível carregar as informações da fatura.');
    } finally {
      this.loading.set(false);
    }
  }

  formatDate(dateIso: string): string {
    return parseIsoDate(dateIso).toLocaleDateString('pt-BR');
  }

  formatAmount(amountInCents: number): string {
    return (amountInCents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  categoryLabel(t: Transaction): string {
    if (!t.categoryId) return '-';
    const category = this.categoriesById().get(t.categoryId);
    const subcategory = t.subcategoryId ? this.subcategoriesById().get(t.subcategoryId) : undefined;
    if (!category) return '-';
    return subcategory ? `${category.name} • ${subcategory.name}` : category.name;
  }

  tagNames(t: Transaction): string[] {
    return (t.tagIds ?? []).map((id) => this.tagsById().get(id)?.name ?? '').filter(Boolean);
  }

  async openPayDialog(): Promise<void> {
    const inv = this.invoice();
    const crd = this.card();
    if (!inv || !crd) return;

    const ref = this.dialog.open(PayInvoiceDialog, {
      data: { invoice: inv, cardName: crd.name },
      width: '380px',
    });
    const result = await firstValueFrom(ref.afterClosed()) as PayInvoiceDialogResult | undefined;
    if (!result) return;

    this.loading.set(true);
    try {
      await this.invoiceService.markAsPaid(inv.id, result.paidAmount, result.paidAt);
      await this.reload();
    } catch (error) {
      console.error('Erro ao registrar pagamento da fatura', error);
      this.errorMessage.set('Não foi possível registrar o pagamento.');
      this.loading.set(false);
    }
  }

  async reopenInvoice(): Promise<void> {
    const inv = this.invoice();
    if (!inv) return;
    if (!confirm('Deseja reabrir esta fatura? O status voltará para "Aberta" e a transação na conta corrente voltará para a data e valor originais da fatura.')) {
      return;
    }

    this.loading.set(true);
    try {
      await this.invoiceService.reopen(inv.id);
      await this.reload();
    } catch (error) {
      console.error('Erro ao reabrir fatura', error);
      this.errorMessage.set('Não foi possível reabrir a fatura.');
      this.loading.set(false);
    }
  }

  async editTransaction(transaction: Transaction): Promise<void> {
    const inv = this.invoice();
    if (!inv) return;

    const ref = this.dialog.open(EditCardItemDialog, {
      data: {
        transaction,
        categories: this.categories(),
        subcategories: this.subcategories(),
        tags: this.tags(),
      },
      width: '420px',
    });

    const result = (await firstValueFrom(ref.afterClosed())) as EditCardItemDialogResult | undefined;
    if (!result) return;

    this.loading.set(true);
    try {
      if (transaction.installmentGroupId && transaction.installmentTotal && transaction.installmentTotal > 1) {
        const scopeRef = this.dialog.open(InstallmentScopeDialog, {
          data: {
            action: 'edit',
            installmentNumber: transaction.installmentNumber ?? 1,
            installmentTotal: transaction.installmentTotal,
          },
          width: '380px',
        });
        const scope = (await firstValueFrom(scopeRef.afterClosed())) as InstallmentScope | undefined;
        if (!scope) {
          this.loading.set(false);
          return;
        }

        if (scope === 'only') {
          await this.transactionService.update(transaction.id, {
            description: `${result.description} (${transaction.installmentNumber}/${transaction.installmentTotal})`,
            amount: result.amount,
            categoryId: result.categoryId,
            subcategoryId: result.subcategoryId,
            tagIds: result.tagIds,
          });
          await this.invoiceService.recalculate(inv.id);
        } else {
          // 'future': esta e as seguintes
          const group = await this.transactionService.listByInstallmentGroup(transaction.installmentGroupId);
          const futureInstallments = group.filter(
            (p) => (p.installmentNumber ?? 0) >= (transaction.installmentNumber ?? 1),
          );

          const affectedInvoiceIds = new Set<string>();
          for (const p of futureInstallments) {
            await this.transactionService.update(p.id, {
              description: `${result.description} (${p.installmentNumber}/${p.installmentTotal})`,
              amount: result.amount,
              categoryId: result.categoryId,
              subcategoryId: result.subcategoryId,
              tagIds: result.tagIds,
            });
            if (p.invoiceId) affectedInvoiceIds.add(p.invoiceId);
          }

          for (const invId of affectedInvoiceIds) {
            await this.invoiceService.recalculate(invId);
          }
        }
      } else {
        await this.transactionService.update(transaction.id, {
          description: result.description,
          amount: result.amount,
          categoryId: result.categoryId,
          subcategoryId: result.subcategoryId,
          tagIds: result.tagIds,
        });
        await this.invoiceService.recalculate(inv.id);
      }
      await this.reload();
    } catch (error) {
      console.error('Erro ao editar item da fatura', error);
      this.errorMessage.set('Não foi possível salvar as alterações.');
      this.loading.set(false);
    }
  }

  async removeTransaction(transaction: Transaction): Promise<void> {
    const inv = this.invoice();
    if (!inv) return;

    let scope: InstallmentScope = 'only';
    if (transaction.installmentGroupId && transaction.installmentTotal && transaction.installmentTotal > 1) {
      const scopeRef = this.dialog.open(InstallmentScopeDialog, {
        data: {
          action: 'delete',
          installmentNumber: transaction.installmentNumber ?? 1,
          installmentTotal: transaction.installmentTotal,
        },
        width: '380px',
      });
      const chosenScope = (await firstValueFrom(scopeRef.afterClosed())) as InstallmentScope | undefined;
      if (!chosenScope) return;
      scope = chosenScope;
    } else {
      if (!confirm(`Deseja excluir "${transaction.description}" da fatura?`)) {
        return;
      }
    }

    this.loading.set(true);
    try {
      if (scope === 'only' || !transaction.installmentGroupId) {
        await this.transactionService.remove(transaction.id);
        await this.invoiceService.recalculate(inv.id);
      } else {
        // 'future': exclui esta e as seguintes
        const group = await this.transactionService.listByInstallmentGroup(transaction.installmentGroupId);
        const futureInstallments = group.filter(
          (p) => (p.installmentNumber ?? 0) >= (transaction.installmentNumber ?? 1),
        );
        const affectedInvoiceIds = new Set<string>();
        for (const p of futureInstallments) {
          if (p.invoiceId) affectedInvoiceIds.add(p.invoiceId);
          await this.transactionService.remove(p.id);
        }
        for (const invId of affectedInvoiceIds) {
          await this.invoiceService.recalculate(invId);
        }
      }
      await this.reload();
    } catch (error) {
      console.error('Erro ao excluir item da fatura', error);
      this.errorMessage.set('Não foi possível excluir o lançamento.');
      this.loading.set(false);
    }
  }
}

