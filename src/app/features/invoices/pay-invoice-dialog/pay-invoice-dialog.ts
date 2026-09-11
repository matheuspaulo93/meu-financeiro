import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';
import { Invoice } from '../../../models';
import { formatIsoDate, parseIsoDate } from '../../../shared/util/date.util';

export interface PayInvoiceDialogData {
  invoice: Invoice;
  cardName: string;
}

export interface PayInvoiceDialogResult {
  paidAt: string;
  paidAmount: number;
}

@Component({
  selector: 'app-pay-invoice-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatButtonModule,
  ],
  templateUrl: './pay-invoice-dialog.html',
  styleUrl: './pay-invoice-dialog.scss',
})
export class PayInvoiceDialog {
  private readonly fb = inject(FormBuilder);
  readonly dialogRef = inject(MatDialogRef<PayInvoiceDialog, PayInvoiceDialogResult>);
  readonly data = inject<PayInvoiceDialogData>(MAT_DIALOG_DATA);

  readonly form = this.fb.nonNullable.group({
    paidAt: this.fb.nonNullable.control<Date>(
      this.data.invoice.paidAt ? parseIsoDate(this.data.invoice.paidAt) : new Date(),
      Validators.required,
    ),
    paidAmount: [
      (this.data.invoice.paidAmount ?? this.data.invoice.total) / 100,
      [Validators.required, Validators.min(0.01)],
    ],
  });

  confirm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    this.dialogRef.close({
      paidAt: formatIsoDate(raw.paidAt),
      paidAmount: Math.round(raw.paidAmount * 100),
    });
  }
}

