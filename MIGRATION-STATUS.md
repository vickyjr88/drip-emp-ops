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

## Commerce API: done

Five modules, all RBAC-gated (permissions generate from the datamodel, so the
new models got theirs automatically):

- `stores` — CRUD plus a per-store summary. Refuses to delete a store that has
  orders, stock movements or ledger lines; deactivate instead.
- `product-categories` — self-nesting, auto-slugged.
- `products` — search across name, SKU and brand; variants created with the
  product and managed through their own routes.
- `inventory` — stock levels and movements. Movement and running total are
  written in one transaction; stock can never go negative.
- `orders` — placing an order takes the stock with it in one transaction.
  Status follows a defined sequence. Payments accumulate; overpayment is
  refused; settling in full moves PENDING to PAID. Cancel or refund returns
  the goods to stock.

Verified against a running API using Drip Emporium's real data: both shops,
all six categories, seven products at their listed prices with size variants,
210 units received, an order placed, part-paid then settled, walked through
PACKED/SHIPPED/DELIVERED, refunded, and stock confirmed restored. An illegal
status jump and an overpayment were both refused with usable messages. Test
rows truncated afterwards.

## Still to do
- **Frontend.** `web/app/portal` still has the property screens and nav.
- **Rebranding.** Name, CMS copy and SEO defaults still say Dirrir Realtors.
- **`git init`.** Not yet a repository.
