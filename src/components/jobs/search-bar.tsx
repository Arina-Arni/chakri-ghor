"use client";

import { useEffect, useId, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { messages, t } from "@/i18n";
import { cn } from "@/lib/utils";

export type SearchMode = "normal" | "ai";

/** Search with a সাধারণ / ✦ AI mode toggle. In AI mode the placeholder rotates through examples. */
export function SearchBar({
  mode,
  onModeChange,
  initialValue = "",
  onSubmit,
  showExamples = false,
  tone = "default",
  busy = false,
  className,
}: {
  mode: SearchMode;
  onModeChange: (m: SearchMode) => void;
  initialValue?: string;
  onSubmit: (text: string, mode: SearchMode) => void;
  showExamples?: boolean;
  tone?: "default" | "hero";
  busy?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(initialValue);
  const [tick, setTick] = useState(0);
  const id = useId();
  const examples = messages.search.examples;

  useEffect(() => {
    const timer = setTimeout(() => setText(initialValue), 0);
    return () => clearTimeout(timer);
  }, [initialValue]);

  useEffect(() => {
    if (mode !== "ai") return;
    const iv = setInterval(() => setTick((n) => n + 1), 3500);
    return () => clearInterval(iv);
  }, [mode]);

  const placeholder = mode === "ai" ? `${examples[tick % examples.length]}…` : t("search.placeholderNormal");
  const hero = tone === "hero";

  return (
    <div className={cn("space-y-3", className)}>
      <Segmented
        label={t("search.modeLabel")}
        value={mode}
        onChange={onModeChange}
        tone={hero ? "hero" : "default"}
        className={cn(hero && "bg-white/10")}
        options={[
          { value: "normal", label: t("search.modeNormal") },
          {
            value: "ai",
            label: (
              <span className={cn("inline-flex items-center gap-1", mode === "ai" ? "text-ai" : "")}>
                <Sparkles className="size-4" aria-hidden />
                AI সার্চ
              </span>
            ),
          },
        ]}
      />
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(text.trim(), mode);
        }}
        className={cn("flex gap-2 rounded-xl p-1.5", hero ? "bg-white shadow-raised" : "border border-input bg-surface")}
      >
        <label htmlFor={id} className="sr-only">
          {t("search.label")}
        </label>
        <div className="relative flex-1">
          {mode === "ai" ? (
            <Sparkles className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ai" aria-hidden />
          ) : (
            <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          )}
          <input
            id={id}
            type="search"
            enterKeyHint="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            className="h-12 w-full rounded-lg bg-transparent pr-2 pl-10 text-base text-ink outline-none placeholder:text-muted-foreground"
          />
        </div>
        <Button type="submit" size="lg" loading={busy} className={cn(mode === "ai" && "bg-ai hover:bg-[#5b21b6]")}>
          <span className="hidden sm:inline">{t("search.submit")}</span>
          <Search className="sm:hidden" aria-hidden />
          <span className="sr-only sm:hidden">{t("search.submit")}</span>
        </Button>
      </form>
      {showExamples && (
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("text-sm", hero ? "text-white/80" : "text-muted-foreground")}>{t("search.tryExample")}</span>
          {examples.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => {
                setText(ex);
                onModeChange("ai");
                onSubmit(ex, "ai");
              }}
              className={cn(
                "min-h-9 rounded-full border px-3 py-1 text-left text-sm transition-colors",
                hero ? "border-white/25 bg-white/10 text-white hover:bg-white/20" : "border-ai/25 bg-ai-soft text-ai hover:bg-ai/15",
              )}
            >
              ✦ {ex}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
