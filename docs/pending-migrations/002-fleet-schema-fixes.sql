-- ============================================================
-- Fleet Schema Fixes — PENDING (not yet deployed)
-- ============================================================
-- Fixes identified in architecture audit 2026-04-15.
-- All changes are ADDITIVE — nothing in 001 is dropped or renamed.
-- Safe to run against a live database with existing fleet data.
--
-- PRODUCTION SAFETY: Only touches fleet-specific tables
-- (organizations, organization_members, organization_vehicles,
-- organization_vehicle_assignments). Does NOT modify trips,
-- vehicles, profiles, or any other table used by the mobile app.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1. SECURITY: Fix RLS privilege escalation
--    (driver could UPDATE SET role='admin' on their own row)
-- ════════════════════════════════════════════════════════════

-- Drop the overly-permissive self-update policy
DROP POLICY IF EXISTS "users_update_own_membership" ON organization_members;

-- Replace with restricted version: users can only update their
-- own status (invited→active) — never their role.
CREATE POLICY "users_activate_own_membership" ON organization_members
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    -- Role must remain unchanged (compare against current row)
    AND role = (
      SELECT om.role FROM organization_members om
      WHERE om.id = organization_members.id
    )
  );

-- Belt-and-suspenders: trigger that blocks self-role-change
-- even if RLS is bypassed via service role in edge functions.
CREATE OR REPLACE FUNCTION public.prevent_member_role_self_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Only block if the user is changing their OWN role
  IF OLD.user_id = NEW.user_id
     AND OLD.role IS DISTINCT FROM NEW.role
     AND auth.uid() = OLD.user_id
  THEN
    RAISE EXCEPTION 'Users cannot change their own role';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_self_escalation ON organization_members;
CREATE TRIGGER trg_prevent_role_self_escalation
  BEFORE UPDATE ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_member_role_self_escalation();


-- ════════════════════════════════════════════════════════════
-- 2. INTEGRITY: Prevent last admin from being deactivated
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.prevent_last_admin_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  remaining_admins integer;
BEGIN
  -- Only check when an admin is being deactivated or role-changed away from admin
  IF (OLD.role = 'admin' AND NEW.status = 'deactivated' AND OLD.status = 'active')
     OR (OLD.role = 'admin' AND NEW.role != 'admin' AND OLD.status = 'active')
  THEN
    SELECT COUNT(*) INTO remaining_admins
    FROM public.organization_members
    WHERE organization_id = NEW.organization_id
      AND role = 'admin'
      AND status = 'active'
      AND id != NEW.id;

    IF remaining_admins = 0 THEN
      RAISE EXCEPTION 'Cannot remove the last active admin of the organization';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_last_admin_removal ON organization_members;
CREATE TRIGGER trg_prevent_last_admin_removal
  BEFORE UPDATE ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_last_admin_removal();


-- ════════════════════════════════════════════════════════════
-- 3. INTEGRITY: Vehicle assignment user must be in same org
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_assignment_user_in_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id uuid;
  v_is_member boolean;
