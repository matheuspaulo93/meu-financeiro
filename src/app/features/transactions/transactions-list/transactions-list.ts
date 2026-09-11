import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { firstValueFrom } from 'rxjs';
import { TransactionService } from '../../../core/services/transaction.service';
import { RecurrenceService } from '../../../core/services/recurrence.service';
import { AccountService } from '../../../core/services/account.service';
import { CategoryService } from '../../../core/services/category.service';
import { SubcategoryService } from '../../../core/services/subcategory.service';
import { TagService } from '../../../core/services/tag.service';
import { MonthlyBalanceService } from '../../../core/services/monthly-balance.service';
import { Account, Category, Subcategory, Tag, Transaction } from '../../../models';
import { formatIsoDate, parseIsoDate } from '../../../shared/util/date.util';
import {
  computeTransactionBalanceDelta,
  isHiddenCreditCardPurchase,
} from '../../../shared/util/transaction-balance.util';
import { RecurrenceScopeDialog } from '../recurrence-scope-dialog/recurrence-scope-dialog';

export interface TransactionRowItem {
  kind: 'transaction';
  transaction: Transaction;
}

export interface DaySummaryRowItem {
  kind: 'day_summary';
  date: string;
  dateFormatted: string;
  count: number;
  dayIncome: number;
  dayExpense: number;
  dayNet: number;
  runningBalance: number;
}

