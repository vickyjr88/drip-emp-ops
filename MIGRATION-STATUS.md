# Drip CRM — migration status

Copied from `dirrir-realtors` and stripped of the property domain.

## Done

- Project copied to `../drip-crm` (source, config, docs; no node_modules/.next/.git).
- `.env` rebranded: own database (`drip_crm`), own MinIO bucket, **fresh JWT secret**
  so tokens are not interchangeable between the two apps.
- 21 property modules removed from `backend/src` (43 remain).
- 24 property models + 4 orphans removed from the Prisma schema (48 remain).
  **`prisma validate` passes.**
- `financial-reports` pruned to the five reusable reports: profit and loss,
  balance sheet, cash flow, AP ageing, tax. The project-scoped filter is gone
  because the ledger no longer tags lines with a project.

## Backend: done

- **0 TypeScript errors** (from 161). `npm run build` passes.
- `projectId` became `storeId` against a new **Store** model, per option A.
  The accounting stack keeps its dimensional reporting, now per store rather
  than per project.
- **Commerce domain added**: Product, ProductCategory, ProductVariant,
  StockLevel, StockMovement, Order, OrderLine, OrderPayment,
  StoreAccountAssignment.
- Single initial migration, 58 tables, applied to a fresh `drip_crm` database.
- Exercised end to end: store -> product -> variant -> stock -> order -> line
  -> M-Pesa payment -> stock decremented. Test rows truncated afterwards.

### Modules pruned rather than repaired

Their logic was property-shaped and would have been rewritten anyway:

- `customer-portal` — kept login and change-password; dashboard, rent-change
  requests removed.
- `invoice` — kept the module; removed `bulkGenerate`, which generated
  invoices from sales contracts and tenancies.
- `reminders` — kept invoice reminders; removed sales-instalment, rent and
  utility targets.
- `financial-reports` — kept P&L, balance sheet, cash flow, AP ageing, tax;
  removed the three project reports.
- `expense-import` — kept; dropped the project tagging column.

## Still to do

- **Commerce services and controllers.** The schema exists; the REST layer for
  products, stock and orders does not.
- **Frontend.** `web/app/portal` still has the property screens and nav.
- **Rebranding.** Name, CMS copy and SEO defaults still say Dirrir Realtors.
- **`git init`.** Not yet a repository.
