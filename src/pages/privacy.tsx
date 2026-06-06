import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "@/components/language-switcher";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-lg font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-sm leading-relaxed text-muted-foreground">{children}</p>;
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded border border-border bg-muted/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

function TwoColTable({ headers, rows }: { headers: [string, string]; rows: [string, string][] }) {
  return (
    <div className="mt-3 overflow-hidden rounded border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {headers[0]}
            </th>
            <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {headers[1]}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b], i) => (
            <tr key={i} className={i < rows.length - 1 ? "border-b border-border" : ""}>
              <td className="px-4 py-2.5 text-foreground">{a}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ThreeColTable({
  headers,
  rows,
}: {
  headers: [string, string, string];
  rows: [string, string, string][];
}) {
  return (
    <div className="mt-3 overflow-x-auto rounded border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            {headers.map((h) => (
              <th
                key={h}
                className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([a, b, c], i) => (
            <tr key={i} className={i < rows.length - 1 ? "border-b border-border" : ""}>
              <td className="px-4 py-2.5 text-foreground">{a}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{b}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{c}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PrivacyPage() {
  const { t } = useTranslation();

  const dc = t("privacy.dataCollected", { returnObjects: true }) as {
    title: string; intro: string; colData: string; colPurpose: string; colBasis: string;
    lawNote: string; rows: [string, string, string][];
  };
  const vd = t("privacy.vehicleData", { returnObjects: true }) as {
    title: string; intro: string; teslaLabel: string; teslaBadge: string; teslaSub: string;
    enodeLabel: string; enodeBadge: string; enodeSub: string; col1: string; col2: string;
    tsignals: [string, string][]; esignals: [string, string][]; note: string;
  };
  const ta = t("privacy.teslaApi", { returnObjects: true }) as {
    title: string; intro: string; scopes: [string, string][]; noControl: string; noWake: string;
  };
  const st = t("privacy.storage", { returnObjects: true }) as {
    title: string; rows: [string, string][]; body: string; note: string;
  };
  const sh = t("privacy.sharing", { returnObjects: true }) as {
    title: string; intro: string; partners: [string, string][]; noSell: string;
  };
  const re = t("privacy.retention", { returnObjects: true }) as {
    title: string; rows: [string, string][]; note: string;
  };
  const ri = t("privacy.rights", { returnObjects: true }) as {
    title: string; intro: string; items: [string, string][];
  };
  const sec = t("privacy.security", { returnObjects: true }) as {
    title: string; items: string[];
  };
  const con = t("privacy.contact", { returnObjects: true }) as {
    title: string; body: string; responseTime: string;
  };
  const ctrl = t("privacy.controller", { returnObjects: true }) as {
    title: string; body: string; name: string; contactLabel: string; email: string;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link to="/" className="font-semibold text-foreground">
            Millog
          </Link>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">
              {t("privacy.backToLogin")}
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-10 border-b border-border pb-8">
          <h1 className="text-3xl font-bold text-foreground">{t("privacy.pageTitle")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("privacy.updated")}</p>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{t("privacy.intro")}</p>
        </div>

        {/* 1 */}
        <Section title={ctrl.title}>
          <P>{ctrl.body}</P>
          <div className="rounded border border-border bg-muted/20 px-4 py-3 text-sm">
            <p className="font-medium text-foreground">{ctrl.name}</p>
            <p className="mt-1 text-muted-foreground">
              {ctrl.contactLabel}:{" "}
              <a href={`mailto:${ctrl.email}`} className="text-primary underline underline-offset-2">
                {ctrl.email}
              </a>
            </p>
          </div>
        </Section>

        {/* 2 */}
        <Section title={dc.title}>
          <P>{dc.intro}</P>
          <ThreeColTable
            headers={[dc.colData, dc.colPurpose, dc.colBasis]}
            rows={dc.rows}
          />
          <Note>{dc.lawNote}</Note>
        </Section>

        {/* 3 */}
        <Section title={vd.title}>
          <P>{vd.intro}</P>

          <div className="mt-4 rounded border border-border p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="font-medium text-foreground">{vd.teslaLabel}</span>
              <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {vd.teslaBadge}
              </span>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">{vd.teslaSub}</p>
            <TwoColTable headers={[vd.col1, vd.col2]} rows={vd.tsignals} />
          </div>

          <div className="mt-3 rounded border border-border p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="font-medium text-foreground">{vd.enodeLabel}</span>
              <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {vd.enodeBadge}
              </span>
            </div>
            <p className="mb-3 text-xs text-muted-foreground">{vd.enodeSub}</p>
            <TwoColTable headers={[vd.col1, vd.col2]} rows={vd.esignals} />
          </div>

          <Note>{vd.note}</Note>
        </Section>

        {/* 4 */}
        <Section title={ta.title}>
          <P>{ta.intro}</P>
          <div className="mt-3 space-y-2">
            {ta.scopes.map(([scope, desc]) => (
              <div key={scope} className="rounded border border-border px-4 py-3 text-sm">
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                  {scope}
                </code>
                <p className="mt-1.5 text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
          <Note>{ta.noControl}</Note>
          <Note>{ta.noWake}</Note>
        </Section>

        {/* 5 */}
        <Section title={st.title}>
          <TwoColTable headers={["", ""]} rows={st.rows} />
          <P>{st.body}</P>
          <Note>{st.note}</Note>
        </Section>

        {/* 6 */}
        <Section title={sh.title}>
          <P>{sh.intro}</P>
          <div className="mt-3 space-y-2">
            {sh.partners.map(([name, desc]) => (
              <div key={name} className="rounded border border-border px-4 py-3 text-sm">
                <p className="font-medium text-foreground">{name}</p>
                <p className="mt-1 text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
          <Note>{sh.noSell}</Note>
        </Section>

        {/* 7 */}
        <Section title={re.title}>
          <TwoColTable headers={["", ""]} rows={re.rows} />
          <Note>{re.note}</Note>
        </Section>

        {/* 8 */}
        <Section title={ri.title}>
          <P>{ri.intro}</P>
          <div className="mt-3 space-y-2">
            {ri.items.map(([title, body]) => (
              <div key={title} className="rounded border border-border px-4 py-3 text-sm">
                <p className="font-medium text-foreground">{title}</p>
                <p className="mt-1 text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* 9 */}
        <Section title={sec.title}>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {sec.items.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-0.5 shrink-0 select-none text-foreground">·</span>
                {item}
              </li>
            ))}
          </ul>
        </Section>

        {/* 10 */}
        <Section title={con.title}>
          <P>{con.body}</P>
          <div className="rounded border border-border bg-muted/20 px-4 py-3 text-sm">
            <a
              href={`mailto:${ctrl.email}`}
              className="font-medium text-primary underline underline-offset-2"
            >
              {ctrl.email}
            </a>
          </div>
          <P>{con.responseTime}</P>
        </Section>

        <div className="border-t border-border pt-8 text-xs text-muted-foreground">
          {t("privacy.footer")}
        </div>
      </div>
    </div>
  );
}
