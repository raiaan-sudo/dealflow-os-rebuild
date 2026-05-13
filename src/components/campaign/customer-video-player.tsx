"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

type CustomerVideoPlayerProps = {
  src?: string | null;
  title?: string | null;
  className?: string;
  videoClassName?: string;
  controlsList?: "nodownload noplaybackrate" | string;
  disablePictureInPicture?: boolean;
  playsInline?: boolean;
};

function formatTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0:00";
  }

  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function CustomerVideoPlayer({
  src,
  title = "Campaign video preview",
  className,
  videoClassName,
  controlsList = "nodownload noplaybackrate",
  disablePictureInPicture = true,
  playsInline = true,
}: CustomerVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [src]);

  const togglePlayback = async () => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (video.paused) {
      await video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.muted = !video.muted;
    setMuted(video.muted);
  };

  const enterFullscreen = async () => {
    const element = frameRef.current;

    if (!element || !document.fullscreenEnabled) {
      return;
    }

    await element.requestFullscreen().catch(() => undefined);
  };

  const progress = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <div
      ref={frameRef}
      className={cn("group relative overflow-hidden rounded-[14px] border border-white/10 bg-black", className)}
      onContextMenu={(event) => event.preventDefault()}
    >
      <video
        ref={videoRef}
        aria-label={title ?? "Campaign video preview"}
        className={cn("aspect-[9/16] w-full bg-black object-contain", videoClassName)}
        controls={false}
        controlsList={controlsList}
        disablePictureInPicture={disablePictureInPicture}
        muted={muted}
        playsInline={playsInline}
        preload="metadata"
        src={src ?? undefined}
        onClick={() => void togglePlayback()}
        onContextMenu={(event) => event.preventDefault()}
        onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/86 via-black/38 to-transparent px-3 pb-3 pt-10 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
        <div className="mb-3 h-1 overflow-hidden rounded-full bg-white/18" aria-hidden="true">
          <div className="h-full rounded-full bg-white" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="grid size-9 place-items-center rounded-full border border-white/16 bg-white/12 text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
              onClick={() => void togglePlayback()}
              aria-label={playing ? "Pause video preview" : "Play video preview"}
            >
              {playing ? <Pause aria-hidden="true" size={17} /> : <Play aria-hidden="true" size={17} />}
            </button>
            <button
              type="button"
              className="grid size-9 place-items-center rounded-full border border-white/16 bg-white/12 text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
              onClick={toggleMute}
              aria-label={muted ? "Unmute video preview" : "Mute video preview"}
            >
              {muted ? <VolumeX aria-hidden="true" size={17} /> : <Volume2 aria-hidden="true" size={17} />}
            </button>
            <span className="text-xs font-semibold text-white/80">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
          <button
            type="button"
            className="grid size-9 place-items-center rounded-full border border-white/16 bg-white/12 text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/40"
            onClick={() => void enterFullscreen()}
            aria-label="Open video preview fullscreen"
          >
            <Maximize2 aria-hidden="true" size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
