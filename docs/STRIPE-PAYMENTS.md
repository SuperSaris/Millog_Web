# Millog Web — Stripe Payments

**Status:** Live account active (Bicoli Group AB)
**Last updated:** 2026-05-26

---

## Overview

Stripe handles all web subscriptions for Millog. Mobile app subscriptions use RevenueCat + Apple IAP / Google Play Billing instead (App Store rules prohibit Stripe inside the app). This doc covers the web product only.

---

## Pricing Tiers

| Plan                  | Price ID env var                    | Amount        |
| --------------------- | ----------------------------------- | ------------- |
| Personal — Monthly    | `STRIPE_PERSONAL_MONTHLY_PRICE_ID`  | 79 SEK/month  |
| Personal — Annual     | `STRIPE_PERSONAL_ANNUAL_PRICE_ID`   | 699 SEK/year  |
| Fleet — Per vehicle   | `STRIPE_FLEET_MONTHLY_PRICE_ID`     | 129 SEK/vehicle/month |

> Annual saving: 79 × 12 = 948 SEK vs 699 SEK → ~26% discount.

---

## Statement Descriptor

- **Full descriptor:** `MILLOG Bicoli Group AB`
- **Shortened descriptor:** `Millog`

---

## Currency

SEK (Swedish Krona). All prices are in SEK.

---

## Payout Schedule

Automatic — weekly on Monday to Sparbanken Skaraborg.

---

## Edge Functions

Three Edge Functions handle Stripe operations. All live in `supabase/functions/` (pending deploy from `docs/pending-edge-functions/`).

| Function                  | Trigger           | Purpose                                              |
| ------------------------- | ----------------- | ---------------------------------------------------- |
| `stripe-create-checkout`  | App calls it      | Creates a Stripe Checkout Session, returns `{ url }` |
| `stripe-customer-portal`  | App calls it      | Opens Stripe Customer Portal for self-service billing |
| `stripe-webhook`          | Stripe calls it   | Processes subscription lifecycle events              |

### Required Secrets (set via `supabase secrets set`)

```
STRIPE_SECRET_KEY               sk_live_...
STRIPE_WEBHOOK_SECRET           whsec_...  (from Stripe Dashboard → Webhooks)
STRIPE_PERSONAL_MONTHLY_PRICE_ID
STRIPE_PERSONAL_ANNUAL_PRICE_ID
STRIPE_FLEET_MONTHLY_PRICE_ID
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_URL
APP_URL                         https://app.millogapp.se
```

> `stripe-webhook` must be deployed with `--no-verify-jwt` (public endpoint, no Supabase JWT).

---

## Webhook Registration

Register in Stripe Dashboard → Developers → Webhooks:

- **URL:** `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
- **Events to listen to:**
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`

After registering, copy the `whsec_...` signing secret and set it as `STRIPE_WEBHOOK_SECRET`.

---

## Subscription Status Model

Stripe statuses are mapped to internal statuses in the webhook handler:

| Stripe status        | Internal status |
| -------------------- | --------------- |
| `trialing`           | `trialing`      |
| `active`             | `active`        |
| `past_due`           | `past_due`      |
| `canceled`           | `canceled`      |
| `unpaid`             | `unpaid`        |
| `incomplete`         | `inactive`      |
| `incomplete_expired` | `inactive`      |
| `paused`             | `inactive`      |

The webhook upserts `subscription_status`, `subscription_plan`, `subscription_quantity`, and `stripe_subscription_id` on both `organizations` and `profiles` tables depending on whether it's a fleet or personal subscription.

---

## Test vs Live

- **Test mode keys:** `sk_test_...` / `pk_test_...`
- **Live mode keys:** `sk_live_...` / `pk_live_...`

Always use test keys in local development and staging. Switch to live keys only in production Edge Function secrets.

When testing locally, use the [Stripe CLI](https://stripe.com/docs/stripe-cli) to forward webhooks:

```bash
stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook
```

---

## Related Docs

- `Docs/product/PAYMENTS-REVENUECAT.md` — Mobile IAP (RevenueCat, Apple, Google Play)
- `docs/pending-edge-functions/stripe-create-checkout.ts` — checkout function source
- `docs/pending-edge-functions/stripe-webhook.ts` — webhook handler source
- `docs/pending-edge-functions/stripe-customer-portal.ts` — portal function source
- `docs/pending-migrations/` — DB schema for `organizations`, `subscription_events`
