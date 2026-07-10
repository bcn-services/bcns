"use client";

import * as React from "react";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@acme-labs/ui";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Status = "idle" | "submitting" | "success" | "error";

type FieldName = "name" | "business" | "email" | "message";

type Errors = Partial<Record<FieldName, string>>;

const ENDPOINT = process.env.NEXT_PUBLIC_CONTACT_ENDPOINT;
const ACCESS_KEY = process.env.NEXT_PUBLIC_CONTACT_ACCESS_KEY;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(values: Record<FieldName, string>): Errors {
  const errors: Errors = {};
  if (!values.name.trim()) errors.name = "Please tell us your name.";
  if (!values.business.trim()) errors.business = "What's the business called?";
  if (!values.email.trim()) {
    errors.email = "We need an email to reply to.";
  } else if (!EMAIL_RE.test(values.email.trim())) {
    errors.email = "That doesn't look like a valid email.";
  }
  if (values.message.trim().length < 10) {
    errors.message = "A sentence or two about what you need helps us prep.";
  }
  return errors;
}

export function ContactForm() {
  const [status, setStatus] = React.useState<Status>("idle");
  const [errors, setErrors] = React.useState<Errors>({});
  const [serverError, setServerError] = React.useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError(null);

    const form = event.currentTarget;
    const data = new FormData(form);
    const values: Record<FieldName, string> = {
      name: String(data.get("name") ?? ""),
      business: String(data.get("business") ?? ""),
      email: String(data.get("email") ?? ""),
      message: String(data.get("message") ?? ""),
    };

    const nextErrors = validate(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setStatus("submitting");

    // No endpoint configured yet: simulate success so the UX is demoable in dev.
    if (!ENDPOINT) {
      console.warn(
        "[contact-form] NEXT_PUBLIC_CONTACT_ENDPOINT is not set — submission was not delivered. See .env.example."
      );
      await new Promise((resolve) => setTimeout(resolve, 600));
      setStatus("success");
      form.reset();
      return;
    }

    try {
      const payload: Record<string, string> = { ...values };
      if (ACCESS_KEY) payload.access_key = ACCESS_KEY;
      payload.subject = `New consult request from ${values.name} (${values.business})`;

      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`Request failed with status ${res.status}`);

      setStatus("success");
      form.reset();
    } catch (err) {
      setStatus("error");
      setServerError(
        err instanceof Error
          ? "Something went wrong sending your message. Please email us directly."
          : "Unexpected error."
      );
    }
  }

  if (status === "success") {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-10 text-center"
      >
        <CheckCircle2 className="size-10 text-primary" aria-hidden />
        <h3 className="text-xl font-semibold">Thanks — we&apos;ll be in touch.</h3>
        <p className="max-w-sm text-muted-foreground">
          We read every message and usually reply within one business day to set up your free
          consult.
        </p>
        <Button variant="outline" className="mt-2" onClick={() => setStatus("idle")}>
          Send another
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5" aria-label="Contact">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="name" label="Your name" error={errors.name}>
          <Input id="name" name="name" autoComplete="name" placeholder="Jordan Rivera" />
        </Field>
        <Field id="business" label="Business name" error={errors.business}>
          <Input
            id="business"
            name="business"
            autoComplete="organization"
            placeholder="Rivera Plumbing"
          />
        </Field>
      </div>

      <Field id="email" label="Email" error={errors.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="jordan@riveraplumbing.com"
        />
      </Field>

      <Field id="message" label="What do you need?" error={errors.message}>
        <Textarea
          id="message"
          name="message"
          placeholder="We schedule jobs by group text and it's falling apart. We need a simple way to book, assign, and track jobs for a 6-person crew."
        />
      </Field>

      {serverError ? (
        <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
          <AlertCircle className="size-4" aria-hidden />
          {serverError}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={status === "submitting"} className="w-full sm:w-auto">
        {status === "submitting" ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Sending…
          </>
        ) : (
          "Book a free consult"
        )}
      </Button>

      <p className="text-xs text-muted-foreground">
        No spam and no obligation. We only use your details to reply about your project.
      </p>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: FieldName;
  label: string;
  error?: string;
  children: React.ReactElement;
}) {
  const describedBy = error ? `${id}-error` : undefined;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {React.cloneElement(children, {
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      } as React.HTMLAttributes<HTMLElement>)}
      {error ? (
        <p id={describedBy} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
