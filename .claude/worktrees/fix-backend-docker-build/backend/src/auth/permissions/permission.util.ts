export const CRUD_ACTIONS = ['create', 'read', 'update', 'delete'] as const;

export type CrudAction = (typeof CRUD_ACTIONS)[number];

export function normalizePermissionSubject(subject: string) {
  return subject
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}

export function buildPermissionKey(subject: string, action: CrudAction | string) {
  return `${normalizePermissionSubject(subject)}.${action.toLowerCase()}`;
}