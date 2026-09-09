export type EntityId = string;

export interface AppUser {
  id: EntityId;
  email: string;
  displayName?: string;
}
