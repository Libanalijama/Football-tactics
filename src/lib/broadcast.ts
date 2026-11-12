import type { ProgramState } from "../types";
const KEY = "bang-on-program-v1";
const channel =
  typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("bang-on-studio-v1")
    : null;
export function readProgram(): ProgramState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as ProgramState;
    return p?.scene?.players && p.home && p.away && Number.isFinite(p.revision)
      ? p
      : null;
  } catch {
    return null;
  }
}
export function publishProgram(state: ProgramState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
  channel?.postMessage({ type: "program", state });
}
export function subscribeProgram(
  fn: (state: ProgramState) => void,
): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) {
      const p = readProgram();
      if (p) fn(p);
    }
  };
  const onMessage = (event: MessageEvent) => {
    if (event.data?.type === "program") fn(event.data.state);
  };
  window.addEventListener("storage", onStorage);
  channel?.addEventListener("message", onMessage);
  return () => {
    window.removeEventListener("storage", onStorage);
    channel?.removeEventListener("message", onMessage);
  };
}
export function sendPresenterCommand(
  command: "next" | "previous" | "play" | "blackout",
): void {
  channel?.postMessage({ type: "command", command });
}
export function subscribeCommands(fn: (command: string) => void): () => void {
  const onMessage = (event: MessageEvent) => {
    if (event.data?.type === "command") fn(event.data.command);
  };
  channel?.addEventListener("message", onMessage);
  return () => channel?.removeEventListener("message", onMessage);
}
