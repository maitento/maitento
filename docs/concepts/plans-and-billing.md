---
title: Plans and billing
description: What your plan includes, how work is paid for, what happens when credit runs out, and how to read it all.
sidebar:
  order: 19
---

# Plans and billing

Your tenant is on a **plan**. The plan includes a monthly allowance of work, room to store files, a number of runs at
once, and limits on what you can create. Work beyond the allowance is paid from your **balance**.

You choose and change your plan, top up, and manage cards and invoices on the portal's **Billing** page. Everything on
that page can also be read from the API and the SDKs, below.

## What a plan includes

| | What it means |
|---|---|
| **Run time** | Time spent running interactions and apps, each billing month |
| **Sandbox and code pipeline time** | Time spent running capsules and code pipelines, by the memory they're given (GiB-hours), each billing month. Free doesn't include it |
| **Web searches and fetches** | Pages of search results, and pages read, each billing month |
| **Storage** | How much your files, knowledge bases, file systems and kept runs may take at once |
| **Lanes** | How many runs of each kind run at once (see [Limits](limits.md#how-many-run-at-once)) |
| **Limits** | How many knowledge bases, file systems, credentials and credential stacks you can hold |
| **Retention** | How long a finished run can be kept |
| **Priority** | Where your work waits when the platform is busy |

A billing month starts on the day your plan started. An upgrade counts at once: you get the rest of the month's extra
allowance straight away.

## How work is paid for

Work uses your allowance first. On a plan that can top up, work beyond the allowance is paid from your balance, at the
plan's rates. A Free plan can't top up, so each kind of work stops when its allowance is used up for the month.

When your balance can't pay for more work, nothing new starts and the work that was running is stopped. The refusals
and their codes are in [Limits](limits.md#your-plan). Top up, or turn on **automatic top-up**, so it doesn't happen: it
buys credit when your balance falls below an amount you choose.

Indexing your documents counts as run time, but only the work that indexes them. An attempt that can't (no model key
it may use, say), and is tried again later, costs nothing. A run is different: it counts however it ends, because it
used the time.

Usage is charged to a fraction of a cent, so one second of work costs what it costs. Every decision made from your
balance uses it rounded to the cent, as `standing` shows it, so a fraction of a cent never makes a difference. Owing
$0.004 isn't out of credit, and $99.996 isn't below a $100 automatic top-up threshold.

## Reading where you stand

`standing` answers the billing page's questions in one call: your plan and its state, your balance, whether you can
start work, any plan change on its way, and how much of each allowance you've used this month.

<!-- tabs -->
```ts
const standing = await mt.billing.standing();
for (const m of standing.meters) console.log(m.meter, m.used, m.allowance ?? "unlimited");
```
```python
standing = mt.billing.standing()
for m in standing.meters:
    print(m.meter, m.used, m.allowance if m.allowance is not None else "unlimited")
```
```csharp
var standing = await mt.Billing.GetStandingAsync();
foreach (var m in standing.Meters)
    Console.WriteLine($"{m.Meter} {m.Used} {m.Allowance?.ToString() ?? "unlimited"}");
```
```bash
curl https://api.maitento.com/billing/standing -H "Authorization: $MAITENTO_AUTH"
```
<!-- /tabs -->

Usage is counted in each meter's own unit: seconds of run time, GiB-seconds of sandbox and code pipeline time, pages
of search results and fetch units. An allowance of `null` is unlimited.

Allowances reset every billing month (`periodEndUtc`), on every plan. A paid subscription renews at `termEndsAtUtc`:
after a month on a monthly plan, after a year on an annual one. A booked downgrade or a cancellation takes effect then.
`lowBalance` is true while your balance is below your alert's share of your last top-up, as described below.

The other reads:

| Call | What it returns |
|---|---|
| `billing.plan()` | Everything your plan includes and costs: allowances, lanes, limits, retention, priority, rates |
| `billing.balance()` | Your balance, and whether it can pay for more work |
| `billing.catalogue()` | The plans you can choose, cheapest first, with what each includes and costs |
| `billing.notices()` | Your latest billing notices, newest first |

Anyone in your tenant can read them.

## Automatic top-up and alerts

Tenant admins can turn on automatic top-up, and choose the alerts they're emailed:

<!-- tabs -->
```ts
await mt.billing.setAutoTopUp({ enabled: true, thresholdAmount: 10, topUpAmount: 50 });
await mt.billing.setAlerts({ emailAtPercentOfLastTopUp: 20, showPortalBanner: true, emailWhenWorkRefused: true });
```
```python
mt.billing.set_auto_top_up(enabled=True, threshold_amount=10, top_up_amount=50)
mt.billing.set_alerts(email_at_percent_of_last_top_up=20, show_portal_banner=True, email_when_work_refused=True)
```
```csharp
await mt.Billing.SetAutoTopUpAsync(new AutoTopUpApiRequest { Enabled = true, ThresholdAmount = 10, TopUpAmount = 50 });
await mt.Billing.SetAlertsAsync(new LowBalanceAlertSettings { EmailAtPercentOfLastTopUp = 20, ShowPortalBanner = true, EmailWhenWorkRefused = true });
```
<!-- /tabs -->

The low-balance email is sent once each time your balance falls below `emailAtPercentOfLastTopUp` of your last top-up.
The portal's banner uses the same share, or 20% when the email is off; `showPortalBanner: false` hides it.

Automatic top-up charges the card saved with your last top-up. If a charge is refused, it stops and your admins are
told; saving the settings again, or saving a new card with a top-up, starts it again. `autoTopUp()` says why it
stopped in `suspendedReason`: `no-payment-method`, `plan-cannot-top-up`, or the card's decline code, such as
`insufficient_funds`.

## Notices

Maitento tells you when something changes, as a [`BillingNotice`](../reference/types/billing-notice.md): your tenant's
admins are emailed, and a `Billing` [webhook](runs-and-events.md#3-get-called-back-webhooks) is called. A notice is
sent when:

- you run out of credit, or get it back;
- an allowance is used up, on a plan without top-ups;
- your balance runs low (as your alerts say);
- your plan changes, or your subscription ends;
- a renewal payment fails, with reminders while it's unpaid;
- an automatic top-up can't be charged.

## When a renewal payment fails

Your tenant moves to the Free plan at once, but your data is kept as it is for 30 days. You're reminded 7, 21 and 28
days after the payment failed. Paying the renewal in that time puts you back on your plan, with everything as it was.
After 30 days the subscription is cancelled and Free's limits apply in full.
