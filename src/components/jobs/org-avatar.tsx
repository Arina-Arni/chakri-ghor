import { cn } from "@/lib/utils";

const PALETTE = [
  "bg-[#e3ecf5] text-[#2c4763]",
  "bg-[#dbeafe] text-[#1e40af]",
  "bg-[#fef3c7] text-[#92400e]",
  "bg-[#ede9fe] text-[#5b21b6]",
  "bg-[#fce7f3] text-[#9d174d]",
  "bg-[#e0f2fe] text-[#075985]",
];

function hash(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** Initials avatar for organizations — never a logo or emblem (spec §2.1). */
export function OrgAvatar({ shortName, seed, size = "md", className }: { shortName: string; seed: string; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-bold tracking-tight",
        PALETTE[hash(seed) % PALETTE.length],
        size === "sm" && "size-9 text-[11px]",
        size === "md" && "size-11 text-xs",
        size === "lg" && "size-16 text-base",
        className,
      )}
      lang="en"
    >
      {shortName.slice(0, 4)}
    </span>
  );
}
