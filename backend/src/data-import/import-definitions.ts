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
    key: 'projects',
    label: 'Projects',
    model: 'project',
    permissionSubject: 'Project',
    description: 'Developments. Blocks and units are added separately once a project exists.',
    uniqueBy: 'code',
    fields: [
      { name: 'code', label: 'Code', type: 'string', required: true, hint: 'Unique short code', example: 'ZENITH-2026' },
      { name: 'name', label: 'Name', type: 'string', required: true, example: 'Zenith Penthouse Residences' },
      { name: 'description', label: 'Description', type: 'string' },
      { name: 'location', label: 'Location', type: 'string', example: 'Westlands, Nairobi' },
      { name: 'vatApplicable', label: 'VAT Applicable', type: 'boolean', hint: 'true or false, defaults to true' },
      {
        name: 'defaultCancellationChargeRate',
        label: 'Cancellation Charge %',
        type: 'decimalPercent',
        hint: 'Percentage, e.g. 10 for 10%',
        min: 0,
        max: 100,
      },
    ],
    notes: ['Codes must be unique. A row whose code already exists is reported, not overwritten.'],
  },
  {
    key: 'amenities',
    label: 'Amenities',
    model: 'amenity',
    permissionSubject: 'Amenity',
    description: 'Facilities that can be attached to projects and units.',
    uniqueBy: 'name',
    fields: [
      { name: 'name', label: 'Name', type: 'string', required: true, example: 'Swimming Pool' },
      { name: 'description', label: 'Description', type: 'string' },
      { name: 'category', label: 'Category', type: 'string', example: 'Leisure' },
      { name: 'icon', label: 'Icon', type: 'string', hint: 'Optional icon name or emoji' },
    ],
  },
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
    key: 'brokers',
    label: 'Brokers',
    model: 'broker',
    permissionSubject: 'Broker',
    description: 'Agents who introduce buyers and earn commission.',
    uniqueBy: 'name',
    fields: [
      { name: 'name', label: 'Name', type: 'string', required: true, example: 'Jane Mwangi' },
      { name: 'companyName', label: 'Company', type: 'string' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'phone', label: 'Phone', type: 'string' },
      { name: 'kraPin', label: 'KRA PIN', type: 'string' },
      {
        name: 'defaultRate',
        label: 'Commission Rate %',
        type: 'decimalPercent',
        hint: 'Percentage, e.g. 2 for 2%. Defaults to 2',
        min: 0,
        max: 100,
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
