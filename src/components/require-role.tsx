import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/auth-context";
import { useOrg, type OrgRole } from "@/contexts/org-context";
import { Skeleton } from "@/components/ui/skeleton";

interface RequireRoleProps {
  /** Roles allowed to view children. Empty = just require auth + org membership. */
  roles?: OrgRole[];
  children: React.ReactNode;
}

/**
 * Route guard — wraps children and redirects if the user doesn't meet requirements.
 *
 * - Not logged in → /login
 * - No org membership → /personal (personal user, not a fleet member)
 * - Wrong role → /personal
 */
export function RequireRole({ roles, children }: RequireRoleProps) {
  const { user, loading: authLoading } = useAuth();
  const { role, isFleetUser, loading: orgLoading } = useOrg();

  if (authLoading || orgLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isFleetUser) {
    return <Navigate to="/personal" replace />;
  }

  if (roles && roles.length > 0 && role && !roles.includes(role)) {
    return <Navigate to="/personal" replace />;
  }

  return <>{children}</>;
}
