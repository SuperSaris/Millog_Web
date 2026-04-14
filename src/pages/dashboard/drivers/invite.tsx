import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useOrg } from "@/contexts/org-context";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconUserPlus, IconArrowLeft } from "@tabler/icons-react";
import { toast } from "sonner";

export function InviteDriverPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { organization } = useOrg();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("driver");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!organization) return;
    setError(null);
    setLoading(true);

    const { error: fnError } = await supabase.functions.invoke(
      "fleet-invite-driver",
      {
        body: {
          organization_id: organization.id,
          name: name.trim(),
          email: email.trim().toLowerCase(),
          role,
        },
      },
    );

    if (fnError) {
      setError(fnError.message);
      setLoading(false);
      return;
    }

    toast.success(t("drivers.inviteSent", { email: email.trim() }));
    navigate("/dashboard/drivers");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/drivers")}>
          <IconArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("drivers.inviteTitle")}</h1>
          <p className="text-muted-foreground">{t("drivers.inviteDescription")}</p>
        </div>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconUserPlus className="h-5 w-5" />
            {t("drivers.inviteTitle")}
          </CardTitle>
          <CardDescription>{t("drivers.invitePageDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="invite-name">{t("drivers.nameLabel")}</Label>
                <Input
                  id="invite-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("drivers.namePlaceholder")}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-email">{t("auth.email")}</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("drivers.emailPlaceholder")}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("drivers.roleLabel")}</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="w-full sm:w-[240px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="driver">{t("drivers.roleDriver")}</SelectItem>
                  <SelectItem value="admin">{t("drivers.roleAdmin")}</SelectItem>
                  <SelectItem value="viewer">{t("drivers.roleViewer")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">{t("drivers.roleHint")}</p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-3">
              <Button type="submit" disabled={loading}>
                {loading ? t("common.loading") : t("drivers.sendInvite")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/dashboard/drivers")}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
