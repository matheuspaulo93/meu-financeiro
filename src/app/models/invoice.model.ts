import { EntityId } from './user.model';

export type InvoiceStatus = 'open' | 'paid';

export interface Invoice {
  id: EntityId;
  userId: EntityId;
  creditCardId: EntityId;
  /** data ISO (yyyy-MM-dd) de vencimento */
  dueDate: string;
  status: InvoiceStatus;
  /** valor total em centavos, soma das transações vinculadas */
  total: number;
  /** valor efetivamente pago em centavos */
  paidAmount?: number;
  paidAt?: string;
  paymentTransactionId?: EntityId;
}
