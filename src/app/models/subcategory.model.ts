import { EntityId } from './user.model';

export interface Subcategory {
  id: EntityId;
  userId: EntityId;
  categoryId: EntityId;
  name: string;
  active: boolean;
}
