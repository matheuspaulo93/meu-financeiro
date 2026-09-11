import { Component, computed, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { Category, Subcategory, Tag, Transaction } from '../../../models';

export interface EditCardItemDialogData {
  transaction: Transaction;
  categories: Category[];
  subcategories: Subcategory[];
  tags: Tag[];
}

export interface EditCardItemDialogResult {
  description: string;
  amount: number; // em centavos
  categoryId?: string;
  subcategoryId?: string;
  tagIds?: string[];
}

@Component({
  selector: 'app-edit-card-item-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
  ],
  templateUrl: './edit-card-item-dialog.html',
  styleUrl: './edit-card-item-dialog.scss',
})
export class EditCardItemDialog {
  private readonly fb = inject(FormBuilder);
  readonly dialogRef = inject(MatDialogRef<EditCardItemDialog, EditCardItemDialogResult>);
  readonly data = inject<EditCardItemDialogData>(MAT_DIALOG_DATA);

  readonly form = this.fb.nonNullable.group({
    description: [this.cleanDescription(this.data.transaction.description), Validators.required],
    amount: [this.data.transaction.amount / 100, [Validators.required, Validators.min(0.01)]],
    categoryId: [this.data.transaction.categoryId ?? ''],
    subcategoryId: [this.data.transaction.subcategoryId ?? ''],
    tagIds: this.fb.nonNullable.control<string[]>(this.data.transaction.tagIds ?? []),
  });

  readonly availableCategories = computed(() =>
    this.data.categories.filter((c) => c.type === 'expense'),
  );

  readonly availableSubcategories = computed(() => {
    const selectedCat = this.form.controls.categoryId.value;
    return this.data.subcategories.filter((s) => s.categoryId === selectedCat);
  });

  constructor() {
    this.form.controls.categoryId.valueChanges.subscribe(() => {
      this.form.patchValue({ subcategoryId: '' });
    });
  }

  private cleanDescription(desc: string): string {
    // Se a descrição termina com (X/Y), remove para facilitar edição
    return desc.replace(/\s*\(\d+\/\d+\)$/, '').trim();
  }

  confirm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.dialogRef.close({
      description: raw.description,
      amount: Math.round(raw.amount * 100),
      categoryId: raw.categoryId || undefined,
      subcategoryId: raw.subcategoryId || undefined,
      tagIds: raw.tagIds.length ? raw.tagIds : undefined,
    });
  }
}

