import { EntityId } from './user.model';

export type CategoryType = 'income' | 'expense';

export interface Category {
  id: EntityId;
  userId: EntityId;
  name: string;
  type: CategoryType;
  active: boolean;
}
