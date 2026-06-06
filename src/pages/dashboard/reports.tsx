import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useOrg } from "@/contexts/org-context";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { IconDownload, IconFileSpreadsheet, IconFileText, IconReceipt } from "@tabler/icons-react";
import { toast } from "sonner";

/* ── Types ─────────────────────────────────────────────── */

interface ReportCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  format: string;
  edgeFunction: string;
  orgId: string;
  from: string;
  to: string;
}

/* ── Report Card ───────────────────────────────────────── */

function ReportCard({ title, description, icon, format, edgeFunction, orgId, from, to }: ReportCardProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    if (!from || !to) {
      toast.error(t("reports.selectPeriod"));
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke(edgeFunction, {
      body: { organization_id: orgId, from, to, format },
    });

    if (error) {
      toast.error(t("reports.exportFailed"));
      setLoading(false);
      return;
    }

    // If Edge Function returns a download URL, validate origin before opening
    if (data?.url) {
      try {
        const parsed = new URL(data.url);
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
        const allowedOrigins = [new URL(supabaseUrl).origin, window.location.origin];
        if (allowedOrigins.includes(parsed.origin)) {
          window.open(data.url, "_blank");
        } else {
          toast.error(t("reports.exportFailed"));
        }
      } catch {
        toast.error(t("reports.exportFailed"));
      }
    } else {
      toast.success(t("reports.exportStarted"));
    }
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle>{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={handleExport} disabled={loading || !from || !to}>
          <IconDownload className="mr-2 h-4 w-4" />
          {loading ? t("common.loading") : t("reports.export")}
        </Button>
      </CardContent>
    </Card>
  );
}

/* ── Main Page ─────────────────────────────────────────── */

export function ReportsPage() {
  const { t } = useTranslation();
  const { organization } = useOrg();

  // Default to current month
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);

  const orgId = organization?.id ?? "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("reports.title")}</h1>
        <p className="text-muted-foreground">{t("reports.description")}</p>
      </div>

      {/* Period selector */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-1.5">
            <Label htmlFor="report-from">{t("reports.from")}</Label>
            <Input
              id="report-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-to">{t("reports.to")}</Label>
            <Input
              id="report-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-40"
            />
          </div>
        </CardContent>
      </Card>

      {/* Report cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ReportCard
          title={t("reports.driveLog")}
          description={t("reports.driveLogDescription")}
          icon={<IconFileSpreadsheet className="h-5 w-5 text-primary" />}
          format="csv"
          edgeFunction="fleet-generate-report"
          orgId={orgId}
          from={from}
          to={to}
        />
        <ReportCard
          title={t("reports.fleetOverview")}
          description={t("reports.fleetOverviewDescription")}
          icon={<IconFileText className="h-5 w-5 text-primary" />}
          format="pdf"
          edgeFunction="fleet-generate-report"
          orgId={orgId}
          from={from}
          to={to}
        />
        <ReportCard
          title={t("reports.taxReport")}
          description={t("reports.taxReportDescription")}
          icon={<IconReceipt className="h-5 w-5 text-primary" />}
          format="skatteverket"
          edgeFunction="fleet-generate-report"
          orgId={orgId}
          from={from}
          to={to}
        />
      </div>
    </div>
  );
}