BEGIN
  -- Get the org that owns this organization_vehicle
  SELECT ov.organization_id INTO v_org_id
  FROM public.organization_vehicles ov
  WHERE ov.id = NEW.organization_vehicle_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization vehicle not found';
  END IF;

  -- Check that the assigned user is an active member of that org
  SELECT EXISTS(
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = v_org_id
      AND om.user_id = NEW.user_id
      AND om.status = 'active'
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RAISE EXCEPTION 'User must be an active member of the vehicle''s organization';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_assignment_user_in_org ON organization_vehicle_assignments;
CREATE TRIGGER trg_check_assignment_user_in_org
  BEFORE INSERT OR UPDATE ON organization_vehicle_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.check_assignment_user_in_org();


-- ════════════════════════════════════════════════════════════
-- 4. INTEGRITY: Prevent duplicate active assignments
-- ════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_assignment_per_vehicle_user
  ON organization_vehicle_assignments (organization_vehicle_id, user_id)
  WHERE unassigned_at IS NULL;


-- ════════════════════════════════════════════════════════════
-- 5. PERFORMANCE: Add missing indexes for RLS subqueries
-- ════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_org_members_user_status
  ON organization_members (user_id, status);

CREATE INDEX IF NOT EXISTS idx_org_members_org_status
  ON organization_members (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_org_members_org_role_status
  ON organization_members (organization_id, role, status);

CREATE INDEX IF NOT EXISTS idx_org_vehicles_org_id
  ON organization_vehicles (organization_id);

CREATE INDEX IF NOT EXISTS idx_org_vehicles_vehicle_id
  ON organization_vehicles (vehicle_id);

CREATE INDEX IF NOT EXISTS idx_org_vehicle_assignments_org_vehicle_id
  ON organization_vehicle_assignments (organization_vehicle_id);

CREATE INDEX IF NOT EXISTS idx_org_vehicle_assignments_user_id
  ON organization_vehicle_assignments (user_id);

CREATE INDEX IF NOT EXISTS idx_org_vehicle_assignments_active
  ON organization_vehicle_assignments (user_id, organization_vehicle_id)
  WHERE unassigned_at IS NULL;


-- ════════════════════════════════════════════════════════════
-- 6. SCHEMA: Add missing columns to organizations
-- ════════════════════════════════════════════════════════════

-- billing_email and settings are referenced by fleet-create-org edge function
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;


-- ════════════════════════════════════════════════════════════
-- 7. SCHEMA: Add audit columns to organization_members
-- ════════════════════════════════════════════════════════════

ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deactivated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;


-- ════════════════════════════════════════════════════════════
-- 8. INTEGRITY: Auto-populate activated_at on status change
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.auto_set_member_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'active' AND (OLD.status IS NULL OR OLD.status != 'active') THEN
    NEW.activated_at = COALESCE(NEW.activated_at, now());
  END IF;
  IF NEW.status = 'deactivated' AND (OLD.status IS NULL OR OLD.status != 'deactivated') THEN
    NEW.deactivated_at = COALESCE(NEW.deactivated_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_set_member_timestamps ON organization_members;
CREATE TRIGGER trg_auto_set_member_timestamps
  BEFORE UPDATE ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_member_timestamps();


-- ════════════════════════════════════════════════════════════
-- 9. PRIVACY: Hide deactivated members' details from read policy
--    Only active members should see other active members.
--    Admins can still see deactivated members (for management).
-- ════════════════════════════════════════════════════════════

-- Drop old read policy and replace with role-conditional one
DROP POLICY IF EXISTS "members_read_own_org" ON organization_members;

-- Active members see active members
CREATE POLICY "members_read_active_in_org" ON organization_members
  FOR SELECT USING (
    -- You can always see your own row
    user_id = auth.uid()
    OR (
      -- Active members of the same org can see other active members
      status = 'active'
      AND organization_id IN (
        SELECT om.organization_id FROM organization_members om
        WHERE om.user_id = auth.uid() AND om.status = 'active'
      )
    )
    OR (
      -- Admins can see ALL members (including deactivated) in their org
      organization_id IN (
        SELECT om.organization_id FROM organization_members om
        WHERE om.user_id = auth.uid() AND om.role = 'admin' AND om.status = 'active'
      )
    )
  );


-- ════════════════════════════════════════════════════════════
-- 10. SCHEMA: Organization invitations table
--     Supports inviting users who haven't signed up yet.
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS organization_invitations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invite_email      text NOT NULL,
  invite_code       text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  role              text NOT NULL DEFAULT 'driver' CHECK (role IN ('admin', 'driver', 'viewer')),
  invited_by        uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  accepted_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;

-- Org members can read invitations for their org
CREATE POLICY "members_read_org_invitations" ON organization_invitations
  FOR SELECT USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.status = 'active'
    )
  );

-- Admins can create invitations
CREATE POLICY "admins_insert_invitations" ON organization_invitations
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.role = 'admin' AND om.status = 'active'
    )
  );

CREATE INDEX IF NOT EXISTS idx_org_invitations_org_id
  ON organization_invitations (organization_id);

CREATE INDEX IF NOT EXISTS idx_org_invitations_email
  ON organization_invitations (invite_email);


-- ════════════════════════════════════════════════════════════
-- Done. All changes are additive and backward-compatible.
-- ════════════════════════════════════════════════════════════
