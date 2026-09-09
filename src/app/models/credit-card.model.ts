import { EntityId } from './user.model';

export interface CreditCard {
  id: EntityId;
  userId: EntityId;
  name: string;
  /** dia de vencimento da fatura (1-31) */
  dueDay: number;
  debitAccountId: EntityId;
  active: boolean;
}
