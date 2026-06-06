import { useState, useEffect, useCallback, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useOrg } from "@/contexts/org-context";
import { useAuth } from "@/contexts/auth-context";
import { useSubscription } from "@/hooks/use-subscription";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LanguageSwitcher } from "@/components/language-switcher";
import {
  IconShieldCheck,
  IconAlertTriangle,
  IconTrash,
  IconLoader2,
  IconSettings,
  IconUsers,
  IconTag,
  IconMapPin,
  IconCurrencyDollar,
  IconReceipt,
} from "@tabler/icons-react";
import { toast } from "sonner";

/* ── Types ─────────────────────────────────────────────── */

interface AdminMember {
  user_id: string;
  full_name: string | null;
  email: string;
}

/* ── Organization Card ─────────────────────────────────── */

function OrganizationCard() {
  const { t } = useTranslation();
  const { organization, refresh } = useOrg();
  const [name, setName] = useState(organization?.name ?? "");
  const [orgNumber, setOrgNumber] = useState(organization?.org_number ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(organization?.name ?? "");
    setOrgNumber(organization?.org_number ?? "");
  }, [organization]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!organization) return;
    setSaving(true);

    const { error } = await supabase
      .from("organizations")
      .update({ name: name.trim(), org_number: orgNumber.trim() || null })
      .eq("id", organization.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(t("settings.organizationSaved"));
      refresh();
    }
    setSaving(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.organization")}</CardTitle>
        <CardDescription>{t("settings.organizationDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">{t("settings.orgName")}</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-number">{t("settings.orgNumber")}</Label>
            <Input
              id="org-number"
              value={orgNumber}
              onChange={(e) => setOrgNumber(e.target.value)}
              placeholder="556xxx-xxxx"
            />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? t("common.loading") : t("common.save")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/* ── Admins Card ───────────────────────────────────────── */

function AdminsCard() {
  const { t } = useTranslation();
  const { organization } = useOrg();
  const [admins, setAdmins] = useState<AdminMember[]>([]);

  const fetchAdmins = useCallback(async () => {
    if (!organization) return;
    const { data } = await supabase
      .from("organization_members")
      .select("user_id, role, profiles(full_name, email)")
      .eq("organization_id", organization.id)
      .eq("role", "admin")
      .eq("status", "active");

    if (data) {
      setAdmins(
        data.map((m: Record<string, unknown>) => {
          const p = m.profiles as { full_name: string | null; email: string } | null;
          return {
            user_id: m.user_id as string,
            full_name: p?.full_name ?? null,
            email: p?.email ?? "",
          };
        }),
      );
    }
  }, [organization]);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.admins")}</CardTitle>
        <CardDescription>{t("settings.adminsDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        {admins.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("settings.noAdmins")}</p>
        ) : (
          <div className="space-y-2">
            {admins.map((a) => (
              <div key={a.user_id} className="flex items-center gap-2 text-sm">
                <IconShieldCheck className="h-4 w-4 text-primary" />
                <span className="font-medium">{a.full_name || a.email}</span>
                {a.full_name && (
                  <span className="text-muted-foreground">({a.email})</span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Tags Card ─────────────────────────────────────────── */

function TagsCard() {
  const { t } = useTranslation();
  const { organization } = useOrg();
  const [tags, setTags] = useState<Array<{ id: string; label: string; tax_category: string; color: string | null; is_default: boolean; sort_order: number }>>([]);
  const [loadingTags, setLoadingTags] = useState(true);

  const fetchTags = useCallback(async () => {
    if (!organization) return;
    const { data } = await supabase
      .from("organization_tags")
      .select("id, label, tax_category, color, is_default, sort_order")
      .eq("org_id", organization.id)
      .order("sort_order");
    setTags(data ?? []);
    setLoadingTags(false);
  }, [organization]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const taxCategoryColor = (cat: string) => {
    switch (cat) {
      case "work": return "default";
      case "commute": return "secondary";
      case "personal": return "outline";
      default: return "outline";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.tags")}</CardTitle>
        <CardDescription>{t("settings.tagsDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        {loadingTags ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : tags.length === 0 ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant="default">{t("compliance.tagWork")}</Badge>
              <Badge variant="secondary">{t("compliance.tagCommute")}</Badge>
              <Badge variant="outline">{t("compliance.tagPersonal")}</Badge>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{t("settings.tagsHint")}</p>
          </>
        ) : (
          <div className="space-y-2">
            {tags.map((tag) => (
              <div key={tag.id} className="flex items-center gap-2">
                {tag.color && (
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                )}
                <Badge variant={taxCategoryColor(tag.tax_category) as "default" | "secondary" | "outline"}>
                  {tag.label}
                </Badge>
                <span className="text-xs text-muted-foreground capitalize">
                  {t(`settings.taxCategory_${tag.tax_category}` as "settings.taxCategory_work")}
                </span>
                {tag.is_default && (
                  <Badge variant="outline" className="text-[10px]">{t("settings.defaultTag")}</Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Driver Defaults Card ──────────────────────────────── */

function DriverDefaultsCard() {
  const { t } = useTranslation();
  const { organization, refresh } = useOrg();

  const settings = organization?.settings ?? {};
  const [saving, setSaving] = useState(false);

  // Local state derived from org settings
  const [defaultTag, setDefaultTag] = useState<string>((settings.defaultTag as string) ?? "none");
  const [requireTagging, setRequireTagging] = useState((settings.requireTagging as boolean) ?? false);
  const [driversCanSeeTrips, setDriversCanSeeTrips] = useState((settings.driversCanSeeTrips as boolean) ?? true);
  const [driversCanSeeStatistics, setDriversCanSeeStatistics] = useState((settings.driversCanSeeStatistics as boolean) ?? true);
  const [driversCanSeeEnergyCost, setDriversCanSeeEnergyCost] = useState((settings.driversCanSeeEnergyCost as boolean) ?? false);
  const [driversCanSeeMap, setDriversCanSeeMap] = useState((settings.driversCanSeeMap as boolean) ?? true);
  const [driversCanTagOwnTrips, setDriversCanTagOwnTrips] = useState((settings.driversCanTagOwnTrips as boolean) ?? true);
  const [driversCanExport, setDriversCanExport] = useState((settings.driversCanExport as boolean) ?? false);

  useEffect(() => {
    const s = organization?.settings ?? {};
    setDefaultTag((s.defaultTag as string) ?? "none");
    setRequireTagging((s.requireTagging as boolean) ?? false);
    setDriversCanSeeTrips((s.driversCanSeeTrips as boolean) ?? true);
    setDriversCanSeeStatistics((s.driversCanSeeStatistics as boolean) ?? true);
    setDriversCanSeeEnergyCost((s.driversCanSeeEnergyCost as boolean) ?? false);
    setDriversCanSeeMap((s.driversCanSeeMap as boolean) ?? true);
    setDriversCanTagOwnTrips((s.driversCanTagOwnTrips as boolean) ?? true);
    setDriversCanExport((s.driversCanExport as boolean) ?? false);
  }, [organization]);

  const handleSave = async () => {
    if (!organization) return;
    setSaving(true);

    const updatedSettings = {
      ...organization.settings,
      defaultTag,
      requireTagging,
      driversCanSeeTrips,
      driversCanSeeStatistics,
      driversCanSeeEnergyCost,
      driversCanSeeMap,
      driversCanTagOwnTrips,
      driversCanExport,
    };

    const { error } = await supabase
      .from("organizations")
      .update({ settings: updatedSettings })
      .eq("id", organization.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(t("settings.driverDefaultsSaved"));
      refresh();
    }
    setSaving(false);
  };

  const toggleRow = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label className="flex items-center justify-between gap-4 rounded-md border p-3 cursor-pointer hover:bg-accent/50 transition-colors">
      <span className="text-sm">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-border"
      />
    </label>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.driverVisibility")}</CardTitle>
          <CardDescription>{t("settings.driverVisibilityDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {toggleRow(t("setup.visTrips"), driversCanSeeTrips, setDriversCanSeeTrips)}
          {toggleRow(t("setup.visStatistics"), driversCanSeeStatistics, setDriversCanSeeStatistics)}
          {toggleRow(t("setup.visEnergyCost"), driversCanSeeEnergyCost, setDriversCanSeeEnergyCost)}
          {toggleRow(t("setup.visMap"), driversCanSeeMap, setDriversCanSeeMap)}
          {toggleRow(t("setup.visTagging"), driversCanTagOwnTrips, setDriversCanTagOwnTrips)}
          {toggleRow(t("setup.visExport"), driversCanExport, setDriversCanExport)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.taggingDefaults")}</CardTitle>
          <CardDescription>{t("settings.taggingDefaultsDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("setup.defaultTagLabel")}</Label>
            <Select value={defaultTag} onValueChange={setDefaultTag}>
              <SelectTrigger className="w-full sm:w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("setup.tagNone")}</SelectItem>
                <SelectItem value="work">{t("setup.tagWork")}</SelectItem>
                <SelectItem value="commute">{t("setup.tagCommute")}</SelectItem>
                <SelectItem value="personal">{t("setup.tagPersonal")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">{t("setup.defaultTagHint")}</p>
          </div>
          <label className="flex items-center justify-between gap-4 rounded-md border p-3 cursor-pointer hover:bg-accent/50 transition-colors">
            <div>
              <span className="text-sm font-medium">{t("setup.requireTagging")}</span>
              <p className="text-xs text-muted-foreground">{t("setup.requireTaggingDesc")}</p>
            </div>
            <input
              type="checkbox"
              checked={requireTagging}
              onChange={(e) => setRequireTagging(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
          </label>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? t("common.loading") : t("common.save")}
        </Button>
      </div>
    </div>
  );
}

/* ── Pricing & Reimbursement Card ──────────────────────── */

function PricingCard() {
  const { t } = useTranslation();
  const { organization, refresh } = useOrg();

  const settings = organization?.settings ?? {};
  const [saving, setSaving] = useState(false);

  const [chargingPrice, setChargingPrice] = useState<string>(
    String((settings.charging_price_kr_per_kwh as number) ?? "1.50"),
  );
  const [milersattningRate, setMilersattningRate] = useState<string>(
    String((settings.milersattning_kr_per_km as number) ?? "2.50"),
  );

  useEffect(() => {
    const s = organization?.settings ?? {};
    setChargingPrice(String((s.charging_price_kr_per_kwh as number) ?? "1.50"));
    setMilersattningRate(String((s.milersattning_kr_per_km as number) ?? "2.50"));
  }, [organization]);

  const handleSave = async () => {
    if (!organization) return;
    setSaving(true);

    const updatedSettings = {
      ...organization.settings,
      charging_price_kr_per_kwh: parseFloat(chargingPrice) || 1.50,
      milersattning_kr_per_km: parseFloat(milersattningRate) || 2.50,
    };

    const { error } = await supabase
      .from("organizations")
      .update({ settings: updatedSettings })
      .eq("id", organization.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(t("settings.pricingSaved"));
      refresh();
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.chargingPricing")}</CardTitle>
          <CardDescription>{t("settings.chargingPricingDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="charging-price">{t("settings.chargingPriceLabel")}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="charging-price"
                type="number"
                step="0.01"
                min="0"
                value={chargingPrice}
                onChange={(e) => setChargingPrice(e.target.value)}
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">kr/kWh</span>
            </div>
            <p className="text-sm text-muted-foreground">{t("settings.chargingPriceHint")}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.milersattning")}</CardTitle>
          <CardDescription>{t("settings.milersattningDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="milersattning-rate">{t("settings.milersattningRate")}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="milersattning-rate"
                type="number"
                step="0.01"
                min="0"
                value={milersattningRate}
                onChange={(e) => setMilersattningRate(e.target.value)}
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">kr/km</span>
            </div>
            <p className="text-sm text-muted-foreground">{t("settings.milersattningRateHint")}</p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? t("common.loading") : t("common.save")}
        </Button>
      </div>
    </div>
  );
}

/* ── Zones Card (placeholder, Phase 2) ─────────────────── */

function ZonesCard() {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.zones")}</CardTitle>
        <CardDescription>{t("settings.zonesDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <IconMapPin className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("settings.zonesComingSoon")}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Billing Card ──────────────────────────────────────── */

function BillingCard() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { organization } = useOrg();
  const sub = useSubscription();
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [loadingCheckout, setLoadingCheckout] = useState(false);

  async function openPortal() {
    if (!session) return;
    setLoadingPortal(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-customer-portal", {
        body: { user_type: "fleet" },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error || !data?.url) throw new Error(error?.message ?? t("billing.portalError"));
      window.location.href = data.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("billing.portalError"));
      setLoadingPortal(false);
    }
  }

  async function startCheckout() {
    if (!session) return;
    setLoadingCheckout(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-create-checkout", {
        body: { plan: "fleet_monthly", user_type: "fleet" },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error || !data?.url) throw new Error(error?.message ?? t("billing.checkoutError"));
      window.location.href = data.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("billing.checkoutError"));
      setLoadingCheckout(false);
    }
  }

  const statusBadgeVariant = (): "default" | "secondary" | "destructive" | "outline" => {
    switch (sub.status) {
      case "active":   return "default";
      case "trialing": return "secondary";
      case "past_due":
      case "unpaid":   return "destructive";
      case "canceled":
      case "inactive": return "outline";
      default:         return "outline";
    }
  };

  const statusLabel = () => t(`billing.status_${sub.status}` as "billing.status_active");

  const formatDate = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat("sv-SE", { dateStyle: "long" }).format(new Date(iso))
      : "—";

  return (
    <div className="space-y-4">
      {/* ── Past due warning ──────────────────────────── */}
      {sub.isPastDue && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium text-destructive">{t("billing.pastDueTitle")}</p>
            <p className="text-sm text-destructive/80">{t("billing.pastDueDescription")}</p>
            <Button size="sm" variant="destructive" onClick={openPortal} disabled={loadingPortal} className="mt-2">
              {loadingPortal ? t("common.loading") : t("billing.updatePaymentMethod")}
            </Button>
          </div>
        </div>
      )}

      {/* ── Trial ending soon ─────────────────────────── */}
      {sub.trialEndingSoon && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
              {t("billing.trialEndingSoon", { days: sub.daysUntilExpiry })}
            </p>
            <p className="text-sm text-amber-600/80 dark:text-amber-400/80">
              {t("billing.trialEndingSoonDesc")}
            </p>
          </div>
        </div>
      )}

      {/* ── Subscription status card ──────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("settings.billing")}</CardTitle>
            <Badge variant={statusBadgeVariant()}>{statusLabel()}</Badge>
          </div>
          <CardDescription>{t("settings.billingDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sub.loading ? (
            <div className="space-y-2">
              <div className="h-4 w-48 animate-pulse rounded bg-muted" />
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            </div>
          ) : (
            <>
              {/* Plan info */}
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">{t("billing.plan")}</p>
                  <p className="font-medium">
                    {sub.plan ? t(`billing.planName_${sub.plan}` as "billing.planName_fleet_monthly") : "—"}
                  </p>
                </div>
                {sub.quantity > 0 && (
                  <div>
                    <p className="text-muted-foreground">{t("billing.vehicles")}</p>
                    <p className="font-medium">
                      {t("billing.vehicleCount", { count: sub.quantity })}
                    </p>
                  </div>
                )}
                {sub.isTrialing && sub.trialEndsAt && (
                  <div>
                    <p className="text-muted-foreground">{t("billing.trialEnds")}</p>
                    <p className="font-medium">{formatDate(sub.trialEndsAt)}</p>
                  </div>
                )}
                {!sub.isTrialing && sub.currentPeriodEnd && sub.isActive && (
                  <div>
                    <p className="text-muted-foreground">{t("billing.nextBilling")}</p>
                    <p className="font-medium">{formatDate(sub.currentPeriodEnd)}</p>
                  </div>
                )}
                {sub.isCanceled && sub.currentPeriodEnd && (
                  <div>
                    <p className="text-muted-foreground">{t("billing.accessUntil")}</p>
                    <p className="font-medium">{formatDate(sub.currentPeriodEnd)}</p>
                  </div>
                )}
                {organization?.billing_email && (
                  <div>
                    <p className="text-muted-foreground">{t("billing.billingEmail")}</p>
                    <p className="font-medium truncate">{organization.billing_email}</p>
                  </div>
                )}
              </div>

              {/* Price per vehicle callout */}
              {sub.isActive && sub.plan === "fleet_monthly" && (
                <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                  {t("billing.fleetPriceExplain", { rate: 129 })}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 pt-2">
                {(sub.isActive || sub.isPastDue) && (
                  <Button variant="outline" onClick={openPortal} disabled={loadingPortal}>
                    {loadingPortal
                      ? t("common.loading")
                      : t("billing.manageSubscription")}
                  </Button>
                )}
                {(sub.isCanceled || sub.status === "inactive") && (
                  <Button onClick={startCheckout} disabled={loadingCheckout}>
                    {loadingCheckout ? t("common.loading") : t("billing.subscribe")}
                  </Button>
                )}
              </div>

              {/* Portal capability list */}
              {(sub.isActive || sub.isPastDue) && (
                <p className="text-xs text-muted-foreground">
                  {t("billing.portalHelp")}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Delete Organization Types ─────────────────────────── */

interface OrgDriver {
  user_id: string;
  full_name: string | null;
  email: string;
}

interface OrgVehicle {
  vehicle_id: string;
  display_label: string | null;
  vin: string | null;
  model: string | null;
}

interface DeletePreviewData {
  drivers: OrgDriver[];
  vehicles: OrgVehicle[];
  invitationCount: number;
}

/* ── Delete Organization Dialog (3-step) ───────────────── */

function DeleteOrganizationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { organization } = useOrg();
  const { signOut } = useAuth();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [preview, setPreview] = useState<DeletePreviewData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [deleteAccounts, setDeleteAccounts] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setStep(1);
      setDeleteAccounts(false);
      setConfirmName("");
      setDeleting(false);
      fetchPreview();
    } else {
      setPreview(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fetchPreview = useCallback(async () => {
    if (!organization) return;
    setLoadingPreview(true);

    const [membersRes, vehiclesRes, invitesRes] = await Promise.all([
      supabase
        .from("organization_members")
        .select("user_id, role, profiles(full_name, email)")
        .eq("organization_id", organization.id)
        .eq("status", "active"),
      supabase
        .from("organization_vehicles")
        .select("vehicle_id, display_label, vehicles(vin, model)")
        .eq("organization_id", organization.id),
      supabase
        .from("fleet_invitations")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization.id)
        .eq("status", "pending"),
    ]);

    const drivers: OrgDriver[] = (membersRes.data ?? []).map(
      (m: Record<string, unknown>) => {
        const p = m.profiles as { full_name: string | null; email: string } | null;
        return {
          user_id: m.user_id as string,
          full_name: p?.full_name ?? null,
          email: p?.email ?? "",
        };
      },
    );

    const vehicles: OrgVehicle[] = (vehiclesRes.data ?? []).map(
      (v: Record<string, unknown>) => {
        const veh = v.vehicles as { vin: string | null; model: string | null } | null;
        return {
          vehicle_id: v.vehicle_id as string,
          display_label: v.display_label as string | null,
          vin: veh?.vin ?? null,
          model: veh?.model ?? null,
        };
      },
    );

    setPreview({
      drivers,
      vehicles,
      invitationCount: invitesRes.count ?? 0,
    });
    setLoadingPreview(false);
  }, [organization]);

  const handleDelete = useCallback(async () => {
    if (!organization || confirmName !== organization.name) return;
    setDeleting(true);

    const { data, error } = await supabase.functions.invoke("fleet-delete-org", {
      body: { delete_driver_accounts: deleteAccounts },
    });

    if (error || !data?.success) {
      toast.error(t("settings.deleteOrgError"));
      setDeleting(false);
      return;
    }

    toast.success(t("settings.deleteOrgSuccess"));
    onOpenChange(false);
    await signOut();
    navigate("/login");
  }, [organization, confirmName, deleteAccounts, t, onOpenChange, signOut, navigate]);

  const nameMatches = organization ? confirmName === organization.name : false;

  return (
    <Dialog open={open} onOpenChange={deleting ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* ── Step 1: Impact Summary ── */}
        {step === 1 && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <IconAlertTriangle className="h-5 w-5" />
                {t("settings.deleteOrgStep1Title")}
              </DialogTitle>
              <DialogDescription>
                {t("settings.deleteOrgPermanentWarning")}
              </DialogDescription>
            </DialogHeader>

            {loadingPreview ? (
              <div className="flex items-center justify-center py-8">
                <IconLoader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">
                  {t("settings.deleteOrgLoadingPreview")}
                </span>
              </div>
            ) : preview ? (
              <div className="space-y-4 max-h-80 overflow-y-auto">
                {/* Drivers */}
                <div>
                  <h4 className="text-sm font-semibold mb-1">
                    {t("settings.deleteOrgDriversHeading")}
                  </h4>
                  {preview.drivers.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("settings.deleteOrgNoDrivers")}
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {preview.drivers.map((d) => (
                        <li key={d.user_id} className="text-sm flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                          <span className="font-medium">{d.full_name || d.email}</span>
                          {d.full_name && (
                            <span className="text-muted-foreground">({d.email})</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Vehicles */}
                <div>
                  <h4 className="text-sm font-semibold mb-1">
                    {t("settings.deleteOrgVehiclesHeading")}
                  </h4>
                  {preview.vehicles.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t("settings.deleteOrgNoVehicles")}
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {preview.vehicles.map((v) => (
                        <li key={v.vehicle_id} className="text-sm flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                          <span className="font-medium">
                            {v.display_label || v.model || "Tesla"}
                          </span>
                          {v.vin && (
                            <span className="text-muted-foreground">
                              (***{v.vin.slice(-4)})
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Data summary */}
                <div>
                  <h4 className="text-sm font-semibold mb-1">
                    {t("settings.deleteOrgDataHeading")}
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {t("settings.deleteOrgDataItems")}
                  </p>
                  {preview.invitationCount > 0 && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {preview.invitationCount} {t("settings.deleteOrgDataHeading").toLowerCase()}
                    </p>
                  )}
                </div>
              </div>
            ) : null}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="destructive"
                onClick={() => setStep(2)}
                disabled={loadingPreview}
              >
                {t("setup.next")}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Step 2: Account Deletion Choice ── */}
        {step === 2 && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <IconAlertTriangle className="h-5 w-5" />
                {t("settings.deleteOrgStep2Title")}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <label className="flex items-start gap-3 cursor-pointer rounded-md border p-3 hover:bg-accent/50 transition-colors">
                <input
                  type="checkbox"
                  checked={deleteAccounts}
                  onChange={(e) => setDeleteAccounts(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-input accent-destructive"
                />
                <div className="space-y-1">
                  <span className="text-sm font-medium">
                    {t("settings.deleteOrgDeleteAccounts")}
                  </span>
                  <p className="text-sm text-muted-foreground">
                    {deleteAccounts
                      ? t("settings.deleteOrgDeleteAccountsWarningOn")
                      : t("settings.deleteOrgDeleteAccountsInfoOff")}
                  </p>
                </div>
              </label>

              {deleteAccounts && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-3">
                  <IconAlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive">
                    {t("settings.deleteOrgDeleteAccountsWarningOn")}
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(1)}>
                {t("setup.back")}
              </Button>
              <Button variant="destructive" onClick={() => setStep(3)}>
                {t("setup.next")}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Step 3: Type Name to Confirm ── */}
        {step === 3 && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <IconAlertTriangle className="h-5 w-5" />
                {t("settings.deleteOrgStep3Title")}
              </DialogTitle>
              <DialogDescription>
                {t("settings.deleteOrgTypeNameInstruction")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <p className="text-sm font-semibold select-all rounded bg-muted px-2 py-1.5">
                {organization?.name}
              </p>
              <Input
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={organization?.name}
                autoFocus
                disabled={deleting}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(2)} disabled={deleting}>
                {t("setup.back")}
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={!nameMatches || deleting}
              >
                {deleting ? (
                  <>
                    <IconLoader2 className="h-4 w-4 animate-spin mr-2" />
                    {t("settings.deleteOrgDeleting")}
                  </>
                ) : (
                  t("settings.deleteOrgConfirmButton")
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Danger Zone Card ──────────────────────────────────── */

function DangerZoneCard() {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <IconTrash className="h-5 w-5" />
            {t("settings.dangerZone")}
          </CardTitle>
          <CardDescription>{t("settings.dangerZoneDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setDialogOpen(true)}>
            {t("settings.deleteOrgButton")}
          </Button>
        </CardContent>
      </Card>

      <DeleteOrganizationDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}

/* ── Main Page ─────────────────────────────────────────── */

export function SettingsPage() {
  const { t } = useTranslation();
  const { isAdmin } = useOrg();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("settings.title")}</h1>
        <p className="text-muted-foreground">{t("settings.description")}</p>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="general" className="gap-1.5">
            <IconSettings className="h-4 w-4" />
            {t("settings.tabGeneral")}
          </TabsTrigger>
          <TabsTrigger value="driver-defaults" className="gap-1.5">
            <IconUsers className="h-4 w-4" />
            {t("settings.tabDriverDefaults")}
          </TabsTrigger>
          <TabsTrigger value="tags" className="gap-1.5">
            <IconTag className="h-4 w-4" />
            {t("settings.tabTags")}
          </TabsTrigger>
          <TabsTrigger value="zones" className="gap-1.5">
            <IconMapPin className="h-4 w-4" />
            {t("settings.tabZones")}
          </TabsTrigger>
          <TabsTrigger value="pricing" className="gap-1.5">
            <IconCurrencyDollar className="h-4 w-4" />
            {t("settings.tabPricing")}
          </TabsTrigger>
          <TabsTrigger value="billing" className="gap-1.5">
            <IconReceipt className="h-4 w-4" />
            {t("settings.tabBilling")}
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="danger" className="gap-1.5 text-destructive data-[state=active]:text-destructive">
              <IconTrash className="h-4 w-4" />
              {t("settings.tabDangerZone")}
            </TabsTrigger>
          )}
        </TabsList>

        {/* General */}
        <TabsContent value="general" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <OrganizationCard />
            <AdminsCard />
            <Card>
              <CardHeader>
                <CardTitle>{t("settings.language")}</CardTitle>
                <CardDescription>{t("settings.languageDescription")}</CardDescription>
              </CardHeader>
              <CardContent>
                <LanguageSwitcher />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Driver Defaults */}
        <TabsContent value="driver-defaults">
          <DriverDefaultsCard />
        </TabsContent>

        {/* Tags */}
        <TabsContent value="tags">
          <TagsCard />
        </TabsContent>

        {/* Zones */}
        <TabsContent value="zones">
          <ZonesCard />
        </TabsContent>

        {/* Pricing & Reimbursement */}
        <TabsContent value="pricing">
          <PricingCard />
        </TabsContent>

        {/* Billing */}
        <TabsContent value="billing">
          <BillingCard />
        </TabsContent>

        {/* Danger Zone */}
        {isAdmin && (
          <TabsContent value="danger">
            <DangerZoneCard />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
