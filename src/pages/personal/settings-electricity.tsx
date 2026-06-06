import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconBolt, IconLock } from "@tabler/icons-react";
import { toast } from "sonner";

const IS_DEV = import.meta.env.DEV;

type PricingModel = "fixed" | "spot_nordpool" | "tibber";
type PriceZone    = "SE1" | "SE2" | "SE3" | "SE4";

const PRICE_ZONES: PriceZone[] = ["SE1", "SE2", "SE3", "SE4"];

export function SettingsElectricitySection() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [model, setModel]         = useState<PricingModel>("fixed");
  const [fixedTariff, setFixed]   = useState<string>("");
  const [priceZone, setPriceZone] = useState<PriceZone>("SE3");
  const [gridFee, setGridFee]     = useState<string>("");
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase
        .from("profiles")
        .select("electricity_tariff_kr_per_kwh")
        .eq("id", user.id)
        .single(),
      supabase
        .from("electricity_pricing_config")
        .select("pricing_model, price_zone, grid_fee_ore_per_kwh")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]).then(([profileRes, configRes]) => {
      if (profileRes.data?.electricity_tariff_kr_per_kwh != null) {
        setFixed(String(profileRes.data.electricity_tariff_kr_per_kwh));
      } else {
        setFixed("1.80");
      }
      if (configRes.data) {
        const loadedModel = configRes.data.pricing_model as PricingModel;
        if (loadedModel === "tibber" && !IS_DEV) {
          setModel("fixed");
        } else if (loadedModel) {
          setModel(loadedModel);
        }
        if (configRes.data.price_zone)    setPriceZone(configRes.data.price_zone as PriceZone);
        if (configRes.data.grid_fee_ore_per_kwh != null) setGridFee(String(configRes.data.grid_fee_ore_per_kwh));
      }
      setLoading(false);
    });
  }, [user]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);

    const fixedVal = parseFloat(fixedTariff.replace(",", "."));
    const gridVal  = parseFloat(gridFee.replace(",", "."));

    const [profileUpdate, configUpsert] = await Promise.all([
      model === "fixed"
        ? supabase
            .from("profiles")
            .update({ electricity_tariff_kr_per_kwh: isNaN(fixedVal) ? null : fixedVal })
            .eq("id", user.id)
        : Promise.resolve({ error: null }),
      supabase
        .from("electricity_pricing_config")
        .upsert({
          user_id: user.id,
          pricing_model: model,
          price_zone: model === "spot_nordpool" ? priceZone : null,
          grid_fee_ore_per_kwh: model === "spot_nordpool" && !isNaN(gridVal) ? gridVal : null,
        }, { onConflict: "user_id" }),
    ]);

    setSaving(false);
    if (profileUpdate.error || configUpsert.error) {
      toast.error(t("settings.saveFailed"));
    } else {
      toast.success(t("settings.saved"));
    }
  }

  if (loading) return <Skeleton className="h-56 rounded-xl" />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <IconBolt className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>{t("settings.electricityTitle")}</CardTitle>
            <CardDescription className="mt-0.5">{t("settings.electricityDescription")}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Model selector */}
        <div className="space-y-1.5 max-w-xs">
          <Label className="text-sm">{t("settings.electricityModel")}</Label>
          <Select value={model} onValueChange={v => setModel(v as PricingModel)}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">{t("settings.electricityFixed")}</SelectItem>
              <SelectItem value="spot_nordpool">{t("settings.electricitySpot")}</SelectItem>
              <SelectItem value="tibber" disabled={!IS_DEV}>
                <span className="flex items-center gap-1.5">
                  {!IS_DEV && <IconLock className="size-3 shrink-0" />}
                  <span>{t("settings.electricityTibber")}</span>
                  {!IS_DEV && (
                    <span className="text-xs">
                      — {t("comingSoon")}
                    </span>
                  )}
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Fixed tariff */}
        {model === "fixed" && (
          <div className="space-y-1.5 max-w-xs">
            <Label htmlFor="elec-tariff" className="text-sm">{t("settings.electricityTariff")}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="elec-tariff"
                value={fixedTariff}
                onChange={e => setFixed(e.target.value)}
                className="w-28 h-8 text-sm"
                placeholder="1.80"
              />
              <span className="text-sm text-muted-foreground">kr / kWh</span>
            </div>
          </div>
        )}

        {/* Spot/NordPool */}
        {model === "spot_nordpool" && (
          <div className="space-y-3">
            <div className="space-y-1.5 max-w-xs">
              <Label className="text-sm">{t("settings.electricityZone")}</Label>
              <Select value={priceZone} onValueChange={v => setPriceZone(v as PriceZone)}>
                <SelectTrigger className="h-8 text-sm w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRICE_ZONES.map(z => (
                    <SelectItem key={z} value={z}>{z}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 max-w-xs">
              <Label htmlFor="grid-fee" className="text-sm">{t("settings.electricityGridFee")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="grid-fee"
                  value={gridFee}
                  onChange={e => setGridFee(e.target.value)}
                  className="w-28 h-8 text-sm"
                  placeholder="65"
                />
                <span className="text-sm text-muted-foreground">öre / kWh</span>
              </div>
            </div>
          </div>
        )}

        {/* Tibber — informational */}
        {model === "tibber" && (
          <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-1">
            <p className="font-medium">{t("settings.electricityTibberInfo")}</p>
            <p className="text-muted-foreground text-xs">{t("settings.electricityTibberNote")}</p>
          </div>
        )}

        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? t("settings.saving") : t("settings.save")}
        </Button>
      </CardContent>
    </Card>
  );
}
