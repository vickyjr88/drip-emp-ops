/**
 * What each importer accepts.
 *
 * One definition per entity rather than one service each: the validate/commit
 * flow, the CSV template and the whole UI are identical, so the differences are
 * data. Adding a seventh entity is an entry here, not a new module.
 */
export type ImportFieldType = 'string' | 'number' | 'boolean' | 'email' | 'decimalPercent';

export type ImportField = {
  name: string;
  label: string;
  type: ImportFieldType;
  required?: boolean;
  /** Shown in the template so whoever fills it in knows what is expected. */
  hint?: string;
  example?: string;
  min?: number;
  max?: number;
};

export type ImportDefinition = {
  key: string;
  label: string;
  /** Prisma model accessor, e.g. prisma[model]. */
  model: string;
  permissionSubject: string;
  description: string;
  fields: ImportField[];
  /**
   * Field whose value must be unique. Rows colliding with an existing record,
   * or with each other, are reported rather than silently duplicated.
   */
  uniqueBy?: string;
  /** Extra guidance shown in the template header. */
  notes?: string[];
};

export const IMPORT_DEFINITIONS: ImportDefinition[] = [
  {
    key: 'customers',
    label: 'Customers',
    model: 'customer',
    permissionSubject: 'Customer',
    description: 'Buyers and tenants.',
    uniqueBy: 'email',
    fields: [
      { name: 'firstName', label: 'First Name', type: 'string', required: true, example: 'David' },
      { name: 'lastName', label: 'Last Name', type: 'string', required: true, example: 'Owino' },
      { name: 'email', label: 'Email', type: 'email', required: true, example: 'david.owino@example.com' },
      { name: 'phone', label: 'Phone', type: 'string', required: true, example: '+254711000000' },
    ],
    notes: ['Email must be unique: it is how a customer signs in to their account portal.'],
  },
  {
    key: 'suppliers',
    label: 'Suppliers',
    model: 'supplier',
    permissionSubject: 'Supplier',
    description: 'Vendors invoiced through accounts payable.',
    uniqueBy: 'name',
    fields: [
      { name: 'name', label: 'Name', type: 'string', required: true, example: 'Somo Steel Ltd' },
      { name: 'contactName', label: 'Contact Person', type: 'string' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'phone', label: 'Phone', type: 'string' },
      { name: 'kraPin', label: 'KRA PIN', type: 'string' },
      {
        name: 'paymentTermsDays',
        label: 'Payment Terms (days)',
        type: 'number',
        hint: 'Defaults to 30',
        min: 0,
        max: 365,
      },
    ],
  },
  {
    key: 'users',
    label: 'Staff Users',
    model: 'user',
    permissionSubject: 'User',
    description: 'Staff who sign in to this portal.',
    uniqueBy: 'email',
    fields: [
      { name: 'name', label: 'Full Name', type: 'string', required: true, example: 'Amina Hassan' },
      { name: 'email', label: 'Email', type: 'email', required: true, example: 'amina@dripemporium.store' },
      {
        name: 'password',
        label: 'Initial Password',
        type: 'string',
        required: true,
        hint: 'At least 8 characters. Hashed on import and never stored as typed.',
      },
    ],
    notes: [
      'Imported users have no roles and therefore no permissions until roles are assigned in RBAC.',
      'Delete the file after importing: it contains passwords in plain text.',
    ],
  },
];

export function findDefinition(key: string) {
  return IMPORT_DEFINITIONS.find((definition) => definition.key === key);
}
