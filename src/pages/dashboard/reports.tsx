import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconDownload } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

export function ReportsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("reports.title")}</h1>
        <p className="text-muted-foreground">
          {t("reports.description")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("reports.driveLog")}</CardTitle>
            <CardDescription>{t("reports.driveLogDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" disabled>
              <IconDownload className="mr-2 h-4 w-4" />
              {t("reports.exportCsv")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("reports.fleetOverview")}</CardTitle>
            <CardDescription>{t("reports.fleetOverviewDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" disabled>
              <IconDownload className="mr-2 h-4 w-4" />
              {t("reports.exportPdf")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("reports.taxReport")}</CardTitle>
            <CardDescription>{t("reports.taxReportDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" disabled>
              <IconDownload className="mr-2 h-4 w-4" />
              {t("reports.export")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
