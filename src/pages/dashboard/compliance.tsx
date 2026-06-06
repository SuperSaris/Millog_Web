import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth-context";
import { useOrg } from "@/contexts/org-context";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { IconCheck, IconAlertTriangle, IconTag } from "@tabler/icons-react";
import { toast } from "sonner";

/* ── Types ─────────────────────────────────────────────── */

interface UntaggedTrip {
  id: string;
  started_at: string;
  ended_at: string | null;
  distance_km: number | null;
  start_address: string | null;
  end_address: string | null;
  user_id: string;
  driver_name: string;
  vehicle_label: string;
}

type TripTag = "work" | "commute" | "personal";

/* ── Skeleton ──────────────────────────────────────────── */

function ComplianceTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-4 border-b pb-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      ))}
    </div>
  );
}

/* ── Main Page ─────────────────────────────────────────── */

export function CompliancePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { organization } = useOrg();
  const [trips, setTrips] = useState<UntaggedTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTag, setBulkTag] = useState<TripTag | "">("");

  const fetchUntagged = useCallback(async () => {
    if (!user || !organization) {
      setLoading(false);
      return;
    }
    setLoading(true);

    // Fetch org member user IDs first
    const { data: members } = await supabase
      .from("organization_members")
      .select("user_id, profiles(full_name, email)")
      .eq("organization_id", organization.id)
      .eq("status", "active");

    if (!members || members.length === 0) {
      setTrips([]);
      setLoading(false);
      return;
    }

    const userIds = members.map((m: Record<string, unknown>) => m.user_id as string);
    const memberMap = new Map(
      members.map((m: Record<string, unknown>) => {
        const p = m.profiles as { full_name: string | null; email: string } | null;
        return [m.user_id as string, p?.full_name || p?.email || "?"];
      }),
    );

    // Fetch untagged trips for those users
    const { data: tripData } = await supabase
      .from("trips")
      .select("id, started_at, ended_at, distance_km, start_address, end_address, user_id, vehicle_id")
      .in("user_id", userIds)
      .is("tag", null)
      .is("superseded_by", null)
      .not("ended_at", "is", null)
      .order("started_at", { ascending: false })
      .limit(100);

    // Build vehicle label map from org vehicles
    const vehicleLabelMap = new Map<string, string>();
    if (tripData && tripData.length > 0) {
      const vehicleIds = [...new Set(tripData.map((tr) => tr.vehicle_id).filter(Boolean))];
      if (vehicleIds.length > 0) {
        const { data: ovData } = await supabase
          .from("organization_vehicles")
          .select("vehicle_id, display_label, vehicles(model, vin)")
          .eq("organization_id", organization.id)
          .in("vehicle_id", vehicleIds);

        if (ovData) {
          for (const ov of ovData) {
            const v = (ov.vehicles as unknown) as { model: string | null; vin: string | null } | null;
            const label = ov.display_label || v?.model || (v?.vin ? `…${v.vin.slice(-6)}` : "");
            vehicleLabelMap.set(ov.vehicle_id, label);
          }
        }
      }
    }

    if (tripData) {
      setTrips(
        tripData.map((tr) => ({
          ...tr,
          driver_name: memberMap.get(tr.user_id) || "?",
          vehicle_label: vehicleLabelMap.get(tr.vehicle_id) || "",
        })),
      );
    }

    setLoading(false);
  }, [user, organization]);

  useEffect(() => {
    fetchUntagged();
  }, [fetchUntagged]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === trips.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(trips.map((t) => t.id)));
    }
  };

  const handleBulkTag = async () => {
    if (!bulkTag || selected.size === 0) return;
    const ids = Array.from(selected);
    const { error } = await supabase
      .from("trips")
      .update({ tag: bulkTag })
      .in("id", ids);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(t("compliance.taggedCount", { count: ids.length }));
    setSelected(new Set());
    setBulkTag("");
    fetchUntagged();
  };

  const handleTagSingle = async (tripId: string, tag: TripTag) => {
    const { error } = await supabase
      .from("trips")
      .update({ tag })
      .eq("id", tripId);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("compliance.tagged"));
    fetchUntagged();
  };

  const tagLabel = (tag: TripTag) =>
    t(`compliance.tag${tag.charAt(0).toUpperCase()}${tag.slice(1)}` as "compliance.tagWork");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("compliance.title")}</h1>
        <p className="text-muted-foreground">{t("compliance.description")}</p>
      </div>

      {/* Summary card */}
      <div className="flex gap-4">
        <Card className="flex-1">
          <CardContent className="flex items-center gap-3 py-4">
            {trips.length === 0 ? (
              <>
                <IconCheck className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium">{t("compliance.allTagged")}</span>
              </>
            ) : (
              <>
                <IconAlertTriangle className="h-5 w-5 text-amber-500" />
                <span className="text-sm font-medium">
                  {t("compliance.untaggedCount", { count: trips.length })}
                </span>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3">
          <span className="text-sm font-medium">
            {t("compliance.selectedCount", { count: selected.size })}
          </span>
          <Select value={bulkTag} onValueChange={(v) => setBulkTag(v as TripTag)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t("compliance.selectTag")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="work">{tagLabel("work")}</SelectItem>
              <SelectItem value="commute">{tagLabel("commute")}</SelectItem>
              <SelectItem value="personal">{tagLabel("personal")}</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleBulkTag} disabled={!bulkTag}>
            <IconTag className="mr-1.5 h-4 w-4" />
            {t("compliance.applyTag")}
          </Button>
        </div>
      )}

      {/* Trip table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("compliance.untaggedTrips")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <ComplianceTableSkeleton />
          ) : trips.length === 0 ? (
            <div className="flex flex-col items-center py-8">
              <IconCheck className="h-10 w-10 text-green-500/50" />
              <p className="mt-3 text-muted-foreground">{t("compliance.allTagged")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      checked={selected.size === trips.length}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-border"
                    />
                  </TableHead>
                  <TableHead>{t("compliance.date")}</TableHead>
                  <TableHead>{t("compliance.driver")}</TableHead>
                  <TableHead>{t("compliance.route")}</TableHead>
                  <TableHead>{t("compliance.distance")}</TableHead>
                  <TableHead>{t("compliance.action")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trips.map((trip) => (
                  <TableRow key={trip.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selected.has(trip.id)}
                        onChange={() => toggleSelect(trip.id)}
                        className="h-4 w-4 rounded border-border"
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {new Date(trip.started_at).toLocaleDateString("sv-SE")}
                    </TableCell>
                    <TableCell className="text-sm">{trip.driver_name}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">
                      {trip.start_address ?? "?"} → {trip.end_address ?? "?"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {trip.distance_km != null ? `${trip.distance_km.toFixed(1)} km` : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {(["work", "commute", "personal"] as TripTag[]).map((tag) => (
                          <Button
                            key={tag}
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleTagSingle(trip.id, tag)}
                          >
                            {tagLabel(tag)}
                          </Button>
                        ))}
                      </div>
                    </TableCell>
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
