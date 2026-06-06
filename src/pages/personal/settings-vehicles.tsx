import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { IconCar, IconEdit, IconCheck, IconX, IconRefresh, IconRotateClockwise } from "@tabler/icons-react";
import { toast } from "sonner";

const RESYNC_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

type VehicleRow = {
  id: string;
  vin: string | null;
  display_name: string | null;
  model: string | null;
  trim: string | null;
  manufacture_year: number | null;
  battery_kwh_usable: number | null;
  telemetry_enabled: boolean;
  telemetry_config_status: string | null;
  telemetry_synced_at: string | null;
  provider: string | null;
};

function formatSyncedAt(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "Nyligen";
  if (mins < 60) return `${mins} min sedan`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h sedan`;
  const days = Math.floor(hours / 24);
  return `${days} d sedan`;
}

function TelemetryStatusBadge({ status, enabled }: { status: string | null; enabled: boolean }) {
  if (!enabled) return null;
  if (status === "verified") {
    return (
      <Badge variant="secondary" className="text-xs h-5 bg-green-50 text-green-700 border border-green-200">
        Verified
      </Badge>
    );
  }
  if (status === "pushed") {
    return (
      <Badge variant="secondary" className="text-xs h-5 bg-yellow-50 text-yellow-700 border border-yellow-200">
        Pending
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-xs h-5 bg-blue-50 text-blue-700 border border-blue-200">
      Live
    </Badge>
  );
}

export function SettingsVehiclesSection() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [vehicles, setVehicles]         = useState<VehicleRow[]>([]);
  const [loading, setLoading]           = useState(true);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editName, setEditName]         = useState("");
  const [savingId, setSavingId]         = useState<string | null>(null);
  const [resyncingId, setResyncingId]   = useState<string | null>(null);
  // Cooldown timestamps keyed by vehicle id, loaded from localStorage.
  const [cooldowns, setCooldowns]       = useState<Record<string, number>>({});

  const loadVehicles = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("vehicles")
      .select(
        "id, vin, display_name, model, trim, manufacture_year, battery_kwh_usable, " +
        "telemetry_enabled, telemetry_config_status, telemetry_synced_at, provider"
      )
      .eq("user_id", user.id)
      .is("removed_at", null)
      .order("created_at", { ascending: true });
    if (error) {
      toast.error("Kunde inte ladda fordon");
    } else if (data) {
      setVehicles(data as VehicleRow[]);
      // Load cooldowns from localStorage for each vehicle.
      const entries = (data as VehicleRow[]).map((v) => {
        const raw = localStorage.getItem(`millog_resync_cooldown_${v.id}`);
        return [v.id, raw ? parseInt(raw, 10) : 0] as [string, number];
      });
      setCooldowns(Object.fromEntries(entries));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { loadVehicles(); }, [loadVehicles]);

  function startEdit(v: VehicleRow) {
    setEditingId(v.id);
    setEditName(v.display_name ?? "");
  }

  async function saveEdit(id: string) {
    if (!user) return;
    setSavingId(id);
    const { error } = await supabase
      .from("vehicles")
      .update({ display_name: editName.trim() || null })
      .eq("id", id)
      .eq("user_id", user.id);
    setSavingId(null);
    if (error) {
      toast.error(t("settings.saveFailed"));
      return;
    }
    toast.success(t("settings.saved"));
    setEditingId(null);
    setVehicles(prev => prev.map(v => v.id === id ? { ...v, display_name: editName.trim() || null } : v));
  }

  async function handleResync(v: VehicleRow) {
    if (!v.vin) return;
    const cooldownAt = cooldowns[v.id] ?? 0;
    const remaining = RESYNC_COOLDOWN_MS - (Date.now() - cooldownAt);
    if (remaining > 0) {
      const hoursLeft = Math.ceil(remaining / (60 * 60 * 1000));
      toast.info(`Resync already requested. Try again in ${hoursLeft} h.`);
      return;
    }
    setResyncingId(v.id);
    try {
      const { error } = await supabase.rpc("request_telemetry_refresh" as never, { p_vin: v.vin } as never);
      if (error) throw error;
      const now = Date.now();
      localStorage.setItem(`millog_resync_cooldown_${v.id}`, String(now));
      setCooldowns(prev => ({ ...prev, [v.id]: now }));
      toast.success("Config resync requested — the worker will re-push it within a minute.");
    } catch {
      toast.error("Resync request failed. Try again later.");
    } finally {
      setResyncingId(null);
    }
  }

  function resyncCooldownLabel(id: string): string | null {
    const cooldownAt = cooldowns[id] ?? 0;
    const remaining = RESYNC_COOLDOWN_MS - (Date.now() - cooldownAt);
    if (remaining <= 0) return null;
    const hoursLeft = Math.ceil(remaining / (60 * 60 * 1000));
    return `${hoursLeft}h`;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconCar className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>{t("settings.vehiclesTitle")}</CardTitle>
              <CardDescription className="mt-0.5">{t("settings.vehiclesDescription")}</CardDescription>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={loadVehicles} className="gap-1.5 h-8">
            <IconRefresh className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
          </div>
        ) : vehicles.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {t("settings.vehiclesEmpty")}
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            {vehicles.map((v, i) => (
              <div key={v.id}
                className={`px-4 py-3 space-y-2 ${i < vehicles.length - 1 ? "border-b" : ""}`}
              >
                {/* Top row: name + badges */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    {editingId === v.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="h-7 text-sm w-44"
                          maxLength={50}
                          onKeyDown={e => e.key === "Enter" && saveEdit(v.id)}
                          autoFocus
                        />
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                          onClick={() => saveEdit(v.id)} disabled={savingId === v.id}>
                          <IconCheck className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                          onClick={() => setEditingId(null)}>
                          <IconX className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate">
                          {v.display_name ?? v.model ?? t("settings.vehicleUnnamed")}
                        </span>
                        <button className="text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => startEdit(v)}>
                          <IconEdit className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {[v.model, v.trim].filter(Boolean).join(" · ")}
                      {v.manufacture_year ? ` · ${v.manufacture_year}` : ""}
                      {v.battery_kwh_usable ? ` · ${v.battery_kwh_usable} kWh` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    <Badge variant="outline" className="text-xs h-5 capitalize">
                      {v.provider ?? "Tesla"}
                    </Badge>
                    <TelemetryStatusBadge status={v.telemetry_config_status} enabled={v.telemetry_enabled} />
                  </div>
                </div>

                {/* Bottom row: last synced + resync button */}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Config synced: {formatSyncedAt(v.telemetry_synced_at)}
                  </p>
                  {v.telemetry_enabled && v.provider === "tesla" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => handleResync(v)}
                      disabled={resyncingId === v.id}
                      title={resyncCooldownLabel(v.id) ? `Cooldown: ${resyncCooldownLabel(v.id)} remaining` : "Re-queue telemetry config push"}
                    >
                      <IconRotateClockwise className={`h-3.5 w-3.5 ${resyncingId === v.id ? "animate-spin" : ""}`} />
                      {resyncCooldownLabel(v.id) ? `Resync (${resyncCooldownLabel(v.id)})` : "Resync config"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
