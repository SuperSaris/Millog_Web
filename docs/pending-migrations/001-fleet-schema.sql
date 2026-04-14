-- ============================================================
-- Fleet Management Schema — DEPLOYED
-- ============================================================
-- Deployed as migration "create_fleet_management_tables" on 2026-04-14.
-- Tables created first, then RLS policies (to avoid forward references).
--
-- This file is kept as local reference.
-- ============================================================

-- ── Organizations ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  org_number  text,              -- Swedish organisationsnummer (optional)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Members of the org can read their own org row
CREATE POLICY "org_members_read" ON organizations
  FOR SELECT USING (
    id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Only admins can update their org
CREATE POLICY "org_admins_update" ON organizations
  FOR UPDATE USING (
    id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role = 'admin' AND status = 'active'
    )
  );

-- ── Organization Members ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS organization_members (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role              text NOT NULL DEFAULT 'driver' CHECK (role IN ('admin', 'driver', 'viewer')),
  status            text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'deactivated')),
  invited_at        timestamptz NOT NULL DEFAULT now(),
  activated_at      timestamptz,
  deactivated_at    timestamptz,
  UNIQUE (organization_id, user_id)
);

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- Members can read other members in the same org
CREATE POLICY "members_read_own_org" ON organization_members
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members AS om
      WHERE om.user_id = auth.uid() AND om.status = 'active'
    )
  );

-- Admins can insert (invite) new members
CREATE POLICY "admins_insert_members" ON organization_members
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members AS om
      WHERE om.user_id = auth.uid() AND om.role = 'admin' AND om.status = 'active'
    )
  );

-- Admins can update members (deactivate, reactivate, role change)
CREATE POLICY "admins_update_members" ON organization_members
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members AS om
      WHERE om.user_id = auth.uid() AND om.role = 'admin' AND om.status = 'active'
    )
  );

-- Users can update their own membership (e.g., activate after invite)
CREATE POLICY "users_update_own_membership" ON organization_members
  FOR UPDATE USING (user_id = auth.uid());

-- ── Organization Vehicles ────────────────────────────────────

CREATE TABLE IF NOT EXISTS organization_vehicles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  vehicle_id        uuid NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  display_label     text,
  pool_car          boolean NOT NULL DEFAULT false,
  added_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, vehicle_id)
);

ALTER TABLE organization_vehicles ENABLE ROW LEVEL SECURITY;

-- Members can read vehicles in their org
CREATE POLICY "members_read_org_vehicles" ON organization_vehicles
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- Admins can insert vehicles
CREATE POLICY "admins_insert_vehicles" ON organization_vehicles
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role = 'admin' AND status = 'active'
    )
  );

-- Admins can update vehicles (label, pool_car)
CREATE POLICY "admins_update_vehicles" ON organization_vehicles
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role = 'admin' AND status = 'active'
    )
  );

-- ── Organization Vehicle Assignments ─────────────────────────

CREATE TABLE IF NOT EXISTS organization_vehicle_assignments (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_vehicle_id   uuid NOT NULL REFERENCES organization_vehicles(id) ON DELETE CASCADE,
  user_id                   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_primary                boolean NOT NULL DEFAULT false,
  assigned_at               timestamptz NOT NULL DEFAULT now(),
  unassigned_at             timestamptz   -- null = currently assigned
);

ALTER TABLE organization_vehicle_assignments ENABLE ROW LEVEL SECURITY;

-- Members can read assignments in their org
CREATE POLICY "members_read_assignments" ON organization_vehicle_assignments
  FOR SELECT USING (
    organization_vehicle_id IN (
      SELECT ov.id FROM organization_vehicles ov
      JOIN organization_members om ON om.organization_id = ov.organization_id
      WHERE om.user_id = auth.uid() AND om.status = 'active'
    )
  );

-- Admins can manage assignments
CREATE POLICY "admins_insert_assignments" ON organization_vehicle_assignments
  FOR INSERT WITH CHECK (
    organization_vehicle_id IN (
      SELECT ov.id FROM organization_vehicles ov
      JOIN organization_members om ON om.organization_id = ov.organization_id
      WHERE om.user_id = auth.uid() AND om.role = 'admin' AND om.status = 'active'
    )
  );

CREATE POLICY "admins_update_assignments" ON organization_vehicle_assignments
  FOR UPDATE USING (
    organization_vehicle_id IN (
      SELECT ov.id FROM organization_vehicles ov
      JOIN organization_members om ON om.organization_id = ov.organization_id
      WHERE om.user_id = auth.uid() AND om.role = 'admin' AND om.status = 'active'
    )
  );

-- ── Helper: profiles view for join convenience ───────────────
-- The frontend joins organization_members → profiles(full_name, email).
-- This assumes a `profiles` table already exists with columns:
--   id (uuid, = auth.users.id), full_name (text), email (text)
-- If it doesn't exist, create it:

-- CREATE TABLE IF NOT EXISTS profiles (
--   id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
--   full_name  text,
--   email      text NOT NULL
-- );
-- ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "profiles_read_all" ON profiles FOR SELECT USING (true);
-- CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (id = auth.uid());
