# Staff portal: what changed, and what to do next

Written 24 Nov 2026. It covers the Drip Emporium staff portal (`web/app/portal`). The first part is what this round of work changed. The second is a ranked list of further improvements, based on what was read and tested while doing it. It is not a full audit: the accounting, HR and payroll screens were looked at for size and shared patterns, not used end to end.

## What changed

| Request | What now exists |
|---|---|
| Group the menu, add icons | The 36 flat links are 7 groups (Sell, Products, Resellers, Marketing, Reports & money, People, System) with an icon on every link. Groups fold away and remember it. The group holding the current page cannot be folded. A **Find a page** box (Ctrl/Cmd+K) jumps to any page; Enter opens the first match. A **New order** button sits at the top. `portal/components/portal-nav.tsx`. Tours still work: a step that points at a link in a folded group opens the group first. |
| Easier forms | One shared pass over every `portal-entity-form` and `portal-dialog` form (about 30 forms): a red star on required fields, a visible focus ring, red borders only after a field has been touched, taller fields and 16px text on phones (iOS stops zooming in), full-width buttons on phones, and the mouse wheel no longer changes a focused number (a price of 3,800 becoming 3,799 while scrolling). |
| Key in offline orders fast | New screen `/portal/orders/new` (it replaces the till on the orders list). One box finds a customer by **name, mobile number or email**; numbers match however they were typed (0722…, 722…, +254722…). The same box adds a new customer without leaving the order. Items are found by words, size or SKU, with the price for the customer's list and the stock at the chosen store; Enter adds the first match, so `air max 42`, Enter is one item. Channel (in store, WhatsApp, phone, Instagram, TikTok, website), delivery, notes and the payment are on the same screen. A barcode scanner that types a SKU and Enter works in the item box. |
| Tag a customer as reseller or wholesaler while ordering | A Retail / Reseller / Wholesale control in the customer step (and in the new-customer form), with an optional business name. Changing it saves to the customer and re-prices the lines on the screen to that list. Staff without permission to edit customers see it disabled. |
| Related | The customers list now shows a Reseller / Wholesale tag and the business name, and has a **New order** button on every row. Cart leads open the new screen prefilled (customer, items re-priced to today, address, delivery fee, channel). Adding a customer whose phone or email is already on file answers "X is already a customer" with a one-click **Use X**, not a database error. |

Not touched on purpose: tagging a customer as trade also stops marketing WhatsApp messages to them (that is how the system already treats resellers). Staff should know that when they tag someone.

## Tested, and not tested

- Backend: 13 tests against a scratch database (customer lookup, duplicate guard, item lookup with tiers and stock). They are not in the CI workflow, which has no database; run them with `KITS_TEST_DATABASE_URL` set.
- In a browser, against a scratch database: customer search by name and by phone, Enter-to-pick, tagging Reseller (prices dropped), business name saved, items added by search, an order placed with an M-Pesa payment recorded, the duplicate-customer path, `?lead=` and `?customer=` prefill, the grouped menu (fold, remember, find, jump), phone width, the drawer.
- Found and fixed while testing: a form nested inside the order form reloaded the page; Enter pressed before results arrived did nothing; the layout was cramped between 900 and 1280px wide; the internal stand-in email (`…@customer.invalid`) leaked into the customer card.
- **Not tested:** on a real phone or a real barcode scanner; with a staff role that has fewer permissions than the test user (the screen hides what that role cannot do, from the permission list, but that was not exercised with a real limited role); the other ~30 forms after the shared styling (they were checked by reading the CSS, not by opening each one); anything on production.

## Second round (25 Nov 2026): the twelve follow-ups

Every item from the first review's list was taken up. Where the first review was wrong, it says so.

