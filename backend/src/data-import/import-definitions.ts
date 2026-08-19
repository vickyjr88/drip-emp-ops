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
  /**
   * Rows sharing this field describe one parent record rather than colliding.
   *
   * Products are the only importer where a repeated key is correct: each row is
   * one size, and the rows for a shoe group into a single product with several
   * variants. Set this and uniqueBy stops treating repetition as a duplicate.
   */
  groupBy?: string;
};

export const IMPORT_DEFINITIONS: ImportDefinition[] = [
  {
    key: 'products',
    label: 'Products & Sizes',
    model: 'product',
    permissionSubject: 'Product',
    description: 'The catalogue: one row per size, grouped into products.',
    groupBy: 'productSku',
    fields: [
      { name: 'productSku', label: 'Product SKU', type: 'string', required: true, example: 'AF1-BLK',
        hint: 'Repeat on every row for the same shoe. This is what groups sizes together.' },
      { name: 'name', label: 'Product Name', type: 'string', required: true, example: 'Air Force 1 Black' },
      { name: 'size', label: 'Size', type: 'string', required: true, example: 'EUR 42',
        hint: 'One row per size. A bare number becomes "EUR 42".' },
      { name: 'priceKes', label: 'Retail Price', type: 'number', required: true, min: 0, example: '3499' },
      { name: 'brand', label: 'Brand', type: 'string', example: 'Nike' },
      { name: 'category', label: 'Category', type: 'string', example: 'Sneakers',
        hint: 'Created if it does not exist yet.' },
      { name: 'description', label: 'Description', type: 'string' },
      { name: 'variantSku', label: 'Size SKU', type: 'string',
        hint: 'Defaults to <Product SKU>-<size>, e.g. AF1-BLK-EUR42.' },
      { name: 'costKes', label: 'Cost', type: 'number', min: 0, hint: 'What you paid. Margin reads as 100% without it.' },
      { name: 'resellerPriceKes', label: 'Reseller Price', type: 'number', min: 0 },
      { name: 'wholesalePriceKes', label: 'Wholesale Price', type: 'number', min: 0 },
      { name: 'barcode', label: 'Barcode', type: 'string' },
    ],
    notes: [
      'One row per size. Repeat the product SKU, name and brand on every row of the same shoe.',
      'Product details are taken from the first row of each group; later rows only contribute their size.',
      'Prices are per size, so a size that sells for more can carry its own.',
      'Sizes may differ per product: 36-42 on one shoe and 40-45 on another is normal.',
      'Products that already exist are refused by SKU. Add sizes to those from the product page instead.',
      'Stock is not imported. Record it on the Inventory page once the products are in.',
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
