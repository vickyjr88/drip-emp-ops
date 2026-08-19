/**
 * Tour definitions -- plain data, no JSX, so adding a tour is a data edit and
 * the catalogue can be linted for dangling anchors.
 *
 * Steps target [data-tour="..."] rather than CSS classes: class names churn
 * with styling, while a data-tour attribute shows up in grep when someone
 * deletes the element it marks. Anchor naming is `section.element`.
 *
 * A step whose anchor is missing from the DOM is SKIPPED, not fatal -- see
 * tour-provider.tsx. Tours rot as the UI moves, and a tour that dead-ends is
 * worse than no tour.
 */

export type TourStepPlacement = 'top' | 'bottom' | 'left' | 'right';

export type TourStep = {
  /** data-tour value to spotlight. Omit for a centred modal step. */
  anchor?: string;
  title: string;
  body: string;
  /** Preferred side; flipped automatically when it would leave the viewport. */
  placement?: TourStepPlacement;
  /**
   * Navigate here before showing the step. Tours that span sections need this;
   * the provider pushes the route and waits for the anchor to appear.
   */
  route?: string;
};

export type Tour = {
  id: string;
  title: string;
  /** The user's own words for what they are trying to achieve. */
  goal: string;
  /**
   * Permission key required to see this tour, e.g. 'unit.create'. Omit for
   * tours everyone should get. Keys are the same ones the API enforces --
   * read the controller rather than inferring from a nav label.
   */
  permission?: string;
  /** Other tour ids that should be completed first. */
  requires?: string[];
  steps: TourStep[];
};

