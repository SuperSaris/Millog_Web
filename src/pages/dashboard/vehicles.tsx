import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth-context";
import { useOrg } from "@/contexts/org-context";
import { supabase } from "@/lib/supabase";
import { getBrandFromVin, getUniqueBrands, type VehicleBrand } from "@/lib/vin-utils";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  IconBrandTesla,
  IconCar,
  IconPlus,
  IconUser,
  IconDotsVertical,
  IconBattery3,
  IconWifi,
  IconWifiOff,
  IconClock,
  IconFilter,
} from "@tabler/icons-react";
import { toast } from "sonner";

/* ── Types ─────────────────────────────────────────────── */

interface FleetVehicle {
  vehicleId: string;
  vin: string;
  model: string | null;
  trim: string | null;
  telemetryEnabled: boolean;
  batteryKwh: number | null;
  // The driver who synced this car via their Tesla account in the mobile app
  ownerUserId: string;
  ownerName: string;
  ownerEmail: string;
  // Org metadata — from organization_vehicles, optional (created on first edit)
  ovId: string | null;
  displayLabel: string | null;
  poolCar: boolean;
  // Formal driver assignments (may differ from owner)
  assignments: Array<{
    userId: string;
    isPrimary: boolean;
    name: string | null;
    email: string;
  }>;
  soc: number | null;
  brand: VehicleBrand;
}

interface PendingDriver {
  userId: string;
  name: string;
  email: string;
  role: string;
}

/* ── Skeletons ─────────────────────────────────────────── */

