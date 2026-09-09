import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { CategoryService } from '../../../core/services/category.service';
import { Category, CategoryType } from '../../../models';

export interface CategoryDialogData {
  category: Category | null;
}

const TYPE_OPTIONS: { value: CategoryType; label: string }[] = [
  { value: 'income', label: 'Receita' },
  { value: 'expense', label: 'Despesa' },
];

@Component({
  selector: 'app-category-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
  ],
  templateUrl: './category-dialog.html',
  styleUrl: './category-dialog.scss',
})
export class CategoryDialog {
  private readonly fb = inject(FormBuilder);
  private readonly categoryService = inject(CategoryService);
  private readonly dialogRef = inject(MatDialogRef<CategoryDialog>);
  private readonly data = inject<CategoryDialogData>(MAT_DIALOG_DATA);

  readonly typeOptions = TYPE_OPTIONS;
  readonly isEditMode = this.data.category !== null;
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: [this.data.category?.name ?? '', Validators.required],
    type: this.fb.nonNullable.control<CategoryType>(
      this.data.category?.type ?? 'expense',
      Validators.required,
    ),
  });

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    const raw = this.form.getRawValue();

    try {
      if (this.isEditMode && this.data.category) {
        await this.categoryService.update(this.data.category.id, raw);
      } else {
        await this.categoryService.create({ ...raw, active: true });
      }
      this.dialogRef.close(true);
    } catch (error) {
      console.error('Erro ao salvar categoria', error);
      this.errorMessage.set('Não foi possível salvar a categoria. Tente novamente.');
    } finally {
      this.loading.set(false);
    }
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
