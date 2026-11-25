"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Notice } from "@/components/feedback/notice";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorSummary, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { signInWithGoogle, signUp } from "@/data";
import { useMutation } from "@/hooks/use-mutation";
import { messages, t } from "@/i18n";
import { applyServerErrors, flattenErrors } from "@/lib/form";
import { cn } from "@/lib/utils";
import { passwordStrength, signupSchema, type SignupInput } from "@/schemas/auth";
import { GoogleIcon } from "../google-icon";

const LABELS: Record<string, string> = { fullName: t("auth.name"), email: t("auth.email"), password: t("auth.password"), terms: t("auth.terms") };
const BAR = ["bg-danger", "bg-danger", "bg-warning", "bg-success", "bg-success"];

export function SignupForm() {
  const router = useRouter();
  const [rateLimited, setRateLimited] = useState<number | null>(null);
  const form = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: "", email: "", password: "", terms: false },
    mode: "onTouched",
  });
  const { errors, isSubmitted } = form.formState;
  const pw = useWatch({ control: form.control, name: "password" });
  const strength = passwordStrength(pw);

  const signup = useMutation((k: string, v: SignupInput) => signUp(v, k), {
    toastError: false,
    onSuccess: (d) => router.push(`/check-email?email=${encodeURIComponent(d.email)}`),
    onError: (e) => {
      if (e.code === "RATE_LIMITED") setRateLimited(e.retryAfterSec ?? 60);
      // Errors without field details (server or network) would otherwise show nothing at all.
      else if (!e.fields) toast.error(e.message_bn, { description: e.requestId ? `রেফারেন্স: ${e.requestId}` : undefined });
      applyServerErrors(e.fields, form.setError as never);
    },
  });
  // Google redirects the whole page; the callback route signs the user in.
  const google = useMutation(() => signInWithGoogle("/onboarding"));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t("auth.signupTitle")}</h1>
        <p className="text-muted-foreground">{t("auth.signupSub")}</p>
      </div>
      {rateLimited != null && (
        <Notice tone="warning" live title={t("states.rateLimited")}>
          {t("states.rateLimitedWait", { sec: rateLimited })}
        </Notice>
      )}
      <ErrorSummary errors={isSubmitted ? flattenErrors(errors, (p) => LABELS[p] ?? p) : []} />
      <form
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit(
          (v) => {
            setRateLimited(null);
            void signup.run(v);
          },
          () => requestAnimationFrame(() => document.getElementById("error-summary")?.focus()),
        )}
      >
        <Field id="fullName" label={t("auth.name")} required error={errors.fullName?.message}>
          <Input autoComplete="name" {...form.register("fullName")} />
        </Field>
        <Field id="email" label={t("auth.email")} required error={errors.email?.message}>
          <Input type="email" autoComplete="email" inputMode="email" {...form.register("email")} />
        </Field>
        <Field id="password" label={t("auth.password")} required error={errors.password?.message} hint={t("validation.passwordWeak")}>
          <PasswordInput autoComplete="new-password" {...form.register("password")} />
        </Field>
        <div aria-live="polite">
          <div className="flex gap-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < strength ? BAR[strength] : "bg-muted")} />
            ))}
          </div>
          {pw && <p className="mt-1 text-sm text-muted-foreground">{t("auth.strength", { level: messages.auth.strengthLevels[strength] })}</p>}
        </div>
        <Controller
          control={form.control}
          name="terms"
          render={({ field }) => (
            <div data-field="terms">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="terms"
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                  aria-invalid={!!errors.terms}
                  aria-describedby={errors.terms ? "terms-error" : undefined}
                  className="mt-1"
                />
                <label htmlFor="terms" className="leading-snug">
                  {t("auth.terms")} <span className="text-sm text-muted-foreground">{t("common.requiredMark")}</span>{" "}
                  (<Link href="/terms" className="text-primary underline" target="_blank">{t("footer.terms")}</Link>)
                </label>
              </div>
              {errors.terms && (
                <p id="terms-error" className="mt-1 text-sm font-medium text-danger" aria-live="polite">
                  ⚠ {errors.terms.message}
                </p>
              )}
            </div>
          )}
        />
        <Button type="submit" size="lg" className="w-full" loading={signup.pending}>
          {t("auth.signupButton")}
        </Button>
      </form>
      <Button variant="secondary" size="lg" className="w-full" loading={google.pending} onClick={() => void google.run()}>
        <GoogleIcon />
        {t("auth.google")}
      </Button>
      <p className="text-center">
        {t("auth.haveAccount")}{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          {t("nav.login")}
        </Link>
      </p>
    </div>
  );
}
