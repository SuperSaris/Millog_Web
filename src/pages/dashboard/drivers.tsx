import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth-context";
import { useOrg } from "@/contexts/org-context";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  IconUserPlus,
  IconDotsVertical,
  IconUser,
  IconMail,
} from "@tabler/icons-react";
import { toast } from "sonner";

/* ── Types ─────────────────────────────────────────────── */

interface DriverRow {
  user_id: string;
  role: string;
  status: string;
  invited_at: string;
  activated_at: string | null;
  profile: {
    full_name: string | null;
    email: string;
  } | null;
}

/* ── Skeleton ──────────────────────────────────────────── */

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-4 border-b pb-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}



/* ── Status Badge ──────────────────────────────────────── */

function StatusBadge({ status, t }: { status: string; t: (k: string) => string }) {
  switch (status) {
    case "active":
      return <Badge variant="default">{t("drivers.statusActive")}</Badge>;
    case "invited":
      return <Badge variant="secondary">{t("drivers.statusInvited")}</Badge>;
    case "deactivated":
      return <Badge variant="outline" className="text-muted-foreground">{t("drivers.statusDeactivated")}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

/* ── Main Page ─────────────────────────────────────────── */

export function DriversPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { organization, isAdmin } = useOrg();
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDrivers = useCallback(async () => {
    if (!user || !organization) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data } = await supabase
      .from("organization_members")
      .select("user_id, role, status, invited_at, activated_at, profiles(full_name, email)")
      .eq("organization_id", organization.id)
      .order("invited_at", { ascending: false });

    if (data) {
      const mapped = data.map((row: Record<string, unknown>) => ({
        user_id: row.user_id as string,
        role: row.role as string,
        status: row.status as string,
        invited_at: row.invited_at as string,
        activated_at: row.activated_at as string | null,
        profile: row.profiles as { full_name: string | null; email: string } | null,
      }));
      setDrivers(mapped);
    }
    setLoading(false);
  }, [user, organization]);

  useEffect(() => {
    fetchDrivers();
  }, [fetchDrivers]);

  const handleDeactivate = async (userId: string) => {
    if (!organization) return;
    await supabase
      .from("organization_members")
      .update({ status: "deactivated", deactivated_at: new Date().toISOString() })
      .eq("organization_id", organization.id)
      .eq("user_id", userId);
    toast.success(t("drivers.deactivated"));
    fetchDrivers();
  };

  const handleReactivate = async (userId: string) => {
    if (!organization) return;
    await supabase
      .from("organization_members")
      .update({ status: "active", deactivated_at: null })
      .eq("organization_id", organization.id)
      .eq("user_id", userId);
    toast.success(t("drivers.reactivated"));
    fetchDrivers();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("drivers.title")}</h1>
          <p className="text-muted-foreground">{t("drivers.description")}</p>
        </div>
        {isAdmin && organization && (
          <Button onClick={() => navigate("/dashboard/drivers/invite")}>
            <IconUserPlus className="mr-2 h-4 w-4" />
            {t("drivers.inviteDriver")}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {t("drivers.allDrivers")} {!loading && `(${drivers.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton />
          ) : drivers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <IconUser className="h-10 w-10 text-muted-foreground/50" />
              <p className="mt-3 text-muted-foreground">{t("drivers.noDrivers")}</p>
              {isAdmin && (
                <p className="text-sm text-muted-foreground">{t("drivers.noDriversHint")}</p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("drivers.nameLabel")}</TableHead>
                  <TableHead>{t("auth.email")}</TableHead>
                  <TableHead>{t("drivers.roleLabel")}</TableHead>
                  <TableHead>{t("drivers.statusLabel")}</TableHead>
                  <TableHead>{t("drivers.addedLabel")}</TableHead>
                  {isAdmin && <TableHead className="w-[50px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {drivers.map((d) => (
                  <TableRow
                    key={d.user_id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/dashboard/drivers/${d.user_id}`)}
                  >
                    <TableCell className="font-medium">
                      {d.profile?.full_name || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <IconMail className="h-3.5 w-3.5 text-muted-foreground" />
                        {d.profile?.email || "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {t(`drivers.role${d.role.charAt(0).toUpperCase()}${d.role.slice(1)}` as "drivers.roleDriver")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={d.status} t={t} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(d.invited_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <IconDotsVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/dashboard/drivers/${d.user_id}`); }}>
                              {t("drivers.viewDetails")}
                            </DropdownMenuItem>
                            {d.status === "active" ? (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={(e) => { e.stopPropagation(); handleDeactivate(d.user_id); }}
                              >
                                {t("drivers.deactivate")}
                              </DropdownMenuItem>
                            ) : d.status === "deactivated" ? (
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleReactivate(d.user_id); }}>
                                {t("drivers.reactivate")}
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
