-- ============================================================
-- Stripe Billing Schema — PENDING DEPLOY
-- ============================================================
-- Adds Stripe subscription columns to organizations (fleet) and
-- profiles (personal users). Also adds a subscription_events log
-- table for webhook audit trail.
--
-- Run via: Supabase Dashboard → SQL editor, or mcp_supabase_apply_migration
-- Migration name: "add_stripe_billing_columns"
-- ============================================================

-- ── organizations: fleet billing ─────────────────────────────

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS stripe_customer_id        text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id    text,
  ADD COLUMN IF NOT EXISTS subscription_status       text NOT NULL DEFAULT 'inactive',
  -- inactive | trialing | active | past_due | canceled | unpaid
  ADD COLUMN IF NOT EXISTS subscription_plan         text,
  -- fleet_monthly (129 kr/vehicle/month)
  ADD COLUMN IF NOT EXISTS subscription_quantity     integer NOT NULL DEFAULT 0,
  -- number of billable vehicle seats
  ADD COLUMN IF NOT EXISTS current_period_end        timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at             timestamptz;

-- Unique constraint so webhook lookups are fast
CREATE UNIQUE INDEX IF NOT EXISTS organizations_stripe_customer_id_idx
  ON organizations (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS organizations_stripe_subscription_id_idx
  ON organizations (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- ── profiles: personal billing ────────────────────────────────

-- Ensure profiles table exists (it should — created in fleet schema)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id        text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id    text,
  ADD COLUMN IF NOT EXISTS subscription_status       text NOT NULL DEFAULT 'inactive',
  -- inactive | trialing | active | past_due | canceled | unpaid
  ADD COLUMN IF NOT EXISTS subscription_plan         text,
  -- personal_monthly | personal_annual
  ADD COLUMN IF NOT EXISTS current_period_end        timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at             timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_stripe_customer_id_idx
  ON profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_stripe_subscription_id_idx
  ON profiles (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- ── subscription_events: webhook audit log ────────────────────
-- Immutable log of every Stripe webhook event we process.
-- Lets you debug billing issues and replay missed events.

CREATE TABLE IF NOT EXISTS subscription_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text NOT NULL UNIQUE,  -- idempotency key
  event_type      text NOT NULL,
  entity_type     text NOT NULL,         -- 'organization' | 'profile'
  entity_id       uuid NOT NULL,
  stripe_data     jsonb NOT NULL DEFAULT '{}',
  processed_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write (webhook Edge Function uses service role)
-- No user-facing RLS policies needed — admins see billing via Stripe Portal.

-- Index for deduplication checks
CREATE INDEX IF NOT EXISTS subscription_events_entity_idx
  ON subscription_events (entity_type, entity_id, processed_at DESC);

-- ── RLS additions ─────────────────────────────────────────────
-- Allow org admins to read their own subscription fields.
-- The existing "org_members_read" policy on organizations covers SELECT,
-- so no new policy needed for reading. The webhook writes via service role.

-- Allow personal users to read their own profile subscription fields.
-- profiles already has RLS; ensure the self-read policy covers new columns
-- (column additions are automatically covered by existing row-level policies).
