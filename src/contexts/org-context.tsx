import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

/* ── Types ─────────────────────────────────────────────── */

export type OrgRole = "admin" | "viewer" | "driver";
export type MemberStatus = "active" | "invited" | "deactivated";

export interface Organization {
  id: string;
  name: string;
  org_number: string | null;
  billing_email: string | null;
  settings: Record<string, unknown>;
  created_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgRole;
  status: MemberStatus;
  invited_at: string;
  activated_at: string | null;
  deactivated_at: string | null;
}

interface OrgContextValue {
  organization: Organization | null;
  membership: OrganizationMember | null;
  role: OrgRole | null;
  isAdmin: boolean;
  isFleetUser: boolean;
  loading: boolean;
  /** Re-fetch org data (e.g. after settings change) */
  refresh: () => Promise<void>;
}

const OrgContext = createContext<OrgContextValue | undefined>(undefined);

/* ── Provider ──────────────────────────────────────────── */

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [membership, setMembership] = useState<OrganizationMember | null>(null);
  const [loading, setLoading] = useState(true);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);

  const fetchOrg = useCallback(async () => {
    if (!user) {
      logger.debug("OrgContext", "No user — skipping fetch");
      setOrganization(null);
      setMembership(null);
      setLoading(false);
      return;
    }

    logger.info("OrgContext", "Fetching membership", { userId: user.id });
    setLoading(true);

    // 1. Get user's active membership
    const { data: memberRow, error: memberErr } = await supabase
      .from("organization_members")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (memberErr) {
      logger.error("OrgContext", "Failed to fetch membership", {
        code: memberErr.code,
        message: memberErr.message,
      });
    }

    if (!memberRow) {
      logger.info("OrgContext", "No active membership found");
      setOrganization(null);
      setMembership(null);
      setLoading(false);
      return;
    }

    logger.info("OrgContext", "Membership loaded", {
      role: (memberRow as OrganizationMember).role,
      orgId: (memberRow as OrganizationMember).organization_id,
    });
    setMembership(memberRow as OrganizationMember);

    // 2. Fetch the organization
    const { data: orgRow, error: orgErr } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", memberRow.organization_id)
      .single();

    if (orgErr) {
      logger.error("OrgContext", "Failed to fetch organization", {
        code: orgErr.code,
        message: orgErr.message,
      });
    }

    if (orgRow) {
      logger.info("OrgContext", "Organization loaded", {
        orgName: (orgRow as Organization).name,
      });
      setOrganization(orgRow as Organization);
    }

    setLoading(false);
  }, [user]);

  // Initial fetch + automatic retry if org is null after signup race condition.
  // When signUp fires, auth state changes immediately but the Edge Function
  // that creates the org membership may still be in-flight. One retry after
  // 2 s covers this window. Personal users (no org) stop after that 1 retry.
  useEffect(() => {
    fetchOrg();
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [fetchOrg]);

  // Reset retry counter whenever the user identity changes.
  useEffect(() => {
    retryCount.current = 0;
  }, [user?.id]);

  useEffect(() => {
    // Personal users have no org membership — stop after 1 retry to avoid
    // an infinite loop. The retry covers the race window where the Edge
    // Function that creates an org membership is still in-flight after signup.
    const MAX_RETRIES = 1;
    if (!loading && user && !membership && retryCount.current < MAX_RETRIES) {
      retryCount.current += 1;
      logger.info("OrgContext", "No membership after fetch — scheduling retry in 2s");
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => {
        logger.info("OrgContext", "Retrying membership fetch");
        fetchOrg();
        retryTimer.current = null;
      }, 2000);
    }
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [loading, user, membership, fetchOrg]);

  const role = membership?.role ?? null;

  return (
    <OrgContext.Provider
      value={{
        organization,
        membership,
        role,
        isAdmin: role === "admin",
        isFleetUser: !!membership,
        loading,
        refresh: fetchOrg,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

/* ── Hook ──────────────────────────────────────────────── */

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used inside OrgProvider");
  return ctx;
}
