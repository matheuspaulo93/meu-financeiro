import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

export interface InstallmentScopeData {
  action: 'edit' | 'delete';
  installmentNumber: number;
  installmentTotal: number;
}

export type InstallmentScope = 'only' | 'future';

@Component({
  selector: 'app-installment-scope-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  templateUrl: './installment-scope-dialog.html',
  styleUrl: './installment-scope-dialog.scss',
})
export class InstallmentScopeDialog {
  readonly dialogRef = inject(MatDialogRef<InstallmentScopeDialog, InstallmentScope>);
  readonly data = inject<InstallmentScopeData>(MAT_DIALOG_DATA);

  choose(scope: InstallmentScope): void {
    this.dialogRef.close(scope);
  }
}

