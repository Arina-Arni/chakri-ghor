"use client";

import { useId, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileUp, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { validateFile, type FileRule } from "@/schemas/common";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

export type DropzoneState =
  | { status: "idle" }
  | { status: "uploading"; progress: number; fileName: string }
  | { status: "processing"; fileName: string; label?: string }
  | { status: "success"; fileName: string; label?: string }
  | { status: "error"; message: string; fileName?: string };

/** Drag & drop + button. States: idle, dragging, uploading (progress), processing, success, error. */
export function FileDropzone({
  rule,
  state,
  onFile,
  onInvalid,
  disabled,
  title = t("onboarding.cvDrop"),
  typesLabel = t("onboarding.cvTypes"),
  className,
}: {
  rule: FileRule;
  state: DropzoneState;
  onFile: (file: File) => void;
  onInvalid?: (message: string) => void;
  disabled?: boolean;
  title?: string;
  typesLabel?: string;
  className?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const busy = state.status === "uploading" || state.status === "processing";

  const accept = (file: File | undefined) => {
    if (!file) return;
    const err = validateFile(file, rule);
    if (err) onInvalid?.(err);
    else onFile(file);
  };

  return (
    <div
      onDragOver={(e) => {
        if (disabled || busy) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (!disabled && !busy) accept(e.dataTransfer.files[0]);
      }}
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors duration-150",
        dragging ? "border-primary bg-primary-soft" : "border-input bg-surface",
        state.status === "error" && "border-danger/60 bg-danger-soft/30",
        state.status === "success" && "border-success/60 bg-success-soft/30",
        disabled && "opacity-60",
        className,
      )}
    >
      <div role="status" aria-live="polite" className="flex w-full flex-col items-center gap-2">
        {state.status === "idle" && (
          <>
            <FileUp className={cn("size-9", dragging ? "text-primary" : "text-muted-foreground")} aria-hidden />
            <p className="font-semibold text-ink">{title}</p>
          </>
        )}
        {state.status === "uploading" && (
          <>
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
            <p className="font-medium">{state.fileName}</p>
            <p className="text-muted-foreground">{t("onboarding.cvUploading", { pct: state.progress })}</p>
            <Progress value={state.progress} className="h-2 w-full max-w-xs" aria-label={t("onboarding.cvUploading", { pct: state.progress })} />
          </>
        )}
        {state.status === "processing" && (
          <>
            <Sparkles className="size-8 animate-pulse text-ai" aria-hidden />
            <p className="font-medium">{state.fileName}</p>
            <p className="font-medium text-ai">{state.label ?? t("onboarding.cvReading")}</p>
          </>
        )}
        {state.status === "success" && (
          <>
            <CheckCircle2 className="size-8 text-success" aria-hidden />
            <p className="font-medium">{state.fileName}</p>
            {state.label && <p className="text-success">{state.label}</p>}
          </>
        )}
        {state.status === "error" && (
          <>
            <AlertCircle className="size-8 text-danger" aria-hidden />
            {state.fileName && <p className="font-medium">{state.fileName}</p>}
            <p className="font-medium text-danger">{state.message}</p>
          </>
        )}
      </div>
      {!busy && (
        <>
          {state.status === "idle" && <p className="text-muted-foreground">{t("onboarding.cvOr")}</p>}
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            accept={rule.extensions.map((e) => `.${e}`).join(",")}
            onChange={(e) => {
              accept(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="secondary" disabled={disabled} onClick={() => inputRef.current?.click()} aria-describedby={hintId}>
            {state.status === "idle" ? t("onboarding.cvBrowse") : t("onboarding.cvTryAgain")}
          </Button>
        </>
      )}
      <p id={hintId} className="text-sm text-muted-foreground">
        {typesLabel}
      </p>
    </div>
  );
}
