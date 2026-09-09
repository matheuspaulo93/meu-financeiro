import { EntityId } from './user.model';

export interface Tag {
  id: EntityId;
  userId: EntityId;
  name: string;
}
