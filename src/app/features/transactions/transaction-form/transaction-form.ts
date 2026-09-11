import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatRadioModule } from '@angular/material/radio';
import { MatIconModule } from '@angular/material/icon';
import { TransactionService } from '../../../core/services/transaction.service';
import { RecurrenceService } from '../../../core/services/recurrence.service';
import { AccountService } from '../../../core/services/account.service';
import { CategoryService } from '../../../core/services/category.service';
import { SubcategoryService } from '../../../core/services/subcategory.service';
import { TagService } from '../../../core/services/tag.service';
import { CreditCardService } from '../../../core/services/credit-card.service';
import { InvoiceService, UpcomingInvoiceOption } from '../../../core/services/invoice.service';
import {
  Account,
  Category,
  CreditCard,
  PaymentMethod,
  RecurrenceFrequency,
  RecurrenceEndType,
  Subcategory,
  Tag,
  Transaction,
  TransactionType,
} from '../../../models';
import { formatIsoDate, parseIsoDate } from '../../../shared/util/date.util';
import { RecurrenceScopeDialog } from '../recurrence-scope-dialog/recurrence-scope-dialog';

@Component({
  selector: 'app-transaction-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatDialogModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatRadioModule,
    MatIconModule,
  ],
  templateUrl: './transaction-form.html',
  styleUrl: './transaction-form.scss',
})
export class TransactionForm {
  private readonly fb = inject(FormBuilder);
  private readonly transactionService = inject(TransactionService);
  private readonly recurrenceService = inject(RecurrenceService);
  private readonly accountService = inject(AccountService);
  private readonly categoryService = inject(CategoryService);
  private readonly subcategoryService = inject(SubcategoryService);
  private readonly tagService = inject(TagService);
  private readonly creditCardService = inject(CreditCardService);
  private readonly invoiceService = inject(InvoiceService);
  private readonly dialog = inject(MatDialog);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly transactionId = this.route.snapshot.paramMap.get('id');
  readonly isEditMode = this.transactionId !== null;

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly accounts = signal<Account[]>([]);
  readonly cards = signal<CreditCard[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly subcategories = signal<Subcategory[]>([]);
  readonly tags = signal<Tag[]>([]);
  readonly upcomingInvoices = signal<UpcomingInvoiceOption[]>([]);
  readonly originalTransaction = signal<Transaction | null>(null);

  readonly form = this.fb.nonNullable.group({
    type: this.fb.nonNullable.control<TransactionType>('expense', Validators.required),
    paymentMethod: this.fb.nonNullable.control<PaymentMethod>('debit', Validators.required),
    description: ['', Validators.required],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    date: this.fb.nonNullable.control<Date>(new Date(), Validators.required),
    accountId: [''],
    destinationAccountId: [''],
    creditCardId: [''],
    installments: [1, [Validators.min(1), Validators.max(24)]],
    firstInvoiceDueDate: [''],
    categoryId: [''],
    subcategoryId: [''],
    tagIds: this.fb.nonNullable.control<string[]>([]),
    note: [''],
    isRecurring: this.fb.nonNullable.control(false),
    frequency: this.fb.nonNullable.control<RecurrenceFrequency>('monthly'),
    endType: this.fb.nonNullable.control<RecurrenceEndType>('indeterminate'),
    occurrenceCount: [1],
  });

  private readonly typeValue = toSignal(this.form.controls.type.valueChanges, {
    initialValue: this.form.controls.type.value,
  });
  readonly paymentMethodValue = toSignal(this.form.controls.paymentMethod.valueChanges, {
    initialValue: this.form.controls.paymentMethod.value,
  });
  private readonly categoryIdValue = toSignal(this.form.controls.categoryId.valueChanges, {
    initialValue: this.form.controls.categoryId.value,
  });
  private readonly accountIdValue = toSignal(this.form.controls.accountId.valueChanges, {
    initialValue: this.form.controls.accountId.value,
  });
  readonly isRecurringValue = toSignal(this.form.controls.isRecurring.valueChanges, {
    initialValue: this.form.controls.isRecurring.value,
  });
  readonly endTypeValue = toSignal(this.form.controls.endType.valueChanges, {
    initialValue: this.form.controls.endType.value,
  });

  readonly isTransfer = computed(() => this.typeValue() === 'transfer');
  readonly isExpense = computed(() => this.typeValue() === 'expense');
  readonly isCredit = computed(() => this.isExpense() && this.paymentMethodValue() === 'credit');

  readonly accountOptions = computed(() =>
    this.isEditMode ? this.accounts() : this.accounts().filter((a) => a.active),
  );
  readonly cardOptions = computed(() =>
    this.isEditMode ? this.cards() : this.cards().filter((c) => c.active),
  );
  readonly destinationAccountOptions = computed(() =>
    this.accountOptions().filter((a) => a.id !== this.accountIdValue()),
  );
  readonly categoryOptions = computed(() => {
    const byType = this.categories().filter((c) => c.type === this.typeValue());
    return this.isEditMode ? byType : byType.filter((c) => c.active);
  });
  readonly subcategoryOptions = computed(() => {
    const byCategory = this.subcategories().filter((s) => s.categoryId === this.categoryIdValue());
    return this.isEditMode ? byCategory : byCategory.filter((s) => s.active);
  });

  constructor() {
    this.form.controls.type.valueChanges.subscribe((type) => {
      this.form.patchValue({ categoryId: '', subcategoryId: '' });
      if (type !== 'expense') {
        this.form.patchValue({ paymentMethod: 'debit' });
      }
    });

    this.form.controls.categoryId.valueChanges.subscribe(() => {
      this.form.patchValue({ subcategoryId: '' });
    });

    this.form.controls.creditCardId.valueChanges.subscribe((cardId) => {
      this.updateUpcomingInvoices(cardId);
    });

    this.loadData();
  }

  private updateUpcomingInvoices(cardId: string): void {
    if (!cardId) {
      this.upcomingInvoices.set([]);
      this.form.patchValue({ firstInvoiceDueDate: '' });
      return;
    }
    const card = this.cards().find((c) => c.id === cardId);
    if (!card) {
      this.upcomingInvoices.set([]);
      return;
    }
    const options = this.invoiceService.getUpcomingInvoices(card, 3);
    this.upcomingInvoices.set(options);
    if (options.length > 0 && !this.form.controls.firstInvoiceDueDate.value) {
      this.form.patchValue({ firstInvoiceDueDate: options[0].dueDate });
    }
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const [accounts, cards, categories, subcategories, tags] = await Promise.all([
        this.accountService.list(),
        this.creditCardService.list(),
        this.categoryService.list(),
        this.subcategoryService.list(),
        this.tagService.list(),
      ]);
      this.accounts.set(accounts);
      this.cards.set(cards);
      this.categories.set(categories);
      this.subcategories.set(subcategories);
      this.tags.set(tags);

      if (this.transactionId) {
        const transaction = await this.transactionService.get(this.transactionId);
        if (!transaction) {
          this.errorMessage.set('Transação não encontrada.');
          return;
        }
        this.originalTransaction.set(transaction);
        this.form.patchValue(
          {
            type: transaction.type,
            paymentMethod: transaction.paymentMethod ?? 'debit',
            description: transaction.description,
            amount: transaction.amount / 100,
            date: parseIsoDate(transaction.date),
            accountId: transaction.accountId,
            destinationAccountId: transaction.destinationAccountId ?? '',
            creditCardId: transaction.creditCardId ?? '',
            categoryId: transaction.categoryId ?? '',
            subcategoryId: transaction.subcategoryId ?? '',
            tagIds: transaction.tagIds ?? [],
            note: transaction.note ?? '',
          },
          { emitEvent: false },
        );
        if (transaction.creditCardId) {
          this.updateUpcomingInvoices(transaction.creditCardId);
        }
        // data define qual ocorrência esta transação representa numa recorrência
        if (transaction.recurrenceId) {
          this.form.controls.date.disable();
        }
      }
    } catch (error) {
      console.error('Erro ao carregar dados do formulário', error);
      this.errorMessage.set('Não foi possível carregar os dados necessários.');
    } finally {
      this.loading.set(false);
    }
  }

