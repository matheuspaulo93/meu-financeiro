import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { TagService } from '../../../core/services/tag.service';
import { Tag } from '../../../models';

export interface TagDialogData {
  tag: Tag | null;
}

@Component({
  selector: 'app-tag-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  templateUrl: './tag-dialog.html',
  styleUrl: './tag-dialog.scss',
})
export class TagDialog {
  private readonly fb = inject(FormBuilder);
  private readonly tagService = inject(TagService);
  private readonly dialogRef = inject(MatDialogRef<TagDialog>);
  private readonly data = inject<TagDialogData>(MAT_DIALOG_DATA);

  readonly isEditMode = this.data.tag !== null;
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: [this.data.tag?.name ?? '', Validators.required],
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
      if (this.isEditMode && this.data.tag) {
        await this.tagService.update(this.data.tag.id, raw);
      } else {
        await this.tagService.create(raw);
      }
      this.dialogRef.close(true);
    } catch (error) {
      console.error('Erro ao salvar tag', error);
      this.errorMessage.set('Não foi possível salvar a tag. Tente novamente.');
    } finally {
      this.loading.set(false);
    }
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