export const TOURS: Tour[] = [
  {
    id: 'orientation',
    title: 'Find your way around',
    goal: 'Where is everything?',
    steps: [
      {
        title: 'Welcome to the portal',
        body: "This is where the business runs day to day -- products, inventory, orders, customer details, financial reports, and team management. Let's walk through the layout. You can leave at any point with Esc.",
      },
      {
        anchor: 'nav.stores',
        placement: 'right',
        title: 'Stores are where it starts',
        body: 'A store is a physical location. Products, stock and sales all attach to one, so this is worth setting up first.',
      },
      {
        anchor: 'nav.catalogue',
        placement: 'right',
        title: 'Start with Catalogue',
        body: 'The catalogue holds your product listings, sizes, SKUs, and pricing.',
      },
      {
        anchor: 'nav.inventory',
        placement: 'right',
        title: 'Inventory & Stock',
        body: 'Track stock quantities on hand across stores, set reorder levels, and record stock movements.',
      },
      {
        anchor: 'nav.orders',
        placement: 'right',
        title: 'Orders & Sales',
        body: 'Record customer sales, track order fulfillment, and review payment collections.',
      },
      {
        anchor: 'nav.customers',
        placement: 'right',
        title: 'Customers Directory',
        body: 'Manage customer contact information, delivery details, and order history.',
      },
      {
        anchor: 'nav.accounting',
        placement: 'right',
        title: 'Accounting & Finance',
        body: 'Access general ledger accounts, receivables, payables, tax records, and financial statements.',
      },
      {
        anchor: 'nav.analytics',
        placement: 'right',
        title: 'Analytics & Insights',
        body: 'Track store sales performance, revenue metrics, and product margins.',
      },
      {
        anchor: 'nav.content',
        placement: 'right',
        title: 'Site Content edits the public pages',
        body: 'Copy and imagery on the marketing site are edited here. Changes publish immediately, so review before saving.',
      },
      {
        anchor: 'portal.profile',
        placement: 'bottom',
        title: 'Your Account & Profile',
        body: 'Review your signed-in identity, active roles, assigned permissions, or sign out.',
      },
      {
        title: "That's the orientation",
        body: 'You can reopen this any time from the Getting Started panel. Pick a guided workflow below to get started.',
      },
    ],
  },

  // ---- Retail Workflows ------------------------------------------
  {
    id: 'setup-stores-and-categories',
    title: 'Set up stores and categories',
    goal: 'Lay the ground before adding products',
    permission: 'store.create',
    steps: [
      {
        route: '/portal/stores',
        anchor: 'stores.add',
        placement: 'bottom',
        title: 'A store is a physical location',
        body: 'Every sale, stock level and consignment is tied to a store, so add your locations first -- the product and inventory screens both ask which store a thing belongs to.',
      },
      {
        route: '/portal/stores',
        anchor: 'stores.list',
        placement: 'top',
        title: 'Existing stores',
        body: 'All your locations show here. Add more at any time as the business opens new branches.',
      },
      {
        route: '/portal/categories',
        anchor: 'categories.add',
        placement: 'bottom',
        title: 'Categories group the catalogue',
        body: 'Categories can nest, so "Sneakers" can sit under "Footwear". A product left uncategorised is still sellable, but harder to find in reports.',
      },
      {
        route: '/portal/categories',
        anchor: 'categories.list',
        placement: 'top',
        title: 'The category tree',
        body: 'Categories render as a tree here, matching how they appear on the storefront.',
      },
    ],
  },
  {
    id: 'catalogue-and-inventory',
    title: 'Catalogue & Inventory',
    goal: 'Set up products and track stock',
    permission: 'product.create',
    requires: ['setup-stores-and-categories'],
    steps: [
      {
        route: '/portal/catalogue',
        anchor: 'catalogue.add-product',
        placement: 'bottom',
        title: 'Add Products',
        body: 'Create new products with variant sizes, SKUs, prices, and media.',
      },
      {
        route: '/portal/catalogue',
        anchor: 'catalogue.products',
        placement: 'top',
        title: 'Product Catalogue',
        body: 'Browse all active products, search by SKU, and update variant pricing.',
      },
      {
        route: '/portal/inventory',
        anchor: 'inventory.record',
        placement: 'bottom',
        title: 'Record Stock Movements',
        body: 'Record stock received from suppliers, customer returns, adjustments, or damage.',
      },
      {
        route: '/portal/inventory',
        anchor: 'inventory.levels',
        placement: 'top',
        title: 'Levels are the running total',
        body: 'What is on the shelf right now, per store, with a reorder flag for anything running low. Switch to Movements to see the history behind any number.',
      },
    ],
  },
  {
    id: 'orders-and-sales',
    title: 'Orders & Sales',
    goal: 'Record orders and track fulfillment',
    permission: 'order.create',
    steps: [
      {
        route: '/portal/orders',
        anchor: 'orders.new',
        placement: 'bottom',
        title: 'Record New Order',
        body: 'Capture sales orders with items, quantities, discounts, and payment methods.',
      },
      {
        route: '/portal/orders',
        anchor: 'orders.list',
        placement: 'top',
        title: 'Order Tracking',
        body: 'Monitor order statuses, store origin, and payment collection progress.',
      },
    ],
  },
  {
    id: 'add-customer',
    title: 'Add a customer',
    goal: 'Record buyer information',
    permission: 'customer.create',
    steps: [
      {
        route: '/portal/customers',
        anchor: 'customers.list',
        placement: 'bottom',
        title: 'Customer Directory',
        body: 'Add buyers and track contact details, delivery addresses, and purchase history.',
      },
    ],
  },
  {
    id: 'work-with-resellers',
    title: 'Work with resellers',
    goal: 'Hand out stock and settle what comes back',
    permission: 'consignment.create',
    steps: [
      {
        route: '/portal/resellers',
        anchor: 'resellers.list',
        placement: 'bottom',
        title: 'Resellers are trade accounts',
        body: 'A reseller buys or holds stock on different terms to a retail customer. Register them here before issuing anything to them on consignment.',
      },
      {
        route: '/portal/consignments',
        anchor: 'consignments.issue',
        placement: 'right',
        title: 'Issuing a pickup',
        body: 'Goods leave the shop floor but stay owned by you until sold or returned -- the price is fixed at the moment of issue, not when it eventually sells.',
      },
      {
        route: '/portal/consignments',
        anchor: 'consignments.list',
        placement: 'top',
        title: 'Settling what comes back',
        body: 'When a reseller reports back, record what sold and what returned against the same pickup. What is still out and what is owed both show here until it is settled.',
      },
    ],
  },
  {
    id: 'offers-and-promos',
    title: 'Offers & Discounts',
    goal: 'Manage promotional pricing',
    permission: 'offer.create',
    steps: [
      {
        route: '/portal/offers',
        anchor: 'offers.list',
        placement: 'bottom',
        title: 'Active Offers',
        body: 'Create promotional markdowns and special offer prices.',
      },
      {
        route: '/portal/offers',
        anchor: 'offers.dead-stock',
        placement: 'top',
        title: 'Clear Slow Stock',
        body: 'Identify slow-moving stock lines and put them on promotional markdown.',
      },
    ],
  },
  {
    id: 'reminders-setup',
    title: 'Set up reminders',
    goal: 'Automate collection reminders',
    permission: 'reminder-rule.update',
    steps: [
      {
        route: '/portal/reminders',
        anchor: 'reminders.ladders',
        placement: 'bottom',
        title: 'Reminder Ladders',
        body: 'Configure automated schedules for payment and invoice reminders.',
      },
      {
        route: '/portal/reminders',
        anchor: 'reminders.dry-run',
        placement: 'top',
        title: 'Dry Run Testing',
        body: 'Test notification rules and preview target recipients before sending live notifications.',
      },
      {
        route: '/portal/reminders',
        anchor: 'reminders.log',
        placement: 'top',
        title: 'Delivery Log',
        body: 'Inspect audit records for sent SMS and email notifications.',
      },
    ],
  },
  {
    id: 'accounting-basics',
    title: 'Money in and money out',
    goal: 'Record ledger entries and invoices',
    permission: 'journal-entry.read',
    steps: [
      {
        route: '/portal/accounting',
        anchor: 'accounting.trial-balance',
        placement: 'bottom',
        title: 'Trial Balance',
        body: 'Verify debit and credit balances across all ledger accounts.',
      },
      {
        route: '/portal/accounting/receivable',
        anchor: 'receivable.invoices',
        placement: 'bottom',
        title: 'Accounts Receivable',
        body: 'Track invoices raised against buyers and receipts collected.',
      },
      {
        route: '/portal/accounting/receivable',
        anchor: 'receivable.bulk',
        placement: 'right',
        title: 'Bulk Invoicing',
        body: 'Generate multiple recurring invoices in one batch pass.',
      },
      {
        route: '/portal/accounting/receivable',
        anchor: 'receivable.receipts',
        placement: 'top',
        title: 'Receipts settle invoices',
        body: 'Record what a customer actually paid here, and allocate it against the invoice it settles.',
      },
      {
        route: '/portal/accounting/payable',
        anchor: 'payable.suppliers',
        placement: 'bottom',
        title: 'Suppliers are who you owe',
        body: 'Register a supplier before recording a bill against them.',
      },
      {
        route: '/portal/accounting/payable',
        anchor: 'payable.invoices',
        placement: 'bottom',
        title: 'Accounts Payable',
        body: 'Record supplier bills and outgoing payments.',
      },
      {
        route: '/portal/accounting/payable',
        anchor: 'payable.payments',
        placement: 'top',
        title: 'Payments settle supplier bills',
        body: 'Record what was actually paid out here, and allocate it against the bill it settles.',
      },
      {
        route: '/portal/accounting/ledger',
        anchor: 'ledger.chart',
        placement: 'top',
        title: 'Chart of Accounts',
        body: 'Manage accounts and posting codes for assets, liabilities, income, and expenses.',
      },
      {
        route: '/portal/accounting/ledger',
        anchor: 'ledger.entries',
        placement: 'bottom',
        title: 'Journal entries are the full history',
        body: 'Every posting -- sales, receipts, bills, payroll -- lands here as a journal entry. This is the record everything else is built from.',
      },
    ],
  },
  {
    id: 'read-the-reports',
    title: 'Read the numbers',
    goal: 'Financial health and summary reports',
    permission: 'journal-entry.read',
    steps: [
      {
        route: '/portal/accounting',
        anchor: 'accounting.trial-balance',
        placement: 'bottom',
        title: 'Trial Balance Summary',
        body: 'Review account totals and debit/credit alignment.',
      },
      {
        route: '/portal/accounting',
        anchor: 'accounting.ar-summary',
        placement: 'bottom',
        title: 'Receivables Aging',
        body: 'Track outstanding buyer invoices grouped by overdue period.',
      },
      {
        route: '/portal/accounting',
        anchor: 'accounting.ap-summary',
        placement: 'bottom',
        title: 'Payables Aging',
        body: 'Review supplier liabilities and upcoming payment obligations.',
      },
    ],
  },
  {
    id: 'tax-and-remittance',
    title: 'Tax and remittances',
    goal: 'Manage tax rates and remittances',
    permission: 'tax-rate.read',
    steps: [
      {
        route: '/portal/accounting/tax',
        anchor: 'tax.rates',
        placement: 'bottom',
        title: 'Tax Rates',
        body: 'Configure VAT and tax rate percentages applied to invoices.',
      },
      {
        route: '/portal/accounting/tax',
        anchor: 'tax.remittances',
        placement: 'top',
        title: 'Remittances',
        body: 'Record tax payments made to tax authorities.',
      },
    ],
  },
  {
    id: 'fixed-assets-and-petty-cash',
    title: 'Fixed assets and petty cash',
    goal: 'Track equipment and small cash spend',
    permission: 'fixed-asset.create',
    steps: [
      {
        route: '/portal/accounting/fixed-assets',
        anchor: 'assets.register',
        placement: 'bottom',
        title: 'The asset register',
        body: 'Equipment, fixtures and other long-lived purchases are tracked here rather than expensed outright, so their value depreciates over time instead of hitting the books all at once.',
      },
      {
        route: '/portal/accounting/fixed-assets',
        anchor: 'assets.depreciation',
        placement: 'top',
        title: 'Depreciation runs on a schedule',
        body: 'Each asset’s value is written down over its useful life. Run depreciation here at the end of each period so the ledger reflects the current book value.',
      },
      {
        route: '/portal/accounting/petty-cash',
        anchor: 'petty-cash.boxes',
        placement: 'bottom',
        title: 'Petty cash boxes hold small change',
        body: 'A box is a small float kept for minor purchases -- register one per till or location before recording spend against it.',
      },
      {
        route: '/portal/accounting/petty-cash',
        anchor: 'petty-cash.reconciliations',
        placement: 'top',
        title: 'Reconcile regularly',
        body: 'Counting what is actually in the box and recording it here catches shrinkage early, before it becomes a much bigger discrepancy.',
      },
    ],
  },
  {
    id: 'staff-and-leave',
    title: 'Staff and leave',
    goal: 'Manage employee records and leave',
    permission: 'employee.create',
    steps: [
      {
        route: '/portal/hr',
        anchor: 'hr.employees',
        placement: 'bottom',
        title: 'Employee Directory',
        body: 'Maintain employee records, salaries, and employment terms.',
      },
      {
        route: '/portal/hr',
        anchor: 'hr.leave-requests',
        placement: 'bottom',
        title: 'Leave Requests',
        body: 'Review and approve employee leave requests.',
      },
      {
        route: '/portal/hr',
        anchor: 'hr.leave-balances',
        placement: 'top',
        title: 'Leave Balances',
        body: 'Track employee leave entitlements and days taken.',
      },
    ],
  },
  {
    id: 'run-payroll',
    title: 'Run payroll',
    goal: 'Process employee payroll',
    permission: 'payroll-run.create',
    requires: ['staff-and-leave'],
    steps: [
      {
        route: '/portal/payroll',
        anchor: 'payroll.rules',
        placement: 'bottom',
        title: 'Deduction Rules',
        body: 'Configure statutory deduction rules such as PAYE, NSSF, and health insurance.',
      },
      {
        route: '/portal/payroll',
        anchor: 'payroll.calculator',
        placement: 'top',
        title: 'Payroll Calculator',
        body: 'Preview net pay calculations before finalizing a payroll run.',
      },
      {
        route: '/portal/payroll',
        anchor: 'payroll.runs',
        placement: 'bottom',
        title: 'Payroll Runs',
        body: 'Generate, review, and post period payroll runs.',
      },
    ],
  },
  {
    id: 'manage-team',
    title: 'Invite your team',
    goal: 'Get colleagues signed in, safely',
    permission: 'user.create',
    steps: [
      {
        route: '/portal/users',
        anchor: 'users.list',
        placement: 'bottom',
        title: 'Users are people who can sign in',
        body: 'What a user can do comes from the roles assigned to them, not from the account itself -- create the account here, then check the RBAC section for the roles it holds.',
      },
      {
        title: 'Grant the minimum that works',
        body: 'It is easier to add a permission when someone asks than to explain why a junior account could delete orders. Start narrow.',
      },
    ],
  },
  {
    id: 'edit-site-content',
    title: 'Edit site content',
    goal: 'Update the public marketing pages',
    permission: 'page-content.update',
    steps: [
      {
        route: '/portal/content',
        anchor: 'content.pages',
        placement: 'bottom',
        title: 'Pick a page to edit',
        body: 'Every public page that has editable copy or imagery is listed here. A dot marks a page with unsaved changes.',
      },
      {
        route: '/portal/content',
        anchor: 'content.editor',
        placement: 'bottom',
        title: 'Changes publish immediately',
        body: 'There is no draft state -- publishing here updates the live site straight away. "Revert to default" restores the built-in copy if something goes wrong.',
      },
    ],
  },
  {
    id: 'import-data',
    title: 'Import existing data',
    goal: 'Bulk load records from CSV',
    permission: 'product.create',
    steps: [
      {
        route: '/portal/importers',
        anchor: 'importers.choose',
        placement: 'bottom',
        title: 'CSV Importers',
        body: 'Import products, customers, suppliers, or inventory from CSV files.',
      },
      {
        route: '/portal/importers',
        anchor: 'importers.review',
        placement: 'top',
        title: 'Review Data',
        body: 'Validate parsed records before saving them to the database.',
      },
    ],
  },
  {
    id: 'audit-trail',
    title: 'See who changed what',
    goal: 'Audit activity logs',
    permission: 'audit-log.read',
    steps: [
      {
        route: '/portal/audit',
        anchor: 'audit.activity',
        placement: 'bottom',
        title: 'Activity Log',
        body: 'View detailed records of actions, updates, and system events.',
      },
      {
        route: '/portal/audit',
        anchor: 'audit.filters',
        placement: 'right',
        title: 'Audit Filters',
        body: 'Filter activity logs by user, action type, or date range.',
      },
    ],
  },
];

export function findTour(id: string): Tour | undefined {
  return TOURS.find((tour) => tour.id === id);
}
