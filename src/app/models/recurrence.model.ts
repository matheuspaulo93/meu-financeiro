import { EntityId } from './user.model';
import { TransactionType } from './transaction.model';

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly';
export type RecurrenceEndType = 'indeterminate' | 'count';

export interface Recurrence {
  id: EntityId;
  userId: EntityId;
  type: TransactionType;
  description: string;
  /** valor em centavos */
  amount: number;
  /** conta normal (income/expense) ou conta de origem (transfer) */
  accountId: EntityId;
  /** somente quando type === 'transfer': conta de destino */
  destinationAccountId?: EntityId;
  categoryId?: EntityId;
  subcategoryId?: EntityId;
  tagIds?: EntityId[];
  note?: string;
  frequency: RecurrenceFrequency;
  /** data ISO (yyyy-MM-dd) da primeira ocorrência */
  startDate: string;
  endType: RecurrenceEndType;
  /** obrigatório quando endType === 'count' */
  occurrenceCount?: number;
  /** data ISO; se definida, ocorrências nesta data ou depois deixam de ser geradas ("esta e as futuras") */
  canceledFrom?: string;
  /** datas ISO específicas puladas na geração ("somente esta") */
  excludedDates?: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}
