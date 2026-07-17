import { Channel, invoke } from "@tauri-apps/api/core";
import type { PtyEvent, PtyStarted, PtyStatus } from "../types/terminal";

export type StartTerminalOptions = {
  rows: number;
  cols: number;
  cwd: string;
  onOutput: (data: ArrayBuffer) => void;
  onEvent: (event: PtyEvent) => void;
};

export async function startTerminal(options: StartTerminalOptions): Promise<PtyStarted> {
  const onOutput = new Channel<ArrayBuffer>();
  onOutput.onmessage = options.onOutput;
  const onEvent = new Channel<PtyEvent>();
  onEvent.onmessage = options.onEvent;

  return invoke<PtyStarted>("start_pty", {
    request: { rows: options.rows, cols: options.cols, cwd: options.cwd },
    onOutput,
    onEvent,
  });
}

export function writeTerminal(id: string, data: Uint8Array): Promise<void> {
  return invoke("write_to_pty", { id, data: Array.from(data) });
}

export function resizeTerminal(id: string, rows: number, cols: number): Promise<void> {
  return invoke("resize_pty", { id, rows, cols });
}

export function getTerminalStatus(id: string): Promise<PtyStatus> {
  return invoke<PtyStatus>("get_pty_status", { id });
}

export function getTerminalStatuses(ids: string[]): Promise<Record<string, PtyStatus>> {
  return invoke<Record<string, PtyStatus>>("get_pty_statuses", { ids });
}

export function stopTerminal(id: string): Promise<void> {
  return invoke("stop_pty", { id });
}
