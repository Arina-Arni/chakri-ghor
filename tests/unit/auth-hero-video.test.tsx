import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthHeroVideo, END_AT, OUTRO_AT } from "@/components/layout/auth-hero-video";

// jsdom has no media playback, frame callbacks or matchMedia; stand in for them.
let frames: VideoFrameRequestCallback[] = [];
let reducedMotion = false;
const play = vi.fn(() => Promise.resolve());
const pause = vi.fn();

beforeEach(() => {
  frames = [];
  reducedMotion = false;
  play.mockClear();
  pause.mockClear();
  HTMLMediaElement.prototype.play = play;
  HTMLMediaElement.prototype.pause = pause;
  HTMLVideoElement.prototype.requestVideoFrameCallback = (cb) => frames.push(cb);
  HTMLVideoElement.prototype.cancelVideoFrameCallback = () => {};
  window.matchMedia = ((query: string) => ({ matches: reducedMotion && query.includes("reduce") })) as typeof window.matchMedia;
});
afterEach(cleanup);

/** Render the clip with a controllable clock; returns the video and every time it was seeked to. */
function renderClip() {
  const { container } = render(<AuthHeroVideo />);
  const video = container.querySelector("video")!;
  let t = 0;
  const seeks: number[] = [];
  Object.defineProperty(video, "currentTime", {
    configurable: true,
    get: () => t,
    set: (x: number) => {
      t = x;
      seeks.push(x);
    },
  });
  const presentFrame = (mediaTime: number) => {
    t = mediaTime;
    frames.at(-1)!(0, { mediaTime } as VideoFrameCallbackMetadata);
  };
  const timeUpdate = (time: number) => {
    t = time;
    video.dispatchEvent(new Event("timeupdate"));
  };
  return { video, seeks, presentFrame, timeUpdate };
}

describe("AuthHeroVideo", () => {
  it("stops on the first frame at the stop point and never seeks, so no end-card frame is shown", () => {
    const clip = renderClip();
    expect(play).toHaveBeenCalledOnce();
    clip.presentFrame(1);
    clip.presentFrame(END_AT - 0.04);
    expect(pause).not.toHaveBeenCalled();
    clip.presentFrame(END_AT + 0.01);
    expect(pause).toHaveBeenCalledOnce();
    clip.timeUpdate(END_AT + 0.01);
    expect(pause).toHaveBeenCalledOnce();
    expect(clip.seeks).toEqual([]);
  });

  it("pulls back to the stop point when playback ran into the end card unseen (background tab)", () => {
    const clip = renderClip();
    clip.timeUpdate(OUTRO_AT + 0.1);
    expect(pause).toHaveBeenCalledOnce();
    expect(clip.seeks).toEqual([END_AT]);
  });

  it("never plays for people who prefer reduced motion", () => {
    reducedMotion = true;
    renderClip();
    expect(play).not.toHaveBeenCalled();
  });

  it("stops before the black end card starts at 5.2 s", () => {
    expect(END_AT).toBeLessThan(OUTRO_AT);
    expect(OUTRO_AT).toBeLessThan(5.2);
  });
});
