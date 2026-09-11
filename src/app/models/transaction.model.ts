import { EntityId } from './user.model';

export type TransactionType = 'income' | 'expense' | 'transfer';
export type PaymentMethod = 'debit' | 'credit';

export interface Transaction {
  id: EntityId;
  userId: EntityId;
  type: TransactionType;
  description: string;
  /** valor em centavos, sempre positivo */
  amount: number;
  /** data ISO (yyyy-MM-dd) */
  date: string;
  /** conta normal (income/expense) ou conta de origem (transfer) */
  accountId: EntityId;
  /** somente quando type === 'transfer': conta de destino */
  destinationAccountId?: EntityId;
  categoryId?: EntityId;
  subcategoryId?: EntityId;
  tagIds?: EntityId[];
  note?: string;
  /** forma de pagamento para despesas: débito ou crédito */
  paymentMethod?: PaymentMethod;
  /** preenchido quando a transação é uma compra de cartão ou a transação consolidada da fatura */
  creditCardId?: EntityId;
  /** fatura à qual a compra de cartão pertence */
  invoiceId?: EntityId;
  /** identificador do grupo de parcelas (para compras parceladas) */
  installmentGroupId?: string;
  /** número da parcela (1, 2, ...) */
  installmentNumber?: number;
  /** total de parcelas da compra (ex.: 3) */
  installmentTotal?: number;
  /** indica que esta transação é o débito consolidado da fatura na conta corrente */
  isInvoicePayment?: boolean;
  /** preenchido quando a transação foi gerada (ou faz parte de) uma recorrência */
  recurrenceId?: EntityId;
  createdAt: string;
  updatedAt: string;
}
