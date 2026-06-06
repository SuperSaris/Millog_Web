import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

// Profile row — includes Stripe billing fields added in migration 004
export interface UserProfile {
  id: string;
  full_name: string | null;
  email: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string;
  subscription_plan: string | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
}

// Canonical cross-platform entitlement row from `entitlements`
export interface Entitlement {
  is_active: boolean;
  status: string | null;
  expires_at: string | null;
  source: "none" | "stripe" | "revenuecat" | "combined" | "manual";
  plan: string | null;
  product_id: string | null;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** Profile row from the `profiles` table — null while loading or signed out */
  profile: UserProfile | null;
  profileLoading: boolean;
  /** Canonical merged entitlement row (Stripe + RevenueCat) */
  entitlement: Entitlement | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** Refresh the profile row after a subscription change */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    setProfileLoading(true);

    // Fetch profile + canonical entitlements in parallel
    const [profileResult, entitlementResult] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "id, full_name, email, stripe_customer_id, stripe_subscription_id, subscription_status, subscription_plan, current_period_end, trial_ends_at",
        )
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("entitlements")
        .select("is_active, status, expires_at, source, plan, product_id")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    if (profileResult.error) {
      logger.warn("AuthContext", "Failed to fetch profile", { error: profileResult.error.message });
    }
    if (entitlementResult.error) {
      logger.warn("AuthContext", "Failed to fetch entitlements", { error: entitlementResult.error.message });
    }

    setProfile((profileResult.data as UserProfile | null) ?? null);
    setEntitlement((entitlementResult.data as Entitlement | null) ?? null);
    setProfileLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
      logger.setUser(s?.user?.id);
      logger.info("AuthContext", "Session restored", { hasUser: !!s?.user });
      if (s?.user) fetchProfile(s.user.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      logger.setUser(s?.user?.id);
      logger.info("AuthContext", "Auth state changed", { event, hasUser: !!s?.user });
      if (s?.user) {
        fetchProfile(s.user.id);
      } else {
        setProfile(null);
        setEntitlement(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      logger.info("AuthContext", "Sign-in attempt");
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        logger.warn("AuthContext", "Sign-in failed", { reason: error.message });
      }
      return { error: error?.message ?? null };
    },
    [],
  );

  const signOut = useCallback(async () => {
    logger.info("AuthContext", "Sign-out");
    await supabase.auth.signOut();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  return (
    <AuthContext.Provider
      value={{ user, session, loading, profile, profileLoading, entitlement, signIn, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
