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

## Improvements still worth doing, in order

Each says why, how big, and what it would touch.

### 1. Hide menu items a person cannot open (small, high value)
Today the menu shows every page. A staff member who clicks Reseller Payouts without the permission gets the page with "You do not have permission to do that" (this happened during testing). The menu should only list pages the signed-in role can read. It needs one table mapping each menu key to the permission its page needs (read the controllers to get it right), checked against the profile the shell already receives. Empty groups then disappear, which also makes the menu shorter for most staff.

### 2. Make the customer and order records match the new flow (small)
- Customer detail: show the tier and business name, with the same Retail / Reseller / Wholesale control, and a **New order** button. Today it is only reachable from the list.
- Orders list and order detail: show the channel and a trade tag on each row, and add a **channel** filter. Most orders now come from outside WhatsApp and nobody can filter for them.
- Order detail: **Order again** for a repeat customer (copies the lines onto the new screen).

### 3. A receipt, sent from the success card (medium)
After keying in an order the person has a number and nothing to give the customer. Add "Send receipt on WhatsApp" (inside the 24-hour window it is a free-form message, otherwise it needs an approved template) and "Print / save PDF". Customers who pay by M-Pesa expect to see the order recorded.

### 4. Search records, not just pages (medium)
The finder in the menu could also search customers, orders and products using the lookup endpoints that now exist. "0722 111" from anywhere in the portal lands on that customer. This is the single biggest time saver left for someone answering phone calls.

### 5. Replace the browser's own confirm boxes (small)
Six places still use `window.confirm` (merging duplicate customers, deleting a review, deleting a kit template, switching all clubs on or off). The portal already has a dialog component. The native box cannot say what will happen, is unstyled on phones, and is easy to dismiss by reflex on destructive actions such as the customer merge.

### 6. Warn before losing work on edit forms (small)
Only the new-order screen warns when leaving with unsaved input. The catalogue, customer, user and product-detail forms do not. A shared hook (like the one on the new-order screen) would cover them.

### 7. The very large screens (large)
Accounting ledger (1,646 lines, 43 fields), payroll (1,202), catalogue (1,147), receivables (1,109), HR (1,065), payables (1,058). These are the hardest to use and the hardest to change safely. Split each into tabs or steps with one job each, and move the repeated form code onto the shared form parts in `portal/components/` (`pform-*`, `Combobox`). Do this one screen at a time, starting with whichever staff complain about most.

### 8. A "today" view on the dashboard (medium)
The dashboard shows sales, money owed and low stock. What a person opens the day for is a to-do list: orders awaiting supplier, unconfirmed orders, leads whose automatic follow-up failed (the new lead follow-up records this), carts worth chasing, reminders due. Each row should be one tap from the action.

### 9. Reports by channel and customer type (medium)
Channel is now a fixed set of choices rather than free text, and customers carry a tier. Analytics and the daily report can split revenue by both: how much came from Instagram, how much from resellers. Today that question cannot be answered.

### 10. Product entry in bulk (medium)
Adding a product asks for each size separately. A size grid (tick sizes, set one price, paste a stock list) is quicker and is the same pattern as the item search: type less, pick more.

### 11. Phone layout of the lists (small to medium)
Staff use phones. The list rows (customers, orders) put several buttons and a date block on one line; at phone width they wrap into each other ("No account" runs into "Added…"). A row card layout with the main action large and the rest in a menu would fix it.

### 12. Housekeeping that affects trust
- **Guided tours** should get a step for the new order screen and the grouped menu (`web/app/portal/tours/catalogue.ts`).
- **Who keyed it in:** show "Entered by" on each order (the audit log has it; staff cannot see it where they work).
- **Contrast:** the grey used for hints and small labels (`#6c7493` on near-white) is below the usual readable contrast at 11-12px. Darken it a step.
- **Saved menu state** is per browser (local storage). That is fine, but it is not shared between a person's phone and laptop.

## What would make a good next step

Items 1, 2 and 5 together: they are all small, they use pieces that now exist, and they remove the roughest edges staff will meet this week. Items 3 and 4 are the ones staff will ask for next.
