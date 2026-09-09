import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { SubcategoryService } from '../../../core/services/subcategory.service';
import { Subcategory } from '../../../models';

export interface SubcategoryDialogData {
  categoryId: string;
  subcategory: Subcategory | null;
}

@Component({
  selector: 'app-subcategory-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  templateUrl: './subcategory-dialog.html',
  styleUrl: './subcategory-dialog.scss',
})
export class SubcategoryDialog {
  private readonly fb = inject(FormBuilder);
  private readonly subcategoryService = inject(SubcategoryService);
  private readonly dialogRef = inject(MatDialogRef<SubcategoryDialog>);
  private readonly data = inject<SubcategoryDialogData>(MAT_DIALOG_DATA);

  readonly isEditMode = this.data.subcategory !== null;
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: [this.data.subcategory?.name ?? '', Validators.required],
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
      if (this.isEditMode && this.data.subcategory) {
        await this.subcategoryService.update(this.data.subcategory.id, raw);
      } else {
        await this.subcategoryService.create({
          ...raw,
          categoryId: this.data.categoryId,
          active: true,
        });
      }
      this.dialogRef.close(true);
    } catch (error) {
      console.error('Erro ao salvar subcategoria', error);
      this.errorMessage.set('Não foi possível salvar a subcategoria. Tente novamente.');
    } finally {
      this.loading.set(false);
    }
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
