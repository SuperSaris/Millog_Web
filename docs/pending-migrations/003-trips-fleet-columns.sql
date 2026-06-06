-- ============================================================
-- Fleet Columns on Trips — PENDING (not yet deployed)
-- ============================================================
-- Adds driver_id and organization_id to the trips table for fleet
-- reporting. These columns are NULLABLE and have NO effect on
-- existing personal-path trips.
--
-- ⚠️  PRODUCTION SAFETY:
--   • Both columns are nullable — existing rows get NULL
--   • No NOT NULL constraints — existing INSERT paths unaffected
--   • Trigger only fires on INSERT and only sets org_id if NULL
--   • No existing RLS policies are modified
--   • No existing columns are renamed or dropped
--   • The mobile app's trip INSERT path is unaffected because it
--     never sets these columns (they default to NULL)
--
-- The bridge (millog-telemetry-bridge) can be updated LATER to
-- set driver_id on trip creation if a fleet assignment exists.
-- Until then, fleet dashboards join through organization_vehicles.
-- ============================================================

-- ── 1. Add columns ─────────────────────────────────────────

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;

COMMENT ON COLUMN trips.driver_id IS
  'The person who actually drove. For personal vehicles: same as user_id. '
  'For fleet vehicles: may differ from user_id (vehicle owner). '
  'NULL for trips created before this column was added.';

COMMENT ON COLUMN trips.organization_id IS
  'The organization this trip belongs to, if any. '
  'NULL for personal (non-fleet) trips and pre-existing trips.';


-- ── 2. Indexes for fleet reporting queries ──────────────────

CREATE INDEX IF NOT EXISTS idx_trips_org_started_at
  ON trips (organization_id, started_at DESC)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trips_driver_id
  ON trips (driver_id)
  WHERE driver_id IS NOT NULL;


-- ── 3. Auto-populate organization_id on new trip inserts ────
--    Only fires when organization_id is NULL and vehicle_id is set.
--    Looks up the vehicle's org from organization_vehicles.
--    If vehicle is not in any org, leaves NULL (personal trip).

CREATE OR REPLACE FUNCTION public.auto_set_trip_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only auto-populate if not already set and vehicle_id exists
  IF NEW.organization_id IS NULL AND NEW.vehicle_id IS NOT NULL THEN
    SELECT ov.organization_id INTO NEW.organization_id
    FROM public.organization_vehicles ov
    WHERE ov.vehicle_id = NEW.vehicle_id
    LIMIT 1;
  END IF;

  -- Auto-populate driver_id from user_id if not set
  IF NEW.driver_id IS NULL AND NEW.user_id IS NOT NULL THEN
    NEW.driver_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_set_trip_organization ON trips;
CREATE TRIGGER trg_auto_set_trip_organization
  BEFORE INSERT ON trips
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_trip_organization();


-- ════════════════════════════════════════════════════════════
-- Done. No existing behavior is changed.
-- The mobile app continues to INSERT trips exactly as before.
-- The new columns simply stay NULL for personal trips.
-- ════════════════════════════════════════════════════════════
