import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { CreditCardService } from '../../../core/services/credit-card.service';
import { AccountService } from '../../../core/services/account.service';
import { Account } from '../../../models';

@Component({
  selector: 'app-credit-card-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
  ],
  templateUrl: './credit-card-form.html',
  styleUrl: './credit-card-form.scss',
})
export class CreditCardForm {
  private readonly fb = inject(FormBuilder);
  private readonly creditCardService = inject(CreditCardService);
  private readonly accountService = inject(AccountService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly cardId = this.route.snapshot.paramMap.get('id');
  readonly isEditMode = this.cardId !== null;

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly accounts = signal<Account[]>([]);

  /** ao criar: somente contas ativas; ao editar: todas as contas */
  readonly accountOptions = computed(() =>
    this.isEditMode ? this.accounts() : this.accounts().filter((a) => a.active),
  );

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    dueDay: [10, [Validators.required, Validators.min(1), Validators.max(31)]],
    debitAccountId: ['', Validators.required],
  });

  constructor() {
    this.loadData();
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const accounts = await this.accountService.list();
      this.accounts.set(accounts);

      if (this.cardId) {
        const card = await this.creditCardService.get(this.cardId);
        if (!card) {
          this.errorMessage.set('Cartão de crédito não encontrado.');
          return;
        }
        this.form.patchValue({
          name: card.name,
          dueDay: card.dueDay,
          debitAccountId: card.debitAccountId,
        });
      }
    } catch (error) {
      console.error('Erro ao carregar dados do cartão', error);
      this.errorMessage.set('Não foi possível carregar as informações.');
    } finally {
      this.loading.set(false);
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
      dueDay: Number(raw.dueDay),
      debitAccountId: raw.debitAccountId,
    };

    try {
      if (this.isEditMode && this.cardId) {
        await this.creditCardService.update(this.cardId, data);
      } else {
        await this.creditCardService.create({ ...data, active: true });
      }
      await this.router.navigateByUrl('/credit-cards');
    } catch (error) {
      console.error('Erro ao salvar cartão de crédito', error);
      this.errorMessage.set('Não foi possível salvar o cartão de crédito. Tente novamente.');
    } finally {
      this.loading.set(false);
    }
  }
}

