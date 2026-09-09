import { EntityId } from './user.model';

export type AccountType = 'checking' | 'savings' | 'wallet' | 'investment' | 'cash' | 'other';

export interface Account {
  id: EntityId;
  userId: EntityId;
  name: string;
  institution?: string;
  type: AccountType;
  /** valor em centavos */
  initialBalance: number;
  /** data ISO (yyyy-MM-dd) */
  initialBalanceDate: string;
  active: boolean;
  color?: string;
  icon?: string;
}
