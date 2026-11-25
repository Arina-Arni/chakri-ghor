"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/** The clip ends with the video tool's logo; playback stops just before it and holds that frame. */
const END_AT = 4.98;

/**
 * Fill the box; when a wide, short screen crops top and bottom, keep the lower part (the man's
 * feet and the briefcase) rather than the sky.
 */
const FRAMING = "object-cover object-[50%_60%]";

/**
 * Login/signup hero clip: a job seeker walks in with a briefcase, puts it down and a login form
 * appears beside him. Plays once, muted, and stays on the last frame. People who prefer reduced
 * motion get that last frame as a still image instead (the clip is never played or downloaded).
 */
export function AuthHeroVideo({ className }: { className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    // The clip file has an audio track. Keep it silent whatever happens: the `muted` attribute is
    // not enough on every path (React sets it as a property, browser media controls can toggle it),
    // so mute the property, zero the volume, and put both back if anything changes them.
    const silence = () => {
      if (!v.muted) v.muted = true;
      if (v.volume !== 0) v.volume = 0;
    };
    v.defaultMuted = true;
    silence();
    v.addEventListener("volumechange", silence);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return () => v.removeEventListener("volumechange", silence);
    }
    const hold = () => {
      if (v.currentTime >= END_AT) {
        v.pause();
        v.currentTime = END_AT;
      }
    };
    v.addEventListener("timeupdate", hold);
    v.play().catch(() => {}); // autoplay refused: the first frame stays, which is fine
    return () => {
      v.removeEventListener("timeupdate", hold);
      v.removeEventListener("volumechange", silence);
    };
  }, []);

  return (
    <div className={cn("relative aspect-video w-full overflow-hidden", className)} aria-hidden>
      <video
        ref={ref}
        src={`/media/login-hero.mp4#t=0,${END_AT}`}
        muted
        playsInline
        preload="metadata"
        tabIndex={-1}
        disablePictureInPicture
        disableRemotePlayback
        className={`absolute inset-0 size-full ${FRAMING} motion-reduce:hidden`}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- a fixed still frame, no resizing needed */}
      <img src="/media/login-hero.jpg" alt="" className={`absolute inset-0 hidden size-full ${FRAMING} motion-reduce:block`} />
    </div>
  );
}
