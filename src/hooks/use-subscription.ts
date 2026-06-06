import { useMemo } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useOrg } from "@/contexts/org-context";

export type SubscriptionStatus =
  | "inactive"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "cancelled"
  | "expired"
  | "billing_issue";

export type SubscriptionPlan =
  | "fleet_monthly"
  | "personal_monthly"
  | "personal_annual"
  | null;

export interface SubscriptionInfo {
  /** Raw status string from DB */
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  /** True when the user can access gated features (active or trialing) */
  isActive: boolean;
  /** True when subscription was active but last payment failed */
  isPastDue: boolean;
  /** True when subscription has been fully canceled or is inactive */
  isCanceled: boolean;
  /** True when still in a free trial */
  isTrialing: boolean;
  /** ISO string of when the current period (or trial) ends */
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  /** How many days until trial/subscription ends. null if no date. */
  daysUntilExpiry: number | null;
  /** Whether the trial is ending soon (≤7 days) */
  trialEndingSoon: boolean;
  /** "fleet" | "personal" — which billing entity this user belongs to */
  userType: "fleet" | "personal";
  /** Number of billable vehicle seats (fleet only) */
  quantity: number;
  /** Whether billing data has finished loading */
  loading: boolean;
}

/**
 * useSubscription — unified subscription state for both fleet and personal users.
 *
 * Fleet users: reads from organization (org-level billing).
 * Personal users: reads from user profile (user-level billing).
 *
 * Usage:
 *   const sub = useSubscription();
 *   if (!sub.isActive) return <UpgradePrompt />;
 */
export function useSubscription(): SubscriptionInfo {
  const { profile, profileLoading, entitlement } = useAuth();
  const { organization, membership, loading: orgLoading } = useOrg();

  return useMemo(() => {
    const isFleet = !!membership;
    const loading = isFleet ? orgLoading : profileLoading;

    // ── Source of truth ──────────────────────────────────────
    let rawStatus: string;
    let plan: SubscriptionPlan;
    let currentPeriodEnd: string | null;
    let trialEndsAt: string | null;
    let quantity: number;

    if (isFleet && organization) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const org = organization as any;
      rawStatus       = org.subscription_status ?? "inactive";
      plan            = (org.subscription_plan as SubscriptionPlan) ?? null;
      currentPeriodEnd = org.current_period_end ?? null;
      trialEndsAt     = org.trial_ends_at ?? null;
      quantity        = org.subscription_quantity ?? 0;
    } else if (!isFleet && profile) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = profile as any;
      rawStatus       = p.subscription_status ?? "inactive";
      plan            = (p.subscription_plan as SubscriptionPlan) ?? null;
      currentPeriodEnd = p.current_period_end ?? null;
      trialEndsAt     = p.trial_ends_at ?? null;
      quantity        = 1;
    } else {
      rawStatus       = "inactive";
      plan            = null;
      currentPeriodEnd = null;
      trialEndsAt     = null;
      quantity        = 0;
    }

    const status = (isFleet
      ? rawStatus
      : entitlement?.status ?? rawStatus) as SubscriptionStatus;

    // Canonical source of truth for personal users is `entitlements`.
    const entitlementIsActive = !isFleet && (entitlement?.is_active ?? false);
    const fallbackStripeActive = status === "active" || status === "trialing";

    const isActive = isFleet ? fallbackStripeActive : (entitlementIsActive || fallbackStripeActive);
    const isPastDue   = !isActive && (status === "past_due" || status === "unpaid" || status === "billing_issue");
    const isCanceled  = !isActive && (
      status === "canceled" ||
      status === "cancelled" ||
      status === "inactive" ||
      status === "expired"
    );
    const isTrialing  = status === "trialing";

    // ── Days until expiry ────────────────────────────────────
    const entitlementExpiry = !isFleet ? (entitlement?.expires_at ?? null) : null;
    const expiryDateStr = isTrialing
      ? (trialEndsAt ?? currentPeriodEnd ?? entitlementExpiry)
      : (currentPeriodEnd ?? entitlementExpiry);
    let daysUntilExpiry: number | null = null;
    if (expiryDateStr) {
      const ms = new Date(expiryDateStr).getTime() - Date.now();
      daysUntilExpiry = Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
    }

    const trialEndingSoon = isTrialing && daysUntilExpiry !== null && daysUntilExpiry <= 7;

    return {
      status,
      plan,
      isActive,
      isPastDue,
      isCanceled,
      isTrialing,
      currentPeriodEnd,
      trialEndsAt,
      daysUntilExpiry,
      trialEndingSoon,
      userType: isFleet ? "fleet" : "personal",
      quantity,
      loading,
    };
  }, [membership, organization, orgLoading, profile, profileLoading, entitlement]);
}
