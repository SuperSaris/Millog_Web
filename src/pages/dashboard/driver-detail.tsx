import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useOrg } from "@/contexts/org-context";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  IconArrowLeft,
  IconMapPin,
  IconCar,
  IconTag,
} from "@tabler/icons-react";

interface DriverProfile {
  id: string;
  full_name: string | null;
  email: string;
}

interface MemberInfo {
  role: string;
  status: string;
  invited_at: string;
  activated_at: string | null;
}

interface Trip {
  id: string;
  started_at: string;
  ended_at: string | null;
  start_address: string | null;
  end_address: string | null;
  distance_km: number | null;
  tag: string | null;
  energy_used_kwh: number | null;
}

interface VehicleAssignment {
  display_label: string | null;
  vehicle_id: string;
}

const TAG_COLORS: Record<string, string> = {
  work: "bg-blue-500/20 text-blue-400",
  commute: "bg-purple-500/20 text-purple-400",
  personal: "bg-green-500/20 text-green-400",
};

export function DriverDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { organization } = useOrg();
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [member, setMember] = useState<MemberInfo | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [vehicles, setVehicles] = useState<VehicleAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!id || !user || !organization) return;

    setLoading(true);

    // Fetch profile
    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("id", id)
      .single();

    if (profileData) setProfile(profileData as DriverProfile);

    // Fetch membership
    const { data: memberData } = await supabase
      .from("organization_members")
      .select("role, status, invited_at, activated_at")
      .eq("organization_id", organization.id)
      .eq("user_id", id)
      .single();

    if (memberData) setMember(memberData as MemberInfo);

    // Fetch recent trips
    const { data: tripData } = await supabase
      .from("trips")
      .select("id, started_at, ended_at, start_address, end_address, distance_km, tag, energy_used_kwh")
      .eq("user_id", id)
      .is("superseded_by", null)
      .order("started_at", { ascending: false })
      .limit(50);

    if (tripData) setTrips(tripData as Trip[]);

    // Fetch vehicle assignments
    const { data: assignmentData } = await supabase
      .from("organization_vehicle_assignments")
      .select("organization_vehicles(display_label, vehicle_id)")
      .eq("user_id", id)
      .is("unassigned_at", null);

    if (assignmentData) {
      const mapped = assignmentData
        .map((a: Record<string, unknown>) => {
          const ov = a.organization_vehicles as Record<string, unknown> | null;
          return ov ? { display_label: ov.display_label as string | null, vehicle_id: ov.vehicle_id as string } : null;
        })
        .filter(Boolean) as VehicleAssignment[];
      setVehicles(mapped);
    }

    setLoading(false);
  }, [id, user, organization]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate("/dashboard/drivers")}>
          <IconArrowLeft className="mr-2 h-4 w-4" />
          {t("common.back")}
        </Button>
        <p className="text-muted-foreground">{t("drivers.notFound")}</p>
      </div>
    );
  }

  const totalKm = trips.reduce((sum, t) => sum + (t.distance_km ?? 0), 0);
  const workTrips = trips.filter((t) => t.tag === "work");
  const untagged = trips.filter((t) => !t.tag);
  const workPct = trips.length > 0 ? Math.round((workTrips.length / trips.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/drivers")}>
          <IconArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {profile.full_name || profile.email}
          </h1>
          <p className="text-muted-foreground">{profile.email}</p>
        </div>
        {member && (
          <Badge variant={member.status === "active" ? "default" : "secondary"} className="ml-auto">
            {member.status === "active" ? t("drivers.statusActive") : t("drivers.statusInvited")}
          </Badge>
        )}
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t("dashboard.totalKm")}</p>
            <p className="text-2xl font-bold">{Math.round(totalKm)} km</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t("drivers.workPercent")}</p>
            <p className="text-2xl font-bold">{workPct}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t("drivers.untaggedCount")}</p>
            <p className="text-2xl font-bold">{untagged.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{t("drivers.assignedVehicles")}</p>
            <div className="flex items-center gap-2">
              <IconCar className="h-5 w-5 text-muted-foreground" />
              <p className="text-lg font-semibold">
                {vehicles.length > 0
                  ? vehicles.map((v) => v.display_label || t("vehicles.unnamed")).join(", ")
                  : t("drivers.noVehicle")}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trips table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("drivers.recentTrips")} ({trips.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {trips.length === 0 ? (
            <p className="text-muted-foreground">{t("dashboard.noTrips")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("drivers.tripDate")}</TableHead>
                  <TableHead>{t("drivers.tripRoute")}</TableHead>
                  <TableHead className="text-right">{t("drivers.tripDistance")}</TableHead>
                  <TableHead className="text-right">{t("drivers.tripEnergy")}</TableHead>
                  <TableHead>{t("drivers.tripTag")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trips.map((trip) => (
                  <TableRow key={trip.id}>
                    <TableCell className="whitespace-nowrap">
                      {new Date(trip.started_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      <div className="flex items-center gap-1">
                        <IconMapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">
                          {trip.start_address ?? t("personal.unknownAddress")} → {trip.end_address ?? t("personal.unknownAddress")}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {trip.distance_km ? `${trip.distance_km.toFixed(1)} km` : "—"}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {trip.energy_used_kwh ? `${trip.energy_used_kwh.toFixed(1)} kWh` : "—"}
                    </TableCell>
                    <TableCell>
                      {trip.tag ? (
                        <Badge variant="secondary" className={TAG_COLORS[trip.tag] ?? ""}>
                          <IconTag className="mr-1 h-3 w-3" />
                          {t(`personal.tag${trip.tag.charAt(0).toUpperCase()}${trip.tag.slice(1)}` as "personal.tagWork")}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          {t("personal.tagUntagged")}
                        </Badge>
                      )}
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