function VehicleCardSkeleton() {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Edit Label Dialog ─────────────────────────────────── */

function EditLabelDialog({
  vehicle,
  orgId,
  onClose,
  onSaved,
}: {
  vehicle: FleetVehicle;
  orgId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [label, setLabel] = useState(vehicle.displayLabel ?? "");
  const [poolCar, setPoolCar] = useState(vehicle.poolCar);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    if (vehicle.ovId) {
      await supabase
        .from("organization_vehicles")
        .update({ display_label: label.trim() || null, pool_car: poolCar })
        .eq("id", vehicle.ovId);
    } else {
      // First time the admin is adding metadata — create the row
      await supabase.from("organization_vehicles").insert({
        organization_id: orgId,
        vehicle_id: vehicle.vehicleId,
        display_label: label.trim() || null,
        pool_car: poolCar,
      });
    }
    setSaving(false);
    toast.success(t("vehicles.labelSaved"));
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("vehicles.editLabel")}</DialogTitle>
          <DialogDescription>{t("vehicles.editLabelDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t("vehicles.displayLabel")}</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("vehicles.labelPlaceholder")}
              maxLength={80}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="pool-car-edit"
              type="checkbox"
              className="accent-primary"
              checked={poolCar}
              onChange={(e) => setPoolCar(e.target.checked)}
            />
            <label htmlFor="pool-car-edit" className="cursor-pointer text-sm">
              {t("vehicles.poolCar")}
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Vehicle Card ──────────────────────────────────────── */

function VehicleCard({
  vehicle,
  isAdmin,
  members,
  orgId,
  onUpdate,
}: {
  vehicle: FleetVehicle;
  isAdmin: boolean;
  members: Array<{ userId: string; name: string; email: string }>;
  orgId: string;
  onUpdate: () => void;
}) {
  const { t } = useTranslation();
  const [editOpen, setEditOpen] = useState(false);

  const label =
    vehicle.displayLabel ||
    [vehicle.model, vehicle.trim].filter(Boolean).join(" ") ||
    t("vehicles.unnamed");

  const isTesla = vehicle.brand.key === "tesla";

  const handleAssignDriver = async (userId: string) => {
    // Ensure organization_vehicles row exists first
    let ovId = vehicle.ovId;
    if (!ovId) {
      const { data } = await supabase
        .from("organization_vehicles")
        .insert({ organization_id: orgId, vehicle_id: vehicle.vehicleId, pool_car: false })
        .select("id")
        .single();
      ovId = data?.id ?? null;
    }
    if (!ovId) return;
    await supabase.from("organization_vehicle_assignments").insert({
      organization_vehicle_id: ovId,
      user_id: userId,
      is_primary: vehicle.assignments.length === 0,
    });
    toast.success(t("vehicles.driverAssigned"));
    onUpdate();
  };

  const handleUnassignDriver = async (userId: string) => {
    if (!vehicle.ovId) return;
    await supabase
      .from("organization_vehicle_assignments")
      .update({ unassigned_at: new Date().toISOString() })
      .eq("organization_vehicle_id", vehicle.ovId)
      .eq("user_id", userId)
      .is("unassigned_at", null);
    toast.success(t("vehicles.driverUnassigned"));
    onUpdate();
  };

  const handleTogglePool = async () => {
    if (vehicle.ovId) {
      await supabase
        .from("organization_vehicles")
        .update({ pool_car: !vehicle.poolCar })
        .eq("id", vehicle.ovId);
    } else {
      await supabase.from("organization_vehicles").insert({
        organization_id: orgId,
        vehicle_id: vehicle.vehicleId,
        pool_car: true,
      });
    }
    onUpdate();
  };

  const unassignedMembers = members.filter(
    (m) => !vehicle.assignments.find((a) => a.userId === m.userId),
  );

  return (
    <>
      <Card className="relative">
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${isTesla ? "bg-red-500/10" : "bg-primary/10"}`}>
                {isTesla ? (
                  <IconBrandTesla className="h-6 w-6 text-red-500" />
                ) : (
                  <IconCar className="h-6 w-6 text-primary" />
                )}
              </div>
              <div>
                <p className="font-semibold">{label}</p>
                <div className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${vehicle.brand.color}`}>
                    {vehicle.brand.name}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {vehicle.vin ? `VIN ···${vehicle.vin.slice(-6)}` : ""}
                    {vehicle.trim ? ` · ${vehicle.trim}` : ""}
                  </p>
                </div>
              </div>
            </div>
            {isAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <IconDotsVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditOpen(true)}>
                    {t("vehicles.editLabel")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleTogglePool}>
                    {vehicle.poolCar
                      ? t("vehicles.disablePool")
                      : t("vehicles.enablePool")}
                  </DropdownMenuItem>
                  {unassignedMembers.map((m) => (
                    <DropdownMenuItem
                      key={m.userId}
                      onClick={() => handleAssignDriver(m.userId)}
                    >
                      {t("vehicles.assign")} {m.name || m.email}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Status badges */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {vehicle.telemetryEnabled ? (
              <Badge variant="default" className="gap-1 bg-green-600/80">
                <IconWifi className="h-3 w-3" />
                {t("vehicles.telemetryActive")}
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <IconWifiOff className="h-3 w-3" />
                {t("vehicles.telemetryInactive")}
              </Badge>
            )}
            {vehicle.poolCar && (
              <Badge variant="secondary">{t("vehicles.poolCar")}</Badge>
            )}
            {vehicle.soc !== null && (
              <Badge variant="outline">
                <IconBattery3 className="mr-1 h-3 w-3" />
                {vehicle.soc}%
              </Badge>
            )}
          </div>

          {/* Connected Tesla account (always shown) */}
          <div className="mt-4 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              {t("vehicles.connectedAs")}
            </p>
            <div className="flex items-center gap-1.5 text-sm">
              <IconUser className="h-3.5 w-3.5 text-muted-foreground" />
              <span>{vehicle.ownerName || vehicle.ownerEmail}</span>
            </div>
          </div>

          {/* Extra assignments (if any beyond the owner) */}
          {vehicle.assignments.length > 0 && (
            <div className="mt-3 space-y-1 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground">
                {t("vehicles.assignedDrivers")}
              </p>
              {vehicle.assignments.map((a) => (
                <div
                  key={a.userId}
                  className="flex items-center justify-between text-sm"
                >
                  <span>{a.name || a.email}</span>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => handleUnassignDriver(a.userId)}
                    >
                      {t("vehicles.unassign")}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editOpen && (
        <EditLabelDialog
          vehicle={vehicle}
          orgId={orgId}
          onClose={() => setEditOpen(false)}
          onSaved={onUpdate}
        />
      )}
    </>
  );
}

/* ── Pending Driver Row ─────────────────────────────────── */

function PendingDriverRow({ driver }: { driver: PendingDriver }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between rounded-lg border px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
          <IconUser className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">{driver.name || driver.email}</p>
          {driver.name && (
            <p className="text-xs text-muted-foreground">{driver.email}</p>
          )}
        </div>
      </div>
      <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
        <IconClock className="h-3 w-3" />
        {t("vehicles.waitingForPairing")}
      </Badge>
    </div>
  );
}

/* ── Main Page ─────────────────────────────────────────── */

export function VehiclesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { organization, isAdmin } = useOrg();
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [pendingDrivers, setPendingDrivers] = useState<PendingDriver[]>([]);
  const [members, setMembers] = useState<
    Array<{ userId: string; name: string; email: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "inactive" | "pool">("all");
  const [brandFilter, setBrandFilter] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user || !organization) {
      setLoading(false);
      return;
    }
    setLoading(true);

    // ── 1. Org members ─────────────────────────────────────────
    const { data: memberRows } = await supabase
      .from("organization_members")
      .select("user_id, role, profiles(full_name, email)")
      .eq("organization_id", organization.id)
      .eq("status", "active");

    const memberList = (memberRows ?? []) as Array<Record<string, unknown>>;
    const memberUserIds = memberList.map((m) => m.user_id as string);
    const memberMap = new Map(
      memberList.map((m) => {
        const p = m.profiles as { full_name: string | null; email: string } | null;
        return [
          m.user_id as string,
          { name: p?.full_name ?? "", email: p?.email ?? "", role: m.role as string },
        ];
      }),
    );

    setMembers(
      memberList.map((m) => {
        const p = m.profiles as { full_name: string | null; email: string } | null;
        return { userId: m.user_id as string, name: p?.full_name ?? "", email: p?.email ?? "" };
      }),
    );

    if (memberUserIds.length === 0) {
      setVehicles([]);
      setPendingDrivers([]);
      setLoading(false);
      return;
    }

    // ── 2. Vehicles belonging to org members ──────────────────
    const { data: vehicleRows } = await supabase
      .from("vehicles")
      .select("id, vin, model, trim, battery_kwh_usable, telemetry_enabled, user_id")
      .in("user_id", memberUserIds);

    const vehicleList = (vehicleRows ?? []) as Array<Record<string, unknown>>;
    const vehicleIds = vehicleList.map((v) => v.id as string);
    const connectedUserIds = new Set(vehicleList.map((v) => v.user_id as string));

    // ── 3. Org metadata (display_label, pool_car) ─────────────
    const ovByVehicleId = new Map<string, Record<string, unknown>>();
    if (vehicleIds.length > 0) {
      const { data: ovRows } = await supabase
        .from("organization_vehicles")
        .select("id, vehicle_id, display_label, pool_car")
        .eq("organization_id", organization.id)
        .in("vehicle_id", vehicleIds);
      for (const ov of ovRows ?? []) {
        const r = ov as Record<string, unknown>;
        ovByVehicleId.set(r.vehicle_id as string, r);
      }
    }

    // ── 4. Active assignments ──────────────────────────────────
    const ovIds = [...ovByVehicleId.values()].map((ov) => ov.id as string);
    const assignsByOvId = new Map<string, Array<Record<string, unknown>>>();
    if (ovIds.length > 0) {
      const { data: assignRows } = await supabase
        .from("organization_vehicle_assignments")
        .select("organization_vehicle_id, user_id, is_primary, profiles(full_name, email)")
        .in("organization_vehicle_id", ovIds)
        .is("unassigned_at", null);
      for (const a of assignRows ?? []) {
        const r = a as Record<string, unknown>;
        const ovId = r.organization_vehicle_id as string;
        assignsByOvId.set(ovId, [...(assignsByOvId.get(ovId) ?? []), r]);
      }
    }

    // ── 5. SOC from telemetry cache ────────────────────────────
    const socByVehicleId = new Map<string, number>();
    if (vehicleIds.length > 0) {
      const { data: socRows } = await supabase
        .from("vehicle_telemetry_cache")
        .select("vehicle_id, value")
        .in("vehicle_id", vehicleIds)
        .in("signal", ["Soc", "BatteryLevel"]);
      for (const row of socRows ?? []) {
        const r = row as Record<string, unknown>;
        const val =
          typeof r.value === "number" ? r.value : parseFloat(String(r.value));
        if (!isNaN(val)) socByVehicleId.set(r.vehicle_id as string, val);
      }
    }

    // ── 6. Merge ───────────────────────────────────────────────
    const fleetVehicles: FleetVehicle[] = vehicleList.map((v) => {
      const member = memberMap.get(v.user_id as string);
      const ov = ovByVehicleId.get(v.id as string);
      const assignments = ov ? (assignsByOvId.get(ov.id as string) ?? []) : [];
      return {
        vehicleId: v.id as string,
        vin: v.vin as string,
        model: (v.model as string | null) ?? null,
        trim: (v.trim as string | null) ?? null,
        telemetryEnabled: (v.telemetry_enabled as boolean) ?? false,
        batteryKwh: (v.battery_kwh_usable as number | null) ?? null,
        ownerUserId: v.user_id as string,
        ownerName: member?.name ?? "",
        ownerEmail: member?.email ?? "",
        ovId: (ov?.id as string | null) ?? null,
        displayLabel: (ov?.display_label as string | null) ?? null,
        poolCar: (ov?.pool_car as boolean) ?? false,
        assignments: assignments.map((a) => ({
          userId: a.user_id as string,
          isPrimary: a.is_primary as boolean,
          name:
            (a.profiles as { full_name: string | null } | null)?.full_name ??
            null,
          email: (a.profiles as { email: string } | null)?.email ?? "",
        })),
        soc: socByVehicleId.get(v.id as string) ?? null,
        brand: getBrandFromVin(v.vin as string),
      };
    });

    setVehicles(fleetVehicles);

    // Pending: members with no vehicle record yet
    setPendingDrivers(
      memberList
        .filter((m) => !connectedUserIds.has(m.user_id as string))
        .map((m) => {
          const info = memberMap.get(m.user_id as string)!;
          return { userId: m.user_id as string, ...info };
        }),
    );

    setLoading(false);
  }, [user, organization]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const uniqueBrands = getUniqueBrands(vehicles.map((v) => v.vin));

  const filtered = vehicles.filter((v) => {
    if (filter === "active" && !v.telemetryEnabled) return false;
    if (filter === "inactive" && v.telemetryEnabled) return false;
    if (filter === "pool" && !v.poolCar) return false;
    if (brandFilter && v.brand.key !== brandFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("vehicles.title")}
          </h1>
          <p className="text-muted-foreground">{t("vehicles.description")}</p>
        </div>
        {isAdmin && organization && (
          <Button onClick={() => navigate("/dashboard/vehicles/import")}>
            <IconPlus className="mr-2 h-4 w-4" />
            {t("vehicles.importVehicles")}
          </Button>
        )}
      </div>

      {/* Empty state (no members have connected yet) */}
      {!loading && vehicles.length === 0 && pendingDrivers.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <IconCar className="h-10 w-10 text-muted-foreground/40" />
            <p className="mt-3 font-medium">{t("vehicles.noVehicles")}</p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {t("vehicles.noVehiclesExplain")}
            </p>
            {isAdmin && (
              <Button className="mt-4" onClick={() => navigate("/dashboard/vehicles/import")}>
                <IconPlus className="mr-2 h-4 w-4" />
                {t("vehicles.importVehicles")}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Filter tabs — only shown when there are vehicles */}
      {vehicles.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "active", "inactive", "pool"] as const).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {t(
                `vehicles.filter${f.charAt(0).toUpperCase()}${f.slice(1)}` as "vehicles.filterAll",
              )}
            </Button>
          ))}

          {/* Brand filter — only shown when multiple brands exist */}
          {uniqueBrands.length > 1 && (
            <>
              <div className="h-4 w-px bg-border" />
              <IconFilter className="h-3.5 w-3.5 text-muted-foreground" />
              <Button
                variant={brandFilter === null ? "default" : "outline"}
                size="sm"
                onClick={() => setBrandFilter(null)}
              >
                {t("vehicles.brandAll")}
              </Button>
              {uniqueBrands.map((b) => (
                <Button
                  key={b.key}
                  variant={brandFilter === b.key ? "default" : "outline"}
                  size="sm"
                  onClick={() => setBrandFilter(b.key)}
                >
                  <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${b.color.split(" ")[0]}`} />
                  {b.name}
                </Button>
              ))}
            </>
          )}
        </div>
      )}

      {/* Vehicle grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <VehicleCardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => (
            <VehicleCard
              key={v.vehicleId}
              vehicle={v}
              isAdmin={isAdmin}
              members={members}
              orgId={organization!.id}
              onUpdate={fetchData}
            />
          ))}
        </div>
      ) : vehicles.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("vehicles.noVehiclesInFilter")}
        </p>
      ) : null}

      {/* Pending drivers — those who haven't connected Tesla yet */}
      {!loading && pendingDrivers.length > 0 && (
        <div className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">
              {t("vehicles.pendingDrivers")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("vehicles.pendingDriversDescription")}
            </p>
          </div>
          <div className="space-y-2">
            {pendingDrivers.map((d) => (
              <PendingDriverRow key={d.userId} driver={d} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