export type TableRowItem = TransactionRowItem | DaySummaryRowItem;

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
    MatFormFieldModule,
    MatSelectModule,
    MatSlideToggleModule,
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
  private readonly monthlyBalanceService = inject(MonthlyBalanceService);
  private readonly dialog = inject(MatDialog);

  readonly displayedColumns = ['date', 'description', 'category', 'account', 'tags', 'amount', 'actions'];
  readonly transactions = signal<Transaction[]>([]);
  readonly accounts = signal<Account[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly subcategories = signal<Subcategory[]>([]);
  readonly tags = signal<Tag[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly openingBalance = signal(0);

  readonly selectedMonth = signal(TransactionsList.startOfMonth(new Date()));
  readonly selectedAccountId = signal<string>('all');
  readonly considerPreviousBalance = signal(TransactionsList.loadConsiderPreviousBalance());

  readonly monthLabel = computed(() => {
    const label = this.selectedMonth().toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
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

  /**
   * Constrói as linhas da tabela agrupadas por dia com resumo diário e saldo acumulado atualizado.
   */
  readonly tableRows = computed<TableRowItem[]>(() => {
    const allTxs = this.transactions();
    const accId = this.selectedAccountId();
    const monthStart = this.selectedMonth();
    const monthStartIso = formatIsoDate(monthStart);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    const monthEndIso = formatIsoDate(monthEnd);

    let runningBalance = this.considerPreviousBalance() ? this.openingBalance() : 0;

    const monthTxs = allTxs
      .filter((t) => {
        if (isHiddenCreditCardPurchase(t)) {
          return false;
        }
        if (t.date < monthStartIso || t.date > monthEndIso) {
          return false;
        }
        if (accId === 'all') {
          return true;
        }
        return t.accountId === accId || (t.type === 'transfer' && t.destinationAccountId === accId);
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const txsByDate = new Map<string, Transaction[]>();
    for (const t of monthTxs) {
      const list = txsByDate.get(t.date) ?? [];
      list.push(t);
      txsByDate.set(t.date, list);
    }

    const rows: TableRowItem[] = [];
    const sortedDates = Array.from(txsByDate.keys()).sort((a, b) => a.localeCompare(b));

    for (const dateIso of sortedDates) {
      const dayTxs = txsByDate.get(dateIso)!;
      let dayIncome = 0;
      let dayExpense = 0;

      for (const t of dayTxs) {
        rows.push({ kind: 'transaction', transaction: t });
        const delta = computeTransactionBalanceDelta(t, accId);
        if (delta > 0) {
          dayIncome += delta;
        } else if (delta < 0) {
          dayExpense += Math.abs(delta);
        }
        runningBalance += delta;
      }

      const dateObj = parseIsoDate(dateIso);
      const dateFormatted = dateObj.toLocaleDateString('pt-BR');

      rows.push({
        kind: 'day_summary',
        date: dateIso,
        dateFormatted,
        count: dayTxs.length,
        dayIncome,
        dayExpense,
        dayNet: dayIncome - dayExpense,
        runningBalance,
      });
    }

    return rows;
  });

  readonly hasTransactions = computed(() => this.tableRows().length > 0);

  readonly isTransactionRow = (_: number, item: TableRowItem): boolean => item.kind === 'transaction';
  readonly isDaySummaryRow = (_: number, item: TableRowItem): boolean => item.kind === 'day_summary';

  asTx(item: TableRowItem): Transaction {
    return (item as TransactionRowItem).transaction;
  }

  asSummary(item: TableRowItem): DaySummaryRowItem {
    return item as DaySummaryRowItem;
  }

  constructor() {
    void this.reload();
  }

  private static startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private static loadConsiderPreviousBalance(): boolean {
    return typeof localStorage === 'undefined' || localStorage.getItem('transactions-consider-previous-balance') !== 'false';
  }

  async togglePreviousBalance(consider: boolean): Promise<void> {
    this.considerPreviousBalance.set(consider);
    localStorage.setItem('transactions-consider-previous-balance', String(consider));
    await this.reload();
  }

  async previousMonth(): Promise<void> {
    const current = this.selectedMonth();
    this.selectedMonth.set(new Date(current.getFullYear(), current.getMonth() - 1, 1));
    await this.reload();
  }

  async nextMonth(): Promise<void> {
    const current = this.selectedMonth();
    this.selectedMonth.set(new Date(current.getFullYear(), current.getMonth() + 1, 1));
    await this.reload();
  }

  async onAccountChange(accountId: string): Promise<void> {
    this.selectedAccountId.set(accountId);
    await this.reload();
  }

  formatDate(dateIso: string): string {
    return parseIsoDate(dateIso).toLocaleDateString('pt-BR');
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
    if (transaction.isInvoicePayment) {
      return 'Fatura de cartão';
    }
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

  formatTxAmount(transaction: Transaction): string {
    const sign = transaction.type === 'income' ? '+' : transaction.type === 'expense' ? '-' : '';
    return `${sign} ${(transaction.amount / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    })}`;
  }

  formatCurrency(amountInCents: number, showSign: boolean = false): string {
    const sign = showSign ? (amountInCents > 0 ? '+' : amountInCents < 0 ? '-' : '') : '';
    const abs = Math.abs(amountInCents) / 100;
    const formatted = abs.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
    return showSign ? `${sign} ${formatted}` : (amountInCents < 0 ? `- ${formatted}` : formatted);
  }

  async remove(transaction: Transaction): Promise<void> {
    if (transaction.isInvoicePayment) {
      alert(
        'Esta transação representa o valor consolidado de uma fatura de cartão. Para gerenciar ou excluir os lançamentos, clique no botão "Ver fatura".',
      );
      return;
    }
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
      const monthStart = this.selectedMonth();
      const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
      const loadStart = this.considerPreviousBalance()
        ? new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1)
        : monthStart;
      const monthStartIso = formatIsoDate(monthStart);
      const monthEndIso = formatIsoDate(monthEnd);
      const selectedAccountId = this.selectedAccountId();

      await this.recurrenceService.runGenerationForRange(
        formatIsoDate(loadStart),
        monthEndIso,
      );

      const [accounts, categories, subcategories, tags] = await Promise.all([
        this.accountService.list(),
        this.categoryService.list(),
        this.subcategoryService.list(),
        this.tagService.list(),
      ]);
      const [transactions, openingBalance] = await Promise.all([
        selectedAccountId === 'all'
          ? this.transactionService.listByMonth(monthStartIso, monthEndIso)
          : this.transactionService.listByMonthForAccount(monthStartIso, monthEndIso, selectedAccountId),
        this.considerPreviousBalance()
          ? this.monthlyBalanceService.getPreviousMonthClosingBalance(
              monthStart,
              accounts,
              selectedAccountId,
            )
          : Promise.resolve(0),
      ]);

      this.transactions.set(transactions);
      this.openingBalance.set(openingBalance);
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
