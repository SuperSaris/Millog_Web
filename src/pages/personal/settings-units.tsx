import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { IconRuler2, IconCurrencyDollar, IconGauge } from "@tabler/icons-react";
import { toast } from "sonner";

type DistanceUnit = "km" | "mi";
type PressureUnit = "bar" | "psi";
type Currency     = "SEK" | "EUR" | "USD" | "GBP";

function SegmentedControl<T extends string>({
  value, options, onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border overflow-hidden">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-4 py-1.5 text-sm font-medium transition-colors ${
            value === opt.value
              ? "bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsUnitsSection() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>("km");
  const [currency, setCurrency]         = useState<Currency>("SEK");
  const [pressureUnit, setPressureUnit] = useState<PressureUnit>("bar");
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("distance_unit_preference, currency_preference, pressure_unit_preference")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          if (data.distance_unit_preference) setDistanceUnit(data.distance_unit_preference as DistanceUnit);
          if (data.currency_preference)      setCurrency(data.currency_preference as Currency);
          if (data.pressure_unit_preference) setPressureUnit(data.pressure_unit_preference as PressureUnit);
        }
        setLoading(false);
      });
  }, [user]);

  async function save(field: string, value: string) {
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ [field]: value })
      .eq("id", user.id);
    if (error) toast.error(t("settings.saveFailed"));
    else toast.success(t("settings.saved"));
  }

  function handleDistance(v: DistanceUnit) {
    setDistanceUnit(v);
    save("distance_unit_preference", v);
  }
  function handleCurrency(v: Currency) {
    setCurrency(v);
    save("currency_preference", v);
  }
  function handlePressure(v: PressureUnit) {
    setPressureUnit(v);
    save("pressure_unit_preference", v);
  }

  if (loading) return <Skeleton className="h-48 rounded-xl" />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <IconRuler2 className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>{t("settings.unitsTitle")}</CardTitle>
            <CardDescription className="mt-0.5">{t("settings.unitsDescription")}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <Label className="text-sm font-medium">{t("settings.distanceUnit")}</Label>
            <p className="text-xs text-muted-foreground mt-0.5">{t("settings.distanceUnitHint")}</p>
          </div>
          <SegmentedControl
            value={distanceUnit}
            options={[{ value: "km", label: "km" }, { value: "mi", label: "mi" }]}
            onChange={handleDistance}
          />
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <Label className="text-sm font-medium flex items-center gap-1">
              <IconCurrencyDollar className="h-4 w-4" />{t("settings.currency")}
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">{t("settings.currencyHint")}</p>
          </div>
          <SegmentedControl
            value={currency}
            options={[
              { value: "SEK", label: "SEK" },
              { value: "EUR", label: "EUR" },
              { value: "USD", label: "USD" },
              { value: "GBP", label: "GBP" },
            ]}
            onChange={handleCurrency}
          />
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <Label className="text-sm font-medium flex items-center gap-1">
              <IconGauge className="h-4 w-4" />{t("settings.pressureUnit")}
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">{t("settings.pressureUnitHint")}</p>
          </div>
          <SegmentedControl
            value={pressureUnit}
            options={[{ value: "bar", label: "bar" }, { value: "psi", label: "PSI" }]}
            onChange={handlePressure}
          />
        </div>
      </CardContent>
    </Card>
  );
}
