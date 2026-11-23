"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { CardsSkeleton } from "@/components/feedback/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScoreRing } from "@/components/ui/score-ring";
import { listResumes } from "@/data";
import { formatRelativeBn } from "@/domain/bn";
import { useData } from "@/hooks/use-data";
import { t } from "@/i18n";

export function ResumeList() {
  const q = useData(() => listResumes(), []);
  if (q.status === "loading") return <CardsSkeleton count={3} />;
  if (q.status === "error") return <ErrorState error={q.error} onRetry={q.reload} />;
  if (q.data.length === 0)
    return <EmptyState icon={FileText} title={t("resume.emptyTitle")} body={t("resume.emptyBody")} action={<Button asChild><Link href="/jobs">{t("resume.emptyCta")}</Link></Button>} />;
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {q.data.map((r) => (
        <li key={r.id}>
          <article className="relative flex h-full items-center gap-4 rounded-xl border bg-surface p-4 shadow-card hover:border-primary">
            <ScoreRing score={r.atsScore} size={72} showLabel={false} />
            <div className="min-w-0 flex-1">
              <Badge size="sm" variant={r.kind === "base" ? "primary" : "outline"}>{r.kind === "base" ? t("resume.base") : t("resume.tailored")}</Badge>
              <h2 className="mt-1 font-semibold">
                <Link href={`/resumes/${r.id}`} className="after:absolute after:inset-0 after:content-[''] hover:underline">
                  {r.jobTitleBn ?? t("resume.base")}
                </Link>
              </h2>
              <p className="text-sm text-muted-foreground" lang="en">{r.title}</p>
              <p className="text-sm text-muted-foreground">{t("resume.updated", { when: formatRelativeBn(r.updatedAt) })}</p>
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}
