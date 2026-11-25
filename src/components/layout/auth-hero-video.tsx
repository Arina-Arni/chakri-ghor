"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * At 5.2 s the clip cuts to the video tool's black end card. Playback stops a few frames earlier,
 * at END_AT, and holds that frame.
 */
export const END_AT = 4.98;
/** A frame at or past this time may already be the black end card, so jump back to END_AT. */
export const OUTRO_AT = 5.15;

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
    // Stop on the frame itself. Checking only on `timeupdate` (about 4 times a second) let a frame
    // or two of the black end card reach the screen before playback was pulled back: a blink.
    let stopped = false;
    let frameRequest = 0;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      v.pause();
      if (v.currentTime >= OUTRO_AT) v.currentTime = END_AT;
    };
    const onFrame: VideoFrameRequestCallback = (_now, frame) => {
      if (frame.mediaTime >= END_AT) stop();
      else frameRequest = v.requestVideoFrameCallback(onFrame);
    };
    // Backup for browsers without frame callbacks, and for a background tab, where no frames are
    // painted but `timeupdate` still fires.
    const onTime = () => {
      if (v.currentTime >= END_AT) stop();
    };
    v.addEventListener("timeupdate", onTime);
    if ("requestVideoFrameCallback" in v) frameRequest = v.requestVideoFrameCallback(onFrame);
    v.play().catch(() => {}); // autoplay refused: the first frame stays, which is fine
    return () => {
      if (frameRequest) v.cancelVideoFrameCallback(frameRequest);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("volumechange", silence);
    };
  }, []);

  return (
    <div className={cn("relative aspect-video w-full overflow-hidden", className)} aria-hidden>
      <video
        ref={ref}
        src="/media/login-hero.mp4"
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
