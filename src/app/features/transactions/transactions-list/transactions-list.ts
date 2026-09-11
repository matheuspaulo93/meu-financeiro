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
import { firstValueFrom } from 'rxjs';
import { TransactionService } from '../../../core/services/transaction.service';
import { RecurrenceService } from '../../../core/services/recurrence.service';
import { AccountService } from '../../../core/services/account.service';
import { CategoryService } from '../../../core/services/category.service';
import { SubcategoryService } from '../../../core/services/subcategory.service';
import { TagService } from '../../../core/services/tag.service';
import { Account, Category, Subcategory, Tag, Transaction } from '../../../models';
import { formatIsoDate, parseIsoDate } from '../../../shared/util/date.util';
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
  readonly selectedAccountId = signal<string>('all');

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
    const accounts = this.accounts();
    const accId = this.selectedAccountId();
    const monthStart = this.selectedMonth();
    const monthStartIso = formatIsoDate(monthStart);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    const monthEndIso = formatIsoDate(monthEnd);

    // 1. Determina a base do saldo inicial histórico
    let baseInitialBalance = 0;
    if (accId === 'all') {
      // Saldo consolidado = soma dos saldos iniciais de todas as contas ativas
      baseInitialBalance = accounts.filter((a) => a.active).reduce((sum, a) => sum + a.initialBalance, 0);
    } else {
      const selectedAcc = accounts.find((a) => a.id === accId);
      baseInitialBalance = selectedAcc ? selectedAcc.initialBalance : 0;
    }

    // Helper: calcula a variação líquida que uma transação gera na conta ou no consolidado
    const computeTxDelta = (t: Transaction): number => {
      // Compras de cartão de crédito não abatem saldo da conta até a fatura vencer
      if (t.invoiceId && !t.isInvoicePayment) {
        return 0;
      }

      if (accId === 'all') {
        // No consolidado: transferências entre contas do usuário se anulam (delta = 0)
        if (t.type === 'income') return t.amount;
        if (t.type === 'expense') return -t.amount;
        return 0;
      } else {
        // Para uma conta específica:
        if (t.accountId === accId) {
          if (t.type === 'income') return t.amount;
          if (t.type === 'expense') return -t.amount;
          if (t.type === 'transfer') return -t.amount; // saída
        }
        if (t.destinationAccountId === accId && t.type === 'transfer') {
          return t.amount; // entrada
        }
        return 0;
      }
    };

    // 2. Calcula o saldo de abertura antes do início do mês selecionado
    let runningBalance = baseInitialBalance;
    for (const t of allTxs) {
      if (t.date < monthStartIso) {
        runningBalance += computeTxDelta(t);
      }
    }

    // 3. Filtra e ordena as transações do mês selecionado (menor para maior)
    const monthTxs = allTxs
      .filter((t) => {
        // Ignora compras avulsas de cartão (aparecem dentro da fatura)
        if (t.invoiceId && !t.isInvoicePayment) {
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

    // 4. Agrupa por dia
    const txsByDate = new Map<string, Transaction[]>();
    for (const t of monthTxs) {
      const list = txsByDate.get(t.date) ?? [];
      list.push(t);
      txsByDate.set(t.date, list);
    }

    // 5. Constrói as linhas da tabela com o agrupador de cada dia
    const rows: TableRowItem[] = [];
    const sortedDates = Array.from(txsByDate.keys()).sort((a, b) => a.localeCompare(b));

    for (const dateIso of sortedDates) {
      const dayTxs = txsByDate.get(dateIso)!;
      let dayIncome = 0;
      let dayExpense = 0;

      for (const t of dayTxs) {
        rows.push({ kind: 'transaction', transaction: t });
        const delta = computeTxDelta(t);
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
