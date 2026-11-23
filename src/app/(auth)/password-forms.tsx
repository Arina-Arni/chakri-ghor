"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";
import { Notice } from "@/components/feedback/notice";
import { Button } from "@/components/ui/button";
import { ErrorSummary, Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { confirmEmailDemo, requestPasswordReset, resetPassword } from "@/data";
import { useMutation } from "@/hooks/use-mutation";
import { t } from "@/i18n";
import { flattenErrors } from "@/lib/form";
import { forgotPasswordSchema, resetPasswordSchema } from "@/schemas/auth";
import type { z } from "zod";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const form = useForm<z.input<typeof forgotPasswordSchema>>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });
  const m = useMutation((k: string, email: string) => requestPasswordReset(email, k), {
    toastError: false,
    onSuccess: () => setSent(true),
    onError: (e) => setRateLimited(e.code === "RATE_LIMITED"),
  });
  const { errors, isSubmitted } = form.formState;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t("auth.forgotTitle")}</h1>
        <p className="text-muted-foreground">{t("auth.forgotSub")}</p>
      </div>
      {sent && <Notice tone="success" live>{t("auth.forgotSent")}</Notice>}
      {rateLimited && <Notice tone="warning" live>{t("states.rateLimited")}</Notice>}
      <ErrorSummary errors={isSubmitted ? flattenErrors(errors, () => t("auth.email")) : []} />
      <form noValidate className="space-y-4" onSubmit={form.handleSubmit((v) => void m.run(v.email))}>
        <Field id="email" label={t("auth.email")} required error={errors.email?.message}>
          <Input type="email" autoComplete="email" {...form.register("email")} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={m.pending}>
          {t("auth.forgotButton")}
        </Button>
      </form>
      <Link href="/login" className="inline-flex min-h-11 items-center font-medium text-primary hover:underline">
        {t("auth.backToLogin")}
      </Link>
    </div>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const form = useForm<z.input<typeof resetPasswordSchema>>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: "", confirm: "" }, mode: "onTouched" });
  const m = useMutation((k: string, pw: string) => resetPassword(pw, k), {
    successMessage: t("auth.resetDone"),
    onSuccess: () => router.push("/login"),
  });
  const { errors, isSubmitted } = form.formState;
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t("auth.resetTitle")}</h1>
      <ErrorSummary errors={isSubmitted ? flattenErrors(errors, (p) => (p === "confirm" ? t("auth.confirmPassword") : t("auth.newPassword"))) : []} />
      <form noValidate className="space-y-4" onSubmit={form.handleSubmit((v) => void m.run(v.password))}>
        <Field id="password" label={t("auth.newPassword")} required error={errors.password?.message} hint={t("validation.passwordWeak")}>
          <PasswordInput autoComplete="new-password" {...form.register("password")} />
        </Field>
        <Field id="confirm" label={t("auth.confirmPassword")} required error={errors.confirm?.message}>
          <PasswordInput autoComplete="new-password" {...form.register("confirm")} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={m.pending}>
          {t("auth.resetButton")}
        </Button>
      </form>
    </div>
  );
}

export function CheckEmail() {
  const sp = useSearchParams();
  const router = useRouter();
  const email = sp.get("email") ?? "";
  const resend = useMutation((k: string) => requestPasswordReset(email || "x@example.com", k), { successMessage: t("auth.checkEmailResent") });
  const confirm = useMutation(() => confirmEmailDemo(), {
    onSuccess: () => {
      toast.success(t("auth.loggedIn"));
      router.push("/onboarding");
    },
  });
  return (
    <div className="space-y-5 text-center">
      <span className="mx-auto grid size-16 place-items-center rounded-full bg-primary-soft text-primary" aria-hidden>
        <MailCheck className="size-8" />
      </span>
      <h1 className="text-2xl font-bold">{t("auth.checkEmailTitle")}</h1>
      <p className="text-muted-foreground">{t("auth.checkEmailBody", { email: email || "আপনার ইমেইল" })}</p>
      <Button variant="secondary" className="w-full" loading={resend.pending} onClick={() => void resend.run()}>
        {t("auth.checkEmailResend")}
      </Button>
      {process.env.NODE_ENV !== "production" && (
        <Button variant="link" loading={confirm.pending} onClick={() => void confirm.run()}>
          ডেমো: লিংক ছাড়াই চালিয়ে যান
        </Button>
      )}
    </div>
  );
}