  async submit(): Promise<void> {
    const rawCheck = this.form.getRawValue();
    const isCredit = this.isCredit();

    if (!isCredit && !rawCheck.accountId) {
      this.errorMessage.set('Informe a conta.');
      return;
    }

    if (isCredit) {
      if (!rawCheck.creditCardId) {
        this.errorMessage.set('Selecione o cartão de crédito.');
        return;
      }
      if (!rawCheck.firstInvoiceDueDate) {
        this.errorMessage.set('Selecione a fatura para lançamento.');
        return;
      }
    }

    if (this.form.controls.description.invalid || this.form.controls.amount.invalid || this.form.controls.date.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    if (this.isTransfer() && rawCheck.accountId === rawCheck.destinationAccountId) {
      this.errorMessage.set('A conta de destino deve ser diferente da conta de origem.');
      return;
    }

    if (rawCheck.isRecurring && rawCheck.endType === 'count' && rawCheck.occurrenceCount < 1) {
      this.errorMessage.set('Informe um número de repetições válido.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    const raw = this.form.getRawValue();
    const isTransfer = raw.type === 'transfer';

    try {
      if (this.isEditMode && this.transactionId) {
        // Modo edição
        const original = this.originalTransaction();
        const data = {
          type: raw.type,
          paymentMethod: raw.paymentMethod,
          description: raw.description,
          amount: Math.round(raw.amount * 100),
          date: formatIsoDate(raw.date),
          accountId: raw.accountId,
          destinationAccountId: isTransfer ? raw.destinationAccountId : undefined,
          categoryId: !isTransfer ? raw.categoryId || undefined : undefined,
          subcategoryId: !isTransfer ? raw.subcategoryId || undefined : undefined,
          tagIds: !isTransfer ? raw.tagIds : undefined,
          note: raw.note || undefined,
        };

        if (original?.recurrenceId) {
          const scope = await this.askRecurrenceScope('edit');
          if (!scope) {
            this.loading.set(false);
            return;
          }
          await this.recurrenceService.applyEdit(original, data, scope);
        } else {
          await this.transactionService.update(this.transactionId, data);
          if (original?.invoiceId) {
            await this.invoiceService.recalculate(original.invoiceId);
          }
        }
      } else if (isCredit) {
        // Criação de compra no crédito (à vista ou parcelada)
        await this.createCreditTransaction(raw);
      } else if (raw.isRecurring) {
        // Criação com recorrência
        await this.recurrenceService.create({
          type: raw.type,
          description: raw.description,
          amount: Math.round(raw.amount * 100),
          accountId: raw.accountId,
          destinationAccountId: isTransfer ? raw.destinationAccountId : undefined,
          categoryId: !isTransfer ? raw.categoryId || undefined : undefined,
          subcategoryId: !isTransfer ? raw.subcategoryId || undefined : undefined,
          tagIds: !isTransfer ? raw.tagIds : undefined,
          note: raw.note || undefined,
          frequency: raw.frequency,
          startDate: formatIsoDate(raw.date),
          endType: raw.endType,
          occurrenceCount: raw.endType === 'count' ? raw.occurrenceCount : undefined,
        });
      } else {
        // Criação normal (débito / receita / transferência)
        await this.transactionService.create({
          type: raw.type,
          paymentMethod: raw.paymentMethod,
          description: raw.description,
          amount: Math.round(raw.amount * 100),
          date: formatIsoDate(raw.date),
          accountId: raw.accountId,
          destinationAccountId: isTransfer ? raw.destinationAccountId : undefined,
          categoryId: !isTransfer ? raw.categoryId || undefined : undefined,
          subcategoryId: !isTransfer ? raw.subcategoryId || undefined : undefined,
          tagIds: !isTransfer ? raw.tagIds : undefined,
          note: raw.note || undefined,
        });
      }

      await this.router.navigateByUrl('/transactions');
    } catch (error) {
      console.error('Erro ao salvar transação', error);
      this.errorMessage.set('Não foi possível salvar a transação. Tente novamente.');
    } finally {
      this.loading.set(false);
    }
  }

  private async createCreditTransaction(raw: ReturnType<typeof this.form.getRawValue>): Promise<void> {
    const card = this.cards().find((c) => c.id === raw.creditCardId);
    if (!card) throw new Error('Cartão de crédito não encontrado.');

    const totalAmount = Math.round(raw.amount * 100);
    const installments = Math.max(1, Math.min(24, Number(raw.installments) || 1));
    const firstDueDate = raw.firstInvoiceDueDate;
    const purchaseDate = formatIsoDate(raw.date);

    if (installments === 1) {
      // 1x (à vista no crédito)
      const invoice = await this.invoiceService.getOrCreate(card.id, firstDueDate);
      await this.transactionService.create({
        type: 'expense',
        paymentMethod: 'credit',
        description: raw.description,
        amount: totalAmount,
        date: purchaseDate,
        accountId: card.debitAccountId,
        creditCardId: card.id,
        invoiceId: invoice.id,
        categoryId: raw.categoryId || undefined,
        subcategoryId: raw.subcategoryId || undefined,
        tagIds: raw.tagIds.length ? raw.tagIds : undefined,
        note: raw.note || undefined,
      });
      await this.invoiceService.recalculate(invoice.id);
    } else {
      // Parcelado em N vezes
      const groupId = `inst_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const baseAmount = Math.floor(totalAmount / installments);
      const remainder = totalAmount - baseAmount * installments;

      const affectedInvoiceIds = new Set<string>();

      for (let k = 1; k <= installments; k++) {
        const dueDateK = this.computeDueDateStep(firstDueDate, k - 1, card.dueDay);
        const invoiceK = await this.invoiceService.getOrCreate(card.id, dueDateK);
        affectedInvoiceIds.add(invoiceK.id);

        const installmentAmount = k === 1 ? baseAmount + remainder : baseAmount;

        await this.transactionService.create({
          type: 'expense',
          paymentMethod: 'credit',
          description: `${raw.description} (${k}/${installments})`,
          amount: installmentAmount,
          date: purchaseDate,
          accountId: card.debitAccountId,
          creditCardId: card.id,
          invoiceId: invoiceK.id,
          installmentGroupId: groupId,
          installmentNumber: k,
          installmentTotal: installments,
          categoryId: raw.categoryId || undefined,
          subcategoryId: raw.subcategoryId || undefined,
          tagIds: raw.tagIds.length ? raw.tagIds : undefined,
          note: raw.note || undefined,
        });
      }

      for (const invId of affectedInvoiceIds) {
        await this.invoiceService.recalculate(invId);
      }
    }
  }

  private computeDueDateStep(firstDueDateIso: string, offsetMonths: number, dueDay: number): string {
    const firstDate = parseIsoDate(firstDueDateIso);
    let y = firstDate.getFullYear();
    let m = firstDate.getMonth() + offsetMonths;
    y += Math.floor(m / 12);
    m = m % 12;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const day = Math.min(dueDay, lastDay);
    const mm = String(m + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  }

  private async askRecurrenceScope(action: 'edit' | 'delete') {
    const ref = this.dialog.open(RecurrenceScopeDialog, { data: { action }, width: '360px' });
    return firstValueFrom(ref.afterClosed());
  }
}
