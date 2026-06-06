import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IconCash } from "@tabler/icons-react";
import { toast } from "sonner";

export function SettingsReimbursementSection() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [rate, setRate]     = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("milersattning_kr_per_km")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.milersattning_kr_per_km != null) {
          setRate(String(data.milersattning_kr_per_km));
        } else {
          setRate("2.50");
        }
        setLoading(false);
      });
  }, [user]);

  async function handleSave() {
    if (!user) return;
    const parsed = parseFloat(rate.replace(",", "."));
    if (isNaN(parsed) || parsed < 0) {
      toast.error(t("settings.reimbursementInvalidRate"));
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ milersattning_kr_per_km: parsed })
      .eq("id", user.id);
    setSaving(false);
    if (error) toast.error(t("settings.saveFailed"));
    else toast.success(t("settings.saved"));
  }

  if (loading) return <Skeleton className="h-40 rounded-xl" />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <IconCash className="h-5 w-5 text-primary" />
          <div>
            <CardTitle>{t("settings.reimbursementTitle")}</CardTitle>
            <CardDescription className="mt-0.5">{t("settings.reimbursementDescription")}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5 max-w-xs">
          <Label htmlFor="reimb-rate" className="text-sm">{t("settings.reimbursementRate")}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="reimb-rate"
              value={rate}
              onChange={e => setRate(e.target.value)}
              className="w-28 h-8 text-sm"
              placeholder="2.50"
            />
            <span className="text-sm text-muted-foreground">kr / km</span>
          </div>
          <p className="text-xs text-muted-foreground">{t("settings.reimbursementNote")}</p>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? t("settings.saving") : t("settings.save")}
        </Button>
      </CardContent>
    </Card>
  );
}
