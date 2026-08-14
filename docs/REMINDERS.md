# Payment reminder engine

Configurable SMS and email reminders for sales installments, rent, utilities and
invoices. Rules are data, not code — retiming a ladder or changing wording is a
portal edit, not a deploy.

## How it works

A BullMQ **scan** job runs daily (`REMINDERS_CRON`, default 08:00
Africa/Nairobi). It resolves everything that could be owed within the widest
configured offset of today, matches each charge against the active rules, and
enqueues one **send** job per reminder. Each send delivers a single message and
retries independently — three attempts with exponential backoff — so one bad
phone number never holds up the rest of the run.

```
scan (daily)  ──▶ plan()  ──▶ send job ──▶ SMS  (Africa's Talking)
                                       └─▶ Email (Brevo)
manual trigger ──▶ same scan, ignoreTiming optional
```

Send jobs **re-plan before delivering**. A job sitting in a retry backoff cannot
message someone about a charge they settled in the meantime.

## Rules

| Field | Meaning |
|---|---|
| `targetType` | `SALES_INSTALLMENT`, `RENT`, `UTILITY` or `INVOICE` |
| `timing` | `BEFORE_DUE`, `ON_DUE_DATE`, `AFTER_DUE_IF_UNPAID` |
| `offsetDays` | Days from the due date, always positive — `timing` gives direction |
| `channel` | `SMS`, `EMAIL` or `BOTH` |
| `projectId` | Optional. Null applies the rule everywhere |
| `utilityCategory` | `UTILITY` rules only. Null covers every utility |
| `quietHoursStart/End` | Optional hours to hold sends |

Several rules on one target give a ladder. The seeded defaults are 15/10/5 days
before each installment plus a chase 5 days late; rent and utilities warn 5 days
ahead and chase 3 days late.

**Paid charges are never chased**, on any rule — paying early stops the
reminders rather than earning more of them.

### Template variables

`{{customerName}}` `{{amount}}` `{{totalAmount}}` `{{amountPaid}}`
`{{currency}}` `{{dueDate}}` `{{daysUntilDue}}` `{{daysOverdue}}`
`{{unitNumber}}` `{{projectName}}` `{{description}}` `{{reference}}`

`amount` is the outstanding balance, not the original charge.

## Where due dates come from

- **Installments** — `PaymentScheduleInstallment.dueDate`. Contract payments are
  allocated oldest-first across the schedule, since payments are recorded against
  the contract rather than a specific installment.
- **Rent** — `Tenancy.rentDueDay` each month, clamped to the month's length so a
  tenancy billed on the 31st still has a February date. Settled by matching
  `RentalPayment` in that month, preferring an explicit billing period and
  falling back to the payment date.
- **Utilities** — `TenancyUtilityCharge` rows, each with its own amount and
  optional `dueDay`, defaulting to the tenancy's rent day.
- **Invoices** — `Invoice.dueDate` for anything still open.

## Deduplication

`ReminderLog` carries a unique constraint on
`(ruleId, targetType, targetId, dueDate)`. A second attempt for the same charge
collides and is reported as a duplicate rather than messaging the customer twice.
This is what makes the scheduler safe to re-run and the manual trigger safe to
press repeatedly.

## API

| Endpoint | Purpose |
|---|---|
| `GET/POST /reminders/rules` | List and create rules |
| `PATCH/DELETE /reminders/rules/:id` | Edit and retire |
| `GET /reminders/preview` | **Dry run** — exactly what would be sent, sends nothing |
| `POST /reminders/trigger` | Manual run. `ignoreTiming: true` chases a charge outside its schedule |
| `GET /reminders/logs` | Delivery history, filterable |
| `GET /reminders/stats` | Log counts and queue depth |

Deleting a rule keeps its logs (`ruleId` is nulled) so the record of what was
actually sent survives.

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `REDIS_URL` | `redis://redis:6379` | Without it the API still boots; manual sends run inline and nothing is scheduled |
| `REMINDERS_ENABLED` | `true` | Set `false` on replicas so only one instance schedules |
| `REMINDERS_CRON` | `0 8 * * *` | |
| `REMINDERS_TIMEZONE` | `Africa/Nairobi` | |
| `AT_API_KEY` | — | Blank means SMS is skipped and logged, never sent |
| `AT_USERNAME` | `sandbox` | `sandbox` routes to Africa's Talking' test host |
| `AT_SENDER_ID` | — | Optional alphanumeric sender |

With no `AT_API_KEY` or `BREVO_API_KEY`, sends are recorded as `FAILED` with the
reason rather than throwing — a run never aborts because a provider is
unconfigured.

## Running one by hand

```bash
# See what today would send, without sending
curl "$API/reminders/preview" -H "Authorization: Bearer $TOKEN"

# Chase one specific tenancy now, outside its schedule
curl -X POST "$API/reminders/trigger" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"targetId":"<tenancyId>","ignoreTiming":true}'
```

`reminder-rule.*` and `reminder-log.*` permissions are generated from the Prisma
models by `prisma/seed.js`, so the seed must run before the endpoints are usable.
