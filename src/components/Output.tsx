import { useEffect, useRef, useState } from "react";
import {
  Maximize,
  SkipBack,
  SkipForward,
  Play,
  MonitorOff,
} from "lucide-react";
import { Board } from "./Board";
import { getAssetBlob } from "../lib/storage";
import {
  readProgram,
  subscribeProgram,
  sendPresenterCommand,
} from "../lib/broadcast";
import type { ProgramState } from "../types";
export function Output({ presenter = false }: { presenter?: boolean }) {
  const [program, setProgram] = useState<ProgramState | null>(readProgram);
  const [time, setTime] = useState(0);
  const [media, setMedia] = useState<string>();
  const [mediaKind, setMediaKind] = useState<"image" | "video">("image");
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => subscribeProgram(setProgram), []);
  useEffect(() => {
    let url: string | null = null;
    let stale = false;
    setMedia(undefined);
    if (program?.scene.mediaId)
      getAssetBlob(program.scene.mediaId)
        .then((blob) => {
          if (stale || !blob) return;
          url = URL.createObjectURL(blob);
          setMediaKind(blob.type.startsWith("video/") ? "video" : "image");
          setMedia(url);
        })
        .catch(() => {
          if (!stale) setMedia(undefined);
        });
    return () => {
      stale = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [program?.scene.mediaId, program?.revision]);
  useEffect(() => {
    let frame = 0;
    if (!program?.playing) {
      setTime(program?.time ?? 0);
      return;
    }
    const tick = () => {
      if (program) {
        const t = program.playing
          ? program.time + (Date.now() - program.startedAt) / 1000
          : program.time;
        setTime(Math.min(program.scene.duration, t));
        if (t >= program.scene.duration) {
          video.current?.pause();
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [program]);
  useEffect(() => {
    if (!video.current || !program) return;
    video.current.currentTime = program.scene.mediaTime + program.time;
    if (
      program.playing &&
      program.time + (Date.now() - program.startedAt) / 1000 <
        program.scene.duration
    )
      video.current.play().catch(() => {});
    else video.current.pause();
  }, [program, media]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "f") document.documentElement.requestFullscreen?.();
      if (presenter) {
        if (e.key === "ArrowRight") sendPresenterCommand("next");
        if (e.key === "ArrowLeft") sendPresenterCommand("previous");
        if (e.code === "Space") {
          e.preventDefault();
          sendPresenterCommand("play");
        }
        if (e.key === "b") sendPresenterCommand("blackout");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [presenter]);
  return (
    <main className={`output-page ${presenter ? "presenter" : ""}`}>
      <div
        className={`program-picture ${program?.blackout ? "blackout" : ""}`}
        key={program?.transition === "mix" ? program.revision : undefined}
      >
        {program ? (
          <Board
            scene={{
              ...program.scene,
              mediaTime:
                program.scene.mediaTime +
                (program.playing
                  ? Math.min(
                      program.scene.duration,
                      program.time + (Date.now() - program.startedAt) / 1000,
                    )
                  : program.time),
            }}
            home={program.home}
            away={program.away}
            interactive={false}
            time={time}
            mediaUrl={media}
            videoRef={mediaKind === "video" ? video : undefined}
            cleanOutput
          />
        ) : (
          <div className="output-wait">
            <span className="brand-symbol">
              B<span>O</span>
            </span>
            <h1>Ready when you are.</h1>
            <p>Open the studio and take a scene live.</p>
          </div>
        )}
      </div>
      {presenter ? (
        <div className="presenter-controls">
          <div>
            <span className="eyebrow">PROGRAMME</span>
            <h2>{program?.scene.name ?? "Waiting for studio"}</h2>
            <p>{program?.scene.notes}</p>
          </div>
          <button
            className="icon-button"
            onClick={() => sendPresenterCommand("previous")}
            aria-label="Previous scene"
          >
            <SkipBack />
          </button>
          <button
            className="button primary"
            onClick={() => sendPresenterCommand("play")}
          >
            <Play size={16} /> Play / pause
          </button>
          <button
            className="icon-button"
            onClick={() => sendPresenterCommand("next")}
            aria-label="Next scene"
          >
            <SkipForward />
          </button>
          <button
            className="icon-button"
            onClick={() => sendPresenterCommand("blackout")}
            aria-label="Blackout"
          >
            <MonitorOff />
          </button>
          <button
            className="icon-button"
            onClick={() => document.documentElement.requestFullscreen?.()}
            aria-label="Fullscreen"
          >
            <Maximize />
          </button>
        </div>
      ) : null}
    </main>
  );
}
