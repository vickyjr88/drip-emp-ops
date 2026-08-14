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
   * read the controller rather than inferring from a nav label, since they
   * do not always match (Financial Reports gates on journal-entry.read).
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
        body: "This is where the business runs day to day -- properties, buyers, money in and out, and the people who work here. Let's walk through the layout. It takes about a minute, and you can leave at any point with Esc.",
      },
      {
        anchor: 'nav.projects',
        placement: 'right',
        title: 'Start with Projects',
        body: 'A project is a development. Everything else hangs off it: you add blocks to a project, units to a block, and then sell or rent those units.',
      },
      {
        anchor: 'nav.units',
        placement: 'right',
        title: 'Units are what you sell',
        body: 'Every apartment, house or plot lives here. A unit belongs to a block, so create the project and its blocks first -- the form will ask you which block it goes in.',
      },
      {
        anchor: 'nav.customers',
        placement: 'right',
        title: 'Customers are your buyers and tenants',
        body: 'Add someone here once, then attach them to a sale or a tenancy. Their documents, payments and next of kin all hang off this record.',
      },
      {
        anchor: 'nav.operations',
        placement: 'right',
        title: 'Operations is the day-to-day',
        body: 'Sales contracts, tenancies, rent collection and site inspections. This is where most work happens once your projects and units are set up.',
      },
      {
        anchor: 'nav.finance',
        placement: 'right',
        title: 'Finance tracks the money',
        body: 'Payments received, invoices raised, refunds and broker commissions. Accounting, just below, holds the ledger and the reports built from it.',
      },
      {
        anchor: 'nav.analytics',
        placement: 'right',
        title: 'Analytics answers "how are we doing"',
        body: 'Sales performance, collection rates and project budgets, drawn from everything recorded elsewhere. It is only as good as the data entered, so it fills out as you use the system.',
      },
      {
        anchor: 'portal.profile',
        placement: 'bottom',
        title: 'Your account lives here',
        body: 'Check which roles and permissions you have, and sign out. If a section looks empty or you get a permission error, this is the first place to look.',
      },
      {
        title: "That's the tour",
        body: 'You can reopen this any time from the Getting Started panel. The natural next step is to create your first project, then add blocks and units to it.',
      },
    ],
  },

  // ---- The dependency spine ------------------------------------------
  // Project -> Block -> Unit -> Customer -> Sale. Ordered by real foreign
  // keys: a unit needs a block, a contract needs both a unit and a customer.
  {
    id: 'project-setup',
    title: 'Set up a project',
    goal: 'Get a development into the system',
    permission: 'project.create',
    steps: [
      {
        route: '/portal/projects',
        anchor: 'projects.index',
        placement: 'bottom',
        title: 'Projects are the top of the tree',
        body: 'A project is one development. Blocks belong to a project, units belong to a block, and everything you sell or rent is a unit. So this is where a new development starts.',
      },
      {
        route: '/portal/projects',
        anchor: 'projects.index',
        placement: 'bottom',
        title: 'Creating one is two steps',
        body: 'Step 1 captures the profile -- name, location, description and imagery. Step 2 moves straight into adding blocks, because a project with no blocks has nowhere to put units.',
      },
      {
        title: 'Codes matter later',
        body: 'The project code is what importers and reports match on. Pick something short and stable; changing it after units and contracts reference it means updating those too.',
      },
      {
        title: 'Next',
        body: 'Once the project exists, add its blocks and units. The "Add blocks and units" tour picks up from there.',
      },
    ],
  },
  {
    id: 'blocks-and-units',
    title: 'Add blocks and units',
    goal: 'List what we are selling',
    permission: 'unit.create',
    requires: ['project-setup'],
    steps: [
      {
        route: '/portal/operations',
        anchor: 'operations.create-block',
        placement: 'right',
        title: 'Blocks sit between project and unit',
        body: 'A block is a building or a phase. Every unit must belong to one, so create the blocks before the units -- the unit form asks which block it goes in and will not submit without one.',
      },
      {
        route: '/portal/operations',
        anchor: 'operations.blocks',
        placement: 'top',
        title: 'Existing blocks',
        body: 'Blocks already created appear here with their floor counts. You can add more at any time as later phases break ground.',
      },
      {
        route: '/portal/units',
        anchor: 'units.add',
        placement: 'bottom',
        title: 'Adding units',
        body: 'Add units one at a time here, or paste a CSV to create a whole block at once. The CSV route is far quicker for a tower of identical layouts.',
      },
      {
        route: '/portal/units',
        anchor: 'units.list',
        placement: 'top',
        title: 'The unit list is your inventory',
        body: 'Every unit shows its status -- available, reserved or sold. This list is what the sales team works from, and what the public listings draw on.',
      },
    ],
  },
  {
    id: 'add-customer',
    title: 'Add a customer',
    goal: 'Record a buyer or tenant',
    permission: 'customer.create',
    steps: [
      {
        route: '/portal/customers',
        anchor: 'customers.list',
        placement: 'bottom',
        title: 'One record per person',
        body: 'Customers are buyers and tenants both. Add someone once here and then attach them to a sale or a tenancy -- do not create a second record for the same person in a different role.',
      },
      {
        route: '/portal/customers',
        anchor: 'customers.list',
        placement: 'bottom',
        title: 'What hangs off a customer',
        body: 'Documents, payments, next of kin and their ownership history all attach to this record. Getting the contact details right here saves chasing them later.',
      },
    ],
  },
  {
    id: 'record-a-sale',
    title: 'Record a sale',
    goal: 'Sell a unit and take a deposit',
    permission: 'sales-contract.create',
    requires: ['blocks-and-units', 'add-customer'],
    steps: [
      {
        title: 'A sale is three linked records',
        body: 'Ownership says who holds the unit. The contract says on what terms. Payments record what has actually been received. They are separate on purpose, so a change to one does not silently rewrite the others.',
      },
      {
        route: '/portal/operations',
        anchor: 'operations.assign-unit',
        placement: 'right',
        title: 'First, assign the unit',
        body: 'This links the unit to the customer and moves it out of available. Do this before writing the contract, so the contract has something to point at.',
      },
      {
        route: '/portal/operations',
        anchor: 'operations.ownerships',
        placement: 'top',
        title: 'Ownership trail',
        body: 'Every assignment is recorded here, including transfers between customers. This is the record you fall back on in a dispute, so it is deliberately append-only.',
      },
      {
        route: '/portal/finance',
        anchor: 'finance.create-contract',
        placement: 'right',
        title: 'Then the contract',
        body: 'The contract carries the agreed price and the payment schedule. Its number is what appears on receipts and statements, so use whatever your paperwork already uses.',
      },
      {
        route: '/portal/finance',
        anchor: 'finance.contracts',
        placement: 'top',
        title: 'Tracking what is owed',
        body: 'Contracts show against their installments here, so you can see who is behind. The reminder ladders draw on exactly this to chase people automatically.',
      },
    ],
  },

  // ---- Money ----------------------------------------------------------
  {
    id: 'collect-rent',
    title: 'Collect rent',
    goal: 'Chase what we are owed',
    permission: 'rental-payment.create',
    steps: [
      {
        route: '/portal/finance',
        title: 'Rental collections',
        body: 'The collections panel at the top of Finance lists tenancies with what is due and what has been paid. It is the fastest way to see the month at a glance.',
      },
      {
        route: '/portal/finance',
        anchor: 'finance.contracts',
        placement: 'top',
        title: 'Sales installments work the same way',
        body: 'Instalments on a sales contract are chased the same way as rent -- same ladders, same delivery log. Rent is just the recurring case.',
      },
    ],
  },
  {
    id: 'reminders-setup',
    title: 'Set up reminders',
    goal: 'Stop chasing people by hand',
    permission: 'reminder-rule.update',
    steps: [
      {
        route: '/portal/reminders',
        anchor: 'reminders.ladders',
        placement: 'bottom',
        title: 'Ladders decide who gets chased, and when',
        body: 'A ladder is a set of rules like "5 days before due" and "3 days after, if still unpaid". Sensible defaults ship for rent, utilities and sales instalments -- adjust rather than starting from scratch.',
      },
      {
        route: '/portal/reminders',
        anchor: 'reminders.dry-run',
        placement: 'top',
        title: 'Always dry run first',
        body: 'This shows exactly which messages would go out, to whom, without sending anything. Use it whenever you change a ladder -- it is the difference between catching a mistake and texting every tenant at 3am.',
      },
      {
        route: '/portal/reminders',
        anchor: 'reminders.log',
        placement: 'top',
        title: 'The delivery log is your evidence',
        body: 'Every message actually sent is recorded here. When someone says they were never told, this is where you look.',
      },
    ],
  },
  {
    id: 'accounting-basics',
    title: 'Money in and money out',
    goal: 'Record what we owe and are owed',
    permission: 'journal-entry.read',
    steps: [
      {
        route: '/portal/accounting',
        anchor: 'accounting.trial-balance',
        placement: 'bottom',
        title: 'Everything lands in the ledger',
        body: 'Sales, receipts, supplier bills and payroll all post here as journal entries. The trial balance is the health check: if it does not balance, something upstream needs attention.',
      },
      {
        route: '/portal/accounting/receivable',
        anchor: 'receivable.invoices',
        placement: 'bottom',
        title: 'Receivable is money owed to you',
        body: 'Invoices raised against customers, and the receipts that settle them. Refunds live here too, so the trail stays in one place.',
      },
      {
        route: '/portal/accounting/receivable',
        anchor: 'receivable.bulk',
        placement: 'right',
        title: 'Bulk invoicing saves an afternoon',
        body: 'Generate a month of invoices across many tenancies in one pass, rather than raising them one at a time.',
      },
      {
        route: '/portal/accounting/payable',
        anchor: 'payable.invoices',
        placement: 'bottom',
        title: 'Payable is money you owe',
        body: 'Supplier bills and the payments against them. Recording bills as they arrive, rather than when paid, is what makes the reports tell the truth.',
      },
      {
        route: '/portal/accounting/ledger',
        anchor: 'ledger.chart',
        placement: 'top',
        title: 'The chart of accounts',
        body: 'Every posting maps to an account here. A standard chart ships ready to use -- construction costs, management costs, payroll liabilities and tax. Add to it rather than repurposing existing codes.',
      },
    ],
  },
  {
    id: 'read-the-reports',
    title: 'Read the numbers',
    goal: 'How is the business doing?',
    permission: 'journal-entry.read',
    steps: [
      {
        route: '/portal/accounting/reports',
        anchor: 'reports.budget',
        placement: 'bottom',
        title: 'Budgets make reports meaningful',
        body: 'Set a budget per project and the reports can show spend against plan rather than just spend. Without one you get totals with nothing to compare them to.',
      },
      {
        route: '/portal/accounting',
        anchor: 'accounting.ar-summary',
        placement: 'bottom',
        title: 'Who owes you',
        body: 'Receivable ageing shows what is outstanding and how overdue. Read this alongside the reminder delivery log to see whether chasing is working.',
      },
      {
        route: '/portal/accounting',
        anchor: 'accounting.ap-summary',
        placement: 'bottom',
        title: 'What you owe',
        body: 'The same view for suppliers. Watching both sides together is what keeps cash flow from surprising you.',
      },
    ],
  },
  {
    id: 'tax-and-remittance',
    title: 'Tax and remittances',
    goal: 'Stay on the right side of KRA',
    permission: 'tax-rate.read',
    steps: [
      {
        route: '/portal/accounting/tax',
        anchor: 'tax.rates',
        placement: 'bottom',
        title: 'Rates are configuration, not entries',
        body: 'VAT and withholding rates are set here and applied automatically when invoices are raised. When a rate changes, add a new version rather than editing the old one, so past documents still reproduce.',
      },
      {
        route: '/portal/accounting/tax',
        anchor: 'tax.remittances',
        placement: 'top',
        title: 'Remittances track what you have paid over',
        body: 'Collected tax is a liability until it is remitted. Recording remittances here is what clears it, and what evidences the payment later.',
      },
    ],
  },

  // ---- People ---------------------------------------------------------
  {
    id: 'staff-and-leave',
    title: 'Staff and leave',
    goal: 'Keep people records straight',
    permission: 'employee.create',
    steps: [
      {
        route: '/portal/hr',
        anchor: 'hr.employees',
        placement: 'bottom',
        title: 'Employees feed payroll',
        body: 'An employee record carries the salary and terms payroll runs against. Someone with no record here cannot be paid, so this comes first.',
      },
      {
        route: '/portal/hr',
        anchor: 'hr.leave-requests',
        placement: 'bottom',
        title: 'Leave requests',
        body: 'Requests are raised and approved here. Approved leave draws down the balance automatically rather than needing a separate adjustment.',
      },
      {
        route: '/portal/hr',
        anchor: 'hr.leave-balances',
        placement: 'top',
        title: 'Balances follow Kenyan statutory minimums',
        body: 'Annual, sick, maternity, paternity and compassionate types ship configured to statutory minimums. Adjust the days if your contracts are more generous.',
      },
    ],
  },
  {
    id: 'run-payroll',
    title: 'Run payroll',
    goal: 'Pay staff correctly',
    permission: 'payroll-run.create',
    requires: ['staff-and-leave'],
    steps: [
      {
        title: 'Check the rates before you pay anyone',
        body: 'PAYE, NSSF, SHIF and the Housing Levy ship pre-configured, but statutory rates change. Confirm them against current KRA, NSSF and SHIF guidance before the first real run -- the system cannot tell you the figures have gone stale.',
      },
      {
        route: '/portal/payroll',
        anchor: 'payroll.rules',
        placement: 'bottom',
        title: 'Deduction rules are versioned by date',
        body: 'Each rule has an effective-from date. When a rate changes, add a new version rather than editing the current one, so payslips already issued still reproduce exactly.',
      },
      {
        route: '/portal/payroll',
        anchor: 'payroll.calculator',
        placement: 'top',
        title: 'Test a rate before it goes live',
        body: 'Enter a gross figure and a date to see exactly what comes out under the rules in force then. This is the safe way to confirm a change before it touches a real payslip.',
      },
      {
        route: '/portal/payroll',
        anchor: 'payroll.runs',
        placement: 'bottom',
        title: 'Runs are reviewable before they post',
        body: 'A run calculates every payslip for the period so you can check it before committing. Review first -- a posted run has already hit the ledger.',
      },
    ],
  },

  // ---- Admin and bulk work -------------------------------------------
  {
    id: 'import-data',
    title: 'Import existing data',
    goal: 'Move our records in without retyping them',
    permission: 'unit.create',
    steps: [
      {
        route: '/portal/importers',
        anchor: 'importers.choose',
        placement: 'bottom',
        title: 'Bulk import beats typing',
        body: 'Projects, units, customers, suppliers and brokers can all be loaded from CSV. If you are moving from spreadsheets, start here rather than entering records by hand.',
      },
      {
        route: '/portal/importers',
        anchor: 'importers.review',
        placement: 'top',
        title: 'Review before committing',
        body: 'Every import shows you what it parsed and what it will create before anything is written. Read this step properly -- it is much easier than unpicking a bad import afterwards.',
      },
      {
        title: 'Order matters',
        body: 'Import in dependency order: projects, then blocks and units, then customers. A unit referencing a block that does not exist yet will be rejected.',
      },
    ],
  },
  {
    id: 'invite-your-team',
    title: 'Invite your team',
    goal: 'Get colleagues in, safely',
    permission: 'user.create',
    steps: [
      {
        route: '/portal/users',
        title: 'Users and roles are separate',
        body: 'A user is a person who can sign in. What they can do comes from the roles assigned to them, not from the account itself.',
      },
      {
        route: '/portal/rbac',
        title: 'Roles are bundles of permissions',
        body: 'Each permission gates one action on one kind of record -- creating a unit, reading a payslip. Build roles around jobs people actually do, then assign the role.',
      },
      {
        title: 'Grant the minimum that works',
        body: 'It is easier to add a permission when someone asks than to explain why a junior account could delete contracts. Start narrow.',
      },
    ],
  },
  {
    id: 'audit-trail',
    title: 'See who changed what',
    goal: 'Answer "who did this?"',
    permission: 'audit-log.read',
    steps: [
      {
        route: '/portal/audit',
        anchor: 'audit.activity',
        placement: 'bottom',
        title: 'Every change is recorded',
        body: 'Who acted, what they touched, when, and whether it succeeded. Failed attempts are logged too, which is what makes this useful for spotting someone hitting walls they should not be near.',
      },
      {
        route: '/portal/audit',
        anchor: 'audit.filters',
        placement: 'right',
        title: 'Narrow it down',
        body: 'Filter by person, record type or date range. Reaching for this early in a dispute usually settles it faster than asking around.',
      },
    ],
  },
  {
    id: 'inquiries-and-brokers',
    title: 'Leads and brokers',
    goal: 'Turn interest into sales',
    permission: 'inquiry.read',
    steps: [
      {
        route: '/portal/inquiries',
        anchor: 'inquiries.inbox',
        placement: 'bottom',
        title: 'Inquiries arrive from the public site',
        body: 'Anyone asking about a listing lands here. Work the inbox down -- an inquiry that becomes a buyer should end up as a customer record.',
      },
      {
        route: '/portal/brokers',
        anchor: 'brokers.list',
        placement: 'bottom',
        title: 'Brokers who bring you deals',
        body: 'Register the agents you work with here so sales can be attributed to them.',
      },
      {
        route: '/portal/brokers',
        anchor: 'brokers.commissions',
        placement: 'bottom',
        title: 'Commissions follow the sale',
        body: 'Commission is calculated from the attributed sale and tracked through to payment, so what is owed to an agent is never a side calculation in someone’s notebook.',
      },
    ],
  },
];


export function findTour(id: string): Tour | undefined {
  return TOURS.find((tour) => tour.id === id);
}
