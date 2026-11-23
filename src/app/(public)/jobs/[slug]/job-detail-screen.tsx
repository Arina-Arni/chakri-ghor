"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  BadgeCheck,
  CalendarClock,
  CalendarPlus,
  ExternalLink,
  FileSearch,
  FileText,
  Flag,
  Info,
  KanbanSquare,
  Share2,
  Sparkles,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { BookmarkButton } from "@/components/jobs/bookmark-button";
import { CountdownBadge } from "@/components/jobs/countdown-badge";
import { EligibilityPanel } from "@/components/jobs/eligibility-panel";
import { JobCard } from "@/components/jobs/job-card";
import { OrgAvatar } from "@/components/jobs/org-avatar";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { Notice } from "@/components/feedback/notice";
import { DetailSkeleton } from "@/components/feedback/skeletons";
import { useSession } from "@/components/providers/session-provider";
import { Breadcrumbs } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Textarea } from "@/components/ui/textarea";
import { createApplication, getCircular, recordApplyClick, reportCircularError, tailorResume } from "@/data";
import { formatDateTimeBn, formatMoneyBn, formatNumberBn, formatSalaryRangeBn, toBnDigits } from "@/domain/bn";
import { displayStatus } from "@/domain/status";
import { useServerNow } from "@/domain/countdown/use-server-now";
import { useData } from "@/hooks/use-data";
import { useMutation } from "@/hooks/use-mutation";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { Circular, CircularPost } from "@/types";

function Fact({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-surface p-3">
      <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Icon className="size-4" aria-hidden />
        {label}
      </dt>
      <dd className="mt-1 font-semibold text-ink tabular-nums">{value}</dd>
    </div>
  );
}

