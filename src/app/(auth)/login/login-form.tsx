"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Notice } from "@/components/feedback/notice";
import { Button } from "@/components/ui/button";
import { ErrorSummary, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { signIn, signInWithGoogle } from "@/data";
import { useMutation } from "@/hooks/use-mutation";
import { t } from "@/i18n";
import { useSession } from "@/components/providers/session-provider";
import { flattenErrors } from "@/lib/form";
import { safeNext } from "@/lib/safe-next";
import { loginSchema, type LoginInput } from "@/schemas/auth";
import { GoogleIcon } from "../google-icon";

export function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next");
  const [rateLimited, setRateLimited] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [navigating, setNavigating] = useState(false);
  const session = useSession();
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" }, mode: "onTouched" });
  const { errors, isSubmitted } = form.formState;

  const done = (onboarded: boolean, role: string) => {
    toast.success(t("auth.loggedIn"));
    // Next keeps this page alive (hidden) after navigating away; don't leave the password in it.
    form.resetField("password");
    setNavigating(true);
    const target = safeNext(next, role === "admin" || role === "moderator" ? "/admin" : onboarded ? "/dashboard" : "/onboarding");
    // Wait until the client session knows the user, otherwise the protected page sees a
    // stale "guest" and bounces straight back to /login.
    void session
      .verify()
      .catch(() => {})
      .then(() => router.push(target));
  };
  const login = useMutation((k: string, v: LoginInput) => signIn(v.email, v.password, k), {
    toastError: false,
    onSuccess: (d) => done(d.onboardingCompleted, d.role),
    onError: (e) => {
      if (e.code === "RATE_LIMITED") setRateLimited(e.retryAfterSec ?? 60);
      else setFormError(e.message_bn);
    },
  });
  // Google redirects the whole page; the callback route signs the user in.
  const google = useMutation(() => signInWithGoogle(sp.get("next") ?? undefined));
  const summary = isSubmitted ? flattenErrors(errors, (p) => (p === "email" ? t("auth.email") : t("auth.password"))) : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("auth.loginTitle")}</h1>
        <p className="text-muted-foreground">{t("auth.loginSub")}</p>
      </div>
      {rateLimited != null && (
        <Notice tone="warning" live title={t("states.rateLimited")}>
          {t("states.rateLimitedWait", { sec: rateLimited })}
        </Notice>
      )}
      {formError && <Notice tone="danger" live>{formError}</Notice>}
      <ErrorSummary errors={summary} />
      <form
        noValidate
        className="space-y-4"
        onSubmit={form.handleSubmit(
          (v) => {
            setFormError(null);
            setRateLimited(null);
            void login.run(v);
          },
          () => requestAnimationFrame(() => document.getElementById("error-summary")?.focus()),
        )}
      >
        <Field id="email" label={t("auth.email")} required error={errors.email?.message}>
          <Input type="email" autoComplete="email" inputMode="email" {...form.register("email")} />
        </Field>
        <Field id="password" label={t("auth.password")} required error={errors.password?.message}>
          <PasswordInput autoComplete="current-password" {...form.register("password")} />
        </Field>
        {/* Negative margin: keeps the 44px tap target without adding a full row of space. */}
        <div className="-my-2 flex justify-end">
          <Link href="/forgot-password" className="inline-flex min-h-11 items-center font-medium text-primary hover:underline">
            {t("auth.forgot")}
          </Link>
        </div>
        <Button type="submit" className="w-full" loading={login.pending || navigating} disabled={rateLimited != null && login.pending}>
          {t("auth.loginButton")}
        </Button>
      </form>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {t("common.or")}
        <span className="h-px flex-1 bg-border" />
      </div>
      <Button variant="secondary" className="w-full" loading={google.pending} onClick={() => void google.run()}>
        <GoogleIcon />
        {t("auth.google")}
      </Button>
      <p className="text-center">
        {t("auth.noAccount")}{" "}
        <Link href="/signup" className="font-semibold text-primary hover:underline">
          {t("nav.signup")}
        </Link>
      </p>
    </div>
  );
}
