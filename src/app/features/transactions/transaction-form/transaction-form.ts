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
import {
  Account,
  Category,
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
  private readonly dialog = inject(MatDialog);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly transactionId = this.route.snapshot.paramMap.get('id');
  readonly isEditMode = this.transactionId !== null;

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly accounts = signal<Account[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly subcategories = signal<Subcategory[]>([]);
  readonly tags = signal<Tag[]>([]);
  readonly originalTransaction = signal<Transaction | null>(null);

  readonly form = this.fb.nonNullable.group({
    type: this.fb.nonNullable.control<TransactionType>('expense', Validators.required),
    description: ['', Validators.required],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    date: this.fb.nonNullable.control<Date>(new Date(), Validators.required),
    accountId: ['', Validators.required],
    destinationAccountId: [''],
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

  readonly accountOptions = computed(() =>
    this.isEditMode ? this.accounts() : this.accounts().filter((a) => a.active),
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
    this.form.controls.type.valueChanges.subscribe(() => {
      this.form.patchValue({ categoryId: '', subcategoryId: '' });
    });
    this.form.controls.categoryId.valueChanges.subscribe(() => {
      this.form.patchValue({ subcategoryId: '' });
    });

    this.loadData();
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const [accounts, categories, subcategories, tags] = await Promise.all([
        this.accountService.list(),
        this.categoryService.list(),
        this.subcategoryService.list(),
        this.tagService.list(),
      ]);
      this.accounts.set(accounts);
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
            description: transaction.description,
            amount: transaction.amount / 100,
            date: parseIsoDate(transaction.date),
            accountId: transaction.accountId,
            destinationAccountId: transaction.destinationAccountId ?? '',
            categoryId: transaction.categoryId ?? '',
            subcategoryId: transaction.subcategoryId ?? '',
            tagIds: transaction.tagIds ?? [],
            note: transaction.note ?? '',
          },
          { emitEvent: false },
        );
        // data define qual ocorrência esta transação representa; não deve mudar numa recorrência
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
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const rawCheck = this.form.getRawValue();
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
    const data = {
      type: raw.type,
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

    try {
      if (this.isEditMode && this.transactionId) {
        const original = this.originalTransaction();
        if (original?.recurrenceId) {
          const scope = await this.askRecurrenceScope('edit');
          if (!scope) {
            this.loading.set(false);
            return;
          }
          await this.recurrenceService.applyEdit(original, data, scope);
        } else {
          await this.transactionService.update(this.transactionId, data);
        }
      } else if (raw.isRecurring) {
        await this.recurrenceService.create({
          type: data.type,
          description: data.description,
          amount: data.amount,
          accountId: data.accountId,
          destinationAccountId: data.destinationAccountId,
          categoryId: data.categoryId,
          subcategoryId: data.subcategoryId,
          tagIds: data.tagIds,
          note: data.note,
          frequency: raw.frequency,
          startDate: data.date,
          endType: raw.endType,
          occurrenceCount: raw.endType === 'count' ? raw.occurrenceCount : undefined,
        });
      } else {
        await this.transactionService.create(data);
      }
      await this.router.navigateByUrl('/transactions');
    } catch (error) {
      console.error('Erro ao salvar transação', error);
      this.errorMessage.set('Não foi possível salvar a transação. Tente novamente.');
    } finally {
      this.loading.set(false);
    }
  }

  private async askRecurrenceScope(action: 'edit' | 'delete') {
    const ref = this.dialog.open(RecurrenceScopeDialog, { data: { action }, width: '360px' });
    return firstValueFrom(ref.afterClosed());
  }
}
