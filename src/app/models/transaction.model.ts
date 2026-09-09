import { EntityId } from './user.model';

export type TransactionType = 'income' | 'expense' | 'transfer';

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
  /** preenchido quando a transação é uma compra de cartão */
  creditCardId?: EntityId;
  /** fatura à qual a compra de cartão pertence */
  invoiceId?: EntityId;
  /** preenchido quando a transação foi gerada (ou faz parte de) uma recorrência */
  recurrenceId?: EntityId;
  createdAt: string;
  updatedAt: string;
}