| # | Item | What was done |
|---|---|---|
| 1 | Hide menu items a role cannot open | Each menu item names the permission its page reads (taken from the backend controllers). Roles without it do not see the link; groups with nothing left disappear; the New order button needs `order.create`. Until a page has registered who is signed in, everything shows, and the API still enforces access. Tested with a limited role. |
| 2 | Customer and order records match the new flow | Customer record: shows and changes the customer type (Retail / Reseller / Wholesale) and has a New order button; the create and edit form has the same control and a business name. Orders list: channel filter, "Reseller & wholesale only", a tag on trade orders, "keyed by" on each row. Order detail: **Order again** (same customer and items at today's prices and stock). |
| 3 | Receipts | The order carries a receipt written as a WhatsApp message (items by product name and size, delivery, discount, paid, balance) that opens the chat for staff to send, and a printable page at `/portal/orders/:id/receipt` (print or save as PDF). Both are on the order screen and on the success card after keying an order in. Nothing is sent automatically. |
| 4 | Search records, not just pages | The menu's finder also searches customers (name, phone, email), orders and products, with arrow keys and Enter. Each source is asked only if the role may read it. |
| 5 | Replace the browser's own confirm boxes | All six (customer merge, delete review, turn a review away, delete template, switch clubs on and off) use the portal dialog, which can say what will happen. Escape closes any portal dialog. |
| 6 | Warn before losing work | `useUnsavedGuard` warns on closing the tab and, unlike the browser's own warning, when following a link inside the portal. Used on the new order screen and the customer, user, new product and product details forms. The other forms (stores, categories, consignments, accounting) do not have it yet. |
| 7 | The very large screens | **The first review was mostly wrong here.** Payroll, receivables, payables, HR and the ledger already use tabs, and reminders has three views; only the Catalogue is one long page, and most of its length is the new product form. No restructuring was done: splitting working files with 40+ fields each carries risk and no gain for staff. The new product form was improved instead (item 10). File size is a maintenance concern, not a usability one. |
| 8 | A "today" view on the dashboard | "Needs you today": orders waiting for payment, money owed on part-paid orders, orders waiting on a supplier, leads the automatic follow-up could not reach, open carts and enquiries, sizes running low. Each row links to the matching list, already filtered. Rows a role cannot read are not shown. |
| 9 | Reports by channel and customer type | **The channel breakdown already existed on Analytics.** What was missing was the price list: Analytics now has "Sales by customer type" (retail against reseller and wholesale). The orders list filters on both. |
| 10 | Product entry in bulk | The new product form takes opening stock: a count under each ticked size, or a pasted list (`40:3, 41:5` or one per line, unmatched sizes are flagged), recorded into the chosen store when the product is saved. |
| 11 | Phone layout of the lists | Rows stack by the width of the list rather than of the screen, so they stop cramming when the sidebar is open. |
| 12 | Housekeeping | Tours cover the finder, New order, the grouped menu and the new order screen. Hint text and placeholders were darkened to meet 4.5:1 contrast (two greys measured at 4.4:1 and 3.2:1). "Keyed by" shows on the orders list. |

Also fixed on the way: an order created with only a customer id was stored with no name or number (it read as a walk-in in lists and could not be sent a receipt); the order follow-up message used the stored description ("EUR 42 (SKU)") instead of the product name; product lookup without a store showed 0 in stock instead of the total.

### Tested, and not tested (second round)

- Backend: 6 receipt tests, 3 order-customer tests, the 13 lookup tests, and the existing follow-up, lead and merge tests (96 in all, passing three runs in a row), plus a production build of both apps. `npm run test:customer-lookup` needs `KITS_TEST_DATABASE_URL` pointing at a fresh migrated scratch database and runs its files one at a time: test files that share a database flake when run in parallel.
- In a browser against a scratch database, as an admin and as a limited role: the menu for each, the finder (page, customer, product), the customer record and its type control, a new customer with a business name, order again, the receipt on the order screen and after keying an order in, the print page, filtered links from the dashboard, the dialogs and the unsaved-changes warning (stay and leave), Analytics, and the new product form with a pasted stock list.
- A parser for the pasted stock list has 5 tests (`node --test web/app/portal/catalogue/stock-list.test.mjs`); they are not in CI.
- **Not tested:** a real phone, a real barcode scanner, WhatsApp opening the receipt (only the link and its text were checked), a real printer, and the screens outside the ones listed. The permission-to-page table was built by reading the controllers; a role with an unusual mix of permissions could see a link whose page then partly fails, which is the same behaviour as before this change.

## Still open

- **Unsaved-changes guard** on the remaining forms (stores, categories, consignments, accounting). One line per form once the form's save handler is identified.
- **Saved menu state** is per browser (local storage), so it is not shared between a person's phone and laptop.
- **Reseller and wholesale tagging stops marketing WhatsApp messages** to that customer (the system already treats trade numbers that way). Staff should know this when tagging.
- **A search by customer on the orders list** matches the name and phone stored on the order. Orders created before this change with only a customer id (some other client may have done that) have no stored name, so searching their customer's name will not find them (searching from the menu finder, or opening the customer, will).
