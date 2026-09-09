import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { RecurrenceScope } from '../../../core/services/recurrence.service';

export interface RecurrenceScopeDialogData {
  action: 'edit' | 'delete';
}

@Component({
  selector: 'app-recurrence-scope-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  templateUrl: './recurrence-scope-dialog.html',
})
export class RecurrenceScopeDialog {
  private readonly dialogRef = inject(MatDialogRef<RecurrenceScopeDialog>);
  readonly data = inject<RecurrenceScopeDialogData>(MAT_DIALOG_DATA);

  choose(scope: RecurrenceScope): void {
    this.dialogRef.close(scope);
  }
}
