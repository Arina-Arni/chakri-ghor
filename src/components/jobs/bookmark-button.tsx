"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/providers/session-provider";
import { toggleBookmark } from "@/data";
import { useMutation } from "@/hooks/use-mutation";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";

/** Toggle button with aria-pressed. Guests are sent to login. */
export function BookmarkButton({
  postId,
  title,
  initial,
  onChange,
  variant = "icon",
  className,
}: {
  postId: string;
  title: string;
  initial: boolean;
  onChange?: (bookmarked: boolean) => void;
  variant?: "icon" | "full";
  className?: string;
}) {
  const [on, setOn] = useState(initial);
  const { role } = useSession();
  const router = useRouter();
  const m = useMutation((key: string) => toggleBookmark(postId, key), {
    onSuccess: (d) => {
      setOn(d.bookmarked);
      onChange?.(d.bookmarked);
      toast.success(d.bookmarked ? t("jobCard.bookmarkAdded") : t("jobCard.bookmarkRemoved"));
    },
    onError: () => setOn((v) => !v),
  });
  const click = () => {
    if (role === "guest") {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setOn((v) => !v); // optimistic
    void m.run();
  };
  const Icon = on ? BookmarkCheck : Bookmark;
  return (
    <Button
      type="button"
      variant={variant === "icon" ? "ghost" : "secondary"}
      size={variant === "icon" ? "icon" : "default"}
      aria-pressed={on}
      aria-label={variant === "icon" ? t("jobCard.bookmarkAdd", { title }) : undefined}
      disabled={m.pending}
      onClick={click}
      className={cn("relative z-10", on && "text-primary", className)}
    >
      <Icon className={cn(on && "fill-primary-soft")} aria-hidden />
      {variant === "full" && (on ? t("jobCard.bookmarked") : t("jobCard.bookmark"))}
    </Button>
  );
}
