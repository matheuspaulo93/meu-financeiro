import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';
import { AccountService } from '../../../core/services/account.service';
import { AccountType } from '../../../models';
import { formatIsoDate, parseIsoDate } from '../../../shared/util/date.util';

const ACCOUNT_TYPE_OPTIONS: { value: AccountType; label: string }[] = [
  { value: 'checking', label: 'Conta corrente' },
  { value: 'savings', label: 'Poupança' },
  { value: 'wallet', label: 'Carteira' },
  { value: 'investment', label: 'Investimentos' },
  { value: 'cash', label: 'Dinheiro em espécie' },
  { value: 'other', label: 'Outros' },
];

@Component({
  selector: 'app-account-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatButtonModule,
  ],
  templateUrl: './account-form.html',
  styleUrl: './account-form.scss',
})
export class AccountForm {
  private readonly fb = inject(FormBuilder);
  private readonly accountService = inject(AccountService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly typeOptions = ACCOUNT_TYPE_OPTIONS;
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly accountId = this.route.snapshot.paramMap.get('id');
  readonly isEditMode = this.accountId !== null;

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    institution: [''],
    type: this.fb.nonNullable.control<AccountType>('checking', Validators.required),
    initialBalance: [0, Validators.required],
    initialBalanceDate: this.fb.nonNullable.control<Date>(new Date(), Validators.required),
    color: [''],
    icon: [''],
  });

  constructor() {
    if (this.accountId) {
      this.loading.set(true);
      this.accountService
        .get(this.accountId)
        .then((account) => {
          if (!account) {
            this.errorMessage.set('Conta não encontrada.');
            return;
          }
          this.form.patchValue({
            name: account.name,
            institution: account.institution ?? '',
            type: account.type,
            initialBalance: account.initialBalance / 100,
            initialBalanceDate: parseIsoDate(account.initialBalanceDate),
            color: account.color ?? '',
            icon: account.icon ?? '',
          });
        })
        .catch((error: unknown) => {
          console.error('Erro ao carregar conta', error);
          this.errorMessage.set('Não foi possível carregar a conta.');
        })
        .finally(() => this.loading.set(false));
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    const raw = this.form.getRawValue();
    const data = {
      name: raw.name,
      institution: raw.institution || undefined,
      type: raw.type,
      initialBalance: Math.round(raw.initialBalance * 100),
      initialBalanceDate: formatIsoDate(raw.initialBalanceDate),
      color: raw.color || undefined,
      icon: raw.icon || undefined,
    };

    try {
      if (this.isEditMode && this.accountId) {
        await this.accountService.update(this.accountId, data);
      } else {
        await this.accountService.create({ ...data, active: true });
      }
      await this.router.navigateByUrl('/accounts');
    } catch (error) {
      console.error('Erro ao salvar conta', error);
      this.errorMessage.set('Não foi possível salvar a conta. Tente novamente.');
    } finally {
      this.loading.set(false);
    }
  }
}
