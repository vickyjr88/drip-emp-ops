# Sales report

Portal, **Sales Report** (under *Reports & money*, beside Analytics). One screen for what sold in a day, a week, a month or any
dates, what it came to, what money actually came in, and every order with where it stands — **including the cancelled and refunded
ones**.

It answers with the same words the dashboard, Analytics and the daily report use, so the three never disagree:

| | |
|---|---|
| **A sale** | an order that is `PAID`, `PACKED`, `SHIPPED` or `DELIVERED` |
| **Revenue** | what those sales came to: items plus delivery, less discounts |
| **Money received** | payments recorded in the period, whichever day the order was placed (orders *and* reseller pickups) |
| **Unpaid** | `PENDING` orders — shown, never counted as sales |
| **Cancelled & refunded** | shown with their value and their reason, never added to revenue |

## Periods

`Daily` (hour by hour), `Weekly` (Monday–Sunday), `Monthly`, or a **date range** with quick choices (last 7/30/90 days, this year,
all time). Days are Nairobi days: a sale at 01:30 belongs to that day. A period still under way is compared with the same stretch of
the period before it ("Week of 23 Nov – 26 Nov (so far)" against 16–19 Nov), and every headline says what it is compared with.

The period, the grouping and the filters are kept in the address (`/portal/sales-report?view=week&from=…&channel=WHATSAPP`), so a
view can be bookmarked or sent to someone.

## What is on the page

- **Tiles**: revenue, sales, average sale, pairs sold, money received, orders placed, cancelled & refunded (with the cancellation
  rate), unpaid — each with the percentage change against the comparison period. Tiles that lead somewhere (sales, orders, unpaid,
  cancelled) open the order list on that tab.
- **Chasers**: unpaid orders worth chasing, sales with money not recorded as paid, and money that was paid on orders later cancelled
  or refunded (check it went back).
- **Revenue chart**: bars with a value scale and a per-bar figure, by hour, day, week or month. Pressing a bar opens that period on
  its own. A table of the same figures is one click away (the chart's *Table* button), which is also what print uses.
- **Day by day** (hour by hour, week by week, month by month): orders, sales, revenue, unpaid, cancelled and money received per
  period with a total row, break down by day/week/month of your choosing, and **Export CSV**.
- **Breakdowns**: money received by payment method, how the revenue adds up (items, delivery, discounts, what is paid and what is
  not, and **gross profit** for anyone who may read the books), orders by status, customers (new against returning, walk-ins, how
  many website orders were paid), by channel, by staff, by price list, by store, top products, top customers.
- **Orders in this period**: tabs (all / sales / unpaid / cancelled & refunded), a status picker, search by order number, name or
  phone, sort, paging and per-page; columns for order, placed, status, customer, channel, items, total, paid and balance; a
  *Message* button where a WhatsApp follow-up exists; **Export orders CSV** (with the cancellation reason).

Filters: **store, channel, price list and who keyed the order** — they apply to the figures, the chart and the list alike, and
lifting the channel or "keyed by" filter is what brings reseller pickup payments back in (the page says when they are left out).

`Print or save as PDF` prints the figures, the breakdowns and the order list with the filters and the period written on them.

## Cancelling and refunding asks why

Ending an order cannot be undone, so the order page asks for a reason (a list — never paid, out of stock, wrong size, returned the
item… — with anything to add) and keeps it in `Order.closeReason`. The reason shows on the order, in this report's order list and in
both CSV exports, so "why did these three get cancelled" is answerable months later. `Order` gains `closeReason` in migration
`20261127090000_add_order_close_reason`; `PATCH /orders/:id/status` takes an optional `reason`.

## API

| | |
|---|---|
| `GET /sales-report` | the figures: summary, comparison, series, breakdowns, customers, margin |
| `GET /sales-report/orders` | the order list: `show`, `sort`, `search`, `skip`, `take`, with totals for the tab |
| `GET /sales-report/export` | the same rows as CSV (capped, and it says when it capped) |
| `GET /sales-report/options` | filter choices, the shop's today, the first order day (for "all time") |

All four need `order.read`; gross profit additionally needs `journal-entry.read`, as on Analytics. Dates are validated: a period
that cannot be right is refused rather than quietly read as something else.

## Tests

`npm run test:sales-report` — 11 calculation tests that need nothing (sales against revenue, Nairobi days, comparison periods,
buckets, breakdowns, gross profit) and 5 against a scratch database (`KITS_TEST_DATABASE_URL`) covering the report's own figures,
money counted on the day it arrived, the order list and its tabs, cancelling with a reason, and the rejected periods.
