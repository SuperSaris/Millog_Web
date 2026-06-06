import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IconChevronDown, IconChevronUp, IconCheck } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LanguageSwitcher } from "@/components/language-switcher";
import { supabase } from "@/lib/supabase";

/* ── FAQ item ─────────────────────────────────────────── */

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-medium text-foreground hover:text-foreground/80"
        aria-expanded={open}
      >
        <span>{q}</span>
        {open ? (
          <IconChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <IconChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {open && (
        <p className="pb-4 text-sm leading-relaxed text-muted-foreground">{a}</p>
      )}
    </div>
  );
}

/* ── Contact form ─────────────────────────────────────── */

type FormState = "idle" | "submitting" | "success" | "error";

interface FormValues {
  name: string;
  email: string;
  subject: string;
  message: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
}

function validateForm(values: FormValues, t: (key: string) => string): FormErrors {
  const errors: FormErrors = {};
  if (!values.name.trim()) errors.name = t("support.required");
  if (!values.email.trim()) {
    errors.email = t("support.required");
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
    errors.email = t("support.emailInvalid");
  }
  if (!values.subject.trim()) errors.subject = t("support.required");
  if (!values.message.trim()) errors.message = t("support.required");
  return errors;
}

function ContactForm() {
  const { t } = useTranslation();
  const [values, setValues] = useState<FormValues>({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [formState, setFormState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    const { name, value } = e.target;
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationErrors = validateForm(values, t);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setFormState("submitting");
    setErrorMsg("");

    try {
      const { error } = await supabase.functions.invoke("support-contact", {
        body: {
          name: values.name.trim(),
          email: values.email.trim(),
          subject: values.subject.trim(),
          message: values.message.trim(),
        },
      });

      if (error) throw error;
      setFormState("success");
    } catch (err) {
      console.error("Support contact error:", err);
      setFormState("error");
      setErrorMsg(t("support.errorGeneric"));
    }
  }

  if (formState === "success") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/20 px-6 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
          <IconCheck className="h-6 w-6 text-green-500" />
        </div>
        <h3 className="text-base font-semibold text-foreground">
          {t("support.successTitle")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("support.successBody")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* Name + Email */}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">{t("support.nameLabel")}</Label>
          <Input
            id="name"
            name="name"
            placeholder={t("support.namePlaceholder")}
            value={values.name}
            onChange={handleChange}
            autoComplete="name"
            aria-invalid={!!errors.name}
          />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">{t("support.emailLabel")}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder={t("support.emailPlaceholder")}
            value={values.email}
            onChange={handleChange}
            autoComplete="email"
            aria-invalid={!!errors.email}
          />
          {errors.email && (
            <p className="text-xs text-destructive">{errors.email}</p>
          )}
        </div>
      </div>

      {/* Subject */}
      <div className="space-y-1.5">
        <Label htmlFor="subject">{t("support.subjectLabel")}</Label>
        <Input
          id="subject"
          name="subject"
          placeholder={t("support.subjectPlaceholder")}
          value={values.subject}
          onChange={handleChange}
          aria-invalid={!!errors.subject}
        />
        {errors.subject && (
          <p className="text-xs text-destructive">{errors.subject}</p>
        )}
      </div>

      {/* Message */}
      <div className="space-y-1.5">
        <Label htmlFor="message">{t("support.messageLabel")}</Label>
        <Textarea
          id="message"
          name="message"
          placeholder={t("support.messagePlaceholder")}
          value={values.message}
          onChange={handleChange}
          rows={6}
          aria-invalid={!!errors.message}
          className="resize-y"
        />
        {errors.message && (
          <p className="text-xs text-destructive">{errors.message}</p>
        )}
      </div>

      {errorMsg && (
        <p className="rounded border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {errorMsg}
        </p>
      )}

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          {t("support.privacyNote")}
          <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">
            {t("support.privacyLink")}
          </Link>
          .
        </p>
        <Button
          type="submit"
          disabled={formState === "submitting"}
          className="shrink-0"
        >
          {formState === "submitting" ? t("support.sending") : t("support.sendButton")}
        </Button>
      </div>
    </form>
  );
}

/* ── Support page ─────────────────────────────────────── */

export function SupportPage() {
  const { t } = useTranslation();

  const faqItems = t("support.faq", { returnObjects: true }) as {
    q: string;
    a: string;
  }[];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link to="/" className="font-semibold text-foreground">
            Millog
          </Link>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <Link
              to="/login"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {t("support.backToApp")}
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-12">
        {/* Hero */}
        <div className="mb-12 border-b border-border pb-10 text-center">
          <h1 className="text-3xl font-bold text-foreground">
            {t("support.pageTitle")}
          </h1>
          <p className="mt-2 text-muted-foreground">{t("support.pageSubtitle")}</p>
          <div className="mt-6">
            <a
              href="https://apps.apple.com/app/millog/id6504255773"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/30 px-4 py-2 text-sm text-foreground hover:bg-muted/60"
            >
              {t("support.appStoreLink")} →
            </a>
          </div>
        </div>

        {/* FAQ */}
        <section className="mb-14">
          <h2 className="mb-6 text-xl font-semibold text-foreground">
            {t("support.faqTitle")}
          </h2>
          <div className="rounded-xl border border-border px-6">
            {faqItems.map((item, i) => (
              <FaqItem key={i} q={item.q} a={item.a} />
            ))}
          </div>
        </section>

        {/* Contact form */}
        <section>
          <h2 className="mb-1 text-xl font-semibold text-foreground">
            {t("support.contactTitle")}
          </h2>
          <p className="mb-6 text-sm text-muted-foreground">
            {t("support.contactSubtitle")}
          </p>
          <ContactForm />
        </section>
      </div>

      {/* Footer */}
      <div className="border-t py-6 text-center text-xs text-muted-foreground">
        <p>
          © {new Date().getFullYear()} Bicoli Group AB ·{" "}
          <Link to="/privacy" className="hover:text-foreground">
            {t("privacy.pageTitle")}
          </Link>
        </p>
      </div>
    </div>
  );
}
