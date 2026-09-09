import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { TransactionService } from '../../../core/services/transaction.service';
import { RecurrenceService } from '../../../core/services/recurrence.service';
import { AccountService } from '../../../core/services/account.service';
import { CategoryService } from '../../../core/services/category.service';
import { SubcategoryService } from '../../../core/services/subcategory.service';
import { TagService } from '../../../core/services/tag.service';
import { Account, Category, Subcategory, Tag, Transaction } from '../../../models';
import { parseIsoDate } from '../../../shared/util/date.util';
import { RecurrenceScopeDialog } from '../recurrence-scope-dialog/recurrence-scope-dialog';

@Component({
  selector: 'app-transactions-list',
  standalone: true,
  imports: [
    RouterLink,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './transactions-list.html',
  styleUrl: './transactions-list.scss',
})
export class TransactionsList {
  private readonly transactionService = inject(TransactionService);
  private readonly recurrenceService = inject(RecurrenceService);
  private readonly accountService = inject(AccountService);
  private readonly categoryService = inject(CategoryService);
  private readonly subcategoryService = inject(SubcategoryService);
  private readonly tagService = inject(TagService);
  private readonly dialog = inject(MatDialog);

  readonly displayedColumns = ['date', 'description', 'category', 'account', 'tags', 'amount', 'actions'];
  readonly transactions = signal<Transaction[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly subcategories = signal<Subcategory[]>([]);
  readonly tags = signal<Tag[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly selectedMonth = signal(TransactionsList.startOfMonth(new Date()));

  readonly monthLabel = computed(() => {
    const label = this.selectedMonth().toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  readonly filteredTransactions = computed(() => {
    const year = this.selectedMonth().getFullYear();
    const month = this.selectedMonth().getMonth();
    return this.transactions().filter((t) => {
      const date = parseIsoDate(t.date);
      return date.getFullYear() === year && date.getMonth() === month;
    });
  });

  private readonly accountsById = computed(
    () => new Map(this.accounts().map((a) => [a.id, a])),
  );
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

  private static startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  previousMonth(): void {
    const current = this.selectedMonth();
    this.selectedMonth.set(new Date(current.getFullYear(), current.getMonth() - 1, 1));
  }

  nextMonth(): void {
    const current = this.selectedMonth();
    this.selectedMonth.set(new Date(current.getFullYear(), current.getMonth() + 1, 1));
  }

  accountLabel(transaction: Transaction): string {
    const sourceName = this.accountsById().get(transaction.accountId)?.name ?? '-';
    if (transaction.type !== 'transfer') {
      return sourceName;
    }
    const destinationName = transaction.destinationAccountId
      ? (this.accountsById().get(transaction.destinationAccountId)?.name ?? '-')
      : '-';
    return `${sourceName} → ${destinationName}`;
  }

  categoryLabel(transaction: Transaction): string {
    if (transaction.type === 'transfer') {
      return 'Transferência';
    }
    const category = transaction.categoryId ? this.categoriesById().get(transaction.categoryId) : undefined;
    const subcategory = transaction.subcategoryId
      ? this.subcategoriesById().get(transaction.subcategoryId)
      : undefined;
    if (!category) return '-';
    return subcategory ? `${category.name} • ${subcategory.name}` : category.name;
  }

  tagNames(transaction: Transaction): string[] {
    return (transaction.tagIds ?? []).map((id) => this.tagsById().get(id)?.name ?? '').filter(Boolean);
  }

  formatAmount(transaction: Transaction): string {
    const sign = transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '-' : '';
    return `${sign} ${(transaction.amount / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    })}`;
  }

  async remove(transaction: Transaction): Promise<void> {
    try {
      if (transaction.recurrenceId) {
        const scope = await this.askRecurrenceScope();
        if (!scope) {
          return;
        }
        await this.recurrenceService.applyDelete(transaction, scope);
      } else {
        if (!confirm(`Excluir a transação "${transaction.description}"?`)) {
          return;
        }
        await this.transactionService.remove(transaction.id);
      }
      await this.reload();
    } catch (error) {
      console.error('Erro ao excluir transação', error);
      this.errorMessage.set('Não foi possível excluir a transação.');
    }
  }

  private askRecurrenceScope() {
    const ref = this.dialog.open(RecurrenceScopeDialog, {
      data: { action: 'delete' },
      width: '360px',
    });
    return firstValueFrom(ref.afterClosed());
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      await this.recurrenceService.runGenerationForAllActive();
      const [transactions, accounts, categories, subcategories, tags] = await Promise.all([
        this.transactionService.list(),
        this.accountService.list(),
        this.categoryService.list(),
        this.subcategoryService.list(),
        this.tagService.list(),
      ]);
      this.transactions.set(transactions);
      this.accounts.set(accounts);
      this.categories.set(categories);
      this.subcategories.set(subcategories);
      this.tags.set(tags);
    } catch (error) {
      console.error('Erro ao carregar transações', error);
      this.errorMessage.set('Não foi possível carregar as transações.');
    } finally {
      this.loading.set(false);
    }
  }
}