function KeyFacts({ c, post }: { c: Circular; post: CircularPost }) {
  const age =
    post.ageMin != null && post.ageMax != null
      ? t("detail.ageRange", { min: post.ageMin, max: post.ageMax })
      : post.ageMax != null
        ? t("detail.ageMaxOnly", { max: post.ageMax })
        : t("common.notMentioned");
  return (
    <dl className="grid grid-cols-2 gap-3">
      <Fact icon={Users} label={t("detail.vacancies")} value={formatNumberBn(post.vacancies)} />
      <Fact icon={CalendarClock} label={t("detail.ageLimit")} value={age} />
      <Fact icon={CalendarPlus} label={t("detail.applyStart")} value={formatDateTimeBn(c.startAt)} />
      <Fact icon={CalendarClock} label={t("detail.applyEnd")} value={formatDateTimeBn(c.endAt)} />
    </dl>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-xl border bg-surface p-4 shadow-card md:p-5">
      <h2 id={id} className="mb-3 text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function JobDetailScreen({ slug }: { slug: string }) {
  const q = useData(() => getCircular(slug), [slug]);
  const [postId, setPostId] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [appliedPrompt, setAppliedPrompt] = useState(false);
  const { role } = useSession();
  const router = useRouter();
  const now = useServerNow(60_000);

  const track = useMutation((k: string, pid: string, status: "saved" | "applied") => createApplication(pid, k, status), {
    onSuccess: (a) => {
      setAppliedPrompt(false);
      toast.success(t("detail.addedToTracker"), { action: { label: t("detail.viewTracker"), onClick: () => router.push(`/applications?open=${a.id}`) } });
      q.refresh();
    },
  });
  const tailor = useMutation((k: string, pid: string) => tailorResume("res_base", pid, k), {
    onSuccess: (r) => router.push(`/resumes/${r.resume.id}`),
  });
  const report = useMutation((k: string, id: string, msg: string) => reportCircularError(id, msg, k), {
    successMessage: t("detail.reportSent"),
    onSuccess: () => {
      setReportOpen(false);
      setReportText("");
    },
  });

  if (q.status === "loading") return <div className="container-page py-8"><DetailSkeleton /></div>;
  if (q.status === "error") {
    return (
      <div className="container-page py-10">
        {q.error.code === "NOT_FOUND" ? (
          <EmptyState icon={FileSearch} title={t("states.notFoundTitle")} body={t("states.notFoundBody")} action={<Button asChild><Link href="/jobs">{t("nav.jobs")}</Link></Button>} />
        ) : (
          <ErrorState error={q.error} onRetry={q.reload} />
        )}
      </div>
    );
  }

  const { circular: c, similar, bookmarkedPostIds, trackedPosts } = q.data;
  const post = c.posts.find((p) => p.id === postId) ?? c.posts[0];
  const status = now == null ? "open" : displayStatus(c, now);
  const closed = status === "closed";
  const upcoming = status === "upcoming";
  const salary = formatSalaryRangeBn(post.salaryMin, post.salaryMax) ?? post.salaryText ?? t("common.notMentioned");
  const tracked = trackedPosts[post.id];
  const platform = t(`enums.applyPlatform.${c.applyPlatform}`);
  const requireLogin = () => router.push(`/login?next=${encodeURIComponent(`/jobs/${slug}`)}`);

  const applyLink = (short = false) => (
    <Button asChild={!closed && !upcoming} size={short ? "default" : "lg"} disabled={closed || upcoming} className="w-full">
      {closed || upcoming ? (
        <span className="truncate">{closed ? t("jobCard.closed") : short ? t("detail.apply") : t("detail.applyOn", { platform })}</span>
      ) : (
        <a
          href={c.applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            void recordApplyClick(c.id);
            if (role !== "guest" && !tracked) setTimeout(() => setAppliedPrompt(true), 800);
          }}
        >
          {short ? t("detail.apply") : t("detail.applyOn", { platform })}
          <ExternalLink aria-hidden />
          <span className="sr-only">{t("detail.opensNewTab")}</span>
        </a>
      )}
    </Button>
  );

  const secondaryActions = (
    <div className="grid gap-2">
      {tracked ? (
        <Button asChild variant="secondary">
          <Link href={`/applications?open=${tracked}`}>
            <KanbanSquare aria-hidden />
            {t("detail.viewTracker")}
          </Link>
        </Button>
      ) : (
        <Button variant="secondary" loading={track.pending} onClick={() => (role === "guest" ? requireLogin() : void track.run(post.id, "saved"))}>
          <KanbanSquare aria-hidden />
          {t("detail.addToTracker")}
        </Button>
      )}
      <Button variant="secondary" loading={tailor.pending} onClick={() => (role === "guest" ? requireLogin() : void tailor.run(post.id))}>
        <Sparkles aria-hidden />
        {tailor.pending ? t("states.aiWorking") : t("detail.buildResume")}
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="ghost"
          onClick={async () => {
            const url = window.location.href;
            if (navigator.share) await navigator.share({ title: c.titleBn, url }).catch(() => {});
            else {
              await navigator.clipboard?.writeText(url);
              toast.success(t("detail.linkCopied"));
            }
          }}
        >
          <Share2 aria-hidden />
          {t("common.share")}
        </Button>
        <Button variant="ghost" onClick={() => setReportOpen(true)}>
          <Flag aria-hidden />
          <span className="truncate">{t("detail.reportError")}</span>
        </Button>
      </div>
    </div>
  );

  return (
    <div className="container-page py-6 md:py-8">
      <title>{`${c.titleBn} · ${t("brand.name")}`}</title>
      <Breadcrumbs className="mb-4" items={[{ href: "/", label: t("common.home") }, { href: "/jobs", label: t("nav.jobs") }, { label: post.titleBn }]} />

      <div className="space-y-3">
        {c.originalEndAt && !closed && (
          <Notice tone="info" title={t("detail.extendedBanner", { date: formatDateTimeBn(c.endAt) })}>
            আগের শেষ তারিখ: <s>{formatDateTimeBn(c.originalEndAt)}</s>
          </Notice>
        )}
        {closed && <Notice tone="danger" title={t("detail.closedBanner")}>{formatDateTimeBn(c.endAt)}</Notice>}
        {upcoming && <Notice tone="info" title={t("detail.upcomingBanner", { date: formatDateTimeBn(c.startAt) })} />}
        {appliedPrompt && (
          <Notice
            tone="success"
            live
            title={t("detail.appliedPrompt")}
            action={
              <div className="flex gap-2">
                <Button size="sm" loading={track.pending} onClick={() => void track.run(post.id, "applied")}>
                  {t("detail.appliedPromptYes")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAppliedPrompt(false)}>
                  {t("detail.appliedPromptNo")}
                </Button>
              </div>
            }
          />
        )}
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-5">
          <header className="space-y-3">
            <div className="flex items-center gap-3">
              <OrgAvatar shortName={c.organization.shortName} seed={c.organization.slug} size="lg" />
              <div>
                <Link href={`/organizations/${c.organization.slug}`} className="font-medium text-ink underline-offset-4 hover:underline">
                  {c.organization.nameBn}
                </Link>
                {c.organization.verified && (
                  <span className="ml-1 inline-flex items-center gap-0.5 align-middle text-sm text-primary">
                    <BadgeCheck className="size-4" aria-hidden />
                    {t("jobCard.verified")}
                  </span>
                )}
                <p className="text-sm text-muted-foreground">{t("detail.noticeNo", { no: c.noticeNo })}</p>
              </div>
            </div>
            <h1 className={cn("text-2xl leading-snug font-bold md:text-3xl", closed && "text-muted-foreground")}>{c.titleBn}</h1>
            <ul className="flex flex-wrap gap-1.5" aria-label="ট্যাগ">
              <li><Badge variant="primary">{t(`enums.sector.${c.sector}`)}</Badge></li>
              <li><Badge variant="outline">{platform}</Badge></li>
              <li><Badge variant="outline">{t(`enums.jobType.${c.jobType}`)}</Badge></li>
              {c.aiTags.map((tag) => (
                <li key={tag}>
                  <Badge variant="ai"><Sparkles aria-hidden />{tag}</Badge>
                </li>
              ))}
            </ul>
          </header>

          {c.posts.length > 1 && (
            <div className="space-y-2">
              <p id="post-picker" className="font-medium">{t("detail.pickPost")} ({toBnDigits(c.posts.length)})</p>
              <Segmented
                label={t("detail.pickPost")}
                value={post.id}
                onChange={(v) => setPostId(v)}
                className="w-full"
                options={c.posts.map((p) => ({ value: p.id, label: `${p.titleBn} (${toBnDigits(p.vacancies)})` }))}
              />
            </div>
          )}

          <div className="lg:hidden">
            <KeyFacts c={c} post={post} />
          </div>
          <div className="lg:hidden">
            <EligibilityPanel key={post.id} postId={post.id} />
          </div>

          <Section id="sec-desc" title={t("detail.sectionDescription")}>
            <p className="text-ink">{c.descriptionBn}</p>
            <dl className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <div><dt className="text-sm text-muted-foreground">{t("detail.salary")}</dt><dd className="font-medium">{salary}</dd></div>
              <div><dt className="text-sm text-muted-foreground">{t("detail.grade")}</dt><dd className="font-medium">{post.grade ? `${post.grade}তম` : t("common.notMentioned")}</dd></div>
              <div><dt className="text-sm text-muted-foreground">{t("detail.fee")}</dt><dd className="font-medium">{c.applicationFee ? formatMoneyBn(c.applicationFee) : t("detail.noFee")}</dd></div>
              <div><dt className="text-sm text-muted-foreground">{t("admin.form.applyPlatform")}</dt><dd className="font-medium">{platform}</dd></div>
            </dl>
          </Section>

          <Section id="sec-elig" title={t("detail.sectionEligibility")}>
            <dl className="grid gap-3 sm:grid-cols-2">
              <div><dt className="text-sm text-muted-foreground">{t("detail.minEducation")}</dt><dd className="font-medium">{t(`enums.education.${post.minEducation}`)}</dd></div>
              <div><dt className="text-sm text-muted-foreground">{t("detail.experience")}</dt><dd className="font-medium">{post.experienceYears ? t("detail.experienceYears", { n: post.experienceYears }) : t("detail.noExperience")}</dd></div>
              <div><dt className="text-sm text-muted-foreground">{t("detail.gender")}</dt><dd className="font-medium">{t(`enums.genderRule.${post.gender}`)}</dd></div>
              <div><dt className="text-sm text-muted-foreground">{t("detail.subjects")}</dt><dd className="font-medium">{post.subjects.length ? post.subjects.join(", ") : t("common.notMentioned")}</dd></div>
              <div className="sm:col-span-2">
                <dt className="text-sm text-muted-foreground">{t("detail.districts")}</dt>
                <dd className="font-medium">{post.eligibleDistrictIds || post.eligibleDivisionIds ? `${toBnDigits((post.eligibleDistrictIds?.length ?? 0) + (post.eligibleDivisionIds?.length ?? 0))}টি জেলা/বিভাগ — নিচে যোগ্যতা প্যানেলে আপনার জেলা মিলিয়ে দেখুন` : t("detail.allDistricts")}</dd>
              </div>
            </dl>
            {post.ageRelaxations.length > 0 && (
              <div className="mt-4">
                <h3 className="font-semibold">{t("detail.ageRelaxation")}</h3>
                <ul className="mt-1 list-disc pl-5">
                  {post.ageRelaxations.map((r) => <li key={r.categoryBn}>{t("detail.ageRelaxationItem", { category: r.categoryBn, n: r.extraYears })}</li>)}
                </ul>
              </div>
            )}
            {post.otherRequirements.length > 0 && (
              <div className="mt-4">
                <h3 className="font-semibold">{t("detail.requirements")}</h3>
                <ul className="mt-1 list-disc pl-5">{post.otherRequirements.map((r) => <li key={r}>{r}</li>)}</ul>
              </div>
            )}
          </Section>

          <Section id="sec-how" title={t("detail.sectionHowToApply")}>
            <ol className="list-decimal space-y-2 pl-5">{c.howToApplyBn.map((s) => <li key={s}>{s}</li>)}</ol>
          </Section>

          <Section id="sec-notice" title={t("detail.sectionNotice")}>
            <p>{t("detail.noticeNo", { no: c.noticeNo })}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {c.noticePdfUrl && (
                <Button asChild variant="secondary">
                  <a href={c.noticePdfUrl} target="_blank" rel="noopener noreferrer">
                    <FileText aria-hidden />
                    {t("detail.viewPdf")}
                    <span className="sr-only">{t("detail.opensNewTab")}</span>
                  </a>
                </Button>
              )}
              <Button asChild variant="ghost">
                <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer">
                  {t("detail.source")}
                  <ExternalLink aria-hidden />
                  <span className="sr-only">{t("detail.opensNewTab")}</span>
                </a>
              </Button>
            </div>
          </Section>

          {similar.length > 0 && (
            <section aria-labelledby="sec-similar">
              <h2 id="sec-similar" className="mb-3 text-xl font-semibold">{t("detail.similar")}</h2>
              <ul className="grid gap-4 md:grid-cols-2">
                {similar.map((j) => <li key={j.id}><JobCard job={j} variant="compact" /></li>)}
              </ul>
            </section>
          )}

          <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("footer.disclaimer")}
          </p>
        </div>

        <aside className="hidden lg:block" aria-label={t("detail.keyFacts")}>
          <div className="sticky top-20 space-y-4">
            <div className="space-y-4 rounded-xl border bg-surface p-4 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">{t("detail.deadlineIn")}</span>
                <CountdownBadge endAt={c.endAt} startAt={c.startAt} size="lg" />
              </div>
              <KeyFacts c={c} post={post} />
              {applyLink()}
              <BookmarkButton key={post.id} postId={post.id} title={post.titleBn} initial={bookmarkedPostIds.includes(post.id)} variant="full" className="w-full" />
              {secondaryActions}
            </div>
            <EligibilityPanel key={post.id} postId={post.id} />
          </div>
        </aside>
      </div>

      <div className="lg:hidden">
        <div className="mt-6">{secondaryActions}</div>
        <div className="h-24" aria-hidden />
        <div className={cn("fixed inset-x-0 z-30", role === "guest" ? "bottom-0" : "bottom-16")}><div className=" border-t bg-surface/95 px-4 py-3 shadow-raised backdrop-blur" role="region" aria-label={t("detail.apply")}>
          <div className="mx-auto flex max-w-xl items-center gap-2">
            <CountdownBadge endAt={c.endAt} startAt={c.startAt} />
            <div className="min-w-0 flex-1">{applyLink(true)}</div>
            <BookmarkButton key={post.id} postId={post.id} title={post.titleBn} initial={bookmarkedPostIds.includes(post.id)} />
          </div>
        </div></div>
      </div>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (reportText.trim().length >= 5) void report.run(c.id, reportText.trim());
            }}
          >
            <DialogHeader>
              <DialogTitle>{t("detail.reportTitle")}</DialogTitle>
              <DialogDescription>{c.titleBn}</DialogDescription>
            </DialogHeader>
            <Field id="report-msg" label={t("detail.reportBody")} required error={reportText && reportText.trim().length < 5 ? t("validation.tooShort", { n: 5 }) : undefined}>
              <Textarea value={reportText} onChange={(e) => setReportText(e.target.value)} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReportOpen(false)}>{t("common.cancel")}</Button>
              <Button type="submit" loading={report.pending}>{t("common.confirm")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
